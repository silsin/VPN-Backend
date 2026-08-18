import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
import { Payment } from './payment.entity';
import { SubscriptionHistory } from './subscription-history.entity';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  SUSPENDED = 'suspended',
  PAUSED = 'paused',
  PENDING = 'pending', // Payment processing
}

@Entity('user_subscriptions')
@Index(['userId'], { unique: true })
@Index(['status'])
@Index(['expiryDate'])
@Index(['renewalDate'])
@Index(['status'], { where: `status = 'active'` }) // Active subscriptions index
export class UserSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.subscriptions, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.userSubscriptions, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'planId' })
  plan: SubscriptionPlan;

  @Column({ type: 'varchar', default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  expiryDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  renewalDate: Date; // Next auto-renewal date

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  cancelledReason: string;

  @Column({ type: 'boolean', default: false })
  isAutoRenewal: boolean;

  @Column({ type: 'int', default: 0 })
  failedRenewalAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lastRenewalAttemptAt: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>; // Store extra info (promo codes, discount %, etc.)

  @Column({ type: 'timestamp', nullable: true })
  suspendedAt: Date; // When subscription was suspended

  @Column({ type: 'varchar', nullable: true, length: 500 })
  suspendedReason: string; // Reason for suspension

  @Column({ type: 'varchar', nullable: true })
  suspendedByAdminId: string; // Admin who suspended, or null if automatic

  @Column({ type: 'timestamp', nullable: true })
  pausedAt: Date; // When subscription was paused

  @Column({ type: 'varchar', nullable: true, length: 500 })
  pausedReason: string; // Reason for pause

  @Column({ type: 'boolean', default: false })
  isTrialActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  trialEndDate: Date;

  @Column({ type: 'boolean', default: false })
  trialRedeemed: boolean; // Track if user already used trial

  @OneToMany(() => Payment, (payment) => payment.subscription)
  payments: Payment[];

  @OneToMany(() => SubscriptionHistory, (history) => history.userSubscription)
  history: SubscriptionHistory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Check if subscription is currently active
   */
  isActive(): boolean {
    return this.status === SubscriptionStatus.ACTIVE && new Date() < this.expiryDate;
  }

  /**
   * Get days remaining until expiry
   */
  getDaysRemaining(): number {
    const now = new Date();
    if (now >= this.expiryDate) return 0;
    const diff = this.expiryDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if subscription expires within N days
   */
  expiresWithin(days: number): boolean {
    const daysRemaining = this.getDaysRemaining();
    return daysRemaining > 0 && daysRemaining <= days;
  }

  /**
   * Check if subscription expired
   */
  hasExpired(): boolean {
    return new Date() >= this.expiryDate;
  }

  /**
   * Calculate renewal date based on plan duration
   */
  calculateRenewalDate(): Date {
    if (!this.plan.durationDays) return null; // Free plan doesn't renew
    const renewalDate = new Date(this.expiryDate);
    renewalDate.setDate(renewalDate.getDate() + this.plan.durationDays);
    return renewalDate;
  }

  /**
   * Get subscription cost for this period
   */
  getChargeAmount(): number {
    return this.plan.price;
  }

  /**
   * Check if user can access a feature
   */
  hasFeature(feature: string): boolean {
    if (!this.isActive()) return false;
    if (this.status === SubscriptionStatus.SUSPENDED) return false;
    return this.plan.hasFeature(feature);
  }

  /**
   * Check if subscription is suspended
   */
  isSuspended(): boolean {
    return this.status === SubscriptionStatus.SUSPENDED;
  }

  /**
   * Check if subscription is paused
   */
  isPaused(): boolean {
    return this.status === SubscriptionStatus.PAUSED;
  }

  /**
   * Check if trial is active
   */
  isTrialExpired(): boolean {
    if (!this.isTrialActive) return false;
    return new Date() >= this.trialEndDate;
  }

  /**
   * Get trial days remaining
   */
  getTrialDaysRemaining(): number {
    if (!this.isTrialActive) return 0;
    const now = new Date();
    if (now >= this.trialEndDate) return 0;
    const diff = this.trialEndDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}
