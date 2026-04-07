import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants';
import { Button } from '../ui';

const COUNTRY_FLAG = { US: '🇺🇸', EU: '🇪🇺', CN: '🇨🇳', JP: '🇯🇵', GB: '🇬🇧', DE: '🇩🇪' };

// Spanish labels (consistency: avoid mixing HIGH/ALTA/medium/MEDIA)
const IMPACT_STYLE = {
  high:   { label: '📈 ALTA',   color: 'var(--ds-danger)' },
  medium: { label: '📊 MEDIA',  color: 'var(--ds-warning)' },
  low:    { label: '📉 BAJA',   color: 'var(--text-tertiary)' },
};

const EXPOSURE_STYLE = {
  high:   { label: 'ALTA',  icon: '🔴', color: 'var(--red)' },
  medium: { label: 'MEDIA', icon: '🟡', color: 'var(--gold)' },
  low:    { label: 'BAJA',  icon: '⚪', color: 'var(--text-tertiary)' },
};

function chip(bg, fg, extra = {}) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    background: bg,
    color: fg,
    border: '1px solid var(--border)',
    ...extra,
  };
}

function formatDayLabel(dateStr) {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    if (dd.getTime() === today.getTime()) return 'Hoy';
    if (dd.getTime() === tomorrow.getTime()) return 'Mañana';
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return dateStr;
  }
}

