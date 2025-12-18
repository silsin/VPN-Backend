import { Controller, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { V2RayConfigsService } from './v2ray-configs.service';
import { Phase2AuthGuard } from '../handshake/guards/phase2-auth.guard';
import { Phase2EncryptInterceptor } from '../handshake/interceptors/phase2-encrypt.interceptor';

@ApiTags('V2Ray Conf')
@Controller('v2ray-conf')
@UseGuards(Phase2AuthGuard)
@UseInterceptors(Phase2EncryptInterceptor)
export class V2RayConfController {
  constructor(private readonly v2rayConfigsService: V2RayConfigsService) {}

  @Post('stats')
  @ApiOperation({ summary: 'Phase2: Get configuration statistics' })
  @ApiResponse({ status: 200, description: 'Encrypted response (phase2)' })
  async getStats() {
    return this.v2rayConfigsService.getStats();
  }

  @Post('list')
  @ApiOperation({ summary: 'Phase2: List all V2Ray configurations' })
  @ApiResponse({ status: 200, description: 'Encrypted response (phase2)' })
  async list(@Req() req: any) {
    const { search, type, category } = req.decodedBody || {};
    return this.v2rayConfigsService.findAll(search, type, category);
  }

  @Post('one')
  @ApiOperation({ summary: 'Phase2: Get V2Ray configuration by ID' })
  @ApiResponse({ status: 200, description: 'Encrypted response (phase2)' })
  async one(@Req() req: any) {
    const { id } = req.decodedBody || {};
    return this.v2rayConfigsService.findOne(id);
  }
}
