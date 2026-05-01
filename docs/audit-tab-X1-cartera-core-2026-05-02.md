# Audit X1 — Cartera Core (7 tabs)

**Fecha**: 2026-05-02
**Working dir**: `/Users/ricardogarciaontoso/IA/AyR`
**Scope**: 7 tabs del grupo Cartera (action-plan / briefing / portfolio / dashboard / trades / earnings / advisor)
**Token usado**: `8cdc875…484fb0f13` contra `https://api.onto-so.com`

---

## TL;DR

| Tab | Status | Endpoints OK | Problemas críticos |
|---|---|---|---|
| action-plan | OK | n/a (estático) | localStorage-only, 0 bugs |
| briefing | OK | 4/4 200 | Solapamiento con earnings/portfolio |
| portfolio | OK | 6/6 200 | 5 silent network catches (parcial fix aplicado) |
| dashboard | OK | 3/3 200 | Solapamiento con earnings + briefing |
| trades | OK | 4/4 (3 tras auth) | 1 catch sync silencioso |
| earnings | OK | 4/4 200 | n/a |
| advisor | OK | 3/3 200 | 1 import muerto `n` (FIX aplicado) |

**Verde general**: ningún tab está roto; los datos se renderizan.
**Rojo**: 3 zonas de duplicación de datos cross-tab.
**Aplicados**: 4 fixes seguros (1 dead import + 3 console.error).

---

## Por tab

### 1) ActionPlanTab (`action-plan`)

**Status**: ✅ **OK** — 100% data hardcoded ahora.

**Componente**: `frontend/src/components/home/ActionPlanTab.jsx` (1221 líneas)

**Endpoints API**: ninguno. Todo en constante `ACTIONS` (planes extraídos de los 9 sector deep-dives 2026-04-18) y `localStorage` (`action_plan_status_v1`).

**Data sources**:
- ACTIONS array hardcoded (38+ acciones BUY/SELL/TRIM)
- `localStorage.action_plan_status_v1` → estado por id
- `navigator.clipboard.writeText` (con fallback `document.execCommand('copy')`)
- CSV export blob

**Hardcoded data**:
- ACTIONS list (extracted 2026-04-18). Incluye CLPR, FLO, JNJ, MSFT, JPM, etc.
- Triggers, filters {business, moat, management, valuation}, devilsAdvocate, invalidation

**Issues**:
- **Stale**: actions extraídas 2026-04-18 (hace 2 semanas). Para producción debería leerse de D1 o de un endpoint `/api/action-plan` (no existe).
- localStorage en todos los handlers tiene catches silenciosos en operaciones idempotentes (acceptable).
- `navigator.clipboard.writeText().catch(() => { try { … } catch {} })` — fallback típico en non-secure contexts (acceptable).

**Bugs encontrados**: ninguno.

**Fix aplicado**: ninguno (todo OK).

---

### 2) DailyBriefingTab (`briefing`)

**Status**: ✅ **OK**.

**Componente**: `frontend/src/components/home/DailyBriefingTab.jsx` (772 líneas)

**Endpoints API**:
- `GET /api/briefing/daily` → HTTP 200, 6424 bytes (incluye portfolio.nlv_history, market, top_movers, critical_alerts, upcoming_earnings, new_filings, upcoming_dividends, pending_actions, research_investigations, cantera_today)
- `POST /api/briefing/generate-summary` (Opus generación on-demand)
- `GET /api/digest/weekly/latest` → HTTP 200, 6823 bytes
- `POST /api/digest/weekly/generate` (Opus + token Bearer explícito)

**Data sources**:
- Backend (D1 + cron + cache)
- VITE_AYR_TOKEN para llamada a generate (porque se hace en POST con Authorization Bearer, monkey-patch lo respeta)

**Hardcoded data**:
- Verdict colors (ADD/SELL/TRIM/HOLD)
- greetingByHour helpers

**Issues**:
- **Solapamiento** con EarningsTab: usa `upcoming_earnings` del briefing (una versión recortada).
- **Solapamiento** con DashboardTab: usa `portfolio.nlv_history` derivado del mismo origen que /api/ib-nlv-history, pero servidos por endpoints distintos.
- 1 catch silencioso (línea 752) sobre `localStorage.setItem` + `dispatchEvent` (acceptable).

