// Sprint 18 — Portfolio-aware strategy idea generator.
//
// Por cada position en la cartera del usuario, analiza y propone estrategias
// concretas con strikes, premium estimado, capital y P&L scenarios.
//
// Tipos de propuestas:
// 1. COVERED_CALL: si tiene >=100 sh + en zona neutral-bull → vender call OTM
// 2. CASH_SECURED_PUT: si quiere bajar cost basis + tiene cash → vender put OTM
// 3. BPS_COST_REDUCTION: si está en pérdida moderada + alto IV → BPS bull put
// 4. COLLAR_PROTECTION: si está en gran ganancia → protective collar
// 5. ROLL_LOSING_OPTION: si tiene short option testeada → suggest roll DTE+strike
// 6. WHEEL_INITIATION: stocks dividend que querría poseer → arrancar wheel CSP
//
// Pure functions, no DB, no fetch. Compatible Cloudflare Worker.

import * as BS from "./black-scholes.js";

// ─── Defaults ───────────────────────────────────────────────────────────────
export const IDEAS_DEFAULTS = {
  // Covered Call thresholds
  cc_min_shares: 100,
  cc_target_delta: 0.20,           // ~Δ20 short call (~80% POP)
  cc_target_dte: 35,
  cc_min_pnl_pct: -10,             // No CC si en pérdida >10% (no quieres cap upside)

  // Cash-Secured Put thresholds
  csp_target_delta: 0.30,           // Δ30 short put (more aggressive cost reduction)
  csp_target_dte: 35,
  csp_below_spot_pct: 5,            // strike 5% below spot

  // BPS cost reduction
  bps_min_loss_pct: -5,             // sólo si pérdida -5% a -25%
  bps_max_loss_pct: -25,
  bps_target_delta_short: 0.30,
  bps_target_delta_long: 0.10,

  // Collar protection
  collar_min_gain_pct: 25,          // sólo si ganancia >25%
  collar_put_delta: 0.20,
  collar_call_delta: 0.20,

  // Roll suggestion
  roll_critical_delta: 0.40,        // si short delta >0.40, sugerir roll
  roll_dte_extend: 30,              // extender DTE +30 días

  // Liquidity / quality
  min_underlying_price: 10,         // skip penny stocks
  iv_for_premium_estimate: 0.25,    // 25% if no real IV available
  risk_free_rate: 0.045,
};

