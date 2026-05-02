#!/bin/bash
# Seed Elite Desk memos for offline use.
# Runs all 10 personas with sensible contexts (3 tickers + 3 sectors + portfolio).
# Total ≈ 20 Opus calls ≈ $1.50.
#
# Usage:  AYR_TOKEN=<token> ./scripts/elite_desk_seed.sh

set -u
API="https://api.onto-so.com"
TOKEN="${AYR_TOKEN:-}"
[ -z "$TOKEN" ] && { echo "Set AYR_TOKEN"; exit 1; }

# Top 3 individual tickers by portfolio value (excluding ETFs).
TICKERS=("DEO" "VICI" "RICK")

# Top 3 sectors by portfolio value.
SECTORS=("Financials" "Real Estate" "Consumer Staples")

# Definition of what each prompt runs against.
declare -a JOBS

# Portfolio-based personas (1 call each)
for p in goldman_screener bridgewater_risk blackrock_portfolio harvard_dividend mckinsey_macro; do
  JOBS+=("$p|portfolio|")
done

# Ticker-based personas (3 calls each = 12)
for p in morgan_dcf jpmorgan_earnings citadel_technical renaissance_patterns; do
  for t in "${TICKERS[@]}"; do
    JOBS+=("$p|ticker|$t")
  done
done

# Bain: 3 sectors
for s in "${SECTORS[@]}"; do
  JOBS+=("bain_competitive|sector|$s")
done

echo "Total jobs queued: ${#JOBS[@]}"
echo

# Fire in parallel batches of 4 (Anthropic rate-friendly).
BATCH=4
i=0
while [ $i -lt ${#JOBS[@]} ]; do
  for j in $(seq 0 $((BATCH-1))); do
    idx=$((i+j))
    [ $idx -ge ${#JOBS[@]} ] && break
    job="${JOBS[$idx]}"
    IFS='|' read -r pid ctype cval <<< "$job"
    body="{\"prompt_id\":\"$pid\",\"ctx_type\":\"$ctype\",\"ctx_value\":\"$cval\"}"
    label="$pid·${ctype}${cval:+:$cval}"
    (
      start=$(date +%s)
      resp=$(curl -s -w "\n%{http_code}" -X POST "$API/api/elite-desk/run" \
        -H "Content-Type: application/json" \
        -H "X-AYR-Auth: $TOKEN" \
        -d "$body")
      code=$(echo "$resp" | tail -n1)
      took=$(($(date +%s) - start))
      cached=$(echo "$resp" | head -n -1 | python3 -c "import sys,json; d=json.load(sys.stdin); print('CACHED' if d.get('cached') else 'NEW',d.get('memo',{}).get('id',''),round(d.get('memo',{}).get('cost_usd',0),3))" 2>/dev/null || echo "?")
      printf "  [%3ds] %-45s → HTTP %s · %s\n" "$took" "$label" "$code" "$cached"
    ) &
  done
  wait
  i=$((i+BATCH))
done

echo
echo "Done. Check D1:"
echo "  cd api && npx wrangler d1 execute aar-finanzas --remote --command \"SELECT COUNT(*),SUM(cost_usd) FROM elite_memos\""
