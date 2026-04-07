# Pestaña "Fondos" — Diseño detallado

> Estado: DISEÑO v2. No implementar hasta merge de rama paralela.
> Generado 2026-04-07. Actualizado 2026-04-07 con sistema de notificaciones y fondos España.

---

## Objetivo

Pestaña nueva en el frontend que muestre:
1. Qué tienen los grandes inversores (superinvestors) — US + España
2. Quién tiene tus posiciones
3. Overlap con ETFs grandes
4. Benchmark vs ETFs de dividendos
5. **Notificaciones inteligentes** cuando un fondo seguido cambia posición material en tickers que te importan

**Killer feature**: cuando un superinvestor entra/sale de un ticker tuyo → push notification, **pero solo si es relevante** (sistema de filtros multi-capa).

---

## Filosofía de diseño: SEÑAL > RUIDO

Principios fundamentales:
- **Calidad sobre cantidad**: 18 fondos cuidadosamente elegidos, no 50
- **Push solo lo accionable**: máximo 2 push/semana
- **Tiers binarios**: o afecta a tu cartera o no notifica
- **Thresholds agresivos**: solo movimientos materiales (≥3% peso)
- **Iterar empíricamente**: si un fondo no aporta señal en 2 trimestres, se baja conviction o se desactiva

Estimación realista del sistema completo: **6-12 notificaciones útiles al mes**. Cada una corresponde a una decisión potencial real sobre tu cartera.

---

## Lista final de fondos seguidos — 18

### US 13F Hedge Funds / Asset Managers (12)

| # | Nombre | Gestor | CIK | Estilo | Por qué |
|---|--------|--------|-----|--------|---------|
| 1 | Berkshire Hathaway | Buffett | 0001067983 | Quality value mega | El maestro, referencia absoluta |
| 2 | Pabrai Investment Funds | Mohnish Pabrai | 0001549575 | Concentrated value | Discípulo Buffett, conc. extrema |
| 3 | Akre Capital Management | Akre/Saler/Yacktman | 0001112520 | Quality compounders | Three-legged stool, MA/V kings |
| 4 | Polen Capital | Polen team | 0001034524 | Quality growth | Compounders premium |
| 5 | Markel Group | Tom Gayner | 0001096343 | Buffett-style insurer | Compounders LP, alineamiento perfecto |
| 6 | Yacktman Asset Management | Stephen Yacktman | 0000905567 | Quality + dividends | Sesgo dividend payers (PG, PEP) |
| 7 | Wedgewood Partners | David Rolfe | 0001585391 | Concentrated quality | 20 stocks max, alta convicción |
| 8 | Ruane Cunniff (Sequoia) | Sequoia team | 0000350894 | Long-term quality | Histórico legendario |
| 9 | Gardner Russo & Quinn ⭐ | Tom Russo | 0001067921 | Dividend consumer brands LP | EL especialista en marcas dividend, gira <10%/año |
| 10 | Baupost Group | Seth Klarman | 0001061768 | Deep value + cash discipline | Heredero Graham, Margin of Safety |
| 11 | Pershing Square Capital | Bill Ackman | 0001336528 | Concentrated activist | 8-12 nombres, máxima señal/movimiento |
| 12 | Appaloosa Management | David Tepper | 0001656456 | Macro + value | Best risk-adjusted track record |

### Quality Compounder Internacional (1)

| # | Nombre | Gestor | CIK | Estilo | Por qué |
|---|--------|--------|-----|--------|---------|
| 13 | Giverny Capital ⭐ | François Rochon | 0001595888 | Quality compounding Canada/global | 25+ años track record, cartas anuales legendarias |

### Mutual Funds Dividend US (2)

| # | Ticker | Nombre | Gestor | Por qué |
|---|--------|--------|--------|---------|
| 14 | VDIGX | Vanguard Dividend Growth | Donald Kilbride | $50B+ AUM, dividend growth puro institucional |
| 15 | PRDGX | T. Rowe Price Dividend Growth | Tom Huber | Otro clásico institucional dividend growth |

### Value España vía CNMV (3)

| # | Fondo | Gestora | Gestor | Estilo |
|---|-------|---------|--------|--------|
| 16 | Cobas Internacional FI | Cobas AM | Francisco García Paramés | Deep value contrarian |
| 17 | Magallanes European Equity FI | Magallanes Value Investors | Iván Martín | Quality value europeo |
| 18 | azValor Internacional FI | azValor AM | Álvaro Guzmán + Fernando Bernad | Value + commodities/recursos |

### Distribución
- 67% US 13F (12 fondos)
- 17% España vía CNMV (3 fondos)
- 11% Mutual funds dividend US (2 fondos)
- 6% Canadá quality compounder (1 fondo)

### Por qué NO se incluyen otros nombres famosos

| Rechazado | Razón |
|-----------|-------|
| Burry / Scion | Cartera mínima, gira 100%+/año, opciones invisibles en 13F. Ruido > señal |
| Einhorn / Greenlight | Performance mediocre 10y, long/short solo ves un lado |
| Loeb / Third Point | Event-driven a corto plazo, no alineado dividend LP |
| Tiger Global / Lone Pine / Viking | Tech growth puro, anti-dividend |
| Bridgewater / Dalio | 13F son SPY/EEM/GLD hedges macro, no acciones |
| Cathie Wood / ARK | Disruption tech, anti-quality |
| Carl Icahn | Activista cíclico, ruido por disputas legales |

### Casos límite (Fase 3 si funciona la Fase 1)

