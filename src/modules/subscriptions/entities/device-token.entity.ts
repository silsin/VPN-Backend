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

@Entity('device_tokens')
@Index(['userId'])
@Index(['token'], { unique: true })
@Index(['userId', 'isActive'])
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.deviceTokens, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  token: string; // Firebase Cloud Messaging token

  @Column({ type: 'varchar', nullable: true, length: 100 })
  deviceName: string; // Device name for user identification

  @Column({ type: 'varchar', nullable: true, length: 50 })
  deviceType: string; // 'ios', 'android', 'web'

  @Column({ type: 'varchar', nullable: true, length: 100 })
  osVersion: string;

  @Column({ type: 'varchar', nullable: true, length: 100 })
  appVersion: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
