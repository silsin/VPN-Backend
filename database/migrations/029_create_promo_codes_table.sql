-- Migration: Create promo_codes table
-- Purpose: Store promotional discount codes

BEGIN;

CREATE TABLE IF NOT EXISTS "promo_codes" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "code" VARCHAR(50) NOT NULL UNIQUE,
  "type" VARCHAR(20) DEFAULT 'percentage',
  "discountValue" DECIMAL(10, 2) NOT NULL,
  "maxDiscount" DECIMAL(10, 2),
  "minPurchaseAmount" DECIMAL(10, 2),
  "maxUses" INT,
  "currentUses" INT DEFAULT 0,
  "isActive" BOOLEAN DEFAULT true,
  "expiryDate" TIMESTAMP NOT NULL,
  "description" VARCHAR(255),
  "applicablePlans" VARCHAR(1000),
  "maxUsesPerUser" INT,
  "startDate" TIMESTAMP,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX "idx_promo_codes_code" ON "promo_codes" ("code");
CREATE INDEX "idx_promo_codes_is_active" ON "promo_codes" ("isActive");
CREATE INDEX "idx_promo_codes_expiry" ON "promo_codes" ("expiryDate");
CREATE INDEX "idx_promo_codes_active" ON "promo_codes" ("isActive") WHERE "isActive" = true;

COMMIT;
