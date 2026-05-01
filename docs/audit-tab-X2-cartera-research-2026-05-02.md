# Audit X2 — Cartera Research/Analytics Tabs (2026-05-02)

## Scope
Deep audit of 8 tabs in the Cartera group (research/analytics):
1. `deep-dividend` → `DeepDividendTab.jsx` (1196L)
2. `journal` → `DecisionJournalTab.jsx` (771L)
3. `peer-compare` → `PeerCompareTab.jsx` (197L)
4. `analytics` → `AnalyticsTab.jsx` (583L)
5. `attribution` → `AttributionTab.jsx` (414L)
6. `rebalance` → `RebalancingTab.jsx` (816L)
7. `historial` → `HistorialTab.jsx` (51L)
8. `alert-rules` → `AlertRulesTab.jsx` (620L)

Total ~4,648 lines of frontend code reviewed against ~28K-line worker.js.

---

## CRITICAL — Auth Vulnerabilities

### Most severe finding: Multiple endpoints leak/mutate data without auth

The worker has a centralized auth gate in `worker.js:3960-4030` (lines `PROTECTED_READ` and `PROTECTED_WRITE`), but several research/analytics endpoints are NOT in either list. Tested cross-origin (Origin: evil.com, no token):

| Endpoint | Method | HTTP | Result |
|---|---|---|---|
| `/api/journal/list` | GET | 200 | LEAKS all decision journal entries |
| `/api/journal/stats` | GET | 200 | LEAKS hit-rate / conviction stats |
| `/api/journal/add` | POST | 200 | INSERTED row id=3 (TEST/BUY) — no token required |
| `/api/journal/:id/review` | PUT | (not tested) | Likely vulnerable — same pattern |
| `/api/deep-dividend/list` | GET | 200 | LEAKS 94 rows of analyses |
| `/api/deep-dividend/dashboard` | GET | 200 | LEAKS verdicts/scores |
| `/api/deep-dividend/get` | GET | 200 | LEAKS full analysis JSON |
| `/api/deep-dividend/calibration` | GET | 200 | LEAKS hit-rate by verdict |
| `/api/deep-dividend/extractions` | GET | 200 | LEAKS extracted text |
| `/api/deep-dividend/delete` | DELETE | 200 | DELETED id=9999 (returned `{"deleted":9999}`) — destructive op no auth |
| `/api/alert-rules/list` | GET | 200 | LEAKS alert rules with thresholds |

Confirmed by curl. Sample leaked entry: `{id:1, ticker:"KO", thesis_1:"Yield 3.2% con 62 años...", target_price:80}`.

A test entry (id=3, ticker:"TEST", action:"BUY") was inserted via cross-origin POST and remains in production. **Recommend manual cleanup**: `DELETE FROM decision_journal WHERE id=3`.

### Endpoints CORRECTLY auth-gated (verified curl)
- `/api/analytics/correlation` — 401 without token (uses `_auth = isAllowed && origin ? null : ytRequireToken()`)
- `/api/analytics/factors` — 401 without token
- `/api/analytics/stress-test` — 401 without token
- `/api/analytics/attribution` — 401 without token
- `/api/alert-rules/check` (POST) — 401
- `/api/alert-rules/add` (POST) — 401
- `/api/alert-rules/:id` (DELETE) — 401

### Action required (NOT applied — needs review before deploy)
Add to `PROTECTED_READ` in `worker.js:3975`:
```
"/api/journal",
"/api/deep-dividend",
"/api/alert-rules",
```
And ensure the `_attrAuth`-style same-origin bypass is added to:
- `/api/journal/add`, `/api/journal/list`, `/api/journal/stats`, `/api/journal/:id/review`
- `/api/deep-dividend/list`, `/api/deep-dividend/get`, `/api/deep-dividend/dashboard`, `/api/deep-dividend/calibration`, `/api/deep-dividend/extractions`, `/api/deep-dividend/delete`
- `/api/alert-rules/list`

