import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DeviceLoginsService } from './device-logins.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('Device Logins')
@Controller('device-logins')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DeviceLoginsController {
  constructor(private readonly deviceLoginsService: DeviceLoginsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all device logins (Admin only)' })
  @ApiQuery({ name: 'userId', required: false })
  async findAll(@Query('userId') userId?: string) {
    return await this.deviceLoginsService.findAll(userId);
  }

  @Get('my-logins')
  @ApiOperation({ summary: 'Get current user device login history' })
  async getMyLogins(@Request() req) {
    return await this.deviceLoginsService.findAll(req.user.id);
  }

  @Get('my-active-devices')
  @ApiOperation({ summary: 'Get current user active devices' })
  async getMyActiveDevices(@Request() req) {
    return await this.deviceLoginsService.findActiveByUserId(req.user.id);
  }

  @Get('my-stats')
  @ApiOperation({ summary: 'Get current user login statistics' })
  async getMyStats(@Request() req) {
    return await this.deviceLoginsService.getLoginStats(req.user.id);
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Logout from all devices' })
  async logoutAllDevices(@Request() req) {
    await this.deviceLoginsService.markAllUserDevicesAsLoggedOut(req.user.id);
    return { message: 'Successfully logged out from all devices' };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get device login by ID' })
  async findOne(@Param('id') id: string) {
    return await this.deviceLoginsService.findOne(id);
  }

  @Get('device/:deviceId')
  @ApiOperation({ summary: 'Get login history by device ID' })
  async findByDeviceId(@Param('deviceId') deviceId: string) {
    return await this.deviceLoginsService.findByDeviceId(deviceId);
  }
}
