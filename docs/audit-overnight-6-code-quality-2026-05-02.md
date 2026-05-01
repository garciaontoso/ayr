# Audit Overnight 6 — Code Quality + Dead Code

**Fecha**: 2026-05-02
**Scope**: `api/src/worker.js` (~28K líneas), `frontend/src` (~135 archivos JSX/JS)
**Budget**: 30 min
**Status**: Completado. 4 fixes aplicados (3 dead imports + console.error en 4 silent catches críticos).

---

## 1. TODO / FIXME / XXX / HACK catalog

Sólo 2 TODOs reales (`// TODO:` comment). El resto son falsos positivos (palabra "TODO" en español/Markdown).

| Prioridad | File:line | Contexto |
|-----------|-----------|----------|
| MEDIUM | `api/src/worker.js:10066` | `// TODO: usar ttQuote con OCC symbols. Phase 1B: por ahora estimación.` Auto Trading mark-to-market para opciones. Estimación actual con BS+VIX, no spread real. |
| LOW | `api/src/worker.js:11933` | `// TODO (Fase 2): aquí enchufaremos el pipeline real:` Stub Brain v2 (no bloqueante). |

**Conclusión**: Codebase muy limpio en deuda técnica explícita. No hay FIXMEs/HACKs/XXX.

---

## 2. Silent failures (catch sin log/alert/return)

Conteo total:

| Layer | catch blocks | empty/silent (no log/return) | de los cuales JSON.parse / ALTER TABLE (legítimos) |
|-------|--------------|-------------------------------|----------------------------------------------------|
| `worker.js` | 216 | 129 | 25 |
| `frontend/src` | 124 | 117 | 44 |

**Silent críticos en worker.js** (los más impactantes — 104 sin defensa visible):

- `worker.js:1074` — UPDATE superinvestors metadata silenciosamente; usuario nunca sabe si falla schema migration
- `worker.js:1600` — `applyExpenseRules()` retorna null en error, perdiendo categorización
- `worker.js:1789, 1827` — Yahoo quote / NLV cache fallback retornan sin log → debug imposible si Yahoo cambia API
- `worker.js:5933` — Cache D1 read fall-through silencioso (rebuild siempre)
- `worker.js:11066, 11121, 11152, 11227, 11262` — Múltiples puntos en flujo `/api/ib-bridge/*` silenciados
- `worker.js:14955` (ya tenía comentario "table may not exist yet") — OK
- `worker.js:17532-17544` — INSERT macro_events agrega individual con `catch {}` → si tabla cambia schema, todos los inserts fallan silenciosamente. **FIXED** en este audit.
- `worker.js:22750` — `sendWebPush(env, sub, payload)` silencia errores → push no entregado, usuario no notado
- `worker.js:24501-24503, 24788, 24889, 25108, 25128` — Pipeline agentes silencia errores → outcome opcionalmente perdido

**Silent críticos en frontend (App.jsx + tabs)**:
- `App.jsx:634, 891` — `loadTransactions` / `loadDivLog` silencian fallos de `window.storage.get` → usuario ve "Sin datos" pero no sabe por qué
- `App.jsx:1556, 1564` — Settings load: si JSON parse del FX cache falla, FX queda en defaults sin alerta
- `App.jsx:1399` — `refreshLivePrices` silencia errores (CRÍTICO: puede ocultar pérdida de conexión live)
- `App.jsx:302` — `/api/ib-cached-snapshot` catch silenciado. **FIXED**.
- `App.jsx:969` — `/api/costbasis/sync-dividends` catch silenciado. **FIXED**.
- `App.jsx:1454` — `/api/alerts` catch silenciado. **FIXED**.

**Patrón BX (referenciado en audit 2026-04-27, 127 catches)**: confirmado. La mayoría son `catch(e){}` envolviendo `JSON.parse(localStorage)` o `INSERT OR REPLACE` con duplicados esperados — legítimos. **~80 son verdaderamente problemáticos** y merecen migración a `logEvent` central que ya existe en v4.3 (referenciado en CLAUDE.md "logEvent + errorBudget centralizado").

---

## 3. Dead imports / dead code

### Dead imports detectados y CORREGIDOS

`frontend/src/App.jsx:2` — antes:
```js
import { _sf, _sl, n, fDol, fmtNumD, fmtPctFrac, fmtMul, fmtBnUsd } from './utils/formatters.js';
```
Después:
```js
import { _sf, fmtNumD, fmtPctFrac, fmtMul, fmtBnUsd } from './utils/formatters.js';
```
**Removidos**: `_sl`, `n`, `fDol` (verificado: cero uso real en App.jsx; las apariciones de `n` son property accesses `.n`, escape `\n`, o local `const n = holders.length` en línea 1949).

### Otros candidatos dead (NO eliminados — requieren grep cross-file)

