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
import { User } from '../../users/entities/user.entity';
import { UserSubscription } from './user-subscription.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  CRYPTO = 'crypto',
  GIFT_CODE = 'gift_code',
  MANUAL = 'manual', // Admin manual payment
  GOOGLE_PLAY = 'google_play', // Android in-app billing
  APPLE_PAY = 'apple_pay', // iOS in-app billing
}

@Entity('payments')
@Index(['userId'])
@Index(['subscriptionId'])
@Index(['status'])
@Index(['transactionId'], { unique: true, where: 'transactionId IS NOT NULL' })
@Index(['createdAt'])
@Index(['status'], { where: `status = 'failed'` }) // Failed payments
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.payments, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  subscriptionId: string;

  @ManyToOne(() => UserSubscription, (sub) => sub.payments, {
    onDelete: 'SET NULL',
    eager: true,
  })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: UserSubscription;

  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.payments, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'planId' })
  plan: SubscriptionPlan;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 50, name: 'payment_method' })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'varchar', nullable: true, length: 255, unique: true, name: 'transactionId' })
  transactionId: string;

  @Column({ type: 'varchar', nullable: true, length: 255, name: 'failureReason' })
  failureReason: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'refundAmount' })
  refundAmount: number;

  @Column({ type: 'timestamp', nullable: true, name: 'refundedAt' })
  refundedAt: Date;

  @Column({ type: 'varchar', nullable: true, length: 255, name: 'refundTransactionId' })
  refundTransactionId: string;

  @Column({
    type: 'varchar',
    nullable: true,
    length: 64,
    name: 'googlePlayPurchaseTokenHash',
    comment: 'SHA-256 hash of Google Play purchase token for replay attack prevention',
  })
  googlePlayPurchaseTokenHash: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;

  /**
   * Check if payment was successful
   */
  isSuccessful(): boolean {
    return this.status === PaymentStatus.COMPLETED;
  }

  /**
   * Check if payment is still pending
   */
  isPending(): boolean {
    return this.status === PaymentStatus.PENDING;
  }

  /**
   * Check if payment failed
   */
  hasFailed(): boolean {
    return this.status === PaymentStatus.FAILED;
  }

  /**
   * Check if payment was refunded
   */
  isRefunded(): boolean {
    return this.status === PaymentStatus.REFUNDED;
  }

  /**
   * Get payment display amount (with currency)
   */
  getDisplayAmount(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }

  /**
   * Get net amount after refunds
   */
  getNetAmount(): number {
    if (this.refundAmount) {
      return this.amount - this.refundAmount;
    }
    return this.amount;
  }

  /**
   * Check if payment is old enough to retry (for failed payments)
   */
  canRetry(minHoursSinceCreation: number = 24): boolean {
    if (!this.hasFailed()) return false;

    const now = new Date();
    const hoursSinceCreation =
      (now.getTime() - this.createdAt.getTime()) / (1000 * 60 * 60);

    return hoursSinceCreation >= minHoursSinceCreation;
  }
}
