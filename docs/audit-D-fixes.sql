-- ============================================================
-- audit-D-fixes.sql — RISKY operations from audit 2026-05-02
-- Apply manually with: wrangler d1 execute aar-finanzas --remote --file=audit-D-fixes.sql
-- ALWAYS: take a snapshot first (wrangler d1 export) and review diffs.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Reconcile positions.shares from positions.ib_shares
--    Reason: positions.shares is 2-3x inflated vs IB ground truth.
--    SCHD shares=13750 vs ib_shares=6000; UNH 340 vs 100; etc.
--    Effect: total NAV from sum(usd_value) drops $3.4M → $1.38M (real).
-- ─────────────────────────────────────────────────────────────

-- Preview (run before UPDATE to count affected):
-- SELECT COUNT(*) FROM positions WHERE ib_shares > 0 AND ABS(shares - ib_shares) > 0.5;

UPDATE positions
SET shares       = ib_shares,
    market_value = ROUND(ib_shares * last_price, 2),
    usd_value    = ROUND(ib_shares * last_price * COALESCE(fx, 1), 2),
    updated_at   = datetime('now')
WHERE ib_shares > 0
  AND ABS(shares - ib_shares) > 0.5;

-- ─────────────────────────────────────────────────────────────
-- 2. Recompute positions.pnl_abs (was stale, used wrong total_invested)
--    pnl_pct already correct: (last_price - avg_price)/avg_price
--    Recompute pnl_abs = (last_price - avg_price) * shares  AFTER step 1
-- ─────────────────────────────────────────────────────────────

UPDATE positions
SET pnl_abs    = ROUND((last_price - avg_price) * shares * COALESCE(fx, 1), 2),
    pnl_pct    = CASE WHEN avg_price > 0 THEN (last_price - avg_price) / avg_price ELSE 0 END,
    updated_at = datetime('now')
WHERE shares > 0
  AND avg_price > 0;

-- ─────────────────────────────────────────────────────────────
-- 3. Recompute positions.total_invested = avg_price * shares (cost basis)
--    Was stale and broke pnl computations. After this, total_invested
--    represents the dollar amount currently invested at avg cost.
-- ─────────────────────────────────────────────────────────────

UPDATE positions
SET total_invested = ROUND(avg_price * shares * COALESCE(fx, 1), 2),
    cost_basis     = avg_price,
    updated_at     = datetime('now')
WHERE shares > 0
  AND avg_price > 0;

-- ─────────────────────────────────────────────────────────────
-- 4. Reclassify forex pairs out of cost_basis tipo='EQUITY'
--    Currently 277 forex/bond rows pollute EQUITY queries.
--    Move forex to tipo='FOREX', bonds to tipo='BOND'.
-- ─────────────────────────────────────────────────────────────

-- Forex pairs (USD.HKD, EUR.USD, GBP.USD, etc.)
UPDATE cost_basis
SET tipo = 'FOREX'
WHERE tipo = 'EQUITY'
  AND ticker GLOB '[A-Z][A-Z][A-Z].[A-Z][A-Z][A-Z]'
  AND ticker IN (
    'USD.HKD','USD.CAD','USD.EUR','USD.GBP','USD.JPY','USD.AUD','USD.CHF','USD.SGD','USD.PLN','USD.CNH',
    'EUR.USD','EUR.HKD','EUR.GBP','EUR.CAD','EUR.AUD','EUR.JPY','EUR.CHF','EUR.SEK','EUR.NOK','EUR.DKK',
    'GBP.USD','GBP.EUR','GBP.HKD','GBP.AUD','GBP.JPY',
    'CAD.USD','CAD.EUR',
    'HKD.USD','HKD.EUR',
    'AUD.USD','AUD.EUR',
    'JPY.USD','JPY.EUR',
    'CHF.USD','CHF.EUR'
  );

-- Bonds (T-notes / treasuries with fractional rate format)
UPDATE cost_basis
SET tipo = 'BOND'
WHERE tipo = 'EQUITY'
  AND (
    ticker GLOB '* */* */*'        -- "T 3 7/8 02/15/43" pattern
    OR ticker LIKE 'T %'            -- treasuries
    OR ticker LIKE 'B %'
  )
  AND ticker NOT GLOB '[A-Z]*';     -- safety: don't catch single-letter tickers

-- ─────────────────────────────────────────────────────────────
-- 5. Backfill positions.account from cost_basis (best-effort)
--    Currently all 81 positions have account=NULL.
--    Use most-frequent account in cost_basis trades for that ticker.
-- ─────────────────────────────────────────────────────────────

UPDATE positions
SET account = (
  SELECT account
  FROM cost_basis cb
  WHERE cb.ticker = positions.ticker
    AND cb.tipo = 'EQUITY'
    AND cb.account IS NOT NULL
  GROUP BY account
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE account IS NULL
  AND shares > 0;

-- ─────────────────────────────────────────────────────────────
-- 6. (NOT applied — requires schema alter, propose for v4.4)
--    Add nlv_history.interpolated flag to mark backfilled gaps.
--    For now we DON'T fill gaps — risk of fake data.
-- ─────────────────────────────────────────────────────────────

-- ALTER TABLE nlv_history ADD COLUMN interpolated INTEGER DEFAULT 0;

-- ─────────────────────────────────────────────────────────────
-- 7. (NOT applied) WHT backfill for 2025 IB rows missing wht_amount
--    Risky: doesn't account for tax-exempt entities (REITs, K-1 partnerships).
--    Surface in dashboard instead, let user fix manually.
-- ─────────────────────────────────────────────────────────────

-- VERIFICATION QUERIES (run after step 1-3 to confirm fix worked):
-- SELECT 'positions sum_usd' as src, ROUND(SUM(usd_value),0) v FROM positions WHERE shares>0
-- UNION ALL SELECT 'NLV latest', ROUND(positions_value,0) FROM nlv_history ORDER BY fecha DESC LIMIT 1;
-- Both should be ~$1.4M after fixes.
