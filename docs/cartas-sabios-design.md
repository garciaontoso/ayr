# Módulo "Cartas de los Sabios" — Annual Letters Knowledge Base

> Estado: DISEÑO. No implementar hasta merge de rama paralela.
> Generado 2026-04-07.

---

## Propósito

Mientras el módulo Fondos te dice **qué** compran/venden los grandes inversores (datos 13F), este módulo te dice **por qué** lo hacen. Las cartas anuales y trimestrales de los maestros son el mejor material educativo del mundo de la inversión — y nadie las lee porque están dispersas, son largas y muchas en inglés.

Este módulo:
1. **Auto-fetch** de cartas de las fuentes públicas
2. **Parser + Opus** las resume en español, extrae tickers mencionados, themes macro, citas notables
3. **UI navegable** para leer rápido o profundo
4. **Cross-reference con tu cartera** — alerta cuando un sabio menciona un ticker tuyo
5. **Quotes wall** — biblioteca de citas notables ordenable por tema

**Por qué importa**: las cartas explican el thinking process. Una entrada nueva de Akre en MA (que ves en su 13F) sin la carta es ruido. Con la carta donde Chuck explica los 4 pilares de su tesis MA, es educación.

---

## Filosofía

- **Resumen ≠ reemplazo**: el resumen Opus invita a leer la fuente, no la sustituye
- **Citas literales mínimas**: respeto absoluto al copyright, max 1 frase corta por carta
- **Thinking > tickers**: el valor es el razonamiento, no la lista de holdings
- **Curado**: solo ~25 fuentes de máxima calidad. Más es ruido
- **Spanish-first UI**: resúmenes y categorización en español, citas en idioma original

---

## Fuentes curadas — 25 sources

### Tier S — Lectura obligatoria (5)

| Source | Frecuencia | URL pattern | Por qué |
|--------|-----------|-------------|---------|
| **Berkshire Hathaway** (Buffett) | Annual | berkshirehathaway.com/letters/ | El maestro. Texto canónico. Cubierta cada año desde 1965 |
| **Howard Marks Memos** (Oaktree) | ~10/año | oaktreecapital.com/insights/memos | Los mejores ensayos sobre ciclos, riesgo, second-level thinking |
| **Akre Capital** | Quarterly | akrefund.com → quarterly commentaries | Three-legged stool, MA/V, compounders |
| **Giverny Capital** (Rochon) | Annual | givernycapital.com/letters | Cartas LARGAS (40+ páginas), educación pura quality investing |
| **Fundsmith Owner's Manual** (Terry Smith) | Annual + monthly factsheets | fundsmith.co.uk | Quality compounding biblia europea |

### Tier A — Lectura altamente recomendada (10)

| Source | Frecuencia | URL pattern | Estilo |
|--------|-----------|-------------|--------|
| **Polen Capital** | Quarterly | polencapital.com/insights | Quality growth |
| **Pershing Square** (Ackman) | Quarterly + presentaciones | pershingsquareholdings.com | Activist concentrated, presentaciones largas |
| **Markel CEO Letter** (Gayner) | Annual (en 10-K) | markel.com/investor-relations | Buffett-style insurer |
| **Yacktman Funds** | Quarterly | yacktman.com | Quality + dividends |
| **Wedgewood Partners** (Rolfe) | Quarterly | wedgewoodpartners.com | Concentrated quality |
| **Tom Russo / Gardner Russo & Quinn** | Quarterly + speeches | gardnerrusso.com | Dividend consumer brands LP |
| **Pabrai Funds** | Annual letter + interviews | chaiwithpabrai.com | Concentrated value |
| **Cobas AM** (Paramés) | Quarterly | cobasam.com | Deep value español |
| **Magallanes Value** | Quarterly | magallanesvalue.com | Quality value europeo |
| **azValor** | Quarterly | azvalor.com | Value + commodities |

### Tier B — Lectura selectiva (10)

