# Deep Audit — Grupo "Ingresos" (11 tabs) — 2026-05-02

**Scope**: 11 tabs montadas desde `HOME_TAB_GROUPS` id=`ingresos` en `frontend/src/constants/index.js:131-148`.

| # | Tab id | Componente |
|---|--------|------------|
| 1 | `dividendos` | `DividendosTab.jsx` (1108 L) |
| 2 | `opt-optimizer` | `OptionsOptimizerTab.jsx` (535 L) |
| 3 | `opciones-cs` | `OpcionesTab.jsx` (1252 L) — `<OpcionesTab strategy="CS" view="list" />` |
| 4 | `opciones-roc` | `OpcionesTab.jsx` — `strategy="ROC" view="list"` |
| 5 | `opciones-rop` | `OpcionesTab.jsx` — `strategy="ROP" view="list"` |
| 6 | `opciones-leaps` | `OpcionesTab.jsx` — `strategy="LEAPS" view="list"` |
| 7 | `opciones-resumen` | `OpcionesTab.jsx` — `strategy="CS" view="summary"` (strategy ignorado en este view) |
| 8 | `opciones-orphans` | `OpcionesTab.jsx` — `strategy="CS" view="orphans"` (strategy ignorado) |
| 9 | `income` | wrapper `IncomeTab` en `HomeView.jsx:78` → `CoveredCallsTab` o `IncomeLabTab` |
| 10 | `scanner` | `ScannerTab.jsx` (1065 L) |
| 11 | `auto-trading` | `AutoTradingTab.jsx` (1086 L) — 7 sub-tabs |

---

## Hallazgo principal: 6 tabs `opciones-*` NO están duplicados

**Confirmado**: las 6 tabs (`opciones-cs`, `opciones-roc`, `opciones-rop`, `opciones-leaps`, `opciones-resumen`, `opciones-orphans`) usan **el mismo componente** `OpcionesTab.jsx` con distintos props `strategy` + `view`.

- `view='list'` → muestra trades filtrados por `strategy` (4 estrategias: CS, ROC, ROP, LEAPS)
- `view='summary'` → tabla pivot mensual (CS×ROC×ROP×LEAPS×Total) ignora `strategy` prop
- `view='orphans'` → trades de IB (`cost_basis tipo=OPTION`) que no están en `options_trades` (Excel) ignora `strategy` prop

State compartido en module-scope a través de `localStorage` (`opciones_filter_year/month/status`). Endpoints distintos por view. **No hay duplicación de código**, sólo de routing.

**Fix opcional sugerido (no aplicado)**: en HomeView.jsx, los dos últimos no necesitan `strategy="CS"`:
```jsx
{homeTab==="opciones-resumen" && <OpcionesTab view="summary" />}
{homeTab==="opciones-orphans" && <OpcionesTab view="orphans" />}
```
El componente ya ignora la prop en esos modos. Sólo cosmético.

---

## 1. `dividendos` — DividendosTab.jsx

**Estado**: SOLID. Una de las tabs más maduras.

- **Datos**: `useHome()` context (`portfolioTotals`, `divLog`, `POS_STATIC`) + 1 endpoint API.
- **Endpoints consumidos**:
  - GET `/api/dividend-calendar?symbols=...` — ex-dates reales FMP (worker l.14518)
  - GET `/api/dividendos/calendar.ics` — exporta calendario iCal
- **Hooks**: `useFireMetrics`, `useFxRates`, `useNetLiquidationValue`, `useMonthlyExpenses`, `useDraggableOrder`, `useFreshness`. Bien organizado.
- **Mock/hardcoded**: NINGUNO. Usa `divLog` real (2154 entries D1) y `POS_STATIC` real.
- **Bug fix histórico** (l.553): tasa neto fallback `0.90` (10% China-US treaty) para nuevos tickers sin historial — corregido del antiguo `0.94` erróneo.
- **Bug fix histórico** (l.21-22): `privacyMode` ungated → `ReferenceError` en mount, ahora pulled from context.
- **Code review**: limpio, bien documentado, fechas en español.

---

## 2. `opt-optimizer` — OptionsOptimizerTab.jsx

**Estado**: SOLID, datos reales.

