// Sprint 22 — Anti-Estupidez Engine: behavioral guardrails that protect the
// trader from the predictable mistakes that destroy retail options accounts.
//
// Philosophy: top traders aren't smart, they're disciplined. The system
// must REFUSE actions when known antipatterns trigger, not just warn.
//
// 7 errors targeted (cost ordered):
//   1. Revenge trade after loss            → tilt detector
//   2. Over-size after wins                → trade count cap + concentration
//   3. Holding losers (waiting for bounce) → escalating Telegram + UI banner
//   4. Earnings without intent             → earnings sentinel
//   5. Concentration creep                 → hard cap 8% NAV per underlying
//   6. Skipping brain filter               → require_ack with reason
//   7. Trading tired/emotional             → time-of-day + tilt patterns
//
// Pure functions, no DB, no fetch. Compatible Cloudflare Worker.

export const GUARDRAIL_DEFAULTS = {
  // Daily kill-switch
  daily_loss_pct_block: -2.0,              // -2% NAV today → block all opens
  daily_loss_pct_warn:  -1.0,              // -1% NAV today → warn

  // Tilt detector
  tilt_max_actions_30min:  5,              // >5 abrir/cerrar/cancel en 30min = tilt
  tilt_cooldown_minutes:   120,            // 2h cooldown forzado
  // Revenge pattern: cerrar perdiendo + abrir nuevo en <10min
  revenge_window_minutes: 10,

  // Concentration
  concentration_max_pct_underlying: 8.0,   // single underlying >8% NAV = block
  concentration_max_spreads_underlying: 3, // ≥3 spreads abiertos mismo símbolo = block

  // Earnings sentinel
  earnings_dte_buffer_days: 1,             // DTE must end >=1d AFTER earnings (no overlap)

  // Regime
  vix_max_for_new_short_vol: 28,           // VIX>28 = no new short-vol entries
  vix_warn_for_new_short_vol: 22,

  // Pre-trade ritual
  min_thesis_chars: 20,                    // minimum thesis length
  min_conviction: 1,
  max_conviction: 5,
  required_checklist_items: 6,             // 6 boxes must be ticked

  // Override discipline
  override_min_reason_chars: 50,           // double-confirm with reason text

  // Time-of-day (Madrid local)
  late_hour_warn_after: 22,                // ≥22:00 local = warn (fatigue)
  late_hour_block_after: 1,                // 01:00 local = block (sleep)

  // Weekly review
  weekly_review_required: true,            // Sunday review must be done before Monday opens

  // Skip-brain filter
  require_ack_on_skipping_brain_below: 60, // si brain score <60 y user fuerza, require ack

  // Loss streak
  loss_streak_block_threshold: 3,          // 3 trades cerrados con pérdida seguidos = pausa 24h
};

