#!/usr/bin/env python3
"""
SEC 10-K / 10-Q narrative extractor — v2

Problem with v1 (scripts/download-earnings.py html_to_text):
  Modern SEC filings are inline-XBRL wrapped HTML. The old HTMLParser
  pulled ALL visible text — including XBRL table data, signature blocks,
  exhibit indexes, and financial statement tables — which drowned the
  actual narrative (MD&A, Risk Factors, Business Description).

This v2 extractor:
  1. Downloads the filing HTML directly from SEC EDGAR
  2. Uses BeautifulSoup to:
     - Remove all <ix:*> (inline XBRL) elements entirely
     - Remove <table> elements with >60% numeric content (financials)
     - Strip <style>, <script>, <svg>, <head>
  3. Identifies ITEM sections by heading text:
     10-K: ITEM 1, 1A, 1B, 2, 3, 5, 7, 7A, 8, 9A, 10-14
     10-Q: ITEM 1, 2, 3, 4 (Part I), ITEM 1, 1A, 2, 6 (Part II)
  4. Produces a clean sectioned markdown output

Outputs per filing:
  <ticker>-<year>-<type>.raw.txt  (plain narrative, no headings)
  <ticker>-<year>-<type>.sections.md  (sectioned markdown)

Usage:
  source ~/.ayr-env
  python3 scripts/sec-narrative-extract.py --ticker KO --years 7
  python3 scripts/sec-narrative-extract.py --ticker GIS ADP --years 7
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from bs4 import BeautifulSoup, NavigableString
except ImportError:
    print("ERROR: bs4 not installed. Run: pip3 install beautifulsoup4", file=sys.stderr)
    sys.exit(1)

# ─── Config ──────────────────────────────────────────────────────────
SEC_USER_AGENT = "A&R research rgarciaontoso@gmail.com"
SEC_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik10}.json"
SEC_RATE_DELAY = 0.15  # seconds between SEC requests

OUT_DIR = Path("/Users/ricardogarciaontoso/IA/AyR/docs/sec-narrative")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def log(msg):
    print(f"[sec-narrative] {msg}", file=sys.stderr)


def http_get(url, retries=3):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": SEC_USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml,application/json,*/*",
                    "Accept-Encoding": "identity",
                },
            )
            with urllib.request.urlopen(req, timeout=45) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            last = e
            time.sleep(0.5 + attempt)
    raise last


# ─── CIK lookup ──────────────────────────────────────────────────────
_CIK_MAP_CACHE = None


def load_cik_map():
    global _CIK_MAP_CACHE
    if _CIK_MAP_CACHE is not None:
        return _CIK_MAP_CACHE
    tmp = Path("/tmp/sec-company-tickers.json")
    data = None
    if tmp.exists() and (time.time() - tmp.stat().st_mtime) < 86400:
        try:
            data = json.loads(tmp.read_text())
        except Exception:
            pass
    if data is None:
        log("Fetching SEC ticker→CIK map...")
        raw = http_get(SEC_COMPANY_TICKERS_URL)
        data = json.loads(raw)
        tmp.write_text(raw)
    _CIK_MAP_CACHE = {v["ticker"].upper(): str(v["cik_str"]).zfill(10) for v in data.values()}
    log(f"Loaded CIK map: {len(_CIK_MAP_CACHE)} tickers")
    return _CIK_MAP_CACHE


def list_filings(ticker: str, years: int, forms=("10-K", "10-Q", "20-F")):
    cik_map = load_cik_map()
    cik10 = cik_map.get(ticker.upper())
    if not cik10:
        log(f"  [{ticker}] no CIK")
        return []
    time.sleep(SEC_RATE_DELAY)
    url = SEC_SUBMISSIONS_URL.format(cik10=cik10)
    sub = json.loads(http_get(url))
    recent = sub.get("filings", {}).get("recent", {})
    forms_arr = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accs = recent.get("accessionNumber", [])
    prims = recent.get("primaryDocument", [])
    periods = recent.get("reportDate", [])
    cutoff = time.strftime("%Y-%m-%d", time.gmtime(time.time() - years * 365 * 86400))
    out = []
    cik_clean = str(int(cik10))
    for i, f in enumerate(forms_arr):
        if f not in forms:
            continue
        if dates[i] < cutoff:
            continue
        acc_nodash = accs[i].replace("-", "")
        doc_url = (
            f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/"
            f"{acc_nodash}/{urllib.parse.quote(prims[i], safe='/')}"
        )
        out.append({
            "type": f,
            "filing_date": dates[i],
            "period": periods[i] if i < len(periods) else None,
            "accession": accs[i],
            "url": doc_url,
        })
    return out


# ─── Narrative extraction (the hard part) ───────────────────────────
def is_numeric_heavy(text: str, threshold=0.55) -> bool:
    """True if >threshold of the non-whitespace chars are digits/$/(/-/,/."""
    stripped = re.sub(r"\s+", "", text)
    if len(stripped) < 20:
        return False
    num_chars = sum(1 for c in stripped if c in "0123456789$().,-%")
    return num_chars / len(stripped) > threshold


def clean_soup(html: str) -> BeautifulSoup:
    """Parse and aggressively strip XBRL + financial tables."""
    soup = BeautifulSoup(html, "html.parser")

    # Strip obvious noise
    for tag in soup.find_all(["script", "style", "noscript", "head", "svg", "img"]):
        tag.decompose()

    # Handle inline XBRL:
    #  - <ix:nonFraction>, <ix:nonNumeric>, <ix:continuation>, <ix:exclude>:
    #    UNWRAP (keep visible text content — these wrap narrative numbers + text)
    #  - <us-gaap:*>, <dei:*>, <srt:*>, <xbrli:*>, <link:*>, <xlink:*>, <xbrldi:*>:
    #    DECOMPOSE (these are pure XBRL metadata, no visible text)
    #  - <ix:header>, <ix:references>, <ix:resources>, <ix:hidden>:
    #    DECOMPOSE (XBRL metadata even if prefix is ix:)
    UNWRAP_IX = {"ix:nonfraction", "ix:nonnumeric", "ix:continuation", "ix:exclude", "ix:fraction"}
    DECOMPOSE_IX = {"ix:header", "ix:references", "ix:resources", "ix:hidden"}
    DECOMPOSE_PREFIXES = ("xbrli", "xbrl", "us-gaap", "dei", "srt", "link", "xlink", "xbrldi")

    to_unwrap = []
    to_remove = []
    for tag in list(soup.find_all(True)):
        try:
            name = (tag.name or "").lower()
        except Exception:
            continue
        if name in DECOMPOSE_IX:
            to_remove.append(tag)
            continue
        if name in UNWRAP_IX:
            to_unwrap.append(tag)
            continue
        if ":" in name and name.split(":")[0] in DECOMPOSE_PREFIXES:
            to_remove.append(tag)
            continue
        # Generic ix:* that isn't specifically handled: unwrap (preserve content)
        if name.startswith("ix:"):
            to_unwrap.append(tag)
            continue
        # Some filings wrap XBRL in <div style="display:none">
        try:
            attrs = getattr(tag, "attrs", None) or {}
            style = (attrs.get("style") or "").lower() if isinstance(attrs, dict) else ""
        except Exception:
            style = ""
        if "display:none" in style or "display: none" in style:
            to_remove.append(tag)

    for tag in to_remove:
        try:
            tag.decompose()
        except Exception:
            pass
    # Unwrap after decompose (decompose may affect parents of unwrap targets)
    for tag in to_unwrap:
        try:
            tag.unwrap()
        except Exception:
            pass

    # Strip financial tables (>55% numeric content)
    for tbl in soup.find_all("table"):
        txt = tbl.get_text(" ", strip=True)
        if is_numeric_heavy(txt):
            tbl.decompose()

    return soup


# Section headers we care about
ITEM_RE_10K = re.compile(
    r"^\s*ITEM\s+(1A|1B|1|2|3|5|7A|7|8|9A|9B|9|10|11|12|13|14)\b[.\s]*",
    re.IGNORECASE,
)
ITEM_RE_10Q = re.compile(
    r"^\s*ITEM\s+(1A|1|2|3|4|5|6)\b[.\s]*",
    re.IGNORECASE,
)


def extract_sections(soup: BeautifulSoup, doc_type: str) -> dict:
    """
    Walk the cleaned DOM and collect text into sections by ITEM heading.
    Returns: { "ITEM 1": "Business description...", "ITEM 1A": "Risk factors...", ... }
    Non-matching content is collected into a "PREAMBLE" bucket.
    """
    item_re = ITEM_RE_10Q if "10-Q" in doc_type.upper() else ITEM_RE_10K

    # Extract all visible text split by paragraph, track section transitions
    sections = {}
    current = "PREAMBLE"
    buf = []

    def flush():
        if buf:
            txt = "\n".join(buf).strip()
            if txt:
                if current not in sections:
                    sections[current] = txt
                else:
                    sections[current] = sections[current] + "\n\n" + txt
            buf.clear()

    # Walk body in document order, collecting block-level text
    body = soup.body or soup
    for el in body.descendants:
        if isinstance(el, NavigableString):
            continue
        name = (el.name or "").lower()
        if name not in ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td"):
            continue
        text = el.get_text(" ", strip=True)
        if not text or len(text) < 3:
            continue
        # Avoid double-counting nested divs — only take leaf-ish elements
        if el.find(["p", "div", "h1", "h2", "h3", "h4", "li", "td"]):
            continue
        # Check if this is an ITEM heading
        m = item_re.match(text[:60])
        if m and len(text) < 200:
            flush()
            current = f"ITEM {m.group(1).upper()}"
            # Keep any trailing text after the item marker (e.g., "ITEM 1. Business")
            tail = text[m.end() :].strip()
            if tail:
                buf.append(tail)
            continue
        buf.append(text)

    flush()
    return sections


def clean_text(text: str) -> str:
    # Collapse whitespace, drop pure-punctuation lines, and remove common boilerplate
    lines = []
    for line in text.split("\n"):
        s = re.sub(r"\s+", " ", line).strip()
        if not s:
            continue
        if len(s) < 3:
            continue
        # Drop lines that are just page numbers or table of contents entries
        if re.match(r"^\d+$", s):
            continue
        if re.match(r"^Page\s+\d+", s, re.IGNORECASE):
            continue
        lines.append(s)
    txt = "\n".join(lines)
    # Collapse triple-newlines
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    return txt


# ─── Main orchestration ─────────────────────────────────────────────
def process_filing(ticker: str, filing: dict, verbose=False):
    log(f"  [{ticker}] {filing['type']} {filing['filing_date']} ...")
    try:
        html = http_get(filing["url"])
    except Exception as e:
        log(f"    fetch fail: {e}")
        return None

    soup = clean_soup(html)
    sections = extract_sections(soup, filing["type"])

    # Clean each section
    sections = {k: clean_text(v) for k, v in sections.items() if v.strip()}

    # Build markdown output
    year = (filing.get("period") or filing["filing_date"])[:4]
    md = [f"# {ticker} {filing['type']} — {filing['filing_date']} (period {filing.get('period')})\n"]
    md.append(f"Source: {filing['url']}\n")
    md.append(f"Accession: {filing['accession']}\n\n---\n")
    for key in sorted(sections.keys(), key=lambda k: (k != "PREAMBLE", k)):
        content = sections[key]
        if len(content) < 100:
            continue
        md.append(f"## {key}\n\n{content}\n")
    md_text = "\n".join(md)

    # Save
    ticker_dir = OUT_DIR / ticker
    ticker_dir.mkdir(exist_ok=True)
    safe_name = f"{year}_{filing['type'].replace('/', '')}_{filing['accession']}"
    out_md = ticker_dir / f"{safe_name}.md"
    out_md.write_text(md_text, encoding="utf-8")

    # Stats
    total_chars = sum(len(v) for v in sections.values())
    main_sections = [k for k, v in sections.items() if len(v) > 500 and k != "PREAMBLE"]
    log(f"    ✓ {len(main_sections)} main sections, {total_chars}b narrative → {out_md.name}")
    if verbose:
        for k in sorted(main_sections):
            log(f"      {k}: {len(sections[k])}b")
    return {
        "file": str(out_md),
        "sections": list(sections.keys()),
        "main_sections": main_sections,
        "total_chars": total_chars,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticker", nargs="+", required=True, help="Tickers to process (e.g. KO GIS ADP)")
    ap.add_argument("--years", type=int, default=7, help="Years of filings to fetch")
    ap.add_argument("--forms", nargs="+", default=["10-K", "10-Q", "20-F"])
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="List filings, don't download")
    args = ap.parse_args()

    for ticker in args.ticker:
        ticker = ticker.upper()
        log(f"=== {ticker} ===")
        filings = list_filings(ticker, args.years, forms=tuple(args.forms))
        log(f"  Found {len(filings)} filings in last {args.years}y")
        if args.dry_run:
            for f in filings:
                log(f"    {f['type']} {f['filing_date']} {f['accession']}")
            continue
        for f in filings:
            process_filing(ticker, f, verbose=args.verbose)


if __name__ == "__main__":
    main()
