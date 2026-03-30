import { lazy, Suspense } from 'react';
import { useHome } from '../../context/HomeContext';
import { CURRENCIES, DISPLAY_CCYS, APP_VERSION } from '../../constants/index.js';
import { PortfolioTab } from '../home';

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

export default function HomeView() {
  const {
    homeTab, setHomeTab,
    portfolioList, watchlistList, historialList,
    displayCcy, switchDisplayCcy, fxLoading, fxLastUpdate, refreshFxRates,
    privacyMode, setPrivacyMode,
    showSettings, setShowSettings,
    uiZoom, changeZoom,
    HOME_TABS,
    ibData, ibDiscrepancies, loadIBData,
    alerts, alertsUnread, showAlertPanel, setShowAlertPanel, markAlertsRead,
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
        <div className="ar-home-tabs" style={{display:"flex",alignItems:"center",gap:3,overflowX:"auto",flexWrap:"nowrap",scrollbarWidth:"none"}}>
          {HOME_TABS.map(t=>(
            <button key={t.id} onClick={()=>setHomeTab(t.id)} style={{display:"flex",alignItems:"center",gap:3,padding:"5px 9px",borderRadius:7,border:`1px solid ${homeTab===t.id?"var(--gold)":"transparent"}`,background:homeTab===t.id?"var(--gold-dim)":"transparent",color:homeTab===t.id?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:homeTab===t.id?700:500,cursor:"pointer",fontFamily:"var(--fb)",transition:"all .15s",whiteSpace:"nowrap",flexShrink:0}}>
              <span style={{fontSize:12}}>{t.ico}</span>{t.lbl}
              {t.id==="portfolio" && portfolioList.length>0 && <span style={{fontSize:9,opacity:.7,fontFamily:"var(--fm)"}}>{portfolioList.length}</span>}
              {t.id==="watchlist" && watchlistList.length>0 && <span style={{fontSize:9,opacity:.7,fontFamily:"var(--fm)"}}>{watchlistList.length}</span>}
              {t.id==="historial" && historialList.length>0 && <span style={{fontSize:9,opacity:.7,fontFamily:"var(--fm)"}}>{historialList.length}</span>}
            </button>
          ))}
        </div>
        <div style={{position:"absolute",right:0,top:0,bottom:0,width:32,background:"linear-gradient(to right, transparent, var(--bg, #000))",pointerEvents:"none"}}/>
      </div>

      {/* Controls — compact */}
      <div style={{display:"flex",gap:3,alignItems:"center",flexShrink:0}}>
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

    {homeTab==="portfolio" && <PortfolioTab />}
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

    {/* Settings Panel */}
    <Suspense fallback={<Loading />}>
      {showSettings && <SettingsPanel />}
    </Suspense>
  </div>
  );
}
// v1.0.1
