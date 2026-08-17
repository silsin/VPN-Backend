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
import { DialogsService } from '../dialogs/dialogs.service';
import {
  Dialog,
  DialogStatus,
  DialogTarget,
  DialogType,
  DialogPlacement,
} from '../dialogs/entities/dialog.entity';
import { DeviceLoginsService } from '../device-logins/device-logins.service';
import { UsersService } from '../users/users.service';
import { AdsService } from '../ads/ads.service';
import { AdFailureReport } from '../ads/entities/ad-failure-report.entity';

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

interface PendingDialogButton {
  label: string;
  title: string;
  actionUrl?: string;
  action?: string;
  style?: string;
  isPrimary?: boolean;
}

interface PendingDialogAdd {
  step:
    | 'repeatable'
    | 'title'
    | 'message'
    | 'actionUrl'
    | 'buttonTitle'
    | 'buttonPrimary'
    | 'buttonTarget';
  type: DialogType;
  target: DialogTarget;
  placement: DialogPlacement;
  priority: string;
  repeatable: boolean;
  title?: string;
  message?: string;
  actionUrl?: string;
  buttons: PendingDialogButton[];
  draftButton?: { title?: string; isPrimary?: boolean };
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
  private readonly pendingDialogAdds = new Map<number, PendingDialogAdd>();
  private readonly LIST_PAGE_SIZE = 5;
  private readonly DIALOG_PAGE_SIZE = 5;
  private readonly ADS_REPORT_PAGE_SIZE = 5;

