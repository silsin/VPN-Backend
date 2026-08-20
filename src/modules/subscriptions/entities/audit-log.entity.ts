import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum AuditLogAction {
  // Subscription actions
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_EXTENDED = 'SUBSCRIPTION_EXTENDED',
  SUBSCRIPTION_SUSPENDED = 'SUBSCRIPTION_SUSPENDED',
  SUBSCRIPTION_REACTIVATED = 'SUBSCRIPTION_REACTIVATED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_UPGRADED = 'SUBSCRIPTION_UPGRADED',
  SUBSCRIPTION_DOWNGRADED = 'SUBSCRIPTION_DOWNGRADED',

  // Payment actions
  PAYMENT_PROCESSED = 'PAYMENT_PROCESSED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',
  PAYMENT_MARKED_COMPLETED = 'PAYMENT_MARKED_COMPLETED',

  // Plan actions
  PLAN_CREATED = 'PLAN_CREATED',
  PLAN_UPDATED = 'PLAN_UPDATED',
  PLAN_DEACTIVATED = 'PLAN_DEACTIVATED',

  // Refund actions
  REFUND_APPLIED = 'REFUND_APPLIED',
  CREDIT_APPLIED = 'CREDIT_APPLIED',
  CREDIT_USED = 'CREDIT_USED',

  // Admin actions
  ADMIN_ACTION = 'ADMIN_ACTION',
}

@Entity('audit_logs')
@Index(['userId', 'createdAt'])
@Index(['action', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  action: AuditLogAction;

  @Column('uuid', { nullable: true, name: 'user_id' })
  userId: string;

  @Column('uuid', { nullable: true, name: 'admin_id' })
  adminId: string;

  @Column()
  resource: string; // e.g., 'subscription', 'payment', 'plan'

  @Column('uuid', { nullable: true, name: 'resource_id' })
  resourceId: string;

  @Column('simple-json')
  changes: {
    before?: any;
    after?: any;
  };

  @Column({ nullable: true })
  reason?: string;

  @Column({ nullable: true, name: 'ip_address' })
  ipAddress?: string;

  @Column({ nullable: true, name: 'user_agent' })
  userAgent?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  constructor(data?: Partial<AuditLog>) {
    Object.assign(this, data);
  }
}
