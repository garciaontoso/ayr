import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { API_URL } from '../../constants/index.js';
import { FiveFiltersBadge } from '../ui/FiveFiltersBadge.jsx';

const DiscoveryTab      = lazy(() => import('./DiscoveryTab'));
const DividendScannerTab = lazy(() => import('./DividendScannerTab'));

const CANTERA_SUB_TABS = [
  { id: 'radar',   lbl: 'Radar',   ico: '🎯', desc: '100 candidatos priorizados' },
  { id: 'scanner', lbl: 'Scanner', ico: '🔎', desc: 'Filtros por métricas' },
  { id: 'discovery', lbl: 'Discovery', ico: '💡', desc: 'Vista Q+S por tiers' },
];

function SubTabSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 0' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ height: 60, background: 'var(--card)', borderRadius: 12, opacity: 0.6 }} />
      ))}
    </div>
  );
}

// ── Cantera (Farm Team) — pre-portfolio radar tab ─────────────────
// Shows 100 candidate companies ranked by priority_score.
// Sources: Dividend Aristocrats | Smart Money | Deep Dividend | Sector Leaders | Manual

// Create a price alert for a ticker — shared by Cantera + portfolio lists.
// Opens a native prompt for the threshold; POSTs to /api/alert-rules/add.
// Returns true on success, false on cancel/error.
async function createPriceAlert(ticker, currentPrice) {
  const suggestedDefault = currentPrice && currentPrice > 0
    ? (currentPrice * 0.9).toFixed(2)  // -10% by default (natural entry trigger)
    : '';
  const msg = currentPrice
    ? `Alerta para ${ticker}\nPrecio actual: $${currentPrice.toFixed(2)}\n\n¿A qué precio por debajo quieres aviso?`
    : `Alerta para ${ticker}\n\n¿A qué precio por debajo quieres aviso?`;
  const raw = window.prompt(msg, suggestedDefault);
  if (raw == null || raw === '') return false;
  const threshold = Number(raw);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    alert(`Precio inválido: "${raw}"`);
    return false;
  }
  try {
    const r = await fetch(`${API_URL}/api/alert-rules/add`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        rule_type: 'price_below',
        operator: '<',
        threshold,
        unit: '$',
        message: `${ticker} bajó a $${threshold}`,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      alert(`Error creando alerta: ${data.error || r.statusText}`);
      return false;
    }
    return true;
  } catch (e) {
    alert(`Error: ${e.message}`);
    return false;
  }
}

// Score 0-100 → color
function scoreColor(s) {
  if (s >= 80) return '#c8a44e'; // gold
  if (s >= 60) return '#30d158'; // green
  if (s >= 40) return '#ff9f0a'; // amber
  return '#8e8e93';              // gray
}

function scoreBg(s) {
  if (s >= 80) return 'rgba(200,164,78,.12)';
  if (s >= 60) return 'rgba(48,209,88,.10)';
  if (s >= 40) return 'rgba(255,159,10,.10)';
  return 'rgba(142,142,147,.10)';
}

const SOURCE_META = {
  aristocrat:    { label: 'Aristocrat', color: '#c8a44e' },
  smart_money:   { label: 'Smart Money', color: '#64d2ff' },
  deep_dividend: { label: 'Deep Div', color: '#30d158' },
  sector_leader: { label: 'Sector Lead', color: '#bf5af2' },
  manual:        { label: 'Manual', color: '#ff9f0a' },
};

function SourceBadge({ src }) {
  const meta = SOURCE_META[src] || { label: src, color: '#8e8e93' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 5,
      background: `${meta.color}18`, border: `1px solid ${meta.color}40`,
      color: meta.color, fontSize: 9, fontWeight: 700, margin: '1px 2px',
      whiteSpace: 'nowrap', fontFamily: 'var(--fm)',
    }}>
      {meta.label}
    </span>
  );
}

function ScorePill({ score }) {
  const c = scoreColor(score);
  const bg = scoreBg(score);
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 8,
      background: bg, color: c, fontSize: 13, fontWeight: 800,
      fontFamily: 'var(--fm)', minWidth: 36, textAlign: 'center',
    }}>
      {score}
    </span>
  );
}

