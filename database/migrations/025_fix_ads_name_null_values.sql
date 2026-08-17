-- Migration: Fix NULL values in ads.name column
-- This migration backfills NULL values in the ads table's name column

BEGIN;

-- Update any NULL name values to a default value
UPDATE ads 
SET name = CONCAT('Ad_', id)
WHERE name IS NULL;

-- Add a NOT NULL constraint if it doesn't exist
ALTER TABLE ads 
ALTER COLUMN name SET NOT NULL;

COMMIT;
