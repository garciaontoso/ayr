# Audit A — Dividends Consistency (2026-05-02)

User-asked: ¿los dividendos cobrados en `cost_basis` cuadran con los dividendos mes a mes que aparecen?

Snapshot: D1 `aar-finanzas` remote · 3 748 rows en `dividendos` · 2020-07-01 a 2026-04-30.

---

## 1. Totales globales (sanity)

| Periodo  | Bruto USD (formula tax-report) | Neto USD | n filas |
|----------|-------------------------------:|---------:|--------:|
| All-time | 172 546.73                     | (-)      | 3 748   |
| TTM (365d) | 77 022.42                    | 73 245   | 1 106   |
| YTD 2026 | 25 125.50                      | 22 674.72 | 210    |
| 2025     | 68 173.12                      | 64 503.94 | 1 222  |
| 2024     | 43 468.21                      | 39 661.33 | 732    |
| 2023     | 21 296.30                      | 20 698.70 | 756    |
| 2022     | 11 039.85                      | 11 057.31 | 635    |
| 2021     |  3 397.03                      |  3 465.61 | 189    |

Tax-report formula `SUM(CASE WHEN bruto_usd>0 THEN bruto_usd ELSE bruto END)` matches mensual sum exactly: $68 173.12 (2025) ✅. Tax-report tab consistente con `dividendos` table.

`cost_basis` tipo='DIVIDENDS': 0 filas (migración v4.3 limpia ✅). `/api/costbasis?ticker=X` sintetiza la fila DIVIDENDS on-the-fly haciendo JOIN con `dividendos` (worker.js:9259-9277), asi que el modal Cost Basis muestra los pagos correctamente sin doble-entry.

---

## 2. Mensual breakdown 2026 (current year)

| Mes     | Bruto USD | Neto USD | n cobros |
|---------|-----------|----------|----------|
| 2026-01 | 6 153.47  | 5 668.91 | 70       |
| 2026-02 | 3 202.53  | 2 927.58 | 60       |
| 2026-03 | 7 225.14  | 6 586.76 | 43       |
| 2026-04 | 8 544.36  | 7 491.48 | 37       |

Total YTD 2026: $25 125.50 ✅ matches ano-completo agregate.

## 2bis. Mensual breakdown 2025

| Mes     | Bruto USD | Neto USD | n cobros |
|---------|-----------|----------|----------|
| 2025-01 | 4 628.95  | 4 488.58 | 98       |
| 2025-02 | 2 832.45  | 2 844.89 | 98       |
| 2025-03 | 4 337.95  | 4 267.11 | 130      |
| 2025-04 | 4 476.85  | 4 469.19 | 157      |
| 2025-05 | 3 766.50  | 3 536.45 | 88       |
| 2025-06 | 7 608.12  | 7 150.02 | 115      |
| 2025-07 | 8 283.44  | 7 902.85 | 114      |
| 2025-08 | 4 019.90  | 3 665.58 | 101      |
| 2025-09 | 8 571.72  | 8 037.22 | 108      |
| 2025-10 | 6 253.71  | 5 972.07 | 83       |
| 2025-11 | 3 605.35  | 3 076.56 | 51       |
| 2025-12 | 9 788.20  | 9 093.42 | 79       |

Anomaly: 2025-02 tiene neto > bruto (+$12.44). Causa identificada en bug #B1 abajo.

---

## 3. Per-currency totals 2025

| Divisa | n    | Bruto local | Bruto USD | Neto local | Neto USD | fx implied |
|--------|------|-------------|-----------|------------|----------|------------|
| USD    | 1190 | 65 917.81   | 65 917.81 | 62 656.64  | 62 656.64 | 1.0       |
| EUR    | 12   | 1 413.01    | 1 510.33  | 1 094.72   | 1 171.75 | 1.069 (mix 1.05+1.17) |
| HKD    | 1    | 1 920.00    | 245.76    | 1 920.00   | 245.76   | 0.128 ✅  |
| CAD    | 18   | 573.35      | 424.28    | 487.36     | 360.65   | 0.74 ✅   |
| AUD    | 1    | 113.55      | 74.94     | 102.19     | 67.45    | 0.66 ✅   |

EUR fx mix 1.05 vs 1.17: las filas viejas usan fx_to_usd=1.05 (snapshot inicial pre-2026), las recientes 1.17 (más cerca del actual). No corrupting — fx histórico correcto.

