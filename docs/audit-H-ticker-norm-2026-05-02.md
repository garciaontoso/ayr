# Audit H — Ticker Normalization (cost_basis / dividendos / positions / transferencias)

Fecha: 2026-05-02
Owner: claude (audit-H)
DB: `aar-finanzas` (D1, remoto)

## TL;DR

- **631 tickers únicos** en `cost_basis` (EQUITY/BUY/SELL solo); **260** en `dividendos`; **85** en `positions`. `transferencias` NO tiene columna `ticker`.
- IB_MAP cubre los HK más comunes pero hay **3 nuevos sufijos `d`** (Xetra delayed feed) que faltaban: `AIRd`, `BAYNd`, `HEN3d`. → **APLICADO** en worker.js (6 instancias del map sincronizadas).
- **Bug crítico identificado**: AMS y BME:AMS coexisten con trades EXACTOS duplicados (mismo fecha+precio+shares) → doble-import. Idem HEN3 vs HEN3d.
- **Bug histórico**: tickers HK numéricos (`1`, `700`, `939`, `9988`, `1066`, `1999`, `2168`, `2678`, `3690`, `2102`) están como **raw** en cost_basis a pesar de que el IB_MAP los traduce a `HKG:0xxx`. Esto significa: import flex viejo NO normalizó. 9 tickers afectados, 64 trades en total. Trades quedan huérfanos respecto a positions.
- **Orphan crítico (positions sin cost_basis)**: `OMC` (Omnicom, 68.8 shares) y `BME:VIS` (Viscofan, 308 shares — porque cost_basis tiene `VIS`/`VISe`).
- 16 positions activos NO tienen entrada en `dividendos` (algunos esperado: KMB sí paga, ACN sí paga → re-import flex puede ayudar).
- 13 tickers en cost_basis con formato CONID/futures/contracts antiguos (`018707934`, `BABA1`, `CMCS1`, `IBM1`, `ESH4`, `ESM4`, `MNQM1`, `M2KM5`, `EW2F4`, etc.) — son históricos, decidir si limpiar o mantener.

---

## 1. Resumen por tabla

| Tabla | Total tickers únicos | Sample categorías |
|---|---|---|
| `cost_basis` (EQUITY/BUY/SELL) | 631 | 567 STANDARD, 19 MAPPED, 17 WITH_PUNCT, 13 OTHER, 11 WITH_SPACE, 2 SUFFIXED_LOWER, 1 NUMERIC_HK, 1 MIXED_CASE |
| `cost_basis.underlying` (todos tipos) | 707 | 651 STANDARD, 19 MAPPED, 17 WITH_PUNCT, 14 OTHER, 2 WITH_SPACE, 2 SUFFIXED_LOWER, 1 NUMERIC_HK, 1 MIXED_CASE |
| `dividendos` | 260 | 246 STANDARD, 7 WITH_PUNCT, 4 OTHER, 3 MAPPED |
| `positions` | 85 | 75 STANDARD, 8 OTHER (incl. mapped), 2 WITH_PUNCT |
| `transferencias` | N/A | No tiene columna ticker — solo `account_id` |

Notas:
- `MAPPED` = ticker está mapeado en IB_MAP (e.g. `9618`, `VIS`).
- `OTHER` = ya tiene formato canónico que es resultado del IB_MAP, e.g. `BME:VIS`, `HKG:9618`. Se cuenta separado de `STANDARD` por el `:`.
- `WITH_PUNCT` = contiene `.`, `-`, `/` — incluye FX (EUR.USD, USD.HKD), REITs canadienses (NET.UN, NRR.UN), preferred (IIPR-PRA), bonds (T 3 7/8 02/15/43).

---

## 2. Tickers raw IB que deberían estar en IB_MAP (gaps)

### 2.1 Numéricos HK NO mapeados — TODOS RESUELTOS, ya están en IB_MAP

Los siguientes tickers HK numéricos están en cost_basis como raw, mientras que la `positions` ya los tiene como `HKG:0xxx`:

| Raw IB | IB_MAP target | Trades en cost_basis raw | En positions |
|---|---|---|---|
| `1` | `HKG:0001` | 3 | (no activo) |
| `700` | `HKG:0700` | 9 | (no activo) |
| `939` | `HKG:0939` | 6 | (no activo) |
| `1066` | `HKG:1066` | 4 | (no activo) |
| `1999` | `HKG:1999` | 2 | (no activo) |
| `2102` | `HKG:2102` | 2 | (no activo) |
| `2168` | `HKG:2168` | 10 | (no activo) |
| `2678` | `HKG:2678` | 21 | (no activo) |
| `3690` | `HKG:3690` | 1 | (no activo) |
| `9988` | `HKG:9988` | 6 | (no activo, BABA-W) |

**Total: 64 trades raw que NO se aplicó IB_MAP en su momento de import.** Los IB_MAP entries existen — el problema es que el flex import no los aplica al guardar `cost_basis`. Ver §6 fix sugerido.

### 2.2 Sufijos `d` Xetra NO mapeados — APLICADO

| Raw IB | Mapping correcto | Frecuencia | Underlying real |
|---|---|---|---|
| `AIRd` | `AIR` | 3 trades + 3 OPTION underlyings | Airbus (Xetra delayed) |
| `BAYNd` | `BAYN` | 2 trades + 2 OPTION underlyings | Bayer (Xetra delayed) |
| `HEN3d` | `HEN3` | 3 trades + dividendos 3 + es OPTION underlying | Henkel preferidas (Xetra) |

**APLICADO** en worker.js — añadidos a las 6 instancias de IB_MAP. Próximo flex import normalizará automáticamente.

### 2.3 Otros sospechosos (NO añadidos al map — necesitan validación)

| Ticker | Trades | Hipótesis | Acción sugerida |
|---|---|---|---|
| `018707934` | 6 EQUITY (2020-2023, precio $300-400) | IB CONID antiguo (¿VTI? ¿algun ADR?) | Investigar — buscar el corporate action que cambió el ticker |
| `BABA1` | 2 OPTION (2024) | Post-corporate-action de BABA (split/merger) | Mantener histórico, no bloquea |
| `CMCS1` | 1 OPTION | Post-corporate-action de CMCSA | Idem |
| `IBM1` | 1 OPTION | Post-corporate-action de IBM | Idem |
| `3CP` | 14 EQUITY (2020-2021, precio ~$3) | Posible polaco "3CP" o old fund. Cerrado | Mantener histórico |
| `FDJU` | 5 EQUITY (positions activo, 2100 shares) | FDJ United (Française des Jeux post-merger 2026) | Verificar Yahoo ticker → posiblemente `FDJ.PA` |

### 2.4 Futures contracts (cost_basis tipo EQUITY incorrecto)

Estos están como `EQUITY` pero son futures — bug de import flex separado:

| Ticker | Trades | Tipo real |
|---|---|---|
| `ESH4`, `ESM4`, `EW2F4` | 4+2+? | E-mini S&P futures (March/June 2024) |
| `MNQM1`, `MNQH2` | 30+4 | Micro NASDAQ futures |
| `M2KM5` | 2 | Micro Russell futures |
| `MYM  JUN 21` | 14 | Micro Dow futures |

**Acción**: estos NO deberían estar en cost_basis EQUITY. Fix separado: filtrar `assetClass === "FUT"` durante import. Marcado como TODO.

### 2.5 Bonds en cost_basis (mal categorizado)

| Ticker | Trades | Hipótesis |
|---|---|---|
| `T 3 7/8 02/15/43` | 3 | Treasury bond 3.875% mat 2043 |

**Acción**: similar a futures, debería ser categoría BOND no EQUITY. Volumen pequeño, de momento ignorar.

### 2.6 FX pairs (correctos como FOREX, NO EQUITY)

`AUD.USD`, `EUR.CAD`, `EUR.GBP`, `EUR.HKD`, `EUR.USD`, `GBP.USD`, `PLN.USD`, `USD.CAD`, `USD.HKD`, `USD.JPY`, `USD.PLN` — total ~270 trades. El filtro `tipo IN ('EQUITY','BUY','SELL')` ya los excluye, así que OK.

---

## 3. Tickers especiales con punctuation (sí son equity reales)

Verificados como reales — NO aplicar mapping, mantener:

