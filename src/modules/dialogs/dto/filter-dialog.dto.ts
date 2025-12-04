import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DialogType, DialogStatus, DialogTarget } from '../entities/dialog.entity';

export class FilterDialogDto {
  @ApiProperty({
    required: false,
    description: 'Filter by dialog type',
    enum: DialogType,
  })
  @IsOptional()
  @IsEnum(DialogType)
  type?: DialogType;

  @ApiProperty({
    required: false,
    description: 'Filter by dialog status',
    enum: DialogStatus,
  })
  @IsOptional()
  @IsEnum(DialogStatus)
  status?: DialogStatus;

  @ApiProperty({
    required: false,
    description: 'Filter by target audience',
    enum: DialogTarget,
  })
  @IsOptional()
  @IsEnum(DialogTarget)
  target?: DialogTarget;

  @ApiProperty({
    required: false,
    description: 'Search in title and message',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    required: false,
    description: 'Page number (starts from 1)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    required: false,
    description: 'Number of items per page',
    default: 10,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiProperty({
    required: false,
    description: 'Sort by field',
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiProperty({
    required: false,
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
  })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
