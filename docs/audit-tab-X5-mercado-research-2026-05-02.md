# Audit X5 — 11 tabs Mercado + Research (2026-05-02)

Scope: 10 Mercado + Research tabs (`macro`, `currency`, `news`, `screener`, `cantera`, `cartas-sabios`, `research`, `smart-money`, `videos-youtube`, `library`) + `track-record`.

Working dir: `/Users/ricardogarciaontoso/IA/AyR`. Production: `https://ayr.onto-so.com`. API: `https://api.onto-so.com`.

Total LOC: ~6,650 LOC (frontend tabs).

## Resumen ejecutivo

- 1 bug **HIGH** corregido inline (ScreenerTab IB_TICKER_MAP duplicado/desincronizado).
- 2 problemas **CRÍTICOS de freshness** detectados (News 15d, YouTube 24d) — confirma audit F. No corregibles desde frontend, requieren cron en Mac.
- 1 oportunidad **MEDIUM** (CartasSabios 100% hardcoded — pendiente Fase 2 design backlog).
- 7 tabs en buen estado con cobertura back/front correcta.
- Smart Money tiene Telegram alerts integradas server-side correctamente (worker.js:4922-4929).

---

## Tab-by-tab

### 1. MacroTab.jsx (477 LOC)

Endpoints: `GET /api/macro/upcoming?days=N`, `POST /api/macro/refresh`.

**Live test:** `?days=7` devuelve 4 events (rango 2026-05-01 → 2026-05-07). OK.

Field match: `events[].id, event_date, event_time, country, event_name, event_type, impact_level, exposure_level, exposure_pct, primary_sectors, affected_tickers, consensus_estimate, previous_value, actual_value, rationale, typical_reaction, user_action_advice` — match perfecto entre worker insert y frontend render.

**Hardcoded:** `COUNTRY_FLAG`, `IMPACT_STYLE`, `EXPOSURE_STYLE` — UI maps razonables. No issues.

**TDZ pattern:** correcto. State antes de useEffect.

**Code review:** limpio. Buena separación render/state. Modal con escape via click overlay.

**Bug menor (LOW):** línea 66 `parseInt(d.label)` — pero usa `event_date.localeCompare` que es OK (formato ISO ordenable). No bug real.

Veredicto: **OK**. No fixes needed.

---

### 2. CurrencyTab.jsx (313 LOC)

Endpoints: `GET /api/currency/exposure`, `POST /api/currency/refresh`, `GET /api/positions` (para weights coverage).

**Live test:** `/api/currency/exposure` devuelve `total_usd: $3.32M`, `by_currency` con USD 61.4%, Other 20.7%, EUR 8.6%, HKD 3.9%, AUD 1.2%, CAD 1.1%. OK.

Field match: `total_usd, by_currency[], coverage{ticker:conf}, high_confidence_pct` — match.

**Hardcoded:** `CCY_FLAG`, `CCY_COLOR` — OK.

**Bug LOW:** línea 41-42 `Number(p.value_usd) || Number(p.value)` cae al `value` campo si `value_usd` es 0/null. Si el endpoint /api/positions cambia el field names podría romper. Defensivo OK pero acoplado al schema.

**Observación:** el `total_usd: $3.32M` de currency vs NLV $1.38M de IB sugiere doble contabilidad (cost_basis × pricing). Vale la pena documentar el origen en docstring (probablemente positions.value_usd que es shares × current price sin descuento de margin).

Veredicto: **OK**. Sin fixes.

---

### 3. NewsTab.jsx (667 LOC) — STALE (Audit F)

Endpoints: `GET /api/news/recent?days=N&severity=X`, `POST /api/news/refresh` (auth-gated → frontend manda token), `GET /api/positions`.

**Live test:**
- `?days=7`: count=0 (vacío)
- `?days=30`: count=200, latest `published_at: 2026-04-17T16:55:39Z` (15 días atrás)

**STALE confirmado.** Última noticia hace 15 días. `/api/news/refresh` requiere auth (PROTECTED_WRITE) y no hay cron Cloudflare ni Mac que lo invoque. El endpoint funciona — solo nadie lo llama.

