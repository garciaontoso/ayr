import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants';
import { _sf } from '../../utils/formatters';

const fmtUSD = (n) => n == null ? '—' : (n < 0 ? '-$' : '$') + _sf(Math.abs(n), n < 1000 ? 2 : 0);
const fmtPct = (n, dec = 2) => n == null ? '—' : `${n >= 0 ? '+' : ''}${_sf(n, dec)}%`;
const fmtPctAbs = (n, dec = 2) => n == null ? '—' : `${_sf(n, dec)}%`;
const fmtNum = (n) => n == null ? '—' : _sf(n, 0);

const colorPnl = (n) => n == null ? 'var(--text-tertiary)' : n > 0 ? 'var(--green)' : n < 0 ? 'var(--red)' : 'var(--text-primary)';
const colorVal = (n) => n == null ? 'var(--text-tertiary)' : n >= 0 ? 'var(--green)' : 'var(--red)';

// Table cell coloring semáforo: green gradient for positive, red gradient for negative
const cellBg = (val, min, max) => {
  if (val == null) return 'transparent';
  if (val > 0) {
    const intensity = Math.min(Math.abs(val) / Math.max(Math.abs(max) || 1, 1), 1);
    return `rgba(74,222,128,${0.08 + intensity * 0.32})`;
  } else if (val < 0) {
    const intensity = Math.min(Math.abs(val) / Math.max(Math.abs(min) || 1, 1), 1);
    return `rgba(248,113,113,${0.08 + intensity * 0.32})`;
  }
  return 'transparent';
};

// Big KPI Card (top banner)
const BigKpi = ({ icon, label, value, subtitle, color, size = 'normal' }) => (
  <div style={{
    flex: 1, minWidth: size === 'large' ? 200 : 140,
    padding: '14px 16px',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', textTransform: 'uppercase' }}>{label}</span>
    </div>
    <div style={{ fontSize: size === 'large' ? 24 : 18, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: 'var(--fm)', lineHeight: 1.1 }}>
      {value}
    </div>
    {subtitle && (
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3, fontFamily: 'var(--fm)' }}>
        {subtitle}
      </div>
    )}
  </div>
);

// Ranking card (Mejor / Peor / etc.)
const RankCard = ({ label, ticker, value, accent }) => (
  <div style={{
    padding: '10px 12px',
    background: 'var(--row-alt)',
    border: `1px solid ${accent || 'var(--subtle-border)'}`,
    borderRadius: 10,
    minWidth: 0,
  }}>
    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ticker || '—'}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: accent || 'var(--text-primary)', fontFamily: 'var(--fm)' }}>
        {value}
      </span>
    </div>
  </div>
);

