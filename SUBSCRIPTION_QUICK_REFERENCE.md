# Subscription System - Quick Reference for Developers

## What We're Building

A complete **subscription & billing system** that lets users:
1. Buy VPN subscriptions
2. See days remaining
3. Track data usage
4. Access features based on their plan

---

## The Quick Version (TL;DR)

| What | Where | Purpose |
|------|-------|---------|
| **Plans** | `subscription_plans` table | Define what plans exist (Free, Monthly, Annual) |
| **User Subs** | `user_subscriptions` table | Track what plan each user has & when it expires |
| **Payments** | `payments` table | Log all transactions for audit & refunds |
| **Usage** | `usage_tracking` table | Track how much data user consumed this month |
| **History** | `subscription_history` table | Audit log of upgrades/downgrades |

---

## API Endpoints at a Glance

### User Endpoints (Public)
```
GET  /subscriptions/plans                  → Show all available plans
GET  /subscriptions/my-plan                → Show my current subscription
GET  /subscriptions/usage/current          → Show my data usage this month
POST /subscriptions/purchase               → Buy a subscription
POST /subscriptions/upgrade                → Upgrade to better plan
POST /subscriptions/cancel                 → Cancel my subscription
POST /subscriptions/toggle-auto-renewal    → Enable/disable auto-renew
```

### Admin Endpoints
```
POST /admin/subscription-plans             → Create new plan
GET  /admin/subscription-plans             → List all plans
PUT  /admin/subscription-plans/:id         → Edit plan
DELETE /admin/subscription-plans/:id       → Deactivate plan
GET  /admin/subscriptions/stats            → Revenue metrics
GET  /admin/subscriptions/expiring-soon    → Users expiring soon
```

---

## Database Tables (Simple View)

### subscription_plans
```
id | name | duration_days | price | features | max_devices
───┼──────┼───────────────┼───────┼──────────┼────────────
1  | Free | NULL          | 0     | []       | 1
2  | Monthly | 30         | 4.99  | [premium_vpn, ad_free] | 3
3  | Annual | 365         | 39.99 | [all]    | 10
```

### user_subscriptions
```
id | userId | planId | status  | expiryDate | autoRenewal
───┼────────┼────────┼─────────┼────────────┼────────────
1  | user1  | 2      | active  | 2024-02-15 | true
2  | user2  | 1      | expired | 2024-01-01 | false
```

### payments
```
id | userId | amount | status    | transactionId
───┼────────┼────────┼───────────┼──────────────────
1  | user1  | 4.99   | completed | ch_1234567890
2  | user2  | 39.99  | pending   | ch_0987654321
```

### usage_tracking
```
id | userId | cycleStart | cycleEnd | dataUsedBytes | dataLimitBytes
───┼────────┼────────────┼──────────┼───────────────┼────────────────
1  | user1  | 2024-01-01 | 2024-02-01 | 107374182400 | NULL
```

---

## Key Concepts

### User States

```
User Lifecycle:
  
  [New User]
      ↓
  [Free Plan] ← Default, unlimited duration
      ↓
  [Purchases Monthly] → expiryDate = today + 30 days
      ↓
  [Active Premium User] ← Can use premium features
      ↓
  [7 days before expiry] → Get reminder email
      ↓
  [Expiry date arrives] → Auto-renew if enabled
      ├─ If auto-renew ON: Charge & extend
      └─ If auto-renew OFF: Status changes to "expired"
      ↓
  [Expired User] ← Can only use free features
      ↓
  [Purchases new subscription] → Back to premium
      OR
  [Account deleted] → Removed from system
```

### Feature Access Matrix

```
                    Free    Monthly Quarterly Annual
Basic VPN           ✅      ✅      ✅       ✅
Premium Servers     ❌      ✅      ✅       ✅
Ad-Free             ❌      ✅      ✅       ✅
Priority Support    ❌      ✅      ✅       ✅
Static IP           ❌      ❌      ❌       ✅
Max Devices         1       3       5        10
Max Data/Month      500GB   ∞       ∞        ∞
```

### What Happens on Expiry

When subscription expires:
1. Scheduled job finds it
2. Sets status to "expired"
3. User can only use free features
4. Premium server access blocked
5. "Upgrade" prompt shown in app

---

## Common Development Tasks

### Add a New Plan
```typescript
// POST /admin/subscription-plans
{
  name: "6-Month",
  durationDays: 180,
  price: 24.99,
  dataLimitGb: null, // unlimited
  maxDevices: 5,
  features: ["premium_vpn", "ad_free", "priority_support"],
  description: "6-month discount plan"
}
```

