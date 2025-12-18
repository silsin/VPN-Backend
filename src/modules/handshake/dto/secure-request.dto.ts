import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SecureRequestDto {
  @ApiProperty({ description: 'Encrypted payload (base64)' })
  @IsString()
  payload: string;
}
