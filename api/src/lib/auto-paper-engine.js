// Sprint 14 — Auto Paper Trading decision engine.
//
// Pure functions, no DB, no fetch. Used by /api/thetagang/auto-paper/run
// (which orchestrates the I/O calls and applies these decisions).
//
// Philosophy: paper trading should be FULLY autonomous to generate enough
// historical data to validate the 5 promotion gates before Sprint 11 (real money).
// Decisions here are CONSERVATIVE by default — easier to relax later than to
// recover from blowing up your paper account.

import * as Risk from "./risk-engine.js";

// ─── Constants (entry/exit thresholds) ──────────────────────────────────────
export const AUTO_PAPER_DEFAULTS = {
  min_brain_score: 70,             // minimum Brain scan score to open
  take_profit_pct: 50,             // close at +50% of credit received
  stop_loss_x: 2.0,                // close at -200% of credit (2x credit lost)
  gamma_exit_dte: 7,               // close if DTE ≤ 7 AND pnl < 25% TP
  gamma_exit_min_pct: 25,          // threshold for gamma_exit
  max_concurrent_per_symbol: 2,    // never more than 2 paper positions per symbol
  default_paper_nav: 100000,       // assumed NAV for sizing (paper, separate from real NAV)
  default_max_loss_per_contract: 1000,  // for typical BPS-SPY 5-wide
  kelly_fraction: 'quarter',       // quarter | half | full
  // Sprint 15 — dynamic exit additions
  delta_breach_threshold: 0.30,    // close if short delta moves to >0.30 (originally ~0.16)
  iv_crush_threshold_pct: 30,      // close if IV bajó >30% desde entry AND pnl ≥25%
  time_based_elapsed_frac: 0.60,   // close if 60%+ time elapsed AND pnl < 25%
  // Sprint 15 — tournament-aware sizing
  min_tournament_score: 30,        // require strategy_id appears in top-N rankings AND score >= 30
  tournament_required: false,      // if true, ONLY trade strategies present in last tournament leaderboard
};

// ─── shouldOpen(candidate, state, opts) ─────────────────────────────────────
//
// Decides whether to open a new paper position given:
//   candidate: { symbol, strategy, score, dte, delta_short, action, ... } from brain/scan
//   state: { caps_allowed (bool), open_positions (array), strategies (catalog) }
//   opts: AUTO_PAPER_DEFAULTS overrides
//
// Returns { action: 'open'|'skip', reason, params? }
//   params (when open): { strategy_id, symbol, contracts, dte }
export function shouldOpen(candidate, state, opts = {}) {
  const t = { ...AUTO_PAPER_DEFAULTS, ...opts };

  if (!candidate || !candidate.symbol || !candidate.strategy) {
    return { action: 'skip', reason: 'INVALID_CANDIDATE' };
  }
  if (candidate.action !== 'ENTRY_CANDIDATE' && candidate.action !== 'ENTRY_MAYBE') {
    return { action: 'skip', reason: `BRAIN_ACTION=${candidate.action}` };
  }
  if ((candidate.score || 0) < t.min_brain_score) {
    return { action: 'skip', reason: `LOW_SCORE_${candidate.score}<${t.min_brain_score}` };
  }
  if (state.caps_allowed === false) {
    return { action: 'skip', reason: 'RISK_CAPS_BLOCKED' };
  }

  // Anti-duplicate: do we already have an open position for this symbol+strategy_id?
  const stratId = mapBrainStrategyToCatalog(candidate.strategy, candidate.symbol);
  if (!stratId) {
    return { action: 'skip', reason: `NO_CATALOG_MATCH_FOR_${candidate.strategy}` };
  }
  const dups = (state.open_positions || []).filter(p =>
    p.symbol === candidate.symbol && p.strategy_id === stratId && p.status === 'open'
  );
  if (dups.length >= t.max_concurrent_per_symbol) {
    return { action: 'skip', reason: `MAX_CONCURRENT_PER_SYMBOL_${dups.length}>=${t.max_concurrent_per_symbol}` };
  }

  // Sprint 15 — tournament-aware filter (opt-in via opts.tournament_required)
  // Si el flag está ON, requiere que el strategy_id aparezca en últimas rankings.
  // Si OFF (default), solo skip cuando hay leaderboard Y el score es bajo.
  if (state.tournament_leaderboard && state.tournament_leaderboard.length > 0) {
    const ranking = state.tournament_leaderboard.find(r => r.strategy_id === stratId || r.strategy_id?.startsWith(stratId.slice(0, -3)));
    if (t.tournament_required && !ranking) {
      return { action: 'skip', reason: `NOT_IN_TOURNAMENT_LEADERBOARD` };
    }
    if (ranking && (ranking.score || 0) < t.min_tournament_score) {
      return { action: 'skip', reason: `TOURNAMENT_SCORE_${ranking.score}<${t.min_tournament_score}` };
    }
  }

  // Sizing — Quarter Kelly default; if no historical stats use minimum 1 contract
  const stats = lookupStrategyStats(state.strategies, stratId);
  let contracts = 1;
  if (stats && stats.win_rate > 0 && stats.avg_win > 0 && stats.avg_loss > 0) {
    const sz = Risk.recommendSize(stats, t.default_paper_nav, t.default_max_loss_per_contract, {
      fraction: undefined,  // recommendSize will use quarter Kelly by default
      cap_pct: 0.05,
      min_contracts: 1,
    });
    contracts = sz.recommended_contracts || 1;
  }
  // Sprint 17 — Tournament-based size modifier:
  // Si tournament leaderboard tiene esta strategy con score alto, escalar +50%.
  // Si score bajo (< 50), reducir tamaño 50%. Esto premia evidencia real.
  if (state.tournament_leaderboard && state.tournament_leaderboard.length > 0) {
    const ranking = state.tournament_leaderboard.find(r => r.strategy_id === stratId || r.strategy_id?.startsWith(stratId.slice(0, -3)));
    if (ranking?.score >= 50) {
      contracts = Math.min(contracts * 2, 10);  // double pero cap a 10
    } else if (ranking?.score && ranking.score < 30) {
      contracts = Math.max(1, Math.floor(contracts / 2));
    }
  }

  return {
    action: 'open',
    reason: `SCORE_${candidate.score}_OK_CAPS_OK`,
    params: {
      strategy_id: stratId,
      symbol: candidate.symbol,
      contracts,
      dte: candidate.dte || 35,
    },
  };
}

