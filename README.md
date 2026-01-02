# EventFlow

A production-ready backend system for ingesting, storing, and processing events asynchronously. Built with Node.js, TypeScript, PostgreSQL, and Google Cloud Platform.

## Overview

EventFlow is designed to handle high-volume event ingestion with reliable asynchronous processing. It provides:

- **Event Ingestion API**: RESTful endpoint for receiving and validating events
- **Dual Storage**: Events stored in both PostgreSQL (operational) and BigQuery (analytics)
- **Asynchronous Processing**: Google Cloud Pub/Sub for reliable event queuing
- **Database Storage**: PostgreSQL with Prisma ORM for persistent event storage
- **Analytics Storage**: BigQuery for large-scale event analytics and reporting
- **Admin Dashboard**: Endpoints for monitoring, replaying failed events, and viewing metrics
- **Error Handling**: Automatic retries with dead-letter queue support
- **CI/CD**: Automated testing and deployment via GitHub Actions

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ POST /events
       ▼
┌─────────────────────────────────┐
│      Express API Server         │
│  ┌───────────────────────────┐ │
│  │  POST /events             │ │
│  │  - Validate (Zod)        │ │
│  │  - Store in PostgreSQL    │ │
│  │  - Store in BigQuery      │ │
│  │  - Publish to Pub/Sub     │ │
│  └───────────────────────────┘ │
└──────┬──────────────┬───────────┘
       │              │
       │ Store Event  │ Store Event
       ▼              ▼
┌──────────────┐  ┌──────────────────┐
│ PostgreSQL   │  │   BigQuery       │
│ Database     │  │   (Analytics)    │
│              │  │                  │
│ Events Table │  │ Events Table     │
│ - Operational│  │ - Analytics      │
│ - Status     │  │ - Partitioned    │
│ - Retries    │  │ - Time-series   │
└──────────────┘  └──────────────────┘
              │
              │ Publish Event ID
              ▼
┌─────────────────────────────────┐
│   Google Cloud Pub/Sub          │
│  ┌───────────────────────────┐ │
│  │  Topic: events            │ │
│  │  Subscription: events-    │ │
│  │            worker         │ │
│  └───────────────────────────┘ │
└─────────────┬───────────────────┘
              │
              │ Pull Messages
              ▼
┌─────────────────────────────────┐
│      Worker Service              │
│  ┌───────────────────────────┐ │
│  │  - Process events          │ │
│  │  - Update status          │ │
│  │  - Handle retries         │ │
│  │  - Dead-letter queue      │ │
│  └───────────────────────────┘ │
└─────────────┬───────────────────┘
              │
              │ Update Status
              ▼
┌─────────────────────────────────┐
│      PostgreSQL Database         │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│      Admin Endpoints             │
│  ┌───────────────────────────┐ │
│  │  GET /admin/events/failed │ │
│  │  POST /admin/events/:id/  │ │
│  │        replay             │ │
│  │  GET /admin/metrics       │ │
│  └───────────────────────────┘ │
└─────────────────────────────────┘
```

## Tech Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (Cloud SQL)
- **Analytics**: Google Cloud BigQuery
- **ORM**: Prisma
- **Message Queue**: Google Cloud Pub/Sub
- **Validation**: Zod
- **Logging**: Pino
- **Deployment**: Google Cloud Run
- **CI/CD**: GitHub Actions

## Features

### 1. Event Ingestion (`POST /events`)

- Validates incoming event JSON using Zod schemas
- Stores raw events in PostgreSQL (operational database)
- Stores raw events in BigQuery (analytics database) using batch load jobs (Sandbox-compatible)
- Publishes event ID to Pub/Sub for async processing
- Returns success/error responses
- BigQuery writes are non-blocking (failures don't affect API response)
- Events are batched and flushed automatically when buffer reaches 10 events

**Request Example:**
```bash
curl -X POST http://localhost:8080/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "user.signup",
    "payload": {
      "userId": "123",
      "email": "user@example.com",
      "timestamp": "2024-01-01T00:00:00Z"
    },
    "metadata": {
      "source": "web",
      "version": "1.0"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "eventId": "uuid-here",
  "message": "Event received and queued for processing"
}
```

### 2. Asynchronous Processing

- Events are pushed to Pub/Sub immediately after storage
- Worker service pulls events from Pub/Sub subscription
- Processes events with retry logic (max 3 retries)
- Failed events after max retries move to dead-letter queue
- Processing status tracked in database

### 3. Admin Endpoints

#### Get Failed Events
```
GET /admin/events/failed?page=1&limit=50
```

Returns paginated list of failed and dead-letter events.

#### Replay Failed Event
```
POST /admin/events/:id/replay
```

Resets event status and re-queues it for processing.

#### View Metrics
```
GET /admin/metrics
```

Returns:
- Event counts by status (pending, processing, processed, failed, dead-letter)
- Events grouped by type
- Average processing time
- Total processed events

### 4. Error Handling

- **Validation Errors**: Zod schema validation with detailed error messages
- **Processing Errors**: Automatic retries with exponential backoff
- **Dead Letter Queue**: Events that fail after max retries
- **Graceful Shutdown**: Handles SIGTERM/SIGINT for clean shutdowns

### 5. Logging

- Structured logging with Pino
- Request/response logging via middleware
- Error logging with stack traces
- Processing status logging
- Configurable log levels via `LOG_LEVEL` environment variable

### 6. Cloud Run Compatibility

- Server starts listening immediately (before service initialization) for Cloud Run health checks
- Services (database, Pub/Sub, BigQuery) initialize in the background
- Graceful shutdown handles SIGTERM/SIGINT signals
- BigQuery buffer is flushed during shutdown to prevent data loss

## Setup Instructions

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Google Cloud Project with Pub/Sub and BigQuery APIs enabled
- GCP Service Account with Pub/Sub and BigQuery permissions

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd EventFlow
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file (you can copy from `env.template`):
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/eventflow?schema=public"
   PORT=8080
   NODE_ENV=development
   GCP_PROJECT_ID=your-project-id
   PUBSUB_TOPIC_NAME=events
   PUBSUB_SUBSCRIPTION_NAME=events-worker
   GCP_CREDENTIALS_PATH=./gcp-credentials.json
   BIGQUERY_DATASET_ID=eventflow
   BIGQUERY_TABLE_ID=events
   LOG_LEVEL=info
   ```

