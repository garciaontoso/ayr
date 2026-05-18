// Regression test — REIT / BDC EBITDA proxy (Bug #006 expanded).
//
// REITs y BDCs tienen operating income bajo por D&A pesado / cost de capital.
// Si usamos EBITDA contable (= operatingIncome + D&A) los ratios EV/EBITDA
// explotan (O mostraba 75× cuando peers REIT cotizan 18-22×).
//
// Fix: cuando EBITDA contable < 10% revenue, usar proxy = OCF + interestExpense
// (estándar S&P para REITs/Insurance/Bank).
//
// Test garantiza:
//   1. Industrial sano usa accounting (KO 30% rev margin)
//   2. REIT con accounting <10% rev usa proxy
//   3. detectKind() identifica REITs correctamente
//   4. shouldHideEpsMetrics() devuelve true para REITs/ETFs

import { describe, it, expect } from 'vitest';
import { calcEbitdaRobust } from '../../src/calculators/companyMetrics';
import { detectKind, shouldHideEpsMetrics } from '../../src/utils/companyKind';

describe('Bug REIT-EBITDA — accounting vs proxy switch', () => {
  it('industrial company uses accounting EBITDA (KO scenario)', () => {
    // KO 2024: revenue 47B, opInc 13B, D&A 1.1B → accounting EBITDA = 14.1B (30% rev)
    const r = calcEbitdaRobust({
      revenue: 47000, operatingIncome: 13000, depreciation: 1100,
      ocf: 12000, interestExpense: 500,
    });
    expect(r.source).toBe('accounting');
    expect(r.ebitda).toBe(14100);
  });

  it('REIT switches to proxy when accounting < 10% revenue', () => {
    // REIT con altísimo D&A: accounting 200 (4% rev) → proxy 5000 (100% rev)
    const r = calcEbitdaRobust({
      revenue: 5000, operatingIncome: 50, depreciation: 150,
      ocf: 4200, interestExpense: 800,
    });
    expect(r.source).toBe('proxy');
    expect(r.ebitda).toBe(5000);  // ocf + interestExpense
  });

  it('regression: EV/EBITDA absurdo cuando NO usa proxy', () => {
    // Si el código volviera a usar siempre accounting: EV/EBITDA = 100B/0.2B = 500×
    // Con proxy: EV/EBITDA = 100B/5B = 20× (correcto para REIT)
    const r = calcEbitdaRobust({
      revenue: 5000, operatingIncome: 50, depreciation: 150,
      ocf: 4200, interestExpense: 800,
    });
    const ev = 100000;
    const evToEbitda = ev / r.ebitda;
    expect(evToEbitda).toBeLessThan(30);  // razonable para REIT
    expect(evToEbitda).toBeGreaterThan(15);
  });
});

describe('Bug REIT-detection — sector + heuristic fallback', () => {
  it('detects via sector="Real Estate"', () => {
    const flags = detectKind(
      { profile: { sector: 'Real Estate', industry: 'REIT—Diversified' } },
      { ticker: 'O' },
    );
    expect(flags.isReit).toBe(true);
    expect(shouldHideEpsMetrics(flags)).toBe(true);
  });

  it('detects via industry hint when sector vacío', () => {
    const flags = detectKind(
      { profile: { sector: '', industry: 'Specialty REIT' } },
      { ticker: 'IIPR' },
    );
    expect(flags.isReit).toBe(true);
  });

  it('detects via heuristic (D&A heavy + dividend)', () => {
    // Empresa sin sector pero con métricas típicas de REIT
    const flags = detectKind(
      { profile: {} },
      { ticker: 'UNKNOWN' },
      { revenue: 1000, depreciation: 250, netIncome: 200, dps: 5 },
    );
    expect(flags.isReit).toBe(true);
    expect(flags.source).toBe('heuristic');
  });

  it('regression: SCHD ETF NOT classified as bank (Bug #SCHD)', () => {
    // FMP devolvía SCHD con sector "Financial Services" — bug histórico.
    const flags = detectKind(
      { profile: { sector: 'Financial Services', isEtf: null } },
      { ticker: 'SCHD' },
    );
    expect(flags.isEtf).toBe(true);
    expect(flags.isBank).toBe(false);
  });

  it('regression: industrial companies NOT classified as REIT', () => {
    const flags = detectKind(
      { profile: { sector: 'Industrials', industry: 'Specialty Industrial' } },
      { ticker: 'CAT' },
    );
    expect(flags.isReit).toBe(false);
    expect(flags.kind).toBe('OPERATING');
  });
});

describe('Bug REIT-EPS — hide EPS-based metrics', () => {
  it('hides EPS metrics for REITs (AFFO preferred)', () => {
    const flags = detectKind(null, { ticker: 'O', cat: 'REIT' });
    expect(shouldHideEpsMetrics(flags)).toBe(true);
  });

  it('hides EPS metrics for ETFs', () => {
    const flags = detectKind(null, { ticker: 'SCHD' });
    expect(shouldHideEpsMetrics(flags)).toBe(true);
  });

  it('does NOT hide for normal operating company', () => {
    const flags = detectKind({ profile: { sector: 'Consumer Staples' } }, { ticker: 'KO' });
    expect(shouldHideEpsMetrics(flags)).toBe(false);
  });

  it('hides for negative-equity companies (MCD pattern)', () => {
    // MCD tiene equity NEGATIVO (-3.7B). ROE/P/B inválidos.
    const flags = detectKind(null, { ticker: 'MCD' }, { equity: -3700 });
    expect(shouldHideEpsMetrics(flags)).toBe(true);
  });
});