// ─── shouldClose(position, opts) ────────────────────────────────────────────
//
// Sprint 15 enhanced: 5 exit rules en orden de prioridad.
//
// position: { strategy_id, symbol, credit_received, dte_open, opened_at,
//             live_pnl, live_pnl_pct, current_dte,
//             current_short_delta?, iv_at_entry?, iv_now? ... }
// Returns { action: 'close'|'hold', reason }
export function shouldClose(position, opts = {}) {
  const t = { ...AUTO_PAPER_DEFAULTS, ...opts };
  if (!position) return { action: 'hold', reason: 'NULL_POSITION' };

  const pnlPct = position.live_pnl_pct;
  const currentDte = position.current_dte;
  const dteOpen = position.dte_open || currentDte || 35;
  const shortDelta = position.current_short_delta;
  const ivEntry = position.iv_at_entry;
  const ivNow = position.iv_now;

  // ── 1. Take profit (priority 1: lock gains) ──
  if (pnlPct != null && pnlPct >= t.take_profit_pct) {
    return { action: 'close', reason: `TAKE_PROFIT_${pnlPct.toFixed(0)}%>=${t.take_profit_pct}%` };
  }

  // ── 2. Stop loss (priority 2: cut losses) ──
  if (pnlPct != null && pnlPct <= -100 * t.stop_loss_x) {
    return { action: 'close', reason: `STOP_LOSS_${pnlPct.toFixed(0)}%<=${-100 * t.stop_loss_x}%` };
  }

  // ── 3. Delta breach (priority 3: defensive — short strike got tested) ──
  // Sprint 15: si el short delta original era ~0.16 y ahora >0.30, el strike está
  // siendo testeado → cerrar antes de que assignment risk crezca exponencialmente
  if (shortDelta != null && Math.abs(shortDelta) >= (t.delta_breach_threshold || 0.30)) {
    return { action: 'close', reason: `DELTA_BREACH_short_delta=${shortDelta.toFixed(2)}>=${t.delta_breach_threshold || 0.30}` };
  }

  // ── 4. IV crush exit (priority 4: tomar ganancia premature si vol colapsó) ──
  // Sprint 15: si IV bajó >30% desde entry, gran parte del decay ya ocurrió → take what we have
  if (ivEntry != null && ivNow != null && ivEntry > 0) {
    const ivCrushPct = ((ivEntry - ivNow) / ivEntry) * 100;
    if (ivCrushPct >= (t.iv_crush_threshold_pct || 30) && pnlPct != null && pnlPct >= 25) {
      return { action: 'close', reason: `IV_CRUSH_${ivCrushPct.toFixed(0)}%_AND_PNL_${pnlPct.toFixed(0)}%>=25%` };
    }
  }

  // ── 5. Time-based exit (priority 5: 60% time elapsed + < 25% pnl = stale trade) ──
  // Sprint 15: si pasaron >60% de los DTEs y todavía no llegó a 25% pnl, theta decay
  // ya hizo lo suyo y el riesgo gamma sube. Mejor liberar capital.
  if (currentDte != null && dteOpen > 0) {
    const timeElapsedFrac = (dteOpen - currentDte) / dteOpen;
    if (timeElapsedFrac >= 0.60 && pnlPct != null && pnlPct < 25) {
      return { action: 'close', reason: `TIME_BASED_elapsed=${(timeElapsedFrac * 100).toFixed(0)}%_pnl=${pnlPct.toFixed(0)}%<25%` };
    }
  }

  // ── 6. Gamma exit (priority 6: DTE close + insufficient profit) ──
  if (currentDte != null && currentDte <= t.gamma_exit_dte) {
    if (pnlPct == null || pnlPct < t.gamma_exit_min_pct) {
      return { action: 'close', reason: `GAMMA_EXIT_DTE${currentDte}<=${t.gamma_exit_dte}_AND_PNL_${pnlPct?.toFixed(0)}%<${t.gamma_exit_min_pct}%` };
    }
  }

  return { action: 'hold', reason: `PNL_${pnlPct?.toFixed(0)}%_DTE_${currentDte}_DELTA_${shortDelta?.toFixed(2) || 'n/a'}` };
}

