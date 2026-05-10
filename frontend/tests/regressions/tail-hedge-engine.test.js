// Sprint 7 — Tail hedge engine tests.
// Pure function coverage: budget, suggest edge cases, payoff scenarios,
// backtest sanity, effectiveness metrics.

import { describe, it, expect } from 'vitest';
import {
  HEDGE_DEFAULTS,
  computeHedgeBudget,
  strikeFromTargetDelta,
  suggestPutRoll,
  suggestVIXCall,
  suggestConvexityBackspread,
  computeHedgeProtection,
  historicalHedgeBacktest,
  evaluateHedgeEffectiveness,
  hedgeBookPayoff,
} from '../../../api/src/lib/tail-hedge-engine.js';

describe('Tail hedge — budget calc', () => {
  it('0.5% of $1.4M = $7000', () => {
    const r = computeHedgeBudget(1_400_000, 0.005, 1.0);
    expect(r.budget).toBe(7000);
  });
  it('returns 0 when NAV missing', () => {
    expect(computeHedgeBudget(0, 0.005).budget).toBe(0);
    expect(computeHedgeBudget(null, 0.005).budget).toBe(0);
    expect(computeHedgeBudget(NaN, 0.005).budget).toBe(0);
  });
  it('scaler=2 doubles budget; scaler=0 suspends', () => {
    expect(computeHedgeBudget(1_000_000, 0.005, 2.0).budget).toBe(10000);
    expect(computeHedgeBudget(1_000_000, 0.005, 0).budget).toBe(0);
  });
});

describe('Tail hedge — strikeFromTargetDelta', () => {
  it('Δ0.05 SPY put is far OTM (≥ ~15% below spot)', () => {
    const k = strikeFromTargetDelta(550, 75 / 365, 0.045, 0.18, 'put', 0.05, 0.013, 5);
    expect(k).toBeLessThan(550 * 0.92);
    expect(k).toBeGreaterThan(550 * 0.6);
  });
  it('Δ0.20 call returns strike above spot', () => {
    const k = strikeFromTargetDelta(100, 45 / 365, 0.045, 0.30, 'call', 0.20, 0, 1);
    expect(k).toBeGreaterThan(100);
  });
  it('returns null when sigma=0', () => {
    expect(strikeFromTargetDelta(100, 0.5, 0.045, 0, 'put', 0.05)).toBe(null);
  });
});

describe('Tail hedge — suggestPutRoll', () => {
  const baseInput = { spot: 550, sigma: 0.18, vix: 16, nav: 1_400_000 };

  it('opens new put when nothing held + VIX moderate', () => {
    const r = suggestPutRoll(baseInput);
    expect(r.action).toBe('open');
    expect(r.suggestion.qty).toBeGreaterThan(0);
    expect(r.suggestion.est_cost).toBeLessThanOrEqual(7000 * 1.05);
    expect(r.suggestion.type).toBe('put');
  });
  it('skips when VIX > 30', () => {
    const r = suggestPutRoll({ ...baseInput, vix: 35 });
    expect(r.action).toBe('skip');
    expect(r.reason).toMatch(/vol expensive/);
  });
  it('doubles size when VIX < 13', () => {
    const r1 = suggestPutRoll({ ...baseInput, vix: 16 });
    const r2 = suggestPutRoll({ ...baseInput, vix: 12 });
    expect(r2.suggestion.scaler).toBe(2);
    expect(r2.suggestion.est_cost).toBeGreaterThan(r1.suggestion.est_cost);
  });
  it('holds when DTE > roll threshold', () => {
    const r = suggestPutRoll({
      ...baseInput,
      currentHedgePosition: { strike: 480, dte: 60, qty: 1 },
    });
    expect(r.action).toBe('hold');
  });
  it('rolls when DTE <= roll threshold', () => {
    const r = suggestPutRoll({
      ...baseInput,
      currentHedgePosition: { strike: 480, dte: 25, qty: 1 },
    });
    expect(r.action).toBe('roll');
  });
  it('skips on missing NAV', () => {
    const r = suggestPutRoll({ spot: 550, sigma: 0.18, vix: 16, nav: 0 });
    expect(r.action).toBe('skip');
  });
});

describe('Tail hedge — suggestVIXCall', () => {
  it('skips when VIX too high', () => {
    const r = suggestVIXCall({ vix: 18, spy_regime: 'trending_up', ivRank: 20, nav: 1_400_000 });
    expect(r.action).toBe('skip');
  });
  it('opens when VIX low + uptrend + low IVR', () => {
    const r = suggestVIXCall({ vix: 12, spy_regime: 'trending_up', ivRank: 20, nav: 1_400_000 });
    expect(r.action).toBe('open');
    expect(r.suggestion.type).toBe('call');
  });
  it('skips when SPY regime is volatile', () => {
    const r = suggestVIXCall({ vix: 12, spy_regime: 'volatile', ivRank: 20, nav: 1_400_000 });
    expect(r.action).toBe('skip');
  });
  it('closes existing position when VIX > 25 (vol expansion)', () => {
    const r = suggestVIXCall({
      vix: 30, nav: 1_400_000,
      currentHedgePosition: { strike: 18, dte: 30, qty: 1 },
    });
    expect(r.action).toBe('close');
    expect(r.reason).toMatch(/vol expansion/);
  });
});

