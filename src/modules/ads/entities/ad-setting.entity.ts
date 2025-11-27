import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('ad_settings')
export class AdSetting {
  @PrimaryColumn()
  key: string;

  @Column()
  value: string;

  @Column({ nullable: true })
  description: string;
}
