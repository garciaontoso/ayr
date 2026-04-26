# Módulo Proceso — Tesis + Checklist + Journal + Review

> Estado: DISEÑO. No implementar hasta merge de rama paralela.
> Generado 2026-04-07.

---

## Propósito

Convertir la app de "inversor con datos" a "inversor con disciplina". El módulo captura el **proceso de decisión** alrededor de cada posición, no solo los datos.

**Filosofía**: la diferencia entre un inversor mediocre y uno excelente, con la misma información, es siempre el proceso. Buffett, Munger, Pabrai, Klarman, Akre — todos mantienen versiones de esto.

**Hipótesis clave**: con 89 posiciones actuales en cartera y 11 agentes generando señales diarias, el cuello de botella YA NO es información. Es estructura.

---

## Los 4 componentes

### 1. Tesis por posición
Resumen escrito de **por qué** tienes cada posición. Obligatorio para todas las posiciones existentes (retroactivo) y para todas las nuevas (antes de comprar).

### 2. Checklist de entrada
Lista de criterios que un ticker debe cumplir antes de añadirlo a cartera. Personalizable por categoría (dividend payer, growth, special situation).

### 3. Journal de decisiones
Log de cada compra/venta con razón, contexto de mercado, fuente de la idea, y revisión posterior.

### 4. Review periódica
Revisión sistemática de tesis cada quarter/año. Marca cada posición como "sigue válida", "necesita revisión", "tesis rota".

---

## 1. Tesis por posición

### Estructura mínima (3 campos obligatorios)

```
Ticker: KO
Fecha tesis: 2026-04-07
Última revisión: —

POR QUÉ LA TENGO (1-2 frases):
Marca global con moat de distribución imposible de replicar, dividend
aristocrat 60+ años, 60% revenue non-US protege contra USD weakness.

QUÉ ME HARÍA VENDER (1-2 frases concretas):
Recorte de dividendo, payout >85% sostenido 4Q, pérdida market share
en mercados emergentes >5pp en 2 años consecutivos.

PESO OBJETIVO: 4-5% de cartera
PESO ACTUAL: 4.2% ✓
```

### Campos opcionales (recomendados)

```
TIPO DE TESIS: [Dividend Compounder | Quality Growth | Deep Value | Special Sit | Macro]
HORIZONTE: [LP indefinido | 3-5 años | <2 años]
FUENTE DE LA IDEA: [Propia | Cobas Q4'24 | Carta Akre 2025 | etc]
CONVICTION: ⭐⭐⭐⭐ (1-5)

KEY METRICS A VIGILAR:
- Payout ratio (max 75%)
- Debt/EBITDA (max 2.5)
- DGR 5y (min 4%)
- ROIC (min 15%)

NOTAS LIBRES: (markdown)
[texto libre con thesis details, links, etc]
```

### Reglas

1. **Toda posición ≥1% del portfolio** debe tener tesis. Sin excepción.
2. **Toda nueva compra** requiere tesis ANTES de ejecutar (modal bloqueante en UI cuando "registrar compra").
3. **La tesis se versiona** — cada modificación crea nueva versión, histórico visible.
4. **Length cap**: 500 caracteres en "por qué" y "qué vendería" para forzar concreción. Notas libres sin límite.

### Vista en CompanyRow

Badge nuevo en cada fila del Portfolio:
- 🟢 **Tesis al día** (revisada en último año, peso dentro de target)
- 🟡 **Tesis necesita revisión** (>1 año sin revisar, o peso fuera de target)
- 🔴 **Sin tesis** (ranking de vergüenza, fuerza acción)

Click en badge → modal con tesis completa + histórico de versiones.

---

## 2. Checklist de entrada

### Filosofía
Inspirada en Pabrai (70 puntos) y Mauboussin (frameworks de checklist). Lista personalizable por **categoría de tesis**.

### Categorías iniciales propuestas

