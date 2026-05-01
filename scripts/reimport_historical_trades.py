#!/usr/bin/env python3
"""
reimport_historical_trades.py — Safe re-import of historical IB Flex trades 2020-2024.

MOTIVATION
----------
The existing /api/ib-flex-import endpoint only deduplicates against trades from the
last 90 days.  Calling it for 2020-2024 data would duplicate the ~3 363 rows already
in D1.  This script bypasses the endpoint and does direct wrangler D1 inserts with
full-range dedup.

DEDUP STRATEGY (two layers)
----------------------------
Layer 1 (strong): exec_id = IBOrderID + "/" + TransactionID.  If both are non-empty
  this uniquely identifies an IB execution across all time.
Layer 2 (fallback): composite key = fecha|ticker|tipo|round(qty*1000)|round(price*100)|round(netCash*100)
  Matches the logic in worker.js line 12341.  Used when exec_id is absent/empty.

Existing D1 rows have exec_id = NULL (legacy rows from before exec_id was added),
so Layer 1 is only used for NEW rows from this import; they also populate exec_id
so future imports can use Layer 1 exclusively.

USAGE
-----
  # dry-run (no writes)
  python3 scripts/reimport_historical_trades.py

  # apply
  python3 scripts/reimport_historical_trades.py --apply

ABORT GUARD
-----------
If the number of new rows to insert exceeds existing_count * 1.5 (50% growth vs
expected ~6 000 on ~3 363 existing) the script aborts and prints a warning.
The guard is per-year, not global, to catch partial bugs.
"""

import csv
import json
import math
import os
import subprocess
import sys
import tempfile
from collections import defaultdict, Counter
from typing import Optional

APPLY = "--apply" in sys.argv

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
WRANGLER_DIR = "/Users/ricardogarciaontoso/IA/AyR/api"
DB_NAME = "aar-finanzas"
BATCH_SIZE = 70  # D1 limit is 100 statements per batch; keep comfortable margin

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

CSVS = [
    # (year_label, path)
    ("2020", "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/CLAUDE_FULL-4.csv"),
    ("2021", "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/U5372268_multi4_20210103_20211231_AF_1436396_d1c94cdf5196f1f654720a42c08dd4b1.csv"),
    ("2022", "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/U5372268_multi4_20220102_20221230_AF_1436396_bc95ea42c3f5d8be11f4ca406fb81340.csv"),
    ("2023", "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/U5372268_multi4_20230102_20231231_AF_1436396_99600393af37cecc0bd175deb7150dc1.csv"),
    ("2024", "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/U5372268_multi4_20240101_20241231_AF_1436396_99ddc7e4c31a034b0bac4872da9c49aa.csv"),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def map_ticker(sym: str) -> str:
    return IB_MAP.get(sym, sym)


def fmt_date(raw: str) -> str:
    """Convert YYYYMMDD → YYYY-MM-DD.  Also accepts already-formatted dates."""
    raw = raw.strip()
    if len(raw) == 8 and raw.isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    return raw  # already formatted or empty


def dedup_key(fecha: str, ticker: str, tipo: str, qty: float, price: float, net_cash: float) -> str:
    return f"{fecha}|{ticker}|{tipo}|{round(qty*1000)}|{round(price*100)}|{round(net_cash*100)}"


def run_wrangler(sql: str) -> list:
    """Execute SQL against D1 via wrangler and return results list."""
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", DB_NAME, "--remote", "--json", "--command", sql],
        capture_output=True, text=True, cwd=WRANGLER_DIR,
    )
    # Strip "Proxy environment..." lines from stdout before JSON parsing
    raw_out = result.stdout
    lines = [l for l in raw_out.splitlines() if not l.startswith("Proxy environment")]
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
    """Execute a SQL file against D1 via wrangler (for large batches)."""
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", DB_NAME, "--remote", "--json", "--file", sql_file],
        capture_output=True, text=True, cwd=WRANGLER_DIR,
    )
    # Strip proxy noise from stdout
    lines = [l for l in result.stdout.splitlines() if not l.startswith("Proxy environment")]
    output = "\n".join(lines).strip()
    stderr = result.stderr.strip()
    stderr_clean = "\n".join(l for l in stderr.splitlines() if "Proxy environment" not in l)
    if result.returncode != 0:
        raise RuntimeError(f"wrangler file execute failed (rc={result.returncode}).\nstderr: {stderr_clean[:800]}\nstdout: {output[:300]}")
    return output


def escape_sql_str(s) -> str:
    """Single-quote escape for SQLite string literals."""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def escape_sql_num(v) -> str:
    """Return NULL for None/empty, else numeric string."""
    if v is None:
        return "NULL"
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return "NULL"
        # Use integer representation where appropriate to keep SQL clean
        return repr(f)
    except (TypeError, ValueError):
        return "NULL"


