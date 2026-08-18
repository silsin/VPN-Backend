import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { AuditLog, AuditLogAction } from '../entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  private logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Log an action to audit trail
   */
  async log(
    action: AuditLogAction,
    data: {
      userId?: string;
      adminId?: string;
      resource: string;
      resourceId?: string;
      changes?: { before?: any; after?: any };
      reason?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<AuditLog> {
    const auditLog = new AuditLog({
      action,
      userId: data.userId,
      adminId: data.adminId,
      resource: data.resource,
      resourceId: data.resourceId,
      changes: data.changes || { before: null, after: null },
      reason: data.reason,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    const saved = await this.auditLogRepository.save(auditLog);
    this.logger.debug(
      `Audit logged: ${action} - Resource: ${data.resource}/${data.resourceId}`,
    );

    return saved;
  }

  /**
   * Log subscription creation
   */
  async logSubscriptionCreated(
    userId: string,
    subscriptionId: string,
    planId: string,
    data: any,
  ): Promise<void> {
    await this.log(AuditLogAction.SUBSCRIPTION_CREATED, {
      userId,
      resource: 'subscription',
      resourceId: subscriptionId,
      changes: {
        before: null,
        after: { planId, startDate: data.startDate, expiryDate: data.expiryDate },
      },
    });
  }

  /**
   * Log subscription extension
   */
  async logSubscriptionExtended(
    userId: string,
    subscriptionId: string,
    adminId: string,
    days: number,
    oldExpiryDate: Date,
    newExpiryDate: Date,
  ): Promise<void> {
    await this.log(AuditLogAction.SUBSCRIPTION_EXTENDED, {
      userId,
      adminId,
      resource: 'subscription',
      resourceId: subscriptionId,
      changes: {
        before: { expiryDate: oldExpiryDate },
        after: { expiryDate: newExpiryDate, daysAdded: days },
      },
    });
  }

  /**
   * Log subscription suspension
   */
  async logSubscriptionSuspended(
    userId: string,
    subscriptionId: string,
    adminId: string,
    reason: string,
  ): Promise<void> {
    await this.log(AuditLogAction.SUBSCRIPTION_SUSPENDED, {
      userId,
      adminId,
      resource: 'subscription',
      resourceId: subscriptionId,
      reason,
      changes: {
        before: { status: 'ACTIVE' },
        after: { status: 'SUSPENDED' },
      },
    });
  }

  /**
   * Log subscription reactivation
   */
  async logSubscriptionReactivated(
    userId: string,
    subscriptionId: string,
    adminId: string,
  ): Promise<void> {
    await this.log(AuditLogAction.SUBSCRIPTION_REACTIVATED, {
      userId,
      adminId,
      resource: 'subscription',
      resourceId: subscriptionId,
      changes: {
        before: { status: 'SUSPENDED' },
        after: { status: 'ACTIVE' },
      },
    });
  }

  /**
   * Log payment processed
   */
  async logPaymentProcessed(
    userId: string,
    paymentId: string,
    amount: number,
    method: string,
  ): Promise<void> {
    await this.log(AuditLogAction.PAYMENT_PROCESSED, {
      userId,
      resource: 'payment',
      resourceId: paymentId,
      changes: {
        before: null,
        after: { amount, method, status: 'COMPLETED' },
      },
    });
  }

  /**
   * Log payment refund
   */
  async logPaymentRefunded(
    userId: string,
    paymentId: string,
    refundAmount: number,
    adminId: string,
    reason: string,
  ): Promise<void> {
    await this.log(AuditLogAction.PAYMENT_REFUNDED, {
      userId,
      adminId,
      resource: 'payment',
      resourceId: paymentId,
      reason,
      changes: {
        before: { status: 'COMPLETED' },
        after: { status: 'REFUNDED', refundAmount },
      },
    });
  }

  /**
   * Log refund applied as credit
   */
  async logCreditApplied(
    userId: string,
    subscriptionId: string,
    adminId: string,
    amount: number,
    reason: string,
  ): Promise<void> {
    await this.log(AuditLogAction.CREDIT_APPLIED, {
      userId,
      adminId,
      resource: 'subscription',
      resourceId: subscriptionId,
      reason,
      changes: {
        before: null,
        after: { creditAmount: amount },
      },
    });
  }

  /**
   * Log credit used
   */
  async logCreditUsed(
    userId: string,
    subscriptionId: string,
    amount: number,
  ): Promise<void> {
    await this.log(AuditLogAction.CREDIT_USED, {
      userId,
      resource: 'subscription',
      resourceId: subscriptionId,
      changes: {
        before: null,
        after: { creditUsed: amount },
      },
    });
  }

  /**
   * Log plan created
   */
  async logPlanCreated(
    adminId: string,
    planId: string,
    planData: any,
  ): Promise<void> {
    await this.log(AuditLogAction.PLAN_CREATED, {
      adminId,
      resource: 'plan',
      resourceId: planId,
      changes: {
        before: null,
        after: planData,
      },
    });
  }

  /**
   * Log plan updated
   */
  async logPlanUpdated(
    adminId: string,
    planId: string,
    oldData: any,
    newData: any,
  ): Promise<void> {
    await this.log(AuditLogAction.PLAN_UPDATED, {
      adminId,
      resource: 'plan',
      resourceId: planId,
      changes: {
        before: oldData,
        after: newData,
      },
    });
  }

  /**
   * Get audit logs for a user
   */
  async getUserLogs(userId: string, limit = 50): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { userId } as FindOptionsWhere<AuditLog>,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get audit logs for a resource
   */
  async getResourceLogs(resource: string, resourceId: string): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { resource, resourceId } as FindOptionsWhere<AuditLog>,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get audit logs by action
   */
  async getLogsByAction(action: AuditLogAction, limit = 100): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { action } as FindOptionsWhere<AuditLog>,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get admin actions
   */
  async getAdminActions(adminId: string, limit = 100): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { adminId } as FindOptionsWhere<AuditLog>,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get audit logs in date range
   */
  async getLogsByDateRange(
    startDate: Date,
    endDate: Date,
    resource?: string,
  ): Promise<AuditLog[]> {
    let query = this.auditLogRepository
      .createQueryBuilder('log')
      .where('log.createdAt >= :startDate', { startDate })
      .where('log.createdAt <= :endDate', { endDate })
      .orderBy('log.createdAt', 'DESC');

    if (resource) {
      query = query.andWhere('log.resource = :resource', { resource });
    }

    return query.getMany();
  }
}
