import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsUrl,
  IsDateString,
  MinLength,
  MaxLength,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DialogType, DialogTarget } from '../entities/dialog.entity';
import { DialogButtonDto } from './dialog-button.dto';

export class CreateDialogDto {
  @ApiProperty({
    example: 'both',
    description: 'Type of dialog',
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
        label: 'دانلود',
        actionUrl: 'https://example.com/download',
        style: 'primary',
      },
      {
        label: 'بعداً',
        action: 'dismiss',
        style: 'secondary',
      },
    ],
    description: 'Array of action buttons for the dialog',
    required: false,
    type: [DialogButtonDto],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        return [];
      }
    }
    return value;
  })
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
}
