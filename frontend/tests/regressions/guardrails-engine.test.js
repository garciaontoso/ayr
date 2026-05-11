// Sprint 22 — Anti-Estupidez Engine tests.
// Verifies all 7 mistake categories blocked correctly + ritual enforcement.

import { describe, it, expect } from 'vitest';
import {
  GUARDRAIL_DEFAULTS,
  evalGuardrails,
  detectTilt,
  checkConcentration,
  checkEarningsCross,
  checkDailyKill,
  validateRitual,
  validateOverrideReason,
  STANDARD_CHECKLIST,
} from '../../../api/src/lib/guardrails-engine.js';

// Helper: build a "clean" state where nothing should block
const cleanState = (overrides = {}) => ({
  nav: 1_400_000,
  daily_pnl_dollars: 0,
  daily_pnl_pct: 0,
  weekly_opens_count: 2,
  recent_actions: [],
  recent_closes: [],
  open_positions: [],
  loss_streak: 0,
  weekly_review_done_at: new Date().toISOString(),
  weekly_review_required_by: null,
  active_kill_switches: [],
  active_cooldowns: [],
  regime: { vix: 14, vix3m: 16, regime_label: 'normal_contango' },
  earnings_calendar: {},
  journal_pending_close_count: 0,
  local_hour: 15,
  now_ts: Date.now(),
  ...overrides,
});

// Helper: build a fully-ritualized trade
const cleanTrade = (overrides = {}) => ({
  strategy: 'BPS',
  symbol: 'SPY',
  contracts: 1,
  dte: 35,
  brain_score: 78,
  conviction: 4,
  thesis: 'IV rank 67, term structure normal, regime ranging, Δ16 short put',
  checklist: {
    iv_rank_ok: true,
    dte_range_ok: true,
    no_earnings: true,
    concentration_ok: true,
    brain_score_ok: true,
    mental_state_ok: true,
  },
  ...overrides,
});

describe('Sprint 22 — evalGuardrails: green path', () => {
  it('allowed=true cuando todo OK + ritual completo', () => {
    const r = evalGuardrails(cleanState(), cleanTrade());
    expect(r.allowed).toBe(true);
    expect(r.blocked_by).toEqual([]);
  });

  it('returns invalid si state missing', () => {
    const r = evalGuardrails(null, cleanTrade());
    expect(r.allowed).toBe(false);
    expect(r.blocked_by[0].rule).toBe('INVALID_STATE');
  });

  it('returns invalid si trade missing symbol/strategy', () => {
    expect(evalGuardrails(cleanState(), {}).allowed).toBe(false);
    expect(evalGuardrails(cleanState(), { symbol: 'SPY' }).allowed).toBe(false);
  });
});

describe('Sprint 22 — Daily loss kill-switch', () => {
  it('BLOCK si daily_pnl_pct ≤ -2%', () => {
    const r = evalGuardrails(cleanState({ daily_pnl_pct: -2.5 }), cleanTrade());
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'DAILY_LOSS_LIMIT')).toBeTruthy();
  });

  it('WARN si -1% < daily_pnl_pct ≤ -2%', () => {
    const r = evalGuardrails(cleanState({ daily_pnl_pct: -1.2 }), cleanTrade());
    expect(r.allowed).toBe(true);
    expect(r.warnings.find(w => w.rule === 'DAILY_LOSS_WARN')).toBeTruthy();
  });

  it('daily kill-switch is overridable con razón', () => {
    const r = evalGuardrails(cleanState({ daily_pnl_pct: -3 }), cleanTrade());
    expect(r.blocked_by.find(b => b.rule === 'DAILY_LOSS_LIMIT').can_override).toBe(true);
  });
});

