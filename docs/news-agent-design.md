# News Agent — Filtered News Pipeline

> Estado: DISEÑO. No implementar hasta merge de rama paralela.
> Generado 2026-04-07.

---

## Propósito

Las noticias financieras son **el peor ratio señal/ruido** de todas las fuentes de información. CNBC, Bloomberg, Yahoo Finance generan miles de titulares al día sobre tu cartera, y el 95% es ruido (clickbait, opiniones de analistas anónimos, headlines manipuladores para generar trades).

Este agente:
1. **Ingiere** noticias de fuentes via FMP
2. **Filtra** agresivamente lo irrelevante con Haiku
3. **Clasifica** por tipo y materialidad
4. **Almacena** estructurado en D1
5. **Alimenta** al Daily Briefing Agent (no notifica directamente)

**Filosofía clave**: este agente NO genera notificaciones push propias. Es una *fuente* de datos, igual que Smart Money o Cartas. El usuario nunca recibe "última hora" — recibe síntesis diaria del Briefing Agent.

---

## Por qué no notificar push directamente

Tentación obvia: "noticia importante de KO ahora → push instant". Razones para NO hacerlo:

1. **Velocidad ≠ valor**: una noticia que llega 6h después con contexto vale más que una "primicia" sin contexto
2. **Anti-trading**: las notificaciones de noticias generan reactividad emocional → trades impulsivos
3. **El mercado ya ha digerido la noticia** cuando tú la lees. Reaccionar tarde = comprar lo que ya subió o vender lo que ya cayó
4. **Tu sistema es para inversión, no trading**. El framework Buffett-style necesita pausa, no urgencia
5. **Mejor 1 digest/día con todo en perspectiva** que 20 alertas sueltas

La única excepción sería un evento verdaderamente material (ej. earnings cancelados, fraude, bankruptcy) — y eso ya lo capturaría el Earnings Intelligence o el Quality Score con su propio sistema de alertas.

---

## Endpoints FMP a usar

```
GET /v3/stock_news?tickers={tickers}&limit=50
GET /v4/general_news?page=0
GET /v4/press-releases/{ticker}?page=0
GET /v3/historical-stock-news/{ticker}?limit=50
GET /v3/social-sentiments/{ticker}              # opcional: Twitter/Reddit sentiment
```

Datos por noticia:
- Symbol (ticker)
- Title
- Text (contenido completo o snippet)
- Site/source (Bloomberg, Reuters, etc)
- Published date
- URL
- Image
- Author (cuando disponible)

---

## Pipeline del agente

### Frecuencia
**3x/día**: 6am, 14:00, 22:00 ET. Cubre Europa morning + US market hours + after-hours.

### Pipeline detallado

```
1. Para cada ticker en (positions ∪ watchlist):
   a. Pull /v3/stock_news?tickers={ticker}&limit=20
   b. Filter por timestamp > last_run_time
   c. Dedupe por URL
   d. Insert en news_raw

2. Pull general financial news (/v4/general_news):
   a. Get top 50 últimas noticias macro
   b. Insert en news_raw con ticker=null

3. Para cada noticia nueva en news_raw:
   a. Llamar Haiku con prompt de filtrado/clasificación
   b. Output structured: relevance_score, category, materiality, summary_es
   c. Insert en news_processed
   d. Si relevance_score < 30 → marca status='filtered' (no se muestra)

4. Cleanup: archive noticias > 30 días con relevance_score < 50
```

### Prompt Haiku — clasificación de noticia

```
INPUT:
- Title
- Text snippet (max 500 chars)
- Source
- Ticker(s)
- User context: ¿este ticker está en cartera (yes/weight%) o watchlist?

OUTPUT (JSON estructurado):
{
  "relevance_score": 0-100,
  "category": "earnings" | "guidance" | "ma" | "dividend" | "regulatory" |
              "rating_change" | "macro" | "lawsuit" | "executive_change" |
              "product" | "opinion" | "rumor" | "noise",
  "materiality": "high" | "medium" | "low",
  "sentiment": "positive" | "neutral" | "negative",
  "summary_es": "1-2 frases resumen en español",
  "key_facts": ["fact 1", "fact 2"],
  "is_actionable": true/false,
  "redundant_with_existing": false
}
```