| Source | Frecuencia | URL pattern | Estilo |
|--------|-----------|-------------|--------|
| Sequoia Fund | Quarterly | sequoiafund.com | Long-term quality |
| Longleaf Partners (Hawkins) | Quarterly | southeasternasset.com | Concentrated value |
| Oakmark (Nygren) | Quarterly | oakmark.com | Value clásico |
| Tweedy Browne | Quarterly | tweedy.com | Graham value |
| First Eagle Global | Quarterly | feim.com | Global value gold |
| Smead Capital | Monthly | smeadcap.com | Value + dividend |
| Davis Funds | Quarterly | davisfunds.com | Long-term quality |
| Horos AM | Quarterly | horosam.com | Deep value español |
| True Value | Quarterly | truevalueinvestments.com | Quality compounders españoles |
| Bestinver | Quarterly | bestinver.es | Value español post-Paramés |

### Casos especiales

| Source | Comportamiento |
|--------|---------------|
| **Klarman / Baupost** | Cartas privadas, solo subscribers. Algunas filtraciones. NO auto-fetch posible. Manual upload si conseguimos. |
| **Burry / Scion** | Tweets borrados + ocasionales notas. NO sistemático. |
| **Ackman public presentations** | PDFs muy largos en momentos clave (CP Rail, Herbalife, Netflix). Tracking ad-hoc. |
| **Buffett shareholder Q&A** | Transcripciones del annual meeting de Berkshire (~6h cada año) — gold mine pero requiere transcript externo. |

### Por qué solo 25

- **Tiempo de lectura**: 25 sources × 4 cartas/año = 100 cartas/año = 2 cartas/semana media. Manejable
- **Calidad > volumen**: estos 25 cubren todos los estilos relevantes
- **Coste Opus**: 100 cartas × $0.40 ≈ $40/año, sostenible
- **Mantenimiento**: 25 fetchers manejables, 50+ se vuelven pesadilla

---

## Pipeline técnico

### 1. Source registry
Tabla con todas las fuentes, su URL pattern, frecuencia esperada, último fetch exitoso, fetcher type (RSS / scraper / manual).

### 2. Auto-fetch (cron diario 6am)

```
Para cada source con followed=1:
  1. Si fetcher_type='rss' → check feed for new entries
  2. Si fetcher_type='scrape' → fetch index page, regex para detectar nuevos PDFs
  3. Si fetcher_type='manual' → skip
  4. Si nuevo letter detectado:
     a. Download PDF/HTML
     b. Save to R2 storage (Cloudflare R2)
     c. Insert row en `letters` con status='downloaded'
     d. Trigger pipeline de processing async
```

### 3. PDF → Text extraction

Cloudflare Workers no puede ejecutar pdfplumber/poppler nativamente. Opciones:

**Opción A** (recomendada): Mac local cron + push a worker
- Mac script descarga PDF, extrae texto con `pdftotext` (poppler)
- POST a `/api/letters/upload` con texto extraído + metadata
- Requiere Mac encendido (igual que sync-flex.sh actual)

**Opción B**: API externa (PDF.co, Adobe PDF Services)
- Worker llama API que devuelve texto
- Coste extra ~$0.05/PDF
- ~$5/año adicional

**Opción C**: Cloudflare Workers AI con vision model
- Recientemente disponible
- Más caro pero todo dentro del worker

**Decisión**: empezar con Opción A (reutiliza infraestructura cron Mac existente), migrar a B/C si el cron del Mac falla mucho.

### 4. Opus analysis pipeline

Cada carta nueva pasa por **un solo prompt** a Opus que devuelve JSON estructurado:

