# Audit Overnight-2: API/UI Consistency — 2026-05-02

Scope: `frontend/src/` only. Worker read-only for cross-reference.

---

## Summary counts

| Category | Count |
|---|---|
| Home tabs in HOME_TAB_GROUPS | 49 |
| Home tabs rendered in HomeView | 49 |
| Analysis tabs in TABS | 18 |
| Analysis tabs in content dispatcher | 18 |
| Ghost endpoints (frontend → 404) | 0 |
| Ghost fields (frontend reads X, API omits X) | 0 confirmed |
| Dead lazy imports | 0 (WatchlistTab comment-removed; AccountabilityWidget/InstitutionalReportPDF/DiscoveryTab/DividendScannerTab are legitimate sub-components) |
| Analysis files not imported in App.jsx | 3 (AnalystScorecard, FGScoresPanel, SplitsTable — all sub-components of FastTab, NOT dead) |
| STALE hardcoded data | 1 (ActionPlanTab) |
| Auth issues | 1 (DailyBriefingTab digest/generate uses localStorage token, not VITE_AYR_TOKEN) |
| TDZ violations found | 0 |
| Bugs fixed this session | 0 (TTTab crash risk is guarded by `{account && <AccountPanel>}`) |

---

## Tab-by-tab status

### HOME TABS

