-- Create dialogs table
CREATE TABLE IF NOT EXISTS dialogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('in-app', 'push', 'both')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
    target VARCHAR(20) NOT NULL CHECK (target IN ('all', 'android', 'ios')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    image_url VARCHAR(500),
    action_url VARCHAR(500),
    schedule_time TIMESTAMP WITH TIME ZONE,
    sent_time TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_dialogs_status ON dialogs(status);
CREATE INDEX idx_dialogs_type ON dialogs(type);
CREATE INDEX idx_dialogs_target ON dialogs(target);
CREATE INDEX idx_dialogs_schedule_time ON dialogs(schedule_time) WHERE schedule_time IS NOT NULL;
CREATE INDEX idx_dialogs_created_at ON dialogs(created_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_dialogs_updated_at BEFORE UPDATE ON dialogs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
