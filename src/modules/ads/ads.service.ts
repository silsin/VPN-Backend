import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ad, AdType } from './entities/ad.entity';
import { AdSetting } from './entities/ad-setting.entity';
import {
  AdFailureReason,
  AdFailureReport,
} from './entities/ad-failure-report.entity';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdSettingDto } from './dto/update-ad-setting.dto';
import { CreateAdFailureReportDto } from './dto/create-ad-failure-report.dto';

@Injectable()
export class AdsService {
  constructor(
    @InjectRepository(Ad)
    private adsRepository: Repository<Ad>,
    @InjectRepository(AdSetting)
    private adSettingsRepository: Repository<AdSetting>,
    @InjectRepository(AdFailureReport)
    private adFailureReportsRepository: Repository<AdFailureReport>,
  ) {}

  // --- Ads CRUD ---

  async create(createAdDto: CreateAdDto): Promise<Ad> {
    const ad = this.adsRepository.create(createAdDto);
    return this.adsRepository.save(ad);
  }

  async findAll(): Promise<Ad[]> {
    return this.adsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Ad> {
    const ad = await this.adsRepository.findOne({ where: { id } });
    if (!ad) {
      throw new NotFoundException(`Ad with ID ${id} not found`);
    }
    return ad;
  }

  async update(id: string, updateAdDto: any): Promise<Ad> {
    const ad = await this.findOne(id);
    Object.assign(ad, updateAdDto);
    return this.adsRepository.save(ad);
  }

  async remove(id: string): Promise<void> {
    const result = await this.adsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Ad with ID ${id} not found`);
    }
  }

  async getStats() {
    const total = await this.adsRepository.count();
    const active = await this.adsRepository.count({ where: { isActive: true } });
    const banners = await this.adsRepository.count({ where: { type: AdType.BANNER } });
    const videos = await this.adsRepository.count({ where: { type: AdType.VIDEO } });

    return {
      total,
      active,
      banners,
      videos,
    };
  }

  // --- Ad Settings ---

  async getSettings(): Promise<AdSetting[]> {
    return this.adSettingsRepository.find();
  }

  async updateSetting(updateAdSettingDto: UpdateAdSettingDto): Promise<AdSetting> {
    const { key, value } = updateAdSettingDto;
    let setting = await this.adSettingsRepository.findOne({ where: { key } });

    if (!setting) {
      setting = this.adSettingsRepository.create({ key, value });
    } else {
      setting.value = value;
    }

    return this.adSettingsRepository.save(setting);
  }

  // --- Ad failure reports ---

  async createFailureReport(
    dto: CreateAdFailureReportDto,
  ): Promise<AdFailureReport> {
    const report = this.adFailureReportsRepository.create({
      ...dto,
      platform: dto.platform.toLowerCase(),
    });
    return this.adFailureReportsRepository.save(report);
  }

  async findFailureReports(options?: {
    page?: number;
    limit?: number;
    platform?: string;
    reason?: AdFailureReason;
  }): Promise<{
    data: AdFailureReport[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const where: Record<string, any> = {};

    if (options?.platform) {
      where.platform = options.platform.toLowerCase();
    }
    if (options?.reason) {
      where.reason = options.reason;
    }

    const [data, total] = await this.adFailureReportsRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getFailureReportSummary(days = 7): Promise<{
    total: number;
    days: number;
    byReason: Record<string, number>;
    byPlatform: Record<string, number>;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, days));

    const reports = await this.adFailureReportsRepository
      .createQueryBuilder('r')
      .where('r.createdAt >= :since', { since })
      .getMany();

    const byReason: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};

    for (const r of reports) {
      byReason[r.reason] = (byReason[r.reason] || 0) + 1;
      byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1;
    }

    return {
      total: reports.length,
      days,
      byReason,
      byPlatform,
    };
  }
}
