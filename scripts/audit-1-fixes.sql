-- Audit Overnight 1 — MED/HIGH-risk pending fixes (review before applying)
-- Generated 2026-05-02
-- Apply with: npx wrangler d1 execute aar-finanzas --remote --file=scripts/audit-1-fixes.sql
-- Or run blocks individually after manual SELECT review.

-- ============================================================================
-- FIX 1 (MED): Dedup options_trades — 314 false dups from re-imported Excel sheets
-- Cause: same trades imported from "LEAPS & CALLS 25" and "LEAPS & CALLS 26"
-- Strategy: keep MIN(id) per (underlying, trade_date, short_strike, long_strike, expiration_date, account, source_col)
-- VERIFY FIRST:
--   SELECT underlying, trade_date, short_strike, long_strike, expiration_date, account, source_col, COUNT(*) c
--   FROM options_trades GROUP BY 1,2,3,4,5,6,7 HAVING c > 1 ORDER BY c DESC LIMIT 30;
-- THEN APPLY:
DELETE FROM options_trades WHERE id NOT IN (
  SELECT MIN(id) FROM options_trades
  GROUP BY underlying, trade_date,
           COALESCE(short_strike, ''),
           COALESCE(long_strike, ''),
           COALESCE(expiration_date, ''),
           COALESCE(account, ''),
           COALESCE(source_col, -1)
);
-- Then add UNIQUE INDEX:
CREATE UNIQUE INDEX IF NOT EXISTS idx_ot_unique ON options_trades(
  underlying, trade_date,
  COALESCE(short_strike, 0),
  COALESCE(long_strike, 0),
  COALESCE(expiration_date, ''),
  COALESCE(account, ''),
  COALESCE(source_col, -1)
);

-- ============================================================================
-- FIX 2 (LOW-MED): Dedup fundamentals — 12 ticker dups (FMP cache duplicates)
-- VERIFY:
--   SELECT symbol, COUNT(*) FROM fundamentals GROUP BY symbol HAVING COUNT(*) > 1;
-- APPLY (keep most-recent updated_at):
DELETE FROM fundamentals WHERE rowid NOT IN (
  SELECT rowid FROM fundamentals f1
  WHERE updated_at = (SELECT MAX(updated_at) FROM fundamentals f2 WHERE f2.symbol = f1.symbol)
  GROUP BY symbol
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fundamentals_symbol ON fundamentals(symbol);

-- ============================================================================
-- FIX 3 (LOW): Dedup deep_extractions — 3 dup analysis rows per ticker+fy+fq
-- VERIFY:
--   SELECT ticker, doc_type, fiscal_year, fiscal_quarter, COUNT(*) FROM deep_extractions
--   GROUP BY 1,2,3,4 HAVING COUNT(*) > 1;
-- APPLY:
DELETE FROM deep_extractions WHERE id NOT IN (
  SELECT MIN(id) FROM deep_extractions
  GROUP BY ticker, doc_type, fiscal_year, fiscal_quarter
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_de_unique ON deep_extractions(ticker, doc_type, fiscal_year, fiscal_quarter);

-- ============================================================================
-- FIX 4 (MED): Investigate dividendos with bruto=0 but neto>0 (10 rows, BIZD/QQQX/ECC)
-- This is symptom of bug in old IB Flex import where only "Amount" (=net for some
-- distribution types) was captured, not "Gross Amount".
-- VERIFY first by ticker:
--   SELECT id, ticker, fecha, bruto, neto, broker FROM dividendos WHERE bruto = 0 OR bruto IS NULL;
-- BIZD/ECC are ETFs (no withholding usually) so neto≈bruto in many jurisdictions.
-- For US tax resident: spain_rate=15% applied → bruto = neto / 0.85
-- For China (user): no Spain WHT → bruto = neto (already net of US 10% per US-CN treaty)
-- MANUAL DECISION REQUIRED — do NOT auto-fix without confirmation.
-- Conservative option (set bruto = neto, i.e. assume neto already withheld):
-- UPDATE dividendos SET bruto = neto WHERE bruto = 0 OR bruto IS NULL;

-- ============================================================================
-- FIX 5 (MED): cost_basis.fecha = '' — 7 rows
-- IDs 4693 (GOOGL 100sh @ $101) and 5491 (NET.UN 1000sh @ $6.80) have real data,
-- need date research from broker. The other 5 (3697, 4010, 4698, 5352, 6630) are
-- OPTION rows with shares=0, precio=0, coste=0 — phantom rows from broken parser.
-- VERIFY:
--   SELECT id, ticker, fecha, tipo, shares, precio, coste FROM cost_basis WHERE fecha = '';
-- APPLY phantom delete only:
DELETE FROM cost_basis
 WHERE fecha = '' AND tipo = 'OPTION'
   AND shares = 0 AND precio = 0 AND coste = 0;
-- For the 2 EQUITY rows with real data: research dates manually from IB statements,
-- then UPDATE cost_basis SET fecha = '<correct-date>' WHERE id IN (4693, 5491);

-- ============================================================================
-- FIX 6 (MED): Backfill positions.account — currently 100% NULL across 85 rows
-- Source: cost_basis has account populated. Pick latest non-null account per ticker.
-- VERIFY first:
--   SELECT p.ticker, (SELECT account FROM cost_basis cb WHERE cb.ticker=p.ticker AND cb.account IS NOT NULL ORDER BY cb.fecha DESC LIMIT 1) acc
--   FROM positions p WHERE p.ticker IN (SELECT DISTINCT ticker FROM cost_basis WHERE account IS NOT NULL);
-- APPLY:
UPDATE positions
SET account = (
  SELECT account FROM cost_basis cb
  WHERE cb.ticker = positions.ticker
    AND cb.account IS NOT NULL
  ORDER BY cb.fecha DESC LIMIT 1
)
WHERE account IS NULL;

-- ============================================================================
-- FIX 7 (HIGH): Backfill dividendos.account NULL — 1,658 rows (44%)
-- This is the same problem mentioned in CLAUDE.md "backfill account 7942 NULL".
-- Should be done via Flex re-import (365d window) — DO NOT manually update,
-- because account assignment depends on which IBKR account paid the dividend.
-- Run: scripts/backfill_dividendos_account.py (already exists)

-- ============================================================================
-- FIX 8 (LOW): positions with shares=0 (BX, MO) — decide intent
-- These are closed positions kept for historical reference. If frontend filters
-- shares > 0, harmless. If not, hides cleanup.
-- VERIFY:
--   SELECT ticker, name, shares, last_price, market_value FROM positions WHERE shares = 0;
-- DECISION: leave as-is unless they cause UI noise.

-- ============================================================================
-- FIX 9 (LOW): gastos — 4 same-day same-amount near-dups
-- VERIFY:
--   SELECT fecha, importe, descripcion, COUNT(*) c FROM gastos
--   GROUP BY fecha, importe, descripcion, categoria HAVING c > 1;
-- These could be legit (e.g., 2 separate $-15 expenses on 2026-04-06 with desc="TRA")
-- or accidental double-entry. Manual review only — do NOT auto-delete.

-- ============================================================================
-- VERIFICATION post-apply
SELECT 'options_trades' tbl, COUNT(*) c FROM options_trades
UNION ALL SELECT 'fundamentals', COUNT(*) FROM fundamentals
UNION ALL SELECT 'deep_extractions', COUNT(*) FROM deep_extractions
UNION ALL SELECT 'cost_basis', COUNT(*) FROM cost_basis
UNION ALL SELECT 'positions', COUNT(*) FROM positions
UNION ALL SELECT 'dividendos', COUNT(*) FROM dividendos;