// ─── analyzePosition(position, opts) ───────────────────────────────────────
//
// position: { ticker, shares, avg_cost, current_price, market_value,
//             pnl_pct, dividend_yield?, iv_30d?, sector?, ... }
// opts: IDEAS_DEFAULTS overrides
//
// Returns array of ideas: [{ type, ticker, strike, dte, premium_estimate,
//   capital_required, max_profit, max_loss, rationale, confidence_score }]
export function analyzePosition(position, opts = {}) {
  const t = { ...IDEAS_DEFAULTS, ...opts };
  const ideas = [];

  if (!position || !position.ticker) return ideas;
  const ticker = position.ticker;
  const shares = position.shares || 0;
  const avgCost = position.avg_cost || 0;
  const spot = position.current_price || 0;
  const pnlPct = position.pnl_pct || 0;
  const iv = position.iv_30d || t.iv_for_premium_estimate;

  if (spot < t.min_underlying_price) return ideas;
  if (!spot) return ideas;
  // Sprint 18 fix: shares=0 OK (CSP ideas son "no tienes pero podrías comprar a descuento")

  // ── Idea 1: Covered Call ──
  if (shares >= t.cc_min_shares && pnlPct >= t.cc_min_pnl_pct) {
    const dte = t.cc_target_dte;
    const T = dte / 365;
    // Strike at ~delta target (using SD-move proxy)
    const sdMove = spot * iv * Math.sqrt(T);
    const tick = spot > 500 ? 5 : spot > 50 ? 1 : 0.5;
    const callStrike = Math.round((spot + sdMove * 0.85) / tick) * tick;
    const callPrice = BS.bsPrice(spot, callStrike, T, t.risk_free_rate, iv, 'call');
    const contractsAvailable = Math.floor(shares / 100);
    const premiumDollars = callPrice * 100 * contractsAvailable;
    const yieldOnPositionPct = (premiumDollars / (spot * 100 * contractsAvailable)) * 100;
    const annualizedYield = yieldOnPositionPct * (365 / dte);

    ideas.push({
      type: 'COVERED_CALL',
      ticker,
      contracts: contractsAvailable,
      strike: callStrike,
      dte,
      premium_estimate: Math.round(premiumDollars),
      premium_per_share: Math.round(callPrice * 100) / 100,
      yield_pct: Math.round(yieldOnPositionPct * 100) / 100,
      annualized_yield_pct: Math.round(annualizedYield * 100) / 100,
      capital_required: 0,  // ya tienes las shares
      max_profit: Math.round((callStrike - spot + callPrice) * 100 * contractsAvailable),
      max_loss: 'unlimited downside (stock can drop)',  // pero tú ya tienes el stock
      assignment_price: callStrike,
      // Sprint 19 audit fix H4: guard avgCost=0 → Infinity en string
      rationale: `Tienes ${shares} sh @ $${avgCost.toFixed(2)} (P&L ${pnlPct.toFixed(1)}%). Vender ${contractsAvailable} call ${callStrike}C (~Δ${(0.20 * 100).toFixed(0)}, ${dte}d) genera ~$${Math.round(premiumDollars)} (${yieldOnPositionPct.toFixed(2)}% / ${annualizedYield.toFixed(1)}% anualizado). Si asignan, vendes a $${callStrike}${avgCost > 0 ? ` = ${(((callStrike - avgCost) / avgCost) * 100).toFixed(1)}% gain` : ''}.`,
      confidence_score: scoreCcIdea(pnlPct, iv, dte, yieldOnPositionPct),
    });
  }

  // ── Idea 2: Cash-Secured Put (cost reduction / wheel start) ──
  // Solo si NO tiene shares (acquisition entry) o quiere añadir más
  if (shares === 0 || (shares > 0 && pnlPct >= 0)) {
    const dte = t.csp_target_dte;
    const T = dte / 365;
    const tick = spot > 500 ? 5 : spot > 50 ? 1 : 0.5;
    const putStrike = Math.round((spot * (1 - t.csp_below_spot_pct / 100)) / tick) * tick;
    const putPrice = BS.bsPrice(spot, putStrike, T, t.risk_free_rate, iv, 'put');
    const cashRequired = putStrike * 100;
    const yieldOnCashPct = (putPrice * 100 / cashRequired) * 100;
    const annualizedYield = yieldOnCashPct * (365 / dte);
    const effectiveBuyPrice = putStrike - putPrice;

    ideas.push({
      type: 'CASH_SECURED_PUT',
      ticker,
      contracts: 1,
      strike: putStrike,
      dte,
      premium_estimate: Math.round(putPrice * 100),
      premium_per_share: Math.round(putPrice * 100) / 100,
      yield_pct: Math.round(yieldOnCashPct * 100) / 100,
      annualized_yield_pct: Math.round(annualizedYield * 100) / 100,
      capital_required: cashRequired,
      effective_buy_price: Math.round(effectiveBuyPrice * 100) / 100,
      assignment_discount_pct: Math.round(((spot - effectiveBuyPrice) / spot) * 1000) / 10,
      rationale: shares === 0
        ? `${ticker} a $${spot.toFixed(2)}. Vende CSP ${putStrike}P ${dte}d → genera $${Math.round(putPrice * 100)} (${yieldOnCashPct.toFixed(2)}% / ${annualizedYield.toFixed(1)}% anualizado en cash). Si asignan, compras a effective $${effectiveBuyPrice.toFixed(2)} (${(((spot - effectiveBuyPrice) / spot) * 100).toFixed(1)}% descuento vs spot).`
        : `Tienes ${shares} sh @ $${avgCost.toFixed(2)} (gain ${pnlPct.toFixed(1)}%). Añade exposure con CSP ${putStrike}P ${dte}d para acumular más a precio mejor.`,
      confidence_score: scoreCspIdea(spot, putStrike, iv, yieldOnCashPct),
    });
  }

  // ── Idea 3: BPS for cost basis reduction ──
  // Solo si pérdida moderada -5% a -25% AND tiene cash
  if (pnlPct <= t.bps_min_loss_pct && pnlPct >= t.bps_max_loss_pct) {
    const dte = 35;
    const T = dte / 365;
    const tick = spot > 500 ? 5 : spot > 50 ? 1 : 0.5;
    const sdMove = spot * iv * Math.sqrt(T);
    const shortStrike = Math.round((spot - sdMove) / tick) * tick;
    const longStrike = Math.round((spot - sdMove * 1.5) / tick) * tick;
    if (shortStrike > longStrike) {
      const shortPx = BS.bsPrice(spot, shortStrike, T, t.risk_free_rate, iv, 'put');
      const longPx = BS.bsPrice(spot, longStrike, T, t.risk_free_rate, iv, 'put');
      const credit = shortPx - longPx;
      const width = shortStrike - longStrike;
      const maxLoss = (width - credit) * 100;
      const creditDollars = credit * 100;
      ideas.push({
        type: 'BPS_COST_REDUCTION',
        ticker,
        contracts: 1,
        short_strike: shortStrike,
        long_strike: longStrike,
        dte,
        premium_estimate: Math.round(creditDollars),
        capital_required: Math.round(maxLoss),
        max_profit: Math.round(creditDollars),
        max_loss: -Math.round(maxLoss),
        cost_basis_reduction_per_share: shares > 0 ? Math.round((creditDollars / shares) * 100) / 100 : 0,
        rationale: `Estás en pérdida ${pnlPct.toFixed(1)}% en ${ticker} (${shares} sh @ $${avgCost.toFixed(2)}). Vender BPS ${shortStrike}/${longStrike}P 35d genera $${Math.round(creditDollars)} (reduce cost basis ${shares > 0 ? '$' + ((creditDollars / shares).toFixed(2)) + '/sh' : 'income'}).`,
        confidence_score: scoreBpsIdea(pnlPct, iv, credit, width),
      });
    }
  }

  // ── Idea 4: Collar protection (gran ganancia) ──
  if (shares >= 100 && pnlPct >= t.collar_min_gain_pct) {
    const dte = 60;
    const T = dte / 365;
    const tick = spot > 500 ? 5 : spot > 50 ? 1 : 0.5;
    const sdMove = spot * iv * Math.sqrt(T);
    const putStrike = Math.round((spot - sdMove * 0.7) / tick) * tick;
    const callStrike = Math.round((spot + sdMove * 1.0) / tick) * tick;
    const putPx = BS.bsPrice(spot, putStrike, T, t.risk_free_rate, iv, 'put');
    const callPx = BS.bsPrice(spot, callStrike, T, t.risk_free_rate, iv, 'call');
    const netCost = putPx - callPx;  // positive = paid, negative = credit
    const contractsAvailable = Math.floor(shares / 100);
    const downsideLimit = (putStrike - spot) * contractsAvailable * 100;
    const upsideLimit = (callStrike - spot) * contractsAvailable * 100;

    ideas.push({
      type: 'COLLAR_PROTECTION',
      ticker,
      contracts: contractsAvailable,
      put_strike: putStrike,
      call_strike: callStrike,
      dte,
      premium_estimate: -Math.round(netCost * 100 * contractsAvailable),
      capital_required: Math.max(0, Math.round(netCost * 100 * contractsAvailable)),
      downside_protection: Math.round(downsideLimit),
      upside_cap: Math.round(upsideLimit),
      rationale: `Estás +${pnlPct.toFixed(1)}% en ${ticker} (${shares} sh). Collar ${putStrike}P/${callStrike}C 60d ${netCost > 0 ? `cuesta $${Math.round(netCost * 100 * contractsAvailable)}` : `genera $${-Math.round(netCost * 100 * contractsAvailable)} crédito`}. Protege downside hasta $${putStrike} (caps loss en $${Math.round(Math.abs(downsideLimit))}), pero capa upside en $${callStrike}.`,
      confidence_score: scoreCollarIdea(pnlPct, iv, netCost),
    });
  }

  return ideas;
}

