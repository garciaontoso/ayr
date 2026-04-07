# Company Narrative Backend Patch

Backend for two Portfolio-modal features:

1. **Transcript Summary** — Opus-generated summary of the last 2-4 earnings call transcripts for a ticker. 6-8 bullets across 4 sections. Cached indefinitely in D1, manual refresh.
2. **Business Model "para niño"** — Haiku-generated Warren-Buffett-to-an-8-year-old explanation of the business. Cached 30 days.

Both endpoints are **idempotent reads** plus an explicit **generate (POST)** that burns LLM tokens. The frontend should always call GET first and only POST when the user explicitly presses a refresh button.

---

## IMPORTANT: Markdown output, not JSON

`callAgentClaude()` in worker.js **always tries to parse the LLM response as JSON** and throws if that fails. Both narratives return markdown, not JSON. The patch therefore adds a tiny inline raw-text helper inside each endpoint block rather than modifying `callAgentClaude`. That keeps the change local and avoids touching the shared helper.

If you prefer a shared helper, consider adding `callAgentClaudeRaw()` next to `callAgentClaude()` in a future patch — but that is out of scope for this one to minimize merge conflicts.

---

## Section 1 — D1 Schema

**Paste target:** inside `ensureSchema()` in `api/src/worker.js`, at the very end of the DESIGN BACKLOG MVPs block, **right after** the three `idx_news_*` index creations (around line 643), **before** the `// ─── Performance indexes ───` comment (line 645).

```js
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
```

No ALTER migrations needed — new table, no existing data to preserve.

---

## Section 2 — Endpoints

**Paste target:** inside the main request handler in `api/src/worker.js`, immediately after the News Agent single-item detail block (the one that starts with the comment `// Single news item detail — must come AFTER /api/news/recent to avoid matching collision`, currently around line 5812-5830). Pick any spot in the route chain that is *after* the `/api/news/*` routes and *before* the generic fallbacks.

All four endpoints share two small helpers declared once at the top of the block. They are scoped to the block so they won't leak.

