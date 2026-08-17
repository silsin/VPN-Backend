# Subscription System - Implementation Roadmap

## Quick Summary

You're adding a **complete monetization layer** to FlyVPN that allows users to:
- ✅ Purchase subscription plans (Monthly, Quarterly, Annual)
- ✅ Track remaining days until expiration
- ✅ Monitor data usage per month
- ✅ Access premium features based on their subscription
- ✅ Auto-renew subscriptions
- ✅ View payment history
- ✅ Upgrade/downgrade plans anytime

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SUBSCRIPTION SYSTEM                      │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
            ┌───────▼──┐ ┌────▼────┐ ┌─▼────────────┐
            │ PLANS    │ │PAYMENTS  │ │ USAGE        │
            │MANAGEMENT│ │PROCESSING│ │TRACKING      │
            └──────────┘ └──────────┘ └──────────────┘
                    │         │              │
                    └─────────┼──────────────┘
                              │
                    ┌─────────▼────────┐
                    │   DATABASE       │
                    │  (5 new tables)  │
                    └──────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │ BACKGROUND JOBS    │
                    │ (6 automated tasks)│
                    └────────────────────┘
```

---

## What Users See (Frontend UX)

### Home Dashboard
```
┌─────────────────────────────────┐
│  YOUR SUBSCRIPTION              │
├─────────────────────────────────┤
│  Plan: Monthly Premium           │
│  Status: ✅ Active              │
│  Days Remaining: 15 days        │
│  Expires: Feb 15, 2024          │
│                                 │
│  Data Usage: 2.5 GB / Unlimited │
│  ▓▓░░░░░░░░░░░░░░░░░░░░ 2%    │
│                                 │
│  Devices: 2 / 3 active          │
│                                 │
│  [Upgrade]  [View Details]      │
│  [Renew]    [Cancel]            │
└─────────────────────────────────┘
```

### Available Plans (Public)
```
┌─────────────────────────────────────────────────┐
│         SELECT YOUR PLAN                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  FREE (Current)    MONTHLY      ANNUAL         │
│  ─────────────     ────────     ──────         │
│  $0/mo             $4.99/mo     $39.99/year   │
│  1 device          3 devices    10 devices    │
│  Limited data      Unlimited    Unlimited     │
│  With ads          Ad-free      Ad-free       │
│                                                 │
│  [Current] [Upgrade] [Best Value!]            │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Database Schema Overview

```sql
subscription_plans
├─ id (UUID)
├─ name
├─ duration_days
├─ price
├─ features[] (JSON array)
└─ max_devices

user_subscriptions
├─ id (UUID)
├─ userId (FK to users)
├─ planId (FK to subscription_plans)
├─ status (active/expired/cancelled)
├─ startDate
├─ expiryDate
├─ renewalDate
└─ isAutoRenewal

payments (transactions)
├─ id (UUID)
├─ userId (FK)
├─ amount
├─ status (pending/completed/failed)
├─ transactionId (Stripe ref)
└─ metadata (JSONB)

subscription_history (audit log)
├─ id (UUID)
├─ userId
├─ planId
├─ action (upgraded/downgraded/renewed)
├─ dates
└─ notes

usage_tracking (data consumption)
├─ id (UUID)
├─ userId
├─ cycleStartDate
├─ cycleEndDate
├─ dataUsedBytes
└─ devicesUsed

users (modifications)
├─ +subscriptionStatus
├─ +subscriptionExpiryDate
├─ +daysRemaining
├─ +dataUsedThisMonth
└─ +maxConcurrentDevices
```

---

## Key Features & What They Enable

### 1. Subscription Plans
**What it does:** Define different tiers (Free, Monthly, Quarterly, Annual)

**What users get:**
- Choose from multiple options
- Understand pricing upfront
- See feature differences clearly
- Know data limits & device limits

**Admin benefits:**
- Create/edit/deactivate plans
- A/B test pricing
- Launch seasonal promotions
- Track which plans are popular

---

### 2. Purchase & Payments
**What it does:** Process payments securely via Stripe

