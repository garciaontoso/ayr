#!/usr/bin/env python3
"""
Backfill cost_basis.account by matching exec_id from local Flex CSVs.

Builds (exec_id -> account) map from CSV TRNT rows, then UPDATEs the
cost_basis rows that have account=NULL but exec_id NOT NULL.

Usage:
    python3 scripts/backfill_account_by_execid.py            # dry-run
    python3 scripts/backfill_account_by_execid.py --apply
"""
import csv
import glob
import json
import subprocess
import sys
from pathlib import Path

CSV_GLOB = "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/U5372268_multi4_*.csv"
WRANGLER_CWD = "/Users/ricardogarciaontoso/IA/AyR/api"


def parse_execid_to_account(path: str):
    """Yield (exec_id, account) for each TRNT row.

    exec_id matches the worker's logic: '{IBOrderID}/{TransactionID}' if both
    present, else TransactionID, else IBOrderID. (worker.js:12479)
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
                acct = (d.get("ClientAccountID") or "").strip()
                ib_order = (d.get("IBOrderID") or "").strip()
                txn_id = (d.get("TransactionID") or "").strip()
                if not acct:
                    continue
                if ib_order and txn_id:
                    exec_id = f"{ib_order}/{txn_id}"
                elif txn_id:
                    exec_id = txn_id
                elif ib_order:
                    exec_id = ib_order
                else:
                    continue
                out.append((exec_id, acct))
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


def fetch_null_with_execid():
    """All NULL-account rows that DO have exec_id (= our match candidates)."""
    sql = (
        "SELECT id, exec_id FROM cost_basis "
        "WHERE (account IS NULL OR account = '') "
        "AND exec_id IS NOT NULL AND exec_id != ''"
    )
    out = wrangler_query(sql)
    if not out:
        return []
    try:
        data = json.loads(out)
        return data[0]["results"]
    except Exception as e:
        sys.stderr.write(f"parse error: {e}\n{out[:500]}\n")
        return []


def main():
    apply = "--apply" in sys.argv

    csvs = sorted(glob.glob(CSV_GLOB))
    if not csvs:
        sys.stderr.write(f"No CSVs at {CSV_GLOB}\n"); sys.exit(1)
    print(f"Found {len(csvs)} CSV files")

    exec_to_account = {}
    accounts_seen = {}
    for path in csvs:
        rows = parse_execid_to_account(path)
        new_keys = 0
        for exec_id, acct in rows:
            if exec_id not in exec_to_account:
                exec_to_account[exec_id] = acct
                new_keys += 1
            accounts_seen[acct] = accounts_seen.get(acct, 0) + 1
        print(f"  {Path(path).name}: {len(rows)} rows, +{new_keys} new exec_ids")
    print(f"\nUnique exec_ids: {len(exec_to_account)}")
    print(f"Account distribution: {accounts_seen}")

    print("\nFetching cost_basis NULL rows with exec_id ...")
    null_rows = fetch_null_with_execid()
    print(f"Total: {len(null_rows)}")

    matches_per_account = {}
    matches = []
    unmatched = 0
    for r in null_rows:
        exec_id = (r.get("exec_id") or "").strip()
        if not exec_id:
            unmatched += 1; continue
        if exec_id in exec_to_account:
            acct = exec_to_account[exec_id]
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
