-- Add pause fields to user_subscriptions table
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS paused_reason VARCHAR(500);

-- Update status enum to include PAUSED if it doesn't exist
-- Note: PostgreSQL enums can't be altered directly, but TypeORM will handle this
-- The enum should be: 'active', 'expired', 'cancelled', 'suspended', 'paused', 'pending'
