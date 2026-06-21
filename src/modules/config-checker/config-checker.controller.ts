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
   * Runs a dual health check on every stored config:
   *   1. Local TCP connect (direct from the server)
   *   2. check-host.net TCP check (3 geographically distributed nodes)
   *
   * A config is considered reachable if EITHER method succeeds.
   * Pass ?remove=true to automatically delete configs that fail both checks.
   */
  @Get('check')
  @ApiOperation({
    summary: 'Check all configs — local TCP + check-host.net',
    description:
      'Runs dual health checks: local TCP connect and check-host.net distributed TCP check. ' +
      'A config survives if either method confirms reachability. ' +
      'Pass ?remove=true to auto-delete configs that fail both.',
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
