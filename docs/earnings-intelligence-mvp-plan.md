# Earnings Intelligence — MVP plan ejecutable (90–120 min)

> Generado 2026-04-07. Diseño completo en `docs/earnings-intelligence-design.md`. Este documento es el **plan ejecutable** del MVP que entra en una ventana de 90–120 minutos sin tocar `worker.js`/`HomeView.jsx`/`constants/index.js` en paralelo (van como diffs copy-paste).

---

## 1. Resumen ejecutivo

El MVP entrega una pestaña nueva **"📊 Earnings"** en HomeView que responde a dos preguntas concretas alrededor de los reports de las 89 posiciones:

1. **Qué viene** — calendario de earnings de los próximos 30 días, ordenado por fecha y marcado por importancia (weight cartera).
2. **Qué ha pasado** — Track A automático (sin LLM) de los earnings de los últimos 7 días: surprise EPS y revenue, dirección, una frase de resumen.

Adicionalmente, un **briefing pre-earnings ligero** por ticker (modal): consenso, históricos de surprise (últimos 4 quarters de FMP), Q/S actual del ticker (si existe en `quality_safety_scores`), peso en cartera. **Sin Opus, sin transcripts, sin deep dive** — eso es v2.

Todo se construye sobre 2 tablas D1 nuevas (`earnings_calendar`, `earnings_results`) cacheadas con TTL 24h, 4 endpoints worker, y un componente React standalone calcado del patrón `CurrencyTab.jsx`/`MacroTab.jsx`.

---

## 2. Scope estricto

### DENTRO del MVP (≤120 min)
- 2 tablas D1: `earnings_calendar`, `earnings_results`
- 4 endpoints worker:
  - `GET  /api/earnings/upcoming`
  - `POST /api/earnings/briefing/refresh`
  - `GET  /api/earnings/briefing/:ticker`
  - `GET  /api/earnings/post/:ticker`
- 1 componente React: `EarningsTab.jsx` con dos sub-tabs internos (Próximos / Recientes) y modal briefing
- Registro en `constants/index.js` + `HomeView.jsx`
- 4 smoke tests `curl`

### FUERA del MVP (v2 / v3)
- ❌ Track B Opus deep dive (transcript + structured output)
- ❌ Surprise tracker histórico completo + predictability score
- ❌ Notificaciones push pre-earnings
- ❌ Auto-trigger thesis review desde Módulo Proceso
- ❌ Cron automático (refresh es manual desde la UI vía botón hasta v2)
- ❌ Whisper numbers, IV crush, analyst revisions
- ❌ Integración con earnings agent existente (módulos complementarios, sin acoplamiento)
- ❌ Foreign tickers BME/HKG (best-effort: si FMP no devuelve, se omiten silenciosamente)

---

## 3. Schema D1 — añadir a `ensureMigrations`

Pegar en `api/src/worker.js` dentro de `ensureMigrations` (función que empieza ~línea 273), **antes** del bloque `_migrated = true;` (~línea 618). Es idempotente (`IF NOT EXISTS`) y safe para re-deploy.

```js
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
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_earnings_cal_date ON earnings_calendar(earnings_date)"
    ).run();
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_earnings_cal_ticker ON earnings_calendar(ticker)"
    ).run();

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
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_earnings_res_date ON earnings_results(earnings_date)"
    ).run();
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_earnings_res_ticker ON earnings_results(ticker)"
    ).run();
```

---

## 4. Endpoints worker — pegar ANTES del bloque "AI AGENTS"

Pegar el siguiente bloque en `api/src/worker.js` justo **antes** de la línea:

```
      // ─── AI AGENTS ──────────────────────────────────────────────
```

(esa línea está ~5713). Todo el código depende solo de helpers ya existentes en el worker: `toFMP`, `json`, `corsHeaders`, `env.DB`, `env.FMP_KEY`. No se introducen imports nuevos.

