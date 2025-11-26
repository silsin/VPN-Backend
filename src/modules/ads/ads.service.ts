import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ad, AdType, AdStatus } from './entities/ad.entity';
import { AdImpression } from './entities/ad-impression.entity';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';
import { TrackImpressionDto } from './dto/track-impression.dto';

@Injectable()
export class AdsService {
  constructor(
    @InjectRepository(Ad)
    private adsRepository: Repository<Ad>,
    @InjectRepository(AdImpression)
    private adImpressionsRepository: Repository<AdImpression>,
  ) {}

  async create(createAdDto: CreateAdDto): Promise<Ad> {
    const ad = this.adsRepository.create(createAdDto);
    return this.adsRepository.save(ad);
  }

  async findAll(): Promise<Ad[]> {
    return this.adsRepository.find({
      where: { isActive: true },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  async findActiveAds(type?: AdType): Promise<Ad[]> {
    const where: any = {
      isActive: true,
      status: AdStatus.ACTIVE,
    };

    if (type) {
      where.type = type;
    }

    const now = new Date();
    return this.adsRepository
      .createQueryBuilder('ad')
      .where(where)
      .andWhere('(ad.startDate IS NULL OR ad.startDate <= :now)', { now })
      .andWhere('(ad.endDate IS NULL OR ad.endDate >= :now)', { now })
      .orderBy('ad.priority', 'DESC')
      .getMany();
  }

  async getAdForUser(userId: string, type: AdType, context?: Record<string, any>): Promise<Ad | null> {
    const ads = await this.findActiveAds(type);

    // Filter by targeting if provided
    if (ads.length > 0 && context) {
      const targetedAds = ads.filter((ad) => {
        if (!ad.targeting) return true;
        // Simple targeting logic - can be extended
        return true; // Implement targeting logic based on context
      });

      if (targetedAds.length > 0) {
        return targetedAds[0]; // Return highest priority ad
      }
    }

    return ads.length > 0 ? ads[0] : null;
  }

  async findOne(id: string): Promise<Ad> {
    const ad = await this.adsRepository.findOne({
      where: { id },
      relations: ['impressionsList'],
    });

    if (!ad) {
      throw new NotFoundException(`Ad with ID ${id} not found`);
    }

    return ad;
  }

  async update(id: string, updateAdDto: UpdateAdDto): Promise<Ad> {
    const ad = await this.findOne(id);
    Object.assign(ad, updateAdDto);
    return this.adsRepository.save(ad);
  }

  async remove(id: string): Promise<void> {
    const ad = await this.findOne(id);
    await this.adsRepository.remove(ad);
  }

  async trackImpression(trackImpressionDto: TrackImpressionDto): Promise<AdImpression> {
    const ad = await this.findOne(trackImpressionDto.adId);

    const impression = this.adImpressionsRepository.create({
      ...trackImpressionDto,
    });

    const savedImpression = await this.adImpressionsRepository.save(impression);

    // Update ad statistics
    await this.adsRepository.increment({ id: ad.id }, 'impressions', 1);

    return savedImpression;
  }

  async trackClick(impressionId: string, revenue?: number): Promise<void> {
    const impression = await this.adImpressionsRepository.findOne({
      where: { id: impressionId },
      relations: ['ad'],
    });

    if (!impression) {
      throw new NotFoundException(`Impression with ID ${impressionId} not found`);
    }

    impression.clicked = true;
    impression.clickedAt = new Date();
    if (revenue) {
      impression.revenue = revenue;
    }

    await this.adImpressionsRepository.save(impression);

    // Update ad statistics
    await this.adsRepository.increment({ id: impression.adId }, 'clicks', 1);
    if (revenue) {
      await this.adsRepository.increment({ id: impression.adId }, 'revenue', revenue);
    }
  }

  async getAdStats(id: string): Promise<any> {
    const ad = await this.findOne(id);
    const impressions = await this.adImpressionsRepository.find({
      where: { adId: id },
    });

    const clicks = impressions.filter((i) => i.clicked).length;
    const totalRevenue = impressions.reduce((sum, i) => sum + Number(i.revenue || 0), 0);

    return {
      ad,
      totalImpressions: impressions.length,
      totalClicks: clicks,
      clickThroughRate: impressions.length > 0 ? (clicks / impressions.length) * 100 : 0,
      totalRevenue,
    };
  }
}

