import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAdSettingDto {
  @ApiProperty({ example: 'main_page_banner_enabled' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'true' })
  @IsString()
  @IsNotEmpty()
  value: string;
}
