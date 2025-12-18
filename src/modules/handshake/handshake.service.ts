import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { DeviceSession } from './entities/device-session.entity';
import { HandshakeCryptoService } from './handshake-crypto.service';

@Injectable()
export class HandshakeService {
  constructor(
    private readonly configService: ConfigService,
    private readonly cryptoService: HandshakeCryptoService,
    @InjectRepository(DeviceSession)
    private readonly deviceSessionsRepository: Repository<DeviceSession>,
  ) {}

  private validateTimestamp(ts: number) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
      throw new BadRequestException('Invalid timestamp');
    }
    const now = Date.now();
    if (Math.abs(now - ts) > 5000) {
      throw new BadRequestException('Timestamp expired');
    }
  }

  async handleFirstHandshake(appAuthHeader: string | undefined, payloadB64: string) {
    const expected = this.configService.get<string>('HANDSHAKE_APP_AUTH_TOKEN');
    if (!expected) {
      throw new BadRequestException('Server handshake auth is not configured');
    }
    if (!appAuthHeader || appAuthHeader !== expected) {
      const data = this.cryptoService.encryptFirst({ message: 'Unauthorized app' });
      return { ok: false, data, timestamp: Date.now() };
    }

    let req: any;
    try {
      req = this.cryptoService.decryptFirst(payloadB64);
    } catch {
      const data = this.cryptoService.encryptFirst({ message: 'Invalid payload' });
      return { ok: false, data, timestamp: Date.now() };
    }

    this.validateTimestamp(req.timestamp);

    const deviceId = String(req.deviceId || req.device_id || '');
    if (!deviceId) {
      const data = this.cryptoService.encryptFirst({ message: 'Missing deviceId' });
      return { ok: false, data, timestamp: Date.now() };
    }

    const aes2Key = crypto.randomBytes(32);
    const aes2Iv = crypto.randomBytes(16);
    const xor3Key = crypto.randomBytes(32);
    const apiAuthToken = crypto.randomUUID();

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = this.deviceSessionsRepository.create({
      deviceId,
      apiAuthToken,
      aes2KeyB64: aes2Key.toString('base64'),
      aes2IvB64: aes2Iv.toString('base64'),
      xor3KeyB64: xor3Key.toString('base64'),
      expiresAt,
    });

    await this.deviceSessionsRepository.save(session);

    const fake = () => crypto.randomBytes(24).toString('base64');

    const indexed = [
      fake(),
      aes2Iv.toString('base64'),
      fake(),
      fake(),
      apiAuthToken,
      fake(),
      xor3Key.toString('base64'),
      fake(),
      aes2Key.toString('base64'),
      fake(),
      fake(),
    ];

    const encryptedData = this.cryptoService.encryptFirst({ values: indexed });

    return { ok: true, data: encryptedData, timestamp: Date.now() };
  }

  async requireSessionByToken(apiAuthToken: string): Promise<DeviceSession> {
    const session = await this.deviceSessionsRepository.findOne({
      where: { apiAuthToken },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired');
    }

    return session;
  }
}
