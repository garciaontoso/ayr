#!/usr/bin/env python3
"""
SEC 10-K / 10-Q / DEF 14A / 8-K narrative extractor — v3

v3 additions (2026-04-17):
  - DEF 14A (proxy statements): extracts executive compensation, director
    backgrounds, say-on-pay votes, golden parachutes.  Last 3 years.
  - 8-K (material events): extracts only material items (2.02 earnings
    releases, 5.02 officer changes, 8.01 other material, plus 1.01/1.03/
    2.06/4.01/4.02).  Last 18 months.
  - --backfill mode: downloads 10-K only for years 2016-2018 for tickers
    that currently start at 2019, skipping tickers already having files for
    those years.
  - --all-portfolio mode: auto-discovers portfolio tickers from the Worker.

v2 (2026-04-09):
  Modern SEC filings are inline-XBRL wrapped HTML. The old HTMLParser
  pulled ALL visible text. v2 uses BeautifulSoup to unwrap inline XBRL
  and strip financial tables.

Outputs per filing saved to docs/sec-narrative/{TICKER}/{YEAR}_{TYPE}_{ACC}.md

Usage:
  source ~/.ayr-env
  python3 scripts/sec-narrative-extract.py --ticker KO --years 7
  python3 scripts/sec-narrative-extract.py --ticker GIS ADP --years 7
  python3 scripts/sec-narrative-extract.py --all-portfolio --backfill
  python3 scripts/sec-narrative-extract.py --all-portfolio --forms 10-K DEF14A 8-K --years 3
"""
import argparse
import json
import os
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
    """Return filings for ticker within the last `years` years.

    Handles form-name normalisation: the caller may pass "DEF14A" (no space)
    while SEC EDGAR stores the form as "DEF 14A" (with space). Both are
    accepted and normalised so the filter works correctly.
    """
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
    items_arr = recent.get("items", [])  # 8-K item codes
    cutoff = time.strftime("%Y-%m-%d", time.gmtime(time.time() - years * 365 * 86400))

    # Normalise requested forms — accept "DEF14A" as alias for "DEF 14A"
    _FORM_ALIASES = {"DEF14A": "DEF 14A", "DEFM14A": "DEF 14A"}
    forms_normalised = set()
    for f in forms:
        forms_normalised.add(_FORM_ALIASES.get(f.upper(), f.upper()))

    out = []
    cik_clean = str(int(cik10))
    for i, f in enumerate(forms_arr):
        form_upper = f.upper()
        # DEF 14A variants include DEFA14A (additional proxy); skip those
        if form_upper == "DEFA14A":
            continue
        if form_upper not in forms_normalised:
            continue
        if dates[i] < cutoff:
            continue
        acc_nodash = accs[i].replace("-", "")
        doc_url = (
            f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/"
            f"{acc_nodash}/{urllib.parse.quote(prims[i], safe='/')}"
        )
        items_str = items_arr[i] if i < len(items_arr) else ""
        out.append({
            "type": f,  # preserve SEC's original casing (e.g. "DEF 14A", "8-K")
            "filing_date": dates[i],
            "period": periods[i] if i < len(periods) else None,
            "accession": accs[i],
            "url": doc_url,
            "items": items_str,  # used by 8-K filter
        })
    return out


