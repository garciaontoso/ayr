# News Agent — MVP plan ejecutable (90 min)

> Generado 2026-04-07. Diseño completo en `docs/news-agent-design.md`. Este documento es el **plan ejecutable** del MVP que entra en una ventana de 90 minutos sin tocar `worker.js`/`HomeView.jsx`/`constants/index.js` en paralelo (van como diffs copy-paste al final de la edición paralela).

---

## 1. Resumen ejecutivo

El MVP entrega una pestaña nueva **"📰 News"** en HomeView que pull-ea noticias de FMP para todos los tickers de la cartera, las clasifica con Haiku (relevancia + sentiment + severidad) y las muestra agrupadas por día con filtros por severidad y ventana temporal.

Pipeline minimal: FMP `/stable/stock-news` batched por chunks de 10 tickers → dedupe por URL → Haiku batch classifier (1 llamada por chunk, ~$0.03/refresh completo) → insert en `news_items` → render React. Sin cron automático, sin push, sin active learning real, sin entity recognition fina — todo eso es v2. La filosofía del design doc se respeta: **ninguna notificación push del agente**, las noticias son una *fuente* que se consulta on-demand.

---

## 2. Scope estricto

### DENTRO del MVP (≤90 min)

- 1 tabla D1: `news_items` (raw + processed unidos en una sola tabla — el design original separa raw/processed pero para MVP se simplifica)
- 3 endpoints worker:
  - `POST /api/news/refresh` — pull FMP + Haiku classify + insert
  - `GET  /api/news/recent?days=7&severity=&ticker=` — lista filtrable
  - `GET  /api/news/:id` — detalle individual
- 1 componente React: `NewsTab.jsx` con header (stats + refresh + filtros), lista agrupada por día, modal de detalle
- Registro en `constants/index.js` + `HomeView.jsx`
- 4 smoke tests `curl`

### FUERA del MVP (v2 / v3)

- ❌ Tabla `news_raw` separada (todo en `news_items`)
- ❌ Cron automático (refresh manual desde la UI hasta v2)
- ❌ Active learning real con feedback buttons (`POST /api/news/feedback/:id` queda como placeholder vacío en v2)
- ❌ Integración con Daily Briefing Agent (otro MVP)
- ❌ Push notifications (filosofía del design: NUNCA notificar)
- ❌ Sentiment + entity recognition fino (modelo separado, scoring numérico avanzado)
- ❌ Source blacklist agresiva, dedupe semántico
- ❌ `news_stats` agregados de coste/cobertura
- ❌ `/api/news/by-category`, `/api/news/actionable`, `/api/news/stats`
- ❌ Foreign tickers BME/HKG si FMP no los soporta (se omiten silenciosamente)

---

## 3. Schema D1 — añadir a `ensureMigrations`

Pegar en `api/src/worker.js` dentro de `ensureMigrations`, **justo antes** del comentario `// ═══════ DESIGN BACKLOG MVPs ═══════════════════════════════` (línea ~501) **NO** — pegar **al final del bloque DESIGN BACKLOG MVPs**, justo después de los `CREATE INDEX` de `earnings_results` (línea ~622) y **antes** del bloque `// ─── Performance indexes ───────────────────────────`. Es idempotente (`IF NOT EXISTS`) y safe para re-deploy.

```js
    // ─── News Agent MVP ───
    // Una sola tabla: items ya clasificados por Haiku. Raw FMP no se persiste.
    // tickers_json es un JSON array de tickers de cartera asociados (puede haber 1+).
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS news_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      source TEXT DEFAULT '',
      published_at TEXT NOT NULL,
      tickers_json TEXT NOT NULL DEFAULT '[]',
      severity TEXT NOT NULL DEFAULT 'info',           -- 'info' | 'warning' | 'critical'
      sentiment_score REAL DEFAULT 0,                  -- -1 .. +1
      relevance_score REAL DEFAULT 0,                  -- 0 .. 1
      category TEXT DEFAULT 'general',                 -- 'earnings'|'dividend'|'guidance'|'ma'|'regulatory'|'general'|...
      image_url TEXT DEFAULT '',
      fetched_at TEXT DEFAULT (datetime('now'))
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_news_severity ON news_items(severity)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_news_relevance ON news_items(relevance_score DESC)`).run();
```

Tabla opcional `news_feedback` (skip si quedan <15 min):

```js
    // OPCIONAL — feedback para active learning v2
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS news_feedback (
      news_id INTEGER NOT NULL,
      helpful INTEGER NOT NULL,                        -- 1 = útil, 0 = ruido
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(news_id),
      FOREIGN KEY(news_id) REFERENCES news_items(id) ON DELETE CASCADE
    )`).run();
```

