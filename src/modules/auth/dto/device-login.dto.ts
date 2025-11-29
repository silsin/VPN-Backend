import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional, IsEnum } from 'class-validator';

export enum DevicePlatform {
  ANDROID = 'android',
  IOS = 'ios',
}

export class DeviceLoginDto {
  @ApiProperty({
    example: 'android-1234567890abcdef',
    description: 'Unique device identifier (minimum 16 characters)',
  })
  @IsString()
  deviceId: string;

  @ApiProperty({
    example: 'Samsung Galaxy S21',
    description: 'Device name',
    required: false,
  })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiProperty({
    example: 'android',
    description: 'Device platform',
    enum: DevicePlatform,
    required: false,
  })
  @IsOptional()
  @IsEnum(DevicePlatform)
  platform?: DevicePlatform;

  @ApiProperty({
    example: 'fcm-token-1234567890abcdef',
    description: 'Push notification token (FCM for Android, APNs for iOS)',
    required: false,
  })
  @IsOptional()
  @IsString()
  pushId?: string;
}