| Candidato | Por qué esperar |
|-----------|-----------------|
| Marks / Oaktree | Memos = oro, pero 13F mayormente credit/distressed |
| Bill Nygren / Oakmark | Solapa con Yacktman + Polen |
| First Eagle Global | Solapa estilo Tweedy Browne |
| Mason Hawkins / Longleaf | Performance reciente discreta |
| **Terry Smith / Fundsmith** | UK, no fila 13F. Requiere parser dedicado para Owner's Manual + factsheets mensuales |
| Horos AM (Javier Ruiz) | Solapa con Cobas en deep value España |
| Bestinver | Post-Paramés equipo nuevo, track record más corto |
| Tweedy Browne | Graham clásico bueno pero solapamiento Klarman |

---

## Endpoints FMP a usar (US)

### 13F Institutional Holdings
```
GET /v3/institutional-holder/{ticker}
GET /v3/form-thirteen/{cik}?date=YYYY-MM-DD
GET /v3/cik-search/{name}
GET /v4/institutional-ownership/symbol-ownership?symbol={ticker}&includeCurrentQuarter=true
GET /v4/institutional-ownership/portfolio-holdings-summary?cik={cik}
```

### Mutual Funds (VDIGX, PRDGX)
```
GET /v3/mutual-fund-holder/{ticker}
```

### ETF Holdings (Sub-tab 5)
```
GET /v3/etf-holder/{ticker}
GET /v3/etf-sector-weightings/{ticker}
GET /v3/etf-country-weightings/{ticker}
GET /v3/etf-info/{ticker}
```

### Politicians Trading (Sub-tab 7) — FASE 2
```
GET /v4/senate-trading?symbol={ticker}
GET /v4/senate-trading-rss-feed?page=0
GET /v4/senate-disclosure?symbol={ticker}
GET /v4/senate-disclosure-rss-feed?page=0

GET /v4/senate-trades?name={lastname}
GET /v4/house-trades?name={lastname}

GET /v3/senate-trading/{ticker}            # alternativa
```

Datos por trade disponibles:
- Senador/representante (nombre, partido R/D/I, estado, chamber)
- Ticker / asset description
- Tipo (Purchase / Sale / Exchange)
- Rango de cantidad ($1k-$15k, $15k-$50k, $50k-$100k, $100k-$250k, $250k-$500k, $500k-$1M, $1M-$5M, $5M-$25M, $25M-$50M, $50M+)
- Fecha de la transacción
- Fecha del filing (delay legal hasta 45 días)
- Owner (self / spouse / dependent / joint)
- Committee assignments (cross-reference manual)

---

## Fondos España vía CNMV — implementación técnica

### Fuente
URL pública: `https://www.cnmv.es/Portal/Consultas/IIC/Fondo.aspx?nif={NIF}`

Por cada fondo registrado en España, CNMV publica:
- **Informes trimestrales** (obligatorios) con cartera detallada
- Formato PDF estructurado → parseable

### NIFs / ISINs a resolver
- Cobas Internacional FI → ISIN ES0119199000 (resolver NIF)
- Magallanes European Equity FI → ISIN ES0159259031 (resolver NIF)
- azValor Internacional FI → ISIN ES0112379036 (resolver NIF)

> Los NIFs exactos se resuelven en fase de implementación. El ISIN es estable y suficiente para identificar el fondo.

### Cadencia de publicación
Los informes trimestrales CNMV se publican con ~45 días de delay:
- Q4 (octubre-diciembre) → publicado mediados febrero
- Q1 (enero-marzo) → publicado mediados mayo
- Q2 (abril-junio) → publicado mediados agosto
- Q3 (julio-septiembre) → publicado mediados noviembre

### Parser CNMV (Python o JS)
```python
# Pseudocódigo
def parse_cnmv_report(pdf_path):
    # Cobas/azValor/Magallanes usan templates relativamente estables
    # Buscar sección "Cartera de Inversiones" / "Detalle Inversiones"
    # Extraer columnas: ISIN, Nombre, Nº títulos, Valor razonable EUR, % Patrimonio
    # Mapear ISIN → ticker via FMP /v4/symbol/{isin}
    return [
        {
            "isin": "...",
            "ticker": "...",  # via lookup
            "name": "...",
            "shares": ...,
            "value_eur": ...,
            "weight_pct": ...
        },
        ...
    ]
```

### Riesgos
- **Cambio de formato PDF** → parser puede romper, requiere mantenimiento puntual
- **ISIN sin ticker mapeable** (empresas pequeñas no listadas en exchanges principales) → marcar como "ISIN-only", aún visible pero sin alertas
- **Delays no anunciados** → cron debe reintentar +5 días si no hay nuevo PDF

---

## Politicians Trading vía FMP — Fase 2

### Filosofía

Información asimétrica legalizada. Senadores y representantes US tienen acceso a:
- Briefings clasificados (defensa, geopolítica, regulación)
- Hearings privados con CEOs
- Conocimiento previo de legislación que afectará sectores enteros (chips act, IRA, healthcare reform)
- Información macro de la Fed antes que el público

**Estudios académicos**: Ziobrowski et al. (2004 House, 2011 Senate) encontraron que la cartera del Senado batía al SPY en ~12% anual entre 1993-1998. Estudios recientes son menos extremos, pero **algunos perfiles individuales siguen batiendo claramente al mercado**.

**No es señal universal**: la mayoría de los políticos no son inversores buenos, son personas con suerte ocasional. Solo unos pocos tienen track record real. Por eso curamos la lista igual que con los fondos.

### Lista curada — 18 políticos seguidos

#### Tier A — Máxima conviction (⭐⭐⭐⭐⭐)

