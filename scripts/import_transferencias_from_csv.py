#!/usr/bin/env python3
"""
Importa transferencias bancarias (Deposits/Withdrawals/Internal Transfer/
Account Transfer) desde los CSV Flex IB hacia D1 (tabla `transferencias`).

Filtra la sección CTRN del CSV y excluye dividends/withholding/interest/fees.

Uso:
    python3 scripts/import_transferencias_from_csv.py            # dry-run
    python3 scripts/import_transferencias_from_csv.py --apply    # aplica INSERT

Esquema D1 transferencias:
    id INTEGER PK, fecha TEXT, account_id TEXT, tipo TEXT,
    importe REAL, divisa TEXT, descripcion TEXT, source TEXT,
    flex_id TEXT UNIQUE, created_at, updated_at
"""
from __future__ import annotations

import csv
import glob
import json
import os
import subprocess
import sys
from collections import defaultdict
from typing import Optional

CSV_GLOB = "/Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/*.csv"
WRANGLER_CWD = "/Users/ricardogarciaontoso/IA/AyR/api"

# Type values to TREAT as transferencia. Match by lowercase substring.
TRANSFER_TYPE_KEYWORDS = (
    "deposit",
    "withdraw",
    "internal transfer",
    "account transfer",
)
# Types to EXCLUDE explicitly even si por accidente caen en CTRN
EXCLUDE_TYPE_KEYWORDS = (
    "dividend",
    "withholding",
    "payment in lieu",
    "interest",
    "fee",
    "commission",
    "bond interest",
)


def normalize_type(type_str: str, amount: float) -> str:
    """Mapea Type+amount → tipo normalizado A&R."""
    t = type_str.lower()
    if "internal" in t:
        return "INTERNAL"
    if "account transfer" in t:
        return "TRANSFER"
    if amount > 0 and "deposit" in t:
        return "DEPOSIT"
    if amount < 0 and "withdraw" in t:
        return "WITHDRAW"
    if "deposit" in t and amount < 0:
        # Edge case (returned deposit) — categorize WITHDRAW
        return "WITHDRAW"
    if "withdraw" in t and amount > 0:
        return "DEPOSIT"
    # Fallback for "Deposits/Withdrawals" combined label
    if "deposit" in t or "withdraw" in t:
        return "DEPOSIT" if amount >= 0 else "WITHDRAW"
    return "TRANSFER"


def fmt_date(yyyymmdd: str) -> Optional[str]:
    s = (yyyymmdd or "").strip()
    if len(s) >= 8 and s[:8].isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return None


def parse_csv(path: str):
    """Yield dict rows for transferencias parseadas del CSV."""
    out = []
    ctrn_hdr = None
    with open(path, errors="replace") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            kind = row[0]
            section = row[1] if len(row) > 1 else ""
            if kind == "HEADER" and section == "CTRN":
                ctrn_hdr = row[2:]
                continue
            if kind != "DATA" or section != "CTRN" or not ctrn_hdr:
                continue
            d = dict(zip(ctrn_hdr, row[2:]))
            type_str = (d.get("Type") or "").strip()
            type_lower = type_str.lower()
            if any(k in type_lower for k in EXCLUDE_TYPE_KEYWORDS):
                continue
            if not any(k in type_lower for k in TRANSFER_TYPE_KEYWORDS):
                continue
            try:
                amount = float(d.get("Amount") or 0)
            except (TypeError, ValueError):
                continue
            account = (d.get("ClientAccountID") or "").strip()
            currency = (d.get("CurrencyPrimary") or "USD").strip() or "USD"
            settle_date = fmt_date(d.get("SettleDate") or d.get("Date/Time") or "")
            txid = (d.get("TransactionID") or "").strip()
            tradeid = (d.get("TradeID") or "").strip()
            description = (d.get("Description") or "").strip()
            if not settle_date or not account:
                continue
            tipo = normalize_type(type_str, amount)
            # flex_id preferentemente TransactionID, sino TradeID, sino synthetic
            flex_id = txid or tradeid or (
                f"syn-{account}-{settle_date}-{currency}-{int(round(amount*100))}"
            )
            out.append(
                {
                    "fecha": settle_date,
                    "account_id": account,
                    "tipo": tipo,
                    "importe": amount,
                    "divisa": currency,
                    "descripcion": description,
                    "flex_id": flex_id,
                    "raw_type": type_str,
                    "source_csv": os.path.basename(path),
                }
            )
    return out


def wrangler_run(sql: str, json_out: bool = True):
    args = [
        "npx", "wrangler", "d1", "execute", "aar-finanzas",
        "--remote", "--command", sql,
    ]
    if json_out:
        args.append("--json")
    result = subprocess.run(
        args, cwd=WRANGLER_CWD, capture_output=True, text=True, timeout=180,
    )
    if result.returncode != 0:
        sys.stderr.write(f"wrangler stderr: {result.stderr[:800]}\n")
        return None
    out = result.stdout
    if json_out:
        idx = out.find("[")
        if idx > 0:
            out = out[idx:]
        try:
            return json.loads(out)
        except json.JSONDecodeError as e:
            sys.stderr.write(f"json decode error: {e}\nfirst 400 chars:\n{out[:400]}\n")
            return None
    return out


def fetch_existing_flex_ids() -> set:
    parsed = wrangler_run("SELECT flex_id FROM transferencias WHERE flex_id IS NOT NULL")
    if not parsed:
        return set()
    return {r["flex_id"] for r in parsed[0]["results"] if r.get("flex_id")}