// Featured card for top 10
function FeaturedCard({ c, onAction }) {
  const color = scoreColor(c.priority_score);
  const bg = scoreBg(c.priority_score);
  const sources = (c.sources || '').split(',').filter(Boolean);

  return (
    <div style={{
      background: 'var(--card)', border: `1px solid ${color}40`,
      borderRadius: 14, padding: '16px 18px', minWidth: 200, flex: '1 1 200px',
      display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: `0 0 0 1px ${color}20`,
    }}>
      {/* Score + ticker row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--fb)' }}>
            {c.ticker}
          </div>
          {c.name && c.name !== c.ticker && (
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', marginTop: 1 }}>
              {c.name.length > 22 ? c.name.slice(0, 22) + '…' : c.name}
            </div>
          )}
        </div>
        <div style={{
          background: bg, borderRadius: 10, padding: '6px 10px',
          textAlign: 'center', minWidth: 48,
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color, fontFamily: 'var(--fm)', lineHeight: 1 }}>
            {c.priority_score}
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 2 }}>
            SCORE
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {c.yield_pct > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#30d158', fontFamily: 'var(--fm)' }}>{c.yield_pct.toFixed(2)}%</div>
            <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>YIELD</div>
          </div>
        )}
        {c.dgr_5y > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64d2ff', fontFamily: 'var(--fm)' }}>{c.dgr_5y.toFixed(1)}%</div>
            <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>DGR5</div>
          </div>
        )}
        {c.streak_years > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#c8a44e', fontFamily: 'var(--fm)' }}>{c.streak_years}y</div>
            <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>STREAK</div>
          </div>
        )}
        {c.smart_money_conviction > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64d2ff', fontFamily: 'var(--fm)' }}>{c.smart_money_conviction}</div>
            <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>FUNDS</div>
          </div>
        )}
      </div>

      {/* Sector */}
      {c.sector && (
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fb)' }}>{c.sector}</div>
      )}

      {/* Sources */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
        {sources.map(s => <SourceBadge key={s} src={s} />)}
      </div>

      {/* Reason */}
      {c.reason_to_watch && (
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fb)', fontStyle: 'italic', lineHeight: 1.4 }}>
          {c.reason_to_watch.slice(0, 80)}
        </div>
      )}

      {/* 5-Filter badge (partial — management derived from safety_score) */}
      <div style={{ marginTop: 4 }}>
        <FiveFiltersBadge filters={deriveFilters(c)} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button
          onClick={() => onAction(c, 'watchlist')}
          title="Promote to watchlist"
          style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid #c8a44e40', background: 'rgba(200,164,78,.1)', color: '#c8a44e', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--fb)', fontWeight: 600 }}
        >
          Watchlist
        </button>
        <button
          onClick={async () => {
            const ok = await createPriceAlert(c.ticker, c.last_price);
            if (ok) alert(`✔ Alerta creada para ${c.ticker}`);
          }}
          title="Crear alerta de precio"
          style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid rgba(100,210,255,.3)', background: 'rgba(100,210,255,.08)', color: '#64d2ff', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--fb)' }}
        >
          🔔
        </button>
        <button
          onClick={() => onAction(c, 'rejected')}
          title="Reject"
          style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid rgba(255,69,58,.3)', background: 'rgba(255,69,58,.08)', color: '#ff453a', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--fb)' }}
        >
          X
        </button>
      </div>
    </div>
  );
}

