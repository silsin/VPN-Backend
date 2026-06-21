import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import * as net from 'net';
import * as tls from 'tls';
import * as https from 'https';
import * as http from 'http';
import { V2RayConfig, V2RayConfigType } from '../v2ray-configs/entities/v2ray-config.entity';
import { TelegramReportService } from './telegram-report.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed connection parameters for any protocol */
export interface ConfigEndpoint {
  host: string;
  port: number;
  /** TLS / reality / none */
  tls: boolean;
  /** SNI override (may differ from host when CDN is used) */
  sni: string;
  /** ws | grpc | tcp | h2 | kcp | quic */
  transport: string;
  /** WebSocket path */
  wsPath?: string;
  /** gRPC serviceName */
  grpcService?: string;
  /** HTTP/2 host header */
  h2Host?: string;
  /** Raw scheme prefix: vmess / vless / trojan / ss / etc. */
  scheme: string;
}

export interface NodeResult {
  node: string;
  reachable: boolean;
  latencyMs: number | null;
  error?: string;
}

export interface CheckResult {
  id: string;
  name: string;
  type: V2RayConfigType;
  host: string | null;
  port: number | null;
  transport: string | null;
  reachable: boolean;
  localLatencyMs: number | null;
  remoteNodes: NodeResult[];
  consecutiveFailures?: number;
  checkMethod?: string;
  error?: string;
}

