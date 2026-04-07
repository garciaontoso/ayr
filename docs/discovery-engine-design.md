# Discovery Engine — Watchlist Intelligence

> Estado: DISEÑO. No implementar hasta merge de rama paralela.
> Generado 2026-04-07.

---

## Propósito

Cerrar el último loop crítico del sistema: hoy la app dice **qué tienes** y **qué hacer con lo que tienes**, pero no sugiere activamente **qué deberías considerar añadir**. Sin un mecanismo de descubrimiento, tu universo de inversión se fosiliza en lo que ya conoces.

Este módulo crea un **pipeline activo de ideas nuevas** filtradas por toda la inteligencia que ya hemos construido en los otros 5 módulos:
- Quality + Safety scores
- Smart Money signals (Fondos + Politicians)
- Menciones en cartas de sabios
- Earnings predictability
- Tu propio thesis universe

**Filosofía**: ideas curadas, no listados gigantes. Mejor 5 candidatos sólidos a la semana que 50 sin filtrar.

---

## Cómo funciona el sistema en 1 frase

> Múltiples fuentes generan candidatos diariamente → filtros agresivos + composite scoring → cola priorizada de ~10-20 ideas activas → user decide investigar / añadir a watchlist / desestimar → tracking aprende qué fuentes generan mejores decisiones.

---

## Las 13 fuentes de discovery

Cada fuente es un "screener" independiente que produce tickers candidatos. La belleza está en la **convergencia**: si un ticker aparece en 3+ fuentes simultáneamente, es señal fuerte.

### Tier S — Convergencia multi-señal (peso 3x)

**1. Multi-source convergence**
Tickers que aparecen en ≥3 de las otras 12 fuentes simultáneamente. Esta es la señal más fuerte porque significa que múltiples ángulos independientes coinciden.

### Tier A — Señales fuertes individuales (peso 2x)

**2. High Quality + Safety, no en cartera**
```
SELECT ticker FROM quality_safety_scores
WHERE quality_score ≥ 85
  AND safety_score ≥ 80
  AND ticker NOT IN (positions)
ORDER BY (quality_score + safety_score) DESC
```
Filosofía: si tiene calidad objetiva alta y la seguridad del dividendo es buena, merece atención mínima.

**3. Mencionado por ≥N sabios (Cartas)**
```
SELECT ticker FROM letter_ticker_mentions
WHERE letter.letter_date > 6_months_ago
  AND sentiment IN ('bullish', 'thesis')
GROUP BY ticker
HAVING count(distinct source_id) ≥ 3
  AND ticker NOT IN (positions)
ORDER BY count(distinct source_id) DESC, sum(source_tier_weight) DESC
```
Señal: cuando 3+ de los 25 sabios mencionan positivamente el mismo ticker en 6 meses, hay convicción cruzada.

**4. Smart Money cluster (Fondos)**
```
SELECT ticker FROM holdings_changes
WHERE quarter = latest
  AND change_type IN ('NEW', 'ADDED')
  AND new_weight_pct ≥ 3
GROUP BY ticker
HAVING count(distinct fund_id) ≥ 2
  AND ticker NOT IN (positions)
ORDER BY count(distinct fund_id) DESC
```
Mismo principio del cluster detector del módulo Fondos pero exportado a discovery: 2+ superinvestors entrando ≥3% peso = señal.

**5. Politicians cluster**
```
Tickers donde ≥2 políticos del mismo partido compraron en 14 días
con monto ≥ $50k Y ticker NOT IN (positions)
```

**6. Insider buying clusters** (FMP `/v4/insider-trading`)
```
Tickers donde ≥2 insiders (CEO/CFO/Director) compraron > $250k en 30 días
```

### Tier B — Screeners temáticos (peso 1x)

**7. Dividend Aristocrats / Kings no en cartera**
- Aristocrats US (25y+ raises)
- Kings US (50y+ raises)
- International equivalents (UK, Canada, Japan)
- Filtro por yield ≥ 2% para evitar Aristocrats con yield 0.5%

**8. Earnings surprise leaders**
```
Tickers con beat_rate_8q ≥ 87.5%
AND surprise_avg_8q > 2%
AND predictability_score ≥ 80
AND NOT en cartera
```
Empresas que consistentemente baten estimates → management que ejecuta + sandbagging guidance.

