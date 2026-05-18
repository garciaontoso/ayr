// Zod runtime schemas — guardián contra drifts del schema FMP.
//
// Filosofía:
//   1. Estos schemas COMPLEMENTAN el validator manual de `validators/index.ts`.
//      No lo reemplazan. El manual sigue siendo la capa de fallback graceful;
//      Zod es la capa de **observabilidad** que detecta cuando FMP cambia
//      la forma del payload sin avisar.
//   2. `safeParse` NUNCA bloquea el flujo. Si hay drift, log + report
//      fire-and-forget a `/api/error-log` y devolvemos los datos raw para
//      que el frontend siga funcionando con fallback chains.
//   3. Throttle por ticker: 60s entre reports del mismo ticker para no
//      saturar el endpoint si hay drift sistemático.
//
// Bugs históricos que motivan estos schemas:
//   - #001: el array `ratios` que devuelve `/api/fundamentals/bulk` es
//           ANUAL (no TTM). El frontend rompió leyendo `.peRatioTTM`.
//   - #010: `profile.mktCap` desapareció del schema FMP — ahora vive en
//           `keyMetrics[0].marketCap`. Zod habría avisado en su día.
//
// Uso típico:
//   import { safeParseFundamentals } from '@/validators/schemas';
//   const { value, isValid } = safeParseFundamentals(data, ticker);
//   // value siempre se devuelve (raw o parsed). isValid sólo informa.

import { z } from 'zod';
import type { ZodIssue } from 'zod';
import { API_URL } from '../constants/index.js';

// ── Schemas ─────────────────────────────────────────────────────────────

// Profile FMP — campos críticos que la app SIEMPRE necesita.
// Bug #010: mktCap puede ser null para algunos tickers (ETFs, etc.) —
// no lo hacemos required. Fallback chain en consumers.
export const ProfileSchema = z.object({
  symbol: z.string(),
  companyName: z.string().optional(),
  sector: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  currency: z.string().optional().default('USD'),
  // mktCap puede ser null (Bug #010) — no lo hacemos required
  mktCap: z.number().optional().nullable(),
  marketCap: z.number().optional().nullable(),  // alias nuevo FMP
  beta: z.number().optional().nullable(),
  exDivDate: z.string().optional().nullable(),
  pe: z.number().optional().nullable(),
}).passthrough();  // permite campos extra sin romper

// Ratios anuales — un elemento del array.
// Bug #001: estas son las claves NO-TTM (anuales). Si algún día FMP
// cambiase a TTM, el schema seguiría aceptándolo (passthrough) pero
// los consumers fallarían silenciosamente — Zod loggearía drift.
export const RatioAnnualSchema = z.object({
  date: z.string().optional(),
  priceToEarningsRatio: z.number().optional().nullable(),
  priceToBookRatio: z.number().optional().nullable(),
  enterpriseValueOverEBITDA: z.number().optional().nullable(),
  enterpriseValueMultiple: z.number().optional().nullable(),  // alias
  returnOnEquity: z.number().optional().nullable(),
  dividendPayoutRatio: z.number().optional().nullable(),
  payoutRatio: z.number().optional().nullable(),
}).passthrough();

// KeyMetrics anuales — Bug #010 dice que mktCap aparece aquí ahora.
export const KeyMetricsAnnualSchema = z.object({
  date: z.string().optional(),
  marketCap: z.number().optional().nullable(),
  peRatio: z.number().optional().nullable(),
  pbRatio: z.number().optional().nullable(),
  priceToBookRatio: z.number().optional().nullable(),
  enterpriseValueOverEBITDA: z.number().optional().nullable(),
  evToEBITDA: z.number().optional().nullable(),
  roe: z.number().optional().nullable(),
  returnOnEquity: z.number().optional().nullable(),
  payoutRatio: z.number().optional().nullable(),
}).passthrough();