| Tab ID | Component | Endpoint(s) | Status |
|---|---|---|---|
| action-plan | ActionPlanTab | none | OK — hardcoded data (stale, see note) |
| briefing | DailyBriefingTab | /api/briefing/daily, /api/briefing/generate-summary, /api/digest/weekly/latest, /api/digest/weekly/generate | PARTIAL — see auth issue below |
| portfolio | PortfolioTab | /api/scores, /api/five-filters, /api/oracle-verdict/batch, /api/fundamentals/bulk, /api/dividend-growth, /api/theses/missing | OK |
| open-options | OpenOptionsTab | /api/options/open-portfolio | OK — fields confirmed |
| tt | TTTab | /api/tastytrade/positions | OK — fields confirmed, account guard present |
| agentes | AgentesTab | /api/agent-run, /api/agent-run/status, /api/agents/prompts, /api/ai-analysis | OK |
| dashboard | DashboardTab | via HomeContext | OK |
| trades | TradesTab | /api/trades, /api/costbasis, /api/ib-bridge/executions/sync | OK |
| earnings | EarningsTab | /api/earnings/upcoming | OK |
| advisor | AdvisorTab | /api/screener, /api/ai-analyze, /api/ai-analyze-portfolio | OK |
| earnings-archive | EarningsArchiveTab | /api/earnings/archive/*, /api/earnings/archive/analyze | OK |
| deep-dividend | DeepDividendTab | /api/deep-dividend/list, /api/deep-dividend/dashboard, /api/deep-dividend/calibration, /api/deep-dividend/run | OK — fields confirmed |
| journal | DecisionJournalTab | /api/journal/list, /api/journal/add, /api/journal/stats | OK — uses `decisions` key correctly |
| peer-compare | PeerCompareTab | /api/peer-ratios | OK |
| analytics | AnalyticsTab | /api/analytics/* | OK |
| attribution | AttributionTab | /api/analytics/attribution | OK — uses `credentials: 'include'` + origin auth (correct pattern) |
| rebalance | RebalancingTab | via HomeContext | OK |
| historial | HistorialTab | via HomeContext | OK |
| alert-rules | AlertRulesTab | /api/alert-rules/list, /api/alert-rules/add, /api/alert-rules/check | OK |
| dividendos | DividendosTab | via HomeContext + /api/backtest/safety-vs-cuts | OK |
| opt-optimizer | OptionsOptimizerTab | /api/options/optimizer | OK — fields confirmed |
| opciones-cs/roc/rop/leaps/resumen/orphans | OpcionesTab | /api/options/meta, /api/options/trades, /api/options/summary, /api/options/reconcile/orphans | OK — fields confirmed |
| income | IncomeTab (CoveredCallsTab + IncomeLabTab) | /api/prices, /api/ib-bridge/* | OK |
| scanner | ScannerTab | /api/scanner/state, /api/scanner/toggle | PARTIAL — candidate data is MOCK (intentional, Fase 2). State toggle works. |
| auto-trading | AutoTradingTab | /api/auto/strategies, /api/auto/backtest, /api/auto/daily-pesca, /api/auto-close/open-trades, /api/auto-close/alerts, /api/brain/decisions, /api/brain/run, /api/fishing/orders, /api/fishing/scan | OK — all endpoints return 200 with correct method, fields confirmed |
| gastos | GastosTab | via HomeContext + /api/gastos/import-csv | OK |
| presupuesto | PresupuestoTab | /api/presupuesto, /api/presupuesto/alerts, /api/presupuesto/cat-order | OK |
| nomina | NominaTab | via HomeContext | OK |
| transferencias | TransferenciasTab | /api/transferencias | OK |
| patrimonio | PatrimonioTab | via HomeContext + /api/ib-nlv-history | OK |
| fire | FireTab | via HomeContext | OK |
| drip | DripTab | via HomeContext | OK |
| forecast | ForecastTab | via HomeContext | OK |
| tax-opt | TaxOptimizationTab | /api/tax/optimization-report | OK |
| macro | MacroTab | /api/macro/refresh, /api/macro/upcoming | OK |
| currency | CurrencyTab | /api/currency/exposure, /api/currency/refresh | OK |
| news | NewsTab | /api/news/refresh, /api/news/all | OK |
| screener | ScreenerTab | /api/screener | OK |
| cantera | CanteraTab | /api/cantera/*, /api/discovery/* (sub-tabs) | OK |
| cartas-sabios | CartasSabiosTab | /api/smart-alerts/insider-clusters, /api/smart-alerts/8k-events, /api/smart-alerts/cross-validation-conflicts | OK |
| research | ResearchTab | /api/preferences/ui_research_custom_lists | OK — handled by startsWith(/api/preferences/) wildcard |
| smart-money | SmartMoneyTab | /api/funds/* | OK |
| videos-youtube | YouTubeTab | /api/youtube/* | OK |
| library | LibraryTab | /api/library | OK |
| track-record | AlertTrackRecordTab | /api/alert-track-record | OK |
| research-agent | ResearchAgentTab | /api/research-agent, /api/research-agent/list, /api/research-agent/auto-scan | OK |

### ANALYSIS TABS

| Tab ID | Component | Key endpoints | Status |
|---|---|---|---|
| dash | DashTab | AnalysisContext | OK |
| chart | ChartTab | AnalysisContext + /api/price-history | OK |
| claude | ClaudeTab | /api/claude, /api/theses | OK |
| data | DataTab | AnalysisContext | OK |
| qualityAll | QualityTab + GrowthTab + Big5Tab | AnalysisContext | OK |
| debt | DebtTab | AnalysisContext + /api/debt-maturity | OK |
| divAll | DividendsTab + WeissTab | AnalysisContext | OK |
| valAll | ValuationTab + DCFTab + MOSTab + FastGraphsTab + TenCapTab + PaybackTab | AnalysisContext | OK |
| fast | FastTab | /api/fg-history | OK |
| verdict | ChecklistTab + ScoreTab | AnalysisContext | OK |
| report | ReportTab | /api/report | OK |
| dst | DSTTab | AnalysisContext | OK |
| options | OptionsChainTab | /api/options-chain | OK |
| transcript | TranscriptTab | /api/earnings/archive/analyze | OK |
| archive | ArchiveTab | /api/earnings/archive/* | OK |
| business | BusinessModelTab | AnalysisContext | OK |
| tesis | TesisTab | /api/theses | OK |
| cost-basis | CostBasisView | /api/costbasis/all | OK |

---

## Issues found

### HIGH — DailyBriefingTab: `digest/weekly/generate` uses wrong token

**File:** `frontend/src/components/home/DailyBriefingTab.jsx` line 153

```js
const token = localStorage.getItem('ayr_worker_token') || '';
fetch(`${API_URL}/api/digest/weekly/generate`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, ... }
})
```

The endpoint `/api/digest/weekly/generate` uses `ytRequireToken()` which checks `Authorization: Bearer <env.AYR_WORKER_TOKEN>`. The frontend reads from `localStorage.getItem('ayr_worker_token')` — a key that is never set anywhere in the codebase. `VITE_AYR_TOKEN` is injected differently (monkey patch, not localStorage). The monkey patch is bypassed here because the `Authorization` header IS present (even with empty value).

**Effect:** The "Generar Digest" button always returns 401 for all users.

**Fix (risky — don't auto-apply):** Change to use the monkey-patched X-AYR-Auth pattern: remove the explicit `Authorization` header and let the monkey patch inject `X-AYR-Auth: VITE_AYR_TOKEN`. OR populate `ayr_worker_token` in localStorage during app init from `VITE_AYR_TOKEN`. Requires understanding of whether `AYR_WORKER_TOKEN` on the backend is the same secret as `VITE_AYR_TOKEN`.

### MEDIUM — ActionPlanTab: entirely hardcoded from April 2026 sector deep-dives

**File:** `frontend/src/components/home/ActionPlanTab.jsx` line 10

```js
const DEEP_DIVE_DATE = '2026-04-18';
const ACTIONS = [ /* 47 hardcoded action items */ ]
```

This is the FIRST tab users see (top of Cartera group). The data is 2 weeks old. The CLPR-exit recommendation, VICI/NNN pivots, etc. are all from one specific date and will never update.

**Fix (risky — don't auto-apply):** This component needs an API endpoint like `/api/recommendations/list` (which exists) to dynamically source its data, or a manual update trigger. Currently `recommendations/list` returns a different schema. Not a crash risk — just stale information.

### LOW — ScannerTab: MOCK candidate data shown as real

**File:** `frontend/src/components/home/ScannerTab.jsx` lines 65-400

The tab renders 5 hardcoded MOCK_CANDIDATES (KO, PEP, etc.) with fabricated IV, score, and premium data. The comment says "All mock. Replace with real IB-bridge / FMP calls in the wiring phase." The scanner state toggle IS wired to the real API.

**Risk:** If a user trusts the scanner candidate data to make trades, they are using fabricated data. UI has no visual "DEMO/MOCK" warning.

**Fix (low priority):** Add a `⚠️ Datos simulados — Fase 2 pendiente` banner at the top of the candidate list.

---

## Ghost endpoints: NONE

All frontend API calls resolve to existing worker routes. The one apparent ghost (`/api/preferences/ui_research_custom_lists`) is handled by the wildcard `startsWith("/api/preferences/")` GET handler in worker.js.

---

## Ghost fields: NONE confirmed

All field reads cross-checked against live API responses:
- `options/open-portfolio` → positions and kpis fields match
- `tastytrade/positions` → accounts, by_account, position fields match
- `auto/daily-pesca` → market, candidates, user_pattern, defense_rules_applied match
- `auto-close/open-trades` → trades array fields match
- `deep-dividend/list` → rows fields match
- `options/optimizer` → summary, covered_calls fields match
- `options/meta` → years, underlyings, statuses, accounts match
- `journal/list` → decisions key used correctly (not `entries`)
- `briefing/daily` → destructured fields match response

---

## Dead code: NONE

All files in `home/` and `analysis/` are either:
- Lazily imported and conditionally rendered
- Used as sub-components within another tab (AccountabilityWidget in AgentesTab, InstitutionalReportPDF in DeepDividendTab, DiscoveryTab/DividendScannerTab in CanteraTab, AnalystScorecard/FGScoresPanel/SplitsTable in FastTab)
- Legitimately removed (WatchlistTab commented out with explanation)

---

## New user crash risk

**Risk level: LOW** — `safeFetch` in `data.js` never throws, always returns the fallback value. All tabs have loading/error states. The only tabs that could show a non-informative blank state are those guarded by `if (!data) return null` without an error display — but this only occurs when the API returns a valid empty response, not on errors.

---

## TDZ audit: PASS

Checked DailyBriefingTab, TTTab, AutoTradingTab, OpenOptionsTab, OptionsOptimizerTab, DecisionJournalTab. All `useState`/`useRef`/`useCallback` declarations appear BEFORE any `useEffect` that references them. No violations found.

---

## Applied safe fixes

None applied. All identified issues fall in "risky" category (auth token wiring, hardcoded data strategy, mock data UX label). Listed above for user decision.

