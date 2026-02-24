-- Create timer_configurations table
CREATE TABLE IF NOT EXISTS "timer_configurations" (
    "id" VARCHAR(255) PRIMARY KEY,
    "category" VARCHAR(100) NOT NULL DEFAULT 'general',
    "enabled" BOOLEAN DEFAULT true,
    "backend_control" BOOLEAN DEFAULT true,
    "interval_seconds" INTEGER,
    "duration_seconds" INTEGER,
    "min_value" INTEGER,
    "max_value" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create timer_events table
CREATE TABLE IF NOT EXISTS "timer_events" (
    "id" SERIAL PRIMARY KEY,
    "timer_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(255),
    "metadata" JSONB,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("timer_id") REFERENCES "timer_configurations"("id") ON DELETE CASCADE
);

-- Create timer_status table
CREATE TABLE IF NOT EXISTS "timer_status" (
    "timer_id" VARCHAR(255) PRIMARY KEY,
    "status" VARCHAR(20) NOT NULL DEFAULT 'stopped',
    "remaining_seconds" INTEGER,
    "last_updated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    FOREIGN KEY ("timer_id") REFERENCES "timer_configurations"("id") ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_timer_configurations_category" ON "timer_configurations"("category");
CREATE INDEX IF NOT EXISTS "idx_timer_events_timer_id" ON "timer_events"("timer_id");
CREATE INDEX IF NOT EXISTS "idx_timer_events_timestamp" ON "timer_events"("timestamp");
CREATE INDEX IF NOT EXISTS "idx_timer_events_type" ON "timer_events"("event_type");
CREATE INDEX IF NOT EXISTS "idx_timer_status_status" ON "timer_status"("status");

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timer_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER "trigger_update_timer_config_updated_at"
    BEFORE UPDATE ON "timer_configurations"
    FOR EACH ROW
    EXECUTE FUNCTION update_timer_config_updated_at();

-- Insert default timer configurations
INSERT INTO "timer_configurations" ("id", "category", "enabled", "backend_control", "interval_seconds", "duration_seconds", "min_value", "max_value", "description") VALUES
-- Connection Management Timers
('auto_disconnect', 'connection_management', true, true, 300, 3600, 60, 86400, 'Automatically disconnects VPN connection after specified duration'),
('connection_timeout', 'connection_management', true, true, 30, 120, 5, 300, 'Sets timeout for connection attempts'),
('status_polling', 'connection_management', true, true, 5, 60, 1, 300, 'Frequency of VPN status checks'),

-- Statistics Timers
('vpn_stats', 'statistics', true, true, 60, 300, 1, 3600, 'Collection interval for VPN connection statistics'),
('protocol_stats', 'statistics', true, true, 30, 180, 1, 3600, 'Real-time protocol statistics collection'),
('ik_e_v2_stats', 'statistics', true, true, 60, 300, 1, 3600, 'IKEv2 protocol-specific statistics'),

-- Monitoring Timers
('background_ping', 'monitoring', true, true, 120, 600, 30, 3600, 'Server latency monitoring frequency'),
('session_tracking', 'monitoring', true, true, 300, 3600, 60, 86400, 'User session duration tracking'),

-- UI Performance Timers
('debounce_delay', 'ui_performance', true, true, 300, 1000, 100, 5000, 'UI update debouncing delay in milliseconds'),
('server_selection_delay', 'ui_performance', true, true, 1, 10, 1, 60, 'Delay before automatic server selection in seconds')

ON CONFLICT ("id") DO UPDATE SET
    "category" = EXCLUDED."category",
    "enabled" = EXCLUDED."enabled",
    "backend_control" = EXCLUDED."backend_control",
    "interval_seconds" = EXCLUDED."interval_seconds",
    "duration_seconds" = EXCLUDED."duration_seconds",
    "min_value" = EXCLUDED."min_value",
    "max_value" = EXCLUDED."max_value",
    "description" = EXCLUDED."description",
    "updated_at" = CURRENT_TIMESTAMP;

-- Initialize timer status records
INSERT INTO "timer_status" ("timer_id", "status", "remaining_seconds")
SELECT "id", 'stopped', 0 FROM "timer_configurations"
ON CONFLICT ("timer_id") DO NOTHING;
