import { lazy, Suspense } from 'react';
import { useHome } from '../../context/HomeContext';
import { CURRENCIES, DISPLAY_CCYS } from '../../constants/index.js';
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
const SettingsPanel = lazy(() => import('../home/SettingsPanel'));

const Loading = () => <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'50vh',color:'var(--text-secondary)'}}>Cargando...</div>;

export default function HomeView() {
  const {
    homeTab, setHomeTab,
    portfolioList, watchlistList, historialList,
    displayCcy, switchDisplayCcy, fxLoading, fxLastUpdate, refreshFxRates,
    privacyMode, setPrivacyMode,
    showSettings, setShowSettings,
    HOME_TABS,
  } = useHome();

  return (
  <div style={{maxWidth:1400,margin:"0 auto"}}>
    {/* Row 1: Logo + Navigation Tabs */}
    <div className="ar-home-tabs" style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
      {/* Logo SVG */}
      <svg width="32" height="32" viewBox="0 0 40 40" style={{flexShrink:0,cursor:"pointer"}} onClick={()=>setHomeTab("portfolio")}>
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d69e2e"/><stop offset="100%" stopColor="#946b1a"/>
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="9" fill="#0d1117"/>
        <rect x="1.5" y="1.5" width="37" height="37" rx="8" fill="none" stroke="url(#logoGrad)" strokeWidth="1.8" opacity=".55"/>
        <text x="20" y="26.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="url(#logoGrad)" fontFamily="system-ui,-apple-system,sans-serif" letterSpacing="-0.3">A&amp;R</text>
      </svg>
      {/* Main tabs inline with logo */}
      {HOME_TABS.map(t=>(
        <button key={t.id} onClick={()=>setHomeTab(t.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",borderRadius:8,border:`1px solid ${homeTab===t.id?"var(--gold)":"transparent"}`,background:homeTab===t.id?"var(--gold-dim)":"transparent",color:homeTab===t.id?"var(--gold)":"var(--text-tertiary)",fontSize:11.5,fontWeight:homeTab===t.id?700:500,cursor:"pointer",fontFamily:"var(--fb)",transition:"all .15s",whiteSpace:"nowrap"}}>
          <span style={{fontSize:12}}>{t.ico}</span>{t.lbl}
          {t.id==="portfolio" && portfolioList.length>0 && <span style={{fontSize:10,color:homeTab===t.id?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.7}}>{portfolioList.length}</span>}
          {t.id==="watchlist" && watchlistList.length>0 && <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.7}}>{watchlistList.length}</span>}
          {t.id==="historial" && historialList.length>0 && <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.7}}>{historialList.length}</span>}
        </button>
      ))}
      {/* Currency + FX + Settings — right-aligned */}
      <div style={{marginLeft:"auto",display:"flex",gap:3,alignItems:"center"}}>
        <div style={{display:"flex",gap:0,border:"1px solid var(--border)",borderRadius:6,overflow:"hidden"}}>
          {DISPLAY_CCYS.map(ccy=>(
            <button key={ccy} onClick={()=>switchDisplayCcy(ccy)}
              style={{padding:"4px 8px",border:"none",background:displayCcy===ccy?"var(--gold-dim)":"transparent",color:displayCcy===ccy?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:displayCcy===ccy?700:500,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .15s",borderRight:"1px solid var(--border)"}}>
              {CURRENCIES[ccy]?.symbol || ccy}
            </button>
          ))}
        </div>
        <button onClick={refreshFxRates} disabled={fxLoading} title={fxLastUpdate?`Última act: ${new Date(fxLastUpdate).toLocaleString('es-ES')}`:"Sin datos FX"}
          style={{padding:"4px 8px",borderRadius:6,border:"1px solid var(--border)",background:fxLoading?"rgba(100,210,255,.08)":"transparent",color:fxLoading?"#64d2ff":"var(--text-tertiary)",fontSize:10,cursor:fxLoading?"wait":"pointer",fontFamily:"var(--fm)"}}>
          {fxLoading?"⏳":"FX"}
        </button>
        <button onClick={()=>setPrivacyMode(!privacyMode)} title={privacyMode?"Mostrar datos":"Ocultar datos sensibles"} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${privacyMode?"var(--gold)":"var(--border)"}`,background:privacyMode?"var(--gold-dim)":"transparent",color:privacyMode?"var(--gold)":"var(--text-tertiary)",fontSize:10,cursor:"pointer",transition:"all .15s"}}>{privacyMode?"🙈":"👁"}</button>
        <button onClick={()=>setShowSettings(!showSettings)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer"}}>⚙</button>
      </div>
    </div>

    {/* Tab Content */}
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
    </Suspense>

    {/* Settings Panel */}
    <Suspense fallback={<Loading />}>
      {showSettings && <SettingsPanel />}
    </Suspense>
  </div>
  );
}
