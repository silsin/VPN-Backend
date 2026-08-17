import { SetMetadata } from '@nestjs/common';

/**
 * Decorator to specify required features for an endpoint
 * Usage: @RequireFeature('premium_vpn', 'ad_free')
 * Must be used with FeatureAccessGuard
 */
export const RequireFeature = (...features: string[]) =>
  SetMetadata('required_features', features);
