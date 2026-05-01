# Auditoría D1 vs CSVs IB Flex — 2026-05-02

CSVs escaneados: **16**.  Trades únicos (post-dedup): **9,822**.  Cash únicos: **10,872**.

> Notas clave del esquema D1 (descubiertas durante la auditoría):
> - `cost_basis.tipo` mezcla `EQUITY/OPTION/BUY/SELL/FOREX` (trades) con `DIVIDENDS` (4 188 filas). Aquí solo comparo las primeras 5 contra TRNT del CSV.
> - `cost_basis.exec_id` está **vacío en las 7 969 filas** — no hay clave única IB para deduplicar.
> - `cost_basis.account` poblado en 4 500/7 969 (56 %). El resto NULL = backfill pendiente del multi-account.
> - `dividendos.account` poblado en **0 %**. Toda la tabla está NULL — la comparación per-cuenta es solo informativa.
> - Los CSV `multi6_*` usan formato no-multi-account antiguo (sin HEADER/TRNT) y aportan 0 datos al ground-truth (cobertura completa con `multi4_*`).
> - **Cobertura CSV: 2020–2026**. Filas D1 de **2014/2018/etc. no tienen CSV** y son carga histórica manual (no las marco como anomalía).

## A. Vista año (sin partir por cuenta) — la comparación más limpia

### A.1 Trades

| Año | CSV cnt | D1 cnt | Δ cnt | CSV qty | D1 qty | Δ qty | Estado |
|---|---:|---:|---:|---:|---:|---:|---|
| 2014 | 0 | 1 | +1 | 0 | 0 | +0 | histórico (sin CSV) |
| 2020 | 274 | 12 | -262 | 87,535 | 556 | -86,979 | -262 en D1 (faltan) |
| 2021 | 2,297 | 176 | -2,121 | 334,239 | 5,270 | -328,969 | -2121 en D1 (faltan) |
| 2022 | 1,738 | 199 | -1,539 | 285,878 | 5,288 | -280,590 | -1539 en D1 (faltan) |
| 2023 | 1,801 | 365 | -1,436 | 269,428 | 6,840 | -262,588 | -1436 en D1 (faltan) |
| 2024 | 1,351 | 333 | -1,018 | 268,970 | 15,800 | -253,170 | -1018 en D1 (faltan) |
| 2025 | 1,892 | 1,903 | +11 | 424,697 | 501,657 | +76,961 | OK |
| 2026 | 469 | 785 | +316 | 162,755 | 276,655 | +113,900 | +316 en D1 (revisar dups) |

### A.2 Dividendos

| Año | CSV cnt | D1 cnt | Δ cnt | CSV bruto | D1 bruto | Δ bruto | Estado |
|---|---:|---:|---:|---:|---:|---:|---|
| 2020 | 4 | 4 | +0 | 47 | 47 | +0 | OK |
| 2021 | 108 | 78 | -30 | 3,293 | 2,670 | -623 | -30 en D1 (faltan 30 divs, $623) |
| 2022 | 377 | 324 | -53 | 9,993 | 9,640 | -353 | -53 en D1 (faltan 53 divs, $353) |
| 2023 | 487 | 377 | -110 | 17,230 | 15,556 | -1,674 | -110 en D1 (faltan 110 divs, $1,674) |
| 2024 | 630 | 544 | -86 | 37,644 | 35,732 | -1,913 | -86 en D1 (faltan 86 divs, $1,913) |
| 2025 | 971 | 942 | -29 | 59,848 | 55,672 | -4,175 | -29 en D1 (faltan 29 divs, $4,175) |
| 2026 | 180 | 185 | +5 | 24,218 | 23,851 | -366 | +5 en D1 (revisar dups) |

## B. Vista año × cuenta (informativa — D1 dividendos siempre NULL)

### B.1 cost_basis (trades-only)

