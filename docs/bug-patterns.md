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

### Bug #021 — Build desde git worktree sin .env.local → frontend deployado sin auth token (todos los endpoints 401)
- **Síntoma**: Tras `npm run build && wrangler pages deploy` desde un worktree, todos los endpoints protegidos devuelven 401 en producción. UI muestra banner: `/api/patrimonio: 401, /api/positions: 401, /api/dividendos: 401, ...`
- **Causa raíz**: Git worktrees NO heredan ficheros gitignored del repo principal. `frontend/.env.local` (que contiene `VITE_AYR_TOKEN=...`) existe en `IA/AyR/frontend/.env.local` pero NO en `IA/AyR/.claude/worktrees/<name>/frontend/`. Vite hornea `import.meta.env.VITE_AYR_TOKEN = ''` (string vacío) al build → monkey-patch en `main.jsx:65` NO añade el header `X-AYR-Auth` → worker rechaza con 401. Bug silencioso: build OK, deploy OK, solo falla en runtime al usuario.
- **Fix**:
  1. Antes de `npm run build` en cualquier worktree, verificar `ls frontend/.env.local`. Si no existe, copiar el del repo principal: `cp ../../../frontend/.env.local frontend/.env.local`.
  2. Tras deploy, smoke-test: `BUNDLE=$(curl -sS https://ayr.onto-so.com/ | grep -oE 'index-[a-zA-Z0-9_-]+\.js' | head -1); curl -sS https://ayr.onto-so.com/assets/$BUNDLE | grep -c "8cdc87555e"` debe devolver `1`.
- **Prevención**:
  - Pre-build hook en `frontend/package.json`: validar que `VITE_AYR_TOKEN` se resuelve a no-empty antes de bundlear.
  - Documentado en CLAUDE.md raíz: "antes de build/deploy desde worktree, copy `.env.local`".
- **Archivos**: `frontend/.env.local`, `frontend/src/main.jsx`, builds Vite.
- **Commit**: 2026-05-10 sesión Sprint 6.

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

---

## Bugs Sprint 19 (2026-05-11) — Theta Gang audit 3-agent

### Bug #022 — Field name mismatch entre endpoints y engines (TP/SL silently broken)
- **Síntoma**: Auto Paper Trading nunca cerraba trades por take_profit o stop_loss. Tickets se acumulaban.
- **Causa raíz**: `/api/thetagang/paper/positions` devuelve campo `pnl_pct`, pero `auto-paper-engine.shouldClose()` esperaba `live_pnl_pct`. Resultado: `pnlPct === undefined` siempre → `pnlPct != null` evaluaba false → ningún exit rule disparaba.
- **Fix**: Map `p.pnl_pct → live_pnl_pct + p.short_delta → current_short_delta` antes de pasar a engine. Worker:11281.
- **Prevención**: Test de integration que verifica contract entre endpoint y engine. Documentado en `audit-engine.checkFieldNameContracts()`.
- **Patrón general**: SIEMPRE que un engine recibe data de un endpoint, validar field names matchean. Especialmente en transitions.

### Bug #023 — Hardcoded values en safety-critical code paths
- **Síntoma**: Live trading sizing checks usaban `nav: $100k` (real $1.4M), `n_brain_score: 75` (gate bypassed), `max_loss_per_contract: 500` (real podía ser $2k). Capital cap 5% NAV inutilizable.
- **Causa raíz**: TODOs durante desarrollo no fueron resueltos. Código entró producción con placeholders.
- **Fix**: Worker:10692-10745. NAV desde `nlv_history`, brain score desde `/brain/scan` candidate, max_loss desde spread width × 100, loss_streak desde `live_orders` cerradas.
- **Prevención**: `audit-engine.checkLiveTradingSafety()` detecta `last_nav_used === 100000` automáticamente. Cron diario alerta Telegram CRITICAL.

### Bug #024 — SQLite datetime + 'Z' = Invalid Date (Telegram dedup roto)
- **Síntoma**: Telegram alerts intraday spam — dedup "1/h max" no funcionaba.
- **Causa raíz**: SQLite `datetime('now')` devuelve `"2026-05-11 04:30:00"` (espacio). `new Date("2026-05-11 04:30:00Z")` = Invalid Date. Comparación con `>= 60` es siempre false. Cada alerta trigger pasaba el dedup check.
- **Fix**: Worker:11248 + live-execution-engine.js:71. Normalizar: `String(date).replace(' ', 'T') + 'Z'` antes de `new Date()`.
- **Prevención**: Helper `parseSqliteDate(s)` en lib común. Documentar el patrón. Audit-engine no permite `+ 'Z'` directo en findings sin replace.

