import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSubscription, SubscriptionStatus } from '../entities/user-subscription.entity';
import { NotificationService } from './notification.service';
import { AuditLogService } from './audit-log.service';
import { AuditLogAction } from '../entities/audit-log.entity';

export interface PauseResult {
  subscriptionId: string;
  userId: string;
  previousStatus: SubscriptionStatus;
  newStatus: SubscriptionStatus;
  pausedAt: Date;
  pauseReason: string;
  expiryDateFrozen: Date;
}

export interface ResumeResult {
  subscriptionId: string;
  userId: string;
  previousStatus: SubscriptionStatus;
  newStatus: SubscriptionStatus;
  resumedAt: Date;
  newExpiryDate: Date;
  pauseDurationDays: number;
}

@Injectable()
export class PauseService {
  private logger = new Logger(PauseService.name);

  constructor(
    @InjectRepository(UserSubscription)
    private subscriptionRepository: Repository<UserSubscription>,
    private notificationService: NotificationService,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Pause a subscription
   * - User can pause their own subscription (self-service)
   * - Admin can pause any subscription with reason
   */
  async pauseSubscription(
    subscriptionId: string,
    userId: string,
    pauseReason: string,
    adminId?: string,
  ): Promise<PauseResult> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['user'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Only owner or admin can pause
    if (subscription.userId !== userId && !adminId) {
      throw new BadRequestException('You can only pause your own subscription');
    }

    // Can only pause active subscriptions
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot pause subscription with status: ${subscription.status}`,
      );
    }

    const previousStatus = subscription.status;
    const pausedAt = new Date();

    // Update subscription
    subscription.status = SubscriptionStatus.PAUSED;
    subscription.pausedAt = pausedAt;
    subscription.pausedReason = pauseReason;

    // Store pause metadata for later resume
    if (!subscription.metadata) {
      subscription.metadata = {};
    }
    subscription.metadata.pausedOnDate = pausedAt.toISOString();
    subscription.metadata.pauseReason = pauseReason;
    subscription.metadata.expiryDateBeforePause = subscription.expiryDate.toISOString();

    await this.subscriptionRepository.save(subscription);

    // Audit log
    await this.auditLogService.log(AuditLogAction.SUBSCRIPTION_SUSPENDED, {
      userId: subscription.userId,
      adminId,
      resource: 'subscription',
      resourceId: subscriptionId,
      reason: pauseReason,
      changes: {
        before: { status: previousStatus },
        after: { status: SubscriptionStatus.PAUSED },
      },
    });

    // Notify user
    await this.notificationService.sendPauseNotification(subscription, pauseReason);

    this.logger.log(
      `Subscription ${subscriptionId} for user ${subscription.userId} paused. Reason: ${pauseReason}`,
    );

    return {
      subscriptionId,
      userId: subscription.userId,
      previousStatus,
      newStatus: subscription.status,
      pausedAt,
      pauseReason,
      expiryDateFrozen: subscription.expiryDate,
    };
  }

  /**
   * Resume a paused subscription
   * - User can resume their own paused subscription
   * - Admin can resume any paused subscription
   * - When resumed, expiry date is extended by pause duration
   */
  async resumeSubscription(
    subscriptionId: string,
    userId: string,
    adminId?: string,
  ): Promise<ResumeResult> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['user'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Only owner or admin can resume
    if (subscription.userId !== userId && !adminId) {
      throw new BadRequestException('You can only resume your own subscription');
    }

    // Can only resume paused subscriptions
    if (subscription.status !== SubscriptionStatus.PAUSED) {
      throw new BadRequestException(
        `Cannot resume subscription with status: ${subscription.status}`,
      );
    }

    const previousStatus = subscription.status;
    const resumedAt = new Date();
    const pausedOnDate = subscription.pausedAt;

    // Calculate pause duration
    const pauseDurationMs = resumedAt.getTime() - pausedOnDate.getTime();
    const pauseDurationDays = Math.ceil(pauseDurationMs / (1000 * 60 * 60 * 24));

    // Extend expiry date by pause duration
    const originalExpiryDate = new Date(subscription.expiryDate);
    const newExpiryDate = new Date(originalExpiryDate.getTime() + pauseDurationMs);

    // Update subscription
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.expiryDate = newExpiryDate;
    subscription.pausedAt = null;
    subscription.pausedReason = null;

    // Update metadata
    if (!subscription.metadata) {
      subscription.metadata = {};
    }
    subscription.metadata.pauseHistory = subscription.metadata.pauseHistory || [];
    subscription.metadata.pauseHistory.push({
      pausedAt: pausedOnDate.toISOString(),
      resumedAt: resumedAt.toISOString(),
      durationDays: pauseDurationDays,
      reason: subscription.pausedReason,
    });
    delete subscription.metadata.pausedOnDate;
    delete subscription.metadata.pauseReason;

    await this.subscriptionRepository.save(subscription);

    // Audit log
    await this.auditLogService.log(AuditLogAction.SUBSCRIPTION_REACTIVATED, {
      userId: subscription.userId,
      adminId,
      resource: 'subscription',
      resourceId: subscriptionId,
      reason: `Resumed after ${pauseDurationDays} day pause`,
      changes: {
        before: {
          status: previousStatus,
          expiryDate: originalExpiryDate,
        },
        after: {
          status: SubscriptionStatus.ACTIVE,
          expiryDate: newExpiryDate,
        },
      },
    });

    // Notify user
    await this.notificationService.sendResumeNotification(subscription, pauseDurationDays);

    this.logger.log(
      `Subscription ${subscriptionId} for user ${subscription.userId} resumed. Extended by ${pauseDurationDays} days`,
    );

    return {
      subscriptionId,
      userId: subscription.userId,
      previousStatus,
      newStatus: subscription.status,
      resumedAt,
      newExpiryDate,
      pauseDurationDays,
    };
  }

  /**
   * Get pause history for subscription
   */
  async getPauseHistory(subscriptionId: string): Promise<any[]> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription.metadata?.pauseHistory || [];
  }

  /**
   * Check if subscription is paused
   */
  async isPaused(subscriptionId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription.status === SubscriptionStatus.PAUSED;
  }

  /**
   * Get all paused subscriptions
   */
  async getPausedSubscriptions(limit = 100): Promise<UserSubscription[]> {
    return this.subscriptionRepository.find({
      where: { status: SubscriptionStatus.PAUSED },
      relations: ['user', 'plan'],
      order: { pausedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Auto-resume subscriptions that have been paused for more than X days
   * Useful as an admin helper to automatically resume after max pause period
   */
  async autoResumeExpiredPausedSubscriptions(maxPauseDays = 30): Promise<number> {
    const pausedSubscriptions = await this.subscriptionRepository.find({
      where: { status: SubscriptionStatus.PAUSED },
    });

    let resumed = 0;

    for (const subscription of pausedSubscriptions) {
      const pausedDays = Math.ceil(
        (new Date().getTime() - subscription.pausedAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (pausedDays >= maxPauseDays) {
        try {
          await this.resumeSubscription(
            subscription.id,
            subscription.userId,
            'system', // Auto-resume by system
          );
          resumed++;
        } catch (error) {
          this.logger.error(`Failed to auto-resume subscription ${subscription.id}: ${error.message}`);
        }
      }
    }

    this.logger.log(`Auto-resumed ${resumed} subscriptions after ${maxPauseDays} day pause limit`);
    return resumed;
  }
}
