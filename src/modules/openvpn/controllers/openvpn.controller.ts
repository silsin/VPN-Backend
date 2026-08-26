import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';
import { OpenVpnService, OpenVpnResponse, OpenVpnServerDto } from '../services/openvpn.service';
import { OpenVpnServer } from '../entities/openvpn-server.entity';

@ApiTags('OpenVPN')
@Controller('openvpn-configs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OpenVpnController {
  constructor(private readonly openVpnService: OpenVpnService) {}

  /**
   * USER ENDPOINT: Get OpenVPN config for a server
   * Requires active subscription
   */
  @Post('connect')
  @ApiOperation({ summary: 'Generate OpenVPN config for a server (requires active subscription)' })
  @ApiResponse({
    status: 200,
    description: '.ovpn file content + credentials',
    schema: {
      type: 'object',
      properties: {
        config: { type: 'string', description: '.ovpn file content' },
        username: { type: 'string' },
        password: { type: 'string' },
        expiry: { type: 'number', description: 'Expiry timestamp (24 hours from now)' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'No active subscription' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  async generateConfig(
    @Body() body: { serverId: string },
    @Req() req: any,
  ): Promise<OpenVpnResponse> {
    const userId = req.user.id;
    return this.openVpnService.generateOpenVpnConfig(body.serverId, userId);
  }

  /**
   * USER ENDPOINT: Get all available OpenVPN servers
   */
  @Get('servers')
  @ApiOperation({ summary: 'Get all available OpenVPN servers' })
  @ApiResponse({
    status: 200,
    description: 'List of active OpenVPN servers',
    type: [OpenVpnServer],
  })
  async getAllServers(): Promise<OpenVpnServer[]> {
    return this.openVpnService.getAllServers();
  }

  /**
   * USER ENDPOINT: Get servers by country
   */
  @Get('servers/country/:country')
  @ApiOperation({ summary: 'Get OpenVPN servers by country' })
  @ApiParam({ name: 'country', description: 'Country name (e.g., Germany, US, Iran)' })
  @ApiResponse({
    status: 200,
    description: 'List of OpenVPN servers in country',
    type: [OpenVpnServer],
  })
  async getServersByCountry(@Param('country') country: string): Promise<OpenVpnServer[]> {
    return this.openVpnService.getServersByCountry(country);
  }

  /**
   * USER ENDPOINT: Get statistics (public info)
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get OpenVPN server statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics about available servers',
  })
  async getStats() {
    return this.openVpnService.getStats();
  }

  /**
   * ADMIN ENDPOINT: Create new OpenVPN server
   */
  @Post('admin/servers')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Create new OpenVPN server' })
  @ApiResponse({ status: 201, description: 'Server created', type: OpenVpnServer })
  @ApiResponse({ status: 400, description: 'Invalid data or server already exists' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async createServer(@Body() serverData: OpenVpnServerDto): Promise<OpenVpnServer> {
    return this.openVpnService.createServer(serverData);
  }

  /**
   * ADMIN ENDPOINT: Update OpenVPN server
   */
  @Patch('admin/servers/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Update OpenVPN server' })
  @ApiParam({ name: 'id', description: 'Server ID' })
  @ApiResponse({ status: 200, description: 'Server updated', type: OpenVpnServer })
  @ApiResponse({ status: 404, description: 'Server not found' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async updateServer(
    @Param('id') id: string,
    @Body() serverData: Partial<OpenVpnServerDto>,
  ): Promise<OpenVpnServer> {
    return this.openVpnService.updateServer(id, serverData);
  }

  /**
   * ADMIN ENDPOINT: Deactivate server
   */
  @Patch('admin/servers/:id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Deactivate OpenVPN server' })
  @ApiParam({ name: 'id', description: 'Server ID' })
  @ApiResponse({ status: 200, description: 'Server deactivated' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async deactivateServer(@Param('id') id: string): Promise<void> {
    return this.openVpnService.deactivateServer(id);
  }

  /**
   * ADMIN ENDPOINT: Activate server
   */
  @Patch('admin/servers/:id/activate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Activate OpenVPN server' })
  @ApiParam({ name: 'id', description: 'Server ID' })
  @ApiResponse({ status: 200, description: 'Server activated' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async activateServer(@Param('id') id: string): Promise<void> {
    return this.openVpnService.activateServer(id);
  }

  /**
   * ADMIN ENDPOINT: Delete server
   */
  @Delete('admin/servers/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Delete OpenVPN server' })
  @ApiParam({ name: 'id', description: 'Server ID' })
  @ApiResponse({ status: 200, description: 'Server deleted' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async deleteServer(@Param('id') id: string): Promise<void> {
    return this.openVpnService.deleteServer(id);
  }

  /**
   * ADMIN ENDPOINT: Get server by ID
   */
  @Get('admin/servers/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Get OpenVPN server by ID' })
  @ApiParam({ name: 'id', description: 'Server ID' })
  @ApiResponse({ status: 200, description: 'Server details', type: OpenVpnServer })
  @ApiResponse({ status: 404, description: 'Server not found' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getServerById(@Param('id') id: string): Promise<OpenVpnServer> {
    return this.openVpnService.getServerById(id);
  }
}