```
INPUT: texto de la carta + metadata source/fecha + lista de tickers del usuario

OUTPUT (JSON):
{
  "summary_es": "Resumen ejecutivo en español, 300-500 palabras...",
  "key_themes": ["macro inflation", "tech valuations", "dividend safety"],
  "ticker_mentions": [
    {
      "ticker": "KO",
      "context": "Buffett reitera tesis KO como ejemplo de moat indestructible",
      "sentiment": "bullish",
      "is_user_holding": true
    },
    ...
  ],
  "new_positions_mentioned": ["NESN", "BRKB"],
  "exits_mentioned": ["PARA"],
  "macro_views": {
    "rates": "expects higher for longer",
    "recession_probability": "low to moderate",
    "geographic_preference": "selective international"
  },
  "notable_quotes": [
    {
      "quote_original": "Time is the friend of the wonderful business",
      "language": "en",
      "context": "discussing long-term holding period",
      "page_ref": 7
    }
  ],
  "risks_discussed": ["credit cycle", "geopolitics", "concentration"],
  "thesis_updates": [
    {
      "ticker": "AAPL",
      "update": "Buffett menciona reducción 50% sin cambiar tesis estructural"
    }
  ],
  "quality_score": 8,
  "user_relevance_score": 7
}
```

**Coste estimado**:
- Input: ~12k tokens (carta de tamaño medio) + 1k contexto = 13k
- Output: ~3k tokens (JSON estructurado)
- Opus: $15/M input + $75/M output
- Por carta: 13×$0.015 + 3×$0.075 = $0.42
- 100 cartas/año = **$42/año**

### 5. Storage

- PDF original → Cloudflare R2 (cheap, 100MB/año estimado)
- Texto extraído → D1 (largo, varios MB)
- Análisis Opus JSON → D1 (estructurado)

### 6. Cross-reference con cartera

Después del análisis Opus:
1. Para cada `ticker_mentions` con `is_user_holding=true` → crear referencia en `user_holding_mentions`
2. Si `sentiment` cambió vs mención previa del mismo source → marcar como "thesis update"
3. Si `new_positions_mentioned` incluye un ticker tuyo → highlight en notificación

---

## Schema D1

```sql
-- Catálogo de fuentes
CREATE TABLE letter_sources (
  id TEXT PRIMARY KEY,              -- 'berkshire', 'akre', 'cobas-int', etc
  name TEXT NOT NULL,
  author TEXT,                      -- 'Warren Buffett', 'Chuck Akre'
  tier TEXT NOT NULL,               -- 'S' | 'A' | 'B'
  language TEXT,                    -- 'en' | 'es' | 'fr'
  expected_frequency TEXT,          -- 'annual' | 'quarterly' | 'monthly' | 'irregular'
  fetcher_type TEXT,                -- 'rss' | 'scrape' | 'manual'
  source_url TEXT,
  rss_url TEXT,
  followed BOOLEAN DEFAULT 1,
  last_fetch_attempt TEXT,
  last_fetch_success TEXT,
  last_letter_date TEXT,
  notes TEXT
);

-- Cartas individuales
CREATE TABLE letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  title TEXT,                       -- 'Q4 2025 Commentary' / 'Annual Letter 2025'
  letter_date TEXT NOT NULL,        -- fecha de publicación
  period_covered TEXT,              -- '2025-Q4', '2025-FY', etc
  source_url TEXT,                  -- URL del PDF original
  r2_key TEXT,                      -- key en R2 para retrieve
  word_count INTEGER,
  language TEXT,
  status TEXT NOT NULL,             -- 'pending' | 'downloaded' | 'extracted' | 'analyzed' | 'failed'
  text_extracted TEXT,              -- texto plano (puede ser MB)
  downloaded_at TEXT,
  analyzed_at TEXT,
  error_message TEXT,
  FOREIGN KEY (source_id) REFERENCES letter_sources(id)
);
CREATE INDEX idx_letters_source ON letters(source_id);
CREATE INDEX idx_letters_date ON letters(letter_date);
CREATE INDEX idx_letters_status ON letters(status);

-- Análisis Opus estructurado
CREATE TABLE letter_analysis (
  letter_id INTEGER PRIMARY KEY,
  summary_es TEXT NOT NULL,
  key_themes_json TEXT,             -- JSON array
  macro_views_json TEXT,            -- JSON object
  risks_json TEXT,                  -- JSON array
  thesis_updates_json TEXT,         -- JSON array
  quality_score INTEGER,            -- 1-10 (qué tan buena es la carta)
  user_relevance_score INTEGER,     -- 1-10 (qué tan relevante para tu cartera)
  opus_cost_usd REAL,
  analyzed_at TEXT,
  FOREIGN KEY (letter_id) REFERENCES letters(id)
);

-- Menciones de tickers (extraído del análisis)
CREATE TABLE letter_ticker_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  letter_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  mention_type TEXT,                -- 'thesis' | 'new_position' | 'exit' | 'reduction' | 'quick_mention'
  context TEXT,                     -- 1-2 frases en español
  sentiment TEXT,                   -- 'bullish' | 'neutral' | 'bearish'
  is_user_holding BOOLEAN,
  is_user_watchlist BOOLEAN,
  page_ref INTEGER,                 -- aprox página para deep link
  FOREIGN KEY (letter_id) REFERENCES letters(id)
);
CREATE INDEX idx_mentions_ticker ON letter_ticker_mentions(ticker);
CREATE INDEX idx_mentions_holding ON letter_ticker_mentions(is_user_holding);

-- Citas notables (quotes wall)
CREATE TABLE letter_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  letter_id INTEGER NOT NULL,
  quote_original TEXT NOT NULL,     -- texto literal en idioma original
  language TEXT,
  context_es TEXT,                  -- breve contexto en español
  themes_json TEXT,                 -- ['compounding', 'patience', 'moat']
  page_ref INTEGER,
  user_starred BOOLEAN DEFAULT 0,
  FOREIGN KEY (letter_id) REFERENCES letters(id)
);
CREATE INDEX idx_quotes_themes ON letter_quotes(themes_json);

-- Lecturas del usuario (track read state)
CREATE TABLE letter_user_state (
  letter_id INTEGER PRIMARY KEY,
  is_read BOOLEAN DEFAULT 0,
  is_starred BOOLEAN DEFAULT 0,
  read_at TEXT,
  user_notes TEXT,
  FOREIGN KEY (letter_id) REFERENCES letters(id)
);
```

