import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, LessThan, LessThanOrEqual } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { UserSubscription, SubscriptionStatus } from '../entities/user-subscription.entity';
import { SubscriptionHistory, SubscriptionAction, ActionReason } from '../entities/subscription-history.entity';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { CreatePlanDto } from '../dto/create-plan.dto';
import { UsersService } from '../../users/users.service';

@Injectable()
export class SubscriptionsService {
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

    return this.plansRepository.save(plan);
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
   * Get user's current subscription
   */
  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    return this.userSubscriptionsRepository.findOne({
      where: { userId },
      relations: ['plan'],
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
    const expiryDate = new Date(now);
    expiryDate.setDate(expiryDate.getDate() + newPlan.durationDays);

    // Update subscription
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

    // Downgrade takes effect immediately
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
    const newExpiryDate = new Date(oldExpiryDate);
    newExpiryDate.setDate(newExpiryDate.getDate() + days);

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
      user.subscriptionExpiryDate = subscription.expiryDate;
      user.daysRemaining = subscription.getDaysRemaining();
      user.maxConcurrentDevices = subscription.plan.maxDevices;
      user.maxDataPerMonth = subscription.plan.dataLimitGb
        ? subscription.plan.dataLimitGb * 1024 * 1024 * 1024
        : null;
    } else {
      user.subscriptionStatus = 'free';
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
}
