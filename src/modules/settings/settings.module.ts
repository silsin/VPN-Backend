import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { TimerService } from './timer.service';
import { TimerController } from './timer.controller';
import { Setting } from './entities/setting.entity';
import { TimerConfiguration } from './entities/timer-configuration.entity';
import { TimerEvent } from './entities/timer-event.entity';
import { TimerStatus } from './entities/timer-status.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Setting, TimerConfiguration, TimerEvent, TimerStatus])],
  controllers: [SettingsController, TimerController],
  providers: [SettingsService, TimerService],
  exports: [SettingsService, TimerService],
})
export class SettingsModule {}