**A. Dividend Compounder** (la mayoría de tu cartera)
```
□ Yield ≥ 2.5% O DGR 5y ≥ 7%
□ Payout ratio ≤ 75% (FCF, no earnings)
□ Dividend history ≥ 10 años sin recortes
□ Debt/EBITDA ≤ 3.0
□ ROIC ≥ 12% promedio 5y
□ Revenue CAGR 5y ≥ 3%
□ Moat identificable (network/brand/cost/switching/scale)
□ Industria con tailwinds o defensiva
□ Management con skin in the game (insider holding ≥1%) o track record dividend
□ No conflicto regulatorio mayor pendiente
□ Forward P/E ≤ media 10y de la propia empresa
□ FCF yield ≥ bond yield 10y + 2pp
□ Currency exposure aceptable (no concentración geo riesgosa)
□ Cabe en diversificación sectorial (sector ≤20% cartera)
□ Convicción real: ¿la tendría 10 años sin mirar precio? Sí/No
```

**B. Quality Growth** (Polen/Akre style — MA, V, MSFT, etc.)
```
□ Revenue growth 5y ≥ 10%
□ FCF margin ≥ 20%
□ ROIC ≥ 20%
□ Debt/EBITDA ≤ 2.0
□ Reinvestment runway visible 5+ años
□ Moat structural (network/switching/scale)
□ Management capital allocation grade A
□ Forward PEG ≤ 2.0
□ FCF yield ≥ 3% (más permisivo, growth justifica)
□ ¿Sería business owner? Sí/No
```

**C. Deep Value** (Cobas/Klarman style)
```
□ P/Tangible Book ≤ 1.5
□ EV/EBITDA ≤ 6
□ FCF yield ≥ 8%
□ Net debt manejable o net cash
□ Catalizador identificado en 2-3 años
□ Margen seguridad ≥ 40% vs valor intrínseco propio
□ ¿Sigue siendo barato si reduzco estimaciones 30%? Sí
□ Insider buying reciente o buyback agresivo
```

**D. Special Situation** (spin-offs, restructurings)
```
□ Catalizador con fecha
□ Asimetría reward/risk ≥ 3:1
□ Tamaño posición ≤ 2% (riesgo binario)
□ Tesis comprensible en 1 frase
```

### Reglas

1. **Una posición no puede ser comprada si falla >2 checks** sin justificación escrita en la tesis.
2. **Override consciente permitido**: si fallas 3 checks pero quieres comprar igual, debes escribir 1-2 párrafos justificándolo. Eso queda en el journal.
3. **Checklists son editables**: tú defines tus criterios, no son inmutables. Pero modificarlas crea entrada en journal con razón.

### Implementación práctica
- Modal "Añadir posición" → selecciona categoría → muestra checklist → marcas → si <85% checks, warning amarillo, si <70% rojo bloqueante (con override).

---

## 3. Journal de decisiones

### Estructura por entrada

```
Fecha: 2026-04-07 14:32
Tipo: COMPRA | VENTA | AJUSTE | NOTA
Ticker: KO
Cantidad: +50 shares
Precio: $62.40
Total: $3,120

CONTEXTO DE MERCADO:
SPY -2.1% día, sector consumer staples -1.5%, KO -3.2% por miss earnings Q1.

FUENTE DE LA IDEA:
Propia / Carta Cobas Q4 / Smart Money Alert / Agente Earnings / etc.

RAZÓN DE LA DECISIÓN (texto libre, recomendado 3-5 frases):
Aprovecho overreaction al miss EPS Q1 ($0.71 vs $0.75 est). El miss es por
FX headwinds Latam y comparable difícil vs Q1'25. Volume orgánico +2%, price
mix +3% sigue intacto. Tesis no afecta. Subo peso de 4.2% a 4.6%.

CONVICTION ANTES: ⭐⭐⭐⭐
CONVICTION DESPUÉS: ⭐⭐⭐⭐
TIME HORIZON: LP indefinido

REVISIÓN POSTERIOR (a rellenar 90/180/365 días después):
[ ] 90d: precio _, decisión correcta? _
[ ] 180d: _
[ ] 365d: _
[ ] 730d: _
```

