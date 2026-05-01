# Overnight Audit 1 — D1 Schema Integrity (2026-05-02)

Scope: 97 tables. Focus on user-facing critical: cost_basis, dividendos, transferencias, positions, open_trades, options_trades, gastos, patrimonio, nlv_history, alerts, fundamentals, earnings_documents, agent_*, auto_*.

DB: `aar-finanzas` (d9dc97c1-1ea5-4e05-b637-89e52229d099). Size: ~61.4 MB.

---

## Per-table summary

| Table | Rows | Dups (natural key) | NULL critical cols | Notes |
|---|---|---|---|---|
| **cost_basis** | 12,221 | **0 real** (805 by ticker+fecha+strikes are legit IB fills, distinct exec_id) | 1,797 NULL exec_id (legacy pre-IB), 808 NULL account (pending backfill 7942), 7 rows with fecha='' | UNIQUE on exec_id active. Healthy. |
| **dividendos** | 3,748 | 0 (UNIQUE idx active) | 1,658 NULL account (44%), 791 NULL/0 neto, 10 NULL/0 bruto | Bruto=0 + neto>0 likely import bug — list in MED. |
| **transferencias** | 156 | 0 (1 same-day diff flex_id = legit) | 0 NULL flex_id duplicates | Healthy. |
| **positions** | 85 | 0 by ticker | **All 85 NULL account** — column exists but never populated | Column dead unless multi-account UI imminent. |
| **open_trades** | 4 | 0 | n/a | Tiny table, healthy. |
| **options_trades** | 2,127 | **314 by trade_date+strikes** — confirmed false dups from re-import (LEAPS&CALLS 25 + LEAPS&CALLS 26 same trades) | 0 NULL account | MED — needs sheet-aware dedup. |
| **gastos** | 6,384 | 4 (different categoria) | 0 | LOW — 4 likely double-entries on same date+amount+desc. |
| **patrimonio** | 54 | 0 | 0 | UNIQUE on fecha added. |
| **nlv_history** | 25 | 0 | 0 | UNIQUE on (fecha,accounts) added. |
| **alerts** | 68 | 0 | 0 | Healthy. |
| **fundamentals** | 348 | 12 by ticker | 0 | MED — 12 ticker dups (FMP cache stale rows). |
| **earnings_documents** | 7,821→**7,403** | **418 by accession_number** — exact dups (same r2_key, source_url) | 0 | **FIXED — deduplicated this run.** |
| **deep_extractions** | 5 | 3 by ticker+doc+fy+fq | 0 | LOW — 3 dup analysis rows. |
| **cash_balances** | 91 | 0 by (fecha,cuenta,divisa) | 0 | UNIQUE added. |
| **margin_interest** | 5 | 0 by (mes,cuenta,divisa) | 0 | UNIQUE added. |
| **quality_safety_scores** | 77 | 0 | 0 | autoindex_1 active. |
| **agent_insights** | 1,713 | 0 by (ticker, created_at, agent) | 0 | Healthy. |
| **agent_predictions** | 861 | n/a | n/a (idx active) | Healthy. |
| **company_narratives** | 144 | n/a | n/a | Healthy. |
| **auto_signals** | 0 | n/a | n/a | Empty. |
| **auto_close_alerts** | 3 | 0 | 0 | Tiny. |
| **fishing_orders** | n/a | n/a | n/a | Tiny. |
| **scanner_runs** | 0 | n/a | n/a | Empty. |

---

## Date/value outliers

- `cost_basis.fecha = ''` — **7 rows** (GOOGL 100sh, NET.UN 1000sh have real data; 5 OPTION rows are zero-coste phantoms). MED.
- `dividendos.bruto = 0 AND neto > 0` — 10 rows BIZD/QQQX/ECC: import bug (only USD-net populated). MED.
- `positions.shares = 0` — 2 rows (BX, MO). LOW — closed but kept for historical reference; verify intent.
- `cost_basis.shares < 0 AND tipo = 'OPTION'` — 5,096 rows. **NOT a bug** — short option contracts represent negative position. Expected.
- `fundamentals` has 12 rows where same ticker appears multiple times. MED.

