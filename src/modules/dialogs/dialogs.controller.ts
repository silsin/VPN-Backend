import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { DialogsService } from './dialogs.service';
import { CreateDialogDto } from './dto/create-dialog.dto';
import { UpdateDialogDto } from './dto/update-dialog.dto';
import { FilterDialogDto } from './dto/filter-dialog.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Dialogs')
@Controller('dialogs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DialogsController {
  constructor(private readonly dialogsService: DialogsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new dialog' })
  @ApiResponse({ status: 201, description: 'Dialog created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  create(@Body() createDialogDto: CreateDialogDto) {
    return this.dialogsService.create(createDialogDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all dialogs with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Dialogs retrieved successfully' })
  findAll(@Query() filterDto: FilterDialogDto) {
    return this.dialogsService.findAll(filterDto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get dialog statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  getStats() {
    return this.dialogsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a dialog by ID' })
  @ApiResponse({ status: 200, description: 'Dialog retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Dialog not found' })
  findOne(@Param('id') id: string) {
    return this.dialogsService.findOne(id);
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get analytics for a dialog' })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Dialog not found' })
  getAnalytics(@Param('id') id: string) {
    return this.dialogsService.getAnalytics(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a dialog' })
  @ApiResponse({ status: 200, description: 'Dialog updated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot update sent dialog' })
  @ApiResponse({ status: 404, description: 'Dialog not found' })
  update(@Param('id') id: string, @Body() updateDialogDto: UpdateDialogDto) {
    return this.dialogsService.update(id, updateDialogDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a dialog' })
  @ApiResponse({ status: 204, description: 'Dialog deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete sent dialog' })
  @ApiResponse({ status: 404, description: 'Dialog not found' })
  remove(@Param('id') id: string) {
    return this.dialogsService.remove(id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send a dialog immediately' })
  @ApiResponse({ status: 200, description: 'Dialog sent successfully' })
  @ApiResponse({ status: 400, description: 'Dialog already sent' })
  @ApiResponse({ status: 404, description: 'Dialog not found' })
  sendDialog(@Param('id') id: string) {
    return this.dialogsService.sendDialog(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a scheduled dialog' })
  @ApiResponse({ status: 200, description: 'Dialog cancelled successfully' })
  @ApiResponse({
    status: 400,
    description: 'Only scheduled dialogs can be cancelled',
  })
  @ApiResponse({ status: 404, description: 'Dialog not found' })
  cancelDialog(@Param('id') id: string) {
    return this.dialogsService.cancelDialog(id);
  }
}
