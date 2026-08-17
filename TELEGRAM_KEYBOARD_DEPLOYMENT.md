# Telegram Keyboard Integration - Deployment Guide

## Overview

The subscription system now uses a keyboard-based interface for Telegram admin operations, replacing text commands. The keyboard interface runs on a separate webhook endpoint (`/webhook/subscription-telegram`) independent from the main bot.

## Build Status

✅ **Build Successful** - All TypeScript errors resolved
- Circular dependency issue fixed (removed circular import in `SubscriptionTelegramModule`)
- `SubscriptionProcessor` properly extends `WorkerHost` for BullMQ v5+
- All services properly imported without cross-module dependencies

## Architecture

### Separate Webhook for Subscriptions
- **Main Bot** (`TelegramAdminBotService`): Handles `/list`, `/stats`, `/dialogs`, `/adsreports` commands
- **Subscription Keyboard** (via webhook): Handles `/subscriptions` and all keyboard buttons
- **Endpoint**: `POST /webhook/subscription-telegram`

### Key Components

1. **SubscriptionTelegramController** - HTTP endpoint for Telegram webhooks
2. **SubscriptionTelegramKeyboardService** - Generates inline keyboard layouts
3. **SubscriptionTelegramHandlerService** - Handles callback queries from button clicks
4. **SubscriptionTelegramModule** - Standalone module (no circular dependencies)

## Deployment Steps

### 1. Environment Configuration

Add to `.env` file:

```env
# Telegram Bot Token (same as main bot)
TELEGRAM_ADMIN_BOT_TOKEN=your_bot_token_here

# Authorized chat IDs (comma-separated user IDs allowed to access subscription admin)
TELEGRAM_ADMIN_CHAT_IDS=123456789,987654321

# Enable/disable (optional)
TELEGRAM_ADMIN_BOT_ENABLED=true
```

**How to get your Telegram User ID:**
1. Send any message to your bot
2. Visit: `https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates`
3. Look for `"id"` in the `from` object

### 2. Configure Telegram Webhook

Set your bot's webhook to the subscription endpoint:

```bash
# Using Telegram Bot API
curl -X POST https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-domain/webhook/subscription-telegram"}'

# Verify webhook
curl https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo
```

**Important**: If you have a webhook for another purpose, you may need separate bot tokens or adjust routing.

### 3. Start the Application

```bash
npm run start
```

The application will:
- Initialize subscription plans (if not exists)
- Set up BullMQ job queues
- Start listening on `/webhook/subscription-telegram`

## Testing

### Test 1: Send /subscriptions Command

1. Open Telegram
2. Send `/subscriptions` to your bot
3. **Expected**: Receive main menu with these buttons:
   - 💳 Manage Plans
   - 👥 Manage Users
   - 💰 Manage Payments
   - 📊 View Analytics
   - ⏰ Expiring Subscriptions
   - 📈 Usage Statistics
   - ❓ Help
   - 🔄 Refresh

### Test 2: Navigation

1. Click "💳 Manage Plans"
2. **Expected**: Menu with options:
   - ➕ Create Plan
   - 📋 List Plans
   - ✏️ Edit Plan
   - 🗑️ Delete Plan
   - ↩️ Back to Main Menu

### Test 3: Send /help Command

1. Send `/help`
2. **Expected**: Help text with features listed and "📱 Open Menu" button

### Test 4: Unknown Command

1. Send any text (not starting with `/`)
2. **Expected**: Message saying "Please use /subscriptions command to access the menu" with button

### Test 5: Unauthorized Access

1. Send `/subscriptions` from a different Telegram user ID (not in `TELEGRAM_ADMIN_CHAT_IDS`)
2. **Expected**: No response (silently ignored)

### Test 6: Callback Buttons

1. From main menu, click "💳 Manage Plans"
2. Click "📋 List Plans"
3. **Expected**: Shows list of subscription plans with options to view/edit each

## Available Keyboard Menus

### Main Menu
- Manage Plans
- Manage Users
- Manage Payments
- View Analytics
- Expiring Subscriptions
- Usage Statistics
- Help
- Refresh

### Plan Management
- Create Plan
- List Plans
- Edit Plan
- Delete Plan
- Back to Main Menu

### User Management
- List Subscriptions
- Search User
- Extend Subscription
- Suspend Subscription
- Back to Main Menu

### Payment Management
- List Payments
- View Refunds
- Manual Payment
- Back to Main Menu

### Analytics Menu
- Revenue Report
- Subscription Stats
- Payment Stats
- Back to Main Menu

### Expiring Subscriptions
- Next 7 days
- Next 30 days
- Next 90 days
- Back to Main Menu

### Usage Statistics
- Top Consumers
- Near Limit
- Renewal Stats
- Back to Main Menu

## Troubleshooting

### Issue: No response to `/subscriptions`

**Possible causes:**
1. `TELEGRAM_ADMIN_CHAT_IDS` not set or user ID not included
   - **Solution**: Add your user ID to the environment variable
