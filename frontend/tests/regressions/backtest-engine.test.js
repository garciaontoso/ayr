// Sprint 8 — Backtest engine tests.
// Covers: computeStats, runBPSOnBars, walkForwardWindows, monteCarloBootstrap,
// promotionVerdict, STRESS_PERIODS catalog.

import { describe, it, expect } from 'vitest';
import {
  STRESS_PERIODS, CALM_PERIODS,
  computeStats, runBPSOnBars, filterBarsByDate,
  walkForwardWindows, monteCarloBootstrap, promotionVerdict,
  runStrategyTournament, scoreStrategy,
} from '../../../api/src/lib/backtest-engine.js';

// Seedable PRNG (LCG) — deterministic across CI runs.
// Sprint cleanup: replace Math.random() to avoid flaky tests where
// makeGBMBars or monteCarloBootstrap produce different paths each run.
let _prngState = 1;
function seedPRNG(s) { _prngState = (s >>> 0) || 1; }
function prng() {
  // mulberry32 (32-bit, fast, decent quality)
  _prngState = (_prngState + 0x6D2B79F5) >>> 0;
  let t = _prngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Synthetic bar generator: GBM with constant μ, σ (deterministic)
function makeGBMBars(N = 500, S0 = 600, mu = 0.08, sigma = 0.18, startDateStr = '2023-01-01', seed = 42) {
  seedPRNG(seed);
  const bars = [];
  let S = S0;
  let date = new Date(startDateStr);
  for (let i = 0; i < N; i++) {
    bars.push({ date: date.toISOString().slice(0, 10), close: Math.round(S * 100) / 100 });
    const z = Math.sqrt(-2 * Math.log(prng())) * Math.cos(2 * Math.PI * prng()); // Box-Muller
    const drift = (mu - sigma * sigma / 2) / 252;
    const diffusion = sigma / Math.sqrt(252) * z;
    S = S * Math.exp(drift + diffusion);
    date.setDate(date.getDate() + 1);
  }
  return bars;
}

describe('Sprint 8 — STRESS_PERIODS catalog', () => {
  it('contains 7 historic stress events', () => {
    expect(STRESS_PERIODS.length).toBe(7);
  });

  it('every period has required fields', () => {
    for (const p of STRESS_PERIODS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(p.end_date).getTime()).toBeGreaterThan(new Date(p.start_date).getTime());
      expect(p.expected_regime).toBeTruthy();
      expect(p.relevance).toBeTruthy();
    }
  });

  it('includes COVID, yen carry, and tariffs (the user-mentioned set)', () => {
    const ids = STRESS_PERIODS.map(p => p.id);
    expect(ids).toContain('covid_2020');
    expect(ids).toContain('yen_carry_2024');
    expect(ids).toContain('tariffs_2025');
  });

  it('CALM_PERIODS has at least 1 baseline', () => {
    expect(CALM_PERIODS.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Sprint 8 — computeStats()', () => {
  it('handles empty trades', () => {
    const s = computeStats([]);
    expect(s.n).toBe(0);
    expect(s.total_pnl).toBe(0);
  });

  it('computes basic stats correctly', () => {
    const trades = [
      { pnl: 100, legs_count: 2 },
      { pnl: -50, legs_count: 2 },
      { pnl: 80, legs_count: 2 },
      { pnl: -20, legs_count: 2 },
      { pnl: 150, legs_count: 2 },
    ];
    const s = computeStats(trades, 0.5); // $0.5/leg = $1/spread
    expect(s.n).toBe(5);
    // Net P&Ls after $1 each: 99, -51, 79, -21, 149 → total 255
    expect(s.total_pnl).toBeCloseTo(255, 0);
    // Wins: 99, 79, 149 → 3 → 60%
    expect(s.win_rate).toBe(60);
    // Avg win
    expect(s.avg_win).toBeCloseTo((99 + 79 + 149) / 3, 0);
    // Avg loss
    expect(s.avg_loss).toBeCloseTo((-51 + -21) / 2, 0);
  });

  it('profit_factor = grossWin / grossLoss', () => {
    const trades = [
      { pnl: 200, legs_count: 2 }, // net 199 (win)
      { pnl: -100, legs_count: 2 }, // net -101 (loss)
    ];
    const s = computeStats(trades, 0.5);
    expect(s.profit_factor).toBeCloseTo(199 / 101, 1);
  });

  it('max_dd = largest peak-to-trough', () => {
    // Sequence: 100, +50 (peak 150), -200 (DD 200), +50 (still DD 150)
    const trades = [
      { pnl: 100, legs_count: 0 }, // cum 100
      { pnl: 50,  legs_count: 0 }, // cum 150 peak
      { pnl: -200, legs_count: 0 }, // cum -50, DD = 200
      { pnl: 50, legs_count: 0 }, // cum 0, DD still 200 (peak still 150)
    ];
    const s = computeStats(trades, 0);
    expect(s.max_dd).toBe(200);
  });

  it('sharpe is positive when mean > 0 and stdDev > 0', () => {
    const trades = [
      { pnl: 50, legs_count: 0 },
      { pnl: 60, legs_count: 0 },
      { pnl: 40, legs_count: 0 },
      { pnl: 55, legs_count: 0 },
    ];
    const s = computeStats(trades, 0);
    expect(s.sharpe).toBeGreaterThan(0);
  });
});

describe('Sprint 8 — runBPSOnBars()', () => {
  it('returns trades + skip_counts on synthetic GBM', () => {
    const bars = makeGBMBars(800, 600, 0.10, 0.18); // ~3 years
    const result = runBPSOnBars(bars, { dte: 35, take_profit_pct: 0.5, stop_loss_x: 2.0 }, { symbol: 'SPY' });
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.skip_counts).toBeDefined();
  });

  it('skips trades when ivr_threshold not met', () => {
    const bars = makeGBMBars(800, 600, 0.05, 0.10); // low vol
    const noFilter = runBPSOnBars(bars, {}, { symbol: 'SPY', ivr_threshold: 0 });
    const highFilter = runBPSOnBars(bars, {}, { symbol: 'SPY', ivr_threshold: 80 });
    expect(highFilter.trades.length).toBeLessThanOrEqual(noFilter.trades.length);
    expect(highFilter.skip_counts.ivr).toBeGreaterThan(0);
  });

  it('every trade has required fields', () => {
    const bars = makeGBMBars(500, 600, 0.08, 0.18);
    const { trades } = runBPSOnBars(bars, {}, { symbol: 'SPY' });
    for (const t of trades.slice(0, 5)) {
      expect(t.entry_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.exit_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.Kshort).toBeGreaterThan(t.Klong);
      expect(t.credit).toBeGreaterThan(0);
      expect(t.legs_count).toBe(2);
      expect(['take_profit', 'stop_loss', 'gamma_exit', 'expiry']).toContain(t.exit_reason);
    }
  });
});

describe('Sprint 8 — filterBarsByDate()', () => {
  it('filters inclusive on both ends', () => {
    const bars = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-02-01', close: 110 },
      { date: '2024-03-01', close: 120 },
    ];
    expect(filterBarsByDate(bars, '2024-01-15', '2024-02-15')).toHaveLength(1);
    expect(filterBarsByDate(bars, '2024-01-01', '2024-03-01')).toHaveLength(3);
  });
});

describe('Sprint 8 — walkForwardWindows()', () => {
  it('returns empty for short bar set', () => {
    const bars = makeGBMBars(60); // ~2 months
    expect(walkForwardWindows(bars, 12, 3, 3)).toEqual([]);
  });

  it('generates non-overlapping test windows', () => {
    const bars = makeGBMBars(1000, 600, 0.08, 0.18, '2022-01-01'); // ~3.5 years
    const windows = walkForwardWindows(bars, 12, 3, 3);
    expect(windows.length).toBeGreaterThan(2);
    for (let i = 1; i < windows.length; i++) {
      // Each window's test_start = previous test_start + step (3 months)
      expect(windows[i].test_start > windows[i - 1].test_start).toBe(true);
    }
  });

  it('every window has 4 dates and train < test', () => {
    const bars = makeGBMBars(1500, 600, 0.08, 0.18, '2021-01-01');
    const windows = walkForwardWindows(bars, 12, 3, 3);
    for (const w of windows) {
      expect(w.train_start).toBeTruthy();
      expect(w.train_end).toBeTruthy();
      expect(w.test_start).toBeTruthy();
      expect(w.test_end).toBeTruthy();
      expect(w.train_start < w.train_end).toBe(true);
      expect(w.train_end <= w.test_start).toBe(true);
      expect(w.test_start < w.test_end).toBe(true);
    }
  });
});

describe('Sprint 8 — monteCarloBootstrap()', () => {
  it('returns aggregate distributions', () => {
    const trades = Array.from({ length: 50 }, () => ({
      pnl: Math.random() > 0.5 ? 80 : -100,
      legs_count: 2,
    }));
    const mc = monteCarloBootstrap(trades, 1000);
    expect(mc.n_sims).toBe(1000);
    expect(mc.total_pnl_p50).toBeDefined();
    expect(mc.total_pnl_p05).toBeLessThanOrEqual(mc.total_pnl_p95);
    expect(mc.max_dd_p50).toBeGreaterThanOrEqual(0);
    expect(mc.prob_profitable_pct).toBeGreaterThanOrEqual(0);
    expect(mc.prob_profitable_pct).toBeLessThanOrEqual(100);
  });

  it('p05 ≤ p25 ≤ p50 ≤ p75 ≤ p95 (monotonic)', () => {
    const trades = Array.from({ length: 50 }, () => ({ pnl: 50 - Math.random() * 100, legs_count: 2 }));
    const mc = monteCarloBootstrap(trades, 2000);
    expect(mc.total_pnl_p05).toBeLessThanOrEqual(mc.total_pnl_p25);
    expect(mc.total_pnl_p25).toBeLessThanOrEqual(mc.total_pnl_p50);
    expect(mc.total_pnl_p50).toBeLessThanOrEqual(mc.total_pnl_p75);
    expect(mc.total_pnl_p75).toBeLessThanOrEqual(mc.total_pnl_p95);
  });

  it('handles empty trades gracefully', () => {
    const mc = monteCarloBootstrap([], 1000);
    expect(mc.n_sims).toBe(0);
  });

  it('biased trades → high prob_profitable', () => {
    const trades = Array.from({ length: 50 }, () => ({ pnl: 50, legs_count: 2 })); // all wins
    const mc = monteCarloBootstrap(trades, 500);
    expect(mc.prob_profitable_pct).toBeCloseTo(100, 0);
  });
});

describe('Sprint 8 — promotionVerdict()', () => {
  it('FAIL with sample size <20', () => {
    const v = promotionVerdict({ n: 10, sharpe: 2, max_dd: 100, profit_factor: 2 });
    expect(v.verdict).toBe('INSUFFICIENT_DATA');
  });

  it('FAIL_GATE_1_SHARPE if sharpe <1.5', () => {
    const v = promotionVerdict({ n: 30, sharpe: 1.0, max_dd: 100, profit_factor: 2 });
    expect(v.verdict).toBe('FAIL_GATE_1_SHARPE');
  });

  it('FAIL_GATE_1_MAXDD if drawdown too large', () => {
    const v = promotionVerdict({ n: 30, sharpe: 2.0, max_dd: 2000, profit_factor: 2 }, { initial_capital: 10000 });
    expect(v.verdict).toBe('FAIL_GATE_1_MAXDD');
  });

  it('FAIL_GATE_2_PF if profit factor low', () => {
    const v = promotionVerdict({ n: 30, sharpe: 2.0, max_dd: 100, profit_factor: 1.0 });
    expect(v.verdict).toBe('FAIL_GATE_2_PF');
  });

  it('PASS_GATES_1_2 when all criteria met', () => {
    const v = promotionVerdict({ n: 30, sharpe: 2.0, max_dd: 500, profit_factor: 1.5 }, { initial_capital: 10000 });
    expect(v.verdict).toBe('PASS_GATES_1_2');
  });
});

// Sprint 15 — Tournament tests
describe('Sprint 15 — scoreStrategy()', () => {
  it('returns 0 for insufficient sample', () => {
    expect(scoreStrategy({ n: 3 })).toBe(0);
    expect(scoreStrategy({ n: 0 })).toBe(0);
    expect(scoreStrategy(null)).toBe(0);
  });

  it('high sharpe + good PF + reasonable DD → high score', () => {
    const s = scoreStrategy({ n: 50, sharpe: 2.0, profit_factor: 1.8, win_rate: 75, total_pnl: 5000, max_dd: 500 });
    expect(s).toBeGreaterThan(50);
  });

  it('low sharpe + low PF → low score', () => {
    const s = scoreStrategy({ n: 50, sharpe: 0.2, profit_factor: 0.9, win_rate: 50, total_pnl: 100, max_dd: 200 });
    expect(s).toBeLessThan(40);
  });

  it('caps score at 100', () => {
    const s = scoreStrategy({ n: 100, sharpe: 5, profit_factor: 10, win_rate: 100, total_pnl: 100000, max_dd: 100 });
    expect(s).toBeLessThanOrEqual(100);
  });

  it('caps score at 0 (no negatives)', () => {
    const s = scoreStrategy({ n: 50, sharpe: -5, profit_factor: 0, win_rate: 0, total_pnl: -1000, max_dd: 5000 });
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

describe('Sprint 15 — runStrategyTournament()', () => {
  it('returns sorted array (highest score first)', () => {
    const bars = makeGBMBars(700, 600, 0.10, 0.18, '2023-01-01');
    const configs = [
      { id: 'c1', symbol: 'SPY', dte: 35, take_profit_pct: 0.5, stop_loss_x: 2.0, delta_short_pct: 1.0, delta_long_pct: 1.5 },
      { id: 'c2', symbol: 'SPY', dte: 21, take_profit_pct: 0.3, stop_loss_x: 1.5, delta_short_pct: 0.85, delta_long_pct: 1.5 },
    ];
    const r = runStrategyTournament(configs, { SPY: bars });
    expect(r.length).toBe(2);
    if (r[0].score != null && r[1].score != null) {
      expect(r[0].score).toBeGreaterThanOrEqual(r[1].score);
    }
  });

  it('handles missing bars gracefully', () => {
    const r = runStrategyTournament(
      [{ id: 'c1', symbol: 'IWM' }],
      { SPY: [] }
    );
    expect(r[0].error).toBe('insufficient_bars');
  });

  it('every result has id, symbol', () => {
    const bars = makeGBMBars(700, 600);
    const configs = [{ id: 'test', symbol: 'SPY', dte: 35 }];
    const r = runStrategyTournament(configs, { SPY: bars });
    for (const item of r) {
      expect(item.id).toBeTruthy();
      expect(item.symbol).toBeTruthy();
    }
  });
});
