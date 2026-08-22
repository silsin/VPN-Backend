import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
import { UserSubscription } from './user-subscription.entity';
import { Payment } from './payment.entity';

export enum SubscriptionAction {
  PURCHASED = 'purchased', // New subscription
  UPGRADED = 'upgraded', // Changed to higher tier
  DOWNGRADED = 'downgraded', // Changed to lower tier
  RENEWED = 'renewed', // Auto-renewal
  EXTENDED = 'extended', // Extended existing subscription
  CANCELLED = 'cancelled', // User cancelled
  REACTIVATED = 'reactivated', // Re-activated after expiry
  REFUNDED = 'refunded', // Refund issued
  SUSPENDED = 'suspended', // Admin action
}

export enum ActionReason {
  USER_REQUEST = 'user_request',
  AUTO_RENEWAL = 'auto_renewal',
  ADMIN_ACTION = 'admin_action',
  PAYMENT_FAILED = 'payment_failed',
  ADMIN_REFUND = 'admin_refund',
  FRAUD_DETECTION = 'fraud_detection',
  POLICY_VIOLATION = 'policy_violation',
}

@Entity('subscription_history')
@Index(['userId'])
@Index(['createdAt'])
@Index(['action'])
@Index(['userId', 'createdAt'], { unique: false })
export class SubscriptionHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => SubscriptionPlan, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'planId' })
  plan: SubscriptionPlan;

  @Column({ type: 'uuid', nullable: true, name: 'previousPlanId' })
  previousPlanId: string;

  @ManyToOne(() => SubscriptionPlan, {
    onDelete: 'SET NULL',
    eager: true,
  })
  @JoinColumn({ name: 'previousPlanId' })
  previousPlan: SubscriptionPlan;

  @Column({ type: 'varchar', length: 50 })
  action: SubscriptionAction;

  @Column({ type: 'timestamp', name: 'startDate' })
  startDate: Date;

  @Column({ type: 'timestamp', name: 'expiryDate' })
  expiryDate: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'oldExpiryDate' })
  oldExpiryDate: Date;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  reason: ActionReason;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'uuid', nullable: true, name: 'createdByUserId' })
  createdByUserId: string;

  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
    eager: false,
  })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser: User;

  @Column({ type: 'uuid', nullable: true, name: 'paymentId' })
  paymentId: string;

  @ManyToOne(() => Payment, {
    onDelete: 'SET NULL',
    eager: false,
  })
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  /**
   * Get duration of this subscription in days
   */
  getDurationDays(): number {
    const diff = this.expiryDate.getTime() - this.startDate.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Get extension duration if applicable
   */
  getExtensionDays(): number | null {
    if (!this.oldExpiryDate) return null;
    const diff = this.expiryDate.getTime() - this.oldExpiryDate.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if this was an upgrade
   */
  wasUpgrade(): boolean {
    return this.action === SubscriptionAction.UPGRADED;
  }

  /**
   * Check if this was a downgrade
   */
  wasDowngrade(): boolean {
    return this.action === SubscriptionAction.DOWNGRADED;
  }

  /**
   * Check if this was a renewal
   */
  wasRenewal(): boolean {
    return this.action === SubscriptionAction.RENEWED;
  }

  /**
   * Check if this was a cancellation
   */
  wasCancelled(): boolean {
    return this.action === SubscriptionAction.CANCELLED;
  }
}
