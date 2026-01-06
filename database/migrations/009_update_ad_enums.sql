-- Migration to fix ad_type and ad_placement enums
-- These values were added to the entities but might be missing in the database

-- Add missing values to ad_type
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'ad_type' AND e.enumlabel = 'video') THEN
        ALTER TYPE ad_type ADD VALUE 'video';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'ad_type' AND e.enumlabel = 'reward') THEN
        ALTER TYPE ad_type ADD VALUE 'reward';
    END IF;
END $$;

-- Add missing values to ad_placement
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'ad_placement' AND e.enumlabel = 'vpn_connect') THEN
        ALTER TYPE ad_placement ADD VALUE 'vpn_connect';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'ad_placement' AND e.enumlabel = 'vpn_disconnect') THEN
        ALTER TYPE ad_placement ADD VALUE 'vpn_disconnect';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'ad_placement' AND e.enumlabel = 'server_change') THEN
        ALTER TYPE ad_placement ADD VALUE 'server_change';
    END IF;
END $$;
