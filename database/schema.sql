-- =====================================================
-- FlyVPN Database Schema
-- PostgreSQL Database Creation Script
-- Database Name: flyvpn
-- =====================================================
-- Instructions:
-- 1. Open pgAdmin
-- 2. Connect to your PostgreSQL server
-- 3. Select the 'flyvpn' database
-- 4. Open Query Tool (Tools > Query Tool)
-- 5. Copy and paste this entire script
-- 6. Click Execute (F5)
-- =====================================================

-- Drop existing tables if they exist (in correct order due to foreign keys)
DROP TABLE IF EXISTS ad_impressions CASCADE;
DROP TABLE IF EXISTS connections CASCADE;
DROP TABLE IF EXISTS ads CASCADE;
DROP TABLE IF EXISTS vpn_servers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop existing types if they exist
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS server_status CASCADE;
DROP TYPE IF EXISTS server_location CASCADE;
DROP TYPE IF EXISTS connection_status CASCADE;
DROP TYPE IF EXISTS ad_type CASCADE;
DROP TYPE IF EXISTS ad_status CASCADE;

-- =====================================================
-- Create ENUM Types
-- =====================================================

CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'banned');
CREATE TYPE server_status AS ENUM ('online', 'offline', 'maintenance');
CREATE TYPE server_location AS ENUM ('us', 'uk', 'de', 'fr', 'jp', 'sg', 'au', 'ca', 'nl', 'se');
CREATE TYPE connection_status AS ENUM ('connecting', 'connected', 'disconnected', 'failed');
CREATE TYPE ad_type AS ENUM ('banner', 'interstitial', 'rewarded', 'native');
CREATE TYPE ad_status AS ENUM ('active', 'inactive', 'paused');

-- =====================================================
-- Create Tables
-- =====================================================

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    "firstName" VARCHAR(255),
    "lastName" VARCHAR(255),
    role user_role NOT NULL DEFAULT 'user',
    status user_status NOT NULL DEFAULT 'active',
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

-- VPN Servers Table
CREATE TABLE vpn_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    hostname VARCHAR(255) NOT NULL,
    "ipAddress" VARCHAR(45) NOT NULL,
    port INTEGER NOT NULL,
    location server_location NOT NULL,
    status server_status NOT NULL DEFAULT 'offline',
    "currentConnections" INTEGER NOT NULL DEFAULT 0,
    "maxConnections" INTEGER NOT NULL DEFAULT 0,
    "totalDataTransferred" BIGINT NOT NULL DEFAULT 0,
    "loadAverage" REAL NOT NULL DEFAULT 0,
    protocol VARCHAR(50),
    configuration TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastHealthCheck" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Connections Table
CREATE TABLE connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    status connection_status NOT NULL DEFAULT 'connecting',
    "clientIp" VARCHAR(45),
    "assignedIp" VARCHAR(45),
    "bytesReceived" BIGINT NOT NULL DEFAULT 0,
    "bytesSent" BIGINT NOT NULL DEFAULT 0,
    "connectedAt" TIMESTAMP,
    "disconnectedAt" TIMESTAMP,
    duration INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_connection_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_connection_server FOREIGN KEY ("serverId") REFERENCES vpn_servers(id) ON DELETE CASCADE
);

-- Ads Table
CREATE TABLE ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type ad_type NOT NULL,
    status ad_status NOT NULL DEFAULT 'active',
    "adUnitId" VARCHAR(255) NOT NULL,
    "adNetwork" VARCHAR(100),
    content TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "clickUrl" TEXT,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    targeting JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP,
    "endDate" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ad Impressions Table
CREATE TABLE ad_impressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "adId" UUID NOT NULL,
    "userId" UUID,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    clicked BOOLEAN NOT NULL DEFAULT false,
    "clickedAt" TIMESTAMP,
    revenue DECIMAL(10, 2),
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_impression_ad FOREIGN KEY ("adId") REFERENCES ads(id) ON DELETE CASCADE,
    CONSTRAINT fk_impression_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- Create Indexes for Performance
