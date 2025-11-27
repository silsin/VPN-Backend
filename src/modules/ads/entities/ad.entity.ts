import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AdType {
  BANNER = 'banner',
  VIDEO = 'video',
  REWARD = 'reward',
}

export enum AdPlatform {
  ANDROID = 'android',
  IOS = 'ios',
  BOTH = 'both',
}

export enum AdPlacement {
  MAIN_PAGE = 'main_page',
  SPLASH = 'splash',
  VIDEO_AD = 'video_ad',
  REWARD_VIDEO = 'reward_video',
}

@Entity('ads')
export class Ad {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: AdType,
  })
  type: AdType;

  @Column({
    type: 'enum',
    enum: AdPlatform,
  })
  platform: AdPlatform;

  @Column()
  adUnitId: string;

  @Column({
    type: 'enum',
    enum: AdPlacement,
  })
  placement: AdPlacement;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
