// FastTab — Análisis profundo de valoración precio vs métrica.
// Herramienta original de A&R inspirada en conceptos estándar de finance:
//  - Serie histórica de precio mensual (20y)
//  - Línea de Valor Justo: métrica × P/E usuario
//  - Línea Normal P/E: métrica × avg P/E histórico 10y/5y
//  - Proyección futura (años editables)
//  - Panel derecho con 12 métricas clave (growth, yield, credit rating, etc.)
//  - Tabla de números por año debajo (FY, métrica, ∆%, dividendo)
//  - Dropdown con 8 bases de métrica (EPS adj/basic/diluted, OCF/FCFE, EBITDA/EBIT/Sales)
//
// Datos: /api/fg-history (FMP cacheado 24h) + AnalysisContext (fin, comp, cfg).
// Coste marginal: $0 — ninguna llamada a Anthropic. FMP ya incluido en plan.

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { n, fP, fC, div } from '../../utils/formatters';
import { API_URL } from '../../constants/index.js';
import AnalystScorecard from './AnalystScorecard.jsx';
import FGScoresPanel from './FGScoresPanel.jsx';
import SplitsTable from './SplitsTable.jsx';

// Year ranges replicado exactamente de FAST Graphs: MAX + 19 años uno a uno.
// Antes teníamos sólo MAX/20Y/15Y/10Y/5Y/3Y/1Y — ahora granularidad año a año.
const RANGES = [
  { id: 'MAX', years: 99 },
  { id: '19Y', years: 19 },
  { id: '18Y', years: 18 },
  { id: '17Y', years: 17 },
  { id: '16Y', years: 16 },
  { id: '15Y', years: 15 },
  { id: '14Y', years: 14 },
  { id: '13Y', years: 13 },
  { id: '12Y', years: 12 },
  { id: '11Y', years: 11 },
  { id: '10Y', years: 10 },
  { id: '9Y',  years: 9 },
  { id: '8Y',  years: 8 },
  { id: '7Y',  years: 7 },
  { id: '6Y',  years: 6 },
  { id: '5Y',  years: 5 },
  { id: '4Y',  years: 4 },
  { id: '3Y',  years: 3 },
  { id: '2Y',  years: 2 },
  { id: '1Y',  years: 1 },
];

// Forecast modes — determina la curva de proyección.
// cons = FMP analyst estimates · man = slider · normal = normal P/E × EPS manual growth · cagr = EPS CAGR histórico × P/E usuario
// IMPORTANTE: colores como hex literales, no var(--xxx), porque se concatenan con '66' para opacity
// y var() no se puede combinar con sufijo hex.
const FORECAST_MODES = [
  { id: 'consensus', lbl: 'Consenso',    color: '#64d2ff', tip: 'EPS consenso analistas año a año' },
  { id: 'manual',    lbl: 'Manual',      color: '#c8a44e', tip: 'Slider de crecimiento custom' },
  { id: 'cagr5',     lbl: 'CAGR 5y',     color: '#30d158', tip: 'EPS crece al CAGR histórico de 5 años' },
  { id: 'cagr10',    lbl: 'CAGR 10y',    color: '#bf5af2', tip: 'EPS crece al CAGR histórico de 10 años' },
  { id: 'normal',    lbl: 'Normal P/E',  color: '#ff9f0a', tip: 'Proyección colapsa al P/E normal × EPS' },
];

const METRIC_OPTIONS = [
  { group: 'Earnings',  id: 'eps_adj',     label: 'EPS Ajustado (Operating)' },
  { group: 'Earnings',  id: 'eps_basic',   label: 'EPS Básico' },
  { group: 'Earnings',  id: 'eps_diluted', label: 'EPS Diluido' },
  { group: 'Cash Flow', id: 'ocf',         label: 'Operating Cash Flow (OCF, FFO)' },
  { group: 'Cash Flow', id: 'fcfe',        label: 'Free Cash Flow to Equity (FCFE, AFFO)' },
  { group: 'Otras',     id: 'ebitda',      label: 'EBITDA' },
  { group: 'Otras',     id: 'ebit',        label: 'EBIT' },
  { group: 'Otras',     id: 'sales',       label: 'Ventas / Revenue' },
];

const METRIC_LABEL = Object.fromEntries(METRIC_OPTIONS.map(m => [m.id, m.label]));

