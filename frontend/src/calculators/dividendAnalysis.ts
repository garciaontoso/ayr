import type { DividendAnalysisResult, FinancialsByYear } from '../types';

export function calcDividendAnalysis(
  fin: FinancialsByYear,
  comp: FinancialsByYear,
  YEARS: Array<number | string>,
): DividendAnalysisResult {
  // Tests pass YEARS as string keys; runtime accepts number keys via FinancialsByYear.
  // Cast to any in indexed access to preserve the original duck-typed lookups.
  const finAny = fin as Record<string | number, { dps?: number; revenue?: number; netIncome?: number; sharesOut?: number; fcf?: number } | undefined>;
  const compAny = comp as Record<string | number, { dps?: number; revenue?: number; netIncome?: number; sharesOut?: number; fcf?: number } | undefined>;

  const yrs = YEARS.filter(y => (finAny[y as any]?.dps ?? 0) > 0);
  if(yrs.length < 2) return {streak:0, cagr3:null, cagr5:null, cagr10:null, payoutFCF:null, payoutEarnings:null, yieldOnCost:null, years: yrs as number[]};

  let streak = 0;
  for(const y of YEARS) {
    if((finAny[y as any]?.dps ?? 0) > 0) streak++; else break;
  }

  const cf = (end?: number, start?: number, n?: number): number | null =>
    (end !== undefined && start !== undefined && n !== undefined && end>0 && start>0 && n>0)
      ? Math.pow(end/start, 1/n) - 1
      : null;
  const cagr3 = yrs.length>=4 ? cf(finAny[yrs[0] as any]?.dps, finAny[yrs[3] as any]?.dps, 3) : null;
  const cagr5 = yrs.length>=6 ? cf(finAny[yrs[0] as any]?.dps, finAny[yrs[5] as any]?.dps, 5) : null;
  const cagr10 = yrs.length>=11 ? cf(finAny[yrs[0] as any]?.dps, finAny[yrs[10] as any]?.dps, 10) : null;

  const latestDivYear = YEARS.find(y => (finAny[y as any]?.revenue ?? 0) > 0) ?? YEARS[0];
  const latest = finAny[latestDivYear as any];
  const latestComp = compAny[latestDivYear as any];
  const payoutFCF = (latestComp?.fcf ?? 0) > 0
    ? ((latest?.dps ?? 0) * (latest?.sharesOut ?? 0)) / (latestComp!.fcf as number)
    : null;
  const payoutEarnings = (latest?.netIncome ?? 0) > 0
    ? ((latest?.dps ?? 0) * (latest?.sharesOut ?? 0)) / (latest!.netIncome as number)
    : null;

  return {streak, cagr3, cagr5, cagr10, payoutFCF, payoutEarnings, years: yrs as number[]};
}
