# Iran-Side Config Testing — Implementation Guide

## Overview

Iran-side configs are VPN configurations marked specifically for testing from Iran. When flagged, the health checker will:

1. Test connectivity using Iran-specific nodes from check-host.net (IR, RU, UA, TR, AZ)
2. Report results separately in Telegram with Iran/Global categorization
3. Allow fine-grained monitoring of Iran-specific availability

## Database Changes

### Migration
- File: `database/migrations/017_add_is_iran_side_to_configs.sql`
- Adds `is_iran_side BOOLEAN NOT NULL DEFAULT FALSE` to `v2ray_configs` table
- Adds index for fast filtering

### Schema Update
- `database/schema.sql` and `database/full_setup_migration.sql` updated with the new column

## API Changes

### Create Config
**POST** `/v2ray-configs`

```json
{
  "name": "Iran Server 1",
  "type": "v2ray_link",
  "category": "main",
  "country": "ir",
  "isIranSide": true,
  "content": "vmess://..."
}
```

**New field**: `isIranSide` (boolean, optional, defaults to false)

### Update Config
**PATCH** `/v2ray-configs/:id`

```json
{
  "isIranSide": true
}
```

## Health Check Behavior

### Standard (Global) Configs
- Tests endpoint using check-host.net global node pool
- May include US, EU, RU, etc. randomly

### Iran-Side Configs (`isIranSide: true`)
- Tests from Iran-aware nodes: **IR** (Iran), **RU** (Russia), **UA** (Ukraine), **TR** (Turkey), **AZ** (Azerbaijan)
- Falls back to global pool if no Iran nodes available
- Results clearly marked as Iran-specific in reports

### Check Result Format
```typescript
{
  id: "uuid",
  name: "Iran Server 1",
  isIranSide: true,  // ← NEW FIELD
  reachable: true,
  remoteNodes: [
    { node: "ir1.node.check-host.net", reachable: true, latencyMs: 45 },
    { node: "ru2.node.check-host.net", reachable: true, latencyMs: 120 },
  ]
}
```

## Telegram Bot Reporting

### Report Format
Reports now separate Iran-side and global configs:

```
🇮🇷 Iran-Side Configs (5)
  Working: 4 | Failed: 1
  
  ▸ 🇮🇷 Iran Server 1 tcp 167.233.242.170:16410 local:45ms remote:45ms (ir1)
  ▸ 🇮🇷 Iran Server 2 tcp 185.220.101.45:443 local:60ms remote:120ms (ru2)

🌍 Global Configs (12)
  Working: 11 | Failed: 1
  
  ▸ 🌍 US Server tcp 1.2.3.4:10000 local:150ms remote:200ms (us1)
```

### Iran-Side Benefits
- Quickly identify if servers are blocked in Iran
- Separate monitoring for domestic vs. international users
- Proactive alerts when Iran-side configs fail

## Service Code Changes

### ConfigCheckerService
- `checkHostNetTcp()` now accepts `isIranSide` parameter
- Filters for Iran-adjacent nodes when flag is set
- Gracefully falls back to global pool if no Iran nodes available

### TelegramReportService
- `buildReportMessage()` separates Iran-side and global configs
- `formatFailedConfig()` / `formatWorkingConfig()` show test type (🇮🇷 / 🌍)
- Full details for failed Iran-side configs (higher priority)
- Condensed working list for readability

### V2RayConfig Entity
- New column: `isIranSide: boolean` (default: false)
- Indexed for fast filtering in queries

## Usage Examples

### Admin Creates Iran-Side Config
```bash
curl -X POST http://localhost:3000/v2ray-configs \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tehran Mirror",
    "type": "v2ray_link",
    "isIranSide": true,
    "content": "vmess://..."
  }'
```

### Enable Iran Testing on Existing Config
```bash
curl -X PATCH http://localhost:3000/v2ray-configs/<ID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "isIranSide": true }'
```

### Check Specific Config
```bash
curl http://localhost:3000/config-checker/check/<ID> \
  -H "Authorization: Bearer <TOKEN>"
```

Result includes `isIranSide: true` and Iran-node results.

## Scheduled Health Checks

The cron job (`0 */10 * * * *`) runs every 10 minutes and:

1. Checks all configs
2. Automatically tests Iran-side configs from Iran-aware nodes
3. Sends Telegram reports with Iran/Global breakdown
4. Removes configs after 5 consecutive failures (same for both types)

## Environment Variables

No new environment variables needed. Existing check-host.net integration is reused.

- `CONFIG_TRAFFIC_CHECK_ENABLED` - Still controls traffic probes
- `TELEGRAM_BOT_TOKEN` - Still required for reports
- `TELEGRAM_REPORT_CHAT_IDS` - Still required for Telegram delivery

## Migration Steps

1. Run migration: `017_add_is_iran_side_to_configs.sql`
2. Rebuild TypeORM entities
3. Redeploy backend
4. Start flagging configs as `isIranSide: true` in admin panel or API
5. Next health check (~10 min) will test Iran-side configs from Iran nodes

## Monitoring

Monitor via:
- **API**: GET `/config-checker/check` shows per-config results with `isIranSide` flag
- **Telegram**: Reports separate Iran-side failures (priority highlighting)
- **Logs**: Service logs include "Iran-side config" labels for better tracing

---

**Version**: 1.0  
**Added**: August 2026  
**Author**: Config Checker Enhancement