export default function MacroTab() {
  // ── STATE (declared BEFORE any effects/callbacks — TDZ safe) ──
  const [days, setDays] = useState(14);
  const [events, setEvents] = useState([]);
  const [portfolioSectors, setPortfolioSectors] = useState({});
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // ── DATA FETCH ──
  const loadData = useCallback(async (d = days) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/macro/upcoming?days=${d}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setEvents(Array.isArray(json.events) ? json.events : []);
      setPortfolioSectors(json.portfolio_sectors || {});
      setTotalValue(json.total_value_usd || 0);
    } catch (e) {
      setError(e.message || 'Error cargando eventos');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetch(`${API_URL}/api/macro/refresh`, { method: 'POST' });
      await loadData(days);
    } catch (e) {
      setError(e.message || 'Error refrescando datos');
    } finally {
      setRefreshing(false);
    }
  }, [days, loadData]);

  useEffect(() => { loadData(days); }, [days, loadData]);

  // ── DERIVED ──
  const eventsByDay = useMemo(() => {
    const groups = {};
    for (const ev of events) {
      const key = ev.event_date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(ev);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({
        date,
        label: formatDayLabel(date),
        list: list.sort((a, b) => (a.event_time || '').localeCompare(b.event_time || '')),
      }));
  }, [events]);

  const topSectors = useMemo(() => {
    return Object.entries(portfolioSectors || {})
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
  }, [portfolioSectors]);

  // ── STYLES ──
  const containerStyle = { padding: '16px 0', color: 'var(--text-primary)' };
  const headerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 };
  const titleStyle = { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 };
  const chipBtn = (active) => ({
    padding: '6px 12px',
    borderRadius: 16,
    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'var(--gold)' : 'var(--subtle-bg)',
    color: active ? '#1a1a1a' : 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  });
  const refreshBtn = {
    padding: '6px 14px',
    borderRadius: 16,
    border: '1px solid var(--border)',
    background: 'var(--subtle-bg)',
    color: 'var(--text-primary)',
    cursor: refreshing ? 'wait' : 'pointer',
    fontSize: 12,
    fontWeight: 600,
    opacity: refreshing ? 0.6 : 1,
  };
  const sectorPillRow = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    padding: '10px 12px',
    background: 'var(--subtle-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    marginBottom: 16,
    position: 'sticky',
    top: 0,
    zIndex: 5,
  };
  const dayHeaderStyle = {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'capitalize',
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: '1px solid var(--border)',
  };
  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: '40px 50px 1fr auto auto',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: 'var(--subtle-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    marginBottom: 6,
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  return (
    <div style={containerStyle}>
      {/* HEADER */}
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>🌍 Macro Calendar</h2>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {loading ? 'Cargando…' : `${events.length} eventos en los próximos ${days} días`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[7, 14, 30].map((d) => (
            <button key={d} style={chipBtn(days === d)} onClick={() => setDays(d)}>
              {d} días
            </button>
          ))}
          <Button onClick={handleRefresh} loading={refreshing} variant="primary" size="md">
            {refreshing ? 'Refrescando…' : '🔄 Refrescar'}
          </Button>
        </div>
      </div>

      {/* PORTFOLIO SECTORS PILL ROW */}
      {topSectors.length > 0 && (
        <div style={sectorPillRow}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>Tu cartera:</span>
          {topSectors.map(([sector, pct], i) => (
            <span key={sector} style={{ fontSize: 12, color: 'var(--text-primary)' }}>
              {sector} <span style={{ color: 'var(--gold)', fontFamily: 'var(--fm)', fontWeight: 700 }}>{Number(pct).toFixed(1)}%</span>
              {i < topSectors.length - 1 && <span style={{ color: 'var(--text-tertiary)', margin: '0 4px' }}>·</span>}
            </span>
          ))}
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div style={{ padding: 12, background: 'var(--subtle-bg)', border: '1px solid var(--red)', borderRadius: 8, color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* EMPTY STATE */}
      {!loading && !error && events.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--subtle-bg)', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
          <div style={{ fontSize: 14 }}>
            No hay eventos económicos en los próximos {days} días.
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Pulsa <strong>Refrescar</strong> para cargar del FMP.
          </div>
        </div>
      )}

      {/* EVENT LIST */}
      {eventsByDay.map((day) => (
        <div key={day.date}>
          <div style={dayHeaderStyle}>{day.label}</div>
          {day.list.map((ev) => {
            const impact = IMPACT_STYLE[ev.impact_level] || IMPACT_STYLE.low;
            const exposure = EXPOSURE_STYLE[ev.exposure_level] || EXPOSURE_STYLE.low;
            const tickers = Array.isArray(ev.affected_tickers)
              ? ev.affected_tickers
              : (typeof ev.affected_tickers === 'string' ? ev.affected_tickers.split(',').map(s => s.trim()).filter(Boolean) : []);
            const sectors = Array.isArray(ev.primary_sectors)
              ? ev.primary_sectors
              : (typeof ev.primary_sectors === 'string' ? ev.primary_sectors.split(',').map(s => s.trim()).filter(Boolean) : []);
            return (
              <div
                key={ev.id}
                style={rowStyle}
                onClick={() => setSelectedEvent({ ...ev, _tickers: tickers, _sectors: sectors })}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ fontSize: 22, textAlign: 'center' }}>
                  {COUNTRY_FLAG[ev.country] || '🌐'}
                </div>
                <div style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {ev.event_time || '—'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {ev.event_name}
                    </span>
                    {ev.event_type && (
                      <span style={chip('var(--subtle-bg)', 'var(--text-tertiary)')}>
                        {ev.event_type}
                      </span>
                    )}
                  </div>
                  {tickers.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {tickers.slice(0, 5).map((t) => (
                        <span key={t} style={chip('transparent', 'var(--text-secondary)', { fontFamily: 'var(--fm)' })}>
                          {t}
                        </span>
                      ))}
                      {tickers.length > 5 && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                          +{tickers.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: impact.color, whiteSpace: 'nowrap' }}>
                  {impact.label}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: exposure.color, whiteSpace: 'nowrap' }}>
                  {exposure.icon} {exposure.label}
                  {ev.exposure_pct != null && (
                    <span style={{ marginLeft: 4, fontFamily: 'var(--fm)' }}>
                      ({Number(ev.exposure_pct).toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* MODAL */}
      {selectedEvent && (
        <div
          onClick={() => setSelectedEvent(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
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
              background: 'var(--subtle-bg)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              maxWidth: 640,
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 26 }}>{COUNTRY_FLAG[selectedEvent.country] || '🌐'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                    {selectedEvent.event_date}{selectedEvent.event_time ? ` · ${selectedEvent.event_time}` : ''}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>
                  {selectedEvent.event_name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>

            {/* Estimates row */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, padding: 12, background: 'rgba(0,0,0,0.15)', borderRadius: 8 }}>
              {selectedEvent.consensus_estimate != null && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Consenso</div>
                  <div style={{ fontFamily: 'var(--fm)', fontSize: 14, color: 'var(--text-primary)', fontWeight: 700 }}>
                    {selectedEvent.consensus_estimate}
                  </div>
                </div>
              )}
              {selectedEvent.previous_value != null && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Anterior</div>
                  <div style={{ fontFamily: 'var(--fm)', fontSize: 14, color: 'var(--text-primary)', fontWeight: 700 }}>
                    {selectedEvent.previous_value}
                  </div>
                </div>
              )}
              {selectedEvent.actual_value != null && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Actual</div>
                  <div style={{ fontFamily: 'var(--fm)', fontSize: 14, color: 'var(--green)', fontWeight: 700 }}>
                    {selectedEvent.actual_value}
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Impacto</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: (IMPACT_STYLE[selectedEvent.impact_level] || IMPACT_STYLE.low).color }}>
                  {(IMPACT_STYLE[selectedEvent.impact_level] || IMPACT_STYLE.low).label}
                </div>
              </div>
            </div>

            {/* Sectors */}
            {selectedEvent._sectors && selectedEvent._sectors.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
                  Sectores primarios afectados
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedEvent._sectors.map((s) => (
                    <span key={s} style={chip('rgba(214,158,46,0.15)', 'var(--gold)')}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Rationale */}
            {selectedEvent.rationale && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
                  Por qué importa
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                  {selectedEvent.rationale}
                </div>
              </div>
            )}

            {/* Typical reaction */}
            {selectedEvent.typical_reaction && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
                  Reacción típica del mercado
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {selectedEvent.typical_reaction}
                </div>
              </div>
            )}

            {/* Action advice */}
            {selectedEvent.user_action_advice && (
              <div style={{ marginBottom: 16, padding: 12, background: 'rgba(214,158,46,0.08)', border: '1px solid var(--gold)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>
                  💡 Qué hacer
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                  {selectedEvent.user_action_advice}
                </div>
              </div>
            )}

            {/* Affected tickers */}
            {selectedEvent._tickers && selectedEvent._tickers.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
                  Tus posiciones afectadas ({selectedEvent._tickers.length})
                  {selectedEvent.exposure_pct != null && (
                    <span style={{ marginLeft: 8, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>
                      {Number(selectedEvent.exposure_pct).toFixed(1)}% cartera
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedEvent._tickers.map((t) => (
                    <span key={t} style={chip('var(--subtle-bg)', 'var(--text-primary)', { fontFamily: 'var(--fm)', border: '1px solid var(--border)' })}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
