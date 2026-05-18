// rentabilidad10y.ts — modelo Phil Town / Lowell Miller / Gorka.
//
// Plantilla original: Excel "Archivo Rentabilidad-2.xlsx" enviado por Gorka 2026-05-18.
// Documento de referencia: docs/RENTABILIDAD-TAB-PLAN.md
//
// Inputs:
//   Histórico 10y de revenue, eps, dps, equity, retainedEarnings, totalAssets
//   Cotización actual
//   Crecimiento esperado BPA (con escenarios +1.5%, base, -1.5%)
//   Rango múltiplos P/E (deprimido / normal / caliente)
//
// Outputs:
//   CAGR 10y cada serie
//   Coeficiente Habilidad = ΔBPA_10y / Σ retenidos (BPA−DPA por año)
//   BPA proyectado 10y × 3 escenarios
//   Precio futuro 10y × 3 múltiplos = matriz 3×3
//   Retorno total (CAGR precio + yield_actual)
//
// Convención de orden: arrays INDEX 0 = año MÁS RECIENTE (igual que el endpoint
// /api/rentabilidad/historicals). El cálculo invierte donde haga falta.

export interface RentabilidadInputs {
  // Series 10y descending (index 0 = más reciente, index 9 = -10y)
  revenue: ReadonlyArray<number | null>;
  eps: ReadonlyArray<number | null>;
  dps: ReadonlyArray<number | null>;
  equity: ReadonlyArray<number | null>;
  retEarnings: ReadonlyArray<number | null>;
  assets: ReadonlyArray<number | null>;
  // Año actual y cotización
  currentPrice: number;
  // Asunciones de proyección (en %)
  growthBasePct: number;     // p.ej. 5 = 5% (Gorka default)
  growthRangePct?: number;   // p.ej. 1.5 → ±1.5pp (positivo / negativo)
  // Múltiplos P/E
  peLow: number;             // Deprimido
  peMid: number;             // Normal
  peHigh: number;            // Caliente
}

export interface CagrResult {
  revenue: number | null;
  eps: number | null;
  dps: number | null;
  equity: number | null;
  retEarnings: number | null;
  assets: number | null;
}

export interface RentabilidadOutputs {
  cagr: CagrResult;
  coefHabilidad: number | null;     // ΔBPA / Σ retenidos
  retainedSum: number | null;        // Σ (eps − dps) histórico
  bpaDelta: number | null;           // eps_0 − eps_-10
  // Proyección 10y, index 0 = año +1, index 9 = año +10
  bpaProyectado: {
    negativo: number[];              // g − 1.5pp
    normal: number[];                // g
    positivo: number[];              // g + 1.5pp
  };
  precioFuturo10y: {
    // [escenario][múltiplo]
    deprimido: { negativo: number; normal: number; positivo: number };
    normal:    { negativo: number; normal: number; positivo: number };
    caliente:  { negativo: number; normal: number; positivo: number };
  };
  retornoEsperado10y: {
    // CAGR precio (sin div) | retorno total (con yield) [9 outputs por matriz]
    cagrPrecio: { deprimido: ScenarioReturns; normal: ScenarioReturns; caliente: ScenarioReturns };
    retornoTotal: { deprimido: ScenarioReturns; normal: ScenarioReturns; caliente: ScenarioReturns };
  };
  yieldActual: number | null;        // dps_0 / currentPrice
  peActual: number | null;           // currentPrice / eps_0
  // Diagnósticos
  warnings: string[];
}

export interface ScenarioReturns {
  negativo: number;
  normal: number;
  positivo: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * CAGR entre primer y último valor disponible de un array.
 * Asume arr[0] = más reciente, arr[length-1] = más antiguo.
 * Devuelve null si no hay suficientes puntos o si signos cambian (no aplicable).
 */
export function calcCAGR(arr: ReadonlyArray<number | null>): number | null {
  if (!arr || arr.length < 2) return null;
  // Encontrar primer y último no-null
  let recent: number | null = null;
  let oldest: number | null = null;
  let recentIdx = -1;
  let oldestIdx = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] != null && isFinite(arr[i] as number)) {
      recent = arr[i] as number;
      recentIdx = i;
      break;
    }
  }
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null && isFinite(arr[i] as number)) {
      oldest = arr[i] as number;
      oldestIdx = i;
      break;
    }
  }
  if (recent == null || oldest == null || recentIdx === oldestIdx) return null;
  // Signo: CAGR sólo bien definido si ambos signos iguales y >0
  if (recent <= 0 || oldest <= 0) return null;
  const years = oldestIdx - recentIdx;
  return Math.pow(recent / oldest, 1 / years) - 1;
}

