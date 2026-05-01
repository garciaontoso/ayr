#!/usr/bin/env python3
"""
audit_4_ib_deep_2026-05-02.py — Overnight Audit 4: IB Flex vs D1 deep reconciliation.

Goal: After dedup of cost_basis 21,882 → 12,055, finish the data accuracy job:
  1) Find trades present in IB Flex CSVs but missing from D1 (re-import them).
  2) Find D1 trades that don't link to ANY CSV exec_id (manual? other broker?).
  3) Find mismatched fields (same exec_id, different shares/price).
  4) Backfill IB_MAP for HK/Spain tickers (9988, ENGe, etc).
  5) Reconcile dividendos (D1) vs CTRN sections (CSVs).
  6) Reconcile transferencias vs Deposits/Withdrawals.

Outputs:
  - /Users/ricardogarciaontoso/IA/AyR/docs/audit-overnight-4-ib-deep-2026-05-02.md  (report)
  - /Users/ricardogarciaontoso/IA/AyR/scripts/audit-4-fixes.sql                      (risky SQL for review)

Safe fixes auto-applied:
  - INSERT missing trades into cost_basis (UNIQUE INDEX on exec_id prevents dupes).
  - INSERT missing dividendos.
  - INSERT missing transferencias.
  - Update IB_MAP via worker.js patch (suggested only — written to .sql for visibility).

Risky fixes go to audit-4-fixes.sql:
  - DELETE/MERGE D1-only trades (need human investigation).
  - Field mismatches (need to decide which side wins).
"""

import csv
import json
import os
import re
import subprocess
import sys
import tempfile
import math
from collections import defaultdict, Counter
from typing import Optional

APPLY = "--apply" in sys.argv
WRANGLER_DIR = "/Users/ricardogarciaontoso/IA/AyR/api"
DB_NAME = "aar-finanzas"
CSV_DIR = "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs"
REPORT_OUT = "/Users/ricardogarciaontoso/IA/AyR/docs/audit-overnight-4-ib-deep-2026-05-02.md"
SQL_OUT = "/Users/ricardogarciaontoso/IA/AyR/scripts/audit-4-fixes.sql"

# Existing IB_MAP from worker.js + audit script
IB_MAP_BASE = {
    "VIS":      "BME:VIS",
    "AMS":      "BME:AMS",
    "IIPR PRA": "IIPR-PRA",
    "9618":     "HKG:9618",
    "1052":     "HKG:1052",
    "2219":     "HKG:2219",
    "1910":     "HKG:1910",
    "9616":     "HKG:9616",
    "ENGe":     "ENG",
    "LOGe":     "LOG",
    "REPe":     "REP",
    "ISPAd":    "ISPA",
}

# Proposed expansions — discovered via this audit
IB_MAP_NEW_CANDIDATES = {
    "9988":     "HKG:9988",   # Alibaba HK secondary
    "1024":     "HKG:1024",   # Kuaishou
    "1810":     "HKG:1810",   # Xiaomi
    "1066":     "HKG:1066",   # Shandong Weigao
    "1999":     "HKG:1999",   # Man Wah
    "2168":     "HKG:2168",   # CLPS
    "2678":     "HKG:2678",   # Texhong
    "3690":     "HKG:3690",   # Meituan
    "700":      "HKG:0700",   # Tencent
    "939":      "HKG:0939",   # CCB
    "1":        "HKG:0001",   # CK Hutchison
    "2102":     "HKG:2102",   # Mongol Mining
    "VISe":     "BME:VIS",    # Spanish exchange suffix
    "IAGe":     "BME:IAG",    # IAG Spanish line
}

CSVS = sorted(
    os.path.join(CSV_DIR, f)
    for f in os.listdir(CSV_DIR)
    if f.endswith(".csv") and not f.startswith(".")
)


def map_ticker(sym: str, mapping: dict) -> str:
    return mapping.get(sym, sym)


def fmt_date(raw: str) -> str:
    raw = (raw or "").strip()
    if len(raw) >= 8 and raw[:8].isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    return raw


def run_wrangler(sql: str) -> list:
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", DB_NAME, "--remote", "--json", "--command", sql],
        capture_output=True, text=True, cwd=WRANGLER_DIR,
    )
    lines = [l for l in result.stdout.splitlines() if not l.startswith("Proxy environment")]
    output = "\n".join(lines).strip()
    if not output:
        raise RuntimeError(f"wrangler returned no output.\nstderr: {result.stderr[:500]}")
    try:
        data = json.loads(output)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON parse error: {e}\noutput was: {output[:500]}")
    if isinstance(data, list) and data:
        return data[0].get("results", [])
    return []


def run_wrangler_file(sql_file: str):
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", DB_NAME, "--remote", "--json", "--file", sql_file],
        capture_output=True, text=True, cwd=WRANGLER_DIR,
    )
    if result.returncode != 0:
        stderr = "\n".join(l for l in result.stderr.splitlines() if "Proxy environment" not in l)
        stdout_short = "\n".join(result.stdout.splitlines()[:50])
        raise RuntimeError(
            f"wrangler --file failed (rc={result.returncode}).\nstderr: {stderr[:1500]}\nstdout: {stdout_short[:600]}"
        )


def parse_csv_section(path: str, section: str) -> list[dict]:
    """Parse all DATA rows for a given section name (TRNT / CTRN)."""
    rows = []
    hdr = None
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for row in csv.reader(f):
                if not row:
                    continue
                if row[0] == "HEADER" and len(row) > 1 and row[1] == section:
                    hdr = row[2:]
                elif row[0] == "DATA" and len(row) > 1 and row[1] == section and hdr:
                    if len(row) - 2 >= len(hdr):
                        d = dict(zip(hdr, row[2:2 + len(hdr)]))
                        rows.append(d)
    except Exception as e:
        print(f"  WARN parsing {path}: {e}")
    return rows


