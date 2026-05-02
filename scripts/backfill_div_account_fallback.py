#!/usr/bin/env python3
"""
Fallback backfill of dividendos.account by (fecha, ticker) uniqueness.

For dividendos NULL rows that didn't match the strict (fecha, ticker, bruto)
pass, look at the multi4 CSVs: if only ONE account paid that ticker on that
date, assign it.

Usage:
    python3 scripts/backfill_div_account_fallback.py            # dry-run
    python3 scripts/backfill_div_account_fallback.py --apply
"""
import csv as csvmod
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


def parse_div_dates(path: str):
    """Yield (fecha, ticker_raw_or_mapped, account) for each CTRN dividend row."""
    out = []
    ctrn_hdr = None
    with open(path) as f:
        for row in csvmod.reader(f):
            if not row:
                continue
            kind = row[0]
            section = row[1] if len(row) > 1 else ""
            if kind == "HEADER" and section == "CTRN":
                ctrn_hdr = row[2:]
            elif kind == "DATA" and section == "CTRN" and ctrn_hdr:
                d = dict(zip(ctrn_hdr, row[2:]))
                ttype = (d.get("Type") or "").strip().lower()
                if "withholding" in ttype:
                    continue
                if "dividend" not in ttype and "payment in lieu" not in ttype:
                    continue
                acct = (d.get("ClientAccountID") or "").strip()
                sym = (d.get("Symbol") or "").strip()
                raw_date = (d.get("SettleDate") or d.get("ReportDate") or "").strip()
                if not sym or not acct or len(raw_date) != 8:
                    continue
                fecha = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
                out.append((fecha, sym, acct))
    return out


def wrangler_query(sql, expect_json=True):
    args = ["npx", "wrangler", "d1", "execute", "aar-finanzas",
            "--remote", "--command", sql]
    if expect_json:
        args.append("--json")
    res = subprocess.run(args, cwd=WRANGLER_CWD, capture_output=True,
                         text=True, timeout=180)
    if res.returncode != 0:
        sys.stderr.write(f"wrangler stderr: {res.stderr[:500]}\n")
        return None
    out = res.stdout
    if expect_json:
        idx = out.find("[")
        if idx > 0:
            out = out[idx:]
    return out


def fetch_null_paged():
    rows = []
    last_id = 0
    while True:
        sql = (f"SELECT id, fecha, ticker FROM dividendos "
               f"WHERE (account IS NULL OR account = '') AND id > {last_id} "
               f"ORDER BY id LIMIT 1000")
        out = wrangler_query(sql)
        if not out:
            break
        try:
            r = json.loads(out)[0]["results"]
        except Exception:
            break
        if not r:
            break
        rows.extend(r)
        last_id = r[-1]["id"]
        if len(r) < 1000:
            break
    return rows


def main():
    apply = "--apply" in sys.argv
    csvs = sorted(glob.glob(CSV_GLOB))
    print(f"CSVs: {len(csvs)}")

    # (fecha, ticker_variant) -> set of accounts
    fecha_ticker_accts = {}
    for path in csvs:
        for fecha, raw, acct in parse_div_dates(path):
            for tk in {raw, map_ticker(raw)}:
                fecha_ticker_accts.setdefault((fecha, tk), set()).add(acct)
    print(f"Unique (fecha, ticker) keys: {len(fecha_ticker_accts)}")

    null_rows = fetch_null_paged()
    print(f"NULL rows: {len(null_rows)}")

    matches = []
    matches_pa = {}
    multi = 0
    no_match = 0
    for r in null_rows:
        fecha = r["fecha"]; ticker = r["ticker"]
        accts = fecha_ticker_accts.get((fecha, ticker), set())
        if len(accts) == 1:
            acct = next(iter(accts))
            matches.append((r["id"], acct))
            matches_pa[acct] = matches_pa.get(acct, 0) + 1
        elif len(accts) > 1:
            multi += 1
        else:
            no_match += 1

    print(f"\nMatched: {len(matches)}")
    print(f"Per acct: {matches_pa}")
    print(f"Multi-account same date: {multi}")
    print(f"(fecha, ticker) not in CSV: {no_match}")

    if not apply:
        print("\nDry-run. Re-run with --apply.")
        return
    if not matches:
        return

    by_acct = {}
    for id_, acct in matches:
        by_acct.setdefault(acct, []).append(id_)
    BATCH = 80
    total = 0
    for acct, ids in by_acct.items():
        for i in range(0, len(ids), BATCH):
            chunk = ids[i:i+BATCH]
            ids_str = ",".join(str(x) for x in chunk)
            sql = f"UPDATE dividendos SET account='{acct}' WHERE id IN ({ids_str})"
            o = wrangler_query(sql, expect_json=False)
            if o is not None:
                total += len(chunk)
            if (i // BATCH) % 5 == 0:
                print(f"  {acct}: {min(i+BATCH, len(ids))}/{len(ids)}")
    print(f"\nDone. {total} rows updated.")


if __name__ == "__main__":
    main()
