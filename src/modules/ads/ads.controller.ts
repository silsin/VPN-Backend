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
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdsService } from './ads.service';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';
import { TrackImpressionDto } from './dto/track-impression.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdType } from './entities/ad.entity';

@ApiTags('Ads')
@Controller('ads')
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new ad (Admin only)' })
  create(@Body() createAdDto: CreateAdDto) {
    return this.adsService.create(createAdDto);
  }

  @Get('serve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ad for user' })
  async getAd(
    @Request() req,
    @Query('type') type: AdType,
    @Query('context') context?: string,
  ) {
    const parsedContext = context ? JSON.parse(context) : {};
    return this.adsService.getAdForUser(req.user.id, type, parsedContext);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all active ads' })
  findAll(@Query('type') type?: AdType) {
    if (type) {
      return this.adsService.findActiveAds(type);
    }
    return this.adsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ad by ID' })
  findOne(@Param('id') id: string) {
    return this.adsService.findOne(id);
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ad statistics' })
  getStats(@Param('id') id: string) {
    return this.adsService.getAdStats(id);
  }

  @Post('track/impression')
  @ApiOperation({ summary: 'Track ad impression' })
  trackImpression(@Body() trackImpressionDto: TrackImpressionDto, @Request() req) {
    return this.adsService.trackImpression({
      ...trackImpressionDto,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('track/click/:impressionId')
  @ApiOperation({ summary: 'Track ad click' })
  trackClick(@Param('impressionId') impressionId: string, @Body('revenue') revenue?: number) {
    return this.adsService.trackClick(impressionId, revenue);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ad (Admin only)' })
  update(@Param('id') id: string, @Body() updateAdDto: UpdateAdDto) {
    return this.adsService.update(id, updateAdDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete ad (Admin only)' })
  remove(@Param('id') id: string) {
    return this.adsService.remove(id);
  }
}