**Auth**: `/api/briefing/daily` es público GET (`isAllowed && origin` + fallback ytRequireToken; en práctica abierto desde browser). `/api/digest/weekly/generate` requiere ytRequireToken — el componente añade `Authorization: Bearer` explícitamente con `VITE_AYR_TOKEN`.

**Bugs encontrados**: ninguno crítico.

---

### 3) PortfolioTab (`portfolio`)

**Status**: ✅ **OK**.

**Componente**: `frontend/src/components/home/PortfolioTab.jsx` (1274 líneas)

**Endpoints API**:
- `GET /api/scores` → HTTP 200, 115822 bytes (Q+S scores)
- `GET /api/five-filters` → HTTP 200, 22450 bytes (Filters scores + composite)
- `GET /api/oracle-verdict/batch?tickers=…` → HTTP 200, 1211 bytes (verdicts)
- `GET /api/theses/missing?min_weight=0.5` → HTTP 200, 1413 bytes
- `POST /api/theses/{ticker}/generate` (Opus on-demand)
- `POST /api/fundamentals/bulk` (sólo refresh manual)
- `GET /api/dividend-growth?tickers=…` (DGR 1/3/5/10y)

**Data sources**:
- HomeContext (`portfolioList`, `portfolioTotals`, `ibData`) — viene de `fetchAllData` global
- `localStorage`: ALERTS_KEY, COLS_KEY, FUND_CACHE_KEY, COL_WIDTH_KEY, ALERTS_KEY, sort settings
- `sessionStorage` 4h TTL: QS_CACHE_KEY, FF_CACHE_KEY, ORACLE_CACHE_KEY (10 min)

**Hardcoded data**:
- COL_DEFS (columns config) — 30+ columns
- SECTOR_COLORS map
- Default columns list

**Issues**:
- 5 catches silenciosos sobre fetch (theses/missing, theses/generate, /api/scores, /api/five-filters, /api/oracle-verdict/batch). **APLICADO FIX**: añadido `console.error` con prefix `[PortfolioTab]` y `[ThesisCoverage]`.
- Otros catches alrededor de `localStorage.setItem` / `sessionStorage.setItem` / `JSON.parse` son safe (storage cuotas/estado privado de browser).

**Bugs encontrados**: ninguno crítico.

**Fix aplicado**:
- Línea 202: `} catch {}` → `} catch (e) { console.error('[ThesisCoverage] reload failed:', e); }`
- Línea 204: `} catch {}` → `} catch (e) { console.error('[ThesisCoverage] initial fetch failed:', e); }`
- Línea 215: `} catch {}` → `} catch (e) { console.error('[ThesisCoverage] generate failed for', t, ':', e); }`
- Línea 353: `} catch {}` → `console.error('[PortfolioTab] /api/scores failed:', e);`
- Línea 381: `} catch {}` → `console.error('[PortfolioTab] /api/five-filters failed:', e);`
- Línea 415: `} catch {}` → `console.error('[PortfolioTab] /api/oracle-verdict/batch failed:', e);`

---

### 4) DashboardTab (`dashboard`)

**Status**: ✅ **OK**.

**Componente**: `frontend/src/components/home/DashboardTab.jsx` (1388 líneas)

**Endpoints API**:
- `GET /api/ib-nlv-history?limit=90` → HTTP 200, 2134 bytes (timeseries)
- `GET /api/price-history?symbol=SPY&from=…` → HTTP 200, 17310 bytes (FMP-pass-through)
- `GET /api/earnings-batch?symbols=…` → HTTP 200, 776 bytes (FMP-pass-through, batch)
- `GET /api/price-history?symbol={ticker}&from=…` (correlation matrix, on-demand)

**Data sources**:
- HomeContext (todos: portfolioTotals, portfolioList, GASTOS_*, FIRE_PROJ, FI_TRACK, INCOME_DATA, DIV_BY_YEAR, DIV_BY_MONTH, MARGIN_INTEREST_DATA, ANNUAL_PL, ibData)
- Hooks especializados: `useFireMetrics`, `useFxRates`, `useNetLiquidationValue`, `useMonthlyExpenses`