**9. Sector underweighted en tu cartera**
```
Calcula tu exposición sectorial actual
Compara vs SCHD/VIG/SPY
Si tu sector X < benchmark - 5pp:
  Sugerir top 5 quality del sector X que NO tienes
```
Auto-balance sin forzar índice — solo te ofrece opciones cuando hay desbalance grande.

**10. Sector relative valuation outliers** (cheap quality)
```
Para cada sector, identificar tickers donde:
  Quality ≥ 80 (calidad objetiva alta)
  AND Forward P/E ≤ sector median - 20% (cotiza barato vs peers)
  AND debt healthy
```
Quality que cotiza con descuento sectorial = oportunidad asimétrica.

**11. Watchlist hits**
```
Tickers en watchlist que han alcanzado:
  - Price target mínimo de tu nota original
  - O Quality threshold superior tras última actualización
  - O Yield threshold (precio cayó, yield subió a tu min)
```
Vigila tu propia watchlist y avisa cuando un candidato pasa de "esperando" a "oportunidad".

**12. Recent IPOs maturing** (aged 2+ years)
```
IPOs entre 24-48 meses
AND Quality ≥ 75
AND profitable últimos 4 quarters
AND positive FCF
```
Filosofía Buffett: nunca compres un IPO el primer día. Pero a 2-3 años, las empresas buenas demuestran su modelo y se vuelven elegibles.

### Tier C — Estilos curados (peso 1x)

**13. Style screens — los grandes gestores**
Screens preconfiguradas inspiradas en filosofías maestras:

**Buffett screen**:
```
ROIC ≥ 15% promedio 5y
AND Debt/EBITDA ≤ 2
AND FCF margin ≥ 15%
AND Dividend track ≥ 10y
AND Forward P/E ≤ 20
AND Market cap ≥ $10B
```

**Akre screen** (three-legged stool):
```
ROIC ≥ 20%
AND Owner-operator OR Long-tenured CEO
AND Reinvestment runway visible
AND Recurring revenue ≥ 60%
```

**Tom Russo screen** (capacity to suffer):
```
Consumer brand
AND International revenue ≥ 40%
AND Dividend payer 10+ years
AND Family/insider ownership ≥ 5%
AND ROIC ≥ 12%
```

**Cobas screen** (deep value):
```
P/Tangible Book ≤ 1.5
AND EV/EBITDA ≤ 7
AND FCF yield ≥ 7%
AND Net debt ≤ 2x EBITDA
```

**Peters / dividend playbook**:
```
Yield ≥ 3%
AND DGR 5y ≥ 5%
AND Payout FCF ≤ 70%
AND Years without cut ≥ 10
```

---

## Composite Discovery Score

Cada candidato recibe un score 0-100 calculado así:

```
discovery_score =
    35 × source_convergence       # cuántas fuentes lo identifican (max 5+ fuentes = 35)
  + 25 × quality_score_normalized # tu Quality Score / 100 × 25
  + 15 × safety_score_normalized  # tu Safety Score / 100 × 15
  + 10 × sabios_mention_strength  # weighted by tier of mentioning source
  + 10 × smart_money_strength     # weighted by conviction of fund
  +  5 × user_fit_bonus           # match con tus filtros (yield min, sector caps, etc)
```

**Tiers**:
- 85-100 → 🔥 Hot — investigar esta semana
- 70-84 → ⭐ Strong — investigar este mes
- 55-69 → 📌 Worth a look — añadir a watchlist
- 40-54 → 👁 On radar — solo tracking pasivo
- < 40 → archivo, no mostrar

---

## User filters (configurables)

Ajustes personalizables que aplican a TODOS los candidatos antes de scoring:

```json
{
  "min_yield": 1.5,
  "min_quality_score": 65,
  "min_safety_score": 60,
  "max_payout_ratio": 0.85,
  "min_market_cap_usd": 1e9,
  "max_market_cap_usd": null,
  "min_dividend_streak_years": 5,
  "excluded_sectors": ["mining", "airlines", "gambling"],
  "excluded_countries": [],
  "max_pe_forward": 30,
  "excluded_tickers": ["TSLA", "GME", "AMC"],
  "require_dividend_payer": true,
  "min_revenue_usd": 500e6
}
```

