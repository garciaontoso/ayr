// Sprint 11 — Live execution engine tests.

import { describe, it, expect } from 'vitest';
import {
  LIVE_DEFAULTS, preTradeChecks, buildTradeTicket, detectNewPositions,
} from '../../../api/src/lib/live-execution-engine.js';

describe('Sprint 11 — preTradeChecks()', () => {
  const baseTrade = { strategy_id: 'ic-spy-35', symbol: 'SPY', contracts: 1, dte: 35, max_loss_per_contract: 500 };
  const baseState = {
    caps_allowed: true, n_open_live: 0, n_brain_score: 80, tournament_score: 50,
    nav: 100000, bridge_health: true,
  };
  const baseConfig = { live_enabled: true };

  it('allowed con todo OK', () => {
    const r = preTradeChecks(baseTrade, baseState, baseConfig);
    expect(r.allowed).toBe(true);
    expect(r.blocked_by).toEqual([]);
  });

  it('block si live_enabled=false', () => {
    const r = preTradeChecks(baseTrade, baseState, { live_enabled: false });
    expect(r.allowed).toBe(false);
    expect(r.blocked_by).toContain('LIVE_TRADING_DISABLED');
  });

  it('block si caps blocked', () => {
    const r = preTradeChecks(baseTrade, { ...baseState, caps_allowed: false }, baseConfig);
    expect(r.blocked_by).toContain('CAPS_BLOCKED');
  });

  it('block si bridge offline', () => {
    const r = preTradeChecks(baseTrade, { ...baseState, bridge_health: false }, baseConfig);
    expect(r.blocked_by).toContain('BRIDGE_OFFLINE');
  });

  it('block si max concurrent excedido', () => {
    const r = preTradeChecks(baseTrade, { ...baseState, n_open_live: 5 }, baseConfig);
    expect(r.blocked_by.some(b => b.includes('MAX_CONCURRENT_LIVE'))).toBe(true);
  });

  it('block si en first_month y contracts > 1', () => {
    const config = { live_enabled: true, first_month_until: new Date(Date.now() + 86400000 * 20).toISOString() };
    const r = preTradeChecks({ ...baseTrade, contracts: 2 }, baseState, config);
    expect(r.blocked_by.some(b => b.includes('CONTRACTS'))).toBe(true);
    expect(r.in_first_month).toBe(true);
  });

  it('OK con contracts=1 en first_month', () => {
    const config = { live_enabled: true, first_month_until: new Date(Date.now() + 86400000 * 20).toISOString() };
    const r = preTradeChecks(baseTrade, baseState, config);
    expect(r.allowed).toBe(true);
    expect(r.in_first_month).toBe(true);
  });

  it('block si brain score muy bajo', () => {
    const r = preTradeChecks(baseTrade, { ...baseState, n_brain_score: 50 }, baseConfig);
    expect(r.blocked_by.some(b => b.includes('BRAIN_SCORE'))).toBe(true);
  });

  it('block si tournament score bajo', () => {
    const r = preTradeChecks(baseTrade, { ...baseState, tournament_score: 15 }, baseConfig);
    expect(r.blocked_by.some(b => b.includes('TOURNAMENT_SCORE'))).toBe(true);
  });

  it('block si capital_at_risk > 5% NAV', () => {
    const r = preTradeChecks(
      { ...baseTrade, contracts: 50, max_loss_per_contract: 500 },  // = $25k = 25% NAV
      baseState, baseConfig
    );
    expect(r.blocked_by.some(b => b.includes('CAPITAL'))).toBe(true);
  });

  it('warning si capital_at_risk 3-5% NAV', () => {
    const r = preTradeChecks(
      { ...baseTrade, contracts: 7, max_loss_per_contract: 500 },  // = $3500 = 3.5% NAV
      baseState, baseConfig
    );
    expect(r.warnings.some(w => w.includes('CAPITAL'))).toBe(true);
  });

  it('warning si loss streak ≥ 2', () => {
    const r = preTradeChecks(baseTrade, { ...baseState, recent_loss_streak: 2 }, baseConfig);
    expect(r.warnings.some(w => w.includes('LOSS_STREAK'))).toBe(true);
  });

  it('block si invalid trade', () => {
    expect(preTradeChecks(null, baseState, baseConfig).allowed).toBe(false);
    expect(preTradeChecks({}, baseState, baseConfig).allowed).toBe(false);
  });

  it('multiple blocks reportados todos', () => {
    const r = preTradeChecks(baseTrade,
      { ...baseState, caps_allowed: false, bridge_health: false, n_brain_score: 30 },
      baseConfig
    );
    expect(r.blocked_by.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Sprint 11 — buildTradeTicket()', () => {
  it('genera ticket BPS con 2 legs + instructions', () => {
    const strategy = { id: 'ic-spy-35', name: 'IC SPY 35DTE', strategy_type: 'BPS' };
    const brainData = { spot: 600, iv_index: 0.18 };
    const ticket = buildTradeTicket(strategy, 'SPY', brainData, { contracts: 1 });
    expect(ticket.legs).toHaveLength(2);
    expect(ticket.legs[0].action).toBe('sell');
    expect(ticket.legs[1].action).toBe('buy');
    expect(ticket.instructions.length).toBeGreaterThan(5);
    expect(ticket.valid_until).toBeTruthy();
  });

  it('genera ticket IC con 4 legs', () => {
    const strategy = { id: 'ic-spy', name: 'IC', strategy_type: 'IC' };
    const ticket = buildTradeTicket(strategy, 'SPY', { spot: 600, iv_index: 0.18 }, { contracts: 1 });
    expect(ticket.legs).toHaveLength(4);
    expect(ticket.legs.filter(l => l.type === 'put')).toHaveLength(2);
    expect(ticket.legs.filter(l => l.type === 'call')).toHaveLength(2);
  });

  it('ticket valid_until > 0min from now', () => {
    const strategy = { id: 'x', strategy_type: 'BPS' };
    const ticket = buildTradeTicket(strategy, 'SPY', { spot: 600, iv_index: 0.20 }, { contracts: 1 });
    expect(new Date(ticket.valid_until).getTime()).toBeGreaterThan(Date.now());
  });

  // Sprint 20: NO fallback IV — must error fast
  it('returns error NO_IV si no se pasa iv ni iv_index', () => {
    const strategy = { id: 'x', strategy_type: 'BPS' };
    const ticket = buildTradeTicket(strategy, 'SPY', { spot: 600 }, { contracts: 1 });
    expect(ticket.error).toBe('NO_IV');
  });

  it('returns error NO_SPOT si no se pasa spot', () => {
    const strategy = { id: 'x', strategy_type: 'BPS' };
    const ticket = buildTradeTicket(strategy, 'SPY', { iv_index: 0.20 }, { contracts: 1 });
    expect(ticket.error).toBe('NO_SPOT');
  });

  it('ticket incluye iv_used + iv_source de brainData', () => {
    const strategy = { id: 'x', strategy_type: 'BPS' };
    const ticket = buildTradeTicket(strategy, 'SPY', { spot: 600, iv_index: 0.22, iv_source: 'tt_real' }, { contracts: 1 });
    expect(ticket.iv_used).toBeCloseTo(0.22, 4);
    expect(ticket.iv_source).toBe('tt_real');
  });
});

describe('Sprint 11 — detectNewPositions()', () => {
  it('detecta new positions', () => {
    const last = [{ symbol: 'SPY', strike: 600, opt_type: 'put', expiry: '2026-06-15', qty: -1 }];
    const curr = [
      { symbol: 'SPY', strike: 600, opt_type: 'put', expiry: '2026-06-15', qty: -1 },
      { symbol: 'QQQ', strike: 500, opt_type: 'put', expiry: '2026-06-15', qty: -1 },
    ];
    const r = detectNewPositions(curr, last);
    expect(r.new).toHaveLength(1);
    expect(r.new[0].symbol).toBe('QQQ');
    expect(r.closed).toHaveLength(0);
  });

  it('detecta closed positions', () => {
    const last = [
      { symbol: 'SPY', strike: 600, opt_type: 'put', expiry: '2026-06-15', qty: -1 },
      { symbol: 'QQQ', strike: 500, opt_type: 'put', expiry: '2026-06-15', qty: -1 },
    ];
    const curr = [{ symbol: 'SPY', strike: 600, opt_type: 'put', expiry: '2026-06-15', qty: -1 }];
    const r = detectNewPositions(curr, last);
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0].symbol).toBe('QQQ');
  });

  it('detecta modified (qty change)', () => {
    const last = [{ symbol: 'SPY', strike: 600, opt_type: 'put', expiry: '2026-06-15', qty: -1 }];
    const curr = [{ symbol: 'SPY', strike: 600, opt_type: 'put', expiry: '2026-06-15', qty: -2 }];
    const r = detectNewPositions(curr, last);
    expect(r.modified).toHaveLength(1);
    expect(r.modified[0].prev_qty).toBe(-1);
    expect(r.modified[0].qty).toBe(-2);
  });

  it('handles empty arrays', () => {
    const r = detectNewPositions([], []);
    expect(r.new).toEqual([]);
    expect(r.closed).toEqual([]);
  });

  it('handles null lastSnapshot (first run)', () => {
    const curr = [{ symbol: 'SPY', strike: 600, opt_type: 'put', expiry: '2026-06-15', qty: -1 }];
    const r = detectNewPositions(curr, null);
    expect(r.new).toHaveLength(1);
  });
});
