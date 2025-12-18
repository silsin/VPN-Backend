import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { HandshakeCryptoService } from '../handshake-crypto.service';
import { DeviceSession } from '../entities/device-session.entity';

@Injectable()
export class Phase2EncryptInterceptor implements NestInterceptor {
  constructor(private readonly cryptoService: HandshakeCryptoService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & any>();

    const session: DeviceSession | undefined = req.handshakeSession;
    if (!session) {
      return next.handle();
    }

    const aes2Key = Buffer.from(session.aes2KeyB64, 'base64');
    const aes2Iv = Buffer.from(session.aes2IvB64, 'base64');
    const xor3Key = Buffer.from(session.xor3KeyB64, 'base64');

    return next.handle().pipe(
      map((data) => {
        const timestamp = Date.now();
        const encrypted = this.cryptoService.encryptSecond(
          { ok: true, data, timestamp },
          aes2Key,
          aes2Iv,
          xor3Key,
        );
        return { ok: true, data: encrypted, timestamp };
      }),
    );
  }
}
