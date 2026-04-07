# Thesis Auto-Generation Endpoint — Implementation Patch

**Endpoint**: `POST /api/theses/:ticker/generate`
**Model**: `claude-opus-4-20250514`
**Status**: DRAFT — paste-ready patch for `api/src/worker.js`
**Date**: 2026-04-07

---

## 1. Description & Flow

A new endpoint that auto-drafts an investment thesis for any ticker already
in the user's portfolio, using rich context from the existing D1 tables. The
output is inserted as a new thesis version (via the same INSERT logic used by
the existing `POST /api/theses` route), so the user can edit it afterwards
through the normal UI flow.

### Flow

```
POST /api/theses/:ticker/generate
       │
       ▼
1. Validate ticker (^[a-zA-Z0-9:_.-]+$)
2. Load context in parallel:
     - positions row (must exist → 404 otherwise)
     - latest quality_safety_scores + inputs_json (must exist → 400 otherwise)
     - portfolio total (SUM market_value where shares>0) → weight_pct
     - company_narratives.business_model      (optional)
     - company_narratives.transcript_summary  (optional)
     - fundamentals.key_metrics[0]            (optional)
3. Build user payload (compact JSON, only the fields Opus needs)
4. callAgentClaude(env, SYSTEM, payload, { model: opus, maxTokens: 3000 })
5. Validate parsed JSON (clamp conviction 1-5, sanity-check fields)
6. Insert new thesis version directly into `theses` (same logic as POST /api/theses):
     - mark previous current=0
     - new row with version = max+1, is_current=1
     - prepend [DRAFT v2 AI generated YYYY-MM-DD]  to why_owned + sell criteria
7. Return { ok, ticker, version, thesis, tokens_used, cost_estimate_usd }
```

### Guard rails (enforced server-side AFTER Opus returns)

| Rule                                       | Action                                    |
|--------------------------------------------|-------------------------------------------|
| `quality_score < 40`                       | clamp `conviction = min(conviction, 2)`   |
| `streakYears < 5` AND `thesis_type=income` | force `thesis_type = "compounder"`        |
| `fcfCoverage < 1.2`                        | append warning to `notes_md` if missing   |
| `conviction` out of 1..5                   | clamp                                     |
| `target_weight_min/max` < 0 or > 100       | clamp 0..100                              |
| `target_weight_min > target_weight_max`    | swap                                      |
| `why_owned` or `sell` empty                | 502 — fail loudly (Opus broken)           |

These belong server-side because they're cheaper than re-prompting Opus and
the API contract for `theses` already enforces ranges.

---

## 2. Endpoint Code (paste into `worker.js`)

Insert this block **immediately after** the existing `if (path === "/api/theses" && request.method === "POST")` block (around line 6217), and **before** the `// ── Reading List MVP` comment.