### Vista journal

Sub-tab nuevo en Portfolio o Analytics → "Journal":
- Timeline cronológico inverso de todas las decisiones
- Filtros: por ticker, por tipo, por fuente, por año
- Por entrada: badge de "decisión validada" / "decisión cuestionada" tras review 365d
- Stats agregadas:
  - "Decisiones que volverías a tomar" %
  - "Mejor fuente de ideas" (qué fuente generó decisiones que envejecieron mejor)
  - "Peor fuente de ideas" (la que más errores generó)
  - "Tiempo medio entre idea y compra" (mide impulsividad)

### Por qué importa el journal — la realidad incómoda

Sin journal, **la memoria reescribe la historia**. Recuerdas las compras que salieron bien, olvidas las que salieron mal, y construyes una falsa narrativa de tu propio skill. El journal es la única forma de saber empíricamente:
- ¿Mis ideas propias rinden mejor que las copiadas?
- ¿Compro mejor en pánico o en calma?
- ¿Mis ventas suelen ser correctas o tempranas?
- ¿Qué fuentes (Cobas, agentes, screening propio) generan mejores decisiones?

Después de 2-3 años de journal, **conoces tu propio edge real** (o descubres que no tienes uno y deberías indexar).

### Auto-poblado desde IB
- Cada compra/venta detectada en `cost_basis` (sync IB Flex) → genera entrada vacía en journal con prompt "completar contexto y razón"
- Notificación una vez por semana con "tienes 3 entradas de journal sin completar"
- No bloquea, pero crea fricción positiva para escribir

---

## 4. Review periódica

### Cadencia
- **Quarterly review**: marca cada tesis como "válida / atención / rota"
- **Annual review**: revisión profunda + resumen del año + lecciones del journal

### Quarterly review (15 min)
UI: lista de tus posiciones ≥1% portfolio + un toggle por cada una:
- ✅ Tesis sigue válida
- ⚠️ Necesita revisión (escribe nota corta)
- ❌ Tesis rota → marcar para venta

Sistema bloquea progreso hasta marcar todas. **Anti-procrastinación**.

### Annual review (1-2h, fin de año)
Pantalla especial generada automáticamente:
- Mejores 5 decisiones del año (mayor IRR realizado)
- Peores 5 decisiones del año
- Decisiones que NO tomaste (oportunidades perdidas detectadas vs watchlist)
- Stats journal: best/worst source, conviction accuracy, etc.
- Espacio para escribir "lecciones aprendidas" → se vuelven punto en checklist del año siguiente

### Integración con Fondos
**Las alertas Smart Money disparan revisión, no compras**:
- Llega notificación "Cobas vendió XYZ que tienes" → app sugiere abrir tesis de XYZ y revisar
- NO hay botón "comprar" / "vender" en la notificación
- Hay botón "revisar tesis" → te lleva al modal de tesis

Esto es crítico filosóficamente. La señal externa **alimenta el proceso**, no lo reemplaza.

---

## Schema D1