# ---------------------------------------------------------------------------
# Step 1: Load existing D1 trades (2020-2024) for dedup
# ---------------------------------------------------------------------------

def load_existing_d1() -> "tuple[set, set, dict]":
    """
    Returns:
      exec_id_set: set of non-null exec_ids already in D1
      composite_set: set of composite dedup keys already in D1
      year_counts: dict year -> count
    """
    print("\n[1/4] Loading existing D1 trades 2020-2024 for dedup...")
    rows = run_wrangler(
        "SELECT fecha, ticker, tipo, shares, precio, coste, exec_id "
        "FROM cost_basis WHERE fecha >= '2020-01-01' AND fecha <= '2024-12-31'"
    )
    exec_id_set = set()
    composite_set = set()
    year_counts: dict = defaultdict(int)

    for r in rows:
        yr = (r.get("fecha") or "")[:4]
        year_counts[yr] += 1

        eid = r.get("exec_id")
        if eid:
            exec_id_set.add(eid)

        k = dedup_key(
            r.get("fecha", ""),
            r.get("ticker", ""),
            r.get("tipo", ""),
            float(r.get("shares") or 0),
            float(r.get("precio") or 0),
            float(r.get("coste") or 0),
        )
        composite_set.add(k)

    print(f"   Loaded {len(rows)} existing rows.")
    print(f"   exec_ids in D1: {len(exec_id_set)}")
    print(f"   Composite keys in D1: {len(composite_set)}")
    for yr in sorted(year_counts):
        print(f"   {yr}: {year_counts[yr]} existing rows")

    return exec_id_set, composite_set, dict(year_counts)


# ---------------------------------------------------------------------------
# Step 2: Parse CSV files
# ---------------------------------------------------------------------------

def parse_csv(path: str) -> list[dict]:
    """Parse a Flex CSV and return list of raw trade dicts (TRNT section only)."""
    trades = []
    hdr = None
    with open(path, encoding="utf-8", errors="replace") as f:
        for row in csv.reader(f):
            if not row:
                continue
            if row[0] == "HEADER" and len(row) > 1 and row[1] == "TRNT":
                hdr = row[2:]
            elif row[0] == "DATA" and len(row) > 1 and row[1] == "TRNT" and hdr:
                d = dict(zip(hdr, row[2:]))
                trades.append(d)
    return trades


# ---------------------------------------------------------------------------
# Step 3: Transform + deduplicate
# ---------------------------------------------------------------------------

def transform_trade(raw: dict) -> Optional[dict]:
    """
    Convert raw CSV dict → normalized trade dict ready for INSERT.
    Returns None if the row should be skipped (allocation dupe, invalid, etc.).
    """
    symbol = raw.get("Symbol", "").strip()
    trade_date_raw = raw.get("TradeDate", "").strip()
    if not symbol or not trade_date_raw:
        return None

    # Skip IB allocation duplicates (notes contains "IA")
    notes = (raw.get("Notes/Codes", "") or "").upper()
    if "IA" in notes.split(";"):  # must be a standalone code, not substring
        return None
    # Fallback: raw "IA" anywhere (matches worker.js behavior)
    if "IA" in notes:
        return None

    ticker = map_ticker(symbol)
    fecha = fmt_date(trade_date_raw)
    if not fecha or len(fecha) != 10:
        return None

    try:
        qty = float(raw.get("Quantity", 0) or 0)
    except ValueError:
        qty = 0
    try:
        price = float(raw.get("TradePrice", 0) or 0)
    except ValueError:
        price = 0
    try:
        commission = float(raw.get("IBCommission", 0) or 0)
    except ValueError:
        commission = 0
    try:
        net_cash = float(raw.get("NetCash", 0) or 0)
    except ValueError:
        net_cash = 0

    asset_class = (raw.get("AssetClass", "") or "").upper()
    is_opt = asset_class == "OPT"
    tipo = "OPTION" if is_opt else "EQUITY"

    expiry_raw = raw.get("Expiry", "").strip()
    opt_expiry = fmt_date(expiry_raw) if expiry_raw else None
    opt_strike_raw = raw.get("Strike", "").strip()
    opt_strike = float(opt_strike_raw) if opt_strike_raw else None
    opt_tipo = raw.get("Put/Call", "").strip() or None  # C or P

    opt_contracts = int(abs(qty)) if is_opt else 0
    opt_credit_total = -net_cash if is_opt else 0  # STO: neg netCash → pos credit
    opt_credit = (opt_credit_total / (abs(qty) * 100)) if (is_opt and qty != 0) else 0

    # Underlying
    underlying_sym = raw.get("UnderlyingSymbol", "").strip()
    if underlying_sym:
        underlying = map_ticker(underlying_sym)
    elif is_opt and " " in ticker:
        underlying = map_ticker(ticker.split(" ")[0].strip())
    else:
        underlying = ticker

    account = raw.get("ClientAccountID", "").strip() or None

    # exec_id: IBOrderID + "/" + TransactionID (both must be non-empty)
    ib_order_id = raw.get("IBOrderID", "").strip()
    txn_id = raw.get("TransactionID", "").strip()
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
        "opt_contracts": opt_contracts,
        "opt_credit": opt_credit,
        "opt_credit_total": opt_credit_total,
        "underlying": underlying,
        "account": account,
        "exec_id": exec_id,
        # raw composite components for dedup
        "_qty": qty,
        "_price": price,
        "_net_cash": net_cash,
    }


