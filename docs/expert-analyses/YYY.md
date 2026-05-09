# YYY — Amplify CEF High Income ETF

> **Análisis experto didáctico A&R** | Reescrito 2026-05-09 (citation-rules compliant) | Tipo: ETF de Closed-End Funds (CEFs) — fondo de fondos

---

## TL;DR (30 segundos)

YYY es un ETF estructuralmente peculiar: **un fondo que invierte en otros fondos** (60 closed-end funds) replicando el "Nasdaq CEF High Income Index" (descripción FMP profile YYY). El producto está diseñado para inversores que quieren **distribución mensual alta** sin tener que stock-pick CEFs uno a uno.

El precio cotiza a $11.56 (FMP quote 2026-05-09) con un rango 52w de $10.69-$11.93 (FMP profile 2026-05-09), market cap $714M (FMP profile 2026-05-09) y beta 0.97 (FMP profile 2026-05-09) — lo cual confirma que pese al wrapper de "income", el comportamiento es **casi idéntico al S&P 500 en volatilidad**, no es un sustituto de bonos.

La distribución TTM declarada por FMP es $1.44/share (FMP profile lastDividend 2026-05-09). Sobre un precio de $11.56 eso implica un **yield TTM ~12.5%** (estimación propia: $1.44 / $11.56). Pero ese número es engañoso por motivos estructurales que se explican abajo: doble fee structure, alta proporción histórica de Return of Capital (ROC), apalancamiento embedded en los CEFs subyacentes, y NAV decay sostenido.

**Veredicto preliminar**: **HOLD** si el inversor entiende exactamente qué está comprando y necesita absolute monthly cash flow en cuenta tax-deferred; **EVITAR para acumulación** porque alternativas como JEPI, PFFD o SCHD ofrecen mejor relación coste/income real/total return. **No es producto recomendado para acumular dividendos a largo plazo** en cuenta imponible.

**Confidence**: alta sobre el problema estructural (CEFs apalancados + AFFE + ROC son hechos públicos verificables); media sobre métricas exactas porque FMP no expone expense ratio efectivo con AFFE para ETFs ([UNSOURCED] dependerían de fact sheet del issuer). **Income safety**: 5/10 — distribución mensual continúa pero NAV histórico ha bajado, lo cual implica que parte de la distribución es ROC.

---

## ¿Qué es exactamente este ETF?

Vamos por partes — porque YYY combina dos vehículos que muchos inversores confunden.

### Capa 1: el closed-end fund (CEF)

Un CEF es un fondo cotizado con dos diferencias fundamentales frente a un ETF abierto típico:

1. **Número de shares fijo**: cuando lanzan, emiten un número limitado y luego no crean/redimen shares dinámicamente. Esto es lo opuesto a los ETFs abiertos como SPY o SCHD donde Authorized Participants crean/redimen continuamente para mantener el precio anclado al NAV.
2. **Cotización en bolsa con su propio ticker**: el precio puede divergir del NAV. Si cotiza por debajo, está **"trading at a discount"**; si por encima, **"trading at a premium"**. Esto crea inefficiencies que bull case de CEFs busca explotar.

CEFs típicamente exhiben tres características que el inversor minorista debe entender:

- **Apalancamiento (leverage)**: muchos CEFs piden prestado para amplificar el yield. Niveles del orden de 30-40% del activo son comunes en el segmento high-yield ([UNSOURCED] específico para holdings de YYY — depende del fact sheet de cada CEF; 1940 Act limita leverage 33% para deuda y 50% incluyendo preferred shares). El leverage amplifica returns y losses.
- **Distribuciones agresivamente altas (8-12%+)**: combinación de net investment income, realized capital gains, unrealized gains "cosechados", y Return of Capital.
- **Liquidez limitada**: bid-ask spreads pueden ser amplios y discount/premium puede oscilar sin razón fundamental clara, especialmente en stress de mercado.

### Capa 2: YYY como ETF-of-CEFs

YYY es un ETF abierto (no un CEF él mismo) que invierte en 60 CEFs distintos siguiendo el "Nasdaq CEF High Income Index" (descripción issuer FMP profile 2026-05-09). El propósito declarado: simplificar acceso al asset class CEF — en lugar de comprar 60 CEFs individuales con su due diligence, el inversor compra YYY y obtiene exposure indexada.

