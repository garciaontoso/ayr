import { useState, useCallback, useMemo, useRef } from 'react';

// ── Action Plan Tab ─────────────────────────────────────────────────────────
// Aggregates ALL recommendations from 9 sector deep-dives into a single
// prioritized actionable list. Hardcoded from April 2026 reports.
// localStorage key: action_plan_status_v1  (map of id→status)

const STORAGE_KEY = 'action_plan_status_v1';
const DEEP_DIVE_DATE = '2026-04-18'; // Date of sector deep-dives this plan was extracted from

// ── Master action list extracted from sector deep-dives ──────────────────────
// Fields: id, ticker, action, timeframe, reason, impact, source, triggerPrice
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
          lineHeight: 1.5, marginBottom: 5, fontFamily: 'var(--fb)',
        }}>
          {action.reason}
        </div>

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
        Fuentes: REITs · Tech · Healthcare · ConsumerStaples · Industrials · Financials · Utilities · Materials · Energy — Deep-Dive Reports (April 2026, Opus 4.7). El estado de cada acción se guarda localmente en el navegador. Clic en el ticker para abrir el análisis completo de la empresa.
      </div>
    </div>
  );
}
