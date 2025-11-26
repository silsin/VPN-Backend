import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional } from 'class-validator';

export class CreateConnectionDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsUUID()
  serverId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  clientIp?: string;
}

