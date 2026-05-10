// Sprint 9 — Risk engine tests.
// Covers Kelly, recommendSize, correlationMatrix, evaluateRiskCaps,
// portfolioHeatByUnderlying, portfolioRiskScore.

import { describe, it, expect } from 'vitest';
import {
  kellyCriterion, recommendSize, correlationMatrix,
  evaluateRiskCaps, DEFAULT_RISK_CAPS,
  portfolioHeatByUnderlying, portfolioRiskScore,
  checkSingleLossKillSwitch, checkLiquidity,
} from '../../../api/src/lib/risk-engine.js';

describe('Sprint 9 — kellyCriterion()', () => {
  it('classic 60/40 with 1:1 ratio → Kelly = 0.20', () => {
    const k = kellyCriterion({ win_rate: 60, avg_win: 100, avg_loss: 100 });
    expect(k.full_kelly).toBeCloseTo(0.20, 2);
    expect(k.half_kelly).toBeCloseTo(0.10, 2);
    expect(k.quarter_kelly).toBeCloseTo(0.05, 2);
    expect(k.edge_pct).toBeCloseTo(20, 1);
  });

  it('80% win rate with 1:2 ratio (small wins, big loss) → ~Kelly 0.60 capped at 0.20', () => {
    const k = kellyCriterion({ win_rate: 80, avg_win: 50, avg_loss: 100 });
    // f = (0.5*0.8 - 0.2)/0.5 = 0.40, edge = 0.20
    expect(k.full_kelly).toBeCloseTo(0.20, 2);  // capped
    expect(k.kelly_warning).toBeTruthy();
  });

  it('negative edge → Kelly = 0 + warning', () => {
    const k = kellyCriterion({ win_rate: 30, avg_win: 100, avg_loss: 100 });
    expect(k.full_kelly).toBe(0);
    expect(k.kelly_warning).toContain('NEGATIVE_EDGE');
  });

  it('insufficient data → Kelly = 0 + warning', () => {
    const k = kellyCriterion({ win_rate: 0, avg_win: 0, avg_loss: 0 });
    expect(k.full_kelly).toBe(0);
    expect(k.kelly_warning).toContain('INSUFFICIENT_DATA');
  });

  it('caps Kelly at custom cap_pct', () => {
    const k = kellyCriterion({ win_rate: 90, avg_win: 200, avg_loss: 100 }, { cap_pct: 0.10 });
    expect(k.full_kelly).toBeLessThanOrEqual(0.10);
  });
});

describe('Sprint 9 — recommendSize()', () => {
  const goodStats = { win_rate: 60, avg_win: 100, avg_loss: 100 };

  it('recommends contracts based on Quarter Kelly', () => {
    const r = recommendSize(goodStats, 100000, 1000);
    // Quarter Kelly = 5% → $5k risk → 5 contracts
    expect(r.recommended_contracts).toBeGreaterThan(0);
    expect(r.capital_at_risk).toBeLessThanOrEqual(5000);
  });

  it('zero NAV → 0 contracts', () => {
    const r = recommendSize(goodStats, 0, 1000);
    expect(r.recommended_contracts).toBe(0);
    expect(r.sizing_notes).toContain('INVALID_INPUTS: nav or max_loss_per_contract <= 0');
  });

  it('floor of 1 contract when min_contracts=1', () => {
    const r = recommendSize({ win_rate: 51, avg_win: 50, avg_loss: 100 }, 100000, 50000);
    expect(r.recommended_contracts).toBeGreaterThanOrEqual(1);
  });

  it('respects cap_pct', () => {
    const r = recommendSize(goodStats, 100000, 100, { cap_pct: 0.01 });
    expect(r.capital_at_risk).toBeLessThanOrEqual(1000);
  });
});

