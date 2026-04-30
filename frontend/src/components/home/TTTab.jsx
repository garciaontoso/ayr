import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';

// ─── Tab TT (Tastytrade) ────────────────────────────────────────────────────
// Muestra las 3 cuentas T3 del usuario con sus posiciones agrupadas por
// strategy detectada (BPS/IC/CSP/CC/etc). Datos del bridge NAS via worker.

export default function TTTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeAccount, setActiveAccount] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/tastytrade/positions`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
      // Auto-select first account with positions
      if (!activeAccount && d.accounts?.length) {
        const first = d.accounts.find(a => a.position_count > 0) || d.accounts[0];
        setActiveAccount(first.account_number);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [activeAccount]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const i = setInterval(() => { setRefreshing(true); load(); }, 60 * 1000);
    return () => clearInterval(i);
  }, [load]);

  const refresh = () => { setRefreshing(true); load(); };

  if (loading && !data) return <div style={panel}>Cargando posiciones T3…</div>;
  if (error) return <div style={{...panel, color: '#f87171'}}>❌ {error}</div>;
  if (!data?.accounts?.length) return <div style={panel}>Sin cuentas T3 configuradas. Ver tab Auto Trading → 🛡️ Auto-Close para conectar.</div>;

  const account = data.by_account[activeAccount];

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>💎 Tastytrade</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{refreshing ? 'Sincronizando…' : 'Auto-refresh 60s'}</span>
          <button onClick={refresh} style={refreshBtn}>🔄 Refrescar</button>
        </div>
      </div>

      {/* Selector de cuentas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
        {data.accounts.map(a => (
          <button key={a.account_number} onClick={() => setActiveAccount(a.account_number)}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              borderBottom: activeAccount === a.account_number ? '2px solid var(--gold)' : '2px solid transparent',
              background: 'transparent',
              color: activeAccount === a.account_number ? 'var(--gold)' : 'var(--text-secondary)',
              cursor: 'pointer',
              marginBottom: -1,
            }}>
            <div>{a.nickname || a.account_number}</div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 500 }}>
              {a.account_number} · {a.position_count} pos · {a.margin_or_cash}
            </div>
          </button>
        ))}
      </div>

      {/* Detalle cuenta seleccionada */}
      {account && <AccountPanel account={account} />}
    </div>
  );
}

function AccountPanel({ account }) {
  const grouped = useMemo(() => groupPositionsByStrategy(account.positions || []), [account]);

  if (!account.positions?.length) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📭</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{account.nickname || account.account_number} — sin posiciones abiertas</div>
        <div style={{ fontSize: 11, marginTop: 6 }}>Cuando abras un trade en T3, aparecerá aquí automáticamente.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats de la cuenta */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
        <Metric lbl="Posiciones" value={account.positions.length} />
        <Metric lbl="Estrategias detectadas" value={grouped.strategies.length} />
        <Metric lbl="Opciones" value={account.positions.filter(p => p.is_option).length} />
        <Metric lbl="Stocks" value={account.positions.filter(p => !p.is_option).length} />
        <Metric lbl="Tipo cuenta" value={account.margin_or_cash} />
      </div>

      {/* Estrategias detectadas */}
      {grouped.strategies.length > 0 && (
        <>
          <h3 style={sectionH}>📊 Estrategias detectadas</h3>
          <table style={tbl}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Strategy</th>
                <th style={th}>Underlying</th>
                <th style={th}>Spread</th>
                <th style={th}>Expiry</th>
                <th style={{...th, textAlign: 'right'}}>DTE</th>
                <th style={{...th, textAlign: 'right'}}>Contratos</th>
                <th style={{...th, textAlign: 'right'}}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {grouped.strategies.map((s, i) => {
                const dte = Math.max(0, Math.round((new Date(s.expiry).getTime() - Date.now()) / 86400000));
                const dteColor = dte <= 7 ? '#f87171' : dte <= 21 ? '#fbbf24' : 'var(--text)';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{...td, fontWeight: 700, color: 'var(--gold)'}}>{s.type}</td>
                    <td style={td}>{s.underlying}</td>
                    <td style={td}>
                      {s.short_strike}{s.long_strike ? `/${s.long_strike}` : ''}
                      {s.short_strike_call ? ` C ${s.short_strike_call}/${s.long_strike_call}` : ''}
                    </td>
                    <td style={td}>{s.expiry}</td>
                    <td style={{...td, textAlign: 'right', color: dteColor, fontWeight: 700}}>{dte}d</td>
                    <td style={{...td, textAlign: 'right'}}>{s.contracts}</td>
                    <td style={{...td, textAlign: 'right', fontWeight: 700, color: '#30d158'}}>${s.credit?.toFixed(2) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Posiciones individuales (para auditoría) */}
      <h3 style={{...sectionH, marginTop: 20}}>📋 Todas las posiciones</h3>
      <table style={tbl}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={th}>Symbol</th>
            <th style={th}>Tipo</th>
            <th style={th}>Strike/Expiry</th>
            <th style={{...th, textAlign: 'right'}}>Qty</th>
            <th style={th}>Dir</th>
            <th style={{...th, textAlign: 'right'}}>Avg open</th>
            <th style={{...th, textAlign: 'right'}}>Mark</th>
            <th style={th}>Open at</th>
          </tr>
        </thead>
        <tbody>
          {account.positions.map((p, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{...td, fontFamily: 'var(--fm)'}}>{p.symbol}</td>
              <td style={td}>{p.is_option ? `${p.opt_type?.toUpperCase()} OPT` : p.instrument_type}</td>
              <td style={td}>{p.is_option ? `$${p.strike} / ${p.expiry}` : '—'}</td>
              <td style={{...td, textAlign: 'right'}}>{p.quantity}</td>
              <td style={{...td, color: p.quantity_direction === 'Short' ? '#f87171' : '#30d158'}}>{p.quantity_direction}</td>
              <td style={{...td, textAlign: 'right'}}>${(p.average_open_price || 0).toFixed(2)}</td>
              <td style={{...td, textAlign: 'right'}}>${(p.mark_price || 0).toFixed(2)}</td>
              <td style={{...td, color: 'var(--text-tertiary)', fontSize: 10}}>{(p.opened_at || '').slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Helper: agrupar posiciones por estrategia detectada ───────────────────

function groupPositionsByStrategy(positions) {
  const opts = positions.filter(p => p.is_option && p.opt_type && p.strike && p.expiry);
  if (!opts.length) return { strategies: [] };

  // Group by underlying + expiry
  const groups = new Map();
  for (const p of opts) {
    const key = `${p.underlying}|${p.expiry}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const strategies = [];
  for (const [key, legs] of groups) {
    const [underlying, expiry] = key.split('|');
    const puts = legs.filter(l => l.opt_type === 'put');
    const calls = legs.filter(l => l.opt_type === 'call');

    let type = null, short_strike = null, long_strike = null;
    let short_strike_call = null, long_strike_call = null;
    let credit = null, contracts = null;

    if (puts.length === 2 && calls.length === 0) {
      const sh = puts.find(l => l.quantity_direction === 'Short');
      const lo = puts.find(l => l.quantity_direction === 'Long');
      if (sh && lo) {
        type = 'BPS';
        short_strike = sh.strike;
        long_strike = lo.strike;
        contracts = Math.abs(sh.quantity);
        credit = (sh.average_open_price || 0) - (lo.average_open_price || 0);
      }
    } else if (calls.length === 2 && puts.length === 0) {
      const sh = calls.find(l => l.quantity_direction === 'Short');
      const lo = calls.find(l => l.quantity_direction === 'Long');
      if (sh && lo) {
        type = 'BCS';
        short_strike_call = sh.strike;
        long_strike_call = lo.strike;
        contracts = Math.abs(sh.quantity);
        credit = (sh.average_open_price || 0) - (lo.average_open_price || 0);
      }
    } else if (puts.length === 2 && calls.length === 2) {
      const sp = puts.find(l => l.quantity_direction === 'Short');
      const lp = puts.find(l => l.quantity_direction === 'Long');
      const sc = calls.find(l => l.quantity_direction === 'Short');
      const lc = calls.find(l => l.quantity_direction === 'Long');
      if (sp && lp && sc && lc) {
        type = 'IC';
        short_strike = sp.strike; long_strike = lp.strike;
        short_strike_call = sc.strike; long_strike_call = lc.strike;
        contracts = Math.abs(sp.quantity);
        credit = ((sp.average_open_price || 0) - (lp.average_open_price || 0)) +
                 ((sc.average_open_price || 0) - (lc.average_open_price || 0));
      }
    } else if (puts.length === 1 && puts[0].quantity_direction === 'Short' && calls.length === 0) {
      type = 'CSP';
      short_strike = puts[0].strike;
      contracts = Math.abs(puts[0].quantity);
      credit = puts[0].average_open_price || 0;
    } else if (puts.length === 1 && puts[0].quantity_direction === 'Long' && calls.length === 0) {
      type = 'LongPut';
      short_strike = puts[0].strike;
      contracts = Math.abs(puts[0].quantity);
      credit = -(puts[0].average_open_price || 0);
    }

    if (!type) {
      // Multi-leg sin patrón estándar
      type = `${puts.length}P+${calls.length}C`;
      contracts = Math.abs(legs[0].quantity);
    }

    strategies.push({ type, underlying, expiry, short_strike, long_strike, short_strike_call, long_strike_call, contracts, credit, legs });
  }

  return { strategies };
}

// ─── Styles ────────────────────────────────────────────────────────────────

const panel = { padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' };
const tbl = { width: '100%', fontSize: 11, borderCollapse: 'collapse', marginBottom: 12 };
const th = { padding: '6px 8px', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)', textAlign: 'left' };
const td = { padding: '5px 8px', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'left' };
const sectionH = { fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 0, marginBottom: 8 };
const refreshBtn = { padding: '5px 10px', fontSize: 11, fontWeight: 600, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer' };

function Metric({ lbl, value, color }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{lbl}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3, color: color || 'var(--text)' }}>{value}</div>
    </div>
  );
}
