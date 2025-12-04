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
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DialogsService } from './dialogs.service';
import { NotificationsService } from '../notifications/notifications.service';

@ApiTags('Mobile Dialogs')
@Controller('mobile/dialogs')
export class MobileDialogsController {
  constructor(
    private readonly dialogsService: DialogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get active in-app dialogs for mobile devices' })
  @ApiQuery({
    name: 'platform',
    required: false,
    enum: ['android', 'ios'],
    description: 'Filter by platform',
  })
  @ApiResponse({
    status: 200,
    description: 'Active dialogs retrieved successfully',
  })
  getActiveDialogs(@Query('platform') platform?: string) {
    return this.dialogsService.getActiveDialogsForMobile(platform);
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
