# Migration Troubleshooting Guide

## Problem

Error in logs:
```
ERROR [ExceptionsHandler] column V2RayConfig.isIranSide does not exist
QueryFailedError: column V2RayConfig.isIranSide does not exist
```

This happens because migration `017_add_is_iran_side_to_configs.sql` failed to run properly.

## Why It Happens

There are two common reasons:

### Reason 1: Column Name Mismatch
- TypeORM entity defines: `isIranSide` (camelCase, stored as `"isIranSide"` in database)
- Old migration tried to create: `is_iran_side` (snake_case)
- Result: Column name mismatch, TypeORM can't find the column

### Reason 2: Migration Never Ran
- The migration was added but the service wasn't initialized properly
- Or the migration failed silently and wasn't retried

## How to Fix

### Option 1: Quick Fix (Recommended for Production)

**Step 1**: Connect to your production database and run the fix script:

```bash
psql -U your_postgres_user -d your_database_name -f database/fix_missing_column.sql
```

**What this does**:
- ✅ Removes any incorrectly named columns
- ✅ Creates the column with correct name: `"isIranSide"`
- ✅ Creates the index for performance
- ✅ Marks the migration as executed
- ✅ Verifies everything worked

### Option 2: Manual Fix (If you prefer step-by-step)

Connect to your database:
```bash
psql -U your_postgres_user -d your_database_name
```

Run these commands one by one:

```sql
-- Check if wrong column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'v2ray_configs' AND column_name IN ('is_iran_side', 'isIranSide');

-- If you see 'is_iran_side', remove it:
ALTER TABLE v2ray_configs DROP COLUMN "is_iran_side" CASCADE;

-- Add the correct column
ALTER TABLE v2ray_configs ADD COLUMN "isIranSide" BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index
CREATE INDEX idx_v2ray_configs_iran_side ON v2ray_configs("isIranSide") WHERE "isIranSide" = true;

-- Mark migration as executed
INSERT INTO "__migrations_history" (name) VALUES ('017_add_is_iran_side_to_configs.sql')
ON CONFLICT (name) DO NOTHING;

-- Verify it worked
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide';
```

### Option 3: Fresh Database (Development Only)

If you're on a development database and can rebuild it:

```bash
# 1. Drop the database
psql -U postgres -c "DROP DATABASE your_db_name;"

# 2. Create new database
psql -U postgres -c "CREATE DATABASE your_db_name;"

# 3. Rebuild it from schema
psql -U postgres -d your_db_name -f database/schema.sql

# 4. Restart backend (migrations will run automatically)
npm run start:dev
```

## Verification After Fix

### Check 1: Column Exists

```bash
psql -U your_user -d your_db -c "
  SELECT column_name, data_type, is_nullable 
  FROM information_schema.columns 
  WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide';
"
```

Expected output:
```
 column_name | data_type | is_nullable
─────────────┼───────────┼─────────────
 isIranSide  | boolean   | f
```

### Check 2: Migration Marked as Executed

```bash
psql -U your_user -d your_db -c "
  SELECT name, executed_at 
  FROM __migrations_history 
  WHERE name = '017_add_is_iran_side_to_configs.sql';
"
```

Expected output:
```
                name                 |         executed_at
──────────────────────────────────────┼─────────────────────────────────
 017_add_is_iran_side_to_configs.sql  | 2026-08-09 05:48:00.123456+00
```

### Check 3: Index Exists

```bash
psql -U your_user -d your_db -c "
  SELECT indexname 
  FROM pg_indexes 
  WHERE tablename = 'v2ray_configs' AND indexname LIKE '%iran_side%';
"
```

Expected output:
```
          indexname
──────────────────────────────────
 idx_v2ray_configs_iran_side
```

### Check 4: Query Works

```bash
psql -U your_user -d your_db -c "
  SELECT id, name, 'isIranSide' as col, \"isIranSide\" as value 
  FROM v2ray_configs 
  LIMIT 1;
"
```

Should return results without errors.

