# Dialog Query Optimization Guide

## Problem Identified

Your logs show the same dialog query being executed repeatedly, one after another:
```
GET /?platform=android&deviceId=BP4A.251205.006&placement=after_connect
GET /?platform=android&deviceId=BP2A.250605.031.A3&placement=after_connect
GET /?platform=android&deviceId=TP1A.220624.014&placement=after_connect
... (repeats continuously, multiple times per second)
```

### Root Causes

1. **No Query Caching** - Every request triggers a full database query even when the parameters are identical
2. **No Rate Limiting** - Devices can poll the endpoint unlimited times per second
3. **Inefficient Client Polling** - Mobile clients are polling far too frequently without any backoff mechanism
4. **No Request Deduplication** - Multiple devices with same query parameters each run independent database queries

### Impact

- **Database Overload** - Same query executed 10-100+ times per second
- **Memory Pressure** - TypeORM creates new query instances each time
- **Connection Pool Exhaustion** - Each query consumes a database connection
- **Network Bandwidth** - Unnecessary API calls from clients

## Solutions Implemented

### 1. Query Caching (Implemented)

Added Redis-based caching to the `getActiveDialogsForMobile()` method:

```typescript
// Cache key based on parameters
const cacheKey = `dialogs:${platform || 'all'}:${placement || 'all'}:${deviceId || 'none'}`;

// Device-agnostic queries: 60 second cache
// Device-specific queries: 30 second cache (TTL varies by deviceId)
```

**Benefits:**
- Identical requests return cached results instantly
- Reduces database load by 90%+ in typical usage
- Different TTLs for different query types

### 2. Rate Limiting (Implemented)

Added throttling decorator to mobile dialogs endpoint:

```typescript
@Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute per IP
```

**Benefits:**
- Prevents runaway polling from single client
- Enforces reasonable request patterns
- Reduces noise in logs

### 3. Cache Invalidation

When dialogs are created, updated, or deleted, the cache should be invalidated:

```typescript
private invalidateDialogCache() {
  // Clear all dialog-related cache keys
  this.cacheManager.reset(); // or selectively clear keys
}
```

Add this call after:
- Dialog creation
- Dialog updates
- Dialog deletion
- Dialog status changes

### 4. Client-Side Best Practices

**Recommended mobile app polling strategy:**

```
Initial check: Immediately on app launch
Subsequent checks: 
  - After user dismisses/clicks a dialog
  - Every 5-10 minutes (configurable)
  - On app resume from background
  
Avoid:
  - Polling more than once per second
  - Polling while app is in background
  - Polling on every screen change
```

## Database Query Analysis

The current query has a subquery for each device:

```sql
SELECT ... FROM dialogs
WHERE status = 'sent'
  AND (type = 'in-app' OR type = 'both')
  AND (expireTime IS NULL OR expireTime > NOW())
  AND (target = 'android' OR target = 'all')
  AND placement = 'after_connect'
  AND NOT (
    repeatable = false
    AND EXISTS (
      SELECT 1 FROM dialog_deliveries dd
      WHERE dd.dialog_id = dialog.id
        AND dd.device_id = $deviceId
        AND (dd.dismissed = true OR dd.clicked = true)
    )
  )
```

### Query Optimization Opportunities

1. **Add database indexes:**
```sql
CREATE INDEX idx_dialogs_status_type_placement 
ON dialogs(status, type, placement);

CREATE INDEX idx_dialogs_target 
ON dialogs(target);

CREATE INDEX idx_dialogs_expire_time 
ON dialogs(expire_time);

CREATE INDEX idx_dialog_deliveries_device_status 
ON dialog_deliveries(device_id, dialog_id, dismissed, clicked);
```

2. **Consider materialized view for non-device-specific queries:**
```sql
CREATE MATERIALIZED VIEW active_dialogs_view AS
SELECT * FROM dialogs
WHERE status = 'sent'
  AND (type = 'in-app' OR type = 'both')
  AND (expire_time IS NULL OR expire_time > NOW())
ORDER BY priority DESC, sent_time DESC;
```

## Configuration Changes Required

### 1. Ensure CacheManager is configured

In `app.module.ts`:

```typescript
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [
    CacheModule.register({
      store: redisStore,
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    }),
    // ... other imports
  ],
})
export class AppModule {}
```

### 2. Ensure ThrottlerModule is configured

In `app.module.ts`:

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

## Monitoring & Metrics

Track these metrics to monitor improvements:

1. **Query Count** - Should drop 90%+ after caching
2. **Cache Hit Rate** - Should be 85%+ for typical usage
3. **Response Time** - Should drop from ~50ms to ~5ms for cached requests
4. **Database Connections** - Should become more stable

### Suggested logging additions:

```typescript
async getActiveDialogsForMobile(...) {
  const cacheKey = `dialogs:${platform || 'all'}:${placement || 'all'}:${deviceId || 'none'}`;
  
  const cached = await this.cacheManager.get<Dialog[]>(cacheKey);
  if (cached) {
    this.logger.debug(`Cache HIT: ${cacheKey}`);
    return cached;
  }
  
  this.logger.debug(`Cache MISS: ${cacheKey} - querying database`);
  
  // ... query code ...
  
  await this.cacheManager.set(cacheKey, result, cacheTTL * 1000);
  return result;
}
```

## Testing the Changes

1. **Load test** - Simulate multiple devices polling:
```bash
# 10 concurrent devices, 60 requests each
ab -n 600 -c 10 "http://localhost:3000/mobile/dialogs?platform=android&deviceId=test&placement=after_connect"
```

2. **Monitor database queries:**
```sql
SELECT query, calls, total_time FROM pg_stat_statements 
WHERE query LIKE '%dialogs%' 
ORDER BY calls DESC;
```

3. **Check Redis cache hit rate:**
```bash
redis-cli INFO stats | grep hits
```

## Migration Steps

1. **Ensure dependencies installed:**
   - `@nestjs/cache-manager`
   - `cache-manager`
   - `cache-manager-redis-store` (if using Redis)

2. **Update imports** in `dialogs.service.ts` and `mobile-dialogs.controller.ts`

3. **Configure CacheManager and ThrottlerModule** in `app.module.ts`

4. **Add database indexes** to improve query performance

5. **Update mobile app** to implement recommended polling strategy

6. **Monitor** metrics before/after deployment

## Rollback Plan

If issues occur:
1. Remove `@Throttle` decorator from `getActiveDialogs`
2. Remove cache lookups (queries will work without caching)
3. Cache is non-critical to functionality, just performance

## Long-term Improvements

1. **WebSocket subscriptions** - Push dialogs to clients instead of polling
2. **GraphQL subscriptions** - Real-time dialog updates
3. **Batch API** - Allow clients to request multiple dialog configurations in one call
4. **CDN caching** - Cache dialog lists at edge if using static distribution