describe('Sprint 22 — Tilt detector', () => {
  it('BLOCK si >5 actions en 30min', () => {
    const now = Date.now();
    const recent_actions = Array.from({ length: 7 }, (_, i) => ({
      ts: new Date(now - i * 60_000).toISOString(),
      type: 'open',
    }));
    const r = evalGuardrails(cleanState({ recent_actions, now_ts: now }), cleanTrade());
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'TILT_DETECTED')).toBeTruthy();
  });

  it('tilt NO overridable', () => {
    const now = Date.now();
    const recent_actions = Array.from({ length: 7 }, () => ({ ts: new Date(now).toISOString(), type: 'open' }));
    const r = evalGuardrails(cleanState({ recent_actions, now_ts: now }), cleanTrade());
    expect(r.blocked_by.find(b => b.rule === 'TILT_DETECTED').can_override).toBe(false);
  });

  it('detectTilt pattern revenge: 2 closes loss + 2 opens en 30min', () => {
    const now = Date.now();
    const r = detectTilt([
      { ts: new Date(now - 20 * 60_000).toISOString(), type: 'open' },
      { ts: new Date(now - 15 * 60_000).toISOString(), type: 'close', pnl_dollars: -100 },
      { ts: new Date(now - 10 * 60_000).toISOString(), type: 'open' },
      { ts: new Date(now - 5 * 60_000).toISOString(), type: 'close', pnl_dollars: -200 },
    ], { now_ts: now });
    expect(r.tilted).toBe(true);
    expect(r.cooldown_until).toBeTruthy();
  });
});

describe('Sprint 22 — Revenge pattern (close loss + open <10min)', () => {
  it('BLOCK si último cierre fue pérdida hace <10min', () => {
    const now = Date.now();
    const recent_closes = [{ ts: new Date(now - 5 * 60_000).toISOString(), pnl_dollars: -350, symbol: 'KO' }];
    const r = evalGuardrails(cleanState({ recent_closes, now_ts: now }), cleanTrade());
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'REVENGE_PATTERN')).toBeTruthy();
  });

  it('NO BLOCK si pérdida fue hace >10min', () => {
    const now = Date.now();
    const recent_closes = [{ ts: new Date(now - 15 * 60_000).toISOString(), pnl_dollars: -350, symbol: 'KO' }];
    const r = evalGuardrails(cleanState({ recent_closes, now_ts: now }), cleanTrade());
    expect(r.blocked_by.find(b => b.rule === 'REVENGE_PATTERN')).toBeFalsy();
  });
});

describe('Sprint 22 — Concentration cap', () => {
  it('BLOCK si nuevo trade hace que symbol >8% NAV', () => {
    const open_positions = [
      { symbol: 'SPY', market_value: 80_000 },
      { symbol: 'SPY', market_value: 50_000 },
    ];  // = 130k = 9.3% of 1.4M
    const r = evalGuardrails(cleanState({ open_positions }), cleanTrade({ symbol: 'SPY' }));
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'CONCENTRATION_NAV')).toBeTruthy();
  });

  it('BLOCK si ≥3 spreads abiertos en mismo symbol', () => {
    const open_positions = [
      { symbol: 'QQQ', market_value: 5_000 },
      { symbol: 'QQQ', market_value: 5_000 },
      { symbol: 'QQQ', market_value: 5_000 },
    ];
    const r = evalGuardrails(cleanState({ open_positions }), cleanTrade({ symbol: 'QQQ' }));
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'CONCENTRATION_SPREADS')).toBeTruthy();
  });

  it('WARN cuando concentración cerca del max (75%-100%)', () => {
    const open_positions = [{ symbol: 'IWM', market_value: 95_000 }];  // 6.8% of 1.4M = 85% of 8% cap
    const r = evalGuardrails(cleanState({ open_positions }), cleanTrade({ symbol: 'IWM' }));
    expect(r.warnings.find(w => w.rule === 'CONCENTRATION_NEAR')).toBeTruthy();
  });

  it('checkConcentration helper: ok cuando insuficiente data', () => {
    expect(checkConcentration([], { symbol: 'SPY' }, 0).ok).toBe(true);
    expect(checkConcentration(null, { symbol: 'SPY' }, 1000).ok).toBe(true);
  });
});

