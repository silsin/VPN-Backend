#!/bin/bash

# Deployment script: Stop PM2, pull latest code, build, and restart

echo "🛑 Stopping PM2 processes..."
pm2 stop all

echo "📥 Pulling latest code from origin/xor..."
git pull origin xor

echo "🔨 Building project..."
npm run build

echo "▶️ Starting PM2 processes..."
pm2 start all

echo "✅ Deployment complete!"
