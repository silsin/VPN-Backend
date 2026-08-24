import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FcmService } from './services/fcm.service';
import { SubscriptionsService } from './services/subscriptions.service';
import { PauseService } from './services/pause.service';
import { TrialService } from './services/trial.service';
import { SubscriptionStatus } from './entities/user-subscription.entity';

@ApiTags('Subscriptions - User')
@Controller('subscriptions')
export class SubscriptionsController {
  private logger = new Logger(SubscriptionsController.name);

  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly fcmService: FcmService,
    private readonly pauseService: PauseService,
    private readonly trialService: TrialService,
  ) {}

  // ============ PUBLIC PLAN DISCOVERY (No Auth Required) ============

  @Get('plans')
  @ApiOperation({ summary: 'Get all available subscription plans (Public)' })
  async getAvailablePlans() {
    try {
      const plans = await this.subscriptionsService.getAllPlans(false);

      return {
        success: true,
        plans: plans.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: parseFloat(p.price.toString()),
          durationDays: p.durationDays,
          dataLimitGb: p.dataLimitGb,
          maxDevices: p.maxDevices,
          features: p.features,
          hasFreeTrial: p.hasFreeTrial,
          trialDays: p.trialDays,
          displayOrder: p.displayOrder,
          isActive: p.isActive,
        })),
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('plans/:planId')
  @ApiOperation({ summary: 'Get subscription plan details (Public)' })
  async getPlanDetails(@Param('planId') planId: string) {
    try {
      const plan = await this.subscriptionsService.getPlanById(planId);

      if (!plan || !plan.isActive) {
        throw new NotFoundException('Plan not found or inactive');
      }

      return {
        success: true,
        plan: {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          price: parseFloat(plan.price.toString()),
          durationDays: plan.durationDays,
          dataLimitGb: plan.dataLimitGb,
          maxDevices: plan.maxDevices,
          features: plan.features,
          hasFreeTrial: plan.hasFreeTrial,
          trialDays: plan.trialDays,
          displayOrder: plan.displayOrder,
          isActive: plan.isActive,
          createdAt: plan.createdAt,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  // ============ AUTHENTICATED ENDPOINTS (JWT Required) ============

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user subscription' })
  @ApiOperation({ summary: 'Get current user subscription' })
  async getMySubscription(@Request() req) {
    const userId = req.user?.id;
    const subscription = await this.subscriptionsService.getUserSubscription(userId);

    if (!subscription) {
      return {
        subscription: null,
        isActive: false,
        message: 'No active subscription',
      };
    }

    return {
      subscription,
      isActive: subscription.isActive(),
      daysRemaining: subscription.getDaysRemaining(),
    };
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current usage for subscription' })
  async getUsage(@Request() req) {
    const userId = req.user?.id;
    const subscription = await this.subscriptionsService.getUserSubscription(userId);

    if (!subscription) {
      throw new NotFoundException('No subscription found');
    }

    // Note: Usage tracking would need to be imported from UsageService
    // This is a placeholder
    return {
      message: 'Usage endpoint - integrate with UsageService',
    };
  }

  // ============ DEVICE TOKEN MANAGEMENT ============

  @Post('device-tokens/register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Register device for push notifications' })
  async registerDeviceToken(
    @Request() req,
    @Body()
    body: {
      token: string;
      deviceName?: string;
      deviceType?: string;
      osVersion?: string;
      appVersion?: string;
    },
  ) {
    const userId = req.user?.id;

    if (!body.token || body.token.trim().length === 0) {
      throw new BadRequestException('Invalid token');
    }

    const deviceToken = await this.fcmService.registerDeviceToken(
      userId,
      body.token.trim(),
      body.deviceName,
      body.deviceType,
      body.osVersion,
      body.appVersion,
    );

    return {
      success: true,
      message: 'Device token registered',
      data: {
        id: deviceToken.id,
        deviceName: deviceToken.deviceName,
        deviceType: deviceToken.deviceType,
      },
    };
  }

  @Delete('device-tokens/:token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Unregister device from push notifications' })
  async unregisterDeviceToken(@Request() req, @Body() body: { token: string }) {
    if (!body.token) {
      throw new BadRequestException('Token required');
    }

    await this.fcmService.unregisterDeviceToken(body.token);

    return {
      success: true,
      message: 'Device token unregistered',
    };
  }

  @Get('device-tokens')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all registered devices' })
  async listDeviceTokens(@Request() req) {
    const userId = req.user?.id;
    const tokens = await this.fcmService.getUserDeviceTokens(userId);

    return {
      success: true,
      data: tokens.map((t) => ({
        id: t.id,
        deviceName: t.deviceName,
        deviceType: t.deviceType,
        osVersion: t.osVersion,
        appVersion: t.appVersion,
        isActive: t.isActive,
        lastUsedAt: t.lastUsedAt,
      })),
    };
  }

  // ============ FREE TRIAL ============

  @Get('trial/eligible/:planId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if user is eligible for free trial' })
  async checkTrialEligibility(@Request() req, @Param('planId') planId: string) {
    try {
      const userId = req.user?.id;
      const eligibility = await this.trialService.checkTrialEligibility(userId, planId);

      return {
        success: true,
        data: eligibility,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('trial/redeem/:planId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Redeem free trial for plan' })
  async redeemTrial(@Request() req, @Param('planId') planId: string) {
    try {
      const userId = req.user?.id;
      const result = await this.trialService.redeemTrial(userId, planId);

      return {
        success: true,
        message: result.message,
        subscription: {
          id: result.subscription.id,
          planName: result.subscription.plan.name,
          status: result.subscription.status,
          trialEndDate: result.trialEndDate,
          daysRemaining: result.subscription.getTrialDaysRemaining(),
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ============ PAUSE & RESUME ============

  @Post('purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Purchase subscription plan' })
  async purchaseSubscription(
    @Request() req,
    @Body()
    body: {
      planId: string;
      paymentMethod: string;
      googlePlayDetails?: {
        purchaseToken: string;
        packageName: string;
        productId: string;
      };
    },
  ) {
    try {
      const userId = req.user?.id;

      if (!body.planId) {
        throw new BadRequestException('planId is required');
      }

      if (!body.paymentMethod) {
        throw new BadRequestException('paymentMethod is required');
      }

      // Debug logging for Google Play purchases
      if (body.paymentMethod === 'google_play' && body.googlePlayDetails) {
        const token = body.googlePlayDetails.purchaseToken;
        this.logger.log(`
🔍 DEBUG: Google Play Purchase Request Received
- Full Token: ${token}
- Token length: ${token?.length || 0} chars (expected: 500+)
- Token prefix (first 100): ${token?.substring(0, 100) || 'NONE'}
- Product ID: ${body.googlePlayDetails.productId}
- Package Name: ${body.googlePlayDetails.packageName}
- Plan ID: ${body.planId}
- Request body size: ${JSON.stringify(body).length} bytes
        `);

        // Validate token length
        if (!token || token.length < 100) {
          this.logger.error(
            `❌ CRITICAL: Purchase token too short! Length: ${token?.length || 0}. This indicates the Flutter app is not sending a valid purchase token. Full token received: ${token}`,
          );
          throw new BadRequestException({
            code: 'INVALID_PURCHASE_TOKEN',
            message: `Purchase token is invalid. Length: ${token?.length || 0}. Expected 500+. Check Flutter app implementation.`,
            details: {
              tokenLength: token?.length || 0,
              expectedLength: 500,
              tokenReceived: token?.substring(0, 50),
            },
          });
        }
      }

      let subscription;

      if (body.paymentMethod === 'google_play') {
        if (!body.googlePlayDetails) {
          throw new BadRequestException('googlePlayDetails required for Google Play purchases');
        }

        subscription = await this.subscriptionsService.purchaseWithGooglePlay(
          userId,
          body.planId,
          body.googlePlayDetails.purchaseToken,
          body.googlePlayDetails.packageName,
          body.googlePlayDetails.productId,
        );
      } else {
        throw new BadRequestException(`Payment method '${body.paymentMethod}' not supported`);
      }

      return {
        success: true,
        message: 'Purchase successful',
        subscription: {
          id: subscription.id,
          planName: subscription.plan.name,
          status: subscription.status,
          expiryDate: subscription.expiryDate,
          daysRemaining: subscription.getDaysRemaining(),
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ============ GOOGLE PLAY WEBHOOK ============

  @Post('google-play-webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Google Play subscription webhook (notifications)' })
  async handleGooglePlayWebhook(@Body() body: any) {
    try {
      const { userId, notificationType, purchaseToken } = body;

      if (!userId || !notificationType) {
        throw new BadRequestException('Invalid webhook payload');
      }

      // Handle different notification types
      switch (notificationType) {
        case 'SUBSCRIPTION_CANCELED':
          await this.handleSubscriptionCancelled(userId);
          break;
        case 'SUBSCRIPTION_RECOVERED':
          await this.handleSubscriptionRecovered(userId);
          break;
        case 'SUBSCRIPTION_EXPIRED':
          await this.handleSubscriptionExpired(userId);
          break;
        case 'SUBSCRIPTION_ON_HOLD':
          await this.handleSubscriptionOnHold(userId);
          break;
        case 'SUBSCRIPTION_IN_GRACE_PERIOD':
          await this.handleSubscriptionGracePeriod(userId);
          break;
        default:
          this.logger.warn(`Unknown Google Play notification: ${notificationType}`);
      }

      return { success: true, message: 'Webhook processed' };
    } catch (error) {
      this.logger.error(`Webhook error: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  private async handleSubscriptionCancelled(userId: string): Promise<void> {
    const subscription = await this.subscriptionsService.getUserSubscription(userId);
    if (!subscription) return;

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.cancelledAt = new Date();
    subscription.cancelledReason = 'User cancelled in Google Play';
    subscription.isAutoRenewal = false;

    await this.subscriptionsService.updateSubscription(subscription);
    this.logger.log(`📱 Subscription cancelled for user ${userId} via Google Play`);
  }

  private async handleSubscriptionRecovered(userId: string): Promise<void> {
    const subscription = await this.subscriptionsService.getUserSubscription(userId);
    if (!subscription) return;

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.cancelledAt = null;
      subscription.cancelledReason = null;
      subscription.isAutoRenewal = true;

      await this.subscriptionsService.updateSubscription(subscription);
      this.logger.log(`✅ Subscription recovered for user ${userId}`);
    }
  }

  private async handleSubscriptionExpired(userId: string): Promise<void> {
    const subscription = await this.subscriptionsService.getUserSubscription(userId);
    if (!subscription) return;

    subscription.status = SubscriptionStatus.EXPIRED;
    subscription.expiryDate = new Date();

    await this.subscriptionsService.updateSubscription(subscription);
    this.logger.log(`⏰ Subscription expired for user ${userId}`);
  }

  private async handleSubscriptionOnHold(userId: string): Promise<void> {
    const subscription = await this.subscriptionsService.getUserSubscription(userId);
    if (!subscription) return;

    subscription.status = SubscriptionStatus.SUSPENDED;
    subscription.suspendedAt = new Date();
    subscription.suspendedReason = 'On hold in Google Play (payment retry)';

    await this.subscriptionsService.updateSubscription(subscription);
    this.logger.log(`⏸️ Subscription on hold for user ${userId}`);
  }

  private async handleSubscriptionGracePeriod(userId: string): Promise<void> {
    this.logger.log(`⏳ Subscription in grace period for user ${userId}`);
  }

  @Post('pause')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Pause your subscription' })
  async pauseSubscription(@Request() req, @Body() body: { reason?: string }) {
    try {
      const userId = req.user?.id;
      const subscription = await this.subscriptionsService.getUserSubscription(userId);

      if (!subscription) {
        throw new NotFoundException('No subscription found');
      }

      const result = await this.pauseService.pauseSubscription(
        subscription.id,
        userId,
        body.reason || 'User requested',
      );

      return {
        success: true,
        message: 'Subscription paused successfully',
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('resume')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Resume your paused subscription' })
  async resumeSubscription(@Request() req) {
    try {
      const userId = req.user?.id;
      const subscription = await this.subscriptionsService.getUserSubscription(userId);

      if (!subscription) {
        throw new NotFoundException('No subscription found');
      }

      const result = await this.pauseService.resumeSubscription(subscription.id, userId);

      return {
        success: true,
        message: 'Subscription resumed successfully',
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('pause-history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pause history for your subscription' })
  async getPauseHistory(@Request() req) {
    try {
      const userId = req.user?.id;
      const subscription = await this.subscriptionsService.getUserSubscription(userId);

      if (!subscription) {
        throw new NotFoundException('No subscription found');
      }

      const history = await this.pauseService.getPauseHistory(subscription.id);

      return {
        success: true,
        data: history,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