-- =====================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users("createdAt");

CREATE INDEX idx_vpn_servers_location ON vpn_servers(location);
CREATE INDEX idx_vpn_servers_status ON vpn_servers(status);
CREATE INDEX idx_vpn_servers_is_active ON vpn_servers("isActive");
CREATE INDEX idx_vpn_servers_load_average ON vpn_servers("loadAverage");

CREATE INDEX idx_connections_user_id ON connections("userId");
CREATE INDEX idx_connections_server_id ON connections("serverId");
CREATE INDEX idx_connections_status ON connections(status);
CREATE INDEX idx_connections_created_at ON connections("createdAt");
CREATE INDEX idx_connections_connected_at ON connections("connectedAt");

CREATE INDEX idx_ads_type ON ads(type);
CREATE INDEX idx_ads_status ON ads(status);
CREATE INDEX idx_ads_is_active ON ads("isActive");
CREATE INDEX idx_ads_priority ON ads(priority);
CREATE INDEX idx_ads_start_end_date ON ads("startDate", "endDate");

CREATE INDEX idx_ad_impressions_ad_id ON ad_impressions("adId");
CREATE INDEX idx_ad_impressions_user_id ON ad_impressions("userId");
CREATE INDEX idx_ad_impressions_created_at ON ad_impressions("createdAt");
CREATE INDEX idx_ad_impressions_clicked ON ad_impressions(clicked);

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
CREATE TRIGGER update_vpn_servers_updated_at BEFORE UPDATE ON vpn_servers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_connections_updated_at BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ads_updated_at BEFORE UPDATE ON ads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Insert Sample Data
-- =====================================================

-- Sample admin user (password: Admin@123 - you need to hash this with bcrypt)
INSERT INTO users (email, password, username, "firstName", "lastName", role, status, "emailVerified")
VALUES (
    'admin@flyvpn.com',
    '$2b$10$rZ0YvZ7YqZ0YvZ7YqZ0YvOqZ0YvZ7YqZ0YvZ7YqZ0YvZ7YqZ0YvZ7Y',
    'admin',
    'Admin',
    'User',
    'admin',
    'active',
    true
);

-- Sample VPN servers
INSERT INTO vpn_servers (name, hostname, "ipAddress", port, location, status, "maxConnections", protocol, "isActive")
VALUES
    ('US-East-1', 'us-east-1.flyvpn.com', '192.168.1.1', 1194, 'us', 'online', 1000, 'OpenVPN', true),
    ('UK-London-1', 'uk-london-1.flyvpn.com', '192.168.1.2', 1194, 'uk', 'online', 800, 'OpenVPN', true),
    ('DE-Frankfurt-1', 'de-frankfurt-1.flyvpn.com', '192.168.1.3', 1194, 'de', 'online', 1200, 'WireGuard', true),
    ('JP-Tokyo-1', 'jp-tokyo-1.flyvpn.com', '192.168.1.4', 1194, 'jp', 'online', 600, 'IKEv2', true),
    ('SG-Singapore-1', 'sg-singapore-1.flyvpn.com', '192.168.1.5', 1194, 'sg', 'maintenance', 500, 'OpenVPN', false),
    ('FR-Paris-1', 'fr-paris-1.flyvpn.com', '192.168.1.6', 1194, 'fr', 'online', 900, 'OpenVPN', true),
    ('CA-Toronto-1', 'ca-toronto-1.flyvpn.com', '192.168.1.7', 1194, 'ca', 'online', 700, 'WireGuard', true),
    ('AU-Sydney-1', 'au-sydney-1.flyvpn.com', '192.168.1.8', 1194, 'au', 'online', 500, 'OpenVPN', true),
    ('NL-Amsterdam-1', 'nl-amsterdam-1.flyvpn.com', '192.168.1.9', 1194, 'nl', 'online', 1100, 'WireGuard', true),
    ('SE-Stockholm-1', 'se-stockholm-1.flyvpn.com', '192.168.1.10', 1194, 'se', 'online', 600, 'OpenVPN', true);