| Año | Cuenta | CSV cnt | D1 cnt | Δ | CSV qty | D1 qty | Δ qty |
|---|---|---:|---:|---:|---:|---:|---:|
| 2014 | U5372268 | 0 | 1 | +1 | 0 | 0 | +0 |
| 2020 | U5372268 | 274 | 12 | -262 | 87,535 | 556 | -86,979 |
| 2021 | U5372268 | 1,126 | 176 | -950 | 137,012 | 5,270 | -131,742 |
| 2021 | U6735130 | 119 | 0 | -119 | 32,708 | 0 | -32,708 |
| 2021 | U7257686 | 387 | 0 | -387 | 63,770 | 0 | -63,770 |
| 2021 | U7953378 | 665 | 0 | -665 | 100,750 | 0 | -100,750 |
| 2022 | U5372268 | 1,052 | 199 | -853 | 96,720 | 5,288 | -91,432 |
| 2022 | U6735130 | 165 | 0 | -165 | 12,635 | 0 | -12,635 |
| 2022 | U7257686 | 243 | 0 | -243 | 104,049 | 0 | -104,049 |
| 2022 | U7953378 | 278 | 0 | -278 | 72,474 | 0 | -72,474 |
| 2023 | U5372268 | 926 | 365 | -561 | 10,785 | 6,840 | -3,945 |
| 2023 | U6735130 | 250 | 0 | -250 | 56,153 | 0 | -56,153 |
| 2023 | U7257686 | 379 | 0 | -379 | 180,160 | 0 | -180,160 |
| 2023 | U7953378 | 246 | 0 | -246 | 22,330 | 0 | -22,330 |
| 2024 | U5372268 | 299 | 333 | +34 | 24,721 | 15,800 | -8,921 |
| 2024 | U6735130 | 405 | 0 | -405 | 170,606 | 0 | -170,606 |
| 2024 | U7257686 | 442 | 0 | -442 | 18,450 | 0 | -18,450 |
| 2024 | U7953378 | 205 | 0 | -205 | 55,193 | 0 | -55,193 |
| 2025 | NULL | 0 | 1,182 | +1,182 | 0 | 111,024 | +111,024 |
| 2025 | U5372268 | 337 | 71 | -266 | 26,311 | 20,943 | -5,368 |
| 2025 | U6735130 | 644 | 455 | -189 | 345,563 | 323,175 | -22,389 |
| 2025 | U7257686 | 768 | 105 | -663 | 33,185 | 32,000 | -1,185 |
| 2025 | U7953378 | 143 | 90 | -53 | 19,637 | 14,515 | -5,122 |
| 2026 | 5WX76610 | 0 | 12 | +12 | 0 | 60 | +60 |
| 2026 | NULL | 0 | 370 | +370 | 0 | 61,605 | +61,605 |
| 2026 | U5372268 | 11 | 11 | +0 | 3,560 | 3,900 | +340 |
| 2026 | U6735130 | 239 | 260 | +21 | 148,974 | 200,417 | +51,442 |
| 2026 | U7257686 | 152 | 63 | -89 | 249 | 99 | -150 |
| 2026 | U7953378 | 67 | 69 | +2 | 9,972 | 10,575 | +603 |

### B.2 dividendos por cuenta (CSV)

Sólo CSV por cuenta — D1 está 100% NULL en `dividendos.account`.

| Año | Cuenta | CSV cnt | CSV $ |
|---|---|---:|---:|
| 2020 | U5372268 | 4 | 47 |
| 2021 | U5372268 | 31 | 465 |
| 2021 | U7257686 | 66 | 2,583 |
| 2021 | U7953378 | 11 | 245 |
| 2022 | U5372268 | 91 | 1,487 |
| 2022 | U6735130 | 236 | 6,579 |
| 2022 | U7257686 | 32 | 1,520 |
| 2022 | U7953378 | 18 | 407 |
| 2023 | U5372268 | 43 | 2,108 |
| 2023 | U6735130 | 391 | 11,782 |
| 2023 | U7257686 | 46 | 2,839 |
| 2023 | U7953378 | 7 | 501 |
| 2024 | U5372268 | 34 | 2,204 |
| 2024 | U6735130 | 546 | 26,582 |
| 2024 | U7257686 | 35 | 3,801 |
| 2024 | U7953378 | 15 | 5,058 |
| 2025 | U5372268 | 29 | 2,507 |
| 2025 | U6735130 | 341 | 30,528 |
| 2025 | U7257686 | 104 | 9,958 |
| 2025 | U7953378 | 497 | 16,855 |
| 2026 | U5372268 | 3 | 178 |
| 2026 | U6735130 | 113 | 20,179 |
| 2026 | U7257686 | 4 | 1,549 |
| 2026 | U7953378 | 60 | 2,311 |