```js
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
              const parsed = JSON.parse(km);
              if (Array.isArray(parsed) && parsed.length > 0) keyMetrics = parsed[0];
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

          // ─── Opus call ───
          const SYSTEM = THESIS_AUTOGEN_SYSTEM_PROMPT; // defined below in worker.js

          let parsed;
          let tokensUsed = 0;
          try {
            // We need both the parsed JSON AND token usage. callAgentClaude only
            // returns the parsed JSON, so we do a raw fetch here mirroring its retry logic.
            const reqBody = JSON.stringify({
              model: "claude-opus-4-20250514",
              max_tokens: 3000,
              system: SYSTEM,
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
            try { parsed = JSON.parse(cleaned); }
            catch (_) {
              // Balanced extract
              const start = cleaned.indexOf("{");
              if (start === -1) throw new Error("no JSON object in Opus output");
              let depth = 0, end = -1;
              for (let i = start; i < cleaned.length; i++) {
                if (cleaned[i] === "{") depth++;
                else if (cleaned[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
              }
              if (end === -1) throw new Error("unbalanced JSON in Opus output");
              parsed = JSON.parse(cleaned.slice(start, end + 1));
            }
          } catch (e) {
            return json({ error: `Opus call failed: ${e.message}` }, corsHeaders, 502);
          }

          // ─── Validate + apply guard rails ───
          const draftTag = `[DRAFT v2 AI generated ${today}]`;
          let why = String(parsed.why_owned || "").trim();
          let sell = String(parsed.what_would_make_sell || "").trim();
          if (!why || !sell) {
            return json({ error: "Opus returned empty why_owned or what_would_make_sell" }, corsHeaders, 502);
          }
          if (!why.startsWith("[DRAFT")) why = `${draftTag} ${why}`;
          if (!sell.startsWith("[DRAFT")) sell = `${draftTag} ${sell}`;
          why = why.slice(0, 2000);
          sell = sell.slice(0, 2000);

          const VALID_TYPES = new Set(["compounder","value","turnaround","income","cyclical","speculation"]);
          let thesisType = String(parsed.thesis_type || "compounder").toLowerCase();
          if (!VALID_TYPES.has(thesisType)) thesisType = "compounder";

          let conviction = parseInt(parsed.conviction, 10);
          if (!Number.isFinite(conviction)) conviction = 3;
          conviction = Math.max(1, Math.min(5, conviction));
          // Guard: low Q+S → cap conviction at 2
          if ((qs.quality_score || 0) < 40 && conviction > 2) conviction = 2;

          // Guard: streak<5 cannot be income (unless ETF — heuristic via category)
          const streakYears = Number(qsInputs.safety?.streakYears ?? 0);
          if (streakYears < 5 && thesisType === "income") thesisType = "compounder";

          let twMin = Number(parsed.target_weight_min ?? 0);
          let twMax = Number(parsed.target_weight_max ?? 0);
          if (!Number.isFinite(twMin)) twMin = 0;
          if (!Number.isFinite(twMax)) twMax = 0;
          twMin = Math.max(0, Math.min(100, twMin));
          twMax = Math.max(0, Math.min(100, twMax));
          if (twMin > twMax) { const t = twMin; twMin = twMax; twMax = t; }

          let notesMd = String(parsed.notes_md || "").slice(0, 1500);
          // Guard: low FCF coverage warning
          const fcfCov = Number(qsInputs.safety?.fcfCoverage ?? NaN);
          if (Number.isFinite(fcfCov) && fcfCov < 1.2 && !/fcf coverage/i.test(notesMd)) {
            const warn = `\n\n⚠️ FCF coverage = ${fcfCov.toFixed(2)}x (< 1.2x). Vigilar payout.`;
            notesMd = (notesMd + warn).slice(0, 1500);
          }

          // ─── Insert thesis (mirrors POST /api/theses logic) ───
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

          // Cost estimate: Opus pricing (input $15/MTok, output $75/MTok).
          // We don't break down here — use blended ~$30/MTok for a quick estimate.
          const costUsd = (tokensUsed / 1_000_000) * 30;

          return json({
            ok: true,
            ticker,
            version: nextVersion,
            thesis: {
              ticker, version: nextVersion, is_current: 1,
              why_owned: why,
              what_would_make_sell: sell,
              thesis_type: thesisType,
              conviction,
              target_weight_min: twMin,
              target_weight_max: twMax,
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
```

### Where to put `THESIS_AUTOGEN_SYSTEM_PROMPT`

Add this constant at the top of `worker.js` (or near the other agent prompts).
It is referenced inside the handler so it can stay outside the request scope:

```js
const THESIS_AUTOGEN_SYSTEM_PROMPT = `...see Section 3...`;
```

---

## 3. System Prompt (copyable)

