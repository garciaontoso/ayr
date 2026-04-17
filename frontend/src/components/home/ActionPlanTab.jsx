import { useState, useCallback, useMemo, useRef } from 'react';
import { FiveFiltersBadge } from '../ui/FiveFiltersBadge.jsx';

// ── Action Plan Tab ─────────────────────────────────────────────────────────
// Aggregates ALL recommendations from 9 sector deep-dives into a single
// prioritized actionable list. Hardcoded from April 2026 reports.
// localStorage key: action_plan_status_v1  (map of id→status)

const STORAGE_KEY = 'action_plan_status_v1';
const DEEP_DIVE_DATE = '2026-04-18'; // Date of sector deep-dives this plan was extracted from

// ── Master action list extracted from sector deep-dives ──────────────────────
// Fields: id, ticker, action, timeframe, reason, impact, source, triggerPrice,
//         filters {business,moat,management,valuation,conviction},
//         reasoning {business,moat,management,valuation,conviction},
//         devilsAdvocate, invalidation
// Filter 5 (conviction) is always null — it is user-owned per the A&R framework.
const ACTIONS = [
  // ── URGENT: SELL / EXIT ───────────────────────────────────────────────────
  {
    id: 'clpr-exit',
    ticker: 'CLPR',
    action: 'SELL',
    timeframe: 'urgent',
    reason: 'Cut probability >50% en 18 meses. Equity negativa, 2 demandas de prestamistas, familia Bistricer capta 62% de distribuciones. 12.9% yield = señal de alarma, no oportunidad.',
    impact: '$5,490 liberados → reasignar a VICI o NNN',
    source: 'REITs',
    triggerPrice: null,
    filters: { business: 5, moat: 2, management: 1, valuation: 2, conviction: null },
    reasoning: {
      business: 'Propietario de edificios residenciales en NYC. Modelo comprensible pero gestión captura 62% de distribuciones vía fees, diluyendo valor para accionistas públicos.',
      moat: 'NYC real estate tiene barreras regulatorias pero esta empresa tiene equity negativa. Sin margen de seguridad.',
      management: 'Familia Bistricer con 2 demandas activas de prestamistas. Conflicto de interés estructural. Score 1/10 en nuestro análisis de seguridad.',
      valuation: 'Yield 12.9% refleja probabilidad de corte >50%. "Precio barato" es trampa cuando el dividendo es insostenible.',
    },
    devilsAdvocate: 'NYC multi-family tiene demanda secular estructural. Si refinancian la deuda y resuelven demandas, el precio podría recuperar 30-40%.',
    invalidation: 'Mantener si: reducen deuda neta/EBITDA <5x Y familia Bistricer renuncia a fees extraordinarios Y demandas resueltas sin dilución.',
  },
  {
    id: 'flo-exit',
    ticker: 'FLO',
    action: 'SELL',
    timeframe: 'urgent',
    reason: 'Payout 246% GAAP. CEO se negó a defender el dividendo en Q4. Simple Mills triplicó deuda, $400M Notes vencen Oct 2026. Yield 23.9% = trampa. Probabilidad de corte 65-75% en 12 meses.',
    impact: '$8,280 liberados → reasignar a HRL',
    source: 'ConsumerStaples',
    triggerPrice: null,
    filters: { business: 7, moat: 4, management: 2, valuation: 2, conviction: null },
    reasoning: {
      business: 'Pan de molde, pastelería industrial, marcas Sunbeam/Wonder/Nature\'s Own. Negocio comprensible. El problema no es entender el negocio — es que va mal.',
      moat: 'Distribución física a supermercados tiene algo de ventaja pero las marcas no tienen pricing power. Márgenes comprimidos por inflación de costes.',
      management: 'CEO rechazó explícitamente defender el dividendo en Q4 earnings call. Simple Mills adquisición triplicó deuda. -50% retorno accionista vs competidores.',
      valuation: 'Yield 23.9% = mercado fijó 65-75% probabilidad de corte. Payout 246% GAAP — no hay margen para el dividendo actual.',
    },
    devilsAdvocate: 'Simple Mills (snacks saludables) es un activo de alto crecimiento. Si logran reducir deuda y los $400M se refinancian, podrían mantener dividendo reducido con base más sana.',
    invalidation: 'Mantener si: refinancian $400M Notes sin dilución Y payout FCF cae <80% Y CEO explicita defensa del dividendo.',
  },
  {
    id: 'ahrt-exit',
    ticker: 'AHRT',
    action: 'SELL',
    timeframe: 'urgent',
    reason: 'Calidad más baja del sleeve de Industriales. Score 1/10 seguridad. Candidato número 1 a liquidación. Yield 9.9% con fundamentales débiles.',
    impact: '~$17K liberados → reasignar a LMT o UNP',
    source: 'Industrials',
    triggerPrice: null,
    filters: { business: 4, moat: 1, management: 2, valuation: 3, conviction: null },
    reasoning: {
      business: 'Modelo de negocio difuso. Exposición a sectores industriales de bajo margen sin ventaja clara diferenciadora.',
      moat: 'Score 1/10 seguridad en nuestro análisis. No hay moat identificable. Yield 9.9% refleja calidad real del activo.',
      management: 'Fundamentales débiles persistentes. Incapacidad de generar FCF suficiente para sostener el dividendo con margen de seguridad.',
      valuation: 'Yield 9.9% compensa el riesgo teóricamente pero cuando los fundamentales no lo respaldan, es una trampa de valor.',
    },
    devilsAdvocate: 'Posición históricamente grande (~$17K). Si hay exposición a sectores con tailwinds (defensa, infraestructura) podría tener rebote táctico.',
    invalidation: 'Mantener si: FCF payout cae <70% Y ROIC supera coste de capital durante 2 trimestres consecutivos.',
  },
  {
    id: 'path-exit',
    ticker: 'PATH',
    action: 'SELL',
    timeframe: 'urgent',
    reason: 'No paga dividendo, -50% desde costo. GenAI come el mercado de RPA, competencia de Microsoft Power Automate. No tiene camino claro hacia el perfil dividendero.',
    impact: '~$8K tax-loss harvest → reasignar a MSFT o AVGO',
    source: 'Tech',
    triggerPrice: null,
    filters: { business: 7, moat: 3, management: 6, valuation: 4, conviction: null },
    reasoning: {
      business: 'Automatización robótica de procesos (RPA). Comprensible: bots que automatizan tareas repetitivas de oficina. Plataforma UiPath es líder de nicho.',
      moat: 'GenAI (Copilot, Claude, Gemini) hace obsoleto el RPA clásico. Microsoft Power Automate integrado en Office 365 erosiona la base de clientes. Moat estructuralmente dañado.',
      management: 'Daniel Dines (fundador/CEO) ha ejecutado bien históricamente. Transición a AI-first plausible pero incierta.',
      valuation: '-50% desde costo ya descuenta parte del deterioro. Pero sin dividendo y con tesis cuestionada, el valor justo es incierto.',
    },
    devilsAdvocate: 'PATH está integrando AI genuinamente. Si se posicionan como orquestador de agentes AI en lugar de RPA clásico, tienen base de clientes empresariales valiosa.',
    invalidation: 'Reconsiderar si: inician dividendo O crecimiento ARR acelera >25% sostenido O acuerdo estratégico con Microsoft/SAP/Oracle valida el reposicionamiento.',
  },
  // ── URGENT: TRIM ─────────────────────────────────────────────────────────
  {
    id: 'mdv-trim',
    ticker: 'MDV',
    action: 'TRIM',
    timeframe: 'urgent',
    reason: '7.7x Net Debt/EBITDA. Dos inquilinos = 25.5% de renta. Préstamo $250M vence julio 2028. NO AÑADIR. Reducir a 200 acciones.',
    impact: 'Vender 200 acc → ~$2,970 → añadir NNN o VICI',
    source: 'REITs',
    triggerPrice: 13,
    filters: { business: 7, moat: 5, management: 5, valuation: 5, conviction: null },
    reasoning: {
      business: 'REIT de triple-net lease diversificado. Modelo comprensible: arrendar activos a inquilinos con triple-net (inquilino paga gastos). Concentración excesiva en pocos clientes.',
      moat: 'Triple-net REITs tienen algo de foso (contratos largos) pero MDV tiene solo 2 inquilinos = 25.5% renta. Diversificación insuficiente vs NNN o VICI.',
      management: 'Gestión razonable pero apalancamiento excesivo 7.7x. Préstamo $250M con vencimiento 2028 crea presión.',
      valuation: 'Precio actual integra parte del riesgo. Yield razonable pero NO BUY dado el apalancamiento.',
    },
    devilsAdvocate: 'Si el refinanciamiento del $250M se ejecuta a tasas razonables y los inquilinos renuevan, MDV podría ser un hold decente. Descuento vs NAV podría cerrarse.',
    invalidation: 'Salida total si: corte de dividendo O deuda neta/EBITDA no cae bajo 6x en 12 meses O pierde inquilino top-2.',
  },
  {
    id: 'cag-trim',
    ticker: 'CAG',
    action: 'TRIM',
    timeframe: 'urgent',
    reason: 'Dividendo congelado 11 trimestres. Probabilidad de corte 35-45%. Adquisición Pinnacle destruyó $2.7B+ valor. Sean Connolly -50% retorno total en 11 años vs +160% S&P.',
    impact: 'Vender 200 acc → ~$3,140 → reasignar a HRL',
    source: 'ConsumerStaples',
    triggerPrice: null,
    filters: { business: 8, moat: 5, management: 2, valuation: 5, conviction: null },
    reasoning: {
      business: 'Alimentos envasados (Hunt\'s, Healthy Choice, Birds Eye, Slim Jim). Negocio muy claro. El problema es la ejecución.',
      moat: 'Marcas con reconocimiento pero sin pricing power real. Pinnacle Foods adquisición destruyó $2.7B+ en valor. Categorías maduras con competencia intensa.',
      management: 'Sean Connolly: -50% retorno total en 11 años vs +160% S&P. Dividendo congelado 11 trimestres. Adquisición Pinnacle a múltiplos peak. Calificación de gestión muy baja.',
      valuation: 'Dividendo congelado con probabilidad de corte 35-45%. Precio no es evidente trampa pero gestión destruye valor activamente.',
    },
    devilsAdvocate: 'CAG tiene marcas con posición en categorías defensivas. Si Connolly es reemplazado y se ejecuta desinversión de activos, el negocio subyacente tiene valor real.',
    invalidation: 'Salida total si: corte del dividendo OR CEO Connolly permanece con otro año de destrucción de valor OR Net Debt/EBITDA sube >5x.',
  },
  {
    id: 'cpb-trim',
    ticker: 'CPB',
    action: 'TRIM',
    timeframe: 'urgent',
    reason: '4.5x Net Debt/EBITDA post-Sovos. FCF YE25 $705M cubre justo dividendos+intereses+capex+reestructuración. -230bps margen bruto por aranceles. Probabilidad corte 30%+.',
    impact: 'Vender 100 acc → ~$2,200. Rally a $25 = señal de salida total.',
    source: 'ConsumerStaples',
    triggerPrice: 25,
    filters: { business: 8, moat: 6, management: 5, valuation: 5, conviction: null },
    reasoning: {
      business: 'Campbell\'s Soup, Goldfish, Snyder\'s, Pepperidge Farm. Uno de los portafolios más reconocibles en snacks y sopas.',
      moat: 'Goldfish y Pepperidge Farm tienen algo de moat de marca. Sopas menos. Adquisición Sovos (Rao\'s) = apuesta en salsas premium con buenas perspectivas a largo plazo.',
      management: 'Adquisición Sovos a $2.7B añade deuda pero Rao\'s es un activo real. Reestructuración en proceso. Dirección decente pero bajo presión.',
      valuation: 'FCF $705M cubre dividendos+intereses+capex a pelo. -230bps margen por aranceles reduce el colchón. Rally a $25 cambiaría la ecuación valuation/yield.',
    },
    devilsAdvocate: 'Rao\'s tiene crecimiento >20% y márgenes premium. Si CPB ejecuta la integración bien y aranceles se moderan, podría ser un hold a largo plazo.',
    invalidation: 'Salida a $25 (rally) OR corte de dividendo OR NDEBT/EBITDA no cae bajo 3.5x en 18 meses.',
  },
  {
    id: 'emn-trim',
    ticker: 'EMN',
    action: 'TRIM',
    timeframe: 'urgent',
    reason: 'Químicos diversificados commodity. Retorno plano 3 años vs +28% S&P Materials. Una vez establecida posición LIN/APD, reducir a 0.25% del portfolio.',
    impact: 'Libera ~$8K para LIN o APD',
    source: 'Materials',
    triggerPrice: null,
    filters: { business: 7, moat: 4, management: 6, valuation: 6, conviction: null },
    reasoning: {
      business: 'Eastman Chemical: polímeros especializados, aditivos, fibras. Comprensible aunque diversificado en múltiples segmentos.',
      moat: 'Químicos especializados tienen algo de moat por know-how técnico pero son esencialmente commodities en ciclo. Sin escaladores de precio estructurales.',
      management: 'Gestión razonable, dividendo creciente pero lento. Capital allocation sin grandes errores.',
      valuation: 'Valoración relativa aceptable pero retorno plano 3 años vs sector. Con LIN/APD disponibles a valoraciones similares con mejor calidad, es oportunidad de coste elevado.',
    },
    devilsAdvocate: 'EMN tiene proyectos de química circular (reciclaje avanzado) que podrían generar múltiplo premium en 3-5 años si regulación favorece.',
    invalidation: 'Mantener si: LIN/APD ya establecidos en portfolio y EMN supera retorno sector 2 años consecutivos.',
  },
  // ── BUY ADDS: HIGH PRIORITY ───────────────────────────────────────────────
  {
    id: 'jnj-buy',
    ticker: 'JNJ',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: '62 años de subidas consecutivas — Dividend King. AAA credit (uno de 2 en EE.UU.). Safety 9/10. Post-spin Kenvue, foco en farma/dispositivos de alta rentabilidad. Ausencia más importante en healthcare.',
    impact: 'Target 2-3% NLV. 150-200 acc a ~$160 = $24-32K',
    source: 'Healthcare',
    triggerPrice: 160,
    filters: { business: 9, moat: 9, management: 8, valuation: 7, conviction: null },
    reasoning: {
      business: 'Dos segmentos post-Kenvue: Farmacéutica (Stelara, Darzalex, Erleada) + MedTech (dispositivos quirúrgicos, ortopedia). Claro y ejecutado con disciplina.',
      moat: 'AAA credit — uno de 2 en EE.UU. ROIC >15% consistente. 62 años de subidas dividendo incluye 2001, 2008, 2020. Pipeline Stelara en biosimilar cliff pero offset por Darzalex + Erleada en oncología.',
      management: 'Track record impecable de asignación de capital. Spin de Kenvue para enfocarse en márgenes más altos. Recompras disciplinadas. Talc litigation activa pero cuantificable.',
      valuation: 'Yield ~3.1% vs histórico 2.7% (descuento). FCF yield 6.5%. Post-Kenvue más caro en múltiplos pero menor calidad de earnings. Fair-to-slightly-cheap.',
    },
    devilsAdvocate: 'Stelara biosimilar erosión 2025-2027 es real. Litigación talco con $15B+ potencial settlement no está totalmente descontada. Pharma pipeline FDA risk.',
    invalidation: 'Vender si: biosimilar Stelara erosión >60% en 2 años SIN sustitución OR litigación talco settlement >$15B OR FDA rechaza >2 candidatos principales del pipeline.',
  },
  {
    id: 'lmt-buy',
    ticker: 'LMT',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: 'Mayor empresa de defensa por ingresos ($75.1B). F-35: $2T de valor vida, mantenimiento hasta 2070. Yield 2.8%, DGR 7%, ciclo secular de gasto en defensa. Zero exposición defensa en portfolio.',
    impact: 'Target 1.5% NLV (~$25K). Fase 1: 1% (~$16K).',
    source: 'Industrials',
    triggerPrice: null,
    filters: { business: 9, moat: 9, management: 8, valuation: 7, conviction: null },
    reasoning: {
      business: 'Defensa: F-35 (caza de 5ª generación), misiles (Javelin, HIMARS, PAC-3), sistemas espaciales, helicópteros Sikorsky. Revenue $75.1B. Clarísimo.',
      moat: 'F-35: $2T valor vida útil + mantenimiento hasta 2070. Solo LMT puede hacer esto. Backlog $165B (2.2 años revenue). Regulatorio + know-how técnico + relaciones gobierno = foso triple.',
      management: 'Jim Taiclet desde 2020: disciplina capital allocation, recompras agresivas a múltiplos razonables, DGR 7% consistente.',
      valuation: 'P/E ~18x vs histórico 16-20x. Fair value con FCF yield ~5.5%. Ciclo secular de defensa no descontado. Múltiples gobiernos aumentando % PIB en defensa.',
    },
    devilsAdvocate: 'Riesgo presupuesto federal DOGE. F-35 tiene overruns de coste históricos. Concentración en gobierno EEUU >70% revenue — riesgo de cliente único.',
    invalidation: 'Reconsiderar si: reducción presupuesto defensa USA >15% OR F-35 programa cancelado OR ROIC cae bajo 15% por 2 años.',
  },
  {
    id: 'unp-buy',
    ticker: 'UNP',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: 'Mejor ferrocarril de EE.UU. Mejor operating ratio del sector (60.3%). Yield 2.3%, DGR 9%, 17 años de subidas. Peaje sobre la economía norteamericana. Zero exposición rail en portfolio.',
    impact: 'Target 1.5% NLV (~$25K). Fase 1: 1% (~$16K).',
    source: 'Industrials',
    triggerPrice: null,
    filters: { business: 9, moat: 10, management: 8, valuation: 7, conviction: null },
    reasoning: {
      business: 'Ferrocarril: 32,000 millas de vías en el oeste de EEUU. Mueve carbón, grano, automóviles, contenedores, productos químicos. El modo más eficiente de transporte terrestre.',
      moat: 'Duopolio regulado en EEUU. Duplicar la infraestructura ferroviaria es físicamente imposible. ROIC 15%+ consistente durante décadas. Buffett lo describe como "economía de la nación".',
      management: 'Jim Vena (CEO desde 2023): PSR implementation, operating ratio líder del sector 60.3%. Recompras agresivas. DGR 9% mantenido.',
      valuation: 'P/E ~21x, en línea con histórico. Yield 2.3% — bajo en absoluto pero los recompras compensan. FCF yield ~4.5%. No es barato pero la calidad justifica prima.',
    },
    devilsAdvocate: 'Nearshoring/reshoring puede cambiar patrones de carga. PSR (precisión ferroviaria) tiene riesgo de servicio al cliente. Competencia de camiones en rutas cortas.',
    invalidation: 'Reconsiderar si: operating ratio sube >65% por 2 años consecutivos OR regulación ferroviaria aumenta significativamente OR recession profunda reduce volúmenes >20%.',
  },
  {
    id: 'msft-buy',
    ticker: 'MSFT',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: 'Omisión más obvia del portfolio. $71.6B FCF FY25. 22 años de subidas, DGR 10%. Azure + AI Copilot = el mayor buildout de infraestructura en la historia. AAA credit. Único compoundador tecnológico de primera en ausencia.',
    impact: 'Target 2% NLV (~$33K). 1-2% del portfolio.',
    source: 'Tech',
    triggerPrice: null,
    filters: { business: 9, moat: 10, management: 9, valuation: 6, conviction: null },
    reasoning: {
      business: 'Tres nubes: Azure (IaaS/PaaS), Productivity (Office365/Teams), Personal Computing (Windows/Xbox). $71.6B FCF. El negocio más claro en tecnología.',
      moat: 'Switching costs insuperables: Office365 en 1.4B personas, Azure en >60% Fortune 500, GitHub en 100M devs, Xbox ecosystem. ROIC >25%. Widening moat en AI (OpenAI partnership).',
      management: 'Satya Nadella: transformó Microsoft de 2014. AAA credit. Capital allocation impecable: recompras + dividendo creciente + adquisiciones estratégicas (LinkedIn, GitHub, Activision).',
      valuation: 'P/E ~32x — premium vs histórico. Yield 0.7% es simbólico. El caso de compra es crecimiento: Azure +29% YoY, Copilot monetización iniciando. FCF yield ~3.5%. No barato pero calidad suprema.',
    },
    devilsAdvocate: 'Valoración implica perfección. Si Azure crecimiento desacelera a <20% o OpenAI partnership genera pérdidas estructurales, el múltiplo de 32x es indefendible.',
    invalidation: 'Reconsiderar si: Azure revenue growth <15% por 2 trimestres OR regulación antimonopolio fuerza desinversión de activos clave OR FCF margin comprime >500bps.',
  },
  {
    id: 'avgo-buy',
    ticker: 'AVGO',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: 'Segunda omisión más obvia. Custom silicon para Google/Meta/Apple — mayor beneficiario del buildout AI. DGR 12.8% → de $0.32/año a $6+/año en 10 años. FCF payout 41%.',
    impact: 'Target 1-2% NLV (~$16-33K). Más volátil que MSFT → posición menor.',
    source: 'Tech',
    triggerPrice: null,
    filters: { business: 8, moat: 9, management: 8, valuation: 6, conviction: null },
    reasoning: {
      business: 'Semiconductores: ASICs personalizados para Google TPU/Meta MTIA/Apple. Software de infraestructura (VMware post-adquisición). Más complejo que MSFT pero comprensible.',
      moat: 'Custom silicon requiere 3-5 años de co-desarrollo con el cliente = switching cost altísimo. Google y Meta NO pueden cambiar de proveedor fácilmente. ROIC >30%.',
      management: 'Hock Tan: máquina de adquisiciones (CA Technologies, Symantec, VMware). DGR 12.8% sostenido. FCF payout 41% = enorme colchón. Capital allocation agresivo y disciplinado.',
      valuation: 'P/E ~30x post-VMware. FCF yield ~4%. Premium por crecimiento AI justified. AI semiconductor TAM siendo el mayor crecimiento en décadas. Yield 1.5% pero DGR compensa.',
    },
    devilsAdvocate: 'Google y Meta están desarrollando capacidad in-house a largo plazo. Si uno de los tres hiperescaladores principales reduce dependencia, ingresos AVGO se comprimen significativamente.',
    invalidation: 'Vender si: Google/Meta/Apple cancelan contratos custom silicon OR VMware integración destruye >$5B FCF OR ROIC cae bajo 20%.',
  },
  {
    id: 'nee-buy',
    ticker: 'NEE',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: 'Mejor utility eléctrica. FPL + renovables. 26 años de subidas, DGR 9.8% (más alto sub-sector). AI data centers firman PPAs con NEE. Zero exposición utilities en portfolio.',
    impact: 'Target 1.5% NLV (~$25K). Iniciar ~300 acc a ≤$82.',
    source: 'Utilities',
    triggerPrice: 82,
    filters: { business: 8, moat: 8, management: 8, valuation: 7, conviction: null },
    reasoning: {
      business: 'FPL (Florida Power & Light, eléctrica regulada) + NextEra Energy Resources (renovables, mayor de EEUU). Dos negocios distintos pero complementarios.',
      moat: 'FPL: monopolio regulado en Florida (crecimiento poblacional secular). NEER: mayor portfolio eólico+solar del mundo, escala hace proyectos más baratos. PPAs a 20+ años.',
      management: 'John Ketchum: DGR 9.8% comprometido hasta 2026. Adquisición renovables sin destrucción de valor. Capital allocation a energía limpia + base regulada = combinación ganadora.',
      valuation: 'Yield ~3.2% a $82 vs histórico 2.5-3%. Presión tasas ha comprimido el precio. AI datacenters firmando PPAs con NEE = catalizador real. Precio ≤$82 = punto de entrada razonable.',
    },
    devilsAdvocate: 'Tasas altas perjudican utilities apalancadas (NEE tiene $60B+ deuda). NextEra Partners (NEP) ha sufrido — las complicaciones de la estructura holding pueden sorprender.',
    invalidation: 'Vender si: DGR guidance reducido bajo 6% OR regulación Florida adversa OR NEP crisis contagia a la matriz.',
  },
  {
    id: 'lin-buy',
    ticker: 'LIN',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: 'Mayor empresa de gases industriales. Contratos take-or-pay 15-30 años. 33 años de subidas, DGR 9.5%, margen operativo 27%. La mayor convicción del sector Materials. Zero exposición gases industriales.',
    impact: 'Target 2% NLV (~$33K). ~75 acc a ≤$440.',
    source: 'Materials',
    triggerPrice: 440,
    filters: { business: 9, moat: 10, management: 9, valuation: 6, conviction: null },
    reasoning: {
      business: 'Gases industriales: oxígeno, nitrógeno, hidrógeno para hospitales, siderurgia, semiconductores, alimentaria. Contratos take-or-pay 15-30 años. Modelo clarísimo.',
      moat: 'Oligopolio mundial (LIN+APD+Air Products = >60% mercado). Plantas de producción co-localizadas con clientes = literalmente no pueden cambiar de proveedor. ROIC 15%+ durante décadas. 33 años de subidas.',
      management: 'Sanjiv Lamba: margen operativo 27% (mejor del sector). Post-merger Praxair-Linde ejecutado perfectamente. Recompras agresivas y disciplinadas.',
      valuation: 'P/E ~28x, premium a APD 22x. Yield 1.3% es bajo pero DGR 9.5% compensa en 10 años. FCF yield ~3.5%. Premium justificado por calidad superior pero no barato.',
    },
    devilsAdvocate: 'P/E 28x implica perfección. Si economía global se contrae significativamente, demanda industrial se reduce y contratos take-or-pay tienen cláusulas de renegociación.',
    invalidation: 'Revisar si: margen operativo cae bajo 23% OR P/E supera 35x OR APD a 22x ofrece mejor riesgo/retorno ajustado.',
  },
  {
    id: 'cvx-buy',
    ticker: 'CVX',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: '37 años consecutivos de subida sin excepción, incluyendo 2020. "Dividendo sagrado" — explicitado por el CFO en múltiples transcripts. Debt/EBITDA 0.97x. Zero exposición energía en portfolio.',
    impact: 'Target 2.5% NLV (~$33K). Mayor convicción energía.',
    source: 'Energy',
    triggerPrice: null,
    filters: { business: 8, moat: 7, management: 9, valuation: 7, conviction: null },
    reasoning: {
      business: 'Integrado: upstream (Permian, Kazakhstan, Australia LNG), downstream (refino), chemicals. Más complejo que un negocio puro pero management tiene claridad de propósito.',
      moat: 'Recursos naturales: Permian tiene breakeven $35-40/bbl. Kazakhstan TCO es irremplazable. Escala y balance (0.97x deuda/EBITDA) crean ventaja en ciclos bajos.',
      management: '"Dividendo sagrado" — explicitado por CFO en múltiples earnings calls. 37 años sin reducción incluyendo 2020 (WTI negativo). Hess adquisición añade Stabroek (Guyana) = crecimiento excepcional a bajo coste.',
      valuation: 'Yield ~4.5% con balance pristino. WTI $65-75 = zona confort para el dividendo. FCF yield ~6% a precios actuales. Valoración razonable a atractiva.',
    },
    devilsAdvocate: 'Transición energética acelerada podría comprimir múltiplos del sector más rápido de lo esperado. Kazakhstan tiene riesgo geopolítico. WTI bajo $55 durante 2+ años = presión dividendo.',
    invalidation: 'Vender si: WTI promedio <$55 durante 4 trimestres OR Hess deal no cierra y reasignan capital destructivamente OR ROIC cae bajo 10%.',
  },
  {
    id: 'ajg-buy',
    ticker: 'AJG',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: 'Mayor gap en Financials: zero seguros. Arthur J. Gallagher = corredor de seguros #1. 13 años de subidas, DGR 12%, foso duradero. Zero exposición seguros en portfolio.',
    impact: 'Target 1-1.5% NLV (~$16-25K). Prioridad 1 seguros.',
    source: 'Financials',
    triggerPrice: null,
    filters: { business: 8, moat: 8, management: 8, valuation: 6, conviction: null },
    reasoning: {
      business: 'Corredor de seguros: AJG actúa de intermediario entre empresas/particulares y aseguradoras. Ingresos por comisiones = no toma riesgo de suscripción. Modelo de flujos muy limpio.',
      moat: 'Relaciones con clientes corporativos son pegajosas (switching cost alto). Especialización sectorial (educación, healthcare, gobierno) difícil de replicar. Escala da acceso a mejores condiciones.',
      management: 'Pat Gallagher (familia fundadora): DGR 12% sostenido, modelo M&A de bolt-ons ejecutado sin destrucción de valor. 13 años de subidas.',
      valuation: 'P/E ~27x premium al sector pero justificado por calidad. Yield 1.2% — compounder puro. FCF yield ~4%. No barato pero el track record de la familia Gallagher cotiza con prima merecida.',
    },
    devilsAdvocate: 'Corredores de seguros son sensibles a ciclos de primas. Si mercado de seguros se "suaviza" (bajan primas), las comisiones se comprimen. Competencia de MMC y AON es feróz.',
    invalidation: 'Revisar si: DGR cae bajo 8% OR M&A bolt-on genera deterioro de márgenes OR ciclo de primas de seguros se invierte fuertemente.',
  },
  {
    id: 'jpm-buy',
    ticker: 'JPM',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: 'Mejor banco mega-cap. 14 años de subidas, balance fortaleza. Zero exposición banca en portfolio. Portfolios dividenderos típicos 10-15% en Financials; usuario en 6.2% con posiciones problemáticas.',
    impact: 'Target 1-2% NLV (~$16-33K).',
    source: 'Financials',
    triggerPrice: null,
    filters: { business: 8, moat: 8, management: 9, valuation: 7, conviction: null },
    reasoning: {
      business: 'Banco universal: retail banking, investment banking, asset management, commercial banking. Complejo pero comprensible a nivel macroestructural.',
      moat: 'Mayor banco de EEUU por activos. Escala inalcanzable: $3.9T activos, network effects en investment banking. Jamie Dimon ha construido ventajas competitivas en cada segmento.',
      management: 'Jamie Dimon: el mejor banquero de su generación. 14 años de subidas dividendo. Capital allocation ejemplar (recompras en correcciones, no en picos). Ningún banco gestionó 2008-2023 mejor.',
      valuation: 'P/TBV ~1.9x — premium a sector pero justificado por ROTCE 20%+. Yield 2.5%, P/E ~12x vs sector 10x. Descuento por ser "banco" vs "compounder".',
    },
    devilsAdvocate: 'Riesgo regulatorio bancario siempre presente. Sucesor de Dimon es la gran incógnita. Exposición a sector inmobiliario comercial puede traer sorpresas negativas.',
    invalidation: 'Reconsiderar si: ROTCE cae bajo 15% por 2 años OR regulación Basel IV impacta >$5B capital requerido inesperadamente OR Dimon sale sin sucesor claro.',
  },
  {
    id: 'hrl-buy',
    ticker: 'HRL',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: '59 años de subidas — Dividend King. Spam, Planters, Skippy. Net Debt/EBITDA 0.8x (el más bajo en alimentos). DGR 5.5% = doble del promedio sectorial. El único nombre Tier 1 que falta en packaged food.',
    impact: '$8-12K. Destino capital de FLO/CAG/CPB.',
    source: 'ConsumerStaples',
    triggerPrice: 31,
    filters: { business: 9, moat: 7, management: 8, valuation: 8, conviction: null },
    reasoning: {
      business: 'Spam (líder global enlatados proteicos), Skippy (peanut butter), Planters (frutos secos), Jennie-O (pavo). Portafolio diversificado en proteínas y snacks.',
      moat: 'Spam es una marca con moat cultural real (Asia-Pacífico + EEUU). Skippy líder en PB. Posicionamiento premium en proteínas convenientes = pricing power moderado.',
      management: 'Jim Snee: 59 años de subidas dividendo sin interrupción. Net Debt/EBITDA 0.8x — el balance más limpio del sector. DGR 5.5% = el doble del promedio sectorial.',
      valuation: 'Yield ~4.2% a $31 = atractivo vs histórico 2.5-3%. P/E ~18x en mínimos de 10 años. Precio ha caído desde $52 (2022) por concerns de márgenes post-inflación. Entrada excelente.',
    },
    devilsAdvocate: 'HRL enfrenta presión de marca propia (private label) en categorías como PB y frutos secos. Jennie-O pavo es volátil por gripe aviar. Crecimiento orgánico lento.',
    invalidation: 'Reconsiderar si: DGR cae bajo 3% OR Net Debt/EBITDA sube por encima de 2.5x OR adquisición transformativa a múltiplos premium.',
  },
  {
    id: 'duk-buy',
    ticker: 'DUK',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: 'Utility eléctrica defensiva, regulación Southeast (mejor del país). 20 años de subidas, yield 4.1%, plan capex $145B 2025-2029. Más barata que SO en 2 múltiplos con mejor crecimiento.',
    impact: 'Target 1% NLV (~$16.6K). ~150 acc a ≤$110.',
    source: 'Utilities',
    triggerPrice: 110,
    filters: { business: 8, moat: 8, management: 7, valuation: 8, conviction: null },
    reasoning: {
      business: 'Eléctrica regulada en Carolinas, Florida, Indiana. 8.4M clientes. Capex masivo en renovables + grid modernization. Modelo de utility regulada clásico.',
      moat: 'Monopolio regulado en estados con regulación favorable y crecimiento poblacional secular (Southeast). Capex $145B 2025-2029 = tarifa regulada futura garantizada.',
      management: 'Lynn Good: 20 años de subidas, transición energética ejecutada. Yield 4.1% con DGR 5-6%. Capital allocation hacia renovables + base regulada.',
      valuation: 'Yield 4.1% vs histórico 3.5-4%. P/E ~17x vs SO a 20x. Más barata que Southern Company con mejor regulación. Tasas altas han comprimido precio = oportunidad.',
    },
    devilsAdvocate: 'Utility con $60B+ deuda es sensible a tasas. Capex masivo requiere emisión de deuda y equity regularmente. Regulación puede volverse menos favorable.',
    invalidation: 'Revisar si: DGR guidance reducido bajo 4% OR regulador Carolina/Florida rechaza aumento de tarifa mayor OR tasas largo plazo suben >6% de forma sostenida.',
  },
  {
    id: 'epd-buy',
    ticker: 'EPD',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: 'Rey del midstream. 27 años de subidas. 50K millas de pipeline, yield 6.5%, payout 55% del DCF. Familia Duncan 32% ownership = alineación excepcional. Prioridad 2 en energía.',
    impact: 'Target 2% NLV (~$27K).',
    source: 'Energy',
    triggerPrice: null,
    filters: { business: 8, moat: 9, management: 9, valuation: 8, conviction: null },
    reasoning: {
      business: 'Midstream: 50K millas de pipeline, 14 fractionators, terminales LNG. Mover gas/NGL/petróleo de producción a mercado. Tarifas de peaje reguladas = revenue predecible.',
      moat: 'Duplicar 50K millas de pipeline físicamente imposible. Certificaciones ambientales y derechos de paso = barreras regulatorias insuperables. ROIC consistente 12%+.',
      management: 'Familia Duncan 32% ownership directa = alineación accionista excepcional. 27 años subidas distribucion. Payout 55% DCF = el más conservador del midstream. Sin MLP recortes históricos.',
      valuation: 'Yield 6.5% con payout 55% DCF = colchón enorme. EV/EBITDA ~10x vs histórico 12x. Premium por calidad de gestión y balance. Mejor risk/reward en midstream.',
    },
    devilsAdvocate: 'MLP con estructura compleja (K-1 tax reporting). Transición energética a largo plazo reduce demanda de infraestructura fósil. Natural gas like commodity exposed.',
    invalidation: 'Revisar si: distribución reducida OR payout DCF supera 70% OR familia Duncan reduce participación significativamente.',
  },
  {
    id: 'apd-buy',
    ticker: 'APD',
    action: 'BUY',
    timeframe: 'buy_add',
    reason: '43 años de subidas — Dividend Aristocrat. Gases industriales, duopolio con LIN. Yield 3.0% (mejor que LIN 1.3%), DGR 10%. 22x forward vs LIN 28x. Apuesta adicional en hidrógeno verde.',
    impact: 'Target 1.5% NLV (~$25K). ~85 acc a ≤$290.',
    source: 'Materials',
    triggerPrice: 290,
    filters: { business: 9, moat: 9, management: 7, valuation: 7, conviction: null },
    reasoning: {
      business: 'Gases industriales: atmosféricos (O2, N2, Ar) + proceso (H2, CO). Contratos on-site y a largo plazo. Similar a LIN pero con mayor apuesta en hidrógeno verde.',
      moat: 'Mismo oligopolio que LIN. Plantas on-site = switching cost estructural. 43 años de subidas. ROIC 12%+ sostenido.',
      management: 'Seifollah Ghasemi: hidrógeno verde apuesta ambiciosa pero cara. Transición CEO a Eduardo Menezes genera algo de incertidumbre. DGR 10% comprometido.',
      valuation: 'P/E 22x vs LIN 28x = 27% descuento con mismo moat esencial. Yield 3.0% vs LIN 1.3% = mejor income actual. Si hidrógeno verde funciona = upside enorme.',
    },
    devilsAdvocate: 'Proyectos hidrógeno verde requieren $7B+ inversión con retornos inciertos a 10+ años. CEO transition crea incertidumbre de ejecución. LIN puede ser la opción más segura.',
    invalidation: 'Revisar si: DGR cae bajo 6% OR proyectos hidrógeno verde acumulan write-offs >$2B OR ROIC cae bajo 10%.',
  },
  // ── OPPORTUNISTIC: WAIT FOR TRIGGER ──────────────────────────────────────
  {
    id: 'vici-add',
    ticker: 'VICI',
    action: 'ADD',
    timeframe: 'opportunistic',
    reason: 'Mayor REIT de mayor convicción. Escalador CPI único (90% renta linked). Añadir agresivamente a $24-25 en cualquier corrección relacionada con Caesars.',
    impact: 'Añadir 400 acc → ~$10,400 adicional. Target total 1,600 acc.',
    source: 'REITs',
    triggerPrice: 25,
    filters: { business: 9, moat: 8, management: 8, valuation: 8, conviction: null },
    reasoning: {
      business: 'REIT de gaming: propietario de Caesars Palace, MGM Grand, Venetian. Arrendamiento triple-net a operadores. 90% renta ajustada al CPI = hedge inflación estructural.',
      moat: 'Activos únicos e irreemplazables (Caesars Palace no puede ser duplicado). Contratos 30-40 años no cancelables. Operadores no pueden relocar propiedades físicamente.',
      management: 'Ed Pitoniak: CEO fundacional, arquitecto del modelo VICI. DGR 8%+ comprometido. Sin deuda a corto plazo preocupante.',
      valuation: 'A $24-25: yield ~5.8-6%, P/AFFO ~12x (descuento a NAV). Cualquier corrección por noticias de Caesars = señal de entrada, no de alarma (VICI cobra renta, no opera casinos).',
    },
    devilsAdvocate: 'Si Caesars o MGM quiebran en recesión profunda, VICI tendría que encontrar nuevo operador. Triple-net no es 100% riesgo-libre. Concentración en gaming puede tener múltiplo cap en expansión.',
    invalidation: 'Revisar si: operador principal (Caesars) en proceso concursal OR cambio regulatorio que limita gaming en EEUU OR AFFO payout supera 90%.',
  },
  {
    id: 'nnn-add',
    ticker: 'NNN',
    action: 'ADD',
    timeframe: 'opportunistic',
    reason: 'REIT individual de mayor convicción en portfolio. Target 3% NLV, actualmente 1.6%. Acumular agresivamente. Destino natural de CLPR + MDV reciclados.',
    impact: 'Añadir 300 acc → ~$12,800. Target total 900 acc.',
    source: 'REITs',
    triggerPrice: 42.77,
    filters: { business: 9, moat: 8, management: 9, valuation: 8, conviction: null },
    reasoning: {
      business: 'Triple-net REIT diversificado: 3,500 propiedades en EEUU. Inquilinos: tiendas de conveniencia, restaurantes fast casual, talleres auto. Modelo clarísimo.',
      moat: 'Diversificación máxima (3,500 propiedades, 380+ inquilinos, 37 estados). 35 años de subidas dividendo = Dividend Aristocrat. Balance conservador vs peers.',
      management: 'Steve Horn: 35 años de subidas sin interrupción. Nunca cortaron durante 2008-2009. Reciclaje capital disciplinado. Ratio de cobertura del dividendo muy conservador.',
      valuation: 'Yield ~5.3% a $42.77. P/AFFO ~13x — descuento histórico por tasas altas. FCF yield justifica precio. Cuando tasas bajen, múltiplo se expande.',
    },
    devilsAdvocate: 'Exposición a retail físico: convenience stores y fast casual son resistentes pero no inmunes a e-commerce. Concentración en inquilinos "brick and mortar" puede ser headwind secular.',
    invalidation: 'Revisar si: dividendo reducido (35 años sin hacerlo) OR tasa de ocupación cae bajo 97% OR AFFO payout supera 80%.',
  },
  {
    id: 'krg-add',
    ticker: 'KRG',
    action: 'ADD',
    timeframe: 'opportunistic',
    reason: '12x P/FFO vs peers 16-18x — gap de 4 múltiplos que debería cerrarse. $622M reciclaje de activos 2025. Añadir agresivamente por debajo de $23.',
    impact: 'Añadir 300 acc → ~$7,400. Target total 800 acc.',
    source: 'REITs',
    triggerPrice: 23,
    filters: { business: 7, moat: 6, management: 7, valuation: 9, conviction: null },
    reasoning: {
      business: 'REIT de strip centers y open-air retail. Propiedades como centros comerciales de barrio con supermercado anchor. Modelo comprensible.',
      moat: 'Open-air retail tiene resiliencia vs malls cerrados (más conveniente, menos afectado por e-commerce). Posición en mercados secundarios — no competencia directa con Kimco/Regency.',
      management: 'Reciclaje activos $622M 2025 = gestión activa del portfolio. Balance mejorado. Pero historial más corto que NNN o VICI.',
      valuation: '12x P/FFO vs peers 16-18x = descuento 30%+ sin justificación fundamental clara. Esto es la principal tesis: cierre del gap de valoración.',
    },
    devilsAdvocate: 'Mercados secundarios tienen menos liquidez y crecimiento de rentas más lento. Inquilinos como Dollar General/Dollar Tree bajo presión. Gap P/FFO puede ser permanente por menor calidad percibida.',
    invalidation: 'Revisar si: tasa de ocupación cae bajo 93% OR 2 inquilinos principales en bancarrota OR P/FFO gap no se cierra en 2 años a pesar de fundamentales.',
  },
  {
    id: 'rexr-add',
    ticker: 'REXR',
    action: 'ADD',
    timeframe: 'opportunistic',
    reason: 'Mejor punto de entrada de REXR desde 2018. 51M sqft SoCal infill irreemplazable. Yield 5.3%, ~1.06x book. Añadir <$32.',
    impact: 'Añadir 200 acc → ~$6,600. Target total 600 acc.',
    source: 'REITs',
    triggerPrice: 32,
    filters: { business: 8, moat: 9, management: 8, valuation: 8, conviction: null },
    reasoning: {
      business: 'Industrial REIT en SoCal infill: almacenes de última milla Los Angeles/Orange County. Los contenedores de Amazon y del Puerto de Long Beach.',
      moat: 'Terreno en SoCal infill literalmente no se puede crear. 51M sqft en mercados donde construir nuevo es casi imposible. Rentas al vencimiento gap: 50%+ renta de mercado vs contractual.',
      management: 'Howard Schwimmer: ejecutor disciplinado de rents mark-to-market. Adquisiciones en el ciclo bajo. Sin apalancamiento excesivo.',
      valuation: '~1.06x book = mínimo histórico moderno. Yield 5.3% — inusual para REXR que normalmente cotiza 2-3%. El mercado está descontando oversupply en logistics que no es aplicable a SoCal infill.',
    },
    devilsAdvocate: 'E-commerce desaceleración reduce demanda de almacenes. Rentas industriales en general bajo presión. Los inquilinos de Amazon podrían renegociar agresivamente.',
    invalidation: 'Revisar si: tasa de ocupación cae bajo 95% OR rentas mark-to-market gap se cierra significativamente OR P/NAV vuelve a 1.3x sin mejora fundamental.',
  },
  {
    id: 'owl-add',
    ticker: 'OWL',
    action: 'ADD',
    timeframe: 'opportunistic',
    reason: '9x FRE vs 19x peers. 85% permanent capital. 20 trimestres consecutivos de crecimiento FRE. -60% desde máximos. Valor intrínseco $14-15 (+66%). Yield 10.4%.',
    impact: 'Añadir 500-1000 acc a ~$8.64. Target total 1.2% NLV.',
    source: 'Financials',
    triggerPrice: 9,
    filters: { business: 6, moat: 7, management: 7, valuation: 9, conviction: null },
    reasoning: {
      business: 'Gestor de activos alternativos: crédito privado, private equity, real estate. Complejo pero "permanent capital" = el AUM no se va con volatilidad de mercado.',
      moat: 'Acceso a deal flow en crédito privado = moat de relaciones. 85% permanent capital es defensivo. Pero el sector tiene competencia feroz (Apollo, Ares, Blackstone).',
      management: 'Doug Ostrover y Marc Lipschultz: 20 trimestres de crecimiento FRE consecutivo. Co-CEOs con skin in the game. Track record sólido aunque empresa relativamente joven.',
      valuation: '9x FRE vs peers 19x = descuento 53%. Yield 10.4%. Intrinsic value $14-15 vs precio ~$8.64 (+66% upside si gap se cierra). Valuación más atractiva en los alternativos.',
    },
    devilsAdvocate: 'Crédito privado puede tener ciclo de default peor de lo esperado si recesión profunda. -60% desde máximos puede ser señal de problemas estructurales, no de mero oversell.',
    invalidation: 'Revisar si: FRE crecimiento para (<5% YoY) OR distribución reducida OR AUM cae por problemas de performance en fondos principales.',
  },
  {
    id: 'trow-add',
    ticker: 'TROW',
    action: 'ADD',
    timeframe: 'opportunistic',
    reason: '39 años de subidas, zero deuda LP, $3.4B cash. 10x PER con 5.8% yield. Mejor calidad en Financials a valoración dislocada. Acumular en correcciones.',
    impact: 'Target 1.5-2% NLV (actualmente 1.3%).',
    source: 'Financials',
    triggerPrice: 85,
    filters: { business: 9, moat: 7, management: 8, valuation: 9, conviction: null },
    reasoning: {
      business: 'Gestora de activos activos: fondos de acciones, bonos, target-date. 39 años de subidas. AUM ~$1.5T. Negocio de comisiones sobre AUM — muy claro.',
      moat: 'Marca reconocida, fondos target-date en planes de pensiones = sticky (los participantes no suelen cambiar). Pero gestión activa bajo presión secular de ETFs/pasivos.',
      management: 'Rob Sharps: zero deuda LP, $3.4B cash — balance pristino en la industria. 39 años de subidas sin reducción. Capital allocation: recompras agresivas a 10x PER.',
      valuation: '10x PER, yield 5.8% = valoración de empresa en quiebra para una empresa sin deuda con $3.4B cash. El mercado descuenta decadencia de gestión activa excesivamente.',
    },
    devilsAdvocate: 'Flujos salientes de gestión activa son seculares y aceleran. AUM caída = ingresos caída. Si mercados tienen corrección sostenida, fee base se comprime y dividendo en riesgo.',
    invalidation: 'Revisar si: AUM cae >20% sin recuperación en 2 años OR DGR cae bajo 3% OR ROIC cae bajo 15%.',
  },
  {
    id: 'ko-wait',
    ticker: 'KO',
    action: 'WAIT',
    timeframe: 'opportunistic',
    reason: '63 años Dividend King. 9/10 safety. Opción gratis sobre fallo IRS Eleventh Circuit (probabilidad 70-75%). No se tiene en portfolio. Acumular agresivamente <$70.',
    impact: 'Target 2-3% NLV ($33-50K) a ≤$70.',
    source: 'ConsumerStaples',
    triggerPrice: 70,
    filters: { business: 10, moat: 10, management: 9, valuation: 6, conviction: null },
    reasoning: {
      business: 'Coca-Cola. La marca más conocida del planeta. Concentrado + distribución. Modelo de negocio que cualquier persona de 12 años puede explicar en 10 segundos.',
      moat: 'Marca con moat cultural de décadas en 200+ países. Red de distribución de frío irremplazable. ROIC 20%+ histórico. 63 años de subidas dividendo = Dividend King definitivo.',
      management: 'James Quincey: pricing power demostrado post-inflación. Portfolio diversificado (Sprite, Fanta, Dasani, Smartwater). Caso IRS ($3.3B dispute) es el principal riesgo gestionado.',
      valuation: 'Yield ~3.2% a $70 vs histórico 3.0-3.5%. P/E ~23x — premium pero merecido para la calidad. Caso IRS = posible viento de cola (probabilidad fallo en favor de KO 70-75% según análisis Eleventh Circuit).',
    },
    devilsAdvocate: 'KO a $70+ no es barato. Fallo IRS adverso podría costar $3.3B + intereses. GLP-1 (Ozempic) es un riesgo emergente para las bebidas azucaradas si se generaliza.',
    invalidation: 'No comprar sobre $75 (yield <2.8%). Reducir si fallo IRS adverso Y costo total >$5B.',
  },
  {
    id: 'awk-buy',
    ticker: 'AWK',
    action: 'BUY',
    timeframe: 'opportunistic',
    reason: 'Única utility de agua a escala nacional. Mayor foso estructural del sector. 18 años de subidas, DGR 8.5%, crece por mandatos EPA + M&A municipales. Safety 9.5/10.',
    impact: 'Target 1% NLV (~$16.6K). ~130 acc a ≤$125.',
    source: 'Utilities',
    triggerPrice: 125,
    filters: { business: 9, moat: 10, management: 8, valuation: 7, conviction: null },
    reasoning: {
      business: 'Agua potable y aguas residuales en 14 estados de EEUU. Monopolio regulado. La infraestructura más crítica y menos discutida.',
      moat: 'Mayor foso del sector utilities: agua es imposible de sustituir, regulación de monopolio natural, nadie puede poner un segundo sistema de agua en una ciudad. ROIC consistente. Safety 9.5/10.',
      management: 'M. Susan Hardwick: modelo M&A municipal (municipios venden sistemas de agua pequeños a AWK para profesionalizar) = crecimiento estructural. 18 años subidas, DGR 8.5%.',
      valuation: 'Yield ~2.3% a $125 — bajo en absoluto pero el DGR 8.5% compensa en 10 años. P/E ~30x premium por calidad. Tasas altas han deprimido el precio desde $185 máximos.',
    },
    devilsAdvocate: 'Mandatos EPA de mejora de infraestructura requieren capex masivo (PFAS, plomo). Financiación puede comprimir retornos a corto plazo.',
    invalidation: 'Reconsiderar si: DGR cae bajo 6% OR regulación desfavorable en estados clave OR capex PFAS supera estimaciones en >$1B sin compensación tarifaria.',
  },
  {
    id: 'cop-buy',
    ticker: 'COP',
    action: 'BUY',
    timeframe: 'opportunistic',
    reason: 'Mejor asignación de capital E&P. FCF breakeven $35/bbl. 30+ años Tier 1 Permian/Alaska. Framework explícito: 30% CFO devuelto. Yield base 3.5% + dividendo variable trimestral.',
    impact: 'Target 1.5% NLV (~$20K). Construir en correcciones WTI <$65.',
    source: 'Energy',
    triggerPrice: null,
    filters: { business: 8, moat: 7, management: 9, valuation: 7, conviction: null },
    reasoning: {
      business: 'E&P puro: Permian Basin, Alaska, Qatar LNG. Más simple que las integradas. Sin refino ni química que compliquen el análisis.',
      moat: 'Tier 1 acreage en Permian = geología no replicable. FCF breakeven $35/bbl = el mejor buffer del sector. Alaska North Slope = activo irremplazable.',
      management: 'Ryan Lance: "Return of Capital Framework" explícito — 30% CFO a accionistas. Dividend variable + recompras en función del precio del petróleo. La mejor disciplina de capital del E&P puro.',
      valuation: 'Yield base 3.5% + variable. A WTI $65 = FCF yield ~8%. Estrategia de construcción en correcciones: a precios bajos del petróleo es cuando se obtiene mejor precio con mismo moat.',
    },
    devilsAdvocate: 'E&P puro tiene exposición 100% a precio del petróleo. Diversificación limitada vs integradas. Marathon Oil adquisición añade complejidad y deuda.',
    invalidation: 'Revisar si: FCF breakeven sube >$50/bbl por 2 años OR Ryan Lance abandona Return of Capital Framework OR deuda neta/EBITDA supera 1.5x.',
  },
  {
    id: 'abbv-watch',
    ticker: 'ABBV',
    action: 'BUY',
    timeframe: 'opportunistic',
    reason: '51 años de subidas (combinado Abbott). Skyrizi/Rinvoq reemplazan Humira. Yield ~3.4%, DGR 6.8%, safety 8/10. Complementa JNJ con portfolio terapéutico diferente.',
    impact: 'Target 1-1.5% NLV si disposición de aumentar concentración pharma.',
    source: 'Healthcare',
    triggerPrice: null,
    filters: { business: 8, moat: 8, management: 8, valuation: 7, conviction: null },
    reasoning: {
      business: 'Biofarmacéutica: Humira (declining), Skyrizi+Rinvoq (inmunología creciente), Botox (AbbVie post-Allergan). Pipeline oncológico. Más complejo que JNJ pero los tres pilares son comprensibles.',
      moat: 'Skyrizi+Rinvoq crecen >25% YoY compensando erosión Humira. Botox tiene moat de marca + clinical switching cost. Patentes y I+D = foso de innovación.',
      management: 'Richard Gonzalez: 51 años subidas (combinado Abbott). Allergan adquisición = genialidad estratégica (Botox). DGR 6.8% mantenido post-Humira cliff = credibilidad altísima.',
      valuation: 'Yield 3.4% vs histórico 3.8% (descuento). P/E ~16x en pleno Humira cliff = mercado sobredescuenta el riesgo. Skyrizi+Rinvoq ya superando Humira en ingresos.',
    },
    devilsAdvocate: 'Concentración en dos productos (Skyrizi+Rinvoq) tras la diversificación post-Humira. Si biosimilares o nuevos entrantes atacan IL-23/JAK, ABBV tiene el mismo problema que tenía con Humira.',
    invalidation: 'Revisar si: Skyrizi o Rinvoq pierden formulary coverage en >3 grandes PBMs OR pipeline oncológico tiene >2 fracasos Phase 3 en 12 meses.',
  },
  {
    id: 'cube-add',
    ticker: 'CUBE',
    action: 'ADD',
    timeframe: 'opportunistic',
    reason: 'Recompra masiva autorizada (10M acc = 5.3% del float). Self-storage: rendimiento aún más alto que PSA/EXR. Añadir <$35.',
    impact: 'Añadir 100 acc → ~$3,865. Target total 300 acc.',
    source: 'REITs',
    triggerPrice: 35,
    filters: { business: 9, moat: 7, management: 7, valuation: 8, conviction: null },
    reasoning: {
      business: 'Self-storage REIT. Clientes alquilan unidades de almacenamiento personal/negocio. Revenue = renta mensual. El modelo más simple del sector REIT.',
      moat: 'Self-storage tiene switching costs reales (¿quién traslada sus cosas?). Ubicación lo es todo. CUBE menor que PSA/EXR pero con recompras que compensan la prima por escala.',
      management: 'Autorización recompra 10M acc = 5.3% float a precio actual. Management comprando acciones propias = señal de subvaloración según insiders.',
      valuation: 'Yield superior a PSA y EXR. P/AFFO ~15x — menor que PSA 20x. Recompras a precio actual son el catalizador de valor explícito.',
    },
    devilsAdvocate: 'Self-storage enfrenta oversupply en muchos mercados post-2020. Las recompras compensan dilución pero no garantizan crecimiento. CUBE es tier-2 vs PSA en calidad de activos.',
    invalidation: 'Revisar si: ocupación cae bajo 90% OR management para recompras sin explicación OR P/AFFO gap con PSA se cierra sin mejora de fundamentales.',
  },
  {
    id: 'spgi-watch',
    ticker: 'SPGI',
    action: 'BUY',
    timeframe: 'opportunistic',
    reason: '52 años Dividend King. 42% margen operativo. FCF $5.5B. Monopolio calificación crediticia. El mayor compounder de dividendos que no tiene Microsoft. DGR 13.2% en 5 años.',
    impact: 'Target 1-2% NLV. Comprar en cualquier corrección >10%.',
    source: 'Tech',
    triggerPrice: null,
    filters: { business: 9, moat: 10, management: 9, valuation: 6, conviction: null },
    reasoning: {
      business: 'S&P Global: calificaciones crediticias (S&P Ratings), datos de mercado (Market Intelligence), índices (S&P 500), analytics (Platts commodities). Cuatro negocios pero todos son "datos financieros".',
      moat: 'Calificación crediticia: duopolio S&P/Moody\'s con barreras regulatorias. Índices S&P 500 = estándar global ineludible. Market Intelligence = switching cost extremo. DGR 13.2% = ROIC excepcional.',
      management: 'Doug Peterson: fusión con IHS Markit ejecutada excelentemente. 52 años subidas dividendo = Dividend King. FCF $5.5B con 42% margen operativo.',
      valuation: 'P/E ~35x — premium significativo. Yield 0.9% simbólico. El caso de compra es en correcciones: si cae 10%+ el múltiplo se vuelve más digerible para la calidad ofrecida.',
    },
    devilsAdvocate: 'Regulación post-2008 nunca ha llegado a calificadoras pero riesgo latente. P/E 35x implica perfección de crecimiento. Cualquier desaceleración en issuance de deuda impacta directamente.',
    invalidation: 'No comprar sobre $500 (P/E >38x). Revisar si: regulación reestructura oligopolio calificadoras OR DGR cae bajo 8% OR margen operativo comprime bajo 35%.',
  },
  {
    id: 'gqg-add',
    ticker: 'GQG',
    action: 'ADD',
    timeframe: 'opportunistic',
    reason: 'Margen operativo 81%. Yield 11.4% a A$1.70. AUM creció de $0 a $150B+ en una década. Acumular agresivamente <A$1.60.',
    impact: 'Target 0.5-1% NLV (actualmente 0.15%).',
    source: 'Financials',
    triggerPrice: 1.60,
    filters: { business: 7, moat: 6, management: 8, valuation: 9, conviction: null },
    reasoning: {
      business: 'Gestora de activos activa: fondos de renta variable internacional, emergentes, global. Fundada 2016, listada en ASX. Modelo simple pero en mercado competitivo.',
      moat: 'Track record de Rajiv Jain (CIO) = la razón por la que el AUM creció de $0 a $150B+. Es un moat de persona, no estructural = mayor riesgo key-man.',
      management: 'Rajiv Jain: track record excepcional en gestión activa de mercados emergentes/internacionales. 81% margen operativo = disciplina de costes extrema. Distribución de la mayoría del FCF.',
      valuation: 'Yield 11.4% a A$1.70 con payout >95% del beneficio. P/E ~7x para un negocio con 81% margen. La dislocación parece reflejo de concerns sobre gestión activa secular, no de problemas específicos.',
    },
    devilsAdvocate: 'Rajiv Jain es el moat — si se va, el AUM podría salir rápidamente. Gestión activa secular headwind. AUM concentrado en pocos fondos = fee compression riesgo.',
    invalidation: 'Salida inmediata si: Rajiv Jain anuncia salida O AUM cae >20% en 12 meses sin causa de mercado O distribución reducida.',
  },
];

