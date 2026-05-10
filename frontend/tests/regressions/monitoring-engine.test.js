// Sprint 13 — Monitoring engine tests.

import { describe, it, expect } from 'vitest';
import {
  SEVERITY, MONITORING_DEFAULTS,
  detectAnomalies, formatTelegramMessage, summarizeAlerts,
} from '../../../api/src/lib/monitoring-engine.js';

describe('Sprint 13 — detectAnomalies()', () => {
  it('empty current → no alerts', () => {
    expect(detectAnomalies({})).toEqual([]);
  });

  it('caps allowed → blocked emits CRITICAL', () => {
    const prev = { caps_status: { allowed: true } };
    const cur = { caps_status: { allowed: false, blocked_by: ['VIX_KILL'] } };
    const a = detectAnomalies(cur, prev);
    expect(a.some(x => x.code === 'CAPS_STATE_FLIPPED')).toBe(true);
  });

  it('current blocked emits CAPS_BLOCKED for each block reason', () => {
    const cur = { caps_status: { allowed: false, blocked_by: ['VIX_KILL', 'MAX_CONCURRENT'] } };
    const a = detectAnomalies(cur);
    const blocked = a.filter(x => x.code === 'CAPS_BLOCKED');
    expect(blocked).toHaveLength(2);
  });

  it('VIX 26 → WARN (kill at 30)', () => {
    const cur = { caps_status: { state_snapshot: { vix: 26 } } };
    const a = detectAnomalies(cur);
    const warn = a.find(x => x.code === 'VIX_APPROACHING_KILL');
    expect(warn).toBeTruthy();
    expect(warn.severity).toBe('WARN');
  });

  it('VIX 35 → no VIX_APPROACHING (already past kill, handled by CAPS_BLOCKED)', () => {
    const cur = { caps_status: { allowed: false, blocked_by: ['VIX_KILL'], state_snapshot: { vix: 35 } } };
    const a = detectAnomalies(cur);
    expect(a.find(x => x.code === 'VIX_APPROACHING_KILL')).toBeFalsy();
  });

  it('drawdown spike >5% emits CRITICAL', () => {
    const prev = { caps_status: { state_snapshot: { drawdown_pct: 2 } } };
    const cur = { caps_status: { state_snapshot: { drawdown_pct: 9 } } };
    const a = detectAnomalies(cur, prev);
    const dd = a.find(x => x.code === 'DRAWDOWN_SPIKE');
    expect(dd).toBeTruthy();
    expect(dd.severity).toBe('CRITICAL');
  });

  it('concentration >70% emits WARN', () => {
    const cur = { portfolio_heat: [{ underlying: 'SPY', weight_pct: 85 }] };
    const a = detectAnomalies(cur);
    const conc = a.find(x => x.code === 'CONCENTRATION_SPIKE');
    expect(conc).toBeTruthy();
    expect(conc.message).toContain('SPY');
    expect(conc.message).toContain('85%');
  });

  it('loss streak 2 emits WARN, kill at 3', () => {
    const cur = { caps_status: { state_snapshot: { recent_loss_streak: 2 } } };
    const a = detectAnomalies(cur);
    expect(a.find(x => x.code === 'LOSS_STREAK_BUILDING')).toBeTruthy();
  });

  it('hedge DTE 12 emits CRITICAL roll', () => {
    const cur = { open_hedges: [{ id: 1, hedge_type: 'put_roll', symbol: 'SPY', strike: 600, dte_calculated: 12 }] };
    const a = detectAnomalies(cur);
    const roll = a.find(x => x.code === 'HEDGE_ROLL_URGENT');
    expect(roll).toBeTruthy();
    expect(roll.severity).toBe('CRITICAL');
  });

  it('hedge DTE 25 emits WARN roll suggestion', () => {
    const cur = { open_hedges: [{ id: 2, hedge_type: 'put_roll', symbol: 'SPY', strike: 600, dte_calculated: 25 }] };
    const a = detectAnomalies(cur);
    expect(a.find(x => x.code === 'HEDGE_ROLL_SUGGESTED')).toBeTruthy();
  });

  it('hedge DTE 60 → no alert', () => {
    const cur = { open_hedges: [{ id: 3, hedge_type: 'put_roll', symbol: 'SPY', strike: 600, dte_calculated: 60 }] };
    const a = detectAnomalies(cur);
    expect(a.filter(x => x.code.includes('HEDGE_ROLL'))).toHaveLength(0);
  });

  it('multiple alerts of different severities', () => {
    const cur = {
      caps_status: { allowed: false, blocked_by: ['VIX_KILL'], state_snapshot: { vix: 35 } },
      portfolio_heat: [{ underlying: 'SPY', weight_pct: 95 }],
    };
    const a = detectAnomalies(cur);
    expect(a.some(x => x.severity === 'CRITICAL')).toBe(true);
    expect(a.some(x => x.severity === 'WARN')).toBe(true);
  });
});

describe('Sprint 13 — formatTelegramMessage()', () => {
  it('returns null when no alerts above min severity', () => {
    expect(formatTelegramMessage([])).toBe(null);
    expect(formatTelegramMessage([{ severity: 'INFO', code: 'X', message: 'x' }], 'CRITICAL')).toBe(null);
  });

  it('formats CRITICAL + WARN groups separately', () => {
    const alerts = [
      { severity: 'CRITICAL', code: 'A', message: 'critical msg' },
      { severity: 'WARN', code: 'B', message: 'warn msg' },
      { severity: 'INFO', code: 'C', message: 'info msg' },
    ];
    const msg = formatTelegramMessage(alerts, 'INFO');
    expect(msg).toContain('CRITICAL (1)');
    expect(msg).toContain('WARN (1)');
    expect(msg).toContain('INFO (1)');
    expect(msg).toContain('critical msg');
    expect(msg).toContain('warn msg');
  });

  it('default min severity is WARN (no INFO shown)', () => {
    const alerts = [
      { severity: 'WARN', code: 'B', message: 'warn msg' },
      { severity: 'INFO', code: 'C', message: 'info msg' },
    ];
    const msg = formatTelegramMessage(alerts);
    expect(msg).toContain('warn msg');
    expect(msg).not.toContain('info msg');
  });
});

describe('Sprint 13 — summarizeAlerts()', () => {
  it('groups by severity + code', () => {
    const alerts = [
      { severity: 'CRITICAL', code: 'A', message: 'm' },
      { severity: 'CRITICAL', code: 'A', message: 'm' },
      { severity: 'WARN', code: 'B', message: 'm' },
    ];
    const s = summarizeAlerts(alerts);
    expect(s.total).toBe(3);
    expect(s.by_severity.CRITICAL).toBe(2);
    expect(s.by_severity.WARN).toBe(1);
    expect(s.by_code.A).toBe(2);
    expect(s.has_critical).toBe(true);
  });

  it('empty → has_critical = false', () => {
    expect(summarizeAlerts([]).has_critical).toBe(false);
  });
});
