import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsUrl,
  IsDateString,
  IsBoolean,
  MinLength,
  MaxLength,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DialogType, DialogTarget, DialogPlacement } from '../entities/dialog.entity';
import { DialogButtonDto } from './dialog-button.dto';

export class CreateDialogDto {
  @ApiProperty({
    example: 'both',
    description: 'Delivery channel: in-app, push, or both',
    enum: DialogType,
  })
  @IsEnum(DialogType)
  type: DialogType;

  @ApiProperty({
    example: 'all',
    description: 'Target audience',
    enum: DialogTarget,
    required: false,
    default: DialogTarget.ALL,
  })
  @IsOptional()
  @IsEnum(DialogTarget)
  target?: DialogTarget;

  @ApiProperty({
    example: DialogPlacement.BEFORE_CONNECT,
    description:
      'When to show on mobile: general | splash | before_connect | after_connect',
    enum: DialogPlacement,
    required: false,
    default: DialogPlacement.GENERAL,
  })
  @IsOptional()
  @IsEnum(DialogPlacement)
  placement?: DialogPlacement;

  @ApiProperty({
    example: false,
    description:
      'If true, keep showing on mobile after dismiss. If false (default), show once per device.',
    required: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  repeatable?: boolean;

  @ApiProperty({
    example: 'high',
    description: 'Dialog priority',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  priority: string;

  @ApiProperty({
    example: 'Special Offer!',
    description: 'Dialog title',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiProperty({
    example: 'Get 50% off on premium subscription!',
    description: 'Dialog message',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  message: string;

  @ApiProperty({
    example: 'https://example.com/image.png',
    description: 'Image URL for the dialog',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiProperty({
    example: 'https://example.com/offer',
    description: 'Action URL when dialog is clicked',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  actionUrl?: string;

  @ApiProperty({
    example: [
      {
        title: 'Download',
        actionUrl: 'https://example.com/download',
        isPrimary: true,
        style: 'primary',
      },
      {
        title: 'Later',
        action: 'dismiss',
        isPrimary: false,
        style: 'secondary',
      },
    ],
    description:
      'Action buttons. Use title (or label) for button text, isPrimary:true for the main CTA.',
    required: false,
    type: [DialogButtonDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DialogButtonDto)
  buttons?: DialogButtonDto[];

  @ApiProperty({
    example: '2024-12-31T23:59:59Z',
    description: 'Schedule time for sending (ISO 8601 format)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  scheduleTime?: string;

  @ApiProperty({
    example: '2024-12-31T23:59:59Z',
    description: 'Expire time for dialog (ISO 8601 format)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  expireTime?: string;
}