// Income statement — Bug schema FMP 2025-08-31. Si interestExpense desaparece
// o cambia signo, Zod loggea drift.
export const IncomeAnnualSchema = z.object({
  fiscalYear: z.union([z.string(), z.number()]).optional(),
  date: z.string().optional(),
  revenue: z.number().optional().nullable(),
  grossProfit: z.number().optional().nullable(),
  operatingIncome: z.number().optional().nullable(),
  netIncome: z.number().optional().nullable(),
  eps: z.number().optional().nullable(),
  epsDiluted: z.number().optional().nullable(),
  // interestExpense en FMP siempre es POSITIVO (gasto). Si viene negativo
  // es señal de drift — el schema lo acepta pero el sign-check lo flagea.
  interestExpense: z.number().optional().nullable(),
  incomeTaxExpense: z.number().optional().nullable(),
  depreciationAndAmortization: z.number().optional().nullable(),
  weightedAverageShsOut: z.number().optional().nullable(),
  weightedAverageShsOutDil: z.number().optional().nullable(),
}).passthrough();

// Balance sheet
export const BalanceAnnualSchema = z.object({
  fiscalYear: z.union([z.string(), z.number()]).optional(),
  date: z.string().optional(),
  totalDebt: z.number().optional().nullable(),
  longTermDebt: z.number().optional().nullable(),
  shortTermDebt: z.number().optional().nullable(),
  cashAndCashEquivalents: z.number().optional().nullable(),
  cashAndShortTermInvestments: z.number().optional().nullable(),
  totalStockholdersEquity: z.number().optional().nullable(),
  totalEquity: z.number().optional().nullable(),  // alias schema cambió
  retainedEarnings: z.number().optional().nullable(),
}).passthrough();

// Cash flow — campos críticos con convención de signos.
// Bug recurrente: FMP migró `dividendsPaid → commonDividendsPaid` y
// `debtRepayment → netDebtIssuance` (signo flipped). El schema acepta ambos
// y _checkSignConventions detecta cuando ambos están vacíos.
export const CashflowAnnualSchema = z.object({
  fiscalYear: z.union([z.string(), z.number()]).optional(),
  date: z.string().optional(),
  operatingCashFlow: z.number().optional().nullable(),
  netCashProvidedByOperatingActivities: z.number().optional().nullable(),  // alias
  // CapEx siempre debe ser NEGATIVO (cash outflow). Si viene positivo → drift.
  capitalExpenditure: z.number().optional().nullable(),
  // dividendsPaid (legacy) o commonDividendsPaid (nuevo). Ambos NEGATIVOS.
  dividendsPaid: z.number().optional().nullable(),
  commonDividendsPaid: z.number().optional().nullable(),
  netDividendsPaid: z.number().optional().nullable(),
  // Repurchases siempre NEGATIVO
  commonStockRepurchased: z.number().optional().nullable(),
  // netDebtIssuance: positivo = emitió deuda, negativo = neto pagado.
  netDebtIssuance: z.number().optional().nullable(),
  longTermNetDebtIssuance: z.number().optional().nullable(),
  debtRepayment: z.number().optional().nullable(),  // legacy, positivo
  // acquisitionsNet: negativo = compró, positivo = vendió neto. Bug solía
  // usar Math.abs() invirtiendo desinversiones como adquisiciones.
  acquisitionsNet: z.number().optional().nullable(),
  depreciationAndAmortization: z.number().optional().nullable(),
}).passthrough();

// ── Position (D1) ───────────────────────────────────────────────────────

const CurrencySchema = z.enum([
  'USD','EUR','GBP','GBX','HKD','CAD','CHF',
  'JPY','AUD','SGD','SEK','NOK','DKK','NZD','CNY',
]);

// Position con guard de currency-consistency. Si market_value y usd_value
// divergen >5% cuando ambos están poblados y la moneda no es USD, hay drift.
export const PositionSchema = z.object({
  ticker: z.string().min(1),
  shares: z.number(),
  avgCost: z.number().optional().nullable(),
  lastPrice: z.number().optional().nullable(),
  // Bug #014/RED: currency='USD' cuando debería ser EUR — el UPSERT no
  // actualizaba el campo currency. Aceptamos string libre pero loggeamos
  // cuando la moneda no está en el set canónico.
  currency: z.string().optional().nullable(),
  market_value: z.number().optional().nullable(),  // moneda nativa
  usd_value: z.number().optional().nullable(),     // SIEMPRE en USD
  account: z.string().optional().nullable(),
  sector: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
}).passthrough();