## Restart Backend

After running the fix:

```bash
# Stop the current process
pm2 stop vpn-backend

# Clear the logs (optional)
pm2 flush vpn-backend

# Start again
pm2 start vpn-backend

# Watch the logs
pm2 logs vpn-backend
```

You should see:
```
[Nest] Starting NestApplication...
[DatabaseMigrationService] Starting automatic database migrations...
[DatabaseMigrationService] Found N migration files.
[DatabaseMigrationService] Database migrations completed successfully.
[Nest] Application started on port 3000
```

## Why Automatic Migration Sometimes Fails

The `DatabaseMigrationService` runs on module init, but can fail if:

1. **Database connection not ready** - Timing issue with TypeORM initialization
2. **Syntax error in migration file** - The SQL is invalid
3. **Previous transaction not committed** - Database lock
4. **Missing permissions** - User doesn't have ALTER TABLE permission
5. **Column already partially created** - Previous failed migration left the table in bad state

## How the Migration System Works

```
When backend starts:
  ↓
TypeOrmModule initializes
  ↓
DatabaseMigrationModule loads
  ↓
DatabaseMigrationService.onModuleInit() runs
  ↓
Checks __migrations_history table
  ↓
For each .sql file in database/migrations/:
  ↓
  ├─ If NOT in history: Execute the SQL
  ├─ If succeeds: Insert into history
  └─ If fails: Log error, continue (or stop if critical)
  ↓
Backend continues starting
```

## Preventing Future Migration Issues

### 1. Use Idempotent Migrations

Always use `IF NOT EXISTS` or `DO $$ BEGIN ... END $$` blocks:

```sql
-- Good: Won't fail if column exists
ALTER TABLE v2ray_configs ADD COLUMN "isIranSide" BOOLEAN NOT NULL DEFAULT FALSE;
-- BAD ❌

-- Good: Idempotent
DO $$ BEGIN
  IF NOT EXISTS (...) THEN
    ALTER TABLE ...
  END IF;
END $$;
-- GOOD ✅
```

### 2. Test Migrations Locally First

```bash
# Create test database
createdb test_vpn

# Run migrations manually
psql -U postgres -d test_vpn -f database/schema.sql
for file in database/migrations/*.sql; do
  echo "Running $file..."
  psql -U postgres -d test_vpn -f "$file" || echo "FAILED: $file"
done

# Verify it worked
psql -U postgres -d test_vpn -c "SELECT * FROM information_schema.tables WHERE table_name = 'v2ray_configs';"

# Clean up
dropdb test_vpn
```

### 3. Always Backup Before Applying

```bash
# Backup production database
pg_dump -U your_user -d your_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Then apply fixes
```

## Emergency Rollback

If something goes wrong after applying the fix:

```bash
# Restore from backup
psql -U your_user -d your_db < backup_20260809_054000.sql

# Or manually remove the column
psql -U your_user -d your_db -c "ALTER TABLE v2ray_configs DROP COLUMN \"isIranSide\" CASCADE;"
```

## Contact Support

If the fix doesn't work:

1. **Run the verification checks above** and provide output
2. **Share the backend logs** (last 30 lines)
3. **Share database info** (PostgreSQL version, database name)
4. **Try Option 3** (fresh database on development) to verify it's not data corruption

---

## Files Involved

```
database/
  ├─ migrations/
  │   └─ 017_add_is_iran_side_to_configs.sql    ← Updated with correct syntax
  └─ fix_missing_column.sql                     ← Emergency fix script

src/modules/
  ├─ database-migration/
  │   ├─ database-migration.module.ts           ← Runs on startup
  │   └─ database-migration.service.ts          ← Executes migrations
  └─ v2ray-configs/
      └─ entities/v2ray-config.entity.ts        ← Defines isIranSide column
```

## Status

- **Migration file**: ✅ Fixed (proper column naming and syntax)
- **Fix script**: ✅ Ready to run
- **Documentation**: ✅ Complete

Next step: Run the fix script on your production database!