**Hardcoded data**:
- Cero. Todo deriva de contexto + endpoints.

**Issues**:
- **Solapamiento** con DailyBriefingTab: ambos pintan NLV history. DashboardTab fetch directo a `/api/ib-nlv-history`, mientras DailyBriefingTab obtiene `nlv_history` precomputado en `/api/briefing/daily`. Resultado: 2 round-trips si el usuario abre ambos.
- **Solapamiento** con EarningsTab: ambos pintan upcoming earnings. DashboardTab usa `/api/earnings-batch` (FMP pass-through con epsActual/Estimated), EarningsTab usa `/api/earnings/upcoming` (D1 con importance/portfolio_weight_pct). Datos NO coinciden 1:1 (DashboardTab simplemente lista las próximas, EarningsTab las puntúa por peso de cartera).
- Catch silencioso en correlation fetch (línea 130): tiene `console.warn` ya, OK.

**Bugs encontrados**: ninguno crítico.

**Fix aplicado**: ninguno.

---

### 5) TradesTab (`trades`)

**Status**: ✅ **OK**.

**Componente**: `frontend/src/components/home/TradesTab.jsx` (259 líneas)

**Endpoints API**:
- `POST /api/ib-bridge/executions/sync` → requiere `X-AYR-Auth: VITE_AYR_BRIDGE_AUTH` (HTTP 401 sin auth)
- `POST /api/ib-auto-sync` → requiere AYR_WORKER_TOKEN (HTTP 401 sin auth)
- `POST /api/costbasis/sync-dividends` → HTTP 200 (ENDPOINT NO PROTEGIDO — puede ser intencional, sync de div is idempotent)
- `GET /api/costbasis/all?…` → HTTP 200, 2518 bytes
- `GET /api/costbasis` → HTTP 200, 194444 bytes (summary por ticker)

**Data sources**:
- HomeContext (`tradesData`, `tradesFilter`, `tradesPage`)
- `localStorage`: `trades_last_sync` (auto-sync inteligente cada 30 min)

**Hardcoded data**:
- Year selector hardcoded: `2026, 2025, 2024, 2023, 2022, 2021, 2020`
- typeColors / typeLabels maps

**Issues**:
- **Catch silencioso** en sync IB bridge (línea 35): `try { … } catch { /* bridge offline → seguimos con OAuth+Flex */ }` — comentado y aceptable (degradación graceful).
- **Catch silencioso** en `useEffect` auto-sync (línea 82): `.catch(() => { /* silent */ })` — aceptable (auto-background, no debería interrumpir).
- **/api/costbasis/sync-dividends sin auth** — devuelve HTTP 200 sin token. **POSIBLE GAP DE SEGURIDAD**: cualquiera puede ejecutar el endpoint. Como es idempotent (re-ejecuta el sync → no añade dupes con UNIQUE), riesgo bajo pero documentar.

**Bugs encontrados**: 1 menor (auth no obligado en `/api/costbasis/sync-dividends`).

**Fix aplicado**: ninguno.

---

### 6) EarningsTab (`earnings`)

**Status**: ✅ **OK**.

**Componente**: `frontend/src/components/home/EarningsTab.jsx` (544 líneas)

**Endpoints API**:
- `GET /api/earnings/upcoming?days=30` → HTTP 200, 3386 bytes (counts + items[].importance/portfolio_weight_pct)
- `GET /api/earnings/post` → HTTP 200, 64 bytes (since/until/count/items)
- `POST /api/earnings/briefing/refresh` (refresh global)
- `GET /api/earnings/briefing/{ticker}` (modal detalle)

**Data sources**:
- Backend D1 + cron daily + portfolio weight join
- Sólo state local. NO usa HomeContext.

**Hardcoded data**:
- IMPORTANCE_COLOR / IMPORTANCE_LABEL maps
- daysLabel helper

