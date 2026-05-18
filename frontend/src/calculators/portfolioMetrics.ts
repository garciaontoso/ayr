// portfolioMetrics.ts — agregaciones de cartera multi-cuenta + multi-currency.
//
// Bugs evitados (catalogados en docs/bug-patterns.md):
//   • Bug #002 — running balance per-account confunde con global. Sumar siempre.
//   • Bug #014 — market_value en moneda nativa × 7.78 para HKG inflando peso.
//     SIEMPRE usar usd_value para weights / NAV / concentración.
//   • Bug GBX /100 — pence británico necesita división explícita antes de FX.
//   • Bug multi-account avgCost — promedio simple en lugar de pondrado por shares.
//   • Bug RED currency='USD' inicial — UPSERT no actualiza currency.

import type { Position } from '../types';

export interface PositionRow extends Position {
  market_value?: number;    // En moneda nativa — NO usar para weights
  usd_value?: number;        // En USD — ÚNICA fuente verdad para weights
  pnl?: number;
  pnlPct?: number;
}

export interface PortfolioWeightResult {
  ticker: string;
  weight: number;            // Fracción 0..1
  weightPct: number;         // Porcentaje 0..100 (display)
  usdValue: number;
}

/**
 * Pesos de cartera. SIEMPRE usar usd_value, nunca market_value.
 *
 * @param positions Array de posiciones con usd_value poblado.
 * @returns Array ordenado descendente por peso.
 */
