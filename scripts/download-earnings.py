#!/usr/bin/env python3
"""
download-earnings.py — Fetch SEC filings (10-K, 10-Q) and FMP earnings call
transcripts for the last N years for a list of tickers, strip HTML to text,
and upload each document to the AyR Worker (/api/earnings/archive/upload).

Storage backend: R2 bucket ayr-earnings-archive. Metadata index in D1.

Env vars required (source ~/.ayr-env before running):
  AYR_WORKER_URL   (default: https://aar-api.garciaontoso.workers.dev)
  AYR_WORKER_TOKEN (bearer auth for upload endpoint)
  FMP_KEY          (Financial Modeling Prep API key)

Usage:
  scripts/download-earnings.py                       # portfolio tickers, 3y
  scripts/download-earnings.py --years 5             # 5-year lookback
  scripts/download-earnings.py --tickers AAPL,MSFT   # specific tickers
  scripts/download-earnings.py --skip-sec            # transcripts only
  scripts/download-earnings.py --skip-fmp            # SEC filings only
  scripts/download-earnings.py --dry-run             # no uploads

Logs to ~/Library/Logs/ayr-earnings-archive.log
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────
WORKER_URL = os.environ.get("AYR_WORKER_URL", "https://aar-api.garciaontoso.workers.dev")
WORKER_TOKEN = os.environ.get("AYR_WORKER_TOKEN", "")
SEC_USER_AGENT = "AyR Research ricardo@garciaontoso.example"  # required by SEC

SEC_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik10}.json"
SEC_ARCHIVE_URL = (
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}"
    "&type={type}&dateb=&owner=include&count=40"
)

# FMP endpoints are proxied through the Worker so FMP_KEY stays server-side.
FMP_LIST_URL = f"{WORKER_URL}/api/earnings/archive/fmp-transcript-list"
FMP_ONE_URL = f"{WORKER_URL}/api/earnings/archive/fmp-transcript"

# SEC rate limit: 10 req/s. We play it safe at 5 req/s.
SEC_RATE_DELAY = 0.2
SEC_MAX_RETRIES = 3

LOG_FILE = Path.home() / "Library" / "Logs" / "ayr-earnings-archive.log"
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

DEFAULT_FORMS = ("10-K", "10-Q", "20-F")
MAX_DOC_BYTES = 20 * 1024 * 1024  # 20 MB cap per doc (R2 body limit)


# ─── Logging ─────────────────────────────────────────────────────────
def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ─── HTTP helpers (stdlib only) ──────────────────────────────────────
def http_get(url, headers=None, timeout=60, binary=False, retries=3):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url)
            req.add_header("User-Agent", SEC_USER_AGENT)
            req.add_header("Accept-Encoding", "identity")
            if headers:
                for k, v in headers.items():
                    req.add_header(k, v)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
                if binary:
                    return data
                return data.decode("utf-8", errors="replace")
        except Exception as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(1.0 + attempt)
                continue
            raise last_err


def http_post_json(url, payload, headers=None, timeout=120, retries=3):
    body = json.dumps(payload).encode("utf-8")
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=body, method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("User-Agent", "AyR-earnings-archive/1.0")
            if headers:
                for k, v in headers.items():
                    req.add_header(k, v)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                err_body = e.read().decode("utf-8", errors="replace")[:500]
            except Exception:
                err_body = ""
            last_err = Exception(f"HTTP {e.code}: {err_body or e.reason}")
            if attempt < retries - 1 and e.code >= 500:
                time.sleep(1.0 + attempt)
                continue
            raise last_err
        except Exception as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(1.0 + attempt)
                continue
            raise last_err


# ─── HTML → text ─────────────────────────────────────────────────────
class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._skip_depth = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "iframe", "svg", "head"):
            self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "iframe", "svg", "head") and self._skip_depth > 0:
            self._skip_depth -= 1
        if tag in ("p", "br", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5"):
            self.parts.append("\n")

    def handle_data(self, data):
        if self._skip_depth == 0 and data.strip():
            self.parts.append(data)


def html_to_text(html):
    try:
        p = _TextExtractor()
        p.feed(html)
        text = "".join(p.parts)
    except Exception:
        text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ─── SEC EDGAR ───────────────────────────────────────────────────────
_CIK_MAP_CACHE = None


def load_cik_map():
    """Fetch ticker→CIK map from SEC (cached in /tmp for the run)."""
    global _CIK_MAP_CACHE
    if _CIK_MAP_CACHE is not None:
        return _CIK_MAP_CACHE
    tmp = Path("/tmp/sec-company-tickers.json")
    data = None
    if tmp.exists() and (time.time() - tmp.stat().st_mtime) < 86400:
        try:
            data = json.loads(tmp.read_text())
        except Exception as e:
            log(f"Corrupt CIK cache, refetching: {e}")
            try: tmp.unlink()
            except Exception: pass
    if data is None:
        log("Fetching SEC ticker→CIK map...")
        raw = http_get(SEC_COMPANY_TICKERS_URL, retries=3)
        data = json.loads(raw)
        try:
            tmp.write_text(raw)
        except Exception as e:
            log(f"Could not cache CIK map: {e}")
    # Format: { "0": {"cik_str":320193,"ticker":"AAPL","title":"Apple Inc."}, ... }
    _CIK_MAP_CACHE = {v["ticker"].upper(): str(v["cik_str"]).zfill(10) for v in data.values()}
    log(f"Loaded CIK map: {len(_CIK_MAP_CACHE)} tickers")
    return _CIK_MAP_CACHE


def list_sec_filings(ticker, years, forms):
    """Return list of filings for a ticker: [{type, filing_date, accession, primary_doc, url}, ...]."""
    cik_map = load_cik_map()
    cik10 = cik_map.get(ticker.upper())
    if not cik10:
        log(f"  [{ticker}] no CIK (skipping SEC)")
        return []
    time.sleep(SEC_RATE_DELAY)
    url = SEC_SUBMISSIONS_URL.format(cik10=cik10)
    try:
        raw = http_get(url)
    except Exception as e:
        log(f"  [{ticker}] SEC submissions fetch failed: {e}")
        return []
    sub = json.loads(raw)
    recent = sub.get("filings", {}).get("recent", {})
    form_arr = recent.get("form", [])
    date_arr = recent.get("filingDate", [])
    acc_arr = recent.get("accessionNumber", [])
    prim_arr = recent.get("primaryDocument", [])
    period_arr = recent.get("reportDate", [])
    cutoff = time.strftime("%Y-%m-%d", time.gmtime(time.time() - years * 365 * 86400))
    out = []
    cik_no_zeros = str(int(cik10))
    for i, form in enumerate(form_arr):
        if form not in forms:
            continue
        filed = date_arr[i]
        if filed < cutoff:
            continue
        accession = acc_arr[i]
        primary = prim_arr[i]
        period = period_arr[i] if i < len(period_arr) else None
        acc_nodash = accession.replace("-", "")
        doc_url = f"https://www.sec.gov/Archives/edgar/data/{cik_no_zeros}/{acc_nodash}/{urllib.parse.quote(primary, safe='/')}"
        out.append({
            "type": form,
            "filing_date": filed,
            "period_of_report": period,
            "accession": accession,
            "primary_doc": primary,
            "url": doc_url,
        })
    return out


def _infer_fiscal_from_period(period_str):
    """Best-effort fiscal year/quarter from a period_of_report date."""
    if not period_str or len(period_str) < 10:
        return None, None
    try:
        yr = int(period_str[:4])
        mo = int(period_str[5:7])
        # Calendar-quarter approximation; fine for deduping
        q = (mo - 1) // 3 + 1
        return yr, q
    except Exception:
        return None, None


def download_sec_filing(ticker, filing, dry_run=False):
    time.sleep(SEC_RATE_DELAY)
    try:
        html = http_get(filing["url"], retries=SEC_MAX_RETRIES)
    except Exception as e:
        log(f"  [{ticker}] fetch fail {filing['type']} {filing['filing_date']}: {e}")
        return False
    if len(html.encode("utf-8")) > MAX_DOC_BYTES:
        log(f"  [{ticker}] skip {filing['type']} {filing['filing_date']} — body > 20MB")
        return False
    text = html_to_text(html)
    if len(text) < 500:
        log(f"  [{ticker}] skip {filing['type']} — stripped body too small ({len(text)}b)")
        return False
    fy, fq = _infer_fiscal_from_period(filing.get("period_of_report"))
    if filing["type"] in ("10-K", "20-F"):
        fq = None  # annual report, no quarter
    payload = {
        "ticker": ticker,
        "doc_type": filing["type"],
        "fiscal_year": fy,
        "fiscal_quarter": fq,
        "filing_date": filing["filing_date"],
        "period_of_report": filing.get("period_of_report"),
        "accession_number": filing["accession"],
        "source": "sec-edgar",
        "source_url": filing["url"],
        "title": f"{ticker} {filing['type']} {filing.get('period_of_report') or filing['filing_date']}",
        "body_text": text,
    }
    if dry_run:
        log(f"  [{ticker}] DRY {filing['type']} {filing['filing_date']} → {len(text)}b")
        return True
    try:
        r = http_post_json(
            f"{WORKER_URL}/api/earnings/archive/upload",
            payload,
            headers={"Authorization": f"Bearer {WORKER_TOKEN}"},
        )
        log(
            f"  [{ticker}] ✓ {filing['type']} {filing['filing_date']} "
            f"→ {r.get('r2_key')} ({r.get('size_bytes')}b)"
        )
        return True
    except Exception as e:
        log(f"  [{ticker}] upload fail {filing['type']} {filing['filing_date']}: {e}")
        return False


# ─── FMP earnings call transcripts ───────────────────────────────────
def list_fmp_transcripts(ticker, years):
    """Enumerate candidate (year, quarter) pairs for the lookback window.
    FMP's /stable/ tier has no discovery endpoint, so we generate all Y×Q
    combinations and let download_fmp_transcript() skip missing ones."""
    cur_year = time.gmtime().tm_year
    cur_q = (time.gmtime().tm_mon - 1) // 3 + 1
    out = []
    for y in range(cur_year, cur_year - years - 1, -1):
        for q in (4, 3, 2, 1):
            if y == cur_year and q > cur_q:
                continue
            if y == cur_year - years and q < cur_q:
                continue
            out.append({"year": y, "quarter": q, "date": None})
    return out


def download_fmp_transcript(ticker, fy, fq, filing_date, dry_run=False):
    url = (
        f"{FMP_ONE_URL}?symbol={urllib.parse.quote(ticker)}"
        f"&year={fy}&quarter={fq}"
    )
    try:
        raw = http_get(url, headers={"Authorization": f"Bearer {WORKER_TOKEN}"})
        arr = json.loads(raw)
    except Exception as e:
        log(f"  [{ticker}] FMP transcript {fy}Q{fq} fetch fail: {e}")
        return False
    if not isinstance(arr, list) or not arr:
        return False
    row = arr[0]
    content = row.get("content") or ""
    if len(content) < 500:
        return False
    payload = {
        "ticker": ticker,
        "doc_type": "TRANSCRIPT",
        "fiscal_year": fy,
        "fiscal_quarter": fq,
        "filing_date": row.get("date") or filing_date,
        "period_of_report": row.get("date") or None,
        "accession_number": f"FMP-{ticker}-{fy}Q{fq}",
        "source": "fmp",
        "source_url": None,
        "title": f"{ticker} earnings call {fy} Q{fq}",
        "body_text": content,
    }
    if dry_run:
        log(f"  [{ticker}] DRY TRANSCRIPT {fy}Q{fq} → {len(content)}b")
        return True
    try:
        r = http_post_json(
            f"{WORKER_URL}/api/earnings/archive/upload",
            payload,
            headers={"Authorization": f"Bearer {WORKER_TOKEN}"},
        )
        log(
            f"  [{ticker}] ✓ TRANSCRIPT {fy}Q{fq} → {r.get('r2_key')} "
            f"({r.get('size_bytes')}b)"
        )
        return True
    except Exception as e:
        log(f"  [{ticker}] upload TRANSCRIPT {fy}Q{fq}: {e}")
        return False


# ─── Ticker discovery ────────────────────────────────────────────────
def get_portfolio_tickers():
    """Fetch portfolio tickers from the Worker, filter for US-listed only."""
    try:
        raw = http_get(f"{WORKER_URL}/api/positions")
        data = json.loads(raw)
    except Exception as e:
        log(f"portfolio fetch fail: {e}")
        return []
    positions = data.get("positions", [])
    out = set()
    for p in positions:
        t = (p.get("ticker") or "").strip().upper()
        if not t:
            continue
        if ":" in t:  # BME:, HKG:, etc.
            continue
        if len(t) > 6:  # option legs
            continue
        out.add(t)
    return sorted(out)


# ─── Main ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", type=int, default=3, help="lookback years (default 3)")
    parser.add_argument("--tickers", type=str, help="comma-separated override")
    parser.add_argument("--forms", type=str, default="10-K,10-Q,20-F", help="SEC form types")
    parser.add_argument("--skip-sec", action="store_true")
    parser.add_argument("--skip-fmp", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit-per-ticker", type=int, default=20)
    parser.add_argument("--only-missing", action="store_true",
                        help="skip tickers that already have any docs in the archive")
    args = parser.parse_args()

    if not WORKER_TOKEN:
        log("ERROR: AYR_WORKER_TOKEN not set (source ~/.ayr-env)")
        sys.exit(1)

    if args.tickers:
        tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    else:
        tickers = get_portfolio_tickers()
    if not tickers:
        log("No tickers to process")
        sys.exit(1)

    if args.only_missing:
        try:
            raw = http_get(
                f"{WORKER_URL}/api/earnings/archive/stats",
                headers={"Authorization": f"Bearer {WORKER_TOKEN}"},
            )
            stats = json.loads(raw)
            have = {row["ticker"].upper() for row in stats.get("by_ticker", []) if row.get("ticker")}
            before = len(tickers)
            tickers = [t for t in tickers if t not in have]
            log(f"--only-missing: {before} → {len(tickers)} tickers (skipped {before - len(tickers)} already archived)")
        except Exception as e:
            log(f"--only-missing stats fetch failed: {e}")
            sys.exit(1)

    forms = tuple(f.strip().upper() for f in args.forms.split(",") if f.strip())
    log(f"Starting earnings archive | tickers={len(tickers)} | years={args.years} | "
        f"forms={forms} | skip_sec={args.skip_sec} | skip_fmp={args.skip_fmp}")

    totals = {"sec_ok": 0, "sec_fail": 0, "fmp_ok": 0, "fmp_fail": 0, "skipped": 0}

    for i, ticker in enumerate(tickers, 1):
        log(f"[{i}/{len(tickers)}] {ticker}")

        if not args.skip_sec:
            try:
                filings = list_sec_filings(ticker, args.years, forms)
                filings = filings[: args.limit_per_ticker]
                if not filings:
                    log(f"  [{ticker}] no SEC filings found")
                for f in filings:
                    ok = download_sec_filing(ticker, f, dry_run=args.dry_run)
                    if ok:
                        totals["sec_ok"] += 1
                    else:
                        totals["sec_fail"] += 1
            except Exception as e:
                log(f"  [{ticker}] SEC loop error: {e}")
                totals["sec_fail"] += 1

        if not args.skip_fmp:
            try:
                transcripts = list_fmp_transcripts(ticker, args.years)
                transcripts = transcripts[: args.limit_per_ticker]
                if not transcripts:
                    log(f"  [{ticker}] no FMP transcripts found")
                for t in transcripts:
                    ok = download_fmp_transcript(
                        ticker, t["year"], t["quarter"], t.get("date"),
                        dry_run=args.dry_run,
                    )
                    if ok:
                        totals["fmp_ok"] += 1
                    else:
                        totals["fmp_fail"] += 1
            except Exception as e:
                log(f"  [{ticker}] FMP loop error: {e}")
                totals["fmp_fail"] += 1

    log(
        f"DONE sec_ok={totals['sec_ok']} sec_fail={totals['sec_fail']} "
        f"fmp_ok={totals['fmp_ok']} fmp_fail={totals['fmp_fail']}"
    )

    # Exit non-zero if EVERY upload failed AND none succeeded (cron signal)
    if (totals["sec_ok"] + totals["fmp_ok"] == 0) and (totals["sec_fail"] + totals["fmp_fail"] > 0):
        sys.exit(1)


if __name__ == "__main__":
    main()
