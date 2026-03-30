import { useState, useEffect, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';

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

export default function CoveredCallsTab() {
  const { portfolioTotals, positions, openAnalysis, hide, privacyMode } = useHome();

  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [earningsData, setEarningsData] = useState({});
  const [priceData, setPriceData] = useState({});
  const [optionsData, setOptionsData] = useState({});
  const [dte, setDte] = useState(30);
  const [otmPct, setOtmPct] = useState(5);
  const [sortBy, setSortBy] = useState("yield");
  const [signalFilter, setSignalFilter] = useState("all");
  const [calcTicker, setCalcTicker] = useState(null);
  const [calcStrike, setCalcStrike] = useState(0);
  const [calcDte, setCalcDte] = useState(30);
  const [dataSource, setDataSource] = useState("loading"); // "real" | "bs" | "mixed"

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

  // Fetch all data
  useEffect(() => {
    if (!eligible.length) { setLoading(false); return; }
    const tickers = eligible.map(p => p.ticker);
    let completed = 0;
    const total = 3;
    const checkDone = () => { completed++; if (completed >= total) setLoading(false); };

    // 1. Earnings dates
    setLoadingMsg("Cargando earnings...");
    fetch(`${API_URL}/api/earnings-batch?symbols=${tickers.join(",")}`)
      .then(r => r.json())
      .then(data => { setEarningsData(data || {}); checkDone(); })
      .catch(() => checkDone());

    // 2. Real options data from Yahoo Finance (US tickers only)
    setLoadingMsg("Cargando opciones reales de Yahoo Finance...");
    if (usTickers.length > 0) {
      const fetchOptions = async () => {
        const results = {};
        // Batch in groups of 20
        for (let i = 0; i < usTickers.length; i += 20) {
          const batch = usTickers.slice(i, i + 20);
          try {
            const r = await fetch(`${API_URL}/api/options-batch?symbols=${batch.join(",")}&dte=${dte}&otm=${otmPct}`);
            const data = await r.json();
            Object.assign(results, data);
          } catch(e) { console.warn("Options batch error:", e); }
        }
        setOptionsData(results);
        const realCount = Object.values(results).filter(v => v.bid !== undefined && !v.error).length;
        setDataSource(realCount > 0 ? (realCount === usTickers.length ? "real" : "mixed") : "bs");
        checkDone();
      };
      fetchOptions();
    } else {
      setDataSource("bs");
      checkDone();
    }

    // 3. Price history for HV (fallback IV calculation)
    setLoadingMsg("Calculando volatilidad histórica...");
    const fetchPrices = async () => {
      const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const results = {};
      for (let i = 0; i < tickers.length; i += 3) {
        const batch = tickers.slice(i, i + 3);
        await Promise.all(batch.map(async t => {
          try {
            const r = await fetch(`${API_URL}/api/price-history?symbol=${t}&from=${from}`);
            const d = await r.json();
            results[t] = (d.historical || d || []).map(p => p.close).reverse();
          } catch { results[t] = []; }
        }));
      }
      setPriceData(results);
      checkDone();
    };
    fetchPrices();
  }, [eligible, dte, otmPct]);

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

      let K, iv, premium, bid, ask, oi, volume, expiration, realDTE, source;

      if (hasRealData) {
        // ✅ Real market data from Yahoo Finance
        K = opt.strike;
        iv = opt.iv || 0;
        bid = opt.bid || 0;
        ask = opt.ask || 0;
        premium = bid; // Use bid (what you'd actually get when selling)
        oi = opt.oi || 0;
        volume = opt.volume || 0;
        expiration = opt.expiration;
        realDTE = opt.dte || dte;
        source = "REAL";
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
      } else if (iv < 0.15 || (!liquidityOK && source === "REAL")) {
        signal = "🔴"; signalColor = "#ff453a"; signalOrder = 3;
        timing = !liquidityOK ? `Sin liquidez (OI: ${oi})` : `IV muy baja (${_sf(iv*100,0)}%)`;
      } else if (daysToEarnings < 45 || iv < 0.20 || (spreadPct > 0.25 && source === "REAL")) {
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
  const realCount = ccData.filter(x => x.source === "REAL").length;

  // Calculator
  const calcPos = calcTicker ? ccData.find(x => x.ticker === calcTicker) : null;
  const calcPremium = calcPos ? bsCall(calcPos.lastPrice, calcStrike || calcPos.K, calcDte / 365, RISK_FREE, calcPos.iv) : 0;
  const calcPOTM = calcPos ? probOTM(calcPos.lastPrice, calcStrike || calcPos.K, calcDte / 365, RISK_FREE, calcPos.iv) : 0;

  const hd = {fontSize:13,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10,paddingBottom:6,borderBottom:"2px solid rgba(200,164,78,.2)"};
  const card = {background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16,marginBottom:14};

  if (loading) return <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
    <div style={{fontSize:14,marginBottom:8}}>Cargando datos de opciones para {eligible.length} posiciones...</div>
    <div style={{fontSize:11,color:"var(--gold)"}}>{loadingMsg}</div>
  </div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* ── DATA SOURCE BADGE ── */}
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:9,padding:"3px 8px",borderRadius:6,fontFamily:"var(--fm)",fontWeight:600,
          background: dataSource === "real" ? "rgba(48,209,88,.1)" : dataSource === "mixed" ? "rgba(255,214,10,.1)" : "rgba(255,255,255,.05)",
          color: dataSource === "real" ? "#30d158" : dataSource === "mixed" ? "#ffd60a" : "var(--text-tertiary)",
          border: `1px solid ${dataSource === "real" ? "rgba(48,209,88,.3)" : dataSource === "mixed" ? "rgba(255,214,10,.3)" : "var(--border)"}`}}>
          {dataSource === "real" ? "📡 Datos reales Yahoo Finance" : dataSource === "mixed" ? `📡 ${realCount} reales · ${ccData.length - realCount} B-S estimados` : "📐 Black-Scholes estimado"}
        </span>
        <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
          {dataSource !== "bs" && "Bid = precio real al vender · "}IV = implied volatility del mercado
        </span>
      </div>

      {/* ── HEADER: Income Summary ── */}
      <div className="ar-cc-summary" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        {[
          {l:"PREMIUM MENSUAL EST.",v:privacyMode?"•••":"$"+fDol(totalPremiumAll),c:"var(--gold)"},
          {l:"PREMIUM ANUAL EST.",v:privacyMode?"•••":"$"+fDol(totalPremiumAnnual),c:"var(--gold)"},
          {l:"POSICIONES ELEGIBLES",v:`${eligibleCount} de ${ccData.length}`,c:"var(--text-primary)"},
          {l:"SEÑAL VERDE",v:`${greenCount} posiciones`,c:"var(--green)"},
        ].map((m,i)=>(
          <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 16px"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5}}>{m.l}</div>
            <div style={{fontSize:22,fontWeight:700,color:m.c,fontFamily:"var(--fm)",marginTop:4}}>{m.v}</div>
          </div>
        ))}
      </div>

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
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:1100}}>
          <thead>
            <tr style={{borderBottom:"2px solid var(--border)"}}>
              {["","Ticker","Precio","Ctrts","Strike","Dist.","Bid","Ask","IV","OI","Total","Estático","Asignado","Exp.","Señal",""].map(h=>(
                <th key={h} style={{padding:"6px 8px",textAlign:h==="Ticker"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:.3,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p=>(
              <tr key={p.ticker} onClick={()=>openAnalysis(p.ticker)} style={{borderBottom:"1px solid rgba(255,255,255,.04)",cursor:"pointer",transition:"background .15s"}}
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
                {/* Open Interest — liquidity indicator */}
                <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",fontSize:9,
                  color:p.oi>500?"var(--green)":p.oi>100?"var(--text-secondary)":p.oi>0?"var(--text-tertiary)":"var(--text-tertiary)"}}>
                  {p.source === "REAL" ? (p.oi > 1000 ? _sf(p.oi/1000,1)+"K" : p.oi) : "—"}
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
                    background:p.source==="REAL"?"rgba(48,209,88,.1)":"rgba(255,255,255,.05)",
                    color:p.source==="REAL"?"#30d158":"var(--text-tertiary)",
                    border:`1px solid ${p.source==="REAL"?"rgba(48,209,88,.2)":"rgba(255,255,255,.06)"}`}}>
                    {p.source}
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
            {calcPos.source === "REAL" && <> · Bid: ${_sf(calcPos.bid,2)} · Ask: ${_sf(calcPos.ask,2)} · OI: {calcPos.oi}</>}
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
        <span>📡 REAL = Yahoo Finance · B-S = Black-Scholes estimado</span>
      </div>
    </div>
  );
}
