import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { UsageTracking } from '../entities/usage-tracking.entity';
import { UserSubscription } from '../entities/user-subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';

@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(UsageTracking)
    private usageRepository: Repository<UsageTracking>,
    @InjectRepository(UserSubscription)
    private subscriptionRepository: Repository<UserSubscription>,
    @InjectRepository(SubscriptionPlan)
    private planRepository: Repository<SubscriptionPlan>,
  ) {}

  /**
   * Get current usage cycle for user
   */
  async getCurrentUsageCycle(userId: string): Promise<UsageTracking | null> {
    const now = new Date();
    return this.usageRepository.findOne({
      where: {
        userId,
        cycleEndDate: LessThan(now),
      },
      order: { cycleStartDate: 'DESC' },
    });
  }

  /**
   * Create new usage tracking cycle
   */
  async createUsageCycle(
    userId: string,
    cycleStartDate: Date,
    cycleEndDate: Date,
    dataLimitBytes?: number,
    maxDevices?: number,
  ): Promise<UsageTracking> {
    // Close previous cycle if exists
    const previous = await this.getCurrentUsageCycle(userId);
    if (previous && previous.cycleEndDate > new Date()) {
      previous.cycleEndDate = new Date();
      await this.usageRepository.save(previous);
    }

    const usage = this.usageRepository.create({
      userId,
      cycleStartDate,
      cycleEndDate,
      dataUsedBytes: 0,
      dataLimitBytes,
      devicesUsed: 0,
      maxDevices,
    });

    return this.usageRepository.save(usage);
  }

  /**
   * Add data usage
   */
  async addDataUsage(userId: string, bytes: number): Promise<UsageTracking> {
    let usage = await this.getCurrentUsageCycle(userId);

    if (!usage) {
      // Create new cycle for today
      const now = new Date();
      const cycleEnd = new Date(now);
      cycleEnd.setDate(cycleEnd.getDate() + 1); // Daily cycle

      // Get subscription to find data limit
      const subscription = await this.subscriptionRepository.findOne({
        where: { userId },
        relations: ['plan'],
      });

      const dataLimit = subscription?.plan.dataLimitGb
        ? subscription.plan.dataLimitGb * 1024 * 1024 * 1024
        : null;

      usage = await this.createUsageCycle(
        userId,
        now,
        cycleEnd,
        dataLimit,
        subscription?.plan.maxDevices,
      );
    }

    usage.addUsage(bytes);
    return this.usageRepository.save(usage);
  }

  /**
   * Get usage summary for current cycle
   */
  async getUsageSummary(userId: string): Promise<any> {
    const usage = await this.getCurrentUsageCycle(userId);

    if (!usage) {
      return {
        dataUsed: 0,
        dataLimit: null,
        dataUsedPercent: 0,
        devicesUsed: 0,
        maxDevices: null,
        cycleStart: null,
        cycleEnd: null,
        isLimitExceeded: false,
        daysRemaining: 0,
      };
    }

    return {
      dataUsed: usage.getDataUsedGB(),
      dataLimit: usage.getDataLimitGB(),
      dataUsedPercent: usage.getUsagePercent(),
      dataUsedBytes: usage.dataUsedBytes,
      dataLimitBytes: usage.dataLimitBytes,
      devicesUsed: usage.devicesUsed,
      maxDevices: usage.maxDevices,
      cycleStart: usage.cycleStartDate,
      cycleEnd: usage.cycleEndDate,
      isLimitExceeded: usage.isExceeded(),
      isNearLimit: usage.isNearLimit(0.8),
      daysRemaining: usage.getDaysRemaining(),
      estimatedDailyRate: usage.getEstimatedDailyRate(),
      projectedTotalUsage: usage.getProjectedTotalUsage(),
      willExceedLimit: usage.willExceedLimit(),
    };
  }

  /**
   * Check if user can use more data
   */
  async canUseData(userId: string): Promise<boolean> {
    const usage = await this.getCurrentUsageCycle(userId);
    if (!usage) return true;

    return !usage.isExceeded();
  }

  /**
   * Check if user has exceeded limit
   */
  async isLimitExceeded(userId: string): Promise<boolean> {
    const usage = await this.getCurrentUsageCycle(userId);
    if (!usage) return false;

    return usage.isExceeded();
  }

  /**
   * Get usage history for user
   */
  async getUserUsageHistory(
    userId: string,
    limit: number = 12,
  ): Promise<UsageTracking[]> {
    return this.usageRepository.find({
      where: { userId },
      order: { cycleStartDate: 'DESC' },
      take: limit,
    });
  }

  /**
   * Reset monthly usage for all users
   */
  async resetMonthlyUsageForAllUsers(): Promise<number> {
    const now = new Date();
    const cycleEnd = new Date(now);
    cycleEnd.setMonth(cycleEnd.getMonth() + 1);

    // Get all active users
    const activeSubscriptions = await this.subscriptionRepository.find({
      relations: ['user', 'plan'],
    });

    let cyclesCreated = 0;

    for (const subscription of activeSubscriptions) {
      const user = subscription.user;

      // Close previous cycle
      await this.usageRepository.update(
        { userId: user.id, cycleEndDate: now },
        { cycleEndDate: now },
      );

      // Create new cycle
      const dataLimit = subscription.plan.dataLimitGb
        ? subscription.plan.dataLimitGb * 1024 * 1024 * 1024
        : null;

      await this.createUsageCycle(
        user.id,
        now,
        cycleEnd,
        dataLimit,
        subscription.plan.maxDevices,
      );

      cyclesCreated++;
    }

    return cyclesCreated;
  }

  /**
   * Get usage statistics for admin dashboard
   */
  async getUsageStats(): Promise<any> {
    const stats = await this.usageRepository
      .createQueryBuilder('u')
      .select('COUNT(*)', 'total_active_cycles')
      .addSelect('COUNT(*) FILTER (WHERE u."isLimitExceeded" = true)', 'users_exceeded')
      .addSelect('COUNT(*) FILTER (WHERE u."dataLimitBytes" IS NOT NULL', 'users_with_limits')
      .addSelect('AVG(u."dataUsedBytes")', 'avg_data_used')
      .addSelect('MAX(u."dataUsedBytes")', 'max_data_used')
      .where('u."cycleEndDate" > CURRENT_TIMESTAMP')
      .getRawOne();

    return {
      totalActiveCycles: parseInt(stats.total_active_cycles || 0),
      usersExceededLimit: parseInt(stats.users_exceeded || 0),
      usersWithLimits: parseInt(stats.users_with_limits || 0),
      avgDataUsedGB: stats.avg_data_used ? stats.avg_data_used / (1024 * 1024 * 1024) : 0,
      maxDataUsedGB: stats.max_data_used ? stats.max_data_used / (1024 * 1024 * 1024) : 0,
    };
  }

  /**
   * Get users near or exceeding data limit
   */
  async getUsersNearLimit(threshold: number = 0.8): Promise<any[]> {
    const usages = await this.usageRepository
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.user', 'user')
      .where('u."cycleEndDate" > CURRENT_TIMESTAMP')
      .andWhere('u."dataLimitBytes" IS NOT NULL')
      .getMany();

    return usages
      .filter((u) => u.getUsagePercent() >= threshold * 100)
      .map((u) => ({
        userId: u.userId,
        email: u.user?.email,
        dataUsedGB: u.getDataUsedGB(),
        dataLimitGB: u.getDataLimitGB(),
        usagePercent: u.getUsagePercent(),
        isExceeded: u.isExceeded(),
        daysRemaining: u.getDaysRemaining(),
      }));
  }

  /**
   * Get top data consumers
   */
  async getTopDataConsumers(limit: number = 10): Promise<any[]> {
    const usages = await this.usageRepository
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.user', 'user')
      .where('u."cycleEndDate" > CURRENT_TIMESTAMP')
      .orderBy('u."dataUsedBytes"', 'DESC')
      .take(limit)
      .getMany();

    return usages.map((u) => ({
      userId: u.userId,
      email: u.user?.email,
      dataUsedGB: u.getDataUsedGB(),
      dataLimitGB: u.getDataLimitGB(),
      usagePercent: u.getUsagePercent(),
    }));
  }

  /**
   * Archive old usage cycles
   */
  async archiveOldCycles(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.usageRepository.delete({
      cycleEndDate: LessThan(cutoffDate),
    });

    return result.affected || 0;
  }

  /**
   * Check if user device limit exceeded
   */
  async isDeviceLimitExceeded(userId: string): Promise<boolean> {
    const usage = await this.getCurrentUsageCycle(userId);
    if (!usage || !usage.maxDevices) return false;

    return usage.devicesUsed >= usage.maxDevices;
  }

  /**
   * Increment device count for current cycle
   */
  async incrementDeviceUsage(userId: string): Promise<void> {
    let usage = await this.getCurrentUsageCycle(userId);

    if (!usage) {
      const now = new Date();
      const cycleEnd = new Date(now);
      cycleEnd.setDate(cycleEnd.getDate() + 1);

      const subscription = await this.subscriptionRepository.findOne({
        where: { userId },
        relations: ['plan'],
      });

      usage = await this.createUsageCycle(
        userId,
        now,
        cycleEnd,
        subscription?.plan.dataLimitGb ? subscription.plan.dataLimitGb * 1024 * 1024 * 1024 : null,
        subscription?.plan.maxDevices,
      );
    }

    usage.devicesUsed++;
    await this.usageRepository.save(usage);
  }
}