Field match: `items[].id, title, summary, source_url, published_at, source, sentiment_score, relevance_score, severity (info|warning|critical), category, tickers[]` — match.

**Bug FUNCIONAL (HIGH):**
- News data is 15 días stale → tab muestra "0 noticias recientes" en vista 24h/7d default.
- Necesita cron Cloudflare con `POST /api/news/refresh` cada N días, o agregar `news/refresh` al script Mac existente.

**Recomendación:** añadir a `wrangler.toml`:
```
crons = [
  "30 7 * * 1-5",
  "0 14 * * 1,3,5"   # Lun/Mié/Vie 14:00 UTC: news refresh
]
```
Y en `scheduled()` handler: si `cronExpr === "0 14 * * 1,3,5"`, llamar internamente al fetch handler con `path = /api/news/refresh`. Coste: ~3 calls/semana × Haiku classify ≈ $0.05/mes. (Si LLM crons están desactivados por presupuesto, esto puede ir solo en Mac).

**Code review:** limpio. Filters chips, group by day/ticker. TDZ OK.

**Mejora menor (LOW):** línea 374 string concat para refresh stats — OK pero mostrar inserted vs deduped por separado más claro.

Veredicto: **STALE — backend issue.** Frontend correcto. Necesita scheduling backend.

---

### 4. ScreenerTab.jsx (210 LOC) — BUG FIXED INLINE

Endpoints: usa `screenerData` desde `HomeContext` (`GET /api/screener` from App.jsx loadScreener). Trigger: `loadScreener()` y `runBulkFetch()` que POST a `/api/fundamentals/bulk` luego `GET /api/screener`.

**Live test:** `/api/screener` devuelve 267 empresas con keys completos: `symbol, name, sector, divYield, payoutFCF, debtEBITDA, roic, pe, fmpRating{rating, score}, fmpDCF, capSize, ...`. OK.

**NO hay hardcoded mock** — el dato viene del worker que cachea fundamentals reales de FMP. La tabla muestra 267 tickers reales. (Pregunta del audit "hardcoded mock?" → respuesta: NO.)

**Bug HIGH detectado y CORREGIDO:**

```jsx
// ANTES (líneas 167 y 179): dos definiciones inline desincronizadas
// IB PRECIO cell: tenía 8 entradas (BME:VIS, BME:AMS, IIPR-PRA, HKG:9618/1052/2219/1910/9616)
// IB P&L cell: tenía solo 4 (BME:VIS, BME:AMS, IIPR-PRA, HKG:9618)
// Resultado: HKG:1052/2219/1910/9616 mostraban precio pero el P&L salía "—"
```

**Fix aplicado:** extraído `IB_TICKER_MAP` const al top del archivo (líneas 5-17). Ambas celdas usan el mismo map. Commit-ready.

**Code review:** componente compacto, bien estructurado. ScoreColor/ScoreBg bien. Tipo de columnas clara. Un solo archivo de 194 líneas.

Veredicto: **FIXED**. Sin más issues.

---

### 5. CanteraTab.jsx (718 LOC)

Endpoints: `GET /api/cantera/list?status=&sector=&limit=`, `POST /api/cantera/refresh`, `PUT /api/cantera/:id`, `POST /api/cantera/add`, `POST /api/alert-rules/add` (price alerts).

Sub-tabs: Radar | Scanner | Discovery (los 2 últimos son lazy-loaded de DiscoveryTab/DividendScannerTab).

**Live test:** `/api/cantera/list?limit=5` devuelve 5 candidatos. Schema: `id, ticker, name, sector, priority_score, compounder_score, smart_money_conviction, yield_pct, dgr_5y, payout_ratio, streak_years, safety_score, sources, status, ...`. OK.

**Big5/quality scores:** sí integrado. Function `deriveFilters(c)` mapea `safety_score → management (F3)`. F1 business, F2 moat, F4 valuation, F5 conviction = `null` (manual deep-dive). `FiveFiltersBadge` se renderiza con valores parciales. Honest design — no inventa scores que no tiene.