4. **Set up database**
   ```bash
   # Generate Prisma Client
   npm run prisma:generate
   
   # Run migrations
   npm run prisma:migrate
   ```

5. **Set up Google Cloud Services**
   - Create a service account in GCP
   - Download credentials JSON file
   - Place it in the project root as `gcp-credentials.json`
   - Ensure the service account has the following roles:
     - **Pub/Sub**: Publisher and Subscriber roles
     - **BigQuery**: BigQuery Data Editor and BigQuery Job User roles
   - Enable BigQuery API in your GCP project
   - The BigQuery dataset and table will be created automatically on first run

6. **Start the API server**
   ```bash
   npm run dev
   ```
   
   The server will:
   - Start listening immediately on port 8080 (or PORT from .env) for Cloud Run compatibility
   - Initialize database connection in the background
   - Initialize Pub/Sub and BigQuery services in the background
   - Log initialization status for each service

7. **Start the worker (in a separate terminal)**
   ```bash
   npm run dev:worker
   ```
   
   The worker will:
   - Create Pub/Sub subscription if it doesn't exist
   - Listen for messages and process events
   - Handle retries and dead-letter queue automatically

### Docker Deployment

#### Build and run API server
```bash
docker build -t eventflow-api -f Dockerfile .
docker run -p 8080:8080 --env-file .env eventflow-api
```

#### Build and run worker
```bash
docker build -t eventflow-worker -f Dockerfile.worker .
docker run --env-file .env eventflow-worker
```

### Google Cloud Run Deployment

1. **Build and push Docker image**
   ```bash
   gcloud builds submit --tag gcr.io/[PROJECT-ID]/eventflow
   ```

2. **Deploy API service**
   ```bash
   gcloud run deploy eventflow-api \
     --image gcr.io/[PROJECT-ID]/eventflow \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars DATABASE_URL=[CLOUD_SQL_CONNECTION],GCP_PROJECT_ID=[PROJECT-ID]
   ```

3. **Deploy worker service**
   ```bash
   gcloud run deploy eventflow-worker \
     --image gcr.io/[PROJECT-ID]/eventflow \
     --platform managed \
     --region us-central1 \
     --set-env-vars DATABASE_URL=[CLOUD_SQL_CONNECTION],GCP_PROJECT_ID=[PROJECT-ID] \
     --command node \
     --args dist/worker.js
   ```

### CI/CD Setup

The project includes GitHub Actions workflow for automated CI/CD:

1. **Set up GitHub Secrets:**
   - `GCP_PROJECT_ID`: Your GCP project ID
   - `GCP_SA_KEY`: Base64 encoded service account key JSON
   - `DATABASE_URL`: Cloud SQL connection string

2. **Workflow runs on:**
   - Push to `main` or `develop` branches
   - Pull requests to `main`

3. **Pipeline stages:**
   - Test: Run linter and tests
   - Build: Compile TypeScript
   - Deploy: Build Docker image and deploy to Cloud Run (main branch only)

## API Documentation

### Events

#### POST /events
Ingest a new event.

**Request Body:**
```json
{
  "eventType": "string (required, 1-100 chars)",
  "payload": "object (required)",
  "metadata": "object (optional)"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "eventId": "uuid",
  "message": "Event received and queued for processing"
}
```

### Admin

#### GET /admin/events/failed
Get paginated list of failed events.

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 50)

