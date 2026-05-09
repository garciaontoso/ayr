# BIZD — VanEck BDC Income ETF

> Análisis experto didáctico — actualizado mayo 2026
> Sector: Financial Services — Asset Management Income (FMP cache 2026-05-09)
> Precio: $12.90 (FMP cache 2026-05-09) | AUM: $1.567B (FMP cache 2026-05-09 marketCap) | Dividendo TTM: $1.7231 (FMP cache 2026-05-09 lastDividend) | Yield: 13.36% (cálculo según FMP cache 2026-05-09 = $1.7231 / $12.90)
> Beta: 0.43 (FMP cache 2026-05-09) | 52w range: $11.97 – $16.95 (FMP cache 2026-05-09) | Inception: 2013-02-12 (FMP cache 2026-05-09 ipoDate) | Exchange: AMEX (FMP cache 2026-05-09)
> CIK: 0001137360 (FMP cache 2026-05-09) | CUSIP: 92189F411 (FMP cache 2026-05-09) | ISIN: US92189F4110 (FMP cache 2026-05-09)
> Sponsor: VanEck (FMP cache 2026-05-09 issuer profile)

---

## TL;DR (resumen ejecutivo en 3 frases)

BIZD es un **ETF pasivo gestionado por VanEck** (FMP cache 2026-05-09 issuer field) que replica el **MVIS US Business Development Companies Index (MVBDCTRG)** según descripción FMP 2026-05-09 — un cesto ponderado por market cap de BDCs cotizados en EEUU. Ofrece un **yield current 13.36% según cálculo FMP cache 2026-05-09** ($1.7231 lastDividend / $12.90 precio), entre los más altos del mercado en vehículos cotizados líquidos, pero con **dos peajes serios**: (a) **expense ratio efectivo elevado por la cláusula contable AFFE** que la SEC obliga a divulgar bajo Form N-1A (regla SEC general aplicable a fondos de fondos, [UNSOURCED] al porcentaje exacto reportado por VanEck — el último prospecto público que se citaba sin verificación local rondaba 12.7%), y (b) **ciclicidad alta** — los BDCs sufren mucho en recesiones de crédito y BIZD lleva todas las que existen, las buenas y las malas. **Verdict: HOLD para income alto en cartera diversificada (max 2-3% de portfolio según asignación propia razonada), pero entender que en un credit crunch puede caer 30-40% rápido (drawdown COVID 2020 ≈ -45% según memoria histórica del producto, [UNSOURCED] dato exacto del fact sheet VanEck)**.

Tu cartera A&R: 0 sh actualmente (snapshot positions API 2026-05-09). El análisis aplica como evaluación general del vehículo, no posición existente.

---

## ¿Qué hace exactamente BIZD? (didáctico)

BIZD es un **ETF pasivo** (FMP cache 2026-05-09 isEtf=true) gestionado por VanEck (FMP cache 2026-05-09) que sigue el **MVIS US Business Development Companies Index (MVBDCTRG)** según descripción del prospecto FMP cache 2026-05-09. El índice incluye los BDCs cotizados en US bursátiles, ponderados por market cap (regla general de índices MVIS, [UNSOURCED] exacta methodology document del index provider).

Para entender BIZD, primero hay que entender qué es un BDC.

### ¿Qué es un BDC?

Un **Business Development Company** (BDC) es un vehículo de inversión cotizado, regulado por la **Investment Company Act of 1940 (sección 54)** del SEC (regla SEC general, codificada en 15 U.S.C. § 80a-2 et seq.), que **presta dinero a empresas medianas privadas** (mid-market companies, típicamente con EBITDA entre $5M y $100M según convención de mercado de private credit, [UNSOURCED] umbral exacto SEC).

Características clave de los BDCs (todas reglas SEC generales o convenciones de mercado, citables vía Investment Company Act 1940 o filings de cada BDC):

- **Préstamos secured (con garantía real)**: la mayoría son first-lien o second-lien sobre activos del prestatario. Esto reduce pérdidas en default vs deuda unsecured (regla general crédito secured, [UNSOURCED] al ratio exacto first-lien vs second-lien del cesto BIZD agregado).
- **Variable rate (tipo variable)**: la mayoría de los préstamos están a SOFR+spread (típicamente SOFR + 5.5-7.5% según convención mercado private credit, [UNSOURCED] al spread agregado exacto del cesto BIZD). Cuando suben los tipos, los BDCs ganan más (mecánica financiera básica de variable-rate lending).
- **Distribución obligatoria 90% del income imponible**, igual que un REIT — no pagan corporate tax si distribuyen (Investment Company Act § 54 / Subchapter M IRS, regla SEC y IRS general).
- **Apalancamiento permitido hasta 2:1 debt/equity** (Small Business Credit Availability Act 2018 amendment a Investment Company Act, regla SEC general; la mayoría andan 0.9-1.3× según observación del sector, [UNSOURCED] al ratio agregado exacto del cesto BIZD).
- **Externally managed o internally managed**: la mayoría son externamente gestionados, pagan una "management fee" (~1.5% del AUM) y un "incentive fee" (~17.5% del net investment income por encima de un hurdle rate) según convención de mercado BDC, [UNSOURCED] a los ratios exactos del management agreement de cada BDC subyacente.

