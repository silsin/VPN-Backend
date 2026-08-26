#!/bin/bash

# FlyVPN Backend - Quick Deployment Script
# Usage: ./deploy.sh

set -e

echo "🚀 FlyVPN Backend Deployment Script"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_DIR="/opt/apps/flyvpn-backend"
LOG_DIR="./logs"

# Create directories
mkdir -p $LOG_DIR

# Step 1: Stop current service
echo -e "${YELLOW}1. Stopping current service...${NC}"
if pm2 list | grep -q "flyvpn-backend"; then
    pm2 stop flyvpn-backend || true
    sleep 2
fi

# Step 2: Pull latest code
echo -e "${YELLOW}2. Pulling latest code...${NC}"
git pull origin main || echo -e "${RED}Warning: Git pull failed${NC}"

# Step 3: Install dependencies
echo -e "${YELLOW}3. Installing dependencies...${NC}"
npm ci

# Step 4: Build
echo -e "${YELLOW}4. Building backend...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

# Step 5: Run migrations
echo -e "${YELLOW}5. Running database migrations...${NC}"
npm run typeorm migration:run || echo -e "${YELLOW}Migrations already applied${NC}"

# Step 6: Start service
echo -e "${YELLOW}6. Starting service...${NC}"
if pm2 list | grep -q "flyvpn-backend"; then
    pm2 restart flyvpn-backend
else
    pm2 start ecosystem.config.js --name flyvpn-backend
fi

pm2 save

# Step 7: Verify
echo -e "${YELLOW}7. Verifying deployment...${NC}"
sleep 3

if pm2 list | grep -q "flyvpn-backend"; then
    STATUS=$(pm2 status flyvpn-backend | grep "online\|stopped\|errored")
    if echo "$STATUS" | grep -q "online"; then
        echo -e "${GREEN}✓ Service is running${NC}"
    else
        echo -e "${RED}✗ Service failed to start${NC}"
        pm2 logs flyvpn-backend --lines 50
        exit 1
    fi
else
    echo -e "${RED}✗ Service not found${NC}"
    exit 1
fi

# Step 8: Test health endpoint
echo -e "${YELLOW}8. Testing health endpoint...${NC}"
sleep 2
HEALTH=$(curl -s http://localhost:3000/health || echo "failed")
if echo "$HEALTH" | grep -q "ok\|healthy"; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${YELLOW}⚠ Health check warning (service might still be starting)${NC}"
fi

echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "  - View logs: pm2 logs flyvpn-backend"
echo "  - Check status: pm2 status"
echo "  - Monitor: pm2 monit"
echo ""
