# Settings Module - Timer Configuration

This module provides comprehensive timer management for the VPN application, including configuration, control, and monitoring capabilities.

## Features

### Timer Categories

1. **Connection Management Timers**
   - Auto-disconnect timer
   - Connection timeout timer
   - Status polling timer

2. **Statistics and Monitoring Timers**
   - VPN statistics timer
   - Protocol statistics timer
   - IKEv2 statistics timer

3. **User Session Timers**
   - User connection duration tracking

4. **Performance and UI Timers**
   - Debounce delay timer
   - Background ping timer
   - Server selection delay timer

## API Endpoints

### Timer Configuration
- `GET /api/v1/timers/config` - Get all timer configurations
- `PUT /api/v1/timers/config` - Update timer configurations (Admin only)

### Timer Control
- `POST /api/v1/timers/:timerId/control` - Control individual timer (Admin only)
- `GET /api/v1/timers/status` - Get real-time timer status

### Timer Events
- `POST /api/v1/timers/events` - Log timer events for analytics

## Database Schema

### Timer Configurations
Stores timer configuration settings with categories and constraints.

### Timer Events
Logs timer events for analytics and monitoring.

### Timer Status
Maintains real-time status of all timers.

## Usage Examples

### Get Timer Configurations
```bash
GET /api/v1/timers/config
```

### Update Timer Configuration
```bash
PUT /api/v1/timers/config
{
  "timer_updates": [
    {
      "timer_id": "auto_disconnect",
      "enabled": true,
      "duration_seconds": 300
    }
  ]
}
```

### Control Timer
```bash
POST /api/v1/timers/auto_disconnect/control
{
  "action": "start",
  "parameters": {
    "duration_override": 600
  }
}
```

## Files Structure

- `timer.service.ts` - Core timer management service
- `timer.controller.ts` - REST API endpoints
- `entities/` - Database entities
  - `timer-configuration.entity.ts` - Timer configuration entity
  - `timer-event.entity.ts` - Timer event entity
  - `timer-status.entity.ts` - Timer status entity
- `timer-configs.json` - Default timer configurations
- `timer-inventory.md` - Complete timer inventory
- `timer-api-specification.md` - Detailed API specification

## Security

- Timer control endpoints require admin authentication
- All timer events are logged for audit purposes
- Configuration changes are tracked with timestamps

## Integration

The timer system integrates with:
- VPN connection management
- Statistics collection
- User session tracking
- Performance monitoring
- Background services