**Response:** `200 OK`
```json
{
  "events": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

#### GET /admin/events/:id
Get event by ID.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "eventType": "string",
  "payload": {...},
  "status": "PROCESSED",
  ...
}
```

#### POST /admin/events/:id/replay
Replay a failed event.

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Event queued for replay",
  "event": {...}
}
```

#### GET /admin/metrics
Get processing metrics.

**Response:** `200 OK`
```json
{
  "summary": {
    "total": 1000,
    "pending": 10,
    "processing": 5,
    "processed": 950,
    "failed": 30,
    "deadLetter": 5
  },
  "eventsByType": [
    {"eventType": "user.signup", "count": 500},
    ...
  ],
  "processingStats": {
    "averageProcessingTimeSeconds": 0.25,
    "totalProcessed": 950
  }
}
```

### Health Check

#### GET /health
Health check endpoint. Used by Cloud Run and load balancers to verify service availability.

**Response:** `200 OK`
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Note:** The server starts listening immediately on startup, even while services are initializing in the background. This ensures Cloud Run health checks pass quickly.

## BigQuery Sandbox Compatibility

This implementation is compatible with BigQuery Sandbox (free tier) by using **batch load jobs** instead of streaming inserts, which are not available in Sandbox.

### How It Works

- Events are buffered in memory (default: 10 events)
- Batches are flushed automatically when buffer reaches the batch size threshold
- Load jobs are used to insert batches (Sandbox-compatible)
- Temporary files are created and cleaned up automatically
- Failed batches are re-queued to prevent data loss
- Manual flush available via `bigqueryService.flush()` (called during graceful shutdown)

### Sandbox Limitations

- **No streaming inserts**: Must use batch load jobs
- **10 GB storage limit**: Monitor your dataset size
- **1 TB query processing per month**: Free tier limit
- **60-day expiration**: Tables expire after 60 days (upgrade to paid tier to retain data longer)

### Configuration

The batching behavior can be adjusted in `src/services/bigquery.ts`:
- `BATCH_SIZE`: Number of events before auto-flush (default: 10)

## Database Schema

### Events Table (PostgreSQL)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| eventType | String | Type of event |
| payload | JSON | Event data |
| metadata | JSON | Optional metadata |
| status | Enum | PENDING, PROCESSING, PROCESSED, FAILED, DEAD_LETTER |
| processedAt | DateTime | When event was processed |
| failedAt | DateTime | When event failed |
| failureReason | String | Reason for failure |
| retryCount | Int | Number of retry attempts |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

### BigQuery Events Table

The BigQuery table has the same schema as PostgreSQL but is optimized for analytics:

- **Time-partitioned** by `createdAt` (daily partitions)
- **Same fields** as PostgreSQL events table
- **Append-only**: Status updates are tracked in PostgreSQL only
- **Batch-loaded**: Uses load jobs for Sandbox compatibility

## Error Handling

### Event Status Flow

```
PENDING → PROCESSING → PROCESSED
    ↓
  FAILED (retry) → PROCESSING → PROCESSED
    ↓
  FAILED (max retries) → DEAD_LETTER
```

**Note:** Events are retried automatically via Pub/Sub message nack/ack mechanism. The worker checks retry count and acknowledges messages after max retries to prevent infinite retry loops.

### Retry Logic

- Maximum 3 retry attempts
- Events that fail after max retries are moved to dead-letter queue
- Failed events can be manually replayed via admin endpoint

## Testing

```bash
# Run linter
npm run lint

# Run tests (when implemented)
npm test

# Format code
npm run format
```

For detailed testing instructions, see [TESTING.md](./TESTING.md).

For API usage examples, see [API_EXAMPLES.md](./API_EXAMPLES.md).

## Project Structure

```
EventFlow/
├── src/
│   ├── config/          # Configuration (env, etc.)
│   ├── db/              # Database client
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   ├── schemas/         # Zod validation schemas
│   ├── services/        # Business logic services
│   ├── utils/           # Utility functions
│   ├── index.ts         # API server entry point
│   └── worker.ts        # Worker service entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── .github/
│   └── workflows/
│       └── ci-cd.yml    # CI/CD pipeline
├── Dockerfile           # API server Docker image
├── Dockerfile.worker    # Worker Docker image
└── README.md
```

## Best Practices Implemented

- ✅ TypeScript for type safety
- ✅ Schema validation with Zod
- ✅ Structured logging with Pino
- ✅ Error handling with custom error classes
- ✅ Async/await throughout
- ✅ Database connection pooling
- ✅ Graceful shutdown handling
- ✅ Environment variable validation with Zod
- ✅ Docker multi-stage builds
- ✅ Health check endpoints (Cloud Run compatible)
- ✅ Retry logic with dead-letter queue
- ✅ Admin endpoints for monitoring
- ✅ Non-blocking BigQuery writes (failures don't affect API)
- ✅ Background service initialization (fast startup)
- ✅ Pub/Sub subscription auto-creation
- ✅ BigQuery dataset/table auto-creation

## License

MIT

