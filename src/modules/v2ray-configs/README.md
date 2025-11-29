# V2Ray Configs Module

This module manages V2Ray configurations within the FlyVPN backend application. It provides a RESTful API for creating, retrieving, updating, and deleting V2Ray configuration data.

## Data Model

The core entity is `V2RayConfig`, which represents a single V2Ray configuration.

| Field       | Type                  | Description                                      |
| :---------- | :-------------------- | :----------------------------------------------- |
| `id`        | UUID                  | Unique identifier for the configuration.         |
| `name`      | String                | Unique name for the configuration.               |
| `type`      | `V2RayConfigType`     | Type of config: `v2ray_link` or `json_config`.   |
| `category`  | `V2RayConfigCategory` | Usage category: `splash`, `main`, or `backup`.   |
| `content`   | Text                  | The actual configuration string (link or JSON).  |
| `createdAt` | Date                  | Timestamp when the config was created.           |
| `updatedAt` | Date                  | Timestamp when the config was last updated.      |

### Enums

**`V2RayConfigType`**
- `LINK` = `'v2ray_link'`
- `JSON` = `'json_config'`

**`V2RayConfigCategory`**
- `SPLASH` = `'splash'` - Configs for splash screen
- `MAIN` = `'main'` - Main application configs
- `BACKUP` = `'backup'` - Backup configs

## API Endpoints

All endpoints are prefixed with `/v2ray-configs` and require JWT authentication (`Bearer` token).

### 1. Create Configuration
- **Method:** `POST`
- **URL:** `/`
- **Body:** `CreateV2RayConfigDto`
  ```json
  {
    "name": "Server 1",
    "type": "v2ray_link",
    "category": "main",
    "content": "vless://..."
  }
  ```
- **Response:** The created `V2RayConfig` object.

### 2. Get All Configurations
- **Method:** `GET`
- **URL:** `/`
- **Query Parameters:**
  - `search` (optional): Filter by name (partial match).
  - `type` (optional): Filter by configuration type (`v2ray_link` or `json_config`).
  - `category` (optional): Filter by category (`splash`, `main`, or `backup`).
- **Response:** Array of `V2RayConfig` objects.
- **Examples:**
  - Get all splash configs: `/v2ray-configs?category=splash`
  - Get main configs that are links: `/v2ray-configs?category=main&type=v2ray_link`

### 3. Get Statistics
- **Method:** `GET`
- **URL:** `/stats`
- **Response:** Object containing counts.
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

### 4. Get Configuration by ID
- **Method:** `GET`
- **URL:** `/:id`
- **Response:** The requested `V2RayConfig` object.

### 5. Update Configuration
- **Method:** `PATCH`
- **URL:** `/:id`
- **Body:** `UpdateV2RayConfigDto` (Partial `CreateV2RayConfigDto`)
- **Response:** The updated `V2RayConfig` object.

### 6. Delete Configuration
- **Method:** `DELETE`
- **URL:** `/:id`
- **Response:** `200 OK` on success.

## Usage

Import `V2RayConfigsModule` into your application module to use its features.

```typescript
import { V2RayConfigsModule } from './modules/v2ray-configs/v2ray-configs.module';

@Module({
  imports: [
    // ...
    V2RayConfigsModule,
  ],
})
export class AppModule {}
```
