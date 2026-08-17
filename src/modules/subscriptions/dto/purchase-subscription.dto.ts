import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentMethodType {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  CRYPTO = 'crypto',
  GIFT_CODE = 'gift_code',
  GOOGLE_PLAY = 'google_play', // Android in-app billing
  APPLE_PAY = 'apple_pay', // iOS in-app billing
}

export class StripePaymentDetailsDto {
  @ApiProperty({
    example: 'tok_visa',
    description: 'Stripe payment method token or saved card ID',
  })
  @IsString()
  tokenId: string;

  @ApiProperty({
    example: true,
    description: 'Whether to save this payment method for future use',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  savePaymentMethod?: boolean;
}

export class PayPalPaymentDetailsDto {
  @ApiProperty({
    example: 'PAYID-12345678',
    description: 'PayPal order ID',
  })
  @IsString()
  orderId: string;
}

export class CryptoPaymentDetailsDto {
  @ApiProperty({
    example: 'bitcoin',
    description: 'Cryptocurrency type',
  })
  @IsString()
  cryptoType: string;

  @ApiProperty({
    example: '0x1234567890abcdef',
    description: 'Wallet address',
  })
  @IsString()
  walletAddress: string;
}

export class GiftCodePaymentDetailsDto {
  @ApiProperty({
    example: 'GIFTCODE123456',
    description: 'Gift code for redemption',
  })
  @IsString()
  code: string;
}

export class GooglePlayPaymentDetailsDto {
  @ApiProperty({
    example: 'com.example.flyvpn',
    description: 'Google Play package name',
  })
  @IsString()
  packageName: string;

  @ApiProperty({
    example: 'flyvpn_monthly',
    description: 'Google Play product ID (SKU)',
  })
  @IsString()
  productId: string;

  @ApiProperty({
    example: 'inapp_purchase_token_123456789',
    description: 'Purchase token from Google Play Billing Library',
  })
  @IsString()
  purchaseToken: string;
}

export class ApplePayPaymentDetailsDto {
  @ApiProperty({
    example: 'apple_transaction_id_123456',
    description: 'Apple transaction ID',
  })
  @IsString()
  transactionId: string;

  @ApiProperty({
    example: 'app_receipt_data_base64',
    description: 'App receipt data from Apple',
  })
  @IsString()
  receiptData: string;
}

export class PurchaseSubscriptionDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Plan ID to purchase',
  })
  @IsUUID()
  planId: string;

  @ApiProperty({
    example: 'stripe',
    description: 'Payment method',
    enum: PaymentMethodType,
  })
  @IsString()
  paymentMethod: PaymentMethodType;

  @ApiProperty({
    description: 'Payment method specific details',
    type: 'object',
    oneOf: [
      { $ref: '#/components/schemas/StripePaymentDetailsDto' },
      { $ref: '#/components/schemas/PayPalPaymentDetailsDto' },
      { $ref: '#/components/schemas/GooglePlayPaymentDetailsDto' },
      { $ref: '#/components/schemas/ApplePayPaymentDetailsDto' },
    ],
  })
  paymentDetails: StripePaymentDetailsDto | PayPalPaymentDetailsDto | CryptoPaymentDetailsDto | GiftCodePaymentDetailsDto | GooglePlayPaymentDetailsDto | ApplePayPaymentDetailsDto;

  @ApiProperty({
    example: 'SAVE20',
    description: 'Promo or discount code',
    required: false,
  })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiProperty({
    example: true,
    description: 'Enable auto-renewal',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  autoRenewal?: boolean;
}

export class ExtendSubscriptionDto {
  @ApiProperty({
    example: 30,
    description: 'Number of days to extend',
  })
  extensionDays: number;

  @ApiProperty({
    example: 'stripe',
    description: 'Payment method',
    enum: PaymentMethodType,
  })
  @IsString()
  paymentMethod: PaymentMethodType;

  @ApiProperty({
    description: 'Payment details',
    type: 'object',
  })
  @ValidateNested()
  paymentDetails: any;

  @ApiProperty({
    example: 'SAVE20',
    description: 'Promo code',
    required: false,
  })
  @IsOptional()
  @IsString()
  couponCode?: string;
}

export class CancelSubscriptionDto {
  @ApiProperty({
    example: 'Too expensive',
    description: 'Reason for cancellation',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    example: 'full',
    description: 'Refund type',
    required: false,
    enum: ['full', 'partial', 'none'],
  })
  @IsOptional()
  @IsString()
  refundType?: 'full' | 'partial' | 'none';
}

export class ToggleAutoRenewalDto {
  @ApiProperty({
    example: true,
    description: 'Enable or disable auto-renewal',
  })
  @IsBoolean()
  enabled: boolean;
}