| Nombre | Partido | Chamber | Por qué |
|--------|---------|---------|---------|
| Nancy Pelosi | D | House (CA) | Histórico timing perfecto en tech (NVDA, GOOGL, AAPL). Cartera multimillonaria. ETF NANC la copia. Cada trade es noticia |
| Tommy Tuberville | R | Senate (AL) | Trader extremadamente activo, polémico, sobre todo defensa y agro |
| Dan Crenshaw | R | House (TX) | Active en defensa/energía, military background |
| Josh Gottheimer | D | House (NJ) | Concentrado financieras, House Financial Services |

#### Tier B — Alta conviction (⭐⭐⭐⭐)

| Nombre | Partido | Chamber | Por qué |
|--------|---------|---------|---------|
| Michael McCaul | R | House (TX) | Foreign Affairs Committee chair, defensa |
| Mark Green | R | House (TN) | Healthcare reform, médico |
| Ro Khanna | D | House (CA) | Tech oversight committee, Silicon Valley district |
| Susie Lee | D | House (NV) | Casino/gaming (distrito Vegas) |
| Lloyd Doggett | D | House (TX) | Tax committee — anti-corporate posturing pero compra mucho |
| Rick Scott | R | Senate (FL) | Healthcare/farmacéuticas, ex-CEO Columbia/HCA |

#### Tier C — Conviction media (⭐⭐⭐)

| Nombre | Partido | Chamber | Por qué |
|--------|---------|---------|---------|
| Tina Smith | D | Senate (MN) | Energy, agriculture |
| Sheldon Whitehouse | D | Senate (RI) | Climate, environment |
| John Hickenlooper | D | Senate (CO) | Energy committee, ex-businessman |
| Shelley Capito | R | Senate (WV) | Energy, infraestructure |
| Mark Kelly | D | Senate (AZ) | Aerospace, defense (ex-astronaut) |
| Roger Marshall | R | Senate (KS) | Healthcare, agro |
| Markwayne Mullin | R | Senate (OK) | Energy, oil & gas |
| Pete Ricketts | R | Senate (NE) | Agro, banking (ex-TD Ameritrade family) |

### Por qué solo 18 (mismo principio que fondos)

- **Calidad sobre cantidad**: 18 políticos curados generan menos ruido que 50 random
- **Fácil iterar**: si después de 2 trimestres uno no aporta, baja a Tier C o se desactiva
- **Cobertura por committee**: representan los committees relevantes (Armed Services, Foreign Affairs, Financial Services, Energy, Healthcare, Tax, Tech)
- **Equilibrio bipartidista**: ~50/50 R/D para evitar sesgo y captar coordinated trades de ambos lados

### Filtros inteligentes — extensión del sistema 4 capas

Aplicar los mismos principios de filtrado que con fondos, pero adaptados a la naturaleza de los disclosures:

#### Capa 1 — Filtro de materialidad (más estricto que fondos)

Solo considerar trade si cumple:

| Tipo | Condición |
|------|-----------|
| **PURCHASE** | Rango monto ≥ **$50k** (descarta los $1k-$15k que son ruido del cónyuge) |
| **SALE** | Rango monto ≥ **$50k** AND no es venta de posición que ya estaba decreciendo (filings históricos) |
| **CLUSTER** | ≥**2 políticos del mismo partido** compran mismo ticker en ≤**14 días** → SIEMPRE material independiente del monto |
| **COMMITTEE_MATCH** | Trade en sector que coincide con committee asignado → upgrade automático de tier (ej: Armed Services member compra LMT) |

#### Capa 2 — Tiers (mismo binario que fondos)

| Tier | Condición | Notificación |
|------|-----------|--------------|
| 🔴 **CRITICAL** | Ticker en TU cartera + (Tier A político OR cluster ≥2 políticos OR committee match) | Push instant |
| 🟡 **WATCH** | Ticker en watchlist OR ticker en cartera con político Tier B/C | Solo digest semanal |

Sin tier → solo aparece en pestaña Politicians, no genera notificación.

#### Capa 3 — Conviction automática del político

```
score =
    35 × tier_manual              # A=35, B=23, C=12 (curado a mano)
  + 25 × committee_relevance      # 25 si committee key (Armed/Foreign/Finance/Tech)
  + 20 × historical_alpha         # 20 si su cartera ha batido SPY ≥5% últimos 3y
  + 10 × trade_frequency          # 10 si activo (≥10 trades/año, descarta inactivos)
  + 10 × disclosure_speed         # 10 si fila rápido (<20 días promedio)
```

#### Capa 4 — Cooldown y delivery (consolidado con Smart Money)

**Comparte el mismo cooldown global de 2 push/semana** con las alertas de fondos. Si una semana hay 1 push de fondo + 1 de político, eso es el techo. El resto va al digest.

Esto es importante: los políticos pueden generar muchas señales diarias (filings rolling). Sin consolidar el cooldown con fondos, fácilmente se inflaría a 5-10 push/semana.

### Schema D1 — extensión

