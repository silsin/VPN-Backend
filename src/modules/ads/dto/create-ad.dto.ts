import { IsEnum, IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AdType, AdPlatform, AdPlacement } from '../entities/ad.entity';

export class CreateAdDto {
  @ApiProperty({ example: 'Main Page Banner' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: AdType, example: AdType.BANNER })
  @IsEnum(AdType)
  type: AdType;

  @ApiProperty({ enum: AdPlatform, example: AdPlatform.ANDROID })
  @IsEnum(AdPlatform)
  platform: AdPlatform;

  @ApiProperty({ example: 'ca-app-pub-...' })
  @IsString()
  @IsNotEmpty()
  adUnitId: string;

  @ApiProperty({ enum: AdPlacement, example: AdPlacement.MAIN_PAGE })
  @IsEnum(AdPlacement)
  placement: AdPlacement;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