const TIMEFRAME_META = {
  urgent:        { label: 'URGENTE', sublabel: 'Esta semana', color: 'var(--red)',    bg: 'rgba(255,69,58,.10)',  border: 'rgba(255,69,58,.25)'  },
  buy_add:       { label: 'COMPRAR',  sublabel: 'Próximo mes', color: 'var(--green)', bg: 'rgba(48,209,88,.08)',  border: 'rgba(48,209,88,.20)'  },
  opportunistic: { label: 'ESPERAR',  sublabel: 'Con trigger',  color: 'var(--gold)',  bg: 'rgba(200,164,78,.08)', border: 'rgba(200,164,78,.20)' },
};

const ACTION_META = {
  SELL:  { label: 'VENDER', color: 'var(--red)'   },
  TRIM:  { label: 'RECORTAR', color: '#ff9f0a'      },
  BUY:   { label: 'COMPRAR', color: 'var(--green)'  },
  ADD:   { label: 'AÑADIR',  color: 'var(--green)'  },
  WAIT:  { label: 'ESPERAR', color: 'var(--gold)'   },
};

const STATUS_META = {
  pending: { label: 'Pendiente', color: 'var(--text-secondary)' },
  done:    { label: 'Hecho',     color: 'var(--green)'           },
  ignored: { label: 'Ignorado',  color: 'var(--text-tertiary)'   },
};

