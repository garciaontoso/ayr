# A&R v4.5 — Audit Forense Completo + 4 Tabs Nuevas + 50 Fixes Overnight

## v4.5 (2026-05-02 — Sesión Master 17h)
- **4 tabs nuevas**: 🎯 Opciones Abiertas, 📋 Cost Basis (analysis 2ª), 👥 Directiva (analysis), 💰 P&L (Cartera)
- **7 endpoints nuevos**: /api/pnl/monthly (FIFO), /api/directiva (FMP+Haiku), /api/options/open-portfolio, /api/reentry-watch/scan, /api/reconcile/portfolio-check, /api/debt-maturity, /api/earnings/archive/reextract
- **8 agentes overnight + 7 deep-audit por tab** (X1-X7) → 13 audit reports
- **NAV corregido $3.40M→$1.38M real** (75 positions reconciled to IB live)
- **9,124 phantom dups** borrados de cost_basis (21,882→12,758) + UNIQUE INDEX exec_id
- **AHRT $64K bug**: cbCalc fallback peligroso → fixed
- **IB Bridge OPT fields stripping** → fixed (96 positions, 4 cuentas, OPT greeks)
- **Tax 2025 -$1.15M (signo invertido)** → +$87K real con FIFO nuevo
- **777 dividendos bruto=0 backfilled** + 1,083 WHT bleed fixed (+$652 2025)
- **23 endpoints protegidos** (12 WRITE + 11 READ que leakaban)
- **Telegram smart-money** alerts paralelo a web push
- **Mac sync-funds.sh** auth fixed (broken desde Apr 20)

### 10 Bugs recurrentes documentados con root cause permanente
Lecciones detalladas en memoria `session_2026-05-02_FINAL_overnight.md`.



## 🎯 LEER PRIMERO — Plan profesionalización 12 semanas
Ver `docs/ROADMAP-PRO.md` para el plan completo. Estamos en **Semana 1**:
error tracking propio + Zod + Vitest + CI. Cualquier sesión nueva debe
leer ese fichero primero, ver qué está hecho ✅ y qué está EN CURSO 🚧,
y continuar por ahí en lugar de empezar features nuevas.

## 📚 Bug Patterns Catalog
Lista viva de bugs recurrentes con causa raíz + fix + prevención: `docs/bug-patterns.md`.
**Cuando arregles un bug nuevo, AÑADE entrada al final.** Antes de tocar
algo, consulta "Patrones obligatorios" y "Patrones prohibidos" allí. Es
la memoria del proyecto contra regresiones.

Sistema Anti-Fallo desplegado 2026-05-03 (3 capas):
- **Capa 1**: `/api/audit/portfolio` + `/api/audit/full` — escanean
  positions / cost_basis / dividendos / financials
- **Capa 2**: pestaña 🎯 Radar → 🩺 Audit en frontend con auto-fix
- **Capa 3**: cron diario 08:00 UTC + Telegram alert si regresión

## 🛠 Validators centralizados
`frontend/src/validators/index.js` — schemas para Position, Trade,
Fundamentals + isReit helper. Uso: `const { value, isValid, issue } =
validatePosition(p);`. Devuelven graceful fallback en lugar de NaN/crash.
TODO: cablear en PortfolioTab/DashTab/FastTab incrementalmente.

## 🚦 Pre-deploy guard
`scripts/pre-deploy-check.sh` ejecuta `/api/audit/full`, compara con
`.audit-baseline.json` y bloquea deploy si DELTA_RED > 0. Override:
`ALLOW_REGRESSION=1 bash scripts/pre-deploy-check.sh`. TODO: integrar
como pre-step en el comando deploy npm.

## ⚠️ REGLAS DURAS DE DATA INTEGRITY (no romper)

### Tablas canonical (UN SOLO source of truth por tipo)
- `cost_basis` = SOLO trades EQUITY/OPTION. **NUNCA tipo='DIVIDENDS'** (es legacy bug).
- `dividendos` = canonical para divs cobrados. Backend ya hace JOIN con cost_basis al servir `/api/costbasis`.
- `transferencias` = SOLO bank↔broker externas (no INTERNAL IB-IB).
- `positions` = posiciones actuales, sincronizadas con IB live.
- `open_trades` = open BPS/IC/CC (closed_at IS NULL).

### Patrones obligatorios
1. **MERGE en READ, no en WRITE** — si necesitas vista combinada (ej. trades + divs), JOIN al servir, NO duplicar en disco.
2. **`/api/costbasis/sync-dividends` está DEPRECATED** (2026-05-02). No usar — solo recrea dups.
3. **Antes de bulk UPDATE/DELETE** en D1: SELECT COUNT(*) → SELECT sample 5 → script con `--dry-run` si magnitud >100.
4. **Antes de pedir datos al usuario**: chequear `data/flex-csvs/`, D1, `~/Downloads/` y memoria.
5. **Validación de divs**: rechazar `shares=0 AND dps>1.0` (siempre bug de extracción).

