# Subscription System - Installation & Deployment Guide

## Overview

This guide walks you through setting up and deploying the complete subscription system for FlyVPN.

---

## Phase 1: Pre-Installation Setup

### 1.1 Install Required Dependencies

```bash
# Add Stripe package
npm install stripe

# Add BullMQ for background jobs
npm install @nestjs/bullmq bullmq

# Add email notifications (optional)
npm install nodemailer @nestjs/mailer

# Add date utilities
npm install date-fns

# If not already installed - decimal for precise money calculations
npm install decimal.js
```

### 1.2 Verify Environment

```bash
# Check Node version (should be 16+)
node --version

# Check npm version
npm --version

# Check PostgreSQL is running
psql --version

# Verify Redis installation (for background jobs)
redis-cli --version
```

---

## Phase 2: Database Setup

### 2.1 Run Migrations

Execute the database migration files in order:

```bash
# Connect to your PostgreSQL database
psql -U your_db_user -d your_db_name

# Run migration files in sequence
\i database/migrations/019_create_subscription_plans.sql
\i database/migrations/020_create_user_subscriptions.sql
\i database/migrations/021_create_payments.sql
\i database/migrations/022_create_subscription_history.sql
\i database/migrations/023_create_usage_tracking.sql
\i database/migrations/024_modify_users_add_subscription_columns.sql

# Exit psql
\q
```

Or using TypeORM (if configured):

```bash
npm run typeorm migration:run
```

### 2.2 Verify Database Setup

```bash
# Connect to database
psql -U your_db_user -d your_db_name

# Check tables were created
\dt

# Should see:
# - subscription_plans
# - user_subscriptions
# - payments
# - subscription_history
# - usage_tracking
# - (users - modified)

# Check views were created
\dv

# Should see:
# - payment_stats
# - user_subscription_timeline
# - subscription_churn_analysis
# - user_subscription_summary
# - subscription_expiration_alerts
# - current_usage_stats
# - monthly_usage_aggregates
```

---

## Phase 3: Environment Configuration

### 3.1 Update .env File

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add:
```

**Add these to your `.env`:**

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...  # Get from Stripe dashboard
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Redis Configuration (for background jobs)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@flyvpn.com

# Application URLs
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001
```

### 3.2 Generate Stripe Test Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Switch to **Test Mode** (toggle at top)
3. Go to **Developers > API Keys**
4. Copy **Secret Key** and **Publishable Key**
5. Paste into `.env` file

### 3.3 Create Stripe Webhook

```bash
# Using Stripe CLI (recommended for testing)
# Download from https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward events to local endpoint
stripe listen --forward-to localhost:3001/webhooks/stripe

# Will display webhook signing secret
# Copy and add to .env as STRIPE_WEBHOOK_SECRET
```

---

## Phase 4: Application Build & Startup

### 4.1 Build Application

```bash
# Clean previous build
rm -rf dist/

# Build TypeScript
npm run build

# Or in development mode
npm run start:dev
```

### 4.2 Start Redis (for background jobs)

```bash
# Option 1: Using Docker
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Option 2: Using Homebrew (macOS)
brew services start redis

# Option 3: Using system service (Linux)
sudo systemctl start redis-server

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

### 4.3 Start Application

```bash
# Development mode (with hot reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod

# Or using PM2
pm2 start "npm run start:prod" --name flyvpn-api
pm2 save
```

### 4.4 Verify Application Started

```bash
# Check API is running
curl http://localhost:3001/health

# Should return: {"status":"ok"}

# Check subscriptions endpoint
curl http://localhost:3001/subscriptions/plans

# Should return list of plans
```

---

## Phase 5: Initialize Data

### 5.1 Default Plans Auto-Seeded

When the application starts, it automatically creates default plans:

✅ **Free** - $0, 500GB/month, 1 device
✅ **Monthly** - $4.99, unlimited data, 3 devices
✅ **Quarterly** - $12.99, unlimited data, 5 devices  
✅ **Annual** - $39.99, unlimited data, 10 devices

Verify in database:

```bash
psql -U your_db_user -d your_db_name

SELECT id, name, price, duration_days, max_devices FROM subscription_plans;
```

Should show 4 plans.

### 5.2 Test with Sample User

```bash
# Create test user
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "username": "testuser"
  }'

# Response will include JWT token
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {...}
}

# Save token for next requests
TOKEN="eyJhbGciOiJIUzI1NiIs..."
```

### 5.3 Test Subscription Purchase (using Stripe test card)

```bash
# Get available plans
curl http://localhost:3001/subscriptions/plans

# Purchase Monthly plan (with test card)
curl -X POST http://localhost:3001/subscriptions/purchase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "planId": "<monthly-plan-id>",
    "paymentMethod": "stripe",
    "paymentDetails": {
      "tokenId": "tok_visa"  # Stripe test card token
    },
    "autoRenewal": true
  }'

# Should return subscription details
```

---

## Phase 6: Background Jobs Setup

### 6.1 Enable Scheduled Jobs

Jobs run automatically on schedule:

- **Every day @ 2 AM**: Check expiring subscriptions (send reminders)
- **Every day @ 3 AM**: Process auto-renewals
- **Every hour**: Suspend expired subscriptions
- **Monthly @ midnight**: Reset data usage cycles
- **Every 6 hours**: Send data usage warnings
- **Every day @ 1 AM**: Retry failed payments

No additional setup needed - jobs configured in `SubscriptionJobService`.

### 6.2 Verify Jobs Running

Monitor job queue:

```bash
# Check Redis queue (if using Redis Commander)
docker run -d -p 8081:8081 -e REDIS_HOSTS=local:redis:6379 rediscommander/redis-commander

