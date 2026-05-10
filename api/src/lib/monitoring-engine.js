// Sprint 13 — Production monitoring + anomaly detection.
//
// Why this exists: Sprint 9 built risk caps (the GUARD). Sprint 13 builds the
// MONITOR — periodic checks que detectan situaciones nuevas requiriendo
// atención del usuario sin esperar a que las descubra revisando manualmente.
//
// Patrón anti-fallo (Bug #015 Flex token caducado 9 días sin alert):
// CUALQUIER cambio crítico DEBE generar Telegram CRITICAL automáticamente.
//
// Pure JS. No DB. No fetch. Compatible Cloudflare Worker.

// ─── Severity levels ────────────────────────────────────────────────────────
export const SEVERITY = Object.freeze({
  CRITICAL: 'CRITICAL',  // immediate action needed (positions blocked, drawdown kill)
  WARN: 'WARN',          // attention needed (approaching limits)
  INFO: 'INFO',          // informational (state change worth noting)
});

// ─── Thresholds ─────────────────────────────────────────────────────────────
export const MONITORING_DEFAULTS = {
  drawdown_spike_pct: 5,           // alert if drawdown jumps >5% since last check
  concentration_spike_pct: 70,      // alert if any underlying >70% of delta exposure
  paper_drift_pct: 30,              // alert if paper P&L diverges >30% from backtest expectation
  loss_streak_warn: 2,              // warn at 2 consecutive losses (kill at 3)
  vix_warn: 25,                     // warn approaching kill threshold (30)
  hedge_dte_warn: 30,               // warn if any hedge DTE < 30 (rolling time)
  hedge_dte_critical: 14,           // critical if any hedge DTE < 14 (urgent roll)
  caps_state_change: true,          // alert when caps_status flips allowed↔blocked
};

// ─── Detect anomalies given current + previous snapshots ───────────────────
//
// current: { caps_status, portfolio_heat, paper_scoreboard, open_hedges, ... }
// previous: same shape, last check (null if first run)
// Returns: array of { severity, code, message, details }
export function detectAnomalies(current, previous = null, thresholds = MONITORING_DEFAULTS) {
  const alerts = [];
  const t = { ...MONITORING_DEFAULTS, ...thresholds };

  // ── 1. Caps state changed (allowed → blocked) ──
  if (previous && current.caps_status && previous.caps_status) {
    const wasAllowed = previous.caps_status.allowed === true;
    const isBlocked = current.caps_status.allowed === false;
    if (wasAllowed && isBlocked) {
      alerts.push({
        severity: SEVERITY.CRITICAL,
        code: 'CAPS_STATE_FLIPPED',
        message: `🚫 Risk caps blocked entries (was allowed)`,
        details: { blocked_by: current.caps_status.blocked_by },
      });
    }
  }

  // ── 2. Currently blocked (any block in current state, regardless of previous) ──
  if (current.caps_status && current.caps_status.allowed === false) {
    for (const block of (current.caps_status.blocked_by || [])) {
      alerts.push({
        severity: SEVERITY.CRITICAL,
        code: 'CAPS_BLOCKED',
        message: `🚫 ${block}`,
        details: { state: current.caps_status.state_snapshot },
      });
    }
  }

  // ── 3. VIX warn approaching kill ──
  const vix = current.caps_status?.state_snapshot?.vix;
  if (vix != null && vix >= t.vix_warn && vix < 30) {
    alerts.push({
      severity: SEVERITY.WARN,
      code: 'VIX_APPROACHING_KILL',
      message: `⚠ VIX ${vix.toFixed(1)} acercándose a kill threshold (30)`,
      details: { vix, kill_at: 30 },
    });
  }

  // ── 4. Drawdown spike since last check ──
  const ddNow = current.caps_status?.state_snapshot?.drawdown_pct || 0;
  const ddPrev = previous?.caps_status?.state_snapshot?.drawdown_pct || 0;
  if (ddNow - ddPrev >= t.drawdown_spike_pct) {
    alerts.push({
      severity: SEVERITY.CRITICAL,
      code: 'DRAWDOWN_SPIKE',
      message: `📉 Drawdown subió +${(ddNow - ddPrev).toFixed(1)}% desde último check (ahora ${ddNow.toFixed(1)}%)`,
      details: { previous: ddPrev, current: ddNow },
    });
  }

  // ── 5. Concentration spike (any single underlying > threshold) ──
  if (current.portfolio_heat && Array.isArray(current.portfolio_heat)) {
    const maxHeat = current.portfolio_heat[0]; // already sorted desc
    if (maxHeat && maxHeat.weight_pct >= t.concentration_spike_pct) {
      alerts.push({
        severity: SEVERITY.WARN,
        code: 'CONCENTRATION_SPIKE',
        message: `🎯 ${maxHeat.underlying} = ${maxHeat.weight_pct}% del delta exposure (umbral ${t.concentration_spike_pct}%)`,
        details: { underlying: maxHeat.underlying, weight_pct: maxHeat.weight_pct },
      });
    }
  }

  // ── 6. Loss streak warning (2 antes de kill 3) ──
  const streak = current.caps_status?.state_snapshot?.recent_loss_streak || 0;
  if (streak >= t.loss_streak_warn && streak < 3) {
    alerts.push({
      severity: SEVERITY.WARN,
      code: 'LOSS_STREAK_BUILDING',
      message: `⚠ ${streak} pérdidas consecutivas (kill en 3)`,
      details: { streak, kill_at: 3 },
    });
  }

  // ── 7. Hedge rolling alerts ──
  if (current.open_hedges && Array.isArray(current.open_hedges)) {
    for (const h of current.open_hedges) {
      const dte = h.dte_calculated;
      if (dte != null) {
        if (dte < t.hedge_dte_critical) {
          alerts.push({
            severity: SEVERITY.CRITICAL,
            code: 'HEDGE_ROLL_URGENT',
            message: `🛡️ Hedge ${h.hedge_type} ${h.symbol} ${h.strike} expira en ${dte}d (CRITICAL: rolar YA)`,
            details: { id: h.id, hedge_type: h.hedge_type, dte, expiry: h.expiry },
          });
        } else if (dte < t.hedge_dte_warn) {
          alerts.push({
            severity: SEVERITY.WARN,
            code: 'HEDGE_ROLL_SUGGESTED',
            message: `🛡️ Hedge ${h.hedge_type} ${h.symbol} ${h.strike} DTE ${dte} — considera rolar`,
            details: { id: h.id, hedge_type: h.hedge_type, dte, expiry: h.expiry },
          });
        }
      }
    }
  }

  // ── 8. Paper drift vs backtest (futuro: cuando paper_scoreboard tenga drift_pct) ──
  if (current.paper_scoreboard?.drift_detected) {
    alerts.push({
      severity: SEVERITY.WARN,
      code: 'PAPER_DRIFT',
      message: `📝 Paper P&L diverge ${current.paper_scoreboard.drift_pct}% del backtest esperado`,
      details: current.paper_scoreboard,
    });
  }

  return alerts;
}

