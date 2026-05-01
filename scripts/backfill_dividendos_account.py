#!/usr/bin/env python3
"""
Backfill account in dividendos using local IB Flex CSVs.

Lee los CSVs en /Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/ y construye un
dict (fecha, ticker, round(bruto*100)) -> account a partir de las secciones CTRN
(Cash Transactions). Los CTRN tipo "Dividends" o "Payment In Lieu" aportan el
gross (positivo). Aggregamos por (fecha, ticker) replicando el método del
worker.js (línea 12404 - divAgg).

Luego UPDATEa las filas dividendos con account=NULL que matcheen.

Uso:
    python3 scripts/backfill_dividendos_account.py            # dry-run
    python3 scripts/backfill_dividendos_account.py --apply
"""
import csv
import glob
import json
import os
import subprocess
import sys
from pathlib import Path

CSV_GLOB_LIST = [
    "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/U5372268_multi4_*.csv",
    "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/CLAUDE_FULL-4.csv",
]

# Same mapping that worker.js mapTicker uses for the most common cases
# (extended in the cost_basis script). Keep parity with that script.
TICKER_MAP = {
    "VIS": "BME:VIS", "AMS": "BME:AMS", "IIPR PRA": "IIPR-PRA",
    "9618": "HKG:9618", "1052": "HKG:1052", "2219": "HKG:2219",
    "1910": "HKG:1910", "9616": "HKG:9616",
    "ENGe": "ENG", "LOGe": "LOG", "REPe": "REP", "ISPAd": "ISPA",
}
WRANGLER_CWD = "/Users/ricardogarciaontoso/IA/AyR/api"


def map_ticker(s: str) -> str:
    return TICKER_MAP.get(s.strip(), s.strip())


def parse_dividends_with_account(path: str):
    """Yield (fecha, ticker, bruto, account) aggregated per (fecha, ticker, account).

    Replica método worker.js:
      - Tipo "Dividends" o "Payment In Lieu" -> bruto += amount (positivo)
      - Tipo "Withholding Tax" -> ignorado para cálculo de bruto
      - Aggregar por (fecha, ticker)
    """
    ctrn_hdr = None
    # key: (fecha, ticker) -> {bruto: float, account: str}
    agg: dict[tuple[str, str], dict] = {}
    with open(path) as f:
        for row in csv.reader(f):
            if not row:
                continue
            kind = row[0]
            section = row[1] if len(row) > 1 else ""
            if kind == "HEADER" and section == "CTRN":
                ctrn_hdr = row[2:]
            elif kind == "DATA" and section == "CTRN" and ctrn_hdr:
                d = dict(zip(ctrn_hdr, row[2:]))
                ttype = (d.get("Type") or "").strip().lower()
                # Skip Withholding (only count Dividends + Payment In Lieu)
                if "withholding" in ttype:
                    continue
                if "dividend" not in ttype and "payment in lieu" not in ttype:
                    continue
                acct = (d.get("ClientAccountID") or "").strip()
                sym = (d.get("Symbol") or "").strip()
                # Use SettleDate first, then ReportDate (worker.js fallback)
                raw_date = (d.get("SettleDate") or d.get("ReportDate") or "").strip()
                if not sym or not acct or not raw_date:
                    continue
                if len(raw_date) != 8:
                    continue
                fecha = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
                ticker = map_ticker(sym)
                try:
                    amount = float(d.get("Amount") or 0)
                except ValueError:
                    continue
                if amount == 0:
                    continue
                key = (fecha, ticker)
                if key not in agg:
                    agg[key] = {"bruto": 0.0, "account": acct}
                agg[key]["bruto"] += amount
                # If multiple accounts have the same (fecha, ticker), worker.js
                # keeps the FIRST account (since |key| has no account). We do the
                # same: don't overwrite once set.
    out = []
    for (fecha, ticker), v in agg.items():
        bruto = round(v["bruto"], 2)
        if bruto == 0:
            continue
        out.append((fecha, ticker, bruto, v["account"]))
    return out


def wrangler_query(sql: str, expect_json=True):
    args = [
        "npx", "wrangler", "d1", "execute", "aar-finanzas",
        "--remote", "--command", sql,
    ]
    if expect_json:
        args.append("--json")
    result = subprocess.run(
        args, cwd=WRANGLER_CWD, capture_output=True, text=True, timeout=180,
    )
    if result.returncode != 0:
        sys.stderr.write(f"wrangler stderr: {result.stderr[:500]}\n")
        return None
    out = result.stdout
    if expect_json:
        idx = out.find("[")
        if idx > 0:
            out = out[idx:]
    return out


