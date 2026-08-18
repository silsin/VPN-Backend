import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { SubscriptionPlan } from './subscription-plan.entity';
import { User } from '../../users/entities/user.entity';

export enum GiftCodeStatus {
  ACTIVE = 'active',
  USED = 'used',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Entity('gift_codes')
@Index(['code'], { unique: true })
@Index(['status'])
@Index(['expiryDate'])
@Index(['planId'])
@Index(['status'], { where: `status = 'active'` })
export class GiftCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, length: 50 })
  code: string; // e.g., "SUMMER2024-ABC123"

  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => SubscriptionPlan, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'planId' })
  plan: SubscriptionPlan;

  @Column({ type: 'varchar', default: GiftCodeStatus.ACTIVE })
  status: GiftCodeStatus;

  @Column({ type: 'int' })
  maxUses: number; // Max number of times this code can be used

  @Column({ type: 'int', default: 0 })
  currentUses: number; // Current number of uses

  @Column({ type: 'timestamp' })
  expiryDate: Date;

  @Column({ type: 'uuid', nullable: true })
  usedByUserId: string; // For single-use codes, who used it

  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
    eager: false,
  })
  @JoinColumn({ name: 'usedByUserId' })
  usedByUser: User;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date; // When it was first used

  @Column({ type: 'varchar', nullable: true, length: 255 })
  description: string; // e.g., "Summer promotion 2024"

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>; // {campaign, region, discount%, etc.}

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Check if code is valid and usable
   */
  isValid(): boolean {
    const now = new Date();
    return (
      this.status === GiftCodeStatus.ACTIVE &&
      now < this.expiryDate &&
      this.currentUses < this.maxUses
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
    return this.currentUses >= this.maxUses;
  }

  /**
   * Get remaining uses
   */
  getRemainingUses(): number {
    return Math.max(0, this.maxUses - this.currentUses);
  }
}
