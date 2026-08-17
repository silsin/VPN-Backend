# Testing Telegram Keyboard Interface

## Quick Start Test

### Step 1: Verify Environment Setup

Check your `.env` file has:
```env
TELEGRAM_ADMIN_BOT_TOKEN=<your_token>
TELEGRAM_ADMIN_CHAT_IDS=<your_user_id>
```

Get your user ID:
```bash
# Send a message to the bot, then run:
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

### Step 2: Start Application

```bash
npm run start
```

Expected output:
```
[NestFactory] Starting Nest application...
[InstanceLoader] TypeOrmModule dependencies initialized
[InstanceLoader] BullModule dependencies initialized
...
[NestFactory] Nest application successfully started on port 3000
```

### Step 3: Test Each Command

#### Test Command: /subscriptions
Send `/subscriptions` to your Telegram bot.

**Expected response:**
- Message: "🤖 FlyVPN Subscription Admin"
- Buttons appear in a grid:
  - Row 1: [💳 Manage Plans] [👥 Manage Users]
  - Row 2: [💰 Manage Payments] [📊 View Analytics]
  - Row 3: [⏰ Expiring Subscriptions] [📈 Usage Statistics]
  - Row 4: [❓ Help] [🔄 Refresh]

**What to check:**
- ✅ Message appears (not a timeout error)
- ✅ Buttons are clickable
- ✅ No permission denied error

#### Test Command: /help
Send `/help` to your bot.

**Expected response:**
- Help text with command descriptions
- Features listed
- Button: [📱 Open Menu]

#### Test Command: /start
Send `/start` to your bot.

**Expected response:**
- Same as `/subscriptions`

#### Test Non-Command Text
Send any text that doesn't start with `/` (e.g., "hello")

**Expected response:**
- Message: "Please use /subscriptions command to access the menu."
- Button: [📱 Open Menu]

### Step 4: Test Button Navigation

#### Test: Click "💳 Manage Plans"

From main menu, click the "💳 Manage Plans" button.

**Expected response:**
- Message updates to: "💳 Plan Management"
- New buttons appear:
  - [➕ Create Plan]
  - [📋 List Plans]
  - [✏️ Edit Plan]
  - [🗑️ Delete Plan]
  - [↩️ Back to Main Menu]

#### Test: Click "📋 List Plans"

From Plan Management menu, click "📋 List Plans"

**Expected response:**
- Shows list of available plans (Free, Monthly, Quarterly, Annual)
- Format shows: plan name, price, data limit, renewal period
- Option to select a plan for more details
- Button to go back

#### Test: Click Back Navigation

From any submenu, click "↩️ Back to Main Menu"

**Expected response:**
- Returns to main menu with all original buttons

#### Test: Click "👥 Manage Users"

From main menu, click "👥 Manage Users"

**Expected response:**
- Message updates to: "👥 User Management"
- Buttons for user operations:
  - [📋 List Subscriptions]
  - [🔍 Search User]
  - [⏳ Extend Subscription]
  - [⛔ Suspend Subscription]
  - [↩️ Back to Main Menu]

#### Test: Click "💰 Manage Payments"

From main menu, click "💰 Manage Payments"

**Expected response:**
- Message updates to: "💰 Payment Management"
- Buttons appear:
  - [💳 List Payments]
  - [💸 View Refunds]
  - [🤝 Manual Payment]
  - [↩️ Back to Main Menu]

#### Test: Click "📊 View Analytics"

From main menu, click "📊 View Analytics"

**Expected response:**
- Message updates to: "📊 Analytics"
- Buttons for analytics:
  - [📈 Revenue Report]
  - [👥 Subscription Stats]
  - [💳 Payment Stats]
  - [↩️ Back to Main Menu]

#### Test: Click "⏰ Expiring Subscriptions"

From main menu, click "⏰ Expiring Subscriptions"

**Expected response:**
- Message updates to: "⏰ Expiring Subscriptions"
- Date range buttons:
  - [7️⃣ Next 7 days]
  - [3️⃣0️⃣ Next 30 days]
  - [9️⃣0️⃣ Next 90 days]
  - [↩️ Back to Main Menu]

After clicking date range:
- Shows list of expiring subscriptions
- Display format: user email, expiration date, days remaining, plan name

#### Test: Click "📈 Usage Statistics"

From main menu, click "📈 Usage Statistics"

**Expected response:**
- Message updates to: "📈 Usage Statistics"
- Buttons for usage data:
  - [👑 Top Consumers]
  - [⚠️ Near Limit]
  - [🔄 Renewal Stats]
  - [↩️ Back to Main Menu]

### Step 5: Authorization Testing (Optional)

#### Test: Unauthorized Access

From a different Telegram account (not in `TELEGRAM_ADMIN_CHAT_IDS`):
1. Send `/subscriptions`

**Expected result:**
- No response (silently ignored)
- No error message sent

**Why:** Security feature - unauthorized users don't get notifications

#### Test: Authorization Denied on Button

Click any button as unauthorized user (if you somehow got this far):

**Expected response:**
- Alert: "⛔ Not authorized"

### Step 6: Error Handling

#### Test: Send Garbage Data

If you can manually send malformed Telegram webhooks:
- Invalid callback data
- Missing parameters

**Expected result:**
- Request returns `{"ok": true}` (no crash)
- Error logged but application continues running

#### Test: Rapid Clicks

Quickly click multiple buttons in succession.

**Expected result:**
- Each click is processed
- Message updates reflect latest action
- No duplicate messages
- No crashes

## Debugging

### Check Application Logs

Look for these log patterns:

**Success indicators:**
```
[NestFactory] Nest application successfully started on port 3000
[InstanceLoader] BullModule dependencies initialized
```

**Webhook received:**
```
Processing webhook from user 123456789
Handling callback query: menu:plans
```

**Errors to watch for:**
```
Error handling update: 
InvalidProcessorClassError:
Nest can't resolve dependencies:
```

### Monitor Database Connections

```bash
# Check if database is accessible
mysql -u root -p -h localhost -e "SELECT COUNT(*) FROM subscription_plans;"
```

### Check Telegram Webhook

```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

