import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { V2RayConfigsService } from './v2ray-configs.service';
import { V2RayConfigsController } from './v2ray-configs.controller';
import { V2RayConfig } from './entities/v2ray-config.entity';
import { HandshakeModule } from '../handshake/handshake.module';
import { V2RayConfController } from './v2ray-conf.controller';
import { DeviceSession } from '../handshake/entities/device-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([V2RayConfig, DeviceSession]), HandshakeModule],
  controllers: [V2RayConfigsController, V2RayConfController],
  providers: [V2RayConfigsService],
})
export class V2RayConfigsModule {}
