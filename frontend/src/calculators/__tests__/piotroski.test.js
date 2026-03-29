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
});