```text
Eres un analista senior especializado en dividendos sostenibles a largo plazo
para un inversor individual con horizonte 10-30 años. Tu trabajo es generar un
DRAFT v2 de tesis de inversión para UNA empresa concreta del portfolio del usuario.

El usuario ya tiene la posición. NO estás recomendando comprar/vender. Estás
formalizando POR QUÉ tiene sentido aguantarla y QUÉ rompería la tesis.

INPUT
=====
Recibirás un JSON con:
- ticker, name, sector, sector_class
- is_yield_vehicle_REIT_MLP_BDC (bool — si true, los criterios de venta usan FFO/DCF, no FCF)
- position: shares, avg_cost, last_price, market_value, usd_value, weight_pct,
  div_ttm, div_yield_pct, yoc_pct, market_cap
- quality_safety:
    quality_score (0-100), safety_score (0-100)
    q_breakdown { profitability, capital_efficiency, balance_sheet, growth,
                  dividend_track, predictability }
    s_breakdown { coverage, balance_sheet, track_record, forward, sector_adj }
    inputs_quality { fcfMargin, netMargin, grossMargin, roic, assetTurnover,
                     debtEbitda, intCov, currentRatio, revGrowth, fcfGrowth,
                     piotroskiScore, accrualsRatio }
    inputs_safety  { divTTM, fcfTTM, niTTM, fcfCoverage, payoutRatio,
                     fcfPayoutRatio, payoutRatioWorst, fcfAfterMaintCov,
                     debtEbitda, streakYears }
- valuation (opcional): pe, pb, market_cap, ev_ebitda, fcf_yield
- business_model_md (opcional): texto explicando el negocio
- transcript_summary_md (opcional): resumen de los últimos earnings calls
- today (YYYY-MM-DD)

OUTPUT
======
Devuelve ÚNICAMENTE un objeto JSON válido (sin markdown fences, sin texto antes
o después) con EXACTAMENTE estos campos:

{
  "why_owned": "200-400 palabras. Empezar con '[DRAFT v2 AI generated YYYY-MM-DD] '. Explicar por qué tiene sentido tener esta posición para un inversor long-term dividend-focused. SER ESPECÍFICO con números del input: cita peso actual del portfolio (weight_pct%), yield (div_yield_pct%), Q score, S score, streak (streakYears años), FCF coverage (fcfCoverage x). NO uses frases vacías como 'gran empresa con buenos fundamentales'. Reconoce 1-2 riesgos visibles en los datos y explica por qué se aguantan. Si business_model_md o transcript_summary_md están presentes, úsalos para añadir contexto del negocio (no los copies literalmente).",

  "what_would_make_sell": "150-300 palabras. Empezar con '[DRAFT v2 AI generated YYYY-MM-DD] '. BULLETS markdown con criterios CUANTIFICABLES y OBJETIVOS. Ejemplos del nivel de detalle exigido:\n- FCF payout ratio > 100% durante 2 trimestres consecutivos\n- Streak de subidas de dividendo roto (recorte o congelación)\n- ROIC < 8% durante 2 años consecutivos\n- Quality score cae por debajo de 50\n- Debt/EBITDA > 4.5x durante 2 trimestres\n- Evento específico del negocio: [algo concreto del sector / empresa]\nPROHIBIDO: 'si los fundamentales se deterioran' sin números. PROHIBIDO: criterios ambiguos.\nIMPORTANTE: si is_yield_vehicle_REIT_MLP_BDC=true, NO uses FCF coverage; usa FFO payout / DCF coverage / NII coverage según corresponda.",

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
8. target_weight_min y target_weight_max deben ser coherentes con weight_pct actual:
   - típicamente min ≈ weight_pct * 0.5, max ≈ weight_pct * 1.5
   - max nunca > 10% para una posición individual (concentración)
9. Tono: honesto, humilde, directo. Es un DRAFT que el usuario va a editar — no exageres.
10. Idioma: ESPAÑOL (el usuario es hispanohablante).
11. NO escribas nada fuera del JSON. Sin preámbulo, sin epílogo, sin markdown fences.
```

---

## 4. Smoke Tests (curl)

Replace `BASE` with the worker URL. Examples use **FLO** (Flowers Foods, a real
position with REIT-style dividend stress that exercises guard rails).

### 4.1 Happy path
```bash
BASE=https://aar-api.garciaontoso.workers.dev

curl -sS -X POST "$BASE/api/theses/FLO/generate" \
  -H 'Content-Type: application/json' \
  | jq '{ok, version, conviction:.thesis.conviction, type:.thesis.thesis_type, w_min:.thesis.target_weight_min, w_max:.thesis.target_weight_max, tokens:.tokens_used, cost:.cost_estimate_usd, ctx:.context_used}'
```

Expected:
```json
{
  "ok": true,
  "version": 2,
  "conviction": 2,
  "type": "income",
  "w_min": 1.5,
  "w_max": 4.0,
  "tokens": 2400,
  "cost": 0.072,
  "ctx": {
    "position": true,
    "quality_safety": true,
    "business_model": true,
    "transcript_summary": true,
    "valuation": true,
    "weight_pct": 2.31,
    "quality_score": 58,
    "safety_score": 47
  }
}
```

Then verify the row landed and is current:
```bash
curl -sS "$BASE/api/theses/FLO" | jq '.thesis | {version, is_current, conviction, why:.why_owned[0:120], sell:.what_would_make_sell[0:120]}'
```