export default function FastTab() {
  const { DATA_YEARS, cfg, comp, fgGrowth, fgMode, fgPE, fgProjYears, fin, fmpExtra,
    setFgGrowth, setFgMode, setFgPE, setFgProjYears } = useAnalysis();

  const ticker = cfg?.ticker || '';

  // ── REIT auto-switch (2026-05-03) ─────────────────────────────────────
  // FAST Graphs cambia automáticamente el "Price Correlated With" a
  // "Free Cash Flow to Equity (FCFE,AFFO)" para REITs. Verificado contra
  // O (Realty Income): usan FCFE/AFFO con multiplicador 15x igual que para
  // empresas normales. Aquí replicamos: si el sector del ticker es Real
  // Estate o el industry contiene "REIT", auto-conmutamos fgMode a 'fcfe'
  // la primera vez que se carga ese ticker. El usuario puede luego elegir
  // otro modo manualmente y se respeta para esa sesión.
  const isReit = (() => {
    const sector = fmpExtra?.profile?.sector || '';
    const industry = fmpExtra?.profile?.industry || '';
    if (sector === 'Real Estate') return true;
    if (industry.toLowerCase().includes('reit')) return true;
    return false;
  })();
  const reitAutoTickerRef = useRef(null);
  useEffect(() => {
    if (!ticker || !isReit) return;
    // Sólo auto-cambiar una vez por ticker — para no pisar selección manual
    if (reitAutoTickerRef.current === ticker) return;
    reitAutoTickerRef.current = ticker;
    if (fgMode !== 'fcfe' && fgMode !== 'ocf') {
      setFgMode('fcfe');  // FCFE/AFFO = approx AFFO
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, isReit]);
  // ETF / fondo / instrumento sin fundamentales por acción: FMP devuelve
  // ratios/key-metrics/estimates vacíos. Detectar temprano para mostrar
  // empty-states útiles en cada sub-tab.
  const isNonFundamental = (h) => h && (!h.ratios_by_year || Object.keys(h.ratios_by_year).length === 0);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('MAX');
  const [peMode, setPeMode] = useState('custom'); // custom | normal_5y | normal_10y | normal_all
  const [forecastMode, setForecastMode] = useState('consensus'); // consensus | manual | cagr5 | cagr10 | normal
  const [trades, setTrades] = useState([]);
  const [showTrades, setShowTrades] = useState(true);
  const [showCones, setShowCones] = useState(true);  // margin-of-error cones ±margin_1y/2y
  // Filas visibles en la tabla anual (toggleable via chips). Persistido por
  // ticker en localStorage para que el perfil que arma el usuario se mantenga.
  const DEFAULT_TABLE_ROWS = {
    val: true, chg: true, div: true, chgDiv: false,
    sales: false, ebitda: false, fcfps: false, shares: false,
    pe: false, evEbitda: false, fvRatio: false, nprRatio: false, fcfYield: false,
    divYield: true, payout: true,
  };
  // ALL useState/useRef declarations BEFORE useEffects (TDZ safety pattern —
  // see CLAUDE.md "TDZ Bug Pattern (CRITICAL)". Vite minifier hoists const
  // declarations but not their initialization, so refs from earlier effects
  // to later states crash in production builds).
  const [visibleRows, setVisibleRows] = useState(DEFAULT_TABLE_ROWS);
  const [showRecessions, setShowRecessions] = useState(true);  // bandas de recesiones
  const [smoothEps, setSmoothEps] = useState(true);  // rolling median 3y para EPS (suaviza write-downs, FX, impairments)
  const [innerTab, setInnerTab] = useState('summary');  // summary | trends | forecasting | historical | scorecard
  // Series visibility — controlado por los checkboxes de la leyenda.
  // Keys: price, normalPE, fairValue, fairArea, dpsArea, yield, payout, consensus,
  //       priceTarget, currentVal, trades, recessions, compare, evEbitda
  const [visibleSeries, setVisibleSeries] = useState({
    price: true, normalPE: true, fairValue: true, fairArea: true, dpsArea: true,
    yield: true, payout: true, consensus: true, priceTarget: true, currentVal: true,
    trades: true, recessions: true, compare: true, evEbitda: false,
  });
  const [personalPERev, setPersonalPERev] = useState(0);  // bump para forzar re-render tras save/clear localStorage
  const chartSvgRef = useRef(null);  // ref al SVG principal para export PNG
  const [compareTicker, setCompareTicker] = useState('');  // 2º ticker para overlay ghost
  const [compareData, setCompareData] = useState(null);  // {monthly_prices, ticker}
  const [backtestYears, setBacktestYears] = useState(10);  // 5 | 10 | 15 | 20
  const [hover, setHover] = useState(null);  // {x, y, date, price, eps, pe, fair, yield, payout} o null
  const hoverRafRef = useRef(null);  // rAF id para throttle del onMouseMove → evita sobrecarga
  const toggleRow = (k) => setVisibleRows(v => ({ ...v, [k]: !v[k] }));
  const toggleSeries = (k) => setVisibleSeries(v => ({ ...v, [k]: !v[k] }));

  useEffect(() => {
    if (!ticker) return;
    try {
      const stored = localStorage.getItem(`fast-table-rows-${ticker}`);
      if (stored) setVisibleRows({ ...DEFAULT_TABLE_ROWS, ...JSON.parse(stored) });
      else setVisibleRows(DEFAULT_TABLE_ROWS);
    } catch { setVisibleRows(DEFAULT_TABLE_ROWS); }
  }, [ticker]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ticker) return;
    try { localStorage.setItem(`fast-table-rows-${ticker}`, JSON.stringify(visibleRows)); } catch {}
  }, [visibleRows, ticker]);

  // Fetch historical price + ratios on ticker change
  useEffect(() => {
    if (!ticker) { setHistory(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`${API_URL}/api/fg-history?ticker=${encodeURIComponent(ticker)}&years=20`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { if (d.error) setError(d.error); else setHistory(d); setLoading(false); }})
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); }});
    return () => { cancelled = true; };
  }, [ticker]);

  // Fetch 2º ticker para compare mode (solo monthly_prices se usa).
  useEffect(() => {
    if (!compareTicker || compareTicker === ticker) { setCompareData(null); return; }
    let cancelled = false;
    fetch(`${API_URL}/api/fg-history?ticker=${encodeURIComponent(compareTicker)}&years=20`)
      .then(r => r.json())
      .then(d => { if (!cancelled && !d.error) setCompareData({ monthly_prices: d.monthly_prices || [], ticker: compareTicker }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [compareTicker, ticker]);

  // Export del chart a PNG — serializa el SVG, lo pinta en canvas con fondo
  // crema (match FAST Graphs), descarga el resultado. Útil para compartir
  // capturas en presentaciones o notas.
  const exportChartPNG = () => {
    const svg = chartSvgRef.current;
    if (!svg) return;
    const w = svg.viewBox.baseVal.width || 1200;
    const h = svg.viewBox.baseVal.height || 500;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;  // retina-quality
      const canvas = document.createElement('canvas');
      canvas.width = w * scale; canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#faf9f5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `fast-${ticker || 'chart'}-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Target P/E personal persistido — si hay un valor guardado en localStorage
  // para este ticker, se pre-carga al montar / cambiar ticker. Permite que el
  // usuario fije un P/E custom por empresa (ej: KO 22x porque es quality,
  // PEP 20x, etc.) sin tener que recordarlo.
  const storageKey = ticker ? `fast-pe-${ticker}` : null;
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const pe = parseFloat(saved);
        if (Number.isFinite(pe) && pe > 0 && pe < 200) setFgPE(pe);
      }
    } catch {}
    // setFgPE is from context, stable across renders — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const savedPE = (() => {
    if (!storageKey) return null;
    // personalPERev en deps: cada bump re-evalúa localStorage
    void personalPERev;
    try { const v = localStorage.getItem(storageKey); return v ? parseFloat(v) : null; }
    catch { return null; }
  })();
  const hasPersonalPE = savedPE != null && Number.isFinite(savedPE);

  // Fetch user trades for this ticker (buys/sells from cost_basis table)
  useEffect(() => {
    if (!ticker) { setTrades([]); return; }
    let cancelled = false;
    fetch(`${API_URL}/api/costbasis?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !Array.isArray(d)) return;
        // Keep only BUY / SELL (filter dividends + option legs + corp actions)
        const relevant = d.filter(t => {
          const tipo = (t.tipo || '').toUpperCase();
          if (tipo !== 'BUY' && tipo !== 'SELL') return false;
          if (t.option_type) return false; // option trades
          return Number.isFinite(+t.precio) && Number.isFinite(+t.shares);
        });
        setTrades(relevant);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ticker]);

  // Active P/E for valor justo
  const activePE = useMemo(() => {
    if (peMode === 'normal_5y' && history?.avg_pe_5y) return history.avg_pe_5y;
    if (peMode === 'normal_10y' && history?.avg_pe_10y) return history.avg_pe_10y;
    if (peMode === 'normal_all' && history?.avg_pe_all) return history.avg_pe_all;
    return fgPE;
  }, [peMode, history, fgPE]);

  // P/E usado como TECHO del área verde (estilo FAST Graphs):
  // Normal P/E histórico del propio ticker → el precio cae dentro del área
  // cuando cotiza en su múltiplo normal (más realista que Graham 15x para
  // compounders de calidad: DEO, KO, V… nunca tocan 15x pero SÍ tocan su
  // Normal P/E en pullbacks). Fallback a activePE si no hay historia suficiente.
  // La línea naranja "Fair Nx" sigue usando activePE (ref. Graham / custom).
  const zonePE = useMemo(() => (
    history?.avg_pe_10y || history?.avg_pe_5y || history?.avg_pe_all || activePE
  ), [history, activePE]);

  // Helper: per-share metric for given year (using fin[y] for the 10y local window)
  const getMetric = (y) => {
    const f = fin[y]; if (!f) return null;
    const so = f.sharesOut;
    if (fgMode === 'eps_adj') return f.eps;
    if (fgMode === 'eps_basic') return f.epsBasic ?? f.eps;
    if (fgMode === 'eps_diluted') return f.epsDiluted ?? f.eps;
    if (fgMode === 'fcf' || fgMode === 'fcfe') return comp[y]?.fcfps;
    if (fgMode === 'ocf') return div(f.ocf, so);
    if (fgMode === 'ebitda') return div((f.operatingIncome || 0) + (f.depreciation || 0), so);
    if (fgMode === 'ebit') return div(f.operatingIncome, so);
    if (fgMode === 'sales') return div(f.revenue, so);
    if (fgMode === 'eps') return f.eps;
    return f.eps;
  };

  // Extended metric lookup — tries fin[y] first (rich data), falls back to
  // history.ratios_by_year[y].eps for the ~20y long-term window that
  // /api/fg-history returns. Replica el eje temporal completo de FAST Graphs
  // (normalmente 15-20 años) en vez del corte a 10 de DATA_YEARS.
  const ratiosBy = history?.ratios_by_year || {};
  const isEpsModeForExt = fgMode === 'eps_adj' || fgMode === 'eps_basic' || fgMode === 'eps_diluted' || fgMode === 'eps';
  const getMetricExt = (y) => {
    const local = getMetric(y);
    if (local != null && local > 0) return local;
    if (!isEpsModeForExt) return null;  // solo EPS tiene fallback cross-source
    const r = ratiosBy[y];
    if (!r || !Number.isFinite(r.eps) || r.eps <= 0) return null;
    return r.eps;
  };
  const getDpsExt = (y) => {
    const local = fin[y]?.dps;
    if (Number.isFinite(local) && local > 0) return local;
    const r = ratiosBy[y];
    if (r && Number.isFinite(r.dps) && r.dps > 0) return r.dps;
    return 0;
  };

  // Union de años con datos: fin ∪ ratios_by_year (ordenados ascendente).
  // Filtro a partir del primer precio disponible (no mostrar pre-IPO).
  const extYearsSet = new Set([
    ...DATA_YEARS,
    ...Object.keys(ratiosBy).map(Number).filter(Number.isFinite),
  ]);
  const histYrs = [...extYearsSet].sort((a, b) => a - b);
  const validHistRaw = histYrs.map(y => ({
    y, val: getMetricExt(y), div: getDpsExt(y),
  })).filter(d => n(d.val) != null && d.val > 0);

  // Determinar el año inicial del chart a partir de los precios disponibles.
  // Si hay años EPS anteriores al primer precio (ej. KHC pre-IPO 2010-2014),
  // los filtramos para no pintar polylines off-chart a la izquierda.
  // (HMR-trigger)
  const monthlyPricesEarly = history?.monthly_prices || [];
  const firstPriceYear = monthlyPricesEarly.length
    ? parseInt(monthlyPricesEarly[0].date.slice(0, 4), 10)
    : 0;
  const validHist = firstPriceYear
    ? validHistRaw.filter(d => d.y >= firstPriceYear)
    : validHistRaw;

  // ─── EPS suavizado 3y median ────────────────────────────────────────────
  // FMP devuelve EPS GAAP (netIncomePerShare) que incluye write-downs,
  // impairments y volatilidad FX — produce picos gigantes en años con
  // cargos no-cash (ej. DEO 2022-2024: impairment Latam + swings sterling).
  // Aplicamos rolling median de 3 años para la línea Fair Value, replicando
  // lo que FAST Graphs hace con empresas de earnings volátiles. La tabla
  // sigue mostrando EPS raw por año.
  const median3 = (arr) => {
    if (!arr.length) return null;
    const sorted = arr.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const smoothedEpsByYear = new Map();
  for (let i = 0; i < validHist.length; i++) {
    const window = [];
    for (let k = 0; k < 3; k++) {
      const j = i - k;
      if (j >= 0 && validHist[j].val > 0) window.push(validHist[j].val);
    }
    smoothedEpsByYear.set(validHist[i].y, median3(window) ?? validHist[i].val);
  }
  const getSmoothEps = (y) => smoothEps ? (smoothedEpsByYear.get(y) ?? getMetricExt(y)) : getMetricExt(y);

  // Projection years (future)
  const lastHistY = validHist.length ? validHist[validHist.length - 1].y : new Date().getFullYear();
  const lastVal = validHist.length ? validHist[validHist.length - 1].val : 0;

  // Consensus estimates — only usable when fgMode === 'eps_*' (analysts project EPS, not OCF/EBITDA)
  const estimatesByYear = history?.estimates_by_year || {};
  const estimateYears = Object.keys(estimatesByYear).map(Number).filter(y => y > lastHistY).sort();
  const isEpsMode = fgMode === 'eps_adj' || fgMode === 'eps_basic' || fgMode === 'eps_diluted';
  const consensusAvailable = isEpsMode && estimateYears.length > 0;
  const cagr5 = history?.historic_cagr_5y;
  const cagr10 = history?.historic_cagr_10y;

  // Implied growth from consensus (for display)
  const consensusImpliedGrowth = (() => {
    if (!consensusAvailable || !lastVal || lastVal <= 0) return null;
    const futureYr = lastHistY + Math.min(fgProjYears, estimateYears.length);
    const futureEst = estimatesByYear[futureYr]?.epsAvg;
    if (!futureEst || futureEst <= 0) return null;
    const years = futureYr - lastHistY;
    return Math.pow(futureEst / lastVal, 1 / years) - 1;
  })();

  // Pick growth rate according to forecast mode
  const modeGrowth = (() => {
    if (forecastMode === 'cagr5' && cagr5 != null) return cagr5;
    if (forecastMode === 'cagr10' && cagr10 != null) return cagr10;
    if (forecastMode === 'consensus' && consensusImpliedGrowth != null) return consensusImpliedGrowth;
    return fgGrowth / 100;
  })();

  const projData = Array.from({length: fgProjYears}, (_, i) => {
    const yr = lastHistY + i + 1;
    // Consensus mode — use FMP per-year EPS estimates when available
    if (forecastMode === 'consensus' && consensusAvailable && estimatesByYear[yr]?.epsAvg != null) {
      return { y: yr, val: estimatesByYear[yr].epsAvg, source: 'consensus' };
    }
    // Normal P/E mode — same growth as manual but the "fair" line uses avg_pe
    // instead of fgPE (handled later in the chart, not here).
    // For metric projection, use consensus growth if available, else fgGrowth.
    if (forecastMode === 'cagr5' && cagr5 != null) {
      return { y: yr, val: lastVal * Math.pow(1 + cagr5, i + 1), source: 'cagr5' };
    }
    if (forecastMode === 'cagr10' && cagr10 != null) {
      return { y: yr, val: lastVal * Math.pow(1 + cagr10, i + 1), source: 'cagr10' };
    }
    // manual / normal — slider value
    return {
      y: yr,
      val: lastVal > 0 ? lastVal * Math.pow(1 + fgGrowth / 100, i + 1) : null,
      source: 'manual',
    };
  });

  // Monthly prices filtered by range
  const monthlyPrices = history?.monthly_prices || [];
  const nowY = new Date().getFullYear();
  const selRange = RANGES.find(r => r.id === range) || RANGES[0];
  const cutoffY = nowY - selRange.years;
  const pricesInRange = monthlyPrices.filter(p => {
    const y = parseInt(p.date.slice(0, 4), 10);
    return y >= cutoffY;
  });

  // Chart bounds — X axis
  const minXYear = pricesInRange.length
    ? parseFloat(pricesInRange[0].date.slice(0, 4)) + parseFloat(pricesInRange[0].date.slice(5, 7)) / 12
    : lastHistY - selRange.years;
  const maxXYear = lastHistY + fgProjYears + 0.5;

  // Y-axis: compute from price range + fair value lines.
  // Usamos percentiles 95/5 (en vez de max/min) para que años outlier (ej.
  // KHC 2017: tax-benefit → EPS×PE = $134 vs mediana $30) no destrocen la
  // escala. Los outliers quedan clipados visualmente al top, el resto del
  // chart queda legible. Precios proyectados (target) incluidos para que
  // el eje acomode el PT sin recortar.
  // Eje Y: incluir el mayor de (activePE, zonePE) para que ninguna línea
  // quede fuera del scale cuando zonePE > activePE (caso típico).
  const scalePE = Math.max(activePE || 0, zonePE || 0);
  const fairValues = [...validHist.map(d => d.val * scalePE), ...projData.map(d => d.val && d.val > 0 ? d.val * scalePE : null)].filter(v => v != null && v > 0);
  const prices = pricesInRange.map(p => p.close);
  const allY = [...fairValues, ...prices, cfg?.price, history?.price_target?.consensus].filter(v => Number.isFinite(v) && v > 0);
  const sortedY = allY.slice().sort((a, b) => a - b);
  const percentile = (p) => sortedY.length ? sortedY[Math.min(sortedY.length - 1, Math.floor(sortedY.length * p))] : 0;
  const p95 = percentile(0.95);
  const p05 = percentile(0.05);
  const rawMax = sortedY.length ? p95 * 1.15 : 100;
  const rawMin = sortedY.length ? Math.max(0, p05 * 0.80) : 0;

  // Chart dims — proporcionado para ocupar ~1000px reales tras sidebar de
  // métricas (260px). W=1200/H=500 → ratio 2.4 similar a FAST Graphs original
  // sin apelmazar labels al comprimirse. PADR=60 acomoda eje derecho.
  const W = 1200, H = 500;
  const PADL = 70, PADR = 60, PADT = 28, PADB = 50;
  const chartW = W - PADL - PADR;
  const chartH = H - PADT - PADB;

  const xScale = (year) => PADL + ((year - minXYear) / (maxXYear - minXYear || 1)) * chartW;
  const yScale = (v) => PADT + chartH - ((v - rawMin) / (rawMax - rawMin || 1)) * chartH;

  // Y grid
  const gridCount = 6;
  const gridLines = Array.from({length: gridCount + 1}, (_, i) => {
    const val = rawMin + (rawMax - rawMin) * (i / gridCount);
    return { val, y: yScale(val) };
  });

  // Historical price polyline
  const pricePts = pricesInRange.map(p => {
    const y = parseFloat(p.date.slice(0, 4)) + parseFloat(p.date.slice(5, 7)) / 12;
    return { x: xScale(y), yp: yScale(p.close) };
  });
  const pricePoly = pricePts.map(p => `${p.x},${p.yp}`).join(' ');

  // Fair value historical line (EPS suavizado × activePE).
  // Clip a [rawMin, rawMax] para que años outlier (spike × PE) no salgan
  // del chart y rompan visualmente la curva.
  const clipY = (v) => Math.max(rawMin, Math.min(v, rawMax));
  const fairHistPts = validHist.map(d => ({
    x: xScale(d.y),
    yp: yScale(clipY(getSmoothEps(d.y) * activePE)),
  }));
  const _fairHistPoly = fairHistPts.map(p => `${p.x},${p.yp}`).join(' ');

  // Fair value projection — use activePE EXCEPT in "normal" mode which collapses to avg P/E.
  // 2026-05-03: el anchor de la proyección ahora usa getSmoothEps(lastHistY) en
  // lugar de lastVal raw para conectarse perfectamente con el final de la línea
  // histórica cuando smoothEps está activo. Antes había salto vertical visible.
  const projMultiplier = forecastMode === 'normal' && (history?.avg_pe_10y || history?.avg_pe_5y || history?.avg_pe_all)
    ? (history.avg_pe_10y || history.avg_pe_5y || history.avg_pe_all)
    : activePE;
  const projFairPts = projData.filter(d => d.val != null).map(d => ({
    x: xScale(d.y),
    yp: yScale(d.val * projMultiplier),
    val: d.val * projMultiplier,
  }));
  // Connect from last hist point — usa getSmoothEps si smooth está ON, mismo
  // valor que el último punto de fairHistPts → unión sin gap.
  const anchorVal = validHist.length ? getSmoothEps(lastHistY) : 0;
  const projFairFull = validHist.length ? [{ x: xScale(lastHistY), yp: yScale(anchorVal * projMultiplier), val: anchorVal * projMultiplier }, ...projFairPts] : projFairPts;
  const _projFairPoly = projFairFull.map(p => `${p.x},${p.yp}`).join(' ');

  // Combined fair value line (histórico + proyección) — UNA SOLA polyline
  // sólida estilo FAST Graphs. Antes pintábamos dos polylines (sólida +
  // rayada) y se notaba la transición. Ahora es continua porque el anchor
  // de la proyección está alineado con el final del histórico.
  const fairFullPts = [...fairHistPts, ...projFairPts];
  const fairFullPoly = fairFullPts.map(p => `${p.x},${p.yp}`).join(' ');

  // Margin-of-error cones — uses real historical error de /api/fg-history.earnings_scorecard.
  // 1y cone applies to year+1 (small), 2y cone applies to year+2+ (larger).
  const margin1yPct = history?.earnings_scorecard?.margin_1y_pct ?? 10;
  const margin2yPct = history?.earnings_scorecard?.margin_2y_pct ?? 20;
  const coneUpperPts = projFairFull.map((p, i) => {
    // first point is anchor (last hist year) — no cone
    if (i === 0) return p;
    const pct = i === 1 ? margin1yPct / 100 : margin2yPct / 100;
    return { x: p.x, yp: yScale(p.val * (1 + pct)) };
  });
  const coneLowerPts = projFairFull.map((p, i) => {
    if (i === 0) return p;
    const pct = i === 1 ? margin1yPct / 100 : margin2yPct / 100;
    return { x: p.x, yp: yScale(p.val * (1 - pct)) };
  });
  // Polygon for shaded cone: upper points → reversed lower points
  const conePoly = [...coneUpperPts, ...coneLowerPts.slice().reverse()]
    .map(p => `${p.x},${p.yp}`).join(' ');

  // Shaded fair value area (from base to fair line)
  const fairAreaPts = [
    ...fairHistPts,
    { x: xScale(validHist[validHist.length - 1]?.y || minXYear), yp: yScale(rawMin) },
    { x: xScale(validHist[0]?.y || minXYear), yp: yScale(rawMin) },
  ];
  const _fairAreaPoly = fairAreaPts.map(p => `${p.x},${p.yp}`).join(' ');

  // ─── Valor justo (verde) + Sobrevaloración (rojo) — estilo FAST Graphs ──
  // Dos áreas continuas que emulan el patrón visual de FAST Graphs:
  //   1. VERDE: desde baseline hasta la curva de valor justo (EPS×P/E). Es
  //      el "valor justificado por fundamentales". Si la línea de precio
  //      cae DENTRO de esta zona, la empresa está barata o a valor justo.
  //   2. ROJO: banda entre la curva de valor justo y la línea de precio
  //      SÓLO donde price > fair. Es la "prima de sobrevaloración" —
  //      cuanto más gruesa, más cara está.
  //
  // Para construir polígonos continuos, muestreamos mensualmente y computamos
  // fair_at_month = eps(año_del_mes) × P/E_activo (constante dentro del año).
  // Además muestreamos también dps_at_month × P/E para la capa verde oscura
  // (estilo FAST Graphs: "dividend-backed value" dentro de la zona verde).
  // Interpolación lineal mes-a-mes entre años fiscales. Esto elimina el
  // efecto "escalera" del área verde (cada año era un bloque plano) y
  // produce una curva suave estilo FAST Graphs.
  const interpEps = (yrFrac) => {
    const yr = Math.floor(yrFrac);
    const frac = yrFrac - yr;
    // Usa EPS suavizado 3y para curvas de fair-value / Normal P/E.
    // Los outliers raw (impairments, write-downs) distorsionarían la
    // línea de valor justo si se usan directamente.
    const e1 = getSmoothEps(yr);
    const e2 = getSmoothEps(yr + 1);
    if (!Number.isFinite(e1) || e1 <= 0) return null;
    if (!Number.isFinite(e2) || e2 <= 0) return e1;
    return e1 + (e2 - e1) * frac;
  };
  const interpDps = (yrFrac) => {
    const yr = Math.floor(yrFrac);
    const frac = yrFrac - yr;
    const d1 = getDpsExt(yr);
    const d2 = getDpsExt(yr + 1);
    if (!Number.isFinite(d1) || d1 <= 0) return 0;
    if (!Number.isFinite(d2) || d2 <= 0) return d1;
    return d1 + (d2 - d1) * frac;
  };

  const monthSamples = [];
  for (const p of pricesInRange) {
    const yr = parseInt(p.date.slice(0, 4), 10);
    const yrFrac = yr + parseFloat(p.date.slice(5, 7)) / 12;
    const m = interpEps(yrFrac);
    if (!Number.isFinite(m) || m <= 0) continue;
    // Área verde usa zonePE (Normal P/E histórico) estilo FAST Graphs,
    // NO activePE. Así el precio cae dentro del área cuando cotiza en su
    // múltiplo normal, en vez de requerir que baje a Graham 15x.
    const fairVal = m * zonePE;
    const dps = interpDps(yrFrac);
    const divFairVal = dps * zonePE;
    monthSamples.push({
      x: xScale(yrFrac),
      yPrice: yScale(p.close),
      yFair: yScale(clipY(fairVal)),
      yDivFair: yScale(clipY(divFairVal)),
      priceVal: p.close,
      fairValue: fairVal,
      divFairValue: divFairVal,
      year: yr,
      date: p.date,
    });
  }

  // Extensión futura: muestras "proyectadas" mensuales para los años
  // proyectados, así el área verde no se corta de golpe en el último año
  // histórico sino que continúa hasta el final del gráfico (estilo FAST Graphs).
  // Para el DPS futuro: mantenemos el payout ratio actual (o último disponible).
  const latestPayoutRatio = (() => {
    for (let i = validHist.length - 1; i >= 0; i--) {
      const h = validHist[i];
      if (h.val > 0 && h.div > 0) return Math.min(h.div / h.val, 1.5);
    }
    return 0;
  })();
  const projSamples = [];
  // Interpolación entre años proyectados (mismo patrón que histórico).
  const projEpsByYear = {};
  for (const d of projData) if (Number.isFinite(d.val) && d.val > 0) projEpsByYear[d.y] = d.val;
  // El "primer" año de proyección puede interpolar desde el último histórico.
  if (lastVal > 0) projEpsByYear[lastHistY] = lastVal;
  const projInterpEps = (yrFrac) => {
    const yr = Math.floor(yrFrac);
    const frac = yrFrac - yr;
    const e1 = projEpsByYear[yr];
    const e2 = projEpsByYear[yr + 1];
    if (!Number.isFinite(e1) || e1 <= 0) return null;
    if (!Number.isFinite(e2) || e2 <= 0) return e1;
    return e1 + (e2 - e1) * frac;
  };
  for (const d of projData) {
    if (!Number.isFinite(d.val) || d.val <= 0) continue;
    for (let m = 0; m < 12; m++) {
      const yrFrac = d.y + m / 12;
      if (yrFrac > maxXYear) break;
      const epsInterp = projInterpEps(yrFrac);
      if (!Number.isFinite(epsInterp) || epsInterp <= 0) continue;
      // Proyección de área verde usa zonePE (Normal P/E) — consistencia con
      // histórico. projMultiplier se usa para la LÍNEA naranja proyectada abajo.
      const fairVal = epsInterp * zonePE;
      const dps = epsInterp * latestPayoutRatio;
      const divFairVal = dps * zonePE;
      projSamples.push({
        x: xScale(yrFrac),
        yFair: yScale(clipY(fairVal)),
        yDivFair: yScale(clipY(divFairVal)),
      });
    }
  }
  // Concatenamos hist + proyección SOLO para la construcción de polígonos verdes
  // (NO para redDots ni para la línea de precio — esas se quedan en monthSamples).
  const greenSamples = [...monthSamples, ...projSamples];

  // ── Áreas verdes estilo FAST Graphs original ──
  // Dos capas apiladas:
  //   1. Verde CLARO = "Valor justificado por earnings" (EPS × P/E activo).
  //      Si el precio cae aquí → stock a valor justo o barato.
  //   2. Verde OSCURO (dentro de la clara) = "Valor justificado SOLO por
  //      dividendos" (DPS × P/E). Si el precio cae aquí → el dividendo
  //      actual ya justifica toda la cotización → súper ganga.
  const baseline = yScale(rawMin);
  const greenAreaPoly = greenSamples.length > 1
    ? [
        `${greenSamples[0].x},${baseline}`,
        ...greenSamples.map(s => `${s.x},${s.yFair}`),
        `${greenSamples[greenSamples.length - 1].x},${baseline}`,
      ].join(' ')
    : '';
  // Área verde OSCURA: DPS × P/E activo. Solo pintar si hay dividendo > 0.
  const hasDpsArea = greenSamples.some(s => s.yDivFair < baseline - 1);
  const darkGreenPoly = hasDpsArea && greenSamples.length > 1
    ? [
        `${greenSamples[0].x},${baseline}`,
        ...greenSamples.map(s => `${s.x},${s.yDivFair}`),
        `${greenSamples[greenSamples.length - 1].x},${baseline}`,
      ].join(' ')
    : '';

  // Contador para leyenda — meses donde el precio quedó DENTRO del área verde
  // (cotizando barato o a valor justo). Estilo FAST Graphs "cheap months".
  const cheapMonths = monthSamples.filter(s => s.priceVal <= s.fairValue).length;

  // Current Valuation dots — un dot negro por AÑO sobre la curva de precio,
  // al cierre del año. Replica el patrón FAST Graphs series-9 "Current
  // Valuation" que marca P/E real de cada año fiscal. Se ve la evolución
  // anual de la cotización en relación al fair value.
  const yearEndDots = (() => {
    const byYear = new Map();
    for (const s of monthSamples) {
      // Mantener el último sample de cada año (iteración por fecha ascendente)
      byYear.set(s.year, s);
    }
    return [...byYear.values()].map(s => {
      // P/E blended del año: priceVal / EPS del año
      const eps = interpEps(s.year + 0.9999);
      const peAtYear = eps && eps > 0 ? s.priceVal / eps : null;
      return { x: s.x, y: s.yPrice, year: s.year, price: s.priceVal, pe: peAtYear };
    });
  })();

  // Normal P/E bands (3 líneas naranjas paralelas tipo FAST Graphs):
  // upper = max P/E histórico, mid = avg P/E, lower = min P/E. Cada banda × EPS.
  const peSeries = history?.pe_series || [];
  const peValues = peSeries.map(p => p.pe).filter(v => Number.isFinite(v) && v > 0);
  peValues.sort((a, b) => a - b);
  const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null;
  const peLow = pct(peValues, 0.15);   // percentil 15 ≈ "barato"
  const peMid = history?.avg_pe_10y || pct(peValues, 0.5);
  const peHigh = pct(peValues, 0.85);  // percentil 85 ≈ "caro"
  // 2026-05-03 fix: la línea Normal P/E (azul) ahora se extiende también a
  // los años de proyección usando los EPS estimados (consensus o CAGR), igual
  // que hace FAST Graphs. Antes terminaba en el último año histórico (2025)
  // y dejaba un hueco a la derecha donde la línea naranja sí continuaba.
  const peBandLine = (peMult) => {
    if (peMult == null) return '';
    const histPts = validHist.map(d => ({
      x: xScale(d.y),
      yp: yScale(clipY(getSmoothEps(d.y) * peMult)),
    }));
    const projPts = projData.filter(d => d.val != null).map(d => ({
      x: xScale(d.y),
      yp: yScale(clipY(d.val * peMult)),
    }));
    return [...histPts, ...projPts].map(p => `${p.x},${p.yp}`).join(' ');
  };
  const _bandLow = peBandLine(peLow);
  const bandMid = peBandLine(peMid);
  const _bandHigh = peBandLine(peHigh);
  // ───────────────────────────────────────────────────────────────────────

  // Normal P/E reference line (if different from active)
  const normalPE = history?.avg_pe_10y || history?.avg_pe_5y || null;
  const showNormalRef = peMode !== 'normal_10y' && normalPE && normalPE !== activePE;
  const normalRefPts = showNormalRef ? validHist.map(d => ({
    x: xScale(d.y),
    yp: yScale(Math.max(d.val * normalPE, rawMin)),
  })) : [];
  const _normalRefPoly = normalRefPts.map(p => `${p.x},${p.yp}`).join(' ');

  // Year ticks
  const yearTicks = [];
  const rangeYears = Math.floor(maxXYear - minXYear);
  const step = rangeYears > 15 ? 2 : rangeYears > 8 ? 1 : 1;
  for (let yr = Math.ceil(minXYear); yr <= Math.floor(maxXYear); yr += step) yearTicks.push(yr);

  // Current price dot
  const currentY = cfg?.price != null && rawMax > 0 ? yScale(cfg.price) : null;

  // Consensus price target line + dot
  const priceTarget = history?.price_target?.consensus || null;
  const priceTargetY = priceTarget && rawMax > 0 && priceTarget <= rawMax * 1.3 ? yScale(priceTarget) : null;

  // Transaction markers — buys (green ▲) / sells (red ▼)
  const tradeDots = showTrades ? trades.map(t => {
    const d = t.fecha || '';
    if (!d || d.length < 10) return null;
    const yr = parseFloat(d.slice(0, 4)) + parseFloat(d.slice(5, 7)) / 12 + parseFloat(d.slice(8, 10)) / 365;
    if (yr < minXYear || yr > maxXYear) return null;
    const price = +t.precio;
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      x: xScale(yr),
      yp: yScale(price),
      price,
      shares: +t.shares || 0,
      tipo: (t.tipo || '').toUpperCase(),
      date: d.slice(0, 10),
    };
  }).filter(Boolean) : [];

  // Dividend overlay data — histórico + estimación forward.
  // 2026-05-03: usuario reportó "la raya del dividendo no marca el dividendo
  // que se espera ahora como hace la otra aplicación". FAST Graphs muestra
  // 6/25 Div=$5.88 + 6/26E=$6.64 + 6/27E=$7.11 + 6/28E=$7.69 (E=estimado).
  // Antes nuestro divHist sólo cogía años históricos. Ahora extendemos con
  // proyección usando la mejor aproximación disponible:
  //   1. DGR consenso si hay (history.dividendGrowthConsensus)
  //   2. CAGR 5y de dividendos histórico
  //   3. Crecimiento EPS aplicado proporcionalmente (asume payout estable)
  //   4. Fallback 5%
  const divHistRaw = histYrs.map(y => ({ y, dps: getDpsExt(y), eps: getMetricExt(y), proj: false }))
    .filter(d => d.dps > 0 && d.y >= (firstPriceYear || 0));

  // Calcular CAGR 5y de DPS desde el divHistRaw
  const divCagr5 = (() => {
    if (divHistRaw.length < 5) return null;
    const last = divHistRaw[divHistRaw.length - 1];
    const first5y = divHistRaw[Math.max(0, divHistRaw.length - 6)];
    if (!last?.dps || !first5y?.dps || first5y.dps <= 0) return null;
    const years = last.y - first5y.y;
    if (years <= 0) return null;
    return Math.pow(last.dps / first5y.dps, 1 / years) - 1;
  })();

  // Growth rate para extender DPS forward — prioriza CAGR5 dividendos > EPS
  // growth (consensus si está activo) > fallback 5%
  const dpsGrowthForProj = (() => {
    if (divCagr5 != null && divCagr5 > 0) return divCagr5;
    if (forecastMode === 'consensus' && consensusImpliedGrowth != null && consensusImpliedGrowth > 0) {
      // si EPS crece X%, asumir DPS crece igual (payout estable)
      return Math.min(consensusImpliedGrowth, 0.20);
    }
    if (modeGrowth > 0) return Math.min(modeGrowth, 0.20);
    return 0.05;
  })();

  // Extender DPS para fgProjYears años con dpsGrowthForProj
  const lastDps = divHistRaw.length ? divHistRaw[divHistRaw.length - 1].dps : 0;
  const lastDivYear = divHistRaw.length ? divHistRaw[divHistRaw.length - 1].y : lastHistY;
  const divProj = lastDps > 0 ? Array.from({ length: fgProjYears }, (_, i) => ({
    y: lastDivYear + i + 1,
    dps: lastDps * Math.pow(1 + dpsGrowthForProj, i + 1),
    eps: 0,
    proj: true,
  })) : [];

  const divHist = [...divHistRaw, ...divProj];

  // Dots amarillos "Dividend POR" — históricos sólidos + proyección con opacity 0.6
  const divPorDots = divHist.map(d => ({
    x: xScale(d.y),
    y: yScale(clipY(d.dps * activePE)),
    r: 3.2,
    dps: d.dps,
    year: d.y,
    proj: d.proj,
  }));

  // Split flags — banderita vertical en el año de cada stock split.
  // Estilo FAST Graphs series-10 (highcharts-flags-series).
  const splitFlags = (history?.splits || []).map(s => {
    const d = s.date || '';
    if (!d || d.length < 10) return null;
    const yr = parseFloat(d.slice(0, 4)) + parseFloat(d.slice(5, 7)) / 12;
    if (yr < minXYear || yr > lastHistY + 0.5) return null;
    return {
      x: xScale(yr),
      yTop: PADT + 10,
      yBottom: PADT + chartH - 10,
      ratio: s.ratio || `${s.numerator}:${s.denominator}`,
      date: d.slice(0, 10),
    };
  }).filter(Boolean);
  // ── Eje derecho: Dividend Yield + Payout Ratio (estilo FAST Graphs) ──
  // Eje lineal fijo 0–10% para yield (rojo) y 0–100% para payout (amarillo).
  // Ambas líneas convivían antes sólo si showDiv, ahora SIEMPRE visibles
  // porque son parte del "core" de FAST Graphs original.
  const priceByYear = {};
  for (const p of monthlyPrices) {
    const yr = parseInt(p.date.slice(0, 4), 10);
    if (!priceByYear[yr]) priceByYear[yr] = p.close;
  }
  // Yield: dps / price · eje derecho auto-escalado.
  // 2026-05-03 v2: el ÚLTIMO punto histórico ahora usa cfg.price (precio
  // actual) en lugar del precio fin-de-año, para que el final de la línea
  // roja coincida exactamente con el "Div Yield" del sidebar (que también
  // es DPS/precio actual). Antes el sidebar decía 3.17% pero la línea
  // terminaba en 3.0% porque el precio de fin-de-año era distinto al actual.
  // Los puntos proyectados también usan cfg.price (asume precio constante).
  const _lastHistDivYear = divHistRaw.length ? divHistRaw[divHistRaw.length - 1].y : -Infinity;
  const yieldPoints = divHist.filter(d => d.dps > 0 && (priceByYear[d.y] > 0 || d.proj || d.y === _lastHistDivYear)).map(d => {
    let priceForYield;
    if (d.proj) {
      priceForYield = cfg?.price > 0 ? cfg.price : null;
    } else if (d.y === _lastHistDivYear && cfg?.price > 0) {
      // último año histórico → usa precio actual para que coincida con sidebar
      priceForYield = cfg.price;
    } else {
      priceForYield = priceByYear[d.y];
    }
    return {
      y: d.y,
      yld: priceForYield > 0 ? d.dps / priceForYield : 0,
      proj: d.proj,
    };
  });
  // Payout: dps/eps · eje derecho 0–100%
  const payoutPoints = divHist.filter(d => d.eps > 0 && d.dps > 0).map(d => ({
    y: d.y,
    pct: Math.min(d.dps / d.eps, 1.5),
  }));
  // Escala eje derecho — auto-ajustada al yield real del ticker (estilo
  // FAST Graphs). Antes estaba fija a 0-10% lo que hacía que ZTS (yield
  // 1.86%) se viese aplastado abajo y la línea roja no cuadrase con los
  // ticks del eje. Ahora calculamos el max histórico y redondeamos a un
  // tope "limpio".
  // 2026-05-03: bug reportado por usuario — "el porcentaje de dividendo
  // pero no cuadra con lo que marca mi línea".
  const YIELD_AXIS_MAX = (() => {
    const yields = yieldPoints.map(p => p.yld);
    // 2026-05-03 fix TDZ: latestDPS está declarado más abajo (~línea 971),
    // así que lo recomputamos inline aquí: último DPS del validHist.
    const _localLatestDPS = validHist.length ? validHist[validHist.length - 1].div : null;
    if (cfg?.price > 0 && _localLatestDPS > 0) yields.push(_localLatestDPS / cfg.price);
    const maxYld = yields.length ? Math.max(...yields) : 0.05;
    // Headroom 20% + redondeo a "nice number" arriba
    const padded = maxYld * 1.2;
    if (padded <= 0.02) return 0.02;   // 2%
    if (padded <= 0.04) return 0.04;
    if (padded <= 0.06) return 0.06;
    if (padded <= 0.08) return 0.08;
    if (padded <= 0.10) return 0.10;
    if (padded <= 0.15) return 0.15;
    if (padded <= 0.20) return 0.20;
    return 0.25;  // tope para REITs / high-yield extreme
  })();
  // Ticks dinámicos — 5 valores equiespaciados (0, 25%, 50%, 75%, 100% del max)
  const YIELD_AXIS_TICKS = [0, 0.25, 0.50, 0.75, 1.0].map(p => p * YIELD_AXIS_MAX);
  const PAYOUT_AXIS_MAX = 1.00;
  const yldYScale = (yld) => {
    const clipped = Math.max(0, Math.min(yld, YIELD_AXIS_MAX));
    return PADT + chartH - (clipped / YIELD_AXIS_MAX) * chartH;
  };
  const payYScale = (pct) => {
    const clipped = Math.max(0, Math.min(pct, PAYOUT_AXIS_MAX));
    return PADT + chartH - (clipped / PAYOUT_AXIS_MAX) * chartH;
  };
  const yieldLine = yieldPoints.map(p => `${xScale(p.y)},${yldYScale(p.yld)}`).join(' ');
  const payoutLine = payoutPoints.map(p => `${xScale(p.y)},${payYScale(p.pct)}`).join(' ');

  // EV/EBITDA line (magenta) — multiplicador EV/EBITDA histórico del ticker.
  // Complemento de P/E: refleja valoración incluyendo deuda (útil para
  // empresas con balance apalancado o D&A alto que distorsiona earnings).
  // Escala eje derecho 0x–30x, mapeada al mismo rango vertical que yield/payout.
  const EVE_AXIS_MAX = 30;
  const eveYScale = (mult) => {
    const clipped = Math.max(0, Math.min(mult, EVE_AXIS_MAX));
    return PADT + chartH - (clipped / EVE_AXIS_MAX) * chartH;
  };
  const eveSeries = (history?.ev_ebitda_series || []).filter(d => Number.isFinite(d.value) && d.value > 0);
  const eveLine = eveSeries.map(d => `${xScale(d.year)},${eveYScale(d.value)}`).join(' ');
  // Shaded area bajo la línea EV/EBITDA — magenta translúcido.
  const eveAreaPoly = eveSeries.length > 1
    ? [
        `${xScale(eveSeries[0].year)},${yScale(rawMin)}`,
        ...eveSeries.map(d => `${xScale(d.year)},${eveYScale(d.value)}`),
        `${xScale(eveSeries[eveSeries.length - 1].year)},${yScale(rawMin)}`,
      ].join(' ')
    : '';

  // Debug: compute ALL metrics for last year so user can see them side-by-side
  const lastF = fin[lastHistY];
  const soLast = lastF?.sharesOut;
  const _allMetricValues = lastF ? {
    eps_adj:     lastF.eps,
    eps_basic:   lastF.epsBasic ?? lastF.eps,
    eps_diluted: lastF.epsDiluted ?? lastF.eps,
    ocf:         soLast ? lastF.ocf / soLast : null,
    fcfe:        comp[lastHistY]?.fcfps,
    ebitda:      soLast ? ((lastF.operatingIncome || 0) + (lastF.depreciation || 0)) / soLast : null,
    ebit:        soLast ? lastF.operatingIncome / soLast : null,
    sales:       soLast ? lastF.revenue / soLast : null,
  } : {};

  // Computed metrics for right panel
  const latestMetric = validHist.length ? validHist[validHist.length - 1].val : null;
  const impliedPE = latestMetric && cfg?.price ? cfg.price / latestMetric : null;
  // "Precio justo" y buy-zone usan zonePE (Normal P/E) para que la señal
  // "COMPRAR SI < $X" coincida con el TECHO del área verde del chart.
  // El valor Graham 15x (activePE en modo custom) se mantiene como línea
  // naranja de referencia, no como disparador de compra.
  const fairValue = latestMetric ? latestMetric * zonePE : null;
  const _fairValueGraham = latestMetric ? latestMetric * activePE : null;  // referencia Graham
  const mosVsFair = fairValue && cfg?.price ? 1 - cfg.price / fairValue : null;

  // ── Recesiones NBER + eventos macro — feature 3 ──
  // Bandas grises que marcan periodos de recesión/crisis. Aporta contexto
  // macro inmediato ("¿este drawdown fue crisis o noise?").
  // Fuente: NBER US Business Cycle Dating Committee + COVID crash rápido.
  const RECESSIONS = [
    { start: 2001.25, end: 2001.92, label: 'Dot-com' },      // Mar-Nov 2001
    { start: 2007.92, end: 2009.5, label: 'GFC' },           // Dec 2007 - Jun 2009
    { start: 2020.17, end: 2020.33, label: 'COVID' },        // Feb-Apr 2020
    { start: 2022.5, end: 2023.0, label: 'Bear 2022' },      // soft bear market
  ];
  const recessionBands = showRecessions ? RECESSIONS
    .filter(r => r.end >= minXYear && r.start <= lastHistY)
    .map(r => ({
      x1: xScale(Math.max(r.start, minXYear)),
      x2: xScale(Math.min(r.end, lastHistY + 0.5)),
      label: r.label,
    }))
    .filter(r => r.x2 > r.x1)
    : [];

  // ── Backtest mini — feature N3 ──
  // "Si hubieras comprado hace N años, realizarías +X%/año (incl. dividendos
  // acumulados aproximados)". Calcula precio hace N años del monthly_prices,
  // compara con precio actual, anualiza. DPS acumulado × shares = 1 (simple).
  const backtest = (() => {
    if (!monthlyPrices.length || !cfg?.price) return null;
    const today = new Date();
    const targetTs = new Date(today.getFullYear() - backtestYears, today.getMonth()).getTime();
    // Encuentra el sample más cercano a hace N años
    let nearest = null, bestD = Infinity;
    for (const p of monthlyPrices) {
      const d = Math.abs(new Date(p.date).getTime() - targetTs);
      if (d < bestD) { bestD = d; nearest = p; }
    }
    if (!nearest || !(nearest.close > 0)) return null;
    const startPrice = nearest.close;
    // Dividendos acumulados aprox: suma todos los DPS anuales desde el año de start
    const startYear = parseInt(nearest.date.slice(0, 4), 10);
    let divsAccum = 0;
    for (let y = startYear; y <= lastHistY; y++) {
      const d = getDpsExt(y);
      if (Number.isFinite(d)) divsAccum += d;
    }
    const endValueWithDivs = cfg.price + divsAccum;
    const totalReturn = endValueWithDivs / startPrice - 1;
    const cagr = Math.pow(endValueWithDivs / startPrice, 1 / backtestYears) - 1;
    return { startDate: nearest.date, startPrice, divsAccum, cagr, totalReturn };
  })();

  // ── Buy Zone — feature 2 ──
  // El precio umbral de compra es 85% del fair value (15% margin of safety).
  // Si el precio actual ya está bajo ese umbral → "EN ZONA" (verde grande).
  // Si no → "COMPRAR SI < $X" (gris + diferencia al objetivo).
  const MOS_THRESHOLD = 0.15;  // 15% discount requerido
  const buyZonePrice = fairValue ? fairValue * (1 - MOS_THRESHOLD) : null;
  const inBuyZone = buyZonePrice && cfg?.price != null && cfg.price <= buyZonePrice;
  const distToBuyZone = buyZonePrice && cfg?.price ? (cfg.price - buyZonePrice) / cfg.price : null;
  // Use consensus-derived growth in projection metrics when consensus mode active
  const effectiveGrowth = forecastMode === 'consensus' && consensusImpliedGrowth != null
    ? consensusImpliedGrowth * 100
    : fgGrowth;
  const futureMetric = latestMetric ? latestMetric * Math.pow(1 + effectiveGrowth / 100, fgProjYears) : null;
  // Precio futuro proyectado: usa zonePE (Normal P/E) para consistencia con
  // área verde y buy-zone. Si el usuario cambia modo P/E explícitamente,
  // activePE === zonePE y coincide.
  const futureFair = futureMetric ? futureMetric * zonePE : null;
  const futureReturn = futureFair && cfg?.price ? Math.pow(futureFair / cfg.price, 1 / fgProjYears) - 1 : null;
  const latestDPS = validHist.length ? validHist[validHist.length - 1].div : null;
  const divYield = latestDPS && cfg?.price ? latestDPS / cfg.price : null;
  const epsYield = latestMetric && cfg?.price ? latestMetric / cfg.price : null;
  const blendedPE = impliedPE; // simplified

  // Metric growth rate — CAGR from first to last historical year
  const metricCAGR = (() => {
    if (validHist.length < 2) return null;
    const first = validHist[0], last = validHist[validHist.length - 1];
    if (first.val <= 0 || last.val <= 0) return null;
    const years = last.y - first.y;
    if (years <= 0) return null;
    return Math.pow(last.val / first.val, 1 / years) - 1;
  })();

  const profile = history?.profile || {};
  const debtCap = (() => {
    const lastF = fin[lastHistY];
    if (!lastF) return null;
    const ltDebt = lastF.totalDebt || 0;
    const cap = ltDebt + (lastF.equity || 0);
    return cap > 0 ? ltDebt / cap : null;
  })();

  // Change/year table — filas FY × múltiples métricas (estilo FAST Graphs
  // con filas toggleables). Enriquecido con ventas/EBITDA/FCF/shares/P/E/
  // EV-EBITDA/yields — el usuario elige qué filas ver vía chips arriba.
  const eveByYear = Object.fromEntries((history?.ev_ebitda_series || []).map(d => [d.year, d.value]));
  const fcfYieldByYear = Object.fromEntries((history?.fcf_yield_series || []).map(d => [d.year, d.value]));
  const sharesByYear = Object.fromEntries((history?.shares_out_series || []).map(d => [d.year, d.value]));
  const tableRows = validHist.map((d, i) => {
    const prev = i > 0 ? validHist[i - 1].val : null;
    const prevDiv = i > 0 ? validHist[i - 1].div : null;
    const chg = prev && prev !== 0 ? (d.val - prev) / prev : null;
    const chgDiv = prevDiv && prevDiv !== 0 && d.div ? (d.div - prevDiv) / prevDiv : null;
    const f = fin[d.y];
    const so = f?.sharesOut;
    const pxEoy = priceByYear[d.y];
    const sales = f?.revenue && so ? f.revenue / so : null;
    const ebitda = f && so ? ((f.operatingIncome || 0) + (f.depreciation || 0)) / so : null;
    const fcfps = comp[d.y]?.fcfps;
    const pe = pxEoy && d.val > 0 ? pxEoy / d.val : (ratiosBy[d.y]?.pe ?? null);
    const divYield = pxEoy && d.div > 0 ? d.div / pxEoy : null;
    const payout = d.val > 0 && d.div > 0 ? Math.min(d.div / d.val, 2) : null;
    // Ratios "% vs fair": >100 = caro, <100 = barato. null si no hay datos.
    const fvRatio = pxEoy && d.val > 0 && activePE ? pxEoy / (d.val * activePE) : null;
    const nprRatio = pxEoy && d.val > 0 && zonePE ? pxEoy / (d.val * zonePE) : null;
    return {
      y: d.y, val: d.val, chg, div: d.div, chgDiv,
      sales, ebitda, fcfps,
      shares: sharesByYear[d.y] ?? so ?? null,
      pe, evEbitda: eveByYear[d.y] ?? null,
      fvRatio, nprRatio,
      fcfYield: fcfYieldByYear[d.y] ?? null,
      divYield, payout,
    };
  });

  // Registro de filas disponibles — cada fila se puede mostrar/ocultar vía chips.
  // Agrupadas semánticamente: crecimiento / valoración / dividendo.
  const TABLE_ROW_REGISTRY = [
    // Crecimiento
    { key:'val',       group:'growth', label:METRIC_LABEL[fgMode]?.slice(0,12)||'Valor', color:'var(--gold)', bold:true,  fmt:(r)=>fC(r.val) },
    { key:'chg',       group:'growth', label:'∆/año',        color:'var(--text-secondary)', colorize:'diff', fmt:(r)=>r.chg!=null?(r.chg>0?'+':'')+(r.chg*100).toFixed(0)+'%':'—' },
    { key:'sales',     group:'growth', label:'Ventas/acc',   color:'var(--text-secondary)', fmt:(r)=>r.sales!=null?'$'+r.sales.toFixed(2):'—' },
    { key:'ebitda',    group:'growth', label:'EBITDA/acc',   color:'var(--text-secondary)', fmt:(r)=>r.ebitda!=null?'$'+r.ebitda.toFixed(2):'—' },
    { key:'fcfps',     group:'growth', label:'FCF/acc',      color:'var(--text-secondary)', fmt:(r)=>r.fcfps!=null?'$'+r.fcfps.toFixed(2):'—' },
    { key:'shares',    group:'growth', label:'Shares (M)',   color:'var(--text-secondary)', fmt:(r)=>r.shares!=null?(r.shares/1e6).toFixed(0):'—' },
    // Valoración
    { key:'pe',        group:'valuation', label:'P/E cierre', color:'#4a90e2', fmt:(r)=>r.pe!=null?r.pe.toFixed(1)+'x':'—' },
    { key:'evEbitda',  group:'valuation', label:'EV/EBITDA',  color:'#d946ef', fmt:(r)=>r.evEbitda!=null?r.evEbitda.toFixed(1)+'x':'—' },
    { key:'fvRatio',   group:'valuation', label:`vs Fair ${activePE?activePE.toFixed(0):15}x`, color:'#f59e0b', colorize:'fair', fmt:(r)=>r.fvRatio!=null?(r.fvRatio*100).toFixed(0)+'%':'—' },
    { key:'nprRatio',  group:'valuation', label:`vs Normal ${zonePE?zonePE.toFixed(0):''}x`,   color:'#2e8b57', colorize:'fair', fmt:(r)=>r.nprRatio!=null?(r.nprRatio*100).toFixed(0)+'%':'—' },
    { key:'fcfYield',  group:'valuation', label:'FCF Yield',  color:'#30d158', fmt:(r)=>r.fcfYield!=null?(r.fcfYield*100).toFixed(1)+'%':'—' },
    // Dividendo
    { key:'div',       group:'dividend', label:'Dividendo',   color:'var(--gold)', fmt:(r)=>r.div?'$'+r.div.toFixed(2):'—' },
    { key:'chgDiv',    group:'dividend', label:'∆ Div/año',   color:'var(--text-secondary)', colorize:'diff', fmt:(r)=>r.chgDiv!=null?(r.chgDiv>0?'+':'')+(r.chgDiv*100).toFixed(0)+'%':'—' },
    { key:'divYield',  group:'dividend', label:'Div Yield',   color:'#dc2626', fmt:(r)=>r.divYield!=null?(r.divYield*100).toFixed(2)+'%':'—' },
    { key:'payout',    group:'dividend', label:'Payout',      color:'#eab308', colorize:'payout', fmt:(r)=>r.payout!=null?(r.payout*100).toFixed(0)+'%':'—' },
  ];
  const TABLE_GROUP_LABELS = { growth: '📈 Crecimiento', valuation: '⚖️ Valoración', dividend: '💰 Dividendo' };

  return (
    <div className="fast-light-theme">
      {/* Tema claro scoped SOLO a la pestaña FAST — match visual con FAST Graphs
          que usa fondo crema/blanco. Overrides CSS vars dentro del árbol.
          El resto de A&R sigue dark theme. */}
      <style>{`
        .fast-light-theme {
          --text-primary: #141726;
          --text-secondary: #4a5066;
          --text-tertiary: #8890a3;
          --bg: #faf9f5;
          --card: #ffffff;
          --border: rgba(20, 23, 38, 0.12);
          --subtle-border: rgba(20, 23, 38, 0.05);
          --border-hover: rgba(20, 23, 38, 0.25);
          --gold: #b8860b;
          --gold-dim: rgba(184, 134, 11, 0.12);
          --chart-bg: #fffdf7;
          background: #faf9f5;
          color: #141726;
          padding: 16px;
          margin: -16px;
          margin-bottom: 0;
          border-radius: 10px;
        }
        .fast-light-theme h2,
        .fast-light-theme h3,
        .fast-light-theme h4 { color: #141726; }
        .fast-light-theme button { color-scheme: light; }
        /* Sliders con track + thumb bien contrastados en light theme */
        .fast-light-theme input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          background: #e2e1d9;
          border-radius: 3px;
          outline: none;
        }
        .fast-light-theme input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: #b8860b;
          border: 2px solid #fff;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .fast-light-theme input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: #b8860b;
          border: 2px solid #fff;
          border-radius: 50%;
          cursor: pointer;
        }
        /* Tablas legibles en light theme */
        .fast-light-theme table { color: #141726; }
        .fast-light-theme table th { color: #4a5066; }
        /* Select dropdown legible */
        .fast-light-theme select { color: #141726; background: #fff; }
        .fast-light-theme select option { color: #141726; }
        /* Responsive layout: sidebar de métricas a la derecha en ≥1200px,
           colapsa a una columna debajo del chart en pantallas estrechas. */
        @media (max-width: 1200px) {
          .fast-chart-layout { grid-template-columns: 1fr !important; }
        }
        /* Pulse animation para el Buy Zone cuando el ticker está en zona de
           compra — llama la atención visualmente sin ser intrusivo. */
        @keyframes fastBuyPulse {
          0%, 100% { stroke-opacity: 0.6; stroke-width: 1.5; }
          50% { stroke-opacity: 1; stroke-width: 3; }
        }
        .fast-buy-pulse {
          animation: fastBuyPulse 1.8s ease-in-out infinite;
        }
        /* Skeleton loading — pulsante mientras carga /api/fg-history */
        @keyframes fastSkeletonPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .fast-skeleton {
          background: linear-gradient(90deg, rgba(20,23,38,0.06), rgba(20,23,38,0.12), rgba(20,23,38,0.06));
          animation: fastSkeletonPulse 1.4s ease-in-out infinite;
          border-radius: 4px;
        }
      `}</style>
      {/* Header */}
      {/* Header tipo FAST Graphs — "Historical graph" + dropdown inline,
          extras de A&R agrupados en un menú compacto a la derecha.
          Verificado contra app.fastgraphs.com/security/.../summary */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:10,paddingBottom:8,borderBottom:'1px solid var(--subtle-bg2)'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:600,color:'var(--text-primary)',fontFamily:'var(--fd)',display:'flex',alignItems:'center',gap:8}}
              title={`Línea blanca = precio histórico · Línea dorada = ${METRIC_LABEL[fgMode] || 'EPS'} × ${activePE?activePE.toFixed(1):fgPE}x · Azul = Normal P/E · Punto rojo = precio actual${isReit?'\nMODO REIT: comparamos vs AFFO igual que FAST Graphs':''}`}>
            Historical graph
            {isReit && (
              <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(168,85,247,.12)',color:'#a855f7',border:'1px solid rgba(168,85,247,.3)',letterSpacing:.3}}>
                REIT · AFFO
              </span>
            )}
          </h2>
          {/* Price Correlated With dropdown — exacto FAST Graphs */}
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',background:'rgba(255,159,10,.08)',border:'1px solid rgba(255,159,10,.25)',borderRadius:6}}>
            <span style={{fontSize:10,color:'#ff9f0a',fontFamily:'var(--fm)',fontWeight:600}}>Price Correlated With:</span>
            <select value={fgMode} onChange={e=>setFgMode(e.target.value)}
              style={{padding:'2px 6px',borderRadius:4,border:'none',background:'transparent',color:'var(--text-primary)',fontSize:11,fontWeight:600,fontFamily:'var(--fm)',cursor:'pointer',outline:'none',maxWidth:240}}>
              <optgroup label="Earnings">{METRIC_OPTIONS.filter(m=>m.group==='Earnings').map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              <optgroup label="Cash Flow">{METRIC_OPTIONS.filter(m=>m.group==='Cash Flow').map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              <optgroup label="Otras métricas">{METRIC_OPTIONS.filter(m=>m.group==='Otras').map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            </select>
          </div>
        </div>
        {/* Extras compactos — todos en un solo grupo, iconos pequeños */}
        <div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
          {/* P/E personal — icono solo */}
          <button onClick={() => {
              if (!storageKey) return;
              try {
                if (hasPersonalPE) { localStorage.removeItem(storageKey); }
                else { localStorage.setItem(storageKey, String(fgPE)); }
                setPersonalPERev(r => r + 1);
              } catch {}
            }}
            title={hasPersonalPE ? `Borrar P/E personal guardado (${savedPE?.toFixed(1)}x)` : `Guardar ${fgPE}x como P/E preferido para ${ticker}`}
            style={{padding:'4px 8px',borderRadius:5,border:`1px solid ${hasPersonalPE?'#f59e0b':'var(--border)'}`,background:hasPersonalPE?'rgba(245,158,11,0.10)':'transparent',color:hasPersonalPE?'#f59e0b':'var(--text-tertiary)',fontSize:10,cursor:'pointer',fontFamily:'var(--fm)'}}>
            {hasPersonalPE ? '⭐' : '☆'}
          </button>
          {/* Smooth EPS toggle compacto */}
          <button onClick={()=>setSmoothEps(!smoothEps)}
            title="Smooth EPS — rolling median 3y, suaviza picos GAAP (write-downs, FX, impairments)"
            style={{padding:'4px 8px',borderRadius:5,border:`1px solid ${smoothEps?'var(--gold)':'var(--border)'}`,background:smoothEps?'rgba(200,164,78,0.08)':'transparent',color:smoothEps?'var(--gold)':'var(--text-tertiary)',fontSize:10,cursor:'pointer',fontFamily:'var(--fm)'}}>
            Smooth
          </button>
          {/* Compare ticker compacto */}
          <input
            type="text"
            value={compareTicker}
            onChange={e => setCompareTicker(e.target.value.toUpperCase().trim())}
            placeholder="vs..."
            maxLength={6}
            title="Compara con otro ticker (overlay ghost normalizado al inicio). Ej: PEP, MO, ABBV"
            style={{padding:'4px 8px',borderRadius:5,border:`1px solid ${compareData ? '#9333ea' : 'var(--border)'}`,background:compareData ? 'rgba(147,51,234,0.06)' : 'transparent',color:compareData ? '#9333ea' : 'var(--text-tertiary)',fontSize:10,fontFamily:'var(--fm)',width:60,textAlign:'center',outline:'none'}}
          />
          {/* +Trades — sólo número si tiene */}
          <button onClick={()=>setShowTrades(!showTrades)}
            title={`${trades.length} transacciones de este ticker en el chart`}
            style={{padding:'4px 8px',borderRadius:5,border:`1px solid ${showTrades?'#30d158':'var(--border)'}`,background:showTrades?'rgba(48,209,88,0.06)':'transparent',color:showTrades?'#30d158':'var(--text-tertiary)',fontSize:10,cursor:'pointer',fontFamily:'var(--fm)'}}>
            T·{trades.length}
          </button>
          {/* PNG export — icono */}
          <button onClick={exportChartPNG}
            title={`Descargar PNG (fast-${ticker}-YYYY-MM-DD.png)`}
            style={{padding:'4px 8px',borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--text-tertiary)',fontSize:10,cursor:'pointer',fontFamily:'var(--fm)'}}>
            ⬇
          </button>
        </div>
      </div>

      {/* Time range + PE mode controls */}
      <div style={{display:'flex',gap:4,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginRight:4,letterSpacing:.3}}>RANGO:</span>
        {RANGES.map(r => (
          <button key={r.id} onClick={()=>setRange(r.id)} style={{padding:'4px 10px',borderRadius:5,border:`1px solid ${range===r.id?'var(--gold)':'var(--border)'}`,background:range===r.id?'var(--gold-dim)':'transparent',color:range===r.id?'var(--gold)':'var(--text-secondary)',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'var(--fm)'}}>{r.id}</button>
        ))}
        <span style={{marginLeft:12,fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginRight:4,letterSpacing:.3}}>
          {isReit && (fgMode === 'fcfe' || fgMode === 'ocf') ? 'P/AFFO REFERENCIA:' : 'P/E REFERENCIA:'}
        </span>
        {(() => {
          // En modo REIT (AFFO), las medias históricas avg_pe_5y/10y vienen
          // de P/E (price ÷ EPS) y son engañosas (pueden mostrar 50-60x
          // porque EPS de REITs es bajo por D&A). Las ocultamos y mostramos
          // sólo el slider Custom hasta que el backend exponga p_affo_history.
          // El usuario por defecto verá Custom (15x) que es lo que usa FAST
          // Graphs como Fair Value para REITs.
          const reitMode = isReit && (fgMode === 'fcfe' || fgMode === 'ocf');
          const opts = reitMode
            ? [{id:'custom',lbl:`Custom (${fgPE}x)`}]
            : [
                {id:'custom',lbl:`Custom (${fgPE}x)`},
                {id:'normal_5y',lbl:history?.avg_pe_5y?`Normal 5y (${history.avg_pe_5y.toFixed(1)}x)`:'Normal 5y'},
                {id:'normal_10y',lbl:history?.avg_pe_10y?`Normal 10y (${history.avg_pe_10y.toFixed(1)}x)`:'Normal 10y'},
                {id:'normal_all',lbl:history?.avg_pe_all?`Normal MAX (${history.avg_pe_all.toFixed(1)}x)`:'Normal MAX'},
              ];
          return opts.map(o => (
            <button key={o.id} onClick={()=>setPeMode(o.id)} style={{padding:'4px 10px',borderRadius:5,border:`1px solid ${peMode===o.id?'#64d2ff':'var(--border)'}`,background:peMode===o.id?'rgba(100,210,255,0.12)':'transparent',color:peMode===o.id?'#64d2ff':'var(--text-secondary)',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'var(--fm)'}}>{o.lbl}</button>
          ));
        })()}
        {isReit && (fgMode === 'fcfe' || fgMode === 'ocf') && (
          <span style={{fontSize:8,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginLeft:4,fontStyle:'italic'}}>
            (Normal P/E historical oculta — distorsionada en REITs por D&A; usa slider Custom 15x = FAST Graphs default)
          </span>
        )}
      </div>

      {/* "VALOR POR MÉTRICA" 8-cards grid eliminado 2026-05-03 a petición
          del usuario (redundante con el dropdown "Correlacionar con" de
          arriba que hace exactamente lo mismo: cambiar fgMode). FAST
          Graphs no tiene equivalente. Se conservaba para "diagnosticar"
          campos faltantes pero el dropdown ya muestra "—" si vacío. */}

      {/* Sliders row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:14}}>
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
          <div style={{fontSize:8,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',fontFamily:'var(--fm)',letterSpacing:.5,marginBottom:4}}>P/E Custom</div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <input type="range" min={5} max={50} step={0.5} value={fgPE} onChange={e=>{setFgPE(parseFloat(e.target.value)); setPeMode('custom');}} style={{flex:1,accentColor:'var(--gold)'}}/>
            <span style={{fontSize:13,fontWeight:700,color:'var(--gold)',fontFamily:'var(--fm)',minWidth:34}}>{fgPE}x</span>
          </div>
        </div>
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px',gridColumn:'span 2'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <span style={{fontSize:8,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',fontFamily:'var(--fm)',letterSpacing:.5}}>Modo de proyección</span>
            <div style={{display:'flex',gap:4}}>
              <button onClick={()=>setShowRecessions(!showRecessions)} title="Mostrar bandas grises de recesiones (NBER 2001, 2008-2009, 2020, bear 2022)"
                style={{padding:'1px 6px',fontSize:8,fontWeight:700,borderRadius:3,border:`1px solid ${showRecessions?'#666':'var(--border)'}`,background:showRecessions?'rgba(100,100,100,0.15)':'transparent',color:showRecessions?'#666':'var(--text-secondary)',cursor:'pointer',fontFamily:'var(--fm)'}}>
                RECESIONES
              </button>
              <button onClick={()=>setShowCones(!showCones)} title="Mostrar margen de error histórico (±error 1Y/2Y de analistas)"
                style={{padding:'1px 6px',fontSize:8,fontWeight:700,borderRadius:3,border:`1px solid ${showCones?'#64d2ff':'var(--border)'}`,background:showCones?'rgba(100,210,255,0.12)':'transparent',color:showCones?'#64d2ff':'var(--text-secondary)',cursor:'pointer',fontFamily:'var(--fm)'}}>
                CONO ±{history?.earnings_scorecard?.margin_1y_pct?.toFixed(0) || 10}/{history?.earnings_scorecard?.margin_2y_pct?.toFixed(0) || 20}%
              </button>
            </div>
          </div>
          <div style={{display:'flex',gap:3,marginBottom:5,flexWrap:'wrap'}}>
            {FORECAST_MODES.map(m => {
              const disabled = (m.id === 'consensus' && !consensusAvailable)
                || (m.id === 'cagr5' && cagr5 == null)
                || (m.id === 'cagr10' && cagr10 == null);
              const active = forecastMode === m.id;
              const disabledReason = m.id === 'consensus' ? 'Sin estimates de analistas en FMP'
                : m.id === 'cagr5' ? 'Sin 5 años de EPS positivo en historial'
                : m.id === 'cagr10' ? 'Sin 10 años de EPS positivo en historial' : '';
              return (
                <button key={m.id} onClick={()=>!disabled && setForecastMode(m.id)} disabled={disabled}
                  title={disabled ? disabledReason : m.tip}
                  style={{
                    padding:'3px 7px',fontSize:9,fontWeight:700,borderRadius:4,fontFamily:'var(--fm)',
                    border:`1px solid ${active?m.color:disabled?'var(--border)':m.color+'66'}`,
                    background:active?`${m.color}22`:'transparent',
                    color:active?m.color:disabled?'var(--text-tertiary)':m.color,
                    cursor:disabled?'not-allowed':'pointer',
                    opacity:disabled?0.35:1,
                    textDecoration:disabled?'line-through':'none',
                  }}>{m.lbl}</button>
              );
            })}
          </div>
          {forecastMode === 'manual' || forecastMode === 'normal' ? (
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <input type="range" min={-10} max={30} step={0.5} value={fgGrowth} onChange={e=>setFgGrowth(parseFloat(e.target.value))} style={{flex:1,accentColor:FORECAST_MODES.find(m=>m.id===forecastMode)?.color}}/>
              <span style={{fontSize:13,fontWeight:700,color:FORECAST_MODES.find(m=>m.id===forecastMode)?.color,fontFamily:'var(--fm)',minWidth:44}}>{fgGrowth}%</span>
            </div>
          ) : (
            <div style={{display:'flex',alignItems:'baseline',gap:4,flexWrap:'wrap'}}>
              <span style={{fontSize:14,fontWeight:700,color:FORECAST_MODES.find(m=>m.id===forecastMode)?.color,fontFamily:'var(--fm)'}}>
                {forecastMode==='consensus' && consensusImpliedGrowth!=null && fP(consensusImpliedGrowth)}
                {forecastMode==='cagr5' && cagr5!=null && fP(cagr5)}
                {forecastMode==='cagr10' && cagr10!=null && fP(cagr10)}
              </span>
              <span style={{fontSize:8,color:'var(--text-tertiary)',fontFamily:'var(--fm)'}}>{FORECAST_MODES.find(m=>m.id===forecastMode)?.tip}</span>
              {forecastMode==='consensus' && consensusImpliedGrowth > 0.5 && (
                <span style={{fontSize:8,color:'#ff9f0a',fontFamily:'var(--fm)',padding:'1px 5px',border:'1px solid #ff9f0a',borderRadius:3,fontWeight:700}}>⚠ outlier · base EPS baja / pocos analistas</span>
              )}
            </div>
          )}
        </div>
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
          <div style={{fontSize:8,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',fontFamily:'var(--fm)',letterSpacing:.5,marginBottom:4}}>Años Proyec.</div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <input type="range" min={1} max={10} step={1} value={fgProjYears} onChange={e=>setFgProjYears(parseInt(e.target.value, 10))} style={{flex:1,accentColor:'#bf5af2'}}/>
            <span style={{fontSize:13,fontWeight:700,color:'#bf5af2',fontFamily:'var(--fm)',minWidth:30}}>{fgProjYears}a</span>
          </div>
        </div>
        {/* Cards "Último valor" y "Precio actual" eliminadas 2026-05-03
            — duplicaban info de la franja superior compacta del Resumen
            (logo + nombre + precio + IV + cap...). FAST Graphs no tiene
            estas cards en la zona de controles, sólo el precio en el
            header de página. */}
      </div>

      {/* Tab bar estilo FAST Graphs — 5 secciones enfocadas.
          Summary = chart principal + sidebar. El resto aíslan trends/forecast/
          histórico/scorecards para lectura sin distracciones. */}
      <div style={{display:'flex',gap:2,marginBottom:12,borderBottom:'1px solid var(--border)',overflowX:'auto'}}>
        {[
          { id: 'summary',     lbl: '📊 Summary' },
          { id: 'trends',      lbl: '📈 Trends' },
          { id: 'forecasting', lbl: '🔮 Forecasting' },
          { id: 'historical',  lbl: '📅 Historical' },
          { id: 'scorecard',   lbl: '🎯 Scorecard' },
        ].map(t => (
          <button key={t.id} onClick={() => setInnerTab(t.id)}
            style={{
              padding:'8px 14px',fontSize:11,fontWeight:innerTab===t.id?700:600,
              border:'none',borderBottom:`2px solid ${innerTab===t.id?'var(--gold)':'transparent'}`,
              background:'transparent',color:innerTab===t.id?'var(--gold)':'var(--text-secondary)',
              cursor:'pointer',fontFamily:'var(--fm)',whiteSpace:'nowrap',marginBottom:-1,
            }}>
            {t.lbl}
          </button>
        ))}
      </div>

      {/* Banner ETF / instrumento sin fundamentales — cuando el ticker no tiene
          ratios por acción (ETFs, fondos, ADRs sin reporting). El chart sigue
          mostrando evolución de precio, pero FAST Graphs no aplica. */}
      {isNonFundamental(history) && (
        <div style={{marginBottom:12,padding:'10px 14px',background:'rgba(74,144,226,0.08)',border:'1px solid rgba(74,144,226,0.3)',borderRadius:10,fontSize:11,color:'var(--text-primary)',fontFamily:'var(--fm)',lineHeight:1.5}}>
          ℹ️ <strong>{ticker}</strong> es un <strong>ETF o instrumento sin fundamentales por acción</strong>. FMP no devuelve EPS/P/E/ratios, así que las curvas de Fair Value y Normal P/E no se pueden calcular. El chart muestra solo evolución de precio mensual. Para análisis fundamental usa acciones individuales.
        </div>
      )}

      {/* Main layout: chart a la izquierda + panel de métricas clave a la derecha,
          replicando la columna "Metrics" de FAST Graphs. En pantallas <1200px
          colapsa a 1 columna (sidebar debajo del chart). SOLO en tab Summary. */}
      {innerTab === 'summary' && (
      <div className="fast-chart-layout" style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 260px',gap:12,alignItems:'start'}}>
        {/* Chart */}
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14,minWidth:0}}>
          {loading && (
            <div style={{padding:16}}>
              <div className="fast-skeleton" style={{height:40,marginBottom:12}}/>
              <div className="fast-skeleton" style={{height:480}}/>
              <div style={{textAlign:'center',color:'var(--text-tertiary)',fontSize:10,fontFamily:'var(--fm)',marginTop:10}}>Cargando histórico de precio…</div>
            </div>
          )}
          {error && <div style={{padding:20,color:'#ff453a',fontSize:12}}>⚠ Error: {error}</div>}
          {!loading && !error && (
            <svg ref={chartSvgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{display:'block',width:'100%',height:'auto',touchAction:'pan-y'}}
              onMouseMove={(e) => {
                // Throttle con rAF: sólo 1 update por frame aunque el mouse se mueva rápido.
                if (hoverRafRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const clientX = e.clientX;
                hoverRafRef.current = requestAnimationFrame(() => {
                  hoverRafRef.current = null;
                  const svgX = ((clientX - rect.left) / rect.width) * W;
                  if (svgX < PADL || svgX > W - PADR) { setHover(null); return; }
                  if (!monthSamples.length) return;
                  // Encuentra el mes más cercano por X
                  let nearest = monthSamples[0];
                  let bestD = Math.abs(nearest.x - svgX);
                  for (const s of monthSamples) {
                    const d = Math.abs(s.x - svgX);
                    if (d < bestD) { bestD = d; nearest = s; }
                  }
                  const f = fin[nearest.year] || {};
                  const pe = f.eps > 0 ? nearest.priceVal / f.eps : null;
                  const divY = f.dps && nearest.priceVal > 0 ? f.dps / nearest.priceVal : null;
                  const payout = (f.dps && f.eps > 0) ? f.dps / f.eps : null;
                  // Busca trade dentro de ±30 días del punto hovered. Si hay,
                  // agrupa por mismo mes+tipo (ej: 3 compras en enero = 1 entry).
                  const nearTradeMs = 30 * 86400000;
                  const hoverTs = new Date(nearest.date).getTime();
                  const nearTrades = trades.filter(t => {
                    const d = t.fecha;
                    if (!d) return false;
                    return Math.abs(new Date(d).getTime() - hoverTs) < nearTradeMs;
                  });
                  const tradeSummary = nearTrades.length ? (() => {
                    const totShares = nearTrades.reduce((s, t) => s + (+t.shares || 0), 0);
                    const totCost = nearTrades.reduce((s, t) => s + (+t.precio || 0) * (+t.shares || 0), 0);
                    const avgPrice = totShares ? totCost / totShares : 0;
                    const tipo = nearTrades[0].tipo?.toUpperCase() || 'BUY';
                    return { count: nearTrades.length, totShares, avgPrice, tipo };
                  })() : null;
                  setHover({
                    svgX: nearest.x, svgY: nearest.yPrice,
                    year: nearest.year, date: nearest.date,
                    price: nearest.priceVal, eps: f.eps, pe,
                    fair: nearest.fairValue, yield: divY, payout, dps: f.dps,
                    isProjected: nearest.year > lastHistY,
                    vsToday: cfg?.price && nearest.priceVal ? (nearest.priceVal / cfg.price) - 1 : null,
                    tradeSummary,
                  });
                });
              }}
              onTouchMove={(e) => {
                // Soporte táctil iPad — usa el primer touch.
                const t = e.touches[0]; if (!t) return;
                if (hoverRafRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const clientX = t.clientX;
                hoverRafRef.current = requestAnimationFrame(() => {
                  hoverRafRef.current = null;
                  const svgX = ((clientX - rect.left) / rect.width) * W;
                  if (svgX < PADL || svgX > W - PADR) { setHover(null); return; }
                  if (!monthSamples.length) return;
                  let nearest = monthSamples[0];
                  let bestD = Math.abs(nearest.x - svgX);
                  for (const s of monthSamples) {
                    const d = Math.abs(s.x - svgX);
                    if (d < bestD) { bestD = d; nearest = s; }
                  }
                  const f = fin[nearest.year] || {};
                  const pe = f.eps > 0 ? nearest.priceVal / f.eps : null;
                  const divY = f.dps && nearest.priceVal > 0 ? f.dps / nearest.priceVal : null;
                  const payout = (f.dps && f.eps > 0) ? f.dps / f.eps : null;
                  // Busca trade dentro de ±30 días del punto hovered. Si hay,
                  // agrupa por mismo mes+tipo (ej: 3 compras en enero = 1 entry).
                  const nearTradeMs = 30 * 86400000;
                  const hoverTs = new Date(nearest.date).getTime();
                  const nearTrades = trades.filter(t => {
                    const d = t.fecha;
                    if (!d) return false;
                    return Math.abs(new Date(d).getTime() - hoverTs) < nearTradeMs;
                  });
                  const tradeSummary = nearTrades.length ? (() => {
                    const totShares = nearTrades.reduce((s, t) => s + (+t.shares || 0), 0);
                    const totCost = nearTrades.reduce((s, t) => s + (+t.precio || 0) * (+t.shares || 0), 0);
                    const avgPrice = totShares ? totCost / totShares : 0;
                    const tipo = nearTrades[0].tipo?.toUpperCase() || 'BUY';
                    return { count: nearTrades.length, totShares, avgPrice, tipo };
                  })() : null;
                  setHover({
                    svgX: nearest.x, svgY: nearest.yPrice,
                    year: nearest.year, date: nearest.date,
                    price: nearest.priceVal, eps: f.eps, pe,
                    fair: nearest.fairValue, yield: divY, payout, dps: f.dps,
                    isProjected: nearest.year > lastHistY,
                    vsToday: cfg?.price && nearest.priceVal ? (nearest.priceVal / cfg.price) - 1 : null,
                    tradeSummary,
                  });
                });
              }}
              onMouseLeave={() => { if (hoverRafRef.current) { cancelAnimationFrame(hoverRafRef.current); hoverRafRef.current = null; } setHover(null); }}
              onTouchEnd={() => setHover(null)}>
              <defs>
                <linearGradient id="fastFairGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.18"/>
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.02"/>
                </linearGradient>
              </defs>
              {/* Fondo del chart — crema claro idéntico al de FAST Graphs original.
                  En el light theme toma el valor de --chart-bg (#faf9f5). */}
              <rect x={PADL} y={PADT} width={chartW} height={chartH} fill="var(--chart-bg, #faf9f5)" rx={4}/>

              {/* Y grid izquierdo — precios $ */}
              {gridLines.map((g, i) => (
                <g key={i}>
                  <line x1={PADL} y1={g.y} x2={PADL+chartW} y2={g.y} stroke="var(--subtle-border, rgba(20,23,38,0.08))" strokeWidth={1}/>
                  <text x={PADL-6} y={g.y+3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">${Math.round(g.val)}</text>
                </g>
              ))}

              {/* Eje derecho — doble escala: yield (0–10% rojo) + payout (0–100% amarillo).
                  Ambas escalas ocupan el mismo rango vertical. Ticks yield cada 2%,
                  payout cada 25%. Estilo FAST Graphs right axis. */}
              {YIELD_AXIS_TICKS.map((y, i) => (
                <text key={'yaxR'+i} x={PADL+chartW+4} y={yldYScale(y)+3}
                  fontSize={8} fill="#dc2626" fontFamily="monospace" fontWeight={600} textAnchor="start">
                  {(y*100).toFixed(YIELD_AXIS_MAX <= 0.04 ? 1 : 0)}%
                </text>
              ))}
              {[0.25, 0.50, 0.75, 1.00].map((p, i) => (
                <text key={'payaxR'+i} x={PADL+chartW+28} y={payYScale(p)+3}
                  fontSize={8} fill="#a78500" fontFamily="monospace" fontWeight={600} textAnchor="start">
                  {(p*100).toFixed(0)}
                </text>
              ))}
              <text x={PADL+chartW+4} y={PADT-4} fontSize={7.5} fill="#dc2626" fontFamily="monospace" fontWeight={700}>YLD</text>
              <text x={PADL+chartW+28} y={PADT-4} fontSize={7.5} fill="#a78500" fontFamily="monospace" fontWeight={700}>POR</text>
              {/* EV/EBITDA axis (magenta) — visible sólo cuando la serie está activa,
                  para no saturar el eje cuando el usuario no la ha pedido. */}
              {visibleSeries.evEbitda && [0, 10, 20, 30].map((m, i) => (
                <text key={'eveax'+i} x={PADL+chartW+52} y={eveYScale(m)+3}
                  fontSize={8} fill="#d946ef" fontFamily="monospace" fontWeight={600} textAnchor="start">
                  {m}x
                </text>
              ))}
              {visibleSeries.evEbitda && (
                <text x={PADL+chartW+52} y={PADT-4} fontSize={7.5} fill="#d946ef" fontFamily="monospace" fontWeight={700}>EV/EB</text>
              )}

              {/* X year ticks */}
              {yearTicks.map(yr => (
                <g key={yr}>
                  <line x1={xScale(yr)} y1={PADT} x2={xScale(yr)} y2={PADT+chartH} stroke="var(--subtle-border, rgba(20,23,38,0.05))" strokeWidth={1}/>
                  <text x={xScale(yr)} y={PADT+chartH+14} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">{yr}</text>
                </g>
              ))}

              {/* Separator: hist / projection */}
              {validHist.length > 0 && (
                <line x1={xScale(lastHistY)} y1={PADT} x2={xScale(lastHistY)} y2={PADT+chartH} stroke="var(--border-hover, rgba(20,23,38,0.2))" strokeWidth={1} strokeDasharray="3,3"/>
              )}

              {/* Bandas de recesiones NBER + macro */}
              {visibleSeries.recessions && recessionBands.map((b, i) => (
                <g key={'rec'+i}>
                  <rect x={b.x1} y={PADT} width={b.x2 - b.x1} height={chartH}
                    fill="rgba(50, 50, 60, 0.18)" stroke="none"/>
                  <text x={(b.x1 + b.x2) / 2} y={PADT + chartH - 4} textAnchor="middle"
                    fontSize={8} fill="rgba(50, 50, 60, 0.7)" fontFamily="monospace" fontWeight={700}>
                    {b.label}
                  </text>
                </g>
              ))}

              {/* Área verde CLARA = EPS × P/E (valor justificado por earnings) */}
              {visibleSeries.fairArea && greenAreaPoly && (
                <polygon points={greenAreaPoly} fill="rgba(46, 139, 87, 0.40)" stroke="none"/>
              )}
              {/* Área verde OSCURA = DPS × P/E (valor justificado solo por dividendo).
                  Apilada dentro de la clara. Si precio cae aquí = súper ganga. */}
              {visibleSeries.dpsArea && darkGreenPoly && (
                <polygon points={darkGreenPoly} fill="rgba(20, 75, 45, 0.55)" stroke="none"/>
              )}

              {/* Normal P/E line — línea azul CLARA continua (estilo FAST Graphs
                  series-4 "Normal PE"). Color #4a90e2 (azul cielo) para distinguirla
                  del precio negro y no confundir con el fondo. Sin dots gruesos —
                  la línea es suficiente. Es la señal más importante: precio si
                  la acción cotizara a su P/E histórico medio 10y. */}
              {visibleSeries.normalPE && bandMid && <polyline points={bandMid} fill="none" stroke="#4a90e2" strokeWidth={2.2} opacity={0.95} strokeLinejoin="round" strokeLinecap="round"/>}
              {visibleSeries.normalPE && bandMid && [
                ...validHist.map(d => ({ y: d.y, val: getSmoothEps(d.y), proj: false })),
                ...projData.filter(d => d.val != null).map(d => ({ y: d.y, val: d.val, proj: true })),
              ].map((d, i) => peMid ? (
                <circle key={'npe'+i} cx={xScale(d.y)} cy={yScale(clipY(d.val * peMid))} r={2.2} fill="#4a90e2" stroke="var(--bg)" strokeWidth={0.6} opacity={d.proj ? 0.7 : 1}/>
              ) : null)}

              {/* Split flags — banderita vertical en cada stock split */}
              {splitFlags.map((s, i) => (
                <g key={'sp'+i}>
                  <title>Split {s.ratio} · {s.date}</title>
                  <line x1={s.x} y1={s.yTop} x2={s.x} y2={s.yBottom} stroke="rgb(102, 102, 102)" strokeWidth={1} strokeDasharray="3,3" opacity={0.7}/>
                  <rect x={s.x - 8} y={s.yTop - 2} width={18} height={10} fill="rgb(102, 102, 102)" rx={2}/>
                  <text x={s.x} y={s.yTop + 6} textAnchor="middle" fontSize={7} fontWeight={700} fill="#fff" fontFamily="monospace">S</text>
                </g>
              ))}

              {/* Compare overlay — ghost polyline del 2º ticker, normalizado
                  para que su primer precio coincida con el primer precio del
                  ticker activo. Así se lee relativamente "quién subió más". */}
              {visibleSeries.compare && compareData?.monthly_prices?.length > 1 && pricesInRange.length > 1 && (() => {
                const first = pricesInRange[0].close;
                const cmpInRange = compareData.monthly_prices.filter(p => {
                  const y = parseInt(p.date.slice(0, 4), 10);
                  return y >= Math.floor(minXYear);
                });
                if (!cmpInRange.length) return null;
                const cmpFirst = cmpInRange[0].close;
                const scale = cmpFirst > 0 ? first / cmpFirst : 1;
                const pts = cmpInRange.map(p => {
                  const yr = parseFloat(p.date.slice(0, 4)) + parseFloat(p.date.slice(5, 7)) / 12;
                  return `${xScale(yr)},${yScale(p.close * scale)}`;
                }).join(' ');
                return (
                  <>
                    <polyline points={pts} fill="none" stroke="#9333ea" strokeWidth={1.8} strokeDasharray="4,3" opacity={0.75} strokeLinejoin="round" strokeLinecap="round"/>
                    <text x={PADL + chartW - 8} y={PADT + 14} textAnchor="end" fontSize={9} fontWeight={700} fill="#9333ea" fontFamily="monospace">
                      vs {compareData.ticker} (normalizado)
                    </text>
                  </>
                );
              })()}

              {/* Historical price line */}
              {visibleSeries.price && pricePts.length > 1 && (
                <polyline points={pricePoly} fill="none" stroke="var(--text-primary)" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round"/>
              )}

              {/* Current Valuation dots — uno por año fiscal al cierre */}
              {visibleSeries.currentVal && yearEndDots.map((d, i) => (
                <g key={'yed'+i}>
                  <title>
                    {d.year} · Precio ${d.price.toFixed(2)}
                    {d.pe != null ? ` · P/E ${d.pe.toFixed(1)}x` : ''}
                  </title>
                  <circle cx={d.x} cy={d.y} r={2.5} fill="#141726" stroke="#ffffff" strokeWidth={0.9}/>
                </g>
              ))}

              {/* (Dots rojos deshabilitados — FAST Graphs original usa
                  fair-value-ratio triángulos blancos, no dots rojos. La
                  sobrevaloración ya se ve por la línea de precio saliendo
                  por arriba del área verde.) */}

              {/* Dots amarillos Dividend POR — uno por año con dividendo,
                  tamaño proporcional al DPS. Estilo FAST Graphs series-6. */}
              {divPorDots.map((d, i) => (
                <g key={'dv'+i}>
                  <title>{d.year}{d.proj ? 'E' : ''} · DPS ${d.dps.toFixed(2)}{d.proj ? ' (estimado)' : ''}</title>
                  <circle cx={d.x} cy={d.y} r={d.r} fill="rgb(254, 210, 87)" stroke="var(--bg)" strokeWidth={0.8} opacity={d.proj ? 0.6 : 1}/>
                </g>
              ))}

              {/* Fair value curve UNIFICADA (histórico + proyección) — línea
                  naranja única continua estilo FAST Graphs. Antes pintábamos
                  fairHistPoly (sólida) + projFairPoly (rayada) y se notaba
                  la transición; ahora una sola polyline solid que cubre
                  todos los años, igual que FAST Graphs hace. */}
              {visibleSeries.fairValue && fairFullPts.length > 1 && (
                <polyline points={fairFullPoly} fill="none" stroke="#f59e0b" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.95}/>
              )}

              {/* Margin-of-error cone — shaded trapezoidal band around projection */}
              {showCones && projFairFull.length > 1 && (
                <polygon points={conePoly} fill="#64d2ff" fillOpacity={0.10} stroke="#64d2ff" strokeOpacity={0.3} strokeWidth={0.5}/>
              )}

              {/* Dots pequeños sobre la curva fair value (todos los años) */}
              {visibleSeries.fairValue && fairFullPts.map((pt, i) => (
                <circle key={'f'+i} cx={pt.x} cy={pt.yp} r={2} fill="#f59e0b" stroke="var(--bg)" strokeWidth={0.6}/>
              ))}

              {/* Dividend Yield (rojo) eje DERECHO */}
              {visibleSeries.yield && yieldPoints.length > 1 && (
                <polyline points={yieldLine} fill="none" stroke="#dc2626" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.9}/>
              )}
              {visibleSeries.yield && yieldPoints.map((p, i) => (
                <circle key={'yl'+i} cx={xScale(p.y)} cy={yldYScale(p.yld)} r={2} fill="#dc2626" stroke="var(--bg)" strokeWidth={0.5}/>
              ))}
              {/* Payout Ratio (amarillo) eje DERECHO */}
              {visibleSeries.payout && payoutPoints.length > 1 && (
                <polyline points={payoutLine} fill="none" stroke="#eab308" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.85}/>
              )}

              {/* EV/EBITDA (magenta) eje DERECHO — complemento a P/E.
                  Shaded area + línea + dots anuales. Escala 0x–30x. */}
              {visibleSeries.evEbitda && eveAreaPoly && (
                <polygon points={eveAreaPoly} fill="rgba(217,70,239,0.10)" stroke="none"/>
              )}
              {visibleSeries.evEbitda && eveSeries.length > 1 && (
                <polyline points={eveLine} fill="none" stroke="#d946ef" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.9}/>
              )}
              {visibleSeries.evEbitda && eveSeries.map((d, i) => (
                <circle key={'eve'+i} cx={xScale(d.year)} cy={eveYScale(d.value)} r={2.2} fill="#d946ef" stroke="var(--bg)" strokeWidth={0.5}/>
              ))}

              {/* Transaction markers — user buys/sells from cost_basis */}
              {visibleSeries.trades && tradeDots.map((t, i) => {
                const isBuy = t.tipo === 'BUY';
                const color = isBuy ? '#30d158' : '#ff453a';
                return (
                  <g key={'t'+i}>
                    <title>{t.tipo} {t.shares}@${t.price.toFixed(2)} · {t.date}</title>
                    {isBuy ? (
                      <polygon points={`${t.x},${t.yp-5} ${t.x-4},${t.yp+3} ${t.x+4},${t.yp+3}`} fill={color} stroke="var(--bg)" strokeWidth={1}/>
                    ) : (
                      <polygon points={`${t.x},${t.yp+5} ${t.x-4},${t.yp-3} ${t.x+4},${t.yp-3}`} fill={color} stroke="var(--bg)" strokeWidth={1}/>
                    )}
                  </g>
                );
              })}

              {/* Price Target: solo un tick pequeño al borde derecho (no línea
                  horizontal completa). FastGraphs original no pinta la línea
                  de PT, así mantenemos el chart limpio. */}
              {visibleSeries.priceTarget && priceTargetY != null && pricePts.length > 0 && (
                <g>
                  <line x1={PADL+chartW-14} y1={priceTargetY} x2={PADL+chartW} y2={priceTargetY} stroke="#bf5af2" strokeWidth={1.4} opacity={0.85}/>
                  <text x={PADL+chartW-18} y={priceTargetY+3} textAnchor="end" fontSize={8} fill="#bf5af2" fontFamily="monospace">PT ${priceTarget.toFixed(0)}</text>
                </g>
              )}

              {/* Current Valuation marker — círculo grande + label "HOY" + línea
                  horizontal punteada al precio actual. Estilo FAST Graphs series-9
                  "Current Valuation". */}
              {currentY != null && pricePts.length > 0 && (
                <>
                  <line x1={PADL} y1={currentY} x2={PADL+chartW} y2={currentY} stroke="#141726" strokeWidth={1} strokeDasharray="2,3" opacity={0.35}/>
                  {/* Halo exterior */}
                  <circle cx={pricePts[pricePts.length-1].x} cy={currentY} r={9} fill="rgba(20, 23, 38, 0.15)" stroke="none"/>
                  {/* Punto sólido — color según valor: rojo si sobre-valorado, verde si barato */}
                  <circle cx={pricePts[pricePts.length-1].x} cy={currentY}
                    r={6}
                    fill={cfg?.price != null && latestMetric != null && (cfg.price > latestMetric * activePE) ? '#bc0000' : '#2e8b57'}
                    stroke="#fff" strokeWidth={2.5}/>
                  {/* Label con precio */}
                  <g transform={`translate(${pricePts[pricePts.length-1].x+10}, ${currentY-12})`}>
                    <rect x={0} y={0} width={58} height={18} fill="rgba(20, 23, 38, 0.92)" rx={3}/>
                    <text x={29} y={12} textAnchor="middle" fontSize={10} fill="#fff" fontFamily="monospace" fontWeight={700}>HOY ${cfg?.price?.toFixed(2)}</text>
                  </g>
                </>
              )}

              {/* Buy Zone badge — feature 2 (arriba derecha, no tapa datos) */}
              {buyZonePrice && (
                <g transform={`translate(${W - PADR - 170}, ${PADT + 8})`}>
                  <rect x={0} y={0} width={162} height={40}
                    className={inBuyZone ? 'fast-buy-pulse' : undefined}
                    fill={inBuyZone ? 'rgba(46, 139, 87, 0.95)' : 'rgba(20, 23, 38, 0.88)'}
                    stroke={inBuyZone ? '#2e8b57' : '#b8860b'} strokeWidth={1.5} rx={6}/>
                  {inBuyZone ? (
                    <>
                      <text x={81} y={16} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff" fontFamily="monospace">✓ EN ZONA DE COMPRA</text>
                      <text x={81} y={32} textAnchor="middle" fontSize={10} fill="#fff" fontFamily="monospace">
                        ${cfg.price.toFixed(2)} &lt; umbral ${buyZonePrice.toFixed(2)}
                      </text>
                    </>
                  ) : (
                    <>
                      <text x={81} y={16} textAnchor="middle" fontSize={10} fontWeight={700} fill="#b8860b" fontFamily="monospace">
                        COMPRAR SI &lt; ${buyZonePrice.toFixed(2)}
                      </text>
                      <text x={81} y={32} textAnchor="middle" fontSize={9} fill="#aaa" fontFamily="monospace">
                        {distToBuyZone != null && `falta ${(distToBuyZone * 100).toFixed(0)}% · MoS ${(MOS_THRESHOLD * 100).toFixed(0)}%`}
                      </text>
                    </>
                  )}
                </g>
              )}

              {/* Hover crosshair + tooltip — feature 1 */}
              {hover && (
                <>
                  <line x1={hover.svgX} y1={PADT} x2={hover.svgX} y2={PADT+chartH}
                    stroke="#141726" strokeWidth={0.8} strokeDasharray="2,2" opacity={0.4}/>
                  <circle cx={hover.svgX} cy={hover.svgY} r={5}
                    fill="#141726" stroke="#fff" strokeWidth={2}/>
                  {/* Tooltip card — con tag Histórico/Proyectado + delta vs HOY.
                      Alto dinámico 118px cuando hay fila "vs HOY". */}
                  <g transform={`translate(${Math.min(hover.svgX + 12, W - PADR - 170)}, ${Math.max(PADT + 8, hover.svgY - 100)})`}>
                    <rect x={0} y={0} width={170}
                      height={(hover.vsToday != null ? 118 : 102) + (hover.tradeSummary ? 16 : 0)}
                      fill="rgba(20, 23, 38, 0.96)" stroke={hover.isProjected ? '#64d2ff' : '#b8860b'} strokeWidth={1} rx={6}/>
                    <text x={8} y={16} fontSize={11} fontWeight={700} fill={hover.isProjected ? '#64d2ff' : '#b8860b'} fontFamily="monospace">
                      {hover.isProjected ? '🔮' : '📊'} {hover.date || hover.year}
                    </text>
                    <text x={8} y={32} fontSize={10} fill="#fff" fontFamily="monospace">
                      Precio: <tspan fontWeight={700}>${hover.price?.toFixed(2)}</tspan>
                    </text>
                    {hover.vsToday != null && (
                      <text x={8} y={46} fontSize={10} fill="#aaa" fontFamily="monospace">
                        vs HOY: <tspan fill={hover.vsToday >= 0 ? '#30d158' : '#ff453a'} fontWeight={700}>
                          {hover.vsToday >= 0 ? '+' : ''}{(hover.vsToday * 100).toFixed(1)}%
                        </tspan>
                      </text>
                    )}
                    <text x={8} y={hover.vsToday != null ? 62 : 46} fontSize={10} fill="#fff" fontFamily="monospace">
                      Fair: <tspan fontWeight={700}>${hover.fair?.toFixed(2)}</tspan>
                      <tspan fill={hover.price < hover.fair ? '#30d158' : '#ff453a'} dx={4}>
                        ({hover.price < hover.fair ? '+' : ''}{((hover.fair/hover.price - 1) * 100).toFixed(0)}%)
                      </tspan>
                    </text>
                    <text x={8} y={hover.vsToday != null ? 76 : 60} fontSize={10} fill="#fff" fontFamily="monospace">
                      EPS: <tspan fontWeight={700}>${hover.eps?.toFixed(2) || '—'}</tspan>
                      {hover.pe != null && <tspan> · P/E {hover.pe.toFixed(1)}x</tspan>}
                    </text>
                    {hover.dps > 0 && (
                      <text x={8} y={hover.vsToday != null ? 90 : 74} fontSize={10} fill="#fff" fontFamily="monospace">
                        DPS: <tspan fontWeight={700}>${hover.dps.toFixed(2)}</tspan>
                        {hover.yield != null && <tspan fill="#b8860b"> · {(hover.yield * 100).toFixed(1)}%</tspan>}
                      </text>
                    )}
                    {hover.payout != null && (
                      <text x={8} y={hover.vsToday != null ? 104 : 88} fontSize={10} fill="#fff" fontFamily="monospace">
                        Payout: <tspan fontWeight={700}>{(hover.payout * 100).toFixed(0)}%</tspan>
                      </text>
                    )}
                    {hover.tradeSummary && (
                      <text x={8} y={hover.vsToday != null ? 118 : 102} fontSize={10} fontWeight={700} fill={hover.tradeSummary.tipo === 'BUY' ? '#30d158' : '#ff453a'} fontFamily="monospace">
                        {hover.tradeSummary.tipo === 'BUY' ? '▲' : '▼'} {hover.tradeSummary.totShares} @${hover.tradeSummary.avgPrice.toFixed(2)}
                      </text>
                    )}
                  </g>
                </>
              )}

              {/* Leyenda mini dentro del SVG — solo contador "X meses barato".
                  La leyenda clickeable/toggle se renderiza DEBAJO del SVG como
                  HTML para soportar checkboxes. */}
              {greenAreaPoly && (
                <text x={PADL+8} y={PADT+14} fontSize={9} fill="#2e8b57" fontFamily="monospace">
                  ▇ {cheapMonths}m dentro zona verde (barato o fair)
                </text>
              )}
            </svg>
          )}

          {/* ─── Leyenda INTERACTIVA — checkboxes clickeables con tooltip ──
              Click en cada chip para mostrar/ocultar esa serie del chart.
              Hover en el chip muestra el significado exacto.  */}
          {!loading && !error && (
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:10,padding:'8px 4px 4px',borderTop:'1px solid var(--subtle-border, rgba(20,23,38,0.08))'}}>
              {[
                { k:'price',       lbl:'Precio',              col:'#141726', swatch:'line',   help:'Línea negra: precio histórico mensual del stock.' },
                { k:'currentVal',  lbl:'Current Val.',        col:'#141726', swatch:'dots',   help:'Dots negros anuales sobre el precio: P/E real al cierre de cada año fiscal.' },
                { k:'normalPE',    lbl:`Normal P/E ${peMid?peMid.toFixed(1)+'x':''}`, col:'#4a90e2', swatch:'line', help:'Línea azul: EPS × P/E histórico medio 10y. Dónde cotizaría si estuviera a su múltiplo normal.' },
                { k:'fairValue',   lbl:`Fair ${activePE?activePE.toFixed(1)+'x':fgPE+'x'}`, col:'#f59e0b', swatch:'line', help:'Línea naranja: EPS × P/E custom (default 15x = Graham). Referencia conservadora — suelo absoluto para value investors estrictos. NO dispara buy-zone.' },
                { k:'fairArea',    lbl:`Zona earnings ${zonePE?zonePE.toFixed(1)+'x':''}`,  col:'rgba(46,139,87,0.55)', swatch:'block', help:'Área verde CLARA (estilo FAST Graphs): zona "valor justificado vs historial propio" (EPS × Normal P/E 10y del ticker). Si precio cae aquí = cotiza en su múltiplo normal → compra razonable para dividend growth / compounders.' },
                { k:'dpsArea',     lbl:'Zona dividendo',      col:'rgba(20,75,45,0.75)',  swatch:'block', help:'Área verde OSCURA: zona "valor justificado SOLO por dividendo" (DPS × Normal P/E). Si precio cae aquí = súper ganga, el div actual cubre toda la cotización.' },
                { k:'yield',       lbl:'Div Yield',           col:'#dc2626', swatch:'line',   help:'Línea roja eje derecho: dividend yield histórico anual (0–10%). Sube cuando el precio cae → señal de precio atractivo para dividend investor.' },
                { k:'payout',      lbl:'Payout Ratio',        col:'#eab308', swatch:'dash',   help:'Línea amarilla punteada eje derecho: payout ratio histórico (0–100%). <60% = saludable, >80% = riesgo.' },
                { k:'evEbitda',    lbl:`EV/EBITDA${eveSeries.length?' '+eveSeries[eveSeries.length-1].value.toFixed(1)+'x':''}`, col:'#d946ef', swatch:'line', help:'Línea magenta eje derecho (0x–30x): múltiplo EV/EBITDA histórico. Complemento a P/E que incorpora deuda neta y neutraliza D&A. Útil para empresas apalancadas o capital-intensivas. Cotización por debajo del promedio histórico = potencialmente barata.' },
                { k:'consensus',   lbl:'Consenso',            col:FORECAST_MODES.find(m=>m.id===forecastMode)?.color||'#64d2ff', swatch:'dash', help:`Proyección futura según modo ${forecastMode}. ${forecastMode==='consensus'?'EPS consenso analistas año a año':forecastMode==='cagr5'?'EPS crece al CAGR 5y histórico':forecastMode==='cagr10'?'EPS crece al CAGR 10y':forecastMode==='normal'?'Colapsa al P/E normal histórico':'Slider manual'}.` },
                { k:'priceTarget', lbl:`PT $${priceTarget?priceTarget.toFixed(0):'—'}`, col:'#bf5af2', swatch:'dash', help:`Price target consenso de ${history?.price_target?.analysts||'?'} analistas.` },
                { k:'trades',      lbl:`Trades (${tradeDots.length})`, col:'#30d158', swatch:'triangle', help:'▲ Buy verde · ▼ Sell rojo. Tus propias compras/ventas en cost_basis.' },
                { k:'recessions',  lbl:'Recesiones',          col:'rgba(80,80,90,0.5)',   swatch:'block', help:'Bandas grises: Dot-com 2001, GFC 2008-09, COVID 2020, Bear 2022. Contexto macro para drawdowns.' },
                { k:'compare',     lbl:compareData?`vs ${compareData.ticker}`:'Compare', col:'#9333ea', swatch:'dash', help:'Overlay 2º ticker normalizado al primer precio del main. Útil para KO vs PEP, etc.' },
              ].filter(item => item.k === 'compare' ? !!compareData : item.k === 'trades' ? tradeDots.length > 0 : item.k === 'consensus' ? projFairPts.length > 0 : true).map(item => {
                const on = visibleSeries[item.k];
                return (
                  <button key={item.k} onClick={() => toggleSeries(item.k)} title={item.help}
                    style={{
                      display:'inline-flex',alignItems:'center',gap:5,
                      padding:'4px 8px',borderRadius:5,
                      border:`1px solid ${on?'var(--border)':'var(--subtle-border)'}`,
                      background:on?'var(--card)':'transparent',
                      color:on?'var(--text-primary)':'var(--text-tertiary)',
                      opacity:on?1:0.45,
                      fontSize:10,fontWeight:600,fontFamily:'var(--fm)',
                      cursor:'pointer',textDecoration:on?'none':'line-through',
                      transition:'all .15s',
                    }}>
                    <span style={{width:14,height:8,display:'inline-block',position:'relative'}}>
                      {item.swatch === 'block' && <span style={{position:'absolute',inset:0,background:item.col,borderRadius:2}}/>}
                      {item.swatch === 'line' && <span style={{position:'absolute',top:3,left:0,right:0,height:2,background:item.col,borderRadius:1}}/>}
                      {item.swatch === 'dash' && <span style={{position:'absolute',top:3,left:0,right:0,height:2,background:`repeating-linear-gradient(90deg, ${item.col} 0 3px, transparent 3px 5px)`}}/>}
                      {item.swatch === 'dots' && <span style={{position:'absolute',top:2,left:1,width:4,height:4,background:item.col,borderRadius:'50%'}}><span style={{position:'absolute',left:6,width:4,height:4,background:item.col,borderRadius:'50%'}}/></span>}
                      {item.swatch === 'triangle' && <span style={{position:'absolute',top:1,left:3,width:0,height:0,borderLeft:'4px solid transparent',borderRight:'4px solid transparent',borderBottom:`6px solid ${item.col}`}}/>}
                    </span>
                    {item.lbl}
                  </button>
                );
              })}
              <button onClick={() => {
                  const allOn = Object.values(visibleSeries).every(v => v);
                  const next = {};
                  for (const k of Object.keys(visibleSeries)) next[k] = !allOn;
                  setVisibleSeries(next);
                }}
                title="Activa / desactiva todas las series"
                style={{padding:'4px 8px',borderRadius:5,border:'1px solid var(--gold)',background:'var(--gold-dim)',color:'var(--gold)',fontSize:10,fontWeight:700,fontFamily:'var(--fm)',cursor:'pointer',marginLeft:6}}>
                {Object.values(visibleSeries).every(v=>v) ? 'Ocultar todo' : 'Mostrar todo'}
              </button>
            </div>
          )}
        </div>

        {/* ── Sidebar — réplica EXACTA del orden de FAST Graphs ──────────
            Verificado contra ZTS y O (Realty Income) en app.fastgraphs.com.
            Orden FAST Graphs:
              1. FAST Facts (3 cajas grandes coloreadas):
                 Growth Rate (verde) · Fair Value Ratio (naranja) · Normal P/E (azul)
              2. Lista de métricas:
                 Blended P/E · EPS Yield · Div Yield · S&P Credit Rating ·
                 Market Cap · TEV · LT Debt/Capital · Country ·
                 GICS Sub-industry · Type
              3. (Mis extras debajo: Precio justo, Price Target, Backtest,
                 Future projection, Consenso ΔEPS, Beta)

            En modo REIT (AFFO): los labels P/E → P/AFFO y EPS Yield → AFFO Yield. */}
        <aside style={{display:'flex',flexDirection:'column',gap:10,minWidth:0}}>
          {(() => {
            // Computar variables locales que no estaban definidas
            const isAffoMode = isReit && (fgMode === 'fcfe' || fgMode === 'ocf');
            const peLabel = isAffoMode ? 'P/AFFO' : 'P/E';
            const yldLabel = isAffoMode ? 'AFFO Yield' : 'EPS Yield';
            // TEV ≈ Market Cap + Total Debt - Cash
            const lastF = fin[lastHistY] || {};
            // 2026-05-03: FMP migró su schema y profile.mktCap viene a None
            // para muchos tickers (e.g. ADP). Fallback chain:
            //   1. profile.mktCap (legacy)
            //   2. profile.marketCap (algunas variantes FMP)
            //   3. history.key_metrics_by_year[lastHistY].marketCap
            //   4. cfg.price * lastF.sharesOut (compute)
            // 2026-05-03 v2 fix: las distintas fuentes mezclan unidades.
            //   · profile.mktCap de FMP → raw dollars (e.g. 87,826,000,000)
            //   · keyMetrics[].marketCap → raw dollars
            //   · cfg.price * lastF.sharesOut → depende. lastF.sharesOut suele
            //     venir en MILLONES (e.g. 410). Si lo multiplicamos por price,
            //     sale en MILLONES de dólares (87,826M = $87.8B), no raw.
            // Helper: normaliza siempre a RAW dollars para que /1e9 funcione.
            // Si valor < 1e7 lo asumimos en millions y lo escalamos × 1e6.
            const _toRawDollars = (v) => v ? (v < 1e7 ? v * 1e6 : v) : 0;
            const mktCap = (() => {
              if (profile.mktCap) return _toRawDollars(profile.mktCap);
              if (profile.marketCap) return _toRawDollars(profile.marketCap);
              const km = history?.key_metrics_by_year?.[lastHistY];
              if (km?.marketCap) return _toRawDollars(km.marketCap);
              if (cfg?.price > 0 && lastF.sharesOut > 0) {
                // sharesOut de FMP income.weightedAverageShsOut viene en raw count
                // (e.g. 410,000,000). Pero algunas variantes lo dan en millones.
                const sh = lastF.sharesOut < 1e7 ? lastF.sharesOut * 1e6 : lastF.sharesOut;
                return cfg.price * sh;
              }
              return 0;
            })();
            const totalDebt = _toRawDollars(lastF.totalDebt);
            const cash = _toRawDollars(lastF.cash);
            const tev = mktCap > 0 ? mktCap + totalDebt - cash : null;
            const fmtB = (v) => v == null ? '—' : `$${(v/1e9).toFixed(2)}B`;
            // Type — instrumento. FMP profile.type or fallback heuristic.
            const instrumentType = (() => {
              if (profile.type) return profile.type.toUpperCase();
              if (profile.isEtf || profile.isFund) return 'ETF';
              return 'SHARE';
            })();
            // GICS sub-industry — FMP nos da industry, no GICS sub. Lo más
            // cercano. Para REITs FAST muestra "Retail REITs", "Apartment
            // REITs" etc. Nuestro `profile.industry` ya tiene formato similar.
            const gicsSub = profile.industry || profile.sector || '—';
            return <>
              {/* ── 1. FAST Facts — 3 cajas top (réplica FAST Graphs) ── */}
              <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:10}}>
                <div style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.5,textTransform:'uppercase',marginBottom:8}}>FAST Facts</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                  {/* Growth Rate (verde) */}
                  <div style={{padding:'8px 6px',background:'rgba(48,209,88,.10)',border:'1px solid rgba(48,209,88,.25)',borderRadius:8,textAlign:'center'}}>
                    <div style={{fontSize:13,fontWeight:800,color:'#30d158',fontFamily:'var(--fm)',lineHeight:1.1}}>
                      {metricCAGR != null ? (metricCAGR*100).toFixed(2)+'%' : '—'}
                    </div>
                    <div style={{fontSize:8,color:'var(--text-tertiary)',marginTop:3,fontFamily:'var(--fm)'}}>Growth Rate</div>
                  </div>
                  {/* Fair Value Ratio (naranja) */}
                  <div style={{padding:'8px 6px',background:'rgba(255,159,10,.10)',border:'1px solid rgba(255,159,10,.25)',borderRadius:8,textAlign:'center'}}>
                    <div style={{fontSize:13,fontWeight:800,color:'#ff9f0a',fontFamily:'var(--fm)',lineHeight:1.1}}>
                      {fgPE.toFixed(2)}x
                    </div>
                    <div style={{fontSize:8,color:'var(--text-tertiary)',marginTop:3,fontFamily:'var(--fm)'}}>Fair Value Ratio</div>
                  </div>
                  {/* Normal P/E or P/AFFO (azul) */}
                  <div style={{padding:'8px 6px',background:'rgba(74,144,226,.10)',border:'1px solid rgba(74,144,226,.25)',borderRadius:8,textAlign:'center'}}>
                    <div style={{fontSize:13,fontWeight:800,color:'#4a90e2',fontFamily:'var(--fm)',lineHeight:1.1}}>
                      {isAffoMode ? '—' : (history?.avg_pe_10y ? history.avg_pe_10y.toFixed(2)+'x' : '—')}
                    </div>
                    <div style={{fontSize:8,color:'var(--text-tertiary)',marginTop:3,fontFamily:'var(--fm)'}}>Normal {peLabel} Ratio</div>
                  </div>
                </div>
              </div>

              {/* ── 2. Lista plana — orden EXACTO FAST Graphs ── */}
              <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:12}}>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <MetricRow label={`Blended ${peLabel}`} value={blendedPE ? blendedPE.toFixed(2)+'x' : '—'} color="var(--gold)"/>
                  <MetricRow label={yldLabel} value={epsYield != null ? fP(epsYield) : '—'}/>
                  <MetricRow label="Div Yield" value={divYield != null ? fP(divYield) : '—'} color="var(--gold)"/>
                  <MetricRow label="S&P Credit Rating" value={history?.rating?.overall || '—'}/>
                  <MetricRow label="Market Cap" value={fmtB(mktCap)}/>
                  <MetricRow label="TEV" value={fmtB(tev)} small/>
                  <MetricRow label="LT Debt/Capital" value={debtCap != null ? fP(debtCap) : '—'}/>
                  <MetricRow label="Country" value={profile.country || '—'}/>
                  <MetricRow label="GICS Sub-industry" value={gicsSub} small/>
                  <MetricRow label="Type" value={instrumentType}/>
                </div>
              </div>

              {/* ── 3. EXTRAS A&R — debajo de la réplica FAST Graphs ── */}
              <div style={{background:'rgba(200,164,78,.04)',border:'1px solid rgba(200,164,78,.15)',borderRadius:14,padding:12}}>
                <div style={{fontSize:9,color:'var(--gold)',fontFamily:'var(--fm)',letterSpacing:.5,textTransform:'uppercase',marginBottom:8}}>+ Extras A&R</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <MetricRow label="Fair Value $" value={fC(fairValue)} color="var(--gold)"/>
                  <MetricRow label="Margen vs Fair" value={mosVsFair != null ? fP(mosVsFair) : '—'} color={mosVsFair && mosVsFair > 0.15 ? '#30d158' : mosVsFair && mosVsFair > 0 ? 'var(--gold)' : '#ff453a'}/>
                  <MetricRow label="Price Target" value={priceTarget ? fC(priceTarget) + (history?.price_target?.analysts ? ` (${history.price_target.analysts})` : '') : '—'} color="#bf5af2"/>
                  <MetricRow label="Precio futuro proj." value={fC(futureFair)} color="#64d2ff"/>
                  <MetricRow label="Retorno anual impl." value={futureReturn != null ? fP(futureReturn) : '—'} color={futureReturn && futureReturn > 0.10 ? '#30d158' : futureReturn && futureReturn > 0.05 ? 'var(--gold)' : '#ff453a'}/>
                  <MetricRow label="Consenso ΔEPS" value={consensusImpliedGrowth != null ? fP(consensusImpliedGrowth) : '—'} color={consensusImpliedGrowth && consensusImpliedGrowth > 0.08 ? '#30d158' : '#64d2ff'}/>
                  <MetricRow label="Beta" value={profile.beta != null ? profile.beta.toFixed(2) : '—'}/>
                </div>
              </div>

              {/* Backtest — caja propia (extra A&R, sigue separada porque tiene controles 5/10/15/20y) */}
              {backtest && (
                <div style={{background:'rgba(200,164,78,.04)',border:'1px solid rgba(200,164,78,.15)',borderRadius:14,padding:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
                    <div style={{fontSize:9,color:'var(--gold)',fontFamily:'var(--fm)',letterSpacing:.5,textTransform:'uppercase'}}>+ Backtest A&R</div>
                    <div style={{display:'flex',gap:2}}>
                      {[5, 10, 15, 20].map(y => (
                        <button key={y} onClick={()=>setBacktestYears(y)}
                          style={{padding:'2px 6px',fontSize:8,fontWeight:700,borderRadius:3,border:`1px solid ${backtestYears===y?'var(--gold)':'var(--border)'}`,background:backtestYears===y?'var(--gold-dim)':'transparent',color:backtestYears===y?'var(--gold)':'var(--text-secondary)',cursor:'pointer',fontFamily:'var(--fm)'}}>
                          {y}y
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:'var(--text-secondary)',fontFamily:'var(--fm)',lineHeight:1.4,marginBottom:4}}>
                    Si compraste en <strong style={{color:'var(--text-primary)'}}>{backtest.startDate.slice(0,7)}</strong> @${backtest.startPrice.toFixed(2)}:
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontFamily:'var(--fm)',marginBottom:3}}>
                    <span style={{color:'var(--text-tertiary)'}}>CAGR</span>
                    <span style={{fontWeight:700,color:backtest.cagr > 0.1 ? '#30d158' : backtest.cagr > 0.03 ? 'var(--gold)' : '#ff453a'}}>
                      {(backtest.cagr * 100).toFixed(1)}%/año
                    </span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontFamily:'var(--fm)',marginBottom:3}}>
                    <span style={{color:'var(--text-tertiary)'}}>Total</span>
                    <span style={{fontWeight:700,color:backtest.totalReturn > 0 ? '#30d158' : '#ff453a'}}>
                      {(backtest.totalReturn * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontFamily:'var(--fm)'}}>
                    <span style={{color:'var(--text-tertiary)'}}>Div acum.</span>
                    <span style={{fontWeight:700,color:'var(--gold)'}}>${backtest.divsAccum.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </>;
          })()}
        </aside>
      </div>
      )}{/* /innerTab summary */}

      {/* ─── TABLA ANUAL — en Summary (estilo FAST Graphs, debajo del chart) ──
          Filas dinámicas según `visibleRows`. Chips de toggle agrupados en
          3 categorías (Crecimiento / Valoración / Dividendo). Cada usuario
          arma su propia vista; persiste en localStorage por ticker. */}
      {innerTab === 'summary' && !loading && !error && tableRows.length > 0 && (
        <div style={{marginTop:14,background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14,overflowX:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,flexWrap:'wrap',gap:8}}>
            <div style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.5,textTransform:'uppercase'}}>Histórico anual · {tableRows.length} años · selecciona filas ↓</div>
            <button onClick={() => setVisibleRows(DEFAULT_TABLE_ROWS)}
              style={{padding:'3px 10px',fontSize:9,fontWeight:700,borderRadius:4,border:'1px solid var(--border)',background:'transparent',color:'var(--text-secondary)',cursor:'pointer',fontFamily:'var(--fm)'}}
              title="Restaurar filas por defecto">
              ↺ Reset
            </button>
          </div>

          {/* Chips toggle — filas disponibles agrupadas */}
          <div style={{display:'flex',flexWrap:'wrap',gap:10,marginBottom:12,paddingBottom:10,borderBottom:'1px solid var(--subtle-border, rgba(20,23,38,0.06))'}}>
            {['growth','valuation','dividend'].map(group => {
              const items = TABLE_ROW_REGISTRY.filter(r => r.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} style={{display:'flex',flexWrap:'wrap',gap:4,alignItems:'center'}}>
                  <span style={{fontSize:9,fontWeight:700,color:'var(--text-tertiary)',fontFamily:'var(--fm)',textTransform:'uppercase',letterSpacing:.5,marginRight:4}}>{TABLE_GROUP_LABELS[group]}</span>
                  {items.map(row => {
                    const on = visibleRows[row.key];
                    return (
                      <button key={row.key} onClick={() => toggleRow(row.key)}
                        title={row.label}
                        style={{padding:'3px 8px',fontSize:9.5,fontWeight:600,borderRadius:3,border:`1px solid ${on?row.color:'var(--border)'}`,background:on?row.color+'22':'transparent',color:on?row.color:'var(--text-tertiary)',cursor:'pointer',fontFamily:'var(--fm)',display:'inline-flex',alignItems:'center',gap:4}}>
                        <span style={{display:'inline-block',width:10,height:10,borderRadius:2,border:`1.5px solid ${on?row.color:'var(--border-hover)'}`,background:on?row.color:'transparent',position:'relative'}}>
                          {on && <span style={{position:'absolute',top:-2,left:1,fontSize:9,color:'#fff',fontWeight:900,lineHeight:1}}>✓</span>}
                        </span>
                        {row.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,fontFamily:'var(--fm)',minWidth:520}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)',color:'var(--text-tertiary)'}}>
                <th style={{textAlign:'left',padding:'4px 6px',position:'sticky',left:0,background:'var(--card)',zIndex:1}}>FY Date</th>
                {tableRows.map(r => <th key={r.y} style={{textAlign:'right',padding:'4px 6px'}}>{r.y}</th>)}
              </tr>
            </thead>
            <tbody>
              {TABLE_ROW_REGISTRY.filter(row => visibleRows[row.key]).map(row => (
                <tr key={row.key} style={{borderBottom:'1px solid var(--subtle-border, rgba(20,23,38,0.04))'}}>
                  <td style={{padding:'4px 6px',fontWeight:row.bold?700:500,color:row.color,position:'sticky',left:0,background:'var(--card)',zIndex:1}}>{row.label}</td>
                  {tableRows.map(r => {
                    let cellColor = 'var(--text-primary)';
                    if (row.colorize === 'diff') {
                      const v = r[row.key];
                      cellColor = v == null ? 'var(--text-tertiary)' : v > 0 ? '#30d158' : v < 0 ? '#ff453a' : 'var(--text-primary)';
                    } else if (row.colorize === 'fair') {
                      // ratio % vs fair: <100% = barato (verde), >115% = caro (rojo)
                      const v = r[row.key];
                      cellColor = v == null ? 'var(--text-tertiary)' : v < 1 ? '#30d158' : v > 1.15 ? '#ff453a' : 'var(--text-primary)';
                    } else if (row.colorize === 'payout') {
                      const v = r[row.key];
                      cellColor = v == null ? 'var(--text-tertiary)' : v > 0.8 ? '#ff453a' : v > 0.6 ? '#eab308' : '#30d158';
                    } else {
                      cellColor = r[row.key] == null ? 'var(--text-tertiary)' : row.color || 'var(--text-primary)';
                    }
                    return (
                      <td key={r.y} style={{textAlign:'right',padding:'4px 6px',color:cellColor,fontWeight:row.bold?700:400}}>{row.fmt(r)}</td>
                    );
                  })}
                </tr>
              ))}
              {TABLE_ROW_REGISTRY.filter(row => visibleRows[row.key]).length === 0 && (
                <tr><td colSpan={tableRows.length + 1} style={{padding:14,textAlign:'center',color:'var(--text-tertiary)',fontSize:10}}>
                  Selecciona al menos una fila arriba para ver datos ↑
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Histórico trimestral — beats/misses vs analistas. Queda en Historical. */}
      {innerTab === 'historical' && history?.earnings_scorecard?.quarters?.length > 0 && (
        <div style={{marginTop:14,background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14,overflowX:'auto'}}>
          <div style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.5,textTransform:'uppercase',marginBottom:8}}>Earnings trimestrales · beats vs consenso analistas</div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,fontFamily:'var(--fm)',minWidth:520}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)',color:'var(--text-tertiary)'}}>
                <th style={{textAlign:'left',padding:'4px 6px'}}>Trimestre</th>
                <th style={{textAlign:'right',padding:'4px 6px'}}>EPS estimado</th>
                <th style={{textAlign:'right',padding:'4px 6px'}}>EPS real</th>
                <th style={{textAlign:'right',padding:'4px 6px'}}>Sorpresa</th>
                <th style={{textAlign:'right',padding:'4px 6px'}}>Beat</th>
              </tr>
            </thead>
            <tbody>
              {(history.earnings_scorecard.quarters || []).map(q => (
                <tr key={q.date} style={{borderBottom:'1px solid var(--subtle-border, rgba(20,23,38,0.04))'}}>
                  <td style={{padding:'4px 6px',color:'var(--text-secondary)'}}>{q.date}</td>
                  <td style={{textAlign:'right',padding:'4px 6px'}}>{q.eps_est != null ? '$'+q.eps_est.toFixed(2) : '—'}</td>
                  <td style={{textAlign:'right',padding:'4px 6px'}}>{q.eps_act != null ? '$'+q.eps_act.toFixed(2) : '—'}</td>
                  <td style={{textAlign:'right',padding:'4px 6px',color:q.surprise_pct == null ? 'var(--text-tertiary)' : q.surprise_pct >= 0 ? '#30d158' : '#ff453a',fontWeight:700}}>
                    {q.surprise_pct != null ? (q.surprise_pct > 0 ? '+' : '') + q.surprise_pct.toFixed(1) + '%' : '—'}
                  </td>
                  <td style={{textAlign:'right',padding:'4px 6px'}}>{q.beat === true ? '✅' : q.beat === false ? '❌' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Historical tab: incluir también splits para tener todo lo "pasado" junto */}
      {innerTab === 'historical' && history?.splits?.length > 0 && (
        <div style={{marginTop:12}}>
          <SplitsTable splits={history.splits} />
        </div>
      )}

      {/* Tendencias operativas — 4 mini-sparklines: EV/EBITDA, ROIC, FCF Yield,
          DPS Growth. Primeros 3 del backend (keyMetricsRaw). DPS growth derivado
          client-side del ratios_by_year. */}
      {innerTab === 'trends' && isNonFundamental(history) && (
        <div style={{marginTop:14,padding:40,textAlign:'center',background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,color:'var(--text-secondary)',fontSize:12}}>
          ETFs y fondos no tienen métricas operativas por acción. Cambia a un ticker individual para ver tendencias de EV/EBITDA, ROIC, FCF Yield.
        </div>
      )}
      {innerTab === 'trends' && history && !isNonFundamental(history) && (
        <div style={{marginTop:14,display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:10}}>
          <SparkCard label="EV/EBITDA" data={history.ev_ebitda_series} fmt={v => v.toFixed(1)+'x'} colorHi="#ff9500" colorLo="#30d158" hiIsBad/>
          <SparkCard label="ROIC" data={history.roic_series} fmt={v => (v*100).toFixed(1)+'%'} colorHi="#30d158" colorLo="#ff453a"/>
          <SparkCard label="FCF Yield" data={history.fcf_yield_series} fmt={v => (v*100).toFixed(1)+'%'} colorHi="#30d158" colorLo="#ff453a"/>
          <SparkCard label="DPS Growth YoY" data={(() => {
            const years = Object.keys(history.ratios_by_year || {}).map(Number).filter(Number.isFinite).sort();
            const out = [];
            for (let i = 1; i < years.length; i++) {
              const cur = history.ratios_by_year[years[i]]?.dps;
              const prev = history.ratios_by_year[years[i-1]]?.dps;
              if (Number.isFinite(cur) && Number.isFinite(prev) && prev > 0) {
                out.push({ year: years[i], value: (cur - prev) / prev });
              }
            }
            return out;
          })()} fmt={v => (v*100).toFixed(1)+'%'} colorHi="#30d158" colorLo="#ff453a" variant="bars"/>
          <SparkCard label="Shares Outstanding"
            data={history.shares_out_series}
            fmt={v => v >= 1e9 ? (v/1e9).toFixed(2)+'B' : (v/1e6).toFixed(0)+'M'}
            colorHi="#30d158" colorLo="#ff453a" hiIsBad
            title="↓ = buybacks (buena gestión); ↑ = dilución"/>
        </div>
      )}

      {/* Forecasting detallado — tabla 5y con proyección consensus → precio
          @ fair value (15x custom) y @ Normal P/E. */}
      {innerTab === 'forecasting' && history && consensusAvailable && (
        <ForecastingPanel
          estimatesByYear={estimatesByYear}
          estimateYears={estimateYears}
          activePE={activePE}
          normalPE={history.avg_pe_10y || history.avg_pe_5y || activePE}
          currentPrice={cfg?.price}
          latestDPS={latestDPS}
        />
      )}
      {innerTab === 'forecasting' && (!history || !consensusAvailable) && (
        <div style={{marginTop:14,padding:40,textAlign:'center',background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,color:'var(--text-secondary)',fontSize:12}}>
          Sin estimates de consenso disponibles para este ticker.
        </div>
      )}

      {/* Row: FG Scores (radar) + Analyst Scorecard */}
      {innerTab === 'scorecard' && isNonFundamental(history) && (
        <div style={{marginTop:14,padding:40,textAlign:'center',background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,color:'var(--text-secondary)',fontSize:12}}>
          ETFs/fondos no tienen FG Scores ni earnings scorecard. Aplica solo a empresas con reporting trimestral.
        </div>
      )}
      {innerTab === 'scorecard' && history && !isNonFundamental(history) && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1.2fr)',gap:12,marginTop:14}}>
            <FGScoresPanel scores={history.fg_scores} />
            <AnalystScorecard scorecard={history.earnings_scorecard} />
          </div>
          {/* Fiscal fitness — Piotroski + Altman + Beneish */}
          {history.beneish_m && (
            <div style={{marginTop:12,background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fm)',textTransform:'uppercase',letterSpacing:.5}}>
                  Beneish M-Score
                </div>
                <div style={{fontSize:22,fontWeight:800,color:history.beneish_m.rating === 'clean' ? '#30d158' : history.beneish_m.rating === 'uncertain' ? 'var(--gold)' : '#ff453a',fontFamily:'var(--fm)'}}>
                  {history.beneish_m.score}
                </div>
              </div>
              <div style={{fontSize:10,color:'var(--text-secondary)',fontFamily:'var(--fm)',marginBottom:8,lineHeight:1.4}}>
                {history.beneish_m.rating === 'clean' ? '✓ CLEAN — earnings probablemente no manipulados (M < -2.22)' :
                 history.beneish_m.rating === 'uncertain' ? '⚠ UNCERTAIN — zona gris (-2.22 ≤ M ≤ -1.78)' :
                 '🚨 LIKELY MANIPULATOR — 8 ratios sugieren que earnings están inflados (M > -1.78)'}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:4,fontSize:9,fontFamily:'var(--fm)'}}>
                {Object.entries(history.beneish_m.components).map(([k, v]) => (
                  <MetricRow key={k} label={k.toUpperCase()} value={v != null ? v.toFixed(2) : '—'}/>
                ))}
              </div>
            </div>
          )}
          {(history.piotroski || history.altman_z) && (
            <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:12,marginTop:12}}>
              {history.piotroski && (
                <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fm)',textTransform:'uppercase',letterSpacing:.5}}>
                      Piotroski F-Score
                    </div>
                    <div style={{fontSize:22,fontWeight:800,color:history.piotroski.rating === 'strong' ? '#30d158' : history.piotroski.rating === 'medium' ? 'var(--gold)' : '#ff453a',fontFamily:'var(--fm)'}}>
                      {history.piotroski.score}<span style={{fontSize:12,color:'var(--text-tertiary)'}}>/9</span>
                    </div>
                  </div>
                  <div style={{fontSize:10,color:'var(--text-secondary)',fontFamily:'var(--fm)',marginBottom:8,lineHeight:1.4}}>
                    Fortaleza financiera fundamental (9 tests binarios) · {history.piotroski.rating.toUpperCase()}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:4,fontSize:9,fontFamily:'var(--fm)'}}>
                    {Object.entries(history.piotroski.components).map(([k, v]) => (
                      <div key={k} style={{display:'flex',alignItems:'center',gap:4,color:v ? '#30d158' : 'var(--text-tertiary)'}}>
                        <span>{v ? '✓' : '○'}</span>
                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{k.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {history.altman_z && (
                <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fm)',textTransform:'uppercase',letterSpacing:.5}}>
                      Altman Z-Score
                    </div>
                    <div style={{fontSize:22,fontWeight:800,color:history.profile?.isReit ? 'var(--text-tertiary)' : history.altman_z.rating === 'safe' ? '#30d158' : history.altman_z.rating === 'grey' ? 'var(--gold)' : '#ff453a',fontFamily:'var(--fm)'}}>
                      {history.altman_z.score}
                    </div>
                  </div>
                  {history.profile?.isReit ? (
                    <div style={{fontSize:10,color:'#f59e0b',fontFamily:'var(--fm)',marginBottom:8,lineHeight:1.4,padding:'6px 8px',background:'rgba(245,158,11,0.08)',borderRadius:6,border:'1px solid rgba(245,158,11,0.25)'}}>
                      ⚠️ Altman Z no aplica bien a REITs (estructura de capital y leverage diferentes). Ignorar el rating para este tipo de instrumento. Usa Piotroski + FG Scores como guía.
                    </div>
                  ) : (
                    <div style={{fontSize:10,color:'var(--text-secondary)',fontFamily:'var(--fm)',marginBottom:8,lineHeight:1.4}}>
                      Riesgo quiebra 2 años · {history.altman_z.rating === 'safe' ? '✓ SAFE (>2.99)' : history.altman_z.rating === 'grey' ? '⚠ GREY (1.81-2.99)' : '🚨 DISTRESS (<1.81)'}
                    </div>
                  )}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:6,fontSize:10,fontFamily:'var(--fm)'}}>
                    <MetricRow label="WC/TA × 1.2" value={(history.altman_z.components.wc_ta * 1.2).toFixed(2)}/>
                    <MetricRow label="RE/TA × 1.4" value={(history.altman_z.components.re_ta * 1.4).toFixed(2)}/>
                    <MetricRow label="EBIT/TA × 3.3" value={(history.altman_z.components.ebit_ta * 3.3).toFixed(2)}/>
                    <MetricRow label="MVE/TL × 0.6" value={(history.altman_z.components.mve_tl * 0.6).toFixed(2)}/>
                    <MetricRow label="Sales/TA × 1.0" value={(history.altman_z.components.sales_ta * 1.0).toFixed(2)}/>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ForecastingPanel({ estimatesByYear, estimateYears, activePE, normalPE, currentPrice, latestDPS }) {
  // Panel de proyección 5y — replica el chart secundario + tabla de FAST Graphs.
  // Por cada año con estimate del consenso, calcula:
  //   - EPS bajo / promedio / alto
  //   - Precio justo @ activePE (custom, típ. 15x)
  //   - Precio justo @ normalPE (10y avg)
  //   - Return anualizado si compras hoy y el P/E converge al fair.
  const years = estimateYears.slice(0, 5);
  if (!years.length || !currentPrice) return null;

  const rows = years.map((y, i) => {
    const est = estimatesByYear[y] || {};
    const yearsOut = i + 1;
    const priceAtActive = Number.isFinite(est.epsAvg) ? est.epsAvg * activePE : null;
    const priceAtNormal = Number.isFinite(est.epsAvg) ? est.epsAvg * normalPE : null;
    const priceLow = Number.isFinite(est.epsLow) ? est.epsLow * activePE : null;
    const priceHigh = Number.isFinite(est.epsHigh) ? est.epsHigh * activePE : null;
    const divIncluded = latestDPS ? latestDPS * yearsOut : 0;  // aproximación: DPS actual × años (sin crecimiento)
    const returnActive = priceAtActive ? Math.pow((priceAtActive + divIncluded) / currentPrice, 1 / yearsOut) - 1 : null;
    const returnNormal = priceAtNormal ? Math.pow((priceAtNormal + divIncluded) / currentPrice, 1 / yearsOut) - 1 : null;
    return { y, est, priceAtActive, priceAtNormal, priceLow, priceHigh, returnActive, returnNormal };
  });

  // Mini-chart bar EPS projection
  const W = 800, H = 180, P = 20;
  const allVals = rows.flatMap(r => [r.est.epsLow, r.est.epsAvg, r.est.epsHigh]).filter(Number.isFinite);
  if (!allVals.length) return null;
  const minV = Math.min(...allVals, 0) * 0.9;
  const maxV = Math.max(...allVals) * 1.1;
  const xStep = (W - 2 * P) / rows.length;
  const ys = (v) => P + (1 - (v - minV) / (maxV - minV || 1)) * (H - 2 * P);

  const fmtPct = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  const fmtUSD = (v) => v == null ? '—' : '$' + v.toFixed(2);

  return (
    <div style={{marginTop:14,background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fm)',textTransform:'uppercase',letterSpacing:.5}}>
          Forecasting · {years.length} años de consenso
        </div>
        <div style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)'}}>
          Precio hoy ${currentPrice.toFixed(2)} · P/E activo {activePE?.toFixed(1)}x · Normal P/E {normalPE?.toFixed(1)}x
        </div>
      </div>

      {/* Bar chart EPS estimates año a año */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{width:'100%',height:'auto',display:'block',marginBottom:10}}>
        <rect x={0} y={0} width={W} height={H} fill="var(--chart-bg, #faf9f5)" rx={4}/>
        {rows.map((r, i) => {
          const cx = P + i * xStep + xStep / 2;
          const barW = Math.max(xStep * 0.25, 8);
          const epsLow = r.est.epsLow, epsAvg = r.est.epsAvg, epsHigh = r.est.epsHigh;
          if (!Number.isFinite(epsAvg)) return null;
          const yAvg = ys(epsAvg);
          const yLow = Number.isFinite(epsLow) ? ys(epsLow) : yAvg;
          const yHigh = Number.isFinite(epsHigh) ? ys(epsHigh) : yAvg;
          return (
            <g key={r.y}>
              {/* Whisker high-low */}
              {Number.isFinite(epsHigh) && Number.isFinite(epsLow) && (
                <>
                  <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke="#64d2ff" strokeWidth={1.2}/>
                  <line x1={cx-5} y1={yHigh} x2={cx+5} y2={yHigh} stroke="#64d2ff" strokeWidth={1.2}/>
                  <line x1={cx-5} y1={yLow} x2={cx+5} y2={yLow} stroke="#64d2ff" strokeWidth={1.2}/>
                </>
              )}
              {/* Bar avg */}
              <rect x={cx - barW/2} y={yAvg} width={barW} height={H - P - yAvg} fill="#4a90e2" opacity={0.75} rx={2}/>
              <text x={cx} y={yAvg - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--text-primary)" fontFamily="monospace">
                ${epsAvg.toFixed(2)}
              </text>
              <text x={cx} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-secondary)" fontFamily="monospace">
                {r.y}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tabla 5y */}
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,fontFamily:'var(--fm)',minWidth:520}}>
        <thead>
          <tr style={{borderBottom:'1px solid var(--border)',color:'var(--text-tertiary)'}}>
            <th style={{textAlign:'left',padding:'4px 6px'}}>Año</th>
            <th style={{textAlign:'right',padding:'4px 6px'}}>EPS bajo</th>
            <th style={{textAlign:'right',padding:'4px 6px'}}>EPS avg</th>
            <th style={{textAlign:'right',padding:'4px 6px'}}>EPS alto</th>
            <th style={{textAlign:'right',padding:'4px 6px',color:'#f59e0b'}}>Precio @ {activePE?.toFixed(1)}x</th>
            <th style={{textAlign:'right',padding:'4px 6px',color:'#4a90e2'}}>Precio @ {normalPE?.toFixed(1)}x</th>
            <th style={{textAlign:'right',padding:'4px 6px',color:'#f59e0b'}}>CAGR @ {activePE?.toFixed(1)}x</th>
            <th style={{textAlign:'right',padding:'4px 6px',color:'#4a90e2'}}>CAGR @ Normal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.y} style={{borderBottom:'1px solid var(--subtle-border, rgba(20,23,38,0.04))'}}>
              <td style={{padding:'4px 6px',fontWeight:700,color:'var(--text-primary)'}}>{r.y}</td>
              <td style={{textAlign:'right',padding:'4px 6px',color:'var(--text-tertiary)'}}>{fmtUSD(r.est.epsLow)}</td>
              <td style={{textAlign:'right',padding:'4px 6px',color:'var(--text-primary)',fontWeight:700}}>{fmtUSD(r.est.epsAvg)}</td>
              <td style={{textAlign:'right',padding:'4px 6px',color:'var(--text-tertiary)'}}>{fmtUSD(r.est.epsHigh)}</td>
              <td style={{textAlign:'right',padding:'4px 6px',color:'#f59e0b',fontWeight:700}}>{fmtUSD(r.priceAtActive)}</td>
              <td style={{textAlign:'right',padding:'4px 6px',color:'#4a90e2',fontWeight:700}}>{fmtUSD(r.priceAtNormal)}</td>
              <td style={{textAlign:'right',padding:'4px 6px',color:r.returnActive == null ? 'var(--text-tertiary)' : r.returnActive > 0.1 ? '#30d158' : r.returnActive > 0 ? '#f59e0b' : '#ff453a',fontWeight:700}}>
                {fmtPct(r.returnActive)}
              </td>
              <td style={{textAlign:'right',padding:'4px 6px',color:r.returnNormal == null ? 'var(--text-tertiary)' : r.returnNormal > 0.1 ? '#30d158' : r.returnNormal > 0 ? '#f59e0b' : '#ff453a',fontWeight:700}}>
                {fmtPct(r.returnNormal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{fontSize:8,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginTop:6,lineHeight:1.4}}>
        CAGR incluye div. acumulado aproximado (DPS actual × años, sin crecimiento). Bar chart = EPS consenso avg · whisker = rango high-low.
      </div>
    </div>
  );
}

function SparkCard({ label, data, fmt, colorHi = '#30d158', colorLo = '#ff453a', hiIsBad = false, variant = 'line' }) {
  // Mini-sparkline card — tendencia de una métrica por año.
  // `data`: [{year, value}]. `fmt` formatea el valor último. `hiIsBad` invierte
  // semántica (EV/EBITDA alto = caro, no bueno). `variant` line | bars.
  // Hover state: al pasar mouse sobre la gráfica, reemplaza el "último valor"
  // por el año+valor del punto más cercano al cursor.
  const [hoverIdx, setHoverIdx] = useState(null);
  if (!Array.isArray(data) || data.length < 2) return null;
  const values = data.map(d => d.value);
  const last = values[values.length - 1];
  const first = values[0];
  const change = first !== 0 ? (last - first) / Math.abs(first) : 0;
  const isGood = hiIsBad ? change < 0 : change > 0;
  const trendColor = isGood ? colorHi : colorLo;

  const W = 220, H = 54, P = 4;
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 0);
  const range = (maxV - minV) || 1;
  const xs = (i) => P + (i / Math.max(values.length - 1, 1)) * (W - 2 * P);
  const ys = (v) => P + (1 - (v - minV) / range) * (H - 2 * P);
  const yZero = ys(0);  // baseline para bars positivas/negativas

  // Hover handler — encuentra el índice más cercano al X del cursor.
  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX ?? e.touches?.[0]?.clientX) - rect.left) / rect.width * W;
    const idx = Math.round(((relX - P) / (W - 2 * P)) * (values.length - 1));
    setHoverIdx(Math.max(0, Math.min(idx, values.length - 1)));
  };

  const displayIdx = hoverIdx != null ? hoverIdx : values.length - 1;
  const displayValue = values[displayIdx];
  const displayYear = data[displayIdx].year;

  return (
    <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,padding:12,minWidth:0}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:4,gap:8}}>
        <span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',textTransform:'uppercase',letterSpacing:.3}}>
          {label} {hoverIdx != null && <span style={{color:trendColor,fontWeight:700}}>· {displayYear}</span>}
        </span>
        <span style={{fontSize:10,fontWeight:700,color:trendColor,fontFamily:'var(--fm)'}}>
          {change > 0 ? '+' : ''}{(change * 100).toFixed(0)}%
        </span>
      </div>
      <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fm)',marginBottom:4}}>
        {fmt(displayValue)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{width:'100%',height:40,display:'block',cursor:'crosshair'}}
        onMouseMove={handleMove} onTouchMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)} onTouchEnd={() => setHoverIdx(null)}>
        {variant === 'bars' ? (
          <>
            {/* Baseline 0% — línea horizontal sutil cuando hay valores negativos */}
            {minV < 0 && <line x1={P} y1={yZero} x2={W-P} y2={yZero} stroke="var(--text-tertiary)" strokeWidth={0.5} strokeDasharray="2,2" opacity={0.4}/>}
            {values.map((v, i) => {
              const barColor = v >= 0 ? colorHi : colorLo;
              const barW = Math.max((W - 2*P) / values.length - 1, 1);
              const barX = xs(i) - barW / 2;
              const barY = v >= 0 ? ys(v) : yZero;
              const barH = Math.abs(ys(v) - yZero);
              return <rect key={i} x={barX} y={barY} width={barW} height={barH} fill={barColor} opacity={hoverIdx === i ? 1 : 0.85}/>;
            })}
          </>
        ) : (
          <>
            <polygon points={`${xs(0)},${H - P} ${values.map((v, i) => `${xs(i)},${ys(v)}`).join(' ')} ${xs(values.length - 1)},${H - P}`} fill={trendColor} fillOpacity={0.14} stroke="none"/>
            <polyline points={values.map((v, i) => `${xs(i)},${ys(v)}`).join(' ')} fill="none" stroke={trendColor} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"/>
            <circle cx={xs(displayIdx)} cy={ys(displayValue)} r={hoverIdx != null ? 3.2 : 2.2} fill={trendColor} stroke="var(--card)" strokeWidth={0.8}/>
            {hoverIdx != null && <line x1={xs(hoverIdx)} y1={P} x2={xs(hoverIdx)} y2={H-P} stroke={trendColor} strokeWidth={0.8} strokeDasharray="2,2" opacity={0.6}/>}
          </>
        )}
      </svg>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginTop:2}}>
        <span>{data[0].year}</span>
        <span>{data[data.length - 1].year}</span>
      </div>
    </div>
  );
}

function MetricRow({ label, value, color, small }) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:6}}>
      <span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',textTransform:'uppercase',letterSpacing:.3}}>{label}</span>
      <span style={{fontSize:small ? 9 : 11,fontWeight:700,color:color || 'var(--text-primary)',fontFamily:'var(--fm)',textAlign:'right',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{height:1,background:'var(--border)',opacity:0.4}}/>;
}
