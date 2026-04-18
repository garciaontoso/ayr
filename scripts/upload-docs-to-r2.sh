#!/usr/bin/env bash
# Upload local docs/{ticker}/*.json to R2 bucket ayr-earnings-archive under
# keys like `docs/{ticker}/{filename}`. One-time job — 30+y GuruFocus
# quarterly financials + SEC filing links per ticker that the worker can
# then fetch on demand from R2 (Cloudflare Workers have no filesystem
# access, so these were otherwise unreachable from the agents pipeline).
#
# Usage: bash scripts/upload-docs-to-r2.sh [--dry-run]
#
# Pre-req: logged-in wrangler with access to the `aar-api` worker account.

set -euo pipefail

cd "$(dirname "$0")/.."

BUCKET="ayr-earnings-archive"
DRY_RUN=${1:-}

count=0
skipped=0
failed=0

while IFS= read -r -d '' file; do
  # Relative path: docs/TICKER/filename.json
  rel="${file#./}"
  key="$rel"
  count=$((count + 1))

  if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "[dry] would upload $rel → r2://$BUCKET/$key"
    continue
  fi

  if npx wrangler r2 object put "$BUCKET/$key" --file "$file" --content-type "application/json" --remote >/dev/null 2>&1; then
    echo "[ok]  $rel"
  else
    echo "[err] $rel"
    failed=$((failed + 1))
  fi
done < <(find docs -type f -name "*.json" -print0)

echo ""
echo "Total files processed: $count  failed: $failed"
echo "Run again without --dry-run to actually upload."