| Ticker | Trades cost_basis | En positions | Notas |
|---|---|---|---|
| `IIPR-PRA` | 8 | 400 shares | Preferred IIPR — IB lo mapea desde `IIPR PRA` (con espacio) |
| `NET.UN` | 5 | 6000 shares | Canadian Net REIT — formato canadiense con `.UN` |
| `HOM.U` | 4 (cost) + 3 div | (no en pos) | Bird Construction USD units |
| `NRR.UN` | 4 | (no en pos) | Northwest Healthcare Properties REIT |
| `9618.SPO` | 3 | — | JD.com Hong Kong subsequent placing — operación corporativa, no requiere mapping |
| `RR.` | 3 | — | Rolls Royce LSE — `.` colgante (LSE format) |
| `BRK B` | 82 | — | Berkshire Hathaway Class B (espacio en lugar de `.`) |
| `VIS.D` | 1 div | — | Viscofan dividend right issue |
| `NUSI.OLD` | 1 div | — | NUSI ETF post-rebrand |
| `PRX.RTS` | 1 div | — | Prosus rights subscription |

Recomendación: mantener tal cual. No introducir mappings que romperían el cruce con dividendos históricos.

---

## 4. Tickers DUAL (mismo instrumento con dos formas en la misma tabla)

**Severo — implica trades duplicados o normalización incompleta.**

### 4.1 AMS / BME:AMS — DUPLICADO LITERAL

```
AMS     2026-02-17 EQUITY 100 shares @ 46.79
BME:AMS 2026-02-17 EQUITY 100 shares @ 46.79  ← mismo trade, doble fila
AMS     2026-02-26 EQUITY 100 shares @ 51.04
BME:AMS 2026-02-26 EQUITY 100 shares @ 51.04  ← idem
```

→ Borrar las 2 filas con `ticker='AMS'` (preservar canónicas `BME:AMS`). Riesgo de duplicar avg_cost calculations. **SQL**:

```sql
DELETE FROM cost_basis WHERE ticker = 'AMS' AND fecha IN ('2026-02-17','2026-02-26') AND tipo = 'EQUITY';
```

### 4.2 HEN3 vs HEN3d (mismo instrumento Henkel preferidas)

```
HEN3d 2025-10-21..2025-11-28 (3 trades, BUY 240 shares)
HEN3  2026-02-11..2026-03-11 (4 trades, mix BUY/SELL)
```

Después del fix IB_MAP, futuros imports normalizarán a `HEN3`. Para histórico:

```sql
UPDATE cost_basis SET ticker = 'HEN3' WHERE ticker = 'HEN3d';
UPDATE cost_basis SET underlying = 'HEN3' WHERE underlying = 'HEN3d';
UPDATE dividendos SET ticker = 'HEN3' WHERE ticker = 'HEN3d';
```

### 4.3 VIS / VISe / BME:VIS

```
VIS  3 trades (2025-10-13..15)  — raw IB Madrid
VISe 3 trades + 3 div            — raw IB euro feed Madrid
BME:VIS  0 trades  but 308 shares en positions — orphan
```

→ Backfill: convertir `VIS` y `VISe` a `BME:VIS`:

```sql
UPDATE cost_basis SET ticker = 'BME:VIS' WHERE ticker IN ('VIS','VISe');
UPDATE cost_basis SET underlying = 'BME:VIS' WHERE underlying IN ('VIS','VISe');
UPDATE dividendos SET ticker = 'BME:VIS' WHERE ticker IN ('VIS','VISe','VIS.D');
```

### 4.4 IAGe (29 trades) sin BME:IAG en cost_basis

`IAGe` → `BME:IAG` ya está en IB_MAP. Los 29 trades cost_basis quedan raw (igual problema HK).

### 4.5 ENGe / ENG, LOGe / LOG, REPe / REP, ISPAd / ISPA — convivencia

Cada par tiene trades en ambos lados (raw + canonical). Misma situación.

```
ENG/ENGe  6/1 trades
LOG/LOGe  5/3 trades
REP/REPe  1/2 trades
ISPA/ISPAd 9/2 trades
```

Backfill recomendado mismo patrón.

---

## 5. Orphans

