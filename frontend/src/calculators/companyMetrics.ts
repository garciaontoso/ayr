// companyMetrics.ts — cálculos financieros core con manejo robusto
// de REITs, BDCs y casos de equity negativo.
//
// Reglas duras de signos (FMP /stable schema, validadas 2026-05-03):
//   • commonDividendsPaid: negativo en cash flow = pago. Math.abs() para exposición.
//   • capitalExpenditure: negativo en cash flow = inversión. Math.abs() para exposición.
//   • interestExpense: positivo en income statement = gasto.
//   • netDebtIssuance: negativo = neto pagado. Sólo cuenta como repayment si < 0.
//   • acquisitionsNet: negativo = neto comprado. Sólo cuenta como acquisition si < 0
//     (positivo significa neto VENDIDO — desinversión).
//
// Bugs evitados (catalogados en docs/bug-patterns.md):
//   • EBITDA proxy: REITs/BDCs tienen OperatingIncome bajo por D&A pesado →
//     EV/EBITDA explota → usar proxy (OCF + interestExpense) cuando contable
//     no llega al 10% revenue.
//   • Retained FCF negativo permitido: Math.max(0, retained) escondía
//     empresas que pagan más en divs+buybacks+debt que su FCF (Phil Town red flag).
//   • ROE/P/B con equity negativo: dividir por negativo da nº absurdos.
//     Devolver null mejor que ±999%.

export interface FinYearData {
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  eps?: number;
  ocf?: number;
  capex?: number;
  interestExpense?: number;
  depreciation?: number;
  taxProvision?: number;
  totalDebt?: number;
  cash?: number;
  equity?: number;
  retainedEarnings?: number;
  dividendsPaid?: number;  // Ya con Math.abs() aplicado upstream
  buybacks?: number;        // Ya con Math.abs() aplicado upstream
  debtRepayment?: number;   // Solo NET repayments (issuance < 0)
  acquisitions?: number;    // Solo NET acquisitions (acquisitionsNet < 0)
  sharesOut?: number;
  dps?: number;
}

export interface EbitdaResult {
  ebitda: number;
  source: 'accounting' | 'proxy' | 'unknown';
  ebitdaAccounting: number;  // operatingIncome + depreciation
  ebitdaProxy: number;        // ocf + interestExpense
}

/**
 * EBITDA robusto. Para REITs/BDCs el contable colapsa por D&A pesado,
 * usamos OCF + interestExpense como proxy estándar S&P.
 *
 * Regla: si accounting <= 0 OR < 10% revenue Y proxy > 0 → usar proxy.
 */
export function calcEbitdaRobust(d: FinYearData): EbitdaResult {
  const opInc = d.operatingIncome || 0;
  const da = d.depreciation || 0;
  const ocf = d.ocf || 0;
  const ie = d.interestExpense || 0;
  const rev = d.revenue || 0;

  const ebitdaAccounting = opInc + da;
  const ebitdaProxy = ocf + ie;

  // Si revenue es 0 (datos vacíos), devolvemos accounting=proxy=0
  if (rev <= 0 && ebitdaAccounting <= 0 && ebitdaProxy <= 0) {
    return { ebitda: 0, source: 'unknown', ebitdaAccounting: 0, ebitdaProxy: 0 };
  }

  const accountingTooLow = ebitdaAccounting <= 0 ||
    (rev > 0 && ebitdaAccounting / rev < 0.10);
  const useProxy = accountingTooLow && ebitdaProxy > 0;

  return {
    ebitda: useProxy ? ebitdaProxy : ebitdaAccounting,
    source: useProxy ? 'proxy' : 'accounting',
    ebitdaAccounting,
    ebitdaProxy,
  };
}

export interface FcfAllocationResult {
  fcf: number;
  divs: number;
  buybacks: number;
  debtPaydown: number;
  acquisitions: number;
  retained: number;          // PUEDE SER NEGATIVO (Phil Town señal)
  totalDistributed: number;
  payoutPctOfFcf: number | null;
  overdistributing: boolean;  // total > fcf
}

