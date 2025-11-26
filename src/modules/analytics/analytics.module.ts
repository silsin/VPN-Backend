import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { User } from '../users/entities/user.entity';
import { Connection } from '../connections/entities/connection.entity';
import { VpnServer } from '../vpn-servers/entities/vpn-server.entity';
import { AdImpression } from '../ads/entities/ad-impression.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Connection, VpnServer, AdImpression])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

