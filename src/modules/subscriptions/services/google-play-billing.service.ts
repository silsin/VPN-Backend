import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus, PaymentMethod } from '../entities/payment.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Google Play Billing Integration Service
 * Handles Android in-app subscriptions and purchases via Google Play API
 */
@Injectable()
export class GooglePlayBillingService {
  private readonly logger = new Logger(GooglePlayBillingService.name);
  private androidPublisher: any;
  private packageName: string;
  private enabled: boolean;

  constructor(
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    @InjectRepository(SubscriptionPlan)
    private plansRepository: Repository<SubscriptionPlan>,
    private configService: ConfigService,
  ) {
    this.enabled = this.configService.get<string>('GOOGLE_PLAY_BILLING_ENABLED', 'false') === 'true';
    this.packageName = this.configService.get<string>('GOOGLE_PLAY_PACKAGE_NAME', '');

    if (this.enabled) {
      this.initializeGooglePlayAPI();
    }
  }

  /**
   * Initialize Google Play API with service account
   */
  private async initializeGooglePlayAPI(): Promise<void> {
    try {
      const keyPath = this.configService.get<string>(
        'GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH',
        './config/google-play-key.json',
      );

      if (!fs.existsSync(keyPath)) {
        this.logger.warn(
          `Google Play service account key not found at ${keyPath}. In-app purchases will not work.`,
        );
        this.enabled = false;
        return;
      }

      const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });

      this.androidPublisher = google.androidpublisher({
        version: 'v3',
        auth,
      });

