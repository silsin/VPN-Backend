-- Add isIranSide flag to v2ray_configs for Iran-specific health checks
ALTER TABLE v2ray_configs ADD COLUMN is_iran_side BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for faster filtering of Iran-side configs
CREATE INDEX idx_v2ray_configs_is_iran_side ON v2ray_configs(is_iran_side);