Expected:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain/webhook/subscription-telegram",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "allowed_updates": ["message", "callback_query"]
  }
}
```

## Test Checklist

- [ ] `/subscriptions` command works
- [ ] Main menu displays with all 8 buttons
- [ ] Can click "💳 Manage Plans" without errors
- [ ] Can click "↩️ Back to Main Menu" to return
- [ ] Each submenu displays its own buttons
- [ ] `/help` command works
- [ ] Non-command text triggers "Please use /subscriptions..."
- [ ] Unauthorized user doesn't get response
- [ ] Button responses are instant (< 1 second)
- [ ] Switching between menus works smoothly
- [ ] No crashes or 500 errors in logs
- [ ] Analytics buttons show formatted data
- [ ] Date range buttons work
- [ ] All navigation feels responsive

## Common Issues

### Issue: "Please use /subscriptions command" always appears

**Cause**: Could be that the command isn't being recognized as a command

**Fix**: 
- Verify text starts exactly with `/`
- Check bot token is correct
- Restart application

### Issue: Button clicks don't work

**Cause**: Webhook not properly configured

**Fix**:
```bash
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-domain/webhook/subscription-telegram"}'
```

### Issue: Authorization always fails

**Cause**: `TELEGRAM_ADMIN_CHAT_IDS` doesn't include your user ID

**Fix**:
1. Find your user ID: `https://api.telegram.org/bot<TOKEN>/getUpdates`
2. Add to `.env`: `TELEGRAM_ADMIN_CHAT_IDS=your_id_here`
3. Restart application

### Issue: "Not authorized" popup on buttons

**Cause**: User ID in callback query doesn't match authorized list

**Fix**: Same as above - verify `TELEGRAM_ADMIN_CHAT_IDS`

## Performance Notes

- Response time: < 1 second per button click
- Messages are edited in-place (no spam)
- Background jobs: Run on schedule (expiring check, usage reset, etc.)
- Concurrent users: Supports multiple admin users simultaneously

## Next Steps After Testing

1. ✅ Verify all buttons work
2. ✅ Test with actual data in production database
3. ✅ Monitor job scheduler for background tasks
4. ✅ Set up error alerts/monitoring
5. ✅ Train admins on using keyboard interface
6. ✅ Document any custom workflows
