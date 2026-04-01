import { lazy, Suspense, useState } from 'react';
import { useHome } from '../../context/HomeContext';
import { CURRENCIES, DISPLAY_CCYS, APP_VERSION, API_URL } from '../../constants/index.js';
import { PortfolioTab } from '../home';
import { ErrorBoundary } from '../ui';

// ─── Lazy-loaded home tabs ───
const ScreenerTab = lazy(() => import('../home/ScreenerTab'));
const TradesTab = lazy(() => import('../home/TradesTab'));
const PatrimonioTab = lazy(() => import('../home/PatrimonioTab'));
const DashboardTab = lazy(() => import('../home/DashboardTab'));
const DividendosTab = lazy(() => import('../home/DividendosTab'));
const FireTab = lazy(() => import('../home/FireTab'));
const GastosTab = lazy(() => import('../home/GastosTab'));
const ControlTab = lazy(() => import('../home/ControlTab'));
const WatchlistTab = lazy(() => import('../home/WatchlistTab'));
const HistorialTab = lazy(() => import('../home/HistorialTab'));
const AdvisorTab = lazy(() => import('../home/AdvisorTab'));
const ResearchTab = lazy(() => import('../home/ResearchTab'));
const CoveredCallsTab = lazy(() => import('../home/CoveredCallsTab'));
const IncomeLabTab = lazy(() => import('../home/IncomeLabTab'));
const PresupuestoTab = lazy(() => import('../home/PresupuestoTab'));
const SettingsPanel = lazy(() => import('../home/SettingsPanel'));

const Loading = () => <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'50vh',color:'var(--text-secondary)'}}>Cargando...</div>;