Defaults sensatos pre-cargados, fully editable en settings.

---

## Cooldown y duplicación

**Anti-spam crítico**: si el mismo ticker ya está en cola activa, **no se recalcula su score diariamente**. Solo cuando alguna fuente añade nueva señal.

**Lifecycle de un candidato**:
1. **NEW** (recién detectado, score calculado)
2. **ACTIVE** (en cola, visible)
3. **INVESTIGATED** (usuario abrió detalles)
4. **WATCHLIST** (usuario añadió a watchlist)
5. **DISMISSED** (usuario descartó — registrar razón)
6. **POSITION** (eventualmente entró a cartera — éxito de discovery)
7. **ARCHIVED** (>90 días en cola sin acción)

**Re-emergencia**: un ticker DISMISSED puede volver a aparecer si pasa ≥6 meses Y aparece en ≥2 fuentes nuevas. No fosiliza el rechazo permanentemente.

**Cooldown de re-suggestion**: una vez DISMISSED, cooldown 90 días mínimo antes de reaparición.

---

## Schema D1

```sql
-- Catálogo de fuentes (los 13 screeners)
CREATE TABLE discovery_sources (
  id TEXT PRIMARY KEY,                  -- 'quality_high', 'sabios_mentions', 'sm_cluster', etc
  name TEXT NOT NULL,
  tier TEXT NOT NULL,                   -- 'S' | 'A' | 'B' | 'C'
  weight REAL NOT NULL,                 -- 1, 2, 3
  cron_frequency TEXT,                  -- 'daily' | 'weekly' | 'monthly'
  active BOOLEAN DEFAULT 1,
  config_json TEXT,                     -- parámetros del screener
  description TEXT
);

-- Candidatos activos en cola
CREATE TABLE discovery_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL UNIQUE,          -- un solo registro activo por ticker
  status TEXT NOT NULL,                 -- 'new' | 'active' | 'investigated' | 'watchlist' | 'dismissed' | 'position' | 'archived'

  -- Scoring
  discovery_score REAL NOT NULL,
  source_convergence INTEGER,           -- # fuentes que lo identifican
  source_ids_json TEXT,                 -- ['quality_high', 'sabios_mentions', ...]
  composite_breakdown_json TEXT,        -- desglose del score

  -- Snapshot al detectar (para decisiones offline)
  quality_score REAL,
  safety_score REAL,
  yield_pct REAL,
  forward_pe REAL,
  market_cap REAL,
  sector TEXT,

  first_detected_at TEXT NOT NULL,
  last_updated_at TEXT NOT NULL,
  expires_at TEXT,                      -- archive auto si > 90d activo

  -- Razones rich
  reasoning_md TEXT                     -- markdown descriptivo
);
CREATE INDEX idx_dc_status ON discovery_candidates(status);
CREATE INDEX idx_dc_score ON discovery_candidates(discovery_score DESC);
CREATE INDEX idx_dc_ticker ON discovery_candidates(ticker);

-- Histórico de detecciones por fuente (para multi-source convergence)
CREATE TABLE discovery_detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  source_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  signal_strength REAL,                 -- 0-1 dentro de la fuente
  context_json TEXT,                    -- por qué disparó esta fuente
  FOREIGN KEY (source_id) REFERENCES discovery_sources(id)
);
CREATE INDEX idx_dd_ticker ON discovery_detections(ticker);
CREATE INDEX idx_dd_source ON discovery_detections(source_id, detected_at);

-- Acciones del usuario sobre candidatos
CREATE TABLE discovery_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL,                 -- 'investigated' | 'added_watchlist' | 'dismissed' | 'added_position' | 'snoozed'
  reason TEXT,                          -- texto libre
  source_attribution TEXT,              -- qué fuente lo trajo en primer lugar
  occurred_at TEXT NOT NULL
);
CREATE INDEX idx_da_ticker ON discovery_actions(ticker);

-- Stats por fuente (cuál genera mejores decisiones)
CREATE TABLE discovery_source_stats (
  source_id TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  candidates_generated INTEGER,
  candidates_investigated INTEGER,
  candidates_added_watchlist INTEGER,
  candidates_added_position INTEGER,
  conversion_rate_to_position REAL,     -- positions / candidates
  positions_with_positive_return_1y REAL,  -- requires tracking later
  PRIMARY KEY (source_id, period_year),
  FOREIGN KEY (source_id) REFERENCES discovery_sources(id)
);

-- Usuario filters (single row)
CREATE TABLE discovery_filters (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  filters_json TEXT NOT NULL,
  updated_at TEXT
);
```

