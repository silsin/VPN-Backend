import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SubscriptionsService } from '../services/subscriptions.service';

/**
 * Guard to check if user has active subscription
 * Usage: @UseGuards(SubscriptionGuard)
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('User not found');
    }

    const isActive = await this.subscriptionsService.isSubscriptionActive(userId);

    if (!isActive) {
      throw new ForbiddenException('Subscription is not active or expired');
    }

    return true;
  }
}
