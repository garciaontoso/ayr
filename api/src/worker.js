// ═══════════════════════════════════════════════════════════════
// A&R API Worker v6 — Cloudflare D1
// v6: +6 FMP endpoints (rating, DCF, estimates, price targets, key metrics, financial growth)
// Endpoints REST para la app financiera
// ═══════════════════════════════════════════════════════════════

import { SPANISH_FUNDS_1S2025 } from './data/spanish_funds.js';

// Mapping from our tickers to FMP symbols (foreign tickers need exchange suffix)
// CRITICAL: bare "ENG" on FMP = ENGlobal Corp (wrong!), "RAND" = Rand Capital (wrong!)
const FMP_MAP = {
  "BME:VIS": "VIS.MC", "BME:AMS": "AMS.MC",
  "HKG:9618": "9618.HK", "HKG:1052": "1052.HK", "HKG:2219": "2219.HK",
  "HKG:9616": "9616.HK", "HKG:1910": "1910.HK",
  "FDJU": "FDJ.PA", "HEN3": "HEN3.DE",
  "LSEG": "LSEG.L", "ITRK": "ITRK.L",
  "ENG": "ENG.MC",       // Enagas (Spain), NOT ENGlobal Corp
  "AZJ": "AZJ.AX", "GQG": "GQG.AX",
  "WKL": "WKL.AS",
  "SHUR": "SHUR.BR",     // Shurgard (Euronext Brussels) — was wrongly SHUR.AS
  "RAND": "RAND.AS",     // Randstad (Netherlands), NOT Rand Capital
  "NET.UN": "NET-UN.V",  // Canadian Net REIT (TSX Venture) — was wrongly NET-UN.TO
  "CNSWF": "CNSWF",
};
// Helper: convert our ticker to FMP symbol
const toFMP = (t) => FMP_MAP[t] || t;
// Helper: reverse-map FMP symbol back to our ticker
const FMP_REVERSE = Object.fromEntries(Object.entries(FMP_MAP).map(([k, v]) => [v, k]));
const fromFMP = (fmpSym) => FMP_REVERSE[fmpSym] || fmpSym;

// Asset managers, BDCs, and partnerships that distribute from carry/NII/distributable
// earnings rather than free cash flow. The FCF-payout penalty in Safety scoring
// produces false positives for these because their distribution model is structurally
// different from traditional dividend payers. Q+S Safety should treat them with the
// same care as REITs (which are already carved out by sector).
const FCF_PAYOUT_CARVEOUT = new Set([
  // Public-equity asset managers / partnerships (carry-driven)
  "BX",   // Blackstone
  "KKR",  // KKR
  "BAM",  // Brookfield Asset Management
  "ARES", // Ares Management
  "APO",  // Apollo Global
  "CG",   // Carlyle
  "TPG",  // TPG
  "OWL",  // Blue Owl
  "GQG",  // GQG Partners
  "BEN",  // Franklin Resources
  // BDCs (distribute net investment income)
  "OBDC", // Blue Owl Capital Corp
  "MSDL", // Morgan Stanley Direct Lending
  "ARCC", // Ares Capital
  "MAIN", // Main Street Capital
  "BIZD", // BDC ETF
  // MLPs and partnerships (distribute from DCF, not FCF)
  "EPD",  // Enterprise Products Partners
  "ET",   // Energy Transfer
  "MPLX", // MPLX
  "OKE",  // Oneok (technically C-corp now but legacy)
]);

// Currency map for international tickers (FMP /quote doesn't return currency)
const CURRENCY_MAP = {
  "BME:VIS": "EUR", "BME:AMS": "EUR", "ENG": "EUR", "WKL": "EUR",
  "SHUR": "EUR", "RAND": "EUR", "FDJU": "EUR", "HEN3": "EUR",
  "HKG:9618": "HKD", "HKG:1052": "HKD", "HKG:2219": "HKD",
  "HKG:9616": "HKD", "HKG:1910": "HKD",
  "AZJ": "AUD", "GQG": "AUD",
  "ITRK": "GBp", "LSEG": "GBp",  // London quotes in pence (GBp)
  "NET.UN": "CAD",
};

// ─── FMP batch quote helper (FMP Ultimate /stable/batch-quote) ─
// Returns map keyed by OUR ticker
async function fmpQuote(tickers, env) {
  if (!tickers?.length) return {};
  const FMP_KEY = env.FMP_KEY;
  if (!FMP_KEY) return {};
  const result = {};
  // Stable batch-quote accepts comma-separated symbols in ?symbols=
  for (let i = 0; i < tickers.length; i += 50) {
    const batch = tickers.slice(i, i + 50);
    const fmpToOurs = {};
    const fmpSyms = batch.map(t => {
      const f = toFMP(t);
      fmpToOurs[f] = t;
      return f;
    });
    try {
      const url = `https://financialmodelingprep.com/stable/batch-quote?symbols=${fmpSyms.map(encodeURIComponent).join(',')}&apikey=${FMP_KEY}`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data)) continue;
      for (const q of data) {
        const ourTicker = fmpToOurs[q.symbol] || fromFMP(q.symbol) || q.symbol;
        result[ourTicker] = q;
      }
    } catch (e) { /* batch failed, continue */ }
  }
  return result;
}

// FMP-derived risk metrics (replaces GuruFocus beta/volatility/sharpe/sortino/maxDrawdown).
// Calculates from 1y daily closes vs SPY benchmark. Returns null if no data.
// Uses /stable/historical-price-eod/light for the same low-bandwidth payload as fmpSpark.
async function fmpRiskMetrics(ticker, env, spyCloses = null) {
  const FMP_KEY = env.FMP_KEY;
  if (!FMP_KEY) return null;
  const sym = toFMP(ticker);
  const fromDate = new Date(Date.now() - 380 * 86400000).toISOString().slice(0, 10);
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${encodeURIComponent(sym)}&from=${fromDate}&apikey=${FMP_KEY}`
    );
    if (!r.ok) return null;
    const data = await r.json();
    const arr = Array.isArray(data) ? data : (data?.historical || []);
    if (arr.length < 60) return null;
    // Sort chronological
    const sorted = [...arr].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const closes = sorted.map(h => h.close ?? h.price).filter(v => v != null && !isNaN(v));
    if (closes.length < 60) return null;

    // Daily returns
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }

    // Annualized volatility (std dev × √252)
    const meanRet = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const volatility1y = stdDev * Math.sqrt(252);

    // Annualized return (geometric)
    const totalReturn = closes[closes.length - 1] / closes[0] - 1;
    const annualReturn = (1 + totalReturn) ** (252 / returns.length) - 1;

    // Sharpe ratio (assume risk-free 4.5%)
    const RF = 0.045;
    const sharpe = volatility1y > 0 ? (annualReturn - RF) / volatility1y : null;

    // Sortino ratio (downside-only deviation)
    const downsideReturns = returns.filter(r => r < 0);
    const downsideStd = downsideReturns.length
      ? Math.sqrt(downsideReturns.reduce((s, r) => s + r ** 2, 0) / downsideReturns.length) * Math.sqrt(252)
      : 0;
    const sortino = downsideStd > 0 ? (annualReturn - RF) / downsideStd : null;

    // Max drawdown (rolling peak)
    let peak = closes[0];
    let maxDD = 0;
    for (const c of closes) {
      if (c > peak) peak = c;
      const dd = (c - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }
    const maxDrawdown1y = Math.abs(maxDD);

    // Beta vs SPY (if benchmark closes provided)
    let beta = null;
    if (Array.isArray(spyCloses) && spyCloses.length >= returns.length + 1) {
      // Align to last N returns
      const benchSlice = spyCloses.slice(-(returns.length + 1));
      const benchReturns = [];
      for (let i = 1; i < benchSlice.length; i++) {
        benchReturns.push((benchSlice[i] - benchSlice[i - 1]) / benchSlice[i - 1]);
      }
      if (benchReturns.length === returns.length) {
        const meanB = benchReturns.reduce((s, r) => s + r, 0) / benchReturns.length;
        let cov = 0, varB = 0;
        for (let i = 0; i < returns.length; i++) {
          cov += (returns[i] - meanRet) * (benchReturns[i] - meanB);
          varB += (benchReturns[i] - meanB) ** 2;
        }
        beta = varB > 0 ? cov / varB : null;
      }
    }

    return {
      beta: beta != null ? Math.round(beta * 100) / 100 : null,
      volatility1y: Math.round(volatility1y * 10000) / 100, // % annualized
      sharpe: sharpe != null ? Math.round(sharpe * 100) / 100 : null,
      sortino: sortino != null ? Math.round(sortino * 100) / 100 : null,
      maxDrawdown1y: Math.round(maxDrawdown1y * 10000) / 100, // % positive
      annualReturn: Math.round(annualReturn * 10000) / 100,
    };
  } catch (e) {
    return null;
  }
}

// Fetch SPY closes for beta calculation (1 call, reused across portfolio)
async function fmpSpyCloses(env, days = 380) {
  const FMP_KEY = env.FMP_KEY;
  if (!FMP_KEY) return null;
  const fromDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=SPY&from=${fromDate}&apikey=${FMP_KEY}`
    );
    if (!r.ok) return null;
    const data = await r.json();
    const arr = Array.isArray(data) ? data : (data?.historical || []);
    const sorted = [...arr].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return sorted.map(h => h.close ?? h.price).filter(v => v != null && !isNaN(v));
  } catch { return null; }
}

// Cache risk metrics for all portfolio positions in agent_memory.risk_metrics
async function cacheRiskMetrics(env, opts = {}) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { cached: 0, total: 0 };
  const offset = opts.offset || 0;
  const limit = opts.limit || 0;
  const sliced = limit > 0 ? positions.slice(offset, offset + limit) : positions;

  // Fetch SPY benchmark once
  const spyCloses = await fmpSpyCloses(env);

  const map = (await getAgentMemory(env, "risk_metrics")) || {};
  let cached = 0, failed = 0;
  for (let i = 0; i < sliced.length; i += 4) {
    const batch = sliced.slice(i, i + 4);
    const results = await Promise.all(batch.map(p => fmpRiskMetrics(p.ticker, env, spyCloses)));
    batch.forEach((p, idx) => {
      if (results[idx]) {
        map[p.ticker] = { ...results[idx], updated_at: new Date().toISOString().slice(0, 10) };
        cached++;
      } else {
        failed++;
      }
    });
    if (i + 4 < sliced.length) await new Promise(r => setTimeout(r, 700));
  }
  await setAgentMemory(env, "risk_metrics", map);
  return { cached, failed, total: sliced.length, portfolio: positions.length };
}

// Reader for cached risk metrics
async function getRiskMetrics(env, tickers) {
  const all = (await getAgentMemory(env, "risk_metrics")) || {};
  const result = {};
  for (const t of tickers) if (all[t]) result[t] = all[t];
  return result;
}

// Per-ticker historical spark (last N daily closes) — uses /stable/historical-price-eod
async function fmpSpark(ticker, env, days = 5) {
  const FMP_KEY = env.FMP_KEY;
  if (!FMP_KEY) return [];
  const sym = toFMP(ticker);
  // Need a few extra calendar days to ensure we get N trading days
  const fromDate = new Date(Date.now() - (days + 5) * 86400000).toISOString().slice(0, 10);
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${encodeURIComponent(sym)}&from=${fromDate}&apikey=${FMP_KEY}`
    );
    if (!r.ok) return [];
    const data = await r.json();
    // Stable returns array directly (most recent first or chronological depending on endpoint)
    const arr = Array.isArray(data) ? data : (data?.historical || []);
    if (!arr.length) return [];
    // Sort by date ascending to ensure chronological
    const sorted = [...arr].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return sorted.slice(-days).map(h => h.close ?? h.price).filter(v => v != null);
  } catch { return []; }
}

let _migrated = false;

async function ensureMigrations(env) {
  if (_migrated) return;
  try {
    // presupuesto table (budget items)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS presupuesto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'OTROS',
      banco TEXT DEFAULT '',
      frecuencia TEXT NOT NULL DEFAULT 'MENSUAL',
      importe REAL NOT NULL DEFAULT 0,
      notas TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();

    // presupuesto_history table (tracks price changes for alerts)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS presupuesto_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      importe_anterior REAL NOT NULL,
      importe_nuevo REAL NOT NULL,
      cambio_pct REAL NOT NULL,
      fecha TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES presupuesto(id) ON DELETE CASCADE
    )`).run();

    // margin_interest table
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS margin_interest (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mes TEXT NOT NULL,
      cuenta TEXT NOT NULL,
      divisa TEXT DEFAULT 'USD',
      interes REAL NOT NULL,
      interes_usd REAL NOT NULL,
      UNIQUE(mes, cuenta, divisa)
    )`).run();

    // fundamentals table
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fundamentals (
      symbol TEXT PRIMARY KEY, income TEXT, balance TEXT, cashflow TEXT,
      profile TEXT, dividends TEXT, ratios TEXT,
      rating TEXT, dcf TEXT, estimates TEXT, price_target TEXT,
      key_metrics TEXT, fin_growth TEXT,
      updated_at TEXT
    )`).run();

    // Add columns to fundamentals (idempotent)
    const fundCols = ["rating","dcf","estimates","price_target","key_metrics","fin_growth",
                      "grades","owner_earnings","rev_segments","geo_segments","peers","earnings","pt_summary","dgr"];
    for (const col of fundCols) {
      try { await env.DB.prepare(`ALTER TABLE fundamentals ADD COLUMN ${col} TEXT`).run(); } catch(e) { /* already exists */ }
    }

    // Add columns to holdings (idempotent)
    for (const col of ["sector","industry","market_cap","country"]) {
      try { await env.DB.prepare(`ALTER TABLE holdings ADD COLUMN ${col} TEXT`).run(); } catch(e) { /* already exists */ }
    }

    // Add notes column to positions (idempotent)
    try { await env.DB.prepare(`ALTER TABLE positions ADD COLUMN notes TEXT DEFAULT ''`).run(); } catch(e) { /* already exists */ }

    // Add billing_months to presupuesto (JSON array of months, e.g. [1,7] for Jan+Jul)
    try { await env.DB.prepare(`ALTER TABLE presupuesto ADD COLUMN billing_months TEXT DEFAULT NULL`).run(); } catch(e) { /* already exists */ }
    try { await env.DB.prepare(`ALTER TABLE presupuesto ADD COLUMN aliases TEXT DEFAULT NULL`).run(); } catch(e) { /* already exists */ }

    // App config key-value store
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')))`).run();

    // Presupuesto: excluded gasto IDs, last payment, custom months
    try { await env.DB.prepare(`ALTER TABLE presupuesto ADD COLUMN excluded_gastos TEXT DEFAULT NULL`).run(); } catch(e) { /* already exists */ }
    try { await env.DB.prepare(`ALTER TABLE presupuesto ADD COLUMN last_payment TEXT DEFAULT NULL`).run(); } catch(e) { /* already exists */ }
    try { await env.DB.prepare(`ALTER TABLE presupuesto ADD COLUMN custom_months INTEGER DEFAULT NULL`).run(); } catch(e) { /* already exists */ }

    // Dividendos: tax fields (retención origen, España, DPS, broker, FX)
    for (const col of ['wht_rate REAL DEFAULT 0','wht_amount REAL DEFAULT 0','spain_rate REAL DEFAULT 0','spain_tax REAL DEFAULT 0','fx_eur REAL DEFAULT 0','dps_gross REAL DEFAULT 0','dps_net REAL DEFAULT 0','commission REAL DEFAULT 0','excess_irpf REAL DEFAULT 0','excess_foreign REAL DEFAULT 0','broker TEXT DEFAULT NULL','company TEXT DEFAULT NULL']) {
      try { await env.DB.prepare(`ALTER TABLE dividendos ADD COLUMN ${col}`).run(); } catch(e) { /* already exists */ }
    }

    // Patrimonio: new fields for CNY bank, split salary, gold, BTC
    for (const col of ['construction_bank_cny REAL DEFAULT 0','fx_eur_cny REAL DEFAULT 0','salary_usd REAL DEFAULT 0','salary_cny REAL DEFAULT 0','gold_grams REAL DEFAULT 0','gold_eur REAL DEFAULT 0','btc_amount REAL DEFAULT 0','btc_eur REAL DEFAULT 0']) {
      try { await env.DB.prepare(`ALTER TABLE patrimonio ADD COLUMN ${col}`).run(); } catch(e) { /* already exists */ }
    }

    // cartera table (portfolio positions)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS cartera (
      ticker TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      shares REAL NOT NULL DEFAULT 0,
      divisa TEXT DEFAULT 'USD',
      fx REAL DEFAULT 1,
      categoria TEXT DEFAULT 'COMPANY',
      estrategia TEXT DEFAULT 'YO',
      sector TEXT DEFAULT '',
      pais TEXT DEFAULT '',
      last_price REAL DEFAULT 0
    )`).run();

    // positions table (replaces hardcoded POS_STATIC)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS positions (
      ticker TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      last_price REAL DEFAULT 0,
      avg_price REAL DEFAULT 0,
      cost_basis REAL DEFAULT 0,
      shares REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      fx REAL DEFAULT 1,
      strategy TEXT DEFAULT 'YO',
      category TEXT DEFAULT 'COMPANY',
      list TEXT DEFAULT 'portfolio',
      market_value REAL DEFAULT 0,
      usd_value REAL DEFAULT 0,
      total_invested REAL DEFAULT 0,
      pnl_pct REAL DEFAULT 0,
      pnl_abs REAL DEFAULT 0,
      div_ttm REAL DEFAULT 0,
      div_yield REAL DEFAULT 0,
      yoc REAL DEFAULT 0,
      market_cap REAL DEFAULT 0,
      sector TEXT DEFAULT '',
      extra TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();

    // alerts table
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      detalle TEXT DEFAULT '',
      ticker TEXT DEFAULT '',
      valor REAL DEFAULT 0,
      leida INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();

    // nlv_history table (daily NLV snapshots from IB)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS nlv_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      nlv REAL NOT NULL,
      cash REAL DEFAULT 0,
      positions_value REAL DEFAULT 0,
      margin_used REAL DEFAULT 0,
      accounts INTEGER DEFAULT 0,
      positions_count INTEGER DEFAULT 0,
      UNIQUE(fecha)
    )`).run();

    // ai_analysis table (AI-powered company analysis)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ai_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      analysis_date TEXT DEFAULT (datetime('now')),
      fundamentals TEXT,
      dividend_safety TEXT,
      valuation TEXT,
      income_optimization TEXT,
      verdict TEXT,
      score INTEGER DEFAULT 0,
      action TEXT DEFAULT 'HOLD',
      summary TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_analysis_ticker_date ON ai_analysis(ticker, analysis_date)`).run();

    // agent_insights table (AI agent outputs)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL,
      fecha TEXT NOT NULL,
      ticker TEXT NOT NULL DEFAULT '_GLOBAL_',
      severity TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT DEFAULT '{}',
      score REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agent_name, fecha, ticker)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_agent_insights_fecha ON agent_insights(fecha)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_agent_insights_agent ON agent_insights(agent_name)`).run();

    // agent_memory table (persistent state between agent runs)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_memory (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();

    // signal_tracking table (postmortem: did trade signals work?)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS signal_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_fecha TEXT NOT NULL,
      ticker TEXT NOT NULL,
      action TEXT NOT NULL,
      price_at_signal REAL,
      price_7d REAL,
      price_30d REAL,
      div_at_signal REAL,
      div_30d REAL,
      outcome TEXT,
      pnl_7d_pct REAL,
      pnl_30d_pct REAL,
      evaluated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(original_fecha, ticker)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_signal_tracking_fecha ON signal_tracking(original_fecha)`).run();

    // gurufocus_cache table (GF Value, Score, rankings, insider/guru data)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS gurufocus_cache (
      ticker TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();

    // push_subscriptions table (Web Push)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_used TEXT
    )`).run();

    // ═══════ DESIGN BACKLOG MVPs ═══════════════════════════════
    // theses: Proceso module — structured investment theses per ticker.
    // Versioned: new saves become is_current=1, previous versions kept for history.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS theses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      is_current INTEGER NOT NULL DEFAULT 1,
      why_owned TEXT NOT NULL,
      what_would_make_sell TEXT NOT NULL,
      thesis_type TEXT DEFAULT 'compounder',
      conviction INTEGER DEFAULT 3,
      target_weight_min REAL DEFAULT 0,
      target_weight_max REAL DEFAULT 0,
      notes_md TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_theses_ticker ON theses(ticker, is_current)`).run();

    // library_items: Reading List MVP — books, papers, podcasts, articles
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS library_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'book',
      title TEXT NOT NULL,
      author TEXT DEFAULT '',
      year INTEGER,
      tier TEXT DEFAULT 'A',
      status TEXT DEFAULT 'queue',
      rating INTEGER,
      source_url TEXT DEFAULT '',
      started_at TEXT,
      finished_at TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_library_status ON library_items(status)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS library_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      note_text TEXT NOT NULL,
      related_tickers_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(item_id) REFERENCES library_items(id) ON DELETE CASCADE
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_library_notes_item ON library_notes(item_id)`).run();

    // macro_events + event_sector_mapping: Macro Calendar MVP
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS macro_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_date TEXT NOT NULL,
      event_time TEXT DEFAULT '',
      country TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_name TEXT NOT NULL,
      consensus_estimate TEXT DEFAULT '',
      previous_value TEXT DEFAULT '',
      actual_value TEXT DEFAULT '',
      impact_level TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'scheduled',
      fetched_at TEXT DEFAULT (datetime('now')),
      UNIQUE(event_date, country, event_type)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_macro_events_date ON macro_events(event_date)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS event_sector_mapping (
      event_type TEXT PRIMARY KEY,
      primary_sectors_json TEXT DEFAULT '[]',
      secondary_sectors_json TEXT DEFAULT '[]',
      rationale TEXT DEFAULT '',
      typical_reaction TEXT DEFAULT '',
      user_action_advice TEXT DEFAULT ''
    )`).run();

    // revenue_segmentation: Currency Exposure MVP
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS revenue_segmentation (
      ticker TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      region TEXT NOT NULL,
      revenue_usd REAL DEFAULT 0,
      pct_of_total REAL DEFAULT 0,
      confidence TEXT DEFAULT 'low',
      source TEXT DEFAULT '',
      fetched_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(ticker, fiscal_year, region)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_revenue_segmentation_ticker ON revenue_segmentation(ticker)`).run();

    // ─── Earnings Intelligence MVP ───
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS earnings_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      earnings_date TEXT NOT NULL,
      earnings_time TEXT,
      fiscal_period TEXT,
      eps_estimate REAL,
      revenue_estimate REAL,
      status TEXT DEFAULT 'scheduled',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(ticker, earnings_date)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_earnings_cal_date ON earnings_calendar(earnings_date)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_earnings_cal_ticker ON earnings_calendar(ticker)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS earnings_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      earnings_date TEXT NOT NULL,
      eps_actual REAL,
      eps_estimate REAL,
      eps_surprise_pct REAL,
      revenue_actual REAL,
      revenue_estimate REAL,
      revenue_surprise_pct REAL,
      beat_or_miss TEXT,
      summary TEXT,
      reported_at TEXT DEFAULT (datetime('now')),
      UNIQUE(ticker, earnings_date)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_earnings_res_date ON earnings_results(earnings_date)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_earnings_res_ticker ON earnings_results(ticker)`).run();

    // ─── News Agent MVP ───
    // Haiku-classified news items. Raw FMP news not persisted, only results.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS news_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      source TEXT DEFAULT '',
      published_at TEXT NOT NULL,
      tickers_json TEXT NOT NULL DEFAULT '[]',
      severity TEXT NOT NULL DEFAULT 'info',
      sentiment_score REAL DEFAULT 0,
      relevance_score REAL DEFAULT 0,
      category TEXT DEFAULT 'general',
      image_url TEXT DEFAULT '',
      fetched_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_news_severity ON news_items(severity)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_news_relevance ON news_items(relevance_score DESC)`).run();

    // ─── Company Narratives (transcript summary + business model) ───
    // One row per (ticker, narrative_type). UPSERT on regenerate.
    // narrative_type: 'transcript_summary' (Opus, manual refresh) | 'business_model' (Haiku, 30d TTL)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS company_narratives (
      ticker TEXT NOT NULL,
      narrative_type TEXT NOT NULL,
      content_md TEXT NOT NULL,
      source_data TEXT DEFAULT '',
      tokens_used INTEGER DEFAULT 0,
      generated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(ticker, narrative_type)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_narratives_generated ON company_narratives(generated_at DESC)`).run();

    // ─── Performance indexes ───────────────────────────
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha)",
      "CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos(categoria)",
      "CREATE INDEX IF NOT EXISTS idx_gastos_divisa ON gastos(divisa)",
      "CREATE INDEX IF NOT EXISTS idx_dividendos_fecha ON dividendos(fecha)",
      "CREATE INDEX IF NOT EXISTS idx_dividendos_ticker ON dividendos(ticker)",
      "CREATE INDEX IF NOT EXISTS idx_cost_basis_ticker ON cost_basis(ticker)",
      "CREATE INDEX IF NOT EXISTS idx_cost_basis_fecha ON cost_basis(fecha)",
      "CREATE INDEX IF NOT EXISTS idx_nlv_history_fecha ON nlv_history(fecha)",
      "CREATE INDEX IF NOT EXISTS idx_alerts_fecha ON alerts(fecha)",
      "CREATE INDEX IF NOT EXISTS idx_alerts_leida ON alerts(leida)",
    ];
    for (const ddl of indexes) {
      try { await env.DB.prepare(ddl).run(); } catch(e) { /* index may already exist or table missing */ }
    }

    // ─── v3.3 migrations: IB snapshot columns ───
    const alterMigrations = [
      "ALTER TABLE nlv_history ADD COLUMN buying_power REAL DEFAULT 0",
      "ALTER TABLE positions ADD COLUMN ib_shares REAL DEFAULT 0",
      "ALTER TABLE positions ADD COLUMN ib_avg_cost REAL DEFAULT 0",
      "ALTER TABLE positions ADD COLUMN ib_price REAL DEFAULT 0",
    ];
    for (const ddl of alterMigrations) {
      try { await env.DB.prepare(ddl).run(); } catch(e) { /* column already exists */ }
    }

    // ─── Smart Money MVP (2026-04-08) ───
    // Curated superinvestors. US funds use CIK + FMP 13F endpoint;
    // Spanish funds use ISIN + seed from CNMV-filed PDFs (1S2025).
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS superinvestors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      manager TEXT DEFAULT '',
      cik TEXT,
      style TEXT DEFAULT '',
      conviction INTEGER DEFAULT 3,
      followed INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      last_quarter TEXT,
      last_refreshed_at TEXT
    )`).run();
    // Idempotent ALTERs for Spanish fund support
    try { await env.DB.prepare(`ALTER TABLE superinvestors ADD COLUMN source TEXT DEFAULT 'us-13f'`).run(); } catch(e) {}
    try { await env.DB.prepare(`ALTER TABLE superinvestors ADD COLUMN isin TEXT`).run(); } catch(e) {}

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fund_holdings (
      fund_id TEXT NOT NULL,
      quarter TEXT NOT NULL,
      ticker TEXT NOT NULL,
      cusip TEXT DEFAULT '',
      name TEXT DEFAULT '',
      shares REAL DEFAULT 0,
      value_usd REAL DEFAULT 0,
      weight_pct REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (fund_id, quarter, ticker)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_fh_ticker ON fund_holdings(ticker)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_fh_quarter ON fund_holdings(quarter)`).run();

    // Seed the curated superinvestors (idempotent — INSERT OR IGNORE).
    // CIKs sourced from docs/fondos-tab-design.md.
    const SUPERINVESTORS_SEED = [
      // id, name, manager, cik, style, conviction, source, isin
      ['berkshire',   'Berkshire Hathaway',           'Warren Buffett',          '0001067983', 'quality-value-mega', 5, 'us-13f', null],
      ['pabrai',      'Pabrai Investment Funds',      'Mohnish Pabrai',          '0001549575', 'concentrated-value', 5, 'us-13f', null],
      ['akre',        'Akre Capital Management',      'Akre / Saler / Yacktman', '0001112520', 'quality-compounders', 5, 'us-13f', null],
      ['polen',       'Polen Capital',                'Polen team',              '0001034524', 'quality-growth', 4, 'us-13f', null],
      ['markel',      'Markel Group',                 'Tom Gayner',              '0001096343', 'buffett-style', 5, 'us-13f', null],
      ['yacktman',    'Yacktman Asset Management',    'Stephen Yacktman',        '0000905567', 'quality-dividend', 4, 'us-13f', null],
      ['wedgewood',   'Wedgewood Partners',           'David Rolfe',             '0001585391', 'concentrated-quality', 4, 'us-13f', null],
      ['sequoia',     'Ruane Cunniff (Sequoia)',      'Sequoia team',            '0000350894', 'long-term-quality', 4, 'us-13f', null],
      ['russo',       'Gardner Russo & Quinn',        'Tom Russo',               '0001067921', 'dividend-consumer-brands', 5, 'us-13f', null],
      ['baupost',     'Baupost Group',                'Seth Klarman',            '0001061768', 'deep-value', 5, 'us-13f', null],
      ['pershing',    'Pershing Square Capital',      'Bill Ackman',             '0001336528', 'concentrated-activist', 4, 'us-13f', null],
      ['appaloosa',   'Appaloosa Management',         'David Tepper',            '0001656456', 'macro-value', 4, 'us-13f', null],
      ['giverny',     'Giverny Capital',              'François Rochon',         '0001595888', 'quality-compounding-intl', 5, 'us-13f', null],
      // ─── Spanish value funds (source: CNMV semestral PDFs) ───
      ['cobas-int',   'Cobas Internacional FI',       'Francisco García Paramés',null, 'deep-value-contrarian-es', 5, 'es-cnmv', 'ES0119199000'],
      ['magallanes',  'Magallanes European Equity FI','Iván Martín',             null, 'quality-value-europe', 5, 'es-cnmv', 'ES0159259031'],
      ['azvalor-int', 'Azvalor Internacional FI',     'Álvaro Guzmán + Fernando Bernad', null, 'value-commodities-es', 5, 'es-cnmv', 'ES0112611001'],
    ];
    for (const [id, name, manager, cik, style, conv, source, isin] of SUPERINVESTORS_SEED) {
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO superinvestors (id, name, manager, cik, style, conviction, followed, source, isin) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
        ).bind(id, name, manager, cik, style, conv, source, isin).run();
      } catch(e) { /* already seeded */ }
      // Backfill source/isin for existing rows (first deploy after ALTER)
      try {
        await env.DB.prepare(
          `UPDATE superinvestors SET source = COALESCE(source, ?), isin = COALESCE(isin, ?) WHERE id = ?`
        ).bind(source, isin, id).run();
      } catch(e) {}
    }

    _migrated = true;
  } catch(e) {
    console.error("Migration error:", e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Input validation helpers
// ═══════════════════════════════════════════════════════════════

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateFecha(fecha, fieldName = 'fecha') {
  if (!fecha) return `Missing required field: ${fieldName}`;
  if (typeof fecha !== 'string' || !FECHA_RE.test(fecha)) return `${fieldName} must be YYYY-MM-DD format`;
  const [y, m, d] = fecha.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return `${fieldName} has invalid month/day`;
  return null;
}

function validateNumber(value, fieldName) {
  if (value === undefined || value === null) return `Missing required field: ${fieldName}`;
  const n = Number(value);
  if (isNaN(n) || !isFinite(n)) return `${fieldName} must be a valid number`;
  return null;
}

function validateRequired(value, fieldName) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return `Missing required field: ${fieldName}`;
  }
  return null;
}

function validateId(raw) {
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0) return null;
  return id;
}

// Auto-detect lugar_tag from expense description and currency
function detectLugarTag(desc, divisa) {
  const d = (desc || "").toLowerCase();
  if (d.includes("nautico") || d.includes("náutico") || d.includes("r.c. nautico") || d.includes("amarre") || d.includes("barco") || d.includes("club nautico")) return "barco";
  if (d.includes("costa brava") || d.includes("c.p. costa brava") || d.includes("comunidad costa")) return "casa";
  if (d.includes("{china}") && (d.includes("utilities") || d.includes("alquiler") || d.includes("internet") || d.includes("telefon"))) return "china";
  return null;
}

// Apply learned rules from gasto_rules table
async function applyGastoRules(env, desc) {
  if (!desc || desc.length < 3) return null;
  const clean = desc.replace(/\{china\}\s?/g,"").replace(/\{extra\}\s?/g,"").trim().toLowerCase();
  try {
    const { results } = await env.DB.prepare("SELECT pattern, categoria, lugar_tag FROM gasto_rules ORDER BY length(pattern) DESC LIMIT 200").all();
    for (const rule of results) {
      if (clean.includes(rule.pattern)) {
        return { categoria: rule.categoria, lugar_tag: rule.lugar_tag };
      }
    }
  } catch {}
  return null;
}

function validationError(msg, corsHeaders) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ═══════════════════════════════════════════════════════════════
// Rate-limit-aware fetch helpers
// ═══════════════════════════════════════════════════════════════

async function fetchWithRetry(url, options = {}, { maxRetries = 3, baseDelay = 1000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status === 429) {
      if (attempt === maxRetries) return resp;
      const retryAfter = parseInt(resp.headers.get('Retry-After') || '0', 10);
      const delay = retryAfter > 0 ? retryAfter * 1000 : baseDelay * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, Math.min(delay, 30000)));
      continue;
    }
    return resp;
  }
}

let _yahooCrumb = null;
let _yahooCookie = null;
let _yahooCrumbTs = 0;

async function getYahooCrumb() {
  // Cache crumb for 30 minutes
  if (_yahooCrumb && _yahooCookie && Date.now() - _yahooCrumbTs < 1800000) return { crumb: _yahooCrumb, cookie: _yahooCookie };

  try {
    // Step 1: Get consent cookie
    const consentResp = await fetch("https://fc.yahoo.com", { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
    const setCookie = consentResp.headers.get("set-cookie") || "";
    const cookieMatch = setCookie.match(/A3=([^;]+)/);
    if (!cookieMatch) return null;
    const cookie = `A3=${cookieMatch[1]}`;

    // Step 2: Get crumb
    const crumbResp = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Cookie": cookie },
    });
    if (!crumbResp.ok) return null;
    const crumb = await crumbResp.text();
    if (!crumb || crumb.includes("error")) return null;

    _yahooCrumb = crumb.trim();
    _yahooCookie = cookie;
    _yahooCrumbTs = Date.now();
    return { crumb: _yahooCrumb, cookie: _yahooCookie };
  } catch { return null; }
}

async function fetchYahoo(url, { maxRetries = 2 } = {}) {
  // Try without crumb first (v8 chart works without it)
  const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
  const resp = await fetchWithRetry(url, { headers }, { maxRetries, baseDelay: 1500 });
  if (resp.ok) return resp;

  // If 401, try with crumb (needed for v7 options)
  if (resp.status === 401) {
    const auth = await getYahooCrumb();
    if (auth) {
      const separator = url.includes("?") ? "&" : "?";
      const authUrl = `${url}${separator}crumb=${encodeURIComponent(auth.crumb)}`;
      return fetchWithRetry(authUrl, { headers: { ...headers, "Cookie": auth.cookie } }, { maxRetries, baseDelay: 1500 });
    }
  }
  return resp;
}

// ═══════════════════════════════════════════════════════════════
// IB OAuth 1.0a helpers (module-level for reuse by fetch + scheduled)
// ═══════════════════════════════════════════════════════════════

function _modPow(base, exp, m) {
  let result = 1n;
  base = ((base % m) + m) % m;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    exp >>= 1n;
    base = (base * base) % m;
  }
  return result;
}
function _bigIntToBytes(n) {
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  if (bytes[0] >= 0x80) {
    const padded = new Uint8Array(bytes.length + 1);
    padded.set(bytes, 1);
    return padded;
  }
  return bytes;
}
function _bytesToHex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(""); }
function _hexToBytes(hex) {
  if (hex.length % 2) hex = "0" + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function _bytesToBigInt(bytes) { return BigInt("0x" + _bytesToHex(bytes)); }
function _b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function _bytesToB64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function _pemToDer(pem) {
  const lines = pem.split("\n").filter(l => !l.startsWith("-----")).join("");
  return _b64ToBytes(lines);
}
function _extractDhPrime(pem) {
  const der = _pemToDer(pem);
  let offset = 0;
  if (der[offset] !== 0x30) throw new Error("Not a SEQUENCE");
  offset++;
  let seqLen = der[offset]; offset++;
  if (seqLen & 0x80) { const lenBytes = seqLen & 0x7f; seqLen = 0; for (let i = 0; i < lenBytes; i++) { seqLen = (seqLen << 8) | der[offset]; offset++; } }
  if (der[offset] !== 0x02) throw new Error("Not an INTEGER");
  offset++;
  let intLen = der[offset]; offset++;
  if (intLen & 0x80) { const lenBytes = intLen & 0x7f; intLen = 0; for (let i = 0; i < lenBytes; i++) { intLen = (intLen << 8) | der[offset]; offset++; } }
  const primeBytes = der.slice(offset, offset + intLen);
  const start = primeBytes[0] === 0 ? 1 : 0;
  return _bytesToBigInt(primeBytes.slice(start));
}
function _buildParamStr(params) {
  return Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
}
function _buildBaseString(method, url, params, prepend = "") {
  const paramStr = _buildParamStr(params);
  return prepend + method.toUpperCase() + "&" + encodeURIComponent(url) + "&" + encodeURIComponent(paramStr);
}
async function _rsaSign(privateKeyPem, data) {
  const der = _pemToDer(privateKeyPem);
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  return _bytesToB64(new Uint8Array(sig));
}
async function _rsaDecrypt(privateKeyPem, ciphertextB64) {
  const ciphertext = _b64ToBytes(ciphertextB64);
  try {
    const { privateDecrypt, constants } = await import("node:crypto");
    const { Buffer } = await import("node:buffer");
    const decrypted = privateDecrypt(
      { key: privateKeyPem, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(ciphertext)
    );
    return new Uint8Array(decrypted);
  } catch(e) {
    throw new Error("RSA decrypt failed: " + e.message);
  }
}
async function _hmacSHA1(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, dataBytes);
  return new Uint8Array(sig);
}
async function _hmacSHA256Sign(keyBytes, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return _bytesToB64(new Uint8Array(sig));
}

async function getIBSession(env) {
  const consumerKey = env.IB_CONSUMER_KEY;
  const accessToken = env.IB_ACCESS_TOKEN;
  const accessTokenSecret = env.IB_ACCESS_TOKEN_SECRET;
  const sigKeyPem = env.IB_SIGNATURE_KEY;
  const encKeyPem = env.IB_ENCRYPTION_KEY;
  const dhParamPem = env.IB_DH_PARAM;
  if (!consumerKey || !accessToken) throw new Error("IB credentials not configured");

  const IB_BASE = "https://api.ibkr.com/v1/api";
  const decryptedATS = await _rsaDecrypt(encKeyPem, accessTokenSecret);
  const prepend = _bytesToHex(decryptedATS);
  const dhPrime = _extractDhPrime(dhParamPem);
  const rb = new Uint8Array(32); crypto.getRandomValues(rb);
  const a = _bytesToBigInt(rb);
  const A = _modPow(2n, a, dhPrime);

  const lstUrl = IB_BASE + "/oauth/live_session_token";
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const oauthP = { oauth_consumer_key: consumerKey, oauth_token: accessToken, oauth_signature_method: "RSA-SHA256", oauth_timestamp: ts, oauth_nonce: nonce, diffie_hellman_challenge: A.toString(16) };
  const sig = await _rsaSign(sigKeyPem, _buildBaseString("POST", lstUrl, oauthP, prepend));
  const auth = "OAuth " + Object.entries({ ...oauthP, oauth_signature: sig }).map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`).join(", ");

  const lstResp = await fetch(lstUrl, { method: "POST", headers: { "Authorization": auth, "Content-Length": "0", "User-Agent": "AyR/1.0" } });
  if (!lstResp.ok) throw new Error("LST failed: " + lstResp.status);
  const lstData = await lstResp.json();

  const K = _modPow(BigInt("0x" + lstData.diffie_hellman_response), a, dhPrime);
  const lst = await _hmacSHA1(_bigIntToBytes(K), decryptedATS);

  const verify = await _hmacSHA1(lst, new TextEncoder().encode(consumerKey));
  if (_bytesToHex(verify) !== lstData.live_session_token_signature) throw new Error("LST verification failed");

  const ts2 = Math.floor(Date.now() / 1000).toString();
  const nonce2 = crypto.randomUUID().replace(/-/g, "");
  const initP = { oauth_consumer_key: consumerKey, oauth_token: accessToken, oauth_signature_method: "HMAC-SHA256", oauth_timestamp: ts2, oauth_nonce: nonce2 };
  const initSig = await _hmacSHA256Sign(lst, _buildBaseString("POST", IB_BASE + "/iserver/auth/ssodh/init", initP));
  const initAuth = "OAuth " + Object.entries({ ...initP, oauth_signature: initSig }).map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`).join(", ");
  await fetch(IB_BASE + "/iserver/auth/ssodh/init", { method: "POST", headers: { "Authorization": initAuth, "Content-Type": "application/json", "User-Agent": "AyR/1.0" }, body: JSON.stringify({ publish: true, compete: true }) });

  return { lst, consumerKey, accessToken };
}

async function ibAuthFetch(lst, consumerKey, accessToken, method, endpoint, body = null) {
  const IB_BASE = "https://api.ibkr.com/v1/api";
  const fullUrl = IB_BASE + endpoint;
  const [baseUrl, queryStr] = fullUrl.split("?");
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const params = { oauth_consumer_key: consumerKey, oauth_token: accessToken, oauth_signature_method: "HMAC-SHA256", oauth_timestamp: ts, oauth_nonce: nonce };
  if (queryStr) {
    for (const part of queryStr.split("&")) {
      const [k, v] = part.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }
  const sig = await _hmacSHA256Sign(lst, _buildBaseString(method, baseUrl, params));
  const auth = "OAuth " + Object.entries({
    oauth_consumer_key: params.oauth_consumer_key, oauth_token: params.oauth_token,
    oauth_signature_method: params.oauth_signature_method, oauth_timestamp: params.oauth_timestamp,
    oauth_nonce: params.oauth_nonce, oauth_signature: sig
  }).map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`).join(", ");
  const opts = { method, headers: { "Authorization": auth, "User-Agent": "AyR/1.0", "Accept": "application/json" } };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const resp = await fetch(fullUrl, opts);
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { _raw: text, _status: resp.status }; }
}

// ═══════════════════════════════════════════════════════════════
// Auto-sync: fetch recent trades, dividends, and NLV from IB OAuth API
// Used by POST /api/ib-auto-sync and the scheduled cron trigger
// ═══════════════════════════════════════════════════════════════

async function performAutoSync(env) {
  const errors = [];
  let tradesImported = 0, tradesSkipped = 0;
  let divsImported = 0, divsSkipped = 0;
  let nlvUpdated = false;

  const { lst, consumerKey, accessToken } = await getIBSession(env);
  const ib = (m, e, b) => ibAuthFetch(lst, consumerKey, accessToken, m, e, b);

  // 1. Get account IDs
  const accounts = await ib("GET", "/portfolio/accounts");
  const accountIds = (Array.isArray(accounts) ? accounts : []).map(a => a.accountId || a.id).filter(Boolean);
  if (!accountIds.length) throw new Error("No IB accounts found");

  // 2. Fetch recent trades (last 7 days) and import into cost_basis
  try {
    let allTrades = [];
    for (const acctId of accountIds) {
      const trades = await ib("GET", `/iserver/account/trades?days=7&accountId=${acctId}`);
      if (Array.isArray(trades)) allTrades.push(...trades);
    }
    if (!allTrades.length) {
      const trades = await ib("GET", "/iserver/account/trades?days=7");
      if (Array.isArray(trades)) allTrades = trades;
    }

    const tradeStmts = [];
    for (const t of allTrades) {
      if (!t.symbol || !t.trade_time_r) continue;
      const fecha = new Date(t.trade_time_r).toISOString().slice(0, 10);
      const qty = parseFloat(t.size) || 0;
      const price = parseFloat(t.price) || 0;
      const commission = parseFloat(t.comission) || 0; // IB typo
      const netAmount = parseFloat(t.net_amount) || 0;
      const secType = t.sec_type || "STK";
      const tipo = secType === "OPT" ? "OPTION" : "EQUITY";

      // Dedup: INSERT OR IGNORE with unique constraint, or check manually
      tradeStmts.push(env.DB.prepare(
        `INSERT INTO cost_basis (ticker, fecha, tipo, shares, precio, comision, coste)
         SELECT ?,?,?,?,?,?,?
         WHERE NOT EXISTS (
           SELECT 1 FROM cost_basis
           WHERE ticker=? AND fecha=? AND ABS(shares - ?) < 0.001 AND ABS(precio - ?) < 0.001
         )`
      ).bind(t.symbol, fecha, tipo, qty, price, commission, netAmount,
             t.symbol, fecha, qty, price));
    }

    for (let i = 0; i < tradeStmts.length; i += 80) {
      const batch = tradeStmts.slice(i, i + 80);
      try {
        const results = await env.DB.batch(batch);
        for (const r of results) {
          if (r.meta?.changes > 0) tradesImported++;
          else tradesSkipped++;
        }
      } catch(e) {
        tradesSkipped += batch.length;
        errors.push("Trade batch error: " + e.message);
      }
    }
  } catch(e) {
    errors.push("Trades fetch error: " + e.message);
  }

  // 3. Fetch account summary and save NLV + buying power.
  // Guarded against partial-account writes — the #1 source of corrupt rows.
  // Bug history 2026-04-07: a partial multi-account fetch wrote a row with
  // only 1 of 4 accounts' NLV (~$1.12M vs real $1.32M), which then became
  // the default cached snapshot on every app load until we DELETED it
  // manually. Fix 2026-04-08:
  //   (a) require ALL accountIds to return a positive netliquidation,
  //   (b) refuse >30% drops vs the most recent prior row,
  //   (c) otherwise skip the write and log to errors (next cron retries).
  let totalBuyingPower = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    let totalNlv = 0, totalCash = 0, totalGross = 0, totalMargin = 0;
    let accountsOk = 0;
    const get = (summary, field) => summary?.[field]?.amount || 0;

    for (const accountId of accountIds) {
      const summary = await ib("GET", `/portfolio/${accountId}/summary`);
      const nlv = get(summary, "netliquidation");
      if (nlv <= 0) {
        errors.push(`NLV missing for account ${accountId}`);
        continue;
      }
      accountsOk++;
      totalNlv += nlv;
      totalCash += get(summary, "totalcashvalue");
      totalGross += get(summary, "grosspositionvalue");
      totalMargin += get(summary, "initmarginreq");
      totalBuyingPower += get(summary, "buyingpower");
    }

    if (accountsOk < accountIds.length) {
      errors.push(`Skipping NLV save: only ${accountsOk}/${accountIds.length} accounts returned valid data`);
    } else if (totalNlv > 0) {
      // Sanity check vs previous row — refuse >30% drops (always partial fetches)
      const prev = await env.DB.prepare(
        "SELECT nlv FROM nlv_history WHERE fecha < ? ORDER BY fecha DESC LIMIT 1"
      ).bind(today).first();
      const prevNlv = prev?.nlv || 0;
      if (prevNlv > 0 && totalNlv < prevNlv * 0.7) {
        errors.push(`Skipping NLV save: ${totalNlv.toFixed(0)} is >30% drop vs prev ${prevNlv.toFixed(0)} — likely partial fetch`);
      } else {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO nlv_history (fecha, nlv, cash, positions_value, margin_used, accounts, positions_count, buying_power) VALUES (?,?,?,?,?,?,?,?)"
        ).bind(today, totalNlv, totalCash, totalGross, totalMargin, accountIds.length, 0, totalBuyingPower).run();
        nlvUpdated = true;
      }
    }
  } catch(e) {
    errors.push("NLV save error: " + e.message);
  }

  // 4. Fetch IB positions and save ib_shares/ib_avg_cost/ib_price to positions table
  let ibPositionsSynced = 0;
  try {
    // Re-warm portfolio endpoint (IB requires /portfolio/accounts hit before positions)
    await ib("GET", "/portfolio/accounts");
    const IB_MAP = {"VIS":"BME:VIS","AMS":"BME:AMS","IIPR PRA":"IIPR-PRA","9618":"HKG:9618","1052":"HKG:1052","2219":"HKG:2219","1910":"HKG:1910","9616":"HKG:9616"};
    const merged = {};
    for (const accountId of accountIds) {
      for (let page = 0; page < 5; page++) {
        const positions = await ib("GET", `/portfolio/${accountId}/positions/${page}`);
        if (!positions || !Array.isArray(positions) || !positions.length) break;
        for (const p of positions) {
          if (!p.position || p.position === 0 || p.assetClass !== "STK") continue;
          const ticker = IB_MAP[p.ticker] || p.ticker || "";
          if (!ticker) continue;
          if (merged[ticker]) {
            merged[ticker].shares += p.position || 0;
            merged[ticker].mktValue += p.mktValue || 0;
          } else {
            merged[ticker] = { ticker, shares: p.position || 0, mktPrice: p.mktPrice || 0, mktValue: p.mktValue || 0, avgCost: p.avgCost || 0, currency: p.currency || "USD" };
          }
        }
      }
    }
    // Upsert ib_shares for current positions
    const ibTickers = [];
    const stmts = [];
    for (const [ticker, p] of Object.entries(merged)) {
      if (Math.abs(p.mktValue) < 50 || p.mktPrice <= 0) continue;
      ibTickers.push(ticker);
      stmts.push(env.DB.prepare(
        `UPDATE positions SET ib_shares=?, ib_avg_cost=?, ib_price=?, updated_at=datetime('now') WHERE ticker=?`
      ).bind(p.shares, p.avgCost, p.mktPrice, ticker));
      ibPositionsSynced++;
    }
    for (let i = 0; i < stmts.length; i += 50) {
      await env.DB.batch(stmts.slice(i, i + 50));
    }
    // Zero out sold positions (ib_shares was > 0 but ticker no longer in IB)
    if (ibTickers.length > 0) {
      const placeholders = ibTickers.map(() => "?").join(",");
      await env.DB.prepare(`UPDATE positions SET ib_shares=0, ib_avg_cost=0, ib_price=0 WHERE ib_shares > 0 AND ticker NOT IN (${placeholders})`).bind(...ibTickers).run();
    }
  } catch(e) {
    errors.push("IB positions sync error: " + e.message);
  }

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    trades_imported: tradesImported,
    trades_skipped: tradesSkipped,
    nlv_updated: nlvUpdated,
    ib_positions_synced: ibPositionsSynced,
    accounts: accountIds.length,
    errors: errors.length ? errors : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// Cache P&L: fetch IB STK positions, compute unrealized P&L, store in D1
// Used by POST /api/cache-pnl and the scheduled cron trigger
// ═══════════════════════════════════════════════════════════════
async function cachePnlFromIB(env) {
  const { lst, consumerKey, accessToken } = await getIBSession(env);
  const ib = (m, e, b) => ibAuthFetch(lst, consumerKey, accessToken, m, e, b);

  const accounts = await ib("GET", "/portfolio/accounts");
  const accountIds = (Array.isArray(accounts) ? accounts : []).map(a => a.accountId || a.id).filter(Boolean);
  if (!accountIds.length) throw new Error("No IB accounts found for P&L cache");

  let totalPnl = 0, totalCost = 0;
  for (const accountId of accountIds) {
    for (let page = 0; page < 5; page++) {
      const positions = await ib("GET", `/portfolio/${accountId}/positions/${page}`);
      if (!positions || !Array.isArray(positions) || !positions.length) break;
      for (const p of positions) {
        if (!p.position || p.position === 0 || p.assetClass !== "STK") continue;
        totalPnl += p.unrealizedPnl || 0;
        totalCost += (p.avgCost || 0) * (p.position || 0);
      }
    }
  }

  // Only cache if P&L is non-zero (market is open and returning real data)
  if (totalPnl === 0 && totalCost === 0) {
    return { ok: true, cached: false, reason: "P&L is zero (market likely closed)" };
  }

  const pnlPct = totalCost > 0 ? (totalPnl / totalCost) : 0;
  const data = JSON.stringify({ pnl: totalPnl, cost: totalCost, pnlPct });

  try {
    await env.DB.prepare(
      `INSERT INTO price_cache (id, data, updated_at) VALUES ('__pnl_cache__', ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).bind(data).run();
  } catch(e) {
    // Table might not exist yet
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS price_cache (id TEXT PRIMARY KEY, data TEXT, updated_at TEXT)`
    ).run();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO price_cache (id, data, updated_at) VALUES ('__pnl_cache__', ?, datetime('now'))`
    ).bind(data).run();
  }

  return { ok: true, cached: true, pnl: totalPnl, cost: totalCost, pnlPct };
}

// ═══════════════════════════════════════════════════════════════
// Auto Patrimonio Snapshot — creates monthly snapshot on 1st-3rd
// ═══════════════════════════════════════════════════════════════

async function autoPatrimonioSnapshot(env, { force = false } = {}) {
  const now = new Date();
  const day = now.getUTCDate();

  // Only run on 1st-3rd of the month (cron runs weekdays, so 1st may fall on weekend)
  if (!force && day > 3) return { skipped: true, reason: `Day ${day} — not 1st-3rd of month` };

  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const fecha = `${yyyy}-${mm}-01`;

  // Check if snapshot already exists for this month
  const existing = await env.DB.prepare(
    "SELECT id FROM patrimonio WHERE fecha = ?"
  ).bind(fecha).first();
  if (existing) return { skipped: true, reason: `Snapshot for ${fecha} already exists (id=${existing.id})` };

  // Get the last patrimonio snapshot to copy bancos/fondos/amounts
  const prev = await env.DB.prepare(
    "SELECT * FROM patrimonio ORDER BY fecha DESC LIMIT 1"
  ).first();
  if (!prev) return { skipped: true, reason: "No previous patrimonio snapshot found" };

  // 1. Get IB NLV from account summaries
  let brokerUsd = 0;
  try {
    const { lst, consumerKey, accessToken } = await getIBSession(env);
    const ib = (m, e, b) => ibAuthFetch(lst, consumerKey, accessToken, m, e, b);
    const accounts = await ib("GET", "/portfolio/accounts");
    const accountIds = (Array.isArray(accounts) ? accounts : []).map(a => a.accountId || a.id).filter(Boolean);
    const get = (summary, field) => summary?.[field]?.amount || 0;
    for (const accountId of accountIds) {
      const summary = await ib("GET", `/portfolio/${accountId}/summary`);
      brokerUsd += get(summary, "netliquidation");
    }
  } catch (e) {
    // If IB is unavailable (weekend, maintenance), skip entirely
    return { skipped: true, reason: "IB unavailable: " + e.message };
  }
  if (brokerUsd <= 0) return { skipped: true, reason: "IB NLV is 0 (market likely closed)" };

  // 2. Get BTC price (USD)
  let btcPriceUsd = 0;
  try {
    const btcResp = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const btcData = await btcResp.json();
    btcPriceUsd = btcData?.bitcoin?.usd || 0;
  } catch (e) {
    console.error("BTC price fetch failed:", e.message);
  }

  // 3. Get gold price (USD per gram) via Yahoo Finance (GC=F is per troy oz)
  let goldPricePerGram = 0;
  try {
    const goldResp = await fetchYahoo("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=1d");
    const goldData = await goldResp.json();
    const goldPerOz = goldData?.chart?.result?.[0]?.meta?.regularMarketPrice || 0;
    goldPricePerGram = goldPerOz / 31.1035; // troy oz to grams
  } catch (e) {
    console.error("Gold price fetch failed:", e.message);
  }

  // 4. Get EUR/USD rate
  let fxEurUsd = prev.fx_eur_usd || 1.10;
  try {
    const fxResp = await fetchYahoo("https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1d");
    const fxData = await fxResp.json();
    fxEurUsd = fxData?.chart?.result?.[0]?.meta?.regularMarketPrice || fxEurUsd;
  } catch (e) {
    console.error("EUR/USD fetch failed:", e.message);
  }

  // 5. Get EUR/CNY rate
  let fxEurCny = prev.fx_eur_cny || 0;
  try {
    const cnyResp = await fetchYahoo("https://query1.finance.yahoo.com/v8/finance/chart/EURCNY=X?range=1d&interval=1d");
    const cnyData = await cnyResp.json();
    fxEurCny = cnyData?.chart?.result?.[0]?.meta?.regularMarketPrice || fxEurCny;
  } catch (e) {
    console.error("EUR/CNY fetch failed:", e.message);
  }

  // 6. Calculate crypto and gold values
  const btcAmount = prev.btc_amount || 0;
  const btcEur = btcAmount > 0 && btcPriceUsd > 0 ? (btcAmount * btcPriceUsd) / fxEurUsd : 0;
  const cryptoUsd = btcAmount * btcPriceUsd;

  const goldGrams = prev.gold_grams || 0;
  const goldEur = goldGrams > 0 && goldPricePerGram > 0 ? (goldGrams * goldPricePerGram) / fxEurUsd : 0;

  // 7. Copy manual fields from previous snapshot
  const bank = prev.bank || 0;
  const fondos = prev.fondos || 0;
  const hipoteca = prev.hipoteca || 0;
  const salary = prev.salary || 0;
  const salaryUsd = prev.salary_usd || 0;
  const salaryCny = prev.salary_cny || 0;
  const constructionBankCny = prev.construction_bank_cny || 0;

  // 8. Calculate totals
  const totalUsd = brokerUsd + bank + fondos + cryptoUsd + (goldGrams * goldPricePerGram);
  const totalEur = totalUsd / fxEurUsd;

  // 9. Insert snapshot
  await env.DB.prepare(
    `INSERT INTO patrimonio (fecha, fx_eur_usd, bank, broker, fondos, crypto, hipoteca, total_usd, total_eur, salary, notas,
     construction_bank_cny, fx_eur_cny, salary_usd, salary_cny, gold_grams, gold_eur, btc_amount, btc_eur)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    fecha, fxEurUsd, bank, brokerUsd, fondos, cryptoUsd, hipoteca,
    Math.round(totalUsd), Math.round(totalEur), salary,
    "[auto] Monthly snapshot — bancos/fondos copied from previous month",
    constructionBankCny, fxEurCny, salaryUsd, salaryCny,
    goldGrams, Math.round(goldEur * 100) / 100,
    btcAmount, Math.round(btcEur * 100) / 100
  ).run();

  return {
    ok: true,
    fecha,
    broker: brokerUsd,
    bank,
    fondos,
    crypto: cryptoUsd,
    gold_eur: goldEur,
    btc_eur: btcEur,
    total_usd: Math.round(totalUsd),
    total_eur: Math.round(totalEur),
    fx_eur_usd: fxEurUsd,
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS — allow any *.pages.dev preview, onto-so.com, and localhost
    const origin = request.headers.get("Origin") || "";
    const isAllowed = origin.endsWith(".pages.dev") || origin.endsWith(".onto-so.com") || origin === "https://onto-so.com" || origin.startsWith("http://localhost:");
    const corsOrigin = isAllowed ? origin : "https://ayr.onto-so.com";
    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    await ensureMigrations(env);

    try {
      // ─── RUTAS ─────────────────────────────────

      // ═══ Smart Money MVP — 13F superinvestors ═══════════════════
      // Curated list of 13 great investors (US 13F filers). Manual seed
      // is in ensureMigrations(); /api/funds/refresh fetches their latest
      // 13F holdings from FMP and persists per-quarter into fund_holdings.
      // Frontend tab: SmartMoneyTab.jsx (Research group).

      // GET /api/funds/list — all followed superinvestors with summary stats
      // Optional ?source=us-13f|es-cnmv to filter by source
      if (path === "/api/funds/list" && request.method === "GET") {
        const sourceFilter = url.searchParams.get('source');
        const whereClause = sourceFilter ? `WHERE s.followed = 1 AND s.source = ?` : `WHERE s.followed = 1`;
        const stmt = env.DB.prepare(
          `SELECT s.id, s.name, s.manager, s.cik, s.isin, s.source, s.style, s.conviction, s.followed,
                  s.last_quarter, s.last_refreshed_at,
                  (SELECT COUNT(*) FROM fund_holdings fh WHERE fh.fund_id = s.id AND fh.quarter = s.last_quarter) AS holdings_count,
                  (SELECT SUM(value_usd) FROM fund_holdings fh WHERE fh.fund_id = s.id AND fh.quarter = s.last_quarter) AS portfolio_value
           FROM superinvestors s
           ${whereClause}
           ORDER BY s.conviction DESC, s.name ASC`
        );
        const { results: funds } = await (sourceFilter ? stmt.bind(sourceFilter).all() : stmt.all());
        return json({ funds: funds || [] }, corsHeaders);
      }

      // GET /api/funds/by-tickers?symbols=AAPL,KO,... — bulk lookup for
      // multiple tickers. Returns { [ticker]: [{ fund_id, fund_name, ... }] }.
      // Used by CompanyRow badge so we don't fire 84 individual requests.
      if (path === "/api/funds/by-tickers" && request.method === "GET") {
        const symbolsRaw = url.searchParams.get('symbols') || '';
        const symbols = symbolsRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        if (!symbols.length) return json({ holders: {} }, corsHeaders);
        // Also search for Spanish-prefixed ISINs that resolve to this ticker
        // once isin_ticker_map is populated. For now, direct ticker match only.
        const placeholders = symbols.map(() => '?').join(',');
        const { results } = await env.DB.prepare(
          `SELECT fh.ticker, fh.fund_id, s.name AS fund_name, s.manager, s.style, s.conviction, s.source,
                  fh.weight_pct, fh.value_usd
           FROM fund_holdings fh
           JOIN superinvestors s ON s.id = fh.fund_id
           WHERE s.followed = 1 AND fh.quarter = s.last_quarter AND fh.ticker IN (${placeholders})
           ORDER BY fh.weight_pct DESC`
        ).bind(...symbols).all();
        const holders = {};
        for (const row of results || []) {
          if (!holders[row.ticker]) holders[row.ticker] = [];
          holders[row.ticker].push({
            fund_id: row.fund_id, fund_name: row.fund_name, manager: row.manager,
            style: row.style, conviction: row.conviction, source: row.source,
            weight_pct: row.weight_pct, value_usd: row.value_usd,
          });
        }
        return json({ holders }, corsHeaders);
      }

      // GET /api/funds/cik-search?q=name — proxy to FMP's CIK search so we
      // can resolve the 4 broken CIKs (Wedgewood/Sequoia/Russo/Giverny).
      // FMP has many slightly different endpoints for this — we try several.
      if (path === "/api/funds/cik-search" && request.method === "GET") {
        const q = url.searchParams.get('q') || '';
        if (!q) return json({ error: "q required" }, corsHeaders, 400);
        const FMP_KEY = env.FMP_KEY;
        if (!FMP_KEY) return json({ error: "FMP_KEY not configured" }, corsHeaders, 500);
        const tries = [
          `https://financialmodelingprep.com/stable/institutional-ownership/list?page=0&limit=50&name=${encodeURIComponent(q)}&apikey=${FMP_KEY}`,
          `https://financialmodelingprep.com/api/v4/institutional-ownership/name?name=${encodeURIComponent(q)}&apikey=${FMP_KEY}`,
          `https://financialmodelingprep.com/stable/institutional-ownership/search?name=${encodeURIComponent(q)}&apikey=${FMP_KEY}`,
          `https://financialmodelingprep.com/stable/institutional-ownership/holder-search?name=${encodeURIComponent(q)}&apikey=${FMP_KEY}`,
          `https://financialmodelingprep.com/api/v3/cik-search/${encodeURIComponent(q)}?apikey=${FMP_KEY}`,
        ];
        const debug = [];
        for (const u of tries) {
          try {
            const r = await fetch(u);
            const label = u.split('?')[0].replace('https://financialmodelingprep.com', '');
            debug.push({ url: label, status: r.status });
            if (r.ok) {
              const data = await r.json();
              if (Array.isArray(data) && data.length > 0) {
                return json({ source: label, results: data.slice(0, 20), debug }, corsHeaders);
              }
            }
          } catch (e) { debug.push({ err: e.message }); }
        }
        return json({ results: [], debug }, corsHeaders);
      }

      // POST /api/funds/resolve-isins — for each Spanish holding with a
      // ES:ISIN ticker, call FMP to resolve the actual trading symbol and
      // update fund_holdings.cusip (which currently stores the raw ISIN).
      // This unlocks cross-reference: if a Spanish fund holds Glencore via
      // ISIN JE00B4T3BW64, we can show GLEN.L in the US-side consensus too.
      if (path === "/api/funds/resolve-isins" && request.method === "POST") {
        const FMP_KEY = env.FMP_KEY;
        if (!FMP_KEY) return json({ error: "FMP_KEY not configured" }, corsHeaders, 500);
        // Collect distinct Spanish ISINs (stored in cusip field)
        const { results: rows } = await env.DB.prepare(
          `SELECT DISTINCT cusip FROM fund_holdings fh
           JOIN superinvestors s ON s.id = fh.fund_id
           WHERE s.source = 'es-cnmv' AND fh.cusip IS NOT NULL AND fh.cusip != ''`
        ).all();
        const isins = (rows || []).map(r => r.cusip).filter(i => i && i.length === 12);
        const resolved = {};
        const unresolved = [];
        for (const isin of isins) {
          try {
            // FMP Ultimate: /stable/search-isin?isin=XX...
            const r = await fetch(`https://financialmodelingprep.com/stable/search-isin?isin=${isin}&apikey=${FMP_KEY}`);
            if (r.ok) {
              const data = await r.json();
              if (Array.isArray(data) && data.length > 0 && data[0]?.symbol) {
                resolved[isin] = data[0].symbol;
                continue;
              }
            }
            unresolved.push(isin);
          } catch { unresolved.push(isin); }
        }
        // Batch update fund_holdings.ticker to the resolved symbol
        // (keep the old ES:ISIN as a fallback in `cusip` so UI can still show it)
        const updates = [];
        for (const [isin, symbol] of Object.entries(resolved)) {
          updates.push(
            env.DB.prepare(`UPDATE fund_holdings SET ticker = ? WHERE cusip = ? AND ticker LIKE 'ES:%'`).bind(symbol, isin)
          );
        }
        if (updates.length > 0) await env.DB.batch(updates);
        return json({ resolvedCount: Object.keys(resolved).length, unresolvedCount: unresolved.length, resolved, unresolved }, corsHeaders);
      }

      // POST /api/funds/seed-spanish — seeds fund_holdings from the bundled
      // SPANISH_FUNDS_1S2025 constant (parsed from Cobas/Magallanes/azValor
      // CNMV-filed semestral PDFs). Idempotent. Inserts BOTH quarters
      // (2025-Q2 current and 2024-Q4 prior) so we can show "NEW this
      // quarter" badges in the UI.
      if (path === "/api/funds/seed-spanish" && request.method === "POST") {
        const data = SPANISH_FUNDS_1S2025;
        const qCur = data.quarter_current;
        const qPrev = data.quarter_prior;
        const summary = [];
        for (const [fundId, fund] of Object.entries(data.funds)) {
          const stmts = [];
          stmts.push(env.DB.prepare(`DELETE FROM fund_holdings WHERE fund_id = ? AND quarter IN (?, ?)`).bind(fundId, qCur, qPrev));
          const insertStmt = env.DB.prepare(
            `INSERT OR REPLACE INTO fund_holdings (fund_id, quarter, ticker, cusip, name, shares, value_usd, weight_pct, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          );
          let insertedCur = 0, insertedPrev = 0;
          for (const h of fund.holdings) {
            // Spanish funds don't have standardized tickers. Store ISIN in ticker field
            // (prefixed with 'ES:' to avoid colliding with US tickers), name fully.
            const tickerKey = h.isin ? `ES:${h.isin}` : `ES:${(h.name || '').slice(0, 20).replace(/\s+/g, '_')}`;
            if (h.w_now > 0) {
              stmts.push(insertStmt.bind(
                fundId, qCur, tickerKey, h.isin || '', h.name || '',
                0, Math.round((h.v_now || 0) * 1000), h.w_now || 0
              ));
              insertedCur++;
            }
            if (h.w_prev > 0) {
              stmts.push(insertStmt.bind(
                fundId, qPrev, tickerKey, h.isin || '', h.name || '',
                0, Math.round((h.v_prev || 0) * 1000), h.w_prev || 0
              ));
              insertedPrev++;
            }
          }
          stmts.push(env.DB.prepare(
            `UPDATE superinvestors SET last_quarter = ?, last_refreshed_at = datetime('now') WHERE id = ?`
          ).bind(qCur, fundId));
          await env.DB.batch(stmts);
          summary.push({ fund: fundId, qCur, qPrev, insertedCur, insertedPrev });
        }
        return json({ seeded: summary.length, summary }, corsHeaders);
      }

      // GET /api/funds/:id/diff?q1=...&q2=... — diff between two quarters
      // for a single fund. Returns per-ticker: was in q1, is in q2, new/removed/changed.
      const fundDiffMatch = path.match(/^\/api\/funds\/([a-z0-9_-]+)\/diff$/);
      if (fundDiffMatch && request.method === "GET") {
        const fundId = fundDiffMatch[1];
        const q1 = url.searchParams.get('q1'); // prior quarter
        const q2 = url.searchParams.get('q2'); // current quarter
        if (!q1 || !q2) return json({ error: "q1 and q2 required" }, corsHeaders, 400);
        // D1/SQLite doesn't support FULL OUTER JOIN — union two queries in JS
        const a = (await env.DB.prepare(`SELECT ticker, name, weight_pct AS w, value_usd AS v FROM fund_holdings WHERE fund_id = ? AND quarter = ?`).bind(fundId, q1).all()).results || [];
        const b = (await env.DB.prepare(`SELECT ticker, name, weight_pct AS w, value_usd AS v FROM fund_holdings WHERE fund_id = ? AND quarter = ?`).bind(fundId, q2).all()).results || [];
        const map = {};
        a.forEach(r => { map[r.ticker] = { ticker: r.ticker, name: r.name, w_prev: r.w || 0, v_prev: r.v || 0, w_now: 0, v_now: 0 }; });
        b.forEach(r => {
          if (!map[r.ticker]) map[r.ticker] = { ticker: r.ticker, name: r.name, w_prev: 0, v_prev: 0, w_now: 0, v_now: 0 };
          map[r.ticker].w_now = r.w || 0;
          map[r.ticker].v_now = r.v || 0;
          if (r.name) map[r.ticker].name = r.name;
        });
        const diff = Object.values(map)
          .map(r => {
            let status;
            if (r.w_prev === 0 && r.w_now > 0) status = 'NEW';
            else if (r.w_now === 0 && r.w_prev > 0) status = 'SOLD';
            else if (r.w_now > r.w_prev * 1.5) status = 'ADDED';
            else if (r.w_now < r.w_prev * 0.5) status = 'REDUCED';
            else status = 'HELD';
            return { ...r, delta_pct: r.w_now - r.w_prev, status };
          })
          .sort((x, y) => (y.w_now || 0) - (x.w_now || 0));
        return json({ fundId, q1, q2, diff }, corsHeaders);
      }

      // GET /api/funds/:id — fund detail with current quarter top holdings
      const fundDetailMatch = path.match(/^\/api\/funds\/([a-z0-9_-]+)$/);
      const RESERVED_FUND_PATHS = new Set(['list', 'consensus', 'refresh', 'by-ticker', 'by-tickers', 'seed-spanish', 'cik-search', 'resolve-isins', 'alerts']);
      if (fundDetailMatch && request.method === "GET" && !RESERVED_FUND_PATHS.has(fundDetailMatch[1])) {
        const fundId = fundDetailMatch[1];
        const fund = await env.DB.prepare(`SELECT * FROM superinvestors WHERE id = ?`).bind(fundId).first();
        if (!fund) return json({ error: "Fund not found" }, corsHeaders, 404);
        const quarter = url.searchParams.get('quarter') || fund.last_quarter;
        const { results: holdings } = await env.DB.prepare(
          `SELECT ticker, name, shares, value_usd, weight_pct
           FROM fund_holdings WHERE fund_id = ? AND quarter = ?
           ORDER BY weight_pct DESC LIMIT 50`
        ).bind(fundId, quarter).all();
        return json({ fund, quarter, holdings: holdings || [] }, corsHeaders);
      }

      // GET /api/funds/by-ticker/:ticker — which superinvestors hold this ticker
      const byTickerMatch = path.match(/^\/api\/funds\/by-ticker\/([^/]+)$/);
      if (byTickerMatch && request.method === "GET") {
        const ticker = decodeURIComponent(byTickerMatch[1]).toUpperCase();
        const { results } = await env.DB.prepare(
          `SELECT fh.fund_id, s.name AS fund_name, s.manager, s.style, s.conviction,
                  fh.quarter, fh.shares, fh.value_usd, fh.weight_pct
           FROM fund_holdings fh
           JOIN superinvestors s ON s.id = fh.fund_id
           WHERE fh.ticker = ? AND s.followed = 1 AND fh.quarter = s.last_quarter
           ORDER BY fh.weight_pct DESC`
        ).bind(ticker).all();
        return json({ ticker, holders: results || [] }, corsHeaders);
      }

      // GET /api/funds/consensus?min=3 — tickers held by ≥N superinvestors
      if (path === "/api/funds/consensus" && request.method === "GET") {
        const minHolders = Math.max(2, parseInt(url.searchParams.get('min') || '3', 10));
        const { results } = await env.DB.prepare(
          `SELECT fh.ticker, fh.name, COUNT(DISTINCT fh.fund_id) AS holders_count,
                  SUM(fh.value_usd) AS total_value_usd,
                  AVG(fh.weight_pct) AS avg_weight_pct,
                  GROUP_CONCAT(s.name, ' | ') AS holder_names
           FROM fund_holdings fh
           JOIN superinvestors s ON s.id = fh.fund_id
           WHERE s.followed = 1 AND fh.quarter = s.last_quarter
           GROUP BY fh.ticker
           HAVING holders_count >= ?
           ORDER BY holders_count DESC, total_value_usd DESC
           LIMIT 100`
        ).bind(minHolders).all();
        return json({ minHolders, picks: results || [] }, corsHeaders);
      }

      // GET /api/funds/alerts — material changes across all followed funds
      // between their last_quarter and the quarter immediately before.
      // Returns grouped by tier: CRITICAL (ticker in portfolio), WATCH
      // (ticker in holdings of the 'watchlist' list), INFO (ticker in any
      // other fund too). Applies materiality filters from the design doc:
      //   NEW   : w_prev == 0 && w_now >= 3%
      //   SOLD  : w_prev >= 3% && w_now == 0
      //   ADDED : w_now >= 2% && w_now >= w_prev * 2 (doubled)
      //   REDUCED: w_prev >= 2% && w_now <= w_prev * 0.5 (halved)
      if (path === "/api/funds/alerts" && request.method === "GET") {
        // Load followed funds with both current and prior quarter labels.
        const { results: funds } = await env.DB.prepare(
          `SELECT id, name, manager, conviction, source, last_quarter FROM superinvestors WHERE followed = 1 AND last_quarter IS NOT NULL`
        ).all();
        if (!funds?.length) return json({ alerts: [], stats: {} }, corsHeaders);

        // Find prior quarter for each fund (the one just before last_quarter)
        const priorForFund = {};
        for (const f of funds) {
          // Parse YYYY-QN
          const m = String(f.last_quarter || '').match(/^(\d{4})-Q([1-4])$/);
          if (!m) continue;
          let y = parseInt(m[1], 10), q = parseInt(m[2], 10) - 1;
          if (q === 0) { q = 4; y -= 1; }
          priorForFund[f.id] = `${y}-Q${q}`;
        }

        // Load user's portfolio + watchlist tickers for relevance scoring
        const { results: posRows } = await env.DB.prepare(
          `SELECT ticker, list FROM positions WHERE shares > 0`
        ).all();
        const inPortfolio = new Set((posRows || []).filter(r => r.list === 'portfolio' || !r.list).map(r => r.ticker.toUpperCase()));
        const inWatchlist = new Set((posRows || []).filter(r => r.list === 'watchlist').map(r => r.ticker.toUpperCase()));

        const alerts = [];
        for (const fund of funds) {
          const prevQ = priorForFund[fund.id];
          if (!prevQ) continue;
          const [a, b] = await Promise.all([
            env.DB.prepare(`SELECT ticker, name, weight_pct AS w, value_usd AS v FROM fund_holdings WHERE fund_id = ? AND quarter = ?`).bind(fund.id, prevQ).all(),
            env.DB.prepare(`SELECT ticker, name, weight_pct AS w, value_usd AS v FROM fund_holdings WHERE fund_id = ? AND quarter = ?`).bind(fund.id, fund.last_quarter).all(),
          ]);
          const map = {};
          (a.results || []).forEach(r => { map[r.ticker] = { ticker: r.ticker, name: r.name, w_prev: r.w || 0, w_now: 0, v_prev: r.v || 0, v_now: 0 }; });
          (b.results || []).forEach(r => {
            if (!map[r.ticker]) map[r.ticker] = { ticker: r.ticker, name: r.name, w_prev: 0, w_now: 0, v_prev: 0, v_now: 0 };
            map[r.ticker].w_now = r.w || 0;
            map[r.ticker].v_now = r.v || 0;
            if (r.name) map[r.ticker].name = r.name;
          });
          for (const r of Object.values(map)) {
            let status = null;
            if (r.w_prev === 0 && r.w_now >= 3)            status = 'NEW';
            else if (r.w_prev >= 3 && r.w_now === 0)       status = 'SOLD';
            else if (r.w_now >= 2 && r.w_now >= r.w_prev * 2 && r.w_prev > 0) status = 'ADDED';
            else if (r.w_prev >= 2 && r.w_now > 0 && r.w_now <= r.w_prev * 0.5) status = 'REDUCED';
            if (!status) continue;

            const tickerUpper = (r.ticker || '').toUpperCase();
            // ES: prefix tickers are unresolved Spanish ISINs — strip for matching
            const tickerMatch = tickerUpper.startsWith('ES:') ? tickerUpper.slice(3) : tickerUpper;
            let tier = 'INFO';
            if (inPortfolio.has(tickerMatch) || inPortfolio.has(tickerUpper)) tier = 'CRITICAL';
            else if (inWatchlist.has(tickerMatch) || inWatchlist.has(tickerUpper)) tier = 'WATCH';

            alerts.push({
              fund_id: fund.id,
              fund_name: fund.name,
              manager: fund.manager,
              source: fund.source,
              conviction: fund.conviction,
              quarter: fund.last_quarter,
              prev_quarter: prevQ,
              ticker: r.ticker,
              name: r.name,
              status,
              tier,
              w_now: r.w_now,
              w_prev: r.w_prev,
              delta_pct: r.w_now - r.w_prev,
              value_now_usd: r.v_now,
            });
          }
        }

        // Sort: CRITICAL first, then WATCH, then INFO; within each, by delta magnitude × conviction
        const tierOrder = { CRITICAL: 3, WATCH: 2, INFO: 1 };
        alerts.sort((x, y) => {
          const t = (tierOrder[y.tier] || 0) - (tierOrder[x.tier] || 0);
          if (t) return t;
          return Math.abs(y.delta_pct) * (y.conviction || 3) - Math.abs(x.delta_pct) * (x.conviction || 3);
        });

        const stats = {
          total: alerts.length,
          critical: alerts.filter(a => a.tier === 'CRITICAL').length,
          watch: alerts.filter(a => a.tier === 'WATCH').length,
          info: alerts.filter(a => a.tier === 'INFO').length,
          byStatus: {
            NEW: alerts.filter(a => a.status === 'NEW').length,
            SOLD: alerts.filter(a => a.status === 'SOLD').length,
            ADDED: alerts.filter(a => a.status === 'ADDED').length,
            REDUCED: alerts.filter(a => a.status === 'REDUCED').length,
          },
        };

        return json({ alerts, stats }, corsHeaders);
      }

      // POST /api/funds/refresh?fund_id=... — fetch latest 13F from FMP.
      // Without fund_id: refreshes ALL followed funds (slower).
      // Fetches BOTH the current target quarter AND the prior one so the
      // /api/funds/changes and alerts endpoints have diff data available.
      // FMP Ultimate exposes 13F under /stable/institutional-ownership/extract.
      if (path === "/api/funds/refresh" && request.method === "POST") {
        const FMP_KEY = env.FMP_KEY;
        if (!FMP_KEY) return json({ error: "FMP_KEY not configured" }, corsHeaders, 500);
        const onlyFundId = url.searchParams.get('fund_id');

        const fundsRows = onlyFundId
          ? await env.DB.prepare(`SELECT id, cik, name FROM superinvestors WHERE id = ? AND followed = 1`).bind(onlyFundId).all()
          : await env.DB.prepare(`SELECT id, cik, name FROM superinvestors WHERE followed = 1 AND cik IS NOT NULL`).all();
        const funds = fundsRows.results || [];

        // Compute target (most recently filed) and prior quarter.
        // Filings have ~45-day delay: Q4 2025 filed mid-Feb 2026.
        const now = new Date();
        const m = now.getMonth() + 1; // 1-12
        let curYear = now.getFullYear();
        let curQ;
        if (m <= 2)       { curYear -= 1; curQ = 3; }   // Jan-Feb → Q3 prev year
        else if (m <= 5)  { curYear -= 1; curQ = 4; }   // Mar-May → Q4 prev year
        else if (m <= 8)  { curQ = 1; }                 // Jun-Aug → Q1 this year
        else if (m <= 11) { curQ = 2; }                 // Sep-Nov → Q2 this year
        else              { curQ = 3; }                 // Dec     → Q3 this year
        let prevYear = curYear, prevQ = curQ - 1;
        if (prevQ === 0) { prevQ = 4; prevYear -= 1; }
        const curQuarter = `${curYear}-Q${curQ}`;
        const prevQuarter = `${prevYear}-Q${prevQ}`;

        const fetchHoldingsForQuarter = async (cik, year, quarter) => {
          const stableUrl = `https://financialmodelingprep.com/stable/institutional-ownership/extract?cik=${cik}&year=${year}&quarter=${quarter}&apikey=${FMP_KEY}`;
          const r = await fetch(stableUrl);
          if (!r.ok) return { rows: [], error: `status ${r.status}` };
          const data = await r.json();
          if (!Array.isArray(data)) return { rows: [], error: 'not array' };
          return { rows: data };
        };

        const buildInsertStatements = (fundId, quarter, rows) => {
          const totalValue = rows.reduce((s, row) => s + (Number(row.value || row.marketValue) || 0), 0);
          const stmts = [];
          stmts.push(env.DB.prepare(`DELETE FROM fund_holdings WHERE fund_id = ? AND quarter = ?`).bind(fundId, quarter));
          const insertStmt = env.DB.prepare(
            `INSERT OR REPLACE INTO fund_holdings (fund_id, quarter, ticker, cusip, name, shares, value_usd, weight_pct, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          );
          let inserted = 0;
          for (const row of rows) {
            const ticker = String(row.symbol || row.tickercusip || row.ticker || '').toUpperCase();
            if (!ticker || ticker.length > 12) continue;
            const value = Number(row.value || row.marketValue) || 0;
            const shares = Number(row.shares || row.sharesNumber) || 0;
            const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;
            stmts.push(insertStmt.bind(
              fundId, quarter, ticker,
              row.cusip || '', row.securityName || row.nameOfIssuer || '',
              shares, value, weight
            ));
            inserted++;
          }
          return { stmts, inserted, totalValue };
        };

        const summary = [];
        for (const fund of funds) {
          try {
            // Fetch both quarters in parallel
            const [curRes, prevRes] = await Promise.all([
              fetchHoldingsForQuarter(fund.cik, curYear, curQ),
              fetchHoldingsForQuarter(fund.cik, prevYear, prevQ),
            ]);
            if (!curRes.rows.length) {
              summary.push({ fund: fund.id, ok: false, reason: curRes.error || 'empty' });
              continue;
            }
            // Combine all writes for both quarters into one batch
            const curBuild = buildInsertStatements(fund.id, curQuarter, curRes.rows);
            const allStmts = [...curBuild.stmts];
            let prevInserted = 0;
            if (prevRes.rows.length > 0) {
              const prevBuild = buildInsertStatements(fund.id, prevQuarter, prevRes.rows);
              allStmts.push(...prevBuild.stmts);
              prevInserted = prevBuild.inserted;
            }
            allStmts.push(env.DB.prepare(
              `UPDATE superinvestors SET last_quarter = ?, last_refreshed_at = datetime('now') WHERE id = ?`
            ).bind(curQuarter, fund.id));
            await env.DB.batch(allStmts);
            summary.push({
              fund: fund.id, ok: true,
              curQuarter, prevQuarter,
              curInserted: curBuild.inserted,
              prevInserted,
              totalValue: curBuild.totalValue,
            });
          } catch(e) {
            summary.push({ fund: fund.id, ok: false, error: e.message });
          }
        }
        return json({ refreshed: summary.length, curQuarter, prevQuarter, summary }, corsHeaders);
      }

      // GET /api/patrimonio — todos los snapshots
      if (path === "/api/patrimonio" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM patrimonio ORDER BY fecha DESC LIMIT 500"
        ).all();
        return json(results, corsHeaders);
      }

      // POST /api/patrimonio — añadir snapshot
      if (path === "/api/patrimonio" && request.method === "POST") {
        const body = await parseBody(request);
        const fechaErr = validateFecha(body.fecha);
        if (fechaErr) return validationError(fechaErr, corsHeaders);
        const numErr = validateNumber(body.total_usd, 'total_usd') || validateNumber(body.total_eur, 'total_eur');
        if (numErr) return validationError(numErr, corsHeaders);
        await env.DB.prepare(
          `INSERT INTO patrimonio (fecha, fx_eur_usd, bank, broker, fondos, crypto, hipoteca, total_usd, total_eur, salary, notas,
           construction_bank_cny, fx_eur_cny, salary_usd, salary_cny, gold_grams, gold_eur, btc_amount, btc_eur)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(body.fecha, body.fx_eur_usd, body.bank, body.broker, body.fondos, body.crypto||0, body.hipoteca||0,
          body.total_usd, body.total_eur, body.salary||0, body.notas||'',
          body.construction_bank_cny||0, body.fx_eur_cny||0, body.salary_usd||0, body.salary_cny||0,
          body.gold_grams||0, body.gold_eur||0, body.btc_amount||0, body.btc_eur||0).run();
        return json({ success: true }, corsHeaders);
      }

      // PUT /api/patrimonio/:id — editar snapshot existente
      if (path.match(/\/api\/patrimonio\/\d+$/) && request.method === "PUT") {
        const id = parseInt(path.split("/").pop(), 10);
        const body = await parseBody(request);
        await env.DB.prepare(
          `UPDATE patrimonio SET fecha=?, fx_eur_usd=?, bank=?, broker=?, fondos=?, crypto=?, hipoteca=?,
           total_usd=?, total_eur=?, salary=?, notas=?,
           construction_bank_cny=?, fx_eur_cny=?, salary_usd=?, salary_cny=?,
           gold_grams=?, gold_eur=?, btc_amount=?, btc_eur=?, updated_at=datetime('now')
           WHERE id=?`
        ).bind(body.fecha, body.fx_eur_usd, body.bank, body.broker, body.fondos, body.crypto||0, body.hipoteca||0,
          body.total_usd, body.total_eur, body.salary||0, body.notas||'',
          body.construction_bank_cny||0, body.fx_eur_cny||0, body.salary_usd||0, body.salary_cny||0,
          body.gold_grams||0, body.gold_eur||0, body.btc_amount||0, body.btc_eur||0, id).run();
        return json({ success: true }, corsHeaders);
      }

      // GET /api/dividendos — con filtros opcionales
      if (path === "/api/dividendos" && request.method === "GET") {
        const year = url.searchParams.get("year");
        const ticker = url.searchParams.get("ticker");
        let query = "SELECT * FROM dividendos";
        const params = [];
        const conditions = [];
        
        if (year) { conditions.push("fecha LIKE ?"); params.push(year + "%"); }
        if (ticker) { conditions.push("ticker = ?"); params.push(ticker.toUpperCase()); }
        if (conditions.length) query += " WHERE " + conditions.join(" AND ");
        query += " ORDER BY fecha DESC LIMIT 5000";

        const { results } = await env.DB.prepare(query).bind(...params).all();
        return json(results, corsHeaders);
      }

      // GET /api/dividendos/resumen — por año (en USD)
      if (path === "/api/dividendos/resumen" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT substr(fecha,1,4) as anio,
           ROUND(SUM(CASE WHEN bruto_usd > 0 THEN bruto_usd ELSE bruto END),2) as bruto,
           ROUND(SUM(CASE WHEN neto_usd > 0 THEN neto_usd ELSE neto END),2) as neto,
           COUNT(*) as cobros
           FROM dividendos GROUP BY substr(fecha,1,4) ORDER BY anio DESC`
        ).all();
        return json(results, corsHeaders);
      }

      // GET /api/dividendos/mensual — por mes (en USD)
      if (path === "/api/dividendos/mensual" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT substr(fecha,1,7) as mes,
           ROUND(SUM(CASE WHEN bruto_usd > 0 THEN bruto_usd ELSE bruto END),2) as bruto,
           ROUND(SUM(CASE WHEN neto_usd > 0 THEN neto_usd ELSE neto END),2) as neto,
           COUNT(*) as cobros
           FROM dividendos GROUP BY substr(fecha,1,7) ORDER BY mes DESC`
        ).all();
        return json(results, corsHeaders);
      }

      // GET /api/dividendos/por-ticker
      if (path === "/api/dividendos/por-ticker" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT ticker,
                  ROUND(SUM(CASE WHEN bruto_usd > 0 THEN bruto_usd ELSE bruto END),2) as bruto,
                  ROUND(SUM(CASE WHEN neto_usd > 0 THEN neto_usd ELSE neto END),2) as neto,
                  COUNT(*) as cobros,
                  MIN(fecha) as primero, MAX(fecha) as ultimo
           FROM dividendos GROUP BY ticker ORDER BY neto DESC LIMIT 500`
        ).all();
        return json(results, corsHeaders);
      }

      // POST /api/dividendos — añadir dividendo (con dedup)
      if (path === "/api/dividendos" && request.method === "POST") {
        const body = await parseBody(request);
        const fechaErr = validateFecha(body.fecha);
        if (fechaErr) return validationError(fechaErr, corsHeaders);
        const reqErr = validateRequired(body.ticker, 'ticker') || validateNumber(body.bruto, 'bruto');
        if (reqErr) return validationError(reqErr, corsHeaders);
        const dup = await env.DB.prepare(
          "SELECT id FROM dividendos WHERE fecha=? AND ticker=? AND ABS(bruto - ?) < 0.01"
        ).bind(body.fecha, body.ticker, body.bruto).first();
        if (dup) return json({ success: true, skipped: true, id: dup.id }, corsHeaders);
        await env.DB.prepare(
          `INSERT INTO dividendos (fecha, ticker, bruto, neto, divisa, shares, notas,
           wht_rate, wht_amount, spain_rate, spain_tax, fx_eur, dps_gross, dps_net,
           commission, excess_irpf, excess_foreign, broker, company)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(body.fecha, body.ticker, body.bruto, body.neto, body.divisa || 'USD', body.shares, body.notas,
          body.wht_rate || 0, body.wht_amount || 0, body.spain_rate || 0, body.spain_tax || 0,
          body.fx_eur || 0, body.dps_gross || 0, body.dps_net || 0,
          body.commission || 0, body.excess_irpf || 0, body.excess_foreign || 0,
          body.broker || null, body.company || null).run();
        return json({ success: true }, corsHeaders);
      }

      // GET /api/gastos — con filtros
      if (path === "/api/gastos" && request.method === "GET") {
        const month = url.searchParams.get("month");
        const cat = url.searchParams.get("categoria");
        const limit = parseInt(url.searchParams.get("limit"), 10) || 0;
        let query = "SELECT * FROM gastos";
        const params = [];
        const conditions = [];

        if (month) { conditions.push("fecha >= ? AND fecha < ?"); params.push(month + "-01"); const [y,m] = month.split("-").map(Number); const nm = m===12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,"0")}`; params.push(nm + "-01"); }
        if (cat) { conditions.push("categoria = ?"); params.push(cat); }
        if (conditions.length) query += " WHERE " + conditions.join(" AND ");
        query += " ORDER BY fecha DESC";
        const effectiveLimit = limit > 0 ? Math.min(limit, 10000) : 10000;
        query += " LIMIT ?"; params.push(effectiveLimit);

        const { results } = await env.DB.prepare(query).bind(...params).all();
        return json(results, corsHeaders);
      }

      // GET /api/gastos/mensual — resumen por mes y divisa
      if (path === "/api/gastos/mensual" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM gastos_mensuales ORDER BY mes DESC LIMIT 200"
        ).all();
        return json(results, corsHeaders);
      }

      // POST /api/gastos — añadir gasto
      if (path === "/api/gastos" && request.method === "POST") {
        const body = await parseBody(request);
        const fechaErr = validateFecha(body.fecha);
        if (fechaErr) return validationError(fechaErr, corsHeaders);
        const reqErr = validateRequired(body.categoria, 'categoria') || validateNumber(body.importe, 'importe');
        if (reqErr) return validationError(reqErr, corsHeaders);
        // Convention: gastos are always stored as negative amounts
        const amt = -Math.abs(parseFloat(body.importe) || 0);
        // Auto-detect lugar_tag from description
        const autoLugar = detectLugarTag(body.descripcion || "", body.divisa || "EUR");
        await env.DB.prepare(
          `INSERT INTO gastos (fecha, categoria, importe, divisa, descripcion, lugar_tag, china_obligatorio)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(body.fecha, body.categoria, amt, body.divisa || 'EUR', body.descripcion, autoLugar, autoLugar === "china" ? 1 : 0).run();
        return json({ success: true, lugar_tag: autoLugar }, corsHeaders);
      }

      // POST /api/gastos/import-csv — import from Wallet app CSV
      if (path === "/api/gastos/import-csv" && request.method === "POST") {
        const body = await parseBody(request);
        const csvText = body.csv;
        if (!csvText) return json({ error: "Missing csv field" }, corsHeaders, 400);

        const CATEGORY_MAP = {
          "SuperMercado": "SUP",
          "Comidas y Cenas": "COM",
          "Transporte, cargas, gasolina, Parking.": "TRA",
          "Ropa": "ROP",
          "Healthcare": "HEA",
          "Subscripciones Casa": "SUB",
          "Caprichos": "CAP",
          "Deportes & Hobby's": "DEP",
          "Utilities China": "UCH",
          "Utility's Costa Brava": "UTI",
          "Regalos": "REG",
          "Educación": "EDU",
          "Other": "OTH",
        };

        const SKIP_NOTES = ["To Interactive Brokers", "To FONDO", "Exchanged to"];

        // Parse CSV respecting quoted fields
        function parseCSVLine(line) {
          const fields = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
            current += ch;
          }
          fields.push(current.trim());
          return fields;
        }

        const lines = csvText.split("\n").filter(l => l.trim());
        // Skip header row
        const dataLines = lines.slice(1);

        let imported = 0, skipped = 0, duplicates = 0;

        for (const line of dataLines) {
          const fields = parseCSVLine(line);
          if (fields.length < 9) { skipped++; continue; }

          const [dateStr, wallet, type, categoryName, amountStr, currency, note] = fields;

          // Skip income rows
          if (type === "Income") { skipped++; continue; }

          // Skip transfers between own accounts
          if (note && SKIP_NOTES.some(s => note.includes(s))) { skipped++; continue; }
          // Skip transfers to own IBANs (IBAN pattern)
          if (note && /^[A-Z]{2}\d{2}[A-Z0-9]{4,}/.test(note.trim())) { skipped++; continue; }

          let categoria = CATEGORY_MAP[categoryName] || "OTH";
          // Apply learned rules — override CSV category if we have a better match
          const rule = await applyGastoRules(env, note || categoryName);
          if (rule && rule.categoria) categoria = rule.categoria;
          // Convention: gastos stored as negative amounts
          const importe = -Math.abs(parseFloat(amountStr));
          if (isNaN(importe) || importe === 0) { skipped++; continue; }

          const fecha = dateStr.substring(0, 10); // YYYY-MM-DD from ISO string
          const divisa = currency || "EUR";
          const isChina = wallet && wallet.toLowerCase().includes("china");
          const descripcion = isChina ? `{china} ${note || categoryName}` : (note || categoryName);

          // Check for duplicates (match negative amount)
          const dup = await env.DB.prepare(
            `SELECT id FROM gastos WHERE fecha = ? AND categoria = ? AND ABS(importe - ?) < 0.01 AND divisa = ? LIMIT 1`
          ).bind(fecha, categoria, importe, divisa).first();

          if (dup) { duplicates++; continue; }

          const autoLugar = (rule && rule.lugar_tag) || detectLugarTag(descripcion, divisa);
          await env.DB.prepare(
            `INSERT INTO gastos (fecha, categoria, importe, divisa, descripcion, lugar_tag, china_obligatorio) VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(fecha, categoria, importe, divisa, descripcion, autoLugar, autoLugar === "china" ? 1 : 0).run();
          imported++;
        }

        return json({ imported, skipped, duplicates }, corsHeaders);
      }

      // GET /api/ingresos
      if (path === "/api/ingresos" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM ingresos ORDER BY mes DESC LIMIT 200"
        ).all();
        return json(results, corsHeaders);
      }

      // POST /api/ingresos
      if (path === "/api/ingresos" && request.method === "POST") {
        const body = await parseBody(request);
        await env.DB.prepare(
          `INSERT OR REPLACE INTO ingresos (mes, dividendos, covered_calls, rop, roc, cal, leaps, total, gastos_usd, salary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(body.mes, body.dividendos, body.covered_calls, body.rop, body.roc, body.cal, body.leaps, body.total, body.gastos_usd, body.salary).run();
        return json({ success: true }, corsHeaders);
      }

      // GET /api/holdings
      if (path === "/api/holdings" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM holdings ORDER BY div_total DESC LIMIT 500"
        ).all();
        return json(results, corsHeaders);
      }

      // PUT /api/holdings/:ticker — update holding fields (estrategia, categoria, etc)
      if (path.startsWith("/api/holdings/") && request.method === "PUT") {
        const ticker = decodeURIComponent(path.split("/api/holdings/")[1]);
        const body = await parseBody(request);
        const fields = [];
        const values = [];
        if (body.estrategia !== undefined) { fields.push("estrategia=?"); values.push(body.estrategia); }
        if (body.categoria !== undefined) { fields.push("categoria=?"); values.push(body.categoria); }
        if (body.shares !== undefined) { fields.push("shares=?"); values.push(body.shares); }
        if (body.avg_cost !== undefined) { fields.push("avg_cost=?"); values.push(body.avg_cost); }
        if (body.activo !== undefined) { fields.push("activo=?"); values.push(body.activo); }
        if (body.notas !== undefined) { fields.push("notas=?"); values.push(body.notas); }
        if (body.sector !== undefined) { fields.push("sector=?"); values.push(body.sector); }
        if (body.industry !== undefined) { fields.push("industry=?"); values.push(body.industry); }
        if (body.market_cap !== undefined) { fields.push("market_cap=?"); values.push(body.market_cap); }
        if (body.country !== undefined) { fields.push("country=?"); values.push(body.country); }
        if (fields.length === 0) return json({ error: "No fields to update" }, corsHeaders);
        fields.push("updated_at=datetime('now')");
        values.push(ticker);
        await env.DB.prepare(`UPDATE holdings SET ${fields.join(",")} WHERE ticker=?`).bind(...values).run();
        return json({ success: true, ticker }, corsHeaders);
      }

      // POST /api/trades — añadir trade (uso diario)
      if (path === "/api/trades" && request.method === "POST") {
        const body = await parseBody(request);
        const fechaErr = validateFecha(body.fecha);
        if (fechaErr) return validationError(fechaErr, corsHeaders);
        const reqErr = validateRequired(body.ticker, 'ticker') || validateRequired(body.tipo, 'tipo');
        if (reqErr) return validationError(reqErr, corsHeaders);
        await env.DB.prepare(
          `INSERT INTO trades (fecha, ticker, tipo, shares, precio, comision, importe, divisa, fuente, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(body.fecha, body.ticker, body.tipo, body.shares, body.precio, body.comision, body.importe, body.divisa || 'USD', body.fuente || 'manual', body.notas).run();
        return json({ success: true }, corsHeaders);
      }

      // GET /api/trades
      if (path === "/api/trades" && request.method === "GET") {
        const ticker = url.searchParams.get("ticker");
        let query = "SELECT * FROM trades";
        const params = [];
        if (ticker) { query += " WHERE ticker = ?"; params.push(ticker.toUpperCase()); }
        query += " ORDER BY fecha DESC LIMIT 200";
        const { results } = await env.DB.prepare(query).bind(...params).all();
        return json(results, corsHeaders);
      }

      // GET /api/fire
      if (path === "/api/fire" && request.method === "GET") {
        const [tracking, proyecciones, config] = await Promise.all([
          env.DB.prepare("SELECT * FROM fire_tracking ORDER BY mes DESC LIMIT 500").all(),
          env.DB.prepare("SELECT * FROM fire_proyecciones ORDER BY anio LIMIT 200").all(),
          env.DB.prepare("SELECT * FROM config WHERE clave = 'fire_params'").first(),
        ]);
        return json({
          tracking: tracking.results,
          proyecciones: proyecciones.results,
          params: config ? (() => { try { return JSON.parse(config.valor); } catch { return null; } })() : null,
        }, corsHeaders);
      }

      // GET /api/pl
      if (path === "/api/pl" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM pl_anual ORDER BY anio DESC LIMIT 50"
        ).all();
        return json(results, corsHeaders);
      }

      // GET /api/config
      if (path === "/api/config" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM config LIMIT 100").all();
        const obj = {};
        results.forEach(r => { try { obj[r.clave] = JSON.parse(r.valor); } catch { obj[r.clave] = r.valor; } });
        return json(obj, corsHeaders);
      }

      // GET /api/categorias
      if (path === "/api/categorias" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM gasto_categorias ORDER BY codigo LIMIT 200"
        ).all();
        return json(results, corsHeaders);
      }

      // GET /api/gasto-rules — learned categorization rules
      if (path === "/api/gasto-rules" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM gasto_rules ORDER BY learned_from, pattern LIMIT 500").all();
        return json(results, corsHeaders);
      }

      // GET /api/stats — resumen rápido para el dashboard
      if (path === "/api/stats" && request.method === "GET") {
        const [lastPatrimonio, divThisYear, divLastYear, totalGastos] = await Promise.all([
          env.DB.prepare("SELECT * FROM patrimonio ORDER BY fecha DESC LIMIT 1").first(),
          env.DB.prepare("SELECT ROUND(SUM(CASE WHEN neto_usd > 0 THEN neto_usd ELSE neto END),2) as total FROM dividendos WHERE fecha >= date('now','start of year')").first(),
          env.DB.prepare("SELECT ROUND(SUM(CASE WHEN neto_usd > 0 THEN neto_usd ELSE neto END),2) as total FROM dividendos WHERE fecha >= date('now','-1 year','start of year') AND fecha < date('now','start of year')").first(),
          env.DB.prepare("SELECT COUNT(*) as n FROM gastos").first(),
        ]);
        return json({
          patrimonio: lastPatrimonio,
          div_ytd: divThisYear?.total || 0,
          div_last_year: divLastYear?.total || 0,
          total_gastos_entries: totalGastos?.n || 0,
        }, corsHeaders);
      }

      // PUT /api/dividendos/:id — update dividendo with tax fields
      if (path.startsWith("/api/dividendos/") && request.method === "PUT") {
        const id = validateId(path.split("/").pop());
        if (!id) return validationError("Invalid id", corsHeaders);
        const body = await parseBody(request);
        const sets = [], vals = [];
        for (const [k, v] of Object.entries(body)) {
          if (['fecha','ticker','bruto','neto','divisa','shares','notas','wht_rate','wht_amount','spain_rate','spain_tax','fx_eur','dps_gross','dps_net','commission','excess_irpf','excess_foreign','broker','company'].includes(k)) {
            sets.push(`${k} = ?`); vals.push(v);
          }
        }
        if (!sets.length) return validationError("No fields to update", corsHeaders);
        vals.push(id);
        await env.DB.prepare(`UPDATE dividendos SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
        return json({ success: true }, corsHeaders);
      }

      // DELETE /api/dividendos/:id
      if (path.startsWith("/api/dividendos/") && request.method === "DELETE") {
        const id = validateId(path.split("/").pop());
        if (!id) return validationError("Invalid id", corsHeaders);
        await env.DB.prepare("DELETE FROM dividendos WHERE id = ?").bind(id).run();
        return json({ success: true, deleted: id }, corsHeaders);
      }

      // PUT /api/gastos/:id — update gasto
      if (path.startsWith("/api/gastos/") && request.method === "PUT") {
        const id = validateId(path.split("/").pop());
        if (!id) return validationError("Invalid id", corsHeaders);
        const body = await parseBody(request);
        if (body.fecha !== undefined) {
          const fechaErr = validateFecha(body.fecha);
          if (fechaErr) return validationError(fechaErr, corsHeaders);
        }
        if (body.importe !== undefined) {
          const numErr = validateNumber(body.importe, 'importe');
          if (numErr) return validationError(numErr, corsHeaders);
        }
        const sets = []; const vals = [];
        if (body.descripcion !== undefined) { sets.push("descripcion = ?"); vals.push(body.descripcion); }
        if (body.divisa !== undefined) { sets.push("divisa = ?"); vals.push(body.divisa); }
        if (body.categoria !== undefined) { sets.push("categoria = ?"); vals.push(body.categoria); }
        if (body.importe !== undefined) { sets.push("importe = ?"); vals.push(body.importe); }
        if (body.fecha !== undefined) { sets.push("fecha = ?"); vals.push(body.fecha); }
        if (body.china_obligatorio !== undefined) { sets.push("china_obligatorio = ?"); vals.push(body.china_obligatorio ? 1 : 0); }
        if (body.lugar_tag !== undefined) { sets.push("lugar_tag = ?"); vals.push(body.lugar_tag || null); }
        if (sets.length === 0) return json({ error: "Nothing to update" }, corsHeaders);
        vals.push(id);
        await env.DB.prepare(`UPDATE gastos SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
        // Auto-learn: if user changed category or lugar_tag, create a rule from the description
        if (body.categoria || body.lugar_tag !== undefined) {
          try {
            const gasto = await env.DB.prepare("SELECT descripcion, categoria, lugar_tag FROM gastos WHERE id = ?").bind(id).first();
            if (gasto && gasto.descripcion) {
              // Extract a clean pattern from the description (lowercase, strip {china}/{extra} tags, first 50 chars)
              const raw = (gasto.descripcion || "").replace(/\{china\}\s?/g,"").replace(/\{extra\}\s?/g,"").trim().toLowerCase().slice(0, 50);
              if (raw.length >= 3) {
                await env.DB.prepare(
                  "INSERT OR REPLACE INTO gasto_rules (pattern, categoria, lugar_tag, learned_from) VALUES (?, ?, ?, 'user')"
                ).bind(raw, gasto.categoria, gasto.lugar_tag || null).run();
              }
            }
          } catch {}
        }
        return json({ success: true, updated: id }, corsHeaders);
      }

      // POST /api/gastos/bulk-update — batch update
      if (path === "/api/gastos/bulk-update" && request.method === "POST") {
        const body = await parseBody(request);
        const updates = body.updates || [];
        let ok = 0, err = 0;
        for (const u of updates) {
          try {
            const sets = []; const vals = [];
            if (u.descripcion !== undefined) { sets.push("descripcion = ?"); vals.push(u.descripcion); }
            if (u.divisa !== undefined) { sets.push("divisa = ?"); vals.push(u.divisa); }
            if (u.categoria !== undefined) { sets.push("categoria = ?"); vals.push(u.categoria); }
            if (u.importe !== undefined) { sets.push("importe = ?"); vals.push(u.importe); }
            if (sets.length > 0) {
              vals.push(u.id);
              await env.DB.prepare(`UPDATE gastos SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
              ok++;
            }
          } catch(e) { console.error("bulk-update item error:", e.message); err++; }
        }
        return json({ success: true, updated: ok, errors: err }, corsHeaders);
      }

      // DELETE /api/gastos/:id
      if (path.startsWith("/api/gastos/") && request.method === "DELETE") {
        const id = validateId(path.split("/").pop());
        if (!id) return validationError("Invalid id", corsHeaders);
        await env.DB.prepare("DELETE FROM gastos WHERE id = ?").bind(id).run();
        return json({ success: true, deleted: id }, corsHeaders);
      }

      // DELETE /api/patrimonio/:id
      if (path.startsWith("/api/patrimonio/") && request.method === "DELETE") {
        const id = validateId(path.split("/").pop());
        if (!id) return validationError("Invalid id", corsHeaders);
        await env.DB.prepare("DELETE FROM patrimonio WHERE id = ?").bind(id).run();
        return json({ success: true, deleted: id }, corsHeaders);
      }

      // ─── COST BASIS ────────────────────────────────

      // GET /api/costbasis/all — all transactions with pagination and filters
      if (path === "/api/costbasis/all" && request.method === "GET") {
        const tipo = url.searchParams.get("tipo");
        const year = url.searchParams.get("year");
        const ticker = url.searchParams.get("ticker");
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "500", 10), 2000);
        const offset = parseInt(url.searchParams.get("offset") || "0", 10);
        let query = "SELECT * FROM cost_basis";
        const params = [];
        const conditions = [];
        if (tipo) { conditions.push("tipo = ?"); params.push(tipo.toUpperCase()); }
        if (year) { conditions.push("fecha LIKE ?"); params.push(year + "%"); }
        if (ticker) { conditions.push("ticker = ?"); params.push(ticker.toUpperCase()); }
        if (conditions.length) query += " WHERE " + conditions.join(" AND ");
        const sortCol = url.searchParams.get("sort") || "fecha";
        const sortDir = url.searchParams.get("dir") === "asc" ? "ASC" : "DESC";
        const validSorts = { fecha: "fecha", ticker: "ticker", tipo: "tipo", shares: "shares", precio: "precio", coste: "coste", div_total: "div_total" };
        const sortField = validSorts[sortCol] || "fecha";
        query += ` ORDER BY ${sortField} ${sortDir}, orden ASC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        const { results } = await env.DB.prepare(query).bind(...params).all();
        let countQuery = "SELECT COUNT(*) as total FROM cost_basis";
        const countParams = [];
        const countConditions = [];
        if (tipo) { countConditions.push("tipo = ?"); countParams.push(tipo.toUpperCase()); }
        if (year) { countConditions.push("fecha LIKE ?"); countParams.push(year + "%"); }
        if (ticker) { countConditions.push("ticker = ?"); countParams.push(ticker.toUpperCase()); }
        if (countConditions.length) countQuery += " WHERE " + countConditions.join(" AND ");
        const count = await env.DB.prepare(countQuery).bind(...countParams).first();
        return json({ results, total: count?.total || 0, limit, offset }, corsHeaders);
      }

      // GET /api/costbasis?ticker=DEO — transacciones de una empresa
      if (path === "/api/costbasis" && request.method === "GET") {
        const ticker = url.searchParams.get("ticker");
        if (!ticker) {
          // Return summary: ticker, count of transactions
          const { results } = await env.DB.prepare(
            `SELECT ticker, COUNT(*) as txns, 
                    SUM(CASE WHEN tipo='EQUITY' AND shares>0 THEN 1 ELSE 0 END) as buys,
                    SUM(CASE WHEN tipo='DIVIDENDS' THEN 1 ELSE 0 END) as divs,
                    SUM(CASE WHEN tipo='OPTION' THEN 1 ELSE 0 END) as opts
             FROM cost_basis GROUP BY ticker ORDER BY ticker`
          ).all();
          return json(results, corsHeaders);
        }
        const { results } = await env.DB.prepare(
          "SELECT * FROM cost_basis WHERE ticker = ? ORDER BY orden ASC"
        ).bind(ticker.toUpperCase()).all();
        return json(results, corsHeaders);
      }

      // POST /api/costbasis — añadir transacción (con dedup)
      if (path === "/api/costbasis" && request.method === "POST") {
        const b = await parseBody(request);
        const fechaErr = validateFecha(b.fecha);
        if (fechaErr) return validationError(fechaErr, corsHeaders);
        const reqErr = validateRequired(b.ticker, 'ticker') || validateRequired(b.tipo, 'tipo');
        if (reqErr) return validationError(reqErr, corsHeaders);
        const dup = await env.DB.prepare(
          "SELECT id FROM cost_basis WHERE fecha=? AND ticker=? AND tipo=? AND ABS(shares - ?) < 0.001 AND ABS(precio - ?) < 0.01"
        ).bind(b.fecha, b.ticker, b.tipo, b.shares||0, b.precio||0).first();
        if (dup) return json({ success: true, skipped: true, id: dup.id }, corsHeaders);
        await env.DB.prepare(
          `INSERT INTO cost_basis (ticker, fecha, tipo, shares, precio, comision, coste,
           opt_expiry, opt_tipo, opt_status, opt_contracts, opt_strike, opt_credit, opt_credit_total,
           dps, div_total, balance, total_shares, adjusted_basis, adjusted_basis_pct, div_yield_basis, orden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(b.ticker, b.fecha, b.tipo, b.shares||0, b.precio||0, b.comision||0, b.coste||0,
               b.opt_expiry||'', b.opt_tipo||'', b.opt_status||'', b.opt_contracts||0, b.opt_strike||0,
               b.opt_credit||0, b.opt_credit_total||0, b.dps||0, b.div_total||0, b.balance||0,
               b.total_shares||0, b.adjusted_basis||0, b.adjusted_basis_pct||0, b.div_yield_basis||0, b.orden||0).run();
        return json({ success: true }, corsHeaders);
      }

      // POST /api/costbasis/sync-dividends — auto-sync dividendos → cost_basis
      if (path === "/api/costbasis/sync-dividends" && request.method === "POST") {
        // Get all dividends from dividendos table
        const { results: allDivs } = await env.DB.prepare(
          "SELECT fecha, ticker, bruto, neto, divisa, shares FROM dividendos ORDER BY fecha"
        ).all();
        // Get existing DIVIDENDS in cost_basis for fast dedup
        const { results: existingDivs } = await env.DB.prepare(
          "SELECT fecha, ticker, div_total FROM cost_basis WHERE tipo = 'DIVIDENDS'"
        ).all();
        const existSet = new Set(existingDivs.map(d => `${d.fecha}|${d.ticker}|${Math.round((d.div_total||0)*100)}`));

        let inserted = 0, skipped = 0;
        // Get max orden for ordering
        const maxOrden = await env.DB.prepare("SELECT MAX(orden) as mx FROM cost_basis").first();
        let orden = (maxOrden?.mx || 0) + 1;

        for (const div of allDivs) {
          const key = `${div.fecha}|${div.ticker}|${Math.round((div.bruto||0)*100)}`;
          if (existSet.has(key)) { skipped++; continue; }
          const dps = div.shares > 0 ? (div.bruto / div.shares) : 0;
          await env.DB.prepare(
            `INSERT INTO cost_basis (ticker, fecha, tipo, shares, precio, comision, coste,
             opt_expiry, opt_tipo, opt_status, opt_contracts, opt_strike, opt_credit, opt_credit_total,
             dps, div_total, balance, total_shares, adjusted_basis, adjusted_basis_pct, div_yield_basis, orden)
             VALUES (?, ?, 'DIVIDENDS', ?, 0, 0, 0, '', '-', '-', 0, 0, 0, 0, ?, ?, 0, 0, 0, 0, 0, ?)`
          ).bind(div.ticker, div.fecha, div.shares || 0, dps, div.bruto || 0, orden).run();
          existSet.add(key);
          inserted++;
          orden++;
        }
        return json({ success: true, inserted, skipped, total: allDivs.length }, corsHeaders);
      }

      // DELETE /api/costbasis/:id
      if (path.startsWith("/api/costbasis/") && request.method === "DELETE") {
        const id = validateId(path.split("/").pop());
        if (!id) return validationError("Invalid id", corsHeaders);
        await env.DB.prepare("DELETE FROM cost_basis WHERE id = ?").bind(id).run();
        return json({ success: true, deleted: id }, corsHeaders);
      }

      // ─── CASH BALANCES ────────────────────────────────

      // GET /api/cash — all cash balance snapshots
      if (path === "/api/cash" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM cash_balances ORDER BY fecha DESC, cuenta, divisa LIMIT 2000"
        ).all();
        return json(results, corsHeaders);
      }

      // GET /api/cash/latest — latest snapshot per account/currency
      if (path === "/api/cash/latest" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT cb.* FROM cash_balances cb
           INNER JOIN (SELECT cuenta, divisa, MAX(fecha) as max_fecha FROM cash_balances GROUP BY cuenta, divisa) latest
           ON cb.cuenta = latest.cuenta AND cb.divisa = latest.divisa AND cb.fecha = latest.max_fecha
           ORDER BY cb.cuenta, cb.divisa`
        ).all();
        return json(results, corsHeaders);
      }

      // POST /api/cash — insert cash balance entry
      if (path === "/api/cash" && request.method === "POST") {
        const b = await parseBody(request);
        const fechaErr = validateFecha(b.fecha);
        if (fechaErr) return validationError(fechaErr, corsHeaders);
        const reqErr = validateRequired(b.cuenta, 'cuenta') || validateRequired(b.divisa, 'divisa') || validateNumber(b.cash_balance, 'cash_balance');
        if (reqErr) return validationError(reqErr, corsHeaders);
        // Dedup: check if same fecha+cuenta+divisa exists
        const existing = await env.DB.prepare(
          "SELECT id FROM cash_balances WHERE fecha = ? AND cuenta = ? AND divisa = ?"
        ).bind(b.fecha, b.cuenta, b.divisa).first();
        if (existing) {
          // Update existing
          await env.DB.prepare(
            `UPDATE cash_balances SET cash_balance=?, interest_paid=?, interest_received=?, fx_rate=?, cash_balance_usd=? WHERE id=?`
          ).bind(b.cash_balance, b.interest_paid||0, b.interest_received||0, b.fx_rate||1, b.cash_balance_usd||0, existing.id).run();
          return json({ success: true, updated: existing.id }, corsHeaders);
        }
        await env.DB.prepare(
          `INSERT INTO cash_balances (fecha, cuenta, divisa, cash_balance, interest_paid, interest_received, fx_rate, cash_balance_usd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(b.fecha, b.cuenta, b.divisa, b.cash_balance, b.interest_paid||0, b.interest_received||0, b.fx_rate||1, b.cash_balance_usd||0).run();
        return json({ success: true }, corsHeaders);
      }

      // ─── MARGIN INTEREST HISTORY ────────────────────

      // GET /api/margin-interest — historial completo
      if (path === "/api/margin-interest" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM margin_interest ORDER BY mes DESC, cuenta LIMIT 500"
        ).all();
        return json(results, corsHeaders);
      }

      // POST /api/margin-interest — insertar (dedup via UNIQUE)
      if (path === "/api/margin-interest" && request.method === "POST") {
        const b = await parseBody(request);
        const reqErr = validateRequired(b.mes, 'mes') || validateRequired(b.cuenta, 'cuenta') || validateNumber(b.interes, 'interes');
        if (reqErr) return validationError(reqErr, corsHeaders);
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO margin_interest (mes, cuenta, divisa, interes, interes_usd)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(b.mes, b.cuenta, b.divisa||'USD', b.interes, b.interes_usd).run();
        } catch(e) { console.error("margin_interest insert error:", e.message); }
        return json({ success: true }, corsHeaders);
      }

      // Health check
      if (path === "/api/health") {
        const test = await env.DB.prepare("SELECT COUNT(*) as n FROM patrimonio").first();
        return json({ status: "ok", patrimonio_rows: test?.n || 0 }, corsHeaders);
      }


      // ─── LIVE PRICES VIA FMP ULTIMATE ──────────────────────

      // GET /api/prices — get cached prices or refresh
      if (path === "/api/prices" && request.method === "GET") {
        const forceRefresh = url.searchParams.get("refresh") === "1";
        const liveMode = url.searchParams.get("live") === "1";

        // Check cache (stored in D1) — skip for live mode
        if (!forceRefresh && !liveMode) {
          try {
            const cached = await env.DB.prepare(
              "SELECT data, updated_at FROM price_cache WHERE id = 'latest'"
            ).first();
            if (cached && cached.data) {
              const age = Date.now() - new Date(cached.updated_at).getTime();
              if (age < 4 * 3600 * 1000) { // 4 hours
                return json({ prices: JSON.parse(cached.data), cached: true, updated: cached.updated_at }, corsHeaders);
              }
            }
          } catch(e) { console.error("price_cache read error:", e.message); }
        }

        // Fetch fresh prices from FMP Ultimate (batch quote)
        const allTickers = url.searchParams.get("tickers")?.split(",") || [];
        if (allTickers.length === 0) {
          return json({ error: "Pass ?tickers=AAPL,SCHD,..." }, corsHeaders);
        }

        const errors = [];
        const quoteMap = await fmpQuote(allTickers, env);
        const prices = {};
        for (const ticker of allTickers) {
          const q = quoteMap[ticker];
          if (!q || q.price == null) { errors.push({ ticker, error: "no quote" }); continue; }
          prices[ticker] = {
            ticker,
            price: q.price,
            prevClose: q.previousClose,
            currency: CURRENCY_MAP[ticker] || "USD",
            exchange: q.exchange,
            spark: [], // sparklines fetched below in non-live mode
            change: q.change ?? (q.price - (q.previousClose || q.price)),
            changePct: q.changesPercentage ?? (q.previousClose ? (q.price - q.previousClose) / q.previousClose * 100 : 0),
            dayHigh: q.dayHigh,
            dayLow: q.dayLow,
            volume: q.volume,
            fiftyTwoWeekHigh: q.yearHigh,
            fiftyTwoWeekLow: q.yearLow,
            ts: Date.now(),
          };
        }

        // Sparklines: only on full refresh, in parallel batches of 10
        if (!liveMode) {
          const have = Object.keys(prices);
          for (let i = 0; i < have.length; i += 10) {
            const batch = have.slice(i, i + 10);
            const sparks = await Promise.all(batch.map(t => fmpSpark(t, env, 5)));
            batch.forEach((t, idx) => { if (sparks[idx]?.length) prices[t].spark = sparks[idx]; });
          }
        }

        // Cache in D1
        try {
          await env.DB.prepare(
            `INSERT INTO price_cache (id, data, updated_at) VALUES ('latest', ?, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
          ).bind(JSON.stringify(prices)).run();
        } catch(e) {
          // Create table if it doesn't exist
          await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS price_cache (id TEXT PRIMARY KEY, data TEXT, updated_at TEXT)`
          ).run();
          await env.DB.prepare(
            `INSERT OR REPLACE INTO price_cache (id, data, updated_at) VALUES ('latest', ?, datetime('now'))`
          ).bind(JSON.stringify(prices)).run();
        }

        return json({ prices, errors, cached: false, updated: new Date().toISOString(), count: Object.keys(prices).length }, corsHeaders);
      }

      // ─── MARKET SENTIMENT (VIX + CNN Fear & Greed) ────────────────
      if (path === "/api/market-sentiment" && request.method === "GET") {
        // Check D1 cache (1 hour TTL)
        try {
          const cached = await env.DB.prepare(
            "SELECT data, updated_at FROM price_cache WHERE id = 'market-sentiment'"
          ).first();
          if (cached && cached.data) {
            const age = Date.now() - new Date(cached.updated_at).getTime();
            if (age < 3600 * 1000) {
              return json({ ...JSON.parse(cached.data), cached: true, updated: cached.updated_at }, corsHeaders);
            }
          }
        } catch(e) { console.error("sentiment cache read:", e.message); }

        const result = { vix: null, fearGreed: null };

        // 1) VIX from FMP Ultimate
        try {
          const vixMap = await fmpQuote(['^VIX'], env);
          const q = vixMap['^VIX'];
          if (q && q.price != null) {
            const prevClose = q.previousClose || q.price;
            result.vix = {
              price: Math.round(q.price * 100) / 100,
              change: Math.round((q.price - prevClose) * 100) / 100,
              changePct: prevClose ? Math.round((q.price - prevClose) / prevClose * 10000) / 100 : 0,
            };
          }
        } catch(e) { console.error("VIX fetch:", e.message); }

        // 2) CNN Fear & Greed
        try {
          const resp = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
            headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
          });
          if (resp.ok) {
            const data = await resp.json();
            const score = data?.fear_and_greed?.score;
            const prevScore = data?.fear_and_greed?.previous_close;
            const getLabel = (s) => {
              if (s == null) return "N/A";
              if (s <= 25) return "Extreme Fear";
              if (s <= 45) return "Fear";
              if (s <= 55) return "Neutral";
              if (s <= 75) return "Greed";
              return "Extreme Greed";
            };
            if (score != null) {
              result.fearGreed = {
                score: Math.round(score),
                label: getLabel(score),
                previous: prevScore != null ? { score: Math.round(prevScore), label: getLabel(prevScore) } : null,
              };
            }
          }
        } catch(e) { console.error("CNN F&G fetch:", e.message); }

        // Cache in D1 (reuse price_cache table)
        try {
          await env.DB.prepare(
            `INSERT INTO price_cache (id, data, updated_at) VALUES ('market-sentiment', ?, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
          ).bind(JSON.stringify(result)).run();
        } catch(e) { console.error("sentiment cache write:", e.message); }

        return json({ ...result, cached: false, updated: new Date().toISOString() }, corsHeaders);
      }

      // ─── FMP PROXY ────────────────────────────────
      const FMP_KEY = env.FMP_KEY;
      const FMP_BASE = "https://financialmodelingprep.com/stable";

      // GET /api/fx — FX rates (frankfurter.dev with open.er-api.com fallback)
      if (path === "/api/fx" && request.method === "GET") {
        const fxApis = [
          { url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,CAD,AUD,HKD,JPY,CHF,DKK,SEK,NOK,SGD,CNY", parse: d => d.rates ? { USD:1, ...d.rates, GBX:d.rates.GBP } : null },
          { url: "https://open.er-api.com/v6/latest/USD", parse: d => d.rates ? { USD:1, EUR:d.rates.EUR, GBP:d.rates.GBP, CAD:d.rates.CAD, AUD:d.rates.AUD, HKD:d.rates.HKD, GBX:d.rates.GBP } : null },
        ];
        for (const api of fxApis) {
          try {
            const resp = await fetch(api.url);
            if (!resp.ok) continue;
            const data = await resp.json();
            const rates = api.parse(data);
            if (rates) return json(rates, corsHeaders);
          } catch(e) { console.error("FX API failed:", api.url, e.message); }
        }
        return json({ error: "All FX APIs failed" }, corsHeaders, 502);
      }

      // GET /api/price-history?symbol=AAPL — historical prices proxy (keeps FMP key server-side)
      if (path === "/api/price-history" && request.method === "GET") {
        const symbol = url.searchParams.get("symbol");
        if (!symbol) return json({ error: "Missing ?symbol=" }, corsHeaders, 400);
        const fmpSym = toFMP(symbol.toUpperCase());
        const from = url.searchParams.get("from") || new Date(Date.now()-10*365.25*86400000).toISOString().slice(0,10);
        try {
          const resp = await fetchWithRetry(`${FMP_BASE}/historical-price-eod/full?symbol=${encodeURIComponent(fmpSym)}&from=${from}&apikey=${FMP_KEY}`, {}, { maxRetries: 2, baseDelay: 2000 });
          if (!resp.ok) return json({ error: "FMP error", status: resp.status }, corsHeaders, 502);
          const data = await resp.json();
          return json(data, corsHeaders);
        } catch(e) {
          return json({ error: "Price history fetch failed: " + e.message }, corsHeaders, 500);
        }
      }

      // GET /api/options-chain?symbol=AAPL — Yahoo Finance options chain (free, no API key)
      // Optional: &dte=30 (target days to expiration, picks closest expiration)
      if (path === "/api/options-chain" && request.method === "GET") {
        const symbol = (url.searchParams.get("symbol") || "").toUpperCase().trim();
        const targetDTE = parseInt(url.searchParams.get("dte") || "30");
        if (!symbol) return json({ error: "Missing ?symbol=" }, corsHeaders, 400);

        try {
          // Step 1: Get available expirations
          const baseUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
          const resp1 = await fetchYahoo(baseUrl);
          if (!resp1.ok) return json({ error: `Yahoo returned ${resp1.status}` }, corsHeaders, 502);
          const data1 = await resp1.json();
          const result = data1?.optionChain?.result?.[0];
          if (!result) return json({ error: "No options data for " + symbol }, corsHeaders, 404);

          const expirations = result.expirationDates || [];
          const quote = result.quote || {};
          const currentPrice = quote.regularMarketPrice || 0;

          // Step 2: Pick closest expiration to target DTE
          const now = Math.floor(Date.now() / 1000);
          const targetTs = now + targetDTE * 86400;
          let bestExp = expirations[0];
          let bestDiff = Infinity;
          for (const exp of expirations) {
            const diff = Math.abs(exp - targetTs);
            if (diff < bestDiff) { bestDiff = diff; bestExp = exp; }
          }

          // Step 3: Fetch chain for that expiration
          let options = result.options?.[0] || {};
          if (bestExp && bestExp !== expirations[0]) {
            const resp2 = await fetchYahoo(`${baseUrl}?date=${bestExp}`);
            if (resp2.ok) {
              const data2 = await resp2.json();
              options = data2?.optionChain?.result?.[0]?.options?.[0] || options;
            }
          }

          const mapOpt = c => ({
            strike: c.strike, bid: c.bid || 0, ask: c.ask || 0, last: c.lastPrice || 0,
            volume: c.volume || 0, oi: c.openInterest || 0, iv: c.impliedVolatility || 0,
            itm: c.inTheMoney || false, expiration: c.expiration, contractSymbol: c.contractSymbol,
          });
          const calls = (options.calls || []).map(mapOpt);
          const puts = (options.puts || []).map(mapOpt);

          const expDate = new Date(bestExp * 1000).toISOString().split("T")[0];
          const dte = Math.round((bestExp - now) / 86400);

          return json({
            symbol,
            price: currentPrice,
            expiration: expDate,
            dte,
            expirations: expirations.map(e => ({ ts: e, date: new Date(e*1000).toISOString().split("T")[0], dte: Math.round((e - now) / 86400) })),
            calls, puts,
            callsCount: calls.length, putsCount: puts.length,
          }, corsHeaders);
        } catch(e) {
          return json({ error: "Options fetch failed: " + e.message }, corsHeaders, 500);
        }
      }

      // GET /api/options-batch?symbols=AAPL,MSFT&dte=30 — batch options for multiple symbols
      if (path === "/api/options-batch" && request.method === "GET") {
        const symbols = (url.searchParams.get("symbols") || "").split(",").filter(Boolean).map(s=>s.trim().toUpperCase()).slice(0, 20);
        const targetDTE = parseInt(url.searchParams.get("dte") || "30");
        const otmPct = parseFloat(url.searchParams.get("otm") || "5") / 100;
        if (!symbols.length) return json({ error: "Missing ?symbols=" }, corsHeaders, 400);

        const results = {};

        // Process in batches of 5 to avoid rate limits
        for (let i = 0; i < symbols.length; i += 5) {
          const batch = symbols.slice(i, i + 5);
          const fetches = batch.map(async sym => {
            try {
              const baseUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}`;
              const resp1 = await fetchYahoo(baseUrl);
              if (!resp1.ok) { results[sym] = { error: resp1.status }; return; }
              const data1 = await resp1.json();
              const result = data1?.optionChain?.result?.[0];
              if (!result) { results[sym] = { error: "no data" }; return; }

              const expirations = result.expirationDates || [];
              const price = result.quote?.regularMarketPrice || 0;
              const now = Math.floor(Date.now() / 1000);
              const targetTs = now + targetDTE * 86400;

              // Pick closest expiration
              let bestExp = expirations[0];
              let bestDiff = Infinity;
              for (const exp of expirations) {
                const diff = Math.abs(exp - targetTs);
                if (diff < bestDiff) { bestDiff = diff; bestExp = exp; }
              }

              // Fetch chain for that expiration
              let options = result.options?.[0] || {};
              if (bestExp && bestExp !== expirations[0]) {
                const resp2 = await fetchYahoo(`${baseUrl}?date=${bestExp}`);
                if (resp2.ok) {
                  const data2 = await resp2.json();
                  options = data2?.optionChain?.result?.[0]?.options?.[0] || options;
                }
              }

              const calls = (options.calls || []);
              const targetStrike = price * (1 + otmPct);
              // Find the call closest to target OTM%
              let bestCall = null;
              let bestSD = Infinity;
              for (const c of calls) {
                if (c.strike < price) continue; // skip ITM
                const sd = Math.abs(c.strike - targetStrike);
                if (sd < bestSD) { bestSD = sd; bestCall = c; }
              }

              const dte = Math.round((bestExp - now) / 86400);
              if (bestCall) {
                results[sym] = {
                  price,
                  strike: bestCall.strike,
                  bid: bestCall.bid || 0,
                  ask: bestCall.ask || 0,
                  last: bestCall.lastPrice || 0,
                  iv: bestCall.impliedVolatility || 0,
                  volume: bestCall.volume || 0,
                  oi: bestCall.openInterest || 0,
                  dte,
                  expiration: new Date(bestExp * 1000).toISOString().split("T")[0],
                  distPct: ((bestCall.strike - price) / price * 100).toFixed(1),
                  premiumPct: (((bestCall.bid || 0) / price) * 100).toFixed(2),
                  annualizedPct: (((bestCall.bid || 0) / price) * (365 / Math.max(dte, 1)) * 100).toFixed(1),
                };
              } else {
                results[sym] = { price, error: "no OTM calls" };
              }
            } catch(e) {
              results[sym] = { error: e.message };
            }
          });
          await Promise.all(fetches);
          // Small delay between batches to be polite to Yahoo
          if (i + 5 < symbols.length) await new Promise(r => setTimeout(r, 500));
        }

        return json(results, corsHeaders);
      }

      // GET /api/options-massive?symbols=AAPL,MSFT&dte=30&otm=5 — Massive (ex-Polygon) options with greeks
      if (path === "/api/options-massive" && request.method === "GET") {
        const MASSIVE_KEY = env.MASSIVE_KEY;
        if (!MASSIVE_KEY) return json({ error: "MASSIVE_KEY not configured" }, corsHeaders, 500);

        const symbols = (url.searchParams.get("symbols") || "").split(",").filter(Boolean).map(s => s.trim().toUpperCase()).slice(0, 50);
        const targetDTE = parseInt(url.searchParams.get("dte") || "30");
        const otmPct = parseFloat(url.searchParams.get("otm") || "5") / 100;
        if (!symbols.length) return json({ error: "Missing ?symbols=" }, corsHeaders, 400);

        const results = {};
        const now = new Date();
        const minExp = new Date(now.getTime() + Math.max(targetDTE - 10, 7) * 86400000).toISOString().slice(0, 10);
        const maxExp = new Date(now.getTime() + (targetDTE + 15) * 86400000).toISOString().slice(0, 10);

        // Process one at a time — free tier is 5 calls/min
        for (const sym of symbols) {
          try {
            const apiUrl = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(sym)}?contract_type=call&expiration_date.gte=${minExp}&expiration_date.lte=${maxExp}&limit=250&apiKey=${MASSIVE_KEY}`;
            const resp = await fetchWithRetry(apiUrl, {}, { maxRetries: 2, baseDelay: 12000 });
            if (!resp.ok) {
              const errText = await resp.text().catch(() => "");
              results[sym] = { error: resp.status, msg: errText.slice(0, 200) };
              continue;
            }
            const data = await resp.json();
            const contracts = data.results || [];
            if (!contracts.length) { results[sym] = { error: "no data" }; continue; }

            // Get underlying price from first contract
            const price = contracts[0]?.underlying_asset?.price || 0;
            if (!price) { results[sym] = { error: "no price" }; continue; }

            const targetStrike = price * (1 + otmPct);

            // Find best OTM call closest to target strike + closest to target DTE
            let bestContract = null;
            let bestScore = Infinity;
            for (const c of contracts) {
              const strike = c.details?.strike_price || 0;
              if (strike < price) continue; // skip ITM
              const exp = c.details?.expiration_date;
              const daysToExp = exp ? Math.ceil((new Date(exp) - now) / 86400000) : targetDTE;
              const strikeDist = Math.abs(strike - targetStrike) / price;
              const dteDist = Math.abs(daysToExp - targetDTE) / 30;
              const score = strikeDist + dteDist * 0.3; // weight strike closeness more
              if (score < bestScore) { bestScore = score; bestContract = c; }
            }

            if (!bestContract) { results[sym] = { price, error: "no OTM calls" }; continue; }

            const d = bestContract.details || {};
            const q = bestContract.last_quote || {};
            const g = bestContract.greeks || {};
            const expDate = d.expiration_date || "";
            const dte = expDate ? Math.ceil((new Date(expDate) - now) / 86400000) : targetDTE;

            results[sym] = {
              price,
              strike: d.strike_price || 0,
              bid: q.bid || 0,
              ask: q.ask || 0,
              last: bestContract.last_trade?.price || 0,
              iv: bestContract.implied_volatility || 0,
              volume: bestContract.day?.volume || 0,
              oi: bestContract.open_interest || 0,
              dte,
              expiration: expDate,
              distPct: ((d.strike_price - price) / price * 100).toFixed(1),
              premiumPct: (((q.bid || 0) / price) * 100).toFixed(2),
              annualizedPct: (((q.bid || 0) / price) * (365 / Math.max(dte, 1)) * 100).toFixed(1),
              // Greeks — not available from Yahoo
              delta: g.delta || null,
              gamma: g.gamma || null,
              theta: g.theta || null,
              vega: g.vega || null,
              breakEven: bestContract.break_even_price || null,
              contractSymbol: d.ticker || "",
              source: "MASSIVE",
            };
          } catch (e) {
            results[sym] = { error: e.message };
          }
          // Rate limit: ~5 calls/min = 1 every 12s on free tier
          if (symbols.indexOf(sym) < symbols.length - 1) await new Promise(r => setTimeout(r, 12500));
        }

        return json(results, corsHeaders);
      }

      // ─── IB OAuth helpers — delegates to top-level functions ───
      // (Actual implementations extracted to module scope for reuse by scheduled handler)

      // GET /api/ib-session — delegates to top-level getIBSession
      if (path === "/api/ib-session" && request.method === "GET") {
        try {
          const session = await getIBSession(env);
          return json({ ok: true, consumerKey: session.consumerKey }, corsHeaders);
        } catch(e) {
          return json({ error: "IB OAuth error: " + e.message }, corsHeaders, 500);
        }
      }

      // GET /api/ib-options?symbols=AAPL,MSFT&dte=30&otm=5 — IB options via OAuth (greeks, IV, bid/ask)
      if (path === "/api/ib-options" && request.method === "GET") {
        try {
          const { lst, consumerKey, accessToken } = await getIBSession(env);
          const ib = (m, e, b) => ibAuthFetch(lst, consumerKey, accessToken, m, e, b);

          const symbols = (url.searchParams.get("symbols") || "").split(",").filter(Boolean).map(s => s.trim().toUpperCase()).slice(0, 10);
          const targetDTE = parseInt(url.searchParams.get("dte") || "30");
          const otmPct = parseFloat(url.searchParams.get("otm") || "5") / 100;
          if (!symbols.length) return json({ error: "Missing ?symbols=" }, corsHeaders, 400);

          const results = {};
          const now = new Date();
          const monthNames = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
          const targetDate = new Date(now.getTime() + targetDTE * 86400000);
          const targetMonth = monthNames[targetDate.getMonth()] + String(targetDate.getFullYear()).slice(2);

          // Wait for session to establish
          await new Promise(r => setTimeout(r, 500));

          for (const sym of symbols) {
            try {
              const search = await ib("POST", "/iserver/secdef/search", { symbol: sym, secType: "STK" });
              if (search?._raw || !Array.isArray(search)) { results[sym] = { error: "search failed" }; continue; }
              const conid = search?.[0]?.conid;
              if (!conid) { results[sym] = { error: "not found" }; continue; }

              // Price from snapshot (subscribe + read)
              await ib("GET", `/iserver/marketdata/snapshot?conids=${conid}&fields=31,84,86`);
              await new Promise(r => setTimeout(r, 1000));
              const priceSnap = await ib("GET", `/iserver/marketdata/snapshot?conids=${conid}&fields=31,84,86`);
              const pd = priceSnap?.[0] || {};
              const price = parseFloat(pd["31"]) || parseFloat(pd["84"]) || parseFloat(pd["86"]) || 0;
              if (!price) { results[sym] = { error: "no price" }; continue; }

              // Option months + strikes
              const optSection = (search[0]?.sections || []).find(s => s.secType === "OPT");
              const months = optSection?.months?.split(";").filter(Boolean) || [];
              const bestMonth = months.find(m => m === targetMonth) || months[0];
              if (!bestMonth) { results[sym] = { price, error: "no option months" }; continue; }

              const strikes = await ib("GET", `/iserver/secdef/strikes?conid=${conid}&sectype=OPT&month=${bestMonth}&exchange=SMART`);
              const callStrikes = (strikes?.call || []).map(Number).filter(n => n > price);
              if (!callStrikes.length) { results[sym] = { price, error: "no strikes" }; continue; }

              const targetStrike = price * (1 + otmPct);
              const bestStrike = callStrikes.reduce((best, s) => Math.abs(s - targetStrike) < Math.abs(best - targetStrike) ? s : best, callStrikes[0]);

              const info = await ib("GET", `/iserver/secdef/info?conid=${conid}&sectype=OPT&month=${bestMonth}&exchange=SMART&strike=${bestStrike}&right=C`);
              const optConid = info?.[0]?.conid;
              if (!optConid) { results[sym] = { price, strike: bestStrike, error: "no option conid" }; continue; }

              // Option snapshot (subscribe + read)
              await ib("GET", `/iserver/marketdata/snapshot?conids=${optConid}&fields=31,84,86,87,7633,7634,7635,7636,7637`);
              await new Promise(r => setTimeout(r, 1000));
              const optSnap = await ib("GET", `/iserver/marketdata/snapshot?conids=${optConid}&fields=31,84,86,87,7633,7634,7635,7636,7637`);
              const od = optSnap?.[0] || {};

              const bid = parseFloat(od["84"]) || 0;
              const ask = parseFloat(od["86"]) || 0;
              const iv = parseFloat(od["7633"]) || 0;
              const monthIdx = monthNames.indexOf(bestMonth.slice(0, 3));
              const year = 2000 + parseInt(bestMonth.slice(3));
              const firstDay = new Date(year, monthIdx, 1);
              const thirdFri = ((12 - firstDay.getDay()) % 7 + 1) + 14;
              const expDate = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(thirdFri).padStart(2, "0")}`;
              const dte = Math.max(Math.ceil((new Date(expDate) - now) / 86400000), 1);

              results[sym] = {
                price, strike: bestStrike, bid, ask,
                last: parseFloat(od["31"]) || 0,
                iv: iv > 1 ? iv / 100 : iv,
                volume: parseInt(od["87"]) || 0, oi: 0, dte,
                expiration: expDate,
                distPct: ((bestStrike - price) / price * 100).toFixed(1),
                premiumPct: ((bid / price) * 100).toFixed(2),
                annualizedPct: ((bid / price) * (365 / dte) * 100).toFixed(1),
                delta: parseFloat(od["7635"]) || null,
                theta: parseFloat(od["7634"]) || null,
                gamma: parseFloat(od["7636"]) || null,
                vega: parseFloat(od["7637"]) || null,
                month: bestMonth, source: "IB",
              };

              try { await ib("GET", "/iserver/marketdata/unsubscribeall"); } catch {}
            } catch(e) {
              results[sym] = { error: e.message };
            }
          }
          return json(results, corsHeaders);
        } catch(e) {
          return json({ error: "IB options error: " + e.message }, corsHeaders, 500);
        }
      }

      // GET /api/ib-portfolio — real IB positions from ALL accounts with live prices, P&L, avg cost
      if (path === "/api/ib-portfolio" && request.method === "GET") {
        try {
          const { lst, consumerKey, accessToken } = await getIBSession(env);
          const ib = (m, e, b) => ibAuthFetch(lst, consumerKey, accessToken, m, e, b);

          // Get ALL accounts
          const accounts = await ib("GET", "/portfolio/accounts");
          const accountIds = (Array.isArray(accounts) ? accounts : [])
            .map(a => a.accountId || a.id).filter(Boolean);
          if (!accountIds.length) return json({ error: "No accounts found", detail: accounts }, corsHeaders, 502);

          // Get positions from ALL accounts (paginate each)
          const allPositions = [];
          const accountSummaries = {};
          for (const accountId of accountIds) {
            for (let page = 0; page < 5; page++) {
              const positions = await ib("GET", `/portfolio/${accountId}/positions/${page}`);
              if (!positions || !Array.isArray(positions) || positions.length === 0) break;
              allPositions.push(...positions.map(p => ({ ...p, _accountId: accountId })));
            }
            accountSummaries[accountId] = allPositions.filter(p => p._accountId === accountId).length;
          }

          const result = allPositions
            .filter(p => p.position && p.position !== 0)
            .map(p => ({
              ticker: p.ticker || p.contractDesc || "",
              name: p.name || p.fullName || p.contractDesc || "",
              conid: p.conid,
              accountId: p._accountId,
              shares: p.position || 0,
              mktPrice: p.mktPrice || 0,
              mktValue: p.mktValue || 0,
              avgCost: p.avgCost || 0,
              avgPrice: p.avgPrice || 0,
              unrealizedPnl: p.unrealizedPnl || 0,
              realizedPnl: p.realizedPnl || 0,
              currency: p.currency || "USD",
              assetClass: p.assetClass || "STK",
              sector: p.sector || "",
              exchange: p.listingExchange || "",
              expiry: p.expiry || null,
              strike: p.strike || null,
              putOrCall: p.putOrCall || null,
              undSym: p.undSym || null,
            }));

          return json({ accounts: accountIds, accountSummaries, count: result.length, positions: result }, corsHeaders);
        } catch(e) {
          return json({ error: "IB portfolio error: " + e.message }, corsHeaders, 500);
        }
      }

      // GET /api/ib-ledger — cash balances per currency (ALL accounts)
      if (path === "/api/ib-ledger" && request.method === "GET") {
        try {
          const { lst, consumerKey, accessToken } = await getIBSession(env);
          const ib = (m, e, b) => ibAuthFetch(lst, consumerKey, accessToken, m, e, b);

          const accounts = await ib("GET", "/portfolio/accounts");
          const accountIds = (Array.isArray(accounts) ? accounts : []).map(a => a.accountId || a.id).filter(Boolean);
          if (!accountIds.length) return json({ error: "No accounts found" }, corsHeaders, 502);

          // Aggregate ledger across all accounts
          const combined = {};
          const byAccount = {};
          for (const accountId of accountIds) {
            const ledger = await ib("GET", `/portfolio/${accountId}/ledger`);
            byAccount[accountId] = {};
            for (const [ccy, data] of Object.entries(ledger || {})) {
              if (ccy === "_raw" || ccy === "_status") continue;
              const entry = {
                cash: data.cashbalance || 0,
                nlv: data.netliquidationvalue || 0,
                stockValue: data.stockmarketvalue || 0,
                unrealizedPnl: data.unrealizedpnl || 0,
                realizedPnl: data.realizedpnl || 0,
                exchangeRate: data.exchangerate || 1,
                interest: data.interest || 0,
              };
              byAccount[accountId][ccy] = entry;
              if (!combined[ccy]) combined[ccy] = { cash:0, nlv:0, stockValue:0, unrealizedPnl:0, realizedPnl:0, exchangeRate: entry.exchangeRate, interest:0 };
              combined[ccy].cash += entry.cash;
              combined[ccy].nlv += entry.nlv;
              combined[ccy].stockValue += entry.stockValue;
              combined[ccy].unrealizedPnl += entry.unrealizedPnl;
              combined[ccy].realizedPnl += entry.realizedPnl;
              combined[ccy].interest += entry.interest;
            }
          }

          return json({ accounts: accountIds, ledger: combined, byAccount }, corsHeaders);
        } catch(e) {
          return json({ error: "IB ledger error: " + e.message }, corsHeaders, 500);
        }
      }

      // GET /api/ib-summary — account summary (ALL accounts aggregated)
      if (path === "/api/ib-summary" && request.method === "GET") {
        try {
          const { lst, consumerKey, accessToken } = await getIBSession(env);
          const ib = (m, e, b) => ibAuthFetch(lst, consumerKey, accessToken, m, e, b);

          const accounts = await ib("GET", "/portfolio/accounts");
          const accountIds = (Array.isArray(accounts) ? accounts : []).map(a => a.accountId || a.id).filter(Boolean);
          if (!accountIds.length) return json({ error: "No accounts found" }, corsHeaders, 502);

          const get = (summary, field) => {
            const v = summary?.[field];
            return v ? { amount: v.amount || 0, currency: v.currency || "USD" } : { amount: 0, currency: "USD" };
          };

          // Aggregate across all accounts
          const totals = { nlv: 0, buyingPower: 0, availableFunds: 0, totalCash: 0, grossPosition: 0, maintenanceMargin: 0, initMargin: 0 };
          const byAccount = {};
          for (const accountId of accountIds) {
            const summary = await ib("GET", `/portfolio/${accountId}/summary`);
            const acct = {
              nlv: get(summary, "netliquidation"),
              buyingPower: get(summary, "buyingpower"),
              availableFunds: get(summary, "availablefunds"),
              totalCash: get(summary, "totalcashvalue"),
              grossPosition: get(summary, "grosspositionvalue"),
              maintenanceMargin: get(summary, "maintenancemarginreq"),
              initMargin: get(summary, "initmarginreq"),
            };
            byAccount[accountId] = acct;
            totals.nlv += acct.nlv.amount;
            totals.buyingPower += acct.buyingPower.amount;
            totals.availableFunds += acct.availableFunds.amount;
            totals.totalCash += acct.totalCash.amount;
            totals.grossPosition += acct.grossPosition.amount;
            totals.maintenanceMargin += acct.maintenanceMargin.amount;
            totals.initMargin += acct.initMargin.amount;
          }

          return json({
            accounts: accountIds,
            nlv: { amount: totals.nlv, currency: "USD" },
            buyingPower: { amount: totals.buyingPower, currency: "USD" },
            availableFunds: { amount: totals.availableFunds, currency: "USD" },
            totalCash: { amount: totals.totalCash, currency: "USD" },
            grossPosition: { amount: totals.grossPosition, currency: "USD" },
            maintenanceMargin: { amount: totals.maintenanceMargin, currency: "USD" },
            initMargin: { amount: totals.initMargin, currency: "USD" },
            byAccount,
          }, corsHeaders);
        } catch(e) {
          return json({ error: "IB summary error: " + e.message }, corsHeaders, 500);
        }
      }

      // GET /api/ib-pnl — daily P&L from IB (partitioned by position)
      if (path === "/api/ib-pnl" && request.method === "GET") {
        try {
          const { lst, consumerKey, accessToken } = await getIBSession(env);
          const ib = (m, e, b) => ibAuthFetch(lst, consumerKey, accessToken, m, e, b);
          const pnl = await ib("GET", "/iserver/account/pnl/partitioned");
          return json(pnl, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/ib-trades — recent trades (up to 7 days)
      if (path === "/api/ib-trades" && request.method === "GET") {
        try {
          const { lst, consumerKey, accessToken } = await getIBSession(env);
          const ib = (m, e, b) => ibAuthFetch(lst, consumerKey, accessToken, m, e, b);

          // Must call /portfolio/accounts first per IB docs
          const accounts = await ib("GET", "/portfolio/accounts");
          const accountIds = (Array.isArray(accounts) ? accounts : []).map(a => a.accountId || a.id).filter(Boolean);

          const days = url.searchParams.get("days") || "7";
          // Fetch trades for all accounts
          let allTrades = [];
          for (const acctId of accountIds) {
            const trades = await ib("GET", `/iserver/account/trades?days=${days}&accountId=${acctId}`);
            if (Array.isArray(trades)) allTrades.push(...trades);
          }
          // Also try without accountId for combined view
          if (!allTrades.length) {
            const trades = await ib("GET", `/iserver/account/trades?days=${days}`);
            if (Array.isArray(trades)) allTrades = trades;
          }

          const result = allTrades.map(t => ({
            executionId: t.execution_id || "",
            symbol: t.symbol || "",
            side: t.side || "",
            size: parseFloat(t.size) || 0,
            price: parseFloat(t.price) || 0,
            commission: t.comission || 0, // IB typo: "comission"
            netAmount: t.net_amount || 0,
            time: t.trade_time || "",
            timestamp: t.trade_time_r || 0,
            secType: t.sec_type || "STK",
            companyName: t.company_name || "",
            exchange: t.exchange || "",
            orderRef: t.order_ref || "",
          }));

          return json({ count: result.length, trades: result }, corsHeaders);
        } catch(e) {
          return json({ error: "IB trades error: " + e.message }, corsHeaders, 500);
        }
      }

      // POST /api/ib-nlv-save — save daily NLV snapshot.
      // Sanity-guarded 2026-04-08 against partial-fetch writes (see
      // performAutoSync comment). Refuses >30% drops vs the most recent
      // prior row to prevent corrupt rows from becoming the cached snapshot.
      if (path === "/api/ib-nlv-save" && request.method === "POST") {
        try {
          const body = await request.json();
          const fecha = body.fecha || new Date().toISOString().slice(0, 10);
          const fechaErr = validateFecha(fecha);
          if (fechaErr) return validationError(fechaErr, corsHeaders);
          const numErr = validateNumber(body.nlv, 'nlv');
          if (numErr) return validationError(numErr, corsHeaders);

          // Guard: reject anomalous drops
          const prev = await env.DB.prepare(
            "SELECT nlv FROM nlv_history WHERE fecha < ? ORDER BY fecha DESC LIMIT 1"
          ).bind(fecha).first();
          const prevNlv = prev?.nlv || 0;
          if (prevNlv > 0 && body.nlv > 0 && body.nlv < prevNlv * 0.7) {
            return json({
              error: "rejected_anomalous_nlv",
              detail: `NLV ${body.nlv.toFixed(0)} is >30% drop vs prev ${prevNlv.toFixed(0)} — likely partial fetch`,
              prevNlv,
              submittedNlv: body.nlv,
            }, corsHeaders, 422);
          }

          await env.DB.prepare(
            "INSERT OR REPLACE INTO nlv_history (fecha, nlv, cash, positions_value, margin_used, accounts, positions_count, buying_power) VALUES (?,?,?,?,?,?,?,?)"
          ).bind(fecha, body.nlv||0, body.cash||0, body.positionsValue||0, body.marginUsed||0, body.accounts||0, body.positionsCount||0, body.buyingPower||0).run();
          return json({ ok: true, fecha }, corsHeaders);
        } catch(e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/ib-cached-snapshot — Dashboard data without live IB session (D1 only)
      if (path === "/api/ib-cached-snapshot" && request.method === "GET") {
        try {
          const latest = await env.DB.prepare("SELECT * FROM nlv_history ORDER BY fecha DESC LIMIT 1").first();
          const { results: ibPositions } = await env.DB.prepare(
            "SELECT ticker, name, shares, ib_shares, ib_avg_cost, ib_price, last_price, currency, sector, market_value FROM positions WHERE ib_shares > 0"
          ).all();
          return json({
            summary: latest ? {
              nlv: { amount: latest.nlv, currency: "USD" },
              buyingPower: { amount: latest.buying_power || 0, currency: "USD" },
              totalCash: { amount: latest.cash || 0, currency: "USD" },
              initMargin: { amount: latest.margin_used || 0, currency: "USD" },
              grossPosition: { amount: latest.positions_value || 0, currency: "USD" },
              accounts: Array.from({ length: latest.accounts || 4 }),
              fecha: latest.fecha,
            } : null,
            positions: (ibPositions || []).map(p => ({
              ticker: p.ticker, name: p.name, shares: p.ib_shares, mktPrice: p.ib_price || p.last_price,
              mktValue: (p.ib_shares || 0) * (p.ib_price || p.last_price || 0),
              avgCost: p.ib_avg_cost, currency: p.currency || "USD", sector: p.sector || "",
              assetClass: "STK", appShares: p.shares,
            })),
          }, corsHeaders);
        } catch(e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/ib-nlv-history — get NLV history for chart
      if (path === "/api/ib-nlv-history" && request.method === "GET") {
        try {
          const limit = parseInt(url.searchParams.get("limit") || "365");
          const { results } = await env.DB.prepare("SELECT * FROM nlv_history ORDER BY fecha DESC LIMIT ?").bind(limit).all();
          return json({ results: (results||[]).reverse() }, corsHeaders);
        } catch(e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/ib-flex?queryId=1452278 — IB Flex Web Service (trades + dividends history)
      if (path === "/api/ib-flex" && request.method === "GET") {
        try {
          const flexToken = env.IB_FLEX_TOKEN;
          if (!flexToken) return json({ error: "IB_FLEX_TOKEN not configured" }, corsHeaders, 500);
          const queryId = url.searchParams.get("queryId") || "1452278";

          // Step 1: SendRequest
          const sendUrl = `https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=${flexToken}&q=${queryId}&v=3`;
          const sendResp = await fetch(sendUrl);
          const sendXml = await sendResp.text();

          // Parse reference code from XML
          const refMatch = sendXml.match(/<ReferenceCode>(\d+)<\/ReferenceCode>/);
          if (!refMatch) return json({ error: "Flex SendRequest failed", detail: sendXml.slice(0, 500) }, corsHeaders, 502);
          const refCode = refMatch[1];

          // Step 2: Wait and GetStatement (poll up to 5 times with longer waits)
          let statementXml = "";
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise(r => setTimeout(r, attempt === 0 ? 5000 : 8000));
            const getUrl = `https://gdcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement?t=${flexToken}&q=${refCode}&v=3`;
            const getResp = await fetch(getUrl);
            statementXml = await getResp.text();
            if (statementXml.includes("<FlexQueryResponse")) break;
          }

          if (!statementXml.includes("<FlexQueryResponse")) {
            return json({ error: "Flex statement not ready", detail: statementXml.slice(0, 300) }, corsHeaders, 502);
          }

          // Parse trades from XML
          const trades = [];
          const tradeRegex = /<Trade\s([^>]+)\/>/g;
          let match;
          while ((match = tradeRegex.exec(statementXml)) !== null) {
            const attrs = {};
            const attrRegex = /(\w+)="([^"]*)"/g;
            let am;
            while ((am = attrRegex.exec(match[1])) !== null) attrs[am[1]] = am[2];
            trades.push({
              accountId: attrs.accountId || "",
              accountAlias: attrs.acctAlias || "",
              symbol: attrs.symbol || "",
              description: attrs.description || "",
              currency: attrs.currency || "USD",
              assetCategory: attrs.assetCategory || "STK",
              buySell: attrs.buySell || "",
              quantity: parseFloat(attrs.quantity) || 0,
              tradePrice: parseFloat(attrs.tradePrice) || 0,
              proceeds: parseFloat(attrs.proceeds) || 0,
              commission: parseFloat(attrs.ibCommission) || 0,
              netCash: parseFloat(attrs.netCash) || 0,
              tradeDate: attrs.tradeDate || "",
              exchange: attrs.exchange || "",
              pnlRealized: parseFloat(attrs.fifoPnlRealized) || 0,
              strike: attrs.strike || "",
              expiry: attrs.expiry || "",
              putCall: attrs.putCall || "",
              conid: attrs.conid || "",
            });
          }

          // Parse cash transactions (dividends, interest, etc.)
          const cashTxns = [];
          const cashRegex = /<CashTransaction\s([^>]+)\/>/g;
          while ((match = cashRegex.exec(statementXml)) !== null) {
            const attrs = {};
            const attrRegex = /(\w+)="([^"]*)"/g;
            let am;
            while ((am = attrRegex.exec(match[1])) !== null) attrs[am[1]] = am[2];
            cashTxns.push({
              accountId: attrs.accountId || "",
              symbol: attrs.symbol || "",
              description: attrs.description || "",
              currency: attrs.currency || "USD",
              type: attrs.type || "",
              amount: parseFloat(attrs.amount) || 0,
              tradeDate: attrs.reportDate || attrs.dateTime?.split(";")?.[0] || "",
              settleDate: attrs.settleDate || "",
            });
          }

          return json({
            queryId,
            tradesCount: trades.length,
            cashTxnsCount: cashTxns.length,
            trades: trades.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)),
            cashTransactions: cashTxns.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)),
          }, corsHeaders);
        } catch (e) {
          return json({ error: "IB Flex error: " + e.message }, corsHeaders, 500);
        }
      }

      // POST /api/ib-flex-import — receive Flex XML from local script, parse and store in D1
      if (path === "/api/ib-flex-import" && request.method === "POST") {
        try {
          const xml = await request.text();
          if (!xml.includes("<FlexQueryResponse")) return json({ error: "Invalid XML" }, corsHeaders, 400);

          // Parse trades
          const trades = [];
          const tradeRegex = /<Trade\s([^>]+)\/>/g;
          let match;
          while ((match = tradeRegex.exec(xml)) !== null) {
            const a = {};
            const ar = /(\w+)="([^"]*)"/g;
            let m;
            while ((m = ar.exec(match[1])) !== null) a[m[1]] = m[2];
            trades.push(a);
          }

          // Parse cash transactions
          const cashTxns = [];
          const cashRegex = /<CashTransaction\s([^>]+)\/>/g;
          while ((match = cashRegex.exec(xml)) !== null) {
            const a = {};
            const ar = /(\w+)="([^"]*)"/g;
            let m;
            while ((m = ar.exec(match[1])) !== null) a[m[1]] = m[2];
            cashTxns.push(a);
          }

          // IB ticker → App ticker mapping (same as sync-ib)
          const IB_MAP = {"VIS":"BME:VIS","AMS":"BME:AMS","IIPR PRA":"IIPR-PRA","9618":"HKG:9618","1052":"HKG:1052","2219":"HKG:2219","1910":"HKG:1910","9616":"HKG:9616","ENGe":"ENG","LOGe":"LOG","REPe":"REP","ISPAd":"ISPA"};
          const mapTicker = (sym) => IB_MAP[sym] || sym;

          // Import trades into cost_basis table using batch (D1 limit: 100 statements per batch)
          let tradesInserted = 0, tradesSkipped = 0;
          const tradeStmts = [];
          for (const t of trades) {
            if (!t.symbol || !t.tradeDate) continue;
            const ticker = mapTicker(t.symbol);
            const fecha = `${t.tradeDate.slice(0,4)}-${t.tradeDate.slice(4,6)}-${t.tradeDate.slice(6,8)}`;
            const qty = parseFloat(t.quantity) || 0;
            const price = parseFloat(t.tradePrice) || 0;
            const commission = parseFloat(t.ibCommission) || 0;
            const netCash = parseFloat(t.netCash) || 0;
            const tipo = t.assetCategory === "OPT" ? "OPTION" : "EQUITY";
            const expiry = t.expiry ? `${t.expiry.slice(0,4)}-${t.expiry.slice(4,6)}-${t.expiry.slice(6,8)}` : null;

            tradeStmts.push(env.DB.prepare(
              "INSERT OR IGNORE INTO cost_basis (ticker, fecha, tipo, shares, precio, comision, coste, opt_strike, opt_expiry, opt_tipo) VALUES (?,?,?,?,?,?,?,?,?,?)"
            ).bind(ticker, fecha, tipo, qty, price, commission, netCash, t.strike || null, expiry, t.putCall || null));
          }
          // Execute in batches of 80
          for (let i = 0; i < tradeStmts.length; i += 80) {
            const batch = tradeStmts.slice(i, i + 80);
            try { await env.DB.batch(batch); tradesInserted += batch.length; } catch { tradesSkipped += batch.length; }
          }

          // Import dividends — aggregate by (settleDate, symbol) across accounts
          // Dividends/PIL → bruto, Withholding Tax → wht
          let divsInserted = 0, divsSkipped = 0;
          const divAgg = {};
          for (const c of cashTxns) {
            const type = (c.type || "").toLowerCase();
            if (!type.includes("dividend") && !type.includes("payment in lieu") && !type.includes("withholding")) continue;
            if (!c.symbol) continue;
            const ticker = mapTicker(c.symbol);
            const rawDate = c.settleDate || c.reportDate || "";
            const fecha = rawDate.length === 8
              ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`
              : rawDate;
            if (!fecha) continue;
            const amount = parseFloat(c.amount) || 0;
            const key = `${fecha}|${ticker}`;
            const fxRate = parseFloat(c.fxRateToBase) || 1;
            if (!divAgg[key]) divAgg[key] = { ticker, fecha, bruto: 0, wht: 0, divisa: c.currency || "USD", fxRate };
            if (type.includes("withholding")) {
              divAgg[key].wht += amount; // negative
            } else {
              divAgg[key].bruto += amount;
            }
          }
          const divStmts = [];
          for (const d of Object.values(divAgg)) {
            const bruto = Math.round(d.bruto * 100) / 100;
            const wht = Math.round(d.wht * 100) / 100;
            const neto = Math.round((d.bruto + d.wht) * 100) / 100;
            if (bruto === 0 && neto === 0) continue;
            const whtRate = bruto > 0 ? Math.round((-wht / bruto) * 10000) / 10000 : 0;
            const whtAmount = Math.round(-wht * 100) / 100;
            // Convert to USD: if currency is USD, fx=1; otherwise use IB's fxRateToBase (which is to USD)
            const fxUSD = d.divisa === "USD" ? 1 : (d.fxRate || 1);
            const brutoUSD = Math.round(bruto * fxUSD * 100) / 100;
            const netoUSD = Math.round(neto * fxUSD * 100) / 100;
            divStmts.push(env.DB.prepare(
              `INSERT INTO dividendos (ticker, fecha, bruto, neto, divisa, wht_rate, wht_amount, broker, notas, bruto_usd, neto_usd, fx_to_usd)
               SELECT ?,?,?,?,?,?,?,'IB',?,?,?,?
               WHERE NOT EXISTS (SELECT 1 FROM dividendos WHERE ticker=? AND fecha=? AND ABS(bruto - ?) < 0.05)`
            ).bind(d.ticker, d.fecha, bruto, neto, d.divisa, whtRate, whtAmount, `IB Flex sync`, brutoUSD, netoUSD, fxUSD, d.ticker, d.fecha, bruto));
          }
          for (let i = 0; i < divStmts.length; i += 80) {
            const batch = divStmts.slice(i, i + 80);
            try { await env.DB.batch(batch); divsInserted += batch.length; } catch { divsSkipped += batch.length; }
          }

          return json({
            trades: { total: trades.length, inserted: tradesInserted, skipped: tradesSkipped },
            dividends: { total: cashTxns.filter(c => (c.type||"").toLowerCase().includes("dividend")).length, inserted: divsInserted, skipped: divsSkipped },
            cashTransactions: { total: cashTxns.length },
          }, corsHeaders);
        } catch (e) {
          return json({ error: "Flex import error: " + e.message }, corsHeaders, 500);
        }
      }

      // POST /api/alerts-check — run all alert checks and store results
      if (path === "/api/alerts-check" && request.method === "POST") {
        try {
          const body = await request.json().catch(() => ({}));
          const today = new Date().toISOString().slice(0, 10);
          const alerts = [];

          // 1. DIVIDEND EX-DATES — check FMP calendar for upcoming ex-dates (includes foreign tickers via FMP_MAP)
          if (body.positions?.length) {
            try {
              const resp = await fetch(`${FMP_BASE}/stock-dividend-calendar?apikey=${FMP_KEY}`);
              const divCal = await resp.json();
              if (Array.isArray(divCal)) {
                // Build FMP symbol → our ticker map for all positions
                const fmpToTicker = {};
                for (const p of body.positions) {
                  const fmpS = toFMP(p.ticker);
                  fmpToTicker[fmpS] = p.ticker;
                }
                divCal.forEach(d => {
                  const ourTicker = fmpToTicker[d.symbol];
                  if (ourTicker && d.date) {
                    const daysTo = Math.ceil((new Date(d.date) - new Date()) / 86400000);
                    if (daysTo >= 0 && daysTo <= 3) {
                      const pos = body.positions.find(p => p.ticker === ourTicker);
                      const estDiv = (d.dividend || 0) * (pos?.shares || 0);
                      alerts.push({ tipo: "DIVIDEND", titulo: `\u{1F4B0} ${ourTicker} ex-dividend ${daysTo === 0 ? "hoy" : `en ${daysTo}d`}`, detalle: `$${(d.dividend||0).toFixed(2)}/sh · Est. $${estDiv.toFixed(0)}`, ticker: ourTicker, valor: estDiv });
                    }
                  }
                });
              }
            } catch {}
          }

          // 2. EARNINGS — positions with earnings in next 7 days
          if (body.earnings) {
            for (const [ticker, data] of Object.entries(body.earnings)) {
              if (data?.nextDate) {
                const daysTo = Math.ceil((new Date(data.nextDate) - new Date()) / 86400000);
                if (daysTo >= 0 && daysTo <= 7) {
                  alerts.push({ tipo: "EARNINGS", titulo: `📊 ${ticker} reporta ${daysTo === 0 ? "hoy" : `en ${daysTo}d`}`, detalle: `Earnings: ${data.nextDate}`, ticker, valor: daysTo });
                }
              }
            }
          }

          // 3. BIG DROPS — positions that dropped > 3% today
          if (body.positions?.length) {
            body.positions.forEach(p => {
              if ((p.dayChange || 0) < -3) {
                alerts.push({ tipo: "DROP", titulo: `📉 ${p.ticker} cayó ${p.dayChange.toFixed(1)}% hoy`, detalle: `Precio: $${(p.lastPrice||0).toFixed(2)}`, ticker: p.ticker, valor: p.dayChange });
              }
            });
          }

          // 4. OPTIONS EXPIRING — IB options expiring in < 7 days
          if (body.ibOptions?.length) {
            body.ibOptions.forEach(o => {
              if (o.expiry) {
                const exp = o.expiry.length === 8 ? `${o.expiry.slice(0,4)}-${o.expiry.slice(4,6)}-${o.expiry.slice(6,8)}` : o.expiry;
                const daysTo = Math.ceil((new Date(exp) - new Date()) / 86400000);
                if (daysTo >= 0 && daysTo <= 7) {
                  alerts.push({ tipo: "OPTION_EXP", titulo: `⏰ ${o.undSym||o.ticker} ${o.putOrCall==="C"?"Call":"Put"} $${o.strike} expira ${daysTo===0?"hoy":`en ${daysTo}d`}`, detalle: `${o.shares>0?"Long":"Short"} · MV: $${Math.abs(o.mktValue||0).toFixed(0)}`, ticker: o.undSym||o.ticker, valor: daysTo });
                }
              }
            });
          }

          // 5. MARGIN — if margin > 40% NLV
          if (body.margin && body.nlv && body.nlv > 0) {
            const marginPct = body.margin / body.nlv;
            if (marginPct > 0.4) {
              alerts.push({ tipo: "MARGIN", titulo: `⚠️ Margen al ${(marginPct*100).toFixed(0)}% del NLV`, detalle: `Margen: $${Math.round(body.margin).toLocaleString()} / NLV: $${Math.round(body.nlv).toLocaleString()}`, valor: marginPct });
            }
          }

          // 6. MILESTONE — check if NLV crossed a round number
          if (body.nlv > 0) {
            const milestones = [500000, 750000, 1000000, 1250000, 1500000, 2000000];
            const prevNlv = await env.DB.prepare("SELECT nlv FROM nlv_history ORDER BY fecha DESC LIMIT 1 OFFSET 1").first();
            if (prevNlv?.nlv) {
              milestones.forEach(m => {
                if (body.nlv >= m && prevNlv.nlv < m) {
                  alerts.push({ tipo: "MILESTONE", titulo: `🎉 Portfolio cruzó $${(m/1000).toFixed(0)}K!`, detalle: `NLV: $${Math.round(body.nlv).toLocaleString()}`, valor: body.nlv });
                }
              });
            }
          }

          // Store new alerts (dedup by fecha+tipo+ticker)
          let inserted = 0;
          for (const a of alerts) {
            try {
              const exists = await env.DB.prepare(
                "SELECT id FROM alerts WHERE fecha=? AND tipo=? AND ticker=? LIMIT 1"
              ).bind(today, a.tipo, a.ticker || "").first();
              if (!exists) {
                await env.DB.prepare(
                  "INSERT INTO alerts (fecha, tipo, titulo, detalle, ticker, valor) VALUES (?,?,?,?,?,?)"
                ).bind(today, a.tipo, a.titulo, a.detalle || "", a.ticker || "", a.valor || 0).run();
                inserted++;
              }
            } catch {}
          }

          return json({ date: today, alertsFound: alerts.length, inserted, alerts }, corsHeaders);
        } catch (e) {
          return json({ error: "Alerts check error: " + e.message }, corsHeaders, 500);
        }
      }

      // GET /api/alerts — get recent alerts
      if (path === "/api/alerts" && request.method === "GET") {
        try {
          const limit = parseInt(url.searchParams.get("limit") || "50");
          const { results } = await env.DB.prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?").bind(limit).all();
          const unread = await env.DB.prepare("SELECT COUNT(*) as c FROM alerts WHERE leida=0").first();
          return json({ alerts: results || [], unread: unread?.c || 0 }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // POST /api/alerts/read — mark alerts as read
      if (path === "/api/alerts/read" && request.method === "POST") {
        try {
          await env.DB.prepare("UPDATE alerts SET leida=1 WHERE leida=0").run();
          return json({ ok: true }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/alerts/dividend-changes — recent dividend cut/raise alerts
      if (path === "/api/alerts/dividend-changes" && request.method === "GET") {
        try {
          const limit = parseInt(url.searchParams.get("limit") || "50");
          const { results } = await env.DB.prepare(
            "SELECT * FROM alerts WHERE tipo IN ('DIV_CUT','DIV_RAISE') ORDER BY created_at DESC LIMIT ?"
          ).bind(limit).all();
          return json({ alerts: results || [], count: (results || []).length }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // POST /api/alerts/check-dividend-changes — manually trigger dividend change detection
      if (path === "/api/alerts/check-dividend-changes" && request.method === "POST") {
        try {
          const result = await checkDividendChanges(env);
          return json(result, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // ─── POSITIONS (D1 — replaces POS_STATIC) ───

      // GET /api/positions — all positions
      if (path === "/api/positions" && request.method === "GET") {
        try {
          const list = url.searchParams.get("list") || "";
          let query = "SELECT * FROM positions";
          const params = [];
          if (list) { query += " WHERE list = ?"; params.push(list); }
          query += " ORDER BY usd_value DESC LIMIT 500";
          const { results } = params.length
            ? await env.DB.prepare(query).bind(...params).all()
            : await env.DB.prepare(query).all();
          return json({ positions: results || [], count: (results||[]).length }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // PUT /api/positions/:ticker/notes — save position notes (buy thesis)
      // PATCH /api/positions/:ticker — partial update position fields
      if (path.match(/^\/api\/positions\/[^/]+$/) && !path.includes("/notes") && request.method === "PATCH") {
        try {
          const ticker = decodeURIComponent(path.split("/")[3]);
          const body = await request.json();
          const allowed = ["name","last_price","avg_price","cost_basis","shares","currency","fx","strategy","category","list","market_value","usd_value","total_invested","pnl_pct","pnl_abs","div_ttm","div_yield","yoc","market_cap","sector","extra","notes"];
          const sets = [], vals = [];
          for (const [k, v] of Object.entries(body)) {
            if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
          }
          if (!sets.length) return json({ error: "No valid fields" }, corsHeaders, 400);
          sets.push("updated_at = datetime('now')");
          vals.push(ticker);
          const r = await env.DB.prepare(`UPDATE positions SET ${sets.join(', ')} WHERE ticker = ?`).bind(...vals).run();
          return json({ ok: true, ticker, updated: sets.length - 1, changes: r?.changes || 0 }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // DELETE /api/positions/:ticker — remove a position
      if (path.match(/^\/api\/positions\/[^/]+$/) && !path.includes("/notes") && request.method === "DELETE") {
        try {
          const ticker = decodeURIComponent(path.split("/")[3]);
          const r = await env.DB.prepare("DELETE FROM positions WHERE ticker = ?").bind(ticker).run();
          return json({ ok: true, ticker, deleted: r?.changes || 0 }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      if (path.match(/^\/api\/positions\/[^/]+\/notes$/) && request.method === "PUT") {
        try {
          const ticker = decodeURIComponent(path.split("/")[3]);
          const body = await request.json();
          const notes = (body.notes ?? "").slice(0, 5000);
          await env.DB.prepare("UPDATE positions SET notes = ?, updated_at = datetime('now') WHERE ticker = ?").bind(notes, ticker).run();
          return json({ ok: true, ticker, notes }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // ── Quality + Safety Scores endpoints ──
      // POST /api/scores/compute?ticker=KO        → compute & store 1 ticker
      // POST /api/scores/compute?all=1            → compute & store all positions
      //                                              (supports ?offset=N&limit=N)
      if (path === "/api/scores/compute" && request.method === "POST") {
        try {
          const ticker = url.searchParams.get("ticker");
          const all = url.searchParams.get("all") === "1";
          if (ticker) {
            const r = await computeQualitySafetyScore(env, ticker.toUpperCase());
            return json(r, corsHeaders, r.error ? 400 : 200);
          }
          if (all) {
            const offset = parseInt(url.searchParams.get("offset") || "0", 10);
            const limit = parseInt(url.searchParams.get("limit") || "0", 10);
            const r = await computeQualitySafetyAll(env, { offset, limit });
            return json(r, corsHeaders);
          }
          return json({ error: "Provide ?ticker= or ?all=1" }, corsHeaders, 400);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/scores            → latest snapshot of all tickers
      if (path === "/api/scores" && request.method === "GET") {
        try {
          await ensureQualitySafetyTable(env);
          const { results } = await env.DB.prepare(
            `SELECT qss.* FROM quality_safety_scores qss
             INNER JOIN (
               SELECT ticker, MAX(snapshot_date) AS max_date
               FROM quality_safety_scores
               GROUP BY ticker
             ) latest ON qss.ticker = latest.ticker AND qss.snapshot_date = latest.max_date
             ORDER BY qss.quality_score DESC NULLS LAST`
          ).all();
          return json({ scores: results || [], count: (results || []).length }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/scores/:ticker    → history + breakdown for one ticker
      if (path.match(/^\/api\/scores\/[^/]+$/) && request.method === "GET") {
        try {
          const ticker = decodeURIComponent(path.split("/")[3]).toUpperCase();
          await ensureQualitySafetyTable(env);
          const { results } = await env.DB.prepare(
            `SELECT * FROM quality_safety_scores WHERE ticker = ? ORDER BY snapshot_date DESC LIMIT 24`
          ).bind(ticker).all();
          if (!results || !results.length) {
            return json({ ticker, history: [], message: "No scores yet — POST /api/scores/compute?ticker=" + ticker }, corsHeaders);
          }
          // Parse inputs_json on the latest snapshot
          const latest = { ...results[0] };
          try { latest.inputs = JSON.parse(latest.inputs_json || "{}"); } catch {}
          delete latest.inputs_json;
          return json({ ticker, latest, history: results }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/forward-yield/:ticker  → forward dividend yield from cached financials
      if (path.match(/^\/api\/forward-yield\/[^/]+$/) && request.method === "GET") {
        try {
          const ticker = decodeURIComponent(path.split("/")[3]).toUpperCase();
          const r = await computeForwardYield(env, ticker);
          return json(r, corsHeaders, r.error ? 400 : 200);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // POST /api/positions/import — bulk import positions (from POS_STATIC migration or IB sync)
      if (path === "/api/positions/import" && request.method === "POST") {
        try {
          const body = await request.json();
          const positions = body.positions || [];
          if (!positions.length) return json({ error: "No positions" }, corsHeaders, 400);

          let inserted = 0, updated = 0;
          for (let i = 0; i < positions.length; i += 50) {
            const batch = positions.slice(i, i + 50);
            const stmts = batch.map(p => env.DB.prepare(
              `INSERT OR REPLACE INTO positions (ticker, name, last_price, avg_price, cost_basis, shares, currency, fx, strategy, category, list, market_value, usd_value, total_invested, pnl_pct, pnl_abs, div_ttm, div_yield, yoc, market_cap, sector, extra, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
            ).bind(
              p.ticker, p.name||"", p.lastPrice||p.last_price||0, p.avgPrice||p.avg_price||0, p.costBasis||p.cost_basis||0,
              p.shares||0, p.currency||"USD", p.fx||1, p.strategy||"YO", p.category||"COMPANY", p.list||"portfolio",
              p.marketValue||p.market_value||0, p.usdValue||p.usd_value||0, p.totalInvested||p.total_invested||0,
              p.pnlPct||p.pnl_pct||0, p.pnlAbs||p.pnl_abs||0, p.divTTM||p.div_ttm||0, p.divYield||p.div_yield||0,
              p.yoc||0, p.marketCap||p.market_cap||0, p.sector||"", JSON.stringify(p.extra||{})
            ));
            try { await env.DB.batch(stmts); inserted += batch.length; } catch { updated += batch.length; }
          }

          return json({ ok: true, inserted, updated, total: positions.length }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // POST /api/positions/sync-ib — update positions from IB data
      if (path === "/api/positions/sync-ib" && request.method === "POST") {
        try {
          const { lst, consumerKey, accessToken } = await getIBSession(env);
          const ib = (m, e, b) => ibAuthFetch(lst, consumerKey, accessToken, m, e, b);

          const accounts = await ib("GET", "/portfolio/accounts");
          const accountIds = (Array.isArray(accounts) ? accounts : []).map(a => a.accountId || a.id).filter(Boolean);

          const IB_MAP = {"VIS":"BME:VIS","AMS":"BME:AMS","IIPR PRA":"IIPR-PRA","9618":"HKG:9618","1052":"HKG:1052","2219":"HKG:2219","1910":"HKG:1910","9616":"HKG:9616"};

          // Collect all positions across accounts
          const merged = {};
          for (const accountId of accountIds) {
            for (let page = 0; page < 5; page++) {
              const positions = await ib("GET", `/portfolio/${accountId}/positions/${page}`);
              if (!positions || !Array.isArray(positions) || !positions.length) break;
              for (const p of positions) {
                if (!p.position || p.position === 0 || p.assetClass !== "STK") continue;
                const ticker = IB_MAP[p.ticker] || p.ticker || "";
                if (!ticker) continue;
                if (merged[ticker]) {
                  merged[ticker].shares += p.position || 0;
                  merged[ticker].mktValue += p.mktValue || 0;
                  merged[ticker].unrealizedPnl += p.unrealizedPnl || 0;
                } else {
                  merged[ticker] = {
                    ticker, name: p.name || p.fullName || "", shares: p.position || 0,
                    mktPrice: p.mktPrice || 0, mktValue: p.mktValue || 0,
                    avgCost: p.avgCost || 0, unrealizedPnl: p.unrealizedPnl || 0,
                    currency: p.currency || "USD", sector: p.sector || "",
                  };
                }
              }
            }
          }

          // Upsert IB data into positions table (ib_shares/ib_avg_cost/ib_price — keeps app shares separate)
          let synced = 0;
          const stmts = [];
          const syncedTickers = [];
          for (const [ticker, p] of Object.entries(merged)) {
            if (Math.abs(p.mktValue) < 100 || p.mktPrice <= 0) continue;
            syncedTickers.push(ticker);
            stmts.push(env.DB.prepare(
              `INSERT INTO positions (ticker, name, last_price, ib_shares, ib_avg_cost, ib_price, currency, category, list, market_value, sector, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
               ON CONFLICT(ticker) DO UPDATE SET last_price=excluded.last_price, ib_shares=excluded.ib_shares, ib_avg_cost=excluded.ib_avg_cost, ib_price=excluded.ib_price, market_value=excluded.market_value, updated_at=datetime('now')`
            ).bind(
              ticker, p.name, p.mktPrice, p.shares, p.avgCost, p.mktPrice, p.currency || "USD", "COMPANY", "portfolio",
              p.mktValue, p.sector
            ));
            synced++;
          }

          // Execute in batches
          for (let i = 0; i < stmts.length; i += 50) {
            await env.DB.batch(stmts.slice(i, i + 50));
          }
          // Zero out sold positions
          if (syncedTickers.length > 0) {
            const ph = syncedTickers.map(() => "?").join(",");
            await env.DB.prepare(`UPDATE positions SET ib_shares=0, ib_avg_cost=0, ib_price=0 WHERE ib_shares > 0 AND ticker NOT IN (${ph})`).bind(...syncedTickers).run();
          }

          return json({ ok: true, accounts: accountIds.length, synced, total: Object.keys(merged).length }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/data-status — last update date for each data source
      if (path === "/api/data-status" && request.method === "GET") {
        try {
          const queries = await Promise.all([
            env.DB.prepare("SELECT MAX(fecha) as last FROM patrimonio").first(),
            env.DB.prepare("SELECT MAX(fecha) as last FROM dividendos").first(),
            env.DB.prepare("SELECT MAX(fecha) as last FROM gastos").first(),
            env.DB.prepare("SELECT MAX(fecha) as last FROM cost_basis").first(),
            env.DB.prepare("SELECT MAX(fecha) as last FROM nlv_history").first(),
            env.DB.prepare("SELECT MAX(created_at) as last FROM alerts").first(),
            env.DB.prepare("SELECT updated_at as last FROM positions ORDER BY updated_at DESC LIMIT 1").first(),
            env.DB.prepare("SELECT COUNT(*) as c FROM positions").first(),
            env.DB.prepare("SELECT COUNT(*) as c FROM dividendos").first(),
            env.DB.prepare("SELECT COUNT(*) as c FROM cost_basis").first(),
            env.DB.prepare("SELECT COUNT(*) as c FROM gastos").first(),
          ]);
          return json({
            patrimonio: { lastUpdate: queries[0]?.last || "—" },
            dividendos: { lastUpdate: queries[1]?.last || "—", count: queries[8]?.c || 0 },
            gastos: { lastUpdate: queries[2]?.last || "—", count: queries[10]?.c || 0 },
            trades: { lastUpdate: queries[3]?.last || "—", count: queries[9]?.c || 0 },
            nlv: { lastUpdate: queries[4]?.last || "—" },
            alerts: { lastUpdate: queries[5]?.last || "—" },
            positions: { lastUpdate: queries[6]?.last || "—", count: queries[7]?.c || 0 },
          }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/tax-report?year=2025 — tax summary from cost_basis + dividendos
      if (path === "/api/tax-report" && request.method === "GET") {
        const year = url.searchParams.get("year") || String(new Date().getFullYear());
        try {
          // Realized gains/losses from trades
          const trades = await env.DB.prepare(
            "SELECT ticker, fecha, tipo, shares, precio, comision, coste FROM cost_basis WHERE fecha LIKE ? AND tipo='EQUITY'"
          ).bind(year + "%").all();
          const sells = (trades.results || []).filter(t => (t.shares || 0) < 0);
          const buys = (trades.results || []).filter(t => (t.shares || 0) > 0);
          const totalSellProceeds = sells.reduce((s, t) => s + Math.abs(t.coste || 0), 0);
          const totalBuyCost = buys.reduce((s, t) => s + Math.abs(t.coste || 0), 0);
          const totalCommissions = (trades.results || []).reduce((s, t) => s + Math.abs(t.comision || 0), 0);

          // Option income
          const opts = await env.DB.prepare(
            "SELECT SUM(ABS(coste)) as total FROM cost_basis WHERE fecha LIKE ? AND tipo='OPTION' AND coste > 0"
          ).bind(year + "%").first();

          // Dividends received
          const divs = await env.DB.prepare(
            "SELECT SUM(div_total) as gross, COUNT(*) as count FROM dividendos WHERE fecha LIKE ?"
          ).bind(year + "%").first();

          // Dividends by ticker
          const divByTicker = await env.DB.prepare(
            "SELECT ticker, SUM(div_total) as total, COUNT(*) as payments FROM dividendos WHERE fecha LIKE ? GROUP BY ticker ORDER BY total DESC"
          ).bind(year + "%").all();

          return json({
            year,
            trades: { sells: sells.length, buys: buys.length, totalSellProceeds, totalBuyCost, totalCommissions },
            options: { income: opts?.total || 0 },
            dividends: { gross: divs?.gross || 0, count: divs?.count || 0, byTicker: divByTicker.results || [] },
          }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/dividend-dps-live — live DPS for all portfolio positions
      // Strategy: Annualize from most recent per-share payment (avoids share-accumulation bias)
      // Falls back to FMP cache, then positions.div_ttm
      // Returns { [ticker]: { dps, yield, frequency, source } }
      if (path === "/api/dividend-dps-live" && request.method === "GET") {
        try {
          // 1. Get all portfolio tickers with shares > 0, plus last price for yield calc
          const positions = await env.DB.prepare("SELECT ticker, shares, div_ttm, last_price FROM positions WHERE shares > 0").all();
          const tickers = (positions.results || []).map(p => p.ticker).filter(Boolean);
          if (!tickers.length) return json({}, corsHeaders);

          const result = {};

          // Reverse alias map: position ticker → possible dividendos tickers
          const POS_TO_DIV_ALIASES = {
            "BME:VIS":["VIS","VIS.D","VISCOFAN"],"BME:AMS":["AMS","AMS.D"],
            "HKG:9618":["9618","JD"],"HKG:1052":["1052"],"HKG:1910":["1910"],
            "HKG:2219":["2219"],"HKG:9616":["9616"],
            "IIPR-PRA":["IIPR PRA","IIPRPRA"],
          };

          // 2. Get recent dividend payments per ticker (last 14 months, ordered by date desc)
          //    Use bruto_usd when available so DPS is always in USD regardless of dividend currency
          const recentDate = new Date(Date.now() - 420 * 86400000).toISOString().slice(0, 10);
          const recentDivs = await env.DB.prepare(
            `SELECT ticker, fecha, CASE WHEN bruto_usd > 0 THEN bruto_usd ELSE bruto END as bruto, shares, CASE WHEN bruto_usd > 0 THEN 'USD' ELSE COALESCE(divisa,'USD') END as divisa FROM dividendos WHERE fecha >= ? ORDER BY fecha DESC`
          ).bind(recentDate).all();

          // Build per-ticker arrays of recent payments
          const paymentsByTicker = {};
          for (const row of (recentDivs.results || [])) {
            if (!paymentsByTicker[row.ticker]) paymentsByTicker[row.ticker] = [];
            paymentsByTicker[row.ticker].push(row);
          }

          // Helper: find payments for a position ticker (checking aliases)
          const findPayments = (ticker) => {
            if (paymentsByTicker[ticker]?.length) return paymentsByTicker[ticker];
            const aliases = POS_TO_DIV_ALIASES[ticker];
            if (aliases) {
              for (const alt of aliases) {
                if (paymentsByTicker[alt]?.length) return paymentsByTicker[alt];
              }
            }
            return [];
          };

          // Helper: deduplicate payments by date — take MAX bruto per date
          // (bruto_usd is the same USD amount regardless of account, so MAX deduplicates
          //  manual vs IB entries while still being correct for multi-account imports)
          const deduplicateByDate = (payments) => {
            const byDate = {};
            for (const p of payments) {
              if (!byDate[p.fecha] || (p.bruto || 0) > (byDate[p.fecha].bruto || 0)) {
                byDate[p.fecha] = { ...p };
              }
            }
            return Object.values(byDate).sort((a, b) => b.fecha.localeCompare(a.fecha));
          };

          // Helper: detect frequency from payment dates (uses deduplicated payments)
          const detectFrequency = (payments) => {
            const deduped = deduplicateByDate(payments);
            if (deduped.length < 2) return { freq: "annual", n: 1 }; // single payment in 14mo → assume annual
            // Count distinct payment dates in TTM window
            const ttmCutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
            const ttmDeduped = deduped.filter(p => p.fecha >= ttmCutoff);
            const count = ttmDeduped.length;
            if (count >= 11) return { freq: "monthly", n: 12 };
            if (count >= 6) return { freq: "quarterly", n: 4 };
            if (count >= 3) return { freq: "quarterly", n: 4 };
            // If only 1-2 distinct dates in TTM, look at gap between last 2 distinct dates
            if (deduped.length >= 2) {
              const d1 = new Date(deduped[0].fecha);
              const d2 = new Date(deduped[1].fecha);
              const gapDays = Math.abs(d1 - d2) / 86400000;
              if (gapDays < 50 && gapDays > 0) return { freq: "monthly", n: 12 };
              if (gapDays < 120) return { freq: "quarterly", n: 4 };
              if (gapDays < 270) return { freq: "semiannual", n: 2 };
              return { freq: "annual", n: 1 };
            }
            if (count >= 1) return { freq: "semiannual", n: 2 };
            return { freq: "quarterly", n: 4 };
          };

          // Helper: compute annualized DPS from most recent payment
          const calcAnnualizedDPS = (payments, posShares) => {
            if (!payments.length) return { dps: 0, currency: 'USD', freq: "annual", n: 1, payments_ttm: 0 };
            const { freq, n } = detectFrequency(payments);
            // Deduplicate to get correct per-date totals (multi-account imports)
            const deduped = deduplicateByDate(payments);
            // Use most recent deduplicated payment's per-share amount
            const last = deduped[0];
            // With bruto_usd, the deduped entry already has the correct amount (MAX, not SUM)
            let maxShares = Math.max(...payments.filter(p => p.fecha === last.fecha).map(p => p.shares || 0));
            // Fallback to position shares when dividend entries lack shares data
            if (!maxShares && posShares > 0) maxShares = posShares;
            const lastDPS = maxShares > 0 ? (last.bruto / maxShares) : 0;
            const ttmCutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
            const ttmPayments = deduped.filter(p => p.fecha >= ttmCutoff);
            // Currency from most recent payment (should be 'USD' when bruto_usd was used)
            const currency = last.divisa || 'USD';
            return {
              dps: lastDPS * n,
              currency,
              freq,
              n,
              payments_ttm: ttmPayments.length,
              last_dps: lastDPS,
              ttm_total: ttmPayments.reduce((s, p) => s + (p.bruto || 0), 0),
            };
          };

          // 3. For each ticker: prefer annualized actual, fallback to FMP cache, then positions.div_ttm
          for (const ticker of tickers) {
            const pos = (positions.results || []).find(p => p.ticker === ticker);
            const price = pos?.last_price || 0;
            const payments = findPayments(ticker);

            let dps = 0;
            let source = "none";
            let frequency = "quarterly";
            let currency = "USD";
            let ttmTotal = 0;
            let paymentsTTM = 0;

            if (payments.length > 0) {
              const calc = calcAnnualizedDPS(payments, pos?.shares);
              if (calc.dps > 0) {
                dps = calc.dps;
                source = "ttm_actual";
                frequency = calc.freq;
                currency = calc.currency || "USD";
                ttmTotal = calc.ttm_total || 0;
                paymentsTTM = calc.payments_ttm || 0;
              }
            }

            // Fallback: FMP fundamentals cache (already annualized DPS in USD)
            if (!dps) {
              const cached = await env.DB.prepare(
                "SELECT ratios FROM fundamentals WHERE symbol = ?"
              ).bind(ticker).first();
              if (cached?.ratios) {
                try {
                  const ratios = JSON.parse(cached.ratios || "[]");
                  const latest = Array.isArray(ratios) ? ratios[0] : ratios;
                  dps = latest?.dividendPerShare || latest?.dividendPerShareTTM || 0;
                  if (dps > 0) { source = "fmp_cache"; currency = "USD"; }
                } catch {}
              }
            }

            // Last fallback: positions.div_ttm (already annualized)
            if (!dps && pos?.div_ttm > 0) {
              dps = pos.div_ttm;
              source = "positions";
              currency = "USD";
            }

            const dy = price > 0 && dps > 0 ? dps / price : 0;

            result[ticker] = {
              dps: Math.round(dps * 100) / 100,
              currency,
              yield: Math.round(dy * 10000) / 10000,
              frequency,
              source,
              ttm_total: ttmTotal ? Math.round(ttmTotal) : 0,
              payments_ttm: paymentsTTM,
            };
          }

          return json(result, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // POST /api/refresh-div-ttm — manually trigger div_ttm refresh for all positions
      if (path === "/api/refresh-div-ttm" && request.method === "POST") {
        try {
          const result = await refreshDivTTM(env);
          return json(result, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/dividend-forward — 12-month forward dividend projection
      if (path === "/api/dividend-forward" && request.method === "GET") {
        try {
          // 1. Get positions with shares > 0
          const positions = await env.DB.prepare("SELECT ticker, shares, div_ttm, last_price FROM positions WHERE shares > 0").all();
          const tickers = (positions.results || []).map(p => p.ticker).filter(Boolean);
          if (!tickers.length) return json({ annual_projected: 0, monthly: [], by_ticker: [] }, corsHeaders);

          // Reverse alias map (same as dps-live)
          const POS_TO_DIV_ALIASES = {
            "BME:VIS":["VIS","VIS.D"],"BME:AMS":["AMS","AMS.D"],
            "HKG:9618":["9618","JD"],"HKG:1052":["1052"],"HKG:1910":["1910"],
            "HKG:2219":["2219"],"HKG:9616":["9616"],
            "IIPR-PRA":["IIPR PRA","IIPRPRA"],
          };

          // 2. Get recent dividend payments per ticker (last 14 months) for annualized DPS
          //    Use bruto_usd so forward projections are always in USD
          const recentDate = new Date(Date.now() - 420 * 86400000).toISOString().slice(0, 10);
          const recentDivs = await env.DB.prepare(
            `SELECT ticker, fecha, CASE WHEN bruto_usd > 0 THEN bruto_usd ELSE bruto END as bruto, shares, CASE WHEN bruto_usd > 0 THEN 'USD' ELSE COALESCE(divisa,'USD') END as divisa FROM dividendos WHERE fecha >= ? ORDER BY fecha DESC`
          ).bind(recentDate).all();

          const paymentsByTicker = {};
          for (const row of (recentDivs.results || [])) {
            if (!paymentsByTicker[row.ticker]) paymentsByTicker[row.ticker] = [];
            paymentsByTicker[row.ticker].push(row);
          }

          const findPaymentsFwd = (ticker) => {
            if (paymentsByTicker[ticker]?.length) return paymentsByTicker[ticker];
            const aliases = POS_TO_DIV_ALIASES[ticker];
            if (aliases) { for (const alt of aliases) { if (paymentsByTicker[alt]?.length) return paymentsByTicker[alt]; } }
            return [];
          };

          // Deduplicate payments by date — take MAX bruto per date (same as dps-live)
          const dedupByDateFwd = (payments) => {
            const byDate = {};
            for (const p of payments) {
              if (!byDate[p.fecha] || (p.bruto || 0) > (byDate[p.fecha].bruto || 0)) {
                byDate[p.fecha] = { ...p };
              }
            }
            return Object.values(byDate).sort((a, b) => b.fecha.localeCompare(a.fecha));
          };

          const detectFreqFwd = (payments) => {
            const deduped = dedupByDateFwd(payments);
            if (deduped.length < 2) return { freq: "annual", n: 1 }; // single payment in 14mo → assume annual
            const ttmCutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
            const ttmDeduped = deduped.filter(p => p.fecha >= ttmCutoff);
            const count = ttmDeduped.length;
            if (count >= 11) return { freq: "monthly", n: 12 };
            if (count >= 3) return { freq: "quarterly", n: 4 };
            if (deduped.length >= 2) {
              const d1 = new Date(deduped[0].fecha);
              const d2 = new Date(deduped[1].fecha);
              const gapDays = Math.abs(d1 - d2) / 86400000;
              if (gapDays < 50 && gapDays > 0) return { freq: "monthly", n: 12 };
              if (gapDays < 120) return { freq: "quarterly", n: 4 };
              if (gapDays < 270) return { freq: "semiannual", n: 2 };
              return { freq: "annual", n: 1 };
            }
            if (count >= 1) return { freq: "semiannual", n: 2 };
            return { freq: "quarterly", n: 4 };
          };

          const dpsMap = {};
          for (const ticker of tickers) {
            const pos = (positions.results || []).find(p => p.ticker === ticker);
            const payments = findPaymentsFwd(ticker);
            let dps = 0;
            let frequency = "quarterly";

            if (payments.length > 0) {
              const { freq, n } = detectFreqFwd(payments);
              // Deduplicate — deduped entry already has correct amount (MAX, not SUM)
              const deduped = dedupByDateFwd(payments);
              const last = deduped[0];
              let maxShares = Math.max(...payments.filter(p => p.fecha === last.fecha).map(p => p.shares || 0));
              // Fallback to position shares when dividend entries lack shares data
              if (!maxShares && pos?.shares > 0) maxShares = pos.shares;
              const lastDPS = maxShares > 0 ? (last.bruto / maxShares) : 0;
              dps = lastDPS * n;
              frequency = freq;
            }

            // Fallback to positions.div_ttm (already annualized)
            if (!dps) dps = pos?.div_ttm || 0;
            dpsMap[ticker] = { dps, frequency };
          }

          // 3. Get last dividend dates per ticker from dividendos table
          const lastDivDates = {};
          for (const ticker of tickers) {
            const row = await env.DB.prepare(
              "SELECT fecha FROM dividendos WHERE ticker = ? ORDER BY fecha DESC LIMIT 1"
            ).bind(ticker).first();
            if (row?.fecha) lastDivDates[ticker] = row.fecha;
          }

          // 4. Project forward 12 months
          const now = new Date();
          const monthly = [];
          for (let m = 0; m < 12; m++) {
            const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
            monthly.push({ month: d.toISOString().slice(0, 7), amount: 0, payments: [] });
          }

          const byTicker = [];
          let annualProjected = 0;

          for (const ticker of tickers) {
            const pos = (positions.results || []).find(p => p.ticker === ticker);
            const shares = pos?.shares || 0;
            const { dps, frequency } = dpsMap[ticker] || {};
            if (!dps || !shares) continue;

            const freqMap = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };
            const paymentsPerYear = freqMap[frequency] || 4;
            const dpsPerPayment = dps / paymentsPerYear;
            const annualAmount = dps * shares;
            annualProjected += annualAmount;

            byTicker.push({
              ticker, dps: Math.round(dps * 100) / 100, shares, frequency,
              annual: Math.round(annualAmount),
              monthly_avg: Math.round(annualAmount / 12),
            });

            // Determine payment months from last known dividend date
            const lastDate = lastDivDates[ticker] ? new Date(lastDivDates[ticker]) : null;
            const intervalMonths = 12 / paymentsPerYear;

            for (let m = 0; m < 12; m++) {
              const targetMonth = new Date(now.getFullYear(), now.getMonth() + m, 15);
              let willPay = false;

              if (frequency === "monthly") {
                willPay = true;
              } else if (lastDate) {
                // Check if this month aligns with the payment cycle
                const monthsDiff = (targetMonth.getFullYear() - lastDate.getFullYear()) * 12 + targetMonth.getMonth() - lastDate.getMonth();
                willPay = monthsDiff > 0 && monthsDiff % intervalMonths === 0;
              } else {
                // No history — distribute evenly
                willPay = m % Math.round(12 / paymentsPerYear) === 0;
              }

              if (willPay) {
                const amount = Math.round(dpsPerPayment * shares * 100) / 100;
                monthly[m].amount += amount;
                monthly[m].payments.push({ ticker, amount });
              }
            }
          }

          // 5. YoY growth from dividendos table
          const thisYear = now.getFullYear();
          const lastYearDiv = await env.DB.prepare(
            "SELECT ROUND(SUM(CASE WHEN bruto_usd > 0 THEN bruto_usd ELSE bruto END),2) as total FROM dividendos WHERE fecha LIKE ?"
          ).bind(`${thisYear - 1}%`).first();
          const growthYoy = lastYearDiv?.total > 0 ? ((annualProjected - lastYearDiv.total) / lastYearDiv.total * 100) : null;

          // Sort by_ticker by annual descending
          byTicker.sort((a, b) => b.annual - a.annual);

          return json({
            annual_projected: Math.round(annualProjected),
            monthly_avg: Math.round(annualProjected / 12),
            monthly,
            by_ticker: byTicker,
            growth_yoy: growthYoy != null ? Math.round(growthYoy * 10) / 10 : null,
            tickers_count: byTicker.length,
          }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // POST /api/dividendos/fix-tickers — normalize IB tickers in existing dividend records
      if (path === "/api/dividendos/fix-tickers" && request.method === "POST") {
        try {
          const IB_MAP = {"VIS":"BME:VIS","AMS":"BME:AMS","IIPR PRA":"IIPR-PRA","9618":"HKG:9618","1052":"HKG:1052","2219":"HKG:2219","1910":"HKG:1910","9616":"HKG:9616","VIS.D":"BME:VIS","ENGe":"ENG","LOGe":"LOG","REPe":"REP","ISPAd":"ISPA"};
          let fixed = 0;
          for (const [ibTicker, appTicker] of Object.entries(IB_MAP)) {
            const result = await env.DB.prepare(
              "UPDATE dividendos SET ticker = ? WHERE ticker = ?"
            ).bind(appTicker, ibTicker).run();
            if (result?.changes > 0) fixed += result.changes;
          }
          return json({ success: true, fixed }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // POST /api/positions/refresh-dps — refresh div_ttm from fundamentals cache or manual overrides
      if (path === "/api/positions/refresh-dps" && request.method === "POST") {
        try {
          // Accept optional manual DPS overrides in body
          const body = await request.json().catch(() => ({}));
          const overrides = body?.overrides || {};
          // Apply manual overrides first
          let manualUpdated = 0;
          for (const [ticker, dps] of Object.entries(overrides)) {
            if (dps > 0) {
              await env.DB.prepare("UPDATE positions SET div_ttm = ? WHERE ticker = ?").bind(dps, ticker).run();
              manualUpdated++;
            }
          }

          const positions = await env.DB.prepare("SELECT ticker, shares FROM positions").all();
          let updated = 0, zeroed = 0;
          for (const pos of (positions.results || [])) {
            if (!pos.shares || pos.shares <= 0) {
              await env.DB.prepare("UPDATE positions SET div_ttm = 0, div_yield = 0, yoc = 0 WHERE ticker = ?")
                .bind(pos.ticker).run();
              zeroed++;
              continue;
            }
            const cached = await env.DB.prepare("SELECT ratios FROM fundamentals WHERE symbol = ?")
              .bind(pos.ticker).first();
            if (cached?.ratios) {
              try {
                const ratios = JSON.parse(cached.ratios || "[]");
                const latest = Array.isArray(ratios) ? ratios[0] : ratios;
                const dps = latest?.dividendPerShare || latest?.dividendPerShareTTM || 0;
                const dy = latest?.dividendYield || latest?.dividendYieldTTM || 0;
                if (dps > 0) {
                  await env.DB.prepare("UPDATE positions SET div_ttm = ?, div_yield = ? WHERE ticker = ?")
                    .bind(dps, dy, pos.ticker).run();
                  updated++;
                }
              } catch {}
            }
          }
          return json({ success: true, updated, zeroed, manualUpdated, total: (positions.results || []).length }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/dividend-calendar?symbols=AAPL,MSFT — upcoming ex-dates from FMP
      if (path === "/api/dividend-calendar" && request.method === "GET") {
        const symbols = (url.searchParams.get("symbols") || "").split(",").filter(Boolean).map(s => s.trim().toUpperCase());
        try {
          // FMP dividend calendar returns ALL upcoming ex-dates
          const resp = await fetch(`${FMP_BASE}/stock-dividend-calendar?apikey=${FMP_KEY}`);
          const data = await resp.json();
          if (!Array.isArray(data)) return json({ error: "No calendar data" }, corsHeaders, 502);

          // Build FMP→ourTicker map and FMP symbol set for matching
          const fmpToOur = {}; // e.g. "ENG.MC" → "ENG", "RAND.AS" → "RAND"
          const fmpSymSet = new Set();
          for (const s of symbols) {
            const fmpS = toFMP(s);
            fmpToOur[fmpS] = s;
            fmpSymSet.add(fmpS);
          }

          // Filter to user's symbols (matching against FMP symbols)
          const filtered = symbols.length > 0
            ? data.filter(d => fmpSymSet.has(d.symbol))
            : data;

          // Map results back to our ticker format
          const results = filtered.map(d => ({
            symbol: fmpToOur[d.symbol] || fromFMP(d.symbol),
            exDate: d.date,
            payDate: d.paymentDate || "",
            recordDate: d.recordDate || "",
            dividend: d.dividend || d.adjDividend || 0,
            yield: d.yield || 0,
          }));

          // Also fetch individual dividend history for user's top symbols
          const history = {};
          const topSymbols = symbols.slice(0, 20);
          for (let i = 0; i < topSymbols.length; i += 5) {
            const batch = topSymbols.slice(i, i + 5);
            await Promise.all(batch.map(async sym => {
              try {
                const fmpS = toFMP(sym);
                const r = await fetch(`${FMP_BASE}/dividends?symbol=${fmpS}&apikey=${FMP_KEY}`);
                const d = await r.json();
                if (Array.isArray(d)) {
                  history[sym] = d.slice(0, 8).map(x => ({
                    exDate: x.date, payDate: x.paymentDate || "", dividend: x.dividend || x.adjDividend || 0,
                  }));
                }
              } catch {}
            }));
          }

          return json({ upcoming: results, history, count: results.length }, corsHeaders);
        } catch (e) { return json({ error: e.message }, corsHeaders, 500); }
      }

      // GET /api/dividend-streak?symbols=AAPL,MSFT — dividend growth streak from FMP
      if (path === "/api/dividend-streak" && request.method === "GET") {
        const symbols = (url.searchParams.get("symbols") || "").split(",").filter(Boolean).slice(0, 50);
        if (!symbols.length) return json({ error: "Missing ?symbols=" }, corsHeaders, 400);
        const results = {};
        for (let i = 0; i < symbols.length; i += 5) {
          const batch = symbols.slice(i, i + 5);
          await Promise.all(batch.map(async sym => {
            try {
              const fmpSym = toFMP(sym.trim().toUpperCase());
              const resp = await fetch(`${FMP_BASE}/dividends?symbol=${fmpSym}&apikey=${FMP_KEY}`);
              const data = await resp.json();
              if (!Array.isArray(data) || !data.length) { results[sym] = { streak: 0, years: 0 }; return; }
              // Group by year, get annual total
              const byYear = {};
              data.forEach(d => {
                const y = parseInt((d.date || d.paymentDate || "").slice(0, 4));
                if (y > 2000) byYear[y] = (byYear[y] || 0) + (d.dividend || d.adjDividend || 0);
              });
              const years = Object.entries(byYear).sort((a, b) => b[0] - a[0]);
              let streak = 0;
              for (let j = 0; j < years.length - 1; j++) {
                if (years[j][1] > years[j + 1][1]) streak++;
                else break;
              }
              results[sym.trim().toUpperCase()] = {
                streak,
                years: years.length,
                lastDiv: years[0] ? { year: years[0][0], total: years[0][1] } : null,
                label: streak >= 25 ? "Aristocrat" : streak >= 10 ? "Achiever" : streak >= 5 ? "Contender" : streak > 0 ? "Growing" : "—",
              };
            } catch { results[sym] = { streak: 0, years: 0 }; }
          }));
        }
        return json(results, corsHeaders);
      }

      // GET /api/dividend-growth?tickers=AAPL,O,SCHD — DGR (1Y/3Y/5Y/10Y) + streak for multiple tickers
      // Also supports single ticker: GET /api/dividend-growth/AAPL
      if ((path === "/api/dividend-growth" || path.startsWith("/api/dividend-growth/")) && request.method === "GET") {
        let tickers;
        if (path !== "/api/dividend-growth") {
          // Single ticker from path
          tickers = [path.split("/api/dividend-growth/")[1].trim().toUpperCase()];
        } else {
          tickers = (url.searchParams.get("tickers") || "").split(",").map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 60);
        }
        if (!tickers.length) return json({ error: "Missing ?tickers= or /api/dividend-growth/:ticker" }, corsHeaders, 400);
        const forceRefresh = url.searchParams.get("refresh") === "1";

        const results = {};

        // Helper: calculate DGR from annual dividend totals
        const calcDGR = (byYear) => {
          const sortedYears = Object.entries(byYear).sort((a, b) => b[0] - a[0]); // newest first
          if (sortedYears.length < 2) return { dgr1: null, dgr3: null, dgr5: null, dgr10: null, streak: 0, history: byYear };
          const currentYear = new Date().getFullYear();
          // Use most recent full year (or current year if it has dividends)
          const latestYear = parseInt(sortedYears[0][0]);
          const latestDiv = sortedYears[0][1];

          const calcCAGR = (n) => {
            const targetYear = latestYear - n;
            const entry = sortedYears.find(([y]) => parseInt(y) === targetYear);
            if (!entry || entry[1] <= 0 || latestDiv <= 0) return null;
            return Math.pow(latestDiv / entry[1], 1 / n) - 1;
          };

          // Streak: consecutive years of growth (newest to oldest)
          let streak = 0;
          for (let j = 0; j < sortedYears.length - 1; j++) {
            if (sortedYears[j][1] > sortedYears[j + 1][1] * 0.995) streak++; // 0.5% tolerance for rounding
            else break;
          }

          return {
            dgr1: calcCAGR(1),
            dgr3: calcCAGR(3),
            dgr5: calcCAGR(5),
            dgr10: calcCAGR(10),
            streak,
            latestDiv,
            latestYear,
            history: byYear,
          };
        };

        // Process in batches of 5
        for (let i = 0; i < tickers.length; i += 5) {
          const batch = tickers.slice(i, i + 5);
          await Promise.all(batch.map(async sym => {
            try {
              // Check cache first (fundamentals.dgr column, 24h TTL)
              if (!forceRefresh) {
                const cached = await env.DB.prepare("SELECT dgr, updated_at FROM fundamentals WHERE symbol = ?").bind(sym).first();
                if (cached && cached.dgr && cached.updated_at) {
                  const age = Date.now() - new Date(cached.updated_at).getTime();
                  if (age < 24 * 3600 * 1000) {
                    try {
                      results[sym] = JSON.parse(cached.dgr);
                      return;
                    } catch {}
                  }
                }
              }

              // Fetch dividend history from FMP (convert to FMP symbol for foreign tickers)
              const fmpSym = toFMP(sym);
              const resp = await fetchWithRetry(`${FMP_BASE}/dividends?symbol=${fmpSym}&apikey=${FMP_KEY}`, {}, { maxRetries: 2, baseDelay: 1000 });
              const data = await resp.json();
              if (!Array.isArray(data) || !data.length) {
                results[sym] = { dgr1: null, dgr3: null, dgr5: null, dgr10: null, streak: 0, history: {} };
                return;
              }

              // Group by year, sum annual dividends
              const byYear = {};
              data.forEach(d => {
                const y = parseInt((d.date || d.paymentDate || "").slice(0, 4));
                if (y > 2000) byYear[y] = (byYear[y] || 0) + (d.adjDividend || d.dividend || 0);
              });

              const dgrResult = calcDGR(byYear);
              results[sym] = dgrResult;

              // Cache in fundamentals.dgr column
              try {
                await env.DB.prepare(
                  `INSERT INTO fundamentals (symbol, dgr, updated_at) VALUES (?, ?, datetime('now'))
                   ON CONFLICT(symbol) DO UPDATE SET dgr=excluded.dgr, updated_at=datetime('now')`
                ).bind(sym, JSON.stringify(dgrResult)).run();
              } catch {}
            } catch (e) {
              results[sym] = { dgr1: null, dgr3: null, dgr5: null, dgr10: null, streak: 0, error: e.message };
            }
          }));
          // Small delay between batches
          if (i + 5 < tickers.length) await new Promise(r => setTimeout(r, 300));
        }

        return json(results, corsHeaders);
      }

      // GET /api/earnings-batch?symbols=AAPL,MSFT,GOOG — batch earnings dates
      if (path === "/api/earnings-batch" && request.method === "GET") {
        const symbols = (url.searchParams.get("symbols") || "").split(",").filter(Boolean).slice(0, 50);
        if (!symbols.length) return json({ error: "Missing ?symbols=" }, corsHeaders, 400);
        try {
          const results = {};
          const batches = [];
          for (let i = 0; i < symbols.length; i += 5) {
            batches.push(symbols.slice(i, i + 5));
          }
          for (const batch of batches) {
            const fetches = batch.map(async sym => {
              try {
                const fmpSym = toFMP(sym.trim().toUpperCase());
                const resp = await fetch(`${FMP_BASE}/earnings?symbol=${fmpSym}&apikey=${FMP_KEY}`);
                const data = await resp.json();
                const upcoming = (data || []).filter(e => new Date(e.date) >= new Date()).sort((a, b) => new Date(a.date) - new Date(b.date));
                const past = (data || []).filter(e => new Date(e.date) < new Date()).sort((a, b) => new Date(b.date) - new Date(a.date));
                results[sym.trim().toUpperCase()] = {
                  next: upcoming[0] || null,
                  last: past[0] || null,
                  nextDate: upcoming[0]?.date || null,
                  lastDate: past[0]?.date || null,
                };
              } catch (e) {
                results[sym.trim().toUpperCase()] = { next: null, last: null, nextDate: null, lastDate: null };
              }
            });
            await Promise.all(fetches);
          }
          return json(results, corsHeaders);
        } catch (e) {
          return json({ error: "Earnings batch failed: " + e.message }, corsHeaders, 500);
        }
      }

      // GET /api/fundamentals?symbol=AAPL — get cached or fetch fresh
      // v6: Now fetches 12 FMP endpoints (was 6) — adds rating, DCF, estimates, price targets, key metrics, financial growth
      if (path === "/api/fundamentals" && request.method === "GET") {
        const symbol = url.searchParams.get("symbol");
        const forceRefresh = url.searchParams.get("refresh") === "1";
        if (!symbol) return json({ error: "Missing ?symbol=" }, corsHeaders);

        // Check cache
        if (!forceRefresh) {
          const cached = await env.DB.prepare("SELECT * FROM fundamentals WHERE symbol = ?").bind(symbol.toUpperCase()).first();
          if (cached && cached.updated_at) {
            const age = Date.now() - new Date(cached.updated_at).getTime();
            if (age < 24 * 3600 * 1000) { // 24h cache
              try {
                const cachedIncome = JSON.parse(cached.income || "[]");
                // Don't serve cached data with empty income (likely a failed FMP fetch)
                if (cachedIncome.length === 0) throw new Error("cached income empty — re-fetch");
                return json({
                  symbol: cached.symbol,
                  income: cachedIncome,
                  balance: JSON.parse(cached.balance || "[]"),
                  cashflow: JSON.parse(cached.cashflow || "[]"),
                  profile: JSON.parse(cached.profile || "{}"),
                  dividends: JSON.parse(cached.dividends || "[]"),
                  ratios: JSON.parse(cached.ratios || "[]"),
                  rating: JSON.parse(cached.rating || "{}"),
                  dcf: JSON.parse(cached.dcf || "{}"),
                  estimates: JSON.parse(cached.estimates || "[]"),
                  priceTarget: JSON.parse(cached.price_target || "{}"),
                  keyMetrics: JSON.parse(cached.key_metrics || "[]"),
                  finGrowth: JSON.parse(cached.fin_growth || "[]"),
                  grades: JSON.parse(cached.grades || "{}"),
                  ownerEarnings: JSON.parse(cached.owner_earnings || "[]"),
                  revSegments: JSON.parse(cached.rev_segments || "[]"),
                  geoSegments: JSON.parse(cached.geo_segments || "[]"),
                  peers: JSON.parse(cached.peers || "[]"),
                  earnings: JSON.parse(cached.earnings || "[]"),
                  ptSummary: JSON.parse(cached.pt_summary || "{}"),
                  cached: true, updated: cached.updated_at
                }, corsHeaders);
              } catch(parseErr) {
                console.error("Cached fundamentals parse error for", symbol, ":", parseErr.message);
                // Fall through to re-fetch from FMP
              }
            }
          }
        }

        // Fetch from FMP (19 parallel calls — 6 original + 13 new)
        const sym = symbol.toUpperCase();
        const fmpSym = toFMP(sym); // Convert to FMP symbol (e.g. ENG→ENG.MC, RAND→RAND.AS)
        const fmpFetch = (ep) => fetchWithRetry(`${FMP_BASE}/${ep}&apikey=${FMP_KEY}`, {}, { maxRetries: 2, baseDelay: 800 }).then(r=>r.json());
        const fmpFetchPath = (ep) => fetchWithRetry(`${FMP_BASE}/${ep}?apikey=${FMP_KEY}`, {}, { maxRetries: 2, baseDelay: 800 }).then(r=>r.json());
        const [incResp, balResp, cfResp, profResp, divResp, ratResp,
               ratingResp, dcfResp, estResp, ptResp, kmResp, fgResp, gradesResp, oeResp,
               revSegResp, geoSegResp, peersResp, earningsResp, ptSummResp] = await Promise.allSettled([
          // Original 6
          fmpFetch(`income-statement?symbol=${fmpSym}&period=annual&limit=10`),
          fmpFetch(`balance-sheet-statement?symbol=${fmpSym}&period=annual&limit=10`),
          fmpFetch(`cash-flow-statement?symbol=${fmpSym}&period=annual&limit=10`),
          fmpFetch(`profile?symbol=${fmpSym}`),
          fmpFetchPath(`historical-price-eod/dividend/${fmpSym}`),
          fmpFetch(`ratios?symbol=${fmpSym}&period=annual&limit=10`),
          // +13 new endpoints
          fmpFetch(`ratings-snapshot?symbol=${fmpSym}`),
          fmpFetch(`discounted-cash-flow?symbol=${fmpSym}`),
          fmpFetch(`analyst-estimates?symbol=${fmpSym}&period=annual&limit=5`),
          fmpFetch(`price-target-consensus?symbol=${fmpSym}`),
          fmpFetch(`key-metrics?symbol=${fmpSym}&period=annual&limit=10`),
          fmpFetch(`financial-growth?symbol=${fmpSym}&period=annual&limit=10`),
          fmpFetch(`grades-consensus?symbol=${fmpSym}`),
          fmpFetch(`owner-earnings?symbol=${fmpSym}&period=annual&limit=5`),
          fmpFetch(`revenue-product-segmentation?symbol=${fmpSym}&period=annual`),
          fmpFetch(`revenue-geographic-segmentation?symbol=${fmpSym}&period=annual`),
          fmpFetch(`stock-peers?symbol=${fmpSym}`),
          fmpFetch(`earnings?symbol=${fmpSym}`),
          fmpFetch(`price-target-summary?symbol=${fmpSym}`),
        ]);

        const safe = (resp, isArray=true) => {
          if (resp.status !== "fulfilled") return isArray ? [] : {};
          const v = resp.value;
          if (isArray) return Array.isArray(v) ? v : [];
          return Array.isArray(v) ? (v[0] || {}) : (v || {});
        };

        const income = safe(incResp);
        const balance = safe(balResp);
        const cashflow = safe(cfResp);
        const profile = safe(profResp, false);
        const dividends = safe(divResp);
        const ratios = safe(ratResp);
        const rating = safe(ratingResp, false);
        const dcf = safe(dcfResp, false);
        const estimates = safe(estResp);
        const priceTarget = safe(ptResp, false);
        const keyMetrics = safe(kmResp);
        const finGrowth = safe(fgResp);
        const grades = safe(gradesResp, false);
        const ownerEarnings = safe(oeResp);
        const revSegments = safe(revSegResp);
        const geoSegments = safe(geoSegResp);
        const peers = safe(peersResp);
        const earnings = safe(earningsResp);
        const ptSummary = safe(ptSummResp, false);

        // Only store in D1 if we got actual income data (prevents caching failed FMP responses)
        if (income.length === 0) {
          return json({ symbol: sym, income, balance, cashflow, profile, dividends, ratios,
            rating, dcf, estimates, priceTarget, keyMetrics, finGrowth, grades, ownerEarnings,
            revSegments, geoSegments, peers, earnings, ptSummary,
            cached: false, partial: true, updated: new Date().toISOString() }, corsHeaders);
        }
        await env.DB.prepare(
          `INSERT INTO fundamentals (symbol, income, balance, cashflow, profile, dividends, ratios,
           rating, dcf, estimates, price_target, key_metrics, fin_growth, grades, owner_earnings,
           rev_segments, geo_segments, peers, earnings, pt_summary, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(symbol) DO UPDATE SET income=excluded.income, balance=excluded.balance, cashflow=excluded.cashflow,
           profile=excluded.profile, dividends=excluded.dividends, ratios=excluded.ratios,
           rating=excluded.rating, dcf=excluded.dcf, estimates=excluded.estimates,
           price_target=excluded.price_target, key_metrics=excluded.key_metrics, fin_growth=excluded.fin_growth,
           grades=excluded.grades, owner_earnings=excluded.owner_earnings,
           rev_segments=excluded.rev_segments, geo_segments=excluded.geo_segments, peers=excluded.peers,
           earnings=excluded.earnings, pt_summary=excluded.pt_summary,
           updated_at=excluded.updated_at`
        ).bind(sym, JSON.stringify(income), JSON.stringify(balance), JSON.stringify(cashflow),
               JSON.stringify(profile), JSON.stringify(dividends), JSON.stringify(ratios),
               JSON.stringify(rating), JSON.stringify(dcf), JSON.stringify(estimates),
               JSON.stringify(priceTarget), JSON.stringify(keyMetrics), JSON.stringify(finGrowth),
               JSON.stringify(grades), JSON.stringify(ownerEarnings),
               JSON.stringify(revSegments), JSON.stringify(geoSegments), JSON.stringify(peers),
               JSON.stringify(earnings), JSON.stringify(ptSummary)).run();

        return json({ symbol: sym, income, balance, cashflow, profile, dividends, ratios,
          rating, dcf, estimates, priceTarget, keyMetrics, finGrowth, grades, ownerEarnings,
          revSegments, geoSegments, peers, earnings, ptSummary,
          cached: false, updated: new Date().toISOString() }, corsHeaders);
      }

      // DELETE /api/fundamentals?symbol=ENG — clear cached fundamentals for a symbol
      if (path === "/api/fundamentals" && request.method === "DELETE") {
        const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
        if (!symbol) return json({ error: "Missing ?symbol=" }, corsHeaders, 400);
        await env.DB.prepare("DELETE FROM fundamentals WHERE symbol = ?").bind(symbol).run();
        return json({ deleted: symbol }, corsHeaders);
      }

      // GET /api/peer-ratios?symbols=MSFT,GOOG — lightweight batch fetch of PE & EV/EBITDA for peers
      if (path === "/api/peer-ratios" && request.method === "GET") {
        const symbolsParam = url.searchParams.get("symbols");
        if (!symbolsParam) return json({ error: "Missing ?symbols=" }, corsHeaders);
        const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 8);

        const results = await Promise.allSettled(
          symbols.map(async sym => {
            const fmpSym = toFMP(sym);
            const [kmResp, profResp] = await Promise.allSettled([
              fetch(`${FMP_BASE}/key-metrics?symbol=${fmpSym}&period=annual&limit=1&apikey=${FMP_KEY}`).then(r => r.json()),
              fetch(`${FMP_BASE}/profile?symbol=${fmpSym}&apikey=${FMP_KEY}`).then(r => r.json()),
            ]);
            const km = kmResp.status === "fulfilled" ? (Array.isArray(kmResp.value) ? kmResp.value[0] : kmResp.value) : {};
            const prof = profResp.status === "fulfilled" ? (Array.isArray(profResp.value) ? profResp.value[0] : profResp.value) : {};
            return {
              symbol: sym,
              name: prof?.companyName || sym,
              pe: km?.peRatio || prof?.pe || 0,
              evEbitda: km?.evToEBITDA || km?.enterpriseValueOverEBITDA || 0,
            };
          })
        );
        return json(results.filter(r => r.status === "fulfilled").map(r => r.value), corsHeaders);
      }

      // Auto-update holdings sector/industry when fundamentals are loaded
      // POST /api/holdings/enrich — batch update sector/industry/market_cap from FMP profiles
      if (path === "/api/holdings/enrich" && request.method === "POST") {
        const { results: holdings } = await env.DB.prepare("SELECT ticker FROM holdings WHERE activo=1 LIMIT 500").all();
        let updated = 0;
        for (const h of holdings) {
          try {
            // Check if we have cached fundamentals with profile
            const cached = await env.DB.prepare("SELECT profile FROM fundamentals WHERE symbol=?").bind(h.ticker).first();
            if (cached?.profile) {
              const p = JSON.parse(cached.profile);
              if (p.sector || p.industry) {
                await env.DB.prepare("UPDATE holdings SET sector=?, industry=?, market_cap=?, country=? WHERE ticker=?")
                  .bind(p.sector||"", p.industry||"", p.mktCap ? Math.round(p.mktCap/1e9*100)/100 : null, p.country||"", h.ticker).run();
                updated++;
              }
            }
          } catch(e) { console.error("holdings enrich skip:", e.message); }
        }
        return json({ success: true, updated, total: holdings.length }, corsHeaders);
      }

      // POST /api/fundamentals/bulk — fetch fundamentals for multiple symbols
      // v6: Also fetches rating + dcf for each symbol
      if (path === "/api/fundamentals/bulk" && request.method === "POST") {
        const body = await parseBody(request);
        const symbols = body.symbols || [];
        if (symbols.length === 0) return json({ error: "Pass {symbols: ['AAPL','O',...]}" }, corsHeaders);

        const results = {};
        const errors = [];
        
        // Process 3 at a time to respect rate limits
        for (let i = 0; i < symbols.length; i += 3) {
          const batch = symbols.slice(i, i + 3);
          const batchResults = await Promise.allSettled(
            batch.map(async (sym) => {
              // Check cache first (24h)
              const cached = await env.DB.prepare("SELECT * FROM fundamentals WHERE symbol = ?").bind(sym).first();
              if (cached && cached.updated_at) {
                const age = Date.now() - new Date(cached.updated_at).getTime();
                if (age < 24 * 3600 * 1000) {
                  try {
                    return { symbol: sym, cached: true,
                      income: JSON.parse(cached.income || "[]"), balance: JSON.parse(cached.balance || "[]"),
                      cashflow: JSON.parse(cached.cashflow || "[]"), profile: JSON.parse(cached.profile || "{}"),
                      ratios: JSON.parse(cached.ratios || "[]"),
                      rating: JSON.parse(cached.rating || "{}"), dcf: JSON.parse(cached.dcf || "{}"),
                      estimates: JSON.parse(cached.estimates || "[]"), priceTarget: JSON.parse(cached.price_target || "{}"),
                      keyMetrics: JSON.parse(cached.key_metrics || "[]"), finGrowth: JSON.parse(cached.fin_growth || "[]"),
                    };
                  } catch(parseErr) { console.error("Batch fundamentals parse error for", sym, ":", parseErr.message); }
                }
              }

              // Fetch fresh — 10 calls per symbol (skip dividends in bulk to save API calls)
              try {
                const fmpSym = toFMP(sym);
                const [inc, bal, cf, prof, rat, rtg, dcfR, km, fg] = await Promise.all([
                  fetch(`${FMP_BASE}/income-statement?symbol=${fmpSym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/balance-sheet-statement?symbol=${fmpSym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/cash-flow-statement?symbol=${fmpSym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/profile?symbol=${fmpSym}&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/ratios?symbol=${fmpSym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/ratings-snapshot?symbol=${fmpSym}&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/discounted-cash-flow?symbol=${fmpSym}&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return{};}),
                  fetch(`${FMP_BASE}/key-metrics?symbol=${fmpSym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/financial-growth?symbol=${fmpSym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                ]);
                const safe = (v, isArr=true) => isArr ? (Array.isArray(v)?v:[]) : (Array.isArray(v)?(v[0]||{}):(v||{}));
                const income = safe(inc); const balance = safe(bal); const cashflow = safe(cf);
                const profile = safe(prof, false); const ratios = safe(rat);
                const rating = safe(rtg, false); const dcfVal = safe(dcfR, false);
                const keyMetrics = safe(km); const finGrowth = safe(fg);

                await env.DB.prepare(
                  `INSERT INTO fundamentals (symbol, income, balance, cashflow, profile, dividends, ratios,
                   rating, dcf, key_metrics, fin_growth, updated_at)
                   VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(symbol) DO UPDATE SET income=excluded.income, balance=excluded.balance, cashflow=excluded.cashflow,
                   profile=excluded.profile, ratios=excluded.ratios, rating=excluded.rating, dcf=excluded.dcf,
                   key_metrics=excluded.key_metrics, fin_growth=excluded.fin_growth, updated_at=excluded.updated_at`
                ).bind(sym, JSON.stringify(income), JSON.stringify(balance), JSON.stringify(cashflow),
                  JSON.stringify(profile), JSON.stringify(ratios), JSON.stringify(rating), JSON.stringify(dcfVal),
                  JSON.stringify(keyMetrics), JSON.stringify(finGrowth)).run();

                return { symbol: sym, cached: false, income, balance, cashflow, profile, ratios,
                  rating, dcf: dcfVal, keyMetrics, finGrowth };
              } catch(e) {
                errors.push({ symbol: sym, error: e.message });
                return null;
              }
            })
          );
          batchResults.forEach(r => { if (r.status === "fulfilled" && r.value) results[r.value.symbol] = r.value; });
          // Small delay between batches
          if (i + 3 < symbols.length) await new Promise(r => setTimeout(r, 500));
        }

        return json({ results, errors, count: Object.keys(results).length }, corsHeaders);
      }

      // GET /api/report?symbol=X — full company analysis report
      if (path === "/api/report" && request.method === "GET") {
        const sym = url.searchParams.get("symbol");
        if (!sym) return json({error:"Missing ?symbol="}, corsHeaders);
        const row = await env.DB.prepare("SELECT * FROM fundamentals WHERE symbol = ?").bind(sym).first();
        if (!row) return json({error:"No data for "+sym+". Fetch fundamentals first."}, corsHeaders);
        try {
          const income = JSON.parse(row.income||"[]");
          const balance = JSON.parse(row.balance||"[]");
          const cashflow = JSON.parse(row.cashflow||"[]");
          const profile = JSON.parse(row.profile||"{}");
          const ratios = JSON.parse(row.ratios||"[]");
          const keyMetrics = JSON.parse(row.key_metrics||"[]");
          const finGrowth = JSON.parse(row.fin_growth||"[]");
          const estimates = JSON.parse(row.estimates||"[]");
          const dcfData = JSON.parse(row.dcf||"{}");
          const ratingData = JSON.parse(row.rating||"[]");
          const priceTarget = JSON.parse(row.price_target||"{}");

          const safe = v => v == null || isNaN(v) ? null : v;
          const pct = v => v == null ? null : Math.round(v * 10000) / 100;
          const M = v => v == null ? null : Math.round(v / 1e6);

          // Build yearly data (up to 10 years)
          const years = [];
          for (let i = 0; i < Math.min(income.length, 10); i++) {
            const inc = income[i]||{};
            const bal = balance[i]||{};
            const cf = cashflow[i]||{};
            const rat = ratios[i]||{};
            const km = keyMetrics[i]||{};
            const fg = finGrowth[i]||{};
            const yr = (inc.date||inc.fiscalDateEnding||"").slice(0,4);
            const rev = inc.revenue||0;
            const ni = inc.netIncome||0;
            const ebitda = inc.ebitda||0;
            const ebit = inc.operatingIncome||0;
            const gp = inc.grossProfit||0;
            const ocf = cf.operatingCashFlow||cf.netCashProvidedByOperatingActivities||0;
            const capex = Math.abs(cf.capitalExpenditure||0);
            const fcf = cf.freeCashFlow || (ocf - capex);
            const divPaid = Math.abs(cf.commonDividendsPaid||cf.netDividendsPaid||cf.dividendsPaid||0);
            const buybacks = Math.abs(cf.commonStockRepurchased||0);
            const sbc = cf.stockBasedCompensation||0;
            const da = cf.depreciationAndAmortization||inc.depreciationAndAmortization||0;
            const totalDebt = bal.totalDebt||0;
            const cash = bal.cashAndCashEquivalents||0;
            const netDebt = totalDebt - cash;
            const totalAssets = bal.totalAssets||0;
            const totalEquity = bal.totalStockholdersEquity||bal.totalEquity||0;
            const goodwill = bal.goodwill||0;
            const intangibles = bal.intangibleAssets||bal.otherIntangibleAssets||0;
            const currentAssets = bal.totalCurrentAssets||0;
            const currentLiab = bal.totalCurrentLiabilities||0;
            const ltDebt = bal.longTermDebt||0;
            const totalLiab = bal.totalLiabilities||0;
            const inventory = bal.inventory||0;
            const otherAssets = bal.otherAssets||0;
            const shares = inc.weightedAverageShsOut||km.sharesOutstanding||0;
            const eps = inc.eps||inc.epsDiluted||0;
            const dps = rat.dividendPerShare||0;
            const pe = rat.priceToEarningsRatio||0;
            const evEbitda = km.evToEBITDA||km.enterpriseValueOverEBITDA||0;
            const roe = safe(ni && totalEquity ? ni/totalEquity : null);
            const roa = safe(ni && totalAssets ? ni/totalAssets : null);
            const roce = rat.returnOnCapitalEmployed||null;
            const price = (km.marketCap && shares) ? Math.round(km.marketCap/shares*100)/100 : (km.stockPrice||profile.price||0);

            years.push({
              year: yr, revenue: M(rev), netIncome: M(ni), ebitda: M(ebitda), ebit: M(ebit), grossProfit: M(gp),
              marginOp: rev?pct(ebit/rev):null, marginNet: rev?pct(ni/rev):null, marginGross: rev?pct(gp/rev):null,
              roe: pct(roe), roa: pct(roa), roce: pct(roce),
              ocf: M(ocf), capex: M(capex), fcf: M(fcf), divPaid: M(divPaid), buybacks: M(buybacks), sbc: M(sbc), da: M(da),
              totalDebt: M(totalDebt), cash: M(cash), netDebt: M(netDebt),
              totalAssets: M(totalAssets), totalEquity: M(totalEquity), totalLiab: M(totalLiab),
              goodwill: M(goodwill), intangibles: M(intangibles),
              currentAssets: M(currentAssets), currentLiab: M(currentLiab), ltDebt: M(ltDebt),
              inventory: M(inventory),
              autonomy: totalAssets?pct(totalEquity/totalAssets):null,
              currentRatio: currentLiab?Math.round(currentAssets/currentLiab*100)/100:null,
              cashRatio: currentLiab?Math.round(cash/currentLiab*100)/100:null,
              debtRatio: totalAssets?pct(totalDebt/totalAssets):null,
              debtQuality: totalDebt?pct(ltDebt/totalDebt):null,
              debtEbitda: ebitda>0?Math.round(netDebt/ebitda*100)/100:null,
              shares: shares?Math.round(shares/1e6):null, eps, dps,
              payout: eps>0?Math.round(dps/eps*100):null,
              rpd: rat.dividendYield?pct(rat.dividendYield):null,
              pe: Math.round(pe*10)/10, evEbitda: Math.round(evEbitda*10)/10,
              price: Math.round(price*100)/100,
              priceMax: km.yearHigh||null, priceMin: km.yearLow||null,
            });
          }
          years.reverse(); // oldest first

          // Scoring (simplified DividendST-style)
          const lat = years.length > 0 ? years[years.length-1] : {};
          const scoring = {
            solidez: {
              intangibles: lat.totalAssets && lat.intangibles!=null ? (lat.intangibles/lat.totalAssets*100 < 20 ? 5 : lat.intangibles/lat.totalAssets*100 < 40 ? 3 : 1) : null,
              deudaNeta: lat.debtEbitda!=null ? (lat.debtEbitda < 1 ? 5 : lat.debtEbitda < 3 ? 3 : lat.debtEbitda < 5 ? 1 : 0) : null,
              liquidez: lat.currentRatio!=null ? (lat.currentRatio > 2 ? 5 : lat.currentRatio > 1.5 ? 4 : lat.currentRatio > 1 ? 3 : 1) : null,
              reservas: lat.totalEquity > 0 ? 3 : 1,
              autonomia: lat.autonomy!=null ? (lat.autonomy > 50 ? 5 : lat.autonomy > 30 ? 3 : 1) : null,
            },
            rentabilidad: {
              ventas: years.length >= 5 && years[years.length-1].revenue > years[0].revenue ? 4 : 2,
              margenNeto: lat.marginNet!=null ? (lat.marginNet > 15 ? 5 : lat.marginNet > 8 ? 3 : 1) : null,
              ratios: lat.roe!=null ? (lat.roe > 15 ? 5 : lat.roe > 10 ? 3 : 1) : null,
            },
            dividendo: {
              dividendo: lat.rpd!=null ? (lat.rpd > 3 ? 4 : lat.rpd > 1 ? 2 : 1) : null,
              crecimiento: years.length >= 5 ? (() => { let g=0; for(let i=1;i<years.length;i++) if(years[i].dps>=years[i-1].dps*0.95) g++; return g>=years.length-2?5:g>=years.length/2?3:1; })() : null,
              payout: lat.payout!=null ? (lat.payout < 50 ? 5 : lat.payout < 75 ? 3 : 1) : null,
              recompras: years.length >= 3 ? (years[years.length-1].shares < years[0].shares ? 5 : 2) : null,
              cashFlow: lat.fcf > 0 ? (lat.fcf > lat.divPaid ? 4 : 2) : 0,
            },
          };
          const avgScore = (obj) => { const vals = Object.values(obj).filter(v=>v!=null); return vals.length?Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*100)/100:0; };
          const finalScore = Math.round((avgScore(scoring.solidez) + avgScore(scoring.rentabilidad) + avgScore(scoring.dividendo)) / 3 * 100) / 100;

          // Valuation
          const pes = years.filter(y=>y.pe>0).map(y=>y.pe);
          const evs = years.filter(y=>y.evEbitda>0).map(y=>y.evEbitda);
          const perMed = pes.length ? Math.round(pes.reduce((s,v)=>s+v,0)/pes.length*10)/10 : null;
          const perMin = pes.length ? Math.round(Math.min(...pes)*10)/10 : null;
          const evMed = evs.length ? Math.round(evs.reduce((s,v)=>s+v,0)/evs.length*10)/10 : null;
          const evMin = evs.length ? Math.round(Math.min(...evs)*10)/10 : null;
          const dcfVal = Array.isArray(dcfData) ? (dcfData[0]||{}) : dcfData;
          const rt = Array.isArray(ratingData) ? (ratingData[0]||{}) : ratingData;
          const pt = Array.isArray(priceTarget) ? (priceTarget[0]||{}) : priceTarget;
          const fairByPerMed = lat.eps && perMed ? Math.round(lat.eps * perMed * 10)/10 : null;
          const fairByPerMin = lat.eps && perMin ? Math.round(lat.eps * perMin * 10)/10 : null;
          const fairByEvMed = lat.ebitda && lat.shares && evMed ? Math.round((lat.ebitda * evMed + (lat.cash||0) - (lat.totalDebt||0)) / lat.shares * 10)/10 : null;

          // Growth estimates
          const estEps = estimates.length > 0 ? estimates.map(e => ({year: e.date?.slice(0,4), epsEst: e.epsAvg||e.estimatedEpsAvg||0, revEst: Math.round((e.revenueAvg||e.estimatedRevenueAvg||0)/1e6)})).slice(0,3) : [];

          return json({
            symbol: sym, name: profile.companyName||sym, sector: profile.sector, industry: profile.industry,
            currency: profile.currency||"USD", price: profile.price||0, marketCap: profile.mktCap||profile.marketCap||(keyMetrics[0]?.marketCap)||0,
            fiscalYearEnd: profile.lastDiv ? undefined : "12/31",
            years,
            scoring, finalScore,
            valuation: { perMed, perMin, evMed, evMin, fairByPerMed, fairByPerMin, fairByEvMed,
              dcf: dcfVal.dcf, dcfPrice: dcfVal.stockPrice,
              targetHigh: pt.targetHigh, targetLow: pt.targetLow, targetMed: pt.targetMedian, targetConsensus: pt.targetConsensus },
            rating: { rating: rt.rating, score: rt.overallScore },
            estimates: estEps,
            updated: row.updated_at,
          }, corsHeaders);
        } catch(e) { return json({error: e.message}, corsHeaders); }
      }

      // GET /api/screener — run dividend safety scoring on all cached fundamentals
      if (path === "/api/screener" && request.method === "GET") {
        const { results: allFundamentals } = await env.DB.prepare("SELECT * FROM fundamentals LIMIT 500").all();
        const scored = [];

        for (const row of allFundamentals) {
          try {
            const income = JSON.parse(row.income || "[]");
            const balance = JSON.parse(row.balance || "[]");
            const cashflow = JSON.parse(row.cashflow || "[]");
            const profile = JSON.parse(row.profile || "{}");
            const ratios = JSON.parse(row.ratios || "[]");

            if (income.length === 0) continue;

            // Latest year data
            const latest = income[0] || {};
            const latestBal = balance[0] || {};
            const latestCF = cashflow[0] || {};
            const latestRat = ratios[0] || {};

            // 5-year data for trends
            const years = income.slice(0, 5);
            const cfYears = cashflow.slice(0, 5);

            // ── Dividend Safety Scoring (0-100) ──

            // 1. Payout Ratio FCF (25%)
            const fcf = latestCF.freeCashFlow || ((latestCF.operatingCashFlow || 0) - Math.abs(latestCF.capitalExpenditure || 0));
            const totalDivPaid = Math.abs(latestCF.commonDividendsPaid || latestCF.netDividendsPaid || latestCF.dividendsPaid || 0);
            const payoutFCF = fcf > 0 ? (totalDivPaid / fcf * 100) : (totalDivPaid === 0 ? 0 : 999);
            const payoutScore = payoutFCF < 40 ? 25 : payoutFCF < 60 ? 20 : payoutFCF < 75 ? 12 : 5;

            // 2. Consecutive years without cut (20%) — from dividend history or income EPS trend
            const dpsHistory = years.map(y => y.eps || 0).filter(e => e > 0);
            let consecYears = 0;
            for (let i = 0; i < dpsHistory.length - 1; i++) {
              if (dpsHistory[i] >= dpsHistory[i + 1] * 0.9) consecYears++; else break;
            }
            const consecScore = consecYears >= 4 ? 20 : consecYears >= 2 ? 15 : consecYears >= 1 ? 10 : 3;

            // 3. Dividend growth CAGR 5y (15%)
            const epsFirst = years.length >= 2 ? years[years.length - 1]?.eps : null;
            const epsLast = years[0]?.eps;
            const epsCAGR = (epsFirst > 0 && epsLast > 0 && years.length > 1) 
              ? (Math.pow(epsLast / epsFirst, 1 / (years.length - 1)) - 1) * 100 : 0;
            const growthScore = epsCAGR > 8 ? 15 : epsCAGR > 5 ? 12 : epsCAGR > 2 ? 8 : 3;

            // 4. Net debt / EBITDA (15%)
            const netDebt = (latestBal.totalDebt || 0) - (latestBal.cashAndCashEquivalents || 0);
            const ebitda = latest.ebitda || 1;
            const debtRatio = ebitda > 0 ? netDebt / ebitda : 99;
            const debtScore = debtRatio < 1.5 ? 15 : debtRatio < 3 ? 10 : debtRatio < 4.5 ? 5 : 2;

            // 5. FCF trend 5y (15%)
            const fcfTrend = cfYears.map(y => y.freeCashFlow || ((y.operatingCashFlow || 0) - Math.abs(y.capitalExpenditure || 0)));
            let fcfGrowing = 0, fcfStable = 0;
            for (let i = 0; i < fcfTrend.length - 1; i++) {
              if (fcfTrend[i] > fcfTrend[i + 1] * 1.02) fcfGrowing++;
              else if (fcfTrend[i] > fcfTrend[i + 1] * 0.9) fcfStable++;
            }
            const trendScore = fcfGrowing >= 3 ? 15 : (fcfGrowing + fcfStable) >= 3 ? 10 : fcfGrowing >= 1 ? 5 : 2;

            // 6. Moat proxy — gross margin stability + ROIC (10%)
            const gm = latest.grossProfit && latest.revenue ? (latest.grossProfit / latest.revenue * 100) : 0;
            const roic = latestRat.returnOnCapitalEmployed || (latest.netIncome && latestBal.totalEquity ? latest.netIncome / latestBal.totalEquity : 0);
            const moatScore = (gm > 50 && roic > 0.15) ? 10 : (gm > 30 && roic > 0.1) ? 6 : 2;

            const totalScore = payoutScore + consecScore + growthScore + debtScore + trendScore + moatScore;

            // Advanced fields
            const eps = latest.eps || latestRat.netIncomePerShare || 0;
            const dps = latestRat.dividendPerShare || 0;
            const opCashFlow = latestCF.operatingCashFlow || 0;
            const capex = Math.abs(latestCF.capitalExpenditure || 0);
            const shares = profile.mktCap && profile.price ? Math.round(profile.mktCap / profile.price) : 0;
            const payoutEarnings = eps > 0 ? Math.round(dps / eps * 100) : 0;
            const debtToFCF = fcf > 0 ? Math.round(netDebt / fcf * 10) / 10 : 99;
            const peRatio = latestRat.priceToEarningsRatio || 0;
            // Growth estimate from EPS CAGR, capped
            const growthEst = Math.max(0, Math.min(epsCAGR, 25));
            // Fair P/E = growth * 2 (PEG=2 for quality), min 10
            const fairPE = Math.max(10, Math.round(growthEst * 2));
            // Fair price = EPS * fair P/E
            const fairPrice = eps > 0 ? Math.round(eps * fairPE * 10) / 10 : 0;
            // Discount = (fairPrice - price) / fairPrice * 100
            const currentPrice = profile.price || 0;
            const discount = fairPrice > 0 ? Math.round((fairPrice - currentPrice) / fairPrice * 100) : 0;
            // TIR = yield + growth estimate
            const tir = Math.round(((latestRat.dividendYield || 0) * 100 + growthEst) * 10) / 10;
            // Company type classification
            const compType = profile.isEtf ? "ETF" : (profile.sector === "Real Estate" ? "REIT" : (gm > 40 && roic > 0.12 ? "Calidad MAX" : gm > 25 ? "Calidad MEDIA" : "Cíclica"));
            // Risk level
            const risk = debtRatio > 5 ? "Alto" : debtRatio > 3 ? "Medio" : payoutFCF > 80 ? "Medio" : "Bajo";

            scored.push({
              symbol: row.symbol,
              name: profile.companyName || row.symbol,
              sector: profile.sector || "—",
              industry: profile.industry || "—",
              price: currentPrice,
              marketCap: profile.mktCap||profile.marketCap||(keyMetrics[0]?.marketCap)||0,
              capSize: (() => { const mc = profile.mktCap||profile.marketCap||(keyMetrics[0]?.marketCap)||0; return mc>200e9?"Mega Cap":mc>10e9?"Large Cap":mc>2e9?"Mid Cap":mc>300e6?"Small Cap":"Micro Cap"; })(),
              divYield: (latestRat.dividendYield || 0) * 100,
              payoutFCF: Math.round(payoutFCF),
              debtEBITDA: Math.round(debtRatio * 10) / 10,
              epsCAGR: Math.round(epsCAGR * 10) / 10,
              fcf: Math.round(fcf / 1e6),
              grossMargin: Math.round(gm),
              roic: Math.round((typeof roic === "number" ? roic : 0) * 1000) / 10,
              pe: Math.round(peRatio * 10) / 10,
              score: totalScore,
              breakdown: { payoutScore, consecScore, growthScore, debtScore, trendScore, moatScore },
              revenue: Math.round((latest.revenue || 0) / 1e6),
              netIncome: Math.round((latest.netIncome || 0) / 1e6),
              // Advanced
              eps: Math.round(eps * 100) / 100,
              dps: Math.round(dps * 100) / 100,
              netDebt: Math.round(netDebt / 1e6),
              opCashFlow: Math.round(opCashFlow / 1e6),
              capex: Math.round(capex / 1e6),
              shares: shares,
              payoutEarnings,
              debtToFCF,
              fairPE,
              growthEst: Math.round(growthEst * 10) / 10,
              tir,
              fairPrice,
              discount,
              compType,
              risk,
              currency: profile.currency || "USD",
              fmpRating: (() => { try { const r = JSON.parse(row.rating || "[]"); const d = Array.isArray(r) ? (r[0] || {}) : r; return { rating: d.rating, score: d.overallScore || d.ratingScore, recommendation: d.ratingRecommendation }; } catch(e) { return null; } })(),
              fmpDCF: (() => { try { const d = JSON.parse(row.dcf || "{}"); const v = Array.isArray(d) ? (d[0] || {}) : d; return { dcf: v.dcf, price: v.stockPrice }; } catch(e) { return null; } })(),
              updated: row.updated_at,
            });
          } catch(e) { console.error("screener skip:", row.symbol, e.message); }
        }

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);
        return json({ screener: scored, count: scored.length }, corsHeaders);
      }

      // POST /api/claude — Proxy to Anthropic API (avoids CORS)
      if (path === "/api/claude" && request.method === "POST") {
        const body = await parseBody(request);
        const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY || "",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: body.model || "claude-sonnet-4-20250514",
            max_tokens: body.max_tokens || 4000,
            messages: body.messages || [],
          }),
        });
        const result = await anthropicResp.json();
        return new Response(JSON.stringify(result), {
          status: anthropicResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── CARTERA (portfolio positions from D1) ──────────────

      // GET /api/cartera — portfolio positions for Google Sheet / AI analysis
      if (path === "/api/cartera" && request.method === "GET") {
        const { results: positions } = await env.DB.prepare("SELECT * FROM cartera LIMIT 500").all();

        // Try to get cached prices
        let cachedPrices = {};
        try {
          const cached = await env.DB.prepare("SELECT data FROM price_cache WHERE id = 'latest'").first();
          if (cached?.data) cachedPrices = JSON.parse(cached.data);
        } catch(e) { console.error("price_cache parse error:", e.message); }

        // Build cartera array
        const rows = [];
        let totalUSD = 0;
        for (const p of positions) {
          const livePrice = cachedPrices[p.ticker]?.price;
          const precio = livePrice || p.last_price;
          const fxMult = p.divisa === "GBX" ? p.fx / 100 : p.fx;
          const valorUSD = precio * p.shares * fxMult;
          totalUSD += valorUSD;
          rows.push({ ticker: p.ticker, nombre: p.nombre, sector: p.sector, pais: p.pais, divisa: p.divisa, categoria: p.categoria, estrategia: p.estrategia, acciones: p.shares, precio: Math.round(precio * 100) / 100, valor_usd: Math.round(valorUSD * 100) / 100 });
        }
        rows.forEach(r => { r.peso_pct = totalUSD > 0 ? Math.round(r.valor_usd / totalUSD * 10000) / 100 : 0; });
        rows.sort((a, b) => b.valor_usd - a.valor_usd);

        return json({ posiciones: rows, total_usd: Math.round(totalUSD * 100) / 100, count: rows.length, updated: new Date().toISOString() }, corsHeaders);
      }

      // POST /api/cartera — add or update a position (upsert)
      if (path === "/api/cartera" && request.method === "POST") {
        const b = await parseBody(request);
        if (!b.ticker || !b.nombre) return json({ error: "Missing ticker or nombre" }, corsHeaders, 400);
        await env.DB.prepare(
          `INSERT INTO cartera (ticker, nombre, shares, divisa, fx, categoria, estrategia, sector, pais, last_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ticker) DO UPDATE SET nombre=excluded.nombre, shares=excluded.shares, divisa=excluded.divisa,
           fx=excluded.fx, categoria=excluded.categoria, estrategia=excluded.estrategia, sector=excluded.sector,
           pais=excluded.pais, last_price=excluded.last_price`
        ).bind(b.ticker, b.nombre, b.shares||0, b.divisa||"USD", b.fx||1, b.categoria||"COMPANY", b.estrategia||"YO", b.sector||"", b.pais||"", b.last_price||0).run();
        return json({ success: true, ticker: b.ticker }, corsHeaders);
      }

      // DELETE /api/cartera/:ticker — remove a position
      if (path.startsWith("/api/cartera/") && request.method === "DELETE") {
        const ticker = decodeURIComponent(path.split("/api/cartera/")[1]);
        await env.DB.prepare("DELETE FROM cartera WHERE ticker = ?").bind(ticker).run();
        return json({ success: true, deleted: ticker }, corsHeaders);
      }

      // POST /api/cartera/seed — bulk seed from hardcoded data (run once to populate D1)
      if (path === "/api/cartera/seed" && request.method === "POST") {
        const SEED = [
          ["ACN","Accenture Plc",60,"USD",1,"COMPANY","GORKA","Technology","USA",196.65],
          ["AMCR","Amcor PLC",10,"USD",1,"COMPANY","YO","Materials","USA",40.57],
          ["AMT","American Tower Corp",100,"USD",1,"REIT","LANDLORD","Real Estate","USA",184.41],
          ["ARE","Alexandria Real Estate Equities Inc",650,"USD",1,"REIT","LANDLORD","Real Estate","USA",48.41],
          ["AZJ","Aurizon Holdings Ltd",6000,"AUD",0.6989,"COMPANY","GORKA","Industrials","Australia",4],
          ["BIZD","VanEck BDC Income ETF",1100,"USD",1,"ETF","YO","Financials","USA",12.48],
          ["BME:AMS","Amadeus It Group SA",200,"EUR",1.14635,"COMPANY","GORKA","Technology","Spain",52.22],
          ["BME:VIS","Viscofan SA",300,"EUR",1.14635,"COMPANY","GORKA","Consumer Staples","Spain",58.5],
          ["CAG","Conagra Brands Inc",400,"USD",1,"COMPANY","YO","Consumer Staples","USA",16.41],
          ["CLPR","Clipper Realty Inc",1800,"USD",1,"REIT","LANDLORD","Real Estate","USA",3.05],
          ["CMCSA","Comcast Corp",200,"USD",1,"COMPANY","YO","Communication Services","USA",30.16],
          ["CNSWF","Constellation Software Inc.",5,"USD",1,"COMPANY","GORKA","Technology","Canada",1841.68],
          ["CPB","Campbell's Co",200,"USD",1,"COMPANY","YO","Consumer Staples","USA",21.71],
          ["CUBE","CubeSmart",200,"USD",1,"COMPANY","LANDLORD","Real Estate","USA",38.65],
          ["CZR","Caesars Entertainment Inc",500,"USD",1,"REIT","LANDLORD","Consumer Discretionary","USA",28.06],
          ["DEO","Diageo PLC",690,"USD",1,"COMPANY","GORKA","Consumer Staples","UK",77.37],
          ["DIDIY","DiDi Global Inc - ADR",700,"USD",1,"COMPANY","YO","Technology","China",3.94],
          ["EMN","Eastman Chemical Co",100,"USD",1,"COMPANY","YO","Materials","USA",69.25],
          ["ENG","Enagas SA",500,"EUR",1.14635,"COMPANY","GORKA","Utilities","Spain",15.04],
          ["FDJU","FDJ United",700,"EUR",1.14635,"COMPANY","GORKA","Consumer Discretionary","France",25.86],
          ["FDS","Factset Research Systems Inc",60,"USD",1,"COMPANY","GORKA","Financials","USA",205.65],
          ["FLO","Flowers Foods Inc",700,"USD",1,"COMPANY","YO","Consumer Staples","USA",8.79],
          ["GEO","Geo Group Inc",1300,"USD",1,"REIT","LANDLORD","Real Estate","USA",14.55],
          ["GIS","General Mills Inc",500,"USD",1,"COMPANY","GORKA","Consumer Staples","USA",39.38],
          ["GPC","Genuine Parts Co",100,"USD",1,"COMPANY","YO","Consumer Discretionary","USA",105.74],
          ["GQG","GQG Partners Inc",2000,"AUD",0.6989,"COMPANY","GORKA","Financials","Australia",1.75],
          ["HEN3","Henkel AG & Co KGaA",150,"EUR",1.14635,"COMPANY","GORKA","Consumer Staples","Germany",70.08],
          ["HKG:9616","Neutech Group Limited",8000,"HKD",0.127706581,"COMPANY","GORKA","Technology","Hong Kong",2.54],
          ["HKG:1052","Yuexiu Transport Infrastructure Ltd",16000,"HKD",0.127706581,"COMPANY","GORKA","Industrials","Hong Kong",4.49],
          ["HKG:1910","Samsonite Group SA",900,"HKD",0.127706581,"COMPANY","GORKA","Consumer Discretionary","Hong Kong",16.1],
          ["HKG:2219","Chaoju Eye Care Holdings Ltd",20000,"HKD",0.127706581,"COMPANY","GORKA","Healthcare","Hong Kong",2.56],
          ["HKG:9618","JD.com Inc",1300,"HKD",0.127706581,"COMPANY","GORKA","Consumer Discretionary","China",109.6],
          ["HR","Healthcare Realty Trust Inc",100,"USD",1,"REIT","LANDLORD","Real Estate","USA",17.98],
          ["HRB","H & R Block Inc",600,"USD",1,"COMPANY","YO","Consumer Discretionary","USA",30.51],
          ["IIPR","Innovative Industrial Properties Inc",200,"USD",1,"REIT","LANDLORD","Real Estate","USA",52.66],
          ["IIPR-PRA","IIPR 9% Series A Preferred",400,"USD",1,"REIT","LANDLORD","Real Estate","USA",24.50],
          ["KHC","Kraft Heinz Co",1200,"USD",1,"COMPANY","GORKA","Consumer Staples","USA",22.58],
          ["KRG","Kite Realty Group Trust",500,"USD",1,"REIT","LANDLORD","Real Estate","USA",25.14],
          ["LANDP","Gladstone Land 6% Preferred Series C",500,"USD",1,"REIT","LANDLORD","Real Estate","USA",19.96],
          ["LSEG","London Stock Exchange Group Plc",100,"GBX",1.32369997,"COMPANY","GORKA","Financials","UK",8594],
          ["LW","Lamb Weston Holdings Inc",250,"USD",1,"COMPANY","GORKA","Consumer Staples","USA",40.55],
          ["LYB","LyondellBasell Industries NV",400,"USD",1,"COMPANY","GORKA","Materials","Netherlands",72.3],
          ["MDV","Modiv Industrial Inc Class C",400,"USD",1,"REIT","LANDLORD","Real Estate","USA",14.54],
          ["MO","Altria Group Inc",100,"USD",1,"COMPANY","YO","Consumer Staples","USA",67.89],
          ["MSDL","Morgan Stanley Direct Lending Fund",1000,"USD",1,"CEF","CEF","Financials","USA",14.61],
          ["MTN","Vail Resorts Inc",100,"USD",1,"REIT","LANDLORD","Consumer Discretionary","USA",131.74],
          ["NET.UN","Canadian Net REIT",2000,"CAD",0.694,"REIT","LANDLORD","Real Estate","Canada",6.17],
          ["NNN","NNN REIT Inc",600,"USD",1,"REIT","LANDLORD","Real Estate","USA",45.01],
          ["NOMD","Nomad Foods Ltd",1300,"USD",1,"COMPANY","GORKA","Consumer Staples","UK",9.84],
          ["NVO","Novo Nordisk A/S",400,"USD",1,"COMPANY","YO","Healthcare","Denmark",37.96],
          ["O","Realty Income Corp",500,"USD",1,"REIT","LANDLORD","Real Estate","USA",64.44],
          ["OBDC","Blue Owl Capital Corp",400,"USD",1,"CEF","CEF","Financials","USA",10.95],
          ["OMC","Omnicom Group Inc",68.8,"USD",1,"COMPANY","GORKA","Communication Services","USA",77.8],
          ["OWL","Blue Owl Capital Inc",1000,"USD",1,"REIT","LANDLORD","Financials","USA",8.75],
          ["PATH","UiPath Inc",700,"USD",1,"COMPANY","YO","Technology","USA",11.58],
          ["PAYX","Paychex Inc",207,"USD",1,"COMPANY","GORKA","Industrials","USA",92.61],
          ["PEP","PepsiCo Inc",150,"USD",1,"COMPANY","YO","Consumer Staples","USA",159.88],
          ["PFE","Pfizer Inc",400,"USD",1,"COMPANY","YO","Healthcare","USA",26.58],
          ["PG","Procter & Gamble Co",150,"USD",1,"COMPANY","YO","Consumer Staples","USA",150.65],
          ["PYPL","PayPal Holdings Inc",700,"USD",1,"COMPANY","YO","Technology","USA",44.9],
          ["RAND","Rand Capital Corp",400,"USD",1,"CEF","YO","Financials","USA",11.36],
          ["REXR","Rexford Industrial Realty Inc",400,"USD",1,"COMPANY","LANDLORD","Real Estate","USA",34.47],
          ["RHI","Robert Half Inc",700,"USD",1,"COMPANY","YO","Industrials","USA",22.37],
          ["RICK","RCI Hospitality Holdings Inc",1550,"USD",1,"REIT","LANDLORD","Consumer Discretionary","USA",21.42],
          ["RYN","Rayonier Inc",400,"USD",1,"REIT","LANDLORD","Real Estate","USA",20.18],
          ["SAFE","Safehold Inc",600,"USD",1,"REIT","LANDLORD","Real Estate","USA",14.52],
          ["SCHD","Schwab US Dividend Equity ETF",6000,"USD",1,"ETF","YO","Financials","USA",30.8],
          ["SHUR","Shurgard Self Storage Ltd",400,"EUR",1.14635,"REIT","LANDLORD","Real Estate","Netherlands",27.25],
          ["SPHD","Invesco S&P 500 High Div Low Volatility ETF",200,"USD",1,"ETF","YO","Financials","USA",49.93],
          ["SUI","Sun Communities Inc",100,"USD",1,"COMPANY","LANDLORD","Real Estate","USA",134.44],
          ["TAP","Molson Coors Beverage Co Class B",600,"USD",1,"COMPANY","GORKA","Consumer Staples","USA",43.61],
          ["TROW","T Rowe Price Group Inc",240,"USD",1,"COMPANY","GORKA","Financials","USA",88.59],
          ["UNH","UnitedHealth Group Inc",100,"USD",1,"COMPANY","YO","Healthcare","USA",282.09],
          ["VICI","VICI Properties Inc",1200,"USD",1,"REIT","YO","Real Estate","USA",28.42],
          ["WEEL","Peerless Option Income Wheel ETF",1000,"USD",1,"ETF","YO","Financials","USA",20.12],
          ["WEN","Wendy's Co",700,"USD",1,"COMPANY","YO","Consumer Discretionary","USA",7.17],
          ["WKL","Wolters Kluwer NV",200,"EUR",1.14635,"COMPANY","GORKA","Industrials","Netherlands",67.26],
          ["WPC","W.p. Carey Inc",200,"USD",1,"REIT","LANDLORD","Real Estate","USA",71.49],
          ["XYZ","Block Inc",50,"USD",1,"COMPANY","YO","Technology","USA",59.79],
          ["YYY","Amplify CEF High Income ETF",192,"USD",1,"ETF","CEF","Financials","USA",11.15],
          ["ZTS","Zoetis Inc",100,"USD",1,"COMPANY","GORKA","Healthcare","USA",115.62],
        ];
        let inserted = 0;
        for (const [ticker,nombre,shares,divisa,fx,categoria,estrategia,sector,pais,lp] of SEED) {
          try {
            await env.DB.prepare(
              `INSERT INTO cartera (ticker,nombre,shares,divisa,fx,categoria,estrategia,sector,pais,last_price)
               VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(ticker) DO UPDATE SET
               nombre=excluded.nombre,shares=excluded.shares,divisa=excluded.divisa,fx=excluded.fx,
               categoria=excluded.categoria,estrategia=excluded.estrategia,sector=excluded.sector,
               pais=excluded.pais,last_price=excluded.last_price`
            ).bind(ticker,nombre,shares,divisa,fx,categoria,estrategia,sector,pais,lp).run();
            inserted++;
          } catch(e) { console.error("Seed error:", ticker, e.message); }
        }
        return json({ success: true, inserted, total: SEED.length }, corsHeaders);
      }

      // ─── PRESUPUESTO (Budget) ────────────────────────

      // GET /api/presupuesto/cat-order — get category order
      if (path === "/api/presupuesto/cat-order" && request.method === "GET") {
        const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'presu_cat_order'").first();
        if (row?.value) return json({ order: JSON.parse(row.value) }, corsHeaders);
        return json({ order: null }, corsHeaders);
      }

      // PUT /api/presupuesto/cat-order — save category order
      if (path === "/api/presupuesto/cat-order" && request.method === "PUT") {
        const body = await parseBody(request);
        await env.DB.prepare(
          `INSERT INTO app_config (key, value, updated_at) VALUES ('presu_cat_order', ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`
        ).bind(JSON.stringify(body.order)).run();
        return json({ success: true }, corsHeaders);
      }

      // GET /api/presupuesto — all budget items
      if (path === "/api/presupuesto" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM presupuesto ORDER BY categoria, nombre LIMIT 500"
        ).all();
        return json(results, corsHeaders);
      }

      // POST /api/presupuesto — add new item
      if (path === "/api/presupuesto" && request.method === "POST") {
        const body = await parseBody(request);
        const reqErr = validateRequired(body.nombre, 'nombre') || validateNumber(body.importe, 'importe');
        if (reqErr) return validationError(reqErr, corsHeaders);
        const { results } = await env.DB.prepare(
          `INSERT INTO presupuesto (nombre, categoria, banco, frecuencia, importe, notas, billing_months, aliases, last_payment, custom_months)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
        ).bind(body.nombre, body.categoria || 'OTROS', body.banco || '', body.frecuencia || 'MENSUAL', body.importe, body.notas || '', body.billing_months || null, body.aliases || null, body.last_payment || null, body.custom_months || null).all();
        return json({ success: true, item: results[0] }, corsHeaders);
      }

      // POST /api/presupuesto/:id/alias — add an alias to a presupuesto item
      if (path.match(/\/api\/presupuesto\/\d+\/alias$/) && request.method === "POST") {
        const id = parseInt(path.split("/")[3], 10);
        const body = await parseBody(request);
        const alias = (body.alias || '').trim();
        if (!alias) return json({ error: "alias required" }, corsHeaders, 400);
        const item = await env.DB.prepare("SELECT aliases FROM presupuesto WHERE id = ?").bind(id).first();
        if (!item) return json({ error: "Not found" }, corsHeaders, 404);
        let existing = [];
        try { existing = JSON.parse(item.aliases || '[]'); } catch(e) {}
        if (!existing.includes(alias)) existing.push(alias);
        await env.DB.prepare(`UPDATE presupuesto SET aliases=?, updated_at=datetime('now') WHERE id=?`)
          .bind(JSON.stringify(existing), id).run();
        return json({ success: true, aliases: existing }, corsHeaders);
      }

      // POST /api/presupuesto/:id/exclude-gasto — toggle a gasto exclusion
      if (path.match(/\/api\/presupuesto\/\d+\/exclude-gasto$/) && request.method === "POST") {
        const id = parseInt(path.split("/")[3], 10);
        const body = await parseBody(request);
        const gastoId = body.gasto_id;
        if (!gastoId) return json({ error: "gasto_id required" }, corsHeaders, 400);
        const item = await env.DB.prepare("SELECT excluded_gastos FROM presupuesto WHERE id = ?").bind(id).first();
        if (!item) return json({ error: "Not found" }, corsHeaders, 404);
        let excluded = [];
        try { excluded = JSON.parse(item.excluded_gastos || '[]'); } catch(e) {}
        if (excluded.includes(gastoId)) {
          excluded = excluded.filter(x => x !== gastoId); // re-include
        } else {
          excluded.push(gastoId); // exclude
        }
        await env.DB.prepare(`UPDATE presupuesto SET excluded_gastos=?, updated_at=datetime('now') WHERE id=?`)
          .bind(excluded.length > 0 ? JSON.stringify(excluded) : null, id).run();
        return json({ success: true, excluded }, corsHeaders);
      }

      // PUT /api/presupuesto/:id/billing-months — quick update billing months only
      if (path.match(/\/api\/presupuesto\/\d+\/billing-months$/) && request.method === "PUT") {
        const id = parseInt(path.split("/")[3], 10);
        const body = await parseBody(request);
        await env.DB.prepare(`UPDATE presupuesto SET billing_months=?, updated_at=datetime('now') WHERE id=?`)
          .bind(body.billing_months || null, id).run();
        return json({ success: true }, corsHeaders);
      }

      // PUT /api/presupuesto/:id — update item (and log change if importe changed)
      if (path.startsWith("/api/presupuesto/") && !path.includes("/alerts") && !path.includes("/history") && !path.includes("/billing-months") && request.method === "PUT") {
        const id = parseInt(path.split("/").pop(), 10);
        const body = await parseBody(request);
        const old = await env.DB.prepare("SELECT * FROM presupuesto WHERE id = ?").bind(id).first();
        if (!old) return json({ error: "Not found" }, corsHeaders, 404);

        await env.DB.prepare(
          `UPDATE presupuesto SET nombre=?, categoria=?, banco=?, frecuencia=?, importe=?, notas=?, billing_months=?, aliases=?, last_payment=?, custom_months=?, updated_at=datetime('now')
           WHERE id=?`
        ).bind(body.nombre, body.categoria, body.banco || '', body.frecuencia, body.importe, body.notas || '',
          body.billing_months !== undefined ? body.billing_months : old.billing_months,
          body.aliases !== undefined ? body.aliases : old.aliases,
          body.last_payment !== undefined ? body.last_payment : old.last_payment,
          body.custom_months !== undefined ? body.custom_months : old.custom_months, id).run();

        if (old.importe !== body.importe && old.importe > 0) {
          const pct = ((body.importe - old.importe) / old.importe) * 100;
          await env.DB.prepare(
            `INSERT INTO presupuesto_history (item_id, importe_anterior, importe_nuevo, cambio_pct)
             VALUES (?, ?, ?, ?)`
          ).bind(id, old.importe, body.importe, pct).run();
        }
        return json({ success: true }, corsHeaders);
      }

      // DELETE /api/presupuesto/:id
      if (path.startsWith("/api/presupuesto/") && !path.includes("/alerts") && !path.includes("/history") && request.method === "DELETE") {
        const id = parseInt(path.split("/").pop(), 10);
        await env.DB.prepare("DELETE FROM presupuesto WHERE id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM presupuesto_history WHERE item_id = ?").bind(id).run();
        return json({ success: true }, corsHeaders);
      }

      // GET /api/presupuesto/alerts — recent price changes (last 90 days)
      if (path === "/api/presupuesto/alerts" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT h.*, p.nombre, p.categoria FROM presupuesto_history h
           JOIN presupuesto p ON p.id = h.item_id
           WHERE h.fecha >= datetime('now', '-90 days')
           ORDER BY h.fecha DESC LIMIT 50`
        ).all();
        return json(results, corsHeaders);
      }

      // GET /api/presupuesto/history/:itemId — full history for one item
      if (path.startsWith("/api/presupuesto/history/") && request.method === "GET") {
        const itemId = parseInt(path.split("/").pop(), 10);
        const { results } = await env.DB.prepare(
          `SELECT * FROM presupuesto_history WHERE item_id = ? ORDER BY fecha DESC LIMIT 100`
        ).bind(itemId).all();
        return json(results, corsHeaders);
      }

      // POST /api/presupuesto/seed — bulk insert from initial data
      if (path === "/api/presupuesto/seed" && request.method === "POST") {
        const body = await parseBody(request);
        const items = body.items || [];
        let inserted = 0;
        for (const it of items) {
          try {
            await env.DB.prepare(
              `INSERT INTO presupuesto (nombre, categoria, banco, frecuencia, importe, notas)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(it.nombre, it.categoria, it.banco || '', it.frecuencia || 'MENSUAL', it.importe, it.notas || '').run();
            inserted++;
          } catch(e) { console.error("Seed presupuesto error:", e.message); }
        }
        return json({ success: true, inserted, total: items.length }, corsHeaders);
      }

      // GET /api/dividendos/calendar.ics — iCal feed
      if (path === "/api/dividendos/calendar.ics" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT fecha, ticker, bruto, neto, divisa FROM dividendos ORDER BY fecha DESC LIMIT 8000"
        ).all();
        // Group by date+ticker for cleaner events
        const byKey = {};
        for (const r of results) {
          const k = `${r.fecha}_${r.ticker}`;
          if (!byKey[k]) byKey[k] = { fecha: r.fecha, ticker: r.ticker, bruto: 0, neto: 0, divisa: r.divisa || 'USD' };
          byKey[k].bruto += r.bruto || 0;
          byKey[k].neto += r.neto || 0;
        }
        // Compute projected future dividends from frequency patterns
        const tickerDates = {};
        for (const r of results) {
          if (!tickerDates[r.ticker]) tickerDates[r.ticker] = [];
          tickerDates[r.ticker].push({ fecha: r.fecha, bruto: r.bruto || 0, neto: r.neto || 0 });
        }
        const today = new Date().toISOString().slice(0, 10);
        const projections = [];
        for (const [ticker, entries] of Object.entries(tickerDates)) {
          const dates = entries.map(e => e.fecha).sort();
          if (dates.length < 2) continue;
          const gaps = [];
          for (let i = 1; i < dates.length; i++) {
            const d1 = new Date(dates[i - 1]), d2 = new Date(dates[i]);
            gaps.push((d2 - d1) / 864e5);
          }
          const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
          if (avgGap > 400) continue; // Skip if too infrequent
          const lastDate = dates[dates.length - 1];
          const avgBruto = entries.reduce((s, e) => s + e.bruto, 0) / entries.length;
          const avgNeto = entries.reduce((s, e) => s + e.neto, 0) / entries.length;
          // Project next 12 months
          let nextDate = new Date(lastDate);
          for (let p = 0; p < 12; p++) {
            nextDate = new Date(nextDate.getTime() + avgGap * 864e5);
            const nf = nextDate.toISOString().slice(0, 10);
            if (nf <= today) continue;
            if (nf > new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)) break;
            const k = `proj_${nf}_${ticker}`;
            byKey[k] = { fecha: nf, ticker, bruto: avgBruto, neto: avgNeto, divisa: 'USD', projected: true };
          }
        }
        // Build ICS
        const icsLines = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//A&R//Dividend Calendar//EN',
          'CALSCALE:GREGORIAN',
          'METHOD:PUBLISH',
          'X-WR-CALNAME:A&R Dividendos',
          'X-WR-TIMEZONE:Europe/Madrid',
        ];
        for (const [k, ev] of Object.entries(byKey)) {
          const d = ev.fecha.replace(/-/g, '');
          const uid = `${k}@ayr-dividends`;
          const prefix = ev.projected ? '📅 EST ' : '💰 ';
          const summary = `${prefix}${ev.ticker} $${ev.bruto.toFixed(2)}`;
          const desc = ev.projected
            ? `Dividendo estimado ${ev.ticker}\\nBruto: $${ev.bruto.toFixed(2)}\\nNeto: $${ev.neto.toFixed(2)}\\n(Proyección basada en historial)`
            : `Dividendo ${ev.ticker}\\nBruto: $${ev.bruto.toFixed(2)}\\nNeto: $${ev.neto.toFixed(2)}\\nDivisa: ${ev.divisa}`;
          icsLines.push(
            'BEGIN:VEVENT',
            `DTSTART;VALUE=DATE:${d}`,
            `DTEND;VALUE=DATE:${d}`,
            `UID:${uid}`,
            `SUMMARY:${summary}`,
            `DESCRIPTION:${desc}`,
            `CATEGORIES:${ev.projected ? 'Dividendo Estimado' : 'Dividendo'}`,
            `STATUS:${ev.projected ? 'TENTATIVE' : 'CONFIRMED'}`,
            'TRANSP:TRANSPARENT',
            'END:VEVENT'
          );
        }
        icsLines.push('END:VCALENDAR');
        return new Response(icsLines.join('\r\n'), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'attachment; filename="ayr-dividendos.ics"',
          },
        });
      }

      // ─── Web Push Notifications ───────────────────────────

      // POST /api/push-subscribe — store push subscription
      if (path === "/api/push-subscribe" && request.method === "POST") {
        const body = await parseBody(request);
        const { endpoint, keys } = body;
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
          return json({ error: "Missing endpoint or keys" }, corsHeaders, 400);
        }
        await env.DB.prepare(
          `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
           ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, last_used=datetime('now')`
        ).bind(endpoint, keys.p256dh, keys.auth).run();
        return json({ ok: true }, corsHeaders);
      }

      // POST /api/push-send — send push notification to all subscribers
      if (path === "/api/push-send" && request.method === "POST") {
        const body = await parseBody(request);
        const { title, body: notifBody, url, tag } = body;
        if (!title) return json({ error: "Missing title" }, corsHeaders, 400);
        const { results: subs } = await env.DB.prepare("SELECT * FROM push_subscriptions LIMIT 100").all();
        if (!subs.length) return json({ sent: 0, reason: "no subscribers" }, corsHeaders);
        const payload = JSON.stringify({ title, body: notifBody || "", url: url || "/", tag: tag || "ayr-alert" });
        let sent = 0, failed = 0, removed = 0;
        for (const sub of subs) {
          try {
            const res = await sendWebPush(env, sub, payload);
            if (res.ok) { sent++; }
            else if (res.status === 410 || res.status === 404) {
              await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
              removed++;
            } else { failed++; }
          } catch { failed++; }
        }
        return json({ sent, failed, removed, total: subs.length }, corsHeaders);
      }

      // GET /api/push-test — send test notification
      if (path === "/api/push-test" && request.method === "GET") {
        const { results: subs } = await env.DB.prepare("SELECT * FROM push_subscriptions LIMIT 100").all();
        if (!subs.length) return json({ error: "No hay suscripciones push registradas" }, corsHeaders, 400);
        const payload = JSON.stringify({
          title: "A&R Alertas",
          body: "Alertas funciona correctamente",
          url: "/",
          tag: "ayr-test",
        });
        let sent = 0, failed = 0, removed = 0;
        for (const sub of subs) {
          try {
            const res = await sendWebPush(env, sub, payload);
            if (res.ok) { sent++; }
            else if (res.status === 410 || res.status === 404) {
              await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
              removed++;
            } else { failed++; }
          } catch { failed++; }
        }
        return json({ ok: true, sent, failed, removed }, corsHeaders);
      }

      // DELETE /api/push-subscribe — unsubscribe
      if (path === "/api/push-subscribe" && request.method === "DELETE") {
        const body = await parseBody(request);
        if (!body.endpoint) return json({ error: "Missing endpoint" }, corsHeaders, 400);
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(body.endpoint).run();
        return json({ ok: true }, corsHeaders);
      }

      // ─── AI ANALYSIS (Claude-powered company analysis) ──────────────

      // POST /api/ai-analyze — analyze one or more tickers
      if (path === "/api/ai-analyze" && request.method === "POST") {
        const body = await parseBody(request);
        const tickers = body.tickers || (body.ticker ? [body.ticker] : []);
        if (!tickers.length) return json({ error: "Missing ticker or tickers" }, corsHeaders, 400);

        const results = [];
        for (const ticker of tickers) {
          try {
            const analysis = await analyzeTickerWithAI(env, ticker);
            results.push(analysis);
          } catch (e) {
            results.push({ ticker, error: e.message });
          }
        }
        return json({ results, analyzed: results.filter(r => !r.error).length, errors: results.filter(r => r.error).length }, corsHeaders);
      }

      // GET /api/ai-analysis — retrieve stored analysis
      if (path === "/api/ai-analysis" && request.method === "GET") {
        const ticker = url.searchParams.get("ticker");
        const action = url.searchParams.get("action");
        let sql = "SELECT * FROM ai_analysis";
        const params = [];
        const conditions = [];
        if (ticker) { conditions.push("ticker = ?"); params.push(ticker.toUpperCase()); }
        if (action) { conditions.push("action = ?"); params.push(action.toUpperCase()); }
        if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
        sql += " ORDER BY updated_at DESC LIMIT 500";
        const stmt = params.length ? env.DB.prepare(sql).bind(...params) : env.DB.prepare(sql);
        const { results } = await stmt.all();
        // Parse JSON fields
        const parsed = results.map(r => ({
          ...r,
          fundamentals: r.fundamentals ? JSON.parse(r.fundamentals) : null,
          dividend_safety: r.dividend_safety ? JSON.parse(r.dividend_safety) : null,
          valuation: r.valuation ? JSON.parse(r.valuation) : null,
          income_optimization: r.income_optimization ? JSON.parse(r.income_optimization) : null,
          verdict: r.verdict ? JSON.parse(r.verdict) : null,
        }));
        return json({ analysis: parsed, count: parsed.length }, corsHeaders);
      }

      // POST /api/ai-analyze-portfolio — analyze all active positions
      if (path === "/api/ai-analyze-portfolio" && request.method === "POST") {
        const { results: positions } = await env.DB.prepare(
          "SELECT ticker FROM positions WHERE shares > 0 ORDER BY usd_value DESC LIMIT 200"
        ).all();
        if (!positions.length) return json({ error: "No active positions found" }, corsHeaders, 400);

        const allTickers = positions.map(p => p.ticker);
        const batchSize = 3;
        const allResults = [];

        for (let i = 0; i < allTickers.length; i += batchSize) {
          const batch = allTickers.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(ticker => analyzeTickerWithAI(env, ticker).catch(e => ({ ticker, error: e.message })))
          );
          allResults.push(...batchResults);
        }

        const successful = allResults.filter(r => !r.error);
        const actions = { HOLD: 0, TRIM: 0, SELL: 0, ADD: 0 };
        for (const r of successful) {
          const act = r.action || "HOLD";
          actions[act] = (actions[act] || 0) + 1;
        }

        return json({
          analyzed: successful.length,
          errors: allResults.filter(r => r.error).length,
          total: allTickers.length,
          actions,
          results: allResults,
        }, corsHeaders);
      }

      // GET /api/ai-portfolio-summary — dashboard view of AI analysis
      if (path === "/api/ai-portfolio-summary" && request.method === "GET") {
        // Get latest analysis per ticker (most recent only)
        const { results: analyses } = await env.DB.prepare(`
          SELECT a.* FROM ai_analysis a
          INNER JOIN (
            SELECT ticker, MAX(updated_at) as max_date FROM ai_analysis GROUP BY ticker
          ) latest ON a.ticker = latest.ticker AND a.updated_at = latest.max_date
          ORDER BY a.score DESC
        `).all();

        if (!analyses.length) return json({ error: "No analysis data. Run POST /api/ai-analyze-portfolio first." }, corsHeaders, 404);

        const groups = { HOLD: [], TRIM: [], SELL: [], ADD: [] };
        let totalScore = 0;
        const incomeOpps = [];
        const alerts = [];

        for (const row of analyses) {
          const action = row.action || "HOLD";
          const parsed = {
            ticker: row.ticker,
            score: row.score,
            action,
            summary: row.summary,
            verdict: row.verdict ? JSON.parse(row.verdict) : null,
            income_optimization: row.income_optimization ? JSON.parse(row.income_optimization) : null,
            updated_at: row.updated_at,
          };

          if (!groups[action]) groups[action] = [];
          groups[action].push(parsed);
          totalScore += row.score || 0;

          // Collect income optimization opportunities
          if (parsed.income_optimization) {
            const inc = parsed.income_optimization;
            if (inc.enhancedYield && inc.currentYield && inc.enhancedYield > inc.currentYield) {
              incomeOpps.push({
                ticker: row.ticker,
                currentYield: inc.currentYield,
                enhancedYield: inc.enhancedYield,
                strategy: inc.suggestedStrategy,
                monthlyPremium: inc.ccPremiumMonthly,
              });
            }
          }

          // Positions needing attention
          if (action === "SELL" || action === "TRIM" || (row.score && row.score <= 4)) {
            alerts.push({ ticker: row.ticker, action, score: row.score, summary: row.summary });
          }
        }

        incomeOpps.sort((a, b) => (b.enhancedYield - b.currentYield) - (a.enhancedYield - a.currentYield));

        return json({
          portfolioHealthScore: analyses.length ? Math.round((totalScore / analyses.length) * 10) / 10 : 0,
          positionsAnalyzed: analyses.length,
          groups,
          topIncomeOpportunities: incomeOpps.slice(0, 10),
          alerts,
          lastUpdated: analyses[0]?.updated_at || null,
        }, corsHeaders);
      }

      // ─── DESIGN BACKLOG MVPs ───────────────────────────────────

      // ─── AGENTS PROMPTS TRANSPARENCY ────────────────────────────
      // GET /api/agents/prompts → returns the exact system prompt, input shape,
      // output shape, model and trigger metadata for every agent. Used by the
      // Agentes tab "Prompt" drawer so the user can audit/improve prompts.
      //
      // IMPORTANT: when you edit a runXxxAgent prompt in worker.js, also edit
      // the matching `system_prompt` field in AGENTS_METADATA below.
      if (path === "/api/agents/prompts" && request.method === "GET") {
        const AGENTS_METADATA = [
          {
            id: "regime", name: "Pulso del Mercado", icon: "🧭",
            type: "llm", model: "claude-haiku-4-5-20251001",
            description: "Determina si el mercado está en bull/bear/transition analizando 24 ETFs (sectores, factores, crédito, commodities).",
            system_prompt: "You are a market regime analyst. Determine the current market state.\nAnalyze:\n- Cyclicals (XLF/XLE/XLI) vs defensives (XLU/XLP/XLV): if defensives lead = risk-off\n- Credit (HYG/LQD falling = stress, TLT rising = flight-to-quality)\n- Factors (QUAL+MTUM+VLUE all losing vs SPY = indiscriminate selling)\n- VIX level and trend\nRespond ONLY JSON:\n{\"severity\":\"info|warning|critical\",\"title\":\"short title\",\"summary\":\"3-4 sentence regime assessment\",\n\"details\":{\"regime\":\"bull|bear|transition-down|transition-up\",\"regimeConfidence\":1-10,\n\"breadthSignal\":\"healthy|deteriorating|collapsed|recovering\",\n\"creditStress\":\"none|mild|elevated|severe\",\"factorSignal\":\"rational-rotation|indiscriminate-selling|risk-on|mixed\",\n\"safeHavens\":\"working|failing|mixed\",\"actionGuidance\":\"full-risk|reduce-risk|defensive|cash-priority\",\n\"sectorLeaders\":[],\"sectorLaggards\":[],\"vixRegime\":\"low|normal|elevated|crisis\"},\n\"score\":1-10}\nScore 1=crisis, 10=strong bull.",
            input_shape: { spy: "{ price, changePct, change5d }", vix: "{ price, changePct }", sectors: "[XLK,XLF,XLE,XLV,XLU,XLP,XLI,XLRE]", factors: "[QUAL,MTUM,VLUE]", credit: "{ HYG, LQD, TLT, SHY }", commodities: "{ GLD, USO, DBC }" },
            output_shape: { severity: "info|warning|critical", details: { regime: "bull|bear|transition", actionGuidance: "full-risk|reduce-risk|defensive|cash-priority" } },
            cost_per_run_estimate_usd: 0.01,
            trigger: "Manual desde botón Ejecutar agentes",
            when_it_fires: "Step 1. Su salida la consumen Macro, Risk y Trade.",
          },
          {
            id: "earnings", name: "Vigilante de Earnings", icon: "📊",
            type: "llm", model: "claude-opus-4-20250514",
            description: "Combina earnings (EPS/revenue surprise) con transcripts de earnings calls. Distingue caídas temporales (one-time charges, restructuring) de declive estructural.",
            system_prompt: "You are a senior earnings analyst for a LONG-TERM dividend income portfolio ($1.35M, buy-and-hold). NEVER recommend selling quality on temporary dips.\n\nYOU NOW HAVE EARNINGS CALL TRANSCRIPTS. Use them as the PRIMARY source for tone and context. Combine numerical surprise with management explanation.\n\nYOU NOW HAVE 6-QUARTER TREND DATA. ALWAYS check the trend before flagging a quarter as critical:\n- A -8% EPS miss in isolation looks bad. If the prior 5 quarters were +12%, +8%, +5%, +9%, +6%, this is a single-quarter blip → WARNING at most.\n- A -3% miss following -2%, -5%, -7% misses is a real deteriorating trend → WARNING or CRITICAL.\n\nDISTINGUISH TEMPORARY VS STRUCTURAL:\n- Temporary: one-time charges, FX headwinds, restructuring with clear plan → info\n- Structural: secular demand decline, repeated guidance cuts, management evasiveness → warning/critical\n\nSEVERITY (conservative — long-term portfolio):\n- critical = revenue falling 3+ quarters AND margins compressing AND no credible turnaround. Max 2 criticals.\n- warning = operational miss that could affect dividends OR negative forward demand\n- info = normal quarter, beat, minor miss, explained one-time\n\nRespond ONLY JSON array.",
            input_shape: { positions: "[{ ticker, name, sector, earnings (last 2), estimates, revSegments, geoSegments, analystGrades (3), trends: { revenue, netIncome, fcf, eps } (6q), transcript: { period, date, excerpt } }]" },
            output_shape: { result: "Array of insights with { ticker, severity, title, summary, details: { epsSurprise, revenueSurprise, marginTrend, context, transcript_insight, keyRisks }, score 1-10 }" },
            cost_per_run_estimate_usd: 0.40,
            trigger: "Manual o pipeline completo",
            when_it_fires: "Step 2. Procesa ~85 posiciones en batches de 12.",
          },
          {
            id: "dividend", name: "Guardian de Dividendos", icon: "🛡️",
            type: "llm", model: "claude-opus-4-20250514",
            description: "Evalúa la seguridad del dividendo de cada posición usando TTM authoritative (Q+S inputs_json), trends de 8 quarters y pagos reales IB. Reconoce que cortar para pagar deuda = bullish.",
            system_prompt: "You are a senior dividend analyst for a LONG-TERM income portfolio ($1.35M).\n\nCRITICAL CONTEXT — DO NOT give false alarms:\n- Dividend CUT to pay down debt is often BULLISH. Mark warning, not critical.\n- High payout ratio in a REIT is NORMAL. Use FFO/AFFO instead.\n- BDCs evaluate NAV coverage, not earnings payout.\n- ETFs/CEFs don't have traditional payout ratios.\n\nCOVERAGE ANALYSIS — USE TTM FIELDS, NOT LEGACY PER-SHARE:\n- fcfTTM, dividendsPaidTTM, fcfCoverageTTM are DOLLAR totals over trailing 4 quarters. Authoritative.\n- payoutRatioWorst = max(payoutRatioEarnings, payoutRatioFCF). Use for cut-risk.\n- IGNORE fcfPerShare/payoutRatio (legacy, ~4x understated) when fcfTTM is present.\n- If fcfCoverageTTM >= 1.5 and payoutRatioWorst <= 0.75 → cutRisk: low.\n- If fcfCoverageTTM < 1.0 OR payoutRatioWorst > 1.0 → cutRisk: high.\n\nSEVERITY (conservative):\n- critical = REAL bankruptcy/elimination risk. Max 2-3 across portfolio.\n- warning = freeze likely or unsustainable WITHOUT strategic reason\n- info = safe, growing, or strategically sound\n\nRespond ONLY JSON array.",
            input_shape: { positions: "Batches of 15 with { ticker, name, sector, category, divTTM, dividendsPaidTTM, fcfTTM, fcfCoverageTTM, payoutRatioWorst, debtToEbitda, dividendStreakYears, qualityScore, safetyScore, trendRevenue, trendFCF, trendDebt, trendDivPaid }" },
            output_shape: { result: "Array of { ticker, severity, title, summary, details: { payoutRatio, fcfCoverage, cutRisk: low|medium|high, context: strategic|stressed|stable|growing }, score 1-10 }" },
            cost_per_run_estimate_usd: 0.50,
            trigger: "Manual o pipeline completo",
            when_it_fires: "Step 3. ~75 posiciones con dividendo en batches de 15.",
          },
          {
            id: "macro", name: "Radar Macro", icon: "🌍",
            type: "llm", model: "claude-haiku-4-5-20251001",
            description: "Síntesis macro narrativa (Haiku desde 2026-04-08 tras audit: Opus no aportaba valor único). Analiza calendario económico, treasury rates, credit, factores y sectores.",
            system_prompt: "You are a macro strategist analyzing a $1.35M dividend portfolio (China fiscal resident).\n\nReason step by step:\n1. REGIME: risk-on, risk-off or transition?\n2. CREDIT: HYG/LQD spreads stress? TLT flight-to-quality?\n3. FACTORS: QUAL/MTUM/VLUE vs SPY rotation?\n4. SECTORS: Defensives outperforming? Cyclicals weak?\n5. COMMODITIES: GLD/USO inflation/geopolitics?\n6. IMPLICATION for dividend stocks.\n\nSEVERITY:\n- critical = credit blowing out (HYG -3%+ in week) or regime shift to bear\n- warning = sector rotation hurting portfolio\n- info = stable\n\nRespond ONLY JSON narrative (4-5 sentences, NOT bullets).",
            input_shape: { currentRegime: "From regime agent", marketIndicators: "24 ETFs", economicEvents: "FMP economic-calendar last 7d", treasuryRates: "FMP yields", portfolioSectors: "Sector weights" },
            output_shape: { severity: "info|warning|critical", summary: "4-5 sentence narrative", details: { regime: "risk-on|risk-off|transition", creditStress: "none|mild|elevated|severe", portfolioImplications: "string[]", keyRisks: "string[]", opportunities: "string[]" } },
            cost_per_run_estimate_usd: 0.01,
            trigger: "Manual o pipeline",
            when_it_fires: "Step 4. Lee agent_memory.regime_current.",
          },
          {
            id: "risk", name: "Control de Riesgo", icon: "⚠️",
            type: "llm", model: "claude-haiku-4-5-20251001",
            description: "Análisis portfolio (concentración, drawdown, beta). Haiku desde 2026-04-08 — las métricas se calculan en código, el LLM solo las narra.",
            system_prompt: "You are a portfolio risk analyst for a $1.35M dividend portfolio.\nEvaluate the PORTFOLIO AS A WHOLE (concentration, diversification, drawdown, leverage, regime alignment).\n\nPHILOSOPHY (CRITICAL):\n- LONG-TERM buy-and-hold. NEVER recommend selling quality during temporary drawdowns.\n- A position down 30% is an opportunity to add if dividend is intact and fundamentals sound.\n- The owner does NOT trade. Don't recommend SELL/EXIT/REDUCE unless real bankruptcy risk.\n\nSEVERITY:\n- critical = single >15% AND bankruptcy risk, OR maxDD >15%, OR margin > dividend income, OR beta >1.3\n- warning = top 5 > 40%, OR drawdown >8%, OR single sector >50%, OR beta >1.0\n- info = well-diversified\n\nReturn EXACTLY ONE JSON object (no array). Focus on portfolio-level metrics.",
            input_shape: { totalNLV: "number", top5: "[{ ticker, weight }]", sectorWeights: "[{ sector, weight }]", maxDrawdown60d: "%", currentRegime: "from agent_memory", weightedBeta: "number", positionRiskMetrics: "Top 15 with beta, vol, sharpe, sortino, maxDD" },
            output_shape: { severity: "info|warning|critical", summary: "3-4 sentences portfolio-level", details: { concentrationScore: "1-10", portfolioBeta: "number", topRisks: "string[]", recommendations: "string[]" } },
            cost_per_run_estimate_usd: 0.01,
            trigger: "Manual o pipeline",
            when_it_fires: "Step 5. Lee agent_memory.regime_current.",
          },
          {
            id: "trade", name: "Asesor de Operaciones", icon: "🎯",
            type: "llm", model: "claude-opus-4-20250514",
            description: "Síntesis única Opus (simplificado 2026-04-08: antes 3 llamadas bull+bear+synth, ahora 1 sola con el mismo nivel de razonamiento interno). Lee TODOS los insights del día y recomienda acciones concretas.",
            system_prompt: "You are a senior portfolio advisor for a LONG-TERM dividend income portfolio ($1.35M, buy-and-hold, China fiscal resident).\nRead todayInsights from other agents. For each actionable position, think through both bull and bear cases INTERNALLY, then emit final recommendation. Focus on ADD over SELL.\n\nPHILOSOPHY:\n- Selling quality during temporary dip = WORST mistake. Default HOLD or ADD.\n- SELL only if business permanently broken OR dividend eliminated.\n- TRIM only if position >10% AND impaired.\n- ADD if quality below fair value with intact dividend.\n- Companies restructuring often BUYS not SELLS.\n\nSEVERITY:\n- critical = SELL only if structural decline. Max 1-2 across portfolio.\n- warning = review, default HOLD.\n- info = fine.\n\nRespond ONLY JSON array. Max 10 actionable. Favor ADD > HOLD > TRIM > SELL. Score 1-10 = conviction.",
            input_shape: { todayInsights: "All non-trade insights for today", positions: "Top 20 with valuation + insider data", regime: "From agent_memory" },
            output_shape: { result: "Array up to 10 of { ticker, severity, title, summary, details: { action: BUY|SELL|HOLD|TRIM|ADD, conviction: low|medium|high, bullSummary, bearSummary, targetPrice, timeHorizon }, score 1-10 }" },
            cost_per_run_estimate_usd: 0.12,
            trigger: "Manual o pipeline (último paso LLM)",
            when_it_fires: "Step 6. Lee TODOS los insights del día. Si Opus falla, degrada gracefully.",
          },
          { id: "postmortem", name: "Historial de Aciertos", icon: "📋", type: "no_llm", model: "—", description: "Cada día revisa señales de hace 7/30 días. BUY/ADD correcto si precio subió >2%, SELL/TRIM si bajó >2%.", system_prompt: "(no LLM — pure calculation)", input_shape: { source: "D1.signal_tracking + D1.positions" }, output_shape: { schema: "agent_insights con accuracy stats" }, cost_per_run_estimate_usd: 0, trigger: "Pipeline completo", when_it_fires: "Step 7" },
          { id: "insider", name: "Radar de Insiders", icon: "🕵️", type: "no_llm", model: "—", description: "Detecta compras/ventas de insiders (Form 4) en posiciones del portfolio.", system_prompt: "(no LLM — FMP API)", input_shape: { source: "FMP /stable/insider-trading/search" }, output_shape: { schema: "agent_insights por ticker con transacciones" }, cost_per_run_estimate_usd: 0, trigger: "Pipeline", when_it_fires: "Step 8" },
          { id: "value", name: "Value Signals", icon: "💎", type: "no_llm", model: "—", description: "Escanea portfolio + ~120 Aristocrats/Champions buscando infravaloradas según GF Value. Sugiere Put selling.", system_prompt: "(no LLM — GuruFocus data)", input_shape: { source: "GuruFocus + D1.positions" }, output_shape: { schema: "agent_insights con descuento, Put strike, prima" }, cost_per_run_estimate_usd: 0, trigger: "Pipeline", when_it_fires: "Step 9" },
          { id: "options", name: "Options Income", icon: "🎰", type: "no_llm", model: "—", description: "Escanea top 20 posiciones buscando Covered Calls, CSPs y Bull Put Spreads en SPY/QQQ.", system_prompt: "(no LLM — Yahoo Finance options)", input_shape: { source: "Yahoo options chain, D1.positions" }, output_shape: { schema: "agent_insights con strike, prima, delta, dte" }, cost_per_run_estimate_usd: 0, trigger: "Pipeline", when_it_fires: "Step 10" },
          { id: "dividend_cut_warning", name: "Dividend Cut Early Warning", icon: "🚨", type: "no_llm", model: "—", description: "Detecta riesgo de recorte 4-8 semanas antes del anuncio. Rolling TTM windows de FCF coverage. Carve-out REIT/AM/BDC.", system_prompt: "(no LLM — Q+S inputs analysis)", input_shape: { source: "D1.quality_safety_scores + Q+S inputs_json" }, output_shape: { schema: "agent_insights con cutRisk + reason" }, cost_per_run_estimate_usd: 0, trigger: "Pipeline", when_it_fires: "Step 11" },
          { id: "analyst_downgrade", name: "Analyst Downgrade Tracker", icon: "📉", type: "no_llm", model: "—", description: "Pulla FMP grades-historical y detecta cluster downgrades. Critical si sentimiento cae 4+ pts con 6+ analistas.", system_prompt: "(no LLM — FMP grades)", input_shape: { source: "FMP /stable/grades-historical" }, output_shape: { schema: "agent_insights con sentimentDelta + analysts count" }, cost_per_run_estimate_usd: 0, trigger: "Pipeline", when_it_fires: "Step 12" },
          { id: "earnings_trend", name: "Earnings Trend Pattern", icon: "📈", type: "no_llm", model: "—", description: "Detecta 2+ trimestres consecutivos de op income miss YoY + compresión de márgenes >100bps.", system_prompt: "(no LLM — FMP financials trend)", input_shape: { source: "FMP financials cached (operatingIncome, revenue 8q)" }, output_shape: { schema: "agent_insights con racha + margen compression" }, cost_per_run_estimate_usd: 0, trigger: "Pipeline", when_it_fires: "Step 13" },
          { id: "sec_filings", name: "SEC Filings Tracker", icon: "📋", type: "no_llm", model: "—", description: "Track 8-K material events (item 2.05/2.06/3.03/4.01/4.02/5.02) en posiciones del portfolio.", system_prompt: "(no LLM — SEC EDGAR API)", input_shape: { source: "SEC EDGAR /submissions API + CIK lookup cache" }, output_shape: { schema: "agent_insights con item code + filing date + link" }, cost_per_run_estimate_usd: 0, trigger: "Pipeline", when_it_fires: "Step 14" },
        ];
        return json({
          agents: AGENTS_METADATA,
          total: AGENTS_METADATA.length,
          llm_count: AGENTS_METADATA.filter(a => a.type === "llm").length,
          no_llm_count: AGENTS_METADATA.filter(a => a.type === "no_llm").length,
          estimated_pipeline_cost_usd: AGENTS_METADATA.reduce((s, a) => s + (a.cost_per_run_estimate_usd || 0), 0),
          note: "Los system_prompt de los agentes no-LLM están vacíos (ejecutan código puro). Para los LLM, los prompts son una COPIA del worker.js — si los editas en runXxxAgent, actualiza también AGENTS_METADATA aquí.",
        }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── EARNINGS INTELLIGENCE MVP ─────────────────────────────
      // ═══════════════════════════════════════════════════════════
      //
      // GET  /api/earnings/upcoming           → próximos 30 días, portfolio only
      // POST /api/earnings/briefing/refresh   → cachea earnings_calendar 30d
      // GET  /api/earnings/briefing/:ticker   → briefing pre-earnings (cached + FMP fallback)
      // GET  /api/earnings/post               → Track A últimos 7 días (compara actual vs estimate)
      //
      // Sin LLM. Datos vienen de FMP (`/stable/earnings-calendar`, `/stable/earnings`)
      // y se cachean en D1 con TTL implícito (refresh manual desde UI).

      if (path === "/api/earnings/briefing/refresh" && request.method === "POST") {
        const key = env.FMP_KEY;
        if (!key) return json({ error: "no FMP key" }, corsHeaders, 500);
        const today = new Date().toISOString().slice(0, 10);
        const plus30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const url2 = `https://financialmodelingprep.com/stable/earnings-calendar?from=${today}&to=${plus30}&apikey=${key}`;
        let data;
        try {
          const resp = await fetch(url2);
          if (!resp.ok) return json({ error: "fmp fetch failed", status: resp.status }, corsHeaders, 500);
          data = await resp.json();
        } catch (e) {
          return json({ error: "fmp fetch error", message: e.message }, corsHeaders, 500);
        }
        if (!Array.isArray(data)) return json({ error: "unexpected FMP shape" }, corsHeaders, 500);
        const { results: positions } = await env.DB.prepare(
          "SELECT ticker FROM positions WHERE shares > 0"
        ).all();
        const ourTickers = new Set((positions || []).map(p => p.ticker));
        const fmpToOurs = {};
        for (const t of ourTickers) {
          fmpToOurs[toFMP(t)] = t;
          fmpToOurs[t] = t;
        }
        let inserted = 0, updated = 0;
        for (const ev of data) {
          const fmpSym = String(ev.symbol || "").toUpperCase();
          const ourT = fmpToOurs[fmpSym];
          if (!ourT) continue;
          const date = String(ev.date || "").slice(0, 10);
          if (!date) continue;
          const eps = ev.epsEstimated != null ? Number(ev.epsEstimated) : null;
          const rev = ev.revenueEstimated != null ? Number(ev.revenueEstimated) : null;
          const time = ev.time || ev.timeOfDay || null;
          const period = ev.fiscalDateEnding || null;
          const existing = await env.DB.prepare(
            "SELECT id FROM earnings_calendar WHERE ticker = ? AND earnings_date = ?"
          ).bind(ourT, date).first();
          if (existing) {
            await env.DB.prepare(
              `UPDATE earnings_calendar
                 SET eps_estimate = ?, revenue_estimate = ?, earnings_time = ?, fiscal_period = ?, updated_at = datetime('now')
               WHERE id = ?`
            ).bind(eps, rev, time, period, existing.id).run();
            updated++;
          } else {
            await env.DB.prepare(
              `INSERT INTO earnings_calendar (ticker, earnings_date, earnings_time, fiscal_period, eps_estimate, revenue_estimate)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(ourT, date, time, period, eps, rev).run();
            inserted++;
          }
        }
        return json({ ok: true, inserted, updated, scanned: data.length, portfolio_size: ourTickers.size }, corsHeaders);
      }

      if (path === "/api/earnings/upcoming" && request.method === "GET") {
        const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") || "30", 10)));
        const today = new Date().toISOString().slice(0, 10);
        const horizon = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
        const { results } = await env.DB.prepare(
          `SELECT ec.ticker, ec.earnings_date, ec.earnings_time, ec.fiscal_period,
                  ec.eps_estimate, ec.revenue_estimate,
                  p.name, p.usd_value, p.market_value, p.shares
             FROM earnings_calendar ec
             LEFT JOIN positions p ON p.ticker = ec.ticker
            WHERE ec.earnings_date >= ? AND ec.earnings_date <= ?
              AND COALESCE(p.shares, 0) > 0
            ORDER BY ec.earnings_date ASC, ec.ticker ASC`
        ).bind(today, horizon).all();
        const { results: posAll } = await env.DB.prepare(
          "SELECT COALESCE(usd_value, market_value, 0) AS v FROM positions WHERE shares > 0"
        ).all();
        const totalUsd = (posAll || []).reduce((s, r) => s + (Number(r.v) || 0), 0);
        const todayMs = Date.parse(today);
        const enriched = (results || []).map(r => {
          const value = Number(r.usd_value || r.market_value || 0);
          const weight = totalUsd > 0 ? (value / totalUsd) * 100 : 0;
          const days_until = Math.round((Date.parse(r.earnings_date) - todayMs) / 86400000);
          let importance = "normal";
          if (weight >= 3) importance = "critical";
          else if (weight >= 1) importance = "high";
          return {
            ticker: r.ticker,
            name: r.name || r.ticker,
            earnings_date: r.earnings_date,
            earnings_time: r.earnings_time,
            fiscal_period: r.fiscal_period,
            eps_estimate: r.eps_estimate,
            revenue_estimate: r.revenue_estimate,
            value_usd: value,
            weight_pct: weight,
            days_until,
            importance,
          };
        });
        const counts = {
          total: enriched.length,
          critical: enriched.filter(e => e.importance === "critical").length,
          high: enriched.filter(e => e.importance === "high").length,
        };
        return json({ days, counts, items: enriched }, corsHeaders);
      }

      if (path.startsWith("/api/earnings/briefing/") && request.method === "GET") {
        const ticker = decodeURIComponent(path.replace("/api/earnings/briefing/", ""));
        if (!ticker) return json({ error: "ticker required" }, corsHeaders, 400);
        const key = env.FMP_KEY;
        const upcoming = await env.DB.prepare(
          `SELECT ticker, earnings_date, earnings_time, fiscal_period, eps_estimate, revenue_estimate
             FROM earnings_calendar
            WHERE ticker = ? AND earnings_date >= date('now')
            ORDER BY earnings_date ASC LIMIT 1`
        ).bind(ticker).first();
        const pos = await env.DB.prepare(
          "SELECT ticker, name, shares, avg_price as avg_cost, usd_value, market_value, currency FROM positions WHERE ticker = ?"
        ).bind(ticker).first();
        let qs = null;
        try {
          qs = await env.DB.prepare(
            "SELECT quality_score, safety_score, computed_at FROM quality_safety_scores WHERE ticker = ? ORDER BY snapshot_date DESC LIMIT 1"
          ).bind(ticker).first();
        } catch (e) { /* tabla no existe */ }
        let history = [];
        if (key) {
          try {
            const fmpSym = toFMP(ticker);
            const histUrl = `https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(fmpSym)}&limit=4&apikey=${key}`;
            const resp = await fetch(histUrl);
            if (resp.ok) {
              const arr = await resp.json();
              if (Array.isArray(arr)) {
                history = arr.slice(0, 4).map(e => {
                  const epsAct = e.epsActual != null ? Number(e.epsActual) : null;
                  const epsEst = e.epsEstimated != null ? Number(e.epsEstimated) : null;
                  const revAct = e.revenueActual != null ? Number(e.revenueActual) : null;
                  const revEst = e.revenueEstimated != null ? Number(e.revenueEstimated) : null;
                  const surprise = (epsAct != null && epsEst && epsEst !== 0)
                    ? ((epsAct - epsEst) / Math.abs(epsEst)) * 100 : null;
                  return {
                    date: String(e.date || "").slice(0, 10),
                    eps_actual: epsAct,
                    eps_estimate: epsEst,
                    revenue_actual: revAct,
                    revenue_estimate: revEst,
                    surprise_pct: surprise,
                    beat: surprise != null ? (surprise >= 0) : null,
                  };
                });
              }
            }
          } catch (e) { /* silent */ }
        }
        const beats = history.filter(h => h.beat === true).length;
        const hasSurprise = history.filter(h => h.surprise_pct != null);
        const beatRate = history.length > 0 ? (beats / history.length) * 100 : null;
        const surpriseAvg = hasSurprise.length > 0
          ? hasSurprise.reduce((s, h) => s + h.surprise_pct, 0) / hasSurprise.length : null;
        return json({
          ticker,
          upcoming: upcoming || null,
          position: pos ? {
            shares: pos.shares,
            avg_cost: pos.avg_cost,
            value_usd: pos.usd_value || pos.market_value || 0,
            currency: pos.currency,
            name: pos.name,
          } : null,
          quality_safety: qs || null,
          history,
          stats: {
            beat_rate_pct: beatRate,
            surprise_avg_pct: surpriseAvg,
            quarters_analyzed: history.length,
          },
        }, corsHeaders);
      }

      if (path === "/api/earnings/post" && request.method === "GET") {
        const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const { results } = await env.DB.prepare(
          `SELECT ec.ticker, ec.earnings_date, ec.eps_estimate, ec.revenue_estimate, ec.fiscal_period,
                  p.name, p.usd_value, p.market_value
             FROM earnings_calendar ec
             LEFT JOIN positions p ON p.ticker = ec.ticker
            WHERE ec.earnings_date >= ? AND ec.earnings_date <= ?
              AND COALESCE(p.shares, 0) > 0
            ORDER BY ec.earnings_date DESC`
        ).bind(since, today).all();
        const key = env.FMP_KEY;
        const items = [];
        for (const r of (results || [])) {
          let cached = await env.DB.prepare(
            "SELECT * FROM earnings_results WHERE ticker = ? AND earnings_date = ?"
          ).bind(r.ticker, r.earnings_date).first();
          if (!cached && key) {
            try {
              const fmpSym = toFMP(r.ticker);
              const histUrl = `https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(fmpSym)}&limit=4&apikey=${key}`;
              const resp = await fetch(histUrl);
              if (resp.ok) {
                const arr = await resp.json();
                if (Array.isArray(arr)) {
                  const match = arr.find(e => String(e.date || "").slice(0, 10) === r.earnings_date);
                  if (match && match.epsActual != null) {
                    const epsAct = Number(match.epsActual);
                    const epsEst = match.epsEstimated != null ? Number(match.epsEstimated) : (r.eps_estimate || null);
                    const revAct = match.revenueActual != null ? Number(match.revenueActual) : null;
                    const revEst = match.revenueEstimated != null ? Number(match.revenueEstimated) : (r.revenue_estimate || null);
                    const epsSurp = (epsEst && epsEst !== 0) ? ((epsAct - epsEst) / Math.abs(epsEst)) * 100 : null;
                    const revSurp = (revEst && revEst !== 0 && revAct != null) ? ((revAct - revEst) / Math.abs(revEst)) * 100 : null;
                    let bom = "inline";
                    if (epsSurp != null) {
                      if (epsSurp >= 1) bom = "beat";
                      else if (epsSurp <= -1) bom = "miss";
                    }
                    const summary = (() => {
                      if (epsSurp == null) return `${r.ticker}: actual EPS $${epsAct.toFixed(2)}`;
                      const verb = bom === "beat" ? "Beat" : bom === "miss" ? "Miss" : "In-line";
                      const sign = epsSurp >= 0 ? "+" : "";
                      return `${verb} EPS $${epsAct.toFixed(2)} vs $${(epsEst || 0).toFixed(2)} est (${sign}${epsSurp.toFixed(1)}%)`;
                    })();
                    await env.DB.prepare(
                      `INSERT OR REPLACE INTO earnings_results
                         (ticker, earnings_date, eps_actual, eps_estimate, eps_surprise_pct,
                          revenue_actual, revenue_estimate, revenue_surprise_pct, beat_or_miss, summary, reported_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
                    ).bind(r.ticker, r.earnings_date, epsAct, epsEst, epsSurp,
                            revAct, revEst, revSurp, bom, summary).run();
                    cached = {
                      ticker: r.ticker, earnings_date: r.earnings_date,
                      eps_actual: epsAct, eps_estimate: epsEst, eps_surprise_pct: epsSurp,
                      revenue_actual: revAct, revenue_estimate: revEst, revenue_surprise_pct: revSurp,
                      beat_or_miss: bom, summary,
                    };
                  }
                }
              }
            } catch (e) { /* silent */ }
          }
          items.push({
            ticker: r.ticker,
            name: r.name || r.ticker,
            earnings_date: r.earnings_date,
            fiscal_period: r.fiscal_period,
            value_usd: Number(r.usd_value || r.market_value || 0),
            result: cached || null,
          });
        }
        return json({ since, until: today, count: items.length, items }, corsHeaders);
      }

      // DELETE /api/news/all — clear all news items (development reset)
      if (path === "/api/news/all" && request.method === "DELETE") {
        try {
          await env.DB.prepare("DELETE FROM news_items").run();
          return json({ ok: true }, corsHeaders);
        } catch (e) {
          return json({ error: e.message }, corsHeaders, 500);
        }
      }

      // ═══════════════════════════════════════════════════════════
      // ─── NEWS AGENT MVP ───────────────────────────────────────
      // ═══════════════════════════════════════════════════════════
      //
      // POST /api/news/refresh        pull FMP news for portfolio + Haiku classify + insert
      // GET  /api/news/recent         list filterable (days, severity, ticker, min_relevance)
      // GET  /api/news/:id            single item detail
      //
      // Manual refresh only (no cron). Haiku classification costs ~$0.05/run.

      if (path === "/api/news/refresh" && request.method === "POST") {
        const key = env.FMP_KEY;
        if (!key) return json({ error: "no FMP key" }, corsHeaders, 500);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "no ANTHROPIC_API_KEY" }, corsHeaders, 500);

        const { results: positions } = await env.DB.prepare(
          "SELECT ticker FROM positions WHERE shares > 0"
        ).all();
        const ourTickers = (positions || []).map(p => p.ticker).filter(Boolean);
        if (!ourTickers.length) return json({ ok: true, fetched: 0, inserted: 0, note: "no portfolio tickers" }, corsHeaders);

        const fmpToOur = {};
        const fmpSymbols = [];
        for (const t of ourTickers) {
          const fmpSym = toFMP(t);
          fmpToOur[fmpSym] = t;
          fmpSymbols.push(fmpSym);
        }

        const CHUNK_SIZE = 10;
        const LIMIT_PER_CHUNK = 30;
        const allRawItems = [];
        for (let i = 0; i < fmpSymbols.length; i += CHUNK_SIZE) {
          const chunk = fmpSymbols.slice(i, i + CHUNK_SIZE);
          const tickerParam = chunk.join(",");
          // FMP stable news endpoint uses `symbols=` (plural). Using `tickers=`
          // silently returns the general news feed ignoring the filter.
          const url2 = `https://financialmodelingprep.com/stable/news/stock?symbols=${tickerParam}&limit=${LIMIT_PER_CHUNK}&apikey=${key}`;
          try {
            const resp = await fetch(url2);
            if (!resp.ok) {
              console.warn(`[news/refresh] FMP ${resp.status} for chunk ${i}`);
              continue;
            }
            const data = await resp.json();
            if (Array.isArray(data)) {
              for (const r of data) {
                if (!r || !r.url || !r.title) continue;
                const fmpSym = String(r.symbol || "").toUpperCase();
                const ourT = fmpToOur[fmpSym] || fmpSym;
                allRawItems.push({
                  url: String(r.url),
                  title: String(r.title || "").slice(0, 500),
                  text: String(r.text || "").slice(0, 1000),
                  source: String(r.site || r.publisher || ""),
                  published_at: String(r.publishedDate || r.published_at || new Date().toISOString()),
                  ticker: ourT,
                  image_url: String(r.image || ""),
                });
              }
            }
          } catch (e) {
            console.warn(`[news/refresh] fetch error chunk ${i}: ${e.message}`);
          }
        }

        // Dedupe by URL against DB
        const existingUrls = new Set();
        if (allRawItems.length) {
          const { results: existing } = await env.DB.prepare(
            `SELECT url FROM news_items WHERE published_at >= datetime('now', '-30 days')`
          ).all();
          for (const e of (existing || [])) existingUrls.add(e.url);
        }
        const dedupedByUrl = new Map();
        for (const it of allRawItems) {
          if (existingUrls.has(it.url)) continue;
          if (dedupedByUrl.has(it.url)) {
            const prev = dedupedByUrl.get(it.url);
            if (!prev._tickers.includes(it.ticker)) prev._tickers.push(it.ticker);
          } else {
            dedupedByUrl.set(it.url, { ...it, _tickers: [it.ticker] });
          }
        }
        const newItems = Array.from(dedupedByUrl.values());
        if (!newItems.length) {
          return json({ ok: true, fetched: allRawItems.length, deduped: 0, classified: 0, inserted: 0 }, corsHeaders);
        }

        const CLASSIFY_BATCH = 15;
        const classifySystem = `Eres un clasificador de noticias financieras para una cartera long-term dividend-focused. Para cada noticia recibida en el array de input, devuelves OBJETO clasificación con campos exactos:
- relevance_score: 0-1 (0 = ruido total, 1 = material para tesis de inversión)
- sentiment_score: -1 a 1 (-1 muy negativo, 0 neutral, 1 muy positivo)
- severity: "info" | "warning" | "critical"  (critical = afecta tesis directamente, warning = a vigilar, info = contexto)
- category: "earnings" | "dividend" | "guidance" | "ma" | "regulatory" | "rating" | "executive" | "product" | "general"
- summary_es: 1-2 frases en español, neutral, factual

Penaliza fuerte: opiniones de analistas, clickbait, "5 reasons", "could X be next", rumores. Bonus: PR oficial, SEC filings, earnings, dividend changes, M&A.

OUTPUT: JSON array EXACTO con un objeto por item del input, en el mismo orden. Sin texto adicional.`;

        let totalInserted = 0;
        let totalClassified = 0;
        for (let i = 0; i < newItems.length; i += CLASSIFY_BATCH) {
          const batch = newItems.slice(i, i + CLASSIFY_BATCH);
          const userPayload = batch.map((it, idx) => ({
            idx,
            title: it.title,
            text: it.text.slice(0, 400),
            source: it.source,
            tickers: it._tickers,
          }));
          let classifications = [];
          try {
            const result = await callAgentClaude(env, classifySystem, userPayload, { model: "claude-haiku-4-5-20251001", maxTokens: 4000 });
            classifications = Array.isArray(result) ? result : (result?.items || []);
          } catch (e) {
            console.warn(`[news/refresh] Haiku error batch ${i}: ${e.message}`);
            classifications = batch.map(() => ({ relevance_score: 0.3, sentiment_score: 0, severity: "info", category: "general", summary_es: "" }));
          }
          for (let j = 0; j < batch.length; j++) {
            const it = batch[j];
            const c = classifications[j] || {};
            const relevance = Math.max(0, Math.min(1, Number(c.relevance_score) || 0));
            const sentiment = Math.max(-1, Math.min(1, Number(c.sentiment_score) || 0));
            const severity = ["info", "warning", "critical"].includes(c.severity) ? c.severity : "info";
            const category = String(c.category || "general").slice(0, 32);
            const summary = String(c.summary_es || it.text.slice(0, 200) || "").slice(0, 600);
            try {
              await env.DB.prepare(
                `INSERT INTO news_items (url, title, summary, source, published_at, tickers_json, severity, sentiment_score, relevance_score, category, image_url)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(url) DO NOTHING`
              ).bind(
                it.url, it.title, summary, it.source, it.published_at,
                JSON.stringify(it._tickers),
                severity, sentiment, relevance, category, it.image_url || ""
              ).run();
              totalInserted++;
            } catch (e) {
              console.warn(`[news/refresh] insert error: ${e.message}`);
            }
            totalClassified++;
          }
        }
        return json({
          ok: true,
          fetched: allRawItems.length,
          deduped: newItems.length,
          classified: totalClassified,
          inserted: totalInserted,
        }, corsHeaders);
      }

      if (path === "/api/news/recent" && request.method === "GET") {
        const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") || "7", 10)));
        const severity = url.searchParams.get("severity") || "";
        const ticker = url.searchParams.get("ticker") || "";
        const minRel = Number(url.searchParams.get("min_relevance") || "0");
        const since = new Date(Date.now() - days * 86400000).toISOString();
        let q = `SELECT id, url, title, summary, source, published_at, tickers_json, severity, sentiment_score, relevance_score, category, image_url
                 FROM news_items
                 WHERE published_at >= ? AND relevance_score >= ?`;
        const params = [since, minRel];
        if (severity && ["info", "warning", "critical"].includes(severity)) {
          q += " AND severity = ?";
          params.push(severity);
        }
        if (ticker) {
          q += " AND tickers_json LIKE ?";
          params.push(`%"${ticker}"%`);
        }
        q += " ORDER BY published_at DESC LIMIT 200";
        const { results } = await env.DB.prepare(q).bind(...params).all();
        const items = (results || []).map(r => ({
          id: r.id,
          url: r.url,
          title: r.title,
          summary: r.summary,
          source: r.source,
          source_url: r.url,
          published_at: r.published_at,
          tickers: (() => { try { return JSON.parse(r.tickers_json || "[]"); } catch (_) { return []; } })(),
          severity: r.severity,
          sentiment_score: r.sentiment_score,
          relevance_score: r.relevance_score,
          category: r.category,
          image_url: r.image_url,
        }));
        const counts = {
          critical: items.filter(i => i.severity === "critical").length,
          warning: items.filter(i => i.severity === "warning").length,
          info: items.filter(i => i.severity === "info").length,
        };
        return json({ count: items.length, counts, items }, corsHeaders);
      }

      // Single news item detail — must come AFTER /api/news/recent to avoid matching collision
      if (path.startsWith("/api/news/") && !path.includes("/refresh") && !path.includes("/recent") && request.method === "GET") {
        const id = parseInt(path.split("/").pop(), 10);
        if (!Number.isFinite(id)) return json({ error: "invalid id" }, corsHeaders, 400);
        const r = await env.DB.prepare(
          `SELECT id, url, title, summary, source, published_at, tickers_json, severity, sentiment_score, relevance_score, category, image_url
             FROM news_items WHERE id = ?`
        ).bind(id).first();
        if (!r) return json({ error: "not found" }, corsHeaders, 404);
        return json({
          id: r.id,
          url: r.url,
          title: r.title,
          summary: r.summary,
          source: r.source,
          source_url: r.url,
          published_at: r.published_at,
          tickers: (() => { try { return JSON.parse(r.tickers_json || "[]"); } catch (_) { return []; } })(),
          severity: r.severity,
          sentiment_score: r.sentiment_score,
          relevance_score: r.relevance_score,
          category: r.category,
          image_url: r.image_url,
        }, corsHeaders);
      }

      // ═══════════════════════════════════════════════════════════
      // ─── COMPANY NARRATIVES (transcript summary + business model) ───
      // ═══════════════════════════════════════════════════════════
      //
      // GET  /api/company/:ticker/transcript-summary          read cache
      // POST /api/company/:ticker/transcript-summary/generate force regenerate with Opus
      // GET  /api/company/:ticker/business-model              read cache (30d TTL → stale flag)
      // POST /api/company/:ticker/business-model/generate     force regenerate with Haiku

      // GET /api/earnings-transcripts?ticker=X — list raw transcripts for a ticker
      if (path === "/api/earnings-transcripts" && request.method === "GET") {
        const ticker = url.searchParams.get("ticker");
        if (!ticker) return json({ error: "ticker required" }, corsHeaders, 400);
        const bareTicker = ticker.replace(/^(BME:|HKG:|LSE:)/, "").toUpperCase();
        try {
          const { results } = await env.DB.prepare(
            `SELECT ticker, quarter, year, content, date
             FROM earnings_transcripts
             WHERE UPPER(ticker) = ?
             ORDER BY year DESC, quarter DESC, date DESC
             LIMIT 8`
          ).bind(bareTicker).all();
          return json({
            ticker: bareTicker,
            count: (results || []).length,
            transcripts: results || [],
          }, corsHeaders);
        } catch (e) {
          return json({ error: e.message }, corsHeaders, 500);
        }
      }

      if (path.startsWith("/api/company/")) {
        // Raw Claude call — returns plain markdown, not JSON. Local variant
        // because callAgentClaude wraps everything in JSON.parse.
        const callClaudeRaw = async (systemPrompt, userContent, opts = {}) => {
          const model = opts.model || "claude-haiku-4-5-20251001";
          const maxTokens = opts.maxTokens || 1500;
          const body = JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: "user", content: typeof userContent === "string" ? userContent : JSON.stringify(userContent) }],
          });
          const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
          const BACKOFF_MS = [5000, 15000, 30000];
          let resp = null;
          let lastErr = null;
          for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
            try {
              resp = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": env.ANTHROPIC_API_KEY || "",
                  "anthropic-version": "2023-06-01",
                },
                body,
              });
              if (resp.ok) break;
              if (!RETRYABLE.has(resp.status) || attempt === BACKOFF_MS.length) {
                const errText = await resp.text();
                throw new Error(`Claude API error ${resp.status}: ${errText}`);
              }
              await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
            } catch (e) {
              lastErr = e;
              if (attempt === BACKOFF_MS.length) throw e;
              await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
            }
          }
          if (!resp || !resp.ok) throw lastErr || new Error("Claude API: all retries exhausted");
          const result = await resp.json();
          const text = result.content?.[0]?.text || "";
          const usage = result.usage || {};
          const tokensUsed = (usage.input_tokens || 0) + (usage.output_tokens || 0);
          return { text: text.trim(), tokensUsed };
        };

        const parseCompanyTicker = (pathStr, tail) => {
          const rest = pathStr.slice("/api/company/".length);
          if (!rest.endsWith(tail)) return null;
          const rawTicker = rest.slice(0, rest.length - tail.length);
          return decodeURIComponent(rawTicker).toUpperCase();
        };

        // ── GET /api/company/:ticker/transcript-summary ──
        if (path.endsWith("/transcript-summary") && request.method === "GET") {
          const ticker = parseCompanyTicker(path, "/transcript-summary");
          if (!ticker) return json({ error: "bad ticker" }, corsHeaders, 400);
          try {
            const row = await env.DB.prepare(
              `SELECT content_md, source_data, generated_at, tokens_used
               FROM company_narratives
               WHERE ticker = ? AND narrative_type = 'transcript_summary'`
            ).bind(ticker).first();
            if (!row) return json({ cached: false, content: null, ticker }, corsHeaders);
            return json({
              cached: true, ticker,
              content: row.content_md,
              source_data: row.source_data || "",
              generated_at: row.generated_at,
              tokens_used: row.tokens_used || 0,
            }, corsHeaders);
          } catch (e) {
            return json({ error: e.message }, corsHeaders, 500);
          }
        }

        // ── POST /api/company/:ticker/transcript-summary/generate ──
        if (path.endsWith("/transcript-summary/generate") && request.method === "POST") {
          const ticker = parseCompanyTicker(path, "/transcript-summary/generate");
          if (!ticker) return json({ error: "bad ticker" }, corsHeaders, 400);
          if (!env.ANTHROPIC_API_KEY) return json({ error: "no ANTHROPIC_API_KEY" }, corsHeaders, 500);
          try {
            const bareTicker = ticker.replace(/^(BME:|HKG:|LSE:)/, "");
            const { results: trRows } = await env.DB.prepare(
              `SELECT ticker, quarter, year, content, date
               FROM earnings_transcripts
               WHERE ticker = ?
               ORDER BY year DESC, quarter DESC, date DESC
               LIMIT 4`
            ).bind(bareTicker).all();
            if (!trRows || trRows.length === 0) {
              return json({
                error: "Sin transcripts descargados para este ticker. Pulsa '📥 Descargar transcripts frescos' primero.",
                ticker, bareTicker,
              }, corsHeaders, 404);
            }
            const transcripts = trRows.slice(0, 4).map(r => ({
              quarter: r.quarter,
              year: r.year,
              date: r.date,
              excerpt: typeof r.content === "string" ? r.content.slice(0, 4000) : "",
            }));
            const sourceLabels = transcripts.map(t => `${t.quarter} ${t.year}`).join(", ");

            const systemPrompt = `Eres un analista financiero senior. Vas a resumir earnings call transcripts de una empresa para un inversor retail long-term buy-and-hold.

Tu resumen debe tener EXACTAMENTE este formato markdown:

## Qué pasó este trimestre
- [bullet 1 con número específico cuando sea posible]
- [bullet 2]
- [bullet 3]

## Management forward-looking
- [lo que dijeron sobre guidance]
- [lo que dijeron sobre próximos trimestres]

## Red flags del Q&A
- [preguntas de analistas donde management no respondió bien]
- [temas que management esquivó]
- O "Ninguna" si no hay

## Cambios vs trimestre anterior
- [qué ha mejorado]
- [qué ha empeorado]

## Conclusión en 1 frase
[1 frase clara: bull / bear / neutral + por qué]

Input: JSON con transcripts de los últimos 2-4 quarters.
Output: ONLY the markdown above, nothing else.`;

            const { text: markdown, tokensUsed } = await callClaudeRaw(
              systemPrompt,
              { ticker, transcripts_count: transcripts.length, transcripts },
              { model: "claude-opus-4-20250514", maxTokens: 1500 }
            );
            if (!markdown || markdown.length < 50) {
              return json({ error: "Opus returned empty response", raw: markdown }, corsHeaders, 500);
            }
            await env.DB.prepare(
              `INSERT INTO company_narratives (ticker, narrative_type, content_md, source_data, tokens_used, generated_at)
               VALUES (?, 'transcript_summary', ?, ?, ?, datetime('now'))
               ON CONFLICT(ticker, narrative_type) DO UPDATE SET
                 content_md = excluded.content_md,
                 source_data = excluded.source_data,
                 tokens_used = excluded.tokens_used,
                 generated_at = excluded.generated_at`
            ).bind(ticker, markdown, sourceLabels, tokensUsed).run();
            return json({
              cached: false, generated: true, ticker,
              content: markdown,
              source_data: sourceLabels,
              tokens_used: tokensUsed,
              generated_at: new Date().toISOString(),
            }, corsHeaders);
          } catch (e) {
            console.error("[transcript-summary/generate]:", e.message);
            return json({ error: e.message, ticker }, corsHeaders, 500);
          }
        }

        // ── GET /api/company/:ticker/business-model ──
        if (path.endsWith("/business-model") && request.method === "GET") {
          const ticker = parseCompanyTicker(path, "/business-model");
          if (!ticker) return json({ error: "bad ticker" }, corsHeaders, 400);
          try {
            const row = await env.DB.prepare(
              `SELECT content_md, source_data, generated_at, tokens_used,
                      CAST((julianday('now') - julianday(generated_at)) AS INTEGER) AS age_days
               FROM company_narratives
               WHERE ticker = ? AND narrative_type = 'business_model'`
            ).bind(ticker).first();
            if (!row) return json({ cached: false, content: null, ticker }, corsHeaders);
            const ageDays = Number(row.age_days || 0);
            return json({
              cached: true,
              stale: ageDays > 30,
              age_days: ageDays,
              ticker,
              content: row.content_md,
              source_data: row.source_data || "",
              generated_at: row.generated_at,
              tokens_used: row.tokens_used || 0,
            }, corsHeaders);
          } catch (e) {
            return json({ error: e.message }, corsHeaders, 500);
          }
        }

        // ── POST /api/company/:ticker/business-model/generate ──
        if (path.endsWith("/business-model/generate") && request.method === "POST") {
          const ticker = parseCompanyTicker(path, "/business-model/generate");
          if (!ticker) return json({ error: "bad ticker" }, corsHeaders, 400);
          if (!env.ANTHROPIC_API_KEY) return json({ error: "no ANTHROPIC_API_KEY" }, corsHeaders, 500);
          try {
            const pos = await env.DB.prepare(
              `SELECT ticker, name, sector FROM positions WHERE ticker = ? LIMIT 1`
            ).bind(ticker).first();
            const name = pos?.name || ticker;
            const sector = pos?.sector || "Unknown";

            const systemPrompt = `Explica el modelo de negocio de esta empresa como si se lo estuvieras contando a un niño de 8 años que sabe poco del mundo. Estilo Warren Buffett: simple, claro, con analogías del mundo real.

Formato markdown:

## ¿Qué hace esta empresa?
[1-2 frases. Usa analogías simples. Nada de jerga. Ej: "Imagina que Apple es como una tienda de juguetes mágicos..."]

## ¿Cómo gana dinero?
[2-3 frases. Explica la fuente principal de ingresos de forma simple.]

## Los 2-3 productos que generan casi todo el dinero
1. [producto 1 + % aproximado si lo sabes]
2. [producto 2]
3. [producto 3]

## ¿Qué pasaría si no existiera?
[1 frase: qué alternativas tendrían los clientes, qué perderían]

## ¿Por qué es difícil competir con ellos?
[1-2 frases sobre su moat / ventaja competitiva de forma simple]

Input: { ticker, name, sector }
Output: ONLY the markdown above, nothing else. Tono cálido y didáctico.`;

            const { text: markdown, tokensUsed } = await callClaudeRaw(
              systemPrompt,
              { ticker, name, sector },
              { model: "claude-haiku-4-5-20251001", maxTokens: 1200 }
            );
            if (!markdown || markdown.length < 50) {
              return json({ error: "Haiku returned empty response", raw: markdown }, corsHeaders, 500);
            }
            const sourceData = `${name} · ${sector}`;
            await env.DB.prepare(
              `INSERT INTO company_narratives (ticker, narrative_type, content_md, source_data, tokens_used, generated_at)
               VALUES (?, 'business_model', ?, ?, ?, datetime('now'))
               ON CONFLICT(ticker, narrative_type) DO UPDATE SET
                 content_md = excluded.content_md,
                 source_data = excluded.source_data,
                 tokens_used = excluded.tokens_used,
                 generated_at = excluded.generated_at`
            ).bind(ticker, markdown, sourceData, tokensUsed).run();
            return json({
              cached: false, generated: true, stale: false, age_days: 0,
              ticker,
              content: markdown,
              source_data: sourceData,
              tokens_used: tokensUsed,
              generated_at: new Date().toISOString(),
            }, corsHeaders);
          } catch (e) {
            console.error("[business-model/generate]:", e.message);
            return json({ error: e.message, ticker }, corsHeaders, 500);
          }
        }
      }

      // ── Proceso module: Investment Theses (CRUD + versioning) ──
      //
      // GET /api/theses — list all current theses
      // GET /api/theses/missing — positions with weight >= 1% that have no thesis
      // GET /api/theses/:ticker — current thesis for a ticker (or null)
      // POST /api/theses — create or update thesis (increments version, marks previous as not current)
      if (path === "/api/theses" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM theses WHERE is_current = 1 ORDER BY updated_at DESC"
        ).all();
        return json({ theses: results || [] }, corsHeaders);
      }
      if (path === "/api/theses/missing" && request.method === "GET") {
        // Compute weights in-app (positions table has market_value)
        const { results: positions } = await env.DB.prepare(
          "SELECT ticker, name, market_value FROM positions WHERE shares > 0"
        ).all();
        const total = positions.reduce((s, p) => s + (p.market_value || 0), 0);
        const weighted = positions.map(p => ({
          ticker: p.ticker,
          name: p.name,
          weight_pct: total > 0 ? (p.market_value / total) * 100 : 0,
        })).filter(p => p.weight_pct >= 1);
        const { results: thesesRows } = await env.DB.prepare(
          "SELECT ticker FROM theses WHERE is_current = 1"
        ).all();
        const thesesTickers = new Set((thesesRows || []).map(r => r.ticker));
        const missing = weighted
          .filter(p => !thesesTickers.has(p.ticker))
          .sort((a, b) => b.weight_pct - a.weight_pct);
        return json({
          missing,
          missing_count: missing.length,
          total_eligible: weighted.length,
          coverage_pct: weighted.length > 0
            ? Math.round((weighted.length - missing.length) / weighted.length * 100)
            : 0,
        }, corsHeaders);
      }
      if (path.startsWith("/api/theses/") && request.method === "GET") {
        const ticker = decodeURIComponent(path.slice("/api/theses/".length));
        const { results } = await env.DB.prepare(
          "SELECT * FROM theses WHERE ticker = ? AND is_current = 1 LIMIT 1"
        ).bind(ticker).all();
        return json({ thesis: results?.[0] || null }, corsHeaders);
      }
      if (path === "/api/theses" && request.method === "POST") {
        const body = await request.json();
        const ticker = String(body.ticker || "").trim();
        if (!ticker) return json({ error: "ticker required" }, corsHeaders, 400);
        const why = String(body.why_owned || "").slice(0, 2000);
        const sell = String(body.what_would_make_sell || "").slice(0, 2000);
        if (!why || !sell) return json({ error: "why_owned and what_would_make_sell required" }, corsHeaders, 400);
        const thesisType = String(body.thesis_type || "compounder");
        const conviction = Math.max(1, Math.min(5, parseInt(body.conviction || 3, 10)));
        const twMin = Number(body.target_weight_min || 0);
        const twMax = Number(body.target_weight_max || 0);
        const notesMd = String(body.notes_md || "");

        // Mark previous as not current + compute next version
        const { results: prev } = await env.DB.prepare(
          "SELECT MAX(version) as maxv FROM theses WHERE ticker = ?"
        ).bind(ticker).all();
        const nextVersion = ((prev?.[0]?.maxv) || 0) + 1;
        await env.DB.prepare(
          "UPDATE theses SET is_current = 0 WHERE ticker = ? AND is_current = 1"
        ).bind(ticker).run();
        await env.DB.prepare(
          `INSERT INTO theses (ticker, version, is_current, why_owned, what_would_make_sell,
             thesis_type, conviction, target_weight_min, target_weight_max, notes_md, updated_at)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(ticker, nextVersion, why, sell, thesisType, conviction, twMin, twMax, notesMd).run();
        return json({ ok: true, ticker, version: nextVersion }, corsHeaders);
      }

      // POST /api/theses/:ticker/generate — auto-draft a thesis with Opus
      // Loads position + latest Q+S inputs + business_model + transcript + key_metrics,
      // sends a structured payload to Opus, parses JSON, applies guard rails, and
      // inserts a new thesis version using the same logic as POST /api/theses.
      if (path.startsWith("/api/theses/") && path.endsWith("/generate") && request.method === "POST") {
        try {
          const rawTicker = decodeURIComponent(
            path.slice("/api/theses/".length, -"/generate".length)
          );
          const ticker = rawTicker.trim();
          if (!ticker || !/^[a-zA-Z0-9:_.\-]+$/.test(ticker)) {
            return json({ error: "invalid ticker" }, corsHeaders, 400);
          }

          // 1. Position
          const { results: posRows } = await env.DB.prepare(
            `SELECT ticker, name, sector, currency, shares, avg_price, cost_basis,
                    last_price, market_value, usd_value, div_ttm, div_yield, yoc, market_cap
             FROM positions WHERE ticker = ? LIMIT 1`
          ).bind(ticker).all();
          const position = posRows?.[0];
          if (!position) {
            return json({ error: `ticker ${ticker} no está en el portfolio` }, corsHeaders, 404);
          }
          if ((position.shares || 0) <= 0) {
            return json({ error: `ticker ${ticker} tiene shares=0` }, corsHeaders, 400);
          }

          // 2. Latest Q+S snapshot (must exist)
          const { results: qsRows } = await env.DB.prepare(
            `SELECT quality_score, safety_score, snapshot_date, inputs_json,
                    q_profitability, q_capital_efficiency, q_balance_sheet, q_growth,
                    q_dividend_track, q_predictability,
                    s_coverage, s_balance_sheet, s_track_record, s_forward, s_sector_adj
             FROM quality_safety_scores
             WHERE ticker = ? ORDER BY snapshot_date DESC LIMIT 1`
          ).bind(ticker).all();
          const qs = qsRows?.[0];
          if (!qs) {
            return json({
              error: `no Q+S score para ${ticker}. Genera primero con POST /api/agent-run?agent=quality-safety`
            }, corsHeaders, 400);
          }
          let qsInputs = {};
          try { qsInputs = JSON.parse(qs.inputs_json || "{}"); } catch (_) { qsInputs = {}; }

          // 3. Portfolio weight
          const { results: totalRows } = await env.DB.prepare(
            `SELECT COALESCE(SUM(COALESCE(usd_value, market_value, 0)), 0) AS total
             FROM positions WHERE shares > 0`
          ).all();
          const portfolioTotal = totalRows?.[0]?.total || 0;
          const positionValue = position.usd_value || position.market_value || 0;
          const weightPct = portfolioTotal > 0 ? (positionValue / portfolioTotal) * 100 : 0;

          // 4. Cached narratives (optional)
          const { results: narrRows } = await env.DB.prepare(
            `SELECT narrative_type, content_md FROM company_narratives WHERE ticker = ?`
          ).bind(ticker).all();
          const narratives = {};
          for (const r of (narrRows || [])) narratives[r.narrative_type] = r.content_md || "";

          // 5. Fundamentals key_metrics[0] (optional)
          let keyMetrics = null;
          try {
            const { results: fundRows } = await env.DB.prepare(
              `SELECT key_metrics FROM fundamentals WHERE symbol = ? LIMIT 1`
            ).bind(ticker).all();
            const km = fundRows?.[0]?.key_metrics;
            if (km) {
              const parsed0 = JSON.parse(km);
              if (Array.isArray(parsed0) && parsed0.length > 0) keyMetrics = parsed0[0];
            }
          } catch (_) { /* ignore */ }

          // ─── Build compact payload for Opus ───
          const today = new Date().toISOString().slice(0, 10);
          const isYieldVehicle = /REIT|MLP|BDC/i.test(position.sector || "")
            || /REIT|MLP|BDC/i.test(qsInputs.sector_class || "");

          const payload = {
            today,
            ticker: position.ticker,
            name: position.name,
            sector: position.sector || qsInputs.sector_class || "",
            sector_class: qsInputs.sector_class || null,
            is_yield_vehicle_REIT_MLP_BDC: isYieldVehicle,
            currency: position.currency,
            position: {
              shares: position.shares,
              avg_cost: position.avg_price,
              last_price: position.last_price,
              market_value: position.market_value,
              usd_value: position.usd_value,
              weight_pct: Number(weightPct.toFixed(2)),
              div_ttm: position.div_ttm,
              div_yield_pct: position.div_yield,
              yoc_pct: position.yoc,
              market_cap: position.market_cap,
            },
            quality_safety: {
              snapshot_date: qs.snapshot_date,
              quality_score: qs.quality_score,
              safety_score: qs.safety_score,
              q_breakdown: {
                profitability: qs.q_profitability,
                capital_efficiency: qs.q_capital_efficiency,
                balance_sheet: qs.q_balance_sheet,
                growth: qs.q_growth,
                dividend_track: qs.q_dividend_track,
                predictability: qs.q_predictability,
              },
              s_breakdown: {
                coverage: qs.s_coverage,
                balance_sheet: qs.s_balance_sheet,
                track_record: qs.s_track_record,
                forward: qs.s_forward,
                sector_adj: qs.s_sector_adj,
              },
              inputs_quality: qsInputs.quality || {},
              inputs_safety: qsInputs.safety || {},
            },
            valuation: keyMetrics ? {
              pe: keyMetrics.peRatio ?? keyMetrics.pe ?? null,
              pb: keyMetrics.pbRatio ?? keyMetrics.pb ?? null,
              market_cap: keyMetrics.marketCap ?? null,
              ev_ebitda: keyMetrics.enterpriseValueOverEBITDA ?? null,
              fcf_yield: keyMetrics.freeCashFlowYield ?? null,
            } : null,
            business_model_md: narratives.business_model || null,
            transcript_summary_md: narratives.transcript_summary || null,
          };

          // ─── Opus call with retry (same policy as callAgentClaude) ───
          let parsedOut;
          let tokensUsed = 0;
          try {
            const reqBody = JSON.stringify({
              model: "claude-opus-4-20250514",
              max_tokens: 3000,
              system: THESIS_AUTOGEN_SYSTEM_PROMPT,
              messages: [{ role: "user", content: JSON.stringify(payload) }],
            });
            const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
            const BACKOFF = [5000, 15000, 30000];
            let resp = null;
            for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
              resp = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": env.ANTHROPIC_API_KEY || "",
                  "anthropic-version": "2023-06-01",
                },
                body: reqBody,
              });
              if (resp.ok) break;
              if (!RETRYABLE.has(resp.status) || attempt === BACKOFF.length) {
                const t = await resp.text();
                throw new Error(`Opus ${resp.status}: ${t.slice(0, 300)}`);
              }
              await new Promise(r => setTimeout(r, BACKOFF[attempt]));
            }
            const result = await resp.json();
            const rawText = result.content?.[0]?.text || "";
            tokensUsed = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0);
            const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
            try { parsedOut = JSON.parse(cleaned); }
            catch (_) {
              const start = cleaned.indexOf("{");
              if (start === -1) throw new Error("no JSON object in Opus output");
              let depth = 0, end = -1;
              for (let i = start; i < cleaned.length; i++) {
                if (cleaned[i] === "{") depth++;
                else if (cleaned[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
              }
              if (end === -1) throw new Error("unbalanced JSON in Opus output");
              parsedOut = JSON.parse(cleaned.slice(start, end + 1));
            }
          } catch (e) {
            return json({ error: `Opus call failed: ${e.message}` }, corsHeaders, 502);
          }

          // ─── Validate + apply guard rails ───
          const draftTag = `[DRAFT v2 AI generated ${today}]`;
          let why = String(parsedOut.why_owned || "").trim();
          let sell = String(parsedOut.what_would_make_sell || "").trim();
          if (!why || !sell) {
            return json({ error: "Opus returned empty why_owned or what_would_make_sell" }, corsHeaders, 502);
          }
          if (!why.startsWith("[DRAFT")) why = `${draftTag} ${why}`;
          if (!sell.startsWith("[DRAFT")) sell = `${draftTag} ${sell}`;
          why = why.slice(0, 2000);
          sell = sell.slice(0, 2000);

          const VALID_TYPES = new Set(["compounder","value","turnaround","income","cyclical","speculation"]);
          let thesisType = String(parsedOut.thesis_type || "compounder").toLowerCase();
          if (!VALID_TYPES.has(thesisType)) thesisType = "compounder";

          let conviction = parseInt(parsedOut.conviction, 10);
          if (!Number.isFinite(conviction)) conviction = 3;
          conviction = Math.max(1, Math.min(5, conviction));
          if ((qs.quality_score || 0) < 40 && conviction > 2) conviction = 2;

          const streakYears = Number(qsInputs.safety?.streakYears ?? 0);
          if (streakYears < 5 && thesisType === "income") thesisType = "compounder";

          let twMin = Number(parsedOut.target_weight_min ?? 0);
          let twMax = Number(parsedOut.target_weight_max ?? 0);
          if (!Number.isFinite(twMin)) twMin = 0;
          if (!Number.isFinite(twMax)) twMax = 0;
          twMin = Math.max(0, Math.min(100, twMin));
          twMax = Math.max(0, Math.min(100, twMax));
          if (twMin > twMax) { const t = twMin; twMin = twMax; twMax = t; }

          let notesMd = String(parsedOut.notes_md || "").slice(0, 1500);
          const fcfCov = Number(qsInputs.safety?.fcfCoverage ?? NaN);
          if (Number.isFinite(fcfCov) && fcfCov < 1.2 && !/fcf coverage/i.test(notesMd)) {
            const warn = `\n\n⚠️ FCF coverage = ${fcfCov.toFixed(2)}x (< 1.2x). Vigilar payout.`;
            notesMd = (notesMd + warn).slice(0, 1500);
          }

          // ─── Insert thesis (mirrors POST /api/theses logic) ───
          const { results: prevV } = await env.DB.prepare(
            "SELECT MAX(version) as maxv FROM theses WHERE ticker = ?"
          ).bind(ticker).all();
          const nextVersion = ((prevV?.[0]?.maxv) || 0) + 1;
          await env.DB.prepare(
            "UPDATE theses SET is_current = 0 WHERE ticker = ? AND is_current = 1"
          ).bind(ticker).run();
          await env.DB.prepare(
            `INSERT INTO theses (ticker, version, is_current, why_owned, what_would_make_sell,
               thesis_type, conviction, target_weight_min, target_weight_max, notes_md, updated_at)
             VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          ).bind(ticker, nextVersion, why, sell, thesisType, conviction, twMin, twMax, notesMd).run();

          const costUsd = (tokensUsed / 1_000_000) * 30;

          return json({
            ok: true, ticker, version: nextVersion,
            thesis: {
              ticker, version: nextVersion, is_current: 1,
              why_owned: why, what_would_make_sell: sell,
              thesis_type: thesisType, conviction,
              target_weight_min: twMin, target_weight_max: twMax,
              notes_md: notesMd,
            },
            tokens_used: tokensUsed,
            cost_estimate_usd: Number(costUsd.toFixed(4)),
            context_used: {
              position: true,
              quality_safety: true,
              business_model: !!narratives.business_model,
              transcript_summary: !!narratives.transcript_summary,
              valuation: !!keyMetrics,
              weight_pct: Number(weightPct.toFixed(2)),
              quality_score: qs.quality_score,
              safety_score: qs.safety_score,
            },
          }, corsHeaders);
        } catch (e) {
          return json({ error: `thesis-generate failed: ${e.message}` }, corsHeaders, 500);
        }
      }

      // ── Reading List MVP: library CRUD + notes ──
      //
      // GET  /api/library?type=&status=  — list items (filters optional)
      // POST /api/library  — create item
      // PUT  /api/library/:id  — update status/rating/started_at/finished_at
      // DELETE /api/library/:id
      // GET  /api/library/:id/notes  — list notes for item
      // POST /api/library/:id/notes  — add note
      if (path === "/api/library" && request.method === "GET") {
        const type = url.searchParams.get("type");
        const status = url.searchParams.get("status");
        let sql = "SELECT * FROM library_items WHERE 1=1";
        const params = [];
        if (type) { sql += " AND type = ?"; params.push(type); }
        if (status) { sql += " AND status = ?"; params.push(status); }
        sql += " ORDER BY CASE tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 ELSE 2 END, added_at DESC";
        const { results } = await env.DB.prepare(sql).bind(...params).all();
        return json({ items: results || [] }, corsHeaders);
      }
      if (path === "/api/library" && request.method === "POST") {
        const b = await request.json();
        const title = String(b.title || "").trim();
        if (!title) return json({ error: "title required" }, corsHeaders, 400);
        await env.DB.prepare(
          `INSERT INTO library_items (type, title, author, year, tier, status, rating, source_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          String(b.type || "book"),
          title,
          String(b.author || ""),
          b.year ? parseInt(b.year, 10) : null,
          String(b.tier || "A"),
          String(b.status || "queue"),
          b.rating ? parseInt(b.rating, 10) : null,
          String(b.source_url || "")
        ).run();
        return json({ ok: true }, corsHeaders);
      }
      if (path.startsWith("/api/library/") && path.endsWith("/notes")) {
        const idStr = path.slice("/api/library/".length, -"/notes".length);
        const id = parseInt(idStr, 10);
        if (isNaN(id)) return json({ error: "invalid id" }, corsHeaders, 400);
        if (request.method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT * FROM library_notes WHERE item_id = ? ORDER BY created_at DESC"
          ).bind(id).all();
          return json({ notes: results || [] }, corsHeaders);
        }
        if (request.method === "POST") {
          const b = await request.json();
          const text = String(b.note_text || "").trim();
          if (!text) return json({ error: "note_text required" }, corsHeaders, 400);
          const tickers = Array.isArray(b.related_tickers) ? b.related_tickers : [];
          await env.DB.prepare(
            "INSERT INTO library_notes (item_id, note_text, related_tickers_json) VALUES (?, ?, ?)"
          ).bind(id, text, JSON.stringify(tickers)).run();
          return json({ ok: true }, corsHeaders);
        }
      }
      if (path.startsWith("/api/library/") && (request.method === "PUT" || request.method === "DELETE")) {
        const id = parseInt(path.slice("/api/library/".length), 10);
        if (isNaN(id)) return json({ error: "invalid id" }, corsHeaders, 400);
        if (request.method === "DELETE") {
          await env.DB.prepare("DELETE FROM library_items WHERE id = ?").bind(id).run();
          return json({ ok: true }, corsHeaders);
        }
        const b = await request.json();
        const sets = [];
        const params = [];
        for (const k of ["status", "rating", "tier", "started_at", "finished_at", "title", "author", "year", "source_url"]) {
          if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
        }
        if (!sets.length) return json({ error: "nothing to update" }, corsHeaders, 400);
        sets.push("updated_at = datetime('now')");
        params.push(id);
        await env.DB.prepare(`UPDATE library_items SET ${sets.join(", ")} WHERE id = ?`).bind(...params).run();
        return json({ ok: true }, corsHeaders);
      }

      // ── Currency Exposure MVP ──
      //
      // POST /api/currency/refresh — pull revenue segmentation from FMP for all positions
      // GET  /api/currency/exposure — compute exposure by currency using cached data + defaults
      if (path === "/api/currency/refresh" && request.method === "POST") {
        const key = env.FMP_KEY;
        if (!key) return json({ error: "no FMP key" }, corsHeaders, 500);
        const { results: positions } = await env.DB.prepare(
          "SELECT ticker FROM positions WHERE shares > 0 AND COALESCE(category,'') != 'ETF'"
        ).all();
        let cached = 0, failed = 0;
        for (let i = 0; i < positions.length; i += 4) {
          const batch = positions.slice(i, i + 4);
          const results = await Promise.allSettled(batch.map(async (p) => {
            const sym = toFMP(p.ticker);
            const url2 = `https://financialmodelingprep.com/stable/revenue-geographic-segmentation?symbol=${encodeURIComponent(sym)}&structure=flat&apikey=${key}`;
            const resp = await fetch(url2);
            if (!resp.ok) return { ticker: p.ticker, ok: false };
            const data = await resp.json();
            if (!Array.isArray(data) || !data.length) return { ticker: p.ticker, ok: false };
            const latest = data[0]; // most recent fiscal year
            // Shape varies: some have a `data` map, others have the regions at the root
            const regions = latest.data || latest;
            const fiscalYear = parseInt(String(latest.date || "").slice(0, 4), 10) || new Date().getFullYear();
            // Delete existing rows for this ticker+year (refresh)
            await env.DB.prepare(
              "DELETE FROM revenue_segmentation WHERE ticker = ? AND fiscal_year = ?"
            ).bind(p.ticker, fiscalYear).run();
            let total = 0;
            for (const k of Object.keys(regions)) {
              if (k === "date" || k === "symbol") continue;
              const v = Number(regions[k]);
              if (!isNaN(v) && v > 0) total += v;
            }
            if (total <= 0) return { ticker: p.ticker, ok: false };
            for (const region of Object.keys(regions)) {
              if (region === "date" || region === "symbol") continue;
              const v = Number(regions[region]);
              if (isNaN(v) || v <= 0) continue;
              await env.DB.prepare(
                `INSERT INTO revenue_segmentation (ticker, fiscal_year, region, revenue_usd, pct_of_total, confidence, source)
                 VALUES (?, ?, ?, ?, ?, 'high', 'fmp-segmentation')`
              ).bind(p.ticker, fiscalYear, region, v, v / total).run();
            }
            return { ticker: p.ticker, ok: true };
          }));
          for (const r of results) {
            if (r.status === "fulfilled" && r.value?.ok) cached++; else failed++;
          }
          if (i + 4 < positions.length) await new Promise(r => setTimeout(r, 600));
        }
        return json({ ok: true, cached, failed, total: positions.length }, corsHeaders);
      }
      if (path === "/api/currency/exposure" && request.method === "GET") {
        // Region-to-currency mapping (seed)
        const REGION_CCY = {
          // Americas
          "United States": { USD: 1.0 },
          "North America": { USD: 0.9, CAD: 0.1 },
          "Canada": { CAD: 1.0 },
          "Latin America": { USD: 0.3, BRL: 0.4, MXN: 0.3 },
          "South America": { USD: 0.3, BRL: 0.4, MXN: 0.3 },
          "Americas": { USD: 0.85, CAD: 0.08, BRL: 0.07 },
          // Europe
          "Europe": { EUR: 0.65, GBP: 0.20, CHF: 0.10, Other: 0.05 },
          "European Union": { EUR: 0.85, Other: 0.15 },
          "EMEA": { EUR: 0.55, GBP: 0.15, Other: 0.30 },
          "Germany": { EUR: 1.0 },
          "France": { EUR: 1.0 },
          "Spain": { EUR: 1.0 },
          "Italy": { EUR: 1.0 },
          "United Kingdom": { GBP: 1.0 },
          "Switzerland": { CHF: 1.0 },
          // Asia
          "Asia Pacific": { JPY: 0.35, CNY: 0.25, HKD: 0.10, AUD: 0.15, Other: 0.15 },
          "Asia": { CNY: 0.35, JPY: 0.30, HKD: 0.10, Other: 0.25 },
          "Greater China": { CNY: 0.60, HKD: 0.35, TWD: 0.05 },
          "China": { CNY: 1.0 },
          "Hong Kong": { HKD: 1.0 },
          "Japan": { JPY: 1.0 },
          "Australia": { AUD: 1.0 },
          // Fallback
          "International": { EUR: 0.35, JPY: 0.20, GBP: 0.15, CNY: 0.15, Other: 0.15 },
          "Rest of World": { EUR: 0.35, JPY: 0.20, GBP: 0.15, CNY: 0.15, Other: 0.15 },
          "Other": { Other: 1.0 },
        };
        const { results: positions } = await env.DB.prepare(
          "SELECT ticker, name, market_value, usd_value, currency FROM positions WHERE shares > 0"
        ).all();
        const { results: segRows } = await env.DB.prepare(
          `SELECT ticker, region, pct_of_total FROM revenue_segmentation rs
           WHERE fiscal_year = (SELECT MAX(fiscal_year) FROM revenue_segmentation WHERE ticker = rs.ticker)`
        ).all();
        const byTicker = {};
        for (const r of (segRows || [])) {
          if (!byTicker[r.ticker]) byTicker[r.ticker] = [];
          byTicker[r.ticker].push({ region: r.region, pct: r.pct_of_total });
        }
        const byCurrency = {};
        const coverage = {};
        let totalUsd = 0;
        let highConfUsd = 0;
        for (const p of positions) {
          const posValue = p.usd_value || p.market_value || 0;
          totalUsd += posValue;
          const segs = byTicker[p.ticker];
          if (segs && segs.length > 0) {
            coverage[p.ticker] = "high";
            highConfUsd += posValue;
            for (const s of segs) {
              const mapping = REGION_CCY[s.region] || REGION_CCY["Other"];
              for (const ccy of Object.keys(mapping)) {
                const share = posValue * s.pct * mapping[ccy];
                byCurrency[ccy] = (byCurrency[ccy] || 0) + share;
              }
            }
          } else {
            // Fallback: use listing currency of the position as a rough proxy
            coverage[p.ticker] = "low";
            const ccy = p.currency || "USD";
            byCurrency[ccy] = (byCurrency[ccy] || 0) + posValue;
          }
        }
        const byCurrencyArr = Object.entries(byCurrency)
          .map(([ccy, value]) => ({ currency: ccy, value_usd: value, pct: totalUsd > 0 ? (value / totalUsd) * 100 : 0 }))
          .sort((a, b) => b.value_usd - a.value_usd);
        return json({
          total_usd: totalUsd,
          by_currency: byCurrencyArr,
          high_confidence_pct: totalUsd > 0 ? (highConfUsd / totalUsd) * 100 : 0,
          coverage,
        }, corsHeaders);
      }

      // ── Macro Calendar MVP ──
      //
      // POST /api/macro/refresh — pull upcoming economic events from FMP
      // GET  /api/macro/upcoming?days=14 — upcoming events + user exposure
      if (path === "/api/macro/refresh" && request.method === "POST") {
        const key = env.FMP_KEY;
        if (!key) return json({ error: "no FMP key" }, corsHeaders, 500);
        // Ensure seeds for event_sector_mapping exist
        const MAPPING_SEED = [
          ["FOMC Decision", ["Financial Services", "Real Estate", "Utilities"], ["Consumer Cyclical"], "Decisiones de tipos de la Fed. Afectan descuento de cash flows futuros.", "REITs y utilities sufren con subidas. Financieras se benefician.", "No operar en el día del anuncio. Esperar dirección."],
          ["FOMC Minutes", ["Financial Services", "Real Estate"], [], "Minutas con dirección hawkish/dovish.", "Movimientos moderados según tono.", "Revisar dirección, no operar reactivo."],
          ["CPI", ["Consumer Defensive", "Real Estate", "Utilities"], ["Consumer Cyclical"], "Inflación. Impacta decisión Fed.", "CPI alto = risk-off. Bajo = rally duration.", "Esperar a ver reacción del mercado antes de actuar."],
          ["Core CPI", ["Consumer Defensive", "Real Estate"], [], "CPI subyacente sin energía/alimentos.", "Señal más limpia de inflación estructural.", "Mismo que CPI."],
          ["Core PCE", ["Consumer Defensive", "Real Estate"], [], "Medida inflación preferida de la Fed.", "Cualquier sorpresa mueve mucho rates.", "Vigilar reacción de TLT como proxy."],
          ["Unemployment Rate", ["Consumer Cyclical", "Financial Services"], [], "Salud laboral US.", "Paro alto = recesión signal, defensivos suben.", "Si sube mucho, revisar exposición cíclica."],
          ["Non Farm Payrolls", ["Financial Services", "Consumer Cyclical"], [], "Empleos netos US mensuales.", "Fuerte = Fed hawkish, rally financieras. Débil = defensive rotation.", "Esperar a la reacción de TLT y XLF."],
          ["NFP", ["Financial Services", "Consumer Cyclical"], [], "Non-Farm Payrolls abreviado.", "Igual que NFP completo.", "Igual que NFP."],
          ["GDP", ["Industrials", "Consumer Cyclical", "Financial Services"], [], "Crecimiento económico.", "Sorpresa positiva rally cíclicas.", "Revisar exposición cíclica post-release."],
          ["Retail Sales", ["Consumer Cyclical", "Consumer Defensive"], [], "Gasto del consumidor.", "Fuerte = risk-on consumer. Débil = defensive rotation.", "Ver reacción XLY/XLP."],
          ["PPI", ["Industrials", "Consumer Defensive"], [], "Precios productor — señal adelantada inflación.", "Alto = márgenes comprimidos.", "Revisar empresas con debt refinancing cercano."],
          ["ISM Manufacturing PMI", ["Industrials", "Basic Materials"], [], "Confianza manufacturera.", "<50 = contracción, cíclicas sufren.", "Vigilar posiciones industriales."],
          ["Crude Oil Inventories", ["Energy"], [], "Inventarios petróleo US.", "Afecta price action XLE.", "Solo relevante si tienes energéticas pesadas."],
          ["ECB Decision", ["Financial Services", "Real Estate"], [], "Tipos BCE.", "Afecta EUR/USD y bancos europeos.", "Revisar exposición europea."],
          ["BOJ Decision", ["Financial Services"], [], "Tipos Banco de Japón.", "Afecta JPY y carry trades.", "Revisar yen exposure."],
        ];
        for (const row of MAPPING_SEED) {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO event_sector_mapping
               (event_type, primary_sectors_json, secondary_sectors_json, rationale, typical_reaction, user_action_advice)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(row[0], JSON.stringify(row[1]), JSON.stringify(row[2]), row[3], row[4], row[5]).run();
        }
        const today = new Date().toISOString().slice(0, 10);
        const plus30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const url2 = `https://financialmodelingprep.com/stable/economic-calendar?from=${today}&to=${plus30}&apikey=${key}`;
        const resp = await fetch(url2);
        if (!resp.ok) return json({ error: "fmp fetch failed", status: resp.status }, corsHeaders, 500);
        const data = await resp.json();
        if (!Array.isArray(data)) return json({ error: "unexpected FMP shape" }, corsHeaders, 500);
        const COUNTRIES = new Set(["US", "EU", "CN", "JP", "GB", "DE"]);
        const IMPACTS = new Set(["Medium", "High", "medium", "high"]);
        const normEventType = (name) => {
          const s = String(name || "").toLowerCase();
          if (/fomc/.test(s) && /minute/.test(s)) return "FOMC Minutes";
          if (/fomc|fed.*rate|interest rate decision.*us/.test(s)) return "FOMC Decision";
          if (/core cpi/.test(s)) return "Core CPI";
          if (/core pce/.test(s)) return "Core PCE";
          if (/\bcpi\b/.test(s)) return "CPI";
          if (/non.?farm|\bnfp\b/.test(s)) return "Non Farm Payrolls";
          if (/unemploy/.test(s)) return "Unemployment Rate";
          if (/gdp/.test(s)) return "GDP";
          if (/retail sales/.test(s)) return "Retail Sales";
          if (/\bppi\b|producer price/.test(s)) return "PPI";
          if (/ism manufactur/.test(s)) return "ISM Manufacturing PMI";
          if (/crude oil inven/.test(s)) return "Crude Oil Inventories";
          if (/ecb.*rate|ecb.*decision/.test(s)) return "ECB Decision";
          if (/boj.*rate|boj.*decision|bank of japan/.test(s)) return "BOJ Decision";
          return null;
        };
        let inserted = 0;
        for (const ev of data) {
          const country = ev.country || "";
          const impact = ev.impact || "";
          if (!COUNTRIES.has(country)) continue;
          if (!IMPACTS.has(impact)) continue;
          const eventType = normEventType(ev.event);
          if (!eventType) continue;
          const date = String(ev.date || "").slice(0, 10);
          const time = String(ev.date || "").slice(11, 16);
          try {
            await env.DB.prepare(
              `INSERT OR REPLACE INTO macro_events
                 (event_date, event_time, country, event_type, event_name, consensus_estimate, previous_value, actual_value, impact_level, status, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', datetime('now'))`
            ).bind(
              date, time, country, eventType, ev.event || "",
              String(ev.estimate || ev.consensus || ""),
              String(ev.previous || ""),
              String(ev.actual || ""),
              String(impact).toLowerCase()
            ).run();
            inserted++;
          } catch {}
        }
        return json({ ok: true, inserted, total_from_fmp: data.length }, corsHeaders);
      }
      if (path === "/api/macro/upcoming" && request.method === "GET") {
        const days = parseInt(url.searchParams.get("days") || "14", 10);
        const today = new Date().toISOString().slice(0, 10);
        const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
        const { results: events } = await env.DB.prepare(
          `SELECT e.*, m.primary_sectors_json, m.secondary_sectors_json, m.rationale, m.typical_reaction, m.user_action_advice
           FROM macro_events e
           LEFT JOIN event_sector_mapping m ON m.event_type = e.event_type
           WHERE e.event_date >= ? AND e.event_date <= ?
           ORDER BY e.event_date ASC, e.event_time ASC`
        ).bind(today, until).all();

        // Current portfolio by sector
        const { results: positions } = await env.DB.prepare(
          "SELECT ticker, sector, market_value, usd_value FROM positions WHERE shares > 0"
        ).all();
        const bySector = {};
        let totalValue = 0;
        for (const p of positions) {
          const v = p.usd_value || p.market_value || 0;
          totalValue += v;
          const s = p.sector || "Unknown";
          if (!bySector[s]) bySector[s] = { value: 0, tickers: [] };
          bySector[s].value += v;
          bySector[s].tickers.push({ ticker: p.ticker, value: v });
        }
        const sectorPct = {};
        for (const s of Object.keys(bySector)) sectorPct[s] = totalValue > 0 ? (bySector[s].value / totalValue) * 100 : 0;

        // For each event compute exposure
        const enriched = (events || []).map(e => {
          const primarySectors = e.primary_sectors_json ? JSON.parse(e.primary_sectors_json) : [];
          const matchedSectors = primarySectors.filter(s => sectorPct[s] !== undefined);
          const exposurePct = matchedSectors.reduce((sum, s) => sum + (sectorPct[s] || 0), 0);
          const affectedTickers = matchedSectors.flatMap(s => (bySector[s]?.tickers || []).map(t => t.ticker));
          let exposureLevel = "low";
          if (exposurePct >= 30) exposureLevel = "high";
          else if (exposurePct >= 15) exposureLevel = "medium";
          return {
            ...e,
            primary_sectors: primarySectors,
            exposure_pct: Math.round(exposurePct * 10) / 10,
            exposure_level: exposureLevel,
            affected_tickers: affectedTickers.slice(0, 10),
          };
        });

        return json({
          events: enriched,
          portfolio_sectors: sectorPct,
          total_value_usd: totalValue,
        }, corsHeaders);
      }

      // ─── AI AGENTS ──────────────────────────────────────────────

      // GET /api/fmp-map-check — validate FMP_MAP entries by querying FMP profile.
      // Catches relistings, ticker changes, and stale mappings before they corrupt scoring.
      // Run weekly via manual trigger or scheduled task.
      if (path === "/api/fmp-map-check" && request.method === "GET") {
        const key = env.FMP_KEY;
        if (!key) return json({ error: "no FMP key" }, corsHeaders, 500);
        const results = [];
        for (const [ourTicker, fmpSym] of Object.entries(FMP_MAP)) {
          try {
            const url2 = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(fmpSym)}&apikey=${key}`;
            const resp = await fetch(url2);
            const data = await resp.json();
            const ok = Array.isArray(data) && data.length > 0 && data[0]?.symbol;
            results.push({
              ours: ourTicker,
              fmp: fmpSym,
              ok,
              actualSymbol: ok ? data[0].symbol : null,
              name: ok ? data[0].companyName : null,
              status: ok ? "valid" : "INVALID — needs review",
            });
          } catch (e) {
            results.push({ ours: ourTicker, fmp: fmpSym, ok: false, status: `error: ${e.message}` });
          }
          await new Promise(r => setTimeout(r, 200)); // light rate limit
        }
        const invalid = results.filter(r => !r.ok);
        // Persist last check timestamp for monitoring
        try {
          await setAgentMemory(env, "fmp_map_last_check", { ts: Date.now(), invalid: invalid.length, total: results.length });
        } catch {}
        return json({ ok: invalid.length === 0, total: results.length, invalid: invalid.length, results }, corsHeaders);
      }

      // GET /api/agent-insights — retrieve agent insights
      if (path === "/api/agent-insights" && request.method === "GET") {
        const agent = url.searchParams.get("agent");
        const severity = url.searchParams.get("severity");
        const ticker = url.searchParams.get("ticker");
        const days = parseInt(url.searchParams.get("days") || "7", 10);
        const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

        let sql = "SELECT * FROM agent_insights WHERE fecha >= ?";
        const params = [since];
        if (agent) { sql += " AND agent_name = ?"; params.push(agent); }
        if (severity) { sql += " AND severity = ?"; params.push(severity); }
        if (ticker) { sql += " AND ticker = ?"; params.push(ticker); }
        sql += " ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, fecha DESC LIMIT 200";

        const { results } = await env.DB.prepare(sql).bind(...params).all();
        const parsed = results.map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : {} }));
        return json({ insights: parsed, count: parsed.length }, corsHeaders);
      }

      // DELETE /api/agent-insights?id=X — delete a stale insight
      if (path === "/api/agent-insights" && request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "Missing id" }, corsHeaders, 400);
        await env.DB.prepare("DELETE FROM agent_insights WHERE id = ?").bind(id).run();
        return json({ ok: true, deleted: id }, corsHeaders);
      }

      // POST /api/agent-run — manual trigger (single agent sync, or all in background)
      if (path === "/api/agent-run" && request.method === "POST") {
        await ensureMigrations(env);
        const agentParam = url.searchParams.get("agent");
        const fecha = new Date().toISOString().slice(0, 10);
        if (agentParam) {
          // Run single agent synchronously for testing
          const agentMap = {
            regime: runRegimeAgent, earnings: runEarningsAgent, dividend: runDividendAgent,
            macro: runMacroAgent, risk: runRiskAgent, trade: runTradeAgent, postmortem: runPostmortemAgent,
            cache: async (env, fecha) => ({ agent: "cache", data: await cacheMarketIndicators(env) }),
            'fmp-fin': async (env, fecha) => {
              const offset = parseInt(url.searchParams.get('offset') || '0', 10);
              const limit = parseInt(url.searchParams.get('limit') || '0', 10);
              return { agent: "fmp-fin", ...(await cacheFmpFinancials(env, { offset, limit })) };
            },
            'risk-metrics': async (env, fecha) => {
              const offset = parseInt(url.searchParams.get('offset') || '0', 10);
              const limit = parseInt(url.searchParams.get('limit') || '0', 10);
              return { agent: "risk-metrics", ...(await cacheRiskMetrics(env, { offset, limit })) };
            },
            'dividend-history': async (env, fecha) => {
              const offset = parseInt(url.searchParams.get('offset') || '0', 10);
              const limit = parseInt(url.searchParams.get('limit') || '0', 10);
              return { agent: "dividend-history", ...(await cacheDividendHistory(env, { offset, limit })) };
            },
            'quality-safety': async (env, fecha) => {
              const offset = parseInt(url.searchParams.get('offset') || '0', 10);
              const limit = parseInt(url.searchParams.get('limit') || '0', 10);
              return { agent: "quality-safety", ...(await computeQualitySafetyAll(env, { offset, limit })) };
            },
            gf: async (env, fecha) => ({ agent: "gf", ...(await cacheGuruFocusData(env)) }),
            'gf-trends': async (env, fecha) => {
              const token = env.GURUFOCUS_TOKEN;
              if (!token) return { error: 'no GF token' };
              const base = `https://api.gurufocus.com/public/user/${token}`;
              const { results: positions } = await env.DB.prepare("SELECT ticker FROM positions WHERE shares > 0").all();
              let trends = 0;
              for (let i = 0; i < positions.length; i += 3) {
                const batch = positions.slice(i, i + 3);
                const results = await Promise.allSettled(batch.map(async (p) => {
                  const sym = p.ticker.replace(/^(BME:|HKG:|LSE:)/, '');
                  try {
                    const resp = await fetch(`${base}/stock/${sym}/financials`);
                    if (!resp.ok) return null;
                    const data = await resp.json();
                    const fin = data?.financials?.quarterly || {};
                    const periods = fin['Fiscal Year'] || [];
                    const income = fin.income_statement || {};
                    const cf = fin.cashflow_statement || {};
                    const bs = fin.balance_sheet || {};
                    const n = Math.min(8, periods.length);
                    if (n < 4) return null;
                    const toNum = v => { try { return parseFloat(String(v).replace(/,/g,'')); } catch { return null; } };
                    return { ticker: p.ticker, trend: {
                      periods: periods.slice(-n).reverse(),
                      revenue: (income.Revenue || []).slice(-n).reverse().map(toNum),
                      fcf: (cf['Free Cash Flow'] || []).slice(-n).reverse().map(toNum),
                      debt: (bs['Long-Term Debt'] || bs['Total Long-Term Debt'] || []).slice(-n).reverse().map(toNum),
                      dividendsPaid: (cf['Dividends Paid'] || cf['Payment of Dividends and Other Cash Distributions'] || []).slice(-n).reverse().map(toNum),
                    }};
                  } catch { return null; }
                }));
                for (const r of results) {
                  if (r.status === 'fulfilled' && r.value) {
                    const existing = await env.DB.prepare("SELECT data FROM gurufocus_cache WHERE ticker = ?").bind(r.value.ticker).first();
                    let merged = existing?.data ? JSON.parse(existing.data) : {};
                    merged.trend = r.value.trend;
                    await env.DB.prepare(`INSERT INTO gurufocus_cache (ticker, data, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(ticker) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`).bind(r.value.ticker, JSON.stringify(merged)).run();
                    trends++;
                  }
                }
                if (i + 3 < positions.length) await new Promise(r => setTimeout(r, 1500));
              }
              return { agent: 'gf-trends', trends, total: positions.length };
            },
            insider: runInsiderAgent,
            value: runValueSignalsAgent,
            options: runOptionsIncomeAgent,
            dividend_cut_warning: runDividendCutWarningAgent,
            analyst_downgrade: runAnalystDowngradeAgent,
            earnings_trend: runEarningsTrendAgent,
            sec_filings: runSECFilingsAgent,
            summary: async (env, fecha) => {
              const { results: all } = await env.DB.prepare(
                "SELECT agent_name, ticker, severity, title, summary, score, details FROM agent_insights WHERE fecha = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, score DESC"
              ).bind(fecha).all();
              const trades = all.filter(i => i.agent_name === 'trade' && i.severity !== 'info');
              const opts = all.filter(i => i.agent_name === 'options' && i.score > 3);
              const ins = all.filter(i => i.agent_name === 'insider' && i.severity !== 'info');
              const reg = all.find(i => i.agent_name === 'regime');
              const crits = all.filter(i => i.severity === 'critical');
              const rd = reg?.details ? JSON.parse(reg.details) : {};
              const lines = [];
              if (reg) lines.push(`Mercado: ${rd.regime || '?'} (${rd.actionGuidance || '?'})`);
              if (trades.length) lines.push(`Operaciones: ${trades.slice(0,3).map(t=>t.title).join(', ')}`);
              if (opts.length) lines.push(`Opciones: ${opts.slice(0,2).map(o=>o.title).join(', ')}`);
              if (ins.length) lines.push(`Insiders: ${ins.length} alertas`);
              await storeInsights(env, "summary", fecha, [{ ticker: '_SUMMARY_', severity: crits.length > 5 ? 'critical' : crits.length > 0 ? 'warning' : 'info', title: `Resumen: ${crits.length} criticos, ${all.filter(i=>i.severity==='warning').length} warnings`, summary: lines.join(' | ') || 'Sin alertas.', details: { totalInsights: all.length, criticals: crits.length, topActions: trades.slice(0,5).map(t=>t.title), topOptions: opts.slice(0,3).map(o=>o.title), insiderAlerts: ins.length, regime: reg?.title || 'N/A' }, score: crits.length > 5 ? 2 : crits.length > 0 ? 5 : 8 }]);
              return { agent: "summary", criticals: crits.length, trades: trades.length, options: opts.length, insiders: ins.length };
            },
          };
          const fn = agentMap[agentParam];
          if (!fn) return json({ error: `Unknown agent: ${agentParam}` }, corsHeaders, 400);
          try {
            const result = await fn(env, fecha);
            return json({ ok: true, ...result }, corsHeaders);
          } catch (e) {
            return json({ error: e.message, stack: e.stack?.split('\n').slice(0, 3) }, corsHeaders, 500);
          }
        }
        // ── Manual "run all" trigger — instrumented so the frontend can poll status ──
        // Check if another run is already in progress (prevents double-click from user)
        const existingStatus = (await getAgentMemory(env, "agent_run_status")) || {};
        if (existingStatus.state === "running") {
          // Timeout old runs > 15 minutes (pipeline shouldn't take that long)
          const startedMs = Date.parse(existingStatus.started_at || 0);
          if (startedMs && (Date.now() - startedMs) < 15 * 60 * 1000) {
            return json({
              ok: false,
              already_running: true,
              message: "Ya hay una ejecución en curso — espera a que termine antes de relanzar.",
              started_at: existingStatus.started_at,
            }, corsHeaders);
          }
        }
        // Mark as running BEFORE ctx.waitUntil so the client sees the state immediately
        await setAgentMemory(env, "agent_run_status", {
          state: "running",
          started_at: new Date().toISOString(),
          finished_at: null,
          duration_s: null,
          agents_ok: null,
          agents_failed: null,
          fecha,
          last_result: null,
        });
        // Run all in background
        ctx.waitUntil((async () => {
          const t0 = Date.now();
          let outcome;
          try {
            const result = await runAllAgents(env);
            outcome = {
              state: "completed",
              started_at: new Date(t0).toISOString(),
              finished_at: new Date().toISOString(),
              duration_s: Math.round((Date.now() - t0) / 1000),
              agents_ok: Object.entries(result || {}).filter(([k, v]) => v && !v.error).length,
              agents_failed: Object.entries(result || {}).filter(([k, v]) => v && v.error).length,
              fecha,
              last_result: result,
            };
            console.log("Manual agent run completed:", JSON.stringify({ duration_s: outcome.duration_s, ok: outcome.agents_ok, failed: outcome.agents_failed }));
          } catch (e) {
            outcome = {
              state: "failed",
              started_at: new Date(t0).toISOString(),
              finished_at: new Date().toISOString(),
              duration_s: Math.round((Date.now() - t0) / 1000),
              error: e.message,
              fecha,
              last_result: null,
            };
            console.error("Manual agent run failed:", e.message);
          }
          try { await setAgentMemory(env, "agent_run_status", outcome); } catch {}
        })());
        return json({
          ok: true,
          state: "running",
          message: "Agentes lanzados en background (~2-5 min). Poll /api/agent-run/status para progreso.",
          started_at: new Date().toISOString(),
        }, corsHeaders);
      }

      // ── User preferences (cross-device persistence via D1 agent_memory) ──
      //
      // GET  /api/preferences        → all prefs as { key: value } map
      // GET  /api/preferences/:key   → single preference value
      // POST /api/preferences        body { key, value }
      //
      // Storage: agent_memory table with key prefix "pref_*". Single-user
      // system so no auth needed. Keys used so far:
      //   pref_ui_home_tabs_order  — array of tab ids in desired render order
      //   pref_ui_theme            — "light" | "dark"  (future)
      //   pref_ui_display_ccy      — "USD" | "EUR" ...  (future)
      if (path === "/api/preferences" && request.method === "GET") {
        try {
          const { results } = await env.DB.prepare(
            "SELECT id, data FROM agent_memory WHERE id LIKE 'pref_%'"
          ).all();
          const prefs = {};
          for (const row of (results || [])) {
            const key = row.id.slice(5); // strip 'pref_' prefix
            try { prefs[key] = JSON.parse(row.data); } catch { prefs[key] = null; }
          }
          return json({ preferences: prefs }, corsHeaders);
        } catch (e) {
          return json({ error: e.message }, corsHeaders, 500);
        }
      }
      if (path.startsWith("/api/preferences/") && request.method === "GET") {
        const key = decodeURIComponent(path.slice("/api/preferences/".length));
        if (!key || !/^[a-z0-9_]+$/i.test(key)) {
          return json({ error: "invalid key" }, corsHeaders, 400);
        }
        const value = await getAgentMemory(env, `pref_${key}`);
        return json({ key, value: value ?? null }, corsHeaders);
      }
      if (path === "/api/preferences" && request.method === "POST") {
        try {
          const body = await request.json();
          const key = String(body.key || "").trim();
          if (!key || !/^[a-z0-9_]+$/i.test(key)) {
            return json({ error: "invalid key (a-z, 0-9, _)" }, corsHeaders, 400);
          }
          if (key.length > 60) return json({ error: "key too long" }, corsHeaders, 400);
          const value = body.value;
          // Accept any JSON-serializable value (array, object, string, number, boolean, null)
          await setAgentMemory(env, `pref_${key}`, value);
          return json({ ok: true, key, value }, corsHeaders);
        } catch (e) {
          return json({ error: e.message }, corsHeaders, 500);
        }
      }

      // GET /api/agents/health — detailed agent-level health for the last run.
      // Returns per-agent: ran today? last success timestamp? insight count?
      // Useful to spot which specific agent is silently failing.
      if (path === "/api/agents/health" && request.method === "GET") {
        const todayUtc = new Date().toISOString().slice(0, 10);
        const yesterdayUtc = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const ALL_AGENTS = [
          "regime", "earnings", "dividend", "risk", "macro", "trade",
          "postmortem", "insider", "value", "options",
          "dividend_cut_warning", "analyst_downgrade", "earnings_trend",
          "sec_filings", "summary",
        ];
        // Get insight counts by agent for today and yesterday
        const counts = {};
        for (const fecha of [todayUtc, yesterdayUtc]) {
          counts[fecha] = {};
          try {
            const { results } = await env.DB.prepare(
              "SELECT agent_name, COUNT(*) as c FROM agent_insights WHERE fecha = ? GROUP BY agent_name"
            ).bind(fecha).all();
            for (const r of (results || [])) counts[fecha][r.agent_name] = r.c;
          } catch {}
        }
        const health = ALL_AGENTS.map(name => {
          const todayCount = counts[todayUtc][name] || 0;
          const yesterdayCount = counts[yesterdayUtc][name] || 0;
          const ranToday = todayCount > 0;
          const ranYesterday = yesterdayCount > 0;
          // Postmortem legitimately writes 0 insights when no signals are due
          const excusedZero = name === "postmortem";
          let status;
          if (ranToday) status = "ok";
          else if (excusedZero && ranYesterday) status = "idle_ok"; // fine, just nothing to report
          else if (ranYesterday) status = "missing_today";
          else status = "missing";
          return {
            agent: name,
            status,
            insights_today: todayCount,
            insights_yesterday: yesterdayCount,
          };
        });
        const missing = health.filter(h => h.status === "missing" || h.status === "missing_today").map(h => h.agent);
        const ranCount = health.filter(h => h.status === "ok").length;
        return json({
          fecha: todayUtc,
          total_agents: ALL_AGENTS.length,
          ran_today: ranCount,
          missing_today: missing,
          health,
        }, corsHeaders);
      }

      // GET /api/agent-run/status — current state + last completed run metadata
      // Used by the frontend button to poll progress and show "Last run: Xh ago"
      if (path === "/api/agent-run/status" && request.method === "GET") {
        const status = (await getAgentMemory(env, "agent_run_status")) || { state: "never_run" };
        // Compute human-readable age in seconds (for the frontend)
        let age_s = null;
        if (status.finished_at) {
          age_s = Math.round((Date.now() - Date.parse(status.finished_at)) / 1000);
        } else if (status.started_at) {
          age_s = Math.round((Date.now() - Date.parse(status.started_at)) / 1000);
        }
        // Count insights generated today (UTC) as a sanity check
        const todayUtc = new Date().toISOString().slice(0, 10);
        let insights_today = 0;
        try {
          const row = await env.DB.prepare(
            "SELECT COUNT(*) as c FROM agent_insights WHERE fecha = ?"
          ).bind(todayUtc).first();
          insights_today = row?.c || 0;
        } catch {}
        return json({
          ...status,
          age_s,
          insights_today,
          now_utc: new Date().toISOString(),
        }, corsHeaders);
      }

      // GET /api/tastytrade-test — verify Tastytrade API connection
      if (path === "/api/tastytrade-test" && request.method === "GET") {
        try {
          const ttResp = await fetch("https://api.tastyworks.com/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "AyR/1.0" },
            body: JSON.stringify({ login: env.TASTYTRADE_USER || "", password: env.TASTYTRADE_PASS || "" }),
          });
          const raw = await ttResp.text();
          let ttData;
          try { ttData = JSON.parse(raw); } catch { return json({ error: "Tastytrade returned non-JSON", status: ttResp.status, body: raw.slice(0, 300) }, corsHeaders, 502); }

          if (ttData?.data?.["session-token"]) {
            const token = ttData.data["session-token"];
            const accResp = await fetch("https://api.tastyworks.com/customers/me/accounts", {
              headers: { "Authorization": token, "User-Agent": "AyR/1.0" },
            });
            const accRaw = await accResp.text();
            let accData;
            try { accData = JSON.parse(accRaw); } catch { accData = {}; }
            const accounts = accData?.data?.items?.map(a => ({
              number: a["account-number"], type: a["account-type-name"], nickname: a.nickname,
            })) || [];
            return json({ ok: true, accounts, sessionValid: true }, corsHeaders);
          }
          return json({ error: "Login failed", status: ttResp.status, response: ttData }, corsHeaders, 401);
        } catch (e) {
          return json({ error: e.message }, corsHeaders, 500);
        }
      }

      // POST /api/download-transcripts — download earnings transcripts from FMP for all positions
      if (path === "/api/download-transcripts" && request.method === "POST") {
        const singleTicker = url.searchParams.get("ticker");
        try {
          await ensureMigrations(env);
          // Create transcripts table if not exists
          await env.DB.prepare(`CREATE TABLE IF NOT EXISTS earnings_transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            quarter TEXT NOT NULL,
            year INTEGER NOT NULL,
            content TEXT NOT NULL,
            date TEXT,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(ticker, quarter, year)
          )`).run();

          const tickers = singleTicker
            ? [singleTicker.toUpperCase()]
            : (await env.DB.prepare("SELECT ticker FROM positions WHERE shares > 0").all()).results.map(p => p.ticker.replace(/^(BME:|HKG:|LSE:)/, ''));

          const FMP = env.FMP_KEY;
          let downloaded = 0, failed = 0, skipped = 0;

          // Optional pagination via ?offset=N&limit=N for large portfolios (Workers 30s CPU limit)
          const offset = parseInt(url.searchParams.get('offset') || '0', 10);
          const limit = parseInt(url.searchParams.get('limit') || '0', 10);
          const slicedTickers = limit > 0 ? tickers.slice(offset, offset + limit) : tickers;

          // Quarters to try in parallel (covers companies on calendar or fiscal year offsets)
          const QUARTERS_TO_TRY = [
            [2025,4],[2025,3],[2025,2],[2025,1]
          ];

          // Process tickers in parallel batches of 4 (4 × 4 quarters = 16 parallel calls per batch)
          // FMP Ultimate has generous rate limits but bursts can trigger throttling
          for (let i = 0; i < slicedTickers.length; i += 4) {
            const batch = slicedTickers.slice(i, i + 4);
            const results = await Promise.allSettled(batch.map(async (sym) => {
              try {
                // Fetch all candidate quarters in parallel
                const candidates = await Promise.all(QUARTERS_TO_TRY.map(async ([yr, q]) => {
                  try {
                    const r = await fetch(`https://financialmodelingprep.com/stable/earning-call-transcript?symbol=${encodeURIComponent(sym)}&year=${yr}&quarter=${q}&apikey=${FMP}`);
                    if (!r.ok) return null;
                    const d = await r.json();
                    const records = Array.isArray(d) ? d : (d ? [d] : []);
                    for (const rec of records) {
                      const content = rec?.content || rec?.transcript;
                      if (content && content.length > 100) {
                        return { content, quarter: q, year: yr, date: rec.date || rec.publishedDate };
                      }
                    }
                    return null;
                  } catch { return null; }
                }));
                // Keep only the 2 most recent (QUARTERS_TO_TRY is already ordered newest-first)
                const transcripts = candidates.filter(Boolean).slice(0, 2);
                return { sym, transcripts };
              } catch (e) { return { sym, error: e.message }; }
            }));

            for (const r of results) {
              if (r.status !== 'fulfilled') { failed++; continue; }
              const { sym, transcripts, error } = r.value;
              if (error) { failed++; continue; }
              if (!transcripts?.length) { skipped++; continue; }

              for (const t of transcripts.slice(0, 4)) {
                const quarter = `Q${t.quarter || '?'}`;
                const year = t.year || 2024;
                const content = t.content || '';
                if (!content || content.length < 100) continue;
                // Store transcript (truncate to 15000 chars to fit D1)
                await env.DB.prepare(
                  `INSERT INTO earnings_transcripts (ticker, quarter, year, content, date, updated_at)
                   VALUES (?, ?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(ticker, quarter, year) DO UPDATE SET content=excluded.content, updated_at=datetime('now')`
                ).bind(sym, quarter, year, content.slice(0, 15000), t.date || null).run();
                downloaded++;
              }
            }
            if (i + 4 < slicedTickers.length) await new Promise(r => setTimeout(r, 800));
          }
          return json({ ok: true, downloaded, failed, skipped, tickers: tickers.length }, corsHeaders);
        } catch (e) {
          return json({ error: e.message }, corsHeaders, 500);
        }
      }

      // POST /api/enrich-sectors — fill missing sector data from GF + FMP
      if (path === "/api/enrich-sectors" && request.method === "POST") {
        try {
          const result = await enrichPositionSectors(env);
          return json({ ok: true, ...result }, corsHeaders);
        } catch (e) {
          return json({ error: e.message }, corsHeaders, 500);
        }
      }

      // GET /api/options-analysis?symbol=KO — deep options analysis for a specific ticker
      // Returns: IV rank, best CC/CSP strikes, timing assessment, theta decay
      if (path === "/api/options-analysis" && request.method === "GET") {
        const symbol = (url.searchParams.get("symbol") || "").toUpperCase().trim();
        if (!symbol) return json({ error: "Missing ?symbol=TICKER" }, corsHeaders, 400);

        try {
          // 1. Fetch options chain (30d and 45d expirations)
          const baseUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
          const resp1 = await fetchYahoo(baseUrl);
          if (!resp1.ok) return json({ error: `Yahoo returned ${resp1.status} for ${symbol}` }, corsHeaders, 502);
          const data1 = await resp1.json();
          const result = data1?.optionChain?.result?.[0];
          if (!result) return json({ error: `No options data for ${symbol}` }, corsHeaders, 404);

          const quote = result.quote || {};
          const price = quote.regularMarketPrice || 0;
          const expirations = result.expirationDates || [];
          const now = Math.floor(Date.now() / 1000);
          const earningsTs = quote.earningsTimestamp || quote.earningsTimestampStart;
          const earningsInDays = earningsTs ? Math.round((earningsTs - now) / 86400) : null;
          const fiftyTwoHigh = quote.fiftyTwoWeekHigh || price;
          const fiftyTwoLow = quote.fiftyTwoWeekLow || price;

          // 2. Get 2 expirations: ~30d and ~45d
          const targets = [30, 45];
          const chains = [];
          for (const targetDTE of targets) {
            const targetTs = now + targetDTE * 86400;
            let bestExp = expirations[0];
            for (const exp of expirations) {
              if (Math.abs(exp - targetTs) < Math.abs(bestExp - targetTs)) bestExp = exp;
            }
            const dte = Math.round((bestExp - now) / 86400);
            let options = result.options?.[0] || {};
            if (bestExp !== expirations[0]) {
              const r2 = await fetchYahoo(`${baseUrl}?date=${bestExp}`);
              if (r2.ok) {
                const d2 = await r2.json();
                options = d2?.optionChain?.result?.[0]?.options?.[0] || options;
              }
            }
            chains.push({ dte, expDate: new Date(bestExp * 1000).toISOString().split("T")[0], calls: options.calls || [], puts: options.puts || [] });
          }

          // 3. Calculate IV Rank (current ATM IV vs historical vol)
          const gfData = await getGfData(env, [symbol]);
          const gf = gfData[symbol] || {};
          const historicalVol = parseFloat(gf.volatility1y) || 25;

          // Get ATM IV from closest-to-money options
          const chain30 = chains[0];
          const atmCalls = chain30.calls.filter(c => Math.abs(c.strike - price) < price * 0.03);
          const atmPuts = chain30.puts.filter(p => Math.abs(p.strike - price) < price * 0.03);
          const allAtmIV = [...atmCalls, ...atmPuts].map(o => o.impliedVolatility).filter(v => v > 0);
          // Yahoo IV is decimal (0.25 = 25%), convert to percentage
          const currentIV = allAtmIV.length ? Math.round(allAtmIV.reduce((s, v) => s + v, 0) / allAtmIV.length * 10000) / 100 : null;
          // IV Rank: how current IV compares to historical vol. >100 = IV elevated, <100 = IV low
          const ivRatio = currentIV && historicalVol ? currentIV / historicalVol : null;
          const ivRank = ivRatio ? Math.round(Math.min(100, Math.max(0, (ivRatio - 0.5) * 100))) : null;
          const ivSignal = ivRank > 60 ? 'ALTA — momento optimo para vender' : ivRank > 30 ? 'MEDIA — aceptable para vender' : 'BAJA — esperar mejor momento';

          // 4. Position data
          const posRow = await env.DB.prepare("SELECT * FROM positions WHERE ticker = ?").bind(symbol).first();
          const shares = posRow?.shares || 0;
          const avgCost = posRow?.avg_price || 0;
          const divYield = posRow?.div_yield || 0;

          // 5. Analyze best CC and CSP for each expiration
          const strategies = [];

          for (const chain of chains) {
            const calls = chain.calls.filter(c => c.bid > 0 && !c.inTheMoney);
            const puts = chain.puts.filter(p => p.bid > 0 && !p.inTheMoney);

            // Best Covered Calls at different OTM levels
            for (const otmTarget of [0.03, 0.05, 0.08, 0.10]) {
              const targetStrike = price * (1 + otmTarget);
              const bestCC = calls.reduce((best, c) => {
                if (!best || Math.abs(c.strike - targetStrike) < Math.abs(best.strike - targetStrike)) return c;
                return best;
              }, null);
              if (bestCC && bestCC.bid >= 0.05) {
                const premium = bestCC.bid;
                const premPct = (premium / price * 100);
                const annualized = premPct * (365 / chain.dte);
                const otmPct = ((bestCC.strike - price) / price * 100);
                const probOTM = 100 - (bestCC.impliedVolatility ? Math.round(50 + otmPct / (bestCC.impliedVolatility * Math.sqrt(chain.dte / 365)) * 15) : 70);
                const theta = premium / chain.dte;
                strategies.push({
                  type: 'COVERED_CALL', expDate: chain.expDate, dte: chain.dte,
                  strike: bestCC.strike, otmPct: Math.round(otmPct * 10) / 10,
                  bid: bestCC.bid, ask: bestCC.ask || 0,
                  premium: Math.round(premium * 100) / 100,
                  premiumPct: Math.round(premPct * 100) / 100,
                  annualized: Math.round(annualized),
                  iv: bestCC.impliedVolatility ? Math.round(bestCC.impliedVolatility * 10000) / 100 : null,
                  openInterest: bestCC.openInterest || 0,
                  volume: bestCC.volume || 0,
                  thetaDaily: Math.round(theta * 100) / 100,
                  probOTM: Math.min(95, Math.max(40, probOTM)),
                  contractsAvailable: shares >= 100 ? Math.floor(shares / 100) : 0,
                  totalPremium: shares >= 100 ? Math.round(bestCC.bid * Math.floor(shares / 100) * 100) : 0,
                });
              }
            }

            // Best Cash Secured Puts at different OTM levels
            for (const otmTarget of [0.05, 0.08, 0.10, 0.15]) {
              const targetStrike = price * (1 - otmTarget);
              const bestCSP = puts.reduce((best, p) => {
                if (!best || Math.abs(p.strike - targetStrike) < Math.abs(best.strike - targetStrike)) return p;
                return best;
              }, null);
              if (bestCSP && bestCSP.bid >= 0.05) {
                const premium = bestCSP.bid;
                const premPct = (premium / bestCSP.strike * 100);
                const annualized = premPct * (365 / chain.dte);
                const otmPct = ((price - bestCSP.strike) / price * 100);
                const yocIfAssigned = posRow?.div_ttm ? (posRow.div_ttm / bestCSP.strike * 100) : (divYield * 100 * price / bestCSP.strike);
                strategies.push({
                  type: 'CASH_SECURED_PUT', expDate: chain.expDate, dte: chain.dte,
                  strike: bestCSP.strike, otmPct: Math.round(otmPct * 10) / 10,
                  bid: bestCSP.bid, ask: bestCSP.ask || 0,
                  premium: Math.round(premium * 100) / 100,
                  premiumPct: Math.round(premPct * 100) / 100,
                  annualized: Math.round(annualized),
                  iv: bestCSP.impliedVolatility ? Math.round(bestCSP.impliedVolatility * 10000) / 100 : null,
                  openInterest: bestCSP.openInterest || 0,
                  volume: bestCSP.volume || 0,
                  cashRequired: Math.round(bestCSP.strike * 100),
                  yocIfAssigned: Math.round(yocIfAssigned * 100) / 100,
                  belowAvgCost: avgCost ? bestCSP.strike < avgCost : null,
                });
              }
            }
          }

          // 6. Timing assessment
          let timing = 'NEUTRAL';
          let timingReason = [];
          if (ivRank > 60) { timing = 'FAVORABLE'; timingReason.push(`IV rank ${ivRank}% — volatilidad elevada, primas ricas`); }
          if (ivRank <= 30) { timing = 'DESFAVORABLE'; timingReason.push(`IV rank ${ivRank}% — volatilidad baja, primas pobres`); }
          if (earningsInDays && earningsInDays < 30) { timing = 'CUIDADO'; timingReason.push(`Earnings en ${earningsInDays} dias — riesgo IV crush`); }
          if (earningsInDays && earningsInDays > 30 && earningsInDays < 60) { timingReason.push(`Earnings en ${earningsInDays}d — vender antes del run-up de IV`); }
          if (price < fiftyTwoLow * 1.1) { timingReason.push('Cerca de minimos 52s — bueno para CSP'); }
          if (price > fiftyTwoHigh * 0.9) { timingReason.push('Cerca de maximos 52s — bueno para CC'); }

          return json({
            symbol, price, shares, avgCost,
            divYield: Math.round(divYield * 10000) / 100,
            fiftyTwoRange: `$${fiftyTwoLow.toFixed(2)} - $${fiftyTwoHigh.toFixed(2)}`,
            currentIV: currentIV ? Math.round(currentIV * 10) / 10 : null,
            historicalVol: Math.round(historicalVol * 10) / 10,
            ivRank,
            ivSignal,
            earningsInDays,
            timing, timingReason,
            gfScore: gf.gfScore, gfValuation: gf.gfValuation,
            strategies: strategies.sort((a, b) => (b.annualized || 0) - (a.annualized || 0)),
            recommendation: timing === 'FAVORABLE' ? 'Buen momento para vender opciones — IV elevada' :
              timing === 'CUIDADO' ? 'Esperar — earnings cercanos pueden causar movimiento brusco' :
              timing === 'DESFAVORABLE' ? 'Esperar — IV baja, primas no compensan el riesgo' :
              'Aceptable — primas moderadas',
          }, corsHeaders);
        } catch (e) {
          return json({ error: e.message }, corsHeaders, 500);
        }
      }

      // POST /api/ib-auto-sync — cloud-based trade/NLV sync (replaces Mac cron dependency)
      if (path === "/api/ib-auto-sync" && request.method === "POST") {
        try {
          await ensureMigrations(env);
          const result = await performAutoSync(env);
          return json(result, corsHeaders);
        } catch(e) {
          return json({ error: "Auto-sync error: " + e.message }, corsHeaders, 500);
        }
      }

      // POST /api/cache-pnl — fetch IB portfolio, compute STK P&L, cache in D1
      if (path === "/api/cache-pnl" && request.method === "POST") {
        try {
          const result = await cachePnlFromIB(env);
          return json(result, corsHeaders);
        } catch(e) {
          return json({ error: "cache-pnl error: " + e.message }, corsHeaders, 500);
        }
      }

      // GET /api/cached-pnl — return last cached P&L values
      if (path === "/api/cached-pnl" && request.method === "GET") {
        try {
          const row = await env.DB.prepare(
            "SELECT data, updated_at FROM price_cache WHERE id = '__pnl_cache__'"
          ).first();
          if (row && row.data) {
            return json({ ...JSON.parse(row.data), timestamp: row.updated_at }, corsHeaders);
          }
          return json({ pnl: 0, cost: 0, pnlPct: 0, timestamp: null }, corsHeaders);
        } catch(e) {
          return json({ pnl: 0, cost: 0, pnlPct: 0, timestamp: null }, corsHeaders);
        }
      }

      // POST /api/patrimonio/auto-snapshot — manually trigger auto patrimonio snapshot
      if (path === "/api/patrimonio/auto-snapshot" && request.method === "POST") {
        try {
          const result = await autoPatrimonioSnapshot(env, { force: true });
          return json(result, corsHeaders);
        } catch(e) {
          return json({ error: "Auto-snapshot error: " + e.message }, corsHeaders, 500);
        }
      }

      // 404
      return new Response(JSON.stringify({ error: "Not found", path }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (err) {
      const status = err instanceof BadBodyError ? 400 : 500;
      return new Response(JSON.stringify({ error: err.message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },

  // Cloudflare Cron Trigger — runs daily at 9:00 UTC (11:00 Madrid) Mon-Fri
  async scheduled(event, env, ctx) {
    try {
      await ensureMigrations(env);
      const result = await performAutoSync(env);
      console.log("IB auto-sync completed:", JSON.stringify(result));
    } catch(e) {
      console.error("IB auto-sync cron failed:", e.message);
    }
    // Cache P&L separately (auto-sync may succeed but P&L cache is independent)
    try {
      const pnlResult = await cachePnlFromIB(env);
      console.log("P&L cache completed:", JSON.stringify(pnlResult));
    } catch(e) {
      console.error("P&L cache cron failed:", e.message);
    }
    // Auto patrimonio snapshot on 1st-3rd of each month
    try {
      const patrimonioResult = await autoPatrimonioSnapshot(env);
      console.log("Patrimonio auto-snapshot:", JSON.stringify(patrimonioResult));
    } catch(e) {
      console.error("Patrimonio auto-snapshot failed:", e.message);
    }
    // Refresh div_ttm & div_yield for all positions (daily)
    try {
      const divResult = await refreshDivTTM(env);
      console.log("div_ttm refresh completed:", JSON.stringify(divResult));
    } catch(e) {
      console.error("div_ttm refresh failed:", e.message);
    }
    // Check dividend cuts/raises
    try {
      const divChangeResult = await checkDividendChanges(env);
      console.log("Dividend change check completed:", JSON.stringify(divChangeResult));
    } catch(e) {
      console.error("Dividend change check failed:", e.message);
    }
    // Run AI agents in background (takes ~5min due to rate limit delays)
    ctx.waitUntil((async () => {
      try {
        const agentResults = await runAllAgents(env);
        console.log("AI agents completed:", JSON.stringify(agentResults));
      } catch(e) {
        console.error("AI agents cron failed:", e.message);
      }
    })());
  },
};

// ═══════════════════════════════════════════════════════════════
// refreshDivTTM — update div_ttm & div_yield in positions table
// Uses same logic as /api/dividend-dps-live (annualized from last payment)
// ═══════════════════════════════════════════════════════════════
async function refreshDivTTM(env) {
  const positions = await env.DB.prepare(
    "SELECT ticker, shares, div_ttm, last_price FROM positions WHERE shares > 0"
  ).all();
  const tickers = (positions.results || []).map(p => p.ticker).filter(Boolean);
  if (!tickers.length) return { updated: 0, skipped: 0, total: 0 };

  const POS_TO_DIV_ALIASES = {
    "BME:VIS":["VIS","VIS.D","VISCOFAN"],"BME:AMS":["AMS","AMS.D"],
    "HKG:9618":["9618","JD"],"HKG:1052":["1052"],"HKG:1910":["1910"],
    "HKG:2219":["2219"],"HKG:9616":["9616"],
    "IIPR-PRA":["IIPR PRA","IIPRPRA"],
  };

  // Fetch recent dividends (14 months)
  const recentDate = new Date(Date.now() - 420 * 86400000).toISOString().slice(0, 10);
  const recentDivs = await env.DB.prepare(
    "SELECT ticker, fecha, bruto, shares FROM dividendos WHERE fecha >= ? ORDER BY fecha DESC"
  ).bind(recentDate).all();

  const paymentsByTicker = {};
  for (const row of (recentDivs.results || [])) {
    if (!paymentsByTicker[row.ticker]) paymentsByTicker[row.ticker] = [];
    paymentsByTicker[row.ticker].push(row);
  }

  const findPayments = (ticker) => {
    if (paymentsByTicker[ticker]?.length) return paymentsByTicker[ticker];
    const aliases = POS_TO_DIV_ALIASES[ticker];
    if (aliases) {
      for (const alt of aliases) {
        if (paymentsByTicker[alt]?.length) return paymentsByTicker[alt];
      }
    }
    return [];
  };

  const deduplicateByDate = (payments) => {
    const byDate = {};
    for (const p of payments) {
      if (!byDate[p.fecha]) byDate[p.fecha] = { ...p, bruto: 0, neto: 0 };
      byDate[p.fecha].bruto += (p.bruto || 0);
      byDate[p.fecha].neto += (p.neto || 0);
    }
    return Object.values(byDate).sort((a, b) => b.fecha.localeCompare(a.fecha));
  };

  const detectFrequency = (payments) => {
    const deduped = deduplicateByDate(payments);
    if (deduped.length < 2) return { freq: "quarterly", n: 4 };
    const ttmCutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const ttmDeduped = deduped.filter(p => p.fecha >= ttmCutoff);
    const count = ttmDeduped.length;
    if (count >= 11) return { freq: "monthly", n: 12 };
    if (count >= 6) return { freq: "quarterly", n: 4 };
    if (count >= 3) return { freq: "quarterly", n: 4 };
    if (deduped.length >= 2) {
      const d1 = new Date(deduped[0].fecha);
      const d2 = new Date(deduped[1].fecha);
      const gapDays = Math.abs(d1 - d2) / 86400000;
      if (gapDays < 50 && gapDays > 0) return { freq: "monthly", n: 12 };
      if (gapDays < 120) return { freq: "quarterly", n: 4 };
      if (gapDays < 270) return { freq: "semiannual", n: 2 };
      return { freq: "annual", n: 1 };
    }
    if (count >= 1) return { freq: "semiannual", n: 2 };
    return { freq: "quarterly", n: 4 };
  };

  const calcAnnualizedDPS = (payments, posShares) => {
    if (!payments.length) return { dps: 0 };
    const { n } = detectFrequency(payments);
    const deduped = deduplicateByDate(payments);
    const last = deduped[0];
    const origPayments = payments.filter(p => p.fecha === last.fecha);
    let maxShares = Math.max(...origPayments.map(p => p.shares || 0));
    // Fallback to position shares when dividend entries lack shares data
    if (!maxShares && posShares > 0) maxShares = posShares;
    const totalBruto = origPayments.reduce((s, p) => s + (p.bruto || 0), 0);
    const lastDPS = maxShares > 0 ? (totalBruto / maxShares) : 0;
    return { dps: lastDPS * n };
  };

  let updated = 0;
  let skipped = 0;
  const details = [];

  for (const ticker of tickers) {
    const pos = (positions.results || []).find(p => p.ticker === ticker);
    const price = pos?.last_price || 0;
    const payments = findPayments(ticker);

    let dps = 0;

    // Primary: annualized from actual payments
    if (payments.length > 0) {
      const calc = calcAnnualizedDPS(payments, pos?.shares);
      if (calc.dps > 0) dps = calc.dps;
    }

    // Fallback: FMP fundamentals cache
    if (!dps) {
      const cached = await env.DB.prepare(
        "SELECT ratios FROM fundamentals WHERE symbol = ?"
      ).bind(ticker).first();
      if (cached?.ratios) {
        try {
          const ratios = JSON.parse(cached.ratios || "[]");
          const latest = Array.isArray(ratios) ? ratios[0] : ratios;
          dps = latest?.dividendPerShare || latest?.dividendPerShareTTM || 0;
        } catch {}
      }
    }

    // Don't overwrite non-zero with zero
    if (!dps && pos?.div_ttm > 0) {
      skipped++;
      continue;
    }
    if (!dps) {
      skipped++;
      continue;
    }

    const dy = price > 0 ? dps / price : 0;
    const roundedDps = Math.round(dps * 100) / 100;
    const roundedYield = Math.round(dy * 10000) / 10000;

    await env.DB.prepare(
      "UPDATE positions SET div_ttm = ?, div_yield = ? WHERE ticker = ?"
    ).bind(roundedDps, roundedYield, ticker).run();

    updated++;
    details.push({ ticker, div_ttm: roundedDps, div_yield: roundedYield });
  }

  return { updated, skipped, total: tickers.length, details };
}

function json(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class BadBodyError extends Error {
  constructor() { super("Invalid JSON body"); }
}

async function parseBody(request) {
  try { return await request.json(); }
  catch(e) { throw new BadBodyError(); }
}

// ═══════════════════════════════════════════════════════════════
// AI Company Analysis — Claude-powered equity analysis
// ═══════════════════════════════════════════════════════════════

async function analyzeTickerWithAI(env, ticker) {
  ticker = ticker.toUpperCase().trim();

  // 1. Get fundamentals from D1
  const fund = await env.DB.prepare("SELECT * FROM fundamentals WHERE symbol = ?").bind(ticker).first();

  // 2. Get position data
  const pos = await env.DB.prepare("SELECT * FROM positions WHERE ticker = ?").bind(ticker).first();

  // 3. Build context for Claude
  let fundamentalsContext = "No fundamental data available.";
  if (fund) {
    const parts = [];
    if (fund.profile) parts.push(`Profile: ${fund.profile}`);
    if (fund.ratios) parts.push(`Key Ratios: ${fund.ratios}`);
    if (fund.income) parts.push(`Income Statement: ${fund.income}`);
    if (fund.balance) parts.push(`Balance Sheet: ${fund.balance}`);
    if (fund.cashflow) parts.push(`Cash Flow: ${fund.cashflow}`);
    if (fund.dividends) parts.push(`Dividend History: ${fund.dividends}`);
    if (fund.dcf) parts.push(`DCF Valuation: ${fund.dcf}`);
    if (fund.rating) parts.push(`Analyst Rating: ${fund.rating}`);
    if (fund.estimates) parts.push(`Estimates: ${fund.estimates}`);
    if (fund.price_target) parts.push(`Price Targets: ${fund.price_target}`);
    if (fund.key_metrics) parts.push(`Key Metrics: ${fund.key_metrics}`);
    if (fund.fin_growth) parts.push(`Financial Growth: ${fund.fin_growth}`);
    if (fund.peers) parts.push(`Peers: ${fund.peers}`);
    if (fund.owner_earnings) parts.push(`Owner Earnings: ${fund.owner_earnings}`);
    fundamentalsContext = parts.join("\n\n");
  }

  let positionContext = "Not currently held in portfolio.";
  if (pos) {
    positionContext = `Position: ${pos.shares} shares, avg cost $${pos.avg_price}, current price $${pos.last_price}, P&L ${pos.pnl_pct ? (pos.pnl_pct * 100).toFixed(1) + '%' : 'N/A'} ($${pos.pnl_abs || 0}), weight in portfolio: market value $${pos.usd_value || pos.market_value || 0}, div yield ${pos.div_yield ? (pos.div_yield * 100).toFixed(2) + '%' : 'N/A'}, YoC ${pos.yoc ? (pos.yoc * 100).toFixed(2) + '%' : 'N/A'}, sector: ${pos.sector || 'N/A'}`;
  }

  const prompt = `You are a professional equity analyst specializing in dividend income investing. Analyze ${ticker} from 5 perspectives for a long-term dividend income portfolio.

PORTFOLIO CONTEXT:
${positionContext}

FUNDAMENTAL DATA:
${fundamentalsContext}

Respond ONLY with valid JSON (no markdown, no code fences) using this exact structure:
{
  "fundamentals": {"score": <1-10>, "assessment": "<2-3 sentences>", "highlights": ["<strength1>", "<strength2>"], "concerns": ["<concern1>", "<concern2>"]},
  "dividendSafety": {"score": <1-10>, "payoutRatio": <decimal>, "coverage": <decimal>, "streakYears": <integer>, "growthRate": <decimal annual 5yr avg>, "assessment": "<2-3 sentences>"},
  "valuation": {"score": <1-10>, "fairValue": <number>, "currentPrice": <number>, "upside": <decimal>, "method": "<valuation method used>", "assessment": "<2-3 sentences>"},
  "incomeOptimization": {"ccPremiumMonthly": <estimated monthly CC income for 100 shares>, "currentYield": <decimal>, "enhancedYield": <decimal with CC>, "suggestedStrategy": "<specific CC/put strategy>", "assessment": "<2-3 sentences>"},
  "verdict": {"action": "<HOLD|ADD|TRIM|SELL>", "score": <1-10 weighted average>, "summary": "<3-4 sentence final verdict>", "targetWeight": "<suggested portfolio weight range>", "keyAction": "<single most important action to take>"}
}

Score guide: 1-3 = Poor/Sell, 4-5 = Below Average/Trim, 6-7 = Average/Hold, 8-9 = Good/Hold-Add, 10 = Excellent/Add.
Use real numbers from the data provided. If data is missing, use reasonable estimates and note the uncertainty.`;

  // 4. Call Claude API
  const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!anthropicResp.ok) {
    const errText = await anthropicResp.text();
    throw new Error(`Claude API error ${anthropicResp.status}: ${errText}`);
  }

  const claudeResult = await anthropicResp.json();
  const rawText = claudeResult.content?.[0]?.text || "";

  // 5. Parse JSON response (strip code fences if present)
  let parsed;
  try {
    const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse Claude response for ${ticker}: ${e.message}`);
  }

  const overallScore = Math.round((parsed.verdict?.score || 0) * 10) / 10;
  const action = parsed.verdict?.action || "HOLD";
  const summary = parsed.verdict?.summary || "";
  const today = new Date().toISOString().slice(0, 10);

  // 6. Store in D1 (upsert by ticker + date)
  await env.DB.prepare(`
    INSERT INTO ai_analysis (ticker, analysis_date, fundamentals, dividend_safety, valuation, income_optimization, verdict, score, action, summary, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ticker, analysis_date) DO UPDATE SET
      fundamentals = excluded.fundamentals,
      dividend_safety = excluded.dividend_safety,
      valuation = excluded.valuation,
      income_optimization = excluded.income_optimization,
      verdict = excluded.verdict,
      score = excluded.score,
      action = excluded.action,
      summary = excluded.summary,
      updated_at = datetime('now')
  `).bind(
    ticker,
    today,
    JSON.stringify(parsed.fundamentals),
    JSON.stringify(parsed.dividendSafety),
    JSON.stringify(parsed.valuation),
    JSON.stringify(parsed.incomeOptimization),
    JSON.stringify(parsed.verdict),
    overallScore,
    action,
    summary
  ).run();

  // 7. Return result
  return {
    ticker,
    score: overallScore,
    action,
    summary,
    fundamentals: parsed.fundamentals,
    dividendSafety: parsed.dividendSafety,
    valuation: parsed.valuation,
    incomeOptimization: parsed.incomeOptimization,
    verdict: parsed.verdict,
    analyzed_at: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// AI AGENTS — 5 autonomous agents for portfolio monitoring
// ═══════════════════════════════════════════════════════════════

// Prompt reused by POST /api/theses/:ticker/generate (thesis auto-generation
// with Opus). Declared at module scope so the handler can reference it.
const THESIS_AUTOGEN_SYSTEM_PROMPT = `Eres un analista senior especializado en dividendos sostenibles a largo plazo para un inversor individual con horizonte 10-30 años. Tu trabajo es generar un DRAFT v2 de tesis de inversión para UNA empresa concreta del portfolio del usuario.

El usuario ya tiene la posición. NO estás recomendando comprar/vender. Estás formalizando POR QUÉ tiene sentido aguantarla y QUÉ rompería la tesis.

INPUT
=====
Recibirás un JSON con:
- ticker, name, sector, sector_class
- is_yield_vehicle_REIT_MLP_BDC (bool — si true, los criterios de venta usan FFO/DCF, no FCF)
- position: shares, avg_cost, last_price, market_value, usd_value, weight_pct, div_ttm, div_yield_pct, yoc_pct, market_cap
- quality_safety:
    quality_score (0-100), safety_score (0-100)
    q_breakdown { profitability, capital_efficiency, balance_sheet, growth, dividend_track, predictability }
    s_breakdown { coverage, balance_sheet, track_record, forward, sector_adj }
    inputs_quality { fcfMargin, netMargin, grossMargin, roic, assetTurnover, debtEbitda, intCov, currentRatio, revGrowth, fcfGrowth, piotroskiScore, accrualsRatio }
    inputs_safety  { divTTM, fcfTTM, niTTM, fcfCoverage, payoutRatio, fcfPayoutRatio, payoutRatioWorst, fcfAfterMaintCov, debtEbitda, streakYears }
- valuation (opcional): pe, pb, market_cap, ev_ebitda, fcf_yield
- business_model_md (opcional): texto explicando el negocio
- transcript_summary_md (opcional): resumen de los últimos earnings calls
- today (YYYY-MM-DD)

OUTPUT
======
Devuelve ÚNICAMENTE un objeto JSON válido (sin markdown fences, sin texto antes o después) con EXACTAMENTE estos campos:

{
  "why_owned": "200-400 palabras. Empezar con '[DRAFT v2 AI generated YYYY-MM-DD] '. Explicar por qué tiene sentido tener esta posición para un inversor long-term dividend-focused. SER ESPECÍFICO con números del input: cita peso actual del portfolio (weight_pct%), yield (div_yield_pct%), Q score, S score, streak (streakYears años), FCF coverage (fcfCoverage x). NO uses frases vacías como 'gran empresa con buenos fundamentales'. Reconoce 1-2 riesgos visibles en los datos y explica por qué se aguantan. Si business_model_md o transcript_summary_md están presentes, úsalos para añadir contexto del negocio (no los copies literalmente).",
  "what_would_make_sell": "150-300 palabras. Empezar con '[DRAFT v2 AI generated YYYY-MM-DD] '. BULLETS markdown con criterios CUANTIFICABLES y OBJETIVOS. Ejemplos del nivel de detalle exigido:\\n- FCF payout ratio > 100% durante 2 trimestres consecutivos\\n- Streak de subidas de dividendo roto (recorte o congelación)\\n- ROIC < 8% durante 2 años consecutivos\\n- Quality score cae por debajo de 50\\n- Debt/EBITDA > 4.5x durante 2 trimestres\\n- Evento específico del negocio: [algo concreto del sector / empresa]\\nPROHIBIDO: 'si los fundamentales se deterioran' sin números. PROHIBIDO: criterios ambiguos.\\nIMPORTANTE: si is_yield_vehicle_REIT_MLP_BDC=true, NO uses FCF coverage; usa FFO payout / DCF coverage / NII coverage según corresponda.",
  "thesis_type": "uno de: compounder | value | turnaround | income | cyclical | speculation",
  "conviction": 1-5 (entero),
  "target_weight_min": número (% del portfolio donde mantendrías la posición mínima),
  "target_weight_max": número (% del portfolio donde pararías de añadir),
  "notes_md": "0-200 palabras. Notas específicas del momento actual: alertas pendientes, kill switches activos, catalysts próximos (earnings, FOMC), señales de Q+S a vigilar. Vacío si no hay nada relevante."
}

REGLAS CRÍTICAS
===============
1. Usa SOLO datos reales del input. Si un dato no está, di 'por verificar' — NO inventes.
2. Sector awareness: REIT/MLP/BDC usan FFO/DCF/NII, no FCF. Carve-out obligatorio en sell criteria.
3. Asymmetry of sell criteria: cada bullet de venta debe ser falsable y medible.
4. Conviction mapping (orientativo, ajusta con criterio):
   - Q+S ambos > 80, streak > 25y, predictabilidad alta → conviction 5
   - Q+S ambos > 70, streak > 10y → conviction 4
   - Q+S ambos > 60 → conviction 3
   - Q+S mixto o streak < 5y → conviction 2
   - Q+S < 50 o stress evidente → conviction 1
5. Si quality_score < 40, conviction NUNCA puede ser > 2.
6. Si streakYears < 5, thesis_type NO puede ser 'income' (salvo ETFs).
7. Si fcfCoverage < 1.2, MENCIÓNALO en notes_md como riesgo activo.
8. target_weight_min y target_weight_max deben ser coherentes con weight_pct actual: típicamente min ≈ weight_pct * 0.5, max ≈ weight_pct * 1.5. max nunca > 10% para una posición individual (concentración).
9. Tono: honesto, humilde, directo. Es un DRAFT que el usuario va a editar — no exageres.
10. Idioma: ESPAÑOL (el usuario es hispanohablante).
11. NO escribas nada fuera del JSON. Sin preámbulo, sin epílogo, sin markdown fences.`;

async function callAgentClaude(env, systemPrompt, userContent, opts = {}) {
  const model = opts.model || "claude-haiku-4-5-20251001";
  const maxTokens = opts.maxTokens || 3000;
  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: typeof userContent === "string" ? userContent : JSON.stringify(userContent) }],
  });
  // ── Retry with exponential backoff on transient failures ──
  // Anthropic returns 529 "overloaded_error" intermittently. Previously this
  // would crash any single-Opus-call agent (macro, trade synth) mid-cron.
  // Retry on: 429 (rate limit), 500-504 (gateway), 529 (overloaded).
  const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
  const BACKOFF_MS = [5000, 15000, 30000]; // 3 attempts total after the initial try
  let lastErr = null;
  let resp = null;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
        },
        body,
      });
      if (resp.ok) break;
      if (!RETRYABLE.has(resp.status) || attempt === BACKOFF_MS.length) {
        const errText = await resp.text();
        throw new Error(`Claude API error ${resp.status}: ${errText}`);
      }
      // Log the retry attempt so the cron investigation / logs can see it
      console.warn(`[callAgentClaude] ${resp.status} on attempt ${attempt + 1}/${BACKOFF_MS.length + 1}, retrying in ${BACKOFF_MS[attempt]}ms...`);
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
    } catch (e) {
      lastErr = e;
      // Network error — also retry up to the same budget
      if (attempt === BACKOFF_MS.length) throw e;
      console.warn(`[callAgentClaude] network error on attempt ${attempt + 1}: ${e.message}, retrying in ${BACKOFF_MS[attempt]}ms...`);
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }
  if (!resp || !resp.ok) {
    throw lastErr || new Error("Claude API: all retries exhausted");
  }
  const result = await resp.json();
  const rawText = result.content?.[0]?.text || "";
  const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  // Try direct parse first
  try { return JSON.parse(cleaned); } catch (_) {}
  // Extract JSON by finding balanced brackets
  function extractBalanced(text, open, close) {
    const start = text.indexOf(open);
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === open) depth++;
      else if (text[i] === close) depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
    return null;
  }
  const arr = extractBalanced(cleaned, '[', ']');
  if (arr) try { return JSON.parse(arr); } catch (_) {}
  const obj = extractBalanced(cleaned, '{', '}');
  if (obj) try { return JSON.parse(obj); } catch (_) {}
  throw new Error(`JSON parse failed — raw: ${cleaned.slice(0, 300)}`);
}

async function storeInsights(env, agentName, fecha, insights) {
  if (!Array.isArray(insights)) insights = [insights];
  const stmt = env.DB.prepare(`
    INSERT INTO agent_insights (agent_name, fecha, ticker, severity, title, summary, details, score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_name, fecha, ticker) DO UPDATE SET
      severity = excluded.severity, title = excluded.title, summary = excluded.summary,
      details = excluded.details, score = excluded.score, created_at = datetime('now')
  `);
  const batch = insights.filter(i => i && typeof i === 'object').map(i => {
    const ticker = String(i.ticker || "_GLOBAL_");
    const severity = String(i.severity || "info");
    const title = String(i.title || "Update");
    const summary = String(i.summary || "No summary");
    const details = JSON.stringify(i.details || {});
    const score = Number(i.score) || 0;
    return stmt.bind(agentName, fecha, ticker, severity, title, summary, details, score);
  });
  if (batch.length) await env.DB.batch(batch);
  return batch.length;
}

// ─── Helper: Enrich Position Sectors ────────────────────────────
async function enrichPositionSectors(env) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, sector FROM positions WHERE shares > 0"
  ).all();

  // Manual sector mappings — ONLY for ETFs/preferred that APIs don't cover.
  // International stocks (BME:/HKG:/etc.) are now resolved via FMP Ultimate /v3/profile.
  // Previous hardcoded HKG entries were WRONG (HKG:1052=Industrials not Healthcare,
  // HKG:2219=Healthcare not Tech, HKG:1910=Consumer Cyclical not Tech) — removed.
  const MANUAL_SECTORS = {
    'NET.UN': 'Real Estate', 'IIPR-PRA': 'Real Estate',
    'BIZD': 'Financial Services', 'DIVO': 'Financial Services',
    'SPHD': 'Financial Services', 'WEEL': 'Financial Services',
  };

  const missing = positions.filter(p => !p.sector || p.sector === 'Unknown' || p.sector === '');
  if (!missing.length) return { updated: 0, total: positions.length, message: "All sectors filled" };

  let updated = 0;

  // Apply manual mappings first
  for (const pos of missing) {
    if (MANUAL_SECTORS[pos.ticker]) {
      await env.DB.prepare("UPDATE positions SET sector = ? WHERE ticker = ?").bind(MANUAL_SECTORS[pos.ticker], pos.ticker).run();
      updated++;
    }
  }
  const tickers = missing.map(p => p.ticker);

  // 1. Try GuruFocus cache first
  const gfMap = await getGfData(env, tickers);

  // 2. Try FMP fundamentals profile
  const placeholders = tickers.map(() => "?").join(",");
  const { results: fmpRows } = await env.DB.prepare(
    `SELECT symbol, profile FROM fundamentals WHERE symbol IN (${placeholders})`
  ).bind(...tickers).all();
  const fmpMap = {};
  for (const f of fmpRows) {
    if (f.profile) {
      try {
        const p = JSON.parse(f.profile);
        const profile = Array.isArray(p) ? p[0] : p;
        if (profile?.sector) fmpMap[f.symbol] = profile.sector;
      } catch {}
    }
  }

  // 3. On-demand FMP /v3/profile fetch for tickers still missing sector
  //    (covers international tickers not yet in fundamentals table)
  const FMP_KEY = env.FMP_KEY;
  const fmpProfileMap = {};
  if (FMP_KEY) {
    const stillMissing = missing.filter(p => !gfMap[p.ticker]?.sector && !fmpMap[p.ticker]);
    for (let i = 0; i < stillMissing.length; i += 10) {
      const batch = stillMissing.slice(i, i + 10);
      await Promise.all(batch.map(async (pos) => {
        try {
          const sym = toFMP(pos.ticker);
          const r = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(sym)}&apikey=${FMP_KEY}`);
          if (!r.ok) return;
          const d = await r.json();
          const profile = Array.isArray(d) ? d[0] : d;
          if (profile?.sector) fmpProfileMap[pos.ticker] = profile.sector;
        } catch {}
      }));
    }
  }

  // 4. Update positions with sector data
  for (const pos of missing) {
    const sector = gfMap[pos.ticker]?.sector || fmpMap[pos.ticker] || fmpProfileMap[pos.ticker] || null;
    if (sector) {
      await env.DB.prepare("UPDATE positions SET sector = ? WHERE ticker = ?").bind(sector, pos.ticker).run();
      updated++;
    }
  }

  return { updated, missing: missing.length, total: positions.length };
}

// ─── Helper: Cache Market Indicators (FMP Ultimate) ────────────
async function cacheMarketIndicators(env) {
  const MARKET_TICKERS = [
    'SPY','QQQ','IWM','DIA',                          // indices
    'XLK','XLF','XLE','XLV','XLU','XLP','XLI','XLRE', // sectors
    'HYG','LQD','TLT','SHY',                          // credit
    'QUAL','MTUM','VLUE',                              // factors
    'GLD','USO','DBC',                                 // commodities
    'UUP',                                             // dollar
    '^VIX',                                            // volatility
  ];

  // Single batch quote call (FMP supports up to 50 symbols in one URL)
  const quotes = await fmpQuote(MARKET_TICKERS, env);
  const results = {};

  // Sparklines in parallel batches of 10
  for (let i = 0; i < MARKET_TICKERS.length; i += 10) {
    const batch = MARKET_TICKERS.slice(i, i + 10);
    const sparks = await Promise.all(batch.map(t => fmpSpark(t, env, 5)));
    batch.forEach((ticker, idx) => {
      const q = quotes[ticker];
      if (!q || q.price == null) return;
      const closes = sparks[idx] || [];
      const price = q.price;
      const prevClose = q.previousClose || price;
      const firstClose = closes.length > 1 ? closes[0] : prevClose;
      results[ticker] = {
        ticker, price,
        changePct: prevClose ? ((price - prevClose) / prevClose * 100) : 0,
        change5dPct: firstClose ? ((price - firstClose) / firstClose * 100) : 0,
        spark5d: closes.slice(-5),
      };
    });
  }

  // Store in agent_memory
  await env.DB.prepare(
    `INSERT INTO agent_memory (id, data, updated_at) VALUES ('market_indicators', ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`
  ).bind(JSON.stringify(results)).run();

  return results;
}

// ─── Helper: Get Market Indicators from cache ───��──────────────
async function getMarketIndicators(env) {
  const row = await env.DB.prepare("SELECT data FROM agent_memory WHERE id = 'market_indicators'").first();
  return row?.data ? JSON.parse(row.data) : {};
}

// ─── Helper: Get/Set Agent Memory ──────────────────────────────
async function getAgentMemory(env, id) {
  const row = await env.DB.prepare("SELECT data FROM agent_memory WHERE id = ?").bind(id).first();
  return row?.data ? JSON.parse(row.data) : null;
}

async function setAgentMemory(env, id, data) {
  await env.DB.prepare(
    `INSERT INTO agent_memory (id, data, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`
  ).bind(id, JSON.stringify(data)).run();
}

// ─── Helper: GuruFocus API ──────────────────────────────────────
async function fetchGuruFocusSummary(env, symbol) {
  const token = env.GURUFOCUS_TOKEN;
  if (!token) return null;
  // GF uses plain symbols — strip exchange prefixes
  const gfSymbol = symbol.replace(/^(BME:|HKG:|LSE:)/, '');
  try {
    const resp = await fetch(`https://api.gurufocus.com/public/user/${token}/stock/${gfSymbol}/summary`);
    if (!resp.ok) return null;
    const data = await resp.json();
    // GF summary is nested: summary.general, summary.chart, summary.company_data, summary.guru, summary.insider
    const s = data?.summary || data;
    const g = s?.general || {};
    const ch = s?.chart || {};
    const cd = s?.company_data || {};
    const guru = s?.guru || {};
    const ins = s?.insider || {};
    return {
      gfValue: ch['GF Value'] || ch.gf_value,
      gfScore: g.gf_score,
      priceToGfValue: (cd.price && ch['GF Value']) ? cd.price / ch['GF Value'] : null,
      gfValuation: g.gf_valuation,
      financialStrength: g.rank_financial_strength,
      profitabilityRank: g.rank_profitability,
      growthRank: g.rank_growth,
      momentumRank: g.rank_momentum,
      valueRank: g.rank_gf_value,
      peterLynchFV: ch['Peter Lynch Fair Value'] || ch.peter_lynch_value,
      epv: ch['Earnings Power Value'],
      shareholderYield: cd.shareholder_yield,
      buybackYield: cd.buyback_yield,
      dividendYield: cd.yield,
      dividendStreakSince: cd.dividend_increase_streak_since,
      rsi14: cd.rsi_14d,
      beta: cd.beta,
      volatility1y: cd.volatility_1y,
      sharpe: cd.sharpe_ratio,
      sortino: cd.sortino_ratio,
      maxDrawdown1y: cd.max_drawdown_1y,
      guruBuys13f: guru['13f_buys'] || guru.buys_pct,
      guruSells13f: guru['13f_sells'] || guru.sells_pct,
      institutionalOwnership: guru.institutional_ownership,
      insiderBuys3m: ins.insider_buys_3m || ins.buys_3m,
      insiderSells3m: ins.insider_sells_3m || ins.sells_3m,
      company: cd.company,
      sector: g.sector,
      price: cd.price || g.price,
    };
  } catch (e) {
    console.error(`GF fetch error for ${symbol}:`, e.message);
    return null;
  }
}

async function cacheGuruFocusData(env) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { cached: 0 };

  let cached = 0, failed = 0;
  // Fetch in batches of 5 with 1s delay to respect rate limits
  for (let i = 0; i < positions.length; i += 5) {
    const batch = positions.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(p => fetchGuruFocusSummary(env, p.ticker))
    );
    for (let j = 0; j < batch.length; j++) {
      const ticker = batch[j].ticker;
      const result = results[j];
      if (result.status === "fulfilled" && result.value) {
        await env.DB.prepare(
          `INSERT INTO gurufocus_cache (ticker, data, updated_at) VALUES (?, ?, datetime('now'))
           ON CONFLICT(ticker) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`
        ).bind(ticker, JSON.stringify(result.value)).run();
        cached++;
      } else {
        failed++;
      }
    }
    if (i + 5 < positions.length) await new Promise(r => setTimeout(r, 1200));
  }
  // Trends cached separately via POST /api/agent-run?agent=gf-trends (too slow for single request)
  let trends = 0;
  const base = `https://api.gurufocus.com/public/user/${env.GURUFOCUS_TOKEN}`;
  for (let i = 0; i < positions.length; i += 3) {
    const batch = positions.slice(i, i + 3);
    const trendResults = await Promise.allSettled(
      batch.map(async (p) => {
        const sym = p.ticker.replace(/^(BME:|HKG:|LSE:)/, '');
        try {
          const resp = await fetch(`${base}/stock/${sym}/financials`);
          if (!resp.ok) return null;
          const data = await resp.json();
          const fin = data?.financials || {};
          const q = fin.quarterly || {};
          const periods = q['Fiscal Year'] || [];
          const income = q.income_statement || {};
          const cf = q.cashflow_statement || {};
          const bs = q.balance_sheet || {};
          const n = Math.min(8, periods.length);
          if (n < 4) return null;
          const rev = (income.Revenue || []).slice(-n).reverse();
          const fcf = (cf['Free Cash Flow'] || []).slice(-n).reverse();
          const debt = (bs['Long-Term Debt'] || bs['Total Long-Term Debt'] || []).slice(-n).reverse();
          const divPaid = (cf['Dividends Paid'] || cf['Payment of Dividends and Other Cash Distributions'] || []).slice(-n).reverse();
          const toNum = v => { try { return parseFloat(String(v).replace(/,/g,'')); } catch { return null; } };
          return {
            ticker: p.ticker,
            trend: {
              periods: periods.slice(-n).reverse(),
              revenue: rev.map(toNum), fcf: fcf.map(toNum),
              debt: debt.map(toNum), dividendsPaid: divPaid.map(toNum),
            }
          };
        } catch { return null; }
      })
    );
    for (const r of trendResults) {
      if (r.status === 'fulfilled' && r.value) {
        // Store trend data in gurufocus_cache alongside existing data
        const existing = await env.DB.prepare("SELECT data FROM gurufocus_cache WHERE ticker = ?").bind(r.value.ticker).first();
        let merged = existing?.data ? JSON.parse(existing.data) : {};
        merged.trend = r.value.trend;
        await env.DB.prepare(
          `INSERT INTO gurufocus_cache (ticker, data, updated_at) VALUES (?, ?, datetime('now'))
           ON CONFLICT(ticker) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`
        ).bind(r.value.ticker, JSON.stringify(merged)).run();
        trends++;
      }
    }
    if (i + 3 < positions.length) await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`[GF] Cached ${cached} summaries + ${trends} trends / ${positions.length} tickers`);
  return { cached, trends, failed, total: positions.length };
}

async function getGfData(env, tickers) {
  if (!tickers.length) return {};
  const placeholders = tickers.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT ticker, data FROM gurufocus_cache WHERE ticker IN (${placeholders})`
  ).bind(...tickers).all();
  const map = {};
  for (const r of results) map[r.ticker] = JSON.parse(r.data);
  return map;
}

// ─── FMP Ultimate financials (replaces GuruFocus trend data) ───
// Returns same shape as gf.trend so consumers can keep using `obj.trend.revenue` etc.
// Pull complete company dividend history (per-share, all years).
// Returns array sorted chronologically: [{year, total}, ...]
async function fmpDividendHistory(ticker, env) {
  const key = env.FMP_KEY;
  if (!key) return null;
  const sym = toFMP(ticker);
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/dividends?symbol=${encodeURIComponent(sym)}&apikey=${key}`
    );
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) return null;
    // Group by year, sum
    const byYear = {};
    for (const d of data) {
      const date = d.date || d.recordDate || d.paymentDate;
      if (!date) continue;
      const year = parseInt(date.slice(0, 4), 10);
      if (isNaN(year)) continue;
      const amt = Number(d.adjDividend ?? d.dividend);
      if (isNaN(amt) || amt <= 0) continue;
      byYear[year] = (byYear[year] || 0) + amt;
    }
    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
    return years.map(y => ({ year: y, total: byYear[y] }));
  } catch (e) {
    return null;
  }
}

async function fmpFinancials(ticker, env) {
  const key = env.FMP_KEY;
  if (!key) return null;
  const sym = toFMP(ticker);
  const base = "https://financialmodelingprep.com/stable";
  // FMP stable uses query string, returns most-recent first
  const urls = [
    `${base}/income-statement?symbol=${encodeURIComponent(sym)}&period=quarter&limit=8&apikey=${key}`,
    `${base}/cash-flow-statement?symbol=${encodeURIComponent(sym)}&period=quarter&limit=8&apikey=${key}`,
    `${base}/balance-sheet-statement?symbol=${encodeURIComponent(sym)}&period=quarter&limit=8&apikey=${key}`,
  ];
  try {
    const [incRes, cfRes, bsRes] = await Promise.all(
      urls.map(u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null))
    );
    if (!Array.isArray(incRes) || !Array.isArray(cfRes)) return null;
    if (incRes.length < 2 || cfRes.length < 2) return null;
    const n = Math.min(8, incRes.length, cfRes.length);
    const inc = incRes.slice(0, n);
    const cf = cfRes.slice(0, n);
    const bs = Array.isArray(bsRes) ? bsRes.slice(0, n) : [];
    const num = (v) => (v == null || v === "" || isNaN(Number(v))) ? null : Number(v);
    const periods = inc.map(r => r.date || r.period || null);
    const revenue = inc.map(r => num(r.revenue));
    const fcf = cf.map(r => num(r.freeCashFlow));
    // FMP returns dividendsPaid as negative → flip sign
    // /stable endpoint may use commonDividendsPaid or netDividendsPaid instead
    const dividendsPaid = cf.map(r => {
      const v = num(r.dividendsPaid) ?? num(r.commonDividendsPaid) ?? num(r.netDividendsPaid) ?? num(r.netCommonDividendsPaid) ?? num(r.paymentsForDividends);
      return v == null ? null : Math.abs(v);
    });
    const debt = bs.map(r => {
      const ltd = num(r.longTermDebt);
      return ltd != null ? ltd : num(r.totalDebt);
    });
    // ── Extra fields for Quality + Safety Score (extracted from same payloads) ──
    const netIncome = inc.map(r => num(r.netIncome));
    const operatingIncome = inc.map(r => num(r.operatingIncome));
    const grossProfit = inc.map(r => num(r.grossProfit));
    const eps = inc.map(r => num(r.eps ?? r.epsdiluted));
    const sharesOutstanding = inc.map(r => num(r.weightedAverageShsOut ?? r.weightedAverageShsOutDil));
    // Interest expense — FMP can return positive or negative depending on endpoint version
    const interestExpense = inc.map(r => {
      const v = num(r.interestExpense);
      return v == null ? null : Math.abs(v);
    });
    const ocf = cf.map(r => num(r.operatingCashFlow));
    const capex = cf.map(r => num(r.capitalExpenditure)); // negative in FMP
    const totalAssets = bs.map(r => num(r.totalAssets));
    const totalEquity = bs.map(r => num(r.totalStockholdersEquity ?? r.totalEquity));
    const cash = bs.map(r => num(r.cashAndShortTermInvestments ?? r.cashAndCashEquivalents));
    const currentLiabilities = bs.map(r => num(r.totalCurrentLiabilities));
    const currentAssets = bs.map(r => num(r.totalCurrentAssets));
    return {
      periods, revenue, fcf, debt, dividendsPaid,
      netIncome, operatingIncome, grossProfit, eps, sharesOutstanding, interestExpense,
      ocf, capex, totalAssets, totalEquity, cash, currentLiabilities, currentAssets,
    };
  } catch (e) {
    console.error(`[FMP financials] ${ticker}:`, e.message);
    return null;
  }
}

// Batch cache all portfolio quarterly financials (replaces cacheGuruFocusData trend portion)
// Supports ?offset=N&limit=N pagination via opts to fit within Workers 30s CPU budget.
async function cacheFmpFinancials(env, opts = {}) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS fmp_financials_cache (
       ticker TEXT PRIMARY KEY,
       data TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ).run();
  // Skip ETFs (they have no income statement of their own — would always fail)
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker FROM positions WHERE shares > 0 AND COALESCE(category, '') != 'ETF'"
  ).all();
  if (!positions.length) return { cached: 0, failed: 0, total: 0 };
  const offset = opts.offset || 0;
  const limit = opts.limit || 0;
  const sliced = limit > 0 ? positions.slice(offset, offset + limit) : positions;

  // Helper: store one ticker's result
  const store = async (ticker, value) => {
    if (!value) return false;
    const payload = { trend: value };
    await env.DB.prepare(
      `INSERT INTO fmp_financials_cache (ticker, data, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(ticker) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`
    ).bind(ticker, JSON.stringify(payload)).run();
    return true;
  };

  let cached = 0;
  const failedFirstPass = [];
  // First pass: batches of 3 in parallel + 700ms delay (~9 calls in flight)
  for (let i = 0; i < sliced.length; i += 3) {
    const batch = sliced.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map(p => fmpFinancials(p.ticker, env))
    );
    for (let j = 0; j < batch.length; j++) {
      const ticker = batch[j].ticker;
      const r = results[j];
      if (r.status === "fulfilled" && r.value) {
        await store(ticker, r.value);
        cached++;
      } else {
        failedFirstPass.push(ticker);
      }
    }
    if (i + 3 < sliced.length) await new Promise(r => setTimeout(r, 700));
  }

  // Retry pass: failed tickers SEQUENTIALLY with longer delay (rate limit relief)
  let retryCached = 0;
  const stillFailed = [];
  for (const ticker of failedFirstPass) {
    try {
      await new Promise(r => setTimeout(r, 1200));
      const result = await fmpFinancials(ticker, env);
      if (result) {
        await store(ticker, result);
        retryCached++;
        cached++;
      } else {
        stillFailed.push(ticker);
      }
    } catch (e) {
      stillFailed.push(ticker);
    }
  }

  const failed = stillFailed.length;
  console.log(`[FMP-FIN] Cached ${cached}/${sliced.length} (first pass ${cached - retryCached}, retry ${retryCached}, still failed ${failed}: ${stillFailed.join(',')})`);
  return { cached, failed, total: sliced.length, portfolio: positions.length, retried: failedFirstPass.length, retry_cached: retryCached, still_failed: stillFailed };
}

// Cache full company dividend history for all positions in agent_memory.dividend_history
// Stored as map { ticker: [{year, total}, ...] }
async function cacheDividendHistory(env, opts = {}) {
  // Skip ETFs
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker FROM positions WHERE shares > 0 AND COALESCE(category, '') != 'ETF'"
  ).all();
  if (!positions.length) return { cached: 0, total: 0 };
  const offset = opts.offset || 0;
  const limit = opts.limit || 0;
  const sliced = limit > 0 ? positions.slice(offset, offset + limit) : positions;

  const map = (await getAgentMemory(env, "dividend_history")) || {};
  let cached = 0;
  const failedFirstPass = [];
  // First pass: batches of 4 parallel + 700ms delay
  for (let i = 0; i < sliced.length; i += 4) {
    const batch = sliced.slice(i, i + 4);
    const results = await Promise.all(batch.map(p => fmpDividendHistory(p.ticker, env)));
    batch.forEach((p, idx) => {
      if (results[idx] && results[idx].length > 0) {
        map[p.ticker] = results[idx];
        cached++;
      } else {
        failedFirstPass.push(p.ticker);
      }
    });
    if (i + 4 < sliced.length) await new Promise(r => setTimeout(r, 700));
  }
  // Retry pass: sequential with longer delay
  let retryCached = 0;
  const stillFailed = [];
  for (const ticker of failedFirstPass) {
    try {
      await new Promise(r => setTimeout(r, 1000));
      const result = await fmpDividendHistory(ticker, env);
      if (result && result.length > 0) {
        map[ticker] = result;
        retryCached++;
        cached++;
      } else {
        stillFailed.push(ticker);
      }
    } catch {
      stillFailed.push(ticker);
    }
  }
  await setAgentMemory(env, "dividend_history", map);
  return { cached, failed: stillFailed.length, total: sliced.length, portfolio: positions.length, retry_cached: retryCached, still_failed: stillFailed };
}

// Reader for cached dividend history
async function getDividendHistoryCache(env, tickers) {
  const all = (await getAgentMemory(env, "dividend_history")) || {};
  const result = {};
  for (const t of tickers) if (all[t]) result[t] = all[t];
  return result;
}

// Reader equivalent to getGfData — returns map of ticker → { trend: {...} }
async function getFmpFinancials(env, tickers) {
  if (!tickers.length) return {};
  const placeholders = tickers.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT ticker, data FROM fmp_financials_cache WHERE ticker IN (${placeholders})`
  ).bind(...tickers).all();
  const map = {};
  for (const r of results) {
    try { map[r.ticker] = JSON.parse(r.data); } catch {}
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUALITY + SAFETY SCORES (0-100)
// Implementa docs/quality-safety-score-design.md adaptado a datos cacheados.
// Pure JS, sin LLM, reusa fmp_financials_cache + agent_memory.risk_metrics + positions.
// ─────────────────────────────────────────────────────────────────────────────

async function ensureQualitySafetyTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS quality_safety_scores (
       ticker TEXT NOT NULL,
       snapshot_date TEXT NOT NULL,
       quality_score REAL,
       safety_score REAL,
       q_profitability REAL,
       q_capital_efficiency REAL,
       q_balance_sheet REAL,
       q_growth REAL,
       q_dividend_track REAL,
       q_predictability REAL,
       q_data_completeness REAL,
       s_coverage REAL,
       s_balance_sheet REAL,
       s_track_record REAL,
       s_forward REAL,
       s_sector_adj REAL,
       inputs_json TEXT,
       computed_at TEXT NOT NULL,
       PRIMARY KEY (ticker, snapshot_date)
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_qss_ticker ON quality_safety_scores(ticker)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_qss_date ON quality_safety_scores(snapshot_date DESC)`).run();
}

// Helpers numéricos
const _qs_safe = (v) => (v == null || isNaN(v)) ? null : Number(v);
const _qs_div = (a, b) => (a == null || b == null || b === 0) ? null : a / b;
const _qs_sum = (arr, n) => {
  const slice = (arr || []).slice(0, n).filter(v => v != null);
  return slice.length ? slice.reduce((s, v) => s + v, 0) : null;
};
const _qs_avg = (arr) => {
  const valid = (arr || []).filter(v => v != null);
  return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
};

// Sector defensive adjustment
function _qs_sectorBase(sector) {
  const s = (sector || "").toLowerCase();
  // Defensive (10): staples, utilities, healthcare, REITs, consumer defensive
  if (/staple|utilit|healthcare|health.care|real.?estate|consumer.?def|defensive/.test(s)) return 10;
  // Financials (6)
  if (/financial|bank|insurance/.test(s)) return 6;
  // Tech / Communication / Consumer Cyclical (7)
  if (/technology|communicat|consumer.cyclical|consumer.disc/.test(s)) return 7;
  // Cyclical (4): industrials, materials, energy
  if (/industrial|material|energy/.test(s)) return 4;
  return 5;
}

// Piotroski F-Score (0-9): earnings quality + balance sheet + operating efficiency.
// Detects manipulation, accruals, deteriorating quality. Low F-Score (<5) is a
// strong signal that reported earnings are unreliable.
// Returns { score, components } or null if data insufficient.
function _qs_piotroski(trend) {
  if (!trend) return null;
  const niTTM = _qs_sum(trend.netIncome, 4);
  const niPrev = _qs_sum(trend.netIncome?.slice(4), 4);
  const ocfTTM = _qs_sum(trend.ocf, 4);
  const assetsNow = trend.totalAssets?.[0];
  const assetsPrev = trend.totalAssets?.[4];
  const debtNow = trend.debt?.[0];
  const debtPrev = trend.debt?.[4];
  const caNow = trend.currentAssets?.[0];
  const clNow = trend.currentLiabilities?.[0];
  const caPrev = trend.currentAssets?.[4];
  const clPrev = trend.currentLiabilities?.[4];
  const sharesNow = trend.sharesOutstanding?.[0];
  const sharesPrev = trend.sharesOutstanding?.[4];
  const grossNow = _qs_sum(trend.grossProfit, 4);
  const grossPrev = _qs_sum(trend.grossProfit?.slice(4), 4);
  const revNow = _qs_sum(trend.revenue, 4);
  const revPrev = _qs_sum(trend.revenue?.slice(4), 4);

  // Need at least 8 quarters of history for YoY comparisons
  if (assetsNow == null || assetsPrev == null) return null;

  let score = 0;
  const c = {};

  // 1. Net income > 0
  c.ni_positive = (niTTM != null && niTTM > 0) ? 1 : 0;
  score += c.ni_positive;

  // 2. OCF > 0
  c.ocf_positive = (ocfTTM != null && ocfTTM > 0) ? 1 : 0;
  score += c.ocf_positive;

  // 3. ROA improving (NI/Assets vs prior year)
  if (niTTM != null && niPrev != null && assetsNow > 0 && assetsPrev > 0) {
    const roaNow = niTTM / assetsNow;
    const roaPrev = niPrev / assetsPrev;
    c.roa_improving = roaNow > roaPrev ? 1 : 0;
  } else c.roa_improving = 0;
  score += c.roa_improving;

  // 4. OCF > NI (quality of earnings: cash backs up reported income)
  c.ocf_gt_ni = (ocfTTM != null && niTTM != null && ocfTTM > niTTM) ? 1 : 0;
  score += c.ocf_gt_ni;

  // 5. Lower leverage (debt/assets) vs prior year
  if (debtNow != null && debtPrev != null && assetsNow > 0 && assetsPrev > 0) {
    const levNow = debtNow / assetsNow;
    const levPrev = debtPrev / assetsPrev;
    c.lev_down = levNow < levPrev ? 1 : 0;
  } else if (!debtNow && !debtPrev) {
    c.lev_down = 1; // no debt either year = max
  } else c.lev_down = 0;
  score += c.lev_down;

  // 6. Higher current ratio vs prior year
  if (caNow > 0 && clNow > 0 && caPrev > 0 && clPrev > 0) {
    c.liq_up = (caNow / clNow) > (caPrev / clPrev) ? 1 : 0;
  } else c.liq_up = 0;
  score += c.liq_up;

  // 7. No new shares issued (sharesOut decreasing or flat ±0.5%)
  if (sharesNow > 0 && sharesPrev > 0) {
    c.no_dilution = sharesNow <= sharesPrev * 1.005 ? 1 : 0;
  } else c.no_dilution = 0;
  score += c.no_dilution;

  // 8. Higher gross margin vs prior year
  if (grossNow != null && grossPrev != null && revNow > 0 && revPrev > 0) {
    c.margin_up = (grossNow / revNow) > (grossPrev / revPrev) ? 1 : 0;
  } else c.margin_up = 0;
  score += c.margin_up;

  // 9. Higher asset turnover vs prior year
  if (revNow != null && revPrev != null && assetsNow > 0 && assetsPrev > 0) {
    c.turnover_up = (revNow / assetsNow) > (revPrev / assetsPrev) ? 1 : 0;
  } else c.turnover_up = 0;
  score += c.turnover_up;

  return { score, components: c };
}

// Accruals ratio: (NI - OCF) / TotalAssets. High positive accruals signal
// earnings quality issues — net income outpacing real cash generation, often
// preceding writedowns or earnings revisions.
function _qs_accruals(trend) {
  if (!trend) return null;
  const niTTM = _qs_sum(trend.netIncome, 4);
  const ocfTTM = _qs_sum(trend.ocf, 4);
  const assetsAvg = (trend.totalAssets?.[0] && trend.totalAssets?.[4])
    ? (trend.totalAssets[0] + trend.totalAssets[4]) / 2
    : trend.totalAssets?.[0];
  if (niTTM == null || ocfTTM == null || !assetsAvg || assetsAvg <= 0) return null;
  return (niTTM - ocfTTM) / assetsAvg;
}

// Quality Score components
function _qs_quality(fin, risk, sector) {
  const trend = fin?.trend || fin || {};
  const periods = trend.periods || [];
  const n = periods.length;
  if (n < 2) return null;

  // ── Profitability (25 pts) ──
  // FCF margin: avg FCF / avg revenue (last 4Q)
  const revTTM = _qs_sum(trend.revenue, 4);
  const fcfTTM = _qs_sum(trend.fcf, 4);
  const niTTM = _qs_sum(trend.netIncome, 4);
  const opIncTTM = _qs_sum(trend.operatingIncome, 4);
  const grossTTM = _qs_sum(trend.grossProfit, 4);

  const fcfMargin = _qs_div(fcfTTM, revTTM);
  let pFcfMargin = 0;
  if (fcfMargin != null) {
    if (fcfMargin >= 0.20) pFcfMargin = 10;
    else if (fcfMargin >= 0.15) pFcfMargin = 8;
    else if (fcfMargin >= 0.10) pFcfMargin = 6;
    else if (fcfMargin >= 0.05) pFcfMargin = 3;
    else if (fcfMargin > 0) pFcfMargin = 1;
  }

  const netMargin = _qs_div(niTTM, revTTM);
  let pNetMargin = 0;
  if (netMargin != null) {
    if (netMargin >= 0.20) pNetMargin = 8;
    else if (netMargin >= 0.15) pNetMargin = 6;
    else if (netMargin >= 0.10) pNetMargin = 4;
    else if (netMargin >= 0.05) pNetMargin = 2;
    else if (netMargin > 0) pNetMargin = 1;
  }

  const grossMargin = _qs_div(grossTTM, revTTM);
  let pGrossMargin = 0;
  if (grossMargin != null) {
    if (grossMargin >= 0.50) pGrossMargin = 7;
    else if (grossMargin >= 0.35) pGrossMargin = 5;
    else if (grossMargin >= 0.25) pGrossMargin = 3;
    else if (grossMargin >= 0.15) pGrossMargin = 1;
  }

  const profitability = pFcfMargin + pNetMargin + pGrossMargin;

  // ── Capital Efficiency (20 pts) ──
  // ROIC proxy: NOPAT / InvestedCapital
  // NOPAT ≈ operatingIncome × (1 - 0.21)  (US tax assumption)
  // InvestedCapital ≈ totalEquity + debt - cash
  let roic = null;
  if (opIncTTM != null && trend.totalEquity?.[0] && trend.debt?.[0]) {
    const nopat = opIncTTM * 0.79;
    const equity = trend.totalEquity[0];
    const debt0 = trend.debt[0] || 0;
    const cash0 = trend.cash?.[0] || 0;
    const invested = equity + debt0 - cash0;
    if (invested > 0) roic = nopat / invested;
  }
  let pRoic = 0;
  if (roic != null) {
    if (roic >= 0.20) pRoic = 12;
    else if (roic >= 0.15) pRoic = 10;
    else if (roic >= 0.10) pRoic = 7;
    else if (roic >= 0.05) pRoic = 4;
    else if (roic > 0) pRoic = 1;
  }

  // Asset turnover proxy
  const assetTurnover = (revTTM != null && trend.totalAssets?.[0])
    ? revTTM / trend.totalAssets[0]
    : null;
  let pAssetTurn = 0;
  if (assetTurnover != null) {
    if (assetTurnover >= 1.0) pAssetTurn = 8;
    else if (assetTurnover >= 0.6) pAssetTurn = 6;
    else if (assetTurnover >= 0.3) pAssetTurn = 4;
    else if (assetTurnover > 0) pAssetTurn = 2;
  }

  const capitalEfficiency = pRoic + pAssetTurn;

  // ── Balance Sheet (20 pts) ──
  // Debt/EBITDA proxy: debt / (operatingIncome × 1.3 as EBITDA approx)
  let debtEbitda = null;
  if (trend.debt?.[0] != null && opIncTTM != null && opIncTTM > 0) {
    debtEbitda = trend.debt[0] / (opIncTTM * 1.3);
  }
  let pDebtEbitda = 0;
  if (debtEbitda != null) {
    if (debtEbitda <= 1) pDebtEbitda = 10;
    else if (debtEbitda <= 2) pDebtEbitda = 8;
    else if (debtEbitda <= 3) pDebtEbitda = 5;
    else if (debtEbitda <= 4) pDebtEbitda = 2;
  } else if (!trend.debt?.[0]) {
    // No debt = perfect
    pDebtEbitda = 10;
  }

  // Interest coverage: opIncome / interestExpense
  const intExpTTM = _qs_sum(trend.interestExpense, 4);
  let intCov = null;
  if (opIncTTM != null && intExpTTM != null && intExpTTM > 0) {
    intCov = opIncTTM / intExpTTM;
  }
  let pIntCov = 0;
  if (intCov != null) {
    if (intCov >= 15) pIntCov = 6;
    else if (intCov >= 8) pIntCov = 5;
    else if (intCov >= 4) pIntCov = 3;
    else if (intCov >= 2) pIntCov = 1;
  } else if (intExpTTM == null || intExpTTM === 0) {
    // No interest expense = perfect
    pIntCov = 6;
  }

  // Current ratio
  const currentRatio = (trend.currentAssets?.[0] && trend.currentLiabilities?.[0])
    ? trend.currentAssets[0] / trend.currentLiabilities[0]
    : null;
  let pCurrent = 0;
  if (currentRatio != null) {
    if (currentRatio >= 1.5) pCurrent = 4;
    else if (currentRatio >= 1.0) pCurrent = 3;
    else if (currentRatio >= 0.7) pCurrent = 1;
  }

  const balanceSheet = pDebtEbitda + pIntCov + pCurrent;

  // ── Growth (15 pts) ──
  // Revenue trend: avg of last 4Q vs avg of previous 4Q
  const rev4Recent = _qs_avg((trend.revenue || []).slice(0, 4));
  const rev4Prev = _qs_avg((trend.revenue || []).slice(4, 8));
  let revGrowth = null;
  if (rev4Recent != null && rev4Prev != null && rev4Prev > 0) {
    revGrowth = (rev4Recent - rev4Prev) / rev4Prev;
  }
  let pRevGrowth = 0;
  if (revGrowth != null) {
    if (revGrowth >= 0.15) pRevGrowth = 8;
    else if (revGrowth >= 0.08) pRevGrowth = 6;
    else if (revGrowth >= 0.03) pRevGrowth = 4;
    else if (revGrowth >= 0) pRevGrowth = 2;
  }

  // FCF trend
  const fcf4Recent = _qs_avg((trend.fcf || []).slice(0, 4));
  const fcf4Prev = _qs_avg((trend.fcf || []).slice(4, 8));
  let fcfGrowth = null;
  if (fcf4Recent != null && fcf4Prev != null && fcf4Prev > 0) {
    fcfGrowth = (fcf4Recent - fcf4Prev) / fcf4Prev;
  }
  let pFcfGrowth = 0;
  if (fcfGrowth != null) {
    if (fcfGrowth >= 0.10) pFcfGrowth = 7;
    else if (fcfGrowth >= 0.05) pFcfGrowth = 5;
    else if (fcfGrowth >= 0) pFcfGrowth = 3;
  }

  const growth = pRevGrowth + pFcfGrowth;

  // ── Dividend & Allocation (10 pts) ──
  // Buyback yield from sharesOutstanding trend
  const sharesNow = trend.sharesOutstanding?.[0];
  const sharesPrev = trend.sharesOutstanding?.[Math.min(7, n - 1)];
  let buybackYield = null;
  if (sharesNow && sharesPrev && sharesNow > 0) {
    // Approx 2y diff (8 quarters), annualize
    const yearsDiff = (n - 1) / 4;
    if (yearsDiff > 0) {
      buybackYield = ((sharesPrev - sharesNow) / sharesNow) / yearsDiff;
    }
  }
  let pBuyback = 0;
  if (buybackYield != null) {
    if (buybackYield >= 0.03) pBuyback = 5;
    else if (buybackYield >= 0.01) pBuyback = 4;
    else if (buybackYield >= 0) pBuyback = 3;
    else if (buybackYield >= -0.02) pBuyback = 1;
  }

  // Dividend payer bonus
  const divTTM = _qs_sum(trend.dividendsPaid, 4);
  const pDivPayer = (divTTM != null && divTTM > 0) ? 5 : 0;

  const dividendTrack = pBuyback + pDivPayer;

  // ── Predictability (10 pts) ──
  // Revenue surprise std dev proxy
  const revGrowths = [];
  for (let i = 0; i < Math.min(n - 1, 6); i++) {
    if (trend.revenue?.[i] && trend.revenue?.[i + 1] && trend.revenue[i + 1] > 0) {
      revGrowths.push((trend.revenue[i] - trend.revenue[i + 1]) / trend.revenue[i + 1]);
    }
  }
  let pRevPredict = 0;
  if (revGrowths.length >= 4) {
    const mean = revGrowths.reduce((s, v) => s + v, 0) / revGrowths.length;
    const std = Math.sqrt(revGrowths.reduce((s, v) => s + (v - mean) ** 2, 0) / revGrowths.length);
    if (std < 0.05) pRevPredict = 5;
    else if (std < 0.10) pRevPredict = 4;
    else if (std < 0.20) pRevPredict = 2;
    else pRevPredict = 1;
  }

  // Vol-adjusted from risk_metrics
  let pVolAdj = 0;
  if (risk?.volatility1y != null) {
    const vol = risk.volatility1y; // already in %
    if (vol < 15) pVolAdj = 5;
    else if (vol < 25) pVolAdj = 4;
    else if (vol < 35) pVolAdj = 2;
    else pVolAdj = 1;
  }

  const predictability = pRevPredict + pVolAdj;

  // ── Total ──
  const totalRaw = profitability + capitalEfficiency + balanceSheet + growth + dividendTrack + predictability;

  // ── Earnings quality penalties (Piotroski + Accruals) ──
  // These detect manipulation, value traps, and unreliable reported numbers.
  const piotroski = _qs_piotroski(trend);
  let piotroskiPenalty = 0;
  if (piotroski) {
    if (piotroski.score < 5) piotroskiPenalty = 15;       // weak quality, high risk
    else if (piotroski.score < 7) piotroskiPenalty = 5;   // mediocre
    // 7-9 = no penalty (strong)
  }

  const accruals = _qs_accruals(trend);
  let accrualsPenalty = 0;
  if (accruals != null) {
    if (accruals > 0.10) accrualsPenalty = 10;            // earnings outpacing cash
    else if (accruals > 0.05) accrualsPenalty = 5;        // mild concern
  }

  // Data completeness penalty
  const componentsWithData = [
    fcfMargin != null, netMargin != null, grossMargin != null,
    roic != null, assetTurnover != null,
    debtEbitda != null, intCov != null,
    revGrowth != null, fcfGrowth != null,
    risk?.volatility1y != null,
  ].filter(Boolean).length;
  const completeness = componentsWithData / 10;
  const penalty = completeness < 0.7 ? 10 : 0;

  const finalScore = Math.max(0, Math.round(totalRaw - penalty - piotroskiPenalty - accrualsPenalty));

  return {
    quality_score: finalScore,
    profitability: Math.round(profitability),
    capital_efficiency: Math.round(capitalEfficiency),
    balance_sheet: Math.round(balanceSheet),
    growth: Math.round(growth),
    dividend_track: Math.round(dividendTrack),
    predictability: Math.round(predictability),
    data_completeness: Math.round(completeness * 100) / 100,
    piotroski_score: piotroski?.score ?? null,
    piotroski_penalty: piotroskiPenalty,
    accruals_ratio: accruals,
    accruals_penalty: accrualsPenalty,
    inputs: {
      revTTM, fcfTTM, niTTM, opIncTTM, grossTTM,
      fcfMargin, netMargin, grossMargin, roic, assetTurnover,
      debtEbitda, intCov, currentRatio,
      revGrowth, fcfGrowth, buybackYield,
      vol1y: risk?.volatility1y,
      piotroskiScore: piotroski?.score ?? null,
      piotroskiComponents: piotroski?.components ?? null,
      accrualsRatio: accruals,
    },
  };
}

// Safety Score components
// Returns null if ticker is not a dividend payer (Safety is N/A — there's nothing to be safe).
// `ticker` is used to apply ticker-level carve-outs (asset managers, BDCs, MLPs)
// that distribute from a non-FCF source.
function _qs_safety(fin, risk, sector, dividendStreakYears, ticker) {
  const trend = fin?.trend || fin || {};
  const periods = trend.periods || [];
  const n = periods.length;
  if (n < 2) return null;

  const divTTM = _qs_sum(trend.dividendsPaid, 4);
  const fcfTTM = _qs_sum(trend.fcf, 4);
  const niTTM = _qs_sum(trend.netIncome, 4);
  const opIncTTM = _qs_sum(trend.operatingIncome, 4);

  // Non-dividend payer: Safety is N/A
  if (divTTM == null || divTTM === 0) {
    return null;
  }

  // ── Coverage (30 pts) ──
  let pFcfCov = 0;
  let fcfCov = null;
  if (divTTM != null && divTTM > 0 && fcfTTM != null) {
    fcfCov = fcfTTM / divTTM;
    if (fcfCov >= 3.0) pFcfCov = 15;
    else if (fcfCov >= 2.0) pFcfCov = 12;
    else if (fcfCov >= 1.5) pFcfCov = 9;
    else if (fcfCov >= 1.2) pFcfCov = 5;
    else if (fcfCov >= 1.0) pFcfCov = 2;
  } else if (divTTM == null || divTTM === 0) {
    // No paga dividendos = score N/A, default 10 (no risk de cut si no hay dividend)
    pFcfCov = 10;
  }

  // Payout ratio: use the WORSE of earnings-based and FCF-based.
  // FCF-based detects "value traps" (KHC 2018: 30% on earnings but 120% on FCF).
  let pPayout = 0;
  let payoutRatio = null;       // earnings-based (legacy)
  let fcfPayoutRatio = null;    // FCF-based (new)
  let payoutRatioWorst = null;  // max of the two — used for scoring
  if (divTTM != null && divTTM > 0 && niTTM != null && niTTM > 0) {
    payoutRatio = divTTM / niTTM;
  }
  if (divTTM != null && divTTM > 0 && fcfTTM != null && fcfTTM > 0) {
    fcfPayoutRatio = divTTM / fcfTTM;
  }
  if (payoutRatio != null || fcfPayoutRatio != null) {
    payoutRatioWorst = Math.max(payoutRatio || 0, fcfPayoutRatio || 0);
    if (payoutRatioWorst <= 0.30) pPayout = 5;
    else if (payoutRatioWorst <= 0.50) pPayout = 4;
    else if (payoutRatioWorst <= 0.65) pPayout = 3;
    else if (payoutRatioWorst <= 0.75) pPayout = 2;
    else if (payoutRatioWorst <= 0.90) pPayout = 1;
  } else if (divTTM == null || divTTM === 0) {
    pPayout = 3;
  }

  // FCF after estimated maintenance capex (~50% of total capex as rough proxy)
  let pFcfAfterMaint = 0;
  let fcfAfterMaintCov = null;
  const ocfTTM = _qs_sum(trend.ocf, 4);
  const capexTTM = _qs_sum(trend.capex, 4);
  if (ocfTTM != null && capexTTM != null && divTTM != null && divTTM > 0) {
    const maintCapex = Math.abs(capexTTM) * 0.5;
    const fcfAfter = ocfTTM - maintCapex;
    fcfAfterMaintCov = fcfAfter / divTTM;
    if (fcfAfterMaintCov >= 2.5) pFcfAfterMaint = 10;
    else if (fcfAfterMaintCov >= 1.8) pFcfAfterMaint = 8;
    else if (fcfAfterMaintCov >= 1.3) pFcfAfterMaint = 5;
    else if (fcfAfterMaintCov >= 1.0) pFcfAfterMaint = 2;
  } else if (divTTM == null || divTTM === 0) {
    pFcfAfterMaint = 7;
  }

  const coverage = pFcfCov + pPayout + pFcfAfterMaint;

  // ── Balance Sheet Stress (25 pts) ──
  // Reuse Quality logic but stricter thresholds
  let pDebt = 0;
  let debtEbitda = null;
  if (trend.debt?.[0] != null && opIncTTM != null && opIncTTM > 0) {
    debtEbitda = trend.debt[0] / (opIncTTM * 1.3);
    if (debtEbitda <= 1) pDebt = 10;
    else if (debtEbitda <= 2) pDebt = 8;
    else if (debtEbitda <= 3) pDebt = 5;
    else if (debtEbitda <= 4) pDebt = 2;
  } else if (!trend.debt?.[0]) {
    pDebt = 10;
  }

  let pIntCov = 0;
  const intExpTTM = _qs_sum(trend.interestExpense, 4);
  if (opIncTTM != null && intExpTTM != null && intExpTTM > 0) {
    const ic = opIncTTM / intExpTTM;
    if (ic >= 15) pIntCov = 8;
    else if (ic >= 10) pIntCov = 6;
    else if (ic >= 5) pIntCov = 4;
    else if (ic >= 3) pIntCov = 2;
  } else if (intExpTTM == null || intExpTTM === 0) {
    pIntCov = 8;
  }

  let pLiq = 0;
  const currentRatio = (trend.currentAssets?.[0] && trend.currentLiabilities?.[0])
    ? trend.currentAssets[0] / trend.currentLiabilities[0]
    : null;
  if (currentRatio != null) {
    if (currentRatio >= 1.5) pLiq = 7;
    else if (currentRatio >= 1.0) pLiq = 5;
    else if (currentRatio >= 0.7) pLiq = 3;
    else if (currentRatio >= 0.5) pLiq = 1;
  }

  const balanceSheet = pDebt + pIntCov + pLiq;

  // ── Track Record (20 pts) ──
  // Years without cut (passed in from positions/dividendos table)
  let pYears = 0;
  if (dividendStreakYears != null) {
    if (dividendStreakYears >= 50) pYears = 10;
    else if (dividendStreakYears >= 25) pYears = 9;
    else if (dividendStreakYears >= 20) pYears = 8;
    else if (dividendStreakYears >= 15) pYears = 7;
    else if (dividendStreakYears >= 10) pYears = 5;
    else if (dividendStreakYears >= 5) pYears = 3;
    else if (dividendStreakYears >= 1) pYears = 1;
  } else if (divTTM == null || divTTM === 0) {
    pYears = 0; // no dividend, no track
  } else {
    pYears = 2; // unknown, conservative default
  }

  // DGR consistency proxy: dividend stable in 8 quarters (no quarter < previous)
  let pConsist = 0;
  if (trend.dividendsPaid && trend.dividendsPaid.length >= 4) {
    const dividends = trend.dividendsPaid.filter(d => d != null);
    if (dividends.length >= 4) {
      let cuts = 0;
      for (let i = 0; i < dividends.length - 1; i++) {
        // dividends[0] is most recent → if dividends[i] < dividends[i+1] = cut detected
        if (dividends[i] < dividends[i + 1] * 0.95) cuts++;
      }
      if (cuts === 0) pConsist = 5;
      else if (cuts === 1) pConsist = 3;
      else pConsist = 0;
    }
  } else if (divTTM == null || divTTM === 0) {
    pConsist = 0;
  }

  // Recession survival (only if streak data available)
  let pRecession = 0;
  if (dividendStreakYears != null) {
    // 2026 - streak ≥ 2008? (18 years)
    if (dividendStreakYears >= 18) pRecession = 5;
    else if (dividendStreakYears >= 6) pRecession = 3;
    else pRecession = 1;
  } else {
    pRecession = 2;
  }

  const trackRecord = pYears + pConsist + pRecession;

  // ── Forward Visibility (15 pts) ──
  // Proxy: revenue trend acceleration / deceleration
  const rev4Recent = _qs_avg((trend.revenue || []).slice(0, 4));
  const rev4Prev = _qs_avg((trend.revenue || []).slice(4, 8));
  let revGrowth = null;
  if (rev4Recent != null && rev4Prev != null && rev4Prev > 0) {
    revGrowth = (rev4Recent - rev4Prev) / rev4Prev;
  }
  let pFwdGrowth = 0;
  if (revGrowth != null) {
    if (revGrowth >= 0.08) pFwdGrowth = 8;
    else if (revGrowth >= 0.04) pFwdGrowth = 6;
    else if (revGrowth >= 0) pFwdGrowth = 4;
    else if (revGrowth >= -0.05) pFwdGrowth = 2;
  }

  // Capex stability (pCapex 4 default)
  const pCapex = 3;

  // Estimate stability proxy from risk_metrics volatility
  let pEstStab = 0;
  if (risk?.volatility1y != null) {
    if (risk.volatility1y < 20) pEstStab = 4;
    else if (risk.volatility1y < 30) pEstStab = 2;
    else pEstStab = 1;
  }

  const forward = pFwdGrowth + pCapex + pEstStab;

  // ── Sector adjustment (10 pts) ──
  const sectorAdj = _qs_sectorBase(sector);

  // ── Hard penalty: FCF payout > 80% is a major red flag for unsustainable dividends ──
  // Detects value traps that look fine on earnings but can't be funded by cash.
  // Carve-out: asset managers, BDCs, MLPs distribute from carry/NII/DCF, not FCF —
  // applying this penalty produces false positives for them.
  let fcfPayoutPenalty = 0;
  const fcfPayoutCarveOut = ticker && FCF_PAYOUT_CARVEOUT.has(ticker);
  if (!fcfPayoutCarveOut && fcfPayoutRatio != null && fcfPayoutRatio > 0.80) {
    if (fcfPayoutRatio > 1.20) fcfPayoutPenalty = 20;       // burning cash to pay div
    else if (fcfPayoutRatio > 1.00) fcfPayoutPenalty = 15;  // 100%+ unsustainable
    else fcfPayoutPenalty = 10;                              // 80-100% stretched
  }

  const total = coverage + balanceSheet + trackRecord + forward + sectorAdj - fcfPayoutPenalty;

  return {
    safety_score: Math.max(0, Math.min(100, Math.round(total))),
    coverage: Math.round(coverage),
    balance_sheet: Math.round(balanceSheet),
    track_record: Math.round(trackRecord),
    forward: Math.round(forward),
    sector_adj: Math.round(sectorAdj),
    fcf_payout_penalty: fcfPayoutPenalty,
    inputs: {
      divTTM, fcfTTM, niTTM,
      fcfCoverage: fcfCov,
      payoutRatio,
      fcfPayoutRatio,
      payoutRatioWorst,
      fcfAfterMaintCov,
      debtEbitda,
      currentRatio,
      streakYears: dividendStreakYears,
      revGrowth,
      vol1y: risk?.volatility1y,
    },
  };
}

// Compute dividend streak (years without material cut) from company dividend history.
// Real-world challenges:
// - Current year is incomplete (e.g. only Q1 reported) → would falsely break streak
// - Calendar-year aggregates capture spinoffs/specials as fake "cuts"
// - Some companies have one-off year-boundary timing differences
// Strategy:
//   1. Skip current year if it's < 60% of previous year (clearly incomplete)
//      (was 70% — relaxed to avoid hiding moderate cuts that just happened)
//   2. Count a "cut" if drop is > 25% YoY (was 50%) — catches AT&T 2022,
//      Intel 2023, Cisco-style moderate cuts that the old threshold missed
//   3. Spinoff/special tolerance: if the AFTER value rebounds within next year,
//      treat the dip as a one-off and continue the streak
//   4. Walk backwards counting non-cut years
function _qs_streakFromHistory(divHistory) {
  if (!Array.isArray(divHistory) || divHistory.length < 2) return null;
  // Sort ascending by year
  const sorted = [...divHistory].sort((a, b) => a.year - b.year);
  // Filter years with positive total
  const valid = sorted.filter(r => r.total > 0);
  if (valid.length < 2) return null;

  // Determine end index — skip current year if clearly incomplete
  const currentYear = new Date().getFullYear();
  let endIdx = valid.length - 1;
  if (valid[endIdx].year === currentYear && endIdx > 0) {
    if (valid[endIdx].total < valid[endIdx - 1].total * 0.6) {
      endIdx--;
    }
  }

  // Walk backwards counting consecutive non-cut years.
  // Cut defined as drop > 25% YoY (catches moderate cuts).
  // Spinoff guard: if year-after rebounds within 5% of pre-dip value, treat as one-off.
  const CUT_THRESHOLD = 0.75; // cur must be >= 75% of prev
  let streak = 1;
  for (let i = endIdx; i > 0; i--) {
    const cur = valid[i].total;
    const prev = valid[i - 1].total;
    if (cur >= prev * CUT_THRESHOLD) {
      streak++;
    } else {
      // Possible spinoff/special: check if NEXT year (i+1) recovered close to prev
      const next = (i + 1 <= endIdx) ? valid[i + 1].total : null;
      if (next != null && next >= prev * 0.95) {
        // One-off dip surrounded by normal payments — keep streak
        streak++;
      } else {
        break;
      }
    }
  }
  return streak;
}

// Get dividend streak years.
// Priority order:
//   1. FMP /stable/dividends cached in agent_memory.dividend_history — TRUE streak
//   2. dividendos table (user's RECEIVED dividends since position open) — lower bound proxy
async function _qs_getDividendStreak(env, ticker, _fmpFin = null) {
  // Try FMP cached history first
  try {
    const histMap = await getDividendHistoryCache(env, [ticker]);
    if (histMap[ticker]) {
      const fromHistory = _qs_streakFromHistory(histMap[ticker]);
      if (fromHistory != null) return fromHistory;
    }
  } catch {}
  // Fallback: dividendos table (lower bound)
  try {
    const { results } = await env.DB.prepare(
      `SELECT MIN(SUBSTR(fecha, 1, 4)) as first_year, MAX(SUBSTR(fecha, 1, 4)) as last_year, COUNT(*) as cnt
       FROM dividendos WHERE ticker = ? AND (bruto > 0 OR neto > 0)`
    ).bind(ticker).all();
    const row = results?.[0];
    if (row && row.first_year && row.last_year && row.cnt >= 2) {
      const first = parseInt(row.first_year);
      const last = parseInt(row.last_year);
      return last - first + 1;
    }
  } catch {}
  return null;
}

// Detect material drops, coverage red flags, streak breaks, and compound
// degradation patterns. Insert into alerts table for the alerts panel.
async function _qs_detectScoreDrops(env, ticker, newQ, newS, sInputs, prevStreakYears, sector) {
  try {
    // FCF-related alerts are MISLEADING for REITs (FFO-based) and asset
    // managers / BDCs / MLPs (NII / DCF / carry). Quality + Safety score drops
    // still fire — only suppress the FCF coverage / payout red flags.
    const fcfAlertsCarvedOut = (sector && /real.?estate/i.test(sector))
      || FCF_PAYOUT_CARVEOUT.has(ticker);
    // Pull last 3 snapshots so we can detect compound/sustained degradation
    const { results } = await env.DB.prepare(
      `SELECT quality_score, safety_score, snapshot_date, inputs_json FROM quality_safety_scores
       WHERE ticker = ? AND snapshot_date < date('now')
       ORDER BY snapshot_date DESC LIMIT 3`
    ).bind(ticker).all();

    const today = new Date().toISOString().slice(0, 10);
    const insertAlert = async (tipo, titulo, detalle, valor) => {
      try {
        // Dedup: skip if same fecha+tipo+ticker already exists (idempotent reruns)
        const existing = await env.DB.prepare(
          "SELECT id FROM alerts WHERE fecha=? AND tipo=? AND ticker=? LIMIT 1"
        ).bind(today, tipo, ticker).first();
        if (existing) return;
        await env.DB.prepare(
          `INSERT INTO alerts (fecha, tipo, titulo, detalle, ticker, valor)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(today, tipo, titulo, detalle, ticker, valor).run();
      } catch {}
    };

    // If this ticker is now carved out from FCF alerts, sweep any stale
    // FCF alerts that may have been inserted today before the carve-out fix.
    if (fcfAlertsCarvedOut) {
      try {
        await env.DB.prepare(
          "DELETE FROM alerts WHERE fecha=? AND ticker=? AND tipo IN ('fcf_coverage_low','fcf_payout_high')"
        ).bind(today, ticker).run();
      } catch {}
    }

    // ── 1. FCF Coverage red flag (immediate, no history needed) ──
    if (!fcfAlertsCarvedOut) {
      const fcfCov = sInputs?.fcfCoverage;
      if (fcfCov != null && fcfCov < 1.5 && fcfCov > -10) {
        const sev = fcfCov < 1.0 ? "CUT RISK INMINENTE" : "Cobertura FCF baja";
        await insertAlert(
          "fcf_coverage_low",
          `${ticker}: ${sev} (FCF/Div ${fcfCov.toFixed(2)}x)`,
          `Cobertura FCF/Div = ${fcfCov.toFixed(2)}x. ${fcfCov < 1.0 ? 'La empresa NO genera caja suficiente para sostener el dividendo.' : 'Margen de seguridad insuficiente.'}`,
          Math.round(fcfCov * 100)
        );
      }

      // ── 2. FCF Payout > 100% (already penalized in score, but flag explicitly) ──
      const fcfPayout = sInputs?.fcfPayoutRatio;
      if (fcfPayout != null && fcfPayout > 1.0) {
        await insertAlert(
          "fcf_payout_high",
          `${ticker}: FCF Payout ${(fcfPayout*100).toFixed(0)}%`,
          `Payout sobre FCF = ${(fcfPayout*100).toFixed(0)}%. Insostenible si persiste.`,
          Math.round(fcfPayout * 100)
        );
      }
    }

    if (!results || !results.length) return;
    const prev = results[0];
    const dropQ = (prev.quality_score ?? 0) - (newQ ?? 0);
    const dropS = (prev.safety_score ?? 0) - (newS ?? 0);

    // ── 3. Material drop (lowered threshold from 10 to 5) ──
    if (dropQ >= 5) {
      const sev = dropQ >= 10 ? "GRAN" : "";
      await insertAlert(
        "quality_drop",
        `${ticker}: ${sev}Caída Quality ${dropQ.toFixed(0)} pts`,
        `Quality bajó de ${prev.quality_score} (${prev.snapshot_date}) a ${newQ}. Revisar tesis.`,
        -dropQ
      );
    }
    if (dropS >= 5) {
      const sev = dropS >= 10 ? "GRAN" : "";
      await insertAlert(
        "safety_drop",
        `${ticker}: ${sev}Caída Safety ${dropS.toFixed(0)} pts`,
        `Safety bajó de ${prev.safety_score} (${prev.snapshot_date}) a ${newS}. Riesgo dividendo creciente.`,
        -dropS
      );
    }

    // ── 4. Compound degradation: 3 consecutive snapshots dropping ──
    if (results.length >= 2) {
      const prev2 = results[1];
      const trend1 = (prev2.safety_score ?? 0) - (prev.safety_score ?? 0); // older→prev
      const trend2 = dropS;                                                  // prev→now
      if (trend1 > 0 && trend2 > 0 && (trend1 + trend2) >= 6) {
        await insertAlert(
          "safety_sustained_drop",
          `${ticker}: Safety cayendo 3 snapshots seguidos`,
          `Safety: ${prev2.safety_score} → ${prev.safety_score} → ${newS}. Tendencia compuesta de ${(trend1+trend2).toFixed(0)} pts. Patrón de deterioro sostenido.`,
          -(trend1 + trend2)
        );
      }
    }

    // ── 5. Streak broken (years_without_cut decreased) ──
    const newStreak = sInputs?.streakYears;
    if (prevStreakYears != null && newStreak != null && newStreak < prevStreakYears) {
      const lost = prevStreakYears - newStreak;
      await insertAlert(
        "dividend_streak_broken",
        `${ticker}: Streak ROTO (${prevStreakYears}y → ${newStreak}y)`,
        `Histórico sin recortes pasó de ${prevStreakYears} a ${newStreak} años (perdidos ${lost}). Posible recorte detectado.`,
        -lost
      );
    }
  } catch (e) {
    // Don't fail score compute if alert insert fails
  }
}

// Main compute function: combines all inputs and writes to D1
async function computeQualitySafetyScore(env, ticker) {
  const finMap = await getFmpFinancials(env, [ticker]);
  const fin = finMap[ticker];
  if (!fin) return { error: "no_fmp_financials_cache", ticker };

  const riskMap = await getRiskMetrics(env, [ticker]);
  const risk = riskMap[ticker] || null;

  // Get sector + position from positions table
  const { results: posRows } = await env.DB.prepare(
    `SELECT sector, last_price, div_ttm FROM positions WHERE ticker = ?`
  ).bind(ticker).all();
  const pos = posRows?.[0] || {};
  const sector = pos.sector || "";

  const streak = await _qs_getDividendStreak(env, ticker, fin);

  // REIT/MLP fix: some companies don't report dividendsPaid in cash flow statement
  // (FMP /stable uses different field names for REITs). If dividend history shows
  // they ARE a payer but cf statement is null, patch the trend with derived values
  // from dividendHistory × sharesOutstanding.
  const trend = fin.trend || fin || {};
  const divTTMfromCf = _qs_sum(trend.dividendsPaid, 4);
  if ((divTTMfromCf == null || divTTMfromCf === 0) && streak != null && streak >= 1) {
    // Patch trend with derived dividendsPaid from dividend_history
    const histMap = await getDividendHistoryCache(env, [ticker]);
    const history = histMap[ticker];
    if (Array.isArray(history) && history.length >= 2 && trend.sharesOutstanding?.[0]) {
      const sorted = [...history].sort((a, b) => b.year - a.year); // newest first
      const currentYear = new Date().getFullYear();
      // Use last complete year's DPS as TTM proxy
      let dpsAnnual = null;
      for (const r of sorted) {
        if (r.year !== currentYear && r.total > 0) {
          dpsAnnual = r.total;
          break;
        }
      }
      if (dpsAnnual && trend.sharesOutstanding[0]) {
        const annualDivDollars = dpsAnnual * trend.sharesOutstanding[0];
        // Distribute equally across last 4 quarters as approximation
        const perQuarter = annualDivDollars / 4;
        // Patch trend.dividendsPaid in-place (4 quarters as TTM)
        trend.dividendsPaid = [perQuarter, perQuarter, perQuarter, perQuarter, ...((trend.dividendsPaid || []).slice(4))];
      }
    }
  }

  const q = _qs_quality(fin, risk, sector);
  const s = _qs_safety(fin, risk, sector, streak, ticker);

  if (!q && !s) return { error: "compute_failed", ticker };

  const today = new Date().toISOString().slice(0, 10);
  const inputs = { quality: q?.inputs, safety: s?.inputs };

  await ensureQualitySafetyTable(env);
  await env.DB.prepare(
    `INSERT INTO quality_safety_scores (
       ticker, snapshot_date, quality_score, safety_score,
       q_profitability, q_capital_efficiency, q_balance_sheet, q_growth,
       q_dividend_track, q_predictability, q_data_completeness,
       s_coverage, s_balance_sheet, s_track_record, s_forward, s_sector_adj,
       inputs_json, computed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(ticker, snapshot_date) DO UPDATE SET
       quality_score = excluded.quality_score,
       safety_score = excluded.safety_score,
       q_profitability = excluded.q_profitability,
       q_capital_efficiency = excluded.q_capital_efficiency,
       q_balance_sheet = excluded.q_balance_sheet,
       q_growth = excluded.q_growth,
       q_dividend_track = excluded.q_dividend_track,
       q_predictability = excluded.q_predictability,
       q_data_completeness = excluded.q_data_completeness,
       s_coverage = excluded.s_coverage,
       s_balance_sheet = excluded.s_balance_sheet,
       s_track_record = excluded.s_track_record,
       s_forward = excluded.s_forward,
       s_sector_adj = excluded.s_sector_adj,
       inputs_json = excluded.inputs_json,
       computed_at = excluded.computed_at`
  ).bind(
    ticker, today,
    q?.quality_score ?? null, s?.safety_score ?? null,
    q?.profitability ?? null, q?.capital_efficiency ?? null,
    q?.balance_sheet ?? null, q?.growth ?? null,
    q?.dividend_track ?? null, q?.predictability ?? null, q?.data_completeness ?? null,
    s?.coverage ?? null, s?.balance_sheet ?? null,
    s?.track_record ?? null, s?.forward ?? null, s?.sector_adj ?? null,
    JSON.stringify(inputs)
  ).run();

  // Capture previous streak so we can detect streak-break alerts
  let prevStreakYears = null;
  try {
    const { results: prevRows } = await env.DB.prepare(
      `SELECT inputs_json FROM quality_safety_scores
       WHERE ticker = ? AND snapshot_date < date('now')
       ORDER BY snapshot_date DESC LIMIT 1`
    ).bind(ticker).all();
    if (prevRows?.[0]?.inputs_json) {
      const parsed = JSON.parse(prevRows[0].inputs_json);
      prevStreakYears = parsed?.safety?.streakYears ?? null;
    }
  } catch {}

  // Detect material drops, FCF coverage flags, streak breaks, compound degradation
  await _qs_detectScoreDrops(env, ticker, q?.quality_score, s?.safety_score, s?.inputs, prevStreakYears, sector);

  return {
    ok: true,
    ticker,
    snapshot_date: today,
    quality: q,
    safety: s,
    sector,
    streak_years: streak,
  };
}

// Batch compute for all positions
async function computeQualitySafetyAll(env, opts = {}) {
  await ensureQualitySafetyTable(env);

  // Pre-warm dividend_history cache so REIT/MLP FFO patch works correctly.
  // _qs_safety relies on dividend_history to detect streak + patch dividendsPaid
  // for issuers FMP doesn't report in cash flow. If cache is empty, scoring is
  // worse for REITs and high-yield names.
  try {
    const existing = (await getAgentMemory(env, "dividend_history")) || {};
    if (Object.keys(existing).length < 30) {
      console.log("[Q+S] Pre-warming dividend_history cache (empty/stale)");
      await cacheDividendHistory(env, { limit: 30 });
    }
  } catch (e) {
    console.error("[Q+S] dividend_history pre-warm failed:", e.message);
  }

  const { results: positions } = await env.DB.prepare(
    "SELECT ticker FROM positions WHERE shares > 0"
  ).all();
  const offset = opts.offset || 0;
  const limit = opts.limit || 0;
  const sliced = limit > 0 ? positions.slice(offset, offset + limit) : positions;

  let computed = 0, failed = 0;
  const results = [];
  for (const p of sliced) {
    try {
      const r = await computeQualitySafetyScore(env, p.ticker);
      if (r.ok) {
        computed++;
        results.push({ ticker: p.ticker, q: r.quality?.quality_score, s: r.safety?.safety_score });
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
  }
  return { computed, failed, total: sliced.length, portfolio: positions.length, results };
}

// ── Forward Dividend Yield helper (bonus, uses cached fmp_financials) ──
async function computeForwardYield(env, ticker) {
  const finMap = await getFmpFinancials(env, [ticker]);
  const fin = finMap[ticker];
  if (!fin) return { error: "no_cache", ticker };
  const trend = fin.trend || {};
  const dividends = trend.dividendsPaid || [];
  const sharesArr = trend.sharesOutstanding || [];

  // Most recent quarterly dividend per share
  const lastDividendTotal = dividends[0];
  const lastShares = sharesArr[0];
  const lastDPS = (lastDividendTotal != null && lastShares != null && lastShares > 0)
    ? lastDividendTotal / lastShares
    : null;
  // TTM dividend total
  const ttmDividendTotal = _qs_sum(dividends, 4);
  const ttmDPS = (ttmDividendTotal != null && lastShares != null && lastShares > 0)
    ? ttmDividendTotal / lastShares
    : null;
  // Forward = last quarter × 4
  const fwdDPS = lastDPS != null ? lastDPS * 4 : null;

  const { results: posRows } = await env.DB.prepare(
    `SELECT last_price, div_yield FROM positions WHERE ticker = ?`
  ).bind(ticker).all();
  const pos = posRows?.[0] || {};
  const price = pos.last_price;

  const ttmYield = pos.div_yield ?? null; // already in %
  const fwdYield = (fwdDPS != null && price != null && price > 0)
    ? (fwdDPS / price) * 100
    : null;
  const impliedDgr = (fwdDPS != null && ttmDPS != null && ttmDPS > 0)
    ? ((fwdDPS / ttmDPS) - 1) * 100
    : null;

  return {
    ticker,
    price,
    ttm_dps: ttmDPS,
    fwd_dps: fwdDPS,
    ttm_yield_pct: ttmYield,
    fwd_yield_pct: fwdYield != null ? Math.round(fwdYield * 100) / 100 : null,
    implied_dgr_pct: impliedDgr != null ? Math.round(impliedDgr * 100) / 100 : null,
  };
}

// ─── Agent 0: Market Regime (runs FIRST) ───────────────────────
async function runRegimeAgent(env, fecha) {
  const mkt = await getMarketIndicators(env);
  if (!Object.keys(mkt).length) return { agent: "regime", skipped: true, reason: "no market data" };

  // Build sector/factor comparisons
  const spy = mkt['SPY'];
  const sectorPerf = ['XLK','XLF','XLE','XLV','XLU','XLP','XLI','XLRE'].map(t => ({
    ticker: t, changePct: mkt[t]?.changePct, change5d: mkt[t]?.change5dPct,
  }));
  const factorPerf = ['QUAL','MTUM','VLUE'].map(t => ({
    ticker: t, changePct: mkt[t]?.changePct, change5d: mkt[t]?.change5dPct,
    vsSpyPct: (mkt[t]?.changePct || 0) - (spy?.changePct || 0),
  }));

  const system = `You are a market regime analyst. Determine the current market state.
Analyze:
- Cyclicals (XLF/XLE/XLI) vs defensives (XLU/XLP/XLV): if defensives lead = risk-off
- Credit (HYG/LQD falling = stress, TLT rising = flight-to-quality)
- Factors (QUAL+MTUM+VLUE all losing vs SPY = indiscriminate selling)
- VIX level and trend
Respond ONLY JSON:
{"severity":"info|warning|critical","title":"short title","summary":"3-4 sentence regime assessment",
"details":{"regime":"bull|bear|transition-down|transition-up","regimeConfidence":1-10,
"breadthSignal":"healthy|deteriorating|collapsed|recovering",
"creditStress":"none|mild|elevated|severe","factorSignal":"rational-rotation|indiscriminate-selling|risk-on|mixed",
"safeHavens":"working|failing|mixed","actionGuidance":"full-risk|reduce-risk|defensive|cash-priority",
"sectorLeaders":[],"sectorLaggards":[],"vixRegime":"low|normal|elevated|crisis"},
"score":1-10}
Score 1=crisis, 10=strong bull.`;

  const userContent = {
    spy: { price: spy?.price, changePct: spy?.changePct, change5d: spy?.change5dPct },
    vix: { price: mkt['^VIX']?.price, changePct: mkt['^VIX']?.changePct },
    sectors: sectorPerf,
    factors: factorPerf,
    credit: { HYG: mkt['HYG'], LQD: mkt['LQD'], TLT: mkt['TLT'], SHY: mkt['SHY'] },
    commodities: { GLD: mkt['GLD'], USO: mkt['USO'], DBC: mkt['DBC'] },
    dollar: mkt['UUP'],
    fecha,
  };

  const rawInsight = await callAgentClaude(env, system, userContent);
  let insight = Array.isArray(rawInsight) ? rawInsight[0] : rawInsight;
  if (!insight || typeof insight !== 'object') insight = { severity: "warning", title: "Regime analysis", summary: String(rawInsight).slice(0, 500), details: {}, score: 5 };
  insight.ticker = "_REGIME_";

  // Save regime to agent_memory for other agents
  await setAgentMemory(env, "regime_current", {
    fecha,
    regime: insight.details?.regime,
    actionGuidance: insight.details?.actionGuidance,
    creditStress: insight.details?.creditStress,
    vixRegime: insight.details?.vixRegime,
    score: insight.score,
  });

  const stored = await storeInsights(env, "regime", fecha, [insight]);
  return { agent: "regime", insights: stored };
}

// ─── Agent 1: Earnings Monitor ─────────────────────────────────
async function runEarningsAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, sector FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "earnings", skipped: true };

  const tickers = positions.map(p => p.ticker);
  const placeholders = tickers.map(() => "?").join(",");
  const { results: fundamentals } = await env.DB.prepare(
    `SELECT symbol, earnings, income, estimates, rev_segments, geo_segments, grades FROM fundamentals WHERE symbol IN (${placeholders})`
  ).bind(...tickers).all();

  const fundMap = {};
  for (const f of fundamentals) {
    fundMap[f.symbol] = {
      earnings: f.earnings ? JSON.parse(f.earnings) : null,
      income: f.income ? JSON.parse(f.income) : null,
      estimates: f.estimates ? JSON.parse(f.estimates) : null,
      revSegments: f.rev_segments ? JSON.parse(f.rev_segments) : null,
      geoSegments: f.geo_segments ? JSON.parse(f.geo_segments) : null,
      grades: f.grades ? JSON.parse(f.grades) : null,
    };
  }

  // Load GuruFocus ranks (kept until Phase 4b replaces with FMP-derived equivalents)
  const gfMap = await getGfData(env, tickers);

  // Load FMP quarterly trends (revenue, FCF, margins, EPS) — same source the
  // Dividend agent already uses. Lets the model see whether a quarterly miss
  // is part of a trend or a one-off, instead of evaluating each quarter blind.
  const finMap = await getFmpFinancials(env, tickers);

  // ── Cross-agent ground-truth: earnings_trend signals (added 2026-04-08) ──
  // earnings_trend (no LLM) runs BEFORE this agent in the pipeline so we can
  // ingest its deterministic 2+ misses + margin compression flags. The audit
  // (Audit A finding #2) recommended folding earnings_trend output into this
  // LLM agent so the user gets ONE coherent verdict per ticker.
  const earningsTrendMap = {};
  try {
    const { results: etRows } = await env.DB.prepare(
      `SELECT ticker, severity, summary, details FROM agent_insights
       WHERE agent_name = 'earnings_trend' AND fecha = ?`
    ).bind(fecha).all();
    for (const r of (etRows || [])) {
      try {
        const det = JSON.parse(r.details || '{}');
        earningsTrendMap[r.ticker] = {
          severity: r.severity,
          consecutiveMisses: det.consecutiveMisses,
          marginCompressionBps: det.marginCompressionBps,
          revGrowthYoY: det.revGrowthYoY,
          summary: r.summary,
        };
      } catch {}
    }
  } catch (e) { console.error("[Earnings] earnings_trend load failed:", e.message); }

  // Load most recent transcript per ticker. Tickers stored without exchange prefix
  // (BME:/HKG:/LSE: stripped at download time, see /api/download-transcripts).
  const transcriptMap = {};
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS earnings_transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      quarter TEXT NOT NULL,
      year INTEGER NOT NULL,
      content TEXT NOT NULL,
      date TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(ticker, quarter, year)
    )`).run();
    const stripTickers = tickers.map(t => t.replace(/^(BME:|HKG:|LSE:)/, ''));
    const tPlaceholders = stripTickers.map(() => "?").join(",");
    const { results: trRows } = await env.DB.prepare(
      `SELECT ticker, quarter, year, content, date FROM earnings_transcripts
       WHERE ticker IN (${tPlaceholders})
       ORDER BY year DESC, quarter DESC, date DESC`
    ).bind(...stripTickers).all();
    for (const row of trRows) {
      // Keep only the most recent per ticker
      if (!transcriptMap[row.ticker]) {
        transcriptMap[row.ticker] = {
          quarter: row.quarter,
          year: row.year,
          date: row.date,
          // First ~3000 chars = management prepared remarks (highest signal)
          excerpt: typeof row.content === "string" ? row.content.slice(0, 3000) : "",
        };
      }
    }
  } catch (e) {
    console.error("[Earnings] transcript load failed:", e.message);
  }

  // Helper: pick last 6 quarters of a trend series, rounded to 2 decimals
  const last6 = (arr) => Array.isArray(arr) ? arr.slice(0, 6) : null;
  // Helper: compute YoY-style margin compression flag
  const buildTrends = (ticker) => {
    const fin = finMap[ticker];
    if (!fin) return null;
    const t = fin.trend || fin || {};
    if (!t.periods?.length) return null;
    return {
      periods: last6(t.periods),
      revenue: last6(t.revenue),
      netIncome: last6(t.netIncome),
      operatingIncome: last6(t.operatingIncome),
      grossProfit: last6(t.grossProfit),
      fcf: last6(t.fcf),
      ocf: last6(t.ocf),
      eps: last6(t.eps),
    };
  };

  const allPosData = positions.filter(p => fundMap[p.ticker]?.earnings).map(p => {
    const f = fundMap[p.ticker];
    const gf = gfMap[p.ticker] || {};
    const e = f.earnings;
    const stripKey = p.ticker.replace(/^(BME:|HKG:|LSE:)/, '');
    const tr = transcriptMap[stripKey];
    return {
      ticker: p.ticker, name: p.name, sector: p.sector,
      earnings: Array.isArray(e) ? e.slice(0, 2) : e,
      estimates: f.estimates?.slice?.(0, 1),
      revSegments: f.revSegments?.slice?.(0, 1),
      geoSegments: f.geoSegments?.slice?.(0, 1),
      analystGrades: Array.isArray(f.grades) ? f.grades.slice(0, 3) : null,
      gfGrowthRank: gf.growthRank, gfMomentumRank: gf.momentumRank,
      gfProfitabilityRank: gf.profitabilityRank,
      // Quarterly trends (last 6 quarters) — context for "trend vs one-off"
      trends: buildTrends(p.ticker),
      // Most recent earnings call transcript (management commentary)
      transcript: tr ? { period: `${tr.quarter} ${tr.year}`, date: tr.date, excerpt: tr.excerpt } : null,
      // Cross-agent ground-truth — only present if flagged today
      earningsTrendSignal: earningsTrendMap[p.ticker] || null,
    };
  });

  if (!allPosData.length) {
    await storeInsights(env, "earnings", fecha, [{ ticker: "_GLOBAL_", severity: "info", title: "Sin datos de earnings", summary: "No hay datos de earnings disponibles.", details: {}, score: 5 }]);
    return { agent: "earnings", insights: 0 };
  }

  const system = `You are a senior earnings analyst for a LONG-TERM dividend income portfolio ($1.35M, buy-and-hold).
The owner holds positions for years/decades. Temporary earnings dips are NORMAL in business cycles.
NEVER recommend selling quality on temporary dips — this is a buy-and-hold dividend portfolio.

YOU NOW HAVE EARNINGS CALL TRANSCRIPTS. Use them as the PRIMARY source for tone and context:
- The numerical surprise (EPS/revenue beat or miss) tells you WHAT happened.
- The transcript tells you WHY it happened and what management plans to do.
- Combine both: a -8% EPS miss with management explaining a one-time legal charge AND reaffirming guidance is INFO, not WARNING.
- A +2% EPS beat with management warning about deteriorating demand for next quarter is WARNING despite the beat.
- When citing the transcript, quote a SHORT phrase (under 15 words) from management in transcript_insight.
- If no transcript provided for a ticker, set transcript_insight to "No transcript" and rely on numerical data only.

YOU NOW HAVE 6-QUARTER TREND DATA (revenue, netIncome, operatingIncome, grossProfit, fcf, ocf, eps).
- ALWAYS check the trend before flagging a quarter as critical:
  * A -8% EPS miss in isolation looks bad. If the prior 5 quarters were +12%, +8%, +5%, +9%, +6%, this is a single-quarter blip → WARNING at most.
  * A -3% miss following -2%, -5%, -7% misses is a real deteriorating trend → WARNING or CRITICAL.
- Margin trend: compute (operatingIncome / revenue) for each of the last 6 quarters. Flag CRITICAL only if margins compressed AND revenue is also declining.
- If trends are improving but the latest quarter is one-off bad, the answer is INFO with explanation, not warning.
- Trends array is most-recent-first: trends.revenue[0] is the LATEST quarter.

CROSS-AGENT GROUND-TRUTH SIGNAL (added 2026-04-08):
You now receive an earningsTrendSignal field per ticker (only when flagged):
- Fields: severity, consecutiveMisses (count of YoY op income misses), marginCompressionBps, revGrowthYoY, summary.
- This is a deterministic pattern detector that ran BEFORE you. If it flagged a ticker, the misses are real.
- If present with severity=critical and your trends agree → reflect it (warning or critical).
- If present but the transcript explains a one-off cause AND management gives credible recovery plan → you may keep it info but EXPLAIN.
- If null, the deterministic detector found no pattern — proceed normally.
DO NOT mention the signal explicitly in your summary field unless it changes your verdict.

CONTEXT IS EVERYTHING:
- One-time write-downs, impairments, restructuring charges are NOT operational problems. Explain what happened.
- A company investing in growth (higher capex, R&D) may show lower earnings temporarily — that's POSITIVE.
- Seasonal businesses (HRB = tax season, retail = Q4) have naturally weak quarters. Don't flag off-season results.
- Compare to the TREND, not just one quarter.
- If EPS beats estimates AND management tone is constructive, it CANNOT be critical. Period.

DISTINGUISH TEMPORARY VS STRUCTURAL:
- Temporary: one-time charges, FX headwinds, weather, supply chain hiccups, restructuring with clear plan, deferred revenue timing, M&A integration costs. → info (or warning if large but explained).
- Structural: secular demand decline, market share loss to disruptors, margin compression with no plan, repeated guidance cuts, management evasiveness on the call. → warning or critical.

SEVERITY (conservative — long-term portfolio):
- critical = structural business decline: revenue falling 3+ consecutive quarters AND margins compressing AND no credible turnaround in transcript. Max 2 criticals across the portfolio.
- warning = operational miss that could affect dividends OR management tone clearly negative on forward demand
- info = normal quarter, beat, minor miss, explained one-time, or constructive management commentary

Respond ONLY JSON array:
[{"ticker":"XX","severity":"info|warning|critical","title":"short title","summary":"2-3 sentences combining numerical result with management's explanation","details":{"epsSurprise":-5.3,"revenueSurprise":2.1,"marginTrend":"stable|improving|deteriorating","context":"one-time|cyclical|structural|growth-investment","transcript_insight":"1-2 sentences citing what management said (short quote in quotes if possible)","keyRisks":[]},"score":1-10}]
Include entries for tickers with notable findings (beat/miss, guidance change, or important transcript signal). Skip uneventful quarters. Score: 1=structural decline, 5=normal mixed, 10=strong beat with bullish guidance.`;

  // Process in batches of 12 (transcripts add ~3KB per ticker, smaller than dividend's 15)
  const BATCH_SIZE = 12;
  const allInsights = [];

  for (let i = 0; i < allPosData.length; i += BATCH_SIZE) {
    const batch = allPosData.slice(i, i + BATCH_SIZE);
    try {
      const batchResult = await callAgentClaude(env, system, { positions: batch }, { model: "claude-opus-4-20250514" });
      const batchInsights = Array.isArray(batchResult) ? batchResult : [batchResult];
      allInsights.push(...batchInsights);
    } catch (e) {
      console.error(`[Earnings] Batch ${i / BATCH_SIZE + 1} failed:`, e.message);
    }
    if (i + BATCH_SIZE < allPosData.length) await new Promise(r => setTimeout(r, 5000));
  }

  const stored = await storeInsights(env, "earnings", fecha, allInsights);
  return { agent: "earnings", insights: stored, total: allPosData.length };
}

// ─── Agent 2: Dividend Safety ──────────────────────────────────
async function runDividendAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, div_ttm, div_yield, yoc, sector FROM positions WHERE shares > 0 AND div_ttm > 0"
  ).all();
  if (!positions.length) return { agent: "dividend", skipped: true };

  const tickers = positions.map(p => p.ticker);
  const placeholders = tickers.map(() => "?").join(",");
  const { results: fundamentals } = await env.DB.prepare(
    `SELECT symbol, ratios, cashflow, dividends, key_metrics, owner_earnings FROM fundamentals WHERE symbol IN (${placeholders})`
  ).bind(...tickers).all();

  // Pull Q+S inputs_json for AUTHORITATIVE TTM figures (fcfTTM, divTTM,
  // fcfCoverage, payoutRatioWorst, debtEbitda, currentRatio, streakYears).
  // The dividend agent previously read latestCF.freeCashFlowPerShare which is
  // a SINGLE-PERIOD per-share value — for FLO this caused "FCF $89M" when the
  // real TTM was ~$329M. Q+S already computes correct values per-ticker.
  let qsInputsByTicker = {};
  try {
    const { results: qsRows } = await env.DB.prepare(
      `SELECT qss.ticker, qss.inputs_json, qss.quality_score, qss.safety_score
         FROM quality_safety_scores qss
         INNER JOIN (
           SELECT ticker, MAX(snapshot_date) AS max_date
           FROM quality_safety_scores
           WHERE ticker IN (${placeholders})
           GROUP BY ticker
         ) latest
           ON qss.ticker = latest.ticker
          AND qss.snapshot_date = latest.max_date`
    ).bind(...tickers).all();
    for (const r of (qsRows || [])) {
      try {
        const parsed = JSON.parse(r.inputs_json || "{}");
        qsInputsByTicker[r.ticker] = {
          safety: parsed.safety || {},
          quality: parsed.quality || {},
          qualityScore: r.quality_score,
          safetyScore: r.safety_score,
        };
      } catch {}
    }
  } catch (e) {
    console.error("[Dividend] Q+S inputs load failed:", e.message);
  }

  // Real dividend payments from dividendos table (last 2 years)
  const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
  const { results: realDivs } = await env.DB.prepare(
    `SELECT ticker, fecha, bruto, neto FROM dividendos WHERE fecha >= ? ORDER BY fecha DESC`
  ).bind(twoYearsAgo).all();

  const realDivMap = {};
  for (const d of realDivs) {
    if (!realDivMap[d.ticker]) realDivMap[d.ticker] = [];
    realDivMap[d.ticker].push(d);
  }

  // ── Cross-agent ground-truth signals (added 2026-04-08 per Audit A merge) ──
  // dividend_cut_warning + analyst_downgrade now run BEFORE this agent in the
  // pipeline. We read their per-ticker output here so Opus can produce ONE
  // coherent verdict per dividend payer instead of having 3 cards disagreeing.
  const cutWarningMap = {};
  const downgradeMap = {};
  try {
    const { results: cwRows } = await env.DB.prepare(
      `SELECT ticker, severity, summary, details FROM agent_insights
       WHERE agent_name = 'dividend_cut_warning' AND fecha = ?`
    ).bind(fecha).all();
    for (const r of (cwRows || [])) {
      try {
        const det = JSON.parse(r.details || '{}');
        cutWarningMap[r.ticker] = {
          severity: r.severity,
          ttmCoverage: det.ttmCoverageNow,
          fcfPayoutPct: det.fcfPayoutNow,
          fcfGrowthYoY: det.fcfGrowthYoY,
          summary: r.summary,
        };
      } catch {}
    }
  } catch (e) { console.error("[Dividend] cut_warning load failed:", e.message); }
  try {
    const { results: dgRows } = await env.DB.prepare(
      `SELECT ticker, severity, summary, details FROM agent_insights
       WHERE agent_name = 'analyst_downgrade' AND fecha = ?`
    ).bind(fecha).all();
    for (const r of (dgRows || [])) {
      try {
        const det = JSON.parse(r.details || '{}');
        downgradeMap[r.ticker] = {
          severity: r.severity,
          deltaPts: det.deltaPts,
          analystsCovering: det.analystsCovering,
          summary: r.summary,
        };
      } catch {}
    }
  } catch (e) { console.error("[Dividend] analyst_downgrade load failed:", e.message); }

  const fundMap = {};
  for (const f of fundamentals) {
    fundMap[f.symbol] = {
      ratios: f.ratios ? JSON.parse(f.ratios) : null,
      cashflow: f.cashflow ? JSON.parse(f.cashflow) : null,
      dividends: f.dividends ? JSON.parse(f.dividends) : null,
      keyMetrics: f.key_metrics ? JSON.parse(f.key_metrics) : null,
      ownerEarnings: f.owner_earnings ? JSON.parse(f.owner_earnings) : null,
    };
  }

  // Load GuruFocus data (for scalar fields: financialStrength, shareholderYield, etc.)
  // and FMP financials (for trends — replaces gf.trend)
  const [gfMap, fmpFinMap] = await Promise.all([
    getGfData(env, tickers),
    getFmpFinancials(env, tickers),
  ]);

  // Classify tickers for context
  const REITS = new Set(['AMT','ARE','CLPR','CUBE','ESS','HR','IIPR','KRG','MDV','NNN','O','STAG','SUI','VICI','WPC','XLRE','NET.UN']);
  const BDCS = new Set(['MAIN','OBDC','MSDL']);
  const ETFS = new Set(['SCHD','DIVO','BIZD','SPHD','FDJU','WEEL']);
  const PREFS = new Set(['IIPR-PRA','LANDP']);

  const allPosData = positions.map(p => {
    const f = fundMap[p.ticker] || {};
    const gf = gfMap[p.ticker] || {};
    // Prefer FMP trends (richer, fresher), fall back to GF if FMP cache empty
    const trend = fmpFinMap[p.ticker]?.trend || gf.trend || {};
    const latestRatios = Array.isArray(f.ratios) ? f.ratios[0] : f.ratios;
    const latestCF = Array.isArray(f.cashflow) ? f.cashflow[0] : f.cashflow;
    const ownerE = Array.isArray(f.ownerEarnings) ? f.ownerEarnings[0] : f.ownerEarnings;
    const category = REITS.has(p.ticker) ? 'REIT' : BDCS.has(p.ticker) ? 'BDC' : ETFS.has(p.ticker) ? 'ETF' : PREFS.has(p.ticker) ? 'PREFERRED' : 'COMPANY';

    // AUTHORITATIVE TTM figures from Q+S inputs_json (computed by _qs_safety
    // using _qs_sum over last 4 quarters). Falls back to legacy per-share
    // fields only if Q+S has no snapshot for this ticker.
    const qs = qsInputsByTicker[p.ticker] || {};
    const qsSafety = qs.safety || {};

    return {
      ticker: p.ticker, name: p.name, sector: p.sector,
      category, // REIT, BDC, ETF, PREFERRED, or COMPANY
      divTTM: p.div_ttm, yield: p.div_yield, yoc: p.yoc,

      // ── TTM cash-flow figures (authoritative — from Q+S) ──
      dividendsPaidTTM: qsSafety.divTTM ?? null,
      fcfTTM:           qsSafety.fcfTTM ?? null,
      netIncomeTTM:     qsSafety.niTTM ?? null,
      fcfCoverageTTM:   qsSafety.fcfCoverage ?? null,
      payoutRatioEarnings: qsSafety.payoutRatio ?? null,
      payoutRatioFCF:      qsSafety.fcfPayoutRatio ?? null,
      payoutRatioWorst:    qsSafety.payoutRatioWorst ?? null,
      fcfAfterMaintCoverage: qsSafety.fcfAfterMaintCov ?? null,
      debtToEbitda:      qsSafety.debtEbitda ?? null,
      currentRatio:      qsSafety.currentRatio ?? null,
      dividendStreakYears: qsSafety.streakYears ?? null,
      qualityScore: qs.qualityScore ?? null,
      safetyScore:  qs.safetyScore ?? null,

      // ── Legacy fields (fallback only — kept for sectors w/o Q+S snapshot) ──
      payoutRatio: latestRatios?.payoutRatio || latestRatios?.dividendPayoutRatio,
      fcfPerShare: latestCF?.freeCashFlowPerShare,
      ownerEarningsPerShare: ownerE?.ownerEarningsPerShare,
      debtToEquity: latestRatios?.debtEquityRatio,
      interestCoverage: latestRatios?.interestCoverage,

      dividendHistory: Array.isArray(f.dividends) ? f.dividends.slice(0, 4) : null,
      realPayments: (realDivMap[p.ticker] || []).slice(0, 3),
      gfFinancialStrength: gf.financialStrength,
      gfShareholderYield: gf.shareholderYield,
      gfBuybackYield: gf.buybackYield,
      gfDividendStreakSince: gf.dividendStreakSince,
      // Quarterly trends (8 quarters) for context analysis (FMP Ultimate, GF fallback)
      trendRevenue: trend.revenue?.slice(0, 6),
      trendFCF: trend.fcf?.slice(0, 6),
      trendDebt: trend.debt?.slice(0, 4),
      trendDivPaid: trend.dividendsPaid?.slice(0, 4),

      // Cross-agent ground-truth signals (only present if flagged today)
      cutWarningSignal: cutWarningMap[p.ticker] || null,
      analystDowngradeSignal: downgradeMap[p.ticker] || null,
    };
  });

  const system = `You are a senior dividend analyst for a LONG-TERM income portfolio ($1.35M, China fiscal resident, 10% WHT).
This portfolio is buy-and-hold focused on growing dividend income over decades. The owner does NOT want to sell on temporary dips.

CRITICAL CONTEXT — DO NOT give false alarms:
- A dividend CUT to pay down debt is often BULLISH (management prioritizing balance sheet health). Mark as "warning" not "critical".
- A high payout ratio in a REIT is NORMAL (REITs distribute 90%+ by law). Use FFO/AFFO payout instead.
- BDCs (MAIN, OBDC, etc.) have high payouts by design — evaluate NAV coverage, not earnings payout.
- ETFs/CEFs (SCHD, DIVO, BIZD, SPHD, etc.) don't have traditional payout ratios — evaluate distribution history.
- Preferred shares (IIPR-PRA, LANDP) have FIXED dividends — only flag if company is in financial distress.
- A company trading below fair value with a high yield is an OPPORTUNITY, not a crisis.
- Temporary earnings dips (restructuring, one-time charges) don't threaten long-term dividends if FCF is healthy.

COVERAGE ANALYSIS — USE THE TTM FIELDS, NOT THE LEGACY PER-SHARE FIELDS:
- fcfTTM, dividendsPaidTTM, fcfCoverageTTM are DOLLAR totals over the trailing 4 quarters. These are authoritative.
- payoutRatioWorst = max(payoutRatioEarnings, payoutRatioFCF) — use this for cut-risk decisions.
- fcfPerShare / payoutRatio (legacy) are single-period and may be ~4x understated. IGNORE them when fcfTTM is present.
- Cite numbers as "FCF TTM $XXM covering dividends $YYM = Z.Zx" using the TTM fields.
- If fcfCoverageTTM >= 1.5 and payoutRatioWorst <= 0.75 → cutRisk: low (do NOT mark high regardless of trend wobble).
- If fcfCoverageTTM < 1.0 OR payoutRatioWorst > 1.0 → genuine stress, cutRisk: high.
- safetyScore (0-100) and qualityScore (0-100) are pre-computed by the Q+S engine — use them as a sanity check on your verdict.

TREND ANALYSIS (use trendRevenue, trendFCF, trendDebt, trendDivPaid — most recent quarter first):
- If debt is DECREASING over 4+ quarters AND dividend was cut → STRATEGIC restructuring, likely positive. Score 6+.
- If FCF is INCREASING while revenue is flat → margin improvement, dividend is safer. Score 7+.
- If debt is INCREASING AND FCF is DECREASING → genuine stress. Score 3-4.
- If dividendsPaid dropped but FCF is strong → voluntary cut to invest or pay debt. Explain WHY.
- Always analyze the DIRECTION of the trend, not just the latest number.

CROSS-AGENT GROUND-TRUTH SIGNALS (added 2026-04-08):
You now receive two pre-computed signals per ticker (when flagged):
- cutWarningSignal: if present, the deterministic FCF analyzer flagged this ticker.
  Fields: severity (warning/critical), ttmCoverage, fcfPayoutPct, fcfGrowthYoY, summary.
  → If present with severity=critical, you SHOULD reflect that risk in your verdict (warning at minimum).
  → If present but the trend data shows a clear strategic explanation (debt paydown, restructuring),
    you may keep it info but EXPLAIN why you're overriding the signal.
- analystDowngradeSignal: if present, sell-side analysts cut sentiment in the last ~14 days.
  Fields: severity, deltaPts, analystsCovering, summary.
  → Treat as a directional warning. Doesn't override fundamentals, but lower your conviction one notch.
For tickers with NO signals present, those fields are null — proceed normally with your TTM analysis.
DO NOT mention these signals in your output summary unless they materially change your verdict.

SEVERITY (be conservative — only "critical" for REAL danger):
- critical = company is genuinely at risk of bankruptcy or permanent dividend elimination. Max 2-3 across entire portfolio.
- warning = dividend freeze likely, or payout unsustainable WITHOUT a clear strategic reason
- info = safe, growing, or strategically sound even if ratios look stressed

For EACH ticker: one-line verdict with context. Explain WHY, not just numbers.

Respond ONLY JSON array:
[{"ticker":"XX","severity":"info|warning|critical","title":"2-4 word verdict","summary":"1-2 sentences explaining the CONTEXT behind the numbers","details":{"payoutRatio":null,"fcfCoverage":null,"gfFinancialStrength":null,"cutRisk":"low|medium|high","context":"strategic|stressed|stable|growing"},"score":1-10}]
Include ALL tickers. Score: 1=bankruptcy risk, 5=needs monitoring, 8=solid, 10=fortress.`;

  // Process in batches of 15 to stay under token limits
  const BATCH_SIZE = 15;
  const allInsights = [];

  for (let i = 0; i < allPosData.length; i += BATCH_SIZE) {
    const batch = allPosData.slice(i, i + BATCH_SIZE);
    try {
      const batchResult = await callAgentClaude(env, system, { positions: batch }, { model: "claude-opus-4-20250514" });
      const batchInsights = Array.isArray(batchResult) ? batchResult : [batchResult];
      allInsights.push(...batchInsights);
    } catch (e) {
      console.error(`[Dividend] Batch ${i / BATCH_SIZE + 1} failed:`, e.message);
    }
    // Small delay between batches
    if (i + BATCH_SIZE < allPosData.length) await new Promise(r => setTimeout(r, 5000));
  }

  const stored = await storeInsights(env, "dividend", fecha, allInsights);
  return { agent: "dividend", insights: stored, total: allPosData.length };
}

// ─── Agent 3: Macro Sentinel (Sonnet — complex narrative synthesis) ───
async function runMacroAgent(env, fecha) {
  const fmpKey = env.FMP_KEY;
  const today = new Date();
  const weekAgo = new Date(today - 7 * 86400000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  // FMP economic calendar + treasury
  let econEvents = [], treasuryRates = [];
  try {
    const [econResp, treasuryResp] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/economic-calendar?from=${weekAgo}&to=${todayStr}&apikey=${fmpKey}`),
      fetch(`https://financialmodelingprep.com/stable/treasury?from=${weekAgo}&to=${todayStr}&apikey=${fmpKey}`),
    ]);
    if (econResp.ok) econEvents = await econResp.json();
    if (treasuryResp.ok) treasuryRates = await treasuryResp.json();
  } catch (e) { console.error("Macro FMP fetch error:", e.message); }

  // Market indicators from cache (sectors, factors, credit, commodities)
  const mkt = await getMarketIndicators(env);

  // Current regime from agent_memory
  const regime = await getAgentMemory(env, "regime_current");

  // Portfolio sector breakdown
  const { results: sectorRows } = await env.DB.prepare(
    "SELECT sector, SUM(market_value) as total FROM positions WHERE shares > 0 GROUP BY sector"
  ).all();

  // Margin interest (cost of leverage)
  const { results: marginRows } = await env.DB.prepare(
    "SELECT mes, SUM(interes_usd) as total FROM margin_interest GROUP BY mes ORDER BY mes DESC LIMIT 3"
  ).all();

  const system = `You are a macro strategist analyzing a $1.35M dividend income portfolio (88 stocks, China fiscal resident, 10% WHT US-China treaty).

FIRST reason step by step:
1. REGIME: Risk-on, risk-off or transition? Use sector and factor data
2. CREDIT: HYG/LQD spreads indicate stress? TLT flight-to-quality or sell-off?
3. FACTORS: QUAL/MTUM/VLUE vs SPY — rational rotation or indiscriminate selling?
4. SECTORS: Defensives (XLU/XLP/XLV) outperforming? Cyclicals (XLF/XLE/XLI) weak?
5. COMMODITIES: GLD/USO signal inflation/geopolitics?
6. IMPLICATION for dividend stocks: which portfolio sectors at risk?

SEVERITY CALIBRATION:
- critical = credit spreads blowing out (HYG -3%+ in week) or regime shift to bear
- warning = sector rotation hurting portfolio or rate surprise
- info = stable environment, minor shifts

Respond ONLY JSON:
{"severity":"info|warning|critical","title":"short title","summary":"4-5 sentence connected narrative synthesis (NOT a list of data points)",
"details":{"regime":"risk-on|risk-off|transition","regimeConfidence":1-10,
"creditStress":"none|mild|elevated|severe","factorSignal":"rational-rotation|indiscriminate-selling|risk-on|mixed",
"sectorLeaders":[],"sectorLaggards":[],"rateOutlook":"","inflationTrend":"",
"commoditySignal":"","portfolioImplications":[],"keyRisks":[],"opportunities":[]},
"score":1-10}`;

  const userContent = {
    currentRegime: regime,
    marketIndicators: mkt,
    economicEvents: Array.isArray(econEvents) ? econEvents.slice(0, 25) : [],
    treasuryRates: Array.isArray(treasuryRates) ? treasuryRates.slice(0, 5) : [],
    portfolioSectors: sectorRows,
    marginInterest: marginRows,
    fecha: todayStr,
  };

  // Downgraded Opus → Haiku 2026-04-08. Audit finding: macro produced generic
  // prose ("defensives outperforming, stay long dividend stocks") that Opus
  // can't add unique value to. Haiku at 5x cheaper is sufficient for this
  // template-style synthesis. If we ever want real Opus-quality macro analysis
  // we should bring it back only weekly, not daily, and track one concrete
  // prediction (e.g. "HYG will drop >2% in 5d") to score the agent.
  const rawInsight = await callAgentClaude(env, system, userContent, { model: "claude-haiku-4-5-20251001" });
  let insight = Array.isArray(rawInsight) ? rawInsight[0] : rawInsight;
  if (!insight || typeof insight !== 'object') insight = { severity: "info", title: "Macro analysis", summary: String(rawInsight).slice(0, 500), details: {}, score: 5 };
  insight.ticker = "_MACRO_";
  const stored = await storeInsights(env, "macro", fecha, [insight]);
  return { agent: "macro", insights: stored };
}

// ─── Agent 4: Portfolio Risk ───────────────────────────────────
async function runRiskAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, market_value, sector, pnl_pct, div_yield, category FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "risk", skipped: true };

  const totalValue = positions.reduce((s, p) => s + (p.market_value || 0), 0);

  // NLV history for drawdown
  const { results: nlvHistory } = await env.DB.prepare(
    "SELECT fecha, nlv FROM nlv_history ORDER BY fecha DESC LIMIT 60"
  ).all();

  // Compute concentration metrics
  const sorted = [...positions].sort((a, b) => (b.market_value || 0) - (a.market_value || 0));
  const top5Weight = sorted.slice(0, 5).reduce((s, p) => s + (p.market_value || 0), 0) / (totalValue || 1);
  const maxWeight = (sorted[0]?.market_value || 0) / (totalValue || 1);

  const sectorMap = {};
  for (const p of positions) {
    const s = p.sector || "Unknown";
    sectorMap[s] = (sectorMap[s] || 0) + (p.market_value || 0);
  }
  const sectorWeights = Object.entries(sectorMap).map(([s, v]) => ({ sector: s, weight: v / (totalValue || 1), value: v })).sort((a, b) => b.weight - a.weight);

  // Max drawdown from NLV
  let maxDrawdown = 0;
  if (nlvHistory.length > 1) {
    let peak = nlvHistory[nlvHistory.length - 1]?.nlv || 0;
    for (let i = nlvHistory.length - 2; i >= 0; i--) {
      const nlv = nlvHistory[i]?.nlv || 0;
      if (nlv > peak) peak = nlv;
      const dd = (peak - nlv) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
  }

  // Margin interest cost
  const { results: marginRows } = await env.DB.prepare(
    "SELECT mes, SUM(interes_usd) as total FROM margin_interest GROUP BY mes ORDER BY mes DESC LIMIT 3"
  ).all();

  // Current regime context
  const regime = await getAgentMemory(env, "regime_current");

  // FMP-derived risk metrics per position (with GF fallback for tickers not yet cached)
  const tickers = positions.map(p => p.ticker);
  const [riskMap, gfMap] = await Promise.all([
    getRiskMetrics(env, tickers),
    getGfData(env, tickers),
  ]);
  // Merge: prefer FMP-calculated, fall back to GF
  const metricsFor = (ticker) => {
    const fm = riskMap[ticker];
    if (fm) return { source: 'FMP', ...fm };
    const gf = gfMap[ticker] || {};
    if (gf.beta != null) return { source: 'GF', beta: gf.beta, volatility1y: gf.volatility1y, sharpe: gf.sharpe, sortino: gf.sortino, maxDrawdown1y: gf.maxDrawdown1y };
    return null;
  };
  const positionRiskMetrics = sorted.slice(0, 15).map(p => {
    const m = metricsFor(p.ticker);
    if (!m) return null;
    return { ticker: p.ticker, ...m };
  }).filter(Boolean);

  // Portfolio weighted beta (FMP-first)
  const weightedBeta = positions.reduce((s, p) => {
    const m = metricsFor(p.ticker);
    if (!m?.beta) return s;
    return s + m.beta * ((p.market_value || 0) / (totalValue || 1));
  }, 0);

  const system = `You are a portfolio risk analyst for a $1.35M dividend income portfolio with ${positions.length} positions.
Evaluate the PORTFOLIO AS A WHOLE (concentration, diversification, drawdown, leverage, regime alignment).
Use the per-position risk metrics in positionRiskMetrics as INPUTS for your analysis, not as separate outputs.

PHILOSOPHY (CRITICAL):
- This is a LONG-TERM buy-and-hold dividend portfolio. NEVER recommend selling quality positions during temporary drawdowns.
- A position down 30% is an opportunity to add, not exit, IF the dividend is intact and the business fundamentals are sound.
- High volatility on individual quality dividend stocks is normal during corrections — focus on PORTFOLIO-level concentration and sector diversification.
- The owner does NOT trade. Don't recommend "REDUCE", "EXIT", or "SELL" unless there is real bankruptcy risk.

SEVERITY CALIBRATION:
- critical = single position >15% AND business in bankruptcy risk, OR portfolio max drawdown >15%, OR margin cost > dividend income, OR portfolio beta >1.3
- warning = top 5 > 40%, OR portfolio drawdown >8%, OR single sector >50%, OR weighted beta >1.0
- info = well-diversified, manageable drawdown, beta <0.8

CRITICAL OUTPUT FORMAT — YOU MUST FOLLOW EXACTLY:
Respond with EXACTLY ONE JSON OBJECT (no array, no wrapper). Begin your response with { and end with }.
Schema (all fields required):
{"severity":"info","title":"Diversified portfolio under sector pressure","summary":"Three-four sentences explaining portfolio-level risk posture, concentration, drawdown context, and how it aligns with current regime. Long-term focus.","details":{"concentrationScore":7,"diversificationScore":6,"portfolioBeta":0.85,"sectorConcentration":"Top sector 28% (Consumer Staples)","leverageCostVsIncome":"Margin cost \\$2k/mo vs \\$8k dividends — 25%","regimeAlignment":"Defensive tilt fits transition-down regime","topRisks":["China concentration ~20%","Rate-sensitive REITs ~25%","Drawdown 8%"],"recommendations":["Hold quality positions","Avoid adding leverage","Wait for sector rotation"]},"score":6}

Do NOT return an array. Do NOT return per-position rows. Return ONE object describing the portfolio. The example above shows the exact shape expected.`;

  const userContent = {
    totalNLV: totalValue,
    positionCount: positions.length,
    top5: sorted.slice(0, 5).map(p => ({ ticker: p.ticker, weight: (p.market_value || 0) / (totalValue || 1) })),
    top5Weight: Math.round(top5Weight * 1000) / 10,
    maxSingleWeight: Math.round(maxWeight * 1000) / 10,
    sectorWeights,
    maxDrawdown60d: Math.round(maxDrawdown * 1000) / 10,
    nlvTrend: nlvHistory.slice(0, 10),
    categories: positions.reduce((acc, p) => { acc[p.category || "OTHER"] = (acc[p.category || "OTHER"] || 0) + 1; return acc; }, {}),
    marginInterest: marginRows,
    currentRegime: regime,
    weightedBeta: Math.round(weightedBeta * 100) / 100,
    positionRiskMetrics,
  };

  // Downgraded Opus → Haiku 2026-04-08. Audit finding: the numerical risk
  // computations (top5, sector Herfindahl, maxDD, weightedBeta) happen in
  // code BEFORE the LLM is called. Opus was only paraphrasing them while
  // fighting its own instinct to recommend SELL. Haiku can paraphrase fine.
  // Saves ~$0.03/run.
  const rawInsight = await callAgentClaude(env, system, userContent, { model: "claude-haiku-4-5-20251001" });
  let insight = Array.isArray(rawInsight) ? rawInsight[0] : rawInsight;
  // Validate it's a portfolio insight (has severity/title), otherwise wrap or fallback
  if (!insight || typeof insight !== 'object' || !insight.severity || !insight.title) {
    insight = { severity: "warning", title: "Risk analysis fallback", summary: typeof rawInsight === 'string' ? rawInsight.slice(0, 500) : JSON.stringify(rawInsight).slice(0, 500), details: {}, score: 5 };
  }
  insight.ticker = "_PORTFOLIO_";
  const stored = await storeInsights(env, "risk", fecha, [insight]);
  return { agent: "risk", insights: stored };
}

// ─── Agent 5: Trade Advisor (single Opus synthesis) ──────────
// Simplified 2026-04-08 per audit: the previous 3-call pipeline
// (Haiku bull → Haiku bear → Opus synth) was theatrical duplication.
// The two Haiku debates just re-derived the same inputs the other agents
// (dividend, earnings, value, insider) already produced with better focus.
// Single Opus call reading all todayInsights directly is cleaner and
// saves ~$0.08/run. Bull/bear reasoning now happens inside the Opus
// synthesis prompt.
async function runTradeAgent(env, fecha) {
  // Read today's insights from all other agents
  const { results: todayInsights } = await env.DB.prepare(
    "SELECT agent_name, ticker, severity, title, summary, score FROM agent_insights WHERE fecha = ? AND agent_name != 'trade'"
  ).bind(fecha).all();

  // Latest AI analysis per ticker
  const { results: aiAnalyses } = await env.DB.prepare(
    `SELECT a.ticker, a.score, a.action, a.summary FROM ai_analysis a
     INNER JOIN (SELECT ticker, MAX(updated_at) as max_date FROM ai_analysis GROUP BY ticker) b
     ON a.ticker = b.ticker AND a.updated_at = b.max_date`
  ).all();

  // Positions + fundamentals
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, market_value, avg_price, last_price, pnl_pct, div_yield FROM positions WHERE shares > 0"
  ).all();

  const tickers = positions.map(p => p.ticker);
  let dcfMap = {};
  if (tickers.length) {
    const placeholders = tickers.map(() => "?").join(",");
    const { results: fundRows } = await env.DB.prepare(
      `SELECT symbol, dcf, price_target, grades FROM fundamentals WHERE symbol IN (${placeholders})`
    ).bind(...tickers).all();
    for (const f of fundRows) {
      dcfMap[f.symbol] = {
        dcf: f.dcf ? JSON.parse(f.dcf) : null,
        priceTarget: f.price_target ? JSON.parse(f.price_target) : null,
        grades: f.grades ? JSON.parse(f.grades) : null,
      };
    }
  }

  const regime = await getAgentMemory(env, "regime_current");

  // GuruFocus: valuation + insider/guru activity
  const gfMap = await getGfData(env, tickers);

  const posData = positions.map(p => {
    const gf = gfMap[p.ticker] || {};
    return {
      ticker: p.ticker, name: p.name, shares: p.shares,
      price: p.last_price, avgCost: p.avg_price, pnlPct: p.pnl_pct,
      yield: p.div_yield, value: p.market_value,
      aiScore: aiAnalyses.find(a => a.ticker === p.ticker)?.score,
      aiAction: aiAnalyses.find(a => a.ticker === p.ticker)?.action,
      fairValue: dcfMap[p.ticker]?.dcf?.[0]?.dcf || dcfMap[p.ticker]?.dcf?.dcf,
      priceTarget: dcfMap[p.ticker]?.priceTarget?.[0]?.targetConsensus || dcfMap[p.ticker]?.priceTarget?.targetConsensus,
      analystConsensus: dcfMap[p.ticker]?.grades?.slice?.(0, 2),
      // GuruFocus exclusive — valuation & smart money
      gfValue: gf.gfValue, gfScore: gf.gfScore,
      gfValuation: gf.gfValuation, priceToGfValue: gf.priceToGfValue,
      peterLynchFV: gf.peterLynchFV,
      guruBuys13f: gf.guruBuys13f, guruSells13f: gf.guruSells13f,
      insiderBuys3m: gf.insiderBuys3m, insiderSells3m: gf.insiderSells3m,
      rsi14: gf.rsi14,
    };
  }).slice(0, 30);

  // ── Single-step Opus synthesis (replaces 3-call bull/bear/synth) ──
  const synthSystem = `You are a senior portfolio advisor for a LONG-TERM dividend income portfolio ($1.35M, buy-and-hold, China fiscal resident).
The owner's goal is GROWING INCOME over decades, not trading for capital gains. The owner does NOT actively trade — default is HOLD.

YOUR TASK: Read the attached \`todayInsights\` from other agents (dividend, earnings, value, insider, SEC filings, options, regime). For each position worth action, think through BOTH bull and bear cases internally (no need to output them separately), then emit a final recommendation. Focus on ADD opportunities over SELL.

DATA AVAILABLE per position:
- Valuation: gfValue, gfScore, priceToGfValue (< 0.8 = undervalued), peterLynchFV, fairValue (DCF), priceTarget
- Smart money: guruBuys13f, guruSells13f, insiderBuys3m, insiderSells3m
- Momentum: rsi14, pnlPct, aiScore, aiAction, analystConsensus
- Fundamentals from other agents' insights (linked by ticker)

FUNDAMENTAL PHILOSOPHY (CRITICAL):
- Selling a quality dividend grower during a temporary dip is the WORST mistake. If fundamentals are intact, HOLD or ADD.
- SELL only if: the business model is permanently broken, or dividend is eliminated with no path to recovery.
- TRIM only if: position is dangerously overweight (>10% of portfolio) AND fundamentally impaired.
- ADD if: quality company trading below fair value with intact dividend and favorable smart-money signals.
- Companies restructuring (cutting costs, paying debt, refocusing) are often BUYS not SELLS.

Current market: ${regime?.regime || 'unknown'} (${regime?.actionGuidance || 'unknown'})

SEVERITY (conservative — don't recommend selling quality companies):
- critical = SELL only if business is in genuine structural decline. Max 1-2 sells across entire portfolio.
- warning = worth reviewing, but default is HOLD unless you have strong evidence.
- info = no action needed, position is fine.

Respond ONLY JSON array: [{"ticker":"XX","severity":"info|warning|critical","title":"ACTION: Ticker",
"summary":"2-3 sentence rationale that implicitly weighs bull vs bear",
"details":{"action":"BUY|SELL|HOLD|TRIM|ADD","conviction":"low|medium|high",
"bullSummary":"one-line strongest bull case","bearSummary":"one-line strongest bear case","targetPrice":null,"timeHorizon":"short|medium|long"},
"score":1-10}]
Max 10 most actionable recommendations. Favor ADD over HOLD over TRIM over SELL. Score = conviction (1=low, 10=very high).`;

  // Wrap the Opus synth in try/catch so a 529 overload doesn't break the
  // pipeline. Single-call version — no bull/bear Haiku pre-steps.
  let synthResult;
  try {
    synthResult = await callAgentClaude(env, synthSystem, {
      todayInsights,
      positions: posData.slice(0, 20),
      regime,
    }, { model: "claude-opus-4-20250514" });
  } catch (e) {
    console.error(`[trade] Opus synth failed after retries: ${e.message}`);
    synthResult = [{
      ticker: "_TRADE_",
      severity: "info",
      title: "Trade Advisor: síntesis Opus no disponible",
      summary: `La síntesis final falló tras reintentos (${e.message.slice(0, 100)}). Los argumentos bull/bear se generaron correctamente. Reintentar manualmente desde el botón del tab Agentes.`,
      details: { action: "HOLD", conviction: "low", error: e.message.slice(0, 200) },
      score: 5,
    }];
  }

  // Store signals for future postmortem tracking
  const signals = Array.isArray(synthResult) ? synthResult : [synthResult];
  for (const s of signals) {
    if (s.ticker && s.details?.action && s.details.action !== 'HOLD') {
      const pos = positions.find(p => p.ticker === s.ticker);
      if (pos) {
        await env.DB.prepare(
          `INSERT INTO signal_tracking (original_fecha, ticker, action, price_at_signal, div_at_signal)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(original_fecha, ticker) DO UPDATE SET action=excluded.action, price_at_signal=excluded.price_at_signal`
        ).bind(fecha, s.ticker, s.details.action, pos.last_price, pos.div_yield).run();
      }
    }
  }

  const stored = await storeInsights(env, "trade", fecha, signals);
  return { agent: "trade", insights: stored };
}

// ─── Agent 6: Signal Postmortem (pure calculation, no LLM) ─────
async function runPostmortemAgent(env, fecha) {
  // Find signals from 7 days and 30 days ago that haven't been evaluated
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { results: pendingSignals } = await env.DB.prepare(
    `SELECT * FROM signal_tracking WHERE
     (original_fecha <= ? AND price_7d IS NULL) OR
     (original_fecha <= ? AND price_30d IS NULL)
     ORDER BY original_fecha ASC LIMIT 50`
  ).bind(sevenDaysAgo, thirtyDaysAgo).all();

  if (!pendingSignals.length) return { agent: "postmortem", evaluated: 0 };

  // Get current prices for these tickers
  const tickers = [...new Set(pendingSignals.map(s => s.ticker))];
  const placeholders = tickers.map(() => "?").join(",");
  const { results: priceRows } = await env.DB.prepare(
    `SELECT ticker, last_price, div_yield FROM positions WHERE ticker IN (${placeholders})`
  ).bind(...tickers).all();

  const priceMap = {};
  for (const p of priceRows) priceMap[p.ticker] = p;

  let evaluated = 0;
  let correct = 0;
  let incorrect = 0;

  for (const signal of pendingSignals) {
    const current = priceMap[signal.ticker];
    if (!current?.last_price) continue;

    const currentPrice = current.last_price;
    const priceDiff = currentPrice - signal.price_at_signal;
    const pnlPct = signal.price_at_signal > 0 ? (priceDiff / signal.price_at_signal * 100) : 0;

    const daysSince = Math.floor((Date.now() - new Date(signal.original_fecha).getTime()) / 86400000);

    if (daysSince >= 7 && !signal.price_7d) {
      const pnl7d = pnlPct;
      let outcome7d = "neutral";
      if ((signal.action === "BUY" || signal.action === "ADD") && pnl7d > 2) outcome7d = "correct";
      else if ((signal.action === "BUY" || signal.action === "ADD") && pnl7d < -2) outcome7d = "incorrect";
      else if ((signal.action === "SELL" || signal.action === "TRIM") && pnl7d < -2) outcome7d = "correct";
      else if ((signal.action === "SELL" || signal.action === "TRIM") && pnl7d > 2) outcome7d = "incorrect";

      await env.DB.prepare(
        "UPDATE signal_tracking SET price_7d = ?, pnl_7d_pct = ?, outcome = ?, evaluated_at = datetime('now') WHERE id = ?"
      ).bind(currentPrice, Math.round(pnl7d * 100) / 100, outcome7d, signal.id).run();

      if (outcome7d === "correct") correct++;
      else if (outcome7d === "incorrect") incorrect++;
      evaluated++;
    }

    if (daysSince >= 30 && !signal.price_30d) {
      await env.DB.prepare(
        "UPDATE signal_tracking SET price_30d = ?, pnl_30d_pct = ?, evaluated_at = datetime('now') WHERE id = ?"
      ).bind(currentPrice, Math.round(pnlPct * 100) / 100, signal.id).run();
      evaluated++;
    }
  }

  // Compute overall accuracy and store in agent_memory
  const { results: allEvaluated } = await env.DB.prepare(
    "SELECT outcome, COUNT(*) as cnt FROM signal_tracking WHERE outcome IS NOT NULL GROUP BY outcome"
  ).all();
  const stats = {};
  for (const r of allEvaluated) stats[r.outcome] = r.cnt;
  const total = (stats.correct || 0) + (stats.incorrect || 0) + (stats.neutral || 0);
  const accuracy = total > 0 ? Math.round((stats.correct || 0) / total * 100) : 0;

  await setAgentMemory(env, "signal_accuracy", {
    fecha, accuracy, total,
    correct: stats.correct || 0,
    incorrect: stats.incorrect || 0,
    neutral: stats.neutral || 0,
  });

  // Store as insight if there are evaluated signals
  if (evaluated > 0) {
    await storeInsights(env, "postmortem", fecha, [{
      ticker: "_POSTMORTEM_",
      severity: accuracy < 40 ? "critical" : accuracy < 60 ? "warning" : "info",
      title: `Signal Accuracy: ${accuracy}% (${total} signals)`,
      summary: `${correct} correct, ${incorrect} incorrect, ${stats.neutral || 0} neutral out of ${total} evaluated signals. Evaluated ${evaluated} new signals today.`,
      details: { accuracy, total, correct, incorrect, neutral: stats.neutral || 0, evaluatedToday: evaluated },
      score: accuracy / 10,
    }]);
  }

  return { agent: "postmortem", evaluated, accuracy, correct, incorrect };
}

// ─── Dividend Cut/Raise Detection ─────────────────────────────
// Compares live DPS (annualized from recent dividendos) with stored div_ttm
// Alerts if change > 5%. Stores in alerts table with tipo DIV_CUT / DIV_RAISE
async function checkDividendChanges(env) {
  const today = new Date().toISOString().slice(0, 10);
  const FMP_KEY = env.FMP_KEY;
  const FMP_BASE = "https://financialmodelingprep.com/stable";

  // 1. Get all positions with shares > 0 and div_ttm > 0 (skip new/zero positions)
  const positions = await env.DB.prepare(
    "SELECT ticker, name, shares, div_ttm, last_price FROM positions WHERE shares > 0 AND div_ttm > 0"
  ).all();
  const posList = positions.results || [];
  if (!posList.length) return { checked: 0, alerts: 0 };

  // 2. Compute live DPS for each position (same logic as /api/dividend-dps-live)
  const POS_TO_DIV_ALIASES = {
    "BME:VIS":["VIS","VIS.D","VISCOFAN"],"BME:AMS":["AMS","AMS.D"],
    "HKG:9618":["9618","JD"],"HKG:1052":["1052"],"HKG:1910":["1910"],
    "HKG:2219":["2219"],"HKG:9616":["9616"],
    "IIPR-PRA":["IIPR PRA","IIPRPRA"],
  };

  const recentDate = new Date(Date.now() - 420 * 86400000).toISOString().slice(0, 10);
  const recentDivs = await env.DB.prepare(
    "SELECT ticker, fecha, bruto, shares FROM dividendos WHERE fecha >= ? ORDER BY fecha DESC"
  ).bind(recentDate).all();

  const paymentsByTicker = {};
  for (const row of (recentDivs.results || [])) {
    if (!paymentsByTicker[row.ticker]) paymentsByTicker[row.ticker] = [];
    paymentsByTicker[row.ticker].push(row);
  }

  const findPayments = (ticker) => {
    if (paymentsByTicker[ticker]?.length) return paymentsByTicker[ticker];
    const aliases = POS_TO_DIV_ALIASES[ticker];
    if (aliases) {
      for (const alt of aliases) {
        if (paymentsByTicker[alt]?.length) return paymentsByTicker[alt];
      }
    }
    return [];
  };

  const deduplicateByDate = (payments) => {
    const byDate = {};
    for (const p of payments) {
      if (!byDate[p.fecha]) byDate[p.fecha] = { ...p, bruto: 0 };
      byDate[p.fecha].bruto += (p.bruto || 0);
    }
    return Object.values(byDate).sort((a, b) => b.fecha.localeCompare(a.fecha));
  };

  const detectFrequency = (payments) => {
    const deduped = deduplicateByDate(payments);
    if (deduped.length < 2) return 4;
    const ttmCutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const count = deduped.filter(p => p.fecha >= ttmCutoff).length;
    if (count >= 11) return 12;
    if (count >= 3) return 4;
    if (deduped.length >= 2) {
      const gapDays = Math.abs(new Date(deduped[0].fecha) - new Date(deduped[1].fecha)) / 86400000;
      if (gapDays < 50 && gapDays > 0) return 12;
      if (gapDays < 120) return 4;
      if (gapDays < 270) return 2;
      return 1;
    }
    return 4;
  };

  const calcLiveDPS = (payments, posShares) => {
    if (!payments.length) return 0;
    const n = detectFrequency(payments);
    const deduped = deduplicateByDate(payments);
    const last = deduped[0];
    const origPayments = payments.filter(p => p.fecha === last.fecha);
    let maxShares = Math.max(...origPayments.map(p => p.shares || 0));
    // Fallback to position shares when dividend entries lack shares data
    if (!maxShares && posShares > 0) maxShares = posShares;
    const totalBruto = origPayments.reduce((s, p) => s + (p.bruto || 0), 0);
    const lastDPS = maxShares > 0 ? (totalBruto / maxShares) : 0;
    return lastDPS * n;
  };

  // 3. Compare and generate alerts
  let alertCount = 0;
  const alertsGenerated = [];

  for (const pos of posList) {
    const payments = findPayments(pos.ticker);
    let liveDPS = calcLiveDPS(payments, pos.shares);

    // If no dividend payments found, try FMP fundamentals cache
    if (!liveDPS) {
      try {
        const cached = await env.DB.prepare(
          "SELECT ratios FROM fundamentals WHERE symbol = ?"
        ).bind(pos.ticker).first();
        if (cached?.ratios) {
          const ratios = JSON.parse(cached.ratios || "[]");
          const latest = Array.isArray(ratios) ? ratios[0] : ratios;
          liveDPS = latest?.dividendPerShare || latest?.dividendPerShareTTM || 0;
        }
      } catch {}
    }

    if (!liveDPS || !pos.div_ttm) continue;

    const changePct = ((liveDPS - pos.div_ttm) / pos.div_ttm) * 100;

    // Only alert if change > 5%
    if (Math.abs(changePct) <= 5) continue;

    const isCut = changePct < -5;
    const tipo = isCut ? "DIV_CUT" : "DIV_RAISE";
    const icon = isCut ? "⚠️" : "📈";
    const label = isCut ? "Dividend Cut" : "Dividend Raise";
    const titulo = `${icon} ${pos.ticker} ${label} ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`;
    const detalle = `DPS: $${pos.div_ttm.toFixed(2)} → $${liveDPS.toFixed(2)} · ${pos.name || pos.ticker}`;

    // Dedup: check if alert already exists for this ticker+tipo today
    const exists = await env.DB.prepare(
      "SELECT id FROM alerts WHERE fecha=? AND tipo=? AND ticker=? LIMIT 1"
    ).bind(today, tipo, pos.ticker).first();

    if (!exists) {
      await env.DB.prepare(
        "INSERT INTO alerts (fecha, tipo, titulo, detalle, ticker, valor) VALUES (?,?,?,?,?,?)"
      ).bind(today, tipo, titulo, detalle, pos.ticker, changePct).run();
      alertCount++;
      alertsGenerated.push({ ticker: pos.ticker, tipo, oldDPS: pos.div_ttm, newDPS: liveDPS, changePct });
    }
  }

  return { checked: posList.length, alerts: alertCount, details: alertsGenerated };
}

// ─── Agent 7: Insider Radar (FMP Ultimate — no LLM) ────────────
async function runInsiderAgent(env, fecha) {
  const key = env.FMP_KEY;
  if (!key) return { agent: "insider", skipped: true, reason: "no FMP key" };

  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, market_value, last_price FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "insider", skipped: true };

  const insights = [];
  const priceMap = {};
  for (const p of positions) priceMap[p.ticker] = p.last_price;

  // Load previous insider data from agent_memory for price impact comparison
  const prevInsiderData = await getAgentMemory(env, "insider_trades") || {};

  const insiderAlerts = [];
  const newTradeMemory = {};

  const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const cutoff1y = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const MAX_PAGES = 4; // ~400 rows max per ticker — enough for 1y on most names

  // 1. Fetch insider trades for portfolio tickers (FMP /v4/insider-trading)
  for (let i = 0; i < positions.length; i += 4) {
    const batch = positions.slice(i, i + 4);
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const sym = toFMP(p.ticker);
        try {
          // Paginate until we cross the 1-year cutoff or hit MAX_PAGES
          const allTrades = [];
          for (let page = 0; page < MAX_PAGES; page++) {
            // FMP stable insider trades endpoint
            const url = `https://financialmodelingprep.com/stable/insider-trading/search?symbol=${encodeURIComponent(sym)}&page=${page}&apikey=${key}`;
            const resp = await fetch(url);
            if (!resp.ok) break;
            const data = await resp.json();
            if (!Array.isArray(data) || !data.length) break;
            // Map FMP shape → internal shape (only open-market P/S)
            for (const t of data) {
              const txType = String(t.transactionType || '').trim().toUpperCase();
              const code = txType.charAt(0);
              if (code !== 'P' && code !== 'S') continue;
              const shares = Number(t.securitiesTransacted) || 0;
              const price = Number(t.price) || 0;
              const costK = price && shares ? Math.round((price * shares) / 1000) : null;
              allTrades.push({
                date: (t.transactionDate || '').slice(0, 10),
                insider: t.reportingName || 'Unknown',
                position: t.typeOfOwner || '',
                type: code,
                trans_share: shares,
                price: price ? String(price) : '0',
                cost: costK,
              });
            }
            // Stop paginating once we've crossed 1y
            const oldest = data[data.length - 1];
            const oldestDate = (oldest?.transactionDate || '').slice(0, 10);
            if (oldestDate && oldestDate < cutoff1y) break;
          }

          if (!allTrades.length) return null;

          // Filter to last 90 days
          const recent = allTrades.filter(t => (t.date || '') >= cutoff90);
          if (!recent.length) return null;

          const buys = recent.filter(t => (t.type || '').toUpperCase() === 'P');
          const sells = recent.filter(t => (t.type || '').toUpperCase() === 'S');
          if (!buys.length && !sells.length) return null;

          // Recurring seller detection (4+ sells in 1y by same person → likely 10b5-1 plan)
          const yearTrades = allTrades.filter(t => (t.date || '') >= cutoff1y);
          const sellerCounts = {};
          for (const t of yearTrades.filter(t => (t.type || '').toUpperCase() === 'S')) {
            const name = t.insider || 'Unknown';
            sellerCounts[name] = (sellerCounts[name] || 0) + 1;
          }
          const recurringSellerNames = Object.entries(sellerCounts).filter(([, c]) => c >= 4).map(([n]) => n);

          const enrichedTrades = recent.slice(0, 10).map(t => {
            const isBuy = (t.type || '').toUpperCase() === 'P';
            const tradePrice = parseFloat(String(t.price || '0').replace(/,/g, ''));
            const currentPrice = p.last_price || 0;
            const priceChangePct = tradePrice > 0 ? ((currentPrice - tradePrice) / tradePrice * 100) : null;
            const isRecurring = recurringSellerNames.includes(t.insider);
            return {
              date: t.date,
              insider: t.insider,
              position: t.position,
              type: isBuy ? 'COMPRA' : 'VENTA',
              shares: t.trans_share,
              price: t.price,
              currentPrice: currentPrice ? currentPrice.toFixed(2) : null,
              priceImpactPct: priceChangePct != null ? Math.round(priceChangePct * 10) / 10 : null,
              recurring: isRecurring,
              cost: t.cost ? `$${t.cost}k` : null,
            };
          });

          newTradeMemory[p.ticker] = enrichedTrades.slice(0, 5).map(t => ({
            date: t.date, type: t.type, price: t.price, insider: t.insider,
          }));

          return {
            ticker: p.ticker, name: p.name, currentPrice: p.last_price,
            buys: buys.length, sells: sells.length,
            recurringSellerNames, enrichedTrades,
          };
        } catch { return null; }
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) insiderAlerts.push(r.value);
    }
    if (i + 4 < positions.length) await new Promise(r => setTimeout(r, 800));
  }

  // 2. Generate insights with price impact and pattern analysis
  for (const alert of insiderAlerts) {
    const netBuys = alert.buys - alert.sells;
    const hasRecurringSellers = alert.recurringSellerNames.length > 0;
    const nonRecurringSells = alert.sells - alert.enrichedTrades.filter(t => t.type === 'VENTA' && t.recurring).length;

    // Smart severity: ignore recurring sellers (planned sales/10b5-1)
    let severity = 'info';
    let pattern = 'normal';

    if (netBuys >= 2) {
      severity = 'info'; // Insiders buying = bullish but not urgent
      pattern = 'cluster-buy';
    } else if (nonRecurringSells >= 3) {
      severity = 'critical'; // Multiple non-recurring sellers = real red flag
      pattern = 'cluster-sell';
    } else if (nonRecurringSells >= 1 && !hasRecurringSellers) {
      severity = 'warning';
      pattern = 'unusual-sell';
    } else if (hasRecurringSellers && nonRecurringSells === 0) {
      severity = 'info'; // All sales are recurring/planned
      pattern = 'planned-sales';
    } else if (alert.sells > alert.buys) {
      severity = 'warning';
      pattern = 'net-selling';
    }

    // Compute average price impact across trades
    const impacts = alert.enrichedTrades.filter(t => t.priceImpactPct != null);
    const avgImpact = impacts.length ? Math.round(impacts.reduce((s, t) => s + t.priceImpactPct, 0) / impacts.length * 10) / 10 : null;

    // Build title
    const patternLabels = {
      'cluster-buy': `Compra colectiva en ${alert.ticker}`,
      'cluster-sell': `ALERTA: Ventas inusuales en ${alert.ticker}`,
      'unusual-sell': `Venta inusual en ${alert.ticker}`,
      'planned-sales': `Ventas planificadas en ${alert.ticker}`,
      'net-selling': `Insiders vendiendo ${alert.ticker}`,
      'normal': `Actividad insider en ${alert.ticker}`,
    };
    const title = patternLabels[pattern] || `Insider ${alert.ticker}`;

    // Summary with context
    const recurringNote = hasRecurringSellers ? ` (${alert.recurringSellerNames.length} vendedor${alert.recurringSellerNames.length > 1 ? 'es' : ''} recurrente${alert.recurringSellerNames.length > 1 ? 's' : ''} — probable plan 10b5-1 fiscal)` : '';
    const impactNote = avgImpact != null ? ` Precio actual vs media de trades: ${avgImpact > 0 ? '+' : ''}${avgImpact}%.` : '';

    insights.push({
      ticker: alert.ticker,
      severity,
      title,
      summary: `${alert.buys} compras, ${alert.sells} ventas (90d). ${alert.name}${recurringNote}.${impactNote}`,
      details: {
        compras: alert.buys,
        ventas: alert.sells,
        netBuys,
        signal: pattern,
        precioActual: alert.currentPrice,
        impactoPrecioMedio: avgImpact,
        vendedoresRecurrentes: alert.recurringSellerNames,
        trades: alert.enrichedTrades,
      },
      score: pattern === 'cluster-buy' ? 8 : pattern === 'cluster-sell' ? 2 : pattern === 'planned-sales' ? 6 : pattern === 'unusual-sell' ? 3 : 5,
    });
  }

  // Note: Guru 13F new picks block removed (no FMP equivalent for guru tracking).
  // Could be re-added later via WhaleWisdom or similar.

  // Save trade memory for future price impact tracking
  await setAgentMemory(env, "insider_trades", newTradeMemory);

  if (!insights.length) {
    insights.push({
      ticker: '_INSIDER_',
      severity: 'info',
      title: 'Sin actividad insider relevante',
      summary: 'No se detectaron compras o ventas significativas de insiders ni gurus en tus posiciones en los ultimos 90 dias.',
      details: { positionsChecked: positions.length, signal: 'none' },
      score: 5,
    });
  }

  const stored = await storeInsights(env, "insider", fecha, insights);
  return { agent: "insider", insights: stored, insiderAlerts: insiderAlerts.length };
}

// ─── Agent 8: Value Signals (GuruFocus cached data — no LLM) ───
// Scans portfolio + watchlist for undervalued stocks with institutional buying.
// Quality is now scored as a multi-factor COMPOSITE so we don't rely on GF Score alone.
async function runValueSignalsAgent(env, fecha) {
  const token = env.GURUFOCUS_TOKEN;
  if (!token) return { agent: "value", skipped: true, reason: "no GF token" };

  const base = `https://api.gurufocus.com/public/user/${token}`;

  // 1. Portfolio positions + GF cache (already have this data)
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, market_value, last_price, div_yield, div_ttm FROM positions WHERE shares > 0"
  ).all();
  const ownedSet = new Set(positions.map(p => p.ticker));
  const ownedTickers = positions.map(p => p.ticker);
  const gfMap = await getGfData(env, ownedTickers);

  // Load latest Q+S scores so we can blend them into the composite
  const { results: qsRows } = await env.DB.prepare(
    `SELECT ticker, quality_score, safety_score FROM quality_safety_scores
     WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM quality_safety_scores)`
  ).all().catch(() => ({ results: [] }));
  const qsMap = {};
  for (const r of (qsRows || [])) qsMap[r.ticker] = r;

  // Quality composite (0-10 scale). Combines:
  //   GF Score (40%), Financial Strength (25%), Q+S Quality (25%), insider buys (10%)
  // This catches "high GF Score but high debt" or "decent GF but Piotroski tanked" cases
  // that the previous single-factor filter missed.
  const qualityComposite = ({ gfScore, finStrength, qsQuality, insiderBuys, dividendStreakYears }) => {
    const w = { gf: 0.30, fin: 0.20, qs: 0.30, insider: 0.10, streak: 0.10 };
    const norm = {
      gf: Math.min(10, (Number(gfScore) || 0) / 10),
      fin: Math.min(10, Number(finStrength) || 0),
      qs: Math.min(10, (Number(qsQuality) || 0) / 10),
      insider: insiderBuys > 5 ? 9 : insiderBuys > 0 ? 7 : 5,
      streak: dividendStreakYears != null ? Math.min(10, dividendStreakYears / 5) : 5,
    };
    const composite = w.gf*norm.gf + w.fin*norm.fin + w.qs*norm.qs + w.insider*norm.insider + w.streak*norm.streak;
    return Math.round(composite * 10) / 10; // 0..10 with 1 decimal
  };

  // 2. Scan 120+ top dividend stocks NOT in portfolio
  // Dividend Aristocrats + Champions + high-quality dividend payers
  const WATCHLIST = [
    // Dividend Aristocrats (25+ years of increases)
    'JNJ','ABBV','PEP','MCD','TXN','LMT','ITW','CL','SYY','APD','ECL','SHW',
    'CTAS','WM','AFL','AOS','BDX','BEN','CAH','CB','CINF','CLX','DOV',
    'EMR','ESS','EXPD','GD','GPC','GWW','HRL','SJM','LEG','LIN','LOW',
    'MKC','NDSN','NUE','PNR','PPG','ROP','SPGI','SWK','TGT','WBA','WST','XOM',
    // High-yield quality dividend payers
    'VZ','T','IBM','CVX','EOG','PSX','MPC','EPD','ET','MPLX','OKE',
    'MO','PM','BTI','UGI','ENB',
    // Dividend growth tech/growth
    'AVGO','HD','MSFT','AAPL','BLK','SBUX','QCOM','CSCO',
    // REITs quality
    'DLR','PSA','SPG','VICI','NNN','STAG','WPC',
    // Utilities
    'NEE','DUK','SO','XEL','AEP','ED','WEC','D','AES','PPL',
    // Healthcare dividend
    'PFE','BMY','AMGN','GILD','MRK','UNH',
    // Industrials
    'UNP','CAT','DE','HON','MMM','RTX','BA','LHX','GE',
    // Financial dividend
    'TROW','PRU','MET','AIG','ALL','TFC','USB','WFC',
  ].filter(t => !ownedSet.has(t));

  // Fetch GF summary for watchlist tickers (batches of 8)
  const watchlistData = {};
  for (let i = 0; i < WATCHLIST.length; i += 8) {
    const batch = WATCHLIST.slice(i, i + 8);
    const results = await Promise.allSettled(
      batch.map(async (sym) => {
        try {
          const resp = await fetch(`${base}/stock/${sym}/summary`);
          if (!resp.ok) return null;
          const data = await resp.json();
          const s = data?.summary || data;
          const g = s?.general || {};
          const ch = s?.chart || {};
          const cd = s?.company_data || {};
          return {
            symbol: sym, company: cd.company || g.company,
            price: cd.price || g.price, gf_value: ch['GF Value'],
            gf_score: g.gf_score, gf_valuation: g.gf_valuation,
            financial_strength_rank: g.rank_financial_strength,
            profitability_rank: g.rank_profitability,
            dividend_yield: cd.yield, shareholder_yield: cd.shareholder_yield,
            '13f_buys': s?.guru?.['13f_buys'], sector: g.sector,
          };
        } catch { return null; }
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) watchlistData[r.value.symbol] = r.value;
    }
    if (i + 8 < WATCHLIST.length) await new Promise(r => setTimeout(r, 1200));
  }

  const insights = [];

  // 3. Scan PORTFOLIO for add opportunities (already owned, undervalued)
  for (const p of positions) {
    const gf = gfMap[p.ticker];
    if (!gf || !gf.gfValue) continue;
    const price = p.last_price || 0;
    const gfValue = parseFloat(gf.gfValue) || 0;
    if (!gfValue || !price) continue;
    const priceToGfValue = price / gfValue;
    const discount = Math.round((1 - priceToGfValue) * 100);
    const gfScore = parseFloat(gf.gfScore) || 0;
    const finStrength = parseFloat(gf.financialStrength) || 0;
    const guruBuys = parseFloat(gf.guruBuys13f) || 0;
    const insiderBuys = parseFloat(gf.insiderBuys3m) || 0;

    // Only flag if meaningfully undervalued
    if (discount < 10) continue;

    // Quality composite (multi-factor: GF + finStrength + Q+S + insider + streak)
    const qsQuality = qsMap[p.ticker]?.quality_score;
    const dgrStreak = parseFloat(gf.dividendStreakYears || gf.streak) || null;
    const composite = qualityComposite({ gfScore, finStrength, qsQuality, insiderBuys, dividendStreakYears: dgrStreak });
    // Must have decent quality on COMPOSITE — not just GF Score alone
    if (composite < 5.0) continue;

    const divYieldPct = (p.div_yield || 0) * 100;
    const volatility = parseFloat(gf.volatility1y) || 20;

    // Put selling calculation: sell put at ~10% below current price
    const putStrike = Math.round(price * 0.90 * 100) / 100;
    const putDiscountVsGF = gfValue > 0 ? Math.round((1 - putStrike / gfValue) * 100) : 0;
    // Estimated annual premium ~0.3-0.5x volatility for ATM, ~0.15-0.25x for 10% OTM
    const estPremiumPct = Math.round(volatility * 0.2 * 10) / 10; // ~20% of vol as annual premium
    const estPremiumMonthly = Math.round(putStrike * estPremiumPct / 100 / 12 * 100) / 100;

    // Income strategy context
    const totalYield = divYieldPct + estPremiumPct;
    const yocOnPut = (p.div_ttm && putStrike > 0) ? (p.div_ttm / putStrike * 100).toFixed(1) : null;
    const putNote = price > 20 ? `Vender Put $${putStrike} (${putDiscountVsGF}% bajo GF Value) → prima ~${estPremiumPct}% anual.${yocOnPut ? ` Si asignado, YOC ${yocOnPut}%.` : ''}` : '';

    const severity = discount >= 30 ? 'critical' : discount >= 20 ? 'warning' : 'info';
    insights.push({
      ticker: p.ticker,
      severity,
      title: `ADD: ${p.name || p.ticker} -${discount}% vs GF Value`,
      summary: `${p.ticker} a $${price.toFixed(2)} vs GF Value $${gfValue.toFixed(2)} (${discount}% desc). GF Score ${gfScore}, Strength ${finStrength}/10, Div ${divYieldPct.toFixed(1)}%.${guruBuys > 30 ? ` Gurus: ${guruBuys.toFixed(0)}% comprando.` : ''} ${putNote}`,
      details: {
        descuento: `${discount}%`, gfScore, gfValue: `$${gfValue.toFixed(2)}`, precio: `$${price.toFixed(2)}`,
        financialStrength: finStrength,
        qualityComposite: composite,
        qsQuality: qsQuality ?? null,
        dividendStreakYears: dgrStreak ?? null,
        dividendYield: `${divYieldPct.toFixed(2)}%`,
        dividendYieldNum: divYieldPct,
        putStrike: price > 20 ? `$${putStrike}` : 'N/A (precio bajo)',
        putPrimaAnual: price > 20 ? `~${estPremiumPct}%` : 'N/A',
        putPrimaMensual: price > 20 ? `~$${estPremiumMonthly}/acc` : 'N/A',
        yieldTotalConPut: price > 20 ? `~${totalYield.toFixed(1)}% (div + put)` : `${divYieldPct.toFixed(1)}%`,
        gfValuation: gf.gfValuation || 'N/A',
        fuente: 'Portfolio scan', enPortfolio: 'SI',
      },
      // Score combines discount magnitude AND quality composite
      score: Math.min(10, Math.round(discount / 5) + (composite >= 7.5 ? 2 : composite >= 6 ? 1 : 0)),
    });
  }

  // 4. Scan WATCHLIST for new buy opportunities
  for (const [sym, s] of Object.entries(watchlistData)) {
    const price = parseFloat(s.price || s.current_price || 0);
    const gfValue = parseFloat(s.gf_value || 0);
    if (!gfValue || !price) continue;
    const priceToGfValue = price / gfValue;
    const discount = Math.round((1 - priceToGfValue) * 100);
    const gfScore = parseFloat(s.gf_score || 0);
    const finStrength = parseFloat(s.financial_strength_rank || 0);
    const profitRank = parseFloat(s.profitability_rank || 0);
    const divYield = parseFloat(s.dividend_yield || 0);
    const guruBuys = parseFloat(s['13f_buys'] || 0);
    const shareholderYield = parseFloat(s.shareholder_yield || 0);

    // Strict filters: undervalued + quality + pays dividend
    if (discount < 15) continue;
    if (gfScore < 60) continue;
    if (finStrength < 5) continue;
    if (divYield < 1) continue;

    // Watchlist tickers don't have Q+S yet, but we still apply the composite
    // (without the qsQuality term) to keep filtering consistent.
    const watchComposite = qualityComposite({ gfScore, finStrength, qsQuality: null, insiderBuys: 0, dividendStreakYears: null });
    if (watchComposite < 5.5) continue;

    // Put selling calculation
    const putStrike = Math.round(price * 0.90 * 100) / 100;
    const putDiscountVsGF = gfValue > 0 ? Math.round((1 - putStrike / gfValue) * 100) : 0;
    const estVol = 25; // assume average vol for unknown stocks
    const estPremiumPct = Math.round(estVol * 0.2 * 10) / 10;
    const totalYield = divYield + estPremiumPct;
    const putNote = price > 20 ? `Put $${putStrike} → prima ~${estPremiumPct}% anual. Total yield potencial ~${totalYield.toFixed(1)}%.` : '';

    const severity = discount >= 35 ? 'critical' : discount >= 25 ? 'warning' : 'info';
    insights.push({
      ticker: sym,
      severity,
      title: `NEW: ${s.company || sym} -${discount}% | Div ${divYield.toFixed(1)}%`,
      summary: `${s.company || sym} a $${price.toFixed(2)} vs GF Value $${gfValue.toFixed(2)} (${discount}% desc). GF Score ${gfScore}, Strength ${finStrength}/10, Div ${divYield.toFixed(1)}%.${guruBuys > 30 ? ` Gurus: ${guruBuys.toFixed(0)}% comprando.` : ''} ${putNote}`,
      details: {
        descuento: `${discount}%`, gfScore, gfValue: `$${gfValue.toFixed(2)}`, precio: `$${price.toFixed(2)}`,
        financialStrength: finStrength, profitabilityRank: profitRank,
        qualityComposite: watchComposite,
        dividendYield: `${divYield.toFixed(2)}%`,
        dividendYieldNum: divYield,
        shareholderYield: `${shareholderYield.toFixed(2)}%`,
        putStrike: price > 20 ? `$${putStrike}` : 'N/A',
        putPrimaAnual: price > 20 ? `~${estPremiumPct}%` : 'N/A',
        yieldTotalConPut: price > 20 ? `~${totalYield.toFixed(1)}% (div + put)` : `${divYield.toFixed(1)}%`,
        gfValuation: s.gf_valuation || 'N/A', sector: s.sector,
        fuente: 'Watchlist scan', enPortfolio: 'NO',
      },
      score: Math.min(10, Math.round(discount / 5) + (gfScore >= 80 ? 2 : 0) + (divYield >= 3 ? 1 : 0)),
    });
  }

  // Sort: external opportunities first (discoveries), then portfolio adds
  const external = insights.filter(i => i.details.enPortfolio === 'NO').sort((a, b) => (b.score || 0) - (a.score || 0));
  const internal = insights.filter(i => i.details.enPortfolio === 'SI').sort((a, b) => (b.score || 0) - (a.score || 0));
  const sortedInsights = [...external.slice(0, 10), ...internal.slice(0, 10)];

  if (!sortedInsights.length) {
    sortedInsights.push({
      ticker: '_VALUE_',
      severity: 'info',
      title: 'Sin oportunidades excepcionales hoy',
      summary: `Escaneadas ${positions.length} posiciones del portfolio y ${Object.keys(watchlistData).length} acciones del watchlist. Ninguna pasa todos los filtros.`,
      details: { portfolioEscaneado: positions.length, watchlistEscaneado: Object.keys(watchlistData).length, exteriorEncontradas: external.length, portfolioEncontradas: internal.length },
      score: 5,
    });
  }

  const stored = await storeInsights(env, "value", fecha, sortedInsights);
  return { agent: "value", insights: sortedInsights.length, external: external.length, internal: internal.length, portfolioScanned: positions.length, watchlistScanned: Object.keys(watchlistData).length };
}

// ─── Agent 9: Options Income (IB Greeks + Yahoo fallback — no LLM) ──
// Scans ENTIRE portfolio for CC, CSP opportunities with real Greeks
async function runOptionsIncomeAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, market_value, last_price, avg_price, div_yield, div_ttm, sector FROM positions WHERE shares > 0 AND last_price > 5"
  ).all();
  if (!positions.length) return { agent: "options", skipped: true };

  const mkt = await getMarketIndicators(env);
  const vix = mkt['^VIX']?.price || 20;
  const regime = await getAgentMemory(env, "regime_current");
  const gfMapOpts = await getGfData(env, positions.map(p => p.ticker));
  const insights = [];

  // Yahoo for speed (FMP Ultimate doesn't expose options chain endpoint publicly)
  const ib = null; // IB available via /api/ib-options?symbols=X for Greeks on demand

  // Sort by market value — scan ALL positions
  const sorted = [...positions].sort((a, b) => (b.market_value || 0) - (a.market_value || 0));
  let scanned = 0, noOptions = 0, withOpportunity = 0;

  const monthNames = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const now = new Date();
  const targetDate = new Date(now.getTime() + 35 * 86400000);
  const targetMonth = monthNames[targetDate.getMonth()] + String(targetDate.getFullYear()).slice(2);

  // Process ALL positions in parallel batches of 5
  // Tickers that definitely don't have US options
  const NO_OPTIONS = new Set(['BME:VIS','BME:AMS','HKG:9618','HKG:1052','HKG:1910','HKG:2219','HKG:9616',
    'AZJ','WKL','SHUR','HEN3','LSEG','ITRK','GQG','NET.UN','CNSWF',
    'BIZD','DIVO','SPHD','FDJU','WEEL','MSDL','IIPR-PRA','LANDP']);

  async function scanPosition(pos) {
    const sym = pos.ticker.replace(/^(BME:|HKG:|LSE:)/, '');
    const price = pos.last_price || 0;

    // Skip non-optionable tickers
    if (NO_OPTIONS.has(pos.ticker)) return { pos, ccData: null, cspData: null, skip: 'Internacional/ETF sin opciones US' };
    if (!price || price < 5) return { pos, ccData: null, cspData: null, skip: `Precio $${price.toFixed(2)} — muy bajo para opciones` };
    if (pos.shares < 100 && pos.market_value < 5000) return { pos, ccData: null, cspData: null, skip: `${pos.shares} acc (<100) — posicion pequena` };

    let ccData = null, cspData = null;
    try {
      const resp = await fetchYahoo(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}`);
      if (!resp.ok) return { pos, ccData: null, cspData: null, skip: resp.status === 401 ? 'Mercado cerrado o sin opciones' : `Sin datos (${resp.status})` };
      const data = await resp.json();
      const result = data?.optionChain?.result?.[0];
      if (!result) return { pos, ccData: null, cspData: null, skip: 'Sin cadena de opciones' };

      const exps = result.expirationDates || [];
      if (!exps.length) return { pos, ccData: null, cspData: null, skip: 'Sin vencimientos disponibles' };
      const nowTs = Math.floor(Date.now() / 1000);
      const targetTs = nowTs + 35 * 86400;
      let bestExp = exps[0];
      for (const exp of exps) { if (Math.abs(exp - targetTs) < Math.abs(bestExp - targetTs)) bestExp = exp; }
      const dte = Math.max(1, Math.round((bestExp - nowTs) / 86400));
      let options = result.options?.[0] || {};
      if (bestExp !== exps[0]) {
        const r2 = await fetchYahoo(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}?date=${bestExp}`);
        if (r2.ok) { const d2 = await r2.json(); options = d2?.optionChain?.result?.[0]?.options?.[0] || options; }
      }
      const calls = (options.calls || []).filter(c => c.bid > 0 && c.strike > price * 1.03 && c.strike < price * 1.15);
      const puts = (options.puts || []).filter(p => p.bid > 0 && p.strike < price * 0.97 && p.strike > price * 0.80);
      const earningsTs = result.quote?.earningsTimestamp;
      const earningsInDays = earningsTs ? Math.round((earningsTs - nowTs) / 86400) : null;

      if (calls.length && pos.shares >= 100) {
        const best = calls.reduce((b, c) => Math.abs(c.strike - price * 1.05) < Math.abs(b.strike - price * 1.05) ? c : b, calls[0]);
        ccData = { strike: best.strike, bid: best.bid, iv: best.impliedVolatility || 0, delta: null, theta: null, dte, earningsInDays, source: 'Yahoo' };
      }
      if (puts.length) {
        const best = puts.reduce((b, p) => Math.abs(p.strike - price * 0.92) < Math.abs(b.strike - price * 0.92) ? p : b, puts[0]);
        cspData = { strike: best.strike, bid: best.bid, iv: best.impliedVolatility || 0, delta: null, theta: null, dte, earningsInDays, source: 'Yahoo' };
      }
      return { pos, ccData, cspData };
    } catch (e) { return { pos, ccData: null, cspData: null, skip: 'Sin datos — reintentar con mercado abierto' }; }
  }

  // Batch scan 5 at a time
  for (let i = 0; i < sorted.length; i += 5) {
    const batch = sorted.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(scanPosition));
    for (const r of results) {
      const { pos, ccData, cspData, skip } = r.status === 'fulfilled' ? r.value : { pos: batch[0], ccData: null, cspData: null, skip: 'Promise failed' };
      const price = pos.last_price || 0;
      const gf = gfMapOpts[pos.ticker] || {};
      const histVol = parseFloat(gf.volatility1y) || 25;
      const divYieldPct = (pos.div_yield || 0) * 100;

      scanned++;

      if (skip) {
        insights.push({ ticker: pos.ticker, severity: 'info', title: `${pos.ticker}: ${skip}`,
          summary: `${pos.name || pos.ticker} ($${price.toFixed(2)}, ${pos.shares} acc, $${Math.round(pos.market_value || 0).toLocaleString()})`,
          details: { precio: `$${price.toFixed(2)}`, acciones: pos.shares, valor: `$${Math.round(pos.market_value || 0)}`, motivo: skip, cc: 'N/A', csp: 'N/A' }, score: 0 });
        noOptions++;
        continue;
      }

      if (!ccData && !cspData) {
        insights.push({ ticker: pos.ticker, severity: 'info', title: `${pos.ticker}: sin primas atractivas`,
          summary: `${pos.name || pos.ticker} ($${price.toFixed(2)}, ${pos.shares} acc, $${Math.round(pos.market_value || 0).toLocaleString()}). Opciones sin bid o primas muy bajas.`,
          details: { precio: `$${price.toFixed(2)}`, acciones: pos.shares, valor: `$${Math.round(pos.market_value || 0)}`, motivo: 'Primas insuficientes', cc: 'N/A', csp: 'N/A' }, score: 0 });
        noOptions++;
        continue;
      }

      withOpportunity++;

      const dte = ccData?.dte || cspData?.dte || 35;
      const earningsInDays = ccData?.earningsInDays || cspData?.earningsInDays;
      const earningsNote = earningsInDays && earningsInDays < dte + 5 ? ' EARNINGS CERCA.' : '';

    if (ccData && pos.shares >= 100) {
      const contracts = Math.floor(pos.shares / 100);
      const premium = ccData.bid * 100 * contracts;
      const premPct = (ccData.bid / price * 100);
      const ann = premPct * (365 / dte);
      const otmPct = ((ccData.strike - price) / price * 100);
      const totalYield = ann + divYieldPct;
      const ivPct = (ccData.iv > 1 ? ccData.iv : ccData.iv * 100);
      const ivRank = histVol > 0 ? Math.round(Math.min(100, Math.max(0, (ivPct / histVol - 0.5) * 100))) : null;

      let sev = 'info';
      if (ann >= 12 && (ivRank == null || ivRank > 30)) sev = 'warning';
      if (ann >= 20) sev = 'critical';

      insights.push({ ticker: pos.ticker, severity: sev,
        title: `CC: ${pos.ticker} $${ccData.strike} | ${ann.toFixed(0)}%/a | ${totalYield.toFixed(0)}% total`,
        summary: `Vender ${contracts} Call $${ccData.strike} (${otmPct.toFixed(1)}% OTM, ~${dte}d) por $${premium.toFixed(0)}. ${ann.toFixed(0)}% anualizado + div ${divYieldPct.toFixed(1)}% = ${totalYield.toFixed(0)}% total.${ccData.delta ? ` Delta: ${ccData.delta.toFixed(2)}.` : ''}${ccData.theta ? ` Theta: $${ccData.theta.toFixed(2)}/dia.` : ''} IV: ${ivPct.toFixed(0)}%.${ivRank != null ? ` IV rank: ${ivRank}%.` : ''} [${ccData.source}]`,
        details: {
          estrategia: 'Covered Call', strike: `$${ccData.strike}`, otmPct: `${otmPct.toFixed(1)}%`,
          prima: `$${premium.toFixed(0)} (${contracts}x)`, anualizada: `${ann.toFixed(0)}%`,
          delta: ccData.delta ? ccData.delta.toFixed(3) : 'N/A', theta: ccData.theta ? `$${ccData.theta.toFixed(2)}/dia` : 'N/A',
          iv: `${ivPct.toFixed(0)}%`, ivRank: ivRank != null ? `${ivRank}%` : 'N/A',
          dividendo: `${divYieldPct.toFixed(1)}%`, yieldTotal: `${totalYield.toFixed(0)}%`,
          acciones: pos.shares, fuente: ccData.source,
        },
        score: Math.min(10, Math.round(ann / 4) + (ivRank > 50 ? 2 : 0)),
      });
    }

    if (cspData) {
      const putPremPct = (cspData.bid / cspData.strike * 100);
      const ann = putPremPct * (365 / dte);
      const otmPct = ((price - cspData.strike) / price * 100);
      const yocAssigned = pos.div_ttm ? (pos.div_ttm / cspData.strike * 100) : 0;
      const isGood = pos.avg_price ? cspData.strike < pos.avg_price : true;

      let sev = 'info';
      if (ann >= 10 && isGood) sev = 'warning';
      if (ann >= 18 && isGood) sev = 'critical';

      insights.push({ ticker: pos.ticker, severity: sev,
        title: `CSP: ${pos.ticker} $${cspData.strike} | ${ann.toFixed(0)}%/a`,
        summary: `Vender Put $${cspData.strike} (${otmPct.toFixed(1)}% OTM, ~${dte}d) por $${cspData.bid.toFixed(2)}/acc. ${ann.toFixed(0)}% anualizado.${pos.avg_price ? ` Tu avg: $${pos.avg_price.toFixed(2)}${isGood ? ' (compras mas barato)' : ''}.` : ''}${yocAssigned > 0 ? ` YOC asignado: ${yocAssigned.toFixed(1)}%.` : ''}${cspData.delta ? ` Delta: ${cspData.delta.toFixed(2)}.` : ''} [${cspData.source}]`,
        details: {
          estrategia: 'Cash Secured Put', strike: `$${cspData.strike}`, otmPct: `${otmPct.toFixed(1)}%`,
          prima: `$${(cspData.bid * 100).toFixed(0)}/contrato`, anualizada: `${ann.toFixed(0)}%`,
          delta: cspData.delta ? cspData.delta.toFixed(3) : 'N/A',
          cashNecesario: `$${(cspData.strike * 100).toFixed(0)}`,
          avgCost: pos.avg_price ? `$${pos.avg_price.toFixed(2)}` : 'N/A',
          yocSiAsignado: yocAssigned > 0 ? `${yocAssigned.toFixed(1)}%` : 'N/A',
          fuente: cspData.source,
        },
        score: Math.min(10, Math.round(ann / 4) + (isGood ? 1 : 0)),
      });
    }

    } // end for results in batch
    // Rate limit between batches
    if (i + 5 < sorted.length) await new Promise(r => setTimeout(r, 1000));
  } // end batch loop

  // Sort by score
  // Sort: opportunities first (by score), then rest by market value (portfolio order)
  const opps = insights.filter(i => i.score > 0).sort((a, b) => (b.score || 0) - (a.score || 0));
  const rest = insights.filter(i => i.score === 0);
  insights.length = 0;
  insights.push(...opps, ...rest);

  const stored = await storeInsights(env, "options", fecha, insights.slice(0, 85));
  return { agent: "options", insights: Math.min(insights.length, 85), scanned, withOpportunity, noOptions, source: ib ? 'IB+Yahoo' : 'Yahoo' };
}

// ─── Agent 14: SEC Filings Tracker (no LLM, EDGAR free) ─────────
// Tracks 8-K filings (material events) for portfolio tickers via SEC EDGAR's
// submissions API. 8-Ks are filed within 4 business days of: executive departures,
// going concern warnings, material agreements, M&A, dividend changes, asset
// impairments. Cluster of multiple 8-Ks in 30 days = significant.
//
// Uses companyfacts API: https://data.sec.gov/submissions/CIK{padded}.json
// Requires CIK lookup which we cache in agent_memory.
async function runSECFilingsAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, category, sector FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "sec_filings", skipped: true };

  // Only US-listed companies have SEC filings. Skip foreign tickers + ETFs/preferreds.
  const eligible = positions.filter(p => {
    if (/etf|preferred/i.test(p.category || "")) return false;
    if (/^(BME:|HKG:|LSE:|TSE:)/.test(p.ticker)) return false;
    if (/\.(AS|BR|MC|DE|PA|L|AX|TO|V|HK)$/i.test(p.ticker)) return false;
    return true;
  });
  if (!eligible.length) return { agent: "sec_filings", scanned: 0, alerts: 0 };

  // CIK cache: ticker -> CIK string. Built lazily, persisted in agent_memory.
  let cikCache = (await getAgentMemory(env, "sec_cik_cache")) || {};
  let cikLookups = 0;

  // SEC EDGAR requires a User-Agent header
  const SEC_HEADERS = { "User-Agent": "AyR Portfolio Tracker / contact@example.com", "Accept": "application/json" };

  // Helper: lookup CIK if not cached. Uses /cgi-bin/browse-edgar (HTML scrape) is slow,
  // so we use the official tickers map JSON which has all SEC tickers in one fetch.
  const ensureCikMap = async () => {
    if (Object.keys(cikCache).length > 100) return; // already populated
    try {
      const resp = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: SEC_HEADERS });
      if (!resp.ok) return;
      const data = await resp.json();
      // data is { "0": { cik_str, ticker, title }, "1": {...}, ... }
      for (const k of Object.keys(data)) {
        const r = data[k];
        if (r?.ticker && r?.cik_str != null) {
          cikCache[r.ticker.toUpperCase()] = String(r.cik_str).padStart(10, "0");
          cikLookups++;
        }
      }
      await setAgentMemory(env, "sec_cik_cache", cikCache);
    } catch (e) { console.error("[SEC] CIK map fetch failed:", e.message); }
  };
  await ensureCikMap();

  const insights = [];
  let scanned = 0;
  let withFilings = 0;
  const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // Process in batches of 5 with 1.5s delay (SEC rate limit ~10 req/sec)
  for (let i = 0; i < eligible.length; i += 5) {
    const batch = eligible.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(async (p) => {
      const cik = cikCache[p.ticker.toUpperCase()];
      if (!cik) return null;
      try {
        const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
        const resp = await fetch(url, { headers: SEC_HEADERS });
        if (!resp.ok) return null;
        const data = await resp.json();
        // recent.form is array of form types parallel to recent.filingDate
        const recent = data?.filings?.recent || {};
        const forms = recent.form || [];
        const dates = recent.filingDate || [];
        const items = recent.items || []; // 8-K item codes
        // Filter to last 30 days
        const recentFilings = [];
        for (let k = 0; k < forms.length && k < 50; k++) {
          if ((dates[k] || "") >= cutoff30) {
            recentFilings.push({ form: forms[k], date: dates[k], items: items[k] || "" });
          }
        }
        return { ticker: p.ticker, name: p.name, recentFilings };
      } catch { return null; }
    }));

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const { ticker, name, recentFilings } = r.value;
      scanned++;
      if (!recentFilings.length) continue;

      // Categorize
      const eightKs = recentFilings.filter(f => f.form === "8-K");
      const tenQs = recentFilings.filter(f => /10-Q/.test(f.form));
      const tenKs = recentFilings.filter(f => /10-K/.test(f.form));

      // 8-K item codes that matter MOST for dividend investors. Excluded 8.01
      // (other events) because it's dominated by routine dividend declarations.
      // Excluded 1.01/1.02 (material agreements) because most are routine.
      //   2.05 = costs associated with exit/disposal (restructuring)
      //   2.06 = material impairments
      //   3.03 = material modification to security holders' rights (dividend cut!)
      //   4.01 = change in registrant's certifying accountant (audit concern)
      //   4.02 = non-reliance on previously issued financial statements (RESTATEMENT)
      //   5.02 = departure of directors / officers (CEO/CFO)
      const RED_FLAG_ITEMS = /\b(2\.05|2\.06|3\.03|4\.01|4\.02|5\.02)\b/;
      const flaggedItems = eightKs.filter(f => RED_FLAG_ITEMS.test(f.items || ""));

      let severity = null;
      let title = "";
      let reason = "";

      if (flaggedItems.length >= 2) {
        severity = "critical";
        title = `${ticker}: Múltiples 8-Ks materiales (30d)`;
        const itemCodes = [...new Set(flaggedItems.flatMap(f => (f.items || "").split(",").map(s => s.trim())).filter(c => RED_FLAG_ITEMS.test(c)))];
        reason = `${flaggedItems.length} 8-Ks con items críticos en 30 días: ${itemCodes.join(", ")}. Posibles cambios ejecutivos, impairments o restructuración.`;
      } else if (flaggedItems.length === 1) {
        const f = flaggedItems[0];
        const itemMatch = (f.items || "").match(RED_FLAG_ITEMS);
        const code = itemMatch ? itemMatch[0] : "?";
        const codeLabel = ({
          "2.05": "restructuración",
          "2.06": "impairment material",
          "3.03": "modificación derechos accionistas",
          "5.02": "salida ejecutivo",
          "8.01": "evento material",
        })[code] || code;
        severity = "warning";
        title = `${ticker}: 8-K item ${code} (${codeLabel})`;
        reason = `8-K filed ${f.date} con item ${code} (${codeLabel}). Revisar contenido en SEC EDGAR.`;
      } else if (eightKs.length >= 4) {
        severity = "warning";
        title = `${ticker}: ${eightKs.length} 8-Ks en 30 días`;
        reason = `Cluster inusual de ${eightKs.length} 8-Ks (sin items críticos identificados). Posible actividad corporativa.`;
      }

      if (severity) {
        withFilings++;
        insights.push({
          ticker, severity, title,
          summary: `${name || ticker}. ${reason}`,
          details: {
            eightKs: eightKs.length,
            tenQs: tenQs.length,
            tenKs: tenKs.length,
            flaggedItems: flaggedItems.length,
            recentFilings: recentFilings.slice(0, 6),
          },
          score: severity === "critical" ? 9 : 5,
        });
      }
    }

    if (i + 5 < eligible.length) await new Promise(r => setTimeout(r, 1500));
  }

  // Cleanup stale rows
  const flagged = new Set(insights.map(i => i.ticker));
  try {
    const { results: existing } = await env.DB.prepare(
      "SELECT ticker FROM agent_insights WHERE agent_name = 'sec_filings' AND fecha = ?"
    ).bind(fecha).all();
    for (const row of (existing || [])) {
      if (!flagged.has(row.ticker)) {
        await env.DB.prepare(
          "DELETE FROM agent_insights WHERE agent_name = 'sec_filings' AND fecha = ? AND ticker = ?"
        ).bind(fecha, row.ticker).run();
      }
    }
  } catch {}

  insights.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  const stored = await storeInsights(env, "sec_filings", fecha, insights);
  return { agent: "sec_filings", scanned, alerts: insights.length, withFilings, stored, cikLookups };
}

// ─── Agent 13: Earnings Trend Pattern (no LLM) ──────────────────
// Pure-calculation pattern detector that complements the Opus Earnings agent.
// Flags two specific patterns that humans miss when looking quarter-by-quarter:
//   1. 2+ consecutive earnings misses (operating income or EPS down YoY twice in a row)
//   2. Operating margin compression > 100bps YoY with revenue flat/down
// Uses cached FMP financials — zero API calls, zero LLM cost.
async function runEarningsTrendAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, sector, category FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "earnings_trend", skipped: true };

  // Skip ETFs/preferreds (no income statement) and REITs/MLPs (operating income
  // is not representative of business health — they report FFO/AFFO).
  const eligible = positions.filter(p => {
    if (/etf|preferred/i.test(p.category || "")) return false;
    if (/real.?estate/i.test(p.sector || "")) return false;
    if (FCF_PAYOUT_CARVEOUT.has(p.ticker)) return false;
    return true;
  });
  if (!eligible.length) return { agent: "earnings_trend", scanned: 0, alerts: 0 };

  const tickers = eligible.map(p => p.ticker);
  const finMap = await getFmpFinancials(env, tickers);

  const insights = [];
  let scanned = 0;
  let critical = 0;
  let warning = 0;

  for (const p of eligible) {
    const fin = finMap[p.ticker];
    if (!fin) continue;
    const trend = fin.trend || fin || {};
    const periods = trend.periods || [];
    if (periods.length < 8) continue;
    scanned++;

    const rev = trend.revenue || [];
    const opInc = trend.operatingIncome || [];
    const ni = trend.netIncome || [];

    if (rev.length < 8 || opInc.length < 8 || ni.length < 8) continue;

    // ── Pattern 1: 2+ consecutive YoY operating income misses ──
    // Compare each of last 4 quarters to its YoY counterpart (4 quarters earlier)
    let consecutiveMisses = 0;
    for (let i = 0; i < 4; i++) {
      const cur = opInc[i];
      const yoy = opInc[i + 4];
      if (cur != null && yoy != null && yoy > 0) {
        if (cur < yoy * 0.95) consecutiveMisses++;
        else break; // streak broken
      } else break;
    }

    // ── Pattern 2: Operating margin compression > 100 bps YoY ──
    const marginTtmNow = (() => {
      const r = _qs_sum(rev, 4); const o = _qs_sum(opInc, 4);
      return (r != null && o != null && r > 0) ? o / r : null;
    })();
    const marginTtmYoY = (() => {
      const r = _qs_sum(rev.slice(4), 4); const o = _qs_sum(opInc.slice(4), 4);
      return (r != null && o != null && r > 0) ? o / r : null;
    })();
    const marginCompressionBps = (marginTtmNow != null && marginTtmYoY != null)
      ? Math.round((marginTtmYoY - marginTtmNow) * 10000)
      : null;

    // ── Pattern 3: Revenue flat or down (TTM vs TTM YoY) ──
    const revTtmNow = _qs_sum(rev, 4);
    const revTtmYoY = _qs_sum(rev.slice(4), 4);
    const revGrowthYoY = (revTtmNow != null && revTtmYoY != null && revTtmYoY > 0)
      ? (revTtmNow - revTtmYoY) / revTtmYoY
      : null;

    let severity = null;
    let title = "";
    let reason = "";

    // Growth-investment carve-out: companies growing revenue > 8% YoY are very
    // likely deploying capex, not in structural decline. Don't flag them as critical
    // even if margins are compressing (they are by design).
    const isGrowthCo = revGrowthYoY != null && revGrowthYoY > 0.08;

    if (consecutiveMisses >= 3 && revGrowthYoY != null && revGrowthYoY < 0) {
      severity = "critical";
      title = `${p.ticker}: 3+ misses + revenue cayendo`;
      reason = `Operating income ha caído YoY en los últimos ${consecutiveMisses} trimestres y revenue TTM cae ${(revGrowthYoY*100).toFixed(0)}%. Patrón estructural.`;
    } else if (consecutiveMisses >= 2 && marginCompressionBps != null && marginCompressionBps > 250 && !isGrowthCo) {
      severity = "critical";
      title = `${p.ticker}: 2+ misses + grandes contracciones`;
      reason = `${consecutiveMisses}Q seguidos de earnings miss YoY, márgenes operativos contraídos ${marginCompressionBps}bps con revenue ${revGrowthYoY != null ? (revGrowthYoY*100).toFixed(0)+'%' : 'flat'}.`;
    } else if (consecutiveMisses >= 3 && !isGrowthCo) {
      severity = "warning";
      title = `${p.ticker}: 3 earnings misses seguidos`;
      reason = `Operating income cayendo YoY en ${consecutiveMisses} trimestres consecutivos. Vigilar próximos resultados.`;
    } else if (consecutiveMisses >= 2 && !isGrowthCo && marginCompressionBps != null && marginCompressionBps > 100) {
      severity = "warning";
      title = `${p.ticker}: 2 misses + margen contraído`;
      reason = `${consecutiveMisses} trimestres de miss YoY con margen contraído ${marginCompressionBps}bps.`;
    } else if (marginCompressionBps != null && marginCompressionBps > 300 && revGrowthYoY != null && revGrowthYoY < 0.02) {
      severity = "warning";
      title = `${p.ticker}: márgenes contraídos ${marginCompressionBps}bps`;
      reason = `Margen operativo TTM contraído ${marginCompressionBps}bps con revenue plano (${(revGrowthYoY*100).toFixed(1)}% YoY). Posible pérdida de pricing power.`;
    }

    if (!severity) continue;
    if (severity === "critical") critical++; else warning++;

    insights.push({
      ticker: p.ticker,
      severity,
      title,
      summary: `${p.name || p.ticker}. ${reason}`,
      details: {
        consecutiveMisses,
        marginTtmNow: marginTtmNow != null ? Math.round(marginTtmNow * 1000) / 10 : null,
        marginTtmYoY: marginTtmYoY != null ? Math.round(marginTtmYoY * 1000) / 10 : null,
        marginCompressionBps,
        revGrowthYoYPct: revGrowthYoY != null ? Math.round(revGrowthYoY * 100) : null,
        revTtmNowM: revTtmNow != null ? Math.round(revTtmNow / 1e6) : null,
      },
      score: severity === "critical" ? 9 : 6,
    });
  }

  // Cleanup stale rows from previous runs
  const flagged = new Set(insights.map(i => i.ticker));
  try {
    const { results: existing } = await env.DB.prepare(
      "SELECT ticker FROM agent_insights WHERE agent_name = 'earnings_trend' AND fecha = ?"
    ).bind(fecha).all();
    for (const row of (existing || [])) {
      if (!flagged.has(row.ticker)) {
        await env.DB.prepare(
          "DELETE FROM agent_insights WHERE agent_name = 'earnings_trend' AND fecha = ? AND ticker = ?"
        ).bind(fecha, row.ticker).run();
      }
    }
  } catch {}

  insights.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  const stored = await storeInsights(env, "earnings_trend", fecha, insights);
  return { agent: "earnings_trend", scanned, alerts: insights.length, critical, warning, stored };
}

// ─── Agent 11: Dividend Cut Early Warning (no LLM) ──────────────
// Detects dividend cut risk 4-8 weeks BEFORE the announcement by combining:
//   - FCF payout ratio rising trend (last 4 quarters)
//   - FCF declining trend
//   - Current FCF coverage approaching/below 1.0x
// Uses cached fmp_financials (no extra API calls).
async function runDividendCutWarningAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, last_price, div_ttm, sector, category FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "dividend_cut_warning", skipped: true };

  // Only analyze dividend payers. Skip:
  //  - ETFs / preferreds (no income statement to analyze)
  //  - REITs / MLPs (distribute from FFO/AFFO not FCF; FCF coverage is misleading
  //    because capex includes growth investments. Q+S score handles these via FFO patch.)
  const SKIP_SECTORS = /real.?estate/i;
  const SKIP_CATEGORIES = /etf|preferred/i;
  const payers = positions.filter(p => {
    if ((p.div_ttm || 0) <= 0) return false;
    if (p.sector && SKIP_SECTORS.test(p.sector)) return false;
    if (p.category && SKIP_CATEGORIES.test(p.category)) return false;
    if (FCF_PAYOUT_CARVEOUT.has(p.ticker)) return false; // asset managers, BDCs, MLPs
    return true;
  });
  if (!payers.length) return { agent: "dividend_cut_warning", scanned: 0, alerts: 0 };

  const insights = [];
  let scanned = 0;
  let critical = 0;
  let warning = 0;
  let skippedReits = positions.filter(p => p.sector && SKIP_SECTORS.test(p.sector) && (p.div_ttm || 0) > 0).length;

  // Pre-fetch financials for all payers (uses cache, no API spam)
  const tickers = payers.map(p => p.ticker);
  const finMap = await getFmpFinancials(env, tickers);

  // Helper: sum a window [start, start+len) treating null as 0, signing dividends positive
  const sumWindow = (arr, start, len, abs = false) => {
    if (!Array.isArray(arr)) return null;
    let total = 0;
    let count = 0;
    for (let i = start; i < start + len && i < arr.length; i++) {
      if (arr[i] == null) continue;
      total += abs ? Math.abs(arr[i]) : arr[i];
      count++;
    }
    return count >= len ? total : null; // require full window
  };

  for (const p of payers) {
    const fin = finMap[p.ticker];
    if (!fin) continue;
    const trend = fin.trend || fin || {};
    const periods = trend.periods || [];
    // Need at least 8 quarters to compute 4 rolling TTM windows reliably (TTM-now vs TTM-1y-ago)
    if (periods.length < 8) continue;
    scanned++;

    // Build rolling TTM windows for FCF and dividendsPaid.
    // Windows: TTM (Q0-Q3), TTM-1Q (Q1-Q4), TTM-2Q (Q2-Q5), TTM-3Q (Q3-Q6), TTM-4Q (Q4-Q7).
    // This smooths out quarterly seasonality (HRB tax season, retailers, etc.) which
    // single-quarter ratios cannot.
    const fcfWindows = [];
    const divWindows = [];
    for (let w = 0; w < 5; w++) {
      const fcfSum = sumWindow(trend.fcf, w, 4, false);
      const divSum = sumWindow(trend.dividendsPaid, w, 4, true);
      fcfWindows.push(fcfSum);
      divWindows.push(divSum);
    }

    // Need at least 2 valid windows (TTM-now and TTM-1y-ago)
    const ttmNowFcf = fcfWindows[0];
    const ttmNowDiv = divWindows[0];
    const ttmOldFcf = fcfWindows[4]; // 4 quarters back = 1 year ago
    const ttmOldDiv = divWindows[4];
    if (ttmNowFcf == null || ttmNowDiv == null || ttmNowDiv === 0) continue;
    if (ttmOldFcf == null || ttmOldDiv == null || ttmOldDiv === 0) continue;

    // FCF coverage = FCF / Div. Negative if FCF is negative (burning cash).
    const covNow = ttmNowFcf / ttmNowDiv;
    const covOld = ttmOldFcf / ttmOldDiv;

    // Payout ratio = Div / FCF. Only meaningful when FCF > 0.
    const payoutNow = ttmNowFcf > 0 ? ttmNowDiv / ttmNowFcf : null;
    const payoutOld = ttmOldFcf > 0 ? ttmOldDiv / ttmOldFcf : null;

    // FCF growth (TTM YoY)
    const fcfGrowth = ttmOldFcf > 0 ? (ttmNowFcf - ttmOldFcf) / ttmOldFcf : null;

    // Track all 5 window payout ratios for the trend visual
    const payoutSeries = fcfWindows.map((f, idx) => {
      const d = divWindows[idx];
      if (f == null || d == null || d === 0 || f <= 0) return null;
      return Math.round((d / f) * 100) / 100;
    });

    // ── Severity logic (TTM-based, conservative) ──
    // CRITICAL: TTM coverage < 0.85 (truly burning cash to pay div)
    //        OR  payout > 95% AND payout has been rising YoY AND FCF declining YoY
    // WARNING:  payout > 80% AND rising AND FCF declining
    //        OR  FCF down >25% YoY with payout > 60%
    //        OR  payout > 100% (any cause)
    let severity = null;
    let reason = "";

    if (covNow < 0.85) {
      severity = "critical";
      reason = `Cobertura FCF/Div TTM = ${covNow.toFixed(2)}x. La empresa no genera caja suficiente para sostener el dividendo.`;
    } else if (payoutNow != null && payoutNow > 0.95 && payoutOld != null && payoutNow > payoutOld && fcfGrowth != null && fcfGrowth < 0) {
      severity = "critical";
      reason = `Payout FCF subiendo a ${(payoutNow*100).toFixed(0)}% (vs ${(payoutOld*100).toFixed(0)}% hace 1 año) mientras FCF cae ${Math.round(-fcfGrowth*100)}% YoY. Recorte probable.`;
    } else if (payoutNow != null && payoutNow > 1.00) {
      severity = "warning";
      reason = `Payout FCF TTM ${(payoutNow*100).toFixed(0)}% — sobre 100%. Insostenible si no mejora pronto.`;
    } else if (payoutNow != null && payoutOld != null && payoutNow > 0.80 && payoutNow > payoutOld && fcfGrowth != null && fcfGrowth < 0) {
      severity = "warning";
      reason = `Payout FCF subiendo a ${(payoutNow*100).toFixed(0)}% (era ${(payoutOld*100).toFixed(0)}%) y FCF cayendo ${Math.round(-fcfGrowth*100)}% YoY. Vigilar.`;
    } else if (fcfGrowth != null && fcfGrowth < -0.25 && payoutNow != null && payoutNow > 0.60) {
      severity = "warning";
      reason = `FCF TTM cayendo ${Math.round(-fcfGrowth*100)}% YoY con payout ${(payoutNow*100).toFixed(0)}%. Margen de seguridad reduciéndose.`;
    }

    if (!severity) continue;

    if (severity === "critical") critical++; else warning++;

    insights.push({
      ticker: p.ticker,
      severity,
      title: `${p.ticker}: ${severity === "critical" ? "RIESGO RECORTE" : "Vigilar dividendo"}`,
      summary: `${p.name || p.ticker}. ${reason}`,
      details: {
        ttmCoverageNow: Math.round(covNow * 100) / 100,
        ttmCoverageYoY: Math.round(covOld * 100) / 100,
        fcfPayoutNow: payoutNow != null ? Math.round(payoutNow * 100) : null,
        fcfPayoutYoY: payoutOld != null ? Math.round(payoutOld * 100) : null,
        fcfGrowthYoY: fcfGrowth != null ? Math.round(fcfGrowth * 100) : null,
        ttmFcfNow: Math.round((ttmNowFcf || 0) / 1e6),
        ttmDivNow: Math.round((ttmNowDiv || 0) / 1e6),
        payoutSeriesRollingTTM: payoutSeries, // 5 windows: now, -1Q, -2Q, -3Q, -4Q
      },
      score: severity === "critical" ? 9 : 6,
    });
  }

  // Sort: critical first, then by score
  insights.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  // Clear stale rows from previous runs (where this run no longer flags them)
  // so the API doesn't return outdated alerts.
  const flaggedTickers = new Set(insights.map(i => i.ticker));
  try {
    const { results: existing } = await env.DB.prepare(
      "SELECT ticker FROM agent_insights WHERE agent_name = 'dividend_cut_warning' AND fecha = ?"
    ).bind(fecha).all();
    for (const row of (existing || [])) {
      if (!flaggedTickers.has(row.ticker)) {
        await env.DB.prepare(
          "DELETE FROM agent_insights WHERE agent_name = 'dividend_cut_warning' AND fecha = ? AND ticker = ?"
        ).bind(fecha, row.ticker).run();
      }
    }
  } catch (e) { /* non-fatal */ }

  const stored = await storeInsights(env, "dividend_cut_warning", fecha, insights);
  return { agent: "dividend_cut_warning", scanned, alerts: insights.length, critical, warning, stored, reitsSkipped: skippedReits };
}

// ─── Agent 12: Analyst Downgrade Tracker (no LLM, FMP-based) ────
// Detects clusters of analyst rating downgrades that often precede
// dividend cuts by 4-8 weeks. Uses FMP /stable/grades-historical.
async function runAnalystDowngradeAgent(env, fecha) {
  const key = env.FMP_KEY;
  if (!key) return { agent: "analyst_downgrade", skipped: true, reason: "no FMP key" };

  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, last_price FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "analyst_downgrade", skipped: true };

  const cutoff14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  // Load previous snapshot from agent_memory
  const prevMem = (await getAgentMemory(env, "analyst_grades")) || {};

  const insights = [];
  let scanned = 0;
  let withDowngrades = 0;
  const newMem = {};

  // Process in batches of 5 to respect rate limits
  for (let i = 0; i < positions.length; i += 5) {
    const batch = positions.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const sym = toFMP(p.ticker);
        try {
          const url = `https://financialmodelingprep.com/stable/grades-historical?symbol=${encodeURIComponent(sym)}&apikey=${key}`;
          const resp = await fetch(url);
          if (!resp.ok) return null;
          const data = await resp.json();
          if (!Array.isArray(data) || !data.length) return null;
          // Each row: { symbol, date, analystRatingsBuy, analystRatingsHold, analystRatingsSell, analystRatingsStrongBuy, analystRatingsStrongSell }
          // Sort by date desc
          const sorted = data.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          const latest = sorted[0];
          if (!latest) return null;

          // Find a row from ~14 days ago for comparison
          const old = sorted.find(r => (r.date || '') <= cutoff14) || sorted[Math.min(2, sorted.length - 1)];
          if (!old) return null;

          // Score = strongBuy*2 + buy - sell - strongSell*2 (positive = bullish)
          const sentScore = (r) => {
            if (!r) return 0;
            return (Number(r.analystRatingsStrongBuy) || 0) * 2
                 + (Number(r.analystRatingsBuy) || 0)
                 - (Number(r.analystRatingsSell) || 0)
                 - (Number(r.analystRatingsStrongSell) || 0) * 2;
          };
          const totalAnalysts = (r) => (
            (Number(r.analystRatingsStrongBuy) || 0)
          + (Number(r.analystRatingsBuy) || 0)
          + (Number(r.analystRatingsHold) || 0)
          + (Number(r.analystRatingsSell) || 0)
          + (Number(r.analystRatingsStrongSell) || 0)
          );
          const sNow = sentScore(latest);
          const sOld = sentScore(old);
          const totNow = totalAnalysts(latest);
          const drop = sOld - sNow; // positive = sentiment deterioration

          return {
            ticker: p.ticker,
            name: p.name,
            latestDate: latest.date,
            sNow,
            sOld,
            drop,
            totNow,
            buy: Number(latest.analystRatingsBuy) || 0,
            strongBuy: Number(latest.analystRatingsStrongBuy) || 0,
            hold: Number(latest.analystRatingsHold) || 0,
            sell: Number(latest.analystRatingsSell) || 0,
            strongSell: Number(latest.analystRatingsStrongSell) || 0,
          };
        } catch { return null; }
      })
    );

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const v = r.value;
      scanned++;
      newMem[v.ticker] = { sentScore: v.sNow, date: v.latestDate, total: v.totNow };

      // Severity logic (loosened 2026-04-08 per audit — critical threshold
      // was too strict for blue-chip dividend payers, rarely firing):
      //  - critical: drop >= 3 AND >= 5 analysts (was 4/6)
      //  - warning:  drop >= 2 with >= 4 analysts (unchanged)
      //              OR drop >= 1 with >= 12 analysts (loosened from 15)
      //  - info:     no actionable change
      let severity = null;
      let reason = "";
      if (v.drop >= 3 && v.totNow >= 5) {
        severity = "critical";
        reason = `Sentimiento analistas cayó ${v.drop} pts en ~14 días (${v.totNow} cubriendo). Cluster de downgrades — históricamente precede recortes de dividendo en 4-8 semanas.`;
      } else if (v.drop >= 2 && v.totNow >= 4) {
        severity = "warning";
        reason = `Sentimiento analistas bajando: ${v.sOld} → ${v.sNow} (${v.drop} pts). Vigilar próximas guidance.`;
      } else if (v.drop >= 1 && v.totNow >= 12) {
        severity = "warning";
        reason = `Pequeña deriva negativa pero alta cobertura (${v.totNow} analistas). Watchlist.`;
      }

      if (!severity) continue;
      withDowngrades++;

      insights.push({
        ticker: v.ticker,
        severity,
        title: `${v.ticker}: ${severity === "critical" ? "Cluster downgrades" : "Sentiment downgrade"}`,
        summary: `${v.name || v.ticker}. ${reason}`,
        details: {
          sentimentNow: v.sNow,
          sentimentPrev: v.sOld,
          deltaPts: v.drop,
          analystsCovering: v.totNow,
          breakdown: {
            strongBuy: v.strongBuy,
            buy: v.buy,
            hold: v.hold,
            sell: v.sell,
            strongSell: v.strongSell,
          },
          asOf: v.latestDate,
        },
        score: severity === "critical" ? 9 : 5,
      });
    }

    // Throttle between batches
    if (i + 5 < positions.length) await new Promise(r => setTimeout(r, 1200));
  }

  // Persist new snapshot for next-run comparison (overwrite — we use FMP historical, not delta tracking here)
  await setAgentMemory(env, "analyst_grades", newMem);

  insights.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  const stored = await storeInsights(env, "analyst_downgrade", fecha, insights);
  return { agent: "analyst_downgrade", scanned, alerts: insights.length, withDowngrades, stored };
}

// ─── Agent Orchestrator ────────────────────────────────────────
async function runAllAgents(env) {
  const fecha = new Date().toISOString().slice(0, 10);
  console.log(`[Agents] Starting all agents for ${fecha}`);
  const results = {};

  // Step 0a: Cache market indicators (no LLM, just Yahoo Finance)
  try {
    const mktData = await cacheMarketIndicators(env);
    results.marketCache = { tickers: Object.keys(mktData).length };
    console.log(`[Agents] Market indicators cached: ${Object.keys(mktData).length} tickers`);
  } catch (e) {
    results.marketCache = { error: e.message };
    console.error(`[Agents] Market cache failed:`, e.message);
  }

  // Step 0b: Cache GuruFocus scalars (still needed for financialStrength, gfValue, gfScore, etc.)
  // Trends portion is now superseded by FMP financials in step 0d, but the scalar fields
  // (GF Value, RSI, dividend streak, financial strength) have no FMP equivalent yet.
  try {
    const gfResult = await cacheGuruFocusData(env);
    results.gfCache = gfResult;
    console.log(`[Agents] GuruFocus cached: ${gfResult.cached} tickers`);
  } catch (e) {
    results.gfCache = { error: e.message };
    console.error(`[Agents] GuruFocus cache failed:`, e.message);
  }

  // Step 0c: Enrich missing sectors from GF + FMP profile fallback
  try {
    const sectorResult = await enrichPositionSectors(env);
    if (sectorResult.updated > 0) console.log(`[Agents] Sectors enriched: ${sectorResult.updated} updated`);
  } catch (e) {
    console.error(`[Agents] Sector enrichment failed:`, e.message);
  }

  // Step 0d: Cache FMP quarterly financials (replaces gf.trend for Dividend agent).
  // Chunked into 5 calls of 20 tickers each to fit within Workers 30s CPU budget per call.
  try {
    let totalCached = 0, totalFailed = 0;
    for (let off = 0; off < 100; off += 20) {
      const r = await cacheFmpFinancials(env, { offset: off, limit: 20 });
      totalCached += r.cached;
      totalFailed += r.failed;
      if (r.total < 20) break; // last chunk
    }
    results.fmpFinCache = { cached: totalCached, failed: totalFailed };
    console.log(`[Agents] FMP financials cached: ${totalCached} tickers`);
  } catch (e) {
    results.fmpFinCache = { error: e.message };
    console.error(`[Agents] FMP financials cache failed:`, e.message);
  }

  // Step 0e: Cache FMP-derived risk metrics (beta, vol, sharpe, sortino, maxDD).
  // Used by Risk Agent. Same chunking strategy.
  try {
    let totalCached = 0, totalFailed = 0;
    for (let off = 0; off < 100; off += 20) {
      const r = await cacheRiskMetrics(env, { offset: off, limit: 20 });
      totalCached += r.cached;
      totalFailed += r.failed;
      if (r.total < 20) break;
    }
    results.riskMetricsCache = { cached: totalCached, failed: totalFailed };
    console.log(`[Agents] Risk metrics cached: ${totalCached} tickers`);
  } catch (e) {
    results.riskMetricsCache = { error: e.message };
    console.error(`[Agents] Risk metrics cache failed:`, e.message);
  }

  // Step 0f: Refresh earnings transcripts (for Earnings Opus agent).
  // Skipped here — runs on-demand via POST /api/download-transcripts to avoid 30s timeouts.
  // The Earnings agent reads whatever is cached. Manual refresh weekly is sufficient.

  // Pipeline order REORDERED 2026-04-08 per Audit A finding #2:
  // The 3 quantitative "is dividend at risk?" / "earnings deteriorating?"
  // agents (dividend_cut_warning, analyst_downgrade, earnings_trend) now
  // run BEFORE their LLM siblings so the LLM agents can ingest their
  // ground-truth signals and produce one coherent verdict per ticker
  // instead of 4 separate cards answering the same question.
  //
  // Order:
  //  1. regime (Haiku) — sets context for all
  //  2. no-LLM data feeders (parallel-safe, all use cached FMP data)
  //  3. earnings (Opus) — now reads earnings_trend signals
  //  4. dividend (Opus) — now reads cut_warning + analyst_downgrade signals
  //  5. risk + macro (Haiku post-2026-04-08)
  //  6. trade (Opus) — synthesizes everything
  //  7. postmortem — last (no signals to evaluate until tomorrow)
  const agents = [
    ['regime', runRegimeAgent],       // Step 1: Haiku — sets regime context
    // ── no-LLM ground-truth feeders (run first so LLM agents can read them) ──
    ['insider', runInsiderAgent],                         // FMP insider transactions
    ['dividend_cut_warning', runDividendCutWarningAgent], // FCF payout trend (Tier 1)
    ['analyst_downgrade', runAnalystDowngradeAgent],      // FMP grades-historical (Tier 1)
    ['earnings_trend', runEarningsTrendAgent],            // op-income/margin pattern (Tier 3)
    ['value', runValueSignalsAgent],                      // GuruFocus value signals
    ['options', runOptionsIncomeAgent],                   // Yahoo options chain
    ['sec_filings', runSECFilingsAgent],                  // SEC EDGAR 8-K tracker
    // ── LLM agents (consume the no-LLM signals above) ──
    ['earnings', runEarningsAgent],   // Opus + transcripts + earnings_trend signals
    ['dividend', runDividendAgent],   // Opus + Q+S + cut_warning + downgrade signals
    ['risk', runRiskAgent],           // Haiku + FMP-derived risk metrics
    ['macro', runMacroAgent],         // Haiku + market data + economic calendar
    ['trade', runTradeAgent],         // Opus single-call synthesis
    ['postmortem', runPostmortemAgent], // No LLM — runs last, evaluates yesterday's signals
  ];

  for (let i = 0; i < agents.length; i++) {
    const [name, fn] = agents[i];
    // Wait 10s between LLM agents to respect rate limits (skip for postmortem)
    if (i > 0 && name !== 'postmortem') await new Promise(r => setTimeout(r, 10000));
    try {
      results[name] = await fn(env, fecha);
      console.log(`[Agents] ${name} done:`, JSON.stringify(results[name]));
    } catch (e) {
      results[name] = { error: e.message };
      console.error(`[Agents] ${name} failed:`, e.message);
    }
  }

  // Build executive summary + push notification
  try {
    const { results: allToday } = await env.DB.prepare(
      "SELECT agent_name, ticker, severity, title, summary, score, details FROM agent_insights WHERE fecha = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, score DESC"
    ).bind(fecha).all();

    // Executive summary: top actions to take
    const trades = allToday.filter(i => i.agent_name === 'trade' && i.severity !== 'info');
    const options = allToday.filter(i => i.agent_name === 'options' && i.score > 3);
    const insiderAlerts = allToday.filter(i => i.agent_name === 'insider' && i.severity !== 'info');
    const regime = allToday.find(i => i.agent_name === 'regime');
    const criticals = allToday.filter(i => i.severity === 'critical');

    // Store executive summary
    const execLines = [];
    if (regime) {
      const rd = regime.details ? JSON.parse(regime.details) : {};
      execLines.push(`Mercado: ${rd.regime || '?'} (${rd.actionGuidance || '?'})`);
    }
    if (trades.length) execLines.push(`Operaciones: ${trades.map(t => `${t.title}`).slice(0, 3).join(', ')}`);
    if (options.length) execLines.push(`Opciones: ${options.map(o => o.title).slice(0, 2).join(', ')}`);
    if (insiderAlerts.length) execLines.push(`Insiders: ${insiderAlerts.length} alertas (${insiderAlerts.filter(i=>i.severity==='critical').length} criticas)`);

    await storeInsights(env, "summary", fecha, [{
      ticker: '_SUMMARY_',
      severity: criticals.length > 5 ? 'critical' : criticals.length > 0 ? 'warning' : 'info',
      title: `Resumen: ${criticals.length} criticos, ${allToday.filter(i=>i.severity==='warning').length} warnings`,
      summary: execLines.join(' | ') || 'Sin alertas relevantes hoy.',
      details: {
        totalInsights: allToday.length,
        criticals: criticals.length,
        warnings: allToday.filter(i => i.severity === 'warning').length,
        topActions: trades.slice(0, 5).map(t => t.title),
        topOptions: options.slice(0, 3).map(o => o.title),
        insiderAlerts: insiderAlerts.length,
        regime: regime?.title || 'N/A',
      },
      score: criticals.length > 5 ? 2 : criticals.length > 0 ? 5 : 8,
    }]);

    // Push notification with actionable summary
    if (criticals.length > 0) {
      const { results: subs } = await env.DB.prepare("SELECT * FROM push_subscriptions LIMIT 100").all();
      if (subs.length > 0) {
        // Priority: trade actions > insider alerts > options > rest
        const actionItems = [
          ...trades.filter(t => t.severity === 'critical').slice(0, 2).map(t => t.title),
          ...insiderAlerts.filter(i => i.severity === 'critical').slice(0, 1).map(i => `Insider: ${i.title}`),
          ...options.filter(o => o.severity === 'critical').slice(0, 1).map(o => o.title),
        ].slice(0, 3);

        const regimeText = regime ? `${JSON.parse(regime.details || '{}').regime || '?'}` : '';
        const body = actionItems.length
          ? actionItems.join('\n') + (criticals.length > 3 ? `\n+${criticals.length - actionItems.length} mas` : '')
          : criticals.slice(0, 3).map(c => `${c.ticker && !c.ticker.startsWith('_') ? `[${c.ticker}] ` : ''}${c.title}`).join('\n');

        const payload = JSON.stringify({
          title: `A&R: ${criticals.length} alertas${regimeText ? ` | ${regimeText}` : ''}`,
          body,
          url: "/?tab=agentes",
          tag: "ayr-agents-daily",
        });

        let sent = 0;
        for (const sub of subs) {
          try {
            const res = await sendWebPush(env, sub, payload);
            if (res.ok) sent++;
            else if (res.status === 410 || res.status === 404) {
              await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
            }
          } catch (_) {}
        }
        console.log(`[Agents] Push: ${sent} sent, ${criticals.length} critical, ${trades.length} trades, ${options.length} options`);
      }
    }
  } catch (e) {
    console.error("[Agents] Summary/push failed:", e.message);
  }

  console.log(`[Agents] All completed`);
  return results;
}

// ═══════════════════════════════════════════════════════════════
// Web Push Protocol — VAPID + payload encryption via crypto.subtle
// ═══════════════════════════════════════════════════════════════

function base64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return new Uint8Array([...bin].map(c => c.charCodeAt(0)));
}

function base64urlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBuffers(...buffers) {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer || buf), offset);
    offset += buf.byteLength;
  }
  return result;
}

async function createVapidJwt(audience, env) {
  const vapidPublicKey = env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = env.VAPID_PRIVATE_KEY;

  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: 'mailto:ricardo@onto-so.com',
  };

  const encHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${encHeader}.${encPayload}`;

  // Import the VAPID private key for ES256 signing
  const privKeyBytes = base64urlDecode(vapidPrivateKey);
  const pubKeyBytes = base64urlDecode(vapidPublicKey);

  // Build raw PKCS8-like structure for P-256 — we use JWK import instead
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC', crv: 'P-256',
      x: base64urlEncode(pubKeyBytes.slice(1, 33)),
      y: base64urlEncode(pubKeyBytes.slice(33, 65)),
      d: base64urlEncode(privKeyBytes),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw r||s (64 bytes)
  const sigBytes = new Uint8Array(signature);
  let rawSig;
  if (sigBytes.length === 64) {
    rawSig = sigBytes;
  } else {
    // DER encoded — parse it
    const r = parseDerInt(sigBytes, 3);
    const sOffset = 3 + sigBytes[3] + 2;
    const s = parseDerInt(sigBytes, sOffset + 1);
    rawSig = concatBuffers(padTo32(r), padTo32(s));
  }

  return `${unsignedToken}.${base64urlEncode(rawSig)}`;
}

function parseDerInt(buf, offset) {
  const len = buf[offset];
  return buf.slice(offset + 1, offset + 1 + len);
}

function padTo32(buf) {
  if (buf.length === 32) return buf;
  if (buf.length > 32) return buf.slice(buf.length - 32);
  const padded = new Uint8Array(32);
  padded.set(buf, 32 - buf.length);
  return padded;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', key, salt.byteLength ? salt : new Uint8Array(32)));
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const infoWithCounter = concatBuffers(info, new Uint8Array([1]));
  const okm = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, infoWithCounter));
  return okm.slice(0, length);
}

async function encryptPayload(subscription, payloadText) {
  const clientPublicKeyBytes = base64urlDecode(subscription.p256dh);
  const authSecret = base64urlDecode(subscription.auth);
  const payload = new TextEncoder().encode(payloadText);

  // Generate a local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Export local public key (uncompressed 65 bytes)
  const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey));

  // Import the client's public key
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    localKeyPair.privateKey,
    256
  ));

  // Generate 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Key derivation (RFC 8291)
  const authInfo = concatBuffers(
    new TextEncoder().encode('WebPush: info\0'),
    clientPublicKeyBytes,
    localPublicKeyRaw
  );
  const ikm = await hkdf(authSecret, sharedSecret, authInfo, 32);

  const contentEncKeyInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');

  const contentEncKey = await hkdf(salt, ikm, contentEncKeyInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Pad the payload (add a delimiter byte 0x02 then zeroes)
  const paddedPayload = concatBuffers(payload, new Uint8Array([2]));

  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey('raw', contentEncKey, 'AES-GCM', false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    paddedPayload
  ));

  // Build the aes128gcm content-coding header:
  // salt (16) + record size (4, big-endian) + key id length (1) + key id (65 = local public key)
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, paddedPayload.length + 16 + 86, false);
  const header = concatBuffers(
    salt,
    recordSize,
    new Uint8Array([65]),
    localPublicKeyRaw
  );

  return concatBuffers(header, encrypted);
}

async function sendWebPush(env, subscription, payloadText) {
  const encryptedPayload = await encryptPayload(subscription, payloadText);

  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const vapidJwt = await createVapidJwt(audience, env);

  const vapidPublicKey = env.VAPID_PUBLIC_KEY;

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(encryptedPayload.byteLength),
      'TTL': '86400',
      'Authorization': `vapid t=${vapidJwt}, k=${vapidPublicKey}`,
    },
    body: encryptedPayload,
  });

  return response;
}
