// useRentabilidad10y.js — hook que orquesta el modelo Phil Town / Gorka.
//
// Flujo:
//   1. Toma `fin` y `fmpExtra` ya hidratados por useAnalysisMetrics
//   2. Convierte a series 10y descending (index 0 = más reciente)
//   3. Fetcha overrides D1 vía /api/rentabilidad/inputs?ticker=X
//   4. Aplica overrides sobre series FMP (mutación inmutable)
//   5. Calcula matriz 3×3 retornos esperados
//   6. Expone función `setOverride` para guardar cambios manuales

import { useState, useEffect, useMemo, useCallback } from 'react';
import { API_URL } from '../constants/index.js';
import {
  calcRentabilidad10y,
  getDefaultPeRange,
  applyOverrides,
  extractGlobalConfig,
} from '../calculators/rentabilidad10y.ts';

const TOKEN_KEY = 'VITE_AYR_TOKEN';

function authHeaders() {
  // Token tomado del .env vía Vite import.meta.env. Si no está, intenta localStorage.
  let token = '';
  try {
    token = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AYR_TOKEN) || '';
  } catch (_) {}
  if (!token && typeof localStorage !== 'undefined') {
    token = localStorage.getItem('ayr_token') || '';
  }
  return token ? { 'X-AYR-Auth': token } : {};
}

