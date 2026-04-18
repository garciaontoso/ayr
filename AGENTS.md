# A&R AI Agents — Technical Documentation

> **Source of truth**: `AGENTS_METADATA` array in `api/src/worker.js:5406` (served by `GET /api/agents/prompts`).
> Last sync: 2026-04-18 (audit B). When you edit a `runXxxAgent` prompt, also update this file AND the `system_prompt` field in `AGENTS_METADATA`.

## 2026-04-18 audit B — changes

- **value agent "duplicados" NO eran bug en DB.** El API `/api/agent-insights` devolvía la historia de snapshots diarios (ACN insight emitido cada día → 10 rows visibles). Añadido `?latest=1` (default) que dedup por (agent, ticker) mostrando sólo el más reciente. Pass `?latest=0` para historial crudo.
- **analyst_downgrade reactivado.** Ventana cambiada de 14d → 30d (las revisiones de analistas no son diarias), silent catch ahora loguea FMP errors, y emite un `_STATUS_` insight cuando 0 alerts para que el agente nunca parezca muerto.
- **earnings transcript 3000 → 10000 chars.** El Q&A con analistas (normalmente chars 3K-10K del transcript) ahora llega al LLM. Antes sólo veía CEO opening remarks.
- **trade agent: 20 → 89 posiciones.** Quitado el `.slice(0, 20)` / `.slice(0, 30)` — Opus 200K context sobra para ver la cartera entera. Antes 69 de 89 posiciones eran invisibles al asesor.
- **macro + risk con try/catch LLM.** Si Haiku 529/timeout, ahora se graba un insight `_MACRO_` / `_PORTFOLIO_` fallback con estado, en vez de desaparecer del feed diario.
- **Silent catches mejorados** (`earnings_trend`, `cut_warning`, `analyst_downgrade` inner parses, Q+S inputs_json) — ahora `console.warn` con ticker en vez de tragar silenciosamente.
- **docs/{ticker}/*.json → R2** preparado script (`scripts/upload-docs-to-r2.sh`). Antes los 57 GF financials locales y 63 SEC filing links eran inalcanzables desde Workers. Cableado a earnings/dividend agents: pendiente (siguiente sesión).

## Architecture Overview

```
Cron 9am UTC (Mon-Fri) OR manual button per agent
  │
  ├── Step 0a: cacheMarketIndicators()     → 24 ETFs via Yahoo → agent_memory
  ├── Step 0b: cacheGuruFocusData()        → ~85 tickers → gurufocus_cache
  │
  ├── Step 1:  Pulso del Mercado (regime)        → Haiku
  ├── Step 2:  Vigilante de Earnings              → Opus (transcripts)
  ├── Step 3:  Guardian de Dividendos             → Opus (8-quarter trends)
  ├── Step 4:  Radar Macro                        → Haiku  ← was Opus
  ├── Step 5:  Control de Riesgo                  → Haiku  ← was Opus
  ├── Step 6:  Asesor de Operaciones (trade)      → Opus (1 call)  ← was 3 calls
  ├── Step 7:  Historial de Aciertos              → No LLM (postmortem)
  ├── Step 8:  Radar de Insiders                  → No LLM (FMP)
  ├── Step 9:  Value Signals                      → No LLM (GuruFocus)
  ├── Step 10: Options Income                     → No LLM (Yahoo options)
  ├── Step 11: Dividend Cut Early Warning         → No LLM (Q+S inputs)
  ├── Step 12: Analyst Downgrade Tracker          → No LLM (FMP grades)
  ├── Step 13: Earnings Trend Pattern             → No LLM (FMP financials)
  └── Step 14: SEC Filings Tracker                → No LLM (SEC EDGAR)
                                                  │
                                        Push notification if any critical insight
```

**File:** `api/src/worker.js`
**Frontend:** `frontend/src/components/home/AgentesTab.jsx`
**D1 Tables:** `agent_insights`, `agent_memory`, `signal_tracking`, `gurufocus_cache`, `quality_safety_scores`
**Pipeline cost:** ~$1.05/run (3 Opus + 3 Haiku + 8 No-LLM). Was $1.20 before 2026-04-08 audit.

---

## LLM Agents (6)

### 1. `regime` — Pulso del Mercado 🧭
- **Model:** Haiku · **Cost:** ~$0.01/run · **Step:** 1
- **Function:** `runRegimeAgent()`
- **What:** Determines bull/bear/transition using 24 ETFs (sectors, factors, credit, commodities, VIX).
- **Output ticker:** `_REGIME_`
- **Consumed by:** `macro`, `risk`, `trade` (via `agent_memory.regime_current`).
- **Output fields:** `regime`, `regimeConfidence`, `breadthSignal`, `creditStress`, `factorSignal`, `safeHavens`, `actionGuidance`, `sectorLeaders[]`, `sectorLaggards[]`, `vixRegime`.

### 2. `earnings` — Vigilante de Earnings 📊
- **Model:** **Opus** · **Cost:** ~$0.40/run · **Step:** 2
- **Function:** `runEarningsAgent()`
- **What:** Combines EPS/revenue surprise with **earnings call transcripts** (FMP). Distinguishes temporary dips (one-time charges, restructuring) from structural decline using 6-quarter trend data.
- **Now consumes:** `earnings_trend` no-LLM signal (`earningsTrendSignal`).
- **Severity calibration:** critical only if revenue falling 3+ quarters AND margins compressing AND no credible turnaround. Max 2 criticals.
- **Batches:** ~85 positions in groups of 12.

### 3. `dividend` — Guardian de Dividendos 🛡️
- **Model:** **Opus** · **Cost:** ~$0.50/run · **Step:** 3
- **Function:** `runDividendAgent()`
- **What:** TTM-authoritative dividend safety analysis. Reads `quality_safety_scores.inputs_json` for `fcfTTM`, `dividendsPaidTTM`, `fcfCoverageTTM`, `payoutRatioWorst`. Recognizes that cutting to pay down debt = **bullish** (KHC pattern).
- **Now consumes:** `dividend_cut_warning` no-LLM signal (`cutWarningSignal`) and `analyst_downgrade` signal per ticker.
- **Carve-outs:** REITs (FFO/AFFO), BDCs (NAV coverage), ETFs/CEFs (no payout ratio).
- **Batches:** ~75 dividend positions in groups of 15.

### 4. `macro` — Radar Macro 🌍
- **Model:** Haiku · **Cost:** ~$0.01/run · **Step:** 4
- **Function:** `runMacroAgent()`
- **What:** Macro narrative synthesis (regime → credit → factors → sectors → commodities → portfolio implications). Contextualizes for China fiscal resident, 10% WHT.
- **Output ticker:** `_MACRO_`
- **Demoted from Opus 2026-04-08:** the prose was generic and Opus didn't add value over Haiku.

### 5. `risk` — Control de Riesgo ⚠️
- **Model:** Haiku · **Cost:** ~$0.01/run · **Step:** 5
- **Function:** `runRiskAgent()`
- **What:** Portfolio-level concentration, sector HHI, drawdown, weighted beta, leverage cost vs dividend income. Long-term buy-and-hold philosophy (NEVER recommend selling quality during temporary dips).
- **Output ticker:** `_PORTFOLIO_`
- **Demoted from Opus 2026-04-08:** metrics are computed in JS before the LLM call; Opus only paraphrased them.

### 6. `trade` — Asesor de Operaciones 🎯
- **Model:** **Opus** · **Cost:** ~$0.12/run · **Step:** 6
- **Function:** `runTradeAgent()`
- **What:** Reads ALL today's insights and emits up to 10 actionable recommendations. Internalizes bull/bear reasoning (no separate calls).
- **Simplified 2026-04-08:** was 3 calls (Haiku bull + Haiku bear + Opus synth, $0.28). Now 1 Opus call with internal reasoning ($0.12). Same output quality.
- **Bias:** ADD > HOLD > TRIM > SELL. SELL only if business permanently broken or dividend eliminated.
- **Signal tracking:** non-HOLD signals stored in `signal_tracking` for postmortem.
- **Conviction:** low/medium/high.

---

## No-LLM Agents (8)

### 7. `postmortem` — Historial de Aciertos 📋
- **Function:** `runPostmortemAgent()` · **Step:** 7
- **What:** Evaluates signals from 7 and 30 days ago. BUY/ADD correct if price rose >2%, SELL/TRIM correct if fell >2%, HOLD always neutral. Stores accuracy in `agent_memory.signal_accuracy`.

### 8. `insider` — Radar de Insiders 🕵️
- **Function:** `runInsiderAgent()` · **Step:** 8
- **What:** FMP `/stable/insider-trading/search` (was GuruFocus until v3). Detects cluster-buys (bullish), cluster-sells (red flag), tags recurring sellers `[RPT]` (10b5-1 plans).

### 9. `value` — Value Signals 💎
- **Function:** `runValueSignalsAgent()` · **Step:** 9
- **What:** Two-part scanner. (a) Portfolio positions trading below GF Value (ADD opportunities). (b) Watchlist of ~120 Aristocrats/Champions NOT in portfolio (NEW opportunities). Computes Put strike + estimated premium for each.

### 10. `options` — Options Income 🎰
- **Function:** `runOptionsIncomeAgent()` · **Step:** 10
- **What:** Yahoo Finance options chain. Top 20 positions → Covered Calls (100+ shares), CSPs (5–15% OTM), Bull Put Spreads on SPY/QQQ. **Skips positions with earnings before expiration** (IV crush). Stays Yahoo (FMP doesn't expose options).

### 11. `dividend_cut_warning` — Dividend Cut Early Warning 🚨
- **Function:** `runDividendCutWarningAgent()` · **Step:** 11
- **What:** Detects cut risk 4–8 weeks before announcement. Rolling TTM windows of FCF coverage. Carve-out REIT/AM/BDC.
- **Consumed by:** `dividend` agent as `cutWarningSignal`.
- **Source:** `quality_safety_scores.inputs_json`.

### 12. `analyst_downgrade` — Analyst Downgrade Tracker 📉
- **Function:** `runAnalystDowngradeAgent()` · **Step:** 12
- **What:** FMP `/stable/grades-historical`. Detects cluster downgrades. Critical if sentiment drops 4+ pts with 6+ analysts. Thresholds loosened 4/6→3/5 on 2026-04-08 (wasn't firing on blue chips).
- **Consumed by:** `dividend` agent as `analystDowngradeSignal`.

### 13. `earnings_trend` — Earnings Trend Pattern 📈
- **Function:** `runEarningsTrendAgent()` · **Step:** 13
- **What:** Detects 2+ consecutive quarters of operating-income miss YoY + margin compression >100bps.
- **Consumed by:** `earnings` agent as `earningsTrendSignal`.

### 14. `sec_filings` — SEC Filings Tracker 📋
- **Function:** `runSecFilingsAgent()` · **Step:** 14
- **What:** SEC EDGAR `/submissions` API. Tracks 8-K material events (items 2.05/2.06/3.03/4.01/4.02/5.02) for portfolio positions. CIK lookup cache.

---

## Killed agents (history)

- `summary` (frontend ghost tile, removed 2026-04-08): there was no `runSummaryAgent`. The backend still aggregates summary insights inside `runAllAgents` but it never had its own runner.

## Shared Infrastructure

### D1 Tables

| Table | Purpose | Key |
|-------|---------|-----|
| `agent_insights` | All agent outputs | UNIQUE(agent_name, fecha, ticker) |
| `agent_memory` | Persistent state between runs (regime, accuracy, etc.) | PRIMARY KEY(id) |
| `signal_tracking` | Trade signal postmortem | UNIQUE(original_fecha, ticker) |
| `gurufocus_cache` | GF Value, Score, rankings per ticker | PRIMARY KEY(ticker) |
| `quality_safety_scores` | Q+S inputs_json (TTM authoritative) | PRIMARY KEY(ticker) |

### Helper Functions (worker.js)

| Function | Purpose |
|----------|---------|
| `callAgentClaude(model, prompt, input)` | Call Anthropic API, parse JSON safely |
| `storeInsights(env, agentName, insights)` | Upsert into `agent_insights` |
| `cacheMarketIndicators(env)` | Yahoo 24 ETFs → `agent_memory` |
| `cacheGuruFocusData(env)` | Batch fetch GF for portfolio → `gurufocus_cache` |
| `getAgentMemory(env, key)` / `setAgentMemory(env, key, value)` | Read/write agent_memory table |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agent-insights` | GET | List insights (params: agent, severity, ticker, days) |
| `/api/agent-insights` | DELETE | Delete stale insight by id |
| `/api/agent-run` | POST | Run full pipeline (background) or single agent (`?agent=NAME`) |
| `/api/agents/prompts` | GET | Returns `AGENTS_METADATA` for transparency drawer |

### Push Notifications
- Triggered after all agents complete.
- Only sends if there are `critical` severity insights.
- Top 3 critical insights in body.
- Web Push (VAPID) — requires browser permission.

### Cost breakdown (~$1.05/run)
| Agent | Model | Cost |
|-------|-------|------|
| regime | Haiku | $0.01 |
| earnings | Opus | $0.40 |
| dividend | Opus | $0.50 |
| macro | Haiku | $0.01 |
| risk | Haiku | $0.01 |
| trade | Opus | $0.12 |
| 8 no-LLM agents | — | $0.00 |
| **Total** | | **~$1.05** |

Daily run × 22 trading days/month ≈ **$23/month**.