**What users get:**
- One-click purchase
- Multiple payment methods
- Automatic subscription activation
- Instant email confirmation
- Receipt & invoice

**Admin benefits:**
- View all transactions
- Detect fraud
- Process refunds
- Reconcile payments

---

### 3. Usage Tracking
**What it does:** Monitor data consumed by user per billing cycle

**What users get:**
- Real-time data usage display
- Monthly reset
- Warning at 80% usage
- Upgrade suggestions when near limit
- Historical usage reports

**Admin benefits:**
- Identify heavy users
- Plan capacity
- Enforce fair usage policies

---

### 4. Feature Access Control
**What it does:** Enable/disable features based on subscription

**Features by tier:**
```
Feature                 Free    Monthly Quarterly Annual
─────────────────────────────────────────────────────
Basic VPN              ✅      ✅      ✅       ✅
Premium Servers        ❌      ✅      ✅       ✅
Ad-Free Experience     ❌      ✅      ✅       ✅
Priority Support       ❌      ✅      ✅       ✅
Static IP              ❌      ❌      ❌       ✅
Multi-Device           ❌      ✅      ✅       ✅
Data Limit             500GB   ∞       ∞        ∞
Max Devices            1       3       5        10
```

---

### 5. Auto-Renewal & Notifications
**What it does:** Automatically renew expiring subscriptions, send reminders

**What users get:**
- Seamless auto-renewal (optional)
- 7-day expiration reminders
- 1-day warning emails
- Renewal confirmation receipts
- Easy cancellation option

**Admin benefits:**
- Higher retention rates
- Predictable recurring revenue
- Automated billing
- Churn reduction

---

### 6. Admin Control & Analytics
**What it does:** Provide insights & management tools for admins

**Admin sees:**
```
Dashboard Stats:
├─ Total Active Subscriptions
├─ Monthly Recurring Revenue (MRR)
├─ Annual Recurring Revenue (ARR)
├─ Churn Rate
├─ Subscription breakdown by plan
├─ Payment success rate
└─ Expiring subscriptions (next 7 days)

Actions:
├─ Manually extend subscriptions
├─ Issue refunds
├─ Disable auto-renewal
├─ Force status changes
└─ View detailed user history
```

---

## Detailed Implementation Timeline

### Phase 1: Database & Foundation (3 days)

**What you'll create:**
- 5 new database tables
- Migration scripts
- Indexes for performance

**Files to create:**
```
database/migrations/
├─ 019_create_subscription_plans.sql
├─ 020_create_user_subscriptions.sql
├─ 021_create_subscription_history.sql
├─ 022_create_payments.sql
├─ 023_create_usage_tracking.sql
└─ 024_modify_users_add_subscription_columns.sql
```

**Backend modules:**
```
src/modules/subscriptions/
├─ subscriptions.module.ts
├─ subscriptions.controller.ts
├─ subscriptions.service.ts
├─ entities/
│  └─ subscription.entity.ts
└─ dto/
   ├─ create-subscription.dto.ts
   └─ purchase-subscription.dto.ts
```

---

### Phase 2: Plans Management (2 days)

**Admin Endpoints:**
```
POST   /admin/subscription-plans       → Create plan
GET    /admin/subscription-plans       → List all plans
GET    /admin/subscription-plans/:id   → Get plan details
PUT    /admin/subscription-plans/:id   → Update plan
DELETE /admin/subscription-plans/:id   → Deactivate plan
```

**User Endpoints:**
```
GET /subscriptions/plans               → Get public plans list
```

**What it does:**
- Admin can create Monthly ($4.99), Quarterly ($12.99), Annual ($39.99)
- Each plan defines duration, price, features, max devices
- Plans are cacheable (rarely change)
- Can mark plans as inactive without deleting

---

### Phase 3: Subscription Purchase (3 days)

**Integration:** Stripe payment gateway

