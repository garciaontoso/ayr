# Módulo Earnings Intelligence

> Estado: DISEÑO. No implementar hasta merge de rama paralela.
> Generado 2026-04-07.

---

## Propósito

Cerrar el gap temporal entre señales trimestrales (cartas + 13F que llegan con delay) y los **earnings days**, que son los momentos:
- Donde más decisiones tomas (subir, mantener, vender)
- Donde más errores se cometen por reactividad emocional
- Donde el mercado sobre-reacciona en ambas direcciones (oportunidad de compra/venta)
- Donde las tesis se confirman o se rompen de verdad

**Filosofía**: este módulo NO es para hacer trading de earnings. Es para **tomar decisiones disciplinadas alrededor de earnings** sobre tus posiciones existentes — ¿añadir? ¿reducir? ¿mantener? ¿vender? ¿revisar tesis?

---

## Las 3 partes del módulo

### 1. Pre-earnings briefing (24-48h antes)
Por cada earnings en cartera/watchlist próximos 7 días, briefing con todo lo necesario para no llegar en frío.

### 2. Post-earnings analysis (post-call + transcript)
Automatización que detecta beat/miss, cambios en guidance, cambios en dividendo, y dispara análisis profundo solo cuando es material.

### 3. Surprise tracker + patterns
Histórico de surprises por ticker, patrones estacionales, predictability score.

---

## 1. Pre-earnings briefing

### Trigger
Cron diario 6am — por cada ticker en cartera + watchlist con earnings en próximos 48h, generar briefing si no existe ya.

### Contenido del briefing (auto-generado, sin LLM)

```
📊 EARNINGS BRIEFING — KO Q1'26
Reporte: 26 abril 2026, antes apertura (BMO)
Conference call: 26 abril 2026, 9:00 AM ET

═══════════════════════════════════════════════════
EXPECTATIVAS
═══════════════════════════════════════════════════
EPS consenso:        $0.71  (rango $0.68 - $0.74, 24 analistas)
EPS año anterior:    $0.72
EPS whisper:         $0.73 (+2.8% vs consenso)
Revenue consenso:    $11.2B  (+3.1% YoY)
Revenue año ant:     $10.87B

═══════════════════════════════════════════════════
HISTORIAL DE SURPRISES (8 últimos quarters)
═══════════════════════════════════════════════════
Q4'25: ✓ Beat EPS +2.8% · ✓ Beat Rev +1.2%  · Stock +3.1%
Q3'25: ✓ Beat EPS +1.4% · ✗ Miss Rev -0.5%  · Stock -1.8%
Q2'25: ✓ Beat EPS +4.2% · ✓ Beat Rev +2.1%  · Stock +2.4%
Q1'25: ✓ Beat EPS +2.1% · ✓ Beat Rev +0.8%  · Stock +0.9%
Q4'24: ✓ Beat EPS +3.5% · ✓ Beat Rev +1.8%  · Stock +4.2%
Q3'24: ✓ Beat EPS +1.9% · ✓ Beat Rev +0.4%  · Stock +1.1%
Q2'24: ✗ Miss EPS -0.7% · ✗ Miss Rev -1.1%  · Stock -5.8%
Q1'24: ✓ Beat EPS +3.1% · ✓ Beat Rev +1.5%  · Stock +2.0%

Beat rate EPS:       7/8 (87.5%)
Beat rate Revenue:   6/8 (75.0%)
Surprise media EPS:  +2.3%
Reacción media:      +0.8% día

═══════════════════════════════════════════════════
OPCIONES — IV CRUSH ESPERADO
═══════════════════════════════════════════════════
IV ATM straddle pre:  3.8%   (precio implícito earnings move)
IV ATM straddle pre prev qtr:  4.1%
Move histórico medio: ±2.7%
Implied vs realized:  +40% (mercado sobreestima volatilidad)

═══════════════════════════════════════════════════
REVISIONES DE ANALISTAS (últimos 90 días)
═══════════════════════════════════════════════════
EPS estimate Δ:       +0.8% (from $0.704 to $0.71)
Price target medio:   $68.40 (8 análistas, +9.6% upside)
Upgrades:             1 (Morgan Stanley → Overweight)
Downgrades:           0
Inicia cobertura:     0

═══════════════════════════════════════════════════
KEY METRICS A VIGILAR (definidas en tesis)
═══════════════════════════════════════════════════
✓ Payout ratio < 75%        (último: 67%)
✓ Debt/EBITDA < 2.5         (último: 2.1)
✓ DGR 5y > 4%               (último: 5.2%)
✓ ROIC > 15%                (último: 17.3%)

¿Algún cambio relevante en estas métricas pondría tu tesis en duda?

═══════════════════════════════════════════════════
QUÉ ESCUCHAR EN EL CALL
═══════════════════════════════════════════════════
- FX headwinds Latam (pasado quarter -3% impact)
- Volume orgánico (Q4 fue +2%)
- Price/mix split
- Guidance FY 2026 — actualmente $2.85-2.95
- Comentarios sobre dividend (próximo anuncio raise esperado abril)

═══════════════════════════════════════════════════
TU POSICIÓN
═══════════════════════════════════════════════════
Shares:              530
Avg cost:            $58.20
Current price:       $62.40
P&L:                 +$2,226 (+7.2%)
Weight cartera:      4.2% (target: 4-5% ✓)
Tesis status:        🟢 Al día (revisada hace 2 meses)
Última nota journal: "Subí peso 4.2% tras Q4 miss, FX temporal"
```

