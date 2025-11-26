import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Ad } from './ad.entity';
import { User } from '../../users/entities/user.entity';

@Entity('ad_impressions')
export class AdImpression {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ad, (ad) => ad.impressionsList)
  @JoinColumn({ name: 'adId' })
  ad: Ad;

  @Column()
  adId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ default: false })
  clicked: boolean;

  @Column({ nullable: true })
  clickedAt: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  revenue: number;

  @CreateDateColumn()
  createdAt: Date;
}