// ─── evalGuardrails(state, trade, opts) ────────────────────────────────────
//
// state: {
//   nav, daily_pnl_dollars, daily_pnl_pct, weekly_opens_count,
//   recent_actions: [{ts, type, symbol}],  // últimas 60min de actividad
//   recent_closes: [{ts, pnl_dollars, symbol}],
//   open_positions: [{symbol, contracts, market_value, ...}],
//   loss_streak,
//   weekly_review_done_at, weekly_review_required_by,
//   active_kill_switches: [{rule, expires_at, can_override}],
//   active_cooldowns: [{type, expires_at, reason}],
//   regime: { vix, vix3m, regime_label },
//   earnings_calendar: { [symbol]: 'YYYY-MM-DD' },
//   journal_pending_close_count,           // trades cerrados sin journal
// }
// trade: { strategy, symbol, contracts, dte, brain_score?, conviction?, thesis?, checklist? }
// opts: GUARDRAIL_DEFAULTS overrides
//
// Returns:
// {
//   allowed: bool,
//   blocked_by: [{ rule, severity, can_override, reason, until? }],
//   warnings:  [{ rule, message }],
//   require_ack: [{ rule, prompt }],  // must explicit acknowledgement
//   ritual_required: { checklist: [...], conviction_required: true, thesis_required: true },
// }
export function evalGuardrails(state, trade, opts = {}) {
  const g = { ...GUARDRAIL_DEFAULTS, ...opts };
  const blocked_by = [];
  const warnings = [];
  const require_ack = [];

  if (!state || typeof state !== 'object') {
    return { allowed: false, blocked_by: [{ rule: 'INVALID_STATE', severity: 'CRITICAL', reason: 'state missing' }], warnings, require_ack };
  }
  if (!trade || !trade.symbol || !trade.strategy) {
    return { allowed: false, blocked_by: [{ rule: 'INVALID_TRADE', severity: 'CRITICAL', reason: 'trade.symbol + strategy required' }], warnings, require_ack };
  }

  const symbol = String(trade.symbol).toUpperCase();
  const contracts = Number(trade.contracts) || 1;

  // 1. ACTIVE KILL-SWITCHES (hard block, possibly overridable with reason)
  for (const ks of (state.active_kill_switches || [])) {
    blocked_by.push({
      rule: `KILL_SWITCH_${ks.rule}`,
      severity: 'CRITICAL',
      can_override: !!ks.can_override,
      reason: ks.reason || ks.rule,
      until: ks.expires_at,
    });
  }

  // 2. ACTIVE COOLDOWNS (hard block, NO override)
  for (const cd of (state.active_cooldowns || [])) {
    blocked_by.push({
      rule: `COOLDOWN_${cd.type}`,
      severity: 'CRITICAL',
      can_override: false,
      reason: cd.reason || cd.type,
      until: cd.expires_at,
    });
  }

  // 3. DAILY LOSS KILL-SWITCH
  if (typeof state.daily_pnl_pct === 'number') {
    if (state.daily_pnl_pct <= g.daily_loss_pct_block) {
      blocked_by.push({
        rule: 'DAILY_LOSS_LIMIT',
        severity: 'CRITICAL',
        can_override: true,  // override forces reason >50 chars
        reason: `P&L hoy ${state.daily_pnl_pct.toFixed(2)}% NAV ≤ límite ${g.daily_loss_pct_block}%`,
      });
    } else if (state.daily_pnl_pct <= g.daily_loss_pct_warn) {
      warnings.push({ rule: 'DAILY_LOSS_WARN', message: `P&L hoy ${state.daily_pnl_pct.toFixed(2)}% — cerca del kill-switch (${g.daily_loss_pct_block}%)` });
    }
  }

  // 4. TILT DETECTOR (>N actions in last 30min)
  const now = state.now_ts || Date.now();
  const recent30 = (state.recent_actions || []).filter(a => now - new Date(a.ts).getTime() < 30 * 60_000);
  if (recent30.length > g.tilt_max_actions_30min) {
    blocked_by.push({
      rule: 'TILT_DETECTED',
      severity: 'CRITICAL',
      can_override: false,
      reason: `${recent30.length} acciones en 30min — patrón tilt. Cooldown forzado ${g.tilt_cooldown_minutes}min.`,
    });
  }

  // 5. REVENGE TRADE PATTERN: cerrar perdiendo + abrir nuevo en <10min
  const recentLosses = (state.recent_closes || []).filter(c =>
    c.pnl_dollars < 0 && (now - new Date(c.ts).getTime()) < g.revenge_window_minutes * 60_000
  );
  if (recentLosses.length > 0) {
    blocked_by.push({
      rule: 'REVENGE_PATTERN',
      severity: 'CRITICAL',
      can_override: true,
      reason: `Cerraste ${recentLosses[0].symbol} perdiendo $${Math.abs(recentLosses[0].pnl_dollars).toFixed(0)} hace ${Math.round((now - new Date(recentLosses[0].ts).getTime()) / 60000)}min. Patrón revenge — pausa ${g.revenge_window_minutes}min.`,
    });
  }

  // 6. CONCENTRATION CAP (per underlying, % NAV + spread count)
  const nav = state.nav || 0;
  if (nav > 0) {
    const sameSymbol = (state.open_positions || []).filter(p =>
      (p.symbol === symbol || p.underlying === symbol)
    );
    const sameSymbolValue = sameSymbol.reduce((s, p) => s + Math.abs(p.market_value || 0), 0);
    const sameSymbolPct = (sameSymbolValue / nav) * 100;
    if (sameSymbolPct >= g.concentration_max_pct_underlying) {
      blocked_by.push({
        rule: 'CONCENTRATION_NAV',
        severity: 'CRITICAL',
        can_override: false,
        reason: `Ya tienes ${sameSymbolPct.toFixed(1)}% NAV en ${symbol} (max ${g.concentration_max_pct_underlying}%)`,
      });
    } else if (sameSymbolPct >= g.concentration_max_pct_underlying * 0.75) {
      warnings.push({ rule: 'CONCENTRATION_NEAR', message: `${symbol} ya es ${sameSymbolPct.toFixed(1)}% NAV (cerca del max ${g.concentration_max_pct_underlying}%)` });
    }

    const spreadsInSymbol = sameSymbol.length;
    if (spreadsInSymbol >= g.concentration_max_spreads_underlying) {
      blocked_by.push({
        rule: 'CONCENTRATION_SPREADS',
        severity: 'CRITICAL',
        can_override: false,
        reason: `Ya tienes ${spreadsInSymbol} spreads abiertos en ${symbol} (max ${g.concentration_max_spreads_underlying})`,
      });
    }
  }

  // 7. EARNINGS SENTINEL
  if (state.earnings_calendar && trade.dte != null) {
    const earningsDateStr = state.earnings_calendar[symbol];
    if (earningsDateStr) {
      const earningsDays = daysUntilStr(earningsDateStr, now);
      const ttl = trade.dte;
      // Block if earnings happens during trade life unless explicit earnings_intent
      if (earningsDays != null && earningsDays >= 0 && earningsDays <= ttl - g.earnings_dte_buffer_days) {
        if (!trade.earnings_intent && trade.strategy !== 'Earnings_IC' && trade.strategy !== 'EARNINGS_IF') {
          blocked_by.push({
            rule: 'EARNINGS_CROSS',
            severity: 'CRITICAL',
            can_override: true,
            reason: `${symbol} reporta earnings ${earningsDateStr} (en ${earningsDays}d) — tu DTE ${ttl}d cruza. IV crush asimétrico. Si es intencional marca earnings_intent=true.`,
          });
        }
      }
    }
  }

  // 8. REGIME GATE (VIX > threshold = no new short-vol)
  if (state.regime?.vix != null) {
    const vix = Number(state.regime.vix);
    const isShortVol = ['BPS', 'IC', 'CSP', 'STRANGLE', 'JADE_LIZARD'].includes((trade.strategy || '').toUpperCase());
    if (isShortVol && vix > g.vix_max_for_new_short_vol) {
      blocked_by.push({
        rule: 'REGIME_VIX',
        severity: 'CRITICAL',
        can_override: true,
        reason: `VIX ${vix.toFixed(1)} > ${g.vix_max_for_new_short_vol}. Régimen de stress — no entries short-vol nuevas.`,
      });
    } else if (isShortVol && vix > g.vix_warn_for_new_short_vol) {
      warnings.push({ rule: 'REGIME_VIX_WARN', message: `VIX ${vix.toFixed(1)} elevado — entry con cautela.` });
    }
  }

  // 9. LOSS STREAK PAUSE
  if ((state.loss_streak || 0) >= g.loss_streak_block_threshold) {
    blocked_by.push({
      rule: 'LOSS_STREAK',
      severity: 'CRITICAL',
      can_override: true,
      reason: `${state.loss_streak} pérdidas seguidas. El sistema te pide pausa 24h para revisar thesis.`,
    });
  }

  // 10. WEEKLY REVIEW NOT DONE (Monday block)
  if (g.weekly_review_required && state.weekly_review_required_by) {
    const required = new Date(state.weekly_review_required_by).getTime();
    if (!state.weekly_review_done_at && now > required) {
      blocked_by.push({
        rule: 'WEEKLY_REVIEW_PENDING',
        severity: 'CRITICAL',
        can_override: false,
        reason: `Domingo review pendiente desde ${state.weekly_review_required_by}. Completa antes de operar.`,
      });
    }
  }

  // 11. JOURNAL PENDING CLOSE REVIEW
  if ((state.journal_pending_close_count || 0) > 0) {
    blocked_by.push({
      rule: 'JOURNAL_PENDING',
      severity: 'CRITICAL',
      can_override: false,
      reason: `${state.journal_pending_close_count} trades cerrados sin journal. Completa review antes de abrir nuevos.`,
    });
  }

  // 12. LATE-NIGHT FATIGUE (Madrid local)
  if (state.local_hour != null) {
    const h = Number(state.local_hour);
    if (h >= 0 && h < g.late_hour_block_after) {
      blocked_by.push({
        rule: 'LATE_NIGHT',
        severity: 'CRITICAL',
        can_override: true,
        reason: `Son las ${h}:XX local — sleep. Guárdalo como draft para mañana.`,
      });
    } else if (h >= g.late_hour_warn_after) {
      warnings.push({ rule: 'LATE_NIGHT_WARN', message: `Son las ${h}:XX — fatiga. Tu win rate <22:00 vs >22:00 difiere ~20%.` });
    }
  }

  // 13. BRAIN SCORE SKIP (require explicit ack)
  if (trade.brain_score != null && trade.brain_score < g.require_ack_on_skipping_brain_below) {
    require_ack.push({
      rule: 'LOW_BRAIN_SCORE',
      prompt: `Brain score ${trade.brain_score} <${g.require_ack_on_skipping_brain_below}. ¿Por qué saltarse el filter? (Escribe razón)`,
    });
  }

  // 14. PRE-TRADE RITUAL ENFORCEMENT
  const checklist = trade.checklist || {};
  const checkedItems = Object.values(checklist).filter(Boolean).length;
  const ritualMissing = [];
  if (checkedItems < g.required_checklist_items) ritualMissing.push(`${checkedItems}/${g.required_checklist_items} checklist items ticked`);
  if (!trade.thesis || String(trade.thesis).trim().length < g.min_thesis_chars) ritualMissing.push(`thesis (mín ${g.min_thesis_chars} chars)`);
  if (trade.conviction == null || trade.conviction < g.min_conviction || trade.conviction > g.max_conviction) ritualMissing.push(`conviction (1-5)`);

  if (ritualMissing.length > 0) {
    blocked_by.push({
      rule: 'RITUAL_INCOMPLETE',
      severity: 'CRITICAL',
      can_override: false,
      reason: `Pre-trade ritual incompleto: ${ritualMissing.join('; ')}`,
    });
  }

  return {
    allowed: blocked_by.length === 0,
    blocked_by,
    warnings,
    require_ack,
    ritual_required: {
      checklist_min: g.required_checklist_items,
      thesis_min_chars: g.min_thesis_chars,
      conviction_required: true,
    },
  };
}

