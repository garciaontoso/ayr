import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';

// ─── Auto Trading tab ──────────────────────────────────────────────────────
// Sistema de backtest + paper trading + (futuro) live trading automatizado.
// Diseñado en fases:
//   Fase 1 (actual): backtest histórico con BS+VIX. Estrategia BPS implementada.
//   Fase 2: paper trading live (señales diarias sin ejecutar).
//   Fase 3: real money con safety nets (account separada, kill switch, limits).
//
// IMPORTANTE: este sistema NO ejecuta órdenes en IBKR. La cuenta principal
// tiene Read-Only API enabled. Cualquier ejecución la hace el usuario en TWS.

const SUB_TABS = [
  { id: 'catalog',   lbl: '📚 Catálogo' },
  { id: 'backtest',  lbl: '🧪 Backtest' },
  { id: 'fishing',   lbl: '🎣 Pescando' },
  { id: 'brain',     lbl: '🧠 Brain' },
  { id: 'today',     lbl: '📅 Hoy' },
  { id: 'paper',     lbl: '📊 Paper' },
];

const STATUS_BADGE = {
  enabled: { color: '#30d158', bg: 'rgba(48,209,88,.14)', border: 'rgba(48,209,88,.4)', lbl: 'Activa' },
  disabled: { color: 'var(--text-tertiary)', bg: 'transparent', border: 'var(--border)', lbl: 'Inactiva' },
  paper: { color: '#60a5fa', bg: 'rgba(96,165,250,.14)', border: 'rgba(96,165,250,.4)', lbl: 'Paper' },
};

function fmtMoney(n) { if (n == null) return '—'; const sign = n < 0 ? '-' : ''; return sign + '$' + Math.abs(n).toLocaleString('es-ES', {maximumFractionDigits: 0}); }
function fmtPct(n) { if (n == null) return '—'; return n.toFixed(2) + '%'; }
function fmtN(n, d = 2) { if (n == null) return '—'; return Number(n).toFixed(d); }