- **Endpoint**: GET `/api/options/optimizer?strategy=all&dte=37&otm_cc=7&otm_csp=3` (worker l.21805).
  - Backend: Black-Scholes + Yahoo Finance chains. Lee `positions.shares >= 100` para CCs, `cantera + watchlist` para CSPs.
  - Auth: read-only, sin token (correctamente listado en comment l.21807).
- **Sub-tabs**: `cc`, `csp`, `leaps` (3 tablas distintas).
- **Fields shown** (CC table): `ticker, price, strike, distPct, expiry, dte, bid, premium, annualizedPct, delta, iv, contracts, totalPremium, oi`. Match exacto con worker `pickBestCC()` response (l.21916-21932).
- **Mock/hardcoded**: NINGUNO. Default DTE=37, OTM_CC=7, OTM_CSP=3 son valores por defecto editables.
- **UX**: copy-to-clipboard genera string formato IB ("`SELL 5 KO 2025-06-20 60 CALL @ $0.95 LMT`").

---

## 3-8. `opciones-*` — OpcionesTab.jsx (componente compartido)

**Estado**: SOLID, datos reales D1 (`options_trades` table).

### Endpoints
| Endpoint | View | Worker line |
|---|---|---|
| GET `/api/options/meta` | always (filters) | l.6801 |
| GET `/api/options/trades?strategy=...&year=...&month=...&status=...` | list | l.5848 |
| GET `/api/options/summary?year=...` | summary | l.5876 |
| GET `/api/options/reconcile/orphans?year=...&ticker=...` | orphans | l.6661 |
| POST `/api/options/calc` | planner modal preview | l.5777 |
| POST `/api/options/trades` | new trade | l.5795 |
| PUT `/api/options/trades/:id` | edit/close | l.5813 |
| DELETE `/api/options/trades/:id` | delete | l.5835 |

### Fields verificados
- **Trades table** (CS): `trade_date, underlying, short_strike, long_strike, spread, credit, net_credit, dte, rorc, arorc, kelly_pct, actual_contracts, final_net_credit, status` → todos en schema `options_trades` (worker l.981 confirma `spread REAL`).
- **Orphans table**: `fecha, ticker, opt_tipo (P/C), opt_strike, opt_expiry, opt_contracts, opt_credit_total, opt_status` — match con `cost_basis tipo=OPTION` columns.
- **Summary pivot**: groupby `strftime('%Y','%m', COALESCE(result_date, trade_date))` x `strategy`. Bar chart per row. Final row = grand total.

### Mock/hardcoded
NINGUNO. Comisiones default por estrategia (`CS=0.02611, ROC=0.00416, ROP=0.0102`) son sensible defaults editables en planner.

### Casos edge
- TDZ-safe: comentario explícito en l.21-22 ("All useState/useRef declared BEFORE useEffect").
- 3 silent catches `} catch {}` (l.188, l.786) en summary load + planner preview — non-fatal porque hay UI fallback. Aceptable.

---

## 9. `income` — IncomeTab wrapper en HomeView.jsx l.78

**Estado**: SOLID. Wrapper para 2 sub-tabs.

- Sub-tabs: `cc` (default) → `CoveredCallsTab`, `lab` → `IncomeLabTab`.
- Persiste sub-selection en `localStorage('income_sub')`.

### CoveredCallsTab (786 L)
- **Endpoints**: `/api/costbasis/all?tipo=OPTION`, `/api/prices?tickers=^VIX,SPY`, `/api/earnings-batch`, `/api/price-history`, `/api/options-batch`. 5 endpoints distintos.
- **Mock/hardcoded**: NINGUNO. Combina B-S instant + Yahoo background.

### IncomeLabTab (~600 L)
- **Endpoints**: `/api/tax-report`, `/api/costbasis/all?tipo=OPTION`, `/api/dividendos`, `/api/dividend-calendar`.
- **Mock/hardcoded**: `SECTOR_FALLBACK` map (l.76-98) — pero está marcado explícitamente como "Fallback only when D1 positions lack a sector value". Actualmente `positions.sector` columna está al 100%, así que casi nunca se usa. ACEPTABLE.
- **Bug fix histórico** (l.146-151): antes usaba `ticker.charCodeAt(0) % 3` como hash de placement → AAPL+AMZN siempre mismo mes. Ahora usa real ex-dates de FMP via `dividend-calendar`.
- **Section "stacking"**: agrupa últimos 24 meses dividends + opciones income. OK.

