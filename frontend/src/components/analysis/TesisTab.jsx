import { useState, useEffect, useCallback } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { API_URL } from '../../constants';
import { Card } from '../ui';

/**
 * 📝 Tesis Tab
 *
 * Investment thesis per ticker. Lives inside the company analysis view
 * (one tab per company) instead of the Home-level Proceso tab.
 *
 * Features:
 * - Read mode: shows current thesis v.N with why_owned, sell criteria,
 *   type, conviction stars, target weight range, notes
 * - Edit mode: inline editor with char counters + type select + conviction slider
 * - Generate with AI button (when no thesis exists or user wants a new draft):
 *   calls POST /api/theses/:ticker/generate which invokes Opus with rich
 *   context (Q+S inputs, business model, transcripts, position data).
 *
 * Endpoints:
 *   GET  /api/theses/:ticker           → current thesis (null if none)
 *   POST /api/theses                   → create/update (existing endpoint)
 *   POST /api/theses/:ticker/generate  → Opus auto-generation (new endpoint)
 */
export default function TesisTab() {
  const { cfg } = useAnalysis();
  const ticker = (cfg?.ticker || '').toUpperCase();

  // TDZ-safe: all state first
  const [thesis, setThesis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  // Editor fields
  const [whyOwned, setWhyOwned] = useState('');
  const [whatWouldMakeSell, setWhatWouldMakeSell] = useState('');
  const [thesisType, setThesisType] = useState('compounder');
  const [conviction, setConviction] = useState(3);
  const [targetMin, setTargetMin] = useState(0);
  const [targetMax, setTargetMax] = useState(0);
  const [notesMd, setNotesMd] = useState('');

  const fetchThesis = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/theses/${encodeURIComponent(ticker)}`);
      const d = await r.json();
      setThesis(d.thesis || null);
    } catch (e) {
      setError(`Error cargando tesis: ${e.message}`);
    }
    setLoading(false);
  }, [ticker]);

  useEffect(() => { fetchThesis(); }, [fetchThesis]);

  const generateWithAI = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/theses/${encodeURIComponent(ticker)}/generate`, {
        method: 'POST',
      });
      const d = await r.json();
      if (d.error) {
        setError(d.error);
      } else {
        // Endpoint inserts into theses table → refetch to get the new version
        await fetchThesis();
      }
    } catch (e) {
      setError(`Error generando con IA: ${e.message}`);
    }
    setGenerating(false);
  };

  const startEdit = () => {
    setWhyOwned(thesis?.why_owned || '');
    setWhatWouldMakeSell(thesis?.what_would_make_sell || '');
    setThesisType(thesis?.thesis_type || 'compounder');
    setConviction(thesis?.conviction || 3);
    setTargetMin(thesis?.target_weight_min || 0);
    setTargetMax(thesis?.target_weight_max || 0);
    setNotesMd(thesis?.notes_md || '');
    setEditMode(true);
  };

  const startFromBlank = () => {
    setWhyOwned('');
    setWhatWouldMakeSell('');
    setThesisType('compounder');
    setConviction(3);
    setTargetMin(0);
    setTargetMax(0);
    setNotesMd('');
    setEditMode(true);
  };

  const saveThesis = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/theses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          why_owned: whyOwned,
          what_would_make_sell: whatWouldMakeSell,
          thesis_type: thesisType,
          conviction,
          target_weight_min: parseFloat(targetMin) || 0,
          target_weight_max: parseFloat(targetMax) || 0,
          notes_md: notesMd,
        }),
      });
      const d = await r.json();
      if (d.error) {
        setError(d.error);
      } else {
        setEditMode(false);
        await fetchThesis();
      }
    } catch (e) {
      setError(`Error guardando: ${e.message}`);
    }
    setSaving(false);
  };

  if (!ticker) {
    return (
      <div style={{textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)'}}>
        Selecciona una posición del Portfolio para ver su tesis.
      </div>
    );
  }

  const _convictionStars = '⭐'.repeat(Math.max(0, Math.min(5, conviction || 0)));
  const typeColors = {
    compounder: 'var(--green)',
    value: '#64d2ff',
    turnaround: 'var(--gold)',
    income: '#bf5af2',
    cyclical: '#ff9f0a',
    speculation: 'var(--red)',
  };
  const typeColor = typeColors[thesis?.thesis_type || thesisType] || 'var(--text-secondary)';

  // ─── EDIT MODE ───────────────────────────────────────────
  if (editMode) {
    return (
      <div>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18}}>
          <h2 style={{margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)'}}>
            📝 {thesis ? 'Editar' : 'Nueva'} tesis — {cfg?.name || ticker}
          </h2>
          <div style={{display: 'flex', gap: 8}}>
            <button onClick={() => setEditMode(false)} disabled={saving}
              style={{padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--fm)'}}>
              Cancelar
            </button>
            <button onClick={saveThesis} disabled={saving || !whyOwned || !whatWouldMakeSell}
              style={{padding: '8px 16px', borderRadius: 8, border: '1px solid var(--gold)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 11, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'var(--fm)'}}>
              {saving ? 'Guardando...' : '💾 Guardar'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{padding: 12, background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, color: 'var(--red)', fontSize: 12, marginBottom: 16, fontFamily: 'var(--fm)'}}>
            ⚠️ {error}
          </div>
        )}

        {/* Why owned */}
        <Card style={{padding: 16, marginBottom: 12}}>
          <label style={{display: 'block', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--fm)'}}>
            ¿Por qué tengo esta posición? <span style={{color: 'var(--red)'}}>*</span>
          </label>
          <textarea value={whyOwned} onChange={e => setWhyOwned(e.target.value)} maxLength={2000} rows={8}
            placeholder="Razones estructurales: calidad del negocio, moat, encaje en el portfolio de dividendos long-term..."
            style={{width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)', lineHeight: 1.7, resize: 'vertical'}} />
          <div style={{fontSize: 9, color: 'var(--text-tertiary)', textAlign: 'right', marginTop: 4}}>
            {whyOwned.length} / 2000
          </div>
        </Card>

        {/* What would make sell */}
        <Card style={{padding: 16, marginBottom: 12}}>
          <label style={{display: 'block', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--fm)'}}>
            ¿Qué me haría vender? <span style={{color: 'var(--red)'}}>*</span>
          </label>
          <div style={{fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6, fontStyle: 'italic'}}>
            Criterios <strong>cuantificables</strong>. Ejemplos: "FCF payout &gt; 100% por 2 trimestres seguidos", "streak de dividendos roto", "anuncio de dividend cut"
          </div>
          <textarea value={whatWouldMakeSell} onChange={e => setWhatWouldMakeSell(e.target.value)} maxLength={2000} rows={6}
            placeholder="- Criterio 1 cuantificable\n- Criterio 2\n- Kill switch específico..."
            style={{width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)', lineHeight: 1.7, resize: 'vertical'}} />
          <div style={{fontSize: 9, color: 'var(--text-tertiary)', textAlign: 'right', marginTop: 4}}>
            {whatWouldMakeSell.length} / 2000
          </div>
        </Card>

        {/* Type + conviction + weights (grid) */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12}}>
          <Card style={{padding: 16}}>
            <label style={{display: 'block', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--fm)'}}>
              Tipo de tesis
            </label>
            <select value={thesisType} onChange={e => setThesisType(e.target.value)}
              style={{width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)'}}>
              <option value="compounder">🌱 Compounder</option>
              <option value="value">💎 Value</option>
              <option value="turnaround">🔄 Turnaround</option>
              <option value="income">💰 Income</option>
              <option value="cyclical">📈 Cyclical</option>
              <option value="speculation">🎲 Speculation</option>
            </select>
          </Card>

          <Card style={{padding: 16}}>
            <label style={{display: 'block', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--fm)'}}>
              Convicción: {'⭐'.repeat(conviction)} ({conviction}/5)
            </label>
            <input type="range" min="1" max="5" step="1" value={conviction} onChange={e => setConviction(parseInt(e.target.value, 10))}
              style={{width: '100%', accentColor: 'var(--gold)'}} />
          </Card>
        </div>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12}}>
          <Card style={{padding: 16}}>
            <label style={{display: 'block', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--fm)'}}>
              Peso objetivo mínimo (%)
            </label>
            <input type="number" step="0.5" min="0" max="50" value={targetMin} onChange={e => setTargetMin(e.target.value)}
              style={{width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--fm)'}} />
          </Card>
          <Card style={{padding: 16}}>
            <label style={{display: 'block', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: 'var(--fm)'}}>
              Peso objetivo máximo (%)
            </label>
            <input type="number" step="0.5" min="0" max="50" value={targetMax} onChange={e => setTargetMax(e.target.value)}
              style={{width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--fm)'}} />
          </Card>
        </div>

        {/* Notes (optional) */}
        <Card style={{padding: 16}}>
          <label style={{display: 'block', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: 'var(--fm)'}}>
            Notas (opcional)
          </label>
          <textarea value={notesMd} onChange={e => setNotesMd(e.target.value)} rows={3}
            placeholder="Catalysts próximos, kill switches, alertas pendientes..."
            style={{width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)', lineHeight: 1.7, resize: 'vertical'}} />
        </Card>
      </div>
    );
  }

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // ─── READ MODE ───────────────────────────────────────────
  return (
    <div>
      {isOffline && (
        <div style={{padding: '8px 12px', background: 'rgba(255,214,10,.06)', border: '1px solid rgba(255,214,10,.25)', borderRadius: 8, color: '#ffd60a', fontSize: 11, marginBottom: 12, fontFamily: 'var(--fm)'}}>
          Sin conexion — mostrando datos cacheados. La generacion con IA requiere red.
        </div>
      )}
      {/* Header */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 16, flexWrap: 'wrap'}}>
        <div>
          <h2 style={{margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)'}}>
            📝 Tesis de inversión — {cfg?.name || ticker}
          </h2>
          <p style={{margin: 0, fontSize: 11, color: 'var(--text-tertiary)'}}>
            Por qué la tengo, qué me haría venderla, y con qué convicción.
            {thesis && <span> Última edición: {new Date(thesis.updated_at).toLocaleDateString('es-ES', {day: '2-digit', month: 'short', year: 'numeric'})} · v{thesis.version}</span>}
          </p>
        </div>
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
          {thesis && (
            <button onClick={startEdit}
              style={{padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--fm)'}}>
              📝 Editar
            </button>
          )}
          <button onClick={generateWithAI} disabled={generating}
            title="Genera un draft con Claude Opus usando Q+S scores, business model y transcripts"
            style={{padding: '8px 14px', borderRadius: 8, border: '1px solid var(--gold)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 11, fontWeight: 700, cursor: generating ? 'wait' : 'pointer', fontFamily: 'var(--fm)'}}>
            {generating ? '🧠 Generando...' : thesis ? '🔄 Regenerar con IA' : '✨ Generar con IA'}
          </button>
          {!thesis && (
            <button onClick={startFromBlank}
              style={{padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--fm)'}}>
              ✍️ Escribir desde cero
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{padding: 12, background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, color: 'var(--red)', fontSize: 12, marginBottom: 16, fontFamily: 'var(--fm)'}}>
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div style={{textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontSize: 12}}>
          Cargando tesis...
        </div>
      )}

      {/* Empty state */}
      {!loading && !thesis && !error && (
        <Card style={{padding: 40, textAlign: 'center'}}>
          <div style={{fontSize: 48, marginBottom: 14}}>📝</div>
          <div style={{fontSize: 16, color: 'var(--text-secondary)', marginBottom: 8, fontFamily: 'var(--fd)', fontWeight: 700}}>
            Sin tesis escrita todavía
          </div>
          <div style={{fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 20px'}}>
            Una tesis te ayuda a recordar <strong>por qué</strong> compraste esta empresa y <strong>qué te haría venderla</strong>.
            Cuando un agent te grite "SELL", podrás abrir esta tesis y decidir con cabeza fría si el criterio se ha cumplido o es pánico.
          </div>
          <div style={{fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6, maxWidth: 500, margin: '0 auto'}}>
            Pulsa <strong style={{color: 'var(--gold)'}}>✨ Generar con IA</strong> y Claude analizará Q+S scores, business model y transcripts para redactarte un <strong>draft</strong> que puedas editar.
            Coste: ~$0.05.
          </div>
        </Card>
      )}

      {/* Read mode — thesis content */}
      {thesis && !loading && (
        <>
          {/* Summary stripe */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16}}>
            <Card style={{padding: 14, textAlign: 'center'}}>
              <div style={{fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4}}>Tipo</div>
              <div style={{fontSize: 14, fontWeight: 700, color: typeColor, fontFamily: 'var(--fd)'}}>{thesis.thesis_type || '—'}</div>
            </Card>
            <Card style={{padding: 14, textAlign: 'center'}}>
              <div style={{fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4}}>Convicción</div>
              <div style={{fontSize: 14, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)'}}>{'⭐'.repeat(thesis.conviction || 0)} <span style={{color: 'var(--text-tertiary)', fontSize: 11}}>({thesis.conviction}/5)</span></div>
            </Card>
            <Card style={{padding: 14, textAlign: 'center'}}>
              <div style={{fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4}}>Peso objetivo</div>
              <div style={{fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)'}}>
                {(thesis.target_weight_min || 0).toFixed(1)}% – {(thesis.target_weight_max || 0).toFixed(1)}%
              </div>
            </Card>
            <Card style={{padding: 14, textAlign: 'center'}}>
              <div style={{fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4}}>Versión</div>
              <div style={{fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)'}}>v{thesis.version}</div>
            </Card>
          </div>

          {/* Why owned */}
          <Card title="¿Por qué la tengo?" icon="🎯" style={{marginBottom: 12}}>
            <div style={{fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'var(--fm)'}}>
              {thesis.why_owned}
            </div>
          </Card>

          {/* What would make sell */}
          <Card title="¿Qué me haría vender?" icon="🚨" style={{marginBottom: 12}}>
            <div style={{fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'var(--fm)'}}>
              {thesis.what_would_make_sell}
            </div>
          </Card>

          {/* Notes */}
          {thesis.notes_md && (
            <Card title="Notas" icon="📌">
              <div style={{fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'var(--fm)'}}>
                {thesis.notes_md}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