export default function AutoTradingTab() {
  const [subTab, setSubTab] = useState('catalog');
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/auto/strategies`)
      .then(r => r.json())
      .then(d => { setStrategies(d.strategies || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 14 }}>
      {/* Disclaimer banner */}
      <div style={{
        marginBottom: 14,
        padding: '10px 14px',
        background: 'rgba(255,159,10,.08)',
        border: '1px solid rgba(255,159,10,.3)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--text-secondary)',
        lineHeight: 1.55,
      }}>
        ⚠️ <b>Sistema en desarrollo (Fase 1).</b> Backtest histórico con Black-Scholes + VIX como IV proxy.
        Estrategias se validan primero en backtest, luego paper trading, luego con dinero real <i>solo</i>
        si los números justifican el riesgo. <b>Read-Only API enabled</b> en tu cuenta IBKR — el sistema
        nunca ejecuta órdenes, solo identifica y propone.
      </div>

      {/* Sub-tabs nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              borderBottom: subTab === t.id ? '2px solid var(--gold)' : '2px solid transparent',
              background: 'transparent',
              color: subTab === t.id ? 'var(--gold)' : 'var(--text-secondary)',
              cursor: 'pointer',
              marginBottom: -1,
            }}>
            {t.lbl}
          </button>
        ))}
      </div>

      {subTab === 'catalog' && <CatalogPanel strategies={strategies} loading={loading} />}
      {subTab === 'backtest' && <BacktestPanel strategies={strategies} />}
      {subTab === 'fishing' && <FishingPanel strategies={strategies} />}
      {subTab === 'brain' && <BrainPanel />}
      {subTab === 'today' && <TodayPanel />}
      {subTab === 'paper' && <PaperPanel />}
    </div>
  );
}

// ── Sub-panel: Catálogo ────────────────────────────────────────────────────

function CatalogPanel({ strategies, loading }) {
  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Cargando catálogo…</div>;
  if (!strategies.length) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Sin estrategias todavía. (Phase 1A en construcción)</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
      {strategies.map(s => <StrategyCard key={s.code} s={s} />)}
    </div>
  );
}

function StrategyCard({ s }) {
  const params = useMemo(() => { try { return JSON.parse(s.default_params_json); } catch { return {}; } }, [s]);
  const status = s.enabled ? (s.paper_mode ? 'paper' : 'enabled') : 'disabled';
  const sb = STATUS_BADGE[status];
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{s.category}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{s.name}</div>
        </div>
        <span style={{
          padding: '3px 8px',
          borderRadius: 4,
          fontSize: 9,
          fontWeight: 700,
          background: sb.bg,
          color: sb.color,
          border: `1px solid ${sb.border}`,
        }}>{sb.lbl}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 10 }}>
        {s.description}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        <b>Params default:</b>
        <pre style={{ background: 'var(--bg)', padding: 8, borderRadius: 4, marginTop: 4, fontSize: 10, overflow: 'auto' }}>
{JSON.stringify(params, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ── Sub-panel: Backtest ────────────────────────────────────────────────────

function BacktestPanel({ strategies }) {
  const [code, setCode] = useState('bps_spx');
  const [periodFrom, setPeriodFrom] = useState('2021-01-01');
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().slice(0, 10));
  const [capital, setCapital] = useState(100000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/auto/backtests${code ? `?strategy=${code}` : ''}`);
      const d = await r.json();
      setHistory(d.runs || []);
    } catch {}
  }, [code]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const run = async () => {
    setRunning(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/auto/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_code: code, period_from: periodFrom, period_to: periodTo, initial_capital: Number(capital) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
      loadHistory();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      {/* Form */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14, alignItems: 'end' }}>
        <Field lbl="Estrategia">
          <select value={code} onChange={e => setCode(e.target.value)} style={selectStyle}>
            {strategies.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </Field>
        <Field lbl="Desde">
          <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} style={inputStyle} />
        </Field>
        <Field lbl="Hasta">
          <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} style={inputStyle} />
        </Field>
        <Field lbl="Capital inicial">
          <input type="number" value={capital} onChange={e => setCapital(e.target.value)} style={inputStyle} />
        </Field>
        <button onClick={run} disabled={running} style={{
          padding: '6px 14px', fontSize: 12, fontWeight: 700,
          background: running ? 'var(--text-tertiary)' : 'var(--gold)',
          color: '#000', border: 'none', borderRadius: 5,
          cursor: running ? 'wait' : 'pointer',
        }}>{running ? 'Corriendo…' : 'Ejecutar backtest'}</button>
      </div>

      {error && <div style={{ padding: 10, background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 6, color: '#f87171', marginBottom: 12 }}>❌ {error}</div>}

      {result && <BacktestResult r={result} />}

      {/* Histórico */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Histórico de backtests</div>
        {!history.length && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: 12 }}>Sin backtests todavía.</div>}
        {history.length > 0 && (
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Fecha</th><th style={th}>Estrategia</th><th style={th}>Periodo</th>
                <th style={{...th, textAlign:'right'}}>Trades</th>
                <th style={{...th, textAlign:'right'}}>Win%</th>
                <th style={{...th, textAlign:'right'}}>Return</th>
                <th style={{...th, textAlign:'right'}}>Max DD</th>
                <th style={{...th, textAlign:'right'}}>Sharpe</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={td}>{(h.created_at || '').slice(0, 10)}</td>
                  <td style={td}>{h.strategy_code}</td>
                  <td style={td}>{h.period_from} → {h.period_to}</td>
                  <td style={{...td, textAlign:'right'}}>{h.trades_count}</td>
                  <td style={{...td, textAlign:'right'}}>{fmtPct(h.win_rate * 100)}</td>
                  <td style={{...td, textAlign:'right', color: h.total_return_pct >= 0 ? '#30d158' : '#f87171'}}>{fmtPct(h.total_return_pct)}</td>
                  <td style={{...td, textAlign:'right', color: '#f87171'}}>-{fmtPct(h.max_drawdown_pct)}</td>
                  <td style={{...td, textAlign:'right', fontWeight: 700}}>{fmtN(h.sharpe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BacktestResult({ r }) {
  const isOk = r.total_return_pct >= 0 && r.sharpe >= 0.4;
  const verdict = r.sharpe >= 1.0 ? { lbl: '🟢 Edge real', color: '#30d158' }
    : r.sharpe >= 0.5 ? { lbl: '🟡 Marginal — mejorar params', color: '#fbbf24' }
    : { lbl: '🔴 No edge — descartar o rediseñar', color: '#f87171' };
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Resultado backtest</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: verdict.color, padding: '4px 10px', border: `1px solid ${verdict.color}55`, borderRadius: 4, background: verdict.color + '14' }}>{verdict.lbl}</span>
      </div>

      {/* Metric grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Metric lbl="Total return" value={fmtPct(r.total_return_pct)} color={r.total_return_pct >= 0 ? '#30d158' : '#f87171'} />
        <Metric lbl="Total PnL" value={fmtMoney(r.total_pnl)} color={r.total_pnl >= 0 ? '#30d158' : '#f87171'} />
        <Metric lbl="Max drawdown" value={'-' + fmtPct(r.max_drawdown_pct)} color="#f87171" />
        <Metric lbl="Sharpe" value={fmtN(r.sharpe)} color={r.sharpe >= 1 ? '#30d158' : r.sharpe >= 0.5 ? '#fbbf24' : '#f87171'} />
        <Metric lbl="Calmar" value={fmtN(r.calmar)} />
        <Metric lbl="Trades" value={r.trades_count} />
        <Metric lbl="Win rate" value={fmtPct((r.win_rate || 0) * 100)} />
        <Metric lbl="Avg credit" value={'$' + fmtN(r.avg_credit)} />
        <Metric lbl="Avg DTE entry" value={fmtN(r.avg_dte_at_entry, 0) + 'd'} />
        <Metric lbl="Total fees" value={fmtMoney(r.total_fees)} color="var(--text-tertiary)" />
      </div>

      {/* Equity curve simple SVG */}
      {r.equity_curve && r.equity_curve.length > 1 && <EquityChart curve={r.equity_curve} />}

      {/* Notes */}
      {r.notes && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 10, fontStyle: 'italic', lineHeight: 1.55 }}>{r.notes}</div>}
    </div>
  );
}

