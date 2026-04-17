import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../../constants/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Decision Journal Tab
// Records trade rationale BEFORE execution and forces an honest review AFTER.
// The #1 skill gap for retail investors.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIONS = ['BUY', 'ADD', 'TRIM', 'SELL'];
const HORIZONS = [
  { id: '3m', lbl: '3 meses' },
  { id: '6m', lbl: '6 meses' },
  { id: '1y', lbl: '1 año' },
  { id: '3y', lbl: '3 años' },
  { id: '5y', lbl: '5 años' },
];
const RESULTS = [
  { id: 'CORRECT',     lbl: 'Correcto',     color: '#30d158' },
  { id: 'PARTIAL',     lbl: 'Parcial',      color: '#c8a44e' },
  { id: 'WRONG',       lbl: 'Incorrecto',   color: '#ff453a' },
  { id: 'INCONCLUSIVE',lbl: 'Inconcl.',     color: '#8e8e93' },
];

const ACTION_COLOR = {
  BUY:  { bg: 'rgba(48,209,88,.12)',  color: '#30d158' },
  ADD:  { bg: 'rgba(48,209,88,.08)',  color: '#34c759' },
  TRIM: { bg: 'rgba(200,164,78,.12)', color: '#c8a44e' },
  SELL: { bg: 'rgba(255,69,58,.12)',  color: '#ff453a' },
};

function ActionBadge({ action }) {
  const s = ACTION_COLOR[action] || { bg: 'rgba(142,142,147,.12)', color: '#8e8e93' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 5,
      background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, fontFamily: 'var(--fm)',
    }}>{action}</span>
  );
}

function ResultBadge({ result }) {
  const meta = RESULTS.find(r => r.id === result);
  if (!meta) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 5,
      background: `${meta.color}20`, color: meta.color,
      fontSize: 10, fontWeight: 700, fontFamily: 'var(--fm)',
    }}>{meta.lbl}</span>
  );
}

function ConvictionDots({ value }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: i < value ? '#c8a44e' : 'var(--border)',
          display: 'inline-block',
        }} />
      ))}
      <span style={{ marginLeft: 4, fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)' }}>
        {value}/10
      </span>
    </span>
  );
}

