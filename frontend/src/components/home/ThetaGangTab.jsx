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
  { id: 'multileg',   lbl: '🦎 Multi-leg' },
  { id: 'backtests',  lbl: '🧪 Backtests' },
  { id: 'greeks',     lbl: '📊 Greeks' },
  { id: 'defense',    lbl: '🛡️ Defense' },
  { id: 'paper',      lbl: '📝 Paper' },
  { id: 'live',       lbl: '⚡ Live' },
  { id: 'risk',       lbl: '🏗️ Risk' },
  { id: 'pnl',        lbl: '📈 P&L' },
];

// Sprint 6 — multi-leg strategies catalog (frontend mirror of buildLegs())
const MULTI_LEG_STRATEGIES = [
  { id: 'BPS',            label: 'Bull Put Spread',      tier: '🟢' },
  { id: 'BCS',            label: 'Bear Call Spread',     tier: '🟢' },
  { id: 'IC',             label: 'Iron Condor',          tier: '🟢' },
  { id: 'IF',             label: 'Iron Fly (ATM butterfly)', tier: '🟡' },
  { id: 'JADE_LIZARD',    label: 'Jade Lizard',          tier: '🟢' },
  { id: 'BWB_PUT',        label: 'Broken-Wing BFly Put', tier: '🟡' },
  { id: 'BWB_CALL',       label: 'Broken-Wing BFly Call',tier: '🟡' },
  { id: 'CALENDAR_PUT',   label: 'Put Calendar',         tier: '🟡' },
  { id: 'CALENDAR_CALL',  label: 'Call Calendar',        tier: '🟡' },
  { id: 'DIAGONAL_PUT',   label: 'Diagonal Put',         tier: '🟡' },
  { id: 'RATIO_BACK_PUT', label: 'Ratio Backspread Put', tier: '🔴' },
  { id: 'STRANGLE',       label: 'Short Strangle (no wings)', tier: '🔴' },
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

// ─── 🦎 Multi-leg builder — Sprint 6 ────────────────────────────────────────
function MultiLegSubtab() {
  const [strategy, setStrategy] = useState('JADE_LIZARD');
  const [symbol, setSymbol] = useState('SPY');
  const [dte, setDte] = useState(35);
  const [contracts, setContracts] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const fetchBuild = useCallback(() => {
    setLoading(true);
    setErr(null);
    const params = new URLSearchParams({ strategy, symbol, dte: String(dte), contracts: String(contracts) });
    fetch(`${API_URL}/api/thetagang/multileg/build?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); if (d.error) setErr(d.error); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, [strategy, symbol, dte, contracts]);

  useEffect(() => { fetchBuild(); }, [fetchBuild]);

  return (
    <div style={{ padding: 14 }}>
      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Strategy</span>
          <select value={strategy} onChange={e => setStrategy(e.target.value)}
            style={{ padding: '6px 8px', fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
            {MULTI_LEG_STRATEGIES.map(s => (
              <option key={s.id} value={s.id}>{s.tier} {s.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Symbol</span>
          <select value={symbol} onChange={e => setSymbol(e.target.value)}
            style={{ padding: '6px 8px', fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
            <option>SPY</option><option>QQQ</option><option>IWM</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>DTE</span>
          <input type="number" value={dte} onChange={e => setDte(Number(e.target.value))} min={1} max={120}
            style={{ padding: '6px 8px', fontSize: 12, width: 60, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Contracts</span>
          <input type="number" value={contracts} onChange={e => setContracts(Number(e.target.value))} min={1} max={50}
            style={{ padding: '6px 8px', fontSize: 12, width: 60, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
        </label>
        <button onClick={fetchBuild} disabled={loading}
          style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: 12, background: 'var(--gold, #fbbf24)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          {loading ? '...' : '↻ Build'}
        </button>
      </div>

      {err && <div style={{ padding: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}

      {data && data.ok && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 360px)', gap: 14 }}>
          {/* Left: payoff diagram + summary */}
          <div>
            <PayoffChart spot={data.spot} payoff={data.payoff || buildPayoffFromData(data)}
              breakevens={data.breakevens} maxProfit={data.max_profit} maxLoss={data.max_loss} />
            <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              <div style={{ marginBottom: 4 }}><b style={{ color: 'var(--text-primary)' }}>{data.strategy}</b> · {data.notes}</div>
              {data.ideal_conditions && <div><b style={{ color: 'var(--text-primary)' }}>Ideal:</b> {data.ideal_conditions}</div>}
              {data.warning && <div style={{ marginTop: 4, color: '#ef4444' }}>⚠ {data.warning}</div>}
            </div>
          </div>

          {/* Right: legs + greeks + summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Premium box */}
            <div style={{ padding: 12, background: data.premium_per_share > 0 ? 'rgba(48,209,88,.08)' : 'rgba(239,68,68,.08)', border: `1px solid ${data.premium_per_share > 0 ? 'rgba(48,209,88,.3)' : 'rgba(239,68,68,.3)'}`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>{data.premium_per_share > 0 ? 'NET CREDIT' : 'NET DEBIT'}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: data.premium_per_share > 0 ? '#30d158' : '#ef4444' }}>
                {fmtMoney(Math.abs(data.credit_dollars))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                ${fmtN(Math.abs(data.premium_per_share), 2)}/sh · {contracts} contract{contracts > 1 ? 's' : ''}
              </div>
            </div>

            {/* Max P/L */}
            <div style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Max profit:</span>
                <b style={{ color: '#30d158' }}>{fmtMoney(data.max_profit)} {data.profit_capped ? '⚠' : ''}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Max loss:</span>
                <b style={{ color: '#ef4444' }}>{fmtMoney(data.max_loss)} {data.loss_capped ? '⚠' : ''}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Breakevens:</span>
                <b>{(data.breakevens || []).map(b => '$' + fmtN(b, 2)).join(' · ') || '—'}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Spot · IV:</span>
                <b>${fmtN(data.spot, 2)} · {fmtN(data.iv_index, 1)}%</b>
              </div>
            </div>

            {/* Greeks */}
            {data.greeks_per_spread && (
              <div style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>GREEKS / spread</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  <span>Δ Delta: <b>{fmtN(data.greeks_per_spread.delta, 2)}</b></span>
                  <span>Γ Gamma: <b>{fmtN(data.greeks_per_spread.gamma, 4)}</b></span>
                  <span>Θ Theta: <b style={{ color: data.greeks_per_spread.theta > 0 ? '#30d158' : '#ef4444' }}>{fmtN(data.greeks_per_spread.theta, 2)}</b></span>
                  <span>ν Vega: <b>{fmtN(data.greeks_per_spread.vega, 2)}</b></span>
                </div>
              </div>
            )}

            {/* Legs */}
            <div style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>LEGS ({(data.legs || []).length})</div>
              {(data.legs || []).map((l, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '54px 50px 70px 50px 1fr', gap: 6, padding: '4px 0', borderBottom: i < data.legs.length - 1 ? '1px dashed var(--border)' : 'none' }}>
                  <span style={{ color: l.action === 'sell' ? '#ef4444' : '#30d158', fontWeight: 600 }}>{l.action.toUpperCase()}</span>
                  <span>{l.qty}×</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{l.type === 'call' || l.type === 'C' ? 'CALL' : l.type === 'put' || l.type === 'P' ? 'PUT' : l.type.toUpperCase()}</span>
                  <span><b>${l.strike}</b></span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{l.dte}DTE</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Build payoff array client-side from API data if not provided (build endpoint
// already returns greeks but no payoff, payoff endpoint returns it).
// For this UI we use the build endpoint which doesn't include payoff array.
// Solution: always call payoff endpoint separately. For simplicity, derive
// crude 5-point payoff from max_profit/max_loss/breakevens.
function buildPayoffFromData(data) {
  const spot = data.spot;
  const bes = data.breakevens || [];
  const points = [];
  // Min S = spot * 0.65, Max S = spot * 1.35 — hit 81 points
  for (let i = 0; i < 81; i++) {
    const S = spot * (0.65 + (1.35 - 0.65) * (i / 80));
    let pnl;
    if (bes.length === 1) {
      // BPS-like: max_profit above BE, max_loss far below
      pnl = S > bes[0] ? data.max_profit : Math.max(data.max_loss, data.max_profit - (bes[0] - S) * 100);
    } else if (bes.length === 2) {
      // IC-like: max_profit between BEs
      pnl = S >= bes[0] && S <= bes[1] ? data.max_profit
            : S < bes[0] ? Math.max(data.max_loss, data.max_profit - (bes[0] - S) * 100)
            : Math.max(data.max_loss, data.max_profit - (S - bes[1]) * 100);
    } else {
      pnl = data.max_profit;
    }
    points.push({ S: Math.round(S * 100) / 100, pnl });
  }
  return points;
}

// SVG payoff chart
function PayoffChart({ spot, payoff, breakevens, maxProfit, maxLoss }) {
  const W = 540, H = 220, padL = 50, padR = 14, padT = 14, padB = 28;
  const cw = W - padL - padR, ch = H - padT - padB;
  if (!payoff?.length) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>No payoff data</div>;

  const xs = payoff.map(p => p.S);
  const ys = payoff.map(p => p.pnl);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 0);
  const xScale = (x) => padL + ((x - xMin) / (xMax - xMin)) * cw;
  const yScale = (y) => padT + ch - ((y - yMin) / (yMax - yMin)) * ch;

  // Path: split into positive (green fill) + negative (red fill)
  const zeroY = yScale(0);
  const pathStr = payoff.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.S).toFixed(1)},${yScale(p.pnl).toFixed(1)}`).join(' ');
  // Fill paths
  const fillPos = pathStr + ` L${xScale(xMax).toFixed(1)},${zeroY.toFixed(1)} L${xScale(xMin).toFixed(1)},${zeroY.toFixed(1)} Z`;

  // Y ticks
  const yTicks = [yMin, 0, yMax].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        <defs>
          <clipPath id="pchart-clip"><rect x={padL} y={padT} width={cw} height={ch} /></clipPath>
        </defs>
        {/* Grid bg */}
        <rect x={padL} y={padT} width={cw} height={ch} fill="rgba(255,255,255,.02)" />
        {/* Zero line */}
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeDasharray="2 3" strokeWidth="1" />
        {/* Spot line */}
        <line x1={xScale(spot)} x2={xScale(spot)} y1={padT} y2={padT + ch} stroke="rgba(96,165,250,.5)" strokeDasharray="3 3" strokeWidth="1" />
        <text x={xScale(spot) + 4} y={padT + 10} fill="rgba(96,165,250,1)" fontSize="9">Spot ${spot.toFixed(0)}</text>
        {/* Payoff fill split by zero — simpler approach: clip to positive area only */}
        <g clipPath="url(#pchart-clip)">
          {/* Negative area (below zero) red fill */}
          <path d={pathStr + ` L${xScale(xMax).toFixed(1)},${(padT + ch).toFixed(1)} L${xScale(xMin).toFixed(1)},${(padT + ch).toFixed(1)} Z`}
            fill="rgba(239,68,68,.10)" />
          {/* Positive area cover with green from 0 line up */}
          <rect x={padL} y={padT} width={cw} height={zeroY - padT} fill="rgba(48,209,88,.04)" />
          {/* Payoff line */}
          <path d={pathStr} stroke="var(--gold, #fbbf24)" strokeWidth="2" fill="none" />
        </g>
        {/* Breakevens vertical lines */}
        {(breakevens || []).map((be, i) => (
          <g key={i}>
            <line x1={xScale(be)} x2={xScale(be)} y1={padT} y2={padT + ch} stroke="#fbbf24" strokeDasharray="2 2" strokeWidth="1" opacity="0.6" />
            <text x={xScale(be) + 3} y={padT + ch - 4} fill="#fbbf24" fontSize="9">BE ${be.toFixed(0)}</text>
          </g>
        ))}
        {/* Y ticks */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <text x={padL - 4} y={yScale(v) + 3} fill="var(--text-tertiary)" fontSize="9" textAnchor="end">
              {v >= 0 ? '+' : ''}{v >= 1000 ? (v/1000).toFixed(1) + 'k' : v.toFixed(0)}
            </text>
          </g>
        ))}
        {/* X ticks: spot, min, max + breakevens already labeled */}
        <text x={padL} y={H - 8} fill="var(--text-tertiary)" fontSize="9" textAnchor="start">${xMin.toFixed(0)}</text>
        <text x={W - padR} y={H - 8} fill="var(--text-tertiary)" fontSize="9" textAnchor="end">${xMax.toFixed(0)}</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
        <span>Underlying price at expiry →</span>
        <span>Max profit: <b style={{ color: '#30d158' }}>${maxProfit?.toFixed(0)}</b> · Max loss: <b style={{ color: '#ef4444' }}>${maxLoss?.toFixed(0)}</b></span>
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
    multileg: <MultiLegSubtab />,
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
