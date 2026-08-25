import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, LessThan, LessThanOrEqual } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { UserSubscription, SubscriptionStatus } from '../entities/user-subscription.entity';
import { SubscriptionHistory, SubscriptionAction, ActionReason } from '../entities/subscription-history.entity';
import { Payment, PaymentStatus, PaymentMethod } from '../entities/payment.entity';
import { CreatePlanDto } from '../dto/create-plan.dto';
import { UsersService } from '../../users/users.service';
import { GooglePlayBillingV2Service } from './google-play-billing-v2.service';

@Injectable()
export class SubscriptionsService {
  private logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private plansRepository: Repository<SubscriptionPlan>,
    @InjectRepository(UserSubscription)
    private userSubscriptionsRepository: Repository<UserSubscription>,
    @InjectRepository(SubscriptionHistory)
    private historyRepository: Repository<SubscriptionHistory>,
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    private usersService: UsersService,
    private googlePlayBillingV2Service: GooglePlayBillingV2Service,
  ) {}

  // ============ PLAN MANAGEMENT ============

  /**
   * Create a new subscription plan (Admin only)
   */
  async createPlan(createPlanDto: CreatePlanDto, adminId: string | null): Promise<SubscriptionPlan> {
    const existingPlan = await this.plansRepository.findOne({
      where: { name: createPlanDto.name },
    });

    if (existingPlan) {
      throw new ConflictException(`Plan with name "${createPlanDto.name}" already exists`);
    }

    const plan = this.plansRepository.create({
      ...createPlanDto,
      createdBy: adminId,
      updatedBy: adminId,
    });

    const savedPlan = await this.plansRepository.save(plan);
    
    // Convert price from string to number (DECIMAL type issue)
    if (typeof savedPlan.price === 'string') {
      savedPlan.price = parseFloat(savedPlan.price);
    }
    
    return savedPlan;
  }

  /**
   * Get all subscription plans
   */
  async getAllPlans(onlyActive: boolean = false): Promise<SubscriptionPlan[]> {
    const query = this.plansRepository.createQueryBuilder('plan');

    if (onlyActive) {
      query.where('plan.isActive = :isActive', { isActive: true });
    }

    const plans = await query.orderBy('plan.displayOrder', 'ASC').getMany();
    
    // Convert price from string to number (DECIMAL type issue)
    plans.forEach(p => {
      if (typeof p.price === 'string') {
        p.price = parseFloat(p.price);
      }
    });
    
    return plans;
  }

  /**
   * Get plan by ID
   */
  async getPlanById(planId: string): Promise<SubscriptionPlan> {
    const plan = await this.plansRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException(`Plan with ID ${planId} not found`);
    }

    if (typeof plan.price === 'string') {
      plan.price = parseFloat(plan.price);
    }

    return plan;
  }

  /**
   * Get free plan (default)
   */
  async getFreePlan(): Promise<SubscriptionPlan> {
    const plan = await this.plansRepository.findOne({
      where: { name: 'Free' },
    });

    if (!plan) {
      throw new NotFoundException('Free plan not found');
    }

    return plan;
  }

  /**
   * Update subscription plan (Admin only)
   */
  async updatePlan(planId: string, updateData: any, adminId: string): Promise<SubscriptionPlan> {
    const plan = await this.getPlanById(planId);

    Object.assign(plan, updateData);
    plan.updatedBy = adminId;

    return this.plansRepository.save(plan);
  }

  /**
   * Deactivate plan (Admin only)
   */
  async deactivatePlan(planId: string, adminId: string): Promise<void> {
    const plan = await this.getPlanById(planId);
    plan.isActive = false;
    plan.updatedBy = adminId;
    await this.plansRepository.save(plan);
  }

  // ============ USER SUBSCRIPTION MANAGEMENT ============

  /**
   * Get user's current subscription.
   * Prefers ACTIVE rows; falls back to the most-recently-updated row so
   * callers always see the most relevant record even if status is expired.
   */
  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    // Try active first
    const active = await this.userSubscriptionsRepository.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
    });
    if (active) return active;

    // Fallback: return whatever row exists (expired, cancelled, etc.)
    // so callers can still display "your subscription ended" info.
    return this.userSubscriptionsRepository.findOne({
      where: { userId },
      relations: ['plan'],
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * Create a new subscription for user
   */
  async createSubscription(
    userId: string,
    planId: string,
    paymentId: string,
    isAutoRenewal: boolean = false,
    metadata: any = {},
  ): Promise<UserSubscription> {
    // Check if user already has active subscription
    const existingSub = await this.userSubscriptionsRepository.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });

    if (existingSub) {
      throw new ConflictException('User already has an active subscription');
    }

    const plan = await this.getPlanById(planId);

    const now = new Date();
    const expiryDate = new Date(now);

    // Calculate expiry date
    if (plan.durationDays) {
      expiryDate.setDate(expiryDate.getDate() + plan.durationDays);
    } else {
      // Free plan - set expiry to far future
      expiryDate.setFullYear(expiryDate.getFullYear() + 100);
    }

    const subscription = this.userSubscriptionsRepository.create({
      userId,
      planId,
      status: SubscriptionStatus.ACTIVE,
      startDate: now,
      expiryDate,
      isAutoRenewal,
      metadata: {
        ...metadata,
        paymentId,
      },
    });

    const saved = await this.userSubscriptionsRepository.save(subscription);

    // Log history
    await this.logSubscriptionHistory({
      userId,
      planId,
      action: SubscriptionAction.PURCHASED,
      startDate: now,
      expiryDate,
      reason: ActionReason.USER_REQUEST,
      paymentId,
    });

    // Update user cache
    await this.updateUserSubscriptionCache(userId);

    return saved;
  }

  /**
   * Upgrade user subscription to a new plan
   */
  async upgradeSubscription(
    userId: string,
    newPlanId: string,
    paymentId: string,
  ): Promise<UserSubscription> {
    const currentSub = await this.getUserSubscription(userId);
    if (!currentSub) {
      throw new NotFoundException('User has no active subscription');
    }

    const newPlan = await this.getPlanById(newPlanId);

    // Check if it's actually an upgrade (higher price)
    if (newPlan.price <= currentSub.plan.price) {
      throw new BadRequestException('New plan must be more expensive than current plan. Use downgrade instead.');
    }

    const oldPlanId = currentSub.planId;
    const now = new Date();
    const expiryDate = new Date(now.getTime() + newPlan.durationDays * 24 * 60 * 60 * 1000);

    // Update subscription — clear the in-memory relation object so TypeORM
    // uses planId (not the stale plan object) to write the FK.
    currentSub.plan = null;
    currentSub.planId = newPlanId;
    currentSub.expiryDate = expiryDate;
    currentSub.startDate = now;

    const updated = await this.userSubscriptionsRepository.save(currentSub);

    // Log history
    await this.logSubscriptionHistory({
      userId,
      planId: newPlanId,
      previousPlanId: oldPlanId,
      action: SubscriptionAction.UPGRADED,
      startDate: now,
      expiryDate,
      reason: ActionReason.USER_REQUEST,
      paymentId,
    });

    // Update user cache
    await this.updateUserSubscriptionCache(userId);

    return updated;
  }

  /**
   * Downgrade user subscription to a new plan
   */
  async downgradeSubscription(
    userId: string,
    newPlanId: string,
  ): Promise<UserSubscription> {
    const currentSub = await this.getUserSubscription(userId);
    if (!currentSub) {
      throw new NotFoundException('User has no active subscription');
    }

    const newPlan = await this.getPlanById(newPlanId);

    const oldPlanId = currentSub.planId;
    const now = new Date();

    // Downgrade takes effect immediately — clear the in-memory relation object
    // so TypeORM uses planId (not the stale plan object) to write the FK.
    currentSub.plan = null;
    currentSub.planId = newPlanId;

    const updated = await this.userSubscriptionsRepository.save(currentSub);

    // Log history
    await this.logSubscriptionHistory({
      userId,
      planId: newPlanId,
      previousPlanId: oldPlanId,
      action: SubscriptionAction.DOWNGRADED,
      startDate: currentSub.startDate,
      expiryDate: currentSub.expiryDate,
      reason: ActionReason.USER_REQUEST,
    });

    // Update user cache
    await this.updateUserSubscriptionCache(userId);

    return updated;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    userId: string,
    reason?: string,
    cancelledByAdminId?: string,
  ): Promise<UserSubscription> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('User has no subscription');
    }

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.cancelledAt = new Date();
    subscription.cancelledReason = reason || 'User requested';

    const updated = await this.userSubscriptionsRepository.save(subscription);

    // Log history
    await this.logSubscriptionHistory({
      userId,
      planId: subscription.planId,
      action: SubscriptionAction.CANCELLED,
      startDate: subscription.startDate,
      expiryDate: subscription.expiryDate,
      reason: cancelledByAdminId ? ActionReason.ADMIN_ACTION : ActionReason.USER_REQUEST,
      notes: reason,
      createdByUserId: cancelledByAdminId,
    });

    // Update user cache
    await this.updateUserSubscriptionCache(userId);

    return updated;
  }

  /**
   * Renew subscription (auto-renewal or manual)
   */
  async renewSubscription(
    userId: string,
    paymentId?: string,
  ): Promise<UserSubscription> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('User has no subscription');
    }

    const plan = subscription.plan;
    const now = new Date();
    const newExpiryDate = new Date(subscription.expiryDate);

    if (plan.durationDays) {
      newExpiryDate.setDate(newExpiryDate.getDate() + plan.durationDays);
    }

    subscription.expiryDate = newExpiryDate;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.failedRenewalAttempts = 0;
    subscription.lastRenewalAttemptAt = now;

    const updated = await this.userSubscriptionsRepository.save(subscription);

    // Log history
    await this.logSubscriptionHistory({
      userId,
      planId: subscription.planId,
      oldExpiryDate: subscription.expiryDate,
      action: SubscriptionAction.RENEWED,
      startDate: now,
      expiryDate: newExpiryDate,
      reason: ActionReason.AUTO_RENEWAL,
      paymentId,
    });

    // Update user cache
    await this.updateUserSubscriptionCache(userId);

    return updated;
  }

  /**
   * Extend subscription by N days
   */
  async extendSubscription(
    userId: string,
    days: number,
    paymentId?: string,
  ): Promise<UserSubscription> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('User has no subscription');
    }

    const oldExpiryDate = new Date(subscription.expiryDate);
    const newExpiryDate = new Date(oldExpiryDate.getTime() + days * 24 * 60 * 60 * 1000);

    subscription.expiryDate = newExpiryDate;

    const updated = await this.userSubscriptionsRepository.save(subscription);

    // Log history
    await this.logSubscriptionHistory({
      userId,
      planId: subscription.planId,
      oldExpiryDate,
      action: SubscriptionAction.EXTENDED,
      startDate: subscription.startDate,
      expiryDate: newExpiryDate,
      reason: ActionReason.USER_REQUEST,
      paymentId,
      notes: `Extended by ${days} days`,
    });

    // Update user cache
    await this.updateUserSubscriptionCache(userId);

    return updated;
  }

  /**
   * Toggle auto-renewal
   */
  async toggleAutoRenewal(userId: string, enabled: boolean): Promise<UserSubscription> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('User has no subscription');
    }

    subscription.isAutoRenewal = enabled;
    return this.userSubscriptionsRepository.save(subscription);
  }

  // ============ SUBSCRIPTION HISTORY ============

  /**
   * Log subscription history record
   */
  async logSubscriptionHistory(data: any): Promise<SubscriptionHistory> {
    const history = this.historyRepository.create(data);
    const result = await this.historyRepository.save(history);
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Get subscription history for user
   */
  async getUserSubscriptionHistory(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: SubscriptionHistory[]; total: number }> {
    const [data, total] = await this.historyRepository.findAndCount({
      where: { userId },
      relations: ['plan', 'previousPlan'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }

  // ============ PAYMENT HISTORY ============

  /**
   * Get payment history for user
   */
  async getUserPayments(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Payment[]; total: number }> {
    const [data, total] = await this.paymentsRepository.findAndCount({
      where: { userId },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }

  // ============ SUBSCRIPTION STATUS CHECKS ============

  /**
   * Check if user's subscription is still active
   */
  async isSubscriptionActive(userId: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) return false;
    return subscription.isActive();
  }

  /**
   * Check if user has specific feature
   */
  async userHasFeature(userId: string, feature: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription || !subscription.isActive()) return false;
    return subscription.hasFeature(feature);
  }

  /**
   * Get subscriptions expiring within N days
   */
  async getExpiringSubscriptions(days: number): Promise<UserSubscription[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.userSubscriptionsRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        expiryDate: LessThanOrEqual(futureDate),
      },
      relations: ['user', 'plan'],
      order: { expiryDate: 'ASC' },
    });
  }

  /**
   * Get expired subscriptions that haven't been processed yet
   */
  async getExpiredSubscriptions(): Promise<UserSubscription[]> {
    const now = new Date();
    return this.userSubscriptionsRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        expiryDate: LessThan(now),
      },
      relations: ['user', 'plan'],
    });
  }

  /**
   * Get subscriptions with failed auto-renewal attempts
   */
  async getFailedRenewalSubscriptions(maxAttempts: number = 3): Promise<UserSubscription[]> {
    return this.userSubscriptionsRepository
      .createQueryBuilder('sub')
      .where('sub.isAutoRenewal = :true', { true: true })
      .andWhere('sub.failedRenewalAttempts > 0', {})
      .andWhere('sub.failedRenewalAttempts < :maxAttempts', { maxAttempts })
      .orderBy('sub.lastRenewalAttemptAt', 'ASC')
      .getMany();
  }

  /**
   * Update subscription status cache for user
   */
  async updateUserSubscriptionCache(userId: string): Promise<void> {
    // This would call the database function or update denormalized columns
    // For now, we'll just refresh the relation
    const subscription = await this.getUserSubscription(userId);
    const user = await this.usersService.findOne(userId);

    if (subscription && subscription.isActive()) {
      user.subscriptionStatus = 'active';
      user.currentPlanId = subscription.planId;
      user.subscriptionExpiryDate = subscription.expiryDate;
      user.daysRemaining = subscription.getDaysRemaining();
      user.maxConcurrentDevices = subscription.plan.maxDevices;
      user.maxDataPerMonth = subscription.plan.dataLimitGb
        ? subscription.plan.dataLimitGb * 1024 * 1024 * 1024
        : null;
    } else {
      user.subscriptionStatus = 'free';
      user.currentPlanId = null;
      user.subscriptionExpiryDate = null;
      user.daysRemaining = 0;
      user.maxConcurrentDevices = 1;
      user.maxDataPerMonth = 500 * 1024 * 1024 * 1024; // 500GB free
    }

    user.lastSubscriptionCheckAt = new Date();
    await this.usersService.update(user.id, user);
  }

  // ============ ADMIN STATISTICS ============

  /**
   * Get subscription statistics for admin dashboard
   */
  async getSubscriptionStats(): Promise<any> {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const [
      totalActive,
      totalExpired,
      totalCancelled,
      byPlan,
      monthRevenue,
      yearRevenue,
    ] = await Promise.all([
      this.userSubscriptionsRepository.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.userSubscriptionsRepository.count({ where: { status: SubscriptionStatus.EXPIRED } }),
      this.userSubscriptionsRepository.count({ where: { status: SubscriptionStatus.CANCELLED } }),
      this.userSubscriptionsRepository
        .createQueryBuilder('sub')
        .select('sub.planId')
        .addSelect('plan.name')
        .addSelect('COUNT(*)', 'count')
        .leftJoin('sub.plan', 'plan')
        .groupBy('sub.planId, plan.name')
        .getRawMany(),
      this.paymentsRepository
        .createQueryBuilder('p')
        .select('SUM(p.amount)', 'total')
        .where('p.status = :status', { status: PaymentStatus.COMPLETED })
        .andWhere('p.createdAt >= :date', { date: monthAgo })
        .getRawOne(),
      this.paymentsRepository
        .createQueryBuilder('p')
        .select('SUM(p.amount)', 'total')
        .where('p.status = :status', { status: PaymentStatus.COMPLETED })
        .andWhere('p.createdAt >= :date', { date: yearAgo })
        .getRawOne(),
    ]);

    return {
      totalActive,
      totalExpired,
      totalCancelled,
      byPlan,
      monthRevenue: parseFloat(monthRevenue?.total || 0),
      yearRevenue: parseFloat(yearRevenue?.total || 0),
      mrr: (parseFloat(monthRevenue?.total || 0) / 30) * 30, // Approximate MRR
      arr: parseFloat(yearRevenue?.total || 0),
    };
  }

  /**
   * Get subscriptions expiring soon for admin alerts
   */
  async getExpiringSubscriptionsForAdmin(days: number = 7): Promise<any[]> {
    const subscriptions = await this.getExpiringSubscriptions(days);

    return subscriptions.map((sub) => ({
      userId: sub.userId,
      email: sub.user?.email,
      username: sub.user?.username,
      plan: sub.plan.name,
      expiryDate: sub.expiryDate,
      daysRemaining: sub.getDaysRemaining(),
      autoRenewal: sub.isAutoRenewal,
    }));
  }

  // ============ SUSPENSION & REACTIVATION ============

  /**
   * Suspend a subscription (admin action)
   */
  async suspendSubscription(
    userId: string,
    reason: string,
    adminId: string,
  ): Promise<UserSubscription> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('User has no subscription');
    }

    if (subscription.status === SubscriptionStatus.SUSPENDED) {
      throw new BadRequestException('Subscription is already suspended');
    }

    subscription.status = SubscriptionStatus.SUSPENDED;
    subscription.suspendedAt = new Date();
    subscription.suspendedReason = reason;
    subscription.suspendedByAdminId = adminId;

    const updated = await this.userSubscriptionsRepository.save(subscription);

    // Log history
    await this.logSubscriptionHistory({
      userId,
      planId: subscription.planId,
      action: SubscriptionAction.SUSPENDED,
      startDate: subscription.startDate,
      expiryDate: subscription.expiryDate,
      reason: ActionReason.ADMIN_ACTION,
      notes: reason,
      createdByUserId: adminId,
    });

    // Update user cache - this will mark them as free tier
    await this.updateUserSubscriptionCache(userId);

    return updated;
  }

  /**
   * Reactivate a suspended subscription
   */
  async reactivateSubscription(
    userId: string,
    adminId: string,
  ): Promise<UserSubscription> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('User has no subscription');
    }

    if (subscription.status !== SubscriptionStatus.SUSPENDED) {
      throw new BadRequestException('Subscription is not suspended');
    }

    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.suspendedAt = null;
    subscription.suspendedReason = null;
    subscription.suspendedByAdminId = null;

    const updated = await this.userSubscriptionsRepository.save(subscription);

    // Log history
    await this.logSubscriptionHistory({
      userId,
      planId: subscription.planId,
      action: SubscriptionAction.REACTIVATED,
      startDate: subscription.startDate,
      expiryDate: subscription.expiryDate,
      reason: ActionReason.ADMIN_ACTION,
      notes: 'Subscription reactivated by admin',
      createdByUserId: adminId,
    });

    // Update user cache - this will restore their subscription
    await this.updateUserSubscriptionCache(userId);

    return updated;
  }

  /**
   * Get all users with active subscriptions
   */
  async getAllActiveUsers(): Promise<any[]> {
    return this.userSubscriptionsRepository
      .createQueryBuilder('us')
      .select('DISTINCT(us.userId)', 'id')
      .where('us.status = :status', { status: SubscriptionStatus.ACTIVE })
      .orWhere('us.status = :status', { status: SubscriptionStatus.PAUSED })
      .getRawMany();
  }

  /**
   * Update an existing subscription
   */
  async updateSubscription(subscription: UserSubscription): Promise<UserSubscription> {
    return this.userSubscriptionsRepository.save(subscription);
  }

  /**
   * Purchase subscription via Google Play using V2 API
   * Implements secure verification with replay attack prevention and idempotency
   */
  async purchaseWithGooglePlay(
    userId: string,
    planId: string,
    purchaseToken: string,
    packageName: string,
    productId: string,
  ): Promise<UserSubscription> {
    if (!this.googlePlayBillingV2Service.isEnabled()) {
      throw new BadRequestException('Google Play billing is not configured');
    }

    this.logger.log(
      `🛒 Processing Google Play purchase: user=${userId}, plan=${planId}, product=${productId}`,
    );

    try {
      // Step 1: Verify subscription with Google Play V2 API
      const verification = await this.googlePlayBillingV2Service.verifySubscription(
        packageName,
        purchaseToken,
        productId,
      );

      if (!verification.valid) {
        this.logger.error(
          `❌ Purchase verification failed for user ${userId}: subscription not valid`,
        );
        this.logger.error(
          `📋 Verification details: ${JSON.stringify({
            subscriptionState: verification.subscriptionState,
            active: verification.active,
            expiryTime: verification.expiryTime,
            productId: verification.productId,
          })}`,
        );
        throw new BadRequestException({
          code: 'GOOGLE_PLAY_VERIFICATION_FAILED',
          message: 'Unable to verify Google Play subscription. Check server logs for details.',
          details: {
            subscriptionState: verification.subscriptionState,
            active: verification.active,
          },
        });
      }

      // Step 2: Verify subscription is at least in a valid state
      // Accept ACTIVE, IN_GRACE_PERIOD, and PENDING states
      // Only reject CANCELLED, EXPIRED, etc.
      const acceptableStates = new Set([
        'SUBSCRIPTION_STATE_ACTIVE',
        'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
        'SUBSCRIPTION_STATE_PENDING',
      ]);

      if (!acceptableStates.has(verification.subscriptionState || '')) {
        this.logger.warn(
          `⚠️ Subscription in non-acceptable state for user ${userId}: ${verification.subscriptionState}`,
        );
        // Still proceed - let the active check handle it below
      }

      // Step 3: Verify subscription is active (or at least not expired)
      // If not active, log but don't fail immediately - might be in grace period
      if (!verification.active) {
        this.logger.warn(
          `⚠️ Subscription not fully active for user ${userId} but is valid. State: ${verification.subscriptionState}, Expiry: ${verification.expiryTime}`,
        );
        // Continue - as long as it's valid, accept it
      }

      // Step 4: Verify plan exists and is active
      const plan = await this.plansRepository.findOne({ where: { id: planId } });
      if (!plan) {
        this.logger.error(`❌ Plan ${planId} not found`);
        throw new NotFoundException(`Plan ${planId} not found`);
      }

      if (!plan.isActive) {
        this.logger.error(`❌ Plan ${planId} is not active`);
        throw new BadRequestException('This plan is no longer available');
      }

      // Step 5: Verify product ID - log mismatch but don't fail
      // The important thing is the subscription is valid, not the exact product ID match
      if (verification.productId !== productId) {
        this.logger.warn(
          `⚠️ Product ID mismatch for user ${userId}: client_sent="${productId}", google_returned="${verification.productId}". Using Google's actual product.`,
        );
        // Don't fail - use the product that was actually purchased
        // This can happen if client UI doesn't match backend product IDs
      } else {
        this.logger.debug(
          `✅ Product ID matches: ${productId}`,
        );
      }

      // Step 6: Check for replay attack - same token used by different user
      const tokenHash = GooglePlayBillingV2Service.hashPurchaseToken(purchaseToken);
      const existingPayment = await this.paymentsRepository.findOne({
        where: { googlePlayPurchaseTokenHash: tokenHash },
        relations: ['user'],
      });

      if (existingPayment && existingPayment.userId !== userId) {
        this.logger.error(
          `🚨 REPLAY ATTACK DETECTED: Purchase token already used by user ${existingPayment.userId}, attempted by ${userId}`,
        );
        throw new BadRequestException({
          code: 'GOOGLE_PLAY_TOKEN_REPLAY',
          message: 'This purchase token has already been used',
        });
      }

      // Step 7: Check for idempotent duplicate (same user, same order)
      if (existingPayment && existingPayment.userId === userId) {
        this.logger.log(
          `ℹ️ Duplicate purchase detected (idempotent retry): user=${userId}, order=${verification.latestOrderId}`,
        );
        // Return existing subscription instead of creating duplicate
        let subscription = await this.userSubscriptionsRepository.findOne({
          where: { userId },
          relations: ['plan'],
        });

        if (!subscription) {
          // Payment exists but subscription doesn't - create it
          subscription = await this.createSubscription(
            userId,
            planId,
            existingPayment.id,
            true, // autoRenewal
            { orderId: verification.latestOrderId },
          );
        }

        return subscription;
      }

      // Step 8: Calculate expiry from Google response
      const now = new Date();
      let expiryDate: Date;

      if (verification.expiryTime) {
        const googleExpiry = new Date(verification.expiryTime);
        const minExpiry = new Date(now.getTime() + 23 * 60 * 60 * 1000); // at least ~1 day from now

        if (googleExpiry > minExpiry) {
          // Google returned a valid future expiry
          expiryDate = googleExpiry;
          this.logger.debug(
            `📅 Using Google Play expiry date: ${expiryDate.toISOString()}`,
          );
        } else {
          // Google returned a past/same-day expiry (can happen with pending purchases or clock skew)
          // Fall back to plan duration
          this.logger.warn(
            `⚠️ Google Play expiryTime is not sufficiently in the future (${googleExpiry.toISOString()}). Falling back to plan duration of ${plan.durationDays} days.`,
          );
          expiryDate = new Date(now);
          expiryDate.setDate(expiryDate.getDate() + (plan.durationDays || 30));
        }
      } else {
        // No expiry time from Google - use plan duration as fallback
        this.logger.warn(
          `⚠️ No expiry time in Google Play response for user ${userId}. Falling back to plan duration of ${plan.durationDays} days.`,
        );
        expiryDate = new Date(now);
        expiryDate.setDate(expiryDate.getDate() + (plan.durationDays || 30));
      }

      this.logger.log(
        `📅 Subscription expiry for user ${userId}: ${expiryDate.toISOString()} (Google expiryTime was: ${verification.expiryTime ?? 'null'})`,
      );

      // Step 9: Create or update user subscription.
      // We look for ANY existing row for this user (active, trial, expired, etc.)
      // so we can upgrade/replace it in-place rather than create a duplicate.
      let subscription = await this.userSubscriptionsRepository.findOne({
        where: { userId },
        relations: ['plan'],
      });

      if (subscription) {
        const wasTrialActive = subscription.isTrialActive;
        const previousPlanId = subscription.planId;

        if (wasTrialActive) {
          this.logger.log(
            `🔄 Superseding active trial (plan=${previousPlanId}) with paid purchase (plan=${planId}) for user ${userId}`,
          );
        } else if (previousPlanId !== planId) {
          this.logger.log(
            `🔄 Upgrading subscription from plan=${previousPlanId} to plan=${planId} for user ${userId}`,
          );
        }

        // Overwrite all fields with the new paid subscription details.
        // Preserve trialRedeemed=true if the user had already used a trial —
        // resetting it to false would allow them to re-redeem a trial after buying.
        //
        // IMPORTANT: clear subscription.plan (the eager-loaded relation object) so
        // TypeORM does not overwrite planId back to the old plan when save() resolves
        // the FK from the in-memory relation. Setting planId alone is not enough when
        // the relation object is still present.
        subscription.plan = null;
        subscription.planId = planId;
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.startDate = now;
        subscription.expiryDate = expiryDate;
        subscription.isAutoRenewal = true;
        subscription.isTrialActive = false;
        subscription.trialEndDate = null;
        // Keep trialRedeemed=true if already set so the user cannot re-use a trial
        // after having paid. Only reset to false when no trial was ever used.
        subscription.trialRedeemed = subscription.trialRedeemed || wasTrialActive;
        subscription.cancelledAt = null;
        subscription.cancelledReason = null;
        subscription.suspendedAt = null;
        subscription.suspendedReason = null;
        subscription.pausedAt = null;
        subscription.pausedReason = null;
      } else {
        // No existing row — create a fresh paid subscription.
        subscription = this.userSubscriptionsRepository.create({
          userId,
          planId,
          status: SubscriptionStatus.ACTIVE,
          startDate: now,
          expiryDate,
          isAutoRenewal: true,
          isTrialActive: false,
          trialRedeemed: false,
        });
      }

      await this.userSubscriptionsRepository.save(subscription);

      // Reload with relations
      subscription = await this.userSubscriptionsRepository.findOne({
        where: { userId },
        relations: ['plan', 'user'],
      });

      // Step 10: Create payment record with token hash for replay prevention
      const payment = await this.paymentsRepository.save({
        userId,
        subscriptionId: subscription.id,
        planId,
        amount: plan.price,
        currency: 'USD',
        paymentMethod: PaymentMethod.GOOGLE_PLAY,
        status: PaymentStatus.COMPLETED,
        transactionId: verification.latestOrderId,
        googlePlayPurchaseTokenHash: tokenHash,
        metadata: {
          packageName,
          productId,
          purchaseToken,          // stored for periodic re-verification
          subscriptionState: verification.subscriptionState,
          acknowledgementState: verification.acknowledgementState,
          latestOrderId: verification.latestOrderId,
        },
      } as any);

      // Step 11: Acknowledge purchase if not already acknowledged
      if (
        verification.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
      ) {
        this.logger.debug(`🔄 Acknowledging purchase for user ${userId}`);
        await this.googlePlayBillingV2Service.acknowledgePurchase(
          packageName,
          purchaseToken,
          verification.productId,
        );
      }

      // Step 12: Log subscription action
      await this.logSubscriptionHistory({
        userId,
        planId,
        action: SubscriptionAction.PURCHASED,
        reason: ActionReason.USER_REQUEST,
        startDate: subscription.startDate,
        expiryDate: subscription.expiryDate,
        paymentId: payment.id,
        notes: `Google Play V2 purchase verified - Product: ${productId}, State: ${verification.subscriptionState}`,
      });

      // Step 13: Update user subscription cache
      await this.updateUserSubscriptionCache(userId);

      this.logger.log(
        `✅ Google Play purchase completed for user ${userId}: plan=${planId}, expiry=${expiryDate.toISOString()}`,
      );

      return subscription;
    } catch (error: any) {
      this.logger.error(
        `❌ Google Play purchase failed for user ${userId}: ${error.message}`,
      );

      // Re-throw known custom errors
      if (error.code || error.status) {
        throw error;
      }

      // Wrap unexpected errors
      throw new BadRequestException({
        code: 'GOOGLE_PLAY_PURCHASE_FAILED',
        message: 'Failed to process Google Play purchase',
      });
    }
  }

  // ============ GOOGLE PLAY RTDN HANDLER ============

  /**
   * Handle a Google Play Real-time Developer Notification.
   * Called from the webhook endpoint after Pub/Sub decoding.
   *
   * Flow:
   * 1. Find the user by purchase token hash stored in payments table
   * 2. Re-verify current subscription state directly from Google
   * 3. Update local subscription based on authoritative Google state
   */
  async handleGooglePlayRTDN(
    packageName: string,
    purchaseToken: string,
    notificationType: string,
  ): Promise<void> {
    if (!purchaseToken) {
      this.logger.warn('⚠️ RTDN: no purchaseToken in notification, skipping');
      return;
    }

    this.logger.log(
      `🔔 RTDN processing: type=${notificationType}, token_prefix=${purchaseToken.substring(0, 20)}...`,
    );

    // 1. Find which user owns this purchase token via hash
    const tokenHash = GooglePlayBillingV2Service.hashPurchaseToken(purchaseToken);
    const payment = await this.paymentsRepository.findOne({
      where: {
        googlePlayPurchaseTokenHash: tokenHash,
        paymentMethod: PaymentMethod.GOOGLE_PLAY,
      },
    });

    if (!payment) {
      this.logger.warn(
        `⚠️ RTDN: no payment found for token hash. Notification type: ${notificationType}. This may be a purchase made before token hashing was added.`,
      );
      return;
    }

    const userId = payment.userId;
    this.logger.log(`🔍 RTDN: found user=${userId} for notification type=${notificationType}`);

    // 2. For cancellation/revocation/expiry: handle immediately without re-verifying
    //    For others: re-verify with Google to get authoritative state
    const immediateRevokeTypes = new Set([
      'SUBSCRIPTION_REVOKED',
      'SUBSCRIPTION_VOIDED',
    ]);

    const cancelTypes = new Set([
      'SUBSCRIPTION_CANCELED',
      'SUBSCRIPTION_EXPIRED',
      'SUBSCRIPTION_REVOKED',
      'SUBSCRIPTION_VOIDED',
    ]);

    const holdTypes = new Set([
      'SUBSCRIPTION_ON_HOLD',
      'SUBSCRIPTION_PAUSED',
    ]);

    const reactivateTypes = new Set([
      'SUBSCRIPTION_RECOVERED',
      'SUBSCRIPTION_RENEWED',
      'SUBSCRIPTION_RESTARTED',
      'SUBSCRIPTION_IN_GRACE_PERIOD',
    ]);

    // 3. Re-verify with Google to get authoritative current state
    //    (Don't rely solely on notification type - Google recommends always re-fetching)
    let verification = null;

    // For voided/revoked we don't need to re-verify - act immediately
    if (!immediateRevokeTypes.has(notificationType)) {
      try {
        verification = await this.googlePlayBillingV2Service.verifySubscription(
          packageName,
          purchaseToken,
          payment.metadata?.productId,
        );
        this.logger.log(
          `📊 RTDN re-verify: state=${verification.subscriptionState}, active=${verification.active}, expiry=${verification.expiryTime}`,
        );
      } catch (err) {
        this.logger.error(`⚠️ RTDN: could not re-verify with Google: ${err.message}. Will use notification type to determine action.`);
      }
    }

    // 4. Load subscription
    const subscription = await this.userSubscriptionsRepository.findOne({
      where: { userId },
      relations: ['plan'],
    });

    if (!subscription) {
      this.logger.warn(`⚠️ RTDN: no subscription found for user=${userId}`);
      return;
    }

    // 5. Apply state update based on notification + verification
    if (immediateRevokeTypes.has(notificationType)) {
      // Refund / voided - revoke immediately regardless of expiry date
      this.logger.log(`🚨 RTDN: REVOKE subscription for user=${userId} (${notificationType})`);
      subscription.status = SubscriptionStatus.CANCELLED;
      subscription.cancelledAt = new Date();
      subscription.cancelledReason = `Google Play: ${notificationType}`;
      subscription.isAutoRenewal = false;
      // Mark payment as refunded
      payment.status = PaymentStatus.REFUNDED;
      payment.refundedAt = new Date();
      await this.paymentsRepository.save(payment);

    } else if (cancelTypes.has(notificationType)) {
      if (verification && verification.active) {
        // Google says still active (cancelled but within paid period) - keep active
        this.logger.log(
          `ℹ️ RTDN: ${notificationType} but Google says still active until ${verification.expiryTime}. Keeping active, disabling auto-renewal.`,
        );
        subscription.isAutoRenewal = false;
        subscription.cancelledReason = `Google Play: ${notificationType} (active until ${verification.expiryTime})`;
      } else {
        // Truly cancelled/expired
        this.logger.log(`❌ RTDN: cancel subscription for user=${userId} (${notificationType})`);
        subscription.status = notificationType === 'SUBSCRIPTION_EXPIRED'
          ? SubscriptionStatus.EXPIRED
          : SubscriptionStatus.CANCELLED;
        subscription.cancelledAt = new Date();
        subscription.cancelledReason = `Google Play: ${notificationType}`;
        subscription.isAutoRenewal = false;
      }

    } else if (holdTypes.has(notificationType)) {
      this.logger.log(`⏸️ RTDN: suspend subscription for user=${userId} (${notificationType})`);
      subscription.status = SubscriptionStatus.SUSPENDED;
      subscription.suspendedAt = new Date();
      subscription.suspendedReason = `Google Play: ${notificationType}`;

    } else if (reactivateTypes.has(notificationType)) {
      // Re-verify says active? Restore subscription
      if (verification && verification.active && verification.expiryTime) {
        this.logger.log(`✅ RTDN: reactivate subscription for user=${userId} (${notificationType})`);
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.expiryDate = new Date(verification.expiryTime);
        subscription.cancelledAt = null;
        subscription.cancelledReason = null;
        subscription.suspendedAt = null;
        subscription.suspendedReason = null;
        subscription.isAutoRenewal = true;
      } else {
        this.logger.warn(
          `⚠️ RTDN: ${notificationType} but Google verification says NOT active. Not reactivating.`,
        );
      }

    } else {
      this.logger.log(`ℹ️ RTDN: no action taken for notification type=${notificationType}`);
      return;
    }

    // 6. Save and update user cache
    await this.userSubscriptionsRepository.save(subscription);
    await this.updateUserSubscriptionCache(userId);

    this.logger.log(
      `✅ RTDN processed: user=${userId}, type=${notificationType}, newStatus=${subscription.status}`,
    );

    // 7. Log subscription history
    await this.logSubscriptionHistory({
      userId,
      planId: subscription.planId,
      action: SubscriptionAction.CANCELLED,
      reason: ActionReason.AUTO_RENEWAL,
      startDate: subscription.startDate,
      expiryDate: subscription.expiryDate,
      notes: `Google Play RTDN: ${notificationType}`,
    });
  }

  // ============ PERIODIC GOOGLE PLAY SUBSCRIPTION CHECK ============

  /**
   * Every 6 hours: re-verify all active Google Play subscriptions.
   * Catches cases where RTDN was missed (refund, cancellation, expiry).
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async checkActiveGooglePlaySubscriptions(): Promise<void> {
    if (!this.googlePlayBillingV2Service.isEnabled()) return;

    this.logger.log('🔄 Starting periodic Google Play subscription check...');

    // Find all active subscriptions that have a Google Play payment
    const googlePlayPayments = await this.paymentsRepository.find({
      where: {
        paymentMethod: PaymentMethod.GOOGLE_PLAY,
        status: PaymentStatus.COMPLETED,
      },
      order: { createdAt: 'DESC' },
    });

    if (!googlePlayPayments.length) {
      this.logger.log('ℹ️ No active Google Play payments to check');
      return;
    }

    // De-duplicate by userId - only check the latest payment per user
    const latestByUser = new Map<string, typeof googlePlayPayments[0]>();
    for (const p of googlePlayPayments) {
      if (!latestByUser.has(p.userId)) {
        latestByUser.set(p.userId, p);
      }
    }

    this.logger.log(`🔍 Checking ${latestByUser.size} Google Play subscriptions...`);

    let revoked = 0;
    let ok = 0;
    let errors = 0;

    for (const [userId, payment] of latestByUser) {
      try {
        const subscription = await this.userSubscriptionsRepository.findOne({
          where: { userId },
        });

        // Only check subscriptions that are currently active
        if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) continue;

        const productId = payment.metadata?.productId;
        const packageName = this.googlePlayBillingV2Service.getPackageName();

        // We need the raw purchase token - stored in metadata
        const purchaseToken = payment.metadata?.purchaseToken;
        if (!purchaseToken) {
          this.logger.debug(`⚠️ No raw purchase token in metadata for user=${userId}, skipping`);
          continue;
        }

        const verification = await this.googlePlayBillingV2Service.verifySubscription(
          packageName,
          purchaseToken,
          productId,
        );

        if (!verification.valid || !verification.active) {
          this.logger.warn(
            `🚨 Periodic check: subscription INVALID for user=${userId}. State=${verification.subscriptionState}. Revoking.`,
          );

          subscription.status = SubscriptionStatus.CANCELLED;
          subscription.cancelledAt = new Date();
          subscription.cancelledReason = `Google Play periodic check: ${verification.subscriptionState || 'invalid'}`;
          subscription.isAutoRenewal = false;

          await this.userSubscriptionsRepository.save(subscription);
          await this.updateUserSubscriptionCache(userId);
          revoked++;
        } else {
          // Subscription is valid - update expiry date if it changed (renewal)
          if (verification.expiryTime) {
            const googleExpiry = new Date(verification.expiryTime);
            if (googleExpiry.getTime() !== subscription.expiryDate.getTime()) {
              this.logger.log(
                `🔄 Periodic check: updating expiry for user=${userId}: ${subscription.expiryDate.toISOString()} → ${googleExpiry.toISOString()}`,
              );
              subscription.expiryDate = googleExpiry;
              await this.userSubscriptionsRepository.save(subscription);
              await this.updateUserSubscriptionCache(userId);
            }
          }
          ok++;
        }
      } catch (err) {
        this.logger.error(`❌ Periodic check error for user=${userId}: ${err.message}`);
        errors++;
      }
    }

    this.logger.log(
      `✅ Periodic Google Play check complete: ok=${ok}, revoked=${revoked}, errors=${errors}`,
    );
  }
}

