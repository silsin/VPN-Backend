-- Migration: Create device_tokens table for push notifications
-- Purpose: Store Firebase Cloud Messaging tokens for users

BEGIN;

CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "deviceName" VARCHAR(100),
  "deviceType" VARCHAR(50),
  "osVersion" VARCHAR(100),
  "appVersion" VARCHAR(100),
  "isActive" BOOLEAN DEFAULT true,
  "lastUsedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX "idx_device_tokens_user_id" ON "device_tokens" ("userId");
CREATE INDEX "idx_device_tokens_user_active" ON "device_tokens" ("userId", "isActive") WHERE "isActive" = true;
CREATE INDEX "idx_device_tokens_last_used" ON "device_tokens" ("lastUsedAt");

COMMIT;
