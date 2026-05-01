#!/usr/bin/env python3
"""
Backfill account in cost_basis using local IB Flex CSVs.

Lee los CSVs de ~/Downloads/U5372268_multi*.csv (especialmente
multi4 que es multi-account) y construye un dict key → account.
Luego UPDATEa las filas cost_basis con account=NULL que matcheen.

Uso:
    python3 scripts/backfill_account_from_csv.py [--apply]
"""
import csv
import glob
import json
import os
import subprocess
import sys
from pathlib import Path

CSV_GLOB = os.path.expanduser("~/Downloads/U5372268_multi*.csv")
TICKER_MAP = {
    "VIS": "BME:VIS", "AMS": "BME:AMS", "IIPR PRA": "IIPR-PRA",
    "9618": "HKG:9618", "1052": "HKG:1052", "2219": "HKG:2219",
    "1910": "HKG:1910", "9616": "HKG:9616",
    "ENGe": "ENG", "LOGe": "LOG", "REPe": "REP", "ISPAd": "ISPA",
}
WRANGLER_CWD = "/Users/ricardogarciaontoso/IA/AyR/api"


def map_ticker(s: str) -> str:
    return TICKER_MAP.get(s.strip(), s.strip())


def key_for(fecha: str, ticker: str, qty: float, price: float) -> str:
    return f"{fecha}|{ticker}|{round(qty*1000)}|{round(price*100)}"


def parse_trades_with_account(path: str):
    """Yield (fecha, ticker, qty, price, account) for TRNT rows.
    Soporta el formato moderno con ClientAccountID en columna fija.
    """
    out = []
    trnt_hdr = None
    with open(path) as f:
        for row in csv.reader(f):
            if not row:
                continue
            kind = row[0]
            section = row[1] if len(row) > 1 else ""
            if kind == "HEADER" and section == "TRNT":
                trnt_hdr = row[2:]
            elif kind == "DATA" and section == "TRNT" and trnt_hdr:
                d = dict(zip(trnt_hdr, row[2:]))
                acct = d.get("ClientAccountID", "").strip()
                sym = d.get("Symbol", "").strip()
                td = d.get("TradeDate", "").strip()
                if not sym or len(td) != 8 or not acct:
                    continue
                fecha = f"{td[:4]}-{td[4:6]}-{td[6:8]}"
                ticker = map_ticker(sym)
                try:
                    qty = float(d.get("Quantity", "0") or 0)
                    price = float(d.get("TradePrice", "0") or 0)
                except ValueError:
                    continue
                out.append((fecha, ticker, qty, price, acct))
    return out


def wrangler_query(sql: str, expect_json=True):
    args = ["npx", "wrangler", "d1", "execute", "aar-finanzas",
            "--remote", "--command", sql]
    if expect_json:
        args.append("--json")
    result = subprocess.run(
        args, cwd=WRANGLER_CWD, capture_output=True, text=True, timeout=180,
    )
    if result.returncode != 0:
        sys.stderr.write(f"wrangler stderr: {result.stderr[:500]}\n")
        return None
    # Strip wrangler's "Proxy environment variables..." warning prefix.
    out = result.stdout
    if expect_json:
        idx = out.find("[")
        if idx > 0:
            out = out[idx:]
    return out


def fetch_null_rows_paged():
    """Fetch all account=NULL rows in pages of 1000 to avoid huge JSON."""
    all_rows = []
    last_id = 0
    while True:
        sql = (
            f"SELECT id, fecha, ticker, shares, precio FROM cost_basis "
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

    # 1. Parse all CSVs, build key → account dict
    csvs = sorted(glob.glob(CSV_GLOB))
    if not csvs:
        sys.stderr.write(f"No CSVs at {CSV_GLOB}\n"); sys.exit(1)
    print(f"Found {len(csvs)} CSV files")

    key_to_account = {}
    accounts_seen = {}
    for path in csvs:
        trades = parse_trades_with_account(path)
        if not trades:
            print(f"  {Path(path).name}: 0 trades (no TRNT or old format)")
            continue
        new_keys = 0
        for fecha, ticker, qty, price, acct in trades:
            k = key_for(fecha, ticker, qty, price)
            if k not in key_to_account:
                key_to_account[k] = acct
                new_keys += 1
            accounts_seen[acct] = accounts_seen.get(acct, 0) + 1
        print(f"  {Path(path).name}: {len(trades)} trades, +{new_keys} new keys")
    print(f"\nUnique trade keys: {len(key_to_account)}")
    print(f"Account distribution in CSVs: {accounts_seen}")

    # 2. Fetch NULL rows (paged)
    print("\nFetching cost_basis NULL rows ...")
    null_rows = fetch_null_rows_paged()
    print(f"Total NULL-account rows: {len(null_rows)}")

    # 3. Match
    matches_per_account = {}
    matches = []  # [(id, account)]
    unmatched = 0
    for r in null_rows:
        fecha = r.get("fecha", "")
        ticker = r.get("ticker", "")
        qty = float(r.get("shares") or 0)
        price = float(r.get("precio") or 0)
        if not fecha or not ticker:
            unmatched += 1; continue
        k = key_for(fecha, ticker, qty, price)
        if k in key_to_account:
            acct = key_to_account[k]
            matches.append((r["id"], acct))
            matches_per_account[acct] = matches_per_account.get(acct, 0) + 1
        else:
            unmatched += 1
    print(f"\nMatched: {len(matches)} rows")
    print(f"Per account: {matches_per_account}")
    print(f"Unmatched: {unmatched}")

    if not apply:
        print("\nDry-run only. Re-run with --apply to commit.")
        return

    if not matches:
        print("Nothing to update."); return

    # 4. UPDATE in batches per account
    print(f"\nApplying {len(matches)} UPDATEs ...")
    by_acct = {}
    for id_, acct in matches:
        by_acct.setdefault(acct, []).append(id_)

    BATCH = 80
    total = 0
    for acct, ids in by_acct.items():
        for i in range(0, len(ids), BATCH):
            chunk = ids[i:i+BATCH]
            ids_str = ",".join(str(x) for x in chunk)
            sql = f"UPDATE cost_basis SET account='{acct}' WHERE id IN ({ids_str})"
            out = wrangler_query(sql, expect_json=False)
            if out is not None:
                total += len(chunk)
            if (i // BATCH) % 5 == 0:
                print(f"  {acct}: {min(i+BATCH, len(ids))}/{len(ids)}")
    print(f"\nDone. {total} rows updated total.")


if __name__ == "__main__":
    main()
