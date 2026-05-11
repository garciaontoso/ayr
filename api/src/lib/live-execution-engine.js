// Sprint 11 — Live execution engine (semi-auto, NAS-only).
//
// REALIDAD TÉCNICA:
// El TT bridge en NAS solo expone endpoints READ-ONLY. Para auto-execute
// real money necesitaría extender el bridge con endpoints write (POST orders).
//
// Hasta que añadamos esos endpoints, este sprint implementa "semi-auto":
// 1. Sistema sugiere trade ticket completo (strikes, qty, legs)
// 2. Usuario ejecuta manual en TT app (1 click copy)
// 3. Sistema detecta nueva position automáticamente (delta vs last sync)
// 4. Sistema trackea P&L + sugiere exit
// 5. Telegram alert cuando action recomendada
//
// Pure JS. No DB. No fetch. Compatible Cloudflare Worker.

import * as Risk from "./risk-engine.js";
import * as PortfolioIdeas from "./portfolio-ideas-engine.js";

// ─── Defaults ───────────────────────────────────────────────────────────────
export const LIVE_DEFAULTS = {
  // Safety: durante primer mes solo permitir 1 contrato por trade
  first_month_max_contracts: 1,
  // Después: usar Quarter Kelly normal con cap 5% NAV
  max_concurrent_live_trades: 5,    // primer mes — más conservador que paper (8)
  require_caps_allowed: true,
  require_min_brain_score: 70,
  require_tournament_score: 30,
  require_liquidity_check: true,
  // Confirmación: order ticket válido solo 5 min después de generado
  ticket_validity_minutes: 5,
};

// ─── preTradeChecks(trade, state, config, opts) ────────────────────────────
//
// trade: { strategy_id, symbol, contracts, dte, max_loss_per_contract, ... }
// state: { caps_allowed, n_open_live, n_brain_score, tournament_score, nav,
//          bridge_health, liquidity, recent_loss_streak, ... }
// config: { live_enabled, first_month_until, max_contracts_override }
//
// Returns { allowed, blocked_by[], warnings[] }
export function preTradeChecks(trade, state, config = {}, opts = {}) {
  const t = { ...LIVE_DEFAULTS, ...opts };
  const blocked = [];
  const warnings = [];

  if (!trade || !trade.symbol || !trade.strategy_id) {
    return { allowed: false, blocked_by: ['INVALID_TRADE_TICKET'] };
  }

  // ── 1. Live trading must be enabled in config ──
  if (!config.live_enabled) {
    blocked.push('LIVE_TRADING_DISABLED');
  }

  // ── 2. Caps allowed (Sprint 9 risk caps) ──
  if (t.require_caps_allowed && state.caps_allowed === false) {
    blocked.push('CAPS_BLOCKED');
  }

  // ── 3. Bridge health ──
  if (!state.bridge_health) {
    blocked.push('BRIDGE_OFFLINE');
  }

  // ── 4. Concurrent live trades ──
  if (state.n_open_live >= t.max_concurrent_live_trades) {
    blocked.push(`MAX_CONCURRENT_LIVE_${state.n_open_live}>=${t.max_concurrent_live_trades}`);
  }

  // ── 5. First month limit on contracts ──
  // Sprint 19 audit fix M4: SQLite datetime("YYYY-MM-DD HH:MM:SS") returns Invalid Date.
  // Normalizar a ISO antes de parsear → silently disabling first-month cap was a safety hole.
  const firstMonthDateStr = config.first_month_until ? String(config.first_month_until).replace(' ', 'T') : null;
  const firstMonthDate = firstMonthDateStr ? new Date(firstMonthDateStr) : null;
  const firstMonthActive = firstMonthDate && !isNaN(firstMonthDate.getTime()) && firstMonthDate > new Date();
  const maxContracts = firstMonthActive
    ? t.first_month_max_contracts
    : (config.max_contracts_override || 10);
  if (trade.contracts > maxContracts) {
    blocked.push(`CONTRACTS_${trade.contracts}>MAX_${maxContracts}_${firstMonthActive ? 'first_month' : 'cap'}`);
  }

  // ── 6. Brain score required ──
  if (t.require_min_brain_score && state.n_brain_score != null) {
    if (state.n_brain_score < t.require_min_brain_score) {
      blocked.push(`BRAIN_SCORE_${state.n_brain_score}<${t.require_min_brain_score}`);
    }
  }

  // ── 7. Tournament score (if available) ──
  if (t.require_tournament_score && state.tournament_score != null) {
    if (state.tournament_score < t.require_tournament_score) {
      blocked.push(`TOURNAMENT_SCORE_${state.tournament_score}<${t.require_tournament_score}`);
    }
  }

  // ── 8. Liquidity check ──
  if (t.require_liquidity_check && state.liquidity) {
    const liqResult = Risk.checkLiquidity(state.liquidity);
    if (!liqResult.ok) {
      blocked.push(`LIQUIDITY_FAIL_${liqResult.reasons.join('_')}`);
    }
  }

  // ── 9. Sizing sanity (Quarter Kelly + cap 5% NAV) ──
  if (state.nav && trade.max_loss_per_contract) {
    const capitalAtRisk = trade.contracts * trade.max_loss_per_contract;
    const capitalPct = (capitalAtRisk / state.nav) * 100;
    if (capitalPct > 5) {
      blocked.push(`CAPITAL_${capitalPct.toFixed(1)}%>5%_NAV`);
    } else if (capitalPct > 3) {
      warnings.push(`CAPITAL_${capitalPct.toFixed(1)}%_NAV_aggressive`);
    }
  }

  // ── 10. Recent loss streak ──
  if (state.recent_loss_streak != null && state.recent_loss_streak >= 2) {
    warnings.push(`LOSS_STREAK_${state.recent_loss_streak}_be_cautious`);
  }

  return {
    allowed: blocked.length === 0,
    blocked_by: blocked,
    warnings,
    sizing: state.nav ? {
      capital_at_risk: trade.contracts * (trade.max_loss_per_contract || 0),
      capital_pct_nav: state.nav > 0 ? Math.round((trade.contracts * (trade.max_loss_per_contract || 0)) / state.nav * 1000) / 10 : 0,
    } : null,
    in_first_month: firstMonthActive,
  };
}