## C. Transferencias

| Año | Cuenta | Tipo | CSV cnt | CSV $ | D1 cnt | D1 $ |
|---|---|---|---:|---:|---:|---:|
| 2020 | U5372268 | Deposits/Withdrawals | 12 | 56,815 | — | — |
| 2021 | U5372268 | Deposits/Withdrawals | 8 | 66,200 | — | — |
| 2021 | U6735130 | Deposits/Withdrawals | 7 | 57,000 | — | — |
| 2021 | U7257686 | Deposits/Withdrawals | 13 | 159,500 | — | — |
| 2021 | U7953378 | Deposits/Withdrawals | 9 | 60,400 | — | — |
| 2022 | U5372268 | Deposits/Withdrawals | 4 | 40,500 | — | — |
| 2022 | U6735130 | Deposits/Withdrawals | 1 | 7,000 | — | — |
| 2022 | U7257686 | Deposits/Withdrawals | 6 | 88,000 | — | — |
| 2022 | U7953378 | Deposits/Withdrawals | 7 | 74,200 | — | — |
| 2023 | U5372268 | Deposits/Withdrawals | 2 | 17,000 | — | — |
| 2023 | U6735130 | Deposits/Withdrawals | 6 | 83,200 | — | — |
| 2023 | U7257686 | Deposits/Withdrawals | 7 | 33,100 | — | — |
| 2023 | U7953378 | Deposits/Withdrawals | 2 | 27,000 | — | — |
| 2024 | U5372268 | Deposits/Withdrawals | 2 | 12,000 | — | — |
| 2024 | U6735130 | Deposits/Withdrawals | 13 | 85,100 | — | — |
| 2024 | U7257686 | Deposits/Withdrawals | 1 | 0 | — | — |
| 2024 | U7953378 | Deposits/Withdrawals | 1 | 0 | — | — |
| 2025 | U6735130 | Deposits/Withdrawals | 11 | 97,000 | — | — |
| 2025 | U7257686 | Deposits/Withdrawals | 1 | -0 | — | — |
| 2026 | U6735130 | Deposits/Withdrawals | 2 | 30,000 | — | — |
| 2026 | U6735130 | DEPOSIT (D1 only) | — | — | 1 | 8,000 |

**Totales:** CSV $994,015 en 115 txns vs D1 $8,000 en 1 txns.

## D. CSVs procesados

| Archivo | TRNT raw | CTRN raw | TRNT new (post-dedup) | CTRN new |
|---|---:|---:|---:|---:|
| `CLAUDE_FULL-4.csv` | 295 | 32 | 274 | 32 |
| `U5372268_multi4_20210103_20211231_AF_1436396_d1c94cdf5196f1f65472` | 2505 | 424 | 2294 | 424 |
| `U5372268_multi4_20220102_20221230_AF_1436396_bc95ea42c3f5d8be11f4` | 2151 | 1272 | 1739 | 1272 |
| `U5372268_multi4_20230102_20231231_AF_1436396_99600393af37cecc0bd1` | 2144 | 1842 | 1801 | 1842 |
| `U5372268_multi4_20240101_20241231_AF_1436396_99ddc7e4c31a034b0bac` | 1634 | 2308 | 1353 | 2308 |
| `U5372268_multi4_20250101_20251231_AF_1436396_0373255782bb36e2c460` | 2247 | 3150 | 1892 | 3150 |
| `U5372268_multi4_20250214_20260213_AS_Fv2_bf5916318d4c3e5c73c7f7ac` | 0 | 0 | 0 | 0 |
| `U5372268_multi4_20250501_20260430_AF_1436396_5297f965758462e28933` | 1801 | 3387 | 469 | 1844 |
| `U5372268_multi4_20250501_20260430_AF_1436396_e8839b850bcb4b92c6e0` | 1801 | 3387 | 0 | 0 |
| `U5372268_multi6_20200506_20210506_AF_NA_bddfc6054061ab41bb7097fc6` | 0 | 0 | 0 | 0 |
| `U5372268_multi6_20210506_20220506_AF_NA_9300b01c9eae0af7752b19af7` | 0 | 0 | 0 | 0 |
| `U5372268_multi6_20220508_20230508_AF_NA_2bf69598969e07ecc7051db71` | 0 | 0 | 0 | 0 |
| `U5372268_multi6_20230509_20240508_AF_NA_7daa56ed7c529f4a7a936ae15` | 0 | 0 | 0 | 0 |
| `U5372268_multi6_20240508_20250508_AF_NA_168d7864d189ecca227612217` | 0 | 0 | 0 | 0 |
| `U5372268_multi6_20250314_20260313_AF_NA_c8a0be996debe42d9da952d06` | 2008 | 3564 | 0 | 0 |
| `U5372268_multi6_20250509_20260313_AF_NA_834be45d8ec8ef70682b1bd72` | 0 | 0 | 0 | 0 |

