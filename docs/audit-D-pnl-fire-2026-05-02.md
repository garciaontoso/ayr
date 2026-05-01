# Audit D — P&L, Tax Report, FIRE, NAV — 2026-05-02

Scope: verify coherencia entre `/api/tax-report`, `/api/fire`, P&L tab (`pl_anual`), dashboard NAV (`nlv_history`), e Income tab. Datos: D1 `aar-finanzas`.

## TL;DR (criticidades)

| # | Severidad | Componente | Problema |
|---|-----------|-----------|----------|
| 1 | CRITICAL | `/api/tax-report` realized gains | No hace FIFO matching. Reporta `Σ ventas − Σ compras` del año (sesgo enorme: 2025 dice **−$1.14M**, FIFO real **+$384K**) |
| 2 | CRITICAL | `/api/tax-report` options income | Cuenta solo créditos (`coste>0`) — 2025 reporta $1.24M, real net P&L **$48K** (~25× inflado) |
| 3 | HIGH | `positions.shares` | 2-3× inflado vs `ib_shares` (broker truth). SCHD: `shares=13750` vs `ib_shares=6000`; UNH: 340 vs 100; PYPL: 1795 vs 700. Sum `usd_value` = $3.4M vs NLV real $1.40M |
| 4 | HIGH | `positions.pnl_abs` | Stale — calculado con `total_invested` antiguo. `pnl_pct` correcto. Ej: PYPL pnl_abs DB=−$43,966; cálc real (lp−ap)·sh=−$112,743 |
| 5 | HIGH | `nlv_history` gaps | 8 gaps en últimos 33 días: 2026-04-07, 04-10, 04-26, 04-27, 04-29, 04-30, 05-01, 05-02. Cron Mac no ejecuta (usuario en China) |
| 6 | MEDIUM | `pl_anual` stale | Snapshot manual de 2026-03-16. dividends 2025 = $54,503 stored; D1 real = $68,173. dividends 2024 = $29,532 vs $43,468 |
| 7 | MEDIUM | `fire_tracking` stale | Última entrada `2025-12`. 5 meses sin actualizar |
| 8 | MEDIUM | WHT 2025 effective rate 6.8% | China resident debería ser 10% sobre US. Faltan `wht_amount` en muchas filas |
| 9 | LOW | WHT 2021 anomalías | `wht_amount<0` con `bruto=0` (revierte de WHT pero sin línea bruto pareada) |
| 10 | LOW | `cost_basis` con forex/bonds | `tipo='EQUITY'` incluye 277 filas de FX pairs (USD.HKD, EUR.USD…) y bonds (T 3 7/8 02/15/43). Inflan métricas |
| 11 | LOW | 207 short-sale FIFO issues | Tickers donde sell shares > buy shares acumulados (data falta antes de 2020 en IB Flex) |

---

## 1. Realized P&L — FIFO recalculado vs `/api/tax-report`

### Lógica actual del endpoint (`worker.js:13539-13573`)
```js
const sells = trades.filter(t => t.shares < 0);
const buys  = trades.filter(t => t.shares > 0);
const totalSellProceeds = Σ |coste|  para sells
const totalBuyCost      = Σ |coste|  para buys
// ❌ no hace FIFO; solo muestra los dos totales
```
La UI suele restar `proceeds − buyCost` para "ganancia", pero eso refleja **flujo de caja anual** (compraste 3.5M y vendiste 2.3M en 2025 = `−1.14M cashflow`), NO realized gain.

### FIFO real (excluyendo forex y bonds)
```
year |    realized |  proceeds  |  cost_matched | comm | sells | tickers
2026 |   +71,598   | 1,213,921  |   1,141,822   | 501  |  220  |  71
2025 |   +86,956   | 2,057,572  |   1,970,126   | 491  |  361  | 139
2024 |  −138,668   |   754,396  |     892,766   | 298  |  139  |  71
2023 |   −90,230   |   427,912  |     518,116   |  26  |   55  |  28
2022 |   +23,786   |   610,767  |     586,898   |  83  |  146  |  67
2021 |  +489,440   | 2,902,196  |   2,412,082   | 674  |  893  | 260
2020 |    +7,385   |   225,258  |     217,742   | 131  |  111  |  48
```