---

## Endpoints worker.js

```js
// Sources
GET    /api/letters/sources                  // catálogo
POST   /api/letters/sources/{id}/follow      // toggle followed

// Letters
GET    /api/letters?source={id}&period=12m
GET    /api/letters/{id}                     // detalle completo
GET    /api/letters/{id}/text                // texto completo (lazy load)
GET    /api/letters/{id}/pdf                 // proxy desde R2
POST   /api/letters/{id}/read                // marcar leído
POST   /api/letters/{id}/star

// Manual upload (para fuentes manual + cron Mac)
POST   /api/letters/upload                   // POST con metadata + texto extraído

// Analysis
GET    /api/letters/{id}/analysis            // JSON estructurado
POST   /api/letters/{id}/reanalyze           // re-trigger Opus (si analysis fue malo)

// Cross-reference cartera
GET    /api/letters/mentions/{ticker}        // todas las menciones de un ticker
GET    /api/letters/mentions/my-portfolio?period=90d   // menciones recientes de tu cartera
GET    /api/letters/new-positions-overlap    // tickers nuevos mencionados en cartas vs tu cartera

// Quotes wall
GET    /api/letters/quotes?theme=compounding
GET    /api/letters/quotes?source=berkshire
POST   /api/letters/quotes/{id}/star

// Stats
GET    /api/letters/stats                    // total letters, by source, costo Opus mes
GET    /api/letters/most-mentioned?period=12m    // tickers más mencionados últimos 12 meses

// Refresh
POST   /api/letters/refresh                  // trigger fetch all sources
POST   /api/letters/refresh/{source_id}      // single source
```

---

## Integración con resto del sistema

### 1. Smart Money alerts (módulo Fondos)
Cuando llega alerta "Akre compró XYZ" → enlace a "Última carta de Akre" si menciona el ticker. Convierte señal de datos en señal con razonamiento.