---

## Endpoints worker.js

```js
// Candidates queue
GET  /api/discovery/candidates?status=active&limit=20
GET  /api/discovery/candidates/{ticker}
POST /api/discovery/candidates/{ticker}/action  // investigate / dismiss / add_watchlist
GET  /api/discovery/queue/stats                 // # active, # new today, etc

// Sources
GET  /api/discovery/sources                     // catálogo
POST /api/discovery/sources/{id}/toggle
POST /api/discovery/sources/{id}/run            // forzar refresh manual

// Filters
GET  /api/discovery/filters
POST /api/discovery/filters                     // update preferences

// Stats
GET  /api/discovery/stats?period=year
GET  /api/discovery/stats/sources               // ranking de fuentes por accuracy
GET  /api/discovery/stats/conversion            // % de discovered → positions

// Refresh global
POST /api/discovery/refresh-all                 // ejecuta todas las fuentes
```

---

## Pipeline del agente "Discovery Engine"

**Modelo**: No-LLM (puro screening + scoring)
**Frecuencia**: Diaria 7am, after Quality scores y Cartas analyzed

```
1. Para cada source con active=1:
   a. Ejecutar query/lógica de screener
   b. Obtener lista de tickers candidatos
   c. Para cada candidato:
      - Si ya en cartera → skip
      - Si en discovery_candidates con cooldown activo → skip
      - Si en discovery_candidates ACTIVE → añadir detection record (no recrear)
      - Si nuevo → insert detection + insert/update candidate

2. Apply user filters globally:
   - Quality min, Safety min, Yield min, sector exclusions, etc
   - Tickers que no pasan → archive immediately

3. Recalcular discovery_score para todos los ACTIVE:
   - source_convergence actualizado
   - quality/safety scores frescos
   - apply formula completa

4. Re-rank queue:
   - Top 20 visibles
   - Resto en "more" expandible
   - Older than 90 days sin acción → ARCHIVE

5. Detect nuevos HOT candidates (score ≥ 85):
   - Push notification (respetando cooldown global)
   - Una sola notificación por candidato HOT en su lifetime

6. Update stats por source
```

---

## Coste

**$0 LLM** — todo es SQL + cálculo numérico. Reutiliza datos ya existentes (Quality scores, Cartas analysis, Smart Money holdings).

Solo cost residual: ~100 FMP queries adicionales/día para refrescar screening criteria que no estén ya cacheados. Despreciable.

---

## Wireframes — pestaña "💡 Discover"

