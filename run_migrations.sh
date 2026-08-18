#!/bin/bash

# Database connection variables (update these with your values)
DB_HOST=${DB_HOST:-46.225.167.224}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-flyvpn}
DB_PASSWORD=${DB_PASSWORD:-13740519ff}

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting database migrations...${NC}"

# Run migrations
MIGRATIONS=(
  "database/migrations/026_add_suspension_fields_to_subscriptions.sql"
  "database/migrations/027_create_device_tokens_table.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  if [ ! -f "$migration" ]; then
    echo -e "${RED}ERROR: Migration file not found: $migration${NC}"
    exit 1
  fi

  echo -e "${YELLOW}Running: $migration${NC}"
  
  PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$migration"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Completed: $migration${NC}"
  else
    echo -e "${RED}✗ Failed: $migration${NC}"
    exit 1
  fi
done

echo -e "${GREEN}All migrations completed successfully!${NC}"