// Table row for the full list
function CandidateRow({ c, rank, onAction, onDelete }) {
  const _color = scoreColor(c.priority_score);
  const sources = (c.sources || '').split(',').filter(Boolean);

  return (
    <tr style={{ borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--row-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '8px 10px', color: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--fm)', textAlign: 'center', width: 36 }}>{rank}</td>
      <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: 'var(--fb)', fontSize: 13 }}>{c.ticker}</td>
      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--fb)', maxWidth: 160, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {c.name && c.name !== c.ticker ? c.name : '—'}
      </td>
      <td style={{ padding: '8px 6px', color: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--fb)' }}>
        {c.sector ? c.sector.slice(0, 18) : '—'}
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <ScorePill score={c.priority_score} />
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'right', color: c.yield_pct > 0 ? '#30d158' : 'var(--text-tertiary)', fontSize: 12, fontFamily: 'var(--fm)', fontWeight: c.yield_pct > 0 ? 700 : 400 }}>
        {c.yield_pct > 0 ? c.yield_pct.toFixed(2) + '%' : '—'}
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'right', color: c.dgr_5y > 0 ? '#64d2ff' : 'var(--text-tertiary)', fontSize: 12, fontFamily: 'var(--fm)', fontWeight: c.dgr_5y > 0 ? 700 : 400 }}>
        {c.dgr_5y > 0 ? c.dgr_5y.toFixed(1) + '%' : '—'}
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--fm)' }}>
        {c.payout_ratio > 0 ? c.payout_ratio.toFixed(0) + '%' : '—'}
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'right', color: c.streak_years >= 25 ? '#c8a44e' : 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--fm)', fontWeight: c.streak_years >= 25 ? 700 : 400 }}>
        {c.streak_years > 0 ? c.streak_years + 'y' : '—'}
      </td>
      <td style={{ padding: '8px 6px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {sources.slice(0, 3).map(s => <SourceBadge key={s} src={s} />)}
        </div>
      </td>
      <td style={{ padding: '8px 6px' }}>
        <FiveFiltersBadge filters={deriveFilters(c)} />
      </td>
      <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => onAction(c, 'watchlist')}
            title="Promote to watchlist"
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #c8a44e40', background: 'rgba(200,164,78,.1)', color: '#c8a44e', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--fb)', fontWeight: 600 }}
          >
            Watchlist
          </button>
          <button
            onClick={async () => {
              const ok = await createPriceAlert(c.ticker, c.last_price);
              if (ok) alert(`✔ Alerta creada para ${c.ticker}`);
            }}
            title="Crear alerta de precio"
            style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid rgba(100,210,255,.3)', background: 'rgba(100,210,255,.08)', color: '#64d2ff', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--fb)' }}
          >
            🔔
          </button>
          <button
            onClick={() => onAction(c, 'rejected')}
            title="Reject"
            style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid rgba(255,69,58,.3)', background: 'rgba(255,69,58,.08)', color: '#ff453a', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--fb)' }}
          >
            X
          </button>
          <button
            onClick={() => onDelete(c)}
            title="Delete"
            style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--fb)' }}
          >
            Del
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Derive partial 5-filter scores from cantera DB fields ──────────────────
// Only Management (F3) can be derived: safety_score is an 0-10 div-safety proxy.
// All other filters require manual deep-dive analysis → null = pending.
// conviction (F5) is always null (user-owned per A&R framework).
function deriveFilters(c) {
  const mgmt = c.safety_score != null ? Math.min(10, Math.max(0, Math.round(c.safety_score))) : null;
  return {
    business:   null,
    moat:       null,
    management: mgmt,
    valuation:  null,
    conviction: null,
  };
}