// ─── mapBrainStrategyToCatalog(brainStrategy, symbol) ──────────────────────
//
// Brain scan returns 'IC short' / 'BPS only' / 'WAIT' / 'NO ENTRY'.
// Map to a catalog strategy_id from thetagang_strategies seed.
export function mapBrainStrategyToCatalog(brainStrategy, symbol) {
  const sym = (symbol || '').toLowerCase();
  if (brainStrategy === 'IC short') {
    return `ic-${sym}-35`;       // ic-spy-35 / ic-qqq-35 / ic-iwm-35
  }
  if (brainStrategy === 'BPS only') {
    return `bps-${sym}-35`;      // bps-spy-35 (only seeded one; QQQ/IWM fallback)
  }
  return null;
}

function lookupStrategyStats(catalog, strategy_id) {
  if (!catalog || !Array.isArray(catalog)) return null;
  const s = catalog.find(x => x.id === strategy_id);
  if (!s || !s.win_rate || !s.avg_win || !s.avg_loss) return null;
  return { win_rate: s.win_rate, avg_win: s.avg_win, avg_loss: s.avg_loss };
}

// ─── runAutoPaperCycle(brainScan, capsStatus, openPositions, strategies, opts) ─
//
// High-level orchestrator (still pure — caller does the I/O).
// Returns { open_decisions: [], close_decisions: [], summary }
//   where each decision has: action, reason, params (open) / position (close)
export function planAutoPaperCycle(brainScan, capsStatus, openPositions, strategies, opts = {}, tournamentLeaderboard = []) {
  const openDecisions = [];
  const closeDecisions = [];

  const state = {
    caps_allowed: capsStatus?.allowed === true,
    open_positions: openPositions || [],
    strategies: strategies || [],
    tournament_leaderboard: tournamentLeaderboard || [],
  };

  // Open decisions from brain candidates
  for (const c of (brainScan?.candidates || [])) {
    const d = shouldOpen(c, state, opts);
    openDecisions.push({ candidate: c, ...d });
    // After deciding 'open', simulate it as part of state so next iteration anti-dupes correctly
    if (d.action === 'open') {
      state.open_positions = [...state.open_positions, {
        symbol: c.symbol, strategy_id: d.params.strategy_id, status: 'open',
      }];
    }
  }

  // Close decisions for currently open positions
  for (const p of (openPositions || [])) {
    const d = shouldClose(p, opts);
    closeDecisions.push({ position: p, ...d });
  }

  const opensPlanned = openDecisions.filter(d => d.action === 'open').length;
  const closesPlanned = closeDecisions.filter(d => d.action === 'close').length;
  const skips = openDecisions.filter(d => d.action === 'skip').length;
  const holds = closeDecisions.filter(d => d.action === 'hold').length;

  return {
    open_decisions: openDecisions,
    close_decisions: closeDecisions,
    summary: {
      opens_planned: opensPlanned,
      closes_planned: closesPlanned,
      skips,
      holds,
      caps_allowed: state.caps_allowed,
      n_brain_candidates: brainScan?.candidates?.length || 0,
      n_open_positions: openPositions?.length || 0,
    },
  };
}
