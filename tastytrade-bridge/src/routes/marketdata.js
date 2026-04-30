// Market data endpoints — quotes, chains, IV rank.
// Estas son las llamadas que el Worker NO puede hacer directamente porque
// Tastytrade WAF bloquea CF Worker IPs. El bridge actúa de proxy.

import express from "express";
import { ttFetch } from "../tt-client.js";

const router = express.Router();

// GET /marketdata/quote?symbols=SPY,IWM
// Equity quotes. Para opciones (OCC symbols) usar el endpoint /chain.
router.get("/quote", async (req, res) => {
  const symbols = (req.query.symbols || "").split(",").filter(Boolean);
  if (!symbols.length) return res.status(400).json({ error: "symbols required" });
  try {
    // TT: /market-data?symbols=A,B,C  (devuelve array de quotes)
    const data = await ttFetch(`/market-data?symbols=${symbols.map(encodeURIComponent).join(",")}`);
    const out = {};
    for (const item of data?.data?.items || []) {
      out[item.symbol] = {
        bid: item.bid != null ? Number(item.bid) : null,
        ask: item.ask != null ? Number(item.ask) : null,
        mid: item.bid != null && item.ask != null ? (Number(item.bid) + Number(item.ask)) / 2 : null,
        last: item.last != null ? Number(item.last) : null,
        prev_close: item["prev-close"] != null ? Number(item["prev-close"]) : null,
        volume: item.volume != null ? Number(item.volume) : null,
      };
    }
    res.json({ quotes: out, ts: new Date().toISOString() });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /marketdata/chain/:underlying — option chain agrupada por expiry
router.get("/chain/:underlying", async (req, res) => {
  const u = req.params.underlying;
  try {
    const data = await ttFetch(`/option-chains/${encodeURIComponent(u)}/nested`);
    res.json({ chain: data?.data?.items?.[0] || null, ts: new Date().toISOString() });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /marketdata/chain/:underlying/expiration/:date
// Subconjunto del chain para una fecha concreta (formato YYYY-MM-DD).
router.get("/chain/:underlying/expiration/:date", async (req, res) => {
  const { underlying, date } = req.params;
  try {
    const data = await ttFetch(`/option-chains/${encodeURIComponent(underlying)}/nested`);
    const root = data?.data?.items?.[0];
    if (!root) return res.json({ expiration: null });
    const exp = (root.expirations || []).find(e => e["expiration-date"] === date);
    res.json({ expiration: exp || null, ts: new Date().toISOString() });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /marketdata/spread-quote
// Body: { underlying: "IWM", expiration: "2026-05-30", legs: [
//   { type: "put", strike: 270, action: "sell" },
//   { type: "put", strike: 265, action: "buy" }
// ] }
// Devuelve credit/debit del spread (mid + bid + ask) para fishing orders.
router.post("/spread-quote", async (req, res) => {
  const { underlying, expiration, legs } = req.body || {};
  if (!underlying || !expiration || !Array.isArray(legs) || !legs.length) {
    return res.status(400).json({ error: "underlying, expiration, legs[] required" });
  }
  try {
    // 1) Resolver OCC symbols de cada leg
    const chainData = await ttFetch(`/option-chains/${encodeURIComponent(underlying)}/nested`);
    const root = chainData?.data?.items?.[0];
    const exp = (root?.expirations || []).find(e => e["expiration-date"] === expiration);
    if (!exp) return res.status(404).json({ error: `expiration ${expiration} not found in chain` });

    const occSymbols = [];
    const resolvedLegs = [];
    for (const leg of legs) {
      const strikeRow = (exp.strikes || []).find(s => Number(s["strike-price"]) === Number(leg.strike));
      if (!strikeRow) {
        return res.status(404).json({ error: `strike ${leg.strike} not found at ${expiration}` });
      }
      const occ = leg.type === "call" ? strikeRow["call"] : strikeRow["put"];
      if (!occ) return res.status(404).json({ error: `${leg.type} ${leg.strike} not listed` });
      occSymbols.push(occ);
      resolvedLegs.push({ ...leg, occ_symbol: occ });
    }

    // 2) Fetch quotes para los OCC symbols
    const mdata = await ttFetch(`/market-data?symbols=${occSymbols.map(encodeURIComponent).join(",")}`);
    const quoteMap = {};
    for (const item of mdata?.data?.items || []) {
      quoteMap[item.symbol] = {
        bid: item.bid != null ? Number(item.bid) : null,
        ask: item.ask != null ? Number(item.ask) : null,
        last: item.last != null ? Number(item.last) : null,
      };
    }

    // 3) Calcular credit del spread.
    // SELL: cobras el bid (lo que el market maker te da por vender) → contributes +
    // BUY: pagas el ask (lo que pagas por comprar) → contributes -
    // Mid: usar mid de cada leg.
    let bidCredit = 0, askCredit = 0, midCredit = 0;
    const legDetails = [];
    for (const leg of resolvedLegs) {
      const q = quoteMap[leg.occ_symbol] || {};
      const sign = leg.action === "sell" ? 1 : -1;
      const bid = q.bid;
      const ask = q.ask;
      const mid = (bid != null && ask != null) ? (bid + ask) / 2 : null;
      // Si vendemos: contribute = bid * sign (cobras el bid). Si compramos: -ask
      const bidContrib = leg.action === "sell" ? (bid != null ? bid : 0) : -(ask != null ? ask : 0);
      const askContrib = leg.action === "sell" ? (ask != null ? ask : 0) : -(bid != null ? bid : 0);
      const midContrib = mid != null ? sign * mid : 0;
      bidCredit += bidContrib;
      askCredit += askContrib;
      midCredit += midContrib;
      legDetails.push({ ...leg, bid, ask, mid });
    }

    res.json({
      underlying,
      expiration,
      legs: legDetails,
      credit: {
        worst: Math.min(bidCredit, askCredit),  // peor fill (lo que llenarás)
        mid: midCredit,                          // teórico
        best: Math.max(bidCredit, askCredit),    // mejor caso
      },
      ts: new Date().toISOString(),
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /marketdata/iv-rank/:underlying
// Tastytrade `/market-metrics?symbols=X` devuelve IV rank/percentile.
router.get("/iv-rank/:underlying", async (req, res) => {
  const u = req.params.underlying;
  try {
    const data = await ttFetch(`/market-metrics?symbols=${encodeURIComponent(u)}`);
    const item = (data?.data?.items || [])[0];
    if (!item) return res.json({ underlying: u, iv_rank: null, iv_percentile: null });
    res.json({
      underlying: u,
      iv_rank: item["implied-volatility-index-rank"] != null ? Number(item["implied-volatility-index-rank"]) : null,
      iv_percentile: item["implied-volatility-percentile"] != null ? Number(item["implied-volatility-percentile"]) : null,
      iv_index: item["implied-volatility-index"] != null ? Number(item["implied-volatility-index"]) : null,
      iv_5d_change: item["implied-volatility-index-5-day-change"] != null ? Number(item["implied-volatility-index-5-day-change"]) : null,
      hv_30d: item["historical-volatility-30-day"] != null ? Number(item["historical-volatility-30-day"]) : null,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /marketdata/accounts — lista cuentas del usuario
router.get("/accounts", async (req, res) => {
  try {
    const data = await ttFetch("/customers/me/accounts");
    const items = (data?.data?.items || []).map(it => ({
      account_number: it.account?.["account-number"],
      nickname: it.account?.nickname,
      margin_or_cash: it.account?.["margin-or-cash"],
      is_closed: it.account?.["is-closed"],
      opened_at: it.account?.["opened-at"],
    }));
    res.json({ accounts: items });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export default router;