// ─── Format alerts for Telegram (markdown) ──────────────────────────────────
//
// Returns string. Returns null if no alerts above min severity.
export function formatTelegramMessage(alerts, minSeverity = SEVERITY.WARN) {
  const order = { [SEVERITY.CRITICAL]: 0, [SEVERITY.WARN]: 1, [SEVERITY.INFO]: 2 };
  const minOrder = order[minSeverity] ?? 1;
  const filtered = alerts.filter(a => order[a.severity] <= minOrder);
  if (filtered.length === 0) return null;

  const groups = { [SEVERITY.CRITICAL]: [], [SEVERITY.WARN]: [], [SEVERITY.INFO]: [] };
  for (const a of filtered) (groups[a.severity] || groups.INFO).push(a);

  const lines = [`*🤡 Theta Gang monitoring — ${new Date().toISOString().slice(0, 16)}Z*`, ''];
  if (groups.CRITICAL.length) {
    lines.push(`🚨 *CRITICAL (${groups.CRITICAL.length})*`);
    for (const a of groups.CRITICAL) lines.push(`• ${a.message}`);
    lines.push('');
  }
  if (groups.WARN.length) {
    lines.push(`⚠ *WARN (${groups.WARN.length})*`);
    for (const a of groups.WARN) lines.push(`• ${a.message}`);
    lines.push('');
  }
  if (groups.INFO.length) {
    lines.push(`ℹ️ *INFO (${groups.INFO.length})*`);
    for (const a of groups.INFO) lines.push(`• ${a.message}`);
  }

  return lines.join('\n').trim();
}

// ─── Compute monitoring summary stats ──────────────────────────────────────
export function summarizeAlerts(alerts) {
  const by_severity = { CRITICAL: 0, WARN: 0, INFO: 0 };
  const by_code = {};
  for (const a of alerts) {
    by_severity[a.severity] = (by_severity[a.severity] || 0) + 1;
    by_code[a.code] = (by_code[a.code] || 0) + 1;
  }
  return {
    total: alerts.length,
    by_severity,
    by_code,
    has_critical: by_severity.CRITICAL > 0,
    timestamp: new Date().toISOString(),
  };
}
