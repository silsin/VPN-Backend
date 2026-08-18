import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSubscription } from '../entities/user-subscription.entity';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { SubscriptionsService } from './subscriptions.service';
import { PaymentService } from './payment.service';

export interface ProRataRefundResult {
  originalAmount: number;
  daysUsed: number;
  daysTotal: number;
  refundPercentage: number;
  refundAmount: number;
  creditApplied: boolean;
  creditAmount?: number;
  refundTransactionId?: string;
}

@Injectable()
export class RefundService {
  private logger = new Logger(RefundService.name);

  constructor(
    @InjectRepository(UserSubscription)
    private subscriptionRepository: Repository<UserSubscription>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private subscriptionsService: SubscriptionsService,
    private paymentService: PaymentService,
  ) {}

  /**
   * Calculate pro-rata refund for subscription downgrade
   * Formula: (days_remaining / plan_duration) * plan_price
   */
  async calculateProRataRefund(
    userId: string,
    newPlanPrice: number,
  ): Promise<ProRataRefundResult> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId },
      relations: ['plan'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const now = new Date();
    const expiryDate = new Date(subscription.expiryDate);

    // Calculate days
    const totalDays = subscription.plan.durationDays;
    const daysUsed = Math.ceil((now.getTime() - subscription.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, totalDays - daysUsed);

    // Calculate refund
    const refundPercentage = (daysRemaining / totalDays) * 100;
    const originalAmount = subscription.plan.price;
    const priceDifference = originalAmount - newPlanPrice;
    const refundAmount = (priceDifference * daysRemaining) / totalDays;

    this.logger.log(
      `Pro-rata refund calculated for user ${userId}: $${refundAmount.toFixed(2)} (${refundPercentage.toFixed(1)}%)`,
    );

    return {
      originalAmount: parseFloat(originalAmount.toFixed(2)),
      daysUsed,
      daysTotal: totalDays,
      refundPercentage: parseFloat(refundPercentage.toFixed(2)),
      refundAmount: Math.round(refundAmount * 100) / 100,
      creditApplied: false,
    };
  }

  /**
   * Apply pro-rata refund - as cash refund
   */
  async applyRefundAsCash(
    userId: string,
    refundAmount: number,
    reason: string,
    paymentMethodToRefund?: string,
  ): Promise<ProRataRefundResult> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId },
      relations: ['plan', 'payments'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Get the payment to refund
    let paymentToRefund = subscription.payments?.[subscription.payments.length - 1];

    if (paymentMethodToRefund) {
      paymentToRefund = subscription.payments?.find(p => p.paymentMethod === paymentMethodToRefund);
    }

    if (!paymentToRefund) {
      throw new BadRequestException('No payment found to refund');
    }

    if (paymentToRefund.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only completed payments can be refunded');
    }

    // Process refund
    const refundedPayment = await this.paymentService.refundPayment(paymentToRefund.id, refundAmount);

    const result = await this.calculateProRataRefund(userId, 0);
    result.creditApplied = false;
    result.refundAmount = refundAmount;
    result.refundTransactionId = refundedPayment.refundTransactionId;

    this.logger.log(
      `Pro-rata refund of $${refundAmount.toFixed(2)} applied as cash for user ${userId}. Reason: ${reason}`,
    );

    return result;
  }

  /**
   * Apply pro-rata refund - as credit for next subscription
   */
  async applyRefundAsCredit(
    userId: string,
    refundAmount: number,
    reason: string,
  ): Promise<ProRataRefundResult> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId },
      relations: ['plan'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Store credit in subscription metadata
    if (!subscription.metadata) {
      subscription.metadata = {};
    }

    subscription.metadata.credits = (subscription.metadata.credits || 0) + refundAmount;
    subscription.metadata.creditHistory = subscription.metadata.creditHistory || [];
    subscription.metadata.creditHistory.push({
      amount: refundAmount,
      reason,
      appliedAt: new Date().toISOString(),
    });

    await this.subscriptionRepository.save(subscription);

    const result = await this.calculateProRataRefund(userId, 0);
    result.creditApplied = true;
    result.creditAmount = refundAmount;

    this.logger.log(
      `Pro-rata refund of $${refundAmount.toFixed(2)} applied as credit for user ${userId}. Reason: ${reason}`,
    );

    return result;
  }

  /**
   * Get refund history for user
   */
  async getRefundHistory(userId: string): Promise<any[]> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId },
      relations: ['payments'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const refunds = subscription.payments
      ?.filter(p => p.status === PaymentStatus.REFUNDED)
      .map(p => ({
        paymentId: p.id,
        refundAmount: p.refundAmount,
        refundedAt: p.refundedAt,
        originalAmount: p.amount,
        method: p.paymentMethod,
        refundTransactionId: p.refundTransactionId,
      }));

    // Add credit history
    const creditHistory = subscription.metadata?.creditHistory || [];

    return [...(refunds || []), ...creditHistory];
  }

  /**
   * Use credit towards next purchase
   */
  async useCredit(userId: string, amountToUse: number): Promise<{
    creditRemaining: number;
    amountUsed: number;
  }> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.metadata) {
      subscription.metadata = {};
    }

    const availableCredit = subscription.metadata.credits || 0;

    if (amountToUse > availableCredit) {
      throw new BadRequestException(
        `Insufficient credit. Available: $${availableCredit.toFixed(2)}, Requested: $${amountToUse.toFixed(2)}`,
      );
    }

    subscription.metadata.credits = availableCredit - amountToUse;
    subscription.metadata.creditUsageHistory = subscription.metadata.creditUsageHistory || [];
    subscription.metadata.creditUsageHistory.push({
      amount: amountToUse,
      usedAt: new Date().toISOString(),
    });

    await this.subscriptionRepository.save(subscription);

    this.logger.log(`User ${userId} used $${amountToUse.toFixed(2)} credit`);

    return {
      creditRemaining: parseFloat(subscription.metadata.credits.toFixed(2)),
      amountUsed: amountToUse,
    };
  }

  /**
   * Get available credit for user
   */
  async getAvailableCredit(userId: string): Promise<number> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription.metadata?.credits || 0;
  }
}