```sql
-- Tesis por posición (versionada)
CREATE TABLE theses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  version INTEGER NOT NULL,        -- 1, 2, 3... cada edit incrementa
  is_current BOOLEAN DEFAULT 1,

  -- Campos obligatorios
  why_owned TEXT NOT NULL,         -- max 500 chars
  what_would_make_sell TEXT NOT NULL,  -- max 500 chars
  target_weight_min REAL,
  target_weight_max REAL,

  -- Opcionales
  thesis_type TEXT,                -- dividend_compounder | quality_growth | deep_value | special_sit | macro
  horizon TEXT,                    -- lp_indefinite | 3_5y | under_2y
  idea_source TEXT,
  conviction INTEGER,              -- 1-5
  key_metrics_json TEXT,           -- JSON con metrics a vigilar
  notes_md TEXT,                   -- texto libre markdown

  -- Meta
  created_at TEXT NOT NULL,
  superseded_at TEXT,
  superseded_reason TEXT
);
CREATE INDEX idx_theses_ticker ON theses(ticker, is_current);

-- Checklists templates
CREATE TABLE checklist_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,          -- 'dividend_compounder' etc
  name TEXT NOT NULL,
  items_json TEXT NOT NULL,        -- JSON array de items
  active BOOLEAN DEFAULT 1,
  created_at TEXT
);

-- Checklist instances (cada vez que aplicas un checklist a una compra)
CREATE TABLE checklist_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  template_id INTEGER NOT NULL,
  results_json TEXT NOT NULL,      -- JSON {item_id: bool, ...}
  pass_rate REAL,                  -- % checks pasados
  override_reason TEXT,            -- si compras con <70% checks
  journal_entry_id INTEGER,
  created_at TEXT NOT NULL
);

-- Journal de decisiones
CREATE TABLE journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_date TEXT NOT NULL,
  decision_type TEXT NOT NULL,     -- BUY | SELL | ADJUST | NOTE
  ticker TEXT,
  shares REAL,
  price REAL,
  total REAL,

  market_context TEXT,             -- texto libre o auto-poblado
  idea_source TEXT,                -- 'own' | 'cobas_q4_25' | 'akre_letter_2025' | 'smart_money_alert' | 'agente_earnings' | etc
  reason_text TEXT,                -- razón texto libre

  conviction_before INTEGER,       -- 1-5
  conviction_after INTEGER,
  time_horizon TEXT,

  thesis_version_id INTEGER,       -- FK a theses
  checklist_run_id INTEGER,        -- FK a checklist_runs

  -- Auto-poblado desde IB sync
  ib_trade_id TEXT,
  needs_completion BOOLEAN DEFAULT 1,  -- true si fue auto-creada y no rellenada

  created_at TEXT NOT NULL
);
CREATE INDEX idx_journal_ticker ON journal_entries(ticker);
CREATE INDEX idx_journal_date ON journal_entries(decision_date);
CREATE INDEX idx_journal_needs ON journal_entries(needs_completion);

-- Reviews periódicas de cada decisión (90/180/365 días)
CREATE TABLE journal_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_entry_id INTEGER NOT NULL,
  review_period_days INTEGER NOT NULL,    -- 90, 180, 365, 730
  reviewed_at TEXT NOT NULL,
  price_at_review REAL,
  pnl_pct REAL,
  decision_quality TEXT,                  -- 'correct' | 'wrong' | 'too_early' | 'too_late' | 'neutral'
  notes TEXT,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
);

-- Quarterly thesis reviews
CREATE TABLE thesis_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thesis_id INTEGER NOT NULL,
  review_quarter TEXT NOT NULL,           -- '2026-Q2'
  status TEXT NOT NULL,                   -- 'valid' | 'attention' | 'broken'
  notes TEXT,
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY (thesis_id) REFERENCES theses(id)
);

-- Annual review summary (1 row per year)
CREATE TABLE annual_reviews (
  year INTEGER PRIMARY KEY,
  best_decisions_json TEXT,
  worst_decisions_json TEXT,
  missed_opportunities_json TEXT,
  source_stats_json TEXT,
  lessons_md TEXT,
  created_at TEXT
);
```

---

## Endpoints worker.js a añadir

```js
// Tesis
GET    /api/theses                       // todas
GET    /api/theses/{ticker}              // current version
GET    /api/theses/{ticker}/history      // todas versiones
POST   /api/theses                       // crea nueva (incrementa version, marca current)
PUT    /api/theses/{ticker}              // alias de POST (semantic)
DELETE /api/theses/{ticker}              // soft delete
GET    /api/theses/missing               // posiciones ≥1% sin tesis

// Checklists
GET    /api/checklists/templates
POST   /api/checklists/templates         // editar templates
POST   /api/checklists/run               // ejecuta checklist en compra
GET    /api/checklists/runs/{ticker}

// Journal
GET    /api/journal                      // timeline filtrable
GET    /api/journal/{id}
POST   /api/journal                      // nueva entrada manual
PUT    /api/journal/{id}                 // edit
POST   /api/journal/{id}/review          // añadir review periódica
GET    /api/journal/needs-completion     // entradas auto-creadas pendientes
GET    /api/journal/stats?year=2026      // stats agregadas

// Reviews
GET    /api/reviews/quarterly?quarter=2026-Q2
POST   /api/reviews/quarterly
GET    /api/reviews/annual/{year}
POST   /api/reviews/annual/{year}

// Auto-creation hook (interno)
POST   /api/journal/from-ib-trade        // llamado por sync-flex.sh cuando detecta nueva trade
```

