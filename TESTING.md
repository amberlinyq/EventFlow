# Testing Guide

This guide covers how to test EventFlow locally and verify all components are working correctly.

## Prerequisites

1. **PostgreSQL Database Running**
   ```bash
   # Check if PostgreSQL is running
   psql --version
   
   # Start PostgreSQL (macOS with Homebrew)
   brew services start postgresql
   
   # Or use Docker
   docker run --name postgres-eventflow -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=eventflow -p 5432:5432 -d postgres:15
   ```

2. **Environment Variables Configured**
   - Ensure `.env` file exists with all required variables
   - Verify GCP credentials are set up

3. **Dependencies Installed**
   ```bash
   npm install
   ```

4. **Database Migrated**
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

## Quick Start Testing

### 1. Start the API Server

```bash
# Terminal 1: Start the API server
npm run dev
```

You should see:
```
Server started on port 3000
Database connected
BigQuery initialized (or warning if not configured)
```

### 2. Start the Worker

```bash
# Terminal 2: Start the worker
npm run dev:worker
```

You should see:
```
Worker started and listening for messages
```

## Manual Testing Steps

### Step 1: Health Check

```bash
curl http://localhost:3000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Step 2: Ingest an Event

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "user.signup",
    "payload": {
      "userId": "123",
      "email": "test@example.com",
      "name": "Test User"
    },
    "metadata": {
      "source": "web",
      "version": "1.0"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "eventId": "uuid-here",
  "message": "Event received and queued for processing"
}
```

**What to Check:**
- ✅ Response returns `success: true` and an `eventId`
- ✅ Check server logs - should show "Event stored in database"
- ✅ Check server logs - should show "Event added to BigQuery buffer" (if BigQuery configured)
- ✅ Check PostgreSQL - event should be in database with status `PENDING`

### Step 3: Verify Event Processing

Wait 5-10 seconds, then check metrics:

```bash
curl http://localhost:3000/admin/metrics | jq
```

**Expected Response:**
```json
{
  "summary": {
    "total": 1,
    "pending": 0,
    "processing": 0,
    "processed": 1,
    "failed": 0,
    "deadLetter": 0
  },
  "eventsByType": [
    {
      "eventType": "user.signup",
      "count": 1
    }
  ],
  "processingStats": {
    "averageProcessingTimeSeconds": 0.25,
    "totalProcessed": 1
  }
}
```

**What to Check:**
- ✅ Event status changed from `PENDING` to `PROCESSED`
- ✅ Worker logs show "Event processed successfully"
- ✅ `processed` count increased

### Step 4: Check Event in Database

```bash
# Using Prisma Studio (GUI)
npm run prisma:studio

# Or using psql
psql -d eventflow -c "SELECT id, eventType, status, \"createdAt\" FROM events ORDER BY \"createdAt\" DESC LIMIT 5;"
```

### Step 5: Test BigQuery Integration

**Check BigQuery Buffer:**
- Look for logs: "Event added to BigQuery buffer"
- Buffer should accumulate events

**Wait for Flush (30 seconds or 100 events):**
- Look for logs: "Events flushed to BigQuery via load job"
- Check BigQuery console to verify data appears

**Manual Flush (if needed):**
You can modify the flush interval in `src/services/bigquery.ts` temporarily to test faster.

### Step 6: Test Validation Errors

```bash
# Missing required field
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": ""
  }'
```

**Expected Response:**
```json
{
  "error": "Validation error",
  "details": [...]
}
```

### Step 7: Test Admin Endpoints

```bash
# Get all events (via metrics)
curl http://localhost:3000/admin/metrics | jq

# Get a specific event (replace EVENT_ID)
curl http://localhost:3000/admin/events/EVENT_ID | jq

# Get failed events
curl http://localhost:3000/admin/events/failed | jq
```

## Testing the Full Flow

### Test Script

Create a file `test-flow.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

echo "🧪 Testing EventFlow..."

# 1. Health check
echo "1. Health check..."
curl -s $BASE_URL/health | jq
echo ""

# 2. Ingest event
echo "2. Ingesting event..."
RESPONSE=$(curl -s -X POST $BASE_URL/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "test.event",
    "payload": {"test": true, "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"},
    "metadata": {"source": "test-script"}
  }')

EVENT_ID=$(echo $RESPONSE | jq -r '.eventId')
echo "Event ID: $EVENT_ID"
echo ""

# 3. Wait for processing
echo "3. Waiting 5 seconds for processing..."
sleep 5

# 4. Check metrics
echo "4. Checking metrics..."
curl -s $BASE_URL/admin/metrics | jq '.summary'
echo ""

# 5. Get event details
echo "5. Getting event details..."
curl -s $BASE_URL/admin/events/$EVENT_ID | jq '{id, eventType, status, createdAt}'
echo ""

echo "✅ Test complete!"
```