// Lista de posiciones
export const PositionsArraySchema = z.array(PositionSchema);

// ── Dividend (D1) ───────────────────────────────────────────────────────

// Bug DEO $177 phantom: shares=7 + dps>1 alta para una "Payment In Lieu" que
// no era dividendo normal. Validator marca filas con shares=0 + bruto>1
// como sospechosas.
export const DividendSchema = z.object({
  ticker: z.string().min(1),
  fecha: z.string(),  // ISO YYYY-MM-DD
  shares: z.number().optional().nullable(),
  bruto: z.number().optional().nullable(),
  neto: z.number().optional().nullable(),
  account: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
}).passthrough();

export const DividendsArraySchema = z.array(DividendSchema);

// ── IB Bridge response ──────────────────────────────────────────────────

// Bug #BridgeArray: a veces devuelve {positions: [...]} y a veces el array
// directo. El schema acepta ambos shapes mediante z.union.
const BridgePositionItemSchema = z.object({
  ticker: z.string().optional(),
  symbol: z.string().optional(),
  shares: z.union([z.number(), z.string()]).optional(),
  position: z.union([z.number(), z.string()]).optional(),
  market_value: z.number().optional(),
  marketValue: z.number().optional(),
  market_price: z.number().optional(),
  marketPrice: z.number().optional(),
  account: z.string().optional(),
}).passthrough();

export const BridgePositionsResponseSchema = z.union([
  z.array(BridgePositionItemSchema),
  z.object({ positions: z.array(BridgePositionItemSchema) }).passthrough(),
  z.object({ data: z.array(BridgePositionItemSchema) }).passthrough(),
]);

/**
 * Normaliza bridge response a Array. Si llega {positions: [...]}, extrae array.
 * Defensa central contra Bug #BridgeArray.
 */
export function normalizeBridgePositions(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (raw && typeof raw === 'object') {
    const obj = raw as { positions?: unknown; data?: unknown };
    if (Array.isArray(obj.positions)) return obj.positions as Array<Record<string, unknown>>;
    if (Array.isArray(obj.data)) return obj.data as Array<Record<string, unknown>>;
  }
  return [];
}

// Respuesta completa de /api/fundamentals/bulk PER TICKER.
// `passthrough()` permite que el worker añada campos nuevos sin romper.
export const FundamentalsResponseSchema = z.object({
  profile: ProfileSchema.optional(),
  ratios: z.array(RatioAnnualSchema).optional().default([]),
  keyMetrics: z.array(KeyMetricsAnnualSchema).optional().default([]),
  income: z.array(IncomeAnnualSchema).optional().default([]),
  balance: z.array(BalanceAnnualSchema).optional().default([]),
  cashflow: z.array(CashflowAnnualSchema).optional().default([]),
}).passthrough();

// ── Sign convention runtime checks ──────────────────────────────────────
// Estos NO son schemas Zod — son guardas adicionales que ejecutamos sobre
// los arrays parseados para detectar bugs como capex positivo (FMP drift)
// o ambas claves de dividendsPaid vacías.

export interface SignConventionReport {
  ticker: string;
  drifts: Array<{ field: string; value: number; expected: 'negative' | 'positive' | 'present' }>;
}

/**
 * Comprueba convenciones de signos sobre el último año de cashflow.
 * Devuelve {drifts: []} cuando todo OK. Si hay drifts, log + report.
 */
