-- Store mobile reports when ads fail to show
DO $$ BEGIN
  CREATE TYPE ad_failure_reason AS ENUM (
    'no_fill',
    'network',
    'blocked',
    'timeout',
    'sdk_error',
    'not_configured',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ad_failure_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceId" VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  placement VARCHAR(100),
  "adType" VARCHAR(50),
  "adId" UUID,
  "adUnitId" VARCHAR(255),
  reason ad_failure_reason NOT NULL DEFAULT 'other',
  "reasonDetail" TEXT,
  "errorCode" VARCHAR(100),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ad_failure_reports_created_at
  ON ad_failure_reports ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_ad_failure_reports_reason
  ON ad_failure_reports (reason);

CREATE INDEX IF NOT EXISTS idx_ad_failure_reports_platform
  ON ad_failure_reports (platform);

CREATE INDEX IF NOT EXISTS idx_ad_failure_reports_device_id
  ON ad_failure_reports ("deviceId");
