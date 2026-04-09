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
  const [view, setView] = useState('upcoming'); // 'upcoming' | 'recent'
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

  // ── Fetchers ──
  const fetchUpcoming = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/earnings/upcoming?days=30`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      setUpcoming(j);
      setError(null);
    } catch (e) {
      setError(e.message || 'Error al cargar upcoming');
    }
  }, []);

  const fetchRecent = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/earnings/post`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      setRecent(j);
    } catch (e) {
      // silent — keep upcoming working
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchUpcoming(), fetchRecent()]);
    setLastUpdated(new Date());
    setLoading(false);
  }, [fetchUpcoming, fetchRecent]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch(`${API_URL}/api/earnings/briefing/refresh`, { method: 'POST' });
      await fetchAll();
    } catch (e) {
      setError('Error al refrescar calendar');
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll]);

  const fetchBriefing = useCallback(async (ticker) => {
    setBriefing(null);
    setBriefingError(null);
    setBriefingLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/earnings/briefing/${encodeURIComponent(ticker)}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      setBriefing(j);
    } catch (e) {
      setBriefingError(e.message || 'Error al cargar briefing');
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  // ── Effects ──
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (modalTicker) fetchBriefing(modalTicker);
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
            Próximos 30 días
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>
            {counts.total} earnings
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {counts.critical > 0 && (
              <span style={badgeStyle(IMPORTANCE_COLOR.critical)}>
                {counts.critical} crítico{counts.critical !== 1 ? 's' : ''}
              </span>
            )}
            {counts.high > 0 && (
              <span style={badgeStyle(IMPORTANCE_COLOR.high)}>
                {counts.high} alto{counts.high !== 1 ? 's' : ''}
              </span>
            )}
            {lastUpdated && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Actualizado: {lastUpdated.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <Button
          onClick={handleRefresh}
          loading={refreshing}
          variant="primary"
          size="md"
        >
          {refreshing ? 'Refrescando...' : '🔄 Refrescar calendar'}
        </Button>
      </div>

      {/* ── SUB-TABS ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <SubTab label="📅 Próximos" active={view === 'upcoming'} onClick={() => setView('upcoming')} count={items.length} />
        <SubTab label="🎯 Recientes (7d)" active={view === 'recent'} onClick={() => setView('recent')} count={recentItems.length} />
      </div>

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
