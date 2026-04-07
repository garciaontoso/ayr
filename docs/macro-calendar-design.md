# Macro Calendar Layer

> Estado: DISEÑO. No implementar hasta merge de rama paralela.
> Generado 2026-04-07.

---

## Propósito

El sistema completo es **bottom-up puro** — analiza empresas individuales, sus fundamentos, sus tesis. Pero los inversores en dividendos se enfrentan constantemente a eventos macro que afectan sectores enteros:

- **FOMC decisions** → REITs, utilities, financieras
- **CPI releases** → consumer staples, retail
- **NFP** → cyclicals, financieras
- **Treasury auctions** → REITs, dividend yields equivalentes
- **Oil inventories** → energy, transports
- **Earnings season starts** → market mood global

Este módulo no es para hacer market timing macro. Es para **contextualizar** las decisiones bottom-up con awareness de eventos próximos y sus implicaciones específicas en TUS posiciones.

**Ejemplo concreto**: si mañana sale CPI a las 8:30 ET y tienes 12 posiciones rate-sensitive (REITs, utilities, banks), querer saberlo antes para no caer en pánico vendiendo a las 8:32 si sale +0.4%.

---

## Filosofía

### Principios

1. **NO market timing** — el módulo informa, no predice
2. **Personalizado por sector** — solo notifica eventos relevantes a TU exposición
3. **Anti-reactividad** — pre-evento, no post-evento
4. **Educativo** — explica el "por qué" de cada evento, no asume conocimiento
5. **Integrado con Daily Briefing** — los eventos macro relevantes aparecen en el briefing diario

### Lo que NO es

- ❌ NO es economic dashboard genérico (Bloomberg ya lo hace mejor)
- ❌ NO es predicción macro
- ❌ NO genera alertas de "vender porque sube CPI"
- ❌ NO es feed de Twitter sobre Fed

### Lo que SÍ es

- ✅ Calendar de los próximos 30 días con eventos relevantes
- ✅ Cross-reference: "este evento afecta X, Y, Z de tu cartera"
- ✅ Explicación pedagógica del impacto típico
- ✅ Nota en Daily Briefing si hay evento mañana relevante
- ✅ Histórico de reacciones de tu cartera a eventos similares (auto-track)

---

## Eventos a trackear

### Tier 1 — Alta materialidad

| Evento | Frecuencia | Sectores afectados | Por qué importa |
|--------|------------|-------------------|-----------------|
| **FOMC Decision** | 8/año | Todo, sobre todo REITs, utilities, banks | Tipo de interés mueve todo |
| **CPI Release** | Mensual | Staples, retail, REITs | Inflación afecta margins y rate path |
| **Core PCE** | Mensual | Igual que CPI | Es la métrica que la Fed usa |
| **NFP (Non-Farm Payrolls)** | Mensual primer viernes | Cyclicals, banks | Health del consumer |
| **GDP Advance** | Trimestral | Cíclicos, materials | Health económica |

### Tier 2 — Materialidad media

| Evento | Frecuencia | Sectores |
|--------|------------|----------|
| **Retail Sales** | Mensual | Consumer disc, retail |
| **PPI** | Mensual | Industrials, margins-sensitive |
| **Existing Home Sales** | Mensual | REITs residenciales, homebuilders |
| **Consumer Confidence** | Mensual | Consumer disc |
| **ISM Manufacturing** | Mensual | Industrials, materials |
| **Crude Oil Inventories** | Semanal (miércoles) | Energy |
| **Beige Book** | 8/año | Macro overview |
| **Treasury Auctions 10y/30y** | Mensual | REITs, utilities, dividend payers |

### Tier 3 — Sectoriales específicos

| Evento | Sectores |
|--------|----------|
| **OPEC meetings** | Energy |
| **EIA Natural Gas Storage** | Utilities, energy |
| **USDA Crop Reports** | Agro, food (KO, PEP, etc.) |
| **FDA Decisions** | Healthcare específico |
| **EU ECB Decision** | European holdings |
| **BOJ Decision** | Japan exposure |
| **PBOC Decision** | China/HK exposure |

### Eventos del propio mercado

| Evento | Frecuencia |
|--------|------------|
| Earnings season start (post-Q quarter end +2 weeks) | Trimestral |
| Triple witching (third Friday Mar/Jun/Sep/Dec) | Trimestral |
| End of quarter rebalancing | Trimestral |
| End of year tax-loss harvesting | Anual |

---

## Endpoints FMP

