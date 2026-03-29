import { div } from '../utils/formatters.js';

export function calcWACC(data) {
  const {equity, totalDebt, interestExpense, taxRate=0.25, beta=1.0, riskFreeRate=0.04, marketPremium=0.055} = data;
  const E = equity || 1;
  const D = totalDebt || 0;
  const V = E + D;
  const costEquity = riskFreeRate + beta * marketPremium;
  const costDebt = D > 0 ? div(interestExpense, D) || 0.04 : 0.04;
  const wacc = (E/V) * costEquity + (D/V) * costDebt * (1 - taxRate);
  return {wacc, costEquity, costDebt: costDebt*(1-taxRate), weightE: E/V, weightD: D/V};
}
