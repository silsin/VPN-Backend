# Why Migration 017 Failed - Technical Explanation

## The Problem

Your backend keeps crashing with:
```
ERROR [ExceptionsHandler] column V2RayConfig.isIranSide does not exist
```

This happens when the config-checker service tries to query V2RayConfig and select the `isIranSide` field, but the column doesn't exist in the database.

## Root Cause Analysis

### What TypeORM Expected

In `src/modules/v2ray-configs/entities/v2ray-config.entity.ts`:
```typescript
@Entity('v2ray_configs')
export class V2RayConfig {
  @Column({ type: 'boolean', default: false })
  isIranSide: boolean;  // ← Entity name is camelCase
}
```

When no `name` parameter is specified in `@Column()`, TypeORM uses the property name as-is in the database. So it expects a column named: **`"isIranSide"`** (with quotes because of camelCase).

### What the Migration Created

The original migration (017_add_is_iran_side_to_configs.sql) tried to create:
```sql
ALTER TABLE v2ray_configs ADD COLUMN is_iran_side BOOLEAN NOT NULL DEFAULT FALSE;
-- This creates a column named: is_iran_side (snake_case, unquoted)
```

### The Mismatch

```
TypeORM looking for:   "isIranSide"  (camelCase)
Database has:          is_iran_side  (snake_case)
                       ❌ NOT FOUND
```

It's like looking for "John Smith" but the database has "john_smith" - different format!

## Why Automatic Migration Didn't Catch This

The migration system in `DatabaseMigrationService` has a try-catch that logs errors but continues:

```typescript
try {
  await queryRunner.query(sql);  // ← Migration runs here
  // Insert into history if successful
} catch (err) {
  this.logger.error(`Failed to execute migration ${file}`);
  // ↑ It logs the error but doesn't stop the app
  throw err;  // ← Actually it DOES stop, but see below
}
```

**However**, the migration DID fail, but here's what happened:

1. Migration 017 runs at startup
2. Migration file had syntax error or column name mismatch
3. TypeORM threw an error
4. Migration was NOT recorded in `__migrations_history` table
5. Service continued starting anyway (or crashed silently)
6. Next time backend starts, it tries migration 017 again
7. But this time, some other part of the code tries to use `isIranSide`
8. Column doesn't exist → ERROR

## Timeline of What Happened

```
📅 Before migration 017 was added:
   - Backend working fine
   - V2RayConfig entity references isIranSide
   - But column doesn't exist in database yet
   - App crashes when trying to SELECT isIranSide

📅 Migration 017 is added:
   - Added to database/migrations/017_add_is_iran_side_to_configs.sql
   - Migration service tries to run it on startup

📅 Migration runs but fails:
   - Creates column with wrong name: is_iran_side (not isIranSide)
   - Or fails to create at all

📅 Service starts anyway:
   - Either crashes later when accessing the column
   - Or (if you fixed it) continues without the column

📅 Every startup:
   - Migration service tries again
   - Fails again (or already marked as executed)
   - App keeps crashing when config-checker tries to use isIranSide
```

## The Three Failures

From your logs, you see THREE different services crashing:

```
1. ExceptionsHandler
   └─ Generic request handling, tries to query V2RayConfig

2. Scheduler
   └─ Background job that checks configs periodically
   └─ Tries to access isIranSide

3. TelegramAdminBotService
   └─ Telegram bot command handler
   └─ Tries to use config-checker which accesses isIranSide
```

All three fail at the same point: accessing `isIranSide` column that doesn't exist.

## Why the Fix Works

The corrected migration file uses:

```sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide'
  ) THEN
    ALTER TABLE v2ray_configs ADD COLUMN "isIranSide" BOOLEAN NOT NULL DEFAULT FALSE;
    -- ↑ Column name matches TypeORM expectation: "isIranSide"
  END IF;
END $$;
```

**Key improvements**:
1. ✅ Creates column with correct name: `"isIranSide"` (quoted camelCase)
2. ✅ Uses `IF NOT EXISTS` so it doesn't fail if already exists
3. ✅ Uses `DO $$ BEGIN ... END $$` for safer execution
4. ✅ Won't crash if run multiple times

## How to Prevent This in Future

### For Developers

When creating migrations, ALWAYS check:

1. **Entity definition** - See what column name it expects
2. **Column naming** - Match the entity property name exactly
3. **Use IF NOT EXISTS** - Make migrations idempotent
4. **Test locally** - Run migration on test database first

Example:
```typescript
// Entity
@Column({ type: 'boolean' })
myNewField: boolean;  // ← Property name in camelCase

// Migration
ALTER TABLE my_table ADD COLUMN "myNewField" BOOLEAN ...;
-- ↑ MUST match: quoted camelCase
```

### For DevOps

1. **Backup before applying** - Always have rollback option
2. **Test on staging** - Never apply directly to production
3. **Monitor startup logs** - Check for migration errors
4. **Run fix script** - Use provided `fix_missing_column.sql`

## Database Column Naming Rules in TypeORM

```
TypeORM Entity              →  Database Column Name
────────────────────────────────────────────────────
@Column()
myField                     →  "myField" (camelCase, quoted)

@Column({ name: 'my_field' })
myField                     →  my_field (custom name)

@Column('text')
description                 →  "description" (type parameter)

Most common mistake:
@Column()
userName    ← camelCase     →  "userName" in DB (NOT user_name)
```

## SQL Injection Safe Migration

The migration uses PostgreSQL's `DO` block which is safe:

```sql
-- ❌ UNSAFE - Can fail
ALTER TABLE v2ray_configs ADD COLUMN is_iran_side BOOLEAN;

-- ✅ SAFE - Won't fail even if run twice
DO $$ BEGIN
  IF NOT EXISTS (...) THEN
    ALTER TABLE v2ray_configs ADD COLUMN "isIranSide" BOOLEAN;
  END IF;
END $$;
```

The `DO` block ensures:
- Transaction safety
- Conditional execution
- Better error handling
- Idempotent (can run multiple times safely)

## Summary

| Aspect | Was | Should Be |
|--------|-----|-----------|
| **Column Name** | `is_iran_side` | `"isIranSide"` |
| **TypeORM Lookup** | Failed | Success |
| **Error** | Column not found | No error |
| **Migration Idempotent** | No (fails on re-run) | Yes (IF NOT EXISTS) |
| **App Status** | Crashes | Runs normally |

---

**Status**: ✅ Fixed in migration 017 and fix_missing_column.sql
