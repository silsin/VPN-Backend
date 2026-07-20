import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Dialog action button.
 *
 * - Title text: send `title` and/or `label` (both accepted).
 * - Primary CTA: send `isPrimary: true` and/or `style: "primary"`.
 */
export class DialogButtonDto {
  @ApiPropertyOptional({
    example: 'Update now',
    description: 'Button text (alias of title)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiPropertyOptional({
    example: 'Update now',
    description: 'Button title / display text (alias of label)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/download',
    description: 'URL to open when the button is tapped',
  })
  @IsOptional()
  @IsString()
  actionUrl?: string;

  @ApiPropertyOptional({
    example: 'dismiss',
    description: 'Internal action (e.g. dismiss) when no URL is used',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'If true, this is the primary CTA (also sets style to primary)',
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
  isPrimary?: boolean;

  @ApiPropertyOptional({
    example: 'primary',
    enum: ['primary', 'secondary', 'danger', 'success'],
    description: 'Visual style. Prefer isPrimary for the main CTA.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['primary', 'secondary', 'danger', 'success'])
  style?: string;
}