### 2. Módulo Proceso (Tesis)
Cuando editas tesis de un ticker → panel lateral "Lo que dicen los sabios sobre {ticker}" con todas las menciones de los últimos 24 meses. Material para argumentar o refutar tu tesis.

### 3. Portfolio CompanyRow
Badge nuevo "📚" si hay menciones recientes (últimos 90 días) en cartas seguidas. Click → modal con todas las menciones.

### 4. Notificaciones
**Nueva categoría de alertas** (consolidada con cooldown global de 2 push/semana):
- 🔴 CRITICAL: nueva carta de Tier S que menciona ticker tuyo
- 🟡 WATCH: nueva carta de Tier A/B que menciona ticker tuyo
- ⚪ Solo digest: cartas nuevas sin menciones de tu cartera

### 5. Annual Review (Módulo Proceso)
En la vista de annual review → sección "Cartas más relevantes del año" con top 10 cartas por user_relevance_score.

---

## Wireframes — pestaña "📚 Sabios"

### Sub-tab 1: 🆕 Recientes
```
┌─ Cartas recientes ──────────────────────────────┐
│ [Filtro: todos | sin leer | starred] [Source▼]  │
│                                                   │
│ ● Berkshire Hathaway · Annual Letter 2025        │
│   25 feb 2026 · ⏱ 25 min · Calidad ⭐⭐⭐⭐⭐         │
│   Buffett discute sucesión, mantiene KO/AXP/AAPL │
│   reducido. 5 menciones de tu cartera (KO,       │
│   AAPL, MA, V, BRK).                             │
│   [Resumen ES] [Texto completo] [Marcar leído]   │
│                                                   │
│ ● Cobas Internacional · Q4 2025                  │
│   15 feb 2026 · ⏱ 12 min · Calidad ⭐⭐⭐⭐         │
│   Paramés justifica nueva entrada Maire          │
│   Tecnimont (4.2%), defiende tesis de holdings   │
│   ibéricos. 1 mención cartera (CIR).             │
│   [Resumen ES] [PDF] [Marcar leído]              │
│                                                   │
│ ○ Akre Capital · Q4 2025                         │
│   ✓ Leído · 5 días · Quality ⭐⭐⭐⭐⭐                │
│   ...                                            │
└──────────────────────────────────────────────────┘
```

### Sub-tab 2: 👤 Por autor
Cards de los 25 sabios con avatar, descripción, frecuencia, próxima carta esperada, link a todas las suyas. Click → vista de perfil con timeline completo.

### Sub-tab 3: 🎯 Menciones de mi cartera
```
Tus tickers en cartas últimos 12 meses (ordenado por # menciones)

KO   · 8 menciones en 6 cartas
  Berkshire 2025 (annual): "moat de distribución..."
  Yacktman Q3'25: "core dividend holding..."
  Tom Russo Q2'25: "ejemplo capacity to suffer..."
  Cobas Q1'25: brief mention sectorial
  ...

MA   · 5 menciones
  Akre Q4'25: "three legs intactos, +pricing..."
  Polen Q3'25: "still our largest position..."
  Pershing Square Q2'25: "exited fully — concerns about..."
  ...

[Filtro por sentiment: bullish/neutral/bearish]
[Filtro por mention type: thesis/new/exit/reduction]
```

### Sub-tab 4: 💬 Quotes Wall
```
┌─ Quotes Wall ───────────────────────────────────┐
│ [Themes: ▼ compounding · patience · moat ...]   │
│                                                   │
│ "Time is the friend of the wonderful business"   │
│ — Warren Buffett, Berkshire 1989                 │
│ #compounding #patience                           │
│ ⭐ Star                                           │
│                                                   │
│ "The big money is not in the buying or selling,  │
│  but in the waiting"                             │
│ — Charlie Munger, Berkshire annual meeting 2010  │
│ #patience #conviction                            │
│                                                   │
│ "Risk comes from not knowing what you're doing"  │
│ — Warren Buffett                                  │
│ #risk #knowledge                                 │
│                                                   │
│ ...                                               │
└──────────────────────────────────────────────────┘
```

