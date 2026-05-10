// Sprint 14 — Auto Paper Trading engine tests.

import { describe, it, expect } from 'vitest';
import {
  AUTO_PAPER_DEFAULTS,
  shouldOpen, shouldClose, mapBrainStrategyToCatalog, planAutoPaperCycle,
} from '../../../api/src/lib/auto-paper-engine.js';

describe('Sprint 14 — shouldOpen()', () => {
  const baseState = { caps_allowed: true, open_positions: [], strategies: [] };

  it('open OK con score alto + caps allowed + no dupes', () => {
    const c = { symbol: 'SPY', strategy: 'IC short', score: 75, action: 'ENTRY_CANDIDATE', dte: 35 };
    const r = shouldOpen(c, baseState);
    expect(r.action).toBe('open');
    expect(r.params.strategy_id).toBe('ic-spy-35');
    expect(r.params.contracts).toBeGreaterThanOrEqual(1);
  });

  it('skip si score < min_brain_score', () => {
    const c = { symbol: 'SPY', strategy: 'IC short', score: 50, action: 'ENTRY_CANDIDATE' };
    const r = shouldOpen(c, baseState);
    expect(r.action).toBe('skip');
    expect(r.reason).toContain('LOW_SCORE');
  });

  it('skip si action != ENTRY_CANDIDATE/MAYBE', () => {
    const c = { symbol: 'SPY', strategy: 'WAIT', score: 80, action: 'WAIT' };
    const r = shouldOpen(c, baseState);
    expect(r.action).toBe('skip');
    expect(r.reason).toContain('BRAIN_ACTION');
  });

  it('skip si caps blocked', () => {
    const c = { symbol: 'SPY', strategy: 'IC short', score: 80, action: 'ENTRY_CANDIDATE' };
    const r = shouldOpen(c, { ...baseState, caps_allowed: false });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('RISK_CAPS_BLOCKED');
  });

  it('skip si ya hay 2 posiciones para mismo symbol+strategy (anti-dupe)', () => {
    const c = { symbol: 'SPY', strategy: 'IC short', score: 80, action: 'ENTRY_CANDIDATE' };
    const state = {
      ...baseState,
      open_positions: [
        { symbol: 'SPY', strategy_id: 'ic-spy-35', status: 'open' },
        { symbol: 'SPY', strategy_id: 'ic-spy-35', status: 'open' },
      ],
    };
    const r = shouldOpen(c, state);
    expect(r.action).toBe('skip');
    expect(r.reason).toContain('MAX_CONCURRENT_PER_SYMBOL');
  });

  it('skip si brain strategy no mapea al catálogo', () => {
    const c = { symbol: 'SPY', strategy: 'NONEXISTENT', score: 80, action: 'ENTRY_CANDIDATE' };
    const r = shouldOpen(c, baseState);
    expect(r.action).toBe('skip');
    expect(r.reason).toContain('NO_CATALOG_MATCH');
  });

  it('uses Kelly sizing cuando hay stats en strategy catalog', () => {
    const c = { symbol: 'SPY', strategy: 'IC short', score: 80, action: 'ENTRY_CANDIDATE' };
    const state = {
      ...baseState,
      strategies: [{ id: 'ic-spy-35', win_rate: 75, avg_win: 100, avg_loss: 200 }],
    };
    const r = shouldOpen(c, state);
    expect(r.action).toBe('open');
    expect(r.params.contracts).toBeGreaterThanOrEqual(1);
  });

  it('skip si candidate inválido', () => {
    expect(shouldOpen(null, baseState).action).toBe('skip');
    expect(shouldOpen({}, baseState).action).toBe('skip');
  });

  // Sprint 15 — tournament-aware filter
  it('skip si tournament_required AND strategy NO en leaderboard', () => {
    const c = { symbol: 'SPY', strategy: 'IC short', score: 80, action: 'ENTRY_CANDIDATE' };
    const state = { ...baseState, tournament_leaderboard: [{ strategy_id: 'qqq-bps-d30', score: 50 }] };
    const r = shouldOpen(c, state, { tournament_required: true });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('NOT_IN_TOURNAMENT_LEADERBOARD');
  });

  it('skip si tournament leaderboard tiene strategy con score bajo', () => {
    const c = { symbol: 'SPY', strategy: 'IC short', score: 80, action: 'ENTRY_CANDIDATE' };
    const state = { ...baseState, tournament_leaderboard: [{ strategy_id: 'ic-spy-35', score: 15 }] };
    const r = shouldOpen(c, state);
    expect(r.action).toBe('skip');
    expect(r.reason).toContain('TOURNAMENT_SCORE');
  });

  it('open si tournament leaderboard tiene strategy con score >= 30', () => {
    const c = { symbol: 'SPY', strategy: 'IC short', score: 80, action: 'ENTRY_CANDIDATE' };
    const state = { ...baseState, tournament_leaderboard: [{ strategy_id: 'ic-spy-35', score: 50 }] };
    const r = shouldOpen(c, state);
    expect(r.action).toBe('open');
  });
});

