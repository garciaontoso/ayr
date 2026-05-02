#!/usr/bin/env python3
"""
Backfill cost_basis.account by (fecha, ticker) → account uniqueness.

For each cb NULL row, look at the multi-account Flex CSVs:
  - If ONLY ONE account traded that ticker on that fecha → assign it.
  - If multiple accounts traded → ambiguous, skip.

This catches rows where qty was aggregated in cb but split into fills
in CSV, and rows where price differs slightly. Less precise than exec_id
but covers ~218 more rows after the exec_id pass.

Usage:
    python3 scripts/backfill_account_by_date_ticker.py            # dry-run
    python3 scripts/backfill_account_by_date_ticker.py --apply
"""
import csv
import glob
import json
import subprocess
import sys
from pathlib import Path

CSV_GLOB = "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/U5372268_multi4_*.csv"
WRANGLER_CWD = "/Users/ricardogarciaontoso/IA/AyR/api"

TICKER_MAP = {
    "VIS": "BME:VIS", "AMS": "BME:AMS", "IIPR PRA": "IIPR-PRA",
    "9618": "HKG:9618", "1052": "HKG:1052", "2219": "HKG:2219",
    "1910": "HKG:1910", "9616": "HKG:9616", "9988": "HKG:9988",
    "1066": "HKG:1066", "1999": "HKG:1999", "2168": "HKG:2168",
    "2678": "HKG:2678", "3690": "HKG:3690", "700": "HKG:0700",
    "939": "HKG:0939", "1": "HKG:0001", "2102": "HKG:2102",
    "ENGe": "ENG", "LOGe": "LOG", "REPe": "REP", "ISPAd": "ISPA",
    "VISe": "BME:VIS", "IAGe": "BME:IAG", "AIRd": "AIR",
    "BAYNd": "BAYN", "HEN3d": "HEN3",
}


def map_ticker(s: str) -> str:
    return TICKER_MAP.get(s.strip(), s.strip())


def parse_trnt_rows(path: str):
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
                acct = (d.get("ClientAccountID") or "").strip()
                sym = (d.get("Symbol") or "").strip()
                td = (d.get("TradeDate") or "").strip()
                if not sym or len(td) != 8 or not acct:
                    continue
                fecha = f"{td[:4]}-{td[4:6]}-{td[6:8]}"
                out.append((fecha, sym, acct))
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
    out = result.stdout
    if expect_json:
        idx = out.find("[")
        if idx > 0:
            out = out[idx:]
    return out


def fetch_null_rows_paged():
    all_rows = []
    last_id = 0
    while True:
        sql = (
            f"SELECT id, fecha, ticker FROM cost_basis "
            f"WHERE (account IS NULL OR account = '') AND id > {last_id} "
            f"ORDER BY id LIMIT 1000"
        )
        out = wrangler_query(sql)
        if not out:
            break
        try:
            rows = json.loads(out)[0]["results"]
        except Exception:
            break
        if not rows:
            break
        all_rows.extend(rows)
        last_id = rows[-1]["id"]
        if len(rows) < 1000:
            break
    return all_rows


def main():
    apply = "--apply" in sys.argv

    csvs = sorted(glob.glob(CSV_GLOB))
    if not csvs:
        sys.stderr.write(f"No CSVs at {CSV_GLOB}\n"); sys.exit(1)
    print(f"Found {len(csvs)} CSV files")

    # (fecha, ticker_variant) -> set of accounts
    fecha_ticker_accts = {}
    for path in csvs:
        rows = parse_trnt_rows(path)
        for fecha, raw_sym, acct in rows:
            for tk in {raw_sym, map_ticker(raw_sym)}:
                fecha_ticker_accts.setdefault((fecha, tk), set()).add(acct)
        print(f"  {Path(path).name}: {len(rows)} TRNT rows")
    print(f"\nUnique (fecha, ticker) keys: {len(fecha_ticker_accts)}")

    print("\nFetching cost_basis NULL rows ...")
    null_rows = fetch_null_rows_paged()
    print(f"Total: {len(null_rows)}")

    matches_per_account = {}
    matches = []
    multi_acct = 0
    no_match = 0
    for r in null_rows:
        fecha = r.get("fecha", "")
        ticker = r.get("ticker", "")
        if not fecha or not ticker:
            no_match += 1; continue
        accts = fecha_ticker_accts.get((fecha, ticker), set())
        if len(accts) == 1:
            acct = next(iter(accts))
            matches.append((r["id"], acct))
            matches_per_account[acct] = matches_per_account.get(acct, 0) + 1
        elif len(accts) > 1:
            multi_acct += 1
        else:
            no_match += 1

    print(f"\nMatched (unique-account on date): {len(matches)}")
    print(f"Per account: {matches_per_account}")
    print(f"Multi-account same day (skipped): {multi_acct}")
    print(f"(fecha, ticker) not in any CSV: {no_match}")

    if not apply:
        print("\nDry-run only. Re-run with --apply to commit.")
        return

    if not matches:
        print("Nothing to update."); return

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