### Check if User Can Access Feature
```typescript
// In a guard or decorator
const hasFeature = (user) => {
  const features = user.subscription.plan.features;
  return features.includes('premium_vpn');
};

// Or use decorator
@UseGuards(SubscriptionGuard)
@RequireFeature('premium_vpn')
async connectToPremiumServer() { ... }
```

### Calculate Days Remaining
```typescript
const subscription = await subscriptionService.findByUserId(userId);
const today = new Date();
const daysRemaining = Math.ceil(
  (subscription.expiryDate - today) / (1000 * 60 * 60 * 24)
);
console.log(`${daysRemaining} days left`);
```

### Manually Extend Subscription (Admin)
```typescript
// PUT /admin/subscriptions/:userId/extend
{
  extensionDays: 30,
  reason: "Courtesy extension"
}
```

---

## Background Jobs Checklist

These run automatically:

- [ ] **Daily @ 2 AM**: Check subscriptions expiring in 48 hours
- [ ] **Daily @ 3 AM**: Process auto-renewals
- [ ] **Hourly**: Suspend expired subscriptions
- [ ] **Midnight**: Reset monthly data usage
- [ ] **Every 6h**: Send usage warnings at 80% limit
- [ ] **Daily @ 1 AM**: Retry failed payment charges

---

## Testing Scenarios

### Scenario 1: User Purchases Monthly Plan
```
1. User visits /subscriptions/plans
2. Sees: Free ($0), Monthly ($4.99), Annual ($39.99)
3. Clicks "Monthly" → Upgrade button
4. Stripe checkout appears
5. User enters card: 4242 4242 4242 4242
6. Payment processes
7. user_subscriptions created with status='active'
8. expiryDate = today + 30 days
9. Email receipt sent
10. Dashboard now shows: "✅ Active, 30 days remaining"
```

### Scenario 2: Subscription Expires
```
1. Scheduled job runs daily
2. Finds subscriptions with expiryDate <= today
3. Sets status = 'expired'
4. User tries to access premium server
5. Gets error: "Upgrade to access premium servers"
6. Shows upgrade prompt
7. User clicks "Upgrade" or auto-renews
```

### Scenario 3: Data Limit Warning
```
1. User uses 80% of monthly data limit
2. Scheduled job detects this
3. Sends notification: "80% data used, consider upgrading"
4. Shows remaining data as warning color (red)
5. User can still use, but knows they're near limit
```

### Scenario 4: Auto-Renewal
```
1. User enables auto-renewal when purchasing
2. isAutoRenewal = true in database
3. 1 day before expiry, scheduled job runs
4. Charges saved payment method
5. If successful: Creates new subscription record
6. If failed: Retries next day (up to 3 times)
7. Sends receipt email
```

---

## Error Handling

### Common Errors & Fixes

| Error | Cause | Solution |
|-------|-------|----------|
| `Plan not found` | Invalid planId | Verify planId exists in subscription_plans |
| `Insufficient funds` | Card declined | Show "Payment failed" page, allow retry |
| `Subscription already exists` | User already has active sub | Show upgrade/extend options instead |
| `Data limit exceeded` | User over quota | Block new connections until reset |
| `Auto-renewal failed 3x` | Card expired/declined | Send "update payment method" email |
| `Invalid token` | JWT expired | Redirect to login |

---

## Database Indexes for Performance

```sql
-- Subscriptions queries (most common)
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions("userId");
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_expiry ON user_subscriptions("expiryDate");

-- Payments queries
CREATE INDEX idx_payments_user_id ON payments("userId");
CREATE INDEX idx_payments_status ON payments(status);

-- Usage queries
CREATE INDEX idx_usage_tracking_user_id ON usage_tracking("userId");
CREATE INDEX idx_usage_tracking_cycle ON usage_tracking("cycleStartDate");

-- Plans queries (less frequent, still useful)
CREATE INDEX idx_subscription_plans_active ON subscription_plans("isActive");
```

---

## Key Files to Create

