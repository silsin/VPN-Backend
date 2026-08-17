# Module Architecture - Subscription Telegram Integration

## Overview

The subscription system is organized into two main module trees that work independently but share data through the database.

## Module Dependency Tree

```
AppModule
├── SubscriptionsModule
│   ├── TypeOrmModule (entities)
│   ├── ConfigModule
│   ├── BullModule (job queues)
│   ├── UsersModule (imported)
│   └── SubscriptionTelegramModule (imported)
│
├── SubscriptionTelegramModule (standalone but imported by SubscriptionsModule)
│   ├── TypeOrmModule (same entities)
│   ├── UsersModule (imported for UsersService)
│   ├── Controllers
│   │   └── SubscriptionTelegramController (webhook endpoint)
│   └── Services
│       ├── SubscriptionsService (from parent)
│       ├── UsageService (from parent)
│       ├── PaymentService (from parent)
│       ├── GooglePlayBillingService (from parent)
│       ├── SubscriptionTelegramKeyboardService
│       ├── SubscriptionTelegramHandlerService
│       └── SubscriptionAdminCommandsService
│
└── ConfigCheckerModule
    ├── TelegramAdminBotService (SEPARATE - for main bot)
    └── Other services (config, dialogs, ads, etc.)
```

## Module Relationships

### SubscriptionsModule

**Purpose**: Core subscription business logic

**Imports**:
- `TypeOrmModule` - Database access
- `ConfigModule` - Environment variables
- `BullModule` - Job queues
- `UsersModule` - User data access
- `SubscriptionTelegramModule` - Telegram interface

**Provides**:
- `SubscriptionsService`
- `PaymentService`
- `UsageService`
- `NotificationService`
- `SubscriptionJobService`
- `GooglePlayBillingService`
- Guards and controllers
- Database seeder

**Exports**:
- Main services
- Guards
- Security validators

### SubscriptionTelegramModule

**Purpose**: Telegram keyboard interface for subscription admin

**Imports**:
- `TypeOrmModule` - Direct entity access
- `UsersModule` - User lookup (IMPORTANT)

**Provides**:
- `SubscriptionsService` (re-provided with UsersModule context)
- `UsageService`
- `PaymentService`
- `GooglePlayBillingService`
- `SubscriptionTelegramKeyboardService`
- `SubscriptionTelegramHandlerService`
- `SubscriptionAdminCommandsService`

**Controllers**:
- `SubscriptionTelegramController` - Webhook at `/webhook/subscription-telegram`

**Why UsersModule is Needed**:
- `SubscriptionsService` depends on `UsersService`
- Without `UsersModule`, dependency resolution fails
- The module needs access to user data for subscription lookups

### ConfigCheckerModule

**Purpose**: Main Telegram bot for configuration management (SEPARATE)

**Does NOT Import**:
- `SubscriptionsModule` ✅ (avoids conflicts)
- `SubscriptionTelegramModule` ✅ (avoids conflicts)

**Services**:
- `TelegramAdminBotService` - Polls for messages
- Config/dialog/ads management

**Why Separate**:
- Prevents circular dependencies
- Allows independent operation
- Different webhook or polling strategy
- No conflict with subscription keyboard

## Data Flow

### User Commands Flow

```
User sends /subscriptions
         ↓
Telegram API webhook
         ↓
POST /webhook/subscription-telegram
         ↓
SubscriptionTelegramController
         ↓
handleMessage() or handleCallback()
         ↓
SubscriptionTelegramKeyboardService / HandlerService
         ↓
Call SubscriptionsService
         ↓
Database Query (TypeORM)
         ↓
Format Response
         ↓
Send via Telegram API
         ↓
User receives message with keyboard
```

### Dependency Resolution Flow

```
SubscriptionTelegramModule wants to provide SubscriptionsService
         ↓
SubscriptionsService needs UsersService
         ↓
UsersModule is imported → UsersService is available ✅
         ↓
SubscriptionsService can be instantiated
         ↓
All other services can also be instantiated
         ↓
SubscriptionTelegramController can be instantiated
         ↓
Webhook is ready to receive requests
```

## Key Design Decisions

### 1. Separate Module for Telegram Integration

**Why**: Avoid circular dependencies while keeping telegram code isolated

**How**: 
- Telegram module is self-contained
- Can be imported by main subscription module
- No need to reach up to parent

### 2. Direct Service Re-provisioning in Telegram Module

**Why**: Services need context with correct dependencies

**How**:
```typescript
@Module({
  providers: [
    SubscriptionsService,  // Re-provided here with telegram context
    UsageService,          // Needed by telegram handlers
    PaymentService,
    // ... etc
  ],
})
```

**Result**: Services have all dependencies available in telegram context

### 3. UsersModule as Required Dependency

**Why**: SubscriptionsService → UsersService → User lookups

**Without it**: 
```
Error: Nest can't resolve UsersService
```

