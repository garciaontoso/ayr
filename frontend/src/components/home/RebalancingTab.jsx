// RebalancingTab — Rebalancing Calculator
//
// Computes exact buy/sell orders to move from current to target sector weights.
// Pre-populated from sector dive recommendations (April 2026).
// All user edits (targets, selections, notes) persist in localStorage.
//
// Hook order (TDZ-safe): all useState/useRef BEFORE all useEffect.
import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_TARGETS   = 'rebalance_targets_v1';
const LS_ACTIONS   = 'rebalance_actions_v1';
const LS_SUBTAB    = 'rebalance_subtab_v1';
const LS_NLV       = 'rebalance_nlv_v1';

// Default sector targets (current % from portfolio, target % from sector dives)
const DEFAULT_SECTORS = [
  { id:'reits',       lbl:'REITs',              current:14.0, target:12.0, color:'#60a5fa' },
  { id:'tech',        lbl:'Technology',          current: 5.7, target:13.0, color:'#a78bfa' },
  { id:'healthcare',  lbl:'Healthcare',          current:10.0, target:11.0, color:'#34d399' },
  { id:'industrials', lbl:'Industrials',         current: 3.8, target:10.0, color:'#fb923c' },
  { id:'staples',     lbl:'Consumer Staples',    current:40.0, target:30.0, color:'#fbbf24' },
  { id:'financials',  lbl:'Financials',          current: 8.5, target: 9.0, color:'#f472b6' },
  { id:'energy',      lbl:'Energy',              current: 0.0, target: 5.0, color:'#f87171' },
  { id:'utilities',   lbl:'Utilities',           current: 0.0, target: 3.0, color:'#6ee7b7' },
  { id:'materials',   lbl:'Materials',           current: 0.0, target: 4.0, color:'#93c5fd' },
  { id:'comms',       lbl:'Communication Svcs',  current: 4.0, target: 3.0, color:'#c4b5fd' },
  { id:'other',       lbl:'Other / Cash',        current:14.0, target: 0.0, color:'#94a3b8' },
];