Filtros: por tema, por autor, por starred, búsqueda libre.

### Sub-tab 5: 🌐 Macro Consensus
Análisis cross-source de macro views. Para cada tema (rates, recession, valuations, geographic), tabla con qué dice cada sabio y un consensus indicator.

```
                  Rates          Recession    Tech valuations
Buffett 25       Higher LT      Low risk     Selective
Marks (Q1'26)    Higher LT      Moderate     Bubble territory
Akre Q4'25       N/A focus      Low risk     Quality OK
Polen Q4'25      Manageable     Low risk     Quality compounders OK
Cobas Q4'25      Higher LT      High risk    Burbuja MAG7
Magallanes Q4'25 Manageable     Moderate     Selective Europe

CONSENSUS: rates higher LT (5/5), recession moderate (3/5),
tech valuations split (selective vs bubble)
```

### Sub-tab 6: 📊 Stats
```
Stats módulo Cartas (último año)
• 87 cartas analizadas
• 23 sources activos
• 142 menciones de tickers de tu cartera
• Coste Opus: $34.20
• Tu tasa de lectura: 67% (58/87 marcadas leídas)
• Top 5 sources más relevantes para ti:
  1. Tom Russo (12 menciones)
  2. Berkshire (10)
  3. Akre (9)
  4. Yacktman (8)
  5. Cobas (7)
```

---

## Agente "Sabios Reader"

```
Modelo: Opus (necesario para análisis profundo de PDFs largos)
Frecuencia: Daily 7am (después de Mac cron de fetch)

Pipeline:
1. Query letters WHERE status='extracted' (texto extraído pero no analizado)
2. Para cada carta:
   a. Build prompt con texto + cartera del usuario
   b. Call Opus structured output (JSON schema)
   c. Insert en letter_analysis
   d. Insert ticker_mentions
   e. Insert quotes
   f. Update letter status='analyzed'
3. Cross-reference: ¿alguna mention con is_user_holding=true?
   a. Si tier source ∈ {S,A} → CRITICAL push (respetando cooldown global)
   b. Si tier source = B → digest semanal
4. Cost tracking: log opus_cost_usd, alert si mensual > $10
```

---

## Coste y mantenimiento

### Coste mensual estimado
| Item | Coste |
|------|-------|
| Opus análisis (~10 cartas/mes) | $4/mes |
| Cloudflare R2 (PDFs) | <$0.50/mes |
| FMP queries (mínimo, ya cubierto) | $0 |
| **Total** | **~$5/mes** |

Comparado con el resto del sistema (~$33/mes en agentes Claude), esto suma <15%.

### Mantenimiento esperado
- **Fetchers rotos**: ~1-2/trimestre cuando una web cambia layout. 30 min de fix
- **PDF format changes**: Cobas/azValor/Magallanes ocasionalmente cambian template. Verificar parser
- **Sources nuevos**: añadir es trivial (1 row + URL)
- **Sources que desaparecen**: marcar `followed=0`

---

## Implementación por fases

### Fase 1 — Schema + manual upload (1 día)
1. D1 migrations: 6 tablas
2. Endpoint POST /api/letters/upload (manual)
3. Seed letter_sources con los 25 sources
4. Test: subir 3 cartas manualmente, verificar storage

### Fase 2 — Pipeline Opus (1 día)
5. Endpoint análisis con Opus structured output
6. Schema validation del JSON output
7. Insert en letter_analysis + ticker_mentions + quotes
8. Test con cartas reales

### Fase 3 — Mac fetcher cron (1 día)
9. Script Mac que itera sources con fetcher_type='scrape'
10. pdftotext extraction
11. POST a /api/letters/upload
12. Cron diario 6am
13. Logging + alertas si fetch falla