describe('Sprint 14 — shouldClose()', () => {
  it('close TP si live_pnl_pct >= 50', () => {
    const r = shouldClose({ live_pnl_pct: 55, current_dte: 20 });
    expect(r.action).toBe('close');
    expect(r.reason).toContain('TAKE_PROFIT');
  });

  it('close SL si live_pnl_pct <= -200', () => {
    const r = shouldClose({ live_pnl_pct: -250, current_dte: 20 });
    expect(r.action).toBe('close');
    expect(r.reason).toContain('STOP_LOSS');
  });

  it('close gamma exit si DTE<=7 y pnl<25%', () => {
    const r = shouldClose({ live_pnl_pct: 10, current_dte: 5 });
    expect(r.action).toBe('close');
    expect(r.reason).toContain('GAMMA_EXIT');
  });

  it('hold si DTE<=7 pero pnl>=25% (mantener TP path)', () => {
    const r = shouldClose({ live_pnl_pct: 30, current_dte: 5 });
    expect(r.action).toBe('hold');
  });

  it('hold si dentro de zona normal', () => {
    const r = shouldClose({ live_pnl_pct: 20, current_dte: 25 });
    expect(r.action).toBe('hold');
  });

  it('hold si position null', () => {
    const r = shouldClose(null);
    expect(r.action).toBe('hold');
  });

  // Sprint 15 — dynamic exit logic tests
  it('delta breach close si short delta >= 0.30', () => {
    const r = shouldClose({ live_pnl_pct: 10, current_dte: 25, current_short_delta: 0.35 });
    expect(r.action).toBe('close');
    expect(r.reason).toContain('DELTA_BREACH');
  });

  it('hold si delta menor al threshold (default 0.30)', () => {
    const r = shouldClose({ live_pnl_pct: 10, current_dte: 25, current_short_delta: 0.25 });
    expect(r.action).toBe('hold');
  });

  it('IV crush close si iv bajó >30% AND pnl >= 25%', () => {
    const r = shouldClose({ live_pnl_pct: 30, current_dte: 25, iv_at_entry: 0.30, iv_now: 0.18 });
    expect(r.action).toBe('close');
    expect(r.reason).toContain('IV_CRUSH');
  });

  it('NO IV crush close si pnl < 25% (necesita ganancia mínima)', () => {
    const r = shouldClose({ live_pnl_pct: 10, current_dte: 25, iv_at_entry: 0.30, iv_now: 0.18 });
    expect(r.action).toBe('hold');
  });

  it('time-based close si 60%+ time elapsed AND pnl < 25%', () => {
    const r = shouldClose({ live_pnl_pct: 15, dte_open: 35, current_dte: 12 });  // (35-12)/35 = 65%
    expect(r.action).toBe('close');
    expect(r.reason).toContain('TIME_BASED');
  });

  it('NO time-based close si pnl >= 25% (deja correr)', () => {
    const r = shouldClose({ live_pnl_pct: 30, dte_open: 35, current_dte: 12 });
    expect(r.action).toBe('hold');
  });

  it('priority order: TP triggers antes que delta breach', () => {
    const r = shouldClose({ live_pnl_pct: 60, current_dte: 25, current_short_delta: 0.40 });
    expect(r.reason).toContain('TAKE_PROFIT');
  });

  it('priority order: SL triggers antes que delta breach', () => {
    const r = shouldClose({ live_pnl_pct: -250, current_dte: 25, current_short_delta: 0.40 });
    expect(r.reason).toContain('STOP_LOSS');
  });
});

