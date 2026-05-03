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

// ── Helpers genéricos ────────────────────────────────────────────────────

const _API_URL = 'https://api.onto-so.com';
const _logged = new Set();

function _warnOnce(key, msg, data) {
  if (_logged.has(key)) return;
  _logged.add(key);
  console.warn('[validator]', msg, data || '');
  // Post to /api/error-log in production (or when ayr_force_error_log=1 in dev)
  const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD;
  const forceLog = typeof localStorage !== 'undefined' && localStorage.getItem('ayr_force_error_log') === '1';
  if (isProd || forceLog) {
    try {
      fetch(`${_API_URL}/api/error-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: 'warn',
          message: msg,
          context: JSON.stringify(data || null),
          buildId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BUILD_ID) || 'dev',
        }),
      }).catch(() => {});
    } catch (_) {}
  }
}

// ── Primitivos ───────────────────────────────────────────────────────────

export function validateNumber(v, { min = -Infinity, max = Infinity, fallback = 0, label = 'number' } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return { value: fallback, isValid: false, issue: `${label}: not finite (got ${typeof v})` };
  if (n < min) return { value: fallback, isValid: false, issue: `${label}: ${n} < min ${min}` };
  if (n > max) return { value: fallback, isValid: false, issue: `${label}: ${n} > max ${max}` };
  return { value: n, isValid: true };
}

export function validatePrice(v, label = 'price') {
  return validateNumber(v, { min: 0.01, max: 1e6, fallback: 0, label });
}

export function validatePercent(v, label = 'percent') {
  // Acepta -100% a +1000% por seguridad (cotizaciones extremas)
  return validateNumber(v, { min: -10, max: 10, fallback: 0, label });
}

export function validateShares(v) {
  return validateNumber(v, { min: 0, max: 1e8, fallback: 0, label: 'shares' });
}

export function validateString(v, { fallback = '', maxLen = 200, label = 'string' } = {}) {
  if (typeof v !== 'string') return { value: fallback, isValid: false, issue: `${label}: not string` };
  if (v.length === 0) return { value: fallback, isValid: false, issue: `${label}: empty` };
  return { value: v.slice(0, maxLen), isValid: true };
}

// ── Validators de dominio ────────────────────────────────────────────────

/**
 * Posición de portfolio. Lo mínimo que debe tener para renderizar una fila.
 * Si falta algo crítico devuelve isValid:false.
 */
export function validatePosition(p) {
  if (!p || typeof p !== 'object') return { value: null, isValid: false, issue: 'position: not object' };
  const ticker = (p.ticker || '').toUpperCase();
  if (!ticker) return { value: null, isValid: false, issue: 'position: no ticker' };
  const shares = Number(p.shares) || 0;
  const issues = [];
  if (shares <= 0) issues.push('shares <= 0');
  // sector vacío → warning, no fatal
  if (!p.sector && !p._fund?.sector) issues.push('sector empty');
  return {
    value: {
      ticker,
      name: p.name || ticker,
      shares,
      lastPrice: validatePrice(p.lastPrice).value,
      avgCost: validateNumber(p.avgCost, { min: 0, fallback: 0, label: 'avgCost' }).value,
      sector: p._fund?.sector || p.sector || '',
      industry: p._fund?.industry || p.industry || '',
      currency: p.currency || 'USD',
      account: p.account || null,
    },
    isValid: issues.length === 0,
    issue: issues.length ? issues.join('; ') : null,
  };
}

/**
 * Trade individual de cost_basis. Detecta el bug recurrente DIVIDENDS+shares>0.
 */
export function validateTrade(t) {
  if (!t || typeof t !== 'object') return { value: null, isValid: false, issue: 'trade: not object' };
  const tipo = (t.tipo || t.type || '').toUpperCase();
  const shares = Number(t.shares) || 0;
  const issues = [];
  // Bug pattern #011 — DIVIDENDS no debe tener shares
  if ((tipo === 'DIVIDENDS' || tipo === 'DIVIDEND' || tipo === 'DIV') && shares > 0) {
    issues.push(`legacy bug: DIVIDENDS row with shares=${shares}`);
    _warnOnce(`div-shares-${t.ticker}`, `cost_basis row tiene tipo=DIVIDENDS pero shares=${shares} (bug legacy)`, t);
  }
  return {
    value: {
      ticker: (t.ticker || '').toUpperCase(),
      tipo,
      shares: tipo === 'DIVIDENDS' ? 0 : shares,  // forzar 0 si DIVIDENDS para no contar como buy
      price: Number(t.precio || t.price) || 0,
      account: t.account || null,
      execId: t.exec_id || t.execId || null,
      fecha: t.fecha || t.date || '',
      isOption: tipo === 'OPTION' || tipo === 'OPT',
    },
    isValid: issues.length === 0,
    issue: issues.length ? issues.join('; ') : null,
  };
}

/**
 * Datos fundamentales devueltos por /api/fundamentals/bulk.
 * Detecta bug pattern #001 (claves TTM en arrays anuales).
 */
export function validateFundamentals(f, ticker = '?') {
  if (!f || typeof f !== 'object') return { value: null, isValid: false, issue: 'fundamentals: not object' };
  const profile = f.profile || {};
  const ratiosArr = Array.isArray(f.ratios) ? f.ratios : [];
  const kmArr = Array.isArray(f.keyMetrics) ? f.keyMetrics : [];
  const ratios = ratiosArr[0] || {};
  const km = kmArr[0] || {};
  const issues = [];
  // Bug pattern #010 — mktCap fallback chain
  const mktCap = profile.mktCap || profile.marketCap || km.marketCap || 0;
  if (!mktCap) issues.push('mktCap: no disponible en profile/keyMetrics');
  // Bug pattern #004 — sector siempre debería venir de profile
  if (!profile.sector) issues.push('profile.sector vacío');
  return {
    value: {
      ticker,
      sector: profile.sector || '',
      industry: profile.industry || '',
      country: profile.country || '',
      currency: profile.currency || 'USD',
      marketCap: mktCap,
      beta: validateNumber(profile.beta, { min: -3, max: 5, fallback: 1, label: 'beta' }).value,
      // Bug pattern #001 — leer del array anual [0], no claves TTM
      pe: ratios.priceToEarningsRatio || ratios.peRatio || km.peRatio || profile.pe || 0,
      pb: ratios.priceToBookRatio || km.pbRatio || km.priceToBookRatio || 0,
      evEbitda: ratios.enterpriseValueMultiple
             || ratios.enterpriseValueOverEBITDA
             || km.enterpriseValueOverEBITDA
             || km.evToEBITDA
             || 0,
      roe: ratios.returnOnEquity || km.roe || km.returnOnEquity || 0,
      payoutRatio: ratios.dividendPayoutRatio || ratios.payoutRatio || km.payoutRatio || 0,
      exDivDate: profile.exDivDate || '',
    },
    isValid: issues.length === 0,
    issue: issues.length ? issues.join('; ') : null,
  };
}

/**
 * Detecta REIT por sector/industry. Centralizado para no duplicar lógica.
 */
export function isReit(profile) {
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
export function validateAll(items, validator) {
  const valid = [];
  const issues = [];
  for (const item of items || []) {
    const r = validator(item);
    if (r.isValid) valid.push(r.value);
    else if (r.value) {
      valid.push(r.value);
      issues.push({ item, issue: r.issue });
    }
  }
  if (issues.length > 0) {
    console.info(`[validators] ${issues.length}/${items.length} items con issues no críticos`);
  }
  return { valid, issues };
}