### Cómo se construye

Endpoints FMP usados:
```
GET /v3/earning_calendar?from={today}&to={+7d}
GET /v3/earnings-surprises/{ticker}                  # 8 quarters back
GET /v3/historical-earnings-calendar/{ticker}        # historial completo
GET /v3/analyst-estimates/{ticker}
GET /v3/upgrades-downgrades/{ticker}?period=90d
GET /v3/quote/{ticker}                                # precio + IV options chain
```

Más datos internos:
- D1 `positions` para tu posición
- D1 `theses` para metrics a vigilar y status tesis
- D1 `journal_entries` para última nota relevante

**Sin Opus en pre-earnings** — todo es estructurado, plantilla rellenada con datos. Cero coste LLM.

### Notificación

24h antes del earnings:
> 📊 Earnings mañana: KO Q1'26
> Consenso $0.71 EPS · whisper $0.73 · beat rate 87%
> Tu posición 4.2% weight, +7.2% P&L
> Tesis al día. Revisa briefing antes de mercado.
> [Ver briefing] [Skip esta]

Solo para posiciones ≥1% portfolio. Resto solo aparece en calendar, sin push.

---

## 2. Post-earnings analysis

### Two-track approach por coste

**Track A — Auto rápido (sin LLM)**: para todos los earnings
- Detect beat/miss EPS y Revenue
- Calcular surprise %
- Capturar reacción precio (1h, EOD, +1d)
- Detect cambios dividendo (raise/cut/maintain)
- Update D1 con resultados
- Notificación si surprise > 1 std dev histórica

**Track B — Análisis profundo (Opus)**: solo si triggered
Triggers para activar análisis profundo:
1. Position weight ≥ 3% portfolio
2. Surprise > 2 std dev (positiva o negativa)
3. Stock reaction > ±5% día
4. Dividendo cambió
5. Guidance cambió materialmente (>5% revision)
6. Usuario lo solicita manualmente

### Pipeline Track A (Haiku/no-LLM)

Cron post-call (depende de horario empresa):
```
1. Detect que el reporte se publicó (compare scheduled date vs actual fila)
2. Pull /v3/earnings-surprises/{ticker} latest entry
3. Calculate surprise EPS%, Revenue%, vs whisper
4. Pull /v3/quote/{ticker} para reacción precio
5. Insert en earnings_results
6. Check triggers para Track B
7. Si no triggered → notificación corta auto-generada
```

