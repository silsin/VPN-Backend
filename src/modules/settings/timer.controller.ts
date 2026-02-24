import { Controller, Get, Put, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { TimerService } from './timer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('Timers')
@Controller('timers')
export class TimerController {
  constructor(private readonly timerService: TimerService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get timer configurations' })
  @ApiResponse({ status: 200, description: 'Return all timer configurations' })
  async getConfig() {
    return this.timerService.getTimerConfigs();
  }

  @Put('config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update timer configurations' })
  @ApiResponse({ status: 200, description: 'Timer configurations updated successfully' })
  async updateConfig(@Body() updates: any) {
    return this.timerService.updateTimerConfigs(updates);
  }

  @Post(':timerId/control')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Control individual timer operations' })
  @ApiParam({ name: 'timerId', description: 'ID of the timer to control' })
  @ApiResponse({ status: 200, description: 'Timer control operation successful' })
  async controlTimer(
    @Param('timerId') timerId: string,
    @Body() controlData: { action: string; parameters?: any }
  ) {
    return this.timerService.controlTimer(timerId, controlData.action, controlData.parameters);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get real-time status of all timers' })
  @ApiResponse({ status: 200, description: 'Return status of all timers' })
  async getStatus() {
    return this.timerService.getTimerStatus();
  }

  @Post('events')
  @ApiOperation({ summary: 'Log timer events for analytics' })
  @ApiResponse({ status: 201, description: 'Timer event logged successfully' })
  async logEvent(@Body() eventData: {
    timer_id: string;
    event_type: string;
    user_id?: string;
    metadata?: any;
  }) {
    await this.timerService.logTimerEvent(
      eventData.timer_id,
      eventData.event_type,
      eventData.metadata,
      eventData.user_id
    );
    return { success: true };
  }

  @Get('events')
  @ApiOperation({ summary: 'Get timer events log' })
  @ApiResponse({ status: 200, description: 'Return timer events' })
  async getEvents() {
    return this.timerService.getTimerEvents();
  }

  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export timer configurations' })
  @ApiResponse({ status: 200, description: 'Timer configurations exported successfully' })
  async exportConfigurations() {
    return this.timerService.exportConfigurations();
  }

  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import timer configurations' })
  @ApiResponse({ status: 200, description: 'Timer configurations imported successfully' })
  async importConfigurations(@Body() configData: any) {
    return this.timerService.importConfigurations(configData);
  }
}
