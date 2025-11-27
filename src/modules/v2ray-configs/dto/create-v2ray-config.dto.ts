import { IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { V2RayConfigType } from '../entities/v2ray-config.entity';

export class CreateV2RayConfigDto {
  @ApiProperty({ example: 'Iran Server 1' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;

  @ApiProperty({ enum: V2RayConfigType, example: V2RayConfigType.LINK })
  @IsEnum(V2RayConfigType)
  type: V2RayConfigType;

  @ApiProperty({ example: 'vless://...' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