---

## Orphan / FK-like findings

- **dividendos**: 192 distinct tickers with NO matching `positions.ticker`. Most are sold-out positions (legit historical records), but worth eyeballing.
- **cost_basis**: 542 distinct EQUITY tickers (via underlying) with NO matching `positions`. Most = closed positions (legit).
- No real orphan rows requiring deletion; pure data audit.

---

## Indexes added this run (LOW-risk, applied)

```sql
CREATE UNIQUE INDEX idx_ed_accession ON earnings_documents(ticker, accession_number);
CREATE UNIQUE INDEX idx_patrimonio_fecha_unique ON patrimonio(fecha);
CREATE UNIQUE INDEX idx_nlv_history_fecha_accounts ON nlv_history(fecha, accounts);
CREATE UNIQUE INDEX idx_cash_balances_unique ON cash_balances(fecha, cuenta, divisa);
CREATE UNIQUE INDEX idx_margin_interest_unique ON margin_interest(mes, cuenta, divisa);
CREATE UNIQUE INDEX idx_transf_flex_id ON transferencias(flex_id) WHERE flex_id IS NOT NULL;
DROP INDEX idx_dividendos_fecha;          -- duplicate of idx_div_fecha
DROP INDEX idx_dividendos_ticker;         -- duplicate of idx_div_ticker
```

## Dedup operations applied (LOW-risk, applied)

```sql
-- earnings_documents: 418 exact dups (same accession_number, r2_key, source_url) deleted
DELETE FROM earnings_documents WHERE id NOT IN (
  SELECT MIN(id) FROM earnings_documents GROUP BY ticker, accession_number
);
-- Result: 7,821 → 7,403 rows. 418 deleted.
```

---

## Pending operations (MED/HIGH risk — see scripts/audit-1-fixes.sql)

| # | Operation | Risk | Estimated impact |
|---|---|---|---|
| 1 | Dedup options_trades (Excel sheet re-import) | **MED** | ~157 rows to delete (314 dups / 2 sheets) |
| 2 | Dedup fundamentals (12 ticker dups) | LOW-MED | 12 rows |
| 3 | Dedup deep_extractions (3 per ticker+fy+fq) | LOW | 3 rows |
| 4 | Fix dividendos.bruto = 0 (set bruto = neto / 0.85 approx) | MED | 10 rows; needs verification |
| 5 | Fix cost_basis.fecha = '' rows | **MED** | 7 rows (2 with real shares, 5 phantom OPTION) |
| 6 | Backfill positions.account from cost_basis ticker→account map | MED | 85 rows |
| 7 | Backfill dividendos.account where NULL (1,658 rows) | MED | needs CLAUDE.md mentioned re-import 365d |
| 8 | Decide: keep BX/MO positions with shares=0? | LOW | 2 rows |
| 9 | Investigate 4 gastos same-day same-amount dups (real?) | LOW | 4 rows |

---

## Risk assessment summary

- **HIGH risk findings: 0**. No active corruption, no missing exec_id UNIQUE, no orphan rows breaking joins.
- **MED risk findings: 6** (options_trades sheet dups, fundamentals dups, fecha='' rows, account backfill, bruto=0 fixup, positions.account dead column).
- **LOW risk findings: 4** (gastos near-dups, deep_extractions dups, BX/MO 0-share, dropped duplicate indexes).
- **Indexes added: 6 + 1 partial.** Index dups dropped: 2.
- **Rows deleted: 418** (earnings_documents exact dups).

## Cost_basis is healthy

Despite 805 rows matching by (ticker, fecha, tipo, shares, precio, opt_strike, opt_expiry), every group has DISTINCT exec_id values — these are legitimate IB partial fills. The new UNIQUE INDEX `idx_cb_exec_id` (added 2026-05-01) is doing its job correctly.

## What yesterday's cost_basis 9,891 phantom dup likely was

Pre-UNIQUE-INDEX state allowed re-imports of the same Flex XML to insert the same exec_id N times. After the fix, no re-insert is possible. Pattern is now CONTAINED.
