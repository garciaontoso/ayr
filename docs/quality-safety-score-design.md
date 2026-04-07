# Quality Score + Dividend Safety Score 2.0

> Estado: DISEÑO. No implementar hasta merge de rama paralela.
> Generado 2026-04-07.

---

## Propósito

Convertir tu universo de 89 posiciones (+ watchlist) en un **ranking objetivo y consistente** basado en métricas fundamentales. Hoy decides añadir, reducir o entrar por intuición + datos crudos sueltos. Con un score unificado 0-100 calculado igual para todos los tickers, las decisiones de sizing dejan de ser ad-hoc.

**Dos scores complementarios**:
- **Quality Score (0-100)** — qué tan buen negocio es la empresa
- **Dividend Safety Score (0-100)** — qué tan seguro es el dividendo *como flujo*

Un ticker puede tener Quality alto y Safety bajo (REIT apalancado de calidad), o Quality medio y Safety perfecta (utility regulada). Ambos importan, miden cosas distintas.

---

## Filosofía del scoring

### Principios

1. **Métricas objetivas, fórmulas auditables**: nada de "inteligencia oculta". Cada score se descompone en sub-componentes que el usuario puede ver
2. **Time-series, no snapshot**: tendencias > valores puntuales. ROIC subiendo de 12% a 18% es mejor que ROIC plano en 20%
3. **Sector-aware**: comparar utilities vs tech con la misma fórmula es absurdo. Cada componente normaliza por sector
4. **Penalizar incertidumbre**: dato faltante → reduce score (no "asume neutral")
5. **Conservador**: en duda, score más bajo. Mejor oportunidad perdida que riesgo no detectado
6. **Alineado con dividend growth investing**: el peso que doy a cada componente refleja el enfoque del usuario, no es genérico

### Lo que el score NO es

- ❌ NO es predicción de performance precio
- ❌ NO es "comprar / vender"
- ❌ NO sustituye el juicio cualitativo (tesis, moat, management)
- ❌ NO incluye valoración (cara/barata) — eso es otra dimensión
- ✅ ES un punto de partida objetivo para conversaciones honestas con uno mismo
- ✅ ES una baseline auditable que cambia despacio (no día a día)

---

## Quality Score (0-100)

### Componentes y pesos

| Componente | Peso | Sub-métricas |
|------------|------|--------------|
| **Profitability** | 25 pts | ROIC (10) + FCF margin (8) + Gross margin trend (7) |
| **Capital Efficiency** | 20 pts | ROIC vs WACC spread (12) + Asset turnover (8) |
| **Balance Sheet** | 20 pts | Debt/EBITDA (10) + Interest coverage (6) + Net debt trend (4) |
| **Growth** | 15 pts | Revenue CAGR 5y (8) + FCF CAGR 5y (7) |
| **Capital Allocation** | 10 pts | Buyback yield (4) + Dividend track record (4) + M&A discipline (2) |
| **Predictability** | 10 pts | Earnings beat consistency (5) + Revenue surprise std dev (5) |
| **TOTAL** | **100** | |

### Detalle de cada componente

#### 1. Profitability (25 pts)

**ROIC (10 pts)** — Return on Invested Capital
```
roic = NOPAT / Invested Capital
     = EBIT × (1 - tax_rate) / (Total Equity + Total Debt - Cash)

Score:
  ≥ 25%   → 10 pts (excelente)
  20-25%  → 9 pts
  15-20%  → 7 pts
  12-15%  → 5 pts
  10-12%  → 3 pts
  8-10%   → 1 pts
  < 8%    → 0 pts

Bonus: si ROIC ha subido 5y CAGR ≥ 1pp/año → +1 pt extra
Penalty: si ROIC ha bajado 5y CAGR ≥ -1pp/año → -2 pts
```

**FCF Margin (8 pts)** — Free Cash Flow / Revenue
```
fcf_margin = (Operating CF - Capex) / Revenue

Score (sector-adjusted):
  Tech/Software:        ≥30% perfect, ≤10% bad
  Consumer Staples:     ≥15% perfect, ≤5% bad
  Industrials:          ≥10% perfect, ≤3% bad
  Utilities:            ≥8% perfect, ≤2% bad
  REITs:                use AFFO/Revenue instead

Tendencia: bonus +1 si margin trend +5y positivo, -1 si negativo
```

