import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import {
  V2RayConfigCategory,
  V2RayConfigType,
} from '../v2ray-configs/entities/v2ray-config.entity';
import { V2RayConfigsService } from '../v2ray-configs/v2ray-configs.service';
import { ConfigCheckerService } from './config-checker.service';

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TelegramUser;
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface PendingAdd {
  name: string;
  type: V2RayConfigType;
  category: V2RayConfigCategory;
  country?: string;
}

interface PendingBulk {
  type: V2RayConfigType;
  category: V2RayConfigCategory;
  country?: string;
}

@Injectable()
export class TelegramAdminBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramAdminBotService.name);
  private readonly token: string;
  private readonly allowedChatIds: Set<string>;
  private readonly enabled: boolean;
  private updateOffset = 0;
  private polling = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingAdds = new Map<number, PendingAdd>();
  private readonly pendingBulk = new Map<number, PendingBulk>();
  private readonly LIST_PAGE_SIZE = 5;

  constructor(
    private readonly configService: ConfigService,
    private readonly configsService: V2RayConfigsService,
    private readonly checkerService: ConfigCheckerService,
  ) {
    this.token = this.configService.get<string>('TELEGRAM_ADMIN_BOT_TOKEN', '');
    this.enabled =
      this.configService.get<string>('TELEGRAM_ADMIN_BOT_ENABLED', 'true') ===
      'true';
    const raw = this.configService.get<string>(
      'TELEGRAM_ADMIN_CHAT_IDS',
      this.configService.get<string>('TELEGRAM_REPORT_CHAT_IDS', ''),
    );
    this.allowedChatIds = new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Telegram admin bot disabled (TELEGRAM_ADMIN_BOT_ENABLED=false)');
      return;
    }
    if (!this.token) {
      this.logger.warn('TELEGRAM_ADMIN_BOT_TOKEN is not set — admin bot will not start');
      return;
    }
    if (!this.allowedChatIds.size) {
      this.logger.warn('TELEGRAM_ADMIN_CHAT_IDS is empty — admin bot will not start');
      return;
    }

    await this.apiCall('deleteWebhook', { drop_pending_updates: true });
    this.polling = true;
    this.logger.log(
      `Telegram admin bot started for ${this.allowedChatIds.size} authorized user(s)`,
    );
    this.schedulePoll(0);
  }

  onModuleDestroy(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  private schedulePoll(delayMs: number): void {
    if (!this.polling) return;
    this.pollTimer = setTimeout(() => this.pollOnce(), delayMs);
  }

  private async pollOnce(): Promise<void> {
    if (!this.polling) return;

    try {
      const updates = await this.apiCall<TelegramUpdate[]>('getUpdates', {
        offset: this.updateOffset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query'],
      });

      for (const update of updates ?? []) {
        this.updateOffset = update.update_id + 1;
        if (update.message) {
          await this.handleMessage(update.message).catch((err) =>
            this.logger.error(`Failed to handle message: ${err.message}`),
          );
        } else if (update.callback_query) {
          await this.handleCallbackQuery(update.callback_query).catch((err) =>
            this.logger.error(`Failed to handle callback: ${err.message}`),
          );
        }
      }
    } catch (err) {
      this.logger.error(`Telegram polling error: ${err.message}`);
      this.schedulePoll(5000);
      return;
    }

    this.schedulePoll(250);
  }

  // ---------------------------------------------------------------------------
  // Message routing
  // ---------------------------------------------------------------------------

  private async handleMessage(message: TelegramMessage): Promise<void> {
    const chatId = String(message.chat.id);
    const userId = message.from?.id ? String(message.from.id) : chatId;
    const text = (message.text ?? '').trim();

    if (!this.isAuthorized(userId)) {
      this.logger.warn(`Unauthorized Telegram access from user ${userId}`);
      await this.send(chatId, '⛔ You are not authorized to use this bot.');
      return;
    }

    if (this.pendingBulk.has(message.chat.id) && !text.startsWith('/')) {
      await this.completeBulkAdd(message.chat.id, text);
      return;
    }

    if (this.pendingAdds.has(message.chat.id) && !text.startsWith('/')) {
      await this.completeAdd(message.chat.id, text);
      return;
    }

    if (!text.startsWith('/')) {
      await this.send(chatId, 'Send /help to see available commands.');
      return;
    }

    const [commandRaw, ...args] = text.split(/\s+/);
    const command = commandRaw.split('@')[0].toLowerCase();

    switch (command) {
      case '/start':
      case '/help':
        await this.sendHelp(chatId);
        break;
      case '/list':
        await this.listConfigs(chatId, parseInt(args[0] ?? '1', 10) || 1);
        break;
      case '/stats':
        await this.showStats(chatId);
        break;
      case '/add':
        await this.startAdd(chatId, args);
        break;
      case '/bulkadd':
        await this.startBulkAdd(chatId, args);
        break;
      case '/cancel':
        this.clearPending(message.chat.id);
        await this.send(chatId, '✅ Pending operation cancelled.');
        break;
      case '/remove':
        await this.removeConfig(chatId, args.join(' ').trim());
        break;
      case '/check':
        await this.runCheck(chatId, args[0]);
        break;
      default:
        await this.send(chatId, 'Unknown command. Send /help for the command list.');
    }
  }

  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const userId = String(query.from.id);
    const data = query.data ?? '';
    const chatId = query.message ? String(query.message.chat.id) : null;
    const messageId = query.message?.message_id;

    if (!this.isAuthorized(userId)) {
      await this.answerCallback(query.id, '⛔ Not authorized', true);
      return;
    }

    if (!chatId || !messageId) {
      await this.answerCallback(query.id);
      return;
    }

    const [action, ...rest] = data.split(':');
    const payload = rest.join(':');

    try {
      switch (action) {
        case 'lst':
          await this.answerCallback(query.id);
          await this.listConfigs(chatId, parseInt(payload, 10) || 1, messageId);
          break;
        case 'rmask':
          await this.answerCallback(query.id);
          await this.showRemoveConfirm(chatId, messageId, payload);
          break;
        case 'rmyes':
          await this.removeConfigById(chatId, messageId, payload, query.id);
          break;
        case 'rmno':
          await this.answerCallback(query.id, 'Cancelled');
          await this.listConfigs(chatId, 1, messageId);
          break;
        case 'chk':
          await this.answerCallback(query.id, 'Checking…');
          await this.runCheck(chatId, payload);
          break;
        default:
          await this.answerCallback(query.id, 'Unknown action');
      }
    } catch (err) {
      await this.answerCallback(query.id, `Error: ${err.message}`, true);
    }
  }

  private clearPending(chatId: number): void {
    this.pendingAdds.delete(chatId);
    this.pendingBulk.delete(chatId);
  }

  private isAuthorized(userId: string): boolean {
    return this.allowedChatIds.has(userId);
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  private async sendHelp(chatId: string): Promise<void> {
    await this.send(
      chatId,
      [
        '🤖 <b>FlyVPN Config Admin Bot</b>',
        '',
        '<b>Commands</b>',
        '/list [page] — list configs with inline buttons',
        '/stats — config counts by type/category',
        '/add &lt;name&gt; &lt;type&gt; &lt;category&gt; [country]',
        '  country = 2-letter code only (e.g. ir) — optional',
        '  then send config content on the next message',
        '/bulkadd &lt;type&gt; &lt;category&gt; [country]',
        '  then paste multiple lines (see below)',
        '/remove &lt;id-or-name&gt; — delete a config',
        '/check — run health check on all configs',
        '/check &lt;uuid&gt; — check one config',
        '/cancel — cancel pending /add or /bulkadd',
        '',
        '<b>Types:</b> v2ray_link, json_config, openvpn, sstp, ssh',
        '<b>Categories:</b> splash, main, backup',
        '',
        '<b>Single add</b>',
        '<code>/add Iran-1 v2ray_link main ir</code>',
        'then paste: <code>vless://...</code>',
        '',
        '<b>Bulk add</b> (one line per config)',
        '<code>/bulkadd v2ray_link main ir</code>',
        'then paste:',
        '<code>Server-1|vless://...</code>',
        '<code>Server-2|vless://...</code>',
        'Or paste links only — name is taken from #fragment',
      ].join('\n'),
    );
  }

  private async listConfigs(
    chatId: string,
    page: number,
    editMessageId?: number,
  ): Promise<void> {
    const configs = await this.configsService.findAll();
    const totalPages = Math.max(1, Math.ceil(configs.length / this.LIST_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const slice = configs.slice(
      (safePage - 1) * this.LIST_PAGE_SIZE,
      safePage * this.LIST_PAGE_SIZE,
    );

    if (configs.length === 0) {
      const text = '📭 No configs found. Use /add or /bulkadd to create some.';
      if (editMessageId) {
        await this.editMessage(chatId, editMessageId, text);
      } else {
        await this.send(chatId, text);
      }
      return;
    }

    const lines = slice.map(
      (c, i) =>
        `${(safePage - 1) * this.LIST_PAGE_SIZE + i + 1}. <b>${this.esc(c.name)}</b>\n` +
        `   <code>${c.id}</code>\n` +
        `   ${c.type} · ${c.category}${c.country ? ` · ${c.country}` : ''}`,
    );

    const text = [
      `📋 <b>Configs</b> (${configs.length} total) — page ${safePage}/${totalPages}`,
      '',
      ...lines,
      '',
      'Tap buttons below to check or remove.',
    ].join('\n');

    const keyboard = this.buildListKeyboard(slice, safePage, totalPages);

    if (editMessageId) {
      await this.editMessage(chatId, editMessageId, text, keyboard);
    } else {
      await this.send(chatId, text, keyboard);
    }
  }

  private buildListKeyboard(
    configs: Awaited<ReturnType<V2RayConfigsService['findAll']>>,
    page: number,
    totalPages: number,
  ): InlineKeyboardButton[][] {
    const rows: InlineKeyboardButton[][] = [];

    for (const config of configs) {
      const shortName = this.truncate(config.name, 18);
      rows.push([
        {
          text: `🗑 ${shortName}`,
          callback_data: `rmask:${config.id}`,
        },
        {
          text: '🔍 Check',
          callback_data: `chk:${config.id}`,
        },
      ]);
    }

    const nav: InlineKeyboardButton[] = [];
    if (page > 1) {
      nav.push({ text: '◀ Prev', callback_data: `lst:${page - 1}` });
    }
    nav.push({ text: `${page}/${totalPages}`, callback_data: `lst:${page}` });
    if (page < totalPages) {
      nav.push({ text: 'Next ▶', callback_data: `lst:${page + 1}` });
    }
    if (nav.length) rows.push(nav);

    return rows;
  }

  private async showRemoveConfirm(
    chatId: string,
    messageId: number,
    configId: string,
  ): Promise<void> {
    const configs = await this.configsService.findAll();
    const target = configs.find((c) => c.id === configId);
    if (!target) {
      await this.editMessage(chatId, messageId, '❌ Config not found (already removed?).');
      return;
    }

    await this.editMessage(
      chatId,
      messageId,
      [
        '🗑 <b>Confirm removal</b>',
        `Name: <b>${this.esc(target.name)}</b>`,
        `ID: <code>${target.id}</code>`,
        '',
        'Remove this config?',
      ].join('\n'),
      [
        [
          { text: '✅ Yes, remove', callback_data: `rmyes:${target.id}` },
          { text: '❌ Cancel', callback_data: 'rmno:' },
        ],
      ],
    );
  }

  private async removeConfigById(
    chatId: string,
    messageId: number,
    configId: string,
    callbackQueryId: string,
  ): Promise<void> {
    const configs = await this.configsService.findAll();
    const target = configs.find((c) => c.id === configId);

    if (!target) {
      await this.answerCallback(callbackQueryId, 'Config not found', true);
      await this.listConfigs(chatId, 1, messageId);
      return;
    }

    try {
      await this.configsService.remove(target.id);
      await this.answerCallback(callbackQueryId, `Removed ${target.name}`);
      await this.listConfigs(chatId, 1, messageId);
    } catch (err) {
      await this.answerCallback(callbackQueryId, `Failed: ${err.message}`, true);
    }
  }

  private async showStats(chatId: string): Promise<void> {
    const stats = await this.configsService.getStats();
    await this.send(
      chatId,
      [
        '📊 <b>Config Stats</b>',
        `Total: <b>${stats.total}</b>`,
        '',
        '<b>By type</b>',
        `  v2ray_link: ${stats.byType.link}`,
        `  json_config: ${stats.byType.json}`,
        `  openvpn: ${stats.byType.openvpn}`,
        `  sstp: ${stats.byType.sstp}`,
        `  ssh: ${stats.byType.ssh}`,
        '',
        '<b>By category</b>',
        `  splash: ${stats.byCategory.splash}`,
        `  main: ${stats.byCategory.main}`,
        `  backup: ${stats.byCategory.backup}`,
      ].join('\n'),
    );
  }

  private async startAdd(chatId: string, args: string[]): Promise<void> {
    this.pendingBulk.delete(Number(chatId));

    if (args.length < 3) {
      await this.send(
        chatId,
        'Usage:\n<code>/add &lt;name&gt; &lt;type&gt; &lt;category&gt; [country]</code>\n\nExample:\n<code>/add Iran-1 v2ray_link main ir</code>\nThen paste the link, or put the link in the same message after country.',
      );
      return;
    }

    const [name, typeRaw, categoryRaw, ...rest] = args;
    const type = this.parseType(typeRaw);
    const category = this.parseCategory(categoryRaw);

    if (!type) {
      await this.send(
        chatId,
        `Invalid type <code>${this.esc(typeRaw)}</code>. Use: v2ray_link, json_config, openvpn, sstp, ssh`,
      );
      return;
    }
    if (!category) {
      await this.send(
        chatId,
        `Invalid category <code>${this.esc(categoryRaw)}</code>. Use: splash, main, backup`,
      );
      return;
    }

    let country: string | undefined;
    let content: string | undefined;

    if (rest.length === 0) {
      // wait for content on next message
    } else if (rest.length === 1 && this.isValidCountryCode(rest[0])) {
      country = this.normalizeCountry(rest[0]);
    } else if (this.looksLikeConfigContent(rest[0])) {
      content = rest.join(' ');
    } else if (rest.length >= 2 && this.isValidCountryCode(rest[0])) {
      country = this.normalizeCountry(rest[0]);
      content = rest.slice(1).join(' ');
    } else if (rest.length === 1) {
      await this.send(
        chatId,
        `Invalid country <code>${this.esc(rest[0])}</code>. Use a 2-letter code (e.g. <code>ir</code>), or paste the config link in the next message.`,
      );
      this.pendingAdds.set(Number(chatId), { name, type, category });
      return;
    } else {
      content = rest.join(' ');
    }

    if (content) {
      await this.saveConfig(chatId, { name, type, category, country }, content);
      return;
    }

    this.pendingAdds.set(Number(chatId), { name, type, category, country });
    await this.send(
      chatId,
      [
        '✏️ <b>Step 2 — send config content</b>',
        `Name: <b>${this.esc(name)}</b>`,
        `Type: <code>${type}</code>`,
        `Category: <code>${category}</code>`,
        country ? `Country: <code>${this.esc(country)}</code>` : '',
        '',
        'Paste the config link or file content in your next message.',
        'Send /cancel to abort.',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  private async startBulkAdd(chatId: string, args: string[]): Promise<void> {
    this.pendingAdds.delete(Number(chatId));

    if (args.length < 2) {
      await this.send(
        chatId,
        [
          'Usage:',
          '<code>/bulkadd &lt;type&gt; &lt;category&gt; [country]</code>',
          '',
          'Example:',
          '<code>/bulkadd v2ray_link main ir</code>',
          '',
          'Then paste one config per line:',
          '<code>Name-1|vless://...</code>',
          '<code>Name-2|vless://...</code>',
          '',
          'Or paste links only (name from #fragment):',
          '<code>vless://uuid@host:443#Iran-1</code>',
        ].join('\n'),
      );
      return;
    }

    const [typeRaw, categoryRaw, countryRaw] = args;
    const type = this.parseType(typeRaw);
    const category = this.parseCategory(categoryRaw);
    const country = countryRaw ? this.normalizeCountry(countryRaw) : undefined;

    if (!type) {
      await this.send(
        chatId,
        `Invalid type <code>${this.esc(typeRaw)}</code>. Use: v2ray_link, json_config, openvpn, sstp, ssh`,
      );
      return;
    }
    if (!category) {
      await this.send(
        chatId,
        `Invalid category <code>${this.esc(categoryRaw)}</code>. Use: splash, main, backup`,
      );
      return;
    }
    if (countryRaw && !country) {
      await this.send(
        chatId,
        `Invalid country <code>${this.esc(countryRaw)}</code>. Use 2-letter ISO code (e.g. <code>ir</code>). Continuing without country.`,
      );
    }

    this.pendingBulk.set(Number(chatId), { type, category, country });
    await this.send(
      chatId,
      [
        '📦 <b>Bulk import — paste configs</b>',
        `Type: <code>${type}</code>`,
        `Category: <code>${category}</code>`,
        country ? `Country: <code>${this.esc(country)}</code>` : '',
        '',
        'One line per config:',
        '• <code>name|content</code>',
        '• or a link with #name fragment',
        '',
        'Send /cancel to abort.',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  private async completeBulkAdd(chatId: number, text: string): Promise<void> {
    const pending = this.pendingBulk.get(chatId);
    if (!pending) return;

    this.pendingBulk.delete(chatId);

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      await this.send(String(chatId), '❌ No config lines found.');
      return;
    }

    const added: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = this.parseBulkLine(line, i + 1);
      if (!parsed) {
        failed.push(`Line ${i + 1}: could not parse`);
        continue;
      }

      try {
        await this.configsService.create({
          name: parsed.name,
          type: pending.type,
          category: pending.category,
          country: this.normalizeCountry(pending.country),
          content: parsed.content,
        });
        added.push(parsed.name);
      } catch (err) {
        failed.push(`${parsed.name}: ${err.message ?? 'error'}`);
      }
    }

    const report = [
      '📦 <b>Bulk import complete</b>',
      `✅ Added: <b>${added.length}</b>`,
      failed.length ? `❌ Failed: <b>${failed.length}</b>` : '',
      '',
      added.length
        ? ['<b>Added:</b>', ...added.slice(0, 20).map((n) => `• ${this.esc(n)}`)].join('\n')
        : '',
      failed.length
        ? [
            '',
            '<b>Errors:</b>',
            ...failed.slice(0, 15).map((e) => `• ${this.esc(e)}`),
            failed.length > 15 ? `… and ${failed.length - 15} more` : '',
          ].join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    await this.send(String(chatId), report);
  }

  private parseBulkLine(
    line: string,
    index: number,
  ): { name: string; content: string } | null {
    const pipeIdx = line.indexOf('|');
    if (pipeIdx > 0) {
      const name = line.slice(0, pipeIdx).trim();
      const content = line.slice(pipeIdx + 1).trim();
      if (name && content) return { name, content };
    }

    const content = line.trim();
    if (!content) return null;

    const fragmentMatch = content.match(/#([^/?#]+)$/);
    const nameFromFragment = fragmentMatch
      ? decodeURIComponent(fragmentMatch[1]).trim()
      : '';

    return {
      name: nameFromFragment || `Import-${index}-${Date.now().toString(36)}`,
      content,
    };
  }

  private async completeAdd(chatId: number, content: string): Promise<void> {
    const pending = this.pendingAdds.get(chatId);
    if (!pending) return;

    this.pendingAdds.delete(chatId);

    if (!content) {
      await this.send(String(chatId), '❌ Config content cannot be empty.');
      return;
    }

    await this.saveConfig(String(chatId), pending, content);
  }

  private async saveConfig(
    chatId: string,
    meta: PendingAdd,
    content: string,
  ): Promise<void> {
    try {
      const saved = await this.configsService.create({
        name: meta.name,
        type: meta.type,
        category: meta.category,
        country: this.normalizeCountry(meta.country),
        content,
      });

      await this.send(
        chatId,
        [
          '✅ <b>Config added</b>',
          `Name: <b>${this.esc(saved.name)}</b>`,
          `ID: <code>${saved.id}</code>`,
          `Type: ${saved.type} · ${saved.category}`,
          saved.country ? `Country: ${saved.country}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    } catch (err) {
      await this.send(
        chatId,
        `❌ Failed to add config: ${this.esc(err.message ?? 'Unknown error')}`,
      );
    }
  }

  private async removeConfig(chatId: string, query: string): Promise<void> {
    if (!query) {
      await this.send(chatId, 'Usage: <code>/remove &lt;uuid-or-name&gt;</code>\n\nTip: use /list for inline remove buttons.');
      return;
    }

    const configs = await this.configsService.findAll();
    const exactId = configs.find((c) => c.id === query);
    const exactName = configs.find(
      (c) => c.name.toLowerCase() === query.toLowerCase(),
    );
    const partial = configs.filter((c) =>
      c.name.toLowerCase().includes(query.toLowerCase()),
    );

    let target = exactId ?? exactName;
    if (!target) {
      if (partial.length === 1) {
        target = partial[0];
      } else if (partial.length > 1) {
        const names = partial
          .slice(0, 5)
          .map((c) => `• ${this.esc(c.name)} (<code>${c.id.slice(0, 8)}…</code>)`)
          .join('\n');
        await this.send(
          chatId,
          `Multiple matches for <b>${this.esc(query)}</b>. Be more specific:\n${names}`,
        );
        return;
      }
    }

    if (!target) {
      await this.send(chatId, `❌ No config found for <code>${this.esc(query)}</code>.`);
      return;
    }

    try {
      await this.configsService.remove(target.id);
      await this.send(
        chatId,
        `🗑 <b>Removed</b> ${this.esc(target.name)}\n<code>${target.id}</code>`,
      );
    } catch (err) {
      await this.send(
        chatId,
        `❌ Failed to remove: ${this.esc(err.message ?? 'Unknown error')}`,
      );
    }
  }

  private async runCheck(chatId: string, id?: string): Promise<void> {
    if (!id) {
      await this.send(chatId, '⏳ Running health check…');
    }

    if (id) {
      const result = await this.checkerService.checkById(id);
      const icon = result.reachable ? '✅' : '❌';
      await this.send(
        chatId,
        [
          `${icon} <b>${this.esc(result.name)}</b>`,
          `ID: <code>${result.id}</code>`,
          `Endpoint: <code>${this.esc(result.host ?? '?')}:${result.port ?? '?'}</code>`,
          `Reachable: <b>${result.reachable ? 'yes' : 'no'}</b>`,
          result.localLatencyMs !== null
            ? `Local latency: ${result.localLatencyMs}ms (${result.checkMethod ?? '?'})`
            : '',
          result.error ? `Error: ${this.esc(result.error.slice(0, 200))}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
      return;
    }

    const summary = await this.checkerService.checkAll(false);
    await this.send(
      chatId,
      [
        '🩺 <b>Health Check Complete</b>',
        `Total: ${summary.total}`,
        `✅ Working: ${summary.working}`,
        `❌ Failed: ${summary.failed}`,
        `⏳ Pending removal: ${summary.pendingRemoval}`,
      ].join('\n'),
    );
  }

  // ---------------------------------------------------------------------------
  // Parsing helpers
  // ---------------------------------------------------------------------------

  private parseType(value: string): V2RayConfigType | null {
    const normalized = value.trim().toLowerCase();
    return Object.values(V2RayConfigType).includes(normalized as V2RayConfigType)
      ? (normalized as V2RayConfigType)
      : null;
  }

  private parseCategory(value: string): V2RayConfigCategory | null {
    const normalized = value.trim().toLowerCase();
    return Object.values(V2RayConfigCategory).includes(
      normalized as V2RayConfigCategory,
    )
      ? (normalized as V2RayConfigCategory)
      : null;
  }

  /** ISO 3166-1 alpha-2 — DB column is varchar(2) */
  private isValidCountryCode(value: string): boolean {
    return /^[a-zA-Z]{2}$/.test(value.trim());
  }

  private normalizeCountry(value?: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim().toLowerCase();
    return /^[a-z]{2}$/.test(trimmed) ? trimmed : undefined;
  }

  private looksLikeConfigContent(value: string): boolean {
    const v = value.trim();
    if (!v) return false;
    if (v.includes('://')) return true;
    if (v.startsWith('{')) return true;
    if (v.startsWith('remote ')) return true;
    if (v.startsWith('ssh://')) return true;
    return false;
  }

  private truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
  }

  // ---------------------------------------------------------------------------
  // Telegram API
  // ---------------------------------------------------------------------------

  private send(
    chatId: string,
    text: string,
    keyboard?: InlineKeyboardButton[][],
  ): Promise<void> {
    const chunks = this.splitMessage(text, 4096);
    return chunks.reduce(
      (chain, chunk, index) =>
        chain.then(() =>
          this.apiCall('sendMessage', {
            chat_id: chatId,
            text: chunk,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(index === chunks.length - 1 && keyboard
              ? { reply_markup: { inline_keyboard: keyboard } }
              : {}),
          }),
        ),
      Promise.resolve(),
    );
  }

  private editMessage(
    chatId: string,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboardButton[][],
  ): Promise<void> {
    return this.apiCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }

  private answerCallback(
    callbackQueryId: string,
    text?: string,
    showAlert = false,
  ): Promise<void> {
    return this.apiCall('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text, show_alert: showAlert } : {}),
    }).then(() => undefined);
  }

  private apiCall<T = unknown>(
    method: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : '';
      const req = https.request(
        {
          hostname: 'api.telegram.org',
          path: `/bot${this.token}/${method}`,
          method: 'POST',
          headers: payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : undefined,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (!json.ok) {
                reject(new Error(json.description ?? `Telegram API ${method} failed`));
                return;
              }
              resolve(json.result as T);
            } catch {
              reject(new Error(`Invalid Telegram response for ${method}`));
            }
          });
        },
      );

      req.setTimeout(method === 'getUpdates' ? 35_000 : 15_000, () => {
        req.destroy();
        reject(new Error(`Telegram ${method} timeout`));
      });

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  private splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
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

  private esc(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