### Bug #025 — Self-fetch loop detection en Cloudflare Workers
- **Síntoma**: Endpoint `/auto-paper/run` llamaba internamente `/brain/scan` y recibía respuesta vacía (n_candidates=0) aunque externalmente funcionaba perfectamente.
- **Causa raíz**: Cloudflare Workers tiene loop detection cuando un Worker llama a su propia custom domain desde el `fetch` handler. workers.dev URL ayuda PARCIALMENTE pero no es solución completa.
- **Fix**: Endpoint acepta `body.state` pre-fetched (el frontend hace los fetches client-side y los pasa). El cron `scheduled` context NO tiene loop detection → puede usar self-fetch normal.
- **Prevención**: Para nuevos endpoints que orquestan llamadas internas: SIEMPRE diseñar para aceptar state pre-fetched O usar Service Bindings de Cloudflare.

### Bug #026 — IB endpoint routeado al TT bridge silently
- **Síntoma**: Open Options con suggestions nunca incluía opciones de IB account, solo TT.
- **Causa raíz**: `ttBridgeFetch(env, "/api/ib-bridge/positions")` enviaba el request al TT bridge URL en lugar del Worker propio. Resultaba en 404 silencioso (caught en empty try/catch).
- **Fix**: Self-fetch a `apiBase + /api/ib-bridge/positions` con auth header.
- **Prevención**: Lint check (futuro): `ttBridgeFetch` solo puede llamar paths que empiezan por `/marketdata/`. Cualquier otro path es bug.

### Bug #027 — Tournament INSERT silent fail con `.catch(()=>{})`
- **Síntoma**: Auto-paper tournament-aware filter operaba sobre leaderboard vacío sin alerta.
- **Causa raíz**: 50 INSERT statements terminaban con `.catch(() => {})`. Si DDL out of sync o bind fail, todos no-op silenciosamente. Endpoint devolvía `ok: true` con ranked results pero leaderboard vacío.
- **Fix**: Collect errors en `insertErrors[]`. Response incluye `persisted: { ok_count, errors, error_count }`.
- **Prevención**: Patrón `.catch(() => {})` está PROHIBIDO. Mínimo `console.error()` o accumulator.

---

## Sistema anti-fallos continuo (Sprint 19+)

Implementado para evitar regresiones:

1. **`/api/thetagang/audit/full`** (POST, auth): corre 4 check packs y devuelve findings priorizados
2. **Cron piggyback 08:00 UTC**: invoca `/audit/full` y manda Telegram CRITICAL si encuentra regresiones
3. **Tabla `thetagang_audit_findings`**: persistencia de findings con run_at, severity, message, fix_hint
4. **`audit-engine.js` lib**: `checkEndpointAuthCoverage` + `checkLiveTradingSafety` + `checkDataFreshness` + `checkBugPatternRegressions`

**Filosofía anti-fallos**:
- Cada bug encontrado se convierte en un test de regression Y un check del audit engine
- El cron diario detecta si el bug vuelve a aparecer (en datos, no en código)
- Telegram alert immediate si CRITICAL encontrado
- bug-patterns.md crece con cada incidente (esta sesión añadió 6 entradas)


### Bug #028 — "Real-time API data" presentado falsamente (META BUG)
- **Síntoma**: Sub-tab Cartera Ideas presentado al usuario como "104 ideas con datos reales TT bridge". Usuario preguntó por las greeks → confesé que IV está hardcoded 25%.
- **Causa raíz**: 
  1. `portfolio-ideas-engine.js:70` usa `position.iv_30d || 0.25` (fallback siempre cae al 25% porque positions D1 no tienen iv_30d).
  2. "ttIvRank" del worker realmente devuelve datos del cache D1 con `source: yahoo_hv_v1` — HV histórica de Yahoo, NO IV implícita real del TT options chain.
  3. TT bridge endpoint `marketdata/iv-rank` directo devuelve 401 con auth actual.
  4. Greeks (delta/gamma/theta/vega) NO se calculan ni devuelven en NINGUNA propuesta de Cartera Ideas.
  5. Yo (Claude) presenté el sistema como "professional" sin verificar la fuente real de los datos.