**Gross Margin Trend (7 pts)** — pricing power proxy
```
gross_margin_5y_trend = slope of last 5 years gross margins

Score:
  +200bps+ improvement   → 7 pts (pricing power dominante)
  +100-200bps            → 6 pts
  0-100bps               → 5 pts (neutro)
  -100-0bps              → 3 pts (presión competitiva)
  -200-100bps            → 1 pt (deteriorating moat)
  worse than -200bps     → 0 pts
```

#### 2. Capital Efficiency (20 pts)

**ROIC vs WACC Spread (12 pts)** — value creation
```
spread = ROIC - WACC

Score:
  ≥ 15pp        → 12 pts (machine de valor)
  10-15pp       → 10 pts
  5-10pp        → 7 pts
  2-5pp         → 4 pts
  0-2pp         → 1 pt
  < 0           → 0 pts (DESTRUYE valor)

Note: WACC se calcula con CAPM simplificado: rf + beta × ERP
Si no hay datos suficientes para WACC → fallback a 8% asunción
```

**Asset Turnover (8 pts)**
```
asset_turnover = Revenue / Total Assets

Score sector-adjusted:
  Para retailers:   ≥2.0 perfect
  Para industriales: ≥1.0 perfect
  Para utilities:   ≥0.3 perfect
  Para tech:        ≥0.6 perfect
```

#### 3. Balance Sheet (20 pts)

**Debt/EBITDA (10 pts)**
```
ratio = Total Debt / EBITDA TTM

Score (sector adjusted):
  Defensive (utilities, staples): hasta 4x = OK
  Cyclical (industrials, materials): hasta 2.5x = OK
  Tech/quality: hasta 2x = óptimo

  ≤ 1x      → 10 pts
  1-2x      → 8 pts
  2-3x      → 6 pts
  3-4x      → 3 pts
  4-5x      → 1 pt
  > 5x      → 0 pts
```

**Interest Coverage (6 pts)** — EBIT/Interest Expense
```
  ≥ 15x     → 6 pts
  10-15x    → 5 pts
  5-10x     → 4 pts
  3-5x      → 2 pts
  < 3x      → 0 pts (situación de fragilidad)
```

**Net Debt Trend 5y (4 pts)** — direction matters
```
delta = (Net Debt now - Net Debt 5y ago) / EBITDA now

Score:
  Decreasing (improving):  4 pts
  Flat (±10%):              2 pts
  Increasing < 50%:         1 pt
  Increasing > 50%:         0 pts
```

#### 4. Growth (15 pts)

**Revenue CAGR 5y (8 pts)**
```
Score (sector-adjusted con curve):
  Tech ≥15%, Staples ≥5%, Utilities ≥3%
  Mapeo lineal a 0-8 pts dentro de banda esperada
  Sub-mínimo → 0 pts
  Top 10% sector → 8 pts
```

**FCF CAGR 5y (7 pts)** — el growth que paga el dividendo
```
Mismo enfoque pero más estricto:
  ≥ Revenue CAGR + 200bps   → 7 pts (operating leverage)
  ≈ Revenue CAGR            → 5 pts (parejo)
  < Revenue CAGR - 200bps   → 2 pts (deterioro)
  Negativo                  → 0 pts
```

#### 5. Capital Allocation (10 pts)

**Buyback Yield (4 pts)**
```
buyback_yield = (shares_outstanding_5y_ago - shares_now) / shares_now / 5

Score:
  ≥ 3%/año        → 4 pts (recomprando agresivo)
  1-3%/año        → 3 pts
  0-1%/año        → 2 pts
  Diluyendo 0-2%  → 1 pt
  Diluyendo > 2%  → 0 pts
```

**Dividend Track Record (4 pts)**
```
years_without_cut = años consecutivos sin recortar dividendo

  ≥ 25 (Aristocrat)   → 4 pts
  10-25               → 3 pts
  5-10                → 2 pts
  1-5                 → 1 pt
  Recortó alguna vez en últimos 5y → 0 pts
```

**M&A Discipline (2 pts)** — proxy: ROIC trend tras adquisiciones grandes
```
  Adquisiciones grandes (>10% market cap) últimos 5y: 0 → 2 pts (orgánico)
  1-2 adquisiciones, ROIC mantenido → 1 pt
  ≥3 adquisiciones grandes O ROIC bajó >3pp post-deal → 0 pts
```

