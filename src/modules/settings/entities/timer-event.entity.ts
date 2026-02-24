import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('timer_events')
export class TimerEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  @Index('idx_timer_events_timer_id')
  timer_id: string;

  @Column({ length: 50 })
  event_type: string;

  @Column({ length: 100, nullable: true })
  user_id: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'timestamp' })
  @Index('idx_timer_events_timestamp')
  timestamp: Date;
}
