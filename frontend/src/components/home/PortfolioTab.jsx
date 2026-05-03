import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { useDraggableOrder } from '../../hooks/useDraggableOrder.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { _sf, fDol, fmtMC } from '../../utils/formatters';
import { EmptyState, LoadingSkeleton } from '../ui/EmptyState.jsx';
import { TrustBadge } from '../ui/TrustBadge.jsx';
import FiveFiltersBars from '../ui/FiveFiltersBars.jsx';
import BuyWizard from '../ui/BuyWizard.jsx';
import { API_URL } from '../../constants/index.js';
import { getPref, setPref } from '../../utils/userPrefs';
import { safeParseFundamentals } from '../../validators/schemas';

// 5 colores de categoría que el usuario asigna a cada ticker (per-user).
// Click cell → ciclo o dropdown picker. Persistente vía userPrefs `ayr-cat-{ticker}`.
const CATEGORY_COLORS = [
  { key: '',       label: 'Sin categoría', dot: 'transparent' },
  { key: 'green',  label: 'Verde',         dot: '#30d158' },
  { key: 'yellow', label: 'Amarillo',      dot: '#ffd60a' },
  { key: 'blue',   label: 'Azul',          dot: '#5b9bd5' },
  { key: 'orange', label: 'Naranja',       dot: '#ff9f0a' },
  { key: 'red',    label: 'Rojo',          dot: '#ff453a' },
];

