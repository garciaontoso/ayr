# Beneficios A&R — Sesión 2026-05-06 (post-Anthropic FSI)

Resumen práctico de cómo te beneficia todo lo que hemos construido hoy.

## 🎯 Antes vs Ahora

### Antes (5-may)
- 11 AI agents propios consumiendo Anthropic API ($$$ cada día)
- 96 Veredictos Experto manuales (formato inconsistente entre tickers)
- Tesis de empresas: badge "missing/done" pero sin tracker activo
- Earnings updates: nadie los hacía sistemáticamente, llegaban tarde
- DCF: placeholder simple sin interactividad
- API Anthropic key rotada → crons fallando silenciosamente
- Ningún sistema te avisaba qué estaba pendiente

### Ahora (6-may)
- **Mismo poder de Claude pero coste $0** vía suscripción Claude Code
- 96+ análisis con formato CONSISTENTE (skill `ar-veredicto-experto`)
- Thesis Tracker scorecard ACTIVO en cada empresa
- Earnings updates auto-detectados + Telegram alert + UI tab nueva
- DCF interactivo con 4 sliders editables + sensitivity 5×5 + persistence
- Workflow inverso: Claude te avisa → tú apruebas → coste $0
- 22 skills oficiales Anthropic disponibles en chat para análisis ad-hoc

## 🔥 Top 5 beneficios concretos (lo que vas a notar)

### 1. **Coste API Anthropic ya NO es bottleneck**
**Antes**: Cada Veredicto Experto, Deep Dividend, earnings analysis costaba tokens. ~$1.50/día con 11 agentes corriendo. La key rotada bloqueó todo.

**Ahora**: 3 patterns "manual upload" funcionando coste $0:
- `ar-veredicto-experto` skill → genera análisis institucional 4-8K palabras → POST upload-manual
- `ar-earnings-update` skill → genera report post-earnings 1500-2500 palabras → POST upload-manual
- Deep Dividend manual workflow ya existía (33 reports hechos así)

**Impacto**: Puedes regenerar TODOS los análisis de tu cartera (76 tickers) por $0. Antes hubiera costado ~$200-400 en tokens.

### 2. **Workflow inverso: Claude te avisa, no al revés**
**Antes**: Tú tenías que acordarte de pedirme "actualiza KO" cuando reportaba. Pasaban días, weeks sin updates.

**Ahora**: Sistema de 3 capas que NO depende de tu memoria:
1. **Cron 8AM UTC daily**: detecta empresas en cartera con earnings pero sin update → Telegram alert con lista + comando exacto
2. **SessionStart hook Claude Code**: cuando abres terminal en /AyR, el hook ejecuta y muestra pendientes automáticamente
3. **UI tab "📊 Updates"** en /AyR Cartera: banner ámbar urgente si hay pendientes

**Impacto**: Solo tienes que decir "vamos con los pendientes" cuando recibas el aviso. Yo me encargo del resto.

### 3. **Thesis Tracker ACTIVO** (no solo badge "missing")
**Antes**: tenías un badge ThesesCoverage que decía "tienes tesis para X tickers" pero las tesis viejas se quedaban olvidadas.

**Ahora**: en la tab Tesis de cada empresa, ves un **Thesis Tracker scorecard** que compara tu tesis original vs datos actuales:
- 4 pilares: Calidad, Seguridad dividendo, Peso cartera, Verdict externo (Deep Dividend)
- Drift flags coloreados:
  - `STALE_THESIS`: thesis >6 meses sin actualizar
  - `CONVICTION_QUALITY_MISMATCH`: conviction 5/5 pero Quality <60
  - `OVERWEIGHT/UNDERWEIGHT`: peso fuera del banda target
  - `DIVIDEND_AT_RISK`: cut probability >30%
  - `VERDICT_CONVICTION_MISMATCH`: verdict TRIM pero conviction alta
- Overall health: 🟢 INTACTA / 🟡 VIGILAR / 🔴 EN RIESGO

**Impacto**: las tesis viejas te SALTARÁN como red flags antes de que se conviertan en pérdidas. Ejemplo PEP: mi thesis decía "Quality ≥70 expected", actual es 56/100 → ⚠ watch trend.

### 4. **DCF interactivo per-ticker**
**Antes**: el DCF tab usaba growth+discount hard-coded. No podías jugar con asunciones.

