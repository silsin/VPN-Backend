-- Migration: Create gift_codes table
-- Purpose: Store gift codes for free/discounted subscriptions

BEGIN;

CREATE TABLE IF NOT EXISTS "gift_codes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" VARCHAR(50) NOT NULL UNIQUE,
  "planId" UUID NOT NULL REFERENCES "subscription_plans"("id") ON DELETE RESTRICT,
  "status" VARCHAR(50) DEFAULT 'active',
  "maxUses" INT NOT NULL,
  "currentUses" INT DEFAULT 0,
  "expiryDate" TIMESTAMP NOT NULL,
  "usedByUserId" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "usedAt" TIMESTAMP,
  "description" VARCHAR(255),
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX "idx_gift_codes_code" ON "gift_codes" ("code");
CREATE INDEX "idx_gift_codes_status" ON "gift_codes" ("status");
CREATE INDEX "idx_gift_codes_expiry" ON "gift_codes" ("expiryDate");
CREATE INDEX "idx_gift_codes_plan_id" ON "gift_codes" ("planId");
CREATE INDEX "idx_gift_codes_active" ON "gift_codes" ("status") WHERE "status" = 'active';

COMMIT;
