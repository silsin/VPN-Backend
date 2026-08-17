# Subscription System - Environment Configuration

Add these environment variables to your `.env` file:

## Stripe Payment Gateway

```bash
# Stripe API Keys
# Get these from https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxx

# Webhook signing secret for payment verification
# Set up webhook at https://dashboard.stripe.com/webhooks
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

## Redis Configuration (for background jobs)

```bash
# Redis connection for BullMQ job queue
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Leave empty if no password

# Or use Redis URL
REDIS_URL=redis://localhost:6379
```

## Email Notifications (SMTP)

```bash
# Email configuration for sending notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-specific-password
SMTP_FROM_EMAIL=noreply@flyvpn.com
SMTP_FROM_NAME=FlyVPN

# Or use SendGrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx
```

## Database

```bash
# PostgreSQL Database (existing config)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=flyvpn_user
DB_PASSWORD=secure_password
DB_NAME=flyvpn
```

## JWT Configuration

```bash
# JWT for authentication (existing config)
JWT_SECRET=your-super-secret-key-here
JWT_EXPIRES_IN=7d
```

## Application URLs

```bash
# Frontend URL for redirects after payment
FRONTEND_URL=https://app.flyvpn.com
BACKEND_URL=https://api.flyvpn.com

# Stripe redirect URLs
STRIPE_RETURN_URL=https://api.flyvpn.com/subscriptions/stripe-return
STRIPE_CANCEL_URL=https://app.flyvpn.com/subscriptions/checkout-cancelled
```

## Optional: Logging & Monitoring

```bash
# For subscription system debugging
LOG_LEVEL=info  # debug, info, warn, error

# Error tracking (Sentry)
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

# Payment processing logs
PAYMENT_LOG_LEVEL=info
```

## Example Complete .env

```bash
# =========================
# Database
# =========================
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=flyvpn_user
DB_PASSWORD=secure_password
DB_NAME=flyvpn

# =========================
# JWT & Auth
# =========================
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d

# =========================
# Stripe Payments
# =========================
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

# =========================
# Redis (Background Jobs)
# =========================
REDIS_HOST=localhost
REDIS_PORT=6379

# =========================
# Email (SMTP)
# =========================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-specific-password
SMTP_FROM_EMAIL=noreply@flyvpn.com
SMTP_FROM_NAME=FlyVPN

# =========================
# Application
# =========================
NODE_ENV=production
FRONTEND_URL=https://app.flyvpn.com
BACKEND_URL=https://api.flyvpn.com
LOG_LEVEL=info

# =========================
# Optional: Error Tracking
# =========================
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

---

## Setup Instructions

### 1. Get Stripe API Keys

1. Create a [Stripe account](https://stripe.com)
2. Go to [API Keys](https://dashboard.stripe.com/apikeys)
3. Copy **Secret Key** and **Publishable Key**
4. Create [webhook endpoint](https://dashboard.stripe.com/webhooks)
   - Endpoint URL: `https://your-api.com/webhooks/stripe`
   - Events to listen: `charge.succeeded`, `charge.failed`, `customer.subscription.updated`
5. Copy the **Signing Secret**

### 2. Set Up Redis

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or install locally
# On macOS
brew install redis

# On Linux
sudo apt-get install redis-server

# On Windows
# Download from https://github.com/microsoftarchive/redis/releases
```

### 3. Configure SMTP

#### Using Gmail:
1. Enable 2-Factor Authentication
2. Generate [App Password](https://myaccount.google.com/apppasswords)
3. Use the generated password in `SMTP_PASSWORD`

#### Using SendGrid:
1. Create [SendGrid account](https://sendgrid.com)
2. Generate [API Key](https://app.sendgrid.com/settings/api_keys)
3. Use in `SENDGRID_API_KEY`

### 4. Update .env File

```bash
cp .env.example .env
# Edit .env with your values
```

### 5. Initialize Database

```bash
# Run migrations (including subscription tables)
npm run typeorm migration:run

# Or run migration files directly
psql -U flyvpn_user -d flyvpn -f database/migrations/019_create_subscription_plans.sql
psql -U flyvpn_user -d flyvpn -f database/migrations/020_create_user_subscriptions.sql
# ... etc for all migration files
```

### 6. Start Application

```bash
# Start app (will seed default plans automatically)
npm run start

# Or in development
npm run start:dev
```

---

## Testing Credentials

### Stripe Test Cards

Use these in Stripe test mode (switch toggle at top of dashboard):

| Card Number | CVV | Expiry | Result |
|-------------|-----|--------|--------|
| 4242 4242 4242 4242 | Any | Any future date | ✅ Successful |
| 4000 0000 0000 0002 | Any | Any future date | ❌ Declined |
| 4000 0025 0000 3155 | Any | Any future date | ❌ Requires authentication |

### Test Email Addresses

```
success+stripe@simulator.amazonses.com
bounce+stripe@simulator.amazonses.com
ooto+stripe@simulator.amazonses.com
complaint+stripe@simulator.amazonses.com
suppressionlist+stripe@simulator.amazonses.com
```

---

## Production Checklist

- [ ] Use Stripe **Live** keys (not test keys)
- [ ] Configure **HTTPS only** for all URLs
- [ ] Set up Redis with password authentication
- [ ] Enable Redis persistence (RDB or AOF)
- [ ] Configure email with production SMTP server
- [ ] Set up database backups
- [ ] Enable Stripe webhook verification
- [ ] Monitor application logs
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure rate limiting
- [ ] Enable CORS properly
- [ ] Use environment-specific configurations

---

## Troubleshooting

### Stripe Webhook Not Triggering
- Verify webhook endpoint URL is publicly accessible
- Check webhook signing secret is correct
- Look at webhook delivery attempts in Stripe dashboard

### Redis Connection Failed
- Verify Redis is running: `redis-cli ping` (should return PONG)
- Check REDIS_HOST and REDIS_PORT are correct
- Verify no firewall blocking port 6379

### Email Not Sending
- Verify SMTP credentials are correct
- Check email provider allows third-party app access
- Review email logs in application

### Database Migration Errors
- Ensure all previous migrations ran successfully
- Check database user has proper permissions
- Verify database connection string

---

## Security Notes

🔒 **Important:**
- Never commit `.env` file to version control
- Use strong, unique values for secrets
- Rotate secrets periodically
- Keep API keys secure and confidential
- Use environment-specific keys (test vs. production)
- Monitor for unauthorized access attempts
