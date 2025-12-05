import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DialogType {
  IN_APP = 'in-app',
  PUSH = 'push',
  BOTH = 'both',
}

export enum DialogStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENT = 'sent',
  CANCELLED = 'cancelled',
}

export enum DialogTarget {
  ALL = 'all',
  ANDROID = 'android',
  IOS = 'ios',
}

@Entity('dialogs')
export class Dialog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 20,
    enum: DialogType,
  })
  type: DialogType;

  @Column({
    type: 'varchar',
    length: 20,
    enum: DialogStatus,
    default: DialogStatus.DRAFT,
  })
  status: DialogStatus;

  @Column({
    type: 'varchar',
    length: 20,
    enum: DialogTarget,
    default: DialogTarget.ALL,
  })
  target: DialogTarget;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'image_url' })
  imageUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'action_url' })
  actionUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  buttons: Array<{
    label: string;
    actionUrl?: string;
    action?: string;
    style?: string;
  }>;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'schedule_time' })
  scheduleTime: Date;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'sent_time' })
  sentTime: Date;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt: Date;
}
