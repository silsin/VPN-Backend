-- Migration to add new protocols to v2ray_config_type enum
-- These values are required for OpenVPN, SSTP, and SSH support

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'v2ray_config_type' AND e.enumlabel = 'openvpn') THEN
        ALTER TYPE v2ray_config_type ADD VALUE 'openvpn';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'v2ray_config_type' AND e.enumlabel = 'sstp') THEN
        ALTER TYPE v2ray_config_type ADD VALUE 'sstp';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'v2ray_config_type' AND e.enumlabel = 'ssh') THEN
        ALTER TYPE v2ray_config_type ADD VALUE 'ssh';
    END IF;
END $$;
