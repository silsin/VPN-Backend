import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AdFailureReason } from '../entities/ad-failure-report.entity';

export class CreateAdFailureReportDto {
  @ApiProperty({ example: 'device-abc-123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  deviceId: string;

  @ApiProperty({ example: 'android', enum: ['android', 'ios'] })
  @IsString()
  @IsIn(['android', 'ios'])
  platform: string;

  @ApiPropertyOptional({ example: 'main_page' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  placement?: string;

  @ApiPropertyOptional({ example: 'banner' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  adType?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsOptional()
  @IsUUID()
  adId?: string;

  @ApiPropertyOptional({ example: 'ca-app-pub-3940256099942544/6300978111' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  adUnitId?: string;

  @ApiProperty({
    enum: AdFailureReason,
    example: AdFailureReason.NO_FILL,
  })
  @IsEnum(AdFailureReason)
  reason: AdFailureReason;

  @ApiPropertyOptional({
    example: 'AdMob returned ERROR_CODE_NO_FILL',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reasonDetail?: string;

  @ApiPropertyOptional({ example: 'ERROR_CODE_NO_FILL' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  errorCode?: string;
}
