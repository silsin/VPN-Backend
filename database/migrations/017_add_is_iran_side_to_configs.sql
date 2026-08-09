-- Add isIranSide flag to v2ray_configs for Iran-specific health checks
-- Check if column already exists before adding
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'v2ray_configs' AND column_name = 'isIranSide'
  ) THEN
    ALTER TABLE v2ray_configs ADD COLUMN "isIranSide" BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Create index for faster filtering of Iran-side configs (if not exists)
CREATE INDEX IF NOT EXISTS idx_v2ray_configs_is_iran_side ON v2ray_configs("isIranSide");