**Ahora**: panel "🎛️ Asunciones" con 4 inputs editables (slider + number):
- Crecimiento FCF (-10% a 50%)
- WACC (3% a 20%)
- Crecimiento terminal (0% a 5%)
- Años proyección (5-20)

Cada cambio recalcula instant: valor intrínseco, MOS, sensitivity table 5×5, FMP comparison. **TUS asunciones se guardan por ticker en localStorage** — la próxima vez que abras ZTS, ves TU modelo.

**Impacto**: tu Veredicto Experto en chat puede referenciar "según mi DCF custom (g 6%, r 8%)" y el modelo persistido. El DCF ya no es "el de FMP" sino "el tuyo + comparison".

### 5. **22 skills oficiales Anthropic en chat**
**Antes**: tenía que reaprender el formato cada vez que pedías un análisis nuevo. Output inconsistente.

**Ahora**: tengo a mano 22 skills institucionales (equity-research + financial-analysis):
- `morning-note` — daily briefing 2-min format
- `earnings-analysis` — 8-12pp post-report
- `initiating-coverage` — informe nuevo 20-30pp con 5-task workflow
- `dcf-model`, `lbo-model`, `3-statement-model`
- `comps-analysis`, `competitive-analysis`
- `xlsx-author`, `pptx-author` — exports Excel/PPT

Cuando me pides algo, las skills se activan AUTOMÁTICAMENTE por trigger keywords. No tienes que invocarlas con `/`.

**Impacto**: pides *"DCF de PEP"* → skill `dcf-model` se activa con framework JPMorgan/Goldman. Pides *"morning note de mi cartera"* → skill `morning-note` con formato Top Call + Overnight + Today.

## 🛡 Beneficios arquitectónicos (silenciosos pero importantes)

### A1 Write-isolation Deep Dividend
Solo el orchestrator escribe a tablas canónicas. Extractor/Historian/Analyzer/DevilsAdvocate son read-only. **Defense vs prompt injection** desde transcripts maliciosos. Documentado como invariante en código.

### A2 JSON schema validators
`/api/deep-dividend/upload-manual` y `runDeepDividendPipeline` ahora validan shape antes de INSERT:
- ticker regex `/^[A-Z][A-Z0-9._:-]{0,15}$/`
- verdict enum {BUY,ACCUMULATE,HOLD,TRIM,SELL,AVOID,STRONG_BUY}
- confidence enum {low,medium,high}
- scores [0,10] range
- cut_prob [0,1]
- arrays cap 50

**Catches AHRT-style hallucinations** ANTES de llegar a D1. Si Claude devuelve garbage, el endpoint da HTTP 400 con errors[] específicos.

### A3 [UNSOURCED] tag convention + audit endpoint
Cada $X / X% / Xx sin fuente identificable se debe taguear `[UNSOURCED]` literal. Audit endpoint `/api/audit/unsourced` cataloga:
- 125 análisis scanned
- Tier low/med/high según % de números con source dentro de 200 chars

**Estado actual**: 50 low / 73 med / 2 high. RYN y RAND ya movidos a tier-med (de tier-low) hoy.

### A4 Citation rules block en system prompts
3 prompts Opus ahora reciben CITATION_RULES_BLOCK obligando citation discipline:
- deepDividendAnalyzer
- theses/generate (Buffett-style)
- earnings/archive/analyze institutional report

**Impacto**: cualquier nuevo análisis generado vía API tendrá citation discipline AUTO. Los viejos siguen como están hasta reescribirse manualmente.

## 🛫 Para tu vuelo offline

**Antes de despegar** (3 min):
1. Abrir https://ayr.onto-so.com
2. Click ✈️ Modo avión
3. Esperar las 9 fases (~3-5 min):
   - Phase 1: Main data + nuevos endpoints (positions/previously-held, expert-analysis/list, earnings-updates)
   - Phase 4: Price history 30d
   - Phase 5: Dividends + earnings calendar
   - Phase 6: Tax reports
   - Phase 6.5: YouTube videos
   - Phase 6.6: Earnings archive metadata
   - **Phase 7**: Per-ticker (theses + scorecard + expert-analysis + earnings-updates list)
   - **Phase 7.5 NUEVA**: Earnings update markdown bodies cached
   - Phase 8: Elite Desk memos
   - Phase 9: Pre-warm chunks

