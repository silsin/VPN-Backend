-- Add googlePlayPurchaseTokenHash column to payments table
-- Used for replay attack prevention in Google Play purchases

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS "googlePlayPurchaseTokenHash" VARCHAR(64);

-- Add unique index for Google Play token hash to prevent replay attacks
-- Only index rows where googlePlayPurchaseTokenHash is not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_google_play_token_hash
ON payments("googlePlayPurchaseTokenHash")
WHERE "googlePlayPurchaseTokenHash" IS NOT NULL;

-- Add index on userId and googlePlayPurchaseTokenHash for quick lookup
CREATE INDEX IF NOT EXISTS idx_payments_user_google_play_token
ON payments("userId", "googlePlayPurchaseTokenHash")
WHERE "googlePlayPurchaseTokenHash" IS NOT NULL;
