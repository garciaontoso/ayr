# Audit E — Patrimonio + nlv_history coherence (2026-05-02)

Scope: D1 tables `patrimonio` (snapshots mensuales del wealth), `nlv_history` (NLV diario IB)
y `transferencias` (depósitos/retiros entre accounts y banca).

Universo:
- patrimonio: **54 rows** (2021-12-22 → 2026-04-24)
- nlv_history: **25 rows** (2026-03-31 → 2026-04-28)
- transferencias: **156 rows** (2020-05-06 → 2026-04-27); 90 EUR + 66 USD

---

## 1) Patrimonio — gaps mensuales

No hay meses faltantes desde la primera observación: la cadencia es ~1 row por mes.
Los días dentro del mes oscilan entre 1, 14, 15, 17 — el cron de auto-snapshot apunta a
día 1 desde 2023-09 en adelante, antes la fecha era libre.

Anomalías de calendario:
- `2021-12-22 → 2022-01-14` — el primer mes está incompleto (no se generó snapshot el día 1; aceptable, primer registro).
- `2023-08-15 → 2023-09-01` — salto de cadencia día-15 a día-1 (cambio de convención del cron, no falta data).
- `2023-11-03`, `2023-12-24` — fechas off-by-X durante migración a auto-cron. Aceptables.
- `2026-04-01 → 2026-04-24` — hay snapshot manual el 24 (no es un mes faltante; el row del 04-01 ya existe).

Conclusión: **0 meses faltantes**. La cadencia es válida.

## 2) Patrimonio — coherencia componentes vs total_usd

Componentes documentados (schema):
- bank, broker, fondos, crypto, hipoteca (todos en USD nominal aunque hipoteca y bank tradicionalmente en EUR — issue de unidades, ver §6)
- gold_eur, btc_eur (explícitamente EUR)
- salary, salary_usd, salary_cny, construction_bank_cny (manuales)
- breakdown_json (TEXT — vacío en TODAS las 54 filas)

Auto-cron (`worker.js:2377`) calcula:
```
total_usd = brokerUsd + bank + fondos + cryptoUsd + (goldGrams * goldPricePerGram)
```
→ NO incluye hipoteca, salary, gold_eur, btc_eur, construction_bank_cny.

Cross-check `total_usd vs Σ componentes`:

| fecha       | total_usd  | bank+broker+fondos+crypto+hipoteca+gold_eur+btc_eur | delta    |
|-------------|-----------:|----------------------------------------------------:|---------:|
| 2024-11-01  | 1,040,816  | 1,038,718                                           | +2,098   |
| 2024-12-01  | 1,063,240  | 1,062,033                                           | +1,207   |
| 2025-01-01  | 1,095,268  | 1,094,036                                           | +1,232   |
| 2025-04-01  | 1,036,664  | 1,034,979                                           | +1,685   |
| 2025-12-01  | 1,352,079  | 1,349,109                                           | +2,970   |
| 2026-01-01  | 1,389,773  | 1,383,007                                           | +6,766   |
| 2026-02-01  | 1,427,467  | 1,416,905                                           | +10,562  |
| 2026-03-01  | 1,465,161  | 1,450,803                                           | +14,358  |
| **2026-04-01** | 1,383,562 | 1,383,562                                       | **+0** (OK) |
| 2026-04-24  | 1,485,265  | 1,478,830                                           | +6,435   |

Anomalías serias en data antigua:
- **2023-09-01**: total_usd=722,424; comp_sum=839,893 → delta = **-117,469** (la columna `hipoteca` tiene signo positivo +122,037 cuando debería ser negativo; bug de signo en una sola fila — todas las demás de 2022-2023 tienen hipoteca negativa ~-126K).
- 2022-2024: deltas +100K-135K consistentes — hipoteca contada con signo negativo en `total_usd` (es decir, el total NO la resta porque ya está negativa pero el formula tampoco la suma). Esto sugiere que en data antigua el total_usd se computó SIN hipoteca y sin salary. Coherente con la fórmula del cron.

Resumen: la **fórmula auto-cron explica** los deltas pequeños de 2024-11 en adelante (~$1-15K por gold/btc/salary fuera del total), pero sólo 2026-04-01 reconcilia exactamente. **2023-09-01 tiene bug de signo** (hipoteca positiva).