2. Webhook URL incorrect
   - **Solution**: Verify webhook with `getWebhookInfo`
3. Application not running or endpoint unreachable
   - **Solution**: Check application logs and network connectivity

### Issue: "Subscription management is available via keyboard menu"

**This means**: The old placeholder response is still active. This should not appear with the new implementation.
- **Solution**: Clear browser cache, restart application

### Issue: Button clicks not responding

**Possible causes:**
1. Handler method not implemented
2. Database connection issue
3. Authorization check failing

**Solution**:
- Check application logs for errors
- Verify database connectivity
- Confirm user ID in `TELEGRAM_ADMIN_CHAT_IDS`

### Issue: BullMQ Processor Error

**Error**: `Processor class should inherit from abstract "WorkerHost" class`

**Solution**: Already fixed in this version - verify `SubscriptionProcessor` extends `WorkerHost`

```typescript
@Processor('subscription-jobs')
export class SubscriptionProcessor extends WorkerHost {
  // ...
}
```

## Handler Methods Implemented

All callback handlers are fully implemented:

✅ `handleMenuNavigation` - Menu switching
✅ `handlePlansAction` - Plan CRUD operations
✅ `handlePlanAction` - Individual plan details
✅ `handleUsersAction` - User management
✅ `handleUserAction` - Individual user details
✅ `handlePaymentsAction` - Payment operations
✅ `handleAnalyticsAction` - Analytics reports
✅ `handleExpiringAction` - Expiring subscription reports
✅ `handleUsageAction` - Usage statistics
✅ `handleQuickAction` - Quick actions (refresh, settings)
✅ `handleDateRangeAction` - Date range selection

## Database

Required tables (from migrations 019-024):
- `subscription_plans` - Subscription plan definitions
- `user_subscriptions` - User subscription records
- `payments` - Payment transactions
- `subscription_history` - Historical records
- `usage_tracking` - Data usage tracking

Run migrations:

```bash
npm run migration:run
```

Or manually run database setup:

```bash
mysql -u root -p < database/full_setup_migration.sql
```

## API Endpoints

### Subscription Admin API
- `POST /subscriptions/admin/plans` - Create plan
- `GET /subscriptions/admin/plans` - List plans
- `PATCH /subscriptions/admin/plans/:id` - Update plan
- `DELETE /subscriptions/admin/plans/:id` - Delete plan
- `GET /subscriptions/admin/subscriptions` - List subscriptions
- `GET /subscriptions/admin/subscriptions/:userId` - User details
- `GET /subscriptions/admin/analytics/revenue` - Revenue report
- `GET /subscriptions/admin/analytics/stats` - Subscription stats
- `GET /subscriptions/admin/payments` - Payment list
- `POST /subscriptions/admin/payments/refund` - Refund payment
- `GET /subscriptions/admin/subscriptions/expiring/:days` - Expiring list
- `GET /subscriptions/admin/usage/top-consumers` - Top users
- `GET /subscriptions/admin/usage/near-limit` - Users near limit

### Webhook
- `POST /webhook/subscription-telegram` - Telegram updates (messages & callbacks)

## Deployment Checklist

- [ ] Build passes without errors (`npm run build`)
- [ ] `.env` has `TELEGRAM_ADMIN_BOT_TOKEN`
- [ ] `.env` has `TELEGRAM_ADMIN_CHAT_IDS` with authorized user IDs
- [ ] Database migrations run successfully
- [ ] Telegram webhook URL configured correctly
- [ ] Application starts without errors (`npm run start`)
- [ ] Test `/subscriptions` command works
- [ ] Test button clicks respond
- [ ] Main bot still works for `/list`, `/stats` commands
- [ ] Monitor logs for any errors

## Files Modified

### Fixed
- `src/modules/subscriptions/telegram/subscription-telegram.module.ts` - Removed circular import
- `src/modules/subscriptions/subscriptions.module.ts` - Removed duplicate imports
- `src/modules/subscriptions/telegram/subscription-telegram.controller.ts` - Fixed method signature
- `src/modules/subscriptions/jobs/subscription.processor.ts` - Extends `WorkerHost` ✅

### New
- `src/modules/subscriptions/telegram/subscription-telegram.controller.ts` - Webhook handler
- `src/modules/subscriptions/telegram/subscription-telegram-keyboard.service.ts` - Keyboard UI
- `src/modules/subscriptions/telegram/subscription-telegram-handler.service.ts` - Callback handlers

## Next Steps

1. Set environment variables
2. Run database migrations
3. Configure Telegram webhook
4. Start application
5. Test each menu and button
6. Monitor logs for any issues
7. Verify job scheduler works (background jobs)

## Support

For issues with:
- **Keyboard layout**: Check `SubscriptionTelegramKeyboardService`
- **Button responses**: Check `SubscriptionTelegramHandlerService`
- **Authorization**: Verify `TELEGRAM_ADMIN_CHAT_IDS` includes your user ID
- **Webhook**: Check Telegram API with `getWebhookInfo`
- **Database**: Check migration files in `database/migrations/`
