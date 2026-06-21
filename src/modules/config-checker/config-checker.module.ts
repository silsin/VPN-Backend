import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { V2RayConfig } from '../v2ray-configs/entities/v2ray-config.entity';
import { ConfigCheckerService } from './config-checker.service';
import { ConfigCheckerController } from './config-checker.controller';
import { TelegramReportService } from './telegram-report.service';

@Module({
  imports: [TypeOrmModule.forFeature([V2RayConfig])],
  providers: [ConfigCheckerService, TelegramReportService],
  controllers: [ConfigCheckerController],
  exports: [ConfigCheckerService, TelegramReportService],
})
export class ConfigCheckerModule {}