---

## 4. Endpoints backend

Pegar en `api/src/worker.js` **antes** del comentario `// ─── DESIGN BACKLOG MVPs ───────────────────────────────────` de la línea ~5317. Es decir, dentro del switch de paths del fetch handler, ubicado junto al resto de MVPs. (Si la línea ha cambiado por edits paralelos: buscar la cadena `"// ─── DESIGN BACKLOG MVPs ─"` y pegar inmediatamente después del último endpoint de Earnings y antes del siguiente bloque MVP.)

```js
      // ═══════════════════════════════════════════════════════════
      // ─── NEWS AGENT MVP ───────────────────────────────────────
      // ═══════════════════════════════════════════════════════════
      //
      // POST /api/news/refresh                 → pull FMP news para portfolio + Haiku clasify + insert
      // GET  /api/news/recent?days=7           → lista filtrable (severity, ticker)
      // GET  /api/news/:id                     → detalle individual
      //
      // Filosofía del design doc: SIN cron automático, SIN push, SIN active learning real.
      // Refresh manual desde la UI. Daily Briefing Agent (otro MVP) consumirá esta tabla.

      if (path === "/api/news/refresh" && request.method === "POST") {
        const key = env.FMP_KEY;
        if (!key) return json({ error: "no FMP key" }, corsHeaders, 500);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "no ANTHROPIC_API_KEY" }, corsHeaders, 500);

        // 1. Tickers de cartera
        const { results: positions } = await env.DB.prepare(
          "SELECT ticker FROM positions WHERE shares > 0"
        ).all();
        const ourTickers = (positions || []).map(p => p.ticker).filter(Boolean);
        if (!ourTickers.length) return json({ ok: true, fetched: 0, inserted: 0, note: "no portfolio tickers" }, corsHeaders);

        // Mapea tickers a símbolos FMP
        const fmpToOur = {};
        const fmpSymbols = [];
        for (const t of ourTickers) {
          const fmpSym = (typeof toFMP === "function") ? toFMP(t) : t;
          fmpToOur[fmpSym] = t;
          fmpSymbols.push(fmpSym);
        }

        // 2. Batchea en chunks de 10 tickers por llamada FMP
        const CHUNK_SIZE = 10;
        const LIMIT_PER_CHUNK = 30;
        const allRawItems = [];
        for (let i = 0; i < fmpSymbols.length; i += CHUNK_SIZE) {
          const chunk = fmpSymbols.slice(i, i + CHUNK_SIZE);
          const tickerParam = chunk.join(",");
          const url2 = `https://financialmodelingprep.com/stable/stock-news?tickers=${encodeURIComponent(tickerParam)}&limit=${LIMIT_PER_CHUNK}&apikey=${key}`;
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

        // 3. Dedupe por URL contra DB existente
        const existingUrls = new Set();
        if (allRawItems.length) {
          // pull existing in one shot
          const { results: existing } = await env.DB.prepare(
            `SELECT url FROM news_items WHERE published_at >= datetime('now', '-30 days')`
          ).all();
          for (const e of (existing || [])) existingUrls.add(e.url);
        }
        const dedupedByUrl = new Map();
        for (const it of allRawItems) {
          if (existingUrls.has(it.url)) continue;
          if (dedupedByUrl.has(it.url)) {
            // merge tickers
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

        // 4. Haiku batch classify — un call por bucket de 15 noticias
        const CLASSIFY_BATCH = 15;
        const classifySystem = `Eres un clasificador de noticias financieras para una cartera de inversión long-term dividend-focused. Para cada noticia recibida en el array de input, devuelves OBJETO clasificación con campos exactos:
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
            // fallback: marcar todos como info / 0.3 relevancia
            classifications = batch.map(() => ({ relevance_score: 0.3, sentiment_score: 0, severity: "info", category: "general", summary_es: "" }));
          }

          // 5. Insert
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
                it.url,
                it.title,
                summary,
                it.source,
                it.published_at,
                JSON.stringify(it._tickers),
                severity,
                sentiment,
                relevance,
                category,
                it.image_url || ""
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

      if (path.startsWith("/api/news/") && request.method === "GET") {
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

      // OPCIONAL — feedback (skip si tiempo apretado)
      // if (path.startsWith("/api/news/feedback/") && request.method === "POST") {
      //   const id = parseInt(path.split("/").pop(), 10);
      //   const body = await request.json().catch(() => ({}));
      //   const helpful = body.helpful ? 1 : 0;
      //   await env.DB.prepare(
      //     `INSERT INTO news_feedback (news_id, helpful) VALUES (?, ?)
      //      ON CONFLICT(news_id) DO UPDATE SET helpful = excluded.helpful`
      //   ).bind(id, helpful).run();
      //   return json({ ok: true }, corsHeaders);
      // }
```

> **Notas técnicas**:
> - Reutiliza `callAgentClaude` (ya existe línea ~7043) y `toFMP` (ya existe en el worker para mappear tickers internos a símbolos FMP).
> - El batcher manda 15 noticias por call Haiku ≈ 3000 input tokens + 1500 output ≈ $0.005 por batch. Refresh full portfolio (~85 tickers / 9 chunks FMP / ~150 noticias dedup) ≈ 10 batches Haiku ≈ **$0.05/refresh**. Bien dentro del budget de $2/mes del design doc.
> - El handler `GET /api/news/:id` debe colocarse **después** del `GET /api/news/recent` para que el matching de path no se solape (los starts-with capturan recent también; alternativa: mover a `/api/news/item/:id` si hay bug).

---

## 5. Diff para `frontend/src/constants/index.js`

Localiza el array `TABS` (o equivalente). Añadir el siguiente objeto **al final**, justo antes del cierre `]`:

```diff
   { id: "earnings", lbl: "Earnings", ico: "📊" },
+  { id: "news",     lbl: "News",     ico: "📰" },
 ];
