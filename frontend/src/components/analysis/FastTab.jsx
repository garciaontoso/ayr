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
import { n, fP, fC, div } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';
import AnalystScorecard from './AnalystScorecard.jsx';
import FGScoresPanel from './FGScoresPanel.jsx';
import SplitsTable from './SplitsTable.jsx';

const RANGES = [
  { id: 'MAX', years: 99 },
  { id: '20Y', years: 20 },
  { id: '15Y', years: 15 },
  { id: '10Y', years: 10 },
  { id: '5Y',  years: 5 },
  { id: '3Y',  years: 3 },
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
  const { DATA_YEARS, cfg, comp, fgGrowth, fgMode, fgPE, fgProjYears, fin,
    setFgGrowth, setFgMode, setFgPE, setFgProjYears } = useAnalysis();

  const ticker = cfg?.ticker || '';
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('MAX');
  const [peMode, setPeMode] = useState('custom'); // custom | normal_5y | normal_10y | normal_all
  const [forecastMode, setForecastMode] = useState('consensus'); // consensus | manual | cagr5 | cagr10 | normal
  const [trades, setTrades] = useState([]);
  const [showTrades, setShowTrades] = useState(true);
  const [showCones, setShowCones] = useState(true);  // margin-of-error cones ±margin_1y/2y
  const [tablePeriod, setTablePeriod] = useState('yearly'); // yearly | quarterly
  const [showRecessions, setShowRecessions] = useState(true);  // bandas de recesiones
  const [hover, setHover] = useState(null);  // {x, y, date, price, eps, pe, fair, yield, payout} o null
  const hoverRafRef = useRef(null);  // rAF id para throttle del onMouseMove → evita sobrecarga

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
  const fairValues = [...validHist.map(d => d.val * activePE), ...projData.map(d => d.val && d.val > 0 ? d.val * activePE : null)].filter(v => v != null && v > 0);
  const prices = pricesInRange.map(p => p.close);
  const allY = [...fairValues, ...prices, cfg?.price, history?.price_target?.consensus].filter(v => Number.isFinite(v) && v > 0);
  const sortedY = allY.slice().sort((a, b) => a - b);
  const percentile = (p) => sortedY.length ? sortedY[Math.min(sortedY.length - 1, Math.floor(sortedY.length * p))] : 0;
  const p95 = percentile(0.95);
  const p05 = percentile(0.05);
  const rawMax = sortedY.length ? p95 * 1.15 : 100;
  const rawMin = sortedY.length ? Math.max(0, p05 * 0.80) : 0;

  // Chart dims — más ancho y alto para aproximarse al look FAST Graphs
  // original (ocupan todo el ancho del contenido visible). PADR ampliado a 60
  // para acomodar el eje derecho (yield % y payout %).
  const W = 1400, H = 560;
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

  // Fair value historical line (metric × activePE).
  // Clip a [rawMin, rawMax] para que años outlier (spike × PE) no salgan
  // del chart y rompan visualmente la curva.
  const clipY = (v) => Math.max(rawMin, Math.min(v, rawMax));
  const fairHistPts = validHist.map(d => ({
    x: xScale(d.y),
    yp: yScale(clipY(d.val * activePE)),
  }));
  const fairHistPoly = fairHistPts.map(p => `${p.x},${p.yp}`).join(' ');

  // Fair value projection (dashed) — use activePE EXCEPT in "normal" mode which collapses to avg P/E
  const projMultiplier = forecastMode === 'normal' && (history?.avg_pe_10y || history?.avg_pe_5y || history?.avg_pe_all)
    ? (history.avg_pe_10y || history.avg_pe_5y || history.avg_pe_all)
    : activePE;
  const projFairPts = projData.filter(d => d.val != null).map(d => ({
    x: xScale(d.y),
    yp: yScale(d.val * projMultiplier),
    val: d.val * projMultiplier,
  }));
  // Connect from last hist point
  const projFairFull = validHist.length ? [{ x: xScale(lastHistY), yp: yScale(lastVal * projMultiplier), val: lastVal * projMultiplier }, ...projFairPts] : projFairPts;
  const projFairPoly = projFairFull.map(p => `${p.x},${p.yp}`).join(' ');

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
  const fairAreaPoly = fairAreaPts.map(p => `${p.x},${p.yp}`).join(' ');

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
    const e1 = getMetricExt(yr);
    const e2 = getMetricExt(yr + 1);
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
    const fairVal = m * activePE;
    const dps = interpDps(yrFrac);
    const divFairVal = dps * activePE;
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
      const fairVal = epsInterp * projMultiplier;
      const dps = epsInterp * latestPayoutRatio;
      const divFairVal = dps * projMultiplier;
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

  // Área verde clara: desde baseline hasta la curva de fair value (EPS × P/E).
  // Se extiende a través de la proyección (greenSamples = hist + proyección).
  const baseline = yScale(rawMin);
  const greenAreaPoly = greenSamples.length > 1
    ? [
        `${greenSamples[0].x},${baseline}`,
        ...greenSamples.map(s => `${s.x},${s.yFair}`),
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
  const peBandLine = (peMult) => peMult == null ? '' : validHist.map(d => ({
    x: xScale(d.y),
    yp: yScale(clipY(d.val * peMult)),
  })).map(p => `${p.x},${p.yp}`).join(' ');
  const bandLow = peBandLine(peLow);
  const bandMid = peBandLine(peMid);
  const bandHigh = peBandLine(peHigh);
  // ───────────────────────────────────────────────────────────────────────

  // Normal P/E reference line (if different from active)
  const normalPE = history?.avg_pe_10y || history?.avg_pe_5y || null;
  const showNormalRef = peMode !== 'normal_10y' && normalPE && normalPE !== activePE;
  const normalRefPts = showNormalRef ? validHist.map(d => ({
    x: xScale(d.y),
    yp: yScale(Math.max(d.val * normalPE, rawMin)),
  })) : [];
  const normalRefPoly = normalRefPts.map(p => `${p.x},${p.yp}`).join(' ');

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

  // Dividend overlay data
  const divHist = histYrs.map(y => ({ y, dps: getDpsExt(y), eps: getMetricExt(y) }))
    .filter(d => d.dps > 0 && d.y >= (firstPriceYear || 0));

  // Dots amarillos "Dividend POR" estilo FAST Graphs — siempre visibles
  // (independiente de showDiv). Posicionados EN LA CURVA DPS × P/E activo,
  // o sea al borde superior de la capa verde oscura. Esto coincide con el
  // chart original donde los yellow dots marcan el "dividend-backed value"
  // y quedan dentro de la zona verde oscura.
  const divPorDots = divHist.map(d => ({
    x: xScale(d.y),
    y: yScale(clipY(d.dps * activePE)),
    r: 3.2,
    dps: d.dps,
    year: d.y,
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
  // Yield: dps / price_at_year_end (aprox) · eje derecho 0–10%
  const yieldPoints = divHist.filter(d => priceByYear[d.y] > 0 && d.dps > 0).map(d => ({
    y: d.y,
    yld: d.dps / priceByYear[d.y],
  }));
  // Payout: dps/eps · eje derecho 0–100%
  const payoutPoints = divHist.filter(d => d.eps > 0 && d.dps > 0).map(d => ({
    y: d.y,
    pct: Math.min(d.dps / d.eps, 1.5),
  }));
  // Escala eje derecho común para ambas series (mapea % → y pixel).
  // Yield axis: 0–10% mapeado a top 50% del chart (invertido: 0% abajo, 10% arriba).
  // Payout axis: 0–100% mapeado al mismo rango visual (reutiliza eje derecho con segundo tick set).
  const YIELD_AXIS_MAX = 0.10;
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

  // Debug: compute ALL metrics for last year so user can see them side-by-side
  const lastF = fin[lastHistY];
  const soLast = lastF?.sharesOut;
  const allMetricValues = lastF ? {
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
  const fairValue = latestMetric ? latestMetric * activePE : null;
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
  const futureFair = futureMetric ? futureMetric * activePE : null;
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

  // Change/year table — EPS + Div + YoY % de ambos (estilo FAST Graphs
  // "FY Date / EPS / Chg/Yr / Div" con fila adicional de ∆ Div).
  const tableRows = validHist.map((d, i) => {
    const prev = i > 0 ? validHist[i - 1].val : null;
    const prevDiv = i > 0 ? validHist[i - 1].div : null;
    const chg = prev && prev !== 0 ? (d.val - prev) / prev : null;
    const chgDiv = prevDiv && prevDiv !== 0 && d.div ? (d.div - prevDiv) / prevDiv : null;
    return { y: d.y, val: d.val, chg, div: d.div, chgDiv };
  });

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
      `}</style>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:'0 0 4px',fontSize:20,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fd)'}}>⚡ FAST — Precio vs Valor</h2>
          <p style={{margin:0,fontSize:11,color:'var(--text-secondary)',lineHeight:1.45}}>
            Línea blanca = precio histórico mensual · Línea dorada = {METRIC_LABEL[fgMode] || 'EPS'} × {activePE ? activePE.toFixed(1)+'x' : fgPE+'x'} P/E · Punteada azul = proyección · Punto rojo = precio actual
          </p>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          {/* Metric dropdown */}
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            <span style={{fontSize:8,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:'.3px',textTransform:'uppercase'}}>Correlacionar con</span>
            <select value={fgMode} onChange={e=>setFgMode(e.target.value)}
              style={{padding:'6px 10px',borderRadius:8,border:'1px solid var(--gold)',background:'var(--gold-dim)',color:'var(--gold)',fontSize:11,fontWeight:600,fontFamily:'var(--fm)',cursor:'pointer',outline:'none',maxWidth:260}}>
              <optgroup label="Earnings">{METRIC_OPTIONS.filter(m=>m.group==='Earnings').map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              <optgroup label="Cash Flow">{METRIC_OPTIONS.filter(m=>m.group==='Cash Flow').map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              <optgroup label="Otras métricas">{METRIC_OPTIONS.filter(m=>m.group==='Otras').map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            </select>
          </div>
          {/* Yield + Payout ya son permanentes en el chart (estilo FAST Graphs). */}
          <button onClick={()=>setShowTrades(!showTrades)} style={{padding:'6px 12px',borderRadius:8,border:`1px solid ${showTrades?'#30d158':'var(--border)'}`,background:showTrades?'rgba(48,209,88,0.08)':'transparent',color:showTrades?'#30d158':'var(--text-secondary)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--fm)'}} title={`${trades.length} transacciones de este ticker`}>+Trades ({trades.length})</button>
        </div>
      </div>

      {/* Time range + PE mode controls */}
      <div style={{display:'flex',gap:4,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginRight:4,letterSpacing:.3}}>RANGO:</span>
        {RANGES.map(r => (
          <button key={r.id} onClick={()=>setRange(r.id)} style={{padding:'4px 10px',borderRadius:5,border:`1px solid ${range===r.id?'var(--gold)':'var(--border)'}`,background:range===r.id?'var(--gold-dim)':'transparent',color:range===r.id?'var(--gold)':'var(--text-secondary)',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'var(--fm)'}}>{r.id}</button>
        ))}
        <span style={{marginLeft:12,fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginRight:4,letterSpacing:.3}}>P/E REFERENCIA:</span>
        {[
          {id:'custom',lbl:`Custom (${fgPE}x)`},
          {id:'normal_5y',lbl:history?.avg_pe_5y?`Normal 5y (${history.avg_pe_5y.toFixed(1)}x)`:'Normal 5y'},
          {id:'normal_10y',lbl:history?.avg_pe_10y?`Normal 10y (${history.avg_pe_10y.toFixed(1)}x)`:'Normal 10y'},
          {id:'normal_all',lbl:history?.avg_pe_all?`Normal MAX (${history.avg_pe_all.toFixed(1)}x)`:'Normal MAX'},
        ].map(o => (
          <button key={o.id} onClick={()=>setPeMode(o.id)} style={{padding:'4px 10px',borderRadius:5,border:`1px solid ${peMode===o.id?'#64d2ff':'var(--border)'}`,background:peMode===o.id?'rgba(100,210,255,0.12)':'transparent',color:peMode===o.id?'#64d2ff':'var(--text-secondary)',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'var(--fm)'}}>{o.lbl}</button>
        ))}
      </div>

      {/* Per-metric comparison panel — muestra valores de TODAS las métricas para el último año.
          Permite ver de un vistazo cuánto cambia cada métrica y diagnosticar si algún campo
          falta en el cache de FMP (mostrará "—"). */}
      <div style={{marginBottom:10,background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
        <div style={{fontSize:8,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.5,textTransform:'uppercase',marginBottom:6}}>Valor por métrica — último año {lastHistY || ''} (click para seleccionar)</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(135px,1fr))',gap:6}}>
          {METRIC_OPTIONS.map(m => {
            const v = allMetricValues[m.id];
            const active = fgMode === m.id;
            return (
              <button key={m.id} onClick={()=>setFgMode(m.id)}
                style={{padding:'6px 8px',borderRadius:6,border:`1px solid ${active?'var(--gold)':'var(--border)'}`,background:active?'var(--gold-dim)':'transparent',color:active?'var(--gold)':'var(--text-secondary)',textAlign:'left',cursor:'pointer',fontFamily:'var(--fm)',fontSize:9}}>
                <div style={{fontSize:8,opacity:.7}}>{m.label.split(' ')[0]}{m.label.includes('(') ? ' '+m.label.split('(')[1].replace(')','') : ''}</div>
                <div style={{fontSize:14,fontWeight:800,color:active?'var(--gold)':v!=null&&v!==0?'var(--text-primary)':'var(--text-tertiary)',marginTop:2}}>
                  {v != null && v !== 0 && Number.isFinite(v) ? '$'+v.toFixed(2) : '—'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

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
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
          <div style={{fontSize:8,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',fontFamily:'var(--fm)',letterSpacing:.5}}>Último valor</div>
          <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fm)',marginTop:2}}>{fC(latestMetric)}</div>
        </div>
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
          <div style={{fontSize:8,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',fontFamily:'var(--fm)',letterSpacing:.5}}>Precio actual</div>
          <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fm)',marginTop:2}}>{fC(cfg?.price)}</div>
        </div>
      </div>

      {/* Main layout: chart a la izquierda + panel de métricas clave a la derecha,
          replicando la columna "Metrics" de FAST Graphs. En pantallas <1200px
          colapsa a 1 columna (sidebar debajo del chart). */}
      <div className="fast-chart-layout" style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 260px',gap:12,alignItems:'start'}}>
        {/* Chart */}
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14,minWidth:0}}>
          {loading && <div style={{padding:60,textAlign:'center',color:'var(--text-secondary)',fontSize:12}}>Cargando histórico de precio…</div>}
          {error && <div style={{padding:20,color:'#ff453a',fontSize:12}}>⚠ Error: {error}</div>}
          {!loading && !error && (
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{display:'block',width:'100%',height:'auto',touchAction:'pan-y'}}
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
                  setHover({
                    svgX: nearest.x, svgY: nearest.yPrice,
                    year: nearest.year, date: nearest.date,
                    price: nearest.priceVal, eps: f.eps, pe,
                    fair: nearest.fairValue, yield: divY, payout, dps: f.dps,
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
                  setHover({
                    svgX: nearest.x, svgY: nearest.yPrice,
                    year: nearest.year, date: nearest.date,
                    price: nearest.priceVal, eps: f.eps, pe,
                    fair: nearest.fairValue, yield: divY, payout, dps: f.dps,
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
              {[0, 0.02, 0.04, 0.06, 0.08, 0.10].map((y, i) => (
                <text key={'yaxR'+i} x={PADL+chartW+4} y={yldYScale(y)+3}
                  fontSize={8} fill="#dc2626" fontFamily="monospace" fontWeight={600} textAnchor="start">
                  {(y*100).toFixed(0)}%
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

              {/* Bandas de recesiones NBER + macro — feature 3. Grey translúcido detrás
                  de TODO para que no interfiera con áreas verdes/rojas ni líneas. */}
              {recessionBands.map((b, i) => (
                <g key={'rec'+i}>
                  <rect x={b.x1} y={PADT} width={b.x2 - b.x1} height={chartH}
                    fill="rgba(50, 50, 60, 0.18)" stroke="none"/>
                  <text x={(b.x1 + b.x2) / 2} y={PADT + chartH - 4} textAnchor="middle"
                    fontSize={8} fill="rgba(50, 50, 60, 0.7)" fontFamily="monospace" fontWeight={700}>
                    {b.label}
                  </text>
                </g>
              ))}

              {/* Valor justo — área verde sólida (estilo FAST Graphs). Desde el
                  baseline hasta la curva fair-value (EPS × P/E activo). UNA sola
                  capa — se eliminó la capa oscura "dividend-backed" que duplicaba
                  información ya visible en la línea amarilla de payout. */}
              {greenAreaPoly && (
                <polygon points={greenAreaPoly} fill="rgba(46, 139, 87, 0.55)" stroke="none"/>
              )}

              {/* Normal P/E line — línea azul CLARA continua (estilo FAST Graphs
                  series-4 "Normal PE"). Color #4a90e2 (azul cielo) para distinguirla
                  del precio negro y no confundir con el fondo. Sin dots gruesos —
                  la línea es suficiente. Es la señal más importante: precio si
                  la acción cotizara a su P/E histórico medio 10y. */}
              {bandMid && <polyline points={bandMid} fill="none" stroke="#4a90e2" strokeWidth={2.2} opacity={0.95} strokeLinejoin="round" strokeLinecap="round"/>}
              {bandMid && validHist.map((d, i) => peMid ? (
                <circle key={'npe'+i} cx={xScale(d.y)} cy={yScale(clipY(d.val * peMid))} r={2.2} fill="#4a90e2" stroke="var(--bg)" strokeWidth={0.6}/>
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

              {/* Historical price line — grueso como FAST Graphs para legibilidad
                  sobre las áreas de color */}
              {pricePts.length > 1 && (
                <polyline points={pricePoly} fill="none" stroke="var(--text-primary)" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round"/>
              )}

              {/* Current Valuation dots — uno por año fiscal al cierre, sobre
                  la línea de precio. Estilo FAST Graphs "series-9". Tamaño 2.5
                  para destacar sin tapar la línea. Tooltip con P/E real del
                  año (precio/EPS). */}
              {yearEndDots.map((d, i) => (
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
                  <title>{d.year} · DPS ${d.dps.toFixed(2)}</title>
                  <circle cx={d.x} cy={d.y} r={d.r} fill="rgb(254, 210, 87)" stroke="var(--bg)" strokeWidth={0.8}/>
                </g>
              ))}

              {/* Fair value curve (EPS × P/E custom, típicamente 15x) — línea
                  NARANJA continua tipo FAST Graphs "Fair Value Ratio". Es la
                  referencia de Graham's 15 — si el precio cae debajo está
                  estadísticamente barato. Línea nítida 2.2px para destacar
                  sobre el área verde. */}
              {fairHistPts.length > 1 && (
                <polyline points={fairHistPoly} fill="none" stroke="#f59e0b" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.95}/>
              )}

              {/* Margin-of-error cone — shaded trapezoidal band around projection */}
              {showCones && projFairFull.length > 1 && (
                <polygon points={conePoly} fill="#64d2ff" fillOpacity={0.10} stroke="#64d2ff" strokeOpacity={0.3} strokeWidth={0.5}/>
              )}

              {/* Projection fair value line (dashed) — color depends on forecastMode */}
              {projFairFull.length > 1 && (
                <polyline points={projFairPoly} fill="none" stroke={FORECAST_MODES.find(m=>m.id===forecastMode)?.color || '#64d2ff'} strokeWidth={2.5} strokeDasharray="5,3" strokeLinejoin="round" strokeLinecap="round"/>
              )}

              {/* Dots pequeños sobre la curva fair value — uno por año histórico,
                  tamaño reducido (r=2) para no competir con la línea naranja. */}
              {fairHistPts.map((pt, i) => (
                <circle key={'f'+i} cx={pt.x} cy={pt.yp} r={2} fill="#f59e0b" stroke="var(--bg)" strokeWidth={0.6}/>
              ))}

              {/* Dividend Yield (rojo) + Payout Ratio (amarillo) — eje DERECHO.
                  Estilo FAST Graphs series-6 "Dividends POR" (payout amarillo)
                  y series-7 "Dividend Yld" (yield rojo). Siempre visibles porque
                  son parte del patrón canónico de FAST Graphs — el usuario espera
                  verlos junto al chart principal, no detrás de un toggle. */}
              {yieldPoints.length > 1 && (
                <polyline points={yieldLine} fill="none" stroke="#dc2626" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.9}/>
              )}
              {yieldPoints.map((p, i) => (
                <circle key={'yl'+i} cx={xScale(p.y)} cy={yldYScale(p.yld)} r={2} fill="#dc2626" stroke="var(--bg)" strokeWidth={0.5}/>
              ))}
              {payoutPoints.length > 1 && (
                <polyline points={payoutLine} fill="none" stroke="#eab308" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.85}/>
              )}

              {/* Transaction markers — user buys/sells from cost_basis */}
              {tradeDots.map((t, i) => {
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
              {priceTargetY != null && pricePts.length > 0 && (
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
                  {/* Tooltip card — cap en W-PADR-170 para no salirse del chart frame (bug fix #2) */}
                  <g transform={`translate(${Math.min(hover.svgX + 12, W - PADR - 170)}, ${Math.max(PADT + 8, hover.svgY - 90)})`}>
                    <rect x={0} y={0} width={170} height={102}
                      fill="rgba(20, 23, 38, 0.96)" stroke="#b8860b" strokeWidth={1} rx={6}/>
                    <text x={8} y={16} fontSize={11} fontWeight={700} fill="#b8860b" fontFamily="monospace">
                      {hover.date || hover.year}
                    </text>
                    <text x={8} y={32} fontSize={10} fill="#fff" fontFamily="monospace">
                      Precio: <tspan fontWeight={700}>${hover.price?.toFixed(2)}</tspan>
                    </text>
                    <text x={8} y={46} fontSize={10} fill="#fff" fontFamily="monospace">
                      Fair: <tspan fontWeight={700}>${hover.fair?.toFixed(2)}</tspan>
                      <tspan fill={hover.price < hover.fair ? '#30d158' : '#ff453a'} dx={4}>
                        ({hover.price < hover.fair ? '+' : ''}{((hover.fair/hover.price - 1) * 100).toFixed(0)}%)
                      </tspan>
                    </text>
                    <text x={8} y={60} fontSize={10} fill="#fff" fontFamily="monospace">
                      EPS: <tspan fontWeight={700}>${hover.eps?.toFixed(2) || '—'}</tspan>
                      {hover.pe != null && <tspan> · P/E {hover.pe.toFixed(1)}x</tspan>}
                    </text>
                    {hover.dps > 0 && (
                      <text x={8} y={74} fontSize={10} fill="#fff" fontFamily="monospace">
                        DPS: <tspan fontWeight={700}>${hover.dps.toFixed(2)}</tspan>
                        {hover.yield != null && <tspan fill="#b8860b"> · {(hover.yield * 100).toFixed(1)}%</tspan>}
                      </text>
                    )}
                    {hover.payout != null && (
                      <text x={8} y={88} fontSize={10} fill="#fff" fontFamily="monospace">
                        Payout: <tspan fontWeight={700}>{(hover.payout * 100).toFixed(0)}%</tspan>
                      </text>
                    )}
                  </g>
                </>
              )}

              {/* Leyenda — match visual exacto con FAST Graphs original.
                  Orden: Precio, Normal P/E (azul), Fair Value 15x (naranja),
                  Dividendos (verde), Yield (rojo eje der), Payout (amarillo eje der),
                  Consenso, Price Target, trades. */}
              <text x={PADL+8} y={PADT+14} fontSize={9} fill="var(--text-primary)" fontFamily="monospace">● Precio histórico (● cierre anual)</text>
              {bandMid && (
                <text x={PADL+8} y={PADT+28} fontSize={9} fill="#4a90e2" fontFamily="monospace">
                  ● Normal P/E ({peMid?.toFixed(1)}x)
                </text>
              )}
              <text x={PADL+8} y={PADT+42} fontSize={9} fill="#f59e0b" fontFamily="monospace">
                ● Valor justo ({activePE?activePE.toFixed(1)+'x':fgPE+'x'})
              </text>
              {greenAreaPoly && (
                <>
                  <rect x={PADL+8} y={PADT+50} width={10} height={6} fill="rgba(46, 139, 87, 0.55)"/>
                  <text x={PADL+22} y={PADT+56} fontSize={9} fill="#2e8b57" fontFamily="monospace">▇ Valor justificado · {cheapMonths}m</text>
                </>
              )}
              {yieldPoints.length > 1 && (
                <text x={PADL+8} y={PADT+70} fontSize={9} fill="#dc2626" fontFamily="monospace">— Dividend Yield (eje →)</text>
              )}
              {payoutPoints.length > 1 && (
                <text x={PADL+8} y={PADT+84} fontSize={9} fill="#a78500" fontFamily="monospace">-- Payout Ratio (eje →)</text>
              )}
              {projFairPts.length > 0 && (
                <text x={PADL+8} y={PADT+98} fontSize={9} fill={FORECAST_MODES.find(m=>m.id===forecastMode)?.color} fontFamily="monospace">
                  -- {FORECAST_MODES.find(m=>m.id===forecastMode)?.lbl}: {
                    forecastMode === 'consensus' ? `${estimatesByYear[estimateYears[0]]?.analystsEps || '?'} analistas` :
                    forecastMode === 'cagr5' && cagr5 != null ? `+${(cagr5*100).toFixed(1)}%/año` :
                    forecastMode === 'cagr10' && cagr10 != null ? `+${(cagr10*100).toFixed(1)}%/año` :
                    forecastMode === 'normal' ? `colapsa a ${projMultiplier.toFixed(1)}x P/E normal` :
                    `+${fgGrowth}%/año`
                  }
                  {showCones && ` · cono ±${margin1yPct.toFixed(0)}/${margin2yPct.toFixed(0)}%`}
                </text>
              )}
              {priceTarget && <text x={PADL+8} y={PADT+112} fontSize={9} fill="#bf5af2" fontFamily="monospace">-- Price Target ${priceTarget.toFixed(0)} ({history?.price_target?.analysts || '?'} analistas)</text>}
              {tradeDots.length > 0 && <text x={PADL+8} y={PADT+126} fontSize={9} fill="var(--text-secondary)" fontFamily="monospace">▲ {tradeDots.filter(t=>t.tipo==='BUY').length} compras · ▼ {tradeDots.filter(t=>t.tipo==='SELL').length} ventas</text>}
            </svg>
          )}
        </div>

        {/* Sidebar de métricas — columna derecha estilo FAST Graphs. Agrupa
            las 18 métricas clave en 3 bloques: Valoración / Retornos /
            Perfil. Apilado vertical, compacto. */}
        <aside style={{display:'flex',flexDirection:'column',gap:10,minWidth:0}}>
          <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:12}}>
            <div style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.5,textTransform:'uppercase',marginBottom:8}}>Valoración</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <MetricRow label="Growth Rate (CAGR)" value={metricCAGR != null ? fP(metricCAGR) : '—'} color={metricCAGR && metricCAGR > 0.05 ? '#30d158' : 'var(--text-primary)'}/>
              <MetricRow label="P/E actual (blended)" value={blendedPE ? blendedPE.toFixed(2)+'x' : '—'} color="var(--gold)"/>
              <MetricRow label="Normal P/E (10y)" value={history?.avg_pe_10y ? history.avg_pe_10y.toFixed(1)+'x' : '—'}/>
              <MetricRow label="Normal P/E (5y)" value={history?.avg_pe_5y ? history.avg_pe_5y.toFixed(1)+'x' : '—'}/>
              <MetricRow label="Fair Value Ratio" value={mosVsFair != null ? fP(mosVsFair) : '—'} color={mosVsFair && mosVsFair > 0.15 ? '#30d158' : mosVsFair && mosVsFair > 0 ? 'var(--gold)' : '#ff453a'}/>
              <MetricRow label="Precio justo" value={fC(fairValue)} color="var(--gold)"/>
              <MetricRow label="Price Target" value={priceTarget ? fC(priceTarget) + (history?.price_target?.analysts ? ` (${history.price_target.analysts})` : '') : '—'} color="#bf5af2"/>
            </div>
          </div>

          <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:12}}>
            <div style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.5,textTransform:'uppercase',marginBottom:8}}>Retornos</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <MetricRow label="Precio futuro proj." value={fC(futureFair)} color="#64d2ff"/>
              <MetricRow label="Retorno anual impl." value={futureReturn != null ? fP(futureReturn) : '—'} color={futureReturn && futureReturn > 0.10 ? '#30d158' : futureReturn && futureReturn > 0.05 ? 'var(--gold)' : '#ff453a'}/>
              <MetricRow label="Consenso ΔEPS" value={consensusImpliedGrowth != null ? fP(consensusImpliedGrowth) : '—'} color={consensusImpliedGrowth && consensusImpliedGrowth > 0.08 ? '#30d158' : '#64d2ff'}/>
              <MetricRow label="EPS Yield" value={epsYield != null ? fP(epsYield) : '—'}/>
              <MetricRow label="Div Yield" value={divYield != null ? fP(divYield) : '—'} color="var(--gold)"/>
            </div>
          </div>

          <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:12}}>
            <div style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.5,textTransform:'uppercase',marginBottom:8}}>Perfil</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <MetricRow label="S&P Rating" value={history?.rating?.overall || '—'}/>
              <MetricRow label="Market Cap" value={profile.mktCap ? `$${(profile.mktCap/1e9).toFixed(1)}B` : '—'}/>
              <MetricRow label="LT Debt/Capital" value={debtCap != null ? fP(debtCap) : '—'}/>
              <MetricRow label="Country" value={profile.country || '—'}/>
              <MetricRow label="Industry" value={profile.industry || '—'} small/>
              <MetricRow label="Beta" value={profile.beta != null ? profile.beta.toFixed(2) : '—'}/>
            </div>
          </div>
        </aside>
      </div>

      {/* Numbers table — FY / Metric / Chg/Yr / Div — colocada JUSTO después
          del chart (estilo FAST Graphs donde la tabla va integrada abajo). */}
      <div style={{marginTop:14,background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14,overflowX:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.5,textTransform:'uppercase'}}>Histórico {tablePeriod === 'yearly' ? 'anual' : 'trimestral'}</div>
          <div style={{display:'flex',gap:3}}>
            <button onClick={()=>setTablePeriod('yearly')} style={{padding:'3px 8px',fontSize:9,fontWeight:700,borderRadius:4,border:`1px solid ${tablePeriod==='yearly'?'var(--gold)':'var(--border)'}`,background:tablePeriod==='yearly'?'var(--gold-dim)':'transparent',color:tablePeriod==='yearly'?'var(--gold)':'var(--text-secondary)',cursor:'pointer',fontFamily:'var(--fm)'}}>ANUAL</button>
            <button onClick={()=>setTablePeriod('quarterly')} title={history?.earnings_scorecard?.quarters?.length ? '' : 'Sin datos trimestrales'}
              disabled={!history?.earnings_scorecard?.quarters?.length}
              style={{padding:'3px 8px',fontSize:9,fontWeight:700,borderRadius:4,border:`1px solid ${tablePeriod==='quarterly'?'var(--gold)':'var(--border)'}`,background:tablePeriod==='quarterly'?'var(--gold-dim)':'transparent',color:tablePeriod==='quarterly'?'var(--gold)':history?.earnings_scorecard?.quarters?.length?'var(--text-secondary)':'var(--text-tertiary)',cursor:history?.earnings_scorecard?.quarters?.length?'pointer':'not-allowed',fontFamily:'var(--fm)'}}>TRIMESTRAL</button>
          </div>
        </div>
        {tablePeriod === 'yearly' && (<>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,fontFamily:'var(--fm)',minWidth:520}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)',color:'var(--text-tertiary)'}}>
              <th style={{textAlign:'left',padding:'4px 6px'}}>FY Date</th>
              {tableRows.map(r => <th key={r.y} style={{textAlign:'right',padding:'4px 6px'}}>{r.y}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr style={{borderBottom:'1px solid var(--subtle-border, rgba(255,255,255,0.04))'}}>
              <td style={{padding:'4px 6px',fontWeight:700,color:'var(--gold)'}}>{METRIC_LABEL[fgMode]?.slice(0, 12) || 'Valor'}</td>
              {tableRows.map(r => <td key={r.y} style={{textAlign:'right',padding:'4px 6px',color:'var(--text-primary)'}}>{fC(r.val)}</td>)}
            </tr>
            <tr style={{borderBottom:'1px solid var(--subtle-border, rgba(255,255,255,0.04))'}}>
              <td style={{padding:'4px 6px',color:'var(--text-secondary)'}}>∆/año</td>
              {tableRows.map(r => (
                <td key={r.y} style={{textAlign:'right',padding:'4px 6px',color:r.chg == null ? 'var(--text-tertiary)' : r.chg > 0 ? '#30d158' : '#ff453a'}}>
                  {r.chg != null ? (r.chg > 0 ? '+' : '') + (r.chg * 100).toFixed(0) + '%' : '—'}
                </td>
              ))}
            </tr>
            <tr style={{borderBottom:'1px solid var(--subtle-border, rgba(255,255,255,0.04))'}}>
              <td style={{padding:'4px 6px',color:'var(--text-secondary)'}}>Dividendo</td>
              {tableRows.map(r => <td key={r.y} style={{textAlign:'right',padding:'4px 6px',color:r.div ? 'var(--gold)' : 'var(--text-tertiary)'}}>{r.div ? '$'+r.div.toFixed(2) : '—'}</td>)}
            </tr>
            <tr>
              <td style={{padding:'4px 6px',color:'var(--text-secondary)'}}>∆ Div/año</td>
              {tableRows.map(r => (
                <td key={r.y} style={{textAlign:'right',padding:'4px 6px',color:r.chgDiv == null ? 'var(--text-tertiary)' : r.chgDiv > 0 ? '#30d158' : '#ff453a'}}>
                  {r.chgDiv != null ? (r.chgDiv > 0 ? '+' : '') + (r.chgDiv * 100).toFixed(0) + '%' : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        </>)}
        {tablePeriod === 'quarterly' && (
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
              {(history?.earnings_scorecard?.quarters || []).map(q => (
                <tr key={q.date} style={{borderBottom:'1px solid var(--subtle-border, rgba(255,255,255,0.04))'}}>
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
        )}
      </div>

      {/* Row: FG Scores (radar) + Analyst Scorecard */}
      {history && (
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1.2fr)',gap:12,marginTop:14}}>
          <FGScoresPanel scores={history.fg_scores} />
          <AnalystScorecard scorecard={history.earnings_scorecard} />
        </div>
      )}

      {/* Splits histórico */}
      {history?.splits?.length > 0 && (
        <div style={{marginTop:12}}>
          <SplitsTable splits={history.splits} />
        </div>
      )}
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
