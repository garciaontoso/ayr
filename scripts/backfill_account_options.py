#!/usr/bin/env python3
"""
Backfill cost_basis.account for OPTION rows.

CB row has: ticker (OCC string or underlying), opt_strike, opt_expiry, opt_tipo (PUT/CALL).
CSV TRNT row has: AssetClass=OPT, UnderlyingSymbol, Strike, Expiry, Put/Call (P/C),
ClientAccountID, TradeDate.

Match key: (fecha, underlying, strike, expiry, P|C). If exactly one account
in the CSV had this combination, assign it.

Usage:
    python3 scripts/backfill_account_options.py            # dry-run
    python3 scripts/backfill_account_options.py --apply
"""
import csv as csvmod
import glob
import json
import subprocess
import sys
from pathlib import Path

CSV_GLOB = "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/U5372268_multi4_*.csv"
WRANGLER_CWD = "/Users/ricardogarciaontoso/IA/AyR/api"


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


def parse_opt_trnt(path: str):
    """Yield (fecha, underlying, strike, expiry_iso, P|C, account) for OPT rows."""
    out = []
    trnt_hdr = None
    with open(path) as f:
        for row in csvmod.reader(f):
            if not row:
                continue
            kind = row[0]
            section = row[1] if len(row) > 1 else ""
            if kind == "HEADER" and section == "TRNT":
                trnt_hdr = row[2:]
            elif kind == "DATA" and section == "TRNT" and trnt_hdr:
                d = dict(zip(trnt_hdr, row[2:]))
                if d.get("AssetClass") != "OPT":
                    continue
                acct = (d.get("ClientAccountID") or "").strip()
                und = (d.get("UnderlyingSymbol") or "").strip()
                td = (d.get("TradeDate") or "").strip()
                strike = (d.get("Strike") or "").strip()
                expiry = (d.get("Expiry") or "").strip()
                pc = (d.get("Put/Call") or "").strip()
                if not all([acct, und, td, strike, expiry, pc]) or len(td) != 8:
                    continue
                fecha = f"{td[:4]}-{td[4:6]}-{td[6:8]}"
                exp_iso = (
                    f"{expiry[:4]}-{expiry[4:6]}-{expiry[6:8]}"
                    if len(expiry) == 8 else expiry
                )
                try:
                    strike_f = float(strike)
                except ValueError:
                    continue
                out.append((fecha, und, strike_f, exp_iso, pc, acct))
    return out


def main():
    apply = "--apply" in sys.argv
    csvs = sorted(glob.glob(CSV_GLOB))
    if not csvs:
        sys.stderr.write(f"No CSVs at {CSV_GLOB}\n"); sys.exit(1)

    opt_map = {}
    for path in csvs:
        for fecha, und, strike, expiry, pc, acct in parse_opt_trnt(path):
            k = (fecha, und, strike, expiry, pc)
            opt_map.setdefault(k, set()).add(acct)
    print(f"OPT keys built: {len(opt_map)}")

    sql = ("SELECT id, fecha, ticker, opt_strike, opt_expiry, opt_tipo "
           "FROM cost_basis WHERE tipo='OPTION' "
           "AND (account IS NULL OR account = '')")
    out = wrangler_query(sql)
    opt_rows = json.loads(out)[0]["results"] if out else []
    print(f"OPT NULL rows: {len(opt_rows)}")

    matches = []
    matches_per_account = {}
    ambig = 0
    no_match = 0
    for r in opt_rows:
        fecha = r["fecha"]
        ticker = r["ticker"]
        underlying = ticker.split()[0] if " " in ticker else ticker
        try:
            strike = float(r.get("opt_strike") or 0)
        except (TypeError, ValueError):
            continue
        expiry = r.get("opt_expiry") or ""
        pc = r.get("opt_tipo") or ""
        pc_short = pc[0] if pc else ""
        k = (fecha, underlying, strike, expiry, pc_short)
        accts = opt_map.get(k, set())
        if len(accts) == 1:
            acct = next(iter(accts))
            matches.append((r["id"], acct))
            matches_per_account[acct] = matches_per_account.get(acct, 0) + 1
        elif len(accts) > 1:
            ambig += 1
        else:
            no_match += 1

    print(f"\nMatched: {len(matches)}")
    print(f"Per account: {matches_per_account}")
    print(f"Ambiguous: {ambig}")
    print(f"No match: {no_match}")

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
            o = wrangler_query(sql, expect_json=False)
            if o is not None:
                total += len(chunk)
            if (i // BATCH) % 5 == 0:
                print(f"  {acct}: {min(i+BATCH, len(ids))}/{len(ids)}")
    print(f"\nDone. {total} rows updated.")


if __name__ == "__main__":
    main()
