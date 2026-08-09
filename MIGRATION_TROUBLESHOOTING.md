# Migration Troubleshooting Guide

## Problem

The automatic migration for `isIranSide` column failed, leaving the column missing from the database.

```
ERROR [ExceptionsHandler] column V2RayConfig.isIranSide does not exist
```

## Root Cause

The migration file had a column name mismatch:
- **Entity**: Uses `isIranSide` (camelCase)
- **Migration**: Was trying to add `is_iran_side` (snake_case)

TypeORM expects the column to be named `isIranSide` in the database, not `is_iran_side`.

## How Automatic Migrations Work

### 1. Migration System Overview

```
App Startup
    ↓
app.module.ts imports DatabaseMigrationModule
    ↓
DatabaseMigrationModule provides DatabaseMigrationService
    ↓
DatabaseMigrationService implements OnModuleInit
    ↓
OnModuleInit hook triggers → runMigrations() called
    ↓
Check __migrations_history table
    ↓
For each .sql file in database/migrations/
    ├─ If already in history → Skip
    └─ If NOT in history → Execute and record
```

### 2. Migration History Tracking

The system maintains a `__migrations_history` table:

```sql
CREATE TABLE __migrations_history (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Important**: Once a migration name is in this table, it won't run again (even if it failed).

### 3. Why It Didn't Retry

The migration 017 failed but was still recorded in `__migrations_history`, so on next startup it was skipped.

## Solution 1: Fix via Backend Restart (Automatic)

### Step 1: Fix the Migration File ✅ (Already Done)

The file `database/migrations/017_add_is_iran_side_to_configs.sql` has been fixed to use the correct column name and include IF NOT EXISTS checks.

### Step 2: Reset Migration History in Database

Connect to your PostgreSQL database and run:

```sql
-- Option A: Delete just the failed migration (allows retry)
DELETE FROM "__migrations_history" 
WHERE name = '017_add_is_iran_side_to_configs.sql';

-- Verify
SELECT * FROM "__migrations_history" 
WHERE name LIKE '017%';
```

### Step 3: Restart Backend

```bash
# Stop the backend
pm2 stop vpn-backend

# Wait 2 seconds
sleep 2

# Start the backend
pm2 start vpn-backend

# Watch logs
pm2 logs vpn-backend
```

**Expected Log Output**:
```
[Nest] ... - ... LOG [DatabaseMigrationService] Starting automatic database migrations...
[Nest] ... - ... LOG [DatabaseMigrationService] Found 18 migration files.
[Nest] ... - ... LOG [DatabaseMigrationService] Executing migration: 017_add_is_iran_side_to_configs.sql
[Nest] ... - ... LOG [DatabaseMigrationService] Successfully executed: 017_add_is_iran_side_to_configs.sql
[Nest] ... - ... LOG [DatabaseMigrationService] Database migrations completed successfully.
```

---

## Solution 2: Fix Manually via SQL (If Automatic Fails)

If the backend doesn't apply the migration automatically, run this:

```bash
psql -U your_postgres_user -d your_database_name < database/fix_missing_column.sql
```

Or connect to the database directly:

```bash
psql -U postgres
\c your_database_name

-- Then paste the contents of database/fix_missing_column.sql
```

The fix script does:
1. Checks if column exists
2. Adds column if missing
3. Creates index
4. Marks migration as complete

---

## Solution 3: Full Database Reset (Nuclear Option)

Only if the above doesn't work:

```sql
-- Step 1: Check if column exists
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide';

-- Step 2: Add if missing
ALTER TABLE v2ray_configs 
ADD COLUMN "isIranSide" BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 3: Create index
CREATE INDEX IF NOT EXISTS idx_v2ray_configs_is_iran_side 
ON v2ray_configs("isIranSide");

-- Step 4: Clear migration history and let it re-run
DELETE FROM "__migrations_history" 
WHERE name = '017_add_is_iran_side_to_configs.sql';

-- Step 5: Verify
SELECT * FROM "__migrations_history" ORDER BY executed_at DESC LIMIT 5;
```

---

## Verification Steps

After applying the fix, verify the column exists:

```bash
# Connect to database
psql -U postgres -d your_database_name

# Check if column exists and has correct type
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide';

