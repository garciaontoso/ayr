// ═══════════════════════════════════════════════════════════════
// A&R API Worker v6 — Cloudflare D1
// v6: +6 FMP endpoints (rating, DCF, estimates, price targets, key metrics, financial growth)
// Endpoints REST para la app financiera
// ═══════════════════════════════════════════════════════════════

let _migrated = false;

async function ensureMigrations(env) {
  if (_migrated) return;
  try {
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
                      "grades","owner_earnings","rev_segments","geo_segments","peers","earnings","pt_summary"];
    for (const col of fundCols) {
      try { await env.DB.prepare(`ALTER TABLE fundamentals ADD COLUMN ${col} TEXT`).run(); } catch(e) { /* already exists */ }
    }

    // Add columns to holdings (idempotent)
    for (const col of ["sector","industry","market_cap","country"]) {
      try { await env.DB.prepare(`ALTER TABLE holdings ADD COLUMN ${col} TEXT`).run(); } catch(e) { /* already exists */ }
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

    _migrated = true;
  } catch(e) {
    console.error("Migration error:", e.message);
  }
}

export default {
  async fetch(request, env) {
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
        const { results } = await env.DB.prepare(
          `INSERT INTO patrimonio (fecha, fx_eur_usd, bank, broker, fondos, crypto, hipoteca, total_usd, total_eur, salary, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(body.fecha, body.fx_eur_usd, body.bank, body.broker, body.fondos, body.crypto, body.hipoteca, body.total_usd, body.total_eur, body.salary, body.notas).run();
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

      // GET /api/dividendos/resumen — por año
      if (path === "/api/dividendos/resumen" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT substr(fecha,1,4) as anio, SUM(bruto) as bruto, SUM(neto) as neto, COUNT(*) as cobros
           FROM dividendos GROUP BY substr(fecha,1,4) ORDER BY anio DESC`
        ).all();
        return json(results, corsHeaders);
      }

      // GET /api/dividendos/mensual — por mes
      if (path === "/api/dividendos/mensual" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT substr(fecha,1,7) as mes, SUM(bruto) as bruto, SUM(neto) as neto, COUNT(*) as cobros
           FROM dividendos GROUP BY substr(fecha,1,7) ORDER BY mes DESC`
        ).all();
        return json(results, corsHeaders);
      }

      // GET /api/dividendos/por-ticker
      if (path === "/api/dividendos/por-ticker" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT ticker, SUM(bruto) as bruto, SUM(neto) as neto, COUNT(*) as cobros,
                  MIN(fecha) as primero, MAX(fecha) as ultimo
           FROM dividendos GROUP BY ticker ORDER BY neto DESC`
        ).all();
        return json(results, corsHeaders);
      }

      // POST /api/dividendos — añadir dividendo (con dedup)
      if (path === "/api/dividendos" && request.method === "POST") {
        const body = await parseBody(request);
        const dup = await env.DB.prepare(
          "SELECT id FROM dividendos WHERE fecha=? AND ticker=? AND ABS(bruto - ?) < 0.01"
        ).bind(body.fecha, body.ticker, body.bruto).first();
        if (dup) return json({ success: true, skipped: true, id: dup.id }, corsHeaders);
        await env.DB.prepare(
          `INSERT INTO dividendos (fecha, ticker, bruto, neto, divisa, shares, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(body.fecha, body.ticker, body.bruto, body.neto, body.divisa || 'USD', body.shares, body.notas).run();
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
        if (limit > 0) { query += " LIMIT ?"; params.push(limit); }

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
        await env.DB.prepare(
          `INSERT INTO gastos (fecha, categoria, importe, divisa, descripcion)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(body.fecha, body.categoria, body.importe, body.divisa || 'EUR', body.descripcion).run();
        return json({ success: true }, corsHeaders);
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
          env.DB.prepare("SELECT * FROM fire_tracking ORDER BY mes DESC").all(),
          env.DB.prepare("SELECT * FROM fire_proyecciones ORDER BY anio").all(),
          env.DB.prepare("SELECT * FROM config WHERE clave = 'fire_params'").first(),
        ]);
        return json({
          tracking: tracking.results,
          proyecciones: proyecciones.results,
          params: config ? JSON.parse(config.valor) : null,
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
        results.forEach(r => { obj[r.clave] = JSON.parse(r.valor); });
        return json(obj, corsHeaders);
      }

      // GET /api/categorias
      if (path === "/api/categorias" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM gasto_categorias ORDER BY codigo LIMIT 200"
        ).all();
        return json(results, corsHeaders);
      }

      // GET /api/stats — resumen rápido para el dashboard
      if (path === "/api/stats" && request.method === "GET") {
        const [lastPatrimonio, divThisYear, divLastYear, totalGastos] = await Promise.all([
          env.DB.prepare("SELECT * FROM patrimonio ORDER BY fecha DESC LIMIT 1").first(),
          env.DB.prepare("SELECT SUM(neto) as total FROM dividendos WHERE fecha >= date('now','start of year')").first(),
          env.DB.prepare("SELECT SUM(neto) as total FROM dividendos WHERE fecha >= date('now','-1 year','start of year') AND fecha < date('now','start of year')").first(),
          env.DB.prepare("SELECT COUNT(*) as n FROM gastos").first(),
        ]);
        return json({
          patrimonio: lastPatrimonio,
          div_ytd: divThisYear?.total || 0,
          div_last_year: divLastYear?.total || 0,
          total_gastos_entries: totalGastos?.n || 0,
        }, corsHeaders);
      }

      // DELETE /api/dividendos/:id
      if (path.startsWith("/api/dividendos/") && request.method === "DELETE") {
        const id = path.split("/").pop();
        await env.DB.prepare("DELETE FROM dividendos WHERE id = ?").bind(id).run();
        return json({ success: true, deleted: id }, corsHeaders);
      }

      // PUT /api/gastos/:id — update gasto
      if (path.startsWith("/api/gastos/") && request.method === "PUT") {
        const id = path.split("/").pop();
        const body = await parseBody(request);
        const sets = []; const vals = [];
        if (body.descripcion !== undefined) { sets.push("descripcion = ?"); vals.push(body.descripcion); }
        if (body.divisa !== undefined) { sets.push("divisa = ?"); vals.push(body.divisa); }
        if (body.categoria !== undefined) { sets.push("categoria = ?"); vals.push(body.categoria); }
        if (body.importe !== undefined) { sets.push("importe = ?"); vals.push(body.importe); }
        if (body.fecha !== undefined) { sets.push("fecha = ?"); vals.push(body.fecha); }
        if (sets.length === 0) return json({ error: "Nothing to update" }, corsHeaders);
        vals.push(id);
        await env.DB.prepare(`UPDATE gastos SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
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
        const id = path.split("/").pop();
        await env.DB.prepare("DELETE FROM gastos WHERE id = ?").bind(id).run();
        return json({ success: true, deleted: id }, corsHeaders);
      }

      // DELETE /api/patrimonio/:id
      if (path.startsWith("/api/patrimonio/") && request.method === "DELETE") {
        const id = path.split("/").pop();
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
        query += " ORDER BY fecha DESC, orden ASC LIMIT ? OFFSET ?";
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

      // DELETE /api/costbasis/:id
      if (path.startsWith("/api/costbasis/") && request.method === "DELETE") {
        const id = path.split("/").pop();
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
        "FDJU": "FDJ.PA", "WKL": "WKL.AS",               // France / Netherlands
        "HEN3": "HEN3.DE",                                 // Germany
        "HGK:9616": "9616.HK", "HKG:1052": "1052.HK",   // Hong Kong
        "HKG:1910": "1910.HK", "HKG:2219": "2219.HK", "HKG:9618": "9618.HK",
        "LSEG": "LSEG.L",                                 // London (GBX)
        "NET.UN": "NET-UN.TO",                             // Canada
        // US ADRs / special
        "CNSWF": "CNSWF", "DIDIY": "DIDIY",
        "IIPR-PRA": "IIPR-PA", "LANDP": "LAND-P",
      };

      // GET /api/prices — get cached prices or refresh
      if (path === "/api/prices" && request.method === "GET") {
        const forceRefresh = url.searchParams.get("refresh") === "1";
        
        // Check cache (stored in D1)
        if (!forceRefresh) {
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
                const resp = await fetch(
                  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`,
                  { headers: { "User-Agent": "Mozilla/5.0" } }
                );
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                const meta = data?.chart?.result?.[0]?.meta;
                if (meta) {
                  return {
                    ticker,
                    price: meta.regularMarketPrice,
                    prevClose: meta.previousClose || meta.chartPreviousClose,
                    currency: meta.currency,
                    exchange: meta.exchangeName,
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
        const from = url.searchParams.get("from") || new Date(Date.now()-10*365.25*86400000).toISOString().slice(0,10);
        try {
          const resp = await fetch(`${FMP_BASE}/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}&apikey=${FMP_KEY}`);
          if (!resp.ok) return json({ error: "FMP error", status: resp.status }, corsHeaders, 502);
          const data = await resp.json();
          return json(data, corsHeaders);
        } catch(e) {
          return json({ error: "Price history fetch failed: " + e.message }, corsHeaders, 500);
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
                return json({
                  symbol: cached.symbol,
                  income: JSON.parse(cached.income || "[]"),
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
        const [incResp, balResp, cfResp, profResp, divResp, ratResp,
               ratingResp, dcfResp, estResp, ptResp, kmResp, fgResp, gradesResp, oeResp,
               revSegResp, geoSegResp, peersResp, earningsResp, ptSummResp] = await Promise.allSettled([
          // Original 6
          fetch(`${FMP_BASE}/income-statement?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/balance-sheet-statement?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/cash-flow-statement?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/profile?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/historical-price-eod/dividend/${sym}?apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/ratios?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()),
          // +13 new endpoints
          fetch(`${FMP_BASE}/ratings-snapshot?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/discounted-cash-flow?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/analyst-estimates?symbol=${sym}&period=annual&limit=5&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/price-target-consensus?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/key-metrics?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/financial-growth?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/grades-consensus?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/owner-earnings?symbol=${sym}&period=annual&limit=5&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/revenue-product-segmentation?symbol=${sym}&period=annual&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/revenue-geographic-segmentation?symbol=${sym}&period=annual&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/stock-peers?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/earnings?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()),
          fetch(`${FMP_BASE}/price-target-summary?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()),
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

        // Store in D1
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

      // GET /api/peer-ratios?symbols=MSFT,GOOG — lightweight batch fetch of PE & EV/EBITDA for peers
      if (path === "/api/peer-ratios" && request.method === "GET") {
        const symbolsParam = url.searchParams.get("symbols");
        if (!symbolsParam) return json({ error: "Missing ?symbols=" }, corsHeaders);
        const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 8);

        const results = await Promise.allSettled(
          symbols.map(async sym => {
            const [kmResp, profResp] = await Promise.allSettled([
              fetch(`${FMP_BASE}/key-metrics?symbol=${sym}&period=annual&limit=1&apikey=${FMP_KEY}`).then(r => r.json()),
              fetch(`${FMP_BASE}/profile?symbol=${sym}&apikey=${FMP_KEY}`).then(r => r.json()),
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
                const [inc, bal, cf, prof, rat, rtg, dcfR, km, fg] = await Promise.all([
                  fetch(`${FMP_BASE}/income-statement?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/balance-sheet-statement?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/cash-flow-statement?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/profile?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/ratios?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/ratings-snapshot?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/discounted-cash-flow?symbol=${sym}&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return{};}),
                  fetch(`${FMP_BASE}/key-metrics?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
                  fetch(`${FMP_BASE}/financial-growth?symbol=${sym}&period=annual&limit=10&apikey=${FMP_KEY}`).then(r=>r.json()).catch(e=>{console.error("FMP fetch err:",e.message);return[];}),
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
          ["HGK:9616","Neutech Group Limited",8000,"HKD",0.127706581,"COMPANY","GORKA","Technology","Hong Kong",2.54],
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
};

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
