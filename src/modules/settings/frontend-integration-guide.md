# Frontend Integration Guide - Timer Management System

## Overview

This guide provides comprehensive information for frontend developers to integrate the timer management system into the VPN application UI. The system allows administrators to configure, monitor, and control various timers used throughout the VPN application.

## Timer Categories and UI Components

### 1. Connection Management Timers

#### Auto-Disconnect Timer
**Purpose**: Countdown until automatic VPN disconnection
**UI Component**: Timer display with countdown
**Location**: Home screen header
**Features**:
- Real-time countdown display (MM:SS format)
- Start/Stop/Reset controls
- Duration configuration slider (1 min - 60 min)
- Visual indicators (green: running, red: stopped, yellow: paused)

#### Connection Timeout Timer
**Purpose**: Connection attempt timeout
**UI Component**: Progress indicator
**Location**: Connection dialog
**Features**:
- Progress bar showing connection attempt progress
- Timeout configuration (5-60 seconds)
- Error message display on timeout
- Retry button functionality

#### Status Polling Timer
**Purpose**: Periodic VPN status checking
**UI Component**: Background service indicator
**Location**: Status bar
**Features**:
- Live status indicator (online/offline)
- Polling interval configuration (1-10 seconds)
- Connection quality metrics
- Last update timestamp

### 2. Statistics and Monitoring Timers

#### VPN Statistics Timer
**Purpose**: Connection statistics collection
**UI Component**: Statistics dashboard
**Location**: Statistics screen
**Features**:
- Real-time data updates every 5 seconds
- Charts for bandwidth, latency, uptime
- Enable/disable toggle
- Export functionality

#### Protocol Statistics Timer
**Purpose**: Real-time protocol statistics
**UI Component**: Protocol metrics panel
**Location**: Advanced settings
**Features**:
- Protocol-specific metrics (V2Ray, IKEv2, etc.)
- Performance indicators
- Enable/disable controls
- Historical data view

#### IKEv2 Statistics Timer
**Purpose**: IKEv2 protocol statistics
**UI Component**: IKEv2 status panel
**Location**: Protocol settings
**Features**:
- IKEv2 connection metrics
- Update interval display
- Enable/disable toggle
- Debug information

### 3. User Session Timers

#### User Connection Timer
**Purpose**: Track user connection duration
**UI Component**: Session duration display
**Location**: User profile/connection status
**Features**:
- Session duration counter
- Start/stop tracking
- Session history
- Usage statistics

### 4. Performance and UI Timers

#### Debounce Timer
**Purpose**: UI update debouncing
**UI Component**: Performance settings
**Location**: Settings > Performance
**Features**:
- Debounce delay slider (100-1000ms)
- Real-time preview
- Performance impact indicator
- Reset to default

#### Background Ping Timer
**Purpose**: Server latency monitoring
**UI Component**: Server list with latency
**Location**: Server selection screen
**Features**:
- Live latency indicators for each server
- Ping interval configuration (30-300 seconds)
- Server quality badges
- Auto-select best server option

#### Server Selection Delay Timer
**Purpose**: Delay for auto-server selection
**UI Component**: Auto-selection settings
**Location**: Server settings
**Features**:
- Delay configuration (1-10 seconds)
- Enable/disable auto-selection
- Selection criteria settings
- Preview functionality

## API Integration

### Base URL
```
/api/v1/timers
```

### Authentication
- Timer configuration endpoints require JWT token with admin role
- Status endpoints are accessible to authenticated users
- Event logging endpoints accept user context

### Key API Calls

