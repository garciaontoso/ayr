#!/usr/bin/env python3
"""
Detectar y borrar dividendos DUPLICADOS entre cost_basis y dividendos.

Hipótesis del audit (docs/audit-d1-vs-csv-2026-05-02.md):
    cost_basis.tipo='DIVIDENDS' tiene 4 188 filas que NO son trades, son
    dividendos mal puestos. La mesa correcta es `dividendos`.

Mapping entre tablas (verificado con consulta D1):
    cost_basis.div_total  ≈ dividendos.neto  (cantidad después de WHT)
    cost_basis.dps        ≈ dividendos.bruto / shares (raw dividend per share)
    cost_basis.total_shares ≈ shares en cuenta en ese momento
    Hay matches también con dividendos.bruto en algunos casos (sin WHT).

Para safety, este script:
    1. SELECT cost_basis WHERE tipo='DIVIDENDS' (4 188 filas)
    2. Para cada uno, buscar match en dividendos por (fecha, ticker) con
       div_total ≈ neto o ≈ bruto (tolerancia $1)
    3. Si match exact: id de cost_basis para DELETE batch
    4. Si NO match: imprimir como "needs review" (NO BORRAR)

Uso:
    python3 scripts/dedup_dividends_from_cost_basis.py            # dry-run
    python3 scripts/dedup_dividends_from_cost_basis.py --apply

NO BORRA NADA SI NO HAY MATCH EN dividendos.
"""
import json
import os
import subprocess
import sys
from collections import defaultdict

WRANGLER_CWD = "/Users/ricardogarciaontoso/IA/AyR/api"
TOLERANCE = 1.0  # $1 tolerance for div_total ~ neto or bruto


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


def fetch_paged(sql_template: str):
    """sql_template must have a {last_id} placeholder (paginate by id)."""
    all_rows = []
    last_id = 0
    while True:
        sql = sql_template.format(last_id=last_id)
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


def fetch_dividends_index():
    """Build index (fecha, ticker) -> [(neto, bruto, id), ...]"""
    rows = fetch_paged(
        "SELECT id, fecha, ticker, bruto, neto FROM dividendos "
        "WHERE id > {last_id} ORDER BY id LIMIT 1000"
    )
    idx: dict[tuple[str, str], list[tuple[float, float, int]]] = defaultdict(list)
    for r in rows:
        key = (r.get("fecha", ""), r.get("ticker", ""))
        bruto = float(r.get("bruto") or 0)
        neto = float(r.get("neto") or 0)
        idx[key].append((neto, bruto, r["id"]))
    return idx, len(rows)


def fetch_costbasis_dividends():
    return fetch_paged(
        "SELECT id, fecha, ticker, div_total, total_shares, dps, account "
        "FROM cost_basis WHERE tipo='DIVIDENDS' AND id > {last_id} "
        "ORDER BY id LIMIT 1000"
    )


def is_match(cb_div_total: float, dividend_rows: list) -> bool:
    """Return True if any dividendos row has neto~=cb_div_total or bruto~=cb_div_total."""
    for neto, bruto, _ in dividend_rows:
        if abs(neto - cb_div_total) <= TOLERANCE:
            return True
        if abs(bruto - cb_div_total) <= TOLERANCE:
            return True
    return False