Los BDCs nacen como vehículo para que los inversores retail accedan a private credit, una clase de activo tradicionalmente reservada a institucionales. Es un sustituto de bonos high-yield pero con yield superior (típicamente 8-12% vs 5-7% de HY según observación de mercado, [UNSOURCED] yield exact comparison con índice HY al cierre 2026-05) y mayor riesgo de default por concentración.

### Composición de BIZD

El ETF tiene aproximadamente 25 BDCs en cartera según convención del MVBDCTRG index (estimación propia derivada del index methodology general de MVIS, [UNSOURCED] al holdings count exacto en la fecha de reporting más reciente del fact sheet VanEck).

Las top holdings habituales del MVBDCTRG (estimación propia de composición típica en un índice market-cap weighted de BDCs US, todas verificables vía fact sheet VanEck pero sin acceso live al PDF):

1. **ARCC** (Ares Capital) — el "blue chip" del sector, históricamente el holding número uno por market cap (estimación propia razonada — ARCC es el BDC US más grande por market cap según FMP rankings BDC sector; [UNSOURCED] al weight exacto en BIZD a fecha más reciente; cifra histórica que se citaba era ~17% del fondo).
2. **OBDC** (Blue Owl Capital BDC) — típicamente top-3 por market cap entre BDCs US (estimación propia, [UNSOURCED] al weight exacto en BIZD).
3. **FSK** (FS KKR Capital), **MAIN** (Main Street Capital), **HTGC** (Hercules Capital), **GBDC** (Golub Capital BDC), **PSEC** (Prospect Capital), **GAIN** (Gladstone Investment), **BXSL** (Blackstone Secured Lending), **MSDL** (Morgan Stanley Direct Lending) — todos BDCs cotizados US habituales del cesto MVBDCTRG (estimación propia razonada; [UNSOURCED] a los weights exactos).

Esta lista tiene cierta concentración: top 3 ≈ 35-40%, top 10 ≈ 65-75% según patrón típico de índices BDC market-cap weighted (estimación propia, [UNSOURCED] al breakdown exacto del fact sheet VanEck).

### ¿Por qué un ETF en lugar de comprar BDCs individuales?

**Pros**:

- **Diversificación instantánea** — un solo BDC en problemas no destruye toda la posición.
- **Sin esfuerzo de selección** — no hay que estudiar cada portfolio de loans.
- **Liquidez decente** — volumen diario 4.43M shares (FMP cache 2026-05-09 volume), promedio 4.32M (FMP cache 2026-05-09 averageVolume), AUM $1.567B (FMP cache 2026-05-09 marketCap), spreads ajustados típicos de ETF con AUM > $1B (regla general microestructura ETF).
- **Reinversión automática de dividendos** posible vía DRIP (regla general broker DRIP, [UNSOURCED] a confirmación de elegibilidad en VanEck/IB).

**Contras**:

- **Expense ratio nominal bajo PERO AFFE elevado** — los BDCs subyacentes tienen sus propios management+incentive fees, que el SEC obliga a sumar al expense ratio del ETF que los contiene (Form N-1A regla general SEC) → expense ratio efectivo total superior al 10% según reportes históricos públicos del producto, [UNSOURCED] al porcentaje exacto reportado en el último prospecto VanEck disponible.

  Esto **NO es una doble comisión** (no se paga dos veces); es una contabilización SEC para informar (regla general SEC AFFE disclosure). Los $1.7231 anuales de dividendo de BIZD según FMP cache 2026-05-09 ya están **netos** de esas fees subyacentes — si comprases los BDCs individualmente cobrarías lo mismo (las fees están en los BDCs, no en el ETF).

- **No puedes optimizar fiscalmente**: los dividendos de BDCs son **no qualified** (es ordinary income), tributan al marginal rate (37% para residencia US alta según IRS 2025 brackets, regla IRS general). Esto pasa igual con BIZD que con BDCs individuales.

---

## ¿Cómo se valoran los BDCs (y por extensión BIZD)?

Esto es **crítico** para entender qué estás comprando.

### NAV (Net Asset Value)

El **NAV** es el valor contable por acción del BDC = (Total Assets − Total Liabilities) / Shares Outstanding. Como un BDC es básicamente una cartera de loans, el NAV refleja el valor "fair value" de esos loans (mark-to-model trimestral, ajustado por defaults y deterioros — regla general accounting BDCs bajo ASC 820 fair value measurement).

**P/NAV** (Price-to-NAV) es la métrica principal para BDCs:

- **Trading at NAV (1.0×)** = valor justo según el management.
- **Trading at premium (>1.0×)** = mercado cree que el BDC ganará rentabilidad superior al cost of equity.
- **Trading at discount (<1.0×)** = mercado anticipa pérdidas en la cartera de loans, recortes de dividendo, o problemas de gobernanza.

Multiples típicos según observación del sector (todos [UNSOURCED] a precios exactos a fecha actual sin acceso a 10-Q de cada BDC, son rangos históricos del sector):

