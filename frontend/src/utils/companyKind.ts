// companyKind.ts — origen único de verdad para detección de tipo de empresa.
//
// Antes había 3 implementaciones paralelas (PortfolioTab, DebtTab, DividendsTab)
// que clasificaban REIT/BDC/ETF de forma distinta y se desincronizaban con cada
// fix. Este módulo es la única fuente de verdad — todos los tabs lo importan.
//
// Filosofía:
//   1. Mira primero `cfg.cat` / `cfg.category` (manual override del usuario).
//   2. Luego mira sector/industry de FMP profile.
//   3. Fallback heurístico (ratios típicos REIT) sólo si no hay metadatos.
//
// Bugs prevenidos:
//   • Bug REIT — Realty Income mostrado con EV/EBITDA 75× porque no se
//     reconocía como REIT y usaba EBITDA contable (= NI tras D&A) en vez
//     del proxy OCF + interestExpense.
//   • Bug SCHD "Financial Services" — ETF de dividendos mostrado como banco
//     porque el sector FMP era genérico.
//   • Bug BDC ratings — Main Street Capital con ND/EBITDA 7× marcado como
//     PELIGRO cuando es estructuralmente normal para una BDC apalancada.

export interface FmpProfile {
  sector?: string | null;
  industry?: string | null;
  symbol?: string | null;
  companyName?: string | null;
  isEtf?: boolean | null;
  isFund?: boolean | null;
  isAdr?: boolean | null;
  country?: string | null;
}

export interface FmpExtraLike {
  profile?: FmpProfile | null;
}

export interface CfgLike {
  ticker?: string | null;
  cat?: string | null;
  category?: string | null;
  sector?: string | null;
  industry?: string | null;
  // Manual override total (top-priority)
  forceKind?: CompanyKind | null;
}

export interface LatestFinLike {
  revenue?: number;
  operatingIncome?: number;
  depreciation?: number;
  netIncome?: number;
  ocf?: number;
  interestExpense?: number;
  totalDebt?: number;
  equity?: number;
  capex?: number;
  dps?: number;
}

export type CompanyKind = 'REIT' | 'BDC' | 'ETF' | 'CRYPTO' | 'INSURANCE' | 'BANK' | 'OPERATING';

export interface KindFlags {
  kind: CompanyKind;
  isReit: boolean;          // Equity REIT o Mortgage REIT
  isBdc: boolean;            // Business Development Company
  isEtf: boolean;            // ETF / ETN / Fund
  isCrypto: boolean;         // BTC, ETH, etc.
  isInsurance: boolean;      // Insurance
  isBank: boolean;           // Bank
  isReitLike: boolean;       // REIT + cualquier categoría con D&A pesado
  negativeEquity: boolean;   // MCD, BA, HD patrón (buybacks > equity)
  isPropTrust: boolean;      // REITs con structure trust (UK/CA)
  source: 'manual' | 'cat' | 'profile' | 'heuristic';
}

// ─── Constantes ──────────────────────────────────────────────────────────

// Tickers que sabemos que son crypto / commodity ETFs — la API a veces los
// devuelve con sector vacío.
const CRYPTO_TICKERS = new Set([
  'BTC-USD', 'ETH-USD', 'BTC', 'ETH',
  'GBTC', 'ETHE', 'IBIT', 'FBTC', 'ARKB', 'BITB',
]);

// Tickers de ETFs populares de dividendos que FMP a veces clasifica mal
// como "Financial Services" en lugar de marcar isEtf=true.
const KNOWN_ETF_TICKERS = new Set([
  'SCHD', 'DIVO', 'JEPI', 'JEPQ', 'SPYD', 'NOBL', 'VYM', 'VIG',
  'SPHD', 'DGRO', 'HDV', 'SDY', 'DVY', 'PFF', 'PGX', 'BIZD',
  'VTI', 'VOO', 'SPY', 'QQQ', 'IVV', 'IWM', 'EFA', 'EEM',
]);

// Industrias FMP que indican REIT.
const REIT_INDUSTRY_HINTS = [
  'reit', 'real estate', 'real estate investment trust',
  'mortgage-backed', 'specialty reit',
];

// Industrias FMP que indican BDC.
const BDC_INDUSTRY_HINTS = [
  'business development', 'bdc', 'asset management - middle market',
];

const INSURANCE_INDUSTRY_HINTS = [
  'insurance', 'reinsurance', 'life insurance', 'property & casualty',
];

const BANK_INDUSTRY_HINTS = [
  'banks', 'banking', 'regional bank', 'diversified bank', 'thrift',
];

// ─── Helpers ──────────────────────────────────────────────────────────────

const norm = (s: string | null | undefined): string =>
  (s || '').toLowerCase().trim();

const matchesAny = (haystack: string, needles: string[]): boolean =>
  needles.some(n => haystack.includes(n));

// ─── Heuristic detection (cuando no hay sector explícito) ────────────────

function heuristicIsReit(LD: LatestFinLike | null | undefined): boolean {
  if (!LD || !LD.revenue) return false;
  // D&A > 20% revenue + dividendsPaid alto + payout > NI suelen indicar REIT
  const da = LD.depreciation || 0;
  const rev = LD.revenue || 0;
  const ni = LD.netIncome || 0;
  const dps = LD.dps || 0;
  if (rev <= 0) return false;
  const daRatio = da / rev;
  // REITs distribuyen >90% del income gravable y suelen tener D&A pesado
  if (daRatio >= 0.20 && dps > 0 && ni > 0) {
    const yieldImplicit = (dps / (rev / 100)) || 0;
    if (yieldImplicit >= 0.5) return true;
  }
  return false;
}

