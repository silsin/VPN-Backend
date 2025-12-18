CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS device_sessions (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "device_id" VARCHAR(255) NOT NULL,
    "api_auth_token" VARCHAR(255) NOT NULL,
    "aes2_key_b64" TEXT NOT NULL,
    "aes2_iv_b64" TEXT NOT NULL,
    "xor3_key_b64" TEXT NOT NULL,
    "last_nonce" VARCHAR(255),
    "last_body_nonce" VARCHAR(255),
    "last_seen_at" TIMESTAMP,
    "expires_at" TIMESTAMP NOT NULL,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS device_sessions_api_auth_token_uq ON device_sessions ("api_auth_token");
CREATE INDEX IF NOT EXISTS device_sessions_device_id_idx ON device_sessions ("device_id");