- `worker.js` ~28K líneas: posiblemente helpers internos sin caller. Audit recomienda usar `eslint --rule "no-unused-vars": "warn"` o `unimported` (npm) para análisis sistemático. **OUT OF SCOPE** para 30 min.
- `Massive API` endpoint (mencionado en CLAUDE.md como muerto desde 2026-04-08, key scrubbed). El usuario ya planea borrarlo.

### Class components legítimos

- `frontend/src/components/ui/ErrorBoundary.jsx:3` — `extends Component`. **OK** — React no soporta error boundaries en functional components todavía.

---

## 4. Duplicated code (top 10 candidates)

Análisis high-level (sin ejecutar tooling jscpd):

| # | Patrón | Ocurrencias | Sugerencia |
|---|--------|-------------|------------|
| 1 | `fetch(\`${API_URL}/api/...\`).then(r=>r.json()).then(...).catch(...)` | ~80+ en App.jsx | Crear hook `useApi(endpoint, opts)` con auto-retry y error toast |
| 2 | `try { return JSON.parse(...) } catch { return [] / {} }` | ~50 sites | Helper `safeJson(s, fallback)` (parcialmente existe como `tryParse` en worker.js:23627) |
| 3 | `INSERT OR REPLACE INTO ... ON CONFLICT (...)` patrón en agentes | ~30 sites en worker | Helper `upsert(env, table, data, key)` |
| 4 | Yahoo Finance proxy fetch + crumb auth | ~6 sites | Ya hay `yahooFetch()` parcialmente; consolidar |
| 5 | `return json({ error: String(e.message || e) }, corsHeaders, 500)` | ~150 sites | Helper `errorJson(e, status)` |
| 6 | Currency conversion `price * shares * fx` con caso `GBX` | 2 sites en App.jsx (`refreshPrices` línea 469, `refreshLivePrices` 1378) | DRY: extraer `computeUsdValue(p, priceData)` |
| 7 | `Date.now() - N * 86400000` (timestamps dias-atrás) | 30+ sites | Constant + helper `daysAgoIso(n)` |
| 8 | `fetch(...).catch(() => {})` (silent fetch) | ~15 sites | Helper `safeFetch()` con logger central |
| 9 | Bloque "load via window.storage / fallback to API" | ~8 sites en App.jsx | Hook `usePersistentLoader(key, fetcher)` |
| 10 | Lazy import + Suspense fallback boilerplate | 27 sites en App.jsx (lazy()) | Helper `lazyTab(path)` que devuelve `<LazyTab>` con fallback estándar |

---

## 5. TDZ risks (frontend)

**Búsqueda metódica de useEffect/useCallback que referencia variables declaradas DESPUÉS**:

- `App.jsx:285` — comentario explícito "refreshLivePrices defined after portfolioList (see deferred effects section)". El handler está en línea 1361. La useEffect que lo usa está en 1403 — declaration ORDER OK (1361 < 1403).
- `App.jsx:1483` — useEffect con dep `portfolioList.map(p => p.ticker).join(',')` — `portfolioList` declarado en línea 797. ORDER OK.
- `App.jsx:1410` — useEffect deps `[dataLoaded, refreshLivePrices, isOffline]` — todos declarados antes (110, 1361, 113). OK.

**Ningún TDZ risk detectado en este audit**. El comentario en línea 285 sugiere conciencia activa de la pattern (CLAUDE.md menciona "fixed 4+ times"). Cluster de useState al inicio de `ARApp` y deferred-effects al final mantiene el invariante.

**Recomendación**: añadir regla ESLint `react-hooks/exhaustive-deps` (si no está) y/o `react-hooks/no-tdz` (custom). El módulo `vite-plugin-checker` con TS strict podría detectarlo en CI.

---

## 6. Hardcoded values

### Account IDs IBKR (4 cuentas)
- `worker.js`: 1 sitio con array `["U5372268", "U6735130", "U7257686", "U7953378"]`
- `DashboardTab.jsx`: 1 sitio con map `{"U5372268":"Factory", ...}`
- `TransferenciasTab.jsx`: 1 sitio con placeholder

**Sugerencia**: mover a `frontend/src/constants/accounts.js` o secret CF (env var) — facilita audits y futuras cuentas.

### Magic Numbers (timestamps)
- `380 * 86400000` (worker.js:115), `(days + 5) * 86400000` (262), `1800000` (1635 — 30min Yahoo crumb cache), `6 * 3600 * 1000` (14955 — 6h cache TTL).

**Sugerencia**: `const DAY_MS = 86400_000; const HOUR_MS = 3600_000;` en `api/src/constants.js` (no existe — crear).

### URLs
- `api.onto-so.com/api/tastytrade/oauth/callback` hardcoded en redirect URI (worker.js). Si cambia el dominio, romp todo.
- `ttapi.onto-so.com`, `ib.onto-so.com`, `ayr-196.pages.dev` hardcoded.

