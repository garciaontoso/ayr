// Sprint 9 — Risk engine: Kelly sizing + correlation matrix + position sizer + risk caps.
//
// Why this matters: una strategy con +EV puede destruir capital si se sobre-sizes
// (variance drag), y se queda irrelevante si under-sizes. Kelly calcula el tamaño
// óptimo, half/quarter Kelly añaden margen de seguridad estándar professional.
//
// Risk caps son guard rails NO negociables antes de Sprint 11 (auto-execution):
//   - VIX kill: >30 detiene nuevas entradas
//   - Concurrent: >8 posiciones simultáneas detiene
//   - Drawdown kill: >10% del capital inicial detiene 30 días
//   - Correlation cap: 2 strategies con corr >0.7 cuentan como 1
//
// Pure JS. Sin side effects. No DB. No fetch. Compatible con Cloudflare Worker.

// ─── Kelly criterion ────────────────────────────────────────────────────────
//
// Full Kelly: f* = (bp - q) / b
//   donde b = win/loss ratio, p = prob win, q = 1-p
//
// El problema: Full Kelly asume retornos conocidos exactos → en práctica produce
// drawdowns brutales si las estimaciones son optimistas. Half/quarter Kelly
// reduce variance al precio de retorno menor pero más estable.
//
// Heurística profesional: usar Quarter Kelly (k/4) por defecto.
//
// stats: { win_rate (0-100 pct), avg_win, avg_loss }
// Returns: { full_kelly, half_kelly, quarter_kelly, edge_pct, kelly_warning?, kelly_cap_pct }
export function kellyCriterion(stats, opts = {}) {
  const winRate = (stats.win_rate || 0) / 100;
  const avgWin = Math.abs(stats.avg_win || 0);
  const avgLoss = Math.abs(stats.avg_loss || 0);
  const cap = opts.cap_pct ?? 0.20;  // never bet >20% of capital regardless of Kelly

  if (avgLoss === 0 || avgWin === 0 || winRate === 0) {
    return {
      full_kelly: 0,
      half_kelly: 0,
      quarter_kelly: 0,
      edge_pct: 0,
      kelly_warning: 'INSUFFICIENT_DATA: avg_win, avg_loss, or win_rate is zero',
      kelly_cap_pct: cap * 100,
    };
  }

  const b = avgWin / avgLoss;       // win/loss ratio
  const p = winRate;
  const q = 1 - p;
  const fullKelly = (b * p - q) / b;
  const edge = b * p - q;            // positive = +EV

  // Cap negative Kelly to 0 (don't take negative-EV trades)
  const fullKellyCapped = Math.max(0, Math.min(fullKelly, cap));
  const halfKelly = fullKellyCapped / 2;
  const quarterKelly = fullKellyCapped / 4;

  let warning = null;
  if (fullKelly < 0) warning = 'NEGATIVE_EDGE: strategy has negative expected value, do NOT trade';
  else if (fullKelly > cap) warning = `KELLY_CAPPED_AT_${cap * 100}%: full Kelly recommends ${(fullKelly * 100).toFixed(1)}% but capped`;
  else if (fullKelly > 0.10) warning = 'HIGH_KELLY: full Kelly >10% suggests overfit or thin sample';

  return {
    full_kelly: Math.round(fullKellyCapped * 10000) / 10000,
    half_kelly: Math.round(halfKelly * 10000) / 10000,
    quarter_kelly: Math.round(quarterKelly * 10000) / 10000,
    edge_pct: Math.round(edge * 10000) / 100,
    win_loss_ratio: Math.round(b * 100) / 100,
    win_rate_used: Math.round(p * 1000) / 10,
    kelly_warning: warning,
    kelly_cap_pct: cap * 100,
  };
}