**With it**:
```
UsersModule provides UsersService
SubscriptionsService gets UsersService ✅
SubscriptionTelegramHandlerService gets SubscriptionsService ✅
```

### 4. Separate Webhook Endpoint

**Why**: Independent from main bot

**Architecture**:
- Main bot: Polls API (TelegramAdminBotService in ConfigCheckerModule)
- Telegram interface: Receives webhooks (SubscriptionTelegramController)
- No interference between them

### 5. Database Access

**Why**: All modules need same database

**How**:
- Main `TypeOrmModule` in `app.module.ts`
- Each module imports its entities via `TypeOrmModule.forFeature()`
- Same database connection used by all

**Result**:
```typescript
// In SubscriptionsModule
TypeOrmModule.forFeature([SubscriptionPlan, UserSubscription, ...])

// In SubscriptionTelegramModule (same entities)
TypeOrmModule.forFeature([SubscriptionPlan, UserSubscription, ...])

// Both access same database ✅
```

## Avoiding Circular Dependencies

### ❌ What Causes Circular Dependencies

```
SubscriptionsModule imports SubscriptionTelegramModule
SubscriptionTelegramModule imports SubscriptionsModule
// Circular! ❌
```

### ✅ Current Solution

```
SubscriptionsModule imports SubscriptionTelegramModule
SubscriptionTelegramModule does NOT import SubscriptionsModule
// No circle ✅

// Instead, telegram module imports needed services directly
import { SubscriptionsService } from '../services/subscriptions.service';
import { UsageService } from '../services/usage.service';
```

### Key Rule

**Modules can only import their dependencies, not their dependents.**

```
Parent imports Child ✅
Child does NOT import Parent ✅

Parent imports Child ❌
Child imports Parent ❌ (CIRCLE!)
```

## Module Exports

### What SubscriptionsModule Exports

```typescript
exports: [
  SubscriptionsService,
  UsageService,
  PaymentService,
  SubscriptionGuard,
  FeatureAccessGuard,
  DeviceLimitGuard,
  GooglePlayBillingService,
]
```

**Used by**: REST API controllers, other modules

### What SubscriptionTelegramModule Exports

```typescript
exports: [
  SubscriptionAdminCommandsService,
  SubscriptionTelegramKeyboardService,
  SubscriptionTelegramHandlerService,
]
```

**Used by**: Re-exported by SubscriptionsModule (if needed)

## Runtime Behavior

### Module Initialization Order

1. **TypeOrmModule** - Connect to database
2. **UsersModule** - Load user service
3. **SubscriptionsModule** - Load core services
4. **SubscriptionTelegramModule** - Load telegram interface
5. **All other modules**

### When User Sends `/subscriptions`

1. Telegram sends webhook to `/webhook/subscription-telegram`
2. `SubscriptionTelegramController` receives request
3. Checks authorization against `TELEGRAM_ADMIN_CHAT_IDS`
4. Calls `SubscriptionTelegramHandlerService`
5. Handler calls `SubscriptionsService` for data
6. `SubscriptionsService` queries database via `UsersService`
7. Response is formatted and sent back to Telegram

### Database Access

All modules use same database instance:
- Single TypeORM connection pool
- Entity repositories shared across modules
- Transactions work across services

## Troubleshooting Module Issues

### Issue: "Can't resolve UsersService"

**Cause**: UsersModule not imported
**Fix**: Add to imports: `UsersModule`

### Issue: "Circular dependency detected"

**Cause**: Module A imports B, B imports A
**Fix**: Remove import from one direction (typically child doesn't import parent)

### Issue: "Service not exported"

**Cause**: Service not in module's exports
**Fix**: Add to exports array

### Issue: "Entity not recognized"

**Cause**: Entity not in TypeOrmModule.forFeature()
**Fix**: Add to forFeature array

## Best Practices

1. **Import modules, not services** (except in providers)
   ```typescript
   imports: [UsersModule]  // ✅ Import module
   // NOT: imports: [UsersService]  // ❌ Wrong
   ```

2. **Re-provide services if needed in new context**
   ```typescript
   @Module({
     imports: [UsersModule],
     providers: [SubscriptionsService],  // ✅ Re-provided here
   })
   ```

3. **Keep modules independent**
   ```typescript
   // Parent imports child ✅
   // Child does NOT import parent ✅
   ```

4. **Export what's used by others**
   ```typescript
   exports: [UsefulService]  // ✅ Others can import this
   ```

5. **Don't export implementation details**
   ```typescript
   // ❌ Don't export private utilities
   exports: [InternalHelper]
   
   // ✅ Export public APIs
   exports: [PublicService]
   ```

## Current Status

✅ All modules properly configured
✅ No circular dependencies
✅ All services can be instantiated
✅ Database access works
✅ Telegram webhook ready

---

**Architecture is stable and production-ready.**
