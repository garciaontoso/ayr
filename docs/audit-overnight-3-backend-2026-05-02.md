# Audit Overnight 3 — Backend Endpoints + Auth
**Date:** 2026-05-02  
**File audited:** `api/src/worker.js` (28,177 lines)  
**Total route checks found:** ~350 (299 exact-path `===` + 48 `startsWith`/`match`)

---

## 1. Auth Architecture

The worker uses **three distinct auth mechanisms** in the following precedence order:

| Mechanism | Where | Check |
|---|---|---|
| `PROTECTED_READ` gate | Top-level if-chain (~line 4008) | X-AYR-Auth or Bearer token |
| `PROTECTED_WRITE` gate | Same top-level gate | X-AYR-Auth or Bearer token |
| `ytRequireToken()` inline | Inside individual handlers | Bearer token only |
| `isAllowed && origin` bypass | Inside individual handlers | Same-origin browser allowed; scripts need Bearer |
| IB Bridge custom gate | Lines 11485–11491 | X-AYR-Auth equals `AYR_BRIDGE_AUTH` secret |

**Key design flaw:** The top-level gate (`PROTECTED_READ` / `PROTECTED_WRITE`) only catches endpoints explicitly listed in those arrays. Any endpoint not in those lists bypasses the gate entirely, even if it reads or mutates sensitive D1 data.

---

## 2. Security Findings

### CRITICAL — IB Bridge auth uses different secret than main token

The `/api/ib-bridge/*` block (lines 11485–11491) checks `env.AYR_BRIDGE_AUTH` (not `env.AYR_WORKER_TOKEN`). This is intentional (per comments) but means: **if `AYR_BRIDGE_AUTH` is not set in wrangler secrets, the check `if (!expected || ...)` will fail and return 401 for all bridge calls** — the bridge silently goes unreachable rather than open. Confirmed safe-fail. Not a bug.

### HIGH — Write endpoints with zero auth (not in PROTECTED_WRITE, no inline check)

All of the following POST/PUT/DELETE endpoints accept unauthenticated calls from any IP:

| Endpoint | Method | D1 table | Sensitivity |
|---|---|---|---|
| `/api/dividendos` | POST | `dividendos` | Financial records — 2154 dividend entries |
| `/api/dividendos/:id` | PUT | `dividendos` | Edit any dividend |
| `/api/dividendos/:id` | DELETE | `dividendos` | Delete any dividend |
| `/api/dividendos/fix-shares` | POST | `dividendos` | Batch-updates shares field |
| `/api/costbasis` | POST | `cost_basis` | Insert trades into 8600-row trade log |
| `/api/costbasis/:id` | DELETE | `cost_basis` | Delete any cost_basis row by integer ID |
| `/api/ingresos` | POST | `ingresos` | Salary / income entries |
| `/api/patrimonio` | POST | `patrimonio` | Monthly wealth snapshots |
| `/api/patrimonio/:id` | PUT | `patrimonio` | Edit wealth snapshot |
| `/api/patrimonio/:id` | DELETE | `patrimonio` | Delete wealth snapshot |
| `/api/gastos` | POST | `gastos` | Personal expense data |
| `/api/gastos/:id` | PUT | `gastos` | Edit expense |
| `/api/gastos/bulk-update` | POST | `gastos` | Batch update categories |
| `/api/gastos/:id` | DELETE | `gastos` | Delete expense |
| `/api/gastos/import-csv` | POST | `gastos` | Bulk import from CSV |
| `/api/margin-interest` | POST | `margin_interest` | Margin cost per IB account |
| `/api/patrimonio/auto-snapshot` | POST | `patrimonio` + `nlv_history` | Triggers NLV fetch + write |
| `/api/cache-pnl` | POST | `price_cache` | Triggers IB bridge P&L cache write |

**Note on PROTECTED_WRITE**: The list uses prefix matching (`path.startsWith(p)`) for entries like `/api/refresh-`, `/api/enrich-`. But it only covers write methods (POST/PUT/PATCH/DELETE). The dividend/costbasis/patrimonio/gastos/ingresos write paths are not in `PROTECTED_WRITE` at all.

### HIGH — GET endpoints with sensitive data not in PROTECTED_READ

The following GET endpoints return sensitive financial data but were missing from PROTECTED_READ before this audit:

| Endpoint | Returns |
|---|---|
| `/api/ib-cached-snapshot` | NLV + ib_shares + ib_avg_cost for all positions |
| `/api/ib-nlv-history` | Full NLV time-series (365 data points of account wealth) |
| `/api/ib-flex` | Raw IB Flex XML with account IDs + all trades |
| `/api/tax-report` | Realized gains/losses + dividends by ticker |
| `/api/tax/optimization-report` | WHT amounts + rebalancing suggestions per country |
| `/api/costbasis/all` | All 8600+ cost_basis rows with exact prices |
| `/api/ingresos` | Salary and income entries |
| `/api/margin-interest` | Margin interest history per IB account |
| `/api/stats` | Patrimonio snapshot + div_ytd |
| `/api/fire` | FIRE projections + tracking |
| `/api/pl` | Annual P&L table |

**APPLIED FIX:** All 11 endpoints above added to `PROTECTED_READ` in this audit (lines 3993–4005). This immediately blocks unauthenticated GET access.

### MEDIUM — Write endpoints with same-origin bypass but no Bearer fallback

These write endpoints use `const _ua = (isAllowed && origin) ? null : ytRequireToken(...)` — correctly protected from external scripts, but the pattern relies on the CORS `Origin` header being set by the browser. Confirmed correct per existing architecture.

### MEDIUM — POST /api/youtube/request-processing — NO auth (line 4938)

Writes to `app_config` table key `youtube_process_request`. The Mac scanner polls `/api/youtube/should-process` (which IS auth-gated at line 4949) to check this flag. An external caller can set the flag without auth, causing the Mac scanner to trigger spurious YouTube processing runs. Low operational impact but worth adding same-origin bypass.

### MEDIUM — POST /api/scores/compute — NO auth (line 13297)

Accepts `?all=1` to trigger batch FMP API calls + D1 writes for all portfolio tickers. Could drain FMP quota (5000 calls/day Ultimate plan) if called externally in a loop. No inline auth check.

### LOW — DELETE /api/fundamentals — NO auth (line 14928)

Deletes cached FMP data for any ticker. Cache-busting only (no financial data loss), but unprotected.

### LOW — POST /api/library, PUT/DELETE /api/library/* — NO auth (lines 17256, 17296)

Reading list CRUD. Personal data, no financial sensitivity.

### LOW — POST /api/recommendations/log + review — NO auth (lines 22114, 22198)

Recommendation log writes. Used by agents (same-origin). External injection is low risk.

### LOW — Inconsistent auth: some write endpoints use X-AYR-Auth OR Bearer, others Bearer-only

`ytRequireToken()` (line 27046) checks `Authorization: Bearer` header only. The top-level gate (line 4009) accepts both `X-AYR-Auth` header and `Authorization: Bearer`. Endpoints that use inline `ytRequireToken()` will reject X-AYR-Auth headers sent without the `Bearer` prefix. This is inconsistent: the frontend monkey-patch sends `X-AYR-Auth` but some endpoints only accept `Bearer`. Confirmed the gate catches all PROTECTED_READ/WRITE before they reach `ytRequireToken()`, so no actual rejection occurs for frontend calls. However, curl scripts that use `-H "X-AYR-Auth: $TOKEN"` will fail for endpoints that use only `ytRequireToken()` inline.

---

## 3. Endpoint Catalog by Auth Tier

