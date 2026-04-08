// ─────────────────────────────────────────────────────────────
// useMonthlyExpenses — single source of truth for canonical monthly
// expenses, expressed as annualized USD for FIRE calculations.
//
// Reads `GASTOS_MONTH` from HomeContext, which is keyed by YYYY-MM and
// each value has shape { eur, cny, usd, total? }. The hook averages the
// last 12 months and converts each currency bucket to USD using the
// inverse FX rates from useFxRates.
//
// Why fixed 12m and not user-selectable: FIRE planning needs stability.
// GastosTab still has its own user-controllable 3/6/12m toggle for the
// expense exploration UI — don't migrate that. This hook is the
// canonical "annualGastosUSD" for FIRE/Dashboard calcs.
//
// Returns:
//   monthlyAvgUSD  — mean of last 12 months in USD
//   annualUSD      — monthlyAvgUSD * 12
//   monthsCounted  — actual number of months that contributed (may be < 12)
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';

export function useMonthlyExpenses({ gastosMonth, fx } = {}) {
  return useMemo(() => {
    const usdEur = fx?.usdEur || 1.14;
    const usdCny = fx?.usdCny || 1 / 7.24;

    const months = Object.keys(gastosMonth || {}).sort().slice(-12);
    if (!months.length) {
      return { monthlyAvgUSD: 0, annualUSD: 0, monthsCounted: 0 };
    }

    const sum = months.reduce((s, m) => {
      const d = gastosMonth[m] || {};
      return s + (d.eur || 0) * usdEur + (d.cny || 0) * usdCny + (d.usd || 0);
    }, 0);

    const monthlyAvgUSD = sum / months.length;
    return {
      monthlyAvgUSD,
      annualUSD: monthlyAvgUSD * 12,
      monthsCounted: months.length,
    };
  }, [gastosMonth, fx?.usdEur, fx?.usdCny]);
}

export default useMonthlyExpenses;