```sql
-- Catálogo de políticos seguidos (paralelo a superinvestors)
CREATE TABLE politicians (
  id TEXT PRIMARY KEY,            -- 'pelosi-nancy', 'tuberville-tommy'
  full_name TEXT NOT NULL,
  party TEXT NOT NULL,            -- 'D' | 'R' | 'I'
  chamber TEXT NOT NULL,          -- 'house' | 'senate'
  state TEXT NOT NULL,            -- 'CA', 'TX', etc
  district TEXT,                  -- House only
  tier TEXT NOT NULL,             -- 'A' | 'B' | 'C'
  conviction_score INTEGER,       -- 1-5, calculado por fórmula
  conviction_manual INTEGER,      -- override
  followed BOOLEAN DEFAULT 1,
  baseline_loaded BOOLEAN DEFAULT 0,

  -- Committee assignments (JSON array of committees)
  committees_json TEXT,           -- ["Armed Services", "Foreign Affairs", ...]

  -- Stats calculadas
  trades_last_12m INTEGER DEFAULT 0,
  alpha_3y REAL,                  -- vs SPY
  avg_disclosure_delay_days REAL,

  notes TEXT,
  added_at TEXT
);

-- Trades de políticos
CREATE TABLE politician_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  politician_id TEXT NOT NULL,
  ticker TEXT,
  asset_description TEXT,         -- por si no es ticker (bonds, ETFs, mutual)

  trade_type TEXT NOT NULL,       -- 'purchase' | 'sale' | 'exchange'
  amount_min REAL,                -- $50000
  amount_max REAL,                -- $100000
  amount_bucket TEXT,             -- '50k-100k' (para UI)

  trade_date TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  disclosure_delay_days INTEGER,

  owner TEXT,                     -- 'self' | 'spouse' | 'dependent' | 'joint'

  -- Filtros aplicados
  is_material BOOLEAN,
  is_cluster BOOLEAN DEFAULT 0,   -- forma parte de coordinated trade ≥2 políticos
  cluster_id TEXT,                -- agrupación de cluster
  is_committee_match BOOLEAN DEFAULT 0,
  tier TEXT,                      -- 'CRITICAL' | 'WATCH' | NULL

  notified BOOLEAN DEFAULT 0,
  notification_id TEXT,
  detected_at TEXT,

  FOREIGN KEY (politician_id) REFERENCES politicians(id)
);
CREATE INDEX idx_pt_ticker ON politician_trades(ticker);
CREATE INDEX idx_pt_date ON politician_trades(trade_date);
CREATE INDEX idx_pt_cluster ON politician_trades(cluster_id);

-- Mute por político (anti-spam)
ALTER TABLE fund_mute ADD COLUMN politician_id TEXT;  -- reutiliza tabla
```

### Endpoints worker.js — extensión

```js
// Politicians
GET  /api/politicians/list                    // todos seguidos
GET  /api/politicians/{id}                    // detalle perfil
GET  /api/politicians/{id}/trades?period=90d
POST /api/politicians/{id}/conviction         // override manual
POST /api/politicians/{id}/follow             // toggle followed

// Por ticker
GET /api/politicians/by-ticker/{ticker}       // todos los trades en ese ticker
GET /api/politicians/clusters?period=14d      // clusters detectados últimos 14 días
GET /api/politicians/committee-matches        // trades que coinciden con committee

// Stats
GET /api/politicians/stats?period=90d         // most active, by sector, by party

// Refresh
POST /api/politicians/refresh                 // pull RSS feeds + procesa
```

### Agente "Politicians Tracker"

```
Modelo: Haiku (cheap)
Frecuencia: Diaria 7am ET (filings se publican rolling, no por quarter)

Pipeline:
1. Pull /v4/senate-trading-rss-feed + /v4/house-trades RSS últimas 24h
2. Filter por followed=1
3. Para cada trade:
   a. Aplicar Capa 1 (materialidad: ≥$50k OR cluster OR committee match)
   b. Insert en politician_trades
4. Detect clusters: query politician_trades WHERE trade_date IN (last 14d) GROUP BY ticker HAVING count distinct(politician_id) ≥ 2 AND same party
   → marca is_cluster=1 + asigna cluster_id
5. Detect committee matches: cross-reference ticker sector vs politician committees_json
   → marca is_committee_match=1
6. Aplicar Capa 2 (relevance: cartera/watchlist) → asignar tier
7. Aplicar Capa 3 (conviction político)
8. Aplicar Capa 4 (cooldown global compartido con fondos: máx 2 push/semana)
9. Push instant CRITICAL o queue digest semanal
10. Mark notified=1
```

**Output ejemplo de notificación CRITICAL (cluster)**:
> 🏛️ Cluster Republicano detectado
> **3 senadores R** compraron LMT en últimos 8 días:
> · Tuberville $100k-$250k (Armed Services ✓)
> · Marshall $50k-$100k
> · Mullin $50k-$100k (Energy ✓)
> Tienes LMT en cartera al 1.8%
> [Ver detalles cluster] [Mute LMT politicians] [Mute cluster]

**Output ejemplo committee match**:
> 🏛️ Committee Match
> **Mark Green** (R-TN, House Healthcare) compró UNH $100k-$250k
> Filing 2026-04-05, trade 2026-03-28 (8 días delay)
> Tienes UNH en watchlist
> ⚠ Mark Green es médico y vota en Healthcare reform
> [Ver perfil Mark Green] [Ver UNH]

### Refresh strategy

| Dato | Frecuencia | Cron |
|------|-----------|------|
| Senate RSS | Diaria | 7am ET |
| House RSS | Diaria | 7am ET |
| Stats agregados (alpha 3y, etc) | Mensual | Día 1 cada mes |
| Committee assignments | Anual | Enero (post elecciones) |

**Estimación queries FMP/mes**: ~300 (RSS feeds devuelven mucho en pocas calls)

### Limitaciones honestas

