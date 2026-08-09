-- Emergency Fix: Missing isIranSide column in v2ray_configs table
-- Run this script manually on the production database if the migration failed
-- 
-- HOW TO RUN:
-- psql -U your_user -d your_db -f fix_missing_column.sql
--
-- This fixes the error: "column V2RayConfig.isIranSide does not exist"

BEGIN;

-- Step 1: Check if old wrong column exists and remove it
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'v2ray_configs' AND column_name = 'is_iran_side'
  ) THEN
    ALTER TABLE v2ray_configs DROP COLUMN "is_iran_side" CASCADE;
    RAISE NOTICE 'Removed incorrect column is_iran_side';
  END IF;
END $$;

-- Step 2: Add the column with correct naming (camelCase - TypeORM default)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide'
  ) THEN
    ALTER TABLE v2ray_configs ADD COLUMN "isIranSide" BOOLEAN NOT NULL DEFAULT FALSE;
    RAISE NOTICE 'Column isIranSide added successfully';
  ELSE
    RAISE NOTICE 'Column isIranSide already exists - no changes needed';
  END IF;
END $$;

-- Step 3: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_v2ray_configs_iran_side 
ON v2ray_configs("isIranSide") WHERE "isIranSide" = true;

-- Step 4: Verify the column exists and has correct properties
\echo '=== Verification: Column isIranSide ==='
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide';

-- Step 5: Verify the index exists
\echo '=== Verification: Index ==='
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'v2ray_configs' AND indexname LIKE '%iran_side%';

-- Step 6: Mark migration as executed (so it doesn't run again)
INSERT INTO "__migrations_history" (name) 
VALUES ('017_add_is_iran_side_to_configs.sql')
ON CONFLICT (name) DO NOTHING;

-- Step 7: Verify migration history
\echo '=== Verification: Migration History ==='
SELECT name, executed_at 
FROM "__migrations_history" 
WHERE name = '017_add_is_iran_side_to_configs.sql';

COMMIT;

\echo '=== Fix Complete ==='
\echo 'The isIranSide column is now properly set up.'
\echo 'You can now restart the backend service.'