// ─── buildTradeTicket(strategy, symbol, brainData, params, opts) ──────────
//
// Builds a complete ticket ready for manual execution in TT app.
// Returns { ticket: { legs[], expected_credit, max_loss, ...}, instructions }
//   or { error, reason } if missing data — Sprint 20: NO IV fallback.
export function buildTradeTicket(strategy, symbol, brainData, params = {}, opts = {}) {
  const t = { ...LIVE_DEFAULTS, ...opts };

  // Sprint 20: fail fast if no real IV (no 0.20 hardcoded fallback)
  const spot = brainData?.spot || params.spot;
  const iv = brainData?.iv_index || brainData?.iv || params.iv;
  const ivSource = brainData?.iv_source || params.iv_source || (iv ? 'caller_unspecified' : null);
  if (!spot) return { error: 'NO_SPOT', reason: 'brainData.spot or params.spot required' };
  if (!iv || iv <= 0) return { error: 'NO_IV', reason: 'real IV required (no 0.20 fallback)', symbol };

  const ticket = {
    generated_at: new Date().toISOString(),
    valid_until: new Date(Date.now() + t.ticket_validity_minutes * 60000).toISOString(),
    strategy_id: strategy.id,
    strategy_label: strategy.name || strategy.label,
    symbol,
    contracts: params.contracts || 1,
    dte: params.dte || strategy.dte || 35,
    iv_used: Math.round(iv * 10000) / 10000,
    iv_source: ivSource,
  };

  // Strike construction by strategy_type (simplified — real version needs chain data)
  const T = ticket.dte / 365;
  const sdMove = spot * iv * Math.sqrt(T);
  const tick = spot > 500 ? 5 : spot > 50 ? 1 : 0.5;
  const round = (x) => Math.round(x / tick) * tick;

  if (strategy.strategy_type === 'BPS' || strategy.strategy_type?.startsWith('bps')) {
    ticket.legs = [
      { type: 'put', action: 'sell', strike: round(spot - sdMove), qty: ticket.contracts },
      { type: 'put', action: 'buy', strike: round(spot - sdMove * 1.5), qty: ticket.contracts },
    ];
    ticket.strategy_display = 'Bull Put Spread';
  } else if (strategy.strategy_type === 'IC') {
    ticket.legs = [
      { type: 'put', action: 'sell', strike: round(spot - sdMove), qty: ticket.contracts },
      { type: 'put', action: 'buy', strike: round(spot - sdMove * 1.5), qty: ticket.contracts },
      { type: 'call', action: 'sell', strike: round(spot + sdMove), qty: ticket.contracts },
      { type: 'call', action: 'buy', strike: round(spot + sdMove * 1.5), qty: ticket.contracts },
    ];
    ticket.strategy_display = 'Iron Condor';
  } else {
    ticket.legs = params.legs || [];
    ticket.strategy_display = strategy.strategy_type || 'Custom';
  }

  // Instructions for manual execution
  ticket.instructions = [
    `1. Abre Tastytrade app o web (https://tastytrade.com)`,
    `2. Selecciona cuenta: ${params.account || '(la que prefieras)'}`,
    `3. Symbol: ${symbol}`,
    `4. Strategy: ${ticket.strategy_display}`,
    `5. Configurar legs:`,
    ...ticket.legs.map(l => `   - ${l.action.toUpperCase()} ${l.qty}x ${l.type.toUpperCase()} @ $${l.strike}`),
    `6. Expiry: ${ticket.dte} DTE (~${addDays(ticket.dte)})`,
    `7. Order type: NET CREDIT (limit order, NO market)`,
    `8. Confirma y submit`,
    `9. Vuelve a A&R → Theta Gang → Live → "Marcar como ejecutado"`,
    `10. El sistema empezará a trackear P&L automáticamente`,
  ];

  return ticket;
}