---

## Integración con resto de la app

### 1. Portfolio (CompanyRow)
- Badge nuevo de tesis (🟢🟡🔴) en cada fila
- Click → modal con tesis actual + opción "editar"

### 2. Header del Portfolio
- Stat nueva: "Tesis al día: 78% (15 sin revisar)"
- Click → vista de quarterly review

### 3. Alertas existentes
- Cualquier alerta sobre un ticker → enlace directo a su tesis para contextualizar
- Smart Money alerts NUNCA con botón de compra/venta directo, siempre "revisar tesis"

### 4. Sync IB Flex (cron)
- Cuando detecta trades nuevas → crea journal entries auto con `needs_completion=1`
- Notificación semanal: "tienes N entradas de journal sin completar"

### 5. Health Check panel
- Nuevo check: "Tesis al día" con porcentaje
- Nuevo check: "Journal reviews atrasados" (entradas sin review 90/180/365)

### 6. Annual review
- 1 enero genera draft auto con datos del año
- Notificación: "Tu annual review 2025 está listo para revisar"

---

## Wireframes — vistas nuevas

### A. Modal "Tesis" (desde CompanyRow)
```
┌─ KO — Tesis ────────────────────────────────────┐
│ v3 · Última edición 2026-01-15 · ✏️ Editar      │
│                                                   │
│ POR QUÉ LA TENGO                                 │
│ Marca global con moat de distribución imposible │
│ de replicar, dividend aristocrat 60+ años, 60%  │
│ revenue non-US protege contra USD weakness.      │
│                                                   │
│ QUÉ ME HARÍA VENDER                             │
│ Recorte de dividendo, payout >85% sostenido 4Q, │
│ pérdida market share emergentes >5pp en 2 años. │
│                                                   │
│ Tipo: Dividend Compounder · Horizonte: LP        │
│ Conviction: ⭐⭐⭐⭐ · Fuente: Propia              │
│ Target peso: 4-5% · Actual: 4.2% ✓              │
│                                                   │
│ Key metrics vigiladas:                           │
│ • Payout ratio < 75%        (actual 67%) ✓      │
│ • Debt/EBITDA < 2.5         (actual 2.1) ✓      │
│ • DGR 5y > 4%               (actual 5.2%) ✓     │
│ • ROIC > 15%                (actual 17.3%) ✓    │
│                                                   │
│ [Ver historial 3 versiones] [Marcar review]      │
└──────────────────────────────────────────────────┘
```

### B. Modal "Comprar nueva posición" (con checklist bloqueante)
```
┌─ Nueva compra: NESN ─────────────────────────────┐
│ Categoría tesis: [Dividend Compounder ▼]         │
│                                                   │
│ Checklist (Dividend Compounder)        14/15 ✓  │
│ ✓ Yield ≥ 2.5% O DGR 5y ≥ 7%                    │
│ ✓ Payout ratio ≤ 75%                            │
│ ✓ Dividend history ≥ 10 años sin recortes        │
│ ✓ Debt/EBITDA ≤ 3.0                             │
│ ✗ ROIC ≥ 12% (actual 11.2%) ⚠️                  │
│ ✓ Revenue CAGR 5y ≥ 3%                          │
│ ✓ Moat identificable                             │
│ ✓ ... 8 más                                      │
│                                                   │
│ Pass rate: 93% ✓                                 │
│                                                   │
│ TESIS (obligatoria antes de comprar)             │
│ ┌────────────────────────────────────────────┐ │
│ │ Por qué la quiero...                       │ │
│ └────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────┐ │
│ │ Qué me haría vender...                     │ │
│ └────────────────────────────────────────────┘ │
│                                                   │
│ Target weight: [3]%                              │
│                                                   │
│ [Cancelar]                  [Continuar a IB →]  │
└──────────────────────────────────────────────────┘
```