### Fase 4 — Frontend (2 días)
14. Componente `SabiosView.jsx` con 6 sub-tabs
15. Vista "Recientes" con cards
16. Modal de detalle (resumen ES + tabs: text completo / quotes / mentions)
17. Mark read/starred persistence
18. Quotes wall con filtros
19. Sub-tab "Mis menciones" con cross-reference
20. Stats sub-tab

### Fase 5 — Integración (medio día)
21. Badge 📚 en CompanyRow (Portfolio)
22. Panel lateral en modal de tesis (Módulo Proceso)
23. Enlace desde Smart Money alerts
24. Notificaciones consolidadas con cooldown global

### Fase 6 — Auto-fetch RSS (cuando aplique)
25. Para sources con RSS válido (Marks memos, algunos otros)
26. Worker cron diario en lugar de Mac cron

**Total estimado**: 5-6 días concentrados.

---

## Decisiones tomadas

| Decisión | Opción elegida | Razón |
|----------|----------------|-------|
| Modelo de análisis | **Opus, no Haiku** | Necesario para captar matices, citas, contexto |
| Idioma resumen | **Español** | Tu idioma nativo, mejor para retener |
| Citas literales | **Original + max 1 frase corta por carta** | Respeto copyright |
| PDF extraction | **Mac cron + pdftotext** | Reutiliza infra existente, gratis |
| Storage PDFs | **Cloudflare R2** | Cheap, integrado |
| Sources iniciales | **25 (5 Tier S + 10 Tier A + 10 Tier B)** | Calidad > volumen |
| Frecuencia Opus | **Por carta nueva, no batch** | Latencia baja, coste bajo |
| Cross-reference cartera | **Sí, automático** | Killer feature |
| Quotes wall | **Sí, dedicado** | Material educativo reutilizable |
| Macro consensus | **Sí, sub-tab** | Cross-source analysis es valor único |
| Notificaciones | **Consolidadas con Smart Money cooldown global** | Evita spam |

---

## Riesgos y limitaciones

| Riesgo | Mitigación |
|--------|------------|
| **Web cambia layout** → fetcher roto | Logging + alerta proactiva, fix rápido (30 min típico) |
| **PDF cambia formato** → texto malformado | pdftotext suele aguantar bien, fallback OCR si necesario |
| **Opus alucina ticker mentions** | Validar que ticker existe en universo conocido antes de insert |
| **Resumen ES de mala calidad** | Botón "re-analizar" + tracking de quality_score, cambiar prompt si baja |
| **Coste Opus crece** | Cap mensual hard ($15), alerta a $10 |
| **Cartas privadas (Klarman)** | Acepta limitación, marca como manual upload |
| **Copyright** | Solo summaries propios + 1 quote corta. Nunca reproducir párrafos |
| **Sesgo de fuentes (mayoría US)** | Tier B incluye españoles, ampliar Europa en Fase 7 si interesa |
| **Sobrecarga cognitiva** | Filtros + sub-tabs + read state. Solo notifica lo crítico |

---

## Próximos pasos cuando termine la rama paralela

1. Resolver URLs/RSS de los 25 sources (algunas requieren browse manual primero)
2. Schema migration D1
3. Empezar Fase 1: subir 3-5 cartas manualmente para validar pipeline Opus
4. Iterar el prompt Opus hasta que el JSON output sea consistente
5. Lanzar Fase 2-5 secuencialmente

## Decisiones aún pendientes

1. **¿Estructura del prompt Opus?** → diseñar y testear con 3-5 cartas reales antes de fijar
2. **¿Mostrar el JSON raw del análisis?** → opción avanzada, no en MVP
3. **¿Permitir uploads manuales del usuario?** → sí, para cartas privadas que consigas
4. **¿Reanalizar cartas viejas con prompt mejorado?** → sí, endpoint `/reanalyze`, manual
5. **¿Search semántica cross-letter?** → tentador (vector embeddings) pero overkill MVP. Fase 7+
6. **¿Comparar carta actual vs carta misma source quarter anterior?** → muy útil. "Polen Q4 vs Q3 — qué cambió en la narrativa"