```js
      // ═══════════════════════════════════════════════════════════
      // ─── EARNINGS INTELLIGENCE MVP ─────────────────────────────
      // ═══════════════════════════════════════════════════════════
      //
      // GET  /api/earnings/upcoming           → próximos 30 días, portfolio only
      // POST /api/earnings/briefing/refresh   → cachea earnings_calendar 30d
      // GET  /api/earnings/briefing/:ticker   → briefing pre-earnings (cached + FMP fallback)
      // GET  /api/earnings/post/:ticker       → Track A post-earnings (compara actual vs estimate)
      //
      // Sin LLM. Datos vienen de FMP (`/stable/earnings-calendar`, `/stable/earnings`)
      // y se cachean en D1 con TTL implícito (refresh manual desde UI).

      if (path === "/api/earnings/briefing/refresh" && request.method === "POST") {
        const key = env.FMP_KEY;
        if (!key) return json({ error: "no FMP key" }, corsHeaders, 500);
        const today = new Date().toISOString().slice(0, 10);
        const plus30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        // Pull calendar global y filtrar por nuestros tickers
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
        // Map FMP symbol → nuestro ticker (inverso de FMP_MAP)
        const { results: positions } = await env.DB.prepare(
          "SELECT ticker FROM positions WHERE shares > 0"
        ).all();
        const ourTickers = new Set((positions || []).map(p => p.ticker));
        const fmpToOurs = {};
        for (const t of ourTickers) {
          fmpToOurs[toFMP(t)] = t;
          fmpToOurs[t] = t; // identity fallback
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
          const time = ev.time || ev.timeOfDay || null; // 'bmo' | 'amc' | null
          const period = ev.fiscalDateEnding || null;
          // UPSERT
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
        // Total cartera para % weight
        const { results: posAll } = await env.DB.prepare(
          "SELECT COALESCE(usd_value, market_value, 0) AS v FROM positions WHERE shares > 0"
        ).all();
        const totalUsd = (posAll || []).reduce((s, r) => s + (Number(r.v) || 0), 0);
        const todayMs = Date.parse(today);
        const enriched = (results || []).map(r => {
          const value = Number(r.usd_value || r.market_value || 0);
          const weight = totalUsd > 0 ? (value / totalUsd) * 100 : 0;
          const days_until = Math.round((Date.parse(r.earnings_date) - todayMs) / 86400000);
          // Importance: 'critical' >=3% weight, 'high' >=1%, 'normal' rest
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
        const ticker = path.replace("/api/earnings/briefing/", "").toUpperCase();
        if (!ticker) return json({ error: "ticker required" }, corsHeaders, 400);
        const key = env.FMP_KEY;
        // 1. Próximo earnings desde D1 (cached)
        const upcoming = await env.DB.prepare(
          `SELECT ticker, earnings_date, earnings_time, fiscal_period, eps_estimate, revenue_estimate
             FROM earnings_calendar
            WHERE ticker = ? AND earnings_date >= date('now')
            ORDER BY earnings_date ASC LIMIT 1`
        ).bind(ticker).first();
        // 2. Posición usuario
        const pos = await env.DB.prepare(
          "SELECT ticker, name, shares, avg_cost, usd_value, market_value, currency FROM positions WHERE ticker = ?"
        ).bind(ticker).first();
        // 3. Quality + Safety actual (si existe la tabla)
        let qs = null;
        try {
          qs = await env.DB.prepare(
            "SELECT quality_score, safety_score, computed_at FROM quality_safety_scores WHERE ticker = ?"
          ).bind(ticker).first();
        } catch (e) { /* tabla no existe en algún entorno */ }
        // 4. Histórico últimos 4 quarters desde FMP `/stable/earnings`
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
        // Beat rate sobre histórico devuelto
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
        // Lista de los últimos 7 días — Track A
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
          // ¿Tenemos result cached?
          let cached = await env.DB.prepare(
            "SELECT * FROM earnings_results WHERE ticker = ? AND earnings_date = ?"
          ).bind(r.ticker, r.earnings_date).first();
          if (!cached && key) {
            // Try fetch latest actuals from FMP
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
```

> Nota: el listado endpoint es `/api/earnings/post` (sin ticker) — devuelve los earnings de los últimos 7 días. El doc original mencionaba `/api/earnings/post/:ticker` pero el MVP no necesita drill-down individual: la lista contiene ya el `result` por fila. Si más adelante quieres `/post/:ticker`, basta añadir un handler que lea de `earnings_results` por ticker.

---

## 5. Diff `frontend/src/constants/index.js`

Añadir UNA línea en el array `HOME_TABS` (después de `library` para que quede al final, lo más seguro). El orden visual exacto se decide en el merge de la rama paralela:

```diff
   {id:"research",lbl:"Research",ico:"🔍"},
   {id:"library",lbl:"Library",ico:"📚"},
+  {id:"earnings",lbl:"Earnings",ico:"📊"},
 ];
```

---

## 6. Diff `frontend/src/components/views/HomeView.jsx`

**Import** (junto al resto de imports de tabs, ~línea 26):

```diff
 import LibraryTab from '../home/LibraryTab';
 import CurrencyTab from '../home/CurrencyTab';
 import MacroTab from '../home/MacroTab';
+import EarningsTab from '../home/EarningsTab';
```

**Render** (al final del bloque que decide qué tab pintar, ~línea 666):

```diff
       {homeTab==="library" && <LibraryTab />}
       {homeTab==="currency" && <CurrencyTab />}
       {homeTab==="macro" && <MacroTab />}
+      {homeTab==="earnings" && <EarningsTab />}
     </ErrorBoundary>
```

---

## 7. Smoke tests post-deploy

