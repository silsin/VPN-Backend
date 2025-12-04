import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { SchedulerService } from './scheduler.service';
import { DialogProcessor } from './processors/dialog.processor';
import { FirebaseConfig } from '../../config/firebase.config';
import { DeviceLogin } from '../device-logins/entities/device-login.entity';
import { DialogDelivery } from '../dialogs/entities/dialog-delivery.entity';
import { DialogsModule } from '../dialogs/dialogs.module';
import { DIALOG_QUEUE } from './scheduler.service';
import { getBullConfig } from '../../config/queue.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceLogin, DialogDelivery]),
    BullModule.registerQueueAsync({
      name: DIALOG_QUEUE,
      useFactory: (configService: ConfigService) =>
        getBullConfig(configService),
      inject: [ConfigService],
    }),
    DialogsModule,
  ],
  providers: [
    FirebaseConfig,
    NotificationsService,
    SchedulerService,
    DialogProcessor,
  ],
  exports: [NotificationsService, SchedulerService],
})
export class NotificationsModule {}