// ── Statistic card ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '14px 18px', flex: '1 1 140px',
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--fm)', color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Review modal ────────────────────────────────────────────────────────────
function ReviewModal({ decision, onSave, onClose }) {
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const handleSave = useCallback(async () => {
    if (!result) { setErr('Selecciona un resultado'); return; }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`${API_URL}/api/journal/${decision.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_result: result, review_notes: notes }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Error');
      onSave();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }, [decision.id, result, notes, onSave]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 24, width: '100%', maxWidth: 520,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--fd)', color: 'var(--text-primary)' }}>
            Revisar decisión
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 18, cursor: 'pointer' }}>x</button>
        </div>

        {/* Original decision recap */}
        <div style={{ background: 'var(--subtle-bg)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <ActionBadge action={decision.action} />
            <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>{decision.ticker}</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)' }}>{decision.decision_date}</span>
            {decision.conviction && <ConvictionDots value={decision.conviction} />}
          </div>
          {[decision.thesis_1, decision.thesis_2, decision.thesis_3].filter(Boolean).map((t, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--fb)', marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid var(--gold-dim)' }}>
              {t}
            </div>
          ))}
          {decision.target_price && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
              Target ${decision.target_price}
              {decision.stop_price ? ` · Stop $${decision.stop_price}` : ''}
              {decision.price ? ` · Entry $${decision.price}` : ''}
            </div>
          )}
        </div>

        {/* Outcome selection */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 8 }}>Resultado</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RESULTS.map(r => (
              <button key={r.id} onClick={() => setResult(r.id)} style={{
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--fb)',
                border: `1px solid ${result === r.id ? r.color : 'var(--border)'}`,
                background: result === r.id ? `${r.color}20` : 'transparent',
                color: result === r.id ? r.color : 'var(--text-tertiary)',
                transition: 'all .12s',
              }}>{r.lbl}</button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>Notas de revisión</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="¿Qué aprendiste? ¿Qué falló en tu tesis? ¿Qué harías diferente?"
            rows={4}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px',
              background: 'var(--subtle-bg)', border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fb)',
              resize: 'vertical',
            }}
          />
        </div>

        {err && <div style={{ color: '#ff453a', fontSize: 11, marginBottom: 10, fontFamily: 'var(--fb)' }}>{err}</div>}

        <button onClick={handleSave} disabled={saving || !result} style={{
          width: '100%', padding: '10px 0', borderRadius: 9, cursor: saving || !result ? 'not-allowed' : 'pointer',
          background: saving || !result ? 'var(--border)' : 'var(--gold)', color: saving || !result ? 'var(--text-tertiary)' : '#000',
          border: 'none', fontWeight: 700, fontSize: 13, fontFamily: 'var(--fb)', transition: 'opacity .12s',
        }}>
          {saving ? 'Guardando...' : 'Guardar revisión'}
        </button>
      </div>
    </div>
  );
}

// ── New decision form ───────────────────────────────────────────────────────
function NewDecisionForm({ onAdded }) {
  const today = new Date().toISOString().slice(0, 10);

  // All useState BEFORE any useEffect — TDZ guard
  const [form, setForm] = useState({
    decision_date: today,
    ticker: '',
    action: 'BUY',
    shares: '',
    price: '',
    thesis_1: '',
    thesis_2: '',
    thesis_3: '',
    target_price: '',
    stop_price: '',
    time_horizon: '1y',
    conviction: 7,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [success, setSuccess] = useState(false);
  const abortRef = useRef(null);

  const set = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);

  const handleSubmit = useCallback(async () => {
    if (!form.ticker.trim()) { setErr('Ticker requerido'); return; }
    if (!form.thesis_1.trim()) { setErr('Al menos una tesis es requerida'); return; }
    setSaving(true);
    setErr(null);
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const payload = {
        decision_date: form.decision_date,
        ticker: form.ticker.trim().toUpperCase(),
        action: form.action,
        shares: form.shares ? Number(form.shares) : null,
        price: form.price ? Number(form.price) : null,
        thesis_1: form.thesis_1 || null,
        thesis_2: form.thesis_2 || null,
        thesis_3: form.thesis_3 || null,
        target_price: form.target_price ? Number(form.target_price) : null,
        stop_price: form.stop_price ? Number(form.stop_price) : null,
        time_horizon: form.time_horizon || null,
        conviction: Number(form.conviction),
      };
      const r = await fetch(`${API_URL}/api/journal/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Error al guardar');
      setSuccess(true);
      setForm(p => ({
        ...p, ticker: '', shares: '', price: '',
        thesis_1: '', thesis_2: '', thesis_3: '',
        target_price: '', stop_price: '',
      }));
      setTimeout(() => setSuccess(false), 3000);
      onAdded();
    } catch (e) {
      if (e.name !== 'AbortError') setErr(e.message);
    } finally {
      setSaving(false);
    }
  }, [form, onAdded]);

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
    background: 'var(--subtle-bg)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fb)',
  };
  const labelStyle = {
    fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)',
    textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 5, display: 'block',
  };
  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--fd)', color: 'var(--text-primary)', marginBottom: 18 }}>
        Nueva Decisión
      </div>

      <div style={row2}>
        <div>
          <label style={labelStyle}>Ticker</label>
          <input
            value={form.ticker}
            onChange={e => set('ticker', e.target.value.toUpperCase())}
            placeholder="KO"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Fecha</label>
          <input type="date" value={form.decision_date} onChange={e => set('decision_date', e.target.value)} style={inputStyle} />
        </div>
      </div>

      {/* Action + Horizon */}
      <div style={{ ...row2, marginTop: 12 }}>
        <div>
          <label style={labelStyle}>Acción</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {ACTIONS.map(a => {
              const s = ACTION_COLOR[a];
              return (
                <button key={a} onClick={() => set('action', a)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'var(--fm)',
                  border: `1px solid ${form.action === a ? s.color : 'var(--border)'}`,
                  background: form.action === a ? s.bg : 'transparent',
                  color: form.action === a ? s.color : 'var(--text-tertiary)',
                  transition: 'all .12s',
                }}>{a}</button>
              );
            })}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Horizonte</label>
          <select value={form.time_horizon} onChange={e => set('time_horizon', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {HORIZONS.map(h => <option key={h.id} value={h.id}>{h.lbl}</option>)}
          </select>
        </div>
      </div>

      {/* Shares + Price */}
      <div style={{ ...row2, marginTop: 12 }}>
        <div>
          <label style={labelStyle}>Acciones</label>
          <input type="number" value={form.shares} onChange={e => set('shares', e.target.value)} placeholder="100" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Precio entrada ($)</label>
          <input type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="56.50" style={inputStyle} />
        </div>
      </div>

      {/* Target + Stop */}
      <div style={{ ...row2, marginTop: 12 }}>
        <div>
          <label style={labelStyle}>Precio objetivo ($)</label>
          <input type="number" value={form.target_price} onChange={e => set('target_price', e.target.value)} placeholder="70" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Stop loss ($)</label>
          <input type="number" value={form.stop_price} onChange={e => set('stop_price', e.target.value)} placeholder="48" style={inputStyle} />
        </div>
      </div>

      {/* Conviction */}
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Convicción: {form.conviction}/10</label>
        <input
          type="range" min={1} max={10} value={form.conviction}
          onChange={e => set('conviction', Number(e.target.value))}
          style={{ width: '100%', accentColor: '#c8a44e', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 2 }}>
          <span>1 Baja</span><span>5 Media</span><span>10 Alta</span>
        </div>
      </div>

      {/* Thesis */}
      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>Tesis (fuerza al menos 1 argumento concreto)</label>
        <input
          value={form.thesis_1}
          onChange={e => set('thesis_1', e.target.value)}
          placeholder="1. Razón principal — ¿por qué ahora?"
          style={{ ...inputStyle, marginBottom: 7 }}
        />
        <input
          value={form.thesis_2}
          onChange={e => set('thesis_2', e.target.value)}
          placeholder="2. Catalizador o margen de seguridad"
          style={{ ...inputStyle, marginBottom: 7 }}
        />
        <input
          value={form.thesis_3}
          onChange={e => set('thesis_3', e.target.value)}
          placeholder="3. ¿Qué haría que esta decisión sea incorrecta?"
          style={inputStyle}
        />
      </div>

      {err && <div style={{ color: '#ff453a', fontSize: 11, marginTop: 10, fontFamily: 'var(--fb)' }}>{err}</div>}
      {success && <div style={{ color: '#30d158', fontSize: 11, marginTop: 10, fontFamily: 'var(--fb)' }}>Decisión guardada correctamente</div>}

      <button onClick={handleSubmit} disabled={saving} style={{
        marginTop: 16, width: '100%', padding: '10px 0', borderRadius: 9,
        cursor: saving ? 'not-allowed' : 'pointer',
        background: saving ? 'var(--border)' : 'var(--gold)', color: saving ? 'var(--text-tertiary)' : '#000',
        border: 'none', fontWeight: 700, fontSize: 13, fontFamily: 'var(--fb)', transition: 'opacity .12s',
      }}>
        {saving ? 'Guardando...' : 'Registrar decisión'}
      </button>
    </div>
  );
}