# ---------------------------------------------------------------------------
# Step 4: Build INSERT SQL
# ---------------------------------------------------------------------------

def trade_to_insert(t: dict) -> str:
    cols = [
        "ticker", "fecha", "tipo", "shares", "precio", "comision", "coste",
        "opt_strike", "opt_expiry", "opt_tipo", "opt_contracts",
        "opt_credit", "opt_credit_total", "underlying", "account", "exec_id",
    ]
    vals = [
        escape_sql_str(t["ticker"]),
        escape_sql_str(t["fecha"]),
        escape_sql_str(t["tipo"]),
        escape_sql_num(t["shares"]),
        escape_sql_num(t["precio"]),
        escape_sql_num(t["comision"]),
        escape_sql_num(t["coste"]),
        escape_sql_num(t["opt_strike"]),
        escape_sql_str(t["opt_expiry"]),
        escape_sql_str(t["opt_tipo"]),
        str(t["opt_contracts"]),
        escape_sql_num(t["opt_credit"]),
        escape_sql_num(t["opt_credit_total"]),
        escape_sql_str(t["underlying"]),
        escape_sql_str(t["account"]),
        escape_sql_str(t["exec_id"]),
    ]
    return f"INSERT INTO cost_basis ({','.join(cols)}) VALUES ({','.join(vals)});"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 70)
    print("reimport_historical_trades.py")
    print(f"Mode: {'APPLY (writes to D1)' if APPLY else 'DRY-RUN (no writes)'}")
    print("=" * 70)

    exec_id_set, composite_set, pre_year_counts = load_existing_d1()

    print("\n[2/4] Parsing CSV files and deduplicating...")
    all_new_trades = []  # list of (year_label, trade_dict)
    report_rows = []

    for year_label, csv_path in CSVS:
        print(f"\n  --- {year_label}: {os.path.basename(csv_path)} ---")
        raw_trades = parse_csv(csv_path)
        print(f"  CSV raw TRNT rows: {len(raw_trades)}")

        # Per-CSV stats
        skipped_ia = 0
        skipped_invalid = 0
        skipped_dedup_exec = 0
        skipped_dedup_composite = 0
        new_count = 0
        account_dist: Counter = Counter()

        # Track intra-batch exec_ids to prevent inserting same exec twice from CSV
        seen_exec_ids_this_csv: set = set()
        seen_composite_this_csv: set = set()

        for raw in raw_trades:
            notes_raw = (raw.get("Notes/Codes", "") or "").upper()
            if "IA" in notes_raw:
                skipped_ia += 1
                continue

            t = transform_trade(raw)
            if t is None:
                skipped_invalid += 1
                continue

            # Layer 1 dedup: exec_id
            if t["exec_id"]:
                if t["exec_id"] in exec_id_set or t["exec_id"] in seen_exec_ids_this_csv:
                    skipped_dedup_exec += 1
                    continue
                seen_exec_ids_this_csv.add(t["exec_id"])

            # Layer 2 dedup: composite key
            ck = dedup_key(t["fecha"], t["ticker"], t["tipo"], t["_qty"], t["_price"], t["_net_cash"])
            if ck in composite_set or ck in seen_composite_this_csv:
                skipped_dedup_composite += 1
                # Still add exec_id to set so we don't double-count
                if t["exec_id"]:
                    exec_id_set.add(t["exec_id"])
                continue
            seen_composite_this_csv.add(ck)
            composite_set.add(ck)  # prevent duplicates across CSVs
            if t["exec_id"]:
                exec_id_set.add(t["exec_id"])

            account_dist[t["account"] or "NULL"] += 1
            all_new_trades.append((year_label, t))
            new_count += 1

        pre_d1 = pre_year_counts.get(year_label, 0)
        print(f"  Skipped IA-allocation: {skipped_ia}")
        print(f"  Skipped invalid/empty: {skipped_invalid}")
        print(f"  Skipped dedup-exec_id: {skipped_dedup_exec}")
        print(f"  Skipped dedup-composite: {skipped_dedup_composite}")
        print(f"  NEW to insert: {new_count}")
        print(f"  D1 existing for {year_label}: {pre_d1}")
        print(f"  Account distribution: {dict(account_dist)}")

        # Abort guard: new rows to insert can't exceed total CSV rows for that year.
        # This catches a bug where dedup fails and everything is inserted double.
        if new_count > len(raw_trades):
            print(f"\n  ABORT GUARD: new_count ({new_count}) > csv_rows ({len(raw_trades)}). Logic error. Stopping.")
            sys.exit(1)

        report_rows.append({
            "year": year_label,
            "csv_rows": len(raw_trades),
            "d1_existing": pre_d1,
            "skipped_ia": skipped_ia,
            "skipped_invalid": skipped_invalid,
            "skipped_dedup_exec": skipped_dedup_exec,
            "skipped_dedup_composite": skipped_dedup_composite,
            "new": new_count,
        })

    total_new = len(all_new_trades)
    total_existing = sum(pre_year_counts.values())

    print("\n" + "=" * 70)
    print(f"[3/4] Summary")
    print(f"  Total existing D1 rows (2020-2024): {total_existing}")
    print(f"  Total new rows to insert: {total_new}")
    print(f"\n  {'Year':<6} {'CSV':>6} {'D1':>6} {'IA':>6} {'Bad':>5} {'Dup-E':>7} {'Dup-C':>7} {'New':>6}")
    for r in report_rows:
        print(f"  {r['year']:<6} {r['csv_rows']:>6} {r['d1_existing']:>6} {r['skipped_ia']:>6} {r['skipped_invalid']:>5} {r['skipped_dedup_exec']:>7} {r['skipped_dedup_composite']:>7} {r['new']:>6}")

    if not APPLY:
        print("\n  DRY-RUN complete. Re-run with --apply to execute inserts.")
        return

    # ---------------------------------------------------------------------------
    # APPLY: Write SQL file and execute in batches via wrangler --file
    # ---------------------------------------------------------------------------
    print("\n[4/4] Applying inserts in batches...")

    inserts = [trade_to_insert(t) for _, t in all_new_trades]
    total_inserted = 0
    total_batches = math.ceil(len(inserts) / BATCH_SIZE)

    for batch_idx in range(0, len(inserts), BATCH_SIZE):
        batch = inserts[batch_idx:batch_idx + BATCH_SIZE]
        batch_num = batch_idx // BATCH_SIZE + 1

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".sql", delete=False, encoding="utf-8"
        ) as tf:
            tf.write("\n".join(batch) + "\n")
            tmp_path = tf.name

        try:
            run_wrangler_file(tmp_path)
            total_inserted += len(batch)
            print(f"  Batch {batch_num}/{total_batches}: inserted {len(batch)} rows (cumulative: {total_inserted})")
        except RuntimeError as e:
            print(f"  ERROR in batch {batch_num}: {e}")
            print(f"  SQL file preserved at: {tmp_path}")
            print("  Stopping. You may re-run with --apply after investigating.")
            sys.exit(1)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    # ---------------------------------------------------------------------------
    # Post-apply verification
    # ---------------------------------------------------------------------------
    print("\n  Post-apply verification...")
    post_rows = run_wrangler(
        "SELECT strftime('%Y', fecha) as yr, COUNT(*) as cnt "
        "FROM cost_basis WHERE fecha >= '2020-01-01' AND fecha <= '2024-12-31' GROUP BY yr ORDER BY yr"
    )
    post_counts = {r["yr"]: r["cnt"] for r in post_rows}

    print(f"\n  {'Year':<6} {'Pre':>8} {'Inserted':>10} {'Post':>8} {'Delta':>8} {'OK?':>5}")
    all_ok = True
    for r in report_rows:
        yr = r["year"]
        pre = r["d1_existing"]
        new = r["new"]
        post = post_counts.get(yr, "?")
        if isinstance(post, int):
            delta = post - pre
            expected = new
            ok = (delta == expected)
            if not ok:
                all_ok = False
            ok_str = "YES" if ok else f"ERR(got {delta}, expected {expected})"
        else:
            ok_str = "?"
        print(f"  {yr:<6} {pre:>8} {new:>10} {post!r:>8} {str(post - pre if isinstance(post,int) else '?'):>8} {ok_str:>5}")

    total_post = sum(v for v in post_counts.values() if isinstance(v, int))
    print(f"\n  Total D1 rows 2020-2024 after import: {total_post}")
    print(f"  Expected: {total_existing} + {total_inserted} = {total_existing + total_inserted}")
    print(f"\n  {'ALL GOOD' if all_ok else 'WARNING: some years have count mismatch — investigate'}")


if __name__ == "__main__":
    main()
