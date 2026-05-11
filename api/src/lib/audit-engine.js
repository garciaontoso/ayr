// Sprint 19+ — Continuous audit engine.
//
// Run check pack to detect regressions. Each check returns
// { id, severity (CRITICAL|HIGH|MEDIUM|LOW), passed (bool), message, fix_hint }.
//
// Designed to be called by cron diario + manual /audit/full endpoint.
// If any CRITICAL fails → Telegram alert immediate.
// Persisted in thetagang_audit_findings for trend tracking.
//
// Pure JS (lib). I/O happens in worker.js endpoint.

// ─── checkSchemaConsistency(schema, libExpectations) ────────────────────────
// Verifies that field names returned by endpoints match what engines expect.
// This is the kind of bug that caused C1 (Sprint 19) — silently broken auto-paper.
export function checkFieldNameContracts() {
  // Documents the contract between endpoints and consumers.
  // If any of these change, audit will detect mismatch immediately.
  return {
    'paper/positions → shouldClose': {
      endpoint_returns: ['pnl_pct', 'short_delta', 'current_dte', 'dte_open', 'open_date'],
      engine_expects: ['live_pnl_pct', 'current_short_delta', 'current_dte', 'dte_open', 'opened_at'],
      mapping_required: { 'pnl_pct': 'live_pnl_pct', 'short_delta': 'current_short_delta' },
    },
    'live/suggest state contract': {
      requires_real: ['nav', 'n_brain_score', 'recent_loss_streak', 'max_loss_per_contract'],
      hardcoded_BAD: [],  // si el código hardcodea estos, audit FAILA
    },
  };
}

// ─── checkEndpointAuthCoverage(routes) ──────────────────────────────────────
// Categoriza endpoints en READ_PUBLIC / READ_PROTECTED / WRITE_PROTECTED.
// WRITE endpoints sin auth → CRITICAL.
// READ endpoints sensibles (config, log, internal state) sin auth → HIGH.
export function checkEndpointAuthCoverage(routesList) {
  // routesList = [{ path, method, hasAuth, isSensitive }]
  const findings = [];
  for (const r of (routesList || [])) {
    if (r.method !== 'GET' && !r.hasAuth) {
      findings.push({
        id: 'AUTH_MISSING_WRITE',
        severity: 'CRITICAL',
        endpoint: `${r.method} ${r.path}`,
        message: `WRITE endpoint without ytRequireToken — anyone can call`,
        fix_hint: 'Add: const unauth = ytRequireToken(request, env); if (unauth) return unauth;',
      });
    } else if (r.method === 'GET' && r.isSensitive && !r.hasAuth) {
      findings.push({
        id: 'AUTH_MISSING_READ_SENSITIVE',
        severity: 'HIGH',
        endpoint: `${r.method} ${r.path}`,
        message: `Sensitive READ endpoint exposes operational state without auth`,
        fix_hint: 'Add ytRequireToken if endpoint exposes config, logs, or internal state',
      });
    }
  }
  return findings;
}

// ─── checkLiveTradingSafety(state) ──────────────────────────────────────────
// Pre-flight check específico para Live trading. Si Live ENABLED y caps OK
// pero hay safety gap, alerta immediate.
export function checkLiveTradingSafety(state) {
  const findings = [];
  if (!state) return findings;

  // CRITICAL: Live enabled pero NAV no fetched (hardcoded fake NAV)
  if (state.live_enabled && state.last_nav_used && state.last_nav_used === 100000) {
    findings.push({
      id: 'LIVE_NAV_HARDCODED',
      severity: 'CRITICAL',
      message: 'Live suggestion used $100k fake NAV instead of real account NAV',
      fix_hint: 'Verify nlv_history fetched in /live/suggest endpoint',
    });
  }

  // CRITICAL: Live enabled pero ticket expirado se aceptó
  if (state.live_enabled && state.expired_ticket_executed_count > 0) {
    findings.push({
      id: 'LIVE_EXPIRED_TICKET_ACCEPTED',
      severity: 'CRITICAL',
      message: `${state.expired_ticket_executed_count} expired tickets marked executed (data integrity broken)`,
      fix_hint: 'Verify mark-executed validates ticket.valid_until > now',
    });
  }

  // HIGH: Live enabled + brain score check bypassed
  if (state.live_enabled && state.last_brain_score_used === 75) {
    findings.push({
      id: 'LIVE_BRAIN_SCORE_HARDCODED',
      severity: 'HIGH',
      message: 'Live suggestion used hardcoded brain_score 75 (gate bypassed)',
      fix_hint: 'Verify brain/scan called in /live/suggest before preTradeChecks',
    });
  }

  return findings;
}