describe('Tail hedge — suggestConvexityBackspread', () => {
  it('returns backspread legs structure', () => {
    const r = suggestConvexityBackspread({
      spot: 550, sigma: 0.18, vix: 16, ivRank: 20, nav: 1_400_000,
    });
    if (r.action === 'open') {
      expect(r.suggestion.legs).toHaveLength(2);
      const longLeg = r.suggestion.legs.find(l => l.action === 'buy');
      const shortLeg = r.suggestion.legs.find(l => l.action === 'sell');
      expect(longLeg.qty).toBe(shortLeg.qty * 2);
      expect(longLeg.strike).toBeLessThan(shortLeg.strike);
    } else {
      expect(['skip', 'open']).toContain(r.action);
    }
  });
  it('skips when IVR too high', () => {
    const r = suggestConvexityBackspread({
      spot: 550, sigma: 0.30, vix: 25, ivRank: 80, nav: 1_400_000,
    });
    expect(r.action).toBe('skip');
  });
});

describe('Tail hedge — computeHedgeProtection', () => {
  it('Long put profits on big down move (S=spot×0.7)', () => {
    const legs = [{ type: 'put', strike: 500, action: 'buy', qty: 5, T: 60 / 365, sigma: 0.30 }];
    const out = computeHedgeProtection(legs, 550, [-0.30, 0]);
    const downSc = out.find(o => o.scenario === -0.30);
    const flatSc = out.find(o => o.scenario === 0);
    expect(downSc.hedge_pnl).toBeGreaterThan(flatSc.hedge_pnl);
    expect(downSc.hedge_pnl).toBeGreaterThan(0);
  });
  it('returns [] for empty legs', () => {
    expect(computeHedgeProtection([], 550)).toEqual([]);
  });
  it('returns [] when spot missing', () => {
    expect(computeHedgeProtection([{ type: 'put', strike: 500, action: 'buy', qty: 1, T: 0.1, sigma: 0.2 }], NaN)).toEqual([]);
  });
});

describe('Tail hedge — historicalHedgeBacktest', () => {
  // Synthetic 6-month flat market — hedge should bleed cost
  function makeBars(n, startPrice = 500) {
    const bars = [];
    const startDate = new Date('2024-01-02T00:00:00Z');
    for (let i = 0; i < n; i++) {
      const d = new Date(startDate.getTime() + i * 86400 * 1000);
      bars.push({ date: d.toISOString().slice(0, 10), close: startPrice });
    }
    return bars;
  }
  function makeVix(bars, vix = 16) {
    return bars.map(b => ({ date: b.date, vix }));
  }
  it('flat market → cost_of_insurance > 0 (bleed)', () => {
    const bars = makeBars(200, 500);
    const vix_bars = makeVix(bars, 16);
    const res = historicalHedgeBacktest(bars, vix_bars, { initial_nav: 1_400_000 });
    expect(res.summary.n_trades).toBeGreaterThan(2);
    expect(res.summary.cost_of_insurance_pct_per_year).toBeGreaterThan(0);
    expect(res.summary.cost_of_insurance_pct_per_year).toBeLessThan(0.20);
  });
  it('insufficient bars → error', () => {
    const res = historicalHedgeBacktest([{ date: '2024-01-01', close: 500 }], []);
    expect(res.summary.error).toBeDefined();
  });
});

describe('Tail hedge — evaluateHedgeEffectiveness', () => {
  it('reduces drawdown when hedge negatively correlated', () => {
    // Portfolio crashes -100k over 5 days, hedge profits +60k
    const portfolioPnL = [10, -20, -30, -40, -50];
    const hedgePnL     = [-2, 5, 15, 20, 25];
    const r = evaluateHedgeEffectiveness(portfolioPnL, hedgePnL);
    expect(r.correlation).toBeLessThan(0);
    expect(r.dd_reduction_pct).toBeGreaterThan(0);
  });
  it('returns error for empty input', () => {
    expect(evaluateHedgeEffectiveness([], []).error).toBeDefined();
  });
  it('positive cost_of_insurance when hedge bled', () => {
    const portfolio = [10, 12, 8, 14];
    const hedge     = [-2, -2, -2, -2];
    const r = evaluateHedgeEffectiveness(portfolio, hedge);
    expect(r.cost_of_insurance).toBe(8);
  });
});

describe('Tail hedge — hedgeBookPayoff', () => {
  it('produces 81-point payoff curve by default', () => {
    const legs = [{ type: 'put', strike: 500, action: 'buy', qty: 1, T: 60 / 365, sigma: 0.20 }];
    const pts = hedgeBookPayoff(legs, 550);
    expect(pts).toHaveLength(81);
    expect(pts[0].S).toBeLessThan(pts[pts.length - 1].S);
  });
  it('returns [] for empty legs', () => {
    expect(hedgeBookPayoff([], 550)).toEqual([]);
  });
});
