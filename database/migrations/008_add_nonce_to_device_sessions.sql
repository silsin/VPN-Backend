ALTER TABLE device_sessions ADD COLUMN IF NOT EXISTS "last_nonce" VARCHAR(255);
ALTER TABLE device_sessions ADD COLUMN IF NOT EXISTS "last_body_nonce" VARCHAR(255);
ALTER TABLE device_sessions ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP;
