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
import { useDraggableOrder } from '../../hooks/useDraggableOrder.js';
import { fmtPctFrac, fmtPctFracSigned } from '../../utils/formatters.js';

const SUB_VIEWS = [
  { id: 'alerts', lbl: '🔔 Alerts', desc: 'Cambios materiales último Q' },
  { id: 'funds', lbl: '🏛️ US Superinvestors', desc: '13F filers' },
  { id: 'spanish', lbl: '🇪🇸 Fondos España', desc: 'Cobas / Magallanes / azValor' },
  { id: 'overlap', lbl: '🎯 Overlap', desc: 'Qué fondos coinciden más con mi cartera' },
  { id: 'mine',  lbl: '👁 Mi cartera',     desc: 'Quién tiene tus tickers' },
  { id: 'consensus', lbl: '⭐ Consensus',  desc: 'Tickers en ≥3 fondos' },
  { id: 'performance', lbl: '📊 Performance', desc: 'Hit rate por fondo' },
];

// Agrupación de styles para filtro dropdown
const STYLE_GROUPS = {
  all: 'Todos',
  quality: 'Quality / Compounders',
  value: 'Value / Deep Value',
  dividend: 'Dividend Focus',
  growth: 'Growth / Concentrated',
  macro: 'Macro / Contrarian',
};
function styleGroupOf(style) {
  if (!style) return 'all';
  if (/quality|compound/i.test(style)) return 'quality';
  if (/value|deep-value|contrarian/i.test(style)) return 'value';
  if (/dividend|consumer-brands/i.test(style)) return 'dividend';
  if (/growth|concentrated/i.test(style)) return 'growth';
  if (/macro|activist/i.test(style)) return 'macro';
  return 'all';
}

const ALERT_STATUS_COLOR = {
  NEW: 'var(--green)',
  ADDED: '#64d2ff',
  REDUCED: 'var(--gold)',
  SOLD: 'var(--red)',
};
const ALERT_STATUS_LBL = {
  NEW: '🆕 Nueva',
  ADDED: '➕ Aumentada',
  REDUCED: '➖ Reducida',
  SOLD: '❌ Vendida',
};
const TIER_COLOR = {
  CRITICAL: 'var(--red)',
  WATCH: 'var(--gold)',
  INFO: 'var(--text-tertiary)',
};
const TIER_LBL = {
  CRITICAL: '🔴 Tu cartera',
  WATCH: '🟡 Watchlist',
  INFO: '⚪ Info',
};

