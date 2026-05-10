import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';

// ─── 🤡 Theta Gang Tab ──────────────────────────────────────────────────────
// Sistema de options premium selling (Camino C — 6 meses construcción).
// Estructura: 9 sub-tabs cubriendo brain → execution → defense → P&L.
//
// IMPORTANTE — gates de promotion:
//   1. Backtest histórico (Sharpe >1.5, MaxDD <10%)
//   2. Transaction cost realista (no idealized)
//   3. Paper trading 4-8 semanas (matchea backtest ±30%)
//   4. Stress test scenarios (Mar20/Aug24/Apr25)
//   5. Real $500-1000/trade size pequeño 8-12 sem
//
// Ninguna estrategia opera real money sin pasar los 5 gates.
// Etapas: paper → 1 contract real → auto-open BPS-SPY → multi-strategy → full bot.

const SUB_TABS = [
  { id: 'brain',      lbl: '🧠 Brain' },
  { id: 'strategies', lbl: '🎢 Strategies' },
  { id: 'backtests',  lbl: '🧪 Backtests' },
  { id: 'greeks',     lbl: '📊 Greeks' },
  { id: 'defense',    lbl: '🛡️ Defense' },
  { id: 'paper',      lbl: '📝 Paper' },
  { id: 'live',       lbl: '⚡ Live' },
  { id: 'risk',       lbl: '🏗️ Risk' },
  { id: 'pnl',        lbl: '📈 P&L' },
];

function fmtMoney(n) { if (n == null) return '—'; const sign = n < 0 ? '-' : ''; return sign + '$' + Math.abs(n).toLocaleString('es-ES', {maximumFractionDigits: 0}); }
function fmtPct(n) { if (n == null) return '—'; return n.toFixed(1) + '%'; }
function fmtN(n, d = 2) { if (n == null) return '—'; return Number(n).toFixed(d); }