/**
 * Coeficiente Habilidad Phil Town = ΔBPA_10y / Σ retenidos.
 * Mide cuánto BPA genera por cada $ retenido (BPA−DPA por año).
 * >0.15 excelente, 0.10-0.15 bueno, <0.05 débil.
 */
export function calcCoefHabilidad(
  eps: ReadonlyArray<number | null>,
  dps: ReadonlyArray<number | null>,
): { coef: number | null; retainedSum: number | null; bpaDelta: number | null } {
  // ΔBPA = eps[0] − eps[last]
  const recentEps = eps.find(v => v != null && isFinite(v as number));
  const oldestEps = [...eps].reverse().find(v => v != null && isFinite(v as number));
  if (recentEps == null || oldestEps == null) return { coef: null, retainedSum: null, bpaDelta: null };
  const bpaDelta = (recentEps as number) - (oldestEps as number);

  // Σ retenidos = Σ (eps_i − dps_i) para cada año donde ambos exist
  let retainedSum = 0;
  let n = 0;
  for (let i = 0; i < Math.max(eps.length, dps.length); i++) {
    const e = eps[i];
    const d = dps[i];
    if (e == null || !isFinite(e as number)) continue;
    const dVal = (d == null || !isFinite(d as number)) ? 0 : (d as number);
    retainedSum += (e as number) - dVal;
    n++;
  }
  if (n < 2 || retainedSum <= 0) return { coef: null, retainedSum, bpaDelta };
  return { coef: bpaDelta / retainedSum, retainedSum, bpaDelta };
}

/**
 * Proyecta BPA 10y aplicando crecimiento compuesto.
 * Devuelve array index 0 = año +1, ..., index 9 = año +10.
 */
export function projectBpa(epsBase: number, growthPct: number, years: number = 10): number[] {
  if (!isFinite(epsBase) || epsBase <= 0) return new Array(years).fill(0);
  const g = growthPct / 100;
  const out: number[] = [];
  let v = epsBase;
  for (let i = 0; i < years; i++) {
    v = v * (1 + g);
    out.push(v);
  }
  return out;
}

/**
 * CAGR precio futuro vs precio actual.
 * (precioFuturo / precioActual)^(1/años) − 1
 */
export function calcCagrPrecio(precioFuturo: number, precioActual: number, years: number = 10): number {
  if (precioActual <= 0 || precioFuturo <= 0) return 0;
  return Math.pow(precioFuturo / precioActual, 1 / years) - 1;
}

// ─── Cálculo principal ───────────────────────────────────────────────────

