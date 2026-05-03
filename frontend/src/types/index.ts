// Shared types — origen único de verdad para shapes que viajan entre worker → frontend.
//
// Filosofía:
//   1. Los tipos reflejan lo que el worker ENVÍA, no lo que el componente IDEAL recibiría.
//      Si un campo a veces viene null, está tipado como `T | null`.
//   2. Validators (validators/index.ts + Zod schemas.ts) son la frontera de runtime.
//      Después del validator, el componente puede confiar en el tipo.
//   3. Cualquier campo opcional que SIEMPRE debería venir pero a veces falta
//      lleva comentario `// drift FMP YYYY-MM-DD` para que sepas la fecha.

// ── Currency / FX ─────────────────────────────────────────────────────────

export type Currency =
  | 'USD' | 'EUR' | 'GBP' | 'GBX' | 'HKD' | 'CAD' | 'CHF'
  | 'JPY' | 'AUD' | 'SGD' | 'SEK' | 'NOK' | 'DKK' | 'NZD' | 'CNY';

export interface CurrencyMeta {
  symbol: string;
  name: string;
  decimals?: number;
}

export type FxRates = Record<Currency, number>;

// ── Position (D1 + IB) ────────────────────────────────────────────────────

export interface Position {
  ticker: string;
  name?: string;
  shares: number;
  avgCost: number;
  lastPrice?: number;
  currency?: Currency;
  account?: string | null;
  sector?: string | null;
  industry?: string | null;
  // Hidratado en runtime con fundamentals — no viene del worker
  _fund?: Partial<FmpProfile> | null;
}

// ── Trade (cost_basis) ────────────────────────────────────────────────────

export type TradeType = 'EQUITY' | 'OPTION' | 'OPT' | 'SELL' | 'DIVIDENDS' | 'DIVIDEND' | 'DIV';

export interface Trade {
  ticker: string;
  tipo: TradeType | string;  // string fallback para legacy
  shares: number;
  price?: number;
  precio?: number;  // alias legacy español
  fecha?: string;
  date?: string;  // alias en
  account?: string | null;
  exec_id?: string | null;
  execId?: string | null;  // alias camelCase
  underlying?: string | null;  // tickers de OPT (1844 backfilled 2026-05-01)
}

// ── Dividend ──────────────────────────────────────────────────────────────

export interface Dividend {
  ticker: string;
  fecha: string;  // ISO
  shares?: number;
  dps_gross?: number;
  dps_net?: number;
  bruto?: number;  // total bruto en moneda local
  neto?: number;
  wht_rate?: number;
  wht_amount?: number;
  spain_rate?: number;
  spain_tax?: number;
  account?: string | null;
  broker?: string | null;
  fx_eur?: number;
  currency?: Currency;
}

// ── FMP / Fundamentals ────────────────────────────────────────────────────

export interface FmpProfile {
  symbol: string;
  companyName?: string;
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  currency?: Currency;
  exchangeShortName?: string;
  // mktCap drift FMP 2026-04: a veces null. Bug Pattern #010.
  mktCap?: number | null;
  marketCap?: number | null;  // alias newer FMP
  beta?: number | null;
  pe?: number | null;
  exDivDate?: string | null;
  description?: string;
  ceo?: string;
  fullTimeEmployees?: number | string;
}

// Un elemento del array anual /api/fundamentals/bulk (ratios)
export interface FmpRatioAnnual {
  date?: string;
  symbol?: string;
  // CLAVES NO-TTM (anuales) — Bug Pattern #001
  priceToEarningsRatio?: number | null;
  priceToBookRatio?: number | null;
  enterpriseValueOverEBITDA?: number | null;
  enterpriseValueMultiple?: number | null;  // alias
  returnOnEquity?: number | null;
  dividendPayoutRatio?: number | null;
  payoutRatio?: number | null;
  currentRatio?: number | null;
  quickRatio?: number | null;
  debtEquityRatio?: number | null;
  netProfitMargin?: number | null;
  grossProfitMargin?: number | null;
  operatingProfitMargin?: number | null;
  returnOnAssets?: number | null;
  returnOnCapitalEmployed?: number | null;
}

