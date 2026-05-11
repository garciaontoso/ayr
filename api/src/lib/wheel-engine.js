// The Wheel — premium-selling cycle engine.
// Pure JS, runs in Cloudflare Worker. No Node-specific APIs, no external deps.
//
// State machine (per symbol, per cycle):
//
//   awaiting_csp ──open_csp──► csp_open ──assign──► assigned_long_stock ──sell_cc──► cc_open
//        ▲                       │                          ▲                            │
//        │                  expire_otm                  expire_otm                    assign
//        └───────────────────────┘                          └────────────────────────────┤
//                                                                                        │
//                                                                          cc_assigned_back_to_cash
//                                                                                        │
//                                                                                        ▼
//                                                                                awaiting_csp (cycle++)
//
// Why a state machine and not "just track positions": the strategy spans
// MULTIPLE positions (CSP → stock → CC) over weeks/months. Tracking premium
// captured + cost basis adjustment requires linking them as one logical "cycle".
//
// 2026-05-10 Sprint extension after Sprints 1-5.

import * as BS from "./black-scholes.js";

// ─── State machine constants ────────────────────────────────────────────────

export const WHEEL_STATES = Object.freeze({
  AWAITING_CSP:        'awaiting_csp',         // cash idle, looking for CSP entry
  CSP_OPEN:            'csp_open',             // sold a put, waiting expiry/assign
  ASSIGNED_LONG_STOCK: 'assigned_long_stock',  // got assigned, holding 100 sh
  CC_OPEN:             'cc_open',              // sold a call against stock
  CYCLE_COMPLETE:      'cycle_complete',       // CC assigned back to cash → terminal
});

export const WHEEL_EVENTS = Object.freeze({
  OPEN_CSP:      'open_csp',       // sell a CSP at strike K, premium P, expiry T
  OPEN_CC:       'open_cc',        // sell a CC at strike K, premium P, expiry T
  EXPIRE_OTM:    'expire_otm',     // option expired worthless (OTM) — keep premium
  ASSIGN:        'assign',         // option got assigned — CSP→stock or CC→cash
  CLOSE_EARLY:   'close_early',    // bought back at debit (took profit / cut loss)
  RESET:         'reset',          // force back to awaiting_csp (manual override)
});

// Edge case sentinel: when bs/Greeks degenerate, return safe defaults.
const SAFE_NUM = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

// ─── 1. State machine (pure function) ───────────────────────────────────────
//
// currentState: { state, symbol, strike?, premium_received?, expiry?, qty?,
//                 cost_basis_effective?, cycle_premium_total?, opened_at?, ... }
// event: one of WHEEL_EVENTS
// params: event-specific payload — see switch below
//
// Returns: { ok, nextState, transition, error? }
//   nextState: new state object (immutable; callers persist this)
//   transition: { from, to, event, at, note } for audit log
//   ok=false + error when illegal transition (e.g. EXPIRE_OTM in AWAITING_CSP)
export function wheelStateMachine(currentState, event, params = {}) {
  const now = params.at || new Date().toISOString();
  const cur = currentState || { state: WHEEL_STATES.AWAITING_CSP, cycle_premium_total: 0 };
  const from = cur.state;
  const symbol = cur.symbol || params.symbol;

  const fail = (reason) => ({
    ok: false,
    error: `Illegal transition: ${from} + ${event} → ${reason}`,
    nextState: cur,
  });

  const make = (next) => ({
    ok: true,
    transition: {
      from,
      to: next.state,
      event,
      at: now,
      note: params.note || null,
    },
    nextState: { ...cur, ...next, symbol, updated_at: now },
  });

  switch (event) {
    case WHEEL_EVENTS.OPEN_CSP: {
      if (from !== WHEEL_STATES.AWAITING_CSP) return fail('CSP only from awaiting_csp');
      const strike = SAFE_NUM(params.strike);
      const premium = SAFE_NUM(params.premium_per_share);
      const qty = Math.max(1, params.qty || 1); // contracts
      if (strike <= 0 || premium <= 0) return fail('strike+premium must be >0');
      const cashCommitted = strike * 100 * qty;
      return make({
        state: WHEEL_STATES.CSP_OPEN,
        strike_csp: strike,
        premium_csp: premium,
        qty,
        expiry: params.expiry || null,
        opened_at: now,
        cash_committed: cashCommitted,
        // cycle premium = sum of all premiums received this cycle (CSP + later CC)
        cycle_premium_total: SAFE_NUM(cur.cycle_premium_total) + premium * 100 * qty,
        cycle_started_at: cur.cycle_started_at || now,
      });
    }

    case WHEEL_EVENTS.EXPIRE_OTM: {
      if (from === WHEEL_STATES.CSP_OPEN) {
        // Premium kept; cash freed; loop back to awaiting
        return make({
          state: WHEEL_STATES.AWAITING_CSP,
          strike_csp: null,
          premium_csp: null,
          expiry: null,
          opened_at: null,
        });
      }
      if (from === WHEEL_STATES.CC_OPEN) {
        // Call expired worthless → still hold stock, can sell another CC
        return make({
          state: WHEEL_STATES.ASSIGNED_LONG_STOCK,
          strike_cc: null,
          premium_cc: null,
          expiry: null,
        });
      }
      return fail('EXPIRE_OTM only valid from csp_open or cc_open');
    }

    case WHEEL_EVENTS.ASSIGN: {
      if (from === WHEEL_STATES.CSP_OPEN) {
        // Got assigned 100 sh per contract at strike. Effective basis = strike − all premiums.
        const sharesAcquired = 100 * (cur.qty || 1);
        const grossBasis = (cur.strike_csp || 0) * sharesAcquired;
        const premsReceived = SAFE_NUM(cur.cycle_premium_total);
        const costBasisEffective = (grossBasis - premsReceived) / Math.max(1, sharesAcquired);
        return make({
          state: WHEEL_STATES.ASSIGNED_LONG_STOCK,
          shares_owned: sharesAcquired,
          stock_basis_per_share: SAFE_NUM(cur.strike_csp),
          cost_basis_effective: costBasisEffective,
          assigned_at: now,
          // CSP closed
          strike_csp: cur.strike_csp,  // keep for history
          expiry: null,
        });
      }
      if (from === WHEEL_STATES.CC_OPEN) {
        // Stock called away at strike_cc → cash + premium booked → cycle complete
        const sharesSold = SAFE_NUM(cur.shares_owned);
        const proceedsFromAssign = (cur.strike_cc || 0) * sharesSold;
        const totalCashCycle = proceedsFromAssign + SAFE_NUM(cur.cycle_premium_total);
        const costBasisCycle = SAFE_NUM(cur.stock_basis_per_share) * sharesSold;
        const cyclePnL = totalCashCycle - costBasisCycle;
        return make({
          state: WHEEL_STATES.CYCLE_COMPLETE,
          shares_owned: 0,
          cycle_pnl: cyclePnL,
          cycle_closed_at: now,
        });
      }
      return fail('ASSIGN only valid from csp_open or cc_open');
    }

    case WHEEL_EVENTS.OPEN_CC: {
      if (from !== WHEEL_STATES.ASSIGNED_LONG_STOCK) return fail('CC needs long stock');
      const strike = SAFE_NUM(params.strike);
      const premium = SAFE_NUM(params.premium_per_share);
      const qty = Math.max(1, params.qty || cur.qty || 1);
      if (strike <= 0 || premium <= 0) return fail('strike+premium must be >0');
      // Sanity: CC strike usually >= stock_basis to avoid locking in loss.
      // We allow it but flag in note.
      const note = strike < (cur.stock_basis_per_share || 0)
        ? `WARN: CC strike ${strike} < basis ${cur.stock_basis_per_share}`
        : params.note || null;
      return make({
        state: WHEEL_STATES.CC_OPEN,
        strike_cc: strike,
        premium_cc: premium,
        qty,
        expiry: params.expiry || null,
        opened_at: now,
        cycle_premium_total: SAFE_NUM(cur.cycle_premium_total) + premium * 100 * qty,
        // Refine effective basis as we collect more premium
        cost_basis_effective: (
          (SAFE_NUM(cur.stock_basis_per_share) * SAFE_NUM(cur.shares_owned))
          - (SAFE_NUM(cur.cycle_premium_total) + premium * 100 * qty)
        ) / Math.max(1, SAFE_NUM(cur.shares_owned)),
        // override note via wrapper
        ...(note ? { last_note: note } : {}),
      });
    }

    case WHEEL_EVENTS.CLOSE_EARLY: {
      if (from !== WHEEL_STATES.CSP_OPEN && from !== WHEEL_STATES.CC_OPEN) {
        return fail('CLOSE_EARLY only on open option');
      }
      const debit = SAFE_NUM(params.debit_per_share);
      const qty = cur.qty || 1;
      // Net premium kept for this leg = premium_received − debit_to_close
      const grossPremThisLeg = (from === WHEEL_STATES.CSP_OPEN ? cur.premium_csp : cur.premium_cc) || 0;
      const netThisLeg = (grossPremThisLeg - debit) * 100 * qty;
      // Adjust cycle running total: replace the gross premium with net realized
      const grossThisLeg = grossPremThisLeg * 100 * qty;
      const newCycleTotal = SAFE_NUM(cur.cycle_premium_total) - grossThisLeg + netThisLeg;
      if (from === WHEEL_STATES.CSP_OPEN) {
        return make({
          state: WHEEL_STATES.AWAITING_CSP,
          strike_csp: null, premium_csp: null, expiry: null,
          cycle_premium_total: newCycleTotal,
        });
      }
      return make({
        state: WHEEL_STATES.ASSIGNED_LONG_STOCK,
        strike_cc: null, premium_cc: null, expiry: null,
        cycle_premium_total: newCycleTotal,
      });
    }

    case WHEEL_EVENTS.RESET: {
      // Manual reset (e.g. user closed everything outside the system)
      return make({
        state: WHEEL_STATES.AWAITING_CSP,
        strike_csp: null, strike_cc: null,
        premium_csp: null, premium_cc: null,
        expiry: null, shares_owned: 0,
      });
    }

    default:
      return fail(`unknown event ${event}`);
  }
}

// ─── 2. Aggregate stats over an array of completed cycles ───────────────────
//
// cycles: [{ cycle_started_at, cycle_closed_at, cycle_pnl, cash_committed,
//            cycle_premium_total, shares_owned (final 0), strike_csp, ... }]
// Returns aggregate stats for dashboard.
export function computeWheelStats(cycles) {
  if (!cycles?.length) {
    return {
      n_cycles: 0,
      total_pnl: 0,
      total_premium: 0,
      avg_yield_on_cash_pct: 0,
      annualized_return_pct: 0,
      win_rate: 0,
      avg_cycle_days: 0,
    };
  }

  const completed = cycles.filter(c =>
    c.state === WHEEL_STATES.CYCLE_COMPLETE
    || (c.cycle_closed_at && c.cycle_pnl != null)
  );
  if (!completed.length) {
    // Still open — partial premium info only
    const totalPrem = cycles.reduce((a, c) => a + SAFE_NUM(c.cycle_premium_total), 0);
    return {
      n_cycles: 0,
      n_open_cycles: cycles.length,
      total_pnl: 0,
      total_premium: Math.round(totalPrem * 100) / 100,
      avg_yield_on_cash_pct: 0,
      annualized_return_pct: 0,
      win_rate: 0,
      avg_cycle_days: 0,
    };
  }

  const totalPnL = completed.reduce((a, c) => a + SAFE_NUM(c.cycle_pnl), 0);
  const totalPremium = completed.reduce((a, c) => a + SAFE_NUM(c.cycle_premium_total), 0);
  const wins = completed.filter(c => c.cycle_pnl > 0).length;

  // Per-cycle yield = pnl / cash_committed
  const yields = completed.map(c => {
    const cc = SAFE_NUM(c.cash_committed);
    return cc > 0 ? (SAFE_NUM(c.cycle_pnl) / cc) * 100 : 0;
  });
  const avgYield = yields.reduce((a, b) => a + b, 0) / yields.length;

  // Average days per cycle + annualized
  const days = completed.map(c => {
    if (!c.cycle_started_at || !c.cycle_closed_at) return 0;
    const ms = new Date(c.cycle_closed_at).getTime() - new Date(c.cycle_started_at).getTime();
    return Math.max(1, ms / (1000 * 60 * 60 * 24));
  });
  const avgDays = days.reduce((a, b) => a + b, 0) / days.length;
  const annualized = avgDays > 0 ? avgYield * (365 / avgDays) : 0;

  return {
    n_cycles: completed.length,
    n_open_cycles: cycles.length - completed.length,
    total_pnl: Math.round(totalPnL * 100) / 100,
    total_premium: Math.round(totalPremium * 100) / 100,
    avg_yield_on_cash_pct: Math.round(avgYield * 100) / 100,
    annualized_return_pct: Math.round(annualized * 100) / 100,
    win_rate: Math.round((wins / completed.length) * 1000) / 10,
    avg_cycle_days: Math.round(avgDays * 10) / 10,
    largest_win: Math.max(...completed.map(c => SAFE_NUM(c.cycle_pnl))),
    largest_loss: Math.min(...completed.map(c => SAFE_NUM(c.cycle_pnl))),
  };
}

// ─── 3. Suggest next action ─────────────────────────────────────────────────
//
// currentPosition: state object from wheelStateMachine
// marketData: { S, sigma_iv, r?, q?, dte? } — IV (annualized), risk-free, dividend yield
//
// Returns { action, suggested_strike, suggested_premium_estimate, dte, rationale }
// or { action: 'wait', rationale } when no action recommended.
//
// Strike heuristics (Tastytrade canon):
//   CSP entry  → strike ≈ S − 1 SD (≈ Δ16); prefer below recent support.
//   CC entry   → strike ≈ max(stock_basis × 1.02, S + 1 SD); never lock-in loss.
//   Roll/close → if profit ≥ 50% of credit OR DTE ≤ 7 → close.
export function suggestNextAction(currentPosition, marketData) {
  const cur = currentPosition || { state: WHEEL_STATES.AWAITING_CSP };
  const S = SAFE_NUM(marketData?.S);
  // Bug #029: do NOT fall back to a hardcoded IV. Callers must supply real IV
  // (from TT or IB Gateway). A silent 0.20 default produces wrong strikes/premiums.
  const ivRaw = marketData?.sigma_iv;
  if (ivRaw == null || ivRaw <= 0) {
    return { action: 'wait', rationale: 'No IV available — supply sigma_iv from live data source' };
  }
  const iv = SAFE_NUM(ivRaw);
  const r = SAFE_NUM(marketData?.r, BS.DEFAULT_RISK_FREE_RATE);
  const q = SAFE_NUM(marketData?.q, 0);
  const dte = Math.max(7, marketData?.dte || 35);
  const T = dte / 365;

  if (S <= 0 || iv <= 0) {
    return { action: 'wait', rationale: 'Missing market data (S or IV)' };
  }

  const sd = S * iv * Math.sqrt(T);
  const tick = S > 500 ? 5 : S > 50 ? 1 : 0.5;
  const round = (x) => Math.round(x / tick) * tick;

  switch (cur.state) {
    case WHEEL_STATES.AWAITING_CSP: {
      const strike = round(S - sd);          // ≈ Δ16 short
      const premium = BS.bsPrice(S, strike, T, r, iv, 'put', q);
      return {
        action: 'open_csp',
        suggested_strike: strike,
        suggested_premium_estimate: Math.round(premium * 100) / 100,
        dte,
        cash_required: strike * 100,
        yield_pct: strike > 0 ? Math.round((premium / strike) * 10000) / 100 : 0,
        rationale: `CSP ${strike} (~Δ16, ${dte} DTE). Cash secured ${strike * 100}.`,
      };
    }

    case WHEEL_STATES.CSP_OPEN: {
      // Live-monitor recommendation: keep open or close
      const remT = cur.expiry
        ? BS.yearFraction(cur.expiry)
        : T / 2;
      const liveDebit = BS.bsPrice(S, cur.strike_csp || 0, Math.max(0.001, remT), r, iv, 'put', q);
      const credit = SAFE_NUM(cur.premium_csp);
      if (credit <= 0) return { action: 'wait', rationale: 'No premium recorded' };
      const profitPctOfCredit = ((credit - liveDebit) / credit) * 100;
      if (profitPctOfCredit >= 50) {
        return {
          action: 'close_early',
          debit_estimate: Math.round(liveDebit * 100) / 100,
          rationale: `Take profit: ${profitPctOfCredit.toFixed(0)}% of credit captured.`,
        };
      }
      if (remT * 365 <= 7 && S < (cur.strike_csp || 0) * 1.02) {
        return {
          action: 'roll',
          rationale: 'Within 7 DTE and ATM/ITM — roll out to next month or accept assignment.',
        };
      }
      return { action: 'hold', rationale: `Hold CSP. ${profitPctOfCredit.toFixed(0)}% captured.` };
    }

    case WHEEL_STATES.ASSIGNED_LONG_STOCK: {
      const basis = SAFE_NUM(cur.stock_basis_per_share);
      // CC strike: max(basis*1.02, S + 1 SD) so we never lock in loss + capture upside
      const naturalStrike = round(Math.max(basis * 1.02, S + sd));
      const premium = BS.bsPrice(S, naturalStrike, T, r, iv, 'call', q);
      const annYield = naturalStrike > 0 ? (premium / S) * (365 / dte) * 100 : 0;
      return {
        action: 'open_cc',
        suggested_strike: naturalStrike,
        suggested_premium_estimate: Math.round(premium * 100) / 100,
        dte,
        annualized_yield_pct: Math.round(annYield * 10) / 10,
        rationale: `CC ${naturalStrike} above basis $${basis.toFixed(2)}. Annualized ~${annYield.toFixed(1)}%.`,
      };
    }

    case WHEEL_STATES.CC_OPEN: {
      const remT = cur.expiry
        ? BS.yearFraction(cur.expiry)
        : T / 2;
      const liveDebit = BS.bsPrice(S, cur.strike_cc || 0, Math.max(0.001, remT), r, iv, 'call', q);
      const credit = SAFE_NUM(cur.premium_cc);
      if (credit <= 0) return { action: 'wait', rationale: 'No premium recorded' };
      const profitPctOfCredit = ((credit - liveDebit) / credit) * 100;
      if (profitPctOfCredit >= 50) {
        return {
          action: 'close_early',
          debit_estimate: Math.round(liveDebit * 100) / 100,
          rationale: `Take profit: ${profitPctOfCredit.toFixed(0)}% of CC credit captured.`,
        };
      }
      return { action: 'hold', rationale: `Hold CC. ${profitPctOfCredit.toFixed(0)}% captured.` };
    }

    case WHEEL_STATES.CYCLE_COMPLETE: {
      return {
        action: 'reset_for_next_cycle',
        rationale: 'Cycle complete. Reset to awaiting_csp to start next wheel.',
      };
    }

    default:
      return { action: 'wait', rationale: `Unknown state ${cur.state}` };
  }
}

// ─── 4. Backtest the wheel on historical bars ───────────────────────────────
//
// bars: [{ date, close }]  — daily underlying OHLC close (chronological)
// params: {
//   dte = 35,
//   delta_short_pct = 1.0,    // SD multiple for short put / call (1.0 ≈ Δ16)
//   take_profit_pct = 0.50,   // close at 50% credit
//   capital = 10000,           // initial cash
//   r = 0.045, q = 0.013,
//   max_cycles = null,         // optional cap
// }
//
// Simulates: buy CSP → if assigned, hold stock + sell CCs → if called away, restart.
// Uses HV(30) as IV proxy (no live IV in historical bars).
// Returns { cycles: [...], stats: {...}, final_capital, log: [...] }.
export function simulateWheelOnBars(bars, params = {}) {
  const DTE = params.dte || 35;
  const TP = params.take_profit_pct ?? 0.50;
  const SHORT_PCT = params.delta_short_pct ?? 1.0;
  const r = params.r ?? BS.DEFAULT_RISK_FREE_RATE;
  const q = params.q ?? 0.013;
  const initialCapital = params.capital ?? 10000;
  const maxCycles = params.max_cycles ?? Infinity;

  if (!bars?.length || bars.length < 60) {
    return { cycles: [], stats: computeWheelStats([]), final_capital: initialCapital, log: ['insufficient bars'] };
  }

  let capital = initialCapital;
  let state = { state: WHEEL_STATES.AWAITING_CSP, cycle_premium_total: 0 };
  const cycles = [];
  const log = [];

  // Helper: 30d HV at index i
  const hv30 = (i) => {
    const window = bars.slice(Math.max(0, i - 30), i).map(b => b.close);
    if (window.length < 5) return 0.20;
    const rets = [];
    for (let k = 1; k < window.length; k++) {
      if (window[k - 1] > 0) rets.push(Math.log(window[k] / window[k - 1]));
    }
    const mu = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
    const v = rets.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, rets.length - 1);
    return Math.sqrt(v) * Math.sqrt(252);
  };

  let i = 30; // need history for HV
  while (i < bars.length - DTE && cycles.length < maxCycles) {
    const bar = bars[i];
    const S = bar.close;
    const sigma = hv30(i);
    const T = DTE / 365;
    const sd = S * sigma * Math.sqrt(T);
    const tick = S > 500 ? 5 : S > 50 ? 1 : 0.5;
    const round = (x) => Math.round(x / tick) * tick;

    if (state.state === WHEEL_STATES.AWAITING_CSP) {
      const strike = round(S - sd * SHORT_PCT);
      if (strike <= 0) { i++; continue; }
      // Need cash to secure
      if (strike * 100 > capital) { log.push(`${bar.date} skip: not enough cash for CSP @${strike}`); i++; continue; }
      const credit = BS.bsPrice(S, strike, T, r, sigma, 'put', q);
      if (credit <= 0.05) { i++; continue; } // skip pennies
      const sm = wheelStateMachine(state, WHEEL_EVENTS.OPEN_CSP, {
        symbol: params.symbol || 'SPY',
        strike, premium_per_share: credit, qty: 1,
        expiry: bars[Math.min(i + DTE, bars.length - 1)].date,
        at: bar.date,
      });
      if (!sm.ok) { i++; continue; }
      state = sm.nextState;
      capital += credit * 100; // cash credit (margin requirement is the strike)
      log.push(`${bar.date} OPEN_CSP ${strike} credit ${credit.toFixed(2)}`);
      // Fast-forward to expiry, but check TP daily
      let exitedEarly = false;
      for (let j = i + 1; j <= Math.min(i + DTE, bars.length - 1); j++) {
        const Sj = bars[j].close;
        const Tj = (DTE - (j - i)) / 365;
        if (Tj <= 0) break;
        const debit = BS.bsPrice(Sj, strike, Tj, r, sigma, 'put', q);
        const profitPct = (credit - debit) / credit;
        if (profitPct >= TP) {
          // Close early
          const sm2 = wheelStateMachine(state, WHEEL_EVENTS.CLOSE_EARLY, {
            debit_per_share: debit, at: bars[j].date,
          });
          state = sm2.nextState;
          capital -= debit * 100;
          log.push(`${bars[j].date} CSP_TAKE_PROFIT debit ${debit.toFixed(2)} (${(profitPct*100).toFixed(0)}%)`);
          i = j + 1;
          exitedEarly = true;
          break;
        }
      }
      if (exitedEarly) continue;
      // Reached expiry: assign or expire
      const Sexp = bars[Math.min(i + DTE, bars.length - 1)].close;
      if (Sexp < strike) {
        const sm2 = wheelStateMachine(state, WHEEL_EVENTS.ASSIGN, { at: bars[Math.min(i + DTE, bars.length - 1)].date });
        state = sm2.nextState;
        capital -= strike * 100; // cash used to buy 100 sh
        log.push(`${bars[Math.min(i + DTE, bars.length - 1)].date} ASSIGN_PUT @${strike}`);
      } else {
        const sm2 = wheelStateMachine(state, WHEEL_EVENTS.EXPIRE_OTM, { at: bars[Math.min(i + DTE, bars.length - 1)].date });
        state = sm2.nextState;
        log.push(`${bars[Math.min(i + DTE, bars.length - 1)].date} CSP_EXPIRE_OTM`);
      }
      i = Math.min(i + DTE, bars.length - 1) + 1;
      continue;
    }

    if (state.state === WHEEL_STATES.ASSIGNED_LONG_STOCK) {
      const basis = state.stock_basis_per_share || S;
      const ccStrike = round(Math.max(basis * 1.02, S + sd * SHORT_PCT));
      const credit = BS.bsPrice(S, ccStrike, T, r, sigma, 'call', q);
      if (credit <= 0.05) { i++; continue; }
      const sm = wheelStateMachine(state, WHEEL_EVENTS.OPEN_CC, {
        strike: ccStrike, premium_per_share: credit, qty: 1,
        expiry: bars[Math.min(i + DTE, bars.length - 1)].date,
        at: bar.date,
      });
      if (!sm.ok) { i++; continue; }
      state = sm.nextState;
      capital += credit * 100;
      log.push(`${bar.date} OPEN_CC ${ccStrike} credit ${credit.toFixed(2)}`);
      let exitedEarly = false;
      for (let j = i + 1; j <= Math.min(i + DTE, bars.length - 1); j++) {
        const Sj = bars[j].close;
        const Tj = (DTE - (j - i)) / 365;
        if (Tj <= 0) break;
        const debit = BS.bsPrice(Sj, ccStrike, Tj, r, sigma, 'call', q);
        const profitPct = (credit - debit) / credit;
        if (profitPct >= TP) {
          const sm2 = wheelStateMachine(state, WHEEL_EVENTS.CLOSE_EARLY, {
            debit_per_share: debit, at: bars[j].date,
          });
          state = sm2.nextState;
          capital -= debit * 100;
          log.push(`${bars[j].date} CC_TAKE_PROFIT debit ${debit.toFixed(2)}`);
          i = j + 1;
          exitedEarly = true;
          break;
        }
      }
      if (exitedEarly) continue;
      const Sexp = bars[Math.min(i + DTE, bars.length - 1)].close;
      if (Sexp > ccStrike) {
        // Called away → cycle closes
        const sm2 = wheelStateMachine(state, WHEEL_EVENTS.ASSIGN, { at: bars[Math.min(i + DTE, bars.length - 1)].date });
        state = sm2.nextState;
        capital += ccStrike * 100; // sell stock at strike
        log.push(`${bars[Math.min(i + DTE, bars.length - 1)].date} ASSIGN_CALL @${ccStrike}`);
        // Snapshot cycle
        cycles.push({ ...state, end_capital: capital });
        // Reset for next cycle
        state = { state: WHEEL_STATES.AWAITING_CSP, cycle_premium_total: 0 };
      } else {
        const sm2 = wheelStateMachine(state, WHEEL_EVENTS.EXPIRE_OTM, { at: bars[Math.min(i + DTE, bars.length - 1)].date });
        state = sm2.nextState;
        log.push(`${bars[Math.min(i + DTE, bars.length - 1)].date} CC_EXPIRE_OTM (still hold stock)`);
      }
      i = Math.min(i + DTE, bars.length - 1) + 1;
      continue;
    }

    i++; // safety
  }

  // Mark-to-market unfinalized cycle (still holding stock at end of bars)
  const finalBar = bars[bars.length - 1];
  if (state.state !== WHEEL_STATES.AWAITING_CSP && state.state !== WHEEL_STATES.CYCLE_COMPLETE) {
    const finalStockValue = SAFE_NUM(state.shares_owned) * finalBar.close;
    const mtmCapital = capital + finalStockValue;
    cycles.push({ ...state, end_capital: mtmCapital, mtm_open: true });
    capital = mtmCapital;
  }

  return {
    cycles,
    stats: computeWheelStats(cycles),
    final_capital: Math.round(capital * 100) / 100,
    initial_capital: initialCapital,
    total_return_pct: Math.round(((capital / initialCapital) - 1) * 10000) / 100,
    log: log.slice(-50), // last 50 events to keep payload small
  };
}