### TIER 0: Public (no auth required)
```
GET  /api/ping
GET  /api/health
GET  /api/data-status
GET  /api/market-sentiment
GET  /api/market-sentiment/history
GET  /api/futures-intraday
GET  /api/prices
GET  /api/ib-bridge/health
GET  /api/tastytrade/oauth/init
GET  /api/tastytrade/oauth/callback
GET  /api/tastytrade/status
GET  /api/fx
GET  /api/price-history
GET  /api/options-chain
GET  /api/options-batch
GET  /api/fundamentals (GET)
GET  /api/peer-ratios
GET  /api/search
GET  /api/screener
GET  /api/dividend-calendar
GET  /api/dividend-streak
GET  /api/dividend-forecast
GET  /api/dividend-dps-live
GET  /api/dividend-forward
GET  /api/dividend-scanner
GET  /api/earnings-batch
GET  /api/earnings-transcripts
GET  /api/earnings/upcoming
GET  /api/earnings/post
GET  /api/earnings/briefing/:ticker
GET  /api/report
GET  /api/options/calc (POST)
GET  /api/options/trades (GET)
GET  /api/options/summary
GET  /api/options/reconcile/cs
GET  /api/options/reconcile/orphans
GET  /api/options/import-issues
GET  /api/options/meta
GET  /api/options/optimizer
GET  /api/scores (GET)
GET  /api/scores/:ticker (GET)
GET  /api/forward-yield/:ticker (GET)
GET  /api/debt-maturity
GET  /api/fg-history
GET  /api/buy-wizard/context
GET  /api/discovery/scan
GET  /api/discovery/rank-custom-list
GET  /api/cantera/list
GET  /api/cantera/tags
GET  /api/cantera/deltas
GET  /api/funds/list
GET  /api/funds/overlap
GET  /api/funds/by-tickers
GET  /api/funds/cik-search
GET  /api/funds/consensus
GET  /api/funds/alerts
GET  /api/funds/alerts/mutes
GET  /api/funds/alerts/performance
GET  /api/youtube/channels (GET)
GET  /api/youtube/videos
GET  /api/youtube/video/:id
GET  /api/youtube/portfolio-mentions
GET  /api/briefing/daily (GET — partial: same-origin OR bearer)
GET  /api/daily-briefing (GET)
GET  /api/digest/weekly/latest
GET  /api/digest/weekly/history
GET  /api/alert-track-record
GET  /api/alerts (GET)
GET  /api/alert-rules/list
GET  /api/reentry-watch/scan
GET  /api/news/recent
GET  /api/news/:ticker
GET  /api/theses (GET)
GET  /api/theses/missing
GET  /api/theses/:ticker (GET)
GET  /api/library (GET)
GET  /api/agent-insights (GET)
GET  /api/agent-insights (DELETE — no inline auth)
GET  /api/agents/prompts
GET  /api/agents/health
GET  /api/agent-run/status
GET  /api/preferences (GET)
GET  /api/preferences/:key
GET  /api/ai-analysis (GET)
GET  /api/macro/upcoming
GET  /api/scanner/state
GET  /api/scanner/runs
GET  /api/scanner/snapshots
GET  /api/scanner/filters
GET  /api/sector-deep-dive (GET)
GET  /api/sector-deep-dive/list
GET  /api/deep-dividend/list
GET  /api/deep-dividend/get
GET  /api/deep-dividend/extractions
GET  /api/deep-dividend/prompts (GET)
GET  /api/deep-dividend/calibration
GET  /api/deep-dividend/dashboard
GET  /api/smart-alerts/8k-events
GET  /api/smart-alerts/insider-clusters
GET  /api/smart-alerts/cross-validation-conflicts
GET  /api/smart-alerts/ia-alerts
GET  /api/oracle-verdict (POST+GET — no auth gate!)
GET  /api/oracle-verdict/batch
GET  /api/research-agent/list
GET  /api/research-agent/:id
GET  /api/backtest/safety-vs-cuts
GET  /api/auto/strategies
GET  /api/auto/backtest (POST)
GET  /api/auto/backtest/:id
GET  /api/auto/daily-pesca
GET  /api/auto/replay-rut-bps
GET  /api/auto/backtests
GET  /api/brain/decisions (GET)
GET  /api/telegram/log (GET)
GET  /api/fishing/orders (GET)
GET  /api/fishing/scan (POST — no auth)
GET  /api/journal/list
GET  /api/journal/stats
GET  /api/push-test (GET)
GET  /api/presupuesto (GET, POST, PUT, DELETE — no auth on write)
GET  /api/config
GET  /api/categorias
GET  /api/gasto-rules
GET  /api/five-filters
GET  /api/etf-holdings
GET  /api/etf-sector-weightings
GET  /api/portfolio-sector-lookthrough
GET  /api/cached-pnl (GET — returns cached P&L summary, low sensitivity)
GET  /api/dividendos/resumen, /mensual, /por-ticker (aggregates — lower sensitivity)
GET  /api/dividendos/calendar.ics (iCal — exposes ticker + amount history publicly)
GET  /api/ib-session (GET — returns only consumerKey, not secrets)
GET  /api/fundamentals/bulk (POST — calls FMP API for any tickers, FMP quota risk)
```

