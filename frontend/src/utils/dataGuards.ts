// dataGuards.ts — defensa centralizada anti-bugs propagation.
//
// 2026-05-19: creado tras auditoría con 4 agentes que detectó 30+ bugs causados
// por dos patrones repetidos:
//   1. `x || 0` confunde "dato missing" con "valor cero real"
//   2. Iteración sobre años FMP sin filtrar "ghost years" (revenue=0 + eps=null)
//
// USO:
//   import { nz, filterRealYears, safeDiv } from '@/utils/dataGuards';
//   const epsCAGR = nz(comp[y]?.cagr);              // preserva null
//   const realYears = filterRealYears(fin, YEARS);  // filtra ghost rows
//   const ratio = safeDiv(numerator, denominator); // devuelve null si div imposible

/**
 * nz — "null-safe number". Preserva null/undefined/NaN/Infinity como null.
 * NO convierte a 0 (eso era el bug original).
 *
 * @param v Valor a chequear
 * @param fallback Valor a devolver si v es inválido (default: null)
 * @returns El número original si finito, o el fallback
 */
export function nz<T = null>(v: unknown, fallback: T | null = null): number | T | null {
  if (v == null) return fallback;
  const num = Number(v);
  if (!isFinite(num) || isNaN(num)) return fallback;
  return num;
}

/**
 * Variant que SÍ devuelve 0 cuando el valor existe pero es cero exacto,
 * pero NULL cuando es missing. Útil cuando quieres preservar la distinción
 * pero NaN/Infinity sigue siendo error.
 */
export function nzStrict(v: unknown): number | null {
  if (v == null) return null;
  const num = Number(v);
  if (!isFinite(num) || isNaN(num)) return null;
  return num;  // incluye 0 legítimo
}

/**
 * filterRealYears — filtra años "ghost" que FMP a veces incluye en balance/cashflow
 * pero NO en income statement. Sin este filtro, fin[year] tiene todos los campos en 0
 * → cascada de ceros en proyecciones y matrices (BUG histórico Rentabilidad 10y).
 *
 * Un año es "real" si tiene revenue > 0 Y al menos un valor de EPS presente
 * (puede ser negativo — TAP -10.83 EPS es write-down real, sigue siendo válido).
 *
 * @param fin Objeto {year: data} de useAnalysisMetrics
 * @param years Lista de años candidatos
 * @returns Subset de años con datos reales (mismo orden)
 */
export function filterRealYears(
  fin: Record<number | string, Record<string, unknown>> | null | undefined,
  years: ReadonlyArray<number | string>,
): Array<number | string> {
  if (!fin || !years) return [];
  return years.filter(y => {
    const d = fin[y as keyof typeof fin];
    if (!d) return false;
    const revenue = nzStrict((d as Record<string, unknown>).revenue);
    if (revenue == null || revenue <= 0) return false;
    const eps = nzStrict((d as Record<string, unknown>).eps);
    const epsBasic = nzStrict((d as Record<string, unknown>).epsBasic);
    const epsDiluted = nzStrict((d as Record<string, unknown>).epsDiluted);
    // Cualquier EPS presente (incluso negativo) es válido
    return (eps != null || epsBasic != null || epsDiluted != null);
  });
}

/**
 * safeDiv — división protegida contra divisor 0, null, NaN.
 * Devuelve null cuando la división no tiene sentido (no Infinity ni NaN visible).
 *
 * @param numerator Dividendo
 * @param denominator Divisor
 * @returns Resultado o null
 */
export function safeDiv(
  numerator: unknown,
  denominator: unknown,
): number | null {
  const n = nzStrict(numerator);
  const d = nzStrict(denominator);
  if (n == null || d == null || d === 0) return null;
  const result = n / d;
  if (!isFinite(result)) return null;
  return result;
}

/**
 * safePct — porcentaje protegido. Devuelve null si cualquier operando inválido.
 * Útil para yields, growth rates, payout ratios.
 *
 * @example safePct(dividends, fcf) → 0.65 (65% payout) o null si fcf=0
 */
export function safePct(numerator: unknown, denominator: unknown): number | null {
  return safeDiv(numerator, denominator);
}

/**
 * safeCAGR — CAGR protegido. Devuelve null si:
 * - end o start son null/0/negativos (signo invertido es inválido)
 * - years <= 0
 *
 * Fórmula Phil Town / Gorka: (end/start)^(1/years) - 1
 *
 * @param end Valor final (más reciente)
 * @param start Valor inicial (más antiguo)
 * @param years Años elapsed
 * @returns CAGR decimal o null
 */
export function safeCAGR(
  end: unknown,
  start: unknown,
  years: number,
): number | null {
  const e = nzStrict(end);
  const s = nzStrict(start);
  if (e == null || s == null) return null;
  if (e <= 0 || s <= 0) return null;  // signos cambiantes invalidan CAGR
  if (!Number.isFinite(years) || years <= 0) return null;
  return Math.pow(e / s, 1 / years) - 1;
}

/**
 * isGhostRow — heurística rápida para detectar si una fila de FMP es ghost.
 * Útil en code-review para añadir tests anti-regresión.
 */
export function isGhostRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return true;
  const rev = nzStrict(row.revenue);
  if (rev == null || rev <= 0) return true;
  const eps = nzStrict(row.eps) ?? nzStrict(row.epsBasic) ?? nzStrict(row.epsDiluted);
  if (eps == null) return true;
  return false;
}

/**
 * usdYield — yield correcto cross-currency.
 * Antes el frontend usaba divYieldTTM directo del API (en moneda nativa) → NVO 19.82%, RAND 28.84%.
 * Esta función calcula yield a partir de valores ya convertidos a USD.
 *
 * @param divAnnualUSD Dividendos anuales en USD (ya FX-corrected)
 * @param valueUSD Valor de mercado en USD
 * @returns Yield decimal (0.04 = 4%) o null
 */
export function usdYield(divAnnualUSD: unknown, valueUSD: unknown): number | null {
  return safeDiv(divAnnualUSD, valueUSD);
}

/**
 * usdDps — DPS en USD a partir de dividendos anuales totales en USD y shares.
 * Antes el frontend mostraba "$7.30" para NVO cuando real era 7.30 DKK = $1.10.
 *
 * @param divAnnualUSD Dividendos anuales en USD
 * @param shares Número de acciones
 * @returns DPS en USD o null
 */
export function usdDps(divAnnualUSD: unknown, shares: unknown): number | null {
  return safeDiv(divAnnualUSD, shares);
}