// ─── detectNewPositions(currentPositions, lastSnapshot) ────────────────────
//
// Compares current TT positions vs last snapshot to detect newly opened ones.
// Used to auto-detect when user manually opened a trade we suggested.
//
// currentPositions: array de {symbol, strike, expiry, opt_type, qty, ...}
// lastSnapshot: same structure (last sync result)
// Returns: { new: [], closed: [], modified: [] }
export function detectNewPositions(currentPositions, lastSnapshot = []) {
  const keyOf = (p) => `${p.symbol || p.underlying}_${p.strike}_${p.opt_type}_${p.expiry}`;
  const lastMap = new Map((lastSnapshot || []).map(p => [keyOf(p), p]));
  const currMap = new Map((currentPositions || []).map(p => [keyOf(p), p]));

  const newP = [];
  const modified = [];
  for (const [key, p] of currMap) {
    if (!lastMap.has(key)) {
      newP.push(p);
    } else {
      const old = lastMap.get(key);
      if ((old.qty || 0) !== (p.qty || 0)) {
        modified.push({ ...p, prev_qty: old.qty });
      }
    }
  }

  const closed = [];
  for (const [key, p] of lastMap) {
    if (!currMap.has(key)) closed.push(p);
  }

  return { new: newP, closed, modified };
}

// ─── trackLivePosition(position, marketData, opts) ─────────────────────────
//
// For each live position, generate suggestion (HOLD / TP / SL / ROLL / CLOSE).
// Reuses portfolio-ideas-engine.analyzeOpenOption logic.
export function trackLivePosition(position, marketData, opts = {}) {
  const spot = marketData?.spot || position.spot || 0;
  return PortfolioIdeas.analyzeOpenOption(position, spot, opts);
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
