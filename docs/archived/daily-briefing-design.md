# Daily Briefing — Design (2026-04-18)

## Why

Hoy el usuario tiene que abrir 14 tabs diferentes (Agentes, Alertas, Dashboard, Portfolio, Research Agent, etc.) para saber "qué pasa hoy en la cartera". Eso es ruido. Un inversor long-term dedica 15-30 min/día a la cartera — ese tiempo debería empezar con **una sola vista** que diga:

1. ¿Qué requiere mi atención HOY? (críticos reales)
2. ¿Qué han concluido los agentes/research hoy? (verdicts accionables)
3. ¿Dónde estoy? (P&L, dividendos esta semana)
4. ¿Qué decisiones debería tomar? (action items)

El Daily Briefing es esa vista. Es la **portada** de la app, no un tab más.

## Goal

Una página densa, scannable en 2 minutos, generada automáticamente por el cron diario. Cuando el usuario abre la app por la mañana, lo primero que ve. Todo el resto son drill-downs.

## Architecture

```
Cron 13:00 UTC (post-agents) ─┬─ genera snapshot completo
Cron 14:30 UTC (post-research) ┴─ enriquece con verdicts research
                                 │
                                 ↓
                       D1 tabla `daily_briefings`
                       (una row por fecha)
                                 │
                                 ↓
              GET /api/daily-briefing?date=YYYY-MM-DD
                                 │
                                 ↓
              Tab "☀️ Briefing" — vista ejecutiva
```

## Sections (orden fijo, top-to-bottom)

### 1. Header — timestamp + estado regime
```
☀️ DAILY BRIEFING — Viernes 18 Abril 2026 · 15:00 Madrid
Regime: BULL · VIX 17.5 · S&P +1.2% · Tu cartera +$1,247 hoy
```

### 2. ⚠️ TOP ALERTS (máx 5)
Los N criticals más importantes de hoy, ordenados por:
- Research Agent verdict (si contradice a los demás → máxima prioridad)
- dividend=critical + cut warning + analyst downgrade (3 señales alineadas)
- Posición size (impacta más tu cartera)
- Concentración sectorial

Cada alerta:
```
🔴 PFE · [Research: TRIM medium] · $30K posición · 5.2% cartera
   "Pfizer cut warning + 3 analyst downgrades. Research Agent recomienda
    trim parcial tras leer el Q4 transcript. [Ver investigación →]"
```

### 3. 🎯 RESEARCH AGENT VERDICTS DEL DÍA
Todas las investigaciones (manuales + auto) completadas hoy. Formato:
```
AHRT · HOLD medium · manual · $1.38 · 65s
  "Transformación estratégica... full dividend coverage post-sep"
  Evidencia: transcript Q4 2025 + long_term divCuts + insider buys
  [Ver trail completo →]

GPC · TRIM high · auto_contradiction · $1.02 · 69s
  "68-year streak management-committed pese a FCF 0.75x. Separación 2027."
  [Ver trail completo →]
```

### 4. 💰 INCOME STATUS (esta semana)
```
Div este mes: $1,247  (vs mes pasado: $1,160 · +7.5%)
Próximos ex-dates (5 días): KO (Mon), PEP (Wed), MCD (Fri) — estimado $384
Cortes/freezes detectados: 0
Crecimiento YoY (TTM): +5.2%  ← sana
```

### 5. 📊 POSITION CHANGES (top 5 movers)
Tickers con cambio >2% hoy. P&L dollar + %, link a análisis.
```
▲ CNSWF  +4.2% ($840)   trade ADD high conviction hoy
▼ PFE    -2.8% ($420)   cut warning crítico hoy
▲ AHRT   +1.8% ($58)    (Research HOLD)
▲ JNJ    +1.2% ($240)
▼ GPC    -2.1% ($380)   (Research TRIM high)
```

