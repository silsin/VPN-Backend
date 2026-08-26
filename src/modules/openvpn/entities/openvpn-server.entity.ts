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

  @Column({ name: 'server_ip' })
  serverIp: string;

  @Column({ default: 1194 })
  port: number;

  @Column({ default: 'udp', enum: ['udp', 'tcp'] })
  protocol: 'udp' | 'tcp';

  @Column({ name: 'ca_bundle', type: 'text', nullable: true })
  caBundle: string;

  @Column({ name: 'client_cert', type: 'text', nullable: true })
  clientCert: string;

  @Column({ name: 'client_key', type: 'text', nullable: true })
  clientKey: string;

  @Column({ name: 'tls_crypt', type: 'text', nullable: true })
  tlsCrypt: string;

  @Column({ name: 'auth_type', default: 'user-pass', enum: ['certificate', 'user-pass'] })
  authType: OpenVpnAuthType;

  @Column({ name: 'shared_username' })
  sharedUsername: string;

  @Column({ name: 'shared_password' })
  sharedPassword: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  city: string;

  @Column({ default: 0 })
  speed: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