-- Sample ads
INSERT INTO ads (title, description, type, status, "adUnitId", "adNetwork", priority, "isActive")
VALUES
    ('Welcome Banner', 'Welcome banner ad for new users', 'banner', 'active', 'ca-app-pub-123456789/banner1', 'Google AdMob', 10, true),
    ('Premium Upgrade', 'Interstitial ad for premium upgrade', 'interstitial', 'active', 'ca-app-pub-123456789/interstitial1', 'Google AdMob', 20, true),
    ('Rewarded Video', 'Rewarded video for extra data', 'rewarded', 'active', 'ca-app-pub-123456789/rewarded1', 'Google AdMob', 30, true),
    ('Native Ad 1', 'Native ad for home screen', 'native', 'active', 'ca-app-pub-123456789/native1', 'Google AdMob', 15, true);

-- =====================================================
-- Create Views for Analytics
-- =====================================================

CREATE OR REPLACE VIEW active_connections_summary AS
SELECT 
    vs.name AS server_name,
    vs.location,
    COUNT(c.id) AS active_connections,
    vs."maxConnections" AS max_connections,
    ROUND((COUNT(c.id)::NUMERIC / NULLIF(vs."maxConnections", 0)) * 100, 2) AS usage_percentage
FROM vpn_servers vs
LEFT JOIN connections c ON vs.id = c."serverId" AND c.status = 'connected'
GROUP BY vs.id, vs.name, vs.location, vs."maxConnections";

CREATE OR REPLACE VIEW user_statistics AS
SELECT 
    u.id,
    u.email,
    u.username,
    u."totalConnections",
    u."totalDataTransferred",
    u."lastConnectionAt",
    COUNT(c.id) AS total_connection_records,
    COALESCE(SUM(c."bytesReceived" + c."bytesSent"), 0) AS total_bandwidth_used
FROM users u
LEFT JOIN connections c ON u.id = c."userId"
GROUP BY u.id;

CREATE OR REPLACE VIEW ad_performance AS
SELECT 
    a.id,
    a.title,
    a.type,
    a.impressions,
    a.clicks,
    CASE 
        WHEN a.impressions > 0 THEN ROUND((a.clicks::NUMERIC / a.impressions) * 100, 2)
        ELSE 0
    END AS ctr_percentage,
    a.revenue,
    COUNT(ai.id) AS total_impressions_records
FROM ads a
LEFT JOIN ad_impressions ai ON a.id = ai."adId"
GROUP BY a.id;

-- =====================================================
-- Verification Queries
-- =====================================================

-- Check created tables
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check created types
SELECT typname as enum_name, 
       array_agg(enumlabel ORDER BY enumsortorder) as enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE typname IN ('user_role', 'user_status', 'server_status', 'server_location', 'connection_status', 'ad_type', 'ad_status')
GROUP BY typname
ORDER BY typname;

-- Check sample data
SELECT 'users' as table_name, COUNT(*) as record_count FROM users
UNION ALL
SELECT 'vpn_servers', COUNT(*) FROM vpn_servers
UNION ALL
SELECT 'ads', COUNT(*) FROM ads
UNION ALL
SELECT 'connections', COUNT(*) FROM connections
UNION ALL
SELECT 'ad_impressions', COUNT(*) FROM ad_impressions;

-- =====================================================
-- Success Message
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Database schema created successfully!';
    RAISE NOTICE '📊 Tables created: users, vpn_servers, connections, ads, ad_impressions';
    RAISE NOTICE '🔗 All relationships and foreign keys are set';
    RAISE NOTICE '📈 Views created: active_connections_summary, user_statistics, ad_performance';
    RAISE NOTICE '⚡ Indexes created for optimal performance';
    RAISE NOTICE '🔄 Triggers created for auto-updating timestamps';
    RAISE NOTICE '✨ Sample data inserted successfully';
END $$;
