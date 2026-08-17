import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('ad_settings')
export class AdSetting {
  @PrimaryColumn()
  key: string;

  @Column({ nullable: true })
  value: string;

  @Column({ nullable: true })
  description: string;
}
