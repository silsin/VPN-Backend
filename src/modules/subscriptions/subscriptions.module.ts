import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

// Controllers
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsAdminController } from './subscriptions-admin.controller';

// Services
import { SubscriptionsService } from './services/subscriptions.service';
import { PaymentService } from './services/payment.service';
import { UsageService } from './services/usage.service';
import { NotificationService } from './services/notification.service';
import { SubscriptionJobService } from './services/subscription-job.service';
import { GooglePlayBillingService } from './services/google-play-billing.service';

// Telegram Module
import { SubscriptionTelegramModule } from './telegram/subscription-telegram.module';

// Entities
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { Payment } from './entities/payment.entity';
import { SubscriptionHistory } from './entities/subscription-history.entity';
import { UsageTracking } from './entities/usage-tracking.entity';

// Processors
import { SubscriptionProcessor } from './jobs/subscription.processor';

// Seeds
import { SubscriptionPlansSeeder } from './seeds/subscription-plans.seed';

// Guards
import { SubscriptionGuard } from './guards/subscription.guard';
import { FeatureAccessGuard } from './guards/feature-access.guard';
import { DeviceLimitGuard } from './guards/device-limit.guard';

// User module for user service
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      UserSubscription,
      Payment,
      SubscriptionHistory,
      UsageTracking,
    ]),
    ConfigModule,
    BullModule.registerQueue(
      {
        name: 'subscription-jobs',
      },
      {
        name: 'notifications',
      },
    ),
    UsersModule,
    SubscriptionTelegramModule,
  ],
  controllers: [SubscriptionsController, SubscriptionsAdminController],
  providers: [
    SubscriptionsService,
    PaymentService,
    UsageService,
    NotificationService,
    SubscriptionJobService,
    GooglePlayBillingService,
    SubscriptionProcessor,
    SubscriptionPlansSeeder,
    SubscriptionGuard,
    FeatureAccessGuard,
    DeviceLimitGuard,
  ],
  exports: [
    SubscriptionsService,
    UsageService,
    PaymentService,
    SubscriptionGuard,
    FeatureAccessGuard,
    DeviceLimitGuard,
    GooglePlayBillingService,
    SubscriptionTelegramModule,
  ],
})
export class SubscriptionsModule implements OnModuleInit {
  constructor(private seeder: SubscriptionPlansSeeder) {}

  async onModuleInit() {
    // Seed default plans on app startup
    await this.seeder.seed();
  }
}