// ─── detectTilt(recent_actions, opts) ──────────────────────────────────────
// Returns { tilted, reason, cooldown_until }
export function detectTilt(recentActions, opts = {}) {
  const g = { ...GUARDRAIL_DEFAULTS, ...opts };
  if (!Array.isArray(recentActions) || recentActions.length === 0) return { tilted: false };
  const now = opts.now_ts || Date.now();
  const recent30 = recentActions.filter(a => now - new Date(a.ts).getTime() < 30 * 60_000);
  if (recent30.length > g.tilt_max_actions_30min) {
    return {
      tilted: true,
      reason: `${recent30.length} acciones en 30min > umbral ${g.tilt_max_actions_30min}`,
      cooldown_until: new Date(now + g.tilt_cooldown_minutes * 60_000).toISOString(),
    };
  }
  // Pattern: open→close-loss→open→close-loss within 60min (escalating revenge)
  const opens = recent30.filter(a => a.type === 'open').length;
  const closesLoss = recent30.filter(a => a.type === 'close' && (a.pnl_dollars || 0) < 0).length;
  if (closesLoss >= 2 && opens >= 2) {
    return {
      tilted: true,
      reason: `Patrón revenge: ${opens} aperturas + ${closesLoss} cierres perdiendo en 30min`,
      cooldown_until: new Date(now + g.tilt_cooldown_minutes * 60_000).toISOString(),
    };
  }
  return { tilted: false };
}