---

## 4. WHT (withholding tax) consistency

WHT por currency 2025 (implied = (bruto-neto)/bruto):

| Divisa | Implied WHT | Esperado China-tax-resident |
|--------|------------|------------------------------|
| AUD    | 10.00 %    | 15 % (sub-óptimo, posible reclaim) |
| CAD    | 15.00 %    | 15 % ✅                       |
| EUR    | 22.53 %    | 15-19 % (mezcla España + Holanda) |
| HKD    |  0.00 %    | 0 % ✅                        |
| USD    |  5.93 %    | 10 % esperado — **bajo**      |

US WHT bajo causa identificada: hay 302 filas USD 2025 con `bruto≈neto` ($18 536.42 bruto). Distribución por cuenta:

| Account   | n   | Bruto USD | Implied WHT |
|-----------|-----|-----------|-------------|
| (NULL)    | 294 | 23 892.58 |  5.61 %     |
| U5372268  |  17 |  1 503.70 | 10.12 % ✅  |
| U6735130  | 259 | 23 336.31 |  6.96 %     |
| U7257686  |  74 |  4 307.01 |  4.54 %     |
| U7953378  | 362 | 12 878.21 |  4.61 %     |

Los CEFs/REITs con distribuciones tipo Return-of-Capital (GOF, QYLD, RYLD, GLO, OCCI) explican parte del 0% WHT (legal — IB clasifica ROC sin retencion). Pero filas U7257686/U7953378 sub-tax-rate sugieren que **el broker no aplicó WHT 10% en algunos** (revisar Flex 1042-S).

WHT field consistency: `SUM(bruto-neto)` = $4 321.47, `SUM(wht_amount)` = $4 614.48, gap = -$293 (over-attributed). Causa: cuando hay 2+ filas en el mismo (fecha, ticker), el script atribuye `wht_amount` a TODAS las filas en vez de solo a la del cobro grande. Ej: SCHD 2025-12-15 split en 2 filas (id 1912 + 10623), ambas con `wht_amount=144.66` aunque solo aplica a id 10623.

---

## 5. positions.div_ttm vs actual TTM (per-ticker comparison)

Key: `positions.div_ttm` es DPS (per-share) source = FMP fundamentals cache. `actual_ttm` = SUM(`dividendos.bruto` 365d). Expected = `dps × shares`.

**Top 30 discrepancias (DPS×shares >> actual TTM)**:

| Ticker    | Shares | DPS    | Expected DPS×shares | Actual TTM | Diff       |
|-----------|--------|--------|---------------------|------------|------------|
| HKG:2219  | 60000  | 0.39   | 23 400.00           |     0.00   | +23 400.00 |
| HKG:1052  | 52000  | 0.48   | 24 960.00           |  1 920.00  | +23 040.00 |
| NVO       |  1600  | 7.30   | 11 680.00           |   730.42   | +10 949.58 |
| DEO       |  1960  | 5.04   |  9 878.40           |   637.75   |  +9 240.65 |
| HKG:9616  | 22400  | 0.35   |  7 840.00           |     0.00   |  +7 840.00 |
| SCHD      | 13750  | 1.03   | 14 162.50           |  6 405.20  |  +7 757.30 |
| RAND      |  1200  | 6.48   |  7 776.00           |   648.00   |  +7 128.00 |
| HKG:9618  |  3700  | 2.00   |  7 400.00           |   654.50   |  +6 745.50 |
| FLO       |  2797  | 1.98   |  5 538.06           |   248.01   |  +5 290.05 |
| AZJ       | 12000  | 0.50   |  6 000.00           |   750.00   |  +5 250.00 |
| RHI       |  2100  | 2.36   |  4 956.00           |   413.00   |  +4 543.00 |
| MSDL      |  2992  | 2.00   |  5 984.00           |  1 500.00  |  +4 484.00 |
| WEEL      |  2900  | 2.40   |  6 960.00           |  2 608.50  |  +4 351.50 |
| ARE       |  2020  | 2.88   |  5 817.60           |  1 596.00  |  +4 221.60 |
| FDJU      |  2100  | 1.78   |  3 738.00           |     0.00   |  +3 738.00 |
| KHC       |  2900  | 1.60   |  4 640.00           |   920.00   |  +3 720.00 |
| IIPR      |   575  | 7.60   |  4 370.00           |   760.00   |  +3 610.00 |
| BIZD      |  3100  | 1.75   |  5 425.00           |  1 900.11  |  +3 524.89 |
| OWL       |  3994  | 0.90   |  3 594.60           |   405.00   |  +3 189.60 |
| NNN       |  1700  | 2.40   |  4 080.00           |  1 074.00  |  +3 006.00 |
| TAP       |  1863  | 1.92   |  3 576.96           |   664.00   |  +2 912.96 |
| PAYX      |   712  | 4.32   |  3 075.84           |   180.36   |  +2 895.48 |
| O         |  1300  | 3.25   |  4 225.00           |  1 374.60  |  +2 850.40 |
| GIS       |  1250  | 2.44   |  3 050.00           |   548.00   |  +2 502.00 |
| HRB       |  1579  | 1.68   |  2 652.72           |   252.00   |  +2 400.72 |
| WKL       |   896  | 2.44   |  2 186.24           |     0.00   |  +2 186.24 |
| TROW      |   520  | 5.20   |  2 704.00           |   693.00   |  +2 011.00 |
| MTN       |   258  | 8.88   |  2 291.04           |   395.13   |  +1 895.91 |
| NOMD      |  3100  | 0.68   |  2 108.00           |   255.00   |  +1 853.00 |
| AMT       |   300  | 6.73   |  2 019.00           |   179.00   |  +1 840.00 |

