import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { V2RayConfig } from '../v2ray-configs/entities/v2ray-config.entity';
import { V2RayConfigsModule } from '../v2ray-configs/v2ray-configs.module';
import { DialogsModule } from '../dialogs/dialogs.module';
import { DeviceLoginsModule } from '../device-logins/device-logins.module';
import { UsersModule } from '../users/users.module';
import { AdsModule } from '../ads/ads.module';
import { ConfigCheckerService } from './config-checker.service';
import { ConfigCheckerController } from './config-checker.controller';
import { TelegramReportService } from './telegram-report.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([V2RayConfig]),
    V2RayConfigsModule,
    DialogsModule,
    DeviceLoginsModule,
    UsersModule,
    AdsModule,
  ],
  providers: [ConfigCheckerService, TelegramReportService, TelegramAdminBotService],
  controllers: [ConfigCheckerController],
  exports: [ConfigCheckerService, TelegramReportService, TelegramAdminBotService],
})
export class ConfigCheckerModule {}