### C. Vista Journal
```
┌─ Journal de Decisiones ─────────────────────────┐
│ [Filtro: año 2026] [Tipo: todos] [Ticker: ___]  │
│                                                   │
│ Stats 2026 hasta hoy:                            │
│ • 23 decisiones · 18 BUY / 5 SELL               │
│ • Mejor fuente: Propia (8/10 OK) ⭐              │
│ • Peor fuente: Smart Money (3/7 OK)              │
│ • Tiempo medio idea→compra: 4 días              │
│ • Conviction accuracy: 76%                       │
│                                                   │
│ ────────────────────────────────────             │
│ 2026-04-05  BUY +50 KO @ $62.40                 │
│ Razón: aprovecho overreaction miss EPS Q1...    │
│ Fuente: Propia · Conviction ⭐⭐⭐⭐                │
│ Review 90d: pendiente (julio)                    │
│                                                   │
│ 2026-04-02  SELL -30 PYPL @ $58.10              │
│ Razón: tesis rota, FCF growth negativo Q1...    │
│ Fuente: Propia · Conviction ⭐ → ⭐               │
│ Review 90d: ✓ correcta (PYPL -8% en 90d)        │
│                                                   │
│ ...                                               │
└──────────────────────────────────────────────────┘
```

### D. Quarterly Review (forced UI)
```
┌─ Review Q2 2026 ────────────────────────────────┐
│ Revisión trimestral · 23 posiciones ≥1%          │
│ Progreso: 8/23 ███░░░░░░░ 35%                    │
│                                                   │
│ KO  4.2% · Tesis Dec'25 · Métrica payout ✓      │
│      [✓ Sigue válida] [⚠ Atención] [✗ Rota]    │
│                                                   │
│ MSFT 6.1% · Tesis Mar'26 · ROIC ✓                │
│      [✓ Sigue válida] [⚠ Atención] [✗ Rota]    │
│                                                   │
│ PYPL 0.8% · Tesis Ago'24 · FCF growth -8% ⚠     │
│      [✓ Sigue válida] [⚠ Atención] [✗ Rota]    │
│      Notas (si atención/rota): _________________ │
│                                                   │
│ ...20 más...                                     │
│                                                   │
│ [Guardar progreso]              [Finalizar →]    │
└──────────────────────────────────────────────────┘
```

---

## Implementación por fases

### Fase 1 — Backend mínimo viable (1 día)
1. Migrations D1: 7 tablas (theses, checklist_templates, checklist_runs, journal_entries, journal_reviews, thesis_reviews, annual_reviews)
2. Endpoints theses (GET, POST, history)
3. Seed: checklist templates iniciales (Dividend Compounder, Quality Growth, Deep Value, Special Sit)

### Fase 2 — Tesis UI (1 día)
4. Modal Tesis en Portfolio (CompanyRow badge + click)
5. Componente edición tesis con validación de campos obligatorios
6. Versionado visible

### Fase 3 — Checklist + Journal core (1-2 días)
7. Modal "Nueva compra" con checklist bloqueante
8. Vista Journal con timeline + filtros
9. Auto-create journal entries desde IB Flex sync hook
10. Edición journal entries

### Fase 4 — Reviews (1 día)
11. Vista Quarterly Review (forced UI con progreso)
12. Cron 1 enero genera draft annual review
13. Notificación entradas journal pendientes (semanal)

### Fase 5 — Stats y refinamiento (medio día)
14. Stats agregadas journal (best/worst source, conviction accuracy)
15. Health check checks nuevos
16. Integración con Smart Money alerts (botón "revisar tesis")

**Total estimado**: 5-6 días de trabajo concentrado.

---

## Decisiones tomadas

