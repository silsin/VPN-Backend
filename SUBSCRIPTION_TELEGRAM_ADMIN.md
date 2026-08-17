# Subscription Management via Telegram Bot

Admins can manage subscriptions directly from Telegram using the admin bot. This provides real-time control without needing to access the admin dashboard.

---

## Setup

### 1. Enable Telegram Bot in Environment Variables

Add to `.env`:

```bash
# Telegram Admin Bot
TELEGRAM_ADMIN_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_ADMIN_BOT_ENABLED=true
TELEGRAM_ADMIN_CHAT_IDS=123456789,987654321  # Comma-separated admin user IDs
```

### 2. Get Your Telegram User ID

1. Start a chat with [@userinfobot](https://t.me/userinfobot)
2. Copy your user ID (e.g., `123456789`)
3. Add it to `TELEGRAM_ADMIN_CHAT_IDS`

### 3. Create Telegram Bot

1. Chat with [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Choose bot name and username
4. Copy the token to `TELEGRAM_ADMIN_BOT_TOKEN`

---

## Subscription Commands

All commands start with `/subs`. Get help anytime:

```
/subhelp
```

### Plan Management

**List all plans:**
```
/subplans
```

Shows all subscription plans with:
- Plan name and price
- Duration
- Device limits
- Data limits
- Features included
- Active status

**View plan details:**
```
/subplan <plan_id>
```

Shows full details for a specific plan.

**Toggle plan active status:**
```
/subplanactive <plan_id>
```

Activates/deactivates a plan (won't show to users if inactive).

---

### User Subscription Management

**View user subscription:**
```
/subsuser <user_id_or_email>
```

Shows:
- Current plan
- Expiry date
- Days remaining
- Auto-renewal status
- Failed renewal attempts

**Extend subscription by days:**
```
/subsextend <user_id> <days>
```

Example: `/subsextend 123e4567-e89b-12d3-a456-426614174000 30`

Adds 30 days to user's subscription.

**Upgrade user to higher tier:**
```
/subsupgrade <user_id> <plan_id>
```

Changes user's subscription to a different plan immediately.

**Suspend subscription:**
```
/subssuspend <user_id>
```

Disables user's subscription (they lose access to premium features).

**Reactivate suspended subscription:**
```
/subsreactivate <user_id>
```

Re-enables a suspended subscription.

---

### Payments & Refunds

**List payments from last N days:**
```
/subspayments <days>
```

Shows payment statistics for the last N days:
- Total transactions
- Successful payments
- Failed payments
- Success rate
- Total revenue

**Refund a payment:**
```
/subrefund <payment_id> [amount]
```

Issues a refund. If amount omitted, refunds full amount.

Example: `/subrefund abc123def456`

---

### Analytics & Reports

**Subscription statistics:**
```
/subsstats
```

Shows system-wide statistics:
- Active subscriptions count
- Expired subscriptions
- Cancelled subscriptions
- Monthly Recurring Revenue (MRR)
- Annual Recurring Revenue (ARR)
- Breakdown by plan

**Subscriptions expiring soon:**
```
/subsexpiring [days]
```

Lists users whose subscriptions expire in next N days (default 7).

Example: `/subsexpiring 14` - Shows subscriptions expiring in 14 days

**Revenue report:**
```
/subsrevenue <days>
```

Shows revenue for last N days:
- Total revenue
- Average daily revenue
- Transaction count
- Success rate

**Data usage statistics:**
```
/subsusage
```

Shows system-wide data usage:
- Active cycles
- Users exceeding limit
- Average data used
- Peak usage

---

## Example Workflows

### Daily Admin Check

```
/subsstats          ← Check overall health
/subsexpiring 7     ← Who's expiring soon?
/subspayments 1     ← Any failed payments?
```

### Handle Customer Issue

```
/subsuser john@example.com           ← Check their subscription
/subsextend <user_id> 7              ← Give them 7 days for issue
/subsrevenue 7                        ← Confirm system revenue
```

### Manage Plan Changes

```
/subplans                            ← See all plans
/subplanactive <plan_id>             ← Disable old plan
/subsupgrade <user_id> <new_plan>   ← Move customer to new plan
```

### Refund Process

```
/subspayments 30                     ← Find failed payment
/subrefund <payment_id>              ← Refund it
/subsuser <user_id>                  ← Verify subscription restored
```

---

## Command Reference

| Command | Usage | Purpose |
|---------|-------|---------|
| `/subhelp` | `/subhelp` | Show subscription help |
| `/subplans` | `/subplans` | List all plans |
| `/subplan` | `/subplan <id>` | Show plan details |
| `/subplanactive` | `/subplanactive <id>` | Toggle plan active |
| `/subsuser` | `/subsuser <id/email>` | View user subscription |
| `/subsextend` | `/subsextend <id> <days>` | Add days to subscription |
| `/subsupgrade` | `/subsupgrade <id> <plan>` | Upgrade user plan |
| `/subssuspend` | `/subssuspend <id>` | Suspend subscription |
| `/subsreactivate` | `/subsreactivate <id>` | Reactivate subscription |
| `/subspayments` | `/subspayments <days>` | Payment stats |
| `/subrefund` | `/subrefund <payment> [amount]` | Issue refund |
| `/subsstats` | `/subsstats` | System statistics |
| `/subsexpiring` | `/subsexpiring [days]` | Expiring soon |
| `/subsrevenue` | `/subsrevenue <days>` | Revenue report |
| `/subsusage` | `/subsusage` | Data usage stats |

---

## Response Format

Responses are formatted as HTML for better readability:

- **Bold text** = Important values (`<b>text</b>`)
- **Monospace** = IDs and codes (`<code>id</code>`)
- **✅/❌** = Status indicators
- **Headers** = Section titles

Example response:
```
💳 Subscription Statistics

Active Subscriptions
  Total Active: 1,250
  Expired: 45
  Cancelled: 12

Revenue
  MRR: $4,500.00
  ARR: $54,000.00
  Last Month: $4,200.00

By Plan
  Monthly: 800 users
  Quarterly: 300 users
  Annual: 150 users
```

---

## Security

✅ **Security Features:**
- Only authorized admins can use commands (checked against `TELEGRAM_ADMIN_CHAT_IDS`)
- All operations logged
- No sensitive data in responses (passwords never shown)
- Uses Telegram Bot API over HTTPS
- Commands can be audited via application logs

---

## Troubleshooting

### Bot not responding

1. Check `TELEGRAM_ADMIN_BOT_TOKEN` is correct
2. Verify `TELEGRAM_ADMIN_BOT_ENABLED=true`
3. Confirm your user ID is in `TELEGRAM_ADMIN_CHAT_IDS`
4. Check application logs for errors

### Command not found

- Make sure command is spelled correctly
- All commands start with `/subs`
- Use `/subhelp` to see full list

### "Not authorized" error

- Your Telegram user ID is not in `TELEGRAM_ADMIN_CHAT_IDS`
- Get your ID from [@userinfobot](https://t.me/userinfobot)
- Add it to `.env` and restart the application

### Payment refund fails

- Ensure payment ID is correct
- Check Stripe is configured properly
- Verify payment status is "completed"

---

## Future Enhancements

Planned features for Telegram subscription management:

- [ ] Inline keyboards for quick actions
- [ ] User search by email
- [ ] Bulk operations (extend multiple users)
- [ ] Alert notifications (failed payments, expiring soon)
- [ ] Subscription reports export
- [ ] Usage analytics graphs
- [ ] A/B testing plan promotions
- [ ] Webhook alerts for system events

---

## Integration with Main Bot

The subscription commands integrate with the existing Telegram admin bot. To add these commands to your bot:

1. Import `SubscriptionAdminCommandsService` in `TelegramAdminBotService`
2. Add subscription command handlers in message routing
3. Use `/subhelp` command in main bot help text

Example integration:
```typescript
// In telegram-admin-bot.service.ts
case '/subhelp':
  await this.send(chatId, this.subscriptionCommandsService.getSubscriptionHelpText());
  break;
```

---

## Monitoring & Analytics

Track subscription management activity:

```bash
# View subscription-related logs
tail -f logs/subscription.log

# Find Telegram admin actions
grep "TELEGRAM" logs/*.log

# Monitor payment processing
grep "Payment\|Refund" logs/subscription.log
```

---

## Contact & Support

For issues or suggestions regarding Telegram subscription management:

1. Check application logs for error details
2. Review this documentation
3. Contact development team with specific error message
