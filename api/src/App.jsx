import { useState, useCallback, useMemo, useEffect, useRef } from "react";


// Safe toFixed/toLocaleString: handles undefined, null, NaN gracefully
const _sf = (v, d=0) => (v == null || v === undefined || isNaN(v) || typeof v !== "number") ? "0" : v.toFixed(d);
const _sl = (v, opts) => (v == null || v === undefined || isNaN(v) || typeof v !== "number") ? "0" : v.toLocaleString(undefined, opts||{maximumFractionDigits:0});
/* ═══════════════════════════════════════════
   A&R v10.2 — Dividend Equity Analysis
   Aesthetic: Luxury dark terminal + warm gold accents
   Features: Multi-Currency (auto FX), Altman Z-Score,
   Dividend Deep Dive, Comparables, Weighted Scoring,
   ROIC-WACC Spread, Revenue-to-FCF Waterfall,
   Collapsible Sidebar
   v10.2 Changes:
   - Dividendos reconciliados con IB (2,066 entries verificadas, -$22.7K fantasma eliminado)
   - Gastos 2025 importados de Spendee (2,141 entries, 12 meses completos)
   - Gastos 2026 importados de Spendee (361 entries)
   - GASTOS_MONTH recalculado con FX mensual y divisas nativas (EUR/CNY/USD)
   - Pestaña FIRE nueva: toggle EUR/USD, desglose 🇪🇸/🇨🇳, escenarios, Freedom Numbers
   - Dividendos tab: YOC, frecuencia pago, FIRE target line, sortable, top 25 12m
   - Patrimonio tab: eje Y con escala, etiquetas, barras doradas
   - Tabs responsivas (flex-wrap)
   ═══════════════════════════════════════════ */

const _CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length:18}, (_,i) => _CURRENT_YEAR-i);
const PROJ_YEARS = Array.from({length:10}, (_,i) => _CURRENT_YEAR+i);

// ─── Helpers ────────────────────────────────
const n = v => (v == null || isNaN(v) || !isFinite(v)) ? null : v;
const f0 = v => n(v) != null ? Math.round(v).toLocaleString() : "—";
const f1 = v => n(v) != null ? _sf(v,1) : "—";
const f2 = v => n(v) != null ? _sf(v,2) : "—";
const fP = v => n(v) != null ? `${_sf(v*100,1)}%` : "—";
const fX = v => n(v) != null ? `${_sf(v,1)}x` : "—";
const fC = (v,s="$") => n(v) != null ? `${s}${_sf(v,2)}` : "—";
const fM = v => { if(n(v)==null) return "—"; const a=Math.abs(v); const s=v<0?"-":""; return a>=1e6?`${s}${_sf(a/1e6,1)}T`:a>=1e3?`${s}${_sf(a/1e3,1)}B`:`${s}${_sf(a,0)}M`; };
// Dollar formatter for portfolio (raw dollar amounts, not millions)
const fDol = v => { if(n(v)==null) return "—"; const a=Math.abs(v); const s=v<0?"-":""; return a>=1e9?`${s}${_sf(a/1e9,1)}B`:a>=1e6?`${s}${_sf(a/1e6,1)}M`:a>=1e3?`${s}${_sf(a/1e3,1)}K`:`${s}${_sf(a,0)}`; };
const div = (a,b) => (n(a)!=null && n(b)!=null && b!==0) ? a/b : null;
const clamp = (v,lo,hi) => Math.min(Math.max(v,lo),hi);
const cagrFn = (end, start, yrs) => (n(end)!=null && n(start)!=null && start>0 && end>0 && yrs>0) ? Math.pow(end/start, 1/yrs)-1 : null;

// ─── Currency System ────────────────────────────
const CURRENCIES = {
  USD: {symbol:"$", name:"US Dollar", flag:"🇺🇸"},
  EUR: {symbol:"€", name:"Euro", flag:"🇪🇺"},
  GBP: {symbol:"£", name:"British Pound", flag:"🇬🇧"},
  GBX: {symbol:"p", name:"British Pence", flag:"🇬🇧", parentCcy:"GBP", divisor:100},
  CAD: {symbol:"C$", name:"Canadian Dollar", flag:"🇨🇦"},
  AUD: {symbol:"A$", name:"Australian Dollar", flag:"🇦🇺"},
  HKD: {symbol:"HK$", name:"Hong Kong Dollar", flag:"🇭🇰"},
  JPY: {symbol:"¥", name:"Japanese Yen", flag:"🇯🇵"},
  CHF: {symbol:"Fr", name:"Swiss Franc", flag:"🇨🇭"},
  DKK: {symbol:"kr", name:"Danish Krone", flag:"🇩🇰"},
  SEK: {symbol:"kr", name:"Swedish Krona", flag:"🇸🇪"},
  NOK: {symbol:"kr", name:"Norwegian Krone", flag:"🇳🇴"},
  SGD: {symbol:"S$", name:"Singapore Dollar", flag:"🇸🇬"},
  CNY: {symbol:"¥", name:"Chinese Yuan", flag:"🇨🇳"},
};

// Supported display currencies for the toggle
const DISPLAY_CCYS = ["USD","EUR","GBP","CAD","AUD"];

// Convert amount from one currency to display currency using fx rates
// fxRates = { USD: 1, EUR: 0.92, GBP: 0.79, ... } (all relative to USD)
const convertCcy = (amount, fromCcy, toCcy, fxRates) => {
  if(amount == null || isNaN(amount)) return null;
  if(fromCcy === toCcy) return amount;
  if(!fxRates || !fxRates[fromCcy] || !fxRates[toCcy]) return amount;
  // Handle GBX (pence) → convert to GBP first
  let adjAmount = amount;
  let adjFrom = fromCcy;
  if(fromCcy === "GBX") { adjAmount = amount / 100; adjFrom = "GBP"; }
  let adjTo = toCcy;
  if(toCcy === "GBX") { adjTo = "GBP"; } // display in GBP not GBX
  // Convert: amount in fromCcy → USD → toCcy
  const inUSD = adjAmount / (fxRates[adjFrom] || 1);
  return inUSD * (fxRates[adjTo] || 1);
};

// Format with currency symbol
const fCcy = (amount, ccy, fxRates, displayCcy) => {
  const converted = displayCcy && displayCcy !== ccy ? convertCcy(amount, ccy, displayCcy, fxRates) : amount;
  if(converted == null || isNaN(converted)) return "—";
  const sym = CURRENCIES[displayCcy||ccy]?.symbol || "$";
  return `${sym}${_sf(converted,2)}`;
};

// Fetch live FX rates from free APIs (no API key needed)
async function fetchFxRates() {
  // Try multiple free FX APIs in order of reliability
  const apis = [
    {
      url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,CAD,AUD,HKD,JPY,CHF,DKK,SEK,NOK,SGD,CNY",
      parse: (data) => {
        if (!data.rates?.EUR) return null;
        return { USD: 1, ...data.rates, GBX: data.rates.GBP };
      }
    },
    {
      url: "https://open.er-api.com/v6/latest/USD",
      parse: (data) => {
        if (!data.rates?.EUR) return null;
        const r = data.rates;
        return { USD:1, EUR:r.EUR, GBP:r.GBP, CAD:r.CAD, AUD:r.AUD, HKD:r.HKD, JPY:r.JPY, CHF:r.CHF, DKK:r.DKK, SEK:r.SEK, NOK:r.NOK, SGD:r.SGD, CNY:r.CNY, GBX:r.GBP };
      }
    }
  ];
  for (const api of apis) {
    try {
      const response = await fetch(api.url);
      if (!response.ok) continue;
      const data = await response.json();
      const rates = api.parse(data);
      if (rates) { console.log("FX rates loaded from", api.url); return rates; }
    } catch(e) { console.warn("FX API failed:", api.url, e); }
  }
  console.warn("All FX APIs failed, using defaults");
  return null;
}

// Default FX rates (fallback if API fails)
const DEFAULT_FX = {USD:1, EUR:0.876, GBP:0.756, CAD:1.44, AUD:1.59, HKD:7.78, JPY:148.5, CHF:0.88, DKK:6.54, SEK:9.85, NOK:10.35, SGD:1.34, GBX:0.756, CNY:7.24};

// ─── Rating system ────────────────────────────
const rate = (val, rules) => {
  if(n(val)==null) return {lbl:"—",c:"var(--text-tertiary)",bg:"#1a202c",score:0};
  for(const r of rules) if(r.test(val)) return r;
  return {lbl:"—",c:"var(--text-tertiary)",bg:"#1a202c",score:0};
};

const R = {
  gm: [
    {test:v=>v>.40, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Ventaja competitiva fuerte (moat). Poder de fijación de precios."},
    {test:v=>v>.25, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Márgenes saludables, empresa competitiva."},
    {test:v=>v>.15, lbl:"Aceptable",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Márgenes ajustados. Sector competitivo o commoditizado."},
    {test:v=>v<=.15, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Poco poder de precios. Riesgo en recesiones."},
  ],
  om: [
    {test:v=>v>.20, lbl:"Fuerte",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Negocio muy eficiente, costes bien controlados."},
    {test:v=>v>.10, lbl:"Aceptable",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Rentabilidad operativa decente."},
    {test:v=>v>.05, lbl:"Débil",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Márgenes bajos, vulnerables a subidas de costes."},
    {test:v=>v<=.05, lbl:"Muy débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"La empresa apenas genera beneficio operativo."},
  ],
  nm: [
    {test:v=>v>.15, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
    {test:v=>v>.08, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2},
    {test:v=>v>.03, lbl:"Aceptable",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
    {test:v=>v<=.03, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
  ],
  roe: [
    {test:v=>v>.15, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Genera gran retorno para los accionistas."},
    {test:v=>v>.10, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Retorno aceptable."},
    {test:v=>v>.05, lbl:"Modesto",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Retorno bajo, capital infrautilizado."},
    {test:v=>v<=.05, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Destruye valor para accionistas."},
  ],
  roic: [
    {test:v=>v>.15, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
    {test:v=>v>.10, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2},
    {test:v=>v>.06, lbl:"Aceptable",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
    {test:v=>v<=.06, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
  ],
  fcfm: [
    {test:v=>v>.20, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
    {test:v=>v>.10, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2},
    {test:v=>v>.05, lbl:"Aceptable",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
    {test:v=>v<=.05, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
  ],
  d2fcf: [
    {test:v=>v<2, lbl:"Saludable",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Deuda fácilmente pagable con el flujo de caja."},
    {test:v=>v<4, lbl:"Aceptable",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Deuda manejable pero vigilar."},
    {test:v=>v<6, lbl:"Elevada",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Apalancamiento alto, riesgo en recesión."},
    {test:v=>v>=6, lbl:"Peligrosa",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Riesgo financiero grave. Posible restructuración."},
  ],
  ic: [
    {test:v=>v>10, lbl:"Muy sólido",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Deuda muy bien cubierta por beneficio operativo."},
    {test:v=>v>5, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Sin riesgo relevante de impago de intereses."},
    {test:v=>v>2, lbl:"Aceptable",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Controlado pero vigilable."},
    {test:v=>v<=2, lbl:"Riesgo",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Puede no generar suficiente para cubrir intereses."},
  ],
  eve: [
    {test:v=>v<8, lbl:"Barata",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Cotiza por debajo de su valor operativo."},
    {test:v=>v<12, lbl:"Razonable",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Precio justo para el beneficio que genera."},
    {test:v=>v<18, lbl:"Cara",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"El mercado descuenta mucho crecimiento futuro."},
    {test:v=>v>=18, lbl:"Muy cara",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Múltiplo muy elevado. Peligro si decepciona."},
  ],
  pio: [
    {test:v=>v>=8, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Empresa financieramente muy sólida."},
    {test:v=>v>=6, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Buena solidez financiera general."},
    {test:v=>v>=4, lbl:"Neutral",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Sin señales claras. Investigar más."},
    {test:v=>v<4, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Señales de debilidad financiera."},
  ],
  mos: [
    {test:v=>v>.30, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
    {test:v=>v>.15, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2},
    {test:v=>v>0, lbl:"Ajustado",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
    {test:v=>v<=0, lbl:"Sin margen",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
  ],
  growth: [
    {test:v=>v>.10, lbl:"Fuerte",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
    {test:v=>v>.05, lbl:"Moderado",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2},
    {test:v=>v>.0, lbl:"Lento",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
    {test:v=>v<=0, lbl:"Declive",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
  ],
  // Rule #1 Big Five: Phil Town requires ≥10%
  big5: [
    {test:v=>v>=.10, lbl:"≥10% ✓",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Phil Town: ≥10% es la regla. La empresa reinvierte capital eficientemente."},
    {test:v=>v>=.05, lbl:"5-10%",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Por debajo del umbral Rule #1. Investigar por qué."},
    {test:v=>v>=0, lbl:"<5%",c:"#ff9f0a",bg:"rgba(255,159,10,.10)",score:0,tip:"Crecimiento muy bajo. ¿Hay moat?"},
    {test:v=>v<0, lbl:"Negativo ✗",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"La métrica está en declive. Señal de alerta."},
  ],
  // Payback Time: Phil Town wants ≤8 years
  payback: [
    {test:v=>v<=8, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Phil Town: ≤8 años es el objetivo. Recuperas tu inversión rápido."},
    {test:v=>v<=10, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Aceptable pero por encima del ideal de Phil Town."},
    {test:v=>v<=15, lbl:"Lento",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Payback lento. ¿Merece la pena esperar tanto?"},
    {test:v=>v>15, lbl:"Muy lento",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Demasiado tiempo para recuperar la inversión."},
  ],
};

// ─── UI Components ────────────────────────────
const Badge = ({val,rules,showTip}) => {
  const r = rate(val,rules);
  const [hover,setHover] = useState(false);
  return (
    <span style={{position:"relative",display:"inline-flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:100,fontSize:11,fontWeight:600,color:r.c,background:`${r.c}11`,cursor:r.tip?"help":"default",letterSpacing:.2,fontFamily:"var(--fb)",transition:"all .2s"}}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      <span style={{width:5,height:5,borderRadius:"50%",background:r.c,boxShadow:`0 0 6px ${r.c}40`}}/>
      {r.lbl}
      {hover && r.tip && showTip!==false && (
        <span style={{position:"absolute",bottom:"calc(100% + 10px)",left:"50%",transform:"translateX(-50%)",background:"#1c1c1e",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:"10px 14px",fontSize:12,color:"#86868b",width:240,lineHeight:1.6,zIndex:99,boxShadow:"0 12px 40px rgba(0,0,0,.6)",pointerEvents:"none",fontFamily:"var(--fb)",fontWeight:400}}>
          {r.tip}
        </span>
      )}
    </span>
  );
};

const BarChart = ({data, labels, color="var(--gold)", height=140, showValues=true, formatFn=f0}) => {
  const valid = data.map((v,i) => ({v:n(v),l:labels[i]})).filter(x=>x.v!=null);
  if(valid.length<2) return <div style={{color:"var(--text-tertiary)",fontSize:12,textAlign:"center",padding:20}}>Datos insuficientes</div>;
  const max = Math.max(...valid.map(x=>Math.abs(x.v)), 1);
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:2,height,padding:"0 4px"}}>
      {valid.map((x,i) => {
        const h = (Math.abs(x.v)/max) * (height - 28);
        const isNeg = x.v < 0;
        return (
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%",minWidth:0}}>
            {showValues && <span style={{fontSize:8,color:"var(--text-secondary)",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden"}}>{formatFn(x.v)}</span>}
            <div style={{width:"100%",maxWidth:32,height:h,background:isNeg ? "rgba(252,129,129,.3)" : `${color}33`,borderRadius:"3px 3px 0 0",border:`1px solid ${isNeg?"var(--red)":color}`,borderBottom:"none",transition:"height .5s ease",position:"relative"}}>
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:"40%",background:isNeg?"rgba(255,69,58,.15)":`${color}15`,borderRadius:"0 0 0 0"}}/>
            </div>
            <span style={{fontSize:7.5,color:"var(--text-tertiary)",marginTop:3,fontFamily:"var(--fm)"}}>{x.l}</span>
          </div>
        );
      })}
    </div>
  );
};

const AreaSparkline = ({data, color="var(--gold)", w=160, h=40}) => {
  const valid = data.filter(v=>n(v)!=null);
  if(valid.length<2) return <span style={{color:"var(--text-tertiary)",fontSize:11}}>—</span>;
  const mn = Math.min(...valid), mx = Math.max(...valid), rng = mx-mn||1;
  const pts = valid.map((v,i)=>`${(i/(valid.length-1))*w},${h-4-((v-mn)/rng)*(h-8)}`);
  const areapts = `0,${h} ${pts.join(" ")} ${w},${h}`;
  const trend = valid[valid.length-1] >= valid[0];
  const c = trend ? "var(--green)" : "var(--red)";
  return (
    <svg width={w} height={h} style={{display:"block"}}>
      <defs><linearGradient id={`g${color.replace(/[^a-z0-9]/gi,'')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity=".2"/><stop offset="100%" stopColor={c} stopOpacity="0"/></linearGradient></defs>
      <polygon points={areapts} fill={`url(#g${color.replace(/[^a-z0-9]/gi,'')})`}/>
      <polyline points={pts.join(" ")} fill="none" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={w} cy={h-4-((valid[valid.length-1]-mn)/rng)*(h-8)} r={2.5} fill={c}/>
    </svg>
  );
};

const DonutChart = ({value, max=100, size=130, strokeW=10, color, label, sublabel}) => {
  const pct = clamp(value/max, 0, 1);
  const r = (size-strokeW)/2;
  const circ = 2*Math.PI*r;
  const offset = circ * (1-pct);
  const c = color || (pct>=.7?"var(--green)":pct>=.4?"var(--yellow)":"var(--red)");
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a202c" strokeWidth={strokeW}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={strokeW} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{transition:"stroke-dashoffset 1s ease"}}/>
      </svg>
      <div style={{position:"relative",marginTop:-size/2-16,textAlign:"center",height:size/2+16,display:"flex",flexDirection:"column",justifyContent:"center"}}>
        <div style={{fontSize:28,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{Math.round(value)}</div>
        {sublabel && <div style={{fontSize:9,color:"var(--text-secondary)"}}>{sublabel}</div>}
      </div>
      {label && <div style={{fontSize:11,color:"var(--text-secondary)",fontWeight:500,marginTop:4}}>{label}</div>}
    </div>
  );
};

const GaugeVerdict = ({score}) => {
  const verdict = score >= 75 ? {lbl:"COMPRAR",c:"var(--green)",emoji:"🟢",desc:"La empresa muestra fortaleza en la mayoría de métricas clave."} 
    : score >= 50 ? {lbl:"MANTENER",c:"var(--yellow)",emoji:"🟡",desc:"Empresa aceptable pero con áreas de mejora. Vigilar evolución."}
    : score >= 30 ? {lbl:"PRECAUCIÓN",c:"var(--orange)",emoji:"🟠",desc:"Varias métricas en zona de riesgo. Analizar en profundidad."}
    : {lbl:"EVITAR",c:"var(--red)",emoji:"🔴",desc:"La empresa presenta debilidades significativas."};
  return (
    <div style={{textAlign:"center",padding:16}}>
      <div style={{fontSize:48,marginBottom:4}}>{verdict.emoji}</div>
      <div style={{fontSize:28,fontWeight:800,color:verdict.c,fontFamily:"var(--fd)",letterSpacing:2}}>{verdict.lbl}</div>
      <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:8,maxWidth:320,margin:"8px auto 0",lineHeight:1.6}}>{verdict.desc}</div>
    </div>
  );
};

const Tooltip = ({text, children}) => {
  const [show,setShow] = useState(false);
  return (
    <span style={{position:"relative",cursor:"help"}} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show && <span style={{position:"absolute",bottom:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",background:"#1c1c1e",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:"10px 14px",fontSize:12,color:"var(--text-secondary)",width:240,lineHeight:1.6,zIndex:99,boxShadow:"0 12px 40px rgba(0,0,0,.7)",whiteSpace:"normal",fontFamily:"var(--fb)"}}>{text}</span>}
    </span>
  );
};

const Inp = ({label, value, onChange, type="number", step, suffix, w, placeholder, tip}) => (
  <div style={{display:"flex",flexDirection:"column",gap:4}}>
    <label style={{fontSize:10,color:"var(--text-tertiary)",fontWeight:500,letterSpacing:.5,textTransform:"uppercase",fontFamily:"var(--fb)",display:"flex",alignItems:"center",gap:4}}>
      {label}
      {tip && <Tooltip text={tip}><span style={{fontSize:10,opacity:.4}}>?</span></Tooltip>}
    </label>
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <input type={type} step={step} placeholder={placeholder} value={value===0&&type==="number"?"":value} 
        onChange={e=>onChange(type==="number"?parseFloat(e.target.value)||0:e.target.value)}
        style={{width:w||"100%",padding:"7px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:10,color:"var(--text-primary)",fontSize:13,outline:"none",fontFamily:"var(--fm)",fontWeight:500,transition:"all .2s"}}
        onFocus={e=>{e.target.style.borderColor="var(--gold)";e.target.style.background="rgba(200,164,78,.04)";}}
        onBlur={e=>{e.target.style.borderColor="var(--border)";e.target.style.background="rgba(255,255,255,.04)";}}/>
      {suffix && <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{suffix}</span>}
    </div>
  </div>
);

const Card = ({children, style, glow, title, icon, badge}) => (
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:24,position:"relative",overflow:"hidden",transition:"border-color .3s,background .3s",...(glow?{background:"var(--card)",border:"1px solid rgba(200,164,78,.12)",boxShadow:"0 0 60px var(--gold-glow)"}:{}),...style}}
    onMouseEnter={e=>{if(!glow){e.currentTarget.style.borderColor="var(--border-hover)";e.currentTarget.style.background="var(--card-hover)";}}}
    onMouseLeave={e=>{if(!glow){e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--card)";}}}>
    {glow && <div style={{position:"absolute",top:0,left:"20%",right:"20%",height:1,background:"linear-gradient(90deg,transparent,var(--gold),transparent)",opacity:.2}}/>}
    {title && <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
      <h3 style={{margin:0,fontSize:15,fontWeight:600,color:"var(--text-primary)",display:"flex",alignItems:"center",gap:8,fontFamily:"var(--fb)",letterSpacing:-.2}}>{icon && <span style={{fontSize:13,opacity:.5}}>{icon}</span>} {title}</h3>
      {badge}
    </div>}
    {children}
  </div>
);

const SensitivityTable = ({dcfFn, baseGrowth, baseDiscount}) => {
  const growths = [baseGrowth-2, baseGrowth-1, baseGrowth, baseGrowth+1, baseGrowth+2];
  const discounts = [baseDiscount-2, baseDiscount-1, baseDiscount, baseDiscount+1, baseDiscount+2];
  return (
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"var(--fm)"}}>
      <thead>
        <tr>
          <th style={{padding:6,color:"var(--text-secondary)",fontSize:9,borderBottom:"1px solid #2d3748"}}>Crec↓ / Desc→</th>
          {discounts.map(d=><th key={d} style={{padding:6,color:d===baseDiscount?"var(--gold)":"var(--text-secondary)",fontSize:10,borderBottom:"1px solid #2d3748",fontWeight:d===baseDiscount?700:400}}>{d}%</th>)}
        </tr>
      </thead>
      <tbody>
        {growths.map(g=>(
          <tr key={g}>
            <td style={{padding:6,color:g===baseGrowth?"var(--gold)":"var(--text-secondary)",fontWeight:g===baseGrowth?700:400,fontSize:10}}>{g}%</td>
            {discounts.map(d=>{
              const v = dcfFn(g/100, d/100);
              const isBase = g===baseGrowth && d===baseDiscount;
              return <td key={d} style={{padding:6,textAlign:"center",color:isBase?"var(--gold)":"var(--text-secondary)",fontWeight:isBase?700:400,background:isBase?"var(--gold-glow)":"transparent",borderRadius:isBase?6:0}}>{fC(v)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ─── PDF Generator — tab-by-tab capture ────────────────────────────────
async function generatePDF(cfg, fin, comp, dcf, piotroski, scoreItems, totalScore, wacc, setTab, TABS, content, setBtnState) {
  // Simply switch to the built-in "report" tab — renders all tabs inline
  setTab('report');
  setBtnState('done');
  setTimeout(() => setBtnState('idle'), 1500);
}


const TABS = [
  {id:"dash",lbl:"Resumen",ico:"◈"},
  {id:"data",lbl:"Datos",ico:"▤"},
  {id:"quality",lbl:"Calidad",ico:"◆"},
  {id:"debt",lbl:"Deuda",ico:"⬡"},
  {id:"dividends",lbl:"Dividendos",ico:"💰"},
  {id:"big5",lbl:"Big Five",ico:"❺"},
  {id:"tencap",lbl:"10 Cap",ico:"🎯"},
  {id:"payback",lbl:"Payback",ico:"⏱"},
  {id:"valuation",lbl:"Valoración",ico:"◎"},
  {id:"mos",lbl:"MOS",ico:"🛡"},
  {id:"fastgraphs",lbl:"FastGraphs",ico:"📉"},
  {id:"growth",lbl:"Crecimiento",ico:"📈"},
  {id:"verdict",lbl:"Veredicto",ico:"★"},
  {id:"report",lbl:"Informe",ico:"📄"},
];

// ─── WACC Calculator ────────────────────────────
function calcWACC(data) {
  const {equity, totalDebt, interestExpense, taxRate=0.25, beta=1.0, riskFreeRate=0.04, marketPremium=0.055} = data;
  const E = equity || 1;
  const D = totalDebt || 0;
  const V = E + D;
  const costEquity = riskFreeRate + beta * marketPremium;
  const costDebt = D > 0 ? div(interestExpense, D) || 0.04 : 0.04;
  const wacc = (E/V) * costEquity + (D/V) * costDebt * (1 - taxRate);
  return {wacc, costEquity, costDebt: costDebt*(1-taxRate), weightE: E/V, weightD: D/V};
}

// ─── Piotroski Calculator ────────────────────────────
function calcPiotroski(curr, prev) {
  if(!curr || !prev) return {score:0, items:[]};
  const items = [];
  const fcfC = curr.ocf - curr.capex;
  const fcfP = prev.ocf - prev.capex;
  const roaC = div(curr.netIncome, (curr.equity+curr.totalDebt));
  const roaP = div(prev.netIncome, (prev.equity+prev.totalDebt));
  const cfoC = div(curr.ocf, (curr.equity+curr.totalDebt));
  const ltdC = curr.totalDebt;
  const ltdP = prev.totalDebt;
  const crC = div((curr.cash||0), (curr.totalDebt||1));
  const crP = div((prev.cash||0), (prev.totalDebt||1));
  const gmC = div(curr.grossProfit, curr.revenue);
  const gmP = div(prev.grossProfit, prev.revenue);
  const atC = div(curr.revenue, (curr.equity+curr.totalDebt));
  const atP = div(prev.revenue, (prev.equity+prev.totalDebt));

  const add = (name,pass,desc) => items.push({name,pass,desc});
  add("ROA positivo", roaC>0, "Beneficio neto / Activos > 0");
  add("OCF positivo", curr.ocf>0, "Flujo de caja operativo > 0");
  add("ROA creciente", roaC>roaP, "ROA mejora vs año anterior");
  add("OCF > Net Income", curr.ocf > curr.netIncome, "Calidad de beneficios");
  add("Deuda decreciente", ltdC < ltdP, "La deuda disminuye");
  add("Liquidez mejora", crC > crP, "Ratio de liquidez mejora");
  add("Sin dilución", curr.sharesOut <= prev.sharesOut, "No se emiten acciones nuevas");
  add("Margen bruto mejora", gmC > gmP, "Margen bruto crece");
  add("Rotación activos mejora", atC > atP, "Eficiencia de activos mejora");
  
  return {score: items.filter(x=>x.pass).length, items};
}

// ─── Sustainable Growth Rate ────────────────────────────
function calcGrowthRate(data) {
  const roe = div(data.netIncome, data.equity);
  const payoutRatio = (data.dps * data.sharesOut) / (data.netIncome || 1);
  const retentionRate = Math.max(0, 1 - payoutRatio);
  const sustainableGrowth = (roe || 0) * retentionRate;
  return {sustainableGrowth, roe, retentionRate, payoutRatio};
}

// ─── Altman Z-Score ────────────────────────────
function calcAltmanZ(data, mktCap) {
  if(!data || !data.revenue) return {score:null, items:[], zone:"—"};
  const totalAssets = (data.equity||0) + (data.totalDebt||0);
  if(totalAssets <= 0) return {score:null, items:[], zone:"—"};
  const workingCap = (data.cash||0) - (data.totalDebt * 0.3); // rough current liabilities proxy
  const A = 1.2 * (workingCap / totalAssets);
  const B = 1.4 * ((data.retainedEarnings||0) / totalAssets);
  const C = 3.3 * ((data.operatingIncome||0) / totalAssets);
  const D = 0.6 * ((mktCap||0) / (data.totalDebt||1));
  const E = 1.0 * ((data.revenue||0) / totalAssets);
  const z = A + B + C + D + E;
  const items = [
    {name:"A: Working Cap / Assets",val:A/1.2,weighted:A,weight:1.2},
    {name:"B: Ret. Earnings / Assets",val:B/1.4,weighted:B,weight:1.4},
    {name:"C: EBIT / Assets",val:C/3.3,weighted:C,weight:3.3},
    {name:"D: Mkt Cap / Total Debt",val:D/0.6,weighted:D,weight:0.6},
    {name:"E: Sales / Assets",val:E/1.0,weighted:E,weight:1.0},
  ];
  const zone = z > 2.99 ? "Segura" : z > 1.81 ? "Gris" : "Peligro";
  const zoneColor = z > 2.99 ? "var(--green)" : z > 1.81 ? "var(--yellow)" : "var(--red)";
  return {score:z, items, zone, zoneColor};
}

// ─── Dividend Analysis ────────────────────────────
function calcDividendAnalysis(fin, comp, YEARS) {
  const yrs = YEARS.filter(y=>fin[y]?.dps>0);
  if(yrs.length < 2) return {streak:0, cagr3:null, cagr5:null, cagr10:null, payoutFCF:null, payoutEarnings:null, yieldOnCost:null, years:yrs};
  
  // Dividend streak (consecutive years of dividend)
  let streak = 0;
  for(const y of YEARS) {
    if(fin[y]?.dps > 0) streak++; else break;
  }
  
  // Dividend growth CAGRs
  const cf = (end,start,n) => (end>0&&start>0&&n>0) ? Math.pow(end/start,1/n)-1 : null;
  const cagr3 = yrs.length>=4 ? cf(fin[yrs[0]]?.dps, fin[yrs[3]]?.dps, 3) : null;
  const cagr5 = yrs.length>=6 ? cf(fin[yrs[0]]?.dps, fin[yrs[5]]?.dps, 5) : null;
  const cagr10 = yrs.length>=11 ? cf(fin[yrs[0]]?.dps, fin[yrs[10]]?.dps, 10) : null;

  // Current payouts — use most recent year with revenue data
  const latestDivYear = YEARS.find(y => fin[y]?.revenue > 0) || YEARS[0];
  const latest = fin[latestDivYear];
  const latestComp = comp[latestDivYear];
  const payoutFCF = latestComp?.fcf > 0 ? (latest?.dps * latest?.sharesOut) / latestComp.fcf : null;
  const payoutEarnings = latest?.netIncome > 0 ? (latest?.dps * latest?.sharesOut) / latest.netIncome : null;

  return {streak, cagr3, cagr5, cagr10, payoutFCF, payoutEarnings, years:yrs};
}

// ─── FMP Data Fetcher (via worker proxy) + Claude Qualitative Analysis ────────

async function fetchViaFMP(ticker) {
  // Call our worker which proxies to FMP and caches in D1
  const _API = "https://aar-api.garciaontoso.workers.dev";
  const resp = await fetch(`${_API}/api/fundamentals?symbol=${encodeURIComponent(ticker)}&refresh=1`);
  if (!resp.ok) throw new Error(`API error ${resp.status}`);
  const data = await resp.json();
  
  if (!data.income || data.income.length === 0) throw new Error(`No hay datos de FMP para ${ticker}. ¿Es un ticker US?`);

  // Map FMP data to A&R structure (10 years)
  const fin = {};
  const incomeByYear = {};
  data.income.forEach(d => { incomeByYear[d.fiscalYear] = d; });
  const balByYear = {};
  (data.balance || []).forEach(d => { balByYear[d.fiscalYear] = d; });
  const cfByYear = {};
  (data.cashflow || []).forEach(d => { cfByYear[d.fiscalYear] = d; });
  const ratByYear = {};
  (data.ratios || []).forEach(d => { if(d.fiscalYear) ratByYear[d.fiscalYear] = d; });

  // Get all years present
  const allYears = [...new Set([...Object.keys(incomeByYear), ...Object.keys(balByYear), ...Object.keys(cfByYear)])].sort().reverse().slice(0, 10);

  allYears.forEach(yStr => {
    const y = parseInt(yStr);
    const inc = incomeByYear[yStr] || {};
    const bal = balByYear[yStr] || {};
    const cf = cfByYear[yStr] || {};
    const rat = ratByYear[yStr] || {};
    
    // FMP returns raw values (not millions) — convert to millions
    const M = v => (v || 0) / 1e6;
    
    fin[y] = {
      revenue: M(inc.revenue),
      grossProfit: M(inc.grossProfit),
      operatingIncome: M(inc.operatingIncome),
      netIncome: M(inc.netIncome),
      eps: inc.epsDiluted || inc.eps || 0,
      dps: rat.dividendPerShare || 0,
      sharesOut: M(inc.weightedAverageShsOutDil || inc.weightedAverageShsOut),
      totalDebt: M((bal.totalDebt || 0) || ((bal.longTermDebt || 0) + (bal.shortTermDebt || 0))),
      cash: M(bal.cashAndCashEquivalents || bal.cashAndShortTermInvestments || 0),
      equity: M(bal.totalStockholdersEquity || bal.totalEquity || 0),
      retainedEarnings: M(bal.retainedEarnings || 0),
      ocf: M(cf.operatingCashFlow || cf.netCashProvidedByOperatingActivities || 0),
      capex: Math.abs(M(cf.capitalExpenditure || 0)),
      interestExpense: M(inc.interestExpense || 0),
      depreciation: M(inc.depreciationAndAmortization || cf.depreciationAndAmortization || 0),
      taxProvision: M(inc.incomeTaxExpense || 0),
    };
  });

  if (Object.keys(fin).length === 0) throw new Error("No se encontraron datos financieros para " + ticker);

  // Extract DPS from dividend history if available
  if (data.dividends && data.dividends.length > 0) {
    // Group by year and sum
    const dpsByYear = {};
    data.dividends.forEach(d => {
      const y = new Date(d.date || d.paymentDate || "").getFullYear();
      if (y && y >= 2010) dpsByYear[y] = (dpsByYear[y] || 0) + (d.dividend || d.adjDividend || 0);
    });
    Object.keys(dpsByYear).forEach(yStr => {
      const y = parseInt(yStr);
      if (fin[y]) fin[y].dps = Math.round(dpsByYear[y] * 100) / 100;
    });
  }

  const prof = data.profile || {};
  return {
    fin,
    cfg: {
      ticker: ticker.toUpperCase(),
      name: prof.companyName || ticker,
      price: prof.price || 0,
      currency: prof.currency || "USD",
      beta: prof.beta || 1.0,
    },
    profile: prof, // Keep full profile for the report
    // v10.2: New FMP data
    fmpRating: data.rating || {},
    fmpDCF: data.dcf || {},
    fmpEstimates: data.estimates || [],
    fmpPriceTarget: data.priceTarget || {},
    fmpKeyMetrics: data.keyMetrics || [],
    fmpFinGrowth: data.finGrowth || [],
  };
}

// Generate qualitative analysis using Claude API
async function generateReport(ticker, fin, cfg, profile) {
  const years = Object.keys(fin).sort().reverse();
  const latestYear = years[0];
  const d = fin[latestYear] || {};
  const fcf = d.ocf - d.capex;
  
  // Build financial summary for Claude
  const summary = years.slice(0, 10).map(y => {
    const f = fin[y];
    return `${y}: Rev=${f.revenue?.toFixed(0)}M, NI=${f.netIncome?.toFixed(0)}M, EPS=${f.eps?.toFixed(2)}, DPS=${f.dps?.toFixed(2)}, FCF=${(f.ocf-f.capex)?.toFixed(0)}M, Debt=${f.totalDebt?.toFixed(0)}M, Cash=${f.cash?.toFixed(0)}M`;
  }).join("\n");

  const prompt = `You are a senior dividend equity analyst. Analyze ${cfg.name} (${ticker}) for a long-term dividend growth investor.

FINANCIAL DATA (10 years, in millions USD except per-share):
${summary}

PROFILE: Sector: ${profile?.sector||"?"}, Industry: ${profile?.industry||"?"}, Market Cap: $${((profile?.mktCap||0)/1e9).toFixed(1)}B, Employees: ${profile?.fullTimeEmployees||"?"}, Country: ${profile?.country||"?"}

Current price: $${cfg.price}, Beta: ${cfg.beta}, Dividend Yield: ${d.dps && cfg.price ? (d.dps/cfg.price*100).toFixed(2) : "?"}%

Provide your analysis in this exact JSON format (no markdown, no backticks, pure JSON):
{
  "moat": {"rating": "Wide|Narrow|None", "score": 8, "explanation": "2-3 sentences on competitive advantages"},
  "dividendSafety": {"score": 75, "payoutFCF": 45, "payoutEarnings": 55, "streak": 15, "growthCAGR5y": 6.2, "assessment": "2-3 sentences"},
  "financialHealth": {"score": 70, "debtToEBITDA": 2.1, "interestCoverage": 8.5, "currentRatio": 1.2, "assessment": "2-3 sentences"},
  "growth": {"revenueCAGR5y": 5.1, "epsCAGR5y": 7.2, "fcfTrend": "Growing|Stable|Volatile|Declining", "assessment": "2-3 sentences"},
  "valuation": {"fairValue": 120, "method": "DCF/Earnings/FCF", "upside": 15, "assessment": "2 sentences"},
  "risks": ["Risk 1", "Risk 2", "Risk 3"],
  "catalysts": ["Catalyst 1", "Catalyst 2"],
  "verdict": {"action": "CORE HOLD|ADD|HOLD|REVIEW|SELL", "targetWeight": "3-5%", "summary": "3-4 sentence investment thesis"},
  "overallScore": 72
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Claude API error ${response.status}`);
    const data = await response.json();
    const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    }
    throw new Error("No JSON in response");
  } catch(e) {
    console.error("Report generation error:", e);
    return null;
  }
}

// Legacy wrapper — now calls FMP instead of Claude for data
async function fetchViaClaudeAPI(ticker, apiKey) {
  return fetchViaFMP(ticker);
}

// ─── Persistent Storage helpers (safe — no crash if unavailable) ────
const storageAvailable = () => typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function';

async function saveCompanyToStorage(ticker, data) {
  if (!storageAvailable()) return;
  try {
    const payload = JSON.stringify({ ...data, savedAt: new Date().toISOString() });
    await window.storage.set(`company:${ticker.toUpperCase()}`, payload, true);
    let portfolio = [];
    try {
      const idx = await window.storage.get("portfolio:index", true);
      if (idx?.value) portfolio = JSON.parse(idx.value);
    } catch(e) {}
    if (!portfolio.includes(ticker.toUpperCase())) {
      portfolio.push(ticker.toUpperCase());
      await window.storage.set("portfolio:index", JSON.stringify(portfolio), true);
    }
  } catch(e) { console.warn("Storage save error:", e); }
}

async function loadCompanyFromStorage(ticker) {
  if (!storageAvailable()) return null;
  try {
    const result = await window.storage.get(`company:${ticker.toUpperCase()}`, true);
    if (result?.value) return JSON.parse(result.value);
  } catch(e) {}
  return null;
}

async function loadPortfolioIndex() {
  if (!storageAvailable()) return [];
  try {
    const result = await window.storage.get("portfolio:index", true);
    if (result?.value) return JSON.parse(result.value);
  } catch(e) {}
  return [];
}

async function removeCompanyFromStorage(ticker) {
  if (!storageAvailable()) return;
  try {
    await window.storage.delete(`company:${ticker.toUpperCase()}`, true);
    let portfolio = [];
    try {
      const idx = await window.storage.get("portfolio:index", true);
      if (idx?.value) portfolio = JSON.parse(idx.value);
    } catch(e) {}
    portfolio = portfolio.filter(t => t !== ticker.toUpperCase());
    await window.storage.set("portfolio:index", JSON.stringify(portfolio), true);
  } catch(e) {}
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════

// ─── Cost Basis Data — loaded from storage or imported via JSON ───
// To load your data: go to any company's 📋, click "↑ Importar", select costbasis_app.json
const CB_DATA = {};
const CB_META = {};
const expandCB = (compact) => {
  const result = {};
  for(const [ticker, txns] of Object.entries(compact)) {
    result[ticker] = txns.map((t,i) => ({
      id: ticker+"_"+String(i).padStart(4,"0"),
      date: t.d||"", type: t.t||"",
      shares: t.s||0, price: t.p||0, fees: t.f||0, cost: t.c||0,
      optExpiry: t.oe||"", optType: t.ot||"", optStatus: t.os||"",
      optContracts: t.on||0, optStrike: t.ok||0, optCredit: t.oc||0, optCreditTotal: t.oct||0,
      dps: t.dps||0, divTotal: t.dt||0,
      _balance: t._b||0, _totalShares: t._ts||0, _adjustedBasis: t._ab||0,
      _adjustedBasisPct: t._ap||0, _divYieldBasis: t._dy||0,
    }));
  }
  return result;
};
const CB_EXPANDED = expandCB(CB_DATA);



// ─── Dashboard / Patrimony Data ───
// ─── API Configuration ────────────────────────────
const API_URL = "https://aar-api.garciaontoso.workers.dev";

// ─── Data defaults (replaced by API on load) ────────────────
let CTRL_DATA = [];
let INCOME_DATA = [];
let DIV_BY_YEAR = {};
let DIV_BY_MONTH = {};
let GASTOS_MONTH = {};
let FIRE_PROJ = [];
let FIRE_PARAMS = {target:1350000,returnPct:0.11,inflation:0.025,monthlyExp:4000};
let ANNUAL_PL = [];
let FI_TRACK = [];
let HIST_INIT = [];
let GASTO_CATS = {};
let _DIV_ENTRIES = []; // parsed dividend entries (replaces DIV_RAW)
let _GASTO_ENTRIES = []; // parsed gasto entries (replaces GASTOS_RAW)
let GASTOS_CAT = {}; // aggregated spending by category
let CASH_DATA = []; // cash balances from IB accounts

// Fetch all data from API
async function fetchAllData() {
  try {
    const [patrimonio, ingresos, divResumen, divMensual, divAll, gastosMensual, gastosAll, holdings, fire, pl, config, categorias, cashData] = await Promise.all([
      fetch(API_URL+"/api/patrimonio").then(r=>r.json()).catch(()=>[]),
      fetch(API_URL+"/api/ingresos").then(r=>r.json()).catch(()=>[]),
      fetch(API_URL+"/api/dividendos/resumen").then(r=>r.json()).catch(()=>[]),
      fetch(API_URL+"/api/dividendos/mensual").then(r=>r.json()).catch(()=>[]),
      fetch(API_URL+"/api/dividendos").then(r=>r.json()).catch(()=>[]),
      fetch(API_URL+"/api/gastos/mensual").then(r=>r.json()).catch(()=>[]),
      fetch(API_URL+"/api/gastos").then(r=>r.json()).catch(()=>[]),
      fetch(API_URL+"/api/holdings").then(r=>r.json()).catch(()=>[]),
      fetch(API_URL+"/api/fire").then(r=>r.json()).catch(()=>({tracking:[],proyecciones:[],params:null})),
      fetch(API_URL+"/api/pl").then(r=>r.json()).catch(()=>[]),
      fetch(API_URL+"/api/config").then(r=>r.json()).catch(()=>({})),
      fetch(API_URL+"/api/categorias").then(r=>r.json()).catch(()=>[]),
      fetch(API_URL+"/api/cash/latest").then(r=>r.json()).catch(()=>[]),
    ]);

    // Map API responses to expected formats
    CTRL_DATA = patrimonio.map(p => ({
      d: p.fecha, fx: p.fx_eur_usd, bk: p.bank, br: p.broker, fd: p.fondos,
      cr: p.crypto, hp: p.hipoteca, pu: p.total_usd, pe: p.total_eur, sl: p.salary
    }));

    INCOME_DATA = ingresos.map(d => ({
      m: d.mes, div: d.dividendos, cs: d.covered_calls, rop: d.rop, roc: d.roc,
      cal: d.cal, leaps: d.leaps, total: d.total, gast: d.gastos_usd, sl: d.salary
    }));

    DIV_BY_YEAR = {};
    divResumen.forEach(d => { DIV_BY_YEAR[d.anio] = {g: d.bruto, n: d.neto, c: d.cobros}; });

    DIV_BY_MONTH = {};
    divMensual.forEach(d => { DIV_BY_MONTH[d.mes] = {g: d.bruto, n: d.neto, c: d.cobros}; });

    GASTOS_MONTH = {};
    gastosMensual.forEach(d => { GASTOS_MONTH[d.mes] = {eur: d.eur, cny: d.cny, usd: d.usd}; });

    HIST_INIT = holdings.map(h => ({
      t: h.ticker, n: h.num_trades, s: h.shares, d: h.div_total, o: h.opciones_pl
    }));

    if (fire.proyecciones) {
      FIRE_PROJ = fire.proyecciones.map(p => ({
        y: p.anio, s: p.inicio, e: p.fin, r: p.retorno_pct, sl: p.salary, g: p.gastos
      }));
    }
    if (fire.tracking) {
      FI_TRACK = fire.tracking.map(t => ({
        m: t.mes, fi: t.fi, cov: t.cobertura, sav: t.ahorro, acc: t.acumulado
      }));
    }
    if (fire.params) FIRE_PARAMS = fire.params;
    if (config.fire_params) FIRE_PARAMS = config.fire_params;

    ANNUAL_PL = pl.map(d => ({
      y: d.anio, sueldo: d.sueldo, bolsa: d.bolsa, div: d.dividendos, cs: d.covered_calls,
      rop: d.rop, roc: d.roc, leaps: d.leaps, cal: d.cal, gastos: d.gastos
    }));

    GASTO_CATS = {};
    categorias.forEach(c => { GASTO_CATS[c.codigo] = c.nombre; });

    // Dividend entries (parsed, replaces expandDivInit)
    _DIV_ENTRIES = divAll.map((d,i) => ({
      id: "dv_"+String(i).padStart(4,"0"), date: d.fecha, ticker: d.ticker, company: d.ticker,
      gross: d.bruto, net: d.neto, taxPct: d.bruto > 0 && d.neto ? Math.round((1-d.neto/d.bruto)*100) : 30,
      currency: d.divisa || "USD", broker: "IB", shares: d.shares || 0
    }));

    // Gasto entries (parsed, replaces expandGastosInit)
    _GASTO_ENTRIES = gastosAll.map((g,i) => ({
      id: "g_"+String(i).padStart(5,"0"), date: g.fecha, cat: GASTO_CATS[g.categoria] || g.categoria,
      catCode: g.categoria, amount: g.importe, recur: false, currency: g.divisa || "EUR"
    }));

    // Aggregate spending by category name
    GASTOS_CAT = {};
    _GASTO_ENTRIES.forEach(g => {
      if(!GASTOS_CAT[g.cat]) GASTOS_CAT[g.cat] = 0;
      GASTOS_CAT[g.cat] += g.amount;
    });

    CASH_DATA = cashData || [];

    return true;
  } catch(e) {
    console.error("Failed to fetch data from API:", e);
    return false;
  }
}
// ─── Expand functions (now use API data) ────────────────────────
const expandDivInit = () => _DIV_ENTRIES;
const expandGastosInit = () => _GASTO_ENTRIES;

export default function ARApp() {
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataError, setDataError] = useState(null);

  useEffect(() => {
    fetchAllData().then(ok => {
      setDataLoaded(true);
      if(!ok) setDataError("Error conectando con la API.");
    });
  }, []);

  // ═══ Pre-loaded: Diageo PLC (DEO) — GuruFocus Feb 2026 ═══
  const DEO_DATA = {
    2025:{revenue:20245,grossProfit:12173,operatingIncome:4335,netIncome:2354,eps:4.23,dps:4.14,sharesOut:557,totalDebt:24401,cash:2647,equity:11090,retainedEarnings:10274,ocf:4297,capex:1612,interestExpense:1104,depreciation:1718,taxProvision:999},
    2024:{revenue:20269,grossProfit:12198,operatingIncome:6001,netIncome:3870,eps:6.91,dps:4.01,sharesOut:560,totalDebt:22105,cash:1405,equity:10032,retainedEarnings:9783,ocf:4105,capex:1510,interestExpense:1134,depreciation:493,taxProvision:1294},
    2023:{revenue:20555,grossProfit:12266,operatingIncome:5547,netIncome:4445,eps:7.83,dps:3.64,sharesOut:568,totalDebt:21355,cash:2062,equity:9856,retainedEarnings:8876,ocf:3636,capex:1417,interestExpense:951,depreciation:1297,taxProvision:1163},
    2022:{revenue:20516,grossProfit:12593,operatingIncome:5897,netIncome:4280,eps:7.36,dps:3.96,sharesOut:581,totalDebt:19385,cash:3068,equity:9435,retainedEarnings:8490,ocf:5213,capex:1457,interestExpense:1217,depreciation:1064,taxProvision:1398},
    2021:{revenue:17623,grossProfit:10650,operatingIncome:5164,netIncome:3681,eps:6.28,dps:3.73,sharesOut:586,totalDebt:20885,cash:3868,equity:9545,retainedEarnings:7004,ocf:5057,capex:866,interestExpense:686,depreciation:619,taxProvision:1255},
    2020:{revenue:14465,grossProfit:8737,operatingIncome:4293,netIncome:1734,eps:2.95,dps:3.45,sharesOut:589,totalDebt:21239,cash:4180,equity:8336,retainedEarnings:5346,ocf:2856,capex:862,interestExpense:703,depreciation:2264,taxProvision:725},
    2019:{revenue:16306,grossProfit:10140,operatingIncome:5122,netIncome:4005,eps:6.60,dps:3.47,sharesOut:607,totalDebt:16073,cash:1338,equity:10596,retainedEarnings:7492,ocf:4116,capex:850,interestExpense:641,depreciation:474,taxProvision:1138},
    2018:{revenue:15902,grossProfit:9843,operatingIncome:4993,netIncome:3951,eps:6.33,dps:3.46,sharesOut:624,totalDebt:13148,cash:1175,equity:13006,retainedEarnings:7434,ocf:4032,capex:764,interestExpense:548,depreciation:645,taxProvision:779},
    2017:{revenue:15677,grossProfit:9588,operatingIncome:4630,netIncome:3463,eps:5.49,dps:3.04,sharesOut:631,totalDebt:12002,cash:1581,equity:13417,retainedEarnings:7123,ocf:4075,capex:674,interestExpense:597,depreciation:470,taxProvision:952},
    2016:{revenue:13995,grossProfit:8321,operatingIncome:3669,netIncome:2995,eps:4.76,dps:3.41,sharesOut:630,totalDebt:13843,cash:1651,equity:11386,retainedEarnings:5020,ocf:3401,capex:675,interestExpense:627,depreciation:631,taxProvision:662},
    2015:{revenue:17003,grossProfit:9754,operatingIncome:4398,netIncome:3744,eps:5.95,dps:3.34,sharesOut:629,totalDebt:15883,cash:769,equity:12220,retainedEarnings:5714,ocf:4011,capex:1003,interestExpense:852,depreciation:692,taxProvision:733},
    2014:{revenue:17471,grossProfit:10609,operatingIncome:4610,netIncome:3970,eps:6.08,dps:3.20,sharesOut:629,totalDebt:16189,cash:1119,equity:11621,retainedEarnings:4152,ocf:3049,capex:1093,interestExpense:790,depreciation:1071,taxProvision:761},
    2013:{revenue:17183,grossProfit:10470,operatingIncome:5138,netIncome:3728,eps:5.92,dps:2.83,sharesOut:629,totalDebt:15746,cash:2677,equity:10696,retainedEarnings:2647,ocf:3091,capex:967,interestExpense:787,depreciation:605,taxProvision:771},
    2012:{revenue:16711,grossProfit:10101,operatingIncome:4882,netIncome:3003,eps:4.76,dps:2.64,sharesOut:627,totalDebt:13915,cash:1690,equity:8777,retainedEarnings:368,ocf:3292,capex:749,interestExpense:801,depreciation:639,taxProvision:1588},
    2011:{revenue:15970,grossProfit:9525,operatingIncome:4171,netIncome:3054,eps:4.89,dps:2.49,sharesOut:625,totalDebt:13183,cash:2546,equity:8430,retainedEarnings:-313,ocf:3509,capex:673,interestExpense:894,depreciation:566,taxProvision:551},
    2010:{revenue:14721,grossProfit:8551,operatingIncome:3875,netIncome:2452,eps:3.94,dps:2.33,sharesOut:623,totalDebt:13540,cash:2335,equity:6032,retainedEarnings:-2073,ocf:3607,capex:563,interestExpense:884,depreciation:560,taxProvision:718},
    2009:{revenue:13000,grossProfit:7500,operatingIncome:3400,netIncome:2200,eps:3.50,dps:2.20,sharesOut:620,totalDebt:14000,cash:2100,equity:5800,retainedEarnings:-2500,ocf:3200,capex:520,interestExpense:900,depreciation:540,taxProvision:650},
    2008:{revenue:12500,grossProfit:7200,operatingIncome:3200,netIncome:2000,eps:3.20,dps:2.10,sharesOut:618,totalDebt:13500,cash:1800,equity:5500,retainedEarnings:-2800,ocf:3000,capex:500,interestExpense:880,depreciation:520,taxProvision:600},
  };
  const [fin, setFin] = useState(()=>{
    const o = {};
    YEARS.forEach(y => { o[y] = DEO_DATA[y] || {revenue:0,grossProfit:0,operatingIncome:0,netIncome:0,eps:0,dps:0,sharesOut:0,totalDebt:0,cash:0,equity:0,retainedEarnings:0,ocf:0,capex:0,interestExpense:0,depreciation:0,taxProvision:0}; });
    return o;
  });
  // NOTE: DEO_DATA is kept as example data — load via "Importar" JSON or will integrate API later
  const [cfg, setCfg] = useState({ticker:"DEO",name:"Diageo PLC",price:89.50,currency:"USD",beta:0.46,riskFree:4.0,marketPremium:5.5,taxRate:28,manualDiscount:0,manualGrowth:0,useWACC:true});
  const [tab, setTab] = useState("dash");
  const [anim, setAnim] = useState(false);
  const [fgMode, setFgMode] = useState("eps");
  const [fgPE, setFgPE] = useState(15);
  const [fgGrowth, setFgGrowth] = useState(8);
  const [fgProjYears, setFgProjYears] = useState(5);
  const [showDiv, setShowDiv] = useState(true);
  const [pdfState, setPdfState] = useState("idle");
  const [guideStep, setGuideStep] = useState(0);
  const [comps, setComps] = useState([{name:"Pernod Ricard",pe:13.53,evEbitda:0},{name:"Brown-Forman",pe:16.88,evEbitda:0},{name:"Campari",pe:88.72,evEbitda:0}]);

  // SSD — Simply Safe Dividends data (from PDF upload)
  const [ssd, setSsd] = useState({
    safetyScore: 80,
    safetyLabel: "Safe",
    safetyDate: "Feb 25, 2026",
    safetyNote: "Downgraded on Feb 25, 2026. Our Safe rating suggests a dividend cut is unlikely.",
    creditRating: "A-",
    creditLabel: "Strong",
    taxation: "Qualified",
    taxForm: "Form 1099",
    frequency: "Semiannual",
    freqMonths: "Apr, Dec",
    annualPayout: 3.2792,
    exDivDate: "Apr 16",
    exDivStatus: "Confirmed",
    payDate: "Apr 17",
    payDateStatus: "Confirmed",
    payoutRatio: 0.51,
    payoutLabel: "Low for consumer staples",
    fwdPayoutRatio: 0.52,
    fwdPayoutLabel: "Low for consumer staples",
    ndEbitda: 3.49,
    ndEbitdaLabel: "Low for consumer staples",
    ndCapital: 0.62,
    ndCapitalLabel: "Edging high for consumer staples",
    divStreak: 0,
    divStreakLabel: "Without a reduction",
    recessionDivAction: "Increased",
    recessionSales: "+4.7%",
    recessionSalesLabel: "Above average growth during 2007-09",
    recessionReturn: "-51%",
    recessionReturnLabel: "Near S&P 500's -55% return from 2007-09",
    growthLast12m: -0.20,
    growthLast5y: -0.065,
    growthLast10y: -0.013,
    growthStreak: 0,
    uninterruptedStreak: 0,
    expectedPriceLow: 126,
    expectedPriceHigh: 154,
    fiveYearAvgPrice: 126,
    sectorPE: 19.2,
    notes: [
      {title:"Diageo Cuts Dividend to Prioritize Business Reinvestment", type:"Downgrade", date:"Feb 25, 2026", score:80, label:"Safe", text:"Diageo's new CEO, who took the helm on January 1, reset the company's capital allocation strategy, announcing a roughly 50% reduction to the dividend as part of a broader effort to reinvest in the business."},
      {title:"Evolving Alcohol Trends Create Challenges but Diageo's Dividend Remains Secure", type:"Downgrade", date:"Feb 25, 2025", score:90, label:"Very Safe", text:"Diageo's roots date back to the 18th century when Guinness began brewing in Dublin in 1759, and Johnnie Walker started blending whisky in Scotland in the 1820s."},
    ],
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tabsRef = useRef(null);
  const [fmpLoading, setFmpLoading] = useState(false);
  const [fmpError, setFmpError] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [lastSaved, setLastSaved] = useState(null); // ISO date of last save for current ticker
  const [fmpApiKey, setFmpApiKey] = useState("");
  // v10.2: New FMP data (rating, DCF, estimates, price targets, key metrics, financial growth)
  const [fmpExtra, setFmpExtra] = useState({ rating: {}, dcf: {}, estimates: [], priceTarget: {}, keyMetrics: [], finGrowth: [] });
  const [showSettings, setShowSettings] = useState(false);

  // ── Navigation: "home" (portfolio/watchlist/research) vs "analysis" (15 tabs) vs "costbasis" ──
  const [viewMode, setViewMode] = useState("home");
  const [homeTab, setHomeTab] = useState("portfolio");
  const [searchTicker, setSearchTicker] = useState("");
  const [cbTicker, setCbTicker] = useState(null); // cost basis active ticker
  // Trades tab state
  const [tradesData, setTradesData] = useState(null); // {results, total, summary}
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesFilter, setTradesFilter] = useState({tipo:"",year:"",ticker:""});
  const [tradesPage, setTradesPage] = useState(0);
  // Portfolio country filter
  const [countryFilter, setCountryFilter] = useState("");
  
  // Country mapping: ticker -> country code
  const getCountry = (ticker, ccy) => {
    // Explicit mappings for tickers that need override
    const map = {"ENG":"ES","FDJU":"FR","BME:AMS":"ES","BME:VIS":"ES","LSEG":"GB","DEO":"US","NVO":"US","CNSWF":"CA","DIDIY":"US","NOMD":"US","LYB":"US","ACN":"US"};
    if (map[ticker]) return map[ticker];
    if (ticker.startsWith("HGK:") || ticker.startsWith("HKG:")) return "HK";
    if (ticker.startsWith("BME:")) return "ES";
    if (/^\d{4}$/.test(ticker)) return "HK";
    if (ccy === "CAD") return "CA";
    if (ccy === "AUD") return "AU";
    if (ccy === "GBP" || ccy === "GBX") return "GB";
    if (ccy === "HKD") return "HK";
    if (ccy === "EUR") {
      if (["SHUR","WKL"].includes(ticker)) return "NL";
      if (["HEN3"].includes(ticker)) return "DE";
      return "EU";
    }
    return "US";
  };
  const FLAGS = {"US":"\u{1F1FA}\u{1F1F8}","HK":"\u{1F1ED}\u{1F1F0}","CA":"\u{1F1E8}\u{1F1E6}","AU":"\u{1F1E6}\u{1F1FA}","GB":"\u{1F1EC}\u{1F1E7}","ES":"\u{1F1EA}\u{1F1F8}","NL":"\u{1F1F3}\u{1F1F1}","DE":"\u{1F1E9}\u{1F1EA}","FR":"\u{1F1EB}\u{1F1F7}","EU":"\u{1F1EA}\u{1F1FA}"};
// Static position data (name, currency, tags, lastPrice) — editable fields
const POS_STATIC = {
"ACN":{n:"Accenture Plc",lp:196.65,ap:204.1867,cb:204.1867,sh:60,tg:"GORKA",cat:"COMPANY",pnl:-0.036911,pnlAbs:-452.2,mv:11799,uv:11799,ti:12251.2,d2f:1.03,apc:-0.2435,mc:121.0},
"AMCR":{n:"Amcor PLC",lp:40.57,ap:48.57,cb:48.57,sh:10,tg:"YO",cat:"COMPANY",pnl:-0.164711,pnlAbs:-80,mv:405.7,uv:405.7,ti:485.7,d2f:18.47,apc:-0.0352,mc:18.75},
"AMT":{n:"American Tower Corp",lp:184.41,ap:185.3,cb:185.3,sh:100,tg:"LANDLORD",cat:"REIT",pnl:-0.004803,pnlAbs:-89,mv:18441,uv:18441,ti:18530,d2f:8.39,apc:0.055,mc:85.95},
"ARE":{n:"Alexandria Real Estate Equities Inc",lp:48.41,ap:81.8643,cb:75.8972,sh:650,tg:"LANDLORD",cat:"REIT",divTTM:4.68,dy:0.0967,yoc:0.057168,pnl:-0.362163,pnlAbs:-21745.32,mv:31466.5,uv:31466.5,ti:49333.16,d2f:1.11,apc:-0.0114,adt:62.855,f2d:0.577,mc:8.39},
"AZJ":{n:"Aurizon Holdings Ltd",c:"AUD",fx:0.6989,lp:4,ap:3.2825,cb:3.2825,sh:6000,tg:"GORKA",cat:"COMPANY",pnl:0.218583,pnlAbs:4305,mv:24000,uv:16773.6,ti:13764.84,apc:0.1111,mc:4.79},
"BIZD":{n:"VanEck BDC Income ETF",lp:12.48,ap:15.2868,cb:13.8808,sh:1100,tg:"YO",cat:"ETF",dy:0.1339,pnl:-0.100919,pnlAbs:-3087.51,mv:13728,uv:13728,ti:15268.92,pr:0.85,dc1:-1.56,dc5:6.42,apc:-0.1248,adt:147.29},
"BME:AMS":{n:"Amadeus It Group SA",c:"EUR",fx:1.14635,lp:52.22,ap:48.945,cb:48.945,sh:200,tg:"GORKA",cat:"COMPANY",pnl:0.066912,pnlAbs:655,mv:10444,uv:11972.48,ti:11221.62,apc:-0.1674,mc:26.85},
"BME:VIS":{n:"Viscofan SA",c:"EUR",fx:1.14635,lp:58.5,ap:54.73,cb:54.73,sh:300,tg:"GORKA",cat:"COMPANY",pnl:0.068884,pnlAbs:1131,mv:17550,uv:20118.44,ti:18821.92,roe:0.041135,apc:0.0874,mc:3.13},
"CAG":{n:"Conagra Brands Inc",lp:16.41,ap:17.896,cb:16.5142,sh:400,tg:"YO",cat:"COMPANY",divTTM:1.4,dy:0.0853,yoc:0.07823,yf:0.0853,pnl:-0.00631,pnlAbs:-594.42,mv:6564,uv:6564,ti:6605.68,pr:-6.98,d2f:15.23,nde:5.78,dc5:10.4,apc:-0.0514,adt:34.12,f2d:0.366,mc:7.85},
"CLPR":{n:"Clipper Realty Inc",lp:3.05,ap:4.2119,cb:4.1407,sh:1800,tg:"LANDLORD",cat:"REIT",divTTM:0.38,dy:0.1246,yoc:0.09022,yf:0.1246,pnl:-0.263402,pnlAbs:-2091.43,mv:5490,uv:5490,ti:7453.18,roe:0.189247,nde:17.7,apc:-0.1433,adt:224.28,mc:0.05},
"CMCSA":{n:"Comcast Corp",lp:30.16,ap:29.8677,cb:27.9562,sh:200,tg:"YO",cat:"COMPANY",divTTM:0.99,dy:0.0438,yoc:0.033146,yf:0.0438,pnl:0.078832,pnlAbs:58.47,mv:6032,uv:6032,ti:5591.23,roe:0.261632,pr:0.25,nde:2.44,dc1:-20.2,dc5:3.1,apc:0.09,adt:8.76,f2d:0.3131,mc:108.51},
"CNSWF":{n:"Constellation Software Inc.",lp:1841.68,ap:1889.11,cb:1889.11,sh:5,tg:"GORKA",cat:"COMPANY",pnl:-0.025107,pnlAbs:-237.15,mv:9208.4,uv:9208.4,ti:9445.55,d2f:1.01,apc:-0.2172,mc:53.49},
"CPB":{n:"Campbell's Co",lp:21.71,ap:28.145,cb:26.7343,sh:200,tg:"YO",cat:"COMPANY",divTTM:1.56,dy:0.0719,yoc:0.055427,yf:0.0719,pnl:-0.187935,pnlAbs:-1287,mv:4342,uv:4342,ti:5346.86,roe:0.136212,pr:0.86,d2f:10.42,nde:5.25,dc1:5.4,dc5:1.5,apc:-0.2165,adt:14.38,f2d:0.6636,mc:6.47},
"CUBE":{n:"CubeSmart",lp:38.65,ap:36.805,cb:36.805,sh:200,tg:"LANDLORD",cat:"COMPANY",dy:0.0541,yoc:0.00147,pnl:0.050129,pnlAbs:369,mv:7730,uv:7730,ti:7361,roe:-0.066875,apc:0.0918,adt:10.82,mc:8.78},
"CZR":{n:"Caesars Entertainment Inc",lp:28.06,ap:26.6793,cb:26.46,sh:500,tg:"LANDLORD",cat:"REIT",pnl:0.060467,pnlAbs:690.35,mv:14030,uv:14030,ti:13230.02,roe:0.385766,d2f:35.27,nde:6.76,apc:0.191,mc:5.71},
"DEO":{n:"Diageo PLC",lp:77.37,ap:97.1746,cb:95.0734,sh:690,tg:"GORKA",cat:"COMPANY",divTTM:4.14,dy:0.0535,yoc:0.042604,yf:0.0535,pnl:-0.186208,pnlAbs:-13665.15,mv:53385.3,uv:53385.3,ti:65600.63,roe:0.012764,pr:0.89,d2f:7.76,nde:2.96,dc1:-5.7,dc5:2.3,apc:-0.1116,adt:36.915,f2d:0.8879,mc:43.27},
"DIDIY":{n:"DiDi Global Inc - ADR",lp:3.94,ap:10.4751,cb:9.8122,sh:700,tg:"YO",cat:"COMPANY",pnl:-0.59846,pnlAbs:-4574.6,mv:2758,uv:2758,ti:6868.56,roe:0.156601,d2f:0.02,nde:0.02,apc:-0.2914,mc:18.35},
"EMN":{n:"Eastman Chemical Co",lp:69.25,ap:61.7602,cb:61.7602,sh:100,tg:"YO",cat:"COMPANY",dy:0.0482,yoc:0.00078,pnl:0.121272,pnlAbs:748.98,mv:6925,uv:6925,ti:6176.02,d2f:0.82,apc:0.0763,adt:4.82,mc:7.9},
"ENG":{n:"Enagas SA",c:"EUR",fx:1.14635,lp:15.04,ap:14.9525,cb:14.9525,sh:500,tg:"GORKA",cat:"COMPANY",pnl:0.005855,pnlAbs:43.77,mv:7520,uv:8620.55,ti:8570.38,apc:0.1249,mc:4.53},
"FDJU":{n:"FDJ United",c:"EUR",fx:1.14635,lp:25.86,ap:22.9885,cb:22.9885,sh:700,tg:"GORKA",cat:"COMPANY",pnl:0.12491,pnlAbs:2010.05,mv:18102,uv:20751.23,ti:18447.01,apc:0.1099,mc:5.61},
"FDS":{n:"Factset Research Systems Inc",lp:205.65,ap:206.8867,cb:206.8867,sh:60,tg:"GORKA",cat:"COMPANY",pnl:-0.005978,pnlAbs:-74.2,mv:12339,uv:12339,ti:12413.2,apc:-0.2782,mc:7.63},
"FLO":{n:"Flowers Foods Inc",lp:8.79,ap:10.475,cb:10.475,sh:700,tg:"YO",cat:"COMPANY",dy:0.1126,yoc:0.010749,pnl:-0.160859,pnlAbs:-1179.5,mv:6153,uv:6153,ti:7332.5,d2f:3.84,apc:-0.1854,adt:78.82,mc:1.86},
"GEO":{n:"Geo Group Inc",lp:14.55,ap:13.705,cb:13.4037,sh:1300,tg:"LANDLORD",cat:"REIT",pnl:0.085525,pnlAbs:1098.5,mv:18915,uv:18915,ti:17424.75,apc:-0.0866,mc:1.95},
"GIS":{n:"General Mills Inc",lp:39.38,ap:52.13,cb:51.2132,sh:500,tg:"GORKA",cat:"COMPANY",divTTM:2.42,dy:0.0617,yoc:0.046422,yf:0.062,pnl:-0.231058,pnlAbs:-6375,mv:19690,uv:19690,ti:25606.6,roe:0.208437,pr:0.95,nde:3.16,dc1:1.7,dc5:4.5,apc:-0.1387,adt:30.85,mc:21.01},
"GPC":{n:"Genuine Parts Co",lp:105.74,ap:115.91,cb:115.91,sh:100,tg:"YO",cat:"COMPANY",pnl:-0.08774,pnlAbs:-1017,mv:10574,uv:10574,ti:11591,d2f:0.85,apc:-0.1473,mc:14.71},
"GQG":{n:"GQG Partners Inc",c:"AUD",fx:0.6989,lp:1.75,ap:1.703,cb:1.703,sh:2000,tg:"GORKA",cat:"COMPANY",pnl:0.027598,pnlAbs:94,mv:3500,uv:2446.15,ti:2380.45,apc:-0.0057,mc:3.6},
"HEN3":{n:"Henkel AG & Co KGaA Preference Shares",c:"EUR",fx:1.14635,lp:70.08,ap:-2.9555,cb:-2.9555,sh:150,tg:"GORKA",cat:"COMPANY",pnl:-24.711991,pnlAbs:10955.32,mv:10512,uv:12050.43,ti:-508.2,apc:0.006,mc:33.99},
"HGK:9616":{n:"Neutech Group Limited",c:"HKD",fx:0.127706581,lp:2.54,ap:2.5754,cb:2.5754,sh:8000,tg:"GORKA",cat:"COMPANY",divTTM:0.39,dy:0.1535,pnl:-0.013783,pnlAbs:-284.32,mv:20320,uv:2594.9,ti:2660.67,adt:399.12},
"HKG:1052":{n:"Yuexiu Transport Infrastructure Ltd",c:"HKD",fx:0.127706581,lp:4.49,ap:4.4382,cb:4.4227,sh:16000,tg:"GORKA",cat:"COMPANY",pnl:0.015207,pnlAbs:829.28,mv:71840,uv:9174.44,ti:9037.02,apc:-0.0365,mc:0.96},
"HKG:1910":{n:"Samsonite Group SA",c:"HKD",fx:0.127706581,lp:16.1,ap:16.2171,cb:16.2171,sh:900,tg:"GORKA",cat:"COMPANY",pnl:-0.007223,pnlAbs:-105.42,mv:14490,uv:1850.47,ti:1863.93,apc:-0.195,mc:2.85},
"HKG:2219":{n:"Chaoju Eye Care Holdings Ltd",c:"HKD",fx:0.127706581,lp:2.56,ap:2.8096,cb:2.8096,sh:20000,tg:"GORKA",cat:"COMPANY",pnl:-0.088843,pnlAbs:-4992.32,mv:51200,uv:6538.58,ti:7176.13,apc:-0.0554,mc:0.23},
"HKG:9618":{n:"JD.com Inc",c:"HKD",fx:0.127706581,lp:109.6,ap:113.9044,sh:1300,tg:"GORKA",cat:"COMPANY",pnlAbs:-5595.66,mv:142480,uv:18195.63,roe:-0.125024,apc:-0.0478,mc:5.77},
"HR":{n:"Healthcare Realty Trust Inc",lp:17.98,ap:18.955,cb:16.2197,sh:100,tg:"LANDLORD",cat:"REIT",divTTM:1.1,dy:0.0573,yoc:0.058032,yf:0.0573,pnl:0.108529,pnlAbs:-97.5,mv:1798,uv:1798,ti:1621.97,roe:6.571263,nde:16.55,dc1:-11.3,dc5:-1,apc:0.0608,adt:5.73,f2d:0.9051,mc:6.27},
"HRB":{n:"H & R Block Inc",lp:30.51,ap:38.2642,cb:38.2642,sh:600,tg:"YO",cat:"COMPANY",dy:0.0536,yoc:0.001401,pnl:-0.202649,pnlAbs:-4652.52,mv:18306,uv:18306,ti:22958.52,roe:0.0835,apc:-0.284,adt:32.16,mc:3.87},
"IIPR":{n:"Innovative Industrial Properties Inc",lp:52.66,ap:51.805,cb:51.805,sh:200,tg:"LANDLORD",cat:"REIT",dy:0.1443,yoc:0.002785,pnl:0.016504,pnlAbs:171,mv:10532,uv:10532,ti:10361,d2f:0.62,apc:0.0645,adt:28.86,mc:1.48},
"IIPR-PRA":{n:"IIPR 9% Series A Preferred",lp:24.50,ap:25.2325,cb:24.22,sh:400,tg:"LANDLORD",cat:"REIT",divTTM:2.25,dy:0.0918,yoc:0.092898,pnl:-0.029033,pnlAbs:-293,mv:9800,uv:9800,ti:9688,roe:0.055789,f2d:1.0978,adt:900},
"KHC":{n:"Kraft Heinz Co",lp:22.58,ap:24.185,cb:23.825,sh:1200,tg:"GORKA",cat:"COMPANY",divTTM:1.6,dy:0.0709,yoc:0.066157,pnl:-0.052256,pnlAbs:-1925.99,mv:27096,uv:27096,ti:28589.99,roe:0.001229,apc:-0.0742,adt:85.08,mc:26.73},
"KRG":{n:"Kite Realty Group Trust",lp:25.14,ap:22.523,cb:22.1342,sh:500,tg:"LANDLORD",cat:"REIT",divTTM:1.08,dy:0.0438,yoc:0.047951,pnl:0.135798,pnlAbs:1308.49,mv:12570,uv:12570,ti:11067.11,pr:1.59,d2f:11.12,nde:5.87,dc1:42.1,dc5:9.6,apc:0.0559,adt:21.9,mc:5.2},
"LANDP":{n:"Gladstone Land 6 00 Cumulative Redeemable Preferred Stock Series C",lp:19.96,ap:19.805,cb:19.355,sh:500,tg:"LANDLORD",cat:"REIT",pnl:0.031259,pnlAbs:77.49,mv:9980,uv:9980,ti:9677.49,apc:0.0527,mc:0.47},
"LSEG":{n:"London Stock Exchange Group Plc",c:"GBX",fx:1.32369997,lp:8594,ap:9.0414,cb:9.0414,sh:100,tg:"GORKA",cat:"COMPANY",pnl:949.516513,pnlAbs:858495.86,mv:859400,uv:11375.88,ti:1196.81,apc:-0.0239,mc:58.13},
"LW":{n:"Lamb Weston Holdings Inc",lp:40.55,ap:49.452,cb:49.452,sh:250,tg:"GORKA",cat:"COMPANY",pnl:-0.180013,pnlAbs:-2225.5,mv:10137.5,uv:10137.5,ti:12363,d2f:17.38,apc:-0.0411,mc:5.63},
"LYB":{n:"LyondellBasell Industries NV",lp:72.3,ap:43.8925,cb:39.4079,sh:400,tg:"GORKA",cat:"COMPANY",divTTM:5.45,dy:0.0664,yoc:0.124167,pnl:0.834656,pnlAbs:11363,mv:28920,uv:28920,ti:15763.17,roe:0.031649,d2f:4.75,apc:0.6287,adt:26.56,f2d:0.8725,mc:23.29},
"MDV":{n:"Modiv Industrial Inc Class C",lp:14.54,ap:15.3158,cb:14.4862,sh:400,tg:"LANDLORD",cat:"REIT",divTTM:1.16,dy:0.0808,yoc:0.075739,pnl:0.003714,pnlAbs:-310.31,mv:5816,uv:5816,ti:5794.48,roe:-5.033065,d2f:16.18,apc:0.009,adt:32.32,mc:0.15},
"MO":{n:"Altria Group Inc",lp:67.89,ap:-69.6898,cb:-71.4898,sh:100,tg:"YO",cat:"COMPANY",divTTM:4.16,dy:0.0613,yoc:-0.059693,pnl:-1.949646,pnlAbs:13757.98,mv:6789,uv:6789,ti:-7148.98,roe:0.117017,d2f:2.12,apc:0.1846,mc:113.51},
"MSDL":{n:"Morgan Stanley Direct Lending Fund",lp:14.61,ap:19.1745,cb:18.7695,sh:1000,tg:"CEF",cat:"CEF",divTTM:2,yoc:0.104305,pnl:-0.22161,pnlAbs:-4564.52,mv:14610,uv:14610,ti:18769.52,roe:0.325531,apc:-0.1124,mc:1.25},
"MTN":{n:"Vail Resorts Inc",lp:131.74,ap:141.888,cb:140.6895,sh:100,tg:"LANDLORD",cat:"REIT",divTTM:8.88,dy:0.0674,yoc:0.062585,pnl:-0.063612,pnlAbs:-1014.8,mv:13174,uv:13174,ti:14068.95,pr:2.03,nde:3.49,dc1:1.8,apc:-0.0166,adt:6.74,mc:4.69},
"NET.UN":{n:"Canadian Net REIT",c:"CAD",fx:0.694,lp:6.17,ap:5.41,cb:5.1351,sh:2000,tg:"LANDLORD",cat:"REIT",divTTM:0.35,dy:0.0561,yoc:0.064659,pnl:0.201511,pnlAbs:1520,mv:12340,uv:8564,ti:7436.54,roe:0.09097,adt:490},
"NNN":{n:"NNN REIT Inc",lp:45.01,ap:42.005,cb:40.1083,sh:600,tg:"LANDLORD",cat:"REIT",divTTM:2.36,dy:0.0529,yoc:0.056184,yf:0.0533,pnl:0.122213,pnlAbs:1803,mv:27006,uv:27006,ti:24064.96,roe:0.085296,pr:0.92,d2f:7.13,nde:5.26,dc1:3.1,dc5:2.7,apc:0.1386,adt:31.74,f2d:0.6637,mc:8.55},
"NOMD":{n:"Nomad Foods Ltd",lp:9.84,ap:11.6981,cb:11.6327,sh:1300,tg:"GORKA",cat:"COMPANY",divTTM:0.69,dy:0.0691,yoc:0.058984,pnl:-0.154109,pnlAbs:-2415.51,mv:12792,uv:12792,ti:15122.51,roe:0.703818,apc:-0.1908,adt:89.83,mc:1.4},
"NVO":{n:"Novo Nordisk A/S",lp:37.96,ap:40.0202,cb:40.0202,sh:400,tg:"YO",cat:"COMPANY",divTTM:1.73,dy:0.0455,yoc:0.043228,pnl:-0.051478,pnlAbs:-824.06,mv:15184,uv:15184,ti:16008.06,roe:0.022162,apc:-0.2754,adt:18.2,mc:129.44},
"O":{n:"Realty Income Corp",lp:64.44,ap:44.2287,cb:41.0159,sh:500,tg:"LANDLORD",cat:"REIT",divTTM:3.22,dy:0.0501,yoc:0.072803,pnl:0.571097,pnlAbs:10105.64,mv:32220,uv:32220,ti:20507.97,roe:0.099949,d2f:7.36,apc:0.1244,adt:25.05,f2d:0.7844,mc:60.09},
"OBDC":{n:"Blue Owl Capital Corp",lp:10.95,ap:13.599,cb:12.6335,sh:400,tg:"CEF",cat:"CEF",divTTM:1.56,dy:0.1425,yoc:0.114714,pnl:-0.13326,pnlAbs:-1059.6,mv:4380,uv:4380,ti:5053.42,roe:0.35307,d2f:5.73,apc:-0.1282,adt:57,mc:5.47},
"OMC":{n:"Omnicom Group Inc",lp:77.8,ap:72.25,cb:72.25,sh:68.8,tg:"GORKA",cat:"COMPANY",pnl:0.076817,pnlAbs:381.84,mv:5352.64,uv:5352.64,ti:4970.8,d2f:1.38,apc:-0.0433,mc:24.14},
"OWL":{n:"Blue Owl Capital Inc",lp:8.75,ap:14.455,cb:14.1918,sh:1000,tg:"LANDLORD",cat:"REIT",divTTM:0.86,dy:0.1029,yoc:0.059495,yf:0.1029,pnl:-0.383445,pnlAbs:-5705.02,mv:8750,uv:8750,ti:14191.77,pr:1.79,d2f:3.21,nde:3.26,dc1:25.7,apc:-0.4285,adt:102.9,mc:13.6},
"OZON":{n:"Ozon Holdings (sancionada)",ls:"historial",lp:0,mv:0,uv:0,sh:50,tg:"YO",cat:"COMPANY",pnl:-1,pnlAbs:0,roe:-0.044582},
"PATH":{n:"UiPath Inc",lp:11.58,ap:22.2895,cb:22.2895,sh:700,tg:"YO",cat:"COMPANY",pnl:-0.480474,pnlAbs:-7496.68,mv:8106,uv:8106,ti:15602.68,roe:0.444725,apc:-0.2708,mc:6.19},
"PAYX":{n:"Paychex Inc",lp:92.61,ap:108.8333,cb:108.8333,sh:207,tg:"GORKA",cat:"COMPANY",dy:0.0466,yoc:0.000428,pnl:-0.149066,pnlAbs:-3358.23,mv:19170.27,uv:19170.27,ti:22528.5,d2f:-1.04,apc:-0.1472,adt:9.6462,mc:33.24},
"PEP":{n:"PepsiCo Inc",lp:159.88,ap:108.91,cb:102.36,sh:150,tg:"YO",cat:"COMPANY",divTTM:5.62,dy:0.0356,yoc:0.051602,yf:0.0356,pnl:0.561938,pnlAbs:7645.5,mv:23982,uv:23982,ti:15354,roe:0.091051,d2f:4.21,apc:0.1241,adt:5.34,mc:218.5},
"PFE":{n:"Pfizer Inc",lp:26.58,ap:25.51,cb:24.736,sh:400,tg:"YO",cat:"COMPANY",divTTM:1.72,dy:0.0647,yoc:0.067424,yf:0.0647,pnl:0.074546,pnlAbs:427.99,mv:10632,uv:10632,ti:9894.41,d2f:13.06,apc:0.0556,adt:25.88,mc:151.14},
"PG":{n:"Procter & Gamble Co",lp:150.65,ap:146.4767,cb:146.4767,sh:150,tg:"YO",cat:"COMPANY",dy:0.0281,yoc:0.000192,pnl:0.028491,pnlAbs:626,mv:22597.5,uv:22597.5,ti:21971.5,roe:0.182582,d2f:1.93,apc:0.0625,adt:4.215,mc:350.11},
"PYPL":{n:"PayPal Holdings Inc",lp:44.9,ap:108.0486,cb:99.3905,sh:700,tg:"YO",cat:"COMPANY",divTTM:0.14,dy:0.0062,yoc:0.001296,pnl:-0.548246,pnlAbs:-44204,mv:31430,uv:31430,ti:69573.32,roe:0.135123,d2f:-0.88,apc:-0.2277,adt:4.34,mc:41.34},
"RAND":{n:"Rand Capital Corp",lp:11.36,ap:29.4303,cb:29.4303,sh:400,tg:"YO",cat:"CEF",pnl:-0.614003,pnlAbs:-7228.12,mv:4544,uv:4544,ti:11772.12,d2f:0.84,apc:-0.0207,mc:0.03},
"REXR":{n:"Rexford Industrial Realty Inc",lp:34.47,ap:42.3575,cb:40.9202,sh:400,tg:"LANDLORD",cat:"COMPANY",divTTM:1.72,dy:0.0499,yoc:0.040607,yf:0.0505,pnl:-0.157629,pnlAbs:-3155,mv:13788,uv:13788,ti:16368.08,roe:0.182582,d2f:31.18,apc:-0.1168,adt:19.96,mc:7.99},
"RHI":{n:"Robert Half Inc",lp:22.37,ap:26.8864,cb:26.8864,sh:700,tg:"YO",cat:"COMPANY",dy:0.1055,yoc:0.003924,pnl:-0.167982,pnlAbs:-3161.5,mv:15659,uv:15659,ti:18820.5,roe:0.100943,apc:-0.1818,adt:73.85,mc:2.26},
"RICK":{n:"RCI Hospitality Holdings Inc",lp:21.42,ap:38.0607,cb:36.8872,sh:1550,tg:"LANDLORD",cat:"REIT",divTTM:0.28,dy:0.013,yoc:0.007357,pnl:-0.419311,pnlAbs:-25793.01,mv:33201,uv:33201,ti:57175.22,roe:0.202987,d2f:6.59,apc:-0.0858,adt:20.15,f2d:0.0739,mc:0.17},
"RYN":{n:"Rayonier Inc",lp:20.18,ap:23.3451,cb:22.6445,sh:400,tg:"LANDLORD",cat:"REIT",divTTM:1.09,dy:0.054,yoc:0.046691,pnl:-0.108836,pnlAbs:-1266.02,mv:8072,uv:8072,ti:9057.82,roe:0.04512,apc:-0.0662,adt:21.6,mc:6.1},
"SAFE":{n:"Safehold Inc",lp:14.52,ap:18.2113,cb:17.4047,sh:600,tg:"LANDLORD",cat:"REIT",divTTM:0.71,dy:0.0488,yoc:0.038987,pnl:-0.165744,pnlAbs:-2214.81,mv:8712,uv:8712,ti:10442.84,d2f:111.46,apc:0.0653,adt:29.28,mc:1.04},
"SCHD":{n:"Schwab US Dividend Equity ETF",lp:30.8,ap:30.3294,cb:29.5598,sh:6000,tg:"YO",cat:"ETF",dy:0.0341,pnl:0.041955,pnlAbs:2823.72,mv:184800,uv:184800,ti:177358.88,apc:0.1107,adt:204.6},
"SHUR":{n:"Shurgard Self Storage Ltd",c:"EUR",fx:1.14635,lp:27.25,ap:28.064,cb:28.064,sh:400,tg:"LANDLORD",cat:"REIT",pnl:-0.029006,pnlAbs:-325.61,mv:10900,uv:12495.22,ti:12868.48,apc:-0.0636,mc:3.15},
"SPHD":{n:"Invesco S&P 500 High Div Low Volatility ETF",lp:49.93,ap:48.0513,cb:46.498,sh:200,tg:"YO",cat:"ETF",dy:0.0408,pnl:0.07381,pnlAbs:375.75,mv:9986,uv:9986,ti:9299.6,roe:0.012568,apc:0.0352,adt:8.16},
"SUI":{n:"Sun Communities Inc",lp:134.44,ap:120.13,cb:119.194,sh:100,tg:"LANDLORD",cat:"COMPANY",divTTM:4.06,dy:0.0302,yoc:0.033797,pnl:0.127909,pnlAbs:1431,mv:13444,uv:13444,ti:11919.4,d2f:9.23,apc:0.1008,adt:3.02,mc:16.56},
"TAP":{n:"Molson Coors Beverage Co Class B",lp:43.61,ap:45.4967,cb:45.3682,sh:600,tg:"GORKA",cat:"COMPANY",divTTM:1.88,dy:0.0433,yoc:0.041322,pnl:-0.038753,pnlAbs:-1132.02,mv:26166,uv:26166,ti:27220.9,d2f:2.74,apc:-0.08,adt:25.98,mc:7.78},
"TROW":{n:"T Rowe Price Group Inc",lp:88.59,ap:95.7708,cb:85.229,sh:240,tg:"GORKA",cat:"COMPANY",divTTM:5.08,dy:0.0573,yoc:0.053043,pnl:0.039435,pnlAbs:-1723.4,mv:21261.6,uv:21261.6,ti:20454.95,roe:0.155464,apc:-0.1533,adt:13.752,mc:19.32},
"UNH":{n:"UnitedHealth Group Inc",lp:282.09,ap:199.7796,cb:146.2102,sh:100,tg:"YO",cat:"COMPANY",pnl:0.929346,pnlAbs:8231.04,mv:28209,uv:28209,ti:14621.02,apc:-0.1614,mc:256.05},
"VICI":{n:"VICI Properties Inc",lp:28.42,ap:28.5043,cb:28.3745,sh:1200,tg:"YO",cat:"REIT",dy:0.0621,yoc:0.002189,pnl:0.001602,pnlAbs:-101.15,mv:34104,uv:34104,ti:34049.45,d2f:7.21,apc:0.0096,adt:74.52,mc:30.38},
"WEEL":{n:"Peerless Option Income Wheel ETF",lp:20.12,ap:20.3408,cb:19.0508,sh:1000,tg:"YO",cat:"ETF",dy:0.1267,pnl:0.056123,pnlAbs:-220.82,mv:20120,uv:20120,ti:19050.82,roe:0.749395,apc:0.001,adt:126.7},
"WEN":{n:"Wendy's Co",lp:7.17,ap:9.0352,cb:8.8912,sh:700,tg:"YO",cat:"COMPANY",divTTM:0.67,dy:0.0781,yoc:0.074155,pnl:-0.193581,pnlAbs:-1305.61,mv:5019,uv:5019,ti:6223.81,d2f:10.11,apc:-0.1224,adt:54.67,mc:1.36},
"WKL":{n:"Wolters Kluwer NV",c:"EUR",fx:1.14635,lp:67.26,ap:67.3153,cb:67.3153,sh:200,tg:"GORKA",cat:"COMPANY",pnl:-0.000821,pnlAbs:-11.05,mv:13452,uv:15420.7,ti:15433.37,apc:-0.2353,mc:17.72},
"WPC":{n:"W.p. Carey Inc",lp:71.49,ap:57.2036,cb:53.8011,sh:200,tg:"LANDLORD",cat:"REIT",divTTM:3.62,dy:0.0506,yoc:0.063283,pnl:0.328784,pnlAbs:2857.28,mv:14298,uv:14298,ti:10760.22,roe:0.136217,d2f:4.04,apc:0.1022,adt:10.12,mc:15.67},
"XYZ":{n:"Block Inc",lp:59.79,ap:162.0892,cb:147.3472,sh:50,tg:"YO",cat:"COMPANY",pnl:-0.594224,pnlAbs:-5114.96,mv:2989.5,uv:2989.5,ti:7367.36,apc:-0.0823,mc:35.82},
"YYY":{n:"Amplify CEF High Income ETF",lp:11.15,ap:15.5439,cb:10.8321,sh:192,tg:"CEF",cat:"ETF",pnl:0.029345,pnlAbs:-843.62,mv:2140.8,uv:2140.8,ti:2079.77,apc:-0.0346},
"ZTS":{n:"Zoetis Inc",lp:115.62,ap:118.4,cb:118.4,sh:100,tg:"GORKA",cat:"COMPANY",dy:0.0176,yoc:0.000149,pnl:-0.02348,pnlAbs:-278,mv:11562,uv:11562,ti:11840,roe:0.666726,apc:-0.0818,adt:1.76,mc:48.81},
};

// Build positions from POS_STATIC (CARTERA sheet) — the source of truth for shares, prices, USD values
function buildPositionsFromCB() {
  const result = {};
  for (const [ticker, st] of Object.entries(POS_STATIC)) {
    // Get CB income data (dividends and options totals)
    const txns = CB_EXPANDED[ticker] || [];
    let totalDivs = 0, totalOptCredit = 0;
    txns.forEach(t => {
      if (t.type === "dividend") totalDivs += (t.divTotal||0);
      if (t.type === "option") totalOptCredit += (t.optCreditTotal||0);
    });
    result[ticker] = {
      list: st.ls || "portfolio", name: st.n || ticker,
      shares: st.sh || 0,           // from CARTERA
      lastPrice: st.lp || 0,        // avg price in local currency
      avgCost: st.ap || st.cb || 0,  // avg cost in local currency
      adjustedBasis: st.cb || 0,     // cost basis in local currency
      currency: st.c || "USD", fx: st.fx || 1, tags: st.tg || "", category: st.cat || "",
      // Pre-computed USD values from CARTERA (already FX-converted correctly)
      usdValue: st.uv || 0, marketValue: st.mv || 0, totalInvertido: st.ti || 0,
      pnlPct: st.pnl || 0, pnlAbs: st.pnlAbs || 0,
      // Dividends
      dps: st.dps || 0, divTTM: st.divTTM || 0, divYieldTTM: st.dy || 0,
      yoc: st.yoc || 0, annualDivTotal: st.adt || 0,
      // CB income
      totalDivs, totalOptCredit, hasCB: txns.length > 0,
    };
  }
  return result;
}

  const [positions, setPositions] = useState(() => buildPositionsFromCB());
  const [editingPos, setEditingPos] = useState(null); // ticker being edited
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesLastUpdate, setPricesLastUpdate] = useState(null);

  // ── Live Price Refresh ──
  const refreshPrices = useCallback(async (force = false) => {
    setPricesLoading(true);
    try {
      const tickers = Object.keys(POS_STATIC).filter(t => {
        const st = POS_STATIC[t];
        return (st.ls || "portfolio") !== "historial" && (st.sh || 0) > 0;
      });
      const url = `${API_URL}/api/prices?tickers=${tickers.join(",")}&${force ? "refresh=1" : ""}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Price API error");
      const data = await resp.json();
      if (data.prices && Object.keys(data.prices).length > 0) {
        setPositions(prev => {
          const updated = { ...prev };
          for (const [ticker, priceData] of Object.entries(data.prices)) {
            if (updated[ticker]) {
              const p = updated[ticker];
              const newPrice = priceData.price || p.lastPrice || 0;
              const shares = p.shares || 0;
              const fx = p.fx || 1;
              // USD value: for USD stocks it's price*shares, for foreign it's price*shares*fx
              const ccy = p.currency || "USD";
              const newUsdValue = ccy === "USD" ? newPrice * shares 
                : ccy === "GBX" ? (newPrice / 100) * shares * fx  // GBX = pence, convert to GBP then to USD
                : newPrice * shares * fx;
              // Recalculate P&L
              const totalInvested = p.totalInvertido || (p.avgCost || 0) * shares * (ccy === "USD" ? 1 : fx);
              const pnlAbs = newUsdValue - totalInvested;
              const pnlPct = totalInvested > 0 ? (pnlAbs / totalInvested) : 0;
              updated[ticker] = {
                ...p,
                lastPrice: newPrice,
                usdValue: newUsdValue,
                marketValue: newPrice * shares,
                pnlAbs, pnlPct,
                dayChange: priceData.changePct || 0,
                dayChangeAbs: priceData.change || 0,
                fiftyTwoWeekHigh: priceData.fiftyTwoWeekHigh,
                fiftyTwoWeekLow: priceData.fiftyTwoWeekLow,
                priceUpdated: true,
              };
            }
          }
          return updated;
        });
        setPricesLastUpdate(data.updated || new Date().toISOString());
      }
    } catch(e) { console.error("Price refresh error:", e); }
    setPricesLoading(false);
  }, []);

  // Auto-refresh prices after initial data load
  useEffect(() => {
    if (dataLoaded) refreshPrices();
  }, [dataLoaded, refreshPrices]);

  // ── Currency & FX State ──
  const [displayCcy, setDisplayCcy] = useState("USD"); // global display currency
  const [fxRates, setFxRates] = useState(DEFAULT_FX);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxLastUpdate, setFxLastUpdate] = useState(null);
  const [fxError, setFxError] = useState(null);

  const [pendingAutoLoad, setPendingAutoLoad] = useState(null); // ticker to auto-load from FMP

  const openAnalysis = useCallback(async (ticker) => {
    const t = ticker.toUpperCase();
    const saved = await loadCompanyFromStorage(t);
    if (saved?.fin && Object.values(saved.fin).some(y => y.revenue > 0)) {
      // Has saved data with actual financials — use it
      setFin(() => {
        const merged = {};
        YEARS.forEach(y => { merged[y] = {revenue:0,grossProfit:0,operatingIncome:0,netIncome:0,eps:0,dps:0,sharesOut:0,totalDebt:0,cash:0,equity:0,retainedEarnings:0,ocf:0,capex:0,interestExpense:0,depreciation:0,taxProvision:0}; });
        Object.keys(saved.fin).forEach(y => { merged[parseInt(y)] = saved.fin[parseInt(y)]; });
        return merged;
      });
      if (saved.cfg) setCfg(prev => ({...prev, ...saved.cfg, riskFree:prev.riskFree, marketPremium:prev.marketPremium, taxRate:prev.taxRate, useWACC:prev.useWACC, manualDiscount:prev.manualDiscount, manualGrowth:prev.manualGrowth}));
      if (saved.comps) setComps(saved.comps);
      if (saved.ssd) setSsd(prev => ({...prev, ...saved.ssd}));
      if (saved.fmpExtra) setFmpExtra(prev => ({...prev, ...saved.fmpExtra}));
      if (saved.savedAt) setLastSaved(saved.savedAt);
      setPendingAutoLoad(null);
    } else {
      // No saved data — flag for auto-load after render
      setCfg(prev => ({...prev, ticker: t, name: t}));
      setPendingAutoLoad(t);
    }
    setTab("dash");
    setViewMode("analysis");
    setFmpError(null);
  }, []);

  const goHome = useCallback(() => setViewMode("home"), []);

  const openCostBasis = useCallback((ticker) => {
    setCbTicker(ticker.toUpperCase());
    setViewMode("costbasis");
  }, []);

  // ── Transaction Storage for Cost Basis ──
  const [cbTransactions, setCbTransactions] = useState([]);
  const [cbLoading, setCbLoading] = useState(false);

  // Load transactions for a ticker from shared storage, fallback to pre-loaded data
  // Sanitize transactions — auto-fix common data errors
  const sanitizeTransactions = (txns) => {
    let fixed = false;
    const clean = txns.map(t => {
      if (t.type === "dividend") {
        const shares = t.shares || t._totalShares || 1;
        // Specific fix: ARE 2025-01-28 — dps=1.88, divTotal=106.38 (user confirmed)
        if (t.date === "2025-01-28" && ((t.dps !== undefined && Math.abs(t.dps) < 0.05) || (t.dps > 50))) {
          fixed = true;
          return { ...t, dps: 1.88, divTotal: 106.38 };
        }
        // General fix: if DPS > 50 and divTotal < 10, fields are swapped
        // The small number is the real DPS per share
        if (t.dps && t.divTotal && Math.abs(t.dps) > 50 && Math.abs(t.divTotal) < 10) {
          const realDps = t.divTotal;
          fixed = true;
          return { ...t, dps: realDps, divTotal: realDps * shares };
        }
      }
      return t;
    });
    return { txns: clean, fixed };
  };

  const loadTransactions = useCallback(async (ticker) => {
    if (!ticker) return [];
    let txns = [];
    // Try shared storage first
    if (storageAvailable()) {
      try {
        const result = await window.storage.get(`cb:${ticker.toUpperCase()}`, true);
        if (result?.value) {
          const stored = JSON.parse(result.value);
          if (stored.length > 0) txns = stored;
        }
      } catch(e) {}
    }
    // Fallback to pre-loaded data
    if (!txns.length) {
      txns = CB_EXPANDED[ticker.toUpperCase()] || CB_EXPANDED[ticker] || [];
      if (txns.length > 0 && storageAvailable()) {
        try { await window.storage.set(`cb:${ticker.toUpperCase()}`, JSON.stringify(txns), true); } catch(e) {}
      }
    }
    // Fallback to API (cost_basis table in D1)
    if (!txns.length) {
      try {
        const resp = await fetch(`${API_URL}/api/costbasis?ticker=${encodeURIComponent(ticker.toUpperCase())}`);
        if (resp.ok) {
          const apiData = await resp.json();
          if (apiData.length > 0) {
            txns = apiData.map((r, i) => ({
              id: r.id || `${ticker}_api_${i}`,
              date: r.fecha || "", type: r.tipo === "EQUITY" ? (r.shares > 0 ? "buy" : "sell") : r.tipo === "DIVIDENDS" ? "dividend" : r.tipo === "OPTION" ? "option" : "fee",
              shares: Math.abs(r.shares || 0), price: r.precio || 0, fees: r.comision || 0, cost: r.coste || 0,
              optExpiry: r.opt_expiry || "", optType: r.opt_tipo || "", optStatus: r.opt_status || "",
              optContracts: r.opt_contracts || 0, optStrike: r.opt_strike || 0, optCredit: r.opt_credit || 0, optCreditTotal: r.opt_credit_total || 0,
              dps: r.dps || 0, divTotal: r.div_total || 0,
              _balance: r.balance || 0, _totalShares: r.total_shares || 0, _adjustedBasis: r.adjusted_basis || 0,
              _adjustedBasisPct: r.adjusted_basis_pct || 0, _divYieldBasis: r.div_yield_basis || 0,
            }));
            console.log(`CB loaded ${txns.length} txns from API for ${ticker}`);
            // Cache in storage
            if (storageAvailable()) {
              try { await window.storage.set(`cb:${ticker.toUpperCase()}`, JSON.stringify(txns), true); } catch(e) {}
            }
          }
        }
      } catch(e) { console.warn("CB API error:", e); }
    }
    // Auto-fix data errors
    const { txns: cleaned, fixed } = sanitizeTransactions(txns);
    if (fixed && storageAvailable()) {
      try { await window.storage.set(`cb:${ticker.toUpperCase()}`, JSON.stringify(cleaned), true); } catch(e) {}
    }
    return cleaned;
  }, []);

  // Save transactions for a ticker to shared storage
  const saveTransactions = useCallback(async (ticker, txns) => {
    if (!storageAvailable() || !ticker) return;
    try {
      await window.storage.set(`cb:${ticker.toUpperCase()}`, JSON.stringify(txns), true);
    } catch(e) { console.warn("CB save error:", e); }
  }, []);

  // Load transactions when entering cost basis view
  useEffect(() => {
    if (viewMode === "costbasis" && cbTicker) {
      setCbLoading(true);
      loadTransactions(cbTicker).then(txns => {
        setCbTransactions(txns);
        setCbLoading(false);
      });
    }
  }, [viewMode, cbTicker, loadTransactions]);

  // Add a transaction
  const addTransaction = useCallback((txn) => {
    setCbTransactions(prev => {
      const next = [...prev, { ...txn, id: Date.now().toString(36) + Math.random().toString(36).slice(2,6) }];
      next.sort((a,b) => new Date(b.date) - new Date(a.date));
      saveTransactions(cbTicker, next);
      return next;
    });
  }, [cbTicker, saveTransactions]);

  // Delete a transaction
  const deleteTransaction = useCallback((id) => {
    setCbTransactions(prev => {
      const next = prev.filter(t => t.id !== id);
      saveTransactions(cbTicker, next);
      return next;
    });
  }, [cbTicker, saveTransactions]);

  // Recalculate portfolio position when CB transactions change
  useEffect(() => {
    if (!cbTicker || cbTransactions.length === 0) return;
    // Get last txn with _totalShares
    let finalShares = 0, adjBasis = 0;
    for (let i = cbTransactions.length - 1; i >= 0; i--) {
      if (cbTransactions[i]._totalShares) {
        finalShares = cbTransactions[i]._totalShares;
        adjBasis = Math.abs(cbTransactions[i]._adjustedBasis || 0);
        break;
      }
    }
    let totalCost = 0, totalBought = 0, totalDivs = 0, totalOptCredit = 0;
    cbTransactions.forEach(t => {
      if (t.type === "buy") { totalCost += (t.shares||0) * (t.price||0); totalBought += (t.shares||0); }
      if (t.type === "dividend") totalDivs += (t.divTotal||0);
      if (t.type === "option") totalOptCredit += (t.optCreditTotal||0);
    });
    const avgCost = totalBought > 0 ? totalCost / totalBought : adjBasis;
    // Update position with CB-derived values
    setPositions(prev => {
      const existing = prev[cbTicker] || {};
      return {...prev, [cbTicker]: {...existing, shares: finalShares, avgCost, adjustedBasis: adjBasis, totalDivs, totalOptCredit, hasCB: true}};
    });
  }, [cbTransactions, cbTicker]);

  // Import transactions from JSON (single ticker or bulk all-tickers)
  const importTransactions = useCallback(async (jsonData) => {
    try {
      const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      // Check if this is bulk format (all tickers at once): { "DEO": { meta, transactions }, "GEO": { ... } }
      const firstKey = Object.keys(parsed)[0];
      if (firstKey && parsed[firstKey]?.transactions && parsed[firstKey]?.meta) {
        // Bulk import — save each ticker separately
        let count = 0;
        for (const [ticker, data] of Object.entries(parsed)) {
          if (data.transactions?.length) {
            await saveTransactions(ticker, data.transactions);
            count++;
          }
        }
        // If we're currently viewing a ticker that was in the import, reload it
        if (cbTicker && parsed[cbTicker]?.transactions) {
          setCbTransactions(parsed[cbTicker].transactions);
        }
        alert(`Importadas ${count} empresas con transacciones.`);
        return;
      }
      
      // Single ticker format: array of transactions or { transactions: [...] }
      const txns = Array.isArray(parsed) ? parsed : (parsed.transactions || []);
      setCbTransactions(txns);
      saveTransactions(cbTicker, txns);
    } catch(e) { console.warn("Import error:", e); alert("Error al importar: " + e.message); }
  }, [cbTicker, saveTransactions]);

  const updatePosition = useCallback((ticker, data) => {
    setPositions(prev => {
      const next = {...prev, [ticker.toUpperCase()]: {...(prev[ticker.toUpperCase()]||{list:"portfolio"}), ...data}};
      return next;
    });
  }, []);

  const removePosition = useCallback((ticker) => {
    setPositions(prev => {
      const next = {...prev}; delete next[ticker.toUpperCase()];
      return next;
    });
  }, []);

  const portfolioList = useMemo(() => Object.entries(positions).filter(([,v])=>v.list==="portfolio").map(([k,v])=>({ticker:k,...v})), [positions]);
  const watchlistList = useMemo(() => Object.entries(positions).filter(([,v])=>v.list==="watchlist").map(([k,v])=>({ticker:k,...v})), [positions]);
  
  // Historical positions: from DB holdings + POS_STATIC entries marked as historial
  const [historialList] = useState(() => {
    const fromDB = HIST_INIT.map(h => ({
      ticker: h.t, name: h.t, shares: h.s||0, adjustedBasis: 0,
      totalDivs: h.d||0, totalOptCredit: h.o||0, txnCount: h.n||0,
      currency: "USD", hasCB: true, list: "historial"
    }));
    const fromStatic = Object.entries(POS_STATIC).filter(([,v]) => v.ls === "historial").map(([k,v]) => ({
      ticker: k, name: v.n||k, shares: v.sh||0, adjustedBasis: v.cb||0,
      totalDivs: 0, totalOptCredit: 0, txnCount: 0, pnlAbs: v.pnlAbs||0,
      currency: v.c||"USD", hasCB: true, list: "historial"
    }));
    // Merge: static entries take priority (they have more data)
    const dbTickers = new Set(fromDB.map(h => h.ticker));
    const merged = [...fromStatic, ...fromDB.filter(h => !fromStatic.find(s => s.ticker === h.ticker))];
    return merged;
  });
  
  // ── Dividend Log (replaces DIVIDENDOS Google Sheet) ──
  const [divLog, setDivLog] = useState([]);
  const [divLoading, setDivLoading] = useState(false);
  const [divShowForm, setDivShowForm] = useState(false);
  const [divForm, setDivForm] = useState({date:"",ticker:"",company:"",gross:0,taxPct:30,net:0,currency:"USD",fx:1,broker:"IB",shares:0,dps:0,note:""});
  const [divFilter, setDivFilter] = useState({year:"all",month:"all",ticker:""});
  const [divSort, setDivSort] = useState({col:"date",asc:false});
  const [fireCcy, setFireCcy] = useState("EUR"); // EUR or USD toggle for FIRE tab
  const [divCalYear, setDivCalYear] = useState(new Date().getFullYear().toString());
  
  const loadDivLog = useCallback(async () => {
    const hardcoded = expandDivInit();
    if (hardcoded.length > 0) { setDivLog(hardcoded); return; }
    if (!storageAvailable()) { setDivLog([]); return; }
    setDivLoading(true);
    try {
      const result = await window.storage.get("dividends:log", true);
      if (result?.value) {
        const stored = JSON.parse(result.value);
        if (stored.length > 0) { setDivLog(stored); setDivLoading(false); return; }
      }
    } catch(e) {}
    setDivLog(hardcoded);
    setDivLoading(false);
  }, [dataLoaded]);
  
  const saveDivLog = useCallback(async (entries) => {
    if (!storageAvailable()) return;
    try { await window.storage.set("dividends:log", JSON.stringify(entries), true); } catch(e) {}
  }, []);
  
  const addDivEntry = useCallback((entry) => {
    setDivLog(prev => {
      const next = [...prev, {...entry, id: Date.now().toString(36)+Math.random().toString(36).slice(2,5)}];
      next.sort((a,b) => b.date.localeCompare(a.date));
      saveDivLog(next);
      return next;
    });
    setDivShowForm(false);
  }, [saveDivLog]);
  
  const deleteDivEntry = useCallback((id) => {
    setDivLog(prev => {
      const next = prev.filter(d => d.id !== id);
      saveDivLog(next);
      return next;
    });
  }, [saveDivLog]);
  
  // Load dividends when tab opens OR when data first loads from API
  useEffect(() => {
    if (dataLoaded && divLog.length === 0) loadDivLog();
  }, [dataLoaded, loadDivLog]);
  useEffect(() => {
    if ((homeTab === "dividendos" || homeTab === "fire") && divLog.length === 0) loadDivLog();
  }, [homeTab, divLog.length, loadDivLog]);
  
  // ── Gastos Log (replaces GASTOS Google Sheets) ──
  const [gastosLog, setGastosLog] = useState([]);
  const [gastosLoading, setGastosLoading] = useState(false);
  const [gastosShowForm, setGastosShowForm] = useState(false);
  const [gastosForm, setGastosForm] = useState({date:"",cat:"Comidas y Cenas",amount:0,currency:"EUR",recur:false,detail:""});
  const [gastosFilter, setGastosFilter] = useState({year:"all",cat:"all",month:"all"});
  
  const GASTO_CAT_LIST = ["Comidas y Cenas","SuperMercado","Viajes, Billetes y Hoteles","Alquiler","Ropa","Deportes & Hobby's","Transporte, cargas, gasolina, Parking.","Medicos y Salud","Healthcare","Subscripciones Casa","Subscripciones Bolsa","Utility's Costa Brava","Utilities China","Caprichos","Barco","Masajes","Home","Entretenimiento","Regalos","Coche, (seguros, permisos, mantenimiento )","Other"];
  
  const loadGastos = useCallback(async () => {
    const hardcoded = expandGastosInit();
    if (hardcoded.length > 0) { setGastosLog(hardcoded); return; }
    if (!storageAvailable()) { setGastosLog([]); return; }
    setGastosLoading(true);
    try {
      const result = await window.storage.get("gastos:log", true);
      if (result?.value) {
        const stored = JSON.parse(result.value);
        if (stored.length > 0) { setGastosLog(stored); setGastosLoading(false); return; }
      }
    } catch(e) {}
    setGastosLog(hardcoded);
    setGastosLoading(false);
  }, [dataLoaded]);
  
  const saveGastos = useCallback(async (entries) => {
    if (!storageAvailable()) return;
    try { await window.storage.set("gastos:log", JSON.stringify(entries), true); } catch(e) {}
  }, []);
  
  const addGasto = useCallback((entry) => {
    setGastosLog(prev => {
      const next = [...prev, {...entry, id: "g_"+Date.now().toString(36), amount: -Math.abs(entry.amount)}];
      next.sort((a,b) => b.date.localeCompare(a.date));
      saveGastos(next);
      return next;
    });
    setGastosShowForm(false);
  }, [saveGastos]);
  
  const deleteGasto = useCallback((id) => {
    setGastosLog(prev => { const next = prev.filter(g => g.id !== id); saveGastos(next); return next; });
  }, [saveGastos]);
  
  useEffect(() => {
    if (dataLoaded && gastosLog.length === 0) loadGastos();
  }, [dataLoaded, loadGastos]);
  useEffect(() => {
    if (homeTab === "gastos" && gastosLog.length === 0) loadGastos();
  }, [homeTab, gastosLog.length, loadGastos]);
  
  // ── Control Mensual (monthly patrimony snapshots) ──
  const [ctrlLog, setCtrlLog] = useState(() => CTRL_DATA.map((c,i) => ({...c, id: "ct_"+i})));
  const [ctrlShowForm, setCtrlShowForm] = useState(false);
  const [ctrlForm, setCtrlForm] = useState({date:"",fx:1.1,bankinter:0,bcCaminos:0,constructionBank:0,revolut:0,otrosBancos:0,ibUsd:0,tsUsd:0,tastyUsd:0,fondos:0,cryptoEur:0,sueldo:0,hipoteca:0});
  
  // Refresh ctrlLog when API data arrives
  useEffect(() => {
    if (dataLoaded && CTRL_DATA.length > 0 && ctrlLog.length === 0) {
      setCtrlLog(CTRL_DATA.map((c,i) => ({...c, id: "ct_"+i})));
    }
  }, [dataLoaded]);

  const loadCtrlLog = useCallback(async () => {
    if (CTRL_DATA.length > 0) { setCtrlLog(CTRL_DATA.map((c,i) => ({...c, id: "ct_"+i}))); return; }
    if (!storageAvailable()) return;
    try {
      const result = await window.storage.get("control:log", true);
      if (result?.value) {
        const stored = JSON.parse(result.value);
        if (stored.length > 0) { setCtrlLog(stored); return; }
      }
    } catch(e) {}
    // First load — save hardcoded data
    const initial = CTRL_DATA.map((c,i) => ({...c, id: "ct_"+i}));
    try { await window.storage.set("control:log", JSON.stringify(initial), true); } catch(e) {}
  }, []);
  
  const addCtrlEntry = useCallback((entry) => {
    setCtrlLog(prev => {
      // Compute totals
      const totalBancos = (entry.bankinter||0) + (entry.bcCaminos||0) + (entry.constructionBank||0) + (entry.revolut||0) + (entry.otrosBancos||0);
      const totalBrokersUsd = (entry.ibUsd||0) + (entry.tsUsd||0) + (entry.tastyUsd||0);
      const totalBancosUsd = totalBancos * (entry.fx||1);
      const cryptoUsd = (entry.cryptoEur||0) * (entry.fx||1);
      const fondosUsd = (entry.fondos||0) * (entry.fx||1);
      const totalPatUsd = totalBancosUsd + totalBrokersUsd + fondosUsd + cryptoUsd;
      const totalPatEur = totalPatUsd / (entry.fx||1);
      
      const newEntry = {
        id: "ct_"+Date.now().toString(36),
        d: entry.date, fx: entry.fx,
        bk: totalBancos, br: totalBrokersUsd,
        fd: entry.fondos||0, cr: entry.cryptoEur||0,
        hp: entry.hipoteca||0, sl: entry.sueldo||0,
        pu: Math.round(totalPatUsd), pe: Math.round(totalPatEur),
        // Detail fields for editing
        bankinter: entry.bankinter, bcCaminos: entry.bcCaminos,
        constructionBank: entry.constructionBank, revolut: entry.revolut,
        otrosBancos: entry.otrosBancos, ibUsd: entry.ibUsd,
        tsUsd: entry.tsUsd, tastyUsd: entry.tastyUsd,
      };
      const next = [...prev, newEntry].sort((a,b) => (b.d||"").localeCompare(a.d||""));
      if (storageAvailable()) window.storage.set("control:log", JSON.stringify(next), true).catch(()=>{});
      return next;
    });
    setCtrlShowForm(false);
  }, []);
  
  const deleteCtrlEntry = useCallback((id) => {
    setCtrlLog(prev => {
      const next = prev.filter(c => c.id !== id);
      if (storageAvailable()) window.storage.set("control:log", JSON.stringify(next), true).catch(()=>{});
      return next;
    });
  }, []);
  
  useEffect(() => {
    if (homeTab === "control") loadCtrlLog();
  }, [homeTab, loadCtrlLog]);
  
  // Historial now loaded from HIST_INIT (pre-computed from Cost Basis data)

  // ── Portfolio: compute everything properly with FX ──
  // Logic: each position has prices in its ORIGINAL currency (USD, EUR, AUD, HKD, GBX, CAD).
  // Step 1: convert to USD (the investment standard)
  // Step 2: also show EUR equivalent (user's personal/home currency)
  // The FX field in positions = rate to convert original currency → USD
  // For live rates we use fxRates from API instead.
  
  const toUSD = useCallback((amount, fromCcy) => {
    if(amount == null || isNaN(amount)) return 0;
    if(fromCcy === "USD") return amount;
    return convertCcy(amount, fromCcy, "USD", fxRates) || 0;
  }, [fxRates]);
  
  const toEUR = useCallback((amountUSD) => {
    if(amountUSD == null || isNaN(amountUSD)) return 0;
    return amountUSD * (fxRates.EUR || 0.92);
  }, [fxRates]);

  const portfolioComputed = useMemo(() => {
    return portfolioList.map(p => {
      // Use pre-computed USD values from CARTERA sheet (already FX-correct)
      const valueUSD = p.usdValue || 0;
      const costTotalUSD = p.totalInvertido || 0;
      const pnlUSD = valueUSD - costTotalUSD;
      const pnlPct = p.pnlPct || (costTotalUSD !== 0 ? pnlUSD / Math.abs(costTotalUSD) : 0);
      const divAnnualUSD = p.annualDivTotal || ((p.divTTM || 0) * (p.shares || 0)) || 0;
      
      // EUR equivalents
      const valueEUR = toEUR(valueUSD);
      const costTotalEUR = toEUR(costTotalUSD);
      const divAnnualEUR = toEUR(divAnnualUSD);
      
      const ccy = p.currency || "USD";
      
      return { 
        ...p, ccy,
        priceUSD: ccy === "USD" ? (p.lastPrice||0) : (valueUSD / (p.shares||1)),
        costUSD: costTotalUSD / (p.shares||1),
        valueUSD, costTotalUSD, divAnnualUSD,
        pnlUSD, pnlPct,
        valueEUR, costTotalEUR, divAnnualEUR,
      };
    });
  }, [portfolioList, toEUR]);

  const portfolioTotals = useMemo(() => {
    let totalValueUSD = 0, totalCostUSD = 0, totalDivUSD = 0;
    let totalValueEUR = 0, totalCostEUR = 0, totalDivEUR = 0;
    portfolioComputed.forEach(p => {
      totalValueUSD += p.valueUSD;
      totalCostUSD += p.costTotalUSD;
      totalDivUSD += p.divAnnualUSD;
      totalValueEUR += p.valueEUR;
      totalCostEUR += p.costTotalEUR;
      totalDivEUR += p.divAnnualEUR;
    });
    const withWeight = portfolioComputed.map(p => ({
      ...p,
      weight: totalValueUSD > 0 ? p.valueUSD / totalValueUSD : 0,
    }));
    const pnlUSD = totalValueUSD - totalCostUSD;
    const pnlEUR = totalValueEUR - totalCostEUR;
    return {
      positions: withWeight,
      totalValueUSD, totalCostUSD, totalDivUSD,
      totalValueEUR, totalCostEUR, totalDivEUR,
      pnlUSD, pnlPctUSD: totalCostUSD !== 0 ? pnlUSD / Math.abs(totalCostUSD) : 0,
      pnlEUR, pnlPctEUR: totalCostEUR !== 0 ? pnlEUR / Math.abs(totalCostEUR) : 0,
      yocUSD: totalCostUSD > 0 ? totalDivUSD / totalCostUSD : 0,
      yieldUSD: totalValueUSD > 0 ? totalDivUSD / totalValueUSD : 0,
      count: portfolioList.length,
    };
  }, [portfolioComputed, portfolioList.length]);

  // ── Load cached settings on mount (non-blocking) ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!storageAvailable()) return;
      try {
        // Load display currency preference
        const ccyResult = await window.storage.get("settings:display_ccy");
        if (mounted && ccyResult?.value) setDisplayCcy(ccyResult.value);
      } catch(e) {}
      try {
        // Load cached FX rates
        const fxResult = await window.storage.get("settings:fx_rates");
        if (mounted && fxResult?.value) {
          const cached = JSON.parse(fxResult.value);
          if (cached.rates) { setFxRates(cached.rates); setFxLastUpdate(cached.updatedAt); }
        }
      } catch(e) {}
    })();
    return () => { mounted = false; };
  }, []);

  // ── Fetch FX rates in background (separate effect, delayed, non-blocking) ──
  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(async () => {
      if (!mounted) return;
      setFxLoading(true);
      try {
        const fresh = await fetchFxRates();
        if (mounted && fresh) {
          setFxRates(prev => ({...prev, ...fresh}));
          const now = new Date().toISOString();
          setFxLastUpdate(now);
          setFxError(null);
          if (storageAvailable()) {
            window.storage.set("settings:fx_rates", JSON.stringify({rates: fresh, updatedAt: now})).catch(()=>{});
          }
        }
      } catch(e) {
        if (mounted) setFxError("No se pudieron cargar tipos de cambio");
      } finally {
        if (mounted) setFxLoading(false);
      }
    }, 3000); // Wait 3s after mount before fetching FX
    return () => { mounted = false; clearTimeout(timer); };
  }, []);

  // ── Currency display helpers ──
  const switchDisplayCcy = useCallback((ccy) => {
    setDisplayCcy(ccy);
    if (storageAvailable()) {
      window.storage.set("settings:display_ccy", ccy).catch(()=>{});
    }
  }, []);

  const refreshFxRates = useCallback(async () => {
    setFxLoading(true);
    setFxError(null);
    try {
      const fresh = await fetchFxRates();
      if (fresh) {
        setFxRates(prev => ({...prev, ...fresh}));
        const now = new Date().toISOString();
        setFxLastUpdate(now);
        if (storageAvailable()) {
          window.storage.set("settings:fx_rates", JSON.stringify({rates: fresh, updatedAt: now})).catch(()=>{});
        }
      }
    } catch(e) {
      setFxError("Error actualizando FX");
    } finally {
      setFxLoading(false);
    }
  }, []);

  // Convert a position value to display currency
  const toDisplay = useCallback((amount, fromCcy) => {
    return convertCcy(amount, fromCcy || "USD", displayCcy, fxRates);
  }, [displayCcy, fxRates]);

  // Format amount in display currency
  const fDisplay = useCallback((amount, fromCcy) => {
    const converted = toDisplay(amount, fromCcy);
    if(converted == null || isNaN(converted)) return "—";
    const sym = CURRENCIES[displayCcy]?.symbol || "$";
    if(Math.abs(converted) >= 1e6) return `${sym}${_sf(converted/1e6,1)}T`;
    if(Math.abs(converted) >= 1e3) return `${sym}${_sf(converted/1e3,1)}K`;
    return `${sym}${_sf(converted,2)}`;
  }, [displayCcy, toDisplay]);

  // ── Load company from Claude API (web search) ──
  const loadFromAPI = useCallback(async (tickerOverride) => {
    const t = (tickerOverride || cfg.ticker || "").trim().toUpperCase();
    if (!t) return;
    setFmpLoading(true); setFmpError(null);
    try {
      // Step 1: Load fundamentals from FMP (via worker)
      const data = await fetchViaFMP(t);
      // Merge fin data
      setFin(prev => {
        const merged = {...prev};
        YEARS.forEach(y => { merged[y] = {revenue:0,grossProfit:0,operatingIncome:0,netIncome:0,eps:0,dps:0,sharesOut:0,totalDebt:0,cash:0,equity:0,retainedEarnings:0,ocf:0,capex:0,interestExpense:0,depreciation:0,taxProvision:0}; });
        Object.keys(data.fin).forEach(y => { merged[parseInt(y)] = data.fin[parseInt(y)]; });
        return merged;
      });
      setCfg(prev => ({
        ...prev,
        ticker: data.cfg.ticker || prev.ticker,
        name: data.cfg.name || prev.name,
        price: data.cfg.price || prev.price,
        beta: data.cfg.beta || prev.beta,
        currency: data.cfg.currency || prev.currency,
      }));
      // v10.2: Store new FMP data
      setFmpExtra({
        rating: data.fmpRating || {},
        dcf: data.fmpDCF || {},
        estimates: data.fmpEstimates || [],
        priceTarget: data.fmpPriceTarget || {},
        keyMetrics: data.fmpKeyMetrics || [],
        finGrowth: data.fmpFinGrowth || [],
      });
      
      // Step 2: Generate qualitative report via Claude API
      const report = await generateReport(t, data.fin, data.cfg, data.profile || {});
      if (report) {
        setSsd(prev => ({
          ...prev,
          moat: report.moat?.rating || prev.moat,
          moatScore: report.moat?.score || prev.moatScore,
          moatExplanation: report.moat?.explanation || "",
          divSafetyScore: report.dividendSafety?.score || 0,
          divSafetyAssessment: report.dividendSafety?.assessment || "",
          finHealthScore: report.financialHealth?.score || 0,
          finHealthAssessment: report.financialHealth?.assessment || "",
          growthAssessment: report.growth?.assessment || "",
          fcfTrend: report.growth?.fcfTrend || "",
          valuationFairValue: report.valuation?.fairValue || 0,
          valuationMethod: report.valuation?.method || "",
          valuationUpside: report.valuation?.upside || 0,
          valuationAssessment: report.valuation?.assessment || "",
          risks: report.risks || [],
          catalysts: report.catalysts || [],
          verdict: report.verdict?.action || "",
          verdictSummary: report.verdict?.summary || "",
          targetWeight: report.verdict?.targetWeight || "",
          overallScore: report.overallScore || 0,
          reportGenerated: new Date().toISOString(),
        }));
      }
      
      // Save to persistent storage
      const saveData = { fin: data.fin, cfg: data.cfg, comps, ssd, report, fmpExtra: { rating: data.fmpRating, dcf: data.fmpDCF, estimates: data.fmpEstimates, priceTarget: data.fmpPriceTarget, keyMetrics: data.fmpKeyMetrics, finGrowth: data.fmpFinGrowth } };
      await saveCompanyToStorage(t, saveData);
      const idx = await loadPortfolioIndex();
      setPortfolio(idx);
      setLastSaved(new Date().toISOString());
      setFmpLoading(false);
    } catch (err) {
      setFmpError(err.message);
      setFmpLoading(false);
    }
  }, [cfg.ticker, comps, ssd]);

  // Auto-load from FMP when openAnalysis flags a ticker without saved data
  useEffect(() => {
    if (pendingAutoLoad && !fmpLoading) {
      loadFromAPI(pendingAutoLoad);
      setPendingAutoLoad(null);
    }
  }, [pendingAutoLoad, fmpLoading, loadFromAPI]);
  // ── Switch to a saved company from portfolio ──
  const switchCompany = useCallback(async (ticker) => {
    const saved = await loadCompanyFromStorage(ticker);
    if (!saved?.fin) { setFmpError(`No hay datos guardados para ${ticker}`); return; }
    setFin(prev => {
      const merged = {};
      YEARS.forEach(y => { merged[y] = {revenue:0,grossProfit:0,operatingIncome:0,netIncome:0,eps:0,dps:0,sharesOut:0,totalDebt:0,cash:0,equity:0,retainedEarnings:0,ocf:0,capex:0,interestExpense:0,depreciation:0,taxProvision:0}; });
      Object.keys(saved.fin).forEach(y => { merged[parseInt(y)] = saved.fin[parseInt(y)]; });
      return merged;
    });
    if (saved.cfg) setCfg(prev => ({...prev, ...saved.cfg, riskFree: prev.riskFree, marketPremium: prev.marketPremium, taxRate: prev.taxRate, useWACC: prev.useWACC, manualDiscount: prev.manualDiscount, manualGrowth: prev.manualGrowth}));
    if (saved.comps) setComps(saved.comps);
    if (saved.ssd) setSsd(prev => ({...prev, ...saved.ssd}));
    setLastSaved(saved.savedAt || null);
    setFmpError(null);
    setTab("dash");
  }, []);

  // ── Save current state manually ──
  const saveCurrentCompany = useCallback(async () => {
    const t = cfg.ticker?.toUpperCase();
    if (!t) return;
    const saveData = { fin, cfg: {ticker: cfg.ticker, name: cfg.name, price: cfg.price, currency: cfg.currency, beta: cfg.beta}, comps, ssd };
    await saveCompanyToStorage(t, saveData);
    const idx = await loadPortfolioIndex();
    setPortfolio(idx);
    setLastSaved(new Date().toISOString());
  }, [cfg, fin, comps, ssd]);

  // ── Delete company from portfolio ──
  const deleteCompany = useCallback(async (ticker) => {
    await removeCompanyFromStorage(ticker);
    const idx = await loadPortfolioIndex();
    setPortfolio(idx);
  }, []);

  useEffect(()=>{setAnim(true);const t=setTimeout(()=>setAnim(false),600);return()=>clearTimeout(t);},[tab]);

  const upFin = useCallback((y,k,v)=>setFin(p=>({...p,[y]:{...p[y],[k]:parseFloat(v)||0}})),[]);
  const upCfg = useCallback((k,v)=>setCfg(p=>({...p,[k]:v})),[]);

  // ─── Computed Metrics ────────────────────────────
  const comp = useMemo(()=>{
    const c = {};
    YEARS.forEach(y=>{
      const d = fin[y]; if(!d) return;
      const fcf = d.ocf - d.capex;
      const nd = d.totalDebt - d.cash;
      const ebitda = d.operatingIncome + d.depreciation;
      const ev = (cfg.price * (d.sharesOut||1)) + nd;
      c[y] = {
        fcf, netDebt:nd, ebitda, ev,
        gm: div(d.grossProfit, d.revenue),
        om: div(d.operatingIncome, d.revenue),
        nm: div(d.netIncome, d.revenue),
        roe: div(d.netIncome, d.equity),
        roic: div(d.operatingIncome*(1-(cfg.taxRate/100)), d.equity+nd),
        fcfm: div(fcf, d.revenue),
        cfm: div(d.ocf, d.revenue),
        ocfCapex: div(d.ocf, d.capex),
        d2fcf: fcf>0 ? div(nd, fcf) : null,
        ic: div(d.operatingIncome, d.interestExpense),
        nd2cap: div(nd, nd+d.equity),
        d2ebit: d.operatingIncome>0 ? div(nd, d.operatingIncome) : null,
        nd2ocf: d.ocf>0 ? div(nd, d.ocf) : null,
        nd2rev: div(nd, d.revenue),
        int2ocf: div(d.interestExpense, d.ocf),
        eve: ebitda>0 ? div(ev, ebitda) : null,
        pb: div(cfg.price, div(d.equity, d.sharesOut)),
        bvps: div(d.equity, d.sharesOut),
        fcfps: div(fcf, d.sharesOut),
        fcfPayout: fcf>0 ? div(d.dps*d.sharesOut, fcf) : null,
        ePayout: d.netIncome>0 ? div(d.dps*d.sharesOut, d.netIncome) : null,
        // Rule #1: ROIC = Net Income / Invested Capital (Equity + LT Debt - Cash)
        roicR1: div(d.netIncome, d.equity + d.totalDebt - d.cash),
        revps: div(d.revenue, d.sharesOut),
        // Owner Earnings (Buffett) = Net Income + D&A - CapEx
        oe: d.netIncome + d.depreciation - d.capex,
        oeps: div(d.netIncome + d.depreciation - d.capex, d.sharesOut),
      };
    });
    return c;
  },[fin, cfg.price, cfg.taxRate]);

  // Find the most recent year with actual data (FMP data may be 2025, not 2026)
  const latestDataYear = YEARS.find(y => fin[y]?.revenue > 0) || YEARS[0];
  const prevDataYear = YEARS.find(y => y < latestDataYear && fin[y]?.revenue > 0) || YEARS[1];
  
  // DATA_YEARS: only years that have actual financial data, max 10, newest first
  const DATA_YEARS = YEARS.filter(y => fin[y]?.revenue > 0).slice(0, 10);
  // Same but reversed (oldest first) for charts
  const CHART_YEARS = [...DATA_YEARS].reverse();
  const chartLabels = CHART_YEARS.map(y => String(y).slice(2));

  const L = comp[latestDataYear] || {};
  const LD = fin[latestDataYear] || {};
  const PD = fin[prevDataYear] || {};

  // WACC
  const wacc = useMemo(()=>calcWACC({equity:LD.equity,totalDebt:LD.totalDebt,interestExpense:LD.interestExpense,taxRate:cfg.taxRate/100,beta:cfg.beta,riskFreeRate:cfg.riskFree/100,marketPremium:cfg.marketPremium/100}),[LD,cfg]);
  
  const discountRate = cfg.useWACC ? wacc.wacc : (cfg.manualDiscount||10)/100;

  // Growth rate
  const growthCalc = useMemo(()=>calcGrowthRate(LD),[LD]);
  const revYears = YEARS.filter(y=>fin[y]?.revenue>0);
  const revenueCAGR = revYears.length>=2 ? (Math.pow(fin[revYears[0]].revenue / fin[revYears[revYears.length-1]].revenue, 1/(revYears.length-1)) - 1) : 0;
  const estimatedGrowth = cfg.manualGrowth > 0 ? cfg.manualGrowth/100 : Math.min(growthCalc.sustainableGrowth, 0.15);

  // Piotroski
  const piotroski = useMemo(()=>calcPiotroski(LD, PD),[LD, PD]);

  // Altman Z-Score
  const altmanZ = useMemo(()=>calcAltmanZ(LD, cfg.price * (LD.sharesOut||1)),[LD, cfg.price]);

  // Dividend Analysis
  const divAnalysis = useMemo(()=>calcDividendAnalysis(fin, comp, YEARS),[fin, comp]);

  // ROIC vs WACC Spread
  const roicWaccSpread = useMemo(()=>{
    return DATA_YEARS.map(y=>({
      year:y,
      roic:comp[y]?.roic,
      wacc:wacc.wacc,
      spread: comp[y]?.roic != null ? comp[y].roic - wacc.wacc : null,
      createsValue: comp[y]?.roic != null ? comp[y].roic > wacc.wacc : null,
    }));
  },[comp, wacc]);

  // Revenue-to-FCF Waterfall (latest year)
  const waterfall = useMemo(()=>{
    const d = LD;
    if(!d.revenue) return null;
    return [
      {label:"Ventas", value:d.revenue, color:"var(--gold)"},
      {label:"- COGS", value:-(d.revenue - (d.grossProfit||0)), color:"var(--red)"},
      {label:"= B. Bruto", value:d.grossProfit||0, color:"var(--green)", subtotal:true},
      {label:"- OpEx", value:-(d.grossProfit - d.operatingIncome), color:"var(--red)"},
      {label:"= EBIT", value:d.operatingIncome||0, color:"var(--green)", subtotal:true},
      {label:"- Impuestos", value:-(d.taxProvision||0), color:"var(--red)"},
      {label:"- Intereses", value:-(d.interestExpense||0), color:"var(--red)"},
      {label:"+ D&A", value:d.depreciation||0, color:"#64d2ff"},
      {label:"- CapEx", value:-(d.capex||0), color:"var(--red)"},
      {label:"= FCF", value:(d.ocf||0)-(d.capex||0), color:"var(--green)", subtotal:true},
    ];
  },[LD]);

  // DCF
  const dcfCalc = useCallback((g, r)=>{
    const baseFCF = L.fcf || 0;
    if(baseFCF <= 0) return null;
    const tg = 0.025;
    let pvSum = 0;
    let lastFCF = baseFCF;
    for(let i=1;i<=10;i++){
      lastFCF = baseFCF * Math.pow(1+g, i);
      pvSum += lastFCF / Math.pow(1+r, i);
    }
    const tv = (lastFCF*(1+tg))/(r-tg);
    const tvPV = tv / Math.pow(1+r, 10);
    const total = pvSum + tvPV;
    return total / (LD.sharesOut || 1);
  },[L, LD]);

  const dcf = useMemo(()=>{
    if(!L.fcf || L.fcf <= 0) return null;
    const g = estimatedGrowth;
    const r = discountRate;
    const tg = 0.025;
    const projs = [];
    let pvSum = 0;
    for(let i=1;i<=10;i++){
      const fcf = L.fcf * Math.pow(1+g, i);
      const pv = fcf / Math.pow(1+r, i);
      pvSum += pv;
      projs.push({year:YEARS[0]+i, fcf, pv});
    }
    const tv = (projs[9].fcf*(1+tg))/(r-tg);
    const tvPV = tv / Math.pow(1+r, 10);
    const total = pvSum + tvPV;
    const iv = total / (LD.sharesOut||1);
    const mos = 1 - cfg.price/iv;
    const fcfYield = div(L.fcf, cfg.price*(LD.sharesOut||1));
    const per = div(cfg.price*(LD.sharesOut||1), L.fcf);
    return {projs, pvSum, tv, tvPV, total, iv, mos, fcfYield, per};
  },[L, LD, estimatedGrowth, discountRate, cfg.price]);

  // Score
  const scoreItems = useMemo(()=>{
    const items = [
      {cat:"Márgenes",name:"M. Bruto",val:L.gm,rules:R.gm,weight:1},
      {cat:"Márgenes",name:"M. Operativo",val:L.om,rules:R.om,weight:1},
      {cat:"Márgenes",name:"M. Neto",val:L.nm,rules:R.nm,weight:0.8},
      {cat:"Márgenes",name:"M. FCF",val:L.fcfm,rules:R.fcfm,weight:1.2},
      {cat:"Rentabilidad",name:"ROE",val:L.roe,rules:R.roe,weight:1},
      {cat:"Rentabilidad",name:"ROIC",val:L.roic,rules:R.roic,weight:1.5},
      {cat:"Deuda",name:"Deuda/FCF",val:L.d2fcf,rules:R.d2fcf,weight:1.2},
      {cat:"Deuda",name:"Cobertura Int.",val:L.ic,rules:R.ic,weight:1},
      {cat:"Valoración",name:"EV/EBITDA",val:L.eve,rules:R.eve,weight:1.3},
      {cat:"Valoración",name:"Margen Seg.",val:dcf?.mos,rules:R.mos,weight:1.5},
      {cat:"Solidez",name:"Piotroski",val:piotroski.score,rules:R.pio,weight:1.2},
      {cat:"Solidez",name:"Altman Z",val:altmanZ.score,rules:[
        {test:v=>v>2.99,lbl:"Segura",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
        {test:v=>v>1.81,lbl:"Gris",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
        {test:v=>v<=1.81,lbl:"Peligro",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
      ],weight:1},
      {cat:"Crecimiento",name:"CAGR Ventas",val:revenueCAGR,rules:R.growth,weight:1},
    ];
    return items;
  },[L, dcf, piotroski, altmanZ, revenueCAGR]);

  const totalScore = useMemo(()=>{
    const valid = scoreItems.filter(x=>n(x.val)!=null);
    if(!valid.length) return 0;
    const weightedSum = valid.reduce((s,x)=>s+rate(x.val,x.rules).score * (x.weight||1),0);
    const maxWeighted = valid.reduce((s,x)=>s+3*(x.weight||1),0);
    return Math.round((weightedSum / maxWeighted) * 100);
  },[scoreItems]);

  const marketCap = cfg.price * (LD.sharesOut||0);
  const capLabel = marketCap>200e3?"Mega":marketCap>10e3?"Large":marketCap>2e3?"Mid":marketCap>300?"Small":"Micro";

  // ═══ RENDER ═══
  const renderDash = () => {
    const revData = CHART_YEARS.map(y=>fin[y]?.revenue);
    const fcfData = CHART_YEARS.map(y=>comp[y]?.fcf);
    const epsData = CHART_YEARS.map(y=>fin[y]?.eps);
    const labels = chartLabels;
    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        <Card glow>
          <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
            <div style={{width:60,height:60,borderRadius:14,background:"linear-gradient(135deg,#d69e2e 0%,#b8860b 50%,#8B6914 100%)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(214,158,46,.25)"}}>
              <div style={{fontSize:cfg.ticker&&cfg.ticker.length>3?16:20,fontWeight:800,color:"#000",fontFamily:"var(--fm)",letterSpacing:1}}>{(cfg.ticker||"?").slice(0,4)}</div>
            </div>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:22,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>{cfg.name||"Introduce una empresa"}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,flexWrap:"wrap"}}>
                <span style={{fontSize:10,fontWeight:700,color:capLabel==="Mega"||capLabel==="Large"?"var(--green)":capLabel==="Mid"?"var(--yellow)":"var(--orange)",background:capLabel==="Mega"||capLabel==="Large"?"rgba(48,209,88,.10)":capLabel==="Mid"?"rgba(255,214,10,.10)":"rgba(255,159,10,.10)",padding:"2px 8px",borderRadius:20,letterSpacing:.3}}>{capLabel} Cap</span>
                <span style={{fontSize:12,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>${marketCap>=1e6?_sf(marketCap/1e6,1)+"T":marketCap>=1e3?_sf(marketCap/1e3,1)+"B":_sf(marketCap,0)+"M"}</span>
                <span style={{fontSize:11,color:"var(--text-tertiary)"}}>·</span>
                <span style={{fontSize:11,color:"var(--text-secondary)"}}>WACC: {fP(wacc.wacc)}</span>
                <span style={{fontSize:11,color:"var(--text-tertiary)"}}>·</span>
                <span style={{fontSize:11,color:"var(--text-secondary)"}}>Beta: {cfg.beta?.toFixed(2)}</span>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:36,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{fC(cfg.price,cfg.currency==="EUR"?"€":"$")}</div>
              {dcf && <div style={{fontSize:13,fontWeight:600,marginTop:4,color:dcf.mos>0?"var(--green)":"var(--red)"}}>
                Intrínseco: {fC(dcf.iv)} ({dcf.mos>0?"↓":"↑"}{f1(Math.abs(dcf.mos)*100)}%)
              </div>}
              {fmpExtra.rating?.rating && <div style={{display:"flex",gap:6,marginTop:6,alignItems:"center"}}>
                <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>FMP Rating:</span>
                <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:6,fontFamily:"var(--fm)",
                  color:fmpExtra.rating.ratingScore>=4?"#30d158":fmpExtra.rating.ratingScore>=3?"#ffd60a":"#ff453a",
                  background:fmpExtra.rating.ratingScore>=4?"rgba(48,209,88,.1)":fmpExtra.rating.ratingScore>=3?"rgba(255,214,10,.1)":"rgba(255,69,58,.1)",
                  border:`1px solid ${fmpExtra.rating.ratingScore>=4?"rgba(48,209,88,.25)":fmpExtra.rating.ratingScore>=3?"rgba(255,214,10,.25)":"rgba(255,69,58,.25)"}`
                }}>{fmpExtra.rating.rating} ({fmpExtra.rating.ratingScore}/5)</span>
                {fmpExtra.dcf?.dcf > 0 && <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>
                  FMP DCF: {fC(fmpExtra.dcf.dcf)} {fmpExtra.dcf.dcf > cfg.price ? "↑" : "↓"}{f1(Math.abs((1-cfg.price/fmpExtra.dcf.dcf)*100))}%
                </span>}
              </div>}
            </div>
          </div>
          {/* Action buttons */}
          <div style={{display:"flex",gap:8,marginTop:16,paddingTop:14,borderTop:"1px solid rgba(255,255,255,.06)",flexWrap:"wrap",alignItems:"center"}}>
            <label style={{display:"flex",alignItems:"center",gap:6,padding:"7px 16px",background:"rgba(100,210,255,.08)",border:"1px solid rgba(100,210,255,.20)",borderRadius:10,color:"#64d2ff",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fb)",transition:"all .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(100,210,255,.15)";}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(100,210,255,.08)";}}>
              <span>↑</span> Importar JSON
              <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{
                const file = e.target.files[0]; if(!file) return;
                const reader = new FileReader();
                reader.onload = ev => { try { const d = JSON.parse(ev.target.result); if(d.fin) setFin(d.fin); if(d.cfg) setCfg(d.cfg); if(d.comps) setComps(d.comps); if(d.ssd) setSsd(d.ssd); } catch(err){} };
                reader.readAsText(file);
              }}/>
            </label>
            <button onClick={()=>{
              const data = JSON.stringify({fin,cfg,comps,ssd},null,2);
              const blob = new Blob([data],{type:"application/json"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `${cfg.ticker||"empresa"}_analisis.json`; a.click(); URL.revokeObjectURL(url);
            }} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 16px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:10,color:"var(--text-secondary)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fb)",transition:"all .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.08)";e.currentTarget.style.color="var(--text-primary)";}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.04)";e.currentTarget.style.color="var(--text-secondary)";}}>
              <span>↓</span> Exportar
            </button>
            <button
              onClick={()=>generatePDF(cfg, fin, comp, dcf, piotroski, scoreItems, totalScore, wacc, setTab, TABS, null, setPdfState)}
              disabled={pdfState==="loading"}
              style={{display:"flex",alignItems:"center",gap:6,padding:"7px 16px",marginLeft:"auto",background:pdfState==="done"?"rgba(48,209,88,.10)":"var(--gold-dim)",border:`1px solid ${pdfState==="done"?"rgba(48,209,88,.3)":"var(--gold)"}`,borderRadius:10,color:pdfState==="done"?"var(--green)":"var(--gold)",fontSize:11,fontWeight:600,cursor:pdfState==="loading"?"wait":"pointer",fontFamily:"var(--fb)",transition:"all .3s",opacity:pdfState==="loading"?0.7:1}}>
              <span>📄</span> {pdfState==="loading"?"Generando...":pdfState==="done"?"¡Listo!":"Ver Informe"}
            </button>
          </div>
        </Card>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
          {[
            {lbl:"FCF",val:fM(L.fcf),sub:`Margen: ${fP(L.fcfm)}`,rules:R.fcfm,rv:L.fcfm},
            {lbl:"M. Bruto",val:fP(L.gm),rules:R.gm,rv:L.gm},
            {lbl:"ROE",val:fP(L.roe),rules:R.roe,rv:L.roe},
            {lbl:"ROIC",val:fP(L.roic),rules:R.roic,rv:L.roic},
            {lbl:"Deuda/FCF",val:fX(L.d2fcf),rules:R.d2fcf,rv:L.d2fcf},
            {lbl:"EV/EBITDA",val:fX(L.eve),rules:R.eve,rv:L.eve},
            {lbl:"Piotroski",val:`${piotroski.score}/9`,rules:R.pio,rv:piotroski.score},
            {lbl:"Div Yield",val:fP(cfg.price>0&&LD.dps>0?LD.dps/cfg.price:null),sub:`DPS: $${LD.dps?.toFixed(2)||"—"}`,rules:[{test:v=>v>.04,lbl:"Alto",c:"var(--green)",bg:"rgba(48,209,88,.1)",score:3},{test:v=>v>.025,lbl:"Medio",c:"var(--yellow)",bg:"rgba(255,214,10,.1)",score:2},{test:v=>v>.01,lbl:"Bajo",c:"var(--orange)",bg:"rgba(255,159,10,.1)",score:1},{test:()=>true,lbl:"Mínimo",c:"var(--text-tertiary)",bg:"#1a202c",score:0}],rv:cfg.price>0&&LD.dps>0?LD.dps/cfg.price:null},
            {lbl:"WACC",val:fP(wacc.wacc),sub:`Ke:${fP(wacc.costEquity)} Kd:${fP(wacc.costDebt)}`},
          ].map((m,i) => (
            <Card key={i}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                <span style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,fontFamily:"var(--fm)"}}>{m.lbl}</span>
                {m.rules && <Badge val={m.rv} rules={m.rules}/>}
              </div>
              <div style={{fontSize:22,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:2}}>{m.val}</div>
              {m.sub && <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>{m.sub}</div>}
            </Card>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
          <Card title="Ventas" icon="📈"><BarChart data={revData} labels={labels} color="var(--gold)" formatFn={fM}/></Card>
          <Card title="Free Cash Flow" icon="💰"><BarChart data={fcfData} labels={labels} color="var(--green)" formatFn={fM}/></Card>
          <Card title="EPS" icon="📊"><BarChart data={epsData} labels={labels} color="#64d2ff" formatFn={f2}/></Card>
          <Card title="Dividendo/Acción" icon="💰"><BarChart data={CHART_YEARS.map(y=>fin[y]?.dps||0)} labels={chartLabels} color="#d69e2e" formatFn={v=>"$"+_sf(v,2)}/></Card>
        </div>

        {/* ROIC vs WACC Spread */}
        <Card title="ROIC vs WACC — Creación de Valor" icon="⚡">
          <div style={{display:"flex",alignItems:"flex-end",gap:3,height:100,padding:"0 4px"}}>
            {roicWaccSpread.slice().reverse().map((d,i)=>{
              if(d.roic==null) return null;
              const spread = d.spread || 0;
              const h = Math.abs(spread) * 500;
              const clampH = Math.min(Math.max(h, 4), 80);
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                  <span style={{fontSize:8.5,color:spread>0?"var(--green)":"var(--red)",marginBottom:2,fontFamily:"var(--fm)",fontWeight:600}}>{_sf(spread*100,1)}%</span>
                  <div style={{width:"100%",maxWidth:28,height:clampH,background:spread>0?"rgba(48,209,88,.25)":"rgba(255,69,58,.25)",borderRadius:"3px 3px 0 0",border:`1px solid ${spread>0?"var(--green)":"var(--red)"}`,borderBottom:"none"}}/>
                  <span style={{fontSize:8,color:"var(--text-tertiary)",marginTop:3,fontFamily:"var(--fm)"}}>{String(d.year).slice(2)}</span>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:8,fontSize:10,color:"var(--text-secondary)"}}>
            <span><span style={{color:"var(--green)"}}>●</span> ROIC &gt; WACC = Crea valor</span>
            <span><span style={{color:"var(--red)"}}>●</span> ROIC &lt; WACC = Destruye valor</span>
          </div>
        </Card>

        {/* Bottom row: Altman Z + Waterfall */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Card title="Altman Z-Score" icon="🔬">
            {altmanZ.score != null ? (
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:36,fontWeight:800,color:altmanZ.zoneColor,fontFamily:"var(--fm)"}}>{_sf(altmanZ.score,2)}</div>
                  <div style={{fontSize:11,fontWeight:700,color:altmanZ.zoneColor,marginTop:2}}>{altmanZ.zone}</div>
                </div>
                <div style={{flex:1,fontSize:10,color:"var(--text-secondary)",lineHeight:1.6}}>
                  <div style={{marginBottom:4}}><span style={{color:"var(--green)"}}>{'>'} 2.99</span> = Segura · <span style={{color:"var(--yellow)"}}>1.81-2.99</span> = Gris · <span style={{color:"var(--red)"}}>{'<'} 1.81</span> = Peligro</div>
                  {altmanZ.items.map((it,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}>
                      <span style={{color:"var(--text-tertiary)",fontSize:9}}>{it.name}</span>
                      <span style={{fontFamily:"var(--fm)",fontSize:9,color:it.weighted>0?"var(--green)":"var(--red)"}}>{_sf(it.weighted,2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div style={{color:"var(--text-tertiary)",fontSize:12,textAlign:"center",padding:20}}>Introduce datos para calcular</div>}
          </Card>

          {/* Revenue to FCF Waterfall */}
          <Card title="Revenue → FCF Waterfall" icon="💧">
            {waterfall ? (
              <div style={{display:"flex",alignItems:"flex-end",gap:1,height:120,padding:"0 2px"}}>
                {waterfall.map((step,i)=>{
                  const maxVal = Math.max(...waterfall.filter(s=>s.value>0).map(s=>s.value));
                  const h = Math.abs(step.value)/maxVal * 100;
                  return (
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                      <span style={{fontSize:8,color:step.color,marginBottom:2,fontFamily:"var(--fm)",fontWeight:600}}>{fM(step.value)}</span>
                      <div style={{width:"100%",maxWidth:24,height:Math.max(h,3),background:step.color,opacity:step.subtotal?1:0.7,borderRadius:"3px 3px 0 0"}}/>
                      <span style={{fontSize:7.5,color:"var(--text-tertiary)",marginTop:3,writingMode:"vertical-rl",height:44,overflow:"hidden",fontFamily:"var(--fm)"}}>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{color:"var(--text-tertiary)",fontSize:12,textAlign:"center",padding:20}}>Introduce datos</div>}
          </Card>
        </div>
      </div>
    );
  };

  const renderData = () => {
    const fields = [
      {k:"revenue",l:"Ventas"},{k:"grossProfit",l:"Beneficio Bruto"},{k:"operatingIncome",l:"EBIT"},
      {k:"netIncome",l:"Beneficio Neto"},{k:"eps",l:"EPS"},{k:"dps",l:"Dividendo/Acción"},
      {k:"sharesOut",l:"Acciones (M)"},{k:"ocf",l:"Cash Flow Operativo"},{k:"capex",l:"CapEx"},
      {k:"totalDebt",l:"Deuda Total"},{k:"cash",l:"Caja"},{k:"equity",l:"Patrimonio Neto"},
      {k:"retainedEarnings",l:"Benef. No Distribuido"},{k:"interestExpense",l:"Gastos Intereses"},
      {k:"depreciation",l:"Depreciación"},{k:"taxProvision",l:"Provisión Impuestos"},
    ];
    const yrs = DATA_YEARS;
    return (
      <div>
        <div style={{marginBottom:20}}>
          <h2 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>▤ Datos Financieros</h2>
          <p style={{margin:"4px 0 0",fontSize:12,color:"var(--text-secondary)"}}>Datos en millones. Haz clic en cualquier celda para editar. Fuentes: 10-K, 10-Q, GuruFocus, FastGraphs.</p>
        </div>
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead>
              <tr><th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",zIndex:2,minWidth:155,fontFamily:"var(--fm)",fontSize:10,letterSpacing:.5}}>MÉTRICA</th>
                {yrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:82,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {fields.map((f,i)=>(
                <tr key={f.k} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"rgba(255,255,255,.02)":"transparent"}>
                  <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"5px 14px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid #21262d",zIndex:1,fontSize:11.5}}>{f.l}</td>
                  {yrs.map(y=>(
                    <td key={y} style={{padding:"3px 3px",borderBottom:"1px solid #21262d"}}>
                      <input type="number" value={fin[y]?.[f.k]||""} onChange={e=>upFin(y,f.k,e.target.value)} placeholder="—"
                        style={{width:74,padding:"4px 5px",background:"transparent",border:"1px solid transparent",borderRadius:4,color:"var(--text-primary)",fontSize:11.5,textAlign:"right",outline:"none",fontFamily:"var(--fm)"}}
                        onFocus={e=>{e.target.style.borderColor="var(--gold)";e.target.style.background="var(--gold-glow)";}}
                        onBlur={e=>{e.target.style.borderColor="transparent";e.target.style.background="transparent";}}/>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  };

  const renderQuality = () => {
    const yrs = DATA_YEARS;
    const metrics = [
      {k:"gm",l:"Margen Bruto",r:R.gm,f:fP},{k:"om",l:"Margen Operativo",r:R.om,f:fP},{k:"nm",l:"Margen Neto",r:R.nm,f:fP},
      {k:"roe",l:"ROE",r:R.roe,f:fP},{k:"roic",l:"ROIC",r:R.roic,f:fP},{k:"fcfm",l:"Margen FCF",r:R.fcfm,f:fP},
      {k:"cfm",l:"OCF / Ventas",f:fP},{k:"ocfCapex",l:"OCF / CapEx",f:fX},
    ];
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>◆ Calidad del Negocio</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>Márgenes, rentabilidad y eficiencia operativa a lo largo del tiempo.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:12,marginBottom:20}}>
          {metrics.slice(0,6).map(m=>{
            const vals = yrs.slice().reverse().map(y=>comp[y]?.[m.k]);
            return (
              <Card key={m.k}>
                <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,fontFamily:"var(--fm)"}}>{m.l}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                  <span style={{fontSize:24,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{m.f(L[m.k])}</span>
                  {m.r && <Badge val={L[m.k]} rules={m.r}/>}
                </div>
                <div style={{marginTop:10}}><AreaSparkline data={vals} w={160} h={36}/></div>
              </Card>
            );
          })}
        </div>
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:140,fontFamily:"var(--fm)",fontSize:10}}>MÉTRICA</th>
              <th style={{padding:"10px 8px",textAlign:"center",color:"var(--text-secondary)",borderBottom:"2px solid #30363d",minWidth:80,fontSize:10}}>RATING</th>
              {yrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:72,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
            </tr></thead>
            <tbody>{metrics.map((m,i)=>(
              <tr key={m.k} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"7px 14px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid #21262d"}}>{m.l}</td>
                <td style={{padding:"7px",textAlign:"center",borderBottom:"1px solid #21262d"}}>{m.r?<Badge val={L[m.k]} rules={m.r}/>:"—"}</td>
                {yrs.map(y=><td key={y} style={{padding:"7px 6px",textAlign:"right",color:"var(--text-primary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{m.f(comp[y]?.[m.k])}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </Card>
        <Card style={{marginTop:16,background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:10,fontFamily:"var(--fd)"}}>📘 Cómo interpretar</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.7}}>
            <div><strong style={{color:"var(--text-primary)"}}>Margen Bruto &gt;40%</strong> indica ventaja competitiva fuerte (moat) y poder de fijación de precios. Por debajo del 20%, el negocio está commoditizado.<br/><br/><strong style={{color:"var(--text-primary)"}}>ROE &gt;15%</strong> muestra que la empresa genera gran retorno sobre el capital de los accionistas.</div>
            <div><strong style={{color:"var(--text-primary)"}}>ROIC &gt; WACC</strong> es la regla de oro: la empresa crea valor. Si ROIC &lt; WACC, destruye valor para todos.<br/><br/><strong style={{color:"var(--text-primary)"}}>OCF/CapEx &gt; 3x</strong> significa negocio ligero en activos que genera mucha más caja de la que necesita invertir.</div>
          </div>
        </Card>
      </div>
    );
  };

  const renderDebt = () => {
    const yrs = DATA_YEARS;
    const metrics = [
      {k:"d2fcf",l:"Deuda Neta / FCF",r:R.d2fcf,f:fX},{k:"ic",l:"EBIT / Intereses",r:R.ic,f:fX},
      {k:"nd2cap",l:"Deuda Neta / Capital",f:fP},{k:"d2ebit",l:"Deuda Neta / EBIT",f:fX},
      {k:"nd2ocf",l:"Deuda Neta / OCF",f:fX},{k:"nd2rev",l:"Deuda Neta / Ventas",f:fX},{k:"int2ocf",l:"Intereses / OCF",f:fP},
    ];
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>⬡ Deuda y Balance</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>Solidez financiera, capacidad de pago y Altman Z-Score.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:20}}>
          {[{l:"Deuda Total",v:fM(LD.totalDebt)},{l:"Caja",v:fM(LD.cash)},{l:"Deuda Neta",v:fM(L.netDebt)},{l:"Patrimonio",v:fM(LD.equity)},{l:"Tipo medio deuda",v:fP(div(LD.interestExpense,LD.totalDebt))}].map((x,i)=>(
            <Card key={i}><div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>{x.l}</div>
              <div style={{fontSize:22,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{x.v}</div></Card>
          ))}
        </div>
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:160,fontFamily:"var(--fm)",fontSize:10}}>RATIO</th>
              <th style={{padding:"10px 8px",textAlign:"center",borderBottom:"2px solid #30363d",minWidth:80,color:"var(--text-secondary)",fontSize:10}}>RATING</th>
              {yrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:68,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
            </tr></thead>
            <tbody>{metrics.map((m,i)=>(
              <tr key={m.k} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"7px 14px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid #21262d"}}>{m.l}</td>
                <td style={{padding:"7px",textAlign:"center",borderBottom:"1px solid #21262d"}}>{m.r?<Badge val={L[m.k]} rules={m.r}/>:"—"}</td>
                {yrs.map(y=><td key={y} style={{padding:"7px 6px",textAlign:"right",color:"var(--text-primary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{m.f(comp[y]?.[m.k])}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </Card>
        <Card style={{marginTop:16,background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:10,fontFamily:"var(--fd)"}}>📘 Cómo interpretar la deuda</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.7}}>
            <div><strong style={{color:"var(--text-primary)"}}>Deuda Neta / FCF &lt; 3x</strong> es lo ideal para empresas de dividendos. Significa que puede pagar toda su deuda con 3 años de cash flow libre. &gt;5x es preocupante.<br/><br/><strong style={{color:"var(--text-primary)"}}>Cobertura Intereses &gt; 8x</strong> indica que la empresa genera 8 veces más beneficio operativo de lo que paga en intereses.</div>
            <div><strong style={{color:"var(--text-primary)"}}>Deuda/Capital &lt; 50%</strong> muestra un balance conservador. &gt;70% es arriesgado, especialmente si los tipos suben.<br/><br/><strong style={{color:"var(--text-primary)"}}>Para inversores de dividendos:</strong> La deuda es el mayor riesgo para la sostenibilidad del dividendo. Empresas muy endeudadas recortan antes.</div>
          </div>
        </Card>
      </div>
    );
  };

  const renderValuation = () => {
    const yrs = DATA_YEARS;
    const metrics = [
      {k:"eve",l:"EV / EBITDA",r:R.eve,f:fX},{k:"pb",l:"Precio / Book",f:fX},{k:"bvps",l:"Book Value / Acción",f:v=>fC(v)},
      {k:"fcfps",l:"FCF / Acción",f:v=>fC(v)},{k:"fcfPayout",l:"FCF Payout",f:fP},{k:"ePayout",l:"Earnings Payout",f:fP},
    ];
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>◎ Valoración por Múltiplos</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>¿Está cara o barata respecto a sus fundamentales y competidores?</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginBottom:20}}>
          {[
            {l:"EV/EBITDA",v:fX(L.eve),r:R.eve,rv:L.eve},{l:"P/Book",v:fX(L.pb)},
            {l:"PER por FCF",v:fX(dcf?.per)},{l:"FCF Yield",v:fP(dcf?.fcfYield)},
          ].map((m,i)=>(
            <Card key={i}>
              <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>{m.l}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                <span style={{fontSize:24,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{m.v}</span>
                {m.r && <Badge val={m.rv} rules={m.r}/>}
              </div>
            </Card>
          ))}
        </div>
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:160,fontFamily:"var(--fm)",fontSize:10}}>MÚLTIPLO</th>
              {yrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:72,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
            </tr></thead>
            <tbody>{metrics.map((m,i)=>(
              <tr key={m.k} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"7px 14px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid #21262d"}}>{m.l}</td>
                {yrs.map(y=><td key={y} style={{padding:"7px 6px",textAlign:"right",color:"var(--text-primary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{m.f(comp[y]?.[m.k])}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </Card>

        {/* ═══ FMP INTELLIGENCE ═══ */}
        {(fmpExtra.rating?.rating || fmpExtra.priceTarget?.targetConsensus || fmpExtra.estimates?.length > 0) && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:16,marginBottom:16}}>
            {/* FMP Rating */}
            {fmpExtra.rating?.rating && (
              <Card style={{borderColor:fmpExtra.rating.ratingScore>=4?"rgba(48,209,88,.2)":fmpExtra.rating.ratingScore>=3?"rgba(255,214,10,.2)":"rgba(255,69,58,.2)"}}>
                <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:8}}>FMP Rating</div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:56,height:56,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:900,fontFamily:"var(--fm)",
                    color:fmpExtra.rating.ratingScore>=4?"#30d158":fmpExtra.rating.ratingScore>=3?"#ffd60a":"#ff453a",
                    background:fmpExtra.rating.ratingScore>=4?"rgba(48,209,88,.1)":fmpExtra.rating.ratingScore>=3?"rgba(255,214,10,.1)":"rgba(255,69,58,.1)",
                    border:`2px solid ${fmpExtra.rating.ratingScore>=4?"rgba(48,209,88,.3)":fmpExtra.rating.ratingScore>=3?"rgba(255,214,10,.3)":"rgba(255,69,58,.3)"}`
                  }}>{fmpExtra.rating.rating}</div>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)"}}>{fmpExtra.rating.ratingRecommendation || "—"}</div>
                    <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>Score: {fmpExtra.rating.ratingScore}/5</div>
                    <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>
                      {[{k:"ratingDetailsDCFScore",l:"DCF"},{k:"ratingDetailsROEScore",l:"ROE"},{k:"ratingDetailsROAScore",l:"ROA"},{k:"ratingDetailsDEScore",l:"D/E"},{k:"ratingDetailsPEScore",l:"P/E"},{k:"ratingDetailsPBScore",l:"P/B"}].map(s=>{
                        const v = fmpExtra.rating[s.k];
                        return v != null ? <span key={s.k} style={{fontSize:8,padding:"1px 5px",borderRadius:4,fontFamily:"var(--fm)",fontWeight:600,
                          color:v>=4?"#30d158":v>=3?"#ffd60a":"#ff453a",background:v>=4?"rgba(48,209,88,.08)":v>=3?"rgba(255,214,10,.08)":"rgba(255,69,58,.08)"
                        }}>{s.l}:{v}</span> : null;
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            )}
            {/* Price Targets */}
            {fmpExtra.priceTarget?.targetConsensus > 0 && (
              <Card>
                <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:8}}>Analyst Price Targets</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center"}}>
                  {[{l:"Bajo",v:fmpExtra.priceTarget.targetLow,c:"var(--red)"},{l:"Consenso",v:fmpExtra.priceTarget.targetConsensus,c:"var(--gold)"},{l:"Alto",v:fmpExtra.priceTarget.targetHigh,c:"var(--green)"}].map(x=>(
                    <div key={x.l}>
                      <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>{x.l}</div>
                      <div style={{fontSize:18,fontWeight:700,color:x.c,fontFamily:"var(--fm)"}}>{fC(x.v)}</div>
                    </div>
                  ))}
                </div>
                {cfg.price > 0 && fmpExtra.priceTarget.targetConsensus > 0 && (() => {
                  const upside = (fmpExtra.priceTarget.targetConsensus / cfg.price - 1) * 100;
                  return <div style={{marginTop:8,textAlign:"center",fontSize:11,fontWeight:600,color:upside>0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>
                    {upside>0?"↑":"↓"} {_sf(Math.abs(upside),1)}% vs precio actual
                  </div>;
                })()}
              </Card>
            )}
            {/* Analyst Estimates */}
            {fmpExtra.estimates?.length > 0 && (
              <Card>
                <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:8}}>Analyst Estimates (FY)</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {fmpExtra.estimates.slice(0,3).map((e,i) => {
                    const revG = e.estimatedRevenueAvg && fmpExtra.estimates[i+1]?.estimatedRevenueAvg ? (e.estimatedRevenueAvg / fmpExtra.estimates[i+1].estimatedRevenueAvg - 1) : null;
                    return (
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",borderRadius:6,background:i===0?"rgba(200,164,78,.06)":"rgba(255,255,255,.02)"}}>
                        <span style={{fontSize:10,fontWeight:600,color:i===0?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)"}}>{e.date?.slice(0,4) || "—"}</span>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:10,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>EPS: {fC(e.estimatedEpsAvg)}</div>
                          <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Rev: {fM(e.estimatedRevenueAvg/1e6)}{n(revG)!=null?` (${revG>0?"+":""}${_sf(revG*100,1)}%)`:""}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Comparables */}
        <Card title="Comparables — Competidores" icon="🏢" style={{marginTop:16}}>
          <p style={{fontSize:11,color:"var(--text-secondary)",marginBottom:12}}>Añade competidores para comparar múltiplos. Los datos los introduces tú de GuruFocus o similares.</p>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
            {comps.map((c,i)=>(
              <div key={i} style={{display:"flex",gap:6,alignItems:"center"}}>
                <input placeholder="Nombre" value={c.name} onChange={e=>{const nc=[...comps];nc[i]={...nc[i],name:e.target.value};setComps(nc);}}
                  style={{flex:2,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)"}}
                  onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
                <input placeholder="P/E" type="number" value={c.pe||""} onChange={e=>{const nc=[...comps];nc[i]={...nc[i],pe:parseFloat(e.target.value)||0};setComps(nc);}}
                  style={{flex:1,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)",textAlign:"right"}}
                  onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
                <input placeholder="EV/EBITDA" type="number" value={c.evEbitda||""} onChange={e=>{const nc=[...comps];nc[i]={...nc[i],evEbitda:parseFloat(e.target.value)||0};setComps(nc);}}
                  style={{flex:1,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)",textAlign:"right"}}
                  onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
                <button onClick={()=>setComps(comps.filter((_,j)=>j!==i))} style={{padding:"4px 8px",background:"rgba(255,69,58,.1)",border:"1px solid rgba(255,69,58,.2)",borderRadius:6,color:"var(--red)",fontSize:10,cursor:"pointer"}}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={()=>setComps([...comps,{name:"",pe:0,evEbitda:0}])} style={{padding:"6px 14px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-secondary)",fontSize:11,cursor:"pointer",fontFamily:"var(--fm)"}}>+ Añadir competidor</button>
          
          {comps.some(c=>c.name&&(c.pe||c.evEbitda)) && (
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
              {[{name:cfg.ticker||"Empresa",pe:LD.eps>0?cfg.price/LD.eps:null,evEbitda:L.eve,isSelf:true},...comps.filter(c=>c.name)].map((c,i)=>(
                <div key={i} style={{padding:"10px 12px",borderRadius:10,background:c.isSelf?"var(--gold-glow)":"rgba(255,255,255,.03)",border:`1px solid ${c.isSelf?"var(--gold-dim)":"var(--border)"}`}}>
                  <div style={{fontSize:10,fontWeight:600,color:c.isSelf?"var(--gold)":"var(--text-secondary)",marginBottom:6}}>{c.name}</div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <div><div style={{fontSize:8,color:"var(--text-tertiary)"}}>P/E</div><div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{c.pe?_sf(c.pe,1)+"x":"—"}</div></div>
                    <div><div style={{fontSize:8,color:"var(--text-tertiary)"}}>EV/EBITDA</div><div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{c.evEbitda?_sf(c.evEbitda,1)+"x":"—"}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  };

  const renderDCF = () => {
    if(!dcf) return (
      <Card><div style={{textAlign:"center",padding:48,color:"var(--text-tertiary)"}}><div style={{fontSize:48,marginBottom:16}}>△</div>Introduce datos (OCF, CapEx, acciones) para generar el DCF.</div></Card>
    );
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>△ Descuento de Flujos de Caja (DCF)</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>Tasa: {fP(discountRate)} ({cfg.useWACC?"WACC calculado":"Manual"}) · Crecimiento: {fP(estimatedGrowth)} · Terminal: 2.5%</p>
        
        <Card glow style={{marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:20}}>
            <div><div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>Valor Intrínseco</div>
              <div style={{fontSize:38,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)",marginTop:4}}>{fC(dcf.iv)}</div></div>
            <div><div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>Precio Actual</div>
              <div style={{fontSize:38,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{fC(cfg.price)}</div></div>
            <div><div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>Margen de Seguridad</div>
              <div style={{fontSize:38,fontWeight:700,color:dcf.mos>.15?"var(--green)":dcf.mos>0?"var(--yellow)":"var(--red)",fontFamily:"var(--fm)",marginTop:4}}>{f1(dcf.mos*100)}%</div>
              <Badge val={dcf.mos} rules={R.mos}/></div>
            <div><div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>Valor Total</div>
              <div style={{fontSize:24,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{fM(dcf.total)}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>Terminal: {f1(dcf.tvPV/dcf.total*100)}% del total</div></div>
          </div>
        </Card>

        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16}}>
          <Card title="Proyección FCF" icon="📈">
            <BarChart data={dcf.projs.map(p=>p.fcf)} labels={dcf.projs.map(p=>String(p.year).slice(2))} color="var(--green)" height={120} formatFn={fM}/>
          </Card>
          <Card title="Análisis de Sensibilidad" icon="🎛️">
            <p style={{fontSize:10,color:"var(--text-secondary)",margin:"0 0 8px"}}>Valor intrínseco según diferentes tasas:</p>
            <SensitivityTable dcfFn={dcfCalc} baseGrowth={Math.round(estimatedGrowth*100)} baseDiscount={Math.round(discountRate*100)}/>
          </Card>
        </div>

        <Card style={{marginTop:16,overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>AÑO</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>FCF PROY.</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>VALOR PRESENTE</th>
            </tr></thead>
            <tbody>
              {dcf.projs.map((p,i)=>(
                <tr key={p.year} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                  <td style={{padding:"7px 14px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid #21262d"}}>{p.year}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:"var(--text-primary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fM(p.fcf)}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:"var(--text-secondary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fM(p.pv)}</td>
                </tr>
              ))}
              <tr style={{background:"rgba(48,209,88,.06)"}}>
                <td style={{padding:"10px 14px",color:"var(--green)",fontWeight:700,borderTop:"2px solid #30363d"}}>TOTAL</td>
                <td style={{padding:"10px 8px",textAlign:"right",borderTop:"2px solid #30363d"}}/>
                <td style={{padding:"10px 8px",textAlign:"right",color:"var(--green)",fontWeight:700,borderTop:"2px solid #30363d",fontFamily:"var(--fm)"}}>{fM(dcf.total)}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* FMP DCF Comparison */}
        {fmpExtra.dcf?.dcf > 0 && (
          <Card title="DCF — Tu Modelo vs FMP" icon="⚖" style={{marginTop:16}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:20,alignItems:"center"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"#64d2ff",fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1}}>A&R DCF</div>
                <div style={{fontSize:32,fontWeight:800,color:dcf.mos>0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{fC(dcf.iv)}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)"}}>MOS: {f1(dcf.mos*100)}%</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{fontSize:20,color:"var(--text-tertiary)"}}>vs</div>
                {(() => {
                  const diff = dcf.iv && fmpExtra.dcf.dcf ? ((dcf.iv / fmpExtra.dcf.dcf - 1) * 100) : null;
                  return diff != null ? <div style={{fontSize:10,color:Math.abs(diff)<15?"var(--green)":"var(--orange)",fontFamily:"var(--fm)"}}>
                    Δ {diff>0?"+":""}{_sf(diff,0)}%
                  </div> : null;
                })()}
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"#bf5af2",fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1}}>FMP DCF</div>
                <div style={{fontSize:32,fontWeight:800,color:fmpExtra.dcf.dcf>cfg.price?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{fC(fmpExtra.dcf.dcf)}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)"}}>MOS: {cfg.price>0?f1((1-cfg.price/fmpExtra.dcf.dcf)*100):0}%</div>
              </div>
            </div>
            <div style={{marginTop:12,fontSize:10.5,color:"var(--text-secondary)",lineHeight:1.6,textAlign:"center"}}>
              {Math.abs((dcf.iv/fmpExtra.dcf.dcf-1)*100) < 15
                ? "Los dos modelos convergen (±15%). Alta confianza en la valoración."
                : "Diferencia significativa entre modelos. Investigar los supuestos de cada uno."}
            </div>
          </Card>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════════
  // RULE #1: BIG FIVE NUMBERS
  // ══════════════════════════════════════════
  const renderBig5 = () => {
    // Get years with data
    const yrsWithData = YEARS.filter(y=>fin[y]?.revenue>0);
    const latest = yrsWithData[0];
    if(!latest) return <Card><div style={{textAlign:"center",padding:48,color:"var(--text-tertiary)"}}>Introduce datos financieros para calcular las Big Five Numbers.</div></Card>;

    // Helper: get value for a metric at year y
    const getVal = (metric, y) => {
      if(metric==="roic") return comp[y]?.roicR1;  // Rule #1 ROIC (can be negative)
      if(metric==="revps") return comp[y]?.revps;
      if(metric==="eps") return fin[y]?.eps;  // Allow negatives for display, CAGR logic handles filtering
      if(metric==="bvps") return comp[y]?.bvps;
      if(metric==="fcfps") return comp[y]?.fcfps;
      return null;
    };

    // For CAGR: get positive value or null (skip anomalous negative years)
    const getPosVal = (metric, y) => {
      const v = getVal(metric, y);
      return (n(v) != null && v > 0) ? v : null;
    };

    // Compute CAGRs for each Big Five metric
    const big5Metrics = [
      {key:"roic",  name:"ROIC",             desc:"Net Income / Invested Capital", type:"avg"},
      {key:"revps", name:"Crecimiento Ventas",desc:"Revenue per Share CAGR",       type:"cagr"},
      {key:"eps",   name:"Crecimiento EPS",   desc:"Earnings per Share CAGR",      type:"cagr"},
      {key:"bvps",  name:"Crecimiento BVPS",  desc:"Book Value per Share CAGR",    type:"cagr"},
      {key:"fcfps", name:"Crecimiento FCF",   desc:"Free Cash Flow per Share CAGR",type:"cagr"},
    ];

    const big5Data = big5Metrics.map(m => {
      if(m.type === "avg") {
        // For ROIC, compute average over 1yr, 5yr, 10yr — only positive years
        const getPositiveROIC = (years) => {
          const vals = years.map(y=>getVal(m.key,y)).filter(v=>n(v)!=null && v > 0);
          return vals.length >= 2 ? vals.reduce((s,v)=>s+v,0)/vals.length : null;
        };
        const v1 = getVal(m.key, latest);
        // If latest ROIC is negative (impairment), use most recent positive
        const latestPositive = n(v1)!=null && v1 > 0 ? v1 : getPositiveROIC(yrsWithData.slice(0,3));
        return {
          ...m,
          y1: latestPositive,
          y5: getPositiveROIC(yrsWithData.slice(0,Math.min(5,yrsWithData.length))),
          y10: getPositiveROIC(yrsWithData.slice(0,Math.min(10,yrsWithData.length))),
          y1raw: v1, // raw for display
        };
      } else {
        // CAGR calculation — find most recent positive and oldest positive
        // For latest: use most recent year with positive value
        const findPosLatest = () => {
          for(const y of yrsWithData) { const v = getPosVal(m.key,y); if(v) return {y, v}; }
          return null;
        };
        const posLatest = findPosLatest();
        if(!posLatest) return {...m, y1:null, y5:null, y10:null};
        
        const latestIdx = yrsWithData.indexOf(posLatest.y);
        const y1ago = yrsWithData[latestIdx+1];
        const y5ago = yrsWithData.find((_,i)=>i>=latestIdx+5);
        const y10ago = yrsWithData.find((_,i)=>i>=latestIdx+10);
        
        return {
          ...m,
          y1: y1ago ? cagrFn(posLatest.v, getPosVal(m.key, y1ago), yrsWithData.indexOf(y1ago)-latestIdx) : null,
          y5: y5ago ? cagrFn(posLatest.v, getPosVal(m.key, y5ago), yrsWithData.indexOf(y5ago)-latestIdx) : null,
          y10: y10ago ? cagrFn(posLatest.v, getPosVal(m.key, y10ago), yrsWithData.indexOf(y10ago)-latestIdx) : null,
        };
      }
    });

    // Count how many pass ≥10% on the 10-year column
    const passing10 = big5Data.filter(m=>n(m.y10)!=null && m.y10 >= .10).length;
    const passing5 = big5Data.filter(m=>n(m.y5)!=null && m.y5 >= .10).length;

    // Color helper
    const valColor = v => n(v)==null ? "var(--text-tertiary)" : v>=.10 ? "var(--green)" : v>=.05 ? "var(--yellow)" : v>=0 ? "var(--orange)" : "var(--red)";

    // Historical data years
    const histYrs = YEARS.slice(0,12);

    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        {/* Header */}
        <div>
          <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>
            ❺ Big Five Numbers
          </h2>
          <p style={{margin:0,fontSize:12,color:"var(--text-secondary)"}}>
            Phil Town exige que las 5 métricas crezcan al ≥10% anual a 1, 5 y 10 años. Si alguna falla, investiga por qué.
          </p>
        </div>

        {/* Summary Card */}
        <Card glow>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:40,flexWrap:"wrap"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:48,fontWeight:800,color:passing10>=4?"var(--green)":passing10>=2?"var(--yellow)":"var(--red)",fontFamily:"var(--fm)"}}>{passing10}<span style={{fontSize:20,color:"var(--text-tertiary)"}}>/5</span></div>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontWeight:600}}>pasan a 10 años</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:48,fontWeight:800,color:passing5>=4?"var(--green)":passing5>=2?"var(--yellow)":"var(--red)",fontFamily:"var(--fm)"}}>{passing5}<span style={{fontSize:20,color:"var(--text-tertiary)"}}>/5</span></div>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontWeight:600}}>pasan a 5 años</div>
            </div>
            <div style={{maxWidth:320,fontSize:12,color:"var(--text-secondary)",lineHeight:1.7}}>
              {passing10 >= 4 ? "La empresa pasa la mayoría de las Big Five. Señal de moat y management competente." :
               passing10 >= 2 ? "Resultados mixtos. Investigar las métricas que no alcanzan el 10%." :
               "La mayoría de métricas no alcanzan el 10%. Precaución: ¿tiene la empresa un moat real?"}
            </div>
          </div>
        </Card>

        {/* Big Five Table */}
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>
                <th style={{padding:"12px 16px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10,letterSpacing:.5,minWidth:200}}>BIG FIVE</th>
                <th style={{padding:"12px 14px",textAlign:"center",color:"var(--text-secondary)",borderBottom:"2px solid #30363d",fontSize:10,fontFamily:"var(--fm)"}}>1 AÑO</th>
                <th style={{padding:"12px 14px",textAlign:"center",color:"var(--text-secondary)",borderBottom:"2px solid #30363d",fontSize:10,fontFamily:"var(--fm)"}}>5 AÑOS</th>
                <th style={{padding:"12px 14px",textAlign:"center",color:"var(--gold)",borderBottom:"2px solid #30363d",fontSize:10,fontWeight:700,fontFamily:"var(--fm)",background:"var(--gold-glow)"}}>10 AÑOS</th>
                <th style={{padding:"12px 14px",textAlign:"center",color:"var(--text-secondary)",borderBottom:"2px solid #30363d",fontSize:10,fontFamily:"var(--fm)"}}>MÍNIMO</th>
                <th style={{padding:"12px 14px",textAlign:"center",color:"var(--text-secondary)",borderBottom:"2px solid #30363d",fontSize:10,fontFamily:"var(--fm)"}}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {big5Data.map((m,i) => (
                <tr key={m.key} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                  <td style={{padding:"12px 16px",borderBottom:"1px solid #21262d"}}>
                    <div style={{color:"var(--text-primary)",fontWeight:600,fontSize:12.5}}>{m.name}</div>
                    <div style={{color:"var(--text-tertiary)",fontSize:10,marginTop:2}}>{m.desc}</div>
                  </td>
                  <td style={{padding:"12px 14px",textAlign:"center",borderBottom:"1px solid #21262d"}}>
                    <span style={{fontFamily:"var(--fm)",fontWeight:600,fontSize:13,color:valColor(m.y1)}}>{fP(m.y1)}</span>
                  </td>
                  <td style={{padding:"12px 14px",textAlign:"center",borderBottom:"1px solid #21262d"}}>
                    <span style={{fontFamily:"var(--fm)",fontWeight:600,fontSize:13,color:valColor(m.y5)}}>{fP(m.y5)}</span>
                  </td>
                  <td style={{padding:"12px 14px",textAlign:"center",borderBottom:"1px solid #21262d",background:"var(--gold-glow)"}}>
                    <span style={{fontFamily:"var(--fm)",fontWeight:700,fontSize:14,color:valColor(m.y10)}}>{fP(m.y10)}</span>
                  </td>
                  <td style={{padding:"12px 14px",textAlign:"center",borderBottom:"1px solid #21262d"}}>
                    <span style={{fontFamily:"var(--fm)",fontSize:11,color:"var(--gold)"}}>10.0%</span>
                  </td>
                  <td style={{padding:"12px 14px",textAlign:"center",borderBottom:"1px solid #21262d"}}>
                    <Badge val={m.y10} rules={R.big5}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Note for negative years */}
          {fin[latestDataYear]?.netIncome < 0 && (
            <div style={{padding:"10px 16px",borderTop:"1px solid #21262d",fontSize:10.5,color:"var(--orange)",background:"rgba(255,159,10,.04)",lineHeight:1.6}}>
              ⚠ El último año tiene Net Income negativo (goodwill impairment). Los CAGRs de ROIC y EPS se calculan usando el año positivo más reciente para evitar distorsiones.
            </div>
          )}
        </Card>

        {/* Historical Data Table */}
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead>
              <tr>
                <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",zIndex:2,minWidth:155,fontFamily:"var(--fm)",fontSize:10,letterSpacing:.5}}>HISTÓRICO</th>
                {histYrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:72,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                {label:"ROIC (Rule #1)",fn:y=>{const v=comp[y]?.roicR1;return <span style={{color:valColor(v)}}>{fP(v)}</span>;}},
                {label:"Ventas / Acción",fn:y=>fC(comp[y]?.revps)},
                {label:"EPS",fn:y=>{const v=fin[y]?.eps;return <span style={{color:v<0?"var(--red)":"var(--text-primary)"}}>{fC(v)}</span>;}},
                {label:"BVPS",fn:y=>fC(comp[y]?.bvps)},
                {label:"FCF / Acción",fn:y=>{const v=comp[y]?.fcfps;return <span style={{color:n(v)!=null&&v<0?"var(--red)":"var(--text-primary)"}}>{fC(v)}</span>;}},
                {label:"Dividendo / Acción",fn:y=>fC(fin[y]?.dps)},
              ].map((row,i) => (
                <tr key={i} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                  <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"7px 14px",color:i===0?"var(--gold)":"var(--text-primary)",fontWeight:i===0?600:500,borderBottom:"1px solid #21262d",zIndex:1,fontSize:11.5}}>{row.label}</td>
                  {histYrs.map(y=><td key={y} style={{padding:"7px 6px",textAlign:"right",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{row.fn(y)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Educational Box */}
        <Card style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:10,fontFamily:"var(--fd)"}}>📘 Rule #1: Big Five Numbers de Phil Town</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.8}}>
            <div>
              <strong style={{color:"var(--text-primary)"}}>ROIC ≥10%</strong> — La métrica estrella. Mide cuánto beneficio neto genera por cada dólar de capital invertido. Si supera el 10% consistentemente, indica un moat fuerte.
              <br/><br/>
              <strong style={{color:"var(--text-primary)"}}>Crecimiento Ventas ≥10%</strong> — Si las ventas por acción crecen al menos 10% anual, la empresa está ganando cuota de mercado o subiendo precios.
              <br/><br/>
              <strong style={{color:"var(--text-primary)"}}>Crecimiento EPS ≥10%</strong> — Más importante que las ventas: ¿crece el beneficio por acción? Esto refleja eficiencia operativa y recompras.
            </div>
            <div>
              <strong style={{color:"var(--text-primary)"}}>Crecimiento BVPS ≥10%</strong> — El book value por acción creciendo muestra que la empresa acumula riqueza para el accionista año tras año.
              <br/><br/>
              <strong style={{color:"var(--text-primary)"}}>Crecimiento FCF ≥10%</strong> — El free cash flow por acción es la caja real que genera. Es la métrica más difícil de manipular y la más fiable.
              <br/><br/>
              <strong style={{color:"var(--gold)"}}>La columna de 10 años es la más importante</strong> — muestra consistencia a largo plazo. Si una métrica falla, investiga si fue por una razón puntual (adquisición, COVID) o estructural.
            </div>
          </div>
        </Card>
      </div>
    );
  };

  // ══════════════════════════════════════════
  // 10 CAP + PAYBACK TIME
  // ══════════════════════════════════════════
  const renderTenCap = () => {
    // ═══ CLAUDE: OE = Net Income + D&A - CapEx (100%) ═══
    const oeLatest = L.oe;
    const oePositiveYrs = YEARS.filter(y => comp[y]?.oe > 0);
    const oeForCalc = oeLatest > 0 ? oeLatest : (oePositiveYrs.length ? comp[oePositiveYrs[0]].oe : 0);
    const oepsForCalc = oeForCalc > 0 ? div(oeForCalc, fin[oePositiveYrs[0]||YEARS[0]]?.sharesOut) : 0;
    const tenCapClaude = oepsForCalc ? oepsForCalc * 10 : 0;

    // ═══ RULE #1: OE = OCF - Maint.CapEx(70%) + Tax Provision ═══
    const r1OCF = LD.ocf || 0;
    const r1MaintCapex = (LD.capex || 0) * 0.70;
    const r1Tax = LD.taxProvision || 0;
    const r1OE = r1OCF - r1MaintCapex + r1Tax;
    const r1OEps = r1OE > 0 ? div(r1OE, LD.sharesOut) : 0;
    const tenCapR1 = r1OEps ? r1OEps * 10 : 0;
    const histYrs = YEARS.slice(0, 10);

    const MethodBadge = ({label, color, icon}) => (
      <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:20,background:`${color}15`,border:`1px solid ${color}33`,fontSize:10,fontWeight:700,color,fontFamily:"var(--fm)",letterSpacing:.3}}>
        <span>{icon}</span>{label}
      </div>
    );

    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div>
          <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>
            10 Cap Rate <span style={{fontSize:13,color:"var(--gold)",fontWeight:400}}>— Rule #1 vs Claude</span>
          </h2>
          <p style={{margin:0,fontSize:12,color:"var(--text-secondary)"}}>
            Si quisieras un 10% de retorno anual basándote en los Owner Earnings, ¿cuál sería el precio máximo a pagar?
          </p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {/* Rule #1 */}
          <Card glow style={{borderColor:"rgba(255,159,10,.2)"}}>
            <div style={{marginBottom:14}}><MethodBadge label="RULE #1" color="#ff9f0a" icon="📖"/></div>
            <div style={{fontSize:10,color:"var(--text-secondary)",marginBottom:14,lineHeight:1.6}}>
              <strong>OE = OCF − CapEx Mant. (70%) + Tax Provision</strong><br/>
              Fórmula original de Phil Town/Buffett. Solo resta CapEx de mantenimiento.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[{l:"OCF",v:fM(r1OCF),c:"var(--text-primary)"},{l:"Maint. CapEx (70%)",v:"-"+fM(r1MaintCapex),c:"var(--red)"},{l:"+ Tax Provision",v:"+"+fM(r1Tax),c:"var(--green)"},{l:"Owner Earnings",v:fM(r1OE),c:"#ff9f0a",bg:"rgba(255,159,10,.06)"}].map((x,i)=>(
                <div key={i} style={{padding:"8px",borderRadius:8,background:x.bg||"rgba(255,255,255,.02)"}}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>{x.l}</div>
                  <div style={{fontSize:15,fontWeight:700,color:x.c,fontFamily:"var(--fm)"}}>{x.v}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:"center",padding:"12px 0",borderTop:"1px solid #21262d"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:1}}>10 CAP PRICE</div>
              <div style={{fontSize:42,fontWeight:800,fontFamily:"var(--fm)",color:cfg.price<=tenCapR1?"var(--green)":"var(--red)",lineHeight:1.1,marginTop:4}}>{fC(tenCapR1)}</div>
              <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:6}}>OE/Share: {fC(r1OEps)} × 10</div>
              {tenCapR1>0 && <div style={{marginTop:8}}><Badge val={cfg.price<=tenCapR1?1:0} rules={[{test:v=>v>0,lbl:"COMPRAR",c:"var(--green)",bg:"rgba(48,209,88,.1)",score:3},{test:()=>true,lbl:"CARO",c:"var(--red)",bg:"rgba(255,69,58,.1)",score:0}]}/></div>}
            </div>
          </Card>
          {/* Claude */}
          <Card glow style={{borderColor:"rgba(100,210,255,.2)"}}>
            <div style={{marginBottom:14}}><MethodBadge label="CLAUDE" color="#64d2ff" icon="🤖"/></div>
            <div style={{fontSize:10,color:"var(--text-secondary)",marginBottom:14,lineHeight:1.6}}>
              <strong>OE = Net Income + D&A − CapEx (100%)</strong><br/>
              Más conservador. Resta todo el CapEx, no solo mantenimiento.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[{l:"Net Income",v:fM(LD.netIncome),c:"var(--text-primary)"},{l:"+ Depreciation",v:"+"+fM(LD.depreciation),c:"var(--green)"},{l:"− CapEx (100%)",v:"-"+fM(LD.capex),c:"var(--red)"},{l:"Owner Earnings",v:fM(oeForCalc),c:"#64d2ff",bg:"rgba(100,210,255,.06)"}].map((x,i)=>(
                <div key={i} style={{padding:"8px",borderRadius:8,background:x.bg||"rgba(255,255,255,.02)"}}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>{x.l}</div>
                  <div style={{fontSize:15,fontWeight:700,color:x.c,fontFamily:"var(--fm)"}}>{x.v}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:"center",padding:"12px 0",borderTop:"1px solid #21262d"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:1}}>10 CAP PRICE</div>
              <div style={{fontSize:42,fontWeight:800,fontFamily:"var(--fm)",color:cfg.price<=tenCapClaude?"var(--green)":"var(--red)",lineHeight:1.1,marginTop:4}}>{fC(tenCapClaude)}</div>
              <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:6}}>OE/Share: {fC(oepsForCalc)} × 10</div>
              {tenCapClaude>0 && <div style={{marginTop:8}}><Badge val={cfg.price<=tenCapClaude?1:0} rules={[{test:v=>v>0,lbl:"COMPRAR",c:"var(--green)",bg:"rgba(48,209,88,.1)",score:3},{test:()=>true,lbl:"CARO",c:"var(--red)",bg:"rgba(255,69,58,.1)",score:0}]}/></div>}
            </div>
          </Card>
        </div>
        {/* Comparación */}
        <Card style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:12,fontFamily:"var(--fd)"}}>⚖ Comparación 10 Cap</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:16,alignItems:"center"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#ff9f0a",fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1}}>RULE #1</div>
              <div style={{fontSize:28,fontWeight:800,color:cfg.price<=tenCapR1?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{fC(tenCapR1)}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)"}}>Más optimista (+Tax, 70% CapEx)</div>
            </div>
            <div style={{fontSize:20,color:"var(--text-tertiary)"}}>vs</div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#64d2ff",fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1}}>CLAUDE</div>
              <div style={{fontSize:28,fontWeight:800,color:cfg.price<=tenCapClaude?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{fC(tenCapClaude)}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)"}}>Más conservador (100% CapEx)</div>
            </div>
          </div>
          <div style={{marginTop:12,fontSize:10.5,color:"var(--text-secondary)",lineHeight:1.6}}>
            <strong style={{color:"var(--text-primary)"}}>Diferencia: {fC(tenCapR1 - tenCapClaude)}</strong> — Si ambos dicen COMPRAR, alta convicción. Si solo Rule #1 dice comprar, investigar más.
          </div>
        </Card>
        {/* Historical OE Table */}
        <Card title="Histórico de Owner Earnings" icon="📊" style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>
              <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"8px 12px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9,minWidth:120}}>MÉTRICA</th>
              {histYrs.map(y=><th key={y} style={{padding:"8px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9}}>{y}</th>)}
            </tr></thead>
            <tbody>
              {[
                {l:"OCF",fn:y=>fM(fin[y]?.ocf),c:"var(--text-primary)"},
                {l:"CapEx Total",fn:y=>fM(fin[y]?.capex),c:"var(--text-primary)"},
                {l:"CapEx 70% (R1)",fn:y=>fM((fin[y]?.capex||0)*0.7),c:"#ff9f0a"},
                {l:"Tax Provision",fn:y=>fM(fin[y]?.taxProvision),c:"var(--text-primary)"},
                {l:"D&A",fn:y=>fM(fin[y]?.depreciation),c:"var(--text-primary)"},
                {l:"Net Income",fn:y=>fM(fin[y]?.netIncome),c:"var(--text-primary)"},
                {l:"OE Rule #1",fn:y=>fM((fin[y]?.ocf||0)-(fin[y]?.capex||0)*0.7+(fin[y]?.taxProvision||0)),c:"#ff9f0a"},
                {l:"OE Claude",fn:y=>fM(comp[y]?.oe),c:"#64d2ff"},
              ].map((row,i)=>(
                <tr key={i} style={{background:i%2?"rgba(255,255,255,.015)":"transparent",fontWeight:i>=6?700:400}}>
                  <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"5px 12px",color:row.c,borderBottom:"1px solid #21262d",fontSize:i>=6?11.5:11}}>{row.l}</td>
                  {histYrs.map(y=><td key={y} style={{padding:"5px 6px",textAlign:"right",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)",color:row.c}}>{row.fn(y)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {/* Educational */}
        <Card style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:10,fontFamily:"var(--fd)"}}>📚 ¿Por qué dos cálculos?</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.7}}>
            <div>
              <strong style={{color:"#ff9f0a"}}>Rule #1 (Phil Town)</strong> — Parte del OCF, resta solo CapEx de mantenimiento (70%) y suma impuestos. Más fiel a la idea original de Buffett de "Owner Earnings". Produce un 10 Cap Price más alto.
            </div>
            <div>
              <strong style={{color:"#64d2ff"}}>Claude</strong> — Parte del Net Income, suma D&A y resta el CapEx total (100%). Más conservador porque asume que todo el CapEx es mantenimiento.
            </div>
          </div>
        </Card>
      </div>
    );
  };

  const renderScore = () => {
    const cats = [...new Set(scoreItems.map(x=>x.cat))];
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>★ Veredicto Final</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>Resumen ejecutivo con puntuación global y recomendación.</p>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
          <Card glow><DonutChart value={totalScore} size={140} label="Puntuación Global" sublabel="/100"/></Card>
          <Card glow><GaugeVerdict score={totalScore}/></Card>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          {cats.map(cat=>{
            const items = scoreItems.filter(x=>x.cat===cat);
            return (
              <Card key={cat} title={cat}>
                {items.map((it,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<items.length-1?"1px solid #21262d":"none"}}>
                    <div>
                      <div style={{fontSize:12,color:"var(--text-primary)",fontWeight:500}}>{it.name}</div>
                      <div style={{fontSize:18,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:2}}>{n(it.val)!=null?(typeof it.val==="number"&&it.rules===R.pio?`${it.val}/9`:it.rules===R.growth||it.rules===R.mos?fP(it.val):it.rules===R.d2fcf||it.rules===R.ic||it.rules===R.eve?fX(it.val):fP(it.val)):"—"}</div>
                    </div>
                    <Badge val={it.val} rules={it.rules}/>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>

        {/* Piotroski Detail */}
        <Card title="Piotroski F-Score" icon="🔬" badge={<Badge val={piotroski.score} rules={R.pio}/>}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {piotroski.items.map((it,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:it.pass?"rgba(48,209,88,.06)":"rgba(255,69,58,.06)",border:`1px solid ${it.pass?"rgba(48,209,88,.15)":"rgba(255,69,58,.15)"}`}}>
                <span style={{fontSize:14}}>{it.pass?"✓":"✗"}</span>
                <div><div style={{fontSize:11,color:it.pass?"var(--green)":"var(--red)",fontWeight:600}}>{it.name}</div>
                  <div style={{fontSize:9.5,color:"var(--text-tertiary)"}}>{it.desc}</div></div>
              </div>
            ))}
          </div>
        </Card>

        {/* Altman Z-Score Detail */}
        <Card title="Altman Z-Score" icon="📐" badge={altmanZ.score != null ? <span style={{fontSize:11,fontWeight:700,color:altmanZ.zoneColor,background:`${altmanZ.zoneColor}15`,padding:"4px 12px",borderRadius:100,border:`1px solid ${altmanZ.zoneColor}33`}}>{_sf(altmanZ.score,2)} — {altmanZ.zone}</span> : null} style={{marginTop:16}}>
          {altmanZ.score != null ? (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:12}}>
                {altmanZ.items.map((it,i)=>(
                  <div key={i} style={{padding:"8px",borderRadius:8,background:"rgba(255,255,255,.03)",textAlign:"center"}}>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:4}}>{it.name.split(":")[0]}</div>
                    <div style={{fontSize:16,fontWeight:700,color:it.weighted>0?"var(--text-primary)":"var(--red)",fontFamily:"var(--fm)"}}>{_sf(it.weighted,2)}</div>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",marginTop:2}}>×{it.weight}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.6}}>
                Z = 1.2×(WC/A) + 1.4×(RE/A) + 3.3×(EBIT/A) + 0.6×(MCap/Deuda) + 1.0×(Ventas/A). {'>'} 2.99 = zona segura, {'<'} 1.81 = riesgo de quiebra.
              </div>
            </div>
          ) : <div style={{color:"var(--text-tertiary)",fontSize:12,textAlign:"center",padding:16}}>Introduce datos para calcular</div>}
        </Card>

        {/* WACC Detail */}
        <Card title="WACC Calculado" icon="🧮" style={{marginTop:16}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12}}>
            {[{l:"WACC",v:fP(wacc.wacc)},{l:"Coste Equity (Ke)",v:fP(wacc.costEquity)},{l:"Coste Deuda (Kd)",v:fP(wacc.costDebt)},{l:"Peso Equity",v:fP(wacc.weightE)},{l:"Peso Deuda",v:fP(wacc.weightD)},{l:"Beta",v:f2(cfg.beta)},{l:"Tasa libre riesgo",v:fP(cfg.riskFree/100)},{l:"Prima mercado",v:fP(cfg.marketPremium/100)}].map((x,i)=>(
              <div key={i}><div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>{x.l}</div>
                <div style={{fontSize:16,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:2}}>{x.v}</div></div>
            ))}
          </div>
          <div style={{marginTop:12,fontSize:11,color:"var(--text-tertiary)",lineHeight:1.6}}>
            WACC = (E/V)×Ke + (D/V)×Kd×(1-t) · Ke = Rf + β×(Rm-Rf) · Kd = Intereses/Deuda×(1-t)
          </div>
        </Card>

        <Card style={{marginTop:16}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:8,fontFamily:"var(--fd)"}}>📝 Notas y Tesis de Inversión</div>
          <textarea placeholder="Escribe tu tesis: ¿por qué invertir? ¿Cuáles son los riesgos? ¿Catalizadores? ¿Precio objetivo?" style={{width:"100%",minHeight:120,padding:12,background:"#000",border:"1px solid #21262d",borderRadius:8,color:"var(--text-primary)",fontSize:12,resize:"vertical",outline:"none",fontFamily:"inherit",lineHeight:1.6}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
        </Card>
      </div>
    );
  };

  // ══════════════════════════════════════════
  // DIVIDENDOS DEEP DIVE
  // ══════════════════════════════════════════
  // ══════════════════════════════════════════
  // DIVIDENDOS — Fusión Análisis + Estilo SSD
  // ══════════════════════════════════════════
  const renderDividends = () => {
    const S = ssd;
    const da = divAnalysis;
    const divYield = cfg.price > 0 && LD.dps > 0 ? LD.dps / cfg.price : null;
    const pe = LD.eps > 0 ? cfg.price / LD.eps : null;
    const histYrs = YEARS.slice(0, 14).reverse();
    const safetyColor = S.safetyScore >= 80 ? "#30d158" : S.safetyScore >= 60 ? "#8BC34A" : S.safetyScore >= 40 ? "#ff9f0a" : "#ff453a";
    const safetyBg = S.safetyScore >= 80 ? "rgba(48,209,88,.08)" : S.safetyScore >= 60 ? "rgba(139,195,74,.08)" : S.safetyScore >= 40 ? "rgba(255,159,10,.08)" : "rgba(255,69,58,.08)";

    // Color helper — always returns hex for composability
    const cGreen = "#30d158", cRed = "#ff453a", cYellow = "#ffd60a", cGold = "#d69e2e", cBlue = "#64d2ff", cOrange = "#ff9f0a";

    const DivBar = ({data, colorFn, formatFn, height=90}) => {
      const vals = data.map(d=>d.v).filter(v=>v!=null&&!isNaN(v));
      const max = Math.max(...vals.map(Math.abs), 0.001);
      return (
        <div style={{display:"flex", alignItems:"flex-end", gap:3, height, padding:"0 4px"}}>
          {data.map((d,i) => {
            const v = d.v; const hasVal = v!=null&&!isNaN(v);
            const h = hasVal ? Math.max(Math.abs(v)/max*100, 4) : 4;
            const col = hasVal && colorFn ? colorFn(v,d.y,i) : "#333";
            const label = hasVal && formatFn ? formatFn(v) : "";
            return (
              <div key={i} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", height:"100%"}}>
                {label && <div style={{fontSize:7.5, color:"var(--text-secondary)", marginBottom:2, fontFamily:"var(--fm)", fontWeight:600, whiteSpace:"nowrap"}}>{label}</div>}
                <div style={{width:"100%", maxWidth:28, height:`${h}%`, background:col, opacity:0.75, borderRadius:"3px 3px 0 0", minHeight:3, transition:"height .5s"}}/>
                <div style={{fontSize:8, color:"var(--text-tertiary)", marginTop:3, fontFamily:"var(--fm)", fontWeight:500}}>'{String(d.y).slice(2)}</div>
              </div>
            );
          })}
        </div>
      );
    };

    // Div growth years array for calculations
    const growthYrs = YEARS.slice(0,12).filter(y => fin[y]?.dps > 0);
    const divCAGR3 = da.cagr3;
    const divCAGR5 = da.cagr5;
    const divCAGR10 = da.cagr10;

    // FCF coverage ratio
    const fcfCoverage = L.fcf > 0 && LD.dps > 0 && LD.sharesOut > 0 ? L.fcf / (LD.dps * LD.sharesOut) : null;

    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div>
          <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>💰 Análisis de Dividendos</h2>
          <p style={{margin:0,fontSize:12,color:"var(--text-secondary)"}}>Safety Score, historial de crecimiento, payout ratios y métricas clave para inversores de dividendos a largo plazo.</p>
        </div>

        {/* ══════ SAFETY SCORE + YIELD HERO ══════ */}
        <Card glow style={{borderColor:`${safetyColor}33`}}>
          <div style={{display:"grid",gridTemplateColumns:"120px 1fr 120px",gap:20,alignItems:"center"}}>
            {/* Safety circle */}
            <div style={{textAlign:"center"}}>
              <div style={{width:84,height:84,borderRadius:"50%",border:`4px solid ${safetyColor}`,display:"flex",alignItems:"center",justifyContent:"center",background:safetyBg,margin:"0 auto"}}>
                <span style={{fontSize:34,fontWeight:900,color:safetyColor,fontFamily:"var(--fm)"}}>{S.safetyScore}</span>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:safetyColor,marginTop:8}}>{S.safetyLabel}</div>
              {S.safetyDate && <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:3}}>Upd. {S.safetyDate}</div>}
            </div>
            {/* Middle metrics */}
            <div>
              {S.safetyNote && <div style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.7,marginBottom:12,padding:"10px 14px",background:"rgba(255,255,255,.02)",borderRadius:8,borderLeft:`3px solid ${safetyColor}`}}>{S.safetyNote}</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {[
                  {l:"Payout Ratio",v:`${_sf(S.payoutRatio*100,0)}%`,c:S.payoutRatio<0.6?cGreen:S.payoutRatio<0.8?cYellow:cRed},
                  {l:"FCF Payout",v:fP(da.payoutFCF),c:da.payoutFCF&&da.payoutFCF<0.7?cGreen:cOrange},
                  {l:"Deuda/EBITDA",v:(S.ndEbitda!=null?_sf(S.ndEbitda,1)+"x":"—"),c:S.ndEbitda<3?cGreen:S.ndEbitda<5?cYellow:cRed},
                  {l:"FCF Coverage",v:fcfCoverage?_sf(fcfCoverage,1)+"x":"—",c:fcfCoverage&&fcfCoverage>2?cGreen:fcfCoverage&&fcfCoverage>1.5?cYellow:cRed},
                ].map((x,i)=>(
                  <div key={i} style={{padding:"10px 8px",borderRadius:8,background:"rgba(255,255,255,.03)",textAlign:"center",border:"1px solid rgba(255,255,255,.04)"}}>
                    <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>{x.l}</div>
                    <div style={{fontSize:18,fontWeight:700,color:x.c,fontFamily:"var(--fm)"}}>{x.v}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Yield */}
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:1}}>YIELD</div>
              <div style={{fontSize:38,fontWeight:800,color:cGold,fontFamily:"var(--fm)",lineHeight:1,marginTop:4}}>{fP(divYield)}</div>
              <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:6}}>${LD.dps?.toFixed(2)||"—"}/acción</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:3}}>{S.frequency}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{S.taxation}</div>
            </div>
          </div>
        </Card>

        {/* ══════ KEY DIVIDEND METRICS ══════ */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10}}>
          {[
            {l:"Racha Crecim.",v:`${S.growthStreak} años`,c:S.growthStreak>=10?cGreen:S.growthStreak>=5?cYellow:cRed},
            {l:"Sin Interrupción",v:`${S.uninterruptedStreak} años`,c:S.uninterruptedStreak>=10?cGreen:S.uninterruptedStreak>=5?cYellow:cRed},
            {l:"Credit Rating",v:S.creditRating,c:S.creditRating?.startsWith("A")?cGreen:S.creditRating?.startsWith("BBB")?cYellow:cRed},
            {l:"P/E Ratio",v:pe?_sf(pe,1)+"x":"—",c:pe&&pe<(S.sectorPE||20)?cGreen:pe&&pe<25?cYellow:cOrange},
            {l:"Recesión 07-09",v:S.recessionDivAction,c:S.recessionDivAction==="Increased"?cGreen:cRed},
            {l:"Cobertura Int.",v:LD.interestExpense>0?_sf(LD.operatingIncome/LD.interestExpense,1)+"x":"—",c:LD.interestExpense>0&&LD.operatingIncome/LD.interestExpense>8?cGreen:LD.operatingIncome/LD.interestExpense>3?cYellow:cRed},
          ].map((x,i)=>(
            <Card key={i} style={{textAlign:"center",padding:"12px 6px"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:.3,marginBottom:6}}>{x.l}</div>
              <div style={{fontSize:17,fontWeight:700,color:x.c,fontFamily:"var(--fm)"}}>{x.v}</div>
            </Card>
          ))}
        </div>

        {/* ══════ SSD NOTES ══════ */}
        {S.notes?.length > 0 && <Card title="Notas de Análisis" icon="📝">
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {S.notes.map((note,i) => {
              const nc = note.score>=80?cGreen:note.score>=60?"#8BC34A":cOrange;
              return (
                <div key={i} style={{display:"flex",gap:14,padding:"12px 14px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid rgba(255,255,255,.04)"}}>
                  <div style={{width:42,height:42,borderRadius:"50%",border:`2.5px solid ${nc}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:16,fontWeight:800,color:nc,fontFamily:"var(--fm)"}}>{note.score}</span>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,color:"var(--text-primary)"}}>{note.title}</div>
                    <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:2}}>{note.type} · {note.date}</div>
                    <div style={{fontSize:10.5,color:"var(--text-secondary)",marginTop:4,lineHeight:1.6}}>{note.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>}

        {/* ══════ DIVIDEND GROWTH ══════ */}
        <Card title="Crecimiento del Dividendo" icon="📈">
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
            {[
              {l:"Últimos 12 Meses",v:S.growthLast12m},
              {l:"CAGR 5 Años",v:S.growthLast5y,sub:"anualizado"},
              {l:"CAGR 10 Años",v:S.growthLast10y,sub:"anualizado"},
            ].map((x,i)=>(
              <div key={i} style={{textAlign:"center",padding:"14px",background:"rgba(255,255,255,.025)",borderRadius:10,border:"1px solid rgba(255,255,255,.04)"}}>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:.5}}>{x.l}</div>
                <div style={{fontSize:28,fontWeight:800,color:x.v>=0?cGreen:cRed,fontFamily:"var(--fm)",marginTop:6}}>{_sf(x.v*100,1)}%</div>
                {x.sub && <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:2}}>{x.sub}</div>}
              </div>
            ))}
          </div>
          <div style={{fontSize:12,fontWeight:600,color:"var(--text-secondary)",marginBottom:10}}>Dividendo por Acción — Histórico</div>
          <DivBar data={histYrs.map(y=>({y,v:fin[y]?.dps||0}))} formatFn={v=>`$${_sf(v,2)}`}
            colorFn={(v,y,i)=>{const prev=i>0?(fin[histYrs[i-1]]?.dps||0):v;return v>prev?cGreen:v<prev?cRed:cGold;}} height={110}/>
        </Card>

        {/* ══════ PAYOUT + COVERAGE CHARTS ══════ */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Card title="Earnings Payout Ratio" icon="📊">
            <div style={{fontSize:10,color:"var(--text-tertiary)",marginBottom:10,lineHeight:1.5}}>% del EPS destinado a dividendo. Por debajo del 70% es preferible para sostenibilidad.</div>
            <DivBar data={histYrs.map(y=>({y, v:fin[y]?.eps>0&&fin[y]?.dps>0?fin[y].dps/fin[y].eps*100:null}))}
              colorFn={v=>v&&v<70?cGreen:v&&v<85?cOrange:cRed} formatFn={v=>`${_sf(v,0)}%`}/>
          </Card>
          <Card title="FCF Payout Ratio" icon="📊">
            <div style={{fontSize:10,color:"var(--text-tertiary)",marginBottom:10,lineHeight:1.5}}>% del Free Cash Flow destinado a dividendo. La métrica más fiable de cobertura.</div>
            <DivBar data={histYrs.map(y=>({y, v:comp[y]?.fcfps>0&&fin[y]?.dps>0?fin[y].dps/comp[y].fcfps*100:null}))}
              colorFn={v=>v&&v<70?cGreen:v&&v<85?cOrange:cRed} formatFn={v=>`${_sf(v,0)}%`}/>
          </Card>
        </div>

        {/* ══════ KEY FINANCIAL CHARTS (3×2) ══════ */}
        <Card title="Métricas Financieras Clave" icon="📉">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
            {[
              {t:"EPS",d:"Beneficio por acción. Motor del crecimiento del dividendo.",
                data:histYrs.map(y=>({y,v:fin[y]?.eps})), cf:v=>v>0?cBlue:cRed, ff:v=>`$${_sf(v,2)}`},
              {t:"FCF/Share",d:"Cash flow libre por acción. La fuente real del dividendo.",
                data:histYrs.map(y=>({y,v:comp[y]?.fcfps})), cf:v=>v>0?cGreen:cRed, ff:v=>`$${_sf(v,2)}`},
              {t:"Ventas ($B)",d:"Base de ingresos. Creciente = sostenibilidad del dividendo.",
                data:histYrs.map(y=>({y,v:fin[y]?.revenue?fin[y].revenue/1000:null})), cf:()=>cBlue, ff:v=>`${_sf(v,1)}`},
              {t:"ROE (%)",d:"Rentabilidad sobre patrimonio. >15% indica ventaja competitiva.",
                data:histYrs.map(y=>({y,v:comp[y]?.roe?comp[y].roe*100:null})), cf:v=>v>15?cGreen:v>10?cOrange:cRed, ff:v=>`${_sf(v,0)}%`},
              {t:"Acciones (M)",d:"Recompras reducen acciones y aumentan el dividendo por acción.",
                data:histYrs.map(y=>({y,v:fin[y]?.sharesOut})), cf:(v,y,i)=>i>0&&v<(fin[histYrs[i-1]]?.sharesOut||Infinity)?cGreen:cBlue, ff:v=>`${_sf(v,0)}`},
              {t:"Deuda Neta/EBITDA",d:"Años de EBITDA para saldar deuda. <3x preferido para seguridad.",
                data:histYrs.map(y=>({y,v:comp[y]?.ebitda>0?comp[y].netDebt/comp[y].ebitda:null})), cf:v=>v&&v<3?cGreen:v&&v<4?cOrange:cRed, ff:v=>`${_sf(v,1)}x`},
            ].map((ch,i)=>(
              <div key={i} style={{padding:"12px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid rgba(255,255,255,.04)"}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text-primary)",marginBottom:3}}>{ch.t}</div>
                <div style={{fontSize:9.5,color:"var(--text-tertiary)",lineHeight:1.5,marginBottom:8}}>{ch.d}</div>
                <DivBar data={ch.data} colorFn={ch.cf} formatFn={ch.ff} height={80}/>
              </div>
            ))}
          </div>
        </Card>

        {/* ══════ PAYMENT DETAILS ══════ */}
        <Card title="Detalles del Pago" icon="📅">
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
            {[
              {l:"Frecuencia",v:S.frequency,s:S.freqMonths},
              {l:"Pago Anual",v:`$${S.annualPayout?.toFixed(2)||"—"}`,s:"por acción"},
              {l:"Ex-Dividendo",v:S.exDivDate||"—",s:S.exDivStatus||""},
              {l:"Fecha Pago",v:S.payDate||"—",s:S.payDateStatus||""},
              {l:"Fiscalidad",v:S.taxation,s:S.taxForm},
            ].map((x,i)=>(
              <div key={i} style={{textAlign:"center",padding:"12px 8px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid rgba(255,255,255,.04)"}}>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:.5}}>{x.l}</div>
                <div style={{fontSize:15,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:5}}>{x.v}</div>
                <div style={{fontSize:9.5,color:"var(--text-tertiary)",marginTop:2}}>{x.s}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  };

  const renderGrowth = () => {
    const yrs5 = YEARS.slice(0,6); // 5y
    const yrs10 = YEARS.slice(0,11); // 10y
    const metrics = [
      {k:"revenue",l:"Ventas",fn:y=>fin[y]?.revenue},
      {k:"netIncome",l:"Beneficio Neto",fn:y=>fin[y]?.netIncome},
      {k:"eps",l:"EPS",fn:y=>fin[y]?.eps},
      {k:"bvps",l:"BVPS",fn:y=>comp[y]?.bvps},
      {k:"fcfps",l:"FCF/Acción",fn:y=>comp[y]?.fcfps},
      {k:"dps",l:"Dividendo/Acción",fn:y=>fin[y]?.dps},
    ];
    const calcCAGR = (metric, nYrs) => {
      const sliceYrs = YEARS.slice(0, nYrs+1);
      const vals = sliceYrs.map(y=>metric.fn(y));
      const end = vals[0]; const start = vals[nYrs];
      return cagrFn(end, start, nYrs);
    };
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📈 Crecimiento Histórico</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>CAGRs a 3, 5 y 10 años. Rule #1 exige ≥10% en las Big Five Numbers.</p>
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:140,fontFamily:"var(--fm)",fontSize:10}}>MÉTRICA</th>
              {["3a","5a","10a"].map(p=><th key={p} style={{padding:"10px 12px",textAlign:"center",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:90,fontFamily:"var(--fm)",fontSize:10}}>CAGR {p}</th>)}
              {YEARS.slice(0,8).map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:72,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
            </tr></thead>
            <tbody>{metrics.map((m,i)=>(
              <tr key={m.k} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"7px 14px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid #21262d"}}>{m.l}</td>
                {[3,5,10].map(p=>{
                  const c = calcCAGR(m, p);
                  const color = n(c)==null?"var(--text-tertiary)":c>=0.10?"var(--green)":c>=0.05?"var(--yellow)":c>=0?"var(--orange)":"var(--red)";
                  return <td key={p} style={{padding:"7px 12px",textAlign:"center",borderBottom:"1px solid #21262d"}}>
                    <span style={{fontSize:13,fontWeight:700,color,fontFamily:"var(--fm)"}}>{fP(c)}</span>
                  </td>;
                })}
                {YEARS.slice(0,8).map(y=>{
                  const v = m.fn(y);
                  return <td key={y} style={{padding:"7px 6px",textAlign:"right",color:n(v)!=null&&v<0?"var(--red)":"var(--text-primary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{m.k==="revenue"||m.k==="netIncome"?fM(v):fC(v)}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </Card>
        <Card style={{marginTop:16,background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:10,fontFamily:"var(--fd)"}}>🎯 ¿Qué busca Phil Town?</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.7}}>
            <div><strong style={{color:"var(--green)"}}>≥10% ✓ REGLA DE ORO</strong><br/>La empresa tiene un moat real y está creciendo. Es la señal más clara de una empresa Wonderful.</div>
            <div><strong style={{color:"var(--yellow)"}}>5–10% ⚠ ACEPTABLE</strong><br/>Puede ser un buen negocio pero sin ventaja competitiva clara. Requiere más análisis.</div>
            <div><strong style={{color:"var(--red)"}}>{"<"}5% ✗ EVITAR</strong><br/>Por debajo del umbral Rule #1. El capital se destruye o la empresa está estancada.</div>
          </div>
        </Card>

        {/* FMP Financial Growth — precalculated YoY growth rates */}
        {fmpExtra.finGrowth?.length > 0 && (
          <Card title="FMP Growth Rates (YoY precalculados)" icon="📊" style={{marginTop:16,overflowX:"auto",padding:0}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr>
                <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"8px 12px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9,minWidth:150}}>GROWTH RATE</th>
                {fmpExtra.finGrowth.slice(0,6).map((g,i)=><th key={i} style={{padding:"8px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9}}>{g.date?.slice(0,4)||g.calendarYear||"—"}</th>)}
              </tr></thead>
              <tbody>
                {[
                  {l:"Revenue Growth",k:"revenueGrowth"},
                  {l:"Net Income Growth",k:"netIncomeGrowth"},
                  {l:"EPS Growth",k:"epsDilutedGrowth"},
                  {l:"FCF Growth",k:"freeCashFlowGrowth"},
                  {l:"Dividend Growth",k:"dividendsPerShareGrowth"},
                  {l:"Book Value Growth",k:"bookValuePerShareGrowth"},
                  {l:"Operating CF Growth",k:"operatingCashFlowGrowth"},
                ].map((row,i)=>(
                  <tr key={row.k} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                    <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"6px 12px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid #21262d",fontSize:11}}>{row.l}</td>
                    {fmpExtra.finGrowth.slice(0,6).map((g,j)=>{
                      const v = g[row.k];
                      const color = v==null?"var(--text-tertiary)":v>=0.10?"var(--green)":v>=0.05?"var(--yellow)":v>=0?"var(--orange)":"var(--red)";
                      return <td key={j} style={{padding:"6px 6px",textAlign:"right",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)",color,fontWeight:600}}>
                        {v!=null?`${v>=0?"+":""}${_sf(v*100,1)}%`:"—"}
                      </td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════════
  // MARGIN OF SAFETY — 4 métodos
  // ══════════════════════════════════════════
  const renderMOS = () => {
    // ═══ RULE #1: Sticker Price ═══
    const epsTTM = LD.eps || 0;
    const bvps0 = comp[latestDataYear]?.bvps, bvps5 = comp[YEARS[5]]?.bvps;
    const bvpsCAGR = (bvps0>0 && bvps5>0) ? Math.pow(bvps0/bvps5, 1/5)-1 : null;
    const fgr = bvpsCAGR != null ? Math.min(Math.max(bvpsCAGR, 0.01), 0.20) : 0.08;
    const futureEPS = epsTTM > 0 ? epsTTM * Math.pow(1 + fgr, 10) : null;
    const historicalPEs = DATA_YEARS.map(y => {
      const e = fin[y]?.eps; const p = comp[y]?.price || cfg.price;
      return (e>0 && p) ? p/e : null;
    }).filter(v=>v!=null&&v>0&&v<100);
    const maxHistPE = historicalPEs.length ? Math.max(...historicalPEs) : 30;
    const futurePE = Math.min(fgr * 100 * 2, maxHistPE);
    const futureValue = futureEPS ? futureEPS * futurePE : null;
    const stickerPrice = futureValue ? futureValue / Math.pow(1.15, 10) : null;
    const mosPrice = stickerPrice ? stickerPrice * 0.5 : null;
    const stickerMOS = stickerPrice && cfg.price ? 1 - cfg.price/stickerPrice : null;

    // ═══ CLAUDE METHODS (sin repetir 10 Cap) ═══
    const dcfIV = dcf ? dcf.iv : null;
    const dcfMOS = dcf ? dcf.mos : null;
    const ebitdaFair = (L.ebitda>0 && LD.sharesOut) ? div((L.ebitda * 10) - (L.netDebt||0), LD.sharesOut) : null;
    const ebitdaMOS = (ebitdaFair && cfg.price) ? 1 - cfg.price/ebitdaFair : null;
    const grahamNum = (LD.eps>0 && L.bvps>0) ? Math.sqrt(22.5 * LD.eps * L.bvps) : null;
    const grahamMOS = (grahamNum && cfg.price) ? 1 - cfg.price/grahamNum : null;
    // ═══ FMP DCF (external validation) ═══
    const fmpDcfIV = fmpExtra.dcf?.dcf || null;
    const fmpDcfMOS = (fmpDcfIV && cfg.price) ? 1 - cfg.price/fmpDcfIV : null;
    // ═══ FMP Price Target (analyst consensus) ═══
    const ptIV = fmpExtra.priceTarget?.targetConsensus || null;
    const ptMOS = (ptIV && cfg.price) ? 1 - cfg.price/ptIV : null;

    const MethodBadge = ({label, color, icon}) => (
      <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:12,background:`${color}15`,border:`1px solid ${color}33`,fontSize:9,fontWeight:700,color,fontFamily:"var(--fm)"}}>{icon} {label}</span>
    );

    const allMethods = [
      {name:"Sticker Price (MOS)", desc:"EPS→FGR→Future P/E→descuento al 15% MARR", iv:stickerPrice, mos:stickerMOS, icon:"🏷", color:"#ff9f0a", badge:"RULE #1"},
      {name:"DCF A&R (10 años)", desc:"FCF + WACC + valor terminal", iv:dcfIV, mos:dcfMOS, icon:"△", color:"#64d2ff", badge:"A&R"},
      {name:"DCF FMP", desc:"Modelo DCF de Financial Modeling Prep", iv:fmpDcfIV, mos:fmpDcfMOS, icon:"◈", color:"#bf5af2", badge:"FMP"},
      {name:"EV/EBITDA (10x)", desc:"Precio si EV = 10× EBITDA", iv:ebitdaFair, mos:ebitdaMOS, icon:"⬡", color:"#64d2ff", badge:"A&R"},
      {name:"Graham Number", desc:"√(22.5 × EPS × BVPS)", iv:grahamNum, mos:grahamMOS, icon:"G", color:"#bf5af2", badge:"CLASSIC"},
      {name:"Analyst Consensus", desc:"Precio objetivo medio de analistas", iv:ptIV, mos:ptMOS, icon:"🎯", color:"#30d158", badge:"ANALYSTS"},
    ];
    const validMethods = allMethods.filter(m=>m.iv!=null&&m.iv>0);
    const avgIV = validMethods.length ? validMethods.reduce((a,m)=>a+m.iv,0)/validMethods.length : null;
    const avgMOS = avgIV && cfg.price ? 1 - cfg.price/avgIV : null;

    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>🛡 Margin of Safety</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>Phil Town: ¿A qué precio comprar con ≥50% de descuento sobre el valor intrínseco? Sticker Price + otros métodos.</p>

        {/* ══════ STICKER PRICE DETAIL ══════ */}
        <Card glow style={{marginBottom:16,borderColor:"rgba(255,159,10,.2)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <MethodBadge label="RULE #1" color="#ff9f0a" icon="📖"/>
            <div style={{fontSize:14,fontWeight:600,color:"var(--text-primary)"}}>Sticker Price — Fórmula de Phil Town</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            {[
              {l:"EPS TTM",v:fC(epsTTM)},{l:"FGR (BVPS CAGR 5a)",v:fP(fgr)},{l:"Future EPS (10a)",v:fC(futureEPS)},
              {l:"Future P/E (2×FGR)",v:f2(futurePE)+"x"},{l:"Sticker Price",v:fC(stickerPrice),c:"#ff9f0a"},{l:"MOS Price (50%)",v:fC(mosPrice),c:"var(--gold)"},
            ].map((x,i)=>(
              <div key={i} style={{padding:"10px",borderRadius:8,background:"rgba(255,255,255,.02)",textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",marginBottom:4}}>{x.l}</div>
                <div style={{fontSize:17,fontWeight:700,color:x.c||"var(--text-primary)",fontFamily:"var(--fm)"}}>{x.v}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:16,alignItems:"center",padding:"12px 0",borderTop:"1px solid #21262d"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>STICKER PRICE</div>
              <div style={{fontSize:32,fontWeight:800,color:"#ff9f0a",fontFamily:"var(--fm)"}}>{fC(stickerPrice)}</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>TU PRECIO</div>
              <div style={{fontSize:32,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{fC(cfg.price)}</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>MOS PRICE (50%)</div>
              <div style={{fontSize:32,fontWeight:800,color:cfg.price<=mosPrice?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{fC(mosPrice)}</div>
            </div>
          </div>
          <div style={{fontSize:10,color:"var(--text-secondary)",lineHeight:1.5,marginTop:8}}>
            <strong>Fórmula:</strong> EPS × (1 + FGR)^10 × Future P/E → descontar al 15% (MARR) → ÷2 = MOS Price. FGR = menor de tu estimación y analistas. Future P/E = 2 × FGR, tope en máximo P/E histórico.
          </div>
        </Card>

        {/* ══════ RESUMEN COMBINADO ══════ */}
        <Card glow style={{marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:16,alignItems:"center"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:700,fontFamily:"var(--fm)"}}>VALOR INTRÍNSECO MEDIO</div>
              <div style={{fontSize:32,fontWeight:800,color:"var(--gold)",fontFamily:"var(--fm)",marginTop:4}}>{fC(avgIV)}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>{validMethods.length} métodos</div>
            </div>
            <div style={{width:1,height:50,background:"var(--border)"}}/>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:700,fontFamily:"var(--fm)"}}>MARGIN OF SAFETY</div>
              <div style={{fontSize:32,fontWeight:800,color:avgMOS>0.30?"var(--green)":avgMOS>0?"var(--yellow)":"var(--red)",fontFamily:"var(--fm)",marginTop:4}}>{fP(avgMOS)}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>Precio: {fC(cfg.price)}</div>
            </div>
          </div>
        </Card>

        {/* ══════ ALL METHODS GRID ══════ */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
          {allMethods.map((m,i)=>{
            const barColor = m.mos>0.30?"var(--green)":m.mos>0.15?"var(--yellow)":m.mos>0?"var(--orange)":"var(--red)";
            const barW = m.mos!=null ? Math.min(Math.max(m.mos*100, 0), 100) : 0;
            return (
              <Card key={i} style={{borderColor:m.badge==="RULE #1"?"rgba(255,159,10,.15)":m.badge==="CLASSIC"?"rgba(191,90,242,.15)":"rgba(100,210,255,.15)"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                  <span style={{fontSize:16}}>{m.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--text-primary)"}}>{m.name}</div>
                    <div style={{fontSize:9,color:"var(--text-tertiary)"}}>{m.desc}</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <div>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>V. Intrínseco</div>
                    <div style={{fontSize:18,fontWeight:700,color:m.color,fontFamily:"var(--fm)"}}>{fC(m.iv)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>MOS</div>
                    <div style={{fontSize:18,fontWeight:700,color:barColor,fontFamily:"var(--fm)"}}>{fP(m.mos)}</div>
                  </div>
                </div>
                <div style={{height:5,background:"rgba(255,255,255,.04)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:`${barW}%`,height:"100%",background:barColor,borderRadius:3,transition:"width .8s"}}/>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Tabla resumen */}
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>
              {["MÉTODO","V. INTRÍNSECO","MOS","PRECIO 50%","SEÑAL"].map((h,i)=>(
                <th key={i} style={{padding:"10px 12px",textAlign:i===0?"left":"center",color:i===0?"var(--gold)":"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {allMethods.map((m,i)=>{
                const mo = m.mos!=null?m.mos:null;
                const sg = mo==null?"—":mo>0.3?"COMPRAR":mo>0.15?"INTERESANTE":mo>0?"AJUSTADO":"CARO";
                const sc = sg==="COMPRAR"?"var(--green)":sg==="INTERESANTE"?"var(--gold)":sg==="AJUSTADO"?"var(--yellow)":"var(--red)";
                return (
                  <tr key={i} style={{background:i%2?"rgba(255,255,255,.015)":"transparent"}}>
                    <td style={{padding:"7px 12px",color:m.color,fontWeight:600,borderBottom:"1px solid #21262d"}}>{m.icon} {m.name}</td>
                    <td style={{padding:"7px 12px",textAlign:"center",fontWeight:700,color:m.color,borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fC(m.iv)}</td>
                    <td style={{padding:"7px 12px",textAlign:"center",fontWeight:700,color:sc,borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fP(m.mos)}</td>
                    <td style={{padding:"7px 12px",textAlign:"center",color:"var(--gold)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fC(m.iv?m.iv*0.5:null)}</td>
                    <td style={{padding:"7px 12px",textAlign:"center",borderBottom:"1px solid #21262d"}}>
                      <span style={{fontSize:9,fontWeight:700,color:sc,background:`${sc}15`,padding:"3px 10px",borderRadius:10,border:`1px solid ${sc}33`}}>{sg}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    );
  };

  // ══════════════════════════════════════════
  // FASTGRAPHS  // ══════════════════════════════════════════
  // FASTGRAPHS — EPS Justified Price Chart
  // ══════════════════════════════════════════
  const renderFastGraphs = () => {
    // Historical data (oldest → newest)
    const histYrs = YEARS.slice(0, 15).reverse(); // e.g. 2010..2024
    const getMetric = (y) => {
      if(fgMode === "fcf") return comp[y]?.fcfps;
      if(fgMode === "ocf") return div(fin[y]?.ocf, fin[y]?.sharesOut);
      return fin[y]?.eps;
    };

    // Filter valid historical years
    const validHist = histYrs.map(y => ({
      y, val: getMetric(y), price: null, div: fin[y]?.dps || 0
    })).filter(d => n(d.val) != null);

    // Projection years
    const lastHistY = validHist.length ? validHist[validHist.length - 1].y : YEARS[0];
    const lastVal = validHist.length ? validHist[validHist.length - 1].val : 0;
    const projData = Array.from({length: fgProjYears}, (_, i) => ({
      y: lastHistY + i + 1,
      val: lastVal > 0 ? lastVal * Math.pow(1 + fgGrowth / 100, i + 1) : null,
      projected: true,
    }));

    const allData = [...validHist, ...projData];

    // Current price point — place at most recent hist year
    const pricePoint = validHist.length ? { y: validHist[validHist.length - 1].y, price: cfg.price } : null;

    // Chart dims
    const W = 860, H = 420, PADL = 68, PADR = 24, PADT = 24, PADB = 48;
    const chartW = W - PADL - PADR;
    const chartH = H - PADT - PADB;

    // X scale: year → px
    const allYears = allData.map(d => d.y);
    const minY = allYears[0], maxY = allYears[allYears.length - 1];
    const xScale = y => PADL + ((y - minY) / (maxY - minY || 1)) * chartW;

    // Y scale: value → px (using EPS * PE as the "fair value" line)
    const epsFair = allData.map(d => d.val != null ? d.val * fgPE : null).filter(v => v != null);
    const allPrices = [cfg.price, ...epsFair].filter(v => v != null && v > 0);
    const rawMax = Math.max(...allPrices) * 1.15;
    const rawMin = Math.max(0, Math.min(...allPrices.filter(v => v > 0)) * 0.5);
    const yScale = v => PADT + chartH - ((v - rawMin) / (rawMax - rawMin || 1)) * chartH;
    const yNice = v => Math.round(v / 5) * 5;

    // Grid lines (Y)
    const gridCount = 6;
    const gridLines = Array.from({length: gridCount + 1}, (_, i) => {
      const val = rawMin + (rawMax - rawMin) * (i / gridCount);
      return {val, y: yScale(val)};
    });

    // Build polyline points
    const toPolyline = (pts) => pts.map(p => `${p.x},${p.y}`).join(" ");

    // EPS * PE orange "justified price" line (historical)
    const epsLinePts = validHist
      .map(d => n(d.val) != null ? {x: xScale(d.y), y: yScale(Math.max(d.val * fgPE, rawMin))} : null)
      .filter(Boolean);

    // EPS area below orange line (green shaded)
    const epsAreaPts = [
      ...epsLinePts,
      {x: xScale(validHist[validHist.length - 1]?.y || minY), y: yScale(rawMin)},
      {x: xScale(validHist[0]?.y || minY), y: yScale(rawMin)},
    ];

    // Projection justified price line (blue dashed)
    const projLinePts = projData
      .filter(d => n(d.val) != null)
      .map(d => ({x: xScale(d.y), y: yScale(Math.max(d.val * fgPE, rawMin))}));
    // Connect from last hist point
    const projConnectPt = epsLinePts.length ? epsLinePts[epsLinePts.length - 1] : null;
    const projFullLine = projConnectPt ? [projConnectPt, ...projLinePts] : projLinePts;

    // Projection area (blue shaded)
    const projAreaPts = projLinePts.length ? [
      projConnectPt || projLinePts[0],
      ...projLinePts,
      {x: xScale(projData[projData.length - 1]?.y || maxY), y: yScale(rawMin)},
      {x: xScale(lastHistY), y: yScale(rawMin)},
    ] : [];

    // Dividend stacked area (gold)
    const divLinePts = showDiv ? validHist
      .map(d => n(d.val) != null ? {x: xScale(d.y), y: yScale(Math.max((d.val + (d.div || 0)) * fgPE, rawMin))} : null)
      .filter(Boolean) : [];

    // Price line (black/white)
    // We place the current price as a dot at the last historical year
    const currentPriceY = cfg.price > 0 ? yScale(cfg.price) : null;
    const currentPriceX = validHist.length ? xScale(validHist[validHist.length - 1].y) : null;

    // P/E implied by current price vs latest EPS
    const latestEPS = getMetric(validHist[validHist.length - 1]?.y);
    const impliedPE = (latestEPS > 0 && cfg.price > 0) ? cfg.price / latestEPS : null;
    const fairPrice = latestEPS > 0 ? latestEPS * fgPE : null;
    const mosVsFair = (fairPrice && cfg.price > 0) ? 1 - cfg.price / fairPrice : null;
    const futureEPS = lastVal > 0 ? lastVal * Math.pow(1 + fgGrowth / 100, fgProjYears) : null;
    const futurePrice = futureEPS ? futureEPS * fgPE : null;
    const futureReturn = (futurePrice && cfg.price > 0) ? Math.pow(futurePrice / cfg.price, 1 / fgProjYears) - 1 : null;

    const modeBtn = (id, label) => (
      <button onClick={() => setFgMode(id)} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${fgMode===id?"var(--gold)":"var(--border)"}`,background:fgMode===id?"var(--gold-dim)":"transparent",color:fgMode===id?"var(--gold)":"var(--text-secondary)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .2s"}}>
        {label}
      </button>
    );

    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:12}}>
          <div>
            <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📊 FastGraphs — Precio vs Valor</h2>
            <p style={{margin:0,fontSize:12,color:"var(--text-secondary)"}}>Línea naranja = EPS × P/E Normal. Zona verde = histórico. Zona azul = proyección. Punto blanco = precio actual.</p>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {modeBtn("eps","EPS")}
            {modeBtn("fcf","FCF/Acc")}
            {modeBtn("ocf","OCF/Acc")}
            <button onClick={() => setShowDiv(!showDiv)} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${showDiv?"var(--gold)":"var(--border)"}`,background:showDiv?"rgba(255,214,10,.08)":"transparent",color:showDiv?"#ffd60a":"var(--text-secondary)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
              +Div
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:16}}>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
            <div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:6}}>P/E Normal</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="range" min={5} max={50} step={0.5} value={fgPE} onChange={e=>setFgPE(parseFloat(e.target.value))} style={{flex:1,accentColor:"var(--gold)"}}/>
              <span style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",minWidth:36}}>{fgPE}x</span>
            </div>
          </div>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
            <div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:6}}>Crecimiento Proy.</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="range" min={0} max={30} step={0.5} value={fgGrowth} onChange={e=>setFgGrowth(parseFloat(e.target.value))} style={{flex:1,accentColor:"#64d2ff"}}/>
              <span style={{fontSize:16,fontWeight:700,color:"#64d2ff",fontFamily:"var(--fm)",minWidth:42}}>{fgGrowth}%</span>
            </div>
          </div>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
            <div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:6}}>Años Proyectados</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="range" min={1} max={10} step={1} value={fgProjYears} onChange={e=>setFgProjYears(parseInt(e.target.value))} style={{flex:1,accentColor:"#bf5af2"}}/>
              <span style={{fontSize:16,fontWeight:700,color:"#bf5af2",fontFamily:"var(--fm)",minWidth:36}}>{fgProjYears}a</span>
            </div>
          </div>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
            <div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5}}>EPS / FCF Actual</div>
            <div style={{fontSize:22,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{fC(latestEPS)}</div>
          </div>
        </div>

        {/* The FastGraphs chart */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:20,overflowX:"auto"}}>
          <svg width={W} height={H} style={{display:"block",minWidth:520}}>
            <defs>
              <linearGradient id="epsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#30d158" stopOpacity="0.25"/>
                <stop offset="100%" stopColor="#30d158" stopOpacity="0.04"/>
              </linearGradient>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#64d2ff" stopOpacity="0.20"/>
                <stop offset="100%" stopColor="#64d2ff" stopOpacity="0.03"/>
              </linearGradient>
              <linearGradient id="divGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffd60a" stopOpacity="0.15"/>
                <stop offset="100%" stopColor="#ffd60a" stopOpacity="0"/>
              </linearGradient>
            </defs>

            {/* Background */}
            <rect x={PADL} y={PADT} width={chartW} height={chartH} fill="#0a0a0a" rx={4}/>

            {/* Grid lines */}
            {gridLines.map((g, i) => (
              <g key={i}>
                <line x1={PADL} y1={g.y} x2={PADL + chartW} y2={g.y} stroke="rgba(255,255,255,.05)" strokeWidth={1}/>
                <text x={PADL - 6} y={g.y + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,.3)" fontFamily="monospace">${yNice(g.val)}</text>
              </g>
            ))}

            {/* Vertical year lines */}
            {allYears.filter((y, i) => i % 2 === 0).map(y => (
              <g key={y}>
                <line x1={xScale(y)} y1={PADT} x2={xScale(y)} y2={PADT + chartH} stroke="rgba(255,255,255,.04)" strokeWidth={1}/>
                <text x={xScale(y)} y={PADT + chartH + 16} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,.3)" fontFamily="monospace">{y}</text>
              </g>
            ))}

            {/* Separator: hist vs projection */}
            {validHist.length > 0 && (
              <line x1={xScale(lastHistY)} y1={PADT} x2={xScale(lastHistY)} y2={PADT + chartH} stroke="rgba(255,255,255,.15)" strokeWidth={1} strokeDasharray="4,4"/>
            )}

            {/* EPS area (green) */}
            {epsAreaPts.length > 2 && (
              <polygon points={toPolyline(epsAreaPts)} fill="url(#epsGrad)"/>
            )}

            {/* Dividend stacked area (gold) */}
            {showDiv && divLinePts.length > 1 && (() => {
              const divArea = [
                ...divLinePts,
                ...epsLinePts.slice().reverse(),
              ];
              return <polygon points={toPolyline(divArea)} fill="url(#divGrad)"/>;
            })()}

            {/* Projection area (blue) */}
            {projAreaPts.length > 2 && (
              <polygon points={toPolyline(projAreaPts)} fill="url(#projGrad)"/>
            )}

            {/* EPS × PE line (orange) — historical */}
            {epsLinePts.length > 1 && (
              <polyline points={toPolyline(epsLinePts)} fill="none" stroke="#ff9f0a" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
            )}

            {/* Dividend adjusted line (gold dashed) */}
            {showDiv && divLinePts.length > 1 && (
              <polyline points={toPolyline(divLinePts)} fill="none" stroke="#ffd60a" strokeWidth={1.5} strokeDasharray="4,3" strokeLinejoin="round"/>
            )}

            {/* Projection justified price line (blue) */}
            {projFullLine.length > 1 && (
              <polyline points={toPolyline(projFullLine)} fill="none" stroke="#64d2ff" strokeWidth={2} strokeDasharray="6,3" strokeLinejoin="round" strokeLinecap="round"/>
            )}

            {/* EPS dots */}
            {epsLinePts.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={3} fill="#ff9f0a"/>
            ))}

            {/* Projected EPS dots */}
            {projLinePts.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={3} fill="#64d2ff" strokeWidth={1.5} stroke="#0a0a0a"/>
            ))}

            {/* Current price — horizontal dashed line across chart */}
            {currentPriceY != null && (
              <>
                <line x1={PADL} y1={currentPriceY} x2={PADL + chartW} y2={currentPriceY} stroke="rgba(255,255,255,.5)" strokeWidth={1} strokeDasharray="2,4"/>
                {/* Price dot at last hist year */}
                <circle cx={currentPriceX} cy={currentPriceY} r={6} fill="#ffffff" stroke="#000" strokeWidth={2}/>
                <text x={currentPriceX + 10} y={currentPriceY + 4} fontSize={10} fill="white" fontFamily="monospace" fontWeight="bold">{fC(cfg.price)}</text>
              </>
            )}

            {/* Labels */}
            <text x={PADL + 8} y={PADT + 16} fontSize={9} fill="#ff9f0a" fontFamily="monospace">● {fgMode.toUpperCase()} × {fgPE}x P/E = Valor Justo</text>
            {projLinePts.length > 0 && <text x={PADL + 8} y={PADT + 30} fontSize={9} fill="#64d2ff" fontFamily="monospace">-- Proyección +{fgGrowth}%/año</text>}
            {showDiv && <text x={PADL + 8} y={PADT + 44} fontSize={9} fill="#ffd60a" fontFamily="monospace">-- + Dividendo</text>}
          </svg>
        </div>

        {/* KPIs Row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:12,marginTop:16}}>
          {[
            {l:"P/E Actual vs Normal",v:`${fC(impliedPE,"" )}x vs ${fgPE}x`,c:impliedPE&&impliedPE<fgPE?"var(--green)":"var(--red)"},
            {l:"Precio Justo (EPS×PE)",v:fC(fairPrice),c:"var(--gold)"},
            {l:"MOS vs Precio Justo",v:fP(mosVsFair),c:mosVsFair>0.15?"var(--green)":mosVsFair>0?"var(--yellow)":"var(--red)"},
            {l:`EPS Proyectado (${fgProjYears}a)`,v:fC(futureEPS),c:"#64d2ff"},
            {l:`Precio Justo Futuro`,v:fC(futurePrice),c:"#64d2ff"},
            {l:`Retorno Anual Implícito`,v:fP(futureReturn),c:futureReturn>0.10?"var(--green)":futureReturn>0.05?"var(--yellow)":"var(--red)"},
          ].map((m,i)=>(
            <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
              <div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5}}>{m.l}</div>
              <div style={{fontSize:20,fontWeight:700,color:m.c||"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{m.v||"—"}</div>
            </div>
          ))}
        </div>

        {/* EPS history table */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:0,marginTop:16,overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>AÑO</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>{fgMode.toUpperCase()}/ACC</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>DIV/ACC</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>VALOR JUSTO (×PE)</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>+DIV (×PE)</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>CRECIM YoY</th>
              <th style={{padding:"10px 10px",textAlign:"center",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>PROYECTADO</th>
            </tr></thead>
            <tbody>
              {[...validHist, ...projData.map(d=>({...d,div:0}))].map((d,i,arr)=>{
                const prev = arr[i-1];
                const yoy = (prev && n(prev.val) && n(d.val) && prev.val > 0) ? (d.val - prev.val) / Math.abs(prev.val) : null;
                const fair = n(d.val) ? d.val * fgPE : null;
                const fairDiv = n(d.val) ? (d.val + (d.div||0)) * fgPE : null;
                const isProj = d.projected;
                return (
                  <tr key={d.y} style={{background:isProj?"rgba(100,210,255,.03)":i%2?"rgba(255,255,255,.02)":"transparent"}}>
                    <td style={{padding:"7px 14px",color:isProj?"#64d2ff":"var(--text-primary)",fontWeight:isProj?600:400,borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{d.y}{isProj?" ★":""}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:n(d.val)&&d.val<0?"var(--red)":"var(--orange)",fontWeight:600,borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fC(d.val)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:"#ffd60a",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{n(d.div)&&d.div>0?fC(d.div):"—"}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:n(fair)&&cfg.price&&fair<cfg.price?"var(--red)":"var(--green)",fontWeight:600,borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fC(fair)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:"#ffd60a",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fC(fairDiv)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:n(yoy)?yoy>=0?"var(--green)":"var(--red)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid #21262d"}}>{n(yoy)?fP(yoy):"—"}</td>
                    <td style={{padding:"7px 10px",textAlign:"center",borderBottom:"1px solid #21262d"}}>{isProj?<span style={{fontSize:9,fontWeight:600,color:"#64d2ff",fontFamily:"var(--fm)",letterSpacing:.5}}>PROY</span>:"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)",borderRadius:20,padding:20,marginTop:16}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:8,fontFamily:"var(--fd)"}}>📖 Cómo leer el FastGraphs</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.8}}>
            <div>
              <strong style={{color:"#ff9f0a"}}>Línea naranja</strong> — EPS (o FCF) × P/E normal. Es el "precio justo" histórico. Si el precio está POR DEBAJO de esta línea, la empresa está barata.<br/><br/>
              <strong style={{color:"#30d158"}}>Zona verde</strong> — área bajo la línea naranja. Representa el EPS acumulado que la empresa genera. Cuanto más grande, mejor negocio.
            </div>
            <div>
              <strong style={{color:"#64d2ff"}}>Línea azul discontinua</strong> — precio justo PROYECTADO con el crecimiento estimado. Es el retorno esperado si el mercado sigue el P/E normal.<br/><br/>
              <strong style={{color:"white"}}>Punto blanco</strong> — precio actual. Si está bajo la naranja → compra. Si está sobre la naranja → la acción está cara respecto a sus fundamentales.
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPayback = () => {
    const mktCap = cfg.price * (LD.sharesOut || 1);
    // ── Claude PBT: FCF directo + CAGR histórico ──
    const fcfBase = L.fcf > 0 ? L.fcf : 0;
    const fcfYrs = YEARS.filter(y => comp[y]?.fcf > 0);
    const fcfCAGR = fcfYrs.length >= 6 ? cagrFn(comp[fcfYrs[0]]?.fcf, comp[fcfYrs[Math.min(5, fcfYrs.length-1)]]?.fcf, Math.min(5, fcfYrs.length-1)) : null;
    const paybackGrowthClaude = (n(fcfCAGR) != null && fcfCAGR > 0) ? Math.min(fcfCAGR, 0.25) : 0.08;
    let pbtClaude = null;
    const pbtTableClaude = [];
    if(fcfBase > 0 && mktCap > 0) {
      let cum = 0;
      for(let i = 1; i <= 20; i++) {
        const fcfYear = fcfBase * Math.pow(1 + paybackGrowthClaude, i);
        cum += fcfYear;
        pbtTableClaude.push({year: i, fcf: fcfYear, cum, recovered: cum >= mktCap, pct: Math.min(cum/mktCap,1)});
        if(cum >= mktCap && !pbtClaude) pbtClaude = i;
      }
    }
    // ── Rule #1 PBT: FCF Ratio method (avg of 10,7,5,3 yr ratios) ──
    const calcFCFRatio = () => {
      const yrsData = DATA_YEARS.filter(y => {
        const ni = fin[y]?.netIncome;
        const ocf = fin[y]?.ocf;
        const pfcf = (fin[y]?.ocf||0) - (fin[y]?.capex||0);
        return ni > 0 && ocf > 0 && pfcf > 0;
      });
      if(yrsData.length < 3) return null;
      const ratios = yrsData.map(y => { const pfcf = fin[y].ocf - fin[y].capex; return pfcf / fin[y].netIncome; });
      const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
      const a10 = avg(ratios.slice(0, Math.min(10, ratios.length)));
      const a7 = avg(ratios.slice(0, Math.min(7, ratios.length)));
      const a5 = avg(ratios.slice(0, Math.min(5, ratios.length)));
      const a3 = avg(ratios.slice(0, Math.min(3, ratios.length)));
      const vals = [a10, a7, a5, a3].filter(v => v != null);
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    };
    const fcfRatioR1 = calcFCFRatio();
    const epsTTM = LD.eps || 0;
    const fcfPerShareR1 = fcfRatioR1 && epsTTM > 0 ? epsTTM * fcfRatioR1 : null;
    const fcfTotalR1 = fcfPerShareR1 ? fcfPerShareR1 * (LD.sharesOut||1) : null;
    const paybackGrowthR1 = paybackGrowthClaude;
    let pbtR1 = null;
    const pbtTableR1 = [];
    if(fcfTotalR1 > 0 && mktCap > 0) {
      let cum = 0;
      for(let i = 1; i <= 20; i++) {
        const fcfYear = fcfTotalR1 * Math.pow(1 + paybackGrowthR1, i);
        cum += fcfYear;
        pbtTableR1.push({year: i, fcf: fcfYear, cum, recovered: cum >= mktCap, pct: Math.min(cum/mktCap,1)});
        if(cum >= mktCap && !pbtR1) pbtR1 = i;
      }
    }
    const MethodBadge = ({label, color, icon}) => (
      <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:20,background:`${color}15`,border:`1px solid ${color}33`,fontSize:10,fontWeight:700,color,fontFamily:"var(--fm)",letterSpacing:.3}}>
        <span>{icon}</span>{label}
      </div>
    );
    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div>
          <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>⏱ Payback Time <span style={{fontSize:13,color:"var(--gold)",fontWeight:400}}>— Rule #1 vs Claude</span></h2>
          <p style={{margin:"0 0 4px",fontSize:12,color:"var(--text-secondary)"}}>Si compras toda la empresa, ¿en cuántos años te devuelve la inversión solo con el FCF creciente? Phil Town: ≤8 años.</p>
        </div>
        {/* Dual PBT cards */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Card glow style={{borderColor:"rgba(255,159,10,.2)"}}>
            <div style={{marginBottom:10}}><MethodBadge label="RULE #1 PBT" color="#ff9f0a" icon="📖"/></div>
            <div style={{fontSize:10,color:"var(--text-secondary)",marginBottom:12,lineHeight:1.5}}>
              <strong>FCF = EPS × FCF Ratio</strong> (ratio promediado 10/7/5/3a). Suaviza años atípicos usando la relación histórica entre earnings y cash flow.
            </div>
            <div style={{textAlign:"center",marginBottom:14}}>
              <div style={{fontSize:64,fontWeight:800,fontFamily:"var(--fm)",color:pbtR1&&pbtR1<=8?"var(--green)":pbtR1&&pbtR1<=12?"var(--yellow)":"var(--red)",lineHeight:1}}>
                {pbtR1 || "—"}
              </div>
              <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:4}}>años</div>
              {pbtR1 && <div style={{marginTop:6}}><Badge val={pbtR1} rules={R.payback}/></div>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:10}}>
              <div style={{padding:"6px 8px",borderRadius:6,background:"rgba(255,255,255,.02)"}}>
                <div style={{color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)"}}>FCF Ratio</div>
                <div style={{color:"#ff9f0a",fontWeight:700,fontFamily:"var(--fm)"}}>{fcfRatioR1 ? _sf(fcfRatioR1*100,0)+"%" : "—"}</div>
              </div>
              <div style={{padding:"6px 8px",borderRadius:6,background:"rgba(255,255,255,.02)"}}>
                <div style={{color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)"}}>FCF/Share</div>
                <div style={{color:"#ff9f0a",fontWeight:700,fontFamily:"var(--fm)"}}>{fC(fcfPerShareR1)}</div>
              </div>
            </div>
          </Card>
          <Card glow style={{borderColor:"rgba(100,210,255,.2)"}}>
            <div style={{marginBottom:10}}><MethodBadge label="CLAUDE PBT" color="#64d2ff" icon="🤖"/></div>
            <div style={{fontSize:10,color:"var(--text-secondary)",marginBottom:12,lineHeight:1.5}}>
              <strong>FCF = OCF − CapEx (directo)</strong> + CAGR histórico. Sin transformaciones, dato real del cash flow statement.
            </div>
            <div style={{textAlign:"center",marginBottom:14}}>
              <div style={{fontSize:64,fontWeight:800,fontFamily:"var(--fm)",color:pbtClaude&&pbtClaude<=8?"var(--green)":pbtClaude&&pbtClaude<=12?"var(--yellow)":"var(--red)",lineHeight:1}}>
                {pbtClaude || "—"}
              </div>
              <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:4}}>años</div>
              {pbtClaude && <div style={{marginTop:6}}><Badge val={pbtClaude} rules={R.payback}/></div>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:10}}>
              <div style={{padding:"6px 8px",borderRadius:6,background:"rgba(255,255,255,.02)"}}>
                <div style={{color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)"}}>FCF Base</div>
                <div style={{color:"#64d2ff",fontWeight:700,fontFamily:"var(--fm)"}}>{fM(fcfBase)}</div>
              </div>
              <div style={{padding:"6px 8px",borderRadius:6,background:"rgba(255,255,255,.02)"}}>
                <div style={{color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)"}}>CAGR FCF</div>
                <div style={{color:"#64d2ff",fontWeight:700,fontFamily:"var(--fm)"}}>{fP(paybackGrowthClaude)}</div>
              </div>
            </div>
          </Card>
        </div>
        {/* Dual Payback Table */}
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>
              <th style={{padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9}}>AÑO</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"#ff9f0a",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9}}>FCF R1</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"#ff9f0a",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9}}>ACUM R1</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"#64d2ff",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9}}>FCF Claude</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"#64d2ff",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9}}>ACUM Claude</th>
              <th style={{padding:"10px 8px",textAlign:"center",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9,color:"var(--text-secondary)"}}>PROGRESO</th>
            </tr></thead>
            <tbody>
              {Array.from({length:12},(_,i)=>i+1).map(yr=>{
                const r1 = pbtTableR1[yr-1]; const cl = pbtTableClaude[yr-1];
                const pctR1 = r1 ? Math.min(r1.cum/mktCap,1) : 0;
                const pctCl = cl ? Math.min(cl.cum/mktCap,1) : 0;
                return (
                  <tr key={yr} style={{background:yr%2?"rgba(255,255,255,.015)":"transparent"}}>
                    <td style={{padding:"6px 14px",color:yr===8?"var(--gold)":"var(--text-primary)",fontWeight:yr===8?700:400,borderBottom:"1px solid #21262d"}}>{yr}{yr===8?" ⭐":""}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:r1?.recovered?"var(--green)":"var(--text-secondary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{r1?fM(r1.fcf):"—"}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:r1?.recovered?"var(--green)":"#ff9f0a",fontWeight:r1?.recovered?700:400,borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{r1?fM(r1.cum):"—"}{r1?.recovered?" ✓":""}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:cl?.recovered?"var(--green)":"var(--text-secondary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{cl?fM(cl.fcf):"—"}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:cl?.recovered?"var(--green)":"#64d2ff",fontWeight:cl?.recovered?700:400,borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{cl?fM(cl.cum):"—"}{cl?.recovered?" ✓":""}</td>
                    <td style={{padding:"6px 8px",borderBottom:"1px solid #21262d"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:2}}>
                        <div style={{height:4,background:"#1a1a1a",borderRadius:2}}><div style={{width:`${_sf(pctR1*100,0)}%`,height:"100%",background:pctR1>=1?"var(--green)":"#ff9f0a",borderRadius:2}}/></div>
                        <div style={{height:4,background:"#1a1a1a",borderRadius:2}}><div style={{width:`${_sf(pctCl*100,0)}%`,height:"100%",background:pctCl>=1?"var(--green)":"#64d2ff",borderRadius:2}}/></div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        {/* Educational */}
        <Card style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:8,fontFamily:"var(--fd)"}}>💡 ¿Por qué el Payback Time?</div>
          <div style={{fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.8}}>
            El Payback Time es la herramienta más conservadora de Phil Town. <strong style={{color:"var(--text-primary)"}}>No descuenta los flujos futuros</strong> — simplemente pregunta: si compro toda la empresa al precio actual, ¿en cuántos años me devuelve mi inversión solo con el FCF creciente?
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11,color:"var(--text-secondary)",lineHeight:1.6,marginTop:12}}>
            <div><strong style={{color:"#ff9f0a"}}>Rule #1</strong> — Usa FCF Ratio (promediado 10/7/5/3 años) aplicado al EPS. Más robusto contra años atípicos.</div>
            <div><strong style={{color:"#64d2ff"}}>Claude</strong> — Usa el FCF directo (OCF − CapEx) con CAGR histórico. Dato real sin transformaciones.</div>
          </div>
        </Card>
      </div>
    );
  };

  // Each tab now has its own dedicated render — no more mega-tabs
  const renderResumen = () => <>{renderDash()}</>;
  const renderVerdict = () => <>{renderScore()}</>;
  const renderValuacionSingle = () => <>{renderValuation()}{renderDCF()}</>;

  const content = {dash:renderResumen,data:renderData,quality:renderQuality,debt:renderDebt,dividends:renderDividends,big5:renderBig5,tencap:renderTenCap,payback:renderPayback,valuation:renderValuacionSingle,mos:renderMOS,fastgraphs:renderFastGraphs,growth:renderGrowth,verdict:renderVerdict,report:()=>{
    // REPORT TAB: Renders ALL other tabs inline as a printable document
    const reportTabs = TABS.filter(t => t.id !== 'report' && t.id !== 'data');
    const renderers = {dash:renderResumen,quality:renderQuality,debt:renderDebt,dividends:renderDividends,big5:renderBig5,tencap:renderTenCap,payback:renderPayback,valuation:renderValuacionSingle,mos:renderMOS,fastgraphs:renderFastGraphs,growth:renderGrowth,verdict:renderVerdict};
    return (
      <div className="ar-report-print">
        <style>{`
          @media print {
            @page { size:A4 landscape; margin:6mm; }
            body, html { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
            header, footer, .ar-no-print, .ar-tabs-scroll { display:none !important; }
            main { padding:0 !important; }
            .ar-report-section { page-break-after:always; }
            .ar-report-section:last-child { page-break-after:avoid; }
          }
        `}</style>
        <div style={{background:"linear-gradient(135deg,#0d0a00,#1a1200)",border:"2px solid var(--gold)",borderRadius:16,padding:"20px 24px",marginBottom:24,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:22,fontWeight:800,color:"var(--gold)",fontFamily:"var(--fd)"}}>📄 Informe Completo — {cfg.ticker || "—"}</div>
            <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:4}}>{cfg.name} · {new Date().toLocaleDateString('es-ES')} · A&R v10.2</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:"var(--text-tertiary)",lineHeight:1.6}}>
              Para guardar como PDF:<br/>
              <strong style={{color:"var(--gold)"}}>Ctrl+P</strong> (o Cmd+P en Mac)<br/>
              Activa "Gráficos de fondo"
            </div>
          </div>
        </div>

        {reportTabs.map((t, idx) => {
          const renderer = renderers[t.id];
          if (!renderer) return null;
          let rendered;
          try { rendered = renderer(); } catch(e) { rendered = <div style={{color:"var(--red)",padding:20}}>Error renderizando {t.lbl}</div>; }
          return (
            <div key={t.id} className="ar-report-section" style={{marginBottom:32}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingBottom:8,borderBottom:"2px solid rgba(200,164,78,.2)"}}>
                <span style={{fontSize:16}}>{t.ico}</span>
                <span style={{fontSize:15,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fd)"}}>{t.lbl}</span>
                <span style={{marginLeft:"auto",fontSize:9,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:.8,fontFamily:"var(--fm)"}}>
                  {cfg.ticker} · Pág. {idx+1}/{reportTabs.length} · {new Date().toLocaleDateString('es-ES')}
                </span>
              </div>
              {rendered}
            </div>
          );
        })}

        <div style={{textAlign:"center",padding:20,color:"var(--text-tertiary)",fontSize:10,borderTop:"1px solid var(--border)",marginTop:20}}>
          A&R v10.2 · No constituye asesoramiento financiero · {new Date().toLocaleDateString('es-ES')}
        </div>
      </div>
    );
  }};

  // ── Scroll active tab into view ──
  useEffect(()=>{
    if(!tabsRef.current || viewMode!=="analysis") return;
    const active = tabsRef.current.querySelector('[data-active="true"]');
    if(active) active.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
  },[tab, viewMode]);

  // ── HOME VIEWS ──
  const HOME_TABS = [{id:"portfolio",lbl:"Portfolio",ico:"💼"},{id:"screener",lbl:"Screener",ico:"🔬"},{id:"trades",lbl:"Trades",ico:"📊"},{id:"patrimonio",lbl:"Patrimonio",ico:"🏛"},{id:"dashboard",lbl:"Dashboard",ico:"📊"},{id:"dividendos",lbl:"Dividendos",ico:"💰"},{id:"fire",lbl:"FIRE",ico:"🔥"},{id:"gastos",lbl:"Gastos",ico:"💸"},{id:"control",lbl:"Control",ico:"📋"},{id:"watchlist",lbl:"Watchlist",ico:"👁"},{id:"historial",lbl:"Historial",ico:"📦"},{id:"research",lbl:"Research",ico:"🔍"}];

  const CompanyRow = ({p, showPos, onOpen}) => {
    const ccy = p.ccy || p.currency || "USD";
    const origSym = CURRENCIES[ccy]?.symbol || "$";
    const ccyFlag = CURRENCIES[ccy]?.flag || "";
    const isForeign = ccy !== "USD";
    const priceUSD = p.priceUSD ?? 0;
    const costUSD = p.costUSD ?? 0;
    const valueUSD = p.valueUSD ?? 0;
    const valueEUR = p.valueEUR ?? 0;
    const weight = p.weight ?? 0;
    const pnlPct = p.pnlPct ?? 0;
    const pnlUSD = p.pnlUSD ?? 0;
    const dpsUSD = p.dpsUSD ?? 0;
    const showUSD = displayCcy === "USD";
    const valShow = showUSD ? valueUSD : valueEUR;
    const valSym = showUSD ? "$" : "€";
    const valOther = showUSD ? valueEUR : valueUSD;
    const valOtherSym = showUSD ? "€" : "$";
    return (
      <div style={{display:"grid",gridTemplateColumns:showPos?"52px 1.4fr 90px 80px 80px 75px 68px 90px 75px 48px":"52px 1fr 90px 90px 48px",gap:6,alignItems:"center",padding:"10px 16px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,cursor:"pointer",transition:"all .2s",minHeight:54}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--border-hover)";e.currentTarget.style.background="var(--card-hover)";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--card)";}}>
        {/* Logo */}
        <div onClick={()=>onOpen(p.ticker)} style={{width:42,height:42,borderRadius:10,background:"linear-gradient(135deg,#d69e2e,#8B6914)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:p.ticker.length>3?8:11,fontWeight:800,color:"#000",fontFamily:"var(--fm)",cursor:"pointer",flexShrink:0}}>{p.ticker.slice(0,4)}</div>
        {/* Name */}
        <div onClick={()=>onOpen(p.ticker)} style={{cursor:"pointer",minWidth:0,paddingRight:4}}>
          <div style={{fontSize:14,fontWeight:600,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.3}}>{p.name||p.ticker}</div>
          <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"flex",alignItems:"center",gap:4,marginTop:1}}>
            {p.ticker}
          </div>
        </div>
        {/* Price — shows in original currency with flag, USD equivalent below for foreign */}
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.3}}>PRECIO</div>
          <div style={{fontSize:15,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",lineHeight:1.3,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
            <span style={{fontSize:10,opacity:.45}}>{ccyFlag}</span>{origSym}{(p.lastPrice||0).toFixed(ccy==="HKD"?1:2)}
          </div>
          {isForeign && <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.5}}>${_sf(priceUSD,2)}</div>}
        </div>
        {showPos && <>
          {/* Shares */}
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.3}}>ACCIONES</div>
            <div style={{fontSize:15,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",lineHeight:1.3}}>{p.shares?(p.shares||0).toLocaleString():"—"}</div>
          </div>
          {/* Cost — shows in original currency with flag, USD equivalent below for foreign */}
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.3}}>COSTE</div>
            <div style={{fontSize:15,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",lineHeight:1.3,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
              <span style={{fontSize:10,opacity:.45}}>{ccyFlag}</span>{origSym}{_sf(p.adjustedBasis||p.avgCost||0,2)}
            </div>
            {isForeign && <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.5}}>${_sf(costUSD,2)}</div>}
          </div>
          {/* P&L */}
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.3}}>P&L</div>
            <div style={{fontSize:15,fontWeight:700,color:pnlPct>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)",lineHeight:1.3}}>{pnlPct>=0?"+":""}{_sf(pnlPct*100,0)}%</div>
          </div>
          {/* Weight */}
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.3}}>PESO</div>
            <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",lineHeight:1.3}}>{_sf(weight*100,1)}%</div>
            <div style={{height:3,background:"rgba(255,255,255,.06)",borderRadius:2,marginTop:2,overflow:"hidden"}}>
              <div style={{width:`${Math.min(weight*100*4,100)}%`,height:"100%",background:"var(--gold)",borderRadius:2}}/>
            </div>
          </div>
          {/* Value USD/EUR */}
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.3}}>{showUSD?"USD VAL":"EUR VAL"}</div>
            <div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",lineHeight:1.3}}>{valSym}{valShow>=1e3?_sf(valShow/1e3,1)+"K":_sf(valShow,0)}</div>
            <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.45}}>{valOtherSym}{valOther>=1e3?_sf(valOther/1e3,1)+"K":_sf(valOther,0)}</div>
          </div>
          {/* Div/Year */}
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.3}}>DIV/AÑO</div>
            <div style={{fontSize:14,fontWeight:700,color:dpsUSD>0?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",lineHeight:1.3}}>{dpsUSD>0?"$"+_sf(p.divAnnualUSD||0,0):"—"}</div>
          </div>
        </>}
        {!showPos && <>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>TARGET</div>
            <div style={{fontSize:15,fontWeight:700,color:p.targetPrice&&p.lastPrice&&p.lastPrice<=p.targetPrice?"var(--green)":"var(--text-secondary)",fontFamily:"var(--fm)"}}>{p.targetPrice?"$"+(toUSD(p.targetPrice,ccy)||0).toFixed(2):"—"}</div>
          </div>
        </>}
        {/* Actions */}
        <div style={{display:"flex",gap:3,justifyContent:"flex-end"}}>
          <button onClick={(e)=>{e.stopPropagation();openCostBasis(p.ticker);}} title="Cost Basis" style={{width:32,height:32,borderRadius:8,border:"1px solid rgba(200,164,78,.25)",background:"rgba(200,164,78,.06)",color:"var(--gold)",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>📋</button>
        </div>
      </div>
    );
  };

  // ── Cost Basis calculations (component level) ──
  const cbCalc = useMemo(() => {
    const pos = positions[cbTicker] || {};
    const txns = cbTransactions;
    let totalShares = 0, totalCost = 0, totalDivs = 0, totalOptCredit = 0, totalFees = 0;
    const sorted = [...txns].sort((a,b) => new Date(a.date) - new Date(b.date));
    sorted.forEach(t => {
      if(t.type === "buy") { totalShares += (t.shares||0); totalCost += (t.shares||0) * (t.price||0) + (t.fees||0); totalFees += (t.fees||0); }
      if(t.type === "sell") { totalShares -= (t.shares||0); totalCost -= (t.shares||0) * (t.price||0) - (t.fees||0); totalFees += (t.fees||0); }
      if(t.type === "dividend") { totalDivs += (t.dps||0) * (t.shares || totalShares); }
      if(t.type === "option") { totalOptCredit += (t.optCredit||0) * (t.optContracts||1) * 100; totalFees += (t.fees||0); }
      if(t.type === "fee") { totalFees += (t.fees||0); totalCost += (t.fees||0); }
    });
    const avgCost = totalShares > 0 ? totalCost / totalShares : 0;
    const adjustedBasis = totalShares > 0 ? (totalCost - totalDivs - totalOptCredit) / totalShares : 0;
    const currentPrice = pos.lastPrice || 0;
    const pnlVsAvg = totalShares > 0 && avgCost !== 0 ? ((currentPrice - avgCost) / Math.abs(avgCost)) : 0;
    const pnlVsBasis = totalShares > 0 && adjustedBasis > 0 ? ((currentPrice - adjustedBasis) / adjustedBasis) : 0;
    const divYield = adjustedBasis > 0 && pos.dps > 0 ? pos.dps / adjustedBasis : 0;
    return {totalShares, totalCost, avgCost, adjustedBasis, totalDivs, totalOptCredit, totalFees, currentPrice, pnlVsAvg, pnlVsBasis, divYield};
  }, [cbTransactions, cbTicker, positions]);

  // ── Cost Basis form state ──
  const [cbShowForm, setCbShowForm] = useState(false);
  const [cbFormType, setCbFormType] = useState("buy");
  const [cbForm, setCbForm] = useState({date:"",shares:0,price:0,fees:0,dps:0,optType:"sell_put",optExpiry:"",optStrike:0,optContracts:0,optCredit:0,optStatus:"expired",note:""});

  // ══════════════════════════════════════════
  // COST BASIS VIEW
  // ══════════════════════════════════════════
  const renderCostBasis = () => {
    const pos = positions[cbTicker] || {};
    const txns = cbTransactions;
    const ccy = pos.currency || "USD";
    const sym = CURRENCIES[ccy]?.symbol || "$";
    const showForm = cbShowForm;
    const setShowForm = setCbShowForm;
    const formType = cbFormType;
    const setFormType = setCbFormType;
    const form = cbForm;
    const upForm = (k,v) => setCbForm(p=>({...p,[k]:v}));

    const calc = cbCalc;

    const handleSubmit = () => {
      const txn = {type: formType, date: form.date || new Date().toISOString().slice(0,10)};
      if(formType === "buy" || formType === "sell") { txn.shares = form.shares; txn.price = form.price; txn.fees = form.fees; }
      if(formType === "dividend") { txn.dps = form.dps; txn.shares = form.shares || calc.totalShares; }
      if(formType === "option") { txn.optType = form.optType; txn.optExpiry = form.optExpiry; txn.optStrike = form.optStrike; txn.optContracts = form.optContracts; txn.optCredit = form.optCredit; txn.optStatus = form.optStatus; txn.fees = form.fees; }
      if(formType === "fee") { txn.fees = form.fees; txn.note = form.note; }
      addTransaction(txn);
      setCbForm({date:"",shares:0,price:0,fees:0,dps:0,optType:"sell_put",optExpiry:"",optStrike:0,optContracts:0,optCredit:0,optStatus:"expired",note:""});
      setCbShowForm(false);
    };

    const typeColors = {buy:"#30d158",sell:"#ff453a",dividend:"#d69e2e",option:"#64d2ff",fee:"#ff9f0a"};
    const typeLabels = {buy:"COMPRA",sell:"VENTA",dividend:"DIVIDENDO",option:"OPCIÓN",fee:"COMISIÓN"};
    const optLabels = {sell_put:"Sell Put",sell_call:"Covered Call",buy_call:"Buy Call",buy_put:"Buy Put"};
    const statusLabels = {expired:"Expirada",assigned:"Asignada",closed:"Cerrada",open:"Abierta"};

    return (
      <div style={{maxWidth:1400,margin:"0 auto"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24}}>
          <button onClick={goHome} style={{padding:"8px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:13,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:600}}>← Portfolio</button>
          <div style={{width:50,height:50,borderRadius:14,background:"linear-gradient(135deg,#d69e2e,#8B6914)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:cbTicker?.length>3?10:14,fontWeight:800,color:"#000",fontFamily:"var(--fm)"}}>{(cbTicker||"?").slice(0,4)}</div>
          <div>
            <div style={{fontSize:24,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>{pos.name || cbTicker}</div>
            <div style={{fontSize:12,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{cbTicker} · {ccy} · Cost Basis Tracker</div>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            <button onClick={()=>setShowForm(!showForm)} style={{padding:"8px 18px",borderRadius:10,border:"1px solid var(--gold)",background:showForm?"var(--gold-dim)":"transparent",color:"var(--gold)",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>+ Transacción</button>
            <label style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(100,210,255,.25)",background:"rgba(100,210,255,.06)",color:"#64d2ff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
              ↑ Importar
              <input type="file" accept=".json,.csv" style={{display:"none"}} onChange={e=>{
                const file = e.target.files[0]; if(!file) return;
                const reader = new FileReader();
                reader.onload = ev => { importTransactions(ev.target.result); };
                reader.readAsText(file);
              }}/>
            </label>
            <button onClick={()=>{
              const data = JSON.stringify(cbTransactions, null, 2);
              const blob = new Blob([data],{type:"application/json"});
              const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=`${cbTicker}_costbasis.json`; a.click(); URL.revokeObjectURL(url);
            }} style={{padding:"8px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:13,cursor:"pointer",fontFamily:"var(--fm)"}}>↓ Exportar</button>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:12,marginBottom:20}}>
          {[
            {l:"PRECIO ACTUAL",v:`${sym}${_sf(calc.currentPrice,2)}`,c:"var(--text-primary)"},
            {l:"AVG PRICE",v:`${sym}${_sf(calc.avgCost,2)}`,c:"var(--text-secondary)",sub:`P&L: ${calc.pnlVsAvg>=0?"+":""}${_sf(calc.pnlVsAvg*100,1)}%`,sc:calc.pnlVsAvg>=0?"var(--green)":"var(--red)"},
            {l:"ADJUSTED BASIS",v:`${sym}${_sf(calc.adjustedBasis,2)}`,c:"var(--gold)",sub:`P&L: ${calc.pnlVsBasis>=0?"+":""}${_sf(calc.pnlVsBasis*100,1)}%`,sc:calc.pnlVsBasis>=0?"var(--green)":"var(--red)"},
            {l:"DIVIDENDOS",v:`${sym}${_sf(calc.totalDivs,0)}`,c:"#30d158",sub:calc.divYield>0?`Yield/Basis: ${_sf(calc.divYield*100,1)}%`:null},
            {l:"OPTIONS CREDIT",v:`${sym}${_sf(calc.totalOptCredit,0)}`,c:"#64d2ff"},
            {l:"ACCIONES",v:(calc.totalShares||0).toLocaleString(),c:"var(--text-primary)",sub:`Fees: ${sym}${_sf(calc.totalFees,0)}`},
          ].map((m,i)=>(
            <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:18,padding:"16px 18px"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.6}}>{m.l}</div>
              <div style={{fontSize:24,fontWeight:700,color:m.c,fontFamily:"var(--fm)",marginTop:4}}>{m.v}</div>
              {m.sub && <div style={{fontSize:11,color:m.sc||"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2,fontWeight:600}}>{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* Add Transaction Form */}
        {showForm && (
          <div style={{background:"var(--card)",border:"1px solid var(--gold-dim)",borderRadius:18,padding:20,marginBottom:20}}>
            <div style={{fontSize:14,color:"var(--gold)",fontWeight:600,fontFamily:"var(--fd)",marginBottom:14}}>Nueva Transacción</div>
            {/* Type selector */}
            <div style={{display:"flex",gap:6,marginBottom:16}}>
              {["buy","sell","dividend","option","fee"].map(t=>(
                <button key={t} onClick={()=>setFormType(t)} style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${formType===t?typeColors[t]:"var(--border)"}`,background:formType===t?`${typeColors[t]}15`:"transparent",color:formType===t?typeColors[t]:"var(--text-tertiary)",fontSize:12,fontWeight:formType===t?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>{typeLabels[t]}</button>
              ))}
            </div>
            {/* Fields */}
            <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>FECHA</label>
                <input type="date" value={form.date} onChange={e=>upForm("date",e.target.value)} style={{padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
              {(formType==="buy"||formType==="sell") && <>
                <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>ACCIONES</label>
                  <input type="number" value={form.shares||""} onChange={e=>upForm("shares",parseFloat(e.target.value)||0)} placeholder="100" style={{width:90,padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
                <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>PRECIO</label>
                  <input type="number" step="0.01" value={form.price||""} onChange={e=>upForm("price",parseFloat(e.target.value)||0)} placeholder="50.00" style={{width:100,padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
              </>}
              {formType==="dividend" && <>
                <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>DIV/ACCIÓN</label>
                  <input type="number" step="0.01" value={form.dps||""} onChange={e=>upForm("dps",parseFloat(e.target.value)||0)} placeholder="0.50" style={{width:100,padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
                <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>ACCIONES (opt.)</label>
                  <input type="number" value={form.shares||""} onChange={e=>upForm("shares",parseFloat(e.target.value)||0)} placeholder={String(calc.totalShares)} style={{width:90,padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
              </>}
              {formType==="option" && <>
                <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>TIPO</label>
                  <select value={form.optType} onChange={e=>upForm("optType",e.target.value)} style={{padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none"}}>
                    {Object.entries(optLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>STRIKE</label>
                  <input type="number" step="0.5" value={form.optStrike||""} onChange={e=>upForm("optStrike",parseFloat(e.target.value)||0)} style={{width:80,padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
                <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>CONTRATOS</label>
                  <input type="number" value={form.optContracts||""} onChange={e=>upForm("optContracts",parseFloat(e.target.value)||0)} style={{width:70,padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
                <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>CRÉDITO/CONT.</label>
                  <input type="number" step="0.01" value={form.optCredit||""} onChange={e=>upForm("optCredit",parseFloat(e.target.value)||0)} style={{width:90,padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
                <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>EXPIRY</label>
                  <input type="date" value={form.optExpiry} onChange={e=>upForm("optExpiry",e.target.value)} style={{padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
                <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>STATUS</label>
                  <select value={form.optStatus} onChange={e=>upForm("optStatus",e.target.value)} style={{padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none"}}>
                    {Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select></div>
              </>}
              {(formType!=="dividend") && <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>FEES</label>
                <input type="number" step="0.01" value={form.fees||""} onChange={e=>upForm("fees",parseFloat(e.target.value)||0)} placeholder="0" style={{width:70,padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>}
              <button onClick={handleSubmit} style={{padding:"8px 24px",borderRadius:8,border:"none",background:"var(--gold)",color:"#000",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)",height:38}}>Guardar</button>
            </div>
          </div>
        )}

        {/* Transaction Log — matches Google Sheet layout */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:18,overflow:"hidden"}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:14,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📋 Transacciones · {txns.length}</span>
            <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Adjusted Basis = (Coste − Divs − Opciones) ÷ Acciones</span>
          </div>
          {cbLoading ? (
            <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)"}}>Cargando...</div>
          ) : txns.length === 0 ? (
            <div style={{padding:60,textAlign:"center",color:"var(--text-tertiary)"}}>
              <div style={{fontSize:40,marginBottom:12}}>📋</div>
              <div style={{fontSize:14,marginBottom:12}}>Sin transacciones. Añade una compra o importa el JSON exportado.</div>
              <div style={{fontSize:11,color:"var(--text-tertiary)"}}>Puedes importar el archivo costbasis_app.json con todas tus empresas a la vez.</div>
            </div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12.5,minWidth:1200}}>
                <thead>
                  <tr>
                    <th colSpan={6} style={{padding:"6px 10px",textAlign:"center",color:"var(--gold)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1,borderBottom:"2px solid var(--gold-dim)",background:"rgba(200,164,78,.04)"}}>TRADE / EQUITY</th>
                    <th colSpan={6} style={{padding:"6px 10px",textAlign:"center",color:"#64d2ff",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1,borderBottom:"2px solid rgba(100,210,255,.15)",background:"rgba(100,210,255,.03)"}}>OPTIONS</th>
                    <th colSpan={2} style={{padding:"6px 10px",textAlign:"center",color:"var(--green)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1,borderBottom:"2px solid rgba(48,209,88,.15)",background:"rgba(48,209,88,.03)"}}>DIVIDENDS</th>
                    <th colSpan={5} style={{padding:"6px 10px",textAlign:"center",color:"var(--orange)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1,borderBottom:"2px solid rgba(255,159,10,.15)",background:"rgba(255,159,10,.03)"}}>ADJUSTED BASIS</th>
                    <th style={{borderBottom:"2px solid var(--border)",width:30}}/>
                  </tr>
                  <tr>
                    {[
                      {l:"FECHA",w:90},{l:"TIPO",w:80},{l:"SHARES",w:65,r:1},{l:"PRICE",w:70,r:1},{l:"FEES",w:55,r:1},{l:"COST",w:75,r:1},
                      {l:"EXPIRY",w:85},{l:"TYPE",w:55},{l:"STATUS",w:70},{l:"CONTR.",w:50,r:1},{l:"STRIKE",w:60,r:1},{l:"CREDIT",w:65,r:1},
                      {l:"PER SH",w:65,r:1},{l:"TOTAL",w:70,r:1},
                      {l:"BALANCE",w:80,r:1},{l:"SHARES",w:60,r:1},{l:"BASIS",w:75,r:1},{l:"BASIS %",w:65,r:1},{l:"DIV Y%",w:60,r:1},
                      {l:"",w:30},
                    ].map((h,i)=>(
                      <th key={i} style={{padding:"7px 6px",textAlign:h.r?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"1px solid var(--border)",whiteSpace:"nowrap",minWidth:h.w}}>{h.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t,i)=>{
                    const isBuy = t.type==="buy";
                    const isSell = t.type==="sell";
                    const isDiv = t.type==="dividend";
                    const isOpt = t.type==="option";
                    const rowBg = isDiv?"rgba(48,209,88,.02)":isOpt?"rgba(100,210,255,.02)":i%2?"rgba(255,255,255,.012)":"transparent";
                    return (
                      <tr key={t.id||i} style={{background:rowBg}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                        <td style={{padding:"7px 6px",fontSize:12,color:"var(--text-primary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{t.date||""}</td>
                        <td style={{padding:"7px 6px",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                          <span style={{padding:"2px 8px",borderRadius:5,fontSize:9.5,fontWeight:700,fontFamily:"var(--fm)",color:typeColors[t.type]||"#fff",background:`${typeColors[t.type]||"#fff"}15`,letterSpacing:.2}}>{typeLabels[t.type]||t.type}</span>
                        </td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:(isBuy||isSell)?"var(--text-primary)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{(isBuy||isSell)&&t.shares?t.shares:""}</td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:"var(--text-primary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{(isBuy||isSell)&&t.price?_sf(t.price,2):""}</td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{t.fees?_sf(t.fees,1):""}</td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,fontWeight:600,color:t.cost&&t.cost<0?"var(--red)":t.cost>0?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{t.cost?Math.round(t.cost).toLocaleString():""}</td>
                        {/* Options */}
                        <td style={{padding:"7px 6px",fontSize:11,color:isOpt?"#64d2ff":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{isOpt?t.optExpiry:""}</td>
                        <td style={{padding:"7px 6px",fontSize:11,color:isOpt?"#64d2ff":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{isOpt?t.optType:""}</td>
                        <td style={{padding:"7px 6px",fontSize:10,fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                          {isOpt&&t.optStatus?<span style={{padding:"1px 6px",borderRadius:4,fontSize:9,fontWeight:600,
                            color:t.optStatus==="EXPIRED"||t.optStatus==="expired"?"var(--green)":t.optStatus==="ASSIGNED"||t.optStatus==="assigned"?"var(--red)":"#64d2ff",
                            background:t.optStatus==="EXPIRED"||t.optStatus==="expired"?"rgba(48,209,88,.1)":t.optStatus==="ASSIGNED"||t.optStatus==="assigned"?"rgba(255,69,58,.1)":"rgba(100,210,255,.08)"
                          }}>{t.optStatus}</span>:""}
                        </td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:isOpt?"#64d2ff":"",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{isOpt&&t.optContracts?t.optContracts:""}</td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:isOpt?"#64d2ff":"",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{isOpt&&t.optStrike?t.optStrike:""}</td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,fontWeight:600,color:isOpt?"#64d2ff":"",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{isOpt&&t.optCreditTotal?_sf(t.optCreditTotal,2):isOpt&&t.optCredit?_sf(t.optCredit,4):""}</td>
                        {/* Dividends */}
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:isDiv?"var(--gold)":"",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{isDiv&&t.dps?_sf(t.dps,4):""}</td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,fontWeight:600,color:isDiv?"var(--gold)":"",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{isDiv&&t.divTotal?_sf(t.divTotal,2):""}</td>
                        {/* Adjusted Basis */}
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:t._balance<0?"var(--red)":"var(--green)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{t._balance?Math.round(t._balance).toLocaleString():""}</td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:"var(--text-primary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{t._totalShares||""}</td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,fontWeight:600,color:"var(--orange)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{t._adjustedBasis?_sf(t._adjustedBasis,2):""}</td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:11,color:t._adjustedBasisPct>0?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{t._adjustedBasisPct?_sf(t._adjustedBasisPct*100,1)+"%":""}</td>
                        <td style={{padding:"7px 6px",textAlign:"right",fontSize:11,color:t._divYieldBasis>0?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{t._divYieldBasis?_sf(t._divYieldBasis*100,2)+"%":""}</td>
                        <td style={{padding:"7px 4px",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                          <button onClick={()=>deleteTransaction(t.id)} style={{width:22,height:22,borderRadius:5,border:"1px solid rgba(255,69,58,.15)",background:"transparent",color:"var(--red)",fontSize:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:.5}}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHome = () => (
    <div style={{maxWidth:1400,margin:"0 auto"}}>
      {/* Home Header */}
      <div style={{display:"flex",alignItems:"center",gap:18,marginBottom:28}}>
        <div style={{width:50,height:50,borderRadius:14,background:"linear-gradient(135deg,#d69e2e,#b8860b)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#000",fontFamily:"var(--fm)"}}>A&R</div>
        <div>
          <div style={{fontSize:26,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>A&R <span style={{color:"var(--gold)",fontSize:18}}>v10.2</span></div>
          <div style={{fontSize:12,color:"var(--text-tertiary)"}}>Dividend Equity Analysis · {portfolioList.length} posiciones</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          {/* Currency Toggle */}
          <div style={{display:"flex",gap:0,border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
            {DISPLAY_CCYS.map(ccy=>(
              <button key={ccy} onClick={()=>switchDisplayCcy(ccy)}
                style={{padding:"8px 14px",border:"none",background:displayCcy===ccy?"var(--gold-dim)":"transparent",color:displayCcy===ccy?"var(--gold)":"var(--text-tertiary)",fontSize:13,fontWeight:displayCcy===ccy?700:500,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .2s",borderRight:"1px solid var(--border)"}}>
                {CURRENCIES[ccy]?.symbol || ccy}
              </button>
            ))}
          </div>
          <button onClick={refreshFxRates} disabled={fxLoading} title={fxLastUpdate?`Última act: ${new Date(fxLastUpdate).toLocaleString('es-ES')}`:"Sin datos FX"}
            style={{padding:"8px 14px",borderRadius:10,border:"1px solid var(--border)",background:fxLoading?"rgba(100,210,255,.08)":"transparent",color:fxLoading?"#64d2ff":"var(--text-tertiary)",fontSize:12,cursor:fxLoading?"wait":"pointer",fontFamily:"var(--fm)",animation:fxLoading?"pulse 1s infinite":"none"}}>
            {fxLoading?"⏳":"🔄 FX"}
          </button>
          <button onClick={()=>setShowSettings(!showSettings)} style={{padding:"8px 14px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:13,cursor:"pointer",fontFamily:"var(--fm)"}}>⚙</button>
        </div>
      </div>

      {/* Home Tabs */}
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:24}}>
        {HOME_TABS.map(t=>(
          <button key={t.id} onClick={()=>setHomeTab(t.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 18px",borderRadius:12,border:`1px solid ${homeTab===t.id?"var(--gold)":"var(--border)"}`,background:homeTab===t.id?"var(--gold-dim)":"transparent",color:homeTab===t.id?"var(--gold)":"var(--text-tertiary)",fontSize:14,fontWeight:homeTab===t.id?700:500,cursor:"pointer",fontFamily:"var(--fb)",transition:"all .2s",whiteSpace:"nowrap"}}>
            <span style={{fontSize:14}}>{t.ico}</span>{t.lbl}
            {t.id==="portfolio" && portfolioList.length>0 && <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{portfolioList.length}</span>}
            {t.id==="watchlist" && watchlistList.length>0 && <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{watchlistList.length}</span>}
            {t.id==="historial" && historialList.length>0 && <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{historialList.length}</span>}
          </button>
        ))}
      </div>

      {/* ═══ PORTFOLIO TAB ═══ */}
      {homeTab==="portfolio" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Summary Cards */}
          {portfolioList.length>0 && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:12}}>
              {[
                {l:"VALOR TOTAL",vUSD:"$"+fDol(portfolioTotals.totalValueUSD),vEUR:"€"+fDol(portfolioTotals.totalValueEUR),c:"var(--text-primary)"},
                {l:"COSTE TOTAL",vUSD:"$"+fDol(portfolioTotals.totalCostUSD),vEUR:"€"+fDol(portfolioTotals.totalCostEUR),c:"var(--text-secondary)"},
                {l:"P&L TOTAL",vUSD:(portfolioTotals.pnlUSD>=0?"+$":"-$")+fDol(Math.abs(portfolioTotals.pnlUSD)),vEUR:(portfolioTotals.pnlEUR>=0?"+€":"-€")+fDol(Math.abs(portfolioTotals.pnlEUR)),c:portfolioTotals.pnlUSD>=0?"var(--green)":"var(--red)",sub:_sf(portfolioTotals.pnlPctUSD*100,1)+"%"},
                {l:"DIVIDENDO ANUAL",vUSD:"$"+fDol(portfolioTotals.totalDivUSD),vEUR:"€"+fDol(portfolioTotals.totalDivEUR),c:"var(--gold)",sub:"YOC "+_sf(portfolioTotals.yocUSD*100,1)+"%"},
              ].map((m,i)=>(
                <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:18,padding:"16px 20px"}}>
                  <div style={{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.6}}>{m.l}</div>
                  <div style={{fontSize:26,fontWeight:700,color:m.c,fontFamily:"var(--fm)",marginTop:6}}>{displayCcy==="EUR"?m.vEUR:m.vUSD}</div>
                  <div style={{fontSize:12,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{displayCcy==="EUR"?m.vUSD:m.vEUR}</div>
                  {m.sub && <div style={{fontSize:12,fontWeight:600,color:m.c,fontFamily:"var(--fm)",marginTop:4,opacity:.7}}>{m.sub}</div>}
                </div>
              ))}
            </div>
          )}
          {/* Add company + Refresh prices */}
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
            <input type="text" placeholder="Ticker (ej: AAPL)" value={searchTicker} onChange={e=>setSearchTicker(e.target.value.toUpperCase())}
              onKeyDown={e=>{if(e.key==="Enter"&&searchTicker){updatePosition(searchTicker,{list:"portfolio",shares:0,avgCost:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}}
              style={{padding:"10px 14px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:12,color:"var(--text-primary)",fontSize:14,outline:"none",fontFamily:"var(--fm)",width:160}}
              onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
            <button onClick={()=>{if(searchTicker){updatePosition(searchTicker,{list:"portfolio",shares:0,avgCost:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}}
              style={{padding:"10px 20px",borderRadius:12,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>+ Añadir</button>
            <button onClick={()=>refreshPrices(true)} disabled={pricesLoading}
              style={{padding:"10px 16px",borderRadius:12,border:"1px solid var(--border)",background:pricesLoading?"rgba(201,169,80,.1)":"transparent",color:pricesLoading?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:600,cursor:pricesLoading?"wait":"pointer",fontFamily:"var(--fm)",marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
              <span style={{display:"inline-block",animation:pricesLoading?"spin 1s linear infinite":"none"}}>🔄</span> {pricesLoading?"Actualizando...":"Refresh Precios"}
            </button>
            {pricesLastUpdate && <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Precios: {new Date(pricesLastUpdate).toLocaleString()}</span>}
          </div>
          {/* Country Flag Filter */}
          {portfolioList.length>0 && (() => {
            const countryCounts = {};
            portfolioTotals.positions?.forEach(p => {
              const cc = getCountry(p.ticker, p.currency);
              countryCounts[cc] = (countryCounts[cc] || 0) + 1;
            });
            const sorted = Object.entries(countryCounts).sort((a,b) => b[1] - a[1]);
            return (
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
              <button onClick={()=>setCountryFilter("")} style={{padding:"6px 12px",borderRadius:8,border:countryFilter===""?"2px solid var(--gold)":"1px solid var(--border)",background:countryFilter===""?"var(--gold-dim)":"transparent",color:countryFilter===""?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>🌍 Todas ({portfolioList.length})</button>
              {sorted.map(([cc, count]) => (
                <button key={cc} onClick={()=>setCountryFilter(countryFilter===cc?"":cc)} style={{padding:"6px 12px",borderRadius:8,border:countryFilter===cc?"2px solid var(--gold)":"1px solid var(--border)",background:countryFilter===cc?"var(--gold-dim)":"transparent",color:countryFilter===cc?"var(--gold)":"var(--text-secondary)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{FLAGS[cc]||"🏳️"} {count}</button>
              ))}
            </div>);
          })()}
          {/* Company List */}
          {portfolioList.length===0 && <div style={{textAlign:"center",padding:60,color:"var(--text-tertiary)"}}><div style={{fontSize:48,marginBottom:16}}>💼</div>Portfolio vacío. Añade tu primera empresa arriba.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {portfolioTotals.positions?.filter(p => !countryFilter || getCountry(p.ticker, p.currency) === countryFilter).map(p=><CompanyRow key={p.ticker} p={p} showPos={true} onOpen={openAnalysis}/>)}
          </div>
        </div>
      )}

      {/* ═══ SCREENER TAB — Dividend Safety Scoring ═══ */}
      {homeTab==="screener" && (() => {
        const [screenerData, setScreenerData] = useState(null);
        const [screenerLoading, setScreenerLoading] = useState(false);
        const [bulkLoading, setBulkLoading] = useState(false);
        const [bulkProgress, setBulkProgress] = useState("");
        const [screenerSort, setScreenerSort] = useState({col:"score",asc:false});
        const [screenerFilter, setScreenerFilter] = useState({minScore:0,sector:"",search:""});
        const [customTickers, setCustomTickers] = useState("");

        const loadScreener = async () => {
          setScreenerLoading(true);
          try {
            const resp = await fetch(`${API_URL}/api/screener`);
            if (resp.ok) setScreenerData(await resp.json());
          } catch(e) { console.error(e); }
          setScreenerLoading(false);
        };

        const runBulkFetch = async (symbols) => {
          setBulkLoading(true);
          setBulkProgress(`Descargando fundamentales de ${symbols.length} empresas...`);
          try {
            // Split into batches of 10 for the bulk endpoint
            for (let i = 0; i < symbols.length; i += 10) {
              const batch = symbols.slice(i, i + 10);
              setBulkProgress(`Lote ${Math.floor(i/10)+1}/${Math.ceil(symbols.length/10)}: ${batch.join(", ")}`);
              await fetch(`${API_URL}/api/fundamentals/bulk`, {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({symbols: batch})
              });
            }
            setBulkProgress("Calculando scores...");
            await loadScreener();
            setBulkProgress("");
          } catch(e) { setBulkProgress("Error: " + e.message); }
          setBulkLoading(false);
        };

        // Get US tickers from portfolio
        const portfolioUS = Object.entries(POS_STATIC)
          .filter(([,v]) => (v.ls||"portfolio") !== "historial" && (v.c||"USD") === "USD" && (v.sh||0) > 0)
          .map(([t]) => t);

        // Auto-load screener data on first render
        if (!screenerData && !screenerLoading) loadScreener();

        const items = screenerData?.screener || [];
        const sectors = [...new Set(items.map(i=>i.sector).filter(Boolean).filter(s=>s!=="—"))].sort();
        
        // Filter
        const filtered = items.filter(i => {
          if (screenerFilter.minScore && i.score < screenerFilter.minScore) return false;
          if (screenerFilter.sector && i.sector !== screenerFilter.sector) return false;
          if (screenerFilter.search && !i.symbol.includes(screenerFilter.search.toUpperCase()) && !(i.name||"").toUpperCase().includes(screenerFilter.search.toUpperCase())) return false;
          return true;
        });

        // Sort
        const sorted = [...filtered].sort((a,b) => {
          const va = a[screenerSort.col] ?? 0, vb = b[screenerSort.col] ?? 0;
          if (typeof va === "string") return screenerSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
          return screenerSort.asc ? va - vb : vb - va;
        });

        const sortBy = (col) => setScreenerSort(p => p.col === col ? {col, asc: !p.asc} : {col, asc: false});
        const sortArrow = (col) => screenerSort.col === col ? (screenerSort.asc ? " ▲" : " ▼") : "";
        
        const scoreColor = (s) => s >= 80 ? "#30d158" : s >= 60 ? "var(--gold)" : s >= 40 ? "#ff9f0a" : "#ff453a";
        const scoreBg = (s) => s >= 80 ? "rgba(48,209,88,.1)" : s >= 60 ? "rgba(201,169,80,.1)" : s >= 40 ? "rgba(255,159,10,.1)" : "rgba(255,69,58,.1)";
        const scoreLabel = (s) => s >= 80 ? "CORE HOLD" : s >= 60 ? "HOLD" : s >= 40 ? "REVIEW" : "SELL";

        return <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Header */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:18,padding:"20px 24px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:18,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>🔬 Dividend Safety Screener</div>
                <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>{items.length} empresas analizadas · Scoring 0-100 basado en Payout FCF, Deuda/EBITDA, FCF trend, Crecimiento EPS, Moat</div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={()=>runBulkFetch(portfolioUS)} disabled={bulkLoading}
                  style={{padding:"10px 16px",borderRadius:10,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:12,fontWeight:700,cursor:bulkLoading?"wait":"pointer",fontFamily:"var(--fm)"}}>
                  {bulkLoading?"⏳ Procesando...":"📥 Analizar Mi Portfolio ("+portfolioUS.length+" US)"}
                </button>
                <button onClick={loadScreener} disabled={screenerLoading}
                  style={{padding:"10px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
                  🔄 Refresh Scores
                </button>
              </div>
            </div>
            {bulkProgress && <div style={{fontSize:11,color:"var(--gold)",fontFamily:"var(--fm)",marginTop:8,padding:"6px 12px",borderRadius:8,background:"rgba(201,169,80,.08)"}}>{bulkProgress}</div>}
            
            {/* Custom tickers input */}
            <div style={{display:"flex",gap:8,marginTop:12,alignItems:"center"}}>
              <input type="text" placeholder="Tickers personalizados: AAPL, MSFT, JNJ, PG..." value={customTickers} onChange={e=>setCustomTickers(e.target.value)}
                style={{flex:1,padding:"10px 14px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:10,color:"var(--text-primary)",fontSize:12,outline:"none",fontFamily:"var(--fm)"}}
                onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
              <button onClick={()=>{ const syms = customTickers.split(/[,\s]+/).map(s=>s.trim().toUpperCase()).filter(Boolean); if(syms.length>0) runBulkFetch(syms); }}
                disabled={bulkLoading || !customTickers.trim()}
                style={{padding:"10px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>
                🔍 Analizar
              </button>
            </div>
          </div>

          {/* Filters */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            <input type="text" placeholder="Buscar ticker/nombre..." value={screenerFilter.search} onChange={e=>setScreenerFilter(p=>({...p,search:e.target.value}))}
              style={{padding:"8px 12px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)",width:160}}/>
            <select value={screenerFilter.sector} onChange={e=>setScreenerFilter(p=>({...p,sector:e.target.value}))}
              style={{padding:"8px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
              <option value="">Todos los sectores</option>
              {sectors.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{display:"flex",gap:4}}>
              {[{l:"Todos",v:0},{l:"≥40",v:40},{l:"≥60",v:60},{l:"≥80",v:80}].map(f=>(
                <button key={f.v} onClick={()=>setScreenerFilter(p=>({...p,minScore:f.v}))}
                  style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${screenerFilter.minScore===f.v?"var(--gold)":"var(--border)"}`,background:screenerFilter.minScore===f.v?"var(--gold-dim)":"transparent",color:screenerFilter.minScore===f.v?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{f.l}</button>
              ))}
            </div>
            <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginLeft:"auto"}}>{sorted.length} de {items.length}</span>
          </div>

          {/* Score distribution mini-bar */}
          {items.length > 0 && <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[{l:"CORE HOLD (≥80)",min:80,c:"#30d158"},{l:"HOLD (60-79)",min:60,max:79,c:"var(--gold)"},{l:"REVIEW (40-59)",min:40,max:59,c:"#ff9f0a"},{l:"SELL (<40)",min:0,max:39,c:"#ff453a"}].map(b=>{
              const count = items.filter(i=>i.score>=(b.min) && i.score<=(b.max||100)).length;
              return <div key={b.l} style={{padding:"8px 14px",borderRadius:10,background:`${b.c}11`,border:`1px solid ${b.c}33`,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:20,fontWeight:800,color:b.c,fontFamily:"var(--fm)"}}>{count}</span>
                <span style={{fontSize:9,color:b.c,fontFamily:"var(--fm)",opacity:.8}}>{b.l}</span>
              </div>;
            })}
          </div>}

          {/* Results table */}
          {screenerLoading ? <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)",fontSize:12}}>Cargando screener...</div> :
           items.length === 0 ? <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:40,textAlign:"center"}}>
            <div style={{fontSize:14,color:"var(--text-secondary)",fontFamily:"var(--fd)",marginBottom:8}}>Sin datos todavía</div>
            <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Pulsa "📥 Analizar Mi Portfolio" para descargar fundamentales de tus {portfolioUS.length} posiciones US</div>
          </div> :
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:1100}}>
                <thead><tr>
                  {[
                    {k:"symbol",l:"TICKER",a:"left"},
                    {k:"name",l:"EMPRESA",a:"left"},
                    {k:"sector",l:"SECTOR",a:"left"},
                    {k:"score",l:"SCORE",a:"center"},
                    {k:"",l:"SEÑAL",a:"center"},
                    {k:"divYield",l:"YIELD%",a:"right"},
                    {k:"payoutFCF",l:"PAYOUT",a:"right"},
                    {k:"debtEBITDA",l:"DEUDA/EB",a:"right"},
                    {k:"epsCAGR",l:"EPS CAGR",a:"right"},
                    {k:"grossMargin",l:"GM%",a:"right"},
                    {k:"roic",l:"ROIC%",a:"right"},
                    {k:"fcf",l:"FCF $M",a:"right"},
                    {k:"revenue",l:"REV $M",a:"right"},
                  ].map((c,i)=>(
                    <th key={i} onClick={()=>c.k&&sortBy(c.k)} style={{padding:"8px 10px",textAlign:c.a,color:screenerSort.col===c.k?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"2px solid var(--border)",cursor:c.k?"pointer":"default",userSelect:"none",whiteSpace:"nowrap",position:"sticky",top:0,background:"var(--card)"}}>{c.l}{sortArrow(c.k)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {sorted.map((item,i) => {
                    const inPortfolio = !!POS_STATIC[item.symbol];
                    return <tr key={item.symbol} style={{background:i%2?"rgba(255,255,255,.01)":"transparent",cursor:"pointer"}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} 
                      onMouseLeave={e=>e.currentTarget.style.background=i%2?"rgba(255,255,255,.01)":"transparent"}
                      onClick={()=>openAnalysis(item.symbol)}>
                      <td style={{padding:"6px 10px",fontWeight:700,color:inPortfolio?"var(--gold)":"var(--text-primary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                        {inPortfolio && <span style={{fontSize:7,marginRight:4}}>●</span>}{item.symbol}
                      </td>
                      <td style={{padding:"6px 10px",color:"var(--text-secondary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</td>
                      <td style={{padding:"6px 10px",color:"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)",fontSize:9}}>{item.sector}</td>
                      <td style={{padding:"6px 10px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                        <span style={{padding:"3px 10px",borderRadius:6,background:scoreBg(item.score),color:scoreColor(item.score),fontWeight:800,fontSize:13,fontFamily:"var(--fm)"}}>{item.score}</span>
                      </td>
                      <td style={{padding:"6px 10px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                        <span style={{fontSize:8,padding:"2px 8px",borderRadius:4,background:scoreBg(item.score),color:scoreColor(item.score),fontWeight:700,fontFamily:"var(--fm)"}}>{scoreLabel(item.score)}</span>
                      </td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.divYield>4?"var(--green)":item.divYield>2?"var(--gold)":"var(--text-secondary)",fontWeight:600,borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(item.divYield,1)}%</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.payoutFCF<60?"var(--green)":item.payoutFCF<80?"var(--gold)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{item.payoutFCF}%</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.debtEBITDA<3?"var(--green)":item.debtEBITDA<5?"var(--gold)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(item.debtEBITDA,1)}x</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.epsCAGR>5?"var(--green)":item.epsCAGR>0?"var(--text-secondary)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(item.epsCAGR,1)}%</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{item.grossMargin}%</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.roic>15?"var(--green)":item.roic>8?"var(--text-secondary)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(item.roic,1)}%</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.fcf>0?"var(--green)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{item.fcf>0?"":""}{fDol(Math.abs(item.fcf))}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{fDol(item.revenue)}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>}
        </div>;
      })()}

      {/* ═══ TRADES TAB — All Cost Basis Transactions from DB ═══ */}
      {homeTab==="trades" && (() => {
        // Load trades data from API
        const loadTrades = async (filters = tradesFilter, page = tradesPage) => {
          setTradesLoading(true);
          try {
            const params = new URLSearchParams();
            if (filters.tipo) params.set("tipo", filters.tipo);
            if (filters.year) params.set("year", filters.year);
            if (filters.ticker) params.set("ticker", filters.ticker);
            params.set("limit", "500");
            params.set("offset", String(page * 500));
            const resp = await fetch(`${API_URL}/api/costbasis/all?${params}`);
            if (!resp.ok) throw new Error("API error");
            const data = await resp.json();
            // Also load summary if not already loaded
            let summary = tradesData?.summary;
            if (!summary) {
              const sResp = await fetch(`${API_URL}/api/costbasis`);
              if (sResp.ok) summary = await sResp.json();
            }
            setTradesData({ ...data, summary });
          } catch(e) { console.error("Trades load error:", e); }
          setTradesLoading(false);
        };
        // Auto-load on first render
        if (!tradesData && !tradesLoading) loadTrades();
        
        const results = tradesData?.results || [];
        const total = tradesData?.total || 0;
        const summary = tradesData?.summary || [];
        const totalTxns = summary.reduce((s,d) => s + (d.txns||0), 0);
        const totalBuys = summary.reduce((s,d) => s + (d.buys||0), 0);
        const totalDivs = summary.reduce((s,d) => s + (d.divs||0), 0);
        const totalOpts = summary.reduce((s,d) => s + (d.opts||0), 0);
        const totalSells = totalTxns - totalBuys - totalDivs - totalOpts;
        const years = [...new Set(results.map(r => r.fecha?.slice(0,4)).filter(Boolean))].sort().reverse();
        
        const typeColors = {EQUITY:"var(--gold)", DIVIDENDS:"var(--green)", OPTION:"#64d2ff"};
        const typeLabels = {EQUITY:"Equity", DIVIDENDS:"Dividendo", OPTION:"Opción"};
        
        return (
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* KPI Cards */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {[
              {l:"TRANSACCIONES",v:totalTxns.toLocaleString(),c:"var(--text-primary)"},
              {l:"TICKERS",v:summary.length.toString(),c:"var(--gold)"},
              {l:"COMPRAS",v:totalBuys.toLocaleString(),c:"var(--green)"},
              {l:"VENTAS",v:totalSells>0?totalSells.toLocaleString():"—",c:"var(--red)"},
              {l:"DIVIDENDOS",v:totalDivs.toLocaleString(),c:"var(--green)"},
              {l:"OPCIONES",v:totalOpts.toLocaleString(),c:"#64d2ff"},
            ].map((k,i)=>(
              <div key={i} style={{flex:"1 1 120px",padding:"14px 16px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:14}}>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.6,fontWeight:600,marginBottom:4}}>{k.l}</div>
                <div style={{fontSize:22,fontWeight:700,color:k.c,fontFamily:"var(--fm)",lineHeight:1.2}}>{k.v}</div>
              </div>
            ))}
          </div>
          
          {/* Filters */}
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <input placeholder="Buscar ticker..." value={tradesFilter.ticker} onChange={e=>{const f={...tradesFilter,ticker:e.target.value};setTradesFilter(f);}} onKeyDown={e=>{if(e.key==="Enter"){setTradesPage(0);loadTrades(tradesFilter,0);}}} style={{padding:"8px 12px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none",width:140}}/>
            <select value={tradesFilter.tipo} onChange={e=>{const f={...tradesFilter,tipo:e.target.value};setTradesFilter(f);setTradesPage(0);loadTrades(f,0);}} style={{padding:"8px 12px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}}>
              <option value="">Todos los tipos</option>
              <option value="EQUITY">Equity</option>
              <option value="DIVIDENDS">Dividendos</option>
              <option value="OPTION">Opciones</option>
            </select>
            <select value={tradesFilter.year} onChange={e=>{const f={...tradesFilter,year:e.target.value};setTradesFilter(f);setTradesPage(0);loadTrades(f,0);}} style={{padding:"8px 12px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}}>
              <option value="">Todos los años</option>
              {["2026","2025","2024","2023","2022","2021","2020"].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={()=>{setTradesPage(0);loadTrades(tradesFilter,0);}} style={{padding:"8px 18px",borderRadius:8,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>Buscar</button>
            {(tradesFilter.tipo||tradesFilter.year||tradesFilter.ticker)&&<button onClick={()=>{const f={tipo:"",year:"",ticker:""};setTradesFilter(f);setTradesPage(0);loadTrades(f,0);}} style={{padding:"8px 14px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:12,cursor:"pointer",fontFamily:"var(--fm)"}}>✕ Limpiar</button>}
            <div style={{marginLeft:"auto",fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{total.toLocaleString()} resultados</div>
          </div>
          
          {/* Transaction Table */}
          {tradesLoading ? (
            <div style={{padding:60,textAlign:"center",color:"var(--text-tertiary)",fontSize:14}}>Cargando transacciones...</div>
          ) : (
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:900}}>
                <thead><tr>
                  {["FECHA","TICKER","TIPO","SHARES","PRECIO","COMISIÓN","COSTE","DPS","DIV TOTAL","OPT CREDIT","BALANCE","ADJ BASIS"].map((h,i)=>(
                    <th key={i} style={{padding:"8px 10px",textAlign:i>2?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {results.map((r,i) => {
                    const tColor = typeColors[r.tipo] || "var(--text-secondary)";
                    return (
                    <tr key={r.id||i} style={{background:i%2?"rgba(255,255,255,.012)":"transparent"}} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"rgba(255,255,255,.012)":"transparent"}>
                      <td style={{padding:"6px 10px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.fecha}</td>
                      <td style={{padding:"6px 10px",fontWeight:700,fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)",cursor:"pointer"}} onClick={()=>openCostBasis(r.ticker)}>{r.ticker}</td>
                      <td style={{padding:"6px 10px",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:`${tColor}15`,color:tColor,fontWeight:600}}>{typeLabels[r.tipo]||r.tipo}</span></td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.shares||""}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.precio?`$${_sf(r.precio,2)}`:""}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)",opacity:.6}}>{r.comision?`$${_sf(r.comision,2)}`:""}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:r.coste>0?"var(--green)":r.coste<0?"var(--red)":"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.coste?`$${_sf(r.coste,0)}`:""}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.dps?`$${_sf(r.dps,4)}`:""}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--green)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.div_total?`$${_sf(r.div_total,2)}`:""}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"#64d2ff",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.opt_credit_total?`$${_sf(r.opt_credit_total,2)}`:""}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:r.balance>=0?"var(--green)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.balance?`$${_sf(r.balance,0)}`:""}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.adjusted_basis?`$${_sf(r.adjusted_basis,2)}`:""}</td>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {total > 500 && (
              <div style={{display:"flex",justifyContent:"center",gap:8,padding:12,borderTop:"1px solid var(--border)"}}>
                <button disabled={tradesPage===0} onClick={()=>{const p=tradesPage-1;setTradesPage(p);loadTrades(tradesFilter,p);}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:tradesPage===0?"transparent":"var(--gold-dim)",color:tradesPage===0?"var(--text-tertiary)":"var(--gold)",fontSize:12,cursor:tradesPage===0?"default":"pointer",fontFamily:"var(--fm)"}}>← Anterior</button>
                <span style={{padding:"6px 14px",fontSize:12,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{tradesPage*500+1}–{Math.min((tradesPage+1)*500,total)} de {total.toLocaleString()}</span>
                <button disabled={(tradesPage+1)*500>=total} onClick={()=>{const p=tradesPage+1;setTradesPage(p);loadTrades(tradesFilter,p);}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:(tradesPage+1)*500>=total?"transparent":"var(--gold-dim)",color:(tradesPage+1)*500>=total?"var(--text-tertiary)":"var(--gold)",fontSize:12,cursor:(tradesPage+1)*500>=total?"default":"pointer",fontFamily:"var(--fm)"}}>Siguiente →</button>
              </div>
            )}
          </div>
          )}
        </div>
        );
      })()}

      {/* ═══ PATRIMONIO TAB — Evolución del patrimonio mes a mes ═══ */}
      {homeTab==="patrimonio" && (() => {
        const data = CTRL_DATA.filter(c => c.pu > 0).sort((a,b) => (a.d||"").localeCompare(b.d||"")).map((c, i, arr) => {
          const prev = i > 0 ? arr[i-1] : null;
          const mReturnUsd = prev?.pu ? ((c.pu - prev.pu) / prev.pu * 100) : null;
          const mReturnEur = prev?.pe ? ((c.pe - prev.pe) / prev.pe * 100) : null;
          return { ...c, mReturnUsd, mReturnEur, idx: i };
        });
        const latest = data[data.length - 1] || {};
        const first = data[0] || {};
        
        // Group by year
        const byYear = {};
        data.forEach(d => {
          const y = d.d?.slice(0, 4);
          if (!y) return;
          if (!byYear[y]) byYear[y] = [];
          byYear[y].push(d);
        });
        const years = Object.keys(byYear).sort().reverse();
        
        // Annual returns
        const annualReturns = years.map(y => {
          const entries = byYear[y];
          const lastOfYear = entries[entries.length - 1];
          // Find last entry of previous year
          const prevYearEntries = byYear[String(parseInt(y) - 1)];
          const lastOfPrevYear = prevYearEntries?.[prevYearEntries.length - 1];
          const ytdUsd = lastOfPrevYear?.pu ? ((lastOfYear.pu - lastOfPrevYear.pu) / lastOfPrevYear.pu * 100) : null;
          const ytdEur = lastOfPrevYear?.pe ? ((lastOfYear.pe - lastOfPrevYear.pe) / lastOfPrevYear.pe * 100) : null;
          return { y, ytdUsd, ytdEur, start: lastOfPrevYear?.pu, end: lastOfYear.pu, startEur: lastOfPrevYear?.pe, endEur: lastOfYear.pe, entries };
        });
        
        // CAGR
        const totalYears = data.length > 1 ? ((new Date(latest.d) - new Date(first.d)) / (365.25 * 24 * 3600 * 1000)) : 1;
        const cagrUsd = first.pu > 0 ? ((Math.pow(latest.pu / first.pu, 1 / totalYears) - 1) * 100) : 0;
        const cagrEur = first.pe > 0 ? ((Math.pow(latest.pe / first.pe, 1 / totalYears) - 1) * 100) : 0;
        const totalReturnUsd = first.pu ? ((latest.pu - first.pu) / first.pu * 100) : 0;
        const totalReturnEur = first.pe ? ((latest.pe - first.pe) / first.pe * 100) : 0;
        
        // Max drawdown (USD)
        let peak = 0, maxDD = 0, ddStart = "", ddEnd = "";
        data.forEach(d => {
          if (d.pu > peak) peak = d.pu;
          const dd = peak > 0 ? ((d.pu - peak) / peak * 100) : 0;
          if (dd < maxDD) { maxDD = dd; ddEnd = d.d; }
        });
        
        // Chart data
        const maxPu = Math.max(...data.map(d => d.pu || 0));
        const minPu = Math.min(...data.map(d => d.pu || 0));
        
        // Best and worst months
        const monthlyReturns = data.filter(d => d.mReturnUsd != null);
        const bestMonth = monthlyReturns.reduce((b, d) => (d.mReturnUsd > (b?.mReturnUsd || -Infinity)) ? d : b, null);
        const worstMonth = monthlyReturns.reduce((w, d) => (d.mReturnUsd < (w?.mReturnUsd || Infinity)) ? d : w, null);
        const avgMonthReturn = monthlyReturns.length > 0 ? monthlyReturns.reduce((s, d) => s + d.mReturnUsd, 0) / monthlyReturns.length : 0;
        const positiveMonths = monthlyReturns.filter(d => d.mReturnUsd > 0).length;
        const winRate = monthlyReturns.length > 0 ? (positiveMonths / monthlyReturns.length * 100) : 0;
        
        const retCol = (v) => v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--text-secondary)";
        const retFmt = (v) => v == null ? "—" : `${v >= 0 ? "+" : ""}${_sf(v,1)}%`;
        
        // Last month delta
        const prevEntry = data.length >= 2 ? data[data.length - 2] : null;
        const monthDeltaUsd = prevEntry ? (latest.pu - prevEntry.pu) : 0;
        const monthDeltaPct = prevEntry?.pu ? ((latest.pu - prevEntry.pu) / prevEntry.pu * 100) : 0;
        
        // Mini sparkline points (last 12 data points)
        const spark = data.slice(-12);
        const sparkMin = Math.min(...spark.map(d=>d.pu||0));
        const sparkMax = Math.max(...spark.map(d=>d.pu||0));
        const sparkRange = sparkMax - sparkMin || 1;
        const sparkW = 120, sparkH = 32;
        const sparkPath = spark.map((d,i) => {
          const x = spark.length > 1 ? (i / (spark.length-1)) * sparkW : sparkW/2;
          const y = sparkH - ((d.pu - sparkMin) / sparkRange) * sparkH;
          return `${i===0?"M":"L"}${_sf(x,1)},${_sf(y,1)}`;
        }).join(" ");
        
        return (
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Hero KPI — Patrimonio */}
          <div style={{background:"linear-gradient(135deg, rgba(201,169,80,.06), rgba(201,169,80,.02))",border:"1px solid rgba(201,169,80,.2)",borderRadius:20,padding:"28px 32px",display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
              <div>
                <div style={{fontSize:10,color:"var(--gold)",fontFamily:"var(--fm)",letterSpacing:1.5,fontWeight:700,marginBottom:8,opacity:.7}}>PATRIMONIO NETO</div>
                <div style={{fontSize:42,fontWeight:800,fontFamily:"var(--fm)",color:"var(--text-primary)",lineHeight:1,letterSpacing:-1}}>${(latest.pu||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                <div style={{fontSize:18,fontWeight:500,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:4}}>€{(latest.pe||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                <div style={{padding:"6px 14px",borderRadius:10,background:monthDeltaPct>=0?"rgba(48,209,88,.1)":"rgba(255,69,58,.1)",border:`1px solid ${monthDeltaPct>=0?"rgba(48,209,88,.2)":"rgba(255,69,58,.2)"}`}}>
                  <span style={{fontSize:16,fontWeight:700,color:retCol(monthDeltaPct),fontFamily:"var(--fm)"}}>{monthDeltaPct>=0?"▲":"▼"} {retFmt(monthDeltaPct)}</span>
                  <span style={{fontSize:11,color:retCol(monthDeltaPct),fontFamily:"var(--fm)",marginLeft:6,opacity:.7}}>({monthDeltaUsd>=0?"+":"−"}${fDol(Math.abs(monthDeltaUsd))})</span>
                </div>
                {/* Mini sparkline */}
                {spark.length > 2 && <div style={{opacity:.7}}>
                  <svg width={sparkW+20} height={sparkH+8} viewBox={`-2 -2 ${sparkW+4} ${sparkH+4}`} style={{overflow:"visible"}}>
                    <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--gold)" stopOpacity=".25"/><stop offset="100%" stopColor="var(--gold)" stopOpacity="0"/></linearGradient></defs>
                    <path d={sparkPath + ` L${sparkW},${sparkH} L0,${sparkH} Z`} fill="url(#sparkGrad)"/>
                    <path d={sparkPath} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx={sparkW} cy={sparkH - ((spark[spark.length-1].pu - sparkMin) / sparkRange) * sparkH} r="3" fill="var(--gold)"/>
                  </svg>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center",marginTop:1}}>Últimos 12m</div>
                </div>}
              </div>
            </div>
            {/* Composition bar */}
            {latest.br > 0 && (() => {
              const total = (latest.pu || 1);
              const brokerPct = ((latest.br || 0) / total * 100);
              const bankPct = ((latest.bk || 0) * (latest.fx || 1.08) / total * 100);
              const otherPct = Math.max(0, 100 - brokerPct - bankPct);
              return <div style={{marginTop:4}}>
                <div style={{display:"flex",height:8,borderRadius:6,overflow:"hidden",background:"rgba(255,255,255,.03)"}}>
                  <div style={{width:`${brokerPct}%`,background:"var(--gold)",transition:"width .5s"}}/>
                  <div style={{width:`${bankPct}%`,background:"#64d2ff",transition:"width .5s"}}/>
                  {otherPct > 1 && <div style={{width:`${otherPct}%`,background:"rgba(255,255,255,.1)"}}/>}
                </div>
                <div style={{display:"flex",gap:16,marginTop:6,fontSize:10,fontFamily:"var(--fm)"}}>
                  <span style={{color:"var(--gold)"}}>● Brokers ${fDol(latest.br||0)} ({_sf(brokerPct,0)}%)</span>
                  <span style={{color:"#64d2ff"}}>● Bancos €{fDol(latest.bk||0)} ({_sf(bankPct,0)}%)</span>
                </div>
              </div>;
            })()}
            <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.6}}>Último snapshot: {latest.d || "—"} · FX: €1 = ${latest.fx?.toFixed(2) || "—"}</div>
          </div>
          {/* Secondary KPI row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:10}}>
            {[
              {label:"RETORNO TOTAL",value:retFmt(totalReturnUsd),sub:`EUR ${retFmt(totalReturnEur)}`,color:retCol(totalReturnUsd)},
              {label:`CAGR (${_sf(totalYears,1)}a)`,value:retFmt(cagrUsd),sub:`EUR ${retFmt(cagrEur)}`,color:retCol(cagrUsd)},
              {label:"MAX DRAWDOWN",value:`${_sf(maxDD,1)}%`,sub:ddEnd?`Valle: ${ddEnd}`:"—",color:"var(--red)"},
              {label:"WIN RATE",value:`${_sf(winRate,0)}%`,sub:`${positiveMonths}/${monthlyReturns.length} meses +`,color:winRate>=50?"var(--green)":"var(--red)"},
              {label:"MEJOR MES",value:bestMonth?retFmt(bestMonth.mReturnUsd):"—",sub:bestMonth?.d||"—",color:"var(--green)"},
              {label:"PEOR MES",value:worstMonth?retFmt(worstMonth.mReturnUsd):"—",sub:worstMonth?.d||"—",color:"var(--red)"},
            ].map((k,i) => (
              <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 16px"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.8,fontWeight:600,marginBottom:6}}>{k.label}</div>
                <div style={{fontSize:20,fontWeight:700,fontFamily:"var(--fm)",color:k.color,lineHeight:1.1}}>{k.value}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:3}}>{k.sub}</div>
              </div>
            ))}
          </div>
          
          {/* Patrimony Evolution Chart — with Y axis, labels, year markers */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>📈 Evolución Patrimonio (USD)</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{data.length} meses · {first.d?.slice(0,4)}–{latest.d?.slice(0,4)}</div>
            </div>
            {(() => {
              // Y axis scale
              const chartH = 220;
              const yMax = Math.ceil(maxPu / 200000) * 200000; // Round up to nearest 200K
              const ySteps = [];
              for (let v = 0; v <= yMax; v += yMax <= 1000000 ? 200000 : 500000) ySteps.push(v);
              if (ySteps[ySteps.length-1] < maxPu) ySteps.push(ySteps[ySteps.length-1] + (yMax <= 1000000 ? 200000 : 500000));
              const yTop = ySteps[ySteps.length-1] || 1;
              
              // Detect year boundaries for markers
              const yearChanges = new Set();
              data.forEach((d,i) => { if(i > 0 && d.d?.slice(0,4) !== data[i-1].d?.slice(0,4)) yearChanges.add(i); });
              
              // Which bars get a label (first, last, and first of each year)
              const labelBars = new Set([0, data.length-1]);
              data.forEach((d,i) => { if(yearChanges.has(i)) labelBars.add(i); });
              
              return (
                <div style={{display:"flex",gap:0}}>
                  {/* Y Axis */}
                  <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",height:chartH,paddingRight:8,flexShrink:0}}>
                    {[...ySteps].reverse().map(v => (
                      <div key={v} style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right",width:40,lineHeight:"1"}}>{v >= 1e6 ? `$${_sf(v/1e6,1)}M` : `$${_sf(v/1e3,0)}K`}</div>
                    ))}
                  </div>
                  {/* Chart area */}
                  <div style={{flex:1,position:"relative"}}>
                    {/* Grid lines */}
                    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"space-between",pointerEvents:"none"}}>
                      {ySteps.map(v => <div key={v} style={{borderBottom:"1px solid rgba(255,255,255,.04)",width:"100%"}}/>)}
                    </div>
                    {/* Bars */}
                    <div style={{display:"flex",alignItems:"flex-end",gap:1,height:chartH,position:"relative"}}>
                      {data.map((d, i) => {
                        const h = yTop > 0 ? (d.pu / yTop * 100) : 0;
                        const isLast = i === data.length - 1;
                        const isYearStart = yearChanges.has(i);
                        const showLabel = labelBars.has(i);
                        const barColor = isLast ? "var(--gold)" : "rgba(201,169,80,0.5)";
                        return (
                          <div key={d.d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%",borderLeft:isYearStart?"1px solid rgba(255,255,255,.1)":"none",position:"relative"}} title={`${d.d}\n$${(d.pu||0).toLocaleString()}\n€${(d.pe||0).toLocaleString()}\n${d.mReturnUsd != null ? "Mes: "+retFmt(d.mReturnUsd) : ""}`}>
                            {/* Value label on key bars */}
                            {showLabel && <div style={{fontSize:8,fontWeight:600,color:isLast?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:2,whiteSpace:"nowrap"}}>{d.pu>=1e6?`$${_sf(d.pu/1e6,2)}M`:`$${_sf(d.pu/1e3,0)}K`}</div>}
                            <div style={{width:"100%",maxWidth:16,height:`${Math.max(h,2)}%`,background:barColor,borderRadius:"2px 2px 0 0",transition:"opacity .2s"}}/>
                          </div>
                        );
                      })}
                    </div>
                    {/* X axis labels */}
                    <div style={{display:"flex",gap:1,marginTop:4}}>
                      {data.map((d,i) => {
                        const isYearStart = yearChanges.has(i);
                        const isFirst = i === 0;
                        const isLast = i === data.length - 1;
                        return (
                          <div key={d.d} style={{flex:1,textAlign:"center"}}>
                            {(isFirst || isYearStart || isLast) && <div style={{fontSize:8,color:isLast?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:isLast?600:400,whiteSpace:"nowrap",overflow:"hidden"}}>{d.d?.slice(0,7)}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          
          {/* Monthly Returns heatmap-style */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
            <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:4}}>📊 Rentabilidad Mensual (%)</div>
            <div style={{display:"flex",gap:8,marginBottom:12,fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
              <span>Mejor: <span style={{color:"var(--green)",fontWeight:600}}>{retFmt(bestMonth?.mReturnUsd)} ({bestMonth?.d})</span></span>
              <span>·</span>
              <span>Peor: <span style={{color:"var(--red)",fontWeight:600}}>{retFmt(worstMonth?.mReturnUsd)} ({worstMonth?.d})</span></span>
              <span>·</span>
              <span>Media: <span style={{color:retCol(avgMonthReturn),fontWeight:600}}>{retFmt(avgMonthReturn)}</span></span>
            </div>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              {monthlyReturns.map(d => {
                const v = d.mReturnUsd;
                const intensity = Math.min(Math.abs(v) / 12, 1);
                const bg = v >= 0 
                  ? `rgba(48,209,88,${0.1 + intensity * 0.6})` 
                  : `rgba(255,69,58,${0.1 + intensity * 0.6})`;
                return (
                  <div key={d.d} title={`${d.d}: ${retFmt(v)} · $${(d.pu||0).toLocaleString()}`} style={{width:28,height:28,borderRadius:4,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:600,color:v>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)",cursor:"default"}}>
                    {v>=0?"+":""}{_sf(v,0)}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Annual Returns */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
            <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:16}}>📅 Rentabilidad Anual</div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              {annualReturns.filter(a => a.ytdUsd != null).map(a => (
                <div key={a.y} style={{flex:"1 1 120px",padding:"12px 16px",background:"rgba(255,255,255,.02)",borderRadius:12,border:"1px solid var(--border)",textAlign:"center"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:4}}>{a.y}</div>
                  <div style={{fontSize:24,fontWeight:700,color:retCol(a.ytdUsd),fontFamily:"var(--fm)"}}>{retFmt(a.ytdUsd)}</div>
                  <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>EUR {retFmt(a.ytdEur)}</div>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>${fDol(a.start||0)} → ${fDol(a.end||0)}</div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Full History Table */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:14,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📋 Detalle Mensual · {data.length} snapshots</span>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:800}}>
                <thead><tr>
                  {["FECHA","PAT. USD","PAT. EUR","BROKERS","BANCOS","FX €/$","Δ USD","Δ EUR","SUELDO"].map((h,i)=>
                    <th key={i} style={{padding:"7px 12px",textAlign:i>0?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"1px solid var(--border)",position:"sticky",top:0,background:"var(--bg)"}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[...data].reverse().map((d, i) => {
                    const bg = i%2 ? "rgba(255,255,255,.01)" : "transparent";
                    return (
                      <tr key={d.d} style={{background:bg}} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=bg}>
                        <td style={{padding:"6px 12px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)",fontWeight:500}}>{d.d}</td>
                        <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)",fontWeight:600}}>${(d.pu||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                        <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>€{(d.pe||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                        <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${(d.br||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                        <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"#64d2ff",borderBottom:"1px solid rgba(255,255,255,.03)"}}>€{(d.bk||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                        <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.fx?.toFixed(2)||"—"}</td>
                        <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:600,color:retCol(d.mReturnUsd),borderBottom:"1px solid rgba(255,255,255,.03)"}}>{retFmt(d.mReturnUsd)}</td>
                        <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:retCol(d.mReturnEur),borderBottom:"1px solid rgba(255,255,255,.03)"}}>{retFmt(d.mReturnEur)}</td>
                        <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:d.sl?"var(--text-secondary)":"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.sl ? `$${fDol(d.sl)}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ═══ DASHBOARD TAB — Financial Command Center ═══ */}
      {homeTab==="dashboard" && (() => {
        const ctrlWithData = CTRL_DATA.filter(c => c.pu > 0).sort((a,b) => (a.d||"").localeCompare(b.d||""));
        const latest = ctrlWithData[ctrlWithData.length - 1] || {};
        const first = ctrlWithData[0] || {};
        const totalGrowth = latest.pu && first.pu ? ((latest.pu - first.pu) / first.pu * 100) : 0;
        const maxPat = Math.max(...ctrlWithData.map(c => c.pu || 0));
        const minPat = Math.min(...ctrlWithData.map(c => c.pu || 0));
        
        // Current year income
        const curYear = new Date().getFullYear().toString();
        const prevYear = (parseInt(curYear) - 1).toString();
        const ytdIncome = INCOME_DATA.filter(d => d.m.startsWith(curYear));
        const ytdTotal = ytdIncome.reduce((s,d) => s + (d.total||0), 0);
        const prevTotal = INCOME_DATA.filter(d => d.m.startsWith(prevYear)).reduce((s,d) => s + (d.total||0), 0);
        
        // Dividend data from static sheet (master record)
        const divYears = Object.entries(DIV_BY_YEAR).filter(([y]) => parseInt(y) >= 2021).sort();
        const latestDivYear = divYears[divYears.length-1];
        
        // Income by strategy per year
        const incomeByYear = {};
        INCOME_DATA.forEach(d => {
          const y = d.m.slice(0,4);
          if (!incomeByYear[y]) incomeByYear[y] = {div:0,cs:0,rop:0,roc:0,cal:0,leaps:0,total:0};
          if (d.div) incomeByYear[y].div += d.div;
          if (d.cs) incomeByYear[y].cs += d.cs;
          if (d.rop) incomeByYear[y].rop += d.rop;
          if (d.roc) incomeByYear[y].roc += d.roc;
          if (d.cal) incomeByYear[y].cal += d.cal;
          if (d.leaps) incomeByYear[y].leaps += d.leaps;
          if (d.total) incomeByYear[y].total += d.total;
        });
        
        // Expense categories (top 10)
        const expCats = Object.entries(GASTOS_CAT).sort((a,b) => a[1] - b[1]).slice(0, 12);
        const maxExp = Math.min(...expCats.map(([,v]) => v), -1);
        
        // Asset allocation
        const brokersUsd = latest.br || 0;
        const bancosEur = latest.bk || 0;
        const bancosUsd = bancosEur * (latest.fx || 1);
        const cryptoEur = latest.cr || 0;
        const cryptoUsd = cryptoEur * (latest.fx || 1);
        const totalUsd = latest.pu || 0;
        const pieData = [
          {l:"Brokers",v:brokersUsd,c:"var(--gold)"},
          {l:"Bancos",v:bancosUsd,c:"#64d2ff"},
          {l:"Crypto",v:cryptoUsd,c:"#bf5af2"},
        ].filter(d => d.v > 0);
        const pieTotal = pieData.reduce((s,d) => s + d.v, 0) || 1;
        
        const strats = [{k:"div",l:"Dividendos",c:"var(--gold)"},{k:"rop",l:"ROP",c:"var(--green)"},{k:"cs",l:"Credit Spreads",c:"#64d2ff"},{k:"roc",l:"ROC",c:"#bf5af2"},{k:"leaps",l:"LEAPs/Trades",c:"var(--orange)"},{k:"cal",l:"Calendars",c:"#ff6b9d"}];
        
        const cs = {padding:"16px 20px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,flex:1,minWidth:140};
        const ls = {fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.8,fontWeight:600,marginBottom:4};
        const vs = {fontSize:22,fontWeight:700,fontFamily:"var(--fm)",lineHeight:1.2};
        const ss = {fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2};
        const secTitle = (ico,text) => <div style={{fontSize:15,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:16}}>{ico} {text}</div>;
        const card = {background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20};
        
        return (
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* ── Summary Cards (Enhanced) ── */}
          {(() => {
            // Calculate live portfolio value from POS_STATIC for more current data
            const livePortfolioUsd = Object.values(POS_STATIC).filter(s=>!s.ls||s.ls==="portfolio").reduce((sum,s) => sum + (s.uv||0), 0);
            const snapshotAge = latest.d ? Math.floor((Date.now() - new Date(latest.d).getTime()) / 86400000) : 999;
            const bestPatUsd = snapshotAge > 45 && livePortfolioUsd > 0 ? livePortfolioUsd : totalUsd;
            const patLabel = snapshotAge > 45 ? "PORTFOLIO (live)" : "PATRIMONIO";
            return (
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {[
              {l:patLabel,v:`$${fDol(bestPatUsd)}`,sub:snapshotAge>45?`Snapshot: $${fDol(totalUsd)} (${snapshotAge}d ago)`:`€${fDol(latest.pe||0)}`,c:"var(--text-primary)"},
              {l:"INVERTIDO",v:`$${fDol(latest.br||0)}`,sub:`Cash: $${fDol(bancosUsd)}`,c:"var(--gold)"},
              {l:"Δ PATRIMONIO",v:`$${fDol((latest.pu||0)-(first.pu||0))}`,sub:`${totalGrowth>=0?"+":""}${_sf(totalGrowth,1)}% (${first.d?.slice(0,7)||"?"} → ${latest.d?.slice(0,7)||"?"})`,c:totalGrowth>=0?"var(--green)":"var(--red)"},
              {l:`DIVIDENDOS ${latestDivYear?.[0]||""}`,v:`$${fDol(latestDivYear?.[1]?.g||0)}`,sub:`Net $${fDol(latestDivYear?.[1]?.n||0)} · ${latestDivYear?.[1]?.c||0}x`,c:"var(--gold)"},
              {l:"INGRESOS BOLSA",v:`$${fDol(prevTotal)}`,sub:`${curYear} YTD: $${fDol(ytdTotal)}`,c:"var(--green)"},
              {l:"YIELD",v:`${_sf(latestDivYear?.[1]?.g>0&&bestPatUsd>0?(latestDivYear[1].g/bestPatUsd*100):0,1)}%`,sub:`YOC ${_sf(latestDivYear?.[1]?.g>0&&(latest.br||0)>0?(latestDivYear[1].g/(latest.br)*100):0,1)}%`,c:"var(--gold)"},
            ].map((k,i)=>(
              <div key={i} style={{flex:"1 1 140px",padding:"14px 16px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:14}}>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.6,fontWeight:600,marginBottom:4}}>{k.l}</div>
                <div style={{fontSize:20,fontWeight:700,color:k.c,fontFamily:"var(--fm)",lineHeight:1.2}}>{k.v}</div>
                {k.sub&&<div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:3}}>{k.sub}</div>}
              </div>
            ))}
          </div>
            );
          })()}
          
          {/* ── Cash & Margin Status ── */}
          {CASH_DATA.length > 0 && (() => {
            const negCash = CASH_DATA.filter(c => c.cash_balance < -1);
            const totalNegUSD = negCash.reduce((s,c) => s + (c.cash_balance_usd || 0), 0);
            const totalIntPaid = CASH_DATA.reduce((s,c) => s + (c.interest_paid || 0) * (c.fx_rate || 1), 0);
            const totalIntReceived = CASH_DATA.reduce((s,c) => s + (c.interest_received || 0) * (c.fx_rate || 1), 0);
            const netInterest = totalIntPaid - totalIntReceived;
            const latestDate = CASH_DATA[0]?.fecha || "";
            const acctNames = {"U5372268":"Factory","U6735130":"Dividendos","U7257686":"Gorka","U7953378":"Amparito"};
            return (
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:15,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>💳 Cash & Margen IB</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{latestDate}</div>
              </div>
              <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                <div style={{flex:"1 1 140px",padding:"12px 16px",background:"rgba(255,69,58,.06)",borderRadius:12,border:"1px solid rgba(255,69,58,.15)"}}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600}}>CASH NEGATIVO</div>
                  <div style={{fontSize:24,fontWeight:800,color:"var(--red)",fontFamily:"var(--fm)",marginTop:2}}>{totalNegUSD<0?"-":""}${fDol(Math.abs(totalNegUSD))}</div>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>Margen utilizado</div>
                </div>
                <div style={{flex:"1 1 140px",padding:"12px 16px",background:"rgba(255,69,58,.06)",borderRadius:12,border:"1px solid rgba(255,69,58,.15)"}}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600}}>INTERESES/MES</div>
                  <div style={{fontSize:24,fontWeight:800,color:"var(--red)",fontFamily:"var(--fm)",marginTop:2}}>-${fDol(netInterest)}</div>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>~${fDol(netInterest*12)}/año</div>
                </div>
                <div style={{flex:"1 1 140px",padding:"12px 16px",background:"rgba(48,209,88,.06)",borderRadius:12,border:"1px solid rgba(48,209,88,.15)"}}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600}}>INT. RECIBIDOS</div>
                  <div style={{fontSize:24,fontWeight:800,color:"var(--green)",fontFamily:"var(--fm)",marginTop:2}}>+${fDol(totalIntReceived)}</div>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>por saldo positivo</div>
                </div>
              </div>
              {/* Detail by account+currency */}
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {negCash.map((c,i) => (
                  <div key={i} style={{padding:"6px 12px",borderRadius:8,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",fontSize:11,fontFamily:"var(--fm)"}}>
                    <span style={{color:"var(--text-tertiary)"}}>{acctNames[c.cuenta]||c.cuenta}</span>
                    <span style={{color:"var(--red)",fontWeight:700,marginLeft:6}}>{c.divisa} {c.cash_balance<0?"-":""}${fDol(Math.abs(c.cash_balance_usd||0))}</span>
                    {c.interest_paid > 0 && <span style={{color:"var(--text-tertiary)",marginLeft:4,fontSize:9}}>int: ${_sf(c.interest_paid * (c.fx_rate||1),0)}</span>}
                  </div>
                ))}
              </div>
            </div>
            );
          })()}
          
          {/* ── Financial Independence Tracker — Redesigned ── */}
          <div style={card}>
            {secTitle("🏔️","Independencia Financiera")}
            {(() => {
              const validFI = FI_TRACK.filter(d => d.fi !== undefined && d.m <= `${_CURRENT_YEAR}-12`);
              const latestFI = validFI[validFI.length-1];
              const crossedZero = validFI.findIndex((d,i) => i > 0 && d.fi >= 0 && validFI[i-1]?.fi < 0);
              const crossMonth = crossedZero >= 0 ? validFI[crossedZero].m : null;
              const latestCov = (() => { const v = validFI.filter(d=>d.cov>0&&d.cov<1000); return v.length ? v[v.length-1].cov : 0; })();
              let streak = 0;
              for (let i = validFI.length-1; i >= 0; i--) { if (validFI[i].fi >= 0) streak++; else break; }
              const totalAcc = latestFI?.acc || 0;
              const mN3 = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
              return <>
                {/* Big banner */}
                <div style={{padding:"20px 24px",marginBottom:16,borderRadius:14,background:latestFI?.fi>=0?"rgba(48,209,88,.06)":"rgba(255,69,58,.06)",border:`1px solid ${latestFI?.fi>=0?"rgba(48,209,88,.15)":"rgba(255,69,58,.15)"}`,textAlign:"center"}}>
                  <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:6}}>ESTADO ACTUAL</div>
                  <div style={{fontSize:36,fontWeight:800,color:latestFI?.fi>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)",lineHeight:1}}>
                    {latestFI?.fi>=0?"+":""}€{(latestFI?.fi||0).toLocaleString()}<span style={{fontSize:16,fontWeight:600}}>/mes</span>
                  </div>
                  <div style={{fontSize:12,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:6}}>
                    {latestFI?.fi>=0?"Tus inversiones generan más que tus gastos":"Tus gastos superan a tus inversiones"} · {latestFI?.m}
                  </div>
                </div>
                {/* KPIs */}
                <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                  {[
                    {l:"COBERTURA",v:`${_sf(latestCov,0)}%`,sub:"gastos cubiertos",c:latestCov>=100?"var(--green)":latestCov>=50?"var(--gold)":"var(--red)"},
                    ...(crossMonth?[{l:"FI ALCANZADA",v:crossMonth,sub:"inversiones > gastos",c:"var(--gold)"}]:[]),
                    {l:"RACHA",v:streak>0?`${streak} meses`:"—",sub:"en superávit",c:streak>=6?"var(--green)":streak>=3?"var(--gold)":"var(--text-tertiary)"},
                    {l:"ACUMULADO",v:`€${totalAcc>=1000?_sf(totalAcc/1000,0)+"K":_sf(totalAcc,0)}`,sub:"ahorro neto",c:totalAcc>=0?"var(--green)":"var(--red)"},
                  ].map((k,i) => <div key={i} style={{flex:"1 1 120px",padding:"12px 16px",background:`${k.c}08`,borderRadius:12,border:`1px solid ${k.c}20`}}>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600}}>{k.l}</div>
                    <div style={{fontSize:22,fontWeight:800,color:k.c,fontFamily:"var(--fm)",marginTop:2}}>{k.v}</div>
                    <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{k.sub}</div>
                  </div>)}
                </div>
                {/* Progress bar */}
                <div style={{marginBottom:16,padding:"12px 16px",background:"rgba(255,255,255,.02)",borderRadius:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Cobertura de gastos</span>
                    <span style={{fontSize:12,fontWeight:700,color:latestCov>=100?"var(--green)":"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(latestCov,0)}%</span>
                  </div>
                  <div style={{height:12,background:"rgba(255,255,255,.06)",borderRadius:6,overflow:"hidden",position:"relative"}}>
                    <div style={{width:`${Math.min(latestCov/Math.max(latestCov,150)*100,100)}%`,height:"100%",background:latestCov>=100?"var(--green)":"linear-gradient(90deg, var(--red), var(--gold))",borderRadius:6}}/>
                    <div style={{position:"absolute",left:`${100/Math.max(latestCov/100,1.5)*100}%`,top:-2,bottom:-2,width:2,background:"var(--green)"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}><span>0%</span><span style={{color:"var(--green)"}}>100% = FI</span></div>
                </div>
                {/* Monthly chart */}
                <div style={{fontSize:11,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:8}}>Evolución Mensual</div>
                {(() => {
                  const data = validFI;
                  const maxAbs = Math.max(...data.map(d => Math.abs(d.fi || 0)), 1);
                  return <div style={{display:"flex",gap:2,alignItems:"center",height:200}}>
                    {data.map((d,i) => {
                      const v = d.fi || 0;
                      const hPct = Math.abs(v) / maxAbs * 45;
                      const isPos = v >= 0;
                      const isLast = i === data.length - 1;
                      const showLbl = i%3===0 || isLast;
                      return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",height:"100%",minWidth:0}}>
                        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",width:"100%"}}>
                          {isPos && showLbl && <div style={{fontSize:7,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)",marginBottom:1,whiteSpace:"nowrap"}}>+€{Math.abs(v)>=1000?_sf(Math.abs(v)/1000,1)+"K":_sf(Math.abs(v),0)}</div>}
                          {isPos && <div style={{width:"70%",maxWidth:14,height:`${Math.max(hPct,v>0?3:0)}%`,background:isLast?"var(--green)":"rgba(48,209,88,.5)",borderRadius:"2px 2px 0 0"}}/>}
                        </div>
                        <div style={{width:"100%",height:1,background:"rgba(255,255,255,.12)",flexShrink:0}}/>
                        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",width:"100%"}}>
                          {!isPos && <div style={{width:"70%",maxWidth:14,height:`${Math.max(hPct,v<0?3:0)}%`,background:"rgba(255,69,58,.45)",borderRadius:"0 0 2px 2px"}}/>}
                          {!isPos && showLbl && <div style={{fontSize:7,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)",marginTop:1,whiteSpace:"nowrap"}}>-€{Math.abs(v)>=1000?_sf(Math.abs(v)/1000,1)+"K":_sf(Math.abs(v),0)}</div>}
                        </div>
                        {i%4===0 && <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:1}}>{mN3[parseInt(d.m.slice(5))-1]||""}{d.m.slice(2,4)}</div>}
                      </div>;
                    })}
                  </div>;
                })()}
                <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:8,fontSize:9,fontFamily:"var(--fm)"}}>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:"var(--green)"}}/>Superávit</span>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:"rgba(255,69,58,.5)"}}/>Déficit</span>
                </div>
              </>;
            })()}
          </div>
          
          {/* ── Net Worth Evolution ── */}
          <div style={card}>
            {secTitle("📈","Evolución del Patrimonio")}
            <div style={{position:"relative",height:200}}>
              {[0,.25,.5,.75,1].map(p => (
                <div key={p} style={{position:"absolute",left:0,right:0,bottom:`${p*100}%`,display:"flex",alignItems:"center",pointerEvents:"none"}}>
                  <div style={{width:50,fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>${fDol(minPat+(maxPat-minPat)*p)}</div>
                  <div style={{flex:1,height:1,background:"rgba(255,255,255,.03)"}}/>
                </div>
              ))}
              <div style={{position:"absolute",left:55,right:0,top:0,bottom:0,display:"flex",alignItems:"flex-end",gap:1}}>
                {ctrlWithData.map((c,i) => {
                  const h = maxPat>minPat?((c.pu-minPat)/(maxPat-minPat)*100):50;
                  return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}} title={`${c.d}: $${(c.pu||0).toLocaleString()}`}>
                    <div style={{width:"100%",maxWidth:16,height:`${Math.max(h,2)}%`,background:i===ctrlWithData.length-1?"var(--gold)":`rgba(200,164,78,${0.25+h/250})`,borderRadius:"2px 2px 0 0",minHeight:2}}/>
                    {i%6===0&&<div style={{fontSize:6,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2,whiteSpace:"nowrap"}}>{c.d?.slice(2,7)}</div>}
                  </div>;
                })}
              </div>
            </div>
          </div>
          
          {/* ── Income by Strategy per Year ── */}
          <div style={card}>
            {secTitle("🎯","Ingresos por Estrategia (USD)")}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {Object.entries(incomeByYear).sort().map(([y, d]) => {
                const maxY = Math.max(...Object.values(incomeByYear).map(v => Math.abs(v.total||0)), 1);
                const bars = strats.map(s => ({...s, v: d[s.k]||0})).filter(s => s.v !== 0);
                const positive = bars.filter(b => b.v > 0).reduce((s,b) => s+b.v, 0);
                return <div key={y}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{y}</span>
                    <span style={{fontSize:13,fontWeight:700,color:d.total>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>${(d.total||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                  </div>
                  <div style={{display:"flex",height:22,borderRadius:6,overflow:"hidden",background:"rgba(255,255,255,.03)",gap:1}}>
                    {bars.filter(b=>b.v>0).map(b => <div key={b.k} style={{width:`${b.v/positive*100}%`,background:b.c,minWidth:2}} title={`${b.l}: $${(b.v||0).toLocaleString(undefined,{maximumFractionDigits:0})}`}/>)}
                  </div>
                </div>;
              })}
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:4}}>
                {strats.map(s => <div key={s.k} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
                  <div style={{width:8,height:8,borderRadius:2,background:s.c}}/>{s.l}
                </div>)}
              </div>
            </div>
          </div>

            {/* ── Diversification Donut ── */}
            <div style={card}>
              {secTitle("🍩","Diversificación por Activos")}
              {(() => {
                const catData = {};
                Object.entries(POS_STATIC).forEach(([t, p]) => {
                  const cat = p.cat || "COMPANY";
                  const val = p.uv || p.mv || 0;
                  if (val <= 0) return;
                  if (!catData[cat]) catData[cat] = {val:0, tickers:[]};
                  catData[cat].val += val;
                  catData[cat].tickers.push({t, val});
                });
                const cats = Object.entries(catData).sort((a,b) => b[1].val - a[1].val);
                const totalVal = cats.reduce((s,[,d]) => s + d.val, 0) || 1;
                const colors = ["#c8a44e","#64d2ff","#30d158","#bf5af2","#ff9f0a","#ff453a","#ff6b9d","#5ac8fa","#ffd60a","#8e8e93"];
                const allH = Object.entries(POS_STATIC).map(([t,p]) => ({t, val:p.uv||p.mv||0})).filter(h=>h.val>0).sort((a,b)=>b.val-a.val).slice(0,6);
                const sz=170, cx=sz/2, cy=sz/2, r=60, sw=20, circ=2*Math.PI*r;
                let off=0;
                return <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
                  <div style={{position:"relative",width:sz,height:sz}}>
                    <svg width={sz} height={sz} style={{transform:"rotate(-90deg)"}}>
                      {cats.map(([cat,data],i) => { const dash=circ*data.val/totalVal; const gap=circ-dash; const o=off; off+=dash; return <circle key={cat} cx={cx} cy={cy} r={r} fill="none" stroke={colors[i%colors.length]} strokeWidth={sw} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-o} opacity={0.8}/>; })}
                    </svg>
                    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                      <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>TOTAL</div>
                      <div style={{fontSize:15,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>${fDol(totalVal)}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4,width:"100%"}}>
                    {cats.slice(0,6).map(([cat,data],i) => <div key={cat} style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{width:10,height:10,borderRadius:2,background:colors[i%colors.length],flexShrink:0}}/>
                      <span style={{fontSize:11,color:"var(--text-primary)",fontFamily:"var(--fm)",flex:1}}>{cat}</span>
                      <span style={{fontSize:11,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>${fDol(data.val)}</span>
                      <span style={{fontSize:10,fontWeight:700,color:colors[i%colors.length],fontFamily:"var(--fm)",width:40,textAlign:"right"}}>{_sf(data.val/totalVal*100,1)}%</span>
                    </div>)}
                  </div>
                  <div style={{width:"100%",borderTop:"1px solid var(--border)",paddingTop:10}}>
                    <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,marginBottom:6}}>TOP HOLDINGS</div>
                    {allH.map((h,i) => <div key={h.t} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <span style={{fontSize:10,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",width:45}}>{h.t}</span>
                      <div style={{flex:1,height:6,background:"rgba(255,255,255,.04)",borderRadius:3,overflow:"hidden"}}>
                        <div style={{width:`${Math.min(h.val/totalVal*100*3,100)}%`,height:"100%",background:colors[i%colors.length],borderRadius:3}}/>
                      </div>
                      <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",width:55,textAlign:"right"}}>${fDol(h.val)}</span>
                      <span style={{fontSize:10,fontWeight:600,color:"var(--text-tertiary)",fontFamily:"var(--fm)",width:35,textAlign:"right"}}>{_sf(h.val/totalVal*100,1)}%</span>
                    </div>)}
                  </div>
                </div>;
              })()}
            </div>
          
          {/* ── FIRE Projection ── */}
          <div style={card}>
            {secTitle("🔥","Proyección FIRE")}
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
              <div style={{padding:"8px 14px",borderRadius:8,background:"rgba(48,209,88,.06)",border:"1px solid rgba(48,209,88,.15)"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>RETURN OBJ.</div>
                <div style={{fontSize:16,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)"}}>{FIRE_PARAMS.returnPct*100}%</div>
              </div>
              <div style={{padding:"8px 14px",borderRadius:8,background:"rgba(255,159,10,.06)",border:"1px solid rgba(255,159,10,.15)"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>INFLACIÓN</div>
                <div style={{fontSize:16,fontWeight:700,color:"var(--orange)",fontFamily:"var(--fm)"}}>{FIRE_PARAMS.inflation*100}%</div>
              </div>
              <div style={{padding:"8px 14px",borderRadius:8,background:"rgba(255,69,58,.06)",border:"1px solid rgba(255,69,58,.15)"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>GASTOS/MES</div>
                <div style={{fontSize:16,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>${(FIRE_PARAMS.monthlyExp||0).toLocaleString()}</div>
              </div>
              <div style={{padding:"8px 14px",borderRadius:8,background:"rgba(200,164,78,.06)",border:"1px solid rgba(200,164,78,.15)"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>PATRIMONIO 2040</div>
                <div style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>${fDol(FIRE_PROJ[FIRE_PROJ.length-1]?.e||0)}</div>
              </div>
            </div>
            {(() => {
              const maxE = Math.max(...FIRE_PROJ.map(p => p.e));
              const curYear = new Date().getFullYear();
              return <div style={{display:"flex",alignItems:"flex-end",gap:3,height:160}}>
                {FIRE_PROJ.map(p => {
                  const h = p.e / maxE * 100;
                  const isPast = p.y <= curYear;
                  const isCurrent = p.y === curYear;
                  return <div key={p.y} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}} title={`${p.y}: $${(p.e||0).toLocaleString()}`}>
                    <div style={{width:"100%",maxWidth:28,height:`${Math.max(h,3)}%`,background:isCurrent?"var(--gold)":isPast?"var(--green)":`rgba(48,209,88,${0.15+h/400})`,borderRadius:"3px 3px 0 0",border:isCurrent?"2px solid var(--gold)":"none"}}/>
                    <div style={{fontSize:8,color:isCurrent?"var(--gold)":isPast?"var(--text-secondary)":"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:3,fontWeight:isCurrent?700:400}}>{String(p.y).slice(2)}</div>
                  </div>;
                })}
              </div>;
            })()}
            <div style={{display:"flex",justifyContent:"space-between",marginTop:8,padding:"0 4px"}}>
              <span style={{fontSize:9,color:"var(--green)",fontFamily:"var(--fm)"}}>■ Pasado/Actual</span>
              <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>■ Proyectado (10% anual − gastos − inflación)</span>
            </div>
          </div>
          
          {/* ── Annual P&L ── */}
          <div style={card}>
            {secTitle("📊","Cuenta de Resultados Anual")}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:500}}>
                <thead><tr>
                  <th style={{padding:"6px 10px",textAlign:"left",color:"var(--text-tertiary)",fontSize:9,fontFamily:"var(--fm)",fontWeight:600,borderBottom:"2px solid var(--border)"}}>CONCEPTO</th>
                  {ANNUAL_PL.map(d => <th key={d.y} style={{padding:"6px 10px",textAlign:"right",color:"var(--gold)",fontSize:11,fontFamily:"var(--fm)",fontWeight:700,borderBottom:"2px solid var(--border)"}}>{d.y}</th>)}
                </tr></thead>
                <tbody>
                  {[
                    {l:"Sueldo Spring",k:"sueldo",c:"var(--text-primary)",prefix:"€",bold:true},
                    {l:"Ingresos Bolsa",k:"bolsa",c:"var(--green)",prefix:"$",bold:true},
                    {l:"  └ Dividendos",k:"div",c:"var(--gold)",prefix:"$"},
                    {l:"  └ ROP",k:"rop",c:"var(--green)",prefix:"$"},
                    {l:"  └ Credit Spreads",k:"cs",c:"#64d2ff",prefix:"$"},
                    {l:"  └ ROC",k:"roc",c:"#bf5af2",prefix:"$"},
                    {l:"  └ LEAPs/Trades",k:"leaps",c:"var(--orange)",prefix:"$"},
                    {l:"  └ Calendars",k:"cal",c:"#ff6b9d",prefix:"$"},
                    {l:"Gastos",k:"gastos",c:"var(--red)",prefix:"€",bold:true},
                  ].map(row => <tr key={row.k}>
                    <td style={{padding:"5px 10px",fontSize:row.bold?12:11,color:row.bold?"var(--text-primary)":"var(--text-secondary)",fontFamily:"var(--fm)",fontWeight:row.bold?600:400,borderBottom:"1px solid rgba(255,255,255,.03)"}}>{row.l}</td>
                    {ANNUAL_PL.map(d => {
                      const v = d[row.k]||0;
                      return <td key={d.y} style={{padding:"5px 10px",textAlign:"right",fontSize:row.bold?12:11,fontWeight:row.bold?700:500,color:v<0?"var(--red)":row.c,fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                        {v!==0?`${row.prefix}${Math.abs(v).toLocaleString()}`:"—"}
                      </td>;
                    })}
                  </tr>)}
                  <tr style={{borderTop:"2px solid var(--border)"}}>
                    <td style={{padding:"6px 10px",fontSize:12,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>AHORRO NETO</td>
                    {ANNUAL_PL.map(d => {
                      const ahorro = (d.sueldo||0) + (d.gastos||0);
                      return <td key={d.y} style={{padding:"6px 10px",textAlign:"right",fontSize:13,fontWeight:800,color:ahorro>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>€{ahorro.toLocaleString()}</td>;
                    })}
                  </tr>
                  <tr>
                    <td style={{padding:"5px 10px",fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Tasa de ahorro</td>
                    {ANNUAL_PL.map(d => {
                      const rate = d.sueldo > 0 ? ((d.sueldo + (d.gastos||0)) / d.sueldo * 100) : 0;
                      return <td key={d.y} style={{padding:"5px 10px",textAlign:"right",fontSize:11,fontWeight:600,color:rate>50?"var(--green)":"var(--orange)",fontFamily:"var(--fm)"}}>{_sf(rate,0)}%</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* ── Monthly Profits (green/red bars) ── */}
          <div style={card}>
            {secTitle("📉","Beneficio Mensual (12m)")}
            {(() => {
              const months12 = INCOME_DATA.slice(-12);
              const maxP = Math.max(...months12.map(d => Math.abs(d.total||0)), 1);
              const mNP = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
              return <>
                <div style={{display:"flex",alignItems:"center",gap:4,height:200,padding:"0 4px"}}>
                  {months12.map((d,i) => {
                    const v = d.total || 0;
                    const h = Math.abs(v) / maxP * 80;
                    const isP = v >= 0;
                    const mn = mNP[parseInt(d.m.slice(5))-1] || d.m.slice(5);
                    return <div key={d.m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",minWidth:0}}>
                      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",width:"100%"}}>
                        {isP && <div style={{fontSize:7,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)",marginBottom:1,whiteSpace:"nowrap"}}>{v>=1000?`${_sf(v/1000,0)}K`:`$${_sf(v,0)}`}</div>}
                        {isP && <div style={{width:"100%",maxWidth:24,height:`${Math.max(h,3)}%`,background:"rgba(48,209,88,.5)",borderRadius:"3px 3px 0 0"}}/>}
                      </div>
                      <div style={{width:"100%",height:1,background:"rgba(255,255,255,.1)",flexShrink:0}}/>
                      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",width:"100%"}}>
                        {!isP && <div style={{width:"100%",maxWidth:24,height:`${Math.max(h,3)}%`,background:"rgba(255,69,58,.45)",borderRadius:"0 0 3px 3px"}}/>}
                        {!isP && <div style={{fontSize:7,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)",marginTop:1,whiteSpace:"nowrap"}}>{_sf(v/1000,0)}K</div>}
                      </div>
                      <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,marginTop:2}}>{mn}</div>
                    </div>;
                  })}
                </div>
                <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:2}}>
                  {[...months12].reverse().map(d => {
                    const v = d.total || 0;
                    const mn = mNP[parseInt(d.m.slice(5))-1] || "";
                    return <div key={d.m} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",borderRadius:6,background:v>=0?"rgba(48,209,88,.03)":"rgba(255,69,58,.03)"}}>
                      <span style={{fontSize:11,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{mn} {d.m.slice(0,4)}</span>
                      <span style={{fontSize:12,fontWeight:700,color:v>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{v>=0?"+":""}${v.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                    </div>;
                  })}
                </div>
              </>;
            })()}
          </div>
          
          {/* ── Expenses by Category ── */}
          <div style={card}>
            {secTitle("💸","Gastos por Categoría")}
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {expCats.map(([cat, val]) => {
                const absVal = Math.abs(val);
                const absMax = Math.abs(maxExp);
                return <div key={cat} style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{width:180,fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)",textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat}</span>
                  <div style={{flex:1,height:16,background:"rgba(255,255,255,.03)",borderRadius:4,overflow:"hidden"}}>
                    <div style={{width:`${absVal/absMax*100}%`,height:"100%",background:"linear-gradient(90deg,var(--red),rgba(255,69,58,.2))",borderRadius:4}}/>
                  </div>
                  <span style={{width:60,fontSize:10,color:"var(--red)",fontFamily:"var(--fm)",textAlign:"right"}}>€{_sf(absVal/1e3,1)}K</span>
                </div>;
              })}
            </div>
          </div>
          
          {/* ── Patrimony History Table ── */}
          <div style={{...card,padding:0,overflow:"hidden"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:14,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📋 Historial Mensual · {ctrlWithData.length} snapshots</span>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:700}}>
                <thead><tr>
                  {["FECHA","PAT USD","PAT EUR","BROKERS","BANCOS","CRYPTO","€/$","Δ"].map((h,i)=>
                    <th key={i} style={{padding:"8px 12px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.5,borderBottom:"1px solid var(--border)"}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[...ctrlWithData].reverse().slice(0,24).map((c,i) => {
                    const prev = ctrlWithData[ctrlWithData.length-1-i-1];
                    const chg = prev?.pu?((c.pu-prev.pu)/prev.pu*100):0;
                    const bg = i%2?"rgba(255,255,255,.012)":"transparent";
                    const bd = "1px solid rgba(255,255,255,.03)";
                    return <tr key={i} style={{background:bg}}>
                      <td style={{padding:"7px 12px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:bd}}>{c.d}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:bd}}>${(c.pu||0).toLocaleString()}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:bd}}>€{(c.pe||0).toLocaleString()}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:bd}}>${(c.br||0).toLocaleString()}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"#64d2ff",borderBottom:bd}}>€{(c.bk||0).toLocaleString()}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"#bf5af2",borderBottom:bd}}>{c.cr?`€${(c.cr||0).toLocaleString()}`:"—"}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:bd}}>{c.fx?.toFixed(3)}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:chg>=0?"var(--green)":"var(--red)",borderBottom:bd}}>{chg?`${chg>=0?"+":""}${_sf(chg,1)}%`:""}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ═══ DIVIDENDOS TAB — Dashboard + Registro ═══ */}
      {homeTab==="dividendos" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {(() => {
            if (divLoading) return <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)"}}>⏳ Cargando dividendos...</div>;
            if (divLog.length === 0) return <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)"}}><div style={{fontSize:36,marginBottom:12}}>💰</div>Sin datos de dividendos. Espera un momento o importa tu historial.</div>;
            const filtered = divLog.filter(d => {
              if (divFilter.year !== "all" && !d.date?.startsWith(divFilter.year)) return false;
              if (divFilter.month && divFilter.month !== "all" && !d.date?.startsWith(divFilter.month)) return false;
              if (divFilter.ticker && !d.ticker?.toUpperCase().includes(divFilter.ticker.toUpperCase())) return false;
              return true;
            });
            const totalGross = filtered.reduce((s,d) => s+(d.gross||0), 0);
            const totalNet = filtered.reduce((s,d) => s+(d.net||0), 0);
            const totalTax = totalGross - totalNet;
            const taxRate = totalGross > 0 ? (totalTax / totalGross * 100) : 0;
            const uniqueTickers = new Set(filtered.map(d=>d.ticker)).size;
            const all = divLog.filter(d => d.date && d.gross);
            const byYear = {}; all.forEach(d => { const y=d.date.slice(0,4); if(!byYear[y])byYear[y]={g:0,n:0,c:0}; byYear[y].g+=d.gross||0; byYear[y].n+=d.net||0; byYear[y].c++; });
            const yearKeys = Object.keys(byYear).sort();
            const maxYearG = Math.max(...yearKeys.map(y=>byYear[y].g),1);
            const byMonth = {}; all.forEach(d => { const m=d.date.slice(0,7); if(!byMonth[m])byMonth[m]={g:0,n:0,c:0}; byMonth[m].g+=d.gross||0; byMonth[m].n+=d.net||0; byMonth[m].c++; });
            const monthKeys = Object.keys(byMonth).sort().slice(-36);
            const maxMonthG = Math.max(...monthKeys.map(m=>byMonth[m].g),1);
            const fireTarget = 3500;
            const last12m = all.filter(d => { const c=new Date(); c.setMonth(c.getMonth()-12); return d.date>=c.toISOString().slice(0,10); });
            const net12m = last12m.reduce((s,d)=>s+(d.net||0),0);
            const avgNetMonth = net12m/12;
            const firePct = Math.min(avgNetMonth/fireTarget*100,100);
            const byCalMonth = {}; all.forEach(d => { const k=d.date.slice(0,4)+"-"+d.date.slice(5,7); if(!byCalMonth[k])byCalMonth[k]={g:0,n:0}; byCalMonth[k].g+=d.gross||0; byCalMonth[k].n+=d.net||0; });
            const twelveMonthsAgo = new Date(); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth()-12);
            const cutoff12m = twelveMonthsAgo.toISOString().slice(0,10);
            const recent12m = all.filter(d=>d.date>=cutoff12m);
            const byTicker12 = {}; recent12m.forEach(d => { const t=d.ticker; if(!t)return; if(!byTicker12[t])byTicker12[t]={g:0,n:0,c:0}; byTicker12[t].g+=d.gross||0; byTicker12[t].n+=d.net||0; byTicker12[t].c++; });
            const topPayers = Object.entries(byTicker12).sort((a,b)=>b[1].g-a[1].g).slice(0,25);
            const maxTickerG = topPayers.length>0?topPayers[0][1].g:1;
            const yocData = Object.entries(byTicker12).map(([t,d])=>{ const pos=POS_STATIC[t]; if(!pos||!pos.cb||!pos.sh)return null; const tc=pos.cb*pos.sh; const yoc=tc>0?(d.g/tc*100):0; const cy=pos.lp&&pos.sh?(d.g/(pos.lp*pos.sh)*100):0; return {t,g12:d.g,cost:tc,yoc,cy,sh:pos.sh,cb:pos.cb,lp:pos.lp}; }).filter(Boolean).filter(d=>d.yoc>0).sort((a,b)=>b.yoc-a.yoc);
            const tickerDates = {}; all.forEach(d=>{ const t=d.ticker; if(!t)return; if(!tickerDates[t])tickerDates[t]=[]; tickerDates[t].push(d.date); });
            const freqData = Object.entries(tickerDates).map(([t,dates])=>{ dates.sort(); if(dates.length<2)return null; const gaps=[]; for(let i=1;i<dates.length;i++){const d1=new Date(dates[i-1]),d2=new Date(dates[i]); gaps.push((d2-d1)/(864e5));} const avg=gaps.reduce((s,g)=>s+g,0)/gaps.length; let freq=avg<=35?"Mensual":avg<=65?"Bimensual":avg<=100?"Trimestral":avg<=200?"Semestral":"Anual"; const last=dates[dates.length-1]; const next=new Date(last); next.setDate(next.getDate()+Math.round(avg)); return {t,freq,avg:Math.round(avg),next:next.toISOString().slice(0,10),last,count:dates.length}; }).filter(d=>d&&byTicker12[d.t]).sort((a,b)=>a.next.localeCompare(b.next));
            const curYear = divFilter.year!=="all"?divFilter.year:new Date().getFullYear().toString();
            const prevYear = String(parseInt(curYear)-1);
            const tickerByYear = {}; all.forEach(d=>{ const y=d.date.slice(0,4),t=d.ticker; if(!t)return; if(!tickerByYear[t])tickerByYear[t]={}; if(!tickerByYear[t][y])tickerByYear[t][y]=0; tickerByYear[t][y]+=d.gross||0; });
            const growthData = Object.entries(tickerByYear).map(([t,years])=>{ const cur=years[curYear]||0,prev=years[prevYear]||0; const g=prev>0?((cur-prev)/prev*100):(cur>0?999:0); return {t,cur,prev,g}; }).filter(d=>d.cur>0||d.prev>0).sort((a,b)=>b.cur-a.cur);
            const availMonths = divFilter.year!=="all"?[...new Set(divLog.filter(d=>d.date?.startsWith(divFilter.year)).map(d=>d.date?.slice(0,7)).filter(Boolean))].sort().reverse():[];
            const rc = v=>v>0?"var(--green)":v<0?"var(--red)":"var(--text-secondary)";
            const mNames=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
            return <>
              {/* KPIs + FIRE */}
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                {[{l:"GROSS",v:`$${totalGross.toLocaleString(undefined,{maximumFractionDigits:0})}`,c:"var(--gold)"},{l:"NET",v:`$${totalNet.toLocaleString(undefined,{maximumFractionDigits:0})}`,c:"var(--green)"},{l:"TAX",v:`${_sf(taxRate,0)}%`,c:"var(--red)"},{l:"COBROS",v:filtered.length,c:"var(--text-primary)"},{l:"TICKERS",v:uniqueTickers,c:"var(--text-secondary)"},{l:"NET/MES (12m)",v:`$${avgNetMonth.toLocaleString(undefined,{maximumFractionDigits:0})}`,c:avgNetMonth>=fireTarget?"var(--green)":"var(--orange)"}].map((k,i)=>(
                  <div key={i} style={{flex:"1 1 85px",padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.6,fontWeight:600,marginBottom:3}}>{k.l}</div>
                    <div style={{fontSize:16,fontWeight:700,color:k.c,fontFamily:"var(--fm)"}}>{k.v}</div></div>))}
              </div>
              {/* FIRE Bar */}
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontSize:11,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>🎯 FIRE: ${fireTarget.toLocaleString()}/mes neto</span>
                  <span style={{fontSize:13,fontWeight:700,color:firePct>=100?"var(--green)":"var(--orange)",fontFamily:"var(--fm)"}}>{_sf(firePct,0)}% — ${avgNetMonth.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span>
                </div>
                <div style={{height:10,background:"rgba(255,255,255,.05)",borderRadius:5,overflow:"hidden"}}>
                  <div style={{width:`${Math.min(firePct,100)}%`,height:"100%",background:firePct>=100?"var(--green)":"linear-gradient(90deg,var(--gold),var(--orange))",borderRadius:5}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
                  <span>$0</span><span>Faltan ${Math.max(0,fireTarget-avgNetMonth).toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span><span style={{color:"var(--green)"}}>${fireTarget.toLocaleString()}</span>
                </div>
              </div>
              {/* Filters */}
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <select value={divFilter.year} onChange={e=>setDivFilter(p=>({...p,year:e.target.value,month:"all"}))} style={{padding:"6px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
                  <option value="all">Todos años</option>
                  {[...new Set(divLog.map(d=>d.date?.slice(0,4)).filter(Boolean))].sort().reverse().map(y=><option key={y} value={y}>{y}</option>)}
                </select>
                {divFilter.year!=="all"&&<select value={divFilter.month||"all"} onChange={e=>setDivFilter(p=>({...p,month:e.target.value}))} style={{padding:"6px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
                  <option value="all">Todos meses</option>{availMonths.map(m=><option key={m} value={m}>{m}</option>)}</select>}
                <input type="text" placeholder="Ticker..." value={divFilter.ticker} onChange={e=>setDivFilter(p=>({...p,ticker:e.target.value}))} style={{width:90,padding:"6px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/>
                <button onClick={()=>setDivShowForm(!divShowForm)} style={{padding:"7px 14px",borderRadius:8,border:"1px solid var(--gold)",background:divShowForm?"var(--gold)":"var(--gold-dim)",color:divShowForm?"#000":"var(--gold)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{divShowForm?"✕":"+ Div"}</button>
                <label style={{padding:"7px 12px",borderRadius:8,border:"1px solid rgba(48,209,88,.3)",background:"rgba(48,209,88,.06)",color:"var(--green)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>↑ Import<input type="file" accept=".json" style={{display:"none"}} onChange={e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{try{const data=JSON.parse(ev.target.result);const entries=Array.isArray(data)?data:(data.entries||data.dividends||[]);if(entries.length){setDivLog(prev=>{const next=[...prev,...entries.filter(e=>e.date&&e.ticker)];next.sort((a,b)=>b.date.localeCompare(a.date));saveDivLog(next);return next;});alert(`${entries.length} importados`);}}catch(err){alert("Error: "+err.message);}};reader.readAsText(file);}}/></label>
              </div>
              {/* Add form */}
              {divShowForm&&(<div style={{padding:14,background:"var(--card)",border:"1px solid var(--gold-dim)",borderRadius:12}}><div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"flex-end"}}>
                <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>FECHA</label><input type="date" value={divForm.date} onChange={e=>setDivForm(p=>({...p,date:e.target.value}))} style={{padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
                <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>TICKER</label><input type="text" value={divForm.ticker} onChange={e=>setDivForm(p=>({...p,ticker:e.target.value.toUpperCase()}))} placeholder="DEO" style={{width:65,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
                <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>GROSS</label><input type="number" step="0.01" value={divForm.gross||""} onChange={e=>{const g=parseFloat(e.target.value)||0;setDivForm(p=>({...p,gross:g,net:g*(1-p.taxPct/100)}));}} style={{width:75,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
                <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>TAX%</label><input type="number" value={divForm.taxPct||""} onChange={e=>{const t=parseFloat(e.target.value)||0;setDivForm(p=>({...p,taxPct:t,net:p.gross*(1-t/100)}));}} style={{width:45,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
                <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>SHARES</label><input type="number" value={divForm.shares||""} onChange={e=>setDivForm(p=>({...p,shares:parseFloat(e.target.value)||0}))} style={{width:60,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
                <button onClick={()=>{if(divForm.date&&divForm.ticker&&divForm.gross){addDivEntry(divForm);setDivForm(p=>({...p,ticker:"",gross:0,net:0,shares:0}));}}} style={{padding:"6px 16px",borderRadius:6,border:"none",background:"var(--gold)",color:"#000",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)",height:30}}>Guardar</button>
              </div></div>)}
              {/* Annual chart */}
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>📈 Dividendos por Año</div>
                <div style={{display:"flex",alignItems:"flex-end",gap:6,height:140}}>
                  {yearKeys.map((y,i)=>{const d=byYear[y];const h=d.g/maxYearG*100;const pY=yearKeys[i-1];const gr=pY&&byYear[pY].g>0?((d.g-byYear[pY].g)/byYear[pY].g*100):null;return(<div key={y} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}} title={`${y}: G$${_sf(d.g,0)} N$${_sf(d.n,0)} ${d.c}x`}>{gr!=null&&<div style={{fontSize:8,fontWeight:600,color:rc(gr),fontFamily:"var(--fm)",marginBottom:2}}>{gr>=0?"+":""}{_sf(gr,0)}%</div>}<div style={{fontSize:9,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:2}}>${_sf(d.g/1000,1)}K</div><div style={{width:"100%",maxWidth:40,height:`${Math.max(h,4)}%`,background:"var(--gold)",borderRadius:"4px 4px 0 0",opacity:.7}}/><div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:4,fontWeight:600}}>{y}</div></div>);})}
                </div>
              </div>
              {/* ── Calendar: Dividendos Mes a Mes (selector de año) ── */}
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
                {(() => {
                  const mNF = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
                  const byYM = {};
                  Object.entries(DIV_BY_MONTH).forEach(([ym, dd]) => {
                    const yy = ym.slice(0,4), mm = parseInt(ym.slice(5))-1;
                    if (!byYM[yy]) byYM[yy] = new Array(12).fill(null);
                    byYM[yy][mm] = dd;
                  });
                  const calYrs = Object.keys(byYM).filter(yy => parseInt(yy) >= 2022).sort();
                  const selY = calYrs.includes(divCalYear) ? divCalYear : calYrs[calYrs.length-1];
                  const mths = byYM[selY] || new Array(12).fill(null);
                  const mxMG = Math.max(...mths.map(dd => dd?.g || 0), 1);
                  const yTot = mths.reduce((s,dd) => s + (dd?.g || 0), 0);
                  const yNet = mths.reduce((s,dd) => s + (dd?.n || 0), 0);
                  const yCnt = mths.reduce((s,dd) => s + (dd?.c || 0), 0);
                  const yAvg = yTot / (mths.filter(dd=>dd&&dd.g>0).length || 1);
                  const prvM = byYM[String(parseInt(selY)-1)];
                  const prvT = prvM ? prvM.reduce((s,dd) => s + (dd?.g || 0), 0) : 0;
                  const yGr = prvT > 0 ? ((yTot - prvT) / prvT * 100) : 0;
                  return <>
                    <div style={{display:"flex",gap:0,marginBottom:14,border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",width:"fit-content"}}>
                      {calYrs.map(yy => <button key={yy} onClick={()=>setDivCalYear(yy)} style={{padding:"8px 16px",border:"none",background:selY===yy?"var(--gold-dim)":"transparent",color:selY===yy?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:selY===yy?700:500,cursor:"pointer",fontFamily:"var(--fm)",borderRight:"1px solid var(--border)"}}>{yy}</button>)}
                    </div>
                    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                      {[{l:"INCOME",v:`$${yTot>=1000?_sf(yTot/1000,1)+"K":_sf(yTot,0)}`,c:"var(--gold)"},{l:"⌀ MES",v:`$${_sf(yAvg,0)}`,c:"var(--green)"},{l:"NET",v:`$${yNet>=1000?_sf(yNet/1000,1)+"K":_sf(yNet,0)}`,c:"var(--text-primary)"},...(prvT>0?[{l:"YoY",v:`${yGr>=0?"+":""}${_sf(yGr,0)}%`,c:yGr>=0?"var(--green)":"var(--red)"}]:[]),{l:"COBROS",v:String(yCnt),c:"var(--text-secondary)"}].map((k,ki) => <div key={ki} style={{padding:"8px 14px",background:`${k.c}08`,borderRadius:10,border:`1px solid ${k.c}22`}}><div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5}}>{k.l}</div><div style={{fontSize:18,fontWeight:800,color:k.c,fontFamily:"var(--fm)"}}>{k.v}</div></div>)}
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"flex-end",height:220,paddingTop:30}}>
                      {mths.map((dd, mi) => {
                        const gg = dd?.g || 0;
                        const cn = dd?.c || 0;
                        const hh = mxMG > 0 ? (gg / mxMG * 100) : 0;
                        const pM = prvM?.[mi];
                        const pG = pM?.g || 0;
                        const mG = pG > 0 ? ((gg - pG) / pG * 100) : 0;
                        return <div key={mi} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%",position:"relative"}}>
                          {gg > 0 && <div style={{fontSize:9,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:1,whiteSpace:"nowrap",transform:"rotate(-45deg)",transformOrigin:"bottom center",position:"absolute",top:0,left:"50%",marginLeft:-4}}>{gg>=1000?`${_sf(gg/1000,1)}K`:`$${_sf(gg,0)}`}</div>}
                          {gg > 0 && pG > 0 && <div style={{fontSize:7,fontWeight:600,color:mG>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)",marginBottom:2}}>{mG>=0?"+":""}{_sf(mG,0)}%</div>}
                          <div style={{width:"100%",maxWidth:36,height:`${Math.max(hh, gg>0?4:0)}%`,background:gg>0?"linear-gradient(180deg, var(--gold), rgba(200,164,78,.2))":"transparent",borderRadius:"4px 4px 0 0",minHeight:gg>0?4:0}}/>
                          <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:5,fontWeight:600}}>{mNF[mi]}</div>
                          {cn > 0 && <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{cn}x</div>}
                        </div>;
                      })}
                    </div>
                  </>;
                })()}
              </div>
              {/* YoY por mes */}
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>📊 Comparativa Mensual YoY ({prevYear} vs {curYear})</div>
                <div style={{display:"flex",gap:4}}>
                  {["01","02","03","04","05","06","07","08","09","10","11","12"].map(mm=>{const cur=byCalMonth[curYear+"-"+mm]?.g||0;const prev=byCalMonth[prevYear+"-"+mm]?.g||0;const mx=Math.max(cur,prev,1);const gr=prev>0?((cur-prev)/prev*100):(cur>0?100:0);return(<div key={mm} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}} title={`${mNames[parseInt(mm)-1]}: ${prevYear} $${_sf(prev,0)} → ${curYear} $${_sf(cur,0)}`}><div style={{fontSize:7,fontWeight:600,color:rc(gr),fontFamily:"var(--fm)"}}>{cur>0&&prev>0?`${gr>=0?"+":""}${_sf(gr,0)}%`:""}</div><div style={{display:"flex",gap:1,alignItems:"flex-end",height:60,width:"100%"}}><div style={{flex:1,height:`${prev/mx*100}%`,background:"var(--text-tertiary)",borderRadius:"2px 2px 0 0",opacity:.4,minHeight:prev>0?2:0}}/><div style={{flex:1,height:`${cur/mx*100}%`,background:cur>=prev?"var(--green)":"var(--red)",borderRadius:"2px 2px 0 0",opacity:.8,minHeight:cur>0?2:0}}/></div><div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{mNames[parseInt(mm)-1]}</div></div>);})}
                </div>
                <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:8,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}><span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:"var(--text-tertiary)",opacity:.4}}/>{prevYear}</span><span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:"var(--green)"}}/>{curYear}</span></div>
              </div>
              {/* Monthly 36m */}
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>📅 Dividendos Mensuales (36m)</div>
                  <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Media: <span style={{color:"var(--gold)",fontWeight:600}}>${monthKeys.length>0?_sf(monthKeys.reduce((s,m)=>s+(byMonth[m]?.g||0),0)/monthKeys.length,0):"0"}/mes</span></div>
                </div>
                {(() => {
                  const chartH = 160;
                  const yMax = Math.ceil(maxMonthG / 1000) * 1000 || 5000;
                  const ySteps = [];
                  for (let v = 0; v <= yMax; v += yMax <= 5000 ? 1000 : 2000) ySteps.push(v);
                  const yTop = ySteps[ySteps.length-1] || 1;
                  // Show value on every 3rd bar + first + last
                  const showValueAt = new Set([0, monthKeys.length-1]);
                  monthKeys.forEach((_,i) => { if (i % 3 === 0) showValueAt.add(i); });
                  return <div style={{display:"flex",gap:0}}>
                    {/* Y Axis */}
                    <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",height:chartH,paddingRight:6,flexShrink:0}}>
                      {[...ySteps].reverse().map(v => (
                        <div key={v} style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right",width:30,lineHeight:"1"}}>${v>=1000?_sf(v/1000,0)+"K":v}</div>
                      ))}
                    </div>
                    <div style={{flex:1,position:"relative"}}>
                      {/* Grid lines */}
                      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"space-between",pointerEvents:"none"}}>
                        {ySteps.map(v => <div key={v} style={{borderBottom:"1px solid rgba(255,255,255,.04)",width:"100%"}}/>)}
                      </div>
                      {/* Bars */}
                      <div style={{display:"flex",alignItems:"flex-end",gap:1,height:chartH,position:"relative"}}>
                        {monthKeys.map((m,i) => {
                          const d = byMonth[m];
                          const h = yTop > 0 ? (d.g / yTop * 100) : 0;
                          const isCur = m.startsWith(new Date().getFullYear().toString());
                          const isLast = i === monthKeys.length - 1;
                          const showVal = showValueAt.has(i) && d.g > 0;
                          return <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}} title={`${m}: G$${_sf(d.g,0)} N$${_sf(d.n,0)} ${d.c}x`}>
                            {showVal && <div style={{fontSize:7,fontWeight:600,color:isLast?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:1,whiteSpace:"nowrap"}}>{d.g>=1000?_sf(d.g/1000,1)+"K":_sf(d.g,0)}</div>}
                            <div style={{width:"100%",maxWidth:14,height:`${Math.max(h,3)}%`,background:isCur?"var(--gold)":"var(--green)",borderRadius:"2px 2px 0 0",opacity:isCur?1:.5}}/>
                          </div>;
                        })}
                      </div>
                      {/* X axis */}
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                        {monthKeys.filter((_,i) => i === 0 || i === monthKeys.length-1 || (i % 6 === 0)).map(m => (
                          <span key={m} style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{m.slice(2)}</span>
                        ))}
                      </div>
                    </div>
                  </div>;
                })()}
              </div>
              {/* Dividends Received — DivTracker style */}
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>💰 Dividends Received (12m)</div>
                  <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Total: <span style={{color:"var(--gold)",fontWeight:700}}>${recent12m.reduce((s,d)=>s+(d.gross||0),0).toLocaleString(undefined,{maximumFractionDigits:0})}</span></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {topPayers.map(([t,d],i)=>{
                    const pct = maxTickerG > 0 ? (d.g/maxTickerG*100) : 0;
                    const totG = recent12m.reduce((s,dd)=>s+(dd.gross||0),0)||1;
                    return <div key={t} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<topPayers.length-1?"1px solid rgba(255,255,255,.03)":"none"}}>
                      <span style={{width:22,fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right",fontWeight:600}}>{i+1}</span>
                      <div style={{width:46,height:26,borderRadius:6,background:"rgba(200,164,78,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"var(--gold)",fontFamily:"var(--fm)"}}>{t.slice(0,5)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{height:12,background:"rgba(255,255,255,.03)",borderRadius:4,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:"linear-gradient(90deg,var(--gold),rgba(200,164,78,.15))",borderRadius:4}}/>
                        </div>
                      </div>
                      <span style={{fontSize:13,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",width:65,textAlign:"right"}}>${d.g>=1000?_sf(d.g/1000,2)+"K":_sf(d.g,0)}</span>
                      <span style={{fontSize:10,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",width:38,textAlign:"right"}}>{_sf(d.g/totG*100,1)}%</span>
                    </div>;
                  })}
                </div>
              </div>
              {/* YOC */}
              {yocData.length>0&&(<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:4}}>💎 Yield on Cost (12m / coste)</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:12}}>Posiciones activas con cost basis</div>
                <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:550}}><thead><tr>{["TICKER","DIV 12M","COSTE","YOC","YIELD","CB","PRECIO","SH"].map((h,i)=><th key={i} style={{padding:"6px 10px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead><tbody>
                  {yocData.slice(0,30).map((d,i)=>(<tr key={d.t} style={{background:i%2?"rgba(255,255,255,.01)":"transparent"}}><td style={{padding:"5px 10px",fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.t}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.g12,0)}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.cost/1000,1)}K</td><td style={{padding:"5px 10px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:d.yoc>=8?"var(--green)":d.yoc>=4?"var(--gold)":"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(d.yoc,1)}%</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(d.cy,1)}%</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.cb,2)}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:d.lp>=d.cb?"var(--green)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.lp,2)}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.sh}</td></tr>))}
                </tbody></table></div></div>)}
              {/* Frequency */}
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:4}}>📅 Frecuencia + Próximo Cobro</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:12}}>Basado en historial · Posiciones activas</div>
                <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}><thead><tr>{["TICKER","FREQ","ÚLTIMO","PRÓXIMO","#","~DÍAS"].map((h,i)=><th key={i} style={{padding:"6px 10px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead><tbody>
                  {freqData.slice(0,40).map((d,i)=>{const past=d.next<new Date().toISOString().slice(0,10);return(<tr key={d.t} style={{background:i%2?"rgba(255,255,255,.01)":"transparent"}}><td style={{padding:"5px 10px",fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.t}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:d.freq==="Mensual"?"rgba(48,209,88,.1)":"rgba(201,169,80,.1)",color:d.freq==="Mensual"?"var(--green)":"var(--gold)"}}>{d.freq}</span></td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.last}</td><td style={{padding:"5px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:past?"var(--orange)":"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.next}{past?" ⏰":""}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.count}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.avg}d</td></tr>);})}
                </tbody></table></div></div>
              {/* Sortable table */}
              {(()=>{const cols=[{k:"date",l:"FECHA",a:"left"},{k:"ticker",l:"TICKER",a:"left"},{k:"gross",l:"GROSS",a:"right"},{k:"tax",l:"TAX%",a:"right"},{k:"net",l:"NET",a:"right"},{k:"currency",l:"MON",a:"right"},{k:"shares",l:"SH",a:"right"},{k:"dps",l:"DPS",a:"right"},{k:"",l:"",a:"center"}];const sk=divSort.col,sa=divSort.asc;const sorted=[...filtered].sort((a,b)=>{let va,vb;if(sk==="date"){va=a.date||"";vb=b.date||"";}else if(sk==="ticker"){va=a.ticker||"";vb=b.ticker||"";}else if(sk==="gross"){va=a.gross||0;vb=b.gross||0;}else if(sk==="net"){va=a.net||0;vb=b.net||0;}else if(sk==="tax"){va=a.gross>0?(1-a.net/a.gross):0;vb=b.gross>0?(1-b.net/b.gross):0;}else if(sk==="currency"){va=a.currency||"";vb=b.currency||"";}else if(sk==="shares"){va=a.shares||0;vb=b.shares||0;}else if(sk==="dps"){va=a.shares&&a.gross?a.gross/a.shares:0;vb=b.shares&&b.gross?b.gross/b.shares:0;}else{va=a.date||"";vb=b.date||"";}if(typeof va==="string")return sa?va.localeCompare(vb):vb.localeCompare(va);return sa?va-vb:vb-va;});const ts=k=>{if(!k)return;setDivSort(p=>p.col===k?{col:k,asc:!p.asc}:{col:k,asc:false});};const ar=k=>divSort.col===k?(divSort.asc?" ▲":" ▼"):"";return(<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}><div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)"}}><span style={{fontSize:13,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📋 Cobros · {filtered.length}</span></div>{divLoading?<div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)"}}>Cargando...</div>:filtered.length===0?<div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)",fontSize:12}}>Sin datos.</div>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:700}}><thead><tr>{cols.map((c,i)=><th key={i} onClick={()=>ts(c.k)} style={{padding:"7px 10px",textAlign:c.a,color:divSort.col===c.k?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"1px solid var(--border)",cursor:c.k?"pointer":"default",userSelect:"none",whiteSpace:"nowrap"}}>{c.l}{ar(c.k)}</th>)}</tr></thead><tbody>{sorted.slice(0,300).map((d,i)=>(<tr key={d.id||i} style={{background:i%2?"rgba(255,255,255,.012)":"transparent"}} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"rgba(255,255,255,.012)":"transparent"}><td style={{padding:"5px 10px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.date}</td><td style={{padding:"5px 10px",fontWeight:600,fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.ticker}</td><td style={{padding:"5px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.gross||0,2)}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.gross&&d.net?_sf((1-(d.net||0)/(d.gross||1))*100,0):0}%</td><td style={{padding:"5px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--green)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.net||0,2)}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.currency||"USD"}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.shares||""}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.shares&&d.gross?_sf(d.gross/d.shares,4):""}</td><td style={{padding:"3px 6px",borderBottom:"1px solid rgba(255,255,255,.03)"}}><button onClick={()=>deleteDivEntry(d.id)} style={{width:18,height:18,borderRadius:4,border:"1px solid rgba(255,69,58,.12)",background:"transparent",color:"var(--red)",fontSize:7,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:.3}}>✕</button></td></tr>))}</tbody></table></div>}</div>);})()}
              {/* Export */}
              {divLog.length>0&&(<div style={{display:"flex",justifyContent:"flex-end"}}><button onClick={()=>{const blob=new Blob([JSON.stringify(divLog,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="dividendos_ar.json";a.click();URL.revokeObjectURL(url);}} style={{padding:"5px 12px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)"}}>↓ Export JSON</button></div>)}
            </>;
          })()}
        </div>
      )}

      {/* ═══ FIRE TAB — Independencia Financiera ═══ */}
      {homeTab==="fire" && (() => {
        // === FX RATES ===
        const fxEurUsd = fxRates?.EUR ? 1/fxRates.EUR : latest?.fx || 1.18;
        const fxCnyUsd = fxRates?.CNY ? 1/fxRates.CNY : 1/7.25;
        const fxCnyEur = fxCnyUsd / fxEurUsd; // CNY → EUR
        const isUSD = fireCcy === "USD";
        const sym = isUSD ? "$" : "€";
        
        // === GASTOS: native currencies from GASTOS_MONTH ===
        const gMonths = Object.keys(GASTOS_MONTH).sort();
        const last12g = gMonths.slice(-12);
        const nGM = last12g.length || 1;
        
        // Monthly native totals
        const gNative = {};
        gMonths.forEach(m => {
          const d = GASTOS_MONTH[m];
          gNative[m] = {eur: d.eur||0, cny: d.cny||0, usd: d.usd||0};
        });
        
        // Convert to display currency for totals
        const toDisp = (eur, cny, usd) => {
          if (isUSD) return eur * fxEurUsd + cny * fxCnyUsd + usd;
          return eur + cny * fxCnyEur + usd / fxEurUsd;
        };
        
        // Last 12m averages in native
        const avgEur = last12g.reduce((s,m) => s + (gNative[m]?.eur||0), 0) / nGM;
        const avgCny = last12g.reduce((s,m) => s + (gNative[m]?.cny||0), 0) / nGM;
        const avgUsd = last12g.reduce((s,m) => s + (gNative[m]?.usd||0), 0) / nGM;
        const gastosAvg = toDisp(avgEur, avgCny, avgUsd);
        const gastosAnnual = gastosAvg * 12;
        
        // España scenario: only EUR gastos (no China)
        const espAvg = isUSD ? avgEur * fxEurUsd : avgEur;
        const espAnnual = espAvg * 12;
        
        // === DIVIDENDOS (USD from IB) ===
        const all = divLog.filter(d => d.date && d.gross);
        const divByMonth = {};
        all.forEach(d => { const m=d.date.slice(0,7); if(!divByMonth[m])divByMonth[m]={g:0,n:0}; divByMonth[m].g+=d.gross||0; divByMonth[m].n+=d.net||0; });
        const last12d = Object.keys(divByMonth).sort().slice(-12);
        const divNet12mUSD = last12d.reduce((s,m) => s+(divByMonth[m]?.n||0), 0);
        const divNetMUSD = divNet12mUSD / 12;
        const divNetM = isUSD ? divNetMUSD : divNetMUSD / fxEurUsd;
        const divNetA = divNetM * 12;
        
        // === PATRIMONIO ===
        const latest = CTRL_DATA.filter(c => c.pu>0).sort((a,b) => (a.d||"").localeCompare(b.d||"")).slice(-1)[0] || {};
        const pat = isUSD ? (latest.pu||0) : (latest.pe||0);
        
        // === SUELDO ===
        const sueldos = INCOME_DATA.filter(d => d.sl>0).map(d => d.sl);
        const sueldoMUSD = sueldos.length>0 ? sueldos.reduce((s,v)=>s+v,0)/sueldos.length : 0;
        const sueldoM = isUSD ? sueldoMUSD : sueldoMUSD / fxEurUsd;
        
        // === FIRE METRICS ===
        const divCoversPct = gastosAvg>0 ? (divNetM/gastosAvg*100) : 0;
        const espCoversPct = espAvg>0 ? (divNetM/espAvg*100) : 0;
        const fireRet = pat>0 ? (gastosAnnual/pat*100) : 0;
        const gapM = divNetM - gastosAvg;
        const savingsM = divNetM + sueldoM - gastosAvg;
        const savingsRate = (divNetM+sueldoM)>0 ? (savingsM/(divNetM+sueldoM)*100) : 0;
        const swr35 = gastosAnnual / 0.035;
        const yearsToFire = (()=>{ if(pat>=swr35) return 0; let p=pat; for(let y=1;y<=50;y++){p=p*1.07+savingsM*12;if(p*0.035>=gastosAnnual)return y;} return 99; })();
        
        // Div by year
        const divByYear={}; all.forEach(d=>{const y=d.date.slice(0,4);if(!divByYear[y])divByYear[y]={g:0,n:0};divByYear[y].g+=d.gross||0;divByYear[y].n+=d.net||0;});
        const divYK=Object.keys(divByYear).sort();
        
        const retCol = v => v>0?"var(--green)":v<0?"var(--red)":"var(--text-secondary)";
        const fK = v => Math.abs(v)>=1000?`${_sf(v/1000,1)}K`:_sf(Math.abs(v),0);
        
        return (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Toggle */}
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <div style={{display:"flex",borderRadius:8,border:"1px solid var(--border)",overflow:"hidden"}}>
              {["EUR","USD"].map(c=><button key={c} onClick={()=>setFireCcy(c)} style={{padding:"6px 16px",border:"none",background:fireCcy===c?"var(--gold-dim)":"transparent",color:fireCcy===c?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:fireCcy===c?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>{c==="EUR"?"€ EUR":"$ USD"}</button>)}
            </div>
          </div>
          
          {/* BANNER */}
          <div style={{padding:"24px",background:divCoversPct>=100?"rgba(48,209,88,.06)":"rgba(255,159,10,.06)",border:`1px solid ${divCoversPct>=100?"rgba(48,209,88,.2)":"rgba(255,159,10,.2)"}`,borderRadius:16,textAlign:"center"}}>
            <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:8}}>MIS DIVIDENDOS CUBREN</div>
            <div style={{fontSize:52,fontWeight:700,color:divCoversPct>=100?"var(--green)":"var(--orange)",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(divCoversPct,0)}%</div>
            <div style={{fontSize:12,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:6}}>de mis gastos totales (China + España)</div>
            <div style={{maxWidth:400,margin:"16px auto 0",height:8,background:"rgba(255,255,255,.06)",borderRadius:4,overflow:"hidden"}}><div style={{width:`${Math.min(divCoversPct,100)}%`,height:"100%",background:divCoversPct>=100?"var(--green)":"var(--orange)",borderRadius:4}}/></div>
            <div style={{fontSize:11,color:"var(--green)",fontFamily:"var(--fm)",marginTop:8,fontWeight:600}}>🇪🇸 Solo España: {_sf(espCoversPct,0)}%</div>
          </div>
          
          {/* DESGLOSE GASTOS POR DIVISA */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
            <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:16}}>💸 Desglose de Gastos Mensuales (media {nGM}m)</div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
              <div style={{flex:"1 1 150px",padding:"14px",background:"rgba(255,255,255,.02)",borderRadius:12,textAlign:"center",border:"1px solid rgba(255,255,255,.04)"}}>
                <div style={{fontSize:20,marginBottom:4}}>🇪🇸</div>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>ESPAÑA (EUR)</div>
                <div style={{fontSize:24,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>€{avgEur.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>€{(avgEur*12).toLocaleString(undefined,{maximumFractionDigits:0})}/año</div>
              </div>
              <div style={{flex:"1 1 150px",padding:"14px",background:"rgba(255,255,255,.02)",borderRadius:12,textAlign:"center",border:"1px solid rgba(255,255,255,.04)"}}>
                <div style={{fontSize:20,marginBottom:4}}>🇨🇳</div>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>CHINA (CNY)</div>
                <div style={{fontSize:24,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>¥{avgCny.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>≈ {sym}{(isUSD?avgCny*fxCnyUsd:avgCny*fxCnyEur).toLocaleString(undefined,{maximumFractionDigits:0})}/mes</div>
              </div>
              {avgUsd > 10 && <div style={{flex:"1 1 150px",padding:"14px",background:"rgba(255,255,255,.02)",borderRadius:12,textAlign:"center",border:"1px solid rgba(255,255,255,.04)"}}>
                <div style={{fontSize:20,marginBottom:4}}>🇺🇸</div>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>USD</div>
                <div style={{fontSize:24,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>${avgUsd.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
              </div>}
            </div>
            {/* Total bar */}
            <div style={{padding:"12px 16px",background:"rgba(255,255,255,.03)",borderRadius:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>TOTAL CONVERTIDO</span>
              <span style={{fontSize:20,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>{sym}{gastosAvg.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span>
              <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{sym}{gastosAnnual.toLocaleString(undefined,{maximumFractionDigits:0})}/año</span>
            </div>
          </div>
          
          {/* DIVIDENDOS vs GASTOS */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
            <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:16}}>💰 Dividendos vs Gastos ({fireCcy})</div>
            <div style={{display:"flex",gap:20,alignItems:"center",justifyContent:"center",flexWrap:"wrap"}}>
              <div style={{textAlign:"center",flex:"1 1 180px"}}>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>DIVIDENDOS NET / MES</div>
                <div style={{fontSize:28,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)"}}>{sym}{fK(divNetM)}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{sym}{fK(divNetA)}/año</div>
              </div>
              <div style={{fontSize:20,color:"var(--text-tertiary)"}}>vs</div>
              <div style={{textAlign:"center",flex:"1 1 180px"}}>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>GASTOS TOTALES / MES</div>
                <div style={{fontSize:28,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>{sym}{fK(gastosAvg)}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>🇪🇸 solo: {sym}{fK(espAvg)}</div>
              </div>
            </div>
            <div style={{textAlign:"center",marginTop:14,padding:"10px 0",borderTop:"1px solid var(--border)"}}>
              <span style={{fontSize:18,fontWeight:700,color:retCol(gapM),fontFamily:"var(--fm)"}}>{gapM>=0?"+":""}{sym}{fK(gapM)}/mes</span>
              <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginLeft:8}}>{gapM>=0?"superávit":"déficit"}</span>
            </div>
          </div>
          
          {/* METRICS */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {[
              {l:"PATRIMONIO",v:`${sym}${fDol(pat)}`,c:"var(--text-primary)"},
              {l:"RENT. NECESARIA",v:`${_sf(fireRet,1)}%`,sub:"sobre patrimonio",c:fireRet<4?"var(--green)":fireRet<7?"var(--gold)":"var(--red)"},
              {l:"AÑOS PARA FIRE",v:yearsToFire===0?"✓ YA":yearsToFire>=50?"50+":String(yearsToFire),sub:"@3.5% + 7% return",c:yearsToFire===0?"var(--green)":yearsToFire<5?"var(--gold)":"var(--orange)"},
              {l:"TASA DE AHORRO",v:`${_sf(savingsRate,0)}%`,sub:`${savingsM>=0?"+":""}${sym}${fK(savingsM)}/mes`,c:savingsRate>30?"var(--green)":savingsRate>15?"var(--gold)":"var(--red)"},
            ].map((k,i)=>(<div key={i} style={{flex:"1 1 130px",padding:"12px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}><div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600,marginBottom:4}}>{k.l}</div><div style={{fontSize:20,fontWeight:700,color:k.c,fontFamily:"var(--fm)"}}>{k.v}</div>{k.sub&&<div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{k.sub}</div>}</div>))}
          </div>
          
          {/* MONTHLY NATIVE BREAKDOWN TABLE */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10}}>📅 Gastos Mensuales por Divisa</div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}><thead><tr>
              {["MES","🇪🇸 EUR","🇨🇳 CNY","$ USD","TOTAL "+fireCcy,"DIV NET","CUBRE"].map((h,i)=><th key={i} style={{padding:"5px 8px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:8,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}
            </tr></thead><tbody>
              {last12g.map((m,i) => {
                const g = gNative[m]||{eur:0,cny:0,usd:0};
                const total = toDisp(g.eur, g.cny, g.usd);
                const divN = isUSD ? (divByMonth[m]?.n||0) : (divByMonth[m]?.n||0)/fxEurUsd;
                const pct = total > 0 ? (divN/total*100) : 0;
                const mn = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][parseInt(m.slice(5))-1];
                return (<tr key={m} style={{background:i%2?"rgba(255,255,255,.01)":"transparent"}}>
                  <td style={{padding:"5px 8px",fontWeight:600,fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{mn} {m.slice(2,4)}</td>
                  <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>€{(g.eur||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                  <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>¥{(g.cny||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                  <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:g.usd>0?"var(--text-primary)":"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{g.usd>0?`$${_sf(g.usd,0)}`:"-"}</td>
                  <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{sym}{total.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                  <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--green)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{sym}{divN.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                  <td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:pct>=100?"var(--green)":pct>=50?"var(--gold)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(pct,0)}%</td>
                </tr>);
              })}
            </tbody></table></div>
          </div>
          
          {/* FREEDOM NUMBERS */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>🎯 Freedom Numbers ({fireCcy})</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {[{l:"@3%",fn:gastosAnnual/0.03},{l:"@3.5%",fn:swr35},{l:"@4%",fn:gastosAnnual/0.04},{l:"ESPAÑA @3.5%",fn:espAnnual/0.035,sub:"solo EUR"},{l:"LEAN @3.5%",fn:gastosAnnual*0.7/0.035,sub:"70%"}].map((f,i)=>{const pct=f.fn>0?(pat/f.fn*100):0;const dP=f.fn>0?(divNetA/(f.fn*0.035)*100):0;return(<div key={i} style={{flex:"1 1 110px",padding:"12px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid rgba(255,255,255,.04)"}}><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,marginBottom:4}}>{f.l}{f.sub?` (${f.sub})`:""}</div><div style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{sym}{fK(f.fn)}</div><div style={{height:5,background:"rgba(255,255,255,.06)",borderRadius:3,marginTop:6,overflow:"hidden"}}><div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:pct>=100?"var(--green)":"var(--gold)",borderRadius:3}}/></div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{fontSize:9,fontWeight:600,color:pct>=100?"var(--green)":"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(pct,0)}%</span><span style={{fontSize:9,color:dP>=100?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>div {_sf(dP,0)}%</span></div></div>);})}
            </div>
          </div>
          
          {/* DIV TRAJECTORY */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>📈 Dividendos Netos por Año</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:8,height:130}}>
              {divYK.map((y,i)=>{const d=divByYear[y];const nV=isUSD?d.n:d.n/fxEurUsd;const mx=Math.max(...divYK.map(k=>isUSD?divByYear[k].n:divByYear[k].n/fxEurUsd),1);const h=nV/mx*100;const prev=i>0?(isUSD?divByYear[divYK[i-1]].n:divByYear[divYK[i-1]].n/fxEurUsd):0;const gr=prev>0?((nV-prev)/prev*100):null;return(<div key={y} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>{gr!=null&&<div style={{fontSize:7,fontWeight:600,color:retCol(gr),fontFamily:"var(--fm)",marginBottom:2}}>{gr>=0?"+":""}{_sf(gr,0)}%</div>}<div style={{fontSize:8,fontWeight:600,color:"var(--green)",fontFamily:"var(--fm)",marginBottom:2}}>{sym}{fK(nV)}</div><div style={{width:"100%",maxWidth:32,height:`${Math.max(h,4)}%`,background:"var(--green)",borderRadius:"3px 3px 0 0",opacity:.6}}/><div style={{fontSize:9,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:3}}>{y}</div></div>);})}
            </div>
          </div>
          
          {/* SCENARIOS */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10}}>🧪 Escenarios</div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:450}}><thead><tr>{["","GASTOS","FREEDOM","PAT","DIV","GAP"].map((h,i)=><th key={i} style={{padding:"5px 8px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:8,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead><tbody>
              {[{l:"🌏 Actual",g:gastosAnnual},{l:"🇪🇸 España",g:espAnnual},{l:"🔻 Lean (70%)",g:gastosAnnual*0.7},{l:"🔻🔻 Ultra (50%)",g:gastosAnnual*0.5},{l:"🔺 Fat (+30%)",g:gastosAnnual*1.3}].map((s,i)=>{const fn=s.g/0.035;const pp=fn>0?(pat/fn*100):0;const dp=s.g>0?(divNetA/s.g*100):0;const gap=divNetA-s.g;return(<tr key={i} style={{background:i%2?"rgba(255,255,255,.01)":"transparent"}}><td style={{padding:"5px 8px",fontWeight:600,fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{s.l}</td><td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{sym}{fK(s.g)}</td><td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{sym}{fK(fn)}</td><td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:pp>=100?"var(--green)":"var(--orange)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(pp,0)}%</td><td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:dp>=100?"var(--green)":"var(--orange)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(dp,0)}%</td><td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:gap>=0?"var(--green)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{gap>=0?"+":""}{sym}{fK(gap)}</td></tr>);})}
            </tbody></table></div>
          </div>
          
          {/* INSIGHTS */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:8}}>💡 Conclusiones</div>
            <div style={{display:"flex",flexDirection:"column",gap:4,fontSize:11,fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>
              <div>• Gastas <span style={{fontWeight:600}}>€{avgEur.toLocaleString(undefined,{maximumFractionDigits:0})}/mes en España</span> + <span style={{fontWeight:600}}>¥{avgCny.toLocaleString(undefined,{maximumFractionDigits:0})}/mes en China</span></div>
              <div>• Total convertido: <span style={{color:"var(--red)",fontWeight:700}}>{sym}{gastosAvg.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span></div>
              <div>• Dividendos netos: <span style={{color:"var(--green)",fontWeight:700}}>{sym}{fK(divNetM)}/mes</span> → cubren el <span style={{fontWeight:700,color:divCoversPct>=100?"var(--green)":"var(--orange)"}}>{_sf(divCoversPct,0)}%</span></div>
              <div>• 🇪🇸 Si te vas a España (sin China): cubres el <span style={{fontWeight:700,color:espCoversPct>=100?"var(--green)":"var(--gold)"}}>{_sf(espCoversPct,0)}%</span></div>
              {gapM<0&&<div>• Déficit: <span style={{color:"var(--red)"}}>-{sym}{fK(Math.abs(gapM))}/mes</span></div>}
              {gapM>=0&&<div>• 🎉 <span style={{color:"var(--green)",fontWeight:700}}>Superávit de {sym}{fK(gapM)}/mes</span></div>}
              <div style={{marginTop:4,fontSize:10,color:"var(--text-tertiary)",fontStyle:"italic"}}>FX: €1 = ${_sf(fxEurUsd,2)} · ¥1 = €{_sf(fxCnyEur,4)} · Gastos en divisa nativa, solo se convierten para el total.</div>
            </div>
          </div>
        </div>
        );
      })()}


      {/* ═══ GASTOS TAB — Registro de gastos (multi-currency → EUR) ═══ */}
      {homeTab==="gastos" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
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
              return true;
            });
            const expenses = filtered.filter(g=>g.amount<0);
            const totalEur = expenses.reduce((s,g) => s+gToEur(g), 0);
            const totalRecurEur = expenses.filter(g=>g.recur).reduce((s,g) => s+gToEur(g), 0);
            const months = new Set(expenses.map(g=>g.date?.slice(0,7)));
            const avgMonthly = months.size > 0 ? totalEur / months.size : 0;
            
            // By category (in EUR)
            const byCat = {};
            expenses.forEach(g => { byCat[g.cat] = (byCat[g.cat]||0) + gToEur(g); });
            const topCats = Object.entries(byCat).sort((a,b) => b[1]-a[1]).slice(0,10);
            const maxCat = Math.max(...topCats.map(([,v])=>v), 1);
            
            // By currency breakdown
            const byCcy = {};
            expenses.forEach(g => {
              const c = (g.currency||"EUR").toUpperCase().trim()||"EUR";
              if(!byCcy[c]) byCcy[c] = {raw:0, eur:0, count:0};
              byCcy[c].raw += Math.abs(g.amount||0);
              byCcy[c].eur += gToEur(g);
              byCcy[c].count++;
            });
            
            // By month (in EUR)
            const byMonth = {};
            expenses.forEach(g => {
              const m = g.date?.slice(0,7);
              if(!m) return;
              if(!byMonth[m]) byMonth[m] = {eur:0,cny:0,usd:0,eurNat:0};
              const eurAmt = gToEur(g);
              const ccy = (g.currency||"EUR").toUpperCase().trim()||"EUR";
              byMonth[m].eur += eurAmt;
              if(ccy==="CNY") byMonth[m].cny += eurAmt;
              else if(ccy==="USD") byMonth[m].usd += eurAmt;
              else byMonth[m].eurNat += eurAmt;
            });
            const monthKeys = Object.keys(byMonth).sort().reverse();
            
            return <>
              {/* KPI cards */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  <div><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>TOTAL (EUR)</div><div style={{fontSize:20,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>€{totalEur.toLocaleString(undefined,{maximumFractionDigits:0})}</div></div>
                  <div><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>RECURRENTE</div><div style={{fontSize:20,fontWeight:700,color:"var(--orange)",fontFamily:"var(--fm)"}}>€{totalRecurEur.toLocaleString(undefined,{maximumFractionDigits:0})}</div></div>
                  <div><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>MEDIA/MES</div><div style={{fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>€{avgMonthly.toLocaleString(undefined,{maximumFractionDigits:0})}</div></div>
                  <div><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>REGISTROS</div><div style={{fontSize:20,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{filtered.length}</div></div>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <select value={gastosFilter.year} onChange={e=>setGastosFilter(p=>({...p,year:e.target.value,month:"all"}))} style={{padding:"5px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
                    <option value="all">Todos años</option>
                    {[...new Set(gastosLog.map(g=>g.date?.slice(0,4)).filter(Boolean))].sort().reverse().map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                  {gastosFilter.year !== "all" && <select value={gastosFilter.month} onChange={e=>setGastosFilter(p=>({...p,month:e.target.value}))} style={{padding:"5px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
                    <option value="all">Todos meses</option>
                    {[...new Set(gastosLog.filter(g=>g.date?.startsWith(gastosFilter.year)).map(g=>g.date?.slice(0,7)).filter(Boolean))].sort().reverse().map(m=><option key={m} value={m}>{m}</option>)}
                  </select>}
                  <select value={gastosFilter.cat} onChange={e=>setGastosFilter(p=>({...p,cat:e.target.value}))} style={{padding:"5px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
                    <option value="all">Todas categorías</option>
                    {GASTO_CAT_LIST.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={()=>setGastosShowForm(!gastosShowForm)} style={{padding:"7px 14px",borderRadius:7,border:"1px solid var(--gold)",background:gastosShowForm?"var(--gold)":"var(--gold-dim)",color:gastosShowForm?"#000":"var(--gold)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
                    {gastosShowForm?"✕":"+ Gasto"}
                  </button>
                </div>
              </div>
              
              {/* Currency breakdown pills */}
              {Object.keys(byCcy).length > 1 && (
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {Object.entries(byCcy).sort((a,b)=>b[1].eur-a[1].eur).map(([ccy,d]) => (
                    <div key={ccy} style={{padding:"5px 12px",background:"rgba(255,255,255,.03)",borderRadius:8,border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{CURRENCIES[ccy]?.flag||""} {ccy}</span>
                      <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{ccySym(ccy)}{(d.raw||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                      <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>=</span>
                      <span style={{fontSize:10,fontWeight:600,color:"var(--red)",fontFamily:"var(--fm)"}}>€{(d.eur||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                      <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>({_sf(d.eur/totalEur*100,0)}%)</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Monthly breakdown mini-table */}
              {monthKeys.length > 1 && (
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {monthKeys.slice(0,12).map(m => {
                    const d = byMonth[m];
                    return (
                      <div key={m} style={{flex:"1 1 140px",padding:"6px 10px",background:"rgba(255,255,255,.02)",borderRadius:8,border:"1px solid rgba(255,255,255,.03)"}}>
                        <div style={{fontSize:10,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:3}}>{m}</div>
                        <div style={{fontSize:15,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>€{(d.eur||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                        <div style={{display:"flex",gap:2,marginTop:3}}>
                          {d.eurNat > 0 && <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"rgba(48,209,88,.08)",color:"var(--green)",fontFamily:"var(--fm)"}}>EUR €{(d.eurNat||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
                          {d.cny > 0 && <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"rgba(255,69,58,.08)",color:"var(--red)",fontFamily:"var(--fm)"}}>CNY €{(d.cny||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
                          {d.usd > 0 && <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"rgba(10,132,255,.08)",color:"#0a84ff",fontFamily:"var(--fm)"}}>USD €{(d.usd||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Category breakdown mini-bars (in EUR) */}
              {topCats.length > 0 && <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {topCats.map(([cat,val]) => (
                  <div key={cat} style={{flex:"1 1 200px",display:"flex",alignItems:"center",gap:6,padding:"4px 8px",background:"rgba(255,255,255,.02)",borderRadius:6}}>
                    <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",width:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat.split(",")[0].split("(")[0].trim()}</span>
                    <div style={{flex:1,height:6,background:"rgba(255,255,255,.04)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:`${val/maxCat*100}%`,height:"100%",background:"var(--red)",borderRadius:3,opacity:.6}}/>
                    </div>
                    <span style={{fontSize:9,color:"var(--red)",fontFamily:"var(--fm)",width:55,textAlign:"right"}}>€{val.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                  </div>
                ))}
              </div>}
            </>;
          })()}

          {/* Add form */}
          {gastosShowForm && (
            <div style={{padding:14,background:"var(--card)",border:"1px solid var(--gold-dim)",borderRadius:12}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"flex-end"}}>
                <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>FECHA</label>
                  <input type="date" value={gastosForm.date} onChange={e=>setGastosForm(p=>({...p,date:e.target.value}))} style={{padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
                <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>CATEGORÍA</label>
                  <select value={gastosForm.cat} onChange={e=>setGastosForm(p=>({...p,cat:e.target.value}))} style={{padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
                    {GASTO_CAT_LIST.map(c=><option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>IMPORTE</label>
                  <input type="number" step="0.01" value={gastosForm.amount||""} onChange={e=>setGastosForm(p=>({...p,amount:parseFloat(e.target.value)||0}))} placeholder="25.50" style={{width:80,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
                <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>DIVISA</label>
                  <select value={gastosForm.currency} onChange={e=>setGastosForm(p=>({...p,currency:e.target.value}))} style={{padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
                    <option value="EUR">EUR €</option><option value="USD">USD $</option><option value="CNY">CNY ¥</option>
                  </select></div>
                <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>DETALLE</label>
                  <input type="text" value={gastosForm.detail} onChange={e=>setGastosForm(p=>({...p,detail:e.target.value}))} placeholder="Restaurante..." style={{width:140,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
                <label style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",cursor:"pointer"}}>
                  <input type="checkbox" checked={gastosForm.recur} onChange={e=>setGastosForm(p=>({...p,recur:e.target.checked}))}/>Recurrente
                </label>
                <button onClick={()=>{if(gastosForm.date&&gastosForm.amount){addGasto(gastosForm);setGastosForm(p=>({...p,amount:0,detail:""}));}}} style={{padding:"6px 16px",borderRadius:6,border:"none",background:"var(--gold)",color:"#000",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)",height:30}}>Guardar</button>
              </div>
            </div>
          )}

          {/* Gastos table (multi-currency aware) */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
            {gastosLoading ? (
              <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)"}}>Cargando gastos...</div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:700}}>
                  <thead><tr>
                    {["FECHA","CATEGORÍA","ORIGINAL","","≈ EUR","REC","DETALLE",""].map((h,i)=>
                      <th key={i} style={{padding:"7px 10px",textAlign:[2,4].includes(i)?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"1px solid var(--border)"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(() => {
                      // Conversion helper inside render
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
                      const _ccySym = (ccy) => ({EUR:"€",USD:"$",CNY:"¥"}[(ccy||"EUR").toUpperCase()] || "€");
                      return gastosLog.filter(g => {
                        if (gastosFilter.year !== "all" && !g.date?.startsWith(gastosFilter.year)) return false;
                        if (gastosFilter.month !== "all" && !g.date?.startsWith(gastosFilter.month)) return false;
                        if (gastosFilter.cat !== "all" && g.cat !== gastosFilter.cat) return false;
                        return true;
                      }).slice(0,300).map((g,i) => {
                        const ccy = (g.currency||"EUR").toUpperCase().trim()||"EUR";
                        const isNonEur = ccy !== "EUR";
                        const eurVal = _gToEur(g);
                        return (
                          <tr key={g.id||i} style={{background:i%2?"rgba(255,255,255,.01)":"transparent"}}
                            onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"rgba(255,255,255,.01)":"transparent"}>
                            <td style={{padding:"5px 10px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{g.date}</td>
                            <td style={{padding:"5px 10px",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.cat}</td>
                            <td style={{padding:"5px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:g.amount<0?"var(--red)":"var(--green)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_ccySym(ccy)}{Math.abs(g.amount||0).toLocaleString(undefined,{minimumFractionDigits:ccy==="CNY"?0:2,maximumFractionDigits:2})}</td>
                            <td style={{padding:"3px 4px",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{isNonEur && <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:ccy==="CNY"?"rgba(255,69,58,.08)":"rgba(10,132,255,.08)",color:ccy==="CNY"?"var(--red)":"#0a84ff"}}>{ccy}</span>}</td>
                            <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:isNonEur?"var(--text-secondary)":"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)",fontSize:isNonEur?11:10.5}}>{isNonEur ? `€${eurVal.toLocaleString(undefined,{maximumFractionDigits:0})}` : `€${_sf(Math.abs(g.amount||0),2)}`}</td>
                            <td style={{padding:"5px 10px",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{g.recur?<span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"rgba(255,159,10,.1)",color:"var(--orange)"}}>REC</span>:""}</td>
                            <td style={{padding:"5px 10px",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)",fontSize:10,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.detail||""}</td>
                            <td style={{padding:"3px 4px",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                              <button onClick={()=>deleteGasto(g.id)} style={{width:18,height:18,borderRadius:4,border:"1px solid rgba(255,69,58,.12)",background:"transparent",color:"var(--red)",fontSize:7,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:.3}}>✕</button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
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
      )}

      {/* ═══ CONTROL MENSUAL TAB ═══ */}
      {homeTab==="control" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            {(() => {
              const withData = ctrlLog.filter(c => c.pu > 0);
              const latest = withData[0] || {};
              const prev = withData[1] || {};
              const chg = prev.pu ? ((latest.pu - prev.pu) / prev.pu * 100) : 0;
              return <div style={{display:"flex",gap:16}}>
                <div><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>PAT. USD</div><div style={{fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>${fDol(latest.pu||0)}</div></div>
                <div><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>PAT. EUR</div><div style={{fontSize:20,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>€{fDol(latest.pe||0)}</div></div>
                <div><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Δ MES</div><div style={{fontSize:20,fontWeight:700,color:chg>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{chg>=0?"+":""}{_sf(chg,1)}%</div></div>
                <div><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>SNAPSHOTS</div><div style={{fontSize:20,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{withData.length}</div></div>
              </div>;
            })()}
            <button onClick={()=>setCtrlShowForm(!ctrlShowForm)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid var(--gold)",background:ctrlShowForm?"var(--gold)":"var(--gold-dim)",color:ctrlShowForm?"#000":"var(--gold)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
              {ctrlShowForm?"✕ Cerrar":"+ Nuevo Snapshot"}
            </button>
          </div>

          {/* Add form */}
          {ctrlShowForm && (
            <div style={{padding:16,background:"var(--card)",border:"1px solid var(--gold-dim)",borderRadius:14}}>
              <div style={{fontSize:11,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:10}}>📋 Nuevo Snapshot Mensual</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
                {[
                  {k:"date",l:"FECHA",t:"date"},
                  {k:"fx",l:"EUR/USD",t:"number",s:"0.0001",p:"1.10"},
                  {k:"bankinter",l:"BANKINTER €",t:"number",p:"0"},
                  {k:"bcCaminos",l:"BC CAMINOS €",t:"number",p:"0"},
                  {k:"constructionBank",l:"CONSTR. BANK €",t:"number",p:"0"},
                  {k:"revolut",l:"REVOLUT €",t:"number",p:"0"},
                  {k:"otrosBancos",l:"OTROS BANCOS €",t:"number",p:"0"},
                  {k:"ibUsd",l:"IB $",t:"number",p:"0"},
                  {k:"tsUsd",l:"TRADESTATION $",t:"number",p:"0"},
                  {k:"tastyUsd",l:"TASTY $",t:"number",p:"0"},
                  {k:"fondos",l:"FONDOS €",t:"number",p:"0"},
                  {k:"cryptoEur",l:"CRYPTO €",t:"number",p:"0"},
                  {k:"sueldo",l:"SUELDO €",t:"number",p:"0"},
                  {k:"hipoteca",l:"HIPOTECA €",t:"number",p:"0"},
                ].map(f => (
                  <div key={f.k}>
                    <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>{f.l}</label>
                    <input type={f.t} step={f.s} value={ctrlForm[f.k]||""} onChange={e=>setCtrlForm(p=>({...p,[f.k]:f.t==="date"?e.target.value:parseFloat(e.target.value)||0}))} placeholder={f.p}
                      style={{width:"100%",padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",boxSizing:"border-box"}}/>
                  </div>
                ))}
              </div>
              {/* Live preview */}
              {(() => {
                const bk = (ctrlForm.bankinter||0)+(ctrlForm.bcCaminos||0)+(ctrlForm.constructionBank||0)+(ctrlForm.revolut||0)+(ctrlForm.otrosBancos||0);
                const br = (ctrlForm.ibUsd||0)+(ctrlForm.tsUsd||0)+(ctrlForm.tastyUsd||0);
                const cr = (ctrlForm.cryptoEur||0) * (ctrlForm.fx||1);
                const total = bk*(ctrlForm.fx||1) + br + cr + (ctrlForm.fondos||0)*(ctrlForm.fx||1);
                return total > 0 ? <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"rgba(48,209,88,.06)",border:"1px solid rgba(48,209,88,.15)",display:"flex",gap:16,fontSize:12,fontFamily:"var(--fm)"}}>
                  <span>Bancos: <b style={{color:"#64d2ff"}}>€{bk.toLocaleString()}</b></span>
                  <span>Brokers: <b style={{color:"var(--gold)"}}>${br.toLocaleString()}</b></span>
                  <span style={{fontWeight:700,color:"var(--green)"}}>Total: ${Math.round(total).toLocaleString()}</span>
                </div> : null;
              })()}
              <button onClick={()=>{if(ctrlForm.date){addCtrlEntry(ctrlForm);setCtrlForm(p=>({...p,date:"",bankinter:0,bcCaminos:0,constructionBank:0,revolut:0,otrosBancos:0,ibUsd:0,tsUsd:0,tastyUsd:0,fondos:0,cryptoEur:0,sueldo:0,hipoteca:0}));}}}
                style={{marginTop:10,padding:"8px 20px",borderRadius:8,border:"none",background:"var(--gold)",color:"#000",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>Guardar Snapshot</button>
            </div>
          )}

          {/* Control table */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:900}}>
                <thead>
                  <tr>
                    <th colSpan={2} style={{padding:"4px 8px",textAlign:"center",color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)",borderBottom:"2px solid var(--border)"}}/>
                    <th colSpan={2} style={{padding:"4px 8px",textAlign:"center",color:"var(--gold)",fontSize:8,fontFamily:"var(--fm)",fontWeight:700,letterSpacing:1,borderBottom:"2px solid var(--gold-dim)",background:"rgba(200,164,78,.03)"}}>PATRIMONIO</th>
                    <th colSpan={2} style={{padding:"4px 8px",textAlign:"center",color:"#64d2ff",fontSize:8,fontFamily:"var(--fm)",fontWeight:700,letterSpacing:1,borderBottom:"2px solid rgba(100,210,255,.15)",background:"rgba(100,210,255,.02)"}}>DESGLOSE</th>
                    <th colSpan={2} style={{padding:"4px 8px",textAlign:"center",color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)",borderBottom:"2px solid var(--border)"}}/>
                  </tr>
                  <tr>
                    {["FECHA","€/$","PAT USD","PAT EUR","BROKERS $","BANCOS €","CRYPTO €","Δ"].map((h,i)=>
                      <th key={i} style={{padding:"6px 10px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ctrlLog.filter(c=>c.pu>0).map((c,i,arr) => {
                    const prev = arr[i+1];
                    const chg = prev?.pu ? ((c.pu-prev.pu)/prev.pu*100) : 0;
                    return <tr key={c.id||i} style={{background:i%2?"rgba(255,255,255,.01)":"transparent"}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"rgba(255,255,255,.01)":"transparent"}>
                      <td style={{padding:"6px 10px",fontFamily:"var(--fm)",color:"var(--text-primary)",fontWeight:600,borderBottom:"1px solid rgba(255,255,255,.03)"}}>{c.d}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{c.fx?.toFixed(3)}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${(c.pu||0).toLocaleString()}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>€{(c.pe||0).toLocaleString()}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${(c.br||0).toLocaleString()}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"#64d2ff",borderBottom:"1px solid rgba(255,255,255,.03)"}}>€{(c.bk||0).toLocaleString()}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"#bf5af2",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{c.cr?`€${(c.cr||0).toLocaleString()}`:"—"}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:chg>=0?"var(--green)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{chg?`${chg>=0?"+":""}${_sf(chg,1)}%`:""}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ WATCHLIST TAB ═══ */}
      {homeTab==="watchlist" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
            <input type="text" placeholder="Ticker (ej: KO)" value={searchTicker} onChange={e=>setSearchTicker(e.target.value.toUpperCase())}
              onKeyDown={e=>{if(e.key==="Enter"&&searchTicker){updatePosition(searchTicker,{list:"watchlist",targetPrice:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}}
              style={{padding:"8px 12px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:10,color:"var(--text-primary)",fontSize:12,outline:"none",fontFamily:"var(--fm)",width:140}}
              onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
            <button onClick={()=>{if(searchTicker){updatePosition(searchTicker,{list:"watchlist",targetPrice:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}}
              style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(255,214,10,.3)",background:"rgba(255,214,10,.06)",color:"var(--yellow)",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>+ Añadir a Watchlist</button>
          </div>
          {watchlistList.length===0 && <div style={{textAlign:"center",padding:60,color:"var(--text-tertiary)"}}><div style={{fontSize:48,marginBottom:16}}>👁</div>Watchlist vacía. Añade empresas que te interesen.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {watchlistList.map(p=><CompanyRow key={p.ticker} p={p} showPos={false} onOpen={openAnalysis}/>)}
          </div>
        </div>
      )}

      {/* ═══ HISTORIAL TAB — Old Trades / Cajón de recuerdos ═══ */}
      {homeTab==="historial" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{padding:"16px 20px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:16}}>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:6}}>📦 Cajón de Recuerdos</div>
            <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.6}}>{historialList.length} posiciones antiguas o no activas. Las shares pueden no estar actualizadas — lo fiable son los dividendos, opciones y transacciones registradas. Haz clic en 📋 para ver el detalle.</div>
          </div>
          {historialList.length===0 ? (
            <div style={{textAlign:"center",padding:60,color:"var(--text-tertiary)"}}><div style={{fontSize:48,marginBottom:16}}>📦</div>Sin posiciones históricas.</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {historialList.map(h => (
                <div key={h.ticker} style={{display:"grid",gridTemplateColumns:"48px 1fr 80px 80px 80px 65px 44px",gap:6,alignItems:"center",padding:"10px 16px",background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)",borderRadius:14,opacity:.7,transition:"all .2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--border-hover)";e.currentTarget.style.opacity="1";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.04)";e.currentTarget.style.opacity=".7";}}>
                  <div style={{width:38,height:38,borderRadius:9,background:"linear-gradient(135deg,#555,#333)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:h.ticker.length>3?7:10,fontWeight:800,color:"#999",fontFamily:"var(--fm)"}}>{h.ticker.slice(0,4)}</div>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:"var(--text-secondary)"}}>{h.ticker}</div>
                    <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{h.txnCount} txns · {h.currency}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>DIVS COBRADOS</div>
                    <div style={{fontSize:14,fontWeight:700,color:h.totalDivs>0?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{h.totalDivs>0?"$"+_sf(h.totalDivs,0):"—"}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>PRIMAS OPT.</div>
                    <div style={{fontSize:14,fontWeight:700,color:h.totalOptCredit>0?"#64d2ff":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{h.totalOptCredit>0?"$"+_sf(h.totalOptCredit,0):"—"}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>INCOME TOTAL</div>
                    <div style={{fontSize:14,fontWeight:700,color:(h.totalDivs+h.totalOptCredit)>0?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{(h.totalDivs+h.totalOptCredit)>0?"$"+_sf(h.totalDivs+h.totalOptCredit,0):"—"}</div>
                  </div>
                  <div style={{display:"flex",justifyContent:"flex-end"}}>
                    <button onClick={()=>openCostBasis(h.ticker)} title="Ver Cost Basis" style={{width:32,height:32,borderRadius:8,border:"1px solid rgba(200,164,78,.25)",background:"rgba(200,164,78,.06)",color:"var(--gold)",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>📋</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ RESEARCH TAB ═══ */}
      {homeTab==="research" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="text" placeholder="Escribe un ticker y pulsa Enter o Buscar" value={searchTicker} onChange={e=>setSearchTicker(e.target.value.toUpperCase())}
              onKeyDown={e=>{if(e.key==="Enter"&&searchTicker){setCfg(prev=>({...prev,ticker:searchTicker,name:searchTicker}));setViewMode("analysis");setTab("dash");}}}
              style={{flex:1,maxWidth:300,padding:"10px 14px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:12,color:"var(--text-primary)",fontSize:13,outline:"none",fontFamily:"var(--fm)"}}
              onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
            <button onClick={()=>{if(searchTicker){setCfg(prev=>({...prev,ticker:searchTicker,name:searchTicker}));setViewMode("analysis");setTab("dash");}}}
              style={{padding:"10px 20px",borderRadius:12,border:"1px solid var(--green)",background:"rgba(48,209,88,.08)",color:"var(--green)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>🔍 Analizar</button>
            <button onClick={()=>{if(searchTicker){loadFromAPI(searchTicker);setViewMode("analysis");setTab("dash");}}} disabled={fmpLoading}
              style={{padding:"10px 20px",borderRadius:12,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:12,fontWeight:700,cursor:fmpLoading?"wait":"pointer",fontFamily:"var(--fm)",animation:fmpLoading?"pulse 1s infinite":"none"}}>
              {fmpLoading?"⏳ Cargando...":"⚡ Cargar datos"}
            </button>
          </div>
          {fmpError && <div style={{padding:10,borderRadius:8,background:"rgba(255,69,58,.06)",border:"1px solid rgba(255,69,58,.2)",color:"var(--red)",fontSize:11}}>⚠ {fmpError}</div>}
          <div style={{textAlign:"center",padding:40,color:"var(--text-tertiary)"}}>
            <div style={{fontSize:48,marginBottom:16}}>🔍</div>
            <div style={{fontSize:14,lineHeight:1.8}}>Escribe cualquier ticker para investigar.<br/>
              <strong style={{color:"var(--text-secondary)"}}>Analizar</strong> → abre con datos guardados (o vacío para editar a mano).<br/>
              <strong style={{color:"var(--gold)"}}>Cargar datos</strong> → Claude busca los financieros en la web.</div>
          </div>
          {/* Quick access to saved companies */}
          {portfolio.length>0 && (
            <div>
              <div style={{fontSize:11,color:"var(--text-tertiary)",fontWeight:600,marginBottom:8,fontFamily:"var(--fm)"}}>EMPRESAS GUARDADAS</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {portfolio.map(t=>(
                  <button key={t} onClick={()=>openAnalysis(t)} style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-secondary)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--gold)";e.currentTarget.style.color="var(--gold)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text-secondary)";}}>{t}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div style={{marginTop:20,padding:16,borderRadius:14,background:"var(--card)",border:"1px solid var(--border)"}}>
          <div style={{fontSize:12,color:"var(--gold)",fontWeight:600,fontFamily:"var(--fm)",marginBottom:10}}>⚙ AJUSTES</div>
          <div style={{fontSize:11,color:"var(--text-secondary)",marginBottom:8}}>Datos cargados via Claude + Web Search. Empresas guardadas: {portfolio.length}.</div>
          
          {/* FX Rates Panel */}
          <div style={{marginBottom:14,padding:12,borderRadius:10,background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:10,color:"var(--gold)",fontWeight:700,fontFamily:"var(--fm)"}}>💱 TIPOS DE CAMBIO (base USD)</span>
              <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{fxLastUpdate ? `Act: ${new Date(fxLastUpdate).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}` : "Sin datos"}</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {Object.entries(fxRates).filter(([k])=>k!=="USD"&&k!=="GBX").map(([ccy,rate])=>(
                <div key={ccy} style={{padding:"4px 8px",borderRadius:6,background:"rgba(255,255,255,.03)",fontSize:10,fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>
                  <span style={{fontSize:9,marginRight:3}}>{CURRENCIES[ccy]?.flag||""}</span>
                  <span style={{color:"var(--text-primary)",fontWeight:600}}>{ccy}</span>
                  <span style={{color:"var(--text-tertiary)",margin:"0 3px"}}>=</span>
                  <span>{typeof rate === 'number' ? rate.toFixed(rate>100?0:rate>10?2:4) : rate}</span>
                </div>
              ))}
            </div>
            {fxError && <div style={{fontSize:10,color:"var(--red)",marginTop:6}}>{fxError}</div>}
          </div>
          
          {/* Display Currency */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,fontFamily:"var(--fm)",marginBottom:6}}>MONEDA DE VISUALIZACIÓN</div>
            <div style={{display:"flex",gap:4}}>
              {DISPLAY_CCYS.map(ccy=>(
                <button key={ccy} onClick={()=>switchDisplayCcy(ccy)}
                  style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${displayCcy===ccy?"var(--gold)":"var(--border)"}`,background:displayCcy===ccy?"var(--gold-dim)":"transparent",color:displayCcy===ccy?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:displayCcy===ccy?700:500,cursor:"pointer",fontFamily:"var(--fm)",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <span style={{fontSize:14}}>{CURRENCIES[ccy]?.flag}</span>
                  <span>{CURRENCIES[ccy]?.symbol} {ccy}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Import Cost Basis Data */}
          <div style={{marginBottom:14,padding:12,borderRadius:10,background:"rgba(48,209,88,.03)",border:"1px solid rgba(48,209,88,.1)"}}>
            <div style={{fontSize:10,color:"var(--green)",fontWeight:700,fontFamily:"var(--fm)",marginBottom:6}}>📋 IMPORTAR TRANSACCIONES</div>
            <div style={{fontSize:11,color:"var(--text-secondary)",marginBottom:8}}>Carga el archivo costbasis_app.json con todas las transacciones. Se guardan en storage compartido.</div>
            <label style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,border:"1px solid rgba(48,209,88,.3)",background:"rgba(48,209,88,.08)",color:"var(--green)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
              📥 Importar costbasis_app.json
              <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{
                const file = e.target.files[0]; if(!file) return;
                const reader = new FileReader();
                reader.onload = ev => { importTransactions(ev.target.result); };
                reader.readAsText(file);
              }}/>
            </label>
          </div>

          {portfolio.length > 0 && (
            <select onChange={e=>{if(e.target.value){deleteCompany(e.target.value);removePosition(e.target.value);e.target.value="";}}} 
              style={{padding:"6px 10px",background:"rgba(255,69,58,.06)",border:"1px solid rgba(255,69,58,.2)",borderRadius:8,color:"var(--red)",fontSize:11,cursor:"pointer",fontFamily:"var(--fm)"}}>
              <option value="">🗑 Borrar empresa del storage...</option>
              {portfolio.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );

  return !dataLoaded ? (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#000",color:"#f5f5f7",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:48,height:48,borderRadius:12,background:"linear-gradient(135deg,#d69e2e,#b8860b)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#000",marginBottom:20}}>A&R</div>
      <div style={{fontSize:14,color:"#86868b",marginBottom:8}}>Cargando datos financieros...</div>
      <div style={{width:200,height:3,background:"#1a1a1a",borderRadius:3,overflow:"hidden"}}>
        <div style={{width:"60%",height:"100%",background:"linear-gradient(90deg,#d69e2e,#b8860b)",borderRadius:3,animation:"pulse 1s infinite"}}/>
      </div>
    </div>
  ) : (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",background:"var(--bg)",color:"var(--text-primary)",fontFamily:"var(--fb)"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        :root {
          --bg: #000000;
          --surface: #111111;
          --card: #161616;
          --card-hover: #1a1a1a;
          --border: rgba(255,255,255,.06);
          --border-hover: rgba(255,255,255,.1);
          --gold: #c8a44e;
          --gold-dim: rgba(200,164,78,.15);
          --gold-glow: rgba(200,164,78,.08);
          --text-primary: #f5f5f7;
          --text-secondary: #86868b;
          --text-tertiary: #48484a;
          --green: #30d158;
          --red: #ff453a;
          --yellow: #ffd60a;
          --orange: #ff9f0a;
          --fb: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          --fd: 'Playfair Display', Georgia, serif;
          --fm: 'IBM Plex Mono', monospace;
        }
        * { box-sizing:border-box; margin:0; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:4px; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; }
        input[type=number] { -moz-appearance:textfield; }
        ::placeholder { color:rgba(255,255,255,.15); }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
        .ar-tabs-scroll { scrollbar-width:none; -ms-overflow-style:none; }
        .ar-tabs-scroll::-webkit-scrollbar { display:none; }
        .ar-tab-btn { position:relative; white-space:nowrap; }
        .ar-tab-btn::after { content:''; position:absolute; bottom:-1px; left:20%; right:20%; height:2px; background:var(--gold); border-radius:2px; transform:scaleX(0); transition:transform .25s ease; }
        .ar-tab-btn[data-active="true"]::after { transform:scaleX(1); }
      `}</style>

      {viewMode==="home" ? (
        <main style={{flex:1,padding:"32px 36px",overflowY:"auto"}}>{renderHome()}</main>
      ) : viewMode==="costbasis" ? (
        <main style={{flex:1,padding:"32px 36px",overflowY:"auto"}}>{renderCostBasis()}</main>
      ) : (
        <>
          {/* ═══ ANALYSIS HEADER ═══ */}
          <header style={{position:"sticky",top:0,zIndex:20,background:"rgba(0,0,0,.85)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderBottom:"1px solid var(--border)"}}>
            {/* Row 1: Back + Config */}
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 24px 4px",flexWrap:"wrap"}}>
              <button onClick={goHome} style={{padding:"5px 12px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:11,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:600,flexShrink:0}}>← Inicio</button>
              <div style={{width:26,height:26,borderRadius:6,background:"linear-gradient(135deg,#d69e2e,#b8860b)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#000",fontFamily:"var(--fm)",flexShrink:0}}>A&R</div>
              <Inp label="Ticker" value={cfg.ticker} onChange={v=>upCfg("ticker",v)} type="text" w={68} placeholder="AAPL"/>
              <Inp label="Empresa" value={cfg.name} onChange={v=>upCfg("name",v)} type="text" w={140} placeholder="Apple Inc."/>
              <Inp label="Precio" value={cfg.price} onChange={v=>upCfg("price",v)} step={0.01} w={68} suffix="$"/>
              <Inp label="Beta" value={cfg.beta} onChange={v=>upCfg("beta",v)} step={0.05} w={48}/>
              <Inp label="Rf%" value={cfg.riskFree} onChange={v=>upCfg("riskFree",v)} step={0.1} w={44} suffix="%"/>
              <Inp label="Prima" value={cfg.marketPremium} onChange={v=>upCfg("marketPremium",v)} step={0.1} w={44} suffix="%"/>
              <Inp label="Tax%" value={cfg.taxRate} onChange={v=>upCfg("taxRate",v)} step={1} w={40} suffix="%"/>
              <button onClick={()=>upCfg("useWACC",!cfg.useWACC)} style={{padding:"4px 10px",borderRadius:100,border:`1px solid ${cfg.useWACC?"var(--gold)":"var(--border)"}`,background:cfg.useWACC?"var(--gold-dim)":"transparent",color:cfg.useWACC?"var(--gold)":"var(--text-tertiary)",fontSize:9,cursor:"pointer",fontFamily:"var(--fb)",fontWeight:600,alignSelf:"flex-end"}}>
                {cfg.useWACC?"WACC":"Manual"}
              </button>
              {!cfg.useWACC && <>
                <Inp label="Desc." value={cfg.manualDiscount} onChange={v=>upCfg("manualDiscount",v)} w={44} suffix="%"/>
                <Inp label="Crec." value={cfg.manualGrowth} onChange={v=>upCfg("manualGrowth",v)} w={44} suffix="%"/>
              </>}
              <button onClick={()=>loadFromAPI()} disabled={fmpLoading || !cfg.ticker}
                style={{padding:"4px 12px",borderRadius:100,border:"1px solid rgba(48,209,88,.3)",background:fmpLoading?"rgba(48,209,88,.15)":"rgba(48,209,88,.08)",color:fmpLoading?"var(--text-tertiary)":"var(--green)",fontSize:10,fontWeight:700,cursor:fmpLoading?"wait":"pointer",fontFamily:"var(--fm)",alignSelf:"flex-end",flexShrink:0,animation:fmpLoading?"pulse 1s infinite":"none"}}>
                {fmpLoading?"⏳":"⚡ Cargar"}
              </button>
              <button onClick={saveCurrentCompany} style={{padding:"4px 8px",borderRadius:100,border:"1px solid rgba(100,210,255,.25)",background:"rgba(100,210,255,.06)",color:"#64d2ff",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)",alignSelf:"flex-end",flexShrink:0}}>💾</button>
              {fmpError && <span style={{fontSize:9,color:"var(--red)",alignSelf:"flex-end",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={fmpError}>⚠ {fmpError}</span>}
              {lastSaved && !fmpError && <span style={{fontSize:8,color:"var(--text-tertiary)",alignSelf:"flex-end",fontFamily:"var(--fm)"}}>⟳ {new Date(lastSaved).toLocaleDateString('es-ES')}</span>}
              {/* Mini currency toggle */}
              <div style={{display:"flex",gap:0,border:"1px solid var(--border)",borderRadius:6,overflow:"hidden",alignSelf:"flex-end",marginLeft:"auto"}}>
                {DISPLAY_CCYS.slice(0,3).map(ccy=>(
                  <button key={ccy} onClick={()=>switchDisplayCcy(ccy)}
                    style={{padding:"3px 7px",border:"none",background:displayCcy===ccy?"var(--gold-dim)":"transparent",color:displayCcy===ccy?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:displayCcy===ccy?700:400,cursor:"pointer",fontFamily:"var(--fm)",borderRight:"1px solid var(--border)"}}>
                    {CURRENCIES[ccy]?.symbol}
                  </button>
                ))}
              </div>
            </div>
            {/* Row 2: Analysis Tabs */}
            <div ref={tabsRef} className="ar-tabs-scroll" style={{display:"flex",gap:2,padding:"0 24px",overflowX:"auto",overflowY:"hidden",borderTop:"1px solid rgba(255,255,255,.03)"}}>
              {TABS.map(t=>(
                <button key={t.id} className="ar-tab-btn" data-active={tab===t.id?"true":"false"} onClick={()=>setTab(t.id)}
                  style={{display:"flex",alignItems:"center",gap:4,padding:"7px 12px",border:"none",background:"transparent",cursor:"pointer",color:tab===t.id?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:tab===t.id?700:500,fontFamily:"var(--fb)",transition:"color .2s",flexShrink:0}}
                  onMouseEnter={e=>{if(tab!==t.id) e.currentTarget.style.color="var(--text-secondary)";}}
                  onMouseLeave={e=>{if(tab!==t.id) e.currentTarget.style.color="var(--text-tertiary)";}}>
                  <span style={{fontSize:10,opacity:tab===t.id?1:.5}}>{t.ico}</span>{t.lbl}
                </button>
              ))}
            </div>
          </header>
          <main style={{flex:1,padding:"24px 28px",overflowY:"auto"}}>
            <div style={{maxWidth:1280,margin:"0 auto",animation:anim?"fadeUp .4s cubic-bezier(.16,1,.3,1)":"none"}} key={tab}>{content[tab]?.()}</div>
          </main>
        </>
      )}

      <footer style={{padding:"6px 28px",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fb)",fontWeight:500}}>A&R v10.2</span>
        <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fb)"}}>No constituye asesoramiento financiero</span>
      </footer>
    </div>
  );
}
