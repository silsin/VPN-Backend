import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Connection } from '../../connections/entities/connection.entity';

export enum ServerStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
}

export enum ServerLocation {
  US = 'us',
  UK = 'uk',
  DE = 'de',
  FR = 'fr',
  JP = 'jp',
  SG = 'sg',
  AU = 'au',
  CA = 'ca',
  NL = 'nl',
  SE = 'se',
}

@Entity('vpn_servers')
export class VpnServer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  hostname: string;

  @Column()
  ipAddress: string;

  @Column({ type: 'int' })
  port: number;

  @Column({
    type: 'enum',
    enum: ServerLocation,
  })
  location: ServerLocation;

  @Column({
    type: 'enum',
    enum: ServerStatus,
    default: ServerStatus.OFFLINE,
  })
  status: ServerStatus;

  @Column({ type: 'int', default: 0 })
  currentConnections: number;

  @Column({ type: 'int', default: 0 })
  maxConnections: number;

  @Column({ type: 'bigint', default: 0 })
  totalDataTransferred: number; // in bytes

  @Column({ type: 'float', default: 0 })
  loadAverage: number;

  @Column({ nullable: true })
  protocol: string; // e.g., 'OpenVPN', 'WireGuard', 'IKEv2'

  @Column({ type: 'text', nullable: true })
  configuration: string; // JSON configuration

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  lastHealthCheck: Date;

  @OneToMany(() => Connection, (connection) => connection.server)
  connections: Connection[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

