-- Modify users table to add subscription-related columns
-- This allows quick access to subscription info without joining

-- Add columns one by one to ensure they're created
ALTER TABLE users ADD COLUMN IF NOT EXISTS "subscriptionStatus" VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "currentPlanId" UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "subscriptionExpiryDate" TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "daysRemaining" INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "dataUsedThisMonth" BIGINT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "maxDataPerMonth" BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "maxConcurrentDevices" INT DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastSubscriptionCheckAt" TIMESTAMP;

-- Add foreign key constraint for currentPlanId (if table exists)
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS fk_users_current_plan 
  FOREIGN KEY ("currentPlanId") REFERENCES subscription_plans(id) ON DELETE SET NULL;

-- Create indexes for subscription-related queries
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users("subscriptionStatus");
CREATE INDEX IF NOT EXISTS idx_users_expiry_date ON users("subscriptionExpiryDate");
CREATE INDEX IF NOT EXISTS idx_users_data_used ON users("dataUsedThisMonth");
