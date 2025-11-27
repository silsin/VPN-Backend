import { Injectable } from '@nestjs/common';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.configService.get<string>('DB_HOST', '195.181.173.71'),
      port: parseInt(this.configService.get<string>('DB_PORT', '5432'), 10),
      username: this.configService.get<string>('DB_USERNAME', 'myuser2347'),
      password: this.configService.get<string>('DB_PASSWORD', 'gfx234789!!!@@@###'),
      database: this.configService.get<string>('DB_NAME', 'flyvpn'),
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: false, // Disabled - using manual SQL migrations
      logging: this.configService.get<string>('NODE_ENV') === 'development',
      ssl: this.configService.get<string>('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
    };
  }
}

