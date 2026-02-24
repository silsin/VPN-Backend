import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('timer_status')
export class TimerStatus {
  @PrimaryColumn({ length: 50 })
  timer_id: string;

  @Column({ length: 20 })
  status: string;

  @Column({ nullable: true })
  remaining_seconds: number;

  @Column({ length: 100, nullable: true })
  user_id: string;

  @UpdateDateColumn({ name: 'last_updated' })
  last_updated: Date;
}
