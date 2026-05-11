import { useState, useEffect, useCallback, useRef, useId } from 'react';
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
  { id: 'ideas',      lbl: '💡 Cartera Ideas' },
  { id: 'openopts',   lbl: '🎯 Open Options' },
  { id: 'multileg',   lbl: '🦎 Multi-leg' },
  { id: 'wheel',      lbl: '🎡 Wheel' },
  { id: 'hedge',      lbl: '🛡️ Tail Hedge' },
  { id: 'backtests',  lbl: '🧪 Backtests' },
  { id: 'greeks',     lbl: '📊 Greeks' },
  { id: 'defense',    lbl: '🛡️ Defense' },
  { id: 'paper',      lbl: '📝 Paper' },
  { id: 'live',       lbl: '⚡ Live' },
  { id: 'risk',       lbl: '🏗️ Risk' },
  { id: 'pnl',        lbl: '📈 P&L' },
];

// Sprint 6+7 — multi-leg strategies catalog (frontend mirror of buildLegs())
const MULTI_LEG_STRATEGIES = [
  // Credit verticals
  { id: 'BPS',            label: 'Bull Put Spread (credit)',  tier: '🟢' },
  { id: 'BCS',            label: 'Bear Call Spread (credit)', tier: '🟢' },
  // Debit verticals (Sprint 7)
  { id: 'BCS_DEBIT',      label: 'Bull Call Spread (debit)',  tier: '🟢' },
  { id: 'BPS_DEBIT',      label: 'Bear Put Spread (debit)',   tier: '🟢' },
  // Condors
  { id: 'IC',             label: 'Iron Condor',               tier: '🟢' },
  { id: 'IF',             label: 'Iron Fly (ATM butterfly)',  tier: '🟡' },
  { id: 'REVERSE_IF',     label: 'Reverse Iron Fly',          tier: '🔴' },
  // Lizards & hybrids
  { id: 'JADE_LIZARD',    label: 'Jade Lizard',               tier: '🟢' },
  { id: 'BIG_LIZARD',     label: 'Big Lizard',                tier: '🟡' },
  // Butterflies
  { id: 'BWB_PUT',        label: 'Broken-Wing BFly Put',      tier: '🟡' },
  { id: 'BWB_CALL',       label: 'Broken-Wing BFly Call',     tier: '🟡' },
  { id: 'LONG_FLY_CALL',  label: 'Long Call Butterfly',       tier: '🟡' },
  { id: 'LONG_FLY_PUT',   label: 'Long Put Butterfly',        tier: '🟡' },
  // Calendars/diagonals
  { id: 'CALENDAR_PUT',   label: 'Put Calendar',              tier: '🟡' },
  { id: 'CALENDAR_CALL',  label: 'Call Calendar',             tier: '🟡' },
  { id: 'DIAGONAL_PUT',   label: 'Diagonal Put',              tier: '🟡' },
  // Straddles/strangles
  { id: 'LONG_STRADDLE',  label: 'Long Straddle',             tier: '🟡' },
  { id: 'LONG_STRANGLE',  label: 'Long Strangle',             tier: '🟡' },
  { id: 'STRANGLE',       label: 'Short Strangle (no wings)', tier: '🔴' },
  // Ratios & defensive
  { id: 'RATIO_BACK_PUT', label: 'Ratio Backspread Put',      tier: '🔴' },
  { id: 'RISK_REVERSAL',  label: 'Risk Reversal',             tier: '🔴' },
  { id: 'COLLAR',         label: 'Collar (defensive)',        tier: '🟢' },
  { id: 'COVERED_CALL',   label: 'Covered Call',              tier: '🟢' },
];

function fmtMoney(n) { if (n == null) return '—'; const sign = n < 0 ? '-' : ''; return sign + '$' + Math.abs(n).toLocaleString('es-ES', {maximumFractionDigits: 0}); }
function fmtPct(n) { if (n == null) return '—'; return n.toFixed(1) + '%'; }
function fmtN(n, d = 2) { if (n == null) return '—'; return Number(n).toFixed(d); }

// Sprint 15 audit fix L1: card style hoisted module-level (DRY).
// Antes redefinido localmente en 8+ componentes (re-allocated per render).
const CARD = Object.freeze({ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 });

// ─── 🧠 Brain — entries sugeridas hoy ───────────────────────────────────────
function BrainSubtab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  // Sprint cleanup audit H2/M7: AbortController + ref para evitar race conditions
  const abortRef = useRef(null);

  const refresh = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true); setErr(null);
    fetch(`${API_URL}/api/thetagang/brain/scan`, { signal: abortRef.current.signal })
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d); setLoading(false); })
      .catch(e => { if (e.name !== 'AbortError') { setErr(e.message); setLoading(false); } });
  }, []);

  useEffect(() => {
    refresh();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [refresh]);

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Scanning underlyings...</div>;
  if (err) return <div style={{ padding: 20, color: 'var(--danger, #ef4444)' }}>Error: {err}</div>;

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>Entries hoy — {new Date().toISOString().slice(0,10)}</h3>
        <button onClick={refresh} disabled={loading} style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--border)', background: 'transparent', color: loading ? 'var(--text-tertiary)' : 'var(--text-secondary)', borderRadius: 4, cursor: loading ? 'wait' : 'pointer' }}>↻ Refresh</button>
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
  const [err, setErr] = useState(null);
  // Sprint 15 — Tournament leaderboard
  const [leaderboard, setLeaderboard] = useState([]);
  const [lastTournamentRun, setLastTournamentRun] = useState(null);
  const [tournamentBusy, setTournamentBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/thetagang/strategies`).then(r => r.json()),
      fetch(`${API_URL}/api/thetagang/tournament/leaderboard?limit=15`).then(r => r.json()).catch(() => null),
    ]).then(([sR, lR]) => {
      if (sR.error) setErr(sR.error); else setStrategies(sR.strategies || []);
      setLeaderboard(lR?.leaderboard || []);
      setLastTournamentRun(lR?.last_run || null);
      setLoading(false);
    }).catch(e => { setErr(e.message); setLoading(false); });
  }, []);

  const runTournament = async () => {
    setTournamentBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/tournament/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: ['SPY', 'QQQ', 'IWM'], years_back: 3 }),
      });
      const j = await r.json();
      if (j.ok) {
        // Re-fetch leaderboard
        const lR = await fetch(`${API_URL}/api/thetagang/tournament/leaderboard?limit=15`).then(r => r.json());
        setLeaderboard(lR?.leaderboard || []);
        setLastTournamentRun(lR?.last_run || null);
      } else {
        setErr(j.error || 'Tournament failed');
      }
    } catch (e) { setErr(e.message); }
    setTournamentBusy(false);
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Cargando catálogo...</div>;
  if (err) return <div style={{ padding: 12, margin: 14, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>⚠ Error: {err}</div>;

  const STATUS_COLOR = {
    backtesting: '#fbbf24',
    paper: '#60a5fa',
    live: '#30d158',
    rejected: '#ef4444',
    pending: 'var(--text-tertiary)',
  };

  return (
    <div style={{ padding: 14 }}>
      {/* Sprint 15 — Tournament leaderboard */}
      <div style={{ ...CARD, marginBottom: 14, borderColor: leaderboard.length > 0 ? 'var(--gold, #fbbf24)' : 'var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>🏆 Strategy Tournament — Walk-forward ranking</div>
          <button onClick={runTournament} disabled={tournamentBusy} style={{ padding: '4px 12px', fontSize: 11, background: 'var(--gold, #fbbf24)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>{tournamentBusy ? 'Corriendo... (~30s)' : '▶ Run tournament'}</button>
        </div>
        {leaderboard.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            No hay rankings aún. Click "Run tournament" → ejecuta walk-forward de 81 configs (3 symbols × 3 DTEs × 3 deltas × 3 TPs) sobre últimos 3 años de data.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>Last run: {lastTournamentRun?.slice(0, 19).replace('T', ' ')}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--bg-primary)', textAlign: 'left' }}>
                  <th style={{ padding: 4 }}>#</th><th>Strategy</th><th>Sym</th><th>Score</th><th>N</th><th>Win%</th><th>Sharpe</th><th>P&L</th><th>MaxDD</th><th>PF</th><th>Verdict</th>
                </tr></thead>
                <tbody>
                  {leaderboard.map((r, i) => (
                    <tr key={r.strategy_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 4, fontWeight: 700, color: i < 3 ? 'var(--gold, #fbbf24)' : 'var(--text-secondary)' }}>{r.rank}</td>
                      <td style={{ padding: 4, fontSize: 10 }}>{r.strategy_id?.slice(0, 24)}</td>
                      <td>{r.symbol}</td>
                      <td style={{ fontWeight: 700, color: r.score >= 50 ? '#30d158' : r.score >= 30 ? '#fbbf24' : '#ef4444' }}>{Math.round(r.score)}</td>
                      <td>{r.n_trades}</td>
                      <td>{fmtPct(r.win_rate)}</td>
                      <td>{fmtN(r.sharpe, 2)}</td>
                      <td style={{ color: r.total_pnl > 0 ? '#30d158' : '#ef4444' }}>{fmtMoney(r.total_pnl)}</td>
                      <td>{fmtMoney(r.max_dd)}</td>
                      <td>{fmtN(r.profit_factor, 2)}</td>
                      <td style={{ fontSize: 9, color: r.verdict?.startsWith('PASS') ? '#30d158' : 'var(--text-tertiary)' }}>{r.verdict?.slice(0, 12)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

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

  // Sprint 13 audit fix H1: only fetch on mount + when user clicks Build button.
  // Previously fired on every keystroke (DTE 35→40 = 3 fetches while typing).
  useEffect(() => { fetchBuild(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Sprint cleanup audit M1: useId() ensures unique clipPath id even if multiple
  // PayoffCharts mount simultaneously (was hardcoded 'pchart-clip' → SVG corruption).
  const clipId = `pchart-clip-${useId().replace(/:/g, '')}`;
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
          <clipPath id={clipId}><rect x={padL} y={padT} width={cw} height={ch} /></clipPath>
        </defs>
        {/* Grid bg */}
        <rect x={padL} y={padT} width={cw} height={ch} fill="rgba(255,255,255,.02)" />
        {/* Zero line */}
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeDasharray="2 3" strokeWidth="1" />
        {/* Spot line */}
        <line x1={xScale(spot)} x2={xScale(spot)} y1={padT} y2={padT + ch} stroke="rgba(96,165,250,.5)" strokeDasharray="3 3" strokeWidth="1" />
        <text x={xScale(spot) + 4} y={padT + 10} fill="rgba(96,165,250,1)" fontSize="9">Spot ${spot.toFixed(0)}</text>
        {/* Payoff fill split by zero — simpler approach: clip to positive area only */}
        <g clipPath={`url(#${clipId})`}>
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

// ─── 🧪 Backtests — Sprint 8 (stress + walk-forward + Monte Carlo) ──────────
function BacktestsSubtab() {
  const [mode, setMode] = useState('stress');
  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {[
          { id: 'stress', lbl: '🔥 Stress periods' },
          { id: 'wf',     lbl: '🚶 Walk-forward' },
          { id: 'mc',     lbl: '🎲 Monte Carlo' },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: mode === m.id ? 'var(--gold, #fbbf24)' : 'transparent',
              color: mode === m.id ? '#000' : 'var(--text-secondary)',
              border: '1px solid ' + (mode === m.id ? 'var(--gold, #fbbf24)' : 'var(--border)'),
              borderRadius: 4,
            }}>{m.lbl}</button>
        ))}
      </div>
      {mode === 'stress' && <StressTestPanel />}
      {mode === 'wf' && <WalkForwardPanel />}
      {mode === 'mc' && <MonteCarloPanel />}
    </div>
  );
}

