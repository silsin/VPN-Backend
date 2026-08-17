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

@Entity('usage_tracking')
@Index(['userId'])
@Index(['userId', 'cycleStartDate', 'cycleEndDate'])
@Index(['userId'], { where: `"cycleEndDate" > CURRENT_TIMESTAMP` })
@Index(['userId'], { where: `"isLimitExceeded" = true` })
@Index(['cycleStartDate'])
export class UsageTracking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.usageTracking, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'timestamp' })
  cycleStartDate: Date;

  @Column({ type: 'timestamp' })
  cycleEndDate: Date;

  @Column({ type: 'bigint', default: 0 })
  dataUsedBytes: number; // Total bytes used in this cycle

  @Column({ type: 'bigint', nullable: true })
  dataLimitBytes: number; // NULL = unlimited

  @Column({ type: 'int', default: 0 })
  devicesUsed: number; // Number of unique devices

  @Column({ type: 'int', nullable: true })
  maxDevices: number;

  @Column({ type: 'boolean', default: false })
  isLimitExceeded: boolean;

  @Column({ type: 'int', default: 0 })
  warningsSent: number; // How many warning notifications sent

  @Column({ type: 'timestamp', nullable: true })
  lastWarningAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsageAt: Date; // Last time data was consumed

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Get data used as GB
   */
  getDataUsedGB(): number {
    return this.dataUsedBytes / (1024 * 1024 * 1024);
  }

  /**
   * Get data limit as GB
   */
  getDataLimitGB(): number | null {
    if (this.dataLimitBytes === null) return null;
    return this.dataLimitBytes / (1024 * 1024 * 1024);
  }

  /**
   * Get usage percentage (0-100)
   */
  getUsagePercent(): number {
    if (this.dataLimitBytes === null) return 0; // Unlimited
    if (this.dataLimitBytes === 0) return 0;
    return Math.min(100, (this.dataUsedBytes / this.dataLimitBytes) * 100);
  }

  /**
   * Get remaining data in bytes
   */
  getRemainingBytes(): number | null {
    if (this.dataLimitBytes === null) return null;
    return Math.max(0, this.dataLimitBytes - this.dataUsedBytes);
  }

  /**
   * Get remaining data in GB
   */
  getRemainingGB(): number | null {
    const remaining = this.getRemainingBytes();
    if (remaining === null) return null;
    return remaining / (1024 * 1024 * 1024);
  }

  /**
   * Check if limit exceeded
   */
  isExceeded(): boolean {
    if (this.dataLimitBytes === null) return false;
    return this.dataUsedBytes >= this.dataLimitBytes;
  }

  /**
   * Check if near limit (80%)
   */
  isNearLimit(threshold: number = 0.8): boolean {
    if (this.dataLimitBytes === null) return false;
    return this.getUsagePercent() >= threshold * 100;
  }

  /**
   * Add data usage (in bytes)
   */
  addUsage(bytes: number): void {
    this.dataUsedBytes += bytes;
    this.lastUsageAt = new Date();

    // Update limit exceeded flag
    if (this.dataLimitBytes !== null && this.dataUsedBytes >= this.dataLimitBytes) {
      this.isLimitExceeded = true;
    }
  }

  /**
   * Check if cycle is still active
   */
  isActive(): boolean {
    const now = new Date();
    return now >= this.cycleStartDate && now < this.cycleEndDate;
  }

  /**
   * Get cycle duration in days
   */
  getCycleDurationDays(): number {
    const diff = this.cycleEndDate.getTime() - this.cycleStartDate.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Get days remaining in cycle
   */
  getDaysRemaining(): number {
    const now = new Date();
    if (now >= this.cycleEndDate) return 0;
    const diff = this.cycleEndDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Get estimated daily usage rate (GB per day)
   */
  getEstimatedDailyRate(): number {
    const now = new Date();
    const msElapsed = now.getTime() - this.cycleStartDate.getTime();
    const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);

    if (daysElapsed === 0) return 0;

    return this.getDataUsedGB() / daysElapsed;
  }

  /**
   * Get projected usage by end of cycle
   */
  getProjectedTotalUsage(): number {
    const dailyRate = this.getEstimatedDailyRate();
    const totalDays = this.getCycleDurationDays();
    return dailyRate * totalDays;
  }

  /**
   * Check if will exceed limit based on current usage rate
   */
  willExceedLimit(): boolean {
    if (this.dataLimitBytes === null) return false;
    const projected = this.getProjectedTotalUsage();
    const limitGB = this.getDataLimitGB();
    return projected > limitGB;
  }
}
