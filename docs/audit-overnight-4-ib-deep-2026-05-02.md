# Audit Overnight 4 — IB Flex vs D1 deep reconciliation

Generated: 2026-05-02. Mode: APPLY

## TL;DR

- D1 cost_basis: **12758** rows (1630 NULL exec_id)
- CSV unique exec_ids: **11419**
- Trades SAFE-MISSING (CSV exec_id not in D1, AND no composite match): **0**
- Trades RISKY-MISSING (CSV exec_id not in D1, but composite-equivalent row exists): **301**
- D1-only trades (exec_id not in any CSV): **10**
- Field mismatches (same exec_id, diff shares/price/coste): **31**
- IB_MAP gap candidates discovered: **16**
- CSV CTRN dividends not in D1: **26**
- CSV deposits/withdrawals not in D1 transferencias: **0**

### Applied
- Trades INSERTed: 0
- Dividends INSERTed: 0
- Transferencias INSERTed: 0

## A) Trades SAFE-MISSING (not in D1, no composite duplicate)

None — D1 covers all CSV trades by exec_id.

## A2) Trades RISKY-MISSING (not in D1 by exec_id, but composite match exists)

These have a different exec_id than what's in D1, but a row with identical (fecha, ticker, tipo, shares, precio, coste) already exists. **DO NOT INSERT** — would create duplicates. These are usually sub-allocation TransactionIDs of executions that were aggregated under a different TransactionID at import time (e.g. CLAUDE_FULL-4.csv uses EXECUTION-level granularity vs multi4's ALLOCATION).

| Year | Risky-missing |
|------|--------------:|
| 2020 | 9 |
| 2021 | 73 |
| 2022 | 42 |
| 2023 | 47 |
| 2024 | 55 |
| 2025 | 62 |
| 2026 | 13 |

### Sample (first 5)

| exec_id | fecha | ticker | shares | precio | coste |
|---------|-------|--------|-------:|-------:|------:|
| `1646611800/14674587282` | 2020-12-22 | AMC | 500.0 | 2.535 | -1270.0 |
| `1646649855/14674734222` | 2020-12-22 | AMC | -200.0 | 2.54 | 506.9649732 |
| `1646649855/14674734246` | 2020-12-22 | AMC | -100.0 | 2.54 | 253.4824866 |
| `1646649855/14674734258` | 2020-12-22 | AMC | -100.0 | 2.54 | 253.4824866 |
| `1646649855/14674734305` | 2020-12-22 | AMC | -100.0 | 2.54 | 253.4824866 |

## B) D1 trades not linked to CSV exec_id

### Per year

| Year | D1-only |
|------|--------:|
| 2026 | 10 |

### Investigation hint

These rows have `exec_id IS NOT NULL` but the value isn't in any CSV we have. Most likely sources:

1. **CSV not in our archive** — we have multi4 reports for 2021–2025, but trades from 2013–2020 came from older Flex queries that may not be in `data/flex-csvs/`.
2. **Manual inserts** — trades typed into the app via the UI (no exec_id, but exec_id may have been backfilled later from Flex single-account queries).
3. **Other broker** — Tastytrade, ClickTrade, etc. (cost_basis is broker-agnostic).
4. **Different exec_id format** — older CSVs might use `IBExecID` instead of `IBOrderID/TransactionID`.


### Sample (first 10)

| id | exec_id | fecha | ticker | tipo | shares | account |
|---:|---------|-------|--------|------|-------:|---------|
| 32232 | `0000e432.69f483ef.01.01` | 2026-05-01 | CNSWF | EQUITY | 100 | None |
| 32233 | `00031722.69f4a6ed.01.01` | 2026-05-01 | LULU | EQUITY | 1 | None |
| 32234 | `0000fb0a.69f4dbd7.02.01.01` | 2026-05-01 | LULU | OPTION | -1 | None |
| 32235 | `0000fb0a.69f4dbd7.03.01.01` | 2026-05-01 | LULU | OPTION | 1 | None |
| 32236 | `0000d7a0.69f4a4d8.01.01` | 2026-05-01 | CNSWF | EQUITY | -1 | None |
| 32237 | `0000d7a0.69f4a4da.01.01` | 2026-05-01 | CNSWF | EQUITY | -2 | None |
| 32238 | `0000d7a0.69f4a4df.01.01` | 2026-05-01 | CNSWF | EQUITY | -87 | None |
| 32239 | `00030e5e.6ccf2da8.01.01` | 2026-05-01 | MO | EQUITY | -100 | None |
| 32240 | `000249e2.69f4a533.01.01` | 2026-05-01 | ZTS | EQUITY | 50 | None |
| 32241 | `0001de5f.69f4fd9a.01.01` | 2026-05-01 | KWEB | OPTION | -5 | None |

## C) Field mismatches (same exec_id, different fields)

