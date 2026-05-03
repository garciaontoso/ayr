import { useState, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';
import { _sf } from '../../utils/formatters';

// ── Helpers ────────────────────────────────────────────────────────────────
const pct  = v => (v == null || isNaN(v)) ? '—' : _sf(v, 1) + '%';
const dol  = v => (v == null || isNaN(v)) ? '—' : '$' + _sf(v, 2);
const dolK = v => {
  if (v == null || isNaN(v)) return '—';
  return v >= 1000 ? '$' + _sf(v / 1000, 1) + 'K' : '$' + _sf(v, 0);
};
const num  = (v, d = 2) => (v == null || isNaN(v)) ? '—' : _sf(v, d);

// ── IB order string generator ────────────────────────────────────────────
function ibOrderString(row) {
  if (!row) return '';
  const qty = row.contracts || 1;
  const action = row.strategy === 'LEAPS' ? 'BUY' : 'SELL';
  const type = row.strategy === 'CC' ? 'CALL' : row.strategy === 'CSP' ? 'PUT' : 'CALL';
  const sym = row.contractSymbol || `${row.ticker} ${row.expiry} ${row.strike} ${type}`;
  const price = row.strategy === 'LEAPS' ? row.premium : (row.bid > 0 ? _sf(row.bid, 2) : _sf(row.premium, 2));
  return `${action} ${qty} ${sym} @ $${price} LMT`;
}

// ── Sub-tab buttons ─────────────────────────────────────────────────────
function SubTabs({ active, onChange }) {
  const tabs = [
    { id: 'cc',    lbl: 'Covered Calls',      ico: '📞' },
    { id: 'csp',   lbl: 'Cash-Secured Puts',  ico: '💰' },
    { id: 'leaps', lbl: 'LEAPS',              ico: '🚀' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            padding: '6px 14px', borderRadius: 8,
            border: `1px solid ${active === t.id ? 'var(--gold)' : 'var(--border)'}`,
            background: active === t.id ? 'var(--gold-dim)' : 'transparent',
            color: active === t.id ? 'var(--gold)' : 'var(--text-tertiary)',
            fontSize: 11, fontWeight: active === t.id ? 700 : 500,
            cursor: 'pointer', fontFamily: 'var(--fb)', transition: 'all .15s',
          }}>
          {t.ico} {t.lbl}
        </button>
      ))}
    </div>
  );
}

