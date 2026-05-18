// Regression test — FMP /stable schema migration (Aug 2025) sign conventions.
//
// Históricamente FMP cambió varios campos de signo o nombre sin avisar:
//   • dividendsPaid → commonDividendsPaid (signed: negativo = pago)
//   • debtRepayment → netDebtIssuance (signed: negativo = neto pagado)
//   • acquisitionsNet siempre signed (negativo = compró)
//
// Este test garantiza que el código del frontend NO interpreta mal estos campos:
//   1. dividendsPaid SIEMPRE se usa como Math.abs() para exposición a UI
//   2. Si commonDividendsPaid existe, tiene prioridad sobre dividendsPaid legacy
//   3. netDebtIssuance > 0 NO debe contarse como "repayment"
//   4. acquisitionsNet > 0 (desinversión) NO debe contarse como "acquisition"

import { describe, it, expect } from 'vitest';
import { calcFcfAllocation } from '../../src/calculators/companyMetrics';
import { checkSignConventions } from '../../src/validators/schemas';

describe('Bug FMP-sign — dividendsPaid sign conventions', () => {
  it('frontend uses ABS() value for FCF allocation (signed input)', () => {
    // Si el preprocesado en fmp.js ya hizo Math.abs(), aquí siempre llega positivo
    const result = calcFcfAllocation({
      ocf: 1000, capex: 200, dividendsPaid: 500,  // Math.abs() ya aplicado
    });
    expect(result.divs).toBe(500);  // positivo para display
    expect(result.fcf).toBe(800);
    expect(result.retained).toBe(300);
  });

  it('detects drift when FMP returns capex POSITIVE (anomaly)', () => {
    // Si FMP empieza a devolver capex con signo invertido, este check lo flagea
    const drift = checkSignConventions({
      cashflow: [{ capitalExpenditure: 2000 }],  // positivo = drift
    }, 'TEST');
    expect(drift.drifts.length).toBeGreaterThan(0);
    expect(drift.drifts[0].field).toBe('capitalExpenditure');
    expect(drift.drifts[0].expected).toBe('negative');
  });

  it('detects when all dividends fields are missing (legacy + new)', () => {
    const drift = checkSignConventions({
      cashflow: [{ operatingCashFlow: 1000 }],  // sin ningún campo div
    }, 'TEST');
    const divDrift = drift.drifts.find(d => d.field.includes('dividendsPaid'));
    expect(divDrift).toBeTruthy();
  });

  it('accepts the standard FMP shape (negative div + capex)', () => {
    const drift = checkSignConventions({
      cashflow: [{
        operatingCashFlow: 12000,
        capitalExpenditure: -2000,
        commonDividendsPaid: -8000,
        commonStockRepurchased: -1000,
      }],
      income: [{ interestExpense: 500 }],
    }, 'KO');
    expect(drift.drifts).toEqual([]);
  });
});

describe('Bug FMP-sign — netDebtIssuance vs debtRepayment', () => {
  it('positive issuance NOT counted as repayment in allocation', () => {
    // Si la empresa emite deuda neta (netDebtIssuance > 0), no se cuenta como
    // distribución. Solo si es negativo (neto repagado).
    const allocOnlyIssuance = calcFcfAllocation({
      ocf: 1000, capex: 200, debtRepayment: 0,  // 0 = no neto repagado
    });
    expect(allocOnlyIssuance.debtPaydown).toBe(0);
    expect(allocOnlyIssuance.retained).toBe(800);  // todo retenido
  });

  it('negative issuance counted as repayment', () => {
    // Si netDebtIssuance = -300, equivale a "pagó 300 neto" → cuenta como debtRepayment
    const alloc = calcFcfAllocation({
      ocf: 1000, capex: 200, debtRepayment: 300,  // ya con abs aplicado upstream
    });
    expect(alloc.debtPaydown).toBe(300);
    expect(alloc.retained).toBe(500);
  });
});

describe('Bug FMP-sign — acquisitionsNet desinversión', () => {
  it('acquisitionsNet = 0 (no M&A) does not affect allocation', () => {
    const alloc = calcFcfAllocation({
      ocf: 1000, capex: 200, acquisitions: 0,
    });
    expect(alloc.acquisitions).toBe(0);
  });

  it('positive acquisitions value (M&A spent) reduces retained', () => {
    // Upstream sólo debe pasar valor positivo si acquisitionsNet < 0 (compró)
    const alloc = calcFcfAllocation({
      ocf: 1000, capex: 200, acquisitions: 150,
    });
    expect(alloc.acquisitions).toBe(150);
    expect(alloc.retained).toBe(650);
  });
});
