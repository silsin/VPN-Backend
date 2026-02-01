import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { VpnGateService } from './vpngate.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('vpngate')
@Controller('vpngate')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VpnGateController {
  constructor(private readonly vpngateService: VpnGateService) {}

  @Get()
  @ApiOperation({ summary: 'Get all working free VPN configs from VPN Gate' })
  async getFreeConfigs() {
    return this.vpngateService.getFreeConfigs();
  }

  @Post('import')
  @ApiOperation({ summary: 'Import a free config into main database' })
  async importConfig(@Body() config: any) {
    // This part depends on how the user wants to store it in the database.
    // For now, we return a success message or placeholder logic.
    // In a real scenario, this would call V2RayConfigsService or a new OpenVpnConfigsService.
    return { 
        message: 'Config import requested. Implementation depends on protocol mapping.',
        config: config.IP 
    };
  }

  @Post('sync')
  @ApiOperation({ summary: 'Manually trigger a sync with VPN Gate' })
  async sync() {
    this.vpngateService.updateFreeConfigs();
    return { message: 'Sync started' };
  }
}
