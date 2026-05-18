import { describe, it, expect } from 'vitest';
import { detectKind, shouldHideEpsMetrics } from '../companyKind';

describe('detectKind — REIT detection', () => {
  it('classifies Real Estate sector as REIT', () => {
    const flags = detectKind(
      { profile: { sector: 'Real Estate', industry: 'REIT—Residential' } },
      { ticker: 'O' },
    );
    expect(flags.kind).toBe('REIT');
    expect(flags.isReit).toBe(true);
    expect(flags.isReitLike).toBe(true);
    expect(flags.source).toBe('profile');
  });

  it('classifies REIT via cfg.cat override', () => {
    const flags = detectKind(null, { ticker: 'X', cat: 'REIT' });
    expect(flags.isReit).toBe(true);
    expect(flags.source).toBe('cat');
  });

  it('classifies via heuristic when sector is missing (D&A heavy + dividends)', () => {
    // Foreign REIT con sector vacío en FMP. Heurística pillaría por D&A/rev ratio.
    const fin = { revenue: 1000, depreciation: 280, netIncome: 200, dps: 6 };
    const flags = detectKind({ profile: {} }, { ticker: 'UNKNOWN-REIT' }, fin);
    expect(flags.isReit).toBe(true);
    expect(flags.source).toBe('heuristic');
  });

  it('classifies industry hint "specialty REIT" correctly', () => {
    const flags = detectKind({ profile: { sector: 'Other', industry: 'Specialty REIT' } }, { ticker: 'IIPR' });
    expect(flags.isReit).toBe(true);
  });
});

describe('detectKind — ETF detection', () => {
  it('detects ETF when profile.isEtf=true', () => {
    const flags = detectKind({ profile: { isEtf: true, sector: 'Financial Services' } }, { ticker: 'SCHD' });
    expect(flags.isEtf).toBe(true);
    expect(flags.isReit).toBe(false);
  });

  it('detects known ETF ticker even if sector is wrong', () => {
    // Bug SCHD — FMP devolvía "Financial Services" pero es ETF de dividendos
    const flags = detectKind({ profile: { sector: 'Financial Services', isEtf: null } }, { ticker: 'SCHD' });
    expect(flags.isEtf).toBe(true);
    expect(flags.kind).toBe('ETF');
  });

  it('detects DIVO/BIZD as ETFs', () => {
    expect(detectKind(null, { ticker: 'DIVO' }).isEtf).toBe(true);
    expect(detectKind(null, { ticker: 'BIZD' }).isEtf).toBe(true);
  });
});

describe('detectKind — Crypto detection', () => {
  it('classifies BTC and ETH tickers as crypto', () => {
    expect(detectKind(null, { ticker: 'BTC-USD' }).isCrypto).toBe(true);
    expect(detectKind(null, { ticker: 'ETH' }).isCrypto).toBe(true);
  });

  it('classifies via cfg.cat=crypto', () => {
    expect(detectKind(null, { ticker: 'X', cat: 'CRYPTO' }).isCrypto).toBe(true);
  });
});

describe('detectKind — BDC detection', () => {
  it('detects industry hint "business development"', () => {
    const flags = detectKind(
      { profile: { sector: 'Financial Services', industry: 'Asset Management - Business Development' } },
      { ticker: 'MAIN' },
    );
    expect(flags.isBdc).toBe(true);
  });

  it('uses heuristic when name contains BDC', () => {
    const flags = detectKind(
      { profile: { sector: 'Finance', industry: 'Asset Management', companyName: 'Capital BDC Corp' } },
      { ticker: 'X' },
      { totalDebt: 500, equity: 400, dps: 1.5, revenue: 100 },
    );
    expect(flags.isBdc).toBe(true);
  });
});

describe('detectKind — Insurance / Bank', () => {
  it('detects Insurance industry', () => {
    const flags = detectKind(
      { profile: { sector: 'Financial Services', industry: 'Insurance—Life' } },
      { ticker: 'MET' },
    );
    expect(flags.isInsurance).toBe(true);
  });

  it('detects Bank via industry', () => {
    const flags = detectKind(
      { profile: { sector: 'Financial Services', industry: 'Banks - Diversified' } },
      { ticker: 'JPM' },
    );
    expect(flags.isBank).toBe(true);
  });
});

describe('detectKind — Default OPERATING + negative equity', () => {
  it('returns OPERATING for normal industrials', () => {
    const flags = detectKind(
      { profile: { sector: 'Industrials', industry: 'Specialty Industrial Machinery' } },
      { ticker: 'CAT' },
    );
    expect(flags.kind).toBe('OPERATING');
    expect(flags.isReit).toBe(false);
    expect(flags.isReitLike).toBe(false);
  });

  it('flags negative equity (MCD/BA/HD buybacks pattern)', () => {
    const flags = detectKind(null, { ticker: 'MCD' }, { equity: -3000, totalDebt: 50000 });
    expect(flags.negativeEquity).toBe(true);
  });
});

describe('shouldHideEpsMetrics', () => {
  it('hides EPS-based metrics for REITs', () => {
    const flags = detectKind(null, { ticker: 'O', cat: 'REIT' });
    expect(shouldHideEpsMetrics(flags)).toBe(true);
  });

  it('hides EPS-based metrics for ETFs', () => {
    const flags = detectKind(null, { ticker: 'SCHD' });
    expect(shouldHideEpsMetrics(flags)).toBe(true);
  });

  it('hides for negative equity', () => {
    const flags = detectKind(null, { ticker: 'MCD' }, { equity: -100 });
    expect(shouldHideEpsMetrics(flags)).toBe(true);
  });

  it('does NOT hide for normal operating company', () => {
    const flags = detectKind({ profile: { sector: 'Consumer Staples' } }, { ticker: 'KO' });
    expect(shouldHideEpsMetrics(flags)).toBe(false);
  });
});

describe('detectKind — defensive against bad input', () => {
  it('handles null fmpExtra and cfg', () => {
    const flags = detectKind(null, null);
    expect(flags.kind).toBe('OPERATING');
  });

  it('handles undefined LD', () => {
    const flags = detectKind({ profile: { sector: 'Energy' } }, { ticker: 'XOM' }, undefined);
    expect(flags.kind).toBe('OPERATING');
  });

  it('handles empty objects gracefully', () => {
    const flags = detectKind({}, {});
    expect(flags.kind).toBe('OPERATING');
  });
});
