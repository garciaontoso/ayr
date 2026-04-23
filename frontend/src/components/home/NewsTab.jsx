import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';

// ── Severity → color + label ──
// Semantic tokens — match other severity panels across the app.
const SEVERITY_COLOR = {
  critical: 'var(--ds-danger)',
  warning:  'var(--ds-warning)',
  info:     'var(--ds-info)',
};
const SEVERITY_LABEL = {
  critical: 'CRITICAL',
  warning:  'WARNING',
  info:     'INFO',
};

// ── Sentiment → emoji ──
function sentimentEmoji(score) {
  if (score == null || isNaN(score)) return '·';
  if (score >= 0.4) return '📈';
  if (score <= -0.4) return '📉';
  return '·';
}

// ── Date helpers ──
function dayKey(iso) {
  if (!iso) return 'unknown';
  return String(iso).slice(0, 10);
}

function dayLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  const today = new Date();
  const yday = new Date(today.getTime() - 86400000);
  const sameDay = (a, b) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, yday))  return 'Ayer';
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function timeLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function NewsTab() {
  // ── State (declared FIRST to avoid TDZ) ──
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ critical: 0, warning: 0, info: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStats, setRefreshStats] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [daysFilter, setDaysFilter] = useState(7);             // 1 | 7 | 30
  const [severityFilter, setSeverityFilter] = useState('all'); // 'all' | 'critical' | 'warning' | 'info'
  const [tickerFilter, setTickerFilter] = useState('all');     // 'all' | 'portfolio' | specific ticker
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'earnings' | ...
  const [portfolioTickers, setPortfolioTickers] = useState(new Set());
  const [groupMode, setGroupMode] = useState('day');           // 'day' | 'ticker'
  const [selected, setSelected] = useState(null);              // item object for modal

  // Fetch portfolio tickers para el filter "Mi cartera"
  useEffect(() => {
    fetch(`${API_URL}/api/positions`).then(r => r.json()).then(d => {
      const arr = Array.isArray(d) ? d : (d.positions || []);
      setPortfolioTickers(new Set(arr.filter(p => (p.shares || 0) > 0).map(p => (p.ticker || '').toUpperCase())));
    }).catch(() => {});
  }, []);

  // ── Fetchers ──
  const fetchRecent = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('days', String(daysFilter));
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      const r = await fetch(`${API_URL}/api/news/recent?${params.toString()}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      setItems(Array.isArray(j.items) ? j.items : []);
      setCounts(j.counts || { critical: 0, warning: 0, info: 0 });
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e.message || 'Error al cargar noticias');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [daysFilter, severityFilter]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshStats(null);
    try {
      const token = localStorage.getItem('ayr_token') || '';
      const r = await fetch(`${API_URL}/api/news/refresh`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      setRefreshStats(j);
      await fetchRecent();
    } catch (e) {
      setError('Error al refrescar: ' + (e.message || ''));
    } finally {
      setRefreshing(false);
    }
  }, [fetchRecent]);

  // ── Initial load + refetch when filters change ──
  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  // ── Filtros client-side (ticker + portfolio + category) ──
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      // Ticker filter
      if (tickerFilter === 'portfolio') {
        const hasPortfolioTicker = (it.tickers || []).some(t => portfolioTickers.has(String(t).toUpperCase()));
        if (!hasPortfolioTicker) return false;
      } else if (tickerFilter !== 'all') {
        const filterUp = tickerFilter.toUpperCase();
        if (!(it.tickers || []).map(t => String(t).toUpperCase()).includes(filterUp)) return false;
      }
      // Category filter
      if (categoryFilter !== 'all' && it.category !== categoryFilter) return false;
      return true;
    });
  }, [items, tickerFilter, categoryFilter, portfolioTickers]);

  // Categorías disponibles + top tickers del resultado actual
  const availableCategories = useMemo(() => {
    const cs = new Set();
    items.forEach(it => { if (it.category) cs.add(it.category); });
    return Array.from(cs).sort();
  }, [items]);

  const tickerFrequency = useMemo(() => {
    const freq = new Map();
    filteredItems.forEach(it => {
      (it.tickers || []).forEach(t => {
        const T = String(t).toUpperCase();
        freq.set(T, (freq.get(T) || 0) + 1);
      });
    });
    return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredItems]);

  // ── Derived: group by day ó ticker ──
  const groupedByDay = useMemo(() => {
    const groups = new Map();
    for (const it of filteredItems) {
      const k = dayKey(it.published_at);
      if (!groups.has(k)) groups.set(k, { label: dayLabel(it.published_at), key: k, items: [] });
      groups.get(k).items.push(it);
    }
    return Array.from(groups.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [filteredItems]);

  const groupedByTicker = useMemo(() => {
    const groups = new Map();
    for (const it of filteredItems) {
      const tickers = it.tickers && it.tickers.length ? it.tickers : ['_GENERAL_'];
      for (const t of tickers) {
        const T = String(t).toUpperCase();
        if (!groups.has(T)) groups.set(T, { label: T === '_GENERAL_' ? 'Sin ticker' : T, key: T, items: [] });
        groups.get(T).items.push(it);
      }
    }
    return Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length);
  }, [filteredItems]);

  const groups = groupMode === 'ticker' ? groupedByTicker : groupedByDay;

  // ── Render helpers ──
  const totalCount = items.length;
  const criticalCount = counts.critical || 0;

  const chipBtn = (active, onClick, label) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 16,
        border: '1px solid var(--border)',
        background: active ? 'var(--gold)' : 'var(--subtle-bg)',
        color: active ? '#000' : 'var(--text-secondary)',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'var(--fm)',
      }}
    >
      {label}
    </button>
  );

  // ── Render states ──
  if (loading && !items.length) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
        Cargando noticias...
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
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Portfolio News
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>
            📰 {totalCount} noticias recientes
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {criticalCount > 0 && (
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 700,
                  background: SEVERITY_COLOR.critical,
                  color: '#fff',
                }}
              >
                {criticalCount} CRITICAL
              </span>
            )}
            {counts.warning > 0 && (
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 700,
                  background: SEVERITY_COLOR.warning,
                  color: '#000',
                }}
              >
                {counts.warning} WARNING
              </span>
            )}
            {counts.info > 0 && (
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  background: SEVERITY_COLOR.info,
                  color: '#fff',
                }}
              >
                {counts.info} INFO
              </span>
            )}
            {lastUpdated && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Actualizado: {lastUpdated.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '10px 18px',
            background: refreshing ? 'var(--subtle-bg)' : 'var(--green)',
            color: refreshing ? 'var(--text-secondary)' : '#fff',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: refreshing ? 'wait' : 'pointer',
          }}
        >
          {refreshing ? 'Refrescando (puede tardar ~60s)...' : '🔄 Refrescar'}
        </button>
      </div>

      {/* ── FILTER CHIPS ── */}
      <div
        style={{
          padding: 14,
          background: 'var(--subtle-bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginRight: 4 }}>Ventana:</span>
        {chipBtn(daysFilter === 1,  () => setDaysFilter(1),  '24h')}
        {chipBtn(daysFilter === 7,  () => setDaysFilter(7),  '7d')}
        {chipBtn(daysFilter === 30, () => setDaysFilter(30), '30d')}
        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 6px' }} />
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginRight: 4 }}>Severidad:</span>
        {chipBtn(severityFilter === 'all',      () => setSeverityFilter('all'),      'Todas')}
        {chipBtn(severityFilter === 'critical', () => setSeverityFilter('critical'), '🔴 Critical')}
        {chipBtn(severityFilter === 'warning',  () => setSeverityFilter('warning'),  '🟡 Warning')}
        {chipBtn(severityFilter === 'info',     () => setSeverityFilter('info'),     '🔵 Info')}
        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 6px' }} />
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginRight: 4 }}>Ticker:</span>
        {chipBtn(tickerFilter === 'all', () => setTickerFilter('all'), 'Todos')}
        {chipBtn(tickerFilter === 'portfolio', () => setTickerFilter('portfolio'), `💼 Mi cartera (${portfolioTickers.size})`)}
        {tickerFrequency.slice(0, 5).map(([t, count]) => chipBtn(
          tickerFilter === t,
          () => setTickerFilter(t),
          `${portfolioTickers.has(t) ? '★ ' : ''}${t} (${count})`,
        ))}
        {availableCategories.length > 1 && (
          <>
            <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 6px' }} />
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginRight: 4 }}>Tipo:</span>
            {chipBtn(categoryFilter === 'all', () => setCategoryFilter('all'), 'Todos')}
            {availableCategories.map(c => chipBtn(categoryFilter === c, () => setCategoryFilter(c), c))}
          </>
        )}
        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 6px' }} />
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginRight: 4 }}>Agrupar:</span>
        {chipBtn(groupMode === 'day', () => setGroupMode('day'), '📅 Por día')}
        {chipBtn(groupMode === 'ticker', () => setGroupMode('ticker'), '🏷 Por ticker')}
      </div>

      {/* ── REFRESH STATS BANNER ── */}
      {refreshStats && (
        <div
          style={{
            padding: 10,
            background: 'var(--subtle-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 12,
            fontFamily: 'var(--fm)',
            color: 'var(--text-secondary)',
          }}
        >
          Último refresh: fetched={refreshStats.fetched || 0}, deduped={refreshStats.deduped || 0}, classified={refreshStats.classified || 0}, inserted={refreshStats.inserted || 0}
        </div>
      )}

      {/* ── ERROR ── */}
      {error && (
        <div
          style={{
            padding: 14,
            background: 'var(--subtle-bg)',
            border: '1px solid var(--ds-danger)',
            borderRadius: 8,
            marginBottom: 16,
            color: 'var(--ds-danger)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* ── LISTA AGRUPADA POR DÍA ── */}
      {!loading && items.length === 0 && !error && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            background: 'var(--subtle-bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            color: 'var(--text-secondary)',
            fontSize: 14,
          }}
        >
          No hay noticias recientes en esta ventana. Pulsa <strong>🔄 Refrescar</strong> para pedir las últimas a FMP.
        </div>
      )}

      {groups.map((group) => (
        <div
          key={group.key}
          style={{
            background: 'var(--subtle-bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--subtle-bg)',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{group.label}</span>
            <span style={{ fontFamily: 'var(--fm)' }}>{group.items.length}</span>
          </div>
          <div>
            {group.items.map((it) => {
              const sevColor = SEVERITY_COLOR[it.severity] || SEVERITY_COLOR.info;
              return (
                <div
                  key={it.id}
                  onClick={() => setSelected(it)}
                  style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--border)',
                    display: 'grid',
                    gridTemplateColumns: '56px 1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)' }}>
                    {timeLabel(it.published_at)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.35, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sentimentEmoji(it.sentiment_score)} {it.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{it.source || '—'}</span>
                      {(it.tickers || []).slice(0, 4).map((t) => (
                        <span
                          key={t}
                          style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: 'var(--fm)',
                            background: 'var(--border)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {t}
                        </span>
                      ))}
                      {it.category && it.category !== 'general' && (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                          {it.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 700,
                      background: sevColor,
                      color: it.severity === 'warning' ? '#000' : '#fff',
                    }}
                  >
                    {SEVERITY_LABEL[it.severity] || 'INFO'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── MODAL DETALLE ── */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg, #0a0a0a)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              maxWidth: 680,
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: 24,
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 700,
                  background: SEVERITY_COLOR[selected.severity] || SEVERITY_COLOR.info,
                  color: selected.severity === 'warning' ? '#000' : '#fff',
                }}
              >
                {SEVERITY_LABEL[selected.severity] || 'INFO'}
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: 24,
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, lineHeight: 1.3, color: 'var(--text-primary)' }}>
              {selected.title}
            </h2>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
              <span>{selected.source || 'Unknown source'}</span>
              <span>·</span>
              <span>{new Date(selected.published_at).toLocaleString()}</span>
              <span>·</span>
              <span>{selected.category || 'general'}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {(selected.tickers || []).map((t) => (
                <span
                  key={t}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'var(--fm)',
                    background: 'var(--gold)',
                    color: '#000',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>

            <div
              style={{
                padding: 14,
                background: 'var(--subtle-bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 14,
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                marginBottom: 16,
              }}
            >
              {selected.summary || '(Sin resumen clasificado)'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  padding: 10,
                  background: 'var(--subtle-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Sentiment</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--fm)' }}>
                  {sentimentEmoji(selected.sentiment_score)} {selected.sentiment_score != null ? Number(selected.sentiment_score).toFixed(2) : '—'}
                </div>
              </div>
              <div
                style={{
                  padding: 10,
                  background: 'var(--subtle-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Relevancia</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--fm)' }}>
                  {selected.relevance_score != null ? (Number(selected.relevance_score) * 100).toFixed(0) + '%' : '—'}
                </div>
              </div>
            </div>

            <a
              href={selected.source_url || selected.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '10px 16px',
                background: 'var(--gold)',
                color: '#000',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Abrir fuente original ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
