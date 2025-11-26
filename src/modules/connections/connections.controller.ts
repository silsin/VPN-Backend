import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { ConnectDto } from './dto/connect.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConnectionStatus } from './entities/connection.entity';

@ApiTags('Connections')
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new connection (Admin only)' })
  create(@Body() createConnectionDto: CreateConnectionDto) {
    return this.connectionsService.create(createConnectionDto);
  }

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connect to VPN server' })
  connect(@Request() req, @Body() connectDto: ConnectDto) {
    return this.connectionsService.connect(
      req.user.id,
      connectDto.serverId,
      req.ip || 'unknown',
    );
  }

  @Post(':id/disconnect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect from VPN server' })
  disconnect(@Param('id') id: string) {
    return this.connectionsService.disconnect(id);
  }

  @Get('my-connections')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user connections' })
  getMyConnections(@Request() req) {
    return this.connectionsService.findByUser(req.user.id);
  }

  @Get('active')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active connections' })
  getActiveConnections(@Request() req) {
    return this.connectionsService.findActiveConnections(req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all connections (Admin only)' })
  findAll() {
    return this.connectionsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get connection by ID' })
  findOne(@Param('id') id: string) {
    return this.connectionsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update connection' })
  update(@Param('id') id: string, @Body() updateConnectionDto: UpdateConnectionDto) {
    return this.connectionsService.update(id, updateConnectionDto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update connection status' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: ConnectionStatus,
    @Body('assignedIp') assignedIp?: string,
  ) {
    return this.connectionsService.updateConnectionStatus(id, status, assignedIp);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete connection' })
  remove(@Param('id') id: string) {
    return this.connectionsService.remove(id);
  }
}