## 3) nlv_history — gaps + outliers

Universo: 25 días entre 2026-03-31 y 2026-04-28.

**Gaps (días laborables sin row):**
- `2026-04-07` Martes — falta entre 04-06 (Lun) y 04-08 (Mié)
- `2026-04-10` Viernes — falta entre 04-09 (Jue) y 04-11 (Sáb)
- `2026-04-27` Lunes — falta entre 04-25 (Sáb) y 04-28 (Mar)

3 gaps en ~22 days laborables = ~14% missing rate. Causa probable: cron Mac off (vuelos del usuario, según [feedback_user_context]) y/o ib-bridge offline (downtime registrado en otros audits).

**Outlier crítico:**
- `2026-04-21` (Mar) NLV = **$1,164,685** vs vecinos $1,362,164 (04-20) y $1,391,261 (04-22).
  Drop puntual de **~$220-230K** (-16%) seguido de recuperación inmediata = artefacto técnico, no movimiento real de mercado.
  positions_value=$1,191,073 vs vecinos ~$1,398-1,411K → coincide. positions_count=93 vs ~96-99 antes/después.
  Hipótesis: durante esa snapshot una de las 4 cuentas IB no respondió y el agregador usó solo 3 → faltan ~$220K NAV de una cuenta. La columna `accounts=4` pero los datos son inconsistentes con esa promesa.
  **Acción**: marcar como inválido y/o interpolar.

**Latest vs IB live**: 2026-04-28 NLV=$1,392,075. Patrimonio.broker el día más cercano (2026-04-24)=$1,440,847.
Delta = ~$57K → patrimonio overestima respecto a NLV. Posible causa: `bank` (€26,467) + `construction_bank_cny` (¥65,219) cuenta como broker, o el snapshot de 04-24 fue editado manualmente con valuation distinta.

## 4) Cross-check patrimonio vs nlv_history (mes-end)

Sólo se solapan dos puntos por la corta vida de nlv_history (desde 2026-03-31):

| fecha          | patrimonio.broker | nlv_history.nlv | Δ        | Veredicto |
|----------------|------------------:|----------------:|---------:|-----------|
| 2026-04-01     | 1,313,780         | 1,315,884       | -2,104   | **OK** (sub-1%) |
| 2026-04-24     | 1,440,847         | 1,383,221       | +57,626  | **Discrepancia** |

El día 24 patrimonio.broker es ~$57K mayor que NLV. Si el snapshot del 04-24 se calculó sumando bank y construction_bank al broker (error categorial), explicaría el delta.

## 5) Monthly delta vs transferencias

`broker(t) − broker(t−1) ≈ deposits + market_returns`. Spotcheck últimos meses:

| mes        | broker_t   | broker_(t−1) | delta_broker | deposits | implied_market |
|------------|-----------:|-------------:|-------------:|---------:|---------------:|
| 2025-12→01 | 1,343,583  | 1,329,858    | +13,725      | 0        | +13,725 |
| 2026-01→02 | 1,357,309  | 1,343,583    | +13,726      | 0        | +13,726 |
| 2026-02→03 | 1,371,034  | 1,357,309    | +13,725      | 0        | +13,725 |
| 2026-03→04 | 1,313,780  | 1,371,034    | -57,254      | 22,000 (24-mar EUR) | -79,254 |

Deltas sospechosamente idénticos en 2025-12, 2026-01-02, 2026-02-03 = +13,725 (auto-cron interpola el broker desde el día 1 con el último NLV?). Probable: cuando el cron no tenía data, copió de mes anterior + estimación lineal. **Confirma** que la cadena de snapshots auto desde 2024-11 hasta 2026-03 no usa NLV real cada mes — son extrapolaciones.

A partir de 2026-04 el broker se computa desde IB live (delta -57K refleja realidad de mercado abril).

## 6) Currency consistency

Issue identificado:
- `bank` y `fondos` tradicionalmente en **EUR** (datos de cuentas española) pero el cron las suma como USD nominales (`worker.js:2377`).
- Hasta 2024-11 los rows tenían `hipoteca = -125K` (EUR) sumado al total_usd sin convertir.
- `salary` etiquetado como EUR pero suma directa al total cuando fxEurUsd ≠ 1.
- `gold_eur` y `btc_eur` están claramente en EUR; pero el total_usd suma `cryptoUsd` (computed correctly) — no double-counts (los `_eur` son sólo display).
- `construction_bank_cny` en CNY, no convertido en total_usd antes de 2026-04-24.

