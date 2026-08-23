import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus, PaymentMethod } from '../entities/payment.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { GooglePlayBillingV2Service } from './google-play-billing-v2.service';

/**
 * Google Play Billing Integration Service (Legacy wrapper)
 * 
 * DEPRECATED: This service is maintained for backwards compatibility.
 * All new code should use GooglePlayBillingV2Service directly.
 * 
 * This service delegates to GooglePlayBillingV2Service for all operations.
 */
@Injectable()
export class GooglePlayBillingService {
  private readonly logger = new Logger(GooglePlayBillingService.name);
  private packageName: string;

  constructor(
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    @InjectRepository(SubscriptionPlan)
    private plansRepository: Repository<SubscriptionPlan>,
    private configService: ConfigService,
    private googlePlayBillingV2Service: GooglePlayBillingV2Service,
  ) {
    this.packageName = this.configService.get<string>('GOOGLE_PLAY_PACKAGE_NAME', '').trim();
  }

  /**
   * Process Google Play in-app purchase/subscription
   * Delegates to V2 service
   */
  async processGooglePlayPurchase(
    userId: string,
    planId: string,
    packageName: string,
    productId: string,
    purchaseToken: string,
  ): Promise<Payment> {
    if (!this.googlePlayBillingV2Service.isEnabled()) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    // Verify purchase with Google using V2 API
    const verification = await this.googlePlayBillingV2Service.verifySubscription(
      packageName,
      purchaseToken,
      productId,
    );

    if (!verification.valid) {
      throw new BadRequestException('Purchase verification failed');
    }

    // Get plan details
    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    // Create payment record
    const tokenHash = GooglePlayBillingV2Service.hashPurchaseToken(purchaseToken);
    const payment = this.paymentsRepository.create({
      userId,
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
        subscriptionState: verification.subscriptionState,
        acknowledgementState: verification.acknowledgementState,
      },
    });

    return this.paymentsRepository.save(payment);
  }

  /**
   * Acknowledge Google Play purchase
   * Delegates to V2 service
   */
  async acknowledgePurchase(
    packageName: string,
    purchaseToken: string,
  ): Promise<void> {
    if (!this.googlePlayBillingV2Service.isEnabled()) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    await this.googlePlayBillingV2Service.acknowledgePurchase(
      packageName,
      purchaseToken,
    );
  }

  /**
   * Get subscription details
   * Delegates to V2 service
   */
  async getSubscriptionDetails(
    packageName: string,
    purchaseToken: string,
  ): Promise<any> {
    if (!this.googlePlayBillingV2Service.isEnabled()) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    return this.googlePlayBillingV2Service.getSubscriptionDetails(
      packageName,
      purchaseToken,
    );
  }

  /**
   * Handle Real-time Developer Notifications from Google Play
   * Fetches authoritative state using V2 API
   */
  async handlePlayNotification(message: any): Promise<void> {
    try {
      // Decode the Pub/Sub message
      const data = JSON.parse(
        Buffer.from(message.data, 'base64').toString('utf-8'),
      );

      const { packageName, purchaseToken, subscriptionNotificationType } = data;

      this.logger.log(
        `📬 RTDN received: type=${subscriptionNotificationType}`,
      );

      // Always fetch authoritative state from Google Play using V2 API
      // Don't trust the notification type alone
      const verification = await this.googlePlayBillingV2Service.handleRealtimeNotification(
        packageName,
        purchaseToken,
        subscriptionNotificationType,
      );

      this.logger.log(
        `📊 RTDN state fetched: active=${verification.active}, state=${verification.subscriptionState}`,
      );
    } catch (error) {
      this.logger.error(`Failed to handle Play notification: ${error.message}`);
    }
  }

  /**
   * Check if Google Play Billing is enabled
   */
  isEnabled(): boolean {
    return this.googlePlayBillingV2Service.isEnabled();
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

