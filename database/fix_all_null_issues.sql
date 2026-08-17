-- COMPREHENSIVE FIX: Fix all NULL values across all tables

BEGIN;

-- Fix ads table
UPDATE ads 
SET 
  name = COALESCE(name, 'Ad_' || id::text),
  "adUnitId" = COALESCE("adUnitId", 'unit_' || id::text)
WHERE name IS NULL OR "adUnitId" IS NULL;

-- Fix ad_settings table
UPDATE ad_settings 
SET 
  key = COALESCE(key, 'setting_' || gen_random_uuid()::text),
  value = COALESCE(value, 'default')
WHERE key IS NULL OR value IS NULL;

-- Fix ad_failure_reports table if it has NULL issues
UPDATE ad_failure_reports 
SET reason = COALESCE(reason, 'unknown')
WHERE reason IS NULL;

-- Check for any other NULL values
SELECT 'ads' as table_name, COUNT(CASE WHEN name IS NULL THEN 1 END) as null_names, COUNT(CASE WHEN "adUnitId" IS NULL THEN 1 END) as null_unitids FROM ads
UNION ALL
SELECT 'ad_settings', COUNT(CASE WHEN key IS NULL THEN 1 END), COUNT(CASE WHEN value IS NULL THEN 1 END) FROM ad_settings
UNION ALL
SELECT 'ad_failure_reports', COUNT(CASE WHEN reason IS NULL THEN 1 END), 0 FROM ad_failure_reports;

COMMIT;
