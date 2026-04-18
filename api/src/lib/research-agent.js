// ═══════════════════════════════════════════════════════════════════════════
// RESEARCH AGENT — Opus with tool use. Multi-step investigation of a ticker
// or question. Design: docs/research-agent-design.md
// ═══════════════════════════════════════════════════════════════════════════
//
// Unlike the 14 one-shot agents that classify, this agent INVESTIGATES.
// Opus decides which tool to call (query D1, read transcript, fetch SEC),
// gets results, iterates until it reaches a verdict. Citable evidence
// required. Hard caps: 15 tool calls, 5 min wall, $3 cost.

import { getTickerNotebook, writeResearchNotebook, appendAgentVerdict, formatNotebookForPrompt } from "./ticker-memory.js";

const MAX_TOOL_CALLS = 15;
const MAX_WALL_TIME_MS = 5 * 60 * 1000;
const MAX_COST_USD = 3.0;

// Opus 4 pricing: $15/M input, $75/M output (stable as of 2026-04).
const COST_PER_INPUT_TOKEN = 15 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 75 / 1_000_000;

// Tool definitions (Anthropic tool-use schema). Each tool has a backend
// implementation in TOOL_HANDLERS below.
const TOOLS = [
  {
    name: "query_agent_insights",
    description: "Lee los insights que los 14 agentes han emitido sobre un ticker en los últimos N días (o todos los tickers si se omite). Uso: ver qué opinan dividend / earnings / trade / insider / analyst_downgrade sobre este ticker hoy. Empieza POR AQUÍ para entender el estado.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Ticker (ej. 'AHRT'). Omitir para scan portfolio-wide." },
        days: { type: "number", description: "Ventana en días (default 7, máx 30)." },
        agent: { type: "string", description: "Filtrar por un agente específico (ej. 'dividend', 'insider', 'trade')." },
      },
    },
  },
  {
    name: "get_fundamentals",
    description: "Snapshot de fundamentales de un ticker: Q+S scores (0-100), TTM FCF/dividendos/coverage, payout ratios, D/EBITDA, rating FMP, insider activity 3m, GuruFocus Value. Úsalo para verificar números citados por los agentes LLM.",
    input_schema: {
      type: "object",
      properties: { ticker: { type: "string" } },
      required: ["ticker"],
    },
  },
  {
    name: "get_long_term_series",
    description: "Serie histórica hasta 30 años (GuruFocus en R2): dividendos/FCF/EPS/revenue por acción anualizado. Incluye yearsOfDivs (streak) y divCuts (lista de años con corte >5%). Útil para verificar claims tipo '43-year streak' o detectar cortes pasados.",
    input_schema: {
      type: "object",
      properties: { ticker: { type: "string" } },
      required: ["ticker"],
    },
  },
  {
    name: "get_transcript_excerpt",
    description: "Devuelve un tramo del transcript más reciente (earnings call). Usa offset para paginar si necesitas el Q&A completo. Retorna chars start-end del content raw. Úsalo cuando los agentes citen algo del management y quieras verificar o ampliar.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        offset: { type: "number", description: "Char offset (default 0)." },
        length: { type: "number", description: "Max chars a devolver (default 5000, máx 15000)." },
      },
      required: ["ticker"],
    },
  },
  {
    name: "query_peer_positions",
    description: "Devuelve tickers peer (mismo sector + rango cap similar) del portfolio. Útil para detectar si un problema del ticker es idiosincrático o sectorial.",
    input_schema: {
      type: "object",
      properties: {
        sector: { type: "string", description: "Ej. 'Real Estate', 'Healthcare', 'Consumer Defensive'." },
        category: { type: "string", description: "Opcional: 'REIT', 'BDC', 'COMPANY'." },
      },
      required: ["sector"],
    },
  },
  {
    name: "query_db",
    description: "Escape hatch: ejecuta una SQL READ-ONLY (SELECT …) contra D1. Útil para cruces que no tienen tool dedicada. Prohibido: INSERT/UPDATE/DELETE/DROP/CREATE (el tool rechaza). Limita a 50 filas por query.",
    input_schema: {
      type: "object",
      properties: { sql: { type: "string", description: "SELECT statement. Se añade LIMIT 50 automáticamente si falta." } },
      required: ["sql"],
    },
  },
  {
    name: "get_sec_filing_body",
    description: "Lee el cuerpo completo (texto) de un SEC filing reciente (8-K, 10-Q, 10-K). A diferencia de sec_filings (solo detecta existencia), este tool descarga el HTML y lo convierte a texto plano. Úsalo cuando quieras LEER lo que dice un 8-K de un evento material, o verificar el lenguaje exacto de un 10-Q. Coste medio: 1 llamada SEC + 1 fetch del documento. Límite 10 000 chars devueltos.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Ticker del portfolio (ej. 'KO', 'AHRT')." },
        formType: { type: "string", description: "Tipo de filing: '8-K', '10-Q', '10-K'. Default '8-K'." },
        limit: { type: "number", description: "Cuántos filings recientes revisar para encontrar el más reciente del formType. Default 1." },
      },
      required: ["ticker"],
    },
  },
  {
    name: "get_price_history",
    description: "Devuelve la serie histórica de precio cierre y dividendos pagados para un ticker. Útil para calcular rentabilidad total en el período, contexto de volatilidad o confirmar si hay un patrón de caída prolongada. Fuente: FMP historical-price-eod/light + D1 dividendos. Trim 50 filas de precio. Coste bajo.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        days: { type: "number", description: "Ventana en días (default 90, máx 365)." },
      },
      required: ["ticker"],
    },
  },
  {
    name: "get_analyst_grades_historical",
    description: "Serie histórica de ratings de analistas (Buy/Hold/Sell) para un ticker, condensada en los últimos 12 meses. Calcula un 'score' = strongBuy*2 + buy - sell - strongSell*2. Muestra cambio del score a 6m y 12m. Úsalo para entender si el consenso de sell-side ha mejorado o deteriorado progresivamente — complementa al agent analyst_downgrade que solo ve 2 puntos en el tiempo. Coste bajo: 1 llamada FMP.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
      },
      required: ["ticker"],
    },
  },
  {
    name: "get_ticker_notebook",
    description: "Lee el NOTEBOOK persistente de un ticker — la memoria que los agentes acumulan entre runs. Incluye: summary (2-3 frases vivas), open_questions (cosas a confirmar), agent_history (últimas verdicts de cada agente), last_research_id/date/verdict. Úsalo para PEERS o para recordar qué dijiste tú mismo en el pasado sobre este ticker o empresas similares. El notebook del ticker actual ya está inyectado en tu system prompt — este tool es para otros.",
    input_schema: {
      type: "object",
      properties: { ticker: { type: "string" } },
      required: ["ticker"],
    },
  },
  {
    name: "finish",
    description: "TERMINA la investigación con veredicto final. Debe citar 3-5 piezas de evidencia concreta (números, transcripts, filings). REQUIRED: preMortem — si este verdict resulta equivocado en 90 días, ¿cuál sería la razón más probable? Esto fuerza a articular riesgos. OPCIONAL: open_questions[] adicionales. Se persiste todo al notebook. No llames finish si te falta claridad — sigue investigando o dictamina NEEDS_HUMAN.",
    input_schema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["ADD", "HOLD", "TRIM", "SELL", "NEEDS_HUMAN", "INSUFFICIENT_DATA"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        summary: { type: "string", description: "1-2 frases en español. Debe resolver la pregunta inicial. Este texto se guardará como summary vivo del ticker." },
        evidence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", description: "tipo de evidencia: 'fundamentals', 'transcript', 'long_term', 'agent_insight', 'peer', 'sec', 'db'" },
              citation: { type: "string", description: "fuente concreta (ej. 'Q3 2025 transcript', 'dividend agent insight id 2577')." },
              snippet: { type: "string", description: "frase o número exacto (≤200 chars)." },
            },
            required: ["type", "citation", "snippet"],
          },
        },
        preMortem: {
          type: "string",
          description: "OBLIGATORIO. 1-2 frases específicas: si este verdict resulta equivocado en 90 días, ¿cuál es la razón más probable? Debe ser un escenario CONCRETO y verificable, no vaguedad. Ej: 'Si CEO recorta div en Q2 2026 pese al plan de reestructuración, este HOLD está mal' o 'Si el contagio Real Estate se intensifica por rate-hike sorpresa, este ADD se deteriora'.",
        },
        openQuestions: {
          type: "array",
          description: "Opcional. 2-5 preguntas ADICIONALES a la pre-mortem, a verificar en el próximo earnings/filing. Ej: '¿Coverage Q1 2026 se recupera ≥1.1x?', '¿CEO reafirmará div en mayo?'.",
          items: { type: "string" },
        },
      },
      required: ["verdict", "confidence", "summary", "evidence", "preMortem"],
    },
  },
];

