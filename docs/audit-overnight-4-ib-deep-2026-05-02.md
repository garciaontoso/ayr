# Audit Overnight 4 — IB Flex vs D1 deep reconciliation

Generated: 2026-05-02. Mode: DRY-RUN

## TL;DR

- D1 cost_basis: **12054** rows (1630 NULL exec_id)
- CSV unique exec_ids: **11419**
- Trades MISSING in D1 (CSV exec_id not in D1): **1005**
- D1-only trades (exec_id not in any CSV): **10**
- Field mismatches (same exec_id, diff shares/price/coste): **31**
- IB_MAP gap candidates discovered: **16**
- CSV CTRN dividends not in D1: **26**
- CSV deposits/withdrawals not in D1 transferencias: **0**

### Applied
- Dry-run. Re-run with `--apply` to commit.

## A) Trades missing in D1

### Per year

| Year | Missing |
|------|--------:|
| 2020 | 9 |
| 2021 | 73 |
| 2022 | 42 |
| 2023 | 47 |
| 2024 | 55 |
| 2025 | 766 |
| 2026 | 13 |

### Per account

| Account | Missing |
|---------|--------:|
| U7257686 | 349 |
| U5372268 | 293 |
| U6735130 | 253 |
| U7953378 | 110 |

### Sample (first 20)

| exec_id | fecha | ticker | underlying | tipo | shares | precio | coste | account |
|---------|-------|--------|------------|------|-------:|-------:|------:|---------|
| `1646611800/14674587282` | 2020-12-22 | AMC | AMC | EQUITY | 500.0 | 2.535 | -1270.0 | U5372268 |
| `1646649855/14674734222` | 2020-12-22 | AMC | AMC | EQUITY | -200.0 | 2.54 | 506.9649732 | U5372268 |
| `1646649855/14674734246` | 2020-12-22 | AMC | AMC | EQUITY | -100.0 | 2.54 | 253.4824866 | U5372268 |
| `1646649855/14674734258` | 2020-12-22 | AMC | AMC | EQUITY | -100.0 | 2.54 | 253.4824866 | U5372268 |
| `1646649855/14674734305` | 2020-12-22 | AMC | AMC | EQUITY | -100.0 | 2.54 | 253.4824866 | U5372268 |
| `1646649855/14674734336` | 2020-12-22 | AMC | AMC | EQUITY | -100.0 | 2.54 | 253.4824866 | U5372268 |
| `1651338050/14716314460` | 2020-12-28 | EH | EH | EQUITY | -10.0 | 25.8 | 257.9931082 | U5372268 |
| `1651338050/14716314475` | 2020-12-28 | EH | EH | EQUITY | -1.0 | 25.8 | 25.79931082 | U5372268 |
| `1651322754/14716229531` | 2020-12-28 | YALA | YALA | EQUITY | 39.0 | 16.5 | -643.5 | U5372268 |
| `1671397502/14862286393` | 2021-01-11 | BA | BA | EQUITY | -1.0 | 204.6 | 204.59535934 | U5372268 |
| `1744634418/15336947766` | 2021-02-12 | DOYU | DOYU | EQUITY | -100.0 | 16.67 | 1666.58100205 | U5372268 |
| `1752915589/15387975313` | 2021-02-17 | DOYU | DOYU | EQUITY | -100.0 | 16.41 | 1640.58157665 | U5372268 |
| `1785173383/15593011965` | 2021-03-03 | FOX | FOX | EQUITY | -100.0 | 37.79 | 3778.29856985 | U5372268 |
| `1703343182/15079049628` | 2021-01-27 | GME | GME | EQUITY | -1.0 | 336.83 | 336.824337057 | U5372268 |
| `1703343182/15079049635` | 2021-01-27 | GME | GME | EQUITY | -3.0 | 336.83 | 1010.473011171 | U5372268 |
| `1704282771/15083195739` | 2021-01-27 | GME | GME | EQUITY | -4.0 | 305.0 | 1219.976562 | U5372268 |
| `1705311923/15086441044` | 2021-01-27 | GME | GME | EQUITY | 1.0 | 375.0 | -375.0032 | U5372268 |
| `1705576691/15087800197` | 2021-01-27 | GME | GME | EQUITY | -2.0 | 339.34 | 678.666763172 | U5372268 |
| `1692228277/15006332706` | 2021-01-21 | GSAT | GSAT | EQUITY | 100.0 | 1.255 | -125.5 | U5372268 |
| `1693261924/15016575809` | 2021-01-22 | GSAT | GSAT | EQUITY | 100.0 | 1.075 | -108.0 | U5372268 |

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

