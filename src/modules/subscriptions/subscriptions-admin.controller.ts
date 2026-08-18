import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SubscriptionsService } from './services/subscriptions.service';
import { PaymentService } from './services/payment.service';
import { UsageService } from './services/usage.service';
import { RefundService } from './services/refund.service';
import { AuditLogService } from './services/audit-log.service';
import { PauseService } from './services/pause.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { AdminSubscriptionQueryDto } from './dto/query-params.dto';
import { SubscriptionStatus } from './entities/user-subscription.entity';

@ApiTags('Subscriptions - Admin')
@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class SubscriptionsAdminController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly paymentService: PaymentService,
    private readonly usageService: UsageService,
    private readonly refundService: RefundService,
    private readonly auditLogService: AuditLogService,
    private readonly pauseService: PauseService,
  ) {}

  // ============ PLAN MANAGEMENT ============

  @Post('plans')
  @ApiOperation({ summary: 'Create new subscription plan (Admin only)' })
  async createPlan(@Request() req, @Body() createPlanDto: CreatePlanDto) {
    try {
      const plan = await this.subscriptionsService.createPlan(createPlanDto, req.user.id);

      return {
        success: true,
        plan: {
          id: plan.id,
          name: plan.name,
          price: plan.price,
          durationDays: plan.durationDays,
          features: plan.features,
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('plans')
  @ApiOperation({ summary: 'Get all subscription plans' })
  async getPlans() {
    const plans = await this.subscriptionsService.getAllPlans(false);

    return {
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        durationDays: p.durationDays,
        dataLimitGb: p.dataLimitGb,
        maxDevices: p.maxDevices,
        features: p.features,
        displayOrder: p.displayOrder,
        isActive: p.isActive,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    };
  }

  @Get('plans/:planId')
  @ApiOperation({ summary: 'Get plan details' })
  async getPlan(@Param('planId') planId: string) {
    const plan = await this.subscriptionsService.getPlanById(planId);

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      durationDays: plan.durationDays,
      dataLimitGb: plan.dataLimitGb,
      maxDevices: plan.maxDevices,
      features: plan.features,
      displayOrder: plan.displayOrder,
      isActive: plan.isActive,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  @Put('plans/:planId')
  @ApiOperation({ summary: 'Update subscription plan' })
  async updatePlan(
    @Request() req,
    @Param('planId') planId: string,
    @Body() updateData: any,
  ) {
    try {
      const plan = await this.subscriptionsService.updatePlan(planId, updateData, req.user.id);

      return {
        success: true,
        plan: {
          id: plan.id,
          name: plan.name,
          price: plan.price,
          updatedAt: plan.updatedAt,
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Delete('plans/:planId')
  @ApiOperation({ summary: 'Deactivate subscription plan' })
  async deactivatePlan(@Request() req, @Param('planId') planId: string) {
    try {
      await this.subscriptionsService.deactivatePlan(planId, req.user.id);

      return {
        success: true,
        message: 'Plan deactivated',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ============ USER SUBSCRIPTIONS ============

  @Get('users/:userId')
  @ApiOperation({ summary: 'Get user subscription details' })
  async getUserSubscription(@Param('userId') userId: string) {
    const subscription = await this.subscriptionsService.getUserSubscription(userId);

    if (!subscription) {
      return {
        status: 'free',
        plan: null,
        subscription: null,
      };
    }

    return {
      status: subscription.status,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        price: subscription.plan.price,
      },
      subscription: {
        id: subscription.id,
        startDate: subscription.startDate,
        expiryDate: subscription.expiryDate,
        daysRemaining: subscription.getDaysRemaining(),
        autoRenewal: subscription.isAutoRenewal,
        failedAttempts: subscription.failedRenewalAttempts,
      },
    };
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'List all subscriptions with filters' })
  async listSubscriptions(@Query() query: AdminSubscriptionQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;

    // TODO: Implement filtering by status, plan, auto-renewal, etc.
    // For now, return mock data structure

    return {
      subscriptions: [],
      pagination: {
        page,
        limit,
        total: 0,
        pages: 0,
      },
    };
  }

  @Post('users/:userId/extend')
  @ApiOperation({ summary: 'Manually extend user subscription' })
  async extendUserSubscription(
    @Request() req,
    @Param('userId') userId: string,
    @Body() body: { days: number; reason?: string },
  ) {
    try {
      const subscription = await this.subscriptionsService.extendSubscription(
        userId,
        body.days,
      );

      return {
        success: true,
        subscription: {
          expiryDate: subscription.expiryDate,
          daysRemaining: subscription.getDaysRemaining(),
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('users/:userId/suspend')
  @ApiOperation({ summary: 'Suspend user subscription' })
  async suspendSubscription(
    @Request() req,
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
  ) {
    try {
      const subscription = await this.subscriptionsService.getUserSubscription(userId);

      if (!subscription) {
        throw new NotFoundException('Subscription not found');
      }

      subscription.status = SubscriptionStatus.SUSPENDED;
      // TODO: Save updated subscription

      return {
        success: true,
        message: 'Subscription suspended',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('users/:userId/reactivate')
  @ApiOperation({ summary: 'Reactivate suspended subscription' })
  async reactivateSubscription(@Param('userId') userId: string) {
    try {
      const subscription = await this.subscriptionsService.getUserSubscription(userId);

      if (!subscription) {
        throw new NotFoundException('Subscription not found');
      }

      subscription.status = SubscriptionStatus.ACTIVE;
      // TODO: Save updated subscription

      return {
        success: true,
        message: 'Subscription reactivated',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ============ PAYMENTS & REFUNDS ============

  @Get('payments')
  @ApiOperation({ summary: 'List all payments' })
  async listPayments(@Query('page') page = 1, @Query('limit') limit = 20) {
    // TODO: Implement payment listing with filters

    return {
      payments: [],
      pagination: { page, limit, total: 0 },
    };
  }

  @Get('payments/:paymentId')
  @ApiOperation({ summary: 'Get payment details' })
  async getPayment(@Param('paymentId') paymentId: string) {
    try {
      const payment = await this.paymentService.getPayment(paymentId);

      return {
        id: payment.id,
        userId: payment.userId,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.paymentMethod,
        status: payment.status,
        transactionId: payment.transactionId,
        failureReason: payment.failureReason,
        createdAt: payment.createdAt,
      };
    } catch (error) {
      throw new NotFoundException('Payment not found');
    }
  }

  @Post('payments/:paymentId/refund')
  @ApiOperation({ summary: 'Refund a payment' })
  async refundPayment(
    @Param('paymentId') paymentId: string,
    @Body() body: { amount?: number; reason?: string },
  ) {
    try {
      const refunded = await this.paymentService.refundPayment(paymentId, body.amount);

      return {
        success: true,
        payment: {
          id: refunded.id,
          refundAmount: refunded.refundAmount,
          refundedAt: refunded.refundedAt,
          status: refunded.status,
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('payments/:paymentId/mark-completed')
  @ApiOperation({ summary: 'Manually mark payment as completed' })
  async markPaymentCompleted(
    @Param('paymentId') paymentId: string,
    @Body() body: { transactionId?: string },
  ) {
    try {
      const payment = await this.paymentService.markAsCompleted(paymentId, body.transactionId);

      return {
        success: true,
        payment: {
          id: payment.id,
          status: payment.status,
          transactionId: payment.transactionId,
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ============ REFUNDS ============

  @Post('users/:userId/refund')
  @ApiOperation({ summary: 'Apply pro-rata refund to user subscription' })
  async applyRefund(
    @Param('userId') userId: string,
    @Body() body: { method: 'cash' | 'credit'; reason: string; amount?: number },
  ) {
    try {
      let result;

      if (body.method === 'cash') {
        result = await this.refundService.applyRefundAsCash(
          userId,
          body.amount || 0,
          body.reason,
        );
      } else if (body.method === 'credit') {
        const calculated = await this.refundService.calculateProRataRefund(userId, 0);
        result = await this.refundService.applyRefundAsCredit(
          userId,
          calculated.refundAmount,
          body.reason,
        );
      } else {
        throw new BadRequestException('Invalid refund method. Use "cash" or "credit"');
      }

      return {
        success: true,
        refund: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('users/:userId/refund-history')
  @ApiOperation({ summary: 'Get refund and credit history for user' })
  async getRefundHistory(@Param('userId') userId: string) {
    try {
      const history = await this.refundService.getRefundHistory(userId);

      return {
        userId,
        history,
        count: history.length,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('users/:userId/credit')
  @ApiOperation({ summary: 'Get available credit balance for user' })
  async getUserCredit(@Param('userId') userId: string) {
    try {
      const credit = await this.refundService.getAvailableCredit(userId);

      return {
        userId,
        availableCredit: credit,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('users/:userId/calculate-refund')
  @ApiOperation({ summary: 'Calculate pro-rata refund for user subscription' })
  async calculateRefund(
    @Param('userId') userId: string,
    @Body() body: { newPlanPrice: number },
  ) {
    try {
      const result = await this.refundService.calculateProRataRefund(
        userId,
        body.newPlanPrice,
      );

      return {
        calculation: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ============ AUDIT LOGS ============

  @Get('users/:userId/audit-logs')
  @ApiOperation({ summary: 'Get audit logs for user' })
  async getUserAuditLogs(
    @Param('userId') userId: string,
    @Query('limit') limit = 50,
  ) {
    try {
      const logs = await this.auditLogService.getUserLogs(userId, limit);

      return {
        userId,
        count: logs.length,
        logs,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('audit-logs/actions/:action')
  @ApiOperation({ summary: 'Get audit logs by action type' })
  async getLogsByAction(
    @Param('action') action: string,
    @Query('limit') limit = 100,
  ) {
    try {
      const logs = await this.auditLogService.getLogsByAction(action as any, limit);

      return {
        action,
        count: logs.length,
        logs,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('audit-logs/admin/:adminId')
  @ApiOperation({ summary: 'Get all actions performed by an admin' })
  async getAdminActions(
    @Param('adminId') adminId: string,
    @Query('limit') limit = 100,
  ) {
    try {
      const logs = await this.auditLogService.getAdminActions(adminId, limit);

      return {
        adminId,
        count: logs.length,
        logs,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('audit-logs/resource/:resource/:resourceId')
  @ApiOperation({ summary: 'Get audit logs for a specific resource' })
  async getResourceLogs(
    @Param('resource') resource: string,
    @Param('resourceId') resourceId: string,
  ) {
    try {
      const logs = await this.auditLogService.getResourceLogs(resource, resourceId);

      return {
        resource,
        resourceId,
        count: logs.length,
        logs,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ============ SUBSCRIPTION PAUSE/RESUME ============

  @Post('users/:userId/pause')
  @ApiOperation({ summary: 'Pause user subscription' })
  async pauseSubscription(
    @Request() req,
    @Param('userId') userId: string,
    @Body() body: { subscriptionId: string; reason: string },
  ) {
    try {
      const result = await this.pauseService.pauseSubscription(
        body.subscriptionId,
        userId,
        body.reason,
        req.user.id, // adminId
      );

      return {
        success: true,
        pause: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('users/:userId/resume')
  @ApiOperation({ summary: 'Resume paused subscription' })
  async resumeSubscription(
    @Request() req,
    @Param('userId') userId: string,
    @Body() body: { subscriptionId: string },
  ) {
    try {
      const result = await this.pauseService.resumeSubscription(
        body.subscriptionId,
        userId,
        req.user.id, // adminId
      );

      return {
        success: true,
        resume: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('users/:userId/pause-history/:subscriptionId')
  @ApiOperation({ summary: 'Get pause history for subscription' })
  async getPauseHistory(
    @Param('userId') userId: string,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    try {
      const history = await this.pauseService.getPauseHistory(subscriptionId);

      return {
        userId,
        subscriptionId,
        count: history.length,
        history,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('paused-subscriptions')
  @ApiOperation({ summary: 'Get all paused subscriptions' })
  async getPausedSubscriptions(@Query('limit') limit = 100) {
    try {
      const subscriptions = await this.pauseService.getPausedSubscriptions(limit);

      return {
        count: subscriptions.length,
        subscriptions,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('auto-resume-expired-pauses')
  @ApiOperation({ summary: 'Auto-resume subscriptions exceeding max pause duration' })
  async autoResumeExpiredPauses(@Body() body: { maxPauseDays?: number }) {
    try {
      const resumed = await this.pauseService.autoResumeExpiredPausedSubscriptions(
        body.maxPauseDays || 30,
      );

      return {
        success: true,
        resumedCount: resumed,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ============ STATISTICS & ANALYTICS ============

  @Get('stats')
  @ApiOperation({ summary: 'Get subscription system statistics' })
  async getStats() {
    const stats = await this.subscriptionsService.getSubscriptionStats();
    const paymentStats = await this.paymentService.getPaymentStats(30);
    const usageStats = await this.usageService.getUsageStats();

    return {
      subscriptions: {
        totalActive: stats.totalActive,
        totalExpired: stats.totalExpired,
        totalCancelled: stats.totalCancelled,
        byPlan: stats.byPlan,
      },
      revenue: {
        monthlyRecurringRevenue: stats.mrr,
        annualRecurringRevenue: stats.arr,
        lastMonthRevenue: stats.monthRevenue,
        lastYearRevenue: stats.yearRevenue,
      },
      payments: {
        totalTransactions: paymentStats.totalTransactions,
        completedTransactions: paymentStats.completedTransactions,
        failedTransactions: paymentStats.failedTransactions,
        successRate: paymentStats.successRate,
        totalRevenue: paymentStats.totalRevenue,
      },
      usage: {
        totalActiveCycles: usageStats.totalActiveCycles,
        usersExceededLimit: usageStats.usersExceededLimit,
        usersWithLimits: usageStats.usersWithLimits,
        avgDataUsedGB: usageStats.avgDataUsedGB,
        maxDataUsedGB: usageStats.maxDataUsedGB,
      },
    };
  }

  @Get('expiring-soon')
  @ApiOperation({ summary: 'Get subscriptions expiring in next 7 days' })
  async getExpiringSubscriptions(@Query('days') days = 7) {
    const expiringSubscriptions = await this.subscriptionsService.getExpiringSubscriptionsForAdmin(
      days,
    );

    return {
      count: expiringSubscriptions.length,
      days,
      subscriptions: expiringSubscriptions,
    };
  }

  @Get('usage/top-consumers')
  @ApiOperation({ summary: 'Get top data consumers' })
  async getTopConsumers(@Query('limit') limit = 10) {
    const topConsumers = await this.usageService.getTopDataConsumers(limit);

    return {
      limit,
      consumers: topConsumers,
    };
  }

  @Get('usage/near-limit')
  @ApiOperation({ summary: 'Get users approaching data limit' })
  async getUsersNearLimit(@Query('threshold') threshold = 0.8) {
    const users = await this.usageService.getUsersNearLimit(threshold);

    return {
      threshold: `${threshold * 100}%`,
      count: users.length,
      users,
    };
  }

  @Post('usage/reset-all')
  @ApiOperation({ summary: 'Reset monthly usage for all users (Admin only)' })
  async resetAllUsage() {
    try {
      const cyclesCreated = await this.usageService.resetMonthlyUsageForAllUsers();

      return {
        success: true,
        cyclesCreated,
        message: `Reset usage cycles for ${cyclesCreated} users`,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('usage/archive-old')
  @ApiOperation({ summary: 'Archive old usage records (older than 90 days)' })
  async archiveOldUsage(@Body() body: { days?: number }) {
    try {
      const deleted = await this.usageService.archiveOldCycles(body.days || 90);

      return {
        success: true,
        deleted,
        message: `Archived ${deleted} old usage cycles`,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
