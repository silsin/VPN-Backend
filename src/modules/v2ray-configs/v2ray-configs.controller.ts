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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { V2RayConfigsService } from './v2ray-configs.service';
import { CreateV2RayConfigDto } from './dto/create-v2ray-config.dto';
import { UpdateV2RayConfigDto } from './dto/update-v2ray-config.dto';
import { V2RayConfigType, V2RayConfigCategory } from './entities/v2ray-config.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('V2Ray Configs')
@Controller('v2ray-configs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class V2RayConfigsController {
  constructor(private readonly v2rayConfigsService: V2RayConfigsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new V2Ray configuration' })
  create(@Body() createV2RayConfigDto: CreateV2RayConfigDto) {
    return this.v2rayConfigsService.create(createV2RayConfigDto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get configuration statistics' })
  getStats() {
    return this.v2rayConfigsService.getStats();
  }

  @Get()
  @ApiOperation({ summary: 'Get all V2Ray configurations' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'type', enum: V2RayConfigType, required: false })
  @ApiQuery({ name: 'category', enum: V2RayConfigCategory, required: false })
  findAll(
    @Query('search') search?: string,
    @Query('type') type?: V2RayConfigType,
    @Query('category') category?: V2RayConfigCategory,
  ) {
    return this.v2rayConfigsService.findAll(search, type, category);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a V2Ray configuration by ID' })
  findOne(@Param('id') id: string) {
    return this.v2rayConfigsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a V2Ray configuration' })
  update(
    @Param('id') id: string,
    @Body() updateV2RayConfigDto: UpdateV2RayConfigDto,
  ) {
    return this.v2rayConfigsService.update(id, updateV2RayConfigDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a V2Ray configuration' })
  remove(@Param('id') id: string) {
    return this.v2rayConfigsService.remove(id);
  }
}