# ============================================================
# TRADE COMPARISON
# ============================================================

def transform_trade(raw: dict, mapping: dict) -> Optional[dict]:
    symbol = (raw.get("Symbol") or "").strip()
    trade_date_raw = (raw.get("TradeDate") or "").strip()
    if not symbol or not trade_date_raw:
        return None

    notes = (raw.get("Notes/Codes") or "").upper()
    if "IA" in notes:
        return None

    ticker = map_ticker(symbol, mapping)
    fecha = fmt_date(trade_date_raw)
    if not fecha or len(fecha) != 10:
        return None

    def f(key):
        try:
            return float(raw.get(key, "") or 0)
        except (TypeError, ValueError):
            return 0.0

    qty = f("Quantity")
    price = f("TradePrice")
    commission = f("IBCommission")
    net_cash = f("NetCash")

    asset_class = (raw.get("AssetClass") or "").upper()
    is_opt = asset_class == "OPT"
    tipo = "OPTION" if is_opt else "EQUITY"

    expiry_raw = (raw.get("Expiry") or "").strip()
    opt_expiry = fmt_date(expiry_raw) if expiry_raw else None
    opt_strike_raw = (raw.get("Strike") or "").strip()
    try:
        opt_strike = float(opt_strike_raw) if opt_strike_raw else None
    except ValueError:
        opt_strike = None
    opt_tipo = (raw.get("Put/Call") or "").strip() or None

    underlying_sym = (raw.get("UnderlyingSymbol") or "").strip()
    if underlying_sym:
        underlying = map_ticker(underlying_sym, mapping)
    elif is_opt and " " in ticker:
        underlying = map_ticker(ticker.split(" ")[0].strip(), mapping)
    else:
        underlying = ticker

    account = (raw.get("ClientAccountID") or "").strip() or None
    ib_order_id = (raw.get("IBOrderID") or "").strip()
    txn_id = (raw.get("TransactionID") or "").strip()
    exec_id = f"{ib_order_id}/{txn_id}" if ib_order_id and txn_id else None

    return {
        "ticker": ticker,
        "raw_symbol": symbol,
        "raw_underlying": underlying_sym,
        "fecha": fecha,
        "tipo": tipo,
        "shares": qty,
        "precio": price,
        "comision": commission,
        "coste": net_cash,
        "opt_strike": opt_strike,
        "opt_expiry": opt_expiry,
        "opt_tipo": opt_tipo,
        "underlying": underlying,
        "account": account,
        "exec_id": exec_id,
        "listing_exchange": (raw.get("ListingExchange") or "").strip(),
    }


def build_csv_trades(mapping: dict):
    print(f"\n[STEP 1] Parsing TRNT sections from {len(CSVS)} CSVs…")
    by_exec = {}
    no_exec = []
    raw_symbols_seen = Counter()
    raw_with_underlying_unmapped = set()
    for path in CSVS:
        rows = parse_csv_section(path, "TRNT")
        for raw in rows:
            t = transform_trade(raw, mapping)
            if t is None:
                continue
            raw_symbols_seen[t["raw_symbol"]] += 1
            # If raw_symbol wasn't mapped and looks foreign (digits / non-ASCII / e suffix), flag
            if t["raw_symbol"] not in mapping and (
                t["raw_symbol"][:1].isdigit()
                or (len(t["raw_symbol"]) > 1 and t["raw_symbol"][-1] in "ed")
            ):
                if t["listing_exchange"] in ("SEHK", "BM", "FWB2"):
                    raw_with_underlying_unmapped.add(
                        (t["raw_symbol"], t["raw_underlying"], t["listing_exchange"])
                    )
            if t["exec_id"]:
                if t["exec_id"] not in by_exec:
                    by_exec[t["exec_id"]] = t
            else:
                no_exec.append(t)
    print(f"  Unique CSV exec_ids: {len(by_exec)}")
    print(f"  CSV records w/o exec_id: {len(no_exec)}")
    print(f"  Foreign tickers w/o IB_MAP: {len(raw_with_underlying_unmapped)}")
    return by_exec, no_exec, raw_with_underlying_unmapped


def load_d1_trades():
    print("\n[STEP 2] Loading D1 cost_basis…")
    rows = run_wrangler(
        "SELECT id, exec_id, ticker, fecha, tipo, shares, precio, comision, coste, "
        "opt_strike, opt_expiry, opt_tipo, underlying, account "
        "FROM cost_basis WHERE tipo IN ('EQUITY','OPTION')"
    )
    print(f"  D1 rows: {len(rows)}")
    return rows


# ============================================================
# DIVIDEND / CTRN COMPARISON
# ============================================================

def transform_ctrn(raw: dict, mapping: dict) -> Optional[dict]:
    """Normalize CTRN row. Returns dict or None to skip."""
    ctype = (raw.get("Type") or "").strip()
    date_raw = (raw.get("Date/Time") or raw.get("SettleDate") or raw.get("ReportDate") or "").strip()
    fecha = fmt_date(date_raw[:8])
    if not fecha or len(fecha) != 10:
        return None
    try:
        amount = float(raw.get("Amount") or 0)
    except (TypeError, ValueError):
        amount = 0.0
    symbol = (raw.get("Symbol") or "").strip()
    ticker = map_ticker(symbol, mapping) if symbol else ""
    desc = (raw.get("Description") or "").strip()
    txn_id = (raw.get("TransactionID") or "").strip()
    account = (raw.get("ClientAccountID") or "").strip() or None
    currency = (raw.get("CurrencyPrimary") or "USD").strip() or "USD"
    return {
        "type": ctype,
        "fecha": fecha,
        "amount": amount,
        "ticker": ticker,
        "raw_symbol": symbol,
        "description": desc,
        "txn_id": txn_id,
        "account": account,
        "currency": currency,
    }


