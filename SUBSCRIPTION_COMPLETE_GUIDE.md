# FlyVPN Subscription System - Complete Implementation Guide

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [What Was Built](#what-was-built)
3. [Architecture](#architecture)
4. [Installation & Setup](#installation--setup)
5. [API Endpoints](#api-endpoints)
6. [Telegram Admin Commands](#telegram-admin-commands)
7. [Database Schema](#database-schema)
8. [Deployment](#deployment)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## System Overview

A complete **subscription and billing system** for FlyVPN that allows users to:

✅ Purchase VPN subscriptions (Free, Monthly, Quarterly, Annual)
✅ Track remaining days until expiration
✅ Monitor monthly data usage
✅ Access premium features based on subscription tier
✅ Enable/disable auto-renewal
✅ View payment and subscription history

**Admin capabilities:**
✅ Create and manage subscription plans
✅ View system-wide analytics and revenue metrics
✅ Extend/upgrade/suspend user subscriptions
✅ Process refunds
✅ Monitor expiring subscriptions
✅ Manage subscriptions via Telegram bot

---

## What Was Built

### 1. **Database Layer** (5 migrations + schema)
- `subscription_plans` - Define plan tiers
- `user_subscriptions` - Track user subscriptions
- `payments` - Transaction history
- `subscription_history` - Audit trail
- `usage_tracking` - Data consumption per cycle
- Modified `users` table with subscription columns

### 2. **Backend Services** (4 services + 1 job service)
- `SubscriptionsService` - Core subscription logic
- `PaymentService` - Stripe integration & payment processing
- `UsageService` - Data usage tracking & limits
- `NotificationService` - Template for email/push notifications
- `SubscriptionJobService` - Background job orchestration

### 3. **API Controllers** (2 controllers)
- `SubscriptionsController` - User endpoints (15+ routes)
- `SubscriptionsAdminController` - Admin endpoints (20+ routes)

### 4. **Guards & Decorators**
- `SubscriptionGuard` - Check active subscription
- `FeatureAccessGuard` - Enforce feature access by plan
- `DeviceLimitGuard` - Enforce device concurrency limits
- `@RequireFeature()` - Decorator for endpoints

### 5. **Telegram Integration**
- `SubscriptionAdminCommandsService` - 15+ Telegram commands
- Real-time subscription management from Telegram

### 6. **Background Jobs** (6 scheduled jobs)
- Check expiring subscriptions (daily @ 2 AM)
- Process auto-renewals (daily @ 3 AM)
- Suspend expired subscriptions (hourly)
- Reset monthly usage (monthly @ midnight)
- Send usage warnings (every 6 hours)
- Retry failed payments (daily @ 1 AM)

### 7. **Data Models** (5 TypeORM entities)
- `SubscriptionPlan` - Plan definitions
- `UserSubscription` - User subscription records
- `Payment` - Transaction records
- `SubscriptionHistory` - Audit trail
- `UsageTracking` - Data usage cycles

### 8. **DTOs & Validation**
- `CreatePlanDto` - Plan creation validation
- `PurchaseSubscriptionDto` - Purchase validation
- Query parameter DTOs for pagination & filtering

---

## Architecture

```
┌─────────────────────────────────────────────┐
│           Mobile App / Web UI               │
├─────────────────────────────────────────────┤
│         User Subscription Endpoints         │
│  GET /subscriptions/my-plan                 │
│  POST /subscriptions/purchase               │
│  GET /subscriptions/usage/current           │
├─────────────────────────────────────────────┤
│      SubscriptionsService + Guards          │
│  • Subscription logic                       │
│  • Feature access control                   │
│  • Usage tracking                           │
├─────────────────────────────────────────────┤
│        Payment Service (Stripe)             │
│  • Process payments                         │
│  • Handle refunds                           │
│  • Transaction logging                      │
├─────────────────────────────────────────────┤
│      Background Jobs (BullMQ + Redis)       │
│  • Auto-renewal processor                   │
│  • Expiration checker                       │
│  • Usage reset                              │
├─────────────────────────────────────────────┤
│       PostgreSQL Database                   │
│  • Plans, Subscriptions, Payments           │
│  • Usage tracking, History                  │
├─────────────────────────────────────────────┤
│    Telegram Admin Bot                       │
│  • Subscription management                  │
│  • Real-time analytics                      │
└─────────────────────────────────────────────┘
```

---

## Installation & Setup

### 1. Prerequisites
```bash
Node.js 16+
PostgreSQL 12+
Redis 6+
Stripe account
Telegram bot token
```

### 2. Database Setup

```bash
# Run migrations in order
psql -U flyvpn_user -d flyvpn < database/migrations/019_create_subscription_plans.sql
psql -U flyvpn_user -d flyvpn < database/migrations/020_create_user_subscriptions.sql
psql -U flyvpn_user -d flyvpn < database/migrations/021_create_payments.sql
psql -U flyvpn_user -d flyvpn < database/migrations/022_create_subscription_history.sql
psql -U flyvpn_user -d flyvpn < database/migrations/023_create_usage_tracking.sql
psql -U flyvpn_user -d flyvpn < database/migrations/024_modify_users_add_subscription_columns.sql
```

### 3. Environment Configuration

Add to `.env`:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Telegram (for admin commands)
TELEGRAM_ADMIN_BOT_TOKEN=your_bot_token
TELEGRAM_ADMIN_BOT_ENABLED=true
TELEGRAM_ADMIN_CHAT_IDS=123456789,987654321
```

### 4. Register Module

In `src/app.module.ts`:

```typescript
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';

@Module({
  imports: [
    // ... existing imports ...
    SubscriptionsModule,
    BullModule.forRoot({ connection: { ... } }),
  ],
})
export class AppModule {}
```

### 5. Start Application

```bash
npm run start
# or
npm run start:dev
```

Default plans will be seeded automatically.

---

## API Endpoints

### User Endpoints

**Authentication:** All require JWT token in `Authorization: Bearer <token>`

#### Subscription Info
```
GET  /subscriptions/plans              → List available plans
GET  /subscriptions/my-plan            → Current subscription details
GET  /subscriptions/usage/current      → Data usage this month
```

#### Purchase & Management
```
POST /subscriptions/purchase           → Buy new subscription
POST /subscriptions/upgrade            → Upgrade to higher tier
POST /subscriptions/extend             → Add more days
POST /subscriptions/cancel             → Cancel subscription
POST /subscriptions/renew              → Manual renewal
POST /subscriptions/toggle-auto-renewal → Enable/disable auto-renew
```

#### History & Payments
```
GET  /subscriptions/history            → View subscription changes
GET  /subscriptions/payments           → View transactions
POST /subscriptions/validate           → Verify subscription status
```

### Admin Endpoints

**Authentication:** Requires JWT token + Admin role

#### Plan Management
```
POST /admin/subscriptions/plans        → Create new plan
GET  /admin/subscriptions/plans        → List all plans
GET  /admin/subscriptions/plans/:id    → Get plan details
PUT  /admin/subscriptions/plans/:id    → Update plan
DELETE /admin/subscriptions/plans/:id  → Deactivate plan
```

#### User Management
```
GET  /admin/subscriptions/users/:userId     → View user subscription
POST /admin/subscriptions/users/:userId/extend      → Extend subscription
POST /admin/subscriptions/users/:userId/suspend     → Suspend subscription
POST /admin/subscriptions/users/:userId/reactivate → Reactivate subscription
```

#### Payments & Refunds
```
GET  /admin/subscriptions/payments           → List payments
GET  /admin/subscriptions/payments/:id       → Get payment details
POST /admin/subscriptions/payments/:id/refund     → Refund payment
POST /admin/subscriptions/payments/:id/mark-completed → Manually approve
```

#### Analytics
```
GET  /admin/subscriptions/stats         → System statistics
GET  /admin/subscriptions/expiring-soon → Subscriptions expiring soon
GET  /admin/subscriptions/usage/top-consumers     → Top data users
GET  /admin/subscriptions/usage/near-limit       → Users near limits
```

---

## Telegram Admin Commands

### Command Structure
```
/sub<command> [arguments]
```

### Available Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `/subhelp` | `/subhelp` | Show all commands |
| `/subplans` | `/subplans` | List plans |
| `/subplan` | `/subplan <id>` | View plan |
| `/subplanactive` | `/subplanactive <id>` | Toggle active |
| `/subsuser` | `/subsuser <id/email>` | View user sub |
| `/subsextend` | `/subsextend <id> <days>` | Add days |
| `/subsupgrade` | `/subsupgrade <id> <plan>` | Upgrade user |
| `/subssuspend` | `/subssuspend <id>` | Suspend |
| `/subsreactivate` | `/subsreactivate <id>` | Reactivate |
| `/subspayments` | `/subspayments <days>` | Payment stats |
| `/subrefund` | `/subrefund <id> [amount]` | Refund |
| `/subsstats` | `/subsstats` | System stats |
| `/subsexpiring` | `/subsexpiring [days]` | Expiring soon |
| `/subsrevenue` | `/subsrevenue <days>` | Revenue report |
| `/subsusage` | `/subsusage` | Usage stats |

### Example Usage
```
/subsuser john@example.com
→ Shows: Plan, Expiry date, Days remaining, Auto-renewal status

/subsextend 123e4567-e89b-12d3-a456-426614174000 30
→ Extends subscription by 30 days

/subsexpiring 7
→ Lists all subscriptions expiring in next 7 days

/subsstats
→ Shows: Active subs, Revenue (MRR/ARR), Breakdown by plan
```

---

## Database Schema

### subscription_plans
```
id              UUID (PK)
name            VARCHAR (unique)
description     TEXT
duration_days   INT (NULL for free/unlimited)
price           DECIMAL(10,2)
data_limit_gb   BIGINT (NULL for unlimited)
max_devices     INT
features        JSONB array
display_order   INT
is_active       BOOLEAN
createdAt       TIMESTAMP
updatedAt       TIMESTAMP
```

### user_subscriptions
```
id                          UUID (PK)
userId                      UUID (FK to users, unique)
planId                      UUID (FK to subscription_plans)
status                      VARCHAR (active/expired/cancelled/suspended)
startDate                   TIMESTAMP
expiryDate                  TIMESTAMP
renewalDate                 TIMESTAMP
isAutoRenewal              BOOLEAN
failedRenewalAttempts      INT
metadata                    JSONB
createdAt                   TIMESTAMP
updatedAt                   TIMESTAMP
```

### payments
```
id                  UUID (PK)
userId              UUID (FK)
subscriptionId      UUID (FK, nullable)
planId              UUID (FK)
amount              DECIMAL(10,2)
currency            VARCHAR(3)
payment_method      VARCHAR (stripe/paypal/crypto/gift_code)
status              VARCHAR (pending/completed/failed/refunded)
transactionId       VARCHAR (unique, nullable)
failureReason       VARCHAR (nullable)
refundAmount        DECIMAL(10,2) (nullable)
refundedAt          TIMESTAMP (nullable)
metadata            JSONB
createdAt           TIMESTAMP
updatedAt           TIMESTAMP
```

### subscription_history
```
id                  UUID (PK)
userId              UUID (FK)
planId              UUID (FK)
previousPlanId      UUID (FK, nullable)
action              VARCHAR (purchased/upgraded/renewed/etc)
startDate           TIMESTAMP
expiryDate          TIMESTAMP
oldExpiryDate       TIMESTAMP (nullable)
reason              VARCHAR (user_request/admin_action/auto_renewal)
notes               TEXT
createdByUserId     UUID (FK, nullable)
paymentId           UUID (FK, nullable)
createdAt           TIMESTAMP
```

### usage_tracking
```
id                  UUID (PK)
userId              UUID (FK)
cycleStartDate      TIMESTAMP
cycleEndDate        TIMESTAMP
dataUsedBytes       BIGINT
dataLimitBytes      BIGINT (nullable)
devicesUsed         INT
maxDevices          INT (nullable)
isLimitExceeded     BOOLEAN
warningsSent        INT
lastWarningAt       TIMESTAMP
lastUsageAt         TIMESTAMP
createdAt           TIMESTAMP
updatedAt           TIMESTAMP
```

### users (modified)
```
Added columns:
- subscriptionStatus        VARCHAR
- currentPlanId             UUID (FK)
- subscriptionExpiryDate    TIMESTAMP
- daysRemaining             INT
- dataUsedThisMonth         BIGINT
- maxDataPerMonth           BIGINT
- maxConcurrentDevices      INT
- lastSubscriptionCheckAt   TIMESTAMP
```

---

## Deployment

### 1. Pre-Deployment Checklist

- [ ] All migrations ran successfully
- [ ] Redis running and accessible
- [ ] Stripe account live (not test mode)
- [ ] Environment variables configured
- [ ] Database backups enabled
- [ ] Telegram bot token valid
- [ ] HTTPS enabled for all URLs

### 2. Production Environment Variables

```bash
NODE_ENV=production
LOG_LEVEL=info
FRONTEND_URL=https://app.flyvpn.com
BACKEND_URL=https://api.flyvpn.com

# Stripe (LIVE keys, not test)
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Redis with password
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=strong_password

# Error tracking
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

### 3. Deployment Steps

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install

# 3. Run migrations
npm run typeorm migration:run

# 4. Build
npm run build

# 5. Start with PM2 or Docker
pm2 start dist/main.js --name "flyvpn-api"
# or
docker-compose up -d
```

### 4. Monitoring

Monitor these metrics:
- Background job queue health
- Payment success rate
- Database query performance
- Error rates
- Revenue metrics

---

## Testing

### Unit Tests

```bash
# Run subscription service tests
npm test -- subscriptions.service.spec.ts

# Run payment service tests
npm test -- payment.service.spec.ts

# Run usage service tests
npm test -- usage.service.spec.ts
```

### Integration Tests

```bash
# Test full purchase flow
npm test -- subscriptions.controller.spec.ts

# Test admin endpoints
npm test -- subscriptions-admin.controller.spec.ts
```

### Load Testing

```bash
# Simulate concurrent purchases
artillery quick --count 100 --num 10 POST /subscriptions/purchase

# Monitor background jobs
npm run test:jobs
```

### Manual Testing

1. **Create Test Plan**
   ```
   POST /admin/subscriptions/plans
   {
     "name": "Test Plan",
     "price": 9.99,
     "durationDays": 30,
     "maxDevices": 3,
     "features": ["premium_vpn"]
   }
   ```

2. **Purchase Subscription**
   ```
   POST /subscriptions/purchase
   {
     "planId": "<plan-id>",
     "paymentMethod": "stripe",
     "paymentDetails": { "tokenId": "tok_visa" }
   }
   ```

3. **Check Subscription**
   ```
   GET /subscriptions/my-plan
   ```

4. **Via Telegram**
   ```
   /subsplans
   /subsuser <user-id>
   /subsstats
   ```

---

## Troubleshooting

### Payment Processing Fails

**Issue:** "Payment failed: Stripe charge failed"

**Solutions:**
1. Check Stripe API key is correct
2. Verify amount is valid (>0)
3. Check test card in test mode: `4242 4242 4242 4242`
4. Review Stripe dashboard for errors

### Background Jobs Not Running

**Issue:** Auto-renewals not processing

**Solutions:**
1. Verify Redis running: `redis-cli ping`
2. Check BullMQ logs
3. Restart application: `npm run start:dev`
4. Check job queue: `GET subscription-jobs:*` in Redis

### Subscription Not Activating

**Issue:** Payment successful but subscription not created

**Solutions:**
1. Check database connection
2. Verify subscription_plans table has data
3. Check payment status is "completed"
4. Review application logs for errors

### Telegram Commands Not Working

**Issue:** "Not authorized" error

**Solutions:**
1. Get your Telegram ID from [@userinfobot](https://t.me/userinfobot)
2. Add to `TELEGRAM_ADMIN_CHAT_IDS` in `.env`
3. Restart application
4. Check bot token is correct

### Data Usage Not Resetting

**Issue:** Monthly data not resetting

**Solutions:**
1. Check background job is running
2. Verify Redis connection
3. Check usage_tracking table for cycles
4. Manually trigger: `/subsusage` or `POST /admin/subscriptions/usage/reset-all`

---

## Next Steps

### Immediate (This Week)

1. ✅ Deploy subscriptions module
2. ✅ Seed default plans
3. ✅ Test payment flow with Stripe test keys
4. ✅ Integrate Telegram admin commands

### Short Term (Next 2 Weeks)

1. Implement email notifications
2. Add push notifications for mobile
3. Create subscription settings UI
4. Set up monitoring & alerts
5. Create admin dashboard

### Medium Term (Next Month)

1. Add promo codes / coupons
2. Implement referral rewards
3. Add family plans
4. Create analytics dashboard
5. Set up A/B testing

### Long Term (Next Quarter)

1. Multi-currency support
2. Regional tax calculation
3. Enterprise billing
4. Advanced analytics
5. API for third-party integrations

---

## File Structure

```
backend/
├── database/migrations/
│   ├── 019_create_subscription_plans.sql
│   ├── 020_create_user_subscriptions.sql
│   ├── 021_create_payments.sql
│   ├── 022_create_subscription_history.sql
│   ├── 023_create_usage_tracking.sql
│   └── 024_modify_users_add_subscription_columns.sql
├── src/modules/subscriptions/
│   ├── entities/
│   │   ├── subscription-plan.entity.ts
│   │   ├── user-subscription.entity.ts
│   │   ├── payment.entity.ts
│   │   ├── subscription-history.entity.ts
│   │   └── usage-tracking.entity.ts
│   ├── services/
│   │   ├── subscriptions.service.ts
│   │   ├── payment.service.ts
│   │   ├── usage.service.ts
│   │   ├── notification.service.ts
│   │   └── subscription-job.service.ts
│   ├── guards/
│   │   ├── subscription.guard.ts
│   │   ├── feature-access.guard.ts
│   │   └── device-limit.guard.ts
│   ├── decorators/
│   │   └── require-feature.decorator.ts
│   ├── jobs/
│   │   └── subscription.processor.ts
│   ├── seeds/
│   │   └── subscription-plans.seed.ts
│   ├── telegram/
│   │   ├── subscription-admin-commands.service.ts
│   │   └── subscription-telegram.module.ts
│   ├── dto/
│   │   ├── create-plan.dto.ts
│   │   ├── purchase-subscription.dto.ts
│   │   └── query-params.dto.ts
│   ├── subscriptions.module.ts
│   ├── subscriptions.controller.ts
│   └── subscriptions-admin.controller.ts
├── SUBSCRIPTION_SYSTEM_SPEC.md
├── SUBSCRIPTION_IMPLEMENTATION_PLAN.md
├── SUBSCRIPTION_QUICK_REFERENCE.md
├── SUBSCRIPTION_ENV_CONFIG.md
├── SUBSCRIPTION_TELEGRAM_ADMIN.md
├── TELEGRAM_BOT_INTEGRATION_GUIDE.md
└── SUBSCRIPTION_COMPLETE_GUIDE.md
```

---

## Support & Maintenance

### Logging

```bash
# View subscription logs
tail -f logs/subscription.log

# View payment processing
grep "Payment" logs/*.log

# View background jobs
grep "JOB" logs/*.log

# View errors
grep "ERROR" logs/*.log
```

### Monitoring

Track these KPIs:
- Monthly Recurring Revenue (MRR)
- Annual Recurring Revenue (ARR)
- Churn rate
- Payment success rate
- Average Revenue Per User (ARPU)
- Customer Lifetime Value (CLV)

### Backups

- Database: Daily automated backups
- Redis: Persistence enabled (RDB/AOF)
- Stripe: All data synced with webhooks

---

## Contact & Support

For questions, issues, or feature requests:

1. Check relevant documentation in `SUBSCRIPTION_*.md`
2. Review application logs for errors
3. Check Stripe/Telegram API status
4. Contact development team

---

**Last Updated:** August 2024
**Status:** Production Ready
**Version:** 1.0.0
