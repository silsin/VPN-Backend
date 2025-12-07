import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { DialogsService } from './dialogs.service';
import { DialogsController } from './dialogs.controller';
import { MobileDialogsController } from './mobile-dialogs.controller';
import { Dialog } from './entities/dialog.entity';
import { DialogDelivery } from './entities/dialog-delivery.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { DIALOG_QUEUE } from '../notifications/scheduler.service';
import { getBullConfig } from '../../config/queue.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dialog, DialogDelivery]),
    BullModule.registerQueueAsync({
      name: DIALOG_QUEUE,
      useFactory: (configService: ConfigService) =>
        getBullConfig(configService),
      inject: [ConfigService],
    }),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [DialogsController, MobileDialogsController],
  providers: [DialogsService],
  exports: [DialogsService],
})
export class DialogsModule {}