**Endpoints:**
```
POST /subscriptions/purchase           → Buy new subscription
POST /subscriptions/extend             → Extend without changing plan
POST /subscriptions/upgrade            → Switch to higher tier
POST /subscriptions/cancel             → Cancel subscription
```

**Flow:**
```
User clicks "Upgrade" 
   ↓
Select plan & payment method
   ↓
Call /subscriptions/purchase
   ↓
Backend creates Stripe payment intent
   ↓
Frontend redirects to Stripe checkout
   ↓
User confirms payment
   ↓
Webhook receives payment.succeeded
   ↓
Backend creates user_subscription record
   ↓
User sees "✅ Subscription Active!"
```

**Security:**
- Never store card data (Stripe handles it)
- Verify payment amounts server-side
- Use HTTPS only
- Rate limit payment endpoints

---

### Phase 4: User Subscription Management (2 days)

**Endpoints:**
```
GET  /subscriptions/my-plan            → Current subscription details
GET  /subscriptions/usage/current      → Data usage this month
GET  /subscriptions/history            → All past subscriptions
GET  /subscriptions/payments           → Transaction history
POST /subscriptions/toggle-auto-renewal → Enable/disable auto-renew
POST /subscriptions/renew              → Manual renewal
```

**What user sees:**
```
Current Plan Details:
├─ Plan Name & Price
├─ Days Until Expiration (countdown)
├─ Auto-Renewal Status (toggle on/off)
├─ Next Payment Date
├─ Used Data / Total Data
├─ Active Devices / Max Devices
└─ Quick Actions [Upgrade] [Renew] [Cancel]
```

---

### Phase 5: Background Jobs & Automation (3 days)

**6 Critical Background Jobs:**

1. **Daily: Check Expiring Subscriptions**
   ```
   Runs at: 2 AM every day
   Finds: Subscriptions expiring in next 48 hours
   Actions:
   ├─ Send "Expiring Soon" email (7 days before)
   ├─ Process auto-renewal if enabled
   └─ Update subscription status
   ```

2. **Daily: Process Auto-Renewals**
   ```
   Runs at: 3 AM every day
   Finds: Subscriptions with auto_renewal=true that are expiring today
   Actions:
   ├─ Charge user with saved payment method
   ├─ Create new subscription record
   ├─ Log transaction
   ├─ Send receipt email
   └─ If payment fails:
       ├─ Retry 2 more times (daily)
       └─ After 3 failures: suspend account & notify user
   ```

3. **Hourly: Suspend Expired Subscriptions**
   ```
   Runs: Every hour
   Finds: Subscriptions where expiryDate < NOW
   Actions:
   ├─ Change status to 'expired'
   ├─ Limit user to free tier features
   ├─ Block premium server access
   └─ Send "Subscription Expired" notification
   ```

4. **Daily: Reset Monthly Usage**
   ```
   Runs at: Midnight every month
   Actions:
   ├─ Reset dataUsedThisMonth = 0 for all users
   ├─ Close previous usage_tracking cycle
   ├─ Create new usage_tracking record
   └─ Log cycle transition
   ```

5. **Every 6 hours: Send Usage Warnings**
   ```
   Finds: Users at 80% or more of data limit
   Actions:
   ├─ Send "Data Usage Warning" notification
   ├─ Suggest upgrade option
   └─ Show alternative plans
   ```

6. **Daily: Retry Failed Payments**
   ```
   Runs at: 1 AM every day
   Finds: Failed payments with retry_count < 3
   Actions:
   ├─ Attempt charge again
   ├─ If successful: create subscription
   ├─ If failed: increment retry_count
   └─ After 3 failures: disable auto-renewal & notify user
   ```

**Technology Stack:**
- BullMQ for job queue
- Redis for job storage & processing
- Cron scheduling for timing

---

### Phase 6: Feature Access Control (2 days)

**Guards to implement:**
```
@UseGuards(SubscriptionGuard)
@RequireFeature('premium_vpn')
async connectToPremiumServer() { ... }

@UseGuards(SubscriptionGuard)
@RequireFeature('ad_free')
async getAdsForUser() { ... }

@UseGuards(DeviceLimitGuard)
async connectDevice() { ... }
```

