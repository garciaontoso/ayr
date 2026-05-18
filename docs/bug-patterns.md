# Bug Patterns — A&R

> Catálogo vivo de bugs recurrentes que hemos encontrado, con su causa raíz,
> fix y cómo evitar que vuelvan. **Cada vez que arreglamos un bug
> reproducible, lo añadimos aquí.** Es la memoria del proyecto.
>
> Última actualización: 2026-05-03

---

## Cómo usar este documento

- **Si el usuario reporta un bug nuevo**: busca primero aquí, puede que sea
  uno conocido y tengas el fix listo.
- **Antes de añadir una feature**: lee la sección "Patrones prohibidos" y
  "Patrones obligatorios". No hagas algo que ya nos rompió antes.
- **Cuando arregles un bug nuevo**: añade entrada al final con el formato
  estándar.

---

## 🔥 Patrones obligatorios (lo que SIEMPRE hay que hacer)

1. **Validar al leer arrays anuales de FMP**:
   ```js
   const arr = Array.isArray(info.ratios) ? info.ratios : [];
   const last = arr[0] || {};  // [0] = más reciente, no [last]
   ```
2. **Refrescar cfg.price live** después de restaurar cache:
   ```js
   // En openAnalysis
   const r = await fetch(`/api/prices?tickers=${t}&live=1`);
   if (live > 0) setCfg(prev => ({...prev, price: live}));
   ```
3. **Sumar shares por categoría, no usar `_totalShares` last txn**:
   ```js
   const buys = trades.filter(t => t.tipo==='EQUITY' && t.shares>0)
                       .reduce((s,t) => s + t.shares, 0);
   const sells = trades.filter(t => (t.tipo==='SELL'||t.shares<0))
                       .reduce((s,t) => s + Math.abs(t.shares), 0);
   const finalShares = buys - sells;
   ```
4. **MERGE en READ, no en WRITE**: si necesitas combinar cost_basis + dividendos
   para una vista, hacer JOIN al servir, no duplicar en disco.

---

## 🚫 Patrones prohibidos (lo que NUNCA hay que hacer)

1. **NO leer `.peRatioTTM` / `.evToEbitdaTTM` etc. directamente del array
   anual** — esas claves no existen en el array anual de FMP, sólo en el
   endpoint `/ratios-ttm`.
2. **NO meter `tipo='DIVIDENDS'` en `cost_basis`** — los dividendos van en
   tabla `dividendos`. Filas legacy con DIVIDENDS+shares=N rompen el cálculo
   de shares.
3. **NO usar `setFgMode` etc. en useEffect sin guard `tickerRef`** — bucle
   infinito si el efecto modifica el state que escucha.
4. **NO leer variables `const` antes de su declaración en hooks** — TDZ.
   Vite minifica a `Vn` y rompe sólo en producción.

---

## 📋 Bugs catalogados

### Bug #001 — `evEbitda` siempre 0 en Portfolio (2026-05-03)
- **Síntoma**: columnas EV/EBITDA, P/E, P/B en Portfolio mostraban 0 o "—" para todas las empresas.
- **Causa raíz**: el worker `/api/fundamentals/bulk` devuelve `ratios` y `keyMetrics` como **arrays anuales** (period=annual, limit=10). El frontend leía `.peRatioTTM` etc. en un array → `undefined` → cae a 0.
- **Fix**: leer `ratios[0]` y `keyMetrics[0]` (último anual disponible) con claves no-TTM correctas (`priceToEarningsRatio`, `enterpriseValueOverEBITDA`, `priceToBookRatio`).
- **Prevención**: bumped `FUND_CACHE_KEY` a `_v2` para invalidar cache stale. Validator: si todo el portfolio tiene un campo en 0, alarma.
- **Archivos**: `frontend/src/components/home/PortfolioTab.jsx` líneas 745-760
- **Commit**: `4cff099`

### Bug #002 — Portfolio shares ≠ Cost Basis shares (PG 150 vs 250) (2026-05-03)
- **Síntoma**: PG mostraba 250 shares en Cost Basis y 150 en Portfolio. Diferencia de 100.
- **Causa raíz**: la reconciliación leía `_totalShares` de la **última transacción**, que es running balance **per account**, no global. Para PG con trades multi-cuenta U6735130 + NULL, la última fila de U6735130 tenía 150 (sólo esa cuenta).
- **Fix**: sumar `buys - sells` filtrando por type, ignorando DIVIDENDS legacy.
- **Prevención**: nunca confiar en running balance de cost_basis. Sumar siempre.
- **Archivos**: `frontend/src/App.jsx` líneas 740-790
- **Commit**: `be2eace`

