import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { _sf, fmtNumD, fmtPctFrac, fmtMul, fmtBnUsd } from './utils/formatters.js';
import { CURRENCIES, DISPLAY_CCYS, DEFAULT_FX, YEARS, _CURRENT_YEAR, TABS, API_URL, HOME_TABS } from './constants/index.js';
import { convertCcy, fetchFxRates } from './utils/currency.js';
import { storageAvailable, saveCompanyToStorage, loadCompanyFromStorage, loadPortfolioIndex, removeCompanyFromStorage } from './utils/storage.js';
import { fetchViaFMP } from './api/fmp.js';
import { generateReport } from './api/claude.js';
import { fetchAllData } from './api/data.js';
import { useAnalysisMetrics } from './hooks/useAnalysisMetrics.js';
import './App.css';
import { Inp, ErrorBoundary, Toast } from './components/ui';
import AnalysisContext from './context/AnalysisContext';
import HomeContext from './context/HomeContext';
import CostBasisContext from './context/CostBasisContext';

// ─── Lazy-loaded views ───
import HomeView from './components/views/HomeView';
const CostBasisView = lazy(() => import('./components/views/CostBasisView'));

// ─── Lazy-loaded analysis tabs ───
const DashTab = lazy(() => import('./components/analysis/DashTab'));
const ChartTab = lazy(() => import('./components/analysis/ChartTab'));
const ClaudeTab = lazy(() => import('./components/analysis/ClaudeTab'));
const DataTab = lazy(() => import('./components/analysis/DataTab'));
const QualityTab = lazy(() => import('./components/analysis/QualityTab'));
const DebtTab = lazy(() => import('./components/analysis/DebtTab'));
const ValuationTab = lazy(() => import('./components/analysis/ValuationTab'));
const DCFTab = lazy(() => import('./components/analysis/DCFTab'));
const Big5Tab = lazy(() => import('./components/analysis/Big5Tab'));
const TenCapTab = lazy(() => import('./components/analysis/TenCapTab'));
const ScoreTab = lazy(() => import('./components/analysis/ScoreTab'));
const DividendsTab = lazy(() => import('./components/analysis/DividendsTab'));
const GrowthTab = lazy(() => import('./components/analysis/GrowthTab'));
const MOSTab = lazy(() => import('./components/analysis/MOSTab'));
const FastGraphsTab = lazy(() => import('./components/analysis/FastGraphsTab'));
const FastTab = lazy(() => import('./components/analysis/FastTab'));
const WeissTab = lazy(() => import('./components/analysis/WeissTab'));
const ChecklistTab = lazy(() => import('./components/analysis/ChecklistTab'));
const PaybackTab = lazy(() => import('./components/analysis/PaybackTab'));
const ReportTab = lazy(() => import('./components/analysis/ReportTab'));
const TranscriptTab = lazy(() => import('./components/analysis/TranscriptTab'));
const ArchiveTab = lazy(() => import('./components/analysis/ArchiveTab'));
const BusinessModelTab = lazy(() => import('./components/analysis/BusinessModelTab'));
const TesisTab = lazy(() => import('./components/analysis/TesisTab'));
const DirectivaTab = lazy(() => import('./components/analysis/DirectivaTab'));
const DSTTab = lazy(() => import('./components/analysis/DSTTab'));
const OptionsChainTab = lazy(() => import('./components/analysis/OptionsChainTab'));

// ─── Loading fallback ───
const Loading = () => <div style={{padding:"24px",display:"flex",flexDirection:"column",gap:12}}>
  {[0,1,2].map(i=><div key={i} style={{height:60,background:"var(--card)",borderRadius:12,animation:"pulse 1.5s infinite",animationDelay:`${i*0.15}s`}}/>)}
</div>;

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

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════

// ─── Cost Basis Data — empty placeholders, populated at runtime via JSON import or IB Flex sync ───
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



// Scroll to top button
function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <button className={`ar-scroll-top ${visible ? 'visible' : ''}`} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>;
}

