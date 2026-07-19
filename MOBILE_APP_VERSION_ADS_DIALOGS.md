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

## 3. Dialogs with buttons & links

Dialogs already support `actionUrl` and `buttons` on the API. Mobile:

```http
GET /api/v1/mobile/dialogs?platform=android
```

Each dialog may include:

```json
{
  "id": "...",
  "title": "Update available",
  "message": "...",
  "actionUrl": "https://example.com",
  "buttons": [
    {
      "label": "Update",
      "actionUrl": "https://play.google.com/...",
      "style": "primary"
    },
    {
      "label": "Later",
      "action": "dismiss",
      "style": "secondary"
    }
  ]
}
```

Button fields: `label` (required), `actionUrl` and/or `action`, optional `style` (`primary` \| `secondary` \| `danger` \| `success`).

Track interactions:

```http
POST /api/v1/mobile/dialogs/:id/click   { "deviceId": "..." }
POST /api/v1/mobile/dialogs/:id/dismiss { "deviceId": "..." }
```

### Telegram bot: create dialog with link + buttons

```
/dialogadd in-app all high
```

Then wizard steps:

1. **Title**
2. **Message**
3. **Action link** — full `https://...` URL, or `-` to skip
4. **Buttons** — one per line, or `-` to skip:

```
Update|https://play.google.com/store/apps/details?id=com.flyvpn|primary
Later|dismiss|secondary
```

Format: `Label|url-or-action|style`

Then `/dialogenable <uuid>` to publish to mobile.

See also: `DIALOG_BUTTONS_FRONTEND_GUIDE.md` for UI patterns.

---

## Quick reference

| Feature | Mobile endpoint | Auth |
|---------|-----------------|------|
| Upgrade check | `GET /mobile/app-version?platform=&build=` | Public |
| Ad failure report | `POST /mobile/ads/failure-report` | Public |
| Active dialogs | `GET /mobile/dialogs?platform=` | Public |
| Admin version settings | `PUT /settings` `{ "app_version": {...} }` | JWT admin |
| Admin ad reports | `GET /ads/failure-reports` | JWT |