El index selecciona CEFs basándose en tres factores ranqueados por Nasdaq:

1. **Yield**: distribución relative al precio.
2. **Discount to NAV**: priorizando CEFs cotizando por debajo de su NAV.
3. **Liquidity**: trading volume mínimo para que el fund pueda implementar el index sin slippage excesivo.

(Fuente: FMP profile description YYY 2026-05-09.)

### El "doble fee structure" — el problema central

Aquí está la fricción estructural más importante. Cuando un inversor compra YYY:

- **Paga el management fee de YYY**: el expense ratio "stated" del propio ETF, que es ~0.50% según fichas comerciales del issuer Amplify ([UNSOURCED] número exacto — confirmar en fact sheet vigente del fund en amplifyetfs.com/yyy).
- **Paga indirectamente los fees de los 60 CEFs subyacentes**: este es el "Acquired Fund Fees and Expenses" (AFFE). Cada CEF tiene su propio expense ratio, típicamente entre 1.0% y 2.0% para CEFs apalancados ([UNSOURCED] número exacto AFFE para YYY — depende de la composición vigente). El AFFE no se cobra explícitamente como otro management fee; se traduce en un drag invisible sobre el NAV de los CEFs subyacentes y, por tanto, sobre el NAV de YYY.

El resultado: el "all-in cost" para el holder de YYY puede ser **significativamente mayor** que el 0.50% stated. Esto es legalmente disclosed en el prospecto, pero el inversor minorista raramente lo lee.

Comparación con SCHD: SCHD cobra 0.06% (FMP no expone expense ratio en endpoint público — número estándar verificable en Schwab fact sheet [UNSOURCED]). Para income-focused investing en cuenta imponible, la matemática del expense compounding favorece masivamente productos low-cost.

### Composición típica del portfolio YYY

YYY mantiene 60 CEFs con mix histórico que cubre bond CEFs (high yield corporate, MBS, EM debt, senior loans), equity income CEFs (covered call strategies, dividend funds), convertible CEFs, multi-asset / hybrid CEFs, y specialty (REIT, MLP, preferred). Los pesos exactos varían por rebalanceo ([UNSOURCED] composición en tiempo real — fact sheet mensual del issuer Amplify es la fuente canonical: amplifyetfs.com/yyy).

---

## Métricas clave del ETF (FMP 2026-05-09)

| Métrica | YYY | Fuente |
|---|---|---|
| Precio | $11.56 | FMP quote 2026-05-09 |
| Cambio diario | +$0.01 (+0.09%) | FMP quote 2026-05-09 |
| Day range | $11.52 - $11.59 | FMP quote 2026-05-09 |
| 52-week range | $10.69 - $11.93 | FMP profile 2026-05-09 |
| Market cap (AUM proxy) | $714M | FMP profile 2026-05-09 |
| Beta vs S&P | 0.97 | FMP profile 2026-05-09 |
| Volume diario | 288,437 shares | FMP quote 2026-05-09 |
| Volume promedio | 405,490 shares | FMP profile 2026-05-09 |
| Last dividend (TTM) | $1.44/share | FMP profile lastDividend 2026-05-09 |
| Yield TTM implícito | ~12.5% | estimación propia ($1.44 / $11.56) |
| Distribución frecuencia | Mensual | issuer Amplify ETFs YYY page |
| Exchange | NYSE Arca (AMEX) | FMP profile 2026-05-09 |
| Inception (IPO) | 2012-06-12 | FMP profile ipoDate 2026-05-09 |
| Number of holdings | 60 CEFs | FMP profile description 2026-05-09 |
| Sector clasificación | Financial Services / Asset Management - Income | FMP profile 2026-05-09 |
| Country | US | FMP profile 2026-05-09 |
| Issuer | Amplify ETFs | FMP profile 2026-05-09 |
| ISIN | US0321088470 | FMP profile 2026-05-09 |
| CUSIP | 032108847 | FMP profile 2026-05-09 |
| CIK | 0001633061 | FMP profile 2026-05-09 |

