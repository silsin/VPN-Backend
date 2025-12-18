import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceSession } from '../entities/device-session.entity';
import { HandshakeCryptoService } from '../handshake-crypto.service';

type Phase2Auth = {
  apiAuthToken: string;
  timestamp: number;
  nonce?: string;
};

@Injectable()
export class Phase2AuthGuard implements CanActivate {
  constructor(
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

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & any>();

    const xAuth = req.headers['x-auth'];
    if (!xAuth || typeof xAuth !== 'string') {
      throw new UnauthorizedException('Missing auth');
    }

    let auth: any;
    try {
      auth = this.cryptoService.decryptFirst(xAuth);
    } catch {
      throw new UnauthorizedException('Invalid auth');
    }

    const phase2Auth: Phase2Auth = {
      apiAuthToken: String(auth.apiAuthToken || auth.token || ''),
      timestamp: auth.timestamp,
      nonce: auth.nonce ? String(auth.nonce) : undefined,
    };

    if (!phase2Auth.apiAuthToken) {
      throw new UnauthorizedException('Invalid auth token');
    }

    this.validateTimestamp(phase2Auth.timestamp);

    const session = await this.deviceSessionsRepository.findOne({
      where: { apiAuthToken: phase2Auth.apiAuthToken },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired');
    }

    if (phase2Auth.nonce) {
      if (session.lastNonce && session.lastNonce === phase2Auth.nonce) {
        throw new UnauthorizedException('Replay detected');
      }
      session.lastNonce = phase2Auth.nonce;
      session.lastSeenAt = new Date();
      await this.deviceSessionsRepository.save(session);
    }

    if (!req.body || typeof req.body.payload !== 'string') {
      throw new BadRequestException('Missing payload');
    }

    const aes2Key = Buffer.from(session.aes2KeyB64, 'base64');
    const aes2Iv = Buffer.from(session.aes2IvB64, 'base64');
    const xor3Key = Buffer.from(session.xor3KeyB64, 'base64');

    let decodedBody: any;
    try {
      decodedBody = this.cryptoService.decryptSecond(
        req.body.payload,
        aes2Key,
        aes2Iv,
        xor3Key,
      );
    } catch {
      throw new BadRequestException('Invalid payload');
    }

    this.validateTimestamp(decodedBody.timestamp);

    if (decodedBody.nonce && session.lastBodyNonce && session.lastBodyNonce === String(decodedBody.nonce)) {
      throw new UnauthorizedException('Replay detected');
    }

    if (decodedBody.nonce) {
      session.lastBodyNonce = String(decodedBody.nonce);
      session.lastSeenAt = new Date();
      await this.deviceSessionsRepository.save(session);
    }

    req.handshakeSession = session;
    req.decodedBody = decodedBody;

    return true;
  }
}
