import { Module } from '@nestjs/common';
import { DatabaseMigrationService } from './database-migration.service';

@Module({
  providers: [DatabaseMigrationService],
})
export class DatabaseMigrationModule {}
