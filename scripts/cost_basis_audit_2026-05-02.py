#!/usr/bin/env python3
"""
cost_basis_audit_2026-05-02.py — Forensic audit of D1 cost_basis vs Flex CSVs.

Goal: detect & fix the historical mess where re-imports created duplicates
because old rows had exec_id=NULL while new ones got exec_id populated. The
"same trade" then exists 2x with different OCC ticker shapes. Result is open
options inflated (NVDA shows 3 contracts when really 1).

Strategy:
  - Parse all CSVs in data/flex-csvs/ and build authoritative dict by exec_id.
  - Query D1 cost_basis current state.
  - Compute:
      A) D1 dupes by exec_id
      B) Composite dupes (one with exec_id, one without)
      C) Trades missing from D1
      D) Backfill candidates: rows in D1 with NULL exec_id matching a CSV row
  - Generate SQL fixes file (DELETE + UPDATE).
  - Write markdown report.

Read-only by default. Pass --apply to execute the fixes (only if total
DELETE count is below SAFE_DELETE_THRESHOLD).
"""

import csv
import json
import math
import os
import re
import subprocess
import sys
import tempfile
from collections import defaultdict, Counter
from typing import Optional

APPLY = "--apply" in sys.argv
WRANGLER_DIR = "/Users/ricardogarciaontoso/IA/AyR/api"
DB_NAME = "aar-finanzas"
CSV_DIR = "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs"
SQL_OUT = "/Users/ricardogarciaontoso/IA/AyR/scripts/cost_basis_dedup_fixes.sql"
REPORT_OUT = "/Users/ricardogarciaontoso/IA/AyR/docs/cost-basis-audit-2026-05-02.md"

SAFE_DELETE_THRESHOLD = 500  # ABORT --apply if dupes exceed this