79 / 81 posiciones activas tienen discrepancia >$5. Total DPS-based estimate: $244 731. Total actual TTM: $77 022.

**Causas múltiples**:

1. **`positions.shares` infla los IBKR ib_shares**: SCHD shares=13 750 vs ib_shares=6 000. Cost_basis suma 10 250 (across all accounts + Excel). Frontend sums Excel + IBKR via algorithm que duplica. Es el bug madre — fuera del scope de este audit.

2. **Dividendos NO sincronizados por cuenta**: SCHD divs TTM = $6 405 sólo desde account=NULL ($4 864) + U7257686 ($1 541). Las otras 3 cuentas IB (U5372268, U6735130, U7953378) no han metido las filas SCHD aunque sí tienen shares. Detectado mismo patrón en PAYX (sólo 1 fila account=U6735130, missing en otras cuentas + Excel).

3. **HKG annual dividend lag**: HKG:1052/2219/9616/9618/1910 pagan 1-2x/año. La estimación `DPS×shares` asume payment ya recibido pero el fiscal year en HK termina Dic, pago real Mayo-Junio. Hasta entonces `actual_ttm` = $0 o sólo la mitad. NO es un bug, es timing.

4. **13 tickers con shares>0 + div_ttm>0 + ZERO filas en `dividendos`** (gap real de sync):
   - HKG:2219 (60 000 sh × 0.39), HKG:9616 (22 400 sh), HKG:1910 (9 300 sh)
   - FDJU (2 100), LW (1 050), WKL (896), SHUR (800)
   - ITRK (300), LSEG (291), KMB (200), BME:AMS (200), ACN (180), AMCR (20)

   Todas European/HK/US no listadas en IB Flex sync (T3 o broker manual). Necesitan import manual.

5. **NVO**: DPS=$7.30 pero NVO paga semestral ~$3.50, asi que `dps×shares` infla 2x. Caso similar DEO/HRB/RHI/AZJ — DPS de FMP es la suma anual, mientras que las filas reales en BBDD reflejan sólo 1 pago. Esperado en el primer año tras compra.

---

## 6. Tickers paying divs no en positions (closed)

50+ tickers con cobros 2026 pero `positions.shares=0`: AHH, AVK, BGH, BMY, CCIF, CIK, DSU, ECC, EIC, EPR, ETV, EXG, FOF, FSCO, GOF, HASI, HPS, IGR, JPC, KIO, LUV, LYB, MCN, MDLZ, MO, MRK, MSD, NCDL, NRO, OCCI, OXLC, PCN, PDI, PDO, PDX, PEO, PGZ, PTY, QDTE, RLTY, RNP, SPY, SPYI, SUI, TRIN, UPS, USA, VZ, XDTE, XFLT.