const ES_STATUS_COLOR = {
  NEW: 'var(--green)',
  ADDED: '#64d2ff',
  HELD: 'var(--text-tertiary)',
  REDUCED: 'var(--gold)',
  SOLD: 'var(--red)',
};
const ES_STATUS_LBL = {
  NEW: '🆕 Nueva',
  ADDED: '➕ Aumentada',
  HELD: '○ Mantenida',
  REDUCED: '➖ Reducida',
  SOLD: '❌ Vendida',
};

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

  // Drag-reorder the sub-view pills — order persisted per user via cloud.
  const {
    orderedItems: orderedSubViews,
    dragHandlers: subViewDragHandlers,
    getDragVisuals: subViewDragVisuals,
  } = useDraggableOrder(SUB_VIEWS, 'ui_smart_money_sub_views');

  const [view, setView] = useState('alerts');
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [selectedFund, setSelectedFund] = useState(null);
  const [fundDetail, setFundDetail] = useState(null);
  const [consensusMin, setConsensusMin] = useState(3);
  const [consensus, setConsensus] = useState([]);
  const [overlapData, setOverlapData] = useState(null);
  const [overlapLoading, setOverlapLoading] = useState(false);
  const [styleFilter, setStyleFilter] = useState('all');
  const [holdersByTicker, setHoldersByTicker] = useState({});
  const [byTickerLoading, setByTickerLoading] = useState(false);
  // ── Spanish funds state ──
  const [spanishFunds, setSpanishFunds] = useState([]);
  const [selectedSpanish, setSelectedSpanish] = useState(null); // fund id
  const [spanishDiff, setSpanishDiff] = useState(null);         // { diff: [...], q1, q2 }
  const [spanishFilter, setSpanishFilter] = useState('ALL');    // ALL|NEW|ADDED|HELD|REDUCED|SOLD
  const [spanishLoading, setSpanishLoading] = useState(false);
  // ── Alerts state ──
  const [alertsData, setAlertsData] = useState(null); // { alerts, stats }
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [tierFilter, setTierFilter] = useState('ALL');         // ALL|CRITICAL|WATCH|INFO
  const [statusFilter, setStatusFilter] = useState('ALL');     // ALL|NEW|ADDED|REDUCED|SOLD
  const [showRead, setShowRead] = useState(false);             // toggle "Mostrar leídas"
  const [pendingAction, setPendingAction] = useState(null);    // id of row being processed (UI lock)
  // ── Performance state ──
  const [perfData, setPerfData] = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [scoreProgress, setScoreProgress] = useState(null); // { processed, remaining }

  // ── Load funds list (US only) ──
  const loadFunds = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/funds/list?source=us-13f`);
      const d = await r.json();
      setFunds(d.funds || []);
    } catch { setFunds([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadFunds(); }, [loadFunds]);

  // ── Load Spanish funds list ──
  const loadSpanishFunds = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/funds/list?source=es-cnmv`);
      const d = await r.json();
      setSpanishFunds(d.funds || []);
      // Auto-select first fund on load
      if (!selectedSpanish && d.funds?.length) {
        setSelectedSpanish(d.funds[0].id);
      }
    } catch { setSpanishFunds([]); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view === 'spanish') loadSpanishFunds();
  }, [view, loadSpanishFunds]);

  // ── Load Spanish fund diff (current vs prior quarter) ──
  const loadSpanishDiff = useCallback(async (fundId) => {
    if (!fundId) return;
    setSpanishLoading(true);
    setSpanishDiff(null);
    try {
      // Hardcoded quarters matching the seed. In future, read from fund.last_quarter.
      const r = await fetch(`${API_URL}/api/funds/${fundId}/diff?q1=2024-Q4&q2=2025-Q2`);
      const d = await r.json();
      setSpanishDiff(d);
    } catch { setSpanishDiff({ diff: [] }); }
    setSpanishLoading(false);
  }, []);

  useEffect(() => {
    if (view === 'spanish' && selectedSpanish) loadSpanishDiff(selectedSpanish);
  }, [view, selectedSpanish, loadSpanishDiff]);

  // ── Load alerts ──
  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const q = showRead ? '?includeRead=1' : '';
      const r = await fetch(`${API_URL}/api/funds/alerts${q}`);
      const d = await r.json();
      setAlertsData(d);
    } catch { setAlertsData({ alerts: [], stats: {} }); }
    setAlertsLoading(false);
  }, [showRead]);

  useEffect(() => {
    // Load alerts on initial mount so the badge count shows even before user clicks
    loadAlerts();
  }, [loadAlerts]);

  // ── Mark-as-read (optimistic: remove row immediately) ──
  const markAsRead = useCallback(async (alertId) => {
    if (!alertsData) return;
    setPendingAction(alertId);
    // Optimistic: remove from list + decrement stats
    setAlertsData(prev => {
      if (!prev) return prev;
      const removed = prev.alerts.find(a => a.id === alertId);
      const newAlerts = showRead
        ? prev.alerts.map(a => a.id === alertId ? { ...a, read_at: new Date().toISOString() } : a)
        : prev.alerts.filter(a => a.id !== alertId);
      const newStats = { ...prev.stats };
      if (removed && !showRead) {
        newStats.total = (newStats.total || 0) - 1;
        if (removed.tier === 'CRITICAL') newStats.critical = (newStats.critical || 0) - 1;
        else if (removed.tier === 'WATCH') newStats.watch = (newStats.watch || 0) - 1;
        else newStats.info = (newStats.info || 0) - 1;
        newStats.byStatus = { ...newStats.byStatus };
        newStats.byStatus[removed.status] = (newStats.byStatus[removed.status] || 0) - 1;
      }
      return { ...prev, alerts: newAlerts, stats: newStats };
    });
    try {
      await fetch(`${API_URL}/api/funds/alerts/${alertId}/read`, { method: 'POST' });
    } catch {}
    setPendingAction(null);
  }, [alertsData, showRead]);

  // ── Mute (optimistic: remove all rows matching subject) ──
  const muteSubject = useCallback(async ({ ticker, fund_id }) => {
    if (!alertsData) return;
    setAlertsData(prev => {
      if (!prev) return prev;
      const newAlerts = prev.alerts.filter(a => {
        if (ticker && fund_id) return !(a.ticker === ticker && a.fund_id === fund_id);
        if (ticker) return a.ticker !== ticker;
        if (fund_id) return a.fund_id !== fund_id;
        return true;
      });
      // Recompute stats from newAlerts
      const newStats = {
        total: newAlerts.length,
        critical: newAlerts.filter(a => a.tier === 'CRITICAL').length,
        watch:    newAlerts.filter(a => a.tier === 'WATCH').length,
        info:     newAlerts.filter(a => a.tier === 'INFO').length,
        byStatus: {
          NEW:     newAlerts.filter(a => a.status === 'NEW').length,
          ADDED:   newAlerts.filter(a => a.status === 'ADDED').length,
          REDUCED: newAlerts.filter(a => a.status === 'REDUCED').length,
          SOLD:    newAlerts.filter(a => a.status === 'SOLD').length,
        },
      };
      return { ...prev, alerts: newAlerts, stats: newStats };
    });
    try {
      await fetch(`${API_URL}/api/funds/alerts/mute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker || null, fund_id: fund_id || null }),
      });
    } catch {}
  }, [alertsData]);

  // ── Mark all CRITICAL as read ──
  const markAllCriticalAsRead = useCallback(async () => {
    if (!alertsData) return;
    setAlertsData(prev => {
      if (!prev) return prev;
      const newAlerts = showRead
        ? prev.alerts.map(a => a.tier === 'CRITICAL' ? { ...a, read_at: new Date().toISOString() } : a)
        : prev.alerts.filter(a => a.tier !== 'CRITICAL');
      const newStats = { ...prev.stats, critical: 0 };
      if (!showRead) newStats.total = (newStats.total || 0) - (prev.stats.critical || 0);
      return { ...prev, alerts: newAlerts, stats: newStats };
    });
    try {
      await fetch(`${API_URL}/api/funds/alerts/read-all?tier=CRITICAL`, { method: 'POST' });
    } catch {}
  }, [alertsData, showRead]);

  // Filtered alerts based on tier + status filters
  const filteredAlerts = useMemo(() => {
    if (!alertsData?.alerts) return [];
    return alertsData.alerts.filter(a => {
      if (tierFilter !== 'ALL' && a.tier !== tierFilter) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      return true;
    });
  }, [alertsData, tierFilter, statusFilter]);

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
      // Reload alerts (new quarter data might reveal new ones)
      await loadAlerts();
      // Auto-fire push for any new CRITICAL alert. The /notify endpoint
      // honors the 4-layer cooldown server-side, so it's safe to call
      // unconditionally — it'll just skip if quiet hours / weekly cap /
      // no eligible alerts.
      try {
        const pushResp = await fetch(`${API_URL}/api/funds/alerts/notify`, { method: 'POST' });
        const pushD = await pushResp.json();
        if (pushD.sent > 0) {
          setRefreshMsg(prev => `${prev} · 🔔 ${pushD.sent} push enviada${pushD.sent > 1 ? 's' : ''}`);
        } else if (pushD.skipped) {
          setRefreshMsg(prev => `${prev} · 🔕 push omitida (${pushD.reason})`);
        }
      } catch {}
      // Also refresh current sub-view data
      if (view === 'consensus') loadConsensus();
      if (view === 'mine') loadByPortfolio();
      if (view === 'funds' && selectedFund) loadFundDetail(selectedFund);
    } catch (e) {
      setRefreshMsg(`❌ Error: ${e.message}`);
    }
    setRefreshing(false);
    setTimeout(() => setRefreshMsg(''), 10000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFunds, view, selectedFund, loadAlerts]);

  // ── Load performance (accuracy stats) ──
  const loadPerformance = useCallback(async () => {
    setPerfLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/funds/alerts/performance`);
      const d = await r.json();
      setPerfData(d);
    } catch { setPerfData({ funds: [], global: {} }); }
    setPerfLoading(false);
  }, []);

  useEffect(() => {
    if (view === 'performance' && !perfData) loadPerformance();
  }, [view, perfData, loadPerformance]);

  // ── Score all pending alerts (iterative, respects Worker subrequest cap) ──
  const scoreAlerts = useCallback(async () => {
    setScoreProgress({ processed: 0, remaining: '...' });
    let totalProcessed = 0;
    // Iterate until done or max 6 batches (90 tickers)
    for (let i = 0; i < 6; i++) {
      try {
        const r = await fetch(`${API_URL}/api/funds/alerts/score?limit=15`, { method: 'POST' });
        const d = await r.json();
        totalProcessed += d.processed || 0;
        setScoreProgress({ processed: totalProcessed, remaining: d.remaining });
        if (d.done || (d.processed || 0) === 0) break;
      } catch { break; }
    }
    // Reload performance after scoring
    await loadPerformance();
    setTimeout(() => setScoreProgress(null), 4000);
  }, [loadPerformance]);

  // ── Test push notification button ──
  const testPushNotify = useCallback(async () => {
    setRefreshMsg('Probando push notification…');
    try {
      const r = await fetch(`${API_URL}/api/funds/alerts/notify?force=1`, { method: 'POST' });
      const d = await r.json();
      if (d.sent > 0) {
        setRefreshMsg(`✅ ${d.sent} push enviada${d.sent > 1 ? 's' : ''} (force=1, bypasseando cooldown)`);
      } else {
        setRefreshMsg(`ℹ️ 0 push enviadas — ${d.reason || 'sin suscriptores'}. Reabre alertas desde el ✓ para volver a testear.`);
      }
    } catch (e) {
      setRefreshMsg(`❌ Error: ${e.message}`);
    }
    setTimeout(() => setRefreshMsg(''), 10000);
  }, []);

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

  // ── Overlap con mi cartera ──
  const loadOverlap = useCallback(async () => {
    setOverlapLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/funds/overlap`);
      const d = await r.json();
      setOverlapData(d);
    } catch { setOverlapData(null); }
    finally { setOverlapLoading(false); }
  }, []);

  useEffect(() => {
    if (view === 'overlap' && !overlapData) loadOverlap();
  }, [view, overlapData, loadOverlap]);

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

      {/* ─── Sub-view pills (drag to reorder, persisted per user) ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {orderedSubViews.map(sv => {
          // Badge count on the Alerts pill
          const alertCount = sv.id === 'alerts' ? (alertsData?.stats?.critical || 0) : 0;
          const active = view === sv.id;
          const { isDragOver, extraStyle } = subViewDragVisuals(sv.id);
          return (
            <button
              key={sv.id}
              {...subViewDragHandlers(sv.id)}
              onClick={() => setView(sv.id)}
              title="Arrastra para reordenar"
              style={{
                ...pill(active),
                ...extraStyle,
              }}
            >
              {sv.lbl}
              {alertCount > 0 && (
                <span style={{
                  marginLeft: 6, padding: '1px 6px', borderRadius: 10,
                  background: 'var(--red)', color: '#fff',
                  fontSize: 9, fontWeight: 800, fontFamily: 'var(--fm)',
                }}>{alertCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── View: 🔔 Alerts ─── */}
      {view === 'alerts' && (
        <>
          {alertsLoading ? <InlineLoading label="Computando alertas..." /> : !alertsData ? null : (
            <>
              {/* Stats header */}
              <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>{alertsData.stats.total || 0}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5 }}>🔴 Tu cartera</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)', fontFamily: 'var(--fd)' }}>{alertsData.stats.critical || 0}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.5 }}>🟡 Watchlist</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>{alertsData.stats.watch || 0}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>⚪ Info</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--fd)' }}>{alertsData.stats.info || 0}</div>
                </div>
              </div>

              {/* Action bar: show-read toggle + mark-critical-read shortcut + push test */}
              <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => setShowRead(v => !v)} style={pill(showRead)}>
                    {showRead ? '👁 Incluyendo leídas' : '👁 Solo no leídas'}
                  </button>
                  <button
                    onClick={testPushNotify}
                    title="Enviar push con las alertas CRITICAL de mayor convicción (bypassea cooldown)"
                    style={{
                      padding: '7px 12px', borderRadius: 8,
                      border: '1px solid #64d2ff', background: 'rgba(100,210,255,.08)',
                      color: '#64d2ff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'var(--fm)',
                    }}
                  >
                    🔔 Probar push
                  </button>
                </div>
                {alertsData.stats.critical > 0 && (
                  <button
                    onClick={markAllCriticalAsRead}
                    style={{
                      padding: '7px 12px', borderRadius: 8,
                      border: '1px solid var(--red)', background: 'rgba(255,69,58,.08)',
                      color: 'var(--red)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'var(--fm)',
                    }}
                  >
                    ✓ Marcar {alertsData.stats.critical} críticas como leídas
                  </button>
                )}
              </div>

              {/* Filter pills */}
              <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Relevancia</span>
                {['ALL', 'CRITICAL', 'WATCH', 'INFO'].map(t => {
                  const n = t === 'ALL' ? alertsData.stats.total : (alertsData.stats[t.toLowerCase()] || 0);
                  return (
                    <button key={t} onClick={() => setTierFilter(t)} style={{
                      ...pill(tierFilter === t),
                      color: tierFilter === t ? (TIER_COLOR[t] || 'var(--gold)') : 'var(--text-tertiary)',
                      borderColor: tierFilter === t ? (TIER_COLOR[t] || 'var(--gold)') : 'var(--border)',
                    }}>
                      {t === 'ALL' ? 'Todas' : TIER_LBL[t]} ({n})
                    </button>
                  );
                })}
              </div>
              <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tipo</span>
                {['ALL', 'NEW', 'ADDED', 'REDUCED', 'SOLD'].map(s => {
                  const n = s === 'ALL' ? alertsData.stats.total : (alertsData.stats.byStatus?.[s] || 0);
                  return (
                    <button key={s} onClick={() => setStatusFilter(s)} style={{
                      ...pill(statusFilter === s),
                      color: statusFilter === s ? (ALERT_STATUS_COLOR[s] || 'var(--gold)') : 'var(--text-tertiary)',
                      borderColor: statusFilter === s ? (ALERT_STATUS_COLOR[s] || 'var(--gold)') : 'var(--border)',
                    }}>
                      {s === 'ALL' ? 'Todos' : ALERT_STATUS_LBL[s]} ({n})
                    </button>
                  );
                })}
              </div>

              {/* Alerts table */}
              {filteredAlerts.length === 0 ? (
                <EmptyState
                  icon="🔔"
                  title="Sin alertas con estos filtros"
                  description={alertsData.stats.total > 0 ? "Cambia los filtros para ver otras." : "Refresca los 13F para generar alertas."}
                />
              ) : (
                <div style={card}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                    Cambios materiales: NEW ≥3%, SOLD (de ≥3%), ADDED (peso doblado ≥2%), REDUCED (peso a la mitad de ≥2%).
                    Ordenados por relevancia × convicción × magnitud del cambio.
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Ticker · Empresa</th>
                        <th style={th}>Fondo · Gestor</th>
                        <th style={{ ...th, textAlign: 'center' }}>Tier</th>
                        <th style={{ ...th, textAlign: 'center' }}>Cambio</th>
                        <th style={{ ...th, textAlign: 'right' }}>Peso prev</th>
                        <th style={{ ...th, textAlign: 'right' }}>Peso ahora</th>
                        <th style={{ ...th, textAlign: 'right' }}>Δ</th>
                        <th style={{ ...th, textAlign: 'center', width: 90 }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAlerts.slice(0, 100).map((a) => {
                        const isRead = !!a.read_at;
                        const isPending = pendingAction === a.id;
                        return (
                          <tr key={a.id} style={{ opacity: isRead ? 0.55 : 1 }}>
                            <td style={td}>
                              <span style={tickerLink(a.ticker)} onClick={() => openAnalysis?.(a.ticker)}>
                                {a.ticker?.startsWith('ES:') ? a.ticker.slice(3) : a.ticker}
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>{(a.name || '').slice(0, 32)}</span>
                            </td>
                            <td style={{ ...td, fontSize: 11 }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.fund_name}</div>
                              <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{a.manager}</div>
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: TIER_COLOR[a.tier] }}>{TIER_LBL[a.tier]}</span>
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: ALERT_STATUS_COLOR[a.status] }}>
                                {ALERT_STATUS_LBL[a.status]}
                              </span>
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--text-tertiary)' }}>
                              {a.w_prev > 0 ? `${a.w_prev.toFixed(2)}%` : '—'}
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, color: a.w_now >= 5 ? 'var(--gold)' : 'var(--text-primary)' }}>
                              {a.w_now > 0 ? `${a.w_now.toFixed(2)}%` : '—'}
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 600, color: a.delta_pct > 0 ? 'var(--green)' : 'var(--red)' }}>
                              {a.delta_pct > 0 ? '+' : ''}{a.delta_pct.toFixed(2)}%
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              {!isRead && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); markAsRead(a.id); }}
                                  disabled={isPending}
                                  title="Marcar como leída"
                                  style={{
                                    padding: '3px 7px', marginRight: 4,
                                    borderRadius: 5, border: '1px solid var(--border)',
                                    background: 'transparent', color: 'var(--green)',
                                    fontSize: 11, cursor: isPending ? 'wait' : 'pointer',
                                    fontFamily: 'var(--fm)',
                                  }}
                                >✓</button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); muteSubject({ ticker: a.ticker }); }}
                                title={`Silenciar ${a.ticker} en todos los fondos`}
                                style={{
                                  padding: '3px 7px',
                                  borderRadius: 5, border: '1px solid var(--border)',
                                  background: 'transparent', color: 'var(--text-tertiary)',
                                  fontSize: 11, cursor: 'pointer',
                                  fontFamily: 'var(--fm)',
                                }}
                              >🔇</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

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
            <>
              {/* Filter pills por estilo */}
              <div style={{ ...card, marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .3, marginRight: 4 }}>Filtrar:</span>
                {Object.entries(STYLE_GROUPS).map(([k, lbl]) => {
                  const count = k === 'all' ? funds.length : funds.filter(f => styleGroupOf(f.style) === k).length;
                  return (
                    <button key={k} onClick={() => setStyleFilter(k)}
                      style={{
                        padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 5,
                        border: `1px solid ${styleFilter === k ? 'var(--gold)' : 'var(--border)'}`,
                        background: styleFilter === k ? 'rgba(200,164,78,0.12)' : 'transparent',
                        color: styleFilter === k ? 'var(--gold)' : 'var(--text-secondary)',
                        cursor: 'pointer', fontFamily: 'var(--fm)',
                      }}>
                      {lbl} <span style={{ opacity: 0.6 }}>({count})</span>
                    </button>
                  );
                })}
              </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              {funds.filter(f => styleFilter === 'all' || styleGroupOf(f.style) === styleFilter).map(f => (
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
            </>
          )}
        </>
      )}

      {/* ─── View: 📊 Performance ─── */}
      {view === 'performance' && (
        <>
          <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Accuracy tracking</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                Mide cuánto sube/baja el ticker a 7/30/90 días después de cada alerta.
                Hit = el fondo acertó (subió tras NEW/ADDED, bajó tras SOLD/REDUCED, ≥2% en cualquiera).
              </div>
            </div>
            <button
              onClick={scoreAlerts}
              disabled={scoreProgress !== null}
              style={{
                padding: '8px 14px', borderRadius: 8,
                border: '1px solid var(--gold)', background: 'rgba(200,164,78,.1)',
                color: 'var(--gold)', fontSize: 11, fontWeight: 700,
                cursor: scoreProgress ? 'wait' : 'pointer', fontFamily: 'var(--fm)',
              }}
            >
              {scoreProgress
                ? `⏳ Procesando… ${scoreProgress.processed}`
                : '🔄 Calcular scores'}
            </button>
          </div>
          {scoreProgress && (
            <div style={{ ...card, background: 'rgba(100,210,255,.06)', borderColor: 'rgba(100,210,255,.3)', fontSize: 11, color: 'var(--text-secondary)' }}>
              Procesados: {scoreProgress.processed} · Restantes: {scoreProgress.remaining}
            </div>
          )}

          {perfLoading ? <InlineLoading label="Cargando performance..." /> : !perfData || !perfData.funds?.length ? (
            <EmptyState
              icon="📊"
              title="Sin datos de accuracy todavía"
              description="Las alertas necesitan al menos 7 días de historia para calcular returns. Pulsa 'Calcular scores' para procesar las antiguas, o espera a que pasen unos días tras el próximo refresh de 13F."
            />
          ) : (
            <>
              {perfData.global?.total_scored > 0 && (
                <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total scored</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>
                      {perfData.global.total_scored}/{perfData.global.total_alerts}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Avg return 30d</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: (perfData.global.avg_return_30d || 0) > 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--fd)' }}>
                      {perfData.global.avg_return_30d != null ? `${(perfData.global.avg_return_30d * 100).toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Hit rate 30d</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: (perfData.global.hit_rate_30d || 0) > 0.5 ? 'var(--green)' : 'var(--gold)', fontFamily: 'var(--fd)' }}>
                      {perfData.global.hit_rate_30d != null ? `${(perfData.global.hit_rate_30d * 100).toFixed(0)}%` : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cobertura</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--fd)' }}>
                      {perfData.global.total_alerts > 0 ? `${Math.round((perfData.global.total_scored / perfData.global.total_alerts) * 100)}%` : '—'}
                    </div>
                  </div>
                </div>
              )}

              <div style={card}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                  Ordenado por hit rate 30d descendente. Fondos sin scored aparecen al final.
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Fondo · Gestor</th>
                      <th style={{ ...th, textAlign: 'center' }}>Scored</th>
                      <th style={{ ...th, textAlign: 'right' }}>Hit 7d</th>
                      <th style={{ ...th, textAlign: 'right' }}>Hit 30d</th>
                      <th style={{ ...th, textAlign: 'right' }}>Hit 90d</th>
                      <th style={{ ...th, textAlign: 'right' }}>Avg ret 7d</th>
                      <th style={{ ...th, textAlign: 'right' }}>Avg ret 30d</th>
                      <th style={{ ...th, textAlign: 'right' }}>Avg ret 90d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfData.funds.map(f => {
                      const fmtPct = fmtPctFrac;         // 1-decimal % from fraction
                      const fmtRet = fmtPctFracSigned;   // signed 2-decimal % from fraction
                      const hitColor = (v) => v == null ? 'var(--text-tertiary)' : v >= 0.7 ? 'var(--gold)' : v >= 0.5 ? 'var(--green)' : 'var(--red)';
                      const retColor = (v) => v == null ? 'var(--text-tertiary)' : v > 0 ? 'var(--green)' : 'var(--red)';
                      return (
                        <tr key={f.fund_id}>
                          <td style={td}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.fund_name}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{f.manager}</div>
                          </td>
                          <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--fm)', fontWeight: 600 }}>{f.scored_count}</td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, color: hitColor(f.hit_rate_7d) }}>{fmtPct(f.hit_rate_7d)}</td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, color: hitColor(f.hit_rate_30d) }}>{fmtPct(f.hit_rate_30d)}</td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, color: hitColor(f.hit_rate_90d) }}>{fmtPct(f.hit_rate_90d)}</td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: retColor(f.avg_return_7d) }}>{fmtRet(f.avg_return_7d)}</td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: retColor(f.avg_return_30d) }}>{fmtRet(f.avg_return_30d)}</td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: retColor(f.avg_return_90d) }}>{fmtRet(f.avg_return_90d)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── View: 🇪🇸 Fondos España ─── */}
      {view === 'spanish' && (
        <>
          {/* Fund pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {spanishFunds.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedSpanish(f.id)}
                style={{
                  ...pill(selectedSpanish === f.id),
                  padding: '10px 14px',
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  minWidth: 180,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>🇪🇸 {f.name.replace(' FI', '')}</div>
                <div style={{ fontSize: 9, opacity: .7, marginTop: 2 }}>{f.manager}</div>
                <div style={{ fontSize: 9, opacity: .7, marginTop: 2, fontFamily: 'var(--fm)' }}>
                  {f.holdings_count || 0} posiciones · {f.last_quarter || '—'}
                </div>
              </button>
            ))}
          </div>

          {/* Status filter + diff summary */}
          {spanishDiff && (
            <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Cambios {spanishDiff.q1} → {spanishDiff.q2}
              </span>
              {['ALL', 'NEW', 'ADDED', 'HELD', 'REDUCED', 'SOLD'].map(s => {
                const n = s === 'ALL' ? spanishDiff.diff?.length : (spanishDiff.diff || []).filter(h => h.status === s).length;
                return (
                  <button
                    key={s}
                    onClick={() => setSpanishFilter(s)}
                    style={{
                      ...pill(spanishFilter === s),
                      color: spanishFilter === s ? (ES_STATUS_COLOR[s] || 'var(--gold)') : 'var(--text-tertiary)',
                      borderColor: spanishFilter === s ? (ES_STATUS_COLOR[s] || 'var(--gold)') : 'var(--border)',
                    }}
                  >
                    {s === 'ALL' ? 'Todas' : ES_STATUS_LBL[s]} ({n})
                  </button>
                );
              })}
            </div>
          )}

          {/* Holdings table */}
          {spanishLoading ? <InlineLoading label="Cargando cartera..." /> : !spanishDiff || !spanishDiff.diff?.length ? (
            <EmptyState
              icon="🇪🇸"
              title="Sin datos del fondo"
              description="Seleccciona un fondo o prueba con otro trimestre."
            />
          ) : (
            <div style={card}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Datos extraídos de los informes semestrales CNMV (Cobas, Magallanes, azValor).
                La comparación es entre el cierre de 2025-06-30 y 2024-12-31.
                Los holdings marcados <span style={{ color: 'var(--green)' }}>🆕 Nueva</span> fueron incorporados durante el primer semestre 2025.
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Posición</th>
                    <th style={{ ...th, textAlign: 'right' }}>Peso actual</th>
                    <th style={{ ...th, textAlign: 'right' }}>Peso prev</th>
                    <th style={{ ...th, textAlign: 'right' }}>Δ</th>
                    <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(spanishDiff.diff || [])
                    .filter(h => spanishFilter === 'ALL' || h.status === spanishFilter)
                    .slice(0, 100)
                    .map((h) => (
                      <tr key={h.ticker}>
                        <td style={td}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.name || '—'}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                            {h.ticker?.startsWith('ES:') ? h.ticker.slice(3) : h.ticker}
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 600, color: h.w_now >= 4 ? 'var(--gold)' : 'var(--text-secondary)' }}>
                          {h.w_now > 0 ? `${h.w_now.toFixed(2)}%` : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--text-tertiary)' }}>
                          {h.w_prev > 0 ? `${h.w_prev.toFixed(2)}%` : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 600, color: h.delta_pct > 0 ? 'var(--green)' : h.delta_pct < 0 ? 'var(--red)' : 'var(--text-tertiary)' }}>
                          {h.delta_pct > 0 ? '+' : ''}{h.delta_pct?.toFixed(2)}%
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: ES_STATUS_COLOR[h.status] || 'var(--text-tertiary)',
                          }}>
                            {ES_STATUS_LBL[h.status] || h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── View: 🎯 Overlap con mi cartera ─── */}
      {view === 'overlap' && (
        <>
          {overlapLoading ? <InlineLoading label="Calculando overlap..." /> : !overlapData ? (
            <EmptyState icon="🎯" title="Sin datos" description="No se pudo cargar el overlap."/>
          ) : (
            <>
              <div style={{ ...card, marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Tu portfolio tiene <strong style={{ color: 'var(--gold)' }}>{overlapData.portfolio_count}</strong> tickers.
                  Abajo ves qué superinvestors los comparten — ordenados por % peso-ponderado de tu cartera.
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  <strong>Overlap simple</strong>: tickers compartidos / total cartera.
                  <strong> Peso-ponderado</strong>: suma del % de cartera que coincide con el fondo (refleja dónde está el dinero).
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
                {overlapData.funds.filter(f => f.overlap_count > 0).map(f => (
                  <div key={f.fund_id} style={{
                    ...card, marginBottom: 0,
                    borderColor: f.portfolio_weighted_overlap_pct > 10 ? 'var(--gold)' : 'var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {f.fund_name} <Stars n={f.conviction}/>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {f.manager} · {STYLE_LABEL[f.style] || f.style}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>
                          {f.portfolio_weighted_overlap_pct.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                          {f.overlap_count} tickers · {f.overlap_pct.toFixed(0)}% simple
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                      {f.shared_tickers.slice(0, 12).map(t => (
                        <span key={t.ticker} title={`Tú: ${t.my_weight_pct}% · Fondo: ${t.fund_weight_pct}%`}
                          style={{
                            padding: '2px 7px', borderRadius: 4,
                            background: 'rgba(200,164,78,0.08)',
                            border: '1px solid var(--border)',
                            fontSize: 10, fontFamily: 'var(--fm)',
                            color: t.my_weight_pct >= 3 ? 'var(--gold)' : 'var(--text-secondary)',
                            fontWeight: t.my_weight_pct >= 3 ? 700 : 500,
                            cursor: 'pointer',
                          }}
                          onClick={() => openAnalysis?.(t.ticker)}
                        >
                          {t.ticker}
                          <span style={{ color: 'var(--text-tertiary)', marginLeft: 3, fontSize: 9 }}>
                            {t.my_weight_pct.toFixed(1)}%
                          </span>
                        </span>
                      ))}
                      {f.shared_tickers.length > 12 && (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>+{f.shared_tickers.length - 12}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {overlapData.funds.filter(f => f.overlap_count === 0).length > 0 && (
                <div style={{ ...card, marginTop: 10, opacity: 0.5 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    Sin overlap ({overlapData.funds.filter(f => f.overlap_count === 0).length} fondos):
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {overlapData.funds.filter(f => f.overlap_count === 0).map(f => f.manager?.split(' ')[0] || f.fund_name).join(' · ')}
                  </div>
                </div>
              )}
            </>
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