  constructor(
    private readonly configService: ConfigService,
    private readonly configsService: V2RayConfigsService,
    private readonly checkerService: ConfigCheckerService,
    private readonly dialogsService: DialogsService,
    private readonly deviceLoginsService: DeviceLoginsService,
    private readonly usersService: UsersService,
    private readonly adsService: AdsService,
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

    if (this.pendingDialogAdds.has(message.chat.id) && !text.startsWith('/')) {
      await this.continueDialogAdd(message.chat.id, text);
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
      case '/dialogs':
        await this.listDialogs(chatId, parseInt(args[0] ?? '1', 10) || 1);
        break;
      case '/dialogadd':
        await this.startDialogAdd(chatId, args);
        break;
      case '/dialogdel':
        await this.deleteDialog(chatId, args[0]);
        break;
      case '/dialogenable':
        await this.setDialogEnabled(chatId, args[0], true);
        break;
      case '/dialogdisable':
        await this.setDialogEnabled(chatId, args[0], false);
        break;
      case '/sessions':
        await this.sendSessionsReport(chatId);
        break;
      case '/users':
        await this.sendUsersReport(chatId);
        break;
      case '/report':
        await this.sendCombinedReport(chatId);
        break;
      case '/adsreports':
        await this.listAdFailureReports(
          chatId,
          parseInt(args[0] ?? '1', 10) || 1,
        );
        break;
      case '/adssummary':
        await this.sendAdFailureSummary(
          chatId,
          parseInt(args[0] ?? '7', 10) || 7,
        );
        break;
      default:
        await this.send(chatId, 'Unknown command. Send /help to see available commands.');
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
      // Subscription-related callbacks are not handled here
      // They need to be handled by a separate service with proper DI
      if (
        ['menu', 'plans', 'plan', 'users', 'user', 'payments', 'analytics', 'expiring', 'usage', 'quick', 'range'].includes(
          action,
        )
      ) {
        await this.answerCallback(query.id, '📱 Subscription features coming soon');
        return;
      }

      // Handle existing config/dialog/ads callbacks
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
        case 'dlg':
          await this.answerCallback(query.id);
          await this.listDialogs(chatId, parseInt(payload, 10) || 1, messageId);
          break;
        case 'dlgen':
          await this.toggleDialogFromButton(chatId, messageId, payload, true, query.id);
          break;
        case 'dlgdis':
          await this.toggleDialogFromButton(chatId, messageId, payload, false, query.id);
          break;
        case 'dlgask':
          await this.answerCallback(query.id);
          await this.showDialogDeleteConfirm(chatId, messageId, payload);
          break;
        case 'dlgyes':
          await this.deleteDialogById(chatId, messageId, payload, query.id);
          break;
        case 'dlgno':
          await this.answerCallback(query.id, 'Cancelled');
          await this.listDialogs(chatId, 1, messageId);
          break;
        case 'adsr':
          await this.answerCallback(query.id);
          await this.listAdFailureReports(
            chatId,
            parseInt(payload, 10) || 1,
            messageId,
          );
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
    this.pendingDialogAdds.delete(chatId);
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
        '🤖 <b>FlyVPN Admin Bot</b>',
        '',
        '<b>VPN Configs</b>',
        '/list [page] — list configs with buttons',
        '/stats — config counts',
        '/add &lt;name&gt; &lt;type&gt; &lt;category&gt; [country]',
        '  country = 2-letter code only (e.g. ir)',
        '/bulkadd &lt;type&gt; &lt;category&gt; [country]',
        '/remove &lt;id-or-name&gt;',
        '/check [uuid]',
        '',
        '<b>Dialogs</b>',
        '/dialogs [page] — list with enable/disable/delete',
        '/dialogadd &lt;type&gt; &lt;target&gt; [priority] [placement] [repeatable]',
        '  then: repeatable? → title → message → link → buttons',
        '/dialogenable &lt;uuid&gt; — show on mobile (sent)',
        '/dialogdisable &lt;uuid&gt; — hide (cancelled)',
        '/dialogdel &lt;uuid&gt; — delete dialog',
        '',
        '<b>Ads reports</b>',
        '/adsreports [page] — recent ad-not-showing reports',
        '/adssummary [days] — failure counts by reason (default 7)',
        '',
        '<b>Subscriptions</b>',
        '/subscriptions — subscription admin keyboard menu',
        '/subplans — list all subscription plans',
        '/subsuser &lt;id&gt; — view user subscription details',
        '/subsextend &lt;id&gt; &lt;days&gt; — extend user subscription',
        '/subspayments [days] — payment statistics',
        '/subsstats — subscription system statistics',
        '',
        '<b>Reports</b>',
        '/sessions — login sessions summary',
        '/users — total users summary',
        '/report — users + sessions combined',
        '',
        '/cancel — cancel pending add',
        '',
        '<b>Config types:</b> v2ray_link, json_config, openvpn, sstp, ssh',
        '<b>Categories:</b> splash, main, backup',
        '<b>Dialog types:</b> in-app, push, both',
        '<b>Targets:</b> all, android, ios',
        '<b>Placements:</b> general, splash, before_connect, after_connect',
        '<b>Repeatable:</b> add <code>repeatable</code> to show again after dismiss',
        '',
        '<b>Examples</b>',
        '<code>/add Iran-1 v2ray_link main ir</code>',
        '<code>/dialogadd in-app all high before_connect</code>',
        '<code>/dialogadd in-app all high splash repeatable</code>',
        '<code>/adsreports</code>',
        '<code>/adssummary 7</code>',
        '<code>/subscriptions</code>',
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
    this.pendingDialogAdds.delete(Number(chatId));

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
    this.pendingDialogAdds.delete(Number(chatId));

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
      await this.send(chatId, '⏳ Running health check on all configs…');
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
          result.isIranSide ? `🇮🇷 Iran-side config` : '',
          result.endpointReachable !== undefined
            ? `IP/endpoint: <b>${result.endpointReachable ? 'up' : 'down'}</b>`
            : '',
          result.trafficOk === true
            ? `Traffic: ✅ ${result.trafficDownloadMs ?? '—'}ms` +
              (result.trafficUploadOk === true
                ? ' (upload ok)'
                : result.trafficUploadOk === false
                  ? ' (upload fail)'
                  : '')
            : result.trafficOk === false
              ? 'Traffic: ❌ no upload/download'
              : result.trafficSkipped
                ? 'Traffic: ⏭ skipped'
                : '',
          result.localLatencyMs !== null
            ? `Local latency: ${result.localLatencyMs}ms (${result.checkMethod ?? '?'})`
            : '',
          result.remoteNodes && result.remoteNodes.length > 0
            ? `Remote nodes:\n${result.remoteNodes
                .map((n) => `  ${n.reachable ? '✅' : '❌'} ${n.node}: ${n.latencyMs ?? '—'}ms`)
                .join('\n')}`
            : '',
          result.error ? `Error: ${this.esc(result.error.slice(0, 200))}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
      return;
    }

    // Full check of all configs
    const summary = await this.checkerService.checkAll(false);
    
    // Separate working and failed
    const working = summary.results.filter((r) => r.reachable);
    const failed = summary.results.filter((r) => !r.reachable);
    const iranWorking = working.filter((r) => r.isIranSide);
    const iranFailed = failed.filter((r) => r.isIranSide);
    const globalWorking = working.filter((r) => !r.isIranSide);
    const globalFailed = failed.filter((r) => !r.isIranSide);

    let text = [
      '🩺 <b>Health Check Complete</b>',
      `Total: <b>${summary.total}</b> | ✅ <b>${summary.working}</b> | ❌ <b>${summary.failed}</b>`,
      '',
      '<b>Summary</b>',
      `  ✅ Working: ${summary.working}`,
      `  ❌ Failed: ${summary.failed}`,
      summary.pendingRemoval > 0 ? `  ⏳ Pending removal: ${summary.pendingRemoval}` : '',
      summary.removed > 0 ? `  🗑 Removed: ${summary.removed}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Iran-side summary
    if (iranWorking.length > 0 || iranFailed.length > 0) {
      text += `\n\n🇮🇷 <b>Iran-Side (${iranWorking.length + iranFailed.length})</b>`;
      text += `\n  ✅ Working: ${iranWorking.length}`;
      text += `\n  ❌ Failed: ${iranFailed.length}`;
      
      if (iranFailed.length > 0) {
        text += '\n  Failed:';
        for (const r of iranFailed.slice(0, 3)) {
          text += `\n    • ${this.esc(r.name)} - ${r.error?.slice(0, 60) || 'unreachable'}`;
        }
        if (iranFailed.length > 3) text += `\n    ... and ${iranFailed.length - 3} more`;
      }
    }

    // Global summary
    if (globalWorking.length > 0 || globalFailed.length > 0) {
      text += `\n\n🌍 <b>Global (${globalWorking.length + globalFailed.length})</b>`;
      text += `\n  ✅ Working: ${globalWorking.length}`;
      text += `\n  ❌ Failed: ${globalFailed.length}`;
      
      if (globalFailed.length > 0) {
        text += '\n  Failed:';
        for (const r of globalFailed.slice(0, 3)) {
          text += `\n    • ${this.esc(r.name)} - ${r.error?.slice(0, 60) || 'unreachable'}`;
        }
        if (globalFailed.length > 3) text += `\n    ... and ${globalFailed.length - 3} more`;
      }
    }

    text += '\n\nUse /list to see all configs or /check &lt;id&gt; for details.';
    await this.send(chatId, text);
  }

  // ---------------------------------------------------------------------------
  // Dialog commands
  // ---------------------------------------------------------------------------

  private async listDialogs(
    chatId: string,
    page: number,
    editMessageId?: number,
  ): Promise<void> {
    const result = await this.dialogsService.findAll({
      page,
      limit: this.DIALOG_PAGE_SIZE,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    });

    if (result.total === 0) {
      const text = '📭 No dialogs found. Use /dialogadd to create one.';
      if (editMessageId) {
        await this.editMessage(chatId, editMessageId, text);
      } else {
        await this.send(chatId, text);
      }
      return;
    }

    const safePage = Math.min(Math.max(page, 1), result.totalPages);
    const lines = result.data.map(
      (d, i) =>
        `${(safePage - 1) * this.DIALOG_PAGE_SIZE + i + 1}. ${this.dialogStatusIcon(d.status)} <b>${this.esc(d.title)}</b>\n` +
        `   <code>${d.id}</code>\n` +
        `   ${d.type} · ${d.target} · ${d.placement || 'general'} · ${d.repeatable ? 'repeat' : 'once'} · ${d.status} · ${d.priority}`,
    );

    const text = [
      `💬 <b>Dialogs</b> (${result.total} total) — page ${safePage}/${result.totalPages}`,
      '',
      ...lines,
      '',
      '✅ Enable = show on mobile · ⏸ Disable = hide · 🗑 Delete',
    ].join('\n');

    const keyboard = this.buildDialogKeyboard(result.data, safePage, result.totalPages);

    if (editMessageId) {
      await this.editMessage(chatId, editMessageId, text, keyboard);
    } else {
      await this.send(chatId, text, keyboard);
    }
  }

  private buildDialogKeyboard(
    dialogs: Dialog[],
    page: number,
    totalPages: number,
  ): InlineKeyboardButton[][] {
    const rows: InlineKeyboardButton[][] = [];

    for (const dialog of dialogs) {
      const short = this.truncate(dialog.title, 14);
      const isEnabled = dialog.status === DialogStatus.SENT;
      rows.push([
        isEnabled
          ? { text: `⏸ ${short}`, callback_data: `dlgdis:${dialog.id}` }
          : { text: `✅ ${short}`, callback_data: `dlgen:${dialog.id}` },
        { text: '🗑', callback_data: `dlgask:${dialog.id}` },
      ]);
    }

    const nav: InlineKeyboardButton[] = [];
    if (page > 1) {
      nav.push({ text: '◀ Prev', callback_data: `dlg:${page - 1}` });
    }
    nav.push({ text: `${page}/${totalPages}`, callback_data: `dlg:${page}` });
    if (page < totalPages) {
      nav.push({ text: 'Next ▶', callback_data: `dlg:${page + 1}` });
    }
    if (nav.length) rows.push(nav);

    return rows;
  }

  private dialogStatusIcon(status: DialogStatus): string {
    switch (status) {
      case DialogStatus.SENT:
        return '✅';
      case DialogStatus.SCHEDULED:
        return '⏰';
      case DialogStatus.CANCELLED:
        return '⏸';
      default:
        return '📝';
    }
  }

  private async startDialogAdd(chatId: string, args: string[]): Promise<void> {
    this.clearPending(Number(chatId));

    if (args.length < 2) {
      await this.send(
        chatId,
        [
          'Usage:',
          '<code>/dialogadd &lt;type&gt; &lt;target&gt; [priority] [placement] [repeatable]</code>',
          '',
          'Example:',
          '<code>/dialogadd in-app all high before_connect</code>',
          '<code>/dialogadd in-app all normal splash repeatable</code>',
          '',
          'Then: <b>repeatable?</b> (if not set) → title → message → link → buttons',
          '',
          'Types: in-app, push, both',
          'Targets: all, android, ios',
          'Placements: general, splash, before_connect, after_connect',
          'Add <code>repeatable</code> to show again after dismiss (default: once).',
          'For link/buttons steps send <code>-</code> to skip.',
        ].join('\n'),
      );
      return;
    }

    const [typeRaw, targetRaw, ...rest] = args;
    const type = this.parseDialogType(typeRaw);
    const target = this.parseDialogTarget(targetRaw);

    let priority = 'normal';
    let placement = DialogPlacement.GENERAL;
    let repeatable: boolean | null = null;

    for (const token of rest) {
      const lower = token.toLowerCase();
      if (lower === 'repeatable' || lower === 'repeat') {
        repeatable = true;
        continue;
      }
      if (lower === 'once' || lower === 'no-repeat' || lower === 'norepeat') {
        repeatable = false;
        continue;
      }
      const asPlacement = this.parseDialogPlacement(token);
      if (asPlacement) {
        placement = asPlacement;
        continue;
      }
      // first non-placement / non-flag token is priority
      if (priority === 'normal' && !asPlacement) {
        priority = token.slice(0, 50);
        continue;
      }
      await this.send(
        chatId,
        `Unknown arg <code>${this.esc(token)}</code>. Use placement, priority, or repeatable/once.`,
      );
      return;
    }

    if (!type) {
      await this.send(
        chatId,
        `Invalid type <code>${this.esc(typeRaw)}</code>. Use: in-app, push, both`,
      );
      return;
    }
    if (!target) {
      await this.send(
        chatId,
        `Invalid target <code>${this.esc(targetRaw)}</code>. Use: all, android, ios`,
      );
      return;
    }

    const pending: PendingDialogAdd = {
      step: repeatable === null ? 'repeatable' : 'title',
      type,
      target,
      placement,
      priority,
      repeatable: repeatable ?? false,
      buttons: [],
    };
    this.pendingDialogAdds.set(Number(chatId), pending);

    if (pending.step === 'repeatable') {
      await this.send(
        chatId,
        [
          '🔁 <b>Should this dialog be repeatable?</b>',
          `Type: <code>${type}</code> · Target: <code>${target}</code>`,
          `Placement: <code>${placement}</code> · Priority: <code>${this.esc(priority)}</code>`,
          '',
          'Send <code>yes</code> to show again after dismiss.',
          'Send <code>no</code> to show only once per device.',
          'Send /cancel to abort.',
        ].join('\n'),
      );
      return;
    }

    await this.send(
      chatId,
      [
        '✏️ <b>Step 2 — send dialog title</b>',
        `Type: <code>${type}</code>`,
        `Target: <code>${target}</code>`,
        `Placement: <code>${placement}</code>`,
        `Repeatable: <code>${pending.repeatable}</code>`,
        `Priority: <code>${this.esc(priority)}</code>`,
        '',
        'Send /cancel to abort.',
      ].join('\n'),
    );
  }

  private async continueDialogAdd(chatId: number, text: string): Promise<void> {
    const pending = this.pendingDialogAdds.get(chatId);
    if (!pending) return;

    if (pending.step === 'repeatable') {
      const answer = text.trim().toLowerCase();
      const yes = ['yes', 'y', '1', 'true', 'repeatable', 'repeat'].includes(answer);
      const no = ['no', 'n', '0', 'false', 'once'].includes(answer);
      if (!yes && !no) {
        await this.send(
          String(chatId),
          '❌ Send <code>yes</code> (repeatable) or <code>no</code> (once).',
        );
        return;
      }
      pending.repeatable = yes;
      pending.step = 'title';
      this.pendingDialogAdds.set(chatId, pending);
      await this.send(
        String(chatId),
        [
          '✏️ <b>Send dialog title</b>',
          `Repeatable: <code>${yes}</code>`,
          '',
          'Send /cancel to abort.',
        ].join('\n'),
      );
      return;
    }

    if (pending.step === 'title') {
      if (!text || text.length > 255) {
        await this.send(String(chatId), '❌ Title required (max 255 chars). Try again.');
        return;
      }
      pending.title = text;
      pending.step = 'message';
      this.pendingDialogAdds.set(chatId, pending);
      await this.send(
        String(chatId),
        [
          '✏️ <b>Step 3 — send dialog message</b>',
          `Title: <b>${this.esc(text)}</b>`,
          '',
          'Paste the full message body next.',
          'Send /cancel to abort.',
        ].join('\n'),
      );
      return;
    }

    if (pending.step === 'message') {
      if (!text) {
        await this.send(String(chatId), '❌ Message cannot be empty.');
        return;
      }
      pending.message = text;
      pending.step = 'actionUrl';
      this.pendingDialogAdds.set(chatId, pending);
      await this.send(
        String(chatId),
        [
          '🔗 <b>Step 4 — dialog action link (optional)</b>',
          'Send a full URL, or <code>-</code> to skip.',
          '',
          'Example: <code>https://play.google.com/store/apps/details?id=...</code>',
          'Send /cancel to abort.',
        ].join('\n'),
      );
      return;
    }

    if (pending.step === 'actionUrl') {
      const trimmed = text.trim();
      if (trimmed !== '-' && trimmed.toLowerCase() !== 'skip') {
        if (!/^https?:\/\/\S+$/i.test(trimmed)) {
          await this.send(
            String(chatId),
            '❌ Invalid URL. Send a full http(s) link, or <code>-</code> to skip.',
          );
          return;
        }
        pending.actionUrl = trimmed;
      }
      pending.step = 'buttonTitle';
      this.pendingDialogAdds.set(chatId, pending);
      await this.send(
        String(chatId),
        [
          '🔘 <b>Step 5 — button title</b>',
          'Send the text shown on the button.',
          '',
          'Example: <code>Update now</code>',
          'Or send <code>-</code> to finish without more buttons.',
          'Send /cancel to abort.',
        ].join('\n'),
      );
      return;
    }

    if (pending.step === 'buttonTitle') {
      const trimmed = text.trim();
      if (trimmed === '-' || trimmed.toLowerCase() === 'skip' || trimmed.toLowerCase() === 'done') {
        await this.finishDialogAdd(chatId, pending);
        return;
      }
      if (!trimmed || trimmed.length > 100) {
        await this.send(
          String(chatId),
          '❌ Button title required (max 100 chars). Try again, or <code>-</code> to finish.',
        );
        return;
      }
      pending.draftButton = { title: trimmed };
      pending.step = 'buttonPrimary';
      this.pendingDialogAdds.set(chatId, pending);
      await this.send(
        String(chatId),
        [
          '⭐ <b>Is this button primary?</b>',
          `Title: <b>${this.esc(trimmed)}</b>`,
          '',
          'Send <code>yes</code> for primary CTA, or <code>no</code> for secondary.',
          'Send /cancel to abort.',
        ].join('\n'),
      );
      return;
    }

    if (pending.step === 'buttonPrimary') {
      const answer = text.trim().toLowerCase();
      const yes = ['yes', 'y', '1', 'primary', 'true'].includes(answer);
      const no = ['no', 'n', '0', 'secondary', 'false'].includes(answer);
      if (!yes && !no) {
        await this.send(
          String(chatId),
          '❌ Please send <code>yes</code> (primary) or <code>no</code> (secondary).',
        );
        return;
      }
      pending.draftButton = {
        ...(pending.draftButton || {}),
        isPrimary: yes,
      };
      pending.step = 'buttonTarget';
      this.pendingDialogAdds.set(chatId, pending);
      await this.send(
        String(chatId),
        [
          '🔗 <b>Button action</b>',
          `Title: <b>${this.esc(pending.draftButton.title || '')}</b>`,
          `Primary: <b>${yes ? 'yes' : 'no'}</b>`,
          '',
          'Send a full URL, or an action like <code>dismiss</code>.',
          'Send /cancel to abort.',
        ].join('\n'),
      );
      return;
    }

    if (pending.step === 'buttonTarget') {
      const trimmed = text.trim();
      if (!trimmed) {
        await this.send(String(chatId), '❌ Send a URL or action (e.g. dismiss).');
        return;
      }

      const title = pending.draftButton?.title?.trim();
      if (!title) {
        pending.step = 'buttonTitle';
        pending.draftButton = undefined;
        this.pendingDialogAdds.set(chatId, pending);
        await this.send(String(chatId), '❌ Missing button title. Send the title again.');
        return;
      }

      const isPrimary = pending.draftButton?.isPrimary === true;
      const button: PendingDialogButton = {
        label: title,
        title,
        style: isPrimary ? 'primary' : 'secondary',
        isPrimary,
      };
      if (/^https?:\/\//i.test(trimmed)) {
        button.actionUrl = trimmed;
      } else {
        button.action = trimmed;
      }

      pending.buttons.push(button);
      pending.draftButton = undefined;
      pending.step = 'buttonTitle';
      this.pendingDialogAdds.set(chatId, pending);

      await this.send(
        String(chatId),
        [
          `✅ Button added (${pending.buttons.length}): <b>${this.esc(title)}</b>` +
            ` · ${isPrimary ? 'primary' : 'secondary'}`,
          '',
          'Send another <b>button title</b>, or <code>-</code> / <code>done</code> to create the dialog.',
        ].join('\n'),
      );
      return;
    }
  }

  private async finishDialogAdd(
    chatId: number,
    pending: PendingDialogAdd,
  ): Promise<void> {
    this.pendingDialogAdds.delete(chatId);

    try {
      const saved = await this.dialogsService.create({
        type: pending.type,
        target: pending.target,
        placement: pending.placement,
        repeatable: pending.repeatable,
        priority: pending.priority,
        title: pending.title!,
        message: pending.message!,
        ...(pending.actionUrl ? { actionUrl: pending.actionUrl } : {}),
        ...(pending.buttons.length ? { buttons: pending.buttons } : {}),
      });

      const buttonLines = (saved.buttons || []).map(
        (b, i) =>
          `  ${i + 1}. <b>${this.esc(b.title || b.label)}</b>` +
          ` · ${b.isPrimary || b.style === 'primary' ? 'primary' : b.style || 'secondary'}` +
          (b.actionUrl ? ` · ${this.esc(b.actionUrl)}` : b.action ? ` · ${this.esc(b.action)}` : ''),
      );

      await this.send(
        String(chatId),
        [
          '✅ <b>Dialog created</b> (draft)',
          `Title: <b>${this.esc(saved.title)}</b>`,
          `ID: <code>${saved.id}</code>`,
          `${saved.type} · ${saved.target} · ${saved.placement} · ${saved.status}`,
          `Repeatable: <code>${saved.repeatable ? 'yes' : 'no'}</code>`,
          saved.actionUrl
            ? `Link: ${this.esc(saved.actionUrl)}`
            : 'Link: (none)',
          `Buttons: ${saved.buttons?.length ?? 0}`,
          ...(buttonLines.length ? buttonLines : []),
          '',
          'Enable it with /dialogenable or the ✅ button in /dialogs',
        ].join('\n'),
      );
    } catch (err) {
      await this.send(
        String(chatId),
        `❌ Failed to create dialog: ${this.esc(err.message ?? 'Unknown error')}`,
      );
    }
  }

  /** @deprecated kept for any legacy pipe-format callers */
  private parseDialogButtons(text: string): PendingDialogButton[] | null {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return null;

    const buttons: PendingDialogButton[] = [];
    const styles = new Set(['primary', 'secondary', 'danger', 'success']);

    for (const line of lines) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length < 2 || !parts[0]) return null;

      const [label, target, styleRaw] = parts;
      const style =
        styleRaw && styles.has(styleRaw.toLowerCase())
          ? styleRaw.toLowerCase()
          : 'secondary';
      const isPrimary = style === 'primary';

      if (/^https?:\/\//i.test(target)) {
        buttons.push({
          label,
          title: label,
          actionUrl: target,
          style,
          isPrimary,
        });
      } else if (target) {
        buttons.push({
          label,
          title: label,
          action: target,
          style,
          isPrimary,
        });
      } else {
        return null;
      }
    }

