import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VpnServersService } from './vpn-servers.service';
import { VpnServersController } from './vpn-servers.controller';
import { VpnServer } from './entities/vpn-server.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VpnServer])],
  controllers: [VpnServersController],
  providers: [VpnServersService],
  exports: [VpnServersService],
})
export class VpnServersModule {}