export default function ExecutiveSummaryTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/dashboard/executive`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando Resumen Ejecutivo...</div>;
  }
  if (error && !data) {
    return <div style={{ padding: 20, background: 'rgba(248,113,113,.08)', border: '1px solid var(--red)', borderRadius: 12, color: 'var(--red)' }}>❌ Error: {error}</div>;
  }

  const kpis = data?.kpis || {};
  const ranking = data?.ranking || {};
  const tableRows = data?.table_rows || [];
  const divsByMonth = data?.divs_by_month || [];
  const byCurrency = data?.by_currency || [];
  const dataSource = data?.data_source || {};

  // Stats para coloring tabla
  const maxRent = Math.max(...tableRows.map(r => r.rent_usd_pct || 0));
  const minRent = Math.min(...tableRows.map(r => r.rent_usd_pct || 0));
  const maxPnl = Math.max(...tableRows.map(r => r.pnl_usd || 0));
  const minPnl = Math.min(...tableRows.map(r => r.pnl_usd || 0));
  const maxDiv = Math.max(...tableRows.map(r => r.div_usd || 0));
  const maxYoc = Math.max(...tableRows.map(r => r.yoc_pct || 0));
  const maxAmort = Math.max(...tableRows.map(r => r.amort_pct || 0));

  // Para barras de mejor/peor mes
  const maxMonth = Math.max(...divsByMonth.map(m => m.total_usd || 0), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)' }}>
            📊 Resumen Ejecutivo
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            KPIs · Ranking automático · Estacionalidad dividendos · Tabla semáforo · {kpis.num_posiciones_clean || kpis.num_posiciones} posiciones limpias
            {kpis.num_posiciones - (kpis.num_posiciones_clean || 0) > 0 && (
              <span style={{ color: 'var(--gold)' }}> · {kpis.num_posiciones - kpis.num_posiciones_clean} outliers filtrados del ranking</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {dataSource.bridge_ok ? (
            <span title="NLV en vivo desde IB Bridge" style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(74,222,128,.12)', color: 'var(--green)', borderRadius: 8, fontWeight: 600 }}>
              ● NLV LIVE
            </span>
          ) : (
            <span title="Bridge OFF, usando agregado D1 (puede incluir phantoms)" style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(200,164,78,.12)', color: 'var(--gold)', borderRadius: 8, fontWeight: 600 }}>
              ● BRIDGE OFF — D1 AGG
            </span>
          )}
          <button onClick={fetchData} disabled={loading} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-alt)', color: 'var(--text-primary)', cursor: loading ? 'wait' : 'pointer', fontSize: 12 }}>
            {loading ? '...' : '↻ Refrescar'}
          </button>
        </div>
      </div>

      {/* Phantom warning si hay delta material */}
      {dataSource.phantom_warning && (
        <div style={{ padding: '10px 14px', background: 'rgba(200,164,78,.08)', border: '1px solid var(--gold)', borderRadius: 10, fontSize: 12, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠</span>
          <span>{dataSource.phantom_warning}</span>
        </div>
      )}

      {/* Zona 1a: KPIs principales — Wealth Gain Total (lo que importa) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <BigKpi icon="💼" label="Valor Cartera (positions)" value={fmtUSD(kpis.valor_cartera_usd)} subtitle={dataSource.bridge_nlv_usd ? `Bridge LIVE: ${fmtUSD(dataSource.bridge_nlv_usd)}` : `${fmtNum(kpis.num_posiciones)} positions`} size="large" />
        <BigKpi icon="🏆" label="Wealth Gain Total" value={fmtUSD(kpis.wealth_gain_total_usd)} subtitle={`${fmtPct(kpis.wealth_gain_pct)} · realized + unrealized + divs`} color={colorPnl(kpis.wealth_gain_total_usd)} size="large" />
        <BigKpi icon="💵" label="Income Lifetime" value={fmtUSD(kpis.total_income_lifetime_usd)} subtitle="realizados + divs + opciones" color="var(--green)" size="large" />
      </div>

      {/* Zona 1b: Desglose PnL Lifetime */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <BigKpi icon="📈" label="Stocks Realizados Lifetime" value={fmtUSD(kpis.pnl_realizado_stocks_usd)} subtitle="ventas con beneficio histórico" color={colorPnl(kpis.pnl_realizado_stocks_usd)} />
        <BigKpi icon="🎲" label="Opciones Realizadas Lifetime" value={fmtUSD(kpis.pnl_realizado_options_usd)} subtitle="primas netas cobradas" color={colorPnl(kpis.pnl_realizado_options_usd)} />
        <BigKpi icon="💸" label="Divs Netos Lifetime" value={fmtUSD(kpis.dividendos_netos_lifetime_usd)} subtitle="después de WHT" color="var(--gold)" />
        <BigKpi icon="📉" label="P&L No Realizado (actual)" value={fmtUSD(kpis.pnl_unrealized_usd)} subtitle={fmtPct(kpis.rentabilidad_acumulada_pct) + ' sobre coste'} color={colorPnl(kpis.pnl_unrealized_usd)} />
      </div>

      {/* Zona 1c: Métricas de yield / amortización */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <BigKpi icon="💰" label="Total Invertido (actual)" value={fmtUSD(kpis.total_invertido_usd)} subtitle="cost basis posiciones activas" />
        <BigKpi icon="💸" label="Yield Actual" value={fmtPctAbs(kpis.yield_actual_pct)} subtitle={`$${_sf(kpis.dividendos_12m_usd, 0)} divs 12m`} />
        <BigKpi icon="🌱" label="Yield on Cost" value={fmtPctAbs(kpis.yield_on_cost_pct)} subtitle="divs 12m / cost basis" color={kpis.yield_on_cost_pct > 4 ? 'var(--green)' : 'var(--gold)'} />
        <BigKpi icon="📅" label="Divs YTD 2026" value={fmtUSD(kpis.dividendos_2026_usd)} subtitle={`Media: $${_sf(kpis.dividendos_12m_media, 0)}/mes`} />
        <BigKpi icon="🏠" label="Amortiz. Inversión" value={fmtPctAbs(kpis.amortizacion_inversion_pct)} subtitle="Divs / Coste base" color={kpis.amortizacion_inversion_pct > 10 ? 'var(--green)' : 'var(--text-primary)'} />
      </div>

      {/* Zona 2: Ranking automático */}
      <div style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          🏆 Ranking Automático
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <RankCard label="Mejor Rentabilidad" ticker={ranking.mejor_rentabilidad?.ticker} value={fmtPct(ranking.mejor_rentabilidad?.value)} accent="var(--green)" />
          <RankCard label="Peor Rentabilidad" ticker={ranking.peor_rentabilidad?.ticker} value={fmtPct(ranking.peor_rentabilidad?.value)} accent="var(--red)" />
          <RankCard label="Más Ganado USD" ticker={ranking.mas_ganado_usd?.ticker} value={fmtUSD(ranking.mas_ganado_usd?.value)} accent="var(--green)" />
          <RankCard label="Más Perdido USD" ticker={ranking.mas_perdido_usd?.ticker} value={fmtUSD(ranking.mas_perdido_usd?.value)} accent="var(--red)" />
          <RankCard label="Más Invertido USD" ticker={ranking.mas_invertido_usd?.ticker} value={fmtUSD(ranking.mas_invertido_usd?.value)} accent="var(--gold)" />
          <RankCard label="Menos Invertido USD" ticker={ranking.menos_invertido_usd?.ticker} value={fmtUSD(ranking.menos_invertido_usd?.value)} accent="var(--text-tertiary)" />
          <RankCard label="Más Peso Cartera" ticker={ranking.mas_peso_cartera?.ticker} value={fmtPctAbs(ranking.mas_peso_cartera?.value)} accent="var(--gold)" />
          <RankCard label="Menos Peso Cartera" ticker={ranking.menos_peso_cartera?.ticker} value={fmtPctAbs(ranking.menos_peso_cartera?.value)} accent="var(--text-tertiary)" />
          <RankCard label="Más Divs Cobrados" ticker={ranking.mas_dividendos_cobrados?.ticker} value={fmtUSD(ranking.mas_dividendos_cobrados?.value)} accent="var(--gold)" />
          <RankCard label="Mayor YoC" ticker={ranking.mayor_yield_on_cost?.ticker} value={fmtPctAbs(ranking.mayor_yield_on_cost?.value)} accent="var(--green)" />
          <RankCard label="Mejor Amortización" ticker={ranking.mejor_amortizacion?.ticker} value={fmtPctAbs(ranking.mejor_amortizacion?.value)} accent="var(--green)" />
          <RankCard label="Sector + Presente" ticker={ranking.sector_mas_presente} value="" accent="var(--gold)" />
          <RankCard label="Sector - Presente" ticker={ranking.sector_menos_presente} value="" accent="var(--text-tertiary)" />
          <RankCard label="Mejor Mes Divs" ticker={ranking.mejor_mes} value="" accent="var(--green)" />
          <RankCard label="Peor Mes Divs" ticker={ranking.peor_mes} value="" accent="var(--red)" />
        </div>
      </div>

      {/* Zona 3: Por divisa + estacionalidad mensual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12 }}>

        {/* Por divisa */}
        <div style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
            💱 Parciales por divisa
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', fontSize: 10, color: 'var(--text-tertiary)' }}>DIVISA</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 10, color: 'var(--text-tertiary)' }}>INVERTIDO</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 10, color: 'var(--text-tertiary)' }}>VALOR</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 10, color: 'var(--text-tertiary)' }}>P&L</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: 10, color: 'var(--text-tertiary)' }}>RENT %</th>
              </tr>
            </thead>
            <tbody>
              {byCurrency.map(c => (
                <tr key={c.currency} style={{ borderBottom: '1px solid var(--subtle-border)' }}>
                  <td style={{ padding: '8px 4px', fontWeight: 700, fontFamily: 'var(--fm)' }}>{c.currency}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'var(--fm)' }}>{fmtUSD(c.invertido)}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700 }}>{fmtUSD(c.valor)}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'var(--fm)', color: colorPnl(c.pnl) }}>{fmtUSD(c.pnl)}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'var(--fm)', color: colorPnl(c.rentabilidad_pct), fontWeight: 700 }}>{fmtPct(c.rentabilidad_pct, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Estacionalidad mensual */}
        <div style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
            📅 Estacionalidad dividendos (lifetime)
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, padding: '8px 0' }}>
            {Array.from({ length: 12 }, (_, i) => {
              const m = divsByMonth.find(x => x.month === i + 1);
              const total = m?.total_usd || 0;
              const pct = (total / maxMonth) * 100;
              const isMax = ranking.mejor_mes === ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][i];
              const isMin = ranking.peor_mes === ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][i];
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 9, color: total > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                    {total > 0 ? `$${_sf(total, 0)}` : '—'}
                  </div>
                  <div style={{ width: '100%', height: `${Math.max(pct, 2)}%`, background: isMax ? 'var(--green)' : isMin ? 'var(--red)' : 'var(--gold)', opacity: total > 0 ? 0.7 : 0.15, borderRadius: 3, transition: 'all .3s' }} />
                  <div style={{ fontSize: 9, color: isMax ? 'var(--green)' : isMin ? 'var(--red)' : 'var(--text-tertiary)', fontWeight: isMax || isMin ? 700 : 500 }}>
                    {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][i]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Zona 4: Tabla detallada con semáforo */}
      <div style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          📋 Detalle por ticker (ordenado por rentabilidad)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['TICKER','VALOR USD','INVERTIDO','P&L','RENT %','% + DIVS','DIVS USD','YoC %','AMORT %','PESO %'].map(h => (
                  <th key={h} style={{ textAlign: h === 'TICKER' ? 'left' : 'right', padding: '8px 6px', fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map(r => (
                <tr key={r.ticker} style={{ borderBottom: '1px solid var(--subtle-border)', opacity: r.outlier ? 0.45 : 1 }} title={r.outlier ? 'Outlier — data quality issue, no contado en ranking' : undefined}>
                  <td style={{ padding: '7px 6px', fontFamily: 'var(--fm)' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {r.outlier && <span title="Outlier — data quality" style={{ fontSize: 10, color: 'var(--gold)' }}>⚠</span>}
                      {r.ticker}
                    </div>
                    {r.sector && <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{r.sector}</div>}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, background: cellBg(r.valor_usd, 0, Math.max(...tableRows.map(x => x.valor_usd))) }}>
                    {fmtUSD(r.valor_usd)}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--text-secondary)' }}>
                    {fmtUSD(r.invertido_usd)}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, background: cellBg(r.pnl_usd, minPnl, maxPnl), color: colorPnl(r.pnl_usd) }}>
                    {fmtUSD(r.pnl_usd)}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--fm)', fontWeight: 700, background: cellBg(r.rent_usd_pct, minRent, maxRent), color: colorPnl(r.rent_usd_pct) }}>
                    {fmtPct(r.rent_usd_pct, 1)}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--fm)', background: cellBg(r.rent_plus_divs_pct, minRent, maxRent), color: colorPnl(r.rent_plus_divs_pct) }}>
                    {fmtPct(r.rent_plus_divs_pct, 1)}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--fm)', background: cellBg(r.div_usd, 0, maxDiv), color: r.div_usd > 0 ? 'var(--gold)' : 'var(--text-tertiary)' }}>
                    {r.div_usd > 0 ? `$${_sf(r.div_usd, 0)}` : '—'}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--fm)', background: cellBg(r.yoc_pct, 0, maxYoc), color: r.yoc_pct >= 4 ? 'var(--green)' : 'var(--text-secondary)' }}>
                    {fmtPctAbs(r.yoc_pct, 1)}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--fm)', background: cellBg(r.amort_pct, 0, maxAmort), color: r.amort_pct > 10 ? 'var(--green)' : 'var(--text-secondary)' }}>
                    {fmtPctAbs(r.amort_pct, 1)}
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--fm)', color: 'var(--text-secondary)' }}>
                    {fmtPctAbs(r.weight_pct, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', padding: 4, lineHeight: 1.6 }}>
        Datos en USD · NLV fuente: {dataSource.nlv_source === 'ib_bridge_live' ? 'IB Bridge LIVE' : 'positions D1 (puede incluir phantoms)'} · Dividendos lifetime acumulados · Tabla ordenada por rentabilidad
        {dataSource.outliers_filtered > 0 && ` · ${dataSource.outliers_filtered} outliers filtrados del ranking (rent >500% o <-90%)`}
      </div>

    </div>
  );
}