export interface FmpKeyMetricsAnnual {
  date?: string;
  symbol?: string;
  marketCap?: number | null;
  peRatio?: number | null;
  pbRatio?: number | null;
  priceToBookRatio?: number | null;
  enterpriseValueOverEBITDA?: number | null;
  evToEBITDA?: number | null;
  roe?: number | null;
  returnOnEquity?: number | null;
  payoutRatio?: number | null;
  dividendYield?: number | null;
  freeCashFlowYield?: number | null;
  workingCapital?: number | null;
  debtToEquity?: number | null;
}

export interface FundamentalsResponse {
  profile?: FmpProfile;
  ratios?: FmpRatioAnnual[];
  keyMetrics?: FmpKeyMetricsAnnual[];
  income?: unknown[];
  balance?: unknown[];
  cash?: unknown[];
  history?: unknown;
}

export type FundamentalsBulk = Record<string, FundamentalsResponse>;

// ── Financials (per-year shape used by analysis tabs) ─────────────────────

export interface FinancialsYear {
  year?: number;
  revenue?: number;
  netIncome?: number;
  eps?: number;
  dps?: number;
  fcf?: number;
  ocf?: number;
  cash?: number;
  totalDebt?: number;
  equity?: number;
  retainedEarnings?: number;
  operatingIncome?: number;
  grossProfit?: number;
  sharesOut?: number;
  bvps?: number;
}

export type FinancialsByYear = Record<number, FinancialsYear>;

// ── WACC inputs ───────────────────────────────────────────────────────────

export interface WaccInputs {
  equity?: number;
  totalDebt?: number;
  interestExpense?: number;
  taxRate?: number;
  beta?: number;
  riskFreeRate?: number;
  marketPremium?: number;
}

export interface WaccResult {
  wacc: number;
  costEquity: number;
  costDebt: number;
  weightE: number;
  weightD: number;
}

// ── Altman Z-Score ────────────────────────────────────────────────────────

export interface AltmanItem {
  name: string;
  val: number;
  weighted: number;
  weight: number;
}

export interface AltmanResult {
  score: number | null;
  items: AltmanItem[];
  zone: 'Segura' | 'Gris' | 'Peligro' | '—';
  zoneColor?: string;
}

// ── Piotroski ─────────────────────────────────────────────────────────────

export interface PiotroskiItem {
  name: string;
  pass: boolean;
  desc: string;
}

export interface PiotroskiResult {
  score: number;
  items: PiotroskiItem[];
}

// ── Dividend Analysis ─────────────────────────────────────────────────────

export interface DividendAnalysisResult {
  streak: number;
  cagr3: number | null;
  cagr5: number | null;
  cagr10: number | null;
  payoutFCF?: number | null;
  payoutEarnings?: number | null;
  yieldOnCost?: number | null;
  years: number[];
}

// ── Validator return shape (graceful fallback) ────────────────────────────

export interface ValidatorResult<T> {
  value: T;
  isValid: boolean;
  issue?: string | null;
  issues?: unknown[];
}

// ── API response wrappers ─────────────────────────────────────────────────

export interface AyrApiOk<T> {
  ok: true;
  data?: T;
  [key: string]: unknown;
}

export interface AyrApiErr {
  ok: false;
  error: string;
}

export type AyrApiResponse<T> = AyrApiOk<T> | AyrApiErr;

// ── Ratings (utils/ratings.ts) ────────────────────────────────────────────

/**
 * Una regla individual del catálogo `R` en `utils/ratings.ts`. Cada métrica
 * (gm/om/roe/...) tiene un array ordenado de reglas; `rate()` devuelve la
 * primera cuyo `test(value)` pasa.
 */
export interface RatingRule {
  test: (v: number) => boolean;
  lbl: string;
  c: string;   // foreground color
  bg: string;  // background color (rgba string)
  score: number;
  tip?: string;
}

export interface RatingResult {
  lbl: string;
  c: string;
  bg: string;
  score: number;
  tip?: string;
}

// ── User preferences (utils/userPrefs.ts) ─────────────────────────────────

export type UserId = 'ricardo' | 'amparo' | string;

export interface KnownUser {
  id: UserId;
  label: string;
  icon: string;
  color: string;
}

export type YearOrder = 'asc' | 'desc';
