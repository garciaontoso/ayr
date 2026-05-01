-- audit-B-fixes.sql
-- Generated: 2026-05-02
-- SAFE fixes only. Manual-review items are commented out.
-- Run with: cd api && npx wrangler d1 execute aar-finanzas --remote --file=../scripts/audit-B-fixes.sql

-- =============================================================================
-- FIX 1: IIPR-PRA shares undercount (CRITICAL)
-- positions.shares = 200 but ib_shares = 400 and cost_basis SUM = 400
-- Market value correction: $21.76 × 400 = $8,704 (was $4,352)
-- =============================================================================
UPDATE positions
SET shares      = 400,
    market_value = 400 * 21.76,
    usd_value    = 400 * 21.76,
    pnl_abs      = (400 * 21.76) - (400 * 25.2325),
    pnl_pct      = ((21.76 / 25.2325) - 1) * 100,
    updated_at   = datetime('now')
WHERE ticker = 'IIPR-PRA'
  AND shares = 200;   -- guard: only applies if still at 200

-- =============================================================================
-- FIX 2: ZTS cost_basis — coste sign error on one NULL-account row
-- Row: shares=50, precio=113.99, coste=+5700.50 (positive = wrong for a BUY)
-- Correct: coste should be -5700.50
-- =============================================================================
UPDATE cost_basis
SET coste = -5700.50015
WHERE ticker = 'ZTS'
  AND tipo = 'EQUITY'
  AND shares = 50
  AND precio = 113.99
  AND account IS NULL
  AND coste > 0;   -- guard: only fix if still positive

-- =============================================================================
-- FIX 3: LSEG NULL-account precio 10x error
-- Row: shares=100, precio=8.57, coste=-904.14, account=NULL
-- Should be: precio=85.70, coste=-8617.14 (the U6735130 rows confirm £85.7/share)
-- NOTE: total_invested on the positions row will need recalculation separately.
-- =============================================================================
UPDATE cost_basis
SET precio = 85.70,
    coste  = -8570.00
WHERE ticker = 'LSEG'
  AND tipo = 'EQUITY'
  AND shares = 100
  AND account IS NULL
  AND ABS(precio - 8.57) < 0.01;  -- guard

-- =============================================================================
-- FIX 4: IIPR PRA → IIPR-PRA ticker normalization (space → hyphen)
-- 4 rows in cost_basis with "IIPR PRA" (space) are orphaned from "IIPR-PRA"
-- =============================================================================
UPDATE cost_basis
SET ticker = 'IIPR-PRA'
WHERE ticker = 'IIPR PRA'
  AND tipo = 'EQUITY';

-- =============================================================================
-- MANUAL REVIEW ITEMS (commented out — verify before running)
-- =============================================================================

-- FIX 5 (VERIFY FIRST): AZJ positions.shares = 12000, ib+cb = 6000 each.
-- If AZJ is ONLY in account U6735130 (6000 shares), then positions.shares is DOUBLED.
-- Uncomment only after confirming via IB portal:
-- UPDATE positions SET shares=6000, market_value=6000*4.06, usd_value=6000*4.06*0.7177 WHERE ticker='AZJ' AND shares=12000;

-- FIX 6 (VERIFY FIRST): GQG same 2x issue (4000 vs 2000)
-- UPDATE positions SET shares=2000, market_value=2000*1.785, usd_value=2000*1.785*0.7177 WHERE ticker='GQG' AND shares=4000;

-- FIX 7 (VERIFY FIRST): DIVO same 2x issue (1400 vs 700)
-- UPDATE positions SET shares=700, market_value=700*45.02, usd_value=700*45.02 WHERE ticker='DIVO' AND shares=1400;

-- FIX 8 (VERIFY FIRST): SUI — 100 shares in positions, 0 in ib and cb.
-- May be a stale manual entry. Verify before zeroing out.
-- UPDATE positions SET shares=0 WHERE ticker='SUI' AND ib_shares=0;