#### 6. Predictability (10 pts)

**Earnings Beat Consistency (5 pts)**
```
beat_rate_8q = quarters_beat / 8

  ≥ 87.5% (7/8)   → 5 pts
  75% (6/8)       → 4 pts
  62.5% (5/8)     → 3 pts
  50% (4/8)       → 2 pts
  < 50%           → 1 pt
```

**Revenue Surprise Std Dev (5 pts)**
```
std_dev = standard deviation revenue surprises last 8 quarters

  < 1%       → 5 pts (muy predecible)
  1-2%       → 4 pts
  2-4%       → 3 pts
  4-6%       → 2 pts
  > 6%       → 0 pts (muy volátil)
```

### Quality Score final

```
quality_score = sum(componentes) / 100  # ya está en escala 0-100

Tiers:
  90-100: ⭐⭐⭐⭐⭐ Wide moat compounder
  80-89:  ⭐⭐⭐⭐ Quality alta
  70-79:  ⭐⭐⭐⭐ Quality buena
  60-69:  ⭐⭐⭐ Quality media-alta
  50-59:  ⭐⭐⭐ Quality media
  40-49:  ⭐⭐ Quality media-baja
  30-39:  ⭐⭐ Quality baja
  < 30:   ⭐ Avoid o special situation only
```

### Penalty data missing

Por cada componente sin datos suficientes para calcular: -5 pts del total. Esto fuerza honestidad — empresas con disclosure pobre pierden score automáticamente.

---

## Dividend Safety Score 2.0 (0-100)

### Componentes y pesos

| Componente | Peso | Por qué importa |
|------------|------|-----------------|
| **Coverage Ratios** | 30 pts | ¿El cash que entra cubre el dividendo? |
| **Balance Sheet Stress** | 25 pts | ¿Hay margen si entra recesión? |
| **Track Record** | 20 pts | ¿Han recortado antes? ¿Sobrevivieron crises? |
| **Forward Visibility** | 15 pts | ¿FCF futuro estimado es estable? |
| **Sector Risk Adjustment** | 10 pts | Penaliza sectores con histórico de cuts |
| **TOTAL** | **100** | |

### Detalle

#### 1. Coverage Ratios (30 pts)

**FCF / Dividend (15 pts)** — la métrica más importante
```
ratio = FCF TTM / Total Dividends Paid TTM

  ≥ 3.0x    → 15 pts (mucho colchón)
  2.0-3.0x  → 12 pts
  1.5-2.0x  → 9 pts
  1.2-1.5x  → 5 pts
  1.0-1.2x  → 2 pts (frágil)
  < 1.0x    → 0 pts (insostenible)
```

**EPS / Dividend (5 pts)** — payout tradicional
```
payout = Dividend / EPS

  ≤ 30%     → 5 pts
  30-50%    → 4 pts
  50-65%    → 3 pts
  65-75%    → 2 pts
  75-90%    → 1 pt
  > 90%     → 0 pts
```

**FCF after Capex maintenance / Dividend (10 pts)** — la métrica honesta
```
maint_capex = depreciation TTM (proxy)
fcf_after_maint = OCF - maint_capex
ratio = fcf_after_maint / Dividend

  ≥ 2.5x    → 10 pts
  1.8-2.5x  → 8 pts
  1.3-1.8x  → 5 pts
  1.0-1.3x  → 2 pts
  < 1.0x    → 0 pts
```

#### 2. Balance Sheet Stress (25 pts)

**Net Debt / EBITDA (10 pts)** — mismo cálculo que Quality pero penalizado más para dividend safety
```
  ≤ 1x      → 10 pts
  1-2x      → 8 pts
  2-3x      → 5 pts
  3-4x      → 2 pts
  > 4x      → 0 pts
```

**Interest Coverage (8 pts)**
```
  ≥ 15x     → 8 pts
  10-15x    → 6 pts
  5-10x     → 4 pts
  3-5x      → 2 pts
  < 3x      → 0 pts
```

**Liquidity Cushion (7 pts)** — Cash + ST Investments / (Current Liabilities + ST Debt)
```
  ≥ 1.5x    → 7 pts
  1.0-1.5x  → 5 pts
  0.7-1.0x  → 3 pts
  0.5-0.7x  → 1 pt
  < 0.5x    → 0 pts
```

