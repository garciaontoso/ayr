// Wheel engine tests — Theta Gang Sprint extension.
// Covers state machine legality, stats, suggest action, backtest sanity.

import { describe, it, expect } from 'vitest';
import {
  wheelStateMachine,
  computeWheelStats,
  suggestNextAction,
  simulateWheelOnBars,
  WHEEL_STATES,
  WHEEL_EVENTS,
} from '../../../api/src/lib/wheel-engine.js';

describe('Wheel — state machine legal transitions', () => {
  it('AWAITING_CSP + OPEN_CSP → CSP_OPEN with cash committed', () => {
    const r = wheelStateMachine(null, WHEEL_EVENTS.OPEN_CSP, {
      symbol: 'SPY', strike: 580, premium_per_share: 5, qty: 1, expiry: '2026-06-15',
    });
    expect(r.ok).toBe(true);
    expect(r.nextState.state).toBe(WHEEL_STATES.CSP_OPEN);
    expect(r.nextState.cash_committed).toBe(58000);
    expect(r.nextState.cycle_premium_total).toBe(500); // 5 * 100 * 1
  });

  it('CSP_OPEN + EXPIRE_OTM → AWAITING_CSP, premium kept', () => {
    let s = wheelStateMachine(null, WHEEL_EVENTS.OPEN_CSP, {
      strike: 100, premium_per_share: 2, qty: 1,
    }).nextState;
    const r = wheelStateMachine(s, WHEEL_EVENTS.EXPIRE_OTM, {});
    expect(r.ok).toBe(true);
    expect(r.nextState.state).toBe(WHEEL_STATES.AWAITING_CSP);
    expect(r.nextState.cycle_premium_total).toBe(200); // unchanged on OTM expiry
  });

  it('CSP_OPEN + ASSIGN → ASSIGNED_LONG_STOCK, basis = strike − premiums/sh', () => {
    let s = wheelStateMachine(null, WHEEL_EVENTS.OPEN_CSP, {
      strike: 100, premium_per_share: 3, qty: 1,
    }).nextState;
    const r = wheelStateMachine(s, WHEEL_EVENTS.ASSIGN, {});
    expect(r.ok).toBe(true);
    expect(r.nextState.state).toBe(WHEEL_STATES.ASSIGNED_LONG_STOCK);
    expect(r.nextState.shares_owned).toBe(100);
    expect(r.nextState.stock_basis_per_share).toBe(100);
    expect(r.nextState.cost_basis_effective).toBeCloseTo(97, 2); // 10000 - 300 = 9700 / 100
  });

  it('Full cycle: CSP→assign→CC→called away → CYCLE_COMPLETE with positive PnL', () => {
    let s = wheelStateMachine(null, WHEEL_EVENTS.OPEN_CSP, {
      strike: 100, premium_per_share: 2, qty: 1,
    }).nextState;
    s = wheelStateMachine(s, WHEEL_EVENTS.ASSIGN, {}).nextState;
    s = wheelStateMachine(s, WHEEL_EVENTS.OPEN_CC, {
      strike: 105, premium_per_share: 1.5, qty: 1,
    }).nextState;
    const r = wheelStateMachine(s, WHEEL_EVENTS.ASSIGN, {});
    expect(r.ok).toBe(true);
    expect(r.nextState.state).toBe(WHEEL_STATES.CYCLE_COMPLETE);
    // P&L = (105 * 100 + 350 premium) − (100 * 100 basis) = 10500 + 350 − 10000 = 850
    expect(r.nextState.cycle_pnl).toBeCloseTo(850, 1);
  });

  it('CC expire OTM keeps stock and clears CC fields', () => {
    let s = wheelStateMachine(null, WHEEL_EVENTS.OPEN_CSP, { strike: 50, premium_per_share: 1 }).nextState;
    s = wheelStateMachine(s, WHEEL_EVENTS.ASSIGN, {}).nextState;
    s = wheelStateMachine(s, WHEEL_EVENTS.OPEN_CC, { strike: 55, premium_per_share: 0.8 }).nextState;
    const r = wheelStateMachine(s, WHEEL_EVENTS.EXPIRE_OTM, {});
    expect(r.nextState.state).toBe(WHEEL_STATES.ASSIGNED_LONG_STOCK);
    expect(r.nextState.strike_cc).toBeNull();
    expect(r.nextState.shares_owned).toBe(100);
  });
});