// ── Decision card (used in pending + history sections) ──────────────────────
function DecisionCard({ d, onReview, compact }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: compact ? '12px 14px' : '14px 16px',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: compact ? 4 : 8, flexWrap: 'wrap' }}>
        <ActionBadge action={d.action} />
        <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>{d.ticker}</span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)' }}>{d.decision_date}</span>
        {d.conviction && <ConvictionDots value={d.conviction} />}
        {d.review_result && <ResultBadge result={d.review_result} />}
        {d.time_horizon && (
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', background: 'var(--subtle-bg)', padding: '2px 6px', borderRadius: 4 }}>
            {HORIZONS.find(h => h.id === d.time_horizon)?.lbl || d.time_horizon}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: compact ? 0 : 6 }}>
        {d.price && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Entrada ${d.price}</span>}
        {d.target_price && <span style={{ fontSize: 10, color: '#30d158', fontFamily: 'var(--fm)' }}>Target ${d.target_price}</span>}
        {d.stop_price && <span style={{ fontSize: 10, color: '#ff453a', fontFamily: 'var(--fm)' }}>Stop ${d.stop_price}</span>}
        {d.shares && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{d.shares} acc.</span>}
      </div>

      {!compact && [d.thesis_1, d.thesis_2, d.thesis_3].filter(Boolean).map((t, i) => (
        <div key={i} style={{
          fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--fb)',
          marginBottom: 4, paddingLeft: 10, borderLeft: '2px solid var(--gold-dim)',
        }}>{t}</div>
      ))}

      {d.review_notes && (
        <div style={{
          marginTop: 8, padding: '8px 10px', background: 'var(--subtle-bg)', borderRadius: 7,
          fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--fb)', borderLeft: '2px solid var(--border)',
        }}>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.5px' }}>Notas revisión</span>
          {d.review_notes}
        </div>
      )}

      {onReview && (
        <button onClick={() => onReview(d)} style={{
          marginTop: 10, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
          background: 'var(--gold)', color: '#000', border: 'none',
          fontWeight: 700, fontSize: 11, fontFamily: 'var(--fb)',
        }}>
          Revisar ahora
        </button>
      )}
    </div>
  );
}

