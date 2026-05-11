// Sprint 19+ — Audit engine tests (continuous regression detection).

import { describe, it, expect } from 'vitest';
import {
  checkEndpointAuthCoverage, checkLiveTradingSafety, checkDataFreshness,
  checkBugPatternRegressions, runFullAudit, formatTelegramAlert, checkFieldNameContracts,
} from '../../../api/src/lib/audit-engine.js';

describe('Sprint 19+ — checkEndpointAuthCoverage()', () => {
  it('CRITICAL si WRITE endpoint sin auth', () => {
    const r = checkEndpointAuthCoverage([
      { path: '/api/x', method: 'POST', hasAuth: false },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].severity).toBe('CRITICAL');
    expect(r[0].id).toBe('AUTH_MISSING_WRITE');
  });

  it('HIGH si READ sensitive sin auth', () => {
    const r = checkEndpointAuthCoverage([
      { path: '/api/x', method: 'GET', hasAuth: false, isSensitive: true },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].severity).toBe('HIGH');
  });

  it('OK si READ no sensitive sin auth', () => {
    const r = checkEndpointAuthCoverage([
      { path: '/api/x', method: 'GET', hasAuth: false, isSensitive: false },
    ]);
    expect(r).toHaveLength(0);
  });

  it('handles empty / null', () => {
    expect(checkEndpointAuthCoverage([])).toEqual([]);
    expect(checkEndpointAuthCoverage(null)).toEqual([]);
  });
});

describe('Sprint 19+ — checkLiveTradingSafety()', () => {
  it('CRITICAL si live ON con NAV hardcoded $100k', () => {
    const r = checkLiveTradingSafety({ live_enabled: true, last_nav_used: 100000 });
    expect(r.find(f => f.id === 'LIVE_NAV_HARDCODED')).toBeTruthy();
  });

  it('OK si live ON con NAV real', () => {
    const r = checkLiveTradingSafety({ live_enabled: true, last_nav_used: 1400000 });
    expect(r.find(f => f.id === 'LIVE_NAV_HARDCODED')).toBeFalsy();
  });

  it('CRITICAL si tickets expirados aceptados', () => {
    const r = checkLiveTradingSafety({ live_enabled: true, expired_ticket_executed_count: 3 });
    const f = r.find(f => f.id === 'LIVE_EXPIRED_TICKET_ACCEPTED');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('CRITICAL');
  });

  it('HIGH si brain score hardcoded 75', () => {
    const r = checkLiveTradingSafety({ live_enabled: true, last_brain_score_used: 75 });
    expect(r.find(f => f.id === 'LIVE_BRAIN_SCORE_HARDCODED')).toBeTruthy();
  });

  it('skip checks si live OFF', () => {
    const r = checkLiveTradingSafety({ live_enabled: false, last_nav_used: 100000 });
    expect(r).toHaveLength(0);
  });
});

describe('Sprint 19+ — checkDataFreshness()', () => {
  it('HIGH si monitoring stale >36h', () => {
    const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const r = checkDataFreshness({ monitoring_last_check: old });
    expect(r.find(f => f.id === 'MONITORING_STALE')).toBeTruthy();
  });

  it('OK si monitoring fresh', () => {
    const recent = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const r = checkDataFreshness({ monitoring_last_check: recent });
    expect(r.find(f => f.id === 'MONITORING_STALE')).toBeFalsy();
  });

  it('MEDIUM si tournament >30 días', () => {
    const old = new Date(Date.now() - 45 * 86400 * 1000).toISOString();
    const r = checkDataFreshness({ tournament_last_run: old });
    expect(r.find(f => f.id === 'TOURNAMENT_STALE')).toBeTruthy();
  });
});

describe('Sprint 19+ — checkBugPatternRegressions()', () => {
  it('detecta regresion C2 (NAV fake)', () => {
    const r = checkBugPatternRegressions({ suggestions_with_fake_nav_count: 5 });
    expect(r.find(f => f.id === 'C2_REGRESSION_HARDCODED_NAV')).toBeTruthy();
  });

  it('Bug #015 pattern: no Telegram en 7+ días con cron activo', () => {
    const r = checkBugPatternRegressions({
      cron_last_telegram_alert_hours_ago: 200,
      cron_runs_in_week: 100,
    });
    expect(r.find(f => f.id === 'BUG_015_PATTERN_NO_TELEGRAM_IN_WEEK')).toBeTruthy();
  });
});

describe('Sprint 19+ — runFullAudit()', () => {
  it('aggrega findings de todos los packs', () => {
    const r = runFullAudit({
      endpoints: [{ path: '/x', method: 'POST', hasAuth: false }],
      live_safety: { live_enabled: true, last_nav_used: 100000 },
      snapshots: { monitoring_last_check: new Date(Date.now() - 48 * 3600 * 1000).toISOString() },
    });
    expect(r.findings.length).toBeGreaterThanOrEqual(3);
    expect(r.summary.has_critical).toBe(true);
    expect(r.summary.requires_immediate_action).toBe(true);
    expect(r.field_contracts).toBeDefined();
  });

  it('vacío si todo OK', () => {
    const r = runFullAudit({
      endpoints: [{ path: '/x', method: 'GET', hasAuth: true, isSensitive: false }],
      live_safety: { live_enabled: false },
      snapshots: { monitoring_last_check: new Date().toISOString() },
    });
    expect(r.summary.has_critical).toBe(false);
  });
});

describe('Sprint 19+ — formatTelegramAlert()', () => {
  it('null si no critical/high', () => {
    expect(formatTelegramAlert({ findings: [], summary: { has_critical: false, requires_immediate_action: false } })).toBe(null);
  });

  it('formatea CRITICAL + HIGH groups', () => {
    const audit = {
      findings: [
        { severity: 'CRITICAL', id: 'A', message: 'critical msg' },
        { severity: 'HIGH', id: 'B', message: 'high msg' },
      ],
      summary: { has_critical: true, requires_immediate_action: true },
    };
    const msg = formatTelegramAlert(audit);
    expect(msg).toContain('CRITICAL (1)');
    expect(msg).toContain('HIGH (1)');
    expect(msg).toContain('critical msg');
  });
});

describe('Sprint 19+ — checkFieldNameContracts()', () => {
  it('documenta contratos de field names entre endpoints y engines', () => {
    const c = checkFieldNameContracts();
    expect(c['paper/positions → shouldClose']).toBeDefined();
    expect(c['paper/positions → shouldClose'].mapping_required).toEqual({
      'pnl_pct': 'live_pnl_pct',
      'short_delta': 'current_short_delta',
    });
  });
});