export function calcRentabilidad10y(inputs: RentabilidadInputs): RentabilidadOutputs {
  const warnings: string[] = [];
  const range = inputs.growthRangePct ?? 1.5;

  // CAGR de cada serie histórica
  const cagr: CagrResult = {
    revenue: calcCAGR(inputs.revenue),
    eps: calcCAGR(inputs.eps),
    dps: calcCAGR(inputs.dps),
    equity: calcCAGR(inputs.equity),
    retEarnings: calcCAGR(inputs.retEarnings),
    assets: calcCAGR(inputs.assets),
  };
  if (cagr.eps == null) warnings.push('CAGR EPS no calculable — algún año tiene EPS ≤ 0 o falta dato');
  if (cagr.equity == null) warnings.push('CAGR equity no calculable — posible equity negativo (MCD/BA/HD pattern)');

  // Coeficiente Habilidad
  const ch = calcCoefHabilidad(inputs.eps, inputs.dps);
  if (ch.coef == null) warnings.push('Coeficiente Habilidad no calculable — falta EPS histórico o todo distribuido');

  // BPA base = eps año actual (primer no-null)
  const epsActual = inputs.eps.find(v => v != null && isFinite(v as number)) as number | undefined;
  const dpsActual = inputs.dps.find(v => v != null && isFinite(v as number)) as number | undefined;

  if (epsActual == null) {
    warnings.push('EPS año actual no disponible — proyección imposible');
    return {
      cagr, coefHabilidad: ch.coef, retainedSum: ch.retainedSum, bpaDelta: ch.bpaDelta,
      bpaProyectado: { negativo: [], normal: [], positivo: [] },
      precioFuturo10y: emptyMatrix(),
      retornoEsperado10y: { cagrPrecio: emptyMatrix(), retornoTotal: emptyMatrix() },
      yieldActual: null, peActual: null, warnings,
    };
  }

  // Proyección 3 escenarios
  const bpaProyectado = {
    negativo: projectBpa(epsActual, inputs.growthBasePct - range),
    normal:   projectBpa(epsActual, inputs.growthBasePct),
    positivo: projectBpa(epsActual, inputs.growthBasePct + range),
  };

  // Precio futuro año 10 = BPA año 10 × múltiplo
  const bpa10Negativo = bpaProyectado.negativo[9] || 0;
  const bpa10Normal = bpaProyectado.normal[9] || 0;
  const bpa10Positivo = bpaProyectado.positivo[9] || 0;

  const precioFuturo10y = {
    deprimido: {
      negativo: bpa10Negativo * inputs.peLow,
      normal:   bpa10Normal * inputs.peLow,
      positivo: bpa10Positivo * inputs.peLow,
    },
    normal: {
      negativo: bpa10Negativo * inputs.peMid,
      normal:   bpa10Normal * inputs.peMid,
      positivo: bpa10Positivo * inputs.peMid,
    },
    caliente: {
      negativo: bpa10Negativo * inputs.peHigh,
      normal:   bpa10Normal * inputs.peHigh,
      positivo: bpa10Positivo * inputs.peHigh,
    },
  };

  // CAGR precio + yield = retorno total
  const yieldActual = (dpsActual != null && inputs.currentPrice > 0)
    ? (dpsActual as number) / inputs.currentPrice
    : null;
  const peActual = inputs.currentPrice > 0 && epsActual > 0
    ? inputs.currentPrice / epsActual
    : null;

  const cagrM = (precioFut: number) => calcCagrPrecio(precioFut, inputs.currentPrice);

  const cagrPrecio = {
    deprimido: {
      negativo: cagrM(precioFuturo10y.deprimido.negativo),
      normal:   cagrM(precioFuturo10y.deprimido.normal),
      positivo: cagrM(precioFuturo10y.deprimido.positivo),
    },
    normal: {
      negativo: cagrM(precioFuturo10y.normal.negativo),
      normal:   cagrM(precioFuturo10y.normal.normal),
      positivo: cagrM(precioFuturo10y.normal.positivo),
    },
    caliente: {
      negativo: cagrM(precioFuturo10y.caliente.negativo),
      normal:   cagrM(precioFuturo10y.caliente.normal),
      positivo: cagrM(precioFuturo10y.caliente.positivo),
    },
  };

  const ya = yieldActual ?? 0;
  const retornoTotal = {
    deprimido: {
      negativo: cagrPrecio.deprimido.negativo + ya,
      normal:   cagrPrecio.deprimido.normal + ya,
      positivo: cagrPrecio.deprimido.positivo + ya,
    },
    normal: {
      negativo: cagrPrecio.normal.negativo + ya,
      normal:   cagrPrecio.normal.normal + ya,
      positivo: cagrPrecio.normal.positivo + ya,
    },
    caliente: {
      negativo: cagrPrecio.caliente.negativo + ya,
      normal:   cagrPrecio.caliente.normal + ya,
      positivo: cagrPrecio.caliente.positivo + ya,
    },
  };

  return {
    cagr,
    coefHabilidad: ch.coef,
    retainedSum: ch.retainedSum,
    bpaDelta: ch.bpaDelta,
    bpaProyectado,
    precioFuturo10y,
    retornoEsperado10y: { cagrPrecio, retornoTotal },
    yieldActual,
    peActual,
    warnings,
  };
}