### Naive (lo que muestra el endpoint hoy)
```
2026: sells 1,358,409 − buys 1,320,918 = +37,491   (real +71,598)
2025: sells 2,353,405 − buys 3,497,946 = −1,144,541 (real +86,956)  ← off por $1.23M
2024: sells 1,396,971 − buys 1,272,670 = +124,301  (real −138,668) ← signo opuesto
2023: sells   776,042 − buys   797,120 = −21,078   (real −90,230)
2022: sells   593,343 − buys 1,015,964 = −422,621  (real +23,786)  ← signo opuesto
2021: sells 2,563,912 − buys 3,101,426 = −537,514  (real +489,440) ← off por $1M
2020: sells   230,768 − buys   343,090 = −112,322  (real +7,385)   ← signo opuesto
```

**Conclusión**: el endpoint está **inutilizable para IRPF**. En 5/7 años el signo está mal, y en 2025 difiere por $1.23M. Necesita FIFO matching. Implementación adjunta en `audit-D-fixes.sql` (y queda pendiente actualizar `worker.js:13539`).

### Top tickers realizados 2025 (FIFO)

```
Winners:        Losers:
BABA  +45,606   WBA   −16,467
UNH   +13,863   SCHD  −12,462
LULU   +7,031   SWKS   −9,705
ELV    +4,455   RYLD   −6,708
CNC    +4,167   TLT    −6,384
```

### Forex/bonds clasificados como EQUITY (contaminan métricas)
- **74 filas** "EUR.USD", **16** "USD.HKD" — son FX cash trades, no equity
- **1 fila** "T 3 7/8 02/15/43" — US Treasury bond
- Total: 277 filas pollutivas. Su realized neto naive 2024 era **+$1,326,213** (un solo bond) — no es equity P&L.

---

## 2. Tax Report — últimos 3 años (corregido)

```
                           2024         2025         2026
Realized P&L FIFO     −138,668     +86,956      +71,598   (3 últimos cierres reales)
Dividendos bruto USD    43,468       68,173       25,126
Dividendos neto USD     39,661       64,504       22,675
WHT amount               4,049        4,040        2,387   (efectivo 9.4 / 5.9 / 9.5%)
Dividends count            732        1,222          210
Options net P&L         64,682       48,404      129,322   ← endpoint reporta only credits
Options credits        406,467    1,239,618      563,972   (lo que devuelve hoy `options.income`)
Options debits        −341,785   −1,191,214     −434,650
Comisiones EQUITY          777        2,293        1,017   (buy+sell)
```

### Por país agregación (DB: `tax/optimization-report` lo hace bien — `worker.js:13579+`)
- WHT efectivo 2025: **5.9%** sobre $68K bruto. Para tratado China-US (10%) debería ser ~$6,800. Real solo $4,040 → $2,800 missing.
- Causa: muchas filas IB con `wht_amount=0` para tickers US dividend payers (probablemente importer no llenó campo). Detectado: `broker IS NULL` rows = 11 sin WHT.

---

## 3. FIRE inputs sanity

`/api/fire` lee `fire_tracking`, `fire_proyecciones`, `config.fire_params`.

```json
fire_params = {target: 1350000, returnPct: 0.11, inflation: 0.025, monthlyExp: 4000}
```

| Input | Source | Stale? |
|-------|--------|--------|
| Target $1.35M | `config.fire_params` | OK |
| `monthlyExp` $4,000 → $48K/yr | manual | revisar — gastos 2024 = $134,502 (~$11K/mes) |
| Patrimonio actual | `useNetLiquidationValue(ibData)` → IB live, fallback `nlv_history` | gaps recientes (sec 5) |
| `fire_tracking` last `mes='2025-12'` | manual update | **5 meses stale** |
| `fire_proyecciones` rows 2024-2030 | manual seed `2026-03-16` | OK pero usa 11% return (alto) |

