import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('device_sessions')
export class DeviceSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'device_id', type: 'varchar', length: 255 })
  deviceId: string;

  @Index({ unique: true })
  @Column({ name: 'api_auth_token', type: 'varchar', length: 255 })
  apiAuthToken: string;

  @Column({ name: 'aes2_key_b64', type: 'text' })
  aes2KeyB64: string;

  @Column({ name: 'aes2_iv_b64', type: 'text' })
  aes2IvB64: string;

  @Column({ name: 'xor3_key_b64', type: 'text' })
  xor3KeyB64: string;

  @Column({ name: 'last_nonce', type: 'varchar', length: 255, nullable: true })
  lastNonce: string;

  @Column({ name: 'last_body_nonce', type: 'varchar', length: 255, nullable: true })
  lastBodyNonce: string;

  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt: Date;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