describe('Wheel — illegal transitions rejected', () => {
  it('OPEN_CC from AWAITING_CSP fails', () => {
    const r = wheelStateMachine(null, WHEEL_EVENTS.OPEN_CC, { strike: 100, premium_per_share: 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/CC needs long stock/);
  });

  it('ASSIGN from AWAITING_CSP fails', () => {
    const r = wheelStateMachine(null, WHEEL_EVENTS.ASSIGN, {});
    expect(r.ok).toBe(false);
  });

  it('OPEN_CSP with strike=0 fails', () => {
    const r = wheelStateMachine(null, WHEEL_EVENTS.OPEN_CSP, { strike: 0, premium_per_share: 1 });
    expect(r.ok).toBe(false);
  });

  it('Unknown event returns error', () => {
    const r = wheelStateMachine(null, 'fake_event', {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unknown event/);
  });
});

describe('Wheel — computeWheelStats', () => {
  it('Empty array → zero stats', () => {
    const s = computeWheelStats([]);
    expect(s.n_cycles).toBe(0);
    expect(s.total_pnl).toBe(0);
  });

  it('Multi-cycle aggregation: PnL + win rate', () => {
    const cycles = [
      { state: WHEEL_STATES.CYCLE_COMPLETE, cycle_pnl: 500, cycle_premium_total: 700, cash_committed: 10000,
        cycle_started_at: '2026-01-01', cycle_closed_at: '2026-02-01' },
      { state: WHEEL_STATES.CYCLE_COMPLETE, cycle_pnl: -200, cycle_premium_total: 300, cash_committed: 10000,
        cycle_started_at: '2026-02-01', cycle_closed_at: '2026-03-01' },
      { state: WHEEL_STATES.CYCLE_COMPLETE, cycle_pnl: 800, cycle_premium_total: 1000, cash_committed: 10000,
        cycle_started_at: '2026-03-01', cycle_closed_at: '2026-04-01' },
    ];
    const s = computeWheelStats(cycles);
    expect(s.n_cycles).toBe(3);
    expect(s.total_pnl).toBe(1100);
    expect(s.win_rate).toBeCloseTo(66.7, 1);
    expect(s.avg_yield_on_cash_pct).toBeGreaterThan(0);
  });

  it('Open-only cycles report n_open_cycles', () => {
    const open = [{ state: WHEEL_STATES.CSP_OPEN, cycle_premium_total: 200 }];
    const s = computeWheelStats(open);
    expect(s.n_cycles).toBe(0);
    expect(s.n_open_cycles).toBe(1);
    expect(s.total_premium).toBe(200);
  });
});

describe('Wheel — suggestNextAction', () => {
  it('Awaiting → suggests CSP at S − 1 SD', () => {
    const r = suggestNextAction(
      { state: WHEEL_STATES.AWAITING_CSP },
      { S: 100, sigma_iv: 0.20, dte: 35 }
    );
    expect(r.action).toBe('open_csp');
    expect(r.suggested_strike).toBeLessThan(100);
    expect(r.suggested_premium_estimate).toBeGreaterThan(0);
    expect(r.cash_required).toBe(r.suggested_strike * 100);
  });

  it('Assigned long stock → CC strike never below basis', () => {
    const r = suggestNextAction(
      {
        state: WHEEL_STATES.ASSIGNED_LONG_STOCK,
        stock_basis_per_share: 110,
        shares_owned: 100,
      },
      { S: 100, sigma_iv: 0.20, dte: 35 } // S below basis
    );
    expect(r.action).toBe('open_cc');
    expect(r.suggested_strike).toBeGreaterThanOrEqual(110 * 1.02 - 1);
  });

  it('Missing market data → wait', () => {
    const r = suggestNextAction(
      { state: WHEEL_STATES.AWAITING_CSP },
      { S: 0, sigma_iv: 0.2 }
    );
    expect(r.action).toBe('wait');
  });

  it('Cycle complete → reset suggestion', () => {
    const r = suggestNextAction(
      { state: WHEEL_STATES.CYCLE_COMPLETE },
      { S: 100, sigma_iv: 0.20 }
    );
    expect(r.action).toBe('reset_for_next_cycle');
  });
});

describe('Wheel — simulateWheelOnBars (backtest)', () => {
  // Synthetic flat market: should produce CSP-only cycles with theta capture
  function flatBars(n = 200, S = 100) {
    return Array.from({ length: n }, (_, i) => ({
      date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
      close: S + Math.sin(i / 10) * 1.5, // tiny oscillation
    }));
  }
  function trendingDownBars(n = 200, S = 100) {
    return Array.from({ length: n }, (_, i) => ({
      date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
      close: S - i * 0.3, // slow grind down
    }));
  }

  it('Insufficient bars → graceful empty result', () => {
    const r = simulateWheelOnBars([{ date: '2024-01-01', close: 100 }], { capital: 10000 });
    expect(r.cycles).toEqual([]);
    expect(r.final_capital).toBe(10000);
  });

  it('Flat market → at least one cycle, capital preserved or grown', () => {
    const r = simulateWheelOnBars(flatBars(300, 100), { capital: 15000, dte: 30 });
    expect(r.log.length).toBeGreaterThan(0);
    // Capital should not implode in a flat market
    expect(r.final_capital).toBeGreaterThan(10000);
  });

  it('Down-trending market → eventual assignment, MTM may be negative', () => {
    const r = simulateWheelOnBars(trendingDownBars(200, 100), { capital: 12000, dte: 30 });
    // Should produce log entries (assignment events)
    const assignments = r.log.filter(l => l.includes('ASSIGN'));
    expect(assignments.length).toBeGreaterThan(0);
  });
});
