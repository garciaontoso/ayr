---
name: AI Agents System v2 (2026-04-06)
description: 11 agents + Executive Summary, Opus-powered dividend analysis with quarterly trends, Portfolio view, Options Income with IB Greeks, Tastytrade pending
type: project
---

## Final System State (end of session 2026-04-06)

### 11 agents in production
1. **Pulso del Mercado** (regime) - Haiku - 24 ETFs analysis
2. **Vigilante de Earnings** (earnings) - Haiku - context-aware prompts
3. **Guardian de Dividendos** (dividend) - **Opus** - 6 batches × 15, uses 8-quarter trend data
4. **Control de Riesgo** (risk) - Haiku - now with 100% sector data
5. **Radar Macro** (macro) - **Opus** - regime + economic calendar synthesis
6. **Asesor de Operaciones** (trade) - Haiku bull + Haiku bear + **Opus** synth
7. **Historial de Aciertos** (postmortem) - No LLM
8. **Radar de Insiders** (insider) - No LLM (GuruFocus) - 19 alerts with price impact + recurring seller detection
9. **Value Signals** (value) - No LLM - 120+ Dividend Aristocrats scanner with put selling context
10. **Options Income** (options) - No LLM - scans 79 positions with Yahoo + IB Greeks ready
11. **Resumen Ejecutivo** (summary) - No LLM - compiles top actions for push notifications

### Cost: ~$1.50/day (~$33/month)
- 2 Opus agents (Macro + Trade synth) + 1 Opus dividend agent (6 batches)
- 5 Haiku agents
- 4 No-LLM agents

### Key Improvements This Session
1. **Sectors fixed**: 0% → 100% with manual mappings + GF/FMP enrichment
2. **Dividend agent uses Opus + quarterly trends**: 12 false-positive criticals → 3 real ones
3. **REIT/BDC/ETF/PREFERRED categorization**: prevents Haiku from gritando "CRITICAL" on normal REIT payouts
4. **Insider Radar v2**: detects recurring sellers (10b5-1), tracks price impact, 19 real alerts
5. **Yahoo crumb auth fix**: options data works again with crumb token
6. **Portfolio view**: table with fixed columns per agent, sortable, shows all positions
7. **Push notifications**: includes top 3 action items, not just alert count
8. **Executive Summary agent**: compiles all agents into one actionable view

### Frontend Layout
- Tab "Agentes" moved to position 2 (after Portfolio)
- 2 view modes: Timeline | Por Empresa (Portfolio table)
- Per-agent run buttons (no need to run all)
- Per-agent reordering (localStorage)
- Filter by yield % for Value Signals
- Collapsible info panels showing model + data sources

### Known Issues / Pending
- **Tastytrade API**: requires device challenge from Cloudflare Workers, pending workaround. Credentials saved in secrets but blocked by 2FA + device verification.
- **FMP earnings transcripts**: not available on Premium plan
- **SEC filings**: 63 partial downloads via EDGAR full-text search but matching imprecise (DEO matched Dominion Energy not Diageo). Needs CIK number lookup table.
- **GF financials downloaded locally**: 57/85 in `docs/{ticker}/gf_financials.json` (30 years quarterly data) — for manual analysis when user asks
- **Some criticals still false**: AHRT and FLO show real problems, but the agent could benefit from reading actual 10-K text

### Local docs structure created
```
docs/
├── ACN/, ADP/, ... (85 folders)
│   ├── gf_financials.json    (57 files — 30y quarterly from GF)
│   └── sec_filings.json      (63 files — partial, needs CIK fix)
```

### D1 Tables added/modified
- `agent_insights` — UNIQUE(agent_name, fecha, ticker)
- `agent_memory` — persistent state including `regime_current`, `signal_accuracy`, `market_indicators`, `insider_trades`
- `signal_tracking` — postmortem
- `gurufocus_cache` — now includes `trend` field with 8-quarter financials (revenue, fcf, debt, dividendsPaid)
- `earnings_transcripts` — table created but FMP doesn't deliver

### Cron Pipeline (9am UTC Mon-Fri)
1. cacheMarketIndicators (Yahoo 24 ETFs)
2. cacheGuruFocusData (85 tickers)
3. enrichPositionSectors (auto)
4. regime → earnings → dividend → risk → macro → trade → postmortem → insider → value → options
5. Build Executive Summary
6. Push notification if criticals

### Important Endpoints
- `GET /api/agent-insights?agent=X&days=N` — list insights
- `POST /api/agent-run` — run all (background)
- `POST /api/agent-run?agent=NAME` — run single agent
- `POST /api/enrich-sectors` — fill missing sectors
- `POST /api/agent-run?agent=gf-trends` — refresh quarterly trends (separate due to 30s timeout)
- `GET /api/options-analysis?symbol=KO` — deep options analysis on demand (IV rank, CC, CSP, BPS)
- `GET /api/tastytrade-test` — credentials saved but device challenge blocks (pending)
- `DELETE /api/agent-insights?id=X` — clean stale entries

### User Philosophy (CRITICAL — agents must respect)
- **Long-term buy-and-hold dividend portfolio** ($1.35M, China fiscal resident, 10% WHT US-China treaty)
- **NEVER recommend selling quality companies during temporary dips** — the worst mistake
- **Dividend cuts to pay debt are often BULLISH** (KHC example) — strategic restructuring
- **Goal**: growing dividend income over decades, not capital gains trading
- **Wants context, not ratios**: agents must explain WHY behind numbers
- **Wants clarity**: severity must be conservative — only "critical" for genuine business decline

### Next Session Pending Items
1. **Tastytrade device challenge workaround** — investigate if remember-token flow works after manual approval
2. **SEC EDGAR with CIK lookup**: build proper ticker→CIK mapping (SEC has free `company_tickers.json`)
3. **Earnings agent**: consider upgrading to Opus with trend data (similar to dividend) for context-aware analysis
4. **Trade Advisor**: refine bull/bear prompts to be more conservative on SELL recommendations
5. **Frontend**: Portfolio view could show position size, weight %, P&L for context
6. **Push notifications**: subscribe in app (Settings → Notifications)