def fetch_existing_count() -> int:
    parsed = wrangler_run("SELECT COUNT(*) AS c FROM transferencias")
    if not parsed:
        return -1
    return int(parsed[0]["results"][0]["c"])


def sql_str(s: Optional[str]) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def build_insert_batch(rows: list) -> str:
    """Build a single multi-row INSERT statement."""
    values = []
    for r in rows:
        values.append(
            "("
            + sql_str(r["fecha"]) + ","
            + sql_str(r["account_id"]) + ","
            + sql_str(r["tipo"]) + ","
            + f"{r['importe']:.6f},"
            + sql_str(r["divisa"]) + ","
            + sql_str(r["descripcion"]) + ","
            + sql_str("flex") + ","
            + sql_str(r["flex_id"])
            + ")"
        )
    return (
        "INSERT OR IGNORE INTO transferencias "
        "(fecha, account_id, tipo, importe, divisa, descripcion, source, flex_id) "
        "VALUES " + ",".join(values)
    )


def main():
    apply = "--apply" in sys.argv

    # 1. Parsear todos los CSVs
    all_rows = []
    files = sorted(glob.glob(CSV_GLOB))
    for path in files:
        rows = parse_csv(path)
        if rows:
            print(f"  · {os.path.basename(path):.<70} {len(rows):>4} rows")
        all_rows.extend(rows)
    print(f"\nTotal rows raw extracted: {len(all_rows)}")

    # 2. Dedup CSV-side por flex_id
    seen_flex = {}
    for r in all_rows:
        # Si hay más de un CSV con el mismo flex_id, nos quedamos con el primero
        key = r["flex_id"]
        if key not in seen_flex:
            seen_flex[key] = r
    deduped = list(seen_flex.values())
    print(f"After CSV-side dedup by flex_id: {len(deduped)}")

    # 3. Cargar flex_ids ya en D1
    pre_count = fetch_existing_count()
    print(f"\nD1 transferencias COUNT pre = {pre_count}")
    existing = fetch_existing_flex_ids()
    print(f"D1 existing flex_ids: {len(existing)}")

    # 4. Filtrar nuevos
    to_insert = [r for r in deduped if r["flex_id"] not in existing]
    print(f"Rows new to insert: {len(to_insert)}\n")

    # 5. Reporte por año/account/tipo
    summary = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))  # [count, sum]
    for r in to_insert:
        year = r["fecha"][:4]
        key = (year, r["account_id"], r["tipo"], r["divisa"])
        summary[year][key][0] += 1
        summary[year][key][1] += r["importe"]

    print("=== Distribución previa al INSERT ===")
    print(f"{'Año':<5} {'Account':<10} {'Tipo':<10} {'Cur':<4} {'Cnt':>4} {'Importe':>14}")
    for year in sorted(summary):
        for (yr, acct, tipo, cur), (cnt, total) in sorted(summary[year].items()):
            print(f"{yr:<5} {acct:<10} {tipo:<10} {cur:<4} {cnt:>4} {total:>14,.2f}")
    print()

    # Top 5 por importe absoluto
    sorted_by_amt = sorted(to_insert, key=lambda r: abs(r["importe"]), reverse=True)
    print("=== Top 5 por importe absoluto ===")
    for r in sorted_by_amt[:5]:
        print(
            f"  {r['fecha']}  {r['account_id']:<10} {r['tipo']:<10} "
            f"{r['divisa']:<4} {r['importe']:>14,.2f}  flex_id={r['flex_id']}"
        )
    print()

    # Balance neto (en USD aprox. — 1 EUR ~ 1.1 USD pero no convertimos para no introducir errores)
    nets = defaultdict(float)
    for r in to_insert:
        sign = 1 if r["tipo"] in ("DEPOSIT",) else -1 if r["tipo"] == "WITHDRAW" else 0
        nets[r["divisa"]] += sign * abs(r["importe"]) if r["tipo"] in ("DEPOSIT", "WITHDRAW") else 0
    # Mejor: simplemente sumar amount tal cual (ya tiene signo correcto en el CSV)
    raw_nets = defaultdict(float)
    for r in to_insert:
        raw_nets[r["divisa"]] += r["importe"]
    print("=== Balance neto bank → broker (raw amounts) ===")
    for cur, v in raw_nets.items():
        print(f"  {cur}: {v:>14,.2f}")
    print()

    if not apply:
        print("DRY RUN — re-ejecuta con --apply para aplicar el INSERT")
        return

    if not to_insert:
        print("Nada que insertar.")
        return

    # 6. INSERT en lotes (D1 max ~50 rows por SQL para mantener sql<100KB)
    BATCH_SIZE = 40
    inserted = 0
    for i in range(0, len(to_insert), BATCH_SIZE):
        batch = to_insert[i:i + BATCH_SIZE]
        sql = build_insert_batch(batch)
        result = wrangler_run(sql)
        if result and result[0].get("success"):
            changes = result[0]["meta"].get("changes", 0)
            inserted += changes
            print(f"  batch {i//BATCH_SIZE + 1}: changes={changes} (rows in batch={len(batch)})")
        else:
            sys.stderr.write(f"FAILED batch {i//BATCH_SIZE + 1}\n")
            sys.stderr.write(f"first 400 chars of SQL: {sql[:400]}\n")
            return

    post_count = fetch_existing_count()
    print(f"\nD1 transferencias COUNT post = {post_count}")
    print(f"Inserted: {inserted}")


if __name__ == "__main__":
    main()
