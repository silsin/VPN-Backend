-- IMMEDIATE FIX: Run this directly on the database to fix NULL values in ads.name

-- Step 1: Backfill all NULL name values
UPDATE ads 
SET name = 'Ad_' || id::text
WHERE name IS NULL;

-- Step 2: Verify the fix worked
SELECT COUNT(*) as null_count FROM ads WHERE name IS NULL;