// ── Learning insights panel ─────────────────────────────────────────────────
function LearningInsights({ stats }) {
  if (!stats || stats.reviewed < 3) {
    return (
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20,
        textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', fontSize: 12,
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📔</div>
        Necesitas al menos 3 decisiones revisadas para generar insights de aprendizaje.
      </div>
    );
  }

  const insights = [];

  if (stats.hit_rate_pct !== null) {
    const color = stats.hit_rate_pct >= 60 ? '#30d158' : stats.hit_rate_pct >= 40 ? '#c8a44e' : '#ff453a';
    insights.push({
      icon: '🎯',
      text: `Tu tasa de acierto global es ${stats.hit_rate_pct}% (${stats.reviewed} decisiones revisadas).`,
      color,
    });
  }

  if (stats.high_conviction_hit_rate_pct !== null && stats.high_conviction_n >= 2) {
    const delta = stats.hit_rate_pct !== null ? stats.high_conviction_hit_rate_pct - stats.hit_rate_pct : null;
    const icon = delta > 5 ? '📈' : delta < -5 ? '⚠️' : '➡️';
    const color = delta > 5 ? '#30d158' : delta < -5 ? '#ff453a' : '#c8a44e';
    insights.push({
      icon,
      text: `Tus decisiones de alta convicción (8+/10) aciertan ${stats.high_conviction_hit_rate_pct}%${delta !== null ? ` (${delta > 0 ? '+' : ''}${delta}pp vs. media)` : ''}.`,
      color,
    });
  }

  if (stats.avg_conviction_correct && stats.avg_conviction_wrong) {
    const diff = (Number(stats.avg_conviction_correct) - Number(stats.avg_conviction_wrong)).toFixed(1);
    if (Math.abs(Number(diff)) >= 0.5) {
      insights.push({
        icon: Number(diff) > 0 ? '✅' : '⚠️',
        text: `Convicción media en correctas ${stats.avg_conviction_correct} vs. incorrectas ${stats.avg_conviction_wrong}. ${Number(diff) > 0 ? 'Tu instinto es calibrado.' : 'Tus decisiones más seguras salen peor — revisa sesgos de sobreconfianza.'}`,
        color: Number(diff) > 0 ? '#30d158' : '#ff453a',
      });
    }
  }

  if (stats.best_tickers?.length) {
    insights.push({
      icon: '🏆',
      text: `Mejor ticker: ${stats.best_tickers[0].ticker} (${stats.best_tickers[0].hit_rate}% en ${stats.best_tickers[0].total} decisiones).`,
      color: '#30d158',
    });
  }

  if (stats.worst_tickers?.length) {
    const worst = stats.worst_tickers[0];
    if (worst && worst.hit_rate < 40) {
      insights.push({
        icon: '🔴',
        text: `Peor ticker: ${worst.ticker} (${worst.hit_rate}% en ${worst.total} decisiones). Revisa si tienes sesgo cognitivo con esta empresa.`,
        color: '#ff453a',
      });
    }
  }

  if (stats.overdue > 0) {
    insights.push({
      icon: '⏰',
      text: `Tienes ${stats.overdue} decisión${stats.overdue > 1 ? 'es' : ''} pendiente${stats.overdue > 1 ? 's' : ''} de revisión vencida${stats.overdue > 1 ? 's' : ''}. La honestidad tardía es mejor que ninguna.`,
      color: '#c8a44e',
    });
  }

  if (!insights.length) {
    insights.push({ icon: '📊', text: 'Sigue registrando decisiones para generar insights personalizados.', color: 'var(--text-tertiary)' });
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--fd)', color: 'var(--text-primary)', marginBottom: 14 }}>
        Insights de Aprendizaje
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {insights.map((ins, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '10px 12px', background: 'var(--subtle-bg)', borderRadius: 9,
            borderLeft: `3px solid ${ins.color}`,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{ins.icon}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--fb)', lineHeight: 1.5 }}>{ins.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function DecisionJournalTab() {
  // All state BEFORE all effects — TDZ guard
  const [activeSection, setActiveSection] = useState('new');
  const [decisions, setDecisions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);

  const loadDecisions = useCallback(async () => {
    setLoading(true);
    try {
      const [allRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/journal/list?status=all`),
        fetch(`${API_URL}/api/journal/stats`),
      ]);
      const allData = await allRes.json();
      const statsData = await statsRes.json();
      if (allData.ok) setDecisions(allData.decisions || []);
      if (statsData.ok) setStats(statsData);
    } catch {
      // silent — will retry on next visit
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDecisions();
  }, [loadDecisions]);

  const today = new Date().toISOString().slice(0, 10);
  const pending = decisions.filter(d => !d.review_completed_at && d.review_date && d.review_date <= today);
  const upcoming = decisions.filter(d => !d.review_completed_at && (!d.review_date || d.review_date > today));
  const reviewed = decisions.filter(d => d.review_completed_at);

  const SECTIONS = [
    { id: 'new',      lbl: 'Nueva Decisión', ico: '+ Registrar' },
    { id: 'pending',  lbl: `Pendientes (${pending.length})`, ico: pending.length > 0 ? `⏰ ${pending.length}` : '0' },
    { id: 'upcoming', lbl: `En Seguimiento (${upcoming.length})`, ico: `${upcoming.length}` },
    { id: 'history',  lbl: `Historial (${reviewed.length})`, ico: `${reviewed.length}` },
    { id: 'insights', lbl: 'Insights', ico: '🧠' },
  ];

  const hitRateColor = stats?.hit_rate_pct >= 60 ? '#30d158' : stats?.hit_rate_pct >= 40 ? '#c8a44e' : '#ff453a';

  return (
    <div style={{ padding: '0 0 40px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--fd)', color: 'var(--text-primary)', marginBottom: 4 }}>
          Decision Journal
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)' }}>
          Registra tu tesis ANTES de operar. Revisa la realidad DESPUÉS. La disciplina más valiosa.
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard label="Total" value={stats.total} sub="decisiones registradas" />
          <StatCard label="Revisadas" value={stats.reviewed} sub={`de ${stats.total} totales`} color="var(--gold)" />
          <StatCard
            label="Tasa de acierto"
            value={stats.hit_rate_pct !== null ? `${stats.hit_rate_pct}%` : '—'}
            sub={stats.reviewed >= 3 ? `${stats.reviewed} revisadas` : 'min. 3 para calcular'}
            color={stats.hit_rate_pct !== null ? hitRateColor : undefined}
          />
          <StatCard
            label="Pendientes"
            value={pending.length}
            sub={pending.length > 0 ? 'vencidas sin revisar' : 'al dia'}
            color={pending.length > 0 ? '#ff453a' : '#30d158'}
          />
          {stats.high_conviction_hit_rate_pct !== null && (
            <StatCard
              label="Alta conviccion (8+)"
              value={`${stats.high_conviction_hit_rate_pct}%`}
              sub={`${stats.high_conviction_n} decisiones`}
              color={stats.high_conviction_hit_rate_pct >= 60 ? '#30d158' : '#ff453a'}
            />
          )}
        </div>
      )}

      {/* Section nav */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
            fontFamily: 'var(--fb)', transition: 'all .12s',
            border: `1px solid ${activeSection === s.id ? 'var(--gold)' : 'var(--border)'}`,
            background: activeSection === s.id ? 'var(--gold-dim)' : 'transparent',
            color: activeSection === s.id ? 'var(--gold)' : 'var(--text-tertiary)',
          }}>{s.lbl}</button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', fontSize: 12 }}>
          Cargando...
        </div>
      )}

      {/* Section: New Decision */}
      {activeSection === 'new' && !loading && (
        <NewDecisionForm onAdded={() => { loadDecisions(); setActiveSection('upcoming'); }} />
      )}

      {/* Section: Pending Review */}
      {activeSection === 'pending' && !loading && (
        <div>
          {pending.length === 0 ? (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '48px 24px', textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--fb)',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Al dia</div>
              <div style={{ fontSize: 12 }}>No hay decisiones vencidas pendientes de revision.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, color: '#ff453a', fontFamily: 'var(--fb)', marginBottom: 4 }}>
                {pending.length} decision{pending.length > 1 ? 'es' : ''} esperando revision honesta
              </div>
              {pending.map(d => (
                <DecisionCard key={d.id} d={d} onReview={setReviewTarget} compact={false} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section: Upcoming (in-flight, review date not yet reached) */}
      {activeSection === 'upcoming' && !loading && (
        <div>
          {upcoming.length === 0 ? (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '48px 24px', textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--fb)',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📔</div>
              <div style={{ fontSize: 12 }}>No hay decisiones activas. Registra tu proxima operacion.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {upcoming.map(d => (
                <DecisionCard key={d.id} d={d} onReview={null} compact={false} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section: History */}
      {activeSection === 'history' && !loading && (
        <div>
          {reviewed.length === 0 ? (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '48px 24px', textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--fb)',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
              <div style={{ fontSize: 12 }}>Todavia sin decisiones revisadas.</div>
            </div>
          ) : (
            <div>
              {/* By-action breakdown mini-table */}
              {stats?.by_action && Object.keys(stats.by_action).length > 0 && (
                <div style={{
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                  padding: '12px 16px', marginBottom: 14,
                  display: 'flex', gap: 16, flexWrap: 'wrap',
                }}>
                  {Object.entries(stats.by_action).map(([action, v]) => (
                    <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ActionBadge action={action} />
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
                        {v.correct}C / {v.partial}P / {v.wrong}W de {v.total}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reviewed.map(d => (
                  <DecisionCard key={d.id} d={d} onReview={null} compact={true} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section: Insights */}
      {activeSection === 'insights' && !loading && (
        <LearningInsights stats={stats} />
      )}

      {/* Review modal */}
      {reviewTarget && (
        <ReviewModal
          decision={reviewTarget}
          onSave={() => { setReviewTarget(null); loadDecisions(); }}
          onClose={() => setReviewTarget(null)}
        />
      )}
    </div>
  );
}