Output ejemplo (sin Opus):
> ✓ KO Q1'26 — Beat
> EPS $0.73 vs $0.71 est (+2.8%) · vs whisper +0.0%
> Revenue $11.4B vs $11.2B est (+1.8%)
> Stock +1.2% día
> Tesis intacta. No requiere acción.

### Pipeline Track B (Opus deep dive)

Cuando se trigger (post call + transcript disponible ~24h):
```
1. Pull /v3/earning-call-transcript/{ticker}?year=2026&quarter=1
2. Pull guidance previa vs actual
3. Build prompt Opus con:
   - Transcript completo
   - Tesis del usuario para este ticker
   - Key metrics watch list
   - Histórico de últimos 4 quarters analysis
4. Opus structured output:
```

```json
{
  "verdict": "beat_strong" | "beat_modest" | "in_line" | "miss_modest" | "miss_strong",
  "summary_es": "Resumen ejecutivo en español 200-300 palabras",
  "guidance_change": {
    "fy_eps_prev": "$2.85-2.95",
    "fy_eps_new": "$2.90-3.00",
    "direction": "raised" | "maintained" | "lowered",
    "magnitude_pct": 1.7
  },
  "dividend_action": {
    "type": "raise" | "maintain" | "cut" | "none_announced",
    "old_amount": 0.485,
    "new_amount": 0.51,
    "dgr_implied_pct": 5.2
  },
  "key_metrics_check": [
    {"metric": "payout_ratio", "value": 0.69, "thesis_threshold": 0.75, "status": "ok"},
    {"metric": "debt_ebitda", "value": 2.0, "thesis_threshold": 2.5, "status": "ok"},
    {"metric": "fcf_margin", "value": 0.23, "thesis_threshold": 0.20, "status": "ok"}
  ],
  "tone": "confident" | "cautious" | "defensive" | "optimistic",
  "qa_red_flags": [
    "Analyst pressed on China revenue decline, CFO deflected"
  ],
  "qa_green_flags": [
    "CEO confirmed dividend raise schedule unchanged"
  ],
  "thesis_impact": "intact" | "strengthened" | "weakened" | "broken",
  "thesis_impact_reason": "Tesis intacta — FX headwinds esperados, volumen orgánico +2.5% confirma pricing power",
  "key_quotes": [
    {
      "speaker": "James Quincey (CEO)",
      "quote_original": "Our brand portfolio continues to perform...",
      "context_es": "Discutiendo resiliencia de marcas premium en mercados emergentes"
    }
  ],
  "suggested_action": "hold" | "review_thesis" | "consider_add" | "consider_reduce" | "consider_exit",
  "action_reason": "Hold — earnings confirma tesis sin sorpresas. Mantener weight target 4-5%.",
  "opus_cost_usd": 0.84
}
```

### Notificación post-earnings deep dive

```
🎯 KO Q1'26 — Análisis Completo
Veredicto: BEAT MODESTO ✓
EPS $0.73 vs $0.71 (+2.8%), Rev $11.4B (+1.8%)

GUIDANCE: subida $2.90-3.00 (de $2.85-2.95) ↑
DIVIDENDO: raise anunciado $0.485 → $0.51 (+5.2%) ✓
TESIS: 🟢 Intacta — fortalecida

Tone CEO: confident
Red flags Q&A: 1 (China revenue)
Green flags Q&A: 1 (dividend schedule confirmado)

Acción sugerida: HOLD
Razón: confirma tesis, sin necesidad de cambiar peso

[Ver análisis completo] [Marcar tesis revisada] [Crear journal entry]
```

---

## 3. Surprise tracker + patterns

### Vista por ticker

Para cada posición, gráfico histórico de surprises últimos 12 quarters:
- Bars: surprise % EPS (verde beat, rojo miss)
- Line overlay: reacción precio día
- Line overlay: surprise media móvil 4Q

### Stats agregados de tu cartera