Coste por noticia: ~300 input tokens + 100 output tokens = $0.0006/noticia. **Total estimado mensual**: ~3000 noticias × $0.0006 = **$2/mes**.

### Lógica de filtrado por relevancia

**relevance_score baseline**:
- Ticker en cartera + materiality high → 80-100
- Ticker en cartera + materiality medium → 50-70
- Ticker en cartera + materiality low → 20-40
- Ticker en watchlist → -10 al baseline
- Ticker no relevante → 0-20

**Penalty automático**:
- Source es opinión/blog → -20
- Category = "rumor" → -30
- Category = "opinion" → -25
- Title con clickbait keywords → -15
- Duplicado de otra noticia same day → -50

**Bonus automático**:
- Source primary (PR Newswire, Business Wire, SEC filings) → +20
- Category = "earnings" + es earnings day → +30
- Category = "dividend" + change → +25
- Mentions multiple tickers de tu cartera → +10

### Categorías que NUNCA pasan filtro (auto-archivar)

- "X analyst upgrades Y to overweight" — analyst opinions ya están en módulo Quality
- "5 reasons to buy/sell X" — clickbait
- "X stock is up/down today because Y" — noise post-hoc rationalization
- "Could X be the next big thing?" — speculation
- Pure macro sin ticker (a menos que afecte sector relevante)

---

## Schema D1

```sql
-- Noticias raw (todo lo descargado, antes de procesar)
CREATE TABLE news_raw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  text TEXT,
  source TEXT,
  published_at TEXT NOT NULL,
  ticker TEXT,                           -- null para macro general
  image_url TEXT,
  author TEXT,
  fetched_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending'          -- 'pending' | 'processed' | 'filtered' | 'error'
);
CREATE INDEX idx_nr_status ON news_raw(status);
CREATE INDEX idx_nr_ticker ON news_raw(ticker);
CREATE INDEX idx_nr_published ON news_raw(published_at);

-- Noticias procesadas con clasificación Haiku
CREATE TABLE news_processed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_id INTEGER NOT NULL,
  ticker TEXT,
  relevance_score INTEGER NOT NULL,      -- 0-100
  category TEXT NOT NULL,
  materiality TEXT,                      -- 'high' | 'medium' | 'low'
  sentiment TEXT,                        -- 'positive' | 'neutral' | 'negative'
  summary_es TEXT NOT NULL,
  key_facts_json TEXT,                   -- JSON array
  is_actionable BOOLEAN DEFAULT 0,
  is_user_holding BOOLEAN,
  is_user_watchlist BOOLEAN,
  haiku_cost_usd REAL,
  processed_at TEXT NOT NULL,
  FOREIGN KEY (raw_id) REFERENCES news_raw(id)
);
CREATE INDEX idx_np_ticker ON news_processed(ticker);
CREATE INDEX idx_np_relevance ON news_processed(relevance_score DESC);
CREATE INDEX idx_np_category ON news_processed(category);

-- Stats agregados (para dashboard de eficiencia)
CREATE TABLE news_stats (
  date TEXT PRIMARY KEY,
  total_fetched INTEGER,
  total_processed INTEGER,
  total_filtered INTEGER,
  total_actionable INTEGER,
  cost_usd REAL
);
```

---

## Endpoints worker.js

```js
GET  /api/news/recent?ticker={t}&days=7        // últimas relevantes
GET  /api/news/by-category?cat=earnings        // por categoría
GET  /api/news/actionable?period=7d            // solo is_actionable=1
GET  /api/news/stats?period=30d                // métricas del agente

POST /api/news/refresh                         // trigger manual
POST /api/news/process-pending                 // procesa raw pending con Haiku

GET  /api/news/{id}                            // detalle individual
POST /api/news/{id}/dismiss                    // user feedback: no relevante
POST /api/news/{id}/important                  // user feedback: relevante (mejora filtros)
```

---

## Integración con Daily Briefing Agent

El News Agent **no se muestra al usuario directamente** (excepto en una pestaña opcional). Su valor está en **alimentar al Daily Briefing Agent**, que cada mañana lee:

```
SELECT * FROM news_processed
WHERE processed_at > yesterday 9am
  AND relevance_score >= 50
  AND ticker IN (positions ∪ watchlist)
ORDER BY relevance_score DESC, published_at DESC
LIMIT 30
```

