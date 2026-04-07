# Session log — 2026-04-08 (overnight autonomous work + visual verification)

> **Cómo retomar en otra pestaña**: lee este archivo + `CLAUDE.md`. Resume el contexto, los commits, los pendientes, y los puntos peligrosos. Pide al nuevo Claude que lea este archivo entero antes de continuar.

## TL;DR

- **9 commits** desde `4d05bb1` (last pre-session commit)
- **10 deploys**: 4 worker + 6 frontend
- **1 bug crítico resuelto**: NLV cambiaba "de repente" al abrir la app por una fila corrupta en `nlv_history` del 2026-04-07
- **~706 líneas eliminadas** en neto (dead code + dedup)
- **Coste de los agentes**: $1.20 → $1.05 por run (-12%)
- **Verificación visual completa** vía Chrome MCP — todo live en https://ayr.onto-so.com
- **0 errores en consola** del navegador

## Commits (en orden cronológico)

```
c220ca8  Night sweep: 4 audits + 11 fixes (-706 LOC)
499dd3f  Trade agent: simplify 3 calls → 1 Opus synthesis
10fff52  Fix: portfolio NLV sudden change — partial-fetch guard in nlv_history
3e8a224  Perf: memoize 20 apiData fallbacks in App.jsx
63c0c9a  Cleanup: consolidate fmtUSD/fmtPct/fmtDate into formatters.js
3ef12a7  A11y: PromptDrawer now closes on Escape key
d71aa73  Fix: NominaTab + Portfolio header now reflect net dividends
c96dec1  Fix: fK formatter shows M for millions ($3.66M not $3661.0K)
aaec452  Merge: dividend + earnings agents now consume no-LLM ground-truth signals
```

`git diff --stat 4d05bb1..HEAD` → 28 files, +1208 / -1272 = **-64 LOC neto** (después de añadir los nuevos primitives + hook + groups, salieron 706 líneas de dead code).

## Auditorías ejecutadas (4 agentes en paralelo)

1. **Audit A — 14 AI agents reality check** → veredictos KEEP/IMPROVE/KILL por agente
2. **Audit B — code bugs + dead code** → 0 critical, 4 high, 6 medium, 5 low
3. **Audit C — data discrepancies** → 9 grupos de discrepancias entre tabs
4. **Audit D — UX visual issues** → 226 raw `<button>`, 9 modales sin Escape, 47 tabs con inline fontSizes

Más auditorías paralelas: portfolio bug investigation, FIRE dedup implementation, HOME_TABS regrouping, Tailwind palette migration.

## Cambios aplicados — por área

### 🐛 Bug crítico — NLV "cambiaba de repente"
- **Root cause**: fila corrupta en `nlv_history` fecha=2026-04-07. `performAutoSync` escribió `$1,123,492` cuando solo 1 de 4 cuentas IB devolvió datos. El frontend cargaba esta fila como cached snapshot al abrir la app → de ahí el "cambio repentino" cuando llegaban los datos live.
- **Fix inmediato**: `wrangler d1 execute aar-finanzas --remote --command "DELETE FROM nlv_history WHERE fecha='2026-04-07' AND positions_count=20"`
- **Fix permanente**: `performAutoSync` ahora requiere que TODAS las cuentas devuelvan NLV>0 + rechaza caídas >30% vs fila anterior. Mismo guard en `POST /api/ib-nlv-save` (HTTP 422 en violación). Ver `api/src/worker.js:1064-1107` y `api/src/worker.js:2823-2868`.
- **Cached NLV verificado live**: $1,315,313 (correcto)

