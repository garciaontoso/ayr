// ═══════════════════════════════════════════════════════════════
// A&R API Worker v6 — Cloudflare D1
// v6: +6 FMP endpoints (rating, DCF, estimates, price targets, key metrics, financial growth)
// Endpoints REST para la app financiera
// ═══════════════════════════════════════════════════════════════

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
  "WKL": "WKL.AS", "SHUR": "SHUR.AS",
  "RAND": "RAND.AS",     // Randstad (Netherlands), NOT Rand Capital
  "NET.UN": "NET-UN.TO",
  "CNSWF": "CNSWF",
};
// Helper: convert our ticker to FMP symbol
const toFMP = (t) => FMP_MAP[t] || t;
// Helper: reverse-map FMP symbol back to our ticker
const FMP_REVERSE = Object.fromEntries(Object.entries(FMP_MAP).map(([k, v]) => [v, k]));
const fromFMP = (fmpSym) => FMP_REVERSE[fmpSym] || fmpSym;

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

    // push_subscriptions table (Web Push)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_used TEXT
    )`).run();

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

async function fetchYahoo(url, { maxRetries = 2 } = {}) {
  return fetchWithRetry(url, { headers: { "User-Agent": "Mozilla/5.0" } }, { maxRetries, baseDelay: 1500 });
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

  // 3. Fetch account summary and save NLV + buying power
  let totalBuyingPower = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    let totalNlv = 0, totalCash = 0, totalGross = 0, totalMargin = 0;
    const get = (summary, field) => summary?.[field]?.amount || 0;

    for (const accountId of accountIds) {
      const summary = await ib("GET", `/portfolio/${accountId}/summary`);
      totalNlv += get(summary, "netliquidation");
      totalCash += get(summary, "totalcashvalue");
      totalGross += get(summary, "grosspositionvalue");
      totalMargin += get(summary, "initmarginreq");
      totalBuyingPower += get(summary, "buyingpower");
    }

    if (totalNlv > 0) {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO nlv_history (fecha, nlv, cash, positions_value, margin_used, accounts, positions_count, buying_power) VALUES (?,?,?,?,?,?,?,?)"
      ).bind(today, totalNlv, totalCash, totalGross, totalMargin, accountIds.length, 0, totalBuyingPower).run();
      nlvUpdated = true;
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

      // ─── LIVE PRICES VIA YAHOO FINANCE ────────────────────

      // Mapping from our tickers to Yahoo Finance symbols
      const YAHOO_MAP = {
        // International tickers
        "AZJ": "AZJ.AX", "GQG": "GQG.AX",               // Australia
        "BME:AMS": "AMS.MC", "BME:VIS": "VIS.MC",        // Spain
        "ENG": "ENG.MC", "SHUR": "SHUR.AS",              // Spain / Netherlands
        "FDJU": "FDJ.PA", "WKL": "WKL.AS", "RAND": "RAND.AS", // France / Netherlands
        "HEN3": "HEN3.DE",                                 // Germany
        "HKG:9616": "9616.HK", "HKG:1052": "1052.HK",   // Hong Kong
        "HKG:1910": "1910.HK", "HKG:2219": "2219.HK", "HKG:9618": "9618.HK",
        "ITRK": "ITRK.L", "LSEG": "LSEG.L",               // London (GBX)
        "NET.UN": "NET-UN.TO",                             // Canada
        // US ADRs / special
        "CNSWF": "CNSWF", "DIDIY": "DIDIY",
        "IIPR-PRA": "IIPR-PA", "LANDP": "LAND-P",
      };

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

        // Fetch fresh prices from Yahoo Finance
        const allTickers = url.searchParams.get("tickers")?.split(",") || [];
        if (allTickers.length === 0) {
          return json({ error: "Pass ?tickers=AAPL,SCHD,..." }, corsHeaders);
        }

        const prices = {};
        const errors = [];
        
        // Process in batches of 10 (parallel within batch, sequential between batches)
        for (let i = 0; i < allTickers.length; i += 10) {
          const batch = allTickers.slice(i, i + 10);
          const results = await Promise.allSettled(
            batch.map(async (ticker) => {
              const yahooSymbol = YAHOO_MAP[ticker] || ticker;
              try {
                const resp = await fetchYahoo(
                  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`
                );
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                const meta = data?.chart?.result?.[0]?.meta;
                if (meta) {
                  // Extract 5-day close prices for sparkline
                  const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
                  const spark = closes.filter(v => v != null).slice(-5);
                  return {
                    ticker,
                    price: meta.regularMarketPrice,
                    prevClose: meta.previousClose || meta.chartPreviousClose,
                    currency: meta.currency,
                    exchange: meta.exchangeName,
                    spark,
                    change: meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice),
                    changePct: meta.previousClose ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) : 0,
                    dayHigh: meta.regularMarketDayHigh,
                    dayLow: meta.regularMarketDayLow,
                    volume: meta.regularMarketVolume,
                    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
                    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
                    ts: Date.now(),
                  };
                }
                throw new Error("No data");
              } catch (e) {
                errors.push({ ticker, yahooSymbol, error: e.message });
                return null;
              }
            })
          );
          results.forEach(r => { if (r.status === "fulfilled" && r.value) prices[r.value.ticker] = r.value; });
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

        // 1) VIX from Yahoo Finance
        try {
          const resp = await fetchYahoo(
            "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d"
          );
          if (resp.ok) {
            const data = await resp.json();
            const meta = data?.chart?.result?.[0]?.meta;
            if (meta) {
              const prevClose = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice;
              result.vix = {
                price: Math.round(meta.regularMarketPrice * 100) / 100,
                change: Math.round((meta.regularMarketPrice - prevClose) * 100) / 100,
                changePct: prevClose ? Math.round((meta.regularMarketPrice - prevClose) / prevClose * 10000) / 100 : 0,
              };
            }
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
              await ib("GET", `/iserver/marketdata/snapshot?conids=${optConid}&fields=31,84,86,87,7633,7635`);
              await new Promise(r => setTimeout(r, 1000));
              const optSnap = await ib("GET", `/iserver/marketdata/snapshot?conids=${optConid}&fields=31,84,86,87,7633,7635`);
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
                gamma: null, theta: null, vega: null,
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

      // POST /api/ib-nlv-save — save daily NLV snapshot
      if (path === "/api/ib-nlv-save" && request.method === "POST") {
        try {
          const body = await request.json();
          const fecha = body.fecha || new Date().toISOString().slice(0, 10);
          const fechaErr = validateFecha(fecha);
          if (fechaErr) return validationError(fechaErr, corsHeaders);
          const numErr = validateNumber(body.nlv, 'nlv');
          if (numErr) return validationError(numErr, corsHeaders);
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

      // ─── AI AGENTS ──────────────────────────────────────────────

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
        // Run all in background
        ctx.waitUntil((async () => {
          try {
            const result = await runAllAgents(env);
            console.log("Manual agent run completed:", JSON.stringify(result));
          } catch (e) {
            console.error("Manual agent run failed:", e.message);
          }
        })());
        return json({ ok: true, message: "Agents started in background (~2 min). Refresh insights to see results." }, corsHeaders);
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

async function callAgentClaude(env, systemPrompt, userContent, opts = {}) {
  const model = opts.model || "claude-haiku-4-5-20251001";
  const maxTokens = opts.maxTokens || 3000;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: typeof userContent === "string" ? userContent : JSON.stringify(userContent) }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude API error ${resp.status}: ${errText}`);
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

// ─── Helper: Cache Market Indicators ───────────────────────────
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

  const results = {};
  // Fetch in batches of 8 via Yahoo
  for (let i = 0; i < MARKET_TICKERS.length; i += 8) {
    const batch = MARKET_TICKERS.slice(i, i + 8);
    const batchResults = await Promise.allSettled(
      batch.map(async (ticker) => {
        const resp = await fetchYahoo(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`
        );
        if (!resp.ok) return null;
        const data = await resp.json();
        const meta = data?.chart?.result?.[0]?.meta;
        const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(v => v != null) || [];
        if (!meta) return null;
        const price = meta.regularMarketPrice;
        const prevClose = meta.previousClose || meta.chartPreviousClose || price;
        const firstClose = closes.length > 1 ? closes[0] : prevClose;
        return {
          ticker, price,
          changePct: prevClose ? ((price - prevClose) / prevClose * 100) : 0,
          change5dPct: firstClose ? ((price - firstClose) / firstClose * 100) : 0,
          spark5d: closes.slice(-5),
        };
      })
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) results[r.value.ticker] = r.value;
    }
    if (i + 8 < MARKET_TICKERS.length) await new Promise(r => setTimeout(r, 1500));
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

  const insight = await callAgentClaude(env, system, userContent);
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

  const posData = positions.filter(p => fundMap[p.ticker]?.earnings).map(p => {
    const f = fundMap[p.ticker];
    const e = f.earnings;
    return {
      ticker: p.ticker, name: p.name, sector: p.sector,
      earnings: Array.isArray(e) ? e.slice(0, 2) : e,
      estimates: f.estimates?.slice?.(0, 1),
      revSegments: f.revSegments?.slice?.(0, 1),
      geoSegments: f.geoSegments?.slice?.(0, 1),
      analystGrades: Array.isArray(f.grades) ? f.grades.slice(0, 3) : null,
    };
  }).slice(0, 40);

  if (!posData.length) {
    await storeInsights(env, "earnings", fecha, [{ ticker: "_GLOBAL_", severity: "info", title: "Sin datos de earnings", summary: "No hay datos de earnings disponibles.", details: {}, score: 5 }]);
    return { agent: "earnings", insights: 0 };
  }

  const system = `You are an earnings analyst monitoring a $1.3M dividend income portfolio (China fiscal resident, 10% WHT US-China treaty).
Analyze latest earnings. Flag: revenue miss >3%, EPS miss >5%, guidance changes, margin compression, analyst downgrades.
Use revenue segments and geographic data when available to identify structural shifts.

SEVERITY CALIBRATION:
- critical = earnings miss >10% or dividend at risk due to earnings
- warning = miss 3-10% or margin compression >200bps
- info = beat or minor miss <3%

Respond ONLY JSON array: [{"ticker":"XX","severity":"info|warning|critical","title":"short title","summary":"2-3 sentences","details":{"epsSurprise":null,"revenueSurprise":null,"marginTrend":"","analystAction":"","keyRisks":[]},"score":1-10}]
Max 15 entries. Prioritize critical/warning first.`;

  const insights = await callAgentClaude(env, system, { positions: posData });
  const stored = await storeInsights(env, "earnings", fecha, Array.isArray(insights) ? insights : [insights]);
  return { agent: "earnings", insights: stored };
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

  // Real dividend payments from dividendos table (last 2 years)
  const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
  const { results: realDivs } = await env.DB.prepare(
    `SELECT ticker, fecha, bruto, neto, wht_pct FROM dividendos WHERE fecha >= ? ORDER BY fecha DESC`
  ).bind(twoYearsAgo).all();

  const realDivMap = {};
  for (const d of realDivs) {
    if (!realDivMap[d.ticker]) realDivMap[d.ticker] = [];
    realDivMap[d.ticker].push(d);
  }

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

  const posData = positions.map(p => {
    const f = fundMap[p.ticker] || {};
    const latestRatios = Array.isArray(f.ratios) ? f.ratios[0] : f.ratios;
    const latestCF = Array.isArray(f.cashflow) ? f.cashflow[0] : f.cashflow;
    const ownerE = Array.isArray(f.ownerEarnings) ? f.ownerEarnings[0] : f.ownerEarnings;
    return {
      ticker: p.ticker, name: p.name, sector: p.sector,
      divTTM: p.div_ttm, yield: p.div_yield, yoc: p.yoc,
      payoutRatio: latestRatios?.payoutRatio || latestRatios?.dividendPayoutRatio,
      fcfPerShare: latestCF?.freeCashFlowPerShare,
      ownerEarningsPerShare: ownerE?.ownerEarningsPerShare,
      debtToEquity: latestRatios?.debtEquityRatio,
      interestCoverage: latestRatios?.interestCoverage,
      dividendHistory: Array.isArray(f.dividends) ? f.dividends.slice(0, 8) : null,
      realPayments: (realDivMap[p.ticker] || []).slice(0, 6),
    };
  }).slice(0, 35);

  const system = `You are a dividend safety analyst for a $1.3M dividend income portfolio (China fiscal resident).
Rate each position's dividend sustainability using BOTH fundamentals AND real payment history.
Use owner earnings (FCF adjusted for maintenance capex) over reported FCF when available — it's more accurate.

SEVERITY CALIBRATION:
- critical = payout ratio >100% FCF AND declining revenue, or confirmed dividend cut in history
- warning = payout ratio >80%, or FCF coverage <1.2x, or debt/equity deteriorating
- info = safe dividend with good coverage

Respond ONLY JSON array: [{"ticker":"XX","severity":"info|warning|critical","title":"short title","summary":"2-3 sentences","details":{"payoutRatio":null,"fcfCoverage":null,"ownerEarningsCoverage":null,"streakYears":null,"cutRisk":"low|medium|high","debtConcern":false},"score":1-10}]
Score 1=imminent cut, 10=fortress. Max 20 entries, critical/warning first.`;

  const insights = await callAgentClaude(env, system, { positions: posData });
  const stored = await storeInsights(env, "dividend", fecha, Array.isArray(insights) ? insights : [insights]);
  return { agent: "dividend", insights: stored };
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

  // Use Sonnet for complex narrative synthesis
  const insight = await callAgentClaude(env, system, userContent, { model: "claude-sonnet-4-20250514" });
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

  const system = `You are a portfolio risk analyst for a $1.35M dividend income portfolio with ${positions.length} positions.
Evaluate: concentration risk, sector diversification, drawdown exposure, leverage cost, and regime alignment.

SEVERITY CALIBRATION:
- critical = single position >15% AND falling >20%, or max drawdown >15%, or margin cost > dividend income
- warning = top 5 > 40%, or max drawdown >8%, or sector >50% single sector
- info = well-diversified, manageable drawdown

Respond ONLY JSON: {"severity":"info|warning|critical","title":"short","summary":"3-4 sentences",
"details":{"concentrationScore":1-10,"topRisks":[],"sectorConcentration":"","diversificationScore":1-10,
"leverageCostVsIncome":"","regimeAlignment":"","recommendations":[]},"score":1-10}`;

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
  };

  const insight = await callAgentClaude(env, system, userContent);
  insight.ticker = "_PORTFOLIO_";
  const stored = await storeInsights(env, "risk", fecha, [insight]);
  return { agent: "risk", insights: stored };
}

