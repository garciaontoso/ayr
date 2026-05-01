#!/usr/bin/env python3
"""
Recover orphan dividend rows that were in cost_basis but not in dividendos.

Reads dedup_needs_review.json (created by dedup_dividends_from_cost_basis.py)
and INSERTs them into the dividendos table.
"""
import json
import os
import subprocess
import sys

WRANGLER_CWD = "/Users/ricardogarciaontoso/IA/AyR/api"


def wrangler_exec(sql: str):
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "aar-finanzas", "--remote", "--command", sql, "--json"],
        cwd=WRANGLER_CWD, capture_output=True, text=True, timeout=180,
    )
    if result.returncode != 0:
        sys.stderr.write(f"err: {result.stderr[:300]}\n")
        return None
    out = result.stdout
    idx = out.find("[")
    if idx > 0:
        out = out[idx:]
    return out


def main():
    apply = "--apply" in sys.argv
    with open("/Users/ricardogarciaontoso/IA/AyR/scripts/dedup_needs_review.json") as f:
        rows = json.load(f)
    print(f"Loaded {len(rows)} orphan rows")

    # Filter: only valid (positive total, positive shares or known ticker)
    valid = [r for r in rows if r.get("div_total", 0) > 0]
    print(f"Valid (div_total>0): {len(valid)}")

    # Ticker mapping for IB special tickers
    TICKER_MAP = {"ENGe":"ENG","LOGe":"LOG","REPe":"REP","ISPAd":"ISPA","IIPR PRA":"IIPR-PRA"}

    # Build INSERT statements
    sqls = []
    for r in valid:
        ticker = TICKER_MAP.get(r["ticker"], r["ticker"]).replace("'", "''")
        fecha = r["fecha"].replace("'", "''") if r.get("fecha") else None
        if not fecha or not ticker:
            continue
        bruto = float(r["div_total"])
        shares = int(r.get("total_shares") or 0)
        # We don't know dps here; calc as bruto/shares if shares>0
        dps = bruto / shares if shares > 0 else 0
        account = r.get("account")
        account_sql = f"'{account}'" if account else "NULL"
        sqls.append(f"INSERT INTO dividendos (ticker, fecha, bruto, neto, divisa, shares, dps_gross, broker, notas, account, fx_to_usd, bruto_usd, neto_usd) VALUES ('{ticker}', '{fecha}', {bruto}, {bruto}, 'USD', {shares}, {dps}, 'IB', 'recovered from cost_basis orphan', {account_sql}, 1, {bruto}, {bruto})")

    print(f"Generated {len(sqls)} INSERTs")
    if not apply:
        print("Dry-run only. Use --apply to commit.")
        print("\nSample SQL:")
        print(sqls[0] if sqls else "(none)")
        return

    # Apply in batches via combined statements
    BATCH = 30
    total = 0
    for i in range(0, len(sqls), BATCH):
        chunk = sqls[i:i+BATCH]
        combined = "; ".join(chunk)
        out = wrangler_exec(combined)
        if out:
            total += len(chunk)
            if (i // BATCH) % 5 == 0:
                print(f"  {total}/{len(sqls)} inserted")
    print(f"Done. {total} rows inserted.")


if __name__ == "__main__":
    main()
