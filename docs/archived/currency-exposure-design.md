# Currency Exposure Dashboard

> Estado: DISEÑO. No implementar hasta merge de rama paralela.
> Generado 2026-04-07.

---

## Propósito

Hoy tu cartera tiene 89 posiciones distribuidas en exchanges US, BME, HKG, LSE, etc. Pero esto es **engañoso** — la moneda del exchange ≠ moneda real de exposición.

**Ejemplo real**:
- KO cotiza en NYSE, pero **60% de su revenue es non-US** (Latinoamérica, Asia, Europa)
- NESN cotiza en SIX (CHF), pero **44% de revenue es Americas**, ~30% Europa, ~25% Asia
- AAPL cotiza en Nasdaq pero **58% revenue non-US**

Tu exposición real a USD/EUR/CNY/etc no se mide por dónde cotiza el ticker, sino por **dónde están las ventas**.

Este módulo calcula tu exposición **real** por moneda, te muestra concentraciones de riesgo, y sugiere coberturas implícitas vía la propia cartera.

---

## Filosofía

### Principios

1. **Exposición real = revenue geográfico**, no exchange listing
2. **No necesitas hedgear con derivados** — la cartera bien diversificada se hedgea sola
3. **Visibilidad > control** — saber tu exposición, no necesariamente cambiarla
4. **Tu situación particular**: vives en China actualmente con tributación China (US-China treaty 10% WHT). Esto matters para currency hedging real

### Lo que NO es

- ❌ NO es un FX trader
- ❌ NO sugiere hedgear con futuros/options
- ❌ NO predice movimientos cambiarios
- ❌ NO es complejo — una vista clara basta

### Lo que SÍ es

- ✅ Dashboard con exposición real por moneda (USD/EUR/CNY/HKD/JPY/...)
- ✅ Sectorial overlap por moneda
- ✅ Alertas si concentración pasa thresholds
- ✅ Sugerencias de balance vía Discovery Engine

---

## Datos necesarios

### 1. Revenue geográfico por ticker

**FMP endpoint**:
```
GET /v4/revenue-geographic-segmentation/{ticker}?period=annual
```

Devuelve para cada año:
```json
[
  {
    "date": "2025-12-31",
    "Americas": 50000000000,
    "Europe": 20000000000,
    "Asia Pacific": 15000000000,
    "Greater China": 10000000000,
    "Rest of world": 5000000000
  }
]
```

**Limitación**: cobertura desigual. Empresas grandes (S&P 500) tienen datos buenos. Small caps internacionales menos.

**Fallback** cuando no hay revenue segmentation:
- **Headquarter country** del profile FMP → asignar 100% a esa moneda
- Marcado como "low confidence" para que no engañe

### 2. Mapping región → moneda

```python
REGION_TO_CURRENCY = {
    "Americas": {
        "US": "USD",
        "Mexico": "MXN",
        "Brazil": "BRL",
        "Canada": "CAD",
        # default Americas → USD weighted
    },
    "Europe": {
        "EUR_zone": "EUR",
        "UK": "GBP",
        "Switzerland": "CHF",
        "Sweden": "SEK",
        # default Europe → EUR weighted
    },
    "Asia Pacific": {
        "Japan": "JPY",
        "Australia": "AUD",
        "Singapore": "SGD",
        "India": "INR",
    },
    "Greater China": {
        "China": "CNY",
        "Hong Kong": "HKD",
        "Taiwan": "TWD",
    },
}
```

Como FMP no siempre desglosa por país, usar **defaults regionales**:
- Americas → 85% USD, 15% mix
- Europe → 65% EUR, 20% GBP, 15% mix (CHF, SEK, etc.)
- Asia Pacific → 35% JPY, 15% AUD, 50% mix
- Greater China → 60% CNY, 35% HKD, 5% TWD

Configurable en seed data.

### 3. FX rates (cotización)

```
GET /v3/quote/EURUSD
GET /v3/quote/USDCNY
GET /v3/quote/USDHKD
...
```

Cacheado diario.

---

## Cálculo de exposición real