def fetch_null_dividends_paged():
    """Fetch all dividendos with account=NULL in pages of 1000."""
    all_rows = []
    last_id = 0
    while True:
        sql = (
            f"SELECT id, fecha, ticker, bruto FROM dividendos "
            f"WHERE account IS NULL AND id > {last_id} ORDER BY id LIMIT 1000"
        )
        out = wrangler_query(sql)
        if not out:
            break
        try:
            data = json.loads(out)
            rows = data[0]["results"]
        except Exception as e:
            sys.stderr.write(f"parse error: {e}\n")
            sys.stderr.write(out[:500])
            break
        if not rows:
            break
        all_rows.extend(rows)
        last_id = rows[-1]["id"]
        print(f"  fetched {len(all_rows)} so far ...", flush=True)
        if len(rows) < 1000:
            break
    return all_rows


def main():
    apply = "--apply" in sys.argv

    # 1. Parse all CSVs, build (fecha, ticker, bruto*100) -> account dict
    csvs = []
    for pattern in CSV_GLOB_LIST:
        csvs.extend(sorted(glob.glob(pattern)))
    csvs = sorted(set(csvs))
    if not csvs:
        sys.stderr.write(f"No CSVs found in {CSV_GLOB_LIST}\n")
        sys.exit(1)
    print(f"Found {len(csvs)} CSV files")

    # key: (fecha, ticker, round(bruto*100)) -> account
    key_to_account: dict[tuple[str, str, int], str] = {}
    accounts_seen: dict[str, int] = {}
    for path in csvs:
        divs = parse_dividends_with_account(path)
        if not divs:
            print(f"  {Path(path).name}: 0 dividends (no CTRN or old format)")
            continue
        new_keys = 0
        for fecha, ticker, bruto, acct in divs:
            k = (fecha, ticker, round(bruto * 100))
            if k not in key_to_account:
                key_to_account[k] = acct
                new_keys += 1
            accounts_seen[acct] = accounts_seen.get(acct, 0) + 1
        print(f"  {Path(path).name}: {len(divs)} divs, +{new_keys} new keys")
    print(f"\nUnique dividend keys: {len(key_to_account)}")
    print(f"Account distribution in CSVs: {accounts_seen}")

    # 2. Fetch NULL rows (paged)
    print("\nFetching dividendos NULL-account rows ...")
    null_rows = fetch_null_dividends_paged()
    print(f"Total NULL-account rows: {len(null_rows)}")

    # 3. Match
    matches_per_account: dict[str, int] = {}
    matches: list[tuple[int, str]] = []  # [(id, account)]
    unmatched = 0
    for r in null_rows:
        fecha = r.get("fecha", "")
        ticker = r.get("ticker", "")
        bruto = float(r.get("bruto") or 0)
        if not fecha or not ticker:
            unmatched += 1
            continue
        # Try exact bruto first, then ±1 cent fudge
        candidates = [
            (fecha, ticker, round(bruto * 100)),
            (fecha, ticker, round(bruto * 100) - 1),
            (fecha, ticker, round(bruto * 100) + 1),
        ]
        found = None
        for k in candidates:
            if k in key_to_account:
                found = key_to_account[k]
                break
        if found:
            matches.append((r["id"], found))
            matches_per_account[found] = matches_per_account.get(found, 0) + 1
        else:
            unmatched += 1

    print(f"\nMatched: {len(matches)} rows")
    print(f"Per account: {matches_per_account}")
    print(f"Unmatched: {unmatched}")

    if not apply:
        print("\nDry-run only. Re-run with --apply to commit.")
        return

    if not matches:
        print("Nothing to update.")
        return

    # 4. UPDATE in batches per account
    print(f"\nApplying {len(matches)} UPDATEs ...")
    by_acct: dict[str, list[int]] = {}
    for id_, acct in matches:
        by_acct.setdefault(acct, []).append(id_)

    BATCH = 80
    total = 0
    for acct, ids in by_acct.items():
        for i in range(0, len(ids), BATCH):
            chunk = ids[i:i + BATCH]
            ids_str = ",".join(str(x) for x in chunk)
            sql = f"UPDATE dividendos SET account='{acct}' WHERE id IN ({ids_str})"
            out = wrangler_query(sql, expect_json=False)
            if out is not None:
                total += len(chunk)
            if (i // BATCH) % 5 == 0:
                print(f"  {acct}: {min(i + BATCH, len(ids))}/{len(ids)}")
    print(f"\nDone. {total} rows updated total.")


if __name__ == "__main__":
    main()
