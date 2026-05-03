// ═══════════════════════════════════════════════════════════════
// migrations.js — D1 schema bootstrap (extracted from worker.js)
//
// Pure mechanical move — NO logic changes.
// All CREATE TABLE IF NOT EXISTS + ALTER TABLE + CREATE INDEX statements.
// Called from worker.js fetch() on cold start (with a 5s timeout race).
//
// Isolate-local flags: reset on CF Worker cold start — acceptable since
// every statement is idempotent (IF NOT EXISTS / try/catch on ALTERs).
// ═══════════════════════════════════════════════════════════════

// Mutable flag object — exported so worker.js can check/set from the 5s timeout catch block.
// Using an object (not a primitive) means the worker mutates the same binding that lives
// in this module — a plain `export let _migrated` bool would only export the initial value.
export const migrationState = { migrated: false, scannerMigrated: false };

// Rate-limit map for POST /api/error-log — keyed by CF-Connecting-IP.
// Each entry: { count: N, windowStart: timestamp_ms }
// Isolate-local: resets on cold start (acceptable — this is a soft guard
// against runaway loops, not a hard security control).
export const _errorLogRateLimit = new Map();

// Migración aislada para tablas del scanner — independiente del gran ensureMigrations
// que tiene timeout 5s y puede dejar tablas a medias en cold start. Las endpoints
// del scanner llaman a este en lugar de ensureMigrations para garantizar idempotencia.
export async function ensureScannerMigrations(env) {
  if (migrationState.scannerMigrated) return;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scanner_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at TEXT NOT NULL,
      universe TEXT NOT NULL,
      lens_filter TEXT,
      candidates_count INTEGER DEFAULT 0,
      rejected_count INTEGER DEFAULT 0,
      duration_ms INTEGER,
      status TEXT NOT NULL DEFAULT 'success',
      error_msg TEXT,
      ib_connected INTEGER DEFAULT 1,
      meta_json TEXT DEFAULT '{}'
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_scanner_runs_at ON scanner_runs(run_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_scanner_runs_universe ON scanner_runs(universe, run_at DESC)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scanner_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      status TEXT NOT NULL,
      lens_passed TEXT,
      conviction TEXT,
      score_a INTEGER DEFAULT 0,
      score_b INTEGER DEFAULT 0,
      score_c INTEGER DEFAULT 0,
      score_total INTEGER DEFAULT 0,
      flags_json TEXT DEFAULT '[]',
      payload_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES scanner_runs(id)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_snap_run ON scanner_snapshots(run_id)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_snap_ticker ON scanner_snapshots(ticker, created_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_snap_status ON scanner_snapshots(status, score_total DESC)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scanner_filters (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      filters_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scanner_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      lens TEXT NOT NULL,
      conviction TEXT NOT NULL,
      alerted_at TEXT NOT NULL DEFAULT (datetime('now')),
      payload_json TEXT DEFAULT '{}',
      user_action TEXT,
      user_action_at TEXT
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_scanner_alerts_ticker ON scanner_alerts(ticker, alerted_at DESC)`).run();
    migrationState.scannerMigrated = true;
  } catch (e) {
    console.error("ensureScannerMigrations failed:", e.message);
    // No marcar como migrated → reintenta en próximo request
  }
}

export async function ensureMigrations(env) {
  if (migrationState.migrated) return;
  try {
    // claude_usage — Claude API consumption ledger (added 2026-05-02 audit fix).
    // Created here so logClaudeCall can INSERT on cold start without race.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS claude_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      endpoint TEXT,
      model TEXT,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      ticker TEXT
    )`).run();
    // elite_memos — Elite Desk persona memos (added 2026-05-03).
    // Stores generated memos so the UI can show history and avoid regenerating
    // the same (prompt_id, ctx_key) within 24h. ctx_key is a deterministic hash
    // of the input context (ticker / sector / "portfolio").
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS elite_memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id TEXT NOT NULL,
      ctx_key TEXT NOT NULL,
      ctx_type TEXT NOT NULL,
      ctx_value TEXT,
      ctx_label TEXT,
      output_md TEXT NOT NULL,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      generated_at TEXT NOT NULL,
      pinned INTEGER DEFAULT 0
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_elite_memos_pid_ctx ON elite_memos(prompt_id, ctx_key)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_elite_memos_generated ON elite_memos(generated_at DESC)`).run();
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

    // ── Buy Radar (2026-05-03) ─────────────────────────────────────────────
    // Pestaña "Radar" arriba del todo: empresas concretas que el usuario quiere
    // comprar a un precio objetivo, esperando caída. Cuando precio_actual <=
    // target_price se dispara alerta vía /api/alert-rules (Telegram / push).
    // Distinto de la "Cantera/Radar" sub-vista (esa son 100 candidatos
    // sugeridos automáticamente por priority_score).
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS buy_radar (
      ticker TEXT PRIMARY KEY,
      name TEXT,
      target_price REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      reason TEXT,
      alert_id INTEGER,
      alert_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
    try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_buy_radar_sort ON buy_radar(sort_order ASC)`).run(); } catch(_){}

    // ── Error tracking propio (2026-05-03) ──────────────────────────────
    // Reemplaza Sentry/Bugsnag con almacén local en D1. Frontend hace POST
    // a /api/error-log con stack + contexto. Después leemos vía dashboard
    // para ver qué se rompe en producción sin necesidad de SaaS externo.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS errors_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT DEFAULT (datetime('now')),
      severity TEXT DEFAULT 'error',
      message TEXT,
      stack TEXT,
      url TEXT,
      user_agent TEXT,
      context TEXT,
      ticker TEXT,
      tab TEXT,
      build_id TEXT,
      resolved INTEGER DEFAULT 0
    )`).run();
    try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_errors_ts ON errors_log(ts DESC)`).run(); } catch(_){}
    try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_errors_resolved ON errors_log(resolved, ts DESC)`).run(); } catch(_){}

    // ── Expert Analyses (2026-05-03) ────────────────────────────────────
    // Reportes narrativos escritos por Claude Code session (gratis, no API).
    // Distintos del Claude tab que llama API → cuesta. Aquí guardamos:
    //   · ssd_data — JSON con todos los structured fields que la pestaña
    //     Claude actual lee (moat, verdict, divSafetyScore, etc.) pero
    //     escritos por mí en lugar de comprar a Anthropic API
    //   · narrative — markdown narrativo "como analista experto" extenso
    //     que valora calidad/deuda/dividendo/valoración/riesgos/tesis
    //   · updated_at — para mostrar fecha en UI y saber cuándo refrescar
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS expert_analyses (
      ticker TEXT PRIMARY KEY,
      ssd_data TEXT,
      narrative TEXT,
      verdict TEXT,
      score INTEGER,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
    try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_expert_anal_updated ON expert_analyses(updated_at DESC)`).run(); } catch(_){}

    // ── Expert Analyses History (2026-05-03 v2) ────────────────────────
    // Usuario pidió "guarda el historial de todos los informes con fecha,
    // que no se borre cuando hagamos uno nuevo". expert_analyses guarda
    // sólo la versión más reciente (PK ticker → upsert sobrescribe).
    // Esta tabla nueva guarda TODAS las versiones históricas para ver
    // evolución del veredicto a lo largo del tiempo.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS expert_analyses_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      ssd_data TEXT,
      narrative TEXT,
      verdict TEXT,
      score INTEGER,
      version INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
    try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_exp_hist_ticker_ts ON expert_analyses_history(ticker, created_at DESC)`).run(); } catch(_){}

    // Presupuesto: excluded gasto IDs, last payment, custom months
    try { await env.DB.prepare(`ALTER TABLE presupuesto ADD COLUMN excluded_gastos TEXT DEFAULT NULL`).run(); } catch(e) { /* already exists */ }
    try { await env.DB.prepare(`ALTER TABLE presupuesto ADD COLUMN last_payment TEXT DEFAULT NULL`).run(); } catch(e) { /* already exists */ }
    try { await env.DB.prepare(`ALTER TABLE presupuesto ADD COLUMN custom_months INTEGER DEFAULT NULL`).run(); } catch(e) { /* already exists */ }

    // Dividendos: tax fields (retención origen, España, DPS, broker, FX)
    for (const col of ['wht_rate REAL DEFAULT 0','wht_amount REAL DEFAULT 0','spain_rate REAL DEFAULT 0','spain_tax REAL DEFAULT 0','fx_eur REAL DEFAULT 0','dps_gross REAL DEFAULT 0','dps_net REAL DEFAULT 0','commission REAL DEFAULT 0','excess_irpf REAL DEFAULT 0','excess_foreign REAL DEFAULT 0','broker TEXT DEFAULT NULL','company TEXT DEFAULT NULL']) {
      try { await env.DB.prepare(`ALTER TABLE dividendos ADD COLUMN ${col}`).run(); } catch(e) { /* already exists */ }
    }

    // Patrimonio: new fields for CNY bank, split salary, gold, BTC, breakdown JSON
    for (const col of ['construction_bank_cny REAL DEFAULT 0','fx_eur_cny REAL DEFAULT 0','salary_usd REAL DEFAULT 0','salary_cny REAL DEFAULT 0','gold_grams REAL DEFAULT 0','gold_eur REAL DEFAULT 0','btc_amount REAL DEFAULT 0','btc_eur REAL DEFAULT 0','breakdown_json TEXT DEFAULT NULL']) {
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

    // ticker_notebook — Agent Intelligence v2. Memoria persistente por ticker
    // que SIGUE el agente entre runs. Cada run puede ver qué dijo (este mismo
    // agente u otro) sobre este ticker en el pasado y qué preguntas quedaron
    // abiertas. Research Agent escribe summary + open_questions; dividend/
    // earnings/trade escriben un line-item por verdict emitido.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ticker_notebook (
      ticker TEXT PRIMARY KEY,
      summary TEXT,
      open_questions TEXT DEFAULT '[]',
      agent_history TEXT DEFAULT '{}',
      last_research_id INTEGER,
      last_research_date TEXT,
      last_research_verdict TEXT,
      sector TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ticker_notebook_sector ON ticker_notebook(sector)`).run();

    // research_investigations — Research Agent (tool-use Opus). Stores each
    // investigation run with full tool-call trail so we can audit cost/quality.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS research_investigations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT,
      question TEXT,
      trigger_reason TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      duration_s REAL,
      tool_calls_json TEXT DEFAULT '[]',
      total_tool_calls INTEGER DEFAULT 0,
      total_tokens_in INTEGER DEFAULT 0,
      total_tokens_out INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      final_verdict TEXT,
      confidence TEXT,
      summary TEXT,
      evidence_json TEXT DEFAULT '[]',
      full_response TEXT,
      error TEXT
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_research_ticker ON research_investigations(ticker)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_research_started ON research_investigations(started_at DESC)`).run();

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

    // ═══ DESIGN BACKLOG MVPs ═══════════════════════════════════
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
    // One-time migration: normalize space-separated published_at values to ISO T-format.
    // FMP historically returned "2026-04-17 16:55:39"; new inserts use "2026-04-17T16:55:39.000Z".
    // Mixed formats break string comparison in ORDER BY / WHERE >= queries.
    // INSTR check limits this UPDATE to only rows that need it — safe to run every cold start.
    try {
      await env.DB.prepare(
        `UPDATE news_items SET published_at = REPLACE(published_at, ' ', 'T') || 'Z'
          WHERE INSTR(published_at, 'T') = 0 AND INSTR(published_at, ' ') > 0`
      ).run();
    } catch (_) { /* non-fatal */ }

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

    // ─── Portfolio Analytics cache (2026-04-17) ───
    // Single key-value store for correlation, factor, and stress-test results.
    // key: 'correlation' | 'factors' | 'stress_<scenario>'
    // TTL 24h enforced at read time.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS analytics_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();

    // ─── Dividend Compounder Scanner cache (2026-04-17) ───
    // Per-ticker cache row. score_data_json contains the full computed
    // compounder metrics (yield, dgr5y, dgr10y, streak, payout_fcf,
    // fcf_cov, roic, net_debt_ebitda, score, score_breakdown).
    // TTL 24h enforced at read time by comparing updated_at.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS dividend_scanner_cache (
      ticker TEXT PRIMARY KEY,
      compounder_score REAL DEFAULT 0,
      score_data_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_dsc_score ON dividend_scanner_cache(compounder_score DESC)`).run();

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

    // ─── Smart Money Alerts persistence (2026-04-08 ronda 6) ───
    // Stores the materiality-filtered changes so read/muted state
    // survives refreshes and the badge count goes down as the user
    // processes them. Composite PK ensures idempotency: re-running
    // /api/funds/alerts on the same quarter pair won't duplicate rows.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fund_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id TEXT NOT NULL,
      ticker TEXT NOT NULL,
      quarter TEXT NOT NULL,
      prev_quarter TEXT NOT NULL,
      status TEXT NOT NULL,
      tier TEXT NOT NULL,
      name TEXT DEFAULT '',
      w_prev REAL DEFAULT 0,
      w_now REAL DEFAULT 0,
      delta_pct REAL DEFAULT 0,
      value_usd REAL DEFAULT 0,
      detected_at TEXT DEFAULT (datetime('now')),
      read_at TEXT DEFAULT NULL,
      UNIQUE(fund_id, ticker, quarter, status)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_fa_unread ON fund_alerts(read_at) WHERE read_at IS NULL`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_fa_ticker ON fund_alerts(ticker)`).run();
    // Ronda 7 — push notification state per alert (idempotent ALTER)
    try { await env.DB.prepare(`ALTER TABLE fund_alerts ADD COLUMN notified_at TEXT DEFAULT NULL`).run(); } catch(e) {}

    // Muted subjects (ticker globally, or ticker×fund, or whole fund).
    // Either ticker or fund_id can be NULL to mean "all".
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fund_alert_mutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT DEFAULT NULL,
      fund_id TEXT DEFAULT NULL,
      muted_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_fam_ticker ON fund_alert_mutes(ticker)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_fam_fund ON fund_alert_mutes(fund_id)`).run();

    // Ronda 8 — Alert accuracy tracking.
    // For each alert, store the ticker's price at detected_at + prices at
    // 7d/30d/90d after. Returns and hit flags are computed from those.
    // The scoring logic (hit if direction matches status) lives in the
    // /api/funds/alerts/score endpoint, not in the schema.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS alert_outcomes (
      alert_id INTEGER PRIMARY KEY,
      price_at_detected REAL,
      price_7d REAL,
      price_30d REAL,
      price_90d REAL,
      return_7d REAL,
      return_30d REAL,
      return_90d REAL,
      hit_7d INTEGER,
      hit_30d INTEGER,
      hit_90d INTEGER,
      computed_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ao_computed ON alert_outcomes(computed_at)`).run();

    // ─── Earnings documents archive (R2-backed) ───
    // Metadata index for SEC filings (10-K, 10-Q, 8-K) and FMP earnings call
    // transcripts. The actual document bodies live in R2 bucket
    // `ayr-earnings-archive` (binding EARNINGS_R2). r2_key is the object key
    // e.g. "AAPL/2025/Q3/10-Q.txt" or "AAPL/2025/Q3/transcript.txt".
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS earnings_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      fiscal_year INTEGER,
      fiscal_quarter INTEGER,
      filing_date TEXT,
      period_of_report TEXT,
      accession_number TEXT,
      source TEXT,
      source_url TEXT,
      r2_key TEXT NOT NULL,
      r2_key_raw TEXT,
      size_bytes INTEGER,
      size_bytes_raw INTEGER,
      title TEXT,
      downloaded_at TEXT DEFAULT (datetime('now')),
      UNIQUE(ticker, doc_type, fiscal_year, fiscal_quarter, accession_number)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ed_ticker ON earnings_documents(ticker)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ed_type ON earnings_documents(ticker, doc_type)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ed_filed ON earnings_documents(filing_date)`).run();

    // ─── Options trades (Credit Spreads, ROC covered calls, ROP cash-secured puts) ───
    // Single table for all three strategies with NULLable strategy-specific
    // columns. Imported from user's master Excel and also written by the new
    // in-app planner. Derived fields (rorc, arorc, kelly_*, final_*) are
    // computed SERVER-SIDE on insert/update to keep Excel parity authoritative.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS options_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy TEXT NOT NULL,
      account TEXT,
      year INTEGER,
      trade_date TEXT,
      underlying TEXT,
      price REAL,
      on_sale_price REAL,
      dte INTEGER,
      expiration_date TEXT,
      floor_ceiling REAL,
      buffer_pct REAL,
      floor_buffer_strike REAL,
      actual_pct_from_floor REAL,
      prob_otm REAL,
      delta REAL,
      short_strike REAL,
      actual_pct_from_price REAL,
      adj_pct_from_price REAL,
      long_strike REAL,
      spread REAL,
      target_credit REAL,
      credit REAL,
      commission REAL,
      net_credit REAL,
      risk_capital REAL,
      margin_pct REAL,
      margin_capital REAL,
      rorc REAL,
      multiplier REAL,
      arorc REAL,
      qtr_report_flag TEXT,
      kelly_w REAL,
      rc_at_risk_pct REAL,
      avg_loss REAL,
      kelly_r REAL,
      kelly_pct REAL,
      bankroll REAL,
      kelly_max_bet REAL,
      rule1_max_margin REAL,
      max_contracts INTEGER,
      actual_contracts INTEGER,
      shares INTEGER,
      net_credit_total REAL,
      risk_capital_total REAL,
      status TEXT,
      result_date TEXT,
      closing_debit REAL,
      total_debit REAL,
      final_net_credit REAL,
      final_rorc REAL,
      final_arorc REAL,
      parent_trade_id INTEGER,
      notes TEXT,
      source_sheet TEXT,
      source_col INTEGER,
      imported_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_sheet, source_col)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_strategy ON options_trades(strategy)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_year ON options_trades(year)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_status ON options_trades(status)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_underlying ON options_trades(underlying)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_result_date ON options_trades(result_date)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_trade_date ON options_trades(trade_date)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ot_account ON options_trades(account)`).run();

    // Options trade import issues (things we noticed while parsing the Excel)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS options_import_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_sheet TEXT,
      source_col INTEGER,
      severity TEXT,
      category TEXT,
      message TEXT,
      logged_at TEXT DEFAULT (datetime('now'))
    )`).run();

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

    // ═══════════════════════════════════════════════════════════════
    // Deep Dividend Analyzer (2026-04-09)
    // 5 tables for the multi-stage pipeline:
    //   1. deep_extractions      — Stage 1 Haiku output per source doc
    //   2. deep_dividend_analysis — Stage 3 Opus final verdict per ticker+quarter
    //   3. guidance_tracking      — promise vs delivered tracking across quarters
    //   4. prompt_versions        — versioned prompts editable from UI
    //   5. agent_predictions      — track record for ALL agents (not just deep)
    // ═══════════════════════════════════════════════════════════════
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS deep_extractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      source_doc_id INTEGER,
      doc_type TEXT NOT NULL,
      fiscal_year INTEGER,
      fiscal_quarter INTEGER,
      filing_date TEXT,
      extraction_json TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens_in INTEGER,
      tokens_out INTEGER,
      cost_usd REAL,
      created_at INTEGER NOT NULL,
      UNIQUE(ticker, source_doc_id)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_de_ticker_fy ON deep_extractions(ticker, fiscal_year DESC, fiscal_quarter DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_de_doctype ON deep_extractions(doc_type, ticker)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS deep_dividend_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      quarter TEXT NOT NULL,
      sector_bucket TEXT NOT NULL,
      safety_score INTEGER NOT NULL,
      growth_score INTEGER NOT NULL,
      honesty_score INTEGER NOT NULL,
      moat_score INTEGER,
      capital_alloc_score INTEGER,
      composite_score REAL NOT NULL,
      verdict TEXT NOT NULL,
      confidence TEXT NOT NULL,
      cut_probability_3y REAL,
      raise_probability_12m REAL,
      red_flags_count INTEGER DEFAULT 0,
      green_flags_count INTEGER DEFAULT 0,
      result_json TEXT NOT NULL,
      result_md TEXT,
      devils_advocate_json TEXT,
      cross_validation_json TEXT,
      extraction_ids TEXT,
      prompt_version_id INTEGER,
      model_extractor TEXT,
      model_historian TEXT,
      model_analyzer TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      cost_usd REAL,
      created_at INTEGER NOT NULL,
      UNIQUE(ticker, quarter)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_dda_ticker ON deep_dividend_analysis(ticker)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_dda_created ON deep_dividend_analysis(created_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_dda_verdict ON deep_dividend_analysis(verdict)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_dda_safety ON deep_dividend_analysis(safety_score)`).run();

    // Sector Deep Dives table (2026-04-18) — institutional sector landscape reports
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sector_deep_dives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sector TEXT NOT NULL,
      report_date TEXT NOT NULL,
      title TEXT,
      verdict_summary TEXT,
      word_count INTEGER,
      tickers_covered TEXT,
      body_md TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      UNIQUE(sector, report_date)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sdd_sector ON sector_deep_dives(sector)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sdd_date ON sector_deep_dives(report_date DESC)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS guidance_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      quarter_promised TEXT NOT NULL,
      quarter_target TEXT,
      metric TEXT NOT NULL,
      promised_value TEXT,
      promised_quote TEXT,
      delivered_value TEXT,
      delivered_quote TEXT,
      outcome TEXT,
      outcome_evaluated_at INTEGER,
      created_at INTEGER NOT NULL,
      UNIQUE(ticker, quarter_promised, metric)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gt_ticker ON guidance_tracking(ticker, quarter_promised DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gt_outcome ON guidance_tracking(outcome) WHERE outcome IS NOT NULL`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS prompt_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_key TEXT NOT NULL,
      version INTEGER NOT NULL,
      body TEXT NOT NULL,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(prompt_key, version)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pv_active ON prompt_versions(prompt_key, is_active)`).run();

    // Oracle verdicts — Buffett-persona synthesis over Deep Dividend + agents +
    // fundamentals + transcripts + 10y GF metrics. One verdict per ticker,
    // 24h TTL (unless force=1). Powers the Buy Wizard's hero panel.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS oracle_verdicts (
      ticker TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      conviction INTEGER,
      one_liner TEXT,
      summary TEXT,
      verdict_json TEXT NOT NULL,
      context_used TEXT,
      model TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      cost_usd REAL,
      generated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_oracle_expires ON oracle_verdicts(expires_at)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL,
      ticker TEXT NOT NULL,
      prediction_date INTEGER NOT NULL,
      verdict TEXT NOT NULL,
      confidence TEXT,
      safety_score INTEGER,
      growth_score INTEGER,
      cut_probability_3y REAL,
      raise_probability_12m REAL,
      prediction_json TEXT,
      evaluated_at INTEGER,
      div_outcome_30d TEXT,
      div_outcome_90d TEXT,
      div_outcome_180d TEXT,
      div_outcome_365d TEXT,
      total_return_30d REAL,
      total_return_90d REAL,
      total_return_180d REAL,
      total_return_365d REAL,
      total_return_vs_sector_365d REAL,
      cut_correct INTEGER,
      raise_correct INTEGER,
      brier_score REAL,
      notes TEXT,
      UNIQUE(agent_name, ticker, prediction_date)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ap_eval ON agent_predictions(evaluated_at, prediction_date)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ap_agent ON agent_predictions(agent_name, ticker)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ap_pending_eval ON agent_predictions(agent_name, evaluated_at) WHERE evaluated_at IS NULL`).run();

    // Smart alerts: 8-K material events tracker (CEO change, impairments, restatements)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS material_events_8k (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      filing_date TEXT NOT NULL,
      accession_number TEXT NOT NULL,
      item_codes TEXT NOT NULL,
      event_type TEXT,
      event_summary TEXT,
      severity TEXT,
      raw_url TEXT,
      processed_at INTEGER NOT NULL,
      alert_sent INTEGER DEFAULT 0,
      UNIQUE(ticker, accession_number)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_8k_ticker ON material_events_8k(ticker, filing_date DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_8k_severity ON material_events_8k(severity)`).run();

    // Smart alerts: insider cluster detection (preEarnings)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS insider_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      direction TEXT NOT NULL,
      n_insiders INTEGER NOT NULL,
      total_value_usd REAL,
      n_executives INTEGER,
      includes_cfo INTEGER DEFAULT 0,
      includes_ceo INTEGER DEFAULT 0,
      excluded_10b51_count INTEGER DEFAULT 0,
      next_earnings_date TEXT,
      days_to_earnings INTEGER,
      severity TEXT,
      detected_at INTEGER NOT NULL,
      alert_sent INTEGER DEFAULT 0,
      UNIQUE(ticker, window_start, direction)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ic_ticker ON insider_clusters(ticker, window_start DESC)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS price_cache (id TEXT PRIMARY KEY, data TEXT, updated_at TEXT)`).run();

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

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fmp_financials_cache (
      ticker TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS quality_safety_scores (
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
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_qss_ticker ON quality_safety_scores(ticker)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_qss_date ON quality_safety_scores(snapshot_date DESC)`).run();

    // ─── Daily Briefing (2026-04-17) ───
    // Persists each generated Opus briefing for history, cost tracking and feedback.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS daily_briefings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      briefing_date TEXT NOT NULL UNIQUE,
      generated_at TEXT NOT NULL,
      briefing_md TEXT NOT NULL,
      tldr TEXT,
      word_count INTEGER,
      sections_present_json TEXT,
      actions_count INTEGER DEFAULT 0,
      inputs_summary_json TEXT,
      opus_cost_usd REAL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      email_sent INTEGER DEFAULT 0,
      email_sent_at TEXT,
      in_app_read INTEGER DEFAULT 0,
      in_app_read_at TEXT,
      feedback_rating INTEGER,
      feedback_text TEXT,
      feedback_at TEXT
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_db_date ON daily_briefings(briefing_date DESC)`).run();

    // ─── Cantera (Farm Team) — pre-portfolio radar candidates (2026-04-17) ───
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS cantera (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT UNIQUE NOT NULL,
      name TEXT,
      sector TEXT,
      sub_sector TEXT,
      priority_score REAL DEFAULT 0,
      compounder_score REAL DEFAULT 0,
      smart_money_conviction INTEGER DEFAULT 0,
      yield_pct REAL DEFAULT 0,
      dgr_5y REAL DEFAULT 0,
      payout_ratio REAL DEFAULT 0,
      streak_years INTEGER DEFAULT 0,
      safety_score REAL,
      reason_to_watch TEXT,
      entry_trigger TEXT,
      sources TEXT,
      status TEXT DEFAULT 'radar',
      added_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      promoted_at TEXT
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_cantera_priority ON cantera(priority_score DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_cantera_status ON cantera(status)`).run();

    // ─── Custom Alert Rules Engine (2026-04-17) ───
    // User-defined triggers per ticker. Evaluated daily in cron + on demand.
    // rule_type: 'price_below' | 'price_above' | 'yield_above' | 'yield_below'
    //          | 'safety_below' | 'dividend_cut' | 'earnings_miss' | 'custom'
    // status: 'active' | 'paused' | 'triggered' (auto-set on trigger, stays 'active' for recurring)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      operator TEXT,
      threshold REAL,
      unit TEXT,
      message TEXT,
      status TEXT DEFAULT 'active',
      triggered_at TEXT,
      triggered_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_rules_ticker_status ON alert_rules(ticker, status)`).run();

    // ─── Smart Alerts IA — narrative event alerts (2026-04-17) ───
    // Stores alerts generated by the IA narrative scan. Dedup key is
    // (ticker, event_type, event_date) so the same event is never inserted twice.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ia_narrative_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'LOW',
      summary_es TEXT NOT NULL,
      details_json TEXT DEFAULT '{}',
      push_sent INTEGER DEFAULT 0,
      leida INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(ticker, event_type, event_date)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_iana_ticker ON ia_narrative_alerts(ticker, event_date DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_iana_severity ON ia_narrative_alerts(severity, leida)`).run();

    // decision_journal table (trade rationale + review)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS decision_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_date TEXT NOT NULL,
      ticker TEXT NOT NULL,
      action TEXT NOT NULL,
      shares REAL,
      price REAL,
      thesis_1 TEXT,
      thesis_2 TEXT,
      thesis_3 TEXT,
      target_price REAL,
      stop_price REAL,
      time_horizon TEXT,
      conviction INTEGER,
      review_date TEXT,
      review_result TEXT,
      review_notes TEXT,
      review_completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_journal_review ON decision_journal(review_date, review_completed_at)`).run();

    // ─── Recommendations log (2026-04-18) ───
    // Records EVERY recommendation the system makes with price + context, so
    // we can measure accuracy 3 months later. This is the "accountability
    // loop" the user asked for — proof that recommendations actually work.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS recommendations_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommended_at TEXT NOT NULL,
      source TEXT NOT NULL,              -- 'deep_dividend' | 'action_plan' | 'agent_dividend' | 'agent_trade' | 'manual'
      ticker TEXT NOT NULL,
      action TEXT NOT NULL,              -- 'BUY' | 'ADD' | 'HOLD' | 'TRIM' | 'SELL'
      price_at_rec REAL,                 -- price when recommendation was made
      target_price REAL,                 -- optional target
      stop_price REAL,                   -- optional stop loss
      reason TEXT,                       -- short rationale (<200 chars)
      details TEXT DEFAULT '{}',         -- JSON: full context, scores, filters
      review_due TEXT,                   -- date we should check outcome (default +90d)
      review_status TEXT DEFAULT 'pending',  -- 'pending' | 'correct' | 'wrong' | 'partial'
      price_at_review REAL,              -- price when reviewed
      return_pct REAL,                   -- computed return since rec
      review_notes TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_recs_ticker ON recommendations_log(ticker, recommended_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_recs_review ON recommendations_log(review_due, review_status)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_recs_source ON recommendations_log(source, recommended_at DESC)`).run();

    // ─── Weekly Digest (2026-04-17) ───
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS weekly_digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL UNIQUE,
      md TEXT NOT NULL,
      html TEXT NOT NULL DEFAULT '',
      opus_intro TEXT DEFAULT '',
      actions_json TEXT DEFAULT '[]',
      inputs_summary_json TEXT DEFAULT '{}',
      opus_cost_usd REAL DEFAULT 0,
      email_sent INTEGER DEFAULT 0,
      email_sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_weekly_digests_week ON weekly_digests(week_start DESC)`).run();

    // ─── Options Income Scanner (2026-04-26) ───
    // Backbone: NAS Synology DS423+ corre IB Gateway + ib-bridge tras CF Tunnel.
    // Worker proxea endpoints /api/ib-bridge/* y guarda snapshots cada hora vía cron.
    // 4 tablas: runs (cada ejecución), snapshots (candidatos por run),
    // filters (configuración usuario), alerts (HOT notifications).
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scanner_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at TEXT NOT NULL,
      universe TEXT NOT NULL,
      lens_filter TEXT,
      candidates_count INTEGER DEFAULT 0,
      rejected_count INTEGER DEFAULT 0,
      duration_ms INTEGER,
      status TEXT NOT NULL DEFAULT 'success',
      error_msg TEXT,
      ib_connected INTEGER DEFAULT 1,
      meta_json TEXT DEFAULT '{}'
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_scanner_runs_at ON scanner_runs(run_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_scanner_runs_universe ON scanner_runs(universe, run_at DESC)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scanner_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      status TEXT NOT NULL,
      lens_passed TEXT,
      conviction TEXT,
      score_a INTEGER DEFAULT 0,
      score_b INTEGER DEFAULT 0,
      score_c INTEGER DEFAULT 0,
      score_total INTEGER DEFAULT 0,
      flags_json TEXT DEFAULT '[]',
      payload_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES scanner_runs(id)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_snap_run ON scanner_snapshots(run_id)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_snap_ticker ON scanner_snapshots(ticker, created_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_snap_status ON scanner_snapshots(status, score_total DESC)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scanner_filters (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      filters_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scanner_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      lens TEXT NOT NULL,
      conviction TEXT NOT NULL,
      alerted_at TEXT NOT NULL DEFAULT (datetime('now')),
      payload_json TEXT DEFAULT '{}',
      user_action TEXT,
      user_action_at TEXT
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_scanner_alerts_ticker ON scanner_alerts(ticker, alerted_at DESC)`).run();

    migrationState.migrated = true;
  } catch(e) {
    console.error("Migration error:", e.message);
  }
}
