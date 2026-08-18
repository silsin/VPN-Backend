-- Add trial fields to subscription_plans table
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS has_free_trial BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS trial_days INT;

-- Add trial fields to user_subscriptions table
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS is_trial_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS trial_redeemed BOOLEAN DEFAULT false;

-- Create index for trial queries
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_trial ON user_subscriptions(is_trial_active, trial_end_date);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_trial ON subscription_plans(has_free_trial);