```
GET /v3/economic_calendar?from={d}&to={d}
GET /v3/economic_calendar?country=US&from={d}&to={d}
GET /v3/economic_calendar?country=EU
GET /v3/economic_calendar?country=CN

GET /v3/historical/economic-calendar/{event_name}    # histórico de un indicator
```

Datos por evento:
- Date + time
- Country
- Event name (e.g. "CPI", "FOMC Decision")
- Actual value (post-release)
- Previous value
- Estimate consensus
- Impact level (low/medium/high según FMP)
- Currency

---

## Mapping evento → sectores afectados

Tabla de mapeo (curated, no algorítmica) que asocia cada tipo de evento con los sectores típicamente impactados:

```json
{
  "FOMC Decision": {
    "primary_sectors": ["real_estate", "utilities", "financials"],
    "secondary_sectors": ["consumer_staples", "telecom"],
    "rationale": "Tasa de interés es el descuento del modelo de valoración. REITs y utilities son los más sensibles porque compiten con bonos. Banks ganan con tasas altas.",
    "typical_reaction": "+25bp surprise → REITs -1 a -3% día, banks +1 a +2%",
    "user_action": "Wait, no operar hasta cierre"
  },
  "CPI Release": {
    "primary_sectors": ["consumer_staples", "consumer_discretionary", "real_estate"],
    "secondary_sectors": ["financials"],
    "rationale": "Inflación afecta input costs (margins) y rate path expectations.",
    "typical_reaction": "Surprise hot CPI → REITs -1%, banks +0.5%, growth -2%",
    "user_action": "Si tienes alta exposición a REITs, vigila pero no actúes"
  },
  "Crude Oil Inventories": {
    "primary_sectors": ["energy"],
    "rationale": "Builds bajistas para precio crudo, draws bullish.",
    "typical_reaction": "Build sorpresa → energy -1 a -2%",
    "user_action": "No operar reactivamente"
  }
}
```

**Esto es el core del módulo** — sin este mapping, los datos macro son ruido. Con él, son inteligencia personalizada.

---

## Cómo se calcula tu exposición a cada evento

```python
def user_exposure_to_event(event_type: str, user_positions: list) -> dict:
    """Calcula cuánto de tu cartera está en sectores afectados por el evento."""
    affected_sectors = EVENT_SECTOR_MAP[event_type]["primary_sectors"]

    exposed_positions = []
    total_weight = 0

    for pos in user_positions:
        if pos.sector in affected_sectors:
            exposed_positions.append({
                "ticker": pos.ticker,
                "weight": pos.weight,
                "sector": pos.sector,
            })
            total_weight += pos.weight

    return {
        "event": event_type,
        "exposure_pct": total_weight,
        "exposed_positions": exposed_positions,
        "exposure_level": "high" if total_weight > 25 else "medium" if total_weight > 10 else "low",
    }
```

---

## Schema D1

```sql
-- Calendar de eventos macro upcoming + historical
CREATE TABLE macro_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT NOT NULL,
  event_time TEXT,                            -- '08:30' ET típicamente
  country TEXT NOT NULL,                      -- 'US' | 'EU' | 'CN' | 'JP'
  event_type TEXT NOT NULL,                   -- 'CPI' | 'FOMC' | 'NFP' | etc
  event_name TEXT NOT NULL,                   -- texto descriptivo

  consensus_estimate REAL,
  previous_value REAL,
  actual_value REAL,                          -- post-release
  impact_level TEXT,                          -- 'low' | 'medium' | 'high'

  -- Cross-reference user
  user_exposure_pct REAL,                     -- snapshot al detectar
  user_exposed_tickers_json TEXT,             -- JSON array

  -- Status
  status TEXT DEFAULT 'scheduled',            -- 'scheduled' | 'released' | 'cancelled'
  is_in_briefing BOOLEAN DEFAULT 0,           -- si ya se mencionó en briefing
  notification_sent BOOLEAN DEFAULT 0,

  fetched_at TEXT,
  released_at TEXT
);
CREATE INDEX idx_me_date ON macro_events(event_date);
CREATE INDEX idx_me_status ON macro_events(status);
CREATE INDEX idx_me_type ON macro_events(event_type);

-- Mapping eventos → sectores (seed data, editable)
CREATE TABLE event_sector_mapping (
  event_type TEXT PRIMARY KEY,
  primary_sectors_json TEXT NOT NULL,
  secondary_sectors_json TEXT,
  rationale TEXT,
  typical_reaction TEXT,
  user_action_advice TEXT
);

-- Histórico de cómo reaccionó tu cartera a cada release
CREATE TABLE event_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  price_pre REAL,
  price_post_30min REAL,
  price_post_1h REAL,
  price_post_eod REAL,
  surprise_direction TEXT,                    -- 'positive' | 'negative' | 'inline'
  user_action_taken TEXT,                     -- 'none' | 'bought' | 'sold' | 'reduced'
  FOREIGN KEY (event_id) REFERENCES macro_events(id)
);
```