describe('Sprint 9 — correlationMatrix()', () => {
  it('perfect correlation = 1.0', () => {
    const data = {
      A: [{ date: '2024-01-01', pnl: 10 }, { date: '2024-02-01', pnl: 20 }, { date: '2024-03-01', pnl: 30 }, { date: '2024-04-01', pnl: 40 }, { date: '2024-05-01', pnl: 50 }],
      B: [{ date: '2024-01-01', pnl: 100 }, { date: '2024-02-01', pnl: 200 }, { date: '2024-03-01', pnl: 300 }, { date: '2024-04-01', pnl: 400 }, { date: '2024-05-01', pnl: 500 }],
    };
    const r = correlationMatrix(data);
    expect(r.matrix.A.B).toBeCloseTo(1.0, 2);
    expect(r.matrix.B.A).toBeCloseTo(1.0, 2);
    expect(r.matrix.A.A).toBe(1.0);
  });

  it('inverse correlation = -1.0', () => {
    const data = {
      A: [{ date: '2024-01-01', pnl: 10 }, { date: '2024-02-01', pnl: 20 }, { date: '2024-03-01', pnl: 30 }, { date: '2024-04-01', pnl: 40 }, { date: '2024-05-01', pnl: 50 }],
      B: [{ date: '2024-01-01', pnl: -10 }, { date: '2024-02-01', pnl: -20 }, { date: '2024-03-01', pnl: -30 }, { date: '2024-04-01', pnl: -40 }, { date: '2024-05-01', pnl: -50 }],
    };
    const r = correlationMatrix(data);
    expect(r.matrix.A.B).toBeCloseTo(-1.0, 2);
  });

  it('detects high-correlation pairs', () => {
    const data = {
      X: [{ date: '2024-01-01', pnl: 10 }, { date: '2024-02-01', pnl: 20 }, { date: '2024-03-01', pnl: 30 }, { date: '2024-04-01', pnl: 40 }, { date: '2024-05-01', pnl: 50 }],
      Y: [{ date: '2024-01-01', pnl: 11 }, { date: '2024-02-01', pnl: 19 }, { date: '2024-03-01', pnl: 31 }, { date: '2024-04-01', pnl: 41 }, { date: '2024-05-01', pnl: 49 }],
    };
    const r = correlationMatrix(data, 0.7);
    expect(r.high_correlation_pairs.length).toBeGreaterThanOrEqual(1);
    expect(r.high_correlation_pairs[0].corr).toBeGreaterThan(0.7);
  });

  it('insufficient samples (<5) returns null', () => {
    const data = {
      A: [{ date: '2024-01-01', pnl: 10 }, { date: '2024-02-01', pnl: 20 }],
      B: [{ date: '2024-01-01', pnl: 11 }, { date: '2024-02-01', pnl: 19 }],
    };
    const r = correlationMatrix(data);
    expect(r.matrix.A.B).toBe(null);
  });
});

describe('Sprint 9 — evaluateRiskCaps()', () => {
  it('all green → allowed', () => {
    const r = evaluateRiskCaps({ vix: 17, n_concurrent_positions: 3, drawdown_pct: 2 });
    expect(r.allowed).toBe(true);
    expect(r.blocked_by).toEqual([]);
  });

  it('VIX > 30 → blocked', () => {
    const r = evaluateRiskCaps({ vix: 35, n_concurrent_positions: 0, drawdown_pct: 0 });
    expect(r.allowed).toBe(false);
    expect(r.blocked_by[0]).toContain('VIX_KILL');
  });

  it('VIX 26 → warning but allowed', () => {
    const r = evaluateRiskCaps({ vix: 26, n_concurrent_positions: 0, drawdown_pct: 0 });
    expect(r.allowed).toBe(true);
    expect(r.warnings.some(w => w.includes('VIX_WARN'))).toBe(true);
  });

  it('concurrent ≥ max → blocked', () => {
    const r = evaluateRiskCaps({ vix: 15, n_concurrent_positions: 8, drawdown_pct: 0 });
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.some(b => b.includes('MAX_CONCURRENT'))).toBe(true);
  });

  it('drawdown ≥ kill threshold → blocked', () => {
    const r = evaluateRiskCaps({ vix: 15, n_concurrent_positions: 0, drawdown_pct: 12 });
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.some(b => b.includes('DRAWDOWN_KILL'))).toBe(true);
  });

  it('loss streak ≥ max → blocked', () => {
    const r = evaluateRiskCaps({ vix: 15, n_concurrent_positions: 0, drawdown_pct: 0, recent_loss_streak: 3 });
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.some(b => b.includes('LOSS_STREAK'))).toBe(true);
  });

  it('multiple blocks → all reported', () => {
    const r = evaluateRiskCaps({ vix: 35, n_concurrent_positions: 10, drawdown_pct: 15 });
    expect(r.blocked_by.length).toBeGreaterThanOrEqual(3);
  });

  it('custom caps override defaults', () => {
    const r = evaluateRiskCaps({ vix: 25 }, { ...DEFAULT_RISK_CAPS, vix_max: 20 });
    expect(r.allowed).toBe(false);
  });
});

