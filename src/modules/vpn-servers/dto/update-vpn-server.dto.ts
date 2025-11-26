import { PartialType } from '@nestjs/swagger';
import { CreateVpnServerDto } from './create-vpn-server.dto';

export class UpdateVpnServerDto extends PartialType(CreateVpnServerDto) {}