export default function ARApp() {
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [apiData, setApiData] = useState(null);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [toast, setToast] = useState(null);

  // Offline detection
  useEffect(() => {
    const goOff = () => setIsOffline(true);
    const goOn = () => setIsOffline(false);
    window.addEventListener('offline', goOff);
    window.addEventListener('online', goOn);
    return () => { window.removeEventListener('offline', goOff); window.removeEventListener('online', goOn); };
  }, []);

  useEffect(() => {
    fetchAllData().then(result => {
      if (result.ok) {
        setApiData(result);
        if (result.errors?.length) {
          setDataError(`Endpoints con error: ${result.errors.join(', ')}`);
        }
      } else {
        setDataError("Error conectando con la API. Comprueba tu conexión.");
      }
      setDataLoaded(true);
    });
  }, []);

  // Destructure apiData for use throughout the component.
  // MEMOIZED (Audit B H2, 2026-04-08): previously these 20 fallbacks were
  // evaluated on every render, creating new []/{}/array references each time
  // and invalidating useCallback/useEffect dep arrays throughout the tree.
  // Now they each get a stable reference derived only when apiData changes.
  const CTRL_DATA = useMemo(() => apiData?.CTRL_DATA || [], [apiData]);
  const INCOME_DATA = useMemo(() => apiData?.INCOME_DATA || [], [apiData]);
  const DIV_BY_YEAR = useMemo(() => apiData?.DIV_BY_YEAR || {}, [apiData]);
  const DIV_BY_MONTH = useMemo(() => apiData?.DIV_BY_MONTH || {}, [apiData]);
  const GASTOS_MONTH = useMemo(() => apiData?.GASTOS_MONTH || {}, [apiData]);
  const FIRE_PROJ = useMemo(() => apiData?.FIRE_PROJ || [], [apiData]);
  const FIRE_PARAMS = useMemo(() => apiData?.FIRE_PARAMS || {target:1350000,returnPct:0.11,inflation:0.025,monthlyExp:4000}, [apiData]);
  const ANNUAL_PL = useMemo(() => apiData?.ANNUAL_PL || [], [apiData]);
  const FI_TRACK = useMemo(() => apiData?.FI_TRACK || [], [apiData]);
  const HIST_INIT = useMemo(() => apiData?.HIST_INIT || [], [apiData]);
  const GASTO_CATS = useMemo(() => apiData?.GASTO_CATS || {}, [apiData]);
  const _DIV_ENTRIES = useMemo(() => apiData?._DIV_ENTRIES || [], [apiData]);
  const _GASTO_ENTRIES = useMemo(() => apiData?._GASTO_ENTRIES || [], [apiData]);
  const GASTOS_CAT = useMemo(() => apiData?.GASTOS_CAT || {}, [apiData]);
  const CASH_DATA = useMemo(() => apiData?.CASH_DATA || [], [apiData]);
  const MARGIN_INTEREST_DATA = useMemo(() => apiData?.MARGIN_INTEREST_DATA || [], [apiData]);
  const D1_POSITIONS = useMemo(() => apiData?.D1_POSITIONS || {}, [apiData]);
  const LIVE_DPS = useMemo(() => apiData?.LIVE_DPS || {}, [apiData]);
  const FORWARD_DIV = useMemo(() => apiData?.FORWARD_DIV || {annual_projected:0,monthly:[],by_ticker:[]}, [apiData]);
  const CACHED_PNL = useMemo(() => apiData?.CACHED_PNL || {pnl:0,cost:0,pnlPct:0,timestamp:null}, [apiData]);

  // Financial data for analysis — loaded via "Importar" JSON or FMP API
  const [fin, setFin] = useState(()=>{
    const o = {};
    YEARS.forEach(y => { o[y] = {revenue:0,grossProfit:0,operatingIncome:0,netIncome:0,eps:0,dps:0,sharesOut:0,totalDebt:0,cash:0,equity:0,retainedEarnings:0,ocf:0,capex:0,interestExpense:0,depreciation:0,taxProvision:0}; });
    return o;
  });
  const [cfg, setCfg] = useState({ticker:"",name:"",price:0,currency:"USD",beta:1.0,riskFree:4.0,marketPremium:5.5,taxRate:28,manualDiscount:0,manualGrowth:0,useWACC:true});
  const [tab, setTab] = useState("dash");
  const [anim, setAnim] = useState(false);
  // Custom tab order — persists per-user in localStorage. Default = TABS array order.
  // Drag any analysis tab horizontally to reorder; new tabs added later auto-append.
  const [tabOrder, setTabOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ayr-tab-order') || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {}
    return TABS.map(t => t.id);
  });
  const [tabDragging, setTabDragging] = useState(null);
  const [tabDragOver, setTabDragOver] = useState(null);
  const [fgMode, setFgMode] = useState("eps_adj");
  const [fgPE, setFgPE] = useState(15);
  const [fgGrowth, setFgGrowth] = useState(8);
  const [fgProjYears, setFgProjYears] = useState(5);
  const [showDiv, setShowDiv] = useState(true);
  const [comps, setComps] = useState([]);

  // SSD — Auto-calculated from financial data + FMP endpoints (no more hardcoded Diageo data)
  const BLANK_SSD = {
    safetyScore:0,safetyLabel:"—",safetyDate:"",safetyNote:"",
    creditRating:"—",creditLabel:"",taxation:"Qualified",taxForm:"Form 1099",
    frequency:"—",freqMonths:"",annualPayout:0,
    exDivDate:"—",exDivStatus:"",payDate:"—",payDateStatus:"",
    payoutRatio:0,payoutLabel:"",fwdPayoutRatio:0,fwdPayoutLabel:"",
    ndEbitda:0,ndEbitdaLabel:"",ndCapital:0,ndCapitalLabel:"",
    divStreak:0,divStreakLabel:"",recessionDivAction:"—",
    recessionSales:"—",recessionSalesLabel:"",recessionReturn:"—",recessionReturnLabel:"",
    growthLast12m:0,growthLast5y:0,growthLast10y:0,
    growthStreak:0,uninterruptedStreak:0,
    expectedPriceLow:0,expectedPriceHigh:0,fiveYearAvgPrice:0,sectorPE:20,
    notes:[],
    // Claude AI report fields
    moat:"",moatScore:0,moatExplanation:"",
    divSafetyScore:0,divSafetyAssessment:"",
    finHealthScore:0,finHealthAssessment:"",
    growthAssessment:"",fcfTrend:"",
    valuationFairValue:0,valuationMethod:"",valuationUpside:0,valuationAssessment:"",
    risks:[],catalysts:[],verdict:"",verdictSummary:"",targetWeight:"",overallScore:0,reportGenerated:"",
  };
  const [ssd, setSsd] = useState({...BLANK_SSD});

  const tabsRef = useRef(null);
  const [fmpLoading, setFmpLoading] = useState(false);
  const [fmpError, setFmpError] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [lastSaved, setLastSaved] = useState(null); // ISO date of last save for current ticker
  const [positionNotes, setPositionNotes] = useState(''); // current company notes (buy thesis)
  const [notesSaved, setNotesSaved] = useState(false); // "Guardado" indicator
  const notesTimerRef = useRef(null);
  const [recentTickers, setRecentTickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ayr_recent') || '[]'); } catch { return []; }
  });
  // v10.2: New FMP data (rating, DCF, estimates, price targets, key metrics, financial growth)
  const [fmpExtra, setFmpExtra] = useState({ rating: {}, dcf: {}, estimates: [], priceTarget: {}, keyMetrics: [], finGrowth: [], grades: {}, ownerEarnings: [], revSegments: [], geoSegments: [], peers: [], earnings: [], ptSummary: {}, profile: {} });
  const [showSettings, setShowSettings] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem("ayr_privacy") === "1");
  const [theme, setTheme] = useState(() => localStorage.getItem("ayr_theme") || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.style.background = "var(--bg)";
    document.body.style.color = "var(--text-primary)";
    localStorage.setItem("ayr_theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  // ── IB Integration state ──
  const [ibData, setIbData] = useState({ positions: [], ledger: {}, summary: {}, trades: [], loaded: false, loading: false, lastSync: null, errors: {} });
  // ibDiscrepancies computed separately (not useState — derived from portfolioComputed)

  const loadIBData = useCallback(async () => {
    setIbData(prev => ({ ...prev, loading: true, errors: {} }));
    const errors = {};
    let positions = [], ledger = {}, summary = {}, trades = [];

    const results = await Promise.allSettled([
      fetch(`${API_URL}/api/ib-portfolio`).then(r => r.json()),
      fetch(`${API_URL}/api/ib-ledger`).then(r => r.json()),
      fetch(`${API_URL}/api/ib-summary`).then(r => r.json()),
      fetch(`${API_URL}/api/ib-trades`).then(r => r.json()),
    ]);

    if (results[0].status === "fulfilled" && results[0].value?.positions) {
      positions = results[0].value.positions;
    } else { errors.portfolio = results[0].reason?.message || results[0].value?.error || "Failed"; }

    if (results[1].status === "fulfilled" && results[1].value?.ledger) {
      ledger = results[1].value.ledger;
    } else { errors.ledger = results[1].reason?.message || "Failed"; }

    if (results[2].status === "fulfilled" && results[2].value?.nlv) {
      summary = results[2].value;
    } else { errors.summary = results[2].reason?.message || "Failed"; }

    if (results[3].status === "fulfilled" && results[3].value?.trades) {
      trades = results[3].value.trades;
    } else { errors.trades = results[3].reason?.message || "Failed"; }

    const data = { positions, ledger, summary, trades, loaded: true, loading: false, lastSync: new Date().toISOString(), errors };
    setIbData(data);

    // Auto-save NLV snapshot (once per day)
    if (summary?.nlv?.amount > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const nlvKey = 'nlv-saved-' + today;
      if (!sessionStorage.getItem(nlvKey)) {
        sessionStorage.setItem(nlvKey, '1');
        fetch(`${API_URL}/api/ib-nlv-save`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha: today, nlv: summary.nlv.amount, cash: summary.totalCash?.amount || 0,
            positionsValue: summary.grossPosition?.amount || 0, marginUsed: summary.initMargin?.amount || 0,
            accounts: (summary.accounts || []).length || 4, positionsCount: positions.length,
            buyingPower: summary.buyingPower?.amount || 0,
          }),
        }).catch(() => {});
      }
    }

    return data;
  }, []);

  // refreshLivePrices defined after portfolioList (see deferred effects section)

  // IB cloud sync status message
  const [ibSyncMsg, setIbSyncMsg] = useState(null);

  // Load cached IB snapshot immediately (D1 only, no IB session needed)
  // Then try live IB data which overwrites if successful
  useEffect(() => {
    if (!dataLoaded) return;
    // Always load cached snapshot first so Dashboard has data even without IB session
    fetch(`${API_URL}/api/ib-cached-snapshot`).then(r => r.json()).then(snap => {
      if (snap?.summary?.nlv?.amount > 0) {
        setIbData(prev => {
          if (prev.loaded && !prev.cached) return prev; // live data already loaded, don't overwrite
          return { positions: snap.positions || [], ledger: {}, summary: snap.summary, trades: [], loaded: true, loading: false, cached: true, lastSync: snap.summary.fecha || null, errors: {} };
        });
      }
    }).catch(e => console.error('[IB cached snapshot]', e));
  }, [dataLoaded]);

  // Auto-sync IB data once per session: call cloud sync endpoint + load IB data
  useEffect(() => {
    if (!dataLoaded) return;
    const syncKey = 'ib-sync-' + new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(syncKey)) return;
    sessionStorage.setItem(syncKey, '1');

    // 1. Load IB live data (portfolio, ledger, summary, trades)
    loadIBData();

    // 2. Cloud auto-sync: import recent trades + save NLV + sync positions (background)
    setIbSyncMsg("Sincronizando IB...");
    fetch(`${API_URL}/api/ib-auto-sync`, { method: "POST" })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setIbSyncMsg(null);
        } else {
          const parts = [];
          if (data.trades_imported > 0) parts.push(`${data.trades_imported} trades`);
          if (data.nlv_updated) parts.push("NLV");
          if (data.ib_positions_synced > 0) parts.push(`${data.ib_positions_synced} pos`);
          setIbSyncMsg(parts.length ? `IB sync: ${parts.join(", ")}` : "IB sincronizado");
          setTimeout(() => setIbSyncMsg(null), 5000);
        }
      })
      .catch(() => setIbSyncMsg(null));
  }, [dataLoaded, loadIBData]);

  // Alerts + divStreaks state (useEffects that use these are placed after portfolioTotals)
  const [alerts, setAlerts] = useState([]);
  const [alertsUnread, setAlertsUnread] = useState(0);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [divStreaks, setDivStreaks] = useState({});
  // smartMoneyHolders: { [ticker]: [{ fund_id, fund_name, manager, source, weight_pct, ... }, ...] }
  // Loaded once per day, cached in sessionStorage. Powers the CompanyRow "⭐N" badge.
  const [smartMoneyHolders, setSmartMoneyHolders] = useState({});
  const [scoresModalTicker, setScoresModalTicker] = useState(null);
  const [scoresModalData, setScoresModalData] = useState(null);

  const [uiZoom, setUiZoom] = useState(() => {
    const saved = localStorage.getItem("ayr_zoom");
    return saved ? parseInt(saved) : 100;
  });
  const changeZoom = (z) => { const v = Math.max(70, Math.min(150, z)); setUiZoom(v); localStorage.setItem("ayr_zoom", v); };
  const hide = v => privacyMode ? "•••••" : v; // Hide sensitive values
  const hideN = v => privacyMode ? "•••" : v; // Hide shorter numbers

  // ── Navigation: "home" (portfolio/watchlist/research) vs "analysis" (15 tabs) vs "costbasis" ──
  const [viewMode, setViewMode] = useState("home");
  const [globalSearch, setGlobalSearch] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
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
  const [portSort, setPortSort] = useState({col:"value",asc:false});
  const [showCapTable, setShowCapTable] = useState(false);
  // Screener state
  const [screenerData, setScreenerData] = useState(null);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [screenerSort, setScreenerSort] = useState({col:"score",asc:false});
  const [screenerFilter, setScreenerFilter] = useState({minScore:0,sector:"",search:"",minYield:0});
  const [customTickers, setCustomTickers] = useState("");

  // Country mapping: ticker -> country code
  const getCountry = (ticker, ccy) => {
    // Explicit mappings for tickers that need override
    const map = {"ENG":"ES","FDJU":"FR","BME:AMS":"ES","BME:VIS":"ES","LSEG":"GB","DEO":"US","NVO":"US","CNSWF":"CA","DIDIY":"US","NOMD":"US","LYB":"US","ACN":"US"};
    if (map[ticker]) return map[ticker];
    if (ticker.startsWith("HKG:")) return "HK";
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
// Positions: loaded from D1 database
const POS_STATIC = D1_POSITIONS;

// Build positions from POS_STATIC / D1_POSITIONS — the source of truth for shares, prices, USD values
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
      cat: st.cat || "COMPANY", mc: st.mc || 0, sector: st.sec || "",
      // Pre-computed USD values from CARTERA (already FX-converted correctly)
      usdValue: st.uv || 0, marketValue: st.mv || 0, totalInvertido: st.ti || 0,
      pnlPct: st.pnl || 0, pnlAbs: st.pnlAbs || 0,
      // Dividends
      dps: st.dps || 0, divTTM: st.divTTM || 0, divYieldTTM: st.dy || 0,
      yoc: st.yoc || 0, annualDivTotal: st.adt || 0,
      // CB income
      totalDivs, totalOptCredit, hasCB: txns.length > 0,
      // Notes (buy thesis)
      notes: st.notes || '',
    };
  }
  return result;
}

  const [positions, setPositions] = useState(() => buildPositionsFromCB());
  // Re-build positions when D1 data loads (POS_STATIC changes from {} to 89 positions)
  useEffect(() => {
    if (Object.keys(POS_STATIC).length > 0) {
      setPositions(buildPositionsFromCB());
    }
  }, [D1_POSITIONS]);
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
                spark: priceData.spark || [],
                priceUpdated: true,
              };
            }
          }
          return updated;
        });
        setPricesLastUpdate(data.updated || new Date().toISOString());
        if (force) setToast({ message: `Precios actualizados (${Object.keys(data.prices||{}).length} tickers)`, type: "success" });
      }
    } catch(e) {
      console.error("Price refresh error:", e);
      if (force) setToast({ message: "Error actualizando precios", type: "error" });
    }
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
    // Reset all company-specific state before loading
    setSsd({...BLANK_SSD});
    setComps([]);
    setFmpExtra({ rating: {}, dcf: {}, estimates: [], priceTarget: {}, keyMetrics: [], finGrowth: [], grades: {}, ownerEarnings: [], revSegments: [], geoSegments: [], peers: [], earnings: [], ptSummary: {}, profile: {} });
    setFmpError(null);
    // Load notes from positions data
    setPositionNotes(positions[t]?.notes || POS_STATIC[t]?.notes || '');
    setNotesSaved(false);

    const saved = await loadCompanyFromStorage(t);
    if (saved?.fin && Object.values(saved.fin).some(y => y.revenue > 0)) {
      // Has saved data with actual financials — use it
      setFin(() => {
        const merged = {};
        YEARS.forEach(y => { merged[y] = {revenue:0,grossProfit:0,operatingIncome:0,netIncome:0,eps:0,dps:0,sharesOut:0,totalDebt:0,cash:0,equity:0,retainedEarnings:0,ocf:0,capex:0,interestExpense:0,depreciation:0,taxProvision:0}; });
        Object.keys(saved.fin).forEach(y => { merged[parseInt(y, 10)] = saved.fin[parseInt(y, 10)]; });
        return merged;
      });
      if (saved.cfg) setCfg(prev => ({...prev, ...saved.cfg, riskFree:prev.riskFree, marketPremium:prev.marketPremium, taxRate:prev.taxRate, useWACC:prev.useWACC, manualDiscount:prev.manualDiscount, manualGrowth:prev.manualGrowth}));
      if (saved.comps) setComps(saved.comps);
      // Don't restore old ssd — let useEffect auto-calculate from real data
      // Only keep AI-generated report fields if present
      if (saved.ssd?.reportGenerated) setSsd(prev => ({...prev, 
        moat: saved.ssd.moat||"", moatScore: saved.ssd.moatScore||0, moatExplanation: saved.ssd.moatExplanation||"",
        divSafetyScore: saved.ssd.divSafetyScore||0, divSafetyAssessment: saved.ssd.divSafetyAssessment||"",
        finHealthScore: saved.ssd.finHealthScore||0, finHealthAssessment: saved.ssd.finHealthAssessment||"",
        growthAssessment: saved.ssd.growthAssessment||"", fcfTrend: saved.ssd.fcfTrend||"",
        valuationFairValue: saved.ssd.valuationFairValue||0, valuationMethod: saved.ssd.valuationMethod||"",
        valuationUpside: saved.ssd.valuationUpside||0, valuationAssessment: saved.ssd.valuationAssessment||"",
        risks: saved.ssd.risks||[], catalysts: saved.ssd.catalysts||[],
        aiDisruptionLevel: saved.ssd.aiDisruptionLevel||"", aiDisruptionScore: saved.ssd.aiDisruptionScore||0,
        aiDisruptionThreats: saved.ssd.aiDisruptionThreats||[], aiDisruptionDefenses: saved.ssd.aiDisruptionDefenses||[],
        aiDisruptionAssessment: saved.ssd.aiDisruptionAssessment||"",
        verdict: saved.ssd.verdict||"", verdictSummary: saved.ssd.verdictSummary||"",
        targetWeight: saved.ssd.targetWeight||"", overallScore: saved.ssd.overallScore||0,
        reportGenerated: saved.ssd.reportGenerated,
      }));
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

  // ── Position Notes (Buy Thesis) ──
  const savePositionNotes = useCallback(async (ticker, notes) => {
    if (!ticker) return;
    try {
      await fetch(`${API_URL}/api/positions/${encodeURIComponent(ticker)}/notes`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ notes }),
      });
      // Update local positions state so badge appears without reload
      setPositions(prev => {
        if (!prev[ticker]) return prev;
        return { ...prev, [ticker]: { ...prev[ticker], notes } };
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (e) { console.warn('Failed to save notes:', e); }
  }, []);

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
        const result = await window.storage.get(`cb:v2:${ticker.toUpperCase()}`, true);
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
        try { await window.storage.set(`cb:v2:${ticker.toUpperCase()}`, JSON.stringify(txns), true); } catch(e) {}
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
              execId: r.exec_id || null,
              account: r.account || null,
              underlying: r.underlying || null,
            }));
            // CB loaded from API
            // Cache in storage
            if (storageAvailable()) {
              try { await window.storage.set(`cb:v2:${ticker.toUpperCase()}`, JSON.stringify(txns), true); } catch(e) {}
            }
          }
        }
      } catch(e) { console.warn("CB API error:", e); }
    }
    // Auto-fix data errors
    const { txns: cleaned, fixed } = sanitizeTransactions(txns);
    if (fixed && storageAvailable()) {
      try { await window.storage.set(`cb:v2:${ticker.toUpperCase()}`, JSON.stringify(cleaned), true); } catch(e) {}
    }
    return cleaned;
  }, []);

  // Save transactions for a ticker to shared storage
  const saveTransactions = useCallback(async (ticker, txns) => {
    if (!storageAvailable() || !ticker) return;
    try {
      await window.storage.set(`cb:v2:${ticker.toUpperCase()}`, JSON.stringify(txns), true);
    } catch(e) { console.warn("CB save error:", e); }
  }, []);

  // Load transactions when entering cost basis view OR analysis view
  // 2026-05-02: also fire en analysis (cuando se abre la sub-tab "Cost Basis"
  // dentro de cada empresa). Sin esto la 2ª pestaña aparecía vacía.
  useEffect(() => {
    const activeTicker = viewMode === "costbasis" ? cbTicker
                       : viewMode === "analysis" ? (cfg?.ticker || "").toUpperCase()
                       : null;
    if (!activeTicker) return;
    setCbLoading(true);
    loadTransactions(activeTicker).then(txns => {
      setCbTransactions(txns);
      setCbLoading(false);
      // Tambien sincroniza cbTicker para que CostBasisView use el ticker correcto
      if (viewMode === "analysis" && cbTicker !== activeTicker) {
        setCbTicker(activeTicker);
      }
    });
  }, [viewMode, cbTicker, cfg?.ticker, loadTransactions]);

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

  const portfolioList = useMemo(() => Object.entries(positions).filter(([,v])=>v.list==="portfolio"&&(v.shares>0||v.sh>0)).map(([k,v])=>({ticker:k,...v})), [positions]);
  const watchlistList = useMemo(() => Object.entries(positions).filter(([,v])=>v.list==="watchlist").map(([k,v])=>({ticker:k,...v})), [positions]);
  
  // Historical positions: from DB holdings + POS_STATIC entries marked as historial
  const [historialList, setHistorialList] = useState([]);
  useEffect(() => {
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
    // Merge smart: static provides shares/basis/currency, DB provides
    // totalDivs/totalOptCredit/txnCount (the whole point of the historial tab).
    // Previous version ignored DB data when a static entry existed → all values
    // shown as "—". (2026-04-18 fix.)
    const dbIndex = Object.fromEntries(fromDB.map(h => [h.ticker, h]));
    const staticIndex = Object.fromEntries(fromStatic.map(s => [s.ticker, s]));
    const allTickers = new Set([...fromStatic.map(s => s.ticker), ...fromDB.map(h => h.ticker)]);
    const merged = [...allTickers].map(t => {
      const s = staticIndex[t];
      const d = dbIndex[t];
      return {
        ticker: t,
        name: s?.name || d?.name || t,
        shares: s?.shares ?? d?.shares ?? 0,
        adjustedBasis: s?.adjustedBasis ?? 0,
        totalDivs: d?.totalDivs ?? 0,
        totalOptCredit: d?.totalOptCredit ?? 0,
        txnCount: d?.txnCount ?? 0,
        pnlAbs: s?.pnlAbs ?? 0,
        currency: s?.currency || d?.currency || "USD",
        hasCB: true,
        list: "historial",
      };
    });
    setHistorialList(merged);
  }, [HIST_INIT, D1_POSITIONS]);
  
  // ── Dividend Log (replaces DIVIDENDOS Google Sheet) ──
  const [divLog, setDivLog] = useState([]);
  const [divLoading, setDivLoading] = useState(false);
  const [divShowForm, setDivShowForm] = useState(false);
  const [divForm, setDivForm] = useState({date:"",ticker:"",company:"",gross:0,taxPct:30,net:0,currency:"USD",fx:1,broker:"IB",shares:0,dps:0,note:""});
  const [divFilter, setDivFilter] = useState({year:"all",month:"all",ticker:""});
  const [divSort, setDivSort] = useState({col:"date",asc:false});
  const [fireCcy, setFireCcy] = useState("EUR"); // EUR or USD toggle for FIRE tab
  const [fireGastosYear, setFireGastosYear] = useState("");
  const [researchOpenList, setResearchOpenList] = useState(null);
  const [researchAdvanced, setResearchAdvanced] = useState(false);
  const [researchHide, setResearchHide] = useState({});
  const [researchCapFilter, setResearchCapFilter] = useState("all");
  const [reportData, setReportData] = useState(null);
  const [priceChartData, setPriceChartData] = useState(null);
  const [priceChartTicker, setPriceChartTicker] = useState(null);
  useEffect(() => {
    if (!cfg?.ticker || cfg.ticker === priceChartTicker) return;
    setPriceChartTicker(cfg.ticker);
    setPriceChartData(null);
    fetch(`${API_URL}/api/price-history?symbol=${encodeURIComponent(cfg.ticker)}`)
      .then(r=>r.json()).then(d => { if(Array.isArray(d) && d.length > 0) setPriceChartData(d.reverse()); })
      .catch(e => console.error("Price chart fetch error:", e));
  }, [cfg?.ticker, priceChartTicker]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSymbol, setReportSymbol] = useState(null);

  const openReport = useCallback(async (sym) => {
    setReportSymbol(sym);
    setReportLoading(true);
    setReportData(null);
    try {
      const resp = await fetch(`${API_URL}/api/report?symbol=${sym}`);
      if (resp.ok) setReportData(await resp.json());
      else console.error("Report fetch failed:", resp.status);
    } catch(e) { console.error("Report fetch error:", e); }
    setReportLoading(false);
  }, []);
  const closeReport = () => { setReportSymbol(null); setReportData(null); };
  const [divCalYear, setDivCalYear] = useState(new Date().getFullYear().toString());
  
  const loadDivLog = useCallback(async () => {
    if (_DIV_ENTRIES.length > 0) { setDivLog(_DIV_ENTRIES); return; }
    if (!storageAvailable()) { setDivLog([]); return; }
    setDivLoading(true);
    try {
      const result = await window.storage.get("dividends:log", true);
      if (result?.value) {
        const stored = JSON.parse(result.value);
        if (stored.length > 0) { setDivLog(stored); setDivLoading(false); return; }
      }
    } catch(e) {}
    setDivLog(_DIV_ENTRIES);
    setDivLoading(false);
  }, [dataLoaded, _DIV_ENTRIES]);
  
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
  
  // ── Screener loader ──
  const loadScreener = useCallback(async () => {
    setScreenerLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/screener`);
      if (resp.ok) setScreenerData(await resp.json());
    } catch(e) { console.error(e); }
    setScreenerLoading(false);
  }, []);
  const runBulkFetch = useCallback(async (symbols) => {
    setBulkLoading(true);
    setBulkProgress(`Descargando fundamentales de ${symbols.length} empresas...`);
    try {
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
      const resp = await fetch(`${API_URL}/api/screener`);
      if (resp.ok) setScreenerData(await resp.json());
      setBulkProgress("");
    } catch(e) { setBulkProgress("Error: " + e.message); }
    setBulkLoading(false);
  }, []);
  useEffect(() => {
    if ((homeTab === "screener" || homeTab === "research" || homeTab === "advisor") && !screenerData && !screenerLoading) loadScreener();
  }, [homeTab, screenerData, screenerLoading, loadScreener]);

  // Load dividends when tab opens OR when data first loads from API
  useEffect(() => {
    if (dataLoaded && divLog.length === 0) loadDivLog();
  }, [dataLoaded, loadDivLog]);
  useEffect(() => {
    if ((homeTab === "dividendos" || homeTab === "fire") && divLog.length === 0) loadDivLog();
  }, [homeTab, divLog.length, loadDivLog]);
  
  // Auto-sync dividendos → cost_basis (background, once per session)
  useEffect(() => {
    if (!dataLoaded || divLog.length === 0) return;
    const syncKey = 'div-sync-' + new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(syncKey)) return; // Already synced today
    sessionStorage.setItem(syncKey, '1');
    fetch(`${API_URL}/api/costbasis/sync-dividends`, { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.inserted > 0) console.log(`[Sync] ${d.inserted} dividendos → cost_basis`); })
      .catch(e => console.error('[Sync dividends]', e));
  }, [dataLoaded, divLog.length]);

  // ── Gastos Log (replaces GASTOS Google Sheets) ──
  const [gastosLog, setGastosLog] = useState([]);
  const [gastosLoading, setGastosLoading] = useState(false);
  const [gastosShowForm, setGastosShowForm] = useState(false);
  const [gastosForm, setGastosForm] = useState({date:new Date().toISOString().slice(0,10),cat:"Comidas y Cenas",amount:0,currency:"EUR",recur:false,detail:"",tipo:"normal",secreto:false});
  const [gastosFilter, setGastosFilter] = useState({year:"all",cat:"all",month:"all",ccy:"all",search:"",tipo:"all",showSecretos:false});
  const [gastosSort, setGastosSort] = useState({col:"date",asc:false});
  
  const GASTO_CAT_LIST = ["Alquiler","Casa","Hipoteca","Utilities","Utilities China","Supermercado","Restaurante","Transporte","Barco","Suscripciones","Salud","Masajes","Deportes","Ropa","Caprichos","Viajes","Ocio","Educacion","Bolsa","Regalos","Otros"];
  
  const CAT_TO_CODE = {"Supermercado":"SUP","Restaurante":"COM","Transporte":"TRA","Ropa":"ROP","Salud":"HEA","Suscripciones":"SUB","Bolsa":"SBL","Caprichos":"CAP","Deportes":"DEP","Utilities":"UTI","Utilities China":"UCH","Barco":"BAR","Masajes":"MAS","Regalos":"REG","Viajes":"VIA","Alquiler":"ALQ","Ocio":"ENT","Hipoteca":"HIP","Casa":"HOM","Educacion":"EDU","Otros":"OTH"};

  const CODE_TO_CAT_G = {SUP:"Supermercado",COM:"Restaurante",TRA:"Transporte",ROP:"Ropa",HEA:"Salud",SUB:"Suscripciones",CAP:"Caprichos",DEP:"Deportes",UTI:"Utilities",BAR:"Barco",MAS:"Masajes",SBL:"Bolsa",UCH:"Utilities China",COC:"Transporte",REG:"Regalos",VIA:"Viajes",MED:"Salud",ALQ:"Alquiler",ENT:"Ocio",HIP:"Hipoteca",HOM:"Casa",EDU:"Educacion",AVI:"Aviacion",ING:"Ingreso",OTH:"Otros"};
  const parseGastosApi = (data) => data.map(g => ({
    id: g.id, date: g.fecha, cat: CODE_TO_CAT_G[g.categoria] || g.categoria,
    catCode: g.categoria, amount: g.importe, currency: g.divisa || "EUR",
    tipo: (g.descripcion||"").includes("{china}") ? "china" : (g.descripcion||"").includes("{extra}") ? "extra" : "normal",
    secreto: (g.descripcion||"").includes("{secreto}"),
    detail: (g.descripcion||"").replace(/\{china\}\s?/g,"").replace(/\{extra\}\s?/g,"").replace(/\{secreto\}\s?/g,"").replace(/^\[.*?\]\s*/,""),
    recur: false,
  }));

  const loadGastos = useCallback(async (forceApi) => {
    if (!forceApi) {
      if (_GASTO_ENTRIES.length > 0) { setGastosLog(_GASTO_ENTRIES); return; }
    }
    setGastosLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/gastos`);
      if (resp.ok) setGastosLog(parseGastosApi(await resp.json()));
    } catch(e) { if (!forceApi) setGastosLog(_GASTO_ENTRIES); }
    setGastosLoading(false);
  }, [dataLoaded, _GASTO_ENTRIES]);

  const addGasto = useCallback(async (entry) => {
    const tipoPrefix = entry.tipo === "china" ? "{china} " : entry.tipo === "extra" ? "{extra} " : "";
    const secretoPrefix = entry.secreto ? "{secreto} " : "";
    const amt = entry.isIngreso ? Math.abs(entry.amount) : -Math.abs(entry.amount);
    const desc = secretoPrefix + tipoPrefix + (entry.detail||"");
    const catCode = CAT_TO_CODE[entry.cat] || entry.cat;
    try {
      await fetch(`${API_URL}/api/gastos`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({fecha:entry.date, categoria:catCode, importe:amt, divisa:entry.currency, descripcion:desc})
      });
    } catch(e) { console.error(e); }
    setGastosShowForm(false);
    loadGastos(true);
  }, [loadGastos]);

  const deleteGasto = useCallback(async (id) => {
    setGastosLog(prev => prev.filter(g => g.id !== id));
    try {
      await fetch(`${API_URL}/api/gastos/${id}`, {method:"DELETE"});
      loadGastos(true);
    } catch(e) { console.error(e); }
  }, [loadGastos]);

  useEffect(() => {
    if (dataLoaded && gastosLog.length === 0) loadGastos();
  }, [dataLoaded, loadGastos]);
  useEffect(() => {
    if ((homeTab === "gastos" || homeTab === "presupuesto") && gastosLog.length === 0) loadGastos();
  }, [homeTab, gastosLog.length, loadGastos]);
  
  // ── Control Mensual (monthly patrimony snapshots) ──
  const [ctrlLog, setCtrlLog] = useState(() => CTRL_DATA);
  const [ctrlShowForm, setCtrlShowForm] = useState(false);
  const [ctrlForm, setCtrlForm] = useState({date:"",fx:1.1,fxCny:0,bankinter:0,bcCaminos:0,constructionBankCny:0,revolut:0,otrosBancos:0,ibUsd:0,tsUsd:0,tastyUsd:0,fondos:0,salaryUsd:0,salaryCny:0,goldGrams:0,goldPrice:0,btcAmount:0,btcPrice:0});
  const [ctrlEditId, setCtrlEditId] = useState(null);

  // Refresh ctrlLog when API data arrives
  useEffect(() => {
    if (dataLoaded && CTRL_DATA.length > 0) {
      setCtrlLog(CTRL_DATA);
    }
  }, [dataLoaded]);

  const reloadCtrlFromApi = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/patrimonio`);
      if (!res.ok) return;
      const patrimonio = await res.json();
      const fresh = patrimonio.map(p => {
        // Parse breakdown_json si existe — desglose por banco/broker individual.
        // Snapshots legacy no lo tienen; el totals agregado (bk, br) sigue siendo autoritativo.
        let breakdown = {};
        if (p.breakdown_json) {
          try { breakdown = JSON.parse(p.breakdown_json) || {}; } catch { breakdown = {}; }
        }
        return {
          id: p.id, d: p.fecha, fx: p.fx_eur_usd, bk: p.bank, br: p.broker, fd: p.fondos,
          cr: p.crypto, hp: p.hipoteca, pu: p.total_usd, pe: p.total_eur, sl: p.salary,
          constructionBankCny: p.construction_bank_cny||0, fxCny: p.fx_eur_cny||0,
          salaryUsd: p.salary_usd||0, salaryCny: p.salary_cny||0,
          goldGrams: p.gold_grams||0, goldEur: p.gold_eur||0,
          btcAmount: p.btc_amount||0, btcEur: p.btc_eur||0,
          // Desglose persistido — solo si el snapshot lo tiene. Undefined en legacy.
          bankinter: breakdown.bankinter,
          bcCaminos: breakdown.bcCaminos,
          revolut: breakdown.revolut,
          otrosBancos: breakdown.otrosBancos,
          ibUsd: breakdown.ibUsd,
          tsUsd: breakdown.tsUsd,
          tastyUsd: breakdown.tastyUsd,
          fondos: breakdown.fondos,
          hasBreakdown: !!p.breakdown_json,
        };
      });
      setCtrlLog(fresh);
    } catch(e) { console.error('Reload patrimonio error:', e); }
  }, []);

  const loadCtrlLog = useCallback(async () => {
    if (CTRL_DATA.length > 0) { setCtrlLog(CTRL_DATA); return; }
    await reloadCtrlFromApi();
  }, [reloadCtrlFromApi]);
  
  const addCtrlEntry = useCallback(async (entry, editId) => {
    const fx = entry.fx || 1;
    const fxCny = entry.fxCny || 1;
    // Construction Bank: CNY → EUR
    const cbEur = fxCny > 0 ? (entry.constructionBankCny || 0) / fxCny : 0;
    const totalBancos = (entry.bankinter||0) + (entry.bcCaminos||0) + cbEur + (entry.revolut||0) + (entry.otrosBancos||0);
    const totalBrokersUsd = (entry.ibUsd||0) + (entry.tsUsd||0) + (entry.tastyUsd||0);
    // Gold + BTC values in EUR
    const goldEur = (entry.goldGrams||0) * (entry.goldPrice||0);
    const btcEur = (entry.btcAmount||0) * (entry.btcPrice||0);
    // Totals
    const totalEur = totalBancos + (entry.fondos||0) + goldEur + btcEur + totalBrokersUsd / fx;
    const totalUsd = totalEur * fx;

    // breakdown_json preserva el desglose individual (bankinter, bcCaminos, etc.)
    // para que al editar un snapshot, el formulario reconstruya exactamente
    // lo que el usuario introdujo — no solo los totales agregados.
    const breakdown = {
      bankinter: entry.bankinter || 0,
      bcCaminos: entry.bcCaminos || 0,
      revolut: entry.revolut || 0,
      otrosBancos: entry.otrosBancos || 0,
      ibUsd: entry.ibUsd || 0,
      tsUsd: entry.tsUsd || 0,
      tastyUsd: entry.tastyUsd || 0,
      fondos: entry.fondos || 0,
    };
    const apiBody = {
      fecha: entry.date, fx_eur_usd: fx, bank: totalBancos, broker: totalBrokersUsd,
      fondos: entry.fondos||0, crypto: 0, hipoteca: 0,
      total_usd: Math.round(totalUsd), total_eur: Math.round(totalEur),
      salary: (entry.salaryUsd||0) / fx + (entry.salaryCny||0) / fxCny, notas: '',
      construction_bank_cny: entry.constructionBankCny||0, fx_eur_cny: fxCny,
      salary_usd: entry.salaryUsd||0, salary_cny: entry.salaryCny||0,
      gold_grams: entry.goldGrams||0, gold_eur: goldEur,
      btc_amount: entry.btcAmount||0, btc_eur: btcEur,
      breakdown_json: breakdown,
    };

    try {
      if (editId) {
        await fetch(`${API_URL}/api/patrimonio/${editId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(apiBody) });
      } else {
        await fetch(`${API_URL}/api/patrimonio`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(apiBody) });
      }
    } catch(e) { console.error('Save patrimonio error:', e); }

    // Re-fetch from API to get the real saved data
    await reloadCtrlFromApi();
    setCtrlShowForm(false);
    setCtrlEditId(null);
  }, [reloadCtrlFromApi]);
  
  const deleteCtrlEntry = useCallback(async (id) => {
    // Delete from D1 database
    try {
      await fetch(`${API_URL}/api/patrimonio/${id}`, { method: 'DELETE' });
    } catch(e) { console.error('Delete patrimonio error:', e); }
    // Update local state
    setCtrlLog(prev => {
      const next = prev.filter(c => c.id !== id);
      if (storageAvailable()) window.storage.set("control:log", JSON.stringify(next), true).catch(()=>{});
      return next;
    });
  }, []);
  
  useEffect(() => {
    if (homeTab === "control" || homeTab === "patrimonio") loadCtrlLog();
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

  // Build IB position lookup
  // IB ticker → App ticker mapping (IB uses different symbols for some)
  const IB_TICKER_MAP = {
    "VIS":"BME:VIS","AMS":"BME:AMS","IIPR PRA":"IIPR-PRA",
    "9618":"HKG:9618","1052":"HKG:1052","2219":"HKG:2219","1910":"HKG:1910","9616":"HKG:9616",
    "CMCSA":"CMCSA","ITRK":"ITRK","ENG":"ENG",
  };
  const ibPositionMap = useMemo(() => {
    const map = {};
    if (ibData.loaded && ibData.positions.length) {
      ibData.positions.forEach(p => {
        if (!p.ticker) return;
        const appTicker = IB_TICKER_MAP[p.ticker] || p.ticker;
        // Merge positions with same ticker across accounts
        if (map[appTicker]) {
          map[appTicker] = {
            ...map[appTicker],
            shares: (map[appTicker].shares || 0) + (p.shares || 0),
            mktValue: (map[appTicker].mktValue || 0) + (p.mktValue || 0),
            unrealizedPnl: (map[appTicker].unrealizedPnl || 0) + (p.unrealizedPnl || 0),
            mktPrice: p.mktPrice || map[appTicker].mktPrice,
          };
        } else {
          map[appTicker] = { ...p, ticker: appTicker };
        }
      });
    }
    return map;
  }, [ibData.positions, ibData.loaded]);

  // Auto-add IB positions > $500 that aren't in portfolio (once per day)
  useEffect(() => {
    if (!ibData.loaded || !ibData.positions.length || !portfolioList.length) return;
    const addKey = 'ib-auto-add-' + new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(addKey)) return;
    sessionStorage.setItem(addKey, '1');
    const appTickers = new Set(portfolioList.map(p => p.ticker));
    const newPositions = ibData.positions
      .filter(p => p.assetClass === "STK" && Math.abs(p.mktValue) > 500 && p.mktPrice > 0)
      .map(p => ({ ...p, ticker: IB_TICKER_MAP[p.ticker] || p.ticker }))
      .filter(p => !appTickers.has(p.ticker));

    // Deduplicate by ticker (same stock in multiple accounts)
    const unique = {};
    newPositions.forEach(p => {
      if (!unique[p.ticker]) unique[p.ticker] = p;
      else unique[p.ticker].shares = (unique[p.ticker].shares||0) + (p.shares||0);
    });

    Object.values(unique).forEach(p => {
      if (!appTickers.has(p.ticker)) {
        updatePosition(p.ticker, { list: "portfolio", shares: p.shares||0, avgCost: p.avgCost||0, name: p.name||p.ticker, lastPrice: p.mktPrice||0 });
        appTickers.add(p.ticker);
      }
    });
    // H4 fix: depend on the actual ticker set, not just the count, so swaps re-trigger.
  }, [ibData.loaded, ibData.positions.length, portfolioList.map(p => p.ticker).join(',')]);

  const portfolioComputed = useMemo(() => {
    return portfolioList.map(p => {
      const ib = ibPositionMap[p.ticker];
      let valueUSD, costTotalUSD, pnlUSD, pnlPct, divAnnualUSD, dataSource;

      if (ib && ib.mktPrice > 0) {
        // IB returns values in local currency — convert to USD
        const ibCcy = ib.currency || "USD";
        const ibFx = ibCcy === "USD" ? 1 : (fxRates?.[ibCcy] ? 1 / fxRates[ibCcy] : (p.fx || 1));
        valueUSD = (ib.mktValue || 0) * (ibCcy === "USD" ? 1 : ibFx);
        costTotalUSD = (ib.avgCost || 0) * (ib.shares || 0) * (ibCcy === "USD" ? 1 : ibFx);
        pnlUSD = (ib.unrealizedPnl || 0) * (ibCcy === "USD" ? 1 : ibFx);
        pnlPct = costTotalUSD !== 0 ? pnlUSD / Math.abs(costTotalUSD) : 0;
        // DPS: LIVE_DPS now returns USD (bruto_usd), only fallback divTTM needs FX conversion
        const liveDps = LIVE_DPS[p.ticker];
        if (liveDps?.dps) {
          const divCcy = liveDps.currency || 'USD';
          divAnnualUSD = divCcy === 'USD'
            ? liveDps.dps * (ib.shares || p.shares || 0)
            : toUSD(liveDps.dps * (ib.shares || p.shares || 0), divCcy);
        } else {
          const divCcyIB = p.currency || ibCcy || "USD";
          divAnnualUSD = toUSD((p.divTTM || 0) * (ib.shares || p.shares || 0), divCcyIB);
        }
        dataSource = "IB";
      } else {
        // FMP fallback
        valueUSD = p.usdValue || 0;
        costTotalUSD = p.totalInvertido || 0;
        pnlUSD = valueUSD - costTotalUSD;
        pnlPct = p.pnlPct || (costTotalUSD !== 0 ? pnlUSD / Math.abs(costTotalUSD) : 0);
        // DPS: LIVE_DPS now returns USD (bruto_usd), only fallback divTTM needs FX conversion
        const liveDpsFMP = LIVE_DPS[p.ticker];
        if (liveDpsFMP?.dps) {
          const divCcy = liveDpsFMP.currency || 'USD';
          divAnnualUSD = divCcy === 'USD'
            ? liveDpsFMP.dps * (p.shares || 0)
            : toUSD(liveDpsFMP.dps * (p.shares || 0), divCcy);
        } else {
          const divCcyFMP = p.currency || "USD";
          divAnnualUSD = toUSD((p.divTTM || 0) * (p.shares || 0), divCcyFMP);
        }
        dataSource = "FMP";
      }

      const valueEUR = toEUR(valueUSD);
      const costTotalEUR = toEUR(costTotalUSD);
      const divAnnualEUR = toEUR(divAnnualUSD);
      const ccy = p.currency || "USD";
      const shares = ib?.shares || p.shares || 0;
      const lastPrice = ib?.mktPrice || p.lastPrice || 0;

      // Dynamic yield — computed at runtime from current price/value, not stale D1
      const divYield = valueUSD > 0 && divAnnualUSD > 0 ? divAnnualUSD / valueUSD : 0;

      return {
        ...p, ccy, dataSource,
        shares, lastPrice,
        adjustedBasis: ib?.avgCost || p.adjustedBasis || p.avgCost || 0,
        avgCost: ib?.avgCost || p.avgCost || 0,
        priceUSD: ccy === "USD" ? lastPrice : (valueUSD / (shares || 1)),
        costUSD: costTotalUSD / (shares || 1),
        valueUSD, costTotalUSD, divAnnualUSD,
        pnlUSD, pnlPct,
        valueEUR, costTotalEUR, divAnnualEUR,
        divYield,
        ibPnl: ib?.unrealizedPnl ?? null,
        ibAvgCost: ib?.avgCost ?? null,
      };
    });
  }, [portfolioList, toUSD, toEUR, ibPositionMap, fxRates, LIVE_DPS]);

  // Compute discrepancies separately (not inside useMemo with setState)
  const ibDiscrepancies = useMemo(() => {
    if (!ibPositionMap || !Object.keys(ibPositionMap).length) return [];
    const disc = [];
    portfolioComputed.forEach(p => {
      const ib = ibPositionMap[p.ticker];
      if (ib && ib.mktPrice > 0 && p.lastPrice > 0) {
        const fmpPrice = p.lastPrice;
        const ibPrice = ib.mktPrice;
        if (Math.abs(ibPrice - fmpPrice) / fmpPrice > 0.02) {
          disc.push({ ticker: p.ticker, ibPrice, fmpPrice, diff: ((ibPrice - fmpPrice) / fmpPrice * 100).toFixed(1) });
        }
      }
    });
    return disc;
  }, [portfolioComputed, ibPositionMap]);

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

  // ── Deferred code (needs portfolioList + portfolioTotals + ibData) ──

  // Live price refresh (uses portfolioList — must be after its declaration)
  // Includes ALL tickers (foreign with ":"), handles GBX conversion, recalculates USD values
  const refreshLivePrices = useCallback(async () => {
    try {
      const tickers = portfolioList.map(p => p.ticker).join(",");
      if (!tickers) return;
      const r = await fetch(`${API_URL}/api/prices?tickers=${tickers}&live=1`);
      const d = await r.json();
      if (d.prices) {
        setPositions(prev => {
          const updated = { ...prev };
          for (const [ticker, priceInfo] of Object.entries(d.prices)) {
            if (updated[ticker] && priceInfo?.price) {
              const p = updated[ticker];
              const newPrice = priceInfo.price;
              const shares = p.shares || 0;
              const ccy = p.currency || "USD";
              const fx = p.fx || 1;
              // Recalculate USD value with proper FX and GBX handling
              const newUsdValue = ccy === "USD" ? newPrice * shares
                : ccy === "GBX" ? (newPrice / 100) * shares * fx
                : newPrice * shares * fx;
              const totalInvested = p.totalInvertido || (p.avgCost || 0) * shares * (ccy === "USD" ? 1 : fx);
              const pnlAbs = newUsdValue - totalInvested;
              const pnlPct = totalInvested > 0 ? (pnlAbs / totalInvested) : 0;
              updated[ticker] = {
                ...p,
                lastPrice: newPrice,
                usdValue: newUsdValue,
                marketValue: newPrice * shares,
                pnlAbs, pnlPct,
                dayChange: priceInfo.changePct || 0,
                dayChangeAbs: priceInfo.change || 0,
                priceUpdated: true,
              };
            }
          }
          return updated;
        });
      }
    } catch {}
  }, [portfolioList]);

  // Auto-refresh live prices every 10 seconds (skip when offline)
  useEffect(() => {
    if (!dataLoaded || !portfolioList.length || isOffline) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refreshLivePrices();
    }, 10000);
    return () => clearInterval(interval);
    // refreshLivePrices already depends on portfolioList ref, so the interval restarts on real changes.
  }, [dataLoaded, refreshLivePrices, isOffline]);

  // Request notification permission + Web Push subscription
  // Uses dedicated /sw-push.js (push-only, no fetch handler) registered with
  // explicit scope '/' so iOS PWA can subscribe without re-introducing the
  // blank-screen race that previously killed the main fetch SW.
  useEffect(() => {
    if (!("Notification" in window)) return;
    const subscribeToPush = async () => {
      try {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        if (Notification.permission !== "granted") return;
        if (!navigator.serviceWorker) return;

        // Register the push-only SW (no-op if already registered)
        let reg = await navigator.serviceWorker.getRegistration('/sw-push.js');
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
        }
        // Wait until it's active
        if (reg.installing || reg.waiting) {
          await new Promise(resolve => {
            const sw = reg.installing || reg.waiting;
            sw.addEventListener('statechange', () => { if (sw.state === 'activated') resolve(); });
          });
        }
        if (!reg.pushManager) return;

        // Skip if we already have a valid subscription stored locally
        const existing = await reg.pushManager.getSubscription();
        if (existing && localStorage.getItem("push-subscribed")) return;

        const VAPID_PUBLIC_KEY = "BLLKOH7cSIdsowyE_S1fK3fMsuZdq1QurvmoWq-Dg_CPd8XqrrhFtw4TK7DJtBM0PHPmfdh1-RToDFFXC5sMTv0";
        const urlBase64ToUint8Array = (base64String) => {
          const padding = "=".repeat((4 - base64String.length % 4) % 4);
          const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
          const raw = atob(base64);
          return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
        };
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        await fetch(`${API_URL}/api/push-subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        localStorage.setItem("push-subscribed", "1");
      } catch (err) {
        console.warn("Push subscription failed:", err);
      }
    };
    setTimeout(subscribeToPush, 3000);
  }, []);

  // Load alerts on startup
  useEffect(() => {
    if (!dataLoaded) return;
    fetch(`${API_URL}/api/alerts`).then(r => r.json()).then(d => {
      setAlerts(d.alerts || []);
      setAlertsUnread(d.unread || 0);
    }).catch(e => console.error('[Alerts load]', e));
  }, [dataLoaded]);

  // Dividend streak data (loaded once per day)
  useEffect(() => {
    if (!portfolioList.length) return;
    const streakKey = 'div-streak-' + new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(streakKey)) {
      try { setDivStreaks(JSON.parse(sessionStorage.getItem(streakKey + '-data')) || {}); } catch {}
      return;
    }
    const usTickers = portfolioList.map(p => p.ticker); // Worker FMP_MAP handles foreign tickers
    if (!usTickers.length) return;
    const loadBatch = async () => {
      const all = {};
      for (let i = 0; i < usTickers.length; i += 30) {
        const batch = usTickers.slice(i, i + 30);
        try {
          const r = await fetch(`${API_URL}/api/dividend-streak?symbols=${batch.join(",")}`);
          const d = await r.json();
          Object.assign(all, d);
        } catch {}
      }
      setDivStreaks(all);
      sessionStorage.setItem(streakKey, '1');
      try { sessionStorage.setItem(streakKey + '-data', JSON.stringify(all)); } catch {}
    };
    loadBatch();
    // H4 fix: a swap (e.g. SELL one, BUY another) keeps length but changes tickers.
  }, [portfolioList.map(p => p.ticker).join(',')]);

  // Smart Money holders — bulk fetch for every portfolio ticker once per day.
  // The /api/funds/by-tickers endpoint returns a map { ticker: [holders] },
  // so one request covers the whole 84-position portfolio.
  useEffect(() => {
    if (!portfolioList.length) return;
    const smKey = 'smart-money-' + new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(smKey)) {
      try { setSmartMoneyHolders(JSON.parse(sessionStorage.getItem(smKey + '-data')) || {}); } catch {}
      return;
    }
    const tickers = portfolioList.map(p => p.ticker).filter(Boolean);
    if (!tickers.length) return;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/funds/by-tickers?symbols=${encodeURIComponent(tickers.join(','))}`);
        const d = await r.json();
        const holders = d?.holders || {};
        setSmartMoneyHolders(holders);
        sessionStorage.setItem(smKey, '1');
        try { sessionStorage.setItem(smKey + '-data', JSON.stringify(holders)); } catch {}
      } catch {}
    })();
  }, [portfolioList.map(p => p.ticker).join(',')]);

  // Open Q/S drill-down modal — fetch detailed history
  const openScoresModal = useCallback(async (ticker) => {
    setScoresModalTicker(ticker);
    setScoresModalData(null);
    try {
      const r = await fetch(`${API_URL}/api/scores/${encodeURIComponent(ticker)}`);
      const d = await r.json();
      setScoresModalData(d);
    } catch (e) {
      setScoresModalData({ error: e.message });
    }
  }, []);

  // Auto-run alert checks after IB data + prices loaded
  useEffect(() => {
    if (!ibData.loaded || !portfolioList.length) return;
    const alertKey = 'alerts-check-' + new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(alertKey)) return;
    sessionStorage.setItem(alertKey, '1');
    const pos = (portfolioTotals.positions || []).map(p => ({
      ticker: p.ticker, shares: p.shares, lastPrice: p.lastPrice, dayChange: p.dayChange || 0,
    }));
    const ibOptions = (ibData.positions || []).filter(p => p.assetClass === "OPT");
    fetch(`${API_URL}/api/alerts-check`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions: pos, ibOptions, nlv: ibData.summary?.nlv?.amount || 0, margin: ibData.summary?.initMargin?.amount || 0 }),
    }).then(r => r.json()).then(d => {
      if (d.alerts?.length) {
        setAlerts(prev => [...d.alerts.map(a => ({ ...a, fecha: new Date().toISOString().slice(0,10), leida: 0 })), ...prev]);
        setAlertsUnread(prev => prev + (d.inserted || 0));
        if ("Notification" in window && Notification.permission === "granted" && d.inserted > 0) {
          new Notification(`A&R: ${d.inserted} alertas`, { body: d.alerts.slice(0, 3).map(a => a.titulo).join("\n") });
        }
      }
    }).catch(() => {});
    // H4 fix: ticker set, not count, so swaps re-trigger alert checks.
  }, [ibData.loaded, portfolioList.map(p => p.ticker).join(',')]);

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
  const loadFromAPI = useCallback(async (tickerOverride, { forceRefresh = false } = {}) => {
    const t = (tickerOverride || cfg.ticker || "").trim().toUpperCase();
    if (!t) return;
    setFmpLoading(true); setFmpError(null);
    try {
      // Step 1: Load fundamentals from FMP (via worker, uses 24h cache unless forceRefresh)
      const data = await fetchViaFMP(t, { forceRefresh });
      // Merge fin data
      setFin(prev => {
        const merged = {...prev};
        YEARS.forEach(y => { merged[y] = {revenue:0,grossProfit:0,operatingIncome:0,netIncome:0,eps:0,dps:0,sharesOut:0,totalDebt:0,cash:0,equity:0,retainedEarnings:0,ocf:0,capex:0,interestExpense:0,depreciation:0,taxProvision:0}; });
        Object.keys(data.fin).forEach(y => { merged[parseInt(y, 10)] = data.fin[parseInt(y, 10)]; });
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
        grades: data.fmpGrades || {},
        ownerEarnings: data.fmpOwnerEarnings || [],
        revSegments: data.fmpRevSegments || [],
        geoSegments: data.fmpGeoSegments || [],
        peers: data.fmpPeers || [],
        earnings: data.fmpEarnings || [],
        ptSummary: data.fmpPtSummary || {},
        profile: data.profile || {},
      });

      // Update recent tickers
      const ticker = data.cfg.ticker || t;
      setRecentTickers(prev => {
        const next = [ticker, ...prev.filter(x => x !== ticker)].slice(0, 8);
        try { localStorage.setItem('ayr_recent', JSON.stringify(next)); } catch {}
        return next;
      });

      // Auto-populate Comparables from FMP Peers when comps are empty
      const peersList = data.fmpPeers || [];
      if (comps.length === 0 && peersList.length > 0) {
        const peerSymbols = peersList.slice(0, 6).map(p => p.symbol || p).filter(Boolean);
        if (peerSymbols.length > 0) {
          try {
            const prResp = await fetch(`${API_URL}/api/peer-ratios?symbols=${peerSymbols.join(",")}`);
            if (prResp.ok) {
              const peerRatios = await prResp.json();
              const autoComps = peerRatios.filter(p => p.name && (p.pe > 0 || p.evEbitda > 0)).map(p => ({
                name: `${p.name} (${p.symbol})`,
                pe: Math.round(p.pe * 10) / 10,
                evEbitda: Math.round(p.evEbitda * 10) / 10,
              }));
              if (autoComps.length > 0) setComps(autoComps);
            }
          } catch (e) { /* silently fail — user can still add manually */ }
        }
      }

      // Step 2: Generate qualitative report via Claude API (optional — skip if offline)
      let report = null;
      try {
        report = await generateReport(t, data.fin, data.cfg, data.profile || {});
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
            aiDisruptionLevel: report.aiDisruption?.riskLevel || "",
            aiDisruptionScore: report.aiDisruption?.score || 0,
            aiDisruptionThreats: report.aiDisruption?.threats || [],
            aiDisruptionDefenses: report.aiDisruption?.defenses || [],
            aiDisruptionAssessment: report.aiDisruption?.assessment || "",
            verdict: report.verdict?.action || "",
            verdictSummary: report.verdict?.summary || "",
            targetWeight: report.verdict?.targetWeight || "",
            overallScore: report.overallScore || 0,
            reportGenerated: new Date().toISOString(),
          }));
        }
      } catch { /* Report generation failed (offline?) — fundamentals still available */ }
      
      // Save to persistent storage
      const saveData = { fin: data.fin, cfg: data.cfg, comps, ssd, report, fmpExtra: { rating: data.fmpRating||{}, dcf: data.fmpDCF||{}, estimates: data.fmpEstimates||[], priceTarget: data.fmpPriceTarget||{}, keyMetrics: data.fmpKeyMetrics||[], finGrowth: data.fmpFinGrowth||[], grades: data.fmpGrades||{}, ownerEarnings: data.fmpOwnerEarnings||[], revSegments: data.fmpRevSegments||[], geoSegments: data.fmpGeoSegments||[], peers: data.fmpPeers||[], earnings: data.fmpEarnings||[], ptSummary: data.fmpPtSummary||{} } };
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
      Object.keys(saved.fin).forEach(y => { merged[parseInt(y, 10)] = saved.fin[parseInt(y, 10)]; });
      return merged;
    });
    if (saved.cfg) setCfg(prev => ({...prev, ...saved.cfg, riskFree: prev.riskFree, marketPremium: prev.marketPremium, taxRate: prev.taxRate, useWACC: prev.useWACC, manualDiscount: prev.manualDiscount, manualGrowth: prev.manualGrowth}));
    if (saved.comps) setComps(saved.comps);
    // Don't restore old ssd — auto-calc handles it. Only keep AI report fields.
    if (saved.ssd?.reportGenerated) setSsd(prev => ({...prev,
      moat: saved.ssd.moat||"", moatScore: saved.ssd.moatScore||0, moatExplanation: saved.ssd.moatExplanation||"",
      risks: saved.ssd.risks||[], catalysts: saved.ssd.catalysts||[], 
      aiDisruptionLevel: saved.ssd.aiDisruptionLevel||"", aiDisruptionScore: saved.ssd.aiDisruptionScore||0,
      aiDisruptionThreats: saved.ssd.aiDisruptionThreats||[], aiDisruptionDefenses: saved.ssd.aiDisruptionDefenses||[],
      aiDisruptionAssessment: saved.ssd.aiDisruptionAssessment||"",
      verdict: saved.ssd.verdict||"",
      verdictSummary: saved.ssd.verdictSummary||"", overallScore: saved.ssd.overallScore||0,
      reportGenerated: saved.ssd.reportGenerated,
    }));
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

  // Dynamic browser tab title
  useEffect(() => {
    document.title = viewMode === "analysis" && cfg.ticker
      ? `${cfg.ticker} — A&R`
      : viewMode === "costbasis" && cbTicker
        ? `${cbTicker} CB — A&R`
        : "A&R — Dividend Equity Analysis";
  }, [viewMode, cfg.ticker, cbTicker]);

  const upFin = useCallback((y,k,v)=>setFin(p=>({...p,[y]:{...p[y],[k]:parseFloat(v)||0}})),[]);
  const upCfg = useCallback((k,v)=>setCfg(p=>({...p,[k]:v})),[]);


  // ─── Analysis Metrics (extracted to hook) ────────────────────────────
  const {
    comp, wacc, piotroski, altmanZ, advancedMetrics, divAnalysis, dcf, dcfCalc,
    scoreItems, totalScore, L, LD, PD,
    DATA_YEARS, CHART_YEARS, chartLabels, latestDataYear, prevDataYear,
    marketCap, capLabel, discountRate, estimatedGrowth, revenueCAGR,
    roicWaccSpread, waterfall, growthCalc,
  } = useAnalysisMetrics({ fin, cfg, setSsd, fmpExtra });


  // When "Informe" or "DividendST" tab is selected, load report data
  useEffect(() => {
    if (viewMode === "analysis" && tab === "dst" && cfg?.ticker && reportSymbol !== cfg.ticker && !reportLoading) {
      openReport(cfg.ticker);
    }
  }, [tab, viewMode, cfg?.ticker, reportSymbol, reportLoading, openReport]);

  const _sec = {fontSize:13,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fd)",margin:"28px 0 12px",paddingBottom:6,borderBottom:"2px solid rgba(212,175,55,.2)"};

  // ── Analysis Context Value — all data needed by extracted tab components ──
  const analysisValue = useMemo(() => ({
    fin, cfg, comp, wacc, piotroski, altmanZ, dcf, dcfCalc, divAnalysis, ssd, advancedMetrics,
    scoreItems, totalScore, L, LD, PD, fmpExtra, priceChartData,
    DATA_YEARS, CHART_YEARS, chartLabels, latestDataYear, prevDataYear,
    marketCap, capLabel, discountRate, estimatedGrowth, revenueCAGR,
    roicWaccSpread, waterfall, growthCalc,
    comps, setComps, upFin, upCfg,
    fgMode, setFgMode, fgPE, setFgPE, fgGrowth, setFgGrowth,
    fgProjYears, setFgProjYears, showDiv, setShowDiv,
    reportData, reportLoading, reportSymbol, openReport,
    hide, hideN,
  }), [fin, cfg, comp, wacc, piotroski, altmanZ, dcf, dcfCalc, divAnalysis, ssd, advancedMetrics,
    scoreItems, totalScore, L, LD, PD, fmpExtra, priceChartData,
    DATA_YEARS, CHART_YEARS, chartLabels, latestDataYear, prevDataYear,
    marketCap, capLabel, discountRate, estimatedGrowth, revenueCAGR,
    roicWaccSpread, waterfall, growthCalc,
    comps, fgMode, fgPE, fgGrowth, fgProjYears, showDiv,
    reportData, reportLoading, reportSymbol, openReport,
    hide, hideN, upFin, upCfg]);

  const content = {
    dash:() => <DashTab />,
    chart:() => <ChartTab />,
    claude:() => <ClaudeTab />,
    data:() => <DataTab />,
    // Mega-tabs that consolidate the old single-purpose sub-tabs.
    // The 11 individual entries (quality/dividends/valuation/big5/tencap/
    // payback/mos/fastgraphs/weiss/checklist/growth/score) were removed
    // 2026-04-08 — they only existed in TABS_OLD which is now also gone.
    qualityAll:() => <div><div style={_sec}>Calidad del Negocio</div><QualityTab /><div style={_sec}>Crecimiento (CAGR)</div><GrowthTab /><div style={_sec}>Big Five — Rule #1</div><Big5Tab /></div>,
    debt:() => <DebtTab />,
    divAll:() => <div><div style={_sec}>Seguridad del Dividendo</div><DividendsTab /><div style={_sec}>Yield Bands — Weiss</div><WeissTab /></div>,
    valAll:() => <div><div style={_sec}>Múltiplos Actuales</div><ValuationTab /><DCFTab /><div style={_sec}>Margen de Seguridad (6 Métodos)</div><MOSTab /><div style={_sec}>FastGraphs — Proyección</div><FastGraphsTab /><div style={_sec}>10 Cap Rate</div><TenCapTab /><div style={_sec}>Payback Time</div><PaybackTab /></div>,
    fast:() => <FastTab />,
    verdict:() => <div><div style={_sec}>Checklist de Inversión</div><ChecklistTab /><div style={_sec}>Veredicto Final</div><ScoreTab /></div>,
    report:() => <ReportTab />,
    dst:() => <DSTTab />,
    options:() => <OptionsChainTab />,
    transcript:() => <TranscriptTab />,
    archive:() => <ArchiveTab />,
    business:() => <BusinessModelTab />,
    tesis:() => <TesisTab />,
    directiva:() => <DirectivaTab />,
    "cost-basis":() => <CostBasisView />,
  };


  // ── Scroll active tab into view ──
  useEffect(()=>{
    if(!tabsRef.current || viewMode!=="analysis") return;
    const active = tabsRef.current.querySelector('[data-active="true"]');
    if(active) active.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
  },[tab, viewMode]);

  // ── HOME VIEWS ──

  const CompanyRow = ({p, showPos, onOpen}) => {
    const rawCcy = p.ccy || p.currency || "USD";
    // GBX (pence) → show as GBP with /100 for display
    const ccy = rawCcy === "GBX" ? "GBP" : rawCcy;
    const isGBX = rawCcy === "GBX";
    const origSym = CURRENCIES[ccy]?.symbol || "$";
    const isForeign = ccy !== "USD";
    const priceUSD = p.priceUSD ?? 0;
    const costUSD = p.costUSD ?? 0;
    const valueUSD = p.valueUSD ?? 0;
    const valueEUR = p.valueEUR ?? 0;
    const weight = p.weight ?? 0;
    const pnlPct = p.pnlPct ?? 0;
    const dpsUSD = p.divAnnualUSD || ((p.divTTM || p.dps || 0) * (p.shares || 0));
    const showUSD = displayCcy === "USD";
    const valShow = showUSD ? valueUSD : valueEUR;
    const valSym = showUSD ? "$" : "€";
    const cc = getCountry(p.ticker, ccy);
    const capBadge = (() => {
      const mc = (p.mc||0)*1e9; const cat = p.cat||"";
      if (cat==="ETF") return {l:"ETF",bg:"rgba(191,90,242,.15)",c:"#bf5af2"};
      if (cat==="REIT") return {l:"REIT",bg:"rgba(100,210,255,.12)",c:"#64d2ff"};
      if (mc>=200e9) return {l:"MEGA",bg:"rgba(100,210,255,.1)",c:"rgba(100,210,255,.6)"};
      if (mc>=10e9) return {l:"LC",bg:"rgba(48,209,88,.08)",c:"rgba(48,209,88,.5)"};
      if (mc>=2e9) return {l:"MC",bg:"rgba(255,214,10,.08)",c:"rgba(255,214,10,.5)"};
      if (mc>=300e6) return {l:"SC",bg:"rgba(255,159,10,.1)",c:"rgba(255,159,10,.5)"};
      if (mc>0) return {l:"μC",bg:"rgba(255,69,58,.08)",c:"rgba(255,69,58,.5)"};
      return null;
    })();
    const badge = capBadge ? <span style={{fontSize:7,fontWeight:700,padding:"1px 4px",borderRadius:3,background:capBadge.bg,color:capBadge.c,letterSpacing:.3}}>{capBadge.l}</span> : null;
    return (
      <div className="ar-company-row" onClick={()=>onOpen(p.ticker)} style={{display:"grid",gridTemplateColumns:showPos?"24px 1fr 65px 48px 45px 50px 50px 45px 40px 58px 45px 24px":"24px 1fr 65px 65px 24px",gap:2,alignItems:"center",padding:"4px 6px",border:"1px solid var(--border)",borderRadius:7,cursor:"pointer"}}>
        {/* Logo with styled letter fallback */}
        <div style={{width:22,height:22,borderRadius:6,overflow:"hidden",background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <img src={`https://images.financialmodelingprep.com/symbol/${p.ticker.replace(':','.')}.png`} alt=""
            style={{width:22,height:22,objectFit:"contain",borderRadius:6}}
            onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
          <div style={{display:"none",width:22,height:22,borderRadius:6,background:`linear-gradient(135deg, ${(() => {const h = p.ticker.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % 360; return `hsl(${h},55%,45%), hsl(${h},55%,30%)`;})()})`,alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",fontFamily:"var(--fm)",letterSpacing:-.5,textShadow:"0 1px 2px rgba(0,0,0,.3)"}}>{p.ticker.charAt(0)}</div>
        </div>
        {/* Name: flag + name + ticker + badge + sparkline — all inline */}
        <div style={{minWidth:0,display:"flex",alignItems:"center",gap:3,overflow:"hidden"}}>
          <span style={{fontSize:13,flexShrink:0}}>{FLAGS[cc]||""}</span>
          <span style={{fontSize:11,fontWeight:600,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name||p.ticker}</span>
          <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",flexShrink:0}}>{p.ticker}</span>
          {badge}
          {p.dataSource==="IB" && <span style={{fontSize:6,fontWeight:700,padding:"1px 3px",borderRadius:3,background:"rgba(100,210,255,.1)",color:"#64d2ff",flexShrink:0}}>IB</span>}
          {divStreaks[p.ticker]?.streak >= 5 && <span style={{fontSize:6,fontWeight:700,padding:"1px 3px",borderRadius:3,background:divStreaks[p.ticker].streak>=25?"rgba(200,164,78,.15)":divStreaks[p.ticker].streak>=10?"rgba(48,209,88,.1)":"rgba(255,214,10,.08)",color:divStreaks[p.ticker].streak>=25?"var(--gold)":divStreaks[p.ticker].streak>=10?"var(--green)":"#ffd60a",flexShrink:0}} title={`${divStreaks[p.ticker].streak} años subiendo dividendo`}>{divStreaks[p.ticker].streak}y</span>}
          {/* Smart Money holders badge — click handled by row, shows count + managers on hover */}
          {smartMoneyHolders[p.ticker]?.length > 0 && (() => {
            const holders = smartMoneyHolders[p.ticker];
            const n = holders.length;
            const list = holders.slice(0, 8).map(h => `${h.fund_name} (${h.weight_pct?.toFixed(1)}%)`).join('\n');
            const bg = n >= 4 ? 'rgba(200,164,78,.18)' : n >= 2 ? 'rgba(48,209,88,.12)' : 'rgba(100,210,255,.1)';
            const col = n >= 4 ? 'var(--gold)' : n >= 2 ? 'var(--green)' : '#64d2ff';
            return <span style={{fontSize:6,fontWeight:700,padding:"1px 3px",borderRadius:3,background:bg,color:col,flexShrink:0}} title={`Smart Money: ${n} fondo${n>1?'s':''}\n${list}`}>⭐{n}</span>;
          })()}
          {p.notes && <span style={{fontSize:7,flexShrink:0,opacity:.5}} title={p.notes.length > 80 ? p.notes.slice(0,80)+'...' : p.notes}>📝</span>}
          {/* Sparkline inline — gradient fill + hover tooltip */}
          {(p.spark||[]).length >= 2 && (() => {
            const s = p.spark, mn = Math.min(...s), mx = Math.max(...s), r = mx-mn||1;
            const isUp = s[s.length-1]>=s[0];
            const col = isUp?"#30d158":"#ff453a";
            const uid = "sp_"+p.ticker.replace(/[^a-zA-Z0-9]/g,"");
            const pts = s.map((v,i)=>`${(i/(s.length-1))*40},${14-((v-mn)/r)*11}`).join(" ");
            const areaPts = `0,14 ${pts} 40,14`;
            return <svg viewBox="0 0 40 16" style={{width:40,height:14,flexShrink:0,marginLeft:"auto",opacity:.85,transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity=".85"}>
              <title>{`${s[0].toFixed(2)} → ${s[s.length-1].toFixed(2)} (${isUp?"+":""}${((s[s.length-1]-s[0])/s[0]*100).toFixed(1)}%)`}</title>
              <defs><linearGradient id={uid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".3"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
              <polygon points={areaPts} fill={`url(#${uid})`}/>
              <polyline points={pts} fill="none" stroke={col} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"/>
              <circle cx={(s.length-1)/(s.length-1)*40} cy={14-((s[s.length-1]-mn)/r)*11} r="1.5" fill={col}/>
            </svg>;
          })()}
        </div>
        {/* Price + 52w range */}
        <div style={{textAlign:"right",fontFamily:"var(--fm)"}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)"}}>{origSym}{(isGBX?(p.lastPrice||0)/100:(p.lastPrice||0)).toFixed(2)}</div>
          {p.fiftyTwoWeekHigh > 0 && p.fiftyTwoWeekLow > 0 && (() => {
            const lo = p.fiftyTwoWeekLow, hi = p.fiftyTwoWeekHigh, cur = p.lastPrice||0;
            const pct = hi > lo ? Math.min(Math.max((cur - lo) / (hi - lo), 0), 1) : 0.5;
            const barCol = pct > 0.7 ? "var(--green)" : pct < 0.3 ? "var(--red)" : "var(--gold)";
            return <div title={`52w: ${origSym}${lo.toFixed(2)} — ${origSym}${hi.toFixed(2)}`} style={{height:2,background:"var(--subtle-bg2)",borderRadius:1,marginTop:2,position:"relative",width:"100%"}}>
              <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct*100}%`,background:barCol,borderRadius:1,transition:"width .3s"}}/>
            </div>;
          })()}
        </div>
        {showPos && <>
          {/* Daily Change $ */}
          <div className="ar-hide-mobile" style={{textAlign:"right",fontFamily:"var(--fm)",fontSize:10,fontWeight:600,color:(p.dayChangeAbs||0)>=0?"var(--green)":"var(--red)"}}>
            {(p.dayChangeAbs||0)!==0 ? (p.dayChangeAbs>=0?"+":"")+_sf(p.dayChangeAbs,2) : "—"}
          </div>
          {/* Daily Change % */}
          <div style={{textAlign:"right",fontFamily:"var(--fm)",fontSize:10,fontWeight:700,color:(p.dayChange||0)>=0?"var(--green)":"var(--red)"}}>
            {(p.dayChange||0)!==0 ? (p.dayChange>=0?"+":"")+_sf(p.dayChange,2)+"%" : "—"}
          </div>
          {/* Shares */}
          <div className="ar-hide-mobile" style={{textAlign:"right",fontSize:10,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{privacyMode?"•••":p.shares?(p.shares||0).toLocaleString():"—"}</div>
          {/* Cost */}
          <div className="ar-hide-mobile" style={{textAlign:"right",fontSize:10,fontWeight:600,color:(p.adjustedBasis||p.avgCost)?"var(--text-secondary)":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{privacyMode?"•••":((p.adjustedBasis||p.avgCost)?origSym+_sf(p.adjustedBasis||p.avgCost,2):"—")}</div>
          {/* P&L total — special treatment for large gains/losses */}
          <div style={{textAlign:"right",fontSize:11,fontWeight:700,color:pnlPct>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)",position:"relative",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:1}}>
            {!privacyMode && pnlPct >= 0.5 && <span style={{fontSize:7,lineHeight:1}} title="50%+ gain">&#9733;</span>}
            <span style={{...(pnlPct >= 0.5 ? {background:"linear-gradient(90deg,rgba(48,209,88,.12),transparent)",padding:"0 3px",borderRadius:3,color:"#4ade80"} : pnlPct <= -0.3 ? {background:"rgba(255,69,58,.1)",padding:"0 3px",borderRadius:3,color:"#ff6b6b"} : {})}}>{privacyMode?"•••":(pnlPct>=0?"+":"")+_sf(pnlPct*100,0)+"%"}</span>
          </div>
          {/* Weight */}
          <div className="ar-hide-mobile" style={{textAlign:"right",fontSize:9,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(weight*100,1)}%</div>
          {/* Value */}
          <div style={{textAlign:"right",fontSize:11,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{privacyMode?"•••":valSym+(valShow>=1e3?_sf(valShow/1e3,1)+"K":_sf(valShow,0))}</div>
          {/* Div + yield badge */}
          <div className="ar-hide-mobile" style={{textAlign:"right",fontSize:10,fontWeight:600,color:dpsUSD>0?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:2}}>
            {!privacyMode && (() => { const yld = p.divYield || (p.dps && p.lastPrice ? p.dps / p.lastPrice : 0); return yld >= 0.05 ? <span style={{fontSize:6,fontWeight:700,padding:"0 3px",borderRadius:2,background:"rgba(200,164,78,.18)",color:"var(--gold)",lineHeight:"12px",flexShrink:0}} title={`Yield ${(yld*100).toFixed(1)}%`}>{(yld*100).toFixed(0)}%</span> : null; })()}
            <span>{privacyMode?"•••":(dpsUSD>0?"$"+_sf(dpsUSD,0):"—")}</span>
          </div>
        </>}
        {!showPos && <>
          <div style={{textAlign:"right",fontSize:12,fontWeight:700,color:p.targetPrice&&p.lastPrice<=p.targetPrice?"var(--green)":"var(--text-secondary)",fontFamily:"var(--fm)"}}>{p.targetPrice?"$"+_sf(toUSD(p.targetPrice,ccy)||0,2):"—"}</div>
        </>}
        {/* Actions — far right */}
        <div style={{display:"flex",gap:1,justifyContent:"flex-end"}} onClick={e=>e.stopPropagation()}>
          <button onClick={(e)=>{e.stopPropagation();openCostBasis(p.ticker);}} title="Cost Basis" style={{width:18,height:18,borderRadius:4,border:"none",background:"transparent",color:"var(--gold)",fontSize:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:.3}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity=".3"}>📋</button>
          <button onClick={(e)=>{e.stopPropagation();if(confirm(`¿Eliminar ${p.ticker}?`))removePosition(p.ticker);}} title="Eliminar" style={{width:18,height:18,borderRadius:4,border:"none",background:"transparent",color:"var(--text-tertiary)",fontSize:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:.2}}
            onMouseEnter={e=>{e.target.style.opacity="1";e.target.style.color="var(--red)";}}
            onMouseLeave={e=>{e.target.style.opacity=".2";e.target.style.color="var(--text-tertiary)";}}>✕</button>
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
      if(t.type === "dividend") {
        // Prefer divTotal (actual amount paid). Fallback to dps × shares (NO totalShares fallback,
        // que causaba bug AHRT $64,692: rows con shares=0 multiplicaban por holdings totales).
        const divAmount = t.divTotal || ((t.dps||0) * (t.shares||0));
        totalDivs += divAmount;
      }
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
  // CONTEXT VALUES FOR EXTRACTED VIEWS
  // ══════════════════════════════════════════
  const costBasisContextValue = useMemo(() => ({
    positions, cbTicker, cbTransactions, cbShowForm, setCbShowForm,
    cbFormType, setCbFormType, cbForm, setCbForm, cbCalc,
    addTransaction, importTransactions, deleteTransaction, goHome, cbLoading,
  }), [positions, cbTicker, cbTransactions, cbShowForm, cbFormType, cbForm, cbCalc,
    addTransaction, importTransactions, deleteTransaction, goHome, cbLoading]);

  const homeContextValue = useMemo(() => ({
    // Navigation & tabs
    homeTab, setHomeTab, setViewMode,
    // Portfolio
    portfolioList, watchlistList, historialList, portfolioTotals, portfolioComputed,
    positions, portfolio,
    searchTicker, setSearchTicker, updatePosition,
    countryFilter, setCountryFilter, portSort, setPortSort, showCapTable, setShowCapTable,
    pricesLoading, pricesLastUpdate, refreshPrices,
    // Display & FX
    displayCcy, switchDisplayCcy, fxRates, fxLoading, fxLastUpdate, fxError, refreshFxRates,
    privacyMode, setPrivacyMode, hide, hideN,
    showSettings, setShowSettings,
    // Screener
    screenerData, screenerLoading, screenerSort, setScreenerSort,
    screenerFilter, setScreenerFilter, customTickers, setCustomTickers,
    bulkLoading, bulkProgress, loadScreener, runBulkFetch,
    // Trades
    tradesData, setTradesData, tradesLoading, setTradesLoading,
    tradesFilter, setTradesFilter, tradesPage, setTradesPage,
    // Dividends
    divLog, divLoading, divShowForm, setDivShowForm,
    divForm, setDivForm, divFilter, setDivFilter,
    divSort, setDivSort, divCalYear, setDivCalYear,
    addDivEntry, deleteDivEntry,
    // FIRE
    fireCcy, setFireCcy, fireGastosYear, setFireGastosYear,
    // Gastos
    gastosLog, gastosLoading, gastosShowForm, setGastosShowForm,
    gastosForm, setGastosForm, gastosFilter, setGastosFilter,
    gastosSort, setGastosSort, addGasto, deleteGasto,
    GASTO_CAT_LIST,
    // Control
    ctrlLog, ctrlShowForm, setCtrlShowForm,
    ctrlForm, setCtrlForm, addCtrlEntry, deleteCtrlEntry, ctrlEditId, setCtrlEditId,
    // Research
    researchOpenList, setResearchOpenList, researchAdvanced, setResearchAdvanced,
    researchHide, setResearchHide, researchCapFilter, setResearchCapFilter,
    reportData, reportLoading, reportSymbol, openReport,
    // Actions
    openAnalysis, goHome, openCostBasis,
    getCountry, FLAGS, POS_STATIC,
    HOME_TABS, CompanyRow,
    // UI Zoom + Offline
    uiZoom, changeZoom, isOffline,
    // Settings/analysis bridge
    loadFromAPI, fmpLoading, fmpError, setTab, setCfg,
    removePosition, deleteCompany, importTransactions,
    // API data (passed through context so components don't import from data.js)
    CTRL_DATA, INCOME_DATA, DIV_BY_YEAR, DIV_BY_MONTH, GASTOS_MONTH,
    FIRE_PROJ, FIRE_PARAMS, ANNUAL_PL, FI_TRACK, HIST_INIT, GASTO_CATS,
    GASTOS_CAT, CASH_DATA, MARGIN_INTEREST_DATA, LIVE_DPS, FORWARD_DIV, CACHED_PNL,
    // IB Integration
    ibData, ibDiscrepancies, loadIBData, ibSyncMsg,
    alerts, alertsUnread, showAlertPanel, setShowAlertPanel, divStreaks, smartMoneyHolders, theme, toggleTheme,
    openScoresModal,
    markAlertsRead: () => {
      fetch(`${API_URL}/api/alerts/read`, { method: "POST" })
        .then(r => { if (!r.ok) throw new Error(r.status); setToast({ type: 'success', message: '✓ Alertas marcadas como leídas' }); })
        .catch(e => setToast({ type: 'error', message: 'Error: ' + (e?.message || e) }));
      setAlertsUnread(0);
      setAlerts(a => a.map(x => ({ ...x, leida: 1 })));
    },
  }), [homeTab, portfolioList, watchlistList, historialList, portfolioTotals, portfolioComputed,
    positions, portfolio, searchTicker, countryFilter, portSort, showCapTable,
    pricesLoading, pricesLastUpdate, displayCcy, fxRates, fxLoading, fxLastUpdate,
    privacyMode, showSettings, screenerData, screenerLoading, screenerSort,
    screenerFilter, customTickers, bulkLoading, bulkProgress,
    tradesData, tradesLoading, tradesFilter, tradesPage,
    divLog, divLoading, divShowForm, divForm, divFilter, divSort, divCalYear,
    fireCcy, fireGastosYear,
    gastosLog, gastosLoading, gastosShowForm, gastosForm, gastosFilter, gastosSort,
    ctrlLog, ctrlShowForm, ctrlForm,
    researchOpenList, researchAdvanced, researchHide, researchCapFilter,
    reportData, reportLoading, reportSymbol,
    fmpLoading, fmpError, hide, hideN, uiZoom, apiData,
    ibData, ibDiscrepancies, loadIBData, ibSyncMsg,
    alerts, alertsUnread, showAlertPanel]);

  // renderCostBasis and renderHome have been extracted to:
  // - components/views/CostBasisView.jsx (via CostBasisContext)
  // - components/views/HomeView.jsx (via HomeContext)

  // Global Cmd+K search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearch(s => !s);
        setGlobalQuery("");
      }
      if (e.key === 'Escape' && globalSearch) setGlobalSearch(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [globalSearch]);

  const globalSearchResults = useMemo(() => {
    if (!globalQuery || globalQuery.length < 2) return [];
    const q = globalQuery.toLowerCase();
    const results = [];
    // Search positions
    portfolioList.forEach(p => {
      if (p.ticker.toLowerCase().includes(q) || (p.name||"").toLowerCase().includes(q))
        results.push({ type: "portfolio", ticker: p.ticker, name: p.name, price: p.lastPrice });
    });
    watchlistList.forEach(p => {
      if (p.ticker.toLowerCase().includes(q) || (p.name||"").toLowerCase().includes(q))
        results.push({ type: "watchlist", ticker: p.ticker, name: p.name });
    });
    // Search tabs
    HOME_TABS.forEach(t => {
      if (t.lbl.toLowerCase().includes(q))
        results.push({ type: "tab", id: t.id, name: t.lbl, ico: t.ico });
    });
    return results.slice(0, 10);
  }, [globalQuery, portfolioList, watchlistList]);

  return !dataLoaded ? (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",background:"var(--bg)",fontFamily:"'DM Sans',sans-serif"}}>
      {/* Skeleton header */}
      <div style={{padding:"16px 36px",display:"flex",gap:10,alignItems:"center"}}>
        <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#c8a44e,#b8860b)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#000"}}>A&R</div>
        {[80,70,60,50,70,80,70].map((w,i)=><div key={i} style={{width:w,height:28,borderRadius:6,background:"var(--skeleton-bg)",animation:"pulse 1.5s infinite",animationDelay:`${i*0.1}s`}}/>)}
      </div>
      {/* Skeleton summary cards */}
      <div className="ar-skeleton-grid" style={{padding:"0 36px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:16}}>
        {[0,1,2,3].map(i=><div key={i} style={{background:"var(--skeleton-bg)",borderRadius:18,padding:"20px",height:100,animation:"pulse 1.5s infinite",animationDelay:`${i*0.15}s`}}>
          <div style={{width:80,height:8,background:"var(--skeleton-inner)",borderRadius:4,marginBottom:12}}/>
          <div style={{width:120,height:24,background:"var(--skeleton-inner)",borderRadius:6}}/>
        </div>)}
      </div>
      {/* Skeleton rows */}
      <div style={{padding:"0 36px",display:"flex",flexDirection:"column",gap:8}}>
        {[0,1,2,3,4,5].map(i=><div key={i} style={{display:"flex",gap:12,alignItems:"center",background:"var(--skeleton-bg)",borderRadius:16,padding:"12px 16px",animation:"pulse 1.5s infinite",animationDelay:`${i*0.1}s`}}>
          <div style={{width:42,height:42,borderRadius:10,background:"var(--skeleton-inner)",flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{width:100+i*10,height:12,background:"var(--skeleton-inner)",borderRadius:4,marginBottom:6}}/>
            <div style={{width:50,height:8,background:"var(--progress-track)",borderRadius:3}}/>
          </div>
          <div style={{width:60,height:16,background:"var(--skeleton-inner)",borderRadius:4}}/>
          <div style={{width:40,height:16,background:"var(--skeleton-inner)",borderRadius:4}}/>
          <div style={{width:50,height:16,background:"var(--skeleton-inner)",borderRadius:4}}/>
        </div>)}
      </div>
      {/* Loading indicator */}
      <div style={{display:"flex",justifyContent:"center",marginTop:24}}>
        <div style={{width:160,height:3,background:"var(--progress-track)",borderRadius:3,overflow:"hidden"}}>
          <div style={{width:"60%",height:"100%",background:"linear-gradient(90deg,#c8a44e,#b8860b)",borderRadius:3,animation:"pulse 1s infinite"}}/>
        </div>
      </div>
    </div>
  ) : (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",background:"var(--bg)",color:"var(--text-primary)",fontFamily:"var(--fb)",zoom:uiZoom/100}}>
      {isOffline && (() => {
        const ts = localStorage.getItem('ayr-offline-timestamp');
        const label = ts ? new Date(ts).toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : null;
        return (
          <div style={{margin:"0 24px",padding:"8px 16px",background:"rgba(255,214,10,.08)",border:"1px solid rgba(255,214,10,.2)",borderRadius:10,display:"flex",alignItems:"center",gap:8,marginTop:8}}>
            <span style={{fontSize:12,color:"#ffd60a",fontFamily:"var(--fm)",fontWeight:600}}>✈️ Modo offline{label ? ` — datos del ${label}` : ""}</span>
          </div>
        );
      })()}
      {dataError && (
        <div style={{margin:"0 24px",padding:"10px 16px",background:"rgba(255,69,58,.1)",border:"1px solid rgba(255,69,58,.25)",borderRadius:10,display:"flex",alignItems:"center",gap:10,marginTop:8}}>
          <span style={{fontSize:13,color:"var(--red)",fontFamily:"var(--fm)"}}>{dataError}</span>
          <button onClick={()=>setDataError(null)} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
        </div>
      )}

      {viewMode==="home" ? (
        <main style={{flex:1,padding:"10px 36px 32px",overflowY:"auto"}}>
          <HomeContext.Provider value={homeContextValue}>
            <HomeView />
          </HomeContext.Provider>
        </main>
      ) : viewMode==="costbasis" ? (
        <main style={{flex:1,padding:"32px 36px",overflowY:"auto"}}>
          <CostBasisContext.Provider value={costBasisContextValue}>
            <ErrorBoundary>
              <Suspense fallback={<Loading />}>
                <CostBasisView />
              </Suspense>
            </ErrorBoundary>
          </CostBasisContext.Provider>
        </main>
      ) : (
        <>
          {/* ═══ ANALYSIS HEADER ═══ */}
          <header style={{position:"sticky",top:0,zIndex:20,background:"var(--header-bg)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderBottom:"1px solid var(--border)"}}>
            {/* Row 1: Back + Config */}
            <div className="ar-analysis-header" style={{display:"flex",alignItems:"center",gap:10,padding:"8px 24px 4px",flexWrap:"wrap"}}>
              <button onClick={goHome} style={{padding:"5px 12px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:11,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:600,flexShrink:0}}>← Inicio</button>
              {/* Company logo */}
              <div style={{width:28,height:28,borderRadius:7,overflow:"hidden",background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {cfg.ticker ? (
                  <img src={`https://images.financialmodelingprep.com/symbol/${cfg.ticker.replace(':','.')}.png`} alt="" style={{width:28,height:28,objectFit:"contain"}}
                    onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
                ) : null}
                <div style={{display:cfg.ticker?"none":"flex",width:28,height:28,borderRadius:7,background:"linear-gradient(135deg,#c8a44e,#b8860b)",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#000",fontFamily:"var(--fm)"}}>A&R</div>
              </div>
              <Inp label="Ticker" value={cfg.ticker} onChange={v=>upCfg("ticker",v)} type="text" w={68} placeholder="AAPL"/>
              <Inp label="Empresa" value={cfg.name} onChange={v=>upCfg("name",v)} type="text" w={140} placeholder="Apple Inc."/>
              <Inp label="Precio" value={cfg.price} onChange={v=>upCfg("price",v)} step={0.01} w={68} suffix="$"/>
              <span className="ar-hide-mobile"><Inp label="Beta" value={cfg.beta} onChange={v=>upCfg("beta",v)} step={0.05} w={48}/></span>
              <span className="ar-hide-mobile"><Inp label="Rf%" value={cfg.riskFree} onChange={v=>upCfg("riskFree",v)} step={0.1} w={44} suffix="%"/></span>
              <span className="ar-hide-mobile"><Inp label="Prima" value={cfg.marketPremium} onChange={v=>upCfg("marketPremium",v)} step={0.1} w={44} suffix="%"/></span>
              <span className="ar-hide-mobile"><Inp label="Tax%" value={cfg.taxRate} onChange={v=>upCfg("taxRate",v)} step={1} w={40} suffix="%"/></span>
              <span className="ar-hide-mobile"><button onClick={()=>upCfg("useWACC",!cfg.useWACC)} style={{padding:"4px 10px",borderRadius:100,border:`1px solid ${cfg.useWACC?"var(--gold)":"var(--border)"}`,background:cfg.useWACC?"var(--gold-dim)":"transparent",color:cfg.useWACC?"var(--gold)":"var(--text-tertiary)",fontSize:9,cursor:"pointer",fontFamily:"var(--fb)",fontWeight:600,alignSelf:"flex-end"}}>
                {cfg.useWACC?"WACC":"Manual"}
              </button></span>
              {!cfg.useWACC && <span className="ar-hide-mobile">
                <Inp label="Desc." value={cfg.manualDiscount} onChange={v=>upCfg("manualDiscount",v)} w={44} suffix="%"/>
                <Inp label="Crec." value={cfg.manualGrowth} onChange={v=>upCfg("manualGrowth",v)} w={44} suffix="%"/>
              </span>}
              <button onClick={()=>loadFromAPI(null, { forceRefresh: true })} disabled={fmpLoading || !cfg.ticker}
                style={{padding:"4px 12px",borderRadius:100,border:"1px solid rgba(48,209,88,.3)",background:fmpLoading?"rgba(48,209,88,.15)":"rgba(48,209,88,.08)",color:fmpLoading?"var(--text-tertiary)":"var(--green)",fontSize:10,fontWeight:700,cursor:fmpLoading?"wait":"pointer",fontFamily:"var(--fm)",alignSelf:"flex-end",flexShrink:0,animation:fmpLoading?"pulse 1s infinite":"none"}}>
                {fmpLoading?"⏳":"⚡ Cargar"}
              </button>
              <button onClick={saveCurrentCompany} style={{padding:"4px 8px",borderRadius:100,border:"1px solid rgba(100,210,255,.25)",background:"rgba(100,210,255,.06)",color:"#64d2ff",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)",alignSelf:"flex-end",flexShrink:0}}>💾</button>
              {cfg.ticker && <button onClick={()=>window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(cfg.ticker)}`,"_blank")} style={{padding:"4px 8px",borderRadius:100,border:"1px solid rgba(48,209,88,.25)",background:"rgba(48,209,88,.06)",color:"var(--green)",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)",alignSelf:"flex-end",flexShrink:0}} title="Abrir en TradingView">📈</button>}
              {cfg.ticker && <>
                <button onClick={()=>{navigator.clipboard.writeText(cfg.ticker);setToast({message:`${cfg.ticker} copiado`,type:"info"});}} title="Copiar ticker" style={{padding:"4px 8px",borderRadius:100,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:9,cursor:"pointer",fontFamily:"var(--fm)",alignSelf:"flex-end",flexShrink:0}}>📋</button>
                <a href={`https://finance.yahoo.com/quote/${cfg.ticker}`} target="_blank" rel="noopener" title="Yahoo Finance" style={{padding:"4px 6px",borderRadius:100,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:9,textDecoration:"none",fontFamily:"var(--fm)",alignSelf:"flex-end",flexShrink:0}}>Y!</a>
                <a href={`https://seekingalpha.com/symbol/${cfg.ticker}`} target="_blank" rel="noopener" title="Seeking Alpha" style={{padding:"4px 6px",borderRadius:100,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:9,textDecoration:"none",fontFamily:"var(--fm)",alignSelf:"flex-end",flexShrink:0}}>SA</a>
              </>}
              {fmpError && <span style={{fontSize:9,color:"var(--red)",alignSelf:"flex-end",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={fmpError}>⚠ {fmpError}</span>}
              {lastSaved && !fmpError && <span style={{fontSize:8,color:"var(--text-tertiary)",alignSelf:"flex-end",fontFamily:"var(--fm)"}}>⟳ {new Date(lastSaved).toLocaleDateString('es-ES')}</span>}
              {/* Recent tickers */}
              {recentTickers.length>1 && <span className="ar-hide-mobile" style={{display:"flex",gap:3,alignSelf:"flex-end"}}>
                {recentTickers.filter(t=>t!==cfg.ticker).slice(0,5).map(t=>(
                  <button key={t} onClick={()=>loadFromAPI(t)} style={{padding:"2px 6px",borderRadius:5,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:8,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:600,transition:"all .15s"}}
                    onMouseEnter={e=>{e.target.style.borderColor="var(--gold)";e.target.style.color="var(--gold)";}}
                    onMouseLeave={e=>{e.target.style.borderColor="var(--border)";e.target.style.color="var(--text-tertiary)";}}>{t}</button>
                ))}
              </span>}
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
            {/* Row 1.5: Position Notes (buy thesis) */}
            {cfg.ticker && <div style={{padding:"2px 24px 0",display:"flex",alignItems:"flex-start",gap:8}}>
              <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,paddingTop:4,flexShrink:0}}>Notas</span>
              <textarea
                value={positionNotes}
                onChange={e => { setPositionNotes(e.target.value); setNotesSaved(false); }}
                onBlur={() => { if (cfg.ticker) savePositionNotes(cfg.ticker, positionNotes); }}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.target.blur(); } }}
                placeholder="Por que compraste esta empresa?"
                rows={1}
                style={{flex:1,maxWidth:600,minHeight:24,maxHeight:80,padding:"3px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--subtle-bg)",color:"var(--text-secondary)",fontSize:10,fontFamily:"var(--fm)",resize:"vertical",lineHeight:1.4,outline:"none",transition:"border-color .2s"}}
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
              />
              {notesSaved && <span style={{fontSize:9,color:"var(--green)",fontFamily:"var(--fm)",paddingTop:4,flexShrink:0,animation:"fadeUp .3s"}}>Guardado</span>}
            </div>}
            {/* Row 2: Analysis Tabs — draggable to reorder. Order persists
                in localStorage 'ayr-tab-order'. Right-click any tab to reset
                to default order. */}
            <div ref={tabsRef} className="ar-tabs-scroll" style={{display:"flex",gap:2,padding:"0 24px",overflowX:"auto",overflowY:"hidden",borderTop:"1px solid var(--row-border)"}}>
              {(() => {
                // Compose ordered list: saved order first (intersected with current TABS),
                // then any tabs added since last save appended at the end.
                const byId = new Map(TABS.map(t => [t.id, t]));
                const seen = new Set();
                const ordered = [];
                for (const id of tabOrder) {
                  const t = byId.get(id);
                  if (t && !seen.has(id)) { ordered.push(t); seen.add(id); }
                }
                for (const t of TABS) if (!seen.has(t.id)) ordered.push(t);
                return ordered;
              })().map(t => (
                <button key={t.id} className="ar-tab-btn" data-active={tab===t.id?"true":"false"}
                  draggable={true}
                  onClick={() => setTab(t.id)}
                  onDragStart={e => {
                    setTabDragging(t.id);
                    e.dataTransfer.effectAllowed = 'move';
                    try { e.dataTransfer.setData('text/plain', t.id); } catch {}
                  }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (tabDragging && tabDragging !== t.id) setTabDragOver(t.id); }}
                  onDragLeave={() => { if (tabDragOver === t.id) setTabDragOver(null); }}
                  onDrop={e => {
                    e.preventDefault();
                    const src = tabDragging || e.dataTransfer.getData('text/plain');
                    if (!src || src === t.id) { setTabDragging(null); setTabDragOver(null); return; }
                    const allIds = TABS.map(x => x.id);
                    const merged = [...new Set([...tabOrder, ...allIds])].filter(id => allIds.includes(id));
                    const without = merged.filter(id => id !== src);
                    const targetIdx = without.indexOf(t.id);
                    const newOrder = [...without.slice(0, targetIdx), src, ...without.slice(targetIdx)];
                    setTabOrder(newOrder);
                    try { localStorage.setItem('ayr-tab-order', JSON.stringify(newOrder)); } catch {}
                    setTabDragging(null); setTabDragOver(null);
                  }}
                  onDragEnd={() => { setTabDragging(null); setTabDragOver(null); }}
                  onContextMenu={e => {
                    e.preventDefault();
                    if (window.confirm('Restablecer orden de pestañas al original?')) {
                      const def = TABS.map(x => x.id);
                      setTabOrder(def);
                      try { localStorage.removeItem('ayr-tab-order'); } catch {}
                    }
                  }}
                  title="Arrastra para reordenar · click derecho para restablecer"
                  style={{
                    display:"flex",alignItems:"center",gap:4,padding:"7px 12px",border:"none",
                    background: tabDragOver === t.id ? "rgba(200,164,78,.18)" : "transparent",
                    borderLeft: tabDragOver === t.id ? "2px solid var(--gold)" : "2px solid transparent",
                    cursor: tabDragging ? "grabbing" : "grab",
                    color: tab===t.id?"var(--gold)":"var(--text-tertiary)",
                    fontSize:11, fontWeight: tab===t.id?700:500, fontFamily:"var(--fb)",
                    transition:"color .2s, background .15s, border-color .15s",
                    flexShrink:0,
                    opacity: tabDragging === t.id ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if(tab!==t.id && tabDragging !== t.id) e.currentTarget.style.color = "var(--text-secondary)"; }}
                  onMouseLeave={e => { if(tab!==t.id) e.currentTarget.style.color = "var(--text-tertiary)"; }}>
                  <span style={{fontSize:10,opacity:tab===t.id?1:.5}}>{t.ico}</span>{t.lbl}
                </button>
              ))}
            </div>
          </header>
          <main className="ar-analysis-main" style={{flex:1,padding:"24px 28px",overflowY:"auto"}}>
            <AnalysisContext.Provider value={analysisValue}>
              <CostBasisContext.Provider value={costBasisContextValue}>
                <div style={{maxWidth:1280,margin:"0 auto",animation:anim?"fadeUp .4s cubic-bezier(.16,1,.3,1)":"none"}} key={tab}><ErrorBoundary><Suspense fallback={<Loading />}>{content[tab]?.()}</Suspense></ErrorBoundary></div>
              </CostBasisContext.Provider>
            </AnalysisContext.Provider>
          </main>
        </>
      )}

      <footer style={{padding:"6px 28px",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fb)",fontWeight:500}}>A&R v10.2</span>
        <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fb)"}}>No constituye asesoramiento financiero</span>
      </footer>
      {toast && <Toast message={toast.message} type={toast.type} onClose={()=>setToast(null)}/>}
      <ScrollToTop/>
      {/* Global Search Overlay (Cmd+K) */}
      {globalSearch && (
        <div style={{position:"fixed",inset:0,background:"var(--overlay-bg)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:120}}
          onClick={()=>setGlobalSearch(false)}>
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,width:"100%",maxWidth:500,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.5)"}}
            onClick={e=>e.stopPropagation()}>
            <input autoFocus value={globalQuery} onChange={e=>setGlobalQuery(e.target.value)}
              placeholder="Buscar ticker, empresa, o pestaña..."
              aria-label="Búsqueda global — ticker, empresa, o pestaña"
              role="combobox"
              aria-expanded={globalSearchResults.length > 0}
              aria-autocomplete="list"
              style={{width:"100%",padding:"14px 18px",border:"none",borderBottom:"1px solid var(--border)",background:"transparent",color:"var(--text-primary)",fontSize:16,fontFamily:"var(--fm)",outline:"none",boxSizing:"border-box"}}/>
            {globalSearchResults.length > 0 && (
              <div style={{maxHeight:300,overflowY:"auto"}}>
                {globalSearchResults.map((r,i) => (
                  <div key={i} onClick={()=>{
                    if(r.type==="tab"){setHomeTab(r.id);setViewMode("home");}
                    else openAnalysis(r.ticker);
                    setGlobalSearch(false);
                  }}
                    style={{padding:"10px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid var(--row-border)"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--card-hover)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{fontSize:9,padding:"2px 6px",borderRadius:4,fontFamily:"var(--fm)",fontWeight:600,
                      background:r.type==="portfolio"?"var(--gold-dim)":r.type==="watchlist"?"rgba(255,214,10,.08)":"rgba(100,210,255,.08)",
                      color:r.type==="portfolio"?"var(--gold)":r.type==="watchlist"?"#ffd60a":"#64d2ff"
                    }}>{r.type==="tab"?r.ico:r.type==="portfolio"?"💼":"👁"}</span>
                    <span style={{fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fm)",fontSize:14}}>{r.ticker||r.name}</span>
                    {r.name && r.ticker && <span style={{color:"var(--text-tertiary)",fontSize:12,fontFamily:"var(--fm)"}}>{r.name}</span>}
                    {r.price && <span style={{marginLeft:"auto",color:"var(--text-secondary)",fontFamily:"var(--fm)",fontSize:12}}>${_sf(r.price,2)}</span>}
                  </div>
                ))}
              </div>
            )}
            {globalQuery.length >= 2 && globalSearchResults.length === 0 && (
              <div style={{padding:"20px 18px",textAlign:"center",color:"var(--text-tertiary)",fontSize:13,fontFamily:"var(--fm)"}}>Sin resultados para "{globalQuery}"</div>
            )}
            <div style={{padding:"6px 18px",fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",borderTop:"1px solid var(--border)"}}>
              ⌘K para abrir · ESC para cerrar · Enter para seleccionar
            </div>
          </div>
        </div>
      )}

      {/* ── Quality + Safety Score drill-down modal ── */}
      {scoresModalTicker && (
        <div onClick={()=>{setScoresModalTicker(null);setScoresModalData(null);}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(8px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,maxWidth:680,width:"100%",maxHeight:"85vh",overflowY:"auto",padding:"22px 26px",boxShadow:"0 20px 60px rgba(0,0,0,.5)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,paddingBottom:14,borderBottom:"1px solid var(--border)"}}>
              <div>
                <div style={{fontSize:20,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fb)",letterSpacing:-.3}}>{scoresModalTicker}</div>
                <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>Quality + Safety Score breakdown</div>
              </div>
              <button onClick={()=>{setScoresModalTicker(null);setScoresModalData(null);}}
                style={{width:30,height:30,borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:14,cursor:"pointer"}}>✕</button>
            </div>

            {!scoresModalData && <div style={{padding:30,textAlign:"center",color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontSize:12}}>Cargando...</div>}

            {scoresModalData?.error && <div style={{padding:20,color:"var(--red)",fontFamily:"var(--fm)",fontSize:12}}>Error: {scoresModalData.error}</div>}

            {scoresModalData?.message && (
              <div style={{padding:20,textAlign:"center",color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontSize:12}}>
                {scoresModalData.message}
                <div style={{marginTop:12}}>
                  <button onClick={async()=>{
                    setScoresModalData(null);
                    try {
                      const r = await fetch(`${API_URL}/api/scores/compute?ticker=${encodeURIComponent(scoresModalTicker)}`,{method:"POST"});
                      const d = await r.json();
                      // Reload via GET
                      const r2 = await fetch(`${API_URL}/api/scores/${encodeURIComponent(scoresModalTicker)}`);
                      setScoresModalData(await r2.json());
                    } catch (e) { setScoresModalData({error:e.message}); }
                  }} style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>
                    ⚡ Computar ahora
                  </button>
                </div>
              </div>
            )}

            {scoresModalData?.latest && (() => {
              const d = scoresModalData.latest;
              const inputs = d.inputs || {};
              const qInputs = inputs.quality || {};
              const sInputs = inputs.safety || {};
              // Migrated to shared helpers in utils/formatters.js.
              // fmt falls back to the raw value for non-numbers (e.g. string labels), so keep a tiny wrapper.
              const fmt = (v, decimals=2) => (typeof v === 'number' ? fmtNumD(v, decimals) : (v == null ? "—" : v));
              const fmtPct = fmtPctFrac;          // fraction → "X.X%"
              // fmtMul, fmtBn come from imports (fmtBn → fmtBnUsd alias below for local call sites)
              const fmtBn = fmtBnUsd;

              const ScoreBar = ({label, pts, max, val=null, fmt=null}) => {
                const pct = (pts || 0) / max * 100;
                const col = pct >= 80 ? "var(--gold)" : pct >= 60 ? "var(--green)" : pct >= 40 ? "#ffd60a" : "#ff6b6b";
                return (
                  <div style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3,fontFamily:"var(--fm)"}}>
                      <span style={{color:"var(--text-secondary)"}}>{label}</span>
                      <span style={{color:"var(--text-tertiary)",fontSize:10}}>{val != null && fmt ? fmt(val) + " · " : ""}<span style={{color:col,fontWeight:700}}>{pts ?? "—"}/{max}</span></span>
                    </div>
                    <div style={{height:5,background:"var(--subtle-bg2)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:3,transition:"width .3s"}}/>
                    </div>
                  </div>
                );
              };

              return <>
                {/* Big score numbers */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}}>
                  <div style={{padding:"14px 16px",background:"var(--subtle-bg)",borderRadius:10,textAlign:"center"}}>
                    <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Quality</div>
                    <div style={{fontSize:38,fontWeight:800,color:d.quality_score >= 80 ? "var(--gold)" : d.quality_score >= 65 ? "var(--green)" : d.quality_score >= 50 ? "#ffd60a" : "#ff6b6b",fontFamily:"var(--fb)",lineHeight:1}}>{d.quality_score ?? "—"}</div>
                    <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>de 100</div>
                  </div>
                  <div style={{padding:"14px 16px",background:"var(--subtle-bg)",borderRadius:10,textAlign:"center"}}>
                    <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Dividend Safety</div>
                    {d.safety_score != null ? (
                      <div style={{fontSize:38,fontWeight:800,color:d.safety_score >= 80 ? "var(--gold)" : d.safety_score >= 65 ? "var(--green)" : d.safety_score >= 50 ? "#ffd60a" : "#ff6b6b",fontFamily:"var(--fb)",lineHeight:1}}>{d.safety_score}</div>
                    ) : (
                      <div style={{fontSize:18,fontWeight:700,color:"var(--text-tertiary)",fontFamily:"var(--fm)",lineHeight:1.5,paddingTop:8}}>N/A<div style={{fontSize:8}}>(no dividend payer)</div></div>
                    )}
                    {d.safety_score != null && <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>de 100</div>}
                  </div>
                </div>

                {/* Quality breakdown */}
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--text-tertiary)",letterSpacing:1,textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:8}}>Quality Components</div>
                  <ScoreBar label="Profitability" pts={d.q_profitability} max={25} val={qInputs.fcfMargin} fmt={fmtPct}/>
                  <ScoreBar label="Capital Efficiency (ROIC)" pts={d.q_capital_efficiency} max={20} val={qInputs.roic} fmt={fmtPct}/>
                  <ScoreBar label="Balance Sheet" pts={d.q_balance_sheet} max={20} val={qInputs.debtEbitda} fmt={fmtMul}/>
                  <ScoreBar label="Growth (Rev + FCF)" pts={d.q_growth} max={15} val={qInputs.revGrowth} fmt={fmtPct}/>
                  <ScoreBar label="Capital Allocation" pts={d.q_dividend_track} max={10}/>
                  <ScoreBar label="Predictability" pts={d.q_predictability} max={10} val={qInputs.vol1y} fmt={v=>v?.toFixed(1)+"%"}/>
                </div>

                {/* Safety breakdown */}
                {d.safety_score != null && (
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:10,fontWeight:700,color:"var(--text-tertiary)",letterSpacing:1,textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:8}}>Dividend Safety Components</div>
                    <ScoreBar label="FCF Coverage" pts={d.s_coverage} max={30} val={sInputs.fcfCoverage} fmt={fmtMul}/>
                    <ScoreBar label="Balance Sheet Stress" pts={d.s_balance_sheet} max={25}/>
                    <ScoreBar label="Track Record" pts={d.s_track_record} max={20} val={sInputs.streakYears} fmt={v=>v?v+" años":"—"}/>
                    <ScoreBar label="Forward Visibility" pts={d.s_forward} max={15}/>
                    <ScoreBar label="Sector Adjustment" pts={d.s_sector_adj} max={10}/>
                  </div>
                )}

                {/* Key inputs raw */}
                <div style={{marginTop:14,padding:12,background:"var(--subtle-bg)",borderRadius:8,fontSize:10,fontFamily:"var(--fm)",color:"var(--text-secondary)",lineHeight:1.6}}>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Métricas brutas</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 14px"}}>
                    <div>Revenue TTM: <span style={{color:"var(--text-primary)"}}>{fmtBn(qInputs.revTTM)}</span></div>
                    <div>FCF TTM: <span style={{color:"var(--text-primary)"}}>{fmtBn(qInputs.fcfTTM)}</span></div>
                    <div>Net Income TTM: <span style={{color:"var(--text-primary)"}}>{fmtBn(qInputs.niTTM)}</span></div>
                    <div>Op Income TTM: <span style={{color:"var(--text-primary)"}}>{fmtBn(qInputs.opIncTTM)}</span></div>
                    <div>FCF Margin: <span style={{color:"var(--text-primary)"}}>{fmtPct(qInputs.fcfMargin)}</span></div>
                    <div>Net Margin: <span style={{color:"var(--text-primary)"}}>{fmtPct(qInputs.netMargin)}</span></div>
                    <div>ROIC: <span style={{color:"var(--text-primary)"}}>{fmtPct(qInputs.roic)}</span></div>
                    <div>Debt/EBITDA: <span style={{color:"var(--text-primary)"}}>{fmtMul(qInputs.debtEbitda)}</span></div>
                    <div>Interest Cov: <span style={{color:"var(--text-primary)"}}>{fmtMul(qInputs.intCov)}</span></div>
                    <div>Current Ratio: <span style={{color:"var(--text-primary)"}}>{fmtMul(qInputs.currentRatio)}</span></div>
                    {sInputs.fcfCoverage != null && <div>FCF/Div: <span style={{color:"var(--text-primary)"}}>{fmtMul(sInputs.fcfCoverage)}</span></div>}
                    {sInputs.payoutRatio != null && <div>Payout (NI): <span style={{color:"var(--text-primary)"}}>{fmtPct(sInputs.payoutRatio)}</span></div>}
                    {sInputs.fcfPayoutRatio != null && <div>Payout (FCF): <span style={{color: sInputs.fcfPayoutRatio > 1 ? "var(--red)" : sInputs.fcfPayoutRatio > 0.8 ? "var(--gold)" : "var(--text-primary)"}}>{fmtPct(sInputs.fcfPayoutRatio)}</span></div>}
                    {qInputs.piotroskiScore != null && <div>Piotroski: <span style={{color: qInputs.piotroskiScore < 5 ? "var(--red)" : qInputs.piotroskiScore < 7 ? "var(--gold)" : "var(--green)"}}>{qInputs.piotroskiScore}/9</span></div>}
                    {qInputs.accrualsRatio != null && <div>Accruals: <span style={{color: qInputs.accrualsRatio > 0.10 ? "var(--red)" : qInputs.accrualsRatio > 0.05 ? "var(--gold)" : "var(--text-primary)"}}>{fmtPct(qInputs.accrualsRatio)}</span></div>}
                    {sInputs.streakYears != null && <div>Streak: <span style={{color:"var(--text-primary)"}}>{sInputs.streakYears} años</span></div>}
                    {qInputs.vol1y != null && <div>Volatility 1y: <span style={{color:"var(--text-primary)"}}>{qInputs.vol1y.toFixed(1)}%</span></div>}
                  </div>
                </div>

                {/* Acción sugerida — derivada de thresholds Q+S */}
                {(() => {
                  const q = d.quality_score ?? 0;
                  const s = d.safety_score ?? 0;
                  let label = "HOLD", color = "var(--text-secondary)", reason = "Posición estable según métricas actuales.";
                  if (s < 25 || (sInputs.fcfPayoutRatio != null && sInputs.fcfPayoutRatio > 1.0)) {
                    label = "AVOID / TRIM"; color = "var(--red)";
                    reason = "Safety en zona peligro o FCF payout > 100%. Considerar reducir exposición.";
                  } else if (s < 45 || (qInputs.piotroskiScore != null && qInputs.piotroskiScore < 5)) {
                    label = "WATCH"; color = "var(--gold)";
                    reason = "Vigilar de cerca: safety mediocre o calidad de earnings deteriorándose (Piotroski < 5).";
                  } else if (q >= 75 && s >= 70) {
                    label = "ADD si valoración OK"; color = "var(--green)";
                    reason = "Top tier en Quality + Safety. Si la valoración es atractiva, candidato a añadir.";
                  } else if (q >= 60 && s >= 55) {
                    label = "HOLD"; color = "var(--text-primary)";
                    reason = "Calidad y seguridad razonables para una posición core.";
                  }
                  return (
                    <div style={{marginTop:14,padding:12,border:`1px solid ${color}`,borderRadius:8,background:"var(--subtle-bg)"}}>
                      <div style={{fontSize:9,color:"var(--text-tertiary)",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Acción sugerida</div>
                      <div style={{fontSize:14,fontWeight:700,color,fontFamily:"var(--fm)",marginBottom:4}}>{label}</div>
                      <div style={{fontSize:10,color:"var(--text-secondary)",lineHeight:1.4}}>{reason}</div>
                    </div>
                  );
                })()}

                {/* Sparkline histórico Q + S */}
                {scoresModalData.history && scoresModalData.history.length > 1 && (() => {
                  const hist = [...scoresModalData.history].reverse(); // oldest → newest
                  const W = 300, H = 60, P = 4;
                  const xs = (i) => P + (i / Math.max(1, hist.length - 1)) * (W - 2*P);
                  const ys = (v) => H - P - ((v ?? 0) / 100) * (H - 2*P);
                  const qPath = hist.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(h.quality_score)}`).join(' ');
                  const sPath = hist.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(h.safety_score)}`).join(' ');
                  return (
                    <div style={{marginTop:14,padding:12,background:"var(--subtle-bg)",borderRadius:8}}>
                      <div style={{fontSize:9,color:"var(--text-tertiary)",letterSpacing:1,textTransform:"uppercase",marginBottom:6,display:"flex",justifyContent:"space-between"}}>
                        <span>Histórico ({hist.length} snapshots)</span>
                        <span style={{fontSize:9}}>
                          <span style={{color:"var(--gold)"}}>━ Q</span> &nbsp;
                          <span style={{color:"var(--green)"}}>━ S</span>
                        </span>
                      </div>
                      <svg width={W} height={H} style={{display:"block",width:"100%",maxWidth:W}}>
                        <line x1={P} y1={ys(50)} x2={W-P} y2={ys(50)} stroke="var(--border)" strokeDasharray="2,3"/>
                        <path d={qPath} fill="none" stroke="var(--gold)" strokeWidth="1.5"/>
                        <path d={sPath} fill="none" stroke="var(--green)" strokeWidth="1.5"/>
                        {hist.map((h, i) => (
                          <g key={i}>
                            <circle cx={xs(i)} cy={ys(h.quality_score)} r="2" fill="var(--gold)"/>
                            <circle cx={xs(i)} cy={ys(h.safety_score)} r="2" fill="var(--green)"/>
                          </g>
                        ))}
                      </svg>
                      <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"flex",justifyContent:"space-between",marginTop:4}}>
                        <span>{hist[0].snapshot_date}</span>
                        <span>{hist[hist.length-1].snapshot_date}</span>
                      </div>
                    </div>
                  );
                })()}

                <div style={{marginTop:14,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center",borderTop:"1px solid var(--border)",paddingTop:10}}>
                  Snapshot {d.snapshot_date} · Computed {d.computed_at}
                </div>
              </>;
            })()}
          </div>
        </div>
      )}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