function heuristicIsBdc(prof: FmpProfile | null | undefined, LD: LatestFinLike | null | undefined): boolean {
  const name = norm(prof?.companyName);
  if (name.includes('bdc') || name.includes('business development')) return true;
  // BDCs típicas: ND ≥ equity, ROE > 8% pero margen operativo no típico
  if (!LD) return false;
  const debt = LD.totalDebt || 0;
  const eq = LD.equity || 0;
  if (eq > 0 && debt / eq > 0.8 && (LD.dps || 0) > 0) {
    const ind = norm(prof?.industry);
    if (ind.includes('asset management') || ind.includes('investment')) return true;
  }
  return false;
}

// ─── Main detection ───────────────────────────────────────────────────────

export function detectKind(
  fmpExtra: FmpExtraLike | null | undefined,
  cfg: CfgLike | null | undefined,
  LD: LatestFinLike | null | undefined = null,
): KindFlags {
  const prof = fmpExtra?.profile;
  const ticker = norm(cfg?.ticker || prof?.symbol);
  const cat = norm(cfg?.cat || cfg?.category);
  const sector = norm(prof?.sector || cfg?.sector);
  const industry = norm(prof?.industry || cfg?.industry);

  // 1) Manual override total
  if (cfg?.forceKind) {
    return buildFlags(cfg.forceKind, LD, 'manual');
  }

  // 2) Crypto
  if (CRYPTO_TICKERS.has(ticker.toUpperCase()) ||
      sector === 'cryptocurrency' ||
      cat === 'crypto' ||
      cat === 'cryptocurrency') {
    return buildFlags('CRYPTO', LD, 'cat');
  }

  // 3) ETF
  if (prof?.isEtf === true || prof?.isFund === true ||
      KNOWN_ETF_TICKERS.has(ticker.toUpperCase()) ||
      cat === 'etf' || cat === 'fund') {
    return buildFlags('ETF', LD, 'profile');
  }

  // 4) REIT
  if (cat === 'reit' || cat === 'reits') {
    return buildFlags('REIT', LD, 'cat');
  }
  if (sector === 'real estate' || matchesAny(industry, REIT_INDUSTRY_HINTS)) {
    return buildFlags('REIT', LD, 'profile');
  }

  // 5) BDC (más raro que las clasifique FMP, frecuente heurística)
  if (cat === 'bdc' || matchesAny(industry, BDC_INDUSTRY_HINTS)) {
    return buildFlags('BDC', LD, industry ? 'profile' : 'cat');
  }
  if (heuristicIsBdc(prof, LD)) {
    return buildFlags('BDC', LD, 'heuristic');
  }

  // 6) Insurance
  if (cat === 'insurance' || matchesAny(industry, INSURANCE_INDUSTRY_HINTS)) {
    return buildFlags('INSURANCE', LD, 'profile');
  }

  // 7) Bank
  if (cat === 'bank' || matchesAny(industry, BANK_INDUSTRY_HINTS) || sector === 'financial services' && industry.includes('bank')) {
    return buildFlags('BANK', LD, 'profile');
  }

  // 8) REIT heurístico (último intento — D&A pesado + yield alto)
  if (heuristicIsReit(LD)) {
    return buildFlags('REIT', LD, 'heuristic');
  }

  // 9) Default: empresa operativa
  return buildFlags('OPERATING', LD, sector ? 'profile' : 'heuristic');
}

function buildFlags(kind: CompanyKind, LD: LatestFinLike | null | undefined, source: KindFlags['source']): KindFlags {
  const equity = LD?.equity ?? 1;
  return {
    kind,
    isReit: kind === 'REIT',
    isBdc: kind === 'BDC',
    isEtf: kind === 'ETF',
    isCrypto: kind === 'CRYPTO',
    isInsurance: kind === 'INSURANCE',
    isBank: kind === 'BANK',
    // "REIT-like" cubre cualquier negocio con métricas distorsionadas por
    // D&A (REITs + algunos AssetMgmt / utilities pesadas en CapEx).
    isReitLike: kind === 'REIT' || kind === 'BDC',
    negativeEquity: equity <= 0,
    isPropTrust: kind === 'REIT',
    source,
  };
}

// ─── Helpers públicos para consumidores ──────────────────────────────────

/**
 * `true` si una métrica basada en EPS/equity NO debe usarse para esta empresa.
 * Útil para hide-or-show banners en QualityTab, DebtTab, DividendsTab.
 */
export function shouldHideEpsMetrics(flags: KindFlags): boolean {
  return flags.isReit || flags.isEtf || flags.isCrypto || flags.negativeEquity;
}

/**
 * `true` si la posición es de net cash (más cash que deuda).
 * No es estrictamente kind sino estado financiero — pero coexiste aquí.
 */
export function isNetCash(LD: LatestFinLike | null | undefined): boolean {
  if (!LD) return false;
  return (LD.totalDebt || 0) < (LD as any).cash;
}
