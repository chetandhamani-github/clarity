# Clarity Backend

> Modular Monolith Backend Foundation for the **Clarity** Personal Finance Application.

Clarity is an offline-first personal finance tracker. All user financial transactions, accounts, and budgets remain private and securely stored on-device (with user-controlled cloud backups such as Google Drive). 

This backend service provides the foundational infrastructure:
- **Device Registration & Telemetry**
- **Dynamic Application Configuration & Force Update Rules**
- **Remote Feature Flags**
- **In-App Broadcast Announcements**
- **Liveness & Health Probes**

Built as a clean **Modular Monolith** designed for seamless future extension into premium subscriptions, Splitwise integration, cloud sync, and AI features.

---

## 🛠 Tech Stack

- **Framework**: Spring Boot 3.3.4 (Java 17 / 21 compatible)
- **Database**: PostgreSQL 16 (or Embedded PostgreSQL-compatible H2 for zero-setup local dev)
- **Database Migrations**: Flyway 10.x
- **Data Access**: Spring Data JPA & Hibernate
- **Validation**: Jakarta Bean Validation
- **Documentation**: Springdoc OpenAPI 3 / Swagger UI
- **Productivity**: Project Lombok
- **Containerization**: Docker & Docker Compose (Multi-stage build)

---

## 📁 Project Structure

```text
clarity-backend/
├── .dockerignore
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── pom.xml
├── README.md
└── src
    ├── main
    │   ├── java
    │   │   └── com
    │   │       └── clarity
    │   │           ├── ClarityApplication.java
    │   │           ├── announcement
    │   │           │   ├── controller
    │   │           │   │   └── AnnouncementController.java
    │   │           │   ├── dto
    │   │           │   │   └── AnnouncementResponse.java
    │   │           │   ├── entity
    │   │           │   │   └── Announcement.java
    │   │           │   ├── repository
    │   │           │   │   └── AnnouncementRepository.java
    │   │           │   └── service
    │   │           │       ├── AnnouncementService.java
    │   │           │       └── AnnouncementServiceImpl.java
    │   │           ├── common
    │   │           │   ├── config
    │   │           │   │   ├── OpenApiConfig.java
    │   │           │   │   └── WebConfig.java
    │   │           │   └── dto
    │   │           │       ├── ApiResponse.java
    │   │           │       └── ErrorResponse.java
    │   │           ├── config
    │   │           │   ├── controller
    │   │           │   │   └── AppConfigController.java
    │   │           │   ├── dto
    │   │           │   │   └── AppConfigResponse.java
    │   │           │   ├── entity
    │   │           │   │   └── AppConfig.java
    │   │           │   ├── repository
    │   │           │   │   └── AppConfigRepository.java
    │   │           │   └── service
    │   │           │       ├── AppConfigService.java
    │   │           │       └── AppConfigServiceImpl.java
    │   │           ├── device
    │   │           │   ├── controller
    │   │           │   │   └── DeviceController.java
    │   │           │   ├── dto
    │   │           │   │   ├── DeviceRegistrationRequest.java
    │   │           │   │   ├── DeviceRegistrationResponse.java
    │   │           │   │   └── DeviceStatusResponse.java
    │   │           │   ├── entity
    │   │           │   │   ├── Device.java
    │   │           │   │   └── DeviceStatus.java
    │   │           │   ├── repository
    │   │           │   │   └── DeviceRepository.java
    │   │           │   └── service
    │   │           │       ├── DeviceService.java
    │   │           │       └── DeviceServiceImpl.java
    │   │           ├── exception
    │   │           │   ├── ApiException.java
    │   │           │   ├── GlobalExceptionHandler.java
    │   │           │   └── ResourceNotFoundException.java
    │   │           ├── feature
    │   │           │   ├── controller
    │   │           │   │   └── FeatureFlagController.java
    │   │           │   ├── dto
    │   │           │   │   └── FeatureFlagResponse.java
    │   │           │   ├── entity
    │   │           │   │   └── FeatureFlag.java
    │   │           │   ├── repository
    │   │           │   │   └── FeatureFlagRepository.java
    │   │           │   └── service
    │   │           │       ├── FeatureFlagService.java
    │   │           │       └── FeatureFlagServiceImpl.java
    │   │           └── health
    │   │               ├── controller
    │   │               │   └── HealthController.java
    │   │               └── dto
    │   │                   └── HealthResponse.java
    │   └── resources
    │       ├── application-dev.yml
    │       ├── application.yml
    │       └── db
    │           └── migration
    │               ├── V1__create_devices.sql
    │               ├── V2__create_app_config.sql
    │               ├── V3__create_feature_flags.sql
    │               ├── V4__create_announcements.sql
    │               └── V5__seed_initial_data.sql
    └── test
        ├── java
        │   └── com
        │       └── clarity
        │           ├── announcement
        │           │   └── AnnouncementControllerTest.java
        │           ├── ClarityApplicationTests.java
        │           ├── config
        │           │   └── AppConfigControllerTest.java
        │           ├── device
        │           │   ├── DeviceControllerTest.java
        │           │   └── DeviceServiceTest.java
        │           ├── feature
        │           │   └── FeatureFlagControllerTest.java
        │           └── health
        │               └── HealthControllerTest.java
        └── resources
            └── application-test.yml
```