#### 3. Track Record (20 pts)

**Years Without Cut (10 pts)**
```
  ≥ 50 (Dividend King)        → 10 pts
  25-50 (Aristocrat)          → 9 pts
  20-25                       → 8 pts
  15-20                       → 7 pts
  10-15                       → 5 pts
  5-10                        → 3 pts
  1-5                         → 1 pt
  Recortó hace < 5y           → 0 pts
```

**DGR Consistency 10y (5 pts)** — has the growth rate been stable?
```
std_dev_dgr = std dev of yearly dividend growth rates last 10y

  < 2pp    → 5 pts (super estable)
  2-4pp    → 4 pts
  4-6pp    → 3 pts
  6-10pp   → 2 pts
  > 10pp   → 0 pts (errático)
```

**Recession Survival (5 pts)** — did dividend hold through 2008/2020?
```
  Held through 2008 + 2020 + 2022 → 5 pts
  Held 2 of 3                       → 3 pts
  Held 1 of 3                       → 1 pt
  Cut in any major recession        → 0 pts
  Empresa post-2020 → not enough history, max 2 pts (penalty incertidumbre)
```

#### 4. Forward Visibility (15 pts)

**Estimated FCF Growth (8 pts)** — analyst consensus next 2y
```
  ≥ 8% CAGR    → 8 pts
  4-8% CAGR    → 6 pts
  0-4% CAGR    → 4 pts
  Flat         → 2 pts
  Decreciendo  → 0 pts
```

**Upcoming Capex Cycle (4 pts)** — penalty if heavy capex period
```
  Maintenance only      → 4 pts
  Modest growth capex   → 3 pts
  Heavy growth capex    → 1 pt (FCF presionado)
  Mega-project ongoing  → 0 pts
```

**Analyst Estimate Stability (3 pts)** — std dev of next year EPS estimates
```
  Tight consensus (< 5% range)  → 3 pts
  Normal (5-10%)                → 2 pts
  Wide (10-20%)                 → 1 pt
  Very wide (>20%)              → 0 pts (negocio impredecible)
```

#### 5. Sector Risk Adjustment (10 pts)

```
Defensive sectors (Consumer Staples, Utilities, Healthcare, REITs quality):  10 pts base
Moderate (Tech, Consumer Disc, Communications):                                7 pts base
Cyclical (Industrials, Materials, Energy):                                     4 pts base
High-risk (Mining, Airlines, autos, banks):                                    1 pt base

Adjustments:
- Sub-sector con histórico recortes (E&P oil): -2 pts
- Sub-sector con histórico estable (regulated utilities): +1 pt
```

### Dividend Safety Score final

```
safety_score = sum(componentes)

Tiers:
  90-100: 🟢 Very Safe (utility-like)
  80-89:  🟢 Safe
  70-79:  🟡 Generally Safe
  60-69:  🟡 Acceptable
  50-59:  🟠 Watch (medium risk)
  40-49:  🟠 Risk Elevated
  30-39:  🔴 Unsafe (cut likely if recession)
  < 30:   🔴 Cut Imminent / Already cut
```

---

## Sistema de tracking temporal

Calcular ambos scores **mensualmente** y guardar histórico. Esto permite:

1. **Trend detection**: KO Quality 88 → 84 → 81 en 6 meses = alerta degradación
2. **Validation post-decision**: subiste KO de 4% a 5% en marzo, ¿el score lo justificó?
3. **Sector benchmarking**: tu cartera media vs SCHD media
4. **Pre-earnings signal**: si Quality score cae 5+ pts en quarter previo a earnings → red flag

### Alertas automáticas

| Trigger | Alerta |
|---------|--------|
| Quality drops ≥ 5 pts en 3 meses | 🟡 Quality degradation |
| Quality drops ≥ 10 pts en 6 meses | 🔴 Quality severe degradation |
| Safety drops below 70 | 🟡 Safety concern |
| Safety drops below 50 | 🔴 Safety critical |
| Coverage ratio (FCF/Div) drops below 1.5x | 🔴 Coverage critical |
| Years without cut interrupted | 🔴 Streak broken |

Todas consolidadas con cooldown global de Smart Money/Cartas/Earnings.

---

## Schema D1

