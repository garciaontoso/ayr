import { useState, useEffect, useCallback, useRef } from 'react';
import { useHome } from '../../context/HomeContext';
import { CURRENCIES, DISPLAY_CCYS, APP_VERSION, API_URL, HOME_TAB_GROUPS } from '../../constants/index.js';
import { saveCompanyToStorage } from '../../utils/storage.js';
import { PortfolioTab } from '../home';
import { ErrorBoundary } from '../ui';

// ─── Direct imports (no lazy loading — ensures offline works) ───
import ScreenerTab from '../home/ScreenerTab';
import TradesTab from '../home/TradesTab';
import PatrimonioTab from '../home/PatrimonioTab';
import DashboardTab from '../home/DashboardTab';
import DividendosTab from '../home/DividendosTab';
import FireTab from '../home/FireTab';
import GastosTab from '../home/GastosTab';
import WatchlistTab from '../home/WatchlistTab';
import HistorialTab from '../home/HistorialTab';
import AdvisorTab from '../home/AdvisorTab';
import ResearchTab from '../home/ResearchTab';
import AgentesTab from '../home/AgentesTab';
import CoveredCallsTab from '../home/CoveredCallsTab';
import IncomeLabTab from '../home/IncomeLabTab';
// ProcesoTab deleted 2026-04-08: theses now live per-company inside the
// analysis view (TesisTab). File removed entirely after audit B.
import LibraryTab from '../home/LibraryTab';
import SmartMoneyTab from '../home/SmartMoneyTab';
import NoticiasTab, { fetchAllYouTubeForOffline } from '../home/NoticiasTab';
import CurrencyTab from '../home/CurrencyTab';
import MacroTab from '../home/MacroTab';
import EarningsTab from '../home/EarningsTab';
import NewsTab from '../home/NewsTab';

