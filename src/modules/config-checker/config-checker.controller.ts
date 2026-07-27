import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { ConfigCheckerService } from './config-checker.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Config Checker')
@Controller('config-checker')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConfigCheckerController {
  constructor(private readonly checkerService: ConfigCheckerService) {}

  /**
   * GET /config-checker/check[?remove=true]
   *
   * Two-tier health check on every stored config:
   *   1. Endpoint reachability (local protocol probe + check-host.net)
   *   2. For V2Ray link/JSON: real traffic smoke test via temporary Xray + SOCKS
   *      (download + small upload). IP-up but no tunnel traffic → FAILED.
   *
   * A config is considered reachable only if the applicable tiers succeed.
   * Pass ?remove=true to automatically delete configs that fail.
   */
  @Get('check')
  @ApiOperation({
    summary: 'Check all configs — endpoint + traffic smoke test',
    description:
      'Tier 1: local protocol probe + check-host.net. ' +
      'Tier 2 (v2ray_link / json_config): spawn Xray and verify download/upload through SOCKS. ' +
      'Configs with IP up but dead tunnel are marked failed. ' +
      'Pass ?remove=true to auto-delete failing configs after consecutive failures.',
  })
  @ApiQuery({
    name: 'remove',
    required: false,
    type: Boolean,
    description: 'Set to true to delete unreachable configs automatically',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk check result with per-config details',
    schema: {
      example: {
        total: 5,
        working: 4,
        failed: 1,
        removed: 0,
        results: [
          {
            id: 'uuid',
            name: 'Iran Server 1',
            type: 'v2ray_link',
            host: '1.2.3.4',
            port: 443,
            reachable: true,
            localLatencyMs: 85,
            remoteNodes: [
              { node: 'us1.node.check-host.net', reachable: true, latencyMs: 210 },
              { node: 'de1.node.check-host.net', reachable: true, latencyMs: 45 },
            ],
          },
        ],
      },
    },
  })
  checkAll(@Query('remove') remove?: string) {
    return this.checkerService.checkAll(remove === 'true' || remove === '1');
  }

  /**
   * POST /config-checker/check[?remove=true]
   * POST-friendly alias of the GET endpoint above.
   */
  @Post('check')
  @ApiOperation({ summary: 'Check all configs (POST variant)' })
  @ApiQuery({ name: 'remove', required: false, type: Boolean })
  checkAllPost(@Query('remove') remove?: string) {
    return this.checkerService.checkAll(remove === 'true' || remove === '1');
  }

  /**
   * GET /config-checker/check/:id
   * Check a single config by its UUID.
   */
  @Get('check/:id')
  @ApiOperation({
    summary: 'Check a single config by ID — local TCP + check-host.net',
  })
  @ApiParam({ name: 'id', description: 'UUID of the v2ray_config row' })
  checkOne(@Param('id') id: string) {
    return this.checkerService.checkById(id);
  }
}
