import { useState, useRef, useEffect, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters';
import { CURRENCIES, API_URL } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';

const PENDING_KEY = 'ayr-pending-gastos';

/* ── Category colors ── */
const CAT_COLORS = {
  "Supermercado":"#30d158",   // verde
  "Restaurante":"#ff9f0a",    // naranja
  "Transporte":"#64d2ff",     // azul claro
  "Ropa":"#bf5af2",           // morado
  "Deportes":"#ffd60a",       // amarillo
  "Alquiler":"#636366",       // gris oscuro
  "Casa":"#ac8e68",           // marrón
  "Utilities":"#48484a",      // gris medio
  "Utilities China":"#ef4444",// rojo china
  "Suscripciones":"#ff453a",  // rojo
  "Salud":"#ff375f",          // rosa fuerte
  "Masajes":"#ff6b9d",        // rosa claro
  "Bolsa":"#2563eb",          // azul europeo
  "Viajes":"#af52de",         // violeta
  "Caprichos":"#e5a00d",      // dorado
  "Regalos":"#ff6482",        // coral
  "Barco":"#0a84ff",          // azul
  "Ocio":"#5ac8fa",           // celeste
  "Hipoteca":"#8e8e93",       // gris
  "Educacion":"#0a84ff",      // azul
  "Otros":"#86868b",          // gris neutro
  // 3-letter fallbacks
  SUP:"#30d158", COM:"#ff9f0a", TRA:"#64d2ff", ROP:"#bf5af2",
  DEP:"#ffd60a", SUB:"#ff453a", HEA:"#ff375f", UCH:"#ac8e68", OTH:"#86868b",
};
const catColor = (cat) => CAT_COLORS[cat] || CAT_COLORS[(cat||"").slice(0,3)] || "#86868b";

/* ── Residence detection ── */
const RESIDENCE_COLORS = { Valencia: "#30d158", "Costa Brava": "#0a84ff", China: "#ef4444" };
const UTILITY_CATS = new Set(["UTI","UCH","Utilities","Utilities China"]);
const getResidence = (g) => {
  const detail = (g.detail || "").toLowerCase();
  const cat = g.cat || "";
  // China: tipo=china OR description contains {china}
  if (g.tipo === "china" || detail.includes("{china}")) return "China";
  // Costa Brava: description contains "costa brava" or "c.p. costa brava"
  if (detail.includes("costa brava") || detail.includes("c.p. costa brava")) return "Costa Brava";
  if (cat === "HOM" && detail.includes("costa brava")) return "Costa Brava";
  if (cat === "Casa" && detail.includes("costa brava")) return "Costa Brava";
  // Valencia: everything else (EUR expenses not tagged china / costa brava)
  return "Valencia";
};

/* ── Multi-segment Donut Chart ── */
const CategoryDonut = ({segments, size=150, strokeW=18}) => {
  // segments: [{label, value, color}]
  const total = segments.reduce((s,d) => s+d.value, 0);
  if(!total) return null;
  const r = (size-strokeW)/2;
  const circ = 2*Math.PI*r;
  let cumOffset = 0;
  return (
    <div style={{display:"flex",alignItems:"center",gap:16}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)",flexShrink:0}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a202c" strokeWidth={strokeW}/>
        {segments.map((seg,i) => {
          const pct = seg.value/total;
          const dash = circ*pct;
          const gap = circ-dash;
          const offset = cumOffset;
          cumOffset += dash;
          return <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={seg.color} strokeWidth={strokeW}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            style={{transition:"stroke-dasharray .6s ease, stroke-dashoffset .6s ease"}}/>;
        })}
      </svg>
      <div style={{display:"flex",flexDirection:"column",gap:3,minWidth:100}}>
        {segments.map((seg,i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:8,height:8,borderRadius:2,background:seg.color,flexShrink:0}}/>
            <span style={{fontSize:9,color:"var(--text-secondary)",fontFamily:"var(--fm)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{seg.label}</span>
            <span style={{fontSize:9,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{total > 0 ? Math.round(seg.value/total*100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── 12-month Trend Area Chart ── */
const TrendAreaChart = ({monthData, w=320, h=120, privacyMode=false}) => {
  // monthData: [{key:"2026-03", eur:1234}, ...] sorted ascending, up to 12
  if(monthData.length < 2) return null;
  const mNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const vals = monthData.map(d=>d.eur);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const rng = mx-mn || 1;
  const padT = 16, padB = 22, padL = 4, padR = 4;
  const cw = w-padL-padR, ch = h-padT-padB;
  const pts = vals.map((v,i) => {
    const x = padL + (i/(vals.length-1))*cw;
    const y = padT + ch - ((v-mn)/rng)*ch;
    return {x,y,v};
  });
  const line = pts.map(p=>`${p.x},${p.y}`).join(" ");
  const area = `${padL},${padT+ch} ${line} ${padL+cw},${padT+ch}`;
  const avg = vals.reduce((s,v)=>s+v,0)/vals.length;
  const avgY = padT + ch - ((avg-mn)/rng)*ch;
  return (
    <div>
      <svg width={w} height={h} style={{display:"block"}}>
        <defs>
          <linearGradient id="gastosAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity=".25"/>
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* grid lines */}
        {[0,.25,.5,.75,1].map(p => {
          const y = padT + ch*(1-p);
          return <line key={p} x1={padL} y1={y} x2={w-padR} y2={y} stroke="var(--subtle-border)" strokeWidth={.5}/>;
        })}
        {/* avg line */}
        <line x1={padL} y1={avgY} x2={w-padR} y2={avgY} stroke="var(--gold)" strokeWidth={.5} strokeDasharray="3 3" opacity={.4}/>
        <text x={w-padR-2} y={avgY-3} fill="var(--gold)" fontSize={7} fontFamily="var(--fm)" textAnchor="end" opacity={.6}>media</text>
        {/* area + line */}
        <polygon points={area} fill="url(#gastosAreaGrad)"/>
        <polyline points={line} fill="none" stroke="var(--gold)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
        {/* dots */}
        {pts.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--gold)" stroke="#1a202c" strokeWidth={1}/>)}
        {/* month labels */}
        {monthData.map((d,i) => {
          const x = padL + (i/(vals.length-1))*cw;
          const mi = parseInt(d.key.slice(5,7))-1;
          return <text key={i} x={x} y={h-4} fill="var(--text-tertiary)" fontSize={7} fontFamily="var(--fm)" textAnchor="middle">{mNames[mi]}</text>;
        })}
        {/* value on last point */}
        {pts.length > 0 && (() => {
          const last = pts[pts.length-1];
          return <text x={last.x} y={last.y-7} fill="var(--text-primary)" fontSize={8} fontWeight="600" fontFamily="var(--fm)" textAnchor="end">{privacyMode ? "•••" : `€${Math.round(last.v).toLocaleString()}`}</text>;
        })()}
      </svg>
    </div>
  );
};

export default function GastosTab() {
  const {
    gastosLog, gastosLoading, gastosShowForm, setGastosShowForm,
    gastosForm, setGastosForm, gastosFilter, setGastosFilter,
    gastosSort, setGastosSort, addGasto, deleteGasto,
    GASTO_CAT_LIST, fxRates, isOffline,
    privacyMode,
  } = useHome();
  const pm = (v) => privacyMode ? "•••" : v;

  const csvRef = useRef(null);
  const [csvToast, setCsvToast] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [presuItems, setPresuItems] = useState([]);
  const [linkingGasto, setLinkingGasto] = useState(null); // gasto id being linked

  // Fetch presupuesto items for linking
  useEffect(() => {
    fetch(`${API_URL}/api/presupuesto`).then(r=>r.json()).then(d => {
      if (Array.isArray(d)) setPresuItems(d);
    }).catch(() => setPresuItems([]));
  }, []);

  // Normalize: strip stopwords for fuzzy matching
  const STOP = new Set(['de','del','la','el','los','las','s.l','sl','s.a','sa','to','y','e','en']);
  const normalize = (s) => s.toLowerCase().trim().split(/[\s.,]+/).filter(w => w.length >= 2 && !STOP.has(w)).join(' ');

  // Check if a gasto matches any presupuesto item — ONLY by explicit aliases, respects exclusions
  const getLinkedPresu = useCallback((g) => {
    const detail = (g.detail || '').toLowerCase().trim();
    if (detail.length < 3) return null;
    for (const item of presuItems) {
      // Check if this gasto is excluded for this item
      let excluded = [];
      try { excluded = JSON.parse(item.excluded_gastos || '[]'); } catch(e) {}
      if (excluded.includes(g.id)) continue;
      let aliases = [];
      try { aliases = JSON.parse(item.aliases || '[]'); } catch(e) {}
      if (aliases.length === 0) continue;
      for (const al of aliases) {
        const a = al.toLowerCase().trim();
        if (a.length < 3) continue;
        if (detail.includes(a) || a.includes(detail)) return item;
        const nA = normalize(a), nD = normalize(detail);
        if (nA.length >= 5 && nD.length >= 5 && (nD.includes(nA) || nA.includes(nD))) return item;
      }
    }
    return null;
  }, [presuItems]);

  const linkGastoToPresu = useCallback(async (gastoDetail, presuId) => {
    const alias = gastoDetail.trim();
    if (!alias || alias.length < 3) return;
    try {
      const res = await fetch(`${API_URL}/api/presupuesto/${presuId}/alias`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ alias }),
      });
      const data = await res.json();
      if (data.aliases) {
        setPresuItems(prev => prev.map(it => it.id === presuId ? { ...it, aliases: JSON.stringify(data.aliases) } : it));
      }
    } catch(e) { console.error('Link error:', e); }
    setLinkingGasto(null);
  }, []);
  const [avgPeriod, setAvgPeriod] = useState(() => parseInt(localStorage.getItem("gastos_avgPeriod")) || 12);
  const [avgExcludeChina, setAvgExcludeChina] = useState(() => localStorage.getItem("gastos_avgExcludeChina") !== "false");
  const [monthOrder, setMonthOrder] = useState(() => localStorage.getItem("gastos_monthOrder") || "asc");
  const [monthLimit, setMonthLimit] = useState(() => parseInt(localStorage.getItem("gastos_monthLimit")) || 12);

  // Inline editing
  const [editingCell, setEditingCell] = useState(null); // {id, field, value}
  const saveInlineEdit = async (gasto, field, newValue) => {
    setEditingCell(null);
    if (newValue === undefined || newValue === null) return;
    const body = {};
    if (field === "cat") body.categoria = newValue;
    else if (field === "amount") { const n = parseFloat(newValue); if (isNaN(n)) return; body.importe = -Math.abs(n); }
    else if (field === "detail") body.descripcion = (gasto.tipo === "china" ? "{china} " : "") + newValue;
    else if (field === "date") body.fecha = newValue;
    if (!Object.keys(body).length) return;
    try {
      await fetch(`${API_URL}/api/gastos/${gasto.id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
      // Update local data
      if (field === "cat") gasto.cat = newValue;
      else if (field === "amount") gasto.amount = -Math.abs(parseFloat(newValue));
      else if (field === "detail") gasto.detail = newValue;
      else if (field === "date") gasto.date = newValue;
    } catch (e) { console.warn("Inline edit failed:", e); }
  };

  // Lugar tags — cycle through: null → china → null
  const LUGAR_TAGS = [null, "china"];
  const LUGAR_DISPLAY = { china: "🇨🇳 China" };
  const LUGAR_COLORS = { china: "#ef4444" };
  const [lugarOverrides, setLugarOverrides] = useState({});
  const getLugar = (g) => lugarOverrides[g.id] !== undefined ? lugarOverrides[g.id] : (g.lugarTag || (g.chinaOblig ? "china" : null));
  const cycleLugar = async (g) => {
    const current = getLugar(g);
    const idx = LUGAR_TAGS.indexOf(current);
    const next = LUGAR_TAGS[(idx + 1) % LUGAR_TAGS.length];
    setLugarOverrides(prev => ({ ...prev, [g.id]: next }));
    try {
      await fetch(`${API_URL}/api/gastos/${g.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lugar_tag: next, china_obligatorio: next === "china" ? 1 : 0 })
      });
    } catch (e) { console.warn("Failed to save lugar_tag:", e); }
  };

  // Fix 1: track the last-edited gasto so we can scroll to it after re-render
  const [scrollToMatch, setScrollToMatch] = useState(null);
  useEffect(() => {
    if (!scrollToMatch) return;
    // After gastosLog updates, find the gasto matching our saved properties and scroll to it
    const t = setTimeout(() => {
      const match = gastosLog.find(g =>
        g.date === scrollToMatch.date &&
        g.cat === scrollToMatch.cat &&
        Math.abs(Math.abs(g.amount||0) - scrollToMatch.amount) < 0.01
      );
      if (match) {
        const el = document.getElementById('gasto-' + match.id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setScrollToMatch(null);
    }, 300);
    return () => clearTimeout(t);
  }, [scrollToMatch, gastosLog]);

  // Fix 2: Offline pending changes queue
  const [pendingGastos, setPendingGastos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; }
  });

  const savePending = useCallback((list) => {
    setPendingGastos(list);
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch {}
  }, []);

  // Wrapped addGasto that queues when offline
  const addGastoSafe = useCallback(async (entry) => {
    if (isOffline) {
      const pending = [...pendingGastos, { ...entry, _pendingId: Date.now() }];
      savePending(pending);
      setGastosShowForm(false);
      return;
    }
    await addGasto(entry);
  }, [isOffline, pendingGastos, savePending, addGasto, setGastosShowForm]);

  // Auto-sync pending changes when coming back online
  useEffect(() => {
    if (isOffline || pendingGastos.length === 0) return;
    let cancelled = false;
    (async () => {
      const remaining = [];
      for (const entry of pendingGastos) {
        if (cancelled) break;
        try {
          await addGasto(entry);
        } catch {
          remaining.push(entry);
        }
      }
      if (!cancelled) savePending(remaining);
    })();
    return () => { cancelled = true; };
  }, [isOffline]); // intentionally only trigger on isOffline transition

  const handleCsvImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvLoading(true);
    try {
      const text = await file.text();
      const res = await fetch(`${API_URL}/api/gastos/import-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const data = await res.json();
      if (res.ok) {
        setCsvToast(`Importados: ${data.imported ?? 0} · Duplicados: ${data.duplicates ?? 0} · Omitidos: ${data.skipped ?? 0}`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setCsvToast(`Error: ${data.error || "Fallo en importación"}`);
      }
    } catch (err) {
      setCsvToast(`Error: ${err.message}`);
    } finally {
      setCsvLoading(false);
      if (csvRef.current) csvRef.current.value = "";
      setTimeout(() => setCsvToast(null), 6000);
    }
  };

  return (
<div style={{display:"flex",flexDirection:"column",gap:12}}>
  {/* Offline pending changes banner */}
  {pendingGastos.length > 0 && (
    <div style={{padding:"8px 14px",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.4)",borderRadius:8,fontSize:11,fontWeight:600,color:"#ef4444",fontFamily:"var(--fm)",display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:13}}>🔴</span>
      <span>{pendingGastos.length} cambio{pendingGastos.length!==1?"s":""} pendiente{pendingGastos.length!==1?"s":""} de sincronizar</span>
      {!isOffline && <span style={{marginLeft:"auto",fontSize:9,color:"var(--text-tertiary)"}}>(sincronizando...)</span>}
    </div>
  )}

  {/* CSV import toast */}
  {csvToast && (
    <div style={{padding:"8px 14px",background:"rgba(200,164,78,.12)",border:"1px solid var(--gold)",borderRadius:8,fontSize:11,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",display:"flex",alignItems:"center",gap:8}}>
      <span>📥</span><span>{csvToast}</span>
      <button onClick={()=>setCsvToast(null)} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--gold)",cursor:"pointer",fontSize:12,padding:0,lineHeight:1}}>✕</button>
    </div>
  )}
  {/* Summary + filters */}
  {(() => {
    // Helper: convert gasto amount to EUR
    const gToEur = (g) => {
      const ccy = (g.currency||"EUR").toUpperCase().trim();
      const raw = Math.abs(g.amount||0);
      if(ccy === "EUR" || !ccy) return raw;
      // Use live fxRates (rates are vs USD: EUR=0.92, CNY=7.25 etc)
      const rateFrom = fxRates[ccy]; // e.g. CNY=7.25 (how many CNY per USD)
      const rateEur = fxRates["EUR"]; // e.g. 0.92
      if(rateFrom && rateEur) return raw / rateFrom * rateEur; // CNY→USD→EUR
      // Hardcoded fallbacks
      if(ccy === "CNY") return raw * 0.127;
      if(ccy === "USD") return raw * 0.926;
      return raw;
    };
    const ccySym = (ccy) => ({EUR:"€",USD:"$",CNY:"¥"}[(ccy||"EUR").toUpperCase()] || "€");

    const filtered = gastosLog.filter(g => {
      if (gastosFilter.year !== "all" && !g.date?.startsWith(gastosFilter.year)) return false;
      if (gastosFilter.month !== "all" && !g.date?.startsWith(gastosFilter.month)) return false;
      if (gastosFilter.cat !== "all" && g.cat !== gastosFilter.cat) return false;
      if (gastosFilter.ccy && gastosFilter.ccy !== "all" && (g.currency||"EUR").toUpperCase() !== gastosFilter.ccy) return false;
      if (gastosFilter.tipo && gastosFilter.tipo !== "all") {
        const t = g.tipo || "normal";
        if (gastosFilter.tipo === "nochina" && t === "china") return false;
        else if (gastosFilter.tipo !== "nochina" && t !== gastosFilter.tipo) return false;
      }
      if (gastosFilter.residencia && gastosFilter.residencia !== "all" && getResidence(g) !== gastosFilter.residencia) return false;
      if (gastosFilter.search && !(g.detail||"").toLowerCase().includes(gastosFilter.search.toLowerCase()) && !(g.cat||"").toLowerCase().includes(gastosFilter.search.toLowerCase())) return false;
      if (g.secreto && !gastosFilter.showSecretos) return false;
      return true;
    });
    const expenses = filtered.filter(g=>g.amount<0);

    // === ALL expenses (unfiltered by year) for KPI, donut, monthly cards ===
    const allExpenses = gastosLog.filter(g => g.amount < 0);

    // MEDIA/MES KPI — calculate from last N months
    const allExpensesByMonth = {};
    allExpenses.forEach(g => {
      const m = g.date?.slice(0,7);
      if(!m) return;
      if(!allExpensesByMonth[m]) allExpensesByMonth[m] = {total:0, sinChina:0};
      const eur = gToEur(g);
      allExpensesByMonth[m].total += eur;
      if(getLugar(g) !== "china") allExpensesByMonth[m].sinChina += eur;
    });
    const allMonthsSorted = Object.keys(allExpensesByMonth).sort().reverse();
    const recentMonths = allMonthsSorted.slice(0, avgPeriod);
    const recentMonthSet = new Set(recentMonths);
    const recentTotal = recentMonths.reduce((s,m) => s + (avgExcludeChina ? allExpensesByMonth[m].sinChina : allExpensesByMonth[m].total), 0);
    const recentAvg = recentMonths.length > 0 ? recentTotal / recentMonths.length : 0;

    // Recent expenses (last N months, unfiltered) for donut + categories
    const recentExpenses = allExpenses.filter(g => recentMonthSet.has(g.date?.slice(0,7)));

    // By category (in EUR) — uses recent period, independent of year filter
    const byCat = {};
    recentExpenses.forEach(g => { byCat[g.cat] = (byCat[g.cat]||0) + gToEur(g); });
    const topCats = Object.entries(byCat).sort((a,b) => b[1]-a[1]).slice(0,10);
    const maxCat = topCats.length > 0 ? Math.max(...topCats.map(([,v])=>v), 1) : 1;

    // Donut segments: top 8 + Otros
    const donutTop = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
    const donutSegments = donutTop.slice(0,8).map(([cat,val]) => ({label:cat, value:val, color:catColor(cat)}));
    const otrosVal = donutTop.slice(8).reduce((s,[,v]) => s+v, 0);
    if(otrosVal > 0) donutSegments.push({label:"Otros", value:otrosVal, color:"#86868b"});

    // By month (in EUR) — uses ALL expenses, independent of year filter
    const byMonth = {};
    allExpenses.forEach(g => {
      const m = g.date?.slice(0,7);
      if(!m) return;
      if(!byMonth[m]) byMonth[m] = {eur:0,cny:0,usd:0,eurNat:0,sinElim:0};
      const eurAmt = gToEur(g);
      const ccy = (g.currency||"EUR").toUpperCase().trim()||"EUR";
      const tag = getLugar(g);
      byMonth[m].eur += eurAmt;
      if(ccy==="CNY") byMonth[m].cny += eurAmt;
      else if(ccy==="USD") byMonth[m].usd += eurAmt;
      else byMonth[m].eurNat += eurAmt;
      if(tag !== "china") byMonth[m].sinElim += eurAmt;
    });
    const monthKeys = Object.keys(byMonth).sort().reverse();
    const trendData = Object.entries(byMonth).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12).map(([key,d])=>({key,eur:d.eur}));

    return <>
      {/* KPI cards */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span style={{fontSize:9,color:"var(--gold)",fontFamily:"var(--fm)",fontWeight:600}}>MEDIA/MES</span>
              {[6,12,24].map(n=><button key={n} onClick={()=>{setAvgPeriod(n);localStorage.setItem("gastos_avgPeriod",n);}} style={{padding:"1px 5px",borderRadius:4,border:`1px solid ${avgPeriod===n?"var(--gold)":"var(--border)"}`,background:avgPeriod===n?"var(--gold-dim)":"transparent",color:avgPeriod===n?"var(--gold)":"var(--text-tertiary)",fontSize:8,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:avgPeriod===n?700:400}}>{n}m</button>)}
              <button onClick={()=>{const v=!avgExcludeChina;setAvgExcludeChina(v);localStorage.setItem("gastos_avgExcludeChina",v);}} style={{padding:"1px 5px",borderRadius:4,border:`1px solid ${avgExcludeChina?"#ef4444":"var(--border)"}`,background:avgExcludeChina?"rgba(239,68,68,.08)":"transparent",color:avgExcludeChina?"#ef4444":"var(--text-tertiary)",fontSize:8,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:avgExcludeChina?700:400}}>{avgExcludeChina?"🇨🇳 sin China":"🇨🇳 con China"}</button>
            </div>
            <div style={{fontSize:22,fontWeight:800,color:"var(--gold)",fontFamily:"var(--fm)"}}>{pm(`€${recentAvg.toLocaleString(undefined,{maximumFractionDigits:0})}`)}</div>
            <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{pm(`€${(recentAvg*12).toLocaleString(undefined,{maximumFractionDigits:0})}/año`)} · últimos {recentMonths.length} meses</div>
          </div>
          <div onTouchStart={()=>{window._secTimer=setTimeout(()=>{setGastosFilter(p=>({...p,showSecretos:!p.showSecretos}));if(navigator.vibrate)navigator.vibrate(30);window._secTimer='fired';},1000);}} onTouchEnd={()=>{if(window._secTimer!=='fired')clearTimeout(window._secTimer);window._secTimer=null;}} onTouchMove={()=>{clearTimeout(window._secTimer);window._secTimer=null;}} onMouseDown={()=>{window._secTimer=setTimeout(()=>{setGastosFilter(p=>({...p,showSecretos:!p.showSecretos}));window._secTimer='fired';},1000);}} onMouseUp={()=>{if(window._secTimer!=='fired')clearTimeout(window._secTimer);window._secTimer=null;}} style={{cursor:"default",userSelect:"none",WebkitUserSelect:"none"}}><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>REGISTROS</div><div style={{fontSize:20,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{filtered.length}</div></div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <select value={gastosFilter.year} onChange={e=>setGastosFilter(p=>({...p,year:e.target.value,month:"all"}))} style={{padding:"5px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
            <option value="all">Todos años</option>
            {[...new Set(gastosLog.map(g=>g.date?.slice(0,4)).filter(Boolean))].sort().reverse().map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          {gastosFilter.year !== "all" && <select value={gastosFilter.month} onChange={e=>setGastosFilter(p=>({...p,month:e.target.value}))} style={{padding:"5px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
            <option value="all">Todos meses</option>
            {[...new Set(gastosLog.filter(g=>g.date?.startsWith(gastosFilter.year)).map(g=>g.date?.slice(0,7)).filter(Boolean))].sort().reverse().map(m=>{const mn=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][parseInt(m.slice(5,7))-1]; return <option key={m} value={m}>{mn} {m.slice(0,4)}</option>;})}
          </select>}
          <select value={gastosFilter.cat} onChange={e=>setGastosFilter(p=>({...p,cat:e.target.value}))} style={{padding:"5px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
            <option value="all">Todas categorías</option>
            {GASTO_CAT_LIST.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select value={gastosFilter.ccy||"all"} onChange={e=>setGastosFilter(p=>({...p,ccy:e.target.value}))} style={{padding:"5px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
            <option value="all">Todas divisas</option>
            <option value="EUR">🇪🇺 EUR</option><option value="USD">🇺🇸 USD</option><option value="CNY">🇨🇳 CNY</option><option value="GBP">🇬🇧 GBP</option>
          </select>
          <select value={gastosFilter.tipo||"all"} onChange={e=>setGastosFilter(p=>({...p,tipo:e.target.value}))} style={{padding:"5px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
            <option value="all">Todos tipos</option>
            <option value="normal">Normal</option>
            <option value="china">🇨🇳 China</option>
            <option value="extra">⚡ Extraordinario</option>
            <option value="nochina">Sin China</option>
          </select>
          <select value={gastosFilter.residencia||"all"} onChange={e=>setGastosFilter(p=>({...p,residencia:e.target.value}))} style={{padding:"5px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
            <option value="all">Todas residencias</option>
            <option value="Valencia">🏠 Valencia</option>
            <option value="Costa Brava">🏖️ Costa Brava</option>
            <option value="China">🇨🇳 China</option>
          </select>
          <input type="text" placeholder="Buscar concepto..." value={gastosFilter.search||""} onChange={e=>setGastosFilter(p=>({...p,search:e.target.value}))} style={{padding:"5px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",width:130}}/>
          <button onClick={()=>{setGastosForm(p=>({...p,isIngreso:false}));setGastosShowForm(!gastosShowForm);}} style={{padding:"7px 14px",borderRadius:7,border:"1px solid var(--gold)",background:gastosShowForm&&!gastosForm.isIngreso?"var(--gold)":"var(--gold-dim)",color:gastosShowForm&&!gastosForm.isIngreso?"#000":"var(--gold)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
            {gastosShowForm&&!gastosForm.isIngreso?"✕":"+ Gasto"}
          </button>
          <button onClick={()=>{setGastosForm(p=>({...p,isIngreso:true}));setGastosShowForm(!gastosShowForm||!gastosForm.isIngreso);}} style={{padding:"7px 14px",borderRadius:7,border:"1px solid var(--green)",background:gastosShowForm&&gastosForm.isIngreso?"var(--green)":"rgba(52,211,153,.1)",color:gastosShowForm&&gastosForm.isIngreso?"#000":"var(--green)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
            {gastosShowForm&&gastosForm.isIngreso?"✕":"+ Ingreso"}
          </button>
          <input ref={csvRef} type="file" accept=".csv" onChange={handleCsvImport} style={{display:"none"}}/>
          <button onClick={()=>csvRef.current?.click()} disabled={csvLoading} style={{padding:"7px 14px",borderRadius:7,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:11,fontWeight:600,cursor:csvLoading?"wait":"pointer",fontFamily:"var(--fm)",opacity:csvLoading?.5:1}}>
            {csvLoading?"Importando...":"📥 Importar CSV"}
          </button>
        </div>
      </div>



      {/* Visual charts row: Donut + Trend */}
      {expenses.length > 0 && (
        <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
          {/* Category donut */}
          {donutSegments.length > 0 && (
            <div style={{padding:"14px 16px",background:"var(--row-alt)",borderRadius:12,border:"1px solid var(--subtle-border)",flex:"0 0 auto"}}>
              <div style={{fontSize:9,fontWeight:600,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:10}}>GASTO POR CATEGORIA</div>
              <CategoryDonut segments={donutSegments} size={140} strokeW={16}/>
            </div>
          )}
          {/* 12-month trend */}
          {trendData.length >= 2 && (
            <div style={{padding:"14px 16px",background:"var(--row-alt)",borderRadius:12,border:"1px solid var(--subtle-border)",flex:"1 1 320px",minWidth:280}}>
              <div style={{fontSize:9,fontWeight:600,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:10}}>TENDENCIA MENSUAL</div>
              <TrendAreaChart monthData={trendData} w={320} h={120} privacyMode={privacyMode}/>
            </div>
          )}
        </div>
      )}


      {/* Monthly breakdown with stacked bars */}
      {monthKeys.length > 1 && (() => {
        const mNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        // monthOrder and monthLimit are declared at component level
        // asc = cronológico (May→Jun→...→Mar→Abr), desc = reciente primero (Abr→Mar→...→Jun→May)
        // monthKeys is already sorted desc (newest first)
        // For asc: take last N from monthKeys (most recent N), then reverse to chronological
        const lastN = monthKeys.slice(0, monthLimit);
        const visible = monthOrder === "asc" ? [...lastN].reverse() : lastN;
        const maxMonthEur = Math.max(...visible.map(m => byMonth[m]?.eur || 0), 1);
        return <div>
          {/* Controls */}
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
            <button onClick={()=>setMonthOrder(o=>{const v=o==="desc"?"asc":"desc";localStorage.setItem("gastos_monthOrder",v);return v;})} style={{padding:"3px 8px",borderRadius:5,border:"1px solid var(--gold)",background:monthOrder==="asc"?"var(--gold-dim)":"transparent",color:monthOrder==="asc"?"var(--gold)":"var(--text-tertiary)",fontSize:9,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:600}}>{monthOrder==="asc"?"Ene → Abr (cronológico)":"Abr → Ene (reciente)"}</button>
            {[6,12,24,999].map(n=><button key={n} onClick={()=>{setMonthLimit(n);localStorage.setItem("gastos_monthLimit",n);}} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${monthLimit===n?"var(--gold)":"var(--border)"}`,background:monthLimit===n?"var(--gold-dim)":"transparent",color:monthLimit===n?"var(--gold)":"var(--text-tertiary)",fontSize:9,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:monthLimit===n?700:400}}>{n>=999?"Todos":`${n}m`}</button>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:6}}>
          {visible.map(m => {
            const d = byMonth[m];
            const mi = parseInt(m.slice(5,7))-1;
            const yr = m.slice(0,4);
            const pctTotal = maxMonthEur > 0 ? (d.eur||0)/maxMonthEur*100 : 0;
            const dEur = d.eur > 0 ? d.eur : 1;
            const pctEur = d.eurNat/dEur*100;
            const pctCny = d.cny/dEur*100;
            const pctUsd = d.usd/dEur*100;
            const hasElim = d.sinElim < d.eur - 1;
            return (
              <div key={m} style={{padding:"8px 10px",background:"var(--row-alt)",borderRadius:8,border:"1px solid var(--subtle-border)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                  <span style={{fontSize:10,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{mNames[mi]} {yr}</span>
                  <span style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{pm(`€${(d.eur||0).toLocaleString(undefined,{maximumFractionDigits:0})}`)}</span>
                </div>
                {hasElim && <div style={{display:"flex",justifyContent:"flex-end",marginBottom:3}}>
                  <span style={{fontSize:9,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)"}} title="Sin gastos eliminables (China)">🎯 {pm(`€${(d.sinElim||0).toLocaleString(undefined,{maximumFractionDigits:0})}`)}</span>
                </div>}
                {/* stacked bar */}
                <div style={{height:6,background:"var(--subtle-border)",borderRadius:3,overflow:"hidden",display:"flex",marginBottom:4}} title={privacyMode?"•••":`EUR: €${Math.round(d.eurNat)} | CNY: €${Math.round(d.cny)} | USD: €${Math.round(d.usd)}`}>
                  {d.eurNat > 0 && <div style={{width:`${pctEur}%`,height:"100%",background:"#2563eb",opacity:.7,transition:"width .4s ease"}}/>}
                  {d.cny > 0 && <div style={{width:`${pctCny}%`,height:"100%",background:"#ff453a",opacity:.7,transition:"width .4s ease"}}/>}
                  {d.usd > 0 && <div style={{width:`${pctUsd}%`,height:"100%",background:"#30d158",opacity:.7,transition:"width .4s ease"}}/>}
                </div>
                {/* overall bar vs max month */}
                <div style={{height:3,background:"var(--subtle-bg)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${pctTotal}%`,height:"100%",background:"var(--gold)",opacity:.3,borderRadius:2,transition:"width .4s ease"}}/>
                </div>
                {(d.cny > 0 || d.usd > 0) && !privacyMode && <div style={{display:"flex",gap:3,marginTop:4,flexWrap:"wrap"}}>
                  {d.eurNat > 0 && <span style={{fontSize:7,padding:"1px 4px",borderRadius:3,background:"rgba(37,99,235,.08)",color:"#2563eb",fontFamily:"var(--fm)"}}>EUR €{(d.eurNat||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
                  {d.cny > 0 && <span style={{fontSize:7,padding:"1px 4px",borderRadius:3,background:"rgba(255,69,58,.08)",color:"#ff453a",fontFamily:"var(--fm)"}}>CNY €{(d.cny||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
                  {d.usd > 0 && <span style={{fontSize:7,padding:"1px 4px",borderRadius:3,background:"rgba(48,209,88,.08)",color:"#30d158",fontFamily:"var(--fm)"}}>USD €{(d.usd||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
                </div>}
              </div>
            );
          })}
          </div>
        </div>;
      })()}

      {/* Category breakdown mini-bars with colored indicators */}
      {topCats.length > 0 && <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {topCats.map(([cat,val]) => (
          <div key={cat} style={{flex:"1 1 220px",display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"var(--row-alt)",borderRadius:6}}>
            <div style={{width:4,height:20,borderRadius:2,background:catColor(cat),flexShrink:0,opacity:.7}}/>
            <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",width:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat}</span>
            <div style={{flex:1,height:6,background:"var(--subtle-border)",borderRadius:3,overflow:"hidden"}}>
              <div style={{width:`${val/maxCat*100}%`,height:"100%",background:catColor(cat),borderRadius:3,opacity:.5,transition:"width .4s ease"}}/>
            </div>
            <span style={{fontSize:9,color:"var(--text-secondary)",fontFamily:"var(--fm)",width:60,textAlign:"right"}}>{pm(`€${val.toLocaleString(undefined,{maximumFractionDigits:0})}`)}</span>
            <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",width:30,textAlign:"right"}}>{(() => {const t=topCats.reduce((s,[,v])=>s+v,0); return t?Math.round(val/t*100):0;})()}%</span>
          </div>
        ))}
      </div>}

      {/* ── Gastos Año × Mes heatmap ── */}
      {allExpenses.length > 0 && (() => {
        const hmGrid = {};
        allExpenses.forEach(g => {
          const y = g.date?.slice(0,4);
          const m = g.date?.slice(5,7);
          if (!y || !m) return;
          if (!hmGrid[y]) hmGrid[y] = {};
          if (!hmGrid[y][m]) hmGrid[y][m] = 0;
          hmGrid[y][m] += gToEur(g);
        });
        const hmYears = Object.keys(hmGrid).sort().reverse();
        const allHmVals = hmYears.flatMap(y => Object.values(hmGrid[y]));
        const hmMax = Math.max(...allHmVals, 1);
        const hmTotals = {};
        hmYears.forEach(y => { hmTotals[y] = Object.values(hmGrid[y]).reduce((s,v)=>s+v,0); });
        const hmMNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        const hmMonths = ["01","02","03","04","05","06","07","08","09","10","11","12"];
        const thS = {padding:"4px 5px",fontSize:9,fontWeight:600,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center",borderBottom:"1px solid var(--border)"};
        return (
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:8}}>Gastos Año × Mes</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
                <thead><tr>
                  <th style={{...thS,textAlign:"left",width:40}}>AÑO</th>
                  {hmMNames.map(mn => <th key={mn} style={thS}>{mn}</th>)}
                  <th style={{...thS,borderLeft:"2px solid var(--border)",width:70}}>TOTAL</th>
                </tr></thead>
                <tbody>
                  {hmYears.map((y, yi) => {
                    const prevY = hmYears[yi+1];
                    const yoyPct = prevY && hmTotals[prevY] > 0 ? ((hmTotals[y] - hmTotals[prevY]) / hmTotals[prevY] * 100) : null;
                    return (
                      <tr key={y}>
                        <td style={{padding:"3px 5px",fontSize:11,fontWeight:700,color:yi===0?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{y}</td>
                        {hmMonths.map(m => {
                          const v = hmGrid[y]?.[m] || 0;
                          if (!v) return <td key={m} style={{padding:"2px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)"}}><span style={{fontSize:8,color:"var(--text-tertiary)",opacity:.2}}>—</span></td>;
                          const intensity = Math.min(v / hmMax, 1);
                          const bg = `rgba(200,164,78,${0.08 + intensity * 0.5})`;
                          const isSelected = gastosFilter.month === `${y}-${m}`;
                          return (
                            <td key={m} style={{padding:"2px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)"}}>
                              <div
                                title={privacyMode?"•••":`${y}-${m}: €${Math.round(v).toLocaleString()} — click para ver detalle`}
                                onClick={() => { setGastosFilter(p => ({...p, year:y, month:`${y}-${m}`})); setTimeout(() => document.getElementById("gastos-detail-table")?.scrollIntoView({behavior:"smooth",block:"start"}), 100); }}
                                style={{borderRadius:4,background:isSelected?"var(--gold)":bg,padding:"4px 1px",fontSize:9,fontWeight:700,color:isSelected?"#000":intensity>.5?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)",cursor:"pointer",transition:"all .15s",boxShadow:isSelected?"0 0 8px rgba(200,164,78,.5)":"none"}}
                              >
                                {privacyMode?"•":v>=1000?`${_sf(v/1000,1)}K`:_sf(v,0)}
                              </div>
                            </td>
                          );
                        })}
                        <td style={{padding:"2px 4px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)",borderLeft:"2px solid var(--border)"}}>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                            <span
                              onClick={() => { setGastosFilter(p => ({...p, year:y, month:"all"})); setTimeout(() => document.getElementById("gastos-detail-table")?.scrollIntoView({behavior:"smooth",block:"start"}), 100); }}
                              style={{fontSize:11,fontWeight:800,color:gastosFilter.year===y&&gastosFilter.month==="all"?"#000":yi===0?"var(--gold)":"var(--text-primary)",fontFamily:"var(--fm)",cursor:"pointer",background:gastosFilter.year===y&&gastosFilter.month==="all"?"var(--gold)":"transparent",padding:"1px 4px",borderRadius:3}}
                            >{privacyMode?"•••":`€${hmTotals[y]>=1000?`${_sf(hmTotals[y]/1000,1)}K`:_sf(hmTotals[y],0)}`}</span>
                            {yoyPct!=null && <span style={{fontSize:8,fontWeight:600,color:yoyPct>=0?"var(--red)":"var(--green)",fontFamily:"var(--fm)"}}>{yoyPct>=0?"+":""}{_sf(yoyPct,0)}%</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </>;
  })()}

  {/* Add form */}
  {gastosShowForm && (
    <div style={{padding:14,background:"var(--card)",border:`1px solid ${gastosForm.isIngreso?"rgba(52,211,153,.3)":"var(--gold-dim)"}`,borderRadius:12}}>
      <div style={{fontSize:10,fontWeight:700,color:gastosForm.isIngreso?"var(--green)":"var(--gold)",fontFamily:"var(--fm)",marginBottom:8,letterSpacing:1}}>{gastosForm.isIngreso?"NUEVO INGRESO":"NUEVO GASTO"}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"flex-end"}}>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>FECHA</label>
          <input type="date" value={gastosForm.date} onChange={e=>setGastosForm(p=>({...p,date:e.target.value}))} style={{padding:"6px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>CATEGORÍA</label>
          <select value={gastosForm.cat} onChange={e=>setGastosForm(p=>({...p,cat:e.target.value}))} style={{padding:"6px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
            {GASTO_CAT_LIST.map(c=><option key={c} value={c}>{c}</option>)}
          </select></div>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>IMPORTE</label>
          <input type="number" step="0.01" value={gastosForm.amount||""} onChange={e=>setGastosForm(p=>({...p,amount:parseFloat(e.target.value)||0}))} placeholder="25.50" style={{width:80,padding:"6px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>DIVISA</label>
          <select value={gastosForm.currency} onChange={e=>setGastosForm(p=>({...p,currency:e.target.value}))} style={{padding:"6px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
            <option value="EUR">EUR €</option><option value="USD">USD $</option><option value="CNY">CNY ¥</option>
          </select></div>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>CONCEPTO</label>
          <input type="text" value={gastosForm.detail} onChange={e=>setGastosForm(p=>({...p,detail:e.target.value}))} placeholder="Cena con amigos..." style={{width:160,padding:"6px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>TIPO</label>
          <div style={{display:"flex",gap:4}}>
            {[{v:"normal",l:"Normal"},{v:"china",l:"🇨🇳 China"},{v:"extra",l:"⚡ Extra"}].map(t=>(
              <button key={t.v} type="button" onClick={()=>setGastosForm(p=>({...p,tipo:t.v}))} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${gastosForm.tipo===t.v?"var(--gold)":"var(--border)"}`,background:gastosForm.tipo===t.v?"var(--gold-dim)":"transparent",color:gastosForm.tipo===t.v?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{t.l}</button>
            ))}
          </div></div>
        <label style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",cursor:"pointer"}}>
          <input type="checkbox" checked={gastosForm.recur} onChange={e=>setGastosForm(p=>({...p,recur:e.target.checked}))}/>Recurrente
        </label>
        <button onTouchStart={(e)=>{e.preventDefault();window._saveSTimer=setTimeout(()=>{setGastosForm(p=>({...p,secreto:!p.secreto}));if(navigator.vibrate)navigator.vibrate(30);window._saveSTimer='fired';},1000);}} onTouchEnd={(e)=>{clearTimeout(window._saveSTimer);if(window._saveSTimer==='fired'){e.preventDefault();window._saveSTimer=null;return;}window._saveSTimer=null;}} onTouchMove={()=>{clearTimeout(window._saveSTimer);window._saveSTimer=null;}} onMouseDown={()=>{window._saveSTimer=setTimeout(()=>{setGastosForm(p=>({...p,secreto:!p.secreto}));window._saveSTimer='fired';},1000);}} onMouseUp={()=>{clearTimeout(window._saveSTimer);window._saveSTimer=null;}} onClick={async(e)=>{if(window._saveSTimer==='fired'){e.preventDefault();return;}if(gastosForm.date&&gastosForm.amount!==0){const wasEdit=gastosForm._isEdit;const matchInfo=wasEdit?{date:gastosForm.date,cat:gastosForm.cat,amount:Math.abs(gastosForm.amount)}:null;await addGastoSafe(gastosForm);setGastosForm(p=>({...p,amount:0,detail:"",tipo:"normal",secreto:false,isIngreso:false,_isEdit:false}));if(matchInfo)setScrollToMatch(matchInfo);}}} style={{padding:"6px 16px",borderRadius:6,border:"none",background:gastosForm.secreto?(gastosForm.isIngreso?"#4f46e5":"#6366f1"):(gastosForm.isIngreso?"var(--green)":"var(--gold)"),color:"#000",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)",height:30,userSelect:"none",WebkitUserSelect:"none",WebkitTouchCallout:"none",transition:"background .2s"}}>{gastosForm.isIngreso?"Guardar Ingreso":"Guardar Gasto"}</button>
      </div>
    </div>
  )}

  {/* Gastos table (multi-currency aware) */}
  <div id="gastos-detail-table" style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
    {gastosLoading ? (
      <InlineLoading message="Cargando gastos..." />
    ) : gastosLog.length === 0 ? (
      <EmptyState icon="🧾" title="Sin gastos registrados" subtitle="Empieza a registrar tus gastos o importa un CSV con tu historial." action="Registrar gasto" onAction={() => setGastosShowForm(true)} />
    ) : (
      <div style={{overflowX:"auto"}}>
        {(() => {
          const _gToEur = (g) => {
            const ccy = (g.currency||"EUR").toUpperCase().trim();
            const raw = Math.abs(g.amount||0);
            if(ccy === "EUR" || !ccy) return raw;
            const rateFrom = fxRates[ccy]; const rateEur = fxRates["EUR"];
            if(rateFrom && rateEur) return raw / rateFrom * rateEur;
            if(ccy === "CNY") return raw * 0.127;
            if(ccy === "USD") return raw * 0.926;
            return raw;
          };
          const _ccySym = (ccy) => ({EUR:"€",USD:"$",CNY:"¥",GBP:"£"}[(ccy||"EUR").toUpperCase()] || "€");
          const _ccyFlag = (ccy) => ({EUR:"🇪🇺",USD:"🇺🇸",CNY:"🇨🇳",GBP:"🇬🇧"}[(ccy||"EUR").toUpperCase()] || "");
          const filteredRows = gastosLog.filter(g => {
            if (gastosFilter.year !== "all" && !g.date?.startsWith(gastosFilter.year)) return false;
            if (gastosFilter.month !== "all" && !g.date?.startsWith(gastosFilter.month)) return false;
            if (gastosFilter.cat !== "all" && g.cat !== gastosFilter.cat) return false;
            if (gastosFilter.ccy && gastosFilter.ccy !== "all" && (g.currency||"EUR").toUpperCase() !== gastosFilter.ccy) return false;
            if (gastosFilter.tipo && gastosFilter.tipo !== "all") {
              const t = g.tipo || "normal";
              if (gastosFilter.tipo === "nochina" && t === "china") return false;
              else if (gastosFilter.tipo !== "nochina" && t !== gastosFilter.tipo) return false;
            }
            if (gastosFilter.residencia && gastosFilter.residencia !== "all" && getResidence(g) !== gastosFilter.residencia) return false;
            if (gastosFilter.search && !(g.detail||"").toLowerCase().includes(gastosFilter.search.toLowerCase()) && !(g.cat||"").toLowerCase().includes(gastosFilter.search.toLowerCase())) return false;
            return true;
          });
          const sortedRows = [...filteredRows].sort((a,b) => {
            const col = gastosSort.col;
            let va, vb;
            if (col === "date") { va = a.date||""; vb = b.date||""; }
            else if (col === "cat") { va = a.cat||""; vb = b.cat||""; }
            else if (col === "amount") { va = Math.abs(a.amount||0); vb = Math.abs(b.amount||0); }
            else if (col === "eur") { va = _gToEur(a); vb = _gToEur(b); }
            else if (col === "detail") { va = a.detail||""; vb = b.detail||""; }
            else { va = a.date||""; vb = b.date||""; }
            if (typeof va === "string") return gastosSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
            return gastosSort.asc ? va - vb : vb - va;
          }).slice(0,500);
          const gSortBy = (col) => setGastosSort(p => p.col === col ? {col, asc: !p.asc} : {col, asc: col==="amount"||col==="eur"?false:true});
          const gSortArr = (col) => gastosSort.col === col ? (gastosSort.asc ? " ▲" : " ▼") : "";
          const thStyle = (col,align) => ({padding:"7px 10px",textAlign:align||"left",color:gastosSort.col===col?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"1px solid var(--border)",cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"});
          const filtTotal = filteredRows.reduce((s,g) => s + _gToEur(g), 0);
          return <>
            <div style={{padding:"6px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{filteredRows.length} gastos</span>
              <span style={{fontSize:11,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>Total: {pm(`€${filtTotal.toLocaleString(undefined,{maximumFractionDigits:0})}`)}</span>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:750}}>
            <thead><tr>
              <th onClick={()=>gSortBy("date")} style={thStyle("date")}>FECHA{gSortArr("date")}</th>
              <th onClick={()=>gSortBy("cat")} style={thStyle("cat")}>CATEGORÍA{gSortArr("cat")}</th>
              <th style={{padding:"7px 6px",borderBottom:"1px solid var(--border)",fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.3,width:70,textAlign:"center"}}>LUGAR</th>
              <th onClick={()=>gSortBy("amount")} style={thStyle("amount","right")}>IMPORTE{gSortArr("amount")}</th>
              <th style={{padding:"7px 4px",borderBottom:"1px solid var(--border)",width:30}}></th>
              <th onClick={()=>gSortBy("eur")} style={thStyle("eur","right")}>≈ EUR{gSortArr("eur")}</th>
              <th onClick={()=>gSortBy("detail")} style={thStyle("detail")}>CONCEPTO{gSortArr("detail")}</th>
              <th style={{padding:"7px 6px",borderBottom:"1px solid var(--border)",fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.3,width:50,textAlign:"center"}}>PRESU</th>
              <th style={{padding:"7px 4px",borderBottom:"1px solid var(--border)",width:60}}></th>
            </tr></thead>
            <tbody>
              {sortedRows.map((g,i) => {
                const ccy = (g.currency||"EUR").toUpperCase().trim()||"EUR";
                const isNonEur = ccy !== "EUR";
                const eurVal = _gToEur(g);
                return (
                  <tr key={g.id||i} id={g.id ? `gasto-${g.id}` : undefined} style={{background:i%2?"var(--row-alt)":"transparent",opacity:g.secreto?.5:1}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"var(--row-alt)":"transparent"}>
                    <td style={{padding:"5px 10px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid var(--subtle-bg)"}}>{g.date}</td>
                    <td style={{padding:"3px 6px",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid var(--subtle-bg)",maxWidth:160,cursor:"pointer"}} onClick={()=>setEditingCell({id:g.id,field:"cat",value:g.catCode||g.cat})}>{editingCell?.id===g.id&&editingCell?.field==="cat"?<select autoFocus value={editingCell.value} onChange={e=>{saveInlineEdit(g,"cat",e.target.value);}} onBlur={()=>setEditingCell(null)} style={{padding:"2px 4px",background:"var(--surface)",border:"1px solid var(--gold)",borderRadius:4,color:"var(--text-primary)",fontSize:10,fontFamily:"var(--fm)",outline:"none",width:"100%"}}>{GASTO_CAT_LIST.map(c=><option key={c} value={c}>{c}</option>)}</select>:<>{g.cat}{g.secreto?<span style={{fontSize:7,marginLeft:4,padding:"1px 4px",borderRadius:3,background:"rgba(99,102,241,.08)",color:"#6366f1",verticalAlign:"middle"}}>🔒</span>:""}{g.recur?<span style={{fontSize:7,marginLeft:3,padding:"1px 4px",borderRadius:3,background:"rgba(255,159,10,.08)",color:"var(--orange)",verticalAlign:"middle"}}>REC</span>:""}</>}</td>
                    <td style={{padding:"3px 4px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)",whiteSpace:"nowrap"}}>{(()=>{const tag=getLugar(g);const color=LUGAR_COLORS[tag]||"var(--text-tertiary)";return <button onClick={()=>cycleLugar(g)} title="Click para cambiar: — → China → Barco → Casa → —" style={{fontSize:8,padding:"4px 8px",borderRadius:5,border:`1px solid ${tag?color+"80":"var(--border)"}`,background:tag?color+"18":"transparent",color:tag?color:"var(--text-tertiary)",cursor:"pointer",fontWeight:tag?700:400,fontFamily:"var(--fm)",transition:"all .25s ease",minWidth:55}}>{tag?LUGAR_DISPLAY[tag]:"—"}</button>})()}</td>
                    <td style={{padding:"3px 6px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:g.amount>0?"var(--green)":"var(--text-primary)",borderBottom:"1px solid var(--subtle-bg)",cursor:"pointer"}} onClick={()=>!privacyMode&&setEditingCell({id:g.id,field:"amount",value:Math.abs(g.amount||0)})}>{privacyMode?"•••":editingCell?.id===g.id&&editingCell?.field==="amount"?<input autoFocus type="number" step="0.01" value={editingCell.value} onChange={e=>setEditingCell(p=>({...p,value:e.target.value}))} onBlur={()=>saveInlineEdit(g,"amount",editingCell.value)} onKeyDown={e=>{if(e.key==="Enter")saveInlineEdit(g,"amount",editingCell.value);if(e.key==="Escape")setEditingCell(null);}} style={{padding:"2px 4px",background:"var(--surface)",border:"1px solid var(--gold)",borderRadius:4,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",outline:"none",width:80,textAlign:"right"}}/>:<>{_ccyFlag(ccy)} {g.amount>0?"+":""}{_ccySym(ccy)}{Math.abs(g.amount||0).toLocaleString(undefined,{minimumFractionDigits:ccy==="CNY"?0:2,maximumFractionDigits:2})}</>}</td>
                    <td style={{padding:"3px 4px",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{isNonEur && <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"var(--subtle-border)",color:"var(--text-tertiary)"}}>{ccy}</span>}</td>
                    <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:isNonEur?"var(--text-secondary)":"var(--text-tertiary)",borderBottom:"1px solid var(--subtle-bg)",fontSize:isNonEur?11:10.5}}>{privacyMode?"•••":isNonEur ? `€${eurVal.toLocaleString(undefined,{maximumFractionDigits:0})}` : `€${_sf(Math.abs(g.amount||0),2)}`}</td>
                    <td style={{padding:"3px 6px",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid var(--subtle-bg)",fontSize:10,maxWidth:240,cursor:"pointer"}} onClick={()=>setEditingCell({id:g.id,field:"detail",value:g.detail||""})}>{editingCell?.id===g.id&&editingCell?.field==="detail"?<input autoFocus value={editingCell.value} onChange={e=>setEditingCell(p=>({...p,value:e.target.value}))} onBlur={()=>saveInlineEdit(g,"detail",editingCell.value)} onKeyDown={e=>{if(e.key==="Enter")saveInlineEdit(g,"detail",editingCell.value);if(e.key==="Escape")setEditingCell(null);}} style={{padding:"2px 4px",background:"var(--surface)",border:"1px solid var(--gold)",borderRadius:4,color:"var(--text-primary)",fontSize:10,fontFamily:"var(--fm)",outline:"none",width:"100%"}}/>:<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{g.detail||"—"}</span>}</td>
                    <td style={{padding:"3px 4px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)"}}>
                      {(() => {
                        const linked = getLinkedPresu(g);
                        if (linked) return <span title={`Vinculado: ${linked.nombre}`} style={{fontSize:8,padding:"2px 5px",borderRadius:4,background:"rgba(48,209,88,.1)",color:"#30d158",fontFamily:"var(--fm)",fontWeight:600,cursor:"default"}}>✓</span>;
                        if (linkingGasto === g.id) return (
                          <select autoFocus onChange={e=>{if(e.target.value)linkGastoToPresu(g.detail,parseInt(e.target.value));else setLinkingGasto(null);}} onBlur={()=>setLinkingGasto(null)}
                            style={{fontSize:8,padding:"2px",borderRadius:4,border:"1px solid var(--gold)",background:"var(--surface)",color:"var(--text-primary)",fontFamily:"var(--fm)",width:80}}>
                            <option value="">—</option>
                            {[...presuItems].sort((a,b) => (a.categoria||'').localeCompare(b.categoria||'') || (a.nombre||'').localeCompare(b.nombre||'')).map(p=><option key={p.id} value={p.id}>{p.categoria ? `[${p.categoria.slice(0,4)}] ` : ''}{p.nombre}</option>)}
                          </select>
                        );
                        return <button onClick={()=>setLinkingGasto(g.id)} title="Vincular a presupuesto" style={{fontSize:8,padding:"2px 5px",borderRadius:4,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",cursor:"pointer",fontFamily:"var(--fm)"}}>🔗</button>;
                      })()}
                    </td>
                    <td style={{padding:"3px 6px",borderBottom:"1px solid var(--subtle-bg)",whiteSpace:"nowrap"}}>
                      <button onClick={()=>{setGastosForm({date:g.date,cat:g.cat,amount:Math.abs(g.amount||0),currency:ccy,recur:!!g.recur,detail:g.detail||"",tipo:g.tipo||"normal",secreto:!!g.secreto,_isEdit:true,isIngreso:g.amount>0});setGastosShowForm(true);deleteGasto(g.id);}} title="Editar" style={{width:22,height:22,borderRadius:4,border:"1px solid var(--subtle-bg2)",background:"transparent",color:"var(--text-tertiary)",fontSize:9,cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",marginRight:4}}>✎</button>
                      <button onClick={()=>{if(confirm("Borrar este gasto?"))deleteGasto(g.id);}} title="Borrar" style={{width:22,height:22,borderRadius:4,border:"1px solid rgba(255,69,58,.2)",background:"transparent",color:"var(--red)",fontSize:9,cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></>;
        })()}
      </div>
    )}
  </div>

  {/* Export */}
  {gastosLog.length > 0 && (
    <div style={{display:"flex",justifyContent:"flex-end"}}>
      <button onClick={()=>{const blob=new Blob([JSON.stringify(gastosLog,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="gastos_ar.json";a.click();}} style={{padding:"5px 12px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)"}}>↓ Exportar JSON</button>
    </div>
  )}
</div>
  );
}