The pattern used elsewhere is correct: `const _auth = (isAllowed && origin) ? null : ytRequireToken(request, env); if (_auth) return _auth;` at the top of each handler. This permits the same-origin browser path while requiring tokens for everything else.

---

## Tab-by-tab review

### 1. DeepDividendTab.jsx (1196L)
**Endpoints**: 7 GET (dashboard, list, calibration, briefing, smart-alerts/8k, /insider-clusters, /cross-validation-conflicts), 2 mutating (run POST, get GET, delete DELETE — only run POST is auth-gated).

**Issues**:
- **Dead imports**: `useMemo`, `useRef` imported (line 13), 0 usages in file. **FIXED**.
- Silent catches: line 1040 (`catch {}`), line 1062 (alert pero sin telemetry).
- Auth: critical vuln above (4 GET endpoints unauthed).
- Fields displayed (`composite_score`, `safety_score`, `growth_score`, `honesty_score`, `verdict`, `confidence`, `cut_probability_3y`, `red_flags_count`) match `/api/deep-dividend/list` schema verified.
- No hardcoded data.

### 2. DecisionJournalTab.jsx (771L)
**Endpoints**: `/api/journal/list?status=all`, `/api/journal/stats`, `/api/journal/add` (POST), `/api/journal/:id/review` (PUT).

**Issues**:
- All endpoints lack auth gates (CRITICAL above).
- Comment line 580-581 says "silent — will retry on next visit" — silent catch in loadDecisions.
- Hook order: state declared before effects. TDZ-safe.
- Fields displayed (`decision_date`, `ticker`, `action`, `shares`, `price`, `thesis_1/2/3`, `target_price`, `stop_price`, `time_horizon`, `conviction`, `review_result`, `review_notes`) match `/api/journal/add` schema.
- DELETE button (`onDelete`) not implemented — appears `removeFromState` only, no API call.
- No hardcoded data.

### 3. PeerCompareTab.jsx (197L)
**Endpoints**: `/api/deep-dividend/list` (read-only).

**Issues**:
- **Dead import**: `fDol` imported from formatters (line 3), 0 usages. **FIXED**.
- Silent catch line 27 (`.catch(() => {})`) — no telemetry.
- Reads `POS_STATIC` from HomeContext to enumerate tickers. Correct.
- Fields displayed match (`composite_score`, `safety_score`, `growth_score`, `honesty_score`, `verdict`, `confidence`, `red_flags_count`, `green_flags_count`).
- Cross-tab dup: shares the `/api/deep-dividend/list` call with DeepDividendTab — could be cached but not a bug.

### 4. AnalyticsTab.jsx (583L)
**Endpoints**: `/api/analytics/correlation`, `/api/analytics/factors`, `/api/analytics/stress-test?scenario=` (3 sub-tabs).

**Issues**:
- **Dead code**: in `forceReload()` line 372-376: `const orig = fetch; void orig;` — useless. **FIXED**.
- Auth: same-origin bypass correctly enforced; cross-origin returns 401 verified curl.
- Hook ordering OK. `useEffect` after `useState`.
- Fields match endpoint shape (`tickers`, `matrix_rows`, `high_corr_pairs`, `unexpected_correlations`, `clusters`, `stats`, `portfolio_factors`, `tilts`, `per_ticker`, `summary`, `underperformers`, `all_holdings`).
- Comment line 56-58 says backend bypasses for same-origin — verified.
- Non-blocking: `setError(e.message)` on fetch failure — visible but no telemetry.

### 5. AttributionTab.jsx (414L)
**Endpoints**: `/api/analytics/attribution?period=ytd|3m|6m|12m`.

**Issues**:
- Auth correct (verified 401 cross-origin).
- Fields displayed match: `summary`, `period_start`, `by_sector`, `by_currency`, `by_strategy`, `top_contributors`, `top_detractors`, `all_holdings`, `computed_at`. Verified against worker code.
- Hook ordering OK.
- Non-blocking: silent catch on fetch error (line 224 `setError(e.message)` — at least visible).
- Note: `data.scenario.spyReturn` referenced in StressView (AnalyticsTab line 452-454) but the worker's `/api/analytics/stress-test` returns `data.summary.spy_return` and `data.scenario.spyReturn` — risk of mismatch. Only a UI rendering "—" if undefined.

