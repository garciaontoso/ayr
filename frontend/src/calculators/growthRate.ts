import { div } from '../utils/formatters';
import type { FinancialsYear } from '../types';

export interface GrowthRateInputs extends FinancialsYear {
  dps?: number;
  sharesOut?: number;
  netIncome?: number;
}

export interface GrowthRateResult {
  sustainableGrowth: number;
  roe: number | null;
  retentionRate: number;
  payoutRatio: number;
}

export function calcGrowthRate(data: GrowthRateInputs): GrowthRateResult {
  const roe = div(data.netIncome, data.equity);
  const payoutRatio = ((data.dps ?? 0) * (data.sharesOut ?? 0)) / (data.netIncome || 1);
  const retentionRate = Math.max(0, 1 - payoutRatio);
  const sustainableGrowth = (roe || 0) * retentionRate;
  return {sustainableGrowth, roe, retentionRate, payoutRatio};
}