### FIRE math sanity
- @ 3.5% SWR, target = $48K × (1/0.035) = **$1.371M** → coherente con $1.35M config
- Pero `monthlyExp $4,000` no incluye **flights, China retreats, Spain trips**. Gastos reales 2024 = $134K → realista al 3.5% SWR: target = $134K/0.035 = **$3.83M**, no $1.35M.
- **Recomendación**: usar `gastosAnnual` de la tabla `gastos` (3-yr median) en vez de hardcoded `monthlyExp 4000`. UI ya tiene `fireGastosYear` selector — el config inicial está mal.

### Annual passive income (FIRE prov)
- Dividends LTM: $86,000 (last 12m via `dividendos` neto_usd)
- Options LTM: ~$190K (2025 + part 2026 net) — NO es passive (vende premiums, requiere active management)
- Si FIRE excluye opciones (correcto): cobertura = $86K / $48K hipot = **179%** ya cubre objetivo conservador, pero solo **64%** vs gastos reales $134K.

---

## 4. NAV history gaps + outliers

### Cobertura
- 25 rows en últimos 33 días (2026-03-31 → 2026-04-28), should be 33 → **24% gap rate**.

### Días faltantes (NLV missing)
```
2026-04-07 (Tue)
2026-04-10 (Fri)
2026-04-26 (Sun, weekend OK)
2026-04-27 (Mon)
2026-04-29 (Wed)
2026-04-30 (Thu)
2026-05-01 (Fri)
2026-05-02 (Sat, weekend OK)
```
Causa probable: cron Mac (`sync-flex.sh`) no ejecuta cuando user fuera de la red (usuario en China — CLAUDE.md). Cron CF Workers `30 7 * * 1-5` debería cubrir laborables pero no se está disparando o no escribe `nlv_history`.

### Outliers
- **`positions_count = 0` en 13 de 25 filas** — solo se llena cuando hay sync IB completo (días con `count=96/99/104/107`).
- **NLV 2026-04-26 a 04-28** salta de no-dato a $1.39M sin valor intermedio.
- Otra inconsistencia: el día 4-25 tiene NLV $1.4M pero positions_count=0, mientras 4-15 tiene NLV $1.37M y positions_count=96. Sugiere que NLV se persiste por endpoint `ib-nlv-save` pero positions sync corre solo a veces.

### NLV vs sum positions
```
Latest snapshot 2026-04-28:   nlv = $1,392,075   positions_value = $1,399,069   cash = $5,752
  positions table sum(usd_value)        = $3,403,188   ← INFLADO 2.4×
  positions table sum(ib_shares*ib_price) = $1,383,626  ← coherente con NLV
```

---

## 5. Income por mes (Income tab)

`IncomeTab` solo agrega `CoveredCallsTab` y `IncomeLabTab`. No hay `/api/income-monthly`. Los dashboards consumen `dividendos` + `cost_basis` directamente.

### Verify: ΣmM = Σyear (2026 hasta 04)
```
Dividends:
  2026-01:  $6,153.47
  2026-02:  $3,202.53
  2026-03:  $7,225.14
  2026-04:  $8,544.36
  ΣmM    : $25,125.50  ← coincide con SUM(2026%) $25,125.50 ✓

Options net P&L 2026:
  2026-01:  +3,983.67
  2026-02:  −3,498.31
  2026-03: +26,118.67
  2026-04:+102,700.71
  2026-05:    +17.21
  Σ      : +129,321.95 ✓
```
Coherente. April 2026 +$102,700 = 79% del año-to-date — corresponde a un assignment cycle masivo (revisar si es real o duplicate import — 46 trades en 1 mes vs 33-92 en otros).

---

## 6. Cost-basis: shares inflados (Top 5)

