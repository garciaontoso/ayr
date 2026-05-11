// Sprint 22 — Post-Trade Review Modal
// Aparece al cerrar trade. Captura was_correct, surprise, lesson, emotional_state.
// Sin completar → siguiente apertura bloqueada (JOURNAL_PENDING rule).

import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.onto-so.com';

const EMOTIONAL_STATES = [
  { id: 'satisfied',  label: 'Satisfecho ✅' },
  { id: 'relieved',   label: 'Relieved 😅' },
  { id: 'neutral',    label: 'Neutral 😐' },
  { id: 'frustrated', label: 'Frustrated 😤' },
  { id: 'regretful',  label: 'Regretful 😞' },
  { id: 'angry',      label: 'Angry 😠' },
];

export default function PostTradeReviewModal({ tradeRef, symbol, pnlDollars, onCancel, onSubmit }) {
  const [wasCorrect, setWasCorrect] = useState(null);
  const [surprise, setSurprise] = useState('');
  const [lesson, setLesson] = useState('');
  const [emotional, setEmotional] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = wasCorrect != null && lesson.trim().length >= 10;
  const pnlPositive = (pnlDollars || 0) >= 0;

  const handleSubmit = async () => {
    setSubmitting(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/guardrails/journal/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade_ref: tradeRef,
          symbol,
          close_pnl_dollars: pnlDollars,
          was_correct: wasCorrect,
          surprise: surprise.trim() || null,
          lesson: lesson.trim(),
          emotional_state: emotional,
        }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      onSubmit?.(j);
    } catch (e) {
      setError(e.message);
    }
    setSubmitting(false);
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--gold, #fbbf24)' }}>
            📓 Post-trade Review — {symbol}
          </h3>
          <button onClick={onCancel} style={closeBtnStyle}>✕</button>
        </div>

        {pnlDollars != null && (
          <div style={{ fontSize: 14, marginBottom: 14, padding: 8, background: pnlPositive ? 'rgba(48,209,88,.1)' : 'rgba(239,68,68,.1)', borderRadius: 4, color: pnlPositive ? '#30d158' : '#ef4444', fontWeight: 700 }}>
            P&L: {pnlPositive ? '+' : ''}${Number(pnlDollars).toFixed(2)}
          </div>
        )}

        {/* Was thesis correct */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
            ¿La thesis original fue correcta?
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setWasCorrect(true)}
              style={{
                ...btnStyle, flex: 1,
                background: wasCorrect === true ? '#30d158' : 'var(--bg-primary)',
                color: wasCorrect === true ? '#000' : 'var(--text-primary)',
                fontWeight: wasCorrect === true ? 700 : 400,
              }}
            >✓ Sí</button>
            <button
              onClick={() => setWasCorrect(false)}
              style={{
                ...btnStyle, flex: 1,
                background: wasCorrect === false ? '#ef4444' : 'var(--bg-primary)',
                color: wasCorrect === false ? '#fff' : 'var(--text-primary)',
                fontWeight: wasCorrect === false ? 700 : 400,
              }}
            >✗ No / Parcial</button>
          </div>
        </div>

        {/* Surprise (optional) */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Sorpresa principal (opcional) — ¿qué pasó que no esperabas?
          </div>
          <textarea
            value={surprise}
            onChange={e => setSurprise(e.target.value)}
            placeholder="Ej: VIX subió 15% intradía sin catalyst, gap-down apertura, IV crush post-CPI..."
            rows={2}
            style={inputStyle}
          />
        </div>

        {/* Lesson */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
            Lección para el futuro (mín 10 chars) — ¿qué harías diferente?
          </div>
          <textarea
            value={lesson}
            onChange={e => setLesson(e.target.value)}
            placeholder="Ej: Bajar size cuando regime ranging pero VVIX >100. No abrir BPS si yield curve invierte sin confirm de 2d..."
            rows={3}
            style={inputStyle}
          />
          <div style={{ fontSize: 10, color: lesson.trim().length >= 10 ? '#30d158' : '#ef4444', marginTop: 2 }}>
            {lesson.trim().length}/10 chars
          </div>
        </div>

        {/* Emotional state */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
            ¿Cómo te sientes al cerrar?
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {EMOTIONAL_STATES.map(s => (
              <button
                key={s.id}
                onClick={() => setEmotional(s.id)}
                style={{
                  ...btnStyle,
                  background: emotional === s.id ? 'var(--accent, #60a5fa)' : 'var(--bg-primary)',
                  color: emotional === s.id ? '#000' : 'var(--text-primary)',
                  fontSize: 11,
                }}
              >{s.label}</button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ padding: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 6, color: '#ef4444', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={submitting} style={{ ...btnStyle, background: 'transparent' }}>
            Dejar para después
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            style={{
              ...btnStyle,
              background: canSubmit ? '#30d158' : 'var(--bg-primary)',
              color: canSubmit ? '#000' : 'var(--text-tertiary)',
              fontWeight: 700,
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? '⏳ Guardando...' : '✓ Submit review'}
          </button>
        </div>

        <div style={{ marginTop: 14, fontSize: 10, color: 'var(--text-tertiary)' }}>
          💡 Reviews pendientes bloquean nuevas aperturas. Completa rápido o "dejar para después" si urgente.
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,.75)', zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14,
};

const modalStyle = {
  background: 'var(--bg-secondary, #1c1c1e)', border: '1px solid var(--border, #333)',
  borderRadius: 8, padding: 18, maxWidth: 480, width: '100%',
  maxHeight: '90vh', overflowY: 'auto', fontSize: 13,
};

const closeBtnStyle = {
  background: 'transparent', color: 'var(--text-tertiary)',
  border: 'none', fontSize: 18, cursor: 'pointer', padding: 4,
};

const btnStyle = {
  padding: '6px 12px', fontSize: 12,
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
};

const inputStyle = {
  width: '100%', padding: 8, fontSize: 12, boxSizing: 'border-box',
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 4, resize: 'vertical',
  fontFamily: 'inherit',
};
