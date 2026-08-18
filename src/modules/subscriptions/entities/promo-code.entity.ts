import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PromoCodeType {
  PERCENTAGE = 'percentage', // Discount as percentage (e.g., 10%)
  FIXED = 'fixed', // Discount as fixed amount (e.g., $5 off)
}

@Entity('promo_codes')
@Index(['code'], { unique: true })
@Index(['isActive'])
@Index(['expiryDate'])
@Index(['isActive'], { where: `"isActive" = true` })
export class PromoCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, length: 50 })
  code: string; // e.g., "SAVE10" or "WELCOME20"

  @Column({ type: 'varchar', length: 20, default: PromoCodeType.PERCENTAGE })
  type: PromoCodeType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discountValue: number; // Either percentage or fixed amount depending on type

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxDiscount: number; // Optional: max discount amount for percentage discounts (e.g., max $20 off)

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  minPurchaseAmount: number; // Minimum purchase amount to apply code

  @Column({ type: 'int', nullable: true })
  maxUses: number; // null = unlimited uses

  @Column({ type: 'int', default: 0 })
  currentUses: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp' })
  expiryDate: Date;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  description: string; // e.g., "10% off for new users"

  @Column({ type: 'varchar', nullable: true, length: 100 })
  applicablePlans: string; // JSON array of plan IDs or null for all plans

  @Column({ type: 'int', nullable: true })
  maxUsesPerUser: number; // How many times a single user can use this code

  @Column({ type: 'timestamp', nullable: true })
  startDate: Date; // When code becomes active

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>; // {campaign, region, targetUser, etc.}

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Check if code is valid and can be used
   */
  isValid(): boolean {
    const now = new Date();
    return (
      this.isActive &&
      now < this.expiryDate &&
      (!this.startDate || now >= this.startDate) &&
      (!this.maxUses || this.currentUses < this.maxUses)
    );
  }

  /**
   * Check if code has expired
   */
  hasExpired(): boolean {
    return new Date() >= this.expiryDate;
  }

  /**
   * Check if code has reached max uses
   */
  isExhausted(): boolean {
    return this.maxUses !== null && this.currentUses >= this.maxUses;
  }

  /**
   * Calculate discount for amount
   */
  calculateDiscount(amount: number): number {
    if (!this.isValid()) {
      return 0;
    }

    if (this.minPurchaseAmount && amount < this.minPurchaseAmount) {
      return 0;
    }

    let discount = 0;

    if (this.type === PromoCodeType.PERCENTAGE) {
      discount = (amount * this.discountValue) / 100;

      // Apply max discount cap if set
      if (this.maxDiscount && discount > this.maxDiscount) {
        discount = this.maxDiscount;
      }
    } else if (this.type === PromoCodeType.FIXED) {
      discount = Math.min(this.discountValue, amount);
    }

    return Math.round(discount * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get remaining uses
   */
  getRemainingUses(): number {
    if (this.maxUses === null) {
      return -1; // Unlimited
    }
    return Math.max(0, this.maxUses - this.currentUses);
  }

  /**
   * Get display string for discount
   */
  getDisplayText(): string {
    if (this.type === PromoCodeType.PERCENTAGE) {
      return `${this.discountValue}% off`;
    } else {
      return `$${this.discountValue.toFixed(2)} off`;
    }
  }
}