def build_csv_ctrn(mapping: dict):
    print(f"\n[STEP 3] Parsing CTRN sections…")
    rows = []
    seen_txn = set()  # CRITICAL: CSVs overlap, same TransactionID can appear in multiple files
    dupe_skipped = 0
    for path in CSVS:
        for raw in parse_csv_section(path, "CTRN"):
            t = transform_ctrn(raw, mapping)
            if t is None:
                continue
            # Dedup by TransactionID (unique per IB cash transaction)
            if t["txn_id"]:
                if t["txn_id"] in seen_txn:
                    dupe_skipped += 1
                    continue
                seen_txn.add(t["txn_id"])
            rows.append(t)
    print(f"  Total CTRN rows parsed: {len(rows)} (dedup skipped {dupe_skipped})")
    by_type = Counter(t["type"] for t in rows)
    for typ, n in by_type.most_common():
        print(f"    {typ}: {n}")
    return rows


def load_d1_dividends():
    print("\n[STEP 4] Loading D1 dividendos…")
    rows = run_wrangler(
        "SELECT id, fecha, ticker, bruto, neto, divisa, account, broker, notas FROM dividendos"
    )
    print(f"  D1 dividendos: {len(rows)}")
    return rows


def load_d1_transferencias():
    print("\n[STEP 5] Loading D1 transferencias…")
    rows = run_wrangler(
        "SELECT id, fecha, account_id, tipo, importe, divisa, descripcion, source, flex_id FROM transferencias"
    )
    print(f"  D1 transferencias: {len(rows)}")
    return rows


# ============================================================
# ANALYSIS
# ============================================================

def analyze_trades(d1_rows, csv_by_exec):
    """
    Returns:
      missing: CSV records not in D1 (by exec_id) AND not match by composite either
      missing_composite_dup: CSV records that COULD be inserted (no D1 exec_id match)
                             but a composite-equivalent row already exists. Risky.
      d1_only: D1 rows with exec_id NOT in CSV (foreign / manual / non-Flex)
      d1_no_exec: D1 rows with NULL exec_id (legacy)
      mismatches: same exec_id, different shares/price/coste

    Composite key: fecha + ticker + tipo + signed shares + price*100 + coste*100.
    Two trades that match exactly on ALL of these are virtually certain to be
    sub-allocations of the same execution that just have different TransactionIDs
    (e.g. CLAUDE_FULL-4.csv uses raw EXECUTION level, multi4 uses ALLOCATION level).
    """
    print("\n[STEP 6] Trade cross-analysis…")
    d1_by_exec = defaultdict(list)
    d1_id_to_row = {}
    d1_by_composite = defaultdict(list)
    for r in d1_rows:
        d1_id_to_row[r["id"]] = r
        if r.get("exec_id"):
            d1_by_exec[r["exec_id"]].append(r["id"])
        # Composite key
        try:
            shares = float(r.get("shares") or 0)
            precio = float(r.get("precio") or 0)
            coste = float(r.get("coste") or 0)
        except (TypeError, ValueError):
            continue
        ck = f"{r.get('fecha')}|{r.get('ticker')}|{r.get('tipo')}|{round(shares*1000)}|{round(precio*100)}|{round(coste*100)}"
        d1_by_composite[ck].append(r["id"])

    missing = []
    missing_composite_dup = []
    mismatches = []
    csv_exec_set = set(csv_by_exec.keys())

    for eid, t in csv_by_exec.items():
        d1_ids = d1_by_exec.get(eid, [])
        if d1_ids:
            # Compare fields for mismatch
            for did in d1_ids:
                d = d1_id_to_row[did]
                d_shares = float(d.get("shares") or 0)
                d_precio = float(d.get("precio") or 0)
                d_coste = float(d.get("coste") or 0)
                if (
                    abs(d_shares - t["shares"]) > 0.001
                    or abs(d_precio - t["precio"]) > 0.001
                    or abs(d_coste - t["coste"]) > 0.01
                ):
                    mismatches.append({
                        "d1_id": did,
                        "exec_id": eid,
                        "fecha": t["fecha"],
                        "ticker_csv": t["ticker"],
                        "ticker_d1": d.get("ticker"),
                        "csv": {"shares": t["shares"], "precio": t["precio"], "coste": t["coste"]},
                        "d1":  {"shares": d_shares, "precio": d_precio, "coste": d_coste},
                    })
            continue
        # No exec_id match. Check composite.
        ck = (
            f"{t['fecha']}|{t['ticker']}|{t['tipo']}|"
            f"{round(t['shares']*1000)}|{round(t['precio']*100)}|{round(t['coste']*100)}"
        )
        if d1_by_composite.get(ck):
            # Composite duplicate — DON'T insert (would dup an existing trade with
            # different exec_id, e.g. sub-allocation vs roll-up).
            missing_composite_dup.append(t)
        else:
            # Truly missing — safe to INSERT (UNIQUE INDEX prevents exec_id dup).
            missing.append(t)

    d1_only = []
    d1_no_exec = []
    for r in d1_rows:
        eid = r.get("exec_id")
        if not eid:
            d1_no_exec.append(r)
            continue
        if eid not in csv_exec_set:
            d1_only.append(r)

    print(f"  Missing in D1, no composite match (SAFE to INSERT): {len(missing)}")
    print(f"  Missing in D1, but composite match exists (RISKY):   {len(missing_composite_dup)}")
    print(f"  D1-only (D1 exec_id not in any CSV):                 {len(d1_only)}")
    print(f"  D1 NULL exec_id rows:                                {len(d1_no_exec)}")
    print(f"  Field mismatches (same exec_id):                     {len(mismatches)}")
    return missing, missing_composite_dup, d1_only, d1_no_exec, mismatches


