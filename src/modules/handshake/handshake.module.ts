import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HandshakeController } from './handshake.controller';
import { HandshakeService } from './handshake.service';
import { HandshakeCryptoService } from './handshake-crypto.service';
import { DeviceSession } from './entities/device-session.entity';
import { Phase2AuthGuard } from './guards/phase2-auth.guard';
import { Phase2EncryptInterceptor } from './interceptors/phase2-encrypt.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceSession])],
  controllers: [HandshakeController],
  providers: [
    HandshakeService,
    HandshakeCryptoService,
    Phase2AuthGuard,
    Phase2EncryptInterceptor,
  ],
  exports: [
    HandshakeService,
    HandshakeCryptoService,
    Phase2AuthGuard,
    Phase2EncryptInterceptor,
  ],
})
export class HandshakeModule {}
