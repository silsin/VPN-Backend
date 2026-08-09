-- Fix missing isIranSide column in v2ray_configs table
-- This script should be run manually if the migration failed

-- Step 1: Add the column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide'
  ) THEN
    ALTER TABLE v2ray_configs ADD COLUMN "isIranSide" BOOLEAN NOT NULL DEFAULT FALSE;
    RAISE NOTICE 'Column isIranSide added successfully';
  ELSE
    RAISE NOTICE 'Column isIranSide already exists';
  END IF;
END $$;

-- Step 2: Add the index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_v2ray_configs_is_iran_side ON v2ray_configs("isIranSide");

-- Step 3: Verify the column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide';

-- Step 4: Mark the migration as executed if it's not already
INSERT INTO "__migrations_history" (name) VALUES ('017_add_is_iran_side_to_configs.sql')
ON CONFLICT (name) DO NOTHING;

-- Verify
SELECT * FROM "__migrations_history" WHERE name = '017_add_is_iran_side_to_configs.sql';