describe('Sprint 14 — mapBrainStrategyToCatalog()', () => {
  it('IC short → ic-{sym}-35', () => {
    expect(mapBrainStrategyToCatalog('IC short', 'SPY')).toBe('ic-spy-35');
    expect(mapBrainStrategyToCatalog('IC short', 'QQQ')).toBe('ic-qqq-35');
  });

  it('BPS only → bps-{sym}-35', () => {
    expect(mapBrainStrategyToCatalog('BPS only', 'SPY')).toBe('bps-spy-35');
  });

  it('WAIT/NO ENTRY/unknown → null', () => {
    expect(mapBrainStrategyToCatalog('WAIT', 'SPY')).toBe(null);
    expect(mapBrainStrategyToCatalog('NO ENTRY', 'SPY')).toBe(null);
    expect(mapBrainStrategyToCatalog('NONEXISTENT', 'SPY')).toBe(null);
  });
});

describe('Sprint 14 — planAutoPaperCycle()', () => {
  it('agrega open + close decisions correctamente', () => {
    const brainScan = {
      candidates: [
        { symbol: 'SPY', strategy: 'IC short', score: 75, action: 'ENTRY_CANDIDATE', dte: 35 },
        { symbol: 'QQQ', strategy: 'BPS only', score: 50, action: 'ENTRY_MAYBE' },  // skip por score bajo
      ],
    };
    const caps = { allowed: true };
    const open = [
      { strategy_id: 'ic-spy-35', symbol: 'SPY', live_pnl_pct: 60, current_dte: 20, status: 'open' },  // close TP
      { strategy_id: 'bps-iwm-35', symbol: 'IWM', live_pnl_pct: 5, current_dte: 25, status: 'open' },  // hold
    ];
    const r = planAutoPaperCycle(brainScan, caps, open, []);
    expect(r.summary.opens_planned).toBe(1);
    expect(r.summary.closes_planned).toBe(1);
    expect(r.summary.skips).toBe(1);
    expect(r.summary.holds).toBe(1);
  });

  it('respeta anti-dupe entre candidates en el mismo cycle', () => {
    const brainScan = {
      candidates: [
        { symbol: 'SPY', strategy: 'IC short', score: 75, action: 'ENTRY_CANDIDATE' },
        { symbol: 'SPY', strategy: 'IC short', score: 80, action: 'ENTRY_CANDIDATE' },
        { symbol: 'SPY', strategy: 'IC short', score: 90, action: 'ENTRY_CANDIDATE' },
      ],
    };
    const caps = { allowed: true };
    const r = planAutoPaperCycle(brainScan, caps, [], []);
    // Default max_concurrent_per_symbol=2 → solo 2 opens, 3rd skip
    expect(r.summary.opens_planned).toBe(2);
    expect(r.summary.skips).toBe(1);
  });

  it('caps blocked → 0 opens', () => {
    const brainScan = { candidates: [{ symbol: 'SPY', strategy: 'IC short', score: 90, action: 'ENTRY_CANDIDATE' }] };
    const r = planAutoPaperCycle(brainScan, { allowed: false }, [], []);
    expect(r.summary.opens_planned).toBe(0);
    expect(r.summary.caps_allowed).toBe(false);
  });
});
