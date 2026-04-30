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

// ── Today + Paper sub-panels (placeholders) ───────────────────────────────

function TodayPanel() {
  return (
    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>
      <div style={{ fontSize: 14, marginBottom: 8 }}>📅 Señales del día</div>
      <div style={{ fontSize: 11 }}>Disponible en Fase 1B (próximamente).<br />Cuando se active, mostrará qué trades sugieren las estrategias HOY según el regime detector.</div>
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