### Bug #003 — Precio stale al abrir empresa (ADP $199 vs $214 live) (2026-05-03)
- **Síntoma**: header del análisis mostraba precio de hace días.
- **Causa raíz**: `openAnalysis` restauraba `cfg.price` del cache guardado al hacer el último análisis. Si fue hace 3 días, el precio es de hace 3 días.
- **Fix**: tras restaurar el cache, async fetch `/api/prices?live=1` y sobrescribir `cfg.price`.
- **Prevención**: el precio NUNCA se cachea en cfg, siempre se hidrata live al abrir.
- **Archivos**: `frontend/src/App.jsx` líneas 580-600
- **Commit**: `64c2512`

### Bug #004 — Sector wrong en Portfolio table (ADP "Technology" vs "Industrials") (2026-05-03)
- **Síntoma**: tabla Portfolio mostraba sectores incorrectos (ADP, ACN, AMCR, AHRT, BME:AMS, ENG, RAND).
- **Causa raíz**: la columna SECTOR leía `p.sector` de `positions` (legacy estática) en lugar del FMP fundamentals.
- **Fix**: COL_DEFS sector ahora usa `p._fund?.sector || p.sector`. `fundData[sym]` ahora también captura `profile.sector` y `profile.industry`. Endpoint `POST /api/audit/portfolio/auto-fix` sincroniza positions.sector ← FMP en bulk.
- **Prevención**: cualquier campo descriptivo (sector, industry, country) lee siempre de FMP, nunca de positions.
- **Archivos**: `frontend/src/components/home/PortfolioTab.jsx` líneas 220-225, 880-900
- **Commit**: `64c2512`

### Bug #005 — Líneas Fair Value y Normal P/E se cortan en último año histórico (2026-05-03)
- **Síntoma**: las líneas naranja (Fair Value) y azul (Normal P/E) terminaban en 2025 mientras FAST Graphs las extiende a años proyectados (2026E-2028E).
- **Causa raíz**: `peBandLine` sólo iteraba `validHist`, no `projData`. Y `fairHistPts` + `projFairPts` se renderizaban como dos polylines separadas (sólida + rayada) con anchor desalineado por `lastVal` raw vs `getSmoothEps()`.
- **Fix**: peBandLine extendido con projData. Anchor de proyección usa `getSmoothEps(lastHistY)`. Una sola polyline continua.
- **Prevención**: cualquier serie temporal del chart debe iterar `[...validHist, ...projData]`, no solo `validHist`.
- **Archivos**: `frontend/src/components/analysis/FastTab.jsx` líneas 695-710, 500-520
- **Commit**: `5062229`

### Bug #006 — REIT valorado con EPS en lugar de AFFO (2026-05-03)
- **Síntoma**: Realty Income y otros REITs mostraban Normal P/E 50x+ y MoS negativos absurdos.
- **Causa raíz**: app usa EPS para todas las empresas. Los REITs tienen EPS bajo por D&A — hay que usar FFO/AFFO.
- **Fix**: detectar REIT (`fmpExtra.profile.sector === 'Real Estate'`) y auto-conmutar `fgMode='fcfe'` (= AFFO proxy). Ocultar Normal P/E history en modo REIT (engañosa). Cards "AFFO Payout" y "P/AFFO vs sector REIT".
- **Prevención**: cualquier ratio basado en EPS debe tener fallback para REITs (FCFE / AFFO).
- **Archivos**: `frontend/src/components/analysis/FastTab.jsx` líneas 60-90, `frontend/src/components/analysis/DashTab.jsx` líneas 240-330
- **Commit**: `55cab5b`

### Bug #007 — Eje derecho yield % no cuadra con la línea (2026-05-03)
- **Síntoma**: para ZTS (yield 1.86%) la línea roja se veía aplastada abajo del chart porque el eje iba 0-10%.
- **Causa raíz**: `YIELD_AXIS_MAX = 0.10` hardcodeado.
- **Fix**: auto-escalar según el max histórico × 1.2 → redondeo a 2/4/6/8/10/15/20/25%. Ticks dinámicos.
- **Prevención**: nunca hardcodear ejes. Computar siempre del data.
- **Archivos**: `frontend/src/components/analysis/FastTab.jsx` líneas 825-850
- **Commit**: `cbc62df`