// ─── analyzeOpenOption(opt, spotPrice, daysHeld) ───────────────────────────
// For OPEN options: detect rolling opportunities, defensive actions, take profit signals
//
// opt: { ticker, opt_type, strike, expiry, qty, avg_cost (entry premium), ...}
// spotPrice: current underlying
// Returns: { action, urgency, rationale, suggested_strike?, suggested_dte? }
export function analyzeOpenOption(opt, spotPrice, opts = {}) {
  const t = { ...IDEAS_DEFAULTS, ...opts };
  if (!opt || !spotPrice) return null;

  const dte = opt.dte != null ? opt.dte : daysUntil(opt.expiry);
  const isShort = opt.qty < 0 || opt.action === 'sell';
  const optType = (opt.opt_type === 'P' || opt.opt_type === 'put') ? 'put' : 'call';

  // Distance from strike (% OTM/ITM)
  const distPct = optType === 'put'
    ? ((spotPrice - opt.strike) / opt.strike) * 100  // positive = OTM (good for short put)
    : ((opt.strike - spotPrice) / opt.strike) * 100;  // positive = OTM (good for short call)

  // Live P&L estimate (simplified — would need real BS pricing for exact)
  const T = Math.max(0.001, dte / 365);
  const iv = t.iv_for_premium_estimate;
  const livePx = BS.bsPrice(spotPrice, opt.strike, T, t.risk_free_rate, iv, optType);
  const entryPremium = Math.abs(opt.avg_cost || opt.entry_premium || 0);
  const pnlPct = entryPremium > 0
    ? (isShort ? (entryPremium - livePx) / entryPremium * 100 : (livePx - entryPremium) / entryPremium * 100)
    : 0;

  // Decision tree
  if (isShort && distPct < 2 && distPct > -2) {
    // Strike being tested
    const newStrike = optType === 'put'
      ? Math.round((opt.strike * 0.95) / 5) * 5
      : Math.round((opt.strike * 1.05) / 5) * 5;
    return {
      action: 'CONSIDER_ROLL_DEFENSIVE',
      urgency: 'HIGH',
      live_pnl_pct: Math.round(pnlPct),
      live_premium: Math.round(livePx * 100) / 100,
      rationale: `${opt.ticker} ${opt.strike}${opt.opt_type} testeado (spot $${spotPrice.toFixed(2)}, ${distPct.toFixed(1)}% del strike). Considera rolar a strike ${newStrike} con DTE +${t.roll_dte_extend}d.`,
      suggested_strike: newStrike,
      suggested_dte: dte + t.roll_dte_extend,
    };
  }

  if (isShort && pnlPct >= 50) {
    return {
      action: 'TAKE_PROFIT',
      urgency: 'MEDIUM',
      live_pnl_pct: Math.round(pnlPct),
      live_premium: Math.round(livePx * 100) / 100,
      rationale: `${opt.ticker} ${opt.strike}${opt.opt_type} ya capturó ${pnlPct.toFixed(0)}% del credit. Cerrar libera capital + reduce gamma risk final-DTE.`,
    };
  }

  if (isShort && dte <= 7 && Math.abs(pnlPct) < 25) {
    return {
      action: 'CLOSE_GAMMA_EXIT',
      urgency: 'MEDIUM',
      live_pnl_pct: Math.round(pnlPct),
      rationale: `${opt.ticker} DTE ${dte}d con pnl ${pnlPct.toFixed(0)}%. Gamma risk crece exponencial — mejor cerrar.`,
    };
  }

  if (!isShort && pnlPct >= 100) {
    return {
      action: 'TAKE_PROFIT_LONG',
      urgency: 'MEDIUM',
      live_pnl_pct: Math.round(pnlPct),
      rationale: `Long ${opt.ticker} ${opt.strike}${opt.opt_type} +${pnlPct.toFixed(0)}%. Considera cerrar para realizar gain (long opt theta decay continuará).`,
    };
  }

  return {
    action: 'HOLD',
    urgency: 'LOW',
    live_pnl_pct: Math.round(pnlPct),
    live_premium: Math.round(livePx * 100) / 100,
    dte,
    dist_pct: Math.round(distPct * 10) / 10,
    rationale: `${opt.ticker} ${opt.strike}${opt.opt_type} dentro de zona normal. PnL ${pnlPct.toFixed(0)}%, ${distPct.toFixed(1)}% OTM, DTE ${dte}.`,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return 35;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 35;
  return Math.max(0, Math.floor((d.getTime() - Date.now()) / 86400000));
}

function scoreCcIdea(pnlPct, iv, dte, yieldPct) {
  // Higher score = better idea
  let s = 50;
  if (pnlPct > 0) s += 10;       // positions in profit are safer for CC
  if (iv > 0.30) s += 20;         // high IV = better premium
  if (yieldPct > 1.5) s += 20;
  if (dte >= 30 && dte <= 45) s += 5;
  return Math.max(0, Math.min(100, s));
}

function scoreCspIdea(spot, strike, iv, yieldPct) {
  let s = 50;
  if (yieldPct > 1.0) s += 20;
  if (iv > 0.25) s += 15;
  const distPct = ((spot - strike) / spot) * 100;
  if (distPct > 5 && distPct < 10) s += 15;  // sweet spot OTM
  return Math.max(0, Math.min(100, s));
}

function scoreBpsIdea(pnlPct, iv, credit, width) {
  let s = 60;  // BPS for cost reduction is generally good
  if (iv > 0.30) s += 20;
  if (credit / width > 0.20) s += 10;  // good credit/width ratio
  if (pnlPct > -15) s += 10;
  return Math.max(0, Math.min(100, s));
}

function scoreCollarIdea(pnlPct, iv, netCost) {
  let s = 50;
  if (pnlPct > 50) s += 20;       // bigger gains = more to protect
  if (netCost <= 0) s += 20;       // costless or credit = great
  if (iv > 0.25) s += 10;
  return Math.max(0, Math.min(100, s));
}

// ─── scanPortfolio(positions, opts) ───────────────────────────────────────
//
// Analyzes ALL positions, returns sorted by confidence_score desc.
export function scanPortfolio(positions, opts = {}) {
  if (!Array.isArray(positions)) return [];
  const allIdeas = [];
  for (const p of positions) {
    const ideas = analyzePosition(p, opts);
    for (const idea of ideas) allIdeas.push(idea);
  }
  allIdeas.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
  return allIdeas;
}