```js
      // ═══════════════════════════════════════════════════════════
      // ─── COMPANY NARRATIVES (transcript summary + business model) ───
      // ═══════════════════════════════════════════════════════════
      //
      // GET  /api/company/:ticker/transcript-summary          read cache
      // POST /api/company/:ticker/transcript-summary/generate force regenerate with Opus
      // GET  /api/company/:ticker/business-model              read cache (30d TTL → stale flag)
      // POST /api/company/:ticker/business-model/generate     force regenerate with Haiku
      //
      // Both use markdown output so we bypass callAgentClaude's JSON parser
      // with a local raw-text variant. Cached in D1.company_narratives.

      // Raw Claude call — returns plain text, not JSON. Same retry policy as callAgentClaude.
      async function callClaudeRaw(systemPrompt, userContent, opts = {}) {
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
            console.warn(`[callClaudeRaw] ${resp.status} attempt ${attempt + 1}, retrying in ${BACKOFF_MS[attempt]}ms`);
            await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
          } catch (e) {
            lastErr = e;
            if (attempt === BACKOFF_MS.length) throw e;
            console.warn(`[callClaudeRaw] network error attempt ${attempt + 1}: ${e.message}`);
            await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
          }
        }
        if (!resp || !resp.ok) throw lastErr || new Error("Claude API: all retries exhausted");
        const result = await resp.json();
        const text = result.content?.[0]?.text || "";
        const usage = result.usage || {};
        const tokensUsed = (usage.input_tokens || 0) + (usage.output_tokens || 0);
        return { text: text.trim(), tokensUsed };
      }

      // Extract ticker from "/api/company/:ticker/rest..." — supports %2F-encoded colons too.
      function parseCompanyTicker(pathStr, tail) {
        // pathStr already starts with /api/company/
        const rest = pathStr.slice("/api/company/".length);
        // tail is the suffix after the ticker, e.g. "/transcript-summary"
        if (!rest.endsWith(tail)) return null;
        const rawTicker = rest.slice(0, rest.length - tail.length);
        return decodeURIComponent(rawTicker).toUpperCase();
      }

      // ── GET /api/company/:ticker/transcript-summary ──
      if (path.startsWith("/api/company/") && path.endsWith("/transcript-summary") && request.method === "GET") {
        const ticker = parseCompanyTicker(path, "/transcript-summary");
        if (!ticker) return json({ error: "bad ticker" }, corsHeaders, 400);
        try {
          const row = await env.DB.prepare(
            `SELECT content_md, source_data, generated_at, tokens_used
             FROM company_narratives
             WHERE ticker = ? AND narrative_type = 'transcript_summary'`
          ).bind(ticker).first();
          if (!row) {
            return json({ cached: false, content: null, ticker }, corsHeaders);
          }
          return json({
            cached: true,
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

      // ── POST /api/company/:ticker/transcript-summary/generate ──
      if (path.startsWith("/api/company/") && path.endsWith("/transcript-summary/generate") && request.method === "POST") {
        const ticker = parseCompanyTicker(path, "/transcript-summary/generate");
        if (!ticker) return json({ error: "bad ticker" }, corsHeaders, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "no ANTHROPIC_API_KEY" }, corsHeaders, 500);

        try {
          // Strip BME:/HKG:/LSE: prefix — transcripts are stored with plain ticker
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
              error: "Sin transcripts descargados para este ticker",
              ticker,
              bareTicker,
              hint: "Ejecuta el script de descarga de transcripts primero",
            }, corsHeaders, 404);
          }

          // Use up to 4 quarters. Truncate each to ~4000 chars (mgmt remarks +
          // first ~1000 chars of Q&A) to stay well under Opus input budget.
          // 4 quarters × 4000 chars ≈ 16000 chars ≈ 4000 tokens.
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

          const userContent = {
            ticker,
            transcripts_count: transcripts.length,
            transcripts,
          };

          const { text: markdown, tokensUsed } = await callClaudeRaw(systemPrompt, userContent, {
            model: "claude-opus-4-20250514",
            maxTokens: 1500,
          });

          if (!markdown || markdown.length < 50) {
            return json({ error: "Opus returned empty or too-short response", raw: markdown }, corsHeaders, 500);
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
            cached: false,
            generated: true,
            ticker,
            content: markdown,
            source_data: sourceLabels,
            tokens_used: tokensUsed,
            generated_at: new Date().toISOString(),
          }, corsHeaders);
        } catch (e) {
          console.error("[transcript-summary/generate] error:", e.message);
          return json({ error: e.message, ticker }, corsHeaders, 500);
        }
      }

      // ── GET /api/company/:ticker/business-model ──
      if (path.startsWith("/api/company/") && path.endsWith("/business-model") && request.method === "GET") {
        const ticker = parseCompanyTicker(path, "/business-model");
        if (!ticker) return json({ error: "bad ticker" }, corsHeaders, 400);
        try {
          const row = await env.DB.prepare(
            `SELECT content_md, source_data, generated_at, tokens_used,
                    CAST((julianday('now') - julianday(generated_at)) AS INTEGER) AS age_days
             FROM company_narratives
             WHERE ticker = ? AND narrative_type = 'business_model'`
          ).bind(ticker).first();
          if (!row) {
            return json({ cached: false, content: null, ticker }, corsHeaders);
          }
          const ageDays = Number(row.age_days || 0);
          const stale = ageDays > 30;
          return json({
            cached: true,
            stale,
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
      if (path.startsWith("/api/company/") && path.endsWith("/business-model/generate") && request.method === "POST") {
        const ticker = parseCompanyTicker(path, "/business-model/generate");
        if (!ticker) return json({ error: "bad ticker" }, corsHeaders, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "no ANTHROPIC_API_KEY" }, corsHeaders, 500);

        try {
          // Pull company context from positions table. `sector` and `industry`
          // columns were enriched 100% in v4.0 (GuruFocus + FMP + manual).
          const pos = await env.DB.prepare(
            `SELECT ticker, name, sector, industry FROM positions WHERE ticker = ? LIMIT 1`
          ).bind(ticker).first();

          const name = pos?.name || ticker;
          const sector = pos?.sector || "Unknown";
          const industry = pos?.industry || "Unknown";

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

Input: { ticker, name, sector, industry }
Output: ONLY the markdown above, nothing else. Tono cálido y didáctico.`;

          const userContent = { ticker, name, sector, industry };

          const { text: markdown, tokensUsed } = await callClaudeRaw(systemPrompt, userContent, {
            model: "claude-haiku-4-5-20251001",
            maxTokens: 1200,
          });

          if (!markdown || markdown.length < 50) {
            return json({ error: "Haiku returned empty or too-short response", raw: markdown }, corsHeaders, 500);
          }

          const sourceData = `${name} · ${sector} · ${industry}`;

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
            cached: false,
            generated: true,
            stale: false,
            age_days: 0,
            ticker,
            content: markdown,
            source_data: sourceData,
            tokens_used: tokensUsed,
            generated_at: new Date().toISOString(),
          }, corsHeaders);
        } catch (e) {
          console.error("[business-model/generate] error:", e.message);
          return json({ error: e.message, ticker }, corsHeaders, 500);
        }
      }
