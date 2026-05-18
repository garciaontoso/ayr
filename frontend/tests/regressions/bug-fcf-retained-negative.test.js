// Regression test — FCF retained MUST be allowed negative (Phil Town signal).
//
// Bug original: el código tenía `retained = Math.max(0, fcf - divs - buybacks - ...)`
// lo cual ESCONDÍA empresas que pagan más en divs+buybacks+debt que su FCF.
// Esa situación es una señal de Phil Town (la empresa está financiando
// distribuciones con deuda → ROE "artificial" → red flag).
//
// El fix: permitir retained negativo. La UI debe pintarlo en rojo si <0.

import { describe, it, expect } from 'vitest';
import { calcFcfAllocation } from '../../src/calculators/companyMetrics';

describe('Bug FCF-Retained — must allow negative', () => {
  it('overdistributing company: retained STAYS negative (Phil Town red flag)', () => {
    // Empresa con FCF $800M paga $1.2B en distribuciones
    const r = calcFcfAllocation({
      ocf: 1000, capex: 200, dividendsPaid: 500, buybacks: 400, debtRepayment: 200, acquisitions: 100,
    });
    expect(r.fcf).toBe(800);
    expect(r.totalDistributed).toBe(1200);
    expect(r.retained).toBe(-400);  // NEGATIVO
    expect(r.overdistributing).toBe(true);
    expect(r.payoutPctOfFcf).toBeGreaterThan(1.0);  // 150%
  });

  it('regression: Math.max(0, retained) BUG must NOT come back', () => {
    // Si alguien re-introdujera la línea `retained: Math.max(0, ...)` en useAnalysisMetrics,
    // este test falla.
    const r = calcFcfAllocation({ ocf: 100, capex: 50, dividendsPaid: 200 });
    expect(r.retained).toBe(-150);
    expect(r.retained).toBeLessThan(0);
  });

  it('healthy company: positive retained reinvested', () => {
    const r = calcFcfAllocation({
      ocf: 12000, capex: 2000, dividendsPaid: 3000, buybacks: 2000,
    });
    expect(r.fcf).toBe(10000);
    expect(r.retained).toBe(5000);
    expect(r.overdistributing).toBe(false);
  });

  it('exactly equal distribution: retained = 0, NOT overdistributing', () => {
    const r = calcFcfAllocation({
      ocf: 1000, capex: 200, dividendsPaid: 800,
    });
    expect(r.fcf).toBe(800);
    expect(r.retained).toBe(0);
    expect(r.overdistributing).toBe(false);
    expect(r.payoutPctOfFcf).toBe(1.0);
  });

  it('100% payout: borderline overdistribution', () => {
    const r = calcFcfAllocation({ ocf: 1000, capex: 0, dividendsPaid: 999 });
    expect(r.fcf).toBe(1000);
    expect(r.retained).toBe(1);
    expect(r.overdistributing).toBe(false);  // 99.9% < 100%
  });

  it('UI integration test: red flag computation', () => {
    // Simulación de la UI que debe pintar rojo retained negativo
    const r = calcFcfAllocation({
      ocf: 500, capex: 200, dividendsPaid: 400,
    });
    const shouldShowRed = r.retained < 0 || r.overdistributing;
    expect(shouldShowRed).toBe(true);
  });
});