# Should output:
# column_name  | data_type | is_nullable | column_default
# isIranSide   | boolean   | NO          | false
```

Check the migration was recorded:

```sql
SELECT name, executed_at 
FROM "__migrations_history" 
WHERE name = '017_add_is_iran_side_to_configs.sql';
```

Test that the backend can query v2ray configs:

```bash
curl http://localhost:3000/v2ray-configs

# Should return 200 with list of configs
```

---

## Why Migrations Should Run Automatically

### Architecture

```typescript
@Injectable()
export class DatabaseMigrationService implements OnModuleInit {
  async onModuleInit() {
    await this.runMigrations();  // ← Runs on app startup
  }

  private async runMigrations() {
    // 1. Create tracking table if doesn't exist
    // 2. Read .sql files from database/migrations/
    // 3. For each file:
    //    - Check if already in history
    //    - If new: Execute SQL + record in history
    //    - If already executed: Skip
  }
}
```

### Startup Order

```
1. TypeOrmModule initializes
   ↓
2. DatabaseMigrationModule initializes
   ↓
3. DatabaseMigrationService.onModuleInit() called
   ↓
4. Migrations execute automatically
   ↓
5. Rest of app starts
```

This happens **automatically** every time you start the backend.

### What Should Be In Logs

On every startup, you should see:

```
[Nest] 2304730 - 08/09/2026, 5:39:00 AM   LOG [DatabaseMigrationService] Starting automatic database migrations...
[Nest] 2304730 - 08/09/2026, 5:39:00 AM   LOG [DatabaseMigrationService] Found 18 migration files.
[Nest] 2304730 - 08/09/2026, 5:39:00 AM   LOG [DatabaseMigrationService] Successfully executed: 017_add_is_iran_side_to_configs.sql
[Nest] 2304730 - 08/09/2026, 5:39:01 AM   LOG [DatabaseMigrationService] Database migrations completed successfully.
```

If you see "Successfully executed" for 017, the column is now in the database.

---

## Prevention: Making Migrations Idempotent

All future migrations should use `DO $$ IF NOT EXISTS $$` pattern:

**Bad (fails if column already exists)**:
```sql
ALTER TABLE table_name ADD COLUMN column_name TYPE;
```

**Good (safe to run multiple times)**:
```sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'table_name' AND column_name = 'column_name'
  ) THEN
    ALTER TABLE table_name ADD COLUMN column_name TYPE;
  END IF;
END $$;
```

The fixed migration 017 now uses this pattern.

---

## Quick Fix Steps Summary

### If Backend Is Running:

```bash
# 1. SSH to server
ssh user@your-server

# 2. Connect to database and reset migration history
psql -U postgres -d your_db -c \
  "DELETE FROM \"__migrations_history\" WHERE name = '017_add_is_iran_side_to_configs.sql';"

# 3. Restart backend
pm2 restart vpn-backend

# 4. Check logs
pm2 logs vpn-backend | grep "017\|Successfully"
```

### If Backend Is Down:

```bash
# 1. Connect directly to database
psql -U postgres -d your_db

# 2. Run fix script
\i database/fix_missing_column.sql

# 3. Exit and start backend
exit
pm2 start vpn-backend
```

---

## Expected Result

After applying the fix:

1. ✅ Column `isIranSide` exists in `v2ray_configs` table
2. ✅ Index `idx_v2ray_configs_is_iran_side` exists
3. ✅ Migration 017 is marked as complete in `__migrations_history`
4. ✅ No more "column does not exist" errors
5. ✅ Backend starts without errors
6. ✅ All V2RayConfig queries work normally

---

## Migration Best Practices Going Forward

1. **Always use IF NOT EXISTS** in DDL statements
2. **Test migrations** on staging before production
3. **Never delete migrations** - only add new ones
4. **Use transactions** - migrations auto-roll back on error
5. **Monitor logs** on startup to verify migrations ran
6. **Keep migration history** - don't clear `__migrations_history` without reason

---

## Files Involved

- `src/modules/database-migration/database-migration.service.ts` - The runner
- `src/modules/database-migration/database-migration.module.ts` - The module
- `src/app.module.ts` - Imports the module
- `database/migrations/017_add_is_iran_side_to_configs.sql` - The fixed migration
- `database/fix_missing_column.sql` - Manual fix script