```sql
-- Snapshots mensuales de ambos scores
CREATE TABLE quality_safety_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,         -- YYYY-MM-01

  -- Quality Score
  quality_score REAL NOT NULL,
  quality_profitability REAL,
  quality_efficiency REAL,
  quality_balance_sheet REAL,
  quality_growth REAL,
  quality_allocation REAL,
  quality_predictability REAL,
  quality_data_completeness REAL,      -- % de componentes con datos suficientes

  -- Dividend Safety Score
  safety_score REAL NOT NULL,
  safety_coverage REAL,
  safety_balance_sheet REAL,
  safety_track_record REAL,
  safety_forward REAL,
  safety_sector_adj REAL,

  -- Snapshot de inputs (para auditoría y reproducibilidad)
  inputs_json TEXT,                    -- JSON con todos los valores numéricos usados

  computed_at TEXT NOT NULL,
  UNIQUE(ticker, snapshot_date)
);
CREATE INDEX idx_qss_ticker_date ON quality_safety_scores(ticker, snapshot_date);

-- Componentes detallados (para drill-down UI)
CREATE TABLE score_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score_snapshot_id INTEGER NOT NULL,
  category TEXT NOT NULL,              -- 'quality_profitability' | 'safety_coverage' | etc
  component_name TEXT NOT NULL,        -- 'roic' | 'fcf_margin' | etc
  raw_value REAL,                      -- valor numérico bruto
  scored_value REAL,                   -- pts asignados
  max_pts REAL,                        -- max posibles
  notes TEXT,                          -- "Bonus por trend +1pt" etc
  FOREIGN KEY (score_snapshot_id) REFERENCES quality_safety_scores(id)
);
CREATE INDEX idx_sc_snapshot ON score_components(score_snapshot_id);

-- Sector benchmarks (para comparación)
CREATE TABLE sector_benchmarks (
  sector TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  median_quality REAL,
  median_safety REAL,
  p25_quality REAL,
  p75_quality REAL,
  p25_safety REAL,
  p75_safety REAL,
  ticker_count INTEGER,
  PRIMARY KEY (sector, snapshot_date)
);

-- Alertas generadas
CREATE TABLE score_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  alert_type TEXT NOT NULL,            -- 'quality_drop_5' | 'safety_critical' | etc
  severity TEXT NOT NULL,              -- 'warning' | 'critical'
  message TEXT,
  prev_score REAL,
  new_score REAL,
  detected_at TEXT NOT NULL,
  notified BOOLEAN DEFAULT 0
);
```

---

## Endpoints worker.js

```js
// Scores
GET  /api/scores/{ticker}                       // current scores + breakdown
GET  /api/scores/{ticker}/history?period=24m    // time series
GET  /api/scores/{ticker}/components            // detailed drill-down

// Portfolio overview
GET  /api/scores/portfolio                      // todos tus tickers ranked
GET  /api/scores/watchlist                      // todos los watchlist ranked
GET  /api/scores/portfolio/aggregate            // Quality medio cartera, etc

// Sector
GET  /api/scores/sectors                        // benchmarks por sector
GET  /api/scores/sector/{sector}/leaders        // top 10 quality del sector

// Comparisons
GET  /api/scores/compare?tickers=KO,PEP,MNST    // side by side
GET  /api/scores/vs-etf?etf=SCHD                // cartera vs SCHD avg

// Alerts
GET  /api/scores/alerts?status=unread
POST /api/scores/alerts/{id}/dismiss

// Refresh
POST /api/scores/refresh                        // todos
POST /api/scores/refresh/{ticker}               // single
```

---

## Agente "Score Computer"

**Modelo**: No-LLM (puro cálculo numérico)
**Frecuencia**: Mensual día 5 (después de filings 10-K/Q rolling) + on-demand