// Combined Income tab with sub-tabs
function IncomeTab() {
  const [sub, setSub] = useState(() => localStorage.getItem('income_sub') || 'cc');
  return <div>
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      {[{id:"cc",lbl:"📞 CC Income"},{id:"lab",lbl:"🧪 Income Lab"}].map(t=>
        <button key={t.id} onClick={()=>{setSub(t.id);localStorage.setItem('income_sub',t.id);}}
          style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${sub===t.id?"var(--gold)":"var(--border)"}`,
            background:sub===t.id?"var(--gold-dim)":"transparent",color:sub===t.id?"var(--gold)":"var(--text-tertiary)",
            fontSize:11,fontWeight:sub===t.id?700:500,cursor:"pointer",fontFamily:"var(--fb)",transition:"all .15s"}}>
          {t.lbl}
        </button>
      )}
    </div>
    {sub === "cc" ? <CoveredCallsTab /> : <IncomeLabTab />}
  </div>;
}
import NominaTab from '../home/NominaTab';
import PresupuestoTab from '../home/PresupuestoTab';
import SettingsPanel from '../home/SettingsPanel';

// No lazy loading — all tabs in main bundle for reliable offline support

// ─── Semi-circle gauge SVG ───
function MiniGauge({ value, min, max, colors, size = 80, label }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const R = 32, cx = 40, cy = 38, sw = 7;
  // Arc from 180deg to 0deg (left to right)
  const startAngle = Math.PI;
  const endAngle = 0;
  const arcLength = Math.PI;
  // Background arc segments (colored zones)
  const segments = colors.map((seg, i) => {
    const a1 = startAngle - (seg.from / (max - min)) * arcLength;
    const a2 = startAngle - (seg.to / (max - min)) * arcLength;
    const x1 = cx + R * Math.cos(a1), y1 = cy - R * Math.sin(a1);
    const x2 = cx + R * Math.cos(a2), y2 = cy - R * Math.sin(a2);
    const large = (a1 - a2) > Math.PI ? 1 : 0;
    return <path key={i} d={`M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2}`}
      fill="none" stroke={seg.color} strokeWidth={sw} strokeLinecap="round" opacity={0.25} />;
  });
  // Needle
  const needleAngle = startAngle - pct * arcLength;
  const needleLen = R - 4;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy - needleLen * Math.sin(needleAngle);
  // Find active color
  const activeColor = (colors.find(c => value >= c.from + min && value <= c.to + min) || colors[0]).color;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
      <svg width={size} height={size * 0.55} viewBox="0 0 80 46">
        {segments}
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={activeColor} strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={2.5} fill={activeColor} />
        {/* Value */}
        <text x={cx} y={cy + 1} textAnchor="middle" fontSize="10" fontWeight="700" fill={activeColor}
          fontFamily="var(--fm)">{typeof value === 'number' ? Math.round(value) : '—'}</text>
      </svg>
      {label && <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: -2 }}>{label}</span>}
    </div>
  );
}

// ─── Small reminder badge that shows when the AI agents haven't run today ───
// Fetches /api/agent-run/status once on mount. Click → switches to AgentesTab.
function RunReminderBadge({ onClick }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(API_URL + "/api/agent-run/status");
        const d = await r.json();
        if (!cancelled) setStatus(d);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
  if (!status) return null;
  if (status.state === "running") {
    return (
      <button onClick={onClick} title="Agentes ejecutándose"
        style={{padding:"4px 9px",borderRadius:6,border:"1px solid #c8a44e",background:"rgba(200,164,78,.14)",color:"#c8a44e",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>
        ⏳ Agentes...
      </button>
    );
  }
  const todayUtc = new Date().toISOString().slice(0, 10);
  const lastDay = status.finished_at ? status.finished_at.slice(0, 10) : (status.started_at || "").slice(0, 10);
  const ranToday = lastDay === todayUtc;
  if (ranToday) return null; // Hide badge when fresh
  return (
    <button onClick={onClick} title="Los agentes no se han ejecutado hoy — pulsa para ir al tab Agentes"
      style={{padding:"4px 9px",borderRadius:6,border:"1px solid #f87171",background:"rgba(248,113,113,.14)",color:"#f87171",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>
      🤖 Sin ejecutar hoy
    </button>
  );
}

function SentimentBar() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(API_URL + "/api/market-sentiment")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  if (!data || (!data.vix && !data.fearGreed)) return null;

  const vix = data.vix;
  const fg = data.fearGreed || null;

  const vixColors = [
    { from: 0, to: 15, color: "#30d158" },
    { from: 15, to: 25, color: "#ffd60a" },
    { from: 25, to: 35, color: "#ff9f0a" },
    { from: 35, to: 60, color: "#ff453a" },
  ];
  const fgColors = [
    { from: 0, to: 25, color: "#ff453a" },
    { from: 25, to: 45, color: "#ff9f0a" },
    { from: 45, to: 55, color: "#ffd60a" },
    { from: 55, to: 75, color: "#30d158" },
    { from: 75, to: 100, color: "#30d158" },
  ];

  const vixColor = vix ? (vix.price < 15 ? "#30d158" : vix.price < 25 ? "#ffd60a" : vix.price < 35 ? "#ff9f0a" : "#ff453a") : "var(--text-tertiary)";
  const fgColor = fg ? (fg.score <= 25 ? "#ff453a" : fg.score <= 45 ? "#ff9f0a" : fg.score <= 55 ? "#ffd60a" : "#30d158") : "var(--text-tertiary)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "2px 8px",
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
      marginBottom: 2, fontSize: 10, fontFamily: "var(--fm)",
    }}>
      {vix && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MiniGauge value={vix.price} min={0} max={60} colors={vixColors} size={54} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600 }}>VIX</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: vixColor }}>{vix.price.toFixed(1)}</span>
            <span style={{ fontSize: 8, color: vix.change >= 0 ? "#ff453a" : "#30d158" }}>
              {vix.change >= 0 ? "+" : ""}{vix.change.toFixed(1)} ({vix.changePct >= 0 ? "+" : ""}{vix.changePct.toFixed(1)}%)
            </span>
          </div>
        </div>
      )}
      {vix && <div style={{ width: 1, height: 28, background: "var(--border)" }} />}
      {fg ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MiniGauge value={fg.score} min={0} max={100} colors={fgColors} size={54} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600 }}>Fear & Greed</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: fgColor }}>{fg.score}</span>
            <span style={{ fontSize: 8, color: fgColor }}>{fg.label}</span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MiniGauge value={50} min={0} max={100} colors={fgColors} size={70} label="" />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600 }}>Fear & Greed</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-tertiary)" }}>—</span>
            <span style={{ fontSize: 8, color: "var(--text-tertiary)" }}>No data</span>
          </div>
        </div>
      )}
      {data.cached && <span style={{ fontSize: 7, color: "var(--text-tertiary)", opacity: 0.5, marginLeft: "auto" }}>cached</span>}
    </div>
  );
}

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
    const usTickers = allTickers; // Worker FMP_MAP handles foreign ticker conversion
    const cache = await caches.open("ayr-offline-data");
    let errors = 0;

    // ── Phase 0: Pre-cache ALL JS/CSS chunks for offline tab loading ──
    // Critical: lazy-loaded tabs are dynamic imports embedded inside the
    // entry chunk's source code as plain string literals. We must crawl
    // the bundle text (not just the HTML) to discover them, otherwise
    // switching to an unvisited tab while offline crashes React.lazy.
    setDlPhase("Assets de la app");
    try {
      const staticCache = await caches.open("ayr-v3.4");
      const assetUrls = new Set();

      // Seed 1: scripts + stylesheets currently in the document
      document.querySelectorAll('script[src], link[rel="modulepreload"], link[rel="stylesheet"]').forEach(el => {
        const href = el.src || el.href;
        if (href) assetUrls.add(href);
      });

      // Seed 2: parse index.html for any /assets/ references
      try {
        const htmlResp = await fetch('/', { cache: 'reload' });
        const html = await htmlResp.text();
        const assetRx = /\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g;
        let m;
        while ((m = assetRx.exec(html)) !== null) {
          assetUrls.add(new URL(m[0], location.origin).href);
        }
        await staticCache.put(new Request('/'), new Response(html, { headers: { 'Content-Type': 'text/html' } }));
        await staticCache.put(new Request('/index.html'), new Response(html, { headers: { 'Content-Type': 'text/html' } }));
      } catch {}

      // Seed 3: CRITICAL — crawl every JS chunk text we already know about
      // looking for further chunk references. This catches dynamic imports
      // (lazy tabs) that are NOT in the HTML.
      //
      // Vite emits dynamic imports in three flavours inside the entry bundle:
      //   "./formatters-HASH.js"          (relative, sibling chunk)
      //   "assets/QualityTab-HASH.js"     (relative to dist root)
      //   "/assets/Foo-HASH.js"           (absolute)
      // The previous regex only matched the absolute form, which is why
      // every lazy tab was missing from the offline cache (the cache only
      // contained the entry, jsx-runtime and formatters chunks).
      const crawled = new Set();
      const crawl = async (url) => {
        if (crawled.has(url)) return;
        crawled.add(url);
        try {
          const r = await fetch(url, { cache: 'reload' });
          if (!r.ok) return;
          const txt = await r.clone().text();
          await staticCache.put(url, r);
          // Match any string literal that ends in .js or .css and looks
          // like a hashed chunk name. Resolve relative paths against the
          // CURRENT chunk URL so "assets/Foo.js" → "/assets/Foo.js".
          const rx = /["'`](?:\.\/|\/|assets\/)?([A-Za-z0-9._/-]+\.(?:js|css))["'`]/g;
          let m;
          while ((m = rx.exec(txt)) !== null) {
            const raw = m[0].slice(1, -1); // strip quotes
            // Skip irrelevant matches (CSS keywords, comments, etc.)
            if (!raw.match(/-[A-Za-z0-9_-]{6,}\.(js|css)$/)) continue;
            try {
              const resolved = new URL(raw, url).href;
              // Only cache same-origin /assets/ entries
              const u = new URL(resolved);
              if (u.origin !== location.origin) continue;
              if (!u.pathname.startsWith('/assets/')) continue;
              if (!assetUrls.has(resolved)) assetUrls.add(resolved);
            } catch {}
          }
        } catch {}
      };
      // First pass: crawl initial seeds (this expands assetUrls in-place)
      for (const url of Array.from(assetUrls)) {
        if (url.endsWith('.js')) await crawl(url);
      }
      // Second pass: crawl any newly-discovered chunks
      for (const url of Array.from(assetUrls)) {
        if (url.endsWith('.js') && !crawled.has(url)) await crawl(url);
      }
      // Final pass: ensure CSS + any remaining assets are cached
      setDlTotal(assetUrls.size); setDlCurrent(0);
      let assetDone = 0;
      for (const url of assetUrls) {
        if (!crawled.has(url)) {
          try {
            const r = await fetch(url, { cache: 'reload' });
            if (r.ok) await staticCache.put(url, r.clone());
          } catch {}
        }
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
      // 2026-04-08: research artefacts so theses, scores and agent insights
      // load offline. Per-ticker drill-downs are cached in a later phase.
      "/api/ai-analysis", "/api/scores",
      "/api/agent-insights?days=14",
      "/api/dividend-dps-live", "/api/dividend-forward",
      "/api/cached-pnl",
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

    // ── Phase 3: Fundamentals per ticker (cache + save slim data to localStorage) ──
    setDlTotal(usTickers.length); setDlCurrent(0);
    setDlPhase("Fundamentales");
    const M = v => (v || 0) / 1e6; // millions helper
    for (let i = 0; i < usTickers.length; i += 5) {
      const batch = usTickers.slice(i, i + 5);
      await Promise.all(batch.map(async (t) => {
        try {
          const fundamentalsUrl = `${API}/api/fundamentals?symbol=${encodeURIComponent(t)}`;
          const r = await fetch(fundamentalsUrl);
          if (!r.ok) { errors++; return; }
          const clone = r.clone();
          await cache.put(fundamentalsUrl, clone);
          const data = await r.json();
          if (!data || !data.income || data.income.length === 0) return;
          // Parse fin inline (same logic as fetchViaFMP but avoids extra fetch)
          const fin = {};
          const incByY = {}, balByY = {}, cfByY = {}, ratByY = {};
          data.income.forEach(d => { incByY[d.fiscalYear] = d; });
          (data.balance||[]).forEach(d => { balByY[d.fiscalYear] = d; });
          (data.cashflow||[]).forEach(d => { cfByY[d.fiscalYear] = d; });
          (data.ratios||[]).forEach(d => { if(d.fiscalYear) ratByY[d.fiscalYear] = d; });
          const years = [...new Set([...Object.keys(incByY),...Object.keys(balByY),...Object.keys(cfByY)])].sort().reverse().slice(0,10);
          years.forEach(yS => {
            const y=+yS, inc=incByY[yS]||{}, bal=balByY[yS]||{}, cf=cfByY[yS]||{}, rat=ratByY[yS]||{};
            fin[y] = { revenue:M(inc.revenue), grossProfit:M(inc.grossProfit), operatingIncome:M(inc.operatingIncome),
              netIncome:M(inc.netIncome), eps:inc.epsDiluted||inc.eps||0, dps:rat.dividendPerShare||0,
              sharesOut:M(inc.weightedAverageShsOutDil||inc.weightedAverageShsOut),
              totalDebt:M((bal.totalDebt||0)||((bal.longTermDebt||0)+(bal.shortTermDebt||0))),
              cash:M(bal.cashAndCashEquivalents||bal.cashAndShortTermInvestments||0),
              equity:M(bal.totalStockholdersEquity||bal.totalEquity||0), retainedEarnings:M(bal.retainedEarnings||0),
              ocf:M(cf.operatingCashFlow||cf.netCashProvidedByOperatingActivities||0),
              capex:Math.abs(M(cf.capitalExpenditure||0)), interestExpense:M(inc.interestExpense||0),
              depreciation:M(inc.depreciationAndAmortization||cf.depreciationAndAmortization||0),
              taxProvision:M(inc.incomeTaxExpense||0) };
          });
          if (data.dividends?.length > 0) {
            const dpsByY = {};
            data.dividends.forEach(d => { const y=new Date(d.date||d.paymentDate||"").getFullYear(); if(y>=2010) dpsByY[y]=(dpsByY[y]||0)+(d.dividend||d.adjDividend||0); });
            Object.keys(dpsByY).forEach(yS => { const y=+yS; if(fin[y]) fin[y].dps=Math.round(dpsByY[y]*100)/100; });
          }
          if (Object.keys(fin).length === 0) return;
          const prof = data.profile||{};
          // Save slim data (~25KB vs 145KB with _rawFMP)
          await saveCompanyToStorage(t, {
            fin, cfg: { ticker:t.toUpperCase(), name:prof.companyName||t, price:prof.price||0, currency:prof.currency||"USD", beta:prof.beta||1.0 },
            profile: { sector:prof.sector, industry:prof.industry, country:prof.country, companyName:prof.companyName, description:(prof.description||"").slice(0,200) },
            fmpExtra: {
              rating:data.rating||{}, dcf:data.dcf||{}, estimates:data.estimates||[], priceTarget:data.priceTarget||{},
              keyMetrics:data.keyMetrics||[], finGrowth:data.finGrowth||[], grades:data.grades||{},
              ownerEarnings:data.ownerEarnings||[], revSegments:data.revSegments||[], geoSegments:data.geoSegments||[],
              peers:data.peers||[], earnings:data.earnings||[], ptSummary:data.ptSummary||{}, profile:prof,
            },
          });
        } catch(e) { errors++; console.warn(`[Offline] ${t}:`, e.message); }
      }));
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

    // ── Phase 6.5: YouTube Dividendo videos for Noticias tab offline ──
    // fetchAllYouTubeForOffline writes to localStorage 'offline_youtube_videos'
    // (separate from the SW cache because the NoticiasTab reads JSON, not Response).
    setDlPhase("Vídeos YouTube Dividendo");
    setDlTotal(1); setDlCurrent(0);
    try {
      const ytCount = await fetchAllYouTubeForOffline();
      setDlCurrent(1);
      // Also cache the API response for backwards compat
      await cacheFetch(`${API}/api/youtube/videos?limit=200`);
    } catch { /* non-critical */ }

    // ── Phase 7: Per-ticker theses + scores drill-downs ──
    // The user opens these from the Portfolio drill-down modal and the
    // analysis Tesis tab. Cache them all so research keeps working offline.
    setDlPhase("Tesis y scores por empresa");
    setDlTotal(usTickers.length); setDlCurrent(0);
    for (let i = 0; i < usTickers.length; i += 8) {
      const batch = usTickers.slice(i, i + 8);
      await Promise.all(batch.map(async (t) => {
        const enc = encodeURIComponent(t);
        await cacheFetch(`${API}/api/theses/${enc}`);
        await cacheFetch(`${API}/api/scores/${enc}`);
        await cacheFetch(`${API}/api/agent-insights?ticker=${enc}&days=30`);
      }));
      setDlCurrent(Math.min(i + 8, usTickers.length));
    }

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
          <div style={{ height: 3, background: "var(--subtle-bg2)", borderRadius: 2, overflow: "hidden" }}>
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
    ibData, ibDiscrepancies, loadIBData, ibSyncMsg,
    alerts, alertsUnread, showAlertPanel, setShowAlertPanel, markAlertsRead, theme, toggleTheme,
  } = useHome();

  // ── 2-level navigation: groups + tabs (added 2026-04-08) ──
  // Top row = group labels (Cartera | Ingresos | …). Second row = the tabs
  // inside the active group. Active group is derived from `homeTab` so deep
  // links and global Cmd+K search continue to work.
  // Drag-and-drop reordering is preserved but only WITHIN a group.
  // Per-group tab order persists via /api/preferences (cloud sync) under
  // the legacy key `ui_home_tabs_order` (now stores an object, not array).
  const groupOf = (tabId) =>
    HOME_TAB_GROUPS.find(g => g.tabs.some(t => t.id === tabId))?.id
    || HOME_TAB_GROUPS[0].id;
  const [activeGroupId, setActiveGroupId] = useState(() => groupOf(homeTab));
  // Sync activeGroup when homeTab changes from outside (e.g. Cmd+K, RunReminderBadge)
  useEffect(() => {
    const g = groupOf(homeTab);
    if (g !== activeGroupId) setActiveGroupId(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeTab]);

  // tabOrderByGroup: { groupId: [tabId,…] }. null = loading.
  const [tabOrderByGroup, setTabOrderByGroup] = useState(() => {
    try {
      const cached = localStorage.getItem('ui_home_tabs_order');
      if (cached) {
        const parsed = JSON.parse(cached);
        // Migrate legacy flat array → per-group object
        if (Array.isArray(parsed)) {
          const migrated = {};
          for (const g of HOME_TAB_GROUPS) {
            const ids = new Set(g.tabs.map(t => t.id));
            migrated[g.id] = parsed.filter(id => ids.has(id));
          }
          return migrated;
        }
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return null;
  });
  const [draggedTabId, setDraggedTabId] = useState(null);
  const [dragOverTabId, setDragOverTabId] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(API_URL + "/api/preferences/ui_home_tabs_order");
        const d = await r.json();
        if (cancelled) return;
        const v = d?.value;
        if (Array.isArray(v)) {
          const migrated = {};
          for (const g of HOME_TAB_GROUPS) {
            const ids = new Set(g.tabs.map(t => t.id));
            migrated[g.id] = v.filter(id => ids.has(id));
          }
          setTabOrderByGroup(migrated);
          try { localStorage.setItem('ui_home_tabs_order', JSON.stringify(migrated)); } catch {}
        } else if (v && typeof v === 'object') {
          setTabOrderByGroup(v);
          try { localStorage.setItem('ui_home_tabs_order', JSON.stringify(v)); } catch {}
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Compute ordered tabs for a given group: saved order first, then any new
  // tabs not yet in the saved order (so adding tabs to a group is safe).
  const orderedTabsForGroup = (groupId) => {
    const group = HOME_TAB_GROUPS.find(g => g.id === groupId) || HOME_TAB_GROUPS[0];
    const saved = tabOrderByGroup?.[groupId];
    if (!saved || !Array.isArray(saved)) return group.tabs;
    const byId = Object.fromEntries(group.tabs.map(t => [t.id, t]));
    const seen = new Set();
    const out = [];
    for (const id of saved) {
      if (byId[id] && !seen.has(id)) { out.push(byId[id]); seen.add(id); }
    }
    for (const t of group.tabs) {
      if (!seen.has(t.id)) out.push(t);
    }
    return out;
  };
  const orderedTabs = orderedTabsForGroup(activeGroupId);

  const persistTabOrder = useCallback(async (groupId, newGroupOrder) => {
    const next = { ...(tabOrderByGroup || {}), [groupId]: newGroupOrder };
    setTabOrderByGroup(next);
    try { localStorage.setItem('ui_home_tabs_order', JSON.stringify(next)); } catch {}
    try {
      await fetch(API_URL + "/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "ui_home_tabs_order", value: next }),
      });
    } catch (e) { console.error("persist tab order failed:", e); }
  }, [tabOrderByGroup]);
  const handleTabDragStart = (e, tabId) => {
    setDraggedTabId(tabId);
    try { e.dataTransfer.setData("text/plain", tabId); e.dataTransfer.effectAllowed = "move"; } catch {}
  };
  const handleTabDragOver = (e, tabId) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "move"; } catch {}
    if (dragOverTabId !== tabId) setDragOverTabId(tabId);
  };
  const handleTabDragEnd = () => {
    setDraggedTabId(null);
    setDragOverTabId(null);
  };
  const handleTabDrop = (e, targetId) => {
    e.preventDefault();
    const sourceId = draggedTabId || (() => { try { return e.dataTransfer.getData("text/plain"); } catch { return null; } })();
    setDraggedTabId(null);
    setDragOverTabId(null);
    if (!sourceId || sourceId === targetId) return;
    // Reorder only within the active group
    const currentIds = orderedTabs.map(t => t.id);
    const fromIdx = currentIds.indexOf(sourceId);
    const toIdx = currentIds.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const newOrder = [...currentIds];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, sourceId);
    persistTabOrder(activeGroupId, newOrder);
  };

  // ── Touch drag support for iPad / iPhone ──
  // HTML5 native drag doesn't fire on touch devices, so we implement a
  // lightweight long-press + drag using pointer events.
  // Flow: pointerdown → 400ms timer → enter drag mode → track pointermove
  // hover-target by elementFromPoint → pointerup drops on current target.
  const touchDragRef = useRef({ tabId: null, timer: null, active: false, pointerId: null });
  const handleTabPointerDown = (e, tabId) => {
    if (e.pointerType !== 'touch') return; // HTML5 drag handles mouse/pen
    touchDragRef.current.tabId = tabId;
    touchDragRef.current.pointerId = e.pointerId;
    touchDragRef.current.active = false;
    if (touchDragRef.current.timer) clearTimeout(touchDragRef.current.timer);
    // Long-press 400ms to enter drag mode (so normal taps still select)
    touchDragRef.current.timer = setTimeout(() => {
      touchDragRef.current.active = true;
      setDraggedTabId(tabId);
      // Haptic feedback if available
      try { navigator.vibrate && navigator.vibrate(30); } catch {}
    }, 400);
  };
  const handleTabPointerMove = (e) => {
    if (e.pointerType !== 'touch') return;
    if (!touchDragRef.current.active) {
      // Cancel long-press if the user starts scrolling before 400ms
      if (touchDragRef.current.timer) {
        clearTimeout(touchDragRef.current.timer);
        touchDragRef.current.timer = null;
      }
      return;
    }
    e.preventDefault(); // block scroll while dragging
    // Find the tab under the pointer
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const btn = el?.closest('[data-tab-id]');
    const overId = btn?.getAttribute('data-tab-id');
    if (overId && overId !== dragOverTabId) setDragOverTabId(overId);
  };
  const handleTabPointerUp = (e) => {
    if (e.pointerType !== 'touch') return;
    if (touchDragRef.current.timer) {
      clearTimeout(touchDragRef.current.timer);
      touchDragRef.current.timer = null;
    }
    if (touchDragRef.current.active) {
      const sourceId = touchDragRef.current.tabId;
      const targetId = dragOverTabId;
      if (sourceId && targetId && sourceId !== targetId) {
        const currentIds = orderedTabs.map(t => t.id);
        const fromIdx = currentIds.indexOf(sourceId);
        const toIdx = currentIds.indexOf(targetId);
        if (fromIdx >= 0 && toIdx >= 0) {
          const newOrder = [...currentIds];
          newOrder.splice(fromIdx, 1);
          newOrder.splice(toIdx, 0, sourceId);
          persistTabOrder(activeGroupId, newOrder);
        }
      }
    }
    touchDragRef.current.active = false;
    touchDragRef.current.tabId = null;
    touchDragRef.current.pointerId = null;
    setDraggedTabId(null);
    setDragOverTabId(null);
  };
  const handleTabPointerCancel = () => {
    if (touchDragRef.current.timer) {
      clearTimeout(touchDragRef.current.timer);
      touchDragRef.current.timer = null;
    }
    touchDragRef.current.active = false;
    touchDragRef.current.tabId = null;
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

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
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
      {/* Logo + Version */}
      <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
        <svg width="26" height="26" viewBox="0 0 40 40" style={{cursor:"pointer"}} onClick={()=>setHomeTab("portfolio")}>
          <defs><linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#c8a44e"/><stop offset="100%" stopColor="#946b1a"/></linearGradient></defs>
          <rect width="40" height="40" rx="9" fill="#0d1117"/>
          <rect x="1.5" y="1.5" width="37" height="37" rx="8" fill="none" stroke="url(#logoGrad)" strokeWidth="1.8" opacity=".55"/>
          <text x="20" y="26.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="url(#logoGrad)" fontFamily="system-ui,-apple-system,sans-serif" letterSpacing="-0.3">A&R</text>
        </svg>
        <span style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.4,letterSpacing:.3}}>v{APP_VERSION}</span>
      </div>

      {/* Divider */}
      <div style={{width:1,height:20,background:"var(--border)",flexShrink:0}}/>

      {/* Group selector — top-level navigation (Cartera | Ingresos | …) */}
      <div style={{position:"relative",flex:1,minWidth:0}}>
        <div className="ar-home-tabs" style={{display:"flex",alignItems:"center",gap:3,overflowX:"auto",flexWrap:"nowrap",scrollbarWidth:"none",padding:"2px 0"}}>
          {HOME_TAB_GROUPS.map(g=>{
            const isActive = activeGroupId === g.id;
            return (
              <button
                key={g.id}
                onClick={()=>{
                  setActiveGroupId(g.id);
                  // If current homeTab isn't in the new group, jump to its first tab
                  if (!g.tabs.some(t=>t.id===homeTab)) {
                    const ordered = orderedTabsForGroup(g.id);
                    if (ordered[0]) setHomeTab(ordered[0].id);
                  }
                }}
                style={{
                  display:"flex",alignItems:"center",gap:4,
                  padding:"5px 12px",borderRadius:7,
                  border:`1px solid ${isActive?"var(--gold)":"transparent"}`,
                  background:isActive?"var(--gold-dim)":"transparent",
                  color:isActive?"var(--gold)":"var(--text-tertiary)",
                  fontSize:12,fontWeight:isActive?700:500,
                  cursor:"pointer",fontFamily:"var(--fb)",whiteSpace:"nowrap",flexShrink:0,
                  transition:"all .12s ease",userSelect:"none",
                }}>
                <span style={{fontSize:12}}>{g.ico}</span>{g.lbl}
              </button>
            );
          })}
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
        {ibSyncMsg && <span style={{fontSize:9,color:"var(--text-tertiary)",whiteSpace:"nowrap",animation:"fadeIn .3s"}}>{ibSyncMsg}</span>}

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

        {/* AI Agents run reminder — badge red if agents haven't run today */}
        <RunReminderBadge onClick={() => setHomeTab("agentes")} />

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

    {/* ── Second-level nav: tabs inside the active group ── */}
    {/* Drag-and-drop reorder works WITHIN this group only. */}
    <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:6,paddingLeft:34,position:"relative"}}>
      <div className="ar-home-tabs" style={{display:"flex",alignItems:"center",gap:3,overflowX:"auto",flexWrap:"nowrap",scrollbarWidth:"none",padding:"2px 0",flex:1,minWidth:0}}>
        {orderedTabs.map(t=>{
          const isActive = homeTab===t.id;
          const isDragging = draggedTabId === t.id;
          const isDragOver = dragOverTabId === t.id && draggedTabId && draggedTabId !== t.id;
          return (
            <button
              key={t.id}
              data-tab-id={t.id}
              onClick={()=>{
                if (touchDragRef.current.active) return;
                setHomeTab(t.id);
              }}
              draggable
              onDragStart={(e)=>handleTabDragStart(e, t.id)}
              onDragOver={(e)=>handleTabDragOver(e, t.id)}
              onDragLeave={()=>{ if (dragOverTabId === t.id) setDragOverTabId(null); }}
              onDrop={(e)=>handleTabDrop(e, t.id)}
              onDragEnd={handleTabDragEnd}
              onPointerDown={(e)=>handleTabPointerDown(e, t.id)}
              onPointerMove={handleTabPointerMove}
              onPointerUp={handleTabPointerUp}
              onPointerCancel={handleTabPointerCancel}
              title="Arrastra para reordenar dentro del grupo"
              style={{
                display:"flex",alignItems:"center",gap:3,
                padding:"4px 9px",borderRadius:6,
                border:`1px solid ${isDragOver?"var(--gold)":isActive?"var(--gold)":"var(--border)"}`,
                background:isDragOver?"rgba(200,164,78,.25)":isActive?"var(--gold-dim)":"transparent",
                color:isActive?"var(--gold)":"var(--text-tertiary)",
                fontSize:11,fontWeight:isActive?700:500,
                cursor: isDragging ? "grabbing" : "grab",
                fontFamily:"var(--fb)",whiteSpace:"nowrap",flexShrink:0,
                opacity: isDragging ? 0.4 : 1,
                transform: isDragOver ? "scale(1.05)" : "none",
                transition: "transform .12s ease, opacity .12s ease, background .12s ease",
                userSelect: "none",
              }}
            >
              <span style={{fontSize:11}}>{t.ico}</span>{t.lbl}
              {t.id==="portfolio" && portfolioList.length>0 && <span style={{fontSize:9,opacity:.7,fontFamily:"var(--fm)"}}>{portfolioList.length}</span>}
              {t.id==="watchlist" && watchlistList.length>0 && <span style={{fontSize:9,opacity:.7,fontFamily:"var(--fm)"}}>{watchlistList.length}</span>}
              {t.id==="historial" && historialList.length>0 && <span style={{fontSize:9,opacity:.7,fontFamily:"var(--fm)"}}>{historialList.length}</span>}
            </button>
          );
        })}
      </div>
    </div>

    {/* Market Sentiment Bar — only on Portfolio tab */}
    {homeTab==="portfolio" && <SentimentBar />}

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
              const icons = { DIVIDEND: "💰", EARNINGS: "📊", DROP: "📉", OPTION_EXP: "⏰", MARGIN: "⚠️", MILESTONE: "🎉", DIV_CUT: "⚠️", DIV_RAISE: "📈" };
              const colors = { DIVIDEND: "var(--gold)", EARNINGS: "#64d2ff", DROP: "var(--red)", OPTION_EXP: "#bf5af2", MARGIN: "#ffd60a", MILESTONE: "var(--green)", DIV_CUT: "var(--red)", DIV_RAISE: "var(--green)" };
              const unreadBg = a.tipo==="DIV_CUT" ? "rgba(255,69,58,.06)" : a.tipo==="DIV_RAISE" ? "rgba(48,209,88,.06)" : "rgba(255,214,10,.03)";
              const unreadBorder = a.tipo==="DIV_CUT" ? "rgba(255,69,58,.15)" : a.tipo==="DIV_RAISE" ? "rgba(48,209,88,.15)" : "rgba(255,214,10,.1)";
              return (
                <div key={a.id || i} style={{padding:"6px 10px",borderRadius:8,background:a.leida?"transparent":unreadBg,border:`1px solid ${a.leida?"var(--subtle-bg)":unreadBorder}`,display:"flex",gap:8,alignItems:"center"}}>
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
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 8px",borderRadius:5,background:isOld?"rgba(255,214,10,.04)":"var(--row-alt)",border:`1px solid ${isOld?"rgba(255,214,10,.12)":"var(--subtle-bg)"}`}}>
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
      {homeTab==="screener" && <ScreenerTab />}
      {homeTab==="trades" && <TradesTab />}
      {homeTab==="patrimonio" && <PatrimonioTab />}
      {homeTab==="dashboard" && <DashboardTab />}
      {homeTab==="dividendos" && <DividendosTab />}
      {homeTab==="fire" && <FireTab />}
      {homeTab==="gastos" && <GastosTab />}
      {homeTab==="watchlist" && <WatchlistTab />}
      {homeTab==="historial" && <HistorialTab />}
      {homeTab==="advisor" && <AdvisorTab />}
      {homeTab==="research" && <ResearchTab />}
      {homeTab==="agentes" && <AgentesTab />}
      {homeTab==="income" && <IncomeTab />}
      {homeTab==="nomina" && <NominaTab />}
      {homeTab==="presupuesto" && <PresupuestoTab />}
      {homeTab==="library" && <LibraryTab />}
      {homeTab==="smart-money" && <SmartMoneyTab />}
      {homeTab==="noticias" && <NoticiasTab />}
      {homeTab==="currency" && <CurrencyTab />}
      {homeTab==="macro" && <MacroTab />}
      {homeTab==="earnings" && <EarningsTab />}
      {homeTab==="news" && <NewsTab />}
    </ErrorBoundary>

    {/* Settings Panel */}
    <ErrorBoundary>
      {showSettings && <SettingsPanel />}
    </ErrorBoundary>
  </div>
  );
}
// v1.0.1