// ─── Tool implementations ────────────────────────────────────────────────────

async function tool_query_agent_insights(env, { ticker, days = 7, agent }) {
  const dayNum = Math.min(30, Math.max(1, Number(days) || 7));
  const since = new Date(Date.now() - dayNum * 86400000).toISOString().slice(0, 10);
  let sql = "SELECT agent_name, ticker, fecha, severity, title, summary, details, score FROM agent_insights WHERE fecha >= ?";
  const params = [since];
  if (ticker) { sql += " AND ticker = ?"; params.push(ticker); }
  if (agent) { sql += " AND agent_name = ?"; params.push(agent); }
  sql += " ORDER BY fecha DESC, CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END LIMIT 40";
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return results.map(r => ({
    ...r,
    details: r.details ? tryParse(r.details) : {},
  }));
}

async function tool_get_fundamentals(env, { ticker }) {
  if (!ticker) throw new Error("ticker required");
  // Q+S (authoritative TTM)
  const qs = await env.DB.prepare(
    `SELECT ticker, quality_score, safety_score, inputs_json, snapshot_date
     FROM quality_safety_scores WHERE ticker = ? ORDER BY snapshot_date DESC LIMIT 1`
  ).bind(ticker).first();
  // Position
  const pos = await env.DB.prepare(
    `SELECT ticker, name, sector, shares, market_value, avg_price, last_price, pnl_pct, div_ttm, div_yield, yoc, category
     FROM positions WHERE ticker = ? LIMIT 1`
  ).bind(ticker).first();
  // Fundamentals cache (profile + ratios latest)
  const fund = await env.DB.prepare(
    `SELECT profile, rating, ratios, dcf, key_metrics FROM fundamentals WHERE symbol = ? LIMIT 1`
  ).bind(ticker).first();
  // GuruFocus cache
  const gf = await env.DB.prepare(
    `SELECT data FROM gurufocus_cache WHERE ticker = ? LIMIT 1`
  ).bind(ticker).first();

  const out = {
    ticker,
    position: pos || null,
    qs: qs ? {
      qualityScore: qs.quality_score,
      safetyScore: qs.safety_score,
      snapshotDate: qs.snapshot_date,
      inputs: tryParse(qs.inputs_json || "{}"),
    } : null,
    profile: fund?.profile ? tryParse(fund.profile) : null,
    latestRatios: fund?.ratios ? (tryParse(fund.ratios)?.[0] || null) : null,
    rating: fund?.rating ? tryParse(fund.rating) : null,
    dcf: fund?.dcf ? tryParse(fund.dcf) : null,
    gurufocus: gf?.data ? tryParse(gf.data) : null,
  };
  return out;
}

async function tool_get_long_term_series(env, { ticker }) {
  if (!env.EARNINGS_R2) return { error: "R2 not bound" };
  if (!ticker) throw new Error("ticker required");
  try {
    const obj = await env.EARNINGS_R2.get(`docs/${ticker}/gf_financials.json`);
    if (!obj) return { ticker, found: false };
    const doc = JSON.parse(await obj.text());
    const a = doc?.financials?.annuals;
    if (!a) return { ticker, found: false };
    const fy = a["Fiscal Year"] || [];
    const psa = a.per_share_data_array || {};
    const lastNum = (arr, n = 30) => Array.isArray(arr) ? arr.slice(-n).map(v => {
      const num = Number(v);
      return Number.isFinite(num) ? num : null;
    }) : [];
    const years = fy.slice(-30);
    const divs = lastNum(psa["Dividends per Share"], 30);
    const fcf = lastNum(psa["Free Cash Flow per Share"], 30);
    const eps = lastNum(psa["EPS without NRI"], 30);
    const rev = lastNum(psa["Revenue per Share"], 30);
    let yearsOfDivs = 0;
    for (let i = divs.length - 1; i >= 0; i--) {
      if (divs[i] && divs[i] > 0) yearsOfDivs++;
      else if (yearsOfDivs > 0) break;
    }
    const divCuts = [];
    for (let i = 1; i < divs.length; i++) {
      const prev = divs[i - 1], curr = divs[i];
      if (prev && curr && curr < prev * 0.95) divCuts.push(years[i]);
    }
    return { ticker, found: true, years, divs, fcfPerShare: fcf, epsNRI: eps, revPerShare: rev, yearsOfDivs, divCuts };
  } catch (e) {
    return { ticker, error: e.message };
  }
}