Y las incluye en el contexto para escribir el briefing diario. El usuario solo lee el briefing — nunca tiene que filtrar 200 noticias él mismo.

---

## UI mínima (sub-tab opcional, no prioritario)

Si el usuario quiere verlas directamente, sub-tab "📰 Noticias" en el portfolio:

```
┌─ News — últimas 7 días ─────────────────────────────┐
│ [Filter: All | Cartera | Watchlist | Actionable]    │
│ [Category: All | Earnings | Dividend | Regulatory]  │
│                                                       │
│ 🔥 KO · earnings · high · positive · 4h              │
│   Coca-Cola raises FY guidance after Q1 beat         │
│   Subió guidance EPS de $2.85-2.95 a $2.90-3.00     │
│   [Read source] [Mark dismiss]                       │
│                                                       │
│ 📊 MSFT · regulatory · medium · negative · 8h       │
│   EU antitrust investigation widens                  │
│   ...                                                 │
│                                                       │
│ 💰 ABT · dividend · high · positive · 1d            │
│   Abbott raises dividend 7% (51st consecutive year)  │
│   ...                                                 │
└──────────────────────────────────────────────────────┘
```

Pero insisto: **el flujo principal es vía Daily Briefing**, no esta vista. Esta es solo "deep dive" para usuarios curiosos.

---

## Coste estimado

- 3000 noticias/mes pre-filtradas
- ~70% pasan al filtro Haiku (las otras 30% se descartan por dedupe/keywords obvios)
- 2100 llamadas Haiku × $0.0006 = **$1.30/mes**

Add buffer = **$2/mes**. Trivial.

---

## Aprendizaje activo

El sistema mejora con feedback explícito del usuario:

**Botones en cada noticia**:
- ❌ "No relevante" → entrenar al modelo a bajar relevance_score para ese tipo
- ⭐ "Importante" → subir relevance_score para ese tipo

Después de N feedbacks (ej. 100), recalibrar prompt Haiku con ejemplos del usuario para mejorar precisión personal.

Esto es exactamente lo mismo que hace el Discovery Engine con conversion rates — el sistema aprende empíricamente qué te interesa a ti.

---

## Implementación por fases

### Fase 1 — Pipeline ingest (1 día)
1. Migrations D1: 3 tablas
2. Cron 3x/día fetch FMP news
3. Insert raw
4. Dedupe por URL

### Fase 2 — Haiku classifier (1 día)
5. Prompt structured output
6. Process pending pipeline
7. Cost tracking
8. Filtros pre-Haiku (keywords, dedupe, source blacklist)

### Fase 3 — Integración (medio día)
9. Endpoint para Daily Briefing Agent
10. Stats dashboard
11. Sub-tab UI opcional (lazy)

### Fase 4 — Active learning (medio día)
12. Feedback buttons UI
13. Recalibración del prompt cada 100 feedbacks
14. Stats de precisión

**Total**: 3 días.

---

## Decisiones tomadas

| Decisión | Opción elegida | Razón |
|----------|----------------|-------|
| Notificaciones directas | **NO** | Filosofía anti-reactividad |
| Modelo clasificador | **Haiku** | Volumen alto, tarea simple, coste bajo |
| Frecuencia fetch | **3x/día** | Cubre AM, market hours, AH sin overload |
| Output del agente | **Alimenta Daily Briefing** | Síntesis vs feed |
| Almacenamiento | **30 días raw, indefinido processed** | Espacio gestionable |
| Active learning | **Sí, con feedback explícito** | Mejora precisión personal |
| Sub-tab UI | **Opcional, no prioritario** | El briefing es el flujo principal |
| Categorías auto-skip | **Sí, lista hardcoded** | Filtro pre-Haiku ahorra coste |

---

## Riesgos y limitaciones

| Riesgo | Mitigación |
|--------|------------|
| FMP cobertura incompleta | Fallback a /v4/general_news, scrapear sólo si necesario |
| Haiku alucina relevance | Validación structured output + cap min/max scores |
| Spam de PR releases | Source blacklist + dedupe agresivo |
| User no da feedback | Sistema funciona sin él, solo no se personaliza |
| Cambios formato FMP | Schema flexible JSON en news_raw |
| Coste se infla | Cap mensual $5, alerta a $3 |