### Tokens (NO PEDIR al usuario)
- `AYR_WORKER_TOKEN` (worker secret) = mismo que `VITE_AYR_TOKEN` del frontend `.env.local`
- Si HTTP 401 en uploads: copiar el VITE_AYR_TOKEN a `~/.ayr-env`
- Bridge NAS usa `BRIDGE_AUTH_TOKEN` distinto

### CSVs Flex locales (NO PEDIR)
Permanentes en `/data/flex-csvs/` — multi4 yearly 2021-2026 cubren 4 cuentas.

## v4.4 Changes (2026-05-02) — Data Integrity Overhaul, ~10h sesión
- **Re-import 6,114 trades 2020-2024** multi-account con exec_id poblado
- **114 transferencias externas** importadas ($994K bank↔broker)
- **AHRT bug** $64,692→$1,995: cbCalc fallback peligroso fixed + API merge architecture
- **Arquitectura `/api/costbasis`**: MERGE cost_basis + dividendos en READ time (fin del bug recurrente)
- **`sync-dividends` DEPRECATED** (no-op) — ya no recrea duplicados
- **Reconcile diario IB vs D1** con Telegram alert (cron post-Flex)
- **Telegram dividendos** muestra bruto total + neto + per share
- **Portfolio sort default = ticker A-Z** + persiste en localStorage
- **Columnas TICKER + NOMBRE separadas** (Portfolio + Watchlist)
- **Tab "Opciones Abiertas"** con theta diaria + filtros + calendar view
- **DashTab nuevo**: ROE Buffett comparison ↗↘, Operating Margin, Cobertura FCF vs Divs, **FCF Allocation completo**, Debt Maturity (limitado)
- **Endpoints nuevos**: `/api/reconcile/portfolio-check`, `/api/options/open-portfolio`, `/api/debt-maturity`, `/api/earnings/archive/reextract`
- **Frontend ROE/ROIC fix**: avg equity en `useAnalysisMetrics.js` (estándar GuruFocus, no Buffett ending)
- **Cache invalidation**: `cb:` → `cb:v2:` en window.storage para forzar reload limpio

## v4.3 Changes (2026-05-01) — Sesión master 6h, 13 commits, ~60 bugs fixed (3 rondas auditoría 16 agentes)
- **Auto Trading tab completo** (grupo Ingresos): Catálogo + Backtest + 🎣 Pescando + 🧠 Brain + 📅 Hoy + 🛡️ Auto-Close + 📊 Paper. 4 estrategias seedeadas (BPS-IWM Phil Town, BPS-SPY, IC-SPY, Earnings-IC).
- **Tab TT** (grupo Cartera): 3 cuentas T3 con auto-detect strategies. Auto-refresh 60s.
- **NAS Bridge Tastytrade LIVE**: `ttapi.onto-so.com` → tastytrade-bridge container. OAuth flow + persist tokens en `/data/tt-tokens.json`. Resuelve bloqueo CF Workers IPs (verificado nginx 401 desde CF, 200 desde IP residencial).
- **Auto-Close Engine**: 13 reglas, Telegram CRITICAL+WARN, DTE en ET (no UTC), engine extendido a IB bridge.
- **Auto-sync open trades** cada 5 min: detecta BPS/BCS/IC/CSP/CC desde T3+IB.
- **Cron CF diario** `30 7 * * 1-5` (08:30 Madrid): IB Flex sync sin Mac. Coste $0.
- **Telegram bot @AyRTrading_bot**: dividendos nuevos auto + brain + auto-close + fishing + auto-sync.
- **Daily Pesca**: sugerencia diaria BPS RUT con patrón histórico empírico (delta 0.03, OTM 9.7%, DTE 28, VIX 16.5, jue+vie) + defensa combo POP+Δ+size cap.
- **AUTH GATES**: 30+ endpoints sensibles requieren `X-AYR-Auth` token. Frontend monkey patch en `main.jsx` añade auto. Antes /api/positions = HTTP 200 público.
- **CORS strict**: allowlist exacta (ayr.onto-so.com + ayr-196.pages.dev). Quitado `*.pages.dev` wildcard (CSRF risk).
- **Schema multi-cuenta**: `account` column en cost_basis/positions/dividendos. Worker flex import populate automático.
- **Bug UNH resuelto**: 1844 opciones tenían OCC ticker raw → añadida columna `underlying`, backfilled. Frontend orphans filtra por underlying.
- **Recovered ~$30K visibility**: PAYX 207→307, UNH price stale, DIVO usd_value, HEN3+MO avg negativo, 6 ghost rows movidos.
- **logEvent + errorBudget centralizado** (foundation para reemplazar 127 catches silenciosos + 67 console.error sin alerta).
- **Mobile UX**: viewport pinch-zoom, safe-area-inset, inputs 16px, touch 36px min.
- **Schema cleanup D1**: 6 indexes duplicados borrados, UNIQUE dedup divs.
- **Backup 4 sitios** (local + NAS + iCloud + GitHub tag `snapshot-2026-05-01`).
- **Pendientes round 2**: 9 catches CRITICAL más, FMP N+1 fix, backfill account 7942 NULL (re-import Flex 365d), HKG/AHRT cost_basis manual review, VAPID push iOS, frontend tab "Income por opciones".