- **Delay legal hasta 45 días** entre trade y filing → la información ya no es "fresh" cuando llega
- **Rangos de monto, no exactos** → no sabes si compraron $50k o $15k
- **Mucho ruido**: cónyuges, trustees ciegos, ETFs, bonos del Tesoro, mutual funds. Filtrar agresivo
- **Político ≠ skill**: Pelosi ha tenido trades que cayeron 50%. No es oráculo. Tratar como UNA señal entre muchas
- **Riesgo de "religiosamente copiar"**: peligroso. Por eso integración con Módulo Proceso es CRÍTICA — las alertas de políticos también deben disparar revisión de tesis, no compras impulsivas
- **Cobertura mixta**: algunos políticos disclose puntualmente, otros van tarde, otros tienen blind trusts

---

## Schema D1 propuesto

```sql
-- Catálogo de superinvestors seguidos
CREATE TABLE superinvestors (
  id TEXT PRIMARY KEY,            -- 'us-berkshire' | 'es-cobas-int'
  source TEXT NOT NULL,           -- 'us-13f' | 'us-mutual' | 'es-cnmv'
  name TEXT NOT NULL,
  manager TEXT,
  cik TEXT,                       -- US only
  isin TEXT,                      -- ES only
  cnmv_nif TEXT,                  -- ES only
  style TEXT,                     -- 'value' | 'quality' | 'growth' | 'macro' | 'activist' | 'dividend'
  conviction_score INTEGER,       -- 1-5, override manual posible
  conviction_auto INTEGER,        -- 1-5, calculado por fórmula
  followed BOOLEAN DEFAULT 1,
  baseline_loaded BOOLEAN DEFAULT 0,  -- false hasta primer refresh (modo "primer trimestre")
  notes TEXT,
  added_at TEXT
);

-- Snapshot de holdings por fondo y quarter
CREATE TABLE fund_holdings (
  fund_id TEXT NOT NULL,
  quarter TEXT NOT NULL,          -- '2026-Q1'
  ticker TEXT,                    -- nullable si solo hay ISIN
  isin TEXT,
  cusip TEXT,
  name TEXT,
  shares REAL,
  value_usd REAL,                 -- normalizado a USD
  value_local REAL,               -- moneda original (EUR para España)
  currency TEXT,
  weight_pct REAL,                -- % sobre cartera del fondo
  updated_at TEXT,
  PRIMARY KEY (fund_id, quarter, COALESCE(ticker, isin))
);
CREATE INDEX idx_fh_ticker ON fund_holdings(ticker);
CREATE INDEX idx_fh_isin ON fund_holdings(isin);
CREATE INDEX idx_fh_quarter ON fund_holdings(quarter);

-- Cambios trimestre a trimestre
CREATE TABLE holdings_changes (
  fund_id TEXT NOT NULL,
  quarter TEXT NOT NULL,
  ticker TEXT,
  isin TEXT,
  change_type TEXT,               -- 'NEW' | 'ADDED' | 'REDUCED' | 'SOLD'
  shares_delta REAL,
  pct_delta REAL,                 -- cambio en peso de cartera
  prev_weight_pct REAL,
  new_weight_pct REAL,
  is_material BOOLEAN,            -- pasa filtros de materialidad
  tier TEXT,                      -- 'CRITICAL' | 'WATCH' | NULL
  detected_at TEXT,
  notified BOOLEAN DEFAULT 0,
  notification_id TEXT,
  PRIMARY KEY (fund_id, quarter, COALESCE(ticker, isin))
);
CREATE INDEX idx_hc_ticker ON holdings_changes(ticker);
CREATE INDEX idx_hc_notified ON holdings_changes(notified);
CREATE INDEX idx_hc_tier ON holdings_changes(tier);

-- Conviction score override (manual)
CREATE TABLE fund_conviction_override (
  fund_id TEXT PRIMARY KEY,
  conviction_manual INTEGER,
  reason TEXT,
  updated_at TEXT
);

-- Mute por ticker (anti-spam)
CREATE TABLE fund_mute (
  ticker TEXT,
  fund_id TEXT,
  muted_at TEXT,
  PRIMARY KEY (COALESCE(ticker, ''), COALESCE(fund_id, ''))
);

-- Notificaciones generadas
CREATE TABLE fund_notifications (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  delivery_type TEXT,             -- 'push_instant' | 'digest_weekly'
  delivered_at TEXT,
  fund_id TEXT,
  ticker TEXT,
  change_type TEXT,
  tier TEXT,
  message TEXT
);

-- ETF holdings (Sub-tab 4)
CREATE TABLE etf_holdings (
  etf_ticker TEXT NOT NULL,
  ticker TEXT NOT NULL,
  weight_pct REAL,
  shares REAL,
  updated_at TEXT,
  PRIMARY KEY (etf_ticker, ticker)
);
```

---

## Endpoints worker.js a añadir

```js
// Fondos
GET  /api/funds/list                          // todos seguidos + último update
GET  /api/funds/{fund_id}                     // detalle
GET  /api/funds/{fund_id}/holdings?quarter=latest
GET  /api/funds/{fund_id}/changes?quarters=4
POST /api/funds/{fund_id}/conviction          // override manual
POST /api/funds/{fund_id}/follow              // toggle followed

// Por ticker
GET /api/funds/by-ticker/{ticker}             // qué fondos lo tienen
GET /api/funds/smart-score?tickers=KO,PEP     // smart money score
GET /api/funds/consensus?min=5                // tickers en ≥N fondos

// Mute
POST /api/funds/mute?ticker={t}&fund={f}
POST /api/funds/unmute?ticker={t}&fund={f}

// ETFs
GET /api/etf/{ticker}/holdings
GET /api/etf/{ticker}/overlap?my_portfolio=1

// Notificaciones
GET /api/funds/notifications?status=pending
POST /api/funds/notifications/digest          // genera digest semanal

// Refresh manual (admin)
POST /api/funds/refresh?fund_id={id}
POST /api/funds/refresh-all
POST /api/funds/refresh-cnmv                  // solo España
```