**Issues**:
- `recent` actualmente devuelve `count: 0, items: []` (no hay earnings recientes en últimos 7 días). Comportamiento esperado.
- En `fetchRecent` línea 64 hay `// silent — keep upcoming working` — aceptable (defensa en profundidad).

**Bugs encontrados**: ninguno.

**Fix aplicado**: ninguno.

---

### 7) AdvisorTab (`advisor`)

**Status**: ✅ **OK** (con 1 fix aplicado).

**Componente**: `frontend/src/components/home/AdvisorTab.jsx` (1340 líneas)

**Endpoints API**:
- `GET /api/ai-analysis` → HTTP 200, 8481 bytes (cached AI snapshots)
- `POST /api/ai-analyze-portfolio` (full analysis on-demand, requiere auth)
- `POST /api/ai-analyze` (single ticker)

**Data sources**:
- HomeContext (`portfolioList`, `portfolioTotals`, `screenerData`, `POS_STATIC`, hide, hideN, fxRates, displayCcy, openAnalysis)
- `localStorage`: `ayr-ai-analysis` (cache local)

**Hardcoded data**:
- IMPORTANCE constants (RED, YELLOW, GREEN, GOLD, GOLD_DIM)
- Verdict criteria (highCount thresholds, score thresholds, isPreferred regex)
- Card styles, gauge SVG

**Issues**:
- **Imports muertos**: `n` y `fDol` from `formatters.js` no se usan en ningún sitio del archivo. **APLICADO FIX**: removidos ambos del import.
- 2 catches silenciosos (`localStorage.getItem('ayr-ai-analysis')` line 619, fetchCachedAnalysis line 634): el primero es safe (JSON.parse de localStorage corrupto), el segundo dice `/* API not available — use local */` — aceptable.

**Bugs encontrados**: 2 menores (imports muertos `n` + `fDol`).

**Fix aplicado**:
- Línea 3: `import { _sf, _sl, n, fDol } from …` → `import { _sf, _sl } from …`

---

## Duplicación cross-tab

| # | Datos compartidos | Tabs implicados | Endpoint | Riesgo |
|---|---|---|---|---|
| 1 | NLV history | DashboardTab + DailyBriefingTab | `/api/ib-nlv-history` (Dashboard) vs `/api/briefing/daily` (Briefing) | Bajo — dos round-trips desperdiciados, pero data es la misma |
| 2 | Upcoming earnings | DashboardTab + EarningsTab + DailyBriefingTab | `/api/earnings-batch` (Dashboard, raw FMP) vs `/api/earnings/upcoming` (Earnings, scoreado) vs `/api/briefing/daily.upcoming_earnings` (Briefing) | Medio — datos parecidos pero shape distinto. Earnings tab es la canónica con `importance`+`portfolio_weight_pct` |
| 3 | Q+S/5-filters scores | PortfolioTab + AdvisorTab | `/api/scores` + `/api/five-filters` (PortfolioTab) vs `analysis` derivada en AdvisorTab desde portfolioList+screenerData | Bajo — son dos vistas de los mismos datos pero AdvisorTab usa su propio score local |
| 4 | Earnings-batch | DashboardTab + CoveredCallsTab (otro grupo) | `/api/earnings-batch` | Bajo — no del grupo Cartera, mencionar para contexto |

**Recomendación**: Como el upcoming-earnings de DashboardTab es minimal, podría reemplazarse por una sola llamada a `/api/earnings/upcoming` y compartir resultado. Para NLV, podría haber un hook `useNlvHistory()` que cachee la respuesta entre tabs (reciben el mismo prop).

---

## Bugs adicionales y observaciones

1. **`/api/costbasis/sync-dividends` no protegido** (TradesTab call): vuelve HTTP 200 sin auth header. Si bien es idempotente (UNIQUE en D1), podría usarse para forzar carga. Considerar añadir a `PROTECTED_WRITE` en `worker.js:3960`.

2. **Year selector hardcoded** en TradesTab: `["2026","2025","2024","2023","2022","2021","2020"]`. En 2027 habrá que actualizar manualmente. Considerar derivar de `summary.years` o del max-year del backend.

