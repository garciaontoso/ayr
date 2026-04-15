#!/bin/bash
# Sync IB Flex Query trades + dividends to A&R API
# Run this manually or via crontab: 0 8 * * 1-5 /path/to/sync-flex.sh

FLEX_TOKEN="187746530027081663959936"
QUERY_ID="1452278"
API_URL="https://api.onto-so.com"

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

# Check if ready
if echo "$STATEMENT" | grep -q "FlexQueryResponse"; then
  TRADES=$(echo "$STATEMENT" | grep -c '<Trade ')
  CASH=$(echo "$STATEMENT" | grep -c '<CashTransaction ')
  echo "✅ Got $TRADES trades and $CASH cash transactions"

  # Save to temp file and upload to API
  echo "$STATEMENT" > /tmp/ib-flex-statement.xml

  # Upload to worker for processing
  curl -s -X POST "$API_URL/api/ib-flex-import" \
    -H "Content-Type: application/xml" \
    --data-binary @/tmp/ib-flex-statement.xml | python3 -m json.tool

  rm /tmp/ib-flex-statement.xml

  # Sync dividends to cost_basis so they appear in Trades tab
  echo "🔄 Syncing dividends to cost_basis..."
  curl -s -X POST "$API_URL/api/costbasis/sync-dividends" | python3 -m json.tool

  echo "🎉 Done!"
else
  echo "❌ Statement not ready: $(echo "$STATEMENT" | head -5)"
fi
