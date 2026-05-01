-- ============================================================================
-- audit-C-fixes.sql · 2026-05-02
-- Auto-fixes from audit-C-options-2026-05-02.md
--
-- AUTO-APPLIED (this script):
--   1. DELETE 1 fully-empty cost_basis OPT row (id=5359, LUV, all-zero filler)
--
-- DEFERRED / NOT auto-applied (review manually before running these):
--   - The 14 SPX/NVDA "broken-parser" cost_basis rows ($-83K total credit)
--     They have shares!=0 and real opt_credit_total values, but missing
--     opt_strike/opt_tipo/opt_expiry. Likely Eurex/EUREX-formatted contracts
--     that the OCC parser dropped. Need a re-parser or manual classification.
--     Listed for review in section "RISKY MANUAL FIXES" below.
--
--   - 3 open_trades rows from auto_tastytrade (RUTW BPS 2026-05-01/05-08/05-22)
--     2026-05-01 BPS expired today but settlement state unknown — DO NOT
--     auto-close until TT bridge confirms or user reviews.
--
--   - 1 options_trades row with column-slip corruption (id=1137, status field
--     contains a date instead of a status code).
--
--   - 62 options_trades rows where the trade is marked CLOSED/EXPIRED/...
--     but cost_basis still has SUM(shares)!=0 for the matching strike/expiry.
--     Likely cost_basis import missed the close fill. Re-import IB Flex.
--
--   - 1 broken `P 1500P 2026-06-19` cost_basis row (id=14857-ish from Eurex
--     contract `P HMI2 20260619 1500 M`) — underlying parsed as `P` instead
--     of HMI/HMI2.
-- ============================================================================

-- 1. Delete fully-empty LUV filler row (zero shares, zero credit, zero everything)
--    Verified UNIQUE: only 1 row matches all-zero pattern.
DELETE FROM cost_basis
WHERE id = 5359
  AND tipo = 'OPTION'
  AND shares = 0
  AND opt_credit_total = 0
  AND coste = 0;

-- ============================================================================
-- RISKY MANUAL FIXES (NOT auto-executed) — review with user first
-- ============================================================================

-- A. Fix the 1 column-slip in options_trades id=1137 (PYPL ROP 2024-12-05).
--    `status` got the date "2025-01-03T00:00:00", `result_date` got "-0.528"
--    (which was the closing debit). Trade closed 2025-01-03 with $-52.80 debit.
-- UPDATE options_trades
--   SET status = 'CLOSED',
--       result_date = '2025-01-03',
--       closing_debit = -52.80,
--       total_debit = -5280
-- WHERE id = 1137;

-- B. Optionally re-parse SPX/NVDA broken rows (would require a separate script
--    to derive opt_strike / opt_tipo / opt_expiry from IB Flex source by exec_id).
--    Affected ids: 14848, 14849, 14850, 14851, 14853, 14854, 14855, 14856,
--                  14857, 14858, 14859, 14860, 14862, 14863
--    Total credit impact: $-83,157 (currently distorts cost_basis totals).

-- C. Optionally fix the malformed Eurex contract:
--    "P HMI2 20260619 1500 M" — should map to HMI underlying (Hannover Re),
--    not Pinterest 'P'. Need IB ticker map review.

-- D. To set 2026-05-01 RUTW BPS open_trades closed_at AFTER user confirms
--    settlement (do NOT run blindly):
-- UPDATE open_trades
--   SET closed_at = '2026-05-01 21:00:00',
--       close_reason = 'EXPIRED',
--       realized_pnl = 380   -- credit_open × contracts × 100 (380.00)
-- WHERE trade_hash = '0e26bd89a08f112349d39c72ec1113b466e58c9e'
--   AND closed_at IS NULL;