### Vista principal: Cola de candidatos
```
┌─ Discovery Queue ───────────────────────────────────┐
│ Filtro: [Active 18] [New 3] [HOT 4] [Sector ▼]      │
│ Ordenar por: [Score ▼]                              │
│                                                       │
│ 🔥 BRK.B  Berkshire Hathaway B  Score 92            │
│   Q:91 ⭐⭐⭐⭐⭐  S:88 🟢  Yield 0%  Sector: Holdings  │
│   Razones (5 fuentes):                              │
│   ✓ Quality top sector (92)                         │
│   ✓ Mencionado por 4 sabios (Russo, Akre, Polen,    │
│     Markel) en últimos 6 meses                      │
│   ✓ Smart Money cluster: NEW posición Pabrai 8%     │
│   ✓ Buffett screen — passes all                     │
│   ✓ Earnings predictability 94                      │
│   [Investigar] [Watchlist] [Dismiss]                │
│                                                       │
│ 🔥 NESN.SW  Nestlé  Score 89                        │
│   Q:88 ⭐⭐⭐⭐⭐  S:91 🟢  Yield 3.1%  Sector: Staples │
│   Razones (4 fuentes):                              │
│   ✓ Quality + Safety alta                           │
│   ✓ Tom Russo position core (annual letter 2025)    │
│   ✓ Aristocrat (28y raises)                         │
│   ✓ Sector staples underweight tu cartera (-3pp)    │
│   [Investigar] [Watchlist] [Dismiss]                │
│                                                       │
│ ⭐ ABT  Abbott Labs  Score 81                        │
│   Q:84 ⭐⭐⭐⭐  S:88 🟢  Yield 1.9%  Sector: Health    │
│   Razones (3 fuentes):                              │
│   ✓ Aristocrat 51y                                  │
│   ✓ Healthcare sector underweight                   │
│   ✓ Beat rate 100% últimos 8q                       │
│   [Investigar] [Watchlist] [Dismiss]                │
│                                                       │
│ ⭐ MA  Mastercard  Score 78                          │
│   Q:93 ⭐⭐⭐⭐⭐  S:84 🟢  Yield 0.6%  ⚠ Yield bajo   │
│   ⚠ No pasa filtro min_yield (1.5%)                │
│   [Editar filtros] [Investigar igual] [Dismiss]     │
│                                                       │
│ 📌 ITC.NS  ITC Ltd  Score 65                         │
│   Q:78 ⭐⭐⭐⭐  S:72 🟡  Yield 4.2%  Sector: Staples  │
│   Razones (2 fuentes):                              │
│   ✓ India aristocrat equivalent                     │
│   ✓ Akre style screen                               │
│   [Investigar] [Watchlist] [Dismiss]                │
│                                                       │
│ ... 13 más                                           │
└──────────────────────────────────────────────────────┘
```

### Modal "Investigar candidato"
```
┌─ Investigar: NESN.SW ───────────────────────────────┐
│ Discovery Score: 89 🔥                               │
│                                                       │
│ ¿POR QUÉ apareció? (5 fuentes)                       │
│ • Quality 88 + Safety 91 (top quality globally)     │
│ • Mencionado bullish por 4 sabios:                   │
│   - Tom Russo annual 2025: "core position 8% peso"  │
│   - Akre Q4'25: "compounder mention"                │
│   - Fundsmith Owner's Manual 2025: "top 5 holding"  │
│   - Giverny annual 2024: "international quality"    │
│ • Aristocrat europeo (28y raises)                    │
│ • Sector staples underweight tu cartera (-3pp)       │
│                                                       │
│ MÉTRICAS CLAVE                                       │
│ Yield 3.1% · DGR 5y 4.8% · Payout 67%               │
│ ROIC 18% · Debt/EBITDA 1.9 · FCF margin 14%         │
│ Forward P/E 22 · Market cap CHF 290B                │
│                                                       │
│ HOLDERS RELEVANTES                                   │
│ Tom Russo (Gardner Russo): 8.2% cartera             │
│ Fundsmith: 5.1% cartera                              │
│                                                       │
│ EARNINGS                                             │
│ Próximo: 24 julio 2026                               │
│ Beat rate 87.5% últimos 8q                           │
│ Predictability score 89                              │
│                                                       │
│ [📚 Ver menciones cartas] [Ver perfil completo]      │
│ [✓ Add to Watchlist] [✗ Dismiss] [Snooze 30d]       │
└──────────────────────────────────────────────────────┘
```

### Vista stats
```
┌─ Discovery Stats — 2026 hasta hoy ──────────────────┐
│                                                       │
│ Total candidatos generados:    127                   │
│ Investigados (abriste detalle): 67  (53%)            │
│ Añadidos a watchlist:          23  (18%)             │
│ Añadidos a cartera:             5  (4%)              │
│ Dismissed:                     45  (35%)             │
│                                                       │
│ FUENTES MÁS EFECTIVAS (% de candidatos→cartera)      │
│  1. Multi-source convergence    18% (3/17)           │
│  2. Sabios mentions ≥3          12% (1/8)            │
│  3. Quality top + sector under   8% (1/12)           │
│  4. Smart Money cluster          5% (0/19)           │
│  5. Buffett screen               4% (0/22)           │
│  6. Aristocrats                  2% (0/40)           │
│                                                       │
│ FUENTES MENOS EFECTIVAS                              │
│  • Politicians cluster: 0/8 added (mucho ruido)     │
│  • Insider buying: 0/5 added                         │
│                                                       │
│ ⚠ Considera desactivar fuentes con conversión <2%   │
│   tras 1 año de datos                                │
│                                                       │
│ TIEMPO MEDIO desde discovery hasta acción:           │
│  • Investigated: 2.3 días                            │
│  • Added to watchlist: 4.1 días                      │
│  • Added to position: 18 días                        │
└──────────────────────────────────────────────────────┘
```