function AirplaneMode({ portfolioList }) {
  const [dlOpen, setDlOpen] = useState(false);
  const [dlPhase, setDlPhase] = useState("");
  const [dlCurrent, setDlCurrent] = useState(0);
  const [dlTotal, setDlTotal] = useState(0);
  const [dlDone, setDlDone] = useState(false);
  const [dlDownloading, setDlDownloading] = useState(false);

  const download = async () => {
    setDlOpen(true); setDlDone(false); setDlDownloading(true);

    // Force SW update and activation before downloading
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // Wait a moment for new SW to activate
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch {}

    const API = API_URL;
    const allTickers = portfolioList.map(p => p.ticker);
    const usTickers = allTickers.filter(t => !t.includes(":"));
    const cache = await caches.open("ayr-offline-data");
    let errors = 0;

    // ── Phase 0: Pre-cache all JS/CSS chunks for offline tab loading ──
    setDlPhase("Assets de la app");
    try {
      const staticCache = await caches.open("ayr-v3.3");
      // Get all JS/CSS asset URLs from the current page
      const assetUrls = new Set();
      // Scripts and modulepreload links already in the page
      document.querySelectorAll('script[src], link[rel="modulepreload"], link[rel="stylesheet"]').forEach(el => {
        const href = el.src || el.href;
        if (href) assetUrls.add(href);
      });
      // Also fetch index.html to discover all chunk references
      try {
        const htmlResp = await fetch('/');
        const html = await htmlResp.text();
        // Extract all /assets/*.js and /assets/*.css references
        const assetRx = /\/assets\/[^"'\s)]+\.(js|css)/g;
        let m;
        while ((m = assetRx.exec(html)) !== null) {
          assetUrls.add(new URL(m[0], location.origin).href);
        }
        await staticCache.put(new Request('/'), new Response(html, { headers: { 'Content-Type': 'text/html' } }));
        await staticCache.put(new Request('/index.html'), new Response(html, { headers: { 'Content-Type': 'text/html' } }));
      } catch {}
      setDlTotal(assetUrls.size); setDlCurrent(0);
      let assetDone = 0;
      for (const url of assetUrls) {
        try {
          const r = await fetch(url);
          if (r.ok) await staticCache.put(url, r.clone());
        } catch {}
        assetDone++;
        setDlCurrent(assetDone);
      }
    } catch {}


    const cacheFetch = async (url) => {
      try {
        const r = await fetch(url);
        if (r.ok) await cache.put(url, r.clone());
        return r;
      } catch { errors++; return null; }
    };

    // ── Phase 1: Main data endpoints ──
    const mainUrls = [
      "/api/positions", "/api/patrimonio", "/api/ingresos",
      "/api/dividendos", "/api/dividendos/resumen", "/api/dividendos/mensual",
      "/api/gastos/mensual", "/api/gastos", "/api/holdings",
      "/api/fire", "/api/pl", "/api/config", "/api/categorias",
      "/api/fx", "/api/cash/latest", "/api/margin-interest",
      "/api/alerts", "/api/ib-nlv-history?limit=365", "/api/ib-nlv-history?limit=90",
      "/api/costbasis/all?limit=9999", "/api/trades",
      "/api/screener", "/api/presupuesto", "/api/presupuesto/alerts",
      "/api/data-status",
    ];
    setDlTotal(mainUrls.length); setDlCurrent(0);
    setDlPhase("Datos generales");
    for (let i = 0; i < mainUrls.length; i++) {
      await cacheFetch(API + mainUrls[i]);
      setDlCurrent(i + 1);
    }

    // ── Phase 2: Price snapshot ──
    setDlPhase("Snapshot de precios");
    setDlTotal(3); setDlCurrent(0);
    if (usTickers.length > 0) {
      const sorted = [...usTickers].sort().join(",");
      // Cache price snapshot - SW normalizes URLs so these will match future requests
      await cacheFetch(`${API}/api/prices?tickers=${sorted}`);
      setDlCurrent(1);
      await cacheFetch(`${API}/api/prices?tickers=${sorted}&live=1`);
      setDlCurrent(2);
      // VIX + SPY for CoveredCalls
      await cacheFetch(`${API}/api/prices?tickers=%5EVIX,SPY&live=1`);
      setDlCurrent(3);
    }

    // ── Phase 3: Fundamentals per ticker ──
    setDlTotal(usTickers.length); setDlCurrent(0);
    setDlPhase("Fundamentales");
    for (let i = 0; i < usTickers.length; i += 5) {
      const batch = usTickers.slice(i, i + 5);
      await Promise.all(batch.map(t => cacheFetch(`${API}/api/fundamentals?symbol=${t}`)));
      setDlCurrent(Math.min(i + 5, usTickers.length));
    }

    // ── Phase 4: Price history (30 days to save space) ──
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    setDlTotal(usTickers.length); setDlCurrent(0);
    setDlPhase("Historial precios");
    for (let i = 0; i < usTickers.length; i += 10) {
      const batch = usTickers.slice(i, i + 10);
      await Promise.all(batch.map(t => cacheFetch(`${API}/api/price-history?symbol=${t}&from=${from}`)));
      setDlCurrent(Math.min(i + 10, usTickers.length));
    }

    // ── Phase 5: Dividend calendar + streaks ──
    setDlPhase("Dividendos y earnings");
    setDlTotal(3); setDlCurrent(0);
    const tickersBatch = usTickers.join(",");
    await cacheFetch(`${API}/api/dividend-calendar?symbols=${tickersBatch}`);
    setDlCurrent(1);
    // Streak in batches of 30
    for (let i = 0; i < usTickers.length; i += 30) {
      const b = usTickers.slice(i, i + 30).join(",");
      await cacheFetch(`${API}/api/dividend-streak?symbols=${b}`);
    }
    setDlCurrent(2);
    // Earnings batch
    await cacheFetch(`${API}/api/earnings-batch?symbols=${tickersBatch}`);
    setDlCurrent(3);

    // ── Phase 6: Tax report current year ──
    setDlPhase("Informes fiscales");
    setDlTotal(2); setDlCurrent(0);
    const yr = new Date().getFullYear();
    await cacheFetch(`${API}/api/tax-report?year=${yr}`);
    setDlCurrent(1);
    await cacheFetch(`${API}/api/tax-report?year=${yr - 1}`);
    setDlCurrent(2);

    // Verify cache was populated
    let cacheCount = 0;
    try {
      const c = await caches.open("ayr-offline-data");
      const keys = await c.keys();
      cacheCount = keys.length;
    } catch {}

    // Save timestamp for offline banner
    localStorage.setItem('ayr-offline-timestamp', new Date().toISOString());
    localStorage.setItem('ayr-offline-tickers', JSON.stringify(usTickers));
    localStorage.setItem('ayr-offline-cache-count', String(cacheCount));

    setDlPhase(errors > 0
      ? `Listo (${errors} err) · ${cacheCount} en cache · ${usTickers.length} empresas`
      : `${usTickers.length} empresas · ${cacheCount} en cache · Listo para offline`);
    setDlDone(true);
    setDlDownloading(false);
  };

  const pct = dlTotal > 0 ? Math.round((dlCurrent / dlTotal) * 100) : 0;
  const offlineTs = typeof localStorage !== 'undefined' ? localStorage.getItem('ayr-offline-timestamp') : null;
  const offlineLabel = offlineTs ? new Date(offlineTs).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

  return <>
    <button onClick={() => dlDownloading ? null : (dlDone ? setDlOpen(false) : download())}
      title={offlineLabel ? `Offline listo (${offlineLabel}) — click para actualizar` : "Modo avion — descargar todo para offline"}
      style={{ padding: "4px 7px", borderRadius: 6, border: `1px solid ${dlDone || offlineLabel ? "rgba(48,209,88,.4)" : "var(--border)"}`, background: dlDone || offlineLabel ? "rgba(48,209,88,.06)" : "transparent", color: dlDownloading ? "#64d2ff" : (dlDone || offlineLabel) ? "var(--green)" : "var(--text-tertiary)", fontSize: 10, cursor: dlDownloading ? "wait" : "pointer" }}>
      {dlDownloading ? "..." : "✈️"}
    </button>
    {dlOpen && (dlDownloading || dlDone) && (
      <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "var(--surface, #1c1c1e)", border: `1px solid ${dlDone ? "rgba(48,209,88,.3)" : "rgba(100,210,255,.3)"}`, borderRadius: 12, padding: "12px 20px", fontSize: 11, fontFamily: "var(--fm)", color: dlDone ? "var(--green)" : "var(--text-primary)", zIndex: 9999, boxShadow: "0 8px 30px rgba(0,0,0,.5)", minWidth: 300, maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: dlDone ? 0 : 6 }}>
          <span>{dlDone ? "✅" : "✈️"} {dlPhase}</span>
          {!dlDone && <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{dlCurrent}/{dlTotal}</span>}
          {dlDone && <button onClick={() => setDlOpen(false)} style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 12, marginLeft: 8 }}>✕</button>}
        </div>
        {!dlDone && (
          <div style={{ height: 3, background: "rgba(255,255,255,.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #64d2ff, #30d158)", borderRadius: 2, transition: "width .3s" }} />
          </div>
        )}
      </div>
    )}
  </>;
}

