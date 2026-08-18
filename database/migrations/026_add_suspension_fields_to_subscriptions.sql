-- Migration: Add suspension fields to user_subscriptions table
-- Purpose: Support subscription suspension functionality

BEGIN;

-- Add suspension columns
ALTER TABLE "user_subscriptions" ADD COLUMN "suspendedAt" TIMESTAMP NULL;
ALTER TABLE "user_subscriptions" ADD COLUMN "suspendedReason" VARCHAR(500) NULL;
ALTER TABLE "user_subscriptions" ADD COLUMN "suspendedByAdminId" UUID NULL;

-- Add index on suspendedAt for efficient queries
CREATE INDEX "idx_user_subscriptions_suspended_at" ON "user_subscriptions" ("suspendedAt") WHERE "suspendedAt" IS NOT NULL;

-- Add index on status to find suspended subscriptions quickly
CREATE INDEX "idx_user_subscriptions_suspended_status" ON "user_subscriptions" ("status", "suspendedAt");

COMMIT;