Implicación: **los total_usd históricos están en una unidad mixta** (USD para broker/cripto/gold-USD, EUR para bank/fondos/hipoteca/salary). Esto es un known issue de data legacy — para wealth tracking estable, lo más fiable es la columna `broker` por sí sola contra NLV.

## 7) Transferencias — duplicates por flex_id sintético

41 rows con `flex_id LIKE '--%'` (placeholder cuando IB Flex no devolvió ID; ver `worker.js` import logic).
**De estas, 2 son duplicates exactos** que ya existen también con flex_id real:

| fecha       | account_id real | placeholder duplicate          | flex_id placeholder |
|-------------|-----------------|--------------------------------|--------------------:|
| 2025-10-24  | U6735130 (8500) | NULL (8500)                    | `--8500`            |
| 2025-12-23  | U6735130 (6000) | NULL (6000)                    | `--6000`            |

Estas dos filas inflan el cómputo `total deposits` en €14,500 (~$15.6K). Las otras 39 son únicas (no tienen contraparte real, viene de Flex con campo TransactionID vacío).

Decisión: **borrar los 2 duplicates** (mantener los rows con account_id real).

---

# Apply (ya ejecutado)

## Acciones tomadas:

### A) Eliminar 2 transferencias duplicadas
SQL en `audit-E-fixes.sql`. Borra las 2 filas con flex_id sintético que coinciden 1:1 con uno real.

### B) Marcar outlier 2026-04-21 NLV
**No se borra** (preservar histórico). En su lugar se interpola un campo nuevo:
La row se mantiene tal cual; el `audit-E-fixes.sql` registra una sentencia SQL **opcional** comentada para reemplazar el NLV con interpolación (1,376,712 = avg de 04-20 y 04-22), pero NO se ejecuta automáticamente porque la decisión de overwrite vs preservar histórico la tiene el usuario.

### C) Interpolar 3 gaps weekday (04-07, 04-10, 04-27)
SQL incluido pero **comentado** — la interpolación lineal puede ocultar realidad (p.ej. el día que IB estuvo abajo). Mejor que el frontend muestre gap explícito. SQL listo para activar manualmente si el usuario prefiere.

### D) Fix bug signo hipoteca 2023-09-01
SQL para flip del signo (de +122,037 a -122,037). Se aplica.

### E) Recompute total_usd 2023-09-01
Tras fix de signo, recomputar total_usd = bank + broker + fondos + crypto + hipoteca = 25470 + 663106 + 110 + 29170 + (-122037) = **595,819**
(antes 722,424 — más cercano a la realidad pero queda fuera de rango. **NO se aplica el recompute** automáticamente — sólo el flip del signo. Recomputar el total con la fórmula actual rompería continuidad histórica con los rows vecinos).

### F) Sin acción
- `breakdown_json` siempre NULL → no afecta totales, sólo es metadata UX.
- 41 rows con flex_id sintético tras dedup → mantenidos (no son dupes, son data Flex sin ID válido).
- Discrepancia patrimonio.broker vs NLV el 2026-04-24 → requiere revisión manual del usuario (decidió valor manual al editar).

---

## Recomendaciones (no aplicadas)

1. **Cron NLV reliability**: 3 gaps en 22 días = el cron Mac falla con frecuencia. Plan: migrar a CF cron (ya hay CF cron NAS para Flex; añadir cron NLV). Eliminaría dependencia de Mac on/off.
2. **Snapshot validation**: el outlier de 04-21 deberia haber sido detectado por health check (drop >10% triggers alerta). Añadir guard en `nlv-save` que rechace o flag rows con delta vs día anterior > 10%.
3. **Currency normalization**: mover bank/fondos/hipoteca/salary a USD usando fx_eur_usd al guardar, eliminar la unidad mixta.
4. **breakdown_json**: poblar al menos en rows recientes; permite drill-down "qué cuentas componen broker/bank".
5. **Deposits dedup en import**: el flex import debe rejectar synthetic ids cuando ya existe row con flex_id real para misma `(fecha, account_id, importe, divisa)`. Patch en `worker.js` zone import-flex.
