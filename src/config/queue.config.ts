import { BullModuleOptions } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';

export const getBullConfig = (
  configService: ConfigService,
): BullModuleOptions => ({
  redis: {
    host: configService.get<string>('REDIS_HOST', 'localhost'),
    port: parseInt(configService.get<string>('REDIS_PORT', '6379'), 10),
    password: configService.get<string>('REDIS_PASSWORD'),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 200, // Keep last 200 failed jobs
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 second delay
    },
  },
});