---

## 🗄 Database Schema

PostgreSQL migrations are located under `src/main/resources/db/migration` and managed automatically by **Flyway**.

```
+-------------------------------------------------------------+
|                          devices                            |
+-------------------------------------------------------------+
| id               UUID PK DEFAULT gen_random_uuid()          |
| installation_id  VARCHAR(255) UNIQUE NOT NULL               |
| platform         VARCHAR(50)                                |
| app_version      VARCHAR(50)                                |
| device_name      VARCHAR(255)                               |
| status           VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'      |
| created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()         |
| updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()         |
| last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW()         |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
|                         app_config                          |
+-------------------------------------------------------------+
| id               UUID PK DEFAULT gen_random_uuid()          |
| min_version      VARCHAR(50) NOT NULL                       |
| latest_version   VARCHAR(50) NOT NULL                       |
| maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE             |
| updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()         |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
|                        feature_flags                        |
+-------------------------------------------------------------+
| id               UUID PK DEFAULT gen_random_uuid()          |
| key              VARCHAR(100) UNIQUE NOT NULL               |
| enabled          BOOLEAN NOT NULL DEFAULT FALSE             |
| description      VARCHAR(255)                               |
| updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()         |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
|                        announcements                        |
+-------------------------------------------------------------+
| id               UUID PK DEFAULT gen_random_uuid()          |
| title            VARCHAR(255) NOT NULL                      |
| message          TEXT NOT NULL                              |
| active           BOOLEAN NOT NULL DEFAULT TRUE              |
| created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()         |
| updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()         |
+-------------------------------------------------------------+
```

### Initial Seed Data (`V5__seed_initial_data.sql`)
1. **App Config**:
   - `min_version`: `1.0.0`
   - `latest_version`: `1.0.0`
   - `maintenance_mode`: `false`
2. **Feature Flags**:
   - `subscription_manager`: `true`
   - `bills_reminders`: `true`
   - `splitwise`: `false`
   - `premium`: `false`
   - `ai_insights`: `false`
3. **Announcements**:
   - Active welcome announcement for onboarding.

---

## 🚀 API Documentation

Interactive Swagger UI is accessible at:
👉 **`http://localhost:8080/swagger-ui.html`**  
OpenAPI 3.0 specification: `http://localhost:8080/v3/api-docs`

---

### 1. Health Check
Checks if the backend service is operational.

- **URL**: `GET /api/v1/health`
- **Response**: `200 OK`
```json
{
  "status": "UP",
  "service": "clarity-backend"
}
```
**cURL**:
```bash
curl -X GET http://localhost:8080/api/v1/health
```

---

### 2. Device Registration / Heartbeat
Registers a new installation or updates telemetry and version for an existing device.

- **URL**: `POST /api/v1/devices/register`
- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "installationId": "d9f8c12a-89a1-432a-bc91-239104812f81",
  "platform": "android",
  "appVersion": "1.0.0",
  "deviceName": "Samsung Galaxy S24"
}
```
- **Response**: `200 OK`
```json
{
  "success": true,
  "deviceId": "550e8400-e29b-41d4-a716-446655440000"
}
```
**cURL**:
```bash
curl -X POST http://localhost:8080/api/v1/devices/register \
  -H "Content-Type: application/json" \
  -d '{
    "installationId": "d9f8c12a-89a1-432a-bc91-239104812f81",
    "platform": "android",
    "appVersion": "1.0.0",
    "deviceName": "Samsung Galaxy S24"
  }'
