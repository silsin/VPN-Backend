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
import { SubscriptionsService } from '../services/subscriptions.service';
import { UsageService } from '../services/usage.service';
import { PaymentService } from '../services/payment.service';
import { GooglePlayBillingService } from '../services/google-play-billing.service';
import { PayPalService } from '../services/paypal.service';
import { NotificationService } from '../services/notification.service';
import { EmailService } from '../services/email.service';
import { FcmService } from '../services/fcm.service';
import { UsersModule } from '../../users/users.module';

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
    SubscriptionAdminCommandsService,
    SubscriptionTelegramKeyboardService,
    SubscriptionTelegramHandlerService,
  ],
  exports: [
    SubscriptionsService,
    UsageService,
    PaymentService,
    GooglePlayBillingService,
    SubscriptionAdminCommandsService,
    SubscriptionTelegramKeyboardService,
    SubscriptionTelegramHandlerService,
  ],
})
export class SubscriptionTelegramModule {}
