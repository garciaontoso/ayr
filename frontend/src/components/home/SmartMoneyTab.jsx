// ─────────────────────────────────────────────────────────────
// SmartMoneyTab — MVP "Fondos / Smart Money"
//
// Three sub-views:
//   1. Superinvestors  — list of 13 curated 13F filers, click → top holdings
//   2. Mi cartera      — for each of your tickers, which superinvestors hold it
//   3. Consensus       — tickers held by ≥N superinvestors (default 3)
//
// Backend: /api/funds/list, /api/funds/:id, /api/funds/by-ticker/:t,
// /api/funds/consensus, /api/funds/refresh
//
// Refresh: manual button (POST /api/funds/refresh). Without a fund_id it
// refreshes all 13 funds — takes ~30s. The first call seeds quarterly
// holdings; subsequent calls are idempotent (DELETE + INSERT for the same
// quarter row).
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { API_URL } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';

const SUB_VIEWS = [
  { id: 'funds', lbl: '🏛️ Superinvestors', desc: '13 fondos seguidos' },
  { id: 'mine',  lbl: '🎯 Mi cartera',     desc: 'Quién tiene tus tickers' },
  { id: 'consensus', lbl: '⭐ Consensus',  desc: 'Tickers en ≥3 fondos' },
];

const STYLE_LABEL = {
  'quality-value-mega': 'Quality value mega',
  'concentrated-value': 'Concentrated value',
  'quality-compounders': 'Quality compounders',
  'quality-growth': 'Quality growth',
  'buffett-style': 'Buffett-style insurer',
  'quality-dividend': 'Quality + dividend',
  'concentrated-quality': 'Concentrated quality',
  'long-term-quality': 'Long-term quality',
  'dividend-consumer-brands': 'Dividend consumer brands',
  'deep-value': 'Deep value',
  'concentrated-activist': 'Concentrated activist',
  'macro-value': 'Macro + value',
  'quality-compounding-intl': 'Quality compounding intl',
};

function formatM(v) {
  if (!v || isNaN(v)) return '—';
  if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  return `$${Math.round(v).toLocaleString()}`;
}

function Stars({ n }) {
  const stars = '⭐'.repeat(Math.max(1, Math.min(5, n || 3)));
  return <span style={{ fontSize: 11 }}>{stars}</span>;
}