```
src/modules/subscriptions/
├─ subscriptions.module.ts       ← Register everything
├─ subscriptions.controller.ts   ← User endpoints
├─ subscriptions.service.ts      ← Business logic
├─ entities/
│  ├─ plan.entity.ts
│  ├─ subscription.entity.ts
│  ├─ payment.entity.ts
│  └─ usage.entity.ts
├─ services/
│  ├─ payment.service.ts         ← Stripe integration
│  └─ usage.service.ts           ← Data tracking
├─ guards/
│  └─ subscription.guard.ts      ← Check features
├─ jobs/
│  ├─ auto-renewal.job.ts        ← Daily renewal
│  ├─ check-expiry.job.ts        ← Daily reminder
│  └─ reset-usage.job.ts         ← Monthly reset
└─ dto/
   ├─ purchase.dto.ts
   └─ create-plan.dto.ts
```

---

## Important Environment Variables

```bash
# Stripe API credentials
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Email for notifications
SMTP_HOST=smtp.gmail.com
SMTP_USER=noreply@flyvpn.com

# Redis for background jobs
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Monitoring & Alerts

### What to Monitor
```
✓ Payment success rate (should be > 95%)
✓ Failed auto-renewals (should be < 5%)
✓ Stripe webhook failures (should be 0)
✓ Job queue health (no stuck jobs)
✓ Database query performance (< 100ms)
✓ Churn rate (measure weekly)
✓ MRR growth (measure monthly)
```

### Alert Conditions
```
🔴 Red Alert:
   - Payment success rate < 90%
   - 10+ failed auto-renewals
   - Webhook processing failed
   - Job queue has 1000+ pending

🟡 Yellow Alert:
   - Payment success rate < 95%
   - Database queries slow (> 500ms)
   - Failed payment retries > 20%
```

---

## Example Code Snippets

### Check User Subscription Status
```typescript
async getUserSubscriptionStatus(userId: string) {
  const sub = await this.subscriptionsRepository.findOne({
    where: { userId },
    relations: ['plan']
  });

  if (!sub) return { status: 'free' };

  const today = new Date();
  const expired = sub.expiryDate < today;

  return {
    status: expired ? 'expired' : sub.status,
    plan: sub.plan.name,
    expiryDate: sub.expiryDate,
    daysRemaining: Math.ceil(
      (sub.expiryDate - today) / (1000 * 60 * 60 * 24)
    ),
    autoRenewal: sub.isAutoRenewal
  };
}
```

### Verify Feature Access
```typescript
async canAccessFeature(userId: string, feature: string): Promise<boolean> {
  const sub = await this.getUserSubscriptionStatus(userId);
  
  if (sub.status === 'expired') return false;
  
  const plan = await this.plansRepository.findOne({
    where: { id: sub.plan.id }
  });

  return plan.features.includes(feature);
}
```

### Create Stripe Payment Intent
```typescript
async initiatePayment(userId: string, planId: string) {
  const plan = await this.plansRepository.findOne({ where: { id: planId } });
  
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(plan.price * 100), // Convert to cents
    currency: 'usd',
    metadata: { userId, planId },
    description: `FlyVPN ${plan.name} subscription`
  });

  return paymentIntent;
}
```

---

## Deployment Checklist

Before going live:
- [ ] Database migrations run successfully
- [ ] Stripe account created & keys configured
- [ ] Redis running and connected
- [ ] Email service configured
- [ ] Background jobs scheduled
- [ ] Tests passing (unit + integration)
- [ ] Load testing done
- [ ] Error monitoring (Sentry) set up
- [ ] Analytics tracking enabled
- [ ] Documentation updated
- [ ] Team trained on new endpoints
- [ ] Rollback plan prepared

---

## Support & Common Questions

**Q: What happens if user cancels mid-month?**
A: User can cancel anytime. Refund depends on your policy (full, partial, or pro-rata).

**Q: Can user have multiple subscriptions?**
A: No, only one per user. Upgrade automatically transitions to new plan.

**Q: What if payment method expires?**
A: Job retries auto-renewal. After 3 failures, user is notified to update payment info.

**Q: How are legacy (free) users handled?**
A: Automatically assigned "Free" plan with no expiration. Stays free until they upgrade.

**Q: Can admin manually extend subscription?**
A: Yes, `/admin/subscriptions/:userId/extend` endpoint for manual extensions.

**Q: What about refunds?**
A: Implement refund logic in payment service. Stripe handles reversal, you log it in database.

**Q: How do we handle time zones?**
A: Always use UTC in database. Convert to user's timezone in UI only.

---

Done! You now have:
1. **Detailed specification** (SUBSCRIPTION_SYSTEM_SPEC.md)
2. **Implementation roadmap** (SUBSCRIPTION_IMPLEMENTATION_PLAN.md)
3. **Quick reference** (this file)

Start with Phase 1 (Database) and work your way through! 🚀
