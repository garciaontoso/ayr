import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { fDol, fSignK, _sf, f0 } from '../../utils/formatters';

export default function PortfolioPage() {
  const [tab, setTab] = useState('holdings');
  const subTabs = [
    { id: 'holdings', label: 'Holdings' },
    { id: 'transactions', label: 'Transactions' },
  ];

  return (
    <div className="page">
      <div className="sub-tabs">
        {subTabs.map(t => (
          <button key={t.id} className={`sub-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'holdings' && <HoldingsTab />}
      {tab === 'transactions' && <TransactionsTab />}
    </div>
  );
}

function HoldingsTab() {
  const { positions, privacy } = useApp();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('value');

  const sorted = useMemo(() => {
    let list = [...positions].filter(p => p.shares && p.shares > 0);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.ticker?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sortBy === 'value') return (b.usd_value || 0) - (a.usd_value || 0);
      if (sortBy === 'pnl') return (b.pnl_pct || 0) - (a.pnl_pct || 0);
      if (sortBy === 'name') return (a.ticker || '').localeCompare(b.ticker || '');
      if (sortBy === 'yield') return (b.div_yield || 0) - (a.div_yield || 0);
      return 0;
    });
    return list;
  }, [positions, search, sortBy]);

  const pv = v => privacy ? '***' : v;

  return (
    <>
      <input
        className="search-bar"
        type="text"
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6 }}>
        {['value', 'pnl', 'yield', 'name'].map(s => (
          <button key={s} className={`sub-tab ${sortBy === s ? 'active' : ''}`}
            style={{ padding: '4px 12px', fontSize: 11 }}
            onClick={() => setSortBy(s)}
          >
            {s === 'value' ? 'Value' : s === 'pnl' ? 'P&L' : s === 'yield' ? 'Yield' : 'Name'}
          </button>
        ))}
      </div>

      {sorted.map(p => {
        const val = p.usd_value || p.market_value || 0;
        const pnlPct = p.pnl_pct || 0;
        const pnlAbs = p.pnl_abs || 0;
        const isPos = pnlPct >= 0;
        const signedAbs = isPos ? Math.abs(pnlAbs) : -Math.abs(pnlAbs);

        return (
          <div key={p.ticker} className="holding-row">
            <div className="holding-logo">
              <img
                src={`https://financialmodelingprep.com/image-stock/${p.ticker}.png`}
                alt=""
                loading="lazy"
                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
              />
              <span style={{ display: 'none', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>{p.ticker?.slice(0, 3)}</span>
            </div>
            <div className="holding-info">
              <div className="holding-name">{p.name || p.ticker}</div>
              <div className="holding-ticker">
                {p.ticker} &middot; {f0(p.shares)} shares
              </div>
            </div>
            <div className="holding-values">
              <div className="holding-price">{pv(fDol(val))}</div>
              <div className={`holding-change ${isPos ? 'green' : 'red'}`}>
                {pv(`${fSignK(signedAbs)} ${isPos ? '\u25b2' : '\u25bc'} ${_sf(Math.abs(pnlPct * 100), 2)}%`)}
              </div>
            </div>
          </div>
        );
      })}

      {sorted.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
          {search ? 'No results' : 'No positions'}
        </div>
      )}
    </>
  );
}

function TransactionsTab() {
  const { divMensual, privacy } = useApp();
  const currentYear = new Date().getFullYear();

  // Show monthly dividend summary as transactions
  const months = divMensual
    .filter(m => m.mes?.startsWith(String(currentYear)))
    .sort((a, b) => b.mes.localeCompare(a.mes));

  const pv = v => privacy ? '***' : v;

  return (
    <>
      <div className="section-title">Dividend Payments ({currentYear})</div>
      {months.map(m => {
        const [y, mo] = m.mes.split('-');
        const monthName = new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return (
          <div key={m.mes} className="holding-row">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{monthName}</div>
              <div className="muted" style={{ fontSize: 12 }}>{m.cobros || 0} payments</div>
            </div>
            <div className="green" style={{ fontWeight: 600 }}>
              {pv(`+${fDol(m.neto || 0)}`)}
            </div>
          </div>
        );
      })}

      {months.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
          No transactions this year
        </div>
      )}
    </>
  );
}