export function useRentabilidad10y({ ticker, fin, cfg, fmpExtra, currentPrice }) {
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // ─── Fetch overrides al cambiar ticker ───────────────────────────────────
  useEffect(() => {
    if (!ticker) {
      setOverrides([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/rentabilidad/inputs?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data?.inputs && Array.isArray(data.inputs)) {
          setOverrides(data.inputs.map(o => ({ ticker, year: o.year, field: o.field, value: o.value })));
        } else {
          setOverrides([]);
        }
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ticker]);

  // ─── Construye series 10y desde fin (object {year: data}) ────────────────
  // useAnalysisMetrics tiene `fin` como objeto indexed by year. Lo convertimos
  // a arrays descending (index 0 = año más reciente).
  const seriesFromFin = useMemo(() => {
    if (!fin || typeof fin !== 'object') {
      return {
        revenue: [], eps: [], dps: [], equity: [], retEarnings: [], assets: [],
        years: [],
      };
    }
    // 2026-05-18: 11 años para soportar año 0 a año -10 (Excel Gorka).
    const yearKeys = Object.keys(fin).map(Number).filter(y => !isNaN(y) && y > 1900).sort((a, b) => b - a).slice(0, 11);
    const revenue = [];
    const eps = [];
    const dps = [];
    const equity = [];
    const retEarnings = [];
    const assets = [];
    for (const y of yearKeys) {
      const d = fin[y] || {};
      revenue.push(d.revenue != null && isFinite(d.revenue) ? d.revenue : null);
      // 2026-05-18: usar epsBasic (BPA estándar Gorka). Si no, fallback a eps (que ahora
      // ya defaults a basic en fmp.js post-fix), luego diluted.
      const epsVal = d.epsBasic != null && isFinite(d.epsBasic) && d.epsBasic > 0
        ? d.epsBasic
        : (d.eps != null && isFinite(d.eps) ? d.eps : (d.epsDiluted ?? null));
      eps.push(epsVal);
      dps.push(d.dps != null && isFinite(d.dps) ? d.dps : null);
      equity.push(d.equity != null && isFinite(d.equity) ? d.equity : null);
      retEarnings.push(d.retainedEarnings != null && isFinite(d.retainedEarnings) ? d.retainedEarnings : null);
      // 2026-05-18: usar totalAssets REAL del balance (añadido en fmp.js).
      // Fallback al proxy (totalDebt + equity) si falta para tickers con cache vieja.
      const assetsVal = d.totalAssets != null && isFinite(d.totalAssets) && d.totalAssets > 0
        ? d.totalAssets
        : ((d.totalDebt || 0) + (d.equity || 0));
      assets.push(assetsVal > 0 ? assetsVal : null);
    }
    return { revenue, eps, dps, equity, retEarnings, assets, years: yearKeys };
  }, [fin]);

  // ─── Aplicar overrides + extraer config global ──────────────────────────
  const seriesFinal = useMemo(() => {
    return applyOverrides(seriesFromFin, overrides);
  }, [seriesFromFin, overrides]);

  const globalConfig = useMemo(() => extractGlobalConfig(overrides), [overrides]);

  // ─── Resolver defaults de P/E y growth ──────────────────────────────────
  const sector = fmpExtra?.profile?.sector || cfg?.sector || null;
  const peDefaults = useMemo(() => getDefaultPeRange(sector), [sector]);

  const peLow = globalConfig.peLow ?? peDefaults.low;
  const peMid = globalConfig.peMid ?? peDefaults.mid;
  const peHigh = globalConfig.peHigh ?? peDefaults.high;

  // Default growth: si hay CAGR EPS histórico, usar capped al 15%. Si no, 5%.
  const epsCagr = useMemo(() => {
    const arr = seriesFinal.eps.filter(v => v != null && isFinite(v));
    if (arr.length < 2 || arr[0] <= 0 || arr[arr.length - 1] <= 0) return null;
    return Math.pow(arr[0] / arr[arr.length - 1], 1 / (arr.length - 1)) - 1;
  }, [seriesFinal.eps]);

  const growthBasePct = globalConfig.growth ?? (
    epsCagr != null ? Math.max(0, Math.min(15, epsCagr * 100)) : 5
  );

  // ─── Cálculo principal ───────────────────────────────────────────────────
  const result = useMemo(() => {
    const price = currentPrice ?? cfg?.price ?? 0;
    return calcRentabilidad10y({
      revenue: seriesFinal.revenue,
      eps: seriesFinal.eps,
      dps: seriesFinal.dps,
      equity: seriesFinal.equity,
      retEarnings: seriesFinal.retEarnings,
      assets: seriesFinal.assets,
      currentPrice: price,
      growthBasePct,
      growthRangePct: 1.5,
      peLow, peMid, peHigh,
    });
  }, [seriesFinal, currentPrice, cfg?.price, growthBasePct, peLow, peMid, peHigh]);

  // ─── Setter de overrides (POST a D1) ─────────────────────────────────────
  const setOverride = useCallback(async (year, field, value, notes) => {
    if (!ticker) return false;
    setSaving(true);
    try {
      const body = { ticker, year, field, value, notes };
      const resp = await fetch(`${API_URL}/api/rentabilidad/inputs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

      // Actualizar estado local
      setOverrides(prev => {
        const filtered = prev.filter(o => !(o.year === year && o.field === field));
        if (value == null) return filtered;  // deleted
        return [...filtered, { ticker, year, field, value, notes }];
      });
      return true;
    } catch (e) {
      console.error('[rentabilidad] setOverride failed:', e.message);
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [ticker]);

  // ─── Restaurar TODOS los overrides del ticker ────────────────────────────
  const resetAll = useCallback(async () => {
    if (!ticker) return false;
    setSaving(true);
    try {
      const resp = await fetch(`${API_URL}/api/rentabilidad/inputs?ticker=${encodeURIComponent(ticker)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setOverrides([]);
      return true;
    } catch (e) {
      console.error('[rentabilidad] resetAll failed:', e.message);
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [ticker]);

  return {
    // Datos
    seriesFinal,
    seriesFromFin,       // raw FMP (sin overrides) — para mostrar diff visual
    overrides,
    globalConfig,
    sector,
    peDefaults,
    peLow, peMid, peHigh,
    growthBasePct,
    // Resultados
    ...result,           // cagr, coefHabilidad, bpaProyectado, precioFuturo10y, etc.
    // Estado
    loading, saving, error,
    // Acciones
    setOverride,
    resetAll,
  };
}
