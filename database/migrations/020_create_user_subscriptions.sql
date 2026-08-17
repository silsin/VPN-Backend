-- Create user_subscriptions table
-- Tracks what subscription each user currently has and its status

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    "planId" UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, expired, cancelled, suspended, pending
    "startDate" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP NOT NULL,
    "renewalDate" TIMESTAMP, -- When next auto-renewal will happen
    "cancelledAt" TIMESTAMP,
    "cancelledReason" VARCHAR(255),
    "isAutoRenewal" BOOLEAN NOT NULL DEFAULT false,
    "failedRenewalAttempts" INT DEFAULT 0,
    "lastRenewalAttemptAt" TIMESTAMP,
    "metadata" JSONB DEFAULT '{}', -- Store additional info like promo codes used, etc.
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for frequent queries
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions("userId");
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_expiry ON user_subscriptions("expiryDate");
CREATE INDEX idx_user_subscriptions_renewal ON user_subscriptions("renewalDate");
CREATE INDEX idx_user_subscriptions_active ON user_subscriptions(status) WHERE status = 'active';

-- Add trigger for updatedAt
CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE user_subscriptions IS 'Current subscription for each user. One-to-one relationship with users table.';
COMMENT ON COLUMN user_subscriptions.status IS 'active: subscription is valid; expired: past expiryDate; cancelled: user cancelled; suspended: admin action; pending: payment processing';
COMMENT ON COLUMN user_subscriptions."isAutoRenewal" IS 'If true, subscription auto-renews on expiryDate if payment succeeds';
COMMENT ON COLUMN user_subscriptions."failedRenewalAttempts" IS 'Tracks retry count for failed auto-renewal attempts';
