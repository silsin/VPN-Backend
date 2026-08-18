import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';


export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BANNED = 'banned',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ unique: true, nullable: true })
  deviceId: string;

  @Column({ nullable: true })
  deviceName: string;

  @Column({ nullable: true })
  platform: string;

  @Column({ nullable: true })
  pushId: string;

  @Column({ nullable: true })
  username: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ default: 0 })
  totalConnections: number;

  @Column({ type: 'bigint', default: 0 })
  totalDataTransferred: number; // in bytes

  @Column({ nullable: true })
  lastConnectionAt: Date;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  emailVerificationToken: string;

  @Column({ nullable: true })
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpires: Date;

  @OneToMany('DeviceLogin', 'user')
  deviceLogins: any[];

  // Subscription-related columns
  @Column({ type: 'varchar', default: 'free', nullable: true })
  subscriptionStatus: string;

  @Column({ type: 'uuid', nullable: true })
  currentPlanId: string;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionExpiryDate: Date;

  @Column({ type: 'int', default: 0 })
  daysRemaining: number;

  @Column({ type: 'bigint', default: 0 })
  dataUsedThisMonth: number;

  @Column({ type: 'bigint', nullable: true })
  maxDataPerMonth: number;

  @Column({ type: 'int', default: 1 })
  maxConcurrentDevices: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSubscriptionCheckAt: Date;

  // Relationships
  @OneToMany('UserSubscription', 'user')
  subscriptions: any[];

  @OneToMany('Payment', 'user')
  payments: any[];

  @OneToMany('UsageTracking', 'user')
  usageTracking: any[];

  @OneToMany('DeviceToken', 'user')
  deviceTokens: any[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