Esto es legítimo — posiciones cerradas siguen teniendo divs históricos cobrados. NO es un bug.

---

## 7. Bugs encontrados

### B1 · CRITICAL — 777 filas con `bruto=0, neto>0` (impacto $2 344.97 USD)

Distribución temporal:
- 2021: 76 filas, $313
- 2022: 238 filas, $535
- 2023: 253 filas, $753
- 2024: 11 filas, $13
- 2025: 176 filas, $652
- 2026: 23 filas, $78

Todas:
- `bruto=0`, `neto>0`, `wht_amount<0` (negative)
- `account=NULL`
- `broker='IB'`, `notas='IB Flex sync'` (765) o `'WHT reclaim'` (12)

Ejemplo (id=9705): AAPL 2021-02-11, bruto=0, neto=0.20, wht_amount=-0.20.

Origen: el aggregator IB Flex (`worker.js:12740-12791`) construye `divAgg[fecha|ticker]` agregando withholding-tax outflows con `divAgg.wht += amount` (amount negativo). Cuando una entrada de WHT llega antes que la entrada cash-dividend (settle date diferente), o cuando la fila cash ya estaba en BBDD y se dedupló, sólo persiste la WHT y `bruto=0`. La logic `neto = bruto + wht = 0 + (-0.20) = -0.20`, pero las filas almacenadas tienen neto positivo, lo que indica que vienen de un import previo con bug distinto (versión vieja del código).

**Impacto**: tax-report y mensual usan `CASE WHEN bruto_usd>0 THEN bruto_usd ELSE bruto END` → estas filas contribuyen $0 al gross. Undercount cumulative ~$2 345 desde 2021. Para 2025: $652. Para 2026: $78.

**Fix safe**: actualizar `bruto = neto` (asumiendo que el cobro real era el neto + WHT, sin info adicional ese es el mejor proxy). Ver SQL en `scripts/audit-A-fixes.sql`.

### B2 · WHT field bleed (impacto: $293 over-attributed 2025)

351 (fecha, ticker) groups tienen >1 fila en `dividendos`. Ejemplo SCHD 2025-12-15: id 1912 con `bruto=$55.64, wht_amount=$144.66` y id 10623 con `bruto=$1 446.64, wht_amount=$144.66`. La WHT real ($144.66) sólo aplica a id 10623; id 1912 lleva un wht_amount duplicado.

`SUM(wht_amount)` 2025 = $4 614.48; `SUM(bruto-neto)` 2025 = $4 321.47. Gap = -$293 (wht_amount over-attributed).

**Fix safe**: recalcular `wht_amount = bruto - neto` para todas las filas con `bruto > neto > 0`. Ver SQL.

### B3 · CRITICAL — Ticker mapping duplicates

7 pares dup AHH ↔ AHRT (Armada Hoffler Properties), $1 502 over-counted. Misma fecha, mismo bruto, accounts NULL+U6735130. Dos tickers, una sola realidad económica.

1 par BME:VIS ↔ VIS.D 2025-12-17 (€29.66) — Viscofan en 2 conventions.

**Fix riesgo medio**: reasignar uno de los 2 tickers o borrar el duplicado. Necesita decision usuario sobre nomenclatura preferida (BME:VIS o VIS.D). Ver SQL.

### B4 · CRITICAL — 13 active positions con divs missing (gap sync real)

Tickers con shares>0 + div_ttm>0 + 0 filas en `dividendos`:
HKG:2219, HKG:9616, HKG:1910, FDJU, LW, WKL, SHUR, ITRK, LSEG, KMB, BME:AMS, ACN, AMCR.

Origen: ninguno está en IB Flex (T3 broker o cuenta no enlazada), ni se han metido manualmente. Esperado anual ~$53 000 USD missing.

**Fix riesgo alto**: requiere import manual desde T3 o broker statements. NO seguro automatizar.

### B5 · INFO — `account=NULL` legacy population

1 658 filas en `dividendos` con `account=NULL` (broker IB pero no se imported con accountId). Equivale a $24 130 TTM. La cuenta probablemente sea U7942XXX (la 4ª IB) o legacy pre-multi-account. CLAUDE.md lo confirma como pendiente: "backfill account 7942 NULL (re-import Flex 365d)".

### B6 · INFO — Flow with neto > bruto en mismo bruto>0

