import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ConnectDto {
  @ApiProperty()
  @IsUUID()
  serverId: string;
}