```python
def calculate_real_exposure(positions: list) -> dict:
    """
    Para cada posición, descompone su valor por moneda según revenue
    geográfico, no por exchange listing.
    """
    exposure_by_currency = defaultdict(float)
    coverage_quality = {}  # tracking confidence

    for pos in positions:
        position_value_usd = pos.shares * pos.price_usd

        revenue_seg = fmp.revenue_segmentation(pos.ticker)

        if revenue_seg:
            # High confidence: real data
            for region, region_pct in revenue_seg.items():
                currencies = REGION_DEFAULTS[region]
                for currency, currency_pct in currencies.items():
                    exposure_by_currency[currency] += (
                        position_value_usd * region_pct * currency_pct
                    )
            coverage_quality[pos.ticker] = "high"
        else:
            # Low confidence: fallback to HQ country
            hq_country = pos.profile.country
            currency = COUNTRY_TO_CURRENCY[hq_country]
            exposure_by_currency[currency] += position_value_usd
            coverage_quality[pos.ticker] = "low"

    total = sum(exposure_by_currency.values())

    return {
        "total_usd": total,
        "by_currency": {
            curr: {
                "value_usd": val,
                "pct": val / total * 100,
            }
            for curr, val in exposure_by_currency.items()
        },
        "coverage_quality": coverage_quality,
        "high_confidence_pct": sum(
            pos.value for pos in positions
            if coverage_quality.get(pos.ticker) == "high"
        ) / total * 100,
    }
```

---

## Schema D1

```sql
-- Revenue segmentation cacheado por ticker
CREATE TABLE revenue_segmentation (
  ticker TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  region TEXT NOT NULL,                    -- 'Americas' | 'Europe' | etc
  revenue_usd REAL NOT NULL,
  pct_of_total REAL,
  confidence TEXT,                          -- 'high' | 'medium' | 'low'
  source TEXT,                              -- 'fmp_segmentation' | 'fmp_hq_fallback' | 'manual'
  fetched_at TEXT,
  PRIMARY KEY (ticker, fiscal_year, region)
);

-- Mapping región → moneda (seed data, editable)
CREATE TABLE region_currency_mapping (
  region TEXT NOT NULL,
  currency TEXT NOT NULL,
  weight REAL NOT NULL,                    -- % de la región asignado a esa currency
  notes TEXT,
  PRIMARY KEY (region, currency)
);

-- Snapshots mensuales de exposición currency
CREATE TABLE currency_exposure_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,             -- YYYY-MM-01
  total_portfolio_usd REAL,

  -- Por currency
  usd_value REAL,
  usd_pct REAL,
  eur_value REAL,
  eur_pct REAL,
  cny_value REAL,
  cny_pct REAL,
  hkd_value REAL,
  hkd_pct REAL,
  jpy_value REAL,
  jpy_pct REAL,
  gbp_value REAL,
  gbp_pct REAL,
  chf_value REAL,
  chf_pct REAL,
  other_value REAL,
  other_pct REAL,

  -- Quality
  high_confidence_pct REAL,                -- qué % usa data real (no fallback)

  computed_at TEXT,
  details_json TEXT                         -- breakdown completo por ticker
);
CREATE INDEX idx_ces_date ON currency_exposure_snapshots(snapshot_date);

-- Alertas
CREATE TABLE currency_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT,                          -- 'concentration' | 'drift' | 'fx_shock'
  currency TEXT,
  current_pct REAL,
  threshold REAL,
  severity TEXT,                            -- 'warning' | 'critical'
  created_at TEXT,
  notified BOOLEAN DEFAULT 0
);
```

---

## Endpoints worker.js

```js
GET /api/currency/exposure                  // current breakdown
GET /api/currency/exposure/history?period=12m
GET /api/currency/exposure/by-ticker        // detail per position

GET /api/currency/coverage-quality          // qué % es high confidence

POST /api/currency/refresh                  // pull revenue segmentation

GET /api/currency/briefing-input?since=...  // para Daily Briefing

GET /api/currency/sectors-by-currency       // overlap currency × sector
```

---

## Vista principal

### Dashboard hero
```
┌─ Currency Exposure ─────────────────────────────────┐
│ Total cartera: $1,353,420 USD                        │
│ Calidad de datos: 78% high confidence                │
│                                                       │
│ Exposición real por moneda:                          │
│                                                       │
│  USD  ████████████████████░░  62.4%  $844,335       │
│  EUR  ██████░░░░░░░░░░░░░░░░  15.8%  $213,840       │
│  CNY  ████░░░░░░░░░░░░░░░░░░   8.2%  $110,981       │
│  HKD  ██░░░░░░░░░░░░░░░░░░░░   4.1%   $55,490       │
│  JPY  ██░░░░░░░░░░░░░░░░░░░░   3.8%   $51,430       │
│  GBP  █░░░░░░░░░░░░░░░░░░░░░   2.1%   $28,422       │
│  CHF  █░░░░░░░░░░░░░░░░░░░░░   1.9%   $25,715       │
│  Otra ░░░░░░░░░░░░░░░░░░░░░░   1.7%   $23,208       │
│                                                       │
│ ⚠ Concentración USD: dentro target (50-70%)         │
│ ⚠ Exposición CNY: 8.2% notable, OK por residencia   │
│                                                       │
│ vs hace 12 meses: USD -3.1pp, EUR +1.8pp, CNY +1.5pp│
└──────────────────────────────────────────────────────┘
```

