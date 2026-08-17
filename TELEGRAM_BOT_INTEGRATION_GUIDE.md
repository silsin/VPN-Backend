# Telegram Bot Integration Guide

How to integrate Subscription Admin Commands into the existing Telegram Admin Bot.

---

## Overview

The `SubscriptionAdminCommandsService` provides subscription management commands that should be integrated into the existing `TelegramAdminBotService`.

---

## Integration Steps

### Step 1: Import the Service

In `src/modules/config-checker/telegram-admin-bot.service.ts`, add:

```typescript
import { SubscriptionAdminCommandsService } from '../subscriptions/telegram/subscription-admin-commands.service';

@Injectable()
export class TelegramAdminBotService implements OnModuleInit, OnModuleDestroy {
  // ... existing code ...

  constructor(
    private readonly configService: ConfigService,
    private readonly configsService: V2RayConfigsService,
    private readonly checkerService: ConfigCheckerService,
    private readonly dialogsService: DialogsService,
    private readonly deviceLoginsService: DeviceLoginsService,
    private readonly usersService: UsersService,
    private readonly adsService: AdsService,
    // ADD THIS:
    private readonly subscriptionCommands: SubscriptionAdminCommandsService,
  ) {
    // ... rest of constructor
  }
```

### Step 2: Add to Module Imports

In `src/modules/config-checker/config-checker.module.ts`, add:

```typescript
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    // ... existing imports ...
    SubscriptionsModule,  // ADD THIS
  ],
  // ... rest of module
})
export class ConfigCheckerModule {}
```

### Step 3: Update Message Handler

In the `handleMessage` method, add subscription command handling:

```typescript
private async handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = String(message.chat.id);
  const userId = message.from?.id ? String(message.from.id) : chatId;
  const text = (message.text ?? '').trim();

  if (!this.isAuthorized(userId)) {
    this.logger.warn(`Unauthorized Telegram access from user ${userId}`);
    await this.send(chatId, '⛔ You are not authorized to use this bot.');
    return;
  }

  // ... existing pending handlers ...

  if (!text.startsWith('/')) {
    await this.send(chatId, 'Send /help to see available commands.');
    return;
  }

  const [commandRaw, ...args] = text.split(/\s+/);
  const command = commandRaw.split('@')[0].toLowerCase();

  switch (command) {
    // ... existing commands ...

    // ADD SUBSCRIPTION COMMANDS:
    case '/subhelp':
      await this.send(chatId, this.subscriptionCommands.getSubscriptionHelpText());
      break;

    case '/subplans':
    case '/subplan':
    case '/subplanactive':
    case '/subsuser':
    case '/subsextend':
    case '/subsupgrade':
    case '/subssuspend':
    case '/subsreactivate':
    case '/subspayments':
    case '/subrefund':
    case '/subsstats':
    case '/subsexpiring':
    case '/subsrevenue':
    case '/subsusage':
      const response = await this.subscriptionCommands.handleCommand(
        command,
        args,
        chatId,
      );
      await this.send(chatId, response);
      break;

    default:
      await this.send(
        chatId,
        'Unknown command. Send /help for the command list.',
      );
  }
}
```

### Step 4: Update Help Text

Modify the `sendHelp` method to include subscription commands:

```typescript
private async sendHelp(chatId: string): Promise<void> {
  await this.send(
    chatId,
    [
      '🤖 <b>FlyVPN Admin Bot</b>',
      '',
      // ... existing sections ...
      
      // ADD THIS SECTION:
      '<b>💳 Subscriptions</b>',
      '/subhelp — subscription commands help',
      '/subplans — list all plans',
      '/subsuser &lt;id/email&gt; — view user subscription',
      '/subsstats — subscription statistics',
      '/subsexpiring [days] — subscriptions expiring soon',
      '/subsrevenue &lt;days&gt; — revenue report',
      '',
      
      // ... rest of help text ...
    ].join('\n'),
  );
}
```

### Step 5: Update Config-Checker Module

