// EarningsArchiveTab — SEC filings (10-K / 10-Q) + earnings-call transcript browser.
// Consumes the /api/earnings/archive/* endpoints already deployed on the worker:
//   GET /stats            — totals + grouped counts by ticker/doc_type
//   GET /list?ticker=&... — list of docs for a ticker
//   GET /get?id=          — raw text/plain body of a single doc
//   POST /analyze         — Opus trend analysis for the full ticker archive (cached server-side)
//
// No extra state is stored beyond component-local state. Results from /analyze
// are cached per ticker in `analysisByTicker` so that switching tickers doesn't
// re-trigger the expensive call.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { API_URL } from '../../constants/index.js';

const VERDICT_PRIORITY = { BUY: 0, ACCUMULATE: 1, HOLD: 2, TRIM: 3, SELL: 4 };
const VERDICT_COLORS = {
  BUY: { bg: 'rgba(34,197,94,.18)', fg: '#22c55e', border: '#22c55e' },
  ACCUMULATE: { bg: 'rgba(34,197,94,.10)', fg: '#86efac', border: '#86efac' },
  HOLD: { bg: 'rgba(212,175,55,.16)', fg: '#d4af37', border: '#d4af37' },
  TRIM: { bg: 'rgba(249,115,22,.16)', fg: '#fb923c', border: '#fb923c' },
  SELL: { bg: 'rgba(239,68,68,.16)', fg: '#ef4444', border: '#ef4444' },
};

