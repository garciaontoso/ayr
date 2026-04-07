// ─────────────────────────────────────────────────────────────
// useFireMetrics — single source of truth for FIRE numbers.
//
// Consolidates 4 previously-divergent calculations from:
//   - FireTab        (canonical: 3.5% SWR + multi-currency gastos + IB NLV)
//   - DividendosTab  (was hardcoded $3500/mo)
//   - PatrimonioTab  (was gastos/retorno%, a different concept)
//   - DashboardTab   (only renders FIRE_PROJ from API; no local formula)
//
// Assumptions for the user:
//   - Chinese tax resident, 10% US WHT on dividends → use NET dividends
//   - SWR = 3.5% (more conservative than 4% Trinity, accounts for early FIRE)
//   - FIRE target = annual expenses / SWR  (== expenses × ~28.6)
//   - Years-to-FIRE assumes 7% real portfolio growth + current savings rate
//
// All inputs are in USD unless noted. Currency conversion is the
// caller's responsibility (FireTab does it before calling).
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';

export const FIRE_SWR = 0.035;        // 3.5% safe withdrawal rate
export const FIRE_GROWTH = 0.07;      // 7% real return assumption for projection

export function useFireMetrics({
  // Net liquidation value (USD)
  nlv = 0,
  // Annual expenses (USD) — already converted to USD by caller
  annualExpenses = 0,
  // Annual NET dividends (USD) — already after WHT
  annualDividendsNet = 0,
  // Monthly cash flow available for saving (div + salary - gastos), USD
  monthlySavings = 0,
  // Optional override for SWR (default 3.5%)
  swr = FIRE_SWR,
  // Optional override for assumed real return when projecting yearsToFire
  growth = FIRE_GROWTH,
} = {}) {
  return useMemo(() => {
    const safeNlv = Number(nlv) || 0;
    const safeExp = Number(annualExpenses) || 0;
    const safeDiv = Number(annualDividendsNet) || 0;
    const safeSav = Number(monthlySavings) || 0;
    const safeSwr = swr > 0 ? swr : FIRE_SWR;

    // FIRE target = expenses / SWR  (≡ expenses × 28.57 at 3.5%)
    const fireTarget = safeExp > 0 ? safeExp / safeSwr : 0;

    // Progress as a fraction (0..1) and percent (0..100+)
    const currentProgress = fireTarget > 0 ? safeNlv / fireTarget : 0;
    const progressPct = currentProgress * 100;

    // Coverage from dividends today (annual div / annual expenses)
    const coverageFromDividends = safeExp > 0 ? safeDiv / safeExp : 0;
    const coveragePct = coverageFromDividends * 100;

    // Monthly dividend income required to cover expenses outright
    const monthlyDivNeeded = safeExp / 12;

    // Years to FIRE: iterate forward until pat * SWR >= expenses
    let yearsToFire = 0;
    if (safeExp <= 0 || safeNlv <= 0) {
      yearsToFire = 99;
    } else if (safeNlv >= fireTarget) {
      yearsToFire = 0;
    } else {
      let p = safeNlv;
      yearsToFire = 99;
      for (let y = 1; y <= 50; y++) {
        p = p * (1 + growth) + safeSav * 12;
        if (p * safeSwr >= safeExp) { yearsToFire = y; break; }
      }
    }

    return {
      // Inputs (echoed for consumers that just want the canonical value)
      nlv: safeNlv,
      annualExpenses: safeExp,
      annualDividendsNet: safeDiv,
      // Core outputs
      fireTarget,
      currentProgress,        // 0..1+
      progressPct,            // 0..100+
      coverageFromDividends,  // 0..1+
      coveragePct,            // 0..100+
      monthlyDivNeeded,
      yearsToFire,
      swr: safeSwr,
    };
  }, [nlv, annualExpenses, annualDividendsNet, monthlySavings, swr, growth]);
}

export default useFireMetrics;