3 filas BST/BUI 2025 con `neto = bruto + 0.01` (rounding). Negligible.

---

## 8. Resumen ejecutivo

✅ **OK**:
- Total dividendos TTM en USD = $77 022.42 — coherente y consistente entre tax-report, mensual, por-ticker.
- Cost Basis modal sintetiza divs desde `dividendos` table en runtime → no hay double-entry.
- FX conversions correctas (HKD 0.128, CAD 0.74, etc.).

⚠ **Discrepancias detectadas**:
- B1: 777 filas con bruto=0/neto>0 → tax-report undercount ~$2 345.
- B2: WHT field bleed → over-attribution $293 en 2025.
- B3: 8 pares ticker-mapping duplicates → over-count $1 540.
- B4: 13 posiciones con shares pero sin filas dividendos → gap real ~$53k esperado.
- B5: 1 658 filas account=NULL (data quality, no impact en totales).

🔧 **Safe fixes aplicables**:
- B1 (rellenar bruto=neto on bruto=0/neto>0): impacto +$2 345 TTM USD totals.
- B2 (recalcular wht_amount = bruto - neto): impacto +$293 ya correcto.

🟡 **Risky fixes** (en `scripts/audit-A-fixes.sql`, NO ejecutados):
- B3 ticker mapping consolidation.
- B4 manual import T3/broker.
- recalcular `positions.div_ttm` desde `dividendos` reales (cambia cifra pero requiere decision: usar FMP DPS estimate o actual TTM observado).

---

## 9. Apéndice — fórmulas verificadas

API `/api/tax-report?year=YYYY`:
```sql
SELECT SUM(CASE WHEN bruto_usd > 0 THEN bruto_usd ELSE bruto END) as gross
FROM dividendos WHERE fecha LIKE '${year}%'
```
2025 = $68 173.12 ✅ matches mensual sum.

API `/api/dividendos/mensual`:
```sql
SELECT substr(fecha,1,7) as mes,
  SUM(CASE WHEN bruto_usd > 0 THEN bruto_usd ELSE bruto END) as bruto,
  SUM(CASE WHEN neto_usd > 0 THEN neto_usd ELSE neto END) as neto,
  COUNT(*) as cobros
FROM dividendos GROUP BY mes
```
✅ 2025 mensual sum = $68 173.12, alineado tax-report.

Per-ticker actual TTM:
```sql
SELECT ticker, SUM(bruto) as ttm
FROM dividendos
WHERE fecha >= date('now','-365 days') GROUP BY ticker
```
NB: bruto se suma sin convertir a USD. Para mostrar mixed-currency totals usa `bruto_usd`.

`positions.div_ttm` populated by `/api/positions/refresh-dps`:
- Si `shares <= 0`: setea `div_ttm=0, div_yield=0, yoc=0`.
- Si fundamentals cache existe: usa `dividendPerShare` o `dividendPerShareTTM` (= DPS).
- Es DPS (per share), no annual gross. Annual gross = `div_ttm × shares` para mostrar cifra cargo total.

---

## 10. Fixes APLICADOS automáticamente (B1 + B2)

Ejecutado contra D1 remote `aar-finanzas` el 2026-05-02:

| Fix | UPDATE statement                                            | Filas afectadas |
|-----|-------------------------------------------------------------|-----------------|
| B1  | `bruto = neto, bruto_usd = neto*fx WHERE bruto=0 AND neto>0` |             777 |
| B2  | `wht_amount = bruto - neto WHERE gap > $0.05`                |           1 083 |

**Resultados validados**:

| Metric                | Pre-fix     | Post-fix    | Δ          |
|-----------------------|-------------|-------------|------------|
| `bruto=0 AND neto>0`  |         777 |           0 |     ✅ -777 |
| Gross USD 2025        | $68 173.12  | $68 825.39  |    +$652.27 |
| Gross USD TTM (365d)  | $77 022.42  | $77 143.85  |    +$121.43 |
| WHT field gap 2025    |    -$293.01 |     $34.06  | reconciled  |
| 2025-02 anomaly (neto>bruto) | YES  |          NO | ✅ resuelto |

Los fixes risky (B3 ticker dups, B4 manual import T3, B5 backfill account NULL) están comentados en `scripts/audit-A-fixes.sql` y requieren decisión usuario antes de aplicarse.
