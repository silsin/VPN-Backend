import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserSubscription } from './user-subscription.entity';
import { Payment } from './payment.entity';

@Entity('subscription_plans')
@Index(['isActive'])
@Index(['displayOrder'])
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'int', nullable: true })
  durationDays: number; // NULL for free/unlimited plans

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ type: 'bigint', nullable: true })
  dataLimitGb: number; // NULL for unlimited

  @Column({ type: 'int', default: 1 })
  maxDevices: number;

  @Column({ type: 'jsonb', default: [] })
  features: string[]; // Array of feature strings like ["premium_vpn", "ad_free"]

  @Column({ type: 'int', default: 0 })
  displayOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string; // Admin user who created

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string; // Admin user who last updated

  @OneToMany(() => UserSubscription, (sub) => sub.plan)
  userSubscriptions: UserSubscription[];

  @OneToMany(() => Payment, (payment) => payment.plan)
  payments: Payment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Get data limit in bytes
   */
  getDataLimitBytes(): number | null {
    if (this.dataLimitGb === null) return null;
    return this.dataLimitGb * 1024 * 1024 * 1024;
  }

  /**
   * Check if plan has a specific feature
   */
  hasFeature(feature: string): boolean {
    return this.features.includes(feature);
  }

  /**
   * Get all features as readable text
   */
  getFeaturesList(): string {
    return this.features.join(', ');
  }
}