// ─── Agent 5: Trade Advisor (Bull/Bear Debate — 3 calls) ──────
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

  const posData = positions.map(p => ({
    ticker: p.ticker, name: p.name, shares: p.shares,
    price: p.last_price, avgCost: p.avg_price, pnlPct: p.pnl_pct,
    yield: p.div_yield, value: p.market_value,
    aiScore: aiAnalyses.find(a => a.ticker === p.ticker)?.score,
    aiAction: aiAnalyses.find(a => a.ticker === p.ticker)?.action,
    fairValue: dcfMap[p.ticker]?.dcf?.[0]?.dcf || dcfMap[p.ticker]?.dcf?.dcf,
    priceTarget: dcfMap[p.ticker]?.priceTarget?.[0]?.targetConsensus || dcfMap[p.ticker]?.priceTarget?.targetConsensus,
    analystConsensus: dcfMap[p.ticker]?.grades?.slice?.(0, 2),
  })).slice(0, 30);

  // ── Step 1: Bull Case (Haiku) ──
  const bullSystem = `You are a BULL analyst. Argue IN FAVOR of each position based on agent insights.
For each ticker flagged in today's insights, give 2-3 concrete bullish reasons with data.
Also identify the top 5 positions worth ADDING to based on valuation and dividends.
Respond ONLY JSON array: [{"ticker":"XX","bullCase":"...","upside":"...","addOpportunity":true/false}]
Max 15 tickers.`;

  const bullResult = await callAgentClaude(env, bullSystem, {
    todayInsights: todayInsights.filter(i => i.ticker && i.ticker !== '_GLOBAL_' && !i.ticker.startsWith('_')),
    positions: posData, regime,
  });

  // ── Step 2: Bear Case (Haiku) — receives bull output ──
  const bearSystem = `You are a BEAR analyst. Here are bullish arguments for portfolio positions.
Counter-argue with CONCRETE risks and data the bulls ignore.
For each position, identify the biggest risk and downside scenario.
Respond ONLY JSON array: [{"ticker":"XX","bearCase":"...","downside":"...","keyRisk":"..."}]
Max 15 tickers.`;

  const bearResult = await callAgentClaude(env, bearSystem, {
    bullArguments: bullResult,
    todayInsights: todayInsights.filter(i => i.severity !== 'info'),
    regime,
  });

  // ── Step 3: Synthesis (Sonnet) — receives bull + bear + all insights ──
  const synthSystem = `You are a trade advisor synthesizing bull and bear arguments for a $1.35M dividend income portfolio.
The conviction must reflect the STRENGTH of the debate:
- If bull and bear are balanced → conviction LOW
- If one clearly dominates → conviction HIGH
The owner favors income growth — avoid selling safe dividend growers unless seriously impaired.

Current market regime: ${regime?.regime || 'unknown'} (guidance: ${regime?.actionGuidance || 'unknown'})

SEVERITY CALIBRATION:
- critical = immediate action needed (position >10% AND impaired, or dividend cut imminent)
- warning = review this week (valuation stretched or deteriorating fundamentals)
- info = monitoring (no action needed now)

Respond ONLY JSON array: [{"ticker":"XX","severity":"info|warning|critical","title":"ACTION: Ticker",
"summary":"2-3 sentence rationale incorporating both bull and bear views",
"details":{"action":"BUY|SELL|HOLD|TRIM|ADD","conviction":"low|medium|high",
"bullSummary":"...","bearSummary":"...","targetPrice":null,"timeHorizon":"short|medium|long"},
"score":1-10}]
Max 10 most actionable recommendations. Score = conviction (1=low, 10=very high).`;

  const synthResult = await callAgentClaude(env, synthSystem, {
    bullArguments: bullResult,
    bearArguments: bearResult,
    todayInsights,
    positions: posData.slice(0, 20),
  }, { model: "claude-sonnet-4-20250514" });

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

