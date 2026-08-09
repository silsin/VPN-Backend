-- =============================================================================
-- FlyVPN — Full database setup (single migration)
-- =============================================================================
-- Run on an EMPTY PostgreSQL database (recommended: database name `flyvpn`).
--
--   psql -U <user> -d flyvpn -f database/full_setup_migration.sql
--
-- Default admin (change password after first login):
--   Email:    admin@flyvpn.com
--   Password: Admin@123
--
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT where possible.
-- For a clean reinstall, drop the database and create it again before running.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- ENUM types
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'inactive', 'banned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE v2ray_config_type AS ENUM (
    'v2ray_link', 'json_config', 'openvpn', 'sstp', 'ssh'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE v2ray_config_category AS ENUM ('splash', 'main', 'backup');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ad_type AS ENUM ('banner', 'video', 'reward');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ad_platform AS ENUM ('android', 'ios', 'both');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ad_placement AS ENUM (
    'main_page', 'splash', 'video_ad', 'reward_video',
    'vpn_connect', 'vpn_disconnect', 'server_change'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Core tables (TypeORM entity column names)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255),
  username VARCHAR(255),
  "firstName" VARCHAR(255),
  "lastName" VARCHAR(255),
  role user_role NOT NULL DEFAULT 'user',
  status user_status NOT NULL DEFAULT 'active',
  "deviceId" VARCHAR(255) UNIQUE,
  "deviceName" VARCHAR(255),
  platform VARCHAR(255),
  "pushId" VARCHAR(255),
  "totalConnections" INTEGER NOT NULL DEFAULT 0,
  "totalDataTransferred" BIGINT NOT NULL DEFAULT 0,
  "lastConnectionAt" TIMESTAMP,
  "lastLoginAt" TIMESTAMP,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "emailVerificationToken" VARCHAR(255),
  "passwordResetToken" VARCHAR(255),
  "passwordResetExpires" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "deviceId" VARCHAR(255) NOT NULL,
  "deviceName" VARCHAR(255),
  platform VARCHAR(255),
  "pushId" VARCHAR(255),
  "ipAddress" VARCHAR(255),
  "userAgent" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "loginAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "logoutAt" TIMESTAMP
);

CREATE TABLE IF NOT EXISTS v2ray_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  type v2ray_config_type NOT NULL DEFAULT 'v2ray_link',
  category v2ray_config_category NOT NULL DEFAULT 'main',
  country VARCHAR(2),
  is_iran_side BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_v2ray_configs_is_iran_side ON v2ray_configs(is_iran_side);

CREATE TABLE IF NOT EXISTS ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type ad_type NOT NULL,
  platform ad_platform NOT NULL,
  "adUnitId" VARCHAR(255) NOT NULL,
  placement ad_placement NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ad_settings (
  key VARCHAR(255) PRIMARY KEY,
  value VARCHAR(255) NOT NULL,
  description VARCHAR(255)
);

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

