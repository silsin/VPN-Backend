import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionAdminCommandsService } from './subscription-admin-commands.service';
import { SubscriptionTelegramKeyboardService } from './subscription-telegram-keyboard.service';
import { SubscriptionTelegramHandlerService } from './subscription-telegram-handler.service';
import { SubscriptionTelegramController } from './subscription-telegram.controller';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { UserSubscription } from '../entities/user-subscription.entity';
import { Payment } from '../entities/payment.entity';
import { SubscriptionHistory } from '../entities/subscription-history.entity';
import { UsageTracking } from '../entities/usage-tracking.entity';
import { SubscriptionsService } from '../services/subscriptions.service';
import { UsageService } from '../services/usage.service';
import { PaymentService } from '../services/payment.service';
import { GooglePlayBillingService } from '../services/google-play-billing.service';

/**
 * Telegram integration for subscription system
 * Provides:
 * - Admin commands for managing subscriptions via Telegram bot
 * - Interactive keyboard interface with inline buttons
 * - Callback query handlers for button clicks
 *
 * Note: This module does NOT import SubscriptionsModule to avoid circular dependencies.
 * Instead, it directly imports required entities and services.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      UserSubscription,
      Payment,
      SubscriptionHistory,
      UsageTracking,
    ]),
  ],
  controllers: [SubscriptionTelegramController],
  providers: [
    SubscriptionsService,
    UsageService,
    PaymentService,
    GooglePlayBillingService,
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
