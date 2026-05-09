#!/bin/bash
# Sync IB Flex Query trades + dividends to A&R API
# Run this manually or via crontab: 0 8 * * 1-5 /path/to/sync-flex.sh
# 2026-05-10: Updated FLEX_TOKEN + QUERY_ID. Removed deprecated sync-dividends call.

FLEX_TOKEN="4287951836214747115211682"
QUERY_ID="1503189"
API_URL="https://api.onto-so.com"

# Load worker auth token from ~/.ayr-env
if [ -f ~/.ayr-env ]; then
  source ~/.ayr-env
fi
if [ -z "$AYR_WORKER_TOKEN" ]; then
  echo "❌ AYR_WORKER_TOKEN not set. Add to ~/.ayr-env"
  exit 1
fi

echo "📡 Requesting Flex Query $QUERY_ID..."
SEND_RESP=$(curl -s "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=$FLEX_TOKEN&q=$QUERY_ID&v=3")
REF_CODE=$(echo "$SEND_RESP" | grep -o '<ReferenceCode>[^<]*</ReferenceCode>' | sed 's/<[^>]*>//g')

if [ -z "$REF_CODE" ]; then
  echo "❌ SendRequest failed: $SEND_RESP"
  exit 1
fi

echo "⏳ Waiting for statement (ref: $REF_CODE)..."
sleep 10

STATEMENT=$(curl -s "https://gdcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement?t=$FLEX_TOKEN&q=$REF_CODE&v=3")

# Check if ready (retry once if not)
if ! echo "$STATEMENT" | grep -q "FlexQueryResponse"; then
  echo "⏳ Statement not ready, waiting 15s and retrying..."
  sleep 15
  STATEMENT=$(curl -s "https://gdcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement?t=$FLEX_TOKEN&q=$REF_CODE&v=3")
fi

if echo "$STATEMENT" | grep -q "FlexQueryResponse"; then
  TRADES=$(echo "$STATEMENT" | grep -c '<Trade ')
  CASH=$(echo "$STATEMENT" | grep -c '<CashTransaction ')
  echo "✅ Got $TRADES trades and $CASH cash transactions"

  # Save to temp file and upload to API
  echo "$STATEMENT" > /tmp/ib-flex-statement.xml

  # Upload to worker for processing (with auth)
  curl -s -X POST "$API_URL/api/ib-flex-import" \
    -H "Content-Type: application/xml" \
    -H "Origin: https://ayr.onto-so.com" \
    -H "X-AYR-Auth: $AYR_WORKER_TOKEN" \
    --data-binary @/tmp/ib-flex-statement.xml | python3 -m json.tool

  rm /tmp/ib-flex-statement.xml

  # NOTE: /api/costbasis/sync-dividends is DEPRECATED (2026-05-02).
  # Worker /api/costbasis already does MERGE-on-READ between cost_basis + dividendos.
  # No need to call sync-dividends anymore.

  echo "🎉 Done!"
else
  echo "❌ Statement not ready after retry: $(echo "$STATEMENT" | head -5)"
  exit 1
fi
