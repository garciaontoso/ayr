#!/usr/bin/env bash
# yt-poller.sh — Local Mac agent that polls the Worker for YouTube
# processing requests. Runs every 60s via launchd.
#
# Flow:
#   1. GET /api/youtube/should-process (auth)
#   2. If should=true, run scan-youtube.sh
#   3. POST /api/youtube/clear-process-request to ack
#
# Logs to ~/Library/Logs/ayr-yt-poller.log

set -uo pipefail

# Source env (the file the user created in step 5 of INSTALL.md)
[ -f "$HOME/.ayr-env" ] && source "$HOME/.ayr-env"

WORKER_URL="${AYR_WORKER_URL:-https://aar-api.garciaontoso.workers.dev}"
LOG_FILE="${HOME}/Library/Logs/ayr-yt-poller.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$(dirname "$LOG_FILE")"

# Sanity check — silently exit if env not set (cron will retry)
[ -n "${AYR_WORKER_TOKEN:-}" ] || { exit 0; }
[ -n "${ANTHROPIC_API_KEY:-}" ] || { exit 0; }

# Check the flag
RESP=$(curl -sS --max-time 10 -H "Authorization: Bearer $AYR_WORKER_TOKEN" \
  "$WORKER_URL/api/youtube/should-process" 2>/dev/null || echo '{}')

SHOULD=$(echo "$RESP" | grep -o '"should":[a-z]*' | head -1 | cut -d: -f2)

if [ "$SHOULD" != "true" ]; then
  exit 0
fi

# Process requested. Run the scanner.
echo "[$(date '+%Y-%m-%d %H:%M:%S')] User triggered processing — running scan-youtube.sh" >> "$LOG_FILE"

if "$SCRIPT_DIR/scan-youtube.sh" >> "$LOG_FILE" 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] scan-youtube.sh completed OK" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] scan-youtube.sh failed (exit $?)" >> "$LOG_FILE"
fi

# Clear the flag whether it succeeded or failed
curl -sS --max-time 10 -X POST -H "Authorization: Bearer $AYR_WORKER_TOKEN" \
  "$WORKER_URL/api/youtube/clear-process-request" >> "$LOG_FILE" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Flag cleared" >> "$LOG_FILE"