def analyze_dividends(d1_divs, csv_ctrn):
    """
    Compare D1 dividendos with CSV CTRN.

    Worker.js aggregates Dividends + WHT + Pay-in-lieu per (fecha, ticker) into
    ONE row in dividendos with bruto/neto/wht_amount columns. We replicate this
    aggregation before comparing.
    """
    print("\n[STEP 7] Dividend cross-analysis…")

    # Aggregate CSV dividends like worker.js does
    csv_div_agg = {}  # key: (fecha, ticker) -> {bruto, wht, account, etc}
    csv_count_by_type = Counter()
    for c in csv_ctrn:
        t = c["type"]
        if t not in ("Dividends", "Withholding Tax", "Payment In Lieu Of Dividends"):
            continue
        csv_count_by_type[t] += 1
        if not c["raw_symbol"]:
            continue  # Worker.js skips when symbol empty
        ticker = c["ticker"].strip().upper()
        if not ticker:
            continue
        # settleDate fallback to reportDate
        fecha = c["fecha"]
        if not fecha:
            continue
        key = (fecha, ticker)
        if key not in csv_div_agg:
            csv_div_agg[key] = {
                "fecha": fecha,
                "ticker": ticker,
                "bruto": 0.0,
                "wht": 0.0,
                "account": c["account"],
                "currency": c["currency"],
                "txn_ids": [],
                "type_seen": set(),
            }
        csv_div_agg[key]["txn_ids"].append(c["txn_id"])
        csv_div_agg[key]["type_seen"].add(t)
        if t == "Withholding Tax":
            csv_div_agg[key]["wht"] += c["amount"]  # negative
        else:
            csv_div_agg[key]["bruto"] += c["amount"]  # positive

    # Build D1 lookup by (fecha, ticker, round(bruto*100))
    d1_set = set()
    d1_by_fecha_ticker = defaultdict(list)
    for r in d1_divs:
        try:
            b = float(r.get("bruto") or 0)
        except (TypeError, ValueError):
            b = 0.0
        ticker = (r.get("ticker") or "").strip().upper()
        d1_set.add((r["fecha"], ticker, round(b * 100)))
        d1_by_fecha_ticker[(r["fecha"], ticker)].append({"id": r["id"], "bruto": b})

    matched_agg = 0
    csv_dividend_only = []  # aggregated CSV rows missing in D1

    for key, agg in csv_div_agg.items():
        fecha, ticker = key
        bruto = round(agg["bruto"], 2)
        if abs(bruto) < 0.01:
            # All Withholding only? skip — anomalous, would mean we have WHT without dividend
            continue
        # Match if fecha+ticker+bruto match
        d1_key = (fecha, ticker, round(bruto * 100))
        if d1_key in d1_set:
            matched_agg += 1
            continue
        # Loose match: same fecha+ticker, and bruto within ±$0.10 (rounding)
        d1_alt = d1_by_fecha_ticker.get((fecha, ticker), [])
        loose_hit = any(abs(r["bruto"] - bruto) < 0.10 for r in d1_alt)
        if loose_hit:
            matched_agg += 1
            continue
        # Truly missing
        csv_dividend_only.append({
            "fecha": fecha,
            "ticker": ticker,
            "bruto": bruto,
            "wht": round(agg["wht"], 2),
            "neto": round(bruto + agg["wht"], 2),
            "account": agg["account"],
            "currency": agg["currency"],
            "txn_id": agg["txn_ids"][0] if agg["txn_ids"] else "",
            "type": "Dividends",
            "amount": bruto,
            "description": f"agg: {','.join(sorted(agg['type_seen']))}",
        })

    print(f"  CSV dividend-like rows: {sum(csv_count_by_type.values())}")
    for t, n in csv_count_by_type.most_common():
        print(f"    {t}: {n}")
    print(f"  CSV aggregated (fecha,ticker) groups: {len(csv_div_agg)}")
    print(f"  Matched to D1 dividendos: {matched_agg}")
    print(f"  CSV dividend-only (truly missing): {len(csv_dividend_only)}")
    return csv_dividend_only, matched_agg, csv_count_by_type


def analyze_transferencias(d1_trans, csv_ctrn):
    """
    Compare D1 transferencias with CSV CTRN of type 'Deposits/Withdrawals'.
    """
    print("\n[STEP 8] Transferencias cross-analysis…")

    d1_by_flex = {}
    d1_no_flex = []
    for r in d1_trans:
        if r.get("flex_id"):
            d1_by_flex[r["flex_id"]] = r
        else:
            d1_no_flex.append(r)

    csv_dep_with = [c for c in csv_ctrn if c["type"] == "Deposits/Withdrawals"]
    csv_only = []
    matched = 0
    for c in csv_dep_with:
        # flex_id we'd assign matches importer logic; use TransactionID
        if c["txn_id"] and c["txn_id"] in d1_by_flex:
            matched += 1
        else:
            csv_only.append(c)

    print(f"  CSV Deposits/Withdrawals: {len(csv_dep_with)}")
    print(f"  D1 transferencias: {len(d1_trans)} ({len(d1_by_flex)} with flex_id)")
    print(f"  Matched: {matched}")
    print(f"  CSV-only: {len(csv_only)}")
    return csv_only


# ============================================================
# WRITE FIXES
# ============================================================