// Pre-populated specific actions from sector dives
const DEFAULT_ACTIONS = [
  // ── SELLS ──
  { id:'sell-clpr',  side:'SELL', ticker:'CLPR',  name:'Clipper Realty',     pct:100, wt:0.8, reason:'Below-par REIT; yield trap, weak AFFO coverage',      phase:1, checked:true  },
  { id:'sell-flo',   side:'SELL', ticker:'FLO',   name:'Flowers Foods',      pct:100, wt:1.2, reason:'Secular bread decline; dividend at risk',              phase:1, checked:true  },
  { id:'sell-mdv',   side:'SELL', ticker:'MDV',   name:'Modiv Industrial',   pct: 50, wt:0.5, reason:'Small-cap illiquid REIT; trim to partial position',     phase:1, checked:true  },
  { id:'sell-ahrt',  side:'SELL', ticker:'AHRT',  name:'American Heartland', pct:100, wt:0.4, reason:'Micro-cap; no analyst coverage, replace with LMT/CAT', phase:1, checked:true  },
  // ── BUYS — Industrials (high conviction) ──
  { id:'buy-lmt',    side:'BUY',  ticker:'LMT',   name:'Lockheed Martin',    pct:null, wt:1.5, reason:'Defense moat; 22-yr Dividend Aristocrat; backlog $170B', phase:1, checked:true  },
  { id:'buy-unp',    side:'BUY',  ticker:'UNP',   name:'Union Pacific',      pct:null, wt:1.5, reason:'Railroad duopoly; pricing power; 10%+ DGR 10y',          phase:1, checked:true  },
  { id:'buy-cat',    side:'BUY',  ticker:'CAT',   name:'Caterpillar',        pct:null, wt:1.0, reason:'Infra cycle beneficiary; 30-yr Aristocrat',             phase:1, checked:true  },
  { id:'buy-cmi',    side:'BUY',  ticker:'CMI',   name:'Cummins',            pct:null, wt:1.0, reason:'Power transition play (H2 engines); solid FCF',         phase:2, checked:true  },
  // ── BUYS — Technology ──
  { id:'buy-msft',   side:'BUY',  ticker:'MSFT',  name:'Microsoft',          pct:null, wt:2.0, reason:'Cloud + AI dominance; 20-yr div growth; AAA balance',   phase:1, checked:true  },
  { id:'buy-avgo',   side:'BUY',  ticker:'AVGO',  name:'Broadcom',           pct:null, wt:1.5, reason:'AI networking ASICs + VMware integration; 13-yr DGR',   phase:2, checked:true  },
  { id:'buy-txn',    side:'BUY',  ticker:'TXN',   name:'Texas Instruments',  pct:null, wt:1.5, reason:'Analog monopoly; capex super-cycle finished 2025',       phase:2, checked:true  },
  // ── BUYS — Financials ──
  { id:'buy-spgi',   side:'BUY',  ticker:'SPGI',  name:'S&P Global',         pct:null, wt:1.0, reason:'Ratings duopoly; recurring rev; 50-yr Dividend King',    phase:2, checked:true  },
  { id:'buy-jpm',    side:'BUY',  ticker:'JPM',   name:'JPMorgan Chase',     pct:null, wt:0.8, reason:'Best-in-class bank; fortress balance sheet',              phase:2, checked:true  },
  { id:'buy-ajg',    side:'BUY',  ticker:'AJG',   name:'Arthur J Gallagher', pct:null, wt:0.8, reason:'Insurance broker oligopoly; 14% 10y DGR',                phase:2, checked:true  },
  { id:'buy-cb',     side:'BUY',  ticker:'CB',    name:'Chubb',              pct:null, wt:0.7, reason:'P&C pricing cycle top; Warren Buffett-owned',            phase:3, checked:false },
  { id:'buy-v',      side:'BUY',  ticker:'V',     name:'Visa',               pct:null, wt:1.0, reason:'Payments toll-road; 16-yr div growth; asset-light',      phase:3, checked:false },
  // ── BUYS — Healthcare ──
  { id:'buy-jnj',    side:'BUY',  ticker:'JNJ',   name:'Johnson & Johnson',  pct:null, wt:1.0, reason:'62-yr Dividend King; Pharma + MedTech split done',       phase:1, checked:true  },
  { id:'buy-abt',    side:'BUY',  ticker:'ABT',   name:'Abbott Labs',        pct:null, wt:0.8, reason:'Diagnostics + devices; ~10% DGR; post-COVID re-rate',    phase:2, checked:true  },
  { id:'buy-abbv',   side:'BUY',  ticker:'ABBV',  name:'AbbVie',             pct:null, wt:0.8, reason:'Humira cliff behind; Skyrizi/Rinvoq ramping fast',       phase:2, checked:true  },
  // ── BUYS — Energy ──
  { id:'buy-cvx',    side:'BUY',  ticker:'CVX',   name:'Chevron',            pct:null, wt:1.5, reason:'37-yr Aristocrat; Hess acquisition; AA-rated',            phase:2, checked:true  },
  { id:'buy-epd',    side:'BUY',  ticker:'EPD',   name:'Enterprise Products', pct:null, wt:1.0, reason:'Midstream MLP; 7% yield; 25-yr div growth',              phase:2, checked:true  },
  { id:'buy-cop',    side:'BUY',  ticker:'COP',   name:'ConocoPhillips',     pct:null, wt:0.8, reason:'Low break-even ($40/bbl); variable + base div strategy', phase:3, checked:false },
  // ── BUYS — Utilities ──
  { id:'buy-nee',    side:'BUY',  ticker:'NEE',   name:'NextEra Energy',     pct:null, wt:1.5, reason:'Largest US utility + renewables; 29-yr div growth',      phase:2, checked:true  },
  { id:'buy-duk',    side:'BUY',  ticker:'DUK',   name:'Duke Energy',        pct:null, wt:0.8, reason:'Southeast US regulated; 97-yr dividend history',          phase:3, checked:false },
  { id:'buy-awk',    side:'BUY',  ticker:'AWK',   name:'American Water Works',pct:null, wt:0.5, reason:'Water monopoly; 15-yr DGR; regulatory moat',             phase:3, checked:false },
  // ── BUYS — Materials ──
  { id:'buy-lin',    side:'BUY',  ticker:'LIN',   name:'Linde',              pct:null, wt:1.5, reason:'Industrial gas duopoly; 31-yr Aristocrat; pricing power', phase:2, checked:true  },
  { id:'buy-apd',    side:'BUY',  ticker:'APD',   name:'Air Products',       pct:null, wt:1.0, reason:'H2 infrastructure play; ~3% yield; 42-yr Aristocrat',     phase:2, checked:true  },
  { id:'buy-ppg',    side:'BUY',  ticker:'PPG',   name:'PPG Industries',     pct:null, wt:0.5, reason:'Aerospace coatings recovery; 53-yr div streak',           phase:3, checked:false },
];

