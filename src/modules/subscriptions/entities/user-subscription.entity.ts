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

  @Column({ type: 'timestamp', name: 'startDate' })
  startDate: Date;

  @Column({ type: 'timestamp', name: 'expiryDate' })
  expiryDate: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'renewalDate' })
  renewalDate: Date; // Next auto-renewal date

  @Column({ type: 'timestamp', nullable: true, name: 'cancelledAt' })
  cancelledAt: Date;

  @Column({ type: 'varchar', nullable: true, length: 255, name: 'cancelledReason' })
  cancelledReason: string;

  @Column({ type: 'boolean', default: false, name: 'isAutoRenewal' })
  isAutoRenewal: boolean;

  @Column({ type: 'int', default: 0, name: 'failedRenewalAttempts' })
  failedRenewalAttempts: number;

  @Column({ type: 'timestamp', nullable: true, name: 'lastRenewalAttemptAt' })
  lastRenewalAttemptAt: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>; // Store extra info (promo codes, discount %, etc.)

  @Column({ type: 'timestamp', nullable: true, name: 'suspendedAt' })
  suspendedAt: Date; // When subscription was suspended

  @Column({ type: 'varchar', nullable: true, length: 500, name: 'suspendedReason' })
  suspendedReason: string; // Reason for suspension

  @Column({ type: 'varchar', nullable: true, name: 'suspendedByAdminId' })
  suspendedByAdminId: string; // Admin who suspended, or null if automatic

  @Column({ type: 'timestamp', nullable: true, name: 'pausedAt' })
  pausedAt: Date; // When subscription was paused

  @Column({ type: 'varchar', nullable: true, length: 500, name: 'pausedReason' })
  pausedReason: string; // Reason for pause

  @Column({ type: 'boolean', default: false, name: 'is_trial_active' })
  isTrialActive: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'trial_end_date' })
  trialEndDate: Date;

  @Column({ type: 'boolean', default: false, name: 'trial_redeemed' })
  trialRedeemed: boolean; // Track if user already used trial

  @OneToMany(() => Payment, (payment) => payment.subscription)
  payments: Payment[];

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
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