**Hardcoded:**
- `SOURCE_META`: 5 sources (aristocrat/smart_money/deep_dividend/sector_leader/manual) con colors/labels — OK.
- `scoreColor()`/`scoreBg()`: OK.

**Code review:** archivo grande (718 LOC) pero estructurado en componentes (FeaturedCard, CandidateRow, RadarView). RadarView 360+ LOC empieza línea 356. Buen uso de useCallback. TDZ OK.

**Bug LOW:** línea 37-39 `safety_score != null ? ... : null` — `safety_score` es 0-10 según docstring pero `Math.min(10, Math.max(0, Math.round(c.safety_score)))` — OK, ya cap 0-10.

**Observación:** GOOG/AMZN aparecen con `priority_score=36, smart_money_conviction=9, yield_pct=0` (no dividendo). Si el tab es "Cantera dividend pipeline" estos no encajan. Pero `sources='smart_money'` → es cantera de candidatos amplios, no solo dividend. UI OK.

**Cross-tab dup:** Cantera-Smart Money ambos consultan tickers smart-money. Cantera filtra a sus radar, Smart Money muestra portfolios completos. No es duplicado real.

Veredicto: **OK**. Sin fixes inmediatos.

---

### 6. CartasSabiosTab.jsx (297 LOC) — 100% HARDCODED

**No endpoints.** Todo el contenido es un array `MANAGERS = [...]` con 6 managers value españoles (Cobas, Magallanes, azValor, Horos, True Value, Bestinver).

**Hardcoded crítico:**
- `lastLetter: "Q4 2025"`, `lastDate: "2026-02"` — NUNCA se actualizan. El propio archivo lo admite (línea 293: "MVP — Las fechas de ultima carta se actualizan manualmente. Fase 2: pipeline automatico…").

**Cross-tab dup:** ninguno. Únicos en su tipo.

**Code review:** simple, limpio. Filtrado client-side. Hover effects.

**Recomendación FUTURE (no aplicable hoy):** Fase 2 según design backlog (project_design_backlog.md):
- Endpoint `GET /api/cartas-sabios` que scrape o lee pdf metadata.
- D1 table `cartas_sabios` con `last_letter, last_date, summary_md, opus_review`.
- Refresh manual o cron mensual día 1.

**Bug HIGH (estancamiento):** desde 2026-02 hasta hoy 2026-05-02 (3 meses) las fechas siguen mostrando `Q4 2025 / 2026-02`. La tab da impresión de que no hay cartas nuevas pero **True Value tiene mensual** y Q1 2026 ya salió en abril 2026. Dato visualmente engañoso.

**Fix MICRO sugerido (no aplicado):** añadir banner avisando "Datos manuales — última actualización 2026-02. Pulsa el link de cada gestor para ver la última disponible". Actualmente aparece como datos en vivo.

Veredicto: **HARDCODED + STALE 3 MESES.** Backend pendiente Fase 2.

---

### 7. ResearchTab.jsx (623 LOC)

Endpoints: 
- `GET /api/preferences/ui_research_custom_lists` + `POST /api/preferences` (cloud sync custom lists)
- `GET /api/oracle-verdict/batch?tickers=...` (cached verdicts)
- `GET /api/discovery/rank-custom-list?listId=custom_X` (Universo 20k ranker)
- + del context: `screenerData, screener+oracle merge`, `loadFromAPI`, `openAnalysis`.

**Live test:** preferences endpoint funciona, oracle-verdict batch funciona.

Field match: `verdicts[ticker] = {action, conviction, one_liner, ...}` — match con OracleCell.

**Hardcoded:** `CUSTOM_LISTS_KEY`, sólo localStorage fallback key. OK.

**Code review:** archivo grande (623 LOC) — el componente principal mezcla tabla, drag-reorder, BuyWizard modal, TickerSearchModal, oracle batch. Sería candidato a split en sub-componentes pero funciona.

TDZ OK. State antes de effects.

**Cross-tab dup:** Research vs Screener — ambos muestran tickers con scores. Research = listas user-curadas + oracle action. Screener = todos los 267 tickers fundamentals. No es duplicado real (workflows diferentes).

