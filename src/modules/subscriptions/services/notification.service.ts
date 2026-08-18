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

      // Send push notification
      await this.fcmService.sendExpirationReminder(
        subscription.userId,
        daysRemaining,
        subscription.plan.name,
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

      // Send push notification
      await this.fcmService.sendSubscriptionExpired(subscription.userId);
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

      // Send push notification
      await this.fcmService.sendDataUsageWarning(userId, usagePercent);
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

      // Send push notification
      await this.fcmService.sendDataLimitExceeded(userId);
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

      // Send push notification
      await this.fcmService.sendPaymentFailed(userId, retryCount);
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

      // Send push notification
      await this.fcmService.sendAutoRenewalSuccess(subscription.userId, subscription.plan.name);
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

      // Send push notification (using device limit as a template)
      await this.fcmService.sendToUser(
        subscription.userId,
        'Subscription Suspended',
        `Your subscription has been suspended: ${subscription.suspendedReason || 'Unknown reason'}`,
        { type: 'subscription_suspended' },
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

      // Send push notification
      await this.fcmService.sendDeviceLimitExceeded(userId);
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

      // Send push notification
      await this.fcmService.sendToUser(
        subscription.userId,
        'Subscription Paused',
        `Your ${subscription.plan.name} subscription has been paused. Your expiry date is frozen until you resume.`,
        { type: 'subscription_paused' },
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
}