function truncate(s, n) {
  if (!s) return '';
  const str = typeof s === 'string' ? s : (typeof s === 'object' ? (s.text || JSON.stringify(s)) : String(s));
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function safetyColor(score) {
  if (score == null) return 'var(--text-tertiary)';
  if (score >= 8) return '#22c55e';
  if (score >= 6) return '#d4af37';
  return '#ef4444';
}

function formatBytes(n) {
  if (n == null || isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('es-ES'); } catch { return d; }
}

const DOC_TYPE_LABEL = {
  '10-K': '10-K · Anual',
  '10-Q': '10-Q · Trim.',
  'transcript': 'Transcript',
  'earnings_call': 'Earnings Call',
};
const DOC_TYPE_COLOR = {
  '10-K': 'var(--gold)',
  '10-Q': '#64d2ff',
  'transcript': '#a78bfa',
  'earnings_call': '#a78bfa',
};

export default function EarningsArchiveTab() {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [loadingStats, setLoadingStats] = useState(true);

  const [selectedTicker, setSelectedTicker] = useState(null);
  const [tickerFilter, setTickerFilter] = useState('');

  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState('');

  const [viewingDoc, setViewingDoc] = useState(null);
  const [viewingBody, setViewingBody] = useState('');
  const [loadingBody, setLoadingBody] = useState(false);

  // Per-ticker cache: { AAPL: { analysis, loading, error } }
  const [analysisByTicker, setAnalysisByTicker] = useState({});

  // ── Heatmap view state ───────────────────────────────────
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'heatmap'
  const [cachedAnalyses, setCachedAnalyses] = useState([]); // [{ticker, updated_at, analysis}]
  const [cachedLoading, setCachedLoading] = useState(false);
  const [cachedError, setCachedError] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const bulkAbortRef = useRef(false);

  // ── Load stats on mount ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingStats(true);
      setStatsError('');
      try {
        const r = await fetch(`${API_URL}/api/earnings/archive/stats`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) setStatsError(e.message || 'Error cargando stats');
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load docs whenever selectedTicker changes ─────────────
  useEffect(() => {
    if (!selectedTicker) { setDocs([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingDocs(true);
      setDocsError('');
      try {
        const r = await fetch(`${API_URL}/api/earnings/archive/list?ticker=${encodeURIComponent(selectedTicker)}&limit=200`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        const rows = (data.rows || []).slice().sort((a, b) => {
          const da = a.filing_date || a.period_of_report || '';
          const db = b.filing_date || b.period_of_report || '';
          return db.localeCompare(da);
        });
        setDocs(rows);
      } catch (e) {
        if (!cancelled) setDocsError(e.message || 'Error cargando documentos');
      } finally {
        if (!cancelled) setLoadingDocs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedTicker]);

  // ── Open modal: just set the doc; fetch happens in effect below ──
  const openDoc = useCallback((doc) => {
    setViewingDoc(doc);
    setViewingBody('');
  }, []);

  // Fetch doc body when viewingDoc changes; abort on cleanup / new doc
  useEffect(() => {
    if (!viewingDoc) return;
    const ac = new AbortController();
    setLoadingBody(true);
    setViewingBody('');
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/earnings/archive/get?id=${viewingDoc.id}`, { signal: ac.signal });
        if (ac.signal.aborted) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        if (ac.signal.aborted) return;
        setViewingBody(text);
      } catch (e) {
        if (e.name === 'AbortError') return;
        setViewingBody(`Error cargando documento: ${e.message}`);
      } finally {
        if (!ac.signal.aborted) setLoadingBody(false);
      }
    })();
    return () => ac.abort();
  }, [viewingDoc?.id]);

  const closeDoc = useCallback(() => {
    setViewingDoc(null);
    setViewingBody('');
  }, []);

  // Esc closes modal
  useEffect(() => {
    if (!viewingDoc) return;
    const onKey = (e) => { if (e.key === 'Escape') closeDoc(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewingDoc, closeDoc]);

  // ── Analyze button ────────────────────────────────────────
  const runAnalyze = useCallback(async () => {
    if (!selectedTicker) return;
    const cur = analysisByTicker[selectedTicker];
    if (cur?.loading) return;
    setAnalysisByTicker(prev => ({ ...prev, [selectedTicker]: { loading: true, error: '', analysis: null } }));
    try {
      const r = await fetch(`${API_URL}/api/earnings/archive/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: selectedTicker }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setAnalysisByTicker(prev => ({
        ...prev,
        [selectedTicker]: { loading: false, error: '', analysis: data.analysis || null },
      }));
    } catch (e) {
      setAnalysisByTicker(prev => ({
        ...prev,
        [selectedTicker]: { loading: false, error: e.message || 'Error', analysis: null },
      }));
    }
  }, [selectedTicker, analysisByTicker]);

  // ── Heatmap: fetch all cached analyses ────────────────────
  const fetchCachedAnalyses = useCallback(async () => {
    setCachedLoading(true);
    setCachedError('');
    try {
      const r = await fetch(`${API_URL}/api/earnings/archive/analyses-cached`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setCachedAnalyses(data.items || []);
    } catch (e) {
      setCachedError(e.message || 'Error cargando verdictos');
    } finally {
      setCachedLoading(false);
    }
  }, []);

  // Auto-fetch when entering heatmap view
  useEffect(() => {
    if (viewMode === 'heatmap') fetchCachedAnalyses();
  }, [viewMode, fetchCachedAnalyses]);

  // Bulk analyzer for uncached tickers
  const runBulkAnalyze = useCallback(async (uncachedList) => {
    if (!uncachedList || uncachedList.length === 0) return;
    bulkAbortRef.current = false;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: uncachedList.length });
    for (let i = 0; i < uncachedList.length; i++) {
      if (bulkAbortRef.current) break;
      const ticker = uncachedList[i];
      try {
        const r = await fetch(`${API_URL}/api/earnings/archive/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker }),
        });
        if (r.ok) {
          const data = await r.json();
          if (data.analysis) {
            setCachedAnalyses(prev => {
              const next = prev.filter(x => x.ticker !== ticker);
              next.unshift({
                ticker,
                updated_at: data.cached_at || new Date().toISOString(),
                analysis: data.analysis,
              });
              return next;
            });
          }
        }
      } catch {}
      setBulkProgress({ done: i + 1, total: uncachedList.length });
      // Small delay between calls so we don't hammer the worker
      await new Promise(res => setTimeout(res, 600));
    }
    setBulkRunning(false);
  }, []);

  // ── Derived ───────────────────────────────────────────────
  const tickers = useMemo(() => {
    if (!stats?.by_ticker) return [];
    const arr = stats.by_ticker.slice().sort((a, b) => (b.n || 0) - (a.n || 0));
    if (!tickerFilter.trim()) return arr;
    const q = tickerFilter.trim().toUpperCase();
    return arr.filter(t => (t.ticker || '').toUpperCase().includes(q));
  }, [stats, tickerFilter]);

  const docsByType = useMemo(() => {
    const m = {};
    for (const d of docs) {
      const k = d.doc_type || 'other';
      (m[k] = m[k] || []).push(d);
    }
    return m;
  }, [docs]);

  const currentAnalysis = selectedTicker ? analysisByTicker[selectedTicker] : null;

  // Heatmap derived: sorted cards + verdict distribution + uncached list
  const sortedCachedCards = useMemo(() => {
    return cachedAnalyses.slice().sort((a, b) => {
      const va = (a.analysis?.long_term_verdict || 'HOLD').toUpperCase();
      const vb = (b.analysis?.long_term_verdict || 'HOLD').toUpperCase();
      const pa = VERDICT_PRIORITY[va] ?? 99;
      const pb = VERDICT_PRIORITY[vb] ?? 99;
      if (pa !== pb) return pa - pb;
      const sa = a.analysis?.dividend_safety_score ?? -1;
      const sb = b.analysis?.dividend_safety_score ?? -1;
      return sb - sa;
    });
  }, [cachedAnalyses]);

  const verdictDist = useMemo(() => {
    const d = { BUY: 0, ACCUMULATE: 0, HOLD: 0, TRIM: 0, SELL: 0 };
    for (const it of cachedAnalyses) {
      const v = (it.analysis?.long_term_verdict || '').toUpperCase();
      if (d[v] != null) d[v]++;
    }
    return d;
  }, [cachedAnalyses]);

  const uncachedTickers = useMemo(() => {
    const cachedSet = new Set(cachedAnalyses.map(x => x.ticker));
    const all = (stats?.by_ticker || []).map(t => t.ticker);
    return all.filter(t => t && !cachedSet.has(t));
  }, [cachedAnalyses, stats]);

  // ── Styles ────────────────────────────────────────────────
  const card = {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
    fontFamily: 'var(--fm)',
  };

  const statPill = {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'rgba(200,164,78,.08)',
    color: 'var(--gold)',
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'var(--fm)',
  };

  const primaryBtn = (disabled) => ({
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #06b6d4',
    background: disabled ? 'rgba(6,182,212,.1)' : '#06b6d4',
    color: disabled ? '#06b6d4' : '#fff',
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--fm)',
    opacity: disabled ? 0.6 : 1,
  });

  return (
    <div style={{ padding: '4px 8px' }}>
      {/* Header */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>
              📊 Archivo de Resultados
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              10-K, 10-Q y transcripts de earnings calls (últimos 3 años)
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {loadingStats && <div style={{ ...statPill, color: 'var(--text-tertiary)', background: 'transparent' }}>Cargando…</div>}
            {statsError && <div style={{ ...statPill, borderColor: '#ff6b6b', color: '#ff6b6b', background: 'transparent' }}>Error: {statsError}</div>}
            {stats && (
              <>
                <div style={statPill}>{stats.total_docs ?? 0} documentos</div>
                <div style={statPill}>{formatBytes(stats.total_bytes)}</div>
                <div style={statPill}>{(stats.by_ticker || []).length} tickers</div>
              </>
            )}
            {/* View-mode segmented control */}
            <div style={{
              display: 'inline-flex',
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
              marginLeft: 4,
            }}>
              {['list', 'heatmap'].map(m => {
                const active = viewMode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    style={{
                      padding: '6px 12px',
                      border: 'none',
                      background: active ? 'rgba(200,164,78,.18)' : 'transparent',
                      color: active ? 'var(--gold)' : 'var(--text-tertiary)',
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: 'var(--fm)',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {m === 'list' ? 'Lista' : 'Heatmap'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap view */}
      {viewMode === 'heatmap' && (
        <HeatmapView
          card={card}
          loading={cachedLoading}
          error={cachedError}
          items={sortedCachedCards}
          dist={verdictDist}
          uncachedTickers={uncachedTickers}
          bulkRunning={bulkRunning}
          bulkProgress={bulkProgress}
          onRefresh={fetchCachedAnalyses}
          onBulkAnalyze={runBulkAnalyze}
          onAbortBulk={() => { bulkAbortRef.current = true; }}
          onSelectTicker={(t) => {
            setSelectedTicker(t);
            setViewMode('list');
          }}
        />
      )}

      {/* Two-column layout (Lista) */}
      {viewMode === 'list' && (
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left pane: ticker list */}
        <div style={{ ...card, width: 280, flexShrink: 0, padding: 12, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
          <input
            type="text"
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            placeholder="Buscar ticker..."
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--subtle-bg, rgba(255,255,255,.03))',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'var(--fm)',
              boxSizing: 'border-box',
              marginBottom: 10,
            }}
          />
          <div style={{ overflowY: 'auto', flex: 1, marginRight: -6, paddingRight: 6 }}>
            {tickers.length === 0 && !loadingStats && (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: 16 }}>
                {tickerFilter ? 'Sin resultados' : 'Sin tickers disponibles'}
              </div>
            )}
            {tickers.map(t => {
              const active = t.ticker === selectedTicker;
              return (
                <div
                  key={t.ticker}
                  onClick={() => setSelectedTicker(t.ticker)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    marginBottom: 4,
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: active ? 'rgba(212,175,55,.14)' : 'transparent',
                    border: `1px solid ${active ? '#d4af37' : 'transparent'}`,
                    color: active ? '#d4af37' : 'var(--text-primary)',
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    fontFamily: 'var(--fm)',
                    transition: 'background .12s',
                  }}
                >
                  <span>{t.ticker}</span>
                  <span style={{ fontSize: 10, color: active ? '#d4af37' : 'var(--text-tertiary)', fontWeight: 700 }}>{t.n}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right pane */}
        <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selectedTicker && (
            <div style={{ ...card, textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontSize: 13 }}>
              📁 Selecciona un ticker para ver sus documentos
            </div>
          )}

          {selectedTicker && (
            <>
              {/* Sub-header with analyze button */}
              <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>{selectedTicker}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {loadingDocs ? 'Cargando documentos…' : `${docs.length} documento${docs.length !== 1 ? 's' : ''} disponible${docs.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
                <button
                  onClick={runAnalyze}
                  disabled={currentAnalysis?.loading}
                  style={primaryBtn(currentAnalysis?.loading)}
                >
                  {currentAnalysis?.loading ? '⏳ Analizando (30-90s)…' : '🤖 Analizar tendencia con Opus'}
                </button>
              </div>

              {/* Analysis result card */}
              {currentAnalysis?.error && (
                <div style={{ ...card, borderColor: '#ff6b6b', color: '#ff6b6b', fontSize: 11 }}>
                  Error en análisis: {currentAnalysis.error}
                </div>
              )}
              {currentAnalysis?.analysis && (
                <AnalysisCard analysis={currentAnalysis.analysis} />
              )}

              {/* Docs table */}
              {docsError && (
                <div style={{ ...card, borderColor: '#ff6b6b', color: '#ff6b6b', fontSize: 11 }}>
                  {docsError}
                </div>
              )}
              {!loadingDocs && !docsError && docs.length === 0 && (
                <div style={{ ...card, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                  Sin documentos archivados para {selectedTicker}
                </div>
              )}
              {docs.length > 0 && (
                <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--fm)' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,.03)' }}>
                        <th style={th}>Tipo</th>
                        <th style={th}>Fecha</th>
                        <th style={th}>FY / FQ</th>
                        <th style={{ ...th, textAlign: 'right' }}>Tamaño</th>
                        <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(docsByType).map(type => (
                        <React.Fragment key={type}>
                          <tr>
                            <td
                              colSpan={5}
                              style={{
                                padding: '8px 14px',
                                fontSize: 10,
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                color: DOC_TYPE_COLOR[type] || 'var(--text-tertiary)',
                                background: 'rgba(255,255,255,.02)',
                                borderTop: '1px solid var(--border)',
                                borderBottom: '1px solid var(--border)',
                                letterSpacing: 0.5,
                              }}
                            >
                              {DOC_TYPE_LABEL[type] || type} · {docsByType[type].length}
                            </td>
                          </tr>
                          {docsByType[type].map(d => (
                            <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={td}>
                                <span style={{ color: DOC_TYPE_COLOR[d.doc_type] || 'var(--text-primary)', fontWeight: 700 }}>
                                  {d.doc_type}
                                </span>
                              </td>
                              <td style={td}>{formatDate(d.filing_date || d.period_of_report)}</td>
                              <td style={td}>
                                {d.fiscal_year ? `FY${String(d.fiscal_year).slice(-2)}` : '—'}
                                {d.fiscal_quarter ? ` Q${d.fiscal_quarter}` : ''}
                              </td>
                              <td style={{ ...td, textAlign: 'right', color: 'var(--text-tertiary)' }}>{formatBytes(d.size_bytes)}</td>
                              <td style={{ ...td, textAlign: 'right' }}>
                                <button
                                  onClick={() => openDoc(d)}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--gold)',
                                    cursor: 'pointer',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    fontFamily: 'var(--fm)',
                                  }}
                                >
                                  👁 Ver
                                </button>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {/* Modal */}
      {viewingDoc && (
        <div
          onClick={closeDoc}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.78)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              width: '100%',
              maxWidth: 1100,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              fontFamily: 'var(--fm)',
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
              background: 'rgba(255,255,255,.02)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>
                  {viewingDoc.ticker} · {viewingDoc.doc_type}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {formatDate(viewingDoc.filing_date || viewingDoc.period_of_report)}
                  {viewingDoc.fiscal_year ? ` · FY${String(viewingDoc.fiscal_year).slice(-2)}` : ''}
                  {viewingDoc.fiscal_quarter ? ` Q${viewingDoc.fiscal_quarter}` : ''}
                  {viewingDoc.accession_number ? ` · ${viewingDoc.accession_number}` : ''}
                  {viewingDoc.size_bytes ? ` · ${formatBytes(viewingDoc.size_bytes)}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {viewingDoc.source_url && (
                  <a
                    href={viewingDoc.source_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      color: 'var(--gold)',
                      fontSize: 10,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Fuente ↗
                  </a>
                )}
                <button
                  onClick={closeDoc}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: 'var(--fm)',
                  }}
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
              {loadingBody ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', padding: 40 }}>
                  Cargando documento…
                </div>
              ) : (
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 11,
                  lineHeight: 1.55,
                  color: 'var(--text-secondary)',
                  margin: 0,
                }}>
                  {viewingBody}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────
const th = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  letterSpacing: 0.5,
  borderBottom: '1px solid var(--border)',
};
const td = {
  padding: '8px 14px',
  color: 'var(--text-primary)',
  verticalAlign: 'middle',
};

function AnalysisCard({ analysis }) {
  const confidence = (analysis.confidence || '').toLowerCase();
  const confColor = confidence === 'high' ? 'var(--green)'
    : confidence === 'medium' ? 'var(--gold)'
    : confidence === 'low' ? '#ff6b6b'
    : 'var(--text-tertiary)';

  const card = {
    background: 'var(--card)',
    border: '1px solid var(--gold)',
    borderRadius: 12,
    padding: 18,
    fontFamily: 'var(--fm)',
  };
  const h = {
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)',
    letterSpacing: 0.5,
    marginBottom: 6,
  };
  const bullets = (items) => {
    if (!items) return null;
    const list = Array.isArray(items) ? items : String(items).split('\n').filter(Boolean);
    if (list.length === 0) return <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</div>;
    return (
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        {list.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{typeof x === 'string' ? x : JSON.stringify(x)}</li>)}
      </ul>
    );
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        🤖 Análisis Opus
      </div>

      {analysis.summary && (
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, marginBottom: 14 }}>
          {analysis.summary}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        marginBottom: 14,
      }}>
        <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={h}>Revenue trend</div>
          <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{analysis.revenue_trend || '—'}</div>
        </div>
        <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={h}>Margin trend</div>
          <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{analysis.margin_trend || '—'}</div>
        </div>
        <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={h}>Confidence</div>
          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 999,
            background: `${confColor}22`,
            color: confColor,
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
          }}>{analysis.confidence || '—'}</span>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={h}>Guidance changes</div>
        {bullets(analysis.guidance_changes)}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={h}>Emerging risks</div>
        {bullets(analysis.emerging_risks)}
      </div>

      {analysis.thesis_update && (
        <div>
          <div style={h}>Thesis update</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.55 }}>
            {analysis.thesis_update}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Heatmap view ─────────────────────────────────────────────
function HeatmapView({
  card, loading, error, items, dist, uncachedTickers,
  bulkRunning, bulkProgress, onRefresh, onBulkAnalyze, onAbortBulk, onSelectTicker,
}) {
  const total = items.length;
  const estCost = uncachedTickers.length; // ~$1/ticker
  const btn = (style = {}) => ({
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--fm)',
    ...style,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stats + actions bar */}
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
            {total} verdicto{total !== 1 ? 's' : ''} cacheado{total !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(dist).filter(([, n]) => n > 0).map(([v, n]) => (
              <span key={v} style={{ color: VERDICT_COLORS[v]?.fg || 'var(--text-tertiary)', fontWeight: 800 }}>
                {n} {v}
              </span>
            ))}
            {total === 0 && <span>—</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {bulkRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700 }}>
                {bulkProgress.done}/{bulkProgress.total} analizados
              </div>
              <div style={{
                width: 120, height: 6, borderRadius: 999,
                background: 'rgba(255,255,255,.06)', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%`,
                  height: '100%', background: 'var(--gold)', transition: 'width .2s',
                }} />
              </div>
              <button onClick={onAbortBulk} style={btn({ borderColor: '#ff6b6b', color: '#ff6b6b' })}>
                Cancelar
              </button>
            </div>
          )}
          <button onClick={onRefresh} disabled={loading || bulkRunning} style={btn({ opacity: (loading || bulkRunning) ? 0.5 : 1 })}>
            🔄 Refrescar
          </button>
          <button
            onClick={() => onBulkAnalyze(uncachedTickers)}
            disabled={bulkRunning || uncachedTickers.length === 0}
            style={btn({
              borderColor: '#06b6d4',
              background: uncachedTickers.length === 0 ? 'transparent' : 'rgba(6,182,212,.12)',
              color: '#06b6d4',
              opacity: (bulkRunning || uncachedTickers.length === 0) ? 0.5 : 1,
            })}
          >
            🚀 Analizar toda la cartera ({uncachedTickers.length} pend · ~${estCost})
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ ...card, borderColor: '#ff6b6b', color: '#ff6b6b', fontSize: 11 }}>
          Error: {error}
        </div>
      )}

      {/* Loading */}
      {loading && total === 0 && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, padding: 30 }}>
          Cargando verdictos cacheados…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && total === 0 && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, padding: 40, lineHeight: 1.6 }}>
          No hay análisis cacheados aún.<br />
          Abre alguna empresa en la vista <b style={{ color: 'var(--gold)' }}>Lista</b> y pulsa "Analizar con Opus" para generar el primero.
        </div>
      )}

      {/* Grid */}
      {total > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}>
          {items.map(it => (
            <VerdictCard key={it.ticker} item={it} onClick={() => onSelectTicker(it.ticker)} />
          ))}
        </div>
      )}
    </div>
  );
}

