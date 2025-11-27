import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ad, AdType } from './entities/ad.entity';
import { AdSetting } from './entities/ad-setting.entity';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdSettingDto } from './dto/update-ad-setting.dto';

@Injectable()
export class AdsService {
  constructor(
    @InjectRepository(Ad)
    private adsRepository: Repository<Ad>,
    @InjectRepository(AdSetting)
    private adSettingsRepository: Repository<AdSetting>,
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
}