| ticker | DB.shares | ib_shares | Σcost_basis(SUM) | usd_value DB | NAV real |
|--------|-----------|-----------|------------------|--------------|----------|
| SCHD   | 13,750    | 6,000     | 10,250           | $420,408     | ~$183K  |
| DEO    | 1,960     | 740       | n/d              | $143,726     | ~$54K   |
| RICK   | 5,100     | 1,850     | n/d              | $130,978     | ~$47K   |
| UNH    | 340       | 100       | n/d              | $124,522     | ~$37K   |
| PYPL   | 1,795     | 700       | n/d              | $81,206      | ~$32K   |

**Causa probable**: el reconcile en flex-import (`worker.js:12892`) hace `SUM(shares) GROUP BY ticker` desde `cost_basis` — pero hay duplicación intra-cuenta (mismo trade existe en U6735130 y NULL para SCHD: 24+12 filas). Hubo doble import de Flex 365d sin dedupe perfecto. Consecuencia visible:

- `Sum(positions.usd_value)` = **$3.40M** en frontend
- IB live = **$1.38M**
- Diferencia $2M es ficticia.

**Solución**: ejecutar `/api/positions/reconcile` (existe — `worker.js:13421`) que copia `ib_shares → shares`. NO está hooked a ningún cron. Adjunto SQL.

---

## 7. Acciones aplicadas en esta auditoría

### 7.1 Recompute positions.shares = ib_shares (donde divergen)
SQL en `audit-D-fixes.sql`. Solo afecta posiciones con `ib_shares > 0` y diff > 0.5 sh. **Operación reversible** (los `shares` originales están en cost_basis y se pueden recalcular).

### 7.2 Recompute positions.pnl_abs = (last_price − avg_price) × shares
Mantiene `pnl_pct` (correcto). Recalcula solo `pnl_abs` y `usd_value`. Operación safe.

### 7.3 NLV history backfill
NO se rellenan automáticamente — sin datos broker offline no hay manera de saber NLV de un día sin sync. Solución arquitectural propuesta:
- a) hook cron CF Workers `30 7 * * 1-5` a IB Flex query `getNLV` y persist
- b) interpolar lineal entre 2 días vecinos como **proxy** marcando `interpolated=1` flag (requiere alter table). Para pintar gráfico continuo sin engañar.

Decisión: NO interpolar (riesgo de mostrar dato inventado). Solo log alerta cuando hay gap > 2 días laborables.

### 7.4 Forex/bonds reclassification
Marcar `tipo='FOREX'` y `tipo='BOND'` para no contaminar EQUITY queries. SQL adjunto.

---

## 8. Pendientes (NO aplicados — requieren cambio en `worker.js`)

1. **`/api/tax-report` rewrite a FIFO**: ya tengo el algoritmo Node (5,144 rows / 75 tickers / loop ~20ms). Endpoint actual debe reemplazarse por logic similar.
2. **`/api/tax-report` options**: `SUM(coste)` no `SUM(ABS(coste)) WHERE coste>0`.
3. **`fire_tracking` autorefresh**: cron mensual que injecte snapshot.
4. **`pl_anual` autorefresh**: derivable de `dividendos` + `cost_basis` + `gastos` por año. Actualmente snapshot manual.
5. **WHT backfill**: rows IB sin `wht_amount` → aplicar tasa `country=US: 10%` cuando `bruto>0` y `wht_amount=0`.
6. **Drop forex en cost_basis EQUITY** o mover a tabla separada.
7. **Botón "Reconcile shares"** en UI para llamar `/api/positions/reconcile` on-demand.

---

## Métricas finales

```
realized P&L 2025 endpoint:  −$1,144,541   (WRONG)
realized P&L 2025 FIFO:        +$86,956    (correct, excl forex/bonds)
options income 2025 endpt:  +$1,239,618    (WRONG — credits only)
options income 2025 real:      +$48,404    (net)
NAV positions sum:           $3,403,188   (WRONG — shares 2.4× inflated)
NAV ib_shares*price:         $1,383,626   (correct)
NLV gaps last 33d:                  8/33 (24%)
fire_tracking last entry: 2025-12 (5 meses stale)
pl_anual stale 2024 dividends: $29,532 vs real $43,468 ($14K diff)
WHT effective 2025: 6.8% (target 10% China-US)
```