### 6. RebalancingTab.jsx (816L)
**Endpoints**: `/api/analytics/attribution?period=ytd` (read-only, optional).

**Issues**:
- **Hardcoded data**: `DEFAULT_SECTORS` (line 45-57, 11 sectors with current/target %) and `DEFAULT_ACTIONS` (line 60-97, 25 buy/sell rec). This is INTENTIONAL (pre-populated from sector dives April 2026; comment line 1-3 documents it). The tab fetches live sector weights and overlays.
- Issue: when `liveDataStatus === 'error'`, hardcoded `current` values shown. The status pill says "Pesos estaticos (API no disponible)" — UX honest.
- Hook order TDZ-safe (line 644 comment notes it).
- Issue line 285-287: `cashGenerated` accumulates as POSITIVE for sells, but in IB Order helpers line 22 `${a.side},,${a.ticker},...` outputs CSV with empty Qty — user must fill before importing. Documented.
- Tax estimate hardcoded 20% CGT (line 291) — note user's a China resident, this is US/Spain placeholder.
- LocalStorage keys: `rebalance_targets_v1`, `rebalance_actions_v1`, `rebalance_subtab_v1`, `rebalance_nlv_v1` — versioned correctly.
- Live attribution fetch silent on AbortError (correct pattern).

### 7. HistorialTab.jsx (51L)
**Endpoints**: NONE (reads `historialList` from HomeContext only).

**Issues**:
- Tiny tab, just renders `historialList` array. No bugs.
- No auth concerns.
- Ticker handling: `h.ticker.slice(0, 4)` for logo placeholder — handles long foreign tickers (HKG:9618).

### 8. AlertRulesTab.jsx (620L)
**Endpoints**: `/api/alert-rules/list` (GET, vulnerable above), `/api/alert-rules/add` (POST, ok), `/api/alert-rules/:id` (PUT, DELETE — ok), `/api/alert-rules/check` (POST, ok).

**Issues**:
- `/api/alert-rules/list` GET lacks auth (CRITICAL above).
- Inconsistency: `Authorization: Bearer ${token}` passed to POST/PUT (lines 107, 268). DELETE does NOT pass it (line 253-255). Works only because `main.jsx` adds `X-AYR-Auth` automatically. If monkey-patch breaks, DELETE 401s silently.
- POST `/api/alert-rules/check` (line 449-450) also missing explicit Authorization. Same monkey-patch dependency.
- Validation in worker: VALID_TYPES set (line 13108) matches frontend `RULE_TYPES` array (line 9-18). OK.
- Fields displayed (`ticker`, `rule_type`, `threshold`, `unit`, `status`, `triggered_count`, `triggered_at`, `message`) all in worker schema.
- Hook order TDZ-safe.

---

## Cross-tab observations

### Code reuse / dup
- 7 tabs (all except HistorialTab) duplicate the auth-token-from-localStorage pattern. Could be lifted to a shared hook `useAuthToken()` or interceptor.
- `API_URL` import + `fetch(\`${API_URL}/api/...\`)` pattern repeats 30+ times. Could be a shared `apiFetch()` helper that adds X-AYR-Auth and `credentials:'include'` consistently. The monkey patch in `main.jsx` already does it, but explicit beats implicit.
- Loading spinner / error box components are re-implemented in AnalyticsTab + AttributionTab + AlertRulesTab + DecisionJournalTab. ~150 lines of dup style markup.
- Format helpers `fmt$`, `fmtPct`, `pnlColor`, `retColor` repeated across AnalyticsTab + AttributionTab + RebalancingTab. `frontend/src/utils/formatters.js` exists; some are duplicated locally instead of imported.

