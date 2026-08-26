import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DeviceLoginsModule } from './modules/device-logins/device-logins.module';
import { AdsModule } from './modules/ads/ads.module';
import { V2RayConfigsModule } from './modules/v2ray-configs/v2ray-configs.module';
import { DialogsModule } from './modules/dialogs/dialogs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SettingsModule } from './modules/settings/settings.module';
import { HandshakeModule } from './modules/handshake/handshake.module';
import { DatabaseMigrationModule } from './modules/database-migration/database-migration.module';
import { ConfigCheckerModule } from './modules/config-checker/config-checker.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { OpenVpnModule } from './modules/openvpn/openvpn.module';
import { WafMiddleware } from './common/middleware/waf.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    AuthModule,
    UsersModule,
    DeviceLoginsModule,
    AdsModule,
    V2RayConfigsModule,
    DialogsModule,
    NotificationsModule,
    SettingsModule,
    HandshakeModule,
    DatabaseMigrationModule,
    ConfigCheckerModule,
    SubscriptionsModule,
    OpenVpnModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WafMiddleware)
      .forRoutes('*');
  }
}

