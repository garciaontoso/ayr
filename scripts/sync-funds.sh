#!/bin/bash
# Sync Smart Money (13F superinvestors) data for A&R
# Refreshes latest 13F filings from FMP, then dispatches push notifications
# for any new CRITICAL alerts. Server-side cooldown is respected.
#
# Install via crontab — see scripts/sync-funds.crontab.example
# Logs to ~/Library/Logs/ayr-sync-funds.log

# cron's PATH is minimal — make sure curl/python3 resolve
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"

set -u
set -o pipefail

API_URL="https://api.onto-so.com"
LOG_FILE="$HOME/Library/Logs/ayr-sync-funds.log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[$ts] $*" >> "$LOG_FILE"
}

log "=== sync-funds start ==="

# --- 1) Refresh 13F filings ----------------------------------------------------
REFRESH_BODY_FILE="$(mktemp -t ayr-funds-refresh.XXXXXX)"
REFRESH_HTTP=$(curl -sS -o "$REFRESH_BODY_FILE" -w "%{http_code}" \
  -X POST "$API_URL/api/funds/refresh" \
  -H "Content-Type: application/json" \
  --max-time 120) || {
    log "ERROR refresh: curl failed with exit $?"
    rm -f "$REFRESH_BODY_FILE"
    exit 2
  }

REFRESH_BODY="$(cat "$REFRESH_BODY_FILE")"
rm -f "$REFRESH_BODY_FILE"

if [ "$REFRESH_HTTP" != "200" ]; then
  log "ERROR refresh: HTTP $REFRESH_HTTP body=$REFRESH_BODY"
  exit 3
fi

# Extract a short summary if it's JSON; fall back to raw body
REFRESH_SUMMARY=$(echo "$REFRESH_BODY" | python3 -c '
import sys, json
try:
    d = json.loads(sys.stdin.read())
    keys = ["funds_updated","filings","new_alerts","alerts","updated","status","ok"]
    parts = [f"{k}={d[k]}" for k in keys if k in d]
    print(" ".join(parts) if parts else json.dumps(d)[:300])
except Exception:
    print(sys.stdin.read()[:300] if False else "")
' 2>/dev/null)
[ -z "$REFRESH_SUMMARY" ] && REFRESH_SUMMARY="$(echo "$REFRESH_BODY" | head -c 300)"
log "refresh OK http=$REFRESH_HTTP $REFRESH_SUMMARY"

# --- 2) Dispatch push notifications for CRITICAL alerts -----------------------
NOTIFY_BODY_FILE="$(mktemp -t ayr-funds-notify.XXXXXX)"
NOTIFY_HTTP=$(curl -sS -o "$NOTIFY_BODY_FILE" -w "%{http_code}" \
  -X POST "$API_URL/api/funds/alerts/notify" \
  -H "Content-Type: application/json" \
  --max-time 60) || {
    log "ERROR notify: curl failed with exit $?"
    rm -f "$NOTIFY_BODY_FILE"
    exit 4
  }

NOTIFY_BODY="$(cat "$NOTIFY_BODY_FILE")"
rm -f "$NOTIFY_BODY_FILE"

if [ "$NOTIFY_HTTP" != "200" ]; then
  log "ERROR notify: HTTP $NOTIFY_HTTP body=$NOTIFY_BODY"
  exit 5
fi

NOTIFY_SUMMARY=$(echo "$NOTIFY_BODY" | python3 -c '
import sys, json
try:
    d = json.loads(sys.stdin.read())
    keys = ["sent","skipped","cooldown","alerts","notifications","reason","status","ok"]
    parts = [f"{k}={d[k]}" for k in keys if k in d]
    print(" ".join(parts) if parts else json.dumps(d)[:300])
except Exception:
    print("")
' 2>/dev/null)
[ -z "$NOTIFY_SUMMARY" ] && NOTIFY_SUMMARY="$(echo "$NOTIFY_BODY" | head -c 300)"
log "notify OK http=$NOTIFY_HTTP $NOTIFY_SUMMARY"

log "=== sync-funds done ==="
exit 0