function loadStatuses() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveStatuses(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

// ── IB Order Generator helpers ───────────────────────────────────────────────

// For SELL: qty comes from the impact text when it mentions "acc" (shares)
// e.g. "Vender 200 acc" → 200. Falls back to placeholder.
function parseQtyFromImpact(impact) {
  if (!impact) return null;
  const m = impact.match(/(\d[\d,]*)\s*acc/);
  if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  return null;
}

// Build a single IB order string.
// format: "ACTION QTY TICKER STK SMART LMT PRICE DAY"
// When price is unknown, emits a bracketed placeholder.
function buildIBOrderString(action) {
  const { ticker, action: side, triggerPrice, impact } = action;
  const isSell = side === 'SELL' || side === 'TRIM';

  let qty;
  if (isSell || side === 'TRIM') {
    qty = parseQtyFromImpact(impact) ?? '[QTY]';
  } else {
    // For BUY/ADD, impact text sometimes has "150-200 acc" — grab first number
    const parsed = parseQtyFromImpact(impact);
    qty = parsed ?? '[QTY]';
  }

  let price;
  if (triggerPrice != null) {
    price = Number(triggerPrice).toFixed(2);
  } else {
    price = '[PRICE]';
  }

  const ibSide = isSell ? 'SELL' : 'BUY';
  return `${ibSide} ${qty} ${ticker} STK SMART LMT ${price} DAY`;
}

// Build IB Basket CSV for a list of actions (skipping WAIT/WAIT-type that have no clear qty)
function buildBasketCSV(actionList) {
  const header = 'Action,Quantity,Symbol,SecType,Exchange,OrderType,LmtPrice,Tif';
  const rows = actionList.map(a => {
    const isSell = a.action === 'SELL' || a.action === 'TRIM';
    const ibSide = isSell ? 'SELL' : 'BUY';
    const qty = parseQtyFromImpact(a.impact) ?? '';
    const price = a.triggerPrice != null ? Number(a.triggerPrice).toFixed(2) : '';
    return `${ibSide},${qty},${a.ticker},STK,SMART,LMT,${price},DAY`;
  });
  return [header, ...rows].join('\n');
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Single action card ───────────────────────────────────────────────────────
function ActionCard({ action, status, onStatusChange, onTickerClick, copyFeedback, onCopy }) {
  const tf = TIMEFRAME_META[action.timeframe];
  const am = ACTION_META[action.action] || ACTION_META.BUY;
  const sm = STATUS_META[status];
  const isDone = status === 'done';
  const isIgnored = status === 'ignored';

  return (
    <div style={{
      background: isIgnored ? 'var(--subtle-bg)' : tf.bg,
      border: `1px solid ${isIgnored ? 'var(--border)' : tf.border}`,
      borderRadius: 10,
      padding: '12px 14px',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      opacity: isIgnored ? 0.45 : isDone ? 0.65 : 1,
    }}>
      {/* Left: status toggle */}
      <button
        onClick={() => {
          const next = status === 'pending' ? 'done' : status === 'done' ? 'ignored' : 'pending';
          onStatusChange(action.id, next);
        }}
        title={`Estado: ${sm.label} — clic para cambiar`}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          border: `2px solid ${sm.color}`,
          background: isDone ? sm.color : 'transparent',
          cursor: 'pointer', flexShrink: 0, marginTop: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: isDone ? '#fff' : sm.color,
        }}
      >
        {isDone ? '✓' : isIgnored ? '—' : ''}
      </button>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
          <button
            onClick={() => onTickerClick(action.ticker)}
            style={{
              fontFamily: 'var(--fm)', fontSize: 15, fontWeight: 800,
              color: am.color, background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, letterSpacing: '.5px',
            }}
          >
            {action.ticker}
          </button>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '.8px',
            color: am.color, padding: '2px 7px',
            background: `${am.color}18`,
            borderRadius: 4, fontFamily: 'var(--fm)',
            border: `1px solid ${am.color}40`,
          }}>
            {am.label}
          </span>
          <span style={{
            fontSize: 9, color: tf.color, fontWeight: 700, fontFamily: 'var(--fb)',
            letterSpacing: '.3px',
          }}>
            {tf.sublabel}
          </span>
          {action.triggerPrice && (
            <span style={{
              fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--fm)',
              background: 'rgba(200,164,78,.10)', padding: '2px 7px',
              borderRadius: 4, border: '1px solid rgba(200,164,78,.3)',
            }}>
              trigger ≤${action.triggerPrice}
            </span>
          )}
          <span style={{
            fontSize: 8, color: 'var(--text-tertiary)', fontWeight: 600, marginLeft: 'auto',
            fontFamily: 'var(--fb)', letterSpacing: '.3px', textTransform: 'uppercase',
          }}>
            {action.source}
          </span>
        </div>

        {/* Reason */}
        <div style={{
          fontSize: 11, color: isDone || isIgnored ? 'var(--text-tertiary)' : 'var(--text-secondary)',
          lineHeight: 1.5, marginBottom: 6, fontFamily: 'var(--fb)',
        }}>
          {action.reason}
        </div>

        {/* 5-Filter Framework badge */}
        {action.filters && (
          <div style={{ marginBottom: 6 }}>
            <FiveFiltersBadge
              filters={action.filters}
              reasoning={action.reasoning}
              devilsAdvocate={action.devilsAdvocate}
              invalidation={action.invalidation}
              action={action.action}
            />
          </div>
        )}

        {/* Impact + IB order button row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <div style={{
            fontSize: 10, color: 'var(--text-tertiary)',
            fontFamily: 'var(--fm)', letterSpacing: '.2px', flex: 1,
          }}>
            {action.impact}
          </div>
          {/* IB Order button */}
          <button
            onClick={() => onCopy(action)}
            title="Copiar orden IB al portapapeles"
            style={{
              flexShrink: 0,
              padding: '3px 9px',
              borderRadius: 5,
              border: copyFeedback === action.id
                ? '1px solid var(--green)'
                : '1px solid var(--border)',
              background: copyFeedback === action.id
                ? 'rgba(48,209,88,.10)'
                : 'var(--subtle-bg)',
              color: copyFeedback === action.id
                ? 'var(--green)'
                : 'var(--text-tertiary)',
              fontSize: 9, fontWeight: 600, fontFamily: 'var(--fm)',
              cursor: 'pointer', letterSpacing: '.3px',
              transition: 'all .2s',
            }}
          >
            {copyFeedback === action.id ? 'Copiado ✓' : 'Copiar orden IB'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ActionPlanTab() {
  // All useState/useRef BEFORE any useCallback/useMemo (TDZ safety)
  const [statuses, setStatuses] = useState(() => loadStatuses());
  const [filter, setFilter] = useState('all'); // all | pending | done | ignored
  const [sectionFilter, setSectionFilter] = useState('all'); // all | urgent | buy_add | opportunistic
  const [searchQ, setSearchQ] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(null); // action.id of last copied
  const [basketFeedback, setBasketFeedback] = useState(false);
  const copyTimerRef = useRef(null);
  const basketTimerRef = useRef(null);

  const handleStatusChange = useCallback((id, next) => {
    setStatuses(prev => {
      const updated = { ...prev, [id]: next };
      saveStatuses(updated);
      return updated;
    });
  }, []);

  const handleTickerClick = useCallback((ticker) => {
    // Dispatch custom event that App.jsx listens to for opening analysis
    window.dispatchEvent(new CustomEvent('open-company', { detail: { ticker } }));
  }, []);

  const handleCopyIBOrder = useCallback((action) => {
    const orderStr = buildIBOrderString(action);
    navigator.clipboard.writeText(orderStr).catch(() => {
      // Fallback for non-secure contexts
      try {
        const ta = document.createElement('textarea');
        ta.value = orderStr;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    });
    setCopyFeedback(action.id);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyFeedback(null), 1800);
  }, []);

  const handleExportBasket = useCallback((actionList) => {
    const csv = buildBasketCSV(actionList);
    downloadCSV(csv, `ib-basket-${new Date().toISOString().slice(0, 10)}.csv`);
    setBasketFeedback(true);
    if (basketTimerRef.current) clearTimeout(basketTimerRef.current);
    basketTimerRef.current = setTimeout(() => setBasketFeedback(false), 2000);
  }, []);

  const filteredActions = useMemo(() => {
    return ACTIONS.filter(a => {
      const status = statuses[a.id] || 'pending';
      if (filter !== 'all' && status !== filter) return false;
      if (sectionFilter !== 'all' && a.timeframe !== sectionFilter) return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        if (!a.ticker.toLowerCase().includes(q) && !a.reason.toLowerCase().includes(q) && !a.source.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [statuses, filter, sectionFilter, searchQ]);

  // Counts for header badges
  const counts = useMemo(() => {
    const out = { urgent: 0, buy_add: 0, opportunistic: 0, pending: 0, done: 0 };
    ACTIONS.forEach(a => {
      const status = statuses[a.id] || 'pending';
      out[a.timeframe]++;
      if (status === 'pending') out.pending++;
      if (status === 'done') out.done++;
    });
    return out;
  }, [statuses]);

  const grouped = useMemo(() => {
    const groups = { urgent: [], buy_add: [], opportunistic: [] };
    filteredActions.forEach(a => { groups[a.timeframe].push(a); });
    return groups;
  }, [filteredActions]);

  const sectionOrder = ['urgent', 'buy_add', 'opportunistic'];

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Data freshness banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', marginBottom: 12, borderRadius: 8,
        background: 'rgba(255,159,10,.08)', border: '1px solid rgba(255,159,10,.25)',
        fontSize: 11, color: '#ff9f0a', fontFamily: 'var(--fb)',
      }}>
        <span style={{ fontWeight: 700 }}>Aviso:</span>
        <span>
          Acciones extraidas de sector deep-dives del{' '}
          <span style={{ fontFamily: 'var(--fm)', fontWeight: 700 }}>{DEEP_DIVE_DATE}</span>.
          Actualizadas el{' '}
          <span style={{ fontFamily: 'var(--fm)', fontWeight: 700 }}>{DEEP_DIVE_DATE}</span>.
          {' '}Los precios y fundamentales pueden haber cambiado.
        </span>
      </div>

      {/* Header */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '16px 18px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--fd)', letterSpacing: '.3px' }}>
              Plan de Acción — Sector Deep-Dives
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', marginTop: 3, letterSpacing: '.3px' }}>
              {ACTIONS.length} acciones extraídas de 9 informes sectoriales · Abril 2026
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'URGENTE', val: counts.urgent, color: 'var(--red)' },
              { label: 'COMPRAR', val: counts.buy_add, color: 'var(--green)' },
              { label: 'ESPERAR', val: counts.opportunistic, color: 'var(--gold)' },
              { label: 'HECHOS', val: counts.done, color: 'var(--text-tertiary)' },
            ].map(b => (
              <div key={b.label} style={{
                textAlign: 'center', padding: '6px 12px',
                background: 'var(--subtle-bg)', borderRadius: 8,
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: b.color, fontFamily: 'var(--fm)' }}>{b.val}</div>
                <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontWeight: 700, letterSpacing: '.5px' }}>{b.label}</div>
              </div>
            ))}
            {/* IB Basket CSV export — exports all visible filtered actions */}
            <button
              onClick={() => handleExportBasket(filteredActions)}
              title="Descargar CSV para IB Basket Trader con todas las acciones visibles"
              style={{
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                border: basketFeedback
                  ? '1px solid var(--green)'
                  : '1px solid var(--border)',
                background: basketFeedback
                  ? 'rgba(48,209,88,.10)'
                  : 'var(--subtle-bg)',
                color: basketFeedback ? 'var(--green)' : 'var(--text-secondary)',
                fontSize: 10, fontWeight: 700, fontFamily: 'var(--fm)',
                letterSpacing: '.3px', transition: 'all .2s',
                alignSelf: 'flex-start',
              }}
            >
              {basketFeedback ? 'Descargado ✓' : 'Basket CSV'}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {counts.done > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4, fontFamily: 'var(--fb)' }}>
              Progreso: {counts.done}/{ACTIONS.length} acciones completadas
            </div>
            <div style={{ background: 'var(--border)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
              <div style={{
                width: `${(counts.done / ACTIONS.length) * 100}%`,
                height: '100%', background: 'var(--green)', borderRadius: 4,
                transition: 'width .4s ease',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Section filter */}
        {[
          { val: 'all', label: 'Todas' },
          { val: 'urgent', label: 'Urgente' },
          { val: 'buy_add', label: 'Comprar' },
          { val: 'opportunistic', label: 'Esperar' },
        ].map(f => (
          <button key={f.val} onClick={() => setSectionFilter(f.val)} style={{
            padding: '5px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 600,
            fontFamily: 'var(--fb)', transition: 'all .15s',
            background: sectionFilter === f.val ? 'var(--gold-dim)' : 'var(--subtle-bg)',
            border: `1px solid ${sectionFilter === f.val ? 'var(--gold)' : 'var(--border)'}`,
            color: sectionFilter === f.val ? 'var(--gold)' : 'var(--text-tertiary)',
          }}>
            {f.label}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Status filter */}
        {[
          { val: 'all', label: 'Todo' },
          { val: 'pending', label: 'Pendiente' },
          { val: 'done', label: 'Hecho' },
          { val: 'ignored', label: 'Ignorado' },
        ].map(f => (
          <button key={f.val} onClick={() => setFilter(f.val)} style={{
            padding: '5px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 600,
            fontFamily: 'var(--fb)', transition: 'all .15s',
            background: filter === f.val ? 'var(--subtle-bg)' : 'transparent',
            border: `1px solid ${filter === f.val ? 'var(--border)' : 'transparent'}`,
            color: filter === f.val ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}>
            {f.label}
          </button>
        ))}

        {/* Search */}
        <input
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="Buscar ticker o razón..."
          style={{
            marginLeft: 'auto', padding: '5px 10px', borderRadius: 7, fontSize: 11,
            fontFamily: 'var(--fb)', background: 'var(--subtle-bg)',
            border: '1px solid var(--border)', color: 'var(--text-primary)',
            width: 200, outline: 'none',
          }}
        />
      </div>

      {/* Action groups */}
      {sectionOrder.map(tf => {
        const items = grouped[tf];
        if (!items || items.length === 0) return null;
        const meta = TIMEFRAME_META[tf];
        return (
          <div key={tf} style={{ marginBottom: 20 }}>
            {/* Section header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
              paddingBottom: 6, borderBottom: `1px solid ${meta.border}`,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '1px',
                color: meta.color, fontFamily: 'var(--fb)',
                textTransform: 'uppercase',
              }}>
                {meta.label}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)' }}>
                {meta.sublabel}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, color: meta.color,
                background: meta.bg, padding: '1px 7px', borderRadius: 10,
                fontFamily: 'var(--fm)', border: `1px solid ${meta.border}`,
              }}>
                {items.length}
              </span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(a => (
                <ActionCard
                  key={a.id}
                  action={a}
                  status={statuses[a.id] || 'pending'}
                  onStatusChange={handleStatusChange}
                  onTickerClick={handleTickerClick}
                  copyFeedback={copyFeedback}
                  onCopy={handleCopyIBOrder}
                />
              ))}
            </div>
          </div>
        );
      })}

      {filteredActions.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', fontSize: 13,
        }}>
          No hay acciones para los filtros seleccionados.
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 24, padding: '10px 14px',
        background: 'var(--subtle-bg)', borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)',
        letterSpacing: '.3px', lineHeight: 1.6,
      }}>
        Fuentes: REITs · Tech · Healthcare · ConsumerStaples · Industrials · Financials · Utilities · Materials · Energy — Deep-Dive Reports (April 2026, Opus 4.7). Cada recomendación evaluada con el A&R Decision Framework (5 Filtros). Filtro 5 (Convicción) es tuyo — no puede ser delegado. El estado de cada acción se guarda localmente en el navegador. Clic en el ticker para abrir el análisis completo.
      </div>
    </div>
  );
}