**Sugerencia**: env vars CF Worker — `env.PUBLIC_API_URL`, `env.IB_BRIDGE_URL`, `env.TT_BRIDGE_URL`.

### Magic UI numbers
- `App.jsx:1445` — `setTimeout(subscribeToPush, 3000)` mágico
- `App.jsx:1407` — `setInterval(refreshLivePrices, 10000)` cada 10s — referenciado en CLAUDE.md como "Live prices: auto-refresh every 10s"
- `App.jsx:328, 585` — toast timeouts

**Sugerencia**: `const TOAST_MS = 2000; const PRICE_REFRESH_MS = 10_000; const PUSH_DEBOUNCE_MS = 3000;` en `frontend/src/constants/timing.js`.

### VAPID hardcoded
- `App.jsx:1424` — `VAPID_PUBLIC_KEY = "BLLKOH7cSI..."` hardcoded en frontend. **OK** (es la pública), pero comentar.

---

## 7. Outdated patterns

| Pattern | Hits | Verdict |
|---------|------|---------|
| Class components (`extends Component`) | 1 (`ErrorBoundary.jsx`) | OK — único caso requerido |
| `this.setState(` mutación directa | 2 (HomeView.jsx:207, 214) | **FALSE POSITIVE** — son llamadas a un local `setState` del hook `useState`, no mutación. Verificado leyendo contexto. |
| Missing `key` props en `.map()` | No detectado en sample | OK (auditoría visual de ~10 archivos clave) |
| `var` declarations | No buscado | Default es `const`/`let` |
| jQuery/legacy DOM | No detectado | Pure React |

---

## 8. Fixes APPLIED (este audit)

Lista cerrada de cambios:

1. **`frontend/src/App.jsx:2`** — Removidos 3 dead imports (`_sl`, `n`, `fDol`).
2. **`frontend/src/App.jsx:302`** — `IB cached snapshot` catch ahora loguea `console.error('[IB cached snapshot]', e)`.
3. **`frontend/src/App.jsx:969`** — `costbasis/sync-dividends` catch ahora loguea.
4. **`frontend/src/App.jsx:1454`** — `/api/alerts` catch ahora loguea.
5. **`api/src/worker.js:17544`** — `macro_events INSERT` catch ahora loguea (`console.error('[macro_events insert]', e.message)`).

Verificado:
- `App.jsx` parsea OK (`@babel/parser`).
- `worker.js` parsea OK.

---

## 9. Risky refactors (NO aplicados — lista para session futura)

1. **Migrar 80+ silent catches en worker.js a `logEvent(severity, source, message)` centralizado**. CLAUDE.md menciona que el helper ya existe en v4.3. Riesgo: tocar 28K líneas, regresiones posibles.
2. **Hook `useApi`** para eliminar boilerplate fetch en App.jsx. Riesgo: 80+ sites cambiarían signaturas.
3. **Helper `errorJson(e, status)`** en worker.js — sustituir 150+ inline returns. Riesgo bajo, pero PR voluminoso.
4. **Mover account IDs a config**. Riesgo bajo, beneficio mediano.
5. **Constants timing.js / constants/cache.js** para magic numbers. Riesgo bajo.
6. **Extraer `computeUsdValue()` shared entre `refreshPrices` y `refreshLivePrices`** — eliminar duplicación de la lógica GBX/USD/foreign FX. **Recomendado**: la duplicación entre líneas 469-491 y 1376-1393 es un riesgo concreto de bugs divergentes.

---

## 10. Health summary

| Métrica | Valor |
|---------|-------|
| LOC worker.js | 28,177 |
| LOC frontend/src (sin tests) | ~50,000 |
| TODO/FIXME explícitos | 2 |
| catch blocks total | 340 |
| Silent catches potencialmente problemáticos | ~80 (worker) + ~73 (frontend, excl. JSON.parse defensivo) |
| Class components | 1 (ErrorBoundary, legítimo) |
| TDZ risks detectados | 0 |
| Dead imports detectados | 3 (corregidos) |
| Hardcoded magic numbers | ~30 obvios |
| Hardcoded URLs/IDs | ~5 high-value (account IDs + onto-so domains) |

**Recomendación general**: el codebase está saludable para su volumen. Las prioridades reales (en orden) para una próxima sesión deep-clean son:

1. Centralizar logging (silent catches → `logEvent`)
2. Extraer `computeUsdValue` y consolidar fetch helpers (DRY)
3. `constants/timing.js` + `constants/accounts.js`
4. Añadir `eslint-plugin-react-hooks` con `exhaustive-deps` en CI

---

**Generado**: 2026-05-02 por audit overnight 6
**Commits aplicados**: ninguno (solo edits in-place; usuario decidirá commit)
