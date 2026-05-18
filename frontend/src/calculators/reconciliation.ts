// reconciliation.ts — lógica pura de reconciliación D1 vs IB / Flex / FMP.
//
// Capa 4 hardening: cross-checks que detectan regresiones silenciosas.
// El endpoint /api/reconcile/daily en worker.js implementa estas mismas
// reglas en SQL, pero las re-implementamos aquí para tests unitarios.
//
// Bugs evitados:
//   • Bug Bridge-Array silent noop: positions inflated → reconcile catches
//   • Bug DEO phantom: shares=0 + bruto>1 → flagged
//   • Bug RED currency='USD' (debería ser EUR): ratio market/usd != 1
//   • Bug #014 multi-currency NAV inflated: bridge NAV != Σ usd_value

export interface PositionAggCheck {
  ticker: string;
  positions_shares: number;
  cost_basis_shares: number;
  diff: number;
}

export interface PhantomDividendCheck {
  ticker?: string;
  shares: number;
  bruto: number;
  is_phantom: boolean;
}

export interface CurrencyMismatchCheck {
  ticker: string;
  currency: string;
  market_value: number;
  usd_value: number;
  ratio: number;
  is_mismatch: boolean;
}

export interface NavCheck {
  bridge_nav: number;
  app_total: number;
  ratio: number;
  diff_pct: number;
  is_critical: boolean;
}

export interface ReconcileSummary {
  ok: boolean;
  critical_count: number;
  warning_count: number;
  total_checks: number;
}

/**
 * Detecta posiciones donde cost_basis tiene MÁS shares que positions.
 * Tolera diff < 1 (fracciones DRIP). Permite cost_basis < positions (trades sin import).
 *
 * @param positions Array {ticker, shares}.
 * @param costBasisAgg Array {ticker, shares} agregado (excluyendo DIVIDENDS).
 * @returns Tickers donde cost_basis > positions con diff > 1.
 */
export function detectPositionAggInconsistencies(
  positions: ReadonlyArray<{ ticker: string; shares: number }>,
  costBasisAgg: ReadonlyArray<{ ticker: string; shares: number }>,
): PositionAggCheck[] {
  const cbMap = new Map<string, number>();
  for (const cb of costBasisAgg) {
    cbMap.set(cb.ticker.toUpperCase(), (cbMap.get(cb.ticker.toUpperCase()) || 0) + cb.shares);
  }
  const issues: PositionAggCheck[] = [];
  for (const p of positions) {
    if (!p.shares || p.shares <= 0) continue;
    const cbShares = cbMap.get(p.ticker.toUpperCase()) || 0;
    const diff = cbShares - p.shares;
    if (diff > 1) {
      issues.push({
        ticker: p.ticker,
        positions_shares: p.shares,
        cost_basis_shares: cbShares,
        diff,
      });
    }
  }
  return issues;
}

/**
 * Detecta dividendos con shares=0 (o null) + bruto>1.
 * Suele ser "Payment In Lieu" no clasificado o bug DEO phantom.
 */
export function detectPhantomDividends(
  dividends: ReadonlyArray<{ ticker?: string; shares?: number | null; bruto?: number | null }>,
): PhantomDividendCheck[] {
  const issues: PhantomDividendCheck[] = [];
  for (const d of dividends) {
    const shares = d.shares ?? 0;
    const bruto = d.bruto ?? 0;
    if (shares === 0 && bruto > 1) {
      issues.push({
        ticker: d.ticker,
        shares,
        bruto,
        is_phantom: true,
      });
    }
  }
  return issues;
}

/**
 * Detecta positions con currency='USD' donde market_value y usd_value divergen.
 * Bug RED: UPSERT no actualizaba currency cuando el ticker era nuevo.
 *
 * @param tolerance Diferencia % aceptable (default 5%).
 */
export function detectCurrencyMismatches(
  positions: ReadonlyArray<{ ticker: string; currency?: string | null; market_value?: number | null; usd_value?: number | null }>,
  tolerance: number = 0.05,
): CurrencyMismatchCheck[] {
  const issues: CurrencyMismatchCheck[] = [];
  for (const p of positions) {
    if (!p.market_value || !p.usd_value) continue;
    if (p.currency !== 'USD') continue;
    const ratio = p.market_value / p.usd_value;
    if (Math.abs(ratio - 1) > tolerance) {
      issues.push({
        ticker: p.ticker,
        currency: p.currency,
        market_value: p.market_value,
        usd_value: p.usd_value,
        ratio,
        is_mismatch: true,
      });
    }
  }
  return issues;
}

/**
 * Compara NAV reportado por bridge IB vs Σ usd_value de positions D1.
 * Bug #014: si suma de pesos divergencia >10%, hay leak multi-currency.
 *
 * @param threshold Diferencia aceptable (default 10%).
 */
export function checkNavConsistency(
  bridgeNav: number,
  appTotalUsd: number,
  threshold: number = 0.10,
): NavCheck {
  if (bridgeNav <= 0 || appTotalUsd <= 0) {
    return { bridge_nav: bridgeNav, app_total: appTotalUsd, ratio: 0, diff_pct: 0, is_critical: false };
  }
  const ratio = appTotalUsd / bridgeNav;
  const diffPct = (ratio - 1) * 100;
  return {
    bridge_nav: bridgeNav,
    app_total: appTotalUsd,
    ratio,
    diff_pct: diffPct,
    is_critical: Math.abs(ratio - 1) > threshold,
  };
}

/**
 * Detecta duplicados en dividendos por (account, ticker, fecha).
 * Útil para detectar dups que esquivaron UNIQUE INDEX por NULL en account.
 */
export interface DividendDupCheck {
  account: string;
  ticker: string;
  fecha: string;
  count: number;
}

export function detectDividendDuplicates(
  dividends: ReadonlyArray<{ account?: string | null; ticker: string; fecha: string }>,
): DividendDupCheck[] {
  const counts = new Map<string, { account: string; ticker: string; fecha: string; count: number }>();
  for (const d of dividends) {
    const acct = d.account || '_';
    const key = `${acct}|${d.ticker}|${d.fecha}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { account: acct, ticker: d.ticker, fecha: d.fecha, count: 1 });
    }
  }
  return Array.from(counts.values()).filter(x => x.count > 1);
}

/**
 * Agrega contadores en summary report.
 * Critical: agg inconsistencies + nav mismatch. Warning: phantoms + ccy + dups.
 */
export function buildReconcileSummary(checks: {
  positionAgg: PositionAggCheck[];
  phantomDivs: PhantomDividendCheck[];
  ccyMismatches: CurrencyMismatchCheck[];
  nav: NavCheck | null;
  divDups: DividendDupCheck[];
  divLegacyCount: number;  // Bug #011 — cost_basis tipo=DIVIDENDS con shares>0
}): ReconcileSummary {
  const criticalCount =
    checks.positionAgg.length +
    (checks.nav?.is_critical ? 1 : 0) +
    (checks.divLegacyCount > 0 ? 1 : 0);
  const warningCount =
    checks.phantomDivs.length +
    checks.ccyMismatches.length +
    checks.divDups.length;
  return {
    ok: criticalCount === 0,
    critical_count: criticalCount,
    warning_count: warningCount,
    total_checks: 6,
  };
}