```

Si el archivo usa otra forma de exportar tabs, calcar la línea de Earnings, Macro, Currency, Library — son la misma estructura.

---

## 6. Diff para `frontend/src/components/views/HomeView.jsx`

### 6.1 Import (top del fichero, junto al resto de tabs lazy)

```diff
 const EarningsTab = lazy(() => import('../home/EarningsTab.jsx'));
+const NewsTab     = lazy(() => import('../home/NewsTab.jsx'));
```

### 6.2 Render condicional dentro del switch/conditionals de `activeTab`

Localizar el bloque que renderiza `EarningsTab`:

```diff
   {activeTab === 'earnings' && (
     <Suspense fallback={<div style={{padding: 24}}>Cargando...</div>}>
       <EarningsTab />
     </Suspense>
   )}
+  {activeTab === 'news' && (
+    <Suspense fallback={<div style={{padding: 24}}>Cargando...</div>}>
+      <NewsTab />
+    </Suspense>
+  )}
```

---

## 7. Smoke tests

Una vez aplicado todo y desplegado worker + frontend:

```bash
# 1. Refresh — pull FMP + clasifica + inserta
curl -X POST https://aar-api.garciaontoso.workers.dev/api/news/refresh
# Esperado: {"ok":true,"fetched":N,"deduped":M,"classified":M,"inserted":M}
# Tarda ~30-90s la primera vez (varias llamadas Haiku batched)

