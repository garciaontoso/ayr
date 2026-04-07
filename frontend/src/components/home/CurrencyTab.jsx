import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';
import { Button } from '../ui';

const CCY_FLAG = { USD: '🇺🇸', EUR: '🇪🇺', CNY: '🇨🇳', HKD: '🇭🇰', JPY: '🇯🇵', GBP: '🇬🇧', GBX: '🇬🇧', CHF: '🇨🇭', AUD: '🇦🇺', CAD: '🇨🇦', BRL: '🇧🇷', MXN: '🇲🇽', Other: '🌍' };
const CCY_COLOR = { USD: '#10b981', EUR: '#3b82f6', CNY: '#ef4444', HKD: '#a855f7', JPY: '#ec4899', GBP: '#f59e0b', GBX: '#f59e0b', CHF: '#06b6d4', AUD: '#f97316', CAD: '#8b5cf6', Other: '#6b7280' };

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toFixed(1) + '%';
}

export default function CurrencyTab() {
  // ── State (declared FIRST to avoid TDZ) ──
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [coverageOpen, setCoverageOpen] = useState(true);
  const [positions, setPositions] = useState([]);

  // ── Fetchers ──
  const fetchExposure = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/currency/exposure`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      setData(j);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPositions = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/positions`);
      if (!r.ok) return;
      const j = await r.json();
      const list = j.results || j.positions || j || [];
      setPositions(Array.isArray(list) ? list : []);
    } catch (e) {
      // silent — coverage falls back to alphabetic
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch(`${API_URL}/api/currency/refresh`, { method: 'POST' });
      await fetchExposure();
    } catch (e) {
      setError('Error al refrescar');
    } finally {
      setRefreshing(false);
    }
  }, [fetchExposure]);

  // ── Initial load ──
  useEffect(() => {
    fetchExposure();
    fetchPositions();
  }, [fetchExposure, fetchPositions]);

  // ── Derived ──
  const sortedCurrencies = useMemo(() => {
    if (!data?.by_currency) return [];
    return [...data.by_currency].sort((a, b) => (b.value_usd || 0) - (a.value_usd || 0));
  }, [data]);

  const coverageRows = useMemo(() => {
    if (!data?.coverage) return [];
    const cov = data.coverage;
    const totalValue = positions.reduce((s, p) => s + (Number(p.value_usd) || Number(p.value) || 0), 0);
    const rows = Object.entries(cov).map(([ticker, conf]) => {
      const pos = positions.find(p => p.ticker === ticker || p.symbol === ticker);
      const val = pos ? (Number(pos.value_usd) || Number(pos.value) || 0) : 0;
      const weight = totalValue > 0 ? (val / totalValue) * 100 : 0;
      return { ticker, conf, weight };
    });
    if (positions.length === 0) {
      rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
    } else {
      rows.sort((a, b) => b.weight - a.weight);
    }
    return rows;
  }, [data, positions]);

  // ── Quality badge ──
  // Color semantics: green (>=70% high-quality data), gold (lower coverage,
  // mostly fallback values). Avoid red — low coverage isn't a danger, just a
  // data limitation, and rojo confuses with critical alerts elsewhere.
  const hcPct = data?.high_confidence_pct || 0;
  const hcColor = hcPct >= 70 ? 'var(--ds-success)' : 'var(--ds-warning)';
  const hcLabel = `${Math.round(hcPct)}% high confidence`;

  // ── Render states ──
  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
        Cargando exposición por moneda...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: 24, color: 'var(--red)', fontFamily: 'var(--fm)' }}>
        Error al cargar datos: {error}
      </div>
    );
  }

  return (
    <div style={{ padding: 16, color: 'var(--text-primary)' }}>
      {/* ── HEADER HERO ── */}
      <div
        style={{
          padding: '20px 24px',
          background: 'var(--subtle-bg)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Valor total cartera
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>
            {fmtUSD(data?.total_usd)}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 600,
                background: hcColor,
                color: '#fff',
              }}
            >
              {hcLabel}
            </span>
            {lastUpdated && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Actualizado: {lastUpdated.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <Button onClick={handleRefresh} loading={refreshing} variant="primary" size="md">
          {refreshing ? 'Refrescando...' : '🔄 Refrescar'}
        </Button>
      </div>

      {/* ── BARRAS POR MONEDA ── */}
      <div
        style={{
          padding: 20,
          background: 'var(--subtle-bg)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16, fontWeight: 600 }}>
          Exposición por moneda
        </div>
        {sortedCurrencies.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin datos.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sortedCurrencies.map((c) => {
              const ccy = c.currency || 'Other';
              const flag = CCY_FLAG[ccy] || CCY_FLAG.Other;
              const color = CCY_COLOR[ccy] || CCY_COLOR.Other;
              const pct = Number(c.pct) || 0;
              return (
                <div key={ccy} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 130px', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {ccy} {flag}
                  </div>
                  <div style={{ background: 'var(--border)', borderRadius: 6, height: 24, overflow: 'hidden', position: 'relative' }}>
                    <div
                      style={{
                        width: Math.max(0, Math.min(100, pct)) + '%',
                        height: 24,
                        background: color,
                        borderRadius: 6,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--fm)', color: 'var(--text-primary)', textAlign: 'right' }}>
                    {fmtPct(pct)}
                  </div>
                  <div style={{ fontSize: 13, fontFamily: 'var(--fm)', color: 'var(--text-secondary)', textAlign: 'right' }}>
                    {fmtUSD(c.value_usd)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── AYUDA ── */}
      <div
        style={{
          padding: 14,
          background: 'var(--subtle-bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Cómo se calcula:</strong> Las posiciones se descomponen según su revenue geográfico reportado. Por ejemplo, una empresa que cotiza en USA pero vende 30% a China se reporta como 70% USD, 30% CNY.
        </div>
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>Fallback:</strong> si FMP no tiene segmentation, se usa la moneda del listing (marcado como low confidence).
        </div>
      </div>

      {/* ── COVERAGE TABLE ── */}
      <div
        style={{
          background: 'var(--subtle-bg)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          onClick={() => setCoverageOpen((o) => !o)}
          style={{
            padding: '14px 20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: coverageOpen ? '1px solid var(--border)' : 'none',
            userSelect: 'none',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
            Coverage por ticker ({coverageRows.length})
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{coverageOpen ? '▲' : '▼'}</div>
        </div>
        {coverageOpen && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--subtle-bg)', position: 'sticky', top: 0 }}>
                  <th style={{ textAlign: 'left', padding: '10px 20px', color: 'var(--text-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Ticker</th>
                  <th style={{ textAlign: 'right', padding: '10px 20px', color: 'var(--text-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Weight</th>
                  <th style={{ textAlign: 'right', padding: '10px 20px', color: 'var(--text-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Confianza</th>
                </tr>
              </thead>
              <tbody>
                {coverageRows.map((row) => {
                  const isHigh = row.conf === 'high';
                  return (
                    <tr key={row.ticker} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 20px', fontFamily: 'var(--fm)', color: 'var(--text-primary)', fontWeight: 600 }}>{row.ticker}</td>
                      <td style={{ padding: '8px 20px', fontFamily: 'var(--fm)', color: 'var(--text-secondary)', textAlign: 'right' }}>
                        {row.weight > 0 ? fmtPct(row.weight) : '—'}
                      </td>
                      <td style={{ padding: '8px 20px', textAlign: 'right' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            background: isHigh ? 'var(--green)' : 'var(--gold)',
                            color: '#fff',
                          }}
                        >
                          {row.conf}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {coverageRows.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Sin datos de coverage.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