def main():
    apply = "--apply" in sys.argv

    # Pre-state
    print("Pre-state:")
    out = wrangler_query(
        "SELECT (SELECT COUNT(*) FROM cost_basis WHERE tipo='DIVIDENDS') cb_divs, "
        "(SELECT COUNT(*) FROM dividendos) divs"
    )
    if out:
        try:
            data = json.loads(out)[0]["results"][0]
            print(f"  cost_basis DIVIDENDS: {data['cb_divs']}")
            print(f"  dividendos:            {data['divs']}")
            pre_div_count = data["divs"]
            pre_cb_count = data["cb_divs"]
        except Exception:
            print("  parse failed")
            pre_div_count = pre_cb_count = -1

    # 1. Build index of dividendos (fecha, ticker) -> [(neto, bruto, id)]
    print("\nFetching dividendos (full table) ...")
    div_index, total_divs = fetch_dividends_index()
    print(f"  {total_divs} dividendos rows indexed")

    # 2. Fetch cost_basis DIVIDENDS rows
    print("\nFetching cost_basis tipo='DIVIDENDS' rows ...")
    cb_rows = fetch_costbasis_dividends()
    print(f"  {len(cb_rows)} cost_basis DIVIDENDS rows fetched")

    # 3. Match
    to_delete: list[int] = []  # cost_basis ids safe to delete
    needs_review: list[dict] = []  # cost_basis rows without match
    no_data_skipped = 0

    for r in cb_rows:
        fecha = r.get("fecha", "")
        ticker = r.get("ticker", "")
        div_total = float(r.get("div_total") or 0)
        # Skip rows with div_total=0 (these are running balances/headers, not actual dividends)
        if div_total == 0:
            no_data_skipped += 1
            continue
        key = (fecha, ticker)
        candidates = div_index.get(key, [])
        if candidates and is_match(div_total, candidates):
            to_delete.append(r["id"])
        else:
            needs_review.append({
                "id": r["id"],
                "fecha": fecha,
                "ticker": ticker,
                "div_total": div_total,
                "total_shares": r.get("total_shares"),
                "account": r.get("account"),
            })

    print(f"\nResults:")
    print(f"  Safe to delete (matched in dividendos): {len(to_delete)}")
    print(f"  Skipped (div_total=0):                  {no_data_skipped}")
    print(f"  Needs manual review (no match):         {len(needs_review)}")

    # Group needs_review by ticker for readability
    if needs_review:
        by_ticker = defaultdict(int)
        for r in needs_review:
            by_ticker[r["ticker"]] += 1
        top = sorted(by_ticker.items(), key=lambda x: -x[1])[:20]
        print(f"\n  Top tickers needing review:")
        for tk, c in top:
            print(f"    {tk}: {c}")

        # Write needs_review JSON for manual inspection
        out_path = "/Users/ricardogarciaontoso/IA/AyR/scripts/dedup_needs_review.json"
        with open(out_path, "w") as f:
            json.dump(needs_review, f, indent=2)
        print(f"\n  Full list written to {out_path}")

    if not apply:
        print("\nDry-run only. Re-run with --apply to commit DELETEs.")
        return

    if not to_delete:
        print("\nNothing to delete.")
        return

    # 4. DELETE in batches
    print(f"\nApplying {len(to_delete)} DELETEs from cost_basis ...")
    BATCH = 100
    deleted = 0
    for i in range(0, len(to_delete), BATCH):
        chunk = to_delete[i:i + BATCH]
        ids_str = ",".join(str(x) for x in chunk)
        sql = f"DELETE FROM cost_basis WHERE id IN ({ids_str}) AND tipo='DIVIDENDS'"
        out = wrangler_query(sql, expect_json=False)
        if out is not None:
            deleted += len(chunk)
        if (i // BATCH) % 5 == 0:
            print(f"  progress: {min(i + BATCH, len(to_delete))}/{len(to_delete)}")
    print(f"\nDeleted {deleted} rows total.")

    # 5. Post-state validations
    print("\nPost-state:")
    out = wrangler_query(
        "SELECT (SELECT COUNT(*) FROM cost_basis WHERE tipo='DIVIDENDS') cb_divs, "
        "(SELECT COUNT(*) FROM dividendos) divs"
    )
    if out:
        try:
            data = json.loads(out)[0]["results"][0]
            print(f"  cost_basis DIVIDENDS: {data['cb_divs']}  "
                  f"(was {pre_cb_count}, expected ~{pre_cb_count - deleted})")
            print(f"  dividendos:            {data['divs']}  "
                  f"(was {pre_div_count}, expected unchanged)")
            if data["divs"] != pre_div_count:
                print(f"  WARNING: dividendos count changed!")
        except Exception:
            print("  parse failed")


if __name__ == "__main__":
    main()
