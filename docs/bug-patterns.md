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
