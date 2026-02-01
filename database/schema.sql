-- =====================================================
-- FlyVPN Database Schema
-- PostgreSQL Database Creation Script
-- Database Name: flyvpn
-- =====================================================

-- Drop existing tables if they exist
DROP TABLE IF EXISTS device_logins CASCADE;
DROP TABLE IF EXISTS ad_settings CASCADE;
DROP TABLE IF EXISTS ads CASCADE;
DROP TABLE IF EXISTS v2ray_configs CASCADE;
DROP TABLE IF EXISTS users CASCADE;
-- Drop old tables if they still exist
DROP TABLE IF EXISTS vpn_servers CASCADE;
DROP TABLE IF EXISTS connections CASCADE;
DROP TABLE IF EXISTS ad_impressions CASCADE;

-- Drop existing types
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS v2ray_config_type CASCADE;
DROP TYPE IF EXISTS v2ray_config_category CASCADE;
DROP TYPE IF EXISTS ad_type CASCADE;
DROP TYPE IF EXISTS ad_platform CASCADE;
DROP TYPE IF EXISTS ad_placement CASCADE;

-- =====================================================
-- Create ENUM Types
-- =====================================================

CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'banned');
CREATE TYPE v2ray_config_type AS ENUM ('v2ray_link', 'json_config', 'openvpn', 'sstp', 'ssh');
CREATE TYPE v2ray_config_category AS ENUM ('splash', 'main', 'backup');
CREATE TYPE ad_type AS ENUM ('banner', 'video', 'reward');
CREATE TYPE ad_platform AS ENUM ('android', 'ios', 'both');
CREATE TYPE ad_placement AS ENUM ('main_page', 'splash', 'video_ad', 'reward_video', 'vpn_connect', 'vpn_disconnect', 'server_change');

-- =====================================================
-- Create Tables
-- =====================================================

-- Users Table
CREATE TABLE users (
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

-- Device Logins Table
CREATE TABLE device_logins (
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

-- V2Ray Configs Table
CREATE TABLE v2ray_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    type v2ray_config_type NOT NULL DEFAULT 'v2ray_link',
    category v2ray_config_category NOT NULL DEFAULT 'main',
    content TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ads Table
CREATE TABLE ads (
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

-- Ad Settings Table
CREATE TABLE ad_settings (
    key VARCHAR(255) PRIMARY KEY,
    value VARCHAR(255) NOT NULL,
    description VARCHAR(255)
);

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_device_id ON users("deviceId");
CREATE INDEX idx_device_logins_user_id ON device_logins("userId");
CREATE INDEX idx_device_logins_device_id ON device_logins("deviceId");
CREATE INDEX idx_device_logins_is_active ON device_logins("isActive");
CREATE INDEX idx_v2ray_configs_name ON v2ray_configs(name);
CREATE INDEX idx_v2ray_configs_category ON v2ray_configs(category);
CREATE INDEX idx_ads_placement ON ads(placement);
CREATE INDEX idx_ads_platform ON ads(platform);
CREATE INDEX idx_ads_is_active ON ads("isActive");

-- =====================================================
-- Create Triggers for Updated At
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_v2ray_configs_updated_at BEFORE UPDATE ON v2ray_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ads_updated_at BEFORE UPDATE ON ads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Insert Sample Data
-- =====================================================

-- Admin User
INSERT INTO users (email, password, username, "firstName", "lastName", role, status, "emailVerified")
VALUES (
    'admin@flyvpn.com',
    '$2b$10$rZ0YvZ7YqZ0YvZ7YqZ0YvOqZ0YvZ7YqZ0YvZ7YqZ0YvZ7YqZ0YvZ7Y', -- Hash for 'Admin@123'
    'admin',
    'Admin',
    'User',
    'admin',
    'active',
    true
);

-- Sample V2Ray Config
INSERT INTO v2ray_configs (name, type, content)
VALUES ('Iran Server 1', 'v2ray_link', 'vless://uuid@ip:port?security=tls&type=tcp&headerType=none#Iran-Server-1');

-- Sample Ad
INSERT INTO ads (name, type, platform, "adUnitId", placement, "isActive")
VALUES ('Main Page Banner', 'banner', 'android', 'ca-app-pub-3940256099942544/6300978111', 'main_page', true);

-- Sample Ad Settings
INSERT INTO ad_settings (key, value, description)
VALUES 
    ('main_page_banner_enabled', 'true', 'Enable banner on main page'),
    ('splash_ad_enabled', 'true', 'Enable ad on splash screen');

-- =====================================================
-- Success Message
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Database schema updated successfully!';
    RAISE NOTICE '📊 Tables created: users, device_logins, v2ray_configs, ads, ad_settings';
END $$;