// ─── Position sizer (Kelly + risk-adjusted) ──────────────────────────────────
//
// Recommends N contracts to trade given:
//   - Strategy stats (Kelly recommendation)
//   - Account NAV
//   - Strategy max loss per contract (defines risk per contract)
//   - Risk fraction (default Quarter Kelly)
//   - Concurrent positions cap
//
// Returns { recommended_contracts, capital_at_risk, capital_pct, sizing_notes[] }
export function recommendSize(stats, nav, maxLossPerContract, opts = {}) {
  const k = kellyCriterion(stats, opts);
  const fraction = opts.fraction || k.quarter_kelly;
  const cap = opts.cap_pct ?? 0.05;  // default max 5% NAV per single trade
  const minContracts = opts.min_contracts ?? 1;

  if (maxLossPerContract <= 0 || nav <= 0) {
    return {
      recommended_contracts: 0,
      capital_at_risk: 0,
      capital_pct: 0,
      sizing_notes: ['INVALID_INPUTS: nav or max_loss_per_contract <= 0'],
    };
  }

  const cappedFraction = Math.min(fraction, cap);
  const dollarRisk = nav * cappedFraction;
  const rawContracts = dollarRisk / maxLossPerContract;
  let contracts = Math.floor(rawContracts);

  const notes = [];
  if (k.kelly_warning) notes.push(k.kelly_warning);
  if (fraction > cap) notes.push(`SIZING_CAPPED_AT_${(cap * 100).toFixed(0)}%_NAV`);
  if (contracts < minContracts) {
    contracts = minContracts;
    notes.push(`MIN_CONTRACTS_FLOOR: raw recommendation was ${rawContracts.toFixed(2)}, raised to ${minContracts}`);
  }
  if (rawContracts < 0.5) notes.push('TOO_SMALL: edge does not justify 1 contract at this NAV');

  return {
    recommended_contracts: contracts,
    capital_at_risk: Math.round(contracts * maxLossPerContract * 100) / 100,
    capital_pct: Math.round(contracts * maxLossPerContract / nav * 10000) / 100,
    fraction_used: Math.round(cappedFraction * 10000) / 100,
    full_kelly_pct: Math.round(k.full_kelly * 10000) / 100,
    quarter_kelly_pct: Math.round(k.quarter_kelly * 10000) / 100,
    raw_contracts: Math.round(rawContracts * 100) / 100,
    sizing_notes: notes,
  };
}

// ─── Correlation matrix between strategies ──────────────────────────────────
//
// Pearson correlation of trade-level returns between strategies.
// Sliding pair-wise: para cada par (A, B) toma la intersección temporal.
//
// strategiesData: { strat_id: [{date, pnl}, ...], ... }
// Returns: { matrix: { [a]: { [b]: corr } }, high_correlation_pairs: [{ a, b, corr }] }
export function correlationMatrix(strategiesData, threshold = 0.7) {
  const ids = Object.keys(strategiesData);
  const matrix = {};
  const pairs = [];

  for (const a of ids) {
    matrix[a] = {};
    for (const b of ids) {
      if (a === b) { matrix[a][b] = 1.0; continue; }
      // Build date->pnl maps then intersect
      const mapA = new Map(strategiesData[a].map(t => [t.date, t.pnl]));
      const mapB = new Map(strategiesData[b].map(t => [t.date, t.pnl]));
      const commonDates = [...mapA.keys()].filter(d => mapB.has(d));
      if (commonDates.length < 5) { matrix[a][b] = null; continue; }
      const xs = commonDates.map(d => mapA.get(d));
      const ys = commonDates.map(d => mapB.get(d));
      const corr = pearson(xs, ys);
      matrix[a][b] = Math.round(corr * 1000) / 1000;
      if (a < b && Math.abs(corr) >= threshold) {
        pairs.push({ a, b, corr: matrix[a][b], n_samples: commonDates.length });
      }
    }
  }

  return { matrix, high_correlation_pairs: pairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr)) };
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX, dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  return denom === 0 ? 0 : num / denom;
}

// ─── Risk caps state machine ─────────────────────────────────────────────────
//
// Decides if a new trade is ALLOWED given current portfolio + market state.
//
// state: { vix, nav, initial_capital, drawdown_pct,
//          n_concurrent_positions, recent_loss_streak,
//          correlated_active_strategies (count) }
// caps:  { vix_max, max_concurrent, drawdown_kill_pct, max_loss_streak,
//          max_correlated_strategies, max_capital_per_trade_pct }
// returns { allowed: bool, blocked_by: string[], warnings: string[] }
export const DEFAULT_RISK_CAPS = {
  vix_max: 30,
  max_concurrent: 8,
  drawdown_kill_pct: 10,         // % of initial_capital
  drawdown_kill_recovery_days: 30,
  max_loss_streak: 3,
  max_correlated_strategies: 2,
  max_capital_per_trade_pct: 5,
  cooldown_after_kill_days: 30,
};