### TIER 1: PROTECTED_READ gate (X-AYR-Auth or Bearer)
After this audit's fixes, now includes:
```
GET  /api/positions
GET  /api/holdings
GET  /api/cash (GET — was already listed)
GET  /api/cartera
GET  /api/trades
GET  /api/dividendos (GET)
GET  /api/transferencias
GET  /api/patrimonio (GET)
GET  /api/gastos (GET)
GET  /api/nomina
GET  /api/costbasis
GET  /api/ib-portfolio, /ib-summary, /ib-pnl, /ib-ledger
GET  /api/ib-trades, /ib-options, /ib-flex-import-status
GET  /api/ib-debug
GET  /api/auto-close/open-trades, /alerts
GET  /api/tastytrade/positions, /accounts
GET  /api/options/open-portfolio
--- NEW (added this audit) ---
GET  /api/ib-cached-snapshot
GET  /api/ib-nlv-history
POST /api/ib-nlv-save   [note: POST guarded by PROTECTED_READ only if method is GET — bug: see §5]
GET  /api/ib-flex
GET  /api/tax-report
GET  /api/tax/optimization-report
GET  /api/costbasis/all
GET  /api/ingresos
GET  /api/margin-interest
GET  /api/stats
GET  /api/fire
GET  /api/pl
```

### TIER 2: PROTECTED_WRITE gate (X-AYR-Auth or Bearer) 
```
POST /api/claude
POST /api/agent-run
POST /api/ai-analyze
POST /api/ai-analyze-portfolio
POST /api/sector-deep-dive
POST /api/scanner/run
POST /api/brain/run
POST /api/auto-close/scan, /sync-positions
POST /api/ib-bridge/control
POST /api/ib-flex-import, /ib-flex-sync
POST /api/ib-auto-sync
POST /api/positions/sync-ib, /import, /reconcile
POST /api/refresh-*, /api/enrich-*, /api/holdings/enrich
POST /api/telegram/test
```

### TIER 3: Bearer-only inline (`ytRequireToken()`)
```
POST /api/earnings/archive/upload
POST /api/earnings/archive/reextract
GET  /api/earnings/archive/fmp-transcript-list
GET  /api/earnings/archive/fmp-transcript
POST /api/earnings/archive/analyze/manual
POST /api/earnings/archive/analyze
POST /api/deep-dividend/run
POST /api/deep-dividend/upload-manual
POST /api/deep-dividend/backtest
DELETE /api/deep-dividend/delete
POST /api/deep-dividend/prompts
POST /api/smart-alerts/8k-scan
POST /api/smart-alerts/insider-cluster-scan
POST /api/smart-alerts/track-record-eval
POST /api/smart-alerts/ia-scan
POST /api/smart-alerts/ia-alerts/read-all
POST /api/digest/weekly/generate
POST /api/youtube/scan-channel (called from scan function, not top-level path)
POST /api/youtube/channels (POST)
DELETE /api/youtube/channels/:id
POST /api/youtube/scan-all-channels
GET  /api/youtube/pending
POST /api/youtube/upload-summary
POST /api/youtube/mark-error
GET  /api/youtube/should-process
POST /api/youtube/clear-process-request
POST /api/alert-rules/add (isAllowed+origin bypass)
POST /api/alert-rules/check
POST /api/alerts-check (no auth — see §5)
POST /api/alerts/read
POST /api/cantera/add (isAllowed+origin bypass)
PUT  /api/cantera/:id (isAllowed+origin bypass)
DELETE /api/cantera/:id (isAllowed+origin bypass)
POST /api/cantera/refresh (isAllowed+origin bypass)
POST /api/funds/refresh (isAllowed+origin bypass)
POST /api/funds/alerts/notify (isAllowed+origin bypass)
PATCH /api/positions/:ticker
DELETE /api/positions/:ticker
PUT  /api/positions/:ticker/notes
POST /api/earnings/briefing/refresh
POST /api/news/all (DELETE)
POST /api/news/refresh
POST /api/theses, /theses/:id/generate, /theses/generate-all
POST /api/library (POST, PUT, DELETE — no auth)
POST /api/agent-run
POST /api/research-agent
POST /api/research-agent/auto-scan
POST /api/preferences (POST)
POST /api/options/trades (POST, PUT, DELETE — isAllowed+origin)
POST /api/options/trades/bulk-import
POST /api/briefing/generate-summary (isAllowed+origin)
POST /api/push-subscribe (POST, DELETE)
POST /api/push-send (isAllowed+origin)
POST /api/currency/refresh (no auth)
POST /api/macro/refresh (no auth)
POST /api/scanner/toggle (no auth)
POST /api/scanner/filters (POST — no auth)
POST /api/scanner/copy-to-opus (no auth)
POST /api/journal/add, PUT /api/journal/:id/review (no auth)
POST /api/refresh-positions-fx (no auth)
POST /api/recommendations/log, /auto-review (no auth)
PUT  /api/recommendations/:id/review (no auth)
PATCH /api/auto-close/open-trades/:id
POST /api/auto-close/open-trades (no auth)
PATCH /api/fishing/orders/:id (no auth)
DELETE /api/fishing/orders/:id (no auth)
POST /api/oracle-verdict/upload-manual (no auth)
POST /api/reconcile/portfolio-check (Bearer)
POST /api/ib-bridge/executions/sync (proxied via ib-bridge auth at line 11485)
```