```
Tu cartera — earnings stats últimos 4 quarters
• 67 reports analizados
• Beat rate cartera: 74% (vs 68% S&P 500)
• Surprise media: +2.1%
• Mejor performer: MA (+8.4% surprise medio)
• Peor performer: PYPL (-3.2% surprise medio)
• Tickers que NUNCA fallaron: BRK.B, MSFT, V, MA, ZTS
• Tickers con miss frecuente: PYPL, KHC
```

### Predictability score por ticker

```
score = 100 - (std_dev_surprise × 10)
```

- ZTS: 95 (muy predecible)
- KO: 87
- MSFT: 91
- PYPL: 42 (muy impredecible)

Sirve para decidir tamaño de posición — más predecible = puedes tener mayor weight.

---

## Schema D1

```sql
-- Calendar de earnings (upcoming + historical)
CREATE TABLE earnings_calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  earnings_date TEXT NOT NULL,         -- ISO date
  earnings_time TEXT,                  -- 'BMO' | 'AMC' | 'TBD'
  fiscal_quarter TEXT,                 -- '2026-Q1'
  eps_estimate REAL,
  eps_estimate_low REAL,
  eps_estimate_high REAL,
  eps_estimate_count INTEGER,
  revenue_estimate REAL,
  whisper_eps REAL,                    -- si disponible
  status TEXT DEFAULT 'scheduled',     -- 'scheduled' | 'reported' | 'delayed'
  updated_at TEXT
);
CREATE INDEX idx_ec_ticker ON earnings_calendar(ticker);
CREATE INDEX idx_ec_date ON earnings_calendar(earnings_date);

-- Pre-earnings briefings generados
CREATE TABLE earnings_briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  earnings_calendar_id INTEGER NOT NULL,
  generated_at TEXT NOT NULL,

  -- Datos snapshot
  eps_consensus REAL,
  eps_whisper REAL,
  revenue_consensus REAL,
  iv_atm_pct REAL,
  iv_atm_prev_qtr_pct REAL,
  beat_rate_8q REAL,
  surprise_avg_8q REAL,
  reaction_avg_8q REAL,
  pt_consensus REAL,
  upgrades_90d INTEGER,
  downgrades_90d INTEGER,

  -- User context (snapshot al generar)
  user_position_shares REAL,
  user_position_weight REAL,
  user_position_pnl_pct REAL,
  user_thesis_status TEXT,

  briefing_html TEXT,                  -- versión renderizada para mostrar
  notified BOOLEAN DEFAULT 0,
  user_acknowledged BOOLEAN DEFAULT 0,

  FOREIGN KEY (earnings_calendar_id) REFERENCES earnings_calendar(id)
);
CREATE INDEX idx_eb_ticker ON earnings_briefings(ticker);

-- Resultados post-earnings (Track A — auto rápido)
CREATE TABLE earnings_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  earnings_calendar_id INTEGER NOT NULL,

  -- Actuals
  eps_actual REAL,
  eps_estimate REAL,
  eps_surprise_pct REAL,
  eps_surprise_std_dev REAL,
  revenue_actual REAL,
  revenue_estimate REAL,
  revenue_surprise_pct REAL,
  beat_or_miss TEXT,                   -- 'beat' | 'miss' | 'inline'

  -- Reacción precio
  price_pre REAL,
  price_post_1h REAL,
  price_post_eod REAL,
  price_post_1d REAL,
  reaction_1h_pct REAL,
  reaction_eod_pct REAL,
  reaction_1d_pct REAL,

  -- Detected events
  dividend_action TEXT,                -- 'raise' | 'maintain' | 'cut' | 'none'
  dividend_old REAL,
  dividend_new REAL,
  guidance_action TEXT,                -- 'raised' | 'maintained' | 'lowered' | 'none'

  reported_at TEXT,
  triggered_deep_dive BOOLEAN DEFAULT 0,
  trigger_reasons_json TEXT,            -- ["weight_above_3pct", "surprise_2sigma"]

  FOREIGN KEY (earnings_calendar_id) REFERENCES earnings_calendar(id)
);
CREATE INDEX idx_er_ticker ON earnings_results(ticker);

-- Análisis profundos (Track B — Opus)
CREATE TABLE earnings_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  earnings_result_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,

  verdict TEXT,                        -- 'beat_strong'|'beat_modest'|'in_line'|'miss_modest'|'miss_strong'
  summary_es TEXT NOT NULL,

  guidance_change_json TEXT,
  dividend_action_json TEXT,
  key_metrics_check_json TEXT,

  tone TEXT,
  qa_red_flags_json TEXT,
  qa_green_flags_json TEXT,

  thesis_impact TEXT,                  -- 'intact'|'strengthened'|'weakened'|'broken'
  thesis_impact_reason TEXT,

  key_quotes_json TEXT,
  suggested_action TEXT,
  action_reason TEXT,

  opus_cost_usd REAL,
  analyzed_at TEXT,

  FOREIGN KEY (earnings_result_id) REFERENCES earnings_results(id)
);

-- Predictability scores (computed periódicamente)
CREATE TABLE earnings_predictability (
  ticker TEXT PRIMARY KEY,
  std_dev_surprise REAL,
  predictability_score REAL,           -- 0-100
  beat_rate_8q REAL,
  beat_rate_lifetime REAL,
  avg_reaction_pct REAL,
  computed_at TEXT
);
```

