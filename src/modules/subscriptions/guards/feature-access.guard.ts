import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionsService } from '../services/subscriptions.service';

/**
 * Guard to check if user has access to a specific feature
 * Usage: @UseGuards(FeatureAccessGuard) @RequireFeature('premium_vpn')
 */
@Injectable()
export class FeatureAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.get<string[]>(
      'required_features',
      context.getHandler(),
    );

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true; // No features required
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('User not found');
    }

    // Get user's subscription
    const subscription = await this.subscriptionsService.getUserSubscription(userId);

    // Check if subscription is suspended
    if (subscription && subscription.isSuspended()) {
      throw new ForbiddenException(
        `Access denied. Subscription suspended. Reason: ${subscription.suspendedReason || 'Not specified'}`,
      );
    }

    // Check if user has any of the required features
    for (const feature of requiredFeatures) {
      const hasFeature = await this.subscriptionsService.userHasFeature(userId, feature);
      if (hasFeature) {
        return true;
      }
    }

    throw new ForbiddenException(`Access denied. Required features: ${requiredFeatures.join(', ')}`);
  }
}