```
Pipeline:
1. Para cada ticker en (positions ∪ watchlist):
   a. Pull fundamentals FMP (ratios, financial statements, key metrics)
   b. Pull histórico 5y para tendencias
   c. Pull dividend history completa
   d. Pull analyst estimates forward
   e. Pull earnings predictability (de earnings_predictability si existe)

2. Calcular Quality Score (6 componentes):
   - Profitability subscore
   - Capital Efficiency subscore
   - Balance Sheet subscore
   - Growth subscore
   - Capital Allocation subscore
   - Predictability subscore (cross-reference earnings_predictability)
   - Apply data completeness penalty
   - Final Quality 0-100

3. Calcular Dividend Safety (5 componentes):
   - Coverage ratios
   - Balance sheet stress
   - Track record
   - Forward visibility
   - Sector adjustment
   - Final Safety 0-100

4. Insert quality_safety_scores + score_components

5. Compare vs previous month:
   - Δ quality > 5pts → score_alert
   - Δ safety > 5pts → score_alert
   - Trigger threshold alerts (coverage < 1.5, etc)

6. Update sector_benchmarks aggregates

7. Push notification SOLO si:
   - Critical alert (severity='critical') AND ticker en cartera
   - Cooldown global respetado
```

### Coste

**Cero LLM** — todo es cálculo. Solo coste FMP queries:
- 89 tickers × 1 vez/mes × ~10 endpoints = ~900 queries/mes
- Plan FMP Global lo cubre sin notar

---

## Integración con resto del sistema

### 1. Portfolio (CompanyRow)
- Columna nueva: **Quality** (badge color + número 0-100)
- Columna nueva: **Safety** (badge color + número 0-100)
- Tooltip al hover: top 3 fortalezas + top 3 debilidades del score
- Click → modal drill-down con todos los componentes

### 2. Header Portfolio
- Stat agregada: "Quality cartera media: 78 · Safety media: 84"
- Comparativa vs SCHD/VIG/NOBL

### 3. Watchlist
- Sort por Quality / Safety
- Filter "Quality ≥ 75 AND Safety ≥ 80" para descubrimiento
- "Top 10 Quality del sector X que NO tengo"

### 4. Módulo Proceso (Tesis)
- En el modal de tesis, panel lateral con score actual + histórico
- Si Quality cae bajo 60 mientras tienes la posición → trigger thesis review automático
- Métricas vigiladas se sincronizan con componentes del score (DRY)

### 5. Earnings Intelligence
- Pre-earnings briefing incluye "Score actual: Quality 87 ↑ desde 84 hace 3 meses"
- Post-earnings deep dive recalcula scores con nuevos datos y muestra delta inmediato
- Si earnings deteriora score >5pts → trigger score_alert

### 6. Smart Money / Cartas
- Cuando Buffett compra X → mostrar Quality/Safety de X automáticamente
- "Buffett compró XYZ — Quality 91, Safety 88. Tiene sentido" o "Quality 52, Safety 41. Tesis no obvia"

### 7. Alerta nueva: "Score divergence"
- Si tu posición top (≥4% weight) tiene Quality < 65 → considerar reducir
- Si una watchlist tiene Quality > 85 + Safety > 85 sostenido 6 meses → considerar entrar

### 8. Annual Review
- Sección "Quality drift" — qué posiciones mejoraron, cuáles empeoraron
- Sección "¿Tu cartera está más quality que el año pasado?"

---

## Wireframes — vistas nuevas

### A. CompanyRow extended (Portfolio)
```
┌────────────────────────────────────────────────────────┐
│ KO  Coca-Cola  $62.40 +0.4%  Q:87 ⭐⭐⭐⭐  S:91 🟢   │
│     530 shares  4.2% weight  +7.2% PnL  Yield 3.1%    │
│     [📊 next earnings 26 abr] [📚 4 menciones cartas] │
└────────────────────────────────────────────────────────┘
```

