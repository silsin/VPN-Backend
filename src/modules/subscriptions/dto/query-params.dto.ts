import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @ApiProperty({
    example: 1,
    description: 'Page number',
    required: false,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page: number = 1;

  @ApiProperty({
    example: 20,
    description: 'Items per page',
    required: false,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit: number = 20;
}

export class GetSubscriptionHistoryDto extends PaginationDto {
  @ApiProperty({
    example: 'purchased',
    description: 'Filter by action',
    required: false,
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiProperty({
    example: '2024-01-01',
    description: 'Filter from date (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiProperty({
    example: '2024-12-31',
    description: 'Filter to date (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsString()
  to?: string;
}

export class GetPaymentsDto extends PaginationDto {
  @ApiProperty({
    example: 'completed',
    description: 'Filter by status',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    example: 'stripe',
    description: 'Filter by payment method',
    required: false,
  })
  @IsOptional()
  @IsString()
  method?: string;
}

export class AdminSubscriptionQueryDto extends PaginationDto {
  @ApiProperty({
    example: 'active',
    description: 'Filter by subscription status',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Filter by plan ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiProperty({
    example: true,
    description: 'Filter by auto-renewal status',
    required: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  autoRenewal?: boolean;

  @ApiProperty({
    example: 'expiring_soon',
    description: 'Special filter: expiring_soon (7 days), expired_today, etc.',
    required: false,
  })
  @IsOptional()
  @IsString()
  filter?: string;
}