export function evaluateRiskCaps(state, caps = DEFAULT_RISK_CAPS) {
  const blockedBy = [];
  const warnings = [];

  if (state.vix != null && state.vix > caps.vix_max) {
    blockedBy.push(`VIX_KILL: VIX ${state.vix.toFixed(1)} > ${caps.vix_max}`);
  } else if (state.vix != null && state.vix > caps.vix_max - 5) {
    warnings.push(`VIX_WARN: VIX ${state.vix.toFixed(1)} approaching kill threshold`);
  }

  if (state.n_concurrent_positions != null && state.n_concurrent_positions >= caps.max_concurrent) {
    blockedBy.push(`MAX_CONCURRENT: ${state.n_concurrent_positions} ≥ ${caps.max_concurrent}`);
  }

  if (state.drawdown_pct != null && state.drawdown_pct >= caps.drawdown_kill_pct) {
    blockedBy.push(`DRAWDOWN_KILL: drawdown ${state.drawdown_pct.toFixed(1)}% ≥ ${caps.drawdown_kill_pct}%`);
  } else if (state.drawdown_pct != null && state.drawdown_pct >= caps.drawdown_kill_pct * 0.7) {
    warnings.push(`DRAWDOWN_WARN: drawdown ${state.drawdown_pct.toFixed(1)}% approaching kill`);
  }

  if (state.recent_loss_streak != null && state.recent_loss_streak >= caps.max_loss_streak) {
    blockedBy.push(`LOSS_STREAK: ${state.recent_loss_streak} consecutive losses ≥ ${caps.max_loss_streak}`);
  }

  if (state.correlated_active_strategies != null && state.correlated_active_strategies >= caps.max_correlated_strategies) {
    blockedBy.push(`CORRELATION_CAP: ${state.correlated_active_strategies} correlated strategies open`);
  }

  return {
    allowed: blockedBy.length === 0,
    blocked_by: blockedBy,
    warnings,
    caps_used: caps,
    state_snapshot: state,
  };
}

// ─── Portfolio heat by underlying ───────────────────────────────────────────
//
// Aggregates options positions by underlying → gives delta exposure ($) per
// underlying so user can see concentration (single-name risk).
//
// positions: [{ underlying, delta, qty, multiplier?, mark_price?, ... }]
// returns: [{ underlying, net_delta_contracts, delta_dollars, n_positions, weight_pct }]
export function portfolioHeatByUnderlying(positions, opts = {}) {
  const totals = {};
  for (const p of positions) {
    const ul = p.underlying || p.symbol || 'UNKNOWN';
    const dirMult = (p.quantity_direction || 'Long') === 'Long' ? 1 : -1;
    const qty = Math.abs(p.quantity || 0) * dirMult;
    const multiplier = p.multiplier || 100;
    const delta = p.delta || 0;
    const ulPx = p.underlying_price || p.mark_price || 0;
    const deltaContrib = delta * qty * multiplier;       // share-equivalent
    const deltaDollars = deltaContrib * ulPx;

    if (!totals[ul]) totals[ul] = { underlying: ul, net_delta_contracts: 0, delta_dollars: 0, n_positions: 0 };
    totals[ul].net_delta_contracts += deltaContrib;
    totals[ul].delta_dollars += deltaDollars;
    totals[ul].n_positions += 1;
  }

  const rows = Object.values(totals);
  const totalAbsDelta = rows.reduce((a, r) => a + Math.abs(r.delta_dollars), 0);
  for (const r of rows) {
    r.weight_pct = totalAbsDelta > 0
      ? Math.round(Math.abs(r.delta_dollars) / totalAbsDelta * 1000) / 10
      : 0;
    r.net_delta_contracts = Math.round(r.net_delta_contracts);
    r.delta_dollars = Math.round(r.delta_dollars);
  }
  rows.sort((a, b) => Math.abs(b.delta_dollars) - Math.abs(a.delta_dollars));
  return rows;
}

// ─── Portfolio risk score (0-100, higher = more risk) ───────────────────────
//
// Composite: VIX (0-30 pts) + concurrent fraction (0-25 pts) + drawdown (0-25 pts) + concentration (0-20 pts)
export function portfolioRiskScore(state, heat = []) {
  const vix = state.vix || 15;
  const concurrent = state.n_concurrent_positions || 0;
  const dd = state.drawdown_pct || 0;
  const maxConcentration = heat.length ? Math.max(...heat.map(h => h.weight_pct || 0)) : 0;

  const vixScore = Math.min(30, (vix / 30) * 30);
  const concScore = Math.min(25, (concurrent / 8) * 25);
  const ddScore = Math.min(25, (dd / 10) * 25);
  const concentrationScore = Math.min(20, (maxConcentration / 50) * 20);

  const total = Math.round(vixScore + concScore + ddScore + concentrationScore);
  return {
    total,
    breakdown: {
      vix: Math.round(vixScore),
      concurrent: Math.round(concScore),
      drawdown: Math.round(ddScore),
      concentration: Math.round(concentrationScore),
    },
    interpretation: total < 30 ? 'LOW' : total < 60 ? 'MODERATE' : total < 80 ? 'HIGH' : 'CRITICAL',
  };
}