---

## Endpoints worker.js

```js
// Calendar
GET /api/macro/upcoming?days=7              // próximos eventos relevantes
GET /api/macro/today                        // hoy
GET /api/macro/event/{id}                   // detalle con exposición user
GET /api/macro/historical/{event_type}      // histórico de un indicator

// Exposure
GET /api/macro/exposure                     // tu exposición sectorial actual
GET /api/macro/exposure/{event_type}        // qué pasaría con este evento

// Briefing input
GET /api/macro/briefing-input?since=...     // para Daily Briefing Agent

// Refresh
POST /api/macro/refresh                     // pull FMP economic calendar

// Mapping (admin)
GET /api/macro/sector-mapping
POST /api/macro/sector-mapping              // editar curated mapping
```

---

## Agente "Macro Watcher"

**Modelo**: No-LLM (puro dato + cross-reference)
**Frecuencia**: Diaria 5am (antes del Daily Briefing 6am)

```
1. Pull FMP /v3/economic_calendar para próximos 7 días
2. Filter por country in [US, EU, CN, JP] (ajustable user prefs)
3. Filter por impact_level in [medium, high]
4. Filter por event_type in trackeable list (Tier 1+2+3)
5. Para cada evento:
   a. Look up event_sector_mapping
   b. Calcular user_exposure usando posiciones actuales
   c. Insert/update macro_events
   d. Si exposure_level = 'high' AND event en próximas 24h → marcar para briefing
6. Para eventos released ayer:
   a. Pull actual values
   b. Calcular reacción cartera (cron secundario 30min, 1h, EOD)
   c. Insert event_reactions
```

---

## Integración con Daily Briefing

El briefing diario incluye sección macro **solo si hay eventos relevantes en próximas 24h**:

```markdown
## 🌍 Macro hoy/mañana

**Mañana 8:30 ET — CPI Release**
Consenso +0.3% MoM, +3.2% YoY. Previous +0.4%/+3.4%.
Tu exposición a sectores afectados: **alta (32% portfolio)**
- REITs: O (1.8%), VICI (0.9%), STAG (0.6%) = 3.3%
- Utilities: D (0.5%), DUK (0.4%) = 0.9%
- Consumer Staples: KO (4.2%), PG (2.1%), PEP (1.8%), KMB (0.9%) = 9.0%
- Total exposición primary: 13.2%

Si sale hot (>+0.4%) → reacción típica: REITs -1 a -2%, staples -0.5%.
**Acción sugerida**: NO operar antes ni después del release. Evento ya
descontado en gran parte por mercado, reacciones intradía suelen revertir
en 24-48h. Si quieres ver el dato, espera al cierre.
```

Si no hay eventos relevantes mañana → la sección no aparece en el briefing.

---

## Wireframes

### Vista pestaña "🌍 Macro"
```
┌─ Macro Calendar — próximos 7 días ─────────────────┐
│ Tu cartera: Staples 18% · REITs 6% · Utilities 4%  │
│                                                       │
│ MAR 8 abril                                          │
│ ⚠ 8:30 ET · CPI Release (US)                        │
│   Consenso +0.3% MoM · Previous +0.4%               │
│   Exposición tuya: ALTA (32% cartera)                │
│   [Ver impacto detallado]                            │
│                                                       │
│ JUE 10 abril                                         │
│ • 10:30 ET · Crude Oil Inventories                  │
│   Exposición: BAJA (3% cartera, solo CVX)           │
│                                                       │
│ VIE 11 abril                                         │
│ ⚠ 8:30 ET · NFP (US)                                │
│   Consenso +200k · Previous +175k                    │
│   Exposición: MEDIA (12% cartera, banks + cyclicals)│
│                                                       │
│ LUN 14 abril                                         │
│ • 8:30 ET · Retail Sales                             │
│   Exposición: BAJA (5% consumer disc)                │
│                                                       │
│ MIE 16 abril                                         │
│ ⚠ 14:00 ET · FOMC Decision                          │
│   Probabilidad +25bp: 85% (CME FedWatch)             │
│   Exposición: MUY ALTA (38% cartera rate-sensitive) │
│   [Ver análisis completo]                            │
└──────────────────────────────────────────────────────┘
```

