import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SettingsService } from './settings.service';

@ApiTags('Mobile App Version')
@Controller('mobile/app-version')
export class MobileAppVersionController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Get app version / update policy for mobile. Pass client build to get updateType.',
  })
  @ApiQuery({
    name: 'platform',
    required: true,
    enum: ['android', 'ios'],
  })
  @ApiQuery({
    name: 'build',
    required: false,
    description: 'Current client build number (integer)',
    type: Number,
  })
  @ApiQuery({
    name: 'version',
    required: false,
    description: 'Current client version name (informational)',
  })
  @ApiResponse({ status: 200, description: 'Version / update policy' })
  getAppVersion(
    @Query('platform') platform: string,
    @Query('build') build?: string,
    @Query('version') version?: string,
  ) {
    const clientBuild =
      build !== undefined && build !== '' ? Number(build) : undefined;
    return this.settingsService.getAppVersionForMobile(
      platform,
      Number.isFinite(clientBuild) ? clientBuild : undefined,
      version,
    );
  }
}
