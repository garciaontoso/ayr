import { div } from '../utils/formatters';
import type { FinancialsYear, PiotroskiResult, PiotroskiItem } from '../types';

export function calcPiotroski(
  curr: FinancialsYear | null | undefined,
  prev: FinancialsYear | null | undefined,
): PiotroskiResult {
  if(!curr || !prev) return {score:0, items:[]};
  const items: PiotroskiItem[] = [];
  const roaC = div(curr.netIncome, ((curr.equity||0)+(curr.totalDebt||0)));
  const roaP = div(prev.netIncome, ((prev.equity||0)+(prev.totalDebt||0)));
  const crC = div((curr.cash||0), (curr.totalDebt||1));
  const crP = div((prev.cash||0), (prev.totalDebt||1));
  const gmC = div(curr.grossProfit, curr.revenue);
  const gmP = div(prev.grossProfit, prev.revenue);
  const atC = div(curr.revenue, ((curr.equity||0)+(curr.totalDebt||0)));
  const atP = div(prev.revenue, ((prev.equity||0)+(prev.totalDebt||0)));

  const add = (name: string, pass: boolean, desc: string) => items.push({name, pass, desc});
  add("ROA positivo", (roaC ?? 0) > 0, "Beneficio neto / Activos > 0");
  add("OCF positivo", (curr.ocf ?? 0) > 0, "Flujo de caja operativo > 0");
  add("ROA creciente", (roaC ?? 0) > (roaP ?? 0), "ROA mejora vs año anterior");
  add("OCF > Net Income", (curr.ocf ?? 0) > (curr.netIncome ?? 0), "Calidad de beneficios");
  add("Deuda decreciente", (curr.totalDebt ?? 0) < (prev.totalDebt ?? 0), "La deuda disminuye");
  add("Liquidez mejora", (crC ?? 0) > (crP ?? 0), "Ratio de liquidez mejora");
  add("Sin dilución", (curr.sharesOut ?? 0) <= (prev.sharesOut ?? 0), "No se emiten acciones nuevas");
  add("Margen bruto mejora", (gmC ?? 0) > (gmP ?? 0), "Margen bruto crece");
  add("Rotación activos mejora", (atC ?? 0) > (atP ?? 0), "Eficiencia de activos mejora");

  return {score: items.filter(x=>x.pass).length, items};
}
