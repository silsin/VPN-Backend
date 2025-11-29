# V2Ray Configurations Management System Documentation

This document outlines the V2Ray configurations management system implemented in the FlyVPN backend. It provides a RESTful API for managing V2Ray server configurations used throughout the application.

## Overview

The V2Ray configs system allows administrators to manage VPN server configurations. It supports two configuration formats (V2Ray links and JSON configs) and categorizes them by usage context (splash, main, backup).

## 1. Configuration Management

### Data Model (`V2RayConfig`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Unique identifier for the configuration. |
| `name` | `string` | Unique name for the configuration. |
| `type` | `enum` | Configuration format: `v2ray_link`, `json_config`. |
| `category` | `enum` | Usage category: `splash`, `main`, `backup`. |
| `content` | `text` | The actual configuration string (V2Ray link or JSON). |
| `createdAt` | `Date` | Timestamp of creation. |
| `updatedAt` | `Date` | Timestamp of last update. |

### Configuration Types

**`V2RayConfigType`**
- `LINK` = `'v2ray_link'` - V2Ray protocol links (e.g., vless://, vmess://)
- `JSON` = `'json_config'` - Full JSON configuration format

**`V2RayConfigCategory`**
- `SPLASH` = `'splash'` - Configurations used during app splash screen
- `MAIN` = `'main'` - Primary configurations for normal operation
- `BACKUP` = `'backup'` - Fallback configurations

## 2. API Endpoints

All endpoints require JWT authentication via Bearer token.

### Create Configuration
-   **URL:** `/v2ray-configs`
-   **Method:** `POST`
-   **Body:** `CreateV2RayConfigDto`
    ```json
    {
      "name": "Server 1",
      "type": "v2ray_link",
      "category": "main",
      "content": "vless://..."
    }
    ```
-   **Response:** Created `V2RayConfig` object

### Get All Configurations
-   **URL:** `/v2ray-configs`
-   **Method:** `GET`
-   **Query Parameters:**
    - `search` (optional): Filter by name (partial match)
    - `type` (optional): Filter by type (`v2ray_link` or `json_config`)
    - `category` (optional): Filter by category (`splash`, `main`, or `backup`)
-   **Response:** Array of `V2RayConfig` objects, ordered by creation date (newest first)
-   **Examples:**
    - Get all splash configs: `/v2ray-configs?category=splash`
    - Get main configs that are links: `/v2ray-configs?category=main&type=v2ray_link`
    - Search by name: `/v2ray-configs?search=Server`

### Get Configuration by ID
-   **URL:** `/v2ray-configs/:id`
-   **Method:** `GET`
-   **Response:** Single `V2RayConfig` object

### Update Configuration
-   **URL:** `/v2ray-configs/:id`
-   **Method:** `PATCH`
-   **Body:** `UpdateV2RayConfigDto` (Partial `CreateV2RayConfigDto`)
-   **Response:** Updated `V2RayConfig` object

### Delete Configuration
-   **URL:** `/v2ray-configs/:id`
-   **Method:** `DELETE`
-   **Response:** 200 OK on success

### Get Statistics
-   **URL:** `/v2ray-configs/stats`
-   **Method:** `GET`
-   **Response:**
    ```json
    {
      "total": 10,
      "byType": {
        "link": 7,
        "json": 3
      },
      "byCategory": {
        "splash": 2,
        "main": 6,
        "backup": 2
      }
    }
    ```

## 3. Usage Patterns

### Splash Screen Configurations
Configurations with `category: 'splash'` are typically used during app initialization to establish an initial VPN connection before the main UI loads.

### Main Configurations
Configurations with `category: 'main'` are the primary server options presented to users during normal operation.

### Backup Configurations
Configurations with `category: 'backup'` serve as fallback options when primary servers are unavailable.

## Code References

-   **Controller:** `src/modules/v2ray-configs/v2ray-configs.controller.ts`
-   **Service:** `src/modules/v2ray-configs/v2ray-configs.service.ts`
-   **Entity:** `src/modules/v2ray-configs/entities/v2ray-config.entity.ts`
-   **DTOs:** `src/modules/v2ray-configs/dto/`
