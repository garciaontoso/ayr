import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, fetchParallel } from '../api/client';
import { setCache, getCache } from '../api/cache';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

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
  const [privacy, setPrivacy] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const loadAll = useCallback(async (skipCache = false) => {
    setLoading(true);
    try {
      if (!skipCache) {
        const cached = await getCache('appData');
        if (cached) {
          applyData(cached);
          setLoading(false);
        }
      }
      const [pos, ib, pnl, st, fxData, fwd, mensual, resumen] = await fetchParallel([
        ['/api/positions', { positions: [], count: 0 }],
        ['/api/ib-summary', null],
        ['/api/cached-pnl', null],
        ['/api/stats', null],
        ['/api/fx?from=EUR&to=USD', {}],
        ['/api/dividend-forward', null],
        ['/api/dividendos/mensual', []],
        ['/api/dividendos/resumen', []],
      ]);
      const data = { pos, ib, pnl, st, fxData, fwd, mensual, resumen };
      applyData(data);
      setCache('appData', data, 300000);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('loadAll failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => { loadAll(); }, [loadAll]);

  const totalValue = positions.reduce((s, p) => s + (p.usd_value || p.market_value || 0), 0);
  const totalCost = positions.reduce((s, p) => s + (p.total_invested || (p.avg_price || 0) * (p.shares || 0) || 0), 0);
  const totalPnl = cachedPnl?.pnl ?? (totalValue - totalCost);
  const totalPnlPct = cachedPnl?.pnlPct ?? (totalCost > 0 ? (totalPnl / totalCost) : 0);
  const nlv = ibSummary?.nlv?.amount ?? totalValue;
  const totalDivAnnual = forwardDiv?.annual_projected ?? positions.reduce((s, p) => s + (p.div_ttm || 0) * (p.shares || 0), 0);
  const portfolioYield = totalValue > 0 ? totalDivAnnual / totalValue : 0;

  const value = {
    positions, ibSummary, cachedPnl, stats, fx, forwardDiv, divMensual, divResumen,
    loading, privacy, setPrivacy, loadAll, lastUpdate,
    totalValue, totalCost, totalPnl, totalPnlPct, nlv, totalDivAnnual, portfolioYield,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
