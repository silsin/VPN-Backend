-- Add pause fields to user_subscriptions table
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "pausedReason" VARCHAR(500);
