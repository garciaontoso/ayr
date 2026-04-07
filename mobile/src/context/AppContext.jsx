import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiFetch } from '../api/client';
import { setCache, getCache } from '../api/cache';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

async function fetchAll() {
  const endpoints = [
    ['/api/positions', { positions: [], count: 0 }],
    ['/api/ib-summary', null],
    ['/api/cached-pnl', null],
    ['/api/stats', null],
    ['/api/fx?from=EUR&to=USD', {}],
    ['/api/dividend-forward', null],
    ['/api/dividendos/mensual', []],
    ['/api/dividendos/resumen', []],
  ];
  const results = await Promise.allSettled(
    endpoints.map(([path, fallback]) => apiFetch(path).catch(() => fallback))
  );
  return results.map((r, i) => r.status === 'fulfilled' ? r.value : endpoints[i][1]);
}

export function AppProvider({ children }) {
  const [positions, setPositions] = useState([]);
  const [ibSummary, setIbSummary] = useState(null);
  const [cachedPnl, setCachedPnl] = useState(null);
  const [stats, setStats] = useState(null);
  const [fx, setFx] = useState({});
  const [forwardDiv, setForwardDiv] = useState(null);
  const [divMensual, setDivMensual] = useState([]);
  const [divResumen, setDivResumen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [privacy, setPrivacy] = useState(() => localStorage.getItem('privacy') === '1');
  const [lastUpdate, setLastUpdate] = useState(null);
  const mounted = useRef(true);

  function applyData({ pos, ib, pnl, st, fxData, fwd, mensual, resumen }) {
    if (pos?.positions) setPositions(pos.positions);
    if (ib) setIbSummary(ib);
    if (pnl) setCachedPnl(pnl);
    if (st) setStats(st);
    if (fxData) setFx(fxData);
    if (fwd) setForwardDiv(fwd);
    if (mensual) setDivMensual(Array.isArray(mensual) ? mensual : []);
    if (resumen) setDivResumen(Array.isArray(resumen) ? resumen : []);
  }

  const loadAll = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const cached = await getCache('appData');
      if (cached && mounted.current) { applyData(cached); setLoading(false); }
    } catch {}
    try {
      const [pos, ib, pnl, st, fxData, fwd, mensual, resumen] = await fetchAll();
      if (!mounted.current) return;
      const data = { pos, ib, pnl, st, fxData, fwd, mensual, resumen };
      applyData(data);
      setCache('appData', data, 3600000);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('loadAll:', err);
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadAll();
    return () => { mounted.current = false; };
  }, [loadAll]);

  useEffect(() => { localStorage.setItem('privacy', privacy ? '1' : '0'); }, [privacy]);

  // ── Financial Calculations ──
  const metrics = useMemo(() => {
    // NLV from IB (authoritative)
    const nlv = ibSummary?.nlv?.amount ?? positions.reduce((s, p) => s + (p.usd_value || 0), 0);
    const cash = ibSummary?.totalCash?.amount ?? 0;

    // Unrealized P&L from IB cached snapshot
    const unrealizedPnl = cachedPnl?.pnl ?? 0;

    // Cost basis: use IB's cost from cached-pnl (most accurate)
    // cachedPnl.cost = total cost of all open positions from IB
    const ibCost = cachedPnl?.cost ?? 0;
    // Invested from positions table (for display as "total money put in")
    const totalInvested = positions.reduce((s, p) => s + (p.total_invested || 0), 0);

    // Dividends received (from resumen table)
    const totalDivBruto = divResumen.reduce((s, r) => s + (r.bruto || 0), 0);
    const totalDivNeto = divResumen.reduce((s, r) => s + (r.neto || 0), 0);
    const totalTaxes = totalDivBruto - totalDivNeto;
    const divYTD = stats?.div_ytd ?? divResumen.find(r => String(r.anio) === String(new Date().getFullYear()))?.neto ?? 0;

    // Total Profit (matching Stock Events definition):
    // = Unrealized P&L + Total Dividends Received (net)
    // This gives: capital appreciation + income received
    // Stock Events: +$146K = -$151K (unrealized) + $221K (realized) + $88K (divs) - $9K (tax) - $1K (fees)
    // We approximate: NLV - totalInvested + totalDivNeto (since NLV includes realized gains)
    // Or simpler: unrealizedPnl + totalDivNeto ≈ the income side
    const totalProfit = unrealizedPnl + totalDivNeto;
    const totalProfitPct = totalInvested > 0 ? totalProfit / totalInvested : 0;

    // Forward dividend projections
    const totalDivAnnual = forwardDiv?.annual_projected ?? positions.reduce((s, p) => s + (p.div_ttm || 0) * (p.shares || 0), 0);

    // Yields
    const yieldOnValue = nlv > 0 ? totalDivAnnual / nlv : 0;  // Current yield
    const yieldOnCost = totalInvested > 0 ? totalDivAnnual / totalInvested : 0;  // YOC

    return {
      nlv, cash, unrealizedPnl, ibCost, totalInvested,
      totalDivBruto, totalDivNeto, totalTaxes, divYTD,
      totalProfit, totalProfitPct,
      totalDivAnnual, yieldOnValue, yieldOnCost,
    };
  }, [positions, ibSummary, cachedPnl, stats, forwardDiv, divResumen]);

  const value = {
    positions, ibSummary, cachedPnl, stats, fx, forwardDiv, divMensual, divResumen,
    loading, refreshing, privacy, setPrivacy, loadAll, lastUpdate,
    ...metrics,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