---

## Sistema de notificaciones inteligentes

### Filosofía
**Máximo 2 push/semana, 4-8 notificaciones útiles al mes.** Mejor 0 notificaciones que ruido.

### Capa 1 — Filtro de materialidad (objetivo)

Solo se considera "movimiento" si cumple alguna de estas condiciones agresivas:

| Tipo | Condición |
|------|-----------|
| **NEW** | Posición nueva con peso ≥ **3%** de la cartera del fondo |
| **SOLD** | Salida total de posición que tenía ≥ **3%** antes |
| **ADDED** | Incremento ≥ **100%** (doblar) en posición ya ≥ 2% |
| **REDUCED** | Reducción ≥ **50%** en posición ≥ 2% |

Cualquier otro cambio se ignora completamente. No se almacena como "INFO", se descarta.

### Capa 2 — Filtro de relevancia (subjetivo a tu cartera)

Cada movimiento material se clasifica en 2 tiers (no 3):

| Tier | Condición | Notificación |
|------|-----------|--------------|
| 🔴 **CRITICAL** | Ticker en TU cartera (D1 `positions`) | Push instant si fondo conviction ≥4, digest si menor |
| 🟡 **WATCH** | Ticker en TU watchlist | Solo digest semanal |

**Sin tier**: si el ticker no está ni en cartera ni en watchlist → no notifica, solo aparece en pestaña Fondos como info histórica.

### Capa 3 — Conviction score automático del fondo

Cada fondo tiene score 1-5 calculado por fórmula objetiva:

```
score =
    30 × min(años_track_record / 20, 1)         # max 30 si ≥20 años
  + 20 × min(log10(AUM_millones / 100), 1)      # max 20 si ≥10B AUM
  + 25 × concentracion_top10                    # max 25 si top10 ≥80%
  + 15 × min(CAGR_10y_alpha / 5, 1)             # max 15 si +5% alpha vs benchmark
  + 10 × transparencia                          # 10 si publica cartera completa

Mapeo a estrellas:
  0-20  → ⭐
  21-40 → ⭐⭐
  41-60 → ⭐⭐⭐
  61-80 → ⭐⭐⭐⭐
  81-100 → ⭐⭐⭐⭐⭐
```

**Override manual posible**: cualquier fondo puede tener `conviction_manual` que sobreescribe el automático. Para casos donde la intuición del usuario es más valiosa que la fórmula.

### Capa 4 — Cooldown y delivery

Reglas de delivery:
- **Push instant** solo para CRITICAL + conviction ≥ 4
- **Máximo 2 push/semana** (cooldown). Si hay más → consolidan en digest
- **Digest semanal**: lunes 9am, todo lo demás de la semana
- **Quiet hours**: nunca push entre 22:00 y 8:00
- **No push fines de semana** (sábado/domingo): se acumula al digest del lunes

### Reglas adicionales anti-ruido
1. **Mute por ticker**: botón "no más alertas de este ticker" en cada notificación
2. **Mute por fondo**: bajar conviction a 1 o desactivar `followed`
3. **Threshold ajustable**: slider en settings — "solo movimientos ≥ 5% peso" si quieres aún menos
4. **Modo primer trimestre**: cuando se añade un fondo nuevo, el primer trimestre **no genera alertas** (solo guarda baseline). Evita falsos positivos de "todo es nuevo".

### Estimación de volumen real

Con 18 fondos × 4 quarters/año × ~5 movimientos materiales por fondo por quarter = ~360 movimientos materiales/año brutos.

Aplicando filtros:
- ~30% afecta a tus tickers (cartera o watchlist) → 108/año
- De esos, ~50% son CRITICAL (en cartera) → 54/año
- De esos, ~60% son de fondos conviction ≥4 → ~32/año push instant

**Total estimado**: ~32 push/año = **0.6 push/semana media** + digest semanal con el resto. Muy por debajo del techo de 2/semana.

---

## Wireframe — 7 sub-tabs

### Sub-tab 1: 🏛️ Superinvestors US
Lista de los 12 US 13F + 2 mutual funds + 1 Canadá (15 fondos US/internacional). Filtros por estilo (value/quality/growth/macro/activist/dividend) y por conviction (≥3⭐). Cada card muestra top holdings, cambios último Q, conviction stars, AUM, fecha último filing.

### Sub-tab 2: 🇪🇸 Fondos España
Los 3 fondos vía CNMV (Cobas, Magallanes, azValor). Mismo formato pero con fuente CNMV badge. Top holdings en EUR + USD equivalent. Cambios trimestre a trimestre con badges 🟢 NEW / 🔴 SOLD / 🟡 REDUCED.

### Sub-tab 3: 🎯 Mi cartera vista por superinvestors
Tabla con tus 89 tickers ordenados por "smart money score". Columnas: ticker, mi peso, smart score, top 3 holders, último cambio relevante. Indicadores 🟢🟡🔴 según movimientos último trimestre.

### Sub-tab 4: ⭐ Consensus picks
Tickers en ≥N superinvestors seguidos (default N=4 con solo 18 fondos). Filtro por dividend yield mínimo. ⭐ marca los que ya tienes. Click → ver qué fondos lo tienen y con qué peso.

### Sub-tab 5: 📊 ETF Exposure
Tu cartera vs SCHD, VIG, NOBL, DGRO, VYM, SPY. Overlap%, yield comparativo, DGR comparativo. Sirve para ver "qué % de mi cartera replica un ETF" y "qué tengo que SCHD no tiene".