**What it does:**
- Check user's subscription status
- Verify expiration date
- Check if feature is included in plan
- Enforce device limits
- Enforce data limits

---

### Phase 7: Admin Dashboard & Analytics (2 days)

**Admin Endpoints:**
```
GET /admin/subscriptions/stats         → Key metrics
GET /admin/subscriptions/expiring-soon → Expiring subscriptions
GET /admin/subscriptions/:userId       → User subscription details
POST /admin/subscriptions/:userId/extend → Manually extend
POST /admin/subscriptions/:userId/refund → Issue refund
```

**Metrics shown:**
```
Dashboard:
├─ 🔴 Total Active Subscriptions: 1,250
├─ 💰 Monthly Recurring Revenue: $5,000
├─ 📈 Annual Recurring Revenue: $60,000
├─ 📊 Churn Rate: 5%
├─ 📉 Breakdown by Plan:
│  ├─ Free: 5,000 users
│  ├─ Monthly: 1,000 users
│  ├─ Quarterly: 150 users
│  └─ Annual: 100 users
├─ ✅ Payment Success Rate: 98%
└─ ⏰ Expiring Today: 23 users
```

---

## Step-by-Step Implementation Guide

### Step 1: Create Database Schema (Do First)
```bash
# Create migrations
touch database/migrations/019_create_subscription_plans.sql
touch database/migrations/020_create_user_subscriptions.sql
touch database/migrations/021_create_subscription_history.sql
touch database/migrations/022_create_payments.sql
touch database/migrations/023_create_usage_tracking.sql
touch database/migrations/024_modify_users_add_subscription_columns.sql

# Run migrations
npm run migrate
```

### Step 2: Create Plan Entity & CRUD
```bash
# Generate module
nest g module modules/subscriptions
nest g service modules/subscriptions
nest g controller modules/subscriptions

# Create files
touch src/modules/subscriptions/entities/subscription-plan.entity.ts
touch src/modules/subscriptions/dto/create-plan.dto.ts
touch src/modules/subscriptions/dto/update-plan.dto.ts
```

### Step 3: Implement Purchase Flow
```bash
# Install Stripe
npm install stripe @stripe/stripe-js

# Create payment service
touch src/modules/subscriptions/services/payment.service.ts
touch src/modules/subscriptions/dto/purchase.dto.ts
```

### Step 4: Setup Background Jobs
```bash
# Install job queue
npm install @nestjs/bullmq bull redis

# Create job handlers
touch src/modules/subscriptions/jobs/check-expiry.job.ts
touch src/modules/subscriptions/jobs/auto-renewal.job.ts
touch src/modules/subscriptions/jobs/reset-usage.job.ts
```

### Step 5: Implement Usage Tracking
```bash
# Create service
touch src/modules/subscriptions/services/usage.service.ts
```

### Step 6: Add Guards for Feature Access
```bash
# Create guards
touch src/modules/subscriptions/guards/subscription.guard.ts
touch src/modules/subscriptions/guards/device-limit.guard.ts
```

---

## Testing Checklist

### Unit Tests
- [ ] Plan creation/update/deletion
- [ ] Purchase processing
- [ ] Payment failure handling
- [ ] Auto-renewal logic
- [ ] Data limit enforcement
- [ ] Feature access validation

### Integration Tests
- [ ] End-to-end purchase flow
- [ ] Stripe webhook handling
- [ ] Subscription status transitions
- [ ] Background job execution
- [ ] Email notifications

### Load Tests
- [ ] 100 concurrent purchases
- [ ] Batch renewal processing (1000+ users)
- [ ] Background job queue performance
- [ ] Database query performance

---

## Configuration Needed

### Environment Variables (.env)
```
# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@flyvpn.com
SMTP_PASSWORD=xxxxx

# Redis (for job queue)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT (for payment verification)
JWT_SECRET=xxxxx
JWT_EXPIRES_IN=7d
```

---

## Important Considerations

