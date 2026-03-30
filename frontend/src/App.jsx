import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { _sf, _sl, n, f0, f1, f2, fP, fX, fC, fM, fDol, clamp, cagrFn } from './utils/formatters.js';
import { CURRENCIES, DISPLAY_CCYS, DEFAULT_FX, YEARS, PROJ_YEARS, _CURRENT_YEAR, TABS, TABS_OLD, API_URL, HOME_TABS } from './constants/index.js';
import { convertCcy, fCcy, fetchFxRates } from './utils/currency.js';
import { storageAvailable, saveCompanyToStorage, loadCompanyFromStorage, loadPortfolioIndex, removeCompanyFromStorage } from './utils/storage.js';
import { fetchViaFMP, fetchViaClaudeAPI } from './api/fmp.js';
import { generateReport } from './api/claude.js';
import { fetchAllData } from './api/data.js';
import { useAnalysisMetrics } from './hooks/useAnalysisMetrics.js';
import './App.css';
import { Badge, BarChart, AreaSparkline, DonutChart, GaugeVerdict, Tooltip, Inp, Card, SensitivityTable, generatePDF, ErrorBoundary, Toast } from './components/ui';
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
const WeissTab = lazy(() => import('./components/analysis/WeissTab'));
const ChecklistTab = lazy(() => import('./components/analysis/ChecklistTab'));
const PaybackTab = lazy(() => import('./components/analysis/PaybackTab'));
const ReportTab = lazy(() => import('./components/analysis/ReportTab'));
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

  useEffect(() => {
    fetchAllData().then(result => {
      if (result.ok) {
        setApiData(result);
        if (result.errors?.length) {
          setDataError(`Algunos datos no cargaron: ${result.errors.length} endpoint(s) fallaron`);
        }
      } else {
        setDataError("Error conectando con la API. Comprueba tu conexión.");
      }
      setDataLoaded(true);
    });
  }, []);

  // Destructure apiData for use throughout the component
  const CTRL_DATA = apiData?.CTRL_DATA || [];
  const INCOME_DATA = apiData?.INCOME_DATA || [];
  const DIV_BY_YEAR = apiData?.DIV_BY_YEAR || {};
  const DIV_BY_MONTH = apiData?.DIV_BY_MONTH || {};
  const GASTOS_MONTH = apiData?.GASTOS_MONTH || {};
  const FIRE_PROJ = apiData?.FIRE_PROJ || [];
  const FIRE_PARAMS = apiData?.FIRE_PARAMS || {target:1350000,returnPct:0.11,inflation:0.025,monthlyExp:4000};
  const ANNUAL_PL = apiData?.ANNUAL_PL || [];
  const FI_TRACK = apiData?.FI_TRACK || [];
  const HIST_INIT = apiData?.HIST_INIT || [];
  const GASTO_CATS = apiData?.GASTO_CATS || {};
  const _DIV_ENTRIES = apiData?._DIV_ENTRIES || [];
  const _GASTO_ENTRIES = apiData?._GASTO_ENTRIES || [];
  const GASTOS_CAT = apiData?.GASTOS_CAT || {};
  const CASH_DATA = apiData?.CASH_DATA || [];
  const MARGIN_INTEREST_DATA = apiData?.MARGIN_INTEREST_DATA || [];

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
    YEARS.forEach(y => { o[y] = {revenue:0,grossProfit:0,operatingIncome:0,netIncome:0,eps:0,dps:0,sharesOut:0,totalDebt:0,cash:0,equity:0,retainedEarnings:0,ocf:0,capex:0,interestExpense:0,depreciation:0,taxProvision:0}; });
    return o;
  });
  // NOTE: DEO_DATA is kept as example data — load via "Importar" JSON or will integrate API later
  const [cfg, setCfg] = useState({ticker:"",name:"",price:0,currency:"USD",beta:1.0,riskFree:4.0,marketPremium:5.5,taxRate:28,manualDiscount:0,manualGrowth:0,useWACC:true});
  const [tab, setTab] = useState("dash");
  const [anim, setAnim] = useState(false);
  const [fgMode, setFgMode] = useState("eps");
  const [fgPE, setFgPE] = useState(15);
  const [fgGrowth, setFgGrowth] = useState(8);
  const [fgProjYears, setFgProjYears] = useState(5);
  const [showDiv, setShowDiv] = useState(true);
  const [pdfState, setPdfState] = useState("idle");
  const [guideStep, setGuideStep] = useState(0);
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

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tabsRef = useRef(null);
  const [fmpLoading, setFmpLoading] = useState(false);
  const [fmpError, setFmpError] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [lastSaved, setLastSaved] = useState(null); // ISO date of last save for current ticker
  const [recentTickers, setRecentTickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ayr_recent') || '[]'); } catch { return []; }
  });
  const [fmpApiKey, setFmpApiKey] = useState("");
  // v10.2: New FMP data (rating, DCF, estimates, price targets, key metrics, financial growth)
  const [fmpExtra, setFmpExtra] = useState({ rating: {}, dcf: {}, estimates: [], priceTarget: {}, keyMetrics: [], finGrowth: [], grades: {}, ownerEarnings: [], revSegments: [], geoSegments: [], peers: [], earnings: [], ptSummary: {}, profile: {} });
  const [showSettings, setShowSettings] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);

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
          }),
        }).catch(() => {});
      }
    }

    return data;
  }, []);

  // Auto-sync IB data once per session (must be after loadIBData declaration)
  useEffect(() => {
    if (!dataLoaded) return;
    const syncKey = 'ib-sync-' + new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(syncKey)) return;
    sessionStorage.setItem(syncKey, '1');
    loadIBData();
  }, [dataLoaded, loadIBData]);

  const [uiZoom, setUiZoom] = useState(() => {
    const saved = localStorage.getItem("ayr_zoom");
    return saved ? parseInt(saved) : 100;
  });
  const changeZoom = (z) => { const v = Math.max(70, Math.min(150, z)); setUiZoom(v); localStorage.setItem("ayr_zoom", v); };
  const hide = v => privacyMode ? "•••••" : v; // Hide sensitive values
  const hideN = v => privacyMode ? "•••" : v; // Hide shorter numbers

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
"RICK":{n:"RCI Hospitality Holdings Inc",lp:21.42,ap:38.0607,cb:36.8872,sh:1550,tg:"LANDLORD",cat:"COMPANY",divTTM:0.28,dy:0.013,yoc:0.007357,pnl:-0.419311,pnlAbs:-25793.01,mv:33201,uv:33201,ti:57175.22,roe:0.202987,d2f:6.59,apc:-0.0858,adt:20.15,f2d:0.0739,mc:0.17},
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
      cat: st.cat || "COMPANY", mc: st.mc || 0, sector: st.sec || "",
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
  const [toast, setToast] = useState(null);

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
            // CB loaded from API
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
      .catch(() => {});
  }, [dataLoaded, divLog.length]);

  // ── Gastos Log (replaces GASTOS Google Sheets) ──
  const [gastosLog, setGastosLog] = useState([]);
  const [gastosLoading, setGastosLoading] = useState(false);
  const [gastosShowForm, setGastosShowForm] = useState(false);
  const [gastosForm, setGastosForm] = useState({date:new Date().toISOString().slice(0,10),cat:"Comidas y Cenas",amount:0,currency:"EUR",recur:false,detail:"",tipo:"normal",secreto:false});
  const [gastosFilter, setGastosFilter] = useState({year:"all",cat:"all",month:"all",ccy:"all",search:"",tipo:"all",showSecretos:false});
  const [gastosSort, setGastosSort] = useState({col:"date",asc:false});
  
  const GASTO_CAT_LIST = ["Supermercado","Restaurante","Transporte","Ropa","Deportes","Alquiler","Casa","Utilities","Utilities China","Suscripciones","Salud","Masajes","Bolsa","Viajes","Caprichos","Regalos","Barco","Ocio","Hipoteca","Educacion","Otros"];
  
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

  // Build IB position lookup
  // IB ticker → App ticker mapping (IB uses different symbols for some)
  const IB_TICKER_MAP = {
    "VIS":"BME:VIS","AMS":"BME:AMS","IIPR PRA":"IIPR-PRA",
    "9618":"HKG:9618","1052":"HKG:1052","2219":"HKG:2219","1910":"HKG:1910","9616":"HGK:9616",
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

  // Auto-add IB positions > $500 that aren't in portfolio (stocks only, not options/dead positions)
  useEffect(() => {
    if (!ibData.loaded || !ibData.positions.length || !portfolioList.length) return;
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
  }, [ibData.loaded, ibData.positions.length, portfolioList.length]);

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
        divAnnualUSD = (p.divTTM || 0) * (ib.shares || p.shares || 0);
        dataSource = "IB";
      } else {
        // FMP fallback
        valueUSD = p.usdValue || 0;
        costTotalUSD = p.totalInvertido || 0;
        pnlUSD = valueUSD - costTotalUSD;
        pnlPct = p.pnlPct || (costTotalUSD !== 0 ? pnlUSD / Math.abs(costTotalUSD) : 0);
        divAnnualUSD = (p.divTTM || 0) * (p.shares || 0);
        dataSource = "FMP";
      }

      const valueEUR = toEUR(valueUSD);
      const costTotalEUR = toEUR(costTotalUSD);
      const divAnnualEUR = toEUR(divAnnualUSD);
      const ccy = p.currency || "USD";
      const shares = ib?.shares || p.shares || 0;
      const lastPrice = ib?.mktPrice || p.lastPrice || 0;

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
        ibPnl: ib?.unrealizedPnl ?? null,
        ibAvgCost: ib?.avgCost ?? null,
      };
    });
  }, [portfolioList, toEUR, ibPositionMap, fxRates]);

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
            const _API = "https://aar-api.garciaontoso.workers.dev";
            const prResp = await fetch(`${_API}/api/peer-ratios?symbols=${peerSymbols.join(",")}`);
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
      
      // Save to persistent storage
      const saveData = { fin: data.fin, cfg: data.cfg, comps, ssd, report, fmpExtra: { rating: data.fmpRating, dcf: data.fmpDCF, estimates: data.fmpEstimates, priceTarget: data.fmpPriceTarget, keyMetrics: data.fmpKeyMetrics, finGrowth: data.fmpFinGrowth, grades: data.fmpGrades, ownerEarnings: data.fmpOwnerEarnings, revSegments: data.fmpRevSegments, geoSegments: data.fmpGeoSegments, peers: data.fmpPeers, earnings: data.fmpEarnings, ptSummary: data.fmpPtSummary } };
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
    qualityAll:() => <div><div style={_sec}>Calidad del Negocio</div><QualityTab /><div style={_sec}>Crecimiento (CAGR)</div><GrowthTab /><div style={_sec}>Big Five — Rule #1</div><Big5Tab /></div>,
    quality:() => <QualityTab />,
    debt:() => <DebtTab />,
    divAll:() => <div><div style={_sec}>Seguridad del Dividendo</div><DividendsTab /><div style={_sec}>Yield Bands — Weiss</div><WeissTab /></div>,
    dividends:() => <DividendsTab />,
    valAll:() => <div><div style={_sec}>Múltiplos Actuales</div><ValuationTab /><DCFTab /><div style={_sec}>Margen de Seguridad (6 Métodos)</div><MOSTab /><div style={_sec}>FastGraphs — Proyección</div><FastGraphsTab /><div style={_sec}>10 Cap Rate</div><TenCapTab /><div style={_sec}>Payback Time</div><PaybackTab /></div>,
    valuation:() => <><ValuationTab /><DCFTab /></>,
    verdict:() => <div><div style={_sec}>Checklist de Inversión</div><ChecklistTab /><div style={_sec}>Veredicto Final</div><ScoreTab /></div>,
    big5:() => <Big5Tab />,
    tencap:() => <TenCapTab />,
    payback:() => <PaybackTab />,
    mos:() => <MOSTab />,
    fastgraphs:() => <FastGraphsTab />,
    weiss:() => <WeissTab />,
    checklist:() => <ChecklistTab />,
    growth:() => <GrowthTab />,
    score:() => <ScoreTab />,
    report:() => <ReportTab />,
    dst:() => <DSTTab />,
    options:() => <OptionsChainTab />,
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
      <div onClick={()=>onOpen(p.ticker)} style={{display:"grid",gridTemplateColumns:showPos?"28px 1fr 40px 70px 55px 55px 50px 50px 65px 55px 28px":"28px 1fr 40px 70px 70px 28px",gap:4,alignItems:"center",padding:"5px 10px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,cursor:"pointer",transition:"all .15s"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--border-hover)";e.currentTarget.style.background="var(--card-hover)";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--card)";}}>
        {/* Logo */}
        <div style={{width:24,height:24,borderRadius:6,overflow:"hidden",background:"#161b22",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <img src={`https://images.financialmodelingprep.com/symbol/${p.ticker.replace(':','.')}.png`} alt=""
            style={{width:24,height:24,objectFit:"contain",borderRadius:6}}
            onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
          <div style={{display:"none",width:24,height:24,borderRadius:6,background:"linear-gradient(135deg,#d69e2e,#8B6914)",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:800,color:"#000",fontFamily:"var(--fm)"}}>{p.ticker.slice(0,3)}</div>
        </div>
        {/* Name: flag + name + ticker + badge inline */}
        <div style={{minWidth:0,display:"flex",alignItems:"center",gap:4,overflow:"hidden"}}>
          <span style={{fontSize:14,flexShrink:0}}>{FLAGS[cc]||""}</span>
          <span style={{fontSize:12,fontWeight:600,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name||p.ticker}</span>
          <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",flexShrink:0}}>{p.ticker}</span>
          {badge}
          {p.dataSource==="IB" && <span style={{fontSize:6,fontWeight:700,padding:"1px 3px",borderRadius:3,background:"rgba(100,210,255,.1)",color:"#64d2ff",flexShrink:0}}>IB</span>}
        </div>
        {/* Sparkline */}
        <div style={{width:36,height:16}}>
          {(p.spark||[]).length >= 2 && (() => {
            const s = p.spark;
            const mn = Math.min(...s), mx = Math.max(...s);
            const r = mx-mn || 1;
            const pts = s.map((v,i)=>`${(i/(s.length-1))*36},${16-((v-mn)/r)*14}`).join(" ");
            const up = s[s.length-1] >= s[0];
            return <svg viewBox="0 0 36 16" style={{width:36,height:16}}><polyline points={pts} fill="none" stroke={up?"#30d158":"#ff453a"} strokeWidth="1.2" strokeLinejoin="round"/></svg>;
          })()}
        </div>
        {/* Price */}
        <div style={{textAlign:"right",fontFamily:"var(--fm)"}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)"}}>{origSym}{(isGBX?(p.lastPrice||0)/100:(p.lastPrice||0)).toFixed(2)}</div>
          {isForeign && <div style={{fontSize:8,color:"var(--text-tertiary)",opacity:.6}}>${_sf(priceUSD,2)}</div>}
        </div>
        {showPos && <>
          {/* Shares */}
          <div style={{textAlign:"right",fontSize:11,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{privacyMode?"•••":p.shares?(p.shares||0).toLocaleString():"—"}</div>
          {/* Cost */}
          <div style={{textAlign:"right",fontFamily:"var(--fm)"}}>
            <div style={{fontSize:11,fontWeight:600,color:"var(--text-secondary)"}}>{privacyMode?"•••":origSym+_sf(p.adjustedBasis||p.avgCost||0,2)}</div>
          </div>
          {/* P&L */}
          <div style={{textAlign:"right",fontSize:12,fontWeight:700,color:pnlPct>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{privacyMode?"•••":(pnlPct>=0?"+":"")+_sf(pnlPct*100,0)+"%"}</div>
          {/* Weight bar */}
          <div style={{textAlign:"right",fontFamily:"var(--fm)"}}>
            <div style={{fontSize:10,fontWeight:600,color:"var(--gold)"}}>{_sf(weight*100,1)}%</div>
            <div style={{height:2,background:"rgba(255,255,255,.06)",borderRadius:1,marginTop:1,overflow:"hidden"}}>
              <div style={{width:`${Math.min(weight*100*4,100)}%`,height:"100%",background:"var(--gold)",borderRadius:1}}/>
            </div>
          </div>
          {/* Value */}
          <div style={{textAlign:"right",fontFamily:"var(--fm)"}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)"}}>{privacyMode?"•••":valSym+(valShow>=1e3?_sf(valShow/1e3,1)+"K":_sf(valShow,0))}</div>
          </div>
          {/* Div */}
          <div style={{textAlign:"right",fontSize:11,fontWeight:600,color:dpsUSD>0?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{privacyMode?"•••":(dpsUSD>0?"$"+_sf(dpsUSD,0):"—")}</div>
        </>}
        {!showPos && <>
          <div style={{textAlign:"right",fontSize:12,fontWeight:700,color:p.targetPrice&&p.lastPrice<=p.targetPrice?"var(--green)":"var(--text-secondary)",fontFamily:"var(--fm)"}}>{p.targetPrice?"$"+_sf(toUSD(p.targetPrice,ccy)||0,2):"—"}</div>
        </>}
        {/* Actions */}
        <div style={{display:"flex",gap:2,justifyContent:"flex-end"}} onClick={e=>e.stopPropagation()}>
          <button onClick={(e)=>{e.stopPropagation();openCostBasis(p.ticker);}} title="Cost Basis" style={{width:22,height:22,borderRadius:5,border:"1px solid rgba(200,164,78,.2)",background:"transparent",color:"var(--gold)",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:.5}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity=".5"}>📋</button>
          <button onClick={(e)=>{e.stopPropagation();if(confirm(`¿Eliminar ${p.ticker}?`))removePosition(p.ticker);}} title="Eliminar" style={{width:22,height:22,borderRadius:5,border:"1px solid rgba(255,69,58,.15)",background:"transparent",color:"var(--text-tertiary)",fontSize:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:.3}}
            onMouseEnter={e=>{e.target.style.opacity="1";e.target.style.color="var(--red)";}}
            onMouseLeave={e=>{e.target.style.opacity=".3";e.target.style.color="var(--text-tertiary)";}}>✕</button>
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
    displayCcy, switchDisplayCcy, fxRates, fxLoading, fxLastUpdate, refreshFxRates,
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
    ctrlForm, setCtrlForm, addCtrlEntry,
    // Research
    researchOpenList, setResearchOpenList, researchAdvanced, setResearchAdvanced,
    researchHide, setResearchHide, researchCapFilter, setResearchCapFilter,
    reportData, reportLoading, reportSymbol, openReport,
    // Actions
    openAnalysis, goHome, openCostBasis,
    getCountry, FLAGS, POS_STATIC,
    HOME_TABS, CompanyRow,
    // UI Zoom
    uiZoom, changeZoom,
    // Settings/analysis bridge
    loadFromAPI, fmpLoading, fmpError, setTab, setCfg,
    removePosition, deleteCompany,
    // API data (passed through context so components don't import from data.js)
    CTRL_DATA, INCOME_DATA, DIV_BY_YEAR, DIV_BY_MONTH, GASTOS_MONTH,
    FIRE_PROJ, FIRE_PARAMS, ANNUAL_PL, FI_TRACK, HIST_INIT, GASTO_CATS,
    GASTOS_CAT, CASH_DATA, MARGIN_INTEREST_DATA,
    // IB Integration
    ibData, ibDiscrepancies, loadIBData,
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
    ibData, ibDiscrepancies, loadIBData]);

  // renderCostBasis and renderHome have been extracted to:
  // - components/views/CostBasisView.jsx (via CostBasisContext)
  // - components/views/HomeView.jsx (via HomeContext)

  return !dataLoaded ? (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",background:"#000",fontFamily:"'DM Sans',sans-serif"}}>
      {/* Skeleton header */}
      <div style={{padding:"16px 36px",display:"flex",gap:10,alignItems:"center"}}>
        <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#d69e2e,#b8860b)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#000"}}>A&R</div>
        {[80,70,60,50,70,80,70].map((w,i)=><div key={i} style={{width:w,height:28,borderRadius:6,background:"#161616",animation:"pulse 1.5s infinite",animationDelay:`${i*0.1}s`}}/>)}
      </div>
      {/* Skeleton summary cards */}
      <div style={{padding:"0 36px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:16}}>
        {[0,1,2,3].map(i=><div key={i} style={{background:"#161616",borderRadius:18,padding:"20px",height:100,animation:"pulse 1.5s infinite",animationDelay:`${i*0.15}s`}}>
          <div style={{width:80,height:8,background:"#222",borderRadius:4,marginBottom:12}}/>
          <div style={{width:120,height:24,background:"#222",borderRadius:6}}/>
        </div>)}
      </div>
      {/* Skeleton rows */}
      <div style={{padding:"0 36px",display:"flex",flexDirection:"column",gap:8}}>
        {[0,1,2,3,4,5].map(i=><div key={i} style={{display:"flex",gap:12,alignItems:"center",background:"#161616",borderRadius:16,padding:"12px 16px",animation:"pulse 1.5s infinite",animationDelay:`${i*0.1}s`}}>
          <div style={{width:42,height:42,borderRadius:10,background:"#222",flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{width:100+i*10,height:12,background:"#222",borderRadius:4,marginBottom:6}}/>
            <div style={{width:50,height:8,background:"#1a1a1a",borderRadius:3}}/>
          </div>
          <div style={{width:60,height:16,background:"#222",borderRadius:4}}/>
          <div style={{width:40,height:16,background:"#222",borderRadius:4}}/>
          <div style={{width:50,height:16,background:"#222",borderRadius:4}}/>
        </div>)}
      </div>
      {/* Loading indicator */}
      <div style={{display:"flex",justifyContent:"center",marginTop:24}}>
        <div style={{width:160,height:3,background:"#1a1a1a",borderRadius:3,overflow:"hidden"}}>
          <div style={{width:"60%",height:"100%",background:"linear-gradient(90deg,#d69e2e,#b8860b)",borderRadius:3,animation:"pulse 1s infinite"}}/>
        </div>
      </div>
    </div>
  ) : (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",background:"var(--bg)",color:"var(--text-primary)",fontFamily:"var(--fb)",zoom:uiZoom/100}}>
      {dataError && (
        <div style={{margin:"0 24px",padding:"10px 16px",background:"rgba(255,69,58,.1)",border:"1px solid rgba(255,69,58,.25)",borderRadius:10,display:"flex",alignItems:"center",gap:10,marginTop:8}}>
          <span style={{fontSize:13,color:"var(--red)",fontFamily:"var(--fm)"}}>{dataError}</span>
          <button onClick={()=>setDataError(null)} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
        </div>
      )}

      {viewMode==="home" ? (
        <main style={{flex:1,padding:"32px 36px",overflowY:"auto"}}>
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
          <header style={{position:"sticky",top:0,zIndex:20,background:"rgba(0,0,0,.85)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderBottom:"1px solid var(--border)"}}>
            {/* Row 1: Back + Config */}
            <div className="ar-analysis-header" style={{display:"flex",alignItems:"center",gap:10,padding:"8px 24px 4px",flexWrap:"wrap"}}>
              <button onClick={goHome} style={{padding:"5px 12px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:11,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:600,flexShrink:0}}>← Inicio</button>
              {/* Company logo */}
              <div style={{width:28,height:28,borderRadius:7,overflow:"hidden",background:"#161b22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {cfg.ticker ? (
                  <img src={`https://images.financialmodelingprep.com/symbol/${cfg.ticker.replace(':','.')}.png`} alt="" style={{width:28,height:28,objectFit:"contain"}}
                    onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
                ) : null}
                <div style={{display:cfg.ticker?"none":"flex",width:28,height:28,borderRadius:7,background:"linear-gradient(135deg,#d69e2e,#b8860b)",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#000",fontFamily:"var(--fm)"}}>A&R</div>
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
          <main className="ar-analysis-main" style={{flex:1,padding:"24px 28px",overflowY:"auto"}}>
            <AnalysisContext.Provider value={analysisValue}>
              <div style={{maxWidth:1280,margin:"0 auto",animation:anim?"fadeUp .4s cubic-bezier(.16,1,.3,1)":"none"}} key={tab}><ErrorBoundary><Suspense fallback={<Loading />}>{content[tab]?.()}</Suspense></ErrorBoundary></div>
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
    </div>
  );
}
