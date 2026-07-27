import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as net from 'net';
import { V2RayConfig, V2RayConfigType } from '../v2ray-configs/entities/v2ray-config.entity';
import { XrayInstallerService } from './xray-installer.service';

export interface TrafficProbeResult {
  /** Whether real bytes flowed through the tunnel */
  ok: boolean;
  /** Download latency / RTT for the test request */
  downloadMs: number | null;
  /** Bytes received on the download probe */
  downloadBytes: number;
  /** Upload probe succeeded (null = skipped) */
  uploadOk: boolean | null;
  /** Upload latency */
  uploadMs: number | null;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

@Injectable()
export class XrayTrafficProbeService implements OnModuleDestroy {
  private readonly logger = new Logger(XrayTrafficProbeService.name);

  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly startupWaitMs: number;
  private readonly downloadUrl: string;
  private readonly uploadUrl: string;
  private readonly minDownloadBytes: number;

  /** Soft port pool for local SOCKS inbounds */
  private nextPort = 18_100;
  private readonly portMin = 18_100;
  private readonly portMax = 18_900;

  /** Active child processes — killed on shutdown */
  private readonly live = new Set<ChildProcess>();

  constructor(
    private readonly configService: ConfigService,
    private readonly installer: XrayInstallerService,
  ) {
    this.enabled =
      (this.configService.get<string>('CONFIG_TRAFFIC_CHECK_ENABLED', 'true') || 'true')
        .toLowerCase() !== 'false';
    this.timeoutMs = parseInt(
      this.configService.get<string>('CONFIG_TRAFFIC_TIMEOUT_MS', '15000'),
      10,
    ) || 15_000;
    this.startupWaitMs = parseInt(
      this.configService.get<string>('CONFIG_TRAFFIC_STARTUP_MS', '900'),
      10,
    ) || 900;
    this.downloadUrl =
      this.configService.get<string>(
        'CONFIG_TRAFFIC_DOWNLOAD_URL',
        'http://www.gstatic.com/generate_204',
      ) || 'http://www.gstatic.com/generate_204';
    this.uploadUrl =
      this.configService.get<string>(
        'CONFIG_TRAFFIC_UPLOAD_URL',
        'http://speed.cloudflare.com/__up',
      ) || 'http://speed.cloudflare.com/__up';
    this.minDownloadBytes = parseInt(
      this.configService.get<string>('CONFIG_TRAFFIC_MIN_BYTES', '1'),
      10,
    ) || 1;

    if (!this.enabled) {
      this.logger.warn('Traffic smoke test DISABLED via CONFIG_TRAFFIC_CHECK_ENABLED=false');
    } else {
      this.logger.log(`Traffic smoke test enabled (timeout=${this.timeoutMs}ms, auto-install Xray)`);
    }
  }

