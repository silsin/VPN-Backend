-- Migration: Add isIranSide flag to v2ray_configs table
-- This column is used to identify Iran-side VPN configs for special handling

-- Step 1: Add the column with correct naming (camelCase as per TypeORM convention)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide'
  ) THEN
    ALTER TABLE v2ray_configs ADD COLUMN "isIranSide" BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Step 2: Create index for faster filtering of Iran-side configs
CREATE INDEX IF NOT EXISTS idx_v2ray_configs_iran_side ON v2ray_configs("isIranSide") WHERE "isIranSide" = true;
