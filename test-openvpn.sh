#!/bin/bash

# Test script for OpenVPN endpoints
# Make sure backend is running at http://localhost:3000

API_URL="http://localhost:3000/api/v1"
TOKEN=""
SERVER_ID=""

echo "=== OpenVPN Endpoint Test ==="
echo ""

# 1. Get a test token (modify credentials as needed)
echo "1. Getting auth token..."
TOKEN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ Failed to get token. Make sure backend is running and credentials are correct."
  exit 1
fi
echo "✅ Token obtained: ${TOKEN:0:20}..."
echo ""

# 2. Get available servers (user endpoint)
echo "2. Getting available OpenVPN servers..."
SERVERS=$(curl -s -X GET "$API_URL/openvpn-configs/servers" \
  -H "Authorization: Bearer $TOKEN")

if echo "$SERVERS" | grep -q "error"; then
  echo "❌ Error getting servers: $SERVERS"
  exit 1
fi

SERVERS_COUNT=$(echo "$SERVERS" | jq 'length')
echo "✅ Found $SERVERS_COUNT servers"
echo ""

# 3. If servers exist, get config for first server
if [ "$SERVERS_COUNT" -gt 0 ]; then
  SERVER_ID=$(echo "$SERVERS" | jq -r '.[0].id')
  echo "3. Getting OpenVPN config for server: $SERVER_ID"
  
  CONFIG=$(curl -s -X POST "$API_URL/openvpn-configs/connect" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"serverId\":\"$SERVER_ID\"}")
  
  if echo "$CONFIG" | grep -q "error\|no active subscription"; then
    echo "❌ Error or no subscription: $CONFIG"
  else
    echo "✅ Config generated successfully"
    CONFIG_LENGTH=$(echo "$CONFIG" | jq '.config | length')
    echo "   Config size: $CONFIG_LENGTH bytes"
    echo "   Username: $(echo "$CONFIG" | jq -r '.username')"
    echo "   Expiry: $(echo "$CONFIG" | jq -r '.expiry')"
  fi
else
  echo "⚠️  No servers found. Admin needs to add OpenVPN servers first."
  echo "   Use Telegram bot: /ovpnadd"
fi

echo ""
echo "3. Getting server statistics..."
STATS=$(curl -s -X GET "$API_URL/openvpn-configs/stats" \
  -H "Authorization: Bearer $TOKEN")

echo "$STATS" | jq '.'
echo ""
echo "=== Test Complete ==="