export interface BulkCheckResult {
  total: number;
  working: number;
  failed: number;
  pendingRemoval: number;
  removed: number;
  results: CheckResult[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ConfigCheckerService {
  private readonly logger = new Logger(ConfigCheckerService.name);

  private readonly TCP_TIMEOUT_MS = 6000;
  private readonly TLS_TIMEOUT_MS = 8000;
  private readonly WS_TIMEOUT_MS = 8000;
  private readonly CHECK_HOST_MAX_NODES = 3;
  private readonly CHECK_HOST_POLL_TIMEOUT_MS = 12_000;
  private readonly CHECK_HOST_POLL_INTERVAL_MS = 1_500;
  private readonly FAILURE_THRESHOLD = 5;

  /**
   * In-memory consecutive-failure counters.
   * Resets on server restart — intentional grace period.
   */
  private readonly failureCounts = new Map<string, number>();

  constructor(
    @InjectRepository(V2RayConfig)
    private readonly configsRepo: Repository<V2RayConfig>,
    private readonly telegram: TelegramReportService,
  ) {}

  // ---------------------------------------------------------------------------
  // Scheduled job — every 10 minutes
  // ---------------------------------------------------------------------------

  @Cron('0 */1 * * * *', { name: 'config-health-check' })
  async scheduledCheck(): Promise<void> {
    this.logger.log('⏱  Scheduled config health check triggered');
    await this.checkAll(true);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async checkAll(removeUnreachable = false): Promise<BulkCheckResult> {
    const configs = await this.configsRepo.find();
    this.logger.log(`Starting health check for ${configs.length} config(s)`);

    const results = await Promise.all(configs.map((c) => this.checkConfig(c)));

    let removed = 0;
    let pendingRemoval = 0;

    for (const r of results) {
      if (r.reachable) {
        if (this.failureCounts.has(r.id)) {
          this.logger.log(`Config [${r.name}] recovered — resetting failure count`);
          this.failureCounts.delete(r.id);
        }
      } else {
        const prev = this.failureCounts.get(r.id) ?? 0;
        const current = prev + 1;
        this.failureCounts.set(r.id, current);
        r.consecutiveFailures = current;

        this.logger.warn(
          `Config [${r.name}] ${r.host}:${r.port} failed (${current}/${this.FAILURE_THRESHOLD})`,
        );

        if (removeUnreachable && current >= this.FAILURE_THRESHOLD) {
          try {
            await this.configsRepo.delete(r.id);
            this.failureCounts.delete(r.id);
            this.logger.warn(`🗑  Removed [${r.name}] after ${current} consecutive failures`);
            removed++;
          } catch (err) {
            this.logger.error(`Failed to remove config ${r.id}: ${err.message}`);
          }
        } else if (current < this.FAILURE_THRESHOLD) {
          pendingRemoval++;
        }
      }
    }

    // Clean up stale counters
    const existingIds = new Set(configs.map((c) => c.id));
    for (const id of this.failureCounts.keys()) {
      if (!existingIds.has(id)) this.failureCounts.delete(id);
    }

    const summary: BulkCheckResult = {
      total: configs.length,
      working: results.filter((r) => r.reachable).length,
      failed: results.filter((r) => !r.reachable).length,
      pendingRemoval,
      removed,
      results,
    };

    this.logger.log(
      `Done — working: ${summary.working}, failed: ${summary.failed}, ` +
      `pending: ${pendingRemoval}, removed: ${summary.removed}`,
    );

    this.telegram.sendCheckReport(summary).catch((err) =>
      this.logger.error(`Telegram report failed: ${err.message}`),
    );

    return summary;
  }

  async checkById(id: string): Promise<CheckResult> {
    const config = await this.configsRepo.findOne({ where: { id } });
    if (!config) {
      return {
        id, name: 'unknown', type: null, host: null, port: null, transport: null,
        reachable: false, localLatencyMs: null, remoteNodes: [], error: 'Config not found',
      };
    }
    return this.checkConfig(config);
  }

  // ---------------------------------------------------------------------------
  // Core check — protocol-aware probe + check-host.net in parallel
  // ---------------------------------------------------------------------------

  async checkConfig(config: V2RayConfig): Promise<CheckResult> {
    let endpoint: ConfigEndpoint | null = null;
    let parseError: string | undefined;

    try {
      endpoint = this.parseEndpoint(config);
    } catch (err) {
      parseError = `Parse error: ${err.message}`;
    }

    if (!endpoint) {
      return {
        id: config.id, name: config.name, type: config.type,
        host: null, port: null, transport: null,
        reachable: false, localLatencyMs: null, remoteNodes: [],
        error: parseError,
      };
    }

    // Run protocol-aware local probe + check-host.net TCP in parallel.
    // check-host.net only tests TCP reachability of the host:port — it is
    // still useful for CDN configs where direct TCP from our server is blocked.
    const [localResult, remoteNodes] = await Promise.all([
      this.protocolProbe(endpoint),
      this.checkHostNetTcp(endpoint.host, endpoint.port),
    ]);

    const remoteReachable = remoteNodes.some((n) => n.reachable);
    const reachable = localResult.reachable || remoteReachable;

    let error: string | undefined;
    if (!reachable) {
      const parts: string[] = [];
      if (localResult.error) parts.push(`local(${endpoint.transport}): ${localResult.error}`);
      remoteNodes.filter((n) => n.error).forEach((n) =>
        parts.push(`${n.node.split('.')[0]}: ${n.error}`),
      );
      error = parts.join(' | ') || 'All checks failed';
    }

    return {
      id: config.id,
      name: config.name,
      type: config.type,
      host: endpoint.host,
      port: endpoint.port,
      transport: endpoint.transport,
      reachable,
      localLatencyMs: localResult.latencyMs,
      remoteNodes,
      checkMethod: localResult.method,
      error,
    };
  }

  // ---------------------------------------------------------------------------
  // Protocol-aware local probe
  // Routes to the correct method based on transport type.
  // ---------------------------------------------------------------------------

  private async protocolProbe(
    ep: ConfigEndpoint,
  ): Promise<{ reachable: boolean; latencyMs: number | null; method: string; error?: string }> {
    const transport = ep.transport.toLowerCase();

    // WebSocket transport — do a real HTTP Upgrade handshake
    if (transport === 'ws' || transport === 'websocket') {
      return this.probeWebSocket(ep);
    }

    // gRPC transport — send an HTTP/2 POST and check for a valid response header
    if (transport === 'grpc') {
      return this.probeGrpc(ep);
    }

    // h2 / http2 transport — send a plain HTTP/2 GET
    if (transport === 'h2' || transport === 'http' || transport === 'http2') {
      return this.probeH2(ep);
    }

    // tcp / kcp / quic / reality — do a TLS or raw TCP connect
    // For TLS configs we validate the TLS handshake completes (deeper than TCP)
    if (ep.tls) {
      return this.probeTls(ep);
    }

    // Plain TCP fallback
    return this.probeTcp(ep.host, ep.port);
  }

  // ---------------------------------------------------------------------------
  // Probe implementations
  // ---------------------------------------------------------------------------

  /**
   * WebSocket probe — sends HTTP Upgrade request and checks for 101/200/400/404.
   * A V2Ray server behind CDN will respond with a valid HTTP status (not a timeout).
   * We accept 101 (upgrade ok), 200, 400, 403, 404 — anything that is NOT a
   * connection refused/timeout means the server is alive and routing traffic.
   */
  private probeWebSocket(ep: ConfigEndpoint): Promise<{ reachable: boolean; latencyMs: number | null; method: string; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const path = ep.wsPath || '/';
      const host = ep.sni || ep.host;
      const method = 'ws-upgrade';

      const onResult = (reachable: boolean, error?: string) =>
        resolve({ reachable, latencyMs: reachable ? Date.now() - start : null, method, error });

      const rawRequest =
        `GET ${path} HTTP/1.1\r\n` +
        `Host: ${host}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`;

      const connect = (socket: net.Socket | tls.TLSSocket) => {
        socket.setTimeout(this.WS_TIMEOUT_MS);
        socket.on('timeout', () => { socket.destroy(); onResult(false, 'WS handshake timeout'); });
        socket.on('error', (e) => onResult(false, e.message));
        socket.on('data', (data: Buffer) => {
          const response = data.toString('utf8', 0, 128);
          // Any HTTP response means the server is alive
          if (response.startsWith('HTTP/')) {
            const statusCode = parseInt(response.split(' ')[1], 10);
            // 101 = upgraded, 4xx = server responded (path wrong but server works)
            // 5xx could mean server error but it's still alive
            const alive = statusCode >= 100 && statusCode < 600;
            socket.destroy();
            onResult(alive, alive ? undefined : `HTTP ${statusCode}`);
          }
        });
        socket.write(rawRequest);
      };

      try {
        if (ep.tls) {
          const sock = tls.connect({
            host: ep.host, port: ep.port,
            servername: ep.sni || ep.host,
            rejectUnauthorized: false,
            timeout: this.TLS_TIMEOUT_MS,
          }, () => connect(sock));
          sock.on('error', (e) => onResult(false, `TLS: ${e.message}`));
        } else {
          const sock = net.createConnection({ host: ep.host, port: ep.port }, () => connect(sock));
          sock.on('error', (e) => onResult(false, e.message));
        }
      } catch (e) {
        onResult(false, e.message);
      }
    });
  }

  /**
   * gRPC probe — sends an HTTP/2 POST with gRPC content-type.
   * A live gRPC V2Ray server returns a valid HTTP/2 response (any status).
   * Uses Node's http/https module to attempt the POST.
   */
  private probeGrpc(ep: ConfigEndpoint): Promise<{ reachable: boolean; latencyMs: number | null; method: string; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const method = 'grpc-post';
      const service = ep.grpcService || 'GunService';
      const path = `/${service}/Tun`;
      const host = ep.sni || ep.host;

      const onResult = (reachable: boolean, error?: string) =>
        resolve({ reachable, latencyMs: reachable ? Date.now() - start : null, method, error });

      const options = {
        hostname: ep.host, port: ep.port, path, method: 'POST',
        headers: {
          'content-type': 'application/grpc',
          'te': 'trailers',
          'host': host,
        },
        rejectUnauthorized: false,
        timeout: this.TLS_TIMEOUT_MS,
      };

      const req = (ep.tls ? https : http).request(options as any, (res) => {
        // Any response (even 404/405) means the server is alive
        res.destroy();
        onResult(res.statusCode < 600, res.statusCode >= 600 ? `HTTP ${res.statusCode}` : undefined);
      });

      req.setTimeout(this.TLS_TIMEOUT_MS, () => {
        req.destroy();
        onResult(false, 'gRPC request timeout');
      });
      req.on('error', (e) => onResult(false, e.message));
      req.end();
    });
  }

  /**
   * h2 / HTTP transport probe — simple GET request.
   */
  private probeH2(ep: ConfigEndpoint): Promise<{ reachable: boolean; latencyMs: number | null; method: string; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const method = 'http-get';
      const onResult = (reachable: boolean, error?: string) =>
        resolve({ reachable, latencyMs: reachable ? Date.now() - start : null, method, error });

      const options = {
        hostname: ep.host, port: ep.port, path: '/', method: 'GET',
        headers: { host: ep.sni || ep.host },
        rejectUnauthorized: false,
        timeout: this.TLS_TIMEOUT_MS,
      };

      const req = (ep.tls ? https : http).request(options as any, (res) => {
        res.destroy();
        onResult(true);
      });
      req.setTimeout(this.TLS_TIMEOUT_MS, () => { req.destroy(); onResult(false, 'HTTP timeout'); });
      req.on('error', (e) => onResult(false, e.message));
      req.end();
    });
  }

  /**
   * TLS handshake probe — deeper than raw TCP.
   * Confirms the TLS layer completes, validating the server is actually
   * serving TLS (not just an open port). Uses SNI from config.
   */
  private probeTls(ep: ConfigEndpoint): Promise<{ reachable: boolean; latencyMs: number | null; method: string; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const method = 'tls-handshake';
      const onResult = (reachable: boolean, error?: string) =>
        resolve({ reachable, latencyMs: reachable ? Date.now() - start : null, method, error });

      try {
        const sock = tls.connect({
          host: ep.host,
          port: ep.port,
          servername: ep.sni || ep.host,
          rejectUnauthorized: false,
          timeout: this.TLS_TIMEOUT_MS,
        }, () => {
          // TLS handshake completed — server is alive
          sock.destroy();
          onResult(true);
        });
        sock.setTimeout(this.TLS_TIMEOUT_MS, () => {
          sock.destroy();
          onResult(false, 'TLS handshake timeout');
        });
        sock.on('error', (e) => onResult(false, `TLS: ${e.message}`));
      } catch (e) {
        onResult(false, e.message);
      }
    });
  }

  /**
   * Raw TCP connect — used as last resort for plain-text transports.
   */
  private probeTcp(host: string, port: number): Promise<{ reachable: boolean; latencyMs: number | null; method: string; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const method = 'tcp-connect';
      const sock = new net.Socket();
      sock.setTimeout(this.TCP_TIMEOUT_MS);
      const done = (ok: boolean, error?: string) => {
        sock.destroy();
        resolve({ reachable: ok, latencyMs: ok ? Date.now() - start : null, method, error });
      };
      sock.on('connect', () => done(true));
      sock.on('timeout', () => done(false, `TCP timeout after ${this.TCP_TIMEOUT_MS}ms`));
      sock.on('error', (e) => done(false, e.message));
      try { sock.connect(port, host); } catch (e) { done(false, e.message); }
    });
  }

  // ---------------------------------------------------------------------------
  // check-host.net TCP check (remote perspective)
  // ---------------------------------------------------------------------------

  private async checkHostNetTcp(host: string, port: number): Promise<NodeResult[]> {
    try {
      const initUrl =
        `https://check-host.net/check-tcp` +
        `?host=${encodeURIComponent(`${host}:${port}`)}` +
        `&max_nodes=${this.CHECK_HOST_MAX_NODES}`;

      const initData = await this.httpsGet<{
        ok: number; request_id: string; nodes: Record<string, any>;
      }>(initUrl);

      if (!initData?.request_id || !initData?.nodes) return [];

      const { request_id, nodes } = initData;
      const nodeNames = Object.keys(nodes);
      const resultUrl = `https://check-host.net/check-result/${request_id}`;
      const rawResults = await this.pollCheckHostResult(resultUrl, nodeNames);

      return nodeNames.map((nodeName) => {
        const res = rawResults[nodeName];
        if (res === null || res === undefined) {
          return { node: nodeName, reachable: false, latencyMs: null, error: 'No response (timeout)' };
        }
        const entry = Array.isArray(res) ? res[0] : res;
        if (entry && typeof entry.time === 'number') {
          return { node: nodeName, reachable: true, latencyMs: Math.round(entry.time * 1000) };
        }
        return { node: nodeName, reachable: false, latencyMs: null, error: entry?.error ?? 'Unknown' };
      });
    } catch (err) {
      this.logger.debug(`check-host.net failed for ${host}:${port} — ${err.message}`);
      return [];
    }
  }

  private async pollCheckHostResult(url: string, nodeNames: string[]): Promise<Record<string, any>> {
    const deadline = Date.now() + this.CHECK_HOST_POLL_TIMEOUT_MS;
    let results: Record<string, any> = {};
    while (Date.now() < deadline) {
      await this.sleep(this.CHECK_HOST_POLL_INTERVAL_MS);
      try { results = await this.httpsGet<Record<string, any>>(url); } catch { continue; }
      const pending = nodeNames.filter((n) => results[n] === null || results[n] === undefined);
      if (pending.length === 0) break;
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Endpoint parsers — extract full connection parameters
  // ---------------------------------------------------------------------------

  private parseEndpoint(config: V2RayConfig): ConfigEndpoint {
    const content = config.content.trim();
    switch (config.type) {
      case V2RayConfigType.LINK:    return this.parseV2RayLink(content);
      case V2RayConfigType.JSON:    return this.parseV2RayJson(content);
      case V2RayConfigType.OPENVPN: return this.parseOpenVpn(content);
      case V2RayConfigType.SSTP:    return this.parseSstp(content);
      case V2RayConfigType.SSH:     return this.parseSsh(content);
      default: throw new Error(`Unknown config type: ${(config as any).type}`);
    }
  }

  private parseV2RayLink(content: string): ConfigEndpoint {
    const scheme = content.split('://')[0].toLowerCase();

    // ---- vmess ----
    if (scheme === 'vmess') {
      const b64 = content.slice('vmess://'.length).split('#')[0];
      const j = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
      const host = String(j.add || j.host || j.server || '');
      const port = parseInt(String(j.port), 10);
      if (!host || isNaN(port)) throw new Error('vmess: missing add/port');
      const net_ = (j.net || j.type || 'tcp').toLowerCase();
      const isTls = (j.tls === 'tls' || j.tls === true || j.security === 'tls' || j.security === 'reality');
      return {
        scheme, host, port, tls: isTls,
        sni: j.sni || j.host || host,
        transport: net_,
        wsPath: net_ === 'ws' ? (j.path || '/') : undefined,
        grpcService: net_ === 'grpc' ? (j.path || j.serviceName || 'GunService') : undefined,
      };
    }

    // ---- vless / trojan / ss / hysteria / hysteria2 / tuic ----
    if (['vless', 'trojan', 'ss', 'ssr', 'hysteria', 'hysteria2', 'tuic'].includes(scheme)) {
      const withoutFragment = content.split('#')[0];
      const fakeUrl = 'https' + withoutFragment.slice(scheme.length);
      const url = new URL(fakeUrl);
      const host = url.hostname;
      const port = parseInt(url.port, 10);
      if (!host || isNaN(port)) throw new Error(`${scheme}: missing host or port`);

      const params = url.searchParams;
      const security = (params.get('security') || '').toLowerCase();
      const isTls = security === 'tls' || security === 'reality' ||
                    scheme === 'trojan' || scheme === 'hysteria' ||
                    scheme === 'hysteria2' || scheme === 'tuic';
      const transport = (params.get('type') || params.get('net') || 'tcp').toLowerCase();
      return {
        scheme, host, port, tls: isTls,
        sni: params.get('sni') || params.get('host') || host,
        transport,
        wsPath: transport === 'ws' ? (params.get('path') || '/') : undefined,
        grpcService: transport === 'grpc' ? (params.get('serviceName') || params.get('path') || 'GunService') : undefined,
        h2Host: transport === 'h2' ? (params.get('host') || host) : undefined,
      };
    }

    // Generic fallback
    const url = new URL('https' + content.slice(content.indexOf('://')));
    const host = url.hostname;
    const port = parseInt(url.port, 10);
    if (!host || isNaN(port)) throw new Error('v2ray_link: cannot determine host/port');
    return { scheme, host, port, tls: true, sni: host, transport: 'tcp' };
  }

  private parseV2RayJson(content: string): ConfigEndpoint {
    const j = JSON.parse(content);
    const outbound = Array.isArray(j.outbounds) ? j.outbounds[0] : null;

    // Extract server address + port
    let host: string, port: number;
    if (outbound?.settings?.vnext?.length) {
      const s = outbound.settings.vnext[0];
      host = String(s.address); port = parseInt(s.port, 10);
    } else if (outbound?.settings?.servers?.length) {
      const s = outbound.settings.servers[0];
      host = String(s.address ?? s.ip ?? s.host); port = parseInt(String(s.port), 10);
    } else if (j.server && j.server_port) {
      host = String(j.server); port = parseInt(j.server_port, 10);
    } else {
      throw new Error('json_config: cannot find outbound server');
    }

    // Extract stream settings
    const stream = outbound?.streamSettings || {};
    const transport = (stream.network || 'tcp').toLowerCase();
    const security = (stream.security || '').toLowerCase();
    const isTls = security === 'tls' || security === 'reality';
    const tlsSettings = stream.tlsSettings || stream.realitySettings || {};
    const wsSettings = stream.wsSettings || {};
    const grpcSettings = stream.grpcSettings || {};

    return {
      scheme: 'json',
      host, port, tls: isTls,
      sni: tlsSettings.serverName || host,
      transport,
      wsPath: transport === 'ws' ? (wsSettings.path || '/') : undefined,
      grpcService: transport === 'grpc' ? (grpcSettings.serviceName || 'GunService') : undefined,
    };
  }

  private parseOpenVpn(content: string): ConfigEndpoint {
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (t.startsWith('remote ')) {
        const parts = t.split(/\s+/);
        const host = parts[1];
        const port = parts[2] ? parseInt(parts[2], 10) : 1194;
        if (host && !isNaN(port)) {
          return { scheme: 'openvpn', host, port, tls: false, sni: host, transport: 'tcp' };
        }
      }
    }
    throw new Error('openvpn: no "remote" directive found');
  }

  private parseSstp(content: string): ConfigEndpoint {
    const t = content.trim();
    if (t.startsWith('sstp://') || t.startsWith('https://')) {
      const url = new URL(t.replace('sstp://', 'https://'));
      return { scheme: 'sstp', host: url.hostname, port: parseInt(url.port || '443', 10), tls: true, sni: url.hostname, transport: 'tcp' };
    }
    const [host, portStr] = t.split(':');
    if (!host) throw new Error('sstp: cannot determine host');
    return { scheme: 'sstp', host, port: portStr ? parseInt(portStr, 10) : 443, tls: true, sni: host, transport: 'tcp' };
  }

  private parseSsh(content: string): ConfigEndpoint {
    const t = content.trim();
    if (t.startsWith('{')) {
      const j = JSON.parse(t);
      const host = j.host || j.server || j.hostname;
      if (!host) throw new Error('ssh: missing host');
      return { scheme: 'ssh', host, port: j.port ? parseInt(j.port, 10) : 22, tls: false, sni: host, transport: 'tcp' };
    }
    if (t.startsWith('ssh://')) {
      const url = new URL(t);
      return { scheme: 'ssh', host: url.hostname, port: parseInt(url.port || '22', 10), tls: false, sni: url.hostname, transport: 'tcp' };
    }
    const [host, portStr] = t.split(':');
    if (!host) throw new Error('ssh: cannot determine host');
    return { scheme: 'ssh', host, port: portStr ? parseInt(portStr, 10) : 22, tls: false, sni: host, transport: 'tcp' };
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private httpsGet<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        { headers: { Accept: 'application/json', 'User-Agent': 'FlyVPN-ConfigChecker/1.0' } },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { reject(new Error(`Invalid JSON from ${url}`)); }
          });
        },
      );
      req.setTimeout(this.CHECK_HOST_POLL_TIMEOUT_MS, () => { req.destroy(); reject(new Error('Request timeout')); });
      req.on('error', reject);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