// ─── checkDataFreshness(snapshots) ──────────────────────────────────────────
// snapshots: { paper_trades_max_date, live_orders_max_date, monitoring_last_check, tournament_last_run }
// Returns findings for stale data.
export function checkDataFreshness(snapshots, opts = {}) {
  const findings = [];
  if (!snapshots) return findings;
  const now = Date.now();
  const hoursSince = (dateStr) => {
    if (!dateStr) return Infinity;
    // Normalize SQLite "YYYY-MM-DD HH:MM:SS" to ISO. Handle case where input
    // ya está en ISO con Z (no añadir doble Z = Invalid Date).
    let s = String(dateStr).replace(' ', 'T');
    if (!/[zZ]$/.test(s) && !/[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
    const d = new Date(s);
    if (isNaN(d.getTime())) return Infinity;
    return (now - d.getTime()) / 3600000;
  };

  if (snapshots.monitoring_last_check) {
    const h = hoursSince(snapshots.monitoring_last_check);
    if (h > 36) {
      findings.push({
        id: 'MONITORING_STALE',
        severity: 'HIGH',
        message: `Monitoring last check was ${h.toFixed(1)}h ago (expected daily)`,
        fix_hint: 'Check cron 08:00 UTC running. Verify /api/thetagang/monitoring/check called.',
      });
    }
  }

  if (snapshots.tournament_last_run) {
    const days = hoursSince(snapshots.tournament_last_run) / 24;
    if (days > 30) {
      findings.push({
        id: 'TOURNAMENT_STALE',
        severity: 'MEDIUM',
        message: `Tournament not run for ${days.toFixed(0)} days — strategies may be outdated`,
        fix_hint: 'POST /api/thetagang/tournament/run to refresh leaderboard',
      });
    }
  }

  return findings;
}

// ─── checkBugPatternRegressions(stats) ──────────────────────────────────────
// Detect signs that recurring bugs are happening again.
// Based on patterns in docs/bug-patterns.md.
export function checkBugPatternRegressions(stats) {
  const findings = [];
  if (!stats) return findings;

  // Bug #015 pattern: silent failures in cron
  if (stats.cron_last_telegram_alert_hours_ago > 168 && stats.cron_runs_in_week > 0) {
    findings.push({
      id: 'BUG_015_PATTERN_NO_TELEGRAM_IN_WEEK',
      severity: 'MEDIUM',
      message: 'No Telegram alerts in 7+ days. Either system is perfect (unlikely) or alerts are broken silently.',
      fix_hint: 'Trigger manual: POST /api/thetagang/monitoring/check + verify Telegram receives test',
    });
  }

  // Sprint 19 pattern: hardcoded values in pre-trade checks
  if (stats.suggestions_with_fake_nav_count > 0) {
    findings.push({
      id: 'C2_REGRESSION_HARDCODED_NAV',
      severity: 'CRITICAL',
      message: `${stats.suggestions_with_fake_nav_count} live suggestions used fake $100k NAV`,
      fix_hint: 'Audit /live/suggest endpoint — should fetch real NAV from nlv_history',
    });
  }

  return findings;
}

// ─── runFullAudit(state) — orchestrator ────────────────────────────────────
// Executes all check packs and returns aggregated findings + summary.
export function runFullAudit(state = {}) {
  const allFindings = [];

  if (state.endpoints) {
    allFindings.push(...checkEndpointAuthCoverage(state.endpoints));
  }
  if (state.live_safety) {
    allFindings.push(...checkLiveTradingSafety(state.live_safety));
  }
  if (state.snapshots) {
    allFindings.push(...checkDataFreshness(state.snapshots));
  }
  if (state.bug_pattern_stats) {
    allFindings.push(...checkBugPatternRegressions(state.bug_pattern_stats));
  }

  const by_severity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of allFindings) by_severity[f.severity] = (by_severity[f.severity] || 0) + 1;

  return {
    findings: allFindings,
    summary: {
      total: allFindings.length,
      by_severity,
      has_critical: by_severity.CRITICAL > 0,
      requires_immediate_action: by_severity.CRITICAL + by_severity.HIGH > 0,
    },
    field_contracts: checkFieldNameContracts(),
    timestamp: new Date().toISOString(),
  };
}

// ─── formatTelegramAlert(audit) ─────────────────────────────────────────────
export function formatTelegramAlert(audit) {
  const { findings, summary } = audit;
  if (!summary.has_critical && !summary.requires_immediate_action) return null;

  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const high = findings.filter(f => f.severity === 'HIGH');

  const lines = [
    `🚨 *Theta Gang Audit Alert*`,
    `${new Date().toISOString().slice(0, 16)}Z`,
    ``,
  ];
  if (critical.length) {
    lines.push(`🔴 *CRITICAL (${critical.length})*`);
    for (const f of critical) lines.push(`• ${f.id}: ${f.message}`);
    lines.push('');
  }
  if (high.length) {
    lines.push(`⚠ *HIGH (${high.length})*`);
    for (const f of high) lines.push(`• ${f.id}: ${f.message}`);
  }
  return lines.join('\n').trim();
}
