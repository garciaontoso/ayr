import { describe, it, expect } from 'vitest';
import {
  detectPositionAggInconsistencies,
  detectPhantomDividends,
  detectCurrencyMismatches,
  checkNavConsistency,
  detectDividendDuplicates,
  buildReconcileSummary,
} from '../reconciliation';

describe('detectPositionAggInconsistencies', () => {
  it('flags cost_basis > positions (duplicate trades)', () => {
    const positions = [{ ticker: 'PG', shares: 100 }];
    const costBasis = [{ ticker: 'PG', shares: 250 }];  // bug: dup imports
    const issues = detectPositionAggInconsistencies(positions, costBasis);
    expect(issues).toHaveLength(1);
    expect(issues[0].diff).toBe(150);
    expect(issues[0].ticker).toBe('PG');
  });

  it('does NOT flag cost_basis < positions (trades pending import)', () => {
    const positions = [{ ticker: 'KO', shares: 100 }];
    const costBasis = [{ ticker: 'KO', shares: 80 }];  // OK, 20 sin importar
    const issues = detectPositionAggInconsistencies(positions, costBasis);
    expect(issues).toHaveLength(0);
  });

  it('tolerates fractional DRIP diff < 1', () => {
    const positions = [{ ticker: 'O', shares: 100.5 }];
    const costBasis = [{ ticker: 'O', shares: 101.2 }];
    const issues = detectPositionAggInconsistencies(positions, costBasis);
    expect(issues).toHaveLength(0);
  });

  it('case-insensitive ticker matching', () => {
    const positions = [{ ticker: 'PG', shares: 100 }];
    const costBasis = [{ ticker: 'pg', shares: 200 }];  // lowercase
    const issues = detectPositionAggInconsistencies(positions, costBasis);
    expect(issues).toHaveLength(1);
  });

  it('aggregates multiple cost_basis rows per ticker', () => {
    // Multi-account: 3 rows, suma 300 vs positions.shares 100
    const positions = [{ ticker: 'JNJ', shares: 100 }];
    const costBasis = [
      { ticker: 'JNJ', shares: 100 },
      { ticker: 'JNJ', shares: 100 },
      { ticker: 'JNJ', shares: 100 },  // dup
    ];
    const issues = detectPositionAggInconsistencies(positions, costBasis);
    expect(issues[0].cost_basis_shares).toBe(300);
    expect(issues[0].diff).toBe(200);
  });
});

describe('detectPhantomDividends — Bug DEO phantom', () => {
  it('flags shares=0 + bruto>1 (payment-in-lieu)', () => {
    const divs = [
      { ticker: 'DEO', shares: 0, bruto: 620.12 },  // phantom real
    ];
    const issues = detectPhantomDividends(divs);
    expect(issues).toHaveLength(1);
    expect(issues[0].ticker).toBe('DEO');
  });

  it('does NOT flag shares=0 + bruto=0 (cancelled dividend)', () => {
    const divs = [{ shares: 0, bruto: 0 }];
    expect(detectPhantomDividends(divs)).toHaveLength(0);
  });

  it('does NOT flag normal dividend (shares>0)', () => {
    const divs = [{ ticker: 'KO', shares: 100, bruto: 47.5 }];
    expect(detectPhantomDividends(divs)).toHaveLength(0);
  });

  it('handles null shares as 0', () => {
    const divs = [{ ticker: 'X', shares: null, bruto: 50 }];
    expect(detectPhantomDividends(divs)).toHaveLength(1);
  });
});

describe('detectCurrencyMismatches — Bug RED', () => {
  it('flags currency=USD with market != usd_value (>5%)', () => {
    // RED bug: stored as USD but is EUR. market_value 1000 EUR, usd_value 1086
    const positions = [
      { ticker: 'RED.MC', currency: 'USD', market_value: 1000, usd_value: 1086 },
    ];
    const issues = detectCurrencyMismatches(positions);
    expect(issues).toHaveLength(1);
    expect(issues[0].ratio).toBeCloseTo(0.921, 2);
  });

  it('does NOT flag currency != USD (multi-currency expected to differ)', () => {
    // EUR position correctly stored: market 1000 EUR, usd 1086 USD
    const positions = [
      { ticker: 'TEF.MC', currency: 'EUR', market_value: 1000, usd_value: 1086 },
    ];
    expect(detectCurrencyMismatches(positions)).toHaveLength(0);
  });

  it('does NOT flag USD positions with consistent values', () => {
    const positions = [
      { ticker: 'KO', currency: 'USD', market_value: 7000, usd_value: 7000 },
    ];
    expect(detectCurrencyMismatches(positions)).toHaveLength(0);
  });

  it('tolerates small float drift (< 5%)', () => {
    const positions = [
      { ticker: 'X', currency: 'USD', market_value: 1000, usd_value: 1020 },  // 2% off
    ];
    expect(detectCurrencyMismatches(positions)).toHaveLength(0);
  });

  it('respects custom tolerance', () => {
    const positions = [
      { ticker: 'X', currency: 'USD', market_value: 1000, usd_value: 950 },  // 5% diff
    ];
    expect(detectCurrencyMismatches(positions, 0.10)).toHaveLength(0);
    expect(detectCurrencyMismatches(positions, 0.03)).toHaveLength(1);
  });
});

