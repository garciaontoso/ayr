# Pestaña Rentabilidad 10y — Plan de implementación

**Origen**: Conversación con Gorka 2026-05-18 + Excel "Archivo Rentabilidad-2.xlsx" enviado por él.
**Decisiones del usuario** (2026-05-18):
- Ubicación: **Análisis por empresa** (junto a ⚡ FAST, 🎭 Veredicto, 🎓 Experto)
- Persistencia: **D1** (tabla `rentabilidad_inputs`)
- Prioridad: **Después de Capa 4** (terminar hardening primero)

---

## Lógica del modelo (extraída del Excel de Gorka)

### Inputs históricos (10 años, columnas B-G)
```
VENTAS | BPA | DPA | EQUITY | RET EARN | ACTIVOS
```
Año -10 a 0 (filas A7:A17).

### Inputs variables (columnas I-L)
- **J6 Cotización cálculo** = precio actual (live FMP)
- **L6 P/E actual** = J6 / BPA año 0
- **J9 Crecimiento esperado** = % (default = CAGR histórico capped 15%)
- **J8 Positivo** = J9 + 1.5
- **J10 Negativo** = J9 − 1.5
- **K8/K9/K10** = 1 + (J/100) — factores de capitalización
- **J12 Dividendo año 0** (DPA actual)
- **K12 Yield actual** = J12 / J6
- **J13/K13/L13 Rango múltiplos P/E** = 10 / 14 / 17 (defaults)

### Cálculos automáticos
- **Fila 18 CAGR 10y** por columna: `(valor_0 / valor_-10)^(1/10) − 1`
- **O7:O17 Retenido por año** = BPA − DPA
- **O18 Σ Retenidos**
- **P18 ΔBPA** = BPA_0 − BPA_-10
- **J15 Coeficiente Habilidad** = ΔBPA / Σ Retenidos
  - Mide cuánto BPA genera cada $ retenido. Es la métrica clave Phil Town.
  - >0.10 excelente, 0.05-0.10 bueno, <0.05 débil

### Proyección 10y (filas 21-30)
3 escenarios paralelos de BPA y EQUITY:
- **Negativo** (col B/E): BPA_0 × K10^año
- **Normal** (col C/F): BPA_0 × K9^año
- **Positivo** (col D/G): BPA_0 × K8^año

### Valoración futura (filas 32-39)
Para cada escenario × cada múltiplo:
- **A32 Deprimido**: BPA_10y × múltiplo bajo (10×)
- **A35 Normal**: BPA_10y × múltiplo medio (14×)
- **A38 Caliente**: BPA_10y × múltiplo alto (17×)

Retornos calculados:
- **CAGR precio**: `(precio_futuro / J6)^(1/10) − 1`
- **Retorno total**: CAGR precio + yield_actual (K12)

**Output final: matriz 3×3 = 9 retornos esperados a 10 años.**

---

## Implementación frontend

### Archivo nuevo
`frontend/src/components/analysis/RentabilidadTab.jsx`

### Posición en TABS
En `frontend/src/components/views/HomeView.jsx`, añadir entre `🎓 Experto` y `Resumen`:
```js
{ id: 'rentabilidad', label: '📊 Rentabilidad 10y', component: lazy(() => import('../analysis/RentabilidadTab.jsx')) }
```

### Hook nuevo
`frontend/src/hooks/useRentabilidad10y.js` — toma `fin` y `fmpExtra`, devuelve:
```ts
{
  historico: { ventas: [...], bpa: [...], dpa: [...], equity: [...], ret: [...], activos: [...] },
  cagr: { ventas, bpa, dpa, equity, ret, activos },
  coefHabilidad: number,
  proyeccionBpa: { negativo: number[], normal: number[], positivo: number[] },
  matrizRetorno: number[][],  // [escenario][múltiplo]
  yieldActual: number,
}
```

### Edición de inputs
Cada celda editable se persiste en D1 vía nuevo endpoint:
```
GET  /api/rentabilidad/inputs?ticker=X
POST /api/rentabilidad/inputs
  body: { ticker, year, field, value }  // value=null borra override
```

### Verificación anti-cagadas FMP
Banner amarillo en cada celda con override automático cuando:
1. **EPS año X anómalo** = más de 3σ vs media 5y rolling
2. **DPA × shares ≠ commonDividendsPaid** (±5%)
3. **BPA × shares ≠ netIncome** (±2%)
4. **Equity año X muy diferente** vs año X-1 (write-down detectado, sugerir suavizado)
5. **Año falta totalmente** → marcar y permitir entrada manual