function StressTestPanel() {
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState('covid_2020');
  const [symbol, setSymbol] = useState('SPY');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/thetagang/backtest/stress-periods`)
      .then(r => r.json())
      .then(d => setPeriods([...(d.stress_periods || []), ...(d.calm_periods || [])]))
      // Sprint cleanup audit M5: fallback period si endpoint falla
      .catch(() => setPeriods([
        { id: 'covid_2020', label: 'COVID Crash (Feb-Apr 2020) — fallback' },
        { id: 'tariffs_2025', label: 'Trump Tariffs (Apr 2025) — fallback' },
      ]));
  }, []);

  const run = useCallback(() => {
    setLoading(true); setErr(null); setData(null);
    fetch(`${API_URL}/api/thetagang/backtest/stress-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period_id: periodId, symbol, contracts: 1 }),
    }).then(r => r.json())
      .then(d => { setData(d); setLoading(false); if (d.error) setErr(d.error); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, [periodId, symbol]);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, flex: 1, minWidth: 280 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Stress period</span>
          <select value={periodId} onChange={e => setPeriodId(e.target.value)}
            style={{ padding: '6px 8px', fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
            {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Symbol</span>
          <select value={symbol} onChange={e => setSymbol(e.target.value)}
            style={{ padding: '6px 8px', fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
            <option>SPY</option><option>QQQ</option><option>IWM</option>
          </select>
        </label>
        <button onClick={run} disabled={loading}
          style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: 12, background: 'var(--gold, #fbbf24)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          {loading ? 'Running...' : '▶ Run stress test'}
        </button>
      </div>

      {err && <div style={{ padding: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}
      {data?.ok && <BacktestResults data={data} />}
    </div>
  );
}

function WalkForwardPanel() {
  const [symbol, setSymbol] = useState('SPY');
  const [trainMonths, setTrainMonths] = useState(12);
  const [testMonths, setTestMonths] = useState(3);
  const [yearsBack, setYearsBack] = useState(5);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const run = useCallback(() => {
    setLoading(true); setErr(null); setData(null);
    fetch(`${API_URL}/api/thetagang/backtest/walk-forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, train_months: trainMonths, test_months: testMonths, years_back: yearsBack }),
    }).then(r => r.json())
      .then(d => { setData(d); setLoading(false); if (d.error) setErr(d.error); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, [symbol, trainMonths, testMonths, yearsBack]);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Symbol</span>
          <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{ padding: '6px 8px', fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
            <option>SPY</option><option>QQQ</option><option>IWM</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Train (mo)</span>
          <input type="number" value={trainMonths} onChange={e => setTrainMonths(Number(e.target.value))} min={3} max={36} style={{ padding: '6px 8px', fontSize: 12, width: 60, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Test (mo)</span>
          <input type="number" value={testMonths} onChange={e => setTestMonths(Number(e.target.value))} min={1} max={12} style={{ padding: '6px 8px', fontSize: 12, width: 60, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Years back</span>
          <input type="number" value={yearsBack} onChange={e => setYearsBack(Number(e.target.value))} min={2} max={15} style={{ padding: '6px 8px', fontSize: 12, width: 60, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
        </label>
        <button onClick={run} disabled={loading} style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: 12, background: 'var(--gold, #fbbf24)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          {loading ? 'Running...' : '▶ Run walk-forward'}
        </button>
      </div>
      {err && <div style={{ padding: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}
      {data?.ok && (
        <div>
          <div style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14, fontSize: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <Stat label="Windows" value={data.n_windows} />
              <Stat label="Consistency" value={data.consistency_pct + '%'} color={data.consistency_pct >= 60 ? '#30d158' : '#fbbf24'} />
              <Stat label="OOS Sharpe" value={data.overall_oos_stats?.sharpe} />
              <Stat label="OOS Total P&L" value={'$' + (data.overall_oos_stats?.total_pnl || 0).toLocaleString()} />
              <Stat label="Verdict" value={data.overall_oos_verdict?.verdict} color={data.overall_oos_verdict?.verdict?.startsWith('PASS') ? '#30d158' : '#ef4444'} small />
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Test window</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>N trades</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Win %</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total P&L</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Sharpe</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>MaxDD</th>
                </tr>
              </thead>
              <tbody>
                {data.windows.map((w, i) => (
                  <tr key={i} style={{ borderBottom: '1px dashed var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{w.window.test_start} → {w.window.test_end}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{w.n_trades}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{w.stats.win_rate}%</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: w.stats.total_pnl > 0 ? '#30d158' : '#ef4444' }}>${w.stats.total_pnl}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{w.stats.sharpe}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>${w.stats.max_dd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MonteCarloPanel() {
  const [symbol, setSymbol] = useState('SPY');
  const [nSims, setNSims] = useState(10000);
  const [yearsBack, setYearsBack] = useState(5);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const run = useCallback(() => {
    setLoading(true); setErr(null); setData(null);
    fetch(`${API_URL}/api/thetagang/backtest/monte-carlo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, n_sims: nSims, years_back: yearsBack }),
    }).then(r => r.json())
      .then(d => { setData(d); setLoading(false); if (d.error) setErr(d.error); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, [symbol, nSims, yearsBack]);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Symbol</span>
          <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{ padding: '6px 8px', fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
            <option>SPY</option><option>QQQ</option><option>IWM</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Sims</span>
          <input type="number" value={nSims} onChange={e => setNSims(Number(e.target.value))} min={100} max={50000} step={1000} style={{ padding: '6px 8px', fontSize: 12, width: 80, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Years back</span>
          <input type="number" value={yearsBack} onChange={e => setYearsBack(Number(e.target.value))} min={2} max={15} style={{ padding: '6px 8px', fontSize: 12, width: 60, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
        </label>
        <button onClick={run} disabled={loading} style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: 12, background: 'var(--gold, #fbbf24)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          {loading ? 'Running...' : `▶ Run ${nSims.toLocaleString()} sims`}
        </button>
      </div>
      {err && <div style={{ padding: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}
      {data?.ok && (
        <div>
          <div style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>BASE BACKTEST ({data.n_base_trades} trades over {data.years_back}y)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, fontSize: 12 }}>
              <Stat label="Total P&L" value={'$' + (data.base_stats?.total_pnl || 0).toLocaleString()} />
              <Stat label="Win rate" value={data.base_stats?.win_rate + '%'} />
              <Stat label="Sharpe" value={data.base_stats?.sharpe} />
              <Stat label="Max DD" value={'$' + (data.base_stats?.max_dd || 0)} />
              <Stat label="Profit factor" value={data.base_stats?.profit_factor} />
            </div>
          </div>
          <div style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>{nSims.toLocaleString()} BOOTSTRAP SIMULATIONS</div>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>Percentile</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total P&L</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Max DD</th>
                </tr>
              </thead>
              <tbody>
                {/* Sprint 13 audit fix H5: safe accessors for partial API responses */}
                {(() => {
                  const mc = data.monte_carlo || {};
                  const safeMoney = (v) => v == null ? '—' : '$' + Number(v).toLocaleString();
                  const safeNum = (v) => v == null ? '—' : Number(v).toFixed(0);
                  const p05Color = (mc.total_pnl_p05 ?? 0) < 0 ? '#ef4444' : '#30d158';
                  return <>
                    <tr><td style={{ padding: '6px 8px' }}>p05 (very bad)</td><td style={{ padding: '6px 8px', textAlign: 'right', color: p05Color }}>{safeMoney(mc.total_pnl_p05)}</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td></tr>
                    <tr><td style={{ padding: '6px 8px' }}>p25</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>{safeMoney(mc.total_pnl_p25)}</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td></tr>
                    <tr><td style={{ padding: '6px 8px' }}>p50 (median)</td><td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{safeMoney(mc.total_pnl_p50)}</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>{safeNum(mc.max_dd_p50)}</td></tr>
                    <tr><td style={{ padding: '6px 8px' }}>p75</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>{safeMoney(mc.total_pnl_p75)}</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td></tr>
                    <tr><td style={{ padding: '6px 8px' }}>p95 (very good)</td><td style={{ padding: '6px 8px', textAlign: 'right', color: '#30d158' }}>{safeMoney(mc.total_pnl_p95)}</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>{safeNum(mc.max_dd_p95)}</td></tr>
                    <tr><td style={{ padding: '6px 8px', color: '#ef4444' }}>p99 max DD (worst case)</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>—</td><td style={{ padding: '6px 8px', textAlign: 'right', color: '#ef4444' }}>{safeNum(mc.max_dd_p99)}</td></tr>
                  </>;
                })()}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 12, background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {(() => {
              const mc = data.monte_carlo || {};
              const profProb = mc.prob_profitable_pct ?? 0;
              const blowProb = mc.prob_blowup_pct ?? 0;
              return <>
                <div style={{ marginBottom: 4 }}><b>Probability profitable</b>: <span style={{ color: profProb > 70 ? '#30d158' : profProb > 50 ? '#fbbf24' : '#ef4444' }}>{profProb}%</span></div>
                <div style={{ marginBottom: 4 }}><b>Probability blowup (loss &gt;$10k)</b>: <span style={{ color: blowProb > 5 ? '#ef4444' : 'var(--text-primary)' }}>{blowProb}%</span></div>
                <div>{data.interpretation?.edge_quality || '—'}</div>
              </>;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function BacktestResults({ data }) {
  return (
    <div>
      <div style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{data.period?.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>{data.period?.description}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, fontSize: 12 }}>
          <Stat label="Trades" value={data.n_trades} />
          <Stat label="Total P&L" value={'$' + (data.stats?.total_pnl || 0).toLocaleString()} color={(data.stats?.total_pnl || 0) > 0 ? '#30d158' : '#ef4444'} />
          <Stat label="Win rate" value={(data.stats?.win_rate || 0) + '%'} />
          <Stat label="Sharpe" value={data.stats?.sharpe} />
          <Stat label="Max DD" value={'$' + (data.stats?.max_dd || 0)} color="#ef4444" />
          <Stat label="Profit factor" value={data.stats?.profit_factor} />
          <Stat label="Verdict" value={data.verdict?.verdict} color={data.verdict?.verdict?.startsWith('PASS') ? '#30d158' : '#ef4444'} small />
        </div>
      </div>
      {data.trades?.length > 0 && (
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>{/* Sprint 15 audit fix L3: overflowY explicito para mobile */}
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Entry</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Exit</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Days</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Strikes</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Credit</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>P&L</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Exit reason</th>
            </tr></thead>
            <tbody>
              {data.trades.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px dashed var(--border)' }}>
                  <td style={{ padding: '4px 8px' }}>{t.entry_date}</td>
                  <td style={{ padding: '4px 8px' }}>{t.exit_date}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{t.hold_days}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{t.Kshort}/{t.Klong}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>${t.credit}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: t.pnl > 0 ? '#30d158' : '#ef4444' }}>${t.pnl}</td>
                  <td style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-tertiary)' }}>{t.exit_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color, small }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: small ? 11 : 16, fontWeight: 600, color: color || 'var(--text-primary)' }}>{value ?? '—'}</div>
    </div>
  );
}

// ─── 📊 Greeks portfolio — implementación real (Sprint cleanup) ─────────────
function GreeksSubtab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true); setErr(null);
    fetch(`${API_URL}/api/thetagang/greeks/portfolio`)
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const card = CARD;  // Sprint 15 audit fix L1: hoisted module-level

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Cargando Greeks portfolio…</div>;
  if (err) return <div style={{ padding: 12, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12, margin: 14 }}>⚠ {err}</div>;
  if (!data?.ok) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Sin datos.</div>;

  const ng = data.net_greeks || {};
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{data.positions_count || 0} posiciones · SPY ${fmtN(data.spy_price, 2)}</div>
        <button onClick={refresh} style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer' }}>↻ Refresh</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>NET DELTA</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmtN(ng.delta, 0)}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>NET GAMMA</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmtN(ng.gamma, 3)}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>NET THETA</div><div style={{ fontSize: 18, fontWeight: 700, color: ng.theta > 0 ? '#30d158' : '#ef4444' }}>{fmtN(ng.theta, 2)}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>NET VEGA</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmtN(ng.vega, 2)}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>θ/día $</div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold, #fbbf24)' }}>{data.theta_per_day_dollars_human || '—'}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>β-Δ vs SPY</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmtN(data.beta_weighted_delta_spy, 0)}</div></div>
      </div>
      {(data.positions || []).length > 0 && (
        <div style={{ ...card, padding: 0, overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg-primary)', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>Symbol</th><th>Type</th><th>Strike</th><th>Exp</th><th>DTE</th><th>Qty</th><th>Δ</th><th>Γ</th><th>Θ</th><th>ν</th><th>Δ$</th>
            </tr></thead>
            <tbody>
              {(data.positions || []).map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 4, fontWeight: 600 }}>{p.symbol?.slice(0, 12)}</td>
                  <td>{p.opt_type || (p.instrument_type === 'Equity' ? 'EQ' : '—')}</td>
                  <td>{p.strike || '—'}</td>
                  <td>{p.expiry?.slice(5) || '—'}</td>
                  <td>{p.dte || '—'}</td>
                  <td>{p.qty}</td>
                  <td>{fmtN(p.delta, 2)}</td>
                  <td>{fmtN(p.gamma, 3)}</td>
                  <td style={{ color: p.theta > 0 ? '#30d158' : '#ef4444' }}>{fmtN(p.theta, 2)}</td>
                  <td>{fmtN(p.vega, 2)}</td>
                  <td>{fmtMoney(p.delta_dollars)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── 🛡️ Defense — implementación real (Sprint cleanup) ──────────────────────
function DefenseSubtab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [rollSugg, setRollSugg] = useState({});

  const refresh = useCallback(() => {
    setLoading(true); setErr(null);
    fetch(`${API_URL}/api/thetagang/defense/eval`)
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const requestRoll = async (group) => {
    try {
      const r = await fetch(`${API_URL}/api/thetagang/defense/roll-suggestion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ underlying: group.underlying, current_strike: group.short_strike, current_expiry: group.expiry, opt_type: group.opt_type }),
      });
      const j = await r.json();
      setRollSugg({ ...rollSugg, [group.underlying + group.short_strike]: j });
    } catch (e) { setRollSugg({ ...rollSugg, [group.underlying + group.short_strike]: { error: e.message } }); }
  };

  const card = CARD;  // Sprint 15 audit fix L1: hoisted module-level
  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Evaluando defense…</div>;
  if (err) return <div style={{ padding: 12, margin: 14, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>⚠ {err}</div>;

  const positions = data?.positions || [];
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{positions.length} posiciones challenged</div>
        <button onClick={refresh} style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer' }}>↻ Refresh</button>
      </div>
      {positions.length === 0 ? (
        <div style={{ ...card, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>No hay posiciones que requieran defensa. Todas dentro de límites.</div>
      ) : (
        positions.map((p, i) => {
          const sevColor = p.severity === 'CRITICAL' ? '#ef4444' : p.severity === 'WATCH' ? '#fbbf24' : '#30d158';
          const key = p.underlying + p.short_strike;
          return (
            <div key={i} style={{ ...card, borderColor: sevColor }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{p.underlying} {p.short_strike}{p.opt_type} · {p.dte}d</div>
                <span style={{ fontSize: 11, padding: '2px 8px', background: sevColor, color: '#000', borderRadius: 4, fontWeight: 700 }}>{p.severity}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {p.action} · Δ {fmtN(p.delta, 2)} · {fmtPct(p.dist_otm_pct)} OTM · POP {fmtPct(p.pop)}
              </div>
              {p.rationale && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic', marginBottom: 6 }}>{p.rationale}</div>}
              {(p.severity === 'CRITICAL' || p.severity === 'WATCH') && (
                <button onClick={() => requestRoll(p)} style={{ padding: '4px 10px', fontSize: 11, background: 'var(--gold, #fbbf24)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Sugerir Roll</button>
              )}
              {rollSugg[key] && (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-primary)', borderRadius: 4, fontSize: 11 }}>
                  {rollSugg[key].error ? <span style={{ color: '#ef4444' }}>⚠ {rollSugg[key].error}</span> :
                    <span>Roll a {rollSugg[key].new_strike} {rollSugg[key].new_expiry} ({rollSugg[key].new_dte}d) · credit ${fmtN(rollSugg[key].expected_credit, 2)}</span>}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── 📝 Paper — implementación real (Sprint cleanup) ────────────────────────
function PaperSubtab() {
  const [open, setOpen] = useState([]);
  const [scoreboard, setScoreboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  // Sprint 14 — Auto Paper state
  const [autoPaperEnabled, setAutoPaperEnabled] = useState(false);
  const [autoPaperLog, setAutoPaperLog] = useState([]);
  const [autoPaperBusy, setAutoPaperBusy] = useState(false);
  const [autoPaperLastRun, setAutoPaperLastRun] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [oR, sR, cfgR, logR] = await Promise.all([
        fetch(`${API_URL}/api/thetagang/paper/positions`).then(r => r.json()),
        fetch(`${API_URL}/api/thetagang/paper/scoreboard`).then(r => r.json()),
        fetch(`${API_URL}/api/thetagang/auto-paper/config`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/auto-paper/log?limit=20`).then(r => r.json()).catch(() => null),
      ]);
      if (oR.error) setErr(oR.error);
      setOpen(oR.positions || []);
      setScoreboard(sR);
      setAutoPaperEnabled(!!cfgR?.enabled);
      setAutoPaperLog(logR?.log || []);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toggleAutoPaper = async () => {
    setAutoPaperBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/auto-paper/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !autoPaperEnabled }),
      });
      const j = await r.json();
      if (j.ok) setAutoPaperEnabled(j.enabled);
      else setErr(j.error || 'Toggle auto-paper failed');  // Sprint 19 audit fix M3
    } catch (e) { setErr(e.message); }
    setAutoPaperBusy(false);
  };

  const runAutoPaperNow = async (dryRun = false) => {
    setAutoPaperBusy(true);
    try {
      // Pre-fetch state client-side (CF self-fetch en fetch handler tiene loop
      // detection que devuelve vacío; pasar pre-fetched state evita el problema).
      const [brainScan, capsStatus, paperPositions, strategiesResp] = await Promise.all([
        fetch(`${API_URL}/api/thetagang/brain/scan`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/risk/caps-status`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/paper/positions`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/strategies`).then(r => r.json()).catch(() => null),
      ]);
      const r = await fetch(`${API_URL}/api/thetagang/auto-paper/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          force: true, dry_run: dryRun,
          state: { brain_scan: brainScan, caps_status: capsStatus, paper_positions: paperPositions, strategies: strategiesResp },
        }),
      });
      const j = await r.json();
      setAutoPaperLastRun({ ...j, dryRun });
      if (!dryRun) refresh();
    } catch (e) { setAutoPaperLastRun({ error: e.message }); }
    setAutoPaperBusy(false);
  };

  const card = CARD;  // Sprint 15 audit fix L1: hoisted module-level
  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Cargando paper trades…</div>;
  if (err) return <div style={{ padding: 12, margin: 14, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>⚠ {err}</div>;

  const stats = scoreboard?.aggregated || {};
  const byStrat = scoreboard?.by_strategy || [];
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Sprint 14 — Auto Paper control panel */}
      <div style={{ ...card, borderColor: autoPaperEnabled ? 'rgba(48,209,88,.4)' : 'var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>🤖 Auto Paper Trading</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: autoPaperEnabled ? '#30d158' : 'var(--text-tertiary)', fontWeight: 600 }}>{autoPaperEnabled ? '🟢 ON' : '⚫ OFF'}</span>
            <button onClick={toggleAutoPaper} disabled={autoPaperBusy} style={{ padding: '4px 10px', fontSize: 11, background: autoPaperEnabled ? 'transparent' : 'var(--gold, #fbbf24)', color: autoPaperEnabled ? 'var(--text-secondary)' : '#000', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>{autoPaperEnabled ? 'Desactivar' : 'Activar'}</button>
            <button onClick={() => runAutoPaperNow(true)} disabled={autoPaperBusy} title="Dry run: simula sin ejecutar" style={{ padding: '4px 10px', fontSize: 11, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>▶ Dry run</button>
            <button onClick={() => runAutoPaperNow(false)} disabled={autoPaperBusy} style={{ padding: '4px 10px', fontSize: 11, background: 'transparent', color: '#fbbf24', border: '1px solid #fbbf24', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>▶ Run now</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Cuando ON: el cron diario 08:00 UTC ejecuta brain/scan + caps + paper/positions → abre paper trades automáticamente si score≥70 y caps allowed; cierra si TP +50% / SL -200% / gamma exit DTE≤7. Sin riesgo (paper).
        </div>
        {autoPaperLastRun && (
          <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-primary)', borderRadius: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Última ejecución {autoPaperLastRun.dryRun ? '(DRY RUN)' : ''}:</div>
            {autoPaperLastRun.error ? (
              <div style={{ color: '#ef4444', fontSize: 11 }}>⚠ {autoPaperLastRun.error}</div>
            ) : autoPaperLastRun.skipped ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>⏸ {autoPaperLastRun.reason} — {autoPaperLastRun.hint}</div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Opens: <b>{autoPaperLastRun.summary?.opens_executed || 0}</b>/{autoPaperLastRun.summary?.opens_planned || 0}
                · Closes: <b>{autoPaperLastRun.summary?.closes_executed || 0}</b>/{autoPaperLastRun.summary?.closes_planned || 0}
                · Skips: {autoPaperLastRun.summary?.skips || 0} · Holds: {autoPaperLastRun.summary?.holds || 0}
                {(autoPaperLastRun.summary?.errors || 0) > 0 && <span style={{ color: '#ef4444' }}> · Errors: {autoPaperLastRun.summary.errors}</span>}
              </div>
            )}
          </div>
        )}
        {autoPaperLog.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>LOG (últimas 20 acciones)</div>
            <div style={{ maxHeight: 180, overflowY: 'auto', fontSize: 10, fontFamily: 'monospace' }}>
              {autoPaperLog.map((l, i) => (
                <div key={l.id || i} style={{ padding: '2px 0', borderBottom: '1px dashed var(--border)', color: l.action === 'open' ? '#30d158' : l.action === 'close' ? '#fbbf24' : l.action.includes('error') ? '#ef4444' : 'var(--text-tertiary)' }}>
                  {l.run_at?.slice(11, 19)} · {l.action.toUpperCase()} · {l.symbol || '—'} · {l.strategy_id?.slice(0, 16) || '—'} · {l.reason?.slice(0, 60) || ''}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>OPEN</div><div style={{ fontSize: 18, fontWeight: 700 }}>{open.length}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>CLOSED</div><div style={{ fontSize: 18, fontWeight: 700 }}>{stats.n_closed || 0}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>TOTAL P&L</div><div style={{ fontSize: 18, fontWeight: 700, color: (stats.total_pnl || 0) >= 0 ? '#30d158' : '#ef4444' }}>{fmtMoney(stats.total_pnl)}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>WIN RATE</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmtPct(stats.win_rate)}</div></div>
      </div>

      {open.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Open paper positions ({open.length})</div>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-primary)', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>Strategy</th><th>Sym</th><th>Open</th><th>DTE</th><th>Credit</th><th>Live P&L</th><th>%</th>
              </tr></thead>
              <tbody>
                {open.map((t, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 4 }}>{t.strategy_id?.slice(0, 16)}</td>
                    <td>{t.symbol}</td>
                    <td>{t.open_date?.slice(5) || '—'}</td>
                    <td>{t.dte_open || '—'}</td>
                    <td>{fmtMoney(t.credit_received)}</td>
                    <td style={{ color: (t.live_pnl || 0) >= 0 ? '#30d158' : '#ef4444' }}>{fmtMoney(t.live_pnl)}</td>
                    <td style={{ color: (t.live_pnl_pct || 0) >= 0 ? '#30d158' : '#ef4444' }}>{fmtPct(t.live_pnl_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {byStrat.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>P&L por strategy</div>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-primary)', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>Strategy</th><th>N closed</th><th>Total P&L</th><th>Win %</th><th>Avg P&L</th>{byStrat[0]?.drift_pct != null && <th>Drift vs BT</th>}
              </tr></thead>
              <tbody>
                {byStrat.map((s, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 4, fontWeight: 600 }}>{s.strategy_id}</td>
                    <td>{s.n_closed}</td>
                    <td style={{ color: (s.total_pnl || 0) >= 0 ? '#30d158' : '#ef4444' }}>{fmtMoney(s.total_pnl)}</td>
                    <td>{fmtPct(s.win_rate)}</td>
                    <td>{fmtMoney(s.avg_pnl)}</td>
                    {s.drift_pct != null && <td style={{ color: Math.abs(s.drift_pct) > 30 ? '#ef4444' : 'inherit' }}>{fmtPct(s.drift_pct)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ⚡ Live — implementación real (Sprint cleanup) ─────────────────────────
// ─── ⚡ Live — Sprint 11 (semi-auto, NAS-only) ──────────────────────────────
// Workflow:
//   1. Form sugerir → ticket completo + checks pre-trade
//   2. Ejecutas manual en TT app (1 click copy strikes)
//   3. Click "Marcar como ejecutado" → registra fill real
//   4. Tabla orders muestra historial + estado
//
// Cuando estés cómodo: extender bridge NAS para auto-submit (~50L Python).
function LiveSubtab() {
  const [config, setConfig] = useState(null);
  const [orders, setOrders] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [caps, setCaps] = useState(null);
  const [form, setForm] = useState({ strategy_id: '', symbol: 'SPY', contracts: 1, dte: 35 });
  const [suggestion, setSuggestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [executeForm, setExecuteForm] = useState({ fill_credit: '', fill_account: '', notes: '' });
  const [loading, setLoading] = useState(true);
  // Sprint 11 audit fix C1+C2+H1+H4: error visibility + safety
  const [err, setErr] = useState(null);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [closeFormFor, setCloseFormFor] = useState(null);  // { id, pnl, reason }
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  const safeSet = (fn) => (...args) => { if (isMountedRef.current) fn(...args); };

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [cfg, o, st, c] = await Promise.all([
        fetch(`${API_URL}/api/thetagang/live/config`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/live/orders?limit=20`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/strategies`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/risk/caps-status`).then(r => r.json()).catch(() => null),
      ]);
      if (!isMountedRef.current) return;
      setConfig(cfg);
      setOrders(o?.orders || []);
      setStrategies(st?.strategies || []);
      setCaps(c);
    } catch (e) {
      if (isMountedRef.current) setErr(e.message);
    }
    if (isMountedRef.current) setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toggleEnabled = async () => {
    // Sprint 11 audit fix H1: double-confirm para "Activar Live"
    if (!config?.enabled && !confirmActivate) {
      setConfirmActivate(true);
      return;
    }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/live/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !config?.enabled, first_month_until: config?.first_month_until || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }),
      });
      if (!r.ok) throw new Error(`config update failed: ${r.status}`);
      setConfirmActivate(false);
      await refresh();
    } catch (e) {
      if (isMountedRef.current) setErr(e.message);
    }
    if (isMountedRef.current) setBusy(false);
  };

  const generateSuggestion = async () => {
    if (!form.strategy_id || !form.symbol) return;
    setBusy(true); setSuggestion(null); setErr(null);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/live/suggest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (isMountedRef.current) setSuggestion(j);
    } catch (e) {
      if (isMountedRef.current) setSuggestion({ error: e.message });
    }
    if (isMountedRef.current) setBusy(false);
  };

  const markExecuted = async () => {
    // Sprint 11 audit fix C1: explicit guard, no rely on disabled attribute alone
    if (!suggestion?.ticket || !suggestion?.checks?.allowed) {
      setErr('No se puede marcar ejecutado: pre-trade checks no permitidos');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/live/mark-executed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket: suggestion.ticket,
          strategy_id: suggestion.ticket.strategy_id,
          symbol: suggestion.ticket.symbol,
          contracts: suggestion.ticket.contracts,
          fill_credit: parseFloat(executeForm.fill_credit) || null,
          fill_account: executeForm.fill_account || null,
          notes: executeForm.notes || null,
        }),
      });
      if (!r.ok) throw new Error(`mark-executed failed: ${r.status}`);
      if (isMountedRef.current) {
        setSuggestion(null);
        setExecuteForm({ fill_credit: '', fill_account: '', notes: '' });
        await refresh();
      }
    } catch (e) {
      if (isMountedRef.current) setErr(e.message);
    }
    if (isMountedRef.current) setBusy(false);
  };

  // Sprint 11 audit fix C2: inline close form (no window.prompt)
  const startCloseOrder = (id) => setCloseFormFor({ id, pnl: '', reason: 'TP' });
  const cancelCloseOrder = () => setCloseFormFor(null);
  const submitCloseOrder = async () => {
    if (!closeFormFor?.id) return;
    const pnlNum = parseFloat(closeFormFor.pnl);
    if (!Number.isFinite(pnlNum)) {
      setErr('P&L debe ser un número finito');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/live/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: closeFormFor.id, close_pnl: pnlNum, close_reason: closeFormFor.reason || 'manual' }),
      });
      if (!r.ok) throw new Error(`close failed: ${r.status}`);
      if (isMountedRef.current) {
        setCloseFormFor(null);
        await refresh();
      }
    } catch (e) {
      if (isMountedRef.current) setErr(e.message);
    }
    if (isMountedRef.current) setBusy(false);
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Cargando estado live…</div>;

  const enabled = !!config?.enabled;
  const firstMonthActive = config?.first_month_until && new Date(config.first_month_until) > new Date();
  const openOrders = orders.filter(o => o.status === 'executed' && !o.closed_at);
  const closedOrders = orders.filter(o => o.closed_at);

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Sprint 11 audit fix H4: error banner global */}
      {err && (
        <div style={{ padding: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 6, color: '#ef4444', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠ {err}</span>
          <button onClick={() => setErr(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      )}
      {/* Header status + toggle */}
      <div style={{ ...CARD, borderColor: enabled ? 'rgba(48,209,88,.4)' : 'var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>⚡ Live Trading {enabled ? '🟢 ENABLED' : '⚫ DISABLED'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {firstMonthActive ? `🛡️ FIRST MONTH MODE — max 1 contract/trade hasta ${config.first_month_until}` : 'Production mode'}
            </div>
          </div>
          <button onClick={toggleEnabled} disabled={busy} style={{ padding: '6px 14px', fontSize: 11, background: enabled ? '#ef4444' : 'var(--gold, #fbbf24)', color: enabled ? '#fff' : '#000', border: 'none', borderRadius: 4, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
            {busy ? '...' : enabled ? 'Desactivar' : 'Activar Live'}
          </button>
        </div>
        {/* Sprint 11 audit fix H1: doble-confirm card visible cuando se intenta activar */}
        {confirmActivate && !enabled && (
          <div style={{ marginTop: 10, padding: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.5)', borderRadius: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>⚠ ATENCIÓN: Real Money Trading</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
              Estás a punto de activar trading con DINERO REAL. El sistema sugerirá tickets pero TÚ ejecutas manual en Tastytrade. <b>FIRST MONTH MODE</b> limita a 1 contract/trade durante 30 días.<br />
              Confirma sólo si entiendes que cualquier trade ejecutado es responsabilidad tuya.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={toggleEnabled} disabled={busy} style={{ padding: '6px 14px', fontSize: 12, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>SÍ, activar real money</button>
              <button onClick={() => setConfirmActivate(false)} disabled={busy} style={{ padding: '6px 14px', fontSize: 12, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* Pre-trade gate */}
      <div style={CARD}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🚦 Pre-trade gate</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 22 }}>{caps?.allowed ? '🟢' : '🔴'}</div>
          <div style={{ fontSize: 11 }}>
            VIX {fmtN(caps?.state_snapshot?.vix, 1)} · Concurrent {caps?.state_snapshot?.n_concurrent_positions} · DD {fmtPct(caps?.state_snapshot?.drawdown_pct)} · Streak {caps?.state_snapshot?.recent_loss_streak || 0}
          </div>
        </div>
      </div>

      {/* Suggest form */}
      <div style={CARD}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>💡 Generar trade ticket</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 10 }}>
          <select value={form.strategy_id} onChange={e => setForm({ ...form, strategy_id: e.target.value })} style={{ padding: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
            <option value="">Strategy...</option>
            {strategies.slice(0, 30).map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
          </select>
          <select value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })} style={{ padding: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
            <option>SPY</option><option>QQQ</option><option>IWM</option>
          </select>
          <input type="number" value={form.contracts} onChange={e => setForm({ ...form, contracts: Number(e.target.value) })} placeholder="Contracts" min={1} style={{ padding: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
          <input type="number" value={form.dte} onChange={e => setForm({ ...form, dte: Number(e.target.value) })} placeholder="DTE" min={1} style={{ padding: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
          <button onClick={generateSuggestion} disabled={busy || !form.strategy_id} style={{ padding: 6, fontSize: 12, background: 'var(--gold, #fbbf24)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>{busy ? '...' : '▶ Generar'}</button>
        </div>

        {suggestion?.ticket && (
          <div style={{ padding: 12, background: 'var(--bg-primary)', borderRadius: 4, border: '1px solid ' + (suggestion.checks?.allowed ? '#30d158' : '#ef4444') }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{suggestion.ticket.strategy_display} · {suggestion.ticket.symbol}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Pre-trade: {suggestion.checks?.allowed ? '🟢 PERMITIDO' : '🔴 BLOQUEADO'}
              {suggestion.checks?.in_first_month && <span style={{ marginLeft: 8, color: 'var(--gold, #fbbf24)' }}>· FIRST MONTH</span>}
            </div>
            {(suggestion.checks?.blocked_by || []).length > 0 && (
              <div style={{ padding: 6, background: 'rgba(239,68,68,.08)', borderRadius: 4, fontSize: 11, marginBottom: 8 }}>
                {suggestion.checks.blocked_by.map((b, i) => <div key={i} style={{ color: '#ef4444' }}>⛔ {b}</div>)}
              </div>
            )}
            {(suggestion.checks?.warnings || []).length > 0 && (
              <div style={{ padding: 6, background: 'rgba(251,191,36,.08)', borderRadius: 4, fontSize: 11, marginBottom: 8 }}>
                {suggestion.checks.warnings.map((w, i) => <div key={i} style={{ color: '#fbbf24' }}>⚠ {w}</div>)}
              </div>
            )}
            <div style={{ fontSize: 11, marginBottom: 8 }}>
              <b>Legs:</b>
              {suggestion.ticket.legs?.map((l, i) => (
                <div key={i} style={{ marginLeft: 12, color: l.action === 'sell' ? '#ef4444' : '#30d158' }}>
                  {l.action.toUpperCase()} {l.qty}× {l.type.toUpperCase()} @ ${l.strike}
                </div>
              ))}
            </div>
            <details style={{ marginBottom: 8 }}>
              <summary style={{ fontSize: 11, cursor: 'pointer', color: 'var(--text-tertiary)' }}>📋 Instrucciones manuales (click)</summary>
              <ol style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 6 }}>
                {suggestion.ticket.instructions?.map((step, i) => <li key={i}>{step.replace(/^\d+\.\s*/, '')}</li>)}
              </ol>
            </details>
            <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-secondary)', borderRadius: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Después de ejecutar manualmente en TT:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, marginBottom: 6 }}>
                <input type="number" value={executeForm.fill_credit} onChange={e => setExecuteForm({ ...executeForm, fill_credit: e.target.value })} placeholder="Fill credit $" step="0.01" style={{ padding: 6, fontSize: 11, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
                <input type="text" value={executeForm.fill_account} onChange={e => setExecuteForm({ ...executeForm, fill_account: e.target.value })} placeholder="Account" style={{ padding: 6, fontSize: 11, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
                <input type="text" value={executeForm.notes} onChange={e => setExecuteForm({ ...executeForm, notes: e.target.value })} placeholder="Notes" style={{ padding: 6, fontSize: 11, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
                <button onClick={markExecuted} disabled={busy || !suggestion.checks?.allowed} style={{ padding: 6, fontSize: 11, background: '#30d158', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>✓ Marcar ejecutado</button>
              </div>
            </div>
          </div>
        )}
        {suggestion?.error && <div style={{ padding: 10, background: 'rgba(239,68,68,.1)', borderRadius: 4, color: '#ef4444', fontSize: 11 }}>⚠ {suggestion.error}</div>}
      </div>

      {/* Open live orders */}
      {openOrders.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📂 Live orders abiertos ({openOrders.length})</div>
          <div style={{ ...CARD, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-primary)', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>ID</th><th>Strategy</th><th>Symbol</th><th>Qty</th><th>Credit</th><th>Account</th><th>Opened</th><th>Action</th>
              </tr></thead>
              <tbody>
                {openOrders.map(o => (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6 }}>#{o.id}</td>
                    <td>{o.strategy_id}</td>
                    <td>{o.symbol}</td>
                    <td>{o.contracts}</td>
                    <td>{fmtMoney(o.fill_credit)}</td>
                    <td style={{ fontSize: 10 }}>{o.fill_account || '—'}</td>
                    <td style={{ fontSize: 10 }}>{o.marked_executed_at?.slice(0, 16) || '—'}</td>
                    <td><button onClick={() => startCloseOrder(o.id)} disabled={busy} style={{ padding: '2px 8px', fontSize: 10, background: 'transparent', color: '#fbbf24', border: '1px solid #fbbf24', borderRadius: 3, cursor: 'pointer' }}>Cerrar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sprint 11 audit fix C2: inline close order form (no window.prompt) */}
      {closeFormFor && (
        <div style={{ ...CARD, borderColor: '#fbbf24' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 8 }}>Cerrar orden #{closeFormFor.id}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 8 }}>
            <input type="number" value={closeFormFor.pnl} onChange={e => setCloseFormFor({ ...closeFormFor, pnl: e.target.value })} placeholder="P&L final $ (puede ser negativo)" step="0.01" style={{ padding: 8, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
            <select value={closeFormFor.reason} onChange={e => setCloseFormFor({ ...closeFormFor, reason: e.target.value })} style={{ padding: 8, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
              <option value="TP">Take Profit</option>
              <option value="SL">Stop Loss</option>
              <option value="gamma_exit">Gamma Exit</option>
              <option value="defensive_roll">Defensive Roll</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={submitCloseOrder} disabled={busy || !closeFormFor.pnl} style={{ padding: '6px 14px', fontSize: 12, background: '#30d158', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>{busy ? '...' : '✓ Confirmar cierre'}</button>
            <button onClick={cancelCloseOrder} disabled={busy} style={{ padding: '6px 14px', fontSize: 12, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Closed orders historial */}
      {closedOrders.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📊 Histórico ({closedOrders.length})</div>
          <div style={{ ...CARD, padding: 0, overflowX: 'auto', maxHeight: 240, overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-primary)', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>Strategy</th><th>Sym</th><th>Qty</th><th>Credit</th><th>P&L</th><th>Reason</th><th>Closed</th>
              </tr></thead>
              <tbody>
                {closedOrders.map(o => (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6 }}>{o.strategy_id}</td>
                    <td>{o.symbol}</td>
                    <td>{o.contracts}</td>
                    <td>{fmtMoney(o.fill_credit)}</td>
                    <td style={{ color: (o.close_pnl || 0) >= 0 ? '#30d158' : '#ef4444', fontWeight: 600 }}>{fmtMoney(o.close_pnl)}</td>
                    <td style={{ fontSize: 10 }}>{o.close_reason}</td>
                    <td style={{ fontSize: 10 }}>{o.closed_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div style={{ padding: 10, background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        💡 <b>Modo semi-auto NAS-only</b>: el sistema sugiere el ticket completo + valida pre-trade. Tú ejecutas manual en TT app (1 click copy strikes). Cuando esté listo, click "Marcar ejecutado". Sistema trackea P&L + sugiere exit. Para auto-submit total: extender bridge NAS con endpoints write (~50L Python).
      </div>
    </div>
  );
}

// ─── 🏗️ Risk — Sprint 9 ────────────────────────────────────────────────────
function RiskSubtab() {
  const [caps, setCaps] = useState(null);
  const [heat, setHeat] = useState(null);
  const [kellyForm, setKellyForm] = useState({ win_rate: 65, avg_win: 100, avg_loss: 100, nav: 100000, max_loss_per_contract: 1000 });
  const [kellyResult, setKellyResult] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [c, h, corr] = await Promise.all([
        fetch(`${API_URL}/api/thetagang/risk/caps-status`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/risk/portfolio-heat`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/risk/correlation`).then(r => r.json()).catch(() => null),
      ]);
      setCaps(c); setHeat(h); setCorrelation(corr);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const computeKelly = useCallback(async () => {
    // Sprint cleanup audit M3: validate inputs antes de POST (evita NaN del backend con avg_loss=0)
    if (!kellyForm.win_rate || !kellyForm.avg_win || !kellyForm.avg_loss || !kellyForm.nav || !kellyForm.max_loss_per_contract) {
      setKellyResult({ error: 'Todos los campos requeridos: win_rate, avg_win, avg_loss, nav, max_loss_per_contract (>0)' });
      return;
    }
    try {
      const k = await fetch(`${API_URL}/api/thetagang/risk/kelly`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats: { win_rate: kellyForm.win_rate, avg_win: kellyForm.avg_win, avg_loss: kellyForm.avg_loss } }),
      }).then(r => r.json());
      const s = await fetch(`${API_URL}/api/thetagang/risk/sizing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats: { win_rate: kellyForm.win_rate, avg_win: kellyForm.avg_win, avg_loss: kellyForm.avg_loss },
          nav: kellyForm.nav, max_loss_per_contract: kellyForm.max_loss_per_contract,
        }),
      }).then(r => r.json());
      setKellyResult({ kelly: k, sizing: s });
    } catch (e) { setKellyResult({ error: e.message }); }
  }, [kellyForm]);

  const card = CARD;  // Sprint 15 audit fix L1: hoisted module-level
  const sectionTitle = { fontSize: 12, fontWeight: 700, color: 'var(--gold, #fbbf24)', marginBottom: 8 };

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Cargando risk dashboard…</div>;

  const score = heat?.risk_score;
  const scoreColor = score?.interpretation === 'LOW' ? '#30d158'
    : score?.interpretation === 'MODERATE' ? '#fbbf24'
    : score?.interpretation === 'HIGH' ? '#f97316' : '#ef4444';

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Risk score + caps status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 12 }}>
        {/* Score gauge */}
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={sectionTitle}>RISK SCORE</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: scoreColor, lineHeight: 1.1 }}>{score?.total || '—'}</div>
          <div style={{ fontSize: 13, color: scoreColor, fontWeight: 600 }}>{score?.interpretation || '—'}</div>
          {score?.breakdown && (
            <div style={{ marginTop: 10, fontSize: 10, textAlign: 'left', color: 'var(--text-tertiary)' }}>
              <div>VIX: {score.breakdown.vix}/30</div>
              <div>Concurrent: {score.breakdown.concurrent}/25</div>
              <div>Drawdown: {score.breakdown.drawdown}/25</div>
              <div>Concentration: {score.breakdown.concentration}/20</div>
            </div>
          )}
        </div>

        {/* Caps */}
        <div style={card}>
          <div style={sectionTitle}>RISK CAPS — Guard rails</div>
          <div style={{
            padding: 8, marginBottom: 8, borderRadius: 4,
            background: caps?.allowed ? 'rgba(48,209,88,.1)' : 'rgba(239,68,68,.1)',
            border: '1px solid ' + (caps?.allowed ? 'rgba(48,209,88,.4)' : 'rgba(239,68,68,.4)'),
            color: caps?.allowed ? '#30d158' : '#ef4444',
            fontWeight: 700, fontSize: 12,
          }}>{caps?.allowed ? '🟢 NUEVAS ENTRADAS PERMITIDAS' : '🔴 ENTRADAS BLOQUEADAS'}</div>

          <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            <div>VIX: <b>{caps?.state_snapshot?.vix?.toFixed(1) || '—'}</b> / max {caps?.caps_used?.vix_max}</div>
            <div>Concurrent: <b>{caps?.state_snapshot?.n_concurrent_positions || 0}</b> / max {caps?.caps_used?.max_concurrent}</div>
            <div>Drawdown: <b>{(caps?.state_snapshot?.drawdown_pct || 0).toFixed(1)}%</b> / kill {caps?.caps_used?.drawdown_kill_pct}%</div>
            <div>Loss streak: <b>{caps?.state_snapshot?.recent_loss_streak || 0}</b> / max {caps?.caps_used?.max_loss_streak}</div>
          </div>

          {(caps?.blocked_by || []).length > 0 && (
            <div style={{ marginTop: 8, padding: 8, background: 'rgba(239,68,68,.08)', borderRadius: 4, fontSize: 11 }}>
              {caps.blocked_by.map((b, i) => <div key={i} style={{ color: '#ef4444' }}>⛔ {b}</div>)}
            </div>
          )}
          {(caps?.warnings || []).length > 0 && (
            <div style={{ marginTop: 8, padding: 8, background: 'rgba(251,191,36,.08)', borderRadius: 4, fontSize: 11 }}>
              {caps.warnings.map((w, i) => <div key={i} style={{ color: '#fbbf24' }}>⚠ {w}</div>)}
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
            Posiciones abiertas: paper {caps?.counts?.paper || 0} · wheel {caps?.counts?.wheel || 0} · hedge {caps?.counts?.hedge || 0}
          </div>
        </div>
      </div>

      {/* Kelly sizing calculator */}
      <div style={card}>
        <div style={sectionTitle}>KELLY SIZING — Position size recommender</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Win % <input type="number" value={kellyForm.win_rate} onChange={e => setKellyForm({ ...kellyForm, win_rate: Number(e.target.value) })} style={{ width: '100%', padding: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} /></label>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Avg win <input type="number" value={kellyForm.avg_win} onChange={e => setKellyForm({ ...kellyForm, avg_win: Number(e.target.value) })} style={{ width: '100%', padding: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} /></label>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Avg loss <input type="number" value={kellyForm.avg_loss} onChange={e => setKellyForm({ ...kellyForm, avg_loss: Number(e.target.value) })} style={{ width: '100%', padding: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} /></label>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>NAV <input type="number" value={kellyForm.nav} onChange={e => setKellyForm({ ...kellyForm, nav: Number(e.target.value) })} style={{ width: '100%', padding: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} /></label>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Max loss/ctr <input type="number" value={kellyForm.max_loss_per_contract} onChange={e => setKellyForm({ ...kellyForm, max_loss_per_contract: Number(e.target.value) })} style={{ width: '100%', padding: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} /></label>
          <button onClick={computeKelly} style={{ alignSelf: 'flex-end', padding: 8, fontSize: 12, background: 'var(--gold, #fbbf24)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>Compute</button>
        </div>
        {kellyResult?.kelly?.ok && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, padding: 10, background: 'var(--bg-primary)', borderRadius: 4 }}>
            <Stat label="Edge" value={kellyResult.kelly.edge_pct + '%'} color={kellyResult.kelly.edge_pct > 0 ? '#30d158' : '#ef4444'} />
            <Stat label="Full Kelly" value={(kellyResult.kelly.full_kelly * 100).toFixed(2) + '%'} />
            <Stat label="Half Kelly" value={(kellyResult.kelly.half_kelly * 100).toFixed(2) + '%'} />
            <Stat label="Quarter Kelly" value={(kellyResult.kelly.quarter_kelly * 100).toFixed(2) + '%'} color="var(--gold, #fbbf24)" />
            <Stat label="Recommend" value={(kellyResult.sizing?.recommended_contracts || 0) + ' ctr'} />
            <Stat label="At risk" value={fmtMoney(kellyResult.sizing?.capital_at_risk || 0)} />
            <Stat label="% NAV" value={(kellyResult.sizing?.capital_pct || 0) + '%'} />
          </div>
        )}
        {kellyResult?.kelly?.kelly_warning && (
          <div style={{ marginTop: 8, padding: 8, background: 'rgba(251,191,36,.1)', borderRadius: 4, fontSize: 11, color: '#fbbf24' }}>⚠ {kellyResult.kelly.kelly_warning}</div>
        )}
        {kellyResult?.error && (
          <div style={{ marginTop: 8, padding: 8, background: 'rgba(239,68,68,.1)', borderRadius: 4, fontSize: 11, color: '#ef4444' }}>⚠ {kellyResult.error}</div>
        )}
      </div>

      {/* Portfolio heat by underlying */}
      <div style={card}>
        <div style={sectionTitle}>PORTFOLIO HEAT — Delta exposure por underlying</div>
        {(!heat?.heat || heat.heat.length === 0) ? (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No hay posiciones abiertas en TT.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {heat.heat.slice(0, 10).map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <div style={{ width: 50, fontWeight: 600 }}>{h.underlying}</div>
                <div style={{ width: 50, color: 'var(--text-tertiary)' }}>{h.n_positions}p</div>
                <div style={{ flex: 1, height: 16, background: 'var(--bg-primary)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    width: h.weight_pct + '%', height: '100%',
                    background: h.delta_dollars > 0 ? 'rgba(48,209,88,.4)' : 'rgba(239,68,68,.4)',
                    borderRight: '2px solid ' + (h.delta_dollars > 0 ? '#30d158' : '#ef4444'),
                  }} />
                  <div style={{ position: 'absolute', top: 1, left: 6, fontSize: 9, color: 'var(--text-secondary)' }}>{h.weight_pct}% · Δ$ {h.delta_dollars >= 0 ? '+' : ''}{(h.delta_dollars).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Correlation matrix */}
      {correlation?.ok && correlation.n_strategies >= 2 && (
        <div style={card}>
          <div style={sectionTitle}>CORRELATION MATRIX (paper trades closed)</div>
          {correlation.high_correlation_pairs.length > 0 && (
            <div style={{ marginBottom: 8, padding: 8, background: 'rgba(251,191,36,.08)', borderRadius: 4, fontSize: 11 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠ {correlation.high_correlation_pairs.length} par(es) altamente correlacionado(s):</div>
              {correlation.high_correlation_pairs.slice(0, 5).map((p, i) => (
                <div key={i} style={{ color: 'var(--text-secondary)' }}>{p.a} ↔ {p.b}: <b>{p.corr.toFixed(2)}</b> ({p.n_samples} samples)</div>
              ))}
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 10, borderCollapse: 'collapse' }}>
              <thead>
                <tr><th style={{ padding: 4 }}></th>
                  {Object.keys(correlation.matrix).map(s => <th key={s} style={{ padding: 4, color: 'var(--text-tertiary)' }}>{s.slice(0, 8)}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.keys(correlation.matrix).map(a => (
                  <tr key={a}>
                    <td style={{ padding: 4, color: 'var(--text-tertiary)' }}>{a.slice(0, 8)}</td>
                    {Object.keys(correlation.matrix).map(b => {
                      const v = correlation.matrix[a]?.[b];
                      const color = v == null ? 'var(--bg-primary)'
                        : Math.abs(v) > 0.7 ? `rgba(239,68,68,${0.3 + Math.abs(v) * 0.4})`
                        : Math.abs(v) > 0.4 ? `rgba(251,191,36,${0.3 + Math.abs(v) * 0.4})`
                        : `rgba(48,209,88,${0.3 + Math.abs(v) * 0.4})`;
                      return <td key={b} style={{ padding: 4, background: color, textAlign: 'center', minWidth: 32 }}>{v == null ? '—' : v.toFixed(2)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 📈 P&L — implementación real (Sprint cleanup) ──────────────────────────
// Aggrega P&L de las 3 fuentes de Theta Gang: paper trades + wheel cycles + tail hedges.
function PnLSubtab() {
  const [paper, setPaper] = useState(null);
  const [wheel, setWheel] = useState(null);
  const [hedges, setHedges] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, w, h] = await Promise.all([
        fetch(`${API_URL}/api/thetagang/paper/scoreboard`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/wheel/status`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/thetagang/tail-hedge/status`).then(r => r.json()).catch(() => null),
      ]);
      setPaper(p); setWheel(w); setHedges(h);
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const card = CARD;  // Sprint 15 audit fix L1: hoisted module-level
  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Agregando P&L de las 3 fuentes…</div>;

  const paperPnL = paper?.aggregated?.total_pnl || 0;
  const wheelPnL = wheel?.stats?.total_pnl || 0;
  const hedgeCost = hedges?.totals?.total_cost || 0;
  const hedgePnL = hedges?.totals?.realized_pnl || 0;
  const totalPnL = paperPnL + wheelPnL + hedgePnL - hedgeCost;
  const sources = [
    { label: '📝 Paper trading', pnl: paperPnL, n: paper?.aggregated?.n_closed || 0 },
    { label: '🎡 Wheel cycles', pnl: wheelPnL, n: wheel?.stats?.n_cycles || 0 },
    { label: '🛡️ Tail hedge realized', pnl: hedgePnL, n: hedges?.history?.length || 0 },
    { label: '🛡️ Tail hedge cost (open)', pnl: -hedgeCost, n: hedges?.open?.length || 0 },
  ];

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Big total */}
      <div style={{ ...card, textAlign: 'center', padding: 20, borderColor: totalPnL >= 0 ? 'rgba(48,209,88,.4)' : 'rgba(239,68,68,.4)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>P&L AGREGADO THETA GANG</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: totalPnL >= 0 ? '#30d158' : '#ef4444' }}>{fmtMoney(totalPnL)}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>Paper + Wheel + Tail Hedge realized − cost open</div>
      </div>

      {/* Breakdown por fuente */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Desglose por fuente</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {sources.map((s, i) => (
            <div key={i} style={card}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: s.pnl > 0 ? '#30d158' : s.pnl < 0 ? '#ef4444' : 'var(--text-primary)' }}>{fmtMoney(s.pnl)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.n} entries</div>
            </div>
          ))}
        </div>
      </div>

      {/* Paper stats detalladas */}
      {paper?.aggregated && (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold, #fbbf24)', marginBottom: 6 }}>📝 Paper trading detallado</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, fontSize: 11 }}>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Closed:</span> <b>{paper.aggregated.n_closed}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Win rate:</span> <b>{fmtPct(paper.aggregated.win_rate)}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Avg P&L:</span> <b>{fmtMoney(paper.aggregated.avg_pnl)}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Best:</span> <b style={{ color: '#30d158' }}>{fmtMoney(paper.aggregated.best_trade)}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Worst:</span> <b style={{ color: '#ef4444' }}>{fmtMoney(paper.aggregated.worst_trade)}</b></div>
          </div>
        </div>
      )}

      {/* Wheel stats detalladas */}
      {wheel?.stats?.n_cycles > 0 && (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold, #fbbf24)', marginBottom: 6 }}>🎡 Wheel cycles detallado</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, fontSize: 11 }}>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Ciclos:</span> <b>{wheel.stats.n_cycles}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Prima total:</span> <b style={{ color: 'var(--gold, #fbbf24)' }}>{fmtMoney(wheel.stats.total_premium)}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Yield ann:</span> <b>{fmtPct(wheel.stats.annualized_return_pct)}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Win:</span> <b>{fmtPct(wheel.stats.win_rate)}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Avg días:</span> <b>{fmtN(wheel.stats.avg_cycle_days, 0)}</b></div>
          </div>
        </div>
      )}

      {/* Hedge cost / efectividad */}
      {(hedges?.open?.length > 0 || hedges?.history?.length > 0) && (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold, #fbbf24)', marginBottom: 6 }}>🛡️ Tail hedge detallado</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, fontSize: 11 }}>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Abiertos:</span> <b>{hedges.open?.length || 0}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Histórico:</span> <b>{hedges.history?.length || 0}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Cost-to-date:</span> <b>{fmtMoney(hedges.totals?.total_cost)}</b></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Realized P&L:</span> <b style={{ color: hedgePnL >= 0 ? '#30d158' : '#ef4444' }}>{fmtMoney(hedgePnL)}</b></div>
          </div>
        </div>
      )}

      <div style={{ padding: 10, background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        💡 Sprint 11 (real money): este P&L incluirá automáticamente trades reales de TT bridge, no solo paper. Sortino/Calmar/Drift vs backtest se añadirán cuando haya ≥30 trades por strategy.
      </div>
    </div>
  );
}

// ─── 🎡 Wheel — Sprint 7 ────────────────────────────────────────────────────
function WheelSubtab() {
  const [data, setData] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [symbol, setSymbol] = useState('SPY');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ strike: '', premium_per_share: '', qty: 1, expiry: '' });
  const [busy, setBusy] = useState(false);
  // Sprint cleanup audit H3: inline error en lugar de alert() nativo (mobile-friendly)
  const [actionErr, setActionErr] = useState(null);
  // Sprint cleanup audit H3: confirm inline en lugar de window.confirm() nativo
  const [confirmExpire, setConfirmExpire] = useState(null);  // { cycleId, outcome }
  // Sprint cleanup audit H4: ref guard sincrónico contra double-submit
  const busyRef = useRef(false);
  // Sprint 15 audit fix M6: AbortController para race en unmount/symbol change
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/wheel/status${symbol ? '?symbol=' + symbol : ''}`, { signal: abortRef.current.signal });
      setData(await r.json());
      const sR = await fetch(`${API_URL}/api/thetagang/wheel/suggest?symbol=${symbol}&dte=35`, { signal: abortRef.current.signal });
      const sJ = await sR.json();
      setSuggestion(sJ.suggestion);
    } catch (e) { if (e.name !== 'AbortError') console.error(e); }
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    load();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [load]);

  const submitCSP = async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionErr(null);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/wheel/open-csp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          strike: parseFloat(form.strike),
          premium_per_share: parseFloat(form.premium_per_share),
          qty: parseInt(form.qty, 10) || 1,
          expiry: form.expiry,
        }),
      });
      const j = await r.json();
      if (!j.ok) setActionErr(j.error || 'Error abriendo CSP');
      else { setForm({ strike: '', premium_per_share: '', qty: 1, expiry: '' }); load(); }
    } catch (e) { setActionErr(e.message); }
    busyRef.current = false; setBusy(false);
  };

  const requestExpire = (cycleId, outcome) => setConfirmExpire({ cycleId, outcome });
  const cancelExpire = () => setConfirmExpire(null);
  const confirmExpireDo = async () => {
    if (busyRef.current || !confirmExpire) return;
    const { cycleId, outcome } = confirmExpire;
    busyRef.current = true; setBusy(true); setActionErr(null);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/wheel/expire`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle_id: cycleId, outcome }),
      });
      const j = await r.json();
      if (!j.ok) setActionErr(j.error || 'Error en expire');
      else load();
    } catch (e) { setActionErr(e.message); }
    busyRef.current = false; setBusy(false);
    setConfirmExpire(null);
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Cargando ciclos…</div>;
  const stats = data?.stats || {};
  const open = data?.open_cycles || [];
  const done = data?.completed_cycles || [];
  const card = CARD;  // Sprint 15 audit fix L1: hoisted module-level

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Sprint cleanup audit H3: inline error banner (no más alert()) */}
      {actionErr && (
        <div style={{ padding: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠ {actionErr}</span>
          <button onClick={() => setActionErr(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      )}
      {/* Sprint cleanup audit H3: inline confirm (no más window.confirm()) */}
      {confirmExpire && (
        <div style={{ padding: 12, background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.4)', borderRadius: 6, fontSize: 12 }}>
          <div style={{ marginBottom: 8 }}>¿Marcar ciclo #{confirmExpire.cycleId} como <b>{confirmExpire.outcome}</b>?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={confirmExpireDo} disabled={busy} style={{ padding: '4px 12px', fontSize: 11, background: 'var(--gold, #fbbf24)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Confirmar</button>
            <button onClick={cancelExpire} disabled={busy} style={{ padding: '4px 12px', fontSize: 11, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>CICLOS COMPLETOS</div><div style={{ fontSize: 18, fontWeight: 700 }}>{stats.n_cycles || 0}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>P&L TOTAL</div><div style={{ fontSize: 18, fontWeight: 700, color: (stats.total_pnl || 0) >= 0 ? '#30d158' : '#ef4444' }}>{fmtMoney(stats.total_pnl)}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>PRIMA TOTAL</div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold, #fbbf24)' }}>{fmtMoney(stats.total_premium)}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>YIELD ANUALIZ.</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmtPct(stats.annualized_return_pct)}</div></div>
        <div style={card}><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>WIN RATE</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmtPct(stats.win_rate)}</div></div>
      </div>

      {/* Suggestion */}
      {suggestion && (
        <div style={{ ...card, borderColor: 'var(--gold, #fbbf24)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>SUGERENCIA</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{(suggestion.action || '').replace(/_/g, ' ').toUpperCase()}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{suggestion.rationale || suggestion.reason || '—'}</div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={submitCSP} style={card}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Abrir CSP nuevo</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{ padding: 8, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
            <option>SPY</option><option>QQQ</option><option>IWM</option><option>KO</option><option>JNJ</option><option>PG</option>
          </select>
          <input value={form.strike} onChange={e => setForm({ ...form, strike: e.target.value })} placeholder="Strike" type="number" step="0.5" required style={{ padding: 8, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
          <input value={form.premium_per_share} onChange={e => setForm({ ...form, premium_per_share: e.target.value })} placeholder="Prima/sh" type="number" step="0.01" required style={{ padding: 8, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
          <input value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="Qty" type="number" min="1" style={{ padding: 8, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
          <input value={form.expiry} onChange={e => setForm({ ...form, expiry: e.target.value })} type="date" required style={{ padding: 8, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
          <button type="submit" disabled={busy} style={{ padding: 8, background: 'var(--gold, #fbbf24)', color: '#000', fontWeight: 700, fontSize: 12, border: 'none', borderRadius: 4, cursor: 'pointer' }}>{busy ? '…' : '+ Abrir CSP'}</button>
        </div>
      </form>

      {/* Open cycles */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Ciclos abiertos ({open.length})</div>
        {open.length === 0 ? <div style={{ ...card, fontSize: 11, color: 'var(--text-tertiary)' }}>Sin ciclos abiertos.</div> : (
          open.map(c => (
            <div key={c.id} style={{ ...card, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700 }}>{c.symbol}</div>
              <div style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-primary)', borderRadius: 3 }}>{c.state}</div>
              {c.strike_csp && <div style={{ fontSize: 11 }}>CSP {c.strike_csp} · ${fmtN(c.premium_csp, 2)}</div>}
              {c.strike_cc && <div style={{ fontSize: 11 }}>CC {c.strike_cc} · ${fmtN(c.premium_cc, 2)}</div>}
              {c.cost_basis_effective && <div style={{ fontSize: 11, color: 'var(--gold, #fbbf24)' }}>basis ${fmtN(c.cost_basis_effective, 2)}</div>}
              <div style={{ flex: 1 }} />
              <button disabled={busy} onClick={() => requestExpire(c.id, 'expired_otm')} style={{ padding: '4px 8px', fontSize: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, cursor: 'pointer' }}>Expiró OTM</button>
              <button disabled={busy} onClick={() => requestExpire(c.id, 'assigned')} style={{ padding: '4px 8px', fontSize: 10, background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 4, cursor: 'pointer' }}>Assigned</button>
              <button disabled={busy} onClick={() => requestExpire(c.id, 'closed_early')} style={{ padding: '4px 8px', fontSize: 10, background: 'transparent', border: '1px solid #30d158', color: '#30d158', borderRadius: 4, cursor: 'pointer' }}>TP</button>
            </div>
          ))
        )}
      </div>

      {/* History */}
      {done.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Histórico ciclos completos ({done.length})</div>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr style={{ background: 'var(--bg-primary)', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>Symbol</th><th>Inicio</th><th>Cierre</th><th>Días</th><th>Prima</th><th>P&L</th>
              </tr></thead>
              <tbody>
                {done.slice(0, 30).map(c => {
                  const days = c.cycle_started_at && c.cycle_closed_at
                    ? Math.round((new Date(c.cycle_closed_at) - new Date(c.cycle_started_at)) / 86400000) : 0;
                  return (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 6, fontWeight: 600 }}>{c.symbol}</td>
                      <td>{c.cycle_started_at?.slice(0, 10)}</td>
                      <td>{c.cycle_closed_at?.slice(0, 10)}</td>
                      <td>{days}d</td>
                      <td>${fmtN(c.cycle_premium_total, 0)}</td>
                      <td style={{ color: c.cycle_pnl >= 0 ? '#30d158' : '#ef4444', fontWeight: 600 }}>${fmtN(c.cycle_pnl, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 🛡️ Tail Hedge — Sprint 7 ──────────────────────────────────────────────
function TailHedgeSubtab() {
  const [status, setStatus] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [hedgeType, setHedgeType] = useState('put_roll');
  const [nav, setNav] = useState(1_400_000);
  const [loading, setLoading] = useState(false);
  // Sprint 15 audit fix M2: AbortController para evitar race en unmount
  const abortRef = useRef(null);

  const loadStatus = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    try {
      const r = await fetch(`${API_URL}/api/thetagang/tail-hedge/status`, { signal: abortRef.current.signal });
      setStatus(await r.json());
    } catch (e) { if (e.name !== 'AbortError') console.error(e); }
  }, []);

  useEffect(() => {
    loadStatus();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [loadStatus]);

  const computeSuggestion = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/tail-hedge/suggest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hedge_type: hedgeType, nav }),
      });
      setSuggestion(await r.json());
    } catch (e) { setSuggestion({ error: e.message }); }
    setLoading(false);
  }, [hedgeType, nav]);

  const card = CARD;  // Sprint 15 audit fix L1: hoisted module-level
  const open = status?.open || [];
  const totals = status?.totals || {};
  const protection = status?.protection || [];

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Current protection */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold, #fbbf24)' }}>Protección actual</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>SPY {status?.spy_spot ? '$' + fmtN(status.spy_spot, 2) : '—'}</div>
        </div>
        {open.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sin hedges abiertos. La cartera está expuesta a tail risk sin cobertura.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                <th>Type</th><th>Sym</th><th>Strike</th><th>Expiry</th><th>Qty</th><th>Cost</th><th>Status</th>
              </tr></thead>
              <tbody>
                {open.map(h => (
                  <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 4 }}>{h.hedge_type}</td>
                    <td>{h.symbol}</td>
                    <td>{h.strike}</td>
                    <td>{h.expiry}</td>
                    <td>{h.qty}</td>
                    <td>{fmtMoney(h.cost_dollars)}</td>
                    <td>{h.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {protection.length > 0 && (
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 6 }}>
            {protection.map(p => (
              <div key={p.scenario} style={{ padding: 8, background: 'var(--bg-primary)', borderRadius: 4, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{((p.scenario || 0) * 100).toFixed(0)}%</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: p.hedge_pnl > 0 ? '#30d158' : 'var(--text-secondary)' }}>{fmtMoney(p.hedge_pnl)}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>
          Cost-to-date {fmtMoney(totals.total_cost)} · Realized P&L <span style={{ color: (totals.realized_pnl || 0) >= 0 ? '#30d158' : '#ef4444' }}>{fmtMoney(totals.realized_pnl)}</span>
        </div>
      </div>

      {/* Today's suggestion */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold, #fbbf24)' }}>Sugerencia hoy</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={hedgeType} onChange={e => setHedgeType(e.target.value)} style={{ padding: '4px 8px', fontSize: 11, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
              <option value="put_roll">Put Roll (SPY)</option>
              <option value="vix_call">VIX Call</option>
              <option value="convexity_backspread">Convexity Backspread</option>
            </select>
            <input type="number" value={nav} onChange={e => setNav(Number(e.target.value))} placeholder="NAV" style={{ padding: '4px 8px', fontSize: 11, width: 120, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} />
            <button onClick={computeSuggestion} disabled={loading} style={{ padding: '4px 10px', fontSize: 11, background: 'var(--gold, #fbbf24)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>{loading ? '…' : 'Compute'}</button>
          </div>
        </div>
        {suggestion && (
          <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 4 }}>
            {suggestion.error ? (
              <div style={{ color: '#ef4444', fontSize: 11 }}>⚠ {suggestion.error}</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
                    background: suggestion.action === 'open' ? '#1b5e20' : suggestion.action === 'roll' ? '#0d47a1' : suggestion.action === 'skip' ? '#5d4037' : '#444',
                    color: '#fff',
                  }}>{(suggestion.action || '?').toUpperCase()}</span>
                  <span style={{ fontSize: 12 }}>{suggestion.reason || ''}</span>
                </div>
                {suggestion.suggestion && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {suggestion.suggestion.symbol} {suggestion.suggestion.type || suggestion.suggestion.structure}
                    {suggestion.suggestion.strike != null && ` K=${suggestion.suggestion.strike}`}
                    {suggestion.suggestion.dte != null && ` · ${suggestion.suggestion.dte} DTE`}
                    {suggestion.suggestion.qty != null && ` · qty ${suggestion.suggestion.qty}`}
                    {suggestion.suggestion.est_cost != null && ` · ${fmtMoney(suggestion.suggestion.est_cost)}`}
                  </div>
                )}
                {suggestion.inputs && (
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>
                    Inputs: VIX={fmtN(suggestion.inputs.vix, 1)} · IVR={fmtN(suggestion.inputs.ivr, 0)} · spot={fmtN(suggestion.inputs.spot, 2)} · NAV={fmtMoney(suggestion.inputs.nav)}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* History (slim) */}
      {(status?.history || []).length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Histórico hedges ({status.history.length})</div>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>Type</th><th>Sym</th><th>Opened</th><th>Closed</th><th>Cost</th><th>P&L</th><th>Status</th>
              </tr></thead>
              <tbody>
                {status.history.slice(0, 20).map(h => (
                  <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6 }}>{h.hedge_type}</td>
                    <td>{h.symbol}</td>
                    <td>{h.opened_at?.slice(0, 10)}</td>
                    <td>{h.closed_at?.slice(0, 10) || '—'}</td>
                    <td>{fmtMoney(h.cost_dollars)}</td>
                    <td style={{ color: (h.close_pnl || 0) >= 0 ? '#30d158' : '#ef4444' }}>{fmtMoney(h.close_pnl)}</td>
                    <td>{h.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 💡 Cartera Ideas — Sprint 18 ───────────────────────────────────────────
// Por cada position en tu cartera, propone CC/CSP/BPS/Collar con confidence score.
function PortfolioIdeasSubtab() {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [minConf, setMinConf] = useState(50);
  const [appliedMinConf, setAppliedMinConf] = useState(50);  // Sprint 19 audit fix H2: applied vs typing
  const [filterType, setFilterType] = useState('ALL');
  const [stats, setStats] = useState({});
  const abortRef = useRef(null);  // Sprint 19 audit fix M1: AbortController

  const refresh = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/portfolio-ideas/scan?min_confidence=${appliedMinConf}`, { signal: abortRef.current.signal });
      const j = await r.json();
      if (j.error) setErr(j.error);
      else {
        setIdeas(j.ideas || []);
        setStats({
          n_positions: j.n_positions_analyzed ?? 0,
          n_ideas_total: j.n_ideas_total ?? 0,
          n_filtered: j.n_ideas_filtered ?? 0,
        });
      }
    } catch (e) { if (e.name !== 'AbortError') setErr(e.message); }
    setLoading(false);
  }, [appliedMinConf]);
  useEffect(() => {
    refresh();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [refresh]);
  const applyMinConf = () => setAppliedMinConf(minConf);

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Analizando tu cartera...</div>;
  if (err) return <div style={{ padding: 12, margin: 14, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>⚠ {err}</div>;

  const filtered = filterType === 'ALL' ? ideas : ideas.filter(i => i.type === filterType);
  const TYPE_LABEL = {
    COVERED_CALL: '📞 Covered Call',
    CASH_SECURED_PUT: '💰 Cash-Secured Put',
    BPS_COST_REDUCTION: '⬇️ BPS Cost Reduction',
    COLLAR_PROTECTION: '🛡️ Collar Protection',
  };
  const TYPE_COLOR = {
    COVERED_CALL: '#30d158',
    CASH_SECURED_PUT: 'var(--gold, #fbbf24)',
    BPS_COST_REDUCTION: '#fbbf24',
    COLLAR_PROTECTION: '#60a5fa',
  };

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header + filters */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold, #fbbf24)' }}>💡 Ideas de la cartera</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{stats.n_positions} positions analizadas · {stats.n_ideas_total} ideas totales · {stats.n_filtered} filtradas (confidence ≥ {minConf})</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11 }}>Min conf: <input type="number" value={minConf} onChange={e => setMinConf(Number(e.target.value))} onBlur={applyMinConf} onKeyDown={e => e.key === 'Enter' && applyMinConf()} min={0} max={100} step={10} style={{ width: 50, padding: 4, fontSize: 11, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }} /></label>
            <button onClick={applyMinConf} disabled={minConf === appliedMinConf} style={{ padding: '4px 8px', fontSize: 11, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>Apply</button>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: 4, fontSize: 11, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
              <option value="ALL">Todas</option>
              {Object.keys(TYPE_LABEL).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <button onClick={refresh} style={{ padding: '4px 10px', fontSize: 11, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>↻</button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...CARD, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 30 }}>
          No hay ideas con confidence ≥ {minConf}. Baja el umbral o cambia el filtro.
        </div>
      ) : (
        filtered.map((idea, i) => {
          const color = TYPE_COLOR[idea.type] || 'var(--text-secondary)';
          return (
            <div key={i} style={{ ...CARD, borderColor: color }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{TYPE_LABEL[idea.type] || idea.type} · <span style={{ color }}>{idea.ticker}</span></span>
                </div>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: idea.confidence_score >= 75 ? '#30d158' : idea.confidence_score >= 50 ? '#fbbf24' : 'var(--text-tertiary)', color: '#000', fontWeight: 700 }}>
                  Confidence {idea.confidence_score}
                </span>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>{idea.rationale}</div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, fontSize: 11 }}>
                {idea.contracts != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Contracts:</span> <b>{idea.contracts}</b></div>}
                {idea.strike != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Strike:</span> <b>${idea.strike}</b></div>}
                {idea.short_strike != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Strikes:</span> <b>{idea.short_strike}/{idea.long_strike}</b></div>}
                {idea.put_strike != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Put/Call:</span> <b>{idea.put_strike}/{idea.call_strike}</b></div>}
                {idea.dte != null && <div><span style={{ color: 'var(--text-tertiary)' }}>DTE:</span> <b>{idea.dte}d</b></div>}
                {idea.premium_estimate != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Premium:</span> <b style={{ color: idea.premium_estimate > 0 ? '#30d158' : '#ef4444' }}>{fmtMoney(idea.premium_estimate)}</b></div>}
                {idea.capital_required != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Capital:</span> <b>{fmtMoney(idea.capital_required)}</b></div>}
                {idea.annualized_yield_pct != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Yield ann:</span> <b style={{ color: 'var(--gold, #fbbf24)' }}>{idea.annualized_yield_pct}%</b></div>}
                {idea.effective_buy_price != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Buy effective:</span> <b>${idea.effective_buy_price}</b></div>}
                {idea.assignment_discount_pct != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Descuento:</span> <b style={{ color: '#30d158' }}>{idea.assignment_discount_pct}%</b></div>}
                {idea.cost_basis_reduction_per_share != null && idea.cost_basis_reduction_per_share > 0 && <div><span style={{ color: 'var(--text-tertiary)' }}>Reduce coste:</span> <b style={{ color: '#30d158' }}>${idea.cost_basis_reduction_per_share}/sh</b></div>}
                {idea.downside_protection != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Protect down:</span> <b style={{ color: '#ef4444' }}>{fmtMoney(idea.downside_protection)}</b></div>}
                {idea.upside_cap != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Cap up:</span> <b style={{ color: '#30d158' }}>{fmtMoney(idea.upside_cap)}</b></div>}
              </div>
            </div>
          );
        })
      )}

      <div style={{ padding: 10, background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        💡 Estas son <b>sugerencias generadas automáticamente</b> basadas en tu cartera + IV asumida 25%. Premium es estimación BS, no quote real. Para ejecución: revisa quote real en TT/IBKR antes de abrir.
      </div>
    </div>
  );
}

// ─── 🎯 Open Options — Sprint 18 ────────────────────────────────────────────
// Vista consolidada de opciones abiertas en TT + IB con sugerencias IA por cada una.
function OpenOptionsSubtab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filterUrg, setFilterUrg] = useState('ALL');

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${API_URL}/api/thetagang/open-options/with-suggestions`);
      const j = await r.json();
      if (j.error) setErr(j.error); else setData(j);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Cargando opciones abiertas...</div>;
  if (err) return <div style={{ padding: 12, margin: 14, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>⚠ {err}</div>;
  const opts = data?.options || [];
  const summary = data?.summary || {};
  const filtered = filterUrg === 'ALL' ? opts : opts.filter(o => o.suggestion?.urgency === filterUrg);

  const URG_COLOR = { HIGH: '#ef4444', MEDIUM: '#fbbf24', LOW: 'var(--text-tertiary)' };
  const URG_BG = { HIGH: 'rgba(239,68,68,.08)', MEDIUM: 'rgba(251,191,36,.08)', LOW: 'transparent' };

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary header */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold, #fbbf24)' }}>🎯 Opciones abiertas — IB + TT</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{summary.total ?? 0} totales · {summary.critical ?? 0} CRITICAL · {summary.medium ?? 0} MEDIUM · {summary.low ?? 0} LOW</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select value={filterUrg} onChange={e => setFilterUrg(e.target.value)} style={{ padding: 4, fontSize: 11, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }}>
              <option value="ALL">Todas</option>
              <option value="HIGH">🚨 HIGH (defensive)</option>
              <option value="MEDIUM">⚠ MEDIUM (TP/gamma)</option>
              <option value="LOW">✓ LOW (hold)</option>
            </select>
            <button onClick={refresh} style={{ padding: '4px 10px', fontSize: 11, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>↻</button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...CARD, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 30 }}>
          No hay opciones {filterUrg === 'ALL' ? 'abiertas' : `con urgencia ${filterUrg}`}.
        </div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg-primary)', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Source</th>
              <th>Underlying</th>
              <th>Type</th>
              <th>Strike</th>
              <th>Expiry</th>
              <th>DTE</th>
              <th>Qty</th>
              <th>Spot</th>
              <th>Live PnL</th>
              <th>Suggestion</th>
            </tr></thead>
            <tbody>
              {filtered.map((o, i) => {
                const urg = o.suggestion?.urgency || 'LOW';
                return (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)', background: URG_BG[urg] }}>
                    <td style={{ padding: 6 }}>{o.source}</td>
                    <td style={{ fontWeight: 600 }}>{o.underlying}</td>
                    <td>{o.opt_type === 'P' ? 'PUT' : o.opt_type === 'C' ? 'CALL' : o.opt_type}</td>
                    <td>${o.strike}</td>
                    <td>{o.expiry?.slice(5)}</td>
                    <td>{o.dte}d</td>
                    <td style={{ color: (o.qty || 0) < 0 ? '#ef4444' : '#30d158' }}>{o.qty}</td>
                    <td>${fmtN(o.spot, 2)}</td>
                    <td style={{ color: (o.suggestion?.live_pnl_pct || 0) >= 0 ? '#30d158' : '#ef4444' }}>{o.suggestion?.live_pnl_pct != null ? o.suggestion.live_pnl_pct + '%' : '—'}</td>
                    <td>
                      <span style={{ padding: '2px 6px', borderRadius: 3, background: URG_COLOR[urg], color: '#000', fontSize: 10, fontWeight: 700 }}>{o.suggestion?.action || 'HOLD'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail cards for HIGH urgency */}
      {filtered.filter(o => o.suggestion?.urgency === 'HIGH').length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#ef4444' }}>🚨 Acciones HIGH urgency — recomendadas YA</div>
          {filtered.filter(o => o.suggestion?.urgency === 'HIGH').map((o, i) => (
            <div key={i} style={{ ...CARD, borderColor: '#ef4444', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{o.underlying} {o.strike}{o.opt_type} ({o.dte}d, {o.qty} qty)</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{o.suggestion.rationale}</div>
              {o.suggestion.suggested_strike && (
                <div style={{ fontSize: 11, color: 'var(--gold, #fbbf24)' }}>→ Roll a strike <b>${o.suggestion.suggested_strike}</b> con DTE <b>{o.suggestion.suggested_dte}d</b></div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

  // Sprint 13 audit fix C1: lazy-mount only the active sub-tab.
  // Previously all 12 components mounted at once on tab open → 8+ concurrent
  // fetches incl. monte-carlo, walk-forward, risk endpoints (heavy). Now only
  // the user-selected sub-tab fetches.
  const renderActive = () => {
    switch (subTab) {
      case 'brain':      return <BrainSubtab />;
      case 'strategies': return <StrategiesSubtab />;
      case 'ideas':      return <PortfolioIdeasSubtab />;
      case 'openopts':   return <OpenOptionsSubtab />;
      case 'multileg':   return <MultiLegSubtab />;
      case 'wheel':      return <WheelSubtab />;
      case 'hedge':      return <TailHedgeSubtab />;
      case 'backtests':  return <BacktestsSubtab />;
      case 'greeks':     return <GreeksSubtab />;
      case 'defense':    return <DefenseSubtab />;
      case 'paper':      return <PaperSubtab />;
      case 'live':       return <LiveSubtab />;
      case 'risk':       return <RiskSubtab />;
      case 'pnl':        return <PnLSubtab />;
      default:           return null;
    }
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
      {renderActive()}
    </div>
  );
}
