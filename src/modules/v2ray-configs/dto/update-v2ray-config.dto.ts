import { PartialType } from '@nestjs/swagger';
import { CreateV2RayConfigDto } from './create-v2ray-config.dto';

export class UpdateV2RayConfigDto extends PartialType(CreateV2RayConfigDto) {}
