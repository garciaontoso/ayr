import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, _sl, n, fDol } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';

/* ═══════════════════════════════════════════
   AI Advisor Dashboard — A&R v3.2
   6 sections: Health Score, Acciones Requeridas,
   Income Optimization, Dividend Risk Radar,
   Valuation Opportunities, Quick Analysis
   ═══════════════════════════════════════════ */

// ── Styles ──
const GOLD = '#d69e2e';
const GOLD_DIM = 'rgba(214,158,46,.12)';
const RED = '#f87171';
const YELLOW = '#f59e0b';
const GREEN = '#34d399';
const CARD_BG = 'var(--card)';
const BORDER = 'var(--border)';
const FM = 'var(--fm)';
const FB = 'var(--fb)';

const card = (extra = {}) => ({
  background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16,
  padding: '20px 24px', ...extra,
});
const sectionTitle = { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FB, marginBottom: 14 };
const subLabel = { fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, letterSpacing: .5, textTransform: 'uppercase' };
const pillStyle = (color) => ({
  fontSize: 9, padding: '3px 10px', borderRadius: 6,
  background: `${color}15`, color, fontWeight: 700, fontFamily: FM, letterSpacing: .5,
});

// ── Circular gauge SVG ──
function CircularGauge({ score, size = 140 }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = circ * (1 - pct);
  const color = score >= 70 ? GREEN : score >= 40 ? YELLOW : RED;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--subtle-border)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset .8s ease, stroke .4s ease' }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={36} fontWeight={800} fontFamily={FM}
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>{score}</text>
    </svg>
  );
}

// ── Expandable card wrapper ──
function ExpandCard({ children, defaultOpen = true, title, count, color }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
        cursor: 'pointer', padding: '6px 0', width: '100%', textAlign: 'left',
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', transition: 'transform .2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
        <span style={{ ...pillStyle(color) }}>{title}</span>
        {count != null && <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: FM }}>{count}</span>}
      </button>
      {open && <div style={{ paddingLeft: 4 }}>{children}</div>}
    </div>
  );
}

// ── Position mini-card ──
function PositionCard({ item, onClick, expanded, onToggle }) {
  const { ticker, name, score, verdict, color, reason, action, weight, divYield, pnlPct, alerts, positives, sector } = item;
  return (
    <div style={{
      ...card({ padding: '14px 18px', borderLeft: `4px solid ${color}`, marginBottom: 6, cursor: 'pointer', transition: 'all .2s' }),
    }}
      onClick={onToggle}
      onMouseEnter={e => e.currentTarget.style.background = `${color}06`}
      onMouseLeave={e => e.currentTarget.style.background = CARD_BG}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, overflow: 'hidden', background: 'var(--subtle-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={`https://images.financialmodelingprep.com/symbol/${ticker}.png`} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }}
              onError={e => { e.target.style.display = 'none'; }} />
          </div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: GOLD, fontFamily: FM, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onClick?.(ticker); }}>{ticker}</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, marginLeft: 8 }}>{name}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}><div style={subLabel}>SCORE</div><div style={{ fontSize: 16, fontWeight: 800, color: score >= 70 ? GREEN : score >= 50 ? YELLOW : RED, fontFamily: FM }}>{score}</div></div>
          <div style={{ textAlign: 'right' }}><div style={subLabel}>PESO</div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: FM }}>{_sf(weight, 1)}%</div></div>
          <div style={{ textAlign: 'right' }}><div style={subLabel}>YIELD</div><div style={{ fontSize: 12, fontWeight: 600, color: GOLD, fontFamily: FM }}>{_sf(divYield, 1)}%</div></div>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', transition: 'transform .2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
        </div>
      </div>
      {/* Key reason line */}
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: FM, marginTop: 6, paddingLeft: 38 }}>{reason}</div>
      {action && <div style={{ fontSize: 9, color, fontFamily: FM, fontWeight: 600, marginTop: 4, paddingLeft: 38 }}>{action}</div>}

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: 12, paddingLeft: 38, display: 'flex', gap: 16 }}>
          {positives?.length > 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {positives.map((p, i) => <div key={i} style={{ fontSize: 9, fontFamily: FM, color: GREEN, paddingLeft: 8, borderLeft: '2px solid rgba(52,211,153,.3)' }}>{p}</div>)}
            </div>
          )}
          {alerts?.length > 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {alerts.map((a, i) => <div key={i} style={{ fontSize: 9, fontFamily: FM, color: a.sev === 'high' ? RED : a.sev === 'med' ? YELLOW : 'var(--text-tertiary)', paddingLeft: 8, borderLeft: `2px solid ${a.sev === 'high' ? 'rgba(248,113,113,.3)' : a.sev === 'med' ? 'rgba(245,158,11,.3)' : 'var(--subtle-bg2)'}` }}>{a.msg}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════
// What-If Scenario Simulator Component
// ═══════════════════════════════════════

const wifInputStyle = {
  padding: '8px 12px', borderRadius: 8,
  border: `1px solid var(--border)`, background: 'var(--subtle-bg)',
  color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)',
  outline: 'none', width: '100%',
};

const wifLabelStyle = { fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: .5, textTransform: 'uppercase', marginBottom: 4 };

const wifResultRow = (label, value, color = 'var(--text-secondary)') => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--subtle-bg)' }}>
    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'var(--fm)' }}>{value}</span>
  </div>
);