### 4.2 Ticker not in portfolio
```bash
curl -sS -X POST "$BASE/api/theses/NOTREAL/generate" | jq
# → { "error": "ticker NOTREAL no está en el portfolio" }  (404)
```

### 4.3 Ticker without Q+S score
```bash
# Pick a ticker you know has no row in quality_safety_scores
curl -sS -X POST "$BASE/api/theses/RAND/generate" | jq
# → { "error": "no Q+S score para RAND. Genera primero con POST /api/agent-run?agent=quality-safety" }  (400)
```

### 4.4 Invalid ticker
```bash
curl -sS -X POST "$BASE/api/theses/FOO%20BAR/generate" | jq
# → { "error": "invalid ticker" }  (400)
```

### 4.5 Foreign ticker (colon)
```bash
curl -sS -X POST "$BASE/api/theses/HKG:9618/generate" | jq '.ok'
# → true   (validates that : is allowed in the regex)
```

### 4.6 Verify guard rails — high Q+S compounder
```bash
curl -sS -X POST "$BASE/api/theses/PG/generate" \
  | jq '{type:.thesis.thesis_type, conviction:.thesis.conviction, q:.context_used.quality_score, s:.context_used.safety_score}'
# Expect: type=compounder, conviction=4 or 5, q>75, s>75
```

### 4.7 Verify guard rails — low Q+S clamp
For a ticker with quality_score < 40 the response should always have
`conviction <= 2`, regardless of what Opus suggested. Inspect manually:
```bash
curl -sS -X POST "$BASE/api/theses/SOMETICKER/generate" | jq '{q:.context_used.quality_score, conviction:.thesis.conviction}'
```

---

## 5. Cost Estimate

**Model**: `claude-opus-4-20250514`
**Pricing**: $15/MTok input · $75/MTok output

### Per-call breakdown

| Component                                       | Tokens (typical) |
|-------------------------------------------------|------------------|
| System prompt (Section 3)                       | ~1,200           |
| Payload JSON (position + Q+S + breakdowns)      | ~1,000           |
| business_model_md (when present, capped Haiku)  | ~600             |
| transcript_summary_md (when present)            | ~1,500           |
| **Input total (with both narratives)**          | **~4,300**       |
| **Output (why+sell+notes ≈ 600 words)**         | **~1,500**       |

**Per-call cost**:
- Input: 4,300 × $15 / 1M = **$0.0645**
- Output: 1,500 × $75 / 1M = **$0.1125**
- **Total: ~$0.18 per generation**

When narratives are missing the cost drops to **~$0.10**.

### Aggregate

The endpoint is **on-demand** (UI button), not cron, so volume is bounded by
clicks. Realistic projections:

| Scenario                                | Volume       | Monthly cost |
|-----------------------------------------|--------------|--------------|
| Initial backfill (85 positions, once)   | 85 calls     | ~$15 one-off |
| Steady state (refresh ~5 theses/month)  | 5 calls/mo   | ~$1/mo       |
| Heavy use (20 refreshes/month)          | 20 calls/mo  | ~$4/mo       |

This is **well within the existing $33/mo Claude budget** (Section "Cost"
in CLAUDE.md). No new budget concerns.

### Code returns `cost_estimate_usd`

The endpoint reports a blended estimate (`tokens_used × $30/MTok`) in the
response so the frontend can show "≈ $0.15" next to the button.

---

## Implementation Notes for Main Session

1. **Anchor**: insert the new handler after line 6217 (closing `}` of the
   existing `POST /api/theses` block) and before the `// ── Reading List MVP`
   comment at line 6219.
2. **Constant placement**: `THESIS_AUTOGEN_SYSTEM_PROMPT` is large; recommend
   placing it **outside** the `fetch` handler, near the top of `worker.js`
   alongside other agent prompts, to avoid re-allocating per request.
3. **No schema changes**: reuses existing `theses` table. No migration needed.
4. **No new env secrets**: uses existing `ANTHROPIC_API_KEY`.
5. **CORS**: returns via existing `json(...)` helper which already handles
   `corsHeaders`.
6. **Frontend hook**: when integrating, the UI button can call this endpoint
   then immediately call `GET /api/theses/:ticker` to refresh, OR use the
   `thesis` object returned in the response directly.