### TIER 4: IB Bridge X-AYR-Auth custom gate
```
GET  /api/ib-bridge/nav
GET  /api/ib-bridge/margin
GET  /api/ib-bridge/positions
GET  /api/ib-bridge/quotes
GET  /api/ib-bridge/option-chain
GET  /api/ib-bridge/iv
GET  /api/ib-bridge/executions
POST /api/ib-bridge/executions/sync
GET  /api/ib-bridge/historical
GET  /api/ib-bridge/control/status
POST /api/ib-bridge/control/stop
POST /api/ib-bridge/control/start
POST /api/ib-bridge/control/restart
```

---

## 4. Dead Endpoints

| Endpoint | Evidence | Recommendation |
|---|---|---|
| `POST /api/costbasis/sync-dividends` | Returns stub `{ deprecated: true }` at line 9280. Dead `if(false && ...)` block at 9283. | Delete the `if(false)` block (80 lines of dead code). The stub response at 9280 can stay or also be deleted. |
| `POST /api/scanner/run` | Returns `status: "skeleton"` at line 11942 — pipeline not implemented, explicitly labeled "Fase 2". | Leave as-is or delete. Frontend shows this to user. |
| `POST /api/scanner/copy-to-opus` | Reads from `scanner_snapshots` which are never written (scanner is skeleton). Always returns 404 "No candidates". | Dead until scanner is implemented. |
| `POST /api/ib-session` (GET) | Returns `{ ok: true, consumerKey }` — IB OAuth v2 session kept alive for legacy reasons; actual IB calls now go via ib-bridge. | Low risk to keep; consumerKey is not a secret. |
| `GET /api/ib-flex` | Returns raw Flex XML. Only useful as a debug endpoint — `POST /api/ib-flex-import` does the actual sync. Now properly protected by PROTECTED_READ. | Keep but review whether it should be fully removed. |

---

## 5. Additional Issues

### Bug: `ib-nlv-save` POST is not protected by PROTECTED_WRITE

`POST /api/ib-nlv-save` (line 12359) writes NLV data to `nlv_history`. It was added to `PROTECTED_READ` in this audit (which only protects GET). The `PROTECTED_WRITE` list does not include `/api/ib-nlv-save`. No inline auth check exists in the handler. An unauthenticated POST can inject fake NLV values.

**To patch:** Add `/api/ib-nlv-save` to `PROTECTED_WRITE`, or add an inline auth check.

### Inconsistency: `POST /api/alerts-check` — no auth (line 12902)

Accepts an array of `positions` in body and checks FMP dividend calendar for upcoming ex-dates. No auth required. This leaks which FMP symbols you're tracking (via positions in the request body), but the positions come from the caller, so it doesn't leak D1 data. Low risk.

### Inconsistency: `GET /api/dividendos/calendar.ics` — no auth (line 15721)

Returns an iCal file with 8000 dividend entries including dates, tickers, and amounts. This is sensitive financial data (same source as `/api/dividendos` which IS protected). It should be added to PROTECTED_READ or at minimum generate a secret URL parameter.

**Recommendation:** Add `/api/dividendos/calendar.ics` to PROTECTED_READ.

### Inconsistency: `GET /api/tastytrade/positions/:account` (line 9908) — not in PROTECTED_READ

`/api/tastytrade/positions` (root) is protected. But `GET /api/tastytrade/positions/` with a trailing account segment would not match the PROTECTED_READ entry because the check uses `path === p || path.startsWith(p + "?") || path.startsWith(p + "/")`. Actually, `startsWith("/api/tastytrade/positions/")` DOES match, so `/api/tastytrade/positions/SOME_ACCOUNT` is protected. Confirmed safe.

---

## 6. Duplicate Endpoints