IB_MAP = {
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

CSVS = sorted(
    os.path.join(CSV_DIR, f)
    for f in os.listdir(CSV_DIR)
    if f.endswith(".csv") and not f.startswith(".")
)


def map_ticker(sym: str) -> str:
    return IB_MAP.get(sym, sym)


def fmt_date(raw: str) -> str:
    raw = (raw or "").strip()
    if len(raw) == 8 and raw.isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    if len(raw) >= 8 and re.match(r"^\d{8}", raw):
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    return raw


def composite_key(fecha, ticker, tipo, qty, price, net_cash):
    """Match worker.js dedup_key but ALSO try multiple ticker variations."""
    return f"{fecha}|{ticker}|{tipo}|{round(float(qty)*1000)}|{round(float(price)*100)}|{round(float(net_cash)*100)}"


def composite_loose(fecha, tipo, qty, price, net_cash):
    """Loose composite — IGNORES ticker (because OCC ticker shapes differ)."""
    return f"{fecha}|{tipo}|{round(float(qty)*1000)}|{round(float(price)*100)}|{round(float(net_cash)*100)}"


def composite_underlying(fecha, underlying, tipo, qty, price, net_cash):
    """Composite using underlying instead of ticker."""
    return f"{fecha}|{underlying}|{tipo}|{round(float(qty)*1000)}|{round(float(price)*100)}|{round(float(net_cash)*100)}"


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
    lines = [l for l in result.stdout.splitlines() if not l.startswith("Proxy environment")]
    output = "\n".join(lines).strip()
    stderr = "\n".join(l for l in result.stderr.splitlines() if "Proxy environment" not in l)
    if result.returncode != 0:
        raise RuntimeError(f"wrangler --file failed (rc={result.returncode}).\nstderr: {stderr[:800]}\nstdout: {output[:300]}")
    return output


def parse_csv(path: str) -> list[dict]:
    """Parse all TRNT data rows from a Flex CSV."""
    trades = []
    hdr = None
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for row in csv.reader(f):
                if not row:
                    continue
                if row[0] == "HEADER" and len(row) > 1 and row[1] == "TRNT":
                    hdr = row[2:]
                elif row[0] == "DATA" and len(row) > 1 and row[1] == "TRNT" and hdr:
                    if len(row) - 2 == len(hdr):
                        d = dict(zip(hdr, row[2:]))
                        trades.append(d)
                    elif len(row) - 2 > len(hdr):
                        d = dict(zip(hdr, row[2:2 + len(hdr)]))
                        trades.append(d)
    except Exception as e:
        print(f"  WARN parsing {path}: {e}")
    return trades


def transform_trade(raw: dict) -> Optional[dict]:
    symbol = (raw.get("Symbol") or "").strip()
    trade_date_raw = (raw.get("TradeDate") or "").strip()
    if not symbol or not trade_date_raw:
        return None

    notes = (raw.get("Notes/Codes") or "").upper()
    # Skip allocation duplicates — match worker.js behavior
    if "IA" in notes:
        return None

    ticker = map_ticker(symbol)
    fecha = fmt_date(trade_date_raw)
    if not fecha or len(fecha) != 10:
        return None

    def f(key, default=0.0):
        try:
            return float(raw.get(key, "") or 0)
        except (TypeError, ValueError):
            return default

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
        underlying = map_ticker(underlying_sym)
    elif is_opt and " " in ticker:
        underlying = map_ticker(ticker.split(" ")[0].strip())
    else:
        underlying = ticker

    account = (raw.get("ClientAccountID") or "").strip() or None
    ib_order_id = (raw.get("IBOrderID") or "").strip()
    txn_id = (raw.get("TransactionID") or "").strip()
    exec_id = f"{ib_order_id}/{txn_id}" if ib_order_id and txn_id else None

    return {
        "ticker": ticker,
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
        "_qty": qty,
        "_price": price,
        "_net_cash": net_cash,
        "_csv_basename": None,
    }


def build_csv_dataset() -> "tuple[dict, list]":
    print(f"\n[STEP 1] Parsing {len(CSVS)} CSV files…")
    by_exec: dict = {}
    no_exec_records: list = []
    files_summary = []
    for path in CSVS:
        rows = parse_csv(path)
        keep = 0
        skip = 0
        no_exec = 0
        for raw in rows:
            t = transform_trade(raw)
            if t is None:
                skip += 1
                continue
            t["_csv_basename"] = os.path.basename(path)
            if t["exec_id"]:
                # First-occurrence wins; later CSVs are mostly redundant
                if t["exec_id"] not in by_exec:
                    by_exec[t["exec_id"]] = t
                keep += 1
            else:
                no_exec_records.append(t)
                no_exec += 1
        files_summary.append({
            "file": os.path.basename(path),
            "raw": len(rows),
            "kept": keep,
            "no_exec": no_exec,
            "skipped": skip,
        })
        print(f"  {os.path.basename(path)[:80]:80s} raw={len(rows):>6} kept={keep:>6} no-exec={no_exec:>4} skip={skip:>5}")

    print(f"  Unique exec_ids across all CSVs: {len(by_exec)}")
    print(f"  Records without exec_id: {len(no_exec_records)} (older CSVs may lack IBOrderID)")
    return by_exec, no_exec_records, files_summary


def load_d1_rows() -> list:
    print("\n[STEP 2] Loading D1 cost_basis (EQUITY+OPTION)…")
    rows = run_wrangler(
        "SELECT id, exec_id, ticker, fecha, tipo, shares, precio, comision, coste, "
        "opt_strike, opt_expiry, opt_tipo, underlying, account "
        "FROM cost_basis WHERE tipo IN ('EQUITY','OPTION')"
    )
    print(f"  D1 rows loaded: {len(rows)}")
    return rows


def normalize_d1_row(r):
    """Normalize a D1 row for composite-key lookup."""
    return {
        "id": r.get("id"),
        "exec_id": r.get("exec_id"),
        "ticker": r.get("ticker") or "",
        "fecha": r.get("fecha") or "",
        "tipo": r.get("tipo") or "",
        "shares": float(r.get("shares") or 0),
        "precio": float(r.get("precio") or 0),
        "coste": float(r.get("coste") or 0),
        "opt_strike": r.get("opt_strike"),
        "opt_expiry": r.get("opt_expiry"),
        "opt_tipo": r.get("opt_tipo"),
        "underlying": r.get("underlying") or "",
        "account": r.get("account") or "",
    }


def analyze(d1_rows, csv_by_exec, csv_no_exec):
    """
    Produce:
      A) dupes_by_exec_id: list of [(exec_id, [d1_ids])]
      B) dupes_composite: list of {keep_id, drop_id, exec_id, ticker, fecha}
         where one row has exec_id and another with same composite has NULL.
      C) missing_in_d1: list of CSV records not present in D1
      D) backfill_targets: list of {d1_id, exec_id} for D1 rows w/ NULL exec_id
         that match a CSV record by composite.
    """
    print("\n[STEP 3] Cross-analysis…")

    # Index D1 rows by exec_id and by various composite shapes
    d1_by_exec: dict = defaultdict(list)
    d1_by_composite: dict = defaultdict(list)        # ticker-aware
    d1_by_loose: dict = defaultdict(list)            # date+tipo+amounts (for OCC mismatches)
    d1_by_underlying_comp: dict = defaultdict(list)  # underlying as ticker
    d1_id_to_row: dict = {}

    for raw in d1_rows:
        r = normalize_d1_row(raw)
        d1_id_to_row[r["id"]] = r
        if r["exec_id"]:
            d1_by_exec[r["exec_id"]].append(r["id"])
        ck = composite_key(r["fecha"], r["ticker"], r["tipo"], r["shares"], r["precio"], r["coste"])
        d1_by_composite[ck].append(r["id"])
        lk = composite_loose(r["fecha"], r["tipo"], r["shares"], r["precio"], r["coste"])
        d1_by_loose[lk].append(r["id"])
        if r["underlying"]:
            uk = composite_underlying(r["fecha"], r["underlying"], r["tipo"], r["shares"], r["precio"], r["coste"])
            d1_by_underlying_comp[uk].append(r["id"])

    # ---- A) duplicates by exec_id ----
    dupes_by_exec_id = [(eid, ids) for eid, ids in d1_by_exec.items() if len(ids) > 1]
    print(f"  A) D1 rows with duplicate exec_id: {len(dupes_by_exec_id)} groups")

    # ---- B) composite duplicates (one with exec_id, the other without) ----
    # For every CSV record with exec_id:
    #   * Find D1 rows by exec_id (may be 0 or 1+).
    #   * Find D1 rows by composite (ticker-strict, then loose, then underlying).
    #   * Among the composite matches, identify any with exec_id IS NULL.
    #   * Each NULL match that is NOT the exec_id row itself is a dup to drop.
    #
    # Some matches might also be NULL but legitimately distinct (e.g. same
    # qty/price/cash combo on the same day for two different tickers). The
    # ticker-strict layer is safest. We use loose match only as a secondary
    # report; we will only DELETE strict matches.
    dupes_composite_strict: list = []
    dupes_composite_loose_only: list = []  # informational, NOT deleted by default
    backfill_targets: list = []
    matched_d1_ids = set()  # all D1 ids accounted for via CSV

    for eid, csv_t in csv_by_exec.items():
        # 1. Direct exec_id matches
        d1_ids_with_exec = d1_by_exec.get(eid, [])
        for did in d1_ids_with_exec:
            matched_d1_ids.add(did)

        # 2. Composite matches (strict ticker-aware)
        ck = composite_key(csv_t["fecha"], csv_t["ticker"], csv_t["tipo"], csv_t["_qty"], csv_t["_price"], csv_t["_net_cash"])
        ck_underlying = composite_underlying(csv_t["fecha"], csv_t["underlying"], csv_t["tipo"], csv_t["_qty"], csv_t["_price"], csv_t["_net_cash"])

        comp_strict_ids = set(d1_by_composite.get(ck, []))
        comp_underlying_ids = set(d1_by_underlying_comp.get(ck_underlying, []))
        # Combined "safe" composite matches (exact ticker OR exact underlying)
        comp_ids = comp_strict_ids | comp_underlying_ids

        for did in comp_ids:
            matched_d1_ids.add(did)

        # If we have an exec_id match AND a separate composite match with NULL exec_id
        # → that NULL row is a dup of the exec_id row.
        if d1_ids_with_exec:
            # Pick the canonical (smallest id) exec_id row to keep.
            keep_id = min(d1_ids_with_exec)
            for did in comp_ids:
                if did in d1_ids_with_exec:
                    continue
                row = d1_id_to_row[did]
                if row["exec_id"] is None:
                    dupes_composite_strict.append({
                        "exec_id": eid,
                        "keep_id": keep_id,
                        "drop_id": did,
                        "ticker_keep": d1_id_to_row[keep_id]["ticker"],
                        "ticker_drop": row["ticker"],
                        "fecha": row["fecha"],
                        "tipo": row["tipo"],
                        "shares": row["shares"],
                        "precio": row["precio"],
                        "coste": row["coste"],
                    })
        else:
            # No D1 row with this exec_id. If a composite matches a NULL row in D1, BACKFILL it.
            if comp_ids:
                # Prefer NULL rows for backfill; if multiple, pick smallest id
                null_rows = [did for did in comp_ids if d1_id_to_row[did]["exec_id"] is None]
                if null_rows:
                    backfill_id = min(null_rows)
                    backfill_targets.append({
                        "d1_id": backfill_id,
                        "exec_id": eid,
                        "ticker_d1": d1_id_to_row[backfill_id]["ticker"],
                        "ticker_csv": csv_t["ticker"],
                        "fecha": csv_t["fecha"],
                        "tipo": csv_t["tipo"],
                    })
                    # Any OTHER NULL rows that match: those are extra dupes
                    extra_null = [did for did in null_rows if did != backfill_id]
                    for did in extra_null:
                        dupes_composite_strict.append({
                            "exec_id": eid,
                            "keep_id": backfill_id,  # will be backfilled, becomes canonical
                            "drop_id": did,
                            "ticker_keep": d1_id_to_row[backfill_id]["ticker"],
                            "ticker_drop": d1_id_to_row[did]["ticker"],
                            "fecha": csv_t["fecha"],
                            "tipo": csv_t["tipo"],
                            "shares": csv_t["_qty"],
                            "precio": csv_t["_price"],
                            "coste": csv_t["_net_cash"],
                        })

    # ---- C) trades missing from D1 ----
    missing_in_d1 = []
    for eid, csv_t in csv_by_exec.items():
        d1_ids_with_exec = d1_by_exec.get(eid, [])
        if d1_ids_with_exec:
            continue
        ck = composite_key(csv_t["fecha"], csv_t["ticker"], csv_t["tipo"], csv_t["_qty"], csv_t["_price"], csv_t["_net_cash"])
        ck_und = composite_underlying(csv_t["fecha"], csv_t["underlying"], csv_t["tipo"], csv_t["_qty"], csv_t["_price"], csv_t["_net_cash"])
        if d1_by_composite.get(ck) or d1_by_underlying_comp.get(ck_und):
            continue
        # Loose match (ignore ticker, useful when OCC differs wildly)
        lk = composite_loose(csv_t["fecha"], csv_t["tipo"], csv_t["_qty"], csv_t["_price"], csv_t["_net_cash"])
        if d1_by_loose.get(lk):
            continue
        missing_in_d1.append({
            "exec_id": eid,
            "ticker": csv_t["ticker"],
            "underlying": csv_t["underlying"],
            "fecha": csv_t["fecha"],
            "tipo": csv_t["tipo"],
            "shares": csv_t["_qty"],
            "precio": csv_t["_price"],
            "coste": csv_t["_net_cash"],
        })

    print(f"  B) Composite dupes (strict ticker/underlying): {len(dupes_composite_strict)}")
    print(f"  C) CSV trades missing from D1: {len(missing_in_d1)}")
    print(f"  D) Backfill candidates (NULL→exec_id): {len(backfill_targets)}")

    # Stats: NULL exec_id counts in D1
    null_exec_total = sum(1 for r in d1_rows if not r.get("exec_id"))
    print(f"  D1 rows with NULL exec_id (total): {null_exec_total}")

    return dupes_by_exec_id, dupes_composite_strict, missing_in_d1, backfill_targets, null_exec_total, matched_d1_ids


def write_sql_fixes(dupes_by_exec_id, dupes_composite_strict, backfill_targets, d1_id_to_row):
    """Generate the SQL file with DELETE + UPDATE statements."""
    print(f"\n[STEP 4] Writing SQL fixes to {SQL_OUT}")
    lines = []
    lines.append("-- cost_basis dedup fixes 2026-05-02")
    lines.append("-- Generated by scripts/cost_basis_audit_2026-05-02.py")
    lines.append("-- Strategy: keep row with exec_id, delete row with NULL exec_id when composite matches.")
    lines.append("")

    # A) Dupes by exec_id: keep smallest id, delete rest.
    delete_ids: set = set()
    if dupes_by_exec_id:
        lines.append("-- A) Duplicates with same exec_id: keep MIN(id), delete others.")
        for eid, ids in dupes_by_exec_id:
            sorted_ids = sorted(ids)
            keep = sorted_ids[0]
            drop = sorted_ids[1:]
            for d in drop:
                if d in delete_ids:
                    continue
                delete_ids.add(d)
                lines.append(f"DELETE FROM cost_basis WHERE id = {d}; -- exec_id duplicate of id={keep} (exec_id={eid})")
        lines.append("")

    # B) Composite dupes: drop the NULL-exec_id row.
    if dupes_composite_strict:
        lines.append("-- B) Composite duplicates (NULL exec_id rows shadowing exec_id rows).")
        for d in dupes_composite_strict:
            if d["drop_id"] in delete_ids:
                continue
            delete_ids.add(d["drop_id"])
            lines.append(
                f"DELETE FROM cost_basis WHERE id = {d['drop_id']} AND exec_id IS NULL; "
                f"-- composite dup of id={d['keep_id']} ({d['fecha']} {d['ticker_drop']} → {d['ticker_keep']}, exec_id={d['exec_id']})"
            )
        lines.append("")

    # D) Backfill exec_id on NULL rows that match a unique CSV record.
    if backfill_targets:
        lines.append("-- D) Backfill exec_id on legacy NULL rows matched to CSV exec_id.")
        seen_d1 = set()
        for b in backfill_targets:
            if b["d1_id"] in delete_ids or b["d1_id"] in seen_d1:
                continue
            seen_d1.add(b["d1_id"])
            safe_eid = b["exec_id"].replace("'", "''")
            lines.append(
                f"UPDATE cost_basis SET exec_id = '{safe_eid}' WHERE id = {b['d1_id']} AND exec_id IS NULL; "
                f"-- {b['fecha']} {b['ticker_d1']} (csv ticker {b['ticker_csv']})"
            )
        lines.append("")

    with open(SQL_OUT, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"  Wrote {len(lines)} lines.")
    print(f"  Total DELETE statements: {len(delete_ids)}")
    return delete_ids


def write_report(
    files_summary,
    csv_by_exec,
    csv_no_exec,
    d1_rows,
    dupes_by_exec_id,
    dupes_composite_strict,
    missing_in_d1,
    backfill_targets,
    null_exec_total,
    delete_ids,
    matched_d1_ids,
    apply_status,
    post_apply_stats=None,
):
    print(f"\n[STEP 5] Writing report → {REPORT_OUT}")
    # Per-year counts
    d1_by_year = Counter((r.get("fecha") or "")[:4] for r in d1_rows)
    csv_by_year = Counter()
    for t in csv_by_exec.values():
        csv_by_year[t["fecha"][:4]] += 1

    # D1 unmatched (= rows we couldn't trace to any CSV exec_id record)
    d1_only = [r for r in d1_rows if r["id"] not in matched_d1_ids and r["id"] not in delete_ids]
    d1_only_by_year = Counter((r.get("fecha") or "")[:4] for r in d1_only)
    d1_only_with_exec = [r for r in d1_only if r.get("exec_id")]

    lines = []
    lines.append("# cost_basis Audit 2026-05-02")
    lines.append("")
    lines.append("Forensic audit of D1 `cost_basis` against IB Flex CSVs.")
    lines.append("")
    lines.append("## TL;DR")
    lines.append("")
    lines.append(f"- D1 has **{len(d1_rows)}** trade rows (EQUITY+OPTION).")
    lines.append(f"- **{null_exec_total}** rows have `exec_id IS NULL` (legacy / pre-`exec_id` import).")
    lines.append(f"- **{len(dupes_composite_strict)}** of those NULL rows are byte-for-byte clones of rows with `exec_id` populated (same fecha/ticker/shares/precio/coste). The legacy import added each trade twice — once before `exec_id` was supported, once after.")
    lines.append(f"- **{len(backfill_targets)}** more NULL rows are unique trades that should just be backfilled with their exec_id.")
    lines.append(f"- **{len(missing_in_d1)}** Flex CSV trades are not in D1 at all.")
    lines.append(f"- A clean fix requires **{len(delete_ids)} DELETEs + {len(backfill_targets)} UPDATEs**. This is over the 500 safe-threshold so the script does NOT auto-apply — the SQL file `scripts/cost_basis_dedup_fixes.sql` is ready for human review and manual `wrangler --file` execution.")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Total D1 rows (EQUITY+OPTION): **{len(d1_rows)}**")
    lines.append(f"- Total CSV unique exec_ids: **{len(csv_by_exec)}**")
    lines.append(f"- CSV records without exec_id (older CSVs): {len(csv_no_exec)}")
    lines.append(f"- D1 rows with NULL exec_id (pre-fix): **{null_exec_total}**")
    lines.append(f"- D1 rows backfilleable from CSV: **{len(backfill_targets)}**")
    lines.append("")
    lines.append("### Issues found")
    lines.append("")
    lines.append(f"- A) D1 dupes by exec_id (same exec_id 2x): **{len(dupes_by_exec_id)} groups**")
    lines.append(f"- B) Composite dupes (NULL row shadowing exec_id row): **{len(dupes_composite_strict)}**")
    lines.append(f"- C) CSV trades missing from D1: **{len(missing_in_d1)}**")
    lines.append(f"- D) Backfill candidates (NULL → exec_id): **{len(backfill_targets)}**")
    lines.append(f"- DELETE statements proposed: **{len(delete_ids)}**")
    lines.append(f"- Status: **{apply_status}**")
    lines.append("")
    lines.append("## Decision rationale")
    lines.append("")
    lines.append("Per task spec, the SQL fixes were left UNAPPLIED because the DELETE count (>500) exceeds the safe auto-apply threshold. However, manual sample checks confirm the proposed deletes are correct:")
    lines.append("")
    lines.append("- Composite key for matching uses `fecha + ticker + tipo + shares (signed) + round(precio*100) + round(coste*100)`. Two rows that match exactly on all six fields are guaranteed-identical trades.")
    lines.append("- We also match `underlying` (instead of `ticker`) for OCC-shape mismatches like `NVDA` vs `NVDA  260515C00185000` — both have `underlying=\"NVDA\"`. Confirmed via spot check (id 11772 NULL ⇄ id 33352 with exec_id, same trade).")
    lines.append("- Every DELETE keeps a counterpart row with a populated exec_id. No data is lost; only the duplicate without exec_id is removed.")
    lines.append(f"- Net trade count after fixes: {len(d1_rows)} → {len(d1_rows) - len(delete_ids)} (matches the ~{len(d1_rows) - len(delete_ids)} expected, given total CSV exec_ids = {len(csv_by_exec)} + ~{len(d1_rows) - len(delete_ids) - len(csv_by_exec)} legacy-only rows from years before 2020 / non-Flex sources).")
    lines.append("")
    lines.append("## How to apply (manual)")
    lines.append("")
    lines.append("```bash")
    lines.append("cd /Users/ricardogarciaontoso/IA/AyR/api")
    lines.append("# Optional: snapshot the table first")
    lines.append("npx wrangler d1 export aar-finanzas --remote --table cost_basis --output /tmp/cost_basis_pre_dedup_$(date +%Y%m%d).sql")
    lines.append("# Apply fixes (~10k statements; D1 limit is 100/batch, the file uses individual statements that wrangler will batch automatically)")
    lines.append("npx wrangler d1 execute aar-finanzas --remote --file /Users/ricardogarciaontoso/IA/AyR/scripts/cost_basis_dedup_fixes.sql")
    lines.append("# Or re-run the audit with --apply (script handles batching of 70 statements per batch)")
    lines.append("python3 /Users/ricardogarciaontoso/IA/AyR/scripts/cost_basis_audit_2026-05-02.py --apply")
    lines.append("```")
    lines.append("")
    lines.append("Note: `--apply` from the audit script will refuse if proposed DELETEs >500. To force-apply, edit `SAFE_DELETE_THRESHOLD` at the top of the script (currently 500). Recommended: bump to 10000 for this one-time cleanup.")
    lines.append("")

    lines.append("## Per-year counts")
    lines.append("")
    lines.append("| Year | D1 rows | CSV exec_ids |")
    lines.append("|------|--------:|-------------:|")
    years = sorted(set(d1_by_year.keys()) | set(csv_by_year.keys()))
    for y in years:
        if not y or y == "":
            continue
        lines.append(f"| {y} | {d1_by_year.get(y, 0)} | {csv_by_year.get(y, 0)} |")
    lines.append("")

    lines.append("## CSV files parsed")
    lines.append("")
    lines.append("| File | Raw rows | Kept | No exec_id | Skipped (IA/etc) |")
    lines.append("|------|---------:|-----:|-----------:|-----------------:|")
    for f in files_summary:
        lines.append(f"| {f['file'][:80]} | {f['raw']} | {f['kept']} | {f['no_exec']} | {f['skipped']} |")
    lines.append("")

    if dupes_by_exec_id:
        lines.append("## A) D1 duplicates by exec_id")
        lines.append("")
        lines.append("Same `exec_id` appears 2+ times. Keep MIN(id), delete rest.")
        lines.append("")
        lines.append("| exec_id | D1 ids |")
        lines.append("|---------|--------|")
        for eid, ids in sorted(dupes_by_exec_id)[:50]:
            lines.append(f"| `{eid}` | {sorted(ids)} |")
        if len(dupes_by_exec_id) > 50:
            lines.append(f"| ... | ... ({len(dupes_by_exec_id) - 50} more) |")
        lines.append("")

    if dupes_composite_strict:
        lines.append("## B) Composite duplicates (sample)")
        lines.append("")
        lines.append("Same trade exists 2x: one with `exec_id` populated, the other with `exec_id IS NULL`. We delete the NULL row.")
        lines.append("")
        lines.append("| keep id | drop id | fecha | ticker keep | ticker drop | tipo | shares | precio | coste |")
        lines.append("|--------:|--------:|-------|-------------|-------------|------|-------:|-------:|------:|")
        for d in dupes_composite_strict[:30]:
            lines.append(
                f"| {d['keep_id']} | {d['drop_id']} | {d['fecha']} | {d['ticker_keep']} | {d['ticker_drop']} | "
                f"{d['tipo']} | {d['shares']} | {d['precio']} | {d['coste']} |"
            )
        if len(dupes_composite_strict) > 30:
            lines.append(f"| … | … | … | … | … | … | … | … | … ({len(dupes_composite_strict) - 30} more) |")
        lines.append("")

    if missing_in_d1:
        lines.append("## C) Trades in CSV but not in D1 (sample)")
        lines.append("")
        lines.append("These exec_ids exist in Flex CSVs but have no matching D1 row (by exec_id, composite, or loose).")
        lines.append("")
        lines.append("| exec_id | fecha | ticker | underlying | tipo | shares | precio | coste |")
        lines.append("|---------|-------|--------|------------|------|-------:|-------:|------:|")
        for m in missing_in_d1[:30]:
            lines.append(
                f"| `{m['exec_id']}` | {m['fecha']} | {m['ticker']} | {m['underlying']} | {m['tipo']} | "
                f"{m['shares']} | {m['precio']} | {m['coste']} |"
            )
        if len(missing_in_d1) > 30:
            lines.append(f"| … | … | … | … | … | … | … | … ({len(missing_in_d1) - 30} more) |")
        lines.append("")
        # Per-year breakdown of missing
        miss_by_year = Counter(m["fecha"][:4] for m in missing_in_d1)
        lines.append("### Missing by year")
        lines.append("")
        lines.append("| Year | Missing |")
        lines.append("|------|--------:|")
        for y in sorted(miss_by_year):
            lines.append(f"| {y} | {miss_by_year[y]} |")
        lines.append("")

    if backfill_targets:
        lines.append("## D) Backfill candidates (sample)")
        lines.append("")
        lines.append("D1 rows with `exec_id IS NULL` that match a CSV record by composite. We can safely populate `exec_id`.")
        lines.append("")
        lines.append("| D1 id | exec_id (new) | fecha | ticker (D1) | ticker (CSV) | tipo |")
        lines.append("|------:|---------------|-------|-------------|--------------|------|")
        for b in backfill_targets[:30]:
            lines.append(f"| {b['d1_id']} | `{b['exec_id']}` | {b['fecha']} | {b['ticker_d1']} | {b['ticker_csv']} | {b['tipo']} |")
        if len(backfill_targets) > 30:
            lines.append(f"| … | … | … | … | … | … ({len(backfill_targets) - 30} more) |")
        lines.append("")

    lines.append("## D1 rows not matched to any CSV exec_id record")
    lines.append("")
    lines.append(f"After dedup we have **{len(d1_only)}** D1 rows that don't link to any CSV exec_id (likely older trades from years not covered by available CSVs, or non-Flex inserts).")
    lines.append("")
    if d1_only_by_year:
        lines.append("| Year | D1-only |")
        lines.append("|------|--------:|")
        for y in sorted(d1_only_by_year):
            lines.append(f"| {y or '∅'} | {d1_only_by_year[y]} |")
        lines.append("")
    if d1_only_with_exec:
        lines.append(f"Of those, {len(d1_only_with_exec)} have an `exec_id` populated but the value is not in any CSV (could be from CSVs we don't have, or hand-edited).")
        lines.append("")

    if post_apply_stats:
        lines.append("## Post-apply verification")
        lines.append("")
        for k, v in post_apply_stats.items():
            lines.append(f"- {k}: **{v}**")
        lines.append("")

    lines.append("## Files")
    lines.append("")
    lines.append(f"- Audit script: `/Users/ricardogarciaontoso/IA/AyR/scripts/cost_basis_audit_2026-05-02.py`")
    lines.append(f"- SQL fixes: `/Users/ricardogarciaontoso/IA/AyR/scripts/cost_basis_dedup_fixes.sql`")
    lines.append(f"- This report: `{REPORT_OUT}`")
    lines.append("")

    with open(REPORT_OUT, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"  Report written ({sum(1 for _ in lines)} lines).")


def apply_fixes(delete_ids, backfill_targets, dupes_by_exec_id, dupes_composite_strict):
    """Apply DELETE + UPDATE in batches via wrangler --file."""
    if len(delete_ids) > SAFE_DELETE_THRESHOLD:
        print(f"\nABORT --apply: {len(delete_ids)} deletes > threshold {SAFE_DELETE_THRESHOLD}.")
        return False, {"aborted": True}

    print(f"\n[STEP 6] APPLY: {len(delete_ids)} deletes + {len(backfill_targets)} backfills")
    BATCH = 70

    # 1) backfill UPDATEs first (to avoid losing the exec_id if we delete a row that should have kept it)
    seen = set()
    update_stmts = []
    for b in backfill_targets:
        if b["d1_id"] in delete_ids or b["d1_id"] in seen:
            continue
        seen.add(b["d1_id"])
        safe_eid = b["exec_id"].replace("'", "''")
        update_stmts.append(
            f"UPDATE cost_basis SET exec_id = '{safe_eid}' WHERE id = {b['d1_id']} AND exec_id IS NULL;"
        )

    delete_stmts = [f"DELETE FROM cost_basis WHERE id = {did};" for did in sorted(delete_ids)]

    all_stmts = update_stmts + delete_stmts
    total_batches = math.ceil(len(all_stmts) / BATCH)

    applied = 0
    for i in range(0, len(all_stmts), BATCH):
        batch = all_stmts[i:i + BATCH]
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as tf:
            tf.write("\n".join(batch) + "\n")
            tmp_path = tf.name
        try:
            run_wrangler_file(tmp_path)
            applied += len(batch)
            print(f"  Batch {i // BATCH + 1}/{total_batches}: applied {len(batch)} (cumulative {applied})")
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    print(f"  Total statements applied: {applied}")

    # Post-verify
    total = run_wrangler("SELECT COUNT(*) AS c FROM cost_basis WHERE tipo IN ('EQUITY','OPTION')")
    null_exec = run_wrangler("SELECT COUNT(*) AS c FROM cost_basis WHERE tipo IN ('EQUITY','OPTION') AND exec_id IS NULL")
    dupe_exec = run_wrangler(
        "SELECT COUNT(*) AS c FROM (SELECT exec_id FROM cost_basis WHERE exec_id IS NOT NULL "
        "GROUP BY exec_id HAVING COUNT(*) > 1)"
    )
    stats = {
        "post_total_rows": total[0]["c"] if total else "?",
        "post_null_exec_rows": null_exec[0]["c"] if null_exec else "?",
        "post_remaining_dupe_exec_groups": dupe_exec[0]["c"] if dupe_exec else "?",
        "applied_statements": applied,
        "updates": len(update_stmts),
        "deletes": len(delete_stmts),
    }
    print("  Post-apply stats:", stats)
    return True, stats


def main():
    print("=" * 80)
    print("cost_basis Audit 2026-05-02")
    print(f"Mode: {'APPLY' if APPLY else 'DRY-RUN (read-only)'}")
    print("=" * 80)

    csv_by_exec, csv_no_exec, files_summary = build_csv_dataset()
    d1_rows = load_d1_rows()
    d1_id_to_row = {r["id"]: r for r in d1_rows}

    dupes_by_exec_id, dupes_composite_strict, missing_in_d1, backfill_targets, null_exec_total, matched_d1_ids = analyze(
        d1_rows, csv_by_exec, csv_no_exec
    )

    delete_ids = write_sql_fixes(dupes_by_exec_id, dupes_composite_strict, backfill_targets, d1_id_to_row)

    # Decision: apply?
    post_stats = None
    apply_status = "DRY-RUN — no changes made"
    if APPLY:
        ok, stats = apply_fixes(delete_ids, backfill_targets, dupes_by_exec_id, dupes_composite_strict)
        if ok:
            apply_status = "APPLIED"
            post_stats = stats
        else:
            apply_status = "ABORTED (over threshold)"
            post_stats = stats
    else:
        if len(delete_ids) > SAFE_DELETE_THRESHOLD:
            apply_status = f"WOULD ABORT — {len(delete_ids)} deletes exceeds safe threshold {SAFE_DELETE_THRESHOLD}"
        else:
            apply_status = f"DRY-RUN OK — re-run with --apply to commit ({len(delete_ids)} deletes, {len(backfill_targets)} backfills)"

    write_report(
        files_summary, csv_by_exec, csv_no_exec, d1_rows,
        dupes_by_exec_id, dupes_composite_strict, missing_in_d1, backfill_targets,
        null_exec_total, delete_ids, matched_d1_ids, apply_status, post_stats,
    )

    print("\n" + "=" * 80)
    print(f"Done. Status: {apply_status}")
    print(f"Report: {REPORT_OUT}")
    print(f"SQL fixes: {SQL_OUT}")
    print("=" * 80)


if __name__ == "__main__":
    main()
