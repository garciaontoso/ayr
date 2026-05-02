import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';
import { Button, Modal } from '../ui';
import {
  fmtUSD,
  fmtPctSigned as fmtPct,
  fmtNumD as fmtNum,
  fmtDateESLong as fmtDate,
} from '../../utils/formatters.js';
function daysLabel(n) {
  if (n == null) return '';
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n < 0) return `hace ${-n}d`;
  return `en ${n}d`;
}

const IMPORTANCE_COLOR = {
  critical: 'var(--ds-danger)',
  high: 'var(--ds-warning)',
  normal: 'var(--text-tertiary)',
};
const IMPORTANCE_LABEL = {
  critical: 'CRÍTICO',
  high: 'ALTO',
  normal: 'normal',
};

// ── Componente principal ─────────────────────────────────────────
export default function EarningsTab() {
  // ── State (declared FIRST to avoid TDZ) ──
  const [view, setView] = useState('calendar'); // 'calendar' | 'upcoming' | 'recent'
  const [selectedDay, setSelectedDay] = useState(null); // ISO date when a calendar cell is clicked
  const [upcoming, setUpcoming] = useState(null);
  const [recent, setRecent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [modalTicker, setModalTicker] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState(null);

  // ── Fetchers (signal-aware so unmount cancels in-flight requests) ──
  const fetchUpcoming = useCallback(async (signal) => {
    try {
      const r = await fetch(`${API_URL}/api/earnings/upcoming?days=30`, { signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      setUpcoming(j);
      setError(null);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError(e.message || 'Error al cargar upcoming');
    }
  }, []);

  const fetchRecent = useCallback(async (signal) => {
    try {
      const r = await fetch(`${API_URL}/api/earnings/post`, { signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      setRecent(j);
    } catch (e) {
      // silent — keep upcoming working
    }
  }, []);

  const fetchAll = useCallback(async (signal) => {
    setLoading(true);
    await Promise.all([fetchUpcoming(signal), fetchRecent(signal)]);
    if (signal?.aborted) return;
    setLastUpdated(new Date());
    setLoading(false);
  }, [fetchUpcoming, fetchRecent]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const ctrl = new AbortController();
    try {
      await fetch(`${API_URL}/api/earnings/briefing/refresh`, { method: 'POST', signal: ctrl.signal });
      await fetchAll(ctrl.signal);
    } catch (e) {
      if (e.name !== 'AbortError') setError('Error al refrescar calendar');
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll]);

  const fetchBriefing = useCallback(async (ticker, signal) => {
    setBriefing(null);
    setBriefingError(null);
    setBriefingLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/earnings/briefing/${encodeURIComponent(ticker)}`, { signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      setBriefing(j);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setBriefingError(e.message || 'Error al cargar briefing');
    } finally {
      if (!signal?.aborted) setBriefingLoading(false);
    }
  }, []);

  // ── Effects ──
  useEffect(() => {
    const ctrl = new AbortController();
    fetchAll(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchAll]);

  useEffect(() => {
    if (!modalTicker) return;
    const ctrl = new AbortController();
    fetchBriefing(modalTicker, ctrl.signal);
    return () => ctrl.abort();
  }, [modalTicker, fetchBriefing]);

  // ── Derived ──
  const counts = upcoming?.counts || { total: 0, critical: 0, high: 0 };
  const items = useMemo(() => upcoming?.items || [], [upcoming]);
  const recentItems = useMemo(() => recent?.items || [], [recent]);

  // ── Render states ──
  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
        Cargando earnings...
      </div>
    );
  }
  if (error && !upcoming) {
    return (
      <div style={{ padding: 24, color: 'var(--red)', fontFamily: 'var(--fm)' }}>
        Error al cargar datos: {error}
        <div style={{ marginTop: 12 }}>
          <button onClick={handleRefresh} style={btnStyle()}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 14, color: 'var(--text-primary)' }}>
      {/* ── COMPACT HEADER (1-line) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>
            {counts.total}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            earnings · 30d
          </span>
        </div>
        {counts.critical > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444' }}>🔴 {counts.critical} críticos</span>
        )}
        {counts.high > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: 'rgba(255,159,10,.1)', border: '1px solid rgba(255,159,10,.3)', color: '#ff9f0a' }}>🟡 {counts.high} altos</span>
        )}
        {lastUpdated && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
            ↻ {lastUpdated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button onClick={handleRefresh} disabled={refreshing}
          style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: refreshing ? 'wait' : 'pointer', fontFamily: 'var(--fb)' }}>
          {refreshing ? 'Refrescando…' : '🔄 Refrescar'}
        </button>
      </div>

      {/* ── COMPACT VIEW TABS ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <SubTab label="📅 Calendario" active={view === 'calendar'} onClick={() => setView('calendar')} count={items.length} />
        <SubTab label="📋 Lista" active={view === 'upcoming'} onClick={() => setView('upcoming')} count={items.length} />
        <SubTab label="🎯 Recientes 7d" active={view === 'recent'} onClick={() => setView('recent')} count={recentItems.length} />
      </div>

      {/* ── CALENDAR VIEW ── */}
      {view === 'calendar' && (
        <CalendarView items={items} selectedDay={selectedDay} setSelectedDay={setSelectedDay} setModalTicker={setModalTicker} />
      )}

      {/* ── LISTA UPCOMING ── */}
      {view === 'upcoming' && (
        <div
          style={{
            background: 'var(--subtle-bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {items.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-secondary)', textAlign: 'center', fontSize: 13 }}>
              No hay earnings próximos en cartera. Pulsa "Refrescar calendar" para sincronizar con FMP.
            </div>
          ) : (
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {items.map((it, idx) => (
                <div
                  key={`${it.ticker}-${it.earnings_date}-${idx}`}
                  onClick={() => setModalTicker(it.ticker)}
                  style={{
                    padding: '14px 20px',
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr 110px 100px 120px',
                    alignItems: 'center',
                    gap: 12,
                    borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>
                    {it.ticker}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {it.earnings_time ? it.earnings_time.toUpperCase() : '—'}
                      {it.eps_estimate != null && ` · EPS est $${fmtNum(it.eps_estimate)}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right' }}>
                    {fmtDate(it.earnings_date)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'right' }}>
                    {daysLabel(it.days_until)}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={badgeStyle(IMPORTANCE_COLOR[it.importance])}>
                      {fmtPct(it.weight_pct, 1).replace('+', '')} · {IMPORTANCE_LABEL[it.importance]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LISTA RECIENTES ── */}
      {view === 'recent' && (
        <div
          style={{
            background: 'var(--subtle-bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {recentItems.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-secondary)', textAlign: 'center', fontSize: 13 }}>
              Ningún earnings de cartera en los últimos 7 días.
            </div>
          ) : (
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {recentItems.map((it, idx) => {
                const r = it.result;
                const bom = r?.beat_or_miss;
                const bomColor = bom === 'beat' ? 'var(--green)' : bom === 'miss' ? 'var(--red)' : 'var(--text-tertiary)';
                return (
                  <div
                    key={`${it.ticker}-${it.earnings_date}-${idx}`}
                    onClick={() => setModalTicker(it.ticker)}
                    style={{
                      padding: '14px 20px',
                      borderBottom: idx < recentItems.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--fm)' }}>{it.ticker}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.name}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {fmtDate(it.earnings_date)}
                      </span>
                    </div>
                    {r ? (
                      <div style={{ fontSize: 12, color: bomColor, fontFamily: 'var(--fm)' }}>
                        {bom ? bom.toUpperCase() + ' · ' : ''}{r.summary || '—'}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        Resultado no disponible aún
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL BRIEFING ── */}
      {modalTicker && (
        <BriefingModal
          ticker={modalTicker}
          briefing={briefing}
          loading={briefingLoading}
          error={briefingError}
          onClose={() => { setModalTicker(null); setBriefing(null); }}
        />
      )}
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────
function SubTab({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {label} {count != null && <span style={{ opacity: 0.6 }}>({count})</span>}
    </button>
  );
}

function BriefingModal({ ticker, briefing, loading, error, onClose }) {
  const upcoming = briefing?.upcoming;
  const pos = briefing?.position;
  const qs = briefing?.quality_safety;
  const history = briefing?.history || [];
  const stats = briefing?.stats || {};
  return (
    <Modal
      open={!!ticker}
      onClose={onClose}
      width={720}
      title={
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--fm)' }}>
            📊 {ticker} — Pre-Earnings Briefing
          </div>
          {upcoming && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Reporte: {fmtDate(upcoming.earnings_date)}
              {upcoming.earnings_time && ` · ${upcoming.earnings_time.toUpperCase()}`}
              {upcoming.fiscal_period && ` · ${upcoming.fiscal_period}`}
            </div>
          )}
        </div>
      }
    >
      <>
          {loading && <div style={{ color: 'var(--text-secondary)' }}>Cargando briefing...</div>}
          {error && <div style={{ color: 'var(--red)' }}>Error: {error}</div>}
          {!loading && !error && (
            <>
              {/* Tu posición + Q/S */}
              <Section title="Tu posición">
                {pos ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <Stat label="Shares" value={pos.shares ? Math.round(pos.shares).toLocaleString() : '—'} />
                    <Stat label="Avg cost" value={pos.avg_cost ? '$' + fmtNum(pos.avg_cost) : '—'} />
                    <Stat label="Valor USD" value={fmtUSD(pos.value_usd)} />
                    <Stat label="Currency" value={pos.currency || '—'} />
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Sin posición activa.</div>
                )}
              </Section>

              {qs && (
                <Section title="Quality + Safety actual">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <Stat label="Quality score" value={qs.quality_score != null ? `${Math.round(qs.quality_score)}/100` : '—'} />
                    <Stat label="Safety score" value={qs.safety_score != null ? `${Math.round(qs.safety_score)}/100` : '—'} />
                  </div>
                </Section>
              )}

              {/* Expectativas */}
              {upcoming && (upcoming.eps_estimate != null || upcoming.revenue_estimate != null) && (
                <Section title="Expectativas analistas">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <Stat label="EPS estimate" value={upcoming.eps_estimate != null ? '$' + fmtNum(upcoming.eps_estimate) : '—'} />
                    <Stat label="Revenue estimate" value={upcoming.revenue_estimate != null ? fmtUSD(upcoming.revenue_estimate) : '—'} />
                  </div>
                </Section>
              )}

              {/* Histórico */}
              <Section title={`Históricos (${stats.quarters_analyzed || 0} quarters)`}>
                {history.length === 0 ? (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Sin datos históricos disponibles en FMP.</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                      {stats.beat_rate_pct != null && (
                        <Stat label="Beat rate" value={`${Math.round(stats.beat_rate_pct)}%`} />
                      )}
                      {stats.surprise_avg_pct != null && (
                        <Stat label="Surprise media" value={fmtPct(stats.surprise_avg_pct)} />
                      )}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 600 }}>Fecha</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 600 }}>EPS act</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 600 }}>EPS est</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 600 }}>Surprise</th>
                          <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 600 }}>B/M</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px', fontFamily: 'var(--fm)' }}>{h.date}</td>
                            <td style={{ padding: '6px', fontFamily: 'var(--fm)', textAlign: 'right' }}>{h.eps_actual != null ? '$' + fmtNum(h.eps_actual) : '—'}</td>
                            <td style={{ padding: '6px', fontFamily: 'var(--fm)', textAlign: 'right', color: 'var(--text-tertiary)' }}>{h.eps_estimate != null ? '$' + fmtNum(h.eps_estimate) : '—'}</td>
                            <td style={{
                              padding: '6px',
                              fontFamily: 'var(--fm)',
                              textAlign: 'right',
                              color: h.surprise_pct == null ? 'var(--text-tertiary)' : (h.surprise_pct >= 0 ? 'var(--green)' : 'var(--red)'),
                              fontWeight: 600,
                            }}>
                              {fmtPct(h.surprise_pct)}
                            </td>
                            <td style={{ padding: '6px', textAlign: 'right' }}>
                              {h.beat == null ? '—' : (h.beat ? '✓' : '✗')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </Section>

              {!upcoming && (
                <div style={{
                  marginTop: 16,
                  padding: 12,
                  background: 'var(--subtle-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-tertiary)',
                  fontSize: 12,
                }}>
                  No hay próximos earnings programados para {ticker} en los siguientes 30 días.
                </div>
              )}
            </>
          )}
      </>
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: 600,
        marginBottom: 10,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--fm)', color: 'var(--text-primary)', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

// ── Style helpers ──
function btnStyle(disabled = false) {
  return {
    padding: '10px 18px',
    background: disabled ? 'var(--subtle-bg)' : 'var(--green)',
    color: disabled ? 'var(--text-secondary)' : '#fff',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'wait' : 'pointer',
  };
}
function badgeStyle(color) {
  return {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    background: color,
    color: '#fff',
    fontFamily: 'var(--fm)',
    whiteSpace: 'nowrap',
  };
}

// ── Calendar view: 5-week mini grid with ticker chips per day ────────
const DAY_LABELS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

function CalendarView({ items, selectedDay, setSelectedDay, setModalTicker }) {
  // Build 35-day grid starting from today's Monday
  const grid = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const dow = (today.getDay() + 6) % 7; // Mon=0..Sun=6
    const start = new Date(today); start.setDate(start.getDate() - dow);
    const cells = [];
    for (let i = 0; i < 35; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      cells.push({ iso, day: d.getDate(), month: d.getMonth(), today: iso === today.toISOString().slice(0, 10), past: d < today });
    }
    return cells;
  }, []);

  // Bucket items by date
  const byDate = useMemo(() => {
    const m = {};
    for (const it of items) {
      const d = it.earnings_date;
      if (!d) continue;
      if (!m[d]) m[d] = [];
      m[d].push(it);
    }
    return m;
  }, [items]);

  const dayItems = selectedDay ? (byDate[selectedDay] || []) : [];

  // Importance ring color
  const ringColor = (importance) => importance === 'critical' ? '#ef4444' : importance === 'high' ? '#ff9f0a' : 'var(--text-tertiary)';

  return (
    <>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Day-of-week header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {DAY_LABELS.map(d => (
            <div key={d} style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', fontFamily: 'var(--fm)', textAlign: 'center', fontWeight: 600 }}>
              {d}
            </div>
          ))}
        </div>
        {/* 5-week grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {grid.map((c, i) => {
            const dayList = byDate[c.iso] || [];
            const isSelected = selectedDay === c.iso;
            const hasCritical = dayList.some(d => d.importance === 'critical');
            const hasHigh = dayList.some(d => d.importance === 'high');
            const accent = hasCritical ? '#ef4444' : hasHigh ? '#ff9f0a' : null;
            return (
              <div key={c.iso}
                onClick={() => dayList.length > 0 && setSelectedDay(isSelected ? null : c.iso)}
                style={{
                  minHeight: 78,
                  padding: '5px 6px 6px',
                  borderRight: i % 7 === 6 ? 'none' : '1px solid var(--subtle-border)',
                  borderBottom: i < 28 ? '1px solid var(--subtle-border)' : 'none',
                  background: isSelected ? 'var(--gold-dim)' : c.today ? 'rgba(200,164,78,.06)' : 'transparent',
                  opacity: c.past ? 0.4 : 1,
                  cursor: dayList.length > 0 ? 'pointer' : 'default',
                  position: 'relative',
                  transition: 'background .15s',
                  outline: isSelected ? '1.5px solid var(--gold)' : 'none',
                }}
                onMouseEnter={e => { if (dayList.length > 0 && !isSelected) e.currentTarget.style.background = 'var(--row-alt)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = c.today ? 'rgba(200,164,78,.06)' : 'transparent'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: c.today ? 700 : 500, color: c.today ? 'var(--gold)' : 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
                    {c.day}
                  </span>
                  {accent && <span style={{ width: 5, height: 5, borderRadius: 3, background: accent }} />}
                </div>
                {/* Ticker chips (max 3 visible, "+N" overflow) */}
                {dayList.slice(0, 3).map(it => (
                  <div key={it.ticker}
                    style={{
                      fontSize: 9, fontWeight: 700, fontFamily: 'var(--fm)',
                      padding: '2px 4px', borderRadius: 3, marginBottom: 2,
                      color: it.importance === 'critical' ? '#ef4444' : it.importance === 'high' ? '#ff9f0a' : 'var(--text-secondary)',
                      background: it.importance === 'critical' ? 'rgba(239,68,68,.08)' : it.importance === 'high' ? 'rgba(255,159,10,.08)' : 'var(--subtle-bg)',
                      border: `1px solid ${ringColor(it.importance)}33`,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                    {it.ticker}
                  </div>
                ))}
                {dayList.length > 3 && (
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 2 }}>+{dayList.length - 3}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day expansion */}
      {selectedDay && dayItems.length > 0 && (
        <div style={{ marginTop: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--fm)', color: 'var(--gold)', marginBottom: 10 }}>
            {fmtDate(selectedDay)} · {dayItems.length} earnings
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dayItems.map(it => (
              <div key={it.ticker} onClick={() => setModalTicker(it.ticker)}
                style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'var(--subtle-bg)', borderRadius: 7, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--row-alt)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--subtle-bg)'}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>{it.ticker}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{it.earnings_time ? it.earnings_time.toUpperCase() : '—'}{it.eps_estimate != null ? ` · EPS ${fmtNum(it.eps_estimate)}` : ''}</span>
                <span style={badgeStyle(IMPORTANCE_COLOR[it.importance])}>
                  {fmtPct(it.weight_pct, 1).replace('+', '')} · {IMPORTANCE_LABEL[it.importance]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