### 5.1 Positions con NO entry en cost_basis (críticos — afecta cálculo P&L)

| Ticker | Shares | Name | Causa probable |
|---|---|---|---|
| `BME:VIS` | 308 | Viscofan SA | cost_basis usa `VIS`/`VISe` raw — fix §4.3 |
| `OMC` | 68.8 | Omnicom Group Inc | **Posición real sin trade history** — investigar (¿transferencia in-kind? ¿split?) |

### 5.2 Positions activos sin entry en `dividendos`

16 tickers — algunos sin dividendos legítimos (PATH, OZON sancionada, XYZ shorted), otros que SÍ pagan dividendos y deberían tener historial:

- **Sí pagan**: `KMB`, `ACN`, `LW`, `AMCR`, `WKL`, `LSEG`, `ITRK`, `SHUR`
- **Probable causa**: estos son posiciones recientes (post-2026-04 import) o están en cuenta sin Flex query reciente
- **Acción**: re-importar IB Flex con período 365d (ya marcado como pendiente en CLAUDE.md memory)

### 5.3 Cost_basis tickers sin position ni dividendo

359 tickers están en cost_basis SOLO (no posiciones activas, no dividendos). Esperado — son trades cerrados (e.g. ZIM, ZOM, 3CP). No es bug.

---

## 6. Patch sugerido para IB_MAP

### 6.1 Aplicado YA (en worker.js, 6 instancias)

```javascript
// Añadidos:
"AIRd": "AIR",
"BAYNd": "BAYN",
"HEN3d": "HEN3"
```

### 6.2 IB_MAP target final (consolidado)

```javascript
const IB_MAP = {
  // Spain (BME)
  "VIS":"BME:VIS","AMS":"BME:AMS","VISe":"BME:VIS","IAGe":"BME:IAG",
  // Hong Kong (HKG)
  "9618":"HKG:9618","1052":"HKG:1052","2219":"HKG:2219","1910":"HKG:1910",
  "9616":"HKG:9616","9988":"HKG:9988","1066":"HKG:1066","1999":"HKG:1999",
  "2168":"HKG:2168","2678":"HKG:2678","3690":"HKG:3690","700":"HKG:0700",
  "939":"HKG:0939","1":"HKG:0001","2102":"HKG:2102",
  // Spain euro feed lowercase suffixes
  "ENGe":"ENG","LOGe":"LOG","REPe":"REP","ISPAd":"ISPA",
  // Special punctuation
  "IIPR PRA":"IIPR-PRA",
  // German Xetra delayed (suffix d) — NEW
  "AIRd":"AIR","BAYNd":"BAYN","HEN3d":"HEN3"
};
```

### 6.3 Bug pendiente: el IB_MAP NO se aplica en flex import

Aunque el map existe, los HK numéricos tienen 64 trades raw en cost_basis. Esto significa que en `flexImport`/`processTrades` el código de normalización NO se ejecuta antes del INSERT. **Acción separada**: revisar el flex import handler y forzar `ticker = IB_MAP[raw] || raw` en el insert.

Localizar handler:
```bash
grep -n "INSERT INTO cost_basis" /Users/ricardogarciaontoso/IA/AyR/api/src/worker.js
```

Verificar que ANTES del INSERT haga `const t = IB_MAP[ticker] || ticker;`.

---

## 7. SQL backfill recomendado (riesgo medio — backup primero)

