import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import { BulkCheckResult, CheckResult } from './config-checker.service';

@Injectable()
export class TelegramReportService {
  private readonly logger = new Logger(TelegramReportService.name);
  private readonly token: string;
  private readonly chatIds: string[];

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
    const raw = this.configService.get<string>('TELEGRAM_REPORT_CHAT_IDS', '');
    this.chatIds = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!this.token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set — reports will be skipped');
    }
    if (!this.chatIds.length) {
      this.logger.warn('TELEGRAM_REPORT_CHAT_IDS is empty — reports will be skipped');
    }
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  async sendCheckReport(result: BulkCheckResult): Promise<void> {
    if (!this.token || !this.chatIds.length) return;

    const text = this.buildReportMessage(result);
    await Promise.all(this.chatIds.map((id) => this.sendMessage(id, text)));
  }

  // ---------------------------------------------------------------------------
  // Message builder
  // ---------------------------------------------------------------------------

  private buildReportMessage(result: BulkCheckResult): string {
    const now = new Date().toUTCString();
    const statusIcon = result.failed === 0 ? '✅' : result.working === 0 ? '🔴' : '⚠️';

    const lines: string[] = [
      `${statusIcon} <b>FlyVPN — Config Health Report</b>`,
      `🕐 <code>${now}</code>`,
      '',
      `📊 <b>Summary</b>`,
      `  • Total configs:    <b>${result.total}</b>`,
      `  • ✅ Working:        <b>${result.working}</b>`,
      `  • ❌ Failed:         <b>${result.failed}</b>`,
      `  • ⏳ Pending removal: <b>${result.pendingRemoval}</b> (need 5 consecutive fails)`,
      `  • 🗑 Removed:        <b>${result.removed}</b>`,
    ];

    // --- Failed configs detail ---
    const failed = result.results.filter((r) => !r.reachable);
    if (failed.length > 0) {
      lines.push('', `❌ <b>Unreachable Configs (${failed.length})</b>`);
      for (const r of failed) {
        lines.push(this.formatFailedConfig(r));
      }
    }

    // --- Working configs summary (condensed) ---
    const working = result.results.filter((r) => r.reachable);
    if (working.length > 0) {
      lines.push('', `✅ <b>Working Configs (${working.length})</b>`);
      for (const r of working) {
        lines.push(this.formatWorkingConfig(r));
      }
    }

    return lines.join('\n');
  }

  private formatFailedConfig(r: CheckResult): string {
    const endpoint = r.host ? `${r.host}:${r.port}` : 'unknown endpoint';
    const transport = r.transport ? ` [${r.transport}]` : '';
    const localStatus = r.localLatencyMs !== null
      ? `✅ ${r.localLatencyMs}ms (${r.checkMethod ?? '?'})`
      : `❌ ${r.checkMethod ?? 'tcp'}`;

    const remoteStatus =
      r.remoteNodes.length === 0
        ? 'no data'
        : r.remoteNodes
            .map((n) => {
              const short = n.node.split('.')[0];
              return n.reachable ? `${short}:✅` : `${short}:❌`;
            })
            .join(' ');

    const streak = r.consecutiveFailures ?? 1;
    const streakBar = `${'🟥'.repeat(streak)}${'⬜'.repeat(Math.max(0, 5 - streak))} ${streak}/5`;

    const ep = r.endpointReachable === true ? '✅' : r.endpointReachable === false ? '❌' : '?';
    let trafficLine = '';
    if (r.trafficOk === false) {
      trafficLine = `    Traffic: ❌ IP up but no upload/download\n`;
    } else if (r.trafficOk === true) {
      trafficLine = `    Traffic: ✅ ${r.trafficDownloadMs ?? '—'}ms\n`;
    } else if (r.trafficSkipped) {
      trafficLine = `    Traffic: ⏭ skipped\n`;
    }

    return (
      `  ▸ <b>${this.esc(r.name)}</b> [${r.type}${transport}]\n` +
      `    <code>${this.esc(endpoint)}</code>\n` +
      `    Endpoint: ${ep} | Local: ${localStatus} | Remote: ${remoteStatus}\n` +
      trafficLine +
      `    Streak: ${streakBar}\n` +
      (r.error ? `    ⚠ ${this.esc(r.error.slice(0, 120))}\n` : '')
    );
  }

  private formatWorkingConfig(r: CheckResult): string {
    const endpoint = r.host ? `${r.host}:${r.port}` : '?';
    const transport = r.transport ? ` ${r.transport}` : '';
    const localMs = r.localLatencyMs !== null ? `${r.localLatencyMs}ms` : '—';
    const method = r.checkMethod ? ` (${r.checkMethod})` : '';
    const bestRemote = r.remoteNodes
      .filter((n) => n.reachable && n.latencyMs !== null)
      .sort((a, b) => a.latencyMs - b.latencyMs)[0];
    const remoteMs = bestRemote
      ? `${bestRemote.latencyMs}ms (${bestRemote.node.split('.')[0]})`
      : '—';
    const traffic =
      r.trafficOk === true
        ? ` traffic:${r.trafficDownloadMs ?? 'ok'}ms`
        : r.trafficSkipped
          ? ' traffic:skipped'
          : '';

    return (
      `  ▸ <b>${this.esc(r.name)}</b>${transport} ` +
      `<code>${this.esc(endpoint)}</code> ` +
      `local:${localMs}${method} remote:${remoteMs}${traffic}`
    );
  }

  /** Escape HTML special chars for Telegram HTML parse mode */
  private esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---------------------------------------------------------------------------
  // Telegram Bot API
  // ---------------------------------------------------------------------------

  private sendMessage(chatId: string, text: string): Promise<void> {
    // Telegram message limit is 4096 chars; split if needed
    const chunks = this.splitMessage(text, 4096);
    return chunks.reduce(
      (chain, chunk) => chain.then(() => this.sendChunk(chatId, chunk)),
      Promise.resolve(),
    );
  }

  private sendChunk(chatId: string, text: string): Promise<void> {
    return new Promise((resolve) => {
      const body = JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });

      const req = https.request(
        {
          hostname: 'api.telegram.org',
          path: `/bot${this.token}/sendMessage`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (!json.ok) {
                this.logger.error(
                  `Telegram API error for chat ${chatId}: ${json.description}`,
                );
              }
            } catch {
              this.logger.error(`Telegram: invalid response for chat ${chatId}`);
            }
            resolve();
          });
        },
      );

      req.setTimeout(10_000, () => {
        req.destroy();
        this.logger.error(`Telegram: request timeout for chat ${chatId}`);
        resolve();
      });

      req.on('error', (err) => {
        this.logger.error(`Telegram: request error for chat ${chatId}: ${err.message}`);
        resolve();
      });

      req.write(body);
      req.end();
    });
  }

  private splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      // Try to split at a newline within the limit
      let cutAt = maxLen;
      if (remaining.length > maxLen) {
        const lastNewline = remaining.lastIndexOf('\n', maxLen);
        cutAt = lastNewline > 0 ? lastNewline : maxLen;
      }
      chunks.push(remaining.slice(0, cutAt));
      remaining = remaining.slice(cutAt);
    }
    return chunks;
  }
}