function VerdictCard({ item, onClick }) {
  const a = item.analysis || {};
  const verdict = (a.long_term_verdict || 'HOLD').toUpperCase();
  const colors = VERDICT_COLORS[verdict] || VERDICT_COLORS.HOLD;
  const safety = a.dividend_safety_score;
  const safetyN = typeof safety === 'number' ? safety : null;
  const sBarColor = safetyColor(safetyN);
  const conf = (a.confidence || '').toLowerCase();
  const confColor = conf === 'high' ? '#22c55e' : conf === 'medium' ? '#d4af37' : conf === 'low' ? '#ef4444' : 'var(--text-tertiary)';

  const yes = Array.isArray(a.why_yes) ? a.why_yes.slice(0, 2) : [];
  const no = Array.isArray(a.why_no) ? a.why_no.slice(0, 2) : [];

  let updatedStr = '';
  if (item.updated_at) {
    try { updatedStr = new Date(item.updated_at.replace(' ', 'T') + 'Z').toLocaleDateString('es-ES'); }
    catch { updatedStr = item.updated_at; }
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: 14,
        fontFamily: 'var(--fm)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'transform .12s, box-shadow .12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 20px ${colors.bg}`; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Header: ticker + verdict badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 22, fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>
          {item.ticker}
        </div>
        <div style={{
          padding: '5px 10px',
          borderRadius: 6,
          background: colors.bg,
          color: colors.fg,
          border: `1px solid ${colors.border}`,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.5,
        }}>
          {verdict}
        </div>
      </div>

      {/* Safety + confidence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Safety
          </div>
          <div style={{ fontSize: 12, color: sBarColor, fontWeight: 800 }}>
            {safetyN != null ? `${safetyN}/10` : '—'}
          </div>
          <div style={{
            flex: 1, height: 5, borderRadius: 999,
            background: 'rgba(255,255,255,.06)', overflow: 'hidden', minWidth: 40,
          }}>
            <div style={{
              width: `${safetyN != null ? Math.max(0, Math.min(100, safetyN * 10)) : 0}%`,
              height: '100%', background: sBarColor,
            }} />
          </div>
        </div>
        <div style={{
          padding: '3px 8px',
          borderRadius: 999,
          background: `${confColor}22`,
          color: confColor,
          fontSize: 9,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}>
          Confianza: {a.confidence || '—'}
        </div>
      </div>

      {/* Bullets */}
      {(yes.length > 0 || no.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {yes.map((y, i) => (
            <div key={`y${i}`} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              <span style={{ color: '#22c55e', fontWeight: 800, marginRight: 4 }}>✓</span>
              {truncate(y, 60)}
            </div>
          ))}
          {no.map((n, i) => (
            <div key={`n${i}`} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              <span style={{ color: '#ef4444', fontWeight: 800, marginRight: 4 }}>✗</span>
              {truncate(n, 60)}
            </div>
          ))}
        </div>
      )}

      {/* Updated */}
      {updatedStr && (
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 'auto', textAlign: 'right' }}>
          actualizado {updatedStr}
        </div>
      )}
    </div>
  );
}
