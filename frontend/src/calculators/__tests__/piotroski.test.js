import { describe, it, expect } from 'vitest';
import { calcPiotroski } from '../piotroski.js';

const makePeriod = (overrides = {}) => ({
  netIncome: 100, equity: 800, totalDebt: 200, cash: 150,
  grossProfit: 400, revenue: 1000, ocf: 120, sharesOut: 50,
  ...overrides,
});

describe('calcPiotroski', () => {
  it('returns score 0 with no data', () => {
    expect(calcPiotroski(null, null)).toEqual({ score: 0, items: [] });
  });

  it('scores 9/9 for a perfect company', () => {
    const prev = makePeriod({
      netIncome: 80, totalDebt: 250, cash: 100, grossProfit: 350,
      revenue: 900, ocf: 90, sharesOut: 55,
    });
    const curr = makePeriod();
    const r = calcPiotroski(curr, prev);
    expect(r.score).toBe(9);
    expect(r.items).toHaveLength(9);
    expect(r.items.every(i => i.pass)).toBe(true);
  });

  it('scores low for a deteriorating company', () => {
    const prev = makePeriod();
    const curr = makePeriod({
      netIncome: -10, ocf: -5, totalDebt: 300, cash: 50,
      grossProfit: 350, revenue: 900, sharesOut: 60,
    });
    const r = calcPiotroski(curr, prev);
    // Debt increased but cash/debt ratio might still pass depending on ratios
    expect(r.score).toBeLessThanOrEqual(2);
    expect(r.items).toHaveLength(9);
  });

  it('correctly checks OCF > Net Income', () => {
    const prev = makePeriod();
    const curr = makePeriod({ netIncome: 100, ocf: 50 }); // ocf < netIncome
    const r = calcPiotroski(curr, prev);
    const qualItem = r.items.find(i => i.name === 'OCF > Net Income');
    expect(qualItem.pass).toBe(false);
  });

  it('detects share dilution', () => {
    const prev = makePeriod({ sharesOut: 50 });
    const curr = makePeriod({ sharesOut: 60 });
    const r = calcPiotroski(curr, prev);
    const dilItem = r.items.find(i => i.name === 'Sin dilución');
    expect(dilItem.pass).toBe(false);
  });

  it('passes share dilution check when shares decrease (buyback)', () => {
    const prev = makePeriod({ sharesOut: 60 });
    const curr = makePeriod({ sharesOut: 50 });
    const r = calcPiotroski(curr, prev);
    const dilItem = r.items.find(i => i.name === 'Sin dilución');
    expect(dilItem.pass).toBe(true);
  });

  it('passes debt check when debt decreases', () => {
    const prev = makePeriod({ totalDebt: 300 });
    const curr = makePeriod({ totalDebt: 200 });
    const r = calcPiotroski(curr, prev);
    const debtItem = r.items.find(i => i.name === 'Deuda decreciente');
    expect(debtItem.pass).toBe(true);
  });

  it('fails debt check when debt increases', () => {
    const prev = makePeriod({ totalDebt: 200 });
    const curr = makePeriod({ totalDebt: 300 });
    const r = calcPiotroski(curr, prev);
    const debtItem = r.items.find(i => i.name === 'Deuda decreciente');
    expect(debtItem.pass).toBe(false);
  });

  it('checks ROA positive on negative net income', () => {
    const prev = makePeriod();
    const curr = makePeriod({ netIncome: -50 });
    const r = calcPiotroski(curr, prev);
    const roaItem = r.items.find(i => i.name === 'ROA positivo');
    expect(roaItem.pass).toBe(false);
  });

  it('returns array of 9 items regardless of values', () => {
    const r = calcPiotroski(makePeriod(), makePeriod());
    expect(r.items).toHaveLength(9);
    expect(r.items.every(i => typeof i.pass === 'boolean')).toBe(true);
  });

  it('returns only false passes when missing prev (null)', () => {
    const r = calcPiotroski(makePeriod(), null);
    expect(r.score).toBe(0);
    expect(r.items).toHaveLength(0);
  });

  it('checks gross margin improvement', () => {
    const prev = makePeriod({ grossProfit: 300, revenue: 1000 }); // 30%
    const curr = makePeriod({ grossProfit: 400, revenue: 1000 }); // 40%
    const r = calcPiotroski(curr, prev);
    const gmItem = r.items.find(i => i.name === 'Margen bruto mejora');
    expect(gmItem.pass).toBe(true);
  });
});