### Sub-tab 6: 🔔 Smart Money Alerts
Histórico de notificaciones generadas (fondos + políticos consolidado). Filtros: solo CRITICAL, solo último mes, por fondo/político, por ticker, por fuente (fondos/politicians). Botón mute integrado. Marca "leído / no leído".

### Sub-tab 7: 🏛️ Politicians Trading
Los 18 políticos seguidos con trades últimos 90 días. Sub-vistas internas:

**7.1 — Most Active**
Top 10 políticos por # trades último trimestre. Stats: # trades, monto total estimado, sectores principales, trades en tu cartera/watchlist.

**7.2 — Mis tickers**
Para cada ticker tuyo + watchlist, lista de trades de políticos seguidos en últimos 90 días. Indicadores 🟢 buy / 🔴 sell + chip partido (R/D) + monto bucket.

**7.3 — Clusters detectados**
Coordinated trades: ≥2 políticos del mismo partido en mismo ticker en ≤14 días. Esto es la señal más fuerte. Filtro por partido y por sector.

**7.4 — Committee Matches**
Trades donde el ticker pertenece al sector del committee del político. Ej: "Mark Green (R-TN, Healthcare) compró UNH". Señal muy fuerte de inside knowledge contextual.

**7.5 — Politician Profiles**
Cards detalladas de los 18 políticos: foto/avatar, partido, chamber, state, committees, conviction stars, alpha 3y vs SPY, # trades 12m, top tickers, último trade. Click → vista expandida con histórico completo.

```
┌─ Sub-tab 7.3 Clusters ──────────────────────────┐
│ Clusters últimos 14 días · Min 2 políticos       │
│                                                   │
│ 🔴 LMT · 3 senators R · $250k-$650k total        │
│   Tuberville (Armed Svcs) $100k-$250k · 2026-04-05│
│   Marshall                $50k-$100k  · 2026-04-02│
│   Mullin (Energy)         $50k-$100k  · 2026-03-28│
│   Tienes LMT al 1.8% ⭐                          │
│                                                   │
│ 🟡 NVDA · 2 reps D · $100k-$300k total           │
│   Pelosi (CA)             $100k-$250k · 2026-04-04│
│   Khanna (CA Tech)        $50k-$100k  · 2026-03-30│
│   No tienes NVDA                                  │
└──────────────────────────────────────────────────┘
```

---

## Smart Money Agent

**Modelos**: No-LLM para parseo + Haiku para clasificación de relevancia opcional
**Frecuencia**:
- US 13F refresh: 15 feb / 15 may / 15 ago / 15 nov (post-deadline)
- Mutual funds: día 5 de cada mes
- CNMV España: 15 feb / 15 may / 15 ago / 15 nov (mismo calendario)

**Pipeline completo**:
```
1. Cron dispara según calendario por fuente
2. Para cada fondo followed=1:
   a. Si US: fetch FMP /form-thirteen/{cik} (latest quarter)
   b. Si mutual: fetch FMP /mutual-fund-holder/{ticker}
   c. Si España: download CNMV PDF + parser → extract holdings
3. Insertar nuevo snapshot en fund_holdings
4. Diff vs quarter anterior → poblar holdings_changes con is_material y tier
5. Aplicar Capa 1 (materialidad) → descartar no-material
6. Aplicar Capa 2 (relevancia) → asignar tier
7. Aplicar Capa 3 (conviction) → decide push vs digest
8. Aplicar Capa 4 (cooldown) → respeta máximo 2/semana
9. Push notifications (instant) o queue para digest semanal
10. Mark notified=1
11. Si baseline_loaded=0 (primer trimestre del fondo) → solo guardar, NO notificar
```

**Output ejemplo de notificación CRITICAL**:
> 🔔 Smart Money Q1'26
> **Cobas Internacional** entró NUEVA posición en **MAIRE.MI** con 4.2% peso
> Tienes MAIRE en cartera al 0.8% — considerar revisar tesis
> [Ver cartera Cobas] [Mute MAIRE] [Mute Cobas]

**Output ejemplo de digest semanal**:
> 📰 Digest Smart Money — Semana 15-21 abril 2026
>
> **3 movimientos en tus tickers**:
> 🔴 Berkshire vendió completamente PARA (era 0.3%) — no lo tienes
> 🟡 Polen redujo KO 30% (de 4% a 2.8%) — tienes KO al 4.2% ⚠️
> 🟢 Pabrai NUEVA MU 25% — tienes MU al 0.5%
>
> **2 movimientos en watchlist**:
> 🟢 Akre +50% MA (8% → 12%) — en watchlist
> 🟢 Magallanes NEW Stellantis 3.5% — en watchlist

---

## Refresh strategy

| Dato | Fuente | Frecuencia | Cron específico |
|------|--------|------------|-----------------|
| US 13F holdings | FMP `/form-thirteen` | Trimestral | 15 feb / 15 may / 15 ago / 15 nov, 6am ET |
| US Mutual funds | FMP `/mutual-fund-holder` | Mensual | Día 5 cada mes, 6am |
| ES CNMV holdings | Scrape CNMV PDFs | Trimestral | 15 feb / 15 may / 15 ago / 15 nov, 8am CET |
| Institutional ownership % | FMP `/institutional-ownership` | Semanal | Lunes 6am |
| ETF holdings | FMP `/etf-holder` | Semanal | Lunes 6am |
| ETF info (AUM, ER) | FMP `/etf-info` | Mensual | Día 1, 6am |