def sql_escape(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def insert_missing_trades(missing):
    """
    Build INSERT statements. Worker.js has UNIQUE INDEX on exec_id so duplicates
    are rejected. We also need to skip if a row with the same composite already
    exists w/ NULL exec_id (would create a soft dup; but cost_basis_audit fixed
    those last round so should be empty). Returns SQL string list.
    """
    stmts = []
    for t in missing:
        cols = [
            "ticker", "fecha", "tipo", "shares", "precio", "comision", "coste",
            "opt_strike", "opt_expiry", "opt_tipo", "underlying", "account", "exec_id"
        ]
        vals = [
            sql_escape(t["ticker"]),
            sql_escape(t["fecha"]),
            sql_escape(t["tipo"]),
            str(t["shares"]),
            str(t["precio"]),
            str(t.get("comision", 0) or 0),
            str(t["coste"]),
            "NULL" if t.get("opt_strike") is None else str(t["opt_strike"]),
            sql_escape(t.get("opt_expiry")),
            sql_escape(t.get("opt_tipo")),
            sql_escape(t.get("underlying")),
            sql_escape(t.get("account")),
            sql_escape(t.get("exec_id")),
        ]
        stmts.append(
            f"INSERT OR IGNORE INTO cost_basis ({','.join(cols)}) VALUES ({','.join(vals)});"
        )
    return stmts


def insert_missing_dividends(divs):
    """
    Build INSERT statements for aggregated missing dividends.
    Each `divs` entry is already aggregated per (fecha, ticker) with bruto+wht.
    Idempotent guard: notas contains flex_txn={txn_id}.
    """
    stmts = []
    for c in divs:
        bruto = c["bruto"]
        neto = c["neto"]
        wht_amt = abs(c["wht"])  # store positive
        wht_rate = round(wht_amt / bruto, 4) if bruto > 0 else 0
        notas = f"flex_txn={c['txn_id']} agg_dividend"
        ticker = c["ticker"] or "UNKNOWN"
        cols = [
            "fecha", "ticker", "bruto", "neto", "divisa",
            "wht_rate", "wht_amount", "broker", "account", "notas",
        ]
        vals = [
            sql_escape(c["fecha"]),
            sql_escape(ticker.upper()),
            str(round(bruto, 4)),
            str(round(neto, 4)),
            sql_escape(c["currency"]),
            str(wht_rate),
            str(round(wht_amt, 2)),
            sql_escape("IB"),
            sql_escape(c["account"]),
            sql_escape(notas),
        ]
        # Idempotent guard via flex_txn marker AND fecha+ticker+bruto check (same as worker dedup)
        stmts.append(
            f"INSERT INTO dividendos ({','.join(cols)}) "
            f"SELECT {','.join(vals)} "
            f"WHERE NOT EXISTS ("
            f"SELECT 1 FROM dividendos "
            f"WHERE fecha = {sql_escape(c['fecha'])} "
            f"AND ticker = {sql_escape(ticker.upper())} "
            f"AND ROUND(bruto*100) = {round(bruto*100)});"
        )
    return stmts


def insert_missing_transferencias(trans):
    stmts = []
    for c in trans:
        amt = c["amount"]
        tipo = "DEPOSIT" if amt >= 0 else "WITHDRAWAL"
        cols = [
            "fecha", "account_id", "tipo", "importe", "divisa", "descripcion", "source", "flex_id",
        ]
        vals = [
            sql_escape(c["fecha"]),
            sql_escape(c["account"]),
            sql_escape(tipo),
            str(round(amt, 2)),
            sql_escape(c["currency"]),
            sql_escape(c["description"][:200]),
            sql_escape("flex"),
            sql_escape(c["txn_id"]),
        ]
        stmts.append(
            f"INSERT OR IGNORE INTO transferencias ({','.join(cols)}) VALUES ({','.join(vals)});"
        )
    return stmts


def apply_batches(stmts, label):
    if not stmts:
        print(f"  {label}: nothing to apply.")
        return 0
    BATCH = 70
    applied = 0
    total_batches = math.ceil(len(stmts) / BATCH)
    print(f"  {label}: applying {len(stmts)} stmts in {total_batches} batches…")
    for i in range(0, len(stmts), BATCH):
        batch = stmts[i:i + BATCH]
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as tf:
            tf.write("\n".join(batch) + "\n")
            tmp_path = tf.name
        try:
            run_wrangler_file(tmp_path)
            applied += len(batch)
            print(f"    batch {i // BATCH + 1}/{total_batches} ok ({applied}/{len(stmts)})")
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    return applied


# ============================================================
# REPORT
# ============================================================

def write_report(data):
    print(f"\n[REPORT] writing {REPORT_OUT}")
    L = []
    L.append("# Audit Overnight 4 — IB Flex vs D1 deep reconciliation")
    L.append("")
    L.append(f"Generated: 2026-05-02. Mode: {'APPLY' if APPLY else 'DRY-RUN'}")
    L.append("")
    L.append("## TL;DR")
    L.append("")
    L.append(f"- D1 cost_basis: **{data['d1_total']}** rows ({data['d1_null_exec']} NULL exec_id)")
    L.append(f"- CSV unique exec_ids: **{data['csv_exec_count']}**")
    L.append(f"- Trades SAFE-MISSING (CSV exec_id not in D1, AND no composite match): **{data['n_missing']}**")
    L.append(f"- Trades RISKY-MISSING (CSV exec_id not in D1, but composite-equivalent row exists): **{data['n_missing_dup']}**")
    L.append(f"- D1-only trades (exec_id not in any CSV): **{data['n_d1_only']}**")
    L.append(f"- Field mismatches (same exec_id, diff shares/price/coste): **{data['n_mismatches']}**")
    L.append(f"- IB_MAP gap candidates discovered: **{data['n_map_gaps']}**")
    L.append(f"- CSV CTRN dividends not in D1: **{data['n_div_missing']}**")
    L.append(f"- CSV deposits/withdrawals not in D1 transferencias: **{data['n_trans_missing']}**")
    L.append("")
    L.append(f"### Applied")
    if APPLY:
        L.append(f"- Trades INSERTed: {data.get('applied_trades', 0)}")
        L.append(f"- Dividends INSERTed: {data.get('applied_divs', 0)}")
        L.append(f"- Transferencias INSERTed: {data.get('applied_trans', 0)}")
    else:
        L.append("- Dry-run. Re-run with `--apply` to commit.")
    L.append("")

    # ---- A) Missing trades (SAFE) ----
    L.append("## A) Trades SAFE-MISSING (not in D1, no composite duplicate)")
    L.append("")
    if data["missing"]:
        miss_by_year = Counter(m["fecha"][:4] for m in data["missing"])
        miss_by_account = Counter((m.get("account") or "?") for m in data["missing"])
        L.append("These trades have an exec_id not in D1, AND no D1 row matches by composite "
                 "(fecha+ticker+tipo+shares+precio+coste). Safe to INSERT — UNIQUE INDEX on exec_id "
                 "prevents future dupes.")
        L.append("")
        L.append("### Per year")
        L.append("")
        L.append("| Year | Missing |")
        L.append("|------|--------:|")
        for y in sorted(miss_by_year):
            L.append(f"| {y} | {miss_by_year[y]} |")
        L.append("")
        L.append("### Per account")
        L.append("")
        L.append("| Account | Missing |")
        L.append("|---------|--------:|")
        for a, n in miss_by_account.most_common():
            L.append(f"| {a} | {n} |")
        L.append("")
        L.append("### Sample (first 20)")
        L.append("")
        L.append("| exec_id | fecha | ticker | underlying | tipo | shares | precio | coste | account |")
        L.append("|---------|-------|--------|------------|------|-------:|-------:|------:|---------|")
        for m in data["missing"][:20]:
            L.append(
                f"| `{m['exec_id']}` | {m['fecha']} | {m['ticker']} | {m['underlying']} | {m['tipo']} | "
                f"{m['shares']} | {m['precio']} | {m['coste']} | {m.get('account', '')} |"
            )
        L.append("")
    else:
        L.append("None — D1 covers all CSV trades by exec_id.")
        L.append("")

    # ---- A2) Missing trades with composite duplicate (RISKY) ----
    L.append("## A2) Trades RISKY-MISSING (not in D1 by exec_id, but composite match exists)")
    L.append("")
    if data["missing_dup"]:
        L.append("These have a different exec_id than what's in D1, but a row with identical "
                 "(fecha, ticker, tipo, shares, precio, coste) already exists. **DO NOT INSERT** — "
                 "would create duplicates. These are usually sub-allocation TransactionIDs of "
                 "executions that were aggregated under a different TransactionID at import time "
                 "(e.g. CLAUDE_FULL-4.csv uses EXECUTION-level granularity vs multi4's ALLOCATION).")
        L.append("")
        miss_dup_by_year = Counter(m["fecha"][:4] for m in data["missing_dup"])
        L.append("| Year | Risky-missing |")
        L.append("|------|--------------:|")
        for y in sorted(miss_dup_by_year):
            L.append(f"| {y} | {miss_dup_by_year[y]} |")
        L.append("")
        L.append("### Sample (first 5)")
        L.append("")
        L.append("| exec_id | fecha | ticker | shares | precio | coste |")
        L.append("|---------|-------|--------|-------:|-------:|------:|")
        for m in data["missing_dup"][:5]:
            L.append(
                f"| `{m['exec_id']}` | {m['fecha']} | {m['ticker']} | "
                f"{m['shares']} | {m['precio']} | {m['coste']} |"
            )
        L.append("")
    else:
        L.append("None.")
        L.append("")

    # ---- B) D1-only ----
    L.append("## B) D1 trades not linked to CSV exec_id")
    L.append("")
    if data["d1_only"]:
        d1_only_by_year = Counter((r.get("fecha") or "?")[:4] for r in data["d1_only"])
        L.append("### Per year")
        L.append("")
        L.append("| Year | D1-only |")
        L.append("|------|--------:|")
        for y in sorted(d1_only_by_year):
            L.append(f"| {y or '?'} | {d1_only_by_year[y]} |")
        L.append("")
        L.append(
            "### Investigation hint\n\n"
            "These rows have `exec_id IS NOT NULL` but the value isn't in any CSV we have. "
            "Most likely sources:\n\n"
            "1. **CSV not in our archive** — we have multi4 reports for 2021–2025, but trades from 2013–2020 came from older Flex queries that may not be in `data/flex-csvs/`.\n"
            "2. **Manual inserts** — trades typed into the app via the UI (no exec_id, but exec_id may have been backfilled later from Flex single-account queries).\n"
            "3. **Other broker** — Tastytrade, ClickTrade, etc. (cost_basis is broker-agnostic).\n"
            "4. **Different exec_id format** — older CSVs might use `IBExecID` instead of `IBOrderID/TransactionID`.\n"
        )
        L.append("")
        L.append("### Sample (first 10)")
        L.append("")
        L.append("| id | exec_id | fecha | ticker | tipo | shares | account |")
        L.append("|---:|---------|-------|--------|------|-------:|---------|")
        for r in data["d1_only"][:10]:
            L.append(
                f"| {r['id']} | `{r.get('exec_id')}` | {r.get('fecha')} | {r.get('ticker')} | "
                f"{r.get('tipo')} | {r.get('shares')} | {r.get('account', '')} |"
            )
        L.append("")
    else:
        L.append("None.")
        L.append("")

    # ---- C) Mismatches ----
    L.append("## C) Field mismatches (same exec_id, different fields)")
    L.append("")
    if data["mismatches"]:
        L.append("| d1_id | exec_id | fecha | ticker | csv shares | csv precio | csv coste | d1 shares | d1 precio | d1 coste |")
        L.append("|------:|---------|-------|--------|-----------:|-----------:|----------:|----------:|----------:|---------:|")
        for m in data["mismatches"][:5]:
            L.append(
                f"| {m['d1_id']} | `{m['exec_id']}` | {m['fecha']} | {m['ticker_csv']} | "
                f"{m['csv']['shares']} | {m['csv']['precio']} | {m['csv']['coste']} | "
                f"{m['d1']['shares']} | {m['d1']['precio']} | {m['d1']['coste']} |"
            )
        L.append("")
        if len(data["mismatches"]) > 5:
            L.append(f"… {len(data['mismatches']) - 5} more (see audit-4-fixes.sql)")
            L.append("")
    else:
        L.append("None — all matched exec_ids have identical fields.")
        L.append("")

    # ---- D) IB_MAP gaps ----
    L.append("## D) IB_MAP missing entries")
    L.append("")
    if data["map_gaps"]:
        L.append("Foreign tickers found in CSVs that aren't in `IB_MAP` (worker.js).")
        L.append("")
        L.append("| Raw symbol | Underlying | Listing exchange |")
        L.append("|------------|------------|------------------|")
        for s in sorted(data["map_gaps"]):
            L.append(f"| `{s[0]}` | `{s[1]}` | {s[2]} |")
        L.append("")
        L.append("### Suggested IB_MAP additions")
        L.append("")
        L.append("```js")
        L.append("// Add to every IB_MAP literal in api/src/worker.js (lines 2147, 11539, 11649, 12606, 13419, 22378)")
        for k, v in IB_MAP_NEW_CANDIDATES.items():
            if any(s[0] == k for s in data["map_gaps"]):
                L.append(f'  "{k}": "{v}",')
        L.append("```")
        L.append("")
    else:
        L.append("All ticker prefixes covered.")
        L.append("")

    # ---- E) Dividends missing ----
    L.append("## E) Dividends missing in D1")
    L.append("")
    if data["div_missing"]:
        miss_by_year = Counter(d["fecha"][:4] for d in data["div_missing"])
        L.append("### Per year")
        L.append("")
        L.append("| Year | Missing |")
        L.append("|------|--------:|")
        for y in sorted(miss_by_year):
            L.append(f"| {y} | {miss_by_year[y]} |")
        L.append("")
        L.append("### Sample (first 20 Dividends only)")
        L.append("")
        L.append("| txn_id | fecha | ticker | amount | currency | account |")
        L.append("|--------|-------|--------|-------:|----------|---------|")
        for d in [x for x in data["div_missing"] if x["type"] == "Dividends"][:20]:
            L.append(
                f"| `{d['txn_id']}` | {d['fecha']} | {d['ticker']} | {d['amount']:.2f} | "
                f"{d['currency']} | {d.get('account', '')} |"
            )
        L.append("")
    else:
        L.append("D1 dividendos covers all CSV dividend rows.")
        L.append("")

    # ---- F) Transferencias missing ----
    L.append("## F) Transferencias missing in D1")
    L.append("")
    if data["trans_missing"]:
        L.append("| txn_id | fecha | amount | currency | account | description |")
        L.append("|--------|-------|-------:|----------|---------|-------------|")
        for c in data["trans_missing"][:20]:
            L.append(
                f"| `{c['txn_id']}` | {c['fecha']} | {c['amount']:.2f} | {c['currency']} | "
                f"{c.get('account', '')} | {c['description'][:60]} |"
            )
        L.append("")
        if len(data["trans_missing"]) > 20:
            L.append(f"… {len(data['trans_missing']) - 20} more")
            L.append("")
    else:
        L.append("D1 transferencias covers all CSV deposits/withdrawals.")
        L.append("")

    # ---- Files ----
    L.append("## Files")
    L.append("")
    L.append(f"- Audit script: `/Users/ricardogarciaontoso/IA/AyR/scripts/audit_4_ib_deep_2026-05-02.py`")
    L.append(f"- Risky SQL: `{SQL_OUT}`")
    L.append(f"- Report: `{REPORT_OUT}`")
    L.append("")

    with open(REPORT_OUT, "w") as f:
        f.write("\n".join(L) + "\n")
    print(f"  report written ({len(L)} lines)")


def write_risky_sql(mismatches, d1_only):
    print(f"\n[STEP RISKY] writing {SQL_OUT}")
    lines = []
    lines.append("-- audit-4-fixes.sql — RISKY changes for review (NOT auto-applied)")
    lines.append("-- Generated 2026-05-02 by scripts/audit_4_ib_deep_2026-05-02.py")
    lines.append("")
    if mismatches:
        lines.append("-- ============================================")
        lines.append("-- A) Field mismatches (same exec_id different fields)")
        lines.append("-- Decision: usually CSV wins (it's the broker source of truth).")
        lines.append("-- Review each one — if D1 was hand-corrected, keep D1.")
        lines.append("-- ============================================")
        lines.append("")
        for m in mismatches:
            lines.append(
                f"-- d1_id={m['d1_id']} exec_id={m['exec_id']} fecha={m['fecha']} ticker={m['ticker_csv']}"
            )
            lines.append(
                f"-- D1: shares={m['d1']['shares']} precio={m['d1']['precio']} coste={m['d1']['coste']}"
            )
            lines.append(
                f"-- CSV: shares={m['csv']['shares']} precio={m['csv']['precio']} coste={m['csv']['coste']}"
            )
            lines.append(
                f"-- UPDATE cost_basis SET shares={m['csv']['shares']}, precio={m['csv']['precio']}, "
                f"coste={m['csv']['coste']} WHERE id={m['d1_id']};"
            )
            lines.append("")
    if d1_only:
        lines.append("-- ============================================")
        lines.append("-- B) D1 rows with exec_id NOT in any CSV")
        lines.append("-- DO NOT delete blindly — these may be valid trades from missing CSVs.")
        lines.append("-- Investigation steps:")
        lines.append("--   1. Run a fresh Flex multi-account query covering 2013-2020.")
        lines.append("--   2. Check if exec_id format matches (IBOrderID/TransactionID vs IBExecID).")
        lines.append("--   3. If still orphan, check broker= column or notas for source.")
        lines.append("-- ============================================")
        lines.append("")
        for r in d1_only[:50]:
            lines.append(
                f"-- id={r['id']} exec_id={r.get('exec_id')} fecha={r.get('fecha')} "
                f"ticker={r.get('ticker')} tipo={r.get('tipo')} shares={r.get('shares')} "
                f"account={r.get('account')}"
            )
        if len(d1_only) > 50:
            lines.append(f"-- … {len(d1_only) - 50} more rows")
        lines.append("")
    with open(SQL_OUT, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"  written ({len(lines)} lines)")


# ============================================================
# MAIN
# ============================================================

def main():
    print("=" * 80)
    print("Audit Overnight 4 — IB Flex vs D1 deep reconciliation")
    print(f"Mode: {'APPLY' if APPLY else 'DRY-RUN'}")
    print("=" * 80)

    # Use ONLY the worker.js BASE map — that's what's in D1 today.
    # The NEW_CANDIDATES list is a recommendation for the user to add to worker.js,
    # but we shouldn't apply them to the audit lookup (would create false positives
    # for HKG: rows when D1 stores raw "9988").
    csv_by_exec, csv_no_exec, raw_unmapped = build_csv_trades(IB_MAP_BASE)
    d1_rows = load_d1_trades()
    csv_ctrn = build_csv_ctrn(IB_MAP_BASE)
    d1_divs = load_d1_dividends()
    d1_trans = load_d1_transferencias()

    missing, missing_dup, d1_only, d1_no_exec, mismatches = analyze_trades(d1_rows, csv_by_exec)
    div_missing, divs_matched, csv_count_by_type = analyze_dividends(d1_divs, csv_ctrn)
    trans_missing = analyze_transferencias(d1_trans, csv_ctrn)

    # Pre-summary
    data = {
        "d1_total": len(d1_rows),
        "d1_null_exec": len(d1_no_exec),
        "csv_exec_count": len(csv_by_exec),
        "n_missing": len(missing),
        "n_missing_dup": len(missing_dup),
        "n_d1_only": len(d1_only),
        "n_mismatches": len(mismatches),
        "n_map_gaps": len(raw_unmapped),
        "n_div_missing": len(div_missing),
        "n_trans_missing": len(trans_missing),
        "missing": missing,
        "missing_dup": missing_dup,
        "d1_only": d1_only,
        "d1_no_exec": d1_no_exec,
        "mismatches": mismatches,
        "map_gaps": raw_unmapped,
        "div_missing": div_missing,
        "trans_missing": trans_missing,
    }

    # Apply safe fixes
    if APPLY:
        print("\n[APPLY] Inserting missing trades / dividends / transferencias…")
        # Trades: SAFE — UNIQUE INDEX on exec_id prevents dupes.
        trade_stmts = insert_missing_trades(missing)
        applied_trades = apply_batches(trade_stmts, "trades")

        # Dividends: each statement uses idempotent guard (NOT EXISTS check)
        # against fecha+ticker+ROUND(bruto*100). Small risk of collision when
        # D1 already has same key but slightly different amount → guard
        # protects but flags ambiguity. Skip this step by default; uncomment
        # to enable.
        if "--apply-divs" in sys.argv:
            div_stmts = insert_missing_dividends(div_missing)
            applied_divs = apply_batches(div_stmts, "dividends")
        else:
            applied_divs = 0
            print("  Skipping dividends apply (use --apply-divs to enable). Reason: amount-based dedup is fragile with mid-day rounding.")

        # Transferencias: SAFE — UNIQUE on flex_id.
        trans_stmts = insert_missing_transferencias(trans_missing)
        applied_trans = apply_batches(trans_stmts, "transferencias")

        data["applied_trades"] = applied_trades
        data["applied_divs"] = applied_divs
        data["applied_trans"] = applied_trans

        # Re-count after apply
        post_total = run_wrangler("SELECT COUNT(*) AS c FROM cost_basis WHERE tipo IN ('EQUITY','OPTION')")
        post_divs = run_wrangler("SELECT COUNT(*) AS c FROM dividendos")
        post_trans = run_wrangler("SELECT COUNT(*) AS c FROM transferencias")
        data["post_cost_basis"] = post_total[0]["c"] if post_total else "?"
        data["post_dividendos"] = post_divs[0]["c"] if post_divs else "?"
        data["post_transferencias"] = post_trans[0]["c"] if post_trans else "?"
        print(f"\n  Post-apply: cost_basis={data['post_cost_basis']} dividendos={data['post_dividendos']} transferencias={data['post_transferencias']}")

    # Write report + risky SQL
    write_report(data)
    write_risky_sql(mismatches, d1_only)

    print("\n" + "=" * 80)
    print(f"Done. Status: {'APPLIED' if APPLY else 'DRY-RUN'}")
    print(f"Report: {REPORT_OUT}")
    print(f"Risky SQL: {SQL_OUT}")
    print("=" * 80)


if __name__ == "__main__":
    main()