### Bug #008 — TDZ "Cannot access 'Vn' before initialization" (2026-05-03)
- **Síntoma**: Resumen tab crashea al abrir empresa (sólo en producción minificado).
- **Causa raíz**: `YIELD_AXIS_MAX` IIFE referenciaba `latestDPS` que se declaraba 140 líneas más abajo. En desarrollo Vite no lo detecta; minificado tira TDZ.
- **Fix**: recomputar valor inline en el IIFE en lugar de usar la const declarada después.
- **Prevención**: cualquier IIFE/efecto sólo puede usar variables ya declaradas. Evitar usar `const` que se declaran más adelante en el mismo scope.
- **Archivos**: `frontend/src/components/analysis/FastTab.jsx` líneas 825-848
- **Commit**: `21db2f6`

### Bug #009 — Línea dividendo se corta en último año (2026-05-03)
- **Síntoma**: línea roja yield + dots amarillos DPS terminaban en último año histórico.
- **Causa raíz**: `divHist` sólo construido de `histYrs`. Sin proyección.
- **Fix**: `divProj` extiende N años aplicando CAGR5y de DPS. Yield del último año hist usa `cfg.price` para coincidir con sidebar.
- **Prevención**: cualquier serie con DPS/yield debe extender la proyección.
- **Archivos**: `frontend/src/components/analysis/FastTab.jsx` líneas 770-810
- **Commit**: `a31f20b`

### Bug #010 — `profile.mktCap = None` en FMP (ETFs y otros) (2026-05-03)
- **Síntoma**: Market Cap aparecía vacío para ADP y ETFs.
- **Causa raíz**: FMP migró schema. `profile.mktCap` ya no se devuelve para muchos tickers; el dato vive en `keyMetrics[0].marketCap`.
- **Fix**: fallback chain en `useAnalysisMetrics` y FastTab sidebar:
  ```js
  profile.mktCap || profile.marketCap || keyMetrics[0]?.marketCap || (cfg.price * sharesOut) || 0
  ```
- **Prevención**: cualquier campo de FMP profile debe tener fallback chain.
- **Archivos**: `frontend/src/components/analysis/FastTab.jsx` líneas 1971-1982
- **Commit**: `64c2512`

### Bug #011 — DIVIDENDS rows en cost_basis con shares poblado (legacy)
- **Síntoma**: shares calculadas mal; PortfolioComputed lee como buys.
- **Causa raíz**: imports antiguos metieron filas tipo='DIVIDENDS' con shares populated en cost_basis. CLAUDE.md dice que NUNCA debería pasar.
- **Fix**: filtrar siempre por `tipo NOT IN ('DIVIDENDS','DIVIDEND','DIV')` antes de sumar shares.
- **Prevención**: Auditoría D1 mensual → SELECT COUNT(*) FROM cost_basis WHERE tipo='DIVIDENDS' AND shares > 0; debería ser 0.
- **Archivos**: múltiples (App.jsx reconciliación)
- **Commit**: `be2eace`

### Bug #012 — openReport infinite retry loop offline (Informe + DividendST tabs hang)
- **Sintoma**: Al abrir pestaña "Informe" o "DividendST" offline, la UI se queda colgada o hace peticiones 504 en bucle sin fin.
- **Causa raiz**: `openReport()` en App.jsx no tenia guard offline. ReportTab.jsx tenia un `useEffect` que comprobaba `!reportData || reportSymbol !== ticker` — offline la fetch devuelve 504 (no ok), `reportData` queda null, condicion siempre true, llama `openReport` en cada render → bucle infinito de fetches 504. DSTTab se activaba desde el useEffect del App (linea ~1961) igualmente sin guard `!reportData`.
- **Fix**: (a) `openReport` usa el fetch parchado de main.jsx que ya prueba la cache offline — si no hay dato deja `reportData = null` y sale. (b) ReportTab.jsx usa un `useRef hasFetched` por ticker para intentar exactamente una vez y no reintentar. (c) App.jsx useEffect para DST añade `&& !reportData` para no retriggear cuando ya hay datos.
- **Prevencion**: Cualquier `useEffect` que llame a un fetch y su condicion dependa de que `data === null` DEBE tener un guard de "ya-intentado" (ref) para no loops. Especialmente critico en tabs que auto-cargan al activarse.
- **Archivos**: `frontend/src/App.jsx` linea ~927, `frontend/src/components/analysis/ReportTab.jsx` lineas 10-14, `frontend/src/components/analysis/DSTTab.jsx` linea 8-11
- **Commit**: 2026-05-03