```sql
-- 1) Borrar duplicados literales AMS
DELETE FROM cost_basis WHERE ticker = 'AMS' AND fecha IN ('2026-02-17','2026-02-26') AND tipo = 'EQUITY';

-- 2) Normalizar HK numéricos en cost_basis
UPDATE cost_basis SET ticker = 'HKG:0001' WHERE ticker = '1';
UPDATE cost_basis SET ticker = 'HKG:0700' WHERE ticker = '700';
UPDATE cost_basis SET ticker = 'HKG:0939' WHERE ticker = '939';
UPDATE cost_basis SET ticker = 'HKG:1066' WHERE ticker = '1066';
UPDATE cost_basis SET ticker = 'HKG:1999' WHERE ticker = '1999';
UPDATE cost_basis SET ticker = 'HKG:2102' WHERE ticker = '2102';
UPDATE cost_basis SET ticker = 'HKG:2168' WHERE ticker = '2168';
UPDATE cost_basis SET ticker = 'HKG:2678' WHERE ticker = '2678';
UPDATE cost_basis SET ticker = 'HKG:3690' WHERE ticker = '3690';
UPDATE cost_basis SET ticker = 'HKG:9988' WHERE ticker = '9988';
-- Idem underlying
UPDATE cost_basis SET underlying = 'HKG:0001' WHERE underlying = '1';
-- ... (repeat por todos los HK)

-- 3) Normalizar dividendos HK
UPDATE dividendos SET ticker = 'HKG:0700' WHERE ticker = '700';
UPDATE dividendos SET ticker = 'HKG:0939' WHERE ticker = '939';
UPDATE dividendos SET ticker = 'HKG:9988' WHERE ticker = '9988';

-- 4) Sufijos d (después del IB_MAP fix, mantener consistencia histórica)
UPDATE cost_basis SET ticker = 'AIR' WHERE ticker = 'AIRd';
UPDATE cost_basis SET ticker = 'BAYN' WHERE ticker = 'BAYNd';
UPDATE cost_basis SET ticker = 'HEN3' WHERE ticker = 'HEN3d';
UPDATE cost_basis SET underlying = 'AIR' WHERE underlying = 'AIRd';
UPDATE cost_basis SET underlying = 'BAYN' WHERE underlying = 'BAYNd';
UPDATE cost_basis SET underlying = 'HEN3' WHERE underlying = 'HEN3d';
UPDATE dividendos SET ticker = 'HEN3' WHERE ticker = 'HEN3d';

-- 5) Sufijos europeos
UPDATE cost_basis SET ticker = 'ENG' WHERE ticker = 'ENGe';
UPDATE cost_basis SET ticker = 'LOG' WHERE ticker = 'LOGe';
UPDATE cost_basis SET ticker = 'REP' WHERE ticker = 'REPe';
UPDATE cost_basis SET ticker = 'ISPA' WHERE ticker = 'ISPAd';
UPDATE dividendos SET ticker = 'ENG' WHERE ticker = 'ENGe';
UPDATE dividendos SET ticker = 'LOG' WHERE ticker = 'LOGe';
UPDATE dividendos SET ticker = 'REP' WHERE ticker = 'REPe';
UPDATE dividendos SET ticker = 'ISPA' WHERE ticker = 'ISPAd';

-- 6) BME:VIS
UPDATE cost_basis SET ticker = 'BME:VIS' WHERE ticker IN ('VIS','VISe');
UPDATE cost_basis SET underlying = 'BME:VIS' WHERE underlying IN ('VIS','VISe');
UPDATE dividendos SET ticker = 'BME:VIS' WHERE ticker IN ('VIS','VISe','VIS.D');
```

**No ejecutado en este audit** — riesgo de afectar cálculos P&L y avg_cost recompute. Recomendación: ejecutar manualmente en sesión interactiva con backup `.dump` primero.

---

## 8. Resumen acciones

### APLICADO (worker.js)
- IB_MAP `AIRd`, `BAYNd`, `HEN3d` añadidos en 6 instancias

### PENDIENTE (riesgo medio, requiere validación humana)
- SQL backfill HK numéricos cost_basis raw → `HKG:0xxx` (10 tickers, 64 trades)
- SQL backfill sufijos `e`/`d`/`d` europeos → canonical (~30 trades + ~5 div)
- SQL borrado duplicado AMS / BME:AMS (4 trades)
- SQL backfill `VIS`/`VISe`/`VIS.D` → `BME:VIS`

### TODO bug investigation
- Por qué OMC tiene 68.8 shares en positions sin trade history
- Por qué `018707934` (CONID) trades old — ¿qué instrumento era?
- Fix: flex import handler debe aplicar IB_MAP antes del INSERT (es la raíz del problema)
- Re-import IB Flex 365d para rellenar dividendos faltantes en KMB/ACN/LW/etc.

### TODO future (low priority)
- Considerar mover futures/bonds (ESH4, MNQM1, T 3 7/8...) a tablas separadas o cambiar tipo a `FUT`/`BOND`