export default function HomeView() {
  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const [healthData, setHealthData] = useState({loading:false,results:[],status:null});
  const {
    homeTab, setHomeTab,
    portfolioList, watchlistList, historialList,
    displayCcy, switchDisplayCcy, fxLoading, fxLastUpdate, refreshFxRates,
    privacyMode, setPrivacyMode,
    showSettings, setShowSettings,
    uiZoom, changeZoom,
    HOME_TABS,
    ibData, ibDiscrepancies, loadIBData,
    alerts, alertsUnread, showAlertPanel, setShowAlertPanel, markAlertsRead, theme, toggleTheme,
  } = useHome();

  // IB badge logic
  const ibLoaded = ibData?.loaded;
  const ibLoading = ibData?.loading;
  const ibNlv = ibData?.summary?.nlv?.amount || 0;
  const ibMargin = ibData?.summary?.initMargin?.amount || 0;
  const ibMarginPct = ibNlv > 0 ? ibMargin / ibNlv : 0;
  const ibMarginAlert = ibMarginPct > 0.5;
  const ibAlerts = [];
  if (ibMarginAlert) ibAlerts.push(`Margen ${(ibMarginPct*100).toFixed(0)}%`);
  if (ibDiscrepancies?.length) ibAlerts.push(`${ibDiscrepancies.length} disc.`);
  const ibPortTickers = new Set(portfolioList.map(p => p.ticker));
  const ibOnly = (ibData?.positions||[]).filter(p => p.assetClass==="STK" && p.shares>0 && !ibPortTickers.has(p.ticker));
  if (ibOnly.length) ibAlerts.push(`${ibOnly.length} no en app`);
  const ibColor = ibLoading ? "#64d2ff" : ibMarginAlert ? "#ff453a" : ibAlerts.length ? "#ffd60a" : ibLoaded ? "#30d158" : "var(--text-tertiary)";

  return (
  <div style={{maxWidth:1800,margin:"0 auto"}}>
    {/* ── Single compact header: Logo + Tabs + Controls ── */}
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
      {/* Logo + Version */}
      <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
        <svg width="26" height="26" viewBox="0 0 40 40" style={{cursor:"pointer"}} onClick={()=>setHomeTab("portfolio")}>
          <defs><linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#d69e2e"/><stop offset="100%" stopColor="#946b1a"/></linearGradient></defs>
          <rect width="40" height="40" rx="9" fill="#0d1117"/>
          <rect x="1.5" y="1.5" width="37" height="37" rx="8" fill="none" stroke="url(#logoGrad)" strokeWidth="1.8" opacity=".55"/>
          <text x="20" y="26.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="url(#logoGrad)" fontFamily="system-ui,-apple-system,sans-serif" letterSpacing="-0.3">A&R</text>
        </svg>
        <span style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.4,letterSpacing:.3}}>v{APP_VERSION}</span>
      </div>

      {/* Divider */}
      <div style={{width:1,height:20,background:"var(--border)",flexShrink:0}}/>

      {/* Tabs — scrollable, same row */}
      <div style={{position:"relative",flex:1,minWidth:0}}>
        <div className="ar-home-tabs" style={{display:"flex",alignItems:"center",gap:3,overflowX:"auto",flexWrap:"nowrap",scrollbarWidth:"none",padding:"2px 0"}}>
          {HOME_TABS.map(t=>(
            <button key={t.id} onClick={()=>setHomeTab(t.id)} style={{display:"flex",alignItems:"center",gap:3,padding:"5px 10px",borderRadius:7,border:`1px solid ${homeTab===t.id?"var(--gold)":"transparent"}`,background:homeTab===t.id?"var(--gold-dim)":"transparent",color:homeTab===t.id?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:homeTab===t.id?700:500,cursor:"pointer",fontFamily:"var(--fb)",whiteSpace:"nowrap",flexShrink:0}}>
              <span style={{fontSize:12}}>{t.ico}</span>{t.lbl}
              {t.id==="portfolio" && portfolioList.length>0 && <span style={{fontSize:9,opacity:.7,fontFamily:"var(--fm)"}}>{portfolioList.length}</span>}
              {t.id==="watchlist" && watchlistList.length>0 && <span style={{fontSize:9,opacity:.7,fontFamily:"var(--fm)"}}>{watchlistList.length}</span>}
              {t.id==="historial" && historialList.length>0 && <span style={{fontSize:9,opacity:.7,fontFamily:"var(--fm)"}}>{historialList.length}</span>}
            </button>
          ))}
        </div>
        <div className="ar-tabs-fade-right"/>
      </div>

      {/* Controls — compact */}
      <div className="ar-controls-group" style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
        {/* Currency selector */}
        <select value={displayCcy} onChange={e=>switchDisplayCcy(e.target.value)}
          style={{padding:"4px 4px 4px 8px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--gold)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",outline:"none",minWidth:36}}>
          {DISPLAY_CCYS.map(ccy=><option key={ccy} value={ccy}>{CURRENCIES[ccy]?.symbol || ccy}</option>)}
        </select>

        {/* IB */}
        <button onClick={loadIBData} disabled={ibLoading}
          title={ibLoaded ? `IB · NLV $${Math.round(ibNlv).toLocaleString()} · ${(ibData?.positions||[]).length} pos.${ibAlerts.length ? "\n"+ibAlerts.join(" · ") : ""}` : "Sincronizar IB"}
          style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${ibColor}33`,background:`${ibColor}0F`,color:ibColor,fontSize:10,cursor:ibLoading?"wait":"pointer",fontFamily:"var(--fm)",fontWeight:600,transition:"all .15s"}}>
          {ibLoading ? "⏳" : ibLoaded ? `📡${ibAlerts.length?" ⚠":""}` : "IB"}
        </button>

        {/* Alerts bell */}
        <button onClick={()=>{setShowAlertPanel(!showAlertPanel);if(alertsUnread>0)markAlertsRead();}}
          style={{padding:"4px 7px",borderRadius:6,border:`1px solid ${alertsUnread>0?"rgba(255,214,10,.5)":"var(--border)"}`,background:alertsUnread>0?"rgba(255,214,10,.08)":"transparent",color:alertsUnread>0?"#ffd60a":"var(--text-tertiary)",fontSize:10,cursor:"pointer",transition:"all .15s",position:"relative"}}>
          🔔{alertsUnread>0 && <span style={{position:"absolute",top:-4,right:-4,background:"var(--red)",color:"#fff",fontSize:7,fontWeight:700,borderRadius:6,padding:"1px 4px",minWidth:12,textAlign:"center"}}>{alertsUnread}</span>}
        </button>

        {/* Privacy */}
        {/* Theme toggle */}
        <button onClick={toggleTheme} title={theme==="dark"?"Modo claro":"Modo oscuro"}
          style={{padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer",transition:"all .15s"}}>
          {theme==="dark"?"☀️":"🌙"}
        </button>

        <button onClick={()=>setPrivacyMode(!privacyMode)}
          style={{padding:"4px 7px",borderRadius:6,border:`1px solid ${privacyMode?"var(--gold)":"var(--border)"}`,background:privacyMode?"var(--gold-dim)":"transparent",color:privacyMode?"var(--gold)":"var(--text-tertiary)",fontSize:10,cursor:"pointer",transition:"all .15s"}}>
          {privacyMode?"🙈":"👁"}
        </button>

        {/* Zoom */}
        <div style={{display:"flex",alignItems:"center",gap:1,border:"1px solid var(--border)",borderRadius:6,padding:"2px 3px"}}>
          <button onClick={()=>changeZoom(uiZoom-10)} style={{padding:"1px 5px",border:"none",background:"transparent",color:"var(--text-tertiary)",fontSize:11,cursor:"pointer",fontWeight:700,lineHeight:1}}>−</button>
          <span style={{fontSize:9,color:uiZoom!==100?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",minWidth:24,textAlign:"center",fontWeight:600,cursor:"pointer"}} onClick={()=>changeZoom(100)}>{uiZoom}%</span>
          <button onClick={()=>changeZoom(uiZoom+10)} style={{padding:"1px 5px",border:"none",background:"transparent",color:"var(--text-tertiary)",fontSize:11,cursor:"pointer",fontWeight:700,lineHeight:1}}>+</button>
        </div>

        {/* Settings */}
        {/* Health Check */}
        <button onClick={async ()=>{
          setShowHealthCheck(true); setHealthData({loading:true,results:[],status:null});
          const checks = [];
          const t = (name, fn) => checks.push(fn().then(()=>({name,ok:true})).catch(e=>({name,ok:false,err:e.message})));
          const API = API_URL;
          t("D1 Positions", async()=>{const r=await fetch(API+"/api/positions");const d=await r.json();if(!d.count)throw Error("0")});
          t("D1 Patrimonio", async()=>{const r=await fetch(API+"/api/patrimonio");if(!r.ok)throw Error(r.status)});
          t("D1 Dividendos", async()=>{const r=await fetch(API+"/api/dividendos");if(!r.ok)throw Error(r.status)});
          t("D1 Alerts", async()=>{const r=await fetch(API+"/api/alerts");if(!r.ok)throw Error(r.status)});
          t("FX Rates", async()=>{const r=await fetch(API+"/api/fx");const d=await r.json();if(!d.EUR)throw Error("no EUR")});
          t("Yahoo Prices", async()=>{const r=await fetch(API+"/api/prices?tickers=SPY&live=1");const d=await r.json();if(!d.prices?.SPY)throw Error("no SPY")});
          t("IB Session", async()=>{const r=await fetch(API+"/api/ib-session");const d=await r.json();if(!d.ok)throw Error(d.error||"failed")});
          t("IB Portfolio", async()=>{const r=await fetch(API+"/api/ib-portfolio");const d=await r.json();if(!d.count)throw Error("0")});
          t("IB Ledger", async()=>{const r=await fetch(API+"/api/ib-ledger");const d=await r.json();if(!d.ledger)throw Error("no ledger")});
          t("NLV History", async()=>{const r=await fetch(API+"/api/ib-nlv-history?limit=1");if(!r.ok)throw Error(r.status)});
          t("Cost Basis", async()=>{const r=await fetch(API+"/api/costbasis/all?limit=1");if(!r.ok)throw Error(r.status)});
          const results = await Promise.all(checks);
          let status = null;
          try { const sr=await fetch(API+"/api/data-status"); status=await sr.json(); } catch{}
          setHealthData({loading:false,results,status});
        }}
          title="Health Check"
          style={{padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer"}}>🩺</button>

        {/* Offline mode — download all data for airplane */}
        <AirplaneMode portfolioList={portfolioList} />

        <button onClick={()=>setShowSettings(!showSettings)} style={{padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer"}}>⚙</button>
      </div>
    </div>

    {/* Tab Content */}
    {/* Alert Panel */}
    {showAlertPanel && (
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14,marginBottom:8,maxHeight:300,overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>🔔 Alertas</div>
          <button onClick={()=>setShowAlertPanel(false)} style={{border:"none",background:"transparent",color:"var(--text-tertiary)",cursor:"pointer",fontSize:12}}>✕</button>
        </div>
        {(!alerts || alerts.length === 0) ? (
          <div style={{textAlign:"center",padding:20,color:"var(--text-tertiary)",fontSize:11,fontFamily:"var(--fm)"}}>Sin alertas recientes</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {alerts.slice(0, 20).map((a, i) => {
              const icons = { DIVIDEND: "💰", EARNINGS: "📊", DROP: "📉", OPTION_EXP: "⏰", MARGIN: "⚠️", MILESTONE: "🎉" };
              const colors = { DIVIDEND: "var(--gold)", EARNINGS: "#64d2ff", DROP: "var(--red)", OPTION_EXP: "#bf5af2", MARGIN: "#ffd60a", MILESTONE: "var(--green)" };
              return (
                <div key={a.id || i} style={{padding:"6px 10px",borderRadius:8,background:a.leida?"transparent":"rgba(255,214,10,.03)",border:`1px solid ${a.leida?"rgba(255,255,255,.03)":"rgba(255,214,10,.1)"}`,display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:14}}>{icons[a.tipo] || "🔔"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:600,color:colors[a.tipo] || "var(--text-primary)",fontFamily:"var(--fm)"}}>{a.titulo}</div>
                    {a.detalle && <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{a.detalle}</div>}
                  </div>
                  <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",flexShrink:0}}>{a.fecha}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}

    {/* Health Check Panel */}
    {showHealthCheck && (
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:16,marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>
            🩺 Health Check
            {!healthData.loading && <span style={{marginLeft:8,fontSize:11,color:healthData.results.every(r=>r.ok)?"var(--green)":"var(--red)"}}>
              {healthData.results.filter(r=>r.ok).length}/{healthData.results.length} OK
            </span>}
          </div>
          <button onClick={()=>setShowHealthCheck(false)} style={{border:"none",background:"transparent",color:"var(--text-tertiary)",cursor:"pointer",fontSize:14}}>✕</button>
        </div>
        {healthData.loading ? (
          <div style={{textAlign:"center",padding:20,color:"var(--text-tertiary)",fontSize:12,fontFamily:"var(--fm)"}}>Verificando sistemas...</div>
        ) : (
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            {/* Systems grid */}
            <div style={{flex:"1 1 300px"}}>
              <div style={{fontSize:10,fontWeight:600,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:6,letterSpacing:.5}}>SISTEMAS</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:4}}>
                {healthData.results.map((r,i) => (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:6,background:r.ok?"rgba(48,209,88,.04)":"rgba(255,69,58,.06)",border:`1px solid ${r.ok?"rgba(48,209,88,.12)":"rgba(255,69,58,.15)"}`}}>
                    <span style={{fontSize:12}}>{r.ok?"✅":"❌"}</span>
                    <div>
                      <div style={{fontSize:10,fontWeight:600,color:r.ok?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{r.name}</div>
                      {r.err && <div style={{fontSize:8,color:"var(--red)",fontFamily:"var(--fm)"}}>{r.err}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Data status */}
            {healthData.status && (
              <div style={{flex:"1 1 250px"}}>
                <div style={{fontSize:10,fontWeight:600,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:6,letterSpacing:.5}}>📅 ÚLTIMA ACTUALIZACIÓN</div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {[
                    {l:"Patrimonio",v:healthData.status.patrimonio?.lastUpdate},
                    {l:"Dividendos",v:healthData.status.dividendos?.lastUpdate,n:healthData.status.dividendos?.count},
                    {l:"Gastos",v:healthData.status.gastos?.lastUpdate,n:healthData.status.gastos?.count},
                    {l:"Trades",v:healthData.status.trades?.lastUpdate,n:healthData.status.trades?.count},
                    {l:"NLV",v:healthData.status.nlv?.lastUpdate},
                    {l:"Posiciones",v:healthData.status.positions?.lastUpdate,n:healthData.status.positions?.count},
                  ].map((d,i) => {
                    const isOld = d.v && d.v !== "—" && (Date.now() - new Date(d.v).getTime()) > 7*86400000;
                    return (
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 8px",borderRadius:5,background:isOld?"rgba(255,214,10,.04)":"rgba(255,255,255,.02)",border:`1px solid ${isOld?"rgba(255,214,10,.12)":"rgba(255,255,255,.03)"}`}}>
                      <span style={{fontSize:10,color:isOld?"#ffd60a":"var(--text-secondary)",fontFamily:"var(--fm)",fontWeight:600}}>{isOld?"⚠ ":""}{d.l}</span>
                      <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{d.v||"—"}{d.n?` (${d.n})`:""}</span>
                    </div>);
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )}

    {homeTab==="portfolio" && <PortfolioTab />}
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        {homeTab==="screener" && <ScreenerTab />}
        {homeTab==="trades" && <TradesTab />}
        {homeTab==="patrimonio" && <PatrimonioTab />}
        {homeTab==="dashboard" && <DashboardTab />}
        {homeTab==="dividendos" && <DividendosTab />}
        {homeTab==="fire" && <FireTab />}
        {homeTab==="gastos" && <GastosTab />}
        {homeTab==="control" && <ControlTab />}
        {homeTab==="watchlist" && <WatchlistTab />}
        {homeTab==="historial" && <HistorialTab />}
        {homeTab==="advisor" && <AdvisorTab />}
        {homeTab==="research" && <ResearchTab />}
        {homeTab==="covered-calls" && <CoveredCallsTab />}
        {homeTab==="income-lab" && <IncomeLabTab />}
        {homeTab==="presupuesto" && <PresupuestoTab />}
      </Suspense>
    </ErrorBoundary>

    {/* Settings Panel */}
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        {showSettings && <SettingsPanel />}
      </Suspense>
    </ErrorBoundary>
  </div>
  );
}
// v1.0.1
