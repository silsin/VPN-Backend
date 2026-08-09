import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DialogsService } from './dialogs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DialogPlacement } from './entities/dialog.entity';

@ApiTags('Mobile Dialogs')
@Controller('mobile/dialogs')
export class MobileDialogsController {
  constructor(
    private readonly dialogsService: DialogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute per IP
  @ApiOperation({
    summary: 'Get active in-app dialogs for mobile devices',
  })
  @ApiQuery({
    name: 'platform',
    required: false,
    enum: ['android', 'ios'],
    description: 'Filter by platform',
  })
  @ApiQuery({
    name: 'placement',
    required: false,
    enum: DialogPlacement,
    description:
      'When to show: splash | before_connect | after_connect | general (exact match)',
  })
  @ApiQuery({
    name: 'deviceId',
    required: false,
    description:
      'Device id — hides non-repeatable dialogs this device already dismissed/clicked',
  })
  @ApiResponse({
    status: 200,
    description: 'Active dialogs retrieved successfully',
  })
  getActiveDialogs(
    @Query('platform') platform?: string,
    @Query('placement') placement?: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.dialogsService.getActiveDialogsForMobile(
      platform,
      placement,
      deviceId,
    );
  }

  @Post(':id/click')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track dialog click' })
  @ApiResponse({ status: 204, description: 'Click tracked successfully' })
  async trackClick(
    @Param('id') dialogId: string,
    @Body('deviceId') deviceId: string,
  ) {
    await this.notificationsService.updateDeliveryStatus(
      dialogId,
      deviceId,
      'click',
    );
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track dialog dismissal' })
  @ApiResponse({ status: 204, description: 'Dismissal tracked successfully' })
  async trackDismiss(
    @Param('id') dialogId: string,
    @Body('deviceId') deviceId: string,
  ) {
    await this.notificationsService.updateDeliveryStatus(
      dialogId,
      deviceId,
      'dismiss',
    );
  }
}