---

## Endpoints worker.js

```js
// Calendar
GET  /api/earnings/calendar?from=...&to=...
GET  /api/earnings/upcoming?period=7d&portfolio=1
POST /api/earnings/calendar/refresh

// Briefings
GET  /api/earnings/briefing/{ticker}
POST /api/earnings/briefing/{ticker}/generate
GET  /api/earnings/briefings/pending          // próximos 48h sin briefing

// Results
GET  /api/earnings/results/{ticker}?period=8q
GET  /api/earnings/results/recent?days=7

// Analysis (Track B)
GET  /api/earnings/analysis/{result_id}
POST /api/earnings/analysis/{result_id}/run   // forzar deep dive manual
GET  /api/earnings/analyses/recent

// Stats
GET  /api/earnings/stats/portfolio?period=4q
GET  /api/earnings/predictability/{ticker}
GET  /api/earnings/predictability/all

// Surprise tracker
GET  /api/earnings/surprises/{ticker}?quarters=12
```

---

## Agente "Earnings Intelligence"

### Sub-agente A: Pre-Earnings Briefer
**Modelo**: No-LLM
**Frecuencia**: Cada 6h
```
1. Query earnings_calendar WHERE earnings_date BETWEEN now AND +48h
   AND ticker IN (positions OR watchlist)
2. Para cada uno sin briefing:
   a. Pull todos los datos FMP (estimates, history, IV, analysts, etc)
   b. Pull D1 user context (position, thesis, journal)
   c. Render briefing HTML
   d. Insert en earnings_briefings
3. Notificar (1x por earnings, 24h antes):
   a. Solo si position ≥ 1% portfolio
   b. Push si position ≥ 3%
   c. Digest si position 1-3%
```

### Sub-agente B: Post-Earnings Auto (Track A)
**Modelo**: No-LLM
**Frecuencia**: Cada 30min durante earnings season
```
1. Query earnings_calendar WHERE earnings_date IS today AND status='scheduled'
2. Para cada uno:
   a. Check FMP /v3/earnings-surprises/{ticker} para latest entry
   b. Si fila aparece → status='reported'
   c. Capturar reacción precio (1h, EOD, +1d con cron diferido)
   d. Detect dividend changes (compare with previous)
   e. Insert en earnings_results
   f. Check triggers para Track B → marcar triggered_deep_dive
3. Notificación corta (siempre): beat/miss + reaction
```

### Sub-agente C: Post-Earnings Deep Dive (Track B)
**Modelo**: Opus
**Frecuencia**: Cada 6h durante earnings season
```
1. Query earnings_results WHERE triggered_deep_dive=1 AND analyzed=0
2. Wait until transcript available (FMP /v3/earning-call-transcript)
3. Para cada uno:
   a. Pull transcript + guidance prev/new
   b. Pull tesis del usuario + key metrics
   c. Build prompt Opus structured
   d. Insert earnings_analyses
   e. Cost tracking
4. Push notification con análisis completo
5. Trigger thesis review en Módulo Proceso si thesis_impact != 'intact'
```