| Decisión | Opción elegida | Razón |
|----------|----------------|-------|
| Tesis obligatoria | **Sí, ≥1% portfolio** | Sin obligatoriedad nadie las escribe |
| Length cap tesis | **500 chars en campos clave** | Forzar concreción, evitar verborrea |
| Versionado tesis | **Sí, cada edit nueva versión** | Capturar evolución del thinking |
| Checklist bloqueante en compras | **Soft block (warning <85%, override permitido con razón)** | Disciplina sin paternalismo |
| Auto-crear journal desde IB | **Sí** | Reduce fricción a casi cero |
| Reviews 90/180/365 | **Sí, prompt automático** | Único modo de saber empíricamente |
| Quarterly review forzado | **Sí, UI bloqueante hasta completar** | Anti-procrastinación |
| Annual review | **Auto-draft 1 enero, manual completion** | Equilibrio automatización/reflexión |
| Integración Smart Money | **Notificaciones SIN botón comprar/vender, solo "revisar tesis"** | Crítico filosóficamente |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| "Demasiada fricción para comprar" | Override permitido siempre, solo crea registro. No bloquea de verdad. |
| "Demasiado trabajo escribir 89 tesis" | Onboarding guiado: empezar por las 10 posiciones top, ir bajando. Plazo 3 meses para llegar a 100%. |
| "Revisar 23 tesis cada quarter es pesado" | UI optimizada: 3 botones por posición, ~20 segundos cada una. Total <10 min. |
| "Journal entries auto-creadas se acumulan sin completar" | Notificación semanal + indicador en header. Si pasan 30 días, marca como "perdida" (lección: estar más atento). |
| "Las stats del journal no son significativas hasta 2-3 años" | Verdad incómoda. Hasta entonces, son más narrativa que dato. Ser honesto en la UI. |

---

## Por qué este módulo es crítico (síntesis)

1. **Convierte información en proceso**. Tu app actual genera muchísima información (11 agentes, 73 endpoints, alertas, fundamentals). Sin proceso, eso es ruido. Con proceso, es ventaja.

2. **Captura el "por qué"**. La razón #1 por la que los inversores fracasan no es elegir mal, es no saber **por qué** eligieron — y por tanto no saber cuándo cambiar de opinión.

3. **Es la única forma real de aprender**. Los humanos olvidamos errores, racionalizamos aciertos, y construimos narrativas falsas sobre nuestro skill. El journal rompe esto.

4. **Multiplica el valor de los Fondos tab**. Las alertas Smart Money sin proceso son ruido tóxico (FOMO de copiar a Buffett). Con proceso, son input que dispara revisión disciplinada.

5. **Match con tu objetivo declarado**. Dijiste literalmente "lo que realmente quiero es ser un gran inversor". Los grandes inversores no se diferencian por información — todos tienen acceso a datos similares hoy. Se diferencian por **disciplina, paciencia, y proceso**. Esto se construye con herramientas como esta.

---

## Próximos pasos cuando termine la rama paralela

1. Migrations D1 (7 tablas)
2. Seed checklist templates iniciales (4 categorías)
3. Empezar Fase 1 backend
4. **Onboarding especial**: cuando se active el módulo, primer flujo guía al usuario a escribir tesis de las 10 posiciones top (las que más pesan en cartera). Plazo recomendado: 30 días para 100% de posiciones ≥1%.

## Decisiones aún pendientes

1. **¿Tesis privada o exportable?** → exportable a Markdown, util para revisar offline o compartir con otro
2. **¿Importar tesis externas?** → Fase 2: importer desde Notion / Google Docs / Markdown files
3. **¿IA asiste a escribir tesis?** → Tentación grande pero riesgo: si Opus escribe tu tesis, no es tuya. Mejor sugerir estructura y dejar que escribas tú. Cuestión filosófica importante.
4. **¿Score automático de tesis quality?** → Posible: completitud, longitud apropiada, métricas vigiladas, freshness. Pero peligro de gamificación sin sustancia. Pensar más.