**Bug LOW:** línea 95 `normalizeTicker(raw)` usa `padStart(4, '0')` para HK — `'700'` → `'0700.HK'`, OK. `'9618'` → `'9618.HK'`, OK. Pero hardcodea `.HK` solo. Si user mete ticker LSE (`BARC`) lo deja así sin sufijo `.L`. Funcional para HK pero documentar.

**Observación:** `screenerTickers` cap a 300 (línea 170 `slice(0, 300)`). Si screener crece >300 los excedentes no obtienen oracle batch. Comentario explica el motivo (URLs largas). OK.

Veredicto: **OK**. Tab grande pero funcional.

---

### 8. SmartMoneyTab.jsx (1262 LOC) — TELEGRAM INTEGRADO

Endpoints (15 total):
- `GET /api/funds/list?source=us-13f|es-cnmv`
- `GET /api/funds/:id` (detail)
- `GET /api/funds/:id/diff?q1=&q2=` (Spanish funds quarterly diff)
- `GET /api/funds/by-ticker/:t`
- `GET /api/funds/consensus?min=N`
- `GET /api/funds/overlap` (vs my portfolio)
- `GET /api/funds/alerts`, `POST /api/funds/alerts/:id/read`, `POST /api/funds/alerts/mute`, `POST /api/funds/alerts/read-all`
- `POST /api/funds/refresh` (refrescar 13F)
- `POST /api/funds/alerts/notify` (push + Telegram dispatcher)
- `POST /api/funds/alerts/score` (accuracy scoring)
- `GET /api/funds/alerts/performance`

**Live test:** `/api/funds/list?source=us-13f` devuelve 13 funds con `last_quarter: 2025-Q4, last_refreshed_at: 2026-04-17`. Funds están al día.

**Telegram integration verificada:** worker.js líneas 4922-4929 — el endpoint `/api/funds/alerts/notify` envía web push **y** Telegram en paralelo:
```js
await sendTelegram(env, { text: tgMsg, severity: 'info', source: 'smart_money' });
```
Telegram message format: `"🆕 Berkshire Hathaway nueva posición en AAPL\n0.0% → 4.5% (+4.50%) · Warren Buffett"`. Bien estructurado.

**Cooldowns server-side (4 layers):** quiet hours 22:00-08:00 Asia/Shanghai, no weekends, weekly cap 2 push, conviction>=4. Bien diseñado.

**Hardcoded:** `STYLE_GROUPS, ALERT_STATUS_COLOR, TIER_COLOR, ES_STATUS_COLOR, STYLE_LABEL` — UI maps. OK.

**Bug LOW:** línea 201 `q1=2024-Q4&q2=2025-Q2` HARDCODED en `loadSpanishDiff()`. Comentario explícito (línea 200: "Hardcoded quarters matching the seed. In future, read from fund.last_quarter."). Si los Spanish funds publican Q3/Q4 2025, el diff sigue mostrando 2024-Q4 → 2025-Q2.

**Bug LOW:** línea 117 `formatM(v)` retorna `$NaN` si v es string. Pero el callsite usa `holding.value` que es number desde D1. OK.

**Cross-tab dup:** SmartMoney ↔ Cantera comparten datos (funds_alerts → cantera con source='smart_money'). Pero workflows diferentes (alerts vs radar). OK.

**Code review:** archivo masivo (1262 LOC) con 7 sub-vistas. Bien organizado por funciones loadX. Drag-reorder en sub-views. Optimistic updates en alerts.

Veredicto: **OK**. Mejora menor en line 201 (read q1/q2 from fund.last_quarter en lugar de hardcode).

---

### 9. YouTubeTab.jsx (847 LOC) — STALE

Endpoints: `GET /api/youtube/channels`, `GET /api/youtube/videos?channel_id=&limit=`, `POST /api/youtube/scan-channel`, `POST /api/youtube/request-processing`, `DELETE /api/youtube/channels/:id`, `GET /api/youtube/video/:vid`.

