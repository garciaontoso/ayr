// Accountability widget — shows recommendations_log stats.
// Answers: "have the system's past recommendations been correct?"
// Goal: build trust by making the track record visible.
import React, { useState, useEffect } from 'react';
import { API_URL } from '../../constants/index.js';

const GREEN = '#30d158';
const RED   = '#ff453a';
const GOLD  = '#c8a44e';
const AMBER = '#fbbf24';
const FM    = 'var(--fm)';
const FB    = 'var(--fb)';

const SOURCE_LABELS = {
  deep_dividend:  'Deep Dividend',
  agent_trade:    'Trade agent',
  agent_dividend: 'Dividend agent',
  action_plan:    'Action Plan',
  manual:         'Manual',
};

export default function AccountabilityWidget() {
  const [stats, setStats] = useState(null);
  const [autoReviewing, setAutoReviewing] = useState(false);
  const [autoMsg, setAutoMsg] = useState(null);

  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/api/recommendations/stats`, { credentials: 'include' });
      const d = await r.json();
      if (d.ok) setStats(d);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const runAutoReview = async () => {
    setAutoReviewing(true);
    setAutoMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/recommendations/auto-review`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      setAutoMsg(d.ok ? `${d.reviewed} recs revisados` : (d.error || 'Error'));
      await load();
    } catch (e) {
      setAutoMsg(`Error: ${e.message}`);
    }
    setAutoReviewing(false);
  };

  if (!stats) return null;

  const hitRate = stats.hit_rate_pct;
  const hitColor = hitRate == null ? 'var(--text-tertiary)'
                 : hitRate >= 70 ? GREEN
                 : hitRate >= 50 ? AMBER : RED;

  const avgRet = stats.avg_return_pct;
  const retColor = avgRet == null ? 'var(--text-tertiary)'
                 : avgRet > 0 ? GREEN : RED;

  return (
    <div style={{
      padding: '14px 18px', marginBottom: 20,
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 800, fontFamily: FB, color: 'var(--text-primary)', margin: 0 }}>
            Track Record — ¿Acierta el sistema?
          </h3>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, marginTop: 2 }}>
            Cada recomendación queda registrada con precio y fecha. A los 90 días se revisa si acertó.
          </div>
        </div>
        <button onClick={runAutoReview} disabled={autoReviewing}
          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 10, fontFamily: FM, cursor: autoReviewing ? 'wait' : 'pointer' }}>
          {autoReviewing ? 'Revisando…' : 'Auto-review'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        <Metric label="Registradas" value={stats.total} color="var(--text-primary)" />
        <Metric label="Revisadas" value={stats.reviewed} color="var(--text-primary)" />
        <Metric label="Pendientes" value={stats.pending} color={stats.overdue > 0 ? AMBER : 'var(--text-primary)'} />
        <Metric label="Overdue" value={stats.overdue} color={stats.overdue > 0 ? RED : GREEN} />
        <Metric label="Hit rate" value={hitRate != null ? `${hitRate}%` : '—'} color={hitColor} />
        <Metric label="Retorno medio" value={avgRet != null ? `${avgRet >= 0 ? '+' : ''}${avgRet}%` : '—'} color={retColor} />
      </div>

      {stats.reviewed > 0 && (
        <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-secondary)', fontFamily: FM, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ color: GREEN }}>✓ Correctos: {stats.correct}</span>
          <span style={{ color: AMBER }}>~ Parciales: {stats.partial}</span>
          <span style={{ color: RED }}>✗ Incorrectos: {stats.wrong}</span>
        </div>
      )}

      {stats.by_source && Object.keys(stats.by_source).length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Por fuente (solo revisados)
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 10, fontFamily: FM }}>
            {Object.entries(stats.by_source).map(([src, v]) => (
              <div key={src}>
                <span style={{ color: 'var(--text-tertiary)' }}>{SOURCE_LABELS[src] || src}: </span>
                <span style={{ color: v.hit_rate >= 70 ? GREEN : v.hit_rate >= 50 ? AMBER : RED, fontWeight: 700 }}>
                  {v.hit_rate}% hit
                </span>
                {v.avg_return != null && (
                  <span style={{ color: v.avg_return >= 0 ? GREEN : RED, marginLeft: 6 }}>
                    {v.avg_return >= 0 ? '+' : ''}{v.avg_return}%
                  </span>
                )}
                <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>(n={v.total})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {autoMsg && (
        <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM }}>{autoMsg}</div>
      )}

      {stats.reviewed === 0 && stats.total > 0 && (
        <div style={{ marginTop: 10, padding: '6px 10px', background: `${GOLD}12`, border: `1px solid ${GOLD}40`, borderRadius: 6, fontSize: 10, color: GOLD, fontFamily: FM }}>
          ⏳ Ninguna recomendación ha cumplido 90 días aún. La primera revisión será en julio 2026.
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: FB, marginTop: 2 }}>{value}</div>
    </div>
  );
}