### Bug #013 — /api/report?symbol=TICKER no cacheado en AirplaneMode (Informe + DividendST vacios offline)
- **Sintoma**: Tras activar modo avion, pestañas Informe y DividendST muestran boton "Generar" en lugar de datos, aunque el usuario habia descargado todo el portfolio.
- **Causa raiz**: AirplaneMode Phase 7 cacheaba theses, scores, fg-history, debt-maturity y directiva por ticker — pero NO `/api/report?symbol=TICKER`, que es el unico endpoint que sirve datos para ambas pestañas. Tampoco cacheaba `/api/company/:ticker/transcript-summary` ni `/api/earnings-transcripts?ticker=` usados por TranscriptTab.
- **Fix**: Añadir los 3 endpoints a la lista `Promise.all` de Phase 7 en `HomeView.jsx AirplaneMode`.
- **Prevencion**: Cada vez que se añade un tab nuevo con fetch propio → auditarlo contra la lista de Phase 7. Regla: si el tab tiene `useEffect + fetch` y NO es solo interactivo (generate/POST), sus endpoints GET deben estar en Phase 7.
- **Archivos**: `frontend/src/components/views/HomeView.jsx` linea ~1294
- **Commit**: 2026-05-03

### Bug #014 — `market_value` en moneda nativa interpretado como USD (cálculo de pesos × 7.78 inflado)
- **Síntoma**: Audit de concentración cartera reportó China/HKEX 20.4% NAV cuando real era 3.1%. Recomendaciones de TRIM disparadas erróneamente. Thesis HKG:2219 v2 creado con "concentration trigger DISPARADO 4.0%" cuando posición real era 0.5% NAV.
- **Causa raíz**: El campo `positions.market_value` reporta valor en **moneda nativa del listing** (HKD para HKG:*, EUR para .MC/.PA, GBP para .L). Si se suma directo y se compara contra NAV USD, multi-currency holdings quedan inflados (HKD ≈ 7.78× su USD).
- **Fix**: Usar SIEMPRE `positions.usd_value` para cálculos de pesos / concentración / NAV. El campo `market_value` es solo para display nativo.
- **Prevención**:
  - Cualquier código que itere posiciones para calcular `weight_pct` debe usar `usd_value`.
  - Tests Vitest (regression #014): valida que `weight_pct` para HKG:* coincide con `usd_value/NAV`, no `market_value/NAV`.
  - El endpoint `/api/theses/missing` ya usa `market_value` directamente (línea ~17759 worker.js) — auditar si las cuentas son todas USD; si no, hay que corregir también ese cálculo.
- **Archivos**: cualquier código que itera `/api/positions` y suma `market_value` para weights. Ejemplo del bug: análisis manual en sesión 2026-05-09.
- **Detección**: agente cross-check `usd_value × fx → market_value` debería matchear. Si ratio no es 1.0 para USD currencies o ~7.78 para HKD, algo está mal.
- **Commit**: 2026-05-10

### Bug #015 — IB Flex token caducado → 9 días silent failure cron
- **Síntoma**: Dividendos y trades de últimos 9 días (2026-05-01 a 2026-05-09) no aparecían en cartera. Usuario notó manualmente.
- **Causa raíz**: `IB_FLEX_TOKEN` (Cloudflare Worker secret) caducó. El cron `30 7 * * 1-5` (CF Worker) y `30 8 * * 1-5` (Mac sync-flex.sh) seguían ejecutándose pero todas las requests a IB Flex Web Service devolvían 403 "Access Denied". Los errores iban al log `/tmp/ib-flex-sync.log` que macOS purga al reboot. Sin Telegram alert, fallo invisible 9 días.
- **Fix immediate**: regenerar token en IB Account Management → Settings → Reports → Flex Web Service. Subir nuevo token con `wrangler secret put IB_FLEX_TOKEN`. Actualizar `sync-flex.sh` con nuevo valor.
- **Prevención (CRÍTICA)**:
  - **Freshness check**: `/api/audit/full` debe verificar `MAX(fecha) FROM dividendos` y `MAX(date) FROM cost_basis`. Si gap > 5 días desde hoy (excluyendo weekends) → Telegram CRITICAL.
  - **Log persistente**: cron Mac → log a `~/Library/Logs/ayr-sync-flex.log` (no `/tmp`).
  - **Self-test cron**: el script Mac debe verificar `<Status>Success</Status>` en respuesta XML; si encuentra `<ErrorCode>` → echo a stderr + exit 1 (cron mailx alert).
  - **launchd con WakeUp**: cambiar de `crontab` a launchd plist con `<key>WakeUpForSchedule</key><true/>` para que despierte el Mac si está dormido.
- **Archivos**: `api/sync-flex.sh`, `api/src/worker.js` `/api/audit/full`, `~/.crontab`
- **Lección meta**: SIEMPRE freshness alert para data-pulling crons. Anti-pattern: cron que falla silentemente. Ya documentado en memoria `feedback_silent_failures.md` pero ahora con caso concreto.
- **Commit**: 2026-05-10

### Bug #016 — IB Bridge container exits sin auto-restart
- **Síntoma**: Container `ib-gateway` en NAS Synology pasaba de `running healthy` a `exited` periódicamente. NAV/positions/quotes endpoints intermittent 503.
- **Causa raíz**: ib-gateway requiere 2FA challenge cada ~24h. Si no se acepta el push notification en app móvil IBKR, container se queda en limbo y eventualmente exited. CLAUDE.md explícitamente menciona "Sin AUTO_RESTART_TIME (evita 2FA forzoso durante vuelos del usuario)" — trade-off conocido.
- **Fix immediate**: `/api/ib-bridge/control/start` arranca container, user acepta 2FA en app IBKR.
- **Prevención**:
  - Telegram alert si `/api/ib-bridge/control/status` reporta `state: exited` durante >2h.
  - Frontend `IBControlButton` ya muestra 🔴/🟡/🟢 — extender con badge "?" si state estable >24h sin reinicio.
  - **NO añadir AUTO_RESTART_TIME** (rompe vuelos sin 2FA disponible).
- **Archivos**: NAS Synology, frontend `IBControlButton`, posible nuevo `/api/health/ib-bridge` con SLA monitoring.
- **Commit**: 2026-05-10

### Bug #017 — Identidades de ticker incorrectas en análisis viejos (5 casos)
- **Síntoma**: Análisis Veredicto Experto describían empresas distintas a las que el ticker realmente apunta:
  - HKG:1052 narrative = Yue Yuen Industrial (footwear) → real = Yuexiu Transport (toll roads)
  - RHI narrative = RHI Magnesita NV (UK refractarios) → real = Robert Half Inc (US staffing)
  - HKG:9616 narrative = "Specialty Business Services / Industrials" → real = Neutech Group (educación China, ex-Neusoft Education rebrand 2025-01-09)
  - LANDP narrative = Series B perpetual non-cumulative → real = Series **C**, perpetual, **cumulative**
  - RAND narrative = Randstad NV (workforce) → real = Rand Capital BDC (fix anterior commit a01ba2b)
- **Causa raíz**: Tickers cortos coinciden con múltiples empresas en distintas bolsas. Sin verificación cruzada explícita, el análisis describía la empresa "más famosa" en lugar de la del ticker real en positions.
- **Fix**: Reescritos los 5 análisis verificando identidad contra HKEX/SEC/Bloomberg.
- **Prevención**:
  - **Identity check obligatorio**: cualquier rewrite de Veredicto Experto debe empezar con curl al `/api/positions/{TICKER}` para ver `name` real, comparar contra el primer paragraph del narrative.
  - **Endpoint nuevo**: `/api/audit/identity` que compara `positions.name` vs primer line del `expert_analyses.narrative`. Flag si tokens significativos no matchean.
  - **WebSearch validation** para HKEX/foreign tickers donde colisiones son más probables.
- **Archivos**: 5 análisis reescritos (commits c6811db, ebb6ccc, c58f8d2, 760766e), endpoint `/api/audit/unsourced` ya existe.
- **Commit**: 2026-05-09 → 2026-05-10

### Bug #018 — Theses con triggers ya disparados sin actualización
- **Síntoma**: Theses v1 de 2026-04-07 con triggers tipo "trigger SELL: dividend cut" mientras realidad ya había ejecutado el cut hace 5+ meses (caso ARE −45% dic-2025). Posición sigue holdeada, thesis no refleja realidad.
- **Causa raíz**: No hay refresh automático que cross-check thesis triggers contra datos actuales. Theses son "set and forget" desde abril.
- **Fix**: Theses v2 actualizadas para 6 holdings (ARE, CLPR, IIPR, MSDL, TEF.MC, HKG:9618).
- **Prevención**:
  - **Cron mensual** que compara cada thesis trigger contra Q+S inputs + recent earnings → flag si trigger probable disparado.
  - **UI badge** en VeredictoExpertoTab: "⚠️ thesis v1 stale 30+ días, post Q1 2026 results" si hay nuevo earnings update sin refresh thesis.
  - **Telegram alert** mensual con tickers que necesitan thesis refresh.
- **Archivos**: 6 theses v2 (commit a9f5954), endpoint `/api/theses` puede extenderse con field `last_validated_at`.
- **Commit**: 2026-05-09

### Bug #019 — `market_value` en `/api/theses/missing` puede inflar weights multi-currency
- **Síntoma**: Misma raíz que Bug #014 pero específicamente afecta `/api/theses/missing` endpoint que usa `market_value` directo para calcular `weight_pct` y filtrar holdings >0.5% NAV sin thesis.
- **Causa raíz**: Línea 17759 worker.js suma `market_value` para `total` y filtra. Si todas las posiciones son USD, OK. Pero si hay posiciones en HKD/EUR/GBP/CAD/AUD, los pesos son moneda mezclada (incorrecto).
- **Fix**: Reemplazar `market_value` por `usd_value` en endpoint missing + cualquier otro endpoint similar.
- **Prevención**: misma que Bug #014.
- **Archivos**: `api/src/worker.js` línea ~17759 endpoint `/api/theses/missing`.
- **Commit**: pendiente fix

### Bug #020 — IB Flex query CLAUDE FULL incompatible con Web Service API (error 1020)
- **Síntoma**: Token nuevo + query existente da error 1020 "Invalid request or unable to validate request" en `SendRequest` API. Mismo error desde browser, Mac, sandbox, Cloudflare Worker — independiente de IP.
- **Causa raíz**: Query template "CLAUDE FULL" tiene demasiadas Sections marcadas (Account Information con 37 fields, Borrow Fees Details, etc.) — output XML excede límite Web Service. Period 365 días + 4 cuentas + sub-accounts F (`U7257686F`, `U7953378F` que ya no existen) agrava el problema.
- **Fix**: download manual XML desde web → POST a `/api/ib-flex-import`. O crear query nueva minimal (Trades + CashTransactions + Transfers, Period 30 days, 4 accounts) específicamente para Web Service.
- **Prevención**:
  - Documentar workflow: Web Service queries deben tener < N sections, periods cortos, accounts validadas.
  - Implementar **fallback automático**: si `/api/ib-flex-sync` da 1020 dos veces seguidas, Telegram CRITICAL pidiendo XML manual download.
- **Archivos**: `api/sync-flex.sh`, `api/src/worker.js` `/api/ib-flex-sync`.
- **Commit**: 2026-05-10

### Bug #021 — POST /api/gastos auth regresión recurrente (PWA sync roto) (2026-05-18) ⚠️ 3ª regresión
- **Síntoma**: el usuario abre el PWA `gastos.html` desde el móvil, añade gastos, pero
  el badge "X pendientes de sincronizar" nunca baja. Los gastos quedan colgados en
  IndexedDB local sin poder llegar a D1. **Esta es la 3ª vez** que se reporta (2026-05-04,
  fecha intermedia desconocida, 2026-05-18). Frustración del usuario: "ya no recuerdo
  cuántas veces hemos tenido que arreglarla".
- **Causa raíz**: el código `POST /api/gastos` en `worker.js` requería `X-AYR-Auth`
  con el patrón estricto `const unauth = ytRequireToken(request, env); if (unauth) return unauth;`.
  Los PWAs instalados pre-2026-05-01 no tienen el monkey-patch de `main.jsx`
  que añade el header automáticamente → 401 en cada sync. El comentario encima del
  endpoint decía "auth removed" pero el código real seguía llamando `ytRequireToken`
  → comentario y código divergían. La regresión vuelve cada vez que alguien rebasea
  o copia código de otros endpoints WRITE (PUT, bulk-update, etc.).
- **Fix permanente**: usar el patrón origin-aware idéntico a `DELETE /api/gastos/:id`:
  ```js
  { const _ua = (isAllowed && origin) ? null : ytRequireToken(request, env); if (_ua) return _ua; }
  ```
  Permite POST sin auth desde orígenes CORS-allowed (ayr.onto-so.com, *.pages.dev,
  localhost), pero requiere auth desde curl/external. Mismo patrón que ya usa DELETE.
- **Prevención (CRÍTICA)**:
  - `frontend/tests/regressions/bug-gastos-sync-auth.test.js` lee `worker.js` y verifica
    el patrón en POST/PUT/DELETE de `/api/gastos`. Si reaparece el patrón PROHIBIDO
    `const unauth = ytRequireToken(...); if (unauth) return unauth`, el test rompe.
  - Test adicional verifica que `gastos.html` usa `api.onto-so.com` (no workers.dev).
- **Smoke test live (debe siempre pasar)**:
  ```bash
  # ✅ 200 — POST desde origin allowed sin auth
  curl -X POST https://api.onto-so.com/api/gastos -H "Origin: https://ayr.onto-so.com" \
    -H "Content-Type: application/json" \
    -d '{"fecha":"2026-05-18","categoria":"OTH","importe":1,"divisa":"EUR"}'
  # ✅ 401 — origin no allowed
  curl -X POST https://api.onto-so.com/api/gastos -H "Origin: https://evil.com" -d '{}'
  ```
- **Archivos**: `api/src/worker.js` líneas ~10345, `frontend/public/gastos.html`,
  `frontend/tests/regressions/bug-gastos-sync-auth.test.js`.
- **Commit**: 2026-05-18, worker version `de7a38eb`.

### Bug #022 — Worktree git sin .env.local → frontend bundle con token vacío (2026-05-18)
- **Síntoma**: tras `git worktree add`, hacer `npm run build && wrangler pages deploy`
  desde el worktree resulta en 11+ endpoints devolviendo 401: `/api/positions`,
  `/api/dividendos`, `/api/patrimonio`, `/api/fire`, etc.
- **Causa raíz**: `.env.local` está en `.gitignore` (correcto — contiene `VITE_AYR_TOKEN`).
  Al crear un worktree NO se copia. Vite hace `import.meta.env.VITE_AYR_TOKEN = undefined`
  → token bundleado vacío → monkey-patch en `main.jsx` setea `X-AYR-Auth: ''` → 401.
- **Fix immediate**:
  ```bash
  cp /Users/ricardogarciaontoso/IA/AyR/frontend/.env.local <worktree>/frontend/.env.local
  npm run build && npx wrangler pages deploy dist
  ```
- **Prevención**: pre-build check en `vite.config.js` que aborte si `VITE_AYR_TOKEN`
  vacía en producción. Documentar en `CLAUDE.md` del worktree.
- **Lección meta**: archivos en `.gitignore` son frecuentemente REQUIRED para que el
  producto funcione. Crear worktree = pensar en copiarlos.
- **Commit**: 2026-05-18.

---

## 📊 Estadísticas hoy 2026-05-03

- 11 bug patterns catalogados
- 333 issues activos detectados por `/api/audit/full`
- 5 sectores auto-corregidos vía auto-fix
- Cron diario activo: 08:00 UTC con Telegram alert si regresión

## Próximas mejoras propuestas (orden de impacto)

1. **Validators centralizados** — `frontend/src/validators/` con schemas para Position, Trade, Dividend, Fundamental
2. **Regression tests** — tests/regressions/ con un test JSON-snapshot por cada bug catalogado aquí
3. **Pre-deploy smoke test** — script que ejecuta `/api/audit/full` antes de cada deploy y bloquea si hay nuevos red
4. **CI/CD básico** — GitHub Actions: build + audit + lint en cada push antes de merge
5. **Error tracking en producción** — endpoint `/api/error-log` que recibe JS errors silenciosos del frontend
