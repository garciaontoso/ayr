// Sprint 22 — Pre-Trade Ritual Modal
// Forces user through checklist + thesis + conviction BEFORE allowing trade open.
// Calls /api/guardrails/check + /api/guardrails/journal/open.

import { useState, useEffect, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.onto-so.com';

const CHECKLIST = [
  { id: 'iv_rank_ok',       label: 'IV rank ≥50 (premium rico)' },
  { id: 'dte_range_ok',     label: 'DTE 25-45 (sweet spot)' },
  { id: 'no_earnings',      label: 'Sin earnings antes del expiry' },
  { id: 'concentration_ok', label: 'Concentración <8% NAV en este underlying' },
  { id: 'brain_score_ok',   label: 'Brain score ≥70 (o ack consciente)' },
  { id: 'mental_state_ok',  label: 'No cansado/enfadado/distracted' },
];

const EMOTIONAL_STATES = [
  { id: 'focused',     label: 'Focused 🎯' },
  { id: 'calm',        label: 'Calm 😌' },
  { id: 'neutral',     label: 'Neutral 😐' },
  { id: 'excited',     label: 'Excited 🚀' },
  { id: 'fomo',        label: 'FOMO 🏃' },
  { id: 'tired',       label: 'Tired 😴' },
  { id: 'frustrated',  label: 'Frustrated 😤' },
];

const MIN_THESIS = 20;

export default function PreTradeRitualModal({ tradeContext, onCancel, onConfirm }) {
  // tradeContext: { strategy, symbol, contracts, dte, brain_score, ticker?, ... }
  const [checklist, setChecklist] = useState({});
  const [thesis, setThesis] = useState('');
  const [conviction, setConviction] = useState(null);
  const [emotional, setEmotional] = useState(null);
  const [guardrailsCheck, setGuardrailsCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Auto pre-check on mount: shows blocks BEFORE ritual
  useEffect(() => {
    let mounted = true;
    (async () => {
      setChecking(true);
      try {
        // Minimal probe — no ritual content yet
        const r = await fetch(`${API_URL}/api/guardrails/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...tradeContext,
            // Provide placeholder ritual so blocking REASONS show but ritual not the focus
            checklist: { iv_rank_ok: true, dte_range_ok: true, no_earnings: true, concentration_ok: true, brain_score_ok: true, mental_state_ok: true },
            thesis: 'PROBE-INITIAL-CHECK-PLACEHOLDER',
            conviction: 3,
          }),
        });
        const j = await r.json();
        if (mounted) setGuardrailsCheck(j);
      } catch (e) { if (mounted) setError(e.message); }
      setChecking(false);
    })();
    return () => { mounted = false; };
  }, [tradeContext.symbol, tradeContext.strategy]);

  const checkedCount = useMemo(() => Object.values(checklist).filter(Boolean).length, [checklist]);
  const ritualComplete = useMemo(() => {
    return checkedCount === CHECKLIST.length && thesis.trim().length >= MIN_THESIS && conviction != null;
  }, [checkedCount, thesis, conviction]);

  // Blocking rules from initial probe (non-overridable take precedence)
  const hardBlocks = guardrailsCheck?.blocked_by?.filter(b => !b.can_override && b.rule !== 'RITUAL_INCOMPLETE') || [];
  const overridableBlocks = guardrailsCheck?.blocked_by?.filter(b => b.can_override) || [];

  const canSubmit = ritualComplete && hardBlocks.length === 0 && (overridableBlocks.length === 0 || (showOverride && overrideReason.trim().length >= 50));

  const handleSubmit = async () => {
    setSubmitting(true); setError(null);
    try {
      // If overrides needed, log them
      for (const blk of overridableBlocks) {
        await fetch(`${API_URL}/api/guardrails/override`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rule: blk.rule,
            reason: overrideReason.trim(),
            symbol: tradeContext.symbol,
            strategy: tradeContext.strategy,
            contracts: tradeContext.contracts,
          }),
        });
      }
      // Open journal entry
      const trade_ref = `${tradeContext.symbol}-${tradeContext.strategy}-${Date.now()}`;
      const journalResp = await fetch(`${API_URL}/api/guardrails/journal/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade_ref,
          symbol: tradeContext.symbol,
          strategy: tradeContext.strategy,
          thesis: thesis.trim(),
          conviction,
          checklist,
          brain_score: tradeContext.brain_score || null,
          emotional_state: emotional,
        }),
      });
      const journalJ = await journalResp.json();
      if (journalJ.error) throw new Error(journalJ.error + (journalJ.detail ? `: ${journalJ.detail}` : ''));
      // Done
      onConfirm({
        trade_ref,
        ritual_completed: true,
        checklist,
        thesis: thesis.trim(),
        conviction,
        emotional_state: emotional,
        override_used: overridableBlocks.length > 0,
      });
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
            🛡 Pre-trade Ritual — {tradeContext.symbol} {tradeContext.strategy}
          </h3>
          <button onClick={onCancel} style={closeBtnStyle}>✕</button>
        </div>

        {checking && (
          <div style={{ padding: 10, color: 'var(--text-tertiary)', fontSize: 12 }}>Verificando guardrails...</div>
        )}

        {/* Hard blocks: cannot proceed AT ALL */}
        {hardBlocks.length > 0 && (
          <div style={{ ...alertBoxStyle('CRITICAL'), marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>🚨 Bloqueos no-overridables — NO PUEDES ABRIR</div>
            {hardBlocks.map((b, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <b>{b.rule}</b>: {b.reason}
                {b.until && <span style={{ color: 'var(--text-tertiary)' }}> · until {new Date(b.until).toLocaleString()}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Overridable blocks: can proceed with reason */}
        {overridableBlocks.length > 0 && hardBlocks.length === 0 && (
          <div style={{ ...alertBoxStyle('WARN'), marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ Bloqueos overridables — requieren razón ≥50 chars</div>
            {overridableBlocks.map((b, i) => (
              <div key={i} style={{ marginBottom: 4, fontSize: 11 }}>
                <b>{b.rule}</b>: {b.reason}
              </div>
            ))}
            {!showOverride && (
              <button onClick={() => setShowOverride(true)} style={{ ...btnStyle, marginTop: 8, background: 'rgba(251,191,36,.2)', color: '#fbbf24', border: '1px solid #fbbf24' }}>
                Quiero overrideAR — escribir razón
              </button>
            )}
            {showOverride && (
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="¿Por qué saltarte esta regla? (≥50 chars — escribe la lógica real, no excusa)"
                rows={3}
                style={{ ...inputStyle, marginTop: 8, fontFamily: 'inherit' }}
              />
            )}
            {showOverride && (
              <div style={{ fontSize: 10, color: overrideReason.length >= 50 ? '#30d158' : '#ef4444', marginTop: 4 }}>
                {overrideReason.trim().length}/50 chars
              </div>
            )}
          </div>
        )}

        {/* Warnings (non-blocking) */}
        {guardrailsCheck?.warnings?.length > 0 && (
          <div style={{ ...alertBoxStyle('INFO'), marginBottom: 12, fontSize: 11 }}>
            {guardrailsCheck.warnings.map((w, i) => (
              <div key={i}>⚠ {w.message}</div>
            ))}
          </div>
        )}

        {hardBlocks.length === 0 && (
          <>
            {/* Checklist */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                Checklist ({checkedCount}/{CHECKLIST.length})
              </div>
              {CHECKLIST.map(item => (
                <label key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!checklist[item.id]}
                    onChange={e => setChecklist(c => ({ ...c, [item.id]: e.target.checked }))}
                  />
                  <span style={{ fontSize: 12 }}>{item.label}</span>
                </label>
              ))}
            </div>

            {/* Thesis */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Thesis (mínimo {MIN_THESIS} caracteres) — ¿por qué esta entrada AHORA?
              </div>
              <textarea
                value={thesis}
                onChange={e => setThesis(e.target.value)}
                placeholder="Ej: IV rank 67 en KO (estaba en 30 hace 2 sem), no earnings hasta 90d, Δ16 short put a 60, regime ranging..."
                rows={3}
                style={inputStyle}
              />
              <div style={{ fontSize: 10, color: thesis.trim().length >= MIN_THESIS ? '#30d158' : '#ef4444', marginTop: 2 }}>
                {thesis.trim().length}/{MIN_THESIS} chars
              </div>
            </div>

            {/* Conviction */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                Conviction (1-5)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setConviction(n)}
                    style={{
                      ...btnStyle,
                      flex: 1,
                      background: conviction === n ? 'var(--gold, #fbbf24)' : 'var(--bg-primary)',
                      color: conviction === n ? '#000' : 'var(--text-primary)',
                      fontWeight: conviction === n ? 700 : 400,
                    }}
                  >{n}</button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                1=tentativo · 3=normal · 5=high-conviction (raro — no abuses)
              </div>
            </div>

            {/* Emotional state */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                Estado emocional ahora
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
              {(emotional === 'tired' || emotional === 'frustrated' || emotional === 'fomo') && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>
                  ⚠ Estado de riesgo — considera posponer hasta mañana
                </div>
              )}
            </div>
          </>
        )}

        {error && (
          <div style={{ ...alertBoxStyle('CRITICAL'), marginBottom: 12 }}>{error}</div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={submitting} style={{ ...btnStyle, background: 'transparent' }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            style={{
              ...btnStyle,
              background: canSubmit ? '#30d158' : 'var(--bg-primary)',
              color: canSubmit ? '#000' : 'var(--text-tertiary)',
              fontWeight: 700,
              cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? '⏳ Abriendo journal...' : '✓ Confirmar y abrir'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,.75)', zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 14,
};

const modalStyle = {
  background: 'var(--bg-secondary, #1c1c1e)',
  border: '1px solid var(--border, #333)',
  borderRadius: 8,
  padding: 18,
  maxWidth: 520,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  fontSize: 13,
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
};

function alertBoxStyle(severity) {
  const colors = {
    CRITICAL: { bg: 'rgba(239,68,68,.1)', border: 'rgba(239,68,68,.4)', text: '#ef4444' },
    WARN:     { bg: 'rgba(251,191,36,.1)', border: 'rgba(251,191,36,.4)', text: '#fbbf24' },
    INFO:     { bg: 'rgba(96,165,250,.1)', border: 'rgba(96,165,250,.4)', text: '#60a5fa' },
  };
  const c = colors[severity] || colors.INFO;
  return {
    padding: 10, background: c.bg, border: `1px solid ${c.border}`,
    borderRadius: 6, color: c.text, fontSize: 12,
  };
}