### B. Score drill-down modal
```
┌─ KO — Quality Score Breakdown ──────────────────────┐
│                                                       │
│ QUALITY: 87 / 100 ⭐⭐⭐⭐                              │
│ Trend: 84 (3m ago) → 86 (1m ago) → 87 (now) ↑       │
│                                                       │
│ ▓▓▓▓▓▓▓▓▓▓ Profitability    23/25                   │
│   ROIC 17.3%             →  9/10                    │
│   FCF margin 23%         →  8/8                     │
│   Gross margin trend +120bps → 6/7                   │
│                                                       │
│ ▓▓▓▓▓▓▓▓▓░ Capital Efficiency 18/20                 │
│   ROIC vs WACC +9pp     → 10/12                     │
│   Asset turnover 0.85   →  8/8                      │
│                                                       │
│ ▓▓▓▓▓▓▓▓▓▓ Balance Sheet    19/20                   │
│   Debt/EBITDA 2.1       →  8/10                     │
│   Interest cov 18x      →  6/6                      │
│   Net debt trend ↓       →  4/4                      │
│                                                       │
│ ▓▓▓▓▓▓▓░░░ Growth          11/15                    │
│   Revenue CAGR 5y 4.2%  →  6/8                      │
│   FCF CAGR 5y 5.8%      →  5/7                      │
│                                                       │
│ ▓▓▓▓▓▓▓▓▓░ Capital Alloc    8/10                    │
│   Buyback yield 1.2%    →  3/4                      │
│   Dividend track 62y    →  4/4                      │
│   M&A discipline        →  1/2                      │
│                                                       │
│ ▓▓▓▓▓▓▓▓░░ Predictability   8/10                    │
│   Beat rate 87.5%       →  5/5                      │
│   Surprise std 2.4%     →  3/5                      │
│                                                       │
│ Data completeness: 100% (no penalty)                │
│                                                       │
│ [Ver Safety] [Ver historial] [Compare to peers]      │
└──────────────────────────────────────────────────────┘
```

### C. Portfolio scores ranked
```
┌─ Tu cartera ranked por Quality ─────────────────────┐
│ Filtros: [All] [Q≥80] [S≥80] [Q+S top]              │
│                                                       │
│  #  Ticker  Q    S    Weight  P&L     Trend         │
│  1  V       94 ⭐ 92 🟢 3.8%   +12.4%  Q→ S→        │
│  2  MA      93 ⭐ 91 🟢 3.4%   +18.2%  Q↑ S→        │
│  3  MSFT    92 ⭐ 89 🟢 6.1%   +24.1%  Q→ S↑        │
│  4  ZTS     91 ⭐ 88 🟢 1.8%   +5.2%   Q↑ S→        │
│  5  KO      87 ⭐ 91 🟢 4.2%   +7.2%   Q↑ S→        │
│  ...                                                  │
│ 86  PYPL    52    45 🟠 0.4%   -32.1%  Q↓ S↓ ⚠     │
│ 87  KHC     48    51 🟠 1.1%   -8.3%   Q↓ S→ ⚠     │
│ 88  PARA    41    32 🔴 0.3%   -45.2%  Q↓ S↓ 🔴    │
│ 89  HKG:1052 N/A  N/A  0.5%    -      Data missing  │
│                                                       │
│ Cartera media: Q=76 ⭐⭐⭐⭐ · S=82 🟢                  │
│ vs SCHD: Q=78 (+2) · S=85 (+3)                      │
└──────────────────────────────────────────────────────┘
```

### D. Sector explorer
```
┌─ Sector Explorer — Healthcare ──────────────────────┐
│ Top Quality del sector que NO tienes:                │
│                                                       │
│  Ticker  Q    S    Yield  P/E   In your watchlist?  │
│  ABT     93 ⭐ 89 🟢 1.9%  24.3  ✓                  │
│  JNJ     91 ⭐ 92 🟢 3.0%  15.2  ✓                  │
│  LLY     89 ⭐ 78 🟡 0.7%  78.4  -                  │
│  MRK     87 ⭐ 86 🟢 2.7%  18.5  -                  │
│                                                       │
│ Tu exposición sector: 8.4% (UNH, ZTS, NVO)           │
│ Quality media tus posiciones: 88                      │
│ Sector median: 76                                     │
│ Tu cartera está OVER quality vs sector ✓              │
└──────────────────────────────────────────────────────┘
```

---

## Implementación por fases

### Fase 1 — Scoring engine (1-2 días)
1. Migrations D1: 4 tablas
2. Implementar fórmulas Quality 6 componentes (puro JS, sin LLM)
3. Implementar fórmulas Safety 5 componentes
4. Cargar tabla sector_benchmarks (lista hardcoded sector → ranges)
5. Test con 10 tickers conocidos manualmente

### Fase 2 — Pipeline FMP + storage (1 día)
6. Endpoint refresh single + all
7. Pull todos los datos FMP necesarios per ticker
8. Insert snapshots + componentes
9. Cron mensual día 5

### Fase 3 — Alertas (medio día)
10. Diff vs snapshot anterior
11. Trigger logic
12. Insert score_alerts
13. Push consolidado con cooldown global

