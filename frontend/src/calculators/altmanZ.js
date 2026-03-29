import { div } from '../utils/formatters.js';

export function calcAltmanZ(data, mktCap) {
  if(!data || !data.revenue) return {score:null, items:[], zone:"—"};
  const totalAssets = (data.equity||0) + (data.totalDebt||0);
  if(totalAssets <= 0) return {score:null, items:[], zone:"—"};
  const workingCap = (data.cash||0) - (data.totalDebt * 0.3);
  const A = 1.2 * (workingCap / totalAssets);
  const B = 1.4 * ((data.retainedEarnings||0) / totalAssets);
  const C = 3.3 * ((data.operatingIncome||0) / totalAssets);
  const D = 0.6 * ((mktCap||0) / (data.totalDebt||1));
  const E = 1.0 * ((data.revenue||0) / totalAssets);
  const z = A + B + C + D + E;
  const items = [
    {name:"A: Working Cap / Assets",val:A/1.2,weighted:A,weight:1.2},
    {name:"B: Ret. Earnings / Assets",val:B/1.4,weighted:B,weight:1.4},
    {name:"C: EBIT / Assets",val:C/3.3,weighted:C,weight:3.3},
    {name:"D: Mkt Cap / Total Debt",val:D/0.6,weighted:D,weight:0.6},
    {name:"E: Sales / Assets",val:E/1.0,weighted:E,weight:1.0},
  ];
  const zone = z > 2.99 ? "Segura" : z > 1.81 ? "Gris" : "Peligro";
  const zoneColor = z > 2.99 ? "var(--green)" : z > 1.81 ? "var(--yellow)" : "var(--red)";
  return {score:z, items, zone, zoneColor};
}
