-- Add trial fields to subscription_plans table
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS "hasFreeTrial" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "trialDays" INT;

-- Add trial fields to user_subscriptions table
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS "isTrialActive" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "trialEndDate" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "trialRedeemed" BOOLEAN DEFAULT false;

-- Create index for trial queries
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_trial ON user_subscriptions("isTrialActive", "trialEndDate");
CREATE INDEX IF NOT EXISTS idx_subscription_plans_trial ON subscription_plans("hasFreeTrial");
