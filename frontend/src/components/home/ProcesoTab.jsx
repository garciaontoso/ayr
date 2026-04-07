import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants';

const THESIS_TYPES = [
  { value: 'compounder', label: 'Compounder' },
  { value: 'value', label: 'Value' },
  { value: 'turnaround', label: 'Turnaround' },
  { value: 'income', label: 'Income' },
  { value: 'cyclical', label: 'Cyclical' },
  { value: 'speculation', label: 'Speculation' },
];

const TYPE_COLORS = {
  compounder: '#2f855a',
  value: '#2b6cb0',
  turnaround: '#b7791f',
  income: '#6b46c1',
  cyclical: '#c05621',
  speculation: '#9b2c2c',
};

const MAX_CHARS = 2000;

const EMPTY_FORM = {
  ticker: '',
  why_owned: '',
  what_would_make_sell: '',
  thesis_type: 'compounder',
  conviction: 3,
  target_weight_min: '',
  target_weight_max: '',
  notes_md: '',
};

function Stars({ value, onChange, readOnly = false }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {stars.map((s) => (
        <span
          key={s}
          onClick={readOnly ? undefined : () => onChange(s)}
          style={{
            cursor: readOnly ? 'default' : 'pointer',
            color: s <= value ? 'var(--gold)' : 'var(--text-tertiary)',
            fontSize: 18,
            userSelect: 'none',
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

export default function ProcesoTab() {
  // ----- State (declare ALL useState before any useEffect to avoid TDZ) -----
  const [theses, setTheses] = useState([]);
  const [missing, setMissing] = useState([]);
  const [missingCount, setMissingCount] = useState(0);
  const [totalEligible, setTotalEligible] = useState(0);
  const [coveragePct, setCoveragePct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false); // true if we're editing an existing thesis
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // ----- Data fetching -----
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, mRes] = await Promise.all([
        fetch(`${API_URL}/api/theses`).then((r) => r.json()),
        fetch(`${API_URL}/api/theses/missing`).then((r) => r.json()),
      ]);
      const allTheses = (tRes && tRes.theses) || [];
      // Show only current versions
      const current = allTheses.filter((t) => t.is_current === 1 || t.is_current === true || t.is_current == null);
      setTheses(current);
      setMissing((mRes && mRes.missing) || []);
      setMissingCount((mRes && mRes.missing_count) || 0);
      setTotalEligible((mRes && mRes.total_eligible) || 0);
      setCoveragePct((mRes && mRes.coverage_pct) || 0);
    } catch (e) {
      setError(e.message || 'Error cargando tesis');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ----- Handlers -----
  const openNew = (ticker = '') => {
    setEditing(false);
    setForm({ ...EMPTY_FORM, ticker });
    setSaveError(null);
    setModalOpen(true);
  };

  const openEdit = async (ticker) => {
    setEditing(true);
    setSaveError(null);
    setModalOpen(true);
    try {
      const res = await fetch(`${API_URL}/api/theses/${encodeURIComponent(ticker)}`).then((r) => r.json());
      const t = res && res.thesis;
      if (t) {
        setForm({
          ticker: t.ticker || ticker,
          why_owned: t.why_owned || '',
          what_would_make_sell: t.what_would_make_sell || '',
          thesis_type: t.thesis_type || 'compounder',
          conviction: t.conviction || 3,
          target_weight_min: t.target_weight_min ?? '',
          target_weight_max: t.target_weight_max ?? '',
          notes_md: t.notes_md || '',
        });
      } else {
        setForm({ ...EMPTY_FORM, ticker });
      }
    } catch (e) {
      setSaveError('Error cargando tesis: ' + (e.message || ''));
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(EMPTY_FORM);
    setSaveError(null);
  };

  const updateForm = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.ticker || !form.ticker.trim()) {
      setSaveError('El ticker es obligatorio');
      return;
    }
    if (!form.why_owned.trim()) {
      setSaveError('"¿Por qué la tengo?" es obligatorio');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        ticker: form.ticker.trim().toUpperCase(),
        why_owned: form.why_owned,
        what_would_make_sell: form.what_would_make_sell,
        thesis_type: form.thesis_type,
        conviction: Number(form.conviction) || 3,
        target_weight_min: form.target_weight_min === '' ? null : Number(form.target_weight_min),
        target_weight_max: form.target_weight_max === '' ? null : Number(form.target_weight_max),
        notes_md: form.notes_md,
      };
      const res = await fetch(`${API_URL}/api/theses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      await fetchAll();
      closeModal();
    } catch (e) {
      setSaveError('Error guardando: ' + (e.message || ''));
    } finally {
      setSaving(false);
    }
  };

  // ----- Styles -----
  const card = {
    background: 'var(--subtle-bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  };

  const sectionTitle = {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: '0 0 12px 0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };

  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: '90px 1fr 110px 130px 110px',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
    color: 'var(--text-primary)',
  };

  const tickerStyle = {
    fontFamily: 'var(--fm)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  };

  const btnPrimary = {
    background: 'var(--gold)',
    color: '#000',
    border: 'none',
    borderRadius: 6,
    padding: '8px 14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  };

  const btnSecondary = {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '6px 12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: 12,
  };

  const inputStyle = {
    width: '100%',
    background: 'var(--subtle-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  };

  const chipStyle = (type) => ({
    display: 'inline-block',
    background: TYPE_COLORS[type] || 'var(--text-tertiary)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  });

  // ----- Derived -----
  const sortedMissing = [...missing].sort((a, b) => (b.weight_pct || 0) - (a.weight_pct || 0));
  const sortedTheses = [...theses].sort((a, b) => {
    const da = new Date(a.updated_at || a.created_at || 0).getTime();
    const db = new Date(b.updated_at || b.created_at || 0).getTime();
    return db - da;
  });

  // ----- Render -----
  return (
    <div style={{ padding: 16, color: 'var(--text-primary)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
          gap: 16,
        }}
      >
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 22, color: 'var(--text-primary)' }}>Proceso de Inversión</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Gestión de tesis: por qué tengo cada posición y qué me haría vender.
          </p>
        </div>
        <button style={btnPrimary} onClick={() => openNew('')}>
          + Nueva tesis
        </button>
      </div>

      {/* Coverage stats */}
      <div style={card}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)' }}>
              {totalEligible - missingCount} / {totalEligible}
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', marginLeft: 8 }}>posiciones con tesis</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Cobertura: {Number(coveragePct || 0).toFixed(1)}% — {missingCount} pendientes
            </div>
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: coveragePct >= 80 ? 'var(--green)' : coveragePct >= 50 ? 'var(--gold)' : 'var(--red)',
              fontFamily: 'var(--fm)',
            }}
          >
            {Number(coveragePct || 0).toFixed(0)}%
          </div>
        </div>
        {/* Progress bar */}
        <div
          style={{
            width: '100%',
            height: 10,
            background: 'var(--border)',
            borderRadius: 5,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, Number(coveragePct || 0)))}%`,
              height: '100%',
              background: coveragePct >= 80 ? 'var(--green)' : coveragePct >= 50 ? 'var(--gold)' : 'var(--red)',
              transition: 'width 300ms ease',
            }}
          />
        </div>
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando tesis…</div>
      )}
      {error && (
        <div style={{ padding: 16, color: 'var(--red)', background: 'var(--subtle-bg)', borderRadius: 6 }}>
          {error}
        </div>
      )}

      {/* Missing theses */}
      {!loading && (
        <div style={card}>
          <h3 style={{ ...sectionTitle, color: 'var(--red)' }}>
            🔴 Posiciones sin tesis ({sortedMissing.length})
          </h3>
          {sortedMissing.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
              Todas las posiciones relevantes tienen tesis. 🎉
            </div>
          ) : (
            <div>
              <div
                style={{
                  ...rowStyle,
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  borderBottom: '2px solid var(--border)',
                }}
              >
                <div>Ticker</div>
                <div>Nombre</div>
                <div style={{ textAlign: 'right' }}>Peso</div>
                <div></div>
                <div></div>
              </div>
              {sortedMissing.map((p) => (
                <div key={p.ticker} style={rowStyle}>
                  <div style={tickerStyle}>{p.ticker}</div>
                  <div style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name || '—'}
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--fm)',
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                    }}
                  >
                    {Number(p.weight_pct || 0).toFixed(2)}%
                  </div>
                  <div></div>
                  <div style={{ textAlign: 'right' }}>
                    <button style={btnSecondary} onClick={() => openNew(p.ticker)}>
                      Escribir tesis
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Existing theses */}
      {!loading && (
        <div style={card}>
          <h3 style={{ ...sectionTitle, color: 'var(--green)' }}>✅ Tesis escritas ({sortedTheses.length})</h3>
          {sortedTheses.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
              Aún no has escrito ninguna tesis.
            </div>
          ) : (
            <div>
              <div
                style={{
                  ...rowStyle,
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  borderBottom: '2px solid var(--border)',
                }}
              >
                <div>Ticker</div>
                <div>Tipo</div>
                <div style={{ textAlign: 'left' }}>Convicción</div>
                <div>Última edición</div>
                <div></div>
              </div>
              {sortedTheses.map((t) => {
                const dt = t.updated_at || t.created_at;
                let dtStr = '—';
                if (dt) {
                  try {
                    dtStr = new Date(dt).toLocaleDateString('es-ES', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    });
                  } catch {}
                }
                return (
                  <div key={t.id || t.ticker} style={rowStyle}>
                    <div style={tickerStyle}>
                      {t.ticker}
                      {t.version > 1 && (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                          v{t.version}
                        </span>
                      )}
                    </div>
                    <div>
                      <span style={chipStyle(t.thesis_type)}>{t.thesis_type || '—'}</span>
                    </div>
                    <div>
                      <Stars value={t.conviction || 0} readOnly onChange={() => {}} />
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--fm)' }}>{dtStr}</div>
                    <div style={{ textAlign: 'right' }}>
                      <button style={btnSecondary} onClick={() => openEdit(t.ticker)}>
                        Ver / Editar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
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
              borderRadius: 10,
              padding: 24,
              maxWidth: 720,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>
                {editing ? 'Editar tesis' : 'Nueva tesis'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: 22,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Ticker */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Ticker</label>
              <input
                type="text"
                value={form.ticker}
                onChange={(e) => updateForm('ticker', e.target.value.toUpperCase())}
                readOnly={editing}
                style={{
                  ...inputStyle,
                  fontFamily: 'var(--fm)',
                  fontWeight: 700,
                  opacity: editing ? 0.7 : 1,
                  cursor: editing ? 'not-allowed' : 'text',
                }}
                placeholder="AAPL"
              />
            </div>

            {/* Why owned */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                ¿Por qué la tengo?
                <span style={{ float: 'right', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                  {form.why_owned.length} / {MAX_CHARS}
                </span>
              </label>
              <textarea
                value={form.why_owned}
                onChange={(e) => updateForm('why_owned', e.target.value.slice(0, MAX_CHARS))}
                style={{ ...inputStyle, minHeight: 110, fontFamily: 'inherit', resize: 'vertical' }}
                placeholder="Tesis principal, ventajas competitivas, motor de crecimiento…"
              />
            </div>

            {/* What would make sell */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                ¿Qué me haría vender?
                <span style={{ float: 'right', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                  {form.what_would_make_sell.length} / {MAX_CHARS}
                </span>
              </label>
              <textarea
                value={form.what_would_make_sell}
                onChange={(e) => updateForm('what_would_make_sell', e.target.value.slice(0, MAX_CHARS))}
                style={{ ...inputStyle, minHeight: 90, fontFamily: 'inherit', resize: 'vertical' }}
                placeholder="Triggers de salida: rotura del moat, recorte de dividendo, deterioro de FCF…"
              />
            </div>

            {/* Type + conviction */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Tipo de tesis</label>
                <select
                  value={form.thesis_type}
                  onChange={(e) => updateForm('thesis_type', e.target.value)}
                  style={inputStyle}
                >
                  {THESIS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Convicción</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 36 }}>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={form.conviction}
                    onChange={(e) => updateForm('conviction', Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <Stars value={form.conviction} readOnly onChange={() => {}} />
                </div>
              </div>
            </div>

            {/* Target weight min/max */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Peso objetivo MIN (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.target_weight_min}
                  onChange={(e) => updateForm('target_weight_min', e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'var(--fm)' }}
                  placeholder="2.0"
                />
              </div>
              <div>
                <label style={labelStyle}>Peso objetivo MAX (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.target_weight_max}
                  onChange={(e) => updateForm('target_weight_max', e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'var(--fm)' }}
                  placeholder="5.0"
                />
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Notas (opcional, markdown)</label>
              <textarea
                value={form.notes_md}
                onChange={(e) => updateForm('notes_md', e.target.value)}
                style={{ ...inputStyle, minHeight: 80, fontFamily: 'var(--fm)', resize: 'vertical', fontSize: 12 }}
                placeholder="Catalizadores, links, recordatorios…"
              />
            </div>

            {saveError && (
              <div
                style={{
                  padding: 10,
                  marginBottom: 14,
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid var(--red)',
                  borderRadius: 6,
                  color: 'var(--red)',
                  fontSize: 12,
                }}
              >
                {saveError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button style={btnSecondary} onClick={closeModal} disabled={saving}>
                Cancelar
              </button>
              <button
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