// Composite of whatever non-null filters are available
function _filterComposite(c) {
  const f = deriveFilters(c);
  const vals = Object.values(f).filter(v => v !== null);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

const SORT_KEYS = {
  rank:    null,
  ticker:  'ticker',
  score:   'priority_score',
  yield:   'yield_pct',
  dgr:     'dgr_5y',
  payout:  'payout_ratio',
  streak:  'streak_years',
  safety:  'safety_score',
};

// ── Radar sub-view (former full CanteraTab body) ────────────────────────────
function RadarView() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('radar');
  const [sectorFilter, setSectorFilter] = useState('');
  const [sortKey, setSortKey] = useState('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [addTicker, setAddTicker] = useState('');
  const [addReason, setAddReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const token = typeof window !== 'undefined'
    ? (window.__AYR_TOKEN || localStorage.getItem('ayr_token') || '')
    : '';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '150', status: statusFilter || 'all' });
      if (sectorFilter) params.set('sector', sectorFilter);
      const r = await fetch(`${API_URL}/api/cantera/list?${params}`);
      const data = await r.json();
      setCandidates(data.candidates || []);
    } catch (e) {
      setError(String(e.message || e));
    }
    setLoading(false);
  }, [statusFilter, sectorFilter]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setActionMsg('');
    try {
      const r = await fetch(`${API_URL}/api/cantera/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await r.json();
      if (data.ok) {
        setActionMsg(`Refreshed: ${data.total_candidates} candidates | Aristocrats: ${data.source_breakdown?.aristocrat || 0} | Smart Money: ${data.source_breakdown?.smart_money || 0} | Deep Div: ${data.source_breakdown?.deep_dividend || 0}`);
        await load();
      } else {
        setActionMsg(data.error || 'Refresh failed');
      }
    } catch (e) {
      setActionMsg('Error: ' + String(e.message || e));
    }
    setRefreshing(false);
  }, [load]);

  const handleAction = useCallback(async (candidate, newStatus) => {
    try {
      const r = await fetch(`${API_URL}/api/cantera/${candidate.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await r.json();
      if (data.ok) {
        setActionMsg(`${candidate.ticker} → ${newStatus}`);
        setCandidates(prev => prev.filter(c => c.id !== candidate.id || statusFilter === 'all'));
        await load();
      }
    } catch (e) {
      setActionMsg('Error: ' + String(e.message || e));
    }
  }, [statusFilter, load]);

  const handleDelete = useCallback(async (candidate) => {
    if (!window.confirm(`Delete ${candidate.ticker} from cantera?`)) return;
    try {
      const r = await fetch(`${API_URL}/api/cantera/${candidate.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await r.json();
      if (data.ok) {
        setActionMsg(`${candidate.ticker} deleted`);
        setCandidates(prev => prev.filter(c => c.id !== candidate.id));
      }
    } catch (e) {
      setActionMsg('Error: ' + String(e.message || e));
    }
  }, []);

  const handleAdd = useCallback(async () => {
    const t = addTicker.trim().toUpperCase();
    if (!t) return;
    setAdding(true);
    setAddMsg('');
    try {
      const r = await fetch(`${API_URL}/api/cantera/add`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t, reason: addReason || undefined }),
      });
      const data = await r.json();
      if (data.ok) {
        setAddMsg(`${t} added`);
        setAddTicker('');
        setAddReason('');
        await load();
      } else {
        setAddMsg(data.error || 'Add failed');
      }
    } catch (e) {
      setAddMsg('Error: ' + String(e.message || e));
    }
    setAdding(false);
  }, [addTicker, addReason, token, load]);

  // Sort candidates client-side
  const sorted = [...candidates].sort((a, b) => {
    const k = SORT_KEYS[sortKey];
    if (!k) return 0;
    const va = a[k] ?? (typeof a[k] === 'number' ? 0 : '');
    const vb = b[k] ?? (typeof b[k] === 'number' ? 0 : '');
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortAsc ? va - vb : vb - va;
  });

  const top10 = sorted.filter(c => c.status === 'radar').slice(0, 10);
  const _tableRows = sorted.filter((_, i) => i >= 10 || candidates.findIndex(c => c.id === sorted[i]?.id) >= 10);
  // Simpler: show all in table, first 10 also shown in featured cards
  const tableAll = sorted;

  // Unique sectors for filter
  const sectors = [...new Set(candidates.map(c => c.sector).filter(Boolean))].sort();

  function SortTh({ label, sk }) {
    const active = sortKey === sk;
    return (
      <th
        style={{ padding: '8px 6px', cursor: 'pointer', fontSize: 10, fontWeight: active ? 800 : 600, color: active ? 'var(--gold)' : 'var(--text-tertiary)', fontFamily: 'var(--fm)', whiteSpace: 'nowrap', userSelect: 'none', textAlign: sk === 'ticker' || sk === 'rank' ? 'left' : 'right' }}
        onClick={() => { if (sortKey === sk) setSortAsc(a => !a); else { setSortKey(sk); setSortAsc(false); } }}
      >
        {label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </th>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, fontFamily: 'var(--fb)', color: 'var(--text-primary)' }}>
            Cantera <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: 14 }}>— {candidates.length} candidatos</span>
          </h2>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: 'var(--fb)' }}>
            Pre-portfolio radar · Aristócratas | Smart Money | Deep Dividend | Sector Leaders
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--gold)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: refreshing ? 'wait' : 'pointer', fontFamily: 'var(--fb)', opacity: refreshing ? 0.7 : 1 }}
          >
            {refreshing ? 'Actualizando…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Action message ─────────────────────────────────────── */}
      {actionMsg && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(200,164,78,.1)', border: '1px solid #c8a44e40', color: '#c8a44e', fontSize: 12, fontFamily: 'var(--fb)' }}>
          {actionMsg}
        </div>
      )}

      {/* ── Filters row ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {['radar','watchlist','bought','rejected','all'].map(s => (
          <button key={s}
            onClick={() => setStatusFilter(s)}
            style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${statusFilter === s ? 'var(--gold)' : 'var(--border)'}`, background: statusFilter === s ? 'var(--gold-dim)' : 'transparent', color: statusFilter === s ? 'var(--gold)' : 'var(--text-tertiary)', fontSize: 11, fontWeight: statusFilter === s ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--fb)' }}>
            {s}
          </button>
        ))}
        <select
          value={sectorFilter}
          onChange={e => setSectorFilter(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--fb)', cursor: 'pointer' }}
        >
          <option value="">Todos los sectores</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Error / Loading ─────────────────────────────────────── */}
      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,69,58,.1)', border: '1px solid rgba(255,69,58,.3)', color: '#ff453a', fontSize: 12, fontFamily: 'var(--fb)' }}>
          {error}
        </div>
      )}
      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14, fontFamily: 'var(--fb)' }}>
          Cargando candidatos…
        </div>
      )}

      {!loading && candidates.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14, fontFamily: 'var(--fb)' }}>
          No hay candidatos. Haz clic en Refresh para poblar.
        </div>
      )}

      {/* ── Top 10 Featured Cards ───────────────────────────────── */}
      {!loading && top10.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Top 10 — Destacados
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {top10.map(c => (
              <FeaturedCard key={c.id} c={c} onAction={handleAction} />
            ))}
          </div>
        </div>
      )}

      {/* ── Full Table ──────────────────────────────────────────── */}
      {!loading && tableAll.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Todos los candidatos ({tableAll.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <SortTh label="#" sk="rank" />
                  <SortTh label="Ticker" sk="ticker" />
                  <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', textAlign: 'left' }}>Nombre</th>
                  <th style={{ padding: '8px 6px', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', textAlign: 'left' }}>Sector</th>
                  <SortTh label="Score" sk="score" />
                  <SortTh label="Yield" sk="yield" />
                  <SortTh label="DGR5" sk="dgr" />
                  <SortTh label="Payout" sk="payout" />
                  <SortTh label="Streak" sk="streak" />
                  <th style={{ padding: '8px 6px', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Fuentes</th>
                  <SortTh label="Safety(F3)" sk="safety" />
                  <th style={{ padding: '8px 8px', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tableAll.map((c, i) => (
                  <CandidateRow
                    key={c.id}
                    c={c}
                    rank={i + 1}
                    onAction={handleAction}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Manual Add ─────────────────────────────────────────── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Agregar manualmente
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', marginBottom: 4 }}>Ticker</div>
            <input
              value={addTicker}
              onChange={e => setAddTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="MSFT"
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--fm)', width: 100 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', marginBottom: 4 }}>Razón (opcional)</div>
            <input
              value={addReason}
              onChange={e => setAddReason(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Por qué vigilar esta empresa…"
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fb)', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !addTicker.trim()}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--gold)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: adding ? 'wait' : 'pointer', fontFamily: 'var(--fb)', opacity: adding || !addTicker.trim() ? 0.6 : 1 }}
          >
            {adding ? 'Agregando…' : 'Agregar'}
          </button>
        </div>
        {addMsg && (
          <div style={{ marginTop: 8, fontSize: 11, color: addMsg.startsWith('Error') ? '#ff453a' : '#30d158', fontFamily: 'var(--fb)' }}>
            {addMsg}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CanteraTab — shell with sub-tab switcher ────────────────────────────────
export default function CanteraTab() {
  const [subTab, setSubTab] = useState(() => localStorage.getItem('cantera_subtab') || 'radar');

  function switchSub(id) {
    setSubTab(id);
    localStorage.setItem('cantera_subtab', id);
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {CANTERA_SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => switchSub(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${subTab === t.id ? 'var(--gold)' : 'var(--border)'}`,
              background: subTab === t.id ? 'var(--gold-dim)' : 'transparent',
              color: subTab === t.id ? 'var(--gold)' : 'var(--text-tertiary)',
              fontSize: 12, fontWeight: subTab === t.id ? 700 : 500,
              fontFamily: 'var(--fb)', transition: 'all .15s',
            }}
          >
            <span>{t.ico}</span>
            <span>{t.lbl}</span>
          </button>
        ))}
      </div>

      {/* Sub-views */}
      {subTab === 'radar' && <RadarView />}
      {subTab === 'scanner' && (
        <Suspense fallback={<SubTabSkeleton />}>
          <DividendScannerTab />
        </Suspense>
      )}
      {subTab === 'discovery' && (
        <Suspense fallback={<SubTabSkeleton />}>
          <DiscoveryTab />
        </Suspense>
      )}
    </div>
  );
}
