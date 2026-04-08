#!/usr/bin/env bash
# scan-youtube.sh — Local Mac script for YouTube Dividendo Agent
#
# Flow:
#   1. Ask Worker for list of pending video_ids (from all tracked channels)
#   2. For each: yt-dlp with Chrome cookies → clean VTT → plain text
#   3. Call Claude Opus 4.6 to extract structured per-company summary
#   4. POST result to Worker → D1
#
# Runs manually (triggered by button in the Noticias tab OR user-run from terminal).
# Optional cron once stable. Do NOT put in cron until button flow is tested.
#
# Dependencies on Mac:
#   - yt-dlp  (pip3 install yt-dlp, or brew install yt-dlp)
#   - jq      (brew install jq)
#   - Chrome with the user logged into YouTube (for cookies)
#   - curl
#
# Secrets required as env vars (source from ~/.ayr-env or similar):
#   - ANTHROPIC_API_KEY
#   - AYR_WORKER_URL          (default: https://aar-api.garciaontoso.workers.dev)
#   - AYR_WORKER_TOKEN        (shared secret for POST /api/youtube/upload-summary)

set -euo pipefail

# --- config ---
WORKER_URL="${AYR_WORKER_URL:-https://aar-api.garciaontoso.workers.dev}"
LOG_FILE="${HOME}/Library/Logs/ayr-scan-youtube.log"
TMP_DIR="$(mktemp -d -t ayr-yt-XXXXXX)"
YTDLP="${YTDLP_BIN:-$(command -v yt-dlp || echo /Users/ricardogarciaontoso/Library/Python/3.9/bin/yt-dlp)}"
MODEL="claude-opus-4-6"

mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S') scan-youtube.sh start ==="

# --- sanity ---
command -v jq >/dev/null || { echo "ERROR: jq not installed (brew install jq)"; exit 1; }
[ -x "$YTDLP" ] || { echo "ERROR: yt-dlp not found at $YTDLP"; exit 1; }
[ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "ERROR: ANTHROPIC_API_KEY not set"; exit 1; }
[ -n "${AYR_WORKER_TOKEN:-}" ] || { echo "ERROR: AYR_WORKER_TOKEN not set"; exit 1; }

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# --- step 1: pending list ---
echo "→ Fetching pending videos from Worker..."
PENDING_JSON=$(curl -sS -H "Authorization: Bearer $AYR_WORKER_TOKEN" \
  "$WORKER_URL/api/youtube/pending")
PENDING_COUNT=$(echo "$PENDING_JSON" | jq '.pending | length')
echo "  $PENDING_COUNT pending video(s)"

if [ "$PENDING_COUNT" -eq 0 ]; then
  echo "Nothing to do. Done."
  exit 0
fi

# --- step 2+3+4 per video ---
TOTAL_COST=0
PROCESSED=0

