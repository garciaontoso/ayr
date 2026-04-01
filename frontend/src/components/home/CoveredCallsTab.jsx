import { useState, useEffect, useMemo, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';

// ── Black-Scholes fallback ──
const normCDF = (x) => {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return 0.5 * (1 + sign * y);
};
const bsCall = (S, K, T, r, sigma) => {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
};
const bsPut = (S, K, T, r, sigma) => {
  // Put-call parity: P = C - S + K*e^(-rT)
  const c = bsCall(S, K, T, r, sigma);
  return c - S + K * Math.exp(-r * T);
};
const probOTM = (S, K, T, r, sigma) => {
  if (T <= 0 || sigma <= 0) return 0;
  const d2 = (Math.log(S / K) + (r - sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  return normCDF(-d2);
};
const calcHV = (prices) => {
  if (!prices || prices.length < 10) return 0.30;
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i-1] > 0) returns.push(Math.log(prices[i] / prices[i-1]));
  }
  if (!returns.length) return 0.30;
  const mean = returns.reduce((s,r) => s+r, 0) / returns.length;
  const variance = returns.reduce((s,r) => s + (r-mean)*(r-mean), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
};

const SORT_OPTIONS = [
  {id:"yield",lbl:"Yield CC",fn:(a,b)=>(b.yieldCC||0)-(a.yieldCC||0)},
  {id:"premium",lbl:"Prima Total",fn:(a,b)=>(b.totalPremium||0)-(a.totalPremium||0)},
  {id:"signal",lbl:"Señal",fn:(a,b)=>(a.signalOrder||9)-(b.signalOrder||9)},
  {id:"ticker",lbl:"Ticker",fn:(a,b)=>a.ticker.localeCompare(b.ticker)},
  {id:"iv",lbl:"IV",fn:(a,b)=>(b.iv||0)-(a.iv||0)},
  {id:"oi",lbl:"Liquidez",fn:(a,b)=>(b.oi||0)-(a.oi||0)},
  {id:"arorc",lbl:"ARORC",fn:(a,b)=>(b.arorc||0)-(a.arorc||0)},
];

const DTE_OPTIONS = [7, 14, 21, 30, 45, 60, 90];
const RISK_FREE = 0.045;
const WHEEL_KEY = "ayr_wheel";
const SECTIONS = [
  {id:"calls",lbl:"📊 Covered Calls"},
  {id:"rolls",lbl:"🔄 Roll Advisor"},
  {id:"puts",lbl:"💰 Sell Puts"},
  {id:"live",lbl:"📡 Posiciones IB"},
  {id:"wheel",lbl:"🎡 Wheel Tracker"},
];

export default function CoveredCallsTab() {
  const { portfolioTotals, positions, openAnalysis, hide, privacyMode, ibData } = useHome();

  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [earningsData, setEarningsData] = useState({});
  const [priceData, setPriceData] = useState({});
  const [optionsData, setOptionsData] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // increment to force refresh
  const [dte, setDte] = useState(30);
  const [otmPct, setOtmPct] = useState(5);
  const [sortBy, setSortBy] = useState("yield");
  const [signalFilter, setSignalFilter] = useState("all");
  const [calcTicker, setCalcTicker] = useState(null);
  const [calcStrike, setCalcStrike] = useState(0);
  const [calcDte, setCalcDte] = useState(30);
  const [dataSource, setDataSource] = useState("loading"); // "yahoo" | "bs"
  const [yahooCount, setYahooCount] = useState(0);
  const [marketCtx, setMarketCtx] = useState({ vix: 0, spy: 0, spyChg: 0, spyChgPct: 0 });
  const [section, setSection] = useState("calls");

  // Wheel tracker state (localStorage)
  const [wheelEntries, setWheelEntries] = useState(() => {
    try { return JSON.parse(localStorage.getItem(WHEEL_KEY)) || []; } catch { return []; }
  });
  const [wheelForm, setWheelForm] = useState({ ticker:"", phase:"put", strike:"", premium:"", expiration:"", notes:"" });
  const [wheelEditIdx, setWheelEditIdx] = useState(-1);
  const [ccHistory, setCcHistory] = useState(null);

  // Fetch CC trade history from cost_basis
  useEffect(() => {
    fetch(`${API_URL}/api/cost-basis-all?tipo=OPTION&limit=2000&sort=fecha&dir=desc`)
      .then(r => r.json())
      .then(d => setCcHistory(d.results || []))
      .catch(() => setCcHistory([]));
  }, []);

  // Monthly CC income from trade history
  const ccMonthlyIncome = useMemo(() => {
    if (!ccHistory) return null;
    const year = new Date().getFullYear();
    const months = Array.from({length:12}, () => 0);
    let ytd = 0;
    ccHistory.forEach(t => {
      const amt = Math.abs(t.coste || 0);
      if (amt <= 0) return;
      // coste > 0 = premium received (sold option)
      if ((t.coste || 0) <= 0) return;
      const d = t.fecha ? new Date(t.fecha) : null;
      if (!d) return;
      if (d.getFullYear() === year) {
        months[d.getMonth()] += amt;
        ytd += amt;
      }
    });
    return { months, ytd };
  }, [ccHistory]);

  // Win rate from wheel entries (expired worthless = win, assigned = loss)
  const winRate = useMemo(() => {
    const expired = wheelEntries.filter(e => e.expiration && new Date(e.expiration) < new Date());
    if (expired.length === 0) return null;
    // Entries that went from put→call means assignment happened (loss for that put)
    // Entries still in put/waiting phase that expired = expired worthless (win)
    const wins = expired.filter(e => e.phase === "put" || e.phase === "waiting").length;
    const losses = expired.filter(e => e.phase === "call").length;
    const total = wins + losses;
    return total > 0 ? { wins, losses, total, pct: wins / total } : null;
  }, [wheelEntries]);

  const saveWheel = useCallback((entries) => {
    setWheelEntries(entries);
    localStorage.setItem(WHEEL_KEY, JSON.stringify(entries));
  }, []);

  // Get eligible positions (≥100 shares, US-traded only for options)
  const eligible = useMemo(() => {
    return (portfolioTotals.positions || []).filter(p =>
      (p.shares || 0) >= 100 && p.lastPrice > 0
    );
  }, [portfolioTotals.positions]);

  // US tickers only (options only trade on US exchanges)
  const usTickers = useMemo(() => {
    return eligible.filter(p => !p.ticker.includes(":")).map(p => p.ticker);
  }, [eligible]);

  // Progressive loading: show B-S estimates instantly, then load real data in background
  const [yahooProgress, setYahooProgress] = useState(0);

  useEffect(() => {
    if (!eligible.length) { setLoading(false); return; }
    const tickers = eligible.map(p => p.ticker);

    // 0. Market context (VIX + SPY) — fast
    fetch(`${API_URL}/api/prices?tickers=^VIX,SPY`)
      .then(r => r.json())
      .then(data => {
        const vix = data?.["^VIX"];
        const spy = data?.SPY;
        setMarketCtx({
          vix: vix?.price || 0,
          spy: spy?.price || 0,
          spyChg: spy?.change || 0,
          spyChgPct: spy?.changePct || 0,
        });
      })
      .catch(() => {});

    // 1. Earnings (fast, parallel)
    fetch(`${API_URL}/api/earnings-batch?symbols=${tickers.join(",")}`)
      .then(r => r.json())
      .then(data => setEarningsData(data || {}))
      .catch(() => {});

    // 2. Price history for HV/B-S (show table immediately after this)
    const fetchPrices = async () => {
      const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const results = {};
      for (let i = 0; i < tickers.length; i += 5) {
        const batch = tickers.slice(i, i + 5);
        await Promise.all(batch.map(async t => {
          try {
            const r = await fetch(`${API_URL}/api/price-history?symbol=${t}&from=${from}`);
            const d = await r.json();
            results[t] = (Array.isArray(d.historical) ? d.historical : Array.isArray(d) ? d : []).map(p => p.close).reverse();
          } catch { results[t] = []; }
        }));
      }
      setPriceData(results);
      // Table now shows with B-S estimates — loading done
      setLoading(false);
      setDataSource("bs");
      setLastUpdate(new Date());

      // 3. Background: load real Yahoo data progressively in batches of 5
      if (usTickers.length > 0) {
        let loaded = 0;
        for (let i = 0; i < usTickers.length; i += 5) {
          const batch = usTickers.slice(i, i + 5);
          try {
            const r = await fetch(`${API_URL}/api/options-batch?symbols=${batch.join(",")}&dte=${dte}&otm=${otmPct}`);
            const data = await r.json();
            // Update incrementally — each batch replaces B-S with real data
            setOptionsData(prev => {
              const updated = { ...prev };
              for (const [sym, val] of Object.entries(data)) {
                if (val && val.bid !== undefined && !val.error) {
                  updated[sym] = { ...val, source: "YAHOO" };
                  loaded++;
                }
              }
              return updated;
            });
            setYahooProgress(Math.round((i + batch.length) / usTickers.length * 100));
            setYahooCount(loaded);
            setDataSource(loaded > 0 ? "yahoo" : "bs");
          } catch(e) { console.warn("Yahoo batch error:", e); }
        }
        setYahooProgress(100);
        setLastUpdate(new Date());
      }
    };
    fetchPrices();
  }, [eligible, dte, otmPct, refreshKey]);

  // Auto-refresh every 15 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate CC data for each position
  const ccData = useMemo(() => {
    const T = dte / 365;
    const otm = otmPct / 100;
    const now = new Date();

    return eligible.map(p => {
      const S = p.lastPrice || 0;
      const shares = p.shares || 0;
      const contracts = Math.floor(shares / 100);
      const opt = optionsData[p.ticker];
      const hasRealData = opt && opt.bid !== undefined && !opt.error;

      let K, iv, premium, bid, ask, oi, volume, expiration, realDTE, source, delta, gamma, theta, vega;

      if (hasRealData) {
        // ✅ Real market data (Massive or Yahoo)
        K = opt.strike;
        iv = opt.iv || 0;
        bid = opt.bid || 0;
        ask = opt.ask || 0;
        premium = bid; // Use bid (what you'd actually get when selling)
        oi = opt.oi || 0;
        volume = opt.volume || 0;
        // Greeks from Massive
        delta = opt.delta || null;
        gamma = opt.gamma || null;
        theta = opt.theta || null;
        vega = opt.vega || null;
        expiration = opt.expiration;
        realDTE = opt.dte || dte;
        source = opt.source === "MASSIVE" ? "MASSIVE" : opt.source === "YAHOO" ? "YAHOO" : opt.source === "IB" ? "IB" : "REAL";
      } else {
        // 🔄 Black-Scholes fallback
        K = Math.round(S * (1 + otm));
        iv = calcHV(priceData[p.ticker]);
        premium = bsCall(S, K, T, RISK_FREE, iv);
        bid = premium * 0.95; // estimate bid ~5% below theoretical
        ask = premium * 1.05;
        oi = 0;
        volume = 0;
        expiration = null;
        realDTE = dte;
        source = "B-S";
        delta = null; gamma = null; theta = null; vega = null;
      }

      const totalPremium = premium * 100 * contracts;
      const yieldCC = S > 0 ? (premium / S) * (365 / Math.max(realDTE, 1)) : 0;
      const pOTM = probOTM(S, K, T, RISK_FREE, iv || calcHV(priceData[p.ticker]) || 0.30);
      const pITM = 1 - pOTM;
      const distancePct = S > 0 ? (K - S) / S : 0;

      // Liquidity score
      const liquidityOK = oi > 50 || source === "B-S";
      const spreadPct = ask > 0 ? (ask - bid) / ask : 1;
      const liquidityGood = spreadPct < 0.20 && oi > 100;

      // Earnings timing
      const earn = earningsData[p.ticker];
      const nextEarnings = earn?.nextDate ? new Date(earn.nextDate) : null;
      const daysToEarnings = nextEarnings ? Math.ceil((nextEarnings - now) / 86400000) : 999;

      // Signal logic
      let signal, signalColor, signalOrder, timing;
      if (contracts === 0) {
        signal = "⚫"; signalColor = "#48484a"; signalOrder = 4; timing = "<100 acciones";
      } else if (daysToEarnings < 14) {
        signal = "🔴"; signalColor = "#ff453a"; signalOrder = 3; timing = `Earnings ${earn?.nextDate || "pronto"} — EVITAR`;
      } else if (iv < 0.15 || (!liquidityOK && source !== "B-S")) {
        signal = "🔴"; signalColor = "#ff453a"; signalOrder = 3;
        timing = !liquidityOK ? `Sin liquidez (OI: ${oi})` : `IV muy baja (${_sf(iv*100,0)}%)`;
      } else if (daysToEarnings < 45 || iv < 0.20 || (spreadPct > 0.25 && source !== "B-S")) {
        signal = "🟡"; signalColor = "#ffd60a"; signalOrder = 2;
        timing = daysToEarnings < 45 ? `Earnings en ${daysToEarnings}d` : spreadPct > 0.25 ? `Spread amplio (${_sf(spreadPct*100,0)}%)` : `IV baja (${_sf(iv*100,0)}%)`;
      } else {
        signal = "🟢"; signalColor = "#30d158"; signalOrder = 1;
        timing = nextEarnings ? `OK — earnings ${_sf(daysToEarnings,0)}d` : "OK — sin eventos";
      }

      const assignRisk = pITM > 0.4 ? "ALTO" : pITM > 0.2 ? "MEDIO" : "BAJO";
      const assignColor = pITM > 0.4 ? "#ff453a" : pITM > 0.2 ? "#ffd60a" : "#30d158";

      // ARORC Static = solo prima (stock no llega al strike)
      // ARORC Called = prima + subida hasta strike (te ejercitan)
      const riskCapital = S - premium;
      const arorcStaticPeriod = riskCapital > 0 ? premium / riskCapital : 0;
      const arorcCalledPeriod = riskCapital > 0 ? (K > S ? (K - S + premium) / riskCapital : premium / riskCapital) : 0;
      const arorcStatic = arorcStaticPeriod * (365 / Math.max(realDTE, 1));
      const arorcCalled = arorcCalledPeriod * (365 / Math.max(realDTE, 1));
      // Backward compat
      const arorcPeriod = arorcCalledPeriod;
      const arorc = arorcCalled;

      return {
        ...p, contracts, K, iv, premium, bid, ask, oi, volume, totalPremium, yieldCC,
        delta, gamma, theta, vega,
        pOTM, pITM, distancePct, assignRisk, assignColor, source, arorc, arorcPeriod,
        arorcStaticPeriod, arorcCalledPeriod, arorcStatic, arorcCalled,
        signal, signalColor, signalOrder, timing, daysToEarnings,
        expiration, realDTE, liquidityGood, spreadPct,
        breakeven: S + premium,
        maxProfit: (K > S ? (K - S + premium) : premium) * 100 * contracts,
      };
    });
  }, [eligible, priceData, optionsData, earningsData, dte, otmPct]);

  // Filtered and sorted
  const filtered = useMemo(() => {
    let list = ccData;
    if (signalFilter === "green") list = list.filter(x => x.signalOrder === 1);
    if (signalFilter === "yellow") list = list.filter(x => x.signalOrder <= 2);
    if (signalFilter === "eligible") list = list.filter(x => x.contracts > 0);
    return [...list].sort(SORT_OPTIONS.find(s => s.id === sortBy)?.fn || (() => 0));
  }, [ccData, signalFilter, sortBy]);

  // Totals
  const totalPremiumAll = ccData.filter(x => x.signalOrder <= 2).reduce((s, x) => s + x.totalPremium, 0);
  const totalPremiumAnnual = totalPremiumAll * (365 / dte);
  const eligibleCount = ccData.filter(x => x.contracts > 0).length;
  const greenCount = ccData.filter(x => x.signalOrder === 1).length;
  const realCount = ccData.filter(x => x.source !== "B-S").length;

  // Calculator
  const calcPos = calcTicker ? ccData.find(x => x.ticker === calcTicker) : null;
  const calcPremium = calcPos ? bsCall(calcPos.lastPrice, calcStrike || calcPos.K, calcDte / 365, RISK_FREE, calcPos.iv) : 0;
  const calcPOTM = calcPos ? probOTM(calcPos.lastPrice, calcStrike || calcPos.K, calcDte / 365, RISK_FREE, calcPos.iv) : 0;

  // ── Roll Advisor data ──
  const rollData = useMemo(() => {
    return ccData
      .filter(p => p.contracts > 0 && p.K > 0)
      .map(p => {
        const S = p.lastPrice;
        const ratio = S / p.K;
        let light, lightLabel, lightColor;
        if (ratio >= 1) { light = "red"; lightLabel = "ROLAR YA"; lightColor = "#ff453a"; }
        else if (ratio >= 0.95) { light = "yellow"; lightLabel = "VIGILAR"; lightColor = "#ffd60a"; }
        else { light = "green"; lightLabel = "OK"; lightColor = "#30d158"; }

        // Suggested new strike: 5-10% OTM from current price
        const newStrike5 = Math.round(S * 1.05);
        const newStrike10 = Math.round(S * 1.10);
        // New expiration: +30 days from current expiration or from now
        const baseDate = p.expiration ? new Date(p.expiration) : new Date();
        const newExpDate = new Date(baseDate.getTime() + 30 * 86400000);
        const newExpStr = newExpDate.toISOString().slice(0,10);
        const newDTE = Math.max(Math.ceil((newExpDate - new Date()) / 86400000), 1);
        const newT = newDTE / 365;

        const iv = p.iv || 0.30;
        // Cost to buy back current call (use ask price)
        const buyBackCost = p.ask || bsCall(S, p.K, Math.max((p.realDTE||1)/365, 0.001), RISK_FREE, iv);
        // Premium from selling new call
        const newPrem5 = bsCall(S, newStrike5, newT, RISK_FREE, iv);
        const newPrem10 = bsCall(S, newStrike10, newT, RISK_FREE, iv);
        const netCredit5 = newPrem5 - buyBackCost;
        const netCredit10 = newPrem10 - buyBackCost;

        return { ...p, ratio, light, lightLabel, lightColor, buyBackCost, newStrike5, newStrike10, newExpStr, newDTE, newPrem5, newPrem10, netCredit5, netCredit10 };
      })
      .filter(p => p.ratio >= 0.95) // Only show positions that need attention
      .sort((a,b) => b.ratio - a.ratio);
  }, [ccData]);

  // ── Sell Puts data ──
  const putData = useMemo(() => {
    const T = 30 / 365; // 30-day puts
    return eligible.map(p => {
      const S = p.lastPrice || 0;
      if (S <= 0) return null;
      const iv = calcHV(priceData[p.ticker]) || 0.30;
      const inPortfolio = true; // all eligible are in portfolio

      // Generate put strikes at 5%, 7%, 10% below current price
      return [5, 7, 10].map(pct => {
        const K = Math.round(S * (1 - pct / 100));
        const putPrem = Math.max(bsPut(S, K, T, RISK_FREE, iv), 0);
        const premPct = S > 0 ? putPrem / S : 0;
        const annYield = premPct * (365 / 30);
        const breakeven = K - putPrem;
        const cashRequired = K * 100;
        const effectivePrice = K - putPrem;
        const discountPct = S > 0 ? (S - effectivePrice) / S : 0;
        return {
          ticker: p.ticker, name: p.name, S, K, putPrem, premPct, annYield, breakeven,
          cashRequired, effectivePrice, discountPct, iv, inPortfolio, otmPct: pct,
          shares: p.shares || 0,
        };
      });
    }).filter(Boolean).flat().filter(x => x.putPrem > 0.05).sort((a,b) => b.annYield - a.annYield);
  }, [eligible, priceData]);

  const hd = {fontSize:13,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10,paddingBottom:6,borderBottom:"2px solid rgba(200,164,78,.2)"};
  const card = {background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:16,marginBottom:14};
  const pill = (active) => ({padding:"5px 14px",borderRadius:8,border:`1px solid ${active?"var(--gold)":"var(--border)"}`,background:active?"var(--gold-dim)":"transparent",color:active?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:active?700:500,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .15s"});

  if (loading) return <InlineLoading message={`Cargando opciones para ${eligible.length} posiciones... ${loadingMsg}`} />;

  if (eligible.length === 0) return <EmptyState icon="📋" title="Sin posiciones elegibles para covered calls" subtitle="Necesitas al menos 100 acciones de una posicion para vender calls cubiertos." />;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* ── DATA SOURCE BADGE + REFRESH ── */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:9,padding:"3px 8px",borderRadius:6,fontFamily:"var(--fm)",fontWeight:600,
          background: dataSource === "yahoo" ? "rgba(48,209,88,.1)" : "var(--subtle-bg2)",
          color: dataSource === "yahoo" ? "#30d158" : "var(--text-tertiary)",
          border: `1px solid ${dataSource === "yahoo" ? "rgba(48,209,88,.3)" : "var(--border)"}`}}>
          {dataSource === "yahoo"
            ? (yahooProgress < 100 ? `📡 Yahoo ${yahooCount}/${usTickers.length} (${yahooProgress}%)` : `📡 Yahoo · ${yahooCount} tickers`)
            : (yahooProgress > 0 && yahooProgress < 100 ? `📐 B-S → Yahoo ${yahooProgress}%` : "📐 Black-Scholes")}
        </span>
        {yahooProgress > 0 && yahooProgress < 100 && (
          <div style={{width:80,height:4,background:"var(--subtle-bg2)",borderRadius:2,overflow:"hidden"}}>
            <div style={{width:`${yahooProgress}%`,height:"100%",background:"#30d158",borderRadius:2,transition:"width .3s"}}/>
          </div>
        )}
        <button onClick={()=>{setLoading(true); setRefreshKey(k=>k+1);}} style={{fontSize:9,padding:"3px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",cursor:"pointer",fontFamily:"var(--fm)",fontWeight:600,transition:"all .15s"}}
          onMouseEnter={e=>e.target.style.borderColor="var(--gold)"} onMouseLeave={e=>e.target.style.borderColor="var(--border)"}>
          🔄 Refresh
        </button>
        {lastUpdate && <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
          Actualizado: {lastUpdate.toLocaleTimeString("es-ES")} · Auto-refresh: 15min
        </span>}
      </div>

      {/* ── MARKET CONTEXT PANEL ── */}
      {(marketCtx.vix > 0 || marketCtx.spy > 0) && (
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {/* VIX */}
          <div style={{padding:"8px 14px",borderRadius:10,border:`1px solid ${marketCtx.vix>25?"rgba(48,209,88,.3)":marketCtx.vix>18?"rgba(255,214,10,.2)":"rgba(255,69,58,.2)"}`,background:marketCtx.vix>25?"rgba(48,209,88,.04)":marketCtx.vix>18?"rgba(255,214,10,.04)":"rgba(255,69,58,.04)",flex:"0 0 auto"}}>
            <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.5}}>VIX</div>
            <div style={{fontSize:18,fontWeight:700,fontFamily:"var(--fm)",color:marketCtx.vix>25?"var(--green)":marketCtx.vix>18?"#ffd60a":"var(--red)"}}>{_sf(marketCtx.vix,1)}</div>
            <div style={{fontSize:8,fontFamily:"var(--fm)",color:marketCtx.vix>25?"var(--green)":marketCtx.vix>18?"#ffd60a":"var(--red)"}}>
              {marketCtx.vix>30?"🟢 Primas altas":marketCtx.vix>25?"🟢 Buen momento":marketCtx.vix>18?"🟡 Moderado":"🔴 Primas bajas"}
            </div>
          </div>
          {/* SPY */}
          <div style={{padding:"8px 14px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",flex:"0 0 auto"}}>
            <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.5}}>S&P 500</div>
            <div style={{fontSize:18,fontWeight:700,fontFamily:"var(--fm)",color:"var(--text-primary)"}}>${_sf(marketCtx.spy,0)}</div>
            <div style={{fontSize:9,fontFamily:"var(--fm)",color:marketCtx.spyChgPct>=0?"var(--green)":"var(--red)",fontWeight:600}}>
              {marketCtx.spyChgPct>=0?"+":""}{_sf(marketCtx.spyChgPct,2)}% hoy
            </div>
          </div>
          {/* Guidance */}
          <div style={{padding:"8px 14px",borderRadius:10,border:"1px solid var(--border)",background:"rgba(200,164,78,.03)",flex:1,minWidth:200}}>
            <div style={{fontSize:8,color:"var(--gold)",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.5}}>RECOMENDACIÓN</div>
            <div style={{fontSize:11,fontFamily:"var(--fm)",color:"var(--text-secondary)",marginTop:2}}>
              {marketCtx.vix > 25
                ? "✅ VIX alto — buen momento para vender opciones. Las primas están infladas."
                : marketCtx.vix > 18
                ? "⚡ VIX normal — selecciona strikes conservadores (7-10% OTM)."
                : "⚠️ VIX bajo — las primas son pequeñas. Considera esperar a más volatilidad o vender más cerca del dinero."}
              {marketCtx.spyChgPct < -1 && " 📉 Mercado bajista hoy — cuidado con puts."}
              {marketCtx.spyChgPct > 1 && " 📈 Mercado alcista hoy — buen momento para covered calls."}
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION TOGGLE ── */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {SECTIONS.map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={pill(section===s.id)}>{s.lbl}</button>
        ))}
      </div>

      {/* ══════ CALLS SECTION ══════ */}
      {section === "calls" && <>
      {/* ── HEADER: Income Summary ── */}
      <div className="ar-cc-summary" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        {[
          {l:"PREMIUM MENSUAL",v:privacyMode?"•••":"$"+fDol(totalPremiumAll),c:"var(--gold)"},
          {l:"PREMIUM ANUAL",v:privacyMode?"•••":"$"+fDol(totalPremiumAnnual),c:"var(--gold)"},
          {l:"ELEGIBLES",v:`${eligibleCount} de ${ccData.length}`,c:"var(--text-primary)"},
          {l:"SEÑAL VERDE",v:`${greenCount} pos.`,c:"var(--green)"},
        ].map((m,i)=>(
          <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 14px"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5}}>{m.l}</div>
            <div style={{fontSize:18,fontWeight:700,color:m.c,fontFamily:"var(--fm)",marginTop:3}}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* ── YTD INCOME + WIN RATE ── */}
      {ccMonthlyIncome && (
        <div style={{display:"grid",gridTemplateColumns:winRate?"1fr 1fr":"1fr",gap:10}}>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:16}}>
            <div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5}}>PREMIUM COBRADO YTD ({new Date().getFullYear()})</div>
              <div style={{fontSize:28,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)",marginTop:4}}>{privacyMode?"***":"$"+fDol(ccMonthlyIncome.ytd)}</div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>
                Media mensual: {privacyMode?"***":"$"+_sf(ccMonthlyIncome.ytd / Math.max(new Date().getMonth()+1,1),0)} / mes
              </div>
            </div>
          </div>
          {winRate && (
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:16}}>
              <div>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5}}>WIN RATE (WHEEL TRACKER)</div>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginTop:4}}>
                  <div style={{fontSize:28,fontWeight:700,color:winRate.pct>0.7?"var(--green)":winRate.pct>0.5?"var(--gold)":"var(--red)",fontFamily:"var(--fm)"}}>{_sf(winRate.pct*100,0)}%</div>
                  <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{winRate.wins}W / {winRate.losses}L</div>
                </div>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>
                  {winRate.wins} expiraron sin valor (ganancia) de {winRate.total} cerradas
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MONTHLY CC INCOME CALENDAR ── */}
      {ccMonthlyIncome && ccMonthlyIncome.ytd > 0 && (
        <div style={card}>
          <div style={hd}>Calendario de Primas — {new Date().getFullYear()}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))",gap:6}}>
            {ccMonthlyIncome.months.map((amt,i) => {
              const maxM = Math.max(...ccMonthlyIncome.months, 1);
              const intensity = amt > 0 ? Math.max(0.15, amt / maxM) : 0;
              const now = new Date();
              const isCurrent = i === now.getMonth();
              const isFuture = i > now.getMonth();
              return (
                <div key={i} style={{
                  padding:"10px 8px",textAlign:"center",borderRadius:8,
                  background: isFuture ? "var(--row-alt)" : amt > 0 ? `rgba(48,209,88,${intensity * 0.25})` : "var(--row-alt)",
                  border: isCurrent ? "1px solid var(--gold)" : "1px solid transparent",
                  opacity: isFuture ? 0.4 : 1,
                }}>
                  <div style={{fontSize:9,color:isCurrent?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:isCurrent?700:600}}>
                    {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][i]}
                  </div>
                  <div style={{fontSize:16,fontWeight:700,color:amt>0?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>
                    {isFuture ? "---" : privacyMode ? "***" : amt > 0 ? "$"+_sf(amt,0) : "$0"}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Mini bar chart under calendar */}
          <div style={{display:"flex",alignItems:"flex-end",gap:3,height:50,marginTop:10}}>
            {ccMonthlyIncome.months.map((amt,i) => {
              const maxM = Math.max(...ccMonthlyIncome.months, 1);
              const h = amt > 0 ? Math.max((amt / maxM) * 100, 4) : 2;
              const isFuture = i > new Date().getMonth();
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                  <div style={{width:"100%",height:`${h}%`,background:isFuture?"var(--subtle-border)":"var(--green)",borderRadius:"2px 2px 0 0",opacity:isFuture?0.3:0.5,transition:"height .5s ease"}}/>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CONTROLS ── */}
      <div className="ar-cc-controls" style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>DTE:</div>
        {DTE_OPTIONS.map(d=>(
          <button key={d} onClick={()=>setDte(d)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${dte===d?"var(--gold)":"var(--border)"}`,background:dte===d?"var(--gold-dim)":"transparent",color:dte===d?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:dte===d?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>{d}d</button>
        ))}
        <div style={{width:1,height:16,background:"var(--border)",margin:"0 4px"}}/>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>OTM:</div>
        {[3,5,7,10].map(p=>(
          <button key={p} onClick={()=>setOtmPct(p)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${otmPct===p?"var(--gold)":"var(--border)"}`,background:otmPct===p?"var(--gold-dim)":"transparent",color:otmPct===p?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:otmPct===p?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>{p}%</button>
        ))}
        <div style={{width:1,height:16,background:"var(--border)",margin:"0 4px"}}/>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Filtro:</div>
        {[{id:"all",l:"Todas"},{id:"eligible",l:"Elegibles"},{id:"green",l:"🟢 Verde"},{id:"yellow",l:"🟡+ Verde"}].map(f=>(
          <button key={f.id} onClick={()=>setSignalFilter(f.id)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${signalFilter===f.id?"var(--gold)":"var(--border)"}`,background:signalFilter===f.id?"var(--gold-dim)":"transparent",color:signalFilter===f.id?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:signalFilter===f.id?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>{f.l}</button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Ordenar:</span>
          {SORT_OPTIONS.map(s=>(
            <button key={s.id} onClick={()=>setSortBy(s.id)} style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${sortBy===s.id?"var(--gold)":"var(--border)"}`,background:sortBy===s.id?"var(--gold-dim)":"transparent",color:sortBy===s.id?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:sortBy===s.id?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>{s.lbl}</button>
          ))}
        </div>
      </div>

      {/* ── MAIN TABLE ── */}
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:1200}}>
          <thead>
            <tr style={{borderBottom:"2px solid var(--border)"}}>
              {["","Ticker","Precio","Ctrts","Strike","Dist.","Bid","Ask","IV","Δ","θ","OI","Total","Estático","Asignado","Exp.","Señal",""].map(h=>(
                <th key={h} style={{padding:"6px 8px",textAlign:h==="Ticker"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:.3,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p=>(
              <tr key={p.ticker} onClick={()=>openAnalysis(p.ticker)} style={{borderBottom:"1px solid var(--subtle-border)",cursor:"pointer",transition:"background .15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--card-hover)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"6px 4px",width:28}}>
                  <img src={`https://images.financialmodelingprep.com/symbol/${p.ticker}.png`} alt="" style={{width:24,height:24,borderRadius:5,background:"#161b22"}} onError={e=>{e.target.style.display="none";}}/>
                </td>
                <td style={{padding:"6px 8px",fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",textAlign:"left"}}>
                  {p.ticker}
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontWeight:400}}>{(p.name||"").slice(0,20)}</div>
                </td>
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)"}}>${_sf(p.lastPrice,2)}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:p.contracts>0?"var(--text-primary)":"var(--text-tertiary)",fontWeight:p.contracts>0?700:400}}>{p.contracts}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)"}}>${_sf(p.K,0)}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:p.distancePct>0.07?"var(--green)":p.distancePct>0.03?"var(--text-primary)":"var(--red)"}}>{_sf(p.distancePct*100,1)}%</td>
                {/* Bid/Ask with color coding */}
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--green)",fontWeight:600}}>${_sf(p.bid,2)}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>${_sf(p.ask,2)}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:p.iv>0.35?"var(--green)":p.iv>0.20?"var(--text-primary)":"var(--text-tertiary)"}}>{_sf(p.iv*100,0)}%</td>
                {/* Delta */}
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontSize:10,color:p.delta!=null?(Math.abs(p.delta)<0.3?"var(--green)":Math.abs(p.delta)<0.5?"var(--gold)":"var(--red)"):"var(--text-tertiary)"}}>
                  {p.delta != null ? _sf(p.delta, 2) : "—"}
                </td>
                {/* Theta */}
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontSize:10,color:p.theta!=null?"#bf5af2":"var(--text-tertiary)"}}>
                  {p.theta != null ? _sf(p.theta, 2) : "—"}
                </td>
                {/* Open Interest — liquidity indicator */}
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontSize:9,
                  color:p.oi>500?"var(--green)":p.oi>100?"var(--text-secondary)":p.oi>0?"var(--text-tertiary)":"var(--text-tertiary)"}}>
                  {p.source !== "B-S" ? (p.oi > 1000 ? _sf(p.oi/1000,1)+"K" : p.oi) : "—"}
                </td>
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",fontWeight:600}}>{privacyMode?"•••":"$"+_sf(p.totalPremium,0)}</td>
                {/* ARORC Estático: solo prima */}
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)"}}>
                  <div style={{fontWeight:700,fontSize:12,color:p.arorcStaticPeriod>0.02?"var(--green)":p.arorcStaticPeriod>0.008?"var(--gold)":"var(--text-tertiary)"}}>{_sf(p.arorcStaticPeriod*100,2)}%</div>
                  <div style={{fontSize:8,color:"var(--gold)",opacity:.7}}>{_sf(p.arorcStatic*100,0)}% ann</div>
                </td>
                {/* ARORC Asignado: prima + upside */}
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)"}}>
                  <div style={{fontWeight:700,fontSize:12,color:p.arorcCalledPeriod>0.03?"var(--green)":p.arorcCalledPeriod>0.01?"#64d2ff":"var(--text-tertiary)"}}>{_sf(p.arorcCalledPeriod*100,2)}%</div>
                  <div style={{fontSize:8,color:"#64d2ff",opacity:.7}}>{_sf(p.arorcCalled*100,0)}% ann</div>
                </td>
                {/* Expiration date */}
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontSize:9,color:"var(--text-secondary)"}}>
                  {p.expiration || "—"}
                </td>
                {/* Signal + timing combined */}
                <td style={{padding:"6px 8px",textAlign:"center"}}>
                  <div style={{fontSize:14}}>{p.signal}</div>
                  <div style={{fontSize:7,color:p.signalColor,fontFamily:"var(--fm)",whiteSpace:"nowrap",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}} title={p.timing}>{p.timing}</div>
                </td>
                {/* Source badge */}
                <td style={{padding:"6px 4px",textAlign:"center"}}>
                  <span style={{fontSize:7,padding:"1px 4px",borderRadius:3,fontFamily:"var(--fm)",fontWeight:600,
                    background:p.source==="MASSIVE"?"rgba(100,210,255,.1)":p.source==="YAHOO"?"rgba(48,209,88,.1)":"var(--subtle-bg2)",
                    color:p.source==="MASSIVE"?"#64d2ff":p.source==="YAHOO"?"#30d158":"var(--text-tertiary)",
                    border:`1px solid ${p.source==="MASSIVE"?"rgba(100,210,255,.2)":p.source==="YAHOO"?"rgba(48,209,88,.2)":"var(--subtle-bg2)"}`}}>
                    {p.source === "MASSIVE" ? "MSV" : p.source}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── QUICK CALCULATOR ── */}
      <div style={card}>
        <div style={hd}>Calculadora Rápida</div>
        <div style={{display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>Posición</div>
            <select value={calcTicker||""} onChange={e=>{setCalcTicker(e.target.value); const pos = ccData.find(x=>x.ticker===e.target.value); if(pos) setCalcStrike(pos.K);}}
              style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none",minWidth:120}}>
              <option value="">Seleccionar...</option>
              {ccData.filter(x=>x.contracts>0).map(p=><option key={p.ticker} value={p.ticker}>{p.ticker} ({p.contracts} ctrts) {p.source==="REAL"?"📡":""}</option>)}
            </select>
          </div>
          {calcPos && <>
            <div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>Strike ($)</div>
              <input type="number" value={calcStrike} onChange={e=>setCalcStrike(Number(e.target.value))}
                style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none",width:80}}/>
            </div>
            <div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>DTE</div>
              <div style={{display:"flex",gap:4}}>
                {DTE_OPTIONS.map(d=>(
                  <button key={d} onClick={()=>setCalcDte(d)} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${calcDte===d?"var(--gold)":"var(--border)"}`,background:calcDte===d?"var(--gold-dim)":"transparent",color:calcDte===d?"var(--gold)":"var(--text-tertiary)",fontSize:9,cursor:"pointer",fontFamily:"var(--fm)"}}>{d}d</button>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:16,marginLeft:16}}>
              {[
                {l:"Prima/acción",v:"$"+_sf(calcPremium,2),c:"var(--text-primary)"},
                {l:"Total",v:"$"+_sf(calcPremium*100*calcPos.contracts,0),c:"var(--gold)"},
                {l:"Yield (ann.)",v:_sf((calcPremium/calcPos.lastPrice)*(365/calcDte)*100,1)+"%",c:calcPremium/calcPos.lastPrice*(365/calcDte)>0.12?"var(--green)":"var(--gold)"},
                {l:"P(OTM)",v:_sf(calcPOTM*100,0)+"%",c:calcPOTM>0.7?"var(--green)":"var(--text-secondary)"},
                {l:"Breakeven",v:"$"+_sf(calcPos.lastPrice+calcPremium,2),c:"var(--text-secondary)"},
                {l:`Estático ${calcDte}d`,v:_sf((calcPremium/(calcPos.lastPrice-calcPremium))*100,2)+"%",c:"var(--gold)"},
                {l:`Asignado ${calcDte}d`,v:_sf(((((calcStrike||calcPos.K)>calcPos.lastPrice?(calcStrike||calcPos.K)-calcPos.lastPrice+calcPremium:calcPremium)/(calcPos.lastPrice-calcPremium))*100),2)+"%",c:"#64d2ff"},
                {l:"Est. ann.",v:_sf((calcPremium/(calcPos.lastPrice-calcPremium))*(365/calcDte)*100,1)+"%",c:"var(--gold)"},
                {l:"Asig. ann.",v:_sf(((((calcStrike||calcPos.K)>calcPos.lastPrice?(calcStrike||calcPos.K)-calcPos.lastPrice+calcPremium:calcPremium)/(calcPos.lastPrice-calcPremium))*(365/calcDte)*100),1)+"%",c:"#64d2ff"},
                {l:"Max Profit",v:"$"+_sf(((calcStrike||calcPos.K)-calcPos.lastPrice+calcPremium)*100*calcPos.contracts,0),c:"var(--green)"},
              ].map((m,i)=>(
                <div key={i}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.3}}>{m.l}</div>
                  <div style={{fontSize:16,fontWeight:700,color:m.c,fontFamily:"var(--fm)"}}>{m.v}</div>
                </div>
              ))}
            </div>
          </>}
        </div>
        {calcPos && (
          <div style={{marginTop:12,padding:"10px 14px",background:"rgba(200,164,78,.04)",borderRadius:8,borderLeft:"3px solid var(--gold)",fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>
            <strong style={{color:"var(--gold)"}}>{calcPos.ticker}</strong> · Precio: ${_sf(calcPos.lastPrice,2)} · IV: {_sf(calcPos.iv*100,0)}%
            {calcPos.source !== "B-S" && <> · Bid: ${_sf(calcPos.bid,2)} · Ask: ${_sf(calcPos.ask,2)} · OI: {calcPos.oi}</>}
            {" · "}{calcPos.timing}
          </div>
        )}
      </div>

      {/* ── LEGEND ── */}
      <div style={{display:"flex",gap:20,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",padding:"0 4px",flexWrap:"wrap"}}>
        <span>🟢 IV alta + sin eventos + liquidez</span>
        <span>🟡 IV moderada, earnings cerca, o spread amplio</span>
        <span>🔴 Earnings inminentes, IV baja, o sin liquidez</span>
        <span>⚫ &lt;100 acciones</span>
        <span>MSV = Massive (greeks) · YAHOO = Yahoo Finance · B-S = Black-Scholes</span>
        <span>Δ = Delta (prob. ITM) · θ = Theta (decay/día)</span>
      </div>
      </>}

      {/* ══════ ROLL ADVISOR SECTION ══════ */}
      {section === "rolls" && <>
        <div style={card}>
          <div style={hd}>Roll Advisor — Posiciones que necesitan atencion</div>
          {rollData.length === 0 ? (
            <div style={{padding:20,textAlign:"center",color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontSize:12}}>
              Todas las posiciones estan lejos del strike. No hay rolls necesarios.
            </div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:900}}>
                <thead>
                  <tr style={{borderBottom:"2px solid var(--border)"}}>
                    {["Estado","Ticker","Precio","Strike","Dist.","Buyback","Roll → 5% OTM","Neto 5%","Roll → 10% OTM","Neto 10%","Nueva Exp.","DTE"].map(h=>(
                      <th key={h} style={{padding:"6px 8px",textAlign:h==="Ticker"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:.3,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rollData.map(p=>(
                    <tr key={p.ticker} style={{borderBottom:"1px solid var(--subtle-border)",background:p.light==="red"?"rgba(255,69,58,.06)":p.light==="yellow"?"rgba(255,214,10,.04)":"transparent"}}>
                      <td style={{padding:"6px 8px",textAlign:"center"}}>
                        <div style={{fontSize:14}}>{p.light==="red"?"🔴":p.light==="yellow"?"🟡":"🟢"}</div>
                        <div style={{fontSize:7,color:p.lightColor,fontFamily:"var(--fm)",fontWeight:700}}>{p.lightLabel}</div>
                      </td>
                      <td style={{padding:"6px 8px",fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",textAlign:"left"}}>
                        {p.ticker}
                        <div style={{fontSize:8,color:"var(--text-tertiary)",fontWeight:400}}>{p.contracts} ctrts · IV {_sf(p.iv*100,0)}%</div>
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)"}}>${_sf(p.lastPrice,2)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",fontWeight:600}}>${_sf(p.K,0)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:p.distancePct>0.03?"var(--green)":p.distancePct>0?"var(--text-primary)":"var(--red)"}}>{_sf(p.distancePct*100,1)}%</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)"}}>${_sf(p.buyBackCost,2)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--green)"}}>
                        ${p.newStrike5} → ${_sf(p.newPrem5,2)}
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:600,color:p.netCredit5>=0?"var(--green)":"var(--red)"}}>
                        {p.netCredit5>=0?"+":""}${_sf(p.netCredit5*100*p.contracts,0)}
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--green)"}}>
                        ${p.newStrike10} → ${_sf(p.newPrem10,2)}
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:600,color:p.netCredit10>=0?"var(--green)":"var(--red)"}}>
                        {p.netCredit10>=0?"+":""}${_sf(p.netCredit10*100*p.contracts,0)}
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",fontSize:9}}>{p.newExpStr}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>{p.newDTE}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {/* Roll legend */}
        <div style={{display:"flex",gap:20,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",padding:"0 4px",flexWrap:"wrap"}}>
          <span>🔴 ROLAR YA — precio &ge; strike</span>
          <span>🟡 VIGILAR — precio &gt; 95% del strike</span>
          <span>🟢 OK — precio &lt; 95% del strike</span>
          <span>Neto positivo = credito neto (te pagan) · Neto negativo = debito (pagas)</span>
        </div>
      </>}

      {/* ══════ SELL PUTS SECTION ══════ */}
      {section === "puts" && <>
        <div style={card}>
          <div style={hd}>Cash-Secured Puts — Oportunidades de venta de puts</div>
          <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:12}}>
            Puts a 30 DTE sobre posiciones del portfolio. Si te asignan, compras a descuento.
          </div>
          {putData.length === 0 ? (
            <div style={{padding:20,textAlign:"center",color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontSize:12}}>
              Sin datos de puts disponibles. Esperando datos de volatilidad...
            </div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:1000}}>
                <thead>
                  <tr style={{borderBottom:"2px solid var(--border)"}}>
                    {["Ticker","Precio","OTM%","Put Strike","Prima","Prima%","Yield Ann.","Breakeven","Descuento","Cash Req.","Acciones"].map(h=>(
                      <th key={h} style={{padding:"6px 8px",textAlign:h==="Ticker"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:.3,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {putData.slice(0,60).map((p,i)=>(
                    <tr key={`${p.ticker}-${p.otmPct}`} style={{borderBottom:"1px solid var(--subtle-border)"}}>
                      <td style={{padding:"6px 8px",fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",textAlign:"left"}}>
                        {p.ticker}
                        <div style={{fontSize:8,color:"var(--text-tertiary)",fontWeight:400}}>{(p.name||"").slice(0,18)}</div>
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)"}}>${_sf(p.S,2)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>{p.otmPct}%</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",fontWeight:600}}>${_sf(p.K,0)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--green)",fontWeight:600}}>${_sf(p.putPrem,2)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)"}}>{_sf(p.premPct*100,2)}%</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:700,color:p.annYield>0.12?"var(--green)":p.annYield>0.06?"var(--gold)":"var(--text-secondary)"}}>{_sf(p.annYield*100,1)}%</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>${_sf(p.breakeven,2)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--green)"}}>{_sf(p.discountPct*100,1)}%</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)"}}>{privacyMode?"•••":"$"+fDol(p.cashRequired)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",fontSize:9}}>
                        {p.shares > 0 ? <span style={{color:"var(--gold)"}}>{p.shares} en cartera</span> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:20,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",padding:"0 4px",flexWrap:"wrap"}}>
          <span>Prima estimada con Black-Scholes (put-call parity)</span>
          <span>Cash Req. = capital necesario si te asignan (100 acciones x strike)</span>
          <span>Descuento = rebaja efectiva vs precio actual si te asignan</span>
        </div>
      </>}

      {/* ══════ LIVE IB POSITIONS SECTION ══════ */}
      {section === "live" && <>
        <div style={card}>
          <div style={hd}>Posiciones de Opciones — Interactive Brokers (Live)</div>
          {(() => {
            const ibOpts = (ibData?.positions || []).filter(p => p.assetClass === "OPT");
            const ibStocks = (ibData?.positions || []).filter(p => p.assetClass === "STK" && p.shares > 0);
            if (!ibData?.loaded) return <div style={{padding:20,textAlign:"center",color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontSize:12}}>
              Haz click en "📡 IB" en la barra superior para cargar datos del broker.
            </div>;

            return <>
              {ibOpts.length > 0 ? (
                <div style={{overflowX:"auto",marginBottom:16}}>
                  <div style={{fontSize:11,color:"var(--green)",fontFamily:"var(--fm)",fontWeight:600,marginBottom:8}}>📞 {ibOpts.length} opciones abiertas en IB</div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead>
                      <tr style={{borderBottom:"2px solid var(--border)"}}>
                        {["Subyacente","Tipo","Strike","Exp.","Contratos","Precio","Valor","P&L"].map(h=>(
                          <th key={h} style={{padding:"6px 8px",textAlign:h==="Subyacente"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ibOpts.map((p,i) => (
                        <tr key={i} style={{borderBottom:"1px solid var(--subtle-border)"}}>
                          <td style={{padding:"6px 8px",fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{p.undSym || p.ticker}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:p.putOrCall==="C"?"var(--green)":"var(--gold)"}}>{p.putOrCall==="C"?"CALL":"PUT"}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)"}}>${_sf(p.strike,0)}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",fontSize:9}}>{p.expiry||"—"}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:600,color:p.shares<0?"var(--red)":"var(--green)"}}>{p.shares<0?"Short ":""}{Math.abs(p.shares)}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)"}}>${_sf(p.mktPrice,2)}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)"}}>{privacyMode?"•••":"$"+Math.abs(p.mktValue).toLocaleString()}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:600,color:p.unrealizedPnl>=0?"var(--green)":"var(--red)"}}>{privacyMode?"•••":(p.unrealizedPnl>=0?"+":"")+"$"+Math.round(p.unrealizedPnl).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{padding:16,textAlign:"center",color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontSize:11,background:"var(--row-alt)",borderRadius:8,marginBottom:12}}>
                  Sin opciones abiertas en IB. Cuando vendas covered calls o puts, aparecerán aquí automáticamente.
                </div>
              )}

              {/* IB Stock positions summary */}
              <div style={{fontSize:11,color:"#64d2ff",fontFamily:"var(--fm)",fontWeight:600,marginBottom:8}}>📊 {ibStocks.length} posiciones de acciones en IB</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
                {ibStocks.map(p => {
                  const contracts = Math.floor(p.shares / 100);
                  return <div key={p.ticker} style={{padding:"10px 12px",background:"var(--row-alt)",borderRadius:8,border:"1px solid var(--border)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{p.ticker}</span>
                      <span style={{fontSize:9,color:contracts>0?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600}}>{contracts>0?`${contracts} ctrts`:"<100 sh"}</span>
                    </div>
                    <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:4}}>
                      {p.shares} acciones · ${_sf(p.mktPrice,2)} · {privacyMode?"•••":"P&L "+(p.unrealizedPnl>=0?"+":"")+"$"+Math.round(p.unrealizedPnl).toLocaleString()}
                    </div>
                  </div>;
                })}
              </div>

              {/* Account summary */}
              {ibData.summary?.nlv && (
                <div style={{marginTop:12,padding:"10px 14px",background:"rgba(200,164,78,.04)",borderRadius:8,borderLeft:"3px solid var(--gold)",fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",display:"flex",gap:20}}>
                  <span>NLV: <b style={{color:"var(--gold)"}}>{privacyMode?"•••":"$"+Math.round(ibData.summary.nlv.amount).toLocaleString()}</b></span>
                  <span>Buying Power: <b style={{color:"#64d2ff"}}>{privacyMode?"•••":"$"+Math.round(ibData.summary.buyingPower?.amount||0).toLocaleString()}</b></span>
                  <span>Margen: <b style={{color:((ibData.summary.initMargin?.amount||0)/(ibData.summary.nlv?.amount||1))>0.5?"var(--red)":"var(--green)"}}>{privacyMode?"•••":"$"+Math.round(ibData.summary.initMargin?.amount||0).toLocaleString()}</b></span>
                  <span>Cash: <b style={{color:(ibData.summary.totalCash?.amount||0)<0?"var(--red)":"var(--text-primary)"}}>{privacyMode?"•••":"$"+Math.round(ibData.summary.totalCash?.amount||0).toLocaleString()}</b></span>
                </div>
              )}
            </>;
          })()}
        </div>
      </>}

      {/* ══════ WHEEL TRACKER SECTION ══════ */}
      {section === "wheel" && <>
        {/* Summary cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:12}}>
          {[
            {l:"POSICIONES WHEEL",v:`${wheelEntries.length}`,c:"var(--text-primary)"},
            {l:"FASE CALL",v:`${wheelEntries.filter(e=>e.phase==="call").length}`,c:"var(--green)"},
            {l:"FASE PUT",v:`${wheelEntries.filter(e=>e.phase==="put").length}`,c:"var(--gold)"},
            {l:"PREMIUM TOTAL",v:privacyMode?"•••":"$"+fDol(wheelEntries.reduce((s,e)=>s+(parseFloat(e.premium)||0)*100,0)),c:"var(--gold)"},
          ].map((m,i)=>(
            <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 14px"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5}}>{m.l}</div>
              <div style={{fontSize:22,fontWeight:700,color:m.c,fontFamily:"var(--fm)",marginTop:4}}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Add/Edit form */}
        <div style={card}>
          <div style={hd}>{wheelEditIdx >= 0 ? "Editar entrada" : "Nueva entrada Wheel"}</div>
          <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>Ticker</div>
              <input value={wheelForm.ticker} onChange={e=>setWheelForm({...wheelForm,ticker:e.target.value.toUpperCase()})}
                style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none",width:80}} placeholder="AAPL"/>
            </div>
            <div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>Fase</div>
              <select value={wheelForm.phase} onChange={e=>setWheelForm({...wheelForm,phase:e.target.value})}
                style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none"}}>
                <option value="put">Sell Put</option>
                <option value="call">Sell Call</option>
                <option value="waiting">Esperando</option>
              </select>
            </div>
            <div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>Strike</div>
              <input type="number" value={wheelForm.strike} onChange={e=>setWheelForm({...wheelForm,strike:e.target.value})}
                style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none",width:80}} placeholder="150"/>
            </div>
            <div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>Prima/accion</div>
              <input type="number" step="0.01" value={wheelForm.premium} onChange={e=>setWheelForm({...wheelForm,premium:e.target.value})}
                style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none",width:80}} placeholder="2.50"/>
            </div>
            <div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>Expiracion</div>
              <input type="date" value={wheelForm.expiration} onChange={e=>setWheelForm({...wheelForm,expiration:e.target.value})}
                style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none"}}/>
            </div>
            <div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>Notas</div>
              <input value={wheelForm.notes} onChange={e=>setWheelForm({...wheelForm,notes:e.target.value})}
                style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none",width:160}} placeholder="Opcional..."/>
            </div>
            <button onClick={()=>{
              if (!wheelForm.ticker) return;
              const entry = {...wheelForm, strike: parseFloat(wheelForm.strike)||0, premium: parseFloat(wheelForm.premium)||0 };
              if (wheelEditIdx >= 0) {
                const next = [...wheelEntries]; next[wheelEditIdx] = entry; saveWheel(next);
                setWheelEditIdx(-1);
              } else {
                saveWheel([...wheelEntries, entry]);
              }
              setWheelForm({ticker:"",phase:"put",strike:"",premium:"",expiration:"",notes:""});
            }}
              style={{padding:"6px 16px",borderRadius:8,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .15s"}}>
              {wheelEditIdx >= 0 ? "Guardar" : "+ Agregar"}
            </button>
            {wheelEditIdx >= 0 && (
              <button onClick={()=>{setWheelEditIdx(-1);setWheelForm({ticker:"",phase:"put",strike:"",premium:"",expiration:"",notes:""});}}
                style={{padding:"6px 12px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:11,cursor:"pointer",fontFamily:"var(--fm)"}}>
                Cancelar
              </button>
            )}
          </div>
        </div>

        {/* Wheel entries table */}
        {wheelEntries.length > 0 && (
          <div style={card}>
            <div style={hd}>Posiciones activas</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{borderBottom:"2px solid var(--border)"}}>
                    {["Fase","Ticker","Strike","Prima","Expiracion","Total","Notas",""].map(h=>(
                      <th key={h} style={{padding:"6px 8px",textAlign:h==="Ticker"||h==="Notas"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:.3,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wheelEntries.map((e,i)=>{
                    const phaseIcon = e.phase==="call"?"📞":e.phase==="put"?"📉":"⏳";
                    const phaseLabel = e.phase==="call"?"CALL":e.phase==="put"?"PUT":"WAIT";
                    const phaseColor = e.phase==="call"?"var(--green)":e.phase==="put"?"var(--gold)":"var(--text-tertiary)";
                    const isExpired = e.expiration && new Date(e.expiration) < new Date();
                    return (
                      <tr key={i} style={{borderBottom:"1px solid var(--subtle-border)",opacity:isExpired?0.5:1}}>
                        <td style={{padding:"6px 8px",textAlign:"center"}}>
                          <span style={{fontSize:13}}>{phaseIcon}</span>
                          <div style={{fontSize:7,fontFamily:"var(--fm)",fontWeight:700,color:phaseColor}}>{phaseLabel}</div>
                        </td>
                        <td style={{padding:"6px 8px",fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",textAlign:"left"}}>{e.ticker}</td>
                        <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)"}}>${_sf(e.strike,0)}</td>
                        <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--green)"}}>${_sf(e.premium,2)}</td>
                        <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontSize:9,color:isExpired?"var(--red)":"var(--text-secondary)"}}>
                          {e.expiration || "—"}{isExpired?" (exp)":""}
                        </td>
                        <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",fontWeight:600}}>
                          {privacyMode?"•••":"$"+_sf((e.premium||0)*100,0)}
                        </td>
                        <td style={{padding:"6px 8px",fontFamily:"var(--fm)",color:"var(--text-tertiary)",fontSize:9,textAlign:"left",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={e.notes}>{e.notes||"—"}</td>
                        <td style={{padding:"6px 4px",textAlign:"center",whiteSpace:"nowrap"}}>
                          <button onClick={()=>{setWheelEditIdx(i);setWheelForm({...e,strike:String(e.strike),premium:String(e.premium)});}}
                            style={{fontSize:9,padding:"2px 8px",borderRadius:5,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",cursor:"pointer",fontFamily:"var(--fm)",marginRight:4}}>Editar</button>
                          <button onClick={()=>{if(window.confirm("Eliminar entrada de "+e.ticker+"?")){const next=[...wheelEntries];next.splice(i,1);saveWheel(next);}}}
                            style={{fontSize:9,padding:"2px 8px",borderRadius:5,border:"1px solid rgba(255,69,58,.3)",background:"transparent",color:"var(--red)",cursor:"pointer",fontFamily:"var(--fm)"}}>X</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:20,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",padding:"0 4px",flexWrap:"wrap"}}>
          <span>📉 PUT = vendiste put, esperas que expire OTM</span>
          <span>📞 CALL = te asignaron, vendiste call sobre las acciones</span>
          <span>⏳ WAIT = esperando nueva oportunidad</span>
          <span>Datos guardados en localStorage</span>
        </div>
      </>}

    </div>
  );
}