### Vista filters
```
┌─ Discovery Filters ─────────────────────────────────┐
│                                                       │
│ Yield mínimo:           [1.5] %                      │
│ Quality mínima:         [65]                         │
│ Safety mínima:          [60]                         │
│ Payout máx:             [85] %                       │
│ Market cap mín:         [$1B]                        │
│ Dividend streak mín:    [5] años                     │
│ Forward P/E máx:        [30]                         │
│ Revenue mínimo:         [$500M]                      │
│                                                       │
│ Requiere dividend payer: [✓]                         │
│                                                       │
│ Sectores excluidos:                                  │
│ [Mining ✗] [Airlines ✗] [Gambling ✗] [Tobacco ?]   │
│                                                       │
│ Tickers excluidos manualmente:                       │
│ [TSLA] [GME] [AMC] [+Add]                            │
│                                                       │
│ [Reset defaults] [Save]                              │
└──────────────────────────────────────────────────────┘
```

---

## Integración con resto del sistema

### 1. Watchlist existente
- Vista Discover es EXTENSIÓN de Watchlist, no reemplazo
- Sub-tab nuevo "💡 Discovery" dentro de Watchlist tab
- Botón "Add to Watchlist" desde candidate → añade a la watchlist clásica

### 2. Quality + Safety scores
- Discovery NO funciona sin que estos scores existan primero
- Quality fresh es input crítico para Tier A source #2
- Sector benchmarks de scores → input para source #9 (sector underweight)

### 3. Cartas Sabios
- letter_ticker_mentions es input directo para source #3
- Discovery puede llamar a Cartas: "ver todas las menciones de NESN"

### 4. Smart Money (Fondos)
- holdings_changes input para sources #4 y #5
- Discovery puede llamar: "ver qué fondos tienen NESN"

### 5. Earnings Intelligence
- earnings_predictability input para source #8
- Discovery puede llamar: "ver historial earnings de NESN"

### 6. Módulo Proceso (Tesis)
- Cuando user añade discovery → position, fuerza crear tesis (modal Tesis bloqueante)
- Discovery action 'added_position' → trigger journal entry con source_attribution

### 7. Notificaciones
- Solo HOT candidatos (score ≥85) generan push
- Máximo 1 push HOT/semana (rate limit propio + cooldown global compartido)
- Resto en digest semanal lunes

### 8. Annual Review
- Sección "Discoveries del año" — qué descubriste, qué entró, qué rendimiento
- Por qué fuente — refuerza qué screeners funcionan para tu estilo

---

## Aprendizaje del sistema

El módulo **mejora con el tiempo** porque trackea conversion rate por fuente:

```
Después de 1 año:
- Fuente "Sabios mentions" → 12% de sus candidatos terminaron en cartera
- Fuente "Politicians cluster" → 0% terminaron en cartera (puro ruido para ti)

Acción: bajar peso de Politicians de 1.0 a 0.3 en composite score, o desactivar
```

Esto es exactamente lo mismo que hace el journal del Módulo Proceso a nivel de decisiones individuales — pero a nivel de **fuente de ideas**. Empíricamente descubres qué te funciona y qué no, sin teorizar.

**Después de 2-3 años**, tu Discovery Engine está perfectamente calibrado a tu estilo personal de inversión. Es el ÚNICO componente del sistema que se vuelve más útil con el tiempo (los otros módulos son herramientas; este es un aprendiz).

---

## Implementación por fases

### Fase 1 — Core engine (1-2 días)
1. D1 migrations: 6 tablas
2. Implementar 13 sources como queries SQL/funciones JS
3. Composite scoring formula
4. Cron diario 7am
5. User filters CRUD