function Metric({ lbl, value, color }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{lbl}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3, color: color || 'var(--text)', fontFamily: 'var(--fm)' }}>{value}</div>
    </div>
  );
}

function EquityChart({ curve }) {
  const width = 800, height = 200, padX = 40, padY = 20;
  const equities = curve.map(c => c.equity);
  const min = Math.min(...equities);
  const max = Math.max(...equities);
  const range = max - min || 1;
  const xScale = (i) => padX + (i / (curve.length - 1)) * (width - padX * 2);
  const yScale = (v) => padY + (1 - (v - min) / range) * (height - padY * 2);
  const path = curve.map((c, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(c.equity)}`).join(' ');
  const initial = curve[0].equity;
  const final = curve[curve.length - 1].equity;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>Equity curve · {curve.length} días</div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 200, background: 'var(--bg)', borderRadius: 4 }}>
        <line x1={padX} y1={yScale(initial)} x2={width - padX} y2={yScale(initial)} stroke="var(--text-tertiary)" strokeDasharray="2 2" strokeOpacity="0.4" />
        <path d={path} stroke={final >= initial ? '#30d158' : '#f87171'} strokeWidth="1.5" fill="none" />
        <text x={padX} y={padY - 4} fontSize="9" fill="var(--text-tertiary)">${(max/1000).toFixed(0)}K</text>
        <text x={padX} y={height - 4} fontSize="9" fill="var(--text-tertiary)">${(min/1000).toFixed(0)}K</text>
        <text x={width - padX - 60} y={padY - 4} fontSize="9" fill="var(--text-tertiary)">{curve[curve.length - 1].date}</text>
      </svg>
    </div>
  );
}

// ── Sub-panel: Pescando (fishing orders) ──────────────────────────────────

function FishingPanel({ strategies }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/fishing/orders`);
      const d = await r.json();
      setOrders(d.orders || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const scan = async () => {
    setScanning(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/fishing/scan`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setScanResult(d);
      load();
    } catch (e) { setError(e.message); }
    finally { setScanning(false); }
  };

  const cancelOrder = async (id) => {
    if (!confirm('¿Cancelar esta fishing order?')) return;
    await fetch(`${API_URL}/api/fishing/orders/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setShowForm(!showForm)} style={primaryBtnStyle}>
          {showForm ? '✕ Cancelar' : '+ Nueva fishing order'}
        </button>
        <button onClick={scan} disabled={scanning} style={{
          ...secondaryBtnStyle,
          background: scanning ? 'var(--text-tertiary)' : 'rgba(96,165,250,.15)',
          color: scanning ? '#000' : '#60a5fa',
          border: '1px solid rgba(96,165,250,.4)',
        }}>
          {scanning ? 'Escaneando…' : '🎣 Escanear precios ahora'}
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {orders.filter(o => o.status === 'fishing').length} activas · {orders.filter(o => o.status === 'hit').length} pescadas · {orders.filter(o => o.status === 'cancelled').length} canceladas
        </div>
      </div>

      {error && <ErrorBox text={error} />}

      {scanResult && (
        <div style={{ padding: 10, marginBottom: 12, background: 'rgba(96,165,250,.08)', border: '1px solid rgba(96,165,250,.3)', borderRadius: 6, fontSize: 11 }}>
          <b>Escaneo:</b> {scanResult.scanned} órdenes revisadas, {scanResult.hits} HITs 🐟, {scanResult.proximity} cerca 🎣
          {scanResult.source && <span style={{ color: 'var(--text-tertiary)', marginLeft: 8 }}>(fuente: {scanResult.source})</span>}
        </div>
      )}

      {showForm && <FishingOrderForm strategies={strategies} onSaved={() => { setShowForm(false); load(); }} />}

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Cargando…</div>
      ) : !orders.length ? (
        <EmptyState
          icon="🎣"
          title="Sin fishing orders todavía"
          subtitle="Crea una orden GTC con credit objetivo y el sistema avisará cuando el precio se acerque o llegue al target."
        />
      ) : (
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={th}>Estado</th>
              <th style={th}>Estrategia</th>
              <th style={th}>Spread</th>
              <th style={th}>Expira</th>
              <th style={{...th, textAlign:'right'}}>Target $</th>
              <th style={{...th, textAlign:'right'}}>Actual $</th>
              <th style={{...th, textAlign:'right'}}>%</th>
              <th style={{...th, textAlign:'right'}}>POP</th>
              <th style={th}>Last scan</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const pct = o.target_credit && o.current_credit != null ? (o.current_credit / o.target_credit) * 100 : null;
              const pctColor = pct == null ? 'var(--text-tertiary)' : pct >= 100 ? '#30d158' : pct >= 80 ? '#fbbf24' : 'var(--text-secondary)';
              const sb = o.status === 'fishing' ? { lbl: '🎣 Pescando', color: '#60a5fa' }
                : o.status === 'hit' ? { lbl: '🐟 Pescado', color: '#30d158' }
                : o.status === 'cancelled' ? { lbl: 'Cancelada', color: 'var(--text-tertiary)' }
                : { lbl: o.status, color: 'var(--text)' };
              return (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{...td, color: sb.color, fontWeight: 600 }}>{sb.lbl}</td>
                  <td style={td}>{o.strategy_code}</td>
                  <td style={td}>{o.underlying} {o.short_strike}/{o.long_strike} ×{o.contracts}</td>
                  <td style={td}>{o.expiration}</td>
                  <td style={{...td, textAlign:'right', fontWeight: 700}}>${Number(o.target_credit).toFixed(2)}</td>
                  <td style={{...td, textAlign:'right'}}>{o.current_credit != null ? '$' + Number(o.current_credit).toFixed(2) : '—'}</td>
                  <td style={{...td, textAlign:'right', color: pctColor, fontWeight: 700}}>{pct != null ? pct.toFixed(0) + '%' : '—'}</td>
                  <td style={{...td, textAlign:'right'}}>{o.current_pop != null ? (Number(o.current_pop) * 100).toFixed(0) + '%' : '—'}</td>
                  <td style={{...td, color: 'var(--text-tertiary)'}}>{o.last_scan_at ? o.last_scan_at.slice(11, 16) : '—'}</td>
                  <td style={td}>
                    {o.status === 'fishing' && (
                      <button onClick={() => cancelOrder(o.id)} style={{
                        padding: '3px 8px', fontSize: 10, color: '#f87171',
                        background: 'transparent', border: '1px solid #f8717155', borderRadius: 3, cursor: 'pointer',
                      }}>✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FishingOrderForm({ strategies, onSaved }) {
  const [form, setForm] = useState({
    strategy_code: strategies.find(s => s.code.startsWith('bps_iwm'))?.code || strategies[0]?.code || '',
    underlying: 'IWM',
    spread_type: 'BPS',
    short_strike: '',
    long_strike: '',
    expiration: '',
    contracts: 1,
    target_credit: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/fishing/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onSaved && onSaved();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const upd = (k, v) => setForm(p => ({...p, [k]: v}));

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Nueva fishing order</div>
      {error && <ErrorBox text={error} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <Field lbl="Estrategia">
          <select value={form.strategy_code} onChange={e => upd('strategy_code', e.target.value)} style={selectStyle}>
            {strategies.filter(s => s.enabled).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </Field>
        <Field lbl="Underlying">
          <input type="text" value={form.underlying} onChange={e => upd('underlying', e.target.value.toUpperCase())} style={inputStyle} placeholder="IWM" />
        </Field>
        <Field lbl="Tipo">
          <select value={form.spread_type} onChange={e => upd('spread_type', e.target.value)} style={selectStyle}>
            <option value="BPS">Bull Put Spread</option>
            <option value="BCS">Bear Call Spread</option>
            <option value="IC">Iron Condor</option>
          </select>
        </Field>
        <Field lbl="Short strike">
          <input type="number" step="0.5" value={form.short_strike} onChange={e => upd('short_strike', e.target.value)} style={inputStyle} placeholder="245" />
        </Field>
        <Field lbl="Long strike">
          <input type="number" step="0.5" value={form.long_strike} onChange={e => upd('long_strike', e.target.value)} style={inputStyle} placeholder="240" />
        </Field>
        <Field lbl="Expiración">
          <input type="date" value={form.expiration} onChange={e => upd('expiration', e.target.value)} style={inputStyle} />
        </Field>
        <Field lbl="Contratos">
          <input type="number" min="1" value={form.contracts} onChange={e => upd('contracts', Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field lbl="Target credit $">
          <input type="number" step="0.05" value={form.target_credit} onChange={e => upd('target_credit', e.target.value)} style={inputStyle} placeholder="0.80" />
        </Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <Field lbl="Notas (opcional)">
          <input type="text" value={form.notes} onChange={e => upd('notes', e.target.value)} style={{...inputStyle, width: '100%'}} placeholder="Phil Town setup, esperando IV expansión" />
        </Field>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving} style={primaryBtnStyle}>{saving ? 'Guardando…' : 'Crear fishing order'}</button>
      </div>
    </div>
  );
}

// ── Sub-panel: Brain ──────────────────────────────────────────────────────

function BrainPanel() {
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/brain/decisions?limit=30`);
      const d = await r.json();
      setDecisions(d.decisions || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setRunning(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/brain/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setLastResult(d);
      load();
    } catch (e) { setError(e.message); }
    finally { setRunning(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={run} disabled={running} style={primaryBtnStyle}>
          {running ? 'Pensando…' : '🧠 Ejecutar Brain ahora'}
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          MVP rules-based · {decisions.length} decisiones loggeadas · Coste: $0
        </div>
      </div>

      {error && <ErrorBox text={error} />}

      {lastResult && lastResult.market && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Snapshot mercado</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 8 }}>
            <Metric lbl="VIX" value={fmtN(lastResult.market.vix, 2)} color={lastResult.market.vix > 22 ? '#fbbf24' : lastResult.market.vix < 14 ? '#60a5fa' : '#30d158'} />
            <Metric lbl="VIX Δ%" value={fmtPct(lastResult.market.vix_delta_pct)} color={lastResult.market.vix_spike ? '#f87171' : 'var(--text)'} />
            <Metric lbl="SPY" value={'$' + fmtN(lastResult.market.spy, 2)} />
            <Metric lbl="IWM" value={'$' + fmtN(lastResult.market.iwm, 2)} />
            <Metric lbl="Régimen" value={lastResult.market.regime} />
            <Metric lbl="Fishing activos" value={lastResult.fishing_active} />
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            {lastResult.market.regime_reason}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Historial decisiones</div>
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>Cargando…</div>
      ) : !decisions.length ? (
        <EmptyState icon="🧠" title="Sin decisiones todavía" subtitle="Pulsa 'Ejecutar Brain' para que analice mercado actual + posiciones." />
      ) : (
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={th}>Hora</th>
              <th style={th}>Sev</th>
              <th style={th}>Acción</th>
              <th style={th}>Estrategia</th>
              <th style={th}>Underlying</th>
              <th style={th}>Régimen</th>
              <th style={{...th, textAlign:'right'}}>Conf</th>
              <th style={th}>Razón</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map(d => {
              const sevColor = d.severity === 'critical' ? '#f87171' : d.severity === 'warn' ? '#fbbf24' : d.severity === 'notice' ? '#60a5fa' : 'var(--text-tertiary)';
              return (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{...td, color: 'var(--text-tertiary)'}}>{(d.ts || '').slice(11, 16)}</td>
                  <td style={{...td, color: sevColor, fontWeight: 700, textTransform: 'uppercase', fontSize: 9}}>{d.severity}</td>
                  <td style={{...td, fontWeight: 700}}>{d.action}</td>
                  <td style={td}>{d.strategy || '—'}</td>
                  <td style={td}>{d.underlying || '—'}</td>
                  <td style={{...td, color: 'var(--text-tertiary)'}}>{d.regime_view || '—'}</td>
                  <td style={{...td, textAlign:'right'}}>{d.confidence != null ? (d.confidence*100).toFixed(0) + '%' : '—'}</td>
                  <td style={{...td, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={d.rationale}>{d.rationale}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── helpers compartidos ──────────────────────────────────────────────────

function ErrorBox({ text }) {
  return (
    <div style={{ padding: 10, marginBottom: 12, background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 6, color: '#f87171', fontSize: 11 }}>
      ❌ {text}
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 420, margin: '0 auto' }}>{subtitle}</div>
    </div>
  );
}

const primaryBtnStyle = {
  padding: '6px 14px', fontSize: 12, fontWeight: 700,
  background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 5, cursor: 'pointer',
};
const secondaryBtnStyle = {
  padding: '6px 14px', fontSize: 12, fontWeight: 700,
  background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer',
};

// ── Today + Paper sub-panels (placeholders) ───────────────────────────────

function TodayPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/auto/daily-pesca`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Cargando…</div>;
  if (error) return <ErrorBox text={error} />;
  if (!data) return null;

  const gateColor = { OPEN: '#30d158', WAIT: '#fbbf24', ABORT: '#f87171' }[data.gate] || 'var(--text)';
  const gateLabel = { OPEN: '🟢 OPEN — pesca día', WAIT: '🟡 WAIT — espera', ABORT: '🔴 ABORT — no abrir hoy' }[data.gate];

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={load} style={secondaryBtnStyle}>🔄 Refrescar</button>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Hoy: {data.day_of_week} · {data.is_pesca_day ? 'pesca day (jue/vie)' : 'no es jue/vie'}
        </span>
      </div>

      {/* Estado mercado + gate */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Mercado live</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
            <Metric lbl="VIX" value={fmtN(data.market.vix, 2)} color={data.market.vix > 22 ? '#f87171' : data.market.vix < 14 ? '#60a5fa' : '#30d158'} />
            <Metric lbl="IWM" value={'$' + fmtN(data.market.iwm, 2)} />
            <Metric lbl="RUT proxy" value={'$' + fmtN(data.market.rut_proxy, 0)} />
            <Metric lbl="RVX proxy" value={fmtN(data.market.rvx_proxy, 1) + '%'} />
          </div>
        </div>
        <div style={{ background: 'var(--card)', border: `2px solid ${gateColor}55`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Veredicto Brain</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: gateColor, marginBottom: 6 }}>{gateLabel}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{data.recommendation}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>Régimen: {data.regime}</div>
        </div>
      </div>

      {/* Candidatos */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Candidatos BPS RUT 28 DTE</div>
      {data.candidates.length === 0 ? (
        <EmptyState icon="🎣" title="Sin candidatos" subtitle="No hay strikes que pasen los filtros defensivos en condiciones actuales." />
      ) : (
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginBottom: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={th}>Short/Long IWM</th>
              <th style={th}>Equiv RUT</th>
              <th style={{...th, textAlign:'right'}}>OTM</th>
              <th style={{...th, textAlign:'right'}}>POP</th>
              <th style={{...th, textAlign:'right'}}>Δ short</th>
              <th style={{...th, textAlign:'right'}}>Credit mid</th>
              <th style={{...th, textAlign:'right'}}>Fishing target</th>
              <th style={{...th, textAlign:'right'}}>Max contr</th>
              <th style={th}>Defense</th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.map((c, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: c.defense_passed ? 'transparent' : 'rgba(248,113,113,.05)' }}>
                <td style={td}>{c.short_strike_iwm}/{c.long_strike_iwm}</td>
                <td style={{...td, color: 'var(--text-tertiary)'}}>{c.short_strike_rut_proxy}/{c.long_strike_rut_proxy}</td>
                <td style={{...td, textAlign:'right'}}>{c.otm_pct}%</td>
                <td style={{...td, textAlign:'right', color: c.pop_at_open >= 95 ? '#30d158' : '#fbbf24'}}>{c.pop_at_open}%</td>
                <td style={{...td, textAlign:'right'}}>{c.delta_target}</td>
                <td style={{...td, textAlign:'right', fontWeight: 700}}>${c.credit_mid}</td>
                <td style={{...td, textAlign:'right', color: '#60a5fa', fontWeight: 700}}>${c.fishing_target_credit}</td>
                <td style={{...td, textAlign:'right'}}>{c.max_contracts_for_10k_bucket}</td>
                <td style={{...td, fontSize: 9}}>
                  {c.defense_passed ? '✅' : '❌'}
                  {!c.defense_checks.pop_floor && ' POP'}
                  {!c.defense_checks.delta_ceiling && ' Δ'}
                  {!c.defense_checks.otm_floor && ' OTM'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Tu patrón */}
      <details style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>📊 Tu patrón histórico (298 trades 2022-2026)</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10, fontSize: 11 }}>
          {Object.entries(data.user_pattern).map(([k, v]) => (
            <div key={k}><b style={{ color: 'var(--text-tertiary)' }}>{k.replace(/_/g, ' ')}:</b> {String(v)}</div>
          ))}
        </div>
      </details>

      <details style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>🛡️ Reglas defensivas aplicadas</summary>
        <ul style={{ marginTop: 10, fontSize: 11, lineHeight: 1.7, paddingLeft: 20 }}>
          {Object.entries(data.defense_rules_applied).map(([k, v]) => (
            <li key={k}><b>{k.replace(/_/g, ' ')}:</b> {v}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function PaperPanel() {
  return (
    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>
      <div style={{ fontSize: 14, marginBottom: 8 }}>📊 Paper trading track record</div>
      <div style={{ fontSize: 11 }}>Disponible en Fase 2 (después de validar estrategias en backtest).<br />Mostrará PnL acumulado de paper trades simulados desde activación.</div>
    </div>
  );
}

// ── Helpers de estilo ─────────────────────────────────────────────────────

function Field({ lbl, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{lbl}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  padding: '5px 8px', fontSize: 12,
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 5, color: 'var(--text)', fontFamily: 'inherit',
};
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const th = { padding: '6px 8px', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)', textAlign: 'left' };
const td = { padding: '5px 8px', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'left' };