#### Get Timer Configurations
```javascript
const getTimerConfigs = async () => {
  const response = await fetch('/api/v1/timers/config', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

#### Update Timer Configuration
```javascript
const updateTimerConfig = async (updates) => {
  const response = await fetch('/api/v1/timers/config', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ timer_updates: updates })
  });
  return response.json();
};
```

#### Control Timer
```javascript
const controlTimer = async (timerId, action, parameters = {}) => {
  const response = await fetch(`/api/v1/timers/${timerId}/control`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, parameters })
  });
  return response.json();
};
```

#### Get Timer Status
```javascript
const getTimerStatus = async () => {
  const response = await fetch('/api/v1/timers/status', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

## UI Components Implementation

### Timer Display Component
```typescript
interface TimerDisplayProps {
  timerId: string;
  title: string;
  duration?: number;
  remaining?: number;
  status: 'running' | 'stopped' | 'paused';
  showControls?: boolean;
  onControl?: (action: string) => void;
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timerId,
  title,
  duration,
  remaining,
  status,
  showControls = false,
  onControl
}) => {
  // Implementation for timer display with controls
};
```

### Configuration Panel Component
```typescript
interface TimerConfigProps {
  category: string;
  timers: TimerConfig[];
  onUpdate: (updates: TimerUpdate[]) => void;
}

const TimerConfigPanel: React.FC<TimerConfigProps> = ({
  category,
  timers,
  onUpdate
}) => {
  // Implementation for configuration panel
};
```

### Status Indicator Component
```typescript
interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'connecting';
  lastUpdate: Date;
  quality?: 'excellent' | 'good' | 'poor';
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  lastUpdate,
  quality
}) => {
  // Implementation for status indicator
};
```

## State Management

### Redux Store Structure
```typescript
interface TimerState {
  configurations: Record<string, TimerConfig>;
  statuses: Record<string, TimerStatus>;
  events: TimerEvent[];
  loading: boolean;
  error: string | null;
}

// Actions
const fetchTimerConfigs = () => ({ type: 'FETCH_TIMER_CONFIGS' });
const updateTimerConfig = (updates: TimerUpdate[]) => ({ type: 'UPDATE_TIMER_CONFIG', payload: updates });
const controlTimer = (timerId: string, action: string, params?: any) => ({ type: 'CONTROL_TIMER', payload: { timerId, action, params } });
const fetchTimerStatus = () => ({ type: 'FETCH_TIMER_STATUS' });
```

### React Hooks
```typescript
const useTimerConfig = (timerId: string) => {
  // Custom hook for timer configuration
};

const useTimerStatus = (timerId: string) => {
  // Custom hook for timer status
};

const useTimerControl = () => {
  // Custom hook for timer control operations
};
```

## Real-time Updates

### WebSocket Integration
```typescript
const useTimerWebSocket = () => {
  useEffect(() => {
    const ws = new WebSocket('/ws/timers');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Handle real-time timer updates
    };
    
    return () => ws.close();
  }, []);
};
```

### Polling Fallback
```typescript
const useTimerPolling = (interval: number = 5000) => {
  useEffect(() => {
    const poll = setInterval(() => {
      // Fetch timer status updates
    }, interval);
    
    return () => clearInterval(poll);
  }, [interval]);
};
```

## Error Handling

### Common Error Scenarios
1. **Authentication Errors**: Redirect to login
2. **Permission Errors**: Show admin access required message
3. **Network Errors**: Display retry option
4. **Validation Errors**: Show field-specific error messages

### Error Component
```typescript
const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Implementation for error handling
};
```

## Performance Considerations

### Optimization Strategies
1. **Debounce API Calls**: Prevent excessive requests
2. **Lazy Loading**: Load timer configurations on demand
3. **Caching**: Cache timer configurations locally
4. **Virtual Scrolling**: For large timer lists
5. **Memoization**: Prevent unnecessary re-renders

### Memory Management
```typescript
// Cleanup timers on component unmount
useEffect(() => {
  return () => {
    // Clear intervals, timeouts, and subscriptions
  };
}, []);
```

## Accessibility

### ARIA Labels
```typescript
<TimerDisplay
  aria-label="Auto disconnect timer"
  aria-describedby="timer-status"
  role="timer"
/>
```

### Keyboard Navigation
- Tab order for timer controls
- Keyboard shortcuts for common actions
- Screen reader support for timer announcements

## Testing

### Unit Tests
```typescript
describe('TimerDisplay', () => {
  it('should display correct remaining time');
  it('should handle start/stop controls');
  it('should update status correctly');
});
```

### Integration Tests
```typescript
describe('Timer Integration', () => {
  it('should fetch and display timer configurations');
  it('should update timer settings via API');
  it('should handle real-time status updates');
});
```

## Deployment Considerations

### Environment Variables
```
REACT_APP_TIMER_API_BASE_URL=/api/v1/timers
REACT_APP_TIMER_UPDATE_INTERVAL=5000
REACT_APP_TIMER_WEBSOCKET_URL=/ws/timers
```

### Feature Flags
```typescript
const TIMER_FEATURES = {
  ADVANCED_CONTROLS: process.env.REACT_APP_ENABLE_ADVANCED_TIMER_CONTROLS,
  REAL_TIME_UPDATES: process.env.REACT_APP_ENABLE_TIMER_REAL_TIME,
  ANALYTICS: process.env.REACT_APP_ENABLE_TIMER_ANALYTICS
};
```

## Support and Troubleshooting

### Common Issues
1. **Timer Not Updating**: Check WebSocket connection
2. **Configuration Not Saving**: Verify admin permissions
3. **Status Inconsistency**: Refresh timer status
4. **Performance Issues**: Check update intervals

### Debug Tools
- Timer state inspector
- API request logger
- WebSocket connection monitor
- Performance profiler

This comprehensive guide should enable frontend developers to fully integrate the timer management system with proper UI components, state management, and real-time updates.