Banner rojo si el ticker es REIT/BDC/ETF/Crypto:
> "Modelo Phil Town no aplica directamente. Usar AFFO en lugar de EPS." (con botón para conmutar el tab a modo REIT)

---

## Implementación backend

### Nueva tabla D1
```sql
CREATE TABLE IF NOT EXISTS rentabilidad_inputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  year INTEGER NOT NULL,
  field TEXT NOT NULL,      -- 'ventas'|'bpa'|'dpa'|'equity'|'ret'|'activos'|'growth'|'pe_low'|'pe_mid'|'pe_high'
  value REAL,                -- NULL = restore FMP default
  source TEXT DEFAULT 'manual',  -- 'manual' | 'fmp' | 'fastgraphs'
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ticker, year, field)
);
CREATE INDEX IF NOT EXISTS idx_rentabilidad_ticker ON rentabilidad_inputs(ticker);
```

### Endpoints nuevos (api/src/worker.js)
- `GET  /api/rentabilidad/inputs?ticker=X` — devuelve overrides del ticker
- `POST /api/rentabilidad/inputs` (auth) — upsert override
- `DELETE /api/rentabilidad/inputs?ticker=X&year=Y&field=Z` (auth) — restaurar default FMP
- `GET  /api/rentabilidad/historicals?ticker=X` — 10y FMP cross-checked con verificación

### Cross-check en backend
Endpoint `/api/rentabilidad/historicals` valida cada año:
```js
// Para cada año:
const epsFromIncome = income[y].epsDiluted;
const epsFromRatio = netIncome[y] / sharesOut[y];
const matches = Math.abs(epsFromIncome - epsFromRatio) / Math.abs(epsFromIncome) < 0.02;
if (!matches) flags.push({ year: y, field: 'bpa', issue: 'income.eps no coincide con NI/shares' });
```

---

## Tests (parte del Capa 5 hardening)

Nuevos tests obligatorios:
- `frontend/src/calculators/__tests__/rentabilidad10y.test.js` — golden tests CAGR, coef habilidad, proyección
- `frontend/tests/regressions/bug-eps-anomaly-detection.test.js` — write-downs no contaminan proyección
- `frontend/tests/regressions/bug-rentabilidad-reit-blocked.test.js` — REITs muestran banner correcto

---

## Defaults por sector (rango múltiplos P/E)

| Sector | Deprimido | Normal | Caliente |
|--------|-----------|--------|----------|
| Consumer Staples | 14 | 18 | 22 |
| Consumer Discretionary | 12 | 16 | 20 |
| Industrials | 12 | 16 | 20 |
| Tech | 18 | 25 | 32 |
| Financials | 8 | 11 | 14 |
| Healthcare | 14 | 18 | 24 |
| Utilities | 12 | 16 | 18 |
| Energy | 8 | 12 | 16 |
| Materials | 10 | 14 | 18 |
| Telecom | 10 | 13 | 16 |
| REIT (P/AFFO) | 14 | 18 | 22 |
| BDC (P/NAV) | 0.85 | 1.0 | 1.15 |

Defaults se aplican al primer load del ticker; usuario puede override.

---

## Próximos pasos cuando se construya

1. Crear tabla D1 + migración
2. Crear endpoint `/api/rentabilidad/historicals` con cross-check FMP
3. Crear endpoint `/api/rentabilidad/inputs` GET/POST/DELETE
4. Crear hook `useRentabilidad10y.js`
5. Crear componente `RentabilidadTab.jsx` con matriz editable + bandera roja/amarilla
6. Añadir a TABS array en HomeView
7. Tests golden + regresión
8. Deploy + smoke test con KO/MCD/ZTS (los 3 casos canónicos)

---

## Recordatorio Gorka del 2026-05-18

Lo que sale de esta sesión y debe verse reflejado en la UI cuando construyamos el tab:
- **Coeficiente de Habilidad** prominente con tooltip explicando "cuánto BPA por cada $ retenido"
- **3 escenarios × 3 múltiplos = 9 outputs** — el cálculo completo, no solo "escenario base"
- **Retorno total = CAGR precio + yield actual** — no olvidar el dividendo en la ecuación
- **NO comprar all-in** — el tab debe mostrar precio entrada incremental sugerido (5/10/15% de la posición meta)
- **Empresas baratas = retorno 12%+** (no descuentos extremos) — defaults múltiplo conservadores

Pendiente decidir cuando construyamos: ¿incluir simulación buyback (sharesOut declining) en el modelo?