### 🤖 14 AI agentes — optimización
- **KILLED `summary`** (frontend `AgentesTab.jsx:57` borrado): era ghost tile sin runner real
- **`macro` Opus → Haiku**: ahorro $0.04/run, prosa generic sin valor único de Opus
- **`risk` Opus → Haiku**: las métricas de riesgo se calculan en código antes del LLM, Opus solo parafraseaba
- **`trade` 3 calls → 1**: eliminados los pasos Haiku bull + Haiku bear, ahora solo Opus synth con razonamiento interno (ahorro $0.08/run)
- **`analyst_downgrade` thresholds aflojados**: 4/6 → 3/5 (no disparaba en blue chips)
- **MERGE `dividend_cut_warning` + `analyst_downgrade` → dividend agent**: el LLM lee los signals del DB y los pasa como `cutWarningSignal` y `analystDowngradeSignal` por ticker. Pipeline reordenado para que no-LLM corra antes que LLM.
- **MERGE `earnings_trend` → earnings agent**: misma técnica, signal `earningsTrendSignal`.
- **AGENTS_METADATA actualizado** con modelos+costes nuevos (`api/src/worker.js:5362`)
- **Coste pipeline**: $1.20 → $1.05/run

### 📊 Discrepancias de datos (Audit C)
- **Triple FIRE bug → 1 hook**: `frontend/src/hooks/useFireMetrics.js` (NEW). 4 fórmulas FIRE diferentes en FireTab/DashboardTab/DividendosTab/PatrimonioTab → ahora todas leen del mismo hook con SWR=3.5%.
- **WHT 0.94 → 0.90**: residente fiscal chino, 10% China-US treaty (era 6% Spain). Constante `WHT_TREATY_RATES` añadida en `frontend/src/constants/index.js`.
- **PatrimonioTab CNY 7.25 hardcoded → live `fxRates.CNY`**
- **IncomeLab fake calendar**: el hash `ticker.charCodeAt(0) % 3` colocaba AAPL/AMZN en los mismos meses → ahora usa `/api/dividend-calendar` real con fallback Q→Mar/Jun/Sep/Dec
- **NominaTab "Sueldo Pasivo"**: ahora aplica × 0.90 para reflejar neto, con subtítulo "neto estimado · 10% WHT (China-US treaty)". Antes mostraba bruto como si fuera take-home.
- **Portfolio header "Div" → "Div bruto"** + tooltip explicativo

### 🎨 UI/UX
- **HOME_TABS 21 flat → 6 grupos** (Cartera | Ingresos | Finanzas | Planificación | Mercado | Research). Drag-and-drop scoped per group. Backward-compat preservado vía `HOME_TABS = HOME_TAB_GROUPS.flatMap(...)`.
- **3 nuevas primitives**:
  - `frontend/src/components/ui/Modal.jsx` — Escape + focus trap + previous-focus restore + `role="dialog"`
  - `frontend/src/components/ui/StatCard.jsx` — reemplaza el `ls/vs/ss` inline pattern de 12+ tabs
  - `frontend/src/components/ui/Spinner.jsx` — unifica spinners ad-hoc
- **PromptDrawer** ahora cierra con Escape (primer fix a11y)
- **`SEVERITY_COLOR` (NewsTab) + `IMPORTANCE_COLOR` (EarningsTab)** migrados a `--ds-*` tokens
- **fK formatter** en FireTab: ahora muestra `$3.66M` en vez de `$3661.0K`

### ⚡ Performance (Audit B)
- **20 `apiData?.X || []` memoizados** en `App.jsx:137-156` — antes generaban refs nuevas cada render, forzando re-render del árbol vía context. Bonus: arregla H1 (unstable deps) como side effect.
- **`fmtUSD`/`fmtPct`/`fmtDate`** consolidados en `frontend/src/utils/formatters.js` (CurrencyTab importa desde ahí; EarningsTab tiene versiones diferentes con sign +/- y locale es-ES, intencionalmente no migrado)

### 🗑️ Dead code removido
- **5 portfolio sub-views** (BubbleView/TreemapView/SectorView/PerformanceView/DividendView) — 580 líneas, carpeta `frontend/src/components/home/portfolio/` eliminada
- **`_unused_MonthlyTracker`** de DividendosTab (132 líneas)
- **Massive API key** scrubbed de `CLAUDE.md`
- **TABS_OLD zombie** (anterior commit)

## Verificación visual con Chrome MCP

