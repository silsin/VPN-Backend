import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum V2RayConfigType {
  LINK = 'v2ray_link',
  JSON = 'json_config',
}

export enum V2RayConfigCategory {
  SPLASH = 'splash',
  MAIN = 'main',
  BACKUP = 'backup',
}

@Entity('v2ray_configs')
export class V2RayConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({
    type: 'enum',
    enum: V2RayConfigType,
    default: V2RayConfigType.LINK,
  })
  type: V2RayConfigType;

  @Column({
    type: 'enum',
    enum: V2RayConfigCategory,
    default: V2RayConfigCategory.MAIN,
  })
  category: V2RayConfigCategory;

  @Column({ nullable: true, length: 2 })
  country: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