// ─── checkConcentration(positions, newTrade, nav, opts) ────────────────────
export function checkConcentration(positions, newTrade, nav, opts = {}) {
  const g = { ...GUARDRAIL_DEFAULTS, ...opts };
  const symbol = String(newTrade.symbol || '').toUpperCase();
  if (!symbol || !Array.isArray(positions) || !nav || nav <= 0) {
    return { ok: true, reason: 'insufficient_data' };
  }
  const sameSymbol = positions.filter(p => (p.symbol || p.underlying || '').toUpperCase() === symbol);
  const totalValue = sameSymbol.reduce((s, p) => s + Math.abs(p.market_value || 0), 0);
  const pct = (totalValue / nav) * 100;
  const spreads = sameSymbol.length;
  if (pct >= g.concentration_max_pct_underlying) {
    return { ok: false, rule: 'NAV_PCT', reason: `${symbol} ya es ${pct.toFixed(1)}% NAV (max ${g.concentration_max_pct_underlying}%)` };
  }
  if (spreads >= g.concentration_max_spreads_underlying) {
    return { ok: false, rule: 'SPREAD_COUNT', reason: `${spreads} spreads abiertos en ${symbol} (max ${g.concentration_max_spreads_underlying})` };
  }
  return { ok: true, current_pct: pct, current_spreads: spreads };
}