async function tool_get_transcript_excerpt(env, { ticker, offset = 0, length = 5000 }) {
  if (!ticker) throw new Error("ticker required");
  const maxLen = Math.min(15000, Math.max(200, Number(length) || 5000));
  const startOffset = Math.max(0, Number(offset) || 0);
  const stripped = ticker.replace(/^(BME:|HKG:|LSE:)/, "");
  const row = await env.DB.prepare(
    `SELECT ticker, quarter, year, date, content FROM earnings_transcripts
     WHERE ticker = ? ORDER BY year DESC, quarter DESC, date DESC LIMIT 1`
  ).bind(stripped).first();
  if (!row) return { ticker, found: false };
  const raw = typeof row.content === "string" ? row.content : "";
  return {
    ticker, found: true,
    quarter: row.quarter, year: row.year, date: row.date,
    totalLength: raw.length,
    offset: startOffset,
    excerpt: raw.slice(startOffset, startOffset + maxLen),
    hasMore: startOffset + maxLen < raw.length,
  };
}

async function tool_query_peer_positions(env, { sector, category }) {
  if (!sector) throw new Error("sector required");
  let sql = `SELECT ticker, name, shares, market_value, pnl_pct, div_yield, category FROM positions WHERE sector = ? AND shares > 0`;
  const params = [sector];
  if (category) { sql += " AND category = ?"; params.push(category); }
  sql += " ORDER BY market_value DESC LIMIT 25";
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return results;
}

async function tool_query_db(env, { sql }) {
  if (!sql || typeof sql !== "string") throw new Error("sql required");
  const trimmed = sql.trim();
  // READ-ONLY guard: only allow SELECT. Defense in depth — D1 binding is
  // read-write but we never want the agent modifying data.
  if (!/^\s*SELECT\b/i.test(trimmed)) throw new Error("only SELECT queries allowed");
  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|ATTACH|DETACH)\b/i.test(trimmed)) {
    throw new Error("mutation keyword detected — rejected");
  }
  // Force LIMIT ≤ 50
  const withLimit = /\bLIMIT\s+\d+/i.test(trimmed) ? trimmed : `${trimmed} LIMIT 50`;
  const { results } = await env.DB.prepare(withLimit).all();
  return results.slice(0, 50);
}

// ─── Helpers for new tools ────────────────────────────────────────────────────

// Normalize ticker for FMP (strip exchange prefix, map known variants)
function toFMPSymbol(ticker) {
  if (!ticker) return ticker;
  // Strip common exchange prefixes used in the portfolio
  const stripped = ticker.replace(/^(BME:|HKG:|LSE:|HGK:)/, "");
  // Map known differences (add more as needed)
  const MAP = { "BRK.B": "BRK-B", "BF.B": "BF-B" };
  return MAP[stripped] || stripped;
}