/**
 * Allocation de FCF a divs / buybacks / debt / acquisitions / retained.
 *
 * IMPORTANTE: retained PUEDE SER NEGATIVO. Si lo recortamos con Math.max(0, ...)
 * ocultamos empresas que están financiando distribuciones con deuda (Phil Town
 * "ROE artificial" patrón). El consumidor debe pintarlo en rojo en UI si <0.
 */
export function calcFcfAllocation(d: FinYearData): FcfAllocationResult {
  const ocf = d.ocf || 0;
  const capex = d.capex || 0;
  const fcf = ocf - capex;

  const divs = d.dividendsPaid || 0;
  const buybacks = d.buybacks || 0;
  const debtPaydown = d.debtRepayment || 0;
  const acquisitions = d.acquisitions || 0;

  const totalDistributed = divs + buybacks + debtPaydown + acquisitions;
  // NO Math.max(0, …) — permitir negativo
  const retained = fcf - totalDistributed;

  const payoutPctOfFcf = fcf > 0 ? totalDistributed / fcf : null;
  const overdistributing = fcf > 0 && totalDistributed > fcf;

  return { fcf, divs, buybacks, debtPaydown, acquisitions, retained,
           totalDistributed, payoutPctOfFcf, overdistributing };
}

/**
 * ROE / P/B / similar protegidos contra equity negativo o cero.
 * Devuelve null en lugar de ±Infinity / NaN.
 */
export function calcRoeSafe(netIncome: number | null | undefined, equity: number | null | undefined): number | null {
  if (netIncome == null || equity == null) return null;
  if (!isFinite(netIncome) || !isFinite(equity)) return null;
  if (equity <= 0) return null;  // MCD, BA, HD pattern
  return netIncome / equity;
}

export function calcPbSafe(price: number, sharesOut: number, equity: number | null | undefined): number | null {
  if (!equity || equity <= 0) return null;
  if (!sharesOut || sharesOut <= 0) return null;
  const bvps = equity / sharesOut;
  if (bvps <= 0) return null;
  return price / bvps;
}

/**
 * ROIC con avg invested capital (estándar GuruFocus/Morningstar).
 * Devuelve null si avg invested capital <= 0.
 */
export function calcRoicSafe(
  curr: FinYearData,
  prev: FinYearData | null | undefined,
  taxRatePct: number,
): number | null {
  if (!curr.operatingIncome || curr.operatingIncome <= 0) return null;
  const ndCurr = (curr.totalDebt || 0) - (curr.cash || 0);
  const invCapCurr = (curr.equity || 0) + ndCurr;
  const ndPrev = prev ? (prev.totalDebt || 0) - (prev.cash || 0) : null;
  const invCapPrev = prev?.equity != null && ndPrev != null
    ? (prev.equity || 0) + ndPrev
    : null;
  const avgInvCap = invCapPrev != null ? (invCapCurr + invCapPrev) / 2 : invCapCurr;
  if (avgInvCap <= 0) return null;
  const taxRate = taxRatePct / 100;
  return (curr.operatingIncome * (1 - taxRate)) / avgInvCap;
}

/**
 * Coverage ratio FCF / dividendsPaid. Para REITs usar AFFO si disponible.
 * Devuelve null si denominador no positivo.
 */
export function calcFcfDivCoverage(fcf: number | null, dividendsPaid: number | null): number | null {
  if (fcf == null || dividendsPaid == null) return null;
  if (dividendsPaid <= 0) return null;
  return fcf / dividendsPaid;
}

/**
 * Yield-on-cost. CRÍTICO: usar adjustedBasis (avg después de splits y todos los reinvest)
 * NO el avgCost raw que IB reporta.
 */
export function calcYoc(annualDps: number, adjustedBasis: number | null | undefined): number | null {
  if (!annualDps || !adjustedBasis || adjustedBasis <= 0) return null;
  return annualDps / adjustedBasis;
}

/**
 * Net debt = totalDebt − cash. Convención positiva = empresa con deuda neta;
 * negativa = empresa con net cash (Apple, Berkshire, etc.).
 */
export function calcNetDebt(totalDebt: number | null | undefined, cash: number | null | undefined): number {
  return (totalDebt || 0) - (cash || 0);
}

export function isNetCash(d: FinYearData): boolean {
  return calcNetDebt(d.totalDebt, d.cash) < 0;
}
