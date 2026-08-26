import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum OpenVpnAuthType {
  CERTIFICATE = 'certificate',
  USER_PASS = 'user-pass',
}

@Entity('openvpn_servers')
export class OpenVpnServer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  serverIp: string;

  @Column({ default: 1194 })
  port: number;

  @Column({ default: 'udp', enum: ['udp', 'tcp'] })
  protocol: 'udp' | 'tcp';

  @Column({ type: 'longtext', nullable: true })
  caBundle: string;

  @Column({ type: 'longtext', nullable: true })
  clientCert: string;

  @Column({ type: 'longtext', nullable: true })
  clientKey: string;

  @Column({ type: 'longtext', nullable: true })
  tlsCrypt: string;

  @Column({ default: 'user-pass', enum: ['certificate', 'user-pass'] })
  authType: OpenVpnAuthType;

  @Column()
  sharedUsername: string;

  @Column()
  sharedPassword: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  city: string;

  @Column({ default: 0 })
  speed: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
