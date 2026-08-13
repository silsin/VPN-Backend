import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdsService } from './ads.service';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';
import { UpdateAdSettingDto } from './dto/update-ad-setting.dto';
import { AdFailureReason } from './entities/ad-failure-report.entity';

@ApiTags('Ads')
@Controller('ads')
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new ad' })
  create(@Body() createAdDto: CreateAdDto) {
    return this.adsService.create(createAdDto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get ad statistics' })
  getStats() {
    return this.adsService.getStats();
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get all ad settings' })
  getSettings() {
    return this.adsService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update an ad setting' })
  updateSetting(@Body() updateAdSettingDto: UpdateAdSettingDto) {
    return this.adsService.updateSetting(updateAdSettingDto);
  }

  @Get('failure-reports/summary')
  @ApiOperation({ summary: 'Ad failure report summary (last N days)' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getFailureReportSummary(@Query('days') days?: string) {
    return this.adsService.getFailureReportSummary(
      days ? parseInt(days, 10) : 7,
    );
  }

  @Get('failure-reports')
  @ApiOperation({ summary: 'List ad failure reports from mobile clients' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'platform', required: false, enum: ['android', 'ios'] })
  @ApiQuery({ name: 'reason', required: false, enum: AdFailureReason })
  findFailureReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('platform') platform?: string,
    @Query('reason') reason?: AdFailureReason,
  ) {
    return this.adsService.findFailureReports({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      platform,
      reason,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all ads' })
  findAll() {
    return this.adsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ad by ID' })
  findOne(@Param('id') id: string) {
    return this.adsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ad' })
  update(@Param('id') id: string, @Body() updateAdDto: UpdateAdDto) {
    return this.adsService.update(id, updateAdDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete ad' })
  remove(@Param('id') id: string) {
    return this.adsService.remove(id);
  }
}