// ── Summary cards ───────────────────────────────────────────────────────
function SummaryCards({ summary }) {
  if (!summary) return null;
  const card = { padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 };
  const lbl  = { fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600, letterSpacing: .5, textTransform: 'uppercase' };
  const val  = (c) => ({ fontSize: 18, fontWeight: 700, fontFamily: 'var(--fm)', color: c, marginTop: 2 });
  const sub  = { fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' };

  const items = [
    { l: 'CC Primas/mes', v: dolK(summary.cc_total_premium),  c: 'var(--gold)',   s: `${summary.cc_count} posiciones` },
    { l: 'Mejor CC Anual', v: pct(summary.top_cc_annualized), c: 'var(--green)',  s: 'annualized yield' },
    { l: 'CSP Primas/mes', v: dolK(summary.csp_total_premium), c: 'var(--blue)',   s: `${summary.csp_count} candidatos` },
    { l: 'Mejor CSP Anual', v: pct(summary.top_csp_annualized), c: '#a78bfa',     s: 'annualized yield' },
    { l: 'LEAPS',          v: String(summary.leaps_count),     c: 'var(--text-primary)', s: 'oportunidades' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
      {items.map((m, i) => (
        <div key={i} style={card}>
          <div style={lbl}>{m.l}</div>
          <div style={val(m.c)}>{m.v}</div>
          <div style={sub}>{m.s}</div>
        </div>
      ))}
    </div>
  );
}

// ── CC table ────────────────────────────────────────────────────────────
function CCTable({ rows, onCopy }) {
  const [sortKey, setSortKey] = useState('annualizedPct');
  const [sortDir, setSortDir] = useState(-1);
  const [contractsOverride, setContractsOverride] = useState({});

  const sorted = [...rows].sort((a, b) => sortDir * ((b[sortKey] || 0) - (a[sortKey] || 0)));

  const hd = { padding: '4px 8px', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 9, fontWeight: 700, fontFamily: 'var(--fm)', cursor: 'pointer', userSelect: 'none' };
  const hdL = { ...hd, textAlign: 'left' };
  const td = { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 11 };
  const tdL = { ...td, textAlign: 'left' };

  function handleSort(k) {
    if (sortKey === k) setSortDir(d => -d);
    else { setSortKey(k); setSortDir(-1); }
  }
  function sortArrow(k) { return sortKey === k ? (sortDir === -1 ? ' ▼' : ' ▲') : ''; }

  const cols = [
    { k: 'ticker',        l: 'Ticker',          align: 'left'  },
    { k: 'price',         l: 'Precio',          align: 'right' },
    { k: 'strike',        l: 'Strike',          align: 'right' },
    { k: 'distPct',       l: 'OTM%',            align: 'right' },
    { k: 'expiry',        l: 'Expiry',          align: 'right' },
    { k: 'dte',           l: 'DTE',             align: 'right' },
    { k: 'bid',           l: 'Bid',             align: 'right' },
    { k: 'premium',       l: 'Mid',             align: 'right' },
    { k: 'annualizedPct', l: 'Anual%',          align: 'right' },
    { k: 'delta',         l: 'Delta',           align: 'right' },
    { k: 'iv',            l: 'IV%',             align: 'right' },
    { k: 'contracts',     l: 'Ctrs',            align: 'right' },
    { k: 'totalPremium',  l: 'Total Prima',     align: 'right' },
    { k: 'oi',            l: 'OI',              align: 'right' },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {cols.map(c => (
              <th key={c.k} style={c.align === 'left' ? hdL : hd} onClick={() => handleSort(c.k)}>
                {c.l}{sortArrow(c.k)}
              </th>
            ))}
            <th style={hd}>IB Order</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const contracts = contractsOverride[r.ticker] ?? r.contracts;
            const totalPremium = r.premium * 100 * contracts;
            const annPct = r.annualizedPct || 0;
            const annColor = annPct >= 15 ? 'var(--green)' : annPct >= 8 ? 'var(--gold)' : 'var(--text-primary)';
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--subtle-bg)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ ...tdL, fontWeight: 700, color: 'var(--gold)' }}>{r.ticker}</td>
                <td style={td}>${num(r.price)}</td>
                <td style={{ ...td, fontWeight: 600 }}>${num(r.strike)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{pct(r.distPct)}</td>
                <td style={td}>{r.expiry}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.dte}d</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{dol(r.bid)}</td>
                <td style={{ ...td, color: 'var(--gold)' }}>{dol(r.premium)}</td>
                <td style={{ ...td, fontWeight: 700, color: annColor }}>{pct(r.annualizedPct)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{num(r.delta)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{num(r.iv, 1)}%</td>
                <td style={td}>
                  <input type="number" min={1} max={r.contracts * 10} value={contracts}
                    onChange={e => setContractsOverride(prev => ({ ...prev, [r.ticker]: Math.max(1, parseInt(e.target.value) || 1) }))}
                    style={{ width: 46, textAlign: 'center', background: 'var(--input-bg, var(--card))', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontFamily: 'var(--fm)', fontSize: 11, padding: '1px 4px' }} />
                </td>
                <td style={{ ...td, fontWeight: 600, color: 'var(--green)' }}>{dolK(totalPremium)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.oi?.toLocaleString() || '—'}</td>
                <td style={td}>
                  <button onClick={() => onCopy({ ...r, contracts })}
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--fb)', transition: 'all .12s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                    Copiar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── CSP table ────────────────────────────────────────────────────────────
function CSPTable({ rows, onCopy }) {
  const [sortKey, setSortKey] = useState('annualizedPct');
  const [sortDir, setSortDir] = useState(-1);

  const sorted = [...rows].sort((a, b) => sortDir * ((b[sortKey] || 0) - (a[sortKey] || 0)));

  const hd = { padding: '4px 8px', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 9, fontWeight: 700, fontFamily: 'var(--fm)', cursor: 'pointer', userSelect: 'none' };
  const hdL = { ...hd, textAlign: 'left' };
  const td = { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 11 };
  const tdL = { ...td, textAlign: 'left' };

  function handleSort(k) {
    if (sortKey === k) setSortDir(d => -d);
    else { setSortKey(k); setSortDir(-1); }
  }
  function sortArrow(k) { return sortKey === k ? (sortDir === -1 ? ' ▼' : ' ▲') : ''; }

  const cols = [
    { k: 'ticker',         l: 'Ticker',        align: 'left'  },
    { k: 'price',          l: 'Precio',        align: 'right' },
    { k: 'strike',         l: 'Strike',        align: 'right' },
    { k: 'distPct',        l: 'Desc%',         align: 'right' },
    { k: 'effectiveCost',  l: 'Coste Efectivo', align: 'right' },
    { k: 'expiry',         l: 'Expiry',        align: 'right' },
    { k: 'dte',            l: 'DTE',           align: 'right' },
    { k: 'bid',            l: 'Bid',           align: 'right' },
    { k: 'premium',        l: 'Mid',           align: 'right' },
    { k: 'annualizedPct',  l: 'Anual%',        align: 'right' },
    { k: 'delta',          l: 'Delta',         align: 'right' },
    { k: 'iv',             l: 'IV%',           align: 'right' },
    { k: 'totalPremium',   l: 'Prima/ctrt',    align: 'right' },
    { k: 'oi',             l: 'OI',            align: 'right' },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {cols.map(c => (
              <th key={c.k} style={c.align === 'left' ? hdL : hd} onClick={() => handleSort(c.k)}>
                {c.l}{sortArrow(c.k)}
              </th>
            ))}
            <th style={hd}>IB Order</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const annPct = r.annualizedPct || 0;
            const annColor = annPct >= 15 ? 'var(--green)' : annPct >= 8 ? 'var(--gold)' : 'var(--text-primary)';
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--subtle-bg)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ ...tdL, fontWeight: 700, color: '#a78bfa' }}>{r.ticker}</td>
                <td style={td}>${num(r.price)}</td>
                <td style={{ ...td, fontWeight: 600 }}>${num(r.strike)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{pct(r.distPct)}</td>
                <td style={{ ...td, color: 'var(--green)' }}>${num(r.effectiveCost)}</td>
                <td style={td}>{r.expiry}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.dte}d</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{dol(r.bid)}</td>
                <td style={{ ...td, color: '#a78bfa' }}>{dol(r.premium)}</td>
                <td style={{ ...td, fontWeight: 700, color: annColor }}>{pct(r.annualizedPct)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{num(r.delta)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{num(r.iv, 1)}%</td>
                <td style={{ ...td, color: '#a78bfa' }}>{dol(r.totalPremium)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.oi?.toLocaleString() || '—'}</td>
                <td style={td}>
                  <button onClick={() => onCopy(r)}
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--fb)', transition: 'all .12s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#a78bfa'; e.currentTarget.style.color = '#a78bfa'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                    Copiar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── LEAPS table ───────────────────────────────────────────────────────────
function LEAPSTable({ rows, onCopy }) {
  const [sortKey, setSortKey] = useState('leverage');
  const [sortDir, setSortDir] = useState(-1);

  const sorted = [...rows].sort((a, b) => sortDir * ((b[sortKey] || 0) - (a[sortKey] || 0)));

  const hd = { padding: '4px 8px', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 9, fontWeight: 700, fontFamily: 'var(--fm)', cursor: 'pointer', userSelect: 'none' };
  const hdL = { ...hd, textAlign: 'left' };
  const td = { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 11 };
  const tdL = { ...td, textAlign: 'left' };

  function handleSort(k) {
    if (sortKey === k) setSortDir(d => -d);
    else { setSortKey(k); setSortDir(-1); }
  }
  function sortArrow(k) { return sortKey === k ? (sortDir === -1 ? ' ▼' : ' ▲') : ''; }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {[
              { k: 'ticker',   l: 'Ticker',    align: 'left'  },
              { k: 'price',    l: 'Precio',    align: 'right' },
              { k: 'strike',   l: 'Strike',    align: 'right' },
              { k: 'distPct',  l: 'OTM%',      align: 'right' },
              { k: 'expiry',   l: 'Expiry',    align: 'right' },
              { k: 'dte',      l: 'DTE',       align: 'right' },
              { k: 'bid',      l: 'Bid',       align: 'right' },
              { k: 'premium',  l: 'Mid',       align: 'right' },
              { k: 'delta',    l: 'Delta',     align: 'right' },
              { k: 'leverage', l: 'Leverage',  align: 'right' },
              { k: 'iv',       l: 'IV%',       align: 'right' },
              { k: 'totalCost', l: 'Coste/ctrt', align: 'right' },
              { k: 'oi',       l: 'OI',        align: 'right' },
            ].map(c => (
              <th key={c.k} style={c.align === 'left' ? hdL : hd} onClick={() => handleSort(c.k)}>
                {c.l}{sortArrow(c.k)}
              </th>
            ))}
            <th style={hd}>IB Order</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const lev = r.leverage || 0;
            const levColor = lev >= 3 ? 'var(--green)' : lev >= 1.5 ? 'var(--gold)' : 'var(--text-primary)';
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--subtle-bg)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ ...tdL, fontWeight: 700, color: 'var(--blue, #38bdf8)' }}>{r.ticker}</td>
                <td style={td}>${num(r.price)}</td>
                <td style={{ ...td, fontWeight: 600 }}>${num(r.strike)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{pct(r.distPct)}</td>
                <td style={td}>{r.expiry}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.dte}d</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{dol(r.bid)}</td>
                <td style={{ ...td, color: 'var(--blue, #38bdf8)' }}>{dol(r.premium)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{num(r.delta)}</td>
                <td style={{ ...td, fontWeight: 700, color: levColor }}>{num(r.leverage, 2)}x</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{num(r.iv, 1)}%</td>
                <td style={{ ...td, color: 'var(--red)' }}>{dolK(r.totalCost)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.oi?.toLocaleString() || '—'}</td>
                <td style={td}>
                  <button onClick={() => onCopy(r)}
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--fb)', transition: 'all .12s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue, #38bdf8)'; e.currentTarget.style.color = 'var(--blue, #38bdf8)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                    Copiar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function OptionsOptimizerTab() {
  const [sub,      setSub]      = useState(() => localStorage.getItem('opt_optimizer_sub') || 'cc');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [copied,   setCopied]   = useState(null);

  // Controls
  const [dte,    setDte]    = useState(37);
  const [otmCc,  setOtmCc]  = useState(7);
  const [otmCsp, setOtmCsp] = useState(3);

  function handleSubChange(id) {
    setSub(id);
    localStorage.setItem('opt_optimizer_sub', id);
  }

  const run = useCallback(async (strat = 'all') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        strategy: strat,
        dte: String(dte),
        otm_cc: String(otmCc),
        otm_csp: String(otmCsp),
      });
      const r = await fetch(`${API_URL}/api/options/optimizer?${params}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Error desconocido');
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dte, otmCc, otmCsp]);

  function handleCopy(row) {
    const order = ibOrderString(row);
    navigator.clipboard.writeText(order).then(() => {
      setCopied(order);
      setTimeout(() => setCopied(null), 3000);
    }).catch(() => {
      setCopied(order); // still show even if clipboard blocked
      setTimeout(() => setCopied(null), 4000);
    });
  }

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' };
  const hd   = { fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fb)', marginBottom: 12 };
  const inputStyle = {
    width: 60, textAlign: 'center',
    background: 'var(--input-bg, var(--card))',
    border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-primary)',
    fontFamily: 'var(--fm)', fontSize: 12,
    padding: '4px 6px',
  };
  const labelStyle = { fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginBottom: 3 };

  // Rows for active sub-tab
  const ccRows    = data?.covered_calls     || [];
  const cspRows   = data?.cash_secured_puts || [];
  const leapRows  = data?.leaps             || [];

  const generatedAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header controls ── */}
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={labelStyle}>Target DTE</div>
          <input type="number" min={7} max={90} value={dte} onChange={e => setDte(Number(e.target.value) || 37)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={labelStyle}>CC OTM %</div>
          <input type="number" min={1} max={30} step={0.5} value={otmCc} onChange={e => setOtmCc(Number(e.target.value) || 7)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={labelStyle}>CSP OTM %</div>
          <input type="number" min={0} max={20} step={0.5} value={otmCsp} onChange={e => setOtmCsp(Number(e.target.value) || 3)} style={inputStyle} />
        </div>
        <button onClick={() => run('all')} disabled={loading}
          style={{
            padding: '8px 20px', borderRadius: 8,
            background: loading ? 'var(--border)' : 'var(--gold)',
            color: loading ? 'var(--text-tertiary)' : '#000',
            border: 'none', fontWeight: 700, fontSize: 12,
            fontFamily: 'var(--fb)', cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all .15s',
          }}>
          {loading ? 'Calculando...' : 'Analizar Oportunidades'}
        </button>
        {generatedAt && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', alignSelf: 'center' }}>
            Actualizado {generatedAt}
          </span>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--red-dim, rgba(239,68,68,.1))', border: '1px solid var(--red)', borderRadius: 10, color: 'var(--red)', fontSize: 12, fontFamily: 'var(--fm)' }}>
          Error: {error}
        </div>
      )}

      {/* ── Copied toast ── */}
      {copied && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', background: 'var(--card)', border: '1px solid var(--gold)',
          borderRadius: 10, zIndex: 9999, fontSize: 11, fontFamily: 'var(--fm)',
          color: 'var(--text-primary)', maxWidth: '90vw', wordBreak: 'break-all',
          boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        }}>
          Copiado: <span style={{ color: 'var(--gold)' }}>{copied}</span>
        </div>
      )}

      {/* ── Summary ── */}
      {data && <SummaryCards summary={data.summary} />}

      {/* ── Sub-tabs ── */}
      {data && (
        <div style={card}>
          <SubTabs active={sub} onChange={handleSubChange} />

          {sub === 'cc' && (
            <>
              <div style={hd}>Covered Calls — {ccRows.length} oportunidades (ordenado por rendimiento anualizado)</div>
              {ccRows.length === 0
                ? <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontFamily: 'var(--fm)', padding: '20px 0' }}>No se encontraron CCs. Asegura que tienes posiciones con &ge;100 acciones.</div>
                : <CCTable rows={ccRows} onCopy={handleCopy} />}
            </>
          )}

          {sub === 'csp' && (
            <>
              <div style={hd}>Cash-Secured Puts — {cspRows.length} candidatos de la Cantera</div>
              {cspRows.length === 0
                ? <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontFamily: 'var(--fm)', padding: '20px 0' }}>No se encontraron CSPs. Añade tickers a la Cantera.</div>
                : <CSPTable rows={cspRows} onCopy={handleCopy} />}
            </>
          )}

          {sub === 'leaps' && (
            <>
              <div style={hd}>LEAPS — Long Calls de alta convicción (~1 año, delta ~0.75)</div>
              {leapRows.length === 0
                ? <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontFamily: 'var(--fm)', padding: '20px 0' }}>No se encontraron LEAPS disponibles.</div>
                : <LEAPSTable rows={leapRows} onCopy={handleCopy} />}
            </>
          )}
        </div>
      )}

      {/* ── Empty state before first run ── */}
      {!data && !loading && !error && (
        <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fb)', marginBottom: 6 }}>
            Options Income Optimizer
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', maxWidth: 380, margin: '0 auto 20px' }}>
            Analiza tu cartera y la Cantera para encontrar las mejores oportunidades de income: Covered Calls OTM 5-12%, Cash-Secured Puts y LEAPS de alta conviccion.
          </div>
          <button onClick={() => run('all')}
            style={{ padding: '10px 28px', borderRadius: 10, background: 'var(--gold)', color: '#000', border: 'none', fontWeight: 700, fontSize: 13, fontFamily: 'var(--fb)', cursor: 'pointer' }}>
            Analizar ahora
          </button>
        </div>
      )}

      {/* ── Loading placeholder ── */}
      {loading && (
        <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
            Fetching chains de Yahoo Finance... esto puede tardar 20-40s para 30+ posiciones.
          </div>
        </div>
      )}

    </div>
  );
}
