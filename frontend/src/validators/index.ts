/// <reference types="vite/client" />
// Validators centralizados — capa de defensa contra datos malformados.
//
// Filosofía:
//   1. Cada componente que consume datos debe llamar al validator antes
//      de usarlos. Si el validator devuelve isValid:false con un fallback
//      sensato, el componente lo usa en lugar de crashear o mostrar NaN.
//   2. Cuando un validator detecta un problema, hace `console.warn` con
//      contexto. En producción podemos enchufar /api/error-log para
//      reportarlos centralmente.
//   3. Validators NUNCA tiran throw. Siempre devuelven `{ value, isValid,
//      issue }` para que el caller decida cómo degradar gracefully.
//
// Ejemplo de uso:
//   import { validatePosition, validatePrice } from '@/validators';
//   const { value: pos, isValid, issue } = validatePosition(p);
//   if (!isValid) console.warn('[PortfolioRow] bad position:', issue);
//   const price = validatePrice(p.lastPrice).value;  // siempre número finito > 0

import type {
  ValidatorResult,
  Position,
  FmpProfile,
} from '../types';

// ── Helpers genéricos ────────────────────────────────────────────────────

const _API_URL = 'https://api.onto-so.com';
const _logged = new Set<string>();

function _warnOnce(key: string, msg: string, data?: unknown): void {
  if (_logged.has(key)) return;
  _logged.add(key);
  console.warn('[validator]', msg, data || '');
  // Post to /api/error-log in production (or when ayr_force_error_log=1 in dev)
  const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD;
  const forceLog =
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('ayr_force_error_log') === '1';
  if (isProd || forceLog) {
    try {
      fetch(`${_API_URL}/api/error-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: 'warn',
          message: msg,
          context: JSON.stringify(data || null),
          buildId:
            (typeof import.meta !== 'undefined' &&
              import.meta.env?.VITE_BUILD_ID) ||
            'dev',
        }),
      }).catch(() => {});
    } catch (_) {}
  }
}

// ── Primitivos ───────────────────────────────────────────────────────────

interface ValidateNumberOpts {
  min?: number;
  max?: number;
  fallback?: number;
  label?: string;
}

export function validateNumber(
  v: unknown,
  { min = -Infinity, max = Infinity, fallback = 0, label = 'number' }: ValidateNumberOpts = {}
): ValidatorResult<number> {
  const num = Number(v);
  if (!Number.isFinite(num))
    return { value: fallback, isValid: false, issue: `${label}: not finite (got ${typeof v})` };
  if (num < min)
    return { value: fallback, isValid: false, issue: `${label}: ${num} < min ${min}` };
  if (num > max)
    return { value: fallback, isValid: false, issue: `${label}: ${num} > max ${max}` };
  return { value: num, isValid: true };
}

export function validatePrice(v: unknown, label: string = 'price'): ValidatorResult<number> {
  return validateNumber(v, { min: 0.01, max: 1e6, fallback: 0, label });
}

export function validatePercent(v: unknown, label: string = 'percent'): ValidatorResult<number> {
  // Acepta -100% a +1000% por seguridad (cotizaciones extremas)
  return validateNumber(v, { min: -10, max: 10, fallback: 0, label });
}

export function validateShares(v: unknown): ValidatorResult<number> {
  return validateNumber(v, { min: 0, max: 1e8, fallback: 0, label: 'shares' });
}

interface ValidateStringOpts {
  fallback?: string;
  maxLen?: number;
  label?: string;
}

export function validateString(
  v: unknown,
  { fallback = '', maxLen = 200, label = 'string' }: ValidateStringOpts = {}
): ValidatorResult<string> {
  if (typeof v !== 'string')
    return { value: fallback, isValid: false, issue: `${label}: not string` };
  if (v.length === 0)
    return { value: fallback, isValid: false, issue: `${label}: empty` };
  return { value: v.slice(0, maxLen), isValid: true };
}

// ── Validators de dominio ────────────────────────────────────────────────

/**
 * Posición de portfolio. Lo mínimo que debe tener para renderizar una fila.
 * Si falta algo crítico devuelve isValid:false.
 */
export function validatePosition(p: unknown): ValidatorResult<Position | null> {
  if (!p || typeof p !== 'object')
    return { value: null, isValid: false, issue: 'position: not object' };
  const pos = p as Record<string, unknown> & { _fund?: { sector?: string; industry?: string } | null };
  const ticker = String(pos.ticker || '').toUpperCase();
  if (!ticker) return { value: null, isValid: false, issue: 'position: no ticker' };
  const shares = Number(pos.shares) || 0;
  const issues: string[] = [];
  if (shares <= 0) issues.push('shares <= 0');
  // sector vacío → warning, no fatal
  if (!pos.sector && !pos._fund?.sector) issues.push('sector empty');
  return {
    value: {
      ticker,
      name: (pos.name as string) || ticker,
      shares,
      lastPrice: validatePrice(pos.lastPrice).value,
      avgCost: validateNumber(pos.avgCost, { min: 0, fallback: 0, label: 'avgCost' }).value,
      sector: pos._fund?.sector || (pos.sector as string) || '',
      industry: pos._fund?.industry || (pos.industry as string) || '',
      currency: (pos.currency as Position['currency']) || 'USD',
      account: (pos.account as string | null) || null,
    } as Position,
    isValid: issues.length === 0,
    issue: issues.length ? issues.join('; ') : null,
  };
}

// Forma "saneada" que devuelve validateTrade — diferente del Trade canonical
// porque normaliza tipo, fuerza shares=0 si DIVIDENDS y añade isOption.
interface SanitizedTrade {
  ticker: string;
  tipo: string;
  shares: number;
  price: number;
  account: string | null;
  execId: string | null;
  fecha: string;
  isOption: boolean;
}

/**
 * Trade individual de cost_basis. Detecta el bug recurrente DIVIDENDS+shares>0.
 */
export function validateTrade(t: unknown): ValidatorResult<SanitizedTrade | null> {
  if (!t || typeof t !== 'object')
    return { value: null, isValid: false, issue: 'trade: not object' };
  const tr = t as Record<string, unknown>;
  const tipo = String(tr.tipo || tr.type || '').toUpperCase();
  const shares = Number(tr.shares) || 0;
  const issues: string[] = [];
  // Bug pattern #011 — DIVIDENDS no debe tener shares
  if ((tipo === 'DIVIDENDS' || tipo === 'DIVIDEND' || tipo === 'DIV') && shares > 0) {
    issues.push(`legacy bug: DIVIDENDS row with shares=${shares}`);
    _warnOnce(
      `div-shares-${tr.ticker as string}`,
      `cost_basis row tiene tipo=DIVIDENDS pero shares=${shares} (bug legacy)`,
      tr
    );
  }
  return {
    value: {
      ticker: String(tr.ticker || '').toUpperCase(),
      tipo,
      shares: tipo === 'DIVIDENDS' ? 0 : shares, // forzar 0 si DIVIDENDS para no contar como buy
      price: Number(tr.precio || tr.price) || 0,
      account: (tr.account as string | null) || null,
      execId: (tr.exec_id as string | null) || (tr.execId as string | null) || null,
      fecha: (tr.fecha as string) || (tr.date as string) || '',
      isOption: tipo === 'OPTION' || tipo === 'OPT',
    },
    isValid: issues.length === 0,
    issue: issues.length ? issues.join('; ') : null,
  };
}

// Forma "saneada" que devuelve validateFundamentals (no es un FundamentalsResponse
// crudo — está aplanado para consumo directo en componentes).
interface SanitizedFundamentals {
  ticker: string;
  sector: string;
  industry: string;
  country: string;
  currency: string;
  marketCap: number;
  beta: number;
  pe: number;
  pb: number;
  evEbitda: number;
  roe: number;
  payoutRatio: number;
  exDivDate: string;
}

/**
 * Datos fundamentales devueltos por /api/fundamentals/bulk.
 * Detecta bug pattern #001 (claves TTM en arrays anuales).
 */
export function validateFundamentals(
  f: unknown,
  ticker: string = '?'
): ValidatorResult<SanitizedFundamentals | null> {
  if (!f || typeof f !== 'object')
    return { value: null, isValid: false, issue: 'fundamentals: not object' };
  const fun = f as { profile?: Record<string, unknown>; ratios?: unknown; keyMetrics?: unknown };
  const profile = (fun.profile || {}) as Record<string, unknown>;
  const ratiosArr = Array.isArray(fun.ratios) ? (fun.ratios as Array<Record<string, unknown>>) : [];
  const kmArr = Array.isArray(fun.keyMetrics)
    ? (fun.keyMetrics as Array<Record<string, unknown>>)
    : [];
  const ratios = ratiosArr[0] || {};
  const km = kmArr[0] || {};
  const issues: string[] = [];
  // Bug pattern #010 — mktCap fallback chain
  const mktCap =
    (profile.mktCap as number) ||
    (profile.marketCap as number) ||
    (km.marketCap as number) ||
    0;
  if (!mktCap) issues.push('mktCap: no disponible en profile/keyMetrics');
  // Bug pattern #004 — sector siempre debería venir de profile
  if (!profile.sector) issues.push('profile.sector vacío');
  return {
    value: {
      ticker,
      sector: (profile.sector as string) || '',
      industry: (profile.industry as string) || '',
      country: (profile.country as string) || '',
      currency: (profile.currency as string) || 'USD',
      marketCap: mktCap,
      beta: validateNumber(profile.beta, { min: -3, max: 5, fallback: 1, label: 'beta' }).value,
      // Bug pattern #001 — leer del array anual [0], no claves TTM
      pe:
        (ratios.priceToEarningsRatio as number) ||
        (ratios.peRatio as number) ||
        (km.peRatio as number) ||
        (profile.pe as number) ||
        0,
      pb:
        (ratios.priceToBookRatio as number) ||
        (km.pbRatio as number) ||
        (km.priceToBookRatio as number) ||
        0,
      evEbitda:
        (ratios.enterpriseValueMultiple as number) ||
        (ratios.enterpriseValueOverEBITDA as number) ||
        (km.enterpriseValueOverEBITDA as number) ||
        (km.evToEBITDA as number) ||
        0,
      roe:
        (ratios.returnOnEquity as number) ||
        (km.roe as number) ||
        (km.returnOnEquity as number) ||
        0,
      payoutRatio:
        (ratios.dividendPayoutRatio as number) ||
        (ratios.payoutRatio as number) ||
        (km.payoutRatio as number) ||
        0,
      exDivDate: (profile.exDivDate as string) || '',
    },
    isValid: issues.length === 0,
    issue: issues.length ? issues.join('; ') : null,
  };
}

/**
 * Detecta REIT por sector/industry. Centralizado para no duplicar lógica.
 */
export function isReit(
  profile: Pick<FmpProfile, 'sector' | 'industry'> | null | undefined
): boolean {
  if (!profile) return false;
  const sector = profile.sector || '';
  const industry = profile.industry || '';
  if (sector === 'Real Estate') return true;
  if (industry.toLowerCase().includes('reit')) return true;
  return false;
}

// ── Validation summary helper ────────────────────────────────────────────

/**
 * Aplica un validator a un array y devuelve los validados + issues.
 * Útil para logging masivo.
 */
export function validateAll<T>(
  items: ReadonlyArray<unknown> | null | undefined,
  validator: (x: unknown) => ValidatorResult<T | null>
): { valid: T[]; issues: { item: unknown; issue: string | null | undefined }[] } {
  const valid: T[] = [];
  const issues: { item: unknown; issue: string | null | undefined }[] = [];
  for (const item of items || []) {
    const r = validator(item);
    if (r.isValid && r.value !== null) {
      valid.push(r.value as T);
    } else if (r.value !== null) {
      valid.push(r.value as T);
      issues.push({ item, issue: r.issue });
    }
  }
  if (issues.length > 0) {
    console.info(
      `[validators] ${issues.length}/${(items || []).length} items con issues no críticos`
    );
  }
  return { valid, issues };
}