| d1_id | exec_id | fecha | ticker | csv shares | csv precio | csv coste | d1 shares | d1 precio | d1 coste |
|------:|---------|-------|--------|-----------:|-----------:|----------:|----------:|----------:|---------:|
| 3764 | `1766390438/15474262319` | 2021-02-23 | ARKG | 5.0 | 98.44 | -492.184 | 5.0 | 98.436 | -492.18 |
| 3769 | `1773545922/15517146489` | 2021-02-25 | ARKG | 30.0 | 92.035 | -2761.34625725 | 30.0 | 92.045 | -2761.35 |
| 4150 | `2195815438/18721648313` | 2021-12-09 | CIK | 100.0 | 3.435 | -343.87025725 | 100.0 | 3.4387 | -343.87 |
| 4864 | `2195830026/18721725797` | 2021-12-09 | IGR | 100.0 | 9.345 | -935.17025725 | 100.0 | 9.3517 | -935.17 |
| 5530 | `1766734209/15474964664` | 2021-02-23 | NIO | 24.0 | 47.26 | -1134.3168 | 24.0 | 47.263333 | -1134.32 |

… 26 more (see audit-4-fixes.sql)

## D) IB_MAP missing entries

Foreign tickers found in CSVs that aren't in `IB_MAP` (worker.js).

| Raw symbol | Underlying | Listing exchange |
|------------|------------|------------------|
| `1` | `1` | SEHK |
| `1066` | `1066` | SEHK |
| `1999` | `1999` | SEHK |
| `2102` | `` | SEHK |
| `2168` | `` | SEHK |
| `2168` | `2168` | SEHK |
| `2678` | `2678` | SEHK |
| `3690` | `3690` | SEHK |
| `3CP` | `` | FWB2 |
| `700` | `` | SEHK |
| `939` | `` | SEHK |
| `939` | `939` | SEHK |
| `9988` | `` | SEHK |
| `9988` | `9988` | SEHK |
| `IAGe` | `` | BM |
| `VISe` | `VIS` | BM |

### Suggested IB_MAP additions

```js
// Add to every IB_MAP literal in api/src/worker.js (lines 2147, 11539, 11649, 12606, 13419, 22378)
  "9988": "HKG:9988",
  "1066": "HKG:1066",
  "1999": "HKG:1999",
  "2168": "HKG:2168",
  "2678": "HKG:2678",
  "3690": "HKG:3690",
  "700": "HKG:0700",
  "939": "HKG:0939",
  "1": "HKG:0001",
  "2102": "HKG:2102",
  "VISe": "BME:VIS",
  "IAGe": "BME:IAG",
```

## E) Dividends missing in D1

### Per year

| Year | Missing |
|------|--------:|
| 2025 | 26 |

### Sample (first 20 Dividends only)

| txn_id | fecha | ticker | amount | currency | account |
|--------|-------|--------|-------:|----------|---------|
| `30719432547` | 2025-01-02 | PARA | 60.00 | USD | U5372268 |
| `30944214681` | 2025-01-16 | KER | 40.00 | EUR | U6735130 |
| `31412259209` | 2025-01-07 | QYLD | 417.53 | USD | U6735130 |
| `31900537906` | 2025-03-17 | EPR | 57.01 | USD | U6735130 |
| `32090913387` | 2025-03-28 | SPYI | 101.30 | USD | U6735130 |
| `32115406036` | 2025-03-31 | EIC | 60.00 | USD | U6735130 |
| `32226163237` | 2025-04-04 | BIZD | 171.80 | USD | U6735130 |
| `32513102251` | 2025-04-22 | VTMX | 41.09 | USD | U6735130 |
| `32648162850` | 2025-04-30 | EIC | 80.00 | USD | U6735130 |
| `32648253215` | 2025-04-30 | YYY | 23.04 | USD | U6735130 |
| `31600979139` | 2025-02-27 | LPG | 70.00 | USD | U6735130 |
| `31259859192` | 2025-02-06 | TLT | 156.14 | USD | U7257686 |
| `32026800399` | 2025-03-25 | VWO | 4.68 | USD | U7257686 |
| `32222036356` | 2025-04-04 | TLT | 162.79 | USD | U7257686 |
| `31163072283` | 2025-01-31 | EIC | 20.00 | USD | U7953378 |
| `31166153198` | 2025-01-31 | EXG | 13.27 | USD | U7953378 |
| `31161564829` | 2025-01-31 | IGR | 24.00 | USD | U7953378 |
| `31194958604` | 2025-02-03 | PTY | 35.64 | USD | U7953378 |
| `31626629710` | 2025-02-28 | EIC | 20.00 | USD | U7953378 |
| `31625469888` | 2025-02-28 | IGR | 42.00 | USD | U7953378 |

## F) Transferencias missing in D1

D1 transferencias covers all CSV deposits/withdrawals.

## Files

- Audit script: `/Users/ricardogarciaontoso/IA/AyR/scripts/audit_4_ib_deep_2026-05-02.py`
- Risky SQL: `/Users/ricardogarciaontoso/IA/AyR/scripts/audit-4-fixes.sql`
- Report: `/Users/ricardogarciaontoso/IA/AyR/docs/audit-overnight-4-ib-deep-2026-05-02.md`