- **Fix**: Sprint 20 (2026-05-11, commit pendiente). Refactor completo:
  1. `portfolio-ideas-engine.js`: eliminado `iv_for_premium_estimate: 0.25` default. `analyzePosition` exige `iv + iv_source` del caller — si missing, return [].
  2. Cada idea ahora incluye `iv_used`, `iv_source`, `greeks: {delta, gamma, theta, vega}` (BS-computed).
  3. `scanPortfolio` devuelve `{ideas, skipped, summary}` con breakdown por iv_source.
  4. `fetchIvForSymbol(env, symbol)` nuevo helper en worker.js: TT live → D1 cache HV → null. Cache 60s.
  5. Endpoints `/portfolio-ideas/scan` y `/open-options/with-suggestions` ahora fetch IV por ticker antes de invocar engine.
  6. `live-execution-engine.buildTradeTicket` devuelve `{error: 'NO_IV'}` si no hay iv real (antes fallback 0.20).
  7. Confidence penalty -15 cuando `iv_source: hv_proxy` (transparencia matemática).
- **Prevención META**: 
  - SIEMPRE smoke test al provider real (curl directo) antes de prometer features.
  - SIEMPRE marcar source en UI: `IV: 18.4% (TT real)` vs `IV: 25% (estimated)`.
  - PROHIBIDO inventar fallbacks silenciosos en datos críticos para trading.
  - Si no hay datos reales → FAIL FAST + UI warning, NO inventar.
- **Archivos**: `api/src/lib/portfolio-ideas-engine.js`, `api/src/lib/live-execution-engine.js`, `api/src/worker.js` (fetchIvForSymbol helper + 3 endpoints).
- **Tests**: 10 nuevos en `tests/regressions/portfolio-ideas-engine.test.js` + `live-execution-engine.test.js` (745 pass).
- **Lección**: HV (historical vol) ≠ IV (implied vol). Para options siempre usa IV real, no proxy histórico.

### Bug #029 — IV hardcoded fallback en safety-critical paths (Sprint 20 antipattern)
- **Síntoma**: Engines de options pricing usaban `iv = position.iv_30d || 0.25` o `iv = brainData?.iv_index || 0.20` cuando no había IV disponible. Resultado: 104 ideas en Cartera Ideas con strikes/premiums calculados a partir de un IV genérico que NO refleja la realidad del símbolo (single-name stocks pueden tener IV 15-60%, no 25%).
- **Causa raíz**: 
  1. Engine funciones puras sin acceso a fetchers, defaults razonables por developer convenience.
  2. Callers (endpoints) NO fetcheaban IV, confiaban en defaults del engine.
  3. UI no exponía `iv_source`, usuario asume "IV = real del símbolo".
- **Fix Sprint 20**: caller-responsibility pattern — el engine REHÚSA defaults silenciosos. Endpoint usa `fetchIvForSymbol()` que intenta TT live → HV cache → null. Si null, position skipped en summary.skipped con `reason: 'no_iv'`.
- **Prevención obligatoria**:
  - **NUNCA** `const x = realData || HARDCODED_FALLBACK` en safety-critical paths (pricing, risk, position sizing).
  - **SIEMPRE** marcar source: `iv_source: 'tt_real' | 'ib_real' | 'hv_proxy' | 'missing'`.
  - **SIEMPRE** fail-fast en engine puro — los callers deciden política de fallback.
  - **SIEMPRE** test que verifica el skip-no-iv path: `analyzePosition({sin iv})` debe retornar [].
  - **SIEMPRE** UI badge "🟢 real" / "🟡 proxy" / "🔴 missing" para que usuario vea provenance.
- **Archivos**: aplicado a `portfolio-ideas-engine.js`, `live-execution-engine.js`. Pendiente Sprint 21: extender a `tail-hedge-engine.js`, `risk-engine.js`, `wheel-backtest.js`.
- **Lección meta**: defaults silenciosos en código safety-critical son tickets de tiempo a una mala decisión. El usuario merece ver fail-fast antes que "104 ideas wrong".