# Or check via CLI
redis-cli
> KEYS subscription-jobs:*
> KEYS notification:*

# Should show job queues
```

---

## Phase 7: Testing

### 7.1 Manual API Testing

```bash
# Test get current subscription
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/subscriptions/my-plan

# Test usage tracking
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/subscriptions/usage/current

# Test admin stats (need admin user)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/admin/subscriptions/stats
```

### 7.2 Payment Testing

Use Stripe test cards:

| Card | Result |
|------|--------|
| 4242 4242 4242 4242 | ✅ Success |
| 4000 0000 0000 0002 | ❌ Decline |
| 4000 0000 0000 0010 | ⚠️ CVC Error |

### 7.3 Unit Tests (if implemented)

```bash
npm run test -- subscriptions

# With coverage
npm run test:cov -- subscriptions
```

---

## Phase 8: Production Deployment

### 8.1 Pre-Deployment Checklist

- [ ] Switch Stripe to **Live Mode**
- [ ] Update STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY with live keys
- [ ] Update all URLs to production domain
- [ ] Configure email with production SMTP
- [ ] Set up Redis with password and persistence
- [ ] Enable HTTPS (SSL/TLS)
- [ ] Configure database backups
- [ ] Set up error tracking (Sentry, Datadog, etc.)
- [ ] Configure monitoring and alerts
- [ ] Review security settings
- [ ] Load test the system

### 8.2 Environment for Production

```bash
# .env for production
NODE_ENV=production
DEBUG=false
LOG_LEVEL=info

# Production database
DB_HOST=prod-db.example.com
DB_PORT=5432

# Production Redis
REDIS_HOST=prod-redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=strong-password-here

# Live Stripe keys
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx

# Production URLs
FRONTEND_URL=https://app.flyvpn.com
BACKEND_URL=https://api.flyvpn.com
```

### 8.3 Deploy to Server

```bash
# Using Docker (recommended)
docker build -t flyvpn-api .
docker run -d \
  -e NODE_ENV=production \
  -e STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY \
  -p 3001:3001 \
  flyvpn-api

# Or using PM2
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### 8.4 Verify Production Deployment

```bash
# Check health
curl https://api.flyvpn.com/health

# Test API
curl https://api.flyvpn.com/subscriptions/plans

# Monitor logs
pm2 logs flyvpn-api

# Or Docker logs
docker logs -f <container-id>
```

---

## Phase 9: Monitoring & Maintenance

### 9.1 Set Up Monitoring

Monitor these metrics:

- **Payment success rate** (should be > 95%)
- **Failed renewals** (should be < 5%)
- **Database query performance** (< 100ms p95)
- **Job queue length** (should be < 1000)
- **Subscription expiration rate**
- **Revenue metrics** (MRR, ARR)

### 9.2 Regular Maintenance

```bash
# Weekly: Archive old usage data
curl -X POST https://api.flyvpn.com/admin/subscriptions/usage/archive-old \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 90}'

# Monthly: Review payment failures
curl https://api.flyvpn.com/admin/subscriptions/payments?status=failed

# Quarterly: Review subscription analytics
curl https://api.flyvpn.com/admin/subscriptions/stats
```

### 9.3 Backup Strategy

```bash
# Daily backup of database
pg_dump flyvpn > backup_$(date +%Y%m%d).sql

# Store in S3 or backup service
aws s3 cp backup_*.sql s3://your-backup-bucket/
```

---

## Troubleshooting

### Issue: "Stripe API not configured"
**Solution:** Ensure STRIPE_SECRET_KEY is set in .env

### Issue: "Redis connection refused"
**Solution:** 
- Start Redis: `redis-cli ping` should return PONG
- Check REDIS_HOST and REDIS_PORT in .env

### Issue: "Webhook verification failed"
**Solution:**
- Verify STRIPE_WEBHOOK_SECRET is correct
- Check webhook endpoint is publicly accessible
- Verify webhook is configured in Stripe dashboard

### Issue: "Jobs not executing"
**Solution:**
- Ensure Redis is running
- Check job queue: `redis-cli KEYS subscription-jobs:*`
- Monitor logs for job errors

### Issue: "Email not sending"
**Solution:**
- Verify SMTP credentials
- Check email provider allows third-party access
- Review SMTP logs

---

## Next Steps

1. **Implement Email Notifications** - Set up real email templates
2. **Add Frontend UI** - Build subscription management page
3. **Implement Promo Codes** - Create discount system
4. **Add Referral Program** - Implement referral bonuses
5. **Setup Analytics** - Track subscription metrics
6. **Tax Integration** - Calculate tax by region
7. **Multiple Payment Methods** - Add PayPal, crypto support

---

## Support & Documentation

- **Subscription System Spec**: See `SUBSCRIPTION_SYSTEM_SPEC.md`
- **Implementation Plan**: See `SUBSCRIPTION_IMPLEMENTATION_PLAN.md`
- **Quick Reference**: See `SUBSCRIPTION_QUICK_REFERENCE.md`
- **Environment Config**: See `SUBSCRIPTION_ENV_CONFIG.md`

---

## Success! 🎉

Your subscription system is now ready! Users can:
✅ Browse and purchase plans
✅ Track subscription expiration
✅ Monitor data usage
✅ Manage auto-renewal
✅ View payment history
✅ Access premium features

Admins can:
✅ Create and manage plans
✅ View subscription analytics
✅ Process refunds
✅ Monitor revenue metrics
✅ Manage user subscriptions
