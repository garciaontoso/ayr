// Sprint 22.6 — Reconcile sub-tab: cost_basis vs IB with corporate action heuristics.
// Click-fix workflow para discrepancias (split, DRIP, assignment, dup, symbol change).

import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.onto-so.com';

const CAUSE_LABEL = {
  STOCK_SPLIT: '🪓 Stock split',
  REVERSE_SPLIT: '↩️ Reverse split',
  DRIP: '💧 DRIP (dividend reinvest)',
  OPTION_ASSIGNMENT: '🎯 Option assigned',
  SPIN_OFF: '🌱 Spin-off',
  SYMBOL_CHANGE: '🔄 Symbol change',
  COST_BASIS_DUPLICATE: '👯 cost_basis dup',
  TRANSFER_OUT: '📤 Transferido out',
  TRANSFER_IN: '📥 Transferido in',
  UNKNOWN: '❓ Unknown',
};

const CONFIDENCE_COLOR = {
  HIGH: '#30d158',
  MEDIUM: '#fbbf24',
  LOW: 'var(--text-tertiary)',
};

export default function ReconcileSubtab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [applyState, setApplyState] = useState({});  // {ticker: 'applying'|'done'|'error'}
  const [hideFX, setHideFX] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(API_URL + '/api/audit/cost-basis-vs-ib');
      const j = await r.json();
      if (j.error) setErr(j.error + (j.detail ? `: ${j.detail}` : ''));
      else setData(j);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const applyCorrection = useCallback(async (row) => {
    if (!window.confirm(`Aplicar "${row.suggested_action}" para ${row.ticker}?\n\n${row.explanation}\n\nEsto modifica cost_basis. No es reversible automáticamente.`)) return;
    setApplyState(s => ({ ...s, [row.ticker]: 'applying' }));
    try {
      const body = {
        ticker: row.ticker,
        action: row.suggested_action,
        shares: row.suggested_data?.shares,
        type: row.suggested_data?.type,
        new_ticker: row.suggested_data?.to,
        ib_qty: row.ib_qty,
        trades_qty: row.trades_qty,
        note: row.explanation,
      };
      const r = await fetch(API_URL + '/api/audit/cost-basis/apply-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.error) {
        setApplyState(s => ({ ...s, [row.ticker]: 'error:' + j.error }));
      } else {
        setApplyState(s => ({ ...s, [row.ticker]: 'done' }));
        setTimeout(() => refresh(), 800);
      }
    } catch (e) {
      setApplyState(s => ({ ...s, [row.ticker]: 'error:' + e.message }));
    }
  }, [refresh]);

  if (loading && !data) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Analizando cost_basis vs IB live...</div>;
  if (err) return (
    <div style={{ padding: 20 }}>
      <div style={{ padding: 12, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>
        ⚠ {err}
        {err.includes('offline') && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            Necesita IB Gateway encendido. Click el botón 🟢 IB en el header para arrancar.
          </div>
        )}
      </div>
    </div>
  );
  if (!data) return null;

  let rows = data.results || [];
  if (hideFX) rows = rows.filter(r => !r.ticker.includes('.'));
  if (filter !== 'ALL') rows = rows.filter(r => r.cause === filter);

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold, #fbbf24)' }}>🔍 Reconcile cost_basis vs IB live</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {data.ib_total_tickers} en IB · {data.trades_total_tickers} en trades · <b>{data.n_discrepancies}</b> discrepancias
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 11 }}>
              <input type="checkbox" checked={hideFX} onChange={e => setHideFX(e.target.checked)} /> hide FX/derivatives
            </label>
            <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: 4, fontSize: 11, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
              <option value="ALL">Todas las causas</option>
              {Object.keys(CAUSE_LABEL).map(c => <option key={c} value={c}>{CAUSE_LABEL[c]} ({data.by_cause?.[c] || 0})</option>)}
            </select>
            <button onClick={refresh} style={btnStyle}>↻</button>
          </div>
        </div>
      </div>

      {/* Summary by cause */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
        {Object.entries(data.by_cause || {})
          .sort((a, b) => b[1] - a[1])
          .map(([cause, n]) => (
            <div key={cause} style={{ ...CARD, padding: 8, cursor: 'pointer', borderColor: filter === cause ? '#fbbf24' : 'var(--border)' }} onClick={() => setFilter(filter === cause ? 'ALL' : cause)}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{CAUSE_LABEL[cause] || cause}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{n}</div>
            </div>
          ))}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', padding: 20 }}>
          Sin discrepancias para mostrar (filter activo: {filter}{hideFX ? ', FX oculto' : ''})
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                <th style={th}>Ticker</th>
                <th style={th}>IB</th>
                <th style={th}>trades</th>
                <th style={th}>Diff</th>
                <th style={th}>Causa probable</th>
                <th style={th}>Conf</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r, i) => {
                const state = applyState[r.ticker];
                const diffClr = r.diff > 0 ? '#30d158' : r.diff < 0 ? '#ef4444' : 'var(--text-tertiary)';
                return (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}><b>{r.ticker}</b></td>
                    <td style={td}>{Number(r.ib_qty).toLocaleString()}</td>
                    <td style={td}>{Number(r.trades_qty).toLocaleString()}</td>
                    <td style={{ ...td, color: diffClr }}>{r.diff > 0 ? '+' : ''}{Number(r.diff).toLocaleString()}</td>
                    <td style={td} title={r.explanation}>{CAUSE_LABEL[r.cause] || r.cause}</td>
                    <td style={{ ...td, color: CONFIDENCE_COLOR[r.confidence] || 'var(--text-tertiary)', fontWeight: 600 }}>{r.confidence}</td>
                    <td style={td}>
                      {r.suggested_action === 'MANUAL_REVIEW' ? (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>—</span>
                      ) : state === 'done' ? (
                        <span style={{ color: '#30d158' }}>✓ Aplicado</span>
                      ) : state === 'applying' ? (
                        <span style={{ color: 'var(--text-tertiary)' }}>⏳…</span>
                      ) : state?.startsWith('error:') ? (
                        <span style={{ color: '#ef4444', fontSize: 10 }} title={state.slice(6)}>✗ Error</span>
                      ) : (
                        <button onClick={() => applyCorrection(r)} style={{ ...btnStyle, fontSize: 10, padding: '3px 8px', background: 'rgba(48,209,88,.12)', color: '#30d158', border: '1px solid rgba(48,209,88,.4)' }}>
                          {r.suggested_action === 'DELETE_DUPLICATES' && 'Borrar dups'}
                          {r.suggested_action === 'INSERT_CORPORATE_ACTION' && 'Insert action'}
                          {r.suggested_action === 'MARK_TRANSFERRED_OUT' && 'Marcar out'}
                          {r.suggested_action === 'CONFIRM_SYMBOL_CHANGE' && `→${r.suggested_data?.to}`}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 100 && (
            <div style={{ padding: 8, fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              Mostrando 100 de {rows.length} discrepancias. Usa filter para reducir.
            </div>
          )}
        </div>
      )}

      <div style={{ padding: 10, background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        💡 Sprint 22.6 — Cuando IB Gateway online, cada discrepancia entre cost_basis y IB live se categoriza por causa probable. Click "Apply" registra una corrección permanente (insert CORPORATE_ACTION, delete dup, symbol rename, etc.) y el audit log queda en agent_memory. NO confíes en alta-confianza ciegamente — revisa la explicación antes de aplicar.
      </div>
    </div>
  );
}

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

const th = { padding: 8, textAlign: 'left', fontWeight: 700, fontSize: 11 };
const td = { padding: 6, fontSize: 11 };
