import { useState, useEffect, useMemo, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters';
import { _CURRENT_YEAR, API_URL } from '../../constants/index.js';
import { EmptyState } from '../ui/EmptyState.jsx';
import { useFireMetrics } from '../../hooks/useFireMetrics.js';
import { useFxRates } from '../../hooks/useFxRates.js';
import { useNetLiquidationValue } from '../../hooks/useNetLiquidationValue.js';
import { useMonthlyExpenses } from '../../hooks/useMonthlyExpenses.js';

export default function DashboardTab() {
  const [nlvHistory, setNlvHistory] = useState([]);
  const [spyHistory, setSpyHistory] = useState([]);
  const [corrData, setCorrData] = useState(null);
  const [corrLoading, setCorrLoading] = useState(false);
  const [corrOpen, setCorrOpen] = useState(false);
  const [earningsData, setEarningsData] = useState(null);
  const [earningsOpen, setEarningsOpen] = useState(true);
  useEffect(() => {
    fetch(`${API_URL}/api/ib-nlv-history?limit=90`)
      .then(r => r.json())
      .then(d => setNlvHistory(d.results || []))
      .catch(() => setNlvHistory([]));
    // SPY price history for comparison
    const from = new Date(Date.now() - 3 * 365.25 * 86400000).toISOString().slice(0, 10);
    fetch(`${API_URL}/api/price-history?symbol=SPY&from=${from}`)
      .then(r => r.json())
      .then(d => setSpyHistory((d.historical || d || []).reverse()))
      .catch(() => setSpyHistory([]));
  }, []);
  const {
    portfolioTotals, portfolioList, privacyMode, hide, hideN,
    openAnalysis, POS_STATIC, getCountry, FLAGS,
    CTRL_DATA, INCOME_DATA, DIV_BY_YEAR, DIV_BY_MONTH, GASTOS_CAT, CASH_DATA, MARGIN_INTEREST_DATA, FI_TRACK, FIRE_PROJ, FIRE_PARAMS, ANNUAL_PL,
    GASTOS_MONTH, fxRates,
    ibData, ibDiscrepancies,
  } = useHome();

  // ── Canonical FIRE metrics (single source of truth via useFireMetrics) ──
  const fx = useFxRates(fxRates);
  const { annualUSD: annualGastosUSDDash } = useMonthlyExpenses({ gastosMonth: GASTOS_MONTH, fx });
  const nlvDash = useNetLiquidationValue({ ibData, ctrlData: CTRL_DATA });
  const annualDivDash = useMemo(() => {
    const yrs = Object.keys(DIV_BY_YEAR || {}).sort();
    const last = yrs[yrs.length-1];
    return last ? (DIV_BY_YEAR[last]?.n || 0) : 0;
  }, [DIV_BY_YEAR]);
  const fire = useFireMetrics({
    nlv: nlvDash,
    annualExpenses: annualGastosUSDDash,
    annualDividendsNet: annualDivDash,
  });

  // ── Earnings Calendar: fetch upcoming earnings for portfolio tickers ──
  useEffect(() => {
    if (!portfolioList?.length) return;
    const tickers = portfolioList.map(p => p.ticker).filter(Boolean).slice(0, 50); // Worker FMP_MAP handles foreign tickers
    if (!tickers.length) return;
    fetch(`${API_URL}/api/earnings-batch?symbols=${tickers.join(",")}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) setEarningsData(data);
      })
      .catch(() => {});
  }, [portfolioList]);

  // ── Correlation matrix: fetch top-15 positions price history on expand ──
  const fetchCorrelation = useCallback(async () => {
    if (corrData || corrLoading || !portfolioList.length) return;
    setCorrLoading(true);
    try {
      const top15 = [...portfolioList]
        .filter(p => p.weight > 0)
        .sort((a, b) => (b.weight || 0) - (a.weight || 0))
        .slice(0, 15);
      const from = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);
      const fetches = top15.map(p =>
        fetch(`${API_URL}/api/price-history?symbol=${encodeURIComponent(p.ticker)}&from=${from}`)
          .then(r => r.json())
          .then(d => ({ ticker: p.ticker, prices: (d.historical || d || []).reverse() }))
          .catch(() => ({ ticker: p.ticker, prices: [] }))
      );
      const results = await Promise.all(fetches);
      // Build daily returns map aligned by date
      const returnsByTicker = {};
      const allDates = new Set();
      results.forEach(({ ticker, prices }) => {
        if (prices.length < 10) return;
        const rm = {};
        for (let i = 1; i < prices.length; i++) {
          const prev = prices[i - 1].close || prices[i - 1].adjClose;
          const cur = prices[i].close || prices[i].adjClose;
          if (prev > 0 && cur > 0) {
            const dt = prices[i].date;
            rm[dt] = (cur - prev) / prev;
            allDates.add(dt);
          }
        }
        if (Object.keys(rm).length >= 10) returnsByTicker[ticker] = rm;
      });
      const tickers = Object.keys(returnsByTicker);
      if (tickers.length < 3) { setCorrData({ tickers: [], matrix: [], score: 0, bestPair: null, worstPair: null }); setCorrLoading(false); return; }
      const dates = [...allDates].sort();
      // Pearson correlation
      const corr = (a, b) => {
        const common = dates.filter(d => a[d] !== undefined && b[d] !== undefined);
        if (common.length < 10) return 0;
        const ma = common.reduce((s, d) => s + a[d], 0) / common.length;
        const mb = common.reduce((s, d) => s + b[d], 0) / common.length;
        let num = 0, da2 = 0, db2 = 0;
        common.forEach(d => { const x = a[d] - ma, y = b[d] - mb; num += x * y; da2 += x * x; db2 += y * y; });
        const denom = Math.sqrt(da2) * Math.sqrt(db2);
        return denom > 0 ? num / denom : 0;
      };
      const matrix = tickers.map(t1 => tickers.map(t2 => t1 === t2 ? 1 : corr(returnsByTicker[t1], returnsByTicker[t2])));
      // Find best/worst pairs
      let maxCorr = -2, minCorr = 2, bestPair = null, worstPair = null;
      let sumCorr = 0, pairCount = 0;
      for (let i = 0; i < tickers.length; i++) {
        for (let j = i + 1; j < tickers.length; j++) {
          const v = matrix[i][j];
          sumCorr += v; pairCount++;
          if (v > maxCorr) { maxCorr = v; bestPair = [tickers[i], tickers[j], v]; }
          if (v < minCorr) { minCorr = v; worstPair = [tickers[i], tickers[j], v]; }
        }
      }
      const avgCorr = pairCount > 0 ? sumCorr / pairCount : 0;
      const score = Math.round(Math.max(0, Math.min(100, (1 - avgCorr) * 100)));
      setCorrData({ tickers, matrix, score, avgCorr, bestPair, worstPair });
    } catch (e) { console.warn("Correlation fetch failed:", e); }
    setCorrLoading(false);
  }, [corrData, corrLoading, portfolioList]);

  const ctrlWithData = CTRL_DATA.filter(c => c.pu > 0).sort((a,b) => (a.d||"").localeCompare(b.d||""));
const latest = ctrlWithData[ctrlWithData.length - 1] || {};
const first = ctrlWithData[0] || {};
const totalGrowth = latest.pu && first.pu ? ((latest.pu - first.pu) / first.pu * 100) : 0;
const patValues = ctrlWithData.map(c => c.pu || 0);
const maxPat = patValues.length ? Math.max(...patValues) : 0;
const minPat = patValues.length ? Math.min(...patValues) : 0;

// Current year income
const curYear = new Date().getFullYear().toString();
const prevYear = (parseInt(curYear, 10) - 1).toString();
const ytdIncome = INCOME_DATA.filter(d => d.m.startsWith(curYear));
const ytdTotal = ytdIncome.reduce((s,d) => s + (d.total||0), 0);
const prevTotal = INCOME_DATA.filter(d => d.m.startsWith(prevYear)).reduce((s,d) => s + (d.total||0), 0);

// Dividend data from static sheet (master record)
const divYears = Object.entries(DIV_BY_YEAR).filter(([y]) => parseInt(y, 10) >= 2021).sort((a,b) => parseInt(a[0]) - parseInt(b[0]));
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
const expValues = expCats.map(([,v]) => v);
const maxExp = expValues.length ? Math.max(...expValues.map(Math.abs)) : 1;

// Asset allocation
const brokersUsd = latest.br || 0;
const bancosEur = latest.bk || 0;
const bancosUsd = bancosEur * (latest.fx || 1);
const fondosEur = latest.fd || 0;
const fondosUsd = fondosEur * (latest.fx || 1);
const cryptoEur = latest.cr || 0;
const cryptoUsd = cryptoEur * (latest.fx || 1);
const totalUsd = latest.pu || 0;
const pieData = [
  {l:"Broker",v:brokersUsd,c:"#c8a44e"},
  {l:"Bancos",v:bancosUsd,c:"#30d158"},
  {l:"Fondos",v:fondosUsd,c:"#64d2ff"},
  {l:"Crypto",v:cryptoUsd,c:"#ff9f0a"},
].filter(d => d.v > 0);
const pieTotal = pieData.reduce((s,d) => s + d.v, 0) || 1;

const strats = [{k:"div",l:"Dividendos",c:"#c8a44e"},{k:"cs",l:"Covered Calls",c:"#30d158"},{k:"rop",l:"ROP",c:"#5e5ce6"},{k:"roc",l:"ROC",c:"#bf5af2"},{k:"cal",l:"Calendar",c:"#64d2ff"},{k:"leaps",l:"LEAPs",c:"#ff9f0a"}];

const cs = {padding:"16px 20px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,flex:1,minWidth:140};
const ls = {fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.8,fontWeight:600,marginBottom:4};
const vs = {fontSize:22,fontWeight:700,fontFamily:"var(--fm)",lineHeight:1.2};
const ss = {fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2};
const secTitle = (ico,text) => <div style={{fontSize:15,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:16}}>{ico} {text}</div>;
const card = {background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20};

if (!portfolioList || portfolioList.length === 0) {
  return <EmptyState icon="📊" title="Dashboard sin datos" subtitle="El dashboard necesita datos de portfolio para mostrar metricas, rendimiento y analisis." action="Cargar datos" onAction={() => {}} />;
}

return (
<div style={{display:"flex",flexDirection:"column",gap:16}}>
  {/* ── IB Live Status ── */}
  {ibData?.loaded && ibData?.summary?.nlv?.amount > 0 && (
    <div className="ar-dash-ib-grid" style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10}}>
      {[
        {l:"NLV (IB)",v:hide(`$${fDol(ibData.summary.nlv.amount)}`),c:"#64d2ff"},
        {l:"BUYING POWER",v:hide(`$${fDol(ibData.summary.buyingPower?.amount||0)}`),c:"var(--green)"},
        {l:"CASH",v:hide(`$${fDol(ibData.summary.totalCash?.amount||0)}`),c:(ibData.summary.totalCash?.amount||0)<0?"var(--red)":"var(--text-primary)"},
        {l:"MARGEN",v:hide(`$${fDol(ibData.summary.initMargin?.amount||0)}`),c:((ibData.summary.initMargin?.amount||0)/(ibData.summary.nlv?.amount||1))>0.5?"var(--red)":"var(--text-secondary)"},
        {l:"POSICIONES",v:`${(ibData.positions||[]).filter(p=>p.assetClass==="STK"&&p.shares>0).length}`,c:"var(--text-primary)",sub:`${(ibData.positions||[]).filter(p=>p.assetClass==="OPT").length} opciones`},
        {l:"CUENTAS",v:`${(ibData.summary.accounts||[]).length||4}`,c:"var(--gold)",sub:ibData.cached?`📋 ${ibData.lastSync||""}`:(ibData.lastSync?new Date(ibData.lastSync).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}):"")},
      ].map((k,i)=>(
        <div key={i} style={{padding:"10px 14px",background:"rgba(100,210,255,.03)",border:"1px solid rgba(100,210,255,.12)",borderRadius:12}}>
          <div style={{fontSize:9,color:"#64d2ff",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.5}}>{k.l}</div>
          <div style={{fontSize:18,fontWeight:700,color:k.c,fontFamily:"var(--fm)",marginTop:2}}>{k.v}</div>
          {k.sub && <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:1}}>{k.sub}</div>}
        </div>
      ))}
    </div>
  )}

  {/* ── Conciliación IB vs App ── */}
  {ibData?.loaded && ibDiscrepancies?.length > 0 && (
    <div style={{padding:12,background:"rgba(255,214,10,.04)",border:"1px solid rgba(255,214,10,.15)",borderRadius:12}}>
      <div style={{fontSize:11,fontWeight:700,color:"#ffd60a",fontFamily:"var(--fm)",marginBottom:6}}>⚠ Discrepancias IB vs FMP ({ibDiscrepancies.length})</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {ibDiscrepancies.map(d=>(
          <div key={d.ticker} style={{padding:"4px 10px",background:"var(--subtle-bg)",borderRadius:6,fontSize:10,fontFamily:"var(--fm)"}}>
            <b style={{color:"var(--gold)"}}>{d.ticker}</b> IB:${_sf(d.ibPrice,2)} FMP:${_sf(d.fmpPrice,2)} <span style={{color:parseFloat(d.diff)>0?"var(--green)":"var(--red)"}}>{d.diff}%</span>
          </div>
        ))}
      </div>
    </div>
  )}

  {/* ── Conciliación: App vs IB ── */}
  {ibData?.loaded && (() => {
    const IB_MAP = {"VIS":"BME:VIS","AMS":"BME:AMS","IIPR PRA":"IIPR-PRA","9618":"HKG:9618","1052":"HKG:1052","2219":"HKG:2219","1910":"HKG:1910","9616":"HKG:9616"};
    // Build IB merged map
    const ibMerged = {};
    (ibData.positions||[]).filter(p=>p.assetClass==="STK"&&p.shares>0).forEach(p => {
      const t = IB_MAP[p.ticker] || p.ticker;
      if (ibMerged[t]) { ibMerged[t].shares += p.shares; ibMerged[t].mktValue += p.mktValue||0; }
      else ibMerged[t] = { ...p, ticker: t, shares: p.shares, mktValue: p.mktValue||0 };
    });
    const appMap = {};
    portfolioList.forEach(p => { appMap[p.ticker] = p; });

    const allTickers = new Set([...Object.keys(ibMerged), ...Object.keys(appMap)]);
    const rows = [];
    let matchCount = 0, diffCount = 0, ibOnlyCount = 0, appOnlyCount = 0;

    for (const t of allTickers) {
      const ib = ibMerged[t];
      const app = appMap[t];
      const ibSh = ib?.shares || 0;
      const appSh = app?.shares || 0;
      const ibPrice = ib?.mktPrice || 0;
      const appPrice = app?.lastPrice || 0;
      const shMatch = Math.abs(ibSh - appSh) < 1;
      const status = !ib ? "APP_ONLY" : !app ? "IB_ONLY" : shMatch ? "MATCH" : "DIFF";
      if (status === "MATCH") matchCount++;
      else if (status === "DIFF") diffCount++;
      else if (status === "IB_ONLY") ibOnlyCount++;
      else appOnlyCount++;
      if (status !== "MATCH") rows.push({ ticker: t, status, ibSh, appSh, ibPrice, appPrice, ibVal: ib?.mktValue||0, appVal: app?.valueUSD||0 });
    }
    rows.sort((a, b) => { const ord = { DIFF: 0, IB_ONLY: 1, APP_ONLY: 2 }; return (ord[a.status]||3) - (ord[b.status]||3); });

    if (!rows.length) return (
      <div style={{padding:10,background:"rgba(48,209,88,.04)",border:"1px solid rgba(48,209,88,.12)",borderRadius:12,fontSize:11,fontFamily:"var(--fm)",color:"var(--green)",fontWeight:600}}>
        ✅ Conciliación perfecta — {matchCount} posiciones coinciden entre App e IB
      </div>
    );

    return (
      <div style={{padding:12,background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>🔍 Conciliación App vs IB</div>
          <div style={{display:"flex",gap:8,fontSize:9,fontFamily:"var(--fm)"}}>
            <span style={{color:"var(--green)"}}>✓ {matchCount}</span>
            {diffCount > 0 && <span style={{color:"#ffd60a"}}>⚠ {diffCount} dif.</span>}
            {ibOnlyCount > 0 && <span style={{color:"#bf5af2"}}>+{ibOnlyCount} solo IB</span>}
            {appOnlyCount > 0 && <span style={{color:"var(--text-tertiary)"}}>+{appOnlyCount} solo App</span>}
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
            <thead><tr style={{borderBottom:"2px solid var(--border)"}}>
              {["Estado","Ticker","Shares App","Shares IB","Precio App","Precio IB","Valor App","Valor IB"].map(h=>(
                <th key={h} style={{padding:"4px 6px",textAlign:h==="Ticker"||h==="Estado"?"left":"right",color:"var(--text-tertiary)",fontSize:8,fontWeight:700,fontFamily:"var(--fm)"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.ticker} style={{borderBottom:"1px solid var(--subtle-bg)"}}>
                  <td style={{padding:"3px 6px",fontFamily:"var(--fm)"}}>
                    <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,fontWeight:600,
                      background:r.status==="DIFF"?"rgba(255,214,10,.1)":r.status==="IB_ONLY"?"rgba(191,90,242,.1)":"var(--subtle-bg2)",
                      color:r.status==="DIFF"?"#ffd60a":r.status==="IB_ONLY"?"#bf5af2":"var(--text-tertiary)"
                    }}>{r.status==="DIFF"?"⚠ DIF":r.status==="IB_ONLY"?"+ IB":"- APP"}</span>
                  </td>
                  <td style={{padding:"3px 6px",fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{r.ticker}</td>
                  <td style={{padding:"3px 6px",textAlign:"right",fontFamily:"var(--fm)",color:r.status==="IB_ONLY"?"var(--text-tertiary)":"var(--text-primary)"}}>{r.appSh||"—"}</td>
                  <td style={{padding:"3px 6px",textAlign:"right",fontFamily:"var(--fm)",color:r.status==="APP_ONLY"?"var(--text-tertiary)":"var(--text-primary)",fontWeight:r.status==="DIFF"?700:400}}>{r.ibSh||"—"}</td>
                  <td style={{padding:"3px 6px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>{r.appPrice?`$${_sf(r.appPrice,2)}`:"—"}</td>
                  <td style={{padding:"3px 6px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>{r.ibPrice?`$${_sf(r.ibPrice,2)}`:"—"}</td>
                  <td style={{padding:"3px 6px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>{r.appVal?hide(`$${_sf(r.appVal,0)}`):"—"}</td>
                  <td style={{padding:"3px 6px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)"}}>{r.ibVal?hide(`$${_sf(r.ibVal,0)}`):"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  })()}

  {/* ── NLV History Mini-Chart ── */}
  {nlvHistory.length > 1 && (
    <div style={{padding:"12px 16px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>📈 Evolución NLV (IB)</div>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{nlvHistory.length} días · {nlvHistory[0]?.fecha} → {nlvHistory[nlvHistory.length-1]?.fecha}</div>
      </div>
      <svg viewBox={`0 0 ${Math.max(nlvHistory.length*4,100)} 50`} style={{width:"100%",height:60}}>
        {(() => {
          const values = nlvHistory.map(d => d.nlv);
          const min = Math.min(...values) * 0.998;
          const max = Math.max(...values) * 1.002;
          const range = max - min || 1;
          const w = Math.max(nlvHistory.length * 4, 100);
          const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${50 - ((v - min) / range) * 46}`).join(" ");
          const fillPoints = points + ` ${w},50 0,50`;
          const isUp = values[values.length - 1] >= values[0];
          return <>
            <defs><linearGradient id="nlvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={isUp?"#30d158":"#ff453a"} stopOpacity=".15"/><stop offset="100%" stopColor={isUp?"#30d158":"#ff453a"} stopOpacity="0"/></linearGradient></defs>
            <polygon points={fillPoints} fill="url(#nlvGrad)"/>
            <polyline points={points} fill="none" stroke={isUp?"#30d158":"#ff453a"} strokeWidth="1.5" strokeLinejoin="round"/>
          </>;
        })()}
      </svg>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:"var(--fm)",marginTop:4}}>
        <span style={{color:"var(--text-tertiary)"}}>{hide("$"+fDol(nlvHistory[0]?.nlv||0))}</span>
        {(() => {
          const first = nlvHistory[0]?.nlv || 0;
          const last = nlvHistory[nlvHistory.length-1]?.nlv || 0;
          const chg = first > 0 ? ((last - first) / first * 100) : 0;
          return <span style={{fontWeight:700,color:chg>=0?"var(--green)":"var(--red)"}}>{chg>=0?"+":""}{_sf(chg,1)}%</span>;
        })()}
        <span style={{color:"var(--text-tertiary)"}}>{hide("$"+fDol(nlvHistory[nlvHistory.length-1]?.nlv||0))}</span>
      </div>
    </div>
  )}

  {/* ── Dividendos This Year vs Last Year — Bar Chart (pure dividends only) ── */}
  {Object.keys(DIV_BY_MONTH || {}).length > 0 && (() => {
    const curYear = String(new Date().getFullYear());
    const prevYear = String(parseInt(curYear) - 1);
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const curData = months.map((_, i) => {
      const m = `${curYear}-${String(i + 1).padStart(2, "0")}`;
      return DIV_BY_MONTH[m]?.n || 0; // neto
    });
    const curDataG = months.map((_, i) => {
      const m = `${curYear}-${String(i + 1).padStart(2, "0")}`;
      return DIV_BY_MONTH[m]?.g || 0; // bruto
    });
    const prevData = months.map((_, i) => {
      const m = `${prevYear}-${String(i + 1).padStart(2, "0")}`;
      return DIV_BY_MONTH[m]?.n || 0;
    });
    const prevDataG = months.map((_, i) => {
      const m = `${prevYear}-${String(i + 1).padStart(2, "0")}`;
      return DIV_BY_MONTH[m]?.g || 0;
    });
    const max = Math.max(...curDataG, ...prevDataG, 1);
    const curTotal = curDataG.reduce((s, v) => s + v, 0);
    const curTotalN = curData.reduce((s, v) => s + v, 0);
    const prevTotal = prevDataG.reduce((s, v) => s + v, 0);
    const prevTotalN = prevData.reduce((s, v) => s + v, 0);
    const curMonth = new Date().getMonth();

    return (
    <div style={{padding:"12px 16px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>💰 Dividendos {curYear} vs {prevYear}</div>
        <div style={{fontSize:10,fontFamily:"var(--fm)"}}>
          <span style={{color:"var(--gold)"}}>■</span> {curYear}: {hide("$"+fDol(curTotal))} <span style={{color:"var(--green)",fontSize:9}}>({hide("$"+fDol(curTotalN))} neto)</span>
          <span style={{color:"var(--text-tertiary)",marginLeft:8}}>■</span> {prevYear}: {hide("$"+fDol(prevTotal))}
        </div>
      </div>
      <div style={{display:"flex",gap:2,alignItems:"flex-end",height:50}}>
        {months.map((m, i) => (
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <div style={{display:"flex",gap:1,alignItems:"flex-end",width:"100%",justifyContent:"center",height:40}}>
              <div style={{width:"40%",background:i<=curMonth?"var(--gold)":"rgba(200,164,78,.2)",borderRadius:"2px 2px 0 0",height:`${Math.max((curDataG[i]/max)*40,1)}px`,transition:"height .3s"}} title={`${curYear} ${m}: B $${_sf(curDataG[i],0)} · N $${_sf(curData[i],0)}`}/>
              <div style={{width:"40%",background:"var(--border-hover)",borderRadius:"2px 2px 0 0",height:`${Math.max((prevDataG[i]/max)*40,1)}px`}} title={`${prevYear} ${m}: B $${_sf(prevDataG[i],0)} · N $${_sf(prevData[i],0)}`}/>
            </div>
            <span style={{fontSize:7,color:i===curMonth?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:i===curMonth?700:400}}>{m}</span>
          </div>
        ))}
      </div>
    </div>);
  })()}

  {/* ── Performance Chart: Portfolio vs S&P 500 ── */}
  {ctrlWithData.length > 3 && spyHistory.length > 0 && (() => {
    // Build monthly return series for portfolio (from CTRL_DATA) and SPY
    const portReturns = ctrlWithData.map((c, i) => {
      if (i === 0) return { date: c.d, portCum: 0, spyCum: 0 };
      const portRet = ctrlWithData[0].pu > 0 ? ((c.pu - ctrlWithData[0].pu) / ctrlWithData[0].pu * 100) : 0;
      // Find SPY price on same date
      const spyOnDate = spyHistory.find(s => s.date >= c.d) || spyHistory.find(s => s.date <= c.d);
      const spyFirst = spyHistory.find(s => s.date >= ctrlWithData[0].d) || spyHistory[0];
      const spyRet = spyFirst?.close > 0 && spyOnDate?.close > 0 ? ((spyOnDate.close - spyFirst.close) / spyFirst.close * 100) : 0;
      return { date: c.d, portCum: portRet, spyCum: spyRet };
    });

    if (portReturns.length < 3) return null;

    const allVals = portReturns.flatMap(r => [r.portCum, r.spyCum]);
    const min = (allVals.length > 0 ? Math.min(...allVals) : 0) - 2;
    const max = (allVals.length > 0 ? Math.max(...allVals) : 0) + 2;
    const range = max - min || 1;
    const w = 400;
    const h = 80;

    const portPoints = portReturns.map((r, i) => `${(i / (portReturns.length - 1)) * w},${h - ((r.portCum - min) / range) * h}`).join(" ");
    const spyPoints = portReturns.map((r, i) => `${(i / (portReturns.length - 1)) * w},${h - ((r.spyCum - min) / range) * h}`).join(" ");
    const zeroY = h - ((0 - min) / range) * h;

    const lastPort = portReturns[portReturns.length - 1];
    const outperform = lastPort.portCum - lastPort.spyCum;

    return (
    <div style={{padding:"12px 16px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>📈 Performance: Portfolio vs S&P 500</div>
        <div style={{display:"flex",gap:12,fontSize:10,fontFamily:"var(--fm)"}}>
          <span><span style={{color:"var(--gold)"}}>■</span> Portfolio: <b style={{color:lastPort.portCum>=0?"var(--green)":"var(--red)"}}>{lastPort.portCum>=0?"+":""}{_sf(lastPort.portCum,1)}%</b></span>
          <span><span style={{color:"#64d2ff"}}>■</span> SPY: <b style={{color:lastPort.spyCum>=0?"var(--green)":"var(--red)"}}>{lastPort.spyCum>=0?"+":""}{_sf(lastPort.spyCum,1)}%</b></span>
          <span style={{color:outperform>=0?"var(--green)":"var(--red)",fontWeight:700}}>{outperform>=0?"▲":"▼"} {_sf(Math.abs(outperform),1)}%</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:80}}>
        {/* Zero line */}
        <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="var(--border-hover)" strokeWidth="0.5" strokeDasharray="4"/>
        {/* SPY line */}
        <polyline points={spyPoints} fill="none" stroke="#64d2ff" strokeWidth="1.5" strokeLinejoin="round" opacity=".6"/>
        {/* Portfolio line */}
        <polyline points={portPoints} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round"/>
        {/* Dots at end */}
        {(() => {
          const lastX = w;
          const portY = h - ((lastPort.portCum - min) / range) * h;
          const spyY = h - ((lastPort.spyCum - min) / range) * h;
          return <>
            <circle cx={lastX} cy={portY} r="3" fill="var(--gold)"/>
            <circle cx={lastX} cy={spyY} r="2.5" fill="#64d2ff"/>
          </>;
        })()}
      </svg>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontFamily:"var(--fm)",color:"var(--text-tertiary)",marginTop:2}}>
        <span>{portReturns[0].date?.slice(0,7)}</span>
        <span>{outperform >= 0 ? "✅ Superando al S&P 500" : "📉 Por debajo del S&P 500"}</span>
        <span>{lastPort.date?.slice(0,7)}</span>
      </div>
    </div>);
  })()}

  {/* ── Earnings Calendar ── */}
  {earningsData && (() => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    // Build list of upcoming earnings within 30 days
    const upcoming = [];
    Object.entries(earningsData).forEach(([ticker, info]) => {
      if (!info?.next?.date) return;
      const d = new Date(info.next.date + "T12:00:00");
      if (d >= now && d <= in30) {
        const name = POS_STATIC[ticker]?.nm || POS_STATIC[ticker]?.name || ticker;
        upcoming.push({
          ticker,
          name,
          date: info.next.date,
          dateObj: d,
          epsEst: info.next.epsEstimated ?? null,
          revEst: info.next.revenueEstimated ?? null,
          time: info.next.time || null,
          thisWeek: d <= endOfWeek,
        });
      }
    });
    upcoming.sort((a, b) => a.dateObj - b.dateObj);
    if (!upcoming.length) return null;

    // Mini calendar for current month
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const earningsDates = new Set(upcoming.filter(e => {
      const ed = e.dateObj;
      return ed.getMonth() === month && ed.getFullYear() === year;
    }).map(e => e.dateObj.getDate()));
    const today = now.getDate();
    const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const dayLabels = ["Do","Lu","Ma","Mi","Ju","Vi","Sa"];
    const calCells = [];
    for (let i = 0; i < firstDay; i++) calCells.push(null);
    for (let d = 1; d <= daysInMonth; d++) calCells.push(d);

    return (
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
      <div
        onClick={() => setEarningsOpen(!earningsOpen)}
        style={{padding:"12px 20px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",userSelect:"none"}}
      >
        <span style={{fontSize:13,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>
          {"\uD83D\uDCCA"} Earnings ({upcoming.length} pr{"\u00F3"}ximos)
        </span>
        <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",transform:earningsOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s"}}>
          {"\u25BC"}
        </span>
      </div>
      {earningsOpen && (
        <div style={{padding:"0 20px 20px"}}>
          <div className="ar-dash-earnings" style={{display:"grid",gridTemplateColumns:"1fr 220px",gap:16}}>
            {/* Earnings list */}
            <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:320,overflowY:"auto"}}>
              {upcoming.map(e => {
                const dateStr = new Date(e.date + "T12:00:00").toLocaleDateString("es-ES", {weekday:"short",day:"numeric",month:"short"});
                const timeBadge = e.time === "bmo" ? "Pre-Market" : e.time === "amc" ? "After-Hours" : null;
                return (
                  <div key={e.ticker} style={{
                    display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,
                    background:e.thisWeek?"rgba(255,214,10,.04)":"var(--row-alt)",
                    border:e.thisWeek?"1px solid rgba(255,214,10,.2)":"1px solid var(--subtle-border)",
                  }}>
                    <div style={{width:70,fontSize:10,color:e.thisWeek?"#ffd60a":"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600}}>{dateStr}</div>
                    <div style={{width:55,fontSize:12,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",cursor:"pointer"}} onClick={() => openAnalysis && openAnalysis(e.ticker)}>{e.ticker}</div>
                    <div style={{flex:1,fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name}</div>
                    {e.epsEst != null && <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>EPS: <b style={{color:"var(--text-primary)"}}>${_sf(e.epsEst,2)}</b></div>}
                    {e.revEst != null && <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>Rev: <b style={{color:"var(--text-primary)"}}>${e.revEst >= 1e9 ? _sf(e.revEst/1e9,1)+"B" : e.revEst >= 1e6 ? _sf(e.revEst/1e6,0)+"M" : _sf(e.revEst,0)}</b></div>}
                    {timeBadge && <div style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontWeight:600,fontFamily:"var(--fm)",
                      background:e.time==="bmo"?"rgba(100,210,255,.1)":"rgba(191,90,242,.1)",
                      color:e.time==="bmo"?"#64d2ff":"#bf5af2"
                    }}>{timeBadge}</div>}
                  </div>
                );
              })}
            </div>
            {/* Mini calendar */}
            <div style={{padding:12,background:"var(--row-alt)",borderRadius:12,border:"1px solid var(--subtle-border)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)",textAlign:"center",marginBottom:8}}>{monthNames[month]} {year}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,textAlign:"center"}}>
                {dayLabels.map(d => <div key={d} style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,padding:"2px 0"}}>{d}</div>)}
                {calCells.map((d, i) => {
                  if (d === null) return <div key={"e"+i}/>;
                  const hasEarnings = earningsDates.has(d);
                  const isToday = d === today;
                  return (
                    <div key={d} style={{
                      position:"relative",fontSize:10,fontFamily:"var(--fm)",padding:"4px 0",borderRadius:4,
                      color:isToday?"var(--gold)":hasEarnings?"#ffd60a":"var(--text-tertiary)",
                      fontWeight:isToday||hasEarnings?700:400,
                      background:isToday?"rgba(200,164,78,.1)":"transparent",
                    }}>
                      {d}
                      {hasEarnings && <div style={{position:"absolute",bottom:1,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:2,background:"#ffd60a"}}/>}
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:8,fontSize:8,fontFamily:"var(--fm)",color:"var(--text-tertiary)"}}>
                <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:4,height:4,borderRadius:2,background:"#ffd60a"}}/> Earnings</span>
                <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:"rgba(200,164,78,.1)",border:"1px solid rgba(200,164,78,.3)"}}/> Hoy</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>);
  })()}

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
      {l:patLabel,v:hide(`$${fDol(bestPatUsd)}`),sub:privacyMode?"•••":(snapshotAge>45?`Snapshot: $${fDol(totalUsd)} (${snapshotAge}d ago)`:`€${fDol(latest.pe||0)}`),c:"var(--text-primary)"},
      {l:"INVERTIDO",v:hide(`$${fDol(latest.br||0)}`),sub:privacyMode?"•••":`Cash: $${fDol(bancosUsd)}`,c:"var(--gold)"},
      {l:"Δ PATRIMONIO",v:hide(`$${fDol((latest.pu||0)-(first.pu||0))}`),sub:privacyMode?"•••":`${totalGrowth>=0?"+":""}${_sf(totalGrowth,1)}% (${first.d?.slice(0,7)||"?"} → ${latest.d?.slice(0,7)||"?"})`,c:totalGrowth>=0?"var(--green)":"var(--red)"},
      {l:`DIVIDENDOS ${latestDivYear?.[0]||""}`,v:hide(`$${fDol(latestDivYear?.[1]?.g||0)}`),sub:privacyMode?"•••":`Net $${fDol(latestDivYear?.[1]?.n||0)} · ${latestDivYear?.[1]?.c||0}x`,c:"var(--gold)"},
      {l:"INGRESOS BOLSA",v:hide(`$${fDol(prevTotal)}`),sub:privacyMode?"•••":`${curYear} YTD: $${fDol(ytdTotal)}`,c:"var(--green)"},
      {l:"YIELD",v:`${_sf(portfolioTotals?.yieldUSD>0?(portfolioTotals.yieldUSD*100):0,1)}%`,sub:privacyMode?"•••":`YOC ${_sf(portfolioTotals?.yocUSD>0?(portfolioTotals.yocUSD*100):0,1)}%`,c:"var(--gold)"},
    ].map((k,i)=>(
      <div key={i} style={{flex:"1 1 140px",padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
        <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.6,fontWeight:600,marginBottom:4}}>{k.l}</div>
        <div style={{fontSize:20,fontWeight:700,color:k.c,fontFamily:"var(--fm)",lineHeight:1.2}}>{k.v}</div>
        {k.sub&&<div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:3}}>{k.sub}</div>}
      </div>
    ))}
  </div>
    );
  })()}

  {/* ── Account Allocation Donut + Margin Gauge ── */}
  <div className="ar-dash-allocation" style={{display:"grid",gridTemplateColumns: ibData?.loaded && ibData?.summary?.nlv?.amount > 0 ? "1fr 1fr" : "1fr", gap:10}}>
    {/* Account Allocation Donut */}
    {pieData.length > 0 && (
      <div style={card}>
        {secTitle("🍩","Asignacion por Cuenta")}
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          <svg width={160} height={160} viewBox="0 0 160 160" style={{flexShrink:0}}>
            {(() => {
              const cx=80, cy=80, r=55, sw=22, circ=2*Math.PI*r;
              let off=0;
              return <>
                {pieData.map((seg) => {
                  const dash = seg.v / pieTotal * circ;
                  const gap = circ - dash;
                  const o = off;
                  off += dash;
                  return <circle key={seg.l} cx={cx} cy={cy} r={r} fill="none" stroke={seg.c} strokeWidth={sw} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-o} transform={`rotate(-90 ${cx} ${cy})`} opacity={0.85}/>;
                })}
                <circle cx={cx} cy={cy} r={r - sw/2 - 2} fill="var(--card)"/>
                <text x={cx} y={cy-6} textAnchor="middle" fill="var(--text-tertiary)" fontSize="8" fontFamily="var(--fm)">TOTAL</text>
                <text x={cx} y={cy+10} textAnchor="middle" fill="var(--text-primary)" fontSize="14" fontWeight="700" fontFamily="var(--fm)">{hide(`$${fDol(pieTotal)}`)}</text>
              </>;
            })()}
          </svg>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
            {pieData.map(seg => {
              const pct = (seg.v / pieTotal * 100);
              return <div key={seg.l}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:10,height:10,borderRadius:3,background:seg.c}}/>
                    <span style={{fontSize:11,color:"var(--text-primary)",fontFamily:"var(--fm)",fontWeight:500}}>{seg.l}</span>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:seg.c,fontFamily:"var(--fm)"}}>{_sf(pct,1)}%</span>
                </div>
                <div style={{height:5,background:"var(--subtle-border)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:seg.c,borderRadius:3,opacity:.7}}/>
                </div>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{hide(`$${fDol(seg.v)}`)}</div>
              </div>;
            })}
          </div>
        </div>
      </div>
    )}

    {/* Margin Utilization Gauge */}
    {ibData?.loaded && ibData?.summary?.nlv?.amount > 0 && (() => {
      const initMargin = ibData.summary?.initMargin?.amount || 0;
      const nlv = ibData.summary?.nlv?.amount || 1;
      const marginPct = Math.min((initMargin / nlv) * 100, 100);
      const gaugeColor = marginPct > 50 ? "#ff453a" : marginPct > 30 ? "#ffd60a" : "#30d158";
      const gaugeColorBg = marginPct > 50 ? "rgba(255,69,58,.1)" : marginPct > 30 ? "rgba(255,214,10,.1)" : "rgba(48,209,88,.1)";
      // Semi-circle gauge: arc from 180deg to 0deg (left to right)
      const cx = 100, cy = 90, r = 70, sw = 14;
      const startAngle = Math.PI; // 180 deg
      const endAngle = 0;        // 0 deg
      const totalArc = Math.PI;
      const fillAngle = startAngle - (marginPct / 100) * totalArc;
      // Full arc (background)
      const bgX1 = cx + r * Math.cos(startAngle), bgY1 = cy - r * Math.sin(startAngle);
      const bgX2 = cx + r * Math.cos(endAngle), bgY2 = cy - r * Math.sin(endAngle);
      const bgPath = `M ${bgX1} ${bgY1} A ${r} ${r} 0 0 1 ${bgX2} ${bgY2}`;
      // Fill arc
      const fX2 = cx + r * Math.cos(fillAngle), fY2 = cy - r * Math.sin(fillAngle);
      const largeArc = marginPct > 50 ? 1 : 0;
      const fillPath = `M ${bgX1} ${bgY1} A ${r} ${r} 0 ${largeArc} 1 ${fX2} ${fY2}`;
      // Tick marks
      const ticks = [0, 25, 50, 75, 100];

      return (
        <div style={card}>
          {secTitle("📐","Utilizacion de Margen")}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            <svg width={200} height={120} viewBox="0 0 200 120">
              {/* Background arc */}
              <path d={bgPath} fill="none" stroke="var(--subtle-bg2)" strokeWidth={sw} strokeLinecap="round"/>
              {/* Fill arc */}
              {marginPct > 0 && <path d={fillPath} fill="none" stroke={gaugeColor} strokeWidth={sw} strokeLinecap="round" opacity={0.85}/>}
              {/* Tick marks */}
              {ticks.map(t => {
                const a = startAngle - (t / 100) * totalArc;
                const ix = cx + (r + sw/2 + 4) * Math.cos(a);
                const iy = cy - (r + sw/2 + 4) * Math.sin(a);
                return <text key={t} x={ix} y={iy+3} textAnchor="middle" fontSize="7" fill="var(--text-tertiary)" fontFamily="var(--fm)">{t}%</text>;
              })}
              {/* Center value */}
              <text x={cx} y={cy-8} textAnchor="middle" fontSize="28" fontWeight="800" fill={gaugeColor} fontFamily="var(--fm)">{_sf(marginPct,1)}%</text>
              <text x={cx} y={cy+8} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)" fontFamily="var(--fm)">margen utilizado</text>
            </svg>
            <div style={{display:"flex",gap:16,marginTop:4}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5}}>INIT MARGIN</div>
                <div style={{fontSize:14,fontWeight:700,color:gaugeColor,fontFamily:"var(--fm)"}}>{hide(`$${fDol(initMargin)}`)}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5}}>NLV</div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{hide(`$${fDol(nlv)}`)}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5}}>DISPONIBLE</div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)"}}>{hide(`$${fDol(nlv - initMargin)}`)}</div>
              </div>
            </div>
            {/* Color legend */}
            <div style={{display:"flex",gap:12,marginTop:10,fontSize:9,fontFamily:"var(--fm)"}}>
              <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:"#30d158"}}/>{"< 30%"}</span>
              <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:"#ffd60a"}}/>30-50%</span>
              <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:"#ff453a"}}/>{"> 50%"}</span>
            </div>
          </div>
        </div>
      );
    })()}
  </div>

  {/* ── Market Cap & Type & Strategy Breakdown ── */}
  {portfolioTotals.positions?.length > 0 && (() => {
    const capBuckets = {Mega:0,Large:0,Mid:0,Small:0,Micro:0,ETF:0};
    const typeBuckets = {};
    const stratBuckets = {};
    portfolioTotals.positions.forEach(p => {
      const val = p.valueUSD || 0;
      const mc = (p.mc || 0) * 1e9;
      const cat = p.cat || "COMPANY";
      if (cat === "ETF" || p.ticker?.includes("ETF")) capBuckets.ETF += val;
      else if (mc >= 200e9) capBuckets.Mega += val;
      else if (mc >= 10e9) capBuckets.Large += val;
      else if (mc >= 2e9) capBuckets.Mid += val;
      else if (mc >= 300e6) capBuckets.Small += val;
      else if (mc > 0) capBuckets.Micro += val;
      else capBuckets.Large += val;
      // Type (COMPANY/REIT/ETF)
      typeBuckets[cat] = (typeBuckets[cat]||0) + val;
      // Strategy from tags field
      const strat = p.tags || p.category || cat || "Other";
      stratBuckets[strat] = (stratBuckets[strat]||0) + val;
    });
    const capTotal = Object.values(capBuckets).reduce((s,v)=>s+v,0);
    const typeTotal = Object.values(typeBuckets).reduce((s,v)=>s+v,0);
    const stratTotal = Object.values(stratBuckets).reduce((s,v)=>s+v,0);
    const capColors = {Mega:"#64d2ff",Large:"#30d158",Mid:"#ffd60a",Small:"#ff9f0a",Micro:"#ff453a",ETF:"#bf5af2"};
    const typeColors = {COMPANY:"#30d158",REIT:"#5e5ce6",ETF:"#bf5af2",CEF:"#ff6482"};
    const stratColors = ["#30d158","#64d2ff","#ffd60a","#ff9f0a","#bf5af2","#ff453a","#5e5ce6","#ff6482","#ac8e68","#30b0c7"];
    const Donut = ({data, colors, sz=80}) => {
      const entries = Object.entries(data).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
      const total = entries.reduce((s,[,v])=>s+v,0);
      if (total<=0) return null;
      const r=sz/2-5, cx=sz/2, cy=sz/2, circ=2*Math.PI*r;
      let off=0;
      return <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} style={{flexShrink:0}}>
        {entries.map(([name,val],i)=>{const d=val/total*circ;const el=<circle key={name} cx={cx} cy={cy} r={r} fill="none" stroke={typeof colors==="object"&&!Array.isArray(colors)?colors[name]:colors[i%colors.length]} strokeWidth={10} strokeDasharray={`${d} ${circ-d}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`} opacity={.8}/>;off+=d;return el;})}
        <circle cx={cx} cy={cy} r={r-8} fill="var(--card)"/>
      </svg>;
    };
    return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:10}}>
      <div style={card}>
        <div style={ls}>MARKET CAP</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Donut data={capBuckets} colors={capColors}/>
          <div style={{flex:1}}>{Object.entries(capBuckets).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([name,val])=>(
            <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:1.5,background:capColors[name]}}/><span style={{fontSize:9,color:"var(--text-secondary)"}}>{name}</span></div>
              <span style={{fontSize:9,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{capTotal>0?_sf(val/capTotal*100,0):"0"}%</span>
            </div>
          ))}</div>
        </div>
      </div>
      <div style={card}>
        <div style={ls}>TIPO</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Donut data={typeBuckets} colors={typeColors}/>
          <div style={{flex:1}}>{Object.entries(typeBuckets).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([name,val])=>(
            <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:1.5,background:typeColors[name]||"#8e8e93"}}/><span style={{fontSize:9,color:"var(--text-secondary)"}}>{name}</span></div>
              <span style={{fontSize:9,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{typeTotal>0?_sf(val/typeTotal*100,0):0}%</span>
            </div>
          ))}</div>
        </div>
      </div>
      <div style={card}>
        <div style={ls}>ESTRATEGIA</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Donut data={stratBuckets} colors={stratColors}/>
          <div style={{flex:1,maxHeight:90,overflowY:"auto"}}>{Object.entries(stratBuckets).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([name,val],i)=>(
            <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:1.5,background:stratColors[i%stratColors.length]}}/><span style={{fontSize:9,color:"var(--text-secondary)"}}>{name}</span></div>
              <span style={{fontSize:9,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{stratTotal>0?_sf(val/stratTotal*100,0):0}%</span>
            </div>
          ))}</div>
        </div>
      </div>
    </div>);
  })()}

  {/* ── Cash & Margin Status ── */}
  {CASH_DATA.length > 0 && (() => {
    const negCash = CASH_DATA.filter(c => c.cash_balance < -1);
    const totalNegUSD = negCash.reduce((s,c) => s + (c.cash_balance_usd || 0), 0);
    const totalIntPaid = CASH_DATA.reduce((s,c) => s + Math.abs(c.interest_paid || 0) * (c.fx_rate || 1), 0);
    const totalIntReceived = CASH_DATA.reduce((s,c) => s + (c.interest_received || 0) * (c.fx_rate || 1), 0);
    const netInterest = totalIntPaid - totalIntReceived;
    const latestDate = CASH_DATA[0]?.fecha || "";
    const acctNames = {"U5372268":"Factory","U6735130":"Dividendos","U7257686":"Gorka","U7953378":"Amparito"};
    // Margin interest history
    const miData = MARGIN_INTEREST_DATA || [];
    const byMonth = {};
    miData.forEach(m => {
      if (!byMonth[m.mes]) byMonth[m.mes] = {total:0, byAcct:{}};
      byMonth[m.mes].total += Math.abs(m.interes_usd);
      const name = acctNames[m.cuenta]||m.cuenta;
      byMonth[m.mes].byAcct[name] = (byMonth[m.mes].byAcct[name]||0) + Math.abs(m.interes_usd);
    });
    const miMonths = Object.keys(byMonth).sort();
    const totalAccum = miMonths.reduce((s,m) => s + byMonth[m].total, 0);
    const avgMonthly = miMonths.length > 0 ? totalAccum / miMonths.length : netInterest;
    const maxMonth = Math.max(...miMonths.map(m => byMonth[m].total), 1);
    // Acct totals for pie
    const acctTotals = {};
    miData.forEach(m => {
      const name = acctNames[m.cuenta]||m.cuenta;
      acctTotals[name] = (acctTotals[name]||0) + Math.abs(m.interes_usd);
    });
    const acctSorted = Object.entries(acctTotals).sort((a,b) => b[1]-a[1]);
    const acctColors = {"Factory":"#ff9f0a","Dividendos":"#ff453a","Gorka":"#bf5af2","Amparito":"#64d2ff"};
    return (
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>💳 Cash & Margen IB</div>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{latestDate}</div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 130px",padding:"12px 16px",background:"rgba(255,69,58,.06)",borderRadius:12,border:"1px solid rgba(255,69,58,.15)"}}>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600}}>MARGEN UTILIZADO</div>
          <div style={{fontSize:22,fontWeight:800,color:"var(--red)",fontFamily:"var(--fm)",marginTop:2}}>-${fDol(Math.abs(totalNegUSD))}</div>
        </div>
        <div style={{flex:"1 1 130px",padding:"12px 16px",background:"rgba(255,69,58,.06)",borderRadius:12,border:"1px solid rgba(255,69,58,.15)"}}>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600}}>INT. ÚLTIMO MES</div>
          <div style={{fontSize:22,fontWeight:800,color:"var(--red)",fontFamily:"var(--fm)",marginTop:2}}>-${fDol(totalIntPaid)}</div>
          <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>~${fDol(totalIntPaid*12)}/año</div>
        </div>
        <div style={{flex:"1 1 130px",padding:"12px 16px",background:"rgba(255,69,58,.08)",borderRadius:12,border:"1px solid rgba(255,69,58,.2)"}}>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600}}>TOTAL PAGADO</div>
          <div style={{fontSize:22,fontWeight:800,color:"#ff9f0a",fontFamily:"var(--fm)",marginTop:2}}>-${fDol(totalAccum)}</div>
          <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{miMonths.length} meses · media ${fDol(avgMonthly)}/mes</div>
        </div>
        {totalIntReceived > 0 && <div style={{flex:"1 1 130px",padding:"12px 16px",background:"rgba(48,209,88,.06)",borderRadius:12,border:"1px solid rgba(48,209,88,.15)"}}>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600}}>INT. RECIBIDOS</div>
          <div style={{fontSize:22,fontWeight:800,color:"var(--green)",fontFamily:"var(--fm)",marginTop:2}}>+${fDol(totalIntReceived)}</div>
        </div>}
      </div>
      {/* Monthly interest chart */}
      {miMonths.length > 0 && <div style={{marginBottom:14}}>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:8,fontWeight:600}}>INTERESES POR MES</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:2,height:80}}>
          {miMonths.map(m => {
            const h = (byMonth[m].total / maxMonth) * 70;
            const label = m.slice(5,7)+"/"+m.slice(2,4);
            return <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <div style={{fontSize:8,color:"var(--red)",fontFamily:"var(--fm)",fontWeight:700}}>${Math.round(byMonth[m].total)}</div>
              <div style={{width:"100%",maxWidth:28,height:`${Math.max(h,3)}%`,background:"linear-gradient(180deg,#ff453a,rgba(255,69,58,.4))",borderRadius:4}}/>
              <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{label}</div>
            </div>;
          })}
        </div>
      </div>}
      {/* By account breakdown */}
      {acctSorted.length > 0 && <div style={{marginBottom:14}}>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:6,fontWeight:600}}>POR CUENTA</div>
        {acctSorted.map(([name,total]) => {
          const pct = totalAccum > 0 ? (total/totalAccum)*100 : 0;
          return <div key={name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div style={{width:8,height:8,borderRadius:4,background:acctColors[name]||"var(--gold)",flexShrink:0}}/>
            <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)",width:80}}>{name}</div>
            <div style={{flex:1,height:6,background:"var(--subtle-border)",borderRadius:3,overflow:"hidden"}}>
              <div style={{width:pct+"%",height:"100%",background:acctColors[name]||"var(--gold)",borderRadius:3}}/>
            </div>
            <div style={{fontSize:11,fontWeight:700,color:acctColors[name]||"var(--gold)",fontFamily:"var(--fm)",width:60,textAlign:"right"}}>${fDol(total)}</div>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",width:35,textAlign:"right"}}>{pct.toFixed(0)}%</div>
          </div>;
        })}
      </div>}
      {/* Detail by account+currency */}
      <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:6,fontWeight:600}}>SALDOS NEGATIVOS</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {negCash.map((c,i) => (
          <div key={i} style={{padding:"6px 12px",borderRadius:8,background:"var(--subtle-bg)",border:"1px solid var(--subtle-bg2)",fontSize:11,fontFamily:"var(--fm)"}}>
            <span style={{color:"var(--text-tertiary)"}}>{acctNames[c.cuenta]||c.cuenta}</span>
            <span style={{color:"var(--red)",fontWeight:700,marginLeft:6}}>{c.divisa} -${fDol(Math.abs(c.cash_balance_usd||0))}</span>
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
        <div style={{marginBottom:16,padding:"12px 16px",background:"var(--row-alt)",borderRadius:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Cobertura de gastos</span>
            <span style={{fontSize:12,fontWeight:700,color:latestCov>=100?"var(--green)":"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(latestCov,0)}%</span>
          </div>
          <div style={{height:12,background:"var(--subtle-bg2)",borderRadius:6,overflow:"hidden",position:"relative"}}>
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
                <div style={{width:"100%",height:1,background:"var(--border-hover)",flexShrink:0}}/>
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",width:"100%"}}>
                  {!isPos && <div style={{width:"70%",maxWidth:14,height:`${Math.max(hPct,v<0?3:0)}%`,background:"rgba(255,69,58,.45)",borderRadius:"0 0 2px 2px"}}/>}
                  {!isPos && showLbl && <div style={{fontSize:7,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)",marginTop:1,whiteSpace:"nowrap"}}>-€{Math.abs(v)>=1000?_sf(Math.abs(v)/1000,1)+"K":_sf(Math.abs(v),0)}</div>}
                </div>
                {i%4===0 && <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:1}}>{mN3[parseInt(d.m.slice(5), 10)-1]||""}{d.m.slice(2,4)}</div>}
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
          <div style={{flex:1,height:1,background:"var(--subtle-bg)"}}/>
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
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {(() => {
        const yearEntries = Object.entries(incomeByYear).sort();
        const maxTotal = Math.max(...yearEntries.map(([,d]) => Math.abs(d.total || 0)), 1);
        return yearEntries.map(([y, d]) => {
          const bars = strats.map(s => ({...s, v: d[s.k] || 0})).filter(s => s.v > 0);
          const positive = bars.reduce((s, b) => s + b.v, 0) || 1;
          const barWidth = Math.min((positive / maxTotal) * 100, 100);
          return <div key={y}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:13,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{y}</span>
              <span style={{fontSize:13,fontWeight:700,color:d.total >= 0 ? "var(--green)" : "var(--red)",fontFamily:"var(--fm)"}}>{hide(`$${(d.total || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}`)}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{flex:1,height:26,background:"var(--subtle-bg)",borderRadius:6,overflow:"hidden",position:"relative"}}>
                <div style={{display:"flex",height:"100%",width:`${barWidth}%`}}>
                  {bars.map(b => (
                    <div key={b.k} style={{width:`${b.v / positive * 100}%`,background:b.c,minWidth:2,position:"relative",overflow:"hidden"}} title={`${b.l}: $${(b.v || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}`}>
                      {b.v / positive > 0.12 && <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:"rgba(0,0,0,.7)",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>{_sf(b.v / 1000, 0)}K</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>;
        });
      })()}
      {/* Legend */}
      <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:6,padding:"10px 0",borderTop:"1px solid var(--border)"}}>
        {strats.map(s => <div key={s.k} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>
          <div style={{width:10,height:10,borderRadius:2,background:s.c}}/>{s.l}
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
              <div style={{flex:1,height:6,background:"var(--subtle-border)",borderRadius:3,overflow:"hidden"}}>
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
        <div style={{fontSize:16,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>${Math.round(fire.monthlyDivNeeded || FIRE_PARAMS.monthlyExp || 0).toLocaleString()}</div>
      </div>
      <div style={{padding:"8px 14px",borderRadius:8,background:"rgba(200,164,78,.06)",border:"1px solid rgba(200,164,78,.15)"}}>
        <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>PATRIMONIO 2040</div>
        <div style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>${fDol(FIRE_PROJ[FIRE_PROJ.length-1]?.e||0)}</div>
      </div>
    </div>
    {(() => {
      const maxE = FIRE_PROJ.length > 0 ? Math.max(...FIRE_PROJ.map(p => p.e)) : 1;
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
            <td style={{padding:"5px 10px",fontSize:row.bold?12:11,color:row.bold?"var(--text-primary)":"var(--text-secondary)",fontFamily:"var(--fm)",fontWeight:row.bold?600:400,borderBottom:"1px solid var(--subtle-bg)"}}>{row.l}</td>
            {ANNUAL_PL.map(d => {
              const v = d[row.k]||0;
              return <td key={d.y} style={{padding:"5px 10px",textAlign:"right",fontSize:row.bold?12:11,fontWeight:row.bold?700:500,color:v<0?"var(--red)":row.c,fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>
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
              const rate = d.sueldo > 0 ? ((d.sueldo + (d.gastos||0)) / d.sueldo * 100) : null;
              return <td key={d.y} style={{padding:"5px 10px",textAlign:"right",fontSize:11,fontWeight:600,color:rate!=null?(rate>50?"var(--green)":"var(--orange)"):"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{rate!=null?`${_sf(rate,0)}%`:"—"}</td>;
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
            const mn = mNP[parseInt(d.m.slice(5), 10)-1] || d.m.slice(5);
            return <div key={d.m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",minWidth:0}}>
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",width:"100%"}}>
                {isP && <div style={{fontSize:7,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)",marginBottom:1,whiteSpace:"nowrap"}}>{v>=1000?`${_sf(v/1000,0)}K`:`$${_sf(v,0)}`}</div>}
                {isP && <div style={{width:"100%",maxWidth:24,height:`${Math.max(h,3)}%`,background:"rgba(48,209,88,.5)",borderRadius:"3px 3px 0 0"}}/>}
              </div>
              <div style={{width:"100%",height:1,background:"var(--border-hover)",flexShrink:0}}/>
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",width:"100%"}}>
                {!isP && <div style={{width:"100%",maxWidth:24,height:`${Math.max(h,3)}%`,background:"rgba(255,69,58,.45)",borderRadius:"0 0 3px 3px"}}/>}
                {!isP && <div style={{fontSize:7,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)",marginTop:1,whiteSpace:"nowrap"}}>-{_sf(Math.abs(v)/1000,0)}K</div>}
              </div>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,marginTop:2}}>{mn}</div>
            </div>;
          })}
        </div>
        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:2}}>
          {[...months12].reverse().map(d => {
            const v = d.total || 0;
            const mn = mNP[parseInt(d.m.slice(5), 10)-1] || "";
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
          <div style={{flex:1,height:16,background:"var(--subtle-bg)",borderRadius:4,overflow:"hidden"}}>
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
            const bg = i%2?"var(--row-alt)":"transparent";
            const bd = "1px solid var(--subtle-bg)";
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

  {/* ── Correlacion del Portfolio ── */}
  <div style={card}>
    <div
      style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",userSelect:"none"}}
      onClick={() => { setCorrOpen(o => !o); if (!corrData && !corrLoading) fetchCorrelation(); }}
    >
      {secTitle("🔗","Correlación del Portfolio")}
      <span style={{fontSize:12,color:"var(--text-tertiary)",transform:corrOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s"}}>▼</span>
    </div>
    {corrOpen && (
      corrLoading ? (
        <InlineLoading message="Cargando datos de correlacion..." />
      ) : corrData && corrData.tickers.length >= 3 ? (() => {
        const { tickers: ct, matrix: cm, score, avgCorr, bestPair, worstPair } = corrData;
        const n = ct.length;
        const cellSz = Math.max(24, Math.min(36, 480 / n));
        const labelW = 50;
        const labelH = 50;
        const w = labelW + n * cellSz;
        const h = labelH + n * cellSz;
        const corrColor = (v) => {
          if (v >= 0.7) return `rgba(255,69,58,${0.3 + 0.7 * Math.min(1, (v - 0.5) / 0.5)})`;
          if (v >= 0.3) return `rgba(255,159,10,${0.2 + 0.5 * ((v - 0.3) / 0.4)})`;
          if (v >= -0.3) { const isLight = document.documentElement.getAttribute("data-theme") === "light"; return isLight ? `rgba(0,0,0,${0.05 + 0.1 * Math.abs(v)})` : `rgba(255,255,255,${0.05 + 0.1 * Math.abs(v)})`; }
          return `rgba(10,132,255,${0.3 + 0.7 * Math.min(1, Math.abs(v + 0.3) / 0.7)})`;
        };
        const scoreColor = score >= 70 ? "var(--green)" : score >= 40 ? "#ffd60a" : "var(--red)";
        return <>
          {/* Diversification score + highlights */}
          <div style={{display:"flex",gap:16,marginBottom:16,flexWrap:"wrap"}}>
            <div style={{padding:"12px 20px",background:"var(--row-alt)",borderRadius:12,border:"1px solid var(--border)",textAlign:"center",minWidth:120}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.5}}>DIVERSIFICATION SCORE</div>
              <div style={{fontSize:32,fontWeight:800,fontFamily:"var(--fm)",color:scoreColor,lineHeight:1.2}}>{score}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Avg r = {_sf(avgCorr, 2)}</div>
            </div>
            {bestPair && (
              <div style={{padding:"10px 16px",background:"rgba(255,69,58,.04)",borderRadius:12,border:"1px solid rgba(255,69,58,.15)",flex:1,minWidth:140}}>
                <div style={{fontSize:9,color:"var(--red)",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.5}}>MAS CORRELADOS</div>
                <div style={{fontSize:14,fontWeight:700,fontFamily:"var(--fm)",color:"var(--text-primary)",marginTop:2}}>{bestPair[0]} / {bestPair[1]}</div>
                <div style={{fontSize:11,color:"var(--red)",fontFamily:"var(--fm)"}}>r = {_sf(bestPair[2], 3)}</div>
              </div>
            )}
            {worstPair && (
              <div style={{padding:"10px 16px",background:"rgba(10,132,255,.04)",borderRadius:12,border:"1px solid rgba(10,132,255,.15)",flex:1,minWidth:140}}>
                <div style={{fontSize:9,color:"#0a84ff",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.5}}>MENOS CORRELADOS</div>
                <div style={{fontSize:14,fontWeight:700,fontFamily:"var(--fm)",color:"var(--text-primary)",marginTop:2}}>{worstPair[0]} / {worstPair[1]}</div>
                <div style={{fontSize:11,color:"#0a84ff",fontFamily:"var(--fm)"}}>r = {_sf(worstPair[2], 3)}</div>
              </div>
            )}
          </div>
          {/* Heatmap */}
          <div style={{overflowX:"auto"}}>
            <svg viewBox={`0 0 ${w} ${h}`} style={{width:Math.min(w, 600),height:"auto",display:"block",margin:"0 auto"}}>
              {/* X-axis labels (rotated 45 degrees) */}
              {ct.map((t, i) => (
                <text key={`x${i}`} x={labelW + i * cellSz + cellSz / 2} y={labelH - 4} textAnchor="end"
                  transform={`rotate(-45,${labelW + i * cellSz + cellSz / 2},${labelH - 4})`}
                  style={{fontSize:Math.min(9, cellSz * 0.35),fill:"var(--text-secondary)",fontFamily:"var(--fm)",fontWeight:600}}>{t}</text>
              ))}
              {/* Y-axis labels */}
              {ct.map((t, i) => (
                <text key={`y${i}`} x={labelW - 4} y={labelH + i * cellSz + cellSz / 2 + 3} textAnchor="end"
                  style={{fontSize:Math.min(9, cellSz * 0.35),fill:"var(--text-secondary)",fontFamily:"var(--fm)",fontWeight:600}}>{t}</text>
              ))}
              {/* Cells */}
              {cm.map((row, i) => row.map((v, j) => (
                <g key={`${i}-${j}`}>
                  <rect x={labelW + j * cellSz} y={labelH + i * cellSz} width={cellSz - 1} height={cellSz - 1} rx={3}
                    fill={i === j ? "var(--subtle-bg2)" : corrColor(v)} stroke="var(--subtle-bg)" strokeWidth=".5"/>
                  {cellSz >= 26 && <text x={labelW + j * cellSz + cellSz / 2} y={labelH + i * cellSz + cellSz / 2 + 3}
                    textAnchor="middle" style={{fontSize:Math.min(8, cellSz * 0.28),fill:i === j ? "var(--text-tertiary)" : "var(--text-primary)",fontFamily:"var(--fm)",fontWeight:500}}>
                    {i === j ? "1" : _sf(v, 2)}
                  </text>}
                </g>
              )))}
            </svg>
          </div>
          {/* Legend */}
          <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:10,fontSize:9,fontFamily:"var(--fm)",color:"var(--text-tertiary)"}}>
            <span><span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"rgba(10,132,255,.6)",verticalAlign:"middle",marginRight:3}}></span>Negativa (diversifica)</span>
            <span><span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"var(--border-hover)",verticalAlign:"middle",marginRight:3}}></span>Sin correlación</span>
            <span><span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"rgba(255,69,58,.7)",verticalAlign:"middle",marginRight:3}}></span>Alta positiva (riesgo)</span>
          </div>
        </>;
      })() : corrData ? (
        <div style={{padding:16,textAlign:"center",color:"var(--text-tertiary)",fontSize:11,fontFamily:"var(--fm)"}}>Datos insuficientes para calcular la matriz de correlación</div>
      ) : null
    )}
  </div>

</div>
);
}