// ─── 🧠 Brain — entries sugeridas hoy ───────────────────────────────────────
function BrainSubtab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/thetagang/brain/scan`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Scanning underlyings...</div>;
  if (err) return <div style={{ padding: 20, color: 'var(--danger)' }}>Error: {err}</div>;

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>Entries hoy — {new Date().toISOString().slice(0,10)}</h3>
        <button onClick={refresh} style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer' }}>↻ Refresh</button>
      </div>
      {(data?.candidates || []).length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
          Sin entries candidatas hoy. IV rank bajo en todos los underlyings monitoreados.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {(data.candidates || []).map((c, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.symbol} — {c.strategy}</div>
                <div style={{ fontSize: 11, color: c.score >= 70 ? '#30d158' : c.score >= 40 ? '#fbbf24' : 'var(--text-tertiary)' }}>
                  Score {c.score}/100
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <span>IVR: <b>{fmtN(c.iv_rank, 0)}</b></span>
                <span>IVP: <b>{fmtN(c.iv_percentile, 0)}</b></span>
                <span>DTE: <b>{c.dte}</b></span>
                <span>Credit: <b>{fmtMoney(c.credit_expected)}</b></span>
                <span>Strikes: <b>{c.strikes_short || '—'}</b></span>
                <span>Δ short: <b>{fmtN(c.delta_short, 2)}</b></span>
                <span>POP: <b>{fmtPct(c.pop)}</b></span>
                <span>Max loss: <b>{fmtMoney(c.max_loss)}</b></span>
              </div>
              {c.notes && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{c.notes}</div>}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 20, padding: 10, background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        💡 <b>Filter:</b> Score &gt;70 = entry candidate (vol crush worth selling). Score 40-70 = neutral. Score &lt;40 = vol comprimido, no premium.
      </div>
    </div>
  );
}

// ─── 🎢 Strategies — catálogo de las 9 ──────────────────────────────────────
function StrategiesSubtab() {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/thetagang/strategies`)
      .then(r => r.json())
      .then(d => { setStrategies(d.strategies || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Cargando catálogo...</div>;

  const STATUS_COLOR = {
    backtesting: '#fbbf24',
    paper: '#60a5fa',
    live: '#30d158',
    rejected: '#ef4444',
    pending: 'var(--text-tertiary)',
  };

  return (
    <div style={{ padding: 14 }}>
      <h3 style={{ margin: '0 0 14px 0', fontSize: 14 }}>Catálogo de estrategias — 5 gates promotion</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        {strategies.map(s => (
          <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
                <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>{s.dte_range}</span>
              </div>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, color: STATUS_COLOR[s.status] || 'var(--text-tertiary)', border: `1px solid ${STATUS_COLOR[s.status] || 'var(--border)'}` }}>
                {s.status}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{s.description}</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              <span>Sharpe: <b>{fmtN(s.sharpe, 2)}</b></span>
              <span>MaxDD: <b>{fmtPct(s.max_dd)}</b></span>
              <span>Win: <b>{fmtPct(s.win_rate)}</b></span>
              <span>Trades: <b>{s.n_trades || '—'}</b></span>
              <span>Last test: <b>{s.last_backtest || '—'}</b></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 🧪 Backtests — placeholder, se construye Sprint 2 ──────────────────────
function BacktestsSubtab() {
  return <PlaceholderTab icon="🧪" title="Backtests" sprint="Sprint 2"
    description="Walk-forward histórico 3 años con transaction costs realistas. Sharpe / MaxDD / Profit Factor por estrategia." />;
}

// ─── 📊 Greeks portfolio — Sprint 2 ──────────────────────────────────────────
function GreeksSubtab() {
  return <PlaceholderTab icon="📊" title="Greeks Portfolio" sprint="Sprint 2"
    description="Net delta/gamma/theta/vega del portfolio agregado. Beta-weighted vs SPY. Targets diarios theta income." />;
}

// ─── 🛡️ Defense — Sprint 3 ──────────────────────────────────────────────────
function DefenseSubtab() {
  return <PlaceholderTab icon="🛡️" title="Defense Playbook" sprint="Sprint 3"
    description="Posiciones challenged + recomendación automática (roll/butterfly/conversion). Auto-Close engine extendido." />;
}

// ─── 📝 Paper — Sprint 4 ────────────────────────────────────────────────────
function PaperSubtab() {
  return <PlaceholderTab icon="📝" title="Paper Trading" sprint="Sprint 4"
    description="Trades virtuales con execution mock. Validación 4-8 semanas antes promote real. Match vs backtest ±30%." />;
}

// ─── ⚡ Live — Sprint 11 ────────────────────────────────────────────────────
function LiveSubtab() {
  return <PlaceholderTab icon="⚡" title="Live Trades" sprint="Sprint 11"
    description="Trades reales en Tastytrade. Auto-open con guard rails completos. Solo después de pasar 5 gates promotion." />;
}

// ─── 🏗️ Risk — Sprint 9 ────────────────────────────────────────────────────
function RiskSubtab() {
  return <PlaceholderTab icon="🏗️" title="Risk Management" sprint="Sprint 9"
    description="Guard rails (sizing 5% NAV, VIX kill 30, concurrent 8 max, drawdown kill 10%). Kelly sizing con haircut. Correlation matrix dynamic." />;
}

// ─── 📈 P&L — Sprint 13 ────────────────────────────────────────────────────
function PnLSubtab() {
  return <PlaceholderTab icon="📈" title="Performance Attribution" sprint="Sprint 13"
    description="P&L por estrategia. Real vs paper match. Sharpe / Sortino / Max DD. Live scoreboard." />;
}

// ─── Placeholder reusable ──────────────────────────────────────────────────
function PlaceholderTab({ icon, title, sprint, description }) {
  return (
    <div style={{ padding: 30, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 14 }}>{icon}</div>
      <h3 style={{ margin: '0 0 8px 0', fontSize: 16, color: 'var(--text-primary)' }}>{title}</h3>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14 }}>📦 {sprint} — pendiente construcción</div>
      <div style={{ maxWidth: 500, margin: '0 auto', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {description}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────
export default function ThetaGangTab() {
  const [subTab, setSubTab] = useState('brain');

  const subTabComponents = {
    brain: <BrainSubtab />,
    strategies: <StrategiesSubtab />,
    backtests: <BacktestsSubtab />,
    greeks: <GreeksSubtab />,
    defense: <DefenseSubtab />,
    paper: <PaperSubtab />,
    live: <LiveSubtab />,
    risk: <RiskSubtab />,
    pnl: <PnLSubtab />,
  };

  return (
    <div style={{ padding: 14 }}>
      {/* Disclaimer banner */}
      <div style={{
        marginBottom: 14,
        padding: '10px 14px',
        background: 'rgba(239,68,68,.08)',
        border: '1px solid rgba(239,68,68,.3)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--text-secondary)',
        lineHeight: 1.55,
      }}>
        🤡 <b>Theta Gang — Camino C, 6 meses construcción.</b> Sistema de premium selling
        Tastytrade-style con backtest riguroso, paper trading, defense automation y
        guard rails. <b>Ninguna estrategia opera real $$ sin pasar los 5 gates de promotion</b>
        (backtest Sharpe&gt;1.5, transaction costs realistas, paper 4-8 sem matchea ±30%,
        stress test crashes, real $500-1k pequeño 8-12 sem).
      </div>

      {/* Sub-tabs nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              borderBottom: subTab === t.id ? '2px solid var(--gold, #fbbf24)' : '2px solid transparent',
              background: 'transparent',
              color: subTab === t.id ? 'var(--gold, #fbbf24)' : 'var(--text-secondary)',
              cursor: 'pointer',
              marginBottom: -1,
              whiteSpace: 'nowrap',
            }}>
            {t.lbl}
          </button>
        ))}
      </div>

      {/* Active sub-tab */}
      {subTabComponents[subTab]}
    </div>
  );
}
