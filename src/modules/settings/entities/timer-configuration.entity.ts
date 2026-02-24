import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('timer_configurations')
export class TimerConfiguration {
  @PrimaryColumn({ length: 50 })
  id: string;

  @Column({ length: 50 })
  category: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ nullable: true })
  interval_seconds: number;

  @Column({ nullable: true })
  duration_seconds: number;

  @Column({ nullable: true })
  min_value: number;

  @Column({ nullable: true })
  max_value: number;

  @Column({ default: true })
  backend_control: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