function CategoryDot({ ticker }) {
  const [val, setVal] = useState(() => getPref(`ayr-cat-${ticker}`, '') || '');
  const [open, setOpen] = useState(false);
  const current = CATEGORY_COLORS.find(c => c.key === val) || CATEGORY_COLORS[0];
  return (
    <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        title={current.label + ' — click para cambiar'}
        aria-label={`Categoría: ${current.label}`}
        style={{
          width: 14, height: 14, borderRadius: '50%',
          background: current.dot,
          border: val ? '1px solid rgba(0,0,0,.3)' : '1px dashed rgba(255,255,255,.25)',
          cursor: 'pointer', padding: 0,
          boxShadow: val ? `0 0 6px ${current.dot}66` : 'none',
        }}
      />
      {open && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 18, left: -2, zIndex: 51,
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 4, display: 'flex', gap: 4,
              boxShadow: '0 6px 20px rgba(0,0,0,.4)',
            }}
          >
            {CATEGORY_COLORS.map(c => (
              <button key={c.key}
                onClick={(e) => {
                  e.stopPropagation();
                  setVal(c.key);
                  setPref(`ayr-cat-${ticker}`, c.key);
                  setOpen(false);
                }}
                title={c.label}
                style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: c.dot,
                  border: c.key === val ? '2px solid var(--gold)'
                        : c.key === '' ? '1px dashed rgba(255,255,255,.25)'
                                       : '1px solid rgba(0,0,0,.3)',
                  cursor: 'pointer', padding: 0,
                  position: 'relative',
                }}
              >
                {c.key === '' && (
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1, display: 'inline-block', verticalAlign: 'middle' }}>—</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const ALERTS_KEY = "ayr_price_alerts";
const COLS_KEY = "ayr_portfolio_cols";

// ── Vistas (presets de columnas) ────────────────────────────────────────
// Cada vista = {id, name, cols[], readOnly?}. Por defecto se siembran 4
// (Principal / Dividendos / Valoración / Calidad). El usuario puede crear
// vistas nuevas guardando el estado actual y borrar las que quiera.
// Persistencia en localStorage; las vistas por defecto pueden EDITARSE
// (el flag readOnly es informativo, no bloquea).
const VIEWS_KEY = "ayr_portfolio_views";
const ACTIVE_VIEW_KEY = "ayr_portfolio_active_view";

const VIEW_PRESETS = [
  {
    id: 'principal', name: 'Principal',
    cols: ['ticker','categoria','name','price','chgPct','chgAbs','shares','cost','costReal','pnl','pnlReal','weight','value','divIncome','divYield'],
  },
  {
    id: 'dividendos', name: 'Dividendos',
    cols: ['ticker','categoria','name','price','divYield','yoc','dps','divIncome','monthlyDiv','payoutRatio','divGrowth5y','divGrowth1y','divGrowth3y','exDate','weight','value'],
  },
  {
    id: 'valoracion', name: 'Valoración',
    cols: ['ticker','categoria','name','price','chgPct','pe','fwdPE','pb','evEbitda','mktCap','quality','safety','weight','value'],
  },
  {
    id: 'calidad', name: 'Calidad',
    cols: ['ticker','categoria','name','price','chgPct','quality','safety','smartMoney','oracle','roe','divGrowth5y','payoutRatio','weight'],
  },
];
// v2 (2026-05-03): bumped key to bust caches that stored evEbitda=0 due to
// the worker returning annual arrays where the frontend was reading TTM keys.
const FUND_CACHE_KEY = "ayr_fundamentals_cache_v2";

const SECTOR_COLORS = {
  "Technology":"#3b82f6","Information Technology":"#3b82f6","Tech":"#3b82f6",
  "Real Estate":"#a855f7","REIT":"#a855f7",
  "Financial Services":"#22c55e","Financials":"#22c55e","Finance":"#22c55e",
  "Healthcare":"#06b6d4",
  "Consumer Cyclical":"#f97316","Consumer Defensive":"#fb923c","Consumer Staples":"#fb923c","Consumer Discretionary":"#f97316",
  "Energy":"#ef4444",
  "Industrials":"#eab308",
  "Communication Services":"#ec4899","Communication":"#ec4899",
  "Utilities":"#14b8a6",
  "Basic Materials":"#a78bfa","Materials":"#a78bfa",
};
const getSectorColor = (sector) => {
  if (!sector || sector === "\u2014") return null;
  return SECTOR_COLORS[sector] || "#6b7280";
};

export const COL_DEFS = [
  { id:"ticker", label:"TICKER", group:"Core", w:"68px", align:"left", locked:true, defaultOn:true,
    val:p=>p.ticker, fmt:v=>v, sortV:p=>(p.ticker||"").toLowerCase() },
  // 2026-05-03: user-assignable category dot (per-user via userPrefs).
  // Custom render path: cellRenderType='categoryDot' so the row renderer
  // bypasses fmt() and mounts the <CategoryDot/> component instead.
  { id:"categoria", label:"CATEGORÍA", group:"Core", w:"38px", defaultOn:true, cellRenderType:'categoryDot',
    val:p=>getPref(`ayr-cat-${p.ticker}`, '') || '',
    fmt:v=>v||"—",
    sortV:p=>{ const v=getPref(`ayr-cat-${p.ticker}`, '')||'zzz'; return v; } },
  { id:"name", label:"NOMBRE", group:"Core", w:"110px", align:"left", defaultOn:true,
    val:p=>p.name||p.ticker, fmt:v=>v, sortV:p=>(p.name||p.ticker).toLowerCase() },
  { id:"price", label:"PRECIO", group:"Core", w:"58px", defaultOn:true,
    val:p=>p.lastPrice||0, fmt:(v,p)=>{const c=p.ccy||p.currency||"USD";const s=c==="GBX"?"\u00a3":c==="EUR"?"\u20ac":c==="GBP"?"\u00a3":c==="HKD"?"HK$":c==="CAD"?"C$":"$";return s+(c==="GBX"?(v/100):v).toFixed(2);}, sortV:p=>p.priceUSD||0 },
  { id:"chgPct", label:"CHG%", group:"Core", w:"44px", defaultOn:true,
    val:p=>p.dayChange||0, fmt:v=>v!==0?(v>=0?"+":"")+_sf(v,2)+"%":"\u2014", color:v=>v>=0?"var(--green)":"var(--red)", sortV:p=>p.dayChange||0 },
  { id:"chgAbs", label:"CHG$", group:"Core", w:"44px", defaultOn:true,
    val:p=>p.dayChangeAbs||0, fmt:v=>v!==0?(v>=0?"+":"")+_sf(v,2):"\u2014", color:v=>v>=0?"var(--green)":"var(--red)", sortV:p=>p.dayChangeAbs||0 },
  { id:"shares", label:"SHARES", group:"Core", w:"46px", priv:true, defaultOn:true,
    val:p=>p.shares||0, fmt:v=>v>0?v.toLocaleString():"\u2014", sortV:p=>p.shares||0 },
  // Two cost-basis columns side-by-side (2026-05-03):
  //   COSTE: vanilla avg cost de las compras (lo que reporta IB / lo que pagaste por las acciones)
  //   COSTE REAL: cost basis ajustado con dividendos + cr\u00e9ditos de opciones (la base econ\u00f3mica neta)
  { id:"cost", label:"COSTE", group:"Core", w:"52px", priv:true, defaultOn:true,
    val:p=>p.costSharesPerShare||p.avgCost||0,
    fmt:(v,p)=>{if(!v)return "\u2014";const c=p.ccy||p.currency||"USD";const s=c==="GBX"?"\u00a3":c==="EUR"?"\u20ac":c==="GBP"?"\u00a3":"$";return s+_sf(v,2);},
    color:v=>v?undefined:"var(--text-tertiary)", sortV:p=>p.costSharesUSD||0 },
  { id:"costReal", label:"COSTE REAL", group:"Core", w:"58px", priv:true, defaultOn:true,
    val:p=>p.costRealPerShare||p.adjustedBasis||0,
    fmt:(v,p)=>{if(!v)return "\u2014";const c=p.ccy||p.currency||"USD";const s=c==="GBX"?"\u00a3":c==="EUR"?"\u20ac":c==="GBP"?"\u00a3":"$";return s+_sf(v,2);},
    color:v=>v?"var(--gold)":"var(--text-tertiary)",
    sortV:p=>p.costRealUSD||0 },
  { id:"pnl", label:"P&L%", group:"Core", w:"44px", priv:true, defaultOn:true,
    val:p=>(p.pnlSharesPct ?? p.pnlPct ?? 0)*100, fmt:v=>(v>=0?"+":"")+_sf(v,0)+"%",
    color:v=>v>=0?"var(--green)":"var(--red)", sortV:p=>p.pnlSharesPct ?? p.pnlPct ?? 0 },
  { id:"pnlReal", label:"P&L REAL%", group:"Core", w:"50px", priv:true, defaultOn:true,
    val:p=>(p.pnlRealPct ?? 0)*100, fmt:v=>(v>=0?"+":"")+_sf(v,0)+"%",
    color:v=>v>=0?"var(--green)":"var(--red)", sortV:p=>p.pnlRealPct||0 },
  { id:"weight", label:"PESO", group:"Core", w:"38px", defaultOn:true,
    val:p=>(p.weight||0)*100, fmt:v=>_sf(v,1)+"%", color:()=>"var(--gold)", sortV:p=>p.weight||0 },
  { id:"value", label:"VALOR", group:"Core", w:"54px", priv:true, defaultOn:true,
    val:p=>p.valueUSD||0, fmt:v=>v>=1e3?"$"+_sf(v/1e3,1)+"K":"$"+_sf(v,0), sortV:p=>p.valueUSD||0 },
  { id:"divIncome", label:"DIV $", group:"Core", w:"44px", priv:true, defaultOn:true,
    val:p=>p.divAnnualUSD||0, fmt:v=>v>0?"$"+_sf(v,0):"\u2014", color:v=>v>0?"var(--gold)":"var(--text-tertiary)", sortV:p=>p.divAnnualUSD||0 },
  { id:"divYield", label:"YIELD%", group:"Dividendo", w:"44px", defaultOn:true,
    val:p=>{const dy=p.divYieldTTM||p.dy||0;return dy>0?dy*100:(p.divTTM&&p.lastPrice?(p.divTTM/p.lastPrice)*100:0);},
    fmt:v=>v>0?_sf(v,2)+"%":"\u2014", color:v=>v>=5?"var(--gold)":v>0?"var(--text-primary)":"var(--text-tertiary)", sortV:p=>p.divYieldTTM||p.dy||0 },
  { id:"yoc", label:"YOC%", group:"Dividendo", w:"42px", defaultOn:false,
    val:p=>(p.yoc||0)*100, fmt:v=>v>0?_sf(v,2)+"%":"\u2014", color:v=>v>0?"var(--gold)":"var(--text-tertiary)", sortV:p=>p.yoc||0 },
  { id:"dps", label:"DPS", group:"Dividendo", w:"42px", defaultOn:false,
    val:p=>p.divTTM||p.dps||0, fmt:v=>v>0?"$"+_sf(v,2):"\u2014", sortV:p=>p.divTTM||p.dps||0 },
  { id:"monthlyDiv", label:"DIV/MES", group:"Dividendo", w:"46px", priv:true, defaultOn:false,
    val:p=>(p.divAnnualUSD||0)/12, fmt:v=>v>0?"$"+_sf(v,0):"\u2014", color:v=>v>0?"var(--gold)":"var(--text-tertiary)", sortV:p=>(p.divAnnualUSD||0)/12 },
  { id:"payoutRatio", label:"PAYOUT%", group:"Dividendo", w:"46px", defaultOn:false,
    val:p=>p._fund?.payoutRatio||0, fmt:v=>v>0?_sf(v*100,0)+"%":"\u2014", color:v=>v>0.8?"var(--red)":v>0.6?"var(--gold)":"var(--text-primary)", sortV:p=>p._fund?.payoutRatio||0 },
  { id:"divGrowth5y", label:"DGR 5Y", group:"Dividendo", w:"48px", defaultOn:false, isDGR:true,
    val:p=>p._dgr?.dgr5!=null?p._dgr.dgr5:(p._fund?.divGrowth5y||0), fmt:v=>v!==0?(v>=0?"+":"")+_sf(v*100,1)+"%":"\u2014",
    color:v=>v>0.05?"var(--green)":v>0.01?"var(--gold)":"var(--red)", sortV:p=>p._dgr?.dgr5||p._fund?.divGrowth5y||0 },
  { id:"divGrowth1y", label:"DGR 1Y", group:"Dividendo", w:"48px", defaultOn:false, isDGR:true,
    val:p=>p._dgr?.dgr1||0, fmt:v=>v!==0?(v>=0?"+":"")+_sf(v*100,1)+"%":"\u2014",
    color:v=>v>0.05?"var(--green)":v>0.01?"var(--gold)":"var(--red)", sortV:p=>p._dgr?.dgr1||0 },
  { id:"divGrowth3y", label:"DGR 3Y", group:"Dividendo", w:"48px", defaultOn:false, isDGR:true,
    val:p=>p._dgr?.dgr3||0, fmt:v=>v!==0?(v>=0?"+":"")+_sf(v*100,1)+"%":"\u2014",
    color:v=>v>0.05?"var(--green)":v>0.01?"var(--gold)":"var(--red)", sortV:p=>p._dgr?.dgr3||0 },
  { id:"divGrowth10y", label:"DGR 10Y", group:"Dividendo", w:"48px", defaultOn:false, isDGR:true,
    val:p=>p._dgr?.dgr10||0, fmt:v=>v!==0?(v>=0?"+":"")+_sf(v*100,1)+"%":"\u2014",
    color:v=>v>0.05?"var(--green)":v>0.01?"var(--gold)":"var(--red)", sortV:p=>p._dgr?.dgr10||0 },
  { id:"exDate", label:"EX-DATE", group:"Dividendo", w:"56px", defaultOn:false,
    val:p=>p._fund?.exDivDate||"", fmt:v=>v||"\u2014", sortV:p=>p._fund?.exDivDate||"9999" },
  { id:"pe", label:"P/E", group:"Valoracion", w:"40px", defaultOn:false,
    val:p=>p._fund?.pe||0, fmt:v=>v>0?_sf(v,1)+"x":"\u2014", color:v=>v>30?"var(--red)":v>20?"var(--gold)":"var(--text-primary)", sortV:p=>p._fund?.pe||0 },
  { id:"fwdPE", label:"FWD P/E", group:"Valoracion", w:"44px", defaultOn:false,
    val:p=>p._fund?.fwdPE||0, fmt:v=>v>0?_sf(v,1)+"x":"\u2014", color:v=>v>30?"var(--red)":v>20?"var(--gold)":"var(--text-primary)", sortV:p=>p._fund?.fwdPE||0 },
  { id:"pb", label:"P/B", group:"Valoracion", w:"38px", defaultOn:false,
    val:p=>p._fund?.pb||0, fmt:v=>v>0?_sf(v,1)+"x":"\u2014", sortV:p=>p._fund?.pb||0 },
  { id:"evEbitda", label:"EV/EBITDA", group:"Valoracion", w:"50px", defaultOn:false,
    val:p=>p._fund?.evEbitda||0, fmt:v=>v>0?_sf(v,1)+"x":"\u2014", sortV:p=>p._fund?.evEbitda||0 },
  { id:"mktCap", label:"MKT CAP", group:"Fundamentales", w:"54px", defaultOn:false,
    val:p=>p.mc||0, fmt:v=>fmtMC(v), sortV:p=>p.mc||0 },
  { id:"sector", label:"SECTOR", group:"Fundamentales", w:"64px", align:"left", defaultOn:true,
    // 2026-05-03 fix: positions.sector ten\u00eda valores stale/wrong (e.g. ADP
    // figuraba como "Technology" cuando es "Industrials"). Ahora preferimos
    // el sector de FMP fundamentals (_fund) si existe, fallback al de
    // positions s\u00f3lo si falta. Verificado: ADP, AMCR, ACN sal\u00edan mal antes.
    val:p=>p._fund?.sector||p.sector||"\u2014", fmt:v=>{const s=v||"\u2014";return s.length>10?s.slice(0,9)+"..":s;}, sortV:p=>p._fund?.sector||p.sector||"zzz" },
  { id:"beta", label:"BETA", group:"Fundamentales", w:"36px", defaultOn:false,
    val:p=>p._fund?.beta||p.beta||0, fmt:v=>v>0?_sf(v,2):"\u2014", color:v=>v>1.3?"var(--red)":v<0.8?"var(--green)":"var(--text-primary)", sortV:p=>p._fund?.beta||p.beta||0 },
  { id:"roe", label:"ROE%", group:"Fundamentales", w:"40px", defaultOn:false,
    val:p=>p._fund?.roe||0, fmt:v=>v!==0?_sf(v*100,1)+"%":"\u2014", color:v=>v>0.15?"var(--green)":v>0?"var(--text-primary)":"var(--red)", sortV:p=>p._fund?.roe||0 },
  { id:"debtEq", label:"D/E", group:"Fundamentales", w:"38px", defaultOn:false,
    val:p=>p._fund?.debtEq||0, fmt:v=>v>0?_sf(v,2):"\u2014", color:v=>v>2?"var(--red)":v>1?"var(--gold)":"var(--text-primary)", sortV:p=>p._fund?.debtEq||0 },
  { id:"w52High", label:"52W HI", group:"Performance", w:"48px", defaultOn:false,
    val:p=>p.fiftyTwoWeekHigh||0, fmt:v=>v>0?"$"+_sf(v,2):"\u2014", sortV:p=>p.fiftyTwoWeekHigh||0 },
  { id:"w52Low", label:"52W LO", group:"Performance", w:"48px", defaultOn:false,
    val:p=>p.fiftyTwoWeekLow||0, fmt:v=>v>0?"$"+_sf(v,2):"\u2014", sortV:p=>p.fiftyTwoWeekLow||0 },
  { id:"pctFrom52H", label:"%52H", group:"Performance", w:"42px", defaultOn:true,
    val:p=>{const h=p.fiftyTwoWeekHigh||0,c=p.lastPrice||0;return h>0&&c>0?((c-h)/h)*100:0;},
    fmt:v=>v!==0?_sf(v,1)+"%":"\u2014", color:v=>v>-5?"var(--green)":v>-15?"var(--gold)":"var(--red)", sortV:p=>{const h=p.fiftyTwoWeekHigh||0,c=p.lastPrice||0;return h>0?((c-h)/h):0;} },
  { id:"ytd", label:"YTD%", group:"Performance", w:"42px", defaultOn:false,
    val:p=>p._fund?.ytd||0, fmt:v=>v!==0?(v>=0?"+":"")+_sf(v*100,1)+"%":"\u2014", color:v=>v>=0?"var(--green)":"var(--red)", sortV:p=>p._fund?.ytd||0 },
  // ── Quality + Safety Scores (computed from FMP cache, click for breakdown) ──
  { id:"quality", label:"Q", group:"Calidad", w:"36px", defaultOn:true, isQS:true,
    val:p=>p._qs?.quality_score, fmt:v=>v!=null?v.toFixed(0):"\u2014",
    color:v=>v==null?"var(--text-tertiary)":v>=80?"var(--gold)":v>=65?"var(--green)":v>=50?"#ffd60a":"#ff6b6b",
    sortV:p=>p._qs?.quality_score||0 },
  { id:"safety", label:"S", group:"Calidad", w:"36px", defaultOn:true, isQS:true,
    val:p=>p._qs?.safety_score, fmt:v=>v!=null?v.toFixed(0):"\u2014",
    color:v=>v==null?"var(--text-tertiary)":v>=80?"var(--gold)":v>=65?"var(--green)":v>=50?"#ffd60a":"#ff6b6b",
    sortV:p=>p._qs?.safety_score||0 },
  // Smart Money — # of superinvestors (US 13F + ES CNMV) holding this ticker.
  // Data is injected as p._sm (array of holders) in enrichedPositions.
  { id:"smartMoney", label:"SM", group:"Smart Money", w:"40px", defaultOn:true, isSM:true,
    val:p=>p._sm?.length||0,
    fmt:v=>v>0?`⭐${v}`:"\u2014",
    color:v=>v==null||v===0?"var(--text-tertiary)":v>=4?"var(--gold)":v>=2?"var(--green)":"#64d2ff",
    sortV:p=>p._sm?.length||0 },
  // 5 Filters composite score (Business · Moat · Mgmt · Price · Conviction).
  // Click for drill-down, hover for per-filter breakdown with source attribution.
  { id:"fiveFilters", label:"5F", group:"Calidad", w:"90px", defaultOn:true, is5F:true,
    val:p=>p._5f?.composite,
    fmt:v=>v!=null?v.toFixed(1):"\u2014",
    sortV:p=>p._5f?.composite||0 },
  // Oracle verdict — Buffett-style on-demand. Shows cached action + conviction
  // if available (green/blue/amber/red), else ↻ icon. Click opens BuyWizard
  // with the ticker pre-loaded (consultas ~$0.75 solo cuando el usuario pulsa).
  { id:"oracle", label:"🎯", group:"Calidad", w:"54px", defaultOn:true, isOracle:true,
    val:p=>p._oracle,
    fmt:v=>v?.action||"",
    sortV:p=>{
      if(!p._oracle) return -1;
      const rank={BUY:6,ADD:5,ACCUMULATE:5,HOLD:3,TRIM:2,SELL:1,AVOID:0}[p._oracle.action]||0;
      return rank*10+(p._oracle.conviction||0);
    } },
];

const DEFAULT_COLS = COL_DEFS.filter(c=>c.defaultOn).map(c=>c.id);

// Country filter pills with drag-reorder (persisted per user via cloud)
function PortfolioCountryPills({ countrySorted, countryFilter, setCountryFilter, FLAGS }) {
  const items = useMemo(() => countrySorted.map(([cc, count]) => ({ id: cc, count, flag: FLAGS[cc] || cc })), [countrySorted, FLAGS]);
  const { orderedItems, dragHandlers, getDragVisuals } = useDraggableOrder(items, 'ui_portfolio_country_filter');
  return (
    <>
      {orderedItems.map(item => {
        const active = countryFilter === item.id;
        const { extraStyle } = getDragVisuals(item.id);
        return (
          <button
            key={item.id}
            {...dragHandlers(item.id)}
            onClick={()=>setCountryFilter(countryFilter===item.id?"":item.id)}
            title="Arrastra para reordenar"
            style={{
              padding:"2px 5px",borderRadius:5,
              border:active?"1.5px solid var(--gold)":"1px solid var(--border)",
              background:active?"var(--gold-dim)":"transparent",
              color:active?"var(--gold)":"var(--text-tertiary)",
              fontSize:10,fontFamily:"var(--fm)",
              ...extraStyle,
            }}
          >
            {item.flag}{item.count}
          </button>
        );
      })}
    </>
  );
}
const COL_GROUPS = [...new Set(COL_DEFS.map(c=>c.group))];

const SORT_OPTIONS = [
  {id:"ticker",lbl:"Ticker",fn:(a,b)=>(a.ticker||"").localeCompare(b.ticker||"")},
  {id:"name",lbl:"Nombre",fn:(a,b)=>(a.name||a.ticker).localeCompare(b.name||b.ticker)},
  {id:"value",lbl:"Valor",fn:(a,b)=>(b.valueUSD||0)-(a.valueUSD||0)},
  {id:"pnl",lbl:"P&L%",fn:(a,b)=>(b.pnlPct||0)-(a.pnlPct||0)},
  {id:"weight",lbl:"Peso",fn:(a,b)=>(b.weight||0)-(a.weight||0)},
  {id:"div",lbl:"Div",fn:(a,b)=>(b.divAnnualUSD||0)-(a.divAnnualUSD||0)},
  {id:"price",lbl:"Precio",fn:(a,b)=>(b.priceUSD||0)-(a.priceUSD||0)},
];

// Small self-contained widget that fetches /api/theses/missing and shows
// the coverage progress as a compact badge in the Portfolio header.
// Click opens a mini-panel with the list of missing tickers + a button to
// auto-generate them via /api/theses/:ticker/generate (uses Claude Opus).
function ThesesCoverageBadge() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null });
  const reload = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/theses/missing?min_weight=0.5`);
      const d = await r.json();
      setData(d);
    } catch (e) { console.error('[ThesisCoverage] reload failed:', e); }
  }, []);
  useEffect(() => { let cancelled = false; (async () => { try { const r = await fetch(`${API_URL}/api/theses/missing?min_weight=0.5`); const d = await r.json(); if (!cancelled) setData(d); } catch (e) { console.error('[ThesisCoverage] initial fetch failed:', e); } })(); return () => { cancelled = true; }; }, []);
  const generateAll = useCallback(async () => {
    if (!data || !data.missing || data.missing.length === 0) return;
    if (!window.confirm(`Generar tesis con Opus para ${data.missing.length} empresas. Coste estimado: ~$${(data.missing.length * 0.12).toFixed(2)}. ¿Continuar?`)) return;
    setGenerating(true);
    const tickers = data.missing.map(m => m.ticker);
    setProgress({ done: 0, total: tickers.length, current: null });
    for (const t of tickers) {
      setProgress(p => ({ ...p, current: t }));
      try {
        await fetch(`${API_URL}/api/theses/${encodeURIComponent(t)}/generate`, { method: 'POST' });
      } catch (e) { console.error('[ThesisCoverage] generate failed for', t, ':', e); }
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setGenerating(false);
    await reload();
  }, [data, reload]);
  if (!data || !data.total_eligible) return null;
  const written = (data.total_eligible || 0) - (data.missing_count || 0);
  const pct = data.coverage_pct ?? 0;
  const color = pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : 'var(--red)';
  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(v => !v)}
        title={`${written} de ${data.total_eligible} posiciones (≥${data.min_weight_pct || 0.5}%) con tesis. ${data.total_positions || 0} posiciones totales, ${data.total_theses || 0} tesis en DB. Click para expandir.`}
        style={{display:"flex",alignItems:"center",gap:6,padding:"2px 10px",borderRadius:6,border:`1px solid ${color}`,background:`${color}14`,fontFamily:"var(--fm)",cursor:"pointer"}}>
        <span style={{fontSize:9,color:"var(--text-tertiary)"}}>Tesis</span>
        <span style={{fontSize:13,fontWeight:700,color}}>{written}/{data.total_eligible}</span>
        <span style={{fontSize:9,color,opacity:.7}}>{pct}%</span>
      </div>
      {open && (
        <div style={{
          position:'absolute', top:28, right:0, zIndex:50,
          minWidth: 280, maxWidth: 360,
          background:'var(--card)', border:'1px solid var(--gold)', borderRadius:8,
          padding:12, boxShadow:'0 8px 24px rgba(0,0,0,.4)',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--gold)' }}>Tesis pendientes</div>
            <button onClick={() => setOpen(false)} style={{ background:'transparent', border:'none', color:'var(--text-tertiary)', cursor:'pointer', fontSize:14 }}>×</button>
          </div>
          {data.missing_count === 0 ? (
            <div style={{ fontSize:10, color:'var(--green)' }}>✓ Todas las posiciones ≥{data.min_weight_pct}% tienen tesis.</div>
          ) : (
            <>
              <div style={{ fontSize:10, color:'var(--text-tertiary)', marginBottom:6 }}>
                {data.missing_count} posiciones sin tesis (filtrado ≥{data.min_weight_pct}% del portfolio):
              </div>
              <div style={{ maxHeight: 180, overflowY:'auto', marginBottom:8 }}>
                {data.missing.map(m => (
                  <div key={m.ticker} style={{ fontSize:10, padding:'3px 0', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
                    <span>
                      <span style={{ color:'var(--gold)', fontWeight:700 }}>{m.ticker}</span>
                      <span style={{ color:'var(--text-tertiary)', marginLeft:4 }}>{(m.name || '').slice(0, 22)}</span>
                    </span>
                    <span style={{ color:'var(--text-tertiary)' }}>{m.weight_pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <button
                onClick={generateAll}
                disabled={generating}
                style={{
                  width:'100%', padding:'6px 10px', borderRadius:6,
                  border:'1px solid var(--gold)', background:'var(--gold-dim)',
                  color:'var(--gold)', fontSize:10, fontWeight:700, cursor: generating ? 'wait' : 'pointer',
                }}
              >
                {generating
                  ? `⏳ ${progress.done}/${progress.total}${progress.current ? ' · ' + progress.current : ''}`
                  : `🤖 Generar ${data.missing_count} con Opus (~$${(data.missing_count * 0.12).toFixed(2)})`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PortfolioTab() {
  const {
    portfolioList, portfolioTotals, _portfolioComputed,
    searchTicker, setSearchTicker, updatePosition,
    countryFilter, setCountryFilter, portSort, setPortSort, showCapTable, setShowCapTable,
    pricesLoading, _pricesLastUpdate, refreshPrices,
    _displayCcy, privacyMode, hide,
    openAnalysis, openCostBasis, _removePosition,
    getCountry, FLAGS, POS_STATIC, CompanyRow,
    ibData, divStreaks, smartMoneyHolders, openScoresModal,
    setHomeTab,
    CACHED_PNL,
  } = useHome();

  const [quickFilter, setQuickFilter] = useState("");
  const [listSort, setListSort] = useState(() => {
    try { return localStorage.getItem('ui_portfolio_sort') || 'ticker'; } catch { return 'ticker'; }
  });
  useEffect(() => {
    try { localStorage.setItem('ui_portfolio_sort', listSort); } catch {}
  }, [listSort]);
  const searchRef = useRef(null);

  // Trust badges — data freshness from /api/data-status (fetched once per session)
  const { getLevel, getSource, getUpdatedAt } = useFreshness();

  // Drag-reorder the sort pills — persisted per user via cloud
  const {
    orderedItems: orderedSortOptions,
    dragHandlers: sortDragHandlers,
    getDragVisuals: sortDragVisuals,
  } = useDraggableOrder(SORT_OPTIONS, 'ui_portfolio_sort_options');

  // Drag-reorder column-group section headers in the Columns picker
  const colGroupItems = useMemo(() => COL_GROUPS.map(g => ({ id: g, label: g })), []);
  const {
    orderedItems: orderedColGroups,
    dragHandlers: colGroupDragHandlers,
    getDragVisuals: colGroupDragVisuals,
  } = useDraggableOrder(colGroupItems, 'ui_portfolio_col_groups');

  // Quality + Safety scores (local state — cached in sessionStorage with 4h TTL).
  // Previous implementation keyed by date YYYY-MM-DD which made the boundary at
  // midnight buggy (open at 23:59 and refresh at 00:01 → two different caches
  // pointing to the same compute). Now we use a TTL-based cache.
  const QS_CACHE_KEY = 'qs-scores-v2';
  const [qsScores, setQsScores] = useState({});
  const loadQsScores = useCallback(async (force = false) => {
    const TTL_MS = 4 * 60 * 60 * 1000;
    if (!force) {
      try {
        const raw = sessionStorage.getItem(QS_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.ts && (Date.now() - parsed.ts) < TTL_MS) {
            setQsScores(parsed.data || {});
            return;
          }
        }
      } catch {}
    }
    try {
      const r = await fetch(`${API_URL}/api/scores`);
      const d = await r.json();
      const map = {};
      for (const row of (d.scores || [])) map[row.ticker] = row;
      setQsScores(map);
      try { sessionStorage.setItem(QS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: map })); } catch {}
    } catch (e) { console.error('[PortfolioTab] /api/scores failed:', e); }
  }, []);
  useEffect(() => { loadQsScores(false); }, [loadQsScores]);

  // 5 Filters scores — fetched once, cached in session (4h TTL).
  const FF_CACHE_KEY = 'five-filters-v1';
  const [fiveFilters, setFiveFilters] = useState({});
  const loadFiveFilters = useCallback(async (force = false) => {
    const TTL_MS = 4 * 60 * 60 * 1000;
    if (!force) {
      try {
        const raw = sessionStorage.getItem(FF_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.ts && (Date.now() - parsed.ts) < TTL_MS) {
            setFiveFilters(parsed.data || {});
            return;
          }
        }
      } catch {}
    }
    try {
      const r = await fetch(`${API_URL}/api/five-filters`);
      const d = await r.json();
      if (d.ok && d.scores) {
        setFiveFilters(d.scores);
        try { sessionStorage.setItem(FF_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: d.scores })); } catch {}
      }
    } catch (e) { console.error('[PortfolioTab] /api/five-filters failed:', e); }
  }, []);
  useEffect(() => { loadFiveFilters(false); }, [loadFiveFilters]);

  // ─── Oracle verdicts — cached ones only, NO auto-generation ───────────
  // Hit /api/oracle-verdict/batch to populate the "O" column with whatever
  // is already in D1 (prior user clicks or chat-driven verdicts). Tickers
  // without cache show ↻ — user clicks to run Oracle on-demand. Session
  // cache 10 min to avoid re-fetching on every re-render.
  const ORACLE_CACHE_KEY = 'oracle-verdicts-v1';
  const [oracleVerdicts, setOracleVerdicts] = useState({});
  const loadOracleVerdicts = useCallback(async (tickers, force = false) => {
    const TTL_MS = 10 * 60 * 1000;
    if (!Array.isArray(tickers) || !tickers.length) return;
    if (!force) {
      try {
        const raw = sessionStorage.getItem(ORACLE_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.ts && (Date.now() - parsed.ts) < TTL_MS) {
            setOracleVerdicts(parsed.data || {});
            return;
          }
        }
      } catch {}
    }
    try {
      const qs = tickers.join(',');
      const r = await fetch(`${API_URL}/api/oracle-verdict/batch?tickers=${encodeURIComponent(qs)}`);
      const d = await r.json();
      if (d && d.verdicts) {
        setOracleVerdicts(d.verdicts);
        try { sessionStorage.setItem(ORACLE_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: d.verdicts })); } catch {}
      }
    } catch (e) { console.error('[PortfolioTab] /api/oracle-verdict/batch failed:', e); }
  }, []);
  const portfolioTickers = useMemo(
    () => (portfolioTotals?.positions || []).map(p => p.ticker).filter(Boolean),
    [portfolioTotals]
  );
  useEffect(() => {
    if (portfolioTickers.length) loadOracleVerdicts(portfolioTickers, false);
  }, [portfolioTickers, loadOracleVerdicts]);

  // Shared Buy Wizard state — opened when user clicks the "O" cell
  const [oracleWizardTicker, setOracleWizardTicker] = useState(null);
  const [showRebalance, setShowRebalance] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertForm, setAlertForm] = useState({ ticker: "", price: "", direction: "below" });
  const [alerts, setAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ALERTS_KEY)) || []; } catch { return []; }
  });
  const saveAlerts = useCallback((a) => { setAlerts(a); localStorage.setItem(ALERTS_KEY, JSON.stringify(a)); }, []);

  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(COLS_KEY));
      if (s && Array.isArray(s) && s.length > 0) {
        // Migration: append newer columns if user has an older saved list.
        let migrated = [...s];
        if (!s.includes('quality'))     migrated.push('quality');
        if (!s.includes('safety'))      migrated.push('safety');
        if (!s.includes('smartMoney'))  migrated.push('smartMoney');
        if (!s.includes('oracle'))      migrated.push('oracle');
        return migrated;
      }
    } catch {}
    return DEFAULT_COLS;
  });
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef(null);
  const [colSort, setColSort] = useState({ id: null, asc: false });

  // ── Vistas: state + handlers ──────────────────────────────────────────
  const [views, setViews] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(VIEWS_KEY));
      if (Array.isArray(stored) && stored.length > 0) {
        // Migración: si faltan presets por defecto, fusionarlos
        const present = new Set(stored.map(v => v.id));
        const merged = [...stored];
        for (const p of VIEW_PRESETS) if (!present.has(p.id)) merged.push(p);
        return merged;
      }
    } catch {}
    return VIEW_PRESETS;
  });
  const [activeView, setActiveView] = useState(() => {
    try { return localStorage.getItem(ACTIVE_VIEW_KEY) || 'principal'; } catch { return 'principal'; }
  });

  // Cuando cambia visibleCols (toggle/reorder), guarda automáticamente en
  // la vista activa para que la próxima vez vuelvas a verla igual.
  useEffect(() => {
    if (!activeView) return;
    setViews(prev => {
      const next = prev.map(v => v.id === activeView ? { ...v, cols: visibleCols } : v);
      try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [visibleCols, activeView]);

  const switchView = useCallback((id) => {
    const v = views.find(x => x.id === id);
    if (!v) return;
    setActiveView(id);
    try { localStorage.setItem(ACTIVE_VIEW_KEY, id); } catch {}
    setVisibleCols(v.cols);
  }, [views]);

  const saveAsNewView = useCallback(() => {
    const name = window.prompt('Nombre de la nueva vista:');
    if (!name || !name.trim()) return;
    const id = 'v_' + Date.now();
    const next = [...views, { id, name: name.trim(), cols: visibleCols }];
    setViews(next);
    setActiveView(id);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
      localStorage.setItem(ACTIVE_VIEW_KEY, id);
    } catch {}
  }, [views, visibleCols]);

  const deleteCurrentView = useCallback(() => {
    const v = views.find(x => x.id === activeView);
    if (!v) return;
    const isPreset = VIEW_PRESETS.some(p => p.id === v.id);
    const msg = isPreset
      ? `Restaurar la vista "${v.name}" a sus columnas por defecto?`
      : `Borrar la vista "${v.name}"? No se puede deshacer.`;
    if (!window.confirm(msg)) return;
    if (isPreset) {
      const preset = VIEW_PRESETS.find(p => p.id === v.id);
      const next = views.map(x => x.id === v.id ? { ...preset } : x);
      setViews(next);
      setVisibleCols(preset.cols);
      try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); } catch {}
    } else {
      const next = views.filter(x => x.id !== v.id);
      setViews(next);
      try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); } catch {}
      // Cambia a Principal
      const principal = next.find(x => x.id === 'principal') || next[0];
      if (principal) {
        setActiveView(principal.id);
        setVisibleCols(principal.cols);
        try { localStorage.setItem(ACTIVE_VIEW_KEY, principal.id); } catch {}
      }
    }
  }, [views, activeView]);

  const renameCurrentView = useCallback(() => {
    const v = views.find(x => x.id === activeView);
    if (!v) return;
    const name = window.prompt('Nuevo nombre:', v.name);
    if (!name || !name.trim()) return;
    const next = views.map(x => x.id === v.id ? { ...x, name: name.trim() } : x);
    setViews(next);
    try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); } catch {}
  }, [views, activeView]);

  // ─── Column widths with persistence ───
  // Users can drag the right edge of any header cell to resize. Widths
  // are stored in localStorage under COLS_WIDTH_KEY as { colId: pixels }.
  const COLS_WIDTH_KEY = "ayr_portfolio_col_widths";
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem(COLS_WIDTH_KEY) || "{}"); }
    catch { return {}; }
  });
  // Persist to localStorage whenever widths change
  useEffect(() => {
    try { localStorage.setItem(COLS_WIDTH_KEY, JSON.stringify(colWidths)); }
    catch {}
  }, [colWidths]);

  // Resize state — refs so the mousemove handler doesn't re-render.
  // resizeHandlersRef tracks the currently-active listener pair so a
  // mid-drag unmount can clean them up (prevents window-level listener
  // leaks and "setState on unmounted component" warnings).
  const resizeRef = useRef({ colId: null, startX: 0, startWidth: 0 });
  const resizeHandlersRef = useRef(null);
  const onResizeStart = useCallback((e, colId, currentWidth) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { colId, startX: e.clientX, startWidth: currentWidth };
    // Clean up any previous active handlers before adding new ones
    if (resizeHandlersRef.current) {
      window.removeEventListener('mousemove', resizeHandlersRef.current.onMove);
      window.removeEventListener('mouseup', resizeHandlersRef.current.onUp);
    }
    const onMove = (ev) => {
      const dx = ev.clientX - resizeRef.current.startX;
      const newW = Math.max(28, resizeRef.current.startWidth + dx);
      setColWidths(prev => ({ ...prev, [resizeRef.current.colId]: newW }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      resizeRef.current = { colId: null, startX: 0, startWidth: 0 };
      resizeHandlersRef.current = null;
    };
    resizeHandlersRef.current = { onMove, onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);
  // Unmount cleanup for mid-drag
  useEffect(() => () => {
    if (resizeHandlersRef.current) {
      window.removeEventListener('mousemove', resizeHandlersRef.current.onMove);
      window.removeEventListener('mouseup', resizeHandlersRef.current.onUp);
      resizeHandlersRef.current = null;
    }
  }, []);

  const _resetColWidths = useCallback(() => {
    setColWidths({});
  }, []);

  // Helper: resolve width for a column, favouring user override
  const getColWidth = useCallback((c) => {
    if (colWidths[c.id] != null) return colWidths[c.id];
    const parsed = parseInt(c.w);
    return Number.isFinite(parsed) ? parsed : 50;
  }, [colWidths]);

  // Drag-to-reorder columns
  const dragColRef = useRef(null);
  const dragOverColRef = useRef(null);
  const [draggingCol, setDraggingCol] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const onColDragStart = useCallback((e, colId) => {
    dragColRef.current = colId;
    setDraggingCol(colId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", colId);
  }, []);

  const onColDragOver = useCallback((e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (colId !== dragColRef.current) {
      dragOverColRef.current = colId;
      setDropTarget(colId);
    }
  }, []);

  const onColDrop = useCallback((e, colId) => {
    e.preventDefault();
    const fromId = dragColRef.current;
    if (!fromId || fromId === colId) { setDraggingCol(null); setDropTarget(null); return; }
    setVisibleCols(prev => {
      const arr = [...prev];
      const fromIdx = arr.indexOf(fromId);
      const toIdx = arr.indexOf(colId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, fromId);
      return arr;
    });
    dragColRef.current = null;
    dragOverColRef.current = null;
    setDraggingCol(null);
    setDropTarget(null);
  }, []);

  const onColDragEnd = useCallback(() => {
    dragColRef.current = null;
    dragOverColRef.current = null;
    setDraggingCol(null);
    setDropTarget(null);
  }, []);

  const moveColInOrder = useCallback((colId, direction) => {
    setVisibleCols(prev => {
      const arr = [...prev];
      const idx = arr.indexOf(colId);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }, []);

  const resetColOrder = useCallback(() => {
    setVisibleCols(prev => {
      const defaultOrder = COL_DEFS.map(c => c.id);
      return defaultOrder.filter(id => prev.includes(id));
    });
  }, []);

  const [fundData, setFundData] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(FUND_CACHE_KEY)); if (s && s.data && s.ts && Date.now() - s.ts < 24*3600*1000) return s.data; } catch {} return {};
  });
  const [fundLoading, setFundLoading] = useState(false);

  // DGR (Dividend Growth Rate) data — loaded when DGR columns are visible
  const DGR_CACHE_KEY = "ayr_dgr_cache";
  const [dgrData, setDgrData] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(DGR_CACHE_KEY)); if (s && s.data && s.ts && Date.now() - s.ts < 24*3600*1000) return s.data; } catch {} return {};
  });
  const [dgrLoading, setDgrLoading] = useState(false);

  useEffect(() => { localStorage.setItem(COLS_KEY, JSON.stringify(visibleCols)); }, [visibleCols]);


  useEffect(() => {
    const handler = (e) => { if (colPickerRef.current && !colPickerRef.current.contains(e.target)) setShowColPicker(false); };
    if (showColPicker) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColPicker]);

  const toggleCol = (id) => { const col = COL_DEFS.find(c=>c.id===id); if (col?.locked) return; setVisibleCols(prev => prev.includes(id) ? prev.filter(c=>c!==id) : [...prev, id]); };
  const resetCols = () => setVisibleCols(DEFAULT_COLS);
  const showAllCols = () => setVisibleCols(COL_DEFS.map(c=>c.id));

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape' && quickFilter) { setQuickFilter(""); searchRef.current?.blur(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [quickFilter]);

  useEffect(() => {
    if (!alerts.length) return;
    const pos = portfolioTotals?.positions || [];
    alerts.forEach(a => {
      const p = pos.find(x => x.ticker === a.ticker);
      if (!p) return;
      const triggered = a.direction === "below" ? p.lastPrice <= a.price : p.lastPrice >= a.price;
      if (triggered && !a.fired) {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`${a.ticker} ${a.direction === "below" ? "bajo a" : "subio a"} $${p.lastPrice.toFixed(2)}`);
        }
        saveAlerts(alerts.map(x => x === a ? { ...x, fired: true } : x));
      }
    });
  }, [portfolioTotals?.positions, saveAlerts, alerts]);

  const loadFundamentals = useCallback(async () => {
    const tickers = (portfolioTotals?.positions || []).map(p=>p.ticker); // Worker FMP_MAP handles foreign tickers
    if (!tickers.length) return;
    setFundLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/fundamentals/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: tickers }),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      const result = {};
      for (const [sym, info] of Object.entries(data.results || {})) {
        if (!info) continue;
        // ── Zod runtime check (2026-05-03) ────────────────────────────────
        // Logging-only: si FMP cambia el schema (Bug #001 TTM→annual o Bug
        // #010 mktCap missing), reporta a /api/error-log fire-and-forget.
        // NUNCA bloquea — el parsing manual de abajo sigue con `info` raw.
        safeParseFundamentals(info, sym);
        // ── 2026-05-03 fix ─────────────────────────────────────────────────
        // The worker returns ratios + keyMetrics as ANNUAL ARRAYS
        // (period=annual, limit=10). Reading `.peRatioTTM` etc on an array
        // always yielded undefined → evEbitda/PE/PB silently 0 in Portfolio.
        // Take the most recent annual entry [0] and use the non-TTM keys.
        const ratiosArr = Array.isArray(info.ratios)     ? info.ratios     : [];
        const kmArr     = Array.isArray(info.keyMetrics) ? info.keyMetrics : [];
        const ratios    = ratiosArr[0] || {};
        const km        = kmArr[0]     || {};
        const profile   = info.profile || {};
        result[sym] = {
          pe: ratios.priceToEarningsRatio || ratios.peRatio || km.peRatio || profile.pe || 0,
          fwdPE: km.peRatio || ratios.peRatio || 0,
          pb: ratios.priceToBookRatio || km.pbRatio || km.priceToBookRatio || 0,
          evEbitda: ratios.enterpriseValueMultiple
                 || ratios.enterpriseValueOverEBITDA
                 || km.enterpriseValueOverEBITDA
                 || km.evToEBITDA
                 || km.evToOperatingCashFlow
                 || 0,
          roe: ratios.returnOnEquity || km.roe || km.returnOnEquity || 0,
          debtEq: ratios.debtToEquityRatio || ratios.debtEquityRatio || km.debtToEquity || 0,
          beta: profile.beta || 0,
          payoutRatio: ratios.dividendPayoutRatio || ratios.payoutRatio || km.payoutRatio || 0,
          divGrowth5y: km.dividendGrowth5Y || 0,
          exDivDate: profile.exDivDate || "",
          ytd: km.ytdReturn || 0,
          // 2026-05-03: incluir sector/industry de FMP profile para que la
          // tabla Portfolio use el sector real (FMP) en lugar del legacy
          // de positions table que estaba desactualizado para varios
          // tickers (ADP "Technology" → real "Industrials", etc.)
          sector: profile.sector || "",
          industry: profile.industry || "",
        };
      }
      setFundData(result);
      localStorage.setItem(FUND_CACHE_KEY, JSON.stringify({ data: result, ts: Date.now() }));
    } catch(e) { console.error("Fundamentals bulk load error:", e); }
    setFundLoading(false);
  }, [portfolioTotals?.positions]);

  const [refreshingAll, setRefreshingAll] = useState(false);

  const loadDGR = useCallback(async () => {
    const tickers = (portfolioTotals?.positions || []).map(p=>p.ticker); // Worker FMP_MAP handles foreign tickers
    if (!tickers.length) return;
    setDgrLoading(true);
    try {
      // Load in batches of 30
      const allResults = {};
      for (let i = 0; i < tickers.length; i += 30) {
        const batch = tickers.slice(i, i + 30);
        const resp = await fetch(`${API_URL}/api/dividend-growth?tickers=${batch.join(",")}`);
        if (resp.ok) {
          const data = await resp.json();
          Object.assign(allResults, data);
        }
      }
      setDgrData(allResults);
      localStorage.setItem(DGR_CACHE_KEY, JSON.stringify({ data: allResults, ts: Date.now() }));
    } catch(e) { console.error("DGR load error:", e); }
    setDgrLoading(false);
  }, [portfolioTotals?.positions]);

  // Auto-load fundamentals + DGR on mount if cache is stale or empty.
  // FMP data is cached 24h in both localStorage (frontend) and D1 (worker),
  // so this only makes real FMP API calls once per day.
  useEffect(() => {
    if (Object.keys(fundData).length === 0 && !fundLoading && portfolioTotals?.positions?.length) {
      loadFundamentals();
    }
  }, [portfolioTotals?.positions?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Object.keys(dgrData).length === 0 && !dgrLoading && portfolioTotals?.positions?.length) {
      loadDGR();
    }
  }, [portfolioTotals?.positions?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh everything: prices + Q&S + fundamentals + DGR.
  // Invalidates caches first so the next fetch comes fresh.
  const refreshAll = useCallback(async () => {
    if (refreshingAll) return;
    setRefreshingAll(true);
    try {
      try { sessionStorage.removeItem(QS_CACHE_KEY); } catch {}
      try { localStorage.removeItem(FUND_CACHE_KEY); } catch {}
      try { localStorage.removeItem(DGR_CACHE_KEY); } catch {}
      await Promise.all([
        refreshPrices?.(true),
        loadQsScores(true),
        loadFundamentals(),
        loadDGR(),
      ].filter(Boolean));
    } catch (e) { console.error("refreshAll error:", e); }
    finally { setRefreshingAll(false); }
  }, [refreshingAll, refreshPrices, loadQsScores, loadFundamentals, loadDGR]);

  const enrichedPositions = useMemo(() => {
    return (portfolioTotals?.positions || []).map(p => ({
      ...p,
      _fund: fundData[p.ticker] || null,
      _dgr: dgrData[p.ticker] || null,
      _sm: smartMoneyHolders?.[p.ticker] || null,
    }));
  }, [portfolioTotals?.positions, fundData, dgrData, smartMoneyHolders]);

  const activeCols = useMemo(() => visibleCols.map(id => COL_DEFS.find(c => c.id === id)).filter(Boolean), [visibleCols]);

  const needsFund = useMemo(() => {
    const fc = new Set(["pe","fwdPE","pb","evEbitda","roe","debtEq","payoutRatio","exDate","ytd"]);
    return activeCols.some(c => fc.has(c.id));
  }, [activeCols]);

  const needsDGR = useMemo(() => {
    return activeCols.some(c => c.isDGR);
  }, [activeCols]);

  if (!portfolioList || portfolioList.length === 0) {
    return pricesLoading
      ? <LoadingSkeleton rows={6} cards={4} message="Cargando portfolio..." />
      : <EmptyState icon={"\ud83d\udcc2"} title="Tu portfolio esta vacio" subtitle="Anade posiciones para empezar." action="Sincronizar IB" onAction={() => {}} />;
  }

  return (
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {/* IB-style live header
            NOTE on scope: NLV = total IB account value (stocks + options + cash).
            P&L = unrealized P&L for STK positions only, divided by STK cost basis.
            These intentionally differ: NLV shows total wealth, P&L shows stock performance. */}
        {portfolioList.length>0 && (() => {
          const nlv = ibData?.summary?.nlv?.amount || portfolioTotals.totalValueUSD;
          // IB P&L: if IB is loaded but returns $0 (weekends/off-hours), fall back to portfolioTotals, then server cache, then localStorage
          let totalPnl, costTotal;
          if (ibData?.loaded) {
            const ibPnl = (ibData.positions||[]).filter(p=>p.assetClass==="STK").reduce((s,p)=>s+(p.unrealizedPnl||0),0);
            const ibCost = (ibData.positions||[]).filter(p=>p.assetClass==="STK").reduce((s,p)=>s+((p.avgCost||0)*(p.shares||0)),0);
            if (ibPnl === 0 && portfolioTotals.pnlUSD !== 0) {
              // IB returned zero (market closed) — use computed fallback
              totalPnl = portfolioTotals.pnlUSD;
              costTotal = portfolioTotals.totalCostUSD;
            } else if (ibPnl === 0 && portfolioTotals.pnlUSD === 0) {
              // Both IB and portfolioTotals are zero — use server-side cache or localStorage
              const serverPnl = CACHED_PNL?.pnl || 0;
              const serverCost = CACHED_PNL?.cost || 0;
              if (serverPnl !== 0) {
                totalPnl = serverPnl;
                costTotal = serverCost;
              } else {
                // Last resort: localStorage
                try {
                  const ls = JSON.parse(localStorage.getItem('ayr_last_pnl') || '{}');
                  totalPnl = ls.pnl || 0;
                  costTotal = ls.cost || 0;
                } catch(e) { totalPnl = 0; costTotal = 0; }
              }
            } else {
              totalPnl = ibPnl;
              costTotal = ibCost;
              // Cache non-zero P&L for future fallback (localStorage + server)
              if (ibPnl !== 0) {
                try { localStorage.setItem('ayr_last_pnl', JSON.stringify({pnl:ibPnl,cost:ibCost,ts:Date.now()})); } catch(e) {}
              }
            }
          } else {
            totalPnl = portfolioTotals.pnlUSD;
            costTotal = portfolioTotals.totalCostUSD;
            // If portfolioTotals also zero, try server cache
            if (totalPnl === 0 && costTotal === 0) {
              const serverPnl = CACHED_PNL?.pnl || 0;
              const serverCost = CACHED_PNL?.cost || 0;
              if (serverPnl !== 0) {
                totalPnl = serverPnl;
                costTotal = serverCost;
              }
            }
          }
          const pnlPct = costTotal > 0 ? (totalPnl / costTotal * 100) : (portfolioTotals.pnlPctUSD * 100);
          const lastSync = ibData?.lastSync ? new Date(ibData.lastSync).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "";
          const isLive = ibData?.loaded;
          return (
          <div style={{display:"flex",gap:12,padding:"6px 0",flexWrap:"wrap",alignItems:"center"}}>
            <div style={{fontFamily:"var(--fm)",display:"flex",alignItems:"center"}}><span style={{fontSize:9,color:"var(--text-tertiary)"}}>NLV </span><span style={{fontSize:20,fontWeight:700,color:"var(--text-primary)"}}>{hide("$"+fDol(nlv))}</span><TrustBadge level={isLive?"fresh":getLevel("nlv")} source={isLive?"IB OAuth (en vivo)":getSource("nlv")} updatedAt={isLive?(lastSync||getUpdatedAt("nlv")):getUpdatedAt("nlv")} note="Net Liquidation Value de IB"/></div>
            <div style={{fontFamily:"var(--fm)",display:"flex",alignItems:"center"}} title="Stocks P&L only (excludes options + cash)"><span style={{fontSize:9,color:"var(--text-tertiary)"}}>P&L </span><span style={{fontSize:16,fontWeight:700,color:totalPnl>=0?"var(--green)":"var(--red)"}}>{hide((totalPnl>=0?"+":"")+fDol(totalPnl))}</span><span style={{fontSize:10,color:totalPnl>=0?"var(--green)":"var(--red)",marginLeft:4,opacity:.7}}>{pnlPct>=0?"+":""}{_sf(pnlPct,1)}%</span><TrustBadge level={isLive?"fresh":getLevel("positions")} source={isLive?"IB OAuth (en vivo)":"D1 positions (coste) + Yahoo precio"} updatedAt={isLive?(lastSync||getUpdatedAt("positions")):getUpdatedAt("positions")} note="P&L de acciones solamente (sin opciones ni cash)"/></div>
            <div style={{fontFamily:"var(--fm)",display:"flex",alignItems:"center"}} title="Dividendo anual forward BRUTO (antes de WHT). Para neto ver DividendosTab o NominaTab."><span style={{fontSize:9,color:"var(--text-tertiary)"}}>Div bruto </span><span style={{fontSize:14,fontWeight:700,color:"var(--gold)"}}>{hide("$"+fDol(portfolioTotals.totalDivUSD))}</span><span style={{fontSize:9,color:"var(--gold)",marginLeft:3,opacity:.6}}>YOC {_sf(portfolioTotals.yocUSD*100,1)}%</span><TrustBadge level={getLevel("dividendos")} source="FMP DPS × shares (D1 fundamentals cache 24h TTL)" updatedAt={getUpdatedAt("dividendos")} note="Proyección anual bruta. No es lo cobrado real."/></div>
            <div onClick={()=>setHomeTab("nomina")} style={{fontFamily:"var(--fm)",cursor:"pointer",padding:"2px 8px",borderRadius:6,background:"var(--gold-dim)",border:"1px solid var(--gold)",opacity:.85,transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.85} title="Ver Mi Nomina"><span style={{fontSize:13,fontWeight:700,color:"var(--gold)"}}>{hide("$"+fDol(portfolioTotals.totalDivUSD/12))}/mes</span></div>
            <ThesesCoverageBadge />
            {isLive && <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,fontSize:9,fontFamily:"var(--fm)",color:"var(--green)"}}><span style={{width:6,height:6,borderRadius:3,background:"var(--green)",display:"inline-block",animation:"pulse 2s infinite"}}/>LIVE {lastSync}</div>}
          </div>);
        })()}

        {/* Controls bar */}
        {portfolioList.length>0 && (() => {
          const pos = portfolioTotals.positions || [];
          const greenCount = pos.filter(p=>(p.pnlPct||0)>=0).length;
          const countryCounts = {};
          pos.forEach(p => { const cc = getCountry(p.ticker, p.currency); countryCounts[cc] = (countryCounts[cc]||0) + 1; });
          const countrySorted = Object.entries(countryCounts).sort((a,b) => b[1] - a[1]);
          const exportCSV = () => {
            const headers = activeCols.map(c=>c.label);
            const rows = [headers.join(",")];
            pos.forEach(p => { const ep = { ...p, _fund: fundData[p.ticker] || null }; rows.push(activeCols.map(c => { const v = c.val(ep); return typeof v === "string" ? '"'+v+'"' : v; }).join(",")); });
            const csv = rows.join("\n"); const blob = new Blob([csv],{type:"text/csv"}); const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download="ayr_portfolio_"+new Date().toISOString().slice(0,10)+".csv"; a.click(); URL.revokeObjectURL(url);
          };
          return (
          <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
            <button onClick={()=>setCountryFilter("")} style={{padding:"2px 6px",borderRadius:5,border:countryFilter===""?"1.5px solid var(--gold)":"1px solid var(--border)",background:countryFilter===""?"var(--gold-dim)":"transparent",color:countryFilter===""?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{pos.length}</button>
            <PortfolioCountryPills
              countrySorted={countrySorted}
              countryFilter={countryFilter}
              setCountryFilter={setCountryFilter}
              FLAGS={FLAGS}
            />
            <span style={{fontSize:9,fontFamily:"var(--fm)",color:"var(--text-tertiary)",marginLeft:4}}>Yield <b style={{color:"var(--gold)"}}>{_sf(portfolioTotals.yieldUSD*100,1)}%</b></span>
            <span style={{fontSize:9,fontFamily:"var(--fm)",color:"var(--green)"}}>{greenCount}{"\u2713"}</span>
            <div style={{marginLeft:"auto",display:"flex",gap:3,alignItems:"center"}}>
              <input type="text" placeholder="+ Ticker" value={searchTicker} onChange={e=>setSearchTicker(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter"&&searchTicker){updatePosition(searchTicker,{list:"portfolio",shares:0,avgCost:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}} style={{padding:"4px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:10,outline:"none",fontFamily:"var(--fm)",width:70}}/>
              <button onClick={()=>refreshPrices(true)} disabled={pricesLoading} title="Solo precios (rápido)" style={{padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:pricesLoading?"var(--gold)":"var(--text-tertiary)",fontSize:10,cursor:pricesLoading?"wait":"pointer"}}>{pricesLoading?"\u23f3":"\ud83d\udd04"}</button>
              <button onClick={refreshAll} disabled={refreshingAll} title="Refrescar precios + Q&S + Fundamentales + DGR (todo)" style={{padding:"4px 7px",borderRadius:6,border:"1px solid var(--gold)",background:refreshingAll?"var(--gold-dim)":"transparent",color:"var(--gold)",fontSize:10,cursor:refreshingAll?"wait":"pointer",fontWeight:700}}>{refreshingAll?"⏳":"🔁 Todo"}</button>
              <button onClick={exportCSV} title="CSV" style={{padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)"}} onMouseEnter={e=>e.target.style.color="var(--gold)"} onMouseLeave={e=>e.target.style.color="var(--text-tertiary)"}>CSV</button>
            </div>
          </div>);
        })()}

        {/* \u2500\u2500 Vistas (presets de columnas) \u2500\u2500 */}
        {portfolioList.length>1 && (
          <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
            <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.5,marginRight:4}}>VISTA</span>
            {views.map(v => {
              const active = activeView === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => switchView(v.id)}
                  onDoubleClick={active ? renameCurrentView : undefined}
                  title={active ? "Doble click para renombrar" : `Cambiar a vista "${v.name}"`}
                  style={{
                    padding:"4px 10px", borderRadius:6,
                    border:`1px solid ${active?"var(--gold)":"var(--border)"}`,
                    background:active?"var(--gold-dim)":"transparent",
                    color:active?"var(--gold)":"var(--text-tertiary)",
                    fontSize:10, fontWeight:active?700:500,
                    cursor:"pointer", fontFamily:"var(--fm)",
                  }}
                >{v.name}</button>
              );
            })}
            <button
              onClick={saveAsNewView}
              title="Guardar columnas actuales como vista nueva"
              style={{padding:"4px 8px",borderRadius:6,border:"1px dashed var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)"}}
            >+ nueva</button>
            {views.length > 0 && (
              <button
                onClick={deleteCurrentView}
                title="Borrar / restaurar vista actual"
                style={{padding:"4px 8px",borderRadius:6,border:"1px solid rgba(255,69,58,.3)",background:"transparent",color:"#ff453a",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)"}}
              >\ud83d\uddd1</button>
            )}
          </div>
        )}

        {/* Search + Sort + Column Toggle */}
        {portfolioList.length>1 && (
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2,flexWrap:"wrap"}}>
            {portfolioList.length>5 && (
              <div style={{position:"relative",flex:1,maxWidth:220}}>
                <input ref={searchRef} type="text" placeholder="Buscar... (Cmd+K)" value={quickFilter} onChange={e=>setQuickFilter(e.target.value)} style={{width:"100%",padding:"5px 10px",background:"rgba(255,255,255,.03)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)"}} onFocus={e=>e.target.style.borderColor="rgba(200,164,78,.3)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
                {quickFilter && <button onClick={()=>setQuickFilter("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:12}}>{"\u00d7"}</button>}
              </div>
            )}
            <div style={{position:"relative"}} ref={colPickerRef}>
              <button onClick={()=>setShowColPicker(!showColPicker)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+(showColPicker?"var(--gold)":"var(--border)"),background:showColPicker?"var(--gold-dim)":"transparent",color:showColPicker?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>
                Columnas ({visibleCols.length}/{COL_DEFS.length})
              </button>
              {showColPicker && (
                <div style={{position:"absolute",top:"100%",left:0,zIndex:100,marginTop:4,background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:10,minWidth:280,maxHeight:480,overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
                  <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
                    <button onClick={resetCols} style={{padding:"3px 8px",borderRadius:5,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:9,cursor:"pointer",fontFamily:"var(--fm)"}}>Default</button>
                    <button onClick={showAllCols} style={{padding:"3px 8px",borderRadius:5,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:9,cursor:"pointer",fontFamily:"var(--fm)"}}>Todas</button>
                    <button onClick={()=>setVisibleCols(COL_DEFS.filter(c=>c.locked).map(c=>c.id))} style={{padding:"3px 8px",borderRadius:5,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:9,cursor:"pointer",fontFamily:"var(--fm)"}}>Minimo</button>
                    <button onClick={resetColOrder} style={{padding:"3px 8px",borderRadius:5,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:9,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:600}}>Reset orden</button>
                  </div>
                  {orderedColGroups.map(({id: group}) => {
                    const { extraStyle } = colGroupDragVisuals(group);
                    return (
                      <div
                        key={group}
                        {...colGroupDragHandlers(group)}
                        title="Arrastra para reordenar grupos"
                        style={{marginBottom:6, padding:"2px 0", ...extraStyle}}
                      >
                        <div style={{fontSize:8,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:3,textTransform:"uppercase"}}>{group}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                          {COL_DEFS.filter(c=>c.group===group).map(c => (
                            <label key={c.id} style={{display:"flex",alignItems:"center",gap:3,fontSize:9,fontFamily:"var(--fm)",color:visibleCols.includes(c.id)?"var(--text-primary)":"var(--text-tertiary)",cursor:c.locked?"default":"pointer",opacity:c.locked?.6:1,padding:"2px 4px",borderRadius:4,background:visibleCols.includes(c.id)?"rgba(200,164,78,.08)":"transparent"}}>
                              <input type="checkbox" checked={visibleCols.includes(c.id)} onChange={()=>toggleCol(c.id)} disabled={c.locked} style={{width:12,height:12,accentColor:"var(--gold)"}}/>
                              {c.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Column order - numbered list with up/down arrows (iPad friendly) */}
                  <div style={{borderTop:"1px solid var(--border)",paddingTop:6,marginTop:4,marginBottom:6}}>
                    <div style={{fontSize:8,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:4,textTransform:"uppercase"}}>Orden de columnas</div>
                    <div style={{display:"flex",flexDirection:"column",gap:1}}>
                      {visibleCols.map((colId, idx) => {
                        const colDef = COL_DEFS.find(c=>c.id===colId);
                        if (!colDef) return null;
                        return (
                          <div key={colId} style={{display:"flex",alignItems:"center",gap:4,padding:"2px 4px",borderRadius:4,background:"rgba(255,255,255,.02)",fontSize:9,fontFamily:"var(--fm)"}}>
                            <span style={{color:"var(--text-tertiary)",fontSize:8,width:14,textAlign:"right",flexShrink:0}}>{idx+1}.</span>
                            <span style={{color:"var(--text-primary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{colDef.label}</span>
                            <button onClick={()=>moveColInOrder(colId,-1)} disabled={idx===0} style={{width:18,height:18,borderRadius:3,border:"1px solid var(--border)",background:"transparent",color:idx===0?"var(--text-tertiary)":"var(--gold)",fontSize:10,cursor:idx===0?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:idx===0?.3:1,padding:0,lineHeight:1}} title="Mover arriba">{"\u25b2"}</button>
                            <button onClick={()=>moveColInOrder(colId,1)} disabled={idx===visibleCols.length-1} style={{width:18,height:18,borderRadius:3,border:"1px solid var(--border)",background:"transparent",color:idx===visibleCols.length-1?"var(--text-tertiary)":"var(--gold)",fontSize:10,cursor:idx===visibleCols.length-1?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:idx===visibleCols.length-1?.3:1,padding:0,lineHeight:1}} title="Mover abajo">{"\u25bc"}</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{borderTop:"1px solid var(--border)",paddingTop:6,marginTop:4}}>
                    <button onClick={loadFundamentals} disabled={fundLoading} style={{width:"100%",padding:"5px 10px",borderRadius:6,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:10,fontWeight:600,cursor:fundLoading?"wait":"pointer",fontFamily:"var(--fm)"}}>
                      {fundLoading ? "Cargando fundamentales..." : Object.keys(fundData).length > 0 ? "Recargar P/E, ROE, D/E..." : "Cargar P/E, ROE, D/E..."}
                    </button>
                    {Object.keys(fundData).length > 0 && <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2,textAlign:"center"}}>{Object.keys(fundData).length} tickers cargados</div>}
                    <button onClick={loadDGR} disabled={dgrLoading} style={{width:"100%",padding:"5px 10px",borderRadius:6,border:"1px solid var(--green)",background:"rgba(48,209,88,.08)",color:"var(--green)",fontSize:10,fontWeight:600,cursor:dgrLoading?"wait":"pointer",fontFamily:"var(--fm)",marginTop:4}}>
                      {dgrLoading ? "Cargando DGR..." : Object.keys(dgrData).length > 0 ? "Recargar DGR 1Y/3Y/5Y/10Y" : "Cargar DGR 1Y/3Y/5Y/10Y"}
                    </button>
                    {Object.keys(dgrData).length > 0 && <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2,textAlign:"center"}}>{Object.keys(dgrData).length} tickers DGR</div>}
                  </div>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:3,marginLeft:"auto"}}>
              {orderedSortOptions.map(s=>{
                const active = listSort===s.id && !colSort.id;
                const { extraStyle } = sortDragVisuals(s.id);
                return (
                  <button
                    key={s.id}
                    {...sortDragHandlers(s.id)}
                    onClick={()=>{setListSort(s.id);setColSort({id:null,asc:false});}}
                    title="Arrastra para reordenar"
                    style={{
                      padding:"3px 7px",borderRadius:5,
                      border:"1px solid "+(active?"var(--gold)":"var(--border)"),
                      background:active?"var(--gold-dim)":"transparent",
                      color:active?"var(--gold)":"var(--text-tertiary)",
                      fontSize:9,fontWeight:active?700:500,
                      fontFamily:"var(--fm)",
                      ...extraStyle,
                    }}
                  >
                    {s.lbl}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Portfolio Table */}
        {(() => {
          const all = enrichedPositions;
          const filtered = all.filter(p => {
            if (countryFilter && getCountry(p.ticker, p.currency) !== countryFilter) return false;
            if (quickFilter) { const q = quickFilter.toLowerCase(); return p.ticker.toLowerCase().includes(q) || (p.name||"").toLowerCase().includes(q) || (p.sector||"").toLowerCase().includes(q); }
            return true;
          });
          let sorted;
          if (colSort.id) {
            const colDef = COL_DEFS.find(c=>c.id===colSort.id);
            if (colDef) {
              sorted = [...filtered].sort((a,b) => { const va = colDef.sortV(a), vb = colDef.sortV(b); const cmp = typeof va === "string" ? va.localeCompare(vb) : (va||0)-(vb||0); return colSort.asc ? cmp : -cmp; });
            } else { sorted = [...filtered].sort(SORT_OPTIONS.find(s=>s.id===listSort)?.fn || (()=>0)); }
          } else { sorted = [...filtered].sort(SORT_OPTIONS.find(s=>s.id===listSort)?.fn || (()=>0)); }

          const isFiltered = quickFilter || countryFilter;
          const toggleColSortFn = (id) => setColSort(prev => ({ id, asc: prev.id === id ? !prev.asc : false }));

          return <>
            {isFiltered && filtered.length !== all.length && (
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>
                Mostrando <span style={{color:"var(--gold)",fontWeight:700}}>{filtered.length}</span> de {all.length}
                {!filtered.length && quickFilter && <span style={{marginLeft:8}}> sin resultados</span>}
              </div>
            )}
            {needsFund && Object.keys(fundData).length === 0 && (
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",padding:"4px 8px",background:"rgba(200,164,78,.06)",borderRadius:6,marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
                Columnas de valoracion visibles.
                <button onClick={loadFundamentals} disabled={fundLoading} style={{padding:"2px 8px",borderRadius:4,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{fundLoading?"Cargando...":"Cargar datos"}</button>
              </div>
            )}
            {needsDGR && Object.keys(dgrData).length === 0 && (
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",padding:"4px 8px",background:"rgba(48,209,88,.06)",borderRadius:6,marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
                Columnas DGR visibles.
                <button onClick={loadDGR} disabled={dgrLoading} style={{padding:"2px 8px",borderRadius:4,border:"1px solid var(--green)",background:"rgba(48,209,88,.08)",color:"var(--green)",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{dgrLoading?"Cargando...":"Cargar DGR"}</button>
              </div>
            )}
            <div style={{overflowX:"auto",borderRadius:8,border:"1px solid var(--border)"}}>
              <table style={{width:"max-content",borderCollapse:"collapse",fontSize:10,fontFamily:"var(--fm)",minWidth:"100%"}}>
                <colgroup>
                  <col style={{width:22}}/>
                  {activeCols.map(c=><col key={c.id} style={{width:getColWidth(c)}}/>)}
                  <col style={{width:24}}/>
                </colgroup>
                <thead><tr style={{borderBottom:"2px solid var(--border)"}}>
                  <th style={{padding:"4px 2px",width:22}}/>
                  {activeCols.map(c=>(
                    <th key={c.id} draggable="true" onDragStart={e=>onColDragStart(e,c.id)} onDragOver={e=>onColDragOver(e,c.id)} onDrop={e=>onColDrop(e,c.id)} onDragEnd={onColDragEnd} onClick={()=>toggleColSortFn(c.id)} style={{padding:"6px 4px",textAlign:c.align||"right",color:colSort.id===c.id?"var(--gold)":"var(--text-secondary)",fontSize:9.5,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:.4,cursor:draggingCol?"grabbing":"pointer",whiteSpace:"nowrap",userSelect:"none",overflow:"hidden",textOverflow:"ellipsis",opacity:draggingCol===c.id?.5:1,borderLeft:dropTarget===c.id?"2px solid var(--gold)":"2px solid transparent",transition:"border-color .1s",position:"relative",borderBottom:"1px solid var(--subtle-border)"}} title={`${c.label} — arrastra el borde derecho para redimensionar`}>
                      {c.label}{colSort.id===c.id?(colSort.asc?" \u25b2":" \u25bc"):""}
                      <span
                        onMouseDown={(e)=>onResizeStart(e,c.id,getColWidth(c))}
                        onClick={(e)=>e.stopPropagation()}
                        style={{position:"absolute",right:0,top:0,bottom:0,width:4,cursor:"col-resize",background:"transparent",zIndex:2}}
                        title="Arrastra para redimensionar"
                      />
                    </th>
                  ))}
                  <th style={{padding:"4px 2px",width:24}}/>
                </tr></thead>
                <tbody>{sorted.map(p => {
                  const pnl = p.pnlPct||0;
                  const pnlColor = pnl > 0.001 ? "var(--green)" : pnl < -0.001 ? "var(--red)" : "var(--gold)";
                  const sectorColor = getSectorColor(p.sector);
                  const cc = getCountry(p.ticker, p.ccy || p.currency);
                  return (
                    <tr key={p.ticker} onClick={()=>openAnalysis(p.ticker)} style={{borderBottom:"1px solid rgba(255,255,255,.04)",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(200,164,78,.04)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"3px 2px",verticalAlign:"middle"}}>
                        <div style={{width:20,height:20,borderRadius:5,overflow:"hidden",background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                          <img src={"https://images.financialmodelingprep.com/symbol/"+p.ticker.replace(':','.')+".png"} alt="" style={{width:20,height:20,objectFit:"contain",borderRadius:5}} onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
                          <div style={{display:"none",width:20,height:20,borderRadius:5,background:"linear-gradient(135deg, "+((()=>{const h=p.ticker.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%360;return"hsl("+h+",55%,45%), hsl("+h+",55%,30%)";})())+")","alignItems":"center","justifyContent":"center",fontSize:8,fontWeight:800,color:"#fff"}}>{p.ticker.charAt(0)}</div>
                          <div style={{position:"absolute",bottom:0,right:0,width:5,height:5,borderRadius:"50%",background:pnlColor,border:"1px solid var(--card)"}}/>
                        </div>
                      </td>
                      {activeCols.map(c => {
                        // Inject _qs, _5f, _oracle into position object so columns can read them
                        let pWithQs = qsScores && qsScores[p.ticker] ? { ...p, _qs: qsScores[p.ticker] } : p;
                        if (fiveFilters && fiveFilters[p.ticker]) pWithQs = { ...pWithQs, _5f: fiveFilters[p.ticker] };
                        if (oracleVerdicts && oracleVerdicts[p.ticker]) pWithQs = { ...pWithQs, _oracle: oracleVerdicts[p.ticker] };
                        if (c.id === "ticker") {
                          const ibTitle = p.dataSource==="IB" ? "Sincronizado desde Interactive Brokers" : "";
                          return (<td key={c.id} style={{padding:"3px 3px",verticalAlign:"middle",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                            <div style={{display:"flex",alignItems:"center",gap:3,minWidth:0}}>
                              <span style={{fontSize:11,flexShrink:0}}>{FLAGS[cc]||""}</span>
                              <span style={{fontSize:11,fontWeight:700,color:"var(--gold)",letterSpacing:"0.5px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.ticker}</span>
                              {sectorColor && <div style={{width:5,height:5,borderRadius:"50%",background:sectorColor,flexShrink:0,opacity:.8}} title={p.sector}/>}
                              {p.dataSource==="IB" && <div title={ibTitle} style={{width:5,height:5,borderRadius:"50%",background:"#64d2ff",flexShrink:0,opacity:.8}}/>}
                              {divStreaks && divStreaks[p.ticker]?.streak >= 5 && <span style={{fontSize:6,fontWeight:700,padding:"0 3px",borderRadius:3,background:divStreaks[p.ticker]?.streak>=25?"rgba(200,164,78,.18)":"rgba(255,214,10,.10)",color:divStreaks[p.ticker]?.streak>=25?"var(--gold)":"#ffd60a",flexShrink:0,letterSpacing:.2}} title={`${divStreaks[p.ticker].streak} años subiendo dividendo`}>{divStreaks[p.ticker].streak}y</span>}
                            </div>
                          </td>);
                        }
                        if (c.id === "name") {
                          return (<td key={c.id} style={{padding:"3px 3px",verticalAlign:"middle",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                            <span style={{fontSize:11,fontWeight:400,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={p.name||p.ticker}>{p.name||p.ticker}</span>
                          </td>);
                        }
                        if (c.id === "sector") {
                          const sc = getSectorColor(p.sector);
                          return (<td key={c.id} style={{padding:"3px 3px",verticalAlign:"middle",textAlign:"left",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}><span style={{fontSize:9,color:sc||"var(--text-tertiary)"}} title={p.sector||""}>{c.fmt(c.val(p),p)}</span></td>);
                        }
                        // 5 Filters column: 5-bar SVG + composite score + hover tooltip
                        if (c.is5F) {
                          const ff = pWithQs._5f;
                          return (<td key={c.id} onClick={e=>e.stopPropagation()} style={{padding:"3px 3px",textAlign:"center",verticalAlign:"middle",whiteSpace:"nowrap"}}>
                            <FiveFiltersBars scores={ff} ticker={p.ticker} />
                          </td>);
                        }
                        // Oracle verdict column: badge with action + conviction if cached,
                        // else ↻ to generate on-demand. Click opens BuyWizard pre-loaded.
                        if (c.isOracle) {
                          const o = pWithQs._oracle;
                          const onClickOracle = (e) => { e.stopPropagation(); setOracleWizardTicker(p.ticker); };
                          if (o && o.action) {
                            const rank = { BUY: 6, ADD: 5, ACCUMULATE: 5, HOLD: 3, TRIM: 2, SELL: 1, AVOID: 0 }[o.action] ?? 3;
                            const color = rank >= 5 ? "#22c55e" : rank === 3 ? "#64d2ff" : rank === 2 ? "#f59e0b" : "#ef4444";
                            const tip = `${o.action} ${o.conviction || ''}/10\n${o.one_liner || ''}\n\nClick para ver análisis completo.`;
                            return (<td key={c.id} title={tip} onClick={onClickOracle}
                              style={{padding:"3px 3px",textAlign:"center",verticalAlign:"middle",whiteSpace:"nowrap",cursor:"pointer"}}>
                              <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"1px 5px",borderRadius:4,background:`${color}22`,border:`1px solid ${color}66`,color,fontSize:9,fontWeight:800,fontFamily:"var(--fm)",letterSpacing:.2}}>
                                {o.action}{o.conviction ? ` ${o.conviction}` : ''}
                              </span>
                            </td>);
                          }
                          return (<td key={c.id} title="Generar veredicto Oracle (Buffett-style) — ~$0.75 por consulta"
                            onClick={onClickOracle}
                            style={{padding:"3px 3px",textAlign:"center",verticalAlign:"middle",cursor:"pointer",fontSize:12,color:"var(--text-tertiary)",opacity:.6}}
                            onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.color="var(--gold)";}}
                            onMouseLeave={e=>{e.currentTarget.style.opacity=".6";e.currentTarget.style.color="var(--text-tertiary)";}}>
                            ↻
                          </td>);
                        }
                        // Q/S columns: clickable to open drill-down modal
                        if (c.isQS) {
                          const val = c.val(pWithQs);
                          const formatted = c.fmt(val, pWithQs);
                          const cellColor = c.color ? c.color(val) : "var(--text-primary)";
                          const isClickable = val != null;
                          const tooltip = isClickable ? `${c.id === 'quality' ? 'Quality' : 'Dividend Safety'}: ${val.toFixed(0)}/100 (click para detalles)` : (c.id === 'safety' ? 'Safety N/A — no dividend payer o sin datos' : 'Sin datos');
                          return (<td key={c.id} title={tooltip} onClick={isClickable ? (e)=>{e.stopPropagation();openScoresModal && openScoresModal(p.ticker);} : undefined}
                            style={{padding:"3px 3px",textAlign:"center",verticalAlign:"middle",fontFamily:"var(--fm)",fontSize:11,fontWeight:800,color:cellColor,whiteSpace:"nowrap",cursor:isClickable?"pointer":"default"}}>
                            {formatted}
                          </td>);
                        }
                        // Smart Money column: tooltip listing fund holders + weights
                        if (c.isSM) {
                          const holders = p._sm || [];
                          const n = holders.length;
                          const val = n;
                          const formatted = c.fmt(val, p);
                          const cellColor = c.color ? c.color(val) : "var(--text-tertiary)";
                          const tooltip = n > 0
                            ? `${n} fondo${n>1?'s':''} lo tiene${n>1?'n':''}:\n` + holders.slice(0, 10).map(h => `· ${h.fund_name} (${h.weight_pct?.toFixed(1)}%) — ${h.manager}`).join('\n')
                            : 'Ningún superinvestor seguido lo tiene';
                          return (<td key={c.id} title={tooltip}
                            onClick={n > 0 ? (e)=>{e.stopPropagation();setHomeTab&&setHomeTab("smart-money");} : undefined}
                            style={{padding:"3px 3px",textAlign:"center",verticalAlign:"middle",fontFamily:"var(--fm)",fontSize:10,fontWeight:700,color:cellColor,whiteSpace:"nowrap",cursor:n>0?"pointer":"help"}}>
                            {formatted}
                          </td>);
                        }
                        // DGR columns: show tooltip with 1Y/3Y/5Y/10Y breakdown
                        if (c.isDGR && p._dgr) {
                          const d = p._dgr;
                          // Kept local: DGR tooltip needs signed + 1-decimal percent from a fraction; closest shared helper (fmtPctFracSigned) defaults to 2 decimals.
                          const fmtDGR = v => v != null ? (v >= 0 ? "+" : "") + _sf(v * 100, 1) + "%" : "\u2014";
                          const _dgrColor = v => v != null ? (v > 0.05 ? "#30d158" : v > 0.01 ? "#ffd60a" : "#ff453a") : "var(--text-tertiary)";
                          const val = c.val(p);
                          const formatted = c.fmt(val, p);
                          const cellColor = c.color ? c.color(val) : "var(--text-primary)";
                          const tooltip = `DGR ${p.ticker}\n1Y: ${fmtDGR(d.dgr1)}\n3Y: ${fmtDGR(d.dgr3)}\n5Y: ${fmtDGR(d.dgr5)}\n10Y: ${fmtDGR(d.dgr10)}\nStreak: ${d.streak||0} yrs`;
                          return (<td key={c.id} title={tooltip} style={{padding:"3px 3px",textAlign:"right",verticalAlign:"middle",fontFamily:"var(--fm)",fontSize:10,fontWeight:600,color:cellColor,whiteSpace:"nowrap",cursor:"help"}}>{formatted}</td>);
                        }
                        // Custom cell: category color dot picker (per-user persistence)
                        if (c.cellRenderType === 'categoryDot') {
                          return (<td key={c.id} onClick={e=>e.stopPropagation()} style={{padding:"3px 3px",textAlign:"center",verticalAlign:"middle",whiteSpace:"nowrap",overflow:"visible"}}>
                            <CategoryDot ticker={p.ticker} />
                          </td>);
                        }
                        const val = c.val(p);
                        const formatted = c.fmt(val, p);
                        const cellColor = c.color ? c.color(val) : "var(--text-primary)";
                        const isPrivate = c.priv && privacyMode;
                        return (<td key={c.id} style={{padding:"3px 3px",textAlign:c.align||"right",verticalAlign:"middle",fontFamily:"var(--fm)",fontSize:10,fontWeight:["pnl","value","price","chgPct"].includes(c.id)?700:500,color:cellColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{isPrivate ? "\u2022\u2022\u2022" : formatted}</td>);
                      })}
                      <td style={{padding:"3px 2px",verticalAlign:"middle"}} onClick={e=>e.stopPropagation()}>
                        <button onClick={(e)=>{e.stopPropagation();openCostBasis(p.ticker);}} title="Cost Basis" style={{width:16,height:16,borderRadius:3,border:"none",background:"transparent",color:"var(--gold)",fontSize:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:.3}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity=".3"}>{"\ud83d\udccb"}</button>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </>;
        })()}

        {/* Heatmap */}
        {portfolioTotals.positions?.length > 0 && (() => {
          const pos = portfolioTotals.positions;
          const totalVal = pos.reduce((s,p)=>s+(p.valueUSD||0),0) || 1;
          return (<div style={{marginTop:8}}>
            <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>Heatmap</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:3,borderRadius:12,overflow:"hidden"}}>
              {[...pos].sort((a,b)=>(b.valueUSD||0)-(a.valueUSD||0)).map(p => {
                const w = Math.max((p.valueUSD||0)/totalVal*100, 2.5);
                const pnl = (p.pnlPct||0)*100;
                const bg = pnl > 20 ? "#1a5c2a" : pnl > 5 ? "#1e4d2a" : pnl > 0 ? "#1a3d24" : pnl > -5 ? "#3d2020" : pnl > -20 ? "#4d2020" : "#5c1a1a";
                const isLarge = w > 5;
                return (<div key={p.ticker} onClick={()=>openAnalysis(p.ticker)} title={p.ticker+": "+_sf(pnl,1)+"%"} style={{width:"calc("+w+"% - 3px)",minWidth:55,minHeight:isLarge?70:50,padding:"8px 6px",background:bg,cursor:"pointer",textAlign:"center",transition:"all .15s",borderRadius:6,display:"flex",flexDirection:"column",justifyContent:"center",gap:2}} onMouseEnter={e=>{e.currentTarget.style.opacity=".8";e.currentTarget.style.transform="scale(1.02)";}} onMouseLeave={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.transform="scale(1)";}}>
                  <div style={{fontSize:isLarge?13:10,fontWeight:700,color:"#fff",fontFamily:"var(--fm)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.ticker}</div>
                  <div style={{fontSize:isLarge?14:11,fontWeight:700,color:pnl>=0?"#4ade80":"#f87171",fontFamily:"var(--fm)"}}>{pnl>=0?"+":""}{_sf(pnl,0)}%</div>
                  {isLarge && <div style={{fontSize:9,color:"rgba(255,255,255,.5)",fontFamily:"var(--fm)"}}>${_sf((p.valueUSD||0)/1000,1)}K</div>}
                </div>);
              })}
            </div>
          </div>);
        })()}

        {/* Tools */}
        {portfolioTotals.positions?.length > 0 && (
          <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
            <button onClick={()=>setShowCapTable(!showCapTable)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(showCapTable?"var(--gold)":"var(--border)"),background:showCapTable?"var(--gold-dim)":"transparent",color:showCapTable?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>Market Cap</button>
            <button onClick={()=>setShowRebalance(!showRebalance)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(showRebalance?"var(--gold)":"var(--border)"),background:showRebalance?"var(--gold-dim)":"transparent",color:showRebalance?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>Rebalanceo</button>
            <button onClick={()=>{setShowAlerts(!showAlerts);if(!showAlerts&&"Notification"in window)Notification.requestPermission();}} style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+(showAlerts?"var(--gold)":"var(--border)"),background:showAlerts?"var(--gold-dim)":"transparent",color:showAlerts?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>Alertas {alerts.length>0?"("+alerts.filter(a=>!a.fired).length+")":""}</button>
          </div>
        )}

        {/* Rebalance */}
        {showRebalance && portfolioTotals.positions?.length > 0 && (
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14,marginTop:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:8}}>Rebalanceo</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{borderBottom:"1px solid var(--border)"}}>
                  {["Ticker","Actual","Ideal","Desv.","Accion","Importe"].map(h=>(<th key={h} style={{padding:"4px 8px",textAlign:h==="Ticker"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)"}}>{h}</th>))}
                </tr></thead>
                <tbody>{(() => {
                  const idealW = 1 / (portfolioTotals.positions?.length || 1);
                  const totalVal = portfolioTotals.totalValueUSD;
                  return [...(portfolioTotals.positions||[])].map(p=>({...p, dev:(p.weight||0)-idealW})).sort((a,b)=>Math.abs(b.dev)-Math.abs(a.dev)).slice(0,10).map(p=>(
                    <tr key={p.ticker} style={{borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                      <td style={{padding:"4px 8px",fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{p.ticker}</td>
                      <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"var(--fm)"}}>{_sf((p.weight||0)*100,1)}%</td>
                      <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)"}}>{_sf(idealW*100,1)}%</td>
                      <td style={{padding:"4px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:p.dev>0?"var(--red)":"var(--green)"}}>{p.dev>0?"+":""}{_sf(p.dev*100,1)}%</td>
                      <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"var(--fm)",color:p.dev>0?"var(--red)":"var(--green)",fontSize:10}}>{p.dev>0?"VENDER":"COMPRAR"}</td>
                      <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:600}}>{privacyMode?"\u2022\u2022\u2022":"$"+_sf(Math.abs(p.dev)*totalVal,0)}</td>
                    </tr>
                  ));
                })()}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* Price Alerts */}
        {showAlerts && (
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14,marginTop:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:8}}>Alertas de Precio</div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
              <select value={alertForm.ticker} onChange={e=>setAlertForm({...alertForm,ticker:e.target.value})} style={{padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",outline:"none"}}>
                <option value="">Ticker...</option>
                {(portfolioTotals.positions||[]).map(p=><option key={p.ticker} value={p.ticker}>{p.ticker} (${_sf(p.lastPrice,2)})</option>)}
              </select>
              <select value={alertForm.direction} onChange={e=>setAlertForm({...alertForm,direction:e.target.value})} style={{padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",outline:"none"}}>
                <option value="below">{"\u2264"} Baja a</option>
                <option value="above">{"\u2265"} Sube a</option>
              </select>
              <input type="number" placeholder="$" value={alertForm.price} onChange={e=>setAlertForm({...alertForm,price:e.target.value})} style={{padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",outline:"none",width:70}}/>
              <button onClick={()=>{if(alertForm.ticker&&alertForm.price){saveAlerts([...alerts,{...alertForm,price:parseFloat(alertForm.price),fired:false,created:new Date().toISOString()}]);setAlertForm({ticker:"",price:"",direction:"below"});}}} style={{padding:"5px 12px",borderRadius:6,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>+ Crear</button>
            </div>
            {alerts.length > 0 && (<div style={{display:"flex",flexDirection:"column",gap:4}}>
              {alerts.map((a,i) => (
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:a.fired?"rgba(48,209,88,.06)":"rgba(255,255,255,.02)",borderRadius:6,fontSize:10,fontFamily:"var(--fm)"}}>
                  <span><b style={{color:"var(--gold)"}}>{a.ticker}</b> {a.direction==="below"?"\u2264":"\u2265"} <b>${a.price}</b></span>
                  <span>{a.fired ? <span style={{color:"var(--green)"}}>Disparada</span> : <span style={{color:"var(--text-tertiary)"}}>Pendiente</span>}</span>
                  <button onClick={()=>saveAlerts(alerts.filter((_,j)=>j!==i))} style={{border:"none",background:"transparent",color:"var(--text-tertiary)",cursor:"pointer",fontSize:10}}>{"\u2715"}</button>
                </div>
              ))}
            </div>)}
          </div>
        )}

        {/* Market Cap Table */}
        {portfolioTotals.positions?.length > 0 && showCapTable && (
          <div style={{marginTop:8}}>
            {(() => {
              const capLabel = mc => { const v=(mc||0)*1e9; return v>=200e9?"MEGA":v>=10e9?"LC":v>=2e9?"MC":v>=300e6?"SC":v>0?"\u03bcC":"\u2014"; };
              const capColor = mc => { const v=(mc||0)*1e9; return v>=200e9?"#64d2ff":v>=10e9?"#30d158":v>=2e9?"#ffd60a":v>=300e6?"#ff9f0a":v>0?"#ff453a":"#555"; };
              const cols = [{id:"ticker",l:"TICKER",align:"left"},{id:"name",l:"EMPRESA",align:"left"},{id:"cap",l:"TIPO",align:"center"},{id:"mc",l:"MKT CAP",align:"right"},{id:"value",l:"VALOR",align:"right"},{id:"weight",l:"PESO",align:"right"},{id:"pnl",l:"P&L",align:"right"}];
              const capSorted = [...(portfolioTotals.positions||[])].sort((a,b) => {
                const s = portSort.col; let va, vb;
                if (s==="ticker") { va=a.ticker; vb=b.ticker; } else if (s==="name") { va=a.name||a.ticker; vb=b.name||b.ticker; } else if (s==="cap"||s==="mc") { va=(a.mc||0); vb=(b.mc||0); } else if (s==="value") { va=(a.valueUSD||0); vb=(b.valueUSD||0); } else if (s==="weight") { va=(a.weight||0); vb=(b.weight||0); } else if (s==="pnl") { va=(a.pnlPct||0); vb=(b.pnlPct||0); } else { va=0; vb=0; }
                return portSort.asc ? (typeof va==="string"?va.localeCompare(vb):va-vb) : (typeof va==="string"?vb.localeCompare(va):vb-va);
              });
              const toggleSort = col => setPortSort(prev => ({col, asc: prev.col===col ? !prev.asc : false}));
              return (<div style={{overflowX:"auto",background:"var(--card)",border:"1px solid var(--border)",borderRadius:14}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr>{cols.map(c=>(<th key={c.id} onClick={()=>toggleSort(c.id)} style={{padding:"8px 10px",textAlign:c.align,color:portSort.col===c.id?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",cursor:"pointer",borderBottom:"2px solid #21262d",whiteSpace:"nowrap",userSelect:"none"}}>{c.l} {portSort.col===c.id?(portSort.asc?"\u25b2":"\u25bc"):""}</th>))}</tr></thead>
                  <tbody>{capSorted.map(p=>{const mc=p.mc||0;return(<tr key={p.ticker} style={{borderBottom:"1px solid #15191f",cursor:"pointer"}} onClick={()=>openAnalysis(p.ticker)} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"6px 10px",fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{p.ticker}</td>
                    <td style={{padding:"6px 10px",color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{p.name||p.ticker}</td>
                    <td style={{padding:"6px 10px",textAlign:"center"}}><span style={{fontSize:7,fontWeight:700,padding:"2px 5px",borderRadius:3,background:capColor(mc)+"15",color:capColor(mc)}}>{p.cat==="ETF"?"ETF":p.cat==="REIT"?"REIT":capLabel(mc)}</span></td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{fmtMC(mc)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:"var(--text-primary)",fontFamily:"var(--fm)"}}>${fDol(p.valueUSD||0)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{_sf((p.weight||0)*100,1)}%</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:(p.pnlPct||0)>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{(p.pnlPct||0)>=0?"+":""}{_sf((p.pnlPct||0)*100,1)}%</td>
                  </tr>);})}</tbody>
                </table>
              </div>);
            })()}
          </div>
        )}
        {/* Oracle verdict modal — opens when any "O" column cell is clicked.
            Reuses the BuyWizard component with initialTicker. When it closes,
            we force-reload oracleVerdicts so the column reflects the newly
            generated verdict (if the user ran one). */}
        <BuyWizard
          open={!!oracleWizardTicker}
          initialTicker={oracleWizardTicker}
          onClose={() => {
            setOracleWizardTicker(null);
            if (portfolioTickers.length) loadOracleVerdicts(portfolioTickers, true);
          }}
        />
      </div>
  );
}
