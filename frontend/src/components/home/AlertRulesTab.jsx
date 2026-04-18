import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';

// ── Alert Rules Engine ─────────────────────────────────────────
// Lets the user set per-ticker triggers: price below/above, yield
// thresholds, safety score floor.  Evaluated daily by cron and on
// demand via POST /api/alert-rules/check.

const RULE_TYPES = [
  { id: 'price_below',   label: 'Precio baja de',   unit: '$',  example: 'KO < 56' },
  { id: 'price_above',   label: 'Precio sube de',   unit: '$',  example: 'MSFT > 450' },
  { id: 'yield_above',   label: 'Yield sube de',    unit: '%',  example: 'MO yield > 9%' },
  { id: 'yield_below',   label: 'Yield baja de',    unit: '%',  example: 'JNJ yield < 3%' },
  { id: 'safety_below',  label: 'Safety score baja de', unit: 'pts', example: 'KHC safety < 40' },
  { id: 'dividend_cut',  label: 'Recorte dividendo (manual)', unit: '', example: 'PARA cut' },
  { id: 'earnings_miss', label: 'EPS miss (manual)', unit: '', example: 'MMM miss' },
  { id: 'custom',        label: 'Personalizado',    unit: '', example: 'texto libre' },
];

const STATUS_COLOR = {
  active:    { bg: 'rgba(48,209,88,.12)',   color: '#30d158', label: 'Activa' },
  paused:    { bg: 'rgba(142,142,147,.12)', color: '#8e8e93', label: 'Pausada' },
  triggered: { bg: 'rgba(255,69,58,.12)',   color: '#ff453a', label: 'Disparada' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLOR[status] || STATUS_COLOR.active;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      background: s.bg, color: s.color, fontSize: 10, fontWeight: 700,
      fontFamily: 'var(--fm)',
    }}>
      {s.label}
    </span>
  );
}

function RuleTypeBadge({ ruleType }) {
  const meta = RULE_TYPES.find(r => r.id === ruleType) || { label: ruleType, unit: '' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 5,
      background: 'rgba(200,164,78,.1)', color: '#c8a44e',
      fontSize: 9, fontWeight: 700, fontFamily: 'var(--fm)',
    }}>
      {meta.label}
    </span>
  );
}

// ── Empty state ─────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      textAlign: 'center', padding: '48px 24px',
      color: 'var(--text-tertiary)', fontFamily: 'var(--fb)',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
        Sin reglas configuradas
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        Añade una regla arriba para recibir alertas cuando un ticker<br />
        alcance tu precio objetivo, yield o safety score.
      </div>
    </div>
  );
}