// ─── Defaults múltiplos P/E por sector ───────────────────────────────────

export interface PeRange {
  low: number;
  mid: number;
  high: number;
}

const SECTOR_PE_DEFAULTS: Record<string, PeRange> = {
  'Consumer Staples':       { low: 14, mid: 18, high: 22 },
  'Consumer Defensive':     { low: 14, mid: 18, high: 22 },
  'Consumer Discretionary': { low: 12, mid: 16, high: 20 },
  'Consumer Cyclical':      { low: 12, mid: 16, high: 20 },
  'Industrials':            { low: 12, mid: 16, high: 20 },
  'Technology':             { low: 18, mid: 25, high: 32 },
  'Financial Services':     { low: 8,  mid: 11, high: 14 },
  'Financial':              { low: 8,  mid: 11, high: 14 },
  'Healthcare':             { low: 14, mid: 18, high: 24 },
  'Utilities':              { low: 12, mid: 16, high: 18 },
  'Energy':                 { low: 8,  mid: 12, high: 16 },
  'Basic Materials':        { low: 10, mid: 14, high: 18 },
  'Materials':              { low: 10, mid: 14, high: 18 },
  'Communication Services': { low: 10, mid: 13, high: 16 },
  'Real Estate':            { low: 14, mid: 18, high: 22 },  // P/AFFO para REITs
};

export function getDefaultPeRange(sector: string | null | undefined): PeRange {
  if (!sector) return { low: 12, mid: 16, high: 20 };
  return SECTOR_PE_DEFAULTS[sector] ?? { low: 12, mid: 16, high: 20 };
}

// ─── Aplicar overrides D1 sobre series FMP ──────────────────────────────

export interface OverrideRow {
  ticker: string;
  year: number;    // -10..0 para histórico, -99 = config global
  field: string;
  value: number | null;
}

/**
 * Toma series FMP raw + overrides D1 y devuelve series finales.
 * year=0 → index 0 (más reciente), year=-10 → index 10, etc.
 * Para fields globales (growth, peLow, peMid, peHigh, peTarget) usar year=-99.
 */
export function applyOverrides(
  series: { revenue: (number|null)[]; eps: (number|null)[]; dps: (number|null)[]; equity: (number|null)[]; retEarnings: (number|null)[]; assets: (number|null)[] },
  overrides: ReadonlyArray<OverrideRow>,
): typeof series {
  // Clone arrays to avoid mutating originals
  const out = {
    revenue: [...series.revenue],
    eps: [...series.eps],
    dps: [...series.dps],
    equity: [...series.equity],
    retEarnings: [...series.retEarnings],
    assets: [...series.assets],
  };
  for (const ov of overrides) {
    if (ov.value == null) continue;
    if (ov.year === -99) continue;  // global config — manejado aparte
    // year=0 → idx 0, year=-1 → idx 1, year=-10 → idx 10
    const idx = -ov.year;
    if (idx < 0 || idx >= 10) continue;
    const field = ov.field as keyof typeof out;
    if (out[field] && Array.isArray(out[field])) {
      (out[field] as Array<number|null>)[idx] = ov.value;
    }
  }
  return out;
}

/**
 * Extrae config global (growth, peLow, peMid, peHigh, peTarget) de overrides.
 * Devuelve solo los presentes (sin defaults).
 */
export function extractGlobalConfig(overrides: ReadonlyArray<OverrideRow>): Partial<{
  growth: number; peLow: number; peMid: number; peHigh: number; peTarget: number;
}> {
  const out: Record<string, number> = {};
  for (const ov of overrides) {
    if (ov.year !== -99 || ov.value == null) continue;
    if (['growth', 'peLow', 'peMid', 'peHigh', 'peTarget'].includes(ov.field)) {
      out[ov.field] = ov.value;
    }
  }
  return out as ReturnType<typeof extractGlobalConfig>;
}

// ─── Helpers internos ────────────────────────────────────────────────────

function emptyMatrix() {
  const zero = { negativo: 0, normal: 0, positivo: 0 };
  return { deprimido: zero, normal: zero, caliente: zero };
}
