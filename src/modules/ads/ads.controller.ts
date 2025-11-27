import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdsService } from './ads.service';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';
import { UpdateAdSettingDto } from './dto/update-ad-setting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Ads')
@Controller('ads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
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
