import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AdsService } from './ads.service';
import { CreateAdFailureReportDto } from './dto/create-ad-failure-report.dto';

@ApiTags('Mobile Ads')
@Controller('mobile/ads')
export class MobileAdsController {
  constructor(private readonly adsService: AdsService) {}

  @Post('failure-report')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Report that an ad failed to show on the mobile app',
  })
  @ApiResponse({ status: 201, description: 'Failure report stored' })
  reportFailure(@Body() dto: CreateAdFailureReportDto) {
    return this.adsService.createFailureReport(dto);
  }
}
