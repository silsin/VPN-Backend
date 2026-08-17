-- Create subscription_plans table
-- Stores different VPN subscription plan tiers (Free, Monthly, Quarterly, Annual)

CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    duration_days INT, -- NULL for free/unlimited plans
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    data_limit_gb BIGINT, -- NULL for unlimited data
    max_devices INT NOT NULL DEFAULT 1,
    features JSONB NOT NULL DEFAULT '[]', -- Array of feature strings like ["premium_vpn", "ad_free"]
    display_order INT DEFAULT 0, -- Order to display plans in UI
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID, -- Admin user who created this plan
    updated_by UUID, -- Admin user who last updated
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for frequent queries
CREATE INDEX idx_subscription_plans_active ON subscription_plans(is_active);
CREATE INDEX idx_subscription_plans_name ON subscription_plans(name);
CREATE INDEX idx_subscription_plans_display_order ON subscription_plans(display_order);

-- Add trigger for updatedAt
CREATE TRIGGER update_subscription_plans_updated_at
BEFORE UPDATE ON subscription_plans
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Insert default plans
INSERT INTO subscription_plans (name, description, duration_days, price, data_limit_gb, max_devices, features, display_order, is_active)
VALUES 
    ('Free', 'Basic VPN access with ads', NULL, 0, 500, 1, '["basic_vpn"]'::jsonb, 1, true),
    ('Monthly', 'Premium VPN with no ads', 30, 4.99, NULL, 3, '["premium_vpn", "ad_free", "priority_support", "multi_device"]'::jsonb, 2, true),
    ('Quarterly', 'Best value - 3 months premium', 90, 12.99, NULL, 5, '["premium_vpn", "ad_free", "priority_support", "multi_device"]'::jsonb, 3, true),
    ('Annual', 'Maximum savings - Full year', 365, 39.99, NULL, 10, '["premium_vpn", "ad_free", "priority_support", "multi_device", "static_ip"]'::jsonb, 4, true);

-- Add comment
COMMENT ON TABLE subscription_plans IS 'Subscription plan templates. Each plan defines duration, price, features, and device limits.';
COMMENT ON COLUMN subscription_plans.features IS 'JSON array of feature identifiers. Examples: ["premium_vpn", "ad_free", "static_ip"]';
COMMENT ON COLUMN subscription_plans.data_limit_gb IS 'NULL means unlimited data. Set to specific number (e.g., 500) for data cap.';
