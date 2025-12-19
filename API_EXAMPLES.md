# API Examples

This document provides example API calls for testing EventFlow.

## Base URL

Local development: `http://localhost:3000`
Production: Your Cloud Run URL

## Health Check

```bash
curl http://localhost:3000/health
```

## Event Ingestion

### Basic Event

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "user.signup",
    "payload": {
      "userId": "123",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }'
```

### Event with Metadata

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "order.created",
    "payload": {
      "orderId": "order-123",
      "amount": 99.99,
      "currency": "USD",
      "items": [
        {"productId": "prod-1", "quantity": 2}
      ]
    },
    "metadata": {
      "source": "web",
      "userId": "user-456",
      "version": "1.0",
      "timestamp": "2024-01-01T00:00:00Z"
    }
  }'
```

### Invalid Event (Validation Error)

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": ""
  }'
```

## Admin Endpoints

### Get Failed Events

```bash
curl http://localhost:3000/admin/events/failed
```

With pagination:

```bash
curl "http://localhost:3000/admin/events/failed?page=1&limit=10"
```

### Get Event by ID

```bash
curl http://localhost:3000/admin/events/{event-id}
```

Replace `{event-id}` with an actual event ID from a previous response.

### Replay Failed Event

```bash
curl -X POST http://localhost:3000/admin/events/{event-id}/replay \
  -H "Content-Type: application/json"
```

### Get Metrics

```bash
curl http://localhost:3000/admin/metrics
```

## Example Workflow

1. **Ingest an event:**
   ```bash
   curl -X POST http://localhost:3000/events \
     -H "Content-Type: application/json" \
     -d '{
       "eventType": "test.event",
       "payload": {"test": true}
     }'
   ```

2. **Wait a few seconds for processing, then check metrics:**
   ```bash
   curl http://localhost:3000/admin/metrics
   ```

3. **If an event failed, get failed events:**
   ```bash
   curl http://localhost:3000/admin/events/failed
   ```

4. **Replay a failed event:**
   ```bash
   curl -X POST http://localhost:3000/admin/events/{event-id}/replay
   ```

## Using with jq (for pretty JSON output)

```bash
curl http://localhost:3000/admin/metrics | jq
```