- BDCs premium (ARCC, MAIN, HTGC) cotizan típicamente 1.10-1.40× NAV (estimación propia de rangos históricos).
- BDCs middle-tier (OBDC, GBDC, BXSL) cotizan típicamente 0.95-1.10× (estimación propia de rangos históricos).
- BDCs en problemas o externally-managed con alto fee load: 0.70-0.95× (estimación propia de rangos históricos).

BIZD como ETF cotiza muy cerca de la suma ponderada de los NAVs de sus holdings (es la naturaleza arbitrada del ETF, regla general microestructura ETF) — su "P/NAV" implícito está cerca de 1.0× (estimación propia, [UNSOURCED] al P/NAV agregado calculado en el fact sheet VanEck más reciente).

### NII (Net Investment Income)

**NII** = Interest Income recibido − Operating Expenses (incluye management+incentive fees y interest on the BDC's own debt). Definición estándar BDC accounting bajo ASC 946 (Investment Companies).

Es el equivalente al "earnings" de un BDC, y es el numerador para calcular dividend coverage:

- **NII coverage ratio** = NII per share / Dividend per share. Quieres > 100%.
- ARCC tipicamente: NII y dividendo histórico daban coverage 110-120% según trimestres recientes (estimación propia, [UNSOURCED] a las cifras exactas del 10-Q ARCC más reciente).
- OBDC: coverage típicamente 100-110% según trimestres recientes (estimación propia, [UNSOURCED] a las cifras exactas del 10-Q OBDC más reciente — ver análisis OBDC.md del usuario para datos cross-reference).

### Non-accrual rate

Cuando un loan no está pagando intereses (es decir, está en distress), el BDC lo pone en **non-accrual** (no se reconoce el interés como income — regla general accounting BDCs). Quieres este % bajo:

- Sano: < 1% del portfolio.
- Worry: 1-3%.
- Crisis: > 3%.

BIZD agregado típicamente está entre 1.5-2.5% de non-accrual rate según patrón histórico del sector (estimación propia, [UNSOURCED] al non-accrual agregado del fact sheet VanEck a la fecha más reciente).

---

## Calidad del producto (¿es buen ETF?)

### Pros estructurales

1. **Diversificación interna** — ~25 BDCs (estimación propia, [UNSOURCED] al holdings count exacto), ningún default individual destruye más de 4-5% del fondo (estimación propia razonada de la concentración top-holding típica).
2. **Liquidez razonable** — volumen diario 4.43M shares (FMP cache 2026-05-09), promedio 4.32M (FMP cache 2026-05-09), AUM $1.567B (FMP cache 2026-05-09 marketCap). Spreads ajustados típicos de ETF AUM > $1B.
3. **Expense ratio fund-only bajo** según reportes públicos históricos del producto, [UNSOURCED] al ratio exacto en el último prospecto disponible. La cifra que se citaba sin verificación local era 0.40%.
4. **Track record largo** desde 2013-02-12 (FMP cache 2026-05-09 ipoDate), sobrevivió COVID 2020 con drawdown agudo (~-45% según memoria histórica del producto, [UNSOURCED] al low exacto del fact sheet VanEck) pero recuperó en 12-15 meses (regla general de recuperación de productos credit en post-COVID).

### Contras estructurales

1. **AFFE elevado** parece terrorífico aunque ya descrito arriba — los inversores retail novatos lo malinterpretan y venden. La cifra exacta del AFFE en el último prospecto está [UNSOURCED] sin acceso al PDF VanEck reciente, históricamente rondaba 12-13%.
2. **No es high-quality**: incluye TODOS los BDCs incluso los peores (PSEC tiene historial de recortes de dividendo y mala gobernanza según memoria sectorial, [UNSOURCED] al historial exacto de cuts), pero está en el índice porque tiene market cap suficiente para entrar al MVBDCTRG.
3. **Beta a credit cycle alta** — en una recesión severa los defaults suben de 1% a 5-8% rápido (regla general crédito en recesión, [UNSOURCED] al pico exacto en COVID 2020 del agregado BDC), y BIZD puede caer 40-50%.
4. **No active management** — no se sale de un BDC en problemas, lo lleva hasta el rebalance trimestral del MVBDCTRG (regla general index ETF, [UNSOURCED] a la frecuencia exacta de rebalance del index methodology MVIS).
5. **Beta vs SPY baja**: 0.43 (FMP cache 2026-05-09 beta) — sorprende para un sector cíclico, pero refleja que los flujos de income amortiguan vs equity beta cuando no hay credit event mayor. La beta vs HY index es probablemente mucho mayor (estimación propia razonada).

**Veredicto Calidad**: 6/10 (escala propia subjetiva 1-10) — buen vehículo de exposición sectorial pero con flaws estructurales (incluye BDCs malos, alta beta credit cycle, AFFE elevado).

---

## Dividendo — yield real vs trampa

**Yield current**: 13.36% (cálculo según FMP cache 2026-05-09 = $1.7231 lastDividend / $12.90 price).

¿Es sostenible?

- Los BDCs subyacentes en agregado tienen NII coverage ~100-115% según patrón sectorial (estimación propia, [UNSOURCED] al coverage agregado exacto del fact sheet VanEck más reciente).
- Non-accrual rate ~1.5-2.5% según patrón sectorial (estimación propia, [UNSOURCED] al exacto reciente).
- En entorno de tipos altos (Fed Funds rate >4% en 2025-2026 según data macro pública, [UNSOURCED] al nivel exacto al cierre fecha actual), los BDCs ganan más (variable rate loans), apoyando dividendos.

¿Cuándo se rompe?

- **Recesión con default cycle**: si default rate sube a 4-5%, NII cae 15-25% (regla general matemática de spread compression más loan losses), dividendos se recortan.
- **Compresión de spreads**: si por exceso de competencia los BDCs prestan a SOFR+4% en lugar de SOFR+6.5%, NII cae (mecánica financiera básica).
- **Caída tipos a cero**: el variable rate se vuelve menos rentable, menor NII (mecánica financiera básica).

Histórico de distribuciones BIZD (cifras anuales aproximadas, [UNSOURCED] sin acceso a la tabla exacta dividends del fact sheet VanEck — los números siguientes son del análisis previo del usuario y se mantienen como estimación propia razonada):

- 2018: ~$1.50 (estimación propia, [UNSOURCED]).
- 2019: ~$1.55 — modesto crecimiento (estimación propia, [UNSOURCED]).
- 2020: ~$1.20 — recorte COVID (estimación propia, [UNSOURCED]).
- 2021: ~$1.40 — recuperación (estimación propia, [UNSOURCED]).
- 2022: ~$1.55 — subida con tipos (estimación propia, [UNSOURCED]).
- 2023: ~$1.85 — peak por high rates (estimación propia, [UNSOURCED]).
- 2024: ~$1.78 (estimación propia, [UNSOURCED]).
- TTM: $1.7231 (FMP cache 2026-05-09 lastDividend, dato verificado).

**Patrón claro**: variable y procíclico, con beta alta a tasas de interés y a ciclo crediticio. **No es Aristocrat**.

**Veredicto Dividendo**: 6/10 (escala propia subjetiva) — yield muy alto, pero con volatilidad alta. No para "pago fijo" en jubilación; sí como complemento de yield en cartera diversificada.

---

## Valoración / valoración del producto

¿Está caro o barato BIZD? Como es ETF, la respuesta depende de si los BDCs subyacentes están caros o baratos en agregado.

Métricas weighted del cesto BIZD (todas estimación propia razonada, [UNSOURCED] al fact sheet VanEck exacto):

- **P/NAV agregado**: ~1.0× (estimación propia razonada del rango histórico del sector, [UNSOURCED]).
- **Yield agregado**: 13.36% (cálculo según FMP cache 2026-05-09, dato verificado).
- **NII coverage agregado**: ~105-110% (estimación propia razonada, [UNSOURCED]).
- **Non-accrual rate agregado**: ~1.5-2.5% (estimación propia razonada, [UNSOURCED]).

**Lectura**: BIZD está valorado **fairly** según rangos históricos del sector. No es ganga ni burbuja. Es un yield play cuyo precio sube/baja con el ciclo crediticio.

**Cuándo comprar BIZD**:

- Cuando el spread HY (high-yield bonds) se ha ampliado significativamente vs base case (>800bp ICE BofA US High Yield Index OAS, regla general señal de pánico crediticio que típicamente revierte en 6-18 meses según patrón histórico).
- Cuando hay rotación masiva fuera de BDCs por noticias macro pero los fundamentales subyacentes son sanos (situational, no quantitative).

**Cuándo evitar/vender**:

- Cuando los spreads están comprimidos (<400bp HY OAS) — señal de complacencia, downside asimétrico.
- Cuando el non-accrual rate empieza a subir trimestre tras trimestre (early warning credit cycle turn).
- Cuando ves recortes de dividendos en BDCs grandes (ARCC, OBDC) — el dominó empieza por arriba.

**Posicionamiento técnico al precio actual**: BIZD cotiza en $12.90 (FMP cache 2026-05-09), -23.9% desde el high 52w de $16.95 (FMP cache 2026-05-09 → cálculo: 12.90/16.95 − 1 = -0.239). Está cerca del low 52w $11.97 (FMP cache 2026-05-09), apenas +7.8% por encima (cálculo según FMP cache 2026-05-09 = 12.90/11.97 − 1). Esto sugiere **estrés sectorial actual** — no es momento de pánico full pero sí de cautela.

---

## Riesgos principales

1. **Recesión USA**: caída masiva en NAV (-30 a -40% históricamente posible según drawdowns COVID 2020 y 2008-2009 del sector BDC, [UNSOURCED] a los low exactos por producto).
2. **Compresión spreads private credit**: si llegan demasiados nuevos competidores (Apollo, Blackstone, Owl están todos lanzando BDCs nuevos según observación del sector, [UNSOURCED] al exact AUM new entrants), los BDCs ganarán menos por loan.
3. **Bajada de tipos rápida**: si Fed corta a 2-3%, los BDCs ganarán menos en variable rate (mecánica financiera), dividendos pueden recortarse.
4. **Concentración en private equity-sponsored loans**: la mayoría de loans BDC son a empresas backed por PE (sponsors). Si los PE sponsors pasan apuros, los loans se deterioran (regla general dynamics PE-sponsored credit).
5. **Externally-managed structure conflicts**: en muchos BDCs el incentive fee crea incentivos perversos para tomar más riesgo (regla general agency cost en externally-managed funds). BIZD lleva todos, los buenos y los malos.
6. **Liquidez en crisis**: en marzo 2020 BIZD cayó cerca de -45% en pocas semanas según memoria histórica del producto ([UNSOURCED] al exacto), los spreads bid-ask se ampliaron mucho según observación de microestructura ETF en stress event.
7. **Riesgo divisa**: BIZD cotiza en USD (FMP cache 2026-05-09 currency=USD). Para un inversor con base en EUR (estimación según contexto usuario residencia España vacacional), exposición full USD añade volatilidad cambiaria sobre el yield.

---

## Catalizadores positivos

1. **Continuación de tipos altos 2026**: BDCs siguen ganando bien en variable rate (mecánica financiera básica).
2. **Crecimiento del private credit market**: el sector ha crecido significativamente desde 2010 según research público de PE/credit firms (estimación propia razonada, [UNSOURCED] al AUM total exacto a fecha actual). Trillones desplazándose de bancos tradicionales a BDCs y direct lending.
3. **Default rate persistentemente bajo**: si la economía evita recesión severa, NII coverage aguanta.
4. **Rotación de retail hacia high-yield income**: en environment de inflación moderada, los retail buscan yield, BIZD se beneficia (regla general flow dynamics).

---

## Riesgo IA y disrupción tech

BDCs prestan a empresas mid-market en sectores variados — manufacturing, healthcare, software, services. La **IA podría tener doble efecto**:

- **Negativo**: empresas mid-market en sectores que la IA disrupta (BPO, certain services) podrían ver sus EBITDA caer y default rates subir. Algunos loans BDC son a estos sectores (estimación propia, [UNSOURCED] al breakdown exacto de portfolio por sector del agregado BIZD).
- **Positivo**: empresas SaaS y tech mid-market apoyadas por IA podrían crecer más rápido, mejor pagadores. BDCs especializados en tech (HTGC) se beneficiarían (estimación propia razonada).

Net effect en BIZD: probablemente neutral a ligeramente negativo.

**Riesgo IA BIZD**: BAJO-MEDIO (escala propia subjetiva). La cartera está suficientemente diversificada por sector para amortiguar shocks idiosincráticos IA.

---

## Veredicto final

**Decisión**: **HOLD si ya tienes / pequeña posición OK si quieres yield income**.

**Por qué NO sobreponderar**:

- Yield 13.36% atractivo (cálculo según FMP cache 2026-05-09) pero volátil — el producto ha visto drawdowns ~-45% en COVID según memoria histórica ([UNSOURCED]), recuperó pero el camino fue traumático.
- AFFE elevado asusta a inversores nuevos (aunque es contabilidad SEC) — [UNSOURCED] al ratio exacto en último prospecto, históricamente >10%.
- En un credit downturn, la pérdida de capital eclipsa años de yield (regla general riesgo asimétrico high-yield credit).

**Por qué sí tener algo**:

- Yield sostenible 10-13% en escenarios normales (estimación propia razonada del rango histórico).
- Diversificación interna (~25 BDCs según estimación propia, [UNSOURCED] al exacto) reduce idiosyncratic risk.
- Liquidez decente para entrar/salir — volumen diario 4.43M (FMP cache 2026-05-09 volume), AUM $1.567B (FMP cache 2026-05-09 marketCap).
- Variable rate los protege parcialmente vs tasas altas (mecánica financiera).
- Beta vs SPY baja: 0.43 (FMP cache 2026-05-09 beta), suaviza correlación con equity broad.

**Para un dividendero**:

- Position size: máximo 2-3% del portfolio total (asignación propia razonada, no concentrar en este vehículo).
- Mejor combinar con BDCs individuales de calidad (ARCC, MAIN) en lugar de solo BIZD.
- Si tienes OBDC o MSDL individuales, añadir BIZD es duplicar exposure (~15-20% del BIZD ya son OBDC + MSDL en agregado según estimación propia, [UNSOURCED] al weight exacto).

**Si cumpliera estas condiciones, sería buy más fuerte (precios concretos)**:

1. Spread HY OAS > 700bp ICE BofA index (señal pánico, threshold según convención de mercado credit signals).
2. Non-accrual rate trending DOWN consecutivos trimestres (early all-clear signal).
3. P/NAV agregado < 0.90× (descuento real).
4. Precio BIZD < $11.50 (-10.8% sobre precio actual $12.90 según FMP cache 2026-05-09 = umbral propio razonado para entrada agresiva).

**Precio para BUY agresivo**: < $11.50 (umbral propio razonado para sub-low52w $11.97 + margen seguridad adicional).
**Precio para ACCUMULATE**: $11.50 - $13.00 (rango propio razonado).
**Precio para HOLD**: $13.00 - $15.50 (rango propio razonado).
**Precio para TRIM**: $15.50 - $16.95 (rango propio razonado, hacia high 52w FMP cache 2026-05-09).
**Precio para SELL**: > $16.95 (high 52w FMP cache 2026-05-09 = señal de complacencia full).

---

## Datos clave (mayo 2026) — referencia rápida

- **Precio**: $12.90 (FMP cache 2026-05-09)
- **Marketcap / AUM**: $1.567B (FMP cache 2026-05-09 marketCap field, ETF — el marketCap ≈ AUM por construcción ETF)
- **Volumen diario**: 4.43M shares (FMP cache 2026-05-09 volume)
- **Volumen promedio**: 4.32M shares (FMP cache 2026-05-09 averageVolume)
- **52w range**: $11.97 - $16.95 (FMP cache 2026-05-09 range)
- **Beta vs SPY**: 0.43 (FMP cache 2026-05-09)
- **Last dividend (TTM)**: $1.7231 (FMP cache 2026-05-09 lastDividend)
- **Yield current**: 13.36% (cálculo según FMP cache 2026-05-09 = $1.7231 / $12.90)
- **Holdings count**: ~25 BDCs (estimación propia razonada, [UNSOURCED] al exacto)
- **Top 10 holdings**: ~65-75% del fondo (estimación propia razonada, [UNSOURCED] al exacto)
- **Expense ratio (fund only)**: ~0.40% (memoria histórica del producto, [UNSOURCED] al exacto en último prospecto)
- **AFFE (acquired fund fees)**: >10% (memoria histórica del producto, [UNSOURCED] al exacto en último prospecto — la cifra que se citaba era ~12.3%)
- **Distribuciones**: trimestrales (regla general ETF de income, [UNSOURCED] a la frequency exacta confirmada por VanEck)
- **Inception**: 2013-02-12 (FMP cache 2026-05-09 ipoDate)
- **Currency**: USD (FMP cache 2026-05-09)
- **Tax**: ordinary income (no qualified dividend) — IRS regla general BDC distributions
- **Exchange**: AMEX (FMP cache 2026-05-09)
- **CIK SEC**: 0001137360 (FMP cache 2026-05-09 — este es el CIK del trust VanEck issuer)
- **CUSIP**: 92189F411 (FMP cache 2026-05-09)
- **ISIN**: US92189F4110 (FMP cache 2026-05-09)
- **Sector**: Financial Services (FMP cache 2026-05-09)
- **Industry**: Asset Management - Income (FMP cache 2026-05-09)
- **Index tracked**: MVIS US Business Development Companies Index — MVBDCTRG (FMP cache 2026-05-09 description field)

### Sources used

- FMP cache 2026-05-09 (profile, price, marketCap, beta, range, lastDividend, volume, averageVolume, ipoDate, CIK, CUSIP, ISIN, exchange, sector, industry, description, isEtf flag, currency).
- FMP cache 2026-05-09 (live price endpoint /api/prices?live=1 confirma price $12.90 con prevClose $13.03, change -0.13, fiftyTwoWeekHigh $16.95, fiftyTwoWeekLow $11.97).
- Investment Company Act of 1940 § 54 (regla SEC general aplicable a BDCs, codificada en 15 U.S.C. § 80a-2 et seq.).
- Small Business Credit Availability Act 2018 (amendment 2:1 leverage para BDCs, regla SEC general).
- IRS Subchapter M (90% distribution requirement, regla IRS general aplicable a BDC y RIC).
- ASC 820 fair value measurement, ASC 946 Investment Companies (US GAAP general accounting BDCs).
- Análisis previo del usuario (BIZD versión 6 fechada 2026-05-03 con coverage 23%) como base estructural; los datos numéricos del análisis previo se han re-etiquetado como [UNSOURCED] o "estimación propia razonada" cuando no hay verificación FMP/regla SEC directa.
- Cross-reference: análisis OBDC.md, MSDL.md del usuario (también BDCs en BIZD, datos sectoriales coherentes).

---

## Apéndice — Comparativa BDC sector y conceptos avanzados

### Subgrupos dentro de BDCs

No todos los BDCs son iguales. Hay aproximadamente 5 categorías que el inversor debería distinguir (taxonomía propia razonada):

1. **Mega-cap blue chip**: ARCC, OBDC, MAIN. Track record largo, NAV stable, dividendos sostenidos. Cotizan premium 1.10-1.40× NAV (rango histórico, [UNSOURCED] al exacto a fecha actual).

2. **Mid-cap quality**: GBDC, BXSL, TSLX, BBDC. Buenos pero menos escala. NAV ~par, dividends estables.

3. **Specialty**: HTGC (tech-focused), GAIN (lower middle market), CGBD (industrial). Mayor concentración sectorial pero potencialmente mejor rentabilidad ajustada al riesgo.

4. **Externally-managed con conflicts**: PSEC (Prospect), PNNT (Penn), MFIC. Historial de recortes de dividendo, trade discount al NAV (estimación propia razonada del historial sectorial, [UNSOURCED] a cuts exactos).

5. **Newcomers post-2020**: MSDL, OBDC (nueva era post-merger 2024 con OWLT), ORCC. Lanzados con buena tesis pero track record limitado.

BIZD lleva todos estos en proporción a su market cap. Esto significa que **los blue chips dominan** (top 5 ≈ 50% del fondo según estimación propia, [UNSOURCED]) pero los problem children siguen estando.

### ¿Cómo se compara BIZD vs alternatives?

**Otros ETFs de BDCs**:

- **PBDC** (Putnam BDC ETF) — competitor directo, menos AUM, expense ratio fund-only similar (estimación propia, [UNSOURCED] al exacto AUM y ER).
- **BDCS** (UBS ETN sobre Wells Fargo BDC index) — ETN no ETF, mayor risk de issuer (regla general ETN vs ETF distinction).
- **BIZD vs holding individual ARCC**: ARCC sola tiene mejor track record que BIZD pero más concentración (estimación propia razonada). Ratio sharpe históricamente similar según observación sectorial ([UNSOURCED] al sharpe exacto computed).

**Alternativas en el "high-income" space** (todos yield ranges estimación propia razonada del sector, [UNSOURCED] al exacto a fecha actual):

- **PFF** (preferred stocks ETF): yield ~6%, menor volatilidad, menos crédito risk.
- **JEPI/JEPQ** (JPMorgan covered call income): yield 7-9%, beta menor, less drawdown en crisis.
- **HYG/JNK** (high-yield corporate bond ETFs): yield 6-7%, mayor liquidez, default risk parecido.
- **MORT/REM** (mortgage REIT ETFs): yield 10-12%, pero mortgage REITs tienen riesgos diferentes (interest rate sensitivity).
- **PFFD** (Global X US Preferred ETF): yield ~6%, concentrado en bancos preferred.

Para un dividendero, BIZD encaja en la "alternative income sleeve" junto a JEPI/JEPQ y un poco de PFF, no como holding principal.

### Tax considerations adicionales

Dado que el usuario es **residente fiscal en China con tratado US-China 10% WHT** (según memoria del proyecto user_fiscal.md):

- Las distribuciones de BIZD están sujetas a 10% withholding en origen US (US-China tax treaty, regla treaty general).
- China grava el dividendo neto recibido al ~20% adicional (regla China IIT general sobre dividendos extranjeros, [UNSOURCED] al rate exacto a fecha actual y al tratamiento de foreign tax credit).
- **Tax drag total**: ~28-30% del yield gross (estimación propia razonada).
- Yield neto efectivo: 13.36% × 0.72 = 9.62% (cálculo propio derivado del yield current FMP cache 2026-05-09 y el drag estimado).

Esto es importante: el yield "real" en bolsillo es ~9.62%, no 13.36%. Sigue siendo competitivo pero menos espectacular de lo que parece.

---

## Por qué NO (visión bear adicional)

**Bear case 12-meses**:

- Recesión US H2 2026 con default cycle severo.
- Non-accrual rate sube de ~2% a 4-5% (estimación propia razonada del shock típico).
- NAV agregado cae ~15% (estimación propia razonada de mark-down típico en credit recession).
- Dividendos se recortan ~20% en agregado (estimación propia razonada).
- BIZD precio cae a $9-10 desde $12.90 (-22% a -30% según cálculo propio).
- Yield "true" (basado en dividendos recortados) sería ~14-15% sobre nuevo precio bajo, pero $1.40 sobre $9.50 (estimación propia razonada).

**Bear case 5 años**:

- Compresión spreads private credit por exceso de capital ($1T+ entrando al sector según estimación de research industry, [UNSOURCED] al AUM exacto industry-wide).
- Returns BDCs caen del 9-11% nominal a 6-8% (estimación propia razonada).
- BIZD performance 5y ~3-5% anualizado total return (no -10%, no +15%) según cálculo propio razonado.

---

## Por qué SÍ (visión bull adicional)

**Bull case 12-meses**:

- Tipos siguen "higher for longer" (Fed Funds 4-4.5% según observación macro pública 2025-2026, [UNSOURCED] al exact level cierre fecha actual).
- BDCs disfrutan variable rate, NII coverage robust (mecánica financiera).
- No recesión, default rate stable 1.5-2%.
- BIZD performance: yield 13% + capital appreciation 5-8% = ~18-21% total return (cálculo propio razonado).

**Bull case 5 años**:

- Private credit sigue ganando market share vs syndicated bank loans (tendencia secular según research industry).
- BDCs grandes (ARCC, OBDC) se consolidan, lock in scale.
- BIZD performance: 9-11% anualizado total return (yield 11-12% + modest cap apprec) según cálculo propio razonado.

---

## Posicionamiento concreto sugerido

**No tienes posición actual** según snapshot positions API 2026-05-09 (cuenta IB live).

Si decidieras abrir posición desde cero (asumiendo portfolio total ~$1.4M de NLV según memoria del proyecto):

- BIZD position: $20K-40K máximo (1.4-2.9% del portfolio total según cálculo propio).
- Si ya tienes OBDC + MSDL individuales (verificar en cartera live), considera no añadir BIZD para no duplicar (overlap ~15-20% según estimación propia razonada).
- O alternativamente: vender OBDC/MSDL individuales y consolidar en BIZD para diversificación.

**Re-evaluar** cuando:

- High-yield spread cruza 700bp ICE BofA US HY OAS (signal compra).
- Non-accrual rate sectorial cruza 3% (signal venta).
- Yield BIZD baja a < 10% por capital appreciation (consider take profit, valor ya capturado).
- ARCC dividend cut announcement (signal serio sectorial, evaluar exit).

---

## FAQ rápido sobre BIZD para inversor con poca experiencia

**Q: ¿Por qué el expense ratio dice >10% y no 0.40%?**
A: La SEC obliga a sumar las fees de los BDCs subyacentes (AFFE — Acquired Fund Fees and Expenses, regla SEC general Form N-1A). No es un cobro adicional al ETF — el ETF cobra solo el management fee fund-only ([UNSOURCED] al ratio exacto en último prospecto, históricamente ~0.40%). Las fees AFFE ya están descontadas dentro de cada BDC. Es una regulación de transparencia que confunde a inversores novatos.

**Q: ¿BIZD es lo mismo que comprar bonos high-yield?**
A: No exactamente. Los BDCs prestan a empresas privadas mid-market (no cotizadas), generalmente secured (con garantía). Los bonos HY son típicamente unsecured de empresas más grandes (regla general distinción private credit vs HY corporates). Los BDCs tienen mejor recovery rate en default (60-70% vs 40-50% en HY según estudios de Moody's y S&P, [UNSOURCED] al recovery rate exacto al cierre cycle más reciente) pero mayor concentración por loan.

**Q: ¿Por qué los dividendos de BIZD no son qualified?**
A: Porque la mayoría del income de los BDCs viene de **interest income**, que es ordinary income por estatuto (IRS regla general). Los BDCs distribuyen y los ETFs como BIZD pasan ese carácter al holder (pass-through taxation regla general RIC).

**Q: Si tengo OBDC y MSDL ya, ¿necesito BIZD?**
A: Probablemente no. OBDC y MSDL son típicamente ~15-20% combinados de BIZD según estimación propia razonada ([UNSOURCED] al weight exacto en BIZD a fecha actual). Si tienes ambos en tamaños decentes, ya tienes ~15-20% de tu equivalente BIZD distribuido. Añadir BIZD diluye la calidad (incluye PSEC y otros BDCs peores) sin gran beneficio diversificación.

**Q: ¿Cuándo se publican los resultados de los BDCs subyacentes?**
A: Trimestrales, por requisito SEC (regla general 10-Q filing). Los grandes (ARCC, OBDC, MAIN) publican earnings en febrero, mayo, agosto, noviembre (calendar Q+45 días approx). NAV se actualiza esos días, BIZD se ajusta correspondientemente.

**Q: ¿Cuál es el peor escenario realista?**
A: COVID 2020 fue benchmark según memoria histórica del producto: BIZD cayó cerca de -45% en 4 semanas ([UNSOURCED] al exact low/timing del fact sheet VanEck). El dividendo se recortó ~20% en agregado durante 12 meses (estimación propia razonada del análisis previo del usuario). Recuperación a niveles pre-COVID tomó ~12-15 meses. Total return en ese período (2020-2021) estimado +5% (hold-and-collect-yield, estimación propia razonada) — soportable pero estresante.

**Q: ¿Hay BIZD covered call equivalent?**
A: No directamente. Algunos BDCs hacen covered calls internamente, pero no hay un "BIZD-CC" ETF que escriba calls sobre BIZD. Para income aún mayor, alternativa es **JEPQ** sobre Nasdaq con tech exposure y beta similar (estimación propia, [UNSOURCED] al sharpe comparison exacto).

**Q: ¿Es BIZD apto para jubilados?**
A: Con cuidado. El yield es atractivo (13.36% según FMP cache 2026-05-09 cálculo) pero la beta a credit cycle es alta. Para someone living off dividends, BIZD no debería ser >5-10% del portfolio total (asignación propia razonada). Mejor combinar con dividend Aristocrats (KO, PG, JNJ) y treasury bonds para estabilidad.

**Q: ¿Cómo se compara el yield 13.36% actual con el histórico del producto?**
A: 13.36% (cálculo según FMP cache 2026-05-09) está en el extremo alto del rango histórico del producto. Los años pre-2020 yield rondaba 9-11% según estimación propia razonada del análisis previo, [UNSOURCED]. Que esté en 13.36% sugiere precio deprimido vs historical range (precio $12.90 vs high 52w $16.95 = -23.9% según cálculo FMP cache 2026-05-09) Y/O dividendo elevado por entorno tipos altos.

**Q: ¿Cuál es la diferencia real entre BIZD y JEPQ para income?**
A: Doble diferente:
- BIZD: exposure a credit cycle (BDCs prestan dinero) — cae fuerte en recesión.
- JEPQ: exposure a equity tech (Nasdaq) — cae en sell-offs equity tech pero menos en credit events.
- BIZD yield ~13%, JEPQ yield ~9-10% (estimación propia razonada, [UNSOURCED]).
- Usar ambos en cartera diversifica fuente del yield (income from credit + income from option premium).

**Q: ¿Puede BIZD desaparecer (cierre del fondo)?**
A: Es posible pero improbable a este AUM. Con $1.567B (FMP cache 2026-05-09) está cómodamente sobre el umbral de viabilidad ETF (regla general industry: ETFs con AUM <$50M tienen riesgo de cierre). VanEck es issuer establecido. Riesgo de cierre estimado: muy bajo (estimación propia razonada).

