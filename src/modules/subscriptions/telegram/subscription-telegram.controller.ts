import { Controller, Post, Body, Logger, BadRequestException } from '@nestjs/common';
import { SubscriptionTelegramHandlerService } from './subscription-telegram-handler.service';
import { SubscriptionTelegramKeyboardService } from './subscription-telegram-keyboard.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: {
      message_id: number;
      chat: { id: number };
      text?: string;
    };
    data?: string;
  };
}

/**
 * Telegram Webhook Controller for Subscription Admin
 * Handles incoming messages and callbacks for subscription management
 */
@Controller('webhook/subscription-telegram')
export class SubscriptionTelegramController {
  private readonly logger = new Logger(SubscriptionTelegramController.name);
  private readonly allowedChatIds = new Set<string>();

  constructor(
    private readonly keyboardService: SubscriptionTelegramKeyboardService,
    private readonly handlerService: SubscriptionTelegramHandlerService,
  ) {
    // Parse allowed chat IDs from environment
    const raw = process.env.TELEGRAM_ADMIN_CHAT_IDS || '';
    raw.split(',').forEach((id) => {
      const trimmed = id.trim();
      if (trimmed) this.allowedChatIds.add(trimmed);
    });
  }

  @Post()
  async handleUpdate(@Body() update: TelegramUpdate): Promise<{ ok: boolean }> {
    try {
      if (update.message) {
        await this.handleMessage(update.message);
      } else if (update.callback_query) {
        await this.handleCallback(update.callback_query);
      }
      return { ok: true };
    } catch (error) {
      this.logger.error(`Error handling update: ${error.message}`);
      return { ok: false };
    }
  }

  private async handleMessage(message: any): Promise<void> {
    const chatId = String(message.chat.id);
    const userId = message.from?.id ? String(message.from.id) : chatId;
    const text = (message.text ?? '').trim();

    if (!this.isAuthorized(userId)) {
      this.logger.warn(`Unauthorized access from user ${userId}`);
      return;
    }

    if (!text.startsWith('/')) {
      await this.keyboardService.sendMessageWithKeyboard(
        chatId,
        'Please use /subscriptions command to access the menu.',
        [[{ text: '📱 Open Menu', callback_data: 'menu:main' }]],
      );
      return;
    }

    const [commandRaw, ...args] = text.split(/\s+/);
    const command = commandRaw.split('@')[0].toLowerCase();

    switch (command) {
      case '/start':
      case '/subscriptions':
        await this.keyboardService.sendMainMenu(chatId);
        break;
      case '/help':
        await this.sendHelp(chatId);
        break;
      default:
        await this.keyboardService.sendMessageWithKeyboard(
          chatId,
          'Unknown command. Use /subscriptions to access the admin menu.',
          [[{ text: '📱 Open Menu', callback_data: 'menu:main' }]],
        );
    }
  }

  private async handleCallback(query: any): Promise<void> {
    const userId = String(query.from.id);
    const chatId = query.message ? String(query.message.chat.id) : null;
    const messageId = query.message?.message_id;
    const data = query.data ?? '';

    if (!this.isAuthorized(userId)) {
      await this.keyboardService.answerCallbackQuery(query.id, '⛔ Not authorized', true);
      return;
    }

    if (!chatId || !messageId) {
      await this.keyboardService.answerCallbackQuery(query.id, 'OK');
      return;
    }

    await this.handlerService.handleCallback(query.id, chatId, messageId, data);
  }

  private isAuthorized(userId: string): boolean {
    return this.allowedChatIds.has(userId);
  }

  private async sendHelp(chatId: string): Promise<void> {
    await this.keyboardService.sendMessageWithKeyboard(
      chatId,
      [
        '🤖 <b>FlyVPN Subscription Admin</b>',
        '',
        '<b>Commands:</b>',
        '/subscriptions - Open admin menu',
        '/help - Show this help',
        '',
        '<b>Features:</b>',
        '💳 Manage subscription plans',
        '👥 Manage user subscriptions',
        '💰 Handle payments',
        '📊 View analytics',
        '⏰ Check expiring subscriptions',
        '📈 View usage statistics',
        '',
        'Use the keyboard buttons below to navigate.',
      ].join('\n'),
      [[{ text: '📱 Open Menu', callback_data: 'menu:main' }]],
    );
  }
}
