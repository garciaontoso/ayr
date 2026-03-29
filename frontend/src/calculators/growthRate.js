import { div } from '../utils/formatters.js';

export function calcGrowthRate(data) {
  const roe = div(data.netIncome, data.equity);
  const payoutRatio = (data.dps * data.sharesOut) / (data.netIncome || 1);
  const retentionRate = Math.max(0, 1 - payoutRatio);
  const sustainableGrowth = (roe || 0) * retentionRate;
  return {sustainableGrowth, roe, retentionRate, payoutRatio};
}
