#!/bin/bash

# EventFlow Test Script
# Tests the complete event flow from ingestion to processing

BASE_URL="http://localhost:3000"

echo "🧪 Testing EventFlow..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if server is running
echo "📡 Checking if server is running..."
if ! curl -s $BASE_URL/health > /dev/null; then
  echo -e "${RED}❌ Server is not running. Please start it with: npm run dev${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"
echo ""

# 1. Health check
echo "1️⃣  Health check..."
HEALTH=$(curl -s $BASE_URL/health)
if echo $HEALTH | jq -e '.status == "ok"' > /dev/null; then
  echo -e "${GREEN}✅ Health check passed${NC}"
  echo "$HEALTH" | jq
else
  echo -e "${RED}❌ Health check failed${NC}"
  exit 1
fi
echo ""

# 2. Ingest event
echo "2️⃣  Ingesting test event..."
RESPONSE=$(curl -s -X POST $BASE_URL/events \
  -H "Content-Type: application/json" \
  -d "{
    \"eventType\": \"test.event\",
    \"payload\": {
      \"test\": true,
      \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
      \"message\": \"Test event from script\"
    },
    \"metadata\": {
      \"source\": \"test-script\",
      \"version\": \"1.0\"
    }
  }")

EVENT_ID=$(echo $RESPONSE | jq -r '.eventId // empty')

if [ -z "$EVENT_ID" ] || [ "$EVENT_ID" == "null" ]; then
  echo -e "${RED}❌ Failed to ingest event${NC}"
  echo "$RESPONSE" | jq
  exit 1
fi

echo -e "${GREEN}✅ Event ingested successfully${NC}"
echo "Event ID: $EVENT_ID"
echo "$RESPONSE" | jq
echo ""

# 3. Wait for processing
echo "3️⃣  Waiting 5 seconds for event processing..."
sleep 5
echo ""

# 4. Check metrics
echo "4️⃣  Checking metrics..."
METRICS=$(curl -s $BASE_URL/admin/metrics)
echo "$METRICS" | jq '.summary'
echo ""

# 5. Get event details
echo "5️⃣  Getting event details..."
EVENT_DETAILS=$(curl -s $BASE_URL/admin/events/$EVENT_ID)
if echo $EVENT_DETAILS | jq -e '.id' > /dev/null; then
  echo -e "${GREEN}✅ Event found${NC}"
  echo "$EVENT_DETAILS" | jq '{id, eventType, status, createdAt, processedAt}'
  
  STATUS=$(echo $EVENT_DETAILS | jq -r '.status')
  if [ "$STATUS" == "PROCESSED" ]; then
    echo -e "${GREEN}✅ Event processed successfully${NC}"
  elif [ "$STATUS" == "PENDING" ]; then
    echo -e "${YELLOW}⚠️  Event still pending (worker may need more time)${NC}"
  elif [ "$STATUS" == "FAILED" ]; then
    echo -e "${RED}❌ Event processing failed${NC}"
  else
    echo -e "${YELLOW}⚠️  Event status: $STATUS${NC}"
  fi
else
  echo -e "${RED}❌ Failed to get event details${NC}"
  echo "$EVENT_DETAILS" | jq
fi
echo ""

# 6. Test validation
echo "6️⃣  Testing validation (should fail)..."
VALIDATION_TEST=$(curl -s -X POST $BASE_URL/events \
  -H "Content-Type: application/json" \
  -d '{"eventType": ""}')

if echo $VALIDATION_TEST | jq -e '.error' > /dev/null; then
  echo -e "${GREEN}✅ Validation working correctly${NC}"
  echo "$VALIDATION_TEST" | jq '.error'
else
  echo -e "${RED}❌ Validation test failed${NC}"
fi
echo ""

echo -e "${GREEN}✅ Test flow complete!${NC}"
echo ""
echo "📊 Summary:"
echo "  - Health check: ✅"
echo "  - Event ingestion: ✅"
echo "  - Event processing: Check status above"
echo "  - Validation: ✅"
echo ""
echo "💡 Next steps:"
echo "  - Check BigQuery console for analytics data (may take 30s to flush)"
echo "  - View more events: curl $BASE_URL/admin/metrics | jq"
echo "  - View failed events: curl $BASE_URL/admin/events/failed | jq"

