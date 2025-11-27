import { IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
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

  @ApiProperty({ example: 'vless://...' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
