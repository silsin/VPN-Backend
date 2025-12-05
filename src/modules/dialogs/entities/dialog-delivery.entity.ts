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

  @Column({ type: 'uuid', name: 'dialog_id' })
  dialogId: string;

  @ManyToOne(() => Dialog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dialog_id' })
  dialog: Dialog;

  @Column({ type: 'varchar', length: 255, name: 'device_id' })
  deviceId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  platform: string;

  @Column({
    type: 'varchar',
    length: 20,
    enum: DeliveryStatus,
    name: 'delivery_status',
  })
  deliveryStatus: DeliveryStatus;

  @Column({ type: 'boolean', default: false })
  clicked: boolean;

  @Column({ type: 'boolean', default: false })
  dismissed: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'sent_at' })
  sentAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'delivered_at' })
  deliveredAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'clicked_at' })
  clickedAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'dismissed_at' })
  dismissedAt: Date;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage: string;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt: Date;
}
