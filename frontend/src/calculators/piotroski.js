import { div } from '../utils/formatters.js';

export function calcPiotroski(curr, prev) {
  if(!curr || !prev) return {score:0, items:[]};
  const items = [];
  const roaC = div(curr.netIncome, (curr.equity+curr.totalDebt));
  const roaP = div(prev.netIncome, (prev.equity+prev.totalDebt));
  const crC = div((curr.cash||0), (curr.totalDebt||1));
  const crP = div((prev.cash||0), (prev.totalDebt||1));
  const gmC = div(curr.grossProfit, curr.revenue);
  const gmP = div(prev.grossProfit, prev.revenue);
  const atC = div(curr.revenue, (curr.equity+curr.totalDebt));
  const atP = div(prev.revenue, (prev.equity+prev.totalDebt));

  const add = (name,pass,desc) => items.push({name,pass,desc});
  add("ROA positivo", roaC>0, "Beneficio neto / Activos > 0");
  add("OCF positivo", curr.ocf>0, "Flujo de caja operativo > 0");
  add("ROA creciente", roaC>roaP, "ROA mejora vs año anterior");
  add("OCF > Net Income", curr.ocf > curr.netIncome, "Calidad de beneficios");
  add("Deuda decreciente", curr.totalDebt < prev.totalDebt, "La deuda disminuye");
  add("Liquidez mejora", crC > crP, "Ratio de liquidez mejora");
  add("Sin dilución", curr.sharesOut <= prev.sharesOut, "No se emiten acciones nuevas");
  add("Margen bruto mejora", gmC > gmP, "Margen bruto crece");
  add("Rotación activos mejora", atC > atP, "Eficiencia de activos mejora");

  return {score: items.filter(x=>x.pass).length, items};
}