| Group | Paths | Issue |
|---|---|---|
| Briefing duplicates | `GET /api/briefing/daily` and `GET /api/daily-briefing` (line 7743) | Two endpoints for daily briefing. `/api/daily-briefing` at 7743 appears to be an alias. Both return different data (one is full briefing, one is a lighter version). Not a true duplicate — different data shapes. Keep both. |
| Cost basis access | `GET /api/costbasis` and `GET /api/costbasis/all` | `/costbasis` returns per-ticker with summary. `/costbasis/all` is paginated full dump. Different purposes. Keep both. |
| Earnings archive analyze | `POST /api/earnings/archive/analyze` and `POST /api/earnings/archive/analyze/manual` | One triggers automated FMP+Claude pipeline, one accepts manual upload. Not a duplicate. |
| IB snapshot | `GET /api/ib-cached-snapshot` and `GET /api/ib-summary` | Both return NLV summary. `/ib-summary` calls live IB OAuth; `/ib-cached-snapshot` reads D1. Not a true duplicate (different sources). |
| Agent insights read | `GET /api/agent-insights` is read. `DELETE /api/agent-insights` also on line 17636 with no auth. Should be protected. | |

---

## 7. Cron Handler Summary

**File:** `export default { async scheduled(event, env, ctx) {...} }` (line 22316)

**Configured schedule:** `30 7 * * 1-5` (wrangler.toml `[triggers]` currently commented out as of 2026-04-08, but the handler code remains)

**What it does on `30 7 * * 1-5` tick:**
1. POSTs to `${IB_BRIDGE_URL}/flex/sync` with Bearer token + Flex token header. Timeout: 120s.
2. On failure: sends Telegram WARN message.
3. On success: fetches `/positions` from IB bridge, runs position reconcile vs D1, sends Telegram WARN if issues found.
4. POSTs to `/api/reentry-watch/scan?threshold=5&days=180&apply=1` with Bearer token. Timeout: 60s.

**Kill-switch:** Any other cron expression hits a `console.log + return` immediately (line 22425). LLM agent crons disabled 2026-04-19.

**Security note:** The cron self-calls `https://api.onto-so.com/api/reentry-watch/scan` via `Authorization: Bearer` (line 22413). This is a known-good pattern. No issues.

---

## 8. Applied Changes

**File modified:** `api/src/worker.js`

Added 11 missing entries to `PROTECTED_READ` at lines 3993–4006 (after existing entries):
```
"/api/ib-cached-snapshot"      // NLV + ib_shares + ib_avg_cost
"/api/ib-nlv-history"          // NLV time-series
"/api/ib-nlv-save"             // POST — guarded now but still needs PROTECTED_WRITE fix
"/api/ib-flex"                 // raw IB Flex XML with all trades
"/api/tax-report"              // realized gains + dividends by ticker
"/api/tax/optimization-report" // WHT drag by country
"/api/costbasis/all"           // all 8600+ trades
"/api/ingresos"                // salary + income
"/api/margin-interest"         // margin interest per account
"/api/stats"                   // wealth summary
"/api/fire"                    // FIRE projections
"/api/pl"                      // annual P&L
```

**Note:** `PROTECTED_READ` only catches GET requests (line 4006: `request.method === "GET"`). Write endpoint auth gaps are catalogued in `/scripts/audit-3-patches.txt` for manual application.

---

## 9. Priority Queue for Next Round

1. **(HIGH)** Add `PROTECTED_WRITE` entry or inline auth to `POST /api/ib-nlv-save`
2. **(HIGH)** Add auth to all dividend write paths (POST/PUT/DELETE /api/dividendos)
3. **(HIGH)** Add auth to all costbasis write paths (POST/DELETE /api/costbasis)
4. **(HIGH)** Add auth to all patrimonio write paths (POST/PUT/DELETE /api/patrimonio)
5. **(HIGH)** Add auth to all gastos write paths (POST/PUT/DELETE /api/gastos, /gastos/import-csv)
6. **(HIGH)** Add auth to POST /api/ingresos and POST /api/margin-interest
7. **(MEDIUM)** Add `/api/dividendos/calendar.ics` to PROTECTED_READ
8. **(MEDIUM)** Add auth to POST /api/scores/compute
9. **(MEDIUM)** Delete 80-line `if(false)` dead block at lines 9283–9315
10. **(LOW)** Add auth to DELETE /api/fundamentals, POST /api/library writes

Risky patches (SQL/code) in: `/scripts/audit-3-patches.txt`