3. **ACTIONS estáticos** (ActionPlanTab) extraídos 2026-04-18, hoy 2026-05-02 = 14 días viejo. Sin alerta visual de "data stale". El componente declara `DEEP_DIVE_DATE` constante. Mostrarlo en banner ayudaría al usuario.

4. **Dead Imports detectados**: `n` en AdvisorTab (FIX aplicado). Otros imports verificados manualmente y todos son usados.

5. **TDZ Risk**: revisado el patrón `useState BEFORE useEffect`. Todas las 7 tabs respetan la regla v4.3 — los useState/useCallback van antes de los useEffects que los referencian.

---

## Endpoints test summary (curl)

```
GET  /api/scores                              → HTTP 200 (115822 b)
GET  /api/five-filters                        → HTTP 200 (22450 b)
GET  /api/oracle-verdict/batch?tickers=AAPL   → HTTP 200 (1211 b)
GET  /api/ai-analysis                         → HTTP 200 (8481 b)
GET  /api/theses/missing?min_weight=0.5       → HTTP 200 (1413 b)
GET  /api/briefing/daily                      → HTTP 200 (6424 b)
GET  /api/digest/weekly/latest                → HTTP 200 (6823 b)
GET  /api/ib-nlv-history?limit=10  [+auth]    → HTTP 200 (2134 b)
GET  /api/price-history?symbol=SPY            → HTTP 200 (17310 b)
GET  /api/earnings-batch?symbols=AAPL,MSFT    → HTTP 200 (776 b)
GET  /api/earnings/upcoming?days=30           → HTTP 200 (3386 b)
GET  /api/earnings/post                       → HTTP 200 (64 b — 0 items hoy)
GET  /api/costbasis/all?limit=5     [+auth]   → HTTP 200 (2518 b)
GET  /api/costbasis                  [+auth]  → HTTP 200 (194444 b)

Auth gates verified:
  /api/costbasis           → 401 sin auth ✓
  /api/costbasis/all       → 401 sin auth ✓
  /api/ib-nlv-history      → 401 sin auth ✓
  /api/positions           → 401 sin auth ✓
  /api/ib-auto-sync (POST) → 401 sin auth ✓
  /api/ib-bridge/executions/sync → 401 sin auth ✓ (auth gate diferente: AYR_BRIDGE_AUTH)
  /api/costbasis/sync-dividends → HTTP 200 sin auth ⚠️ (ver Bug #1)
```

---

## Fixes aplicados (resumen)

```
frontend/src/components/home/AdvisorTab.jsx
  - L3: removed unused imports `n` and `fDol` from formatters.js
  
frontend/src/components/home/PortfolioTab.jsx
  - L202: catch {} → catch (e) { console.error('[ThesisCoverage] reload failed:', e); }
  - L204: catch {} → catch (e) { console.error('[ThesisCoverage] initial fetch failed:', e); }
  - L215: catch {} → catch (e) { console.error('[ThesisCoverage] generate failed for', t, ':', e); }
  - L353: catch {} → catch (e) { console.error('[PortfolioTab] /api/scores failed:', e); }
  - L381: catch {} → catch (e) { console.error('[PortfolioTab] /api/five-filters failed:', e); }
  - L415: catch {} → catch (e) { console.error('[PortfolioTab] /api/oracle-verdict/batch failed:', e); }
```

Total: **2 archivos modificados**, **7 cambios concretos**, **0 cambios funcionales** (solo logging mejorado y eliminación de imports muertos).

No SQL/risky changes generated — `scripts/audit-tab-X1.sql` no se crea (no había SQL aplicable).

---

## Próximos pasos sugeridos (para round 2 / fuera de scope)

1. Añadir `/api/costbasis/sync-dividends` a `PROTECTED_WRITE` (5 min).
2. Crear `useNlvHistory()` hook compartido para evitar 2x fetch entre Dashboard y Briefing (15 min).
3. Migrar ACTIONS de ActionPlanTab de hardcoded a endpoint `/api/action-plan` (D1 table) (1h).
4. Year selector dinámico en TradesTab basado en `summary.years` (10 min).
5. Banner "data stale" en ActionPlanTab si `DEEP_DIVE_DATE` >14d (5 min).
