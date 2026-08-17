-- Create subscription_history table
-- Audit trail of all subscription changes (upgrades, downgrades, renewals, cancellations)

CREATE TABLE IF NOT EXISTS subscription_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "planId" UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    "previousPlanId" UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- purchased, upgraded, downgraded, renewed, extended, cancelled, reactivated
    "startDate" TIMESTAMP NOT NULL,
    "expiryDate" TIMESTAMP NOT NULL,
    "oldExpiryDate" TIMESTAMP, -- Previous expiry date for extensions/renewals
    reason VARCHAR(255), -- Why this action occurred (user_request, admin_action, auto_renewal, etc.)
    notes TEXT, -- Additional notes about this action
    "createdByUserId" UUID REFERENCES users(id) ON DELETE SET NULL, -- Admin user if admin action
    "paymentId" UUID REFERENCES payments(id) ON DELETE SET NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for frequent queries
CREATE INDEX idx_subscription_history_user_id ON subscription_history("userId");
CREATE INDEX idx_subscription_history_created_at ON subscription_history("createdAt");
CREATE INDEX idx_subscription_history_action ON subscription_history(action);
CREATE INDEX idx_subscription_history_user_created ON subscription_history("userId", "createdAt" DESC);

-- Create view for user subscription timeline
CREATE VIEW user_subscription_timeline AS
SELECT 
    "userId",
    "createdAt",
    action,
    "planId",
    "startDate",
    "expiryDate",
    LAG("expiryDate") OVER (PARTITION BY "userId" ORDER BY "createdAt") as previous_expiry_date,
    (("expiryDate"::DATE - "startDate"::DATE)) as duration_days
FROM subscription_history
ORDER BY "userId", "createdAt" DESC;

-- Create view for subscription churn analysis
CREATE VIEW subscription_churn_analysis AS
SELECT 
    DATE_TRUNC('month', "createdAt")::DATE as month,
    COUNT(*) FILTER (WHERE action = 'purchased') as new_subscriptions,
    COUNT(*) FILTER (WHERE action = 'upgraded') as upgrades,
    COUNT(*) FILTER (WHERE action = 'downgraded') as downgrades,
    COUNT(*) FILTER (WHERE action = 'cancelled') as cancellations,
    COUNT(*) FILTER (WHERE action = 'renewed') as renewals,
    COUNT(DISTINCT CASE WHEN action = 'cancelled' THEN "userId" END) as churned_users
FROM subscription_history
GROUP BY DATE_TRUNC('month', "createdAt")
ORDER BY month DESC;

-- Add comment
COMMENT ON TABLE subscription_history IS 'Complete audit trail of subscription lifecycle events. Used for analytics, reporting, and dispute resolution.';
COMMENT ON COLUMN subscription_history.action IS 'Type of change: purchased (new), upgraded/downgraded (plan change), renewed/extended (date change), cancelled (user or admin), reactivated (from expired)';
COMMENT ON COLUMN subscription_history.reason IS 'Context for the action: user_request, admin_action, auto_renewal, payment_failed, admin_refund, etc.';
