import { div } from '../utils/formatters';
import type { WaccInputs, WaccResult } from '../types';

// 2026-05-03: WACC sanity-floor cost of debt to risk-free rate.
// Reason: companies that issued debt mid-year show interestExpense / totalDebt
// far below their actual coupons (ZTS = 243M / 9,493M = 2.56% — vs real
// coupons 4-5%). Combined with market-equity weighting that's already low
// for buyback-heavy names, WACC collapsed below 4% → DCF intrinsic value
// exploded ($1229 vs FMP $142). Floor pre-tax cost of debt at riskFreeRate.
export function calcWACC(data: WaccInputs): WaccResult {
  const {equity, totalDebt, interestExpense, taxRate=0.25, beta=1.0, riskFreeRate=0.04, marketPremium=0.055} = data;
  const E = equity || 1;
  const D = totalDebt || 0;
  const V = E + D;
  const costEquity = riskFreeRate + beta * marketPremium;
  const observedCostDebt = D > 0 ? (div(interestExpense, D) || 0.04) : 0.04;
  // Floor at risk-free rate — corporate debt cannot rationally trade below
  // sovereigns. Cap at 12% to ignore obvious data errors.
  const costDebt = Math.min(0.12, Math.max(observedCostDebt, riskFreeRate));
  const wacc = (E/V) * costEquity + (D/V) * costDebt * (1 - taxRate);
  return {wacc, costEquity, costDebt: costDebt*(1-taxRate), weightE: E/V, weightD: D/V};
}