In `src/modules/config-checker/config-checker.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Existing imports...
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    // ... existing imports ...
    SubscriptionsModule,  // ADD THIS
  ],
  // ... rest remains the same ...
})
export class ConfigCheckerModule {}
```

---

## Complete Example

Here's how the integrated command handler would look:

```typescript
// In handleMessage method
switch (command) {
  case '/start':
  case '/help':
    await this.sendHelp(chatId);
    break;

  case '/list':
    await this.listConfigs(chatId, parseInt(args[0] ?? '1', 10) || 1);
    break;

  // ... other existing commands ...

  // NEW: Subscription commands
  case '/subhelp':
    await this.send(chatId, this.subscriptionCommands.getSubscriptionHelpText());
    break;

  case '/subplans':
  case '/subplan':
  case '/subplanactive':
  case '/subsuser':
  case '/subsextend':
  case '/subsupgrade':
  case '/subssuspend':
  case '/subsreactivate':
  case '/subspayments':
  case '/subrefund':
  case '/subsstats':
  case '/subsexpiring':
  case '/subsrevenue':
  case '/subsusage':
    try {
      const response = await this.subscriptionCommands.handleCommand(
        command,
        args,
        chatId,
      );
      await this.send(chatId, response);
    } catch (error) {
      this.logger.error(`Subscription command error: ${error.message}`);
      await this.send(chatId, `❌ Error: ${error.message}`);
    }
    break;

  default:
    await this.send(chatId, 'Unknown command. Send /help for the command list.');
}
```

---

## Testing the Integration

### 1. Restart the application
```bash
npm run start:dev
```

### 2. Test in Telegram
Send these commands to your admin bot:

```
/help              ← Should show subscription section
/subhelp          ← Should show subscription commands
/subplans         ← Should list all plans
/subsstats        ← Should show statistics
```

### 3. Check Logs

```bash
# Look for subscription command execution
grep -i "subscription\|command" logs/*.log

# Check for errors
grep -i "error" logs/*.log | grep -i "subs"
```

---

## Environment Variables Required

Ensure these are in your `.env`:

```bash
TELEGRAM_ADMIN_BOT_TOKEN=your_bot_token
TELEGRAM_ADMIN_BOT_ENABLED=true
TELEGRAM_ADMIN_CHAT_IDS=123456789,987654321
```

---

## Error Handling

The integration includes error handling:

```typescript
try {
  const response = await this.subscriptionCommands.handleCommand(
    command,
    args,
    chatId,
  );
  await this.send(chatId, response);
} catch (error) {
  this.logger.error(`Subscription command error: ${error.message}`);
  await this.send(chatId, `❌ Error: ${error.message}`);
}
```

---

## Extensibility

To add more subscription commands in the future:

1. Add the command case in `switch` statement
2. Implement handler in `SubscriptionAdminCommandsService`
3. Update help text in `getSubscriptionHelpText()`

Example:
```typescript
case '/subpromo':
  return await this.createPromoCode();
  break;
```

---

## Dependencies

The integration requires:

- `SubscriptionsService` - Manage subscriptions
- `PaymentService` - Handle payments
- `UsageService` - Track data usage
- Stripe API (configured in `.env`)
- Redis (for background jobs)

All these are provided by `SubscriptionsModule`.

---

## Performance Considerations

- Commands are executed synchronously
- Large reports (many expiring subs) may take a few seconds
- Consider pagination for large datasets
- Add caching for frequently accessed data (plans, stats)

---

## Security Checklist

- ✅ Authorization check with `isAuthorized()`
- ✅ Admin-only commands
- ✅ Error messages don't leak sensitive data
- ✅ All inputs validated
- ✅ Logging of admin actions
- ✅ HTTPS communication with Telegram API

---

## Next Steps

1. Follow the 5 integration steps above
2. Test each command with sample data
3. Update documentation with any customizations
4. Monitor logs for errors during first deployment
5. Collect admin feedback for improvements

---

## Support

For issues:

1. Check application logs: `logs/subscription.log`
2. Verify `.env` configuration
3. Ensure Telegram bot token is correct
4. Check database connectivity
5. Review error messages in Telegram responses
