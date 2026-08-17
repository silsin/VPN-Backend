-- Modify users table to add subscription-related columns
-- This allows quick access to subscription info without joining

ALTER TABLE users
ADD COLUMN IF NOT EXISTS "subscriptionStatus" VARCHAR(50) DEFAULT 'free',
ADD COLUMN IF NOT EXISTS "currentPlanId" UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "subscriptionExpiryDate" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "daysRemaining" INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS "dataUsedThisMonth" BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS "maxDataPerMonth" BIGINT, -- NULL for unlimited
ADD COLUMN IF NOT EXISTS "maxConcurrentDevices" INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS "lastSubscriptionCheckAt" TIMESTAMP; -- When subscription status was last verified

-- Create indexes for subscription-related queries
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users("subscriptionStatus");
CREATE INDEX IF NOT EXISTS idx_users_expiry_date ON users("subscriptionExpiryDate");
CREATE INDEX IF NOT EXISTS idx_users_data_used ON users("dataUsedThisMonth");

-- Create view for user subscription summary
CREATE VIEW user_subscription_summary AS
SELECT 
    u.id,
    u.email,
    u.username,
    u."subscriptionStatus",
    sp.name as plan_name,
    u."subscriptionExpiryDate",
    CASE 
        WHEN u."subscriptionExpiryDate" IS NULL THEN NULL
        ELSE CEIL(EXTRACT(DAY FROM (u."subscriptionExpiryDate" - CURRENT_TIMESTAMP)))
    END as days_remaining,
    u."dataUsedThisMonth",
    u."maxDataPerMonth",
    CASE 
        WHEN u."maxDataPerMonth" IS NULL THEN NULL
        ELSE ROUND((u."dataUsedThisMonth"::FLOAT / u."maxDataPerMonth" * 100)::NUMERIC, 2)
    END as data_usage_percent,
    u."maxConcurrentDevices",
    CASE 
        WHEN u."subscriptionExpiryDate" IS NOT NULL 
             AND u."subscriptionExpiryDate" < CURRENT_TIMESTAMP 
        THEN 'expired'
        WHEN u."subscriptionStatus" = 'active' THEN 'active'
        ELSE 'inactive'
    END as effective_status,
    u."lastLoginAt",
    u."createdAt"
FROM users u
LEFT JOIN subscription_plans sp ON u."currentPlanId" = sp.id;

-- Create view for subscription expiration alerts (admin dashboard)
CREATE VIEW subscription_expiration_alerts AS
SELECT 
    u.id,
    u.email,
    u.username,
    sp.name as plan_name,
    u."subscriptionExpiryDate",
    CEIL(EXTRACT(DAY FROM (u."subscriptionExpiryDate" - CURRENT_TIMESTAMP))) as days_until_expiry,
    CASE 
        WHEN CEIL(EXTRACT(DAY FROM (u."subscriptionExpiryDate" - CURRENT_TIMESTAMP))) <= 1 THEN 'critical'
        WHEN CEIL(EXTRACT(DAY FROM (u."subscriptionExpiryDate" - CURRENT_TIMESTAMP))) <= 7 THEN 'warning'
        WHEN CEIL(EXTRACT(DAY FROM (u."subscriptionExpiryDate" - CURRENT_TIMESTAMP))) <= 30 THEN 'info'
        ELSE 'ok'
    END as alert_level,
    us."isAutoRenewal"
FROM users u
LEFT JOIN subscription_plans sp ON u."currentPlanId" = sp.id
LEFT JOIN user_subscriptions us ON u.id = us."userId"
WHERE u."subscriptionExpiryDate" IS NOT NULL
  AND u."subscriptionExpiryDate" < CURRENT_TIMESTAMP + INTERVAL '30 days'
ORDER BY u."subscriptionExpiryDate" ASC;

-- Function to update user subscription cache (call after any subscription change)
CREATE OR REPLACE FUNCTION refresh_user_subscription_cache(user_id UUID)
RETURNS void AS $$
DECLARE
    v_plan subscription_plans%ROWTYPE;
    v_sub user_subscriptions%ROWTYPE;
    v_usage usage_tracking%ROWTYPE;
BEGIN
    -- Get current subscription
    SELECT * INTO v_sub FROM user_subscriptions WHERE "userId" = user_id LIMIT 1;
    
    IF v_sub.id IS NOT NULL THEN
        -- Get plan details
        SELECT * INTO v_plan FROM subscription_plans WHERE id = v_sub."planId";
        
        -- Get current usage cycle
        SELECT * INTO v_usage FROM usage_tracking 
        WHERE "userId" = user_id 
          AND "cycleEndDate" > CURRENT_TIMESTAMP
        ORDER BY "cycleStartDate" DESC LIMIT 1;
        
        -- Update user cache columns
        UPDATE users
        SET 
            "subscriptionStatus" = v_sub.status,
            "currentPlanId" = v_sub."planId",
            "subscriptionExpiryDate" = v_sub."expiryDate",
            "daysRemaining" = CASE 
                WHEN v_sub."expiryDate" < CURRENT_TIMESTAMP THEN 0
                ELSE CEIL(EXTRACT(DAY FROM (v_sub."expiryDate" - CURRENT_TIMESTAMP)))
            END,
            "dataUsedThisMonth" = COALESCE(v_usage."dataUsedBytes", 0),
            "maxDataPerMonth" = CASE 
                WHEN v_plan.data_limit_gb IS NULL THEN NULL
                ELSE v_plan.data_limit_gb * 1024 * 1024 * 1024
            END,
            "maxConcurrentDevices" = v_plan.max_devices,
            "lastSubscriptionCheckAt" = CURRENT_TIMESTAMP
        WHERE id = user_id;
    ELSE
        -- User has no subscription, default to free plan
        UPDATE users
        SET 
            "subscriptionStatus" = 'free',
            "currentPlanId" = (SELECT id FROM subscription_plans WHERE name = 'Free'),
            "subscriptionExpiryDate" = NULL,
            "daysRemaining" = 0,
            "maxDataPerMonth" = 500 * 1024 * 1024 * 1024, -- 500GB for free
            "maxConcurrentDevices" = 1,
            "lastSubscriptionCheckAt" = CURRENT_TIMESTAMP
        WHERE id = user_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON TABLE users IS 'Extended with subscription denormalized columns for performance. Run refresh_user_subscription_cache() after subscription changes.';