// ─── Agent Orchestrator ────────────────────────────────────────
async function runAllAgents(env) {
  const fecha = new Date().toISOString().slice(0, 10);
  console.log(`[Agents] Starting all agents for ${fecha}`);
  const results = {};

  // Step 0: Cache market indicators (no LLM, just Yahoo Finance)
  try {
    const mktData = await cacheMarketIndicators(env);
    results.marketCache = { tickers: Object.keys(mktData).length };
    console.log(`[Agents] Market indicators cached: ${Object.keys(mktData).length} tickers`);
  } catch (e) {
    results.marketCache = { error: e.message };
    console.error(`[Agents] Market cache failed:`, e.message);
  }

  // Pipeline order: Regime first → analysis agents → Trade Advisor last → Postmortem
  const agents = [
    ['regime', runRegimeAgent],       // Step 1: sets regime context for all others
    ['earnings', runEarningsAgent],   // Step 2: Haiku
    ['dividend', runDividendAgent],   // Step 3: Haiku
    ['risk', runRiskAgent],           // Step 4: Haiku (reads regime)
    ['macro', runMacroAgent],         // Step 5: Sonnet (reads regime + market data)
    ['trade', runTradeAgent],         // Step 6: Haiku bull + Haiku bear + Sonnet synth
    ['postmortem', runPostmortemAgent], // Step 7: No LLM (pure calculation)
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