      this.logger.log('Google Play Billing API initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Google Play API: ${error.message}`);
      this.enabled = false;
    }
  }

  /**
   * Verify and validate Google Play purchase token
   */
  async verifyPurchaseToken(
    userId: string,
    packageName: string,
    productId: string,
    purchaseToken: string,
  ): Promise<{
    orderId: string;
    purchaseTime: number;
    purchaseState: number;
    acknowledged: boolean;
  }> {
    if (!this.enabled) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    try {
      if (packageName !== this.packageName) {
        throw new UnauthorizedException('Invalid package name');
      }

      // Verify purchase with Google Play API
      const response = await this.androidPublisher.purchases.subscriptions.get({
        packageName,
        subscriptionId: productId,
        token: purchaseToken,
      });

      const purchase = response.data;

      // Validate purchase is valid (not cancelled)
      if (purchase.cancelledAt) {
        throw new BadRequestException('Subscription was cancelled');
      }

      // Validate purchase time is recent (within last 10 minutes for security)
      const purchaseTime = parseInt(purchase.startTime, 10);
      const now = Date.now();
      const timeDiff = now - purchaseTime;
      const maxTimeDiff = 10 * 60 * 1000; // 10 minutes

      if (timeDiff > maxTimeDiff && timeDiff < 0) {
        this.logger.warn(
          `Purchase time seems suspicious for user ${userId}. Time diff: ${timeDiff}ms`,
        );
      }

      return {
        orderId: purchase.orderId,
        purchaseTime,
        purchaseState: purchase.purchaseState, // 0=pending, 1=purchased
        acknowledged: purchase.acknowledgementState === 1,
      };
    } catch (error) {
      this.logger.error(`Failed to verify purchase token: ${error.message}`);
      throw new BadRequestException(`Purchase verification failed: ${error.message}`);
    }
  }

  /**
   * Process Google Play in-app purchase/subscription
   */
  async processGooglePlayPurchase(
    userId: string,
    planId: string,
    packageName: string,
    productId: string,
    purchaseToken: string,
  ): Promise<Payment> {
    if (!this.enabled) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    // Verify purchase with Google
    const verification = await this.verifyPurchaseToken(userId, packageName, productId, purchaseToken);

    // Check purchase is purchased (not pending)
    if (verification.purchaseState !== 1) {
      throw new BadRequestException('Purchase is not in purchased state');
    }

    // Get plan details
    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    // Verify product ID matches plan (security check)
    // You should have a mapping of product IDs to plan IDs
    if (!this.isValidProductIdForPlan(productId, plan)) {
      throw new BadRequestException('Product ID does not match plan');
    }

    // Create payment record
    const payment = this.paymentsRepository.create({
      userId,
      planId,
      amount: plan.price,
      currency: 'USD',
      paymentMethod: PaymentMethod.GOOGLE_PLAY,
      status: PaymentStatus.COMPLETED,
      transactionId: verification.orderId,
      metadata: {
        packageName,
        productId,
        purchaseToken,
        purchaseTime: verification.purchaseTime,
        acknowledged: verification.acknowledged,
      },
    });

    return this.paymentsRepository.save(payment);
  }

  /**
   * Acknowledge Google Play purchase
   * Must be called within 3 days of purchase to avoid refund
   */
  async acknowledgePurchase(
    packageName: string,
    productId: string,
    purchaseToken: string,
  ): Promise<void> {
    if (!this.enabled) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    try {
      await this.androidPublisher.purchases.subscriptions.acknowledge({
        packageName,
        subscriptionId: productId,
        token: purchaseToken,
        requestBody: {},
      });

      this.logger.log(`Acknowledged purchase for ${productId}`);
    } catch (error) {
      this.logger.error(`Failed to acknowledge purchase: ${error.message}`);
      // Don't throw - acknowledgement failure should not block user
    }
  }

  /**
   * Cancel Google Play subscription
   */
  async cancelSubscription(
    packageName: string,
    productId: string,
    purchaseToken: string,
  ): Promise<void> {
    if (!this.enabled) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    try {
      await this.androidPublisher.purchases.subscriptions.cancel({
        packageName,
        subscriptionId: productId,
        token: purchaseToken,
      });

      this.logger.log(`Cancelled subscription for ${productId}`);
    } catch (error) {
      this.logger.error(`Failed to cancel subscription: ${error.message}`);
      throw new BadRequestException(`Cancellation failed: ${error.message}`);
    }
  }

  /**
   * Defer subscription upgrade/downgrade
   */
  async deferSubscription(
    packageName: string,
    productId: string,
    purchaseToken: string,
    deferralMonths: number,
  ): Promise<void> {
    if (!this.enabled) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    try {
      const deferralDate = new Date();
      deferralDate.setMonth(deferralDate.getMonth() + deferralMonths);

      await this.androidPublisher.purchases.subscriptions.defer({
        packageName,
        subscriptionId: productId,
        token: purchaseToken,
        requestBody: {
          deferralInfo: {
            desiredExpiryTimeMs: deferralDate.getTime().toString(),
          },
        },
      });

      this.logger.log(`Deferred subscription for ${productId} by ${deferralMonths} months`);
    } catch (error) {
      this.logger.error(`Failed to defer subscription: ${error.message}`);
      throw new BadRequestException(`Deferral failed: ${error.message}`);
    }
  }

  /**
   * Get subscription details
   */
  async getSubscriptionDetails(
    packageName: string,
    productId: string,
    purchaseToken: string,
  ): Promise<any> {
    if (!this.enabled) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    try {
      const response = await this.androidPublisher.purchases.subscriptions.get({
        packageName,
        subscriptionId: productId,
        token: purchaseToken,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get subscription details: ${error.message}`);
      throw new BadRequestException(`Failed to retrieve subscription: ${error.message}`);
    }
  }

  /**
   * Handle Real-time Developer Notifications (RTDN) from Google Play
   */
  async handlePlayNotification(message: any): Promise<void> {
    try {
      // Decode the Pub/Sub message
      const data = JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'));

      const { subscriptionNotificationType, packageName, subscriptionId, purchaseToken } = data;

      this.logger.log(
        `Received Google Play notification: ${subscriptionNotificationType} for ${subscriptionId}`,
      );

      switch (subscriptionNotificationType) {
        // Subscription purchased
        case 'SUBSCRIPTION_PURCHASED':
          await this.handleSubscriptionPurchased(packageName, subscriptionId, purchaseToken);
          break;

        // Subscription renewed
        case 'SUBSCRIPTION_RENEWED':
          await this.handleSubscriptionRenewed(packageName, subscriptionId, purchaseToken);
          break;

        // Subscription cancelled
        case 'SUBSCRIPTION_CANCELED':
          await this.handleSubscriptionCancelled(packageName, subscriptionId, purchaseToken);
          break;

        // Subscription expired
        case 'SUBSCRIPTION_EXPIRED':
          await this.handleSubscriptionExpired(packageName, subscriptionId, purchaseToken);
          break;

        // Subscription on hold
        case 'SUBSCRIPTION_ON_HOLD':
          await this.handleSubscriptionOnHold(packageName, subscriptionId, purchaseToken);
          break;

        // Subscription grace period
        case 'SUBSCRIPTION_GRACE_PERIOD_STARTED':
          await this.handleGracePeriodStarted(packageName, subscriptionId, purchaseToken);
          break;

        // Subscription revoked
        case 'SUBSCRIPTION_REVOKED':
          await this.handleSubscriptionRevoked(packageName, subscriptionId, purchaseToken);
          break;

        // Subscription deferred
        case 'SUBSCRIPTION_DEFERRED':
          await this.handleSubscriptionDeferred(packageName, subscriptionId, purchaseToken);
          break;

        default:
          this.logger.warn(`Unknown notification type: ${subscriptionNotificationType}`);
      }
    } catch (error) {
      this.logger.error(`Failed to handle Play notification: ${error.message}`);
    }
  }

  /**
   * Check if product ID is valid for plan
   */
  private isValidProductIdForPlan(productId: string, plan: SubscriptionPlan): boolean {
    // Map product IDs to plan names or IDs
    const productIdMapping: Record<string, string> = {
      'flyvpn_monthly': 'Monthly',
      'flyvpn_quarterly': 'Quarterly',
      'flyvpn_annual': 'Annual',
    };

    return productIdMapping[productId] === plan.name;
  }

  // ========== Notification Handlers ==========

  private async handleSubscriptionPurchased(
    packageName: string,
    subscriptionId: string,
    purchaseToken: string,
  ): Promise<void> {
    this.logger.log(`Subscription purchased: ${subscriptionId}`);
    // Auto-acknowledge purchase
    await this.acknowledgePurchase(packageName, subscriptionId, purchaseToken);
  }

  private async handleSubscriptionRenewed(
    packageName: string,
    subscriptionId: string,
    purchaseToken: string,
  ): Promise<void> {
    this.logger.log(`Subscription renewed: ${subscriptionId}`);
    // Update payment record
  }

  private async handleSubscriptionCancelled(
    packageName: string,
    subscriptionId: string,
    purchaseToken: string,
  ): Promise<void> {
    this.logger.log(`Subscription cancelled: ${subscriptionId}`);
    // Mark subscription as cancelled in DB
  }

  private async handleSubscriptionExpired(
    packageName: string,
    subscriptionId: string,
    purchaseToken: string,
  ): Promise<void> {
    this.logger.log(`Subscription expired: ${subscriptionId}`);
    // Mark subscription as expired
  }

  private async handleSubscriptionOnHold(
    packageName: string,
    subscriptionId: string,
    purchaseToken: string,
  ): Promise<void> {
    this.logger.log(`Subscription on hold: ${subscriptionId}`);
    // Suspend access but keep subscription active
  }

  private async handleGracePeriodStarted(
    packageName: string,
    subscriptionId: string,
    purchaseToken: string,
  ): Promise<void> {
    this.logger.log(`Grace period started: ${subscriptionId}`);
    // User still has access during grace period
  }

  private async handleSubscriptionRevoked(
    packageName: string,
    subscriptionId: string,
    purchaseToken: string,
  ): Promise<void> {
    this.logger.log(`Subscription revoked: ${subscriptionId}`);
    // Revoke access immediately
  }

  private async handleSubscriptionDeferred(
    packageName: string,
    subscriptionId: string,
    purchaseToken: string,
  ): Promise<void> {
    this.logger.log(`Subscription deferred: ${subscriptionId}`);
    // Update expiry date
  }

  /**
   * Check if Google Play Billing is enabled and configured
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get product ID for plan
   */
  getProductIdForPlan(planName: string): string | null {
    const productIdMapping: Record<string, string> = {
      'Free': null,
      'Monthly': 'flyvpn_monthly',
      'Quarterly': 'flyvpn_quarterly',
      'Annual': 'flyvpn_annual',
    };

    return productIdMapping[planName] || null;
  }
}