  onModuleDestroy(): void {
    for (const child of this.live) {
      this.killProcess(child);
    }
    this.live.clear();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  supports(config: V2RayConfig): boolean {
    return (
      config.type === V2RayConfigType.LINK ||
      config.type === V2RayConfigType.JSON
    );
  }

  private async resolveXrayBin(): Promise<string | null> {
    return this.installer.ensureInstalled();
  }

  /**
   * Spawns a short-lived Xray instance for this config and verifies
   * download (and a small upload) through a local SOCKS inbound.
   */
  async probe(config: V2RayConfig): Promise<TrafficProbeResult> {
    if (!this.enabled) {
      return {
        ok: false,
        downloadMs: null,
        downloadBytes: 0,
        uploadOk: null,
        uploadMs: null,
        skipped: true,
        skipReason: 'Traffic check disabled',
      };
    }

    if (!this.supports(config)) {
      return {
        ok: false,
        downloadMs: null,
        downloadBytes: 0,
        uploadOk: null,
        uploadMs: null,
        skipped: true,
        skipReason: `Type ${config.type} not supported for traffic probe`,
      };
    }

    const xrayBin = await this.resolveXrayBin();
    if (!xrayBin) {
      return {
        ok: false,
        downloadMs: null,
        downloadBytes: 0,
        uploadOk: null,
        uploadMs: null,
        skipped: true,
        skipReason: 'Xray binary unavailable (auto-install failed)',
      };
    }

    let outbound: Record<string, any>;
    try {
      outbound = this.buildOutbound(config);
    } catch (err) {
      return {
        ok: false,
        downloadMs: null,
        downloadBytes: 0,
        uploadOk: null,
        uploadMs: null,
        error: `Outbound build failed: ${err.message}`,
      };
    }

    const socksPort = this.allocatePort();
    const tmpDir = os.tmpdir();
    const cfgPath = path.join(
      tmpDir,
      `flyvpn-xray-${config.id.slice(0, 8)}-${socksPort}.json`,
    );

    const xrayConfig = {
      log: { loglevel: 'error' },
      inbounds: [
        {
          tag: 'socks-in',
          listen: '127.0.0.1',
          port: socksPort,
          protocol: 'socks',
          settings: { udp: false, auth: 'noauth' },
        },
      ],
      outbounds: [
        { ...outbound, tag: 'proxy' },
        { protocol: 'freedom', tag: 'direct' },
        { protocol: 'blackhole', tag: 'block' },
      ],
    };

    let child: ChildProcess | null = null;
    try {
      fs.writeFileSync(cfgPath, JSON.stringify(xrayConfig), 'utf8');
      child = spawn(xrayBin, ['run', '-c', cfgPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.live.add(child);

      let stderr = '';
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString('utf8');
        if (stderr.length > 2000) stderr = stderr.slice(-2000);
      });

      const earlyExit = new Promise<TrafficProbeResult>((resolve) => {
        child!.once('error', (e) => {
          const missing =
            (e as NodeJS.ErrnoException).code === 'ENOENT' ||
            /ENOENT|not found/i.test(e.message);
          resolve({
            ok: false,
            downloadMs: null,
            downloadBytes: 0,
            uploadOk: null,
            uploadMs: null,
            skipped: missing,
            skipReason: missing
              ? `Xray binary not found (${xrayBin}) — auto-install may have failed`
              : undefined,
            error: `Failed to start xray (${xrayBin}): ${e.message}`,
          });
        });
        child!.once('exit', (code, signal) => {
          // Only treat as failure if it exits before we finish probing
          resolve({
            ok: false,
            downloadMs: null,
            downloadBytes: 0,
            uploadOk: null,
            uploadMs: null,
            error:
              `Xray exited early (code=${code}, signal=${signal})` +
              (stderr ? `: ${stderr.trim().slice(0, 200)}` : ''),
          });
        });
      });

      const run = (async (): Promise<TrafficProbeResult> => {
        await this.sleep(this.startupWaitMs);
        if (!child || child.killed || child.exitCode !== null) {
          return earlyExit;
        }

        // Download smoke test — any successful HTTP response with body/status proves the tunnel works
        const dl = await this.httpViaSocks(
          '127.0.0.1',
          socksPort,
          this.downloadUrl,
          'GET',
        );
        if (!dl.ok) {
          return {
            ok: false,
            downloadMs: null,
            downloadBytes: 0,
            uploadOk: null,
            uploadMs: null,
            error: `Download failed: ${dl.error}`,
          };
        }

        // generate_204 returns empty body with 204 — treat status 2xx/3xx/204 as success
        const downloadOk =
          (dl.statusCode !== null && dl.statusCode >= 200 && dl.statusCode < 400) ||
          dl.bytes >= this.minDownloadBytes;

        if (!downloadOk) {
          return {
            ok: false,
            downloadMs: dl.ms,
            downloadBytes: dl.bytes,
            uploadOk: null,
            uploadMs: null,
            error: `Download HTTP ${dl.statusCode ?? '?'} (${dl.bytes} bytes)`,
          };
        }

        // Small upload probe (best-effort; download success already proves tunnel)
        let uploadOk: boolean | null = null;
        let uploadMs: number | null = null;
        try {
          const up = await this.httpViaSocks(
            '127.0.0.1',
            socksPort,
            this.uploadUrl,
            'POST',
            Buffer.alloc(1024, 0x61), // 1 KB
          );
          uploadOk = up.ok && up.statusCode !== null && up.statusCode < 500;
          uploadMs = up.ms;
        } catch {
          uploadOk = null;
        }

        return {
          ok: true,
          downloadMs: dl.ms,
          downloadBytes: dl.bytes,
          uploadOk,
          uploadMs,
        };
      })();

      // Race: probe vs early xray death vs hard timeout
      const result = await Promise.race([
        run,
        earlyExit,
        this.sleep(this.timeoutMs).then(
          (): TrafficProbeResult => ({
            ok: false,
            downloadMs: null,
            downloadBytes: 0,
            uploadOk: null,
            uploadMs: null,
            error: `Traffic probe timed out after ${this.timeoutMs}ms`,
          }),
        ),
      ]);

      return result;
    } catch (err) {
      return {
        ok: false,
        downloadMs: null,
        downloadBytes: 0,
        uploadOk: null,
        uploadMs: null,
        error: err.message,
      };
    } finally {
      if (child) {
        this.live.delete(child);
        this.killProcess(child);
      }
      try {
        fs.unlinkSync(cfgPath);
      } catch {
        /* ignore */
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Outbound builders
  // ---------------------------------------------------------------------------

  private buildOutbound(config: V2RayConfig): Record<string, any> {
    const content = config.content.trim();
    if (config.type === V2RayConfigType.JSON) {
      return this.outboundFromJson(content);
    }
    return this.outboundFromLink(content);
  }

  private outboundFromJson(content: string): Record<string, any> {
    const j = JSON.parse(content);

    // Full client config
    if (Array.isArray(j.outbounds) && j.outbounds.length) {
      const proxy = j.outbounds.find(
        (o: any) =>
          o &&
          o.protocol &&
          !['freedom', 'blackhole', 'dns', 'loopback'].includes(o.protocol),
      );
      if (!proxy) throw new Error('json_config: no proxy outbound found');
      const { tag: _t, ...rest } = proxy;
      return rest;
    }

    // Single outbound object
    if (j.protocol && j.settings) {
      const { tag: _t, ...rest } = j;
      return rest;
    }

    throw new Error('json_config: unsupported JSON shape');
  }

  private outboundFromLink(content: string): Record<string, any> {
    const scheme = content.split('://')[0].toLowerCase();

    if (scheme === 'vmess') {
      return this.vmessOutbound(content);
    }
    if (scheme === 'vless') {
      return this.vlessOutbound(content);
    }
    if (scheme === 'trojan') {
      return this.trojanOutbound(content);
    }
    if (scheme === 'ss' || scheme === 'shadowsocks') {
      return this.ssOutbound(content);
    }

    throw new Error(`Unsupported link scheme: ${scheme}`);
  }

  private vmessOutbound(content: string): Record<string, any> {
    const b64 = content.slice('vmess://'.length).split('#')[0];
    const j = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
    const host = String(j.add || j.host || j.server || '');
    const port = parseInt(String(j.port), 10);
    const id = String(j.id || '');
    if (!host || isNaN(port) || !id) throw new Error('vmess: missing add/port/id');

    const network = (j.net || j.type || 'tcp').toLowerCase();
    const security = (j.tls === 'tls' || j.security === 'tls')
      ? 'tls'
      : (j.security === 'reality' || j.tls === 'reality')
        ? 'reality'
        : 'none';

    return {
      protocol: 'vmess',
      settings: {
        vnext: [
          {
            address: host,
            port,
            users: [
              {
                id,
                alterId: parseInt(String(j.aid ?? j.alterId ?? 0), 10) || 0,
                security: j.scy || j.security || 'auto',
              },
            ],
          },
        ],
      },
      streamSettings: this.streamSettings({
        network,
        security,
        sni: j.sni || j.host || host,
        hostHeader: j.host || host,
        path: j.path || '/',
        alpn: j.alpn,
        fp: j.fp,
        pbk: j.pbk,
        sid: j.sid,
        spx: j.spx,
        serviceName: j.path || j.serviceName,
      }),
    };
  }

  private vlessOutbound(content: string): Record<string, any> {
    const withoutFragment = content.split('#')[0];
    const url = new URL('https' + withoutFragment.slice('vless'.length));
    const uuid = decodeURIComponent(url.username);
    const host = url.hostname;
    const port = parseInt(url.port, 10);
    if (!uuid || !host || isNaN(port)) throw new Error('vless: missing uuid/host/port');

    const p = url.searchParams;
    const network = (p.get('type') || p.get('net') || 'tcp').toLowerCase();
    const security = (p.get('security') || 'none').toLowerCase();

    return {
      protocol: 'vless',
      settings: {
        vnext: [
          {
            address: host,
            port,
            users: [
              {
                id: uuid,
                encryption: p.get('encryption') || 'none',
                flow: p.get('flow') || undefined,
              },
            ],
          },
        ],
      },
      streamSettings: this.streamSettings({
        network,
        security,
        sni: p.get('sni') || p.get('host') || host,
        hostHeader: p.get('host') || host,
        path: p.get('path') || '/',
        alpn: p.get('alpn') || undefined,
        fp: p.get('fp') || undefined,
        pbk: p.get('pbk') || undefined,
        sid: p.get('sid') || undefined,
        spx: p.get('spx') || undefined,
        serviceName: p.get('serviceName') || p.get('path') || undefined,
        mode: p.get('mode') || undefined,
      }),
    };
  }

  private trojanOutbound(content: string): Record<string, any> {
    const withoutFragment = content.split('#')[0];
    const url = new URL('https' + withoutFragment.slice('trojan'.length));
    const password = decodeURIComponent(url.username);
    const host = url.hostname;
    const port = parseInt(url.port, 10);
    if (!password || !host || isNaN(port)) throw new Error('trojan: missing password/host/port');

    const p = url.searchParams;
    const network = (p.get('type') || 'tcp').toLowerCase();
    const security = (p.get('security') || 'tls').toLowerCase();

    return {
      protocol: 'trojan',
      settings: {
        servers: [{ address: host, port, password }],
      },
      streamSettings: this.streamSettings({
        network,
        security: security === 'none' ? 'tls' : security,
        sni: p.get('sni') || p.get('host') || host,
        hostHeader: p.get('host') || host,
        path: p.get('path') || '/',
        alpn: p.get('alpn') || undefined,
        fp: p.get('fp') || undefined,
        pbk: p.get('pbk') || undefined,
        sid: p.get('sid') || undefined,
        spx: p.get('spx') || undefined,
        serviceName: p.get('serviceName') || undefined,
      }),
    };
  }

  private ssOutbound(content: string): Record<string, any> {
    // ss://METHOD:PASSWORD@HOST:PORT or ss://BASE64@HOST:PORT or ss://BASE64#name
    let method: string;
    let password: string;
    let host: string;
    let port: number;

    const raw = content.slice(content.indexOf('://') + 3).split('#')[0];

    if (raw.includes('@')) {
      const [userInfo, hostPort] = raw.split('@');
      let decoded = userInfo;
      try {
        // Some links base64-encode method:password
        const tryDecode = Buffer.from(userInfo, 'base64').toString('utf8');
        if (tryDecode.includes(':')) decoded = tryDecode;
      } catch {
        /* use as-is */
      }
      const idx = decoded.indexOf(':');
      if (idx < 0) throw new Error('ss: invalid userinfo');
      method = decodeURIComponent(decoded.slice(0, idx));
      password = decodeURIComponent(decoded.slice(idx + 1));
      const hp = hostPort.includes('?') ? hostPort.split('?')[0] : hostPort;
      const lastColon = hp.lastIndexOf(':');
      host = hp.slice(0, lastColon);
      port = parseInt(hp.slice(lastColon + 1), 10);
    } else {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      // method:password@host:port
      const m = decoded.match(/^(.+?):(.+)@(.+):(\d+)$/);
      if (!m) throw new Error('ss: cannot parse base64 payload');
      method = m[1];
      password = m[2];
      host = m[3];
      port = parseInt(m[4], 10);
    }

    if (!method || !password || !host || isNaN(port)) {
      throw new Error('ss: missing method/password/host/port');
    }

    return {
      protocol: 'shadowsocks',
      settings: {
        servers: [{ address: host, port, method, password }],
      },
    };
  }

  private streamSettings(opts: {
    network: string;
    security: string;
    sni: string;
    hostHeader: string;
    path: string;
    alpn?: string;
    fp?: string;
    pbk?: string;
    sid?: string;
    spx?: string;
    serviceName?: string;
    mode?: string;
  }): Record<string, any> {
    const network = opts.network === 'websocket' ? 'ws' : opts.network;
    const stream: Record<string, any> = {
      network,
      security: opts.security === 'none' ? 'none' : opts.security,
    };

    if (network === 'ws') {
      stream.wsSettings = {
        path: opts.path || '/',
        headers: { Host: opts.hostHeader },
      };
    } else if (network === 'grpc') {
      stream.grpcSettings = {
        serviceName: opts.serviceName || '',
        multiMode: opts.mode === 'multi',
      };
    } else if (network === 'h2' || network === 'http') {
      stream.httpSettings = {
        path: opts.path || '/',
        host: [opts.hostHeader],
      };
    } else if (network === 'tcp') {
      stream.tcpSettings = {};
    }

    if (opts.security === 'tls') {
      stream.tlsSettings = {
        serverName: opts.sni,
        allowInsecure: true,
        fingerprint: opts.fp || undefined,
        alpn: opts.alpn ? opts.alpn.split(',') : undefined,
      };
    } else if (opts.security === 'reality') {
      stream.realitySettings = {
        serverName: opts.sni,
        fingerprint: opts.fp || 'chrome',
        publicKey: opts.pbk,
        shortId: opts.sid || '',
        spiderX: opts.spx || '',
      };
    }

    return stream;
  }

  // ---------------------------------------------------------------------------
  // SOCKS5 HTTP client (no extra deps)
  // ---------------------------------------------------------------------------

  private httpViaSocks(
    socksHost: string,
    socksPort: number,
    targetUrl: string,
    method: 'GET' | 'POST',
    body?: Buffer,
  ): Promise<{ ok: boolean; statusCode: number | null; bytes: number; ms: number; error?: string }> {
    return new Promise((resolve) => {
      const start = Date.now();
      let settled = false;
      const done = (result: {
        ok: boolean;
        statusCode: number | null;
        bytes: number;
        ms: number;
        error?: string;
      }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
      } catch {
        done({ ok: false, statusCode: null, bytes: 0, ms: 0, error: 'Invalid test URL' });
        return;
      }

      const destHost = parsed.hostname;
      const destPort = parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'), 10);
      const timer = setTimeout(() => {
        sock.destroy();
        done({
          ok: false,
          statusCode: null,
          bytes: 0,
          ms: Date.now() - start,
          error: 'SOCKS/HTTP timeout',
        });
      }, this.timeoutMs);

      const sock = net.connect(socksPort, socksHost);

      sock.once('error', (e) => {
        clearTimeout(timer);
        done({ ok: false, statusCode: null, bytes: 0, ms: Date.now() - start, error: e.message });
      });

      sock.once('connect', () => {
        // SOCKS5 greeting — no auth
        sock.write(Buffer.from([0x05, 0x01, 0x00]));
      });

      let phase: 'greet' | 'connect' | 'http' = 'greet';
      let buf = Buffer.alloc(0);

      sock.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);

        if (phase === 'greet') {
          if (buf.length < 2) return;
          if (buf[0] !== 0x05 || buf[1] !== 0x00) {
            clearTimeout(timer);
            sock.destroy();
            done({
              ok: false,
              statusCode: null,
              bytes: 0,
              ms: Date.now() - start,
              error: 'SOCKS5 auth rejected',
            });
            return;
          }
          buf = Buffer.alloc(0);
          phase = 'connect';

          // CONNECT request
          const hostBuf = Buffer.from(destHost, 'utf8');
          const req = Buffer.alloc(7 + hostBuf.length);
          req[0] = 0x05;
          req[1] = 0x01; // CONNECT
          req[2] = 0x00;
          req[3] = 0x03; // domain
          req[4] = hostBuf.length;
          hostBuf.copy(req, 5);
          req.writeUInt16BE(destPort, 5 + hostBuf.length);
          sock.write(req);
          return;
        }

        if (phase === 'connect') {
          if (buf.length < 5) return;
          if (buf[0] !== 0x05 || buf[1] !== 0x00) {
            clearTimeout(timer);
            sock.destroy();
            done({
              ok: false,
              statusCode: null,
              bytes: 0,
              ms: Date.now() - start,
              error: `SOCKS5 CONNECT failed (rep=${buf[1]})`,
            });
            return;
          }

          // Consume SOCKS reply (variable length)
          const atyp = buf[3];
          let replyLen = 4;
          if (atyp === 0x01) replyLen += 4 + 2;
          else if (atyp === 0x03) replyLen += 1 + buf[4] + 2;
          else if (atyp === 0x04) replyLen += 16 + 2;
          if (buf.length < replyLen) return;

          buf = buf.slice(replyLen);
          phase = 'http';
          sock.removeAllListeners('data');

          // Prefer plain HTTP test URLs (default). Raw HTTP over the SOCKS tunnel
          // avoids fragile custom http.Agent createConnection hacks.
          if (parsed.protocol === 'https:') {
            clearTimeout(timer);
            sock.destroy();
            done({
              ok: false,
              statusCode: null,
              bytes: 0,
              ms: Date.now() - start,
              error: 'HTTPS test URLs are not supported — use http:// test endpoints',
            });
            return;
          }

          const pathAndQuery = parsed.pathname + parsed.search;
          let raw =
            `${method} ${pathAndQuery} HTTP/1.1\r\n` +
            `Host: ${destHost}\r\n` +
            `User-Agent: FlyVPN-ConfigChecker/2.0\r\n` +
            `Connection: close\r\n`;
          if (body) {
            raw +=
              `Content-Type: application/octet-stream\r\n` +
              `Content-Length: ${body.length}\r\n`;
          }
          raw += `\r\n`;

          let responseBuf = Buffer.alloc(0);
          sock.on('data', (d: Buffer) => {
            responseBuf = Buffer.concat([responseBuf, d]);
          });
          sock.on('end', () => {
            clearTimeout(timer);
            const text = responseBuf.toString('utf8');
            const statusMatch = text.match(/^HTTP\/\d\.\d\s+(\d+)/);
            const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : null;
            const headerEnd = text.indexOf('\r\n\r\n');
            const bodyBytes =
              headerEnd >= 0
                ? Buffer.byteLength(text.slice(headerEnd + 4))
                : responseBuf.length;
            done({
              ok: statusCode !== null,
              statusCode,
              bytes: bodyBytes,
              ms: Date.now() - start,
              error: statusCode === null ? 'No HTTP response via tunnel' : undefined,
            });
          });
          sock.on('error', (e) => {
            clearTimeout(timer);
            done({
              ok: false,
              statusCode: null,
              bytes: 0,
              ms: Date.now() - start,
              error: e.message,
            });
          });

          sock.write(raw);
          if (body) sock.write(body);
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private allocatePort(): number {
    const port = this.nextPort;
    this.nextPort += 1;
    if (this.nextPort > this.portMax) this.nextPort = this.portMin;
    return port;
  }

  private killProcess(child: ChildProcess): void {
    if (!child || child.killed || child.exitCode !== null) return;
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, 1000).unref?.();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
