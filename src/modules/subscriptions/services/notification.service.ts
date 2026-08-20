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
 * Handles sending notifications for subscription events (email + push)
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

  /**
   * Send subscription expiring reminder
   */
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

      // Send email
      await this.emailService.sendExpirationReminder(
        user.email,
        user.username || 'User',
        daysRemaining,
        subscription.plan.name,
      );

      // Send push notification directly
      this.logger.log(`📲 Sending expiration reminder FCM to ${subscription.userId}`);
      await this.fcmService.sendToUser(
        subscription.userId,
        `${subscription.plan.name} expires soon`,
        `Your subscription expires in ${daysRemaining} days. Renew now to avoid interruptions!`,
        { type: 'expiration_reminder', daysRemaining: String(daysRemaining) },
      );
    } catch (error) {
      this.logger.error(`Failed to send expiration reminder: ${error.message}`);
    }
  }

  /**
   * Send subscription expired notification
   */
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

      // Send email
      await this.emailService.sendSubscriptionExpired(user.email, user.username || 'User');

      // Send push notification directly
      this.logger.log(`📲 Sending subscription expired FCM to ${subscription.userId}`);
      await this.fcmService.sendToUser(
        subscription.userId,
        '⏰ Subscription Expired',
        `Your ${subscription.plan.name} subscription has expired. Renew now to reconnect!`,
        { type: 'subscription_expired', planId: subscription.planId },
      );
    } catch (error) {
      this.logger.error(`Failed to send expired notification: ${error.message}`);
    }
  }

  /**
   * Send data usage warning
   */
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

      // Send email
      await this.emailService.sendDataUsageWarning(
        user.email,
        user.username || 'User',
        usagePercent,
        dataLimitGB,
      );

      // Send push notification directly
      this.logger.log(`📲 Sending data usage warning FCM to ${userId}`);
      await this.fcmService.sendToUser(
        userId,
        '⚠️ Data Usage Warning',
        `You've used ${usagePercent.toFixed(1)}% of your monthly data limit!`,
        { type: 'data_usage_warning', usagePercent: String(usagePercent.toFixed(1)) },
      );
    } catch (error) {
      this.logger.error(`Failed to send usage warning: ${error.message}`);
    }
  }

  /**
   * Send data limit exceeded notification
   */
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

      // Send email
      await this.emailService.sendDataLimitExceeded(user.email, user.username || 'User', dataLimitGB);

      // Send push notification directly
      this.logger.log(`📲 Sending data limit exceeded FCM to ${userId}`);
      await this.fcmService.sendToUser(
        userId,
        '🚫 Data Limit Reached',
        `You've reached your ${dataLimitGB.toFixed(0)}GB monthly data limit. Upgrade to continue!`,
        { type: 'data_limit_exceeded', limitGB: String(dataLimitGB.toFixed(0)) },
      );
    } catch (error) {
      this.logger.error(`Failed to send limit exceeded notification: ${error.message}`);
    }
  }

  /**
   * Send payment failed notification
   */
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

      const retryDate = nextRetryTime || new Date(Date.now() + 60 * 60 * 1000); // Default 1 hour

      // Send email
      await this.emailService.sendPaymentFailed(
        user.email,
        user.username || 'User',
        reason,
        retryCount,
        retryDate,
      );

      // Send push notification directly
      this.logger.log(`📲 Sending payment failed FCM to ${userId}`);
      await this.fcmService.sendToUser(
        userId,
        '❌ Payment Failed',
        `Your subscription payment failed. We'll retry in ${retryCount} hour(s).`,
        { type: 'payment_failed', retryCount: String(retryCount) },
      );
    } catch (error) {
      this.logger.error(`Failed to send payment failed notification: ${error.message}`);
    }
  }

  /**
   * Send auto-renewal successful notification
   */
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

      // Get payment amount from metadata or plan price
      const amount = subscription.metadata?.paymentAmount || subscription.plan.price;

      // Send email
      await this.emailService.sendAutoRenewalSuccess(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        amount,
        subscription.expiryDate,
      );

      // Send push notification directly
      this.logger.log(`📲 Sending auto-renewal success FCM to ${subscription.userId}`);
      await this.fcmService.sendToUser(
        subscription.userId,
        '✅ Subscription Renewed',
        `Your ${subscription.plan.name} subscription has been renewed. Valid until ${subscription.expiryDate.toLocaleDateString()}.`,
        { type: 'auto_renewal_success', planName: subscription.plan.name },
      );
    } catch (error) {
      this.logger.error(`Failed to send auto-renewal success notification: ${error.message}`);
    }
  }

  /**
   * Send upgrade suggestion
   */
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

      // Could implement a specialized email template here
      // For now, just log it
    } catch (error) {
      this.logger.error(`Failed to send upgrade suggestion: ${error.message}`);
    }
  }

  /**
   * Send admin alert
   */
  async sendAdminAlert(message: string): Promise<void> {
    try {
      this.logger.warn(`Admin Alert: ${message}`);

      // Could send to admin email here if needed
      // For now, just log it
    } catch (error) {
      this.logger.error(`Failed to send admin alert: ${error.message}`);
    }
  }

  /**
   * Send subscription suspended notification
   */
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

      // Send email
      await this.emailService.sendSubscriptionSuspended(
        user.email,
        user.username || 'User',
        subscription.suspendedReason || 'Unknown reason',
      );

      // Send push notification directly
      this.logger.log(`📲 Sending suspension FCM to ${subscription.userId}`);
      await this.fcmService.sendToUser(
        subscription.userId,
        '⛔ Subscription Suspended',
        `Your subscription has been suspended: ${subscription.suspendedReason || 'Unknown reason'}`,
        { type: 'subscription_suspended', reason: subscription.suspendedReason },
      );
    } catch (error) {
      this.logger.error(`Failed to send suspension notification: ${error.message}`);
    }
  }

  /**
   * Send device limit exceeded notification
   */
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

      // Send email
      await this.emailService.sendDeviceLimitExceeded(user.email, user.username || 'User', deviceLimit);

      // Send push notification directly
      this.logger.log(`📲 Sending device limit FCM to ${userId}`);
      await this.fcmService.sendToUser(
        userId,
        '📱 Device Limit Reached',
        `You've reached your limit of ${deviceLimit} devices. Remove a device to continue.`,
        { type: 'device_limit_exceeded', limit: String(deviceLimit) },
      );
    } catch (error) {
      this.logger.error(`Failed to send device limit notification: ${error.message}`);
    }
  }

  /**
   * Send subscription paused notification
   */
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

      // Send email
      await this.emailService.sendPauseNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        reason,
      );

      // Send push notification directly
      this.logger.log(`📲 Sending pause FCM to ${subscription.userId}`);
      await this.fcmService.sendToUser(
        subscription.userId,
        '⏸️ Subscription Paused',
        `Your ${subscription.plan.name} subscription has been paused. Your expiry date is frozen until you resume.`,
        { type: 'subscription_paused', reason },
      );
    } catch (error) {
      this.logger.error(`Failed to send pause notification: ${error.message}`);
    }
  }

  /**
   * Send subscription resumed notification
   */
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

      // Send email
      await this.emailService.sendResumeNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        pauseDurationDays,
        subscription.expiryDate,
      );

      // Send push notification directly
      this.logger.log(`📲 Sending resume FCM to ${subscription.userId}`);
      await this.fcmService.sendToUser(
        subscription.userId,
        '▶️ Subscription Resumed',
        `Your ${subscription.plan.name} subscription has been resumed. Expires on ${subscription.expiryDate.toLocaleDateString()}.`,
        { type: 'subscription_resumed', planName: subscription.plan.name },
      );
    } catch (error) {
      this.logger.error(`Failed to send resume notification: ${error.message}`);
    }
  }

      // Send email
      await this.emailService.sendResumeNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        pauseDurationDays,
        subscription.expiryDate,
      );

      // Send push notification
      await this.fcmService.sendToUser(
        subscription.userId,
        'Subscription Resumed',
        `Your ${subscription.plan.name} subscription has been resumed. Your expiry date has been extended by ${pauseDurationDays} days.`,
        { type: 'subscription_resumed' },
      );
    } catch (error) {
      this.logger.error(`Failed to send resume notification: ${error.message}`);
    }
  }

  /**
   * Send trial started notification
   */
  async sendTrialStartedNotification(subscription: UserSubscription): Promise<void> {
    try {
      this.logger.log(`📨 sendTrialStartedNotification called for user ${subscription.userId}`);
      
      const user = subscription.user;

      this.logger.log(
        `Sending trial started notification to user ${subscription.userId}`,
      );

      if (!user?.email) {
        this.logger.warn(`No email found for user ${subscription.userId}`);
        return;
      }

      const daysRemaining = subscription.getTrialDaysRemaining();
      this.logger.debug(`Trial days remaining: ${daysRemaining}`);

      // Send email
      this.logger.log(`📧 Sending email notification to ${user.email}`);
      await this.emailService.sendTrialStartedNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        daysRemaining,
        subscription.trialEndDate,
      );

      // Send push notification
      this.logger.log(`📲 Calling FCM service for user ${subscription.userId}`);
      const result = await this.fcmService.sendToUser(
        subscription.userId,
        'Free Trial Started',
        `Your free ${daysRemaining}-day trial for ${subscription.plan.name} has started!`,
        { type: 'trial_started' },
      );
      this.logger.log(`📲 FCM service returned: ${result} devices notified`);
    } catch (error) {
      this.logger.error(`❌ Failed to send trial started notification: ${error.message}`, error.stack);
    }
  }

  /**
   * Send trial converted to paid notification
   */
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

      // Send email
      await this.emailService.sendTrialConvertedNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
        subscription.plan.price,
        subscription.expiryDate,
      );

      // Send push notification directly
      this.logger.log(`📲 Sending trial converted FCM to ${subscription.userId}`);
      await this.fcmService.sendToUser(
        subscription.userId,
        '💳 Trial Converted to Paid',
        `Your trial has ended. Your ${subscription.plan.name} subscription is now active with auto-renewal.`,
        { type: 'trial_converted', planName: subscription.plan.name },
      );
    } catch (error) {
      this.logger.error(`Failed to send trial converted notification: ${error.message}`);
    }
  }

  /**
   * Send trial expired notification
   */
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

      // Send email
      await this.emailService.sendTrialExpired(
        user.email,
        user.username || 'User',
        subscription.plan.name,
      );

      // Send push notification directly
      this.logger.log(`📲 Sending trial expired FCM to ${subscription.userId}`);
      await this.fcmService.sendToUser(
        subscription.userId,
        '⏰ Trial Expired',
        `Your free trial for ${subscription.plan.name} has expired. Upgrade to keep your VPN access!`,
        { type: 'trial_expired', planName: subscription.plan.name },
      );
    } catch (error) {
      this.logger.error(`Failed to send trial expired notification: ${error.message}`);
    }
  }
        subscription.expiryDate,
      );

      // Send push notification
      await this.fcmService.sendToUser(
        subscription.userId,
        'Trial Ended - Subscription Active',
        `Your free trial for ${subscription.plan.name} has ended. Your subscription is now active!`,
        { type: 'trial_converted' },
      );
    } catch (error) {
      this.logger.error(`Failed to send trial converted notification: ${error.message}`);
    }
  }

  /**
   * Send trial expired notification
   */
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

      // Send email
      await this.emailService.sendTrialExpiredNotification(
        user.email,
        user.username || 'User',
        subscription.plan.name,
      );

      // Send push notification
      await this.fcmService.sendToUser(
        subscription.userId,
        'Free Trial Ended',
        `Your free trial for ${subscription.plan.name} has expired. Subscribe to continue using VPN.`,
        { type: 'trial_expired' },
      );
    } catch (error) {
      this.logger.error(`Failed to send trial expired notification: ${error.message}`);
    }
  }
}