Asume deploy worker + frontend hechos. Ejecutar en orden:

```bash
# 1. Refrescar el calendar (lee FMP, escribe earnings_calendar)
curl -s -X POST https://aar-api.garciaontoso.workers.dev/api/earnings/briefing/refresh \
  | jq '.'
# Esperado: {"ok":true, "inserted":N, "updated":M, "scanned":..., "portfolio_size":89}

# 2. Próximos 30 días (debería devolver items con weight + importance)
curl -s "https://aar-api.garciaontoso.workers.dev/api/earnings/upcoming?days=30" \
  | jq '.counts, .items[0:3]'
# Esperado: counts {total, critical, high} + 3 primeros items con ticker, earnings_date, importance

# 3. Briefing pre-earnings de un ticker grande del portfolio (KO ej.)
curl -s "https://aar-api.garciaontoso.workers.dev/api/earnings/briefing/KO" \
  | jq '.upcoming, .stats, .history | length'
# Esperado: upcoming != null si KO tiene earnings <30d, stats {beat_rate_pct, surprise_avg_pct},
#           history length 4 (o menos si FMP no devuelve)

# 4. Post-earnings últimos 7 días (Track A)
curl -s "https://aar-api.garciaontoso.workers.dev/api/earnings/post" \
  | jq '.count, .items[0]'
# Esperado: count >= 0; items[0].result puede ser null si no se han reportado todavía
```

Si los 4 devuelven JSON sin error, el backend está OK. Probar UI: `/` → tab "Earnings" → ver lista, click en row → modal briefing con datos.

---

## 8. Orden de ejecución recomendado (90 min)

1. **(5 min)** Pegar bloque schema en `ensureMigrations`. Deploy worker. Verificar tablas creadas (`wrangler d1 execute aar-finanzas --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'earnings_%'"`).
2. **(15 min)** Pegar bloque endpoints antes de "AI AGENTS". Re-deploy worker.
3. **(5 min)** Smoke test #1 (refresh) + #2 (upcoming).
4. **(10 min)** Crear `frontend/src/components/home/EarningsTab.jsx` (ya proporcionado en este repo, no requiere edición).
5. **(5 min)** Aplicar diffs `constants/index.js` + `HomeView.jsx`.
6. **(10 min)** Build + deploy frontend. Verificar tab "Earnings" visible.
7. **(10 min)** Smoke test #3 (briefing) + #4 (post). Click row en UI, validar modal.
8. **(20 min restante)** Buffer para iteración visual / ajustes de copy / fix de tickers que FMP no mapea.

---

## 9. Riesgos conocidos del MVP

| Riesgo | Mitigación MVP |
|---|---|
| FMP `/stable/earnings-calendar` paginado o limitado | El endpoint actual devuelve un array. Si en producción vienen >1000 items, paginarlo es trivial añadir `&limit=...` — pero la mayoría del portfolio debería entrar en una sola página |
| Foreign tickers (BME:, HKG:) sin cobertura FMP | El UPSERT es silencioso; si FMP no los devuelve, simplemente no aparecen. Aceptable para MVP |
| `quality_safety_scores` table puede no existir en algún entorno | El briefing endpoint tiene `try/catch` alrededor de esa query. Sigue funcionando sin Q/S |
| Refresh manual sin cron | El componente expone un botón "🔄 Refrescar calendar" — el usuario lo dispara cuando quiera. Cron en v2 |
| FMP `time` field vacío | El campo `earnings_time` puede ser null; la UI muestra "—" en ese caso |
| Re-runs duplican rows | UNIQUE(ticker, earnings_date) + UPSERT lógico previene duplicados |

---

## 10. Qué entregar en v2 (después del MVP)

1. Cron 6h que llama `/api/earnings/briefing/refresh` automáticamente
2. Cron 30min en earnings season que pinga `/api/earnings/post` para escribir resultados
3. Push notification 24h antes para earnings con weight ≥3%
4. Track B Opus deep dive (con triggers configurables)
5. Surprise tracker chart histórico por ticker (12 quarters)
6. Predictability score
7. Integración con Módulo Proceso (auto thesis review)

---

## 11. Archivos tocados / creados

| Archivo | Acción | Responsable |
|---|---|---|
| `api/src/worker.js` | DIFF (no edit ahora) | Usuario copy-paste cuando merge la rama paralela |
| `frontend/src/constants/index.js` | DIFF (1 línea) | Usuario copy-paste |
| `frontend/src/components/views/HomeView.jsx` | DIFF (2 inserciones) | Usuario copy-paste |
| `frontend/src/components/home/EarningsTab.jsx` | **NUEVO** (entregado) | Ya en disco — listo |
| `docs/earnings-intelligence-mvp-plan.md` | **NUEVO** (este archivo) | Ya en disco |
