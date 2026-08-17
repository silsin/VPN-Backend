import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UsageService } from '../services/usage.service';

/**
 * Guard to check if user has exceeded device limit
 * Usage: @UseGuards(DeviceLimitGuard)
 */
@Injectable()
export class DeviceLimitGuard implements CanActivate {
  constructor(private usageService: UsageService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('User not found');
    }

    const isExceeded = await this.usageService.isDeviceLimitExceeded(userId);

    if (isExceeded) {
      throw new ForbiddenException(
        'Device limit exceeded. Disconnect one device or upgrade your plan.',
      );
    }

    return true;
  }
}