describe('Sprint 22 — Earnings sentinel', () => {
  it('BLOCK si earnings cruza DTE', () => {
    const earnings_calendar = { AMZN: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) };
    const r = evalGuardrails(
      cleanState({ earnings_calendar }),
      cleanTrade({ symbol: 'AMZN', dte: 35 })
    );
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'EARNINGS_CROSS')).toBeTruthy();
  });

  it('NO BLOCK si earnings_intent=true (Earnings_IC strategy)', () => {
    const earnings_calendar = { AMZN: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) };
    const r = evalGuardrails(
      cleanState({ earnings_calendar }),
      cleanTrade({ symbol: 'AMZN', dte: 35, strategy: 'Earnings_IC' })
    );
    expect(r.blocked_by.find(b => b.rule === 'EARNINGS_CROSS')).toBeFalsy();
  });

  it('NO BLOCK si earnings DESPUÉS de expiry', () => {
    const earnings_calendar = { AMZN: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) };
    const r = evalGuardrails(
      cleanState({ earnings_calendar }),
      cleanTrade({ symbol: 'AMZN', dte: 35 })
    );
    expect(r.blocked_by.find(b => b.rule === 'EARNINGS_CROSS')).toBeFalsy();
  });

  it('checkEarningsCross helper', () => {
    const cal = { KO: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) };
    expect(checkEarningsCross('KO', 35, cal).crosses).toBe(true);
    expect(checkEarningsCross('KO', 5, cal).crosses).toBe(false);
    expect(checkEarningsCross('XYZ', 35, cal).crosses).toBe(false);
  });
});

describe('Sprint 22 — Regime gate', () => {
  it('BLOCK short-vol entries cuando VIX >28', () => {
    const r = evalGuardrails(
      cleanState({ regime: { vix: 32 } }),
      cleanTrade({ strategy: 'BPS' })
    );
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'REGIME_VIX')).toBeTruthy();
  });

  it('NO BLOCK si strategy no es short-vol', () => {
    const r = evalGuardrails(
      cleanState({ regime: { vix: 32 } }),
      cleanTrade({ strategy: 'LONG_STRADDLE' })
    );
    expect(r.blocked_by.find(b => b.rule === 'REGIME_VIX')).toBeFalsy();
  });

  it('WARN cuando VIX entre 22 y 28', () => {
    const r = evalGuardrails(
      cleanState({ regime: { vix: 25 } }),
      cleanTrade()
    );
    expect(r.warnings.find(w => w.rule === 'REGIME_VIX_WARN')).toBeTruthy();
  });
});

describe('Sprint 22 — Loss streak pause', () => {
  it('BLOCK si ≥3 pérdidas seguidas', () => {
    const r = evalGuardrails(cleanState({ loss_streak: 4 }), cleanTrade());
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'LOSS_STREAK')).toBeTruthy();
  });
});

describe('Sprint 22 — Weekly review enforcement', () => {
  it('BLOCK si review pendiente y hoy es lunes después de hora', () => {
    const required = new Date(Date.now() - 86400000).toISOString();
    const r = evalGuardrails(
      cleanState({ weekly_review_done_at: null, weekly_review_required_by: required }),
      cleanTrade()
    );
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'WEEKLY_REVIEW_PENDING')).toBeTruthy();
  });
});

describe('Sprint 22 — Journal pending close', () => {
  it('BLOCK si trades cerrados sin journal pendientes', () => {
    const r = evalGuardrails(cleanState({ journal_pending_close_count: 2 }), cleanTrade());
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'JOURNAL_PENDING')).toBeTruthy();
  });
});

describe('Sprint 22 — Late-night fatigue', () => {
  it('BLOCK si hora local entre 0 y 1 AM', () => {
    const r = evalGuardrails(cleanState({ local_hour: 0 }), cleanTrade());
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'LATE_NIGHT')).toBeTruthy();
  });

  it('WARN si hora local ≥22', () => {
    const r = evalGuardrails(cleanState({ local_hour: 23 }), cleanTrade());
    expect(r.warnings.find(w => w.rule === 'LATE_NIGHT_WARN')).toBeTruthy();
  });
});

