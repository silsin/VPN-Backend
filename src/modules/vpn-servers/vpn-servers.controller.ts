import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VpnServersService } from './vpn-servers.service';
import { CreateVpnServerDto } from './dto/create-vpn-server.dto';
import { UpdateVpnServerDto } from './dto/update-vpn-server.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('VPN Servers')
@Controller('vpn-servers')
export class VpnServersController {
  constructor(private readonly vpnServersService: VpnServersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new VPN server (Admin only)' })
  create(@Body() createVpnServerDto: CreateVpnServerDto) {
    return this.vpnServersService.create(createVpnServerDto);
  }

  @Get('available')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available VPN servers' })
  findAvailable() {
    return this.vpnServersService.findAvailableServers();
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all VPN servers' })
  findAll(@Query('location') location?: string) {
    if (location) {
      return this.vpnServersService.findByLocation(location);
    }
    return this.vpnServersService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get VPN server by ID' })
  findOne(@Param('id') id: string) {
    return this.vpnServersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update VPN server (Admin only)' })
  update(@Param('id') id: string, @Body() updateVpnServerDto: UpdateVpnServerDto) {
    return this.vpnServersService.update(id, updateVpnServerDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete VPN server (Admin only)' })
  remove(@Param('id') id: string) {
    return this.vpnServersService.remove(id);
  }
}

