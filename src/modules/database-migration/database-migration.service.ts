import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DatabaseMigrationService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseMigrationService.name);
  private readonly migrationsPath = path.join(process.cwd(), 'database', 'migrations');

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.runMigrations();
  }

  private async runMigrations() {
    this.logger.log('Starting automatic database migrations...');

    try {
      // 1. Ensure migrations tracking table exists
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS "__migrations_history" (
          "id" SERIAL PRIMARY KEY,
          "name" VARCHAR(255) NOT NULL UNIQUE,
          "executed_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Read migration files
      if (!fs.existsSync(this.migrationsPath)) {
        this.logger.warn(`Migrations directory not found at ${this.migrationsPath}`);
        return;
      }

      const files = fs.readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.sql'))
        .sort();

      this.logger.log(`Found ${files.length} migration files.`);

      // 3. Execute missing migrations
      for (const file of files) {
        const alreadyExecuted = await this.dataSource.query(
          'SELECT 1 FROM "__migrations_history" WHERE name = $1',
          [file]
        );

        if (alreadyExecuted.length === 0) {
          this.logger.log(`Executing migration: ${file}`);
          const sql = fs.readFileSync(path.join(this.migrationsPath, file), 'utf8');
          
          const queryRunner = this.dataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();

          try {
            await queryRunner.query(sql);
            await queryRunner.query(
              'INSERT INTO "__migrations_history" (name) VALUES ($1)',
              [file]
            );
            await queryRunner.commitTransaction();
            this.logger.log(`Successfully executed: ${file}`);
          } catch (err) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Failed to execute migration ${file}. Transaction rolled back.`);
            throw err; // Stop the whole process if a migration fails
          } finally {
            await queryRunner.release();
          }
        }
      }

      this.logger.log('Database migrations completed successfully.');
    } catch (error) {
      this.logger.error('Error during database migrations:', error.stack);
      // In a production app, you might want to exit the process here
      // if migrations are critical for startup.
    }
  }
}
