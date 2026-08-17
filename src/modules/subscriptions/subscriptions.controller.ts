import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionsService } from './services/subscriptions.service';
import { PaymentService } from './services/payment.service';
import { UsageService } from './services/usage.service';
import { NotificationService } from './services/notification.service';
import {
  PurchaseSubscriptionDto,
  ExtendSubscriptionDto,
  CancelSubscriptionDto,
  ToggleAutoRenewalDto,
  PaymentMethodType,
  StripePaymentDetailsDto,
  PayPalPaymentDetailsDto,
  CryptoPaymentDetailsDto,
  GiftCodePaymentDetailsDto,
  GooglePlayPaymentDetailsDto,
  ApplePayPaymentDetailsDto,
} from './dto/purchase-subscription.dto';
import {
  GetSubscriptionHistoryDto,
  GetPaymentsDto,
  PaginationDto,
} from './dto/query-params.dto';

@ApiTags('Subscriptions - User')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly paymentService: PaymentService,
    private readonly usageService: UsageService,
    private readonly notificationService: NotificationService,
  ) {}

  // ============ SUBSCRIPTION PLANS ============

  @Get('plans')
  @ApiOperation({ summary: 'Get all available subscription plans' })
  @ApiResponse({
    status: 200,
    description: 'List of available plans',
    schema: {
      example: {
        plans: [
          {
            id: 'uuid',
            name: 'Monthly',
            price: 4.99,
            durationDays: 30,
            maxDevices: 3,
            features: ['premium_vpn', 'ad_free'],
          },
        ],
      },
    },
  })
  async getPlans() {
    const plans = await this.subscriptionsService.getAllPlans(true);
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
      })),
    };
  }

  // ============ USER SUBSCRIPTION ============

  @Get('my-plan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current subscription details' })
  @ApiResponse({
    status: 200,
    description: 'Current subscription with usage info',
  })
  async getMySubscription(@Request() req) {
    const userId = req.user.id;
    const subscription = await this.subscriptionsService.getUserSubscription(userId);
    const usage = await this.usageService.getUsageSummary(userId);

    if (!subscription) {
      const freePlan = await this.subscriptionsService.getFreePlan();
      return {
        subscription: {
          id: null,
          plan: {
            id: freePlan.id,
            name: freePlan.name,
            price: 0,
          },
          status: 'free',
          startDate: null,
          expiryDate: null,
          daysRemaining: null,
          autoRenewal: false,
        },
        usage,
      };
    }

    return {
      subscription: {
        id: subscription.id,
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          price: subscription.plan.price,
          durationDays: subscription.plan.durationDays,
          features: subscription.plan.features,
          maxDevices: subscription.plan.maxDevices,
        },
        status: subscription.status,
        startDate: subscription.startDate,
        expiryDate: subscription.expiryDate,
        daysRemaining: subscription.getDaysRemaining(),
        autoRenewal: subscription.isAutoRenewal,
        isActive: subscription.isActive(),
      },
      usage,
    };
  }

  // ============ PURCHASE & PAYMENT ============

  @Post('purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Purchase a subscription' })
  @ApiResponse({ status: 201, description: 'Subscription purchased successfully' })
  async purchaseSubscription(
    @Request() req,
    @Body() purchaseDto: PurchaseSubscriptionDto,
  ) {
    const userId = req.user.id;

    try {
      let payment;

      // Process payment based on method using discriminated union
      if (purchaseDto.paymentMethod === PaymentMethodType.STRIPE) {
        const details = purchaseDto.paymentDetails as StripePaymentDetailsDto;
        payment = await this.paymentService.processStripePayment(
          userId,
          purchaseDto.planId,
          details.tokenId,
          {
            couponCode: purchaseDto.couponCode,
          },
        );
      } else if (purchaseDto.paymentMethod === PaymentMethodType.PAYPAL) {
        const details = purchaseDto.paymentDetails as PayPalPaymentDetailsDto;
        payment = await this.paymentService.processPayPalPayment(
          userId,
          purchaseDto.planId,
          details.orderId,
          {
            couponCode: purchaseDto.couponCode,
          },
        );
      } else if (purchaseDto.paymentMethod === PaymentMethodType.GIFT_CODE) {
        const details = purchaseDto.paymentDetails as GiftCodePaymentDetailsDto;
        payment = await this.paymentService.processGiftCodePayment(
          userId,
          purchaseDto.planId,
          details.code,
        );
      } else if (purchaseDto.paymentMethod === PaymentMethodType.CRYPTO) {
        const details = purchaseDto.paymentDetails as CryptoPaymentDetailsDto;
        payment = await this.paymentService.processCryptoPayment(
          userId,
          purchaseDto.planId,
          details.cryptoType,
          details.walletAddress,
        );
      } else if (purchaseDto.paymentMethod === PaymentMethodType.GOOGLE_PLAY) {
        const details = purchaseDto.paymentDetails as GooglePlayPaymentDetailsDto;
        payment = await this.paymentService.processGooglePlayPayment(
          userId,
          purchaseDto.planId,
          details.packageName,
          details.productId,
          details.purchaseToken,
        );
      } else if (purchaseDto.paymentMethod === PaymentMethodType.APPLE_PAY) {
        throw new BadRequestException('Apple Pay integration coming soon');
      } else {
        throw new BadRequestException('Invalid payment method');
      }

      if (payment.status !== 'completed') {
        throw new BadRequestException('Payment processing failed');
      }

      // Create subscription
      const subscription = await this.subscriptionsService.createSubscription(
        userId,
        purchaseDto.planId,
        payment.id,
        purchaseDto.autoRenewal || false,
        { couponCode: purchaseDto.couponCode },
      );

      // Send confirmation email
      await this.notificationService.sendAutoRenewalSuccessNotification(subscription);

      return {
        success: true,
        subscription: {
          id: subscription.id,
          plan: subscription.plan.name,
          startDate: subscription.startDate,
          expiryDate: subscription.expiryDate,
          daysRemaining: subscription.getDaysRemaining(),
          autoRenewal: subscription.isAutoRenewal,
        },
        payment: {
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          transactionId: payment.transactionId,
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Purchase failed');
    }
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upgrade subscription to higher tier' })
  async upgradeSubscription(
    @Request() req,
    @Body() purchaseDto: PurchaseSubscriptionDto,
  ) {
    const userId = req.user.id;
    const currentSub = await this.subscriptionsService.getUserSubscription(userId);

    if (!currentSub) {
      throw new NotFoundException('No active subscription to upgrade');
    }

    try {
      let payment;

      if (purchaseDto.paymentMethod === PaymentMethodType.STRIPE) {
        const details = purchaseDto.paymentDetails as StripePaymentDetailsDto;
        payment = await this.paymentService.processStripePayment(
          userId,
          purchaseDto.planId,
          details.tokenId,
        );
      } else if (purchaseDto.paymentMethod === PaymentMethodType.PAYPAL) {
        const details = purchaseDto.paymentDetails as PayPalPaymentDetailsDto;
        payment = await this.paymentService.processPayPalPayment(
          userId,
          purchaseDto.planId,
          details.orderId,
        );
      } else {
        throw new BadRequestException('Upgrade only supports Stripe and PayPal');
      }

      if (payment.status !== 'completed') {
        throw new BadRequestException('Payment failed');
      }

      const upgraded = await this.subscriptionsService.upgradeSubscription(
        userId,
        purchaseDto.planId,
        payment.id,
      );

      await this.notificationService.sendAutoRenewalSuccessNotification(upgraded);

      return {
        success: true,
        subscription: {
          id: upgraded.id,
          plan: upgraded.plan.name,
          expiryDate: upgraded.expiryDate,
          daysRemaining: upgraded.getDaysRemaining(),
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Upgrade failed');
    }
  }

  @Post('extend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Extend subscription by additional days' })
  async extendSubscription(
    @Request() req,
    @Body() extendDto: ExtendSubscriptionDto,
  ) {
    const userId = req.user.id;

    try {
      let payment;

      if (extendDto.paymentMethod === PaymentMethodType.STRIPE) {
        const details = extendDto.paymentDetails as StripePaymentDetailsDto;
        payment = await this.paymentService.processStripePayment(
          userId,
          'placeholder-plan-id', // Extension doesn't use a specific plan
          details.tokenId,
        );
      } else {
        throw new BadRequestException('Extension only supports Stripe');
      }

      if (payment.status !== 'completed') {
        throw new BadRequestException('Payment failed');
      }

      const extended = await this.subscriptionsService.extendSubscription(
        userId,
        extendDto.extensionDays,
        payment.id,
      );

      return {
        success: true,
        subscription: {
          expiryDate: extended.expiryDate,
          daysRemaining: extended.getDaysRemaining(),
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Extension failed');
    }
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel subscription' })
  async cancelSubscription(
    @Request() req,
    @Body() cancelDto: CancelSubscriptionDto,
  ) {
    const userId = req.user.id;

    try {
      const cancelled = await this.subscriptionsService.cancelSubscription(
        userId,
        cancelDto.reason,
      );

      // Issue refund if applicable
      if (cancelDto.refundType && cancelDto.refundType !== 'none') {
        const payment = (await this.paymentService.getUserPayments(userId, 1, 1)).data[0];
        if (payment) {
          const refundAmount =
            cancelDto.refundType === 'full' ? payment.amount : payment.amount * 0.5;
          await this.paymentService.refundPayment(payment.id, refundAmount);
        }
      }

      return {
        success: true,
        message: 'Subscription cancelled',
        cancelledAt: cancelled.cancelledAt,
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Cancellation failed');
    }
  }

  @Post('renew')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually renew subscription' })
  async renewSubscription(@Request() req) {
    const userId = req.user.id;

    try {
      const renewed = await this.subscriptionsService.renewSubscription(userId);

      return {
        success: true,
        subscription: {
          expiryDate: renewed.expiryDate,
          daysRemaining: renewed.getDaysRemaining(),
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Renewal failed');
    }
  }

  // ============ AUTO-RENEWAL ============

  @Post('toggle-auto-renewal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable or disable auto-renewal' })
  async toggleAutoRenewal(
    @Request() req,
    @Body() toggleDto: ToggleAutoRenewalDto,
  ) {
    const userId = req.user.id;

    try {
      const updated = await this.subscriptionsService.toggleAutoRenewal(
        userId,
        toggleDto.enabled,
      );

      return {
        success: true,
        autoRenewal: updated.isAutoRenewal,
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Toggle failed');
    }
  }

  // ============ USAGE TRACKING ============

  @Get('usage/current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current cycle usage' })
  async getCurrentUsage(@Request() req) {
    const userId = req.user.id;
    const usage = await this.usageService.getUsageSummary(userId);

    return {
      cycle: {
        startDate: usage.cycleStart,
        endDate: usage.cycleEnd,
      },
      dataUsage: {
        usedGB: usage.dataUsed,
        limitGB: usage.dataLimit,
        usedPercent: usage.dataUsedPercent,
        usedBytes: usage.dataUsedBytes,
        limitBytes: usage.dataLimitBytes,
      },
      deviceUsage: {
        active: usage.devicesUsed,
        maxConcurrent: usage.maxDevices,
      },
      isLimitExceeded: usage.isLimitExceeded,
      isNearLimit: usage.isNearLimit,
      daysRemaining: usage.daysRemaining,
      estimatedDailyRate: usage.estimatedDailyRate,
      projectedTotalUsage: usage.projectedTotalUsage,
      willExceedLimit: usage.willExceedLimit,
    };
  }

  // ============ HISTORY & PAYMENTS ============

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get subscription history' })
  async getSubscriptionHistory(
    @Request() req,
    @Query() query: GetSubscriptionHistoryDto,
  ) {
    const userId = req.user.id;
    const page = query.page || 1;
    const limit = query.limit || 20;

    const { data, total } = await this.subscriptionsService.getUserSubscriptionHistory(
      userId,
      page,
      limit,
    );

    return {
      data: data.map((h) => ({
        id: h.id,
        action: h.action,
        planName: h.plan.name,
        startDate: h.startDate,
        expiryDate: h.expiryDate,
        reason: h.reason,
        createdAt: h.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  @Get('payments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment history' })
  async getPayments(@Request() req, @Query() query: GetPaymentsDto) {
    const userId = req.user.id;
    const page = query.page || 1;
    const limit = query.limit || 20;

    const { data, total } = await this.paymentService.getUserPayments(userId, page, limit);

    return {
      data: data.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        method: p.paymentMethod,
        status: p.status,
        transactionId: p.transactionId,
        plan: p.plan.name,
        createdAt: p.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  @Post('validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate subscription status' })
  async validateSubscription(@Request() req) {
    const userId = req.user.id;
    const isActive = await this.subscriptionsService.isSubscriptionActive(userId);

    return {
      isActive,
      timestamp: new Date(),
    };
  }
}
