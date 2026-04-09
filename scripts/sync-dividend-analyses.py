#!/usr/bin/env python3
"""
sync-dividend-analyses.py — Sync Deep Dividend analyses from the worker
cache to local markdown files in docs/dividend-analyses/.

Reads /api/earnings/archive/analyses-cached and writes one .md per ticker
with the naming convention {TICKER}-{YYYY-MM-DD}.md based on updated_at.

If the cached analysis has a markdown_report field, uses it directly.
If not, synthesizes a basic markdown from the structured fields.

Usage:
  source ~/.ayr-env && scripts/sync-dividend-analyses.py
  scripts/sync-dividend-analyses.py --ticker KO     # sync just one
  scripts/sync-dividend-analyses.py --dry-run       # show what would happen
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_BASE = (
    os.environ.get("AYR_API_BASE")
    or os.environ.get("AYR_WORKER_URL")
    or "https://aar-api.garciaontoso.workers.dev"
)
ENDPOINT = "/api/earnings/archive/analyses-cached"

# Cloudflare 403's the default Python urllib UA. Use a normal browser UA.
HTTP_HEADERS = {
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36 sync-dividend-analyses/1.0"
    ),
}

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "docs" / "dividend-analyses"


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def fetch_cached_analyses() -> list[dict]:
    """GET /api/earnings/archive/analyses-cached and return the items array."""
    url = API_BASE.rstrip("/") + ENDPOINT
    req = urllib.request.Request(url, headers=HTTP_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        print(f"HTTP error {e.code} fetching {url}: {e.reason}", file=sys.stderr)
        sys.exit(2)
    except urllib.error.URLError as e:
        print(f"Network error fetching {url}: {e.reason}", file=sys.stderr)
        sys.exit(2)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON from {url}: {e}", file=sys.stderr)
        sys.exit(2)

    if not payload.get("ok"):
        print(f"API returned ok=false: {payload}", file=sys.stderr)
        sys.exit(2)

    return payload.get("items", []) or []


# ---------------------------------------------------------------------------
# Filename / date helpers
# ---------------------------------------------------------------------------

def parse_updated_at(updated_at: str | None) -> datetime:
    """
    The worker returns SQLite CURRENT_TIMESTAMP strings like
    '2026-04-09 05:15:49' (UTC, no timezone). Be lenient.
    """
    if not updated_at:
        return datetime.now(timezone.utc)
    s = updated_at.strip().replace("T", " ")
    # Strip trailing 'Z' or fractional seconds we don't care about.
    if s.endswith("Z"):
        s = s[:-1]
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        try:
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return datetime.now(timezone.utc)


def sanitize_ticker(ticker: str) -> str:
    """Make a ticker safe for a filename. Keep alnum, dot, underscore, dash."""
    out = []
    for ch in (ticker or "").upper():
        if ch.isalnum() or ch in (".", "_", "-"):
            out.append(ch)
        else:
            out.append("_")
    return "".join(out) or "UNKNOWN"


def output_filename(ticker: str, updated_at: str | None) -> str:
    dt = parse_updated_at(updated_at)
    return f"{sanitize_ticker(ticker)}-{dt.strftime('%Y-%m-%d')}.md"


# ---------------------------------------------------------------------------
# Markdown rendering
# ---------------------------------------------------------------------------

def render_bullets(items) -> str:
    if not items:
        return "_(none)_"
    if isinstance(items, str):
        items = [items]
    return "\n".join(f"- {str(x).strip()}" for x in items if x)


def synthesize_markdown(ticker: str, updated_at: str, analysis: dict) -> str:
    """
    Build a markdown report from the structured fields stored in the cache.
    Used when the cached analysis does NOT have a `markdown_report` field.
    """
    a = analysis or {}
    verdict = a.get("long_term_verdict") or a.get("verdict") or "—"
    confidence = a.get("confidence") or "—"
    safety = a.get("dividend_safety_score")
    safety_str = f"{safety}/10" if safety is not None else "—"

    lines: list[str] = []
    lines.append(f"# {sanitize_ticker(ticker)} — Deep Dividend Analysis")
    lines.append("")
    lines.append(f"**Generated (cache):** {updated_at or '—'}")
    lines.append(f"**Verdict:** {verdict}")
    lines.append(f"**Confidence:** {confidence}")
    lines.append(f"**Dividend safety score:** {safety_str}")
    lines.append("")
    lines.append("---")
    lines.append("")

    lines.append("## Executive Summary")
    lines.append("")
    lines.append(a.get("summary") or "_(no summary in cache)_")
    lines.append("")

    if a.get("thesis_update"):
        lines.append("## Thesis Update")
        lines.append("")
        lines.append(a["thesis_update"])
        lines.append("")

    lines.append("## Revenue Trend")
    lines.append("")
    lines.append(a.get("revenue_trend") or "_(n/a)_")
    lines.append("")

    lines.append("## Margin Trend")
    lines.append("")
    lines.append(a.get("margin_trend") or "_(n/a)_")
    lines.append("")

    lines.append("## Moat")
    lines.append("")
    lines.append(a.get("moat") or "_(n/a)_")
    lines.append("")

    lines.append("## Capital Allocation")
    lines.append("")
    lines.append(a.get("capital_allocation") or "_(n/a)_")
    lines.append("")

    lines.append("## Dividend Health")
    lines.append("")
    lines.append(a.get("dividend_health") or "_(n/a)_")
    lines.append("")

    lines.append("## Why Yes")
    lines.append("")
    lines.append(render_bullets(a.get("why_yes")))
    lines.append("")

    lines.append("## Why No")
    lines.append("")
    lines.append(render_bullets(a.get("why_no")))
    lines.append("")

    lines.append("## Guidance Changes")
    lines.append("")
    lines.append(render_bullets(a.get("guidance_changes")))
    lines.append("")

    lines.append("## Emerging Risks")
    lines.append("")
    lines.append(render_bullets(a.get("emerging_risks")))
    lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## Raw cache payload")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(a, indent=2, ensure_ascii=False))
    lines.append("```")
    lines.append("")

    return "\n".join(lines)


def render_report(ticker: str, updated_at: str, analysis: dict) -> str:
    """If the cache already has markdown_report, use it; else synthesize."""
    md = (analysis or {}).get("markdown_report")
    if isinstance(md, str) and md.strip():
        return md
    return synthesize_markdown(ticker, updated_at, analysis)


# ---------------------------------------------------------------------------
# Writer
# ---------------------------------------------------------------------------

def should_skip(out_path: Path, source_dt: datetime) -> bool:
    """
    Skip if the existing file's mtime is at least as fresh as the source's
    updated_at. This makes the script idempotent.
    """
    if not out_path.exists():
        return False
    existing_mtime = datetime.fromtimestamp(out_path.stat().st_mtime, tz=timezone.utc)
    return existing_mtime >= source_dt


def process_item(item: dict, *, dry_run: bool) -> dict:
    ticker = item.get("ticker") or "UNKNOWN"
    updated_at = item.get("updated_at") or ""
    analysis = item.get("analysis") or {}

    filename = output_filename(ticker, updated_at)
    out_path = OUT_DIR / filename
    source_dt = parse_updated_at(updated_at)

    if should_skip(out_path, source_dt):
        return {"ticker": ticker, "path": str(out_path), "action": "skip-up-to-date"}

    if dry_run:
        return {"ticker": ticker, "path": str(out_path), "action": "would-write"}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    content = render_report(ticker, updated_at, analysis)
    out_path.write_text(content, encoding="utf-8")
    return {"ticker": ticker, "path": str(out_path), "action": "wrote"}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    global API_BASE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be written without writing.")
    parser.add_argument("--ticker", default=None,
                        help="Only sync one ticker (case-insensitive).")
    parser.add_argument("--api-base", default=None,
                        help=f"Override worker base URL (default {API_BASE}).")
    args = parser.parse_args()

    if args.api_base:
        API_BASE = args.api_base

    items = fetch_cached_analyses()
    if args.ticker:
        wanted = args.ticker.upper()
        items = [it for it in items if (it.get("ticker") or "").upper() == wanted]

    if not items:
        print("No cached analyses to sync.")
        return 0

    print(f"Source: {API_BASE}{ENDPOINT}")
    print(f"Output: {OUT_DIR}")
    print(f"Mode:   {'DRY-RUN' if args.dry_run else 'WRITE'}")
    print(f"Items:  {len(items)}")
    print("-" * 72)

    counts = {"wrote": 0, "would-write": 0, "skip-up-to-date": 0}
    for item in items:
        result = process_item(item, dry_run=args.dry_run)
        counts[result["action"]] = counts.get(result["action"], 0) + 1
        rel = Path(result["path"]).relative_to(REPO_ROOT) if Path(result["path"]).is_absolute() else Path(result["path"])
        print(f"  [{result['action']:17s}] {result['ticker']:8s} → {rel}")

    print("-" * 72)
    summary_bits = [f"{k}={v}" for k, v in counts.items() if v]
    print("Summary: " + (", ".join(summary_bits) if summary_bits else "(nothing)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
