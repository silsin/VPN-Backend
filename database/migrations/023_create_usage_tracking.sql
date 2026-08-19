-- Create usage_tracking table
-- Tracks data consumption per billing cycle for usage limits enforcement

CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "cycleStartDate" TIMESTAMP NOT NULL,
    "cycleEndDate" TIMESTAMP NOT NULL,
    "dataUsedBytes" BIGINT NOT NULL DEFAULT 0, -- Total bytes used in this cycle
    "dataLimitBytes" BIGINT, -- NULL for unlimited, otherwise bytes allowed this cycle
    "devicesUsed" INT DEFAULT 0, -- Number of unique devices used this cycle
    "maxDevices" INT, -- Max concurrent devices allowed
    "isLimitExceeded" BOOLEAN NOT NULL DEFAULT false,
    "warningsSent" INT DEFAULT 0, -- How many warning notifications sent (0, 1, 2, etc.)
    "lastWarningAt" TIMESTAMP,
    "lastUsageAt" TIMESTAMP, -- Last time this user consumed data
    "metadata" JSONB DEFAULT '{}', -- Additional tracking data
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for frequent queries
CREATE INDEX idx_usage_tracking_user_id ON usage_tracking("userId");
CREATE INDEX idx_usage_tracking_user_cycle ON usage_tracking("userId", "cycleStartDate", "cycleEndDate");
CREATE INDEX idx_usage_tracking_exceeded ON usage_tracking("userId") WHERE "isLimitExceeded" = true;
CREATE INDEX idx_usage_tracking_cycle_start ON usage_tracking("cycleStartDate");

-- Add trigger for updatedAt
CREATE TRIGGER update_usage_tracking_updated_at
BEFORE UPDATE ON usage_tracking
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create view for current usage stats
CREATE VIEW current_usage_stats AS
SELECT 
    ut."userId",
    ut."dataUsedBytes",
    ut."dataLimitBytes",
    CASE 
        WHEN ut."dataLimitBytes" IS NULL THEN 0 -- Unlimited
        ELSE ROUND((ut."dataUsedBytes"::FLOAT / ut."dataLimitBytes" * 100)::NUMERIC, 2)
    END as usage_percent,
    CASE 
        WHEN ut."dataLimitBytes" IS NULL THEN 0
        ELSE ut."dataLimitBytes" - ut."dataUsedBytes"
    END as remaining_bytes,
    ut."devicesUsed",
    ut."maxDevices",
    ut."cycleStartDate",
    ut."cycleEndDate",
    ut."isLimitExceeded"
FROM usage_tracking ut
WHERE ut."cycleEndDate" > CURRENT_TIMESTAMP
  AND ut.id IN (
    SELECT id FROM usage_tracking ut2 
    WHERE ut2."userId" = ut."userId" 
    ORDER BY ut2."cycleStartDate" DESC LIMIT 1
  );

-- Create view for monthly usage aggregates
CREATE VIEW monthly_usage_aggregates AS
SELECT 
    "userId",
    DATE_TRUNC('month', "cycleStartDate")::DATE as month,
    SUM("dataUsedBytes") as total_data_used,
    MAX("dataLimitBytes") as monthly_limit,
    COUNT(*) as cycle_count,
    MAX("devicesUsed") as max_devices_in_month,
    COUNT(*) FILTER (WHERE "isLimitExceeded" = true) as times_limit_exceeded
FROM usage_tracking
GROUP BY "userId", DATE_TRUNC('month', "cycleStartDate");

-- Add comment
COMMENT ON TABLE usage_tracking IS 'Per-cycle data usage tracking. One record per user per billing cycle. Used to enforce data limits and send warnings.';
COMMENT ON COLUMN usage_tracking."dataLimitBytes" IS 'NULL means unlimited data. For Free plan users, this might be 500GB * 1024 * 1024 * 1024 bytes.';
COMMENT ON COLUMN usage_tracking."isLimitExceeded" IS 'Set to true when dataUsedBytes >= dataLimitBytes. Triggers throttling or blocking of connections.';
