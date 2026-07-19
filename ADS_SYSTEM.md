# Ads Management System Documentation

This document outlines the ads management system implemented in the FlyVPN backend. It covers ad creation, retrieval, updates, deletion, and settings management.

## Overview

The ads system allows administrators to manage advertisements displayed within the application. It supports various ad types (Banner, Video, Reward) and placements (Main Page, Splash, etc.) across different platforms (Android, iOS, Both).

## 1. Ad Management

### Data Model (`Ad`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Unique identifier for the ad. |
| `name` | `string` | Descriptive name of the ad. |
| `type` | `enum` | Type of ad: `banner`, `video`, `reward`. |
| `platform` | `enum` | Target platform: `android`, `ios`, `both`. |
| `adUnitId` | `string` | The ad unit ID provided by the ad network (e.g., AdMob). |
| `placement` | `enum` | Where the ad is displayed: `main_page`, `splash`, `video_ad`, `reward_video`, `vpn_connect`, `vpn_disconnect`, `server_change`. |
| `isActive` | `boolean` | Whether the ad is currently active. Default: `true`. |
| `createdAt` | `Date` | Timestamp of creation. |
| `updatedAt` | `Date` | Timestamp of last update. |

### Endpoints

#### Create Ad
-   **URL:** `/ads`
-   **Method:** `POST`
-   **Body:** `CreateAdDto`
    ```json
    {
      "name": "Main Page Banner",
      "type": "banner",
      "platform": "android",
      "adUnitId": "ca-app-pub-...",
      "placement": "main_page",
      "isActive": true
    }
    ```

#### Get All Ads
-   **URL:** `/ads`
-   **Method:** `GET`
-   **Response:** Array of `Ad` objects, ordered by `createdAt` descending.

#### Get Ad by ID
-   **URL:** `/ads/:id`
-   **Method:** `GET`
-   **Response:** Single `Ad` object.

#### Update Ad
-   **URL:** `/ads/:id`
-   **Method:** `PATCH`
-   **Body:** `UpdateAdDto` (Partial `CreateAdDto`)

#### Delete Ad
-   **URL:** `/ads/:id`
-   **Method:** `DELETE`
-   **Response:** 200 OK on success.

#### Get Ad Statistics
-   **URL:** `/ads/stats`
-   **Method:** `GET`
-   **Response:**
    ```json
    {
      "total": 10,
      "active": 8,
      "banners": 5,
      "videos": 5
    }
    ```

## 2. Ad Settings

The system also supports global settings for ads configuration (e.g., global switches, frequency caps).

### Data Model (`AdSetting`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `key` | `string` | Unique key for the setting. |
| `value` | `string` | Value of the setting. |
| `description` | `string` | Optional description. |

### Endpoints

#### Get All Settings
-   **URL:** `/ads/settings`
-   **Method:** `GET`
-   **Response:** Array of `AdSetting` objects.

#### Update Setting
-   **URL:** `/ads/settings`
-   **Method:** `PATCH`
-   **Body:** `UpdateAdSettingDto`
    ```json
    {
      "key": "some_setting_key",
      "value": "new_value"
    }
    ```

## 3. Ad failure reports (ads not showing)

Mobile clients report when an ad fails to display.

#### Mobile submit (public, no JWT)
-   **URL:** `/mobile/ads/failure-report`
-   **Method:** `POST`
-   **Body:** `deviceId`, `platform`, `reason` (required); optional `placement`, `adType`, `adId`, `adUnitId`, `reasonDetail`, `errorCode`
-   **Reasons:** `no_fill`, `network`, `blocked`, `timeout`, `sdk_error`, `not_configured`, `other`

#### Admin list / summary (JWT)
-   `GET /ads/failure-reports?page=&limit=&platform=&reason=`
-   `GET /ads/failure-reports/summary?days=7`

#### Telegram bot
-   `/adsreports [page]`
-   `/adssummary [days]`

Full mobile guide: `MOBILE_APP_VERSION_ADS_DIALOGS.md`

## Code References

-   **Controller:** `src/modules/ads/ads.controller.ts`
-   **Mobile controller:** `src/modules/ads/mobile-ads.controller.ts`
-   **Service:** `src/modules/ads/ads.service.ts`
-   **Entities:**
    -   `src/modules/ads/entities/ad.entity.ts`
    -   `src/modules/ads/entities/ad-setting.entity.ts`
    -   `src/modules/ads/entities/ad-failure-report.entity.ts`
-   **DTOs:** `src/modules/ads/dto/`