CREATE TABLE IF NOT EXISTS settings (
  "key" VARCHAR(255) NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "category" VARCHAR(50) NOT NULL DEFAULT 'general',
  "description" VARCHAR(255),
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dialogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('in-app', 'push', 'both')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
  target VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (target IN ('all', 'android', 'ios')),
  placement VARCHAR(50) NOT NULL DEFAULT 'general' CHECK (placement IN (
    'general', 'splash', 'before_connect', 'after_connect'
  )),
  repeatable BOOLEAN NOT NULL DEFAULT false,
  priority VARCHAR(50) NOT NULL DEFAULT 'normal',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  image_url VARCHAR(500),
  action_url VARCHAR(500),
  buttons JSONB,
  schedule_time TIMESTAMP WITH TIME ZONE,
  expire_time TIMESTAMP WITH TIME ZONE,
  sent_time TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dialog_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dialog_id UUID NOT NULL REFERENCES dialogs(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  platform VARCHAR(20),
  delivery_status VARCHAR(20) NOT NULL CHECK (delivery_status IN ('sent', 'delivered', 'failed')),
  clicked BOOLEAN DEFAULT FALSE,
  dismissed BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) NOT NULL,
  api_auth_token VARCHAR(255) NOT NULL,
  aes2_key_b64 TEXT NOT NULL,
  aes2_iv_b64 TEXT NOT NULL,
  xor3_key_b64 TEXT NOT NULL,
  last_nonce VARCHAR(255),
  last_body_nonce VARCHAR(255),
  last_seen_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timer_configurations (
  id VARCHAR(255) PRIMARY KEY,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  enabled BOOLEAN DEFAULT true,
  backend_control BOOLEAN DEFAULT true,
  interval_seconds INTEGER,
  duration_seconds INTEGER,
  min_value INTEGER,
  max_value INTEGER,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timer_events (
  id SERIAL PRIMARY KEY,
  timer_id VARCHAR(255) NOT NULL REFERENCES timer_configurations(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255),
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timer_status (
  timer_id VARCHAR(255) PRIMARY KEY REFERENCES timer_configurations(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'stopped',
  remaining_seconds INTEGER,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS "__migrations_history" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_device_id ON users("deviceId");
CREATE INDEX IF NOT EXISTS idx_device_logins_user_id ON device_logins("userId");
CREATE INDEX IF NOT EXISTS idx_device_logins_device_id ON device_logins("deviceId");
CREATE INDEX IF NOT EXISTS idx_device_logins_is_active ON device_logins("isActive");
CREATE INDEX IF NOT EXISTS idx_v2ray_configs_name ON v2ray_configs(name);
CREATE INDEX IF NOT EXISTS idx_v2ray_configs_category ON v2ray_configs(category);
CREATE INDEX IF NOT EXISTS idx_ads_placement ON ads(placement);
CREATE INDEX IF NOT EXISTS idx_ads_platform ON ads(platform);
CREATE INDEX IF NOT EXISTS idx_ads_is_active ON ads("isActive");
CREATE INDEX IF NOT EXISTS idx_dialogs_status ON dialogs(status);
CREATE INDEX IF NOT EXISTS idx_dialogs_type ON dialogs(type);
CREATE INDEX IF NOT EXISTS idx_dialogs_target ON dialogs(target);
CREATE INDEX IF NOT EXISTS idx_dialogs_placement ON dialogs(placement);
CREATE INDEX IF NOT EXISTS idx_dialogs_schedule_time ON dialogs(schedule_time) WHERE schedule_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dialogs_created_at ON dialogs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dialog_deliveries_dialog_id ON dialog_deliveries(dialog_id);
CREATE INDEX IF NOT EXISTS idx_dialog_deliveries_device_id ON dialog_deliveries(device_id);
CREATE INDEX IF NOT EXISTS idx_dialog_deliveries_status ON dialog_deliveries(delivery_status);
CREATE INDEX IF NOT EXISTS idx_dialog_deliveries_clicked ON dialog_deliveries(clicked) WHERE clicked = TRUE;
CREATE INDEX IF NOT EXISTS idx_dialog_deliveries_dismissed ON dialog_deliveries(dismissed) WHERE dismissed = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS device_sessions_api_auth_token_uq ON device_sessions(api_auth_token);
CREATE INDEX IF NOT EXISTS device_sessions_device_id_idx ON device_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_timer_configurations_category ON timer_configurations(category);
CREATE INDEX IF NOT EXISTS idx_timer_events_timer_id ON timer_events(timer_id);
CREATE INDEX IF NOT EXISTS idx_timer_events_timestamp ON timer_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_timer_events_type ON timer_events(event_type);
CREATE INDEX IF NOT EXISTS idx_timer_status_status ON timer_status(status);

-- -----------------------------------------------------------------------------
-- updatedAt triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_v2ray_configs_updated_at ON v2ray_configs;
CREATE TRIGGER update_v2ray_configs_updated_at
  BEFORE UPDATE ON v2ray_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ads_updated_at ON ads;
CREATE TRIGGER update_ads_updated_at
  BEFORE UPDATE ON ads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_dialogs_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_dialogs_updated_at ON dialogs;
CREATE TRIGGER update_dialogs_updated_at
  BEFORE UPDATE ON dialogs
  FOR EACH ROW EXECUTE FUNCTION update_dialogs_updated_at_column();

CREATE OR REPLACE FUNCTION update_timer_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_timer_config_updated_at ON timer_configurations;
CREATE TRIGGER trigger_update_timer_config_updated_at
  BEFORE UPDATE ON timer_configurations
  FOR EACH ROW EXECUTE FUNCTION update_timer_config_updated_at();

-- -----------------------------------------------------------------------------
-- Seed data
-- -----------------------------------------------------------------------------

-- Default admin (password: Admin@123)
INSERT INTO users (
  email, password, username, "firstName", "lastName", role, status, "emailVerified"
)
VALUES (
  'admin@flyvpn.com',
  '$2b$10$XM/0Uu0jLdfn6p62OP7w/Ol.Vlq6r41Wkk5zgF7W.BwTjeOjPpEE6',
  'admin',
  'Admin',
  'User',
  'admin',
  'active',
  true
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO settings ("key", "value", "category", "description")
VALUES ('MaxVPNUsage', '10', 'general', 'Maximum VPN usage limit')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO settings ("key", "value", "category", "description")
VALUES
  ('androidVersion', '"1.0.0"', 'app_version', 'Latest Android version name (e.g. 1.0.0)'),
  ('androidBuild', '1', 'app_version', 'Latest Android build number (integer)'),
  ('androidForceUpdate', 'false', 'app_version', 'Force update when client build is older'),
  ('androidOptionalUpdate', 'true', 'app_version', 'Show optional update dialog when client build is older'),
  ('androidStoreUrl', '""', 'app_version', 'Android store / download URL'),
  ('androidMessage', '"A new version is available."', 'app_version', 'Upgrade dialog message for Android'),
  ('iosVersion', '"1.0.0"', 'app_version', 'Latest iOS version name (e.g. 1.0.0)'),
  ('iosBuild', '1', 'app_version', 'Latest iOS build number (integer)'),
  ('iosForceUpdate', 'false', 'app_version', 'Force update when client build is older'),
  ('iosOptionalUpdate', 'true', 'app_version', 'Show optional update dialog when client build is older'),
  ('iosStoreUrl', '""', 'app_version', 'iOS App Store / download URL'),
  ('iosMessage', '"A new version is available."', 'app_version', 'Upgrade dialog message for iOS')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO ad_settings (key, value, description)
VALUES
  ('main_page_banner_enabled', 'true', 'Enable banner on main page'),
  ('splash_ad_enabled', 'true', 'Enable ad on splash screen')
ON CONFLICT (key) DO NOTHING;

INSERT INTO ads (name, type, platform, "adUnitId", placement, "isActive")
SELECT
  'Main Page Banner',
  'banner',
  'android',
  'ca-app-pub-3940256099942544/6300978111',
  'main_page',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM ads WHERE name = 'Main Page Banner'
);

INSERT INTO v2ray_configs (name, type, category, content)
VALUES (
  'Sample Server',
  'v2ray_link',
  'main',
  'vless://00000000-0000-0000-0000-000000000000@0.0.0.0:443?security=tls&type=tcp#Sample'
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO timer_configurations (
  id, category, enabled, backend_control,
  interval_seconds, duration_seconds, min_value, max_value, description
) VALUES
  ('auto_disconnect', 'connection_management', true, true, 300, 3600, 60, 86400, 'Automatically disconnects VPN connection after specified duration'),
  ('connection_timeout', 'connection_management', true, true, 30, 120, 5, 300, 'Sets timeout for connection attempts'),
  ('status_polling', 'connection_management', true, true, 5, 60, 1, 300, 'Frequency of VPN status checks'),
  ('vpn_stats', 'statistics', true, true, 60, 300, 1, 3600, 'Collection interval for VPN connection statistics'),
  ('protocol_stats', 'statistics', true, true, 30, 180, 1, 3600, 'Real-time protocol statistics collection'),
  ('ik_e_v2_stats', 'statistics', true, true, 60, 300, 1, 3600, 'IKEv2 protocol-specific statistics'),
  ('background_ping', 'monitoring', true, true, 120, 600, 30, 3600, 'Server latency monitoring frequency'),
  ('session_tracking', 'monitoring', true, true, 300, 3600, 60, 86400, 'User session duration tracking'),
  ('debounce_delay', 'ui_performance', true, true, 300, 1000, 100, 5000, 'UI update debouncing delay in milliseconds'),
  ('server_selection_delay', 'ui_performance', true, true, 1, 10, 1, 60, 'Delay before automatic server selection in seconds')
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  enabled = EXCLUDED.enabled,
  backend_control = EXCLUDED.backend_control,
  interval_seconds = EXCLUDED.interval_seconds,
  duration_seconds = EXCLUDED.duration_seconds,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO timer_status (timer_id, status, remaining_seconds)
SELECT id, 'stopped', 0 FROM timer_configurations
ON CONFLICT (timer_id) DO NOTHING;

-- Mark incremental migrations as applied (app will skip them on startup)
INSERT INTO "__migrations_history" (name) VALUES
  ('001_create_dialogs_table.sql'),
  ('002_create_dialog_deliveries_table.sql'),
  ('003_add_buttons_to_dialogs.sql'),
  ('004_add_country_to_v2ray_configs.sql'),
  ('005_create_settings_table.sql'),
  ('006_add_max_vpn_usage_setting.sql'),
  ('007_create_device_sessions_table.sql'),
  ('008_add_nonce_to_device_sessions.sql'),
  ('009_update_ad_enums.sql'),
  ('010_add_protocols_to_v2ray_config_type.sql'),
  ('011_ensure_protocols_enum.sql'),
  ('012_create_timer_tables.sql'),
  ('013_add_app_version_settings.sql'),
  ('014_create_ad_failure_reports_table.sql'),
  ('015_add_dialog_placement.sql'),
  ('016_add_dialog_repeatable.sql')
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Done
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE 'FlyVPN full setup completed.';
  RAISE NOTICE 'Admin login: admin@flyvpn.com / Admin@123 (change password after first login).';
END $$;