export default function SmartMoneyTab() {
  const { portfolioList, portfolioTotals, openAnalysis } = useHome();
  // portfolioTotals.positions has the weight field; portfolioList doesn't.
  const positionsWithWeight = portfolioTotals?.positions || portfolioList || [];

  const [view, setView] = useState('funds');
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [selectedFund, setSelectedFund] = useState(null);
  const [fundDetail, setFundDetail] = useState(null);
  const [consensusMin, setConsensusMin] = useState(3);
  const [consensus, setConsensus] = useState([]);
  const [holdersByTicker, setHoldersByTicker] = useState({});
  const [byTickerLoading, setByTickerLoading] = useState(false);

  // ── Load funds list ──
  const loadFunds = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/funds/list`);
      const d = await r.json();
      setFunds(d.funds || []);
    } catch { setFunds([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadFunds(); }, [loadFunds]);

  // ── Refresh button ──
  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshMsg('Llamando a FMP /form-thirteen para 13 fondos…');
    try {
      const r = await fetch(`${API_URL}/api/funds/refresh`, { method: 'POST' });
      const d = await r.json();
      const ok = (d.summary || []).filter(s => s.ok).length;
      const fail = (d.summary || []).filter(s => !s.ok).length;
      setRefreshMsg(`✅ ${ok}/${d.refreshed} fondos actualizados${fail > 0 ? ` · ${fail} fallaron` : ''}`);
      await loadFunds();
      // Also refresh current sub-view data
      if (view === 'consensus') loadConsensus();
      if (view === 'mine') loadByPortfolio();
      if (view === 'funds' && selectedFund) loadFundDetail(selectedFund);
    } catch (e) {
      setRefreshMsg(`❌ Error: ${e.message}`);
    }
    setRefreshing(false);
    setTimeout(() => setRefreshMsg(''), 8000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFunds, view, selectedFund]);

  // ── Fund detail (top holdings) ──
  const loadFundDetail = useCallback(async (fundId) => {
    setSelectedFund(fundId);
    setFundDetail(null);
    try {
      const r = await fetch(`${API_URL}/api/funds/${fundId}`);
      const d = await r.json();
      setFundDetail(d);
    } catch { setFundDetail({ holdings: [] }); }
  }, []);

  // ── Consensus ──
  const loadConsensus = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/funds/consensus?min=${consensusMin}`);
      const d = await r.json();
      setConsensus(d.picks || []);
    } catch { setConsensus([]); }
  }, [consensusMin]);

  useEffect(() => {
    if (view === 'consensus') loadConsensus();
  }, [view, loadConsensus]);

  // ── Mi cartera: for each ticker, fetch holders ──
  const loadByPortfolio = useCallback(async () => {
    if (!positionsWithWeight?.length) return;
    setByTickerLoading(true);
    const result = {};
    // Batch in groups of 10 to avoid hammering the worker
    for (let i = 0; i < positionsWithWeight.length; i += 10) {
      const batch = positionsWithWeight.slice(i, i + 10);
      await Promise.all(batch.map(async (p) => {
        try {
          const r = await fetch(`${API_URL}/api/funds/by-ticker/${encodeURIComponent(p.ticker)}`);
          const d = await r.json();
          result[p.ticker] = d.holders || [];
        } catch { result[p.ticker] = []; }
      }));
    }
    setHoldersByTicker(result);
    setByTickerLoading(false);
  }, [positionsWithWeight]);

  useEffect(() => {
    if (view === 'mine') loadByPortfolio();
  }, [view, loadByPortfolio]);

  // ── Mi cartera derived: list of tickers sorted by # holders desc ──
  const myTickersScored = useMemo(() => {
    if (!positionsWithWeight) return [];
    return positionsWithWeight.map(p => {
      const holders = holdersByTicker[p.ticker] || [];
      return {
        ticker: p.ticker,
        name: p.name || p.ticker,
        weight: p.weight || 0,
        holdersCount: holders.length,
        holders,
        topHolder: holders[0],
      };
    }).sort((a, b) => b.holdersCount - a.holdersCount || (b.weight||0) - (a.weight||0));
  }, [positionsWithWeight, holdersByTicker]);

  const lastRefresh = useMemo(() => {
    const dates = funds.map(f => f.last_refreshed_at).filter(Boolean).sort();
    return dates[dates.length - 1] || null;
  }, [funds]);

  // ─── Styles ───
  const card = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
    padding: 14, marginBottom: 14, fontFamily: 'var(--fm)',
  };
  const pill = (active) => ({
    padding: '7px 14px', borderRadius: 8,
    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'rgba(200,164,78,.12)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-tertiary)',
    fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer',
    fontFamily: 'var(--fm)', transition: 'all .15s',
  });
  const th = { padding: '8px 10px', fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const td = { padding: '7px 10px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,.04)' };
  const tickerLink = (t) => ({
    fontFamily: 'var(--fm)', fontWeight: 700, color: 'var(--gold)', cursor: 'pointer', textDecoration: 'none',
  });

  return (
    <div style={{ padding: '4px 8px' }}>
      {/* ─── Header ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>
            🏛️ Smart Money
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            13 superinvestors curados · 13F filings vía FMP
            {lastRefresh && ` · Última actualización ${new Date(lastRefresh).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}`}
          </div>
        </div>
        <button
          onClick={doRefresh}
          disabled={refreshing}
          style={{
            padding: '8px 14px', borderRadius: 8,
            border: '1px solid var(--gold)',
            background: refreshing ? 'rgba(200,164,78,.05)' : 'rgba(200,164,78,.1)',
            color: 'var(--gold)', fontSize: 11, fontWeight: 700, cursor: refreshing ? 'wait' : 'pointer',
            fontFamily: 'var(--fm)',
          }}
        >
          {refreshing ? '⏳ Actualizando…' : '🔄 Refrescar 13F'}
        </button>
      </div>
      {refreshMsg && (
        <div style={{ ...card, background: 'rgba(100,210,255,.06)', borderColor: 'rgba(100,210,255,.3)', fontSize: 11, color: 'var(--text-secondary)' }}>
          {refreshMsg}
        </div>
      )}

      {/* ─── Sub-view pills ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {SUB_VIEWS.map(sv => (
          <button key={sv.id} onClick={() => setView(sv.id)} style={pill(view === sv.id)}>
            {sv.lbl}
          </button>
        ))}
      </div>

      {/* ─── View 1: Superinvestors ─── */}
      {view === 'funds' && (
        <>
          {loading ? <InlineLoading label="Cargando fondos..." /> : funds.length === 0 ? (
            <EmptyState
              icon="🏛️"
              title="Sin fondos cargados"
              description="Pulsa 'Refrescar 13F' para descargar los holdings de los 13 superinvestors desde FMP."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              {funds.map(f => (
                <div key={f.id} style={{ ...card, marginBottom: 0, cursor: 'pointer', borderColor: selectedFund === f.id ? 'var(--gold)' : 'var(--border)' }}
                     onClick={() => loadFundDetail(f.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {f.name} <Stars n={f.conviction} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {f.manager} · {STYLE_LABEL[f.style] || f.style || '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-tertiary)' }}>
                      {f.last_quarter ? <div style={{ fontFamily: 'var(--fm)', color: 'var(--text-secondary)', fontWeight: 600 }}>{f.last_quarter}</div> : <div style={{ color: 'var(--text-tertiary)' }}>Sin datos</div>}
                      <div>{f.holdings_count || 0} posiciones</div>
                      {f.portfolio_value > 0 && <div style={{ color: 'var(--green)' }}>{formatM(f.portfolio_value)}</div>}
                    </div>
                  </div>
                  {selectedFund === f.id && fundDetail && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        Top 20 holdings · {fundDetail.quarter}
                      </div>
                      {fundDetail.holdings.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sin holdings cacheados todavía. Pulsa "Refrescar 13F".</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={th}>Ticker</th>
                              <th style={{ ...th, textAlign: 'right' }}>Peso</th>
                              <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fundDetail.holdings.slice(0, 20).map(h => (
                              <tr key={h.ticker}>
                                <td style={td}>
                                  <span style={tickerLink(h.ticker)} onClick={(e) => { e.stopPropagation(); openAnalysis?.(h.ticker); }}>{h.ticker}</span>
                                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>{(h.name || '').slice(0, 35)}</span>
                                </td>
                                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 600, color: h.weight_pct >= 5 ? 'var(--gold)' : 'var(--text-secondary)' }}>
                                  {h.weight_pct?.toFixed(1)}%
                                </td>
                                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)' }}>{formatM(h.value_usd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── View 2: Mi cartera ─── */}
      {view === 'mine' && (
        <>
          {byTickerLoading ? <InlineLoading label="Buscando holders por ticker..." /> : (
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Ticker</th>
                    <th style={{ ...th, textAlign: 'right' }}>Mi peso</th>
                    <th style={{ ...th, textAlign: 'center' }}># Fondos</th>
                    <th style={th}>Top holder</th>
                  </tr>
                </thead>
                <tbody>
                  {myTickersScored.slice(0, 100).map(row => (
                    <tr key={row.ticker}>
                      <td style={td}>
                        <span style={tickerLink(row.ticker)} onClick={() => openAnalysis?.(row.ticker)}>{row.ticker}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>{row.name.slice(0, 30)}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)' }}>{(row.weight * 100).toFixed(1)}%</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: row.holdersCount >= 3 ? 'var(--gold)' : row.holdersCount >= 1 ? 'var(--green)' : 'var(--text-tertiary)' }}>
                        {row.holdersCount > 0 ? `${row.holdersCount} ⭐` : '—'}
                      </td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {row.topHolder ? `${row.topHolder.fund_name} (${row.topHolder.weight_pct?.toFixed(1)}%)` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {myTickersScored.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: 20, textAlign: 'center' }}>
                  Sin datos. Pulsa "🔄 Refrescar 13F" para descargar los holdings desde FMP.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ─── View 3: Consensus ─── */}
      {view === 'consensus' && (
        <>
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Mostrar tickers en al menos</span>
            {[2,3,4,5].map(n => (
              <button key={n} onClick={() => setConsensusMin(n)} style={pill(consensusMin === n)}>
                {n} fondos
              </button>
            ))}
          </div>
          {consensus.length === 0 ? (
            <EmptyState
              icon="⭐"
              title={`Ningún ticker en ${consensusMin}+ fondos`}
              description="Refresca los 13F primero, o baja el umbral."
            />
          ) : (
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Ticker</th>
                    <th style={{ ...th, textAlign: 'center' }}>Fondos</th>
                    <th style={{ ...th, textAlign: 'right' }}>Valor total</th>
                    <th style={{ ...th, textAlign: 'right' }}>Peso medio</th>
                    <th style={th}>Holders</th>
                  </tr>
                </thead>
                <tbody>
                  {consensus.map(row => {
                    const inMine = positionsWithWeight?.some(p => p.ticker === row.ticker);
                    return (
                      <tr key={row.ticker}>
                        <td style={td}>
                          <span style={tickerLink(row.ticker)} onClick={() => openAnalysis?.(row.ticker)}>{row.ticker}</span>
                          {inMine && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--gold)' }}>★</span>}
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>{(row.name || '').slice(0, 30)}</span>
                        </td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: 'var(--gold)' }}>{row.holders_count}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)' }}>{formatM(row.total_value_usd)}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)' }}>{row.avg_weight_pct?.toFixed(1)}%</td>
                        <td style={{ ...td, fontSize: 10, color: 'var(--text-tertiary)' }}>{(row.holder_names || '').slice(0, 60)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
