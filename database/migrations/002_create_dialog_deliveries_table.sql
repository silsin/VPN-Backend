-- Create dialog_deliveries table for tracking analytics
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

-- Create indexes for analytics queries
CREATE INDEX idx_dialog_deliveries_dialog_id ON dialog_deliveries(dialog_id);
CREATE INDEX idx_dialog_deliveries_device_id ON dialog_deliveries(device_id);
CREATE INDEX idx_dialog_deliveries_status ON dialog_deliveries(delivery_status);
CREATE INDEX idx_dialog_deliveries_clicked ON dialog_deliveries(clicked) WHERE clicked = TRUE;
CREATE INDEX idx_dialog_deliveries_dismissed ON dialog_deliveries(dismissed) WHERE dismissed = TRUE;