// ─── checkEarningsCross(symbol, dte, earningsCalendar, opts) ───────────────
export function checkEarningsCross(symbol, dte, earningsCalendar, opts = {}) {
  const g = { ...GUARDRAIL_DEFAULTS, ...opts };
  if (!earningsCalendar || dte == null) return { crosses: false, reason: 'no_data' };
  const sym = String(symbol || '').toUpperCase();
  const earningsDateStr = earningsCalendar[sym];
  if (!earningsDateStr) return { crosses: false };
  const days = daysUntilStr(earningsDateStr, opts.now_ts || Date.now());
  if (days == null || days < 0) return { crosses: false, earnings_passed: true };
  if (days <= dte - g.earnings_dte_buffer_days) {
    return { crosses: true, earnings_in_days: days, dte, earnings_date: earningsDateStr };
  }
  return { crosses: false, earnings_in_days: days };
}

// ─── checkDailyKill(daily_pnl_pct, opts) ───────────────────────────────────
export function checkDailyKill(dailyPnlPct, opts = {}) {
  const g = { ...GUARDRAIL_DEFAULTS, ...opts };
  if (typeof dailyPnlPct !== 'number') return { triggered: false };
  if (dailyPnlPct <= g.daily_loss_pct_block) {
    return { triggered: true, severity: 'CRITICAL', reason: `Daily P&L ${dailyPnlPct.toFixed(2)}% ≤ ${g.daily_loss_pct_block}%` };
  }
  if (dailyPnlPct <= g.daily_loss_pct_warn) {
    return { triggered: false, warn: true, reason: `Daily P&L ${dailyPnlPct.toFixed(2)}% en zona warning` };
  }
  return { triggered: false };
}

// ─── validateRitual(trade, opts) ───────────────────────────────────────────
// Returns { complete, missing[] }
export function validateRitual(trade, opts = {}) {
  const g = { ...GUARDRAIL_DEFAULTS, ...opts };
  const missing = [];
  const checklist = trade?.checklist || {};
  const checkedCount = Object.values(checklist).filter(Boolean).length;
  if (checkedCount < g.required_checklist_items) {
    missing.push({ field: 'checklist', got: checkedCount, required: g.required_checklist_items });
  }
  if (!trade?.thesis || String(trade.thesis).trim().length < g.min_thesis_chars) {
    missing.push({ field: 'thesis', required_chars: g.min_thesis_chars });
  }
  if (trade?.conviction == null || trade.conviction < g.min_conviction || trade.conviction > g.max_conviction) {
    missing.push({ field: 'conviction', range: [g.min_conviction, g.max_conviction] });
  }
  return { complete: missing.length === 0, missing };
}

// ─── validateOverrideReason(reason, opts) ──────────────────────────────────
export function validateOverrideReason(reason, opts = {}) {
  const g = { ...GUARDRAIL_DEFAULTS, ...opts };
  if (typeof reason !== 'string') return { valid: false, reason: 'reason must be string' };
  const trimmed = reason.trim();
  if (trimmed.length < g.override_min_reason_chars) {
    return { valid: false, reason: `Need ≥${g.override_min_reason_chars} chars (got ${trimmed.length})` };
  }
  return { valid: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function daysUntilStr(dateStr, nowTs) {
  if (!dateStr) return null;
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00Z' : ''));
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - nowTs) / 86400000);
}

// ─── Standard checklist items for UI ──────────────────────────────────────
export const STANDARD_CHECKLIST = [
  { id: 'iv_rank_ok',       label: 'IV rank ≥50 (premium rico)' },
  { id: 'dte_range_ok',     label: 'DTE 25-45 (sweet spot)' },
  { id: 'no_earnings',      label: 'Sin earnings antes del expiry' },
  { id: 'concentration_ok', label: 'Concentración <8% NAV en este underlying' },
  { id: 'brain_score_ok',   label: 'Brain score ≥70 (o ack consciente)' },
  { id: 'mental_state_ok',  label: 'No cansado/enfadado/distracted' },
];

// ─── Standard ritual emotional states ─────────────────────────────────────
export const EMOTIONAL_STATES = [
  'focused',
  'tired',
  'frustrated',
  'excited',
  'fomo',
  'calm',
  'neutral',
];
