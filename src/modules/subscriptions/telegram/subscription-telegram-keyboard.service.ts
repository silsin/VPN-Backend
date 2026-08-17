import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from '../services/subscriptions.service';
import { PaymentService } from '../services/payment.service';
import { UsageService } from '../services/usage.service';

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface ReplyKeyboardButton {
  text: string;
}

/**
 * Telegram Keyboard Interface for Subscription Management
 * Provides interactive menus and inline buttons for admin commands
 */
@Injectable()
export class SubscriptionTelegramKeyboardService {
  private readonly logger = new Logger(SubscriptionTelegramKeyboardService.name);
  private readonly token: string;
  private readonly allowedChatIds: Set<string>;
  private readonly enabled: boolean;
  private readonly botApiUrl = 'https://api.telegram.org/bot';

  constructor(
    private readonly configService: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly paymentService: PaymentService,
    private readonly usageService: UsageService,
  ) {
    this.token = this.configService.get<string>('TELEGRAM_ADMIN_BOT_TOKEN', '');
    this.enabled =
      this.configService.get<string>('TELEGRAM_ADMIN_BOT_ENABLED', 'true') === 'true';
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

  /**
   * Main menu keyboard - top-level options
   */
  getMainMenuKeyboard(): InlineKeyboardButton[][] {
    return [
      [
        { text: '💳 Plans', callback_data: 'menu:plans' },
        { text: '👥 Users', callback_data: 'menu:users' },
      ],
      [
        { text: '💰 Payments', callback_data: 'menu:payments' },
        { text: '📊 Analytics', callback_data: 'menu:analytics' },
      ],
      [
        { text: '⏰ Expiring', callback_data: 'menu:expiring' },
        { text: '📈 Usage', callback_data: 'menu:usage' },
      ],
      [
        { text: '🔄 Refresh', callback_data: 'menu:main' },
        { text: '❓ Help', callback_data: 'menu:help' },
      ],
    ];
  }

  /**
   * Plans management submenu
   */
  getPlansMenuKeyboard(): InlineKeyboardButton[][] {
    return [
      [{ text: '📋 List All Plans', callback_data: 'plans:list' }],
      [{ text: '➕ Create Plan', callback_data: 'plans:create' }],
      [{ text: '🔍 Search Plan', callback_data: 'plans:search' }],
      [{ text: '⬅️ Back to Main', callback_data: 'menu:main' }],
    ];
  }

  /**
   * Plans list keyboard with action buttons
   */
  async getPlansListKeyboard(): Promise<InlineKeyboardButton[][]> {
    const plans = await this.subscriptionsService.getAllPlans(false);
    const keyboard: InlineKeyboardButton[][] = [];

    for (const plan of plans) {
      keyboard.push([
        { text: `📄 ${plan.name}`, callback_data: `plan:view:${plan.id}` },
        { text: plan.isActive ? '✅' : '❌', callback_data: `plan:toggle:${plan.id}` },
      ]);
    }

    keyboard.push([{ text: '⬅️ Back', callback_data: 'menu:plans' }]);
    return keyboard;
  }

  /**
   * Users management submenu
   */
  getUsersMenuKeyboard(): InlineKeyboardButton[][] {
    return [
      [{ text: '🔍 Search User', callback_data: 'users:search' }],
      [{ text: '📊 View Subscription', callback_data: 'users:view' }],
      [{ text: '➕ Extend Subscription', callback_data: 'users:extend' }],
      [{ text: '⬆️ Upgrade Plan', callback_data: 'users:upgrade' }],
      [{ text: '🚫 Suspend', callback_data: 'users:suspend' }],
      [{ text: '✅ Reactivate', callback_data: 'users:reactivate' }],
      [{ text: '⬅️ Back to Main', callback_data: 'menu:main' }],
    ];
  }

  /**
   * Payments management submenu
   */
  getPaymentsMenuKeyboard(): InlineKeyboardButton[][] {
    return [
      [{ text: '📋 Recent Payments', callback_data: 'payments:recent' }],
      [{ text: '❌ Failed Payments', callback_data: 'payments:failed' }],
      [{ text: '💸 Refund Payment', callback_data: 'payments:refund' }],
      [{ text: '✅ Approve Payment', callback_data: 'payments:approve' }],
      [{ text: '📈 Payment Stats', callback_data: 'payments:stats' }],
      [{ text: '⬅️ Back to Main', callback_data: 'menu:main' }],
    ];
  }

  /**
   * Analytics submenu
   */
  getAnalyticsMenuKeyboard(): InlineKeyboardButton[][] {
    return [
      [{ text: '📊 System Stats', callback_data: 'analytics:stats' }],
      [{ text: '💵 Revenue Report', callback_data: 'analytics:revenue' }],
      [{ text: '📉 Churn Analysis', callback_data: 'analytics:churn' }],
      [{ text: '👥 User Breakdown', callback_data: 'analytics:breakdown' }],
      [{ text: '🎯 Plan Distribution', callback_data: 'analytics:plans' }],
      [{ text: '⬅️ Back to Main', callback_data: 'menu:main' }],
    ];
  }

  /**
   * Expiring subscriptions actions
   */
  getExpiringMenuKeyboard(): InlineKeyboardButton[][] {
    return [
      [
        { text: 'Next 7 Days', callback_data: 'expiring:7' },
        { text: 'Next 14 Days', callback_data: 'expiring:14' },
      ],
      [
        { text: 'Next 30 Days', callback_data: 'expiring:30' },
        { text: 'Expired Today', callback_data: 'expiring:0' },
      ],
      [{ text: '⬅️ Back to Main', callback_data: 'menu:main' }],
    ];
  }

  /**
   * Usage statistics menu
   */
  getUsageMenuKeyboard(): InlineKeyboardButton[][] {
    return [
      [{ text: '📊 Usage Stats', callback_data: 'usage:stats' }],
      [{ text: '🔴 Top Consumers', callback_data: 'usage:top' }],
      [{ text: '⚠️ Near Limit', callback_data: 'usage:near' }],
      [{ text: '🔄 Reset Monthly', callback_data: 'usage:reset' }],
      [{ text: '⬅️ Back to Main', callback_data: 'menu:main' }],
    ];
  }

  /**
   * Confirmation keyboard (Yes/No)
   */
  getConfirmationKeyboard(
    yesCallback: string,
    noCallback: string = 'menu:main',
  ): InlineKeyboardButton[][] {
    return [
      [
        { text: '✅ Yes', callback_data: yesCallback },
        { text: '❌ No', callback_data: noCallback },
      ],
    ];
  }

  /**
   * Date range selector
   */
  getDateRangeKeyboard(): InlineKeyboardButton[][] {
    return [
      [
        { text: 'Today', callback_data: 'range:1' },
        { text: 'Last 7 Days', callback_data: 'range:7' },
      ],
      [
        { text: 'Last 30 Days', callback_data: 'range:30' },
        { text: 'Last 90 Days', callback_data: 'range:90' },
      ],
      [{ text: '⬅️ Back', callback_data: 'menu:analytics' }],
    ];
  }

  /**
   * Plan actions keyboard
   */
  getPlanActionsKeyboard(planId: string): InlineKeyboardButton[][] {
    return [
      [
        { text: '✏️ Edit', callback_data: `plan:edit:${planId}` },
        { text: '🗑️ Delete', callback_data: `plan:delete:${planId}` },
      ],
      [
        { text: '📊 View Stats', callback_data: `plan:stats:${planId}` },
        { text: '👥 Users', callback_data: `plan:users:${planId}` },
      ],
      [{ text: '⬅️ Back', callback_data: 'menu:plans' }],
    ];
  }

  /**
   * User actions keyboard
   */
  getUserActionsKeyboard(userId: string): InlineKeyboardButton[][] {
    return [
      [
        { text: '➕ Extend', callback_data: `user:extend:${userId}` },
        { text: '⬆️ Upgrade', callback_data: `user:upgrade:${userId}` },
      ],
      [
        { text: '🚫 Suspend', callback_data: `user:suspend:${userId}` },
        { text: '✅ Reactivate', callback_data: `user:reactivate:${userId}` },
      ],
      [
        { text: '📜 History', callback_data: `user:history:${userId}` },
        { text: '💰 Payments', callback_data: `user:payments:${userId}` },
      ],
      [{ text: '⬅️ Back', callback_data: 'menu:users' }],
    ];
  }

  /**
   * Period selector for reports
   */
  getPeriodKeyboard(baseCallback: string): InlineKeyboardButton[][] {
    return [
      [
        { text: 'Last 7 Days', callback_data: `${baseCallback}:7` },
        { text: 'Last 30 Days', callback_data: `${baseCallback}:30` },
      ],
      [
        { text: 'Last 90 Days', callback_data: `${baseCallback}:90` },
        { text: 'Last Year', callback_data: `${baseCallback}:365` },
      ],
      [{ text: '⬅️ Back', callback_data: 'menu:analytics' }],
    ];
  }

  /**
   * Quick actions keyboard
   */
  getQuickActionsKeyboard(): InlineKeyboardButton[][] {
    return [
      [
        { text: '🔔 Expiring Soon', callback_data: 'quick:expiring' },
        { text: '⚠️ Failed Payments', callback_data: 'quick:failed' },
      ],
      [
        { text: '💵 Today Revenue', callback_data: 'quick:revenue' },
        { text: '👥 Total Users', callback_data: 'quick:users' },
      ],
      [
        { text: '🔄 System Health', callback_data: 'quick:health' },
        { text: '📊 MRR/ARR', callback_data: 'quick:mrr' },
      ],
      [{ text: '⬅️ Main Menu', callback_data: 'menu:main' }],
    ];
  }

  /**
   * Send message with keyboard
   */
  async sendMessageWithKeyboard(
    chatId: string,
    text: string,
    keyboard: InlineKeyboardButton[][] | ReplyKeyboardButton[][],
    isInline: boolean = true,
  ): Promise<void> {
    if (!this.enabled || !this.token) return;

    try {
      const url = `${this.botApiUrl}${this.token}/sendMessage`;
      const payload: any = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      };

      if (isInline) {
        payload.reply_markup = { inline_keyboard: keyboard };
      } else {
        payload.reply_markup = {
          keyboard,
          resize_keyboard: true,
          one_time_keyboard: false,
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.error(`Telegram API error: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send Telegram message: ${error.message}`);
    }
  }

  /**
   * Edit message with new keyboard
   */
  async editMessageWithKeyboard(
    chatId: string,
    messageId: number,
    text: string,
    keyboard: InlineKeyboardButton[][],
  ): Promise<void> {
    if (!this.enabled || !this.token) return;

    try {
      const url = `${this.botApiUrl}${this.token}/editMessageText`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        }),
      });

      if (!response.ok) {
        this.logger.error(`Telegram API error: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error(`Failed to edit Telegram message: ${error.message}`);
    }
  }

  /**
   * Answer callback query (shows notification)
   */
  async answerCallbackQuery(
    queryId: string,
    text: string,
    showAlert: boolean = false,
  ): Promise<void> {
    if (!this.enabled || !this.token) return;

    try {
      const url = `${this.botApiUrl}${this.token}/answerCallbackQuery`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: queryId,
          text,
          show_alert: showAlert,
        }),
      });

      if (!response.ok) {
        this.logger.error(`Telegram API error: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error(`Failed to answer callback query: ${error.message}`);
    }
  }

  /**
   * Send main menu message
   */
  async sendMainMenu(chatId: string): Promise<void> {
    const text = [
      '🤖 <b>FlyVPN Subscription Admin</b>',
      '',
      'Select an action:',
    ].join('\n');

    await this.sendMessageWithKeyboard(chatId, text, this.getMainMenuKeyboard());
  }

  /**
   * Check if user is authorized
   */
  isAuthorized(chatId: string): boolean {
    return this.allowedChatIds.has(chatId);
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