### Coste estimado

**Pre-earnings (Track A)**: $0
**Post-earnings auto (Track A)**: $0
**Deep dive Opus (Track B)**:
- ~89 positions × 4 quarters/año = 356 reports/año
- Triggers activan ~30-50% (positions grandes + sorpresas) = ~140 deep dives/año
- Por deep dive: ~30k tokens input + 5k output = $0.83
- **Total: ~$116/año ≈ $10/mes**

Cap mensual hard: $20. Alerta si se acerca.

---

## Integración con resto del sistema

### 1. Header Portfolio
- Indicador "🗓️ 3 earnings esta semana" con click → calendar
- Si hay deep dive con thesis_impact='broken' → alerta roja persistente

### 2. CompanyRow
- Badge nuevo "📊 Earnings 26 abr" si próximos 7 días
- Click → briefing modal (si generado) o calendar entry

### 3. Módulo Proceso (Tesis)
- Cuando deep dive marca `thesis_impact != 'intact'` → trigger automático thesis review
- Quarterly review pre-poblado con resultados earnings de las posiciones

### 4. Smart Money + Cartas
- Si Cobas Q4 mencionó KO bullish y luego KO miss earnings → cross-reference visible
- Útil para "el sabio se equivocó" análisis

### 5. Journal
- Botón "Crear entrada journal" desde el deep dive con datos pre-rellenados
- Razón pre-poblada con summary del análisis

### 6. Alertas existentes (consolidación cooldown)
- Comparten cooldown global con Smart Money + Cartas
- Earnings tienen prioridad porque son time-sensitive y específicos

---

## Wireframes — pestaña "📊 Earnings"

### Sub-tab 1: 🗓️ Calendar
```
┌─ Próximos earnings — semana 21-27 abril ──────┐
│                                                 │
│ LUN 21                                         │
│ • KO  ⏰ BMO  · 4.2% weight · briefing ✓      │
│   EPS est $0.71 · whisper +2.8% · 🟢 tesis    │
│                                                 │
│ MAR 22                                         │
│ • V   ⏰ AMC  · 3.8% weight · briefing ✓      │
│ • PG  ⏰ BMO  · 2.1% weight · briefing ✓      │
│                                                 │
│ MIE 23                                         │
│ • MSFT⏰ AMC  · 6.1% weight · briefing ✓ ⭐    │
│   EPS est $3.12 · whisper +1.5% · 🟢 tesis    │
│ • TSLA — no en cartera                        │
│                                                 │
│ JUE 24                                         │
│ • MA  ⏰ BMO  · 3.4% weight · briefing ✓      │
│ ...                                            │
└────────────────────────────────────────────────┘
```

### Sub-tab 2: 📋 Briefings (sin leer / próximos)
Lista de briefings generados, marcable como leídos, prioritizados por weight.

### Sub-tab 3: 🎯 Resultados recientes
Últimos 30 días — todos los reports de tu cartera con verdict, surprise, reacción, deep dive si existe.

### Sub-tab 4: 🔬 Deep Dives
Lista de análisis Opus completos. Ordenable por fecha, ticker, thesis_impact.

### Sub-tab 5: 📈 Surprise tracker
- Por ticker: gráfico histórico
- Stats agregados cartera
- Predictability scores ranking

### Sub-tab 6: ⚙️ Settings
- Triggers Track B configurables (weight threshold, surprise std dev)
- Notification preferences
- Cost cap mensual

---

## Implementación por fases

### Fase 1 — Calendar + Briefings (1-2 días)
1. D1 migrations: 5 tablas
2. Endpoints calendar refresh + briefings
3. Sub-agente A (pre-earnings briefer)
4. Cron 6h
5. Test: generar briefings para los 7 días siguientes

