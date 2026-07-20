# Mobile integration guide — App version, Ad failure reports, Dialogs

Base URL prefix: `/api/v1`  
Auth: endpoints below marked **public** need no JWT (same pattern as `GET /mobile/dialogs`).

---

## 1. App versioning / upgrade dialog

### Admin: configure versions

`PUT /api/v1/settings` (JWT + admin)

```json
{
  "app_version": {
    "androidVersion": "2.1.0",
    "androidBuild": 42,
    "androidForceUpdate": true,
    "androidOptionalUpdate": false,
    "androidStoreUrl": "https://play.google.com/store/apps/details?id=com.flyvpn",
    "androidMessage": "Please update to continue using FlyVPN.",
    "iosVersion": "2.1.0",
    "iosBuild": 42,
    "iosForceUpdate": false,
    "iosOptionalUpdate": true,
    "iosStoreUrl": "https://apps.apple.com/app/idXXXXXXXX",
    "iosMessage": "A new version is available."
  }
}
```

Also readable via `GET /api/v1/settings` → `app_version` object.

### Mobile: check for update (public)

```http
GET /api/v1/mobile/app-version?platform=android&build=40&version=2.0.0
```

| Query | Required | Description |
|-------|----------|-------------|
| `platform` | yes | `android` or `ios` |
| `build` | recommended | Current **integer** build number |
| `version` | no | Version name (informational only) |

**Response example:**

```json
{
  "platform": "android",
  "latestVersion": "2.1.0",
  "latestBuild": 42,
  "forceUpdate": true,
  "optionalUpdate": false,
  "storeUrl": "https://play.google.com/store/apps/details?id=com.flyvpn",
  "message": "Please update to continue using FlyVPN.",
  "clientBuild": 40,
  "clientVersion": "2.0.0",
  "updateRequired": true,
  "updateType": "force"
}
```

`updateType` values:

| Value | Meaning |
|-------|---------|
| `force` | Client build &lt; latest **and** `forceUpdate` is true → blocking dialog, no dismiss |
| `optional` | Client build &lt; latest **and** `optionalUpdate` is true (and not force) → dismissible dialog |
| `none` | Up to date, or both flags false |

### Mobile implementation checklist

1. On app launch (and optionally resume), call `GET /mobile/app-version` with platform + build.
2. If `updateType === "force"`: show non-dismissible dialog → primary CTA opens `storeUrl`.
3. If `updateType === "optional"`: show dismissible dialog → CTA opens `storeUrl`, secondary dismisses.
4. Comparison is by **build number**, not version string.

---

## 2. Ad not-showing reports

When an ad fails to load/show, POST a report so ops can diagnose (API + Telegram bot).

### Mobile: submit report (public)

```http
POST /api/v1/mobile/ads/failure-report
Content-Type: application/json
```

