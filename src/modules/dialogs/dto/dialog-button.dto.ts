import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsArray,
  ValidateNested,
  IsIn,
} from 'class-validator';

export class DialogButtonDto {
  @IsString()
  label: string;

  @IsOptional()
  @IsUrl()
  actionUrl?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  @IsIn(['primary', 'secondary', 'danger', 'success'])
  style?: string;
}