### Fase 4 — Frontend (2-3 días)
14. Columnas Q/S en CompanyRow del Portfolio
15. Drill-down modal con breakdown completo
16. Vista ranked portfolio
17. Vista sector explorer
18. Comparativas (compare tickers, vs ETF)
19. Histórico time-series chart

### Fase 5 — Integraciones (1 día)
20. Trigger thesis review si Q drop >10pts
21. Pre-earnings briefing extension con scores
22. Post-earnings recalculate inmediato
23. Smart Money/Cartas: mostrar Q/S de tickers mencionados
24. Annual review extension

**Total estimado**: 5-6 días concentrados.

---

## Decisiones tomadas

| Decisión | Opción elegida | Razón |
|----------|----------------|-------|
| Escala scores | **0-100 ambos** | Fácil mental model, comparable |
| Métricas | **Objetivas, fórmulas auditables** | Confianza, debugging, transparencia |
| Time-series | **Mensual snapshot, 24m retenidos** | Trend > snapshot, sin inflar BD |
| Sector adjustment | **Sí, normalizado** | Quality utility ≠ Quality tech |
| Penalty data missing | **Sí, -5 pts/componente** | Fuerza honestidad sobre disclosure |
| Modelo computación | **No-LLM puro JS** | Determinista, reproducible, gratis |
| Pesos componentes | **Aligned con dividend growth focus** | NO genérico, refleja tu estilo |
| Forward-looking | **Sí, en Safety con analyst estimates** | Sin esto Safety solo mira pasado |
| Coverage métrica clave | **FCF/Div, no EPS/Div** | FCF es realidad, EPS contabilidad |
| Maintenance capex proxy | **Depreciation** | Imperfecto pero único disponible |
| Quality + Safety separados | **Sí, no combinados** | Miden cosas distintas |
| Alertas | **Mensual con triggers explícitos** | Cambios reales, no ruido diario |

---

## Riesgos y limitaciones

| Riesgo | Mitigación |
|--------|------------|
| **Garbage in, garbage out** — datos FMP malos | Usar múltiples puntos verificación, flag si incoherente |
| **Empresas con disclosure pobre** | Penalty data completeness explícito |
| **Sector benchmarks demasiado generales** | Sub-sector adjustments donde importa |
| **Empresas internacionales** (BME, HKG) | Cobertura FMP desigual — degradar a "score parcial" |
| **REITs y financials con métricas atípicas** | Fórmulas alternativas (AFFO, NIM) — Fase 6 si necesario |
| **Falsa precisión** "87 vs 86 = mejor" | UI muestra tier ⭐ junto al número, no solo el número |
| **Score bajo ≠ vender** | Texto explícito en UI, vinculación con tesis no automática |
| **Maintenance capex proxy impreciso** | Se puede mejorar manualmente per ticker en futura iteración |
| **Cambios contables grandes (one-offs)** | TTM smoothing + comparación trends 5y mitigan |
| **Empresas en transformación** | Trend ↓ es señal incluso si valor absoluto sigue alto |

---

## Próximos pasos cuando termine la rama paralela

1. Migration D1 (4 tablas)
2. Hardcodear sector_benchmarks inicial (después se refinará con datos reales)
3. Empezar Fase 1: implementar fórmulas y testear contra 10 tickers conocidos manualmente (KO, MSFT, KHC, PYPL, ZTS, etc) — validar que los scores resultantes "tienen sentido"
4. Iterar pesos si los resultados no se alinean con intuición
5. Lanzar mensual cron y observar 3 meses antes de exponer en UI principal

## Decisiones aún pendientes

1. **¿Permitir pesos personalizables por usuario?** → tentación grande pero peligro: gameas tu propio score. Mejor pesos fijos pre-decididos
2. **¿Score combinado Q+S?** → media ponderada 60/40? Puede ser útil como "ranking único" en watchlist. Decidir tras Fase 1
3. **¿Backtest histórico de scores?** → calcular scores históricos 2020-2025 para validar (¿predijeron las cuts de KHC, PYPL, T?). Trabajo extra pero gran validación
4. **¿Fórmulas alternativas para REITs/financials?** → Fase 6 si tienes muchas posiciones de estos sectores
5. **¿Mostrar peer comparison directa en CompanyRow?** → "KO Q87 vs PEP Q86" — útil pero puede saturar UI
