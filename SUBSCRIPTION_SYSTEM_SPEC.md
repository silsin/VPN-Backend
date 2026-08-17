# FlyVPN Subscription & Billing System Specification

## Overview
Complete ecosystem for users to purchase VPN accounts with tiered plans, automatic expiration tracking, feature access control, and usage monitoring.

---

## 1. Core Concepts

### Plan Types
Users select subscription plans with different durations and features:
- **Free Plan** (Default)
  - Duration: Unlimited (expires when admin sets it)
  - Data/month: Limited (configurable)
  - Devices: 1
  - Features: Basic VPN access
  - Cost: $0

- **Monthly Plan**
  - Duration: 30 days
  - Data/month: Unlimited
  - Devices: 3
  - Features: Premium servers, priority support
  - Cost: $4.99

- **Quarterly Plan**
  - Duration: 90 days
  - Data/month: Unlimited
  - Devices: 5
  - Features: Premium servers, priority support, ad-free
  - Cost: $12.99

- **Annual Plan**
  - Duration: 365 days
  - Data/month: Unlimited
  - Devices: 10
  - Features: All premium, VIP support, static IP
  - Cost: $39.99

### Plan Access Features
Plans grant access to features based on subscription level:
- `basic_vpn`: Free tier users
- `premium_vpn`: Paid tier users
- `ad_free`: Monthly+ subscribers
- `priority_support`: Monthly+ subscribers
- `static_ip`: Annual subscribers only
- `multi_device`: Monthly+ subscribers (more concurrent connections)

---

## 2. Database Schema

### New Tables Required

#### `subscription_plans`
```sql
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    duration_days INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    data_limit_gb BIGINT, -- NULL for unlimited
    max_devices INT NOT NULL DEFAULT 1,
    features JSONB NOT NULL DEFAULT '[]', -- Array of feature strings
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `user_subscriptions`
```sql
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    "planId" UUID NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, expired, cancelled, suspended
    "startDate" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP NOT NULL,
    "renewalDate" TIMESTAMP, -- Next auto-renewal date
    "cancelledAt" TIMESTAMP,
    "cancelledReason" VARCHAR(255),
    "isAutoRenewal" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `subscription_history`
```sql
CREATE TABLE subscription_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "planId" UUID NOT NULL REFERENCES subscription_plans(id),
    "previousPlanId" UUID,
    action VARCHAR(50) NOT NULL, -- 'upgraded', 'downgraded', 'renewed', 'extended'
    "startDate" TIMESTAMP NOT NULL,
    "expiryDate" TIMESTAMP NOT NULL,
    notes TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `payments` (Transaction history)
```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "subscriptionId" UUID REFERENCES user_subscriptions(id),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    method VARCHAR(50) NOT NULL, -- 'stripe', 'paypal', 'crypto', 'gift_code'
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
    "transactionId" VARCHAR(255) UNIQUE,
    "metadata" JSONB,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `usage_tracking`