describe('checkNavConsistency — Bug #014 multi-currency', () => {
  it('OK when app total ≈ bridge nav', () => {
    const r = checkNavConsistency(1380000, 1390000);
    expect(r.is_critical).toBe(false);
    expect(r.diff_pct).toBeCloseTo(0.72, 1);
  });

  it('CRITICAL when app inflated by HKD multi-currency leak', () => {
    // App reports 3.4M because HKD market_value summed direct
    // Bridge says 1.38M actual NAV
    const r = checkNavConsistency(1380000, 3400000);
    expect(r.is_critical).toBe(true);
    expect(r.ratio).toBeCloseTo(2.46, 2);
    expect(r.diff_pct).toBeGreaterThan(100);
  });

  it('not critical when both zero', () => {
    const r = checkNavConsistency(0, 0);
    expect(r.is_critical).toBe(false);
  });

  it('respects custom threshold', () => {
    // 15% diff
    expect(checkNavConsistency(1000, 1150, 0.10).is_critical).toBe(true);
    expect(checkNavConsistency(1000, 1150, 0.20).is_critical).toBe(false);
  });
});

describe('detectDividendDuplicates — UNIQUE INDEX bypass guard', () => {
  it('detects same (account, ticker, fecha) appearing twice', () => {
    const divs = [
      { account: 'U1', ticker: 'KO', fecha: '2025-04-01' },
      { account: 'U1', ticker: 'KO', fecha: '2025-04-01' },  // dup
    ];
    const dups = detectDividendDuplicates(divs);
    expect(dups).toHaveLength(1);
    expect(dups[0].count).toBe(2);
  });

  it('null account treated as same bucket', () => {
    const divs = [
      { ticker: 'KO', fecha: '2025-04-01', account: null },
      { ticker: 'KO', fecha: '2025-04-01' },  // sin account
    ];
    expect(detectDividendDuplicates(divs)).toHaveLength(1);
  });

  it('different fecha = no dup', () => {
    const divs = [
      { account: 'U1', ticker: 'KO', fecha: '2025-04-01' },
      { account: 'U1', ticker: 'KO', fecha: '2025-07-01' },
    ];
    expect(detectDividendDuplicates(divs)).toHaveLength(0);
  });

  it('different account = no dup', () => {
    const divs = [
      { account: 'U1', ticker: 'KO', fecha: '2025-04-01' },
      { account: 'U2', ticker: 'KO', fecha: '2025-04-01' },
    ];
    expect(detectDividendDuplicates(divs)).toHaveLength(0);
  });
});

describe('buildReconcileSummary', () => {
  it('all OK', () => {
    const r = buildReconcileSummary({
      positionAgg: [], phantomDivs: [], ccyMismatches: [],
      nav: { is_critical: false }, divDups: [], divLegacyCount: 0,
    });
    expect(r.ok).toBe(true);
    expect(r.critical_count).toBe(0);
  });

  it('flags critical when position agg fails', () => {
    const r = buildReconcileSummary({
      positionAgg: [{ ticker: 'PG' }, { ticker: 'KO' }],
      phantomDivs: [], ccyMismatches: [],
      nav: { is_critical: false }, divDups: [], divLegacyCount: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.critical_count).toBe(2);
  });

  it('flags critical when NAV diverges', () => {
    const r = buildReconcileSummary({
      positionAgg: [], phantomDivs: [], ccyMismatches: [],
      nav: { is_critical: true }, divDups: [], divLegacyCount: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.critical_count).toBe(1);
  });

  it('warnings do not affect OK status', () => {
    const r = buildReconcileSummary({
      positionAgg: [],
      phantomDivs: [{ ticker: 'DEO' }],
      ccyMismatches: [{ ticker: 'RED.MC' }],
      nav: { is_critical: false },
      divDups: [{ ticker: 'KO' }],
      divLegacyCount: 0,
    });
    expect(r.ok).toBe(true);
    expect(r.warning_count).toBe(3);
  });

  it('Bug #011 legacy counts as critical', () => {
    const r = buildReconcileSummary({
      positionAgg: [], phantomDivs: [], ccyMismatches: [],
      nav: { is_critical: false }, divDups: [], divLegacyCount: 5,
    });
    expect(r.critical_count).toBe(1);
    expect(r.ok).toBe(false);
  });
});
