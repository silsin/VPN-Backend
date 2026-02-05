-- NO_TRANSACTION
-- Force addition of enum values using PG 12+ syntax to avoid block transaction issues
ALTER TYPE v2ray_config_type ADD VALUE IF NOT EXISTS 'openvpn';
ALTER TYPE v2ray_config_type ADD VALUE IF NOT EXISTS 'sstp';
ALTER TYPE v2ray_config_type ADD VALUE IF NOT EXISTS 'ssh';