# 2. Recent — últimos 7 días
curl "https://aar-api.garciaontoso.workers.dev/api/news/recent?days=7"
# Esperado: {"count":15..200,"counts":{"critical":N,"warning":N,"info":N},"items":[...]}

# 3. Filtro por severidad
curl "https://aar-api.garciaontoso.workers.dev/api/news/recent?days=30&severity=critical"
# Esperado: solo items con severity:"critical"

# 4. Filtro por ticker
curl "https://aar-api.garciaontoso.workers.dev/api/news/recent?days=30&ticker=KO"
# Esperado: items donde tickers_json contiene "KO"

# 5. Detalle individual (sustituye 1 por id real del paso 2)
curl "https://aar-api.garciaontoso.workers.dev/api/news/1"
# Esperado: el objeto noticia completo
```

---

## 8. Cronograma 90 min

| Bloque | Min | Tarea |
|--------|-----|-------|
| 1 | 0–10  | Pegar schema D1 en `ensureMigrations`, deploy worker, verificar `wrangler tail` |
| 2 | 10–35 | Pegar 3 endpoints en `worker.js`, deploy, smoke test `POST /api/news/refresh` (ver que la pipeline FMP→Haiku→D1 funciona end-to-end) |
| 3 | 35–75 | Crear `frontend/src/components/home/NewsTab.jsx` (calca de `CurrencyTab.jsx` + `EarningsTab.jsx`), aplicar diff a `constants/index.js` y `HomeView.jsx`, build local con `npm run build`, fix errores |
| 4 | 75–90 | Deploy frontend, smoke tests UI: refrescar, filtrar 24h/7d, click row → modal, click source URL externo, verificar empty state |

Buffer 0 min — si los smoke tests pasan, terminar antes y dejar margen para escribir feedback notes.

---

## 9. Qué queda para v2

- **Active learning real**: tabla `news_feedback` poblada + recalibración del prompt Haiku cada N feedbacks. Botones ❌/⭐ en el modal. Ya hay placeholder comentado en el endpoint.
- **Cron automático**: 3x/día (6am, 14:00, 22:00 ET) en `wrangler.toml` + handler scheduled. El design doc es explícito sobre esta frecuencia.
- **Sentiment scoring numérico avanzado**: actualmente el score viene de Haiku con un solo float; v2 podría usar un modelo dedicado o agregar señales de price action.
- **Entity recognition fino**: detectar menciones de competidores, ejecutivos, métricas concretas para enriquecer drill-down.
- **Source blacklist + dedupe semántico**: rechazar dominios de baja calidad, agrupar noticias casi-duplicadas (mismo evento, distintos sites).
- **Integración Daily Briefing Agent**: cuando exista, leerá `news_items WHERE relevance_score >= 0.5 AND published_at > yesterday_9am`.
- **Notificaciones push** — explícitamente NO en el roadmap (filosofía anti-reactividad del design doc).
- **`news_stats` aggregates**: total_fetched, total_filtered, total_actionable, cost_usd, dashboard de eficiencia del agente.
- **Endpoints adicionales**: `/api/news/by-category`, `/api/news/actionable`, `/api/news/stats`.
- **Foreign tickers**: mapping específico para BME/HKG/HGK que FMP no expone bien.

---

## 10. Checklist final pre-merge

- [ ] `ensureMigrations` recibe el bloque `news_items` antes de `_migrated = true`
- [ ] 3 endpoints añadidos antes del comentario `// ─── DESIGN BACKLOG MVPs ───` (o reagrupados con los otros MVPs)
- [ ] `constants/index.js` tiene el tab `news`
- [ ] `HomeView.jsx` importa y renderiza `NewsTab` con `Suspense`
- [ ] Worker desplegado con `cd api && npx wrangler deploy`
- [ ] Frontend desplegado con `cd frontend && npm run build && npx wrangler pages deploy dist --project-name=ayr`
- [ ] 5 smoke `curl` pasan
- [ ] UI: refrescar funciona, filtros 24h/7d, severidad, modal abre, source URL abre en nueva pestaña
- [ ] No regresiones en otras tabs (especialmente Earnings, Macro, Currency)