export function calcPortfolioWeights(positions: ReadonlyArray<PositionRow>): PortfolioWeightResult[] {
  if (!positions || positions.length === 0) return [];
  const total = positions.reduce((s, p) => s + (p.usd_value || 0), 0);
  if (total <= 0) return positions.map(p => ({
    ticker: p.ticker, weight: 0, weightPct: 0, usdValue: p.usd_value || 0,
  }));
  return positions
    .map(p => ({
      ticker: p.ticker,
      usdValue: p.usd_value || 0,
      weight: (p.usd_value || 0) / total,
      weightPct: ((p.usd_value || 0) / total) * 100,
    }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Concentración por categoría (sector / currency / country).
 * Mismo principio: solo usd_value.
 */
export function calcConcentrationBy<K extends string>(
  positions: ReadonlyArray<PositionRow>,
  keyFn: (p: PositionRow) => K | null | undefined,
): Record<K, number> {
  const buckets = {} as Record<K, number>;
  const total = positions.reduce((s, p) => s + (p.usd_value || 0), 0);
  if (total <= 0) return buckets;
  for (const p of positions) {
    const k = keyFn(p);
    if (!k) continue;
    buckets[k] = (buckets[k] || 0) + ((p.usd_value || 0) / total);
  }
  return buckets;
}

/**
 * Avg cost ponderado por shares al fusionar misma posición desde varias cuentas.
 *
 * Bug evitado: si haces (a.avgCost + b.avgCost) / 2 con shares dispares (100 vs 5)
 * te da un avg que no refleja realidad. Hay que ponderar por shares.
 */
export function mergeWeightedAvgCost(
  existingShares: number, existingAvgCost: number,
  newShares: number, newAvgCost: number,
): { shares: number; avgCost: number } {
  const totalShares = (existingShares || 0) + (newShares || 0);
  if (totalShares <= 0) {
    // Si la suma neta es 0 (vendidas todas) o negativa (short), devolvemos
    // valores defensivos en lugar de NaN.
    return { shares: totalShares, avgCost: existingAvgCost || newAvgCost || 0 };
  }
  const weighted = (existingAvgCost || 0) * (existingShares || 0) +
                   (newAvgCost || 0) * (newShares || 0);
  return { shares: totalShares, avgCost: weighted / totalShares };
}

/**
 * Fusiona varias filas de la misma posición (mismo ticker, cuentas distintas).
 * Suma shares, market_value, usd_value; calcula avgCost ponderado.
 */
export function mergePositionRows(
  positions: ReadonlyArray<PositionRow>,
): PositionRow | null {
  if (!positions || positions.length === 0) return null;
  if (positions.length === 1) return { ...positions[0] };

  let totalShares = 0;
  let weightedCostSum = 0;
  let totalUsdValue = 0;
  let totalMarketValue = 0;
  let totalPnl = 0;

  for (const p of positions) {
    const sh = p.shares || 0;
    const ac = p.avgCost || 0;
    totalShares += sh;
    weightedCostSum += sh * ac;
    totalUsdValue += p.usd_value || 0;
    totalMarketValue += p.market_value || 0;
    totalPnl += p.pnl || 0;
  }

  const avgCost = totalShares > 0 ? weightedCostSum / totalShares : (positions[0].avgCost || 0);
  const costBasis = totalShares * avgCost;
  const pnlPct = costBasis > 0 ? totalPnl / costBasis : 0;

  // Preserva el primer ticker/name/currency/sector — todos deben ser iguales.
  const first = positions[0];
  return {
    ...first,
    shares: totalShares,
    avgCost,
    market_value: totalMarketValue,
    usd_value: totalUsdValue,
    pnl: totalPnl,
    pnlPct,
    account: null,  // merged = no single account
  };
}

/**
 * Convierte importe de moneda nativa a USD respetando GBX (pence × /100 antes).
 *
 * fxRates es {USD:1, EUR:0.92, GBP:0.79, ...} — todos relativos a USD.
 * GBX no aparece en fxRates: tratarlo como GBP/100.
 */
export function toUsd(amount: number, currency: string, fxRates: Record<string, number> | null | undefined): number {
  if (!isFinite(amount)) return 0;
  if (!currency || currency === 'USD') return amount;
  if (!fxRates) return amount;  // No conversion possible, return as-is

  let adjAmount = amount;
  let adjCurrency = currency;
  if (currency === 'GBX') {
    adjAmount = amount / 100;
    adjCurrency = 'GBP';
  }
  const rate = fxRates[adjCurrency];
  if (!rate || rate <= 0) return amount;  // Fallback: assume same currency
  return adjAmount / rate;
}

/**
 * Total invertido en USD. Suma cost_basis (shares × avgCost) convertida desde moneda nativa.
 *
 * @param positions Posiciones con shares, avgCost, currency.
 * @param fxRates Tasas {USD, EUR, GBP, ...}.
 * @returns Total en USD.
 */
export function calcTotalInvertidoUsd(
  positions: ReadonlyArray<PositionRow>,
  fxRates: Record<string, number> | null | undefined,
): number {
  if (!positions || positions.length === 0) return 0;
  return positions.reduce((sum, p) => {
    const sh = p.shares || 0;
    if (sh <= 0) return sum;  // Saltar shorts o filas vacías
    const ac = p.avgCost || 0;
    const native = sh * ac;
    return sum + toUsd(native, p.currency || 'USD', fxRates);
  }, 0);
}

/**
 * Detecta inconsistencias entre usd_value computado y el que viene del worker.
 * Útil para audit / health check.
 *
 * @returns Array de tickers donde la diferencia > 5%.
 */
export function detectFxInconsistencies(
  positions: ReadonlyArray<PositionRow>,
  fxRates: Record<string, number> | null | undefined,
): Array<{ ticker: string; reportedUsd: number; computedUsd: number; deltaPct: number }> {
  if (!positions || !fxRates) return [];
  const out: Array<{ ticker: string; reportedUsd: number; computedUsd: number; deltaPct: number }> = [];
  for (const p of positions) {
    if (!p.market_value || !p.currency || !p.usd_value) continue;
    const expected = toUsd(p.market_value, p.currency, fxRates);
    if (expected <= 0) continue;
    const diff = Math.abs(expected - p.usd_value) / expected;
    if (diff > 0.05) {
      out.push({
        ticker: p.ticker,
        reportedUsd: p.usd_value,
        computedUsd: expected,
        deltaPct: diff * 100,
      });
    }
  }
  return out;
}