echo "$PENDING_JSON" | jq -c '.pending[]' | while read -r row; do
  VID=$(echo "$row" | jq -r '.video_id')
  TITLE=$(echo "$row" | jq -r '.title')
  URL=$(echo "$row" | jq -r '.url')
  echo "→ Processing $VID: $TITLE"

  # 2. Transcription
  VTT_PATH="$TMP_DIR/${VID}.es.vtt"
  TXT_PATH="$TMP_DIR/${VID}.txt"

  if ! "$YTDLP" \
      --cookies-from-browser chrome \
      --skip-download \
      --write-auto-subs \
      --sub-langs "es,es-ES,es-orig" \
      --sub-format vtt \
      -o "$TMP_DIR/${VID}.%(ext)s" \
      "$URL" 2>&1 | tail -5; then
    echo "  ✗ yt-dlp failed for $VID — skipping"
    curl -sS -X POST -H "Authorization: Bearer $AYR_WORKER_TOKEN" \
      -H "Content-Type: application/json" \
      "$WORKER_URL/api/youtube/mark-error" \
      -d "{\"video_id\":\"$VID\",\"error\":\"yt-dlp failed\"}" >/dev/null
    continue
  fi

  # Prefer es-orig, fallback to es
  SUBFILE=""
  for candidate in "$TMP_DIR/${VID}.es-orig.vtt" "$TMP_DIR/${VID}.es.vtt" "$TMP_DIR/${VID}.es-ES.vtt"; do
    [ -f "$candidate" ] && SUBFILE="$candidate" && break
  done
  if [ -z "$SUBFILE" ]; then
    echo "  ✗ No subtitle file produced — skipping"
    continue
  fi

  cat "$SUBFILE" \
    | grep -v "^WEBVTT\|^Kind:\|^Language:\|^$" \
    | grep -vE "^[0-9]{2}:[0-9]{2}" \
    | sed 's/<[^>]*>//g' \
    | awk '!seen[$0]++' > "$TXT_PATH"

  WORD_COUNT=$(wc -w < "$TXT_PATH")
  echo "  ✓ Transcription: $WORD_COUNT words"

  # 3. Call Opus
  PROMPT=$(cat <<'PROMPT_EOF'
Eres un analista que extrae información de vídeos de inversión en español del canal "El Dividendo" (Gorka).

Te paso la transcripción de un vídeo. Tu tarea:

1. Identifica TODAS las empresas que el autor analiza a fondo (no menciones de paso, salvo que dé razones).
2. Para cada empresa devuelve un objeto con esta forma exacta:
{
  "company_name": "nombre como lo dice el autor",
  "ticker": "ticker bursátil si lo menciona, o null",
  "thesis": "1-3 frases con la tesis del autor",
  "verdict": "compra" | "mantener" | "evitar" | "observar" | "vender",
  "target_price": "string libre o null",
  "fair_value": "string libre o null",
  "risks": ["riesgo 1", "riesgo 2"],
  "catalyst": "string libre o null",
  "timestamp_seconds": número o null
}

3. Devuelve también "summary_general" con 2-3 frases resumiendo el vídeo entero.

Formato de salida: JSON VÁLIDO, sin markdown, sin texto extra, sin ```.
{
  "summary_general": "...",
  "companies": [...]
}

Transcripción:
---
PROMPT_EOF
)
  PROMPT="${PROMPT}
$(cat "$TXT_PATH")
---"

  # Build request JSON safely with jq
  REQ_JSON=$(jq -n \
    --arg model "$MODEL" \
    --arg prompt "$PROMPT" \
    '{
      model: $model,
      max_tokens: 4096,
      messages: [{role: "user", content: $prompt}]
    }')

  API_RESP=$(curl -sS https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$REQ_JSON")

  SUMMARY_TEXT=$(echo "$API_RESP" | jq -r '.content[0].text // empty')
  INPUT_TOKENS=$(echo "$API_RESP" | jq -r '.usage.input_tokens // 0')
  OUTPUT_TOKENS=$(echo "$API_RESP" | jq -r '.usage.output_tokens // 0')

  if [ -z "$SUMMARY_TEXT" ]; then
    echo "  ✗ Empty response from Anthropic API"
    echo "    $API_RESP" | head -c 500
    continue
  fi

  # Cost: Opus 4.6 → $15/MTok in, $75/MTok out
  COST=$(awk "BEGIN { printf \"%.4f\", ($INPUT_TOKENS * 15 + $OUTPUT_TOKENS * 75) / 1000000 }")
  echo "  ✓ Opus response: $INPUT_TOKENS→$OUTPUT_TOKENS tokens, \$$COST"

  # 4. Upload to Worker
  UPLOAD_JSON=$(jq -n \
    --arg video_id "$VID" \
    --arg model "$MODEL" \
    --arg transcript_source "yt-dlp-chrome-cookies" \
    --argjson cost "$COST" \
    --arg raw "$SUMMARY_TEXT" \
    '{
      video_id: $video_id,
      model: $model,
      transcript_source: $transcript_source,
      processing_cost_usd: $cost,
      raw_summary: $raw
    }')

  HTTP_CODE=$(curl -sS -o /tmp/upload_resp.txt -w "%{http_code}" \
    -X POST -H "Authorization: Bearer $AYR_WORKER_TOKEN" \
    -H "Content-Type: application/json" \
    "$WORKER_URL/api/youtube/upload-summary" \
    -d "$UPLOAD_JSON")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✓ Uploaded to D1"
    PROCESSED=$((PROCESSED + 1))
    TOTAL_COST=$(awk "BEGIN { printf \"%.4f\", $TOTAL_COST + $COST }")
  else
    echo "  ✗ Upload failed HTTP $HTTP_CODE:"
    cat /tmp/upload_resp.txt | head -c 500
  fi
done

echo "=== Done. Processed $PROCESSED video(s), total cost \$$TOTAL_COST ==="