## v4.2 Changes (2026-04-27) — IB Gateway bridge en producción
- **NAS Synology DS423+** corre `ib-gateway` (gnzsnz/ib-gateway) + `ib-bridge` (Node 20 Express). Stack en `/volume1/docker/ib-stack/`
- **CF Tunnel "Synology-ES"** ruta `ib.onto-so.com → http://localhost:8090`
- **Worker proxy** `/api/ib-bridge/*` con Bearer token. Endpoints control extra requieren `X-Control-Token` (segundo token, allowlist hardcoded a `ib-gateway`)
- **NAV multi-account live**: las 4 cuentas IBKR agregadas, total ~$1.38M en tiempo real
- **`IBControlButton`** en header (entre 🩺 y ✈️): 🟢 Live / 🔴 Off / 🟡 Starting / ⚫ Unreachable. Click → para/arranca container ib-gateway sin SSH
- **Quotes/IV reales** de IB Gateway para scanner (vs Yahoo delayed antes)
- Sin `AUTO_RESTART_TIME` (evita 2FA forzoso durante vuelos del usuario)
- **Bugs aprendidos**: `@stoqey/ib` es CJS (no named imports), `Contract` no exportado (usar plain objects), `IB_PORT 4003` (socat layer no 4001 Java directo), snapshot resolve por silencio (IB no manda tickSnapshotEnd para delayed-frozen), docker.sock requiere `group_add: ["0"]` en compose

## Deploy commands NAS
- Push compose/código: `cat archivo | ssh nas "cat > /volume1/docker/ib-stack/<path>"`
- Rebuild bridge: `ssh nas "cd /volume1/docker/ib-stack/nas-deploy && sudo /usr/local/bin/docker compose --env-file /volume1/docker/ib-stack/.env build ib-bridge"`
- Restart: `sudo /usr/local/bin/docker compose --env-file /volume1/docker/ib-stack/.env up -d --no-deps --force-recreate ib-bridge`
- Logs: `sudo /usr/local/bin/docker logs ib-bridge --tail 30`

## v4.1 Changes (2026-04-24) — FAST Tab overhaul
- **⚡ FAST tab** completamente rediseñada estilo FAST Graphs + 5 sub-tabs (Summary / Trends / Forecasting / Historical / Scorecard).
- **Chart principal**: paleta FAST Graphs (Normal P/E azul, Fair Value naranja 15x, verde "justificado", Dividend Yield rojo + Payout amarillo en eje derecho). Current Valuation dots anuales. Buy Zone pulsante cuando en zona de compra. Recession bands + trades overlay.
- **EPS suavizado 3y median** (toggle ON/OFF) para filtrar picos GAAP (write-downs, FX).
- **Tab Trends**: 5 sparklines con hover — EV/EBITDA, ROIC, FCF Yield, DPS Growth YoY, Shares Outstanding (detecta buybacks/dilución).
- **Tab Forecasting**: bar chart EPS consenso 5y + tabla CAGR @ P/E custom vs @ Normal P/E.
- **Tab Scorecard**: FG Scores radar + Analyst Scorecard + **Piotroski F-Score** (0-9) + **Altman Z-Score** + **Beneish M-Score**.
- **Sidebar** 3 cards (Valoración / Retornos / Perfil) + card Backtest 5/10/15/20y.
- **Compare mode**: overlay 2º ticker ghost normalizado.
- **P/E personal** ⭐ persistido en localStorage por ticker.
- **⬇ Export PNG** del chart en resolución retina 2x.
- Banner warning cuando ticker es ETF (sin ratios) o REIT (Altman no aplica).
- Tooltip enriquecido: 📊 histórico / 🔮 proyectado + "vs HOY ±X%" + tu compra ▲ si trade ±30d.

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
- **API**: https://api.onto-so.com (custom domain, replaces workers.dev which uses blocked IPs)
- **Pages**: https://ayr-196.pages.dev

## Current Version: v4.1 (commit eb42b6c — FAST Tab overhaul)

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
- `scripts/sync-funds.sh` — Smart Money 13F refresh + push notify. Calls `POST /api/funds/refresh` then `POST /api/funds/alerts/notify`. Logs to `~/Library/Logs/ayr-sync-funds.log`. Schedule: 09:00 local on days 1, 15, 16, 17, 20 of every month (15-17 = 13F filing window 45d after quarter end; day 20 = Spanish semestrales Cobas/Magallanes/azValor; day 1 = monthly safety pass). Install: `crontab -e` and paste from `scripts/sync-funds.crontab.example`.

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