// Strip HTML tags and normalize whitespace to plain text
function htmlToPlainText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Tool 1: get_sec_filing_body ─────────────────────────────────────────────
async function tool_get_sec_filing_body(env, { ticker, formType = "8-K", limit = 1 }) {
  if (!ticker) return { error: "ticker required" };
  const cleanTicker = ticker.replace(/^(BME:|HKG:|LSE:|HGK:)/, "").toUpperCase();
  const SEC_UA = "A&R Research ontoso@me.com";
  const SEC_HEADERS = { "User-Agent": SEC_UA, "Accept": "application/json" };
  const limitNum = Math.min(5, Math.max(1, Number(limit) || 1));
  const targetForm = (formType || "8-K").toUpperCase();

  try {
    // Step 1: Resolve CIK from agent_memory cache, then company_tickers.json fallback
    let cik = null;
    try {
      const memRow = await env.DB.prepare(
        "SELECT value FROM agent_memory WHERE key = 'sec_cik_cache'"
      ).first();
      if (memRow?.value) {
        const cikMap = JSON.parse(memRow.value);
        cik = cikMap[cleanTicker] || null;
      }
    } catch { /* non-fatal — fall through to EDGAR lookup */ }

    if (!cik) {
      // Fetch the full tickers map from SEC (one-shot, ~1MB)
      const mapResp = await fetch("https://www.sec.gov/files/company_tickers.json", {
        headers: SEC_HEADERS,
      });
      if (!mapResp.ok) return { ticker, found: false, reason: `CIK map fetch failed: ${mapResp.status}` };
      const mapData = await mapResp.json();
      for (const entry of Object.values(mapData)) {
        if (entry?.ticker?.toUpperCase() === cleanTicker && entry?.cik_str != null) {
          cik = String(entry.cik_str).padStart(10, "0");
          break;
        }
      }
    }

    if (!cik) return { ticker, found: false, reason: "CIK not found in SEC EDGAR" };

    // Step 2: Fetch submissions to get recent filings index
    const subUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const subResp = await fetch(subUrl, { headers: SEC_HEADERS });
    if (!subResp.ok) return { ticker, found: false, reason: `submissions fetch failed: ${subResp.status}` };
    const subData = await subResp.json();
    const recent = subData?.filings?.recent || {};
    const forms = recent.form || [];
    const dates = recent.filingDate || [];
    const accessions = recent.accessionNumber || [];
    const primaryDocs = recent.primaryDocument || [];

    // Step 3: Find the most recent filing of the requested formType
    let found = null;
    let checked = 0;
    for (let i = 0; i < forms.length && checked < limitNum * 10; i++) {
      if (forms[i]?.toUpperCase() === targetForm) {
        found = {
          date: dates[i],
          accession: accessions[i],
          primaryDoc: primaryDocs[i],
        };
        checked++;
        if (checked >= limitNum) break;
      }
    }

    if (!found) return { ticker, found: false, reason: `no ${targetForm} filing found in recent submissions` };

    // Step 4: Fetch the primary document (HTML/txt)
    // Accession format from SEC: "0001234567-24-000001" → "0001234567024000001" for URL
    const accNoHyphens = (found.accession || "").replace(/-/g, "");
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accNoHyphens}/${found.primaryDoc}`;
    const docResp = await fetch(docUrl, {
      headers: { "User-Agent": SEC_UA, "Accept": "text/html,text/plain,*/*" },
    });
    if (!docResp.ok) {
      return {
        ticker, found: true, formType: targetForm,
        date: found.date, accession: found.accession, url: docUrl,
        bodyText: null, error: `document fetch failed: ${docResp.status}`,
      };
    }

    const rawHtml = await docResp.text();
    const plain = htmlToPlainText(rawHtml);
    const CHAR_LIMIT = 10000;

    return {
      ticker,
      found: true,
      formType: targetForm,
      date: found.date,
      accession: found.accession,
      url: docUrl,
      fullLength: plain.length,
      bodyText: plain.slice(0, CHAR_LIMIT),
      truncated: plain.length > CHAR_LIMIT,
    };
  } catch (e) {
    return { ticker, error: e.message };
  }
}

// ─── Tool 2: get_price_history ────────────────────────────────────────────────
async function tool_get_price_history(env, { ticker, days = 90 }) {
  if (!ticker) return { error: "ticker required" };
  const periodDays = Math.min(365, Math.max(7, Number(days) || 90));
  const sym = toFMPSymbol(ticker);
  const fromDate = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);

  // Fetch FMP price history
  let prices = [];
  try {
    if (!env.FMP_KEY) return { ticker, error: "FMP_KEY not configured" };
    const url = `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${encodeURIComponent(sym)}&from=${fromDate}&apikey=${env.FMP_KEY}`;
    const resp = await fetch(url);
    if (resp.status === 403 || resp.status === 404) {
      return { ticker, found: false, reason: `FMP returned ${resp.status}` };
    }
    if (!resp.ok) return { ticker, error: `FMP fetch failed: ${resp.status}` };
    const data = await resp.json();
    const arr = Array.isArray(data) ? data : (data?.historical || []);
    // FMP returns newest-first; reverse to chronological
    const sorted = arr.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    // Trim to 50 rows — keep every Nth point if more
    const step = sorted.length > 50 ? Math.ceil(sorted.length / 50) : 1;
    prices = sorted
      .filter((_, i) => i % step === 0)
      .slice(0, 50)
      .map(r => ({ date: r.date, close: r.close ?? r.price ?? null }));
  } catch (e) {
    return { ticker, error: `FMP error: ${e.message}` };
  }

  // Price change %
  let priceChangePct = null;
  if (prices.length >= 2) {
    const first = prices[0].close;
    const last = prices[prices.length - 1].close;
    if (first && last) priceChangePct = Math.round(((last - first) / first) * 10000) / 100;
  }

  // Dividends paid in the period from D1
  let dividends = [];
  let totalDivsPaid = 0;
  try {
    const { results: divRows } = await env.DB.prepare(
      `SELECT fecha, amount_usd FROM dividendos WHERE ticker = ? AND fecha >= ? ORDER BY fecha ASC`
    ).bind(ticker, fromDate).all();
    dividends = (divRows || []).map(r => ({ date: r.fecha, amount_usd: r.amount_usd }));
    totalDivsPaid = dividends.reduce((s, d) => s + (Number(d.amount_usd) || 0), 0);
    totalDivsPaid = Math.round(totalDivsPaid * 100) / 100;
  } catch { /* non-fatal: dividendos table may not have this ticker */ }

  return {
    ticker,
    periodDays,
    fromDate,
    prices,
    priceChangePct,
    dividends,
    totalDivsPaid,
  };
}

// ─── Tool 3: get_analyst_grades_historical ────────────────────────────────────
async function tool_get_analyst_grades_historical(env, { ticker }) {
  if (!ticker) return { error: "ticker required" };
  if (!env.FMP_KEY) return { ticker, error: "FMP_KEY not configured" };
  const sym = toFMPSymbol(ticker);

  try {
    const url = `https://financialmodelingprep.com/stable/grades-historical?symbol=${encodeURIComponent(sym)}&apikey=${env.FMP_KEY}`;
    const resp = await fetch(url);
    if (resp.status === 403 || resp.status === 404) {
      return { ticker, found: false, reason: `FMP returned ${resp.status}` };
    }
    if (!resp.ok) return { ticker, error: `FMP fetch failed: ${resp.status}` };
    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) return { ticker, found: false, reason: "no data from FMP" };

    // Filter to last 12 months
    const cutoff12m = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const filtered = data
      .filter(r => r.date >= cutoff12m)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    // Score = strongBuy*2 + buy - sell - strongSell*2
    const scoreRow = (r) =>
      (Number(r.analystRatingsStrongBuy) || 0) * 2 +
      (Number(r.analystRatingsBuy) || 0) -
      (Number(r.analystRatingsSell) || 0) -
      (Number(r.analystRatingsStrongSell) || 0) * 2;

    const series = filtered.map(r => ({
      date: r.date,
      strongBuy: Number(r.analystRatingsStrongBuy) || 0,
      buy: Number(r.analystRatingsBuy) || 0,
      hold: Number(r.analystRatingsHold) || 0,
      sell: Number(r.analystRatingsSell) || 0,
      strongSell: Number(r.analystRatingsStrongSell) || 0,
      score: scoreRow(r),
    }));

    // Thin to max 24 points (roughly quincenal for a full year)
    const step = series.length > 24 ? Math.ceil(series.length / 24) : 1;
    const thinned = series.filter((_, i) => i % step === 0).slice(0, 24);

    const latestScore = thinned.length ? thinned[thinned.length - 1].score : null;

    // Score change at 6m and 12m horizons
    const cutoff6m = new Date(Date.now() - 182 * 86400000).toISOString().slice(0, 10);
    const pt6m = series.find(r => r.date >= cutoff6m);
    const pt12m = series.length ? series[0] : null;

    const scoreChange6m = (latestScore !== null && pt6m) ? latestScore - pt6m.score : null;
    const scoreChange12m = (latestScore !== null && pt12m) ? latestScore - pt12m.score : null;

    return {
      ticker,
      found: true,
      series: thinned,
      latestScore,
      scoreChange6m,
      scoreChange12m,
    };
  } catch (e) {
    return { ticker, error: e.message };
  }
}