### 6. ✅ ACTION ITEMS (generado por el briefing LLM)
Lista sintética de decisiones a considerar. No "ADD X", sino:
```
• REVISAR trim parcial PFE — Research Agent convincente, yield 6.2% sigue
  atractivo pero coverage empeora
• CONFIRMAR management commitment GPC Q1 2026 earnings call (mayo) antes
  de decidir venta total
• OJO sector Real Estate: 3 REITs con críticos hoy (HR, MDV, AHRT) —
  puede ser contagio macro, no idiosincrático
```

## Data flow

1. **Cron 13:00 UTC** termina `runAllAgents` → triggea generación briefing v1 (sin research).
2. **Cron 14:30 UTC** termina `runAutoInvestigations` → actualiza briefing con research verdicts.
3. **Generador**: función `generateDailyBriefing(env, fecha)` que:
   - Reúne insights del día (todos los agentes, agrupados)
   - Reúne investigaciones del día
   - Reúne position changes (precios + cost basis)
   - Calcula income metrics (divs este mes vs mes anterior)
   - Llama Opus 1x con TODO el contexto (~20K tokens) + prompt "genera briefing"
   - Opus devuelve JSON estructurado: top_alerts[], income_summary, action_items[]
4. **Storage**: D1 `daily_briefings` (id, fecha, content_json, generated_at, version).
5. **Frontend**: tab "☀️ Briefing" (que ya existe como stub — rellenarlo) llama GET /api/daily-briefing.

## Schema D1

```sql
CREATE TABLE daily_briefings (
  fecha TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  version INTEGER DEFAULT 1,  -- incrementa si se regenera (ej. post-research update)
  content_json TEXT NOT NULL, -- { regime, top_alerts[], research_verdicts[],
                              --   income_summary, position_changes[], action_items[] }
  cost_usd REAL DEFAULT 0,
  tokens_in INTEGER,
  tokens_out INTEGER
);
```

## Generator prompt (skeleton)

```
Eres el editor del Daily Briefing ejecutivo de un inversor de dividendos
long-term. Recibes TODOS los outputs del día y produces una página densa,
scannable en 2 min.

INPUTS: { regime, agent_insights[], research_investigations[],
          position_changes[], income_metrics, portfolio_snapshot }

TAREA: Construye un JSON con estas secciones:
1. top_alerts[] — máx 5. Prioriza contradicciones resueltas por Research,
   luego críticos con 3+ señales alineadas, luego size × impact.
2. research_verdicts[] — todas las investigaciones del día con 1-línea summary.
3. income_summary — divs este mes vs mes anterior + next ex-dates 5 días.
4. position_changes[] — top 5 movers hoy (>2%).
5. action_items[] — 3-5 decisiones concretas a considerar HOY. No "haz X",
   sino "REVISAR X porque Y". Debe ser accionable, no genérico.

Reglas:
- Max 2 frases por alert/item. Denso.
- Cita números específicos ($, %, coverage, etc.) siempre que existan.
- Si no hay nada worth flagging en una sección → di "Sin novedades relevantes".
- NO recomendar SELL a la ligera. TRIM/ADD/HOLD preferidos.
```

## Cost

- Briefing LLM call: ~20K input × $15/M + 3K output × $75/M = $0.30 + $0.23 = **~$0.53/día**
- Mensual: ~$12/mes (22 trading days)
- Es barato vs valor — sustituye 15 min de scroll por 2 min de lectura dirigida

## Rollout plan

**Session A (ahora)**:
- Schema migration + basic generator (sin Opus, solo agregación de datos)
- Endpoint GET /api/daily-briefing
- Rellenar el tab ☀️ Briefing existente con datos reales

**Session B**:
- Opus generator para la parte "action_items" y "top_alerts" priorizados
- Integración en cron 13:00 post-agents y actualización en cron 14:30 post-research

**Session C**:
- Historial (ver briefings pasados, comparar "qué dije de PFE hace 2 semanas")
- Archive link desde Decision Journal

## No-goals

- NO es un newsletter (sin prosa larga)
- NO duplica tabs (links profundos a las tabs existentes)
- NO decide por ti (sugiere, no ejecuta)
