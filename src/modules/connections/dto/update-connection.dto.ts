import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsEnum } from 'class-validator';
import { ConnectionStatus } from '../entities/connection.entity';

export class UpdateConnectionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(ConnectionStatus)
  status?: ConnectionStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  clientIp?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assignedIp?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  bytesReceived?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  bytesSent?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}

