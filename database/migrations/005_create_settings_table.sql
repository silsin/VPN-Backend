CREATE TABLE settings (
    "key" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "category" VARCHAR(50) DEFAULT 'general' NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("key")
);