Make it executable and run:
```bash
chmod +x test-flow.sh
./test-flow.sh
```

## Testing BigQuery Integration

### Verify BigQuery Setup

1. **Check GCP Credentials:**
   ```bash
   # Verify credentials file exists
   ls -la gcp-credentials.json
   
   # Test BigQuery connection (create a simple test script)
   node -e "
   const { BigQuery } = require('@google-cloud/bigquery');
   const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID });
   bq.getDatasets().then(([datasets]) => {
     console.log('BigQuery connected! Datasets:', datasets.map(d => d.id));
   }).catch(console.error);
   "
   ```

2. **Monitor BigQuery Buffer:**
   - Watch server logs for "Event added to BigQuery buffer"
   - Buffer size should increase with each event

3. **Trigger Flush:**
   - Send 100+ events quickly, OR
   - Wait 30 seconds for automatic flush
   - Look for "Events flushed to BigQuery via load job"

4. **Verify in BigQuery Console:**
   - Go to [BigQuery Console](https://console.cloud.google.com/bigquery)
   - Navigate to your dataset and table
   - Run query: `SELECT * FROM eventflow.events ORDER BY createdAt DESC LIMIT 10`

## Testing Error Scenarios

### Test Failed Event Processing

The event processor has a 10% simulated failure rate. To test:

1. Send multiple events (statistically, ~10% will fail)
2. Check failed events:
   ```bash
   curl http://localhost:3000/admin/events/failed | jq
   ```
3. Replay a failed event:
   ```bash
   curl -X POST http://localhost:3000/admin/events/EVENT_ID/replay
   ```

### Test Pub/Sub Failure

Temporarily break Pub/Sub connection (wrong project ID) and verify:
- Event still gets stored in PostgreSQL
- Error is logged but doesn't break the API
- Event status is set to `FAILED` with reason

### Test BigQuery Failure

Temporarily break BigQuery (wrong credentials) and verify:
- Event still gets stored in PostgreSQL
- Error is logged but doesn't break the API
- Events remain in buffer for retry

## Performance Testing

### Load Test with Multiple Events

```bash
# Send 50 events quickly
for i in {1..50}; do
  curl -X POST http://localhost:3000/events \
    -H "Content-Type: application/json" \
    -d "{
      \"eventType\": \"load.test\",
      \"payload\": {\"index\": $i, \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}
    }" &
done
wait

# Check metrics after
sleep 10
curl http://localhost:3000/admin/metrics | jq '.summary'
```

## Using Postman or Insomnia

1. **Import Collection:**
   - Create a new collection
   - Add requests for each endpoint from `API_EXAMPLES.md`

2. **Set Environment Variables:**
   - `base_url`: `http://localhost:3000`
   - `event_id`: (will be set from responses)

3. **Test Sequence:**
   - Health Check → Ingest Event → Get Metrics → Get Event Details

## Troubleshooting

### Server Won't Start

```bash
# Check if port is in use
lsof -i :3000

# Check environment variables
cat .env

# Check database connection
psql $DATABASE_URL -c "SELECT 1;"
```

### Worker Not Processing Events

```bash
# Check Pub/Sub subscription exists
# Check worker logs for errors
# Verify GCP credentials are correct
# Check if events are in PENDING status
```

### BigQuery Not Working

```bash
# Check GCP credentials
# Verify BigQuery API is enabled
# Check service account has correct roles
# Look for errors in server logs
# Verify dataset/table names are correct
```

### Events Not Appearing in BigQuery

- BigQuery uses batch loading (not real-time)
- Wait 30 seconds or send 100 events to trigger flush
- Check server logs for flush messages
- Verify load job completed successfully in BigQuery console

## Automated Testing (Future)

To add automated tests, you can:

1. **Install test dependencies:**
   ```bash
   npm install --save-dev @types/supertest supertest
   ```

2. **Create test files:**
   - `src/__tests__/events.test.ts`
   - `src/__tests__/admin.test.ts`
   - `src/__tests__/bigquery.test.ts`

3. **Run tests:**
   ```bash
   npm test
   ```

## Quick Test Checklist

- [ ] Health endpoint returns OK
- [ ] Can ingest an event successfully
- [ ] Event appears in PostgreSQL
- [ ] Event gets processed by worker
- [ ] Metrics endpoint shows processed events
- [ ] BigQuery buffer accumulates events
- [ ] BigQuery flush happens (after 30s or 100 events)
- [ ] Validation errors return proper error messages
- [ ] Admin endpoints return correct data
- [ ] Failed events can be replayed

## Next Steps

Once basic testing passes:
1. Test with higher event volumes
2. Test error scenarios
3. Test graceful shutdown (SIGTERM)
4. Verify data in BigQuery console
5. Test in staging/production environment

