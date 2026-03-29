-- ═══════════════════════════════════════════════════════════════
-- AA&R Database Schema v1.0 — Cloudflare D1 (SQLite)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. PATRIMONIO (snapshots mensuales) ───────────────────────
CREATE TABLE IF NOT EXISTS patrimonio (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha       TEXT NOT NULL UNIQUE,
  fx_eur_usd  REAL,
  bank        REAL DEFAULT 0,
  broker      REAL DEFAULT 0,
  fondos      REAL DEFAULT 0,
  crypto      REAL DEFAULT 0,
  hipoteca    REAL DEFAULT 0,
  total_usd   REAL DEFAULT 0,
  total_eur   REAL DEFAULT 0,
  salary      REAL DEFAULT 0,
  notas       TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patrimonio_fecha ON patrimonio(fecha DESC);

-- ─── 2. DIVIDENDOS (cada cobro individual de IB) ──────────────
CREATE TABLE IF NOT EXISTS dividendos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha       TEXT NOT NULL,
  ticker      TEXT NOT NULL,
  bruto       REAL NOT NULL,
  neto        REAL NOT NULL,
  divisa      TEXT DEFAULT 'USD',
  shares      REAL,
  notas       TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_div_fecha ON dividendos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_div_ticker ON dividendos(ticker);
CREATE INDEX IF NOT EXISTS idx_div_fecha_ticker ON dividendos(fecha, ticker);

-- ─── 3. GASTOS (cada gasto individual de Spendee) ─────────────
CREATE TABLE IF NOT EXISTS gastos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha       TEXT NOT NULL,
  categoria   TEXT NOT NULL,
  importe     REAL NOT NULL,
  divisa      TEXT DEFAULT 'EUR',
  descripcion TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_cat ON gastos(categoria);

-- ─── 4. CATEGORÍAS DE GASTO ───────────────────────────────────
CREATE TABLE IF NOT EXISTS gasto_categorias (
  codigo      TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  icono       TEXT
);

-- ─── 5. INGRESOS MENSUALES (por fuente) ───────────────────────
CREATE TABLE IF NOT EXISTS ingresos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mes         TEXT NOT NULL UNIQUE,
  dividendos  REAL DEFAULT 0,
  covered_calls REAL DEFAULT 0,
  rop         REAL DEFAULT 0,
  roc         REAL DEFAULT 0,
  cal         REAL DEFAULT 0,
  leaps       REAL DEFAULT 0,
  total       REAL DEFAULT 0,
  gastos_usd  REAL DEFAULT 0,
  salary      REAL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ingresos_mes ON ingresos(mes DESC);

-- ─── 6. GASTOS MENSUALES POR DIVISA ──────────────────────────
CREATE TABLE IF NOT EXISTS gastos_mensuales (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mes         TEXT NOT NULL UNIQUE,
  eur         REAL DEFAULT 0,
  cny         REAL DEFAULT 0,
  usd         REAL DEFAULT 0,
  total_usd   REAL DEFAULT 0,
  fx_eur_usd  REAL,
  fx_cny_usd  REAL,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── 7. HOLDINGS (posiciones actuales e históricas) ───────────
CREATE TABLE IF NOT EXISTS holdings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker      TEXT NOT NULL UNIQUE,
  num_trades  INTEGER DEFAULT 0,
  shares      REAL DEFAULT 0,
  div_total   REAL DEFAULT 0,
  opciones_pl REAL DEFAULT 0,
  avg_cost    REAL,
  first_trade TEXT,
  activo      INTEGER DEFAULT 1,
  sector      TEXT,
  pais        TEXT DEFAULT 'US',
  divisa      TEXT DEFAULT 'USD',
  notas       TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker);

-- ─── 8. TRADES (registro de operaciones diarias) ─────────────
CREATE TABLE IF NOT EXISTS trades (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha       TEXT NOT NULL,
  ticker      TEXT NOT NULL,
  tipo        TEXT NOT NULL,
  shares      REAL DEFAULT 0,
  precio      REAL,
  comision    REAL DEFAULT 0,
  importe     REAL,
  divisa      TEXT DEFAULT 'USD',
  opt_tipo    TEXT,
  opt_strike  REAL,
  opt_expiry  TEXT,
  opt_premium REAL,
  div_bruto   REAL,
  div_neto    REAL,
  div_wht_pct REAL,
  fuente      TEXT DEFAULT 'manual',
  notas       TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trades_fecha ON trades(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker);
CREATE INDEX IF NOT EXISTS idx_trades_tipo ON trades(tipo);

-- ─── 9. FIRE TRACKING (mensual) ──────────────────────────────
CREATE TABLE IF NOT EXISTS fire_tracking (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mes         TEXT NOT NULL UNIQUE,
  fi          REAL DEFAULT 0,
  cobertura   REAL DEFAULT 0,
  ahorro      REAL DEFAULT 0,
  acumulado   REAL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── 10. FIRE PROJECTIONS (anual) ────────────────────────────
CREATE TABLE IF NOT EXISTS fire_proyecciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  anio        INTEGER NOT NULL UNIQUE,
  inicio      REAL DEFAULT 0,
  fin         REAL DEFAULT 0,
  retorno_pct REAL DEFAULT 0,
  salary      REAL DEFAULT 0,
  gastos      REAL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── 11. P&L ANUAL ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pl_anual (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  anio        TEXT NOT NULL UNIQUE,
  sueldo      REAL DEFAULT 0,
  bolsa       REAL DEFAULT 0,
  dividendos  REAL DEFAULT 0,
  covered_calls REAL DEFAULT 0,
  rop         REAL DEFAULT 0,
  roc         REAL DEFAULT 0,
  leaps       REAL DEFAULT 0,
  cal         REAL DEFAULT 0,
  gastos      REAL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── 12. DIVIDENDOS POR AÑO ─────────────────────────────────
CREATE TABLE IF NOT EXISTS div_por_anio (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  anio        TEXT NOT NULL UNIQUE,
  bruto       REAL DEFAULT 0,
  neto        REAL DEFAULT 0,
  num_cobros  INTEGER DEFAULT 0
);

-- ─── 13. DIVIDENDOS POR MES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS div_por_mes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mes         TEXT NOT NULL UNIQUE,
  bruto       REAL DEFAULT 0,
  neto        REAL DEFAULT 0,
  num_cobros  INTEGER DEFAULT 0
);

-- ─── 14. CONFIG ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config (
  clave       TEXT PRIMARY KEY,
  valor       TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ─── 15. COST BASIS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_basis (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker          TEXT NOT NULL,
  fecha           TEXT NOT NULL,
  tipo            TEXT NOT NULL,
  shares          REAL DEFAULT 0,
  precio          REAL DEFAULT 0,
  comision        REAL DEFAULT 0,
  coste           REAL DEFAULT 0,
  opt_expiry      TEXT,
  opt_tipo        TEXT,
  opt_status      TEXT,
  opt_contracts   INTEGER DEFAULT 0,
  opt_strike      REAL DEFAULT 0,
  opt_credit      REAL DEFAULT 0,
  opt_credit_total REAL DEFAULT 0,
  dps             REAL DEFAULT 0,
  div_total       REAL DEFAULT 0,
  balance         REAL DEFAULT 0,
  total_shares    REAL DEFAULT 0,
  adjusted_basis  REAL DEFAULT 0,
  adjusted_basis_pct REAL DEFAULT 0,
  div_yield_basis REAL DEFAULT 0,
  orden           INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cb_ticker ON cost_basis(ticker);
CREATE INDEX IF NOT EXISTS idx_cb_fecha ON cost_basis(fecha);
