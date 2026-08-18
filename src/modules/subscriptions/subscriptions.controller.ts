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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FcmService } from './services/fcm.service';
import { SubscriptionsService } from './services/subscriptions.service';
import { PauseService } from './services/pause.service';
import { TrialService } from './services/trial.service';

@ApiTags('Subscriptions - User')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly fcmService: FcmService,
    private readonly pauseService: PauseService,
    private readonly trialService: TrialService,
  ) {}

  @Get('me')
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

  @Post('pause')
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