Verificado live en `https://ayr.onto-so.com`:

| Cambio | Estado |
|---|---|
| HOME_TAB_GROUPS — 6 grupos en top row | ✅ |
| Sub-tabs cambian al click de grupo | ✅ |
| NLV $1.32M (no $1.12M corrupto) | ✅ |
| "Div bruto $71.2K" + tooltip | ✅ |
| Tab Agentes — 14 cards (sin ghost summary) | ✅ |
| FIRE Dashboard $3.66M con hook unificado | ✅ |
| NominaTab "$64.070/año" neto + label WHT | ✅ |
| Console errors | ✅ 0 errores |

## Estado de los servicios

- **Worker**: `https://aar-api.garciaontoso.workers.dev` — version `8b5a799c-a7b8-4ccb-aced-a9b024ffd600`
- **Frontend**: `https://ayr.onto-so.com` — bundle `index-0MlyegxO.js`
- **D1**: aar-finanzas (sin migraciones pendientes)

## Files clave creados/modificados

### Nuevos
- `frontend/src/hooks/useFireMetrics.js`
- `frontend/src/components/ui/Modal.jsx`
- `frontend/src/components/ui/StatCard.jsx`
- `frontend/src/components/ui/Spinner.jsx`
- `SESSION_LOG_2026-04-08.md` (este archivo)

### Modificados grandes
- `api/src/worker.js` — agent metadata + runners + NLV guards + agent merge
- `frontend/src/App.jsx` — memoization de apiData
- `frontend/src/components/views/HomeView.jsx` — HOME_TAB_GROUPS 2-level nav
- `frontend/src/constants/index.js` — `HOME_TAB_GROUPS`, `WHT_TREATY_RATES`
- `frontend/src/components/home/FireTab.jsx` — useFireMetrics + fK fix
- `frontend/src/components/home/DividendosTab.jsx` — useFireMetrics + WHT 0.90 + dead tracker removed
- `frontend/src/components/home/PatrimonioTab.jsx` — useFireMetrics + CNY fxRates
- `frontend/src/components/home/DashboardTab.jsx` — useFireMetrics
- `frontend/src/components/home/NominaTab.jsx` — WHT-net + label
- `frontend/src/components/home/PortfolioTab.jsx` — "Div bruto" label
- `frontend/src/components/home/IncomeLabTab.jsx` — real dividend calendar
- `frontend/src/components/home/AgentesTab.jsx` — kill summary + Escape handler

### Borrados
- `frontend/src/components/home/portfolio/{Bubble,Treemap,Sector,Performance,Dividend}View.jsx` (5 archivos)

## Patrones críticos a respetar (de CLAUDE.md)

- **TDZ Bug Pattern**: useState/useCallback ANTES de useEffects que los referencien
- **Deploy command**:
  - Worker: `cd api && npx wrangler deploy`
  - Frontend: `cd frontend && npm run build && npx wrangler pages deploy dist --project-name=ayr --branch=production --commit-dirty=true`
- **PATH**: el shell del cron tiene PATH problemático, usar `export PATH="/usr/local/bin:$PATH"` antes de npm/npx en este entorno

## Pendientes (NO atacados — para futuras sesiones)

### Audit B HIGH (todos relacionados con stale-closure)
- **H4** — `portfolioList.length` deps en `App.jsx:1162, 1334, 1406, 1443` (4 sitios). Stale-closure footgun. Fix: depender de `portfolioList.map(p=>p.ticker).join(',')`.

### Audit B MEDIUM
- Limpieza de **9 endpoints worker dead** (`/api/options-massive`, `/api/cartera/seed`, etc.). Algunos comparten funciones con el cron `scheduled` — no borrar sin verificar.
- **EarningsTab duplica fmtUSD/fmtPct** (tiene sign +/- diferente). Considerar ampliar utils en vez de duplicar.
- **17 console.log** en `worker.js` (líneas 7148, 7670-7706, 8444, 8628, 9714, 12114-12289). Mover a `log()` helper con env flag.

