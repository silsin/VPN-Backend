import { Module } from '@nestjs/common';
import { SubscriptionAdminCommandsService } from './subscription-admin-commands.service';
import { SubscriptionTelegramKeyboardService } from './subscription-telegram-keyboard.service';
import { SubscriptionTelegramHandlerService } from './subscription-telegram-handler.service';
import { SubscriptionTelegramController } from './subscription-telegram.controller';
import { SubscriptionsModule } from '../subscriptions.module';

/**
 * Telegram integration for subscription system
 * Provides:
 * - Admin commands for managing subscriptions via Telegram bot
 * - Interactive keyboard interface with inline buttons
 * - Callback query handlers for button clicks
 */
@Module({
  imports: [SubscriptionsModule],
  controllers: [SubscriptionTelegramController],
  providers: [
    SubscriptionAdminCommandsService,
    SubscriptionTelegramKeyboardService,
    SubscriptionTelegramHandlerService,
  ],
  exports: [
    SubscriptionAdminCommandsService,
    SubscriptionTelegramKeyboardService,
    SubscriptionTelegramHandlerService,
  ],
})
export class SubscriptionTelegramModule {}
