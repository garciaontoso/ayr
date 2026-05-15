import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants';
import { _sf } from '../../utils/formatters';

const ACCOUNT_LABELS = {
  'U5372268': 'Factory',
  'U6735130': 'Yo',
  'U7257686': 'Gorka',
  'U7953378': 'Mama',
};

const CURRENCY_FLAGS = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', HKD: '🇭🇰', CAD: '🇨🇦', AUD: '🇦🇺', CNY: '🇨🇳', CHF: '🇨🇭',
};

const fmtUSD = (n) => n == null ? '—' : `$${_sf(n, 0)}`;
const fmtPct = (n) => n == null ? '—' : `${(n * 100).toFixed(1)}%`;

const cushionColor = (pct) => {
  if (pct == null) return 'var(--text-tertiary)';
  if (pct >= 0.5) return 'var(--green)';
  if (pct >= 0.2) return 'var(--gold)';
  return 'var(--red)';
};

const leverageColor = (pct) => {
  if (pct == null) return 'var(--text-tertiary)';
  if (pct < 0.25) return 'var(--green)';
  if (pct < 0.4) return 'var(--gold)';
  return 'var(--red)';
};

const cashRatioColor = (cashPct) => {
  if (cashPct == null) return 'var(--text-tertiary)';
  if (cashPct >= 0.1) return 'var(--green)';
  if (cashPct >= 0.05) return 'var(--gold)';
  return 'var(--red)';
};

const Card = ({ title, value, subtitle, color, icon }) => (
  <div style={{
    flex: 1,
    minWidth: 220,
    padding: '16px 20px',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
  }}>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginBottom: 8 }}>
      {icon} {title}
    </div>
    <div style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: 'var(--fm)' }}>
      {value}
    </div>
    {subtitle && (
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--fm)' }}>
        {subtitle}
      </div>
    )}
  </div>
);

