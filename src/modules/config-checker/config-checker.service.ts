import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import * as net from 'net';
import * as https from 'https';
import { V2RayConfig, V2RayConfigType } from '../v2ray-configs/entities/v2ray-config.entity';
import { TelegramReportService } from './telegram-report.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /** True if local TCP OR any check-host.net node confirmed reachability */
  reachable: boolean;
  /** Local TCP latency (null if failed) */
  localLatencyMs: number | null;
  /** Results from check-host.net nodes */
  remoteNodes: NodeResult[];
  error?: string;
}

export interface BulkCheckResult {
  total: number;
  working: number;
  failed: number;
  removed: number;
  results: CheckResult[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ConfigCheckerService {
  private readonly logger = new Logger(ConfigCheckerService.name);

  /** Local TCP connect timeout */
  private readonly TCP_TIMEOUT_MS = 5000;

  /**
   * Number of check-host.net nodes to use per check.
   * Keep it low (3) to avoid hammering the free API.
   */
  private readonly CHECK_HOST_MAX_NODES = 3;

  /**
   * How long to wait for all nodes to respond before we evaluate
   * whatever results have arrived.
   */
  private readonly CHECK_HOST_POLL_TIMEOUT_MS = 12_000;

  /** Interval between result polls */
  private readonly CHECK_HOST_POLL_INTERVAL_MS = 1_500;

  constructor(
    @InjectRepository(V2RayConfig)
    private readonly configsRepo: Repository<V2RayConfig>,
    private readonly telegram: TelegramReportService,
  ) {}

  // ---------------------------------------------------------------------------
  // Scheduled job — every 10 minutes, auto-remove unreachable configs
  // ---------------------------------------------------------------------------

  @Cron('0 */10 * * * *', { name: 'config-health-check' })
  async scheduledCheck(): Promise<void> {
    this.logger.log('⏱  Scheduled config health check triggered');
    await this.checkAll(true);
  }
  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Run health checks on all stored configs. */
  async checkAll(removeUnreachable = false): Promise<BulkCheckResult> {
    const configs = await this.configsRepo.find();
    this.logger.log(
      `Starting health check for ${configs.length} config(s) (removeUnreachable=${removeUnreachable})`,
    );

    // Run all checks concurrently
    const results = await Promise.all(configs.map((c) => this.checkConfig(c)));

    const failed = results.filter((r) => !r.reachable);
    let removed = 0;

    if (removeUnreachable && failed.length > 0) {
      for (const r of failed) {
        try {
          await this.configsRepo.delete(r.id);
          this.logger.warn(
            `Removed unreachable config: [${r.name}] ${r.host}:${r.port} — ${r.error ?? 'all checks failed'}`,
          );
          removed++;
        } catch (err) {
          this.logger.error(`Failed to remove config ${r.id}: ${err.message}`);
        }
      }
    }

    const summary: BulkCheckResult = {
      total: configs.length,
      working: results.filter((r) => r.reachable).length,
      failed: failed.length,
      removed,
      results,
    };

    this.logger.log(
      `Health check done — working: ${summary.working}, failed: ${summary.failed}, removed: ${summary.removed}`,
    );

    // Send Telegram report (non-blocking — never throws)
    this.telegram.sendCheckReport(summary).catch((err) =>
      this.logger.error(`Telegram report failed: ${err.message}`),
    );

    return summary;
  }

  /** Check a single config by database ID. */
  async checkById(id: string): Promise<CheckResult> {
    const config = await this.configsRepo.findOne({ where: { id } });
    if (!config) {
      return {
        id,
        name: 'unknown',
        type: null,
        host: null,
        port: null,
        reachable: false,
        localLatencyMs: null,
        remoteNodes: [],
        error: 'Config not found',
      };
    }
    return this.checkConfig(config);
  }

  // ---------------------------------------------------------------------------
  // Core check logic
  // ---------------------------------------------------------------------------

  async checkConfig(config: V2RayConfig): Promise<CheckResult> {
    // 1. Parse host + port from config content
    let host: string | null = null;
    let port: number | null = null;
    let parseError: string | undefined;

    try {
      const parsed = this.extractEndpoint(config);
      host = parsed.host;
      port = parsed.port;
    } catch (err) {
      parseError = `Parse error: ${err.message}`;
    }

    if (!host || !port) {
      return {
        id: config.id,
        name: config.name,
        type: config.type,
        host,
        port,
        reachable: false,
        localLatencyMs: null,
        remoteNodes: [],
        error: parseError ?? 'Could not extract host/port',
      };
    }

    // 2. Run local TCP check + check-host.net TCP check in parallel
    const [localResult, remoteNodes] = await Promise.all([
      this.localTcpCheck(host, port),
      this.checkHostNetTcp(host, port),
    ]);

    // 3. Reachable if local OR any remote node succeeded
    const remoteReachable = remoteNodes.some((n) => n.reachable);
    const reachable = localResult.reachable || remoteReachable;

    // Summarise errors when fully unreachable
    let error: string | undefined;
    if (!reachable) {
      const parts: string[] = [];
      if (localResult.error) parts.push(`local: ${localResult.error}`);
      const remoteErrors = remoteNodes
        .filter((n) => n.error)
        .map((n) => `${n.node}: ${n.error}`);
      if (remoteErrors.length) parts.push(...remoteErrors);
      error = parts.join(' | ') || 'All checks failed';
    }

    return {
      id: config.id,
      name: config.name,
      type: config.type,
      host,
      port,
      reachable,
      localLatencyMs: localResult.latencyMs,
      remoteNodes,
      error,
    };
  }

  // ---------------------------------------------------------------------------
  // Local TCP check
  // ---------------------------------------------------------------------------

  private localTcpCheck(
    host: string,
    port: number,
  ): Promise<{ reachable: boolean; latencyMs: number | null; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(this.TCP_TIMEOUT_MS);

      const done = (reachable: boolean, error?: string) => {
        socket.destroy();
        resolve({ reachable, latencyMs: reachable ? Date.now() - start : null, error });
      };

      socket.on('connect', () => done(true));
      socket.on('timeout', () => done(false, `Timeout after ${this.TCP_TIMEOUT_MS}ms`));
      socket.on('error', (err) => done(false, err.message));

      try {
        socket.connect(port, host);
      } catch (err) {
        done(false, err.message);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // check-host.net TCP check
  // Docs: https://check-host.net/about/api
  //
  // Flow:
  //   1. GET /check-tcp?host=HOST:PORT&max_nodes=N  → { request_id, nodes }
  //   2. Poll GET /check-result/{request_id}        → { node: [{time, address}|{error}|null] }
  //      null means the node hasn't responded yet; poll until no nulls or timeout.
  // ---------------------------------------------------------------------------

  private async checkHostNetTcp(host: string, port: number): Promise<NodeResult[]> {
    try {
      // Step 1: initiate check
      const initUrl =
        `https://check-host.net/check-tcp` +
        `?host=${encodeURIComponent(`${host}:${port}`)}` +
        `&max_nodes=${this.CHECK_HOST_MAX_NODES}`;

      const initData = await this.httpsGet<{
        ok: number;
        request_id: string;
        nodes: Record<string, any>;
      }>(initUrl);

      if (!initData?.request_id || !initData?.nodes) {
        this.logger.debug(`check-host.net: unexpected init response for ${host}:${port}`);
        return [];
      }

      const { request_id, nodes } = initData;
      const nodeNames = Object.keys(nodes);

      // Step 2: poll for results
      const resultUrl = `https://check-host.net/check-result/${request_id}`;
      const rawResults = await this.pollCheckHostResult(resultUrl, nodeNames);

      // Step 3: map to NodeResult[]
      return nodeNames.map((nodeName) => {
        const res = rawResults[nodeName];

        // null → still pending (timed out waiting)
        if (res === null || res === undefined) {
          return { node: nodeName, reachable: false, latencyMs: null, error: 'No response (timeout)' };
        }

        // TCP result format: [{ time: number, address: string }] on success
        //                    [{ error: string }] on failure
        const entry = Array.isArray(res) ? res[0] : res;
        if (entry && typeof entry.time === 'number') {
          return {
            node: nodeName,
            reachable: true,
            latencyMs: Math.round(entry.time * 1000),
          };
        }

        return {
          node: nodeName,
          reachable: false,
          latencyMs: null,
          error: entry?.error ?? 'Unknown error',
        };
      });
    } catch (err) {
      this.logger.debug(`check-host.net request failed for ${host}:${port} — ${err.message}`);
      return [];
    }
  }

  /**
   * Poll /check-result/{id} until all nodes have responded or timeout is reached.
   */
  private async pollCheckHostResult(
    url: string,
    nodeNames: string[],
  ): Promise<Record<string, any>> {
    const deadline = Date.now() + this.CHECK_HOST_POLL_TIMEOUT_MS;
    let results: Record<string, any> = {};

    while (Date.now() < deadline) {
      await this.sleep(this.CHECK_HOST_POLL_INTERVAL_MS);

      try {
        results = await this.httpsGet<Record<string, any>>(url);
      } catch {
        continue;
      }

      // All nodes responded (none are null)
      const pending = nodeNames.filter((n) => results[n] === null || results[n] === undefined);
      if (pending.length === 0) break;
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Protocol parsers — extract host + port from config content
  // ---------------------------------------------------------------------------

  private extractEndpoint(config: V2RayConfig): { host: string; port: number } {
    const content = config.content.trim();
    switch (config.type) {
      case V2RayConfigType.LINK:    return this.parseV2RayLink(content);
      case V2RayConfigType.JSON:    return this.parseJsonConfig(content);
      case V2RayConfigType.OPENVPN: return this.parseOpenVpnConfig(content);
      case V2RayConfigType.SSTP:    return this.parseSstpConfig(content);
      case V2RayConfigType.SSH:     return this.parseSshConfig(content);
      default: throw new Error(`Unknown config type: ${(config as any).type}`);
    }
  }

  /**
   * vmess://  → base64 JSON with "add" + "port"
   * vless://  → vless://<uuid>@host:port?...
   * trojan:// → trojan://<pw>@host:port?...
   * ss://     → ss://<b64>@host:port or ss://<b64>#name
   */
  private parseV2RayLink(content: string): { host: string; port: number } {
    const scheme = content.split('://')[0].toLowerCase();

    if (scheme === 'vmess') {
      const b64 = content.slice('vmess://'.length);
      let json: any;
      try {
        json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
      } catch {
        json = JSON.parse(Buffer.from(b64.split('#')[0], 'base64').toString('utf-8'));
      }
      const host = String(json.add || json.host || json.server || '');
      const port = parseInt(String(json.port), 10);
      if (!host || isNaN(port)) throw new Error('vmess: missing add/port');
      return { host, port };
    }

    if (['vless', 'trojan', 'ss', 'ssr', 'hysteria', 'hysteria2', 'tuic'].includes(scheme)) {
      const fakeUrl = 'https' + content.split('#')[0].slice(scheme.length);
      try {
        const url = new URL(fakeUrl);
        const host = url.hostname;
        const port = parseInt(url.port, 10);
        if (!host || isNaN(port)) throw new Error(`${scheme}: missing host or port`);
        return { host, port };
      } catch {
        throw new Error(`${scheme}: invalid URI format`);
      }
    }

    // Generic fallback
    const url = new URL('https' + content.slice(content.indexOf('://')));
    const host = url.hostname;
    const port = parseInt(url.port, 10);
    if (!host || isNaN(port)) throw new Error('v2ray_link: cannot determine host/port');
    return { host, port };
  }

  /** V2Ray/Xray/Sing-box JSON outbound */
  private parseJsonConfig(content: string): { host: string; port: number } {
    const json = JSON.parse(content);
    const outbound = Array.isArray(json.outbounds) ? json.outbounds[0] : null;

    if (outbound?.settings?.vnext?.length) {
      const s = outbound.settings.vnext[0];
      return { host: String(s.address), port: parseInt(s.port, 10) };
    }
    if (outbound?.settings?.servers?.length) {
      const s = outbound.settings.servers[0];
      return { host: String(s.address ?? s.ip ?? s.host), port: parseInt(String(s.port), 10) };
    }
    if (json.server && json.server_port) {
      return { host: String(json.server), port: parseInt(json.server_port, 10) };
    }
    throw new Error('json_config: cannot find outbound server');
  }

  /** OpenVPN — find `remote <host> [port]` */
  private parseOpenVpnConfig(content: string): { host: string; port: number } {
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('remote ')) {
        const parts = trimmed.split(/\s+/);
        const host = parts[1];
        const port = parts[2] ? parseInt(parts[2], 10) : 1194;
        if (host && !isNaN(port)) return { host, port };
      }
    }
    throw new Error('openvpn: no "remote" directive found');
  }

  /** SSTP — `sstp://host:port`, `https://host:port`, or `host:port` */
  private parseSstpConfig(content: string): { host: string; port: number } {
    const t = content.trim();
    if (t.startsWith('sstp://') || t.startsWith('https://')) {
      const url = new URL(t.replace('sstp://', 'https://'));
      return { host: url.hostname, port: parseInt(url.port || '443', 10) };
    }
    const [host, portStr] = t.split(':');
    if (!host) throw new Error('sstp: cannot determine host');
    return { host, port: portStr ? parseInt(portStr, 10) : 443 };
  }

  /** SSH — JSON `{host,port}`, `ssh://user@host:port`, or `host:port` */
  private parseSshConfig(content: string): { host: string; port: number } {
    const t = content.trim();
    if (t.startsWith('{')) {
      const json = JSON.parse(t);
      const host = json.host || json.server || json.hostname;
      if (!host) throw new Error('ssh: missing host in JSON');
      return { host, port: json.port ? parseInt(json.port, 10) : 22 };
    }
    if (t.startsWith('ssh://')) {
      const url = new URL(t);
      return { host: url.hostname, port: parseInt(url.port || '22', 10) };
    }
    const [host, portStr] = t.split(':');
    if (!host) throw new Error('ssh: cannot determine host');
    return { host, port: portStr ? parseInt(portStr, 10) : 22 };
  }

  // ---------------------------------------------------------------------------
  // HTTP utility
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
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error(`Invalid JSON from ${url}`));
            }
          });
        },
      );
      req.setTimeout(this.CHECK_HOST_POLL_TIMEOUT_MS, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.on('error', reject);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
