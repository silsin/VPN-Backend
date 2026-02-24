# Timer Categories Found in Codebase

## 1. Connection Management Timers

### Home Header Connection Timer (home_screen.dart)
- **Purpose**: Countdown until auto-disconnect
- **Interval**: 1 second
- **Duration**: Configurable (default 3 minutes)
- **Backend Control**: Start/stop/reset duration

### Connection Timeout Timer (vpn_state_listener.dart)
- **Purpose**: Connection attempt timeout
- **Interval**: 15 seconds (one-shot)
- **Backend Control**: Timeout duration configuration

### Status Check Timer (vpn_provider.dart, v2ray_service.dart)
- **Purpose**: Periodic VPN status polling
- **Interval**: 2 seconds
- **Backend Control**: Enable/disable polling interval

## 2. Statistics and Monitoring Timers

### VPN Statistics Timer (vpn_manager.dart)
- **Purpose**: Connection statistics collection
- **Interval**: 5 seconds
- **Backend Control**: Enable/disable statistics collection

### Enhanced Protocol Stats Timer (enhanced_protocol_service.dart)
- **Purpose**: Real-time protocol statistics
- **Interval**: 5 seconds
- **Backend Control**: Enable/disable enhanced stats

### FlutterVPN Stats Timer (flutter_vpn_service.dart)
- **Purpose**: IKEv2 connection statistics
- **Interval**: 2 seconds
- **Backend Control**: Enable/disable IKEv2 stats

### IKEv2 Stats Timer (ikev2_service.dart)
- **Purpose**: IKEv2 protocol statistics
- **Interval**: 2 seconds
- **Backend Control**: Enable/disable IKEv2 stats

## 3. User Session Timers

### User Connection Timer (auth_provider.dart)
- **Purpose**: Track user connection duration
- **Interval**: 1 second
- **Backend Control**: Start/stop session tracking

## 4. Performance and UI Timers

### Debounce Timer (home_screen.dart)
- **Purpose**: UI update debouncing
- **Interval**: 300ms
- **Backend Control**: Debounce delay configuration

### Background Ping Timer (ping_service.dart)
- **Purpose**: Server latency monitoring
- **Interval**: Configurable (default 60 seconds)
- **Backend Control**: Enable/disable interval configuration

### Server Selection Delay Timer (home_screen.dart)
- **Purpose**: Delay for auto-server selection
- **Interval**: 2 seconds (one-shot)
- **Backend Control**: Selection delay configuration
