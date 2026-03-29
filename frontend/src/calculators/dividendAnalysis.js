import { div } from '../utils/formatters.js';

export function calcDividendAnalysis(fin, comp, YEARS) {
  const yrs = YEARS.filter(y=>fin[y]?.dps>0);
  if(yrs.length < 2) return {streak:0, cagr3:null, cagr5:null, cagr10:null, payoutFCF:null, payoutEarnings:null, yieldOnCost:null, years:yrs};

  let streak = 0;
  for(const y of YEARS) {
    if(fin[y]?.dps > 0) streak++; else break;
  }

  const cf = (end,start,n) => (end>0&&start>0&&n>0) ? Math.pow(end/start,1/n)-1 : null;
  const cagr3 = yrs.length>=4 ? cf(fin[yrs[0]]?.dps, fin[yrs[3]]?.dps, 3) : null;
  const cagr5 = yrs.length>=6 ? cf(fin[yrs[0]]?.dps, fin[yrs[5]]?.dps, 5) : null;
  const cagr10 = yrs.length>=11 ? cf(fin[yrs[0]]?.dps, fin[yrs[10]]?.dps, 10) : null;

  const latestDivYear = YEARS.find(y => fin[y]?.revenue > 0) || YEARS[0];
  const latest = fin[latestDivYear];
  const latestComp = comp[latestDivYear];
  const payoutFCF = latestComp?.fcf > 0 ? (latest?.dps * latest?.sharesOut) / latestComp.fcf : null;
  const payoutEarnings = latest?.netIncome > 0 ? (latest?.dps * latest?.sharesOut) / latest.netIncome : null;

  return {streak, cagr3, cagr5, cagr10, payoutFCF, payoutEarnings, years:yrs};
}