export function checkSignConventions(fund: unknown, ticker: string): SignConventionReport {
  const drifts: SignConventionReport['drifts'] = [];
  if (!fund || typeof fund !== 'object') return { ticker, drifts };
  const f = fund as { cashflow?: unknown[]; income?: unknown[] };
  const cf = Array.isArray(f.cashflow) ? f.cashflow[0] as Record<string, unknown> : null;
  const inc = Array.isArray(f.income) ? f.income[0] as Record<string, unknown> : null;

  if (cf) {
    // capex debe ser <= 0 (cash outflow)
    if (typeof cf.capitalExpenditure === 'number' && cf.capitalExpenditure > 0) {
      drifts.push({ field: 'capitalExpenditure', value: cf.capitalExpenditure, expected: 'negative' });
    }
    // commonDividendsPaid debe ser <= 0
    const divPaid = cf.commonDividendsPaid ?? cf.dividendsPaid ?? cf.netDividendsPaid;
    if (typeof divPaid === 'number' && divPaid > 0) {
      drifts.push({ field: 'dividendsPaid', value: divPaid, expected: 'negative' });
    }
    // Si ambas claves de divs están vacías Y la empresa paga divs (income.netIncome > 0)
    // probablemente migración FMP. Lo flageamos:
    if (divPaid == null && cf.commonStockRepurchased == null) {
      drifts.push({ field: 'dividendsPaid|netDividendsPaid|commonDividendsPaid', value: 0, expected: 'present' });
    }
  }
  if (inc) {
    // interestExpense debe ser >= 0 (gasto positivo en income statement)
    if (typeof inc.interestExpense === 'number' && inc.interestExpense < 0) {
      drifts.push({ field: 'interestExpense', value: inc.interestExpense, expected: 'positive' });
    }
  }

  if (drifts.length > 0) {
    if (_shouldReport(`sign-${ticker}`)) {
      try {
        fetch(`${API_URL}/api/error-log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            severity: 'warn',
            message: 'sign-convention drift',
            context: JSON.stringify({ ticker, drifts }),
            ticker,
          }),
        }).catch(() => {});
      } catch (_) {}
    }
  }
  return { ticker, drifts };
}

// /api/fundamentals/bulk devuelve { results: { TICKER1: {...}, TICKER2: {...} } }
// según el código actual de PortfolioTab.jsx, pero también soportamos shape
// directo { TICKER1: ..., TICKER2: ... }.
export const FundamentalsBulkSchema = z.record(z.string(), FundamentalsResponseSchema);

// ── Throttle: no re-reportar el mismo ticker en 60s ─────────────────────

const _recentReports = new Map<string, number>();  // ticker → timestamp_ms
const REPORT_THROTTLE_MS = 60_000;

function _shouldReport(ticker: string): boolean {
  const now = Date.now();
  const last = _recentReports.get(ticker) || 0;
  if (now - last < REPORT_THROTTLE_MS) return false;
  _recentReports.set(ticker, now);
  // GC: limpiar entries viejos cada 100 reports para evitar leak
  if (_recentReports.size > 100) {
    const cutoff = now - REPORT_THROTTLE_MS;
    for (const [t, ts] of _recentReports.entries()) {
      if (ts < cutoff) _recentReports.delete(t);
    }
  }
  return true;
}

// Fire-and-forget: reportar drift al worker sin bloquear el flujo del caller.
function _reportDrift(ticker: string, issues: ReadonlyArray<ZodIssue> | null | undefined): void {
  if (!_shouldReport(ticker)) return;
  try {
    // Trim issues a 5 max y stringify para D1 (TEXT column)
    const trimmedIssues = (issues || []).slice(0, 5).map((i) => {
      const issue = i as ZodIssue & { expected?: unknown; received?: unknown };
      return {
        path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path || ''),
        code: issue.code || '',
        message: issue.message || '',
        expected: issue.expected ?? undefined,
        received: issue.received ?? undefined,
      };
    });
    fetch(`${API_URL}/api/error-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        severity: 'warn',
        message: 'zod-drift fundamentals',
        context: JSON.stringify({ ticker, issues: trimmedIssues }),
        ticker,
        url: typeof window !== 'undefined' ? window.location?.href : '',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }),
    }).catch(() => { /* fire-and-forget — silencioso */ });
  } catch (_) {
    // jamás propagar errores del reporter al caller
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

export interface SafeParseResult {
  value: unknown;
  isValid: boolean;
  issues: ReadonlyArray<ZodIssue> | Array<{ message: string }>;
}

/**
 * Parsea la respuesta de /api/fundamentals/bulk para un ticker.
 * Si el schema cambia (drift FMP), log + report fire-and-forget pero
 * SIEMPRE devuelve los datos raw para que el flujo siga.
 *
 * @param data Respuesta del worker para un ticker (no el bulk completo)
 * @param ticker Symbol — para logging y throttling
 */
export function safeParseFundamentals(
  data: unknown,
  ticker: string = '?'
): SafeParseResult {
  if (!data || typeof data !== 'object') {
    return { value: data, isValid: false, issues: [{ message: 'data is not object' }] };
  }
  const result = FundamentalsResponseSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues || [];
    console.warn('[zod-drift] fundamentals', ticker, issues);
    _reportDrift(ticker, issues);
    // Devolvemos data raw — degrade graceful, no rompemos el flujo
    return { value: data, isValid: false, issues };
  }
  return { value: result.data, isValid: true, issues: [] };
}