---

## 10. `scanner` — ScannerTab.jsx ⚠️ MOCK DATA

**Estado**: MOCK DATA en toda la UI excepto el toggle Activo/Pausado.

### Hallazgo crítico
- `MOCK_NAV = 1_234_567`, `MOCK_INIT_MARGIN = 435_000`, `MOCK_MAINT_MARGIN = 300_000`, `MOCK_VIX = 18.7`, `MOCK_LAST_SCAN = "hace 3min"`, `MOCK_NEXT_SCAN = "en 7min"`, `MOCK_CANDIDATES` (8 rows hardcoded), `MOCK_REJECTED`, `MOCK_SNAPSHOTS`. Todo estático.
- **Antes de mi fix**: NO tenía banner aviso. Comentario l.5-6 dice "All mock. Replace with real IB-bridge / FMP calls in the wiring phase" pero el usuario podría tomar los números por reales.

### FIX APLICADO
Añadido banner ámbar permanente arriba (después del `<div>` outer, antes del top dashboard bar):
```
⚠️ Datos MOCK
NAV, márgenes, VIX, candidatos y snapshots son estáticos. Sólo el toggle ACTIVO/PAUSADO
está conectado al backend (/api/scanner/state). Pendiente wiring con /api/scanner/run +
/api/scanner/runs.
```

### Backend SI tiene los endpoints reales (sólo falta wiring)
| Endpoint | Worker line | Auth |
|---|---|---|
| GET `/api/scanner/state` | l.11829 | abierto |
| POST `/api/scanner/toggle` | l.11849 | abierto |
| GET `/api/scanner/runs?limit=20` | l.11874 | abierto |
| GET `/api/scanner/snapshots?run_id=N` | l.11888 | abierto |
| GET `/api/scanner/filters` | l.11918 | abierto |
| POST `/api/scanner/filters` | l.11926 | abierto |
| POST `/api/scanner/run` | l.11938 | PROTECTED_WRITE (l.3964) |
| POST `/api/scanner/copy-to-opus` | l.11989 | abierto |

### Otros findings menores
- L.498 antes: `const displayCandidates = selectedSnapshot ? filteredCandidates : filteredCandidates;` — ternario tautológico (ambas ramas idénticas). **FIXED** → `const displayCandidates = filteredCandidates;`
- L.470-478: hidratación silente de `/api/scanner/state` (silently fails si endpoint cae). OK.
- L.461-466: `console.warn` cuando toggle falla — único console.warn en la tab. OK.

---

## 11. `auto-trading` — AutoTradingTab.jsx (7 sub-tabs)

**Estado**: MAYORÍA SOLID con datos reales. 1 placeholder explícito (Paper).

### Sub-tabs y endpoints

| Sub-tab | Endpoints | Estado |
|---|---|---|
| 📅 Hoy (`today`) | GET `/api/auto/daily-pesca` (worker l.9545) | LIVE — Phil Town BPS RUT con defensa POP+Δ+OTM+VIX gate |
| 🛡️ Auto-Close (`autoclose`) | GET `/api/auto-close/open-trades` (PROTECTED), GET `/api/auto-close/alerts` (PROTECTED), POST `/api/auto-close/sync-positions` (PROTECTED), POST `/api/auto-close/scan` (PROTECTED), PATCH `/api/auto-close/open-trades/:hash` | LIVE — auto-sync cada 5 min |
| 🎣 Pescando (`fishing`) | GET/POST/DELETE `/api/fishing/orders` (l.10015+), POST `/api/fishing/scan` | LIVE |
| 🧠 Brain (`brain`) | GET `/api/brain/decisions`, POST `/api/brain/run` (PROTECTED) | LIVE — devuelve market snapshot + decisiones |
| 📚 Catálogo (`catalog`) | GET `/api/auto/strategies` (l.9468) | LIVE — 4 estrategias seedeadas |
| 🧪 Backtest (`backtest`) | GET `/api/auto/backtests`, POST `/api/auto/backtest` | LIVE — equity curve SVG |
| 📊 Paper (`paper`) | NINGUNO | **PLACEHOLDER** |

### Hallazgos

**Paper sub-tab (l.1059-1066)**: era placeholder sin aviso visual claro. El usuario podría no saber que está sin wiring.

