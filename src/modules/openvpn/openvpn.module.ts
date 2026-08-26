import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenVpnServer } from './entities/openvpn-server.entity';
import { OpenVpnService } from './services/openvpn.service';
import { OpenVpnController } from './controllers/openvpn.controller';
import { OpenVpnTelegramService } from './telegram/openvpn-telegram.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenVpnServer]),
    SubscriptionsModule,
  ],
  providers: [OpenVpnService, OpenVpnTelegramService],
  controllers: [OpenVpnController],
  exports: [OpenVpnService, OpenVpnTelegramService],
})
export class OpenVpnModule {}
