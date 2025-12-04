import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Dialog } from './dialog.entity';

export enum DeliveryStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

@Entity('dialog_deliveries')
export class DialogDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  dialogId: string;

  @ManyToOne(() => Dialog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dialogId' })
  dialog: Dialog;

  @Column({ type: 'varchar', length: 255 })
  deviceId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  platform: string;

  @Column({
    type: 'varchar',
    length: 20,
    enum: DeliveryStatus,
  })
  deliveryStatus: DeliveryStatus;

  @Column({ type: 'boolean', default: false })
  clicked: boolean;

  @Column({ type: 'boolean', default: false })
  dismissed: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  sentAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  deliveredAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  clickedAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  dismissedAt: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