// ── Add Rule Form ────────────────────────────────────────────────
function AddRuleForm({ onAdded, token }) {
  const [ticker, setTicker] = useState(() => {
    try {
      const pre = sessionStorage.getItem('prefill_alert_ticker');
      if (pre) { sessionStorage.removeItem('prefill_alert_ticker'); return pre; }
    } catch {}
    return '';
  });
  const [ruleType, setRuleType] = useState('price_below');
  const [threshold, setThreshold] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedMeta = RULE_TYPES.find(r => r.id === ruleType) || RULE_TYPES[0];
  const needsThreshold = !['dividend_cut', 'earnings_miss', 'custom'].includes(ruleType);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!ticker.trim()) { setError('Ticker requerido'); return; }
    if (needsThreshold && (threshold === '' || isNaN(Number(threshold)))) {
      setError('Threshold debe ser un número'); return;
    }
    setSaving(true);
    try {
      const body = {
        ticker: ticker.trim().toUpperCase(),
        rule_type: ruleType,
        threshold: needsThreshold ? Number(threshold) : null,
        unit: selectedMeta.unit || null,
        message: message.trim() || null,
      };
      const res = await fetch(`${API_URL}/api/alert-rules/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al guardar'); return; }
      setTicker(''); setThreshold(''); setMessage('');
      onAdded(data.rule);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--card)', borderRadius: 12, padding: '16px 20px',
      border: '1px solid var(--border)', marginBottom: 20,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: 'var(--gold)',
        fontFamily: 'var(--fm)', marginBottom: 14, letterSpacing: '0.5px',
        textTransform: 'uppercase',
      }}>
        Nueva Regla
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Ticker */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600 }}>TICKER</span>
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            placeholder="KO"
            maxLength={12}
            required
            style={{
              width: 90, padding: '7px 10px', borderRadius: 8,
              background: 'var(--bg)', border: '1px solid var(--border)',
              color: 'var(--text)', fontSize: 13, fontFamily: 'var(--fm)',
              fontWeight: 700, outline: 'none', letterSpacing: '0.5px',
            }}
          />
        </label>

        {/* Rule type */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600 }}>CONDICION</span>
          <select
            value={ruleType}
            onChange={e => setRuleType(e.target.value)}
            style={{
              padding: '7px 10px', borderRadius: 8, fontSize: 12,
              background: 'var(--bg)', border: '1px solid var(--border)',
              color: 'var(--text)', fontFamily: 'var(--fb)', cursor: 'pointer',
              outline: 'none',
            }}
          >
            {RULE_TYPES.map(r => (
              <option key={r.id} value={r.id}>{r.label}{r.unit ? ` (${r.unit})` : ''}</option>
            ))}
          </select>
        </label>

        {/* Threshold — only for price / yield / safety */}
        {needsThreshold && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600 }}>
              UMBRAL {selectedMeta.unit ? `(${selectedMeta.unit})` : ''}
            </span>
            <input
              type="number"
              step="any"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              placeholder={selectedMeta.example.split(' ').pop()}
              required
              style={{
                width: 100, padding: '7px 10px', borderRadius: 8,
                background: 'var(--bg)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 13, fontFamily: 'var(--fm)',
                fontWeight: 700, outline: 'none',
              }}
            />
          </label>
        )}

        {/* Custom message */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600 }}>
            MENSAJE (opcional)
          </span>
          <input
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={`Ej: ${selectedMeta.example}`}
            maxLength={200}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 8,
              background: 'var(--bg)', border: '1px solid var(--border)',
              color: 'var(--text)', fontSize: 12, fontFamily: 'var(--fb)',
              outline: 'none',
            }}
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '8px 18px', borderRadius: 8,
            background: saving ? 'var(--border)' : 'var(--gold)',
            color: saving ? 'var(--text-tertiary)' : '#000',
            border: 'none', fontSize: 12, fontWeight: 700,
            fontFamily: 'var(--fm)', cursor: saving ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap', transition: 'all .15s',
          }}
        >
          {saving ? 'Guardando...' : '+ Añadir'}
        </button>
      </div>

      {error && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(255,69,58,.1)', color: '#ff453a',
          fontSize: 12, fontFamily: 'var(--fb)',
        }}>
          {error}
        </div>
      )}
    </form>
  );
}

// ── Rule Row ─────────────────────────────────────────────────────
function RuleRow({ rule, onToggle, onDelete, token }) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const meta = RULE_TYPES.find(r => r.id === rule.rule_type) || { label: rule.rule_type, unit: '' };

  const handleDelete = async () => {
    if (!window.confirm(`Eliminar regla para ${rule.ticker}?`)) return;
    setDeleting(true);
    try {
      await fetch(`${API_URL}/api/alert-rules/${rule.id}`, {
        method: 'DELETE',
      });
      onDelete(rule.id);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    const newStatus = rule.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`${API_URL}/api/alert-rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.rule) onToggle(data.rule);
    } finally {
      setToggling(false);
    }
  };

  const conditionLabel = () => {
    if (!['price_below','price_above','yield_above','yield_below','safety_below'].includes(rule.rule_type)) {
      return rule.message || '—';
    }
    const sym = rule.rule_type.includes('above') ? '>' : '<';
    return `${sym} ${rule.threshold}${meta.unit || ''}`;
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderRadius: 10,
      background: 'var(--card)', border: '1px solid var(--border)',
      marginBottom: 8, transition: 'all .15s',
      opacity: rule.status === 'paused' ? 0.6 : 1,
    }}>
      {/* Ticker */}
      <div style={{
        minWidth: 64, fontWeight: 800, fontSize: 14,
        fontFamily: 'var(--fm)', color: 'var(--text)',
        letterSpacing: '0.5px',
      }}>
        {rule.ticker}
      </div>

      {/* Rule type */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <RuleTypeBadge ruleType={rule.rule_type} />
        <span style={{
          marginLeft: 8, fontSize: 13, fontWeight: 600,
          color: 'var(--text-secondary)', fontFamily: 'var(--fb)',
        }}>
          {conditionLabel()}
        </span>
        {rule.message && rule.rule_type !== 'custom' && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: 'var(--fb)' }}>
            {rule.message}
          </div>
        )}
      </div>

      {/* Status + stats */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <StatusBadge status={rule.status} />
        {rule.triggered_count > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: 'var(--fm)' }}>
            {rule.triggered_count}x disparada
          </div>
        )}
        {rule.triggered_at && (
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--fm)' }}>
            Ultima: {rule.triggered_at.slice(0, 10)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={handleToggle}
          disabled={toggling}
          title={rule.status === 'active' ? 'Pausar' : 'Activar'}
          style={{
            padding: '5px 10px', borderRadius: 7,
            background: 'var(--bg)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', fontSize: 11,
            cursor: 'pointer', fontFamily: 'var(--fm)', fontWeight: 600,
          }}
        >
          {toggling ? '...' : rule.status === 'active' ? '⏸' : '▶'}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Eliminar"
          style={{
            padding: '5px 10px', borderRadius: 7,
            background: 'rgba(255,69,58,.08)', border: '1px solid rgba(255,69,58,.25)',
            color: '#ff453a', fontSize: 11,
            cursor: 'pointer', fontFamily: 'var(--fm)', fontWeight: 600,
          }}
        >
          {deleting ? '...' : '×'}
        </button>
      </div>
    </div>
  );
}

