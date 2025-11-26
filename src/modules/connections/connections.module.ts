import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { Connection } from './entities/connection.entity';
import { UsersModule } from '../users/users.module';
import { VpnServersModule } from '../vpn-servers/vpn-servers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Connection]),
    UsersModule,
    VpnServersModule,
  ],
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}

