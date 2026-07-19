import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AdFailureReason {
  NO_FILL = 'no_fill',
  NETWORK = 'network',
  BLOCKED = 'blocked',
  TIMEOUT = 'timeout',
  SDK_ERROR = 'sdk_error',
  NOT_CONFIGURED = 'not_configured',
  OTHER = 'other',
}

@Entity('ad_failure_reports')
export class AdFailureReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  deviceId: string;

  @Index()
  @Column({ length: 50 })
  platform: string;

  @Column({ length: 100, nullable: true })
  placement?: string;

  @Column({ length: 50, nullable: true })
  adType?: string;

  @Column({ type: 'uuid', nullable: true })
  adId?: string;

  @Column({ length: 255, nullable: true })
  adUnitId?: string;

  @Index()
  @Column({
    type: 'enum',
    enum: AdFailureReason,
    default: AdFailureReason.OTHER,
  })
  reason: AdFailureReason;

  @Column({ type: 'text', nullable: true })
  reasonDetail?: string;

  @Column({ length: 100, nullable: true })
  errorCode?: string;

  @CreateDateColumn()
  createdAt: Date;
}