## E. Diagnóstico

### Trades

- **Años con menos trades en D1 que en CSV**: 2020, 2021, 2022, 2023, 2024. Total faltante: ~6376 trades.
- **Años con más trades en D1 que en CSV**: 2026. Sobran: ~316. Pueden ser:
  - Splits/transformaciones registrados en D1 pero no como TRNT (e.g. corp actions).
  - Filas duplicadas por re-importes parciales (sin clave dedup `exec_id` o `ibOrderID`).
  - Trades manuales añadidos por la app (no via Flex).

### Dividendos

- **Años short en D1**: 2021, 2022, 2023, 2024, 2025. ~308 divs faltantes / ~$8,739.
- **Años con dups en D1**: 2026.

## F. Recomendaciones de arreglo

### F.1 Backfill `account` en `cost_basis` (3 469 NULL)
```bash
# Cambiar CSV_GLOB en scripts/backfill_account_from_csv.py de
#   ~/Downloads/U5372268_multi*.csv
# a
#   /Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/U5372268_multi4_*.csv
python3 scripts/backfill_account_from_csv.py        # dry-run
python3 scripts/backfill_account_from_csv.py --apply
```

### F.2 Backfill `account` en `dividendos` (todas NULL)
Hay que escribir un script gemelo al de cost_basis pero usando `(fecha, ticker, bruto)` como clave de match contra los CTRN de tipo Dividends. La key de los CSV ya está extraída en este audit (sección B.2).

### F.3 Trades faltantes/extras
- Para años con `-N en D1`: re-importar el CSV correspondiente vía `python3 scripts/flex_csv_to_d1.py /Users/ricardogarciaontoso/IA/AyR/data/flex-csvs/U5372268_multi4_<año>...csv`. El endpoint hace upsert con dedup por `(fecha, ticker, shares, precio, account)`.
- Para `+N en D1` (dups): identificar duplicados con
  ```sql
  SELECT fecha, ticker, shares, precio, COUNT(*) c, GROUP_CONCAT(id) ids
  FROM cost_basis WHERE tipo IN ('EQUITY','OPTION','BUY','SELL','FOREX')
  GROUP BY fecha, ticker, shares, precio HAVING c > 1;
  ```
  y borrar a mano tras revisar (`account` distinto sí es legítimo, mismo `account` no).

### F.4 Transferencias
- D1 sólo tiene 1 transferencia registrada. CSV tiene 115 (~$994,015). Crear un importer dedicado a `Deposits & Withdrawals` (CTRN type) y poblarlo. Para tu vista de Patrimonio/NAV histórico esto es importante.

### F.5 Pre-2021 en D1 sin CSV
- `cost_basis` tiene 1 fila en 2014 (`U5372268`) y otras pre-2020. No hay CSV de Flex para esa fecha. Si te molesta, descarga un Flex `2013–2019` desde IB y re-audita.

### F.6 Falta clave única IB en `cost_basis`
- `exec_id` existe en el schema pero se está ignorando. Ahora mismo NO hay forma robusta de dedup vía clave IB. Próximo refactor del importer: poblar `exec_id = ibOrderID + '/' + transactionID` en cada `INSERT`. Eso bloquearía los duplicados por construcción y haría futuras auditorías triviales.