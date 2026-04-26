/* eslint-disable no-underscore-dangle */
//
// IB API client wrapper.
//
// IMPORTANT — READ-ONLY:
//   This module deliberately imports ONLY data-fetch primitives from @stoqey/ib.
//   It NEVER imports or references `Order`, `placeOrder`, `cancelOrder`, etc.
//   See `index.js` for the full 3-layer safety model.
//
// @stoqey/ib's API is event-based (it mirrors the upstream IB TWS protocol).
// Most calls are made by:
//   1. picking a unique reqId
//   2. calling a request method (e.g. ib.reqMktData(reqId, contract, ...))
//   3. listening for a stream of events keyed by reqId
//   4. calling a cancel method when done
//
// We wrap these patterns into Promises so route handlers stay simple. Each
// helper has its own timeout so a stuck IB call cannot wedge the bridge.
//

import {
  IBApi,
  EventName,
  ErrorCode,
  Contract,
  SecType,
  BarSizeSetting,
} from '@stoqey/ib';
import logger from './utils/logger.js';

// --------- module state ----------

let ib = null;
let connected = false;
let connecting = false;
let serverVersion = null;
let lastError = null;
let primaryAccount = null;
let reconnectTimer = null;
let backoffMs = 1000;

// Auto-incrementing request id counter. IB requires uniqueness across the
// session, so we just monotonically increase from a high base.
let nextReqId = 1000;
function newReqId() {
  nextReqId += 1;
  if (nextReqId > 2_000_000_000) nextReqId = 1000;
  return nextReqId;
}

// --------- connection management ----------

const HOST = process.env.IBKR_HOST || 'ib-gateway';
const PORT = Number.parseInt(process.env.IBKR_PORT || '4001', 10);
const CLIENT_ID = Number.parseInt(process.env.IBKR_CLIENT_ID || '1', 10);
const CONNECT_TIMEOUT_MS = 15_000;

export function getStatus() {
  return {
    connected,
    serverVersion,
    lastError,
    host: HOST,
    port: PORT,
    clientId: CLIENT_ID,
  };
}

export function isConnected() {
  return connected;
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  clearReconnect();
  const delay = Math.min(backoffMs, 60_000);
  logger.warn('ib.reconnect.scheduled', { delay_ms: delay });
  reconnectTimer = setTimeout(() => {
    backoffMs = Math.min(backoffMs * 2, 60_000);
    connect().catch((err) => {
      lastError = err.message || String(err);
      logger.error('ib.reconnect.failed', err);
      scheduleReconnect();
    });
  }, delay);
}

function attachListeners(api) {
  api.on(EventName.connected, () => {
    connected = true;
    connecting = false;
    backoffMs = 1000;
    logger.info('ib.connected', { host: HOST, port: PORT, clientId: CLIENT_ID });
  });

  api.on(EventName.disconnected, () => {
    if (connected) {
      logger.warn('ib.disconnected');
    }
    connected = false;
    scheduleReconnect();
  });

  api.on(EventName.server, (version /* , connectionTime */) => {
    serverVersion = String(version);
    logger.info('ib.server_version', { version: serverVersion });
  });

  api.on(EventName.managedAccounts, (accountsList) => {
    // Comma-separated list. We only care about the first for /nav.
    const first = String(accountsList || '').split(',')[0]?.trim();
    if (first) {
      primaryAccount = first;
      logger.info('ib.account_attached');
    }
  });

  api.on(EventName.error, (err, code, reqId) => {
    // IB sends "errors" that are actually informational (e.g. 2104, 2106 = farm OK).
    // We log them at debug, route real errors to error.
    const isInfo = code >= 2100 && code < 2200;
    const msg = err?.message || String(err);
    if (isInfo) {
      logger.debug('ib.info', { code, reqId, msg });
    } else {
      lastError = msg;
      logger.error('ib.error', { code, reqId, msg });
    }
  });
}

export async function connect() {
  if (connected || connecting) return;
  connecting = true;
  clearReconnect();

  ib = new IBApi({ host: HOST, port: PORT, clientId: CLIENT_ID });
  attachListeners(ib);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      connecting = false;
      reject(new Error(`IB connect timeout after ${CONNECT_TIMEOUT_MS}ms`));
    }, CONNECT_TIMEOUT_MS);

    ib.once(EventName.connected, () => {
      clearTimeout(timer);
      resolve();
    });

    ib.once(EventName.error, (err, code) => {
      // Codes 502/504 indicate the gateway refused us — fail fast.
      if (code === 502 || code === 504 || code === 507) {
        clearTimeout(timer);
        connecting = false;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    try {
      ib.connect();
    } catch (err) {
      clearTimeout(timer);
      connecting = false;
      reject(err);
    }
  });
}