describe('Sprint 9 — portfolioHeatByUnderlying()', () => {
  it('aggregates positions correctly per underlying', () => {
    const positions = [
      { underlying: 'SPY', delta: 0.5, quantity: 1, multiplier: 100, underlying_price: 600 },
      { underlying: 'SPY', delta: -0.3, quantity: 1, multiplier: 100, underlying_price: 600 },
      { underlying: 'QQQ', delta: 0.4, quantity: 2, multiplier: 100, underlying_price: 500 },
    ];
    const heat = portfolioHeatByUnderlying(positions);
    expect(heat.length).toBe(2);
    expect(heat.find(h => h.underlying === 'SPY').n_positions).toBe(2);
    expect(heat.find(h => h.underlying === 'QQQ').n_positions).toBe(1);
  });

  it('weights sum to ~100%', () => {
    const positions = [
      { underlying: 'SPY', delta: 0.5, quantity: 10, multiplier: 100, underlying_price: 600 },
      { underlying: 'QQQ', delta: 0.3, quantity: 5, multiplier: 100, underlying_price: 500 },
    ];
    const heat = portfolioHeatByUnderlying(positions);
    const totalWeight = heat.reduce((a, h) => a + h.weight_pct, 0);
    expect(totalWeight).toBeCloseTo(100, 0);
  });

  it('sorted by abs delta_dollars desc', () => {
    const positions = [
      { underlying: 'AAPL', delta: 0.1, quantity: 1, multiplier: 100, underlying_price: 200 },
      { underlying: 'SPY', delta: 0.8, quantity: 5, multiplier: 100, underlying_price: 600 },
      { underlying: 'QQQ', delta: 0.4, quantity: 2, multiplier: 100, underlying_price: 500 },
    ];
    const heat = portfolioHeatByUnderlying(positions);
    expect(heat[0].underlying).toBe('SPY');
    expect(Math.abs(heat[0].delta_dollars)).toBeGreaterThan(Math.abs(heat[1].delta_dollars));
  });

  it('handles empty positions', () => {
    expect(portfolioHeatByUnderlying([])).toEqual([]);
  });

  // Sprint cleanup — coverage gap: short positions flip sign
  it('Short positions flip delta_dollars sign', () => {
    const positionsLong = [
      { underlying: 'SPY', delta: 0.5, quantity: 1, multiplier: 100, underlying_price: 600, quantity_direction: 'Long' },
    ];
    const positionsShort = [
      { underlying: 'SPY', delta: 0.5, quantity: 1, multiplier: 100, underlying_price: 600, quantity_direction: 'Short' },
    ];
    const heatLong = portfolioHeatByUnderlying(positionsLong);
    const heatShort = portfolioHeatByUnderlying(positionsShort);
    expect(Math.sign(heatLong[0].delta_dollars)).toBe(1);
    expect(Math.sign(heatShort[0].delta_dollars)).toBe(-1);
    expect(Math.abs(heatLong[0].delta_dollars)).toBe(Math.abs(heatShort[0].delta_dollars));
  });
});

