import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { V2RayConfig, V2RayConfigType } from './entities/v2ray-config.entity';
import { CreateV2RayConfigDto } from './dto/create-v2ray-config.dto';
import { UpdateV2RayConfigDto } from './dto/update-v2ray-config.dto';

@Injectable()
export class V2RayConfigsService {
  constructor(
    @InjectRepository(V2RayConfig)
    private v2rayConfigsRepository: Repository<V2RayConfig>,
  ) {}

  async create(createV2RayConfigDto: CreateV2RayConfigDto): Promise<V2RayConfig> {
    const config = this.v2rayConfigsRepository.create(createV2RayConfigDto);
    return this.v2rayConfigsRepository.save(config);
  }

  async findAll(search?: string, type?: V2RayConfigType): Promise<V2RayConfig[]> {
    const where: any = {};
    if (search) {
      where.name = Like(`%${search}%`);
    }
    if (type) {
      where.type = type;
    }
    return this.v2rayConfigsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<V2RayConfig> {
    const config = await this.v2rayConfigsRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`V2Ray config with ID ${id} not found`);
    }
    return config;
  }

  async update(id: string, updateV2RayConfigDto: UpdateV2RayConfigDto): Promise<V2RayConfig> {
    const config = await this.findOne(id);
    Object.assign(config, updateV2RayConfigDto);
    return this.v2rayConfigsRepository.save(config);
  }

  async remove(id: string): Promise<void> {
    const result = await this.v2rayConfigsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`V2Ray config with ID ${id} not found`);
    }
  }

  async getStats() {
    const total = await this.v2rayConfigsRepository.count();
    const linkCount = await this.v2rayConfigsRepository.count({
      where: { type: V2RayConfigType.LINK },
    });
    const jsonCount = await this.v2rayConfigsRepository.count({
      where: { type: V2RayConfigType.JSON },
    });

    return {
      total,
      linkCount,
      jsonCount,
    };
  }
}
