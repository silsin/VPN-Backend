import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSubscription, SubscriptionStatus } from '../entities/user-subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { NotificationService } from './notification.service';
import { FcmService } from './fcm.service';
import { AuditLogService } from './audit-log.service';
import { AuditLogAction } from '../entities/audit-log.entity';

export interface TrialEligibilityResult {
  eligible: boolean;
  reason?: string;
  planName?: string;
  trialDays?: number;
}

export interface TrialRedemptionResult {
  success: boolean;
  subscription: UserSubscription;
  trialEndDate: Date;
  message: string;
}

@Injectable()
export class TrialService {
  private logger = new Logger(TrialService.name);

  constructor(
    @InjectRepository(UserSubscription)
    private subscriptionRepository: Repository<UserSubscription>,
    @InjectRepository(SubscriptionPlan)
    private planRepository: Repository<SubscriptionPlan>,
    private notificationService: NotificationService,
    private fcmService: FcmService,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Check if user is eligible for trial
   */
  async checkTrialEligibility(userId: string, planId: string): Promise<TrialEligibilityResult> {
    // Get plan
    const plan = await this.planRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    // Check if plan has trial
    if (!plan.hasFreeTrial) {
      return {
        eligible: false,
        reason: 'This plan does not offer a free trial',
        planName: plan.name,
      };
    }

    // Check if user already has a subscription for this plan
    const existingSubscription = await this.subscriptionRepository.findOne({
      where: { userId, planId },
    });

    if (existingSubscription && existingSubscription.trialRedeemed) {
      // Check if 90 days have passed since trial ended
      const ninetyDaysAfterTrialEnd = new Date(existingSubscription.trialEndDate);
      ninetyDaysAfterTrialEnd.setDate(ninetyDaysAfterTrialEnd.getDate() + 90);
      
      if (new Date() < ninetyDaysAfterTrialEnd) {
        const daysUntilEligible = Math.ceil((ninetyDaysAfterTrialEnd.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return {
          eligible: false,
          reason: `You have already used the free trial for ${plan.name}. You can retry in ${daysUntilEligible} days (${ninetyDaysAfterTrialEnd.toLocaleDateString()}).`,
          planName: plan.name,
        };
      }
      // If 90 days have passed, allow redemption (continue to check other conditions)
    }

    // Check if user has any active subscription for this plan in last 90 days
    // Only check if it was created after trial would have ended
    const recentSubscription = await this.subscriptionRepository
      .createQueryBuilder('sub')
      .where('sub.userId = :userId', { userId })
      .andWhere('sub.planId = :planId', { planId })
      .andWhere('sub.trialRedeemed = :trialRedeemed', { trialRedeemed: true })
      .andWhere('sub.trialEndDate > :ninetyDaysAgo', {
        ninetyDaysAgo: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      })
      .orderBy('sub.trialEndDate', 'DESC')
      .getOne();

    if (recentSubscription) {
      const ninetyDaysAfterTrialEnd = new Date(recentSubscription.trialEndDate);
      ninetyDaysAfterTrialEnd.setDate(ninetyDaysAfterTrialEnd.getDate() + 90);
      const daysUntilEligible = Math.ceil((ninetyDaysAfterTrialEnd.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        eligible: false,
        reason: `You have already used a trial for this plan recently. You can retry in ${daysUntilEligible} days.`,
        planName: plan.name,
      };
    }

    return {
      eligible: true,
      planName: plan.name,
      trialDays: plan.trialDays,
    };
  }

  /**
   * Redeem trial for user
   */
  async redeemTrial(userId: string, planId: string): Promise<TrialRedemptionResult> {
    // Check eligibility
    const eligibility = await this.checkTrialEligibility(userId, planId);

    if (!eligibility.eligible) {
      throw new BadRequestException(eligibility.reason);
    }

    // Get plan first
    const plan = await this.planRepository.findOne({ where: { id: planId } });

    // Get or create subscription
    let subscription = await this.subscriptionRepository.findOne({
      where: { userId, planId },
      relations: ['plan', 'user'],
    });

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + plan.trialDays);

    if (subscription) {
      // Update existing
      subscription.isTrialActive = true;
      subscription.trialEndDate = trialEndDate;
      subscription.trialRedeemed = true;
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.startDate = new Date();
      subscription.expiryDate = new Date(trialEndDate); // Use copy, not reference
    } else {
      // Create new trial subscription
      subscription = new UserSubscription();
      subscription.userId = userId;
      subscription.planId = planId;
      subscription.plan = plan;
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.isAutoRenewal = true; // Auto-renew after trial
      subscription.isTrialActive = true;
      subscription.trialEndDate = new Date(trialEndDate); // Use copy
      subscription.trialRedeemed = true;
      subscription.startDate = new Date();
      subscription.expiryDate = new Date(trialEndDate); // Use copy
    }

    await this.subscriptionRepository.save(subscription);

    // Reload with relations for notification service
    subscription = await this.subscriptionRepository.findOne({
      where: { id: subscription.id },
      relations: ['plan', 'user'],
    });

    // Audit log
    await this.auditLogService.log(AuditLogAction.SUBSCRIPTION_CREATED, {
      userId,
      resource: 'subscription',
      resourceId: subscription.id,
      reason: `Free trial redeemed for ${plan.name} (${plan.trialDays} days)`,
      changes: {
        before: null,
        after: {
          planId: plan.id,
          trialActive: true,
          trialEndDate,
          autoRenewal: true,
        },
      },
    });

    // Send email notification
    await this.notificationService.sendTrialStartedNotification(subscription);

    // Send FCM push notification directly
    this.logger.log(`🚀 Sending FCM push notification for trial start`);
    const trialDays = subscription.getTrialDaysRemaining();
    await this.fcmService.sendToUser(
      userId,
      'Free Trial Started! 🎉',
      `Your ${trialDays}-day free trial for ${plan.name} has started!`,
      {
        type: 'trial_started',
        planId: plan.id,
        trialDays: String(trialDays),
      },
    );

    this.logger.log(
      `Trial redeemed for user ${userId}: ${plan.name} - ${plan.trialDays} days (expires ${trialEndDate})`,
    );

    return {
      success: true,
      subscription,
      trialEndDate,
      message: `Free trial started! Your ${plan.name} trial expires on ${trialEndDate.toLocaleDateString()}`,
    };
  }

  /**
   * Expire trial and charge user or end subscription
   */
  async expireTrialAndCharge(subscriptionId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['plan', 'user'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.isTrialActive) {
      return false; // Not a trial subscription
    }

    if (new Date() < subscription.trialEndDate) {
      return false; // Trial not expired yet
    }

    this.logger.log(`Expiring trial for subscription ${subscriptionId}`);

    if (subscription.isAutoRenewal) {
      // Convert to paid subscription
      subscription.isTrialActive = false;
      subscription.startDate = new Date();
      subscription.expiryDate = new Date();
      subscription.expiryDate.setDate(subscription.expiryDate.getDate() + subscription.plan.durationDays);

      await this.subscriptionRepository.save(subscription);

      // Send notification
      await this.notificationService.sendTrialConvertedNotification(subscription);

      this.logger.log(`Trial converted to paid subscription for user ${subscription.userId}`);
    } else {
      // End subscription
      subscription.isTrialActive = false;
      subscription.status = SubscriptionStatus.EXPIRED;

      await this.subscriptionRepository.save(subscription);

      // Send notification
      await this.notificationService.sendTrialExpiredNotification(subscription);

      this.logger.log(`Trial expired for user ${subscription.userId}`);
    }

    return true;
  }

  /**
   * Get all trials expiring today (for daily job)
   */
  async getTrialsExpiringToday(): Promise<UserSubscription[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.subscriptionRepository
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .leftJoinAndSelect('sub.user', 'user')
      .where('sub.isTrialActive = :isTrialActive', { isTrialActive: true })
      .andWhere('sub.trialEndDate >= :today', { today })
      .andWhere('sub.trialEndDate < :tomorrow', { tomorrow })
      .getMany();
  }

  /**
   * Get all expired trials (for cleanup job)
   */
  async getExpiredTrials(limit = 100): Promise<UserSubscription[]> {
    return this.subscriptionRepository
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .leftJoinAndSelect('sub.user', 'user')
      .where('sub.isTrialActive = :isTrialActive', { isTrialActive: true })
      .andWhere('sub.trialEndDate < :now', { now: new Date() })
      .orderBy('sub.trialEndDate', 'ASC')
      .limit(limit)
      .getMany();
  }
}