> **Nota crítica de coverage**: el expense ratio efectivo (incluyendo AFFE) **NO está disponible vía FMP**. El stated management fee es ~0.50% [UNSOURCED] sin verificación directa en este informe; el AFFE típico de CEFs apalancados eleva el all-in cost a ~2.0-2.5% según industry estimates [UNSOURCED]. **El inversor debe confirmar el número actualizado en el fact sheet del issuer en amplifyetfs.com/yyy** antes de tomar decisión final.

---

## Distribuciones — el corazón del problema

### El problema con yields del 12% en CEF wrappers

Los CEFs frequentemente distribuyen **más que su net investment income**. La diferencia se llama Return of Capital (ROC). ROC NO es income económico — es **devolución del propio principal del inversor**, fiscalmente diferida pero económicamente equivalente a recibir tu propio dinero.

Para el holder de YYY el efecto se transmite vía dos canales:

1. **ROC en los CEFs subyacentes**: cada CEF emite su propio Section 19(a) Notice cuando distribuye ROC. YYY consolida esos flujos.
2. **Composition disclosure de YYY**: el propio YYY también clasifica sus distribuciones en categorías para tax purposes (qualified dividend, ordinary income, capital gain, ROC).

Históricamente, los productos CEF-of-CEF como YYY tienden a tener una mezcla con **una porción material en ROC** ([UNSOURCED] porcentaje exacto para los últimos 4 años de YYY — el inversor debe consultar el "Distribution Tax Information" anual del issuer Amplify, típicamente publicado en enero-febrero de cada año fiscal en amplifyetfs.com).

### El concepto de NAV decay

Si un fondo distribuye más de lo que genera, el NAV cae. Un inversor que compró YYY al inicio (junio 2012, IPO date FMP profile 2026-05-09) y mantiene la posición ha visto el precio **caer materialmente** desde el lanzamiento, aunque la distribución mensual continúa siendo "atractiva" en términos nominales.

El precio actual ($11.56 — FMP quote 2026-05-09) sugiere que pese a 13+ años de operación y miles de millones distribuidos en agregado, el principal del inversor original se ha **erosionado significativamente** ([UNSOURCED] precio inicial exacto post-split y total return histórico — calcular requiere Yahoo Finance adjusted close or Morningstar total return chart).

Esto NO significa que YYY sea fraude — la SEC requiere disclosure completo. Pero significa que el **"yield del 12.5%" no es total return**. Total return real ha sido inferior porque el principal se reduce mientras se cobran las distribuciones.

### Sustainability de la distribución

La pregunta clave para cualquier income product: **¿la distribución actual es sostenible**?

Tres red flags para CEF-of-CEFs:

1. **NAV declining trend**: si el NAV agregado de los 60 CEFs está bajando consistently, eventualmente las distribuciones se cortan.
2. **Coverage ratios**: el ratio NII / distribución de los CEFs subyacentes — saludable es 100%+, problemático <80%. ([UNSOURCED] coverage agregado actual de YYY's holdings.)
3. **Fund flows**: si AUM de YYY decrece, hay menos diversificación intrínseca y más concentración en CEFs problemáticos. AUM actual $714M (FMP profile 2026-05-09) es relativamente pequeño para un ETF — sugiere que el producto no ha capturado mass adoption.

---

## Comparación con alternativas income (FMP prices 2026-05-09)

| Producto | Precio | 52w range | Yield TTM aprox | Strategy | Comentario |
|---|---|---|---|---|---|
| **YYY** | $11.56 | $10.69-$11.93 | ~12.5% (estim.) | CEF basket | Stated yield alta; ROC + AFFE drag |
| **BIZD** | $12.90 | $11.97-$16.95 | ~11% [UNSOURCED] | BDC ETF | Yield real más limpia que YYY pero crédito puro |
| **JEPI** | $55.96 | $55.15-$59.90 | ~7-8% [UNSOURCED] | S&P 500 + ELN | Cheaper expense, NAV más estable |
| **QYLD** | $18.13 | $16.02-$18.13 | ~12% [UNSOURCED] | Nasdaq covered call | Otro yield-trap structurally similar |
| **PFFD** | $19.14 | $18.22-$19.89 | ~6% [UNSOURCED] | Preferred ETF | Más previsible, mensual, low fee |
| **SCHD** | $31.62 | $25.69-$32.13 | ~3.5% [UNSOURCED] | Dividend index | Yield baja, total return histórico superior |
| **DIVO** | $45.36 | $40.58-$47.30 | ~4.5-5% [UNSOURCED] | Dividend + cov calls | Equilibrio yield/total return |
| **SPY** | $737.62 | $575.60-$738.08 | ~1.3% [UNSOURCED] | S&P 500 | Benchmark; incluye solo aprox 1.3% yield pero appreciation |

(Fuente prices: FMP /api/prices live 2026-05-09; yields TTM cuantificados se marcan [UNSOURCED] porque FMP no expone yield directo en el endpoint usado.)

**Lectura cualitativa**:

- **YYY pierde en cost** vs casi cualquier alternativa (a paridad de yield).
- **YYY pierde en NAV stability**: 52w range $10.69-$11.93 implica ~10% volatilidad, no muy diferente de equity índice broad.
- **YYY gana en monthly cash flow nominal**: yield TTM más alto que casi cualquier rival listado. Si el único objetivo del inversor es **cobrar máxima distribución mensual** en cuenta tax-deferred, YYY entrega eso.

---

## ¿Cómo se compara con BIZD (BDC ETF)?

BIZD es relevante mencionar porque cubre el espacio **BDC ETF** (Business Development Companies — préstamos a middle market). Tanto BIZD como YYY se anuncian con yields de doble dígito, pero la mecánica es distinta:

- **BIZD**: contiene 25-30 BDCs cotizadas. Las BDCs son operadoras reales con balance sheet propio, NII generado por intereses cobrados a portfolio companies. La distribución de cada BDC suele ser cubierta por NII orgánico (con caveats sobre special dividends).
- **YYY**: contiene 60 CEFs. Los CEFs son **wrappers**, no operadoras. Su NII viene de los activos subyacentes (bonds, dividends de stocks, capital gains). Cuando distribuyen más de su NII, lo hacen vía ROC.

BIZD price actual: $12.90 (FMP price 2026-05-09), 52w range $11.97-$16.95 — implica **drawdown del ~24%** desde el high, lo cual refleja stress 2025 en BDCs (NII pressure por curva de tipos). YYY 52w range $10.69-$11.93 — drawdown del ~10%, más estable en términos de price (probablemente porque el portfolio de YYY incluye bonds CEFs que han rebotado).

**Para un inversor de income que ya tiene BDC exposure** (BIZD, OBDC, MAIN, ARCC), añadir YYY no diversifica meaningfully — gran parte de los CEFs de bonds dentro de YYY tienen exposure a credit similar.

---

## Tax treatment para residente fiscal en China

(Contexto user A&R: el usuario es residente fiscal en China — see CLAUDE.md "user_fiscal".)

**Withholding US sobre distribuciones**: la W-8BEN del usuario aplica el treaty US-China (10% WHT sobre qualified dividends). Para ETFs como YYY, las distribuciones se clasifican en categorías al final del año fiscal:

- **Qualified dividend portion**: 10% WHT por treaty.
- **Ordinary income portion** (interés, REIT distributions): puede tener WHT más alto dependiendo de exact composition.
- **Return of Capital (ROC)**: típicamente no genera WHT en el momento, pero **reduce el cost basis**. Cuando el inversor vende, el capital gain se calcula contra el cost basis ya reducido — efectivamente difiere el impuesto pero no lo elimina.
- **Capital gain distributions** (cuando los CEFs subyacentes realizan ganancias y las distribuyen): tratamiento como capital gain.

(Fuente: convención IRS Form 1099-DIV / 1042-S — el broker entrega esto al final del año; estructura general de tratamiento es estándar y verificable en publicaciones IRS.)

**Implicación práctica para el usuario A&R**: la complejidad de tracking ROC para mantener cost basis correcto **es un cost no obvio** de mantener YYY en cuenta imponible. Para un dividendero serio que valora simplicity de reporting, este factor **pesa contra YYY** vs alternativas más limpias como SCHD o JEPI.

---

## ¿Tiene utilidad real este producto?

Marginal pero existe. Casos donde YYY puede ser defendible:

1. **Retiree en cuenta tax-deferred (IRA, Roth)** que necesita absolute monthly cash flow predictable y no quiere/puede stock-pick CEFs individualmente. La complejidad fiscal del ROC se neutraliza en cuenta tax-deferred.
2. **Inversor sin acceso a CEFs individuales** o sin sofistication para evaluar discount/premium dinámicamente.
3. **Diversification al asset class CEF** sin tener que research 60 funds individualmente — el ETF wrapper hace ese trabajo (con el coste asociado).

Casos donde YYY **NO** tiene utilidad clara:

1. **Acumulación de capital long-term**: el NAV decay histórico hace que el total return sea inferior a alternativas equity-based.
2. **Cuenta imponible sin appetite para ROC tracking**: complejidad de basis adjustment.
3. **Inversor que ya tiene high-yield income exposure** (BDCs, REITs, preferreds): adding YYY añade overlap no diversificador.
4. **Investor cost-conscious**: el AFFE es excesivo vs alternativas.

---

## La psicología del "yield trap"

"12% yield" suena excepcional — ~9x el yield de SPY (~1.3% [UNSOURCED]). Pero el inversor sofisticado entiende cuatro principios: (1) **yield no es income económico** (yield es distribución/precio; income es lo que el activo genera; divergen vía ROC); (2) **high yield often signals underlying problems** (12% en mundo de 10y Treasury ~4-4.5% [UNSOURCED] implica risk premium sustancial); (3) **total return matters más que yield** (4% yield + 8% appreciation = 12% total beats 12% yield - 5% NAV decay = 7%); (4) **fees compound disastrously** (drag 2% durante 20 años en $100K es ~$60K perdidos vs product al 0.10%, asumiendo crecimiento similar). YYY plays sobre yield-chasing psychology — legalmente compliant pero económicamente subóptimo para la mayoría.

---

## Si el usuario A&R tiene posición en YYY: plan estructurado

### Paso 1: inventory check

Revisar en cartera A&R (https://ayr.onto-so.com Portfolio tab) cuántas shares de YYY hay y cost basis promedio. La cartera A&R consolida 4 cuentas IBKR (CLAUDE.md "IB Integration") — verificar si YYY aparece en alguna.

(Si el usuario tiene cero shares actualmente, este paso es trivial: no hace falta plan de salida.)

### Paso 2: tax assessment

Si la posición está en gain absoluto: vender genera capital gain. Considerar si compensar con loss harvest en otras posiciones ese mismo año.

Si está en loss: tax-loss harvest puede generar beneficio fiscal. Hay que evitar wash sale (reentrar a producto sustantialmente idéntico en 30 días) — puede sustituirse por PFFD, JEPI, o SPYI, no por PCEF.

### Paso 3: reasignación recomendada

Si el objetivo es **mantener monthly cash flow al mismo nivel**, una posible reasignación equivalente en yield:

- **50% PFFD** (Global X U.S. Preferred): ~6% yield [UNSOURCED] con NAV más estable.
- **30% JEPI** (JPMorgan Equity Premium Income): ~7-8% yield [UNSOURCED] con expense 0.35%.
- **20% SCHD** (Schwab US Dividend): yield modesto ~3.5% [UNSOURCED] pero superior total return histórico.

Yield combinada estimada: ~6-6.5% (estimación propia), mensual o trimestral según producto. Inferior al "stated" 12.5% de YYY pero **mucho más cerca del income económico real** que el holder de YYY captura tras AFFE + ROC + NAV decay.

### Paso 4: ejecución por fases

Para evitar tax hit lump sum: vender en 3-4 tranches a lo largo de 6-12 meses, calendarizando con dividend ex-dates para no perder distribuciones inminentes innecesariamente.

### Paso 5: monitoreo post-reasignación

Trackear en A&R Dashboard:

- NAV stability del nuevo portfolio (cero NAV decay esperado a horizonte 5y).
- Distribuciones recibidas vs proyectadas.
- Total return vs benchmark SPY/SCHD.

---

## Análisis de la mecánica ROC (deep dive)

### Cómo se construye una distribución mensual del 12%

Un CEF típico que YYY contiene tiene este flujo anual:

- **Investment income** (dividends + interest): 4-6% del NAV (estimación propia, varía por strategy).
- **Realized capital gains**: 1-3% del NAV.
- **Unrealized gains "harvest"**: vender ganadores acumulados.
- **Return of Capital (ROC)**: para cerrar el gap si el target rate es mayor que income real + capital gains.

Si el fund target es 10% pero genera 6% income + 2% capital gains = 8%, el 2% restante se paga del propio principal vía ROC. Esto reduce el NAV. La regulación 1940 Act obliga al CEF a emitir un **Section 19(a) Notice** disclosing la composition cada vez que distribuye ROC. Para el holder de YYY el equivalente consolidado se publica anualmente en formato 1099-DIV.

YYY como ETF-of-CEFs consolida estas distribuciones de 60 CEFs y las clasifica anualmente en: net investment income (qualified + ordinary), capital gains (short-term + long-term), y return of capital. ([UNSOURCED] proporción exacta — disponible en Amplify Distribution Tax Information del último año fiscal en amplifyetfs.com/yyy.)

### Ejemplo numérico ilustrativo

Caso hipotético: 100 shares a $11.56 = $1,156 (FMP price 2026-05-09).

Año 1:

- Distribuciones nominales: $1.44 × 100 = $144 (basado en lastDividend FMP profile $1.44).
- Mix asumido (estimación propia, basado en patrón general CEF-of-CEFs; el % real para YYY es [UNSOURCED]): 60% income real + 40% ROC = $86 income + $58 ROC.
- WHT 10% treaty sobre $86 = $8.6 retenido. Cash neto: ~$135.4.
- Cost basis ajustado: $1,156 - $58 ROC = $1,098.
- Total return económico año 1: $86 / $1,156 = ~7.4% gross / 6.7% net (estimación propia).

Si NAV cae 5%, total return real = 6.7% income - 5% NAV decay = **~1.7% net** (estimación propia).

Comparación con $1,156 en SCHD ($31.62 FMP price 2026-05-09): yield ~3.5% [UNSOURCED] = $40 distribución, $36 net post-WHT. Asumiendo apreciación equity broad-market ~7% (estimación propia), capital gain ~$80. Total return ~$117 = ~10.1% (estimación propia).

**SCHD wins por 3-8 puntos percentuales** según movimientos exactos de NAV. Pero el cash mensual nominal recibido es menor ($3/mes vs $11.3/mes con YYY) — para el inversor que prioriza cash flow mensual absoluto, SCHD no resuelve esa necesidad específica.

---

## Por qué los CEFs subyacentes existen (uso legítimo)

CEFs tienen rol válido. No son intrínsecamente malos. Casos de uso legítimo:

1. **Asset classes ilíquidos** (mortgage bonds non-agency, EM debt local currency, senior loans privados): el ETF wrapper abierto es inadecuado porque create/redeem requiere liquid underlying. CEFs cerrados mantienen illiquid assets sin pressures de redención.
2. **Trading at deep discount** (-15% o más sobre NAV): permite arbitraje relativo si el discount converge.
3. **Strategies especializadas** (preferred + high yield + convertibles): no replicables cleanly via ETFs.

Para el inversor sofisticado que stock-pickea CEFs individualmente at deep discounts, monitorea distribution coverage, entiende ROC, y tiene cuenta tax-deferred grande, los CEFs pueden añadir alfa marginal. Pero **YYY wraps 60 de ellos indiscriminadamente**. El index selecciona por yield + discount + liquidity, sin filtros cualitativos sobre manager track record o sustainability del distribution. Eso **elimina el edge potencial mientras conserva todos los costos**. Stock-pickear 5-10 CEFs at deep discount outperformaría YYY estructuralmente — pero requiere expertise. La mayoría de retail compra YYY por simplicidad.

---

## Coherencia con la cartera del usuario A&R

El usuario A&R tiene exposición a varios productos de income high-yield según CLAUDE.md y memory: BIZD, OHI, IIPR, OBDC, AHRT (REITs y BDCs), JEPI/DIVO/SCHD/SPHD/QYLD (income ETFs), MSDL (BDC). El nicho que cubriría YYY (CEF wrapper) es **redundante** vs el income exposure que ya tiene a través de:

- BDCs directas: BIZD, OBDC, MSDL.
- REITs: O, OHI, NNN, MAA, AVB, EQR, HR, REXR, VICI, IIPR, KRG, CLPR, AHRT, WPC, SAFE, ARE, AMT.
- Income ETFs: JEPI, DIVO, SCHD, SPHD.
- Preferreds estructurales: IIPR-PRA.
- Equity dividend payers: KO, PEP, PG, MO, PM, T, VZ, ABBV, MRK, KMI, EPD, etc.

Adding YYY a este mix añade un wrapper de fees encima de exposure que ya tiene de forma más eficiente. **El argumento marginal es extremadamente débil**.

Si el holding actual del usuario en YYY es pequeño/legacy, mantenerlo es defendible si el cost de salida (taxes + transaction) es alto. Si el holding es de tamaño material o de incorporación reciente, **reasignación es lo recomendable**.

---

## Veredicto final

### Para un dividendero a largo plazo (perfil del usuario A&R):

**Decisión recomendada: HOLD si la posición es marginal y en cuenta tax-deferred; TRIM/SELL si es posición material en cuenta imponible.**

Razones:

1. **Costo total real estimado ~2-2.5% all-in [UNSOURCED]**: erosiona alpha sistemáticamente. Confirmar en fact sheet.
2. **Yield "12.5%" engañosa**: porción material es ROC (devolución del propio capital).
3. **NAV decay histórico documentado** (precio actual $11.56 vs valores históricos significativamente superiores [UNSOURCED] precio inicial post-split).
4. **Existen alternativas estructurales superiores** (PFFD, JEPI, SCHD) con cost ratio dramáticamente más bajo y mejor sustainability de distribución.
5. **Redundancia con cartera existente**: el usuario A&R ya tiene amplia exposure a high-yield income vía BDCs, REITs, dividend ETFs.
6. **Complejidad fiscal**: ROC tracking en cuenta imponible es coste no obvio.
7. **AUM small ($714M, FMP profile 2026-05-09)** indica que el producto no ha capturado mass adoption — riesgo de cierre/liquidación si el AUM sigue declining ([UNSOURCED] threshold del issuer Amplify para liquidate).

### Reasignación recomendada (perfil dividendero conservador-moderado):

Si el inversor **prioriza monthly cash flow alto en cuenta tax-deferred** y quiere mantener algo similar a YYY:

- **50% JEPI** ($55.96 FMP price 2026-05-09): ~7-8% yield [UNSOURCED], expense 0.35% [UNSOURCED], mensual.
- **30% PFFD** ($19.14 FMP price 2026-05-09): ~6% yield [UNSOURCED], expense 0.23% [UNSOURCED], preferred ETF mensual.
- **20% SCHD** ($31.62 FMP price 2026-05-09): yield 3.5% [UNSOURCED], expense 0.06% [UNSOURCED], dividend equity ETF.

Yield combinada estimada ~5.5-6% (estimación propia), inferior al stated 12.5% de YYY pero **mucho más limpio** en términos de income económico real, sin AFFE drag, sin ROC complications, y con mejor total return esperado a horizonte 5-10y.

### Si el usuario decide mantener YYY:

Aceptable solo si: (a) se entiende que es income-focused no acumulación, (b) position size <2% del portfolio para limitar drag agregado, (c) está en cuenta tax-deferred (IRA/Roth), (d) se monitorea trimestralmente la composición ROC vs income real, y (e) se monitorea AUM trend — si cae <$500M durante 12 meses consecutivos, considerar exit por riesgo de liquidation.

---

## Datos de referencia (FMP 2026-05-09)

- **Ticker**: YYY
- **Nombre completo**: Amplify CEF High Income ETF (FMP profile companyName 2026-05-09)
- **Issuer**: Amplify ETFs (FMP profile 2026-05-09)
- **Index trackeado**: Nasdaq CEF High Income Index (FMP profile description 2026-05-09)
- **Inception (IPO date)**: 2012-06-12 (FMP profile ipoDate 2026-05-09)
- **AUM proxy (market cap)**: $714M (FMP profile 2026-05-09)
- **Price actual**: $11.56 (FMP quote 2026-05-09)
- **Last dividend TTM**: $1.44 (FMP profile lastDividend 2026-05-09)
- **Beta**: 0.97 (FMP profile 2026-05-09)
- **52-week range**: $10.69 - $11.93 (FMP profile 2026-05-09)
- **Volume diario / promedio**: 288,437 / 405,490 (FMP quote+profile 2026-05-09)
- **Exchange**: NYSE Arca (FMP profile 2026-05-09)
- **Sector clasificación**: Financial Services / Asset Management - Income (FMP profile 2026-05-09)
- **Country**: US (FMP profile 2026-05-09)
- **CIK**: 0001633061 (FMP profile 2026-05-09)
- **ISIN**: US0321088470 (FMP profile 2026-05-09)
- **CUSIP**: 032108847 (FMP profile 2026-05-09)
- **Number of underlying CEFs**: 60 (FMP profile description 2026-05-09)
- **Frecuencia distribución**: Mensual (issuer Amplify ETFs page YYY)
- **Web fact sheet**: https://amplifyetfs.com/yyy (FMP profile website 2026-05-09)

**Métricas no expuestas en FMP — consultar fact sheet del issuer**: expense ratio stated, AFFE, distribution rate oficial, composición ROC vs qualified income vs capital gains, coverage ratio agregado, average discount/premium, top 10 holdings y pesos.

---

## Pares directos identificables

Otros CEF-of-CEF / CEF-wrapper ETFs: **PCEF** (Invesco CEF Income Composite Portfolio — wrapper similar, fees comparables [UNSOURCED] verificación exacta); **FOF** (Cohen & Steers Closed-End Opportunity Fund — es CEF, no ETF, comparación menos directa); mutual funds activamente gestionados con CEF exposure. YYY es el ETF wrapper de CEFs más conocido del segmento, pero esto no implica que sea el más recomendable — el segmento entero tiene flaws estructurales aplicables a casi todos los productos similares.

---

## Citation coverage statement

Reescrito cumpliendo patrón Anthropic FSI A3 (CLAUDE.md "v4.5 / Anthropic FSI adaptation"). Cada número con fuente lleva cita inline; cada número derivado se marca `(estimación propia)`; cada número no verificable se marca `[UNSOURCED]` para auditoría.

**Fuentes utilizadas**: FMP /api/prices live 2026-05-09 (Cloudflare Worker proxy a FMP Ultimate) para precios y rangos; FMP /api/fundamentals?symbol=YYY 2026-05-09 para profile completo (ISIN, CUSIP, CIK, sector, beta, market cap, lastDividend, range, IPO date, description, peers); CLAUDE.md "v4.5" + memory MEMORY.md para contexto cartera A&R; convención IRS general sobre ROC y treaty US-China.

**No confirmado / [UNSOURCED]**: expense ratio efectivo + AFFE (requiere fact sheet vigente Amplify), composición distribuciones último año (Distribution Tax Information del issuer), NAV decay histórico cuantitativo (Yahoo Finance / Morningstar), top holdings actuales, coverage ratio agregado de los 60 CEFs, yields TTM exactos de peers (FMP /api/prices no expone yield directo).

El usuario A&R debe consultar **el fact sheet del issuer en https://amplifyetfs.com/yyy** y el **último 1099-DIV / Distribution Tax Information** para completar las casillas [UNSOURCED] antes de decisión definitiva.

---

*Análisis preparado por agente Opus 4.7 de A&R, citation-rules compliant 2026-05-09. Reescrito desde versión 3 (coverage 15%, tier low) para subir coverage a tier med-high. No constituye recomendación de inversión personalizada — el usuario debe verificar los puntos [UNSOURCED] en el fact sheet del issuer antes de actuar.*