    return buttons;
  }

  private async listAdFailureReports(
    chatId: string,
    page: number,
    editMessageId?: number,
  ): Promise<void> {
    const result = await this.adsService.findFailureReports({
      page: Math.max(1, page),
      limit: this.ADS_REPORT_PAGE_SIZE,
    });

    if (result.total === 0) {
      const empty = '📭 No ad failure reports yet.';
      if (editMessageId) {
        await this.editMessage(chatId, editMessageId, empty);
      } else {
        await this.send(chatId, empty);
      }
      return;
    }

    const safePage = Math.min(Math.max(page, 1), result.totalPages);
    const pageResult =
      safePage === result.page
        ? result
        : await this.adsService.findFailureReports({
            page: safePage,
            limit: this.ADS_REPORT_PAGE_SIZE,
          });

    const lines = pageResult.data.map(
      (r: AdFailureReport, i: number) =>
        `${(safePage - 1) * this.ADS_REPORT_PAGE_SIZE + i + 1}. ` +
        `<b>${this.esc(r.reason)}</b> · ${this.esc(r.platform)}` +
        (r.placement ? ` · ${this.esc(r.placement)}` : '') +
        `\n   device: <code>${this.esc(r.deviceId)}</code>` +
        (r.errorCode ? `\n   code: <code>${this.esc(r.errorCode)}</code>` : '') +
        (r.reasonDetail
          ? `\n   ${this.esc(this.truncate(r.reasonDetail, 80))}`
          : '') +
        `\n   ${r.createdAt ? new Date(r.createdAt).toISOString() : ''}`,
    );

    const text = [
      `📣 <b>Ad failure reports</b> (page ${safePage}/${result.totalPages}, total ${result.total})`,
      '',
      ...lines,
    ].join('\n');

    const nav: InlineKeyboardButton[] = [];
    if (safePage > 1) {
      nav.push({ text: '⬅️ Prev', callback_data: `adsr:${safePage - 1}` });
    }
    if (safePage < result.totalPages) {
      nav.push({ text: 'Next ➡️', callback_data: `adsr:${safePage + 1}` });
    }

    const keyboard = nav.length ? [nav] : undefined;

    if (editMessageId) {
      await this.editMessage(chatId, editMessageId, text, keyboard);
    } else {
      await this.send(chatId, text, keyboard);
    }
  }

  private async sendAdFailureSummary(
    chatId: string,
    days: number,
  ): Promise<void> {
    const summary = await this.adsService.getFailureReportSummary(days);
    const reasonLines = Object.entries(summary.byReason)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `• <code>${this.esc(reason)}</code>: ${count}`);
    const platformLines = Object.entries(summary.byPlatform)
      .sort((a, b) => b[1] - a[1])
      .map(([p, count]) => `• <code>${this.esc(p)}</code>: ${count}`);

    await this.send(
      chatId,
      [
        `📊 <b>Ad failure summary</b> (last ${summary.days} days)`,
        `Total: <b>${summary.total}</b>`,
        '',
        '<b>By reason</b>',
        reasonLines.length ? reasonLines.join('\n') : '• none',
        '',
        '<b>By platform</b>',
        platformLines.length ? platformLines.join('\n') : '• none',
      ].join('\n'),
    );
  }

  private async setDialogEnabled(
    chatId: string,
    id: string | undefined,
    enable: boolean,
  ): Promise<void> {
    if (!id) {
      await this.send(
        chatId,
        enable
          ? 'Usage: <code>/dialogenable &lt;uuid&gt;</code>'
          : 'Usage: <code>/dialogdisable &lt;uuid&gt;</code>',
      );
      return;
    }

    try {
      const dialog = enable
        ? await this.dialogsService.enableDialog(id)
        : await this.dialogsService.disableDialog(id);
      await this.send(
        chatId,
        [
          enable ? '✅ <b>Dialog enabled</b>' : '⏸ <b>Dialog disabled</b>',
          `Title: <b>${this.esc(dialog.title)}</b>`,
          `Status: <code>${dialog.status}</code>`,
          `<code>${dialog.id}</code>`,
        ].join('\n'),
      );
    } catch (err) {
      await this.send(
        chatId,
        `❌ ${this.esc(err.message ?? 'Unknown error')}`,
      );
    }
  }

  private async deleteDialog(chatId: string, id?: string): Promise<void> {
    if (!id) {
      await this.send(chatId, 'Usage: <code>/dialogdel &lt;uuid&gt;</code>\n\nTip: use /dialogs for delete buttons.');
      return;
    }

    try {
      const dialog = await this.dialogsService.findOne(id);
      await this.dialogsService.forceRemove(id);
      await this.send(
        chatId,
        `🗑 <b>Deleted</b> ${this.esc(dialog.title)}\n<code>${dialog.id}</code>`,
      );
    } catch (err) {
      await this.send(
        chatId,
        `❌ ${this.esc(err.message ?? 'Unknown error')}`,
      );
    }
  }

  private async toggleDialogFromButton(
    chatId: string,
    messageId: number,
    dialogId: string,
    enable: boolean,
    callbackQueryId: string,
  ): Promise<void> {
    try {
      const dialog = enable
        ? await this.dialogsService.enableDialog(dialogId)
        : await this.dialogsService.disableDialog(dialogId);
      await this.answerCallback(
        callbackQueryId,
        enable ? `Enabled: ${dialog.title}` : `Disabled: ${dialog.title}`,
      );
      await this.listDialogs(chatId, 1, messageId);
    } catch (err) {
      await this.answerCallback(callbackQueryId, err.message ?? 'Failed', true);
    }
  }

  private async showDialogDeleteConfirm(
    chatId: string,
    messageId: number,
    dialogId: string,
  ): Promise<void> {
    try {
      const dialog = await this.dialogsService.findOne(dialogId);
      await this.editMessage(
        chatId,
        messageId,
        [
          '🗑 <b>Confirm dialog deletion</b>',
          `Title: <b>${this.esc(dialog.title)}</b>`,
          `Status: <code>${dialog.status}</code>`,
          `ID: <code>${dialog.id}</code>`,
          '',
          'Delete this dialog permanently?',
        ].join('\n'),
        [
          [
            { text: '✅ Yes, delete', callback_data: `dlgyes:${dialog.id}` },
            { text: '❌ Cancel', callback_data: 'dlgno:' },
          ],
        ],
      );
    } catch {
      await this.editMessage(chatId, messageId, '❌ Dialog not found.');
    }
  }

  private async deleteDialogById(
    chatId: string,
    messageId: number,
    dialogId: string,
    callbackQueryId: string,
  ): Promise<void> {
    try {
      const dialog = await this.dialogsService.findOne(dialogId);
      await this.dialogsService.forceRemove(dialogId);
      await this.answerCallback(callbackQueryId, `Deleted ${dialog.title}`);
      await this.listDialogs(chatId, 1, messageId);
    } catch (err) {
      await this.answerCallback(callbackQueryId, err.message ?? 'Failed', true);
    }
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  private async sendSessionsReport(chatId: string): Promise<void> {
    await this.send(chatId, '⏳ Building sessions report…');
    try {
      const r = await this.deviceLoginsService.getSummaryReport();
      await this.send(chatId, this.formatSessionsReport(r));
    } catch (err) {
      await this.send(chatId, `❌ ${this.esc(err.message ?? 'Failed')}`);
    }
  }

  private async sendUsersReport(chatId: string): Promise<void> {
    await this.send(chatId, '⏳ Building users report…');
    try {
      const r = await this.usersService.getSummaryReport();
      await this.send(chatId, this.formatUsersReport(r));
    } catch (err) {
      await this.send(chatId, `❌ ${this.esc(err.message ?? 'Failed')}`);
    }
  }

  private async sendCombinedReport(chatId: string): Promise<void> {
    await this.send(chatId, '⏳ Building full report…');
    try {
      const [users, sessions] = await Promise.all([
        this.usersService.getSummaryReport(),
        this.deviceLoginsService.getSummaryReport(),
      ]);
      await this.send(
        chatId,
        [
          this.formatUsersReport(users),
          '',
          this.formatSessionsReport(sessions),
        ].join('\n'),
      );
    } catch (err) {
      await this.send(chatId, `❌ ${this.esc(err.message ?? 'Failed')}`);
    }
  }

  private formatUsersReport(
    r: Awaited<ReturnType<UsersService['getSummaryReport']>>,
  ): string {
    const statusLines = Object.entries(r.byStatus)
      .map(([k, v]) => `  ${k}: <b>${v}</b>`)
      .join('\n');
    const roleLines = Object.entries(r.byRole)
      .map(([k, v]) => `  ${k}: <b>${v}</b>`)
      .join('\n');
    const platformLines = Object.entries(r.byPlatform)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${this.esc(k)}: <b>${v}</b>`)
      .join('\n');

    return [
      '👥 <b>Users Report</b>',
      `🕐 <code>${new Date().toUTCString()}</code>`,
      '',
      `Total users: <b>${r.total}</b>`,
      `  With email: <b>${r.withEmail}</b>`,
      `  Device-only: <b>${r.deviceOnly}</b>`,
      '',
      '<b>New registrations</b>',
      `  Last 24h: <b>${r.last24h}</b>`,
      `  Last 7d: <b>${r.last7d}</b>`,
      `  Last 30d: <b>${r.last30d}</b>`,
      '',
      '<b>Active logins</b>',
      `  Logged in last 24h: <b>${r.loggedInLast24h}</b>`,
      `  Logged in last 7d: <b>${r.loggedInLast7d}</b>`,
      '',
      '<b>By status</b>',
      statusLines || '  —',
      '',
      '<b>By role</b>',
      roleLines || '  —',
      '',
      '<b>By platform</b>',
      platformLines || '  —',
    ].join('\n');
  }

  private formatSessionsReport(
    r: Awaited<ReturnType<DeviceLoginsService['getSummaryReport']>>,
  ): string {
    const platformLines = Object.entries(r.byPlatform)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${this.esc(k)}: <b>${v}</b>`)
      .join('\n');

    const recentLines = r.recentLogins.map((l) => {
      const icon = l.isActive ? '🟢' : '⚪';
      const name = l.deviceName || l.deviceId.slice(0, 10);
      const when = l.loginAt ? new Date(l.loginAt).toISOString().slice(0, 16).replace('T', ' ') : '?';
      return `  ${icon} ${this.esc(name)} · ${this.esc(l.platform || '?')} · <code>${when}</code>`;
    });

    return [
      '📱 <b>Login Sessions Report</b>',
      `🕐 <code>${new Date().toUTCString()}</code>`,
      '',
      `Total logins: <b>${r.totalLogins}</b>`,
      `Active sessions: <b>${r.activeSessions}</b>`,
      `Unique devices: <b>${r.uniqueDevices}</b>`,
      `Unique users: <b>${r.uniqueUsers}</b>`,
      '',
      '<b>Login volume</b>',
      `  Last 24h: <b>${r.last24h}</b>`,
      `  Last 7d: <b>${r.last7d}</b>`,
      `  Last 30d: <b>${r.last30d}</b>`,
      '',
      '<b>By platform</b>',
      platformLines || '  —',
      '',
      '<b>Recent logins</b>',
      ...(recentLines.length ? recentLines : ['  —']),
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Parsing helpers
  // ---------------------------------------------------------------------------

  private parseDialogType(value: string): DialogType | null {
    const normalized = value.trim().toLowerCase();
    return Object.values(DialogType).includes(normalized as DialogType)
      ? (normalized as DialogType)
      : null;
  }

  private parseDialogTarget(value: string): DialogTarget | null {
    const normalized = value.trim().toLowerCase();
    return Object.values(DialogTarget).includes(normalized as DialogTarget)
      ? (normalized as DialogTarget)
      : null;
  }

  private parseDialogPlacement(value: string): DialogPlacement | null {
    const normalized = value.trim().toLowerCase().replace(/-/g, '_');
    return Object.values(DialogPlacement).includes(
      normalized as DialogPlacement,
    )
      ? (normalized as DialogPlacement)
      : null;
  }

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
