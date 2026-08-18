import { Module } from '@nestjs/common';
import { SubscriptionAdminCommandsService } from './subscription-admin-commands.service';
import { SubscriptionTelegramKeyboardService } from './subscription-telegram-keyboard.service';
import { SubscriptionTelegramHandlerService } from './subscription-telegram-handler.service';
import { SubscriptionTelegramController } from './subscription-telegram.controller';
import { UsersModule } from '../../users/users.module';
import { SubscriptionsService } from '../services/subscriptions.service';
import { UsageService } from '../services/usage.service';
import { PaymentService } from '../services/payment.service';
import { GooglePlayBillingService } from '../services/google-play-billing.service';
import { PayPalService } from '../services/paypal.service';
import { RefundService } from '../services/refund.service';
import { AuditLogService } from '../services/audit-log.service';
import { PauseService } from '../services/pause.service';
import { TrialService } from '../services/trial.service';
import { NotificationService } from '../services/notification.service';
import { EmailService } from '../services/email.service';
import { FcmService } from '../services/fcm.service';
import { GiftCodeService } from '../services/gift-code.service';
import { PromoCodeService } from '../services/promo-code.service';

/**
 * Telegram integration for subscription system
 * Provides:
 * - Admin commands for managing subscriptions via Telegram bot
 * - Interactive keyboard interface with inline buttons
 * - Callback query handlers for button clicks
 *
 * Note: Services are injected from SubscriptionsModule via NestJS DI
 */
@Module({
  imports: [UsersModule],
  controllers: [SubscriptionTelegramController],
  providers: [
    SubscriptionAdminCommandsService,
    SubscriptionTelegramKeyboardService,
    SubscriptionTelegramHandlerService,
    // Re-export services from parent module so they're available here
    SubscriptionsService,
    UsageService,
    PaymentService,
    GooglePlayBillingService,
    PayPalService,
    RefundService,
    AuditLogService,
    PauseService,
    TrialService,
    NotificationService,
    EmailService,
    FcmService,
    GiftCodeService,
    PromoCodeService,
  ],
  exports: [
    SubscriptionAdminCommandsService,
    SubscriptionTelegramKeyboardService,
    SubscriptionTelegramHandlerService,
    SubscriptionsService,
    UsageService,
    PaymentService,
    GooglePlayBillingService,
  ],
})
export class SubscriptionTelegramModule {}