```

---

### 3. Device Status Check
Retrieves the current status (`ACTIVE`, `BLOCKED`, `SUSPENDED`) of a device.

- **URL**: `GET /api/v1/devices/{installationId}/status`
- **Response**: `200 OK`
```json
{
  "status": "ACTIVE"
}
```
- **Error Response**: `404 Not Found` (if installation ID not registered)
```json
{
  "status": 404,
  "error": "Not Found",
  "message": "Device not found with installationId: 'unknown-id'",
  "path": "/api/v1/devices/unknown-id/status",
  "timestamp": "2026-09-01T19:00:00Z"
}
```
**cURL**:
```bash
curl -X GET http://localhost:8080/api/v1/devices/d9f8c12a-89a1-432a-bc91-239104812f81/status
```

---

### 4. Application Configuration
Fetches the current min version, latest release version, and maintenance status.

- **URL**: `GET /api/v1/config`
- **Response**: `200 OK`
```json
{
  "minVersion": "1.0.0",
  "latestVersion": "1.2.0",
  "maintenanceMode": false
}
```
**cURL**:
```bash
curl -X GET http://localhost:8080/api/v1/config
```

---

### 5. Dynamic Feature Flags
Retrieves the state of all feature flags to gate features remotely.

- **URL**: `GET /api/v1/features`
- **Response**: `200 OK`
```json
[
  {
    "key": "subscription_manager",
    "enabled": true
  },
  {
    "key": "bills_reminders",
    "enabled": true
  },
  {
    "key": "splitwise",
    "enabled": false
  },
  {
    "key": "premium",
    "enabled": false
  },
  {
    "key": "ai_insights",
    "enabled": false
  }
]
```
**cURL**:
```bash
curl -X GET http://localhost:8080/api/v1/features
```

---

### 6. Announcements
Retrieves all active in-app broadcast announcements.

- **URL**: `GET /api/v1/announcements`
- **Response**: `200 OK`
```json
[
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "title": "Welcome to Clarity",
    "message": "Clarity keeps all your personal financial data completely private and on-device.",
    "createdAt": "2026-09-01T12:00:00Z"
  }
]
```
**cURL**:
```bash
curl -X GET http://localhost:8080/api/v1/announcements
```

---

## 💻 Run Instructions

### Prerequisites
- **Java 17 JDK** (default on your system)
- No Docker or PostgreSQL installation is required to start developing!

---

### Option 1: Zero-Setup Local Execution (No Docker or PostgreSQL required)
Run the application using the `local` profile. It runs with an embedded database in PostgreSQL compatibility mode:

```bash
cd clarity-backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```
- Server URL: `http://localhost:8080`
- Swagger UI: `http://localhost:8080/swagger-ui.html`
- H2 Console: `http://localhost:8080/h2-console` (JDBC URL: `jdbc:h2:file:./data/clarity_local`, user: `sa`, password: empty)

---

### Option 2: Running with Local PostgreSQL Server

#### Start PostgreSQL:
Ensure PostgreSQL is running locally on port `5432` with a database named `clarity_db`.

#### Set Environment Variables (or edit `application.yml`):
```bash
export DB_URL=jdbc:postgresql://localhost:5432/clarity_db
export DB_USERNAME=clarity_user
export DB_PASSWORD=clarity_pass
```

#### Run with Maven Wrapper:
```bash
cd clarity-backend
./mvnw spring-boot:run
```

#### Run Tests:
```bash
./mvnw test
```

---

## 🐳 Docker Commands

You can run the entire backend and PostgreSQL database using Docker Compose.

### Start All Services (Backend + PostgreSQL):
```bash
cd clarity-backend
docker compose up -d --build
```

### View Logs:
```bash
docker compose logs -f clarity-backend
```

### Check Service Health:
```bash
docker compose ps
```

### Stop All Services:
```bash
docker compose down
```

### Stop and Wipe Volumes (Fresh DB):
```bash
docker compose down -v
```

---

## 🏗 Architecture & Future Extensibility

The codebase follows the **Modular Monolith** pattern:
- **High Cohesion & Low Coupling**: Each module (`device`, `config`, `feature`, `announcement`) encapsulates its own entity, DTOs, repository, service, and REST controller.
- **Cross-Cutting Concerns**: Standardized error handling (`GlobalExceptionHandler`), CORS configuration, and Swagger documentation reside in `common` and `exception`.
- **Database Migrations**: Every database change is version-controlled via Flyway scripts (`V1`...`V5`).

### Roadmap Integration:
1. **Premium Subscriptions (`com.clarity.subscription`)**:
   - Validate receipt tokens with Apple App Store / Google Play Billing APIs.
   - Associate subscriptions with device UUID or optional authenticated user account.
2. **Splitwise Module (`com.clarity.splitwise`)**:
   - OAuth 2.0 exchange and sync gateway for collaborative group expenses.
3. **Cloud Sync & Auth (`com.clarity.sync`, `com.clarity.auth`)**:
   - End-to-end encrypted backup synchronization and user profile management.
4. **AI Features (`com.clarity.ai`)**:
   - Secure LLM gateway for financial summarization, categorization, and budgeting suggestions without exposing raw personal financial data.
