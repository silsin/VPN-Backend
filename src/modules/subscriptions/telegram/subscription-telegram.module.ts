import { Module, forwardRef } from '@nestjs/common';
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
import { DeviceToken } from '../entities/device-token.entity';
import { GiftCode } from '../entities/gift-code.entity';
import { PromoCode } from '../entities/promo-code.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { SubscriptionsService } from '../services/subscriptions.service';
import { UsageService } from '../services/usage.service';
import { PaymentService } from '../services/payment.service';
import { GooglePlayBillingService } from '../services/google-play-billing.service';
import { PayPalService } from '../services/paypal.service';
import { NotificationService } from '../services/notification.service';
import { EmailService } from '../services/email.service';
import { FcmService } from '../services/fcm.service';
import { UsersModule } from '../../users/users.module';
import { User } from '../../users/entities/user.entity';
import { GiftCodeService } from '../services/gift-code.service';
import { PromoCodeService } from '../services/promo-code.service';
import { RefundService } from '../services/refund.service';
import { AuditLogService } from '../services/audit-log.service';
import { PauseService } from '../services/pause.service';
import { TrialService } from '../services/trial.service';

/**
 * Telegram integration for subscription system
 * Provides:
 * - Admin commands for managing subscriptions via Telegram bot
 * - Interactive keyboard interface with inline buttons
 * - Callback query handlers for button clicks
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      UserSubscription,
      Payment,
      SubscriptionHistory,
      UsageTracking,
      DeviceToken,
      GiftCode,
      PromoCode,
      AuditLog,
      User,
    ]),
    UsersModule,
  ],
  controllers: [SubscriptionTelegramController],
  providers: [
    SubscriptionsService,
    UsageService,
    PaymentService,
    GooglePlayBillingService,
    PayPalService,
    NotificationService,
    EmailService,
    FcmService,
    GiftCodeService,
    PromoCodeService,
    RefundService,
    AuditLogService,
    PauseService,
    TrialService,
    SubscriptionAdminCommandsService,
    SubscriptionTelegramKeyboardService,
    SubscriptionTelegramHandlerService,
  ],
  exports: [
    SubscriptionsService,
    UsageService,
    PaymentService,
    GooglePlayBillingService,
    PayPalService,
    NotificationService,
    EmailService,
    FcmService,
    GiftCodeService,
    PromoCodeService,
    RefundService,
    AuditLogService,
    PauseService,
    TrialService,
    SubscriptionAdminCommandsService,
    SubscriptionTelegramKeyboardService,
    SubscriptionTelegramHandlerService,
  ],
})
export class SubscriptionTelegramModule {}
