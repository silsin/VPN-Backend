import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSubscription, SubscriptionStatus } from '../entities/user-subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { NotificationService } from './notification.service';
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
      return {
        eligible: false,
        reason: `You have already used the free trial for ${plan.name}. Try again after 90 days.`,
        planName: plan.name,
      };
    }

    // Check if user has any active subscription for this plan in last 90 days
    const recentSubscription = await this.subscriptionRepository
      .createQueryBuilder('sub')
      .where('sub.userId = :userId', { userId })
      .andWhere('sub.planId = :planId', { planId })
      .andWhere('sub.createdAt > :ninetyDaysAgo', {
        ninetyDaysAgo: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      })
      .orderBy('sub.createdAt', 'DESC')
      .getOne();

    if (recentSubscription) {
      return {
        eligible: false,
        reason: 'You have already used a trial for this plan recently. Wait 90 days before trying again.',
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

    // Get or create subscription
    let subscription = await this.subscriptionRepository.findOne({
      where: { userId, planId },
      relations: ['plan', 'user'],
    });

    const plan = await this.planRepository.findOne({ where: { id: planId } });

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + plan.trialDays);

    if (subscription) {
      // Update existing
      subscription.isTrialActive = true;
      subscription.trialEndDate = trialEndDate;
      subscription.trialRedeemed = true;
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.startDate = new Date();
      subscription.expiryDate = trialEndDate;
    } else {
      // Create new trial subscription
      subscription = new UserSubscription();
      subscription.userId = userId;
      subscription.planId = planId;
      subscription.plan = plan;
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.isAutoRenewal = true; // Auto-renew after trial
      subscription.isTrialActive = true;
      subscription.trialEndDate = trialEndDate;
      subscription.trialRedeemed = true;
      subscription.startDate = new Date();
      subscription.expiryDate = trialEndDate;
    }

    await this.subscriptionRepository.save(subscription);

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

    // Send notification
    await this.notificationService.sendTrialStartedNotification(subscription);

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