```sql
CREATE TABLE usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "cycleStartDate" TIMESTAMP NOT NULL,
    "cycleEndDate" TIMESTAMP NOT NULL,
    "dataUsedBytes" BIGINT DEFAULT 0,
    "dataLimitBytes" BIGINT,
    "devicesUsed" INT DEFAULT 0,
    "isLimitExceeded" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Modify `users` Table
Add these columns:
```sql
ALTER TABLE users ADD COLUMN "subscriptionStatus" VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN "currentPlanId" UUID REFERENCES subscription_plans(id);
ALTER TABLE users ADD COLUMN "subscriptionExpiryDate" TIMESTAMP;
ALTER TABLE users ADD COLUMN "daysRemaining" INT DEFAULT 0;
ALTER TABLE users ADD COLUMN "dataUsedThisMonth" BIGINT DEFAULT 0;
ALTER TABLE users ADD COLUMN "maxDataPerMonth" BIGINT;
ALTER TABLE users ADD COLUMN "maxConcurrentDevices" INT DEFAULT 1;
```

### Indexes
```sql
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions("userId");
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_expiry ON user_subscriptions("expiryDate");
CREATE INDEX idx_payments_user_id ON payments("userId");
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_usage_tracking_user_id ON usage_tracking("userId");
```

---

## 3. API Endpoints

### Plans Management (Admin)

#### GET `/admin/subscription-plans`
List all subscription plans
```json
{
  "plans": [
    {
      "id": "uuid",
      "name": "Monthly",
      "durationDays": 30,
      "price": 4.99,
      "dataLimitGb": null,
      "maxDevices": 3,
      "features": ["premium_vpn", "ad_free"],
      "isActive": true
    }
  ]
}
```

#### POST `/admin/subscription-plans`
Create new plan
```json
{
  "name": "Monthly",
  "durationDays": 30,
  "price": 4.99,
  "dataLimitGb": null,
  "maxDevices": 3,
  "features": ["premium_vpn", "ad_free"],
  "description": "Monthly premium plan"
}
```

#### PUT `/admin/subscription-plans/:planId`
Update plan details

#### DELETE `/admin/subscription-plans/:planId`
Deactivate plan

---

### User Subscription Endpoints

#### GET `/subscriptions/my-plan`
Get current subscription details (JWT required)
```json
{
  "subscription": {
    "id": "uuid",
    "plan": {
      "id": "uuid",
      "name": "Monthly",
      "price": 4.99
    },
    "status": "active",
    "startDate": "2024-01-01T00:00:00Z",
    "expiryDate": "2024-02-01T00:00:00Z",
    "daysRemaining": 15,
    "autoRenewal": false,
    "chargesPerCycle": 4.99
  },
  "usage": {
    "dataUsedBytes": 1073741824,
    "dataLimitBytes": null,
    "dataUsedPercent": 0,
    "devicesUsed": 2,
    "maxDevices": 3
  },
  "nextPaymentDate": "2024-02-01T00:00:00Z"
}
```

#### GET `/subscriptions/plans`
Get all available plans (public)
```json
{
  "plans": [
    {
      "id": "uuid",
      "name": "Monthly",
      "durationDays": 30,
      "price": 4.99,
      "features": ["premium_vpn", "ad_free"],
      "savings": null
    }
  ]
}
```

#### POST `/subscriptions/purchase`
Purchase or upgrade subscription (JWT required)
```json
{
  "planId": "uuid",
  "paymentMethod": "stripe", // or "paypal", "crypto", "gift_code"
  "paymentDetails": {
    "tokenId": "tok_visa", // For stripe
    "couponCode": "SAVE20" // Optional
  }
}
```

**Response:**
```json
{
  "success": true,
  "subscription": {...},
  "paymentId": "uuid",
  "redirectUrl": "https://checkout.stripe.com/..." // If needed
}
```

#### POST `/subscriptions/extend`
Extend current subscription without changing plan
```json
{
  "extensionDays": 30,
  "paymentMethod": "stripe"
}
```

#### POST `/subscriptions/cancel`
Cancel subscription
```json
{
  "reason": "Too expensive", // Optional feedback
  "refundType": "full" // "full", "partial", or "none"
}
```

#### POST `/subscriptions/renew`
Manual renewal (if auto-renewal disabled)
```json
{
  "paymentMethod": "stripe"
}
```

#### POST `/subscriptions/toggle-auto-renewal`
Enable/disable auto-renewal
```json
{
  "enabled": true
}
```

---

### Usage & Analytics Endpoints

#### GET `/subscriptions/usage/current`
Get current cycle usage (JWT required)
```json
{
  "cycle": {
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-02-01T00:00:00Z"
  },
  "dataUsage": {
    "usedBytes": 1073741824,
    "limitBytes": null,
    "usedPercent": 0,
    "usedGB": 1.0
  },
  "deviceUsage": {
    "active": 2,
    "maxConcurrent": 3
  },
  "isLimitExceeded": false,
  "warningThreshold": 0.8
}
```

#### GET `/subscriptions/history`
Get subscription history (JWT required)
```json
{
  "history": [
    {
      "id": "uuid",
      "action": "renewed",
      "planName": "Monthly",
      "startDate": "2024-01-01T00:00:00Z",
      "expiryDate": "2024-02-01T00:00:00Z",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### GET `/subscriptions/payments`
Get payment history (JWT required)
```json
{
  "payments": [
    {
      "id": "uuid",
      "amount": 4.99,
      "currency": "USD",
      "method": "stripe",
      "status": "completed",
      "transactionId": "ch_123456",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Admin Analytics Endpoints

#### GET `/admin/subscriptions/stats`
Subscription system analytics
```json
{
  "stats": {
    "totalActiveSubscriptions": 1250,
    "totalRevenueMonth": 15000.50,
    "totalRevenueYear": 180000.00,
    "churnRate": 0.05,
    "subscriptionsByPlan": {
      "free": 5000,
      "monthly": 1000,
      "quarterly": 150,
      "annual": 100
    },
    "mrr": 5000.00,
    "arr": 60000.00
  }
}
```

#### GET `/admin/subscriptions/expiring-soon`
Users with subscriptions expiring in next 7 days
```json
{
  "expiringSoon": [
    {
      "userId": "uuid",
      "email": "user@example.com",
      "plan": "Monthly",
      "expiryDate": "2024-01-07T00:00:00Z",
      "autoRenewal": false
    }
  ]
}
```

---

## 4. Feature Access Control

### User Entity Extensions
```typescript
// In user entity or service
interface UserFeatures {
  canUseBasicVPN: boolean;
  canUsePremiumVPN: boolean;
  canUseAdFree: boolean;
  canUsePrioritySupport: boolean;
  canUseStaticIP: boolean;
  maxConcurrentDevices: number;
  dataLimitPerMonth: number | null;
}

// Method to get features based on subscription
getEnabledFeatures(subscription: UserSubscription): UserFeatures {
  const features = subscription.plan.features;
  return {
    canUseBasicVPN: true, // All users
    canUsePremiumVPN: features.includes('premium_vpn'),
    canUseAdFree: features.includes('ad_free'),
    canUsePrioritySupport: features.includes('priority_support'),
    canUseStaticIP: features.includes('static_ip'),
    maxConcurrentDevices: subscription.plan.maxDevices,
    dataLimitPerMonth: subscription.plan.dataLimitGb ? subscription.plan.dataLimitGb * 1024 * 1024 * 1024 : null
  };
}
```

---

## 5. Background Jobs (Bull Queue)

### Jobs to Implement

#### 1. `check-subscription-expiry` (Runs daily)
- Find subscriptions expiring in next 48 hours
- Send notification emails
- Handle auto-renewal if enabled

#### 2. `process-auto-renewal` (Runs daily)
- Find subscriptions with auto-renewal enabled that are expiring
- Charge user with saved payment method
- Update subscription dates
- Log transaction

#### 3. `reset-monthly-usage` (Runs daily at midnight)
- Reset `dataUsedThisMonth` for all users
- Start new usage tracking cycle

#### 4. `suspend-expired-subscriptions` (Runs hourly)
- Find expired subscriptions
- Change status to "expired"
- Limit user to free tier features
- Send notification

#### 5. `send-usage-warnings` (Runs every 6 hours)
- Find users who exceeded 80% data limit
- Send warning notification
- Suggest upgrade if needed

#### 6. `process-failed-payments` (Runs daily)
- Retry failed payment attempts
- After 3 failures, suspend account
- Send warning to user

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create database tables and migrations
- [ ] Create subscription plan CRUD (admin)
- [ ] Create basic user subscription endpoints
- [ ] Implement subscription status checks

### Phase 2: Payment Integration (Week 3-4)
- [ ] Integrate Stripe payment processor
- [ ] Create payment processing endpoints
- [ ] Implement transaction logging
- [ ] Add payment method storage (secure)

### Phase 3: Feature Access & Usage (Week 5)
- [ ] Implement feature access control guards
- [ ] Create usage tracking system
- [ ] Add data limit enforcement
- [ ] Create usage analytics endpoints

### Phase 4: Automation & Background Jobs (Week 6)
- [ ] Set up Bull queue
- [ ] Implement all background jobs
- [ ] Create notification system
- [ ] Add email templates

### Phase 5: Admin Dashboard & Analytics (Week 7)
- [ ] Create admin statistics endpoints
- [ ] Build subscription management endpoints
- [ ] Add manual intervention tools
- [ ] Create reporting endpoints

### Phase 6: Testing & Deployment (Week 8)
- [ ] Unit tests for all services
- [ ] Integration tests
- [ ] Load testing
- [ ] Deployment & monitoring

---

## 7. Technical Requirements

### Dependencies to Add
```json
{
  "@stripe/stripe-js": "^latest",
  "stripe": "^latest",
  "bull": "^4.x", // or @nestjs/bullmq
  "nodemailer": "^latest",
  "date-fns": "^latest",
  "decimal.js": "^latest"
}
```

### Security Considerations
- PCI DSS compliance (use Stripe for payment processing, never store card data)
- Rate limit payment endpoints
- Validate payment amounts server-side
- Log all transactions for audit
- Encrypt sensitive payment metadata
- Use environment variables for API keys

### Performance Considerations
- Index subscription queries (user_id, status, expiry_date)
- Cache subscription plans (refresh every 15 min)
- Use database transactions for payment processing
- Queue background jobs for heavy operations

---

## 8. Notification Strategy

### Email Notifications
1. **Subscription Purchased** - Welcome, details, next payment date
2. **Expiring Soon** (7 days before) - Reminder, renewal instructions
3. **Subscription Expired** - Downgrade to free, reactivation instructions
4. **Payment Failed** - Alternative payment methods, support contact
5. **Auto-Renewal Successful** - Receipt, new expiry date
6. **Subscription Cancelled** - Confirmation, cancellation feedback form

### In-App Notifications
1. Days remaining counter in dashboard
2. Data usage warning at 80%
3. Device limit notifications
4. Feature access upgrades prompts

---

## 9. UI/UX Flows (Frontend)

### Dashboard
- Current plan display with days remaining
- Data usage progress bar
- Device count indicator
- Quick action buttons (Upgrade, Renew, Cancel)

### Upgrade/Purchase Flow
1. Show all available plans with comparison
2. Highlight user's current plan
3. Show pricing and features
4. Payment method selection
5. Stripe payment modal
6. Confirmation with receipt

### Cancellation Flow
1. Show current plan details
2. Explain cancellation consequences
3. Optional feedback form
4. Refund policy information
5. Confirmation

---

## 10. Success Metrics

- Monthly Recurring Revenue (MRR)
- Annual Recurring Revenue (ARR)
- Churn rate
- Upgrade rate
- Renewal rate
- Average Revenue Per User (ARPU)
- Customer Lifetime Value (CLV)
- Payment success rate
- Auto-renewal conversion rate

---

## 11. Migration Path from Free to Paid

All current users start with **Free Plan** automatically:
- No credit card required
- All current features available
- Can upgrade anytime
- No forced payment
- Optional: Show upgrade prompts after X days or when limits reached

---

## Notes

- **Gifting**: Implement gift codes that add days/plans without charging
- **Discounts**: Support promo codes and seasonal discounts
- **Family Plans**: Consider family sharing (multiple users on one plan)
- **Referral Program**: Give referral bonuses
- **Trial Period**: Consider 7-day free trial for paid plans
- **Downgrade Handling**: Pro-rata refunds if downgrading mid-cycle
- **Tax Compliance**: Implement tax calculation per region
