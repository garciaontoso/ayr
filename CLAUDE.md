# A&R v4.0 — Dividend Equity Analysis + 11 AI Agents

## v4.0 Changes (2026-04-06)
- **11 AI Agents** in production with daily cron + push notifications. See `AGENTS.md` for full docs.
- **Tab "Agentes"** moved to position 2 (after Portfolio). Two view modes: Timeline | Por Empresa.
- **Sectors enriched 100%** (was 0%) using GuruFocus + FMP + manual mappings
- **Dividend agent uses Opus** with 8-quarter trend data — entiende contexto (KHC debt paydown = INFO not CRITICAL)
- **Local docs/{ticker}/** with 57 GF financials (30y quarterly) + 63 SEC filing links
- **GuruFocus integrated**: $1,299/yr Premium Plus, ~4,500 queries/month used
- **Cost**: ~$1.50/day Claude API ($33/month) — 3 Opus agents + 5 Haiku + 4 No-LLM
- **Tastytrade**: secrets saved but device challenge blocks Cloudflare Workers (pending)

## Deploy commands
- Frontend: `cd frontend && npm run build && npx wrangler pages deploy dist --project-name=ayr --branch=production --commit-dirty=true`
- Worker: `cd api && npx wrangler deploy`
- ALWAYS deploy both if worker.js changed

## URLs
- **Production**: https://ayr.onto-so.com
- **API**: https://aar-api.garciaontoso.workers.dev
- **Pages**: https://ayr-196.pages.dev

## Current Version: v3.2 (commit a775e8d)

## What's been built (v1.0 → v3.2)

### IB Integration (OAuth 1.0a)
- 4 IB accounts: U5372268, U6735130, U7257686, U7953378
- 107 positions (88 stocks + options) with live prices, P&L, avg cost
- NLV $1.35M aggregated across all accounts
- Endpoints: /api/ib-session, /api/ib-portfolio, /api/ib-ledger, /api/ib-summary, /api/ib-trades, /api/ib-pnl, /api/ib-options, /api/ib-flex-import
- OAuth keys stored as Cloudflare Worker secrets (IB_CONSUMER_KEY=AYRAPIOPC, IB_ACCESS_TOKEN, IB_ACCESS_TOKEN_SECRET, IB_SIGNATURE_KEY, IB_ENCRYPTION_KEY, IB_DH_PARAM)
- RSA keys in /api/ib-oauth/ directory (private keys — DO NOT commit)
- Flex Web Service token: IB_FLEX_TOKEN, Query ID: 1452278

### D1 Database (aar-finanzas)
- **positions** — 89 positions (replaces hardcoded POS_STATIC, removed in v2.2)
- **cost_basis** — 8683 trades (2013 from IB Flex import)
- **dividendos** — 2154 dividend entries
- **gastos** — 6236 expense entries
- **patrimonio** — monthly snapshots
- **nlv_history** — daily NLV from IB
- **alerts** — automated alert history
- **presupuesto** — budget items
- **margin_interest** — margin interest history
- **fundamentals** — cached FMP data (24h TTL)
- **price_cache** — cached prices

### Features
- **Portfolio**: compact rows, 12 columns (logo, name+sparkline, price, CHG$, CHG%, shares, cost, P&L, weight, value, div, actions)
- **Live prices**: auto-refresh every 10s via Yahoo Finance (/api/prices?live=1)
- **IB-style header**: NLV, P&L, Div, LIVE indicator
- **Heatmap**: Finviz-style, size=weight, color=P&L
- **Options chain**: calls+puts per position (analysis tab "Opciones")
- **CC Income**: VIX+SPY panel, progressive loading (B-S instant → Yahoo background)
- **Alerts**: 6 types (dividends, earnings, drops, options expiry, margin, milestones)
- **Watchlist**: custom sub-tabs (localStorage), table with 52w range
- **Tax Report**: by year, dividends by ticker
- **Dividend Calendar**: real ex-dates from FMP + projected
- **Performance chart**: portfolio vs S&P 500
- **Conciliation**: App vs IB side by side
- **Dark/Light mode**: ☀️/🌙 toggle (localStorage)
- **Health Check**: 🩺 panel with 11 system checks + data status dates
- **Airplane Mode**: ✈️ downloads all data for offline use on iPad
- **Global Search**: Cmd+K overlay
- **Dividend Streak**: badges (5y+, 25y+ Aristocrat)
- **Tests**: 67 tests, 9 files, all passing

### Cron Jobs (Mac)
- `sync-flex.sh` — runs daily at 8:30am Mon-Fri, syncs IB Flex trades+dividends to D1
- IB auto-sync — 1x/day on app load via sessionStorage flag

## Architecture
```
frontend/src/
  App.jsx              (~2050 lines — state, context, CompanyRow, layout)
  api/data.js          (fetchAllData — 15 endpoints including /api/positions)
  api/fmp.js           (fetchViaFMP — proxied through worker)
  components/
    views/HomeView.jsx (header, tabs, alert panel, health check, offline download)
    home/              (14 tabs: PortfolioTab, CoveredCallsTab, etc.)
    analysis/          (12 tabs: DashTab, OptionsChainTab, etc.)

api/src/worker.js      (~3200 lines — 73 endpoints)
  IB OAuth helpers: getIBSession(), ibAuthFetch()
  Crypto: modPow(), bigIntToBytes(), rsaSign(), rsaDecrypt(), hmacSHA1/256()
```

## Known Issues / Pending
- **HKG:9618 cost shows $0** — FX conversion works but POS_STATIC fallback data was incomplete
- **Foreign tickers (BME:, HKG:, HGK:)** — IB ticker mapping in IB_TICKER_MAP may need updates for new positions
- **Massive API** — free plan returns 403 for options. Endpoint exists but unused (key scrubbed 2026-04-08 — rotate if still active). Consider deleting the endpoint.
- **IB Flex trades** — only syncs when Mac is on (cron). IB blocks Cloudflare Workers IPs
- **Some DIV/AÑO show "—"** — positions without divTTM in D1 need updating

## TDZ Bug Pattern (CRITICAL)
- React hooks (useEffect/useCallback) that reference variables declared LATER in the component cause "Cannot access X before initialization" in production builds
- ALWAYS declare useState/useCallback BEFORE the useEffects that reference them
- The Vite bundler hoists `const` declarations but NOT their initialization → TDZ in minified code
- This has been the #1 recurring bug (fixed 4+ times)

## Key Passwords/Secrets (all in Cloudflare Worker secrets)
- FMP_KEY, MASSIVE_KEY, IB_CONSUMER_KEY, IB_ACCESS_TOKEN, IB_ACCESS_TOKEN_SECRET, IB_SIGNATURE_KEY, IB_ENCRYPTION_KEY, IB_DH_PARAM, IB_FLEX_TOKEN