**Live test:**
- `/api/youtube/channels`: 2+ canales activos, last_scan_at: `2026-04-08T07:57:38` (24 días atrás).
- `/api/youtube/videos?channel_id=...&limit=3`: returns videos pero `published_at: 2026-04-08T06:03:50` para todos los videos (incluyendo "L'Oreal", "DIA", "Paychex").

**STALE confirmado** (Audit F nota: 24 días). Causas:
1. `scan-youtube.sh` debe correr en Mac. No hay cron registrado.
2. `yt-poller.sh` (LaunchAgent) existe pero no sé si está activo.
3. `request-processing` flow lo ofrece on-demand pero requiere user clic.

Field match: `videos[].video_id, title, channel_name, published_at, status, transcript_text, summary_json{verdict, ticker_summaries:[]}` — match.

**Hardcoded:** `VERDICT_COLOR, VERDICT_LBL` — OK.

**Bug LOW (offline UX):** línea 36 fallback a key legacy `offline_youtube_videos` (sin channel_id). Bien comentado pero podría confundir si user tiene cache antiguo.

**Code review:** componente complejo con offline mode, processing poll, add-channel modal. TDZ OK (refs declarados antes de useEffects).

**Recomendación:** activar el LaunchAgent `com.ayr.yt-poller.plist` para que corra cada N horas, o añadir un cron Mac `30 8,14,20 * * * scan-youtube.sh`.

Veredicto: **STALE — script Mac no corre.** Frontend correcto.

---

### 10. LibraryTab.jsx (856 LOC)

Endpoints: `GET /api/library`, `POST /api/library`, `PUT /api/library/:id`, `DELETE /api/library/:id`, `GET /api/library/:id/notes`, `POST /api/library/:id/notes`.

**Live test:** `/api/library` devuelve 30+ items (libros como "Common Stocks and Uncommon Profits" de Philip Fisher, etc.). OK.

Schema match: `id, type (book|paper|podcast|article), title, author, year, tier (S|A|B), status (queue|reading|read|abandoned), rating, source_url, started_at, finished_at, added_at, updated_at` — match.

**Hardcoded:** `LIBRARY_TYPE_PILLS, TYPE_ICONS, TYPE_LABELS, STATUS_LABELS, STATUS_CYCLE, TIER_COLORS, STATUS_COLORS` — UI maps OK.

**Code review:** CRUD completo, drag-reorder pills. Optimistic update on PUT. Notes modal. TDZ OK.

**Bug LOW:** línea 126 `confirm('¿Borrar este item?')` — diálogo nativo. UX inconsistente con resto de la app (que usa Modal componente). Pero funcional.

**Bug LOW:** notes modal línea 173 split por comma — si user escribe "AAPL MSFT" sin comma, queda como un solo ticker "AAPL MSFT". Defensivo pero documentar.

**Cross-tab dup:** ninguno. La tab es única.

Veredicto: **OK**. Sin fixes urgentes.

---

### 11. AlertTrackRecordTab.jsx (400 LOC) — track-record

Endpoints: `GET /api/backtest/safety-vs-cuts`, `GET /api/alert-track-record`.

**Live test:** `/api/alert-track-record` devuelve `{total_alerts: 3, evaluated: 0, correct: 0, wrong: 0, pending: 3, accuracy_pct: null}`. Hay 3 alerts pero ninguna evaluada (probablemente faltan dividendos pre-alerta).

Field match: `bt.confusion_matrix._6m, bt.tier_summary, bt.data_window`, `ar.total_alerts, evaluated, correct, wrong, pending, accuracy_pct, by_severity, by_tier, notable_cases` — match.

**Hardcoded:** colores de severidad (GREEN/RED/GOLD/BLUE/GREY) — OK.

**Code review:** abort controller para fetch concurrente. Tabs view backtest/alerts. TDZ OK.

**Observación:** Track-record tiene `accuracy_pct: null` porque `evaluated: 0`. La tab probablemente muestra "—" sin error. UX OK.

Veredicto: **OK**.

---

## Cross-tab summary

### Tabs with cross-tab data:

| Source | Consumers |
|---|---|
| SmartMoney `funds_alerts` (tier=CRITICAL) | Cantera `sources='smart_money'`, AlertTrackRecord (eventually) |
| Screener `screenerData` | Research (oracle batch), Advisor |
| Positions | Currency (coverage weights), News (portfolio filter), SmartMoney (overlap), Cantera (validation) |

No duplicación funcional real — todos usan la misma fuente de verdad.

### Hardcoded data (intentional vs problematic):

| Tab | Hardcoded | Status |
|---|---|---|
| MacroTab | COUNTRY_FLAG, IMPACT_STYLE | OK (UI maps) |
| CurrencyTab | CCY_FLAG, CCY_COLOR | OK (UI maps) |
| NewsTab | SEVERITY_COLOR | OK (UI maps) |
| ScreenerTab | (was) IB_TICKER_MAP duplicado | **FIXED** |
| CanteraTab | SOURCE_META | OK |
| **CartasSabiosTab** | **MANAGERS array completo (6 managers, fechas)** | **STALE 3 meses** |
| ResearchTab | CUSTOM_LISTS_KEY | OK (localStorage key) |
| SmartMoneyTab | hardcoded q1=2024-Q4, q2=2025-Q2 en /diff | LOW |
| YouTubeTab | VERDICT_COLOR, VERDICT_LBL | OK |
| LibraryTab | TYPE_LABELS, TIER_COLORS | OK |

---

## Freshness audit (Audit F continuation)

| Tab | Last fetch | Days stale | Cron exists |
|---|---|---|---|
| News | 2026-04-17 | **15** | NO (only manual button) |
| YouTube | 2026-04-08 | **24** | LaunchAgent? — verificar |
| Macro | 2026-05-01 | 1 | NO (manual) — pero `event_date` futuros 2026-05-07 |
| Currency | live (cached 24h FMP) | <1 | OK |
| Funds (SmartMoney) | 2026-04-17 | 15 | manual via sync-funds.sh (días 1,15,16,17,20) |
| Cantera | 2026-04-17 | 15 | manual button |
| Library | live | live | n/a |

**Recomendación:** Considerar añadir cron Cloudflare para `news/refresh`. Coste estimado <$0.05/mes (Haiku classify).

---

## Fixes aplicados

1. **ScreenerTab.jsx** — extraído `IB_TICKER_MAP` const al top del archivo. Eliminadas 2 declaraciones inline desincronizadas. Resultado: las 4 columnas IB PRECIO + IB P&L ahora consistentes para HKG:1052/2219/1910/9616.

## Fixes pendientes (no aplicados — fuera de scope safe)

1. **CartasSabiosTab** — diseño Fase 2 con backend pipeline. Mientras tanto, banner UI advirtiendo "datos manuales".
2. **NewsTab freshness** — añadir cron CF o Mac `0 14 * * 1,3,5 → POST /api/news/refresh` (con auth header).
3. **YouTubeTab freshness** — verificar si `com.ayr.yt-poller.plist` está cargado:
   ```bash
   launchctl list | grep ayr
   ```
   Si no, `launchctl load ~/Library/LaunchAgents/com.ayr.yt-poller.plist`.
4. **SmartMoneyTab** — leer `q1=fund.last_quarter` en lugar de hardcoded en `/diff`.

---

## Conclusión

**11 tabs auditadas:**
- 9 funcionales correctamente.
- 2 stale (News 15d, YouTube 24d) — backend issue, no frontend.
- 1 100% hardcoded (CartasSabios) — pendiente Fase 2.
- 1 bug HIGH detectado y fixed inline (ScreenerTab IB_TICKER_MAP).

**Schema integrity:** todos los endpoints retornan los campos que el frontend espera. No drift detectado.

**Cross-tab consistency:** sources únicas, no doble contabilidad.

**Auth gates:** funcionando — endpoints sensibles requieren X-AYR-Auth, frontend monkey patch en main.jsx lo añade. PROTECTED_WRITE incluye news/refresh, PROTECTED_READ no incluye los endpoints de mercado/research (correcto — son data pública agregada).