describe('Sprint 9 — portfolioRiskScore()', () => {
  it('low vix + low concurrent + no drawdown → LOW', () => {
    const s = portfolioRiskScore({ vix: 12, n_concurrent_positions: 1, drawdown_pct: 0 }, []);
    expect(s.interpretation).toBe('LOW');
    expect(s.total).toBeLessThan(30);
  });

  it('high vix + high concurrent + drawdown → HIGH or CRITICAL', () => {
    const s = portfolioRiskScore({ vix: 28, n_concurrent_positions: 7, drawdown_pct: 8 }, []);
    expect(['HIGH', 'CRITICAL']).toContain(s.interpretation);
  });

  it('high concentration adds to score', () => {
    const heat = [{ underlying: 'SPY', weight_pct: 80 }];
    const sLow = portfolioRiskScore({ vix: 15 }, []);
    const sHigh = portfolioRiskScore({ vix: 15 }, heat);
    expect(sHigh.total).toBeGreaterThan(sLow.total);
  });

  it('breakdown sums to total (±1 from rounding)', () => {
    const s = portfolioRiskScore({ vix: 20, n_concurrent_positions: 4, drawdown_pct: 5 }, [{ weight_pct: 30 }]);
    const sum = s.breakdown.vix + s.breakdown.concurrent + s.breakdown.drawdown + s.breakdown.concentration;
    expect(Math.abs(sum - s.total)).toBeLessThanOrEqual(2);
  });
});

// Sprint 17 — Single-loss kill + liquidity
describe('Sprint 17 — checkSingleLossKillSwitch()', () => {
  it('triggers si single trade loss > 5% NAV', () => {
    expect(checkSingleLossKillSwitch([{ pnl_realized: -6000 }], 100000)).toBe(true);
    expect(checkSingleLossKillSwitch([{ pnl_realized: -4000 }], 100000)).toBe(false);
  });

  it('handles empty / null', () => {
    expect(checkSingleLossKillSwitch([], 100000)).toBe(false);
    expect(checkSingleLossKillSwitch(null, 100000)).toBe(false);
  });

  it('custom threshold respected', () => {
    expect(checkSingleLossKillSwitch([{ pnl_realized: -3000 }], 100000, 2)).toBe(true);
    expect(checkSingleLossKillSwitch([{ pnl_realized: -1500 }], 100000, 2)).toBe(false);
  });
});

describe('Sprint 17 — checkLiquidity()', () => {
  it('OK con spread tight + good OI + good volume', () => {
    const r = checkLiquidity({ mid: 1.00, bid: 0.98, ask: 1.02, open_interest: 500, volume: 100 });
    expect(r.ok).toBe(true);
  });

  it('reject wide spread (> 10% mid)', () => {
    const r = checkLiquidity({ mid: 1.00, bid: 0.80, ask: 1.20, open_interest: 500 });
    expect(r.ok).toBe(false);
    expect(r.reasons.some(x => x.includes('WIDE_SPREAD'))).toBe(true);
  });

  it('reject low OI', () => {
    const r = checkLiquidity({ mid: 1.00, bid: 0.98, ask: 1.02, open_interest: 10 });
    expect(r.ok).toBe(false);
    expect(r.reasons.some(x => x.includes('LOW_OI'))).toBe(true);
  });

  it('reject low volume', () => {
    const r = checkLiquidity({ mid: 1.00, bid: 0.98, ask: 1.02, open_interest: 500, volume: 1 });
    expect(r.ok).toBe(false);
    expect(r.reasons.some(x => x.includes('LOW_VOLUME'))).toBe(true);
  });

  it('reject si chain null', () => {
    expect(checkLiquidity(null).ok).toBe(false);
  });
});
