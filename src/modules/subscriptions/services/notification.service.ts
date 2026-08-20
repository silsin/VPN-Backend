import { Injectable, Logger } from '@nestjs/common';
import { UserSubscription } from '../entities/user-subscription.entity';
import { UsageTracking } from '../entities/usage-tracking.entity';
import { EmailService } from './email.service';
import { FcmService } from './fcm.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Notification Service
 * Handles sending notifications for subscription events (email + push FCM)
 */
@Injectable()
export class NotificationService {
  private logger = new Logger(NotificationService.name);

  constructor(
    private emailService: EmailService,
    private fcmService: FcmService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async sendExpirationReminder(subscription: UserSubscription): Promise<void> {
    try {
      const daysRemaining = subscription.getDaysRemaining();
      const user = subscription.user;

      this.logger.log(
        `Sending expiration reminder to user ${subscription.userId}: ${daysRemaining} days remaining`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${subscription.userId}`);
        return;
      }

      await this.emailService.sendExpirationReminder(
        user.email,
        user.username || 'User',
        daysRemaining,
        subscription.plan.name,
      );

      await this.fcmService.sendToUser(
        subscription.userId,
        `${subscription.plan.name} expires soon`,
        `Your subscription expires in ${daysRemaining} days. Renew now!`,
        { type: 'expiration_reminder', daysRemaining: String(daysRemaining) },
      );
    } catch (error) {
      this.logger.error(`Failed to send expiration reminder: ${error.message}`);
    }
  }

  async sendSubscriptionExpiredNotification(subscription: UserSubscription): Promise<void> {
    try {
      const user = subscription.user;

      this.logger.log(
        `Sending expired notification to user ${subscription.userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${subscription.userId}`);
        return;
      }

      await this.emailService.sendSubscriptionExpired(user.email, user.username || 'User');

      await this.fcmService.sendToUser(
        subscription.userId,
        '⏰ Subscription Expired',
        `Your ${subscription.plan.name} subscription has expired. Renew now!`,
        { type: 'subscription_expired', planId: subscription.planId },
      );
    } catch (error) {
      this.logger.error(`Failed to send expired notification: ${error.message}`);
    }
  }

  async sendDataUsageWarning(userId: string, usage: UsageTracking): Promise<void> {
    try {
      const usagePercent = usage.getUsagePercent();
      const user = await this.userRepository.findOne({ where: { id: userId } });

      this.logger.log(
        `Sending data usage warning to user ${userId}: ${usagePercent.toFixed(2)}% used`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${userId}`);
        return;
      }

      const dataLimitGB = usage.dataLimitBytes ? usage.dataLimitBytes / (1024 * 1024 * 1024) : 0;

      await this.emailService.sendDataUsageWarning(
        user.email,
        user.username || 'User',
        usagePercent,
        dataLimitGB,
      );

      await this.fcmService.sendToUser(
        userId,
        '⚠️ Data Usage Warning',
        `You've used ${usagePercent.toFixed(1)}% of your monthly data!`,
        { type: 'data_usage_warning', usagePercent: String(usagePercent.toFixed(1)) },
      );
    } catch (error) {
      this.logger.error(`Failed to send usage warning: ${error.message}`);
    }
  }

  async sendDataLimitExceededNotification(userId: string, usage: UsageTracking): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });

      this.logger.log(
        `Sending data limit exceeded notification to user ${userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${userId}`);
        return;
      }

      const dataLimitGB = usage.dataLimitBytes ? usage.dataLimitBytes / (1024 * 1024 * 1024) : 0;

      await this.emailService.sendDataLimitExceeded(user.email, user.username || 'User', dataLimitGB);

      await this.fcmService.sendToUser(
        userId,
        '🚫 Data Limit Reached',
        `You've reached your ${dataLimitGB.toFixed(0)}GB monthly limit!`,
        { type: 'data_limit_exceeded', limitGB: String(dataLimitGB.toFixed(0)) },
      );
    } catch (error) {
      this.logger.error(`Failed to send limit exceeded notification: ${error.message}`);
    }
  }

  async sendPaymentFailedNotification(
    userId: string,
    reason: string,
    retryCount: number,
    nextRetryTime?: Date,
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });

      this.logger.log(
        `Sending payment failed notification to user ${userId}: ${reason} (retry ${retryCount})`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${userId}`);
        return;
      }

      const retryDate = nextRetryTime || new Date(Date.now() + 60 * 60 * 1000);

      await this.emailService.sendPaymentFailed(
        user.email,
        user.username || 'User',
        reason,
        retryCount,
        retryDate,
      );

      await this.fcmService.sendToUser(
        userId,
        '❌ Payment Failed',
        `Your payment failed. We'll retry in ${retryCount} hour(s).`,
        { type: 'payment_failed', retryCount: String(retryCount) },
      );
    } catch (error) {
      this.logger.error(`Failed to send payment failed notification: ${error.message}`);
    }
  }

  async sendAutoRenewalSuccessNotification(subscription: UserSubscription): Promise<void> {
    try {
      const user = subscription.user;

      this.logger.log(
        `Sending auto-renewal success notification to user ${subscription.userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${subscription.userId}`);
        return;
      }

      const amount = subscription.metadata?.paymentAmount || subscription.plan.price;

      await this.emailService.sendAutoRenewalSuccess(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        amount,
        subscription.expiryDate,
      );

      await this.fcmService.sendToUser(
        subscription.userId,
        '✅ Subscription Renewed',
        `Your ${subscription.plan.name} subscription renewed!`,
        { type: 'auto_renewal_success', planName: subscription.plan.name },
      );
    } catch (error) {
      this.logger.error(`Failed to send auto-renewal success notification: ${error.message}`);
    }
  }

  async sendUpgradeSuggestion(userId: string, reason: string): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });

      this.logger.log(
        `Sending upgrade suggestion to user ${userId}: ${reason}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${userId}`);
        return;
      }
    } catch (error) {
      this.logger.error(`Failed to send upgrade suggestion: ${error.message}`);
    }
  }

  async sendAdminAlert(message: string): Promise<void> {
    try {
      this.logger.warn(`Admin Alert: ${message}`);
    } catch (error) {
      this.logger.error(`Failed to send admin alert: ${error.message}`);
    }
  }

  async sendSubscriptionSuspendedNotification(subscription: UserSubscription): Promise<void> {
    try {
      const user = subscription.user;

      this.logger.log(
        `Sending suspension notification to user ${subscription.userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${subscription.userId}`);
        return;
      }

      await this.emailService.sendSubscriptionSuspended(
        user.email,
        user.username || 'User',
        subscription.suspendedReason || 'Unknown reason',
      );

      await this.fcmService.sendToUser(
        subscription.userId,
        '⛔ Subscription Suspended',
        `Your subscription suspended: ${subscription.suspendedReason || 'Unknown reason'}`,
        { type: 'subscription_suspended' },
      );
    } catch (error) {
      this.logger.error(`Failed to send suspension notification: ${error.message}`);
    }
  }

  async sendDeviceLimitExceededNotification(userId: string, deviceLimit: number): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });

      this.logger.log(
        `Sending device limit notification to user ${userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${userId}`);
        return;
      }

      await this.emailService.sendDeviceLimitExceeded(user.email, user.username || 'User', deviceLimit);

      await this.fcmService.sendToUser(
        userId,
        '📱 Device Limit Reached',
        `You've reached your limit of ${deviceLimit} devices.`,
        { type: 'device_limit_exceeded', limit: String(deviceLimit) },
      );
    } catch (error) {
      this.logger.error(`Failed to send device limit notification: ${error.message}`);
    }
  }

  async sendPauseNotification(subscription: UserSubscription, reason: string): Promise<void> {
    try {
      const user = subscription.user;

      this.logger.log(
        `Sending pause notification to user ${subscription.userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${subscription.userId}`);
        return;
      }

      await this.emailService.sendPauseNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        reason,
      );

      await this.fcmService.sendToUser(
        subscription.userId,
        '⏸️ Subscription Paused',
        `Your ${subscription.plan.name} subscription is paused.`,
        { type: 'subscription_paused', reason },
      );
    } catch (error) {
      this.logger.error(`Failed to send pause notification: ${error.message}`);
    }
  }

  async sendResumeNotification(subscription: UserSubscription, pauseDurationDays: number): Promise<void> {
    try {
      const user = subscription.user;

      this.logger.log(
        `Sending resume notification to user ${subscription.userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${subscription.userId}`);
        return;
      }

      await this.emailService.sendResumeNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        pauseDurationDays,
        subscription.expiryDate,
      );

      await this.fcmService.sendToUser(
        subscription.userId,
        '▶️ Subscription Resumed',
        `Your ${subscription.plan.name} subscription is active again!`,
        { type: 'subscription_resumed', planName: subscription.plan.name },
      );
    } catch (error) {
      this.logger.error(`Failed to send resume notification: ${error.message}`);
    }
  }

  async sendTrialStartedNotification(subscription: UserSubscription): Promise<void> {
    try {
      const user = subscription.user;

      this.logger.log(
        `Sending trial started notification to user ${subscription.userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${subscription.userId}`);
        return;
      }

      const daysRemaining = subscription.getTrialDaysRemaining();

      await this.emailService.sendTrialStartedNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        daysRemaining,
        subscription.trialEndDate,
      );

      await this.fcmService.sendToUser(
        subscription.userId,
        'Free Trial Started 🎉',
        `Your ${daysRemaining}-day trial for ${subscription.plan.name} started!`,
        { type: 'trial_started' },
      );
    } catch (error) {
      this.logger.error(`Failed to send trial started notification: ${error.message}`);
    }
  }

  async sendTrialConvertedNotification(subscription: UserSubscription): Promise<void> {
    try {
      const user = subscription.user;

      this.logger.log(
        `Sending trial converted notification to user ${subscription.userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${subscription.userId}`);
        return;
      }

      await this.emailService.sendTrialConvertedNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        subscription.plan.price,
        subscription.expiryDate,
      );

      await this.fcmService.sendToUser(
        subscription.userId,
        '💳 Trial Converted to Paid',
        `Your trial ended. ${subscription.plan.name} subscription is active!`,
        { type: 'trial_converted' },
      );
    } catch (error) {
      this.logger.error(`Failed to send trial converted notification: ${error.message}`);
    }
  }

  async sendTrialExpiredNotification(subscription: UserSubscription): Promise<void> {
    try {
      const user = subscription.user;

      this.logger.log(
        `Sending trial expired notification to user ${subscription.userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${subscription.userId}`);
        return;
      }

      await this.emailService.sendTrialExpiredNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
      );

      await this.fcmService.sendToUser(
        subscription.userId,
        '⏰ Trial Expired',
        `Your free trial for ${subscription.plan.name} expired. Upgrade now!`,
        { type: 'trial_expired' },
      );
    } catch (error) {
      this.logger.error(`Failed to send trial expired notification: ${error.message}`);
    }
  }
}
