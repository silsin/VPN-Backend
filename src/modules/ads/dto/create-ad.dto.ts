import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  IsUrl,
  IsDateString,
  Min,
} from 'class-validator';
import { AdType, AdStatus } from '../entities/ad.entity';

export class CreateAdDto {
  @ApiProperty({ example: 'Premium VPN Ad' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Get premium VPN features', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: AdType, example: AdType.BANNER })
  @IsEnum(AdType)
  type: AdType;

  @ApiProperty({ enum: AdStatus, required: false, default: AdStatus.ACTIVE })
  @IsOptional()
  @IsEnum(AdStatus)
  status?: AdStatus;

  @ApiProperty({ example: 'ca-app-pub-1234567890123456/1234567890' })
  @IsString()
  adUnitId: string;

  @ApiProperty({ example: 'Google AdMob', required: false })
  @IsOptional()
  @IsString()
  adNetwork?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ example: 'https://example.com/ad-image.jpg', required: false })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiProperty({ example: 'https://example.com/ad-video.mp4', required: false })
  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @ApiProperty({ example: 'https://example.com/click', required: false })
  @IsOptional()
  @IsUrl()
  clickUrl?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  targeting?: Record<string, any>;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

