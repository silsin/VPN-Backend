import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Payment, PaymentStatus, PaymentMethod } from '../entities/payment.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { PurchaseSubscriptionDto } from '../dto/purchase-subscription.dto';
import Stripe from 'stripe';

@Injectable()
export class PaymentService {
  private stripe: Stripe;

  constructor(
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    @InjectRepository(SubscriptionPlan)
    private plansRepository: Repository<SubscriptionPlan>,
    private configService: ConfigService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2023-08-16' });
    }
  }

  /**
   * Create a payment record
   */
  async createPayment(
    userId: string,
    planId: string,
    paymentMethod: PaymentMethod,
    amount?: number,
    metadata?: any,
  ): Promise<Payment> {
    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const payment = this.paymentsRepository.create({
      userId,
      planId,
      paymentMethod,
      amount: amount || plan.price,
      currency: 'USD',
      status: PaymentStatus.PENDING,
      metadata,
    });

    return this.paymentsRepository.save(payment);
  }

  /**
   * Process Stripe payment
   */
  async processStripePayment(
    userId: string,
    planId: string,
    tokenId: string,
    metadata?: any,
  ): Promise<Payment> {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe not configured');
    }

    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    // Create payment record first
    const payment = await this.createPayment(
      userId,
      planId,
      PaymentMethod.STRIPE,
      plan.price,
      { tokenId, ...metadata },
    );

    try {
      // Create Stripe charge
      const charge = await this.stripe.charges.create({
        amount: Math.round(plan.price * 100), // Convert to cents
        currency: 'usd',
        source: tokenId,
        description: `FlyVPN ${plan.name} subscription - User ${userId}`,
        metadata: {
          userId,
          planId,
          paymentId: payment.id,
        },
      });

      // Update payment with transaction ID
      payment.transactionId = charge.id;
      payment.status = PaymentStatus.COMPLETED;
      payment.metadata = {
        ...payment.metadata,
        chargeId: charge.id,
        cardBrand: charge.payment_method_details?.card?.brand,
        cardLast4: charge.payment_method_details?.card?.last4,
      };

      return this.paymentsRepository.save(payment);
    } catch (error) {
      // Update payment as failed
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = error.message || 'Stripe charge failed';

      await this.paymentsRepository.save(payment);
      throw new BadRequestException(`Payment failed: ${error.message}`);
    }
  }

  /**
   * Process PayPal payment
   */
  async processPayPalPayment(
    userId: string,
    planId: string,
    orderId: string,
    metadata?: any,
  ): Promise<Payment> {
    // Placeholder for PayPal integration
    // In production, verify the order with PayPal API

    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const payment = await this.createPayment(
      userId,
      planId,
      PaymentMethod.PAYPAL,
      plan.price,
      { orderId, ...metadata },
    );

    try {
      // TODO: Verify with PayPal API
      // For now, assume payment is successful
      payment.transactionId = orderId;
      payment.status = PaymentStatus.COMPLETED;

      return this.paymentsRepository.save(payment);
    } catch (error) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = error.message;

      await this.paymentsRepository.save(payment);
      throw new BadRequestException(`PayPal payment failed: ${error.message}`);
    }
  }

  /**
   * Process gift code payment
   */
  async processGiftCodePayment(
    userId: string,
    planId: string,
    giftCode: string,
  ): Promise<Payment> {
    // Placeholder for gift code validation
    // In production, validate against gift_codes table

    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const payment = await this.createPayment(
      userId,
      planId,
      PaymentMethod.GIFT_CODE,
      0, // Gift codes have no cost
      { giftCode },
    );

    try {
      // TODO: Validate gift code
      // TODO: Mark gift code as used
      payment.transactionId = giftCode;
      payment.status = PaymentStatus.COMPLETED;

      return this.paymentsRepository.save(payment);
    } catch (error) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = error.message;

      await this.paymentsRepository.save(payment);
      throw new BadRequestException(`Gift code invalid: ${error.message}`);
    }
  }

  /**
   * Process Google Play in-app purchase
   */
  async processGooglePlayPayment(
    userId: string,
    planId: string,
    packageName: string,
    productId: string,
    purchaseToken: string,
  ): Promise<Payment> {
    // For now, create a simple payment record
    // In production, this would call GooglePlayBillingService
    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const payment = this.paymentsRepository.create({
      userId,
      planId,
      amount: plan.price,
      currency: 'USD',
      paymentMethod: PaymentMethod.GOOGLE_PLAY,
      status: PaymentStatus.COMPLETED,
      transactionId: packageName + ':' + productId + ':' + purchaseToken.substring(0, 20),
      metadata: {
        packageName,
        productId,
        purchaseToken,
      },
    });

    return this.paymentsRepository.save(payment);
  }

  /**
   * Process crypto payment
   */
  async processCryptoPayment(
    userId: string,
    planId: string,
    cryptoType: string,
    walletAddress: string,
  ): Promise<Payment> {
    // Placeholder for crypto integration
    // In production, integrate with crypto payment provider

    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const payment = await this.createPayment(
      userId,
      planId,
      PaymentMethod.CRYPTO,
      plan.price,
      { cryptoType, walletAddress },
    );

    // Crypto payments usually require manual confirmation
    payment.status = PaymentStatus.PENDING;

    return this.paymentsRepository.save(payment);
  }

  /**
   * Get payment by ID
   */
  async getPayment(paymentId: string): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
      relations: ['user', 'plan'],
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  /**
   * Get user's payment history
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

  /**
   * Get completed payments by date range
   */
  async getCompletedPayments(startDate: Date, endDate: Date): Promise<Payment[]> {
    return this.paymentsRepository.find({
      where: {
        status: PaymentStatus.COMPLETED,
      },
      relations: ['user', 'plan'],
    });
  }

  /**
   * Mark payment as completed (for admin manual approval)
   */
  async markAsCompleted(paymentId: string, transactionId?: string): Promise<Payment> {
    const payment = await this.getPayment(paymentId);

    payment.status = PaymentStatus.COMPLETED;
    if (transactionId) {
      payment.transactionId = transactionId;
    }

    return this.paymentsRepository.save(payment);
  }

  /**
   * Refund payment
   */
  async refundPayment(paymentId: string, refundAmount?: number): Promise<Payment> {
    const payment = await this.getPayment(paymentId);

    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('Payment already refunded');
    }

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only completed payments can be refunded');
    }

    const amountToRefund = refundAmount || payment.amount;

    if (amountToRefund > payment.amount) {
      throw new BadRequestException('Refund amount cannot exceed payment amount');
    }

    try {
      // Process refund based on payment method
      if (payment.paymentMethod === PaymentMethod.STRIPE && payment.transactionId) {
        const refund = await this.stripe.refunds.create({
          charge: payment.transactionId,
          amount: Math.round(amountToRefund * 100), // Convert to cents
        });

        payment.refundTransactionId = refund.id;
        payment.refundAmount = amountToRefund;
        payment.refundedAt = new Date();
        payment.status = PaymentStatus.REFUNDED;
      } else {
        // For other methods, just mark as refunded (manual processing)
        payment.refundAmount = amountToRefund;
        payment.refundedAt = new Date();
        payment.status = PaymentStatus.REFUNDED;
      }

      return this.paymentsRepository.save(payment);
    } catch (error) {
      throw new InternalServerErrorException(`Refund failed: ${error.message}`);
    }
  }

  /**
   * Get failed payments for retry
   */
  async getFailedPayments(
    retryMinHours: number = 24,
  ): Promise<Payment[]> {
    const retryAfterDate = new Date();
    retryAfterDate.setHours(retryAfterDate.getHours() - retryMinHours);

    return this.paymentsRepository.find({
      where: {
        status: PaymentStatus.FAILED,
      },
      relations: ['user', 'plan'],
    });
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.paymentsRepository
      .createQueryBuilder('p')
      .select('COUNT(*)', 'total_transactions')
      .addSelect('COUNT(*) FILTER (WHERE status = :completed)', 'completed')
      .addSelect('COUNT(*) FILTER (WHERE status = :failed)', 'failed')
      .addSelect('SUM(amount) FILTER (WHERE status = :completed)', 'total_revenue')
      .where('p.createdAt >= :startDate', { startDate })
      .setParameters({
        completed: PaymentStatus.COMPLETED,
        failed: PaymentStatus.FAILED,
      })
      .getRawOne();

    return {
      totalTransactions: parseInt(stats.total_transactions || 0),
      completedTransactions: parseInt(stats.completed || 0),
      failedTransactions: parseInt(stats.failed || 0),
      successRate: stats.total_transactions
        ? ((parseInt(stats.completed || 0) / parseInt(stats.total_transactions)) * 100).toFixed(2)
        : 0,
      totalRevenue: parseFloat(stats.total_revenue || 0),
    };
  }
}
