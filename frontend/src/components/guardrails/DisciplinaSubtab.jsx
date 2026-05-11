// Sprint 22 — Tab "🛡 Disciplina" inside ThetaGangTab.
// Dashboard de estado conductual + cooldowns activos + journal pendiente +
// overrides recientes + reviews semanales.

import { useState, useEffect, useCallback } from 'react';
import PostTradeReviewModal from './PostTradeReviewModal.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.onto-so.com';

export default function DisciplinaSubtab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [reviewModal, setReviewModal] = useState(null);  // {trade_ref, symbol, pnl}
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${API_URL}/api/guardrails/dashboard`);
      const j = await r.json();
      if (j.error) setErr(j.error);
      else setData(j);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading && !data) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Cargando estado conductual...</div>;
  if (err) return <div style={{ padding: 12, margin: 14, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>⚠ {err}</div>;
  if (!data) return null;

  const { state, stats_7d, recent_reviews, pending_journals, recent_overrides } = data;
  const dailyPnlClr = state.daily_pnl_pct >= 0 ? '#30d158' : (state.daily_pnl_pct < -1 ? '#ef4444' : '#fbbf24');
  const lossStreakClr = state.loss_streak >= 3 ? '#ef4444' : state.loss_streak >= 2 ? '#fbbf24' : 'var(--text-secondary)';
  const navTier = state.daily_pnl_pct <= -2 ? 'CRITICAL' : state.daily_pnl_pct <= -1 ? 'WARN' : 'OK';

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* HERO */}
      <div style={{ ...CARD, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold, #fbbf24)' }}>🛡 Anti-Estupidez Engine</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Sprint 22 — protege contra los 7 errores que matan cuentas. {state.active_kill_switches.length > 0 || state.active_cooldowns.length > 0 ? '🔒 Hay reglas activas.' : '✓ Sin bloqueos.'}
          </div>
        </div>
        <button onClick={refresh} style={btnStyle}>↻ Refresh</button>
      </div>

      {/* Hero stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <StatCard label="NAV" value={`$${(state.nav / 1000).toFixed(0)}k`} color="var(--text-primary)" />
        <StatCard label="P&L hoy" value={`${state.daily_pnl_pct >= 0 ? '+' : ''}${state.daily_pnl_pct.toFixed(2)}%`} color={dailyPnlClr} subtitle={navTier} />
        <StatCard label="Loss streak" value={state.loss_streak} color={lossStreakClr} subtitle={state.loss_streak >= 3 ? 'block 24h' : 'ok'} />
        <StatCard label="VIX" value={state.regime?.vix?.toFixed(1) || '—'} color={state.regime?.vix > 28 ? '#ef4444' : state.regime?.vix > 22 ? '#fbbf24' : '#30d158'} />
        <StatCard label="Hora local" value={`${state.local_hour}:XX`} color={state.local_hour >= 22 || state.local_hour < 8 ? '#fbbf24' : '#30d158'} />
        <StatCard label="Journal pendiente" value={state.journal_pending_close_count} color={state.journal_pending_close_count > 0 ? '#ef4444' : '#30d158'} />
      </div>

      {/* Active kill switches */}
      {state.active_kill_switches.length > 0 && (
        <div style={{ ...CARD, borderColor: '#ef4444' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>🚨 Kill-switches activos</div>
          {state.active_kill_switches.map((ks, i) => (
            <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
              <b>{ks.rule}</b> — {ks.reason}
              {ks.expires_at && <span style={{ color: 'var(--text-tertiary)' }}> · until {new Date(ks.expires_at).toLocaleString()}</span>}
              {ks.can_override && <span style={{ color: '#fbbf24', marginLeft: 6 }}>(overridable)</span>}
            </div>
          ))}
        </div>
      )}

      {/* Active cooldowns */}
      {state.active_cooldowns.length > 0 && (
        <div style={{ ...CARD, borderColor: '#fbbf24' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 6 }}>⏸ Cooldowns activos (NO overridable)</div>
          {state.active_cooldowns.map((cd, i) => (
            <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
              <b>{cd.type}</b> — {cd.reason}
              <span style={{ color: 'var(--text-tertiary)' }}> · expires {new Date(cd.expires_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Weekly review */}
      {state.weekly_review_required_by && !state.weekly_review_done_at && (
        <div style={{ ...CARD, borderColor: '#60a5fa' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 4 }}>📝 Domingo review pendiente</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Required by: {state.weekly_review_required_by}. Sin completar bloquea opens lunes.
          </div>
          <button onClick={() => setShowWeeklyReview(true)} style={{ ...btnStyle, background: '#60a5fa', color: '#000', fontWeight: 700 }}>
            Completar ahora (3min)
          </button>
        </div>
      )}

      {/* Pending journals */}
      {pending_journals?.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📓 Journals pendientes ({pending_journals.length})</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Trades cerrados sin review. Sin completar bloquea nuevos opens.
          </div>
          {pending_journals.slice(0, 5).map((j, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 11 }}>
                <b>{j.symbol}</b> · {j.trade_ref.slice(-20)} · closed {j.closed_at?.slice(0, 16)} · P&L ${(j.close_pnl_dollars || 0).toFixed(0)}
              </div>
              <button
                onClick={() => setReviewModal({ trade_ref: j.trade_ref, symbol: j.symbol, pnl: j.close_pnl_dollars })}
                style={{ ...btnStyle, fontSize: 11, padding: '4px 8px' }}
              >Review</button>
            </div>
          ))}
        </div>
      )}

      {/* Actions stats 7d */}
      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📊 Actividad últimos 7 días</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
          <span>Opens: <b>{stats_7d?.open || 0}</b></span>
          <span>Closes: <b>{stats_7d?.close || 0}</b></span>
          <span>Cancels: <b style={{ color: stats_7d?.cancel > 3 ? '#fbbf24' : 'inherit' }}>{stats_7d?.cancel || 0}</b></span>
          <span>Overrides: <b style={{ color: stats_7d?.override > 0 ? '#ef4444' : 'inherit' }}>{stats_7d?.override || 0}</b></span>
        </div>
        {(stats_7d?.override || 0) > 0 && (
          <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>
            ⚠ Cada override desgasta tu disciplina. Si lo haces &gt;1×/semana, las reglas no te están sirviendo — revisa los thresholds.
          </div>
        )}
      </div>

      {/* Recent overrides */}
      {recent_overrides?.length > 0 && (
        <details style={{ ...CARD, padding: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            ⚠ Overrides recientes ({recent_overrides.length}) — auditoría
          </summary>
          <div style={{ marginTop: 8, fontSize: 11 }}>
            {recent_overrides.map((o, i) => (
              <div key={i} style={{ padding: '4px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <div><b>{o.rule}</b> · {o.symbol || '—'} · {o.ts?.slice(0, 16)}</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 10, marginTop: 2 }}>{o.reason}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Recent weekly reviews */}
      {recent_reviews?.length > 0 && (
        <details style={{ ...CARD, padding: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            📝 Últimos {recent_reviews.length} reviews semanales
          </summary>
          <div style={{ marginTop: 8 }}>
            {recent_reviews.map((r, i) => (
              <div key={i} style={{ padding: '4px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 11 }}>
                <div><b>{r.week_ending}</b> · submitted {r.submitted_at?.slice(0, 16)}</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 10, marginTop: 2 }}>{r.biggest_lesson}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Footer info */}
      <div style={{ padding: 10, background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        💡 <b>Filosofía Sprint 22</b>: top traders no son brillantes, son disciplinados. Este sistema rechaza tus peores hábitos automáticamente. Los 7 errores que cubre: revenge trading, over-sizing, holding losers, earnings unintencional, concentration creep, skipping filter, trading tired.
      </div>

      {/* Modals */}
      {reviewModal && (
        <PostTradeReviewModal
          tradeRef={reviewModal.trade_ref}
          symbol={reviewModal.symbol}
          pnlDollars={reviewModal.pnl}
          onCancel={() => setReviewModal(null)}
          onSubmit={() => { setReviewModal(null); refresh(); }}
        />
      )}
      {showWeeklyReview && <WeeklyReviewModal onCancel={() => setShowWeeklyReview(false)} onSubmit={() => { setShowWeeklyReview(false); refresh(); }} />}
    </div>
  );
}

// ─── Stat card mini-component ──────────────────────────────────────────────
function StatCard({ label, value, color, subtitle }) {
  return (
    <div style={{ ...CARD, padding: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
      {subtitle && <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{subtitle}</div>}
    </div>
  );
}

// ─── Weekly review modal ──────────────────────────────────────────────────
function WeeklyReviewModal({ onCancel, onSubmit }) {
  const [winActual, setWinActual] = useState('');
  const [winExpected, setWinExpected] = useState('');
  const [skipsCount, setSkipsCount] = useState('');
  const [lesson, setLesson] = useState('');
  const [focus, setFocus] = useState('');
  const [emoScore, setEmoScore] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const canSubmit = lesson.trim().length >= 20 && focus.trim().length >= 10;

  const submit = async () => {
    setSubmitting(true); setErr(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = await fetch(`${API_URL}/api/guardrails/weekly-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_ending: today,
          win_rate_actual: winActual ? Number(winActual) : null,
          win_rate_expected: winExpected ? Number(winExpected) : null,
          trades_skipping_rules: skipsCount ? Number(skipsCount) : null,
          biggest_lesson: lesson.trim(),
          focus_next_week: focus.trim(),
          emotional_avg_score: emoScore,
        }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      onSubmit?.();
    } catch (e) { setErr(e.message); }
    setSubmitting(false);
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#60a5fa' }}>📝 Weekly Review</h3>
          <button onClick={onCancel} style={closeBtnStyle}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <Label>Win rate semana (%)</Label>
            <input type="number" value={winActual} onChange={e => setWinActual(e.target.value)} placeholder="ej 75" style={inputStyle} />
          </div>
          <div>
            <Label>Win rate esperado backtest (%)</Label>
            <input type="number" value={winExpected} onChange={e => setWinExpected(e.target.value)} placeholder="ej 78" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>¿Cuántos trades te saltaste reglas?</Label>
          <input type="number" value={skipsCount} onChange={e => setSkipsCount(e.target.value)} placeholder="0 = compliant" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>Mayor lección de esta semana (≥20 chars)</Label>
          <textarea value={lesson} onChange={e => setLesson(e.target.value)} rows={3} style={inputStyle} placeholder="Ej: Cuando VIX sube intradía >15%, mi defense playbook tarda. Necesito cerrar manualmente antes de la regla automática..." />
          <div style={{ fontSize: 10, color: lesson.trim().length >= 20 ? '#30d158' : '#ef4444' }}>{lesson.trim().length}/20</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>Foco semana próxima (≥10 chars)</Label>
          <textarea value={focus} onChange={e => setFocus(e.target.value)} rows={2} style={inputStyle} placeholder="Ej: solo trades brain≥75, max 2 nuevos opens/día, cerrar al 50% sin excusas" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>Disciplina emocional promedio (1-5)</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setEmoScore(n)} style={{ ...btnStyle, flex: 1, background: emoScore === n ? 'var(--gold, #fbbf24)' : 'var(--bg-primary)', color: emoScore === n ? '#000' : 'var(--text-primary)' }}>{n}</button>
            ))}
          </div>
        </div>

        {err && <div style={{ padding: 10, background: 'rgba(239,68,68,.1)', color: '#ef4444', borderRadius: 4, fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ ...btnStyle, background: 'transparent' }} disabled={submitting}>Cancelar</button>
          <button onClick={submit} disabled={!canSubmit || submitting} style={{ ...btnStyle, background: canSubmit ? '#60a5fa' : 'var(--bg-primary)', color: canSubmit ? '#000' : 'var(--text-tertiary)', fontWeight: 700 }}>
            {submitting ? '⏳' : '✓ Submit weekly'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>{children}</div>;
}

// ─── Styles ───────────────────────────────────────────────────────────────
const CARD = {
  padding: 12,
  background: 'var(--bg-secondary, #1c1c1e)',
  border: '1px solid var(--border, #333)',
  borderRadius: 6,
};

const btnStyle = {
  padding: '5px 10px', fontSize: 11,
  background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
};

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,.75)', zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14,
};

const modalStyle = {
  background: 'var(--bg-secondary, #1c1c1e)', border: '1px solid var(--border, #333)',
  borderRadius: 8, padding: 18, maxWidth: 500, width: '100%',
  maxHeight: '90vh', overflowY: 'auto', fontSize: 13,
};

const closeBtnStyle = {
  background: 'transparent', color: 'var(--text-tertiary)',
  border: 'none', fontSize: 18, cursor: 'pointer', padding: 4,
};

const inputStyle = {
  width: '100%', padding: 8, fontSize: 12, boxSizing: 'border-box',
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 4, resize: 'vertical',
  fontFamily: 'inherit',
};