### FIX APLICADO
Añadido badge "⚠️ Placeholder — sin wiring backend todavía" ámbar dentro de PaperPanel.

### Disclaimer de seguridad (l.49-62)
Banner permanente arriba de la tab dice claramente:
> ⚠️ Sistema NO ejecuta trades. Solo SUGIERE y AVISA. Tú abres en TWS/Tastyworks manual.
> Read-Only API en IBKR. Cuando uses fishing orders, el sistema te avisa cuando se cumpla el target.

Esto cumple con el patrón Phase 1/2/3 de CLAUDE.md (no auto-execute).

### Field consistency
- TodayPanel: `data.market.{vix,iwm,rut_proxy,rvx_proxy}`, `data.candidates[].{short_strike_iwm, long_strike_iwm, otm_pct, pop_at_open, delta_target, credit_mid, fishing_target_credit, max_contracts_for_10k_bucket, defense_passed, defense_checks}` — todos coinciden con worker response (l.9658-9674).
- BrainPanel: `decisions[].{id, ts, severity, action, strategy, underlying, regime_view, confidence, rationale}`. OK.
- AutoClosePanel alerts: `{id, fired_at, severity, trigger_type, symbol, short_strike, long_strike, underlying_now, mark_now, pnl_pct, delta_now, notified_telegram, ack}`. OK.

### Code quality
- Local helpers `fmtMoney`, `fmtPct`, `fmtN` en l.30-32 podrían ir a `utils/formatters.js`. Coste bajo, ignorable.
- 1 silent catch `} catch {}` en l.163 (loadHistory de backtests) — non-fatal.
- Auto-sync interval 5 min en `AutoClosePanel useEffect l.351-359` correctamente cleanup con `clearInterval`.

---

## Resumen ejecutivo

### Salud global de las 11 tabs
- **9 tabs SOLID** con datos reales: `dividendos`, `opt-optimizer`, las 6 `opciones-*` (mismo componente), `income` (CoveredCallsTab + IncomeLabTab).
- **1 tab MOCK total**: `scanner` — backend listo, falta wiring UI.
- **1 tab MIXTA**: `auto-trading` — 6 de 7 sub-tabs LIVE, sólo Paper es placeholder.

### Duplicación
NINGUNA. Las 6 `opciones-*` son views del mismo componente. No hay copy-paste oculto.

### Ghost fields
NINGUNO encontrado. Cada field renderizado tiene origen claro en respuesta API o context.

### Hardcoded data
- Sólo `SECTOR_FALLBACK` map en IncomeLabTab — explícitamente fallback, raramente usado (positions.sector está al 100%).
- 8 const `MOCK_*` en ScannerTab — ahora con banner ámbar arriba.
- Defaults sensibles (DTE 37, OTM CC 7%, etc.) en OptionsOptimizerTab — editables por usuario, OK.

### Auth gates
Todos los endpoints sensibles (`/api/positions`, `/api/auto-close/*`, `/api/brain/run`, etc.) están en `PROTECTED_READ`/`PROTECTED_WRITE` (worker l.3960-4008). Frontend pasa header automático via `main.jsx:9-32` monkey patch.

### Fixes aplicados en este audit
1. **ScannerTab.jsx**: banner ámbar "⚠️ Datos MOCK" arriba.
2. **ScannerTab.jsx l.499**: ternario tautológico `selectedSnapshot ? filteredCandidates : filteredCandidates` simplificado.
3. **AutoTradingTab.jsx PaperPanel**: badge "⚠️ Placeholder" añadido.

### Build verification
`cd frontend && npm run build` → ✓ built in 211ms (sin errores). Bundle ScannerTab afectado, AutoTradingTab afectado.

### Pendientes (no críticos, no aplicados)
- HomeView.jsx l.1628-1629: `<OpcionesTab strategy="CS" view="summary"/>` y `view="orphans"` no necesitan strategy prop — limpieza cosmética.
- ScannerTab: completar wiring de `/api/scanner/runs` + `/api/scanner/snapshots` (Fase 2 según comentarios del propio archivo).
- AutoTradingTab Paper: implementar tracking real de paper trades (ver FASE 2 de CLAUDE.md auto-trading).
- IncomeLabTab `SECTOR_FALLBACK`: si `positions.sector` queda 100% poblado siempre, considerar borrar el fallback (~22 líneas).