// Phase metadata
const PHASES = [
  { id:1, lbl:'Fase 1 — Semana 1',       desc:'Salidas urgentes + entradas de alta convicción', color:'#f87171' },
  { id:2, lbl:'Fase 2 — Semanas 2-4',    desc:'Prioridad media, espera confirmación técnica',   color:'#fbbf24' },
  { id:3, lbl:'Fase 3 — Q2-Q3 2026',     desc:'Oportunistas con price triggers',                color:'#34d399' },
];

const SUB_TABS = [
  { id:'allocation', lbl:'Allocation' },
  { id:'actions',    lbl:'Acciones' },
  { id:'execution',  lbl:'Ejecución' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(v, decimals = 0) {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs).toLocaleString()}`;
  return `${sign}$${abs.toFixed(decimals)}`;
}

function fmtPct(v, places = 1) {
  if (v == null || isNaN(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(places)}%`;
}

function gapColor(gap) {
  if (Math.abs(gap) < 0.5) return 'var(--text-tertiary)';
  if (gap > 0) return '#34d399';   // needs more — green
  return '#f87171';                 // needs less — red
}

// ─── Section 1: Allocation Table ──────────────────────────────────────────────

function AllocationTable({ sectors, setSectors, nlv }) {
  const totalCurrent = sectors.reduce((s, r) => s + r.current, 0);
  const totalTarget  = sectors.reduce((s, r) => s + r.target,  0);

  function updateTarget(id, val) {
    setSectors(prev => prev.map(s => s.id === id ? { ...s, target: parseFloat(val) || 0 } : s));
  }

  const rows = sectors.map(s => {
    const gap    = s.target - s.current;
    const dollar = (gap / 100) * nlv;
    return { ...s, gap, dollar };
  });

  // Residual check
  const residual = totalTarget - 100;

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:6 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--fd)' }}>
          Allocation Actual vs Objetivo
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:10, color:'var(--text-tertiary)', fontFamily:'var(--fm)' }}>NLV base:</span>
          <span style={{ fontSize:12, fontWeight:700, color:'var(--gold)', fontFamily:'var(--fm)' }}>{fmt$(nlv)}</span>
          {Math.abs(residual) > 0.1 && (
            <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(251,191,36,.15)', color:'#fbbf24', fontFamily:'var(--fm)' }}>
              Suma objetivos: {fmtPct(totalTarget, 1)} {residual > 0 ? '(exceso)' : '(déficit)'}
            </span>
          )}
        </div>
      </div>

      {/* Header */}
      <div style={{ display:'grid', gridTemplateColumns:'160px 80px 90px 80px 110px', gap:4, marginBottom:4, paddingBottom:4, borderBottom:'1px solid var(--border)' }}>
        {['Sector','Actual %','Objetivo %','Gap','$ a Mover'].map((h,i) => (
          <div key={i} style={{ fontSize:9, fontWeight:600, color:'var(--text-tertiary)', fontFamily:'var(--fm)', textTransform:'uppercase', letterSpacing:.5, textAlign: i > 0 ? 'right' : 'left' }}>
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {rows.map(s => (
        <div key={s.id} style={{ display:'grid', gridTemplateColumns:'160px 80px 90px 80px 110px', gap:4, padding:'5px 0', borderBottom:'1px solid var(--subtle-bg)', alignItems:'center' }}>
          {/* Sector name with color dot */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:s.color, flexShrink:0 }} />
            <span style={{ fontSize:11, color:'var(--text-primary)', fontFamily:'var(--fb)' }}>{s.lbl}</span>
          </div>
          {/* Current % */}
          <div style={{ textAlign:'right', fontSize:11, color:'var(--text-secondary)', fontFamily:'var(--fm)' }}>
            {s.current.toFixed(1)}%
          </div>
          {/* Target — editable */}
          <div style={{ textAlign:'right' }}>
            <input
              type="number"
              value={s.target}
              min={0} max={100} step={0.5}
              onChange={e => updateTarget(s.id, e.target.value)}
              style={{
                width:60, textAlign:'right', padding:'2px 5px', borderRadius:4,
                border:'1px solid var(--border)', background:'var(--subtle-bg)',
                color:'var(--gold)', fontFamily:'var(--fm)', fontSize:11,
                outline:'none',
              }}
            />
            <span style={{ fontSize:10, color:'var(--text-tertiary)', fontFamily:'var(--fm)', marginLeft:2 }}>%</span>
          </div>
          {/* Gap */}
          <div style={{ textAlign:'right', fontSize:11, fontWeight:700, color:gapColor(s.gap), fontFamily:'var(--fm)' }}>
            {s.gap > 0 ? '+' : ''}{s.gap.toFixed(1)}%
          </div>
          {/* $ to move */}
          <div style={{ textAlign:'right', fontSize:11, fontWeight:600, color: s.dollar > 0 ? '#34d399' : s.dollar < 0 ? '#f87171' : 'var(--text-tertiary)', fontFamily:'var(--fm)' }}>
            {s.dollar !== 0 ? fmt$(s.dollar) : '—'}
          </div>
        </div>
      ))}

      {/* Totals row */}
      <div style={{ display:'grid', gridTemplateColumns:'160px 80px 90px 80px 110px', gap:4, padding:'6px 0 2px', borderTop:'1px solid var(--border)', marginTop:2 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--fm)' }}>TOTAL</div>
        <div style={{ textAlign:'right', fontSize:10, fontWeight:700, color: Math.abs(totalCurrent - 100) < 0.5 ? 'var(--green)' : '#fbbf24', fontFamily:'var(--fm)' }}>{totalCurrent.toFixed(1)}%</div>
        <div style={{ textAlign:'right', fontSize:10, fontWeight:700, color: Math.abs(totalTarget - 100) < 0.5 ? 'var(--green)' : '#fbbf24', fontFamily:'var(--fm)' }}>{totalTarget.toFixed(1)}%</div>
        <div />
        <div />
      </div>

      {/* Bar chart visualization */}
      <div style={{ marginTop:16 }}>
        <div style={{ fontSize:10, fontWeight:600, color:'var(--text-tertiary)', fontFamily:'var(--fm)', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>
          Comparación Visual
        </div>
        {rows.filter(s => s.current > 0 || s.target > 0).map(s => (
          <div key={s.id} style={{ marginBottom:6 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
              <span style={{ fontSize:9, color:'var(--text-secondary)', fontFamily:'var(--fb)' }}>{s.lbl}</span>
              <span style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fm)' }}>
                {s.current.toFixed(1)}% → {s.target.toFixed(1)}%
              </span>
            </div>
            <div style={{ position:'relative', height:10, background:'var(--subtle-bg)', borderRadius:5, overflow:'hidden' }}>
              {/* Current bar */}
              <div style={{ position:'absolute', top:0, left:0, width:`${Math.min(s.current, 100) * 2}%`, height:'50%', background:s.color, opacity:.5, borderRadius:'5px 5px 0 0' }} />
              {/* Target bar */}
              <div style={{ position:'absolute', bottom:0, left:0, width:`${Math.min(s.target, 100) * 2}%`, height:'50%', background:s.color, borderRadius:'0 0 5px 5px' }} />
            </div>
          </div>
        ))}
        <div style={{ display:'flex', gap:12, marginTop:6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:12, height:4, background:'var(--text-tertiary)', opacity:.5, borderRadius:2 }} />
            <span style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fb)' }}>Actual (arriba)</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:12, height:4, background:'var(--gold)', borderRadius:2 }} />
            <span style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fb)' }}>Objetivo (abajo)</span>
          </div>
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={() => setSectors(DEFAULT_SECTORS)}
        style={{ marginTop:14, fontSize:9, padding:'3px 8px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--text-tertiary)', cursor:'pointer', fontFamily:'var(--fm)' }}
      >
        Restaurar objetivos predeterminados
      </button>
    </div>
  );
}

// ─── Section 2: Actions Table ─────────────────────────────────────────────────

function ActionsTable({ actions, setActions, nlv }) {
  const [filterSide, setFilterSide] = useState('ALL');

  function toggle(id) {
    setActions(prev => prev.map(a => a.id === id ? { ...a, checked: !a.checked } : a));
  }

  const filtered = filterSide === 'ALL' ? actions : actions.filter(a => a.side === filterSide);
  const sells = actions.filter(a => a.side === 'SELL' && a.checked);
  const buys  = actions.filter(a => a.side === 'BUY'  && a.checked);

  const cashGenerated = sells.reduce((s, a) => s + (a.wt / 100) * nlv, 0);
  const cashNeeded    = buys.reduce((s, a) => s + (a.wt / 100) * nlv, 0);
  const netCash       = cashGenerated - cashNeeded;

  // Estimated tax impact: 10% WHT on US capital gains (China-US treaty context)
  // Simplified: 20% long-term CGT applied to gross proceeds as rough estimate
  const estTax = cashGenerated * 0.20;

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:6 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--fd)' }}>
          Acciones Recomendadas
        </div>
        {/* Summary pills */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <div style={{ padding:'3px 8px', borderRadius:5, background:'rgba(248,113,113,.12)', border:'1px solid rgba(248,113,113,.25)', fontSize:10, color:'#f87171', fontFamily:'var(--fm)', fontWeight:700 }}>
            SELL {fmt$(cashGenerated)} generado
          </div>
          <div style={{ padding:'3px 8px', borderRadius:5, background:'rgba(52,211,153,.12)', border:'1px solid rgba(52,211,153,.25)', fontSize:10, color:'#34d399', fontFamily:'var(--fm)', fontWeight:700 }}>
            BUY {fmt$(cashNeeded)} necesario
          </div>
          <div style={{ padding:'3px 8px', borderRadius:5, background: netCash >= 0 ? 'rgba(52,211,153,.08)' : 'rgba(248,113,113,.08)', border:`1px solid ${netCash >= 0 ? 'rgba(52,211,153,.2)' : 'rgba(248,113,113,.2)'}`, fontSize:10, color: netCash >= 0 ? '#34d399' : '#f87171', fontFamily:'var(--fm)', fontWeight:700 }}>
            NETO {fmt$(netCash)}
          </div>
          <div style={{ padding:'3px 8px', borderRadius:5, background:'rgba(251,191,36,.08)', border:'1px solid rgba(251,191,36,.2)', fontSize:10, color:'#fbbf24', fontFamily:'var(--fm)' }}>
            ~Impuesto {fmt$(estTax)} (est. 20% CGT)
          </div>
        </div>
      </div>

      {/* Filter buttons */}
      <div style={{ display:'flex', gap:4, marginBottom:8 }}>
        {[['ALL','Todo'],['SELL','Ventas'],['BUY','Compras']].map(([v,l]) => (
          <button key={v} onClick={() => setFilterSide(v)}
            style={{ padding:'3px 10px', borderRadius:5, border:`1px solid ${filterSide===v?'var(--gold)':'var(--border)'}`, background:filterSide===v?'var(--gold-dim)':'transparent', color:filterSide===v?'var(--gold)':'var(--text-tertiary)', fontSize:10, cursor:'pointer', fontFamily:'var(--fb)', fontWeight:filterSide===v?700:500 }}>
            {l}
          </button>
        ))}
        <div style={{ marginLeft:'auto', fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fm)', alignSelf:'center' }}>
          {actions.filter(a=>a.checked).length} de {actions.length} seleccionadas
        </div>
      </div>

      {/* Header */}
      <div style={{ display:'grid', gridTemplateColumns:'20px 55px 90px 55px 80px 1fr 60px', gap:4, padding:'3px 0', borderBottom:'1px solid var(--border)', marginBottom:2 }}>
        {['','Tipo','Ticker','% Cartera','$ Estimado','Razón','Fase'].map((h,i) => (
          <div key={i} style={{ fontSize:9, fontWeight:600, color:'var(--text-tertiary)', fontFamily:'var(--fm)', textTransform:'uppercase', letterSpacing:.5, textAlign: i === 3 || i === 4 ? 'right' : 'left' }}>
            {h}
          </div>
        ))}
      </div>

      {filtered.map(a => {
        const dollar = (a.wt / 100) * nlv;
        const sellPct = a.pct != null && a.pct < 100 ? ` (${a.pct}%)` : '';
        return (
          <div key={a.id} style={{ display:'grid', gridTemplateColumns:'20px 55px 90px 55px 80px 1fr 60px', gap:4, padding:'5px 0', borderBottom:'1px solid var(--subtle-bg)', alignItems:'start', opacity: a.checked ? 1 : 0.45 }}>
            {/* Checkbox */}
            <input type="checkbox" checked={a.checked} onChange={() => toggle(a.id)}
              style={{ width:13, height:13, cursor:'pointer', accentColor:'var(--gold)', marginTop:2 }} />
            {/* Side badge */}
            <div style={{ padding:'2px 5px', borderRadius:4, background: a.side==='SELL' ? 'rgba(248,113,113,.15)' : 'rgba(52,211,153,.12)', border:`1px solid ${a.side==='SELL'?'rgba(248,113,113,.3)':'rgba(52,211,153,.25)'}`, textAlign:'center' }}>
              <span style={{ fontSize:9, fontWeight:700, color: a.side==='SELL' ? '#f87171' : '#34d399', fontFamily:'var(--fm)' }}>
                {a.side}{sellPct}
              </span>
            </div>
            {/* Ticker + name */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--fm)' }}>{a.ticker}</div>
              <div style={{ fontSize:8, color:'var(--text-tertiary)', fontFamily:'var(--fb)', lineHeight:1.2 }}>{a.name}</div>
            </div>
            {/* Weight */}
            <div style={{ textAlign:'right', fontSize:11, color:'var(--text-secondary)', fontFamily:'var(--fm)', paddingTop:1 }}>
              {a.wt.toFixed(1)}%
            </div>
            {/* Dollar estimate */}
            <div style={{ textAlign:'right', fontSize:11, fontWeight:600, color: a.side==='SELL' ? '#f87171' : '#34d399', fontFamily:'var(--fm)', paddingTop:1 }}>
              {a.side === 'SELL' ? '-' : '+'}{fmt$(dollar)}
            </div>
            {/* Reason */}
            <div style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fb)', lineHeight:1.4, paddingTop:2 }}>
              {a.reason}
            </div>
            {/* Phase badge */}
            <div style={{ textAlign:'center' }}>
              <span style={{
                fontSize:9, padding:'1px 5px', borderRadius:4, fontFamily:'var(--fm)', fontWeight:700,
                background: a.phase===1 ? 'rgba(248,113,113,.12)' : a.phase===2 ? 'rgba(251,191,36,.12)' : 'rgba(52,211,153,.12)',
                color:       a.phase===1 ? '#f87171'               : a.phase===2 ? '#fbbf24'               : '#34d399',
                border:      a.phase===1 ? '1px solid rgba(248,113,113,.25)' : a.phase===2 ? '1px solid rgba(251,191,36,.25)' : '1px solid rgba(52,211,153,.25)',
              }}>
                F{a.phase}
              </span>
            </div>
          </div>
        );
      })}

      {/* Reset + select-all controls */}
      <div style={{ display:'flex', gap:6, marginTop:10 }}>
        <button onClick={() => setActions(prev => prev.map(a => ({ ...a, checked:true })))}
          style={{ fontSize:9, padding:'3px 8px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--text-secondary)', cursor:'pointer', fontFamily:'var(--fm)' }}>
          Seleccionar todo
        </button>
        <button onClick={() => setActions(prev => prev.map(a => ({ ...a, checked:false })))}
          style={{ fontSize:9, padding:'3px 8px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--text-secondary)', cursor:'pointer', fontFamily:'var(--fm)' }}>
          Deseleccionar todo
        </button>
        <button onClick={() => setActions(DEFAULT_ACTIONS)}
          style={{ fontSize:9, padding:'3px 8px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--text-tertiary)', cursor:'pointer', fontFamily:'var(--fm)' }}>
          Restaurar predeterminadas
        </button>
      </div>
    </div>
  );
}

// ─── Section 3: Execution Order ───────────────────────────────────────────────

function ExecutionOrder({ actions, nlv }) {
  const checked = actions.filter(a => a.checked);

  return (
    <div>
      <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--fd)', marginBottom:12 }}>
        Plan de Ejecución
      </div>

      {PHASES.map(phase => {
        const items = checked.filter(a => a.phase === phase.id);
        if (items.length === 0) return null;

        const sells = items.filter(a => a.side === 'SELL');
        const buys  = items.filter(a => a.side === 'BUY');
        const cashOut = sells.reduce((s,a) => s + (a.wt/100)*nlv, 0);
        const cashIn  = buys.reduce((s,a)  => s + (a.wt/100)*nlv, 0);

        return (
          <div key={phase.id} style={{ marginBottom:16, background:'var(--card)', border:`1px solid var(--border)`, borderRadius:10, overflow:'hidden' }}>
            {/* Phase header */}
            <div style={{ padding:'8px 12px', background:'var(--subtle-bg)', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:phase.color, fontFamily:'var(--fm)' }}>{phase.lbl}</div>
                <div style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fb)', marginTop:1 }}>{phase.desc}</div>
              </div>
              <div style={{ display:'flex', gap:8, fontSize:9, fontFamily:'var(--fm)' }}>
                {sells.length > 0 && <span style={{ color:'#f87171' }}>{sells.length} ventas {fmt$(cashOut)}</span>}
                {buys.length  > 0 && <span style={{ color:'#34d399' }}>{buys.length} compras {fmt$(cashIn)}</span>}
              </div>
            </div>

            {/* Items */}
            <div style={{ padding:'6px 12px' }}>
              {/* Sells first */}
              {sells.length > 0 && (
                <div style={{ marginBottom: buys.length > 0 ? 8 : 0 }}>
                  <div style={{ fontSize:8, fontWeight:600, color:'#f87171', fontFamily:'var(--fm)', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>
                    Ventas
                  </div>
                  {sells.map(a => (
                    <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', borderBottom:'1px solid var(--subtle-bg)' }}>
                      <span style={{ width:6, height:6, borderRadius:1, background:'#f87171', display:'inline-block', flexShrink:0 }} />
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--fm)', width:48 }}>{a.ticker}</span>
                      {a.pct != null && a.pct < 100 && (
                        <span style={{ fontSize:9, padding:'1px 4px', borderRadius:3, background:'rgba(251,191,36,.12)', color:'#fbbf24', fontFamily:'var(--fm)' }}>{a.pct}% de posición</span>
                      )}
                      {a.pct === 100 && (
                        <span style={{ fontSize:9, padding:'1px 4px', borderRadius:3, background:'rgba(248,113,113,.1)', color:'#f87171', fontFamily:'var(--fm)' }}>Posición completa</span>
                      )}
                      <span style={{ fontSize:11, color:'#f87171', fontFamily:'var(--fm)', marginLeft:'auto', fontWeight:600 }}>-{fmt$((a.wt/100)*nlv)}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Buys */}
              {buys.length > 0 && (
                <div>
                  <div style={{ fontSize:8, fontWeight:600, color:'#34d399', fontFamily:'var(--fm)', textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>
                    Compras
                  </div>
                  {buys.map(a => (
                    <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', borderBottom:'1px solid var(--subtle-bg)' }}>
                      <span style={{ width:6, height:6, borderRadius:1, background:'#34d399', display:'inline-block', flexShrink:0 }} />
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--fm)', width:48 }}>{a.ticker}</span>
                      <span style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fb)', flex:1 }}>{a.name}</span>
                      <span style={{ fontSize:9, color:'var(--text-secondary)', fontFamily:'var(--fm)' }}>{a.wt.toFixed(1)}% cartera</span>
                      <span style={{ fontSize:11, color:'#34d399', fontFamily:'var(--fm)', fontWeight:600 }}>+{fmt$((a.wt/100)*nlv)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {checked.length === 0 && (
        <div style={{ textAlign:'center', padding:32, color:'var(--text-tertiary)', fontSize:12, fontFamily:'var(--fm)' }}>
          No hay acciones seleccionadas. Ve a "Acciones" y marca las que quieres ejecutar.
        </div>
      )}

      {/* Tax summary */}
      {checked.length > 0 && (() => {
        const totalSellValue = checked.filter(a=>a.side==='SELL').reduce((s,a)=>s+(a.wt/100)*nlv,0);
        const totalBuyValue  = checked.filter(a=>a.side==='BUY' ).reduce((s,a)=>s+(a.wt/100)*nlv,0);
        const estTaxImpact   = totalSellValue * 0.20;  // rough 20% CGT
        return (
          <div style={{ background:'var(--subtle-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', marginTop:4 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--text-secondary)', fontFamily:'var(--fm)', marginBottom:8, textTransform:'uppercase', letterSpacing:.5 }}>
              Resumen Fiscal Estimado
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              <div>
                <div style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fm)' }}>Ventas totales</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#f87171', fontFamily:'var(--fm)' }}>{fmt$(totalSellValue)}</div>
              </div>
              <div>
                <div style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fm)' }}>Compras totales</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#34d399', fontFamily:'var(--fm)' }}>{fmt$(totalBuyValue)}</div>
              </div>
              <div>
                <div style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fm)' }}>Impacto fiscal est.</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#fbbf24', fontFamily:'var(--fm)' }}>{fmt$(estTaxImpact)}</div>
              </div>
            </div>
            <div style={{ fontSize:8, color:'var(--text-tertiary)', fontFamily:'var(--fb)', marginTop:6, lineHeight:1.4 }}>
              Estimacion aproximada: 20% CGT sobre ventas. No incluye precio de coste real, plazo de tenencia, ni convenio fiscal China-EEUU (10% WHT sobre dividendos). Consulta con tu asesor fiscal.
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── NLV Editor ───────────────────────────────────────────────────────────────

function NlvEditor({ nlv, setNlv }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(nlv));
  const inputRef = useRef(null);

  function commit() {
    const v = parseFloat(draft.replace(/,/g,''));
    if (!isNaN(v) && v > 0) setNlv(v);
    setEditing(false);
  }

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:'var(--fm)', textTransform:'uppercase', letterSpacing:.5 }}>NLV</span>
      {editing ? (
        <>
          <input ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)}
            onBlur={commit} onKeyDown={e=>{ if(e.key==='Enter') commit(); if(e.key==='Escape') setEditing(false); }}
            style={{ width:100, padding:'2px 6px', borderRadius:4, border:'1px solid var(--gold)', background:'var(--subtle-bg)', color:'var(--gold)', fontFamily:'var(--fm)', fontSize:11, outline:'none' }} />
          <button onClick={commit} style={{ fontSize:9, padding:'2px 6px', borderRadius:3, border:'1px solid var(--gold)', background:'var(--gold-dim)', color:'var(--gold)', cursor:'pointer', fontFamily:'var(--fm)' }}>OK</button>
        </>
      ) : (
        <button onClick={()=>{ setDraft(String(nlv)); setEditing(true); }}
          style={{ fontSize:11, fontWeight:700, color:'var(--gold)', fontFamily:'var(--fm)', background:'transparent', border:'none', cursor:'pointer', padding:0, borderBottom:'1px dashed var(--gold)', lineHeight:1.3 }}>
          {fmt$(nlv)}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RebalancingTab() {
  // ── All useState BEFORE all useEffect (TDZ-safe) ──
  const [subTab, setSubTab]   = useState(() => localStorage.getItem(LS_SUBTAB) || 'allocation');
  const [nlv,    setNlv]      = useState(() => { const v = parseFloat(localStorage.getItem(LS_NLV)); return isNaN(v) ? 1350000 : v; });
  const [sectors, setSectors] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_TARGETS) || 'null');
      if (Array.isArray(saved) && saved.length === DEFAULT_SECTORS.length) {
        // Merge saved targets into defaults (keeps new fields like color)
        return DEFAULT_SECTORS.map((d, i) => ({ ...d, target: saved[i]?.target ?? d.target }));
      }
    } catch {}
    return DEFAULT_SECTORS;
  });
  const [actions, setActions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_ACTIONS) || 'null');
      if (Array.isArray(saved) && saved.length === DEFAULT_ACTIONS.length) {
        return DEFAULT_ACTIONS.map((d, i) => ({ ...d, checked: saved[i]?.checked ?? d.checked }));
      }
    } catch {}
    return DEFAULT_ACTIONS;
  });

  // ── useEffects AFTER all useState ──
  useEffect(() => { localStorage.setItem(LS_SUBTAB, subTab); }, [subTab]);
  useEffect(() => { localStorage.setItem(LS_NLV, String(nlv)); }, [nlv]);
  useEffect(() => {
    localStorage.setItem(LS_TARGETS, JSON.stringify(sectors.map(s => ({ id:s.id, target:s.target }))));
  }, [sectors]);
  useEffect(() => {
    localStorage.setItem(LS_ACTIONS, JSON.stringify(actions.map(a => ({ id:a.id, checked:a.checked }))));
  }, [actions]);

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'0 0 40px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--fd)', display:'flex', alignItems:'center', gap:8 }}>
            Rebalancing Calculator
          </div>
          <div style={{ fontSize:10, color:'var(--text-tertiary)', fontFamily:'var(--fb)', marginTop:2 }}>
            Pre-poblado con recomendaciones de los sector dives · Abril 2026
          </div>
        </div>
        <NlvEditor nlv={nlv} setNlv={setNlv} />
      </div>

      {/* Sub-tab nav */}
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:6 }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{
              padding:'5px 14px', borderRadius:6,
              border:`1px solid ${subTab===t.id?'var(--gold)':'var(--border)'}`,
              background:subTab===t.id?'var(--gold-dim)':'transparent',
              color:subTab===t.id?'var(--gold)':'var(--text-tertiary)',
              fontSize:11, fontWeight:subTab===t.id?700:500,
              cursor:'pointer', fontFamily:'var(--fb)', transition:'all .15s',
            }}>
            {t.lbl}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'allocation' && (
        <AllocationTable sectors={sectors} setSectors={setSectors} nlv={nlv} />
      )}
      {subTab === 'actions' && (
        <ActionsTable actions={actions} setActions={setActions} nlv={nlv} />
      )}
      {subTab === 'execution' && (
        <ExecutionOrder actions={actions} nlv={nlv} />
      )}
    </div>
  );
}