function WhatIfSimulator({
  portfolioList, portfolioTotals, analysis, hide, hideN, fxRates, displayCcy,
  wifMode, setWifMode,
  wifSellTicker, setWifSellTicker, wifSellShares, setWifSellShares,
  wifBuyTicker, setWifBuyTicker, wifBuyAmount, setWifBuyAmount,
  wifSwapSellTicker, setWifSwapSellTicker, wifSwapBuyTicker, setWifSwapBuyTicker,
  wifSwapPct, setWifSwapPct,
}) {
  const activePositions = useMemo(() =>
    portfolioList.filter(p => (p.shares || 0) > 0).sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0)),
    [portfolioList]
  );

  const nlv = portfolioTotals?.nlv || portfolioTotals?.totalValue || 1;
  const totalDiv = portfolioTotals?.totalDiv || portfolioList.reduce((s, p) => s + ((p.divTTM || 0) * (p.shares || 0)), 0);

  // ── Sell simulation ──
  const sellSim = useMemo(() => {
    if (!wifSellTicker) return null;
    const pos = activePositions.find(p => p.ticker === wifSellTicker);
    if (!pos) return null;
    const sharesToSell = Math.min(Math.max(0, parseInt(wifSellShares) || 0), pos.shares || 0);
    if (sharesToSell <= 0) return { pos, sharesToSell: 0, preview: true };
    const price = pos.lastPrice || 0;
    const valueFreed = sharesToSell * price;
    const divPerShare = pos.divTTM || 0;
    const divLost = sharesToSell * divPerShare;
    const remainingShares = (pos.shares || 0) - sharesToSell;
    const remainingValue = remainingShares * price;
    const newNlv = nlv; // NLV stays the same (cash replaces equity)
    const oldWeight = (pos.usdValue || 0) / nlv * 100;
    const newWeight = remainingValue / nlv * 100;
    return {
      pos, sharesToSell, preview: false,
      currentShares: pos.shares, currentValue: pos.usdValue || 0,
      currentWeight: oldWeight, currentAnnualDiv: (pos.divTTM || 0) * (pos.shares || 0),
      valueFreed, divLost, remainingShares, remainingValue, newWeight,
    };
  }, [wifSellTicker, wifSellShares, activePositions, nlv]);

  // ── Buy simulation ──
  const buySim = useMemo(() => {
    if (!wifBuyTicker) return null;
    const amount = parseFloat(wifBuyAmount) || 0;
    // Try to find in portfolio first
    const existing = activePositions.find(p => p.ticker === wifBuyTicker.toUpperCase());
    const price = existing?.lastPrice || 0;
    const divPerShare = existing?.divTTM || 0;
    const divYield = existing?.divYield || 0;
    if (!price || amount <= 0) return { ticker: wifBuyTicker.toUpperCase(), existing, price, needsPrice: !price, preview: true };
    const newShares = Math.floor(amount / price);
    if (newShares <= 0) return { ticker: wifBuyTicker.toUpperCase(), existing, price, preview: true };
    const actualCost = newShares * price;
    const newDivIncome = newShares * divPerShare;
    const existingShares = existing?.shares || 0;
    const existingValue = existing?.usdValue || 0;
    const totalShares = existingShares + newShares;
    const totalValue = existingValue + actualCost;
    const newWeight = totalValue / nlv * 100;
    const oldWeight = existingValue / nlv * 100;
    const oldPortfolioYield = nlv > 0 ? totalDiv / nlv * 100 : 0;
    const newPortfolioYield = nlv > 0 ? (totalDiv + newDivIncome) / nlv * 100 : 0;
    return {
      ticker: wifBuyTicker.toUpperCase(), existing, price, preview: false,
      amount, newShares, actualCost, newDivIncome, divYield,
      existingShares, totalShares, oldWeight, newWeight, totalValue,
      oldPortfolioYield, newPortfolioYield,
    };
  }, [wifBuyTicker, wifBuyAmount, activePositions, nlv, totalDiv]);

  // ── Swap simulation ──
  const swapSim = useMemo(() => {
    if (!wifSwapSellTicker || !wifSwapBuyTicker) return null;
    const sellPos = activePositions.find(p => p.ticker === wifSwapSellTicker);
    const buyPos = activePositions.find(p => p.ticker === wifSwapBuyTicker.toUpperCase());
    if (!sellPos) return null;
    const pct = Math.max(0, Math.min(100, wifSwapPct));
    const sellValue = (sellPos.usdValue || 0) * pct / 100;
    const sellShares = Math.floor((sellPos.shares || 0) * pct / 100);
    const sellDivLost = sellShares * (sellPos.divTTM || 0);
    const buyPrice = buyPos?.lastPrice || 0;
    if (!buyPrice) return { sellPos, buyTicker: wifSwapBuyTicker.toUpperCase(), needsPrice: true };
    const buyShares = Math.floor(sellValue / buyPrice);
    const buyDivGained = buyShares * (buyPos?.divTTM || 0);
    const netDivChange = buyDivGained - sellDivLost;
    const sellRemaining = (sellPos.shares || 0) - sellShares;
    const sellNewWeight = (sellRemaining * (sellPos.lastPrice || 0)) / nlv * 100;
    const buyExistingShares = buyPos?.shares || 0;
    const buyTotalShares = buyExistingShares + buyShares;
    const buyNewWeight = (buyTotalShares * buyPrice) / nlv * 100;
    const sellOldYield = sellPos.divYield || 0;
    const buyNewYield = buyPos?.divYield || 0;
    // Sector diversification
    const sellSector = sellPos.sector || 'Otros';
    const buySector = buyPos?.sector || 'Otros';
    const sameSector = sellSector === buySector;
    return {
      sellPos, buyPos, buyTicker: wifSwapBuyTicker.toUpperCase(), pct,
      sellValue, sellShares, sellDivLost, buyPrice, buyShares, buyDivGained,
      netDivChange, sellRemaining, sellNewWeight, buyExistingShares,
      buyTotalShares, buyNewWeight, sellOldYield, buyNewYield,
      sellSector, buySector, sameSector, needsPrice: false,
    };
  }, [wifSwapSellTicker, wifSwapBuyTicker, wifSwapPct, activePositions, nlv]);

  const tabBtn = (mode, label, icon) => (
    <button onClick={() => setWifMode(mode)} style={{
      padding: '8px 18px', borderRadius: 8, border: `1px solid ${wifMode === mode ? GOLD + '50' : 'var(--border)'}`,
      background: wifMode === mode ? GOLD_DIM : 'transparent',
      color: wifMode === mode ? GOLD : 'var(--text-tertiary)',
      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: FM,
      transition: 'all .2s',
    }}>
      {icon} {label}
    </button>
  );

  const posSelect = (value, onChange, label) => (
    <div style={{ flex: 1 }}>
      <div style={wifLabelStyle}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...wifInputStyle, cursor: 'pointer', appearance: 'auto' }}>
        <option value="">— Seleccionar —</option>
        {activePositions.map(p => (
          <option key={p.ticker} value={p.ticker}>
            {p.ticker} — {_sf(p.shares, 0)} acc — ${_sl(p.usdValue || 0)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div style={{
      ...card({ padding: '24px 28px' }),
      background: 'linear-gradient(135deg, rgba(214,158,46,.02) 0%, rgba(0,0,0,0) 60%)',
      border: `1px solid ${GOLD}12`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={sectionTitle}>{"\u00bfQu\u00e9 pasar\u00eda si...?"}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {tabBtn('sell', 'Vender', '\u{1F4E4}')}
          {tabBtn('buy', 'Comprar', '\u{1F6D2}')}
          {tabBtn('swap', 'Rotar', '\u{1F504}')}
        </div>
      </div>

      {/* ── SELL MODE ── */}
      {wifMode === 'sell' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {posSelect(wifSellTicker, setWifSellTicker, 'Posicion a vender')}
            <div style={{ width: 140 }}>
              <div style={wifLabelStyle}>Acciones a vender</div>
              <input type="number" min="0" max={sellSim?.pos?.shares || 9999}
                value={wifSellShares} onChange={e => setWifSellShares(e.target.value)}
                placeholder={sellSim?.pos ? `Max: ${sellSim.pos.shares}` : '0'}
                style={wifInputStyle} />
            </div>
            {sellSim?.pos && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 2 }}>
                {[25, 50, 75, 100].map(pct => (
                  <button key={pct} onClick={() => setWifSellShares(String(Math.floor((sellSim.pos.shares || 0) * pct / 100)))}
                    style={{
                      padding: '5px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                      border: `1px solid ${BORDER}`, background: 'var(--row-alt)',
                      color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: FM,
                    }}>
                    {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {sellSim && !sellSim.preview && (
            <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(248,113,113,.04)', border: `1px solid ${RED}15` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: RED, fontFamily: FM, marginBottom: 12 }}>
                Si vendes {sellSim.sharesToSell} acciones de {wifSellTicker}:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase', letterSpacing: .5 }}>Ahora</div>
                  {wifResultRow('Acciones', hideN ? '***' : _sl(sellSim.currentShares))}
                  {wifResultRow('Valor', hideN ? '***' : `$${_sl(sellSim.currentValue)}`)}
                  {wifResultRow('Peso', `${_sf(sellSim.currentWeight, 2)}%`)}
                  {wifResultRow('Div/ano', hideN ? '***' : `$${_sl(sellSim.currentAnnualDiv)}`)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase', letterSpacing: .5 }}>Despues</div>
                  {wifResultRow('Acciones', hideN ? '***' : _sl(sellSim.remainingShares), sellSim.remainingShares === 0 ? RED : 'var(--text-secondary)')}
                  {wifResultRow('Valor', hideN ? '***' : `$${_sl(sellSim.remainingValue)}`, sellSim.remainingValue === 0 ? RED : 'var(--text-secondary)')}
                  {wifResultRow('Peso', `${_sf(sellSim.newWeight, 2)}%`, sellSim.newWeight === 0 ? RED : 'var(--text-secondary)')}
                  {wifResultRow('Div/ano', hideN ? '***' : `$${_sl(sellSim.currentAnnualDiv - sellSim.divLost)}`, RED)}
                </div>
              </div>
              <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--row-alt)', display: 'flex', gap: 20, justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase' }}>Capital liberado</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: GREEN, fontFamily: FM }}>{hideN ? '***' : `$${_sl(sellSim.valueFreed)}`}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase' }}>Dividendo perdido/ano</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: RED, fontFamily: FM }}>{hideN ? '***' : `-$${_sl(sellSim.divLost)}`}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase' }}>Cambio de peso</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: YELLOW, fontFamily: FM }}>-{_sf(sellSim.currentWeight - sellSim.newWeight, 2)}%</div>
                </div>
              </div>
            </div>
          )}

          {sellSim?.preview && wifSellTicker && (
            <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--row-alt)', border: `1px solid var(--border)` }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: FM }}>
                <strong style={{ color: GOLD }}>{wifSellTicker}</strong>: {hideN ? '***' : `${_sl(sellSim.pos?.shares || 0)} acciones`} — Valor: {hideN ? '***' : `$${_sl(sellSim.pos?.usdValue || 0)}`} — Peso: {_sf((sellSim.pos?.usdValue || 0) / nlv * 100, 2)}% — Div/ano: {hideN ? '***' : `$${_sl((sellSim.pos?.divTTM || 0) * (sellSim.pos?.shares || 0))}`}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, marginTop: 6 }}>Introduce el numero de acciones a vender para ver la simulacion</div>
            </div>
          )}
        </div>
      )}

      {/* ── BUY MODE ── */}
      {wifMode === 'buy' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={wifLabelStyle}>Ticker a comprar</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" value={wifBuyTicker}
                  onChange={e => setWifBuyTicker(e.target.value.toUpperCase())}
                  placeholder="Ej: AAPL"
                  style={{ ...wifInputStyle, width: 100, flex: 'none' }} />
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                  {activePositions.slice(0, 10).map(p => (
                    <button key={p.ticker} onClick={() => setWifBuyTicker(p.ticker)}
                      style={{
                        padding: '3px 7px', borderRadius: 4, fontSize: 8, fontWeight: 600,
                        border: `1px solid ${wifBuyTicker === p.ticker ? GOLD + '50' : 'var(--border)'}`,
                        background: wifBuyTicker === p.ticker ? GOLD_DIM : 'transparent',
                        color: wifBuyTicker === p.ticker ? GOLD : 'var(--text-tertiary)',
                        cursor: 'pointer', fontFamily: FM,
                      }}>
                      {p.ticker}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ width: 160 }}>
              <div style={wifLabelStyle}>Monto a invertir ($)</div>
              <input type="number" min="0" value={wifBuyAmount}
                onChange={e => setWifBuyAmount(e.target.value)}
                placeholder="Ej: 5000"
                style={wifInputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 2 }}>
              {[1000, 5000, 10000, 25000].map(amt => (
                <button key={amt} onClick={() => setWifBuyAmount(String(amt))}
                  style={{
                    padding: '5px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                    border: `1px solid ${BORDER}`, background: 'var(--row-alt)',
                    color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: FM,
                  }}>
                  ${amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              ))}
            </div>
          </div>

          {buySim && !buySim.preview && (
            <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(52,211,153,.04)', border: `1px solid ${GREEN}15` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, fontFamily: FM, marginBottom: 12 }}>
                Si compras ${_sl(buySim.actualCost)} de {buySim.ticker}:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase', letterSpacing: .5 }}>Compra</div>
                  {wifResultRow('Acciones nuevas', `+${_sl(buySim.newShares)}`)}
                  {wifResultRow('Precio', `$${_sf(buySim.price, 2)}`)}
                  {wifResultRow('Coste real', hideN ? '***' : `$${_sl(buySim.actualCost)}`)}
                  {wifResultRow('Yield del ticker', `${_sf(buySim.divYield, 2)}%`, GOLD)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase', letterSpacing: .5 }}>Posicion resultante</div>
                  {wifResultRow('Total acciones', hideN ? '***' : _sl(buySim.totalShares))}
                  {wifResultRow('Valor total', hideN ? '***' : `$${_sl(buySim.totalValue)}`)}
                  {wifResultRow('Peso anterior', `${_sf(buySim.oldWeight, 2)}%`)}
                  {wifResultRow('Peso nuevo', `${_sf(buySim.newWeight, 2)}%`, buySim.newWeight > 8 ? YELLOW : GREEN)}
                </div>
              </div>
              <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--row-alt)', display: 'flex', gap: 20, justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase' }}>Div. nuevo / ano</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: GREEN, fontFamily: FM }}>{hideN ? '***' : `+$${_sl(buySim.newDivIncome)}`}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase' }}>Yield cartera antes</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-secondary)', fontFamily: FM }}>{_sf(buySim.oldPortfolioYield, 2)}%</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase' }}>Yield cartera despues</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: buySim.newPortfolioYield > buySim.oldPortfolioYield ? GREEN : RED, fontFamily: FM }}>{_sf(buySim.newPortfolioYield, 2)}%</div>
                </div>
              </div>
              {buySim.newWeight > 8 && (
                <div style={{ marginTop: 10, padding: '6px 12px', borderRadius: 6, background: 'rgba(245,158,11,.06)', border: `1px solid ${YELLOW}20`, fontSize: 9, color: YELLOW, fontFamily: FM }}>
                  Peso resultante {_sf(buySim.newWeight, 1)}% — considera si la concentracion es adecuada
                </div>
              )}
            </div>
          )}

          {buySim?.preview && wifBuyTicker && (
            <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--row-alt)', border: `1px solid var(--border)` }}>
              {buySim.needsPrice ? (
                <div style={{ fontSize: 10, color: YELLOW, fontFamily: FM }}>
                  <strong>{buySim.ticker}</strong> no esta en tu cartera — solo se pueden simular compras de posiciones existentes (se necesita precio en vivo)
                </div>
              ) : (
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM }}>
                  <strong style={{ color: GOLD }}>{buySim.ticker}</strong> @ ${_sf(buySim.price, 2)} — Introduce un monto para ver la simulacion
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SWAP MODE ── */}
      {wifMode === 'swap' && (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
            {posSelect(wifSwapSellTicker, setWifSwapSellTicker, 'Vender')}
            <div style={{ fontSize: 18, color: 'var(--text-tertiary)', paddingBottom: 8 }}>{'\u2192'}</div>
            <div style={{ flex: 1 }}>
              <div style={wifLabelStyle}>Comprar</div>
              <select value={wifSwapBuyTicker} onChange={e => setWifSwapBuyTicker(e.target.value)} style={{ ...wifInputStyle, cursor: 'pointer', appearance: 'auto' }}>
                <option value="">— Seleccionar —</option>
                {activePositions.filter(p => p.ticker !== wifSwapSellTicker).map(p => (
                  <option key={p.ticker} value={p.ticker}>
                    {p.ticker} — Yield {_sf(p.divYield || 0, 1)}% — ${_sl(p.lastPrice || 0)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 120 }}>
              <div style={wifLabelStyle}>% a rotar: {wifSwapPct}%</div>
              <input type="range" min="10" max="100" step="5" value={wifSwapPct}
                onChange={e => setWifSwapPct(Number(e.target.value))}
                style={{ width: '100%', accentColor: GOLD }} />
            </div>
          </div>

          {swapSim && !swapSim.needsPrice && (
            <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(214,158,46,.04)', border: `1px solid ${GOLD}15` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, fontFamily: FM, marginBottom: 12 }}>
                Vender {_sf(swapSim.pct, 0)}% de {wifSwapSellTicker} y comprar {swapSim.buyTicker}:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                {/* Sell side */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 8, color: RED, fontFamily: FM, textTransform: 'uppercase', letterSpacing: .5, fontWeight: 700 }}>Vendes ({wifSwapSellTicker})</div>
                  {wifResultRow('Acciones', hideN ? '***' : _sl(swapSim.sellShares))}
                  {wifResultRow('Valor', hideN ? '***' : `$${_sl(swapSim.sellValue)}`)}
                  {wifResultRow('Quedan', hideN ? '***' : `${_sl(swapSim.sellRemaining)} acc`)}
                  {wifResultRow('Peso nuevo', `${_sf(swapSim.sellNewWeight, 2)}%`)}
                  {wifResultRow('Div. perdido', hideN ? '***' : `-$${_sl(swapSim.sellDivLost)}/a`, RED)}
                </div>
                {/* Buy side */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 8, color: GREEN, fontFamily: FM, textTransform: 'uppercase', letterSpacing: .5, fontWeight: 700 }}>Compras ({swapSim.buyTicker})</div>
                  {wifResultRow('Acciones', `+${_sl(swapSim.buyShares)}`)}
                  {wifResultRow('Total acc.', hideN ? '***' : _sl(swapSim.buyTotalShares))}
                  {wifResultRow('Peso nuevo', `${_sf(swapSim.buyNewWeight, 2)}%`)}
                  {wifResultRow('Yield', `${_sf(swapSim.buyNewYield, 2)}%`, GOLD)}
                  {wifResultRow('Div. ganado', hideN ? '***' : `+$${_sl(swapSim.buyDivGained)}/a`, GREEN)}
                </div>
                {/* Net result */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center', padding: '10px 14px', background: 'var(--row-alt)', borderRadius: 10 }}>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase', letterSpacing: .5, fontWeight: 700 }}>Resultado neto</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase' }}>Cambio div/ano</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: swapSim.netDivChange >= 0 ? GREEN : RED, fontFamily: FM }}>
                      {hideN ? '***' : `${swapSim.netDivChange >= 0 ? '+' : ''}$${_sl(swapSim.netDivChange)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase' }}>Yield: {_sf(swapSim.sellOldYield, 1)}% {'\u2192'} {_sf(swapSim.buyNewYield, 1)}%</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: swapSim.buyNewYield >= swapSim.sellOldYield ? GREEN : RED, fontFamily: FM }}>
                      {swapSim.buyNewYield >= swapSim.sellOldYield ? '\u2191' : '\u2193'} {_sf(Math.abs(swapSim.buyNewYield - swapSim.sellOldYield), 2)}%
                    </div>
                  </div>
                  {!swapSim.sameSector && (
                    <div style={{ textAlign: 'center', marginTop: 4 }}>
                      <div style={{ fontSize: 8, color: GREEN, fontFamily: FM, textTransform: 'uppercase' }}>Diversificacion</div>
                      <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: FM }}>{swapSim.sellSector} {'\u2192'} {swapSim.buySector}</div>
                    </div>
                  )}
                  {swapSim.sameSector && (
                    <div style={{ textAlign: 'center', marginTop: 4 }}>
                      <div style={{ fontSize: 8, color: YELLOW, fontFamily: FM }}>Mismo sector ({swapSim.sellSector})</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {swapSim?.needsPrice && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(245,158,11,.06)', border: `1px solid ${YELLOW}20` }}>
              <span style={{ fontSize: 10, color: YELLOW, fontFamily: FM }}>
                {swapSim.buyTicker} no tiene precio disponible — selecciona una posicion existente
              </span>
            </div>
          )}

          {(!wifSwapSellTicker || !wifSwapBuyTicker) && (
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, textAlign: 'center', padding: 16 }}>
              Selecciona una posicion a vender y otra a comprar para simular la rotacion
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default function AdvisorTab() {
  const {
    portfolioList, portfolioTotals, screenerData,
    openAnalysis, POS_STATIC, hide, hideN,
    fxRates, displayCcy,
  } = useHome();

  // ── State ──
  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [expandedTicker, setExpandedTicker] = useState(null);
  const [quickTicker, setQuickTicker] = useState('');
  const [quickResult, setQuickResult] = useState(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState(null);
  const [showMantener, setShowMantener] = useState(false);
  const progressRef = useRef(null);

  // ── What-If Simulator State ──
  const [wifMode, setWifMode] = useState('sell'); // 'sell' | 'buy' | 'swap'
  const [wifSellTicker, setWifSellTicker] = useState('');
  const [wifSellShares, setWifSellShares] = useState('');
  const [wifBuyTicker, setWifBuyTicker] = useState('');
  const [wifBuyAmount, setWifBuyAmount] = useState('');
  const [wifSwapSellTicker, setWifSwapSellTicker] = useState('');
  const [wifSwapBuyTicker, setWifSwapBuyTicker] = useState('');
  const [wifSwapPct, setWifSwapPct] = useState(100);

  // ── Screener map ──
  const sData = screenerData?.screener || [];
  const sMap = useMemo(() => {
    const m = {};
    sData.forEach(s => { m[s.symbol] = s; });
    return m;
  }, [sData]);

  // ── Load cached AI analysis on mount ──
  useEffect(() => {
    const cached = localStorage.getItem('ayr-ai-analysis');
    if (cached) {
      try { setAiData(JSON.parse(cached)); } catch { /* ignore */ }
    }
  }, []);

  // ── Fetch cached results from API ──
  const fetchCachedAnalysis = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/ai-analysis`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && !data.error) {
          setAiData(data);
          localStorage.setItem('ayr-ai-analysis', JSON.stringify(data));
        }
      }
    } catch { /* API not available — use local */ }
  }, []);

  useEffect(() => { fetchCachedAnalysis(); }, [fetchCachedAnalysis]);

  // ── Trigger full AI portfolio analysis ──
  const runFullAnalysis = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    setAnalyzeProgress(0);

    // Simulate progress for UX
    const interval = setInterval(() => {
      setAnalyzeProgress(prev => {
        if (prev >= 90) { clearInterval(interval); return 90; }
        return prev + Math.random() * 15;
      });
    }, 500);

    try {
      const payload = portfolioList
        .filter(p => (p.shares || 0) > 0)
        .map(p => ({
          ticker: p.ticker, name: p.name, price: p.lastPrice, shares: p.shares,
          weight: p.weight, pnlPct: p.pnlPct, divYield: p.divYield,
          sector: p.sector, usdValue: p.usdValue,
          screener: sMap[p.ticker] || null,
        }));

      const resp = await fetch(`${API_URL}/api/ai-analyze-portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions: payload, nlv: portfolioTotals?.nlv }),
      });

      clearInterval(interval);
      setAnalyzeProgress(100);

      if (resp.ok) {
        const data = await resp.json();
        setAiData(data);
        localStorage.setItem('ayr-ai-analysis', JSON.stringify(data));
      } else {
        setAiError('Error del servidor — intenta de nuevo');
      }
    } catch (err) {
      clearInterval(interval);
      setAiError(`Error de red: ${err.message}`);
    } finally {
      setTimeout(() => { setAiLoading(false); setAnalyzeProgress(0); }, 600);
    }
  }, [portfolioList, portfolioTotals, sMap]);

  // ── Quick single-stock analysis ──
  const runQuickAnalysis = useCallback(async () => {
    if (!quickTicker.trim()) return;
    setQuickLoading(true);
    setQuickError(null);
    setQuickResult(null);
    try {
      const resp = await fetch(`${API_URL}/api/ai-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: quickTicker.trim().toUpperCase() }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setQuickResult(data);
      } else {
        setQuickError('No se pudo analizar — endpoint no disponible');
      }
    } catch (err) {
      setQuickError(`Error: ${err.message}`);
    } finally {
      setQuickLoading(false);
    }
  }, [quickTicker]);

  // ═══════════════════════════════════════
  // LOCAL ANALYSIS ENGINE (works without AI API)
  // ═══════════════════════════════════════
  const analysis = useMemo(() => {
    const totalValue = portfolioTotals?.totalValue || portfolioList.reduce((s, p) => s + (p.usdValue || 0), 0) || 1;
    const nlv = portfolioTotals?.nlv || totalValue;

    // Build analyzed positions
    const analyzed = portfolioList
      .filter(p => (p.shares || 0) > 0)
      .map(p => {
        const s = sMap[p.ticker] || {};
        const weightPct = (p.usdValue || 0) / totalValue * 100;
        const alerts = [];
        const positives = [];
        const score = s.score || 0;

        // ── Negatives ──
        if (s.payoutFCF > 100) alerts.push({ msg: `Payout FCF ${s.payoutFCF}% — paga mas de lo que genera`, sev: 'high' });
        else if (s.payoutFCF > 80) alerts.push({ msg: `Payout FCF elevado (${s.payoutFCF}%)`, sev: 'med' });
        if (s.debtEBITDA > 6) alerts.push({ msg: `Deuda/EBITDA ${_sf(s.debtEBITDA, 1)}x — apalancamiento excesivo`, sev: 'high' });
        else if (s.debtEBITDA > 4) alerts.push({ msg: `Deuda/EBITDA ${_sf(s.debtEBITDA, 1)}x — deuda alta`, sev: 'med' });
        if (s.epsCAGR < -5) alerts.push({ msg: `BPA cayendo ${_sf(s.epsCAGR, 1)}% anual`, sev: 'high' });
        else if (s.epsCAGR < 0) alerts.push({ msg: `BPA decreciente (${_sf(s.epsCAGR, 1)}% CAGR)`, sev: 'med' });
        if (s.roic < 3) alerts.push({ msg: `ROIC ${_sf(s.roic, 1)}% — destruye valor`, sev: 'high' });
        else if (s.roic < 8) alerts.push({ msg: `ROIC moderado (${_sf(s.roic, 1)}%)`, sev: 'med' });
        if (s.grossMargin < 15) alerts.push({ msg: `Margen bruto ${s.grossMargin}% — negocio commodity`, sev: 'med' });
        if (s.pe < 0) alerts.push({ msg: 'PER negativo — perdidas', sev: 'high' });
        else if (s.pe > 35) alerts.push({ msg: `PER ${_sf(s.pe, 1)} — posible sobrevaloracion`, sev: 'med' });
        if ((s.discount || 0) < -30) alerts.push({ msg: `Cotiza ${Math.abs(s.discount)}% sobre su valor justo`, sev: 'med' });
        if (weightPct > 8) alerts.push({ msg: `Peso ${_sf(weightPct, 1)}% — concentracion alta`, sev: 'info' });

        // ── Positives ──
        if (s.roic > 20) positives.push(`ROIC excelente (${_sf(s.roic, 1)}%)`);
        if (s.epsCAGR > 10) positives.push(`Crecimiento BPA fuerte (${_sf(s.epsCAGR, 1)}%)`);
        if (s.grossMargin > 50) positives.push('Margen bruto >50% — ventaja competitiva');
        if (s.payoutFCF > 0 && s.payoutFCF < 50) positives.push(`Payout FCF conservador (${s.payoutFCF}%)`);
        if (s.debtEBITDA >= 0 && s.debtEBITDA < 1.5) positives.push('Deuda muy baja');
        if ((s.discount || 0) > 15) positives.push(`Infravalorada ${s.discount}% vs fair value`);
        if (s.tir > 12) positives.push(`TIR estimada ${_sf(s.tir, 1)}%`);
        if ((s.divYield || 0) > 3 && s.payoutFCF < 70) positives.push(`Yield ${_sf(s.divYield, 1)}% con payout sostenible`);

        // ── Verdict ──
        const highCount = alerts.filter(a => a.sev === 'high').length;
        let verdict, color, reason, action;
        if (score >= 75 && highCount === 0) {
          verdict = 'MANTENER'; color = GREEN;
          reason = positives[0] || 'Fundamentales solidos';
          action = null;
        } else if (score >= 60 && highCount === 0) {
          verdict = 'VIGILAR'; color = YELLOW;
          reason = alerts.find(a => a.sev === 'med')?.msg || 'Revisar periodicamente';
          action = 'Mantener pero vigilar de cerca';
        } else if (score >= 45 && highCount <= 1) {
          verdict = 'REVISAR'; color = YELLOW;
          reason = alerts[0]?.msg || 'Multiples indicadores de riesgo';
          action = 'Evaluar si mantener o reducir posicion';
        } else {
          verdict = 'VENDER'; color = RED;
          reason = alerts[0]?.msg || 'Fundamentales debiles';
          action = 'Considerar vender o recortar significativamente';
        }

        // ── Dividend risk ──
        let divRisk = 'safe';
        let divRiskLabel = 'Seguro';
        if (s.payoutFCF > 100 || s.epsCAGR < -10) { divRisk = 'danger'; divRiskLabel = 'En riesgo'; }
        else if (s.payoutFCF > 80 || s.debtEBITDA > 5 || s.epsCAGR < -2) { divRisk = 'watch'; divRiskLabel = 'Vigilar'; }

        // ── Covered call potential (rough estimate) ──
        const ccPremiumEst = (p.lastPrice || 0) * 0.015 * Math.floor((p.shares || 0) / 100); // ~1.5% monthly for 100-share lots
        const ccEnhancedYield = (p.divYield || 0) + (ccPremiumEst > 0 ? (ccPremiumEst * 12) / (p.usdValue || 1) * 100 : 0);

        return {
          ticker: p.ticker, name: p.name || s.name || p.ticker,
          score, verdict, color, reason, action,
          weight: weightPct, divYield: s.divYield || p.divYield || 0,
          pnlPct: p.pnlPct || 0, sector: s.sector || p.sector || '',
          alerts, positives,
          // Dividend risk
          divRisk, divRiskLabel,
          payoutFCF: s.payoutFCF || 0, debtEBITDA: s.debtEBITDA || 0,
          epsCAGR: s.epsCAGR || 0, divStreakYears: s.divGrowthYears || 0,
          // Valuation
          discount: s.discount || 0, fairValue: s.fairValue || 0,
          currentPrice: p.lastPrice || 0, valuationMethod: s.fairValue ? 'DCF + Relative' : '',
          pe: s.pe || 0, tir: s.tir || 0,
          // CC
          shares: p.shares || 0, ccLots: Math.floor((p.shares || 0) / 100),
          ccPremiumEst, ccEnhancedYield,
          // Raw
          roic: s.roic || 0, grossMargin: s.grossMargin || 0,
        };
      })
      .sort((a, b) => {
        const order = { VENDER: 0, REVISAR: 1, VIGILAR: 2, MANTENER: 3 };
        return (order[a.verdict] || 9) - (order[b.verdict] || 9) || (a.score || 0) - (b.score || 0);
      });

    // Counts
    const counts = { MANTENER: 0, VIGILAR: 0, REVISAR: 0, VENDER: 0 };
    analyzed.forEach(a => { counts[a.verdict] = (counts[a.verdict] || 0) + 1; });

    // Health score (weighted by portfolio value)
    const hasScreener = analyzed.filter(a => a.score > 0);
    const avgScore = hasScreener.length > 0
      ? Math.round(hasScreener.reduce((s, p) => s + p.score * p.weight, 0) / hasScreener.reduce((s, p) => s + p.weight, 0))
      : 0;

    // Dividend risk positions
    const divRiskPositions = analyzed
      .filter(a => a.divYield > 0 && a.divRisk !== 'safe')
      .sort((a, b) => (a.divRisk === 'danger' ? 0 : 1) - (b.divRisk === 'danger' ? 0 : 1));

    // Valuation opportunities
    const valuationOpps = analyzed
      .filter(a => a.discount > 0 && a.score >= 50)
      .sort((a, b) => b.discount - a.discount);

    // CC income opportunities
    const ccOpps = analyzed
      .filter(a => a.ccLots > 0 && a.shares >= 100)
      .sort((a, b) => b.ccPremiumEst - a.ccPremiumEst);

    const totalCCIncome = ccOpps.reduce((s, p) => s + p.ccPremiumEst, 0);

    // Sector concentration
    const bySector = {};
    analyzed.forEach(p => {
      const sec = p.sector || 'Otros';
      if (!bySector[sec]) bySector[sec] = { count: 0, value: 0, scores: [] };
      bySector[sec].count++;
      bySector[sec].value += p.weight;
      bySector[sec].scores.push(p.score);
    });
    Object.values(bySector).forEach(v => {
      v.avgScore = v.scores.length ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length) : 0;
    });

    return {
      analyzed, counts, avgScore, nlv, totalValue,
      divRiskPositions, valuationOpps, ccOpps, totalCCIncome, bySector,
      sell: analyzed.filter(a => a.verdict === 'VENDER'),
      review: analyzed.filter(a => a.verdict === 'REVISAR' || a.verdict === 'VIGILAR'),
      hold: analyzed.filter(a => a.verdict === 'MANTENER'),
      hasData: hasScreener.length > 0,
    };
  }, [portfolioList, portfolioTotals, sMap]);

  // ── Timestamp of last analysis ──
  const lastAnalysisDate = useMemo(() => {
    if (aiData?.timestamp) return new Date(aiData.timestamp);
    const cached = localStorage.getItem('ayr-ai-analysis');
    if (cached) try { return new Date(JSON.parse(cached).timestamp); } catch { /* ignore */ }
    return null;
  }, [aiData]);

  const timeSinceAnalysis = useMemo(() => {
    if (!lastAnalysisDate) return null;
    const diff = Date.now() - lastAnalysisDate.getTime();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    if (days > 0) return `hace ${days} dia${days > 1 ? 's' : ''}`;
    if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
    return 'hace unos minutos';
  }, [lastAnalysisDate]);

  // ── Empty state ──
  if (!analysis.hasData && !aiData) {
    return <EmptyState
      icon="🤖"
      title="Sin analisis disponible"
      subtitle="Ve al Screener y carga los fundamentales de tu cartera, o pulsa el boton de analizar para comenzar."
      action="Analizar Portfolio"
      onAction={runFullAnalysis}
    />;
  }

  const { analyzed, counts, avgScore, sell, review, hold, divRiskPositions, valuationOpps, ccOpps, totalCCIncome } = analysis;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ═══════════════════════════════════════
          SECTION 1: Portfolio Health Score — Hero
          ═══════════════════════════════════════ */}
      <div style={{
        ...card({ padding: '28px 32px' }),
        background: 'linear-gradient(135deg, rgba(214,158,46,.03) 0%, rgba(0,0,0,0) 60%)',
        border: `1px solid ${GOLD}15`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          {/* Left: gauge + info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <CircularGauge score={avgScore} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: FB }}>Portfolio Health Score</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FM, marginTop: 4 }}>
                {analyzed.length} posiciones analizadas — Score ponderado por peso
              </div>
              {timeSinceAnalysis && (
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, marginTop: 6 }}>
                  Ultima revision: {timeSinceAnalysis}
                </div>
              )}
              {/* Verdict summary pills */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {[
                  { l: 'VENDER', c: RED, n: counts.VENDER },
                  { l: 'REVISAR', c: YELLOW, n: counts.REVISAR + (counts.VIGILAR || 0) },
                  { l: 'MANTENER', c: GREEN, n: counts.MANTENER },
                ].map(v => (
                  <div key={v.l} style={{
                    padding: '6px 14px', borderRadius: 8,
                    background: `${v.c}10`, border: `1px solid ${v.c}20`,
                    textAlign: 'center', minWidth: 70,
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: v.c, fontFamily: FM }}>{v.n}</div>
                    <div style={{ fontSize: 8, color: v.c, fontFamily: FM, letterSpacing: .5, opacity: .7 }}>{v.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: analyze button */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button onClick={runFullAnalysis} disabled={aiLoading} style={{
              padding: '12px 28px', borderRadius: 12,
              border: `1px solid ${aiLoading ? 'var(--border)' : GOLD + '50'}`,
              background: aiLoading ? 'var(--subtle-bg)' : GOLD_DIM,
              color: aiLoading ? 'var(--text-tertiary)' : GOLD,
              fontSize: 13, fontWeight: 700, cursor: aiLoading ? 'wait' : 'pointer',
              fontFamily: FM, transition: 'all .2s',
            }}>
              {aiLoading ? 'Analizando...' : '\u{1F916} Analizar Portfolio'}
            </button>
            {/* Progress bar */}
            {aiLoading && (
              <div style={{ width: 160, height: 3, background: 'var(--subtle-bg2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${analyzeProgress}%`, height: '100%',
                  background: `linear-gradient(90deg, ${GOLD}, #b8860b)`,
                  borderRadius: 3, transition: 'width .3s ease',
                }} />
              </div>
            )}
            {aiError && <div style={{ fontSize: 9, color: RED, fontFamily: FM }}>{aiError}</div>}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SECTION 2: Acciones Requeridas
          ═══════════════════════════════════════ */}
      <div style={card()}>
        <div style={sectionTitle}>Acciones Requeridas</div>

        {/* SELL group */}
        {sell.length > 0 && (
          <ExpandCard title="VENDER / RECORTAR" count={sell.length} color={RED} defaultOpen={true}>
            {sell.map(item => (
              <PositionCard key={item.ticker} item={item} onClick={openAnalysis}
                expanded={expandedTicker === item.ticker}
                onToggle={() => setExpandedTicker(expandedTicker === item.ticker ? null : item.ticker)} />
            ))}
          </ExpandCard>
        )}

        {/* REVIEW group */}
        {review.length > 0 && (
          <ExpandCard title="REVISAR / VIGILAR" count={review.length} color={YELLOW} defaultOpen={true}>
            {review.map(item => (
              <PositionCard key={item.ticker} item={item} onClick={openAnalysis}
                expanded={expandedTicker === item.ticker}
                onToggle={() => setExpandedTicker(expandedTicker === item.ticker ? null : item.ticker)} />
            ))}
          </ExpandCard>
        )}

        {/* HOLD group */}
        {hold.length > 0 && (
          <ExpandCard title="MANTENER" count={hold.length} color={GREEN} defaultOpen={false}>
            {hold.map(item => (
              <PositionCard key={item.ticker} item={item} onClick={openAnalysis}
                expanded={expandedTicker === item.ticker}
                onToggle={() => setExpandedTicker(expandedTicker === item.ticker ? null : item.ticker)} />
            ))}
          </ExpandCard>
        )}

        {analyzed.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FM, textAlign: 'center', padding: 20 }}>
            Carga datos del screener para ver recomendaciones
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════
          SECTION 3: Income Optimization (CC)
          ═══════════════════════════════════════ */}
      {ccOpps.length > 0 && (
        <div style={card()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={sectionTitle}>Income Optimization — Covered Calls</div>
            <div style={{ textAlign: 'right' }}>
              <div style={subLabel}>INGRESO POTENCIAL / MES</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: GOLD, fontFamily: FM }}>{hideN ? '***' : `$${_sl(totalCCIncome)}`}</div>
            </div>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '80px 70px 50px 65px 80px 75px 1fr',
            gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--subtle-border)',
          }}>
            {['Ticker', 'Precio', 'Lotes', 'Yield', 'Premium/mes', 'Yield+CC', 'Estrategia'].map(h => (
              <div key={h} style={subLabel}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {ccOpps.slice(0, 15).map((p, i) => {
            const isTop5 = i < 5;
            return (
              <div key={p.ticker} style={{
                display: 'grid', gridTemplateColumns: '80px 70px 50px 65px 80px 75px 1fr',
                gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--row-alt)',
                background: isTop5 ? 'rgba(214,158,46,.03)' : 'transparent',
                cursor: 'pointer', transition: 'background .15s',
              }}
                onClick={() => openAnalysis(p.ticker)}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(214,158,46,.06)'}
                onMouseLeave={e => e.currentTarget.style.background = isTop5 ? 'rgba(214,158,46,.03)' : 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isTop5 && <span style={{ fontSize: 7, color: GOLD }}>&#9733;</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, color: isTop5 ? GOLD : 'var(--text-primary)', fontFamily: FM }}>{p.ticker}</span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: FM }}>${_sf(p.currentPrice, 2)}</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: FM }}>{p.ccLots}</span>
                <span style={{ fontSize: 10, color: GOLD, fontFamily: FM }}>{_sf(p.divYield, 1)}%</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: GREEN, fontFamily: FM }}>{hideN ? '***' : `$${_sl(p.ccPremiumEst)}`}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: p.ccEnhancedYield > 8 ? GREEN : GOLD, fontFamily: FM }}>{_sf(p.ccEnhancedYield, 1)}%</span>
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM }}>
                  {p.ccLots >= 3 ? 'Venta CC mensual' : p.ccLots >= 1 ? 'CC conservador' : '—'}
                </span>
              </div>
            );
          })}

          {/* Total row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '80px 70px 50px 65px 80px 75px 1fr',
            gap: 8, padding: '10px 12px', borderTop: '1px solid var(--subtle-bg2)', marginTop: 4,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FM }}>TOTAL</span>
            <span />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: FM }}>{ccOpps.reduce((s, p) => s + p.ccLots, 0)}</span>
            <span />
            <span style={{ fontSize: 11, fontWeight: 800, color: GREEN, fontFamily: FM }}>{hideN ? '***' : `$${_sl(totalCCIncome)}`}/m</span>
            <span />
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM }}>{hideN ? '***' : `$${_sl(totalCCIncome * 12)}`}/ano estimado</span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          SECTION 4: Dividend Risk Radar
          ═══════════════════════════════════════ */}
      {divRiskPositions.length > 0 && (
        <div style={card()}>
          <div style={sectionTitle}>Dividend Risk Radar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {divRiskPositions.map(p => {
              const riskColor = p.divRisk === 'danger' ? RED : YELLOW;
              return (
                <div key={p.ticker} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: `${riskColor}04`, border: `1px solid ${riskColor}15`,
                  borderRadius: 10, cursor: 'pointer', transition: 'all .15s',
                }}
                  onClick={() => openAnalysis(p.ticker)}
                  onMouseEnter={e => e.currentTarget.style.background = `${riskColor}08`}
                  onMouseLeave={e => e.currentTarget.style.background = `${riskColor}04`}
                >
                  {/* Risk badge */}
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: riskColor, boxShadow: `0 0 6px ${riskColor}40`,
                  }} />
                  {/* Ticker */}
                  <div style={{ minWidth: 60 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, fontFamily: FM }}>{p.ticker}</span>
                  </div>
                  {/* Risk label */}
                  <span style={{ ...pillStyle(riskColor), minWidth: 60, textAlign: 'center' }}>{p.divRiskLabel}</span>
                  {/* Metrics */}
                  <div style={{ display: 'flex', gap: 16, flex: 1 }}>
                    <div><span style={{ ...subLabel, marginRight: 4 }}>PAYOUT FCF</span><span style={{ fontSize: 10, fontWeight: 600, color: p.payoutFCF > 90 ? RED : p.payoutFCF > 70 ? YELLOW : 'var(--text-secondary)', fontFamily: FM }}>{p.payoutFCF}%</span></div>
                    <div><span style={{ ...subLabel, marginRight: 4 }}>D/EBITDA</span><span style={{ fontSize: 10, fontWeight: 600, color: p.debtEBITDA > 5 ? RED : p.debtEBITDA > 3 ? YELLOW : 'var(--text-secondary)', fontFamily: FM }}>{_sf(p.debtEBITDA, 1)}x</span></div>
                    <div><span style={{ ...subLabel, marginRight: 4 }}>CREC. BPA</span><span style={{ fontSize: 10, fontWeight: 600, color: p.epsCAGR < -5 ? RED : p.epsCAGR < 0 ? YELLOW : GREEN, fontFamily: FM }}>{_sf(p.epsCAGR, 1)}%</span></div>
                    <div><span style={{ ...subLabel, marginRight: 4 }}>STREAK</span><span style={{ fontSize: 10, fontWeight: 600, color: p.divStreakYears >= 25 ? GREEN : p.divStreakYears >= 10 ? GOLD : 'var(--text-secondary)', fontFamily: FM }}>{p.divStreakYears}a</span></div>
                  </div>
                  {/* Yield */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, fontFamily: FM }}>{_sf(p.divYield, 1)}%</div>
                    <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM }}>yield</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Safe dividends count */}
          {analyzed.filter(a => a.divYield > 0 && a.divRisk === 'safe').length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 14px', background: 'rgba(52,211,153,.03)', borderRadius: 8, border: '1px solid rgba(52,211,153,.08)' }}>
              <span style={{ fontSize: 10, color: GREEN, fontFamily: FM }}>
                {analyzed.filter(a => a.divYield > 0 && a.divRisk === 'safe').length} posiciones con dividendo seguro
              </span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          SECTION 5: Valuation Opportunities
          ═══════════════════════════════════════ */}
      {valuationOpps.length > 0 && (
        <div style={card()}>
          <div style={sectionTitle}>Valuation Opportunities — Infravaloradas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {valuationOpps.slice(0, 12).map((p, i) => {
              const barWidth = Math.min(100, p.discount);
              return (
                <div key={p.ticker} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
                  borderRadius: 8, cursor: 'pointer', transition: 'background .15s',
                  background: i < 3 ? 'rgba(52,211,153,.03)' : 'transparent',
                }}
                  onClick={() => openAnalysis(p.ticker)}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(52,211,153,.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = i < 3 ? 'rgba(52,211,153,.03)' : 'transparent'}
                >
                  <div style={{ minWidth: 60 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, fontFamily: FM }}>{p.ticker}</span>
                  </div>
                  <div style={{ minWidth: 70, textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: FM }}>${_sf(p.currentPrice, 2)}</div>
                    <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM }}>actual</div>
                  </div>
                  <div style={{ minWidth: 70, textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: GREEN, fontFamily: FM, fontWeight: 600 }}>${_sf(p.fairValue, 2)}</div>
                    <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM }}>fair value</div>
                  </div>
                  {/* Upside bar */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--subtle-border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${barWidth}%`, height: '100%',
                        background: `linear-gradient(90deg, ${GREEN}, rgba(52,211,153,.4))`,
                        borderRadius: 3, transition: 'width .4s ease',
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: GREEN, fontFamily: FM, minWidth: 40, textAlign: 'right' }}>+{_sf(p.discount, 0)}%</span>
                  </div>
                  <div style={{ minWidth: 50, textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: p.score >= 70 ? GREEN : GOLD, fontFamily: FM }}>Score {p.score}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          SECTION 6: Quick Analysis
          ═══════════════════════════════════════ */}
      <div style={card()}>
        <div style={sectionTitle}>Quick Analysis — Analisis Rapido</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <input
            type="text"
            value={quickTicker}
            onChange={e => setQuickTicker(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') runQuickAnalysis(); }}
            placeholder="Ticker (ej. AAPL)"
            style={{
              padding: '8px 14px', borderRadius: 8,
              border: `1px solid ${BORDER}`, background: 'var(--subtle-bg)',
              color: 'var(--text-primary)', fontSize: 12, fontFamily: FM,
              outline: 'none', width: 140,
            }}
          />
          <button onClick={runQuickAnalysis} disabled={quickLoading || !quickTicker.trim()} style={{
            padding: '8px 20px', borderRadius: 8,
            border: `1px solid ${GOLD}40`,
            background: quickLoading ? 'var(--subtle-bg)' : GOLD_DIM,
            color: quickLoading ? 'var(--text-tertiary)' : GOLD,
            fontSize: 11, fontWeight: 700, cursor: quickLoading ? 'wait' : 'pointer',
            fontFamily: FM,
          }}>
            {quickLoading ? 'Analizando...' : 'Analizar'}
          </button>
          {/* Quick access to portfolio tickers */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {portfolioList.filter(p => (p.shares || 0) > 0).slice(0, 8).map(p => (
              <button key={p.ticker} onClick={() => { setQuickTicker(p.ticker); }}
                style={{
                  padding: '3px 8px', borderRadius: 5, border: `1px solid ${BORDER}`,
                  background: quickTicker === p.ticker ? GOLD_DIM : 'transparent',
                  color: quickTicker === p.ticker ? GOLD : 'var(--text-tertiary)',
                  fontSize: 8, fontWeight: 600, cursor: 'pointer', fontFamily: FM,
                }}>
                {p.ticker}
              </button>
            ))}
          </div>
        </div>

        {quickError && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(248,113,113,.06)', border: `1px solid ${RED}20`, marginBottom: 10 }}>
            <span style={{ fontSize: 10, color: RED, fontFamily: FM }}>{quickError}</span>
          </div>
        )}

        {quickResult && (
          <div style={{ padding: '16px 18px', borderRadius: 10, background: 'rgba(214,158,46,.03)', border: `1px solid ${GOLD}15` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, fontFamily: FM, marginBottom: 10 }}>
              {quickResult.ticker || quickTicker}
              {quickResult.name && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FM, marginLeft: 8 }}>{quickResult.name}</span>}
            </div>
            {/* Render analysis sections if available */}
            {quickResult.analysis ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(Array.isArray(quickResult.analysis) ? quickResult.analysis : [quickResult.analysis]).map((section, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'var(--row-alt)', borderRadius: 8 }}>
                    {section.title && <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, fontFamily: FM, marginBottom: 4 }}>{section.title}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: FM, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {section.content || section.text || (typeof section === 'string' ? section : JSON.stringify(section))}
                    </div>
                  </div>
                ))}
              </div>
            ) : quickResult.summary ? (
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: FM, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{quickResult.summary}</div>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: FM, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {typeof quickResult === 'string' ? quickResult : JSON.stringify(quickResult, null, 2)}
              </div>
            )}
          </div>
        )}

        {!quickResult && !quickError && !quickLoading && (
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, textAlign: 'center', padding: 16 }}>
            Escribe un ticker y pulsa Analizar para obtener un analisis rapido de 5 perspectivas
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════
          SECTION 7: What-If Scenario Simulator
          ═══════════════════════════════════════ */}
      <WhatIfSimulator
        portfolioList={portfolioList}
        portfolioTotals={portfolioTotals}
        analysis={analysis}
        hide={hide}
        hideN={hideN}
        fxRates={fxRates}
        displayCcy={displayCcy}
        wifMode={wifMode} setWifMode={setWifMode}
        wifSellTicker={wifSellTicker} setWifSellTicker={setWifSellTicker}
        wifSellShares={wifSellShares} setWifSellShares={setWifSellShares}
        wifBuyTicker={wifBuyTicker} setWifBuyTicker={setWifBuyTicker}
        wifBuyAmount={wifBuyAmount} setWifBuyAmount={setWifBuyAmount}
        wifSwapSellTicker={wifSwapSellTicker} setWifSwapSellTicker={setWifSwapSellTicker}
        wifSwapBuyTicker={wifSwapBuyTicker} setWifSwapBuyTicker={setWifSwapBuyTicker}
        wifSwapPct={wifSwapPct} setWifSwapPct={setWifSwapPct}
      />
    </div>
  );
}