### Fase 2 — Frontend (2 días)
6. Sub-tab "💡 Discovery" en Watchlist
7. Vista cola con cards
8. Modal investigate
9. Acciones (investigate / watchlist / dismiss)
10. Vista filters

### Fase 3 — Stats & learning (1 día)
11. Tracking de actions
12. Conversion rate por source
13. Vista stats con ranking de sources
14. Auto-suggestion de "deactivar fuentes inefectivas tras 1 año"

### Fase 4 — Integraciones (medio día)
15. Push notifications HOT (cooldown global)
16. Cross-link a Cartas / Smart Money / Quality
17. Forced thesis creation cuando Discover → Position
18. Annual review section

**Total estimado**: 4-5 días concentrados.

---

## Decisiones tomadas

| Decisión | Opción elegida | Razón |
|----------|----------------|-------|
| Modelo | **No-LLM puro SQL/JS** | Determinista, gratis, reproducible |
| Cantidad de sources | **13 (S+A+B+C tiers)** | Cubre múltiples ángulos sin fragmentar |
| Convergence weight | **3x para multi-source** | La señal más fuerte es la convergencia |
| User filters | **Globales pre-scoring** | Simplicidad: define tu universo una vez |
| Lifecycle | **6 estados explícitos** | Trackeable, learnable |
| Re-emergencia post dismiss | **6 meses + 2 fuentes nuevas** | Evita fosilización del rechazo |
| Notificaciones | **Solo HOT (≥85), max 1/sem** | Anti-spam |
| Stats por source | **Sí, conversion rate tracked** | El módulo aprende con el tiempo |
| Forced tesis al promover | **Sí, modal bloqueante** | Cierra loop con Módulo Proceso |
| Discovery Score formula | **Multi-componente weighted** | Captura múltiples dimensiones |
| Refresh frequency | **Diaria 7am** | Equilibrio frescura/coste |
| Archive auto | **90 días sin acción** | Mantiene cola manejable |

---

## Riesgos y limitaciones

| Riesgo | Mitigación |
|--------|------------|
| **Cola se llena de basura** | Filtros agresivos pre-scoring + archive 90d |
| **El usuario nunca actúa** | Stats visibles muestran cuántos candidatos hay vs cuántos investigas → presión social hacia disciplina |
| **Sources pisan unos a otros** | Union deduplicada por ticker, multi-source convergence captura intersección como señal positiva |
| **Falsos positivos abundantes** | Tracking de conversion rate identifica fuentes inefectivas para desactivar |
| **Demasiadas notificaciones HOT** | Rate limit 1 HOT/semana + cooldown global |
| **Discovery → compras impulsivas** | Forced tesis al promover, igual que cualquier compra nueva |
| **Sesgo confirmación de tu estilo** | Sources como "Cobas screen" o "sector underweighted" introducen contrarian/diversificador |
| **Internacional poco cubierto** | Limitación de FMP, asumido. Cobertura US sólida |
| **Style screens estáticas** | Iterar las queries con tiempo según resultados |

---

## Próximos pasos cuando termine la rama paralela

1. Migration D1 (6 tablas)
2. Seed discovery_sources con los 13 screeners + sus configs
3. Fase 1: implementar las 13 queries y validar manualmente que devuelven tickers sensatos
4. Test composite scoring con 20 tickers conocidos
5. Lanzar cron diario en silencio 1 mes para acumular datos antes de exponer en UI
6. Después de 1 mes silencioso, activar UI y empezar a usarlo

## Decisiones aún pendientes

1. **¿Permitir custom screens del usuario?** → tentación grande pero peligro de complicar UI. Mejor en Fase 5
2. **¿Backtest histórico de las sources?** → calcular qué hubiera sugerido en 2020-2025 y ver retornos. Validación poderosa pero trabajo extra
3. **¿Discovery shortcuts para sectores específicos?** → "buscar healthcare quality" como botón rápido. Útil
4. **¿Compartir filtros con otros usuarios?** → social features = scope creep, NO en MVP
5. **¿LLM para summary de cada candidato?** → tentador pero las "razones" auto-generadas son suficientes para MVP. Opus solo si user hace click "explica más"