def list_filings_range(ticker: str, start_year: int, end_year: int, forms=("10-K",)):
    """Return filings filed between start_year-01-01 and end_year-12-31 (inclusive)."""
    cik_map = load_cik_map()
    cik10 = cik_map.get(ticker.upper())
    if not cik10:
        log(f"  [{ticker}] no CIK")
        return []
    time.sleep(SEC_RATE_DELAY)
    url = SEC_SUBMISSIONS_URL.format(cik10=cik10)
    try:
        sub = json.loads(http_get(url))
    except Exception as e:
        log(f"  [{ticker}] submissions fetch fail: {e}")
        return []
    recent = sub.get("filings", {}).get("recent", {})
    forms_arr = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accs = recent.get("accessionNumber", [])
    prims = recent.get("primaryDocument", [])
    periods = recent.get("reportDate", [])

    start_str = f"{start_year}-01-01"
    end_str = f"{end_year}-12-31"
    forms_set = set(f.upper() for f in forms)

    out = []
    cik_clean = str(int(cik10))
    for i, f in enumerate(forms_arr):
        if f.upper() not in forms_set:
            continue
        if not (start_str <= dates[i] <= end_str):
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
            "items": "",
        })

    # SEC's submissions.json only covers the most recent ~1000 filings.
    # For older filings (pre-2019 for prolific filers) we must also check
    # the "files" array which links to paginated older JSON pages.
    older_files = sub.get("filings", {}).get("files", [])
    for page_meta in older_files:
        page_name = page_meta.get("name", "")
        if not page_name:
            continue
        page_url = f"https://data.sec.gov/submissions/{page_name}"
        try:
            time.sleep(SEC_RATE_DELAY)
            page_data = json.loads(http_get(page_url))
        except Exception as e:
            log(f"  [{ticker}] older page fetch fail ({page_name}): {e}")
            continue
        pf = page_data.get("form", [])
        pd_ = page_data.get("filingDate", [])
        pa = page_data.get("accessionNumber", [])
        pp = page_data.get("primaryDocument", [])
        pr = page_data.get("reportDate", [])
        for i, f in enumerate(pf):
            if f.upper() not in forms_set:
                continue
            if not (start_str <= pd_[i] <= end_str):
                continue
            acc_nodash = pa[i].replace("-", "")
            doc_url = (
                f"https://www.sec.gov/Archives/edgar/data/{cik_clean}/"
                f"{acc_nodash}/{urllib.parse.quote(pp[i], safe='/')}"
            )
            out.append({
                "type": f,
                "filing_date": pd_[i],
                "period": pr[i] if i < len(pr) else None,
                "accession": pa[i],
                "url": doc_url,
                "items": "",
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

# ─── 8-K material item filter ────────────────────────────────────────
# Only download 8-Ks containing at least one of these items.
# Item 2.02 = earnings results, 5.02 = officer/director changes,
# 8.01 = other material events, 1.01 = material agreement,
# 1.03 = bankruptcy, 2.06 = impairment, 4.01 = auditor change,
# 4.02 = restatement.
MATERIAL_8K_ITEMS = {
    "2.02", "5.02", "8.01", "1.01", "1.03", "2.05", "2.06", "4.01", "4.02",
}

# ─── DEF 14A section patterns ────────────────────────────────────────
# Proxy headings that are most useful for dividend analysis: executive
# compensation structure, say-on-pay votes, director independence.
PROXY_SECTION_RE = re.compile(
    r"(executive\s+compensation|named\s+executive|compensation\s+discussion"
    r"|say.on.pay|director\s+(compensation|independence|qualif)"
    r"|corporate\s+governance|audit\s+committee|pay\s+ratio"
    r"|golden\s+parachute|severance|stock\s+ownership|annual\s+incentive"
    r"|long.term\s+incentive)",
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


# ─── 8-K and DEF 14A extractors ─────────────────────────────────────

def extract_proxy_sections(soup: BeautifulSoup) -> dict:
    """Extract compensation/governance sections from a DEF 14A proxy statement."""
    sections = {}
    current = "PREAMBLE"
    buf = []

    def flush():
        if buf:
            txt = "\n".join(buf).strip()
            if txt and current not in sections:
                sections[current] = txt
            elif txt:
                sections[current] = sections[current] + "\n\n" + txt
            buf.clear()

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
        if el.find(["p", "div", "h1", "h2", "h3", "h4", "li", "td"]):
            continue
        # Detect proxy section heading
        if len(text) < 200 and PROXY_SECTION_RE.search(text):
            flush()
            # Use a shortened normalised key
            key = re.sub(r"\s+", " ", text[:60]).strip()
            current = key
            continue
        buf.append(text)

    flush()
    return sections


def extract_8k_full_text(soup: BeautifulSoup) -> str:
    """For 8-Ks just return cleaned full text — they're short enough."""
    text = soup.get_text("\n", strip=True)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def is_material_8k(filing: dict) -> bool:
    """Return True if the 8-K items string contains at least one material item."""
    items_raw = filing.get("items", "") or ""
    # SEC stores items as comma-separated, e.g. "2.02,9.01" or "5.02, 9.01"
    item_list = {it.strip() for it in items_raw.split(",") if it.strip()}
    return bool(item_list & MATERIAL_8K_ITEMS)


# ─── Main orchestration ─────────────────────────────────────────────

def _output_path(ticker: str, filing: dict) -> Path:
    """Return the output .md Path for a filing (does not create parent dir)."""
    year = (filing.get("period") or filing["filing_date"])[:4]
    # Normalise type for filesystem: "DEF 14A" → "DEF14A", "8-K" stays "8-K"
    type_fs = filing["type"].replace(" ", "").replace("/", "")
    safe_name = f"{year}_{type_fs}_{filing['accession']}"
    return OUT_DIR / ticker / f"{safe_name}.md"


def process_filing(ticker: str, filing: dict, verbose=False, skip_existing=True):
    """Download and extract a single SEC filing, save as Markdown.

    Returns a result dict on success, None on failure/skip.
    """
    out_md = _output_path(ticker, filing)

    if skip_existing and out_md.exists():
        log(f"  [{ticker}] SKIP (exists) {filing['type']} {filing['filing_date']}")
        return {"skipped": True, "file": str(out_md)}

    form_upper = filing["type"].upper()

    # Filter 8-Ks to material items only
    if form_upper == "8-K" and not is_material_8k(filing):
        log(f"  [{ticker}] SKIP 8-K {filing['filing_date']} — no material items ({filing.get('items','')})")
        return None

    log(f"  [{ticker}] {filing['type']} {filing['filing_date']} ...")
    try:
        html = http_get(filing["url"])
    except Exception as e:
        log(f"    fetch fail: {e}")
        return None

    soup = clean_soup(html)

    year = (filing.get("period") or filing["filing_date"])[:4]
    md = [f"# {ticker} {filing['type']} — {filing['filing_date']} (period {filing.get('period')})\n"]
    md.append(f"Source: {filing['url']}\n")
    md.append(f"Accession: {filing['accession']}\n")
    if filing.get("items"):
        md.append(f"Items: {filing['items']}\n")
    md.append("\n---\n")

    if "DEF 14A" in form_upper or "DEF14A" in form_upper:
        # Proxy statement: extract governance/compensation sections
        sections = extract_proxy_sections(soup)
        sections = {k: clean_text(v) for k, v in sections.items() if v.strip()}
        for key in sorted(sections.keys(), key=lambda k: (k != "PREAMBLE", k)):
            content = sections[key]
            if len(content) < 100:
                continue
            md.append(f"## {key}\n\n{content}\n")
        total_chars = sum(len(v) for v in sections.values())
        main_sections = [k for k, v in sections.items() if len(v) > 200]

    elif form_upper == "8-K":
        # 8-K: full text (they're typically short)
        full = extract_8k_full_text(soup)
        full = clean_text(full)
        md.append(full)
        total_chars = len(full)
        main_sections = ["full_text"]

    else:
        # 10-K / 10-Q / 20-F: section-aware extraction
        sections = extract_sections(soup, filing["type"])
        sections = {k: clean_text(v) for k, v in sections.items() if v.strip()}
        for key in sorted(sections.keys(), key=lambda k: (k != "PREAMBLE", k)):
            content = sections[key]
            if len(content) < 100:
                continue
            md.append(f"## {key}\n\n{content}\n")
        total_chars = sum(len(v) for v in sections.values())
        main_sections = [k for k, v in sections.items() if len(v) > 500 and k != "PREAMBLE"]

    if total_chars < 200:
        log(f"    SKIP — extracted body too small ({total_chars}b)")
        return None

    md_text = "\n".join(md)

    # Save
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(md_text, encoding="utf-8")

    log(f"    ✓ {len(main_sections)} sections, {total_chars}b → {out_md.name}")
    if verbose:
        for k in sorted(main_sections):
            log(f"      {k}: {len(sections[k] if 'sections' in dir() else '')}b")
    return {
        "file": str(out_md),
        "total_chars": total_chars,
    }


# ─── Portfolio discovery ─────────────────────────────────────────────

def get_portfolio_tickers():
    """Fetch US portfolio tickers from the Worker API."""
    worker_url = os.environ.get("AYR_WORKER_URL", "https://api.onto-so.com")
    try:
        raw = http_get(f"{worker_url}/api/positions")
        data = json.loads(raw)
    except Exception as e:
        log(f"portfolio fetch fail: {e}")
        return []
    positions = data.get("positions", [])
    # Exclude: foreign-exchange tickers (BME:, HKG:), ETFs/BDCs without 10-K
    # NVO files 20-F (handled separately), DEO files 20-F
    SKIP_TICKERS = {"NVO", "DEO", "SCHD", "BIZD", "DIVO", "SPHD", "WEEL", "YYY",
                    "MSDL", "OBDC", "SPY", "OZON", "AHRT", "IIPR-PRA", "LANDP"}
    out = []
    for p in positions:
        t = (p.get("ticker") or "").strip().upper()
        if not t or ":" in t or len(t) > 6:
            continue
        if t in SKIP_TICKERS:
            continue
        out.append(t)
    return sorted(set(out))


# ─── Backfill helper ─────────────────────────────────────────────────

def get_existing_years(ticker: str) -> set:
    """Return set of years (as ints) that already have at least one file."""
    ticker_dir = OUT_DIR / ticker
    if not ticker_dir.exists():
        return set()
    years = set()
    for f in ticker_dir.iterdir():
        m = re.match(r"^(\d{4})_", f.name)
        if m:
            years.add(int(m.group(1)))
    return years


def main():
    ap = argparse.ArgumentParser(
        description="SEC filing narrative extractor (10-K/10-Q/DEF 14A/8-K)"
    )
    # Ticker selection (mutually exclusive with --all-portfolio)
    grp = ap.add_mutually_exclusive_group(required=False)
    grp.add_argument("--ticker", nargs="+", help="Tickers to process (e.g. KO GIS ADP)")
    grp.add_argument("--all-portfolio", action="store_true",
                     help="Auto-discover US portfolio tickers from Worker API")

    ap.add_argument("--years", type=int, default=7,
                    help="Lookback window for normal download mode (default 7)")
    ap.add_argument("--forms", nargs="+", default=["10-K", "10-Q"],
                    help="SEC form types to download (default: 10-K 10-Q). "
                         "Use DEF14A or '8-K' to add those types.")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="List filings, don't download")
    ap.add_argument("--skip-existing", action="store_true", default=True,
                    help="Skip filings that already have a local .md file (default True)")
    ap.add_argument("--no-skip-existing", dest="skip_existing", action="store_false",
                    help="Re-download even if local .md file exists")

    # Backfill mode: download 10-K only for 2016-2018 for tickers currently starting at 2019
    ap.add_argument("--backfill", action="store_true",
                    help="Download 10-K for 2016-2018 for tickers that currently start at 2019. "
                         "Requires --all-portfolio or --ticker.")
    ap.add_argument("--backfill-start", type=int, default=2016,
                    help="First year for backfill (default 2016)")
    ap.add_argument("--backfill-end", type=int, default=2018,
                    help="Last year for backfill (default 2018)")

    args = ap.parse_args()

    # Resolve ticker list
    if args.all_portfolio:
        tickers = get_portfolio_tickers()
        if not tickers:
            log("ERROR: Could not fetch portfolio tickers (is AYR_WORKER_URL set?)")
            sys.exit(1)
        log(f"Portfolio mode: {len(tickers)} US tickers")
    elif args.ticker:
        tickers = [t.upper() for t in args.ticker]
    else:
        ap.print_help()
        sys.exit(1)

    # ── Backfill mode ──────────────────────────────────────────────────
    if args.backfill:
        log(f"=== BACKFILL MODE: 10-K for {args.backfill_start}-{args.backfill_end} ===")
        totals = {"ok": 0, "skip": 0, "fail": 0, "no_cik": 0}
        for i, ticker in enumerate(tickers, 1):
            existing_years = get_existing_years(ticker)
            # Only backfill if the ticker has files but none before backfill_end+1
            # (Tickers with no files at all will be handled by normal mode)
            if not existing_years:
                log(f"[{i}/{len(tickers)}] {ticker}: no existing files — skip backfill (run normal mode first)")
                totals["skip"] += 1
                continue
            # Check which backfill years are genuinely missing
            missing_years = [
                y for y in range(args.backfill_start, args.backfill_end + 1)
                if y not in existing_years
            ]
            if not missing_years:
                log(f"[{i}/{len(tickers)}] {ticker}: already has {args.backfill_start}-{args.backfill_end}")
                totals["skip"] += 1
                continue
            log(f"[{i}/{len(tickers)}] {ticker}: missing years {missing_years}")
            filings = list_filings_range(
                ticker,
                start_year=args.backfill_start,
                end_year=args.backfill_end,
                forms=("10-K",),
            )
            if not filings:
                log(f"  [{ticker}] no 10-K found in {args.backfill_start}-{args.backfill_end} (may predate SEC EDGAR or founded later)")
                totals["no_cik"] += 1
                continue
            log(f"  [{ticker}] found {len(filings)} 10-K(s)")
            if args.dry_run:
                for f in filings:
                    log(f"    DRY {f['type']} {f['filing_date']} {f['accession']}")
                continue
            for f in filings:
                result = process_filing(ticker, f, verbose=args.verbose,
                                        skip_existing=args.skip_existing)
                if result is None:
                    totals["fail"] += 1
                elif result.get("skipped"):
                    totals["skip"] += 1
                else:
                    totals["ok"] += 1
        log(f"=== BACKFILL DONE: ok={totals['ok']} skip={totals['skip']} fail={totals['fail']} no_cik={totals['no_cik']} ===")
        return

    # ── Normal download mode ───────────────────────────────────────────
    forms = tuple(f.strip() for f in args.forms if f.strip())
    log(f"Normal mode: {len(tickers)} tickers | years={args.years} | forms={forms}")
    totals = {"ok": 0, "skip": 0, "fail": 0}

    for i, ticker in enumerate(tickers, 1):
        log(f"[{i}/{len(tickers)}] {ticker}")
        try:
            filings = list_filings(ticker, args.years, forms=forms)
        except Exception as e:
            log(f"  [{ticker}] list_filings error: {e}")
            totals["fail"] += 1
            continue

        log(f"  [{ticker}] found {len(filings)} filing(s)")
        if args.dry_run:
            for f in filings:
                log(f"    {f['type']} {f['filing_date']} {f['accession']} items={f.get('items','')}")
            continue

        for f in filings:
            try:
                result = process_filing(ticker, f, verbose=args.verbose,
                                        skip_existing=args.skip_existing)
                if result is None:
                    totals["fail"] += 1
                elif result.get("skipped"):
                    totals["skip"] += 1
                else:
                    totals["ok"] += 1
            except Exception as e:
                log(f"  [{ticker}] process_filing error: {e}")
                totals["fail"] += 1

    log(f"=== DONE: ok={totals['ok']} skip={totals['skip']} fail={totals['fail']} ===")


if __name__ == "__main__":
    main()
