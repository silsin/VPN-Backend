import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  Min,
  MinLength,
  IsPositive,
} from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({
    example: 'Monthly Premium',
    description: 'Name of the subscription plan',
  })
  @IsString()
  @MinLength(3)
  name: string;

  @ApiProperty({
    example: 'Premium VPN with no ads for 30 days',
    description: 'Detailed description of the plan',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 30,
    description: 'Duration in days (null for free/unlimited)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @ApiProperty({
    example: 4.99,
    description: 'Price in USD',
  })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({
    example: null,
    description: 'Data limit in GB (null for unlimited)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  dataLimitGb?: number;

  @ApiProperty({
    example: 3,
    description: 'Maximum concurrent devices',
    default: 1,
  })
  @IsNumber()
  @Min(1)
  maxDevices: number = 1;

  @ApiProperty({
    example: ['premium_vpn', 'ad_free', 'priority_support'],
    description: 'Array of feature identifiers included in this plan',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  features: string[];

  @ApiProperty({
    example: 1,
    description: 'Display order for UI (lower number = higher priority)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  displayOrder?: number;

  @ApiProperty({
    example: true,
    description: 'Whether this plan is active',
    default: true,
  })
  @IsBoolean()
  isActive: boolean = true;
}