async function tool_get_ticker_notebook(env, { ticker }) {
  if (!ticker) throw new Error("ticker required");
  const nb = await getTickerNotebook(env, ticker);
  if (!nb) return { ticker, found: false };
  return {
    ticker: nb.ticker,
    found: true,
    summary: nb.summary,
    openQuestions: nb.openQuestions,
    agentHistory: nb.agentHistory,
    lastResearch: nb.lastResearchId ? {
      id: nb.lastResearchId,
      date: nb.lastResearchDate,
      verdict: nb.lastResearchVerdict,
    } : null,
    sector: nb.sector,
    updatedAt: nb.updatedAt,
  };
}

const TOOL_HANDLERS = {
  query_agent_insights: tool_query_agent_insights,
  get_fundamentals: tool_get_fundamentals,
  get_long_term_series: tool_get_long_term_series,
  get_transcript_excerpt: tool_get_transcript_excerpt,
  query_peer_positions: tool_query_peer_positions,
  query_db: tool_query_db,
  get_sec_filing_body: tool_get_sec_filing_body,
  get_price_history: tool_get_price_history,
  get_analyst_grades_historical: tool_get_analyst_grades_historical,
  get_ticker_notebook: tool_get_ticker_notebook,
};

// ─── Orchestrator ────────────────────────────────────────────────────────────

function tryParse(s) { try { return JSON.parse(s); } catch { return null; } }

function truncateForModel(obj, maxChars = 4000) {
  const s = typeof obj === "string" ? obj : JSON.stringify(obj);
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + `\n… [truncated ${s.length - maxChars} chars]`;
}

// ─── Red Team pass — captures over-confidence on high-conviction verdicts ───
// Second Opus call that argues the COUNTER-case and decides whether to confirm,
// downgrade confidence, or change the verdict outright. ~$0.15-0.25 extra per
// high-conviction investigation. Applied only when confidence='high' and
// verdict in {ADD, TRIM, SELL} (HOLD / NEEDS_HUMAN / INSUFFICIENT_DATA skip).
async function runRedTeamPass(env, { ticker, question, verdict, summary, evidence, toolCallSummaries }) {
  const system = `Eres un red-team analyst revisando una recomendación HIGH CONVICTION emitida por otro agente sobre el ticker ${ticker}. Tu trabajo: encontrar lo que se le escapó.

El agente concluyó: ${verdict.verdict} ${verdict.confidence}.
Summary del agente: ${summary}

Evidencia citada (${evidence.length} piezas):
${evidence.map((e, i) => `${i + 1}. [${e.type}] ${e.citation}: "${e.snippet}"`).join('\n')}

Resumen de los tools que el agente consultó (en orden):
${toolCallSummaries}

PREGUNTA ORIGINAL: ${question}

Revisa CRÍTICAMENTE, como si fueras el humano que va a ejecutar la recomendación:
1. ¿La evidencia realmente soporta el verdict, o el agente está cherry-picking?
2. ¿Hay interpretaciones alternativas (un contra-factor) que no se mencionaron?
3. ¿Los números citados están en contexto (vs peers, vs historia, vs guidance)?
4. ¿El agente asumió que X seguirá, cuando X podría revertirse?
5. ¿Falta alguna tool que debería haber llamado (p.ej. SEC filing, analyst grades, peer comparison)?

Responde SÓLO JSON:
{
  "assessment": "confirmed" | "downgrade_confidence" | "change_verdict",
  "newVerdict": "ADD" | "HOLD" | "TRIM" | "SELL" | null,
  "strongestCounter": "1-2 frases del mejor contra-argumento encontrado",
  "reason": "1-2 frases explicando tu decisión"
}

Reglas:
- confirmed = evidencia sólida, no encuentras contra fuerte. Acepta.
- downgrade_confidence = hay dudas razonables pero el verdict sigue siendo el más probable.
- change_verdict = el contra-argumento es CLARAMENTE más fuerte que lo presentado.
- NO des el beneficio de la duda. Asume que el agente fue demasiado confiado.
- Si change_verdict, newVerdict debe ser el nuevo veredicto (uno de ADD/HOLD/TRIM/SELL).`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-20250514",
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: "Procede con la revisión." }],
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Red Team API ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  const raw = data.content?.[0]?.text || "";
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch { parsed = { assessment: "confirmed", strongestCounter: "Red Team parse failed", reason: raw.slice(0, 200) }; }
  return {
    ...parsed,
    usage: data.usage,
    cost_usd:
      (data.usage?.input_tokens || 0) * COST_PER_INPUT_TOKEN +
      (data.usage?.output_tokens || 0) * COST_PER_OUTPUT_TOKEN,
  };
}