### Audit C MEDIUM/HIGH (quedan pendientes)
- **NLV inconsistente** entre `FireTab/PatrimonioTab/IncomeLabTab/DashboardTab` (3 fuentes diferentes). Recomendado: hook `useNetLiquidationValue()`.
- **3 definiciones de monthly expenses** divergentes (GastosTab user-controllable, FireTab hard 12m, NominaTab `FIRE_PARAMS.monthlyExp` server config). Recomendado: hook `useMonthlyExpenses()`.
- **Forward vs Paid dividends** sin etiqueta clara en varios tabs. Renombrar `totalDivUSD` → `forwardDivUSD`.
- **FX fallbacks inconsistentes** (1.15 vs 1.18 vs 7.25 hardcoded). Recomendado: hook `useFxRates()`.

### Audit D P0/P1
- **Mass migration de 226 raw `<button>`** al componente `<Button>` en 34 tabs. Audit lo flagged como #1 P0.
- **9 modales sin Escape handler**: AdvisorTab, EarningsTab, PortfolioTab, LibraryTab, DividendosTab, PresupuestoTab, ResearchTab, WatchlistTab. Solo PromptDrawer arreglado.
- **15 fetch sites con `.catch(()=>{})`** silenciosos. Migrar a `<Toast>` (ya existe en `ui/`).
- **Split de tabs gigantes**: DashboardTab (1368), AdvisorTab (1295), PatrimonioTab (1275), PresupuestoTab (1171), DividendosTab (1155), CoveredCallsTab (1099), AgentesTab (1013), LibraryTab (924), FireTab (866), PortfolioTab (846).
- **2,209 fontSize hardcoded** en 65 archivos. Algunos son `fontSize:9` (debajo del piso WCAG de 12px).
- **85 inputs sin label/aria-label**. CostBasisView: 11 inputs.
- **Sticky headers** faltan en 19 tablas largas.
- **Audit A**: dejar `summary` realmente funcional (construir `runSummaryAgent` o ya borrado del frontend, pero el backend SÍ aggrega summary insights en `runAllAgents` línea 12273).

### Diseño backlog (de MEMORY)
- Smart Money / Cartas Sabios / Discovery Engine / YouTube Dividendo MVPs
- 12 docs design backlog en `docs/implementation-roadmap.md`

## Cómo reproducir el bug del NLV (para tests futuros)

```sql
-- Inserta una fila parcial-fetch en local
INSERT INTO nlv_history (fecha, nlv, positions_value, margin_used, accounts, positions_count)
VALUES ('2026-04-09', 200000, 220000, 50000, 4, 5);
-- Frontend mostrará $200k en lugar del valor real
-- Después del fix, performAutoSync rechaza el escribir esto si:
--   (a) algún account no devuelve NLV
--   (b) total cae >30% vs fila anterior
```

## Decisiones importantes tomadas

1. **No mass-deleted los 9 endpoints worker dead** porque algunos comparten funciones con el cron scheduled. Borrar sin verificar es alto-riesgo.
2. **No migrate EarningsTab fmtUSD/fmtPct**: las versiones son distintas (sign +/- y locale es-ES). Mejor mantener locales que romper.
3. **No mass-migrate `<Button>`**: 226 botones en 34 tabs es trabajo grande con riesgo. Hecho solo donde tocaba (CurrencyTab/MacroTab/EarningsTab/AgentesTab).
4. **No-LLM agents siguen visibles como cards** después del merge: su data sigue siendo útil standalone, solo es la verdict del LLM la que ahora los incorpora.

## Lo que el próximo Claude debería leer primero

1. Este archivo
2. `CLAUDE.md` — instrucciones del proyecto
3. `AGENTS.md` — docs de los 14 agentes (puede estar outdated, ver AGENTS_METADATA en `worker.js:5362`)
4. `git log --oneline -15` — contexto reciente
5. `frontend/src/hooks/useFireMetrics.js` — el patrón a seguir para futuros hooks de dedup
