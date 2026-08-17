-- Create payments table
-- Transaction history for all payment attempts (successful and failed)

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "subscriptionId" UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
    "planId" UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    payment_method VARCHAR(50) NOT NULL, -- stripe, paypal, crypto, gift_code, manual
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded, cancelled
    "transactionId" VARCHAR(255) UNIQUE, -- External transaction ID from payment processor (Stripe charge ID, etc.)
    "failureReason" VARCHAR(255), -- Reason for payment failure if status is failed
    "refundAmount" DECIMAL(10, 2), -- Amount refunded if status is refunded
    "refundedAt" TIMESTAMP,
    "refundTransactionId" VARCHAR(255), -- External refund transaction ID
    "metadata" JSONB DEFAULT '{}', -- Store extra data: {cardLast4, country, promoCode, etc.}
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for frequent queries
CREATE INDEX idx_payments_user_id ON payments("userId");
CREATE INDEX idx_payments_subscription_id ON payments("subscriptionId");
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_transaction_id ON payments("transactionId");
CREATE INDEX idx_payments_created_at ON payments("createdAt");
CREATE INDEX idx_payments_failed ON payments(status) WHERE status = 'failed';

-- Add trigger for updatedAt
CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create view for payment statistics
CREATE VIEW payment_stats AS
SELECT 
    DATE_TRUNC('month', "createdAt")::DATE as month,
    COUNT(*) as total_transactions,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_transactions,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_transactions,
    SUM(amount) FILTER (WHERE status = 'completed') as total_revenue,
    SUM("refundAmount") FILTER (WHERE status = 'refunded') as total_refunded,
    (COUNT(*) FILTER (WHERE status = 'completed')::FLOAT / NULLIF(COUNT(*), 0) * 100)::NUMERIC(5,2) as success_rate
FROM payments
GROUP BY DATE_TRUNC('month', "createdAt");

-- Add comment
COMMENT ON TABLE payments IS 'All payment transactions for subscriptions. Audit trail for billing and reconciliation.';
COMMENT ON COLUMN payments.status IS 'pending: awaiting processing; completed: successful; failed: declined/error; refunded: money returned; cancelled: user cancelled before processing';
COMMENT ON COLUMN payments."transactionId" IS 'External reference from payment processor (e.g., Stripe charge ID ch_1234567890)';
COMMENT ON COLUMN payments."metadata" IS 'Additional context: {promoCode, discountPercentage, cardBrand, country, ipAddress, userAgent, etc.}';