```json
{
  "deviceId": "device-abc-123",
  "platform": "android",
  "placement": "main_page",
  "adType": "banner",
  "adId": "550e8400-e29b-41d4-a716-446655440000",
  "adUnitId": "ca-app-pub-xxx/yyy",
  "reason": "no_fill",
  "reasonDetail": "AdMob returned ERROR_CODE_NO_FILL",
  "errorCode": "ERROR_CODE_NO_FILL"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `deviceId` | yes | Stable device id |
| `platform` | yes | `android` \| `ios` |
| `reason` | yes | See enum below |
| `placement` | no | e.g. `main_page`, `splash`, `vpn_connect` |
| `adType` | no | `banner`, `video`, `reward` |
| `adId` | no | Backend ad UUID if known |
| `adUnitId` | no | AdMob unit id |
| `reasonDetail` | no | Free-text detail |
| `errorCode` | no | SDK / network error code |

**`reason` enum:**

| Value | Use when |
|-------|----------|
| `no_fill` | Network returned no ad |
| `network` | Connectivity / timeout to ad server |
| `blocked` | Ad blocked (policy, VPN, ad blocker) |
| `timeout` | Load timed out |
| `sdk_error` | AdMob / SDK exception |
| `not_configured` | Missing unit id / ads disabled |
| `other` | Anything else (prefer with `reasonDetail`) |

Returns `201` with the saved report.

### Admin API (JWT)

```http
GET /api/v1/ads/failure-reports?page=1&limit=20&platform=android&reason=no_fill
GET /api/v1/ads/failure-reports/summary?days=7
```

### Telegram admin bot

| Command | Description |
|---------|-------------|
| `/adsreports [page]` | Paginated recent failures |
| `/adssummary [days]` | Counts by reason/platform (default 7 days) |

### Mobile implementation checklist

1. On ad load failure callbacks, map SDK error → `reason` (+ `errorCode` / `reasonDetail`).
2. POST once per failure (debounce if the SDK fires repeatedly for the same attempt).
3. Do not block UI on report success/failure.

---

## 3. Dialogs with buttons, links & placement

Dialogs support `actionUrl`, `buttons`, and **`placement`** (when to show).

### Placement values

| Value | When mobile should show |
|-------|-------------------------|
| `splash` | Splash / launch screen |
| `before_connect` | Before VPN connect |
| `after_connect` | After VPN connect succeeds |
| `general` | General / home (or whenever you choose) |

### Repeatable (show again after dismiss)

| `repeatable` | Behavior |
|--------------|----------|
| `false` (default) | Show **once** per device — after dismiss/click it won’t return |
| `true` | Keep showing every time (promo / tip dialogs) |

### Create (admin / API)

```json
{
  "type": "in-app",
  "target": "all",
  "placement": "before_connect",
  "repeatable": true,
  "priority": "high",
  "title": "Connect tip",
  "message": "...",
  "buttons": [
    {
      "title": "OK",
      "isPrimary": true,
      "action": "dismiss"
    }
  ]
}
```

### Mobile fetch

Always pass `deviceId` so the server can hide one-shot dialogs already seen:

```http
GET /api/v1/mobile/dialogs?platform=android&placement=splash&deviceId=DEVICE_ID
GET /api/v1/mobile/dialogs?platform=android&placement=before_connect&deviceId=DEVICE_ID
GET /api/v1/mobile/dialogs?platform=android&placement=after_connect&deviceId=DEVICE_ID
```

After show, call dismiss/click so non-repeatable dialogs stay hidden:

```http
POST /api/v1/mobile/dialogs/:id/dismiss
{ "deviceId": "DEVICE_ID" }
```

### Mobile rules

1. Fetch with `platform` + `placement` + `deviceId`.
2. If `repeatable === true` → always show when returned.
3. If `repeatable === false` → show once; after dismiss/click server won’t return it again for that device (also keep local cache as backup).
4. Prefer server `deviceId` filter over only local “seen” list so reinstalls still respect one-shot dialogs.

Each dialog includes:

```json
{
  "id": "...",
  "placement": "before_connect",
  "title": "Update available",
  "message": "...",
  "actionUrl": "https://example.com",
  "buttons": [
    {
      "title": "Update",
      "actionUrl": "https://play.google.com/...",
      "isPrimary": true,
      "style": "primary"
    },
    {
      "title": "Later",
      "action": "dismiss",
      "isPrimary": false,
      "style": "secondary"
    }
  ]
}
```

Button fields:

| Field | Required | Description |
|-------|----------|-------------|
| `title` or `label` | yes (one of them) | Button text shown to the user |
| `isPrimary` | no | `true` = main CTA (also sets `style` to `primary`) |
| `style` | no | `primary` \| `secondary` \| `danger` \| `success` |
| `actionUrl` | one of url/action | Link to open |
| `action` | one of url/action | e.g. `dismiss` |

API accepts both `title`/`label` and `isPrimary`/`style`. Saved buttons always include `title`, `label`, `style`, and `isPrimary`.

Track interactions:

```http
POST /api/v1/mobile/dialogs/:id/click   { "deviceId": "..." }
POST /api/v1/mobile/dialogs/:id/dismiss { "deviceId": "..." }
```

### Telegram bot: create dialog with placement, link + buttons

```
/dialogadd in-app all high before_connect
/dialogadd in-app all normal splash repeatable
/dialogadd in-app all after_connect
```

Bot asks **repeatable?** (`yes`/`no`) if you didn’t pass `repeatable`/`once` in the command.

Then wizard steps:

1. **Title**
2. **Message**
3. **Action link** — full `https://...` URL, or `-` to skip
4. **Buttons** (repeatable):
   - Send **button title** (the text on the button)
   - Send `yes` / `no` for **primary**
   - Send **URL** or action (`dismiss`)
   - Repeat, or send `-` / `done` to finish

Then `/dialogenable <uuid>` to publish to mobile.

See also: `DIALOG_BUTTONS_FRONTEND_GUIDE.md` for UI patterns.

---

## Quick reference

| Feature | Mobile endpoint | Auth |
|---------|-----------------|------|
| Upgrade check | `GET /mobile/app-version?platform=&build=` | Public |
| Ad failure report | `POST /mobile/ads/failure-report` | Public |
| Active dialogs | `GET /mobile/dialogs?platform=&placement=&deviceId=` | Public |
| Admin version settings | `PUT /settings` `{ "app_version": {...} }` | JWT admin |
| Admin ad reports | `GET /ads/failure-reports` | JWT |
