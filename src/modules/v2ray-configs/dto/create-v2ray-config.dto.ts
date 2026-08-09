import { IsEnum, IsNotEmpty, IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { V2RayConfigType, V2RayConfigCategory } from '../entities/v2ray-config.entity';

export class CreateV2RayConfigDto {
  @ApiProperty({ example: 'Iran Server 1' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;

  @ApiProperty({ enum: V2RayConfigType, example: V2RayConfigType.LINK })
  @IsEnum(V2RayConfigType)
  type: V2RayConfigType;

  @ApiProperty({ enum: V2RayConfigCategory, example: V2RayConfigCategory.MAIN })
  @IsEnum(V2RayConfigCategory)
  category: V2RayConfigCategory;

  @ApiProperty({ example: 'ir', required: false, description: 'ISO two-letter country code' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ example: true, required: false, description: 'Mark as Iran-side config for Iran-specific testing' })
  @IsBoolean()
  @IsOptional()
  isIranSide?: boolean;

  @ApiProperty({ example: 'vless://...' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
