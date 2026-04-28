import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';

// ─── Transferencias tab ─────────────────────────────────────────────────────
// Historial de movimientos de cash entre tu banco y IBKR (depósitos / retiradas
// / transferencias internas entre cuentas IB). Datos viene de:
//   - 'flex' source: parser automático desde XML de IB Flex (sync diario via Mac)
//   - 'manual' source: entrada manual del usuario para meses sin flex sync
//
// Distinto de la tab Trades (compra/venta de acciones) y Dividendos (pagos
// del emisor). Aquí solo flujos cash bank ↔ broker.

const TIPOS = [
  { id: 'DEPOSIT',  lbl: 'Depósito',     color: '#30d158', desc: 'Banco → IB' },
  { id: 'WITHDRAW', lbl: 'Retirada',     color: '#ff453a', desc: 'IB → Banco' },
  { id: 'INTERNAL', lbl: 'Interna',      color: '#60a5fa', desc: 'Entre cuentas IB' },
];

function fmtMoney(n, ccy = 'USD') {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const formatted = abs.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbol = ccy === 'USD' ? '$' : ccy === 'EUR' ? '€' : ccy + ' ';
  return `${sign}${symbol}${formatted}`;
}

function tipoBadge(tipo) {
  const t = TIPOS.find(x => x.id === tipo) || { id: tipo, lbl: tipo, color: '#888', desc: tipo };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 4,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.5,
      background: t.color + '22',
      color: t.color,
      border: `1px solid ${t.color}55`,
    }}>{t.lbl}</span>
  );
}

export default function TransferenciasTab() {
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ deposits: 0, withdraws: 0, internal: 0, net: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterAccount, setFilterAccount] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    account_id: '',
    tipo: 'DEPOSIT',
    importe: '',
    divisa: 'USD',
    descripcion: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filterAccount) params.set('account', filterAccount);
    if (filterTipo) params.set('tipo', filterTipo);
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo);
    try {
      const r = await fetch(`${API_URL}/api/transferencias?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setItems(d.items || []);
      setTotals(d.totals || { deposits: 0, withdraws: 0, internal: 0, net: 0, count: 0 });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterAccount, filterTipo, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!form.fecha || !form.importe) return;
    try {
      const r = await fetch(`${API_URL}/api/transferencias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      setForm({ ...form, importe: '', descripcion: '' });
      setShowAdd(false);
      load();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const removeRow = async (id) => {
    if (!window.confirm('¿Borrar esta transferencia?')) return;
    try {
      const r = await fetch(`${API_URL}/api/transferencias/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      load();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // Cuentas únicas para el filtro
  const accounts = [...new Set(items.map(i => i.account_id).filter(Boolean))].sort();

  return (
    <div style={{ padding: 14 }}>
      {/* ── Header con totales ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
        marginBottom: 14,
      }}>
        <SummaryCard label="Aportado a IB" value={fmtMoney(totals.deposits)} color="#30d158" />
        <SummaryCard label="Retirado de IB" value={fmtMoney(totals.withdraws)} color="#ff453a" />
        <SummaryCard label="Neto aportado" value={fmtMoney(totals.net)} color="var(--gold)" />
        <SummaryCard label="Transferencias internas" value={fmtMoney(totals.internal)} color="#60a5fa" />
        <SummaryCard label="Total movimientos" value={String(totals.count)} color="var(--text-secondary)" />
      </div>

      {/* ── Filtros + botón añadir ── */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={selectStyle}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t.id} value={t.id}>{t.lbl} ({t.desc})</option>)}
        </select>
        <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={selectStyle}>
          <option value="">Todas las cuentas</option>
          {accounts.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={inputStyle} title="Desde" />
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={inputStyle} title="Hasta" />
        <button onClick={() => { setFilterAccount(''); setFilterTipo(''); setFilterFrom(''); setFilterTo(''); }} style={btnStyle}>Limpiar</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAdd(!showAdd)} style={{ ...btnStyle, background: 'var(--gold)', color: '#000', fontWeight: 700 }}>
          {showAdd ? '× Cerrar' : '+ Añadir manual'}
        </button>
      </div>

      {/* ── Formulario añadir manual ── */}
      {showAdd && (
        <form onSubmit={submitAdd} style={{
          marginBottom: 14,
          padding: 12,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8,
          alignItems: 'end',
        }}>
          <Field label="Fecha">
            <input type="date" required value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Tipo">
            <select required value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={selectStyle}>
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.lbl}</option>)}
            </select>
          </Field>
          <Field label="Cuenta IB">
            <input type="text" placeholder="U5372268 (opcional)" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Importe">
            <input type="number" step="0.01" required placeholder="1000.00" value={form.importe} onChange={e => setForm({ ...form, importe: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Divisa">
            <select value={form.divisa} onChange={e => setForm({ ...form, divisa: e.target.value })} style={selectStyle}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="HKD">HKD</option>
              <option value="AUD">AUD</option>
              <option value="CAD">CAD</option>
              <option value="JPY">JPY</option>
            </select>
          </Field>
          <Field label="Descripción">
            <input type="text" placeholder="Ej. transferencia BBVA, FX EUR→USD" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} style={inputStyle} />
          </Field>
          <button type="submit" style={{ ...btnStyle, background: '#30d158', color: '#000', fontWeight: 700 }}>
            Guardar
          </button>
        </form>
      )}

      {/* ── Tabla ── */}
      {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>Cargando…</div>}
      {error && <div style={{ padding: 12, color: '#ff453a' }}>Error: {error}</div>}
      {!loading && !error && items.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          No hay transferencias todavía.<br />
          <small>Ejecuta tu sync de IB Flex (sync-flex.sh) para auto-importar histórico, o añade manualmente con el botón de arriba.</small>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Cuenta</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Importe</th>
                <th style={thStyle}>Divisa</th>
                <th style={thStyle}>Descripción</th>
                <th style={thStyle}>Origen</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}>{r.fecha}</td>
                  <td style={tdStyle}>{tipoBadge(r.tipo)}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text-tertiary)' }}>{r.account_id || '—'}</td>
                  <td style={{
                    ...tdStyle,
                    textAlign: 'right',
                    fontFamily: 'var(--fm)',
                    fontWeight: 600,
                    color: r.importe > 0 ? '#30d158' : r.importe < 0 ? '#ff453a' : 'var(--text-secondary)',
                  }}>{fmtMoney(r.importe, r.divisa)}</td>
                  <td style={{ ...tdStyle, fontSize: 10, color: 'var(--text-tertiary)' }}>{r.divisa}</td>
                  <td style={{ ...tdStyle, fontSize: 10, color: 'var(--text-tertiary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.descripcion}>{r.descripcion || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: r.source === 'flex' ? 'rgba(96,165,250,.15)' : 'rgba(200,164,78,.15)',
                      color: r.source === 'flex' ? '#60a5fa' : 'var(--gold)',
                    }}>{r.source}</span>
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => removeRow(r.id)} style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: 2,
                    }} title="Borrar">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '8px 12px',
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--fm)' }}>{value}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  padding: '5px 8px',
  fontSize: 12,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  color: 'var(--text)',
  fontFamily: 'inherit',
};

const selectStyle = { ...inputStyle, cursor: 'pointer' };

const btnStyle = {
  padding: '5px 10px',
  fontSize: 11,
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 5,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

const thStyle = {
  padding: '7px 9px',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  textAlign: 'left',
};

const tdStyle = {
  padding: '6px 9px',
  fontSize: 11,
  color: 'var(--text-secondary)',
  textAlign: 'left',
};