### Payment Processing
- Use Stripe for payments (PCI compliance handled by them)
- Verify amounts server-side
- Log all transactions
- Handle webhooks securely
- Retry failed payments automatically

### User Experience
- Clear expiration countdown (visual & numerical)
- Easy upgrade/downgrade
- No forced cancellation friction
- Easy refund/cancellation policy
- Transparent billing

### Business Metrics
- Track MRR (Monthly Recurring Revenue)
- Monitor churn rate
- Measure upgrade/downgrade patterns
- Analyze payment failure rates
- Segment users by plan

### Compliance
- GDPR: Allow data export/deletion
- Tax: Calculate tax by location
- Refunds: Clear refund policy
- Terms: Update ToS with billing terms
- PCI: Never store card data

---

## Success Indicators

After implementation, you should see:
- ✅ Users can purchase any plan in < 2 minutes
- ✅ Dashboard shows days remaining (updates daily)
- ✅ Data usage displays correctly
- ✅ Features lock/unlock based on subscription
- ✅ Auto-renewal works seamlessly
- ✅ Admin sees clear revenue metrics
- ✅ Failed payments retry automatically
- ✅ Notifications arrive on time

---

## Estimated Development Time

```
Phase 1 (Database):        3 days (Junior dev can do)
Phase 2 (Plans):           2 days (Junior dev can do)
Phase 3 (Purchase):        3 days (Senior dev, Stripe complexity)
Phase 4 (Management):      2 days (Mid dev)
Phase 5 (Background Jobs): 3 days (Senior dev, async complexity)
Phase 6 (Access Control):  2 days (Mid dev)
Phase 7 (Admin/Analytics): 2 days (Mid dev)
Testing & Polish:          3 days (QA + developers)
─────────────────────────────────────────────────
TOTAL:                     8 weeks (with 1 dev working 40hrs/week)
                           OR 4 weeks (with 2 devs)
                           OR 2 weeks (with 4 devs)
```

---

## Files to Create

### Database Migrations
- `database/migrations/019_*.sql` - Plans table
- `database/migrations/020_*.sql` - Subscriptions table
- `database/migrations/021_*.sql` - History table
- `database/migrations/022_*.sql` - Payments table
- `database/migrations/023_*.sql` - Usage tracking
- `database/migrations/024_*.sql` - Users modifications

### Backend Modules
```
src/modules/subscriptions/
├─ subscriptions.module.ts
├─ subscriptions.controller.ts
├─ subscriptions.service.ts
├─ subscription-admin.controller.ts
├─ entities/
│  ├─ subscription.entity.ts
│  ├─ plan.entity.ts
│  ├─ payment.entity.ts
│  ├─ usage.entity.ts
│  └─ history.entity.ts
├─ dto/
│  ├─ create-plan.dto.ts
│  ├─ purchase.dto.ts
│  ├─ extend.dto.ts
│  ├─ cancel.dto.ts
│  └─ query-params.dto.ts
├─ services/
│  ├─ payment.service.ts
│  ├─ usage.service.ts
│  ├─ notification.service.ts
│  └─ webhook.service.ts
├─ guards/
│  ├─ subscription.guard.ts
│  └─ device-limit.guard.ts
├─ decorators/
│  ├─ require-feature.decorator.ts
│  └─ require-subscription.decorator.ts
├─ jobs/
│  ├─ check-expiry.job.ts
│  ├─ auto-renewal.job.ts
│  ├─ reset-usage.job.ts
│  ├─ suspend-expired.job.ts
│  ├─ usage-warning.job.ts
│  └─ retry-payments.job.ts
└─ strategies/
   └─ subscription-status.strategy.ts
```

---

## Next Steps

1. **Review & Approve** this plan with your team
2. **Start Phase 1** - Database schema
3. **Set up Stripe account** - Get API keys ready
4. **Configure Redis** - For background jobs
5. **Brief team members** - Share this roadmap
6. **Create tickets** - Break down work into sprints
7. **Start coding!**

Good luck! 🚀