### Modal "Impacto del evento"
```
┌─ FOMC Decision · 16 abril 14:00 ET ────────────────┐
│                                                       │
│ EXPECTATIVAS                                         │
│ Consenso: +25bp (4.50% → 4.75%)                      │
│ Probabilidad CME FedWatch: 85%                       │
│                                                       │
│ POR QUÉ IMPORTA                                      │
│ La tasa de interés es el descuento del modelo de    │
│ valoración. REITs y utilities son los más sensibles │
│ porque compiten con bonos para inversores en busca  │
│ de yield. Banks ganan con tasas altas. Tech crece   │
│ peor con tasas altas (cash flows lejanos descuento).│
│                                                       │
│ TU EXPOSICIÓN                                        │
│ Sectores primarios afectados: 38% de tu cartera     │
│                                                       │
│ REITs (8.4%):                                        │
│   O 1.8% · VICI 0.9% · STAG 0.6% · LANDP 0.4% ...   │
│ Utilities (3.1%):                                    │
│   D 0.5% · DUK 0.4% · NEE 0.3% ...                  │
│ Financials (10.2%):                                  │
│   V 3.8% · MA 3.4% · BX 1.2% · OWL 0.8% ...         │
│ Consumer Staples (9.5%):                             │
│   KO 4.2% · PG 2.1% · ...                            │
│                                                       │
│ REACCIÓN TÍPICA HISTÓRICA                            │
│ +25bp inline → mercado plano                         │
│ +25bp dovish dot plot → REITs +1 a +2%              │
│ +25bp hawkish dot plot → REITs -2 a -3%, growth -3% │
│                                                       │
│ ACCIÓN SUGERIDA                                      │
│ NO operar antes del release. Reacción inicial se    │
│ suele revertir 50% en 24-48h. Si tu tesis no        │
│ cambia, no hay razón para tradear.                  │
│                                                       │
│ HISTÓRICO ÚLTIMOS 3 FOMCs                            │
│ - 2026-03-19: +25bp dovish → REITs +1.4% día        │
│ - 2026-01-29: hold dovish → REITs +0.8% día         │
│ - 2025-12-18: hold neutral → REITs -0.3% día        │
│                                                       │
│ [Ver tu reacción histórica] [Skip]                   │
└──────────────────────────────────────────────────────┘
```

---

## Implementación por fases

### Fase 1 — Pipeline + mapping (1 día)
1. Migrations D1: 3 tablas
2. Seed event_sector_mapping con ~25 eventos curados
3. Endpoint refresh + cron 5am
4. Cálculo exposure por user

### Fase 2 — UI (1 día)
5. Pestaña "🌍 Macro" con calendar próximos 7 días
6. Modal detalle con explicación pedagógica
7. Histórico de reacciones cartera

### Fase 3 — Briefing integration (medio día)
8. Endpoint briefing-input
9. Logic para incluir solo si exposure_level alto + próximas 24h
10. Plantilla de sección macro en el briefing

### Fase 4 — Tracking (medio día)
11. Cron post-event capturar reacción cartera
12. Stats agregadas: ¿tu cartera reacciona como sector típico?
13. Dashboard "tu sensibilidad macro vs benchmark"

**Total**: 3 días.

---

## Coste

**$0 LLM**. Puro dato + cálculo + cross-reference.
FMP queries: ~50/día = trivial.

---

## Decisiones tomadas

| Decisión | Opción elegida | Razón |
|----------|----------------|-------|
| Modelo | **No-LLM** | Puro cálculo, sin necesidad de NLP |
| Mapping evento→sector | **Curated, no algorítmico** | La intuición humana sobre causalidad macro es mejor que cualquier ML aquí |
| Países | **US + EU + CN + JP** (configurable) | Cobertura global pero relevante a tu cartera |
| Notificaciones directas | **NO** | Va por Daily Briefing |
| Cobertura UI | **Pestaña dedicada + briefing integration** | Profundidad bajo demanda + síntesis diaria |
| Filosofía | **Anti-trading reactivo** | Eventos macro generan ruido a corto plazo |

---

## Riesgos y limitaciones

| Riesgo | Mitigación |
|--------|------------|
| User reacciona emocionalmente a eventos | Mensaje explícito "no operar" en cada evento |
| FMP cobertura inconsistente | Fallback a sources alternativos (Investing.com scrape) |
| Mapping evento→sector simplista | Iterar el mapping con experiencia, mejorar con tiempo |
| Sector classification de tickers | Reutilizar el sectors enriched que ya tienes (v4.0 trabajo) |
| Sobre-exposición sectorial alarmante | Cross-link con Discovery Engine "sector underweight" para sugerir balance |
| Eventos cancelados/movidos | Cron 5am refresh detecta cambios |
