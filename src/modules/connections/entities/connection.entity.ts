import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { VpnServer } from '../../vpn-servers/entities/vpn-server.entity';

export enum ConnectionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
}

@Entity('connections')
export class Connection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.connections)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => VpnServer, (server) => server.connections)
  @JoinColumn({ name: 'serverId' })
  server: VpnServer;

  @Column()
  serverId: string;

  @Column({
    type: 'enum',
    enum: ConnectionStatus,
    default: ConnectionStatus.CONNECTING,
  })
  status: ConnectionStatus;

  @Column({ nullable: true })
  clientIp: string;

  @Column({ nullable: true })
  assignedIp: string;

  @Column({ type: 'bigint', default: 0 })
  bytesReceived: number;

  @Column({ type: 'bigint', default: 0 })
  bytesSent: number;

  @Column({ nullable: true })
  connectedAt: Date;

  @Column({ nullable: true })
  disconnectedAt: Date;

  @Column({ type: 'int', nullable: true })
  duration: number; // in seconds

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