export default function LiquidezTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/liquidez/snapshot`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setData(json);
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh cada 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
        Cargando datos de liquidez en vivo...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: 20, background: 'rgba(248,113,113,.08)', border: '1px solid var(--red)', borderRadius: 12, color: 'var(--red)' }}>
        ❌ Error cargando snapshot: {error}
      </div>
    );
  }

  const totals = data?.totals || {};
  const accounts = data?.accounts || [];
  const cashByCurrency = data?.cash_by_currency || [];
  const cashTotalUsd = data?.cash_total_usd || 0;
  const cashRatio = totals.nlv_usd > 0 ? cashTotalUsd / totals.nlv_usd : 0;
  const bridgeOk = data?.bridge_ok;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)' }}>
            💰 Liquidez & Colchón
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            NLV multi-cuenta · margin status · cash multi-divisa · auto-refresh 30s
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {bridgeOk ? (
            <span style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(74,222,128,.12)', color: 'var(--green)', borderRadius: 8, fontWeight: 600 }}>
              ● BRIDGE LIVE
            </span>
          ) : (
            <span style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(248,113,113,.12)', color: 'var(--red)', borderRadius: 8, fontWeight: 600 }}>
              ● BRIDGE OFF
            </span>
          )}
          {lastFetch && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
              {lastFetch.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchData} disabled={loading} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-alt)', color: 'var(--text-primary)', cursor: loading ? 'wait' : 'pointer', fontSize: 12 }}>
            {loading ? '...' : '↻ Refrescar'}
          </button>
        </div>
      </div>

      {/* Bloque 1: Cards de resumen */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Card
          icon="📊"
          title="NLV TOTAL"
          value={fmtUSD(totals.nlv_usd)}
          subtitle={`${accounts.length} cuentas IB`}
        />
        <Card
          icon="💵"
          title="AVAILABLE FUNDS"
          value={fmtUSD(totals.available_funds_usd)}
          subtitle={`${fmtPct(totals.nlv_usd > 0 ? totals.available_funds_usd / totals.nlv_usd : 0)} del NLV`}
        />
        <Card
          icon="⚖"
          title="MARGIN USADO"
          value={fmtUSD(totals.init_margin_usd)}
          subtitle={`${fmtPct(totals.leverage_pct)} leverage`}
          color={leverageColor(totals.leverage_pct)}
        />
        <Card
          icon="🛡"
          title="COLCHÓN (Cushion)"
          value={fmtPct(totals.cushion_pct)}
          subtitle={fmtUSD(totals.excess_liquidity_usd) + ' excess liquidity'}
          color={cushionColor(totals.cushion_pct)}
        />
      </div>

      {/* Bloque 2: Cash por moneda */}
      <div style={{ padding: '16px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>💴 Cash por moneda</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              Consolidado de las {accounts.length} cuentas IB
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: cashRatioColor(cashRatio), fontFamily: 'var(--fm)' }}>
              {fmtUSD(cashTotalUsd)}
            </div>
            <div style={{ fontSize: 11, color: cashRatioColor(cashRatio), fontFamily: 'var(--fm)' }}>
              {fmtPct(cashRatio)} del NLV
            </div>
          </div>
        </div>

        {data?.cash_warning && (
          <div style={{ padding: '8px 12px', background: 'rgba(200,164,78,.08)', border: '1px solid var(--gold)', borderRadius: 8, fontSize: 11, color: 'var(--gold)', marginBottom: 10 }}>
            ⚠ {data.cash_warning}
          </div>
        )}

        {cashByCurrency.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
            Sin datos de cash por moneda (tabla cash_balances vacía o sin sync)
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cashByCurrency.map(c => {
              const isNegative = c.balance_usd < 0;
              const pctNlv = totals.nlv_usd > 0 ? Math.abs(c.balance_usd) / totals.nlv_usd : 0;
              return (
                <div key={c.currency} style={{ display: 'grid', gridTemplateColumns: '48px 80px 1fr 120px 80px', gap: 12, alignItems: 'center', padding: '10px 12px', background: 'var(--row-alt)', borderRadius: 8 }}>
                  <div style={{ fontSize: 22, textAlign: 'center' }}>{CURRENCY_FLAGS[c.currency] || '🏳️'}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--fm)' }}>{c.currency}</div>
                  <div style={{ position: 'relative', height: 16, background: 'var(--card-alt)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute',
                      left: 0, top: 0, bottom: 0,
                      width: `${Math.min(pctNlv * 100 * 5, 100)}%`,
                      background: isNegative ? 'var(--red)' : 'var(--green)',
                      opacity: 0.4,
                    }} />
                    <div style={{ position: 'relative', padding: '0 8px', fontSize: 10, lineHeight: '16px', color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
                      {fmtPct(pctNlv)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {_sf(c.balance_native, 0)} {c.currency}
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 14, fontWeight: 700, color: isNegative ? 'var(--red)' : 'var(--text-primary)' }}>
                    {fmtUSD(c.balance_usd)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bloque 3: Tabla por cuenta IB */}
      <div style={{ padding: '16px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
          🏦 Detalle por cuenta IB
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>CUENTA</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>NLV</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>AVAILABLE</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>EXCESS LIQ</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>INIT MARGIN</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>BUYING POWER</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>LEVERAGE</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>CUSHION</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.account_id} style={{ borderBottom: '1px solid var(--subtle-border)' }}>
                  <td style={{ padding: '10px 6px', fontFamily: 'var(--fm)' }}>
                    <div style={{ fontWeight: 700 }}>{ACCOUNT_LABELS[a.account_id] || a.account_id}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{a.account_id}</div>
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700 }}>
                    {fmtUSD(a.nlv)}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--text-secondary)' }}>
                    {fmtUSD(a.available_funds)}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--green)' }}>
                    {fmtUSD(a.excess_liquidity)}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--gold)' }}>
                    {fmtUSD(a.init_margin)}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--text-secondary)' }}>
                    {fmtUSD(a.buying_power)}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'var(--fm)', color: leverageColor(a.leverage_pct), fontWeight: 700 }}>
                    {fmtPct(a.leverage_pct)}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'var(--fm)', color: cushionColor(a.cushion_pct), fontWeight: 700 }}>
                    {fmtPct(a.cushion_pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bloque 4: Acciones sugeridas (light heuristics) */}
      <div style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
          💡 Observaciones
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          {totals.cushion_pct < 0.2 && (
            <div style={{ color: 'var(--red)' }}>🔴 Cushion bajo ({fmtPct(totals.cushion_pct)}). Si baja del 10% IB hace margin call.</div>
          )}
          {totals.leverage_pct > 0.4 && (
            <div style={{ color: 'var(--red)' }}>🔴 Leverage alto ({fmtPct(totals.leverage_pct)}). Considera reducir posiciones a margin.</div>
          )}
          {totals.leverage_pct > 0.25 && totals.leverage_pct <= 0.4 && (
            <div style={{ color: 'var(--gold)' }}>🟡 Leverage moderado ({fmtPct(totals.leverage_pct)}).</div>
          )}
          {totals.leverage_pct <= 0.25 && totals.leverage_pct > 0 && (
            <div style={{ color: 'var(--green)' }}>🟢 Leverage conservador ({fmtPct(totals.leverage_pct)}). Tienes margen para añadir posiciones.</div>
          )}
          {cashRatio < 0.05 && cashRatio >= 0 && (
            <div style={{ color: 'var(--gold)' }}>🟡 Cash {fmtPct(cashRatio)} del NLV. Considera reservar ≥10% para oportunidades / drawdowns.</div>
          )}
          {totals.available_funds_usd > 100000 && (
            <div style={{ color: 'var(--text-secondary)' }}>
              💵 Tienes <b>{fmtUSD(totals.available_funds_usd)}</b> disponibles para mover. Si vas a estar parado, considera SGOV/BIL para rendir ~4-5% mientras esperas.
            </div>
          )}
          {data?.cash_warning && (
            <div style={{ color: 'var(--gold)' }}>⚠ Cash data stale. Ejecuta <code style={{ background: 'var(--card-alt)', padding: '2px 6px', borderRadius: 4 }}>bash api/sync-flex.sh</code> o espera al cron 08:30.</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', padding: 4 }}>
        Datos NLV/Margin LIVE vía IB Bridge · Cash por moneda desde tabla cash_balances D1 (sync via Flex)
      </div>

    </div>
  );
}
