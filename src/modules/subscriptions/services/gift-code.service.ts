import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GiftCode, GiftCodeStatus } from '../entities/gift-code.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';

@Injectable()
export class GiftCodeService {
  private logger = new Logger(GiftCodeService.name);

  constructor(
    @InjectRepository(GiftCode)
    private giftCodeRepository: Repository<GiftCode>,
    @InjectRepository(SubscriptionPlan)
    private plansRepository: Repository<SubscriptionPlan>,
  ) {}

  /**
   * Create a new gift code
   */
  async createGiftCode(
    code: string,
    planId: string,
    maxUses: number,
    expiryDate: Date,
    description?: string,
    metadata?: any,
  ): Promise<GiftCode> {
    // Check if plan exists
    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    // Check if code already exists
    const existing = await this.giftCodeRepository.findOne({ where: { code } });
    if (existing) {
      throw new BadRequestException('Gift code already exists');
    }

    const giftCode = this.giftCodeRepository.create({
      code: code.toUpperCase(),
      planId,
      maxUses,
      expiryDate,
      description,
      metadata,
      status: GiftCodeStatus.ACTIVE,
      currentUses: 0,
    });

    return this.giftCodeRepository.save(giftCode);
  }

  /**
   * Validate a gift code
   */
  async validateGiftCode(code: string): Promise<GiftCode> {
    const giftCode = await this.giftCodeRepository.findOne({
      where: { code: code.toUpperCase() },
      relations: ['plan'],
    });

    if (!giftCode) {
      throw new BadRequestException('Invalid gift code');
    }

    // Check if code is valid
    if (giftCode.status === GiftCodeStatus.REVOKED) {
      throw new BadRequestException('Gift code has been revoked');
    }

    if (giftCode.status === GiftCodeStatus.USED && giftCode.maxUses === 1) {
      throw new BadRequestException('Gift code has already been used');
    }

    if (giftCode.hasExpired()) {
      throw new BadRequestException('Gift code has expired');
    }

    if (giftCode.isExhausted()) {
      throw new BadRequestException('Gift code usage limit reached');
    }

    if (!giftCode.isValid()) {
      throw new BadRequestException('Gift code is no longer valid');
    }

    return giftCode;
  }

  /**
   * Use a gift code
   */
  async useGiftCode(code: string, userId: string): Promise<GiftCode> {
    const giftCode = await this.validateGiftCode(code);

    // Increment usage
    giftCode.currentUses++;
    giftCode.usedByUserId = userId;
    giftCode.usedAt = new Date();

    // Update status if fully exhausted
    if (giftCode.isExhausted()) {
      giftCode.status = GiftCodeStatus.USED;
    }

    this.logger.log(`Gift code ${code} used by user ${userId}`);

    return this.giftCodeRepository.save(giftCode);
  }

  /**
   * Get gift code details
   */
  async getGiftCode(code: string): Promise<GiftCode> {
    const giftCode = await this.giftCodeRepository.findOne({
      where: { code: code.toUpperCase() },
      relations: ['plan', 'usedByUser'],
    });

    if (!giftCode) {
      throw new NotFoundException('Gift code not found');
    }

    return giftCode;
  }

  /**
   * Revoke a gift code
   */
  async revokeGiftCode(code: string): Promise<GiftCode> {
    const giftCode = await this.giftCodeRepository.findOne({
      where: { code: code.toUpperCase() },
    });

    if (!giftCode) {
      throw new NotFoundException('Gift code not found');
    }

    giftCode.status = GiftCodeStatus.REVOKED;

    this.logger.log(`Gift code ${code} revoked`);

    return this.giftCodeRepository.save(giftCode);
  }

  /**
   * Get active gift codes (admin)
   */
  async getActiveGiftCodes(planId?: string): Promise<GiftCode[]> {
    const query = this.giftCodeRepository
      .createQueryBuilder('gc')
      .where('gc.status = :status', { status: GiftCodeStatus.ACTIVE })
      .andWhere('gc.expiryDate > NOW()')
      .andWhere('gc.currentUses < gc.maxUses');

    if (planId) {
      query.andWhere('gc.planId = :planId', { planId });
    }

    return query.orderBy('gc.expiryDate', 'ASC').getMany();
  }

  /**
   * Get gift code usage analytics
   */
  async getUsageAnalytics(startDate?: Date, endDate?: Date): Promise<any> {
    let query = this.giftCodeRepository.createQueryBuilder('gc');

    if (startDate) {
      query = query.andWhere('gc.usedAt >= :startDate', { startDate });
    }

    if (endDate) {
      query = query.andWhere('gc.usedAt <= :endDate', { endDate });
    }

    const stats = await query
      .select('COUNT(*)', 'totalCodes')
      .addSelect("SUM(CASE WHEN gc.status = 'used' THEN 1 ELSE 0 END)", 'usedCodes')
      .addSelect("SUM(CASE WHEN gc.status = 'active' THEN 1 ELSE 0 END)", 'activeCodes')
      .addSelect("SUM(CASE WHEN gc.status = 'expired' THEN 1 ELSE 0 END)", 'expiredCodes')
      .addSelect("SUM(CASE WHEN gc.status = 'revoked' THEN 1 ELSE 0 END)", 'revokedCodes')
      .addSelect('SUM(gc.currentUses)', 'totalUses')
      .addSelect('AVG(gc.currentUses)', 'avgUses')
      .getRawOne();

    return {
      totalCodes: parseInt(stats.totalCodes || 0),
      usedCodes: parseInt(stats.usedCodes || 0),
      activeCodes: parseInt(stats.activeCodes || 0),
      expiredCodes: parseInt(stats.expiredCodes || 0),
      revokedCodes: parseInt(stats.revokedCodes || 0),
      totalUses: parseInt(stats.totalUses || 0),
      avgUses: parseFloat(stats.avgUses || 0),
    };
  }

  /**
   * Delete a gift code (admin)
   */
  async deleteGiftCode(code: string): Promise<void> {
    await this.giftCodeRepository.delete({ code: code.toUpperCase() });
    this.logger.log(`Gift code ${code} deleted`);
  }
}