### Fase 2 — Track A post-earnings (1 día)
6. Sub-agente B (auto post-earnings)
7. Cron 30min en season
8. Capturar reacción precio (1h cron, EOD cron)
9. Detect dividend/guidance changes
10. Notificaciones cortas

### Fase 3 — Track B Opus deep dive (1-2 días)
11. Sub-agente C (Opus structured output)
12. Prompt engineering iterativo con 5-10 transcripts reales
13. JSON schema validation
14. Cost tracking + cap
15. Trigger logic completa

### Fase 4 — Frontend (1-2 días)
16. Componente `EarningsView.jsx` con 6 sub-tabs
17. Calendar view con badges
18. Briefing modal (HTML render)
19. Deep dive viewer
20. Surprise tracker chart (reuse library del portfolio)

### Fase 5 — Integraciones (medio día)
21. Badge en CompanyRow
22. Indicador en header portfolio
23. Auto-trigger thesis review desde Módulo Proceso
24. Cross-reference con Cartas Sabios
25. Journal entry pre-populated

**Total estimado**: 5-6 días concentrados.

---

## Decisiones tomadas

| Decisión | Opción elegida | Razón |
|----------|----------------|-------|
| Pre-earnings model | **No-LLM, plantilla estructurada** | Datos suficientes, ahorra coste |
| Post-earnings approach | **Two-track (auto + Opus selectivo)** | Cubre todo sin disparar coste |
| Deep dive triggers | **5 triggers (weight, surprise, reaction, dividend, guidance)** | Captura material sin disparar todo |
| Modelo deep dive | **Opus** | Necesario para captar matices Q&A y guidance |
| Cap coste mensual | **$20 hard, alerta a $15** | Sostenible, ~$120/año |
| Push pre-earnings | **Solo position ≥3%, digest si 1-3%** | Anti-spam |
| Auto-trigger thesis review | **Sí si thesis_impact != intact** | Cierra el loop con Módulo Proceso |
| Notificaciones | **Consolidadas con cooldown global** | Pero earnings tienen prioridad |
| Predictability score | **Sí, computed mensual** | Sirve para decisiones de tamaño posición |
| Track A modelo | **Sin LLM** | Datos estructurados, no necesita interpretación |

---

## Riesgos y limitaciones

| Riesgo | Mitigación |
|--------|------------|
| **Whisper numbers no siempre disponibles** | Fallback a consensus only, marcar "no whisper" |
| **Transcripts con delay >48h** | Wait queue, deep dive cuando esté disponible |
| **Opus sobre-interpreta tono** | Prompt engineering + validación estructurada + cap output length |
| **Coste Opus inflado** | Cap hard mensual + tracking por análisis |
| **Multiple earnings mismo día** | Cola priorizada por weight, máximo 5 push/día earnings |
| **Earnings delays** | Cron detecta y actualiza status, re-genera briefing si fecha cambia |
| **Falsos triggers Track B** | Thresholds tuneables en settings |
| **Foreign tickers (BME, HKG)** | FMP cobertura desigual — degradar a Track A only para los problemáticos |

---

## Próximos pasos cuando termine la rama paralela

1. Migration D1 (5 tablas)
2. Empezar Fase 1 (calendar + briefings)
3. Validar prompt Opus con 5 transcripts reales antes de poner en producción
4. Iterar UI con 1-2 earnings reales en pre-mercado para validar UX

## Decisiones aún pendientes

1. **¿Generar briefings para watchlist o solo cartera?** → cartera SIEMPRE, watchlist opcional toggle
2. **¿Mostrar consensus de Estimize (crowd estimates)?** → si FMP lo cubre, sí; si no, skip MVP
3. **¿Auto-comparar guidance con prior 4 quarters?** → sí, en deep dive
4. **¿Permitir preguntas custom Opus al transcript?** → tentador (como chat con earnings call) pero overkill MVP, fase 7
5. **¿Tracking de "earnings drift"?** (post-earnings price drift academic phenomenon) → medible con datos disponibles, sub-tab opcional fase 7
