# Login Device System and Token Generation Documentation

This document outlines the authentication mechanisms implemented in the FlyVPN backend, specifically focusing on the device login system and JWT token generation.

## Overview

The authentication system supports two primary methods:
1.  **Standard Login:** Email and password authentication.
2.  **Device Login:** Device ID-based authentication (auto-registration).

Both methods utilize JSON Web Tokens (JWT) for session management.

## 1. Device Login System

The device login system allows users to authenticate using their unique device identifier. This is particularly useful for mobile applications where a seamless "guest" or "device-bound" experience is desired.

### Endpoint

-   **URL:** `/auth/device-login`
-   **Method:** `POST`
-   **Controller:** `AuthController.deviceLogin`

### Request Body (`DeviceLoginDto`)

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `deviceId` | `string` | Yes | Unique identifier for the device. Must be at least 16 characters long and contain only alphanumeric characters and hyphens. |
| `deviceName` | `string` | No | Human-readable name of the device (e.g., "iPhone 13"). |
| `platform` | `string` | No | Platform of the device (e.g., "iOS", "Android"). |
| `pushId` | `string` | No | Push notification identifier (FCM token, APNS token, etc.). |

### Logic Flow

1.  **Validation:**
    -   The `deviceId` is validated against the regex `^[a-zA-Z0-9-]{16,}$`.
    -   If invalid, an `UnauthorizedException` is thrown.

2.  **User Lookup:**
    -   The system checks if a user already exists with the provided `deviceId`.

3.  **Auto-Registration (New User):**
    -   If no user is found, a new user is automatically created.
    -   The new user is initialized with the provided `deviceId`, `deviceName`, `platform`, and `pushId`.

4.  **Update Info (Existing User):**
    -   If a user exists, their device information (`deviceName`, `platform`, `pushId`) is updated if provided in the request.

5.  **Session Update:**
    -   The user's `lastLogin` timestamp is updated.

6.  **Token Generation:**
    -   A JWT access token is generated (see [Token Generation](#3-token-generation)).

### Response

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid",
    "deviceId": "device-unique-id",
    "deviceName": "My Device",
    "platform": "Android",
    "username": "generated-username",
    "role": "user"
  }
}
```

## 2. Standard Login System

Standard login uses email and password credentials.

### Endpoint

-   **URL:** `/auth/login`
-   **Method:** `POST`
-   **Controller:** `AuthController.login`
-   **Guard:** `LocalAuthGuard`

### Request Body (`LoginDto`)

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `email` | `string` | Yes | User's email address. |
| `password` | `string` | Yes | User's password. |

### Logic Flow

1.  **Authentication:**
    -   The `LocalAuthGuard` invokes `AuthService.validateUser`.
    -   The system finds the user by email.
    -   `bcrypt.compare` is used to verify the password.

2.  **Session Update:**
    -   If valid, the user's `lastLogin` timestamp is updated.

3.  **Token Generation:**
    -   A JWT access token is generated.

## 3. Token Generation

Tokens are generated using the `JwtService` from `@nestjs/jwt`.

### Payload Structure

The JWT payload differs slightly based on the login method but generally contains:

**Standard Login Payload:**
```json
{
  "email": "user@example.com",
  "sub": "user-uuid",
  "role": "user"
}
```

**Device Login Payload:**
```json
{
  "deviceId": "device-unique-id",
  "sub": "user-uuid",
  "role": "user"
}
```

### Token Validation

-   **Endpoint:** `/auth/validate`
-   **Guard:** `JwtAuthGuard`
-   **Logic:** The `JwtAuthGuard` extracts the token from the `Authorization` header (Bearer token) and verifies its signature and expiration using `AuthService.validateToken`.

## Code References

-   **Controller:** `src/modules/auth/auth.controller.ts`
-   **Service:** `src/modules/auth/auth.service.ts`
-   **DTOs:** `src/modules/auth/dto/`