**Estimación queries FMP/mes**: ~2,000 (muy bajo, cabe en plan Global sin problemas)

**Estimación scrapes CNMV/quarter**: 3 PDFs × 4 quarters/año = 12 scrapes/año (trivial)

---

## Implementación por fases (cuando merge la otra rama)

### Fase 1 — Backend US (1-2 días)
1. D1 migrations: 7 tablas nuevas
2. Worker endpoints US: ~12 endpoints
3. Resolver CIKs de los 12 US 13F + 2 mutual funds + Giverny → seed `superinvestors`
4. Script de refresh manual + test con quarter actual
5. Implementar Capas 1-4 del filtrado en JS

### Fase 2 — Backend España CNMV (1-2 días)
6. Parser CNMV PDFs (Cobas, Magallanes, azValor)
7. ISIN → ticker mapping via FMP
8. Endpoint refresh-cnmv
9. Cron alineado con calendario CNMV
10. Manejar conversión EUR → USD para normalización

### Fase 3 — Frontend (2-3 días)
11. Componente `FondosView.jsx` con 6 sub-tabs
12. Reuse `CompanyRow` patterns para listas de holdings
13. Dark/light mode coherente con resto app
14. Mobile responsive
15. Botones mute integrados
16. Vista detalle modal por fondo (cartera completa + histórico 8Q)

### Fase 4 — Agente Smart Money (1 día)
17. Smart Money Agent en pipeline `/api/agents/run`
18. Push notification integration con sistema existente
19. Digest semanal cron lunes 9am
20. Mode primer trimestre para fondos nuevos

### Fase 5 — Pulido y settings (medio día)
21. Settings: threshold ajustable, conviction overrides, mute management
22. Export holdings a CSV
23. Tests integración
24. Documentación interna

### Fase 6 — Politicians Trading (1-2 días) — extensión
25. Migration D1: tabla `politicians` + `politician_trades` + ALTER fund_mute
26. Seed: 18 políticos con tier, party, chamber, committees
27. Endpoints worker: ~10 endpoints nuevos
28. Agente "Politicians Tracker" en pipeline daily 7am ET
29. Detección de clusters (query agrupada en SQL)
30. Detección de committee matches (cross-reference)
31. Sub-tab 7 frontend con 5 sub-vistas internas
32. Cooldown global compartido con fondos (NO duplicar contadores)

**Total estimado completo**: 8-10 días de trabajo concentrado (6-8 base + 1-2 Politicians Fase 6).

---

## Limitaciones conocidas

- **Solo US 13F filers + ES CNMV + US Politicians**: cobertura geográfica limitada. UK (Fundsmith), Canada (Giverny puede tener algún issue), Japón fuera salvo casos puntuales
- **Delay 45 días** desde quarter end hasta filings disponibles (legal, inevitable) — aplica a 13F y a politician disclosures
- **13F solo posiciones long en US equities**: no bonds, no shorts, no internacional, no opciones
- **CNMV PDFs cambian formato a veces** → parser requiere mantenimiento puntual
- **ISIN sin ticker mapeable** para empresas pequeñas no listadas en exchanges principales
- **Fondos UCITS pequeños fuera de España** sin cobertura
- **Politicians: rangos de monto, no exactos** → granularidad limitada
- **Politicians: ruido del cónyuge / blind trusts / mutual funds** → filtros agresivos imprescindibles

---

## Decisiones tomadas (vs borrador anterior)

| Decisión | Anterior (v1) | Final (v2) | Razón |
|----------|---------------|------------|-------|
| Nº fondos seguidos | 25-50 | **18** | Calidad > cantidad, evita ruido |
| Tiers de notificación | 3 (CRIT/WATCH/INFO) | **2 (CRIT/WATCH)** | Binario es más simple y útil |
| Threshold NEW | ≥2% peso | **≥3% peso** | Más agresivo para reducir falsos positivos |
| Threshold ADDED | ≥50% delta | **≥100% delta** | Doblar es decisión activa real |
| Conviction score | Solo manual | **Auto + override manual** | Reduce fricción inicial |
| Push máximo | Sin límite | **2/semana** | Anti banner blindness |
| Quiet hours | No | **22:00-8:00 + weekends** | Respeto a la atención del usuario |
| Modo primer trimestre | No | **Sí — no notifica primer Q** | Evita falsos positivos al añadir fondo |
| Cobertura España | Pendiente | **Cobas + Magallanes + azValor** vía CNMV | Cubre el "trío de oro" del value español |
| Tom Russo | No incluido | **Incluido (top conviction)** | EL especialista dividend consumer brands |
| Giverny Capital | No incluido | **Incluido** | Quality compounding internacional, transparencia legendaria |

---

## Próximos pasos (cuando termine la rama paralela)

1. Resolver CIKs reales contra `/v3/cik-search/` (los del doc son aproximados)
2. Resolver NIFs CNMV reales (los ISINs están listados)
3. Crear migration D1 con las 7 tablas
4. Empezar Fase 1 backend US
5. En paralelo, prototipar parser CNMV con un PDF real de Cobas

## Decisiones aún pendientes (revisar antes de implementar)

1. **¿Envío push por OneSignal/web push existente o canal nuevo?** → reutilizar sistema actual de la app probablemente
2. **¿Muestra valor en USD o EUR para fondos España?** → ambos, default USD coherente con resto de la app, toggle EUR/USD
3. **¿Histórico cuántos quarters mostrar?** → 8 (2 años) por defecto en UI, 16 retenidos en BD
4. **¿Smart Money score visible en CompanyRow del Portfolio?** → sí, badge pequeño con número de fondos seguidos que tienen el ticker