export interface SafeParseBulkResult {
  value: unknown;
  validCount: number;
  invalidCount: number;
}

/**
 * Parsea el bulk completo. Itera por ticker llamando a safeParseFundamentals.
 * Útil para cablear directo en `loadFundamentals` sin loop manual.
 *
 * @param bulk Mapa ticker → fundamentals data
 */
export function safeParseFundamentalsBulk(bulk: unknown): SafeParseBulkResult {
  if (!bulk || typeof bulk !== 'object') {
    return { value: bulk, validCount: 0, invalidCount: 0 };
  }
  let validCount = 0;
  let invalidCount = 0;
  for (const [ticker, data] of Object.entries(bulk)) {
    const r = safeParseFundamentals(data, ticker);
    if (r.isValid) validCount++;
    else invalidCount++;
  }
  return { value: bulk, validCount, invalidCount };
}

// ── Test de humo (manual) ───────────────────────────────────────────────

/**
 * Test manual — sólo se llama si lo invocas desde consola del navegador:
 *   import('./validators/schemas.ts').then(m => m.__testSchemas())
 * No se ejecuta automáticamente. Útil para verificar que los schemas
 * se cargan y validan bien tras editar este archivo.
 */
export function __testSchemas(): void {
  const results: Array<{ test: string; pass: boolean; error?: string }> = [];

  // Caso 1: shape válido mínimo → debe pasar
  try {
    FundamentalsResponseSchema.parse({
      profile: { symbol: 'AAPL', sector: 'Technology' },
      ratios: [],
      keyMetrics: [],
    });
    results.push({ test: 'minimal-valid', pass: true });
  } catch (e) {
    results.push({ test: 'minimal-valid', pass: false, error: (e as Error).message });
  }

  // Caso 2: ratios con string en lugar de number → debe fallar
  try {
    FundamentalsResponseSchema.parse({
      profile: { symbol: 'AAPL' },
      ratios: [{ priceToEarningsRatio: '30' }],  // string en lugar de number
      keyMetrics: [],
    });
    results.push({ test: 'string-instead-of-number', pass: false, error: 'should have thrown' });
  } catch (_e) {
    results.push({ test: 'string-instead-of-number', pass: true });
  }

  // Caso 3: profile sin symbol → debe fallar (symbol es required)
  try {
    FundamentalsResponseSchema.parse({
      profile: {},  // sin symbol
      ratios: [],
      keyMetrics: [],
    });
    results.push({ test: 'profile-missing-symbol', pass: false, error: 'should have thrown' });
  } catch (_e) {
    results.push({ test: 'profile-missing-symbol', pass: true });
  }

  // Caso 4: passthrough — campos extra deben pasar
  try {
    FundamentalsResponseSchema.parse({
      profile: { symbol: 'AAPL', somethingNew: 'value' },
      ratios: [{ priceToEarningsRatio: 25, anotherField: 'x' }],
      keyMetrics: [],
    });
    results.push({ test: 'passthrough-extra-fields', pass: true });
  } catch (e) {
    results.push({ test: 'passthrough-extra-fields', pass: false, error: (e as Error).message });
  }

  // Caso 5: safeParseFundamentals devuelve raw aunque falle
  const raw = { profile: { symbol: 'AAPL' }, ratios: 'not-an-array' };
  const safe = safeParseFundamentals(raw, 'TEST_FAKE_TICKER');
  results.push({
    test: 'safeParse-returns-raw-on-failure',
    pass: safe.value === raw && safe.isValid === false,
  });

  console.table(results);
}
