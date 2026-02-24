# Timer Backend API Specification

## Timer Configuration Endpoints

### GET /api/v1/timers/config
Retrieve current timer configurations

**Response:**
```json
{
  "timer_configs": {
    "connection_management": {
      "auto_disconnect": {
        "enabled": true,
        "default_duration_seconds": 180,
        "max_duration_seconds": 3600,
        "backend_control": true
      },
      "connection_timeout": {
        "enabled": true,
        "timeout_seconds": 15,
        "min_timeout": 5,
        "max_timeout": 60,
        "backend_control": true
      },
      "status_polling": {
        "enabled": true,
        "interval_seconds": 2,
        "min_interval": 1,
        "max_interval": 10,
        "backend_control": true
      }
    },
    "statistics": {
      "vpn_stats": {
        "enabled": true,
        "interval_seconds": 5,
        "backend_control": true
      },
      "protocol_stats": {
        "enabled": true,
        "interval_seconds": 5,
        "backend_control": true
      },
      "ik_e_v2_stats": {
        "enabled": true,
        "interval_seconds": 2,
        "backend_control": true
      }
    },
    "monitoring": {
      "background_ping": {
        "enabled": true,
        "interval_seconds": 60,
        "min_interval": 30,
        "max_interval": 300,
        "backend_control": true
      },
      "session_tracking": {
        "enabled": true,
        "interval_seconds": 1,
        "backend_control": true
      }
    },
    "ui_performance": {
      "debounce_delay": {
        "milliseconds": 300,
        "min_delay": 100,
        "max_delay": 1000,
        "backend_control": true
      },
      "server_selection_delay": {
        "seconds": 2,
        "min_delay": 1,
        "max_delay": 10,
        "backend_control": true
      }
    }
  }
}
```

### PUT /api/v1/timers/config
Update timer configurations

**Request:**
```json
{
  "timer_updates": [
    {
      "timer_id": "auto_disconnect",
      "enabled": true,
      "duration_seconds": 300
    },
    {
      "timer_id": "background_ping",
      "interval_seconds": 120
    }
  ]
}
```

## Timer Control Endpoints

### POST /api/v1/timers/{timer_id}/control
Control individual timer operations

**Request:**
```json
{
  "action": "start|stop|restart|pause",
  "parameters": {
    "duration_override": 600,
    "interval_override": 10
  }
}
```

### GET /api/v1/timers/status
Get real-time status of all timers

**Response:**
```json
{
  "timers": [
    {
      "id": "auto_disconnect",
      "status": "running|stopped|paused",
      "remaining_seconds": 145,
      "last_updated": "2024-01-15T10:30:00Z"
    }
  ]
}
```

## Timer Events and Logging

### POST /api/v1/timers/events
Log timer events for analytics

**Request:**
```json
{
  "timer_id": "auto_disconnect",
  "event_type": "started|stopped|completed|timeout",
  "timestamp": "2024-01-15T10:30:00Z",
  "user_id": "user123",
  "metadata": {
    "trigger_reason": "manual|automatic|backend_control",
    "duration_used": 180
  }
}
```

## Backend Storage Schema

```sql
CREATE TABLE timer_configurations (
    id VARCHAR(50) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    interval_seconds INTEGER,
    duration_seconds INTEGER,
    min_value INTEGER,
    max_value INTEGER,
    backend_control BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE timer_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    timer_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON,
    INDEX idx_timer_events_timer_id (timer_id),
    INDEX idx_timer_events_timestamp (timestamp)
);

CREATE TABLE timer_status (
    timer_id VARCHAR(50) PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    remaining_seconds INTEGER,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id VARCHAR(100)
);
```

This backend specification allows complete control over all timers in the VPN application, enabling remote configuration, monitoring, and analytics collection for timer-related events.