### Sub-vista: por ticker
```
┌─ Top exposiciones por moneda ───────────────────────┐
│                                                       │
│ USD (62.4% total)                                    │
│   MSFT    6.1% × 42% USD = 2.6%                     │
│   V       3.8% × 35% USD = 1.3%                     │
│   ...                                                 │
│                                                       │
│ EUR (15.8%)                                          │
│   NESN    3.2% × 30% EUR = 1.0%                     │
│   AD.AS   1.4% × 95% EUR = 1.3%                     │
│   ENG     1.0% × 70% EUR = 0.7%                     │
│   ...                                                 │
│                                                       │
│ CNY/HKD (12.3% combined)                             │
│   HKG:9618  0.8%                                     │
│   HKG:1052  0.6%                                     │
│   KO        4.2% × 12% China = 0.5%                 │
│   ...                                                 │
└──────────────────────────────────────────────────────┘
```

### Vista coverage
```
┌─ Coverage Quality ──────────────────────────────────┐
│                                                       │
│ 78% high confidence (datos reales segmentation)     │
│ 22% low confidence (fallback HQ country)             │
│                                                       │
│ Tickers que usan fallback (revisar manualmente):    │
│ • RAND (Randstad)                                    │
│ • ENG (Enagás)                                       │
│ • LANDP                                              │
│ • OWL (Owl Rock)                                     │
│ • Algunos HKG: tickers                               │
│                                                       │
│ Para mejorar: editar manualmente revenue split en   │
│ casos críticos. Para tu cartera, el 78% es bueno.   │
└──────────────────────────────────────────────────────┘
```

---

## Alertas

| Trigger | Severidad |
|---------|-----------|
| USD < 40% o > 80% | 🟡 warning concentración |
| Cualquier moneda no-USD > 25% | 🟡 warning concentración |
| Drift > 5pp en 6 meses en cualquier moneda | 🟡 warning drift |
| FX shock (>5% en un día contra USD) en moneda con exposure >10% | 🟠 informativo |

Todas consolidadas con cooldown global. Aparecen en Daily Briefing solo si son notables, no semanalmente.

---

## Integración con Discovery Engine

Cuando hay desbalance currency notable, el Discovery Engine puede sugerir tickers que ayuden a balancear. Ejemplo:

```
"Tu exposición CNY ha caído de 10% a 5% últimos 12 meses por venta
de HKG:9618. Si quieres mantener exposure China sin trade directo,
considera tickers con revenue China alta:
- HKG:9988 (Alibaba)
- BUD (10% revenue China)
- VOW3 (Volkswagen, 30% China)
- Yum China (YUMC) 100% China
"
```

Esto se integra como un source nuevo en Discovery Engine: "Currency Balance Suggestions".

---

## Implementación por fases

### Fase 1 — Pipeline (1 día)
1. Migrations D1: 4 tablas
2. Pull revenue segmentation FMP por ticker
3. Seed region_currency_mapping
4. Cálculo exposure inicial
5. Cron mensual día 5

### Fase 2 — UI (1 día)
6. Dashboard hero con bars
7. Sub-vista por ticker
8. Coverage quality view
9. Histórico time series

### Fase 3 — Briefing + alertas (medio día)
10. Endpoint briefing-input
11. Logic alertas drift / concentración
12. Cross-link Discovery Engine

**Total**: 2-3 días.

---

## Coste

**$0 LLM**. Puro cálculo. FMP queries: ~100/mes (mucho cacheado).

---

## Decisiones tomadas

| Decisión | Opción | Razón |
|----------|--------|-------|
| Modelo | **Sin LLM** | Puro cálculo |
| Granularidad | **Por moneda principal (8 buckets)** | Más es overhead, menos pierde info |
| Fallback sin segmentation | **HQ country, marcado low confidence** | Mejor algo que nada, transparente |
| Frecuencia recálculo | **Mensual** | Cambia despacio |
| Alertas | **Solo concentración + drift > 5pp** | Anti-spam |
| Integración Discovery | **Sí, como source nuevo** | Sugerencias accionables |
| Hedging con derivados | **NO en MVP** | Complejidad fuera de scope |
| Mostrar en CompanyRow | **NO** | Ya hay muchos badges, currency es contextual |

---

## Riesgos y limitaciones

| Riesgo | Mitigación |
|--------|------------|
| FMP segmentation incompleta | Marcar low confidence, % visible |
| Defaults regionales imprecisos | Configurables, iterar con data real |
| Drift entre revenue y profit por moneda | Acepted limitation, revenue es proxy razonable |
| Tax implications cambian con residencia | Tu situación China matters — añadir nota residencia → tax treaty |
| FX rates desactualizados | Cron diario, fallback timestamp último valor |
