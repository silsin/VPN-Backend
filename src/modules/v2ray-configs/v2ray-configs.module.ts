import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { V2RayConfigsService } from './v2ray-configs.service';
import { V2RayConfigsController } from './v2ray-configs.controller';
import { V2RayConfig } from './entities/v2ray-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([V2RayConfig])],
  controllers: [V2RayConfigsController],
  providers: [V2RayConfigsService],
})
export class V2RayConfigsModule {}