export async function disconnect() {
  clearReconnect();
  if (ib && connected) {
    try {
      ib.disconnect();
    } catch (err) {
      logger.error('ib.disconnect.failed', err);
    }
  }
  connected = false;
  ib = null;
}

// --------- helpers ----------

function ensureConnected() {
  if (!connected || !ib) {
    const err = new Error('IB Gateway not connected');
    err.code = 'IB_UNAVAILABLE';
    throw err;
  }
}

/**
 * Wrap a subscription pattern into a one-shot Promise.
 *  - `start(reqId)` issues the request to IB
 *  - `bind(emitter, reqId, resolve, reject)` attaches listeners
 *  - `cancel(reqId)` is called on resolve / reject / timeout
 *  - `timeoutMs` defaults to 10s
 */
function reqWithTimeout({ start, bind, cancel, timeoutMs = 10_000, label = 'ib_call' }) {
  ensureConnected();
  const reqId = newReqId();

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      try {
        if (cancel) cancel(reqId);
      } catch (e) {
        logger.debug('ib.cancel.failed', { label, msg: e.message });
      }
      cleanup();
      if (err) reject(err);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${timeoutMs}ms`);
      err.code = 'IB_TIMEOUT';
      finish(err);
    }, timeoutMs);

    // Listener handles registered by `bind` so we can detach them
    const handles = [];
    const addListener = (event, fn) => {
      ib.on(event, fn);
      handles.push([event, fn]);
    };

    function cleanup() {
      clearTimeout(timer);
      for (const [event, fn] of handles) {
        try {
          ib.removeListener(event, fn);
        } catch {
          // ignore
        }
      }
    }

    // Hook a generic error listener so stray IB errors for our reqId reject the promise.
    addListener(EventName.error, (err, code, errReqId) => {
      if (errReqId === reqId && code < 2100) {
        const e = err instanceof Error ? err : new Error(String(err));
        e.code = `IB_ERR_${code}`;
        finish(e);
      }
    });

    try {
      bind({ reqId, addListener, resolve: (v) => finish(null, v), reject: finish });
      start(reqId);
    } catch (err) {
      finish(err);
    }
  });
}

// --------- contract helpers ----------

export function stockContract(symbol, currency = 'USD', exchange = 'SMART') {
  const c = new Contract();
  c.symbol = symbol;
  c.secType = SecType.STK;
  c.exchange = exchange;
  c.currency = currency;
  return c;
}

// --------- account / NAV / positions ----------

const NAV_TAGS =
  'NetLiquidation,EquityWithLoanValue,BuyingPower,AvailableFunds,ExcessLiquidity,InitMarginReq,MaintMarginReq,Cushion,FullInitMarginReq,FullMaintMarginReq';

/**
 * GET /nav data — uses reqAccountSummary which streams one event per tag,
 * terminating with `accountSummaryEnd`.
 */
export async function fetchAccountSummary() {
  const data = {};
  let currency = 'USD';
  let accountId = primaryAccount || null;

  await reqWithTimeout({
    label: 'reqAccountSummary',
    timeoutMs: 8_000,
    start: (reqId) => ib.reqAccountSummary(reqId, 'All', NAV_TAGS),
    cancel: (reqId) => ib.cancelAccountSummary(reqId),
    bind: ({ reqId, addListener, resolve, reject }) => {
      addListener(EventName.accountSummary, (rid, account, tag, value, valCurrency) => {
        if (rid !== reqId) return;
        accountId = account || accountId;
        if (valCurrency && valCurrency !== 'BASE') currency = valCurrency;
        data[tag] = Number.parseFloat(value);
      });
      addListener(EventName.accountSummaryEnd, (rid) => {
        if (rid === reqId) resolve();
      });
    },
  });

  const cushion = data.Cushion ?? 0;

  return {
    account_id: accountId,
    currency,
    net_liquidation: data.NetLiquidation ?? null,
    equity_with_loan_value: data.EquityWithLoanValue ?? null,
    buying_power: data.BuyingPower ?? null,
    available_funds: data.AvailableFunds ?? null,
    excess_liquidity: data.ExcessLiquidity ?? null,
    init_margin_req: data.InitMarginReq ?? null,
    maint_margin_req: data.MaintMarginReq ?? null,
    cushion_pct: cushion,
    updated_at: new Date().toISOString(),
  };
}

/**
 * GET /positions — uses reqPositions which streams `position` events
 * for every position across every account, terminating with `positionEnd`.
 *
 * Market price / market value require an extra ticker subscription per symbol;
 * we batch that step at the route layer to avoid storms.
 */
export async function fetchPositions() {
  const out = [];

  await reqWithTimeout({
    label: 'reqPositions',
    timeoutMs: 10_000,
    start: () => ib.reqPositions(),
    cancel: () => ib.cancelPositions(),
    bind: ({ addListener, resolve }) => {
      addListener(EventName.position, (account, contract, position, avgCost) => {
        if (!contract || position === 0) return;
        out.push({
          account,
          symbol: contract.symbol,
          secType: contract.secType,
          exchange: contract.exchange || contract.primaryExch || null,
          currency: contract.currency,
          qty: Number(position),
          avg_cost: Number(avgCost),
          contract,
        });
      });
      addListener(EventName.positionEnd, () => resolve());
    },
  });

  // Best-effort enrichment: snapshot quote per symbol. We deliberately limit
  // concurrency so a 100-position account doesn't trigger IB's pacing limits.
  const enriched = await mapWithConcurrency(out, 8, async (pos) => {
    try {
      const q = await fetchQuote(pos.contract);
      const last = q.last ?? q.close ?? null;
      const marketValue = last != null ? last * pos.qty : null;
      const unrealized = last != null ? (last - pos.avg_cost) * pos.qty : null;
      return {
        symbol: pos.symbol,
        secType: pos.secType,
        exchange: pos.exchange,
        currency: pos.currency,
        qty: pos.qty,
        avg_cost: pos.avg_cost,
        market_price: last,
        market_value: marketValue,
        unrealized_pnl: unrealized,
        realized_pnl: 0,
      };
    } catch (err) {
      logger.debug('positions.enrich_failed', { symbol: pos.symbol, msg: err.message });
      return {
        symbol: pos.symbol,
        secType: pos.secType,
        exchange: pos.exchange,
        currency: pos.currency,
        qty: pos.qty,
        avg_cost: pos.avg_cost,
        market_price: null,
        market_value: null,
        unrealized_pnl: null,
        realized_pnl: 0,
      };
    }
  });

  return enriched;
}

// --------- quotes ----------

/**
 * Single-symbol snapshot quote. We use snapshot=true so IB closes the stream
 * automatically after a short delay (no need to keep a streaming subscription).
 */
export async function fetchQuote(symbolOrContract) {
  const contract =
    typeof symbolOrContract === 'string'
      ? stockContract(symbolOrContract)
      : symbolOrContract;

  const ticks = {};
  let receivedSnapshot = false;

  await reqWithTimeout({
    label: 'reqMktData(snapshot)',
    timeoutMs: 6_000,
    start: (reqId) => ib.reqMktData(reqId, contract, '', true, false),
    cancel: () => {
      // Snapshot subscriptions auto-cancel; cancelMktData is a no-op but safe.
    },
    bind: ({ reqId, addListener, resolve }) => {
      addListener(EventName.tickPrice, (rid, field, price /* , attribs */) => {
        if (rid !== reqId) return;
        // Common fields per IB docs:
        //  1=bid, 2=ask, 4=last, 6=high, 7=low, 9=close, 14=open
        const map = { 1: 'bid', 2: 'ask', 4: 'last', 6: 'high', 7: 'low', 9: 'close', 14: 'open' };
        const key = map[field];
        if (key && price > 0) ticks[key] = price;
      });
      addListener(EventName.tickSize, (rid, field, size) => {
        if (rid !== reqId) return;
        // 8 = volume
        if (field === 8) ticks.volume = Number(size);
      });
      addListener(EventName.tickGeneric, (rid, field, value) => {
        if (rid !== reqId) return;
        // 23 = historical vol, 24 = implied vol
        if (field === 24) ticks.iv = Number(value);
        if (field === 23) ticks.hv = Number(value);
      });
      addListener(EventName.tickSnapshotEnd, (rid) => {
        if (rid === reqId) {
          receivedSnapshot = true;
          resolve();
        }
      });
    },
  });

  // Compute change pct if we have last + close
  let changePct = null;
  if (ticks.last && ticks.close) {
    changePct = ((ticks.last - ticks.close) / ticks.close) * 100;
  }

  return {
    last: ticks.last ?? null,
    bid: ticks.bid ?? null,
    ask: ticks.ask ?? null,
    open: ticks.open ?? null,
    high: ticks.high ?? null,
    low: ticks.low ?? null,
    close: ticks.close ?? null,
    change_pct: changePct,
    volume: ticks.volume ?? null,
    iv: ticks.iv ?? null,
    hv: ticks.hv ?? null,
    ts: new Date().toISOString(),
    _snapshot: receivedSnapshot,
  };
}

/**
 * Batched quotes. IB doesn't expose a single "many-symbols" call, so we
 * fan out N concurrent snapshot requests.
 */
export async function fetchQuotes(symbols) {
  const result = {};
  await mapWithConcurrency(symbols, 10, async (sym) => {
    try {
      const q = await fetchQuote(sym);
      result[sym] = q;
    } catch (err) {
      result[sym] = { error: err.message };
    }
  });
  return result;
}

// --------- historical bars ----------

export async function fetchHistorical(symbol, durationStr = '30 D', barSize = '1 day') {
  const contract = stockContract(symbol);
  const bars = [];

  await reqWithTimeout({
    label: 'reqHistoricalData',
    timeoutMs: 30_000,
    start: (reqId) =>
      ib.reqHistoricalData(reqId, contract, '', durationStr, barSize, 'TRADES', 1, 1, false),
    cancel: (reqId) => ib.cancelHistoricalData(reqId),
    bind: ({ reqId, addListener, resolve }) => {
      addListener(EventName.historicalData, (rid, time, open, high, low, close, volume) => {
        if (rid !== reqId) return;
        // The lib emits a sentinel "finished-..." marker on `time` to signal end.
        if (typeof time === 'string' && time.startsWith('finished')) {
          resolve();
          return;
        }
        bars.push({
          time,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume),
        });
      });
      addListener(EventName.historicalDataEnd, (rid) => {
        if (rid === reqId) resolve();
      });
    },
  });

  return bars;
}

// --------- option chain ----------

/**
 * Fetch option chain for a symbol.
 * Steps:
 *   1. reqContractDetails(STK) → get conid + tradingClass
 *   2. reqSecDefOptParams → list of expirations + strikes
 *   3. for each (expiry, strike) within DTE/OTM filters → reqContractDetails for the OPT
 *   4. for each surviving contract → snapshot quote (computes greeks if subscribed)
 */
export async function fetchOptionChain(symbol, { dteMin = 20, dteMax = 45, otmPct = 0.10 } = {}) {
  // Spot first
  const spotQ = await fetchQuote(symbol);
  const spot = spotQ.last ?? spotQ.close;
  if (!spot) {
    const err = new Error(`Could not determine spot for ${symbol}`);
    err.code = 'NO_SPOT';
    throw err;
  }

  // Step 1: STK contract details (need conid)
  const stkDetails = await fetchContractDetails(stockContract(symbol));
  if (!stkDetails.length) {
    const err = new Error(`No contract details for ${symbol}`);
    err.code = 'NO_CONTRACT';
    throw err;
  }
  const stk = stkDetails[0].contract;
  const underlyingConId = stk.conId;

  // Step 2: chain parameters (expirations + strikes)
  const params = await fetchSecDefOptParams(symbol, stk.primaryExch || stk.exchange, underlyingConId);
  if (!params.length) return { underlying: symbol, spot, expirations: [], calls: [], puts: [] };

  // Pick the first matching exchange (prefer SMART)
  const chosen = params.find((p) => p.exchange === 'SMART') || params[0];
  const allExpirations = chosen.expirations || [];
  const allStrikes = (chosen.strikes || []).map(Number).sort((a, b) => a - b);

  // Filter expirations by DTE
  const today = new Date();
  const expirations = allExpirations
    .map((e) => ({ raw: e, dte: dteFromYYYYMMDD(e, today) }))
    .filter(({ dte }) => dte >= dteMin && dte <= dteMax)
    .map(({ raw }) => raw);

  // Filter strikes by OTM band
  const lower = spot * (1 - otmPct);
  const upper = spot * (1 + otmPct);
  const strikes = allStrikes.filter((k) => k >= lower * 0.7 && k <= upper * 1.3);
  // Calls are OTM above spot, puts OTM below — we keep a band on both sides.

  // Build the candidate contracts
  const targets = [];
  for (const expiry of expirations) {
    for (const strike of strikes) {
      // Calls: only above spot (OTM)
      if (strike >= spot && strike <= upper * 1.3) {
        targets.push({ side: 'C', expiry, strike });
      }
      // Puts: only below spot (OTM)
      if (strike <= spot && strike >= lower * 0.7) {
        targets.push({ side: 'P', expiry, strike });
      }
    }
  }

  // Quote each option (limited concurrency)
  const calls = [];
  const puts = [];
  await mapWithConcurrency(targets, 6, async (t) => {
    try {
      const optC = optionContract(symbol, t.expiry, t.strike, t.side);
      const q = await fetchOptionQuote(optC);
      const row = {
        strike: t.strike,
        expiry: formatExpiry(t.expiry),
        dte: dteFromYYYYMMDD(t.expiry, today),
        bid: q.bid,
        ask: q.ask,
        last: q.last,
        iv: q.iv,
        delta: q.delta,
        gamma: q.gamma,
        theta: q.theta,
        vega: q.vega,
        open_interest: q.open_interest,
        volume: q.volume,
      };
      if (t.side === 'C') calls.push(row);
      else puts.push(row);
    } catch (err) {
      logger.debug('option_quote.failed', { symbol, side: t.side, expiry: t.expiry, strike: t.strike, msg: err.message });
    }
  });

  calls.sort((a, b) => a.strike - b.strike);
  puts.sort((a, b) => a.strike - b.strike);

  return {
    underlying: symbol,
    spot,
    expirations: expirations.map(formatExpiry),
    calls,
    puts,
  };
}

function optionContract(symbol, expiry /* YYYYMMDD */, strike, right /* 'C'|'P' */) {
  const c = new Contract();
  c.symbol = symbol;
  c.secType = SecType.OPT;
  c.exchange = 'SMART';
  c.currency = 'USD';
  c.lastTradeDateOrContractMonth = expiry;
  c.strike = strike;
  c.right = right === 'C' ? 'C' : 'P';
  c.multiplier = '100';
  return c;
}

async function fetchContractDetails(contract) {
  const out = [];
  await reqWithTimeout({
    label: 'reqContractDetails',
    timeoutMs: 8_000,
    start: (reqId) => ib.reqContractDetails(reqId, contract),
    bind: ({ reqId, addListener, resolve }) => {
      addListener(EventName.contractDetails, (rid, details) => {
        if (rid === reqId) out.push(details);
      });
      addListener(EventName.contractDetailsEnd, (rid) => {
        if (rid === reqId) resolve();
      });
    },
  });
  return out;
}

async function fetchSecDefOptParams(symbol, exchange, underlyingConId) {
  const out = [];
  await reqWithTimeout({
    label: 'reqSecDefOptParams',
    timeoutMs: 12_000,
    start: (reqId) => ib.reqSecDefOptParams(reqId, symbol, '', 'STK', underlyingConId),
    bind: ({ reqId, addListener, resolve }) => {
      addListener(
        EventName.securityDefinitionOptionParameter,
        (rid, exch, undConId, tradingClass, multiplier, expirations, strikes) => {
          if (rid !== reqId) return;
          out.push({ exchange: exch, tradingClass, multiplier, expirations, strikes });
        },
      );
      addListener(EventName.securityDefinitionOptionParameterEnd, (rid) => {
        if (rid === reqId) resolve();
      });
    },
  });
  return out;
}

/**
 * Snapshot quote for an option, including greeks via tickOptionComputation.
 */
async function fetchOptionQuote(contract) {
  const t = {};

  await reqWithTimeout({
    label: 'reqMktData(option)',
    timeoutMs: 6_000,
    start: (reqId) => ib.reqMktData(reqId, contract, '13', true, false), // genericTickList 13 = OI
    bind: ({ reqId, addListener, resolve }) => {
      addListener(EventName.tickPrice, (rid, field, price) => {
        if (rid !== reqId) return;
        if (price <= 0) return;
        if (field === 1) t.bid = price;
        else if (field === 2) t.ask = price;
        else if (field === 4) t.last = price;
      });
      addListener(EventName.tickSize, (rid, field, size) => {
        if (rid !== reqId) return;
        if (field === 8) t.volume = Number(size);
        // 22/27/29 = call/put open interest depending on side
        if (field === 22 || field === 27 || field === 29) t.open_interest = Number(size);
      });
      addListener(
        EventName.tickOptionComputation,
        (rid, field, /* tickAttrib */ _attr, iv, delta, optPrice, pvDividend, gamma, vega, theta, undPrice) => {
          if (rid !== reqId) return;
          if (iv != null && Number.isFinite(iv)) t.iv = iv;
          if (delta != null && Number.isFinite(delta)) t.delta = delta;
          if (gamma != null && Number.isFinite(gamma)) t.gamma = gamma;
          if (vega != null && Number.isFinite(vega)) t.vega = vega;
          if (theta != null && Number.isFinite(theta)) t.theta = theta;
        },
      );
      addListener(EventName.tickSnapshotEnd, (rid) => {
        if (rid === reqId) resolve();
      });
    },
  });

  return {
    bid: t.bid ?? null,
    ask: t.ask ?? null,
    last: t.last ?? null,
    volume: t.volume ?? null,
    open_interest: t.open_interest ?? null,
    iv: t.iv ?? null,
    delta: t.delta ?? null,
    gamma: t.gamma ?? null,
    vega: t.vega ?? null,
    theta: t.theta ?? null,
  };
}

// --------- IV / HV ----------

export async function fetchIV(symbol, period = 30) {
  // Snapshot quote gets us tick 23 (HV) + 24 (IV) annualized
  const q = await fetchQuote(symbol);

  // 52w IV rank/percentile would require historical IV bars
  // (whatToShow='OPTION_IMPLIED_VOLATILITY'). We fetch ~252 daily bars and compute.
  let ivRank = null;
  let ivPercentile = null;
  try {
    const bars = await fetchHistoricalIV(symbol);
    if (bars.length > 0 && q.iv != null) {
      const closes = bars.map((b) => b.close).filter((v) => Number.isFinite(v) && v > 0);
      if (closes.length > 0) {
        const min = Math.min(...closes);
        const max = Math.max(...closes);
        ivRank = max > min ? (q.iv - min) / (max - min) : null;
        const below = closes.filter((v) => v <= q.iv).length;
        ivPercentile = below / closes.length;
      }
    }
  } catch (err) {
    logger.debug('iv.history_failed', { symbol, msg: err.message });
  }

  const iv = q.iv ?? null;
  const hv = q.hv ?? null;
  const ratio = iv != null && hv != null && hv > 0 ? iv / hv : null;

  return {
    symbol,
    iv_30d: iv,
    hv_30d: hv,
    iv_hv_ratio: ratio,
    iv_rank_52w: ivRank,
    iv_percentile_52w: ivPercentile,
    earnings_date: null, // IB doesn't expose earnings date; fetch from FMP at the worker
    period_days: period,
  };
}

async function fetchHistoricalIV(symbol) {
  const contract = stockContract(symbol);
  const bars = [];
  await reqWithTimeout({
    label: 'reqHistoricalData(IV)',
    timeoutMs: 20_000,
    start: (reqId) =>
      ib.reqHistoricalData(
        reqId,
        contract,
        '',
        '1 Y',
        '1 day',
        'OPTION_IMPLIED_VOLATILITY',
        1,
        1,
        false,
      ),
    cancel: (reqId) => ib.cancelHistoricalData(reqId),
    bind: ({ reqId, addListener, resolve }) => {
      addListener(EventName.historicalData, (rid, time, open, high, low, close) => {
        if (rid !== reqId) return;
        if (typeof time === 'string' && time.startsWith('finished')) {
          resolve();
          return;
        }
        bars.push({ time, close: Number(close), high: Number(high), low: Number(low) });
      });
      addListener(EventName.historicalDataEnd, (rid) => {
        if (rid === reqId) resolve();
      });
    },
  });
  return bars;
}

// --------- helpers ----------

function dteFromYYYYMMDD(yyyymmdd, ref = new Date()) {
  // accept "20260515" or "2026-05-15"
  const s = String(yyyymmdd).replace(/-/g, '');
  if (s.length < 8) return Number.POSITIVE_INFINITY;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const dt = new Date(Date.UTC(y, m, d));
  const refUtc = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  return Math.round((dt - refUtc) / 86_400_000);
}

function formatExpiry(yyyymmdd) {
  const s = String(yyyymmdd).replace(/-/g, '');
  if (s.length !== 8) return yyyymmdd;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i;
      i += 1;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

// --------- exports ----------

export default {
  connect,
  disconnect,
  isConnected,
  getStatus,
  fetchAccountSummary,
  fetchPositions,
  fetchQuote,
  fetchQuotes,
  fetchHistorical,
  fetchOptionChain,
  fetchIV,
};
