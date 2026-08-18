import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromoCode, PromoCodeType } from '../entities/promo-code.entity';

@Injectable()
export class PromoCodeService {
  private logger = new Logger(PromoCodeService.name);

  constructor(
    @InjectRepository(PromoCode)
    private promoCodeRepository: Repository<PromoCode>,
  ) {}

  /**
   * Create a new promo code
   */
  async createPromoCode(
    code: string,
    type: PromoCodeType,
    discountValue: number,
    expiryDate: Date,
    maxUses?: number,
    minPurchaseAmount?: number,
    maxDiscount?: number,
    description?: string,
    applicablePlans?: string,
    maxUsesPerUser?: number,
    startDate?: Date,
    metadata?: any,
  ): Promise<PromoCode> {
    // Check if code already exists
    const existing = await this.promoCodeRepository.findOne({
      where: { code: code.toUpperCase() },
    });
    if (existing) {
      throw new BadRequestException('Promo code already exists');
    }

    if (discountValue <= 0) {
      throw new BadRequestException('Discount value must be greater than 0');
    }

    if (type === PromoCodeType.PERCENTAGE && discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }

    const promoCode = this.promoCodeRepository.create({
      code: code.toUpperCase(),
      type,
      discountValue,
      expiryDate,
      maxUses: maxUses || null,
      minPurchaseAmount: minPurchaseAmount || null,
      maxDiscount: maxDiscount || null,
      description,
      applicablePlans,
      maxUsesPerUser: maxUsesPerUser || null,
      startDate: startDate || new Date(),
      metadata,
      isActive: true,
      currentUses: 0,
    });

    return this.promoCodeRepository.save(promoCode);
  }

  /**
   * Validate a promo code
   */
  async validatePromoCode(code: string, amount?: number): Promise<PromoCode> {
    const promoCode = await this.promoCodeRepository.findOne({
      where: { code: code.toUpperCase() },
    });

    if (!promoCode) {
      throw new BadRequestException('Invalid promo code');
    }

    if (!promoCode.isActive) {
      throw new BadRequestException('Promo code is not active');
    }

    if (promoCode.hasExpired()) {
      throw new BadRequestException('Promo code has expired');
    }

    if (!promoCode.isValid()) {
      throw new BadRequestException('Promo code is no longer valid');
    }

    if (amount && promoCode.minPurchaseAmount && amount < promoCode.minPurchaseAmount) {
      throw new BadRequestException(
        `Minimum purchase amount is $${promoCode.minPurchaseAmount.toFixed(2)}`,
      );
    }

    return promoCode;
  }

  /**
   * Apply promo code to amount
   */
  async applyPromoCode(code: string, amount: number): Promise<{
    discount: number;
    finalAmount: number;
    promoCode: PromoCode;
  }> {
    const promoCode = await this.validatePromoCode(code, amount);

    const discount = promoCode.calculateDiscount(amount);
    const finalAmount = Math.max(0, amount - discount);

    return {
      discount: Math.round(discount * 100) / 100,
      finalAmount: Math.round(finalAmount * 100) / 100,
      promoCode,
    };
  }

  /**
   * Use a promo code (increment usage)
   */
  async usePromoCode(code: string): Promise<PromoCode> {
    const promoCode = await this.validatePromoCode(code);

    promoCode.currentUses++;

    this.logger.log(`Promo code ${code} used. Total uses: ${promoCode.currentUses}`);

    return this.promoCodeRepository.save(promoCode);
  }

  /**
   * Get promo code details
   */
  async getPromoCode(code: string): Promise<PromoCode> {
    const promoCode = await this.promoCodeRepository.findOne({
      where: { code: code.toUpperCase() },
    });

    if (!promoCode) {
      throw new NotFoundException('Promo code not found');
    }

    return promoCode;
  }

  /**
   * Deactivate a promo code
   */
  async deactivatePromoCode(code: string): Promise<PromoCode> {
    const promoCode = await this.getPromoCode(code);

    promoCode.isActive = false;

    this.logger.log(`Promo code ${code} deactivated`);

    return this.promoCodeRepository.save(promoCode);
  }

  /**
   * Get all active promo codes
   */
  async getActivePromoCodes(): Promise<PromoCode[]> {
    return this.promoCodeRepository
      .createQueryBuilder('pc')
      .where('pc.isActive = :isActive', { isActive: true })
      .andWhere('pc.expiryDate > NOW()')
      .andWhere('pc.startDate <= NOW()')
      .andWhere('(pc.maxUses IS NULL OR pc.currentUses < pc.maxUses)')
      .orderBy('pc.expiryDate', 'ASC')
      .getMany();
  }

  /**
   * Get promo code analytics
   */
  async getAnalytics(startDate?: Date, endDate?: Date): Promise<any> {
    let query = this.promoCodeRepository.createQueryBuilder('pc');

    if (startDate) {
      query = query.andWhere('pc.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      query = query.andWhere('pc.createdAt <= :endDate', { endDate });
    }

    const stats = await query
      .select('COUNT(*)', 'totalCodes')
      .addSelect('SUM(CASE WHEN pc.isActive = true THEN 1 ELSE 0 END)', 'activeCodes')
      .addSelect('SUM(pc.currentUses)', 'totalUses')
      .addSelect('AVG(pc.currentUses)', 'avgUsesPerCode')
      .addSelect('MAX(pc.currentUses)', 'maxUsesPerCode')
      .getRawOne();

    return {
      totalCodes: parseInt(stats.totalCodes || 0),
      activeCodes: parseInt(stats.activeCodes || 0),
      totalUses: parseInt(stats.totalUses || 0),
      avgUsesPerCode: parseFloat(stats.avgUsesPerCode || 0),
      maxUsesPerCode: parseInt(stats.maxUsesPerCode || 0),
    };
  }

  /**
   * Delete a promo code
   */
  async deletePromoCode(code: string): Promise<void> {
    await this.promoCodeRepository.delete({ code: code.toUpperCase() });
    this.logger.log(`Promo code ${code} deleted`);
  }
}
