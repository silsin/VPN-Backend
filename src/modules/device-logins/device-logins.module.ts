import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceLoginsService } from './device-logins.service';
import { DeviceLoginsController } from './device-logins.controller';
import { DeviceLogin } from './entities/device-login.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceLogin])],
  controllers: [DeviceLoginsController],
  providers: [DeviceLoginsService],
  exports: [DeviceLoginsService],
})
export class DeviceLoginsModule {}