describe('Sprint 22 — Pre-trade ritual', () => {
  it('BLOCK si checklist incompleto', () => {
    const trade = cleanTrade({ checklist: { iv_rank_ok: true, dte_range_ok: true } });  // 2/6
    const r = evalGuardrails(cleanState(), trade);
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'RITUAL_INCOMPLETE')).toBeTruthy();
  });

  it('BLOCK si thesis demasiado corto', () => {
    const r = evalGuardrails(cleanState(), cleanTrade({ thesis: 'short' }));
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'RITUAL_INCOMPLETE')).toBeTruthy();
  });

  it('BLOCK si conviction missing o fuera de rango', () => {
    expect(evalGuardrails(cleanState(), cleanTrade({ conviction: null })).allowed).toBe(false);
    expect(evalGuardrails(cleanState(), cleanTrade({ conviction: 7 })).allowed).toBe(false);
  });

  it('validateRitual standalone', () => {
    expect(validateRitual(cleanTrade()).complete).toBe(true);
    expect(validateRitual({}).complete).toBe(false);
    expect(validateRitual({ checklist: {}, thesis: 'x', conviction: 3 }).complete).toBe(false);
  });

  it('STANDARD_CHECKLIST exporta 6 items', () => {
    expect(STANDARD_CHECKLIST).toHaveLength(6);
    expect(STANDARD_CHECKLIST.every(i => i.id && i.label)).toBe(true);
  });
});

describe('Sprint 22 — Low brain score: require ack', () => {
  it('require_ack si brain_score <60', () => {
    const r = evalGuardrails(cleanState(), cleanTrade({ brain_score: 45 }));
    expect(r.require_ack.find(a => a.rule === 'LOW_BRAIN_SCORE')).toBeTruthy();
  });

  it('NO require_ack si brain_score ≥60', () => {
    const r = evalGuardrails(cleanState(), cleanTrade({ brain_score: 75 }));
    expect(r.require_ack.find(a => a.rule === 'LOW_BRAIN_SCORE')).toBeFalsy();
  });
});

describe('Sprint 22 — Override reason validation', () => {
  it('requires ≥50 chars', () => {
    expect(validateOverrideReason('short reason').valid).toBe(false);
    expect(validateOverrideReason('a'.repeat(50)).valid).toBe(true);
    expect(validateOverrideReason(null).valid).toBe(false);
  });
});

describe('Sprint 22 — Active kill-switches + cooldowns from DB', () => {
  it('respeta kill_switch activo', () => {
    const r = evalGuardrails(
      cleanState({ active_kill_switches: [{ rule: 'MANUAL_PAUSE', expires_at: new Date(Date.now() + 86400000).toISOString(), reason: 'user requested', can_override: false }] }),
      cleanTrade()
    );
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'KILL_SWITCH_MANUAL_PAUSE')).toBeTruthy();
  });

  it('respeta cooldown activo', () => {
    const r = evalGuardrails(
      cleanState({ active_cooldowns: [{ type: 'TILT', expires_at: new Date(Date.now() + 3600000).toISOString(), reason: '2h cooldown' }] }),
      cleanTrade()
    );
    expect(r.allowed).toBe(false);
    expect(r.blocked_by.find(b => b.rule === 'COOLDOWN_TILT')).toBeTruthy();
  });
});

describe('Sprint 22 — checkDailyKill helper', () => {
  it('triggered cuando ≤ -2%', () => {
    expect(checkDailyKill(-2.5).triggered).toBe(true);
  });
  it('warn-only cuando entre -1 y -2', () => {
    const r = checkDailyKill(-1.5);
    expect(r.triggered).toBe(false);
    expect(r.warn).toBe(true);
  });
  it('clean cuando positive', () => {
    expect(checkDailyKill(1.5).triggered).toBe(false);
  });
});
