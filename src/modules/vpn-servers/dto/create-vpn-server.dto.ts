import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsEnum, IsOptional, IsBoolean, Min, Max } from 'class-validator';
import { ServerLocation, ServerStatus } from '../entities/vpn-server.entity';

export class CreateVpnServerDto {
  @ApiProperty({ example: 'US-East-1' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'us-east-1.vpn.example.com' })
  @IsString()
  hostname: string;

  @ApiProperty({ example: '192.168.1.100' })
  @IsString()
  ipAddress: string;

  @ApiProperty({ example: 1194 })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiProperty({ enum: ServerLocation, example: ServerLocation.US })
  @IsEnum(ServerLocation)
  location: ServerLocation;

  @ApiProperty({ enum: ServerStatus, required: false, default: ServerStatus.OFFLINE })
  @IsOptional()
  @IsEnum(ServerStatus)
  status?: ServerStatus;

  @ApiProperty({ example: 1000, required: false })
  @IsOptional()
  @IsInt()
  maxConnections?: number;

  @ApiProperty({ example: 'OpenVPN', required: false })
  @IsOptional()
  @IsString()
  protocol?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  configuration?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