### Silent catches found
- DeepDividendTab.jsx:1040 — `} catch {}` in `openDrill` — failure to load drill data → user sees blank modal.
- DeepDividendTab.jsx:7× catch chains in `Promise.all` (line 1007-1013) — each `.catch(() => null)` swallows network errors.
- PeerCompareTab.jsx:27 — `.catch(() => {})` — score data fail → empty chips.
- DecisionJournalTab.jsx:580 — `} catch {}` in `loadDecisions` — comment says "silent — will retry on next visit".
- AlertRulesTab.jsx:114, 423, 454 — at least logs `setError(err.message)` (not silent).
- RebalancingTab.jsx:418 — clipboard fallback (acceptable, has alternate path).

### Hook order / TDZ
All tabs declare `useState` before `useEffect`. No TDZ risks detected.

### Authentication summary
| Tab | All endpoints gated? |
|---|---|
| deep-dividend | NO — 6 GET endpoints + DELETE all unauthed |
| journal | NO — 4 endpoints all unauthed |
| peer-compare | NO — depends on deep-dividend/list |
| analytics | YES — same-origin bypass + token fallback |
| attribution | YES |
| rebalance | YES (uses analytics/attribution) |
| historial | N/A (no API) |
| alert-rules | PARTIAL — list GET unauthed, mutations ok |

---

## Safe fixes APPLIED in this audit

1. `frontend/src/components/home/DeepDividendTab.jsx` line 13: removed `useMemo`, `useRef` (unused).
2. `frontend/src/components/home/PeerCompareTab.jsx` line 3: removed `fDol` (unused).
3. `frontend/src/components/home/AnalyticsTab.jsx` line 372-376: removed dead `const orig = fetch; void orig;` lines in `forceReload()`.

**No console.error were added** (the existing silent catches were left for the auth-gates fix to address holistically; adding noisy console.error to dozens of catch blocks belongs to the `logEvent` central refactor mentioned in CLAUDE.md v4.3 pendientes).

## Fixes NOT applied (need user decision)

1. **CRITICAL — Add 11 endpoints to PROTECTED_READ + add same-origin bypass on POST/PUT/DELETE** in `worker.js`. Requires worker deploy + careful regression test (frontend monkey-patch needs to keep working).
2. Manual cleanup of injected test row: `DELETE FROM decision_journal WHERE id=3;` against the D1 prod DB (created during audit by cross-origin POST).
3. Add explicit `Authorization: Bearer ${token}` to AlertRulesTab DELETE + check POST (defense in depth, not relying on monkey patch).
4. Refactor: shared `apiFetch()` helper with auth + error logging — 30+ call sites. Belongs to a separate task.
5. Refactor: extract `LoadingSpinner`, `ErrorBox`, `Section`, `Stat`, `BarChart` to shared `ui/` modules — 150+ lines dup.

## Key file paths
- `/Users/ricardogarciaontoso/IA/AyR/frontend/src/components/home/DeepDividendTab.jsx`
- `/Users/ricardogarciaontoso/IA/AyR/frontend/src/components/home/DecisionJournalTab.jsx`
- `/Users/ricardogarciaontoso/IA/AyR/frontend/src/components/home/PeerCompareTab.jsx`
- `/Users/ricardogarciaontoso/IA/AyR/frontend/src/components/home/AnalyticsTab.jsx`
- `/Users/ricardogarciaontoso/IA/AyR/frontend/src/components/home/AttributionTab.jsx`
- `/Users/ricardogarciaontoso/IA/AyR/frontend/src/components/home/RebalancingTab.jsx`
- `/Users/ricardogarciaontoso/IA/AyR/frontend/src/components/home/HistorialTab.jsx`
- `/Users/ricardogarciaontoso/IA/AyR/frontend/src/components/home/AlertRulesTab.jsx`
- `/Users/ricardogarciaontoso/IA/AyR/api/src/worker.js` lines 3960-4030 (auth gate config), 7142-7570 (deep-dividend handlers), 13069-13300 (alert-rules handlers), 20787-22300 (analytics + journal handlers).