// ── History Row ──────────────────────────────────────────────────
function HistoryRow({ alert }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: 'rgba(255,159,10,.06)', border: '1px solid rgba(255,159,10,.15)',
      marginBottom: 6,
    }}>
      <div style={{
        minWidth: 64, fontWeight: 700, fontSize: 12,
        fontFamily: 'var(--fm)', color: '#ff9f0a',
      }}>
        {alert.ticker}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--fb)' }}>
          {alert.titulo}
        </div>
        {alert.detalle && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--fb)' }}>
            {alert.detalle}
          </div>
        )}
      </div>
      <div style={{
        fontSize: 10, color: 'var(--text-tertiary)',
        fontFamily: 'var(--fm)', flexShrink: 0,
      }}>
        {alert.fecha}
      </div>
    </div>
  );
}

// ── Main Tab ─────────────────────────────────────────────────────
export default function AlertRulesTab() {
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showHistory, setShowHistory] = useState(false);

  const token = typeof window !== 'undefined' ? (localStorage.getItem('ayr_token') || '') : '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/alert-rules/list`);
      const data = await res.json();
      setRules(data.rules || []);
      setHistory(data.history || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdded = (newRule) => {
    setRules(prev => [newRule, ...prev]);
  };

  const handleDelete = (id) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleToggle = (updatedRule) => {
    setRules(prev => prev.map(r => r.id === updatedRule.id ? updatedRule : r));
  };

  const handleCheck = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch(`${API_URL}/api/alert-rules/check`, {
        method: 'POST',
      });
      const data = await res.json();
      setCheckResult(data);
      if (data.triggered > 0) await load(); // refresh to show updated triggered_at
    } catch (err) {
      setCheckResult({ error: err.message });
    } finally {
      setChecking(false);
    }
  };

  const filtered = filterStatus === 'all'
    ? rules
    : rules.filter(r => r.status === filterStatus);

  const activeCount = rules.filter(r => r.status === 'active').length;
  const pausedCount = rules.filter(r => r.status === 'paused').length;
  const triggeredRecently = rules.filter(r => r.triggered_at && r.triggered_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 4px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <h2 style={{
            margin: 0, fontSize: 20, fontWeight: 800,
            color: 'var(--text)', fontFamily: 'var(--fm)',
          }}>
            Reglas de Alerta
          </h2>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', marginTop: 3 }}>
            Disparadores personalizados por ticker · Evaluadas diariamente + bajo demanda
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Stats chips */}
          {[
            { label: `${activeCount} activas`, color: '#30d158', bg: 'rgba(48,209,88,.1)' },
            { label: `${pausedCount} pausadas`, color: '#8e8e93', bg: 'rgba(142,142,147,.1)' },
            ...(triggeredRecently > 0 ? [{ label: `${triggeredRecently} hoy`, color: '#ff453a', bg: 'rgba(255,69,58,.1)' }] : []),
          ].map((c, i) => (
            <span key={i} style={{
              padding: '4px 10px', borderRadius: 8, background: c.bg,
              color: c.color, fontSize: 11, fontWeight: 700, fontFamily: 'var(--fm)',
            }}>
              {c.label}
            </span>
          ))}

          {/* Evaluate now */}
          <button
            onClick={handleCheck}
            disabled={checking}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: checking ? 'var(--border)' : 'rgba(200,164,78,.15)',
              border: '1px solid rgba(200,164,78,.35)',
              color: checking ? 'var(--text-tertiary)' : '#c8a44e',
              fontSize: 12, fontWeight: 700, fontFamily: 'var(--fm)',
              cursor: checking ? 'not-allowed' : 'pointer', transition: 'all .15s',
            }}
          >
            {checking ? 'Evaluando...' : 'Evaluar ahora'}
          </button>
        </div>
      </div>

      {/* Check result banner */}
      {checkResult && (
        <div style={{
          padding: '10px 16px', borderRadius: 10, marginBottom: 16,
          background: checkResult.error ? 'rgba(255,69,58,.1)' : 'rgba(48,209,88,.1)',
          border: `1px solid ${checkResult.error ? 'rgba(255,69,58,.25)' : 'rgba(48,209,88,.25)'}`,
          color: checkResult.error ? '#ff453a' : '#30d158',
          fontSize: 12, fontFamily: 'var(--fb)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>
            {checkResult.error
              ? `Error: ${checkResult.error}`
              : `Evaluadas ${checkResult.checked} reglas — ${checkResult.triggered} disparadas · ${checkResult.skipped} omitidas`}
          </span>
          <button
            onClick={() => setCheckResult(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Add rule form */}
      <AddRuleForm onAdded={handleAdded} token={token} />

      {/* Filter bar */}
      {rules.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {['all', 'active', 'paused'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '5px 12px', borderRadius: 7,
                border: `1px solid ${filterStatus === s ? 'var(--gold)' : 'var(--border)'}`,
                background: filterStatus === s ? 'var(--gold-dim)' : 'transparent',
                color: filterStatus === s ? 'var(--gold)' : 'var(--text-tertiary)',
                fontSize: 11, fontWeight: 600, fontFamily: 'var(--fm)',
                cursor: 'pointer', transition: 'all .12s',
              }}
            >
              {s === 'all' ? 'Todas' : s === 'active' ? 'Activas' : 'Pausadas'}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)' }}>
          Cargando reglas...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(255,69,58,.1)', color: '#ff453a',
          fontSize: 13, fontFamily: 'var(--fb)', marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {/* Rules list */}
      {!loading && !error && filtered.length === 0 && <EmptyState />}
      {!loading && filtered.map(rule => (
        <RuleRow
          key={rule.id}
          rule={rule}
          onToggle={handleToggle}
          onDelete={handleDelete}
          token={token}
        />
      ))}

      {/* History section */}
      {history.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700,
              fontFamily: 'var(--fm)', padding: '0 0 12px',
            }}
          >
            <span style={{ transform: showHistory ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform .2s' }}>›</span>
            Historial de disparos ({history.length})
          </button>
          {showHistory && history.map((h, i) => <HistoryRow key={i} alert={h} />)}
        </div>
      )}
    </div>
  );
}