**En el vuelo, FUNCIONA**:
- Cualquier análisis empresa (Resumen, Tesis con scorecard, FAST, Calidad, Valoración con DCF interactivo, Veredicto Experto, Earnings Updates, etc.)
- Watchlist completa Pastores + Empresas que he tenido (364 tickers) + Cantera + Smart Money
- PnL Tab con toggle Todo/IB/TT
- Earnings Updates accesibles
- Elite Desk memos
- Citaciones SEC en cualquier análisis funcionan offline

**NO funciona offline** (esperado):
- Generar earnings updates nuevos (necesita yo en sesión Claude Code)
- Refresh prices live
- IB Bridge / TT Bridge calls
- Cualquier escritura

## 📋 Pendientes próxima sesión (cuando vuelvas)

### Tier 1 — Quick wins ($0 con Claude Code)
- Reescribir worst-tier UNSOURCED restantes:
  - YYY (15%) — high yield ETF
  - SHUR (16%) — Shurgard storage EU
  - LOG.MC (21%) — Logista Spain (EN PASTORES)
  - HKG.2219 (15%) — Skyworth China
  - IIPR.PRA / IIPR:PRA (11%) — preferred shares (low priority)

### Tier 2 — Features visibles
- Excel monthly snapshot (skill xlsx-author)
- Sector Deep Dive cron mensual con skill sector-overview

### Crítico USUARIO (30 seg)
- `cd /Users/ricardogarciaontoso/IA/AyR/api && npx wrangler secret put ANTHROPIC_API_KEY`
  → desbloquea cron pipeline LLM (Elite Desk seed, agentes diarios, sector-deep-dive)

## 🔍 Bug encontrado hoy

**Ticker collision RAND**: el archivo RAND.md analizaba **Randstad NV** (RAND.AS Amsterdam) pero los docs SEC en R2 son de **Rand Capital Corporation** (NASDAQ:RAND BDC). Eran 2 entidades distintas con stem similar.

**Acción**: corrected RAND.md → ahora analiza Rand Capital BDC. Si tienes posición en Randstad real, debería ir a `RAND_AS.md` separado.

**Lección meta**: revisar otros tickers con potential collision: BME (Bolsa Mexicana vs Madrid), HEN (Henkel vs Henderson), etc. NEMOTÉCNICO MNEMOTÉCNICO siempre verificar transcript content matches expected company.

## 📈 Métricas finales sesión

| Métrica | Valor |
|---|---|
| Commits hoy | 11 (e20968b → a01ba2b) |
| Worker version | c2482df8 |
| Frontend version | index-CpDtmmqU.js |
| Skills custom A&R | 2 (ar-veredicto-experto, ar-earnings-update) |
| Skills oficiales Anthropic | 22 (equity-research + financial-analysis) |
| Endpoints nuevos | 6 (auto-update/run/upload-manual/list/get/pending + audit/unsourced + theses/scorecard) |
| UI tabs nuevas | 1 (📊 Updates) |
| UI tabs redesign | 2 (DCF interactivo + Tesis con scorecard) |
| Análisis worst-tier reescritos | 2 (RYN 13%→59%, RAND 20%→41%) |
| Citation tier_high | 2 (NOMD 72%, LW 70%) |
| Patterns Anthropic FSI adoptados | 4 (A1+A2+A3+B2) + helper (citation rules) + B3 |

## 🎓 Lo más importante a recordar

1. **Coste $0 confirmado** — workflow Claude Code session + upload-manual replicable para cualquier análisis textual futuro
2. **Workflow inverso** — Claude te avisa, no tú te acuerdas
3. **Skills custom A&R codifican TU formato** — los 96 análisis ya escritos no se pierden, se replicar
4. **Architecture patterns Anthropic FSI** — A1 write-iso, A2 schemas, A3 [UNSOURCED] te dan calidad institucional gratis
5. **AirplaneMode descarga TODO** — incluyendo lo nuevo de hoy. Listo para vuelo.

---

*Documento generado por Claude Code para A&R, sesión 2026-05-06. Roadmap próxima sesión + memoria persistida en `~/.claude/projects/.../memory/session_2026-05-06_anthropic_fsi_adaptation.md`.*