async function callAnthropicToolUse(env, messages, opts = {}) {
  const body = {
    model: opts.model || "claude-opus-4-20250514",
    max_tokens: opts.maxTokens || 4096,
    system: opts.system,
    tools: TOOLS,
    messages,
  };
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${txt.slice(0, 300)}`);
  }
  return resp.json();
}

export async function runResearchAgent(env, { ticker, question, triggerReason = "manual" }) {
  const t0 = Date.now();
  const investigation = {
    ticker: ticker || null,
    question: question || null,
    trigger_reason: triggerReason,
    tool_calls: [],
    total_tokens_in: 0,
    total_tokens_out: 0,
    cost_usd: 0,
  };

  // Insert started_at row — we'll update on finish.
  const insertRes = await env.DB.prepare(
    `INSERT INTO research_investigations (ticker, question, trigger_reason, started_at)
     VALUES (?, ?, ?, datetime('now')) RETURNING id`
  ).bind(investigation.ticker, investigation.question, triggerReason).first();
  const investigationId = insertRes?.id;

  // Load existing notebook for this ticker — ends the agent's amnesia.
  // Contains: summary (2-3 frases vivas), openQuestions (cosas a verificar),
  // agentHistory (últimas verdicts de cada agente LLM + self), lastResearch.
  const tickerNotebook = ticker ? await getTickerNotebook(env, ticker) : null;

  const notebookContext = tickerNotebook ? `

NOTEBOOK PERSISTENTE DE ${ticker} (memoria acumulada entre runs):
Summary: ${tickerNotebook.summary || '(sin summary previa)'}
Última investigación Research: ${tickerNotebook.lastResearchVerdict || 'ninguna'} ${tickerNotebook.lastResearchDate ? `(${tickerNotebook.lastResearchDate})` : ''}
Open questions: ${(tickerNotebook.openQuestions || []).slice(0, 5).map(q => `• ${q}`).join(' ') || '(ninguna)'}
Últimas verdicts por agente:
${['dividend', 'earnings', 'trade', 'research'].map(a => {
  const hist = tickerNotebook.agentHistory?.[a];
  if (!hist || !hist.length) return '';
  return `  ${a}: ${hist.slice(0, 4).map(h => `${h.fecha.slice(5)}=${h.verdict || h.severity}`).join(' → ')}`;
}).filter(Boolean).join('\n')}

Usa esta memoria: si estás repitiendo una investigación reciente, DEBES añadir contexto nuevo (datos frescos, cambios desde la última verdict) en vez de rehacer el análisis. Si las open_questions previas ya tienen respuesta → cítalo en evidence. Si sigues sin datos para responderlas → mantén ese contexto en tu nueva openQuestions.` : '';

  const system = `Eres un analista senior de equity haciendo due diligence sobre una empresa en un portfolio de dividendos long-term (China fiscal resident, buy-and-hold, goal = ingresos crecientes por décadas).

TIENES ACCESO A TOOLS. Úsalos. Piensa en cada paso: ¿qué dato me falta? ¿qué tool me lo da más barato?

Heurística de coste (de más barato a más caro):
  query_agent_insights < get_ticker_notebook < get_fundamentals < get_long_term_series < get_price_history < get_analyst_grades_historical < query_peer_positions < query_db < get_transcript_excerpt < get_sec_filing_body

Empieza SIEMPRE por query_agent_insights para ver qué han dicho los agentes hoy. Luego pivota hacia la pregunta concreta. Para peers, usa get_ticker_notebook sobre sus tickers.

Reglas:
- Máximo ${MAX_TOOL_CALLS} tool calls. Presupuesto $${MAX_COST_USD}. No desperdicies llamadas.
- Cita evidencia concreta: números, fechas, frases. Nada de vaguedades.
- Si los datos no alcanzan para decidir → finish() con verdict NEEDS_HUMAN o INSUFFICIENT_DATA.
- El veredicto debe resolver la pregunta inicial, no ser un essay.
- SELL es raro. ADD/HOLD/TRIM deberían cubrir 95% de los casos. SELL sólo si negocio roto permanentemente O dividendo eliminado.

finish() ahora requiere DOS campos de calibración adicionales:
1. **preMortem** (OBLIGATORIO): antes de ejecutar tu verdict, imagina que en 90 días resulta equivocado. ¿Cuál es la razón MÁS probable? Escribe 1-2 frases de un escenario CONCRETO y verificable. Esto evita el sesgo de confirmation — fuerza a articular qué señales invalidarían tu propia conclusión. Ej:
   - "Si rate-hike sorpresa Q2 dispara contagio REIT, este HOLD se deteriora"
   - "Si management reafirma div pese a coverage 0.3x, mi TRIM es prematuro"
2. **openQuestions** (opcional): 2-5 preguntas adicionales a verificar en el próximo earnings/filing. Así la PRÓXIMA investigación sabe qué testear.${notebookContext}`;

  const initialUserContent = ticker
    ? `TICKER: ${ticker}\nPREGUNTA: ${question || `¿Cuál es el veredicto actualizado sobre ${ticker} dadas las señales de hoy?`}`
    : `PREGUNTA: ${question}`;

  const messages = [{ role: "user", content: initialUserContent }];

  let finishResult = null;
  let iterations = 0;
  let stopReason = null;

  try {
    while (iterations < MAX_TOOL_CALLS + 1) {
      if (Date.now() - t0 > MAX_WALL_TIME_MS) {
        stopReason = "wall_time_exceeded";
        break;
      }
      if (investigation.cost_usd > MAX_COST_USD) {
        stopReason = "cost_cap_exceeded";
        break;
      }

      const resp = await callAnthropicToolUse(env, messages, { system });

      investigation.total_tokens_in += resp.usage?.input_tokens || 0;
      investigation.total_tokens_out += resp.usage?.output_tokens || 0;
      investigation.cost_usd =
        investigation.total_tokens_in * COST_PER_INPUT_TOKEN +
        investigation.total_tokens_out * COST_PER_OUTPUT_TOKEN;

      if (resp.stop_reason === "end_turn") {
        stopReason = "end_turn_without_finish";
        break;
      }
      if (resp.stop_reason !== "tool_use") {
        stopReason = `unexpected_stop_${resp.stop_reason}`;
        break;
      }

      // Push assistant message (contains tool_use blocks) as-is.
      messages.push({ role: "assistant", content: resp.content });

      // Execute every tool_use block in this response.
      const toolResults = [];
      let finishCalled = false;

      for (const block of resp.content) {
        if (block.type !== "tool_use") continue;
        iterations++;

        if (block.name === "finish") {
          finishResult = block.input;
          finishCalled = true;
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ ok: true }),
          });
          break;
        }

        const handler = TOOL_HANDLERS[block.name];
        let result;
        try {
          if (!handler) throw new Error(`unknown tool: ${block.name}`);
          result = await handler(env, block.input || {});
        } catch (e) {
          result = { error: e.message };
        }

        const payload = truncateForModel(result);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: payload,
        });

        investigation.tool_calls.push({
          tool: block.name,
          args: block.input,
          resultPreview: payload.slice(0, 300),
          iteration: iterations,
        });

        if (iterations >= MAX_TOOL_CALLS) break;
      }

      messages.push({ role: "user", content: toolResults });

      if (finishCalled) {
        stopReason = "finished";
        break;
      }
      if (iterations >= MAX_TOOL_CALLS) {
        stopReason = "tool_call_cap_exceeded";
        break;
      }
    }
  } catch (e) {
    stopReason = `error: ${e.message}`;
  }

  const duration_s = (Date.now() - t0) / 1000;

  // ── Red Team pass — captura over-confidence en verdicts high ─────────────
  // Solo corre si: verdict es high + accionable (ADD/TRIM/SELL) + hay evidencia.
  // HOLD / NEEDS_HUMAN / INSUFFICIENT_DATA no necesitan red-team (no mueven capital).
  let redTeamAssessment = null;
  const ACTIONABLE = ["ADD", "TRIM", "SELL"];
  if (finishResult?.verdict && finishResult?.confidence === "high"
      && ACTIONABLE.includes(finishResult.verdict)
      && Array.isArray(finishResult.evidence) && finishResult.evidence.length > 0
      && ticker) {
    try {
      const toolCallSummaries = investigation.tool_calls
        .slice(0, 10)
        .map((t, i) => `${i + 1}. ${t.tool}(${JSON.stringify(t.args).slice(0, 60)}) → ${t.resultPreview.slice(0, 120)}`)
        .join("\n");
      const rt = await runRedTeamPass(env, {
        ticker,
        question: question || "actualizar verdict",
        verdict: finishResult,
        summary: finishResult.summary,
        evidence: finishResult.evidence,
        toolCallSummaries,
      });
      redTeamAssessment = rt;
      // Apply Red Team's judgment — 3 outcomes:
      if (rt.assessment === "change_verdict" && ACTIONABLE.concat(["HOLD"]).includes(rt.newVerdict)) {
        finishResult.verdict = rt.newVerdict;
        finishResult.confidence = "medium";
        finishResult.summary = `[Red Team: ${(rt.strongestCounter || rt.reason || "").slice(0, 180)}] ${finishResult.summary}`;
      } else if (rt.assessment === "downgrade_confidence") {
        finishResult.confidence = "medium";
        finishResult.summary = `[Red Team cauteloso: ${(rt.strongestCounter || rt.reason || "").slice(0, 120)}] ${finishResult.summary}`;
      }
      // else: "confirmed" — no change
      // Add RT cost to total
      if (rt.cost_usd) {
        investigation.cost_usd += rt.cost_usd;
        investigation.total_tokens_in += rt.usage?.input_tokens || 0;
        investigation.total_tokens_out += rt.usage?.output_tokens || 0;
      }
    } catch (e) {
      console.error("[Research] Red Team failed:", e.message);
    }
  }

  const outcome = {
    investigationId,
    ticker: investigation.ticker,
    question: investigation.question,
    stopReason,
    iterations,
    duration_s: Math.round(duration_s * 10) / 10,
    cost_usd: Math.round(investigation.cost_usd * 10000) / 10000,
    tokens_in: investigation.total_tokens_in,
    tokens_out: investigation.total_tokens_out,
    tool_calls: investigation.tool_calls,
    verdict: finishResult?.verdict || null,
    confidence: finishResult?.confidence || null,
    summary: finishResult?.summary || null,
    evidence: finishResult?.evidence || [],
    preMortem: finishResult?.preMortem || null,
    openQuestions: finishResult?.openQuestions || [],
    redTeam: redTeamAssessment ? {
      assessment: redTeamAssessment.assessment,
      newVerdict: redTeamAssessment.newVerdict,
      strongestCounter: redTeamAssessment.strongestCounter,
      reason: redTeamAssessment.reason,
      cost_usd: redTeamAssessment.cost_usd,
    } : null,
  };

  // Persist ticker_notebook (memory for future runs) BEFORE persisting the
  // investigation row, so even if the investigation write fails, the notebook
  // still has the new verdict for subsequent queries.
  if (ticker && finishResult?.verdict) {
    try {
      const fecha = new Date().toISOString().slice(0, 10);
      // Load sector for persistence (first notebook write for a ticker stamps it)
      let sector = tickerNotebook?.sector;
      if (!sector) {
        const posRow = await env.DB.prepare(
          "SELECT sector FROM positions WHERE ticker = ? LIMIT 1"
        ).bind(ticker).first();
        sector = posRow?.sector || null;
      }
      // Prepend preMortem as first open_question — it's the most important
      // forward test (what would invalidate this verdict).
      const combinedQuestions = [];
      if (finishResult.preMortem) {
        combinedQuestions.push(`[PRE-MORTEM] ${finishResult.preMortem}`);
      }
      if (Array.isArray(finishResult.openQuestions)) {
        combinedQuestions.push(...finishResult.openQuestions);
      }
      await writeResearchNotebook(env, ticker, {
        researchId: investigationId,
        verdict: finishResult.verdict,
        summary: finishResult.summary,
        openQuestions: combinedQuestions,
        fecha,
        sector,
      });
      await appendAgentVerdict(env, ticker, "research", {
        verdict: finishResult.verdict,
        severity: finishResult.confidence === "high" ? "critical" : finishResult.confidence === "medium" ? "warning" : "info",
        brief: finishResult.summary,
        fecha,
        sector,
      });
    } catch (e) {
      console.error("[Research] notebook persist failed:", e.message);
    }
  }

  // Persist to D1
  try {
    await env.DB.prepare(
      `UPDATE research_investigations SET
         finished_at = datetime('now'),
         duration_s = ?,
         tool_calls_json = ?,
         total_tool_calls = ?,
         total_tokens_in = ?,
         total_tokens_out = ?,
         cost_usd = ?,
         final_verdict = ?,
         confidence = ?,
         summary = ?,
         evidence_json = ?,
         full_response = ?,
         error = ?
       WHERE id = ?`
    ).bind(
      outcome.duration_s,
      JSON.stringify(outcome.tool_calls).slice(0, 100_000),
      outcome.iterations,
      outcome.tokens_in,
      outcome.tokens_out,
      outcome.cost_usd,
      outcome.verdict,
      outcome.confidence,
      outcome.summary,
      JSON.stringify(outcome.evidence).slice(0, 10_000),
      JSON.stringify({ stopReason, messages: messages.length, redTeam: redTeamAssessment }),
      outcome.verdict ? null : outcome.stopReason,
      investigationId
    ).run();
  } catch (e) {
    console.error("[Research] persist failed:", e.message);
  }

  return outcome;
}

// ─── Auto-trigger: detectContradictions ──────────────────────────────────────
// Post-cron scanner que busca patrones "worth investigating" y los rankea.
// Concepto: los 14 agentes clasifican. El Research Agent investiga. Este
// detector es el puente — decide CUÁNDO activar la investigación sin gastar
// $$ en casos rutinarios. Returns array of candidates ordenados por score.

export async function detectContradictions(env, fecha) {
  fecha = fecha || new Date().toISOString().slice(0, 10);
  const { results: insights } = await env.DB.prepare(
    `SELECT agent_name, ticker, severity, title, summary, score, details
     FROM agent_insights WHERE fecha = ?`
  ).bind(fecha).all();

  // Index por ticker
  const byTicker = {};
  for (const i of insights) {
    if (!i.ticker || i.ticker.startsWith("_")) continue;
    if (!byTicker[i.ticker]) byTicker[i.ticker] = [];
    byTicker[i.ticker].push({
      ...i,
      details: (() => { try { return JSON.parse(i.details || "{}"); } catch { return {}; } })(),
    });
  }

  const candidates = [];

  for (const [ticker, arr] of Object.entries(byTicker)) {
    const byAgent = {};
    for (const i of arr) byAgent[i.agent_name] = i;

    let score = 0;
    const reasons = [];

    // Rule 1: dividend=critical + insider bullish (cluster_buys or buys > sells)
    const div = byAgent.dividend;
    const ins = byAgent.insider;
    if (div?.severity === "critical" && ins) {
      const insDet = ins.details || {};
      const buys = Number(insDet.buys3m || insDet.insiderBuys3m || 0);
      const sells = Number(insDet.sells3m || insDet.insiderSells3m || 0);
      // Match EN and ES title patterns: "cluster buy", "collective buy",
      // "Compra colectiva", "Compra masiva", "Insider buys"
      const bullishTitle = /cluster|insider\s+buy|colectiva|compra\s+masiva|bulk\s+buy/i.test(ins.title || "");
      const isBullish = (ins.severity === "info" || ins.severity === "warning") && (buys > sells || bullishTitle);
      if (isBullish || buys > sells) {
        score += 5;
        reasons.push("dividend crítico con insiders comprando");
      }
    }

    // Rule 2: trade=SELL/TRIM + value=ADD (contradicción entre asesor y screener de valor)
    const trade = byAgent.trade;
    const value = byAgent.value;
    if (trade && value) {
      const tradeAct = trade.details?.action;
      if ((tradeAct === "SELL" || tradeAct === "TRIM") && value.title?.startsWith("ADD")) {
        score += 4;
        reasons.push(`trade dice ${tradeAct} pero value dice ADD`);
      }
    }

    // Rule 3: dividend_cut_warning + analyst_downgrade coinciden
    const cw = byAgent.dividend_cut_warning;
    const ad = byAgent.analyst_downgrade;
    if (cw?.severity === "critical" && ad?.severity === "critical") {
      score += 3;
      reasons.push("cut warning + downgrade cluster coinciden");
    }

    // Rule 4: 3+ agentes flagged critical sobre el mismo ticker
    const criticals = arr.filter(i => i.severity === "critical").length;
    if (criticals >= 3) {
      score += 3;
      reasons.push(`${criticals} agentes críticos`);
    }

    // Rule 5: earnings=critical pero trade=HOLD/ADD (earnings miss no convence al trade)
    const earn = byAgent.earnings;
    if (earn?.severity === "critical" && trade?.details?.action && ["HOLD", "ADD"].includes(trade.details.action)) {
      score += 2;
      reasons.push("earnings crítico pero trade HOLD/ADD");
    }

    if (score >= 3) {
      // Build auto-question from the reasons
      const question = `Contradicción detectada hoy: ${reasons.join(" · ")}. Investiga si el veredicto correcto es SELL/TRIM o si hay contexto (management plan, historia) que recomiende HOLD/ADD.`;
      candidates.push({ ticker, score, reasons, question });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// ─── Auto-run: corre Research Agent sobre los top N candidatos ───────────────
// Guardado en agent_memory: research_last_auto_scan_date + count investigated.
// Respeta cap diario (default 3) y dedup 7 días: si un ticker ya tiene
// investigación reciente, se salta.

export async function runAutoInvestigations(env, { fecha, maxPerDay = 3 } = {}) {
  fecha = fecha || new Date().toISOString().slice(0, 10);

  // Cap: si ya corrimos hoy, no relanzar
  const prev = await env.DB.prepare(
    "SELECT data FROM agent_memory WHERE id = 'research_auto_scan'"
  ).first();
  const prevData = prev?.data ? (() => { try { return JSON.parse(prev.data); } catch { return {}; } })() : {};
  if (prevData.fecha === fecha && (prevData.investigations || 0) >= maxPerDay) {
    return { skipped: true, reason: "already_ran_today", prevData };
  }

  const candidates = await detectContradictions(env, fecha);

  // Dedup: excluir tickers con investigación en los últimos 7 días
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { results: recent } = await env.DB.prepare(
    "SELECT DISTINCT ticker FROM research_investigations WHERE started_at >= ?"
  ).bind(sevenAgo).all();
  const investigatedSet = new Set((recent || []).map(r => r.ticker).filter(Boolean));

  const toInvestigate = candidates
    .filter(c => !investigatedSet.has(c.ticker))
    .slice(0, maxPerDay);

  const results = [];
  for (const c of toInvestigate) {
    try {
      const outcome = await runResearchAgent(env, {
        ticker: c.ticker,
        question: c.question,
        triggerReason: "auto_contradiction",
      });
      results.push({
        ticker: c.ticker,
        score: c.score,
        reasons: c.reasons,
        investigationId: outcome.investigationId,
        verdict: outcome.verdict,
        confidence: outcome.confidence,
        cost_usd: outcome.cost_usd,
        stopReason: outcome.stopReason,
      });
    } catch (e) {
      results.push({ ticker: c.ticker, error: e.message });
    }
  }

  // Persist scan state
  try {
    await env.DB.prepare(
      `INSERT INTO agent_memory (id, data) VALUES ('research_auto_scan', ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`
    ).bind(JSON.stringify({
      fecha,
      scannedCandidates: candidates.length,
      investigations: results.length,
      totalCost: results.reduce((s, r) => s + (r.cost_usd || 0), 0),
      ran_at: new Date().toISOString(),
    })).run();
  } catch (e) {
    console.error("[Research auto-scan] persist failed:", e.message);
  }

  return {
    fecha,
    scanned: candidates.length,
    deduped: candidates.length - toInvestigate.length,
    investigated: results.length,
    totalCost: results.reduce((s, r) => s + (r.cost_usd || 0), 0),
    results,
  };
}