```

### Notes on integration

- **Route ordering.** Place this block *before* any catch-all 404 handler and *after* `/api/news/*`. All four routes are anchored with `path.startsWith("/api/company/") && path.endsWith(...)` so they do not collide with existing routes.
- **Ticker encoding.** The frontend should URL-encode colons: `HKG:9618` → `HKG%3A9618`. `parseCompanyTicker` decodes back before DB lookup. If the frontend sends the raw colon form Cloudflare preserves it, so decoding is still safe.
- **Transcripts table prefix strip.** Matches the logic already used in the earnings agent (worker.js line 9181): `t.replace(/^(BME:|HKG:|LSE:)/, '')`.
- **Truncation.** 4000 chars per transcript × 4 quarters ≈ 16000 chars ≈ 4000 tokens input. Opus budget: 1500 output tokens. Well under limits.
- **Error shape.** Matches existing endpoints: `{ error: string, ...extra }` with HTTP 4xx/5xx.

---

## Section 3 — Prompts (reference)

Both prompts live inline inside the endpoint handlers above. Reproduced here for reference only — **do not paste this section anywhere**.

### Transcript Summary (Opus)

```
Eres un analista financiero senior. Vas a resumir earnings call transcripts de una empresa para un inversor retail long-term buy-and-hold.

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
Output: ONLY the markdown above, nothing else.
```

### Business Model "para niño" (Haiku)

```
Explica el modelo de negocio de esta empresa como si se lo estuvieras contando a un niño de 8 años que sabe poco del mundo. Estilo Warren Buffett: simple, claro, con analogías del mundo real.

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

Input: { ticker, name, sector, industry }
Output: ONLY the markdown above, nothing else. Tono cálido y didáctico.
```

---

## Section 4 — Smoke tests

Run after `wrangler deploy`. Replace `API` with your base URL.

```bash
API=https://aar-api.garciaontoso.workers.dev

# 1. Cache miss — transcript summary not yet generated
curl -s "$API/api/company/KHC/transcript-summary" | jq .
# expected: { "cached": false, "content": null, "ticker": "KHC" }

# 2. Generate transcript summary with Opus (~$0.04, ~20s)
curl -s -X POST "$API/api/company/KHC/transcript-summary/generate" | jq .
# expected: { "cached": false, "generated": true, "ticker": "KHC",
#             "content": "## Qué pasó este trimestre\n- ...",
#             "source_data": "Q4 2025, Q3 2025, Q2 2025, Q1 2025",
#             "tokens_used": 4200, ... }

# 3. Cache hit — same summary comes back instantly
curl -s "$API/api/company/KHC/transcript-summary" | jq .
# expected: { "cached": true, "content": "## Qué pasó...", ... }

# 4. Ticker with no transcripts → 404 with Spanish error
curl -s -X POST "$API/api/company/NOSUCH/transcript-summary/generate" | jq .
# expected: { "error": "Sin transcripts descargados para este ticker", ... } HTTP 404

# 5. Foreign ticker — colon URL-encoded. Transcripts stored as "9618" (no HKG: prefix).
curl -s -X POST "$API/api/company/HKG%3A9618/transcript-summary/generate" | jq .
# expected: { "cached": false, "generated": true, "ticker": "HKG:9618", ... }

# 6. Business model — cache miss
curl -s "$API/api/company/KHC/business-model" | jq .
# expected: { "cached": false, "content": null, "ticker": "KHC" }

# 7. Generate business model with Haiku (~$0.002, ~3s)
curl -s -X POST "$API/api/company/KHC/business-model/generate" | jq .
# expected: { "cached": false, "generated": true, "stale": false, "age_days": 0,
#             "content": "## ¿Qué hace esta empresa?\nImagina que Kraft Heinz...", ... }

# 8. Business model cache hit — 30d TTL, stale=false on fresh gen
curl -s "$API/api/company/KHC/business-model" | jq '.cached, .stale, .age_days'
# expected: true / false / 0
```

### What to verify manually

1. `content` starts with `## ` and contains all expected section headers.
2. `tokens_used` > 0 on generate, reflects actual usage.
3. Second GET after generate has `cached: true` and same `generated_at` timestamp.
4. `SELECT COUNT(*) FROM company_narratives` after running tests 2, 5, 7 should equal 3.

---

## Section 5 — Cost estimation

### Per-ticker cost

| Feature | Model | Input tokens | Output tokens | $/call |
|---|---|---|---|---|
| Transcript summary | Opus 4 | ~3000 (4 transcripts × ~750 tok each after 4k char truncate) | ~800 | **~$0.042** |
| Business model | Haiku 4.5 | ~200 (ticker + name + sector) | ~400 | **~$0.002** |

Opus 4 pricing: $15/Mtok in, $75/Mtok out → 3000 × 15 + 800 × 75 = 45k + 60k = 105k tok-cents = **$0.042 per call**.
Haiku 4.5 pricing: $1/Mtok in, $5/Mtok out → 200 × 1 + 400 × 5 = 200 + 2000 = 2.2k tok-cents = **~$0.0022 per call**.

### One-time full-portfolio backfill (85 tickers)

- Transcript summaries: 85 × $0.042 = **$3.57**
- Business models: 85 × $0.0022 = **$0.19**
- **Total one-shot backfill: ~$3.76**

Some foreign tickers (BME:, HKG:, LSE:) may not have transcripts downloaded — those fail fast with 404 and cost $0. Realistic spend is likely **$3.00–$3.50** end-to-end.

### Ongoing cost

- Transcript summary: manual refresh only, user decides. Typical usage: re-generate after each earnings print (~1 per quarter per ticker held) → 85 × 4 = 340 refreshes/year × $0.042 = **~$14.30/year** worst case.
- Business model: 30-day TTL → 85 × 12 = 1020 refreshes/year × $0.002 = **~$2.04/year**.
- **Total annual marginal cost (if fully refreshed): ~$16.34/year ≈ $1.36/month**

This sits alongside the existing ~$33/month agent spend (CLAUDE.md), so the feature adds **~4% to monthly LLM cost** at full utilization. In practice the user will refresh far less often and the true cost is closer to zero after backfill.

---

## Files touched by this patch

- `api/src/worker.js` — 1 schema block (~12 lines) + 1 endpoint block (~220 lines). **Total ~232 lines added, 0 lines removed.**

No frontend changes. No D1 migrations beyond the new table. No new secrets.

## Rollback

```sql
DROP TABLE IF EXISTS company_narratives;
```

And revert the endpoint block in worker.js. No cascading dependencies.
