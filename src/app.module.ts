import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
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
    AuthModule,
    UsersModule,
    DeviceLoginsModule,
    AdsModule,
    V2RayConfigsModule,
    DialogsModule,
    NotificationsModule,
    SettingsModule,
    HandshakeModule,
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

