// 📊 Geraldine Weiss — Dividend Value Strategy (rediseño visual 2026-05-03)
//
// Método "Dividends Don't Lie" de Geraldine Weiss (1926-2022), pionera del
// análisis dividend-yield-based. Tesis: el yield histórico de una empresa
// que paga dividendo estable forma BANDAS naturales. Cuando el yield está
// arriba de la banda alta = barata. Cuando está abajo de la banda baja = cara.
//
// Esta versión 2026-05-03 (rediseño petición usuario) tiene:
//   · Hero con foto/silueta + cita célebre
//   · Verdict card protagonista con semáforo + mensaje accionable
//   · 3 zone cards con gradientes coloreados según semáforo
//   · Mini sparkline DPS growth integrada
//   · Chart yield bandas mejorado (área sombreada + marcador NOW prominente)
//   · Tabla histórica con hover row + flechas indicador trend
//   · Sección educativa colapsable

import { useState } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { _sf } from '../../utils/formatters';
import { YEARS } from '../../constants/index.js';

// Citas célebres de Geraldine Weiss para barra inspiracional
const WEISS_QUOTES = [
  '"Dividends don\'t lie."',
  '"The best way to value a stock is by its dividend yield."',
  '"Buy when the yield is high, sell when the yield is low."',
];

export default function WeissTab() {
  const { L, LD, cfg, fin, fmpExtra } = useAnalysis();
  const [showMethod, setShowMethod] = useState(false);

  // Historical data: DPS, price proxied from EPS × PE, and yield
  const histYrs = YEARS.slice(0, 15).reverse().filter(y => fin[y]?.dps > 0);
  if (histYrs.length < 3) return (
    <Card>
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Sin datos suficientes</div>
        <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
          El método de Geraldine Weiss necesita <strong>mínimo 3 años</strong> con dividendo
          consecutivo para calcular las bandas históricas de yield. Esta empresa todavía
          no cumple el requisito.
        </div>
      </div>
    </Card>
  );

  // ── Compute yields year-by-year ────────────────────────────────────────
  const yieldData = histYrs.map(y => {
    const dps = fin[y]?.dps || 0;
    const shares = fin[y]?.sharesOut || 0;
    if (dps <= 0) return null;
    const fmpKm = fmpExtra.keyMetrics?.find(km => km.date?.startsWith(String(y)));
    const fmpYield = fmpKm?.dividendYield > 0 ? fmpKm.dividendYield : 0;
    const priceFromMC = (shares > 0 && fmpKm?.marketCap > 0) ? fmpKm.marketCap / (shares * 1e6) : 0;
    const calcYield = priceFromMC > 0 ? dps / priceFromMC : 0;
    const yld = fmpYield > 0 ? fmpYield : calcYield;
    const priceEst = yld > 0 && dps > 0 ? dps / yld : priceFromMC;
    return { y, dps, priceEst, yld };
  }).filter(d => d != null && d.yld > 0.005 && d.yld < 0.25);

  if (yieldData.length < 3) return (
    <Card>
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Datos de yield insuficientes</div>
        <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
          Tenemos los DPS pero no podemos derivar yields fiables (necesitamos
          marketCap o dividendYield FMP por año). Para empresas internacionales
          o pequeñas esto a veces falla.
        </div>
      </div>
    </Card>
  );

  // ── Yield statistics ──────────────────────────────────────────────────
  const yields = yieldData.map(d => d.yld);
  const yieldAvg = yields.reduce((a,b) => a+b, 0) / yields.length;
  const yieldMax = Math.max(...yields);
  const yieldMedian = [...yields].sort((a,b) => a-b)[Math.floor(yields.length/2)];
  const currentDPS = LD.dps || fin[histYrs[histYrs.length-1]]?.dps || 0;
  const currentYield = cfg.price > 0 && currentDPS > 0 ? currentDPS / cfg.price : 0;
  const sortedYields = [...yields].sort((a,b) => a-b);
  const pct = p => sortedYields[Math.min(Math.floor(sortedYields.length * p), sortedYields.length-1)];
  const yieldHigh = Math.max(pct(0.85), yieldAvg * 1.3);
  const yieldLow = Math.min(pct(0.15), yieldAvg * 0.7);

  // Price bands
  const priceBands = {
    overvalued: currentDPS > 0 ? currentDPS / yieldLow : 0,
    fairHigh: currentDPS > 0 ? currentDPS / yieldAvg : 0,
    fairLow: currentDPS > 0 ? currentDPS / yieldMedian : 0,
    undervalued: currentDPS > 0 ? currentDPS / yieldHigh : 0,
  };

  // Verdict
  const weissZone = currentYield >= yieldHigh ? 'UNDERVALUED'
                  : currentYield >= yieldMedian ? 'FAIR VALUE'
                  : currentYield >= yieldLow ? 'FAIR-HIGH'
                  : 'OVERVALUED';
  const weissColor = weissZone === 'UNDERVALUED' ? '#30d158'
                  : weissZone === 'FAIR VALUE' ? '#ffd60a'
                  : weissZone === 'FAIR-HIGH' ? '#ff9f0a'
                  : '#ff453a';
  const verdictMsg = {
    'UNDERVALUED': 'Precio atractivo. Yield significativamente por encima de la media histórica.',
    'FAIR VALUE': 'Precio razonable. Yield cerca de su media histórica. Mantener posición.',
    'FAIR-HIGH': 'Empezando a estar caro. Yield por debajo de la media. Vigilar.',
    'OVERVALUED': 'Cara según el método Weiss. Considerar tomar beneficios parciales.',
  }[weissZone];
  const action = {
    'UNDERVALUED': '🟢 Comprar / Acumular',
    'FAIR VALUE': '🟡 Mantener',
    'FAIR-HIGH': '🟠 Vigilar',
    'OVERVALUED': '🔴 Tomar beneficios parciales',
  }[weissZone];

  // ── DPS sparkline & growth ────────────────────────────────────────────
  const dpsTrend = yieldData.length >= 2 ? (yieldData[yieldData.length-1].dps / yieldData[0].dps) ** (1 / (yieldData.length-1)) - 1 : 0;
  const dpsTrendArrow = dpsTrend > 0.05 ? '🚀' : dpsTrend > 0.01 ? '↗' : dpsTrend > -0.01 ? '→' : '↘';
  const yearsHistory = yieldData.length;

  // ── Chart geometry ─────────────────────────────────────────────────────
  const W = 900, H = 400, PADL = 70, PADR = 30, PADT = 30, PADB = 50;
  const chartW = W - PADL - PADR, chartH = H - PADT - PADB;
  const allYears = yieldData.map(d => d.y);
  const minY = allYears[0], maxY = allYears[allYears.length - 1] + 1;
  const xScale = y => PADL + ((y - minY) / (maxY - minY || 1)) * chartW;
  const yMax = Math.max(yieldMax, currentYield, yieldHigh) * 1.15;
  const yScale = v => PADT + chartH - (v / yMax) * chartH;
  const yieldPath = yieldData.map((d, i) => `${i===0?'M':'L'}${xScale(d.y)},${yScale(d.yld)}`).join(' ');
  const yieldArea = `${yieldPath} L${xScale(yieldData[yieldData.length-1].y)},${PADT+chartH} L${xScale(yieldData[0].y)},${PADT+chartH} Z`;

  // Random Weiss quote (varía por reload)
  const quote = WEISS_QUOTES[Math.floor(Date.now() / 60000) % WEISS_QUOTES.length];

  return (
    <div>
      {/* ═══════════ HERO SECTION ═══════════ */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(48,209,88,.04) 0%, rgba(255,214,10,.04) 50%, rgba(255,69,58,.04) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '20px 24px',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {/* Avatar circular con iniciales */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, #c8a44e 0%, #8B6914 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 8px 24px rgba(200,164,78,.3)',
          }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#000', fontFamily: 'var(--fd)' }}>GW</span>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: 1, textTransform: 'uppercase' }}>Método de inversión por dividendos</div>
            <h2 style={{ margin: '4px 0 6px', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--fd)', letterSpacing: -0.3 }}>
              Geraldine Weiss
              <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 500 }}>1926—2022</span>
            </h2>
            <div style={{ fontSize: 13, color: 'var(--gold)', fontStyle: 'italic', fontFamily: 'Georgia, serif', marginTop: 2 }}>
              {quote}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
              Pionera del análisis "dividend yield value". <strong>Cuando el yield está alto vs su media histórica → barata. Cuando está bajo → cara.</strong>
            </div>
          </div>
          {/* Mini stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 18, fontFamily: 'var(--fm)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5 }}>Histórico</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{yearsHistory}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>años con div</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5 }}>DPS Trend</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: dpsTrend > 0 ? '#30d158' : '#ff453a', marginTop: 2 }}>
                {dpsTrendArrow} {dpsTrend >= 0 ? '+' : ''}{_sf(dpsTrend*100, 1)}%
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>CAGR/año</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5 }}>Yield avg</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#64d2ff', marginTop: 2 }}>{_sf(yieldAvg*100,1)}%</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>histórico</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ VERDICT — PROTAGONISTA ═══════════ */}
      <div style={{
        background: `linear-gradient(135deg, ${weissColor}11 0%, ${weissColor}05 100%)`,
        border: `2px solid ${weissColor}66`,
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        boxShadow: `0 0 40px ${weissColor}11`,
        position: 'relative',
      }}>
        {/* Glow effect */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, transparent, ${weissColor}, transparent)`,
          borderRadius: '16px 16px 0 0',
        }}/>

        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'center' }}>
          {/* Semáforo grande izq */}
          <div style={{ textAlign: 'center', padding: '8px 16px' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1 }}>Veredicto Weiss</div>
            <div style={{
              fontSize: 36, fontWeight: 900, color: weissColor,
              fontFamily: 'var(--fd)', letterSpacing: -0.5, marginTop: 4,
              textShadow: `0 0 30px ${weissColor}55`,
            }}>{weissZone}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: weissColor, marginTop: 4, fontFamily: 'var(--fm)' }}>{action}</div>
          </div>

          {/* Mensaje accionable centro */}
          <div style={{ borderLeft: `2px solid ${weissColor}33`, paddingLeft: 20 }}>
            <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6, fontFamily: 'var(--fd)' }}>
              {verdictMsg}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.6 }}>
              Yield actual <strong style={{ color: weissColor }}>{_sf(currentYield*100, 2)}%</strong> · Media histórica <strong style={{ color: '#64d2ff' }}>{_sf(yieldAvg*100, 2)}%</strong>
              {' · '}
              {currentYield > yieldAvg
                ? <span style={{ color: '#30d158' }}>↑ {_sf((currentYield/yieldAvg - 1)*100, 0)}% sobre media</span>
                : <span style={{ color: '#ff453a' }}>↓ {_sf((1 - currentYield/yieldAvg)*100, 0)}% bajo media</span>}
            </div>
          </div>

          {/* Yield gauge derecha */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1 }}>Yield ahora</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: weissColor, fontFamily: 'var(--fm)', lineHeight: 1, marginTop: 4 }}>
              {_sf(currentYield*100, 2)}<span style={{ fontSize: 22, opacity: .7 }}>%</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, fontFamily: 'var(--fm)' }}>
              ${_sf(currentDPS, 2)} / ${_sf(cfg.price, 2)}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ 3 ZONAS DE PRECIO ═══════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {/* COMPRA */}
        <div style={{
          background: weissZone === 'UNDERVALUED'
            ? 'linear-gradient(145deg, rgba(48,209,88,.18), rgba(48,209,88,.06))'
            : 'linear-gradient(145deg, rgba(48,209,88,.06), rgba(48,209,88,.02))',
          border: `1px solid ${weissZone === 'UNDERVALUED' ? '#30d158aa' : 'rgba(48,209,88,.25)'}`,
          borderRadius: 14, padding: 16,
          boxShadow: weissZone === 'UNDERVALUED' ? '0 0 24px rgba(48,209,88,.15)' : 'none',
          transition: 'all .2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>🟢</span>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#30d158', fontFamily: 'var(--fm)', letterSpacing: .5, textTransform: 'uppercase' }}>Zona compra</div>
            {weissZone === 'UNDERVALUED' && <span style={{ marginLeft: 'auto', fontSize: 8, padding: '2px 6px', borderRadius: 100, background: '#30d158', color: '#000', fontWeight: 800, fontFamily: 'var(--fm)' }}>AHORA</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Yield ≥</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#30d158', fontFamily: 'var(--fm)', lineHeight: 1 }}>{_sf(yieldHigh*100, 2)}%</div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(48,209,88,.15)' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Precio objetivo</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)' }}>${_sf(priceBands.undervalued, 0)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {priceBands.undervalued > 0 && cfg.price > 0
                ? <span>{cfg.price < priceBands.undervalued ? '✓ ya estás dentro' : `falta ${_sf((cfg.price/priceBands.undervalued - 1)*100, 0)}% caída`}</span>
                : '—'}
            </div>
          </div>
        </div>

        {/* JUSTO */}
        <div style={{
          background: (weissZone === 'FAIR VALUE' || weissZone === 'FAIR-HIGH')
            ? 'linear-gradient(145deg, rgba(255,214,10,.18), rgba(255,214,10,.06))'
            : 'linear-gradient(145deg, rgba(255,214,10,.06), rgba(255,214,10,.02))',
          border: `1px solid ${(weissZone === 'FAIR VALUE' || weissZone === 'FAIR-HIGH') ? '#ffd60aaa' : 'rgba(255,214,10,.25)'}`,
          borderRadius: 14, padding: 16,
          boxShadow: (weissZone === 'FAIR VALUE' || weissZone === 'FAIR-HIGH') ? '0 0 24px rgba(255,214,10,.15)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>🟡</span>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ffd60a', fontFamily: 'var(--fm)', letterSpacing: .5, textTransform: 'uppercase' }}>Zona justa</div>
            {(weissZone === 'FAIR VALUE' || weissZone === 'FAIR-HIGH') && <span style={{ marginLeft: 'auto', fontSize: 8, padding: '2px 6px', borderRadius: 100, background: '#ffd60a', color: '#000', fontWeight: 800, fontFamily: 'var(--fm)' }}>AHORA</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Yield medio</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#ffd60a', fontFamily: 'var(--fm)', lineHeight: 1 }}>{_sf(yieldAvg*100, 2)}%</div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,214,10,.15)' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Precio justo</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)' }}>${_sf(priceBands.fairHigh, 0)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>media histórica</div>
          </div>
        </div>

        {/* CARA */}
        <div style={{
          background: weissZone === 'OVERVALUED'
            ? 'linear-gradient(145deg, rgba(255,69,58,.18), rgba(255,69,58,.06))'
            : 'linear-gradient(145deg, rgba(255,69,58,.06), rgba(255,69,58,.02))',
          border: `1px solid ${weissZone === 'OVERVALUED' ? '#ff453aaa' : 'rgba(255,69,58,.25)'}`,
          borderRadius: 14, padding: 16,
          boxShadow: weissZone === 'OVERVALUED' ? '0 0 24px rgba(255,69,58,.15)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>🔴</span>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ff453a', fontFamily: 'var(--fm)', letterSpacing: .5, textTransform: 'uppercase' }}>Zona cara</div>
            {weissZone === 'OVERVALUED' && <span style={{ marginLeft: 'auto', fontSize: 8, padding: '2px 6px', borderRadius: 100, background: '#ff453a', color: '#fff', fontWeight: 800, fontFamily: 'var(--fm)' }}>AHORA</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Yield ≤</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#ff453a', fontFamily: 'var(--fm)', lineHeight: 1 }}>{_sf(yieldLow*100, 2)}%</div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,69,58,.15)' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Precio venta</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)' }}>${_sf(priceBands.overvalued, 0)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {priceBands.overvalued > 0 && cfg.price > 0
                ? <span>{cfg.price > priceBands.overvalued ? '⚠ ya estás encima' : `${_sf((priceBands.overvalued/cfg.price - 1)*100, 0)}% subida hasta zona`}</span>
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ CHART YIELD HISTÓRICO ═══════════ */}
      <Card title="Dividend Yield Histórico con Bandas" icon="📉" style={{ marginBottom: 20 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <linearGradient id="weissYieldArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#64d2ff" stopOpacity={0.25}/>
              <stop offset="100%" stopColor="#64d2ff" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="weissBuyArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#30d158" stopOpacity={0.18}/>
              <stop offset="100%" stopColor="#30d158" stopOpacity={0.04}/>
            </linearGradient>
            <linearGradient id="weissSellArea" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#ff453a" stopOpacity={0.18}/>
              <stop offset="100%" stopColor="#ff453a" stopOpacity={0.04}/>
            </linearGradient>
            <filter id="glowNow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Background zones */}
          <rect x={PADL} y={yScale(yMax)} width={chartW} height={yScale(yieldHigh)-yScale(yMax)} fill="url(#weissBuyArea)"/>
          <rect x={PADL} y={yScale(yieldLow)} width={chartW} height={yScale(0)-yScale(yieldLow)} fill="url(#weissSellArea)"/>

          {/* Grid + Y axis */}
          {Array.from({ length: 6 }, (_, i) => {
            const v = (yMax * i) / 5;
            return (
              <g key={i}>
                <line x1={PADL} y1={yScale(v)} x2={PADL+chartW} y2={yScale(v)} stroke="var(--subtle-border)" strokeWidth={0.5} strokeDasharray="2,3"/>
                <text x={PADL-10} y={yScale(v)+4} textAnchor="end" fontSize={10} fill="var(--text-tertiary)" fontFamily="monospace">{_sf(v*100, 1)}%</text>
              </g>
            );
          })}

          {/* Band lines */}
          <line x1={PADL} y1={yScale(yieldHigh)} x2={PADL+chartW} y2={yScale(yieldHigh)} stroke="#30d158" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.8}/>
          <line x1={PADL} y1={yScale(yieldAvg)} x2={PADL+chartW} y2={yScale(yieldAvg)} stroke="#ffd60a" strokeWidth={1.5} strokeDasharray="4,4" opacity={0.8}/>
          <line x1={PADL} y1={yScale(yieldLow)} x2={PADL+chartW} y2={yScale(yieldLow)} stroke="#ff453a" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.8}/>

          {/* Band labels */}
          <rect x={PADL+chartW+2} y={yScale(yieldHigh)-7} width={32} height={14} fill="#30d158" rx={3}/>
          <text x={PADL+chartW+18} y={yScale(yieldHigh)+4} textAnchor="middle" fontSize={9} fill="#000" fontWeight={700} fontFamily="monospace">BUY</text>
          <rect x={PADL+chartW+2} y={yScale(yieldAvg)-7} width={32} height={14} fill="#ffd60a" rx={3}/>
          <text x={PADL+chartW+18} y={yScale(yieldAvg)+4} textAnchor="middle" fontSize={9} fill="#000" fontWeight={700} fontFamily="monospace">FAIR</text>
          <rect x={PADL+chartW+2} y={yScale(yieldLow)-7} width={32} height={14} fill="#ff453a" rx={3}/>
          <text x={PADL+chartW+18} y={yScale(yieldLow)+4} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={700} fontFamily="monospace">SELL</text>

          {/* X axis years */}
          {allYears.filter((_, i) => i % Math.max(1, Math.floor(allYears.length/8)) === 0).map(y => (
            <text key={y} x={xScale(y)} y={PADT+chartH+18} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)" fontFamily="monospace">{y}</text>
          ))}

          {/* Yield filled area */}
          <path d={yieldArea} fill="url(#weissYieldArea)"/>

          {/* Yield line */}
          <path d={yieldPath} fill="none" stroke="#64d2ff" strokeWidth={2.8} strokeLinejoin="round" strokeLinecap="round"/>

          {/* Yield dots */}
          {yieldData.map((d, i) => (
            <circle key={i} cx={xScale(d.y)} cy={yScale(d.yld)} r={4} fill="#64d2ff" stroke="var(--bg)" strokeWidth={1.8}>
              <title>{d.y}: yield {_sf(d.yld*100, 2)}% · DPS ${_sf(d.dps, 2)}</title>
            </circle>
          ))}

          {/* CURRENT marker — prominent */}
          <line x1={xScale(maxY-0.5)} y1={PADT} x2={xScale(maxY-0.5)} y2={PADT+chartH} stroke={weissColor} strokeWidth={1} strokeDasharray="3,3" opacity={0.4}/>
          <circle cx={xScale(maxY-0.5)} cy={yScale(currentYield)} r={10} fill={weissColor} filter="url(#glowNow)"/>
          <circle cx={xScale(maxY-0.5)} cy={yScale(currentYield)} r={6} fill={weissColor} stroke="var(--bg)" strokeWidth={2}/>
          <rect x={xScale(maxY-0.5)-32} y={yScale(currentYield)-32} width={64} height={20} fill={weissColor} rx={4}/>
          <text x={xScale(maxY-0.5)} y={yScale(currentYield)-18} textAnchor="middle" fontSize={11} fill={weissColor === '#ffd60a' ? '#000' : '#fff'} fontWeight={800} fontFamily="monospace">
            {_sf(currentYield*100, 2)}%
          </text>
          <text x={xScale(maxY-0.5)} y={PADT+chartH+18} textAnchor="middle" fontSize={10} fill={weissColor} fontWeight={800} fontFamily="monospace">AHORA</text>
        </svg>
      </Card>

      {/* ═══════════ TABLA HISTÓRICA ═══════════ */}
      <Card title="Historial Año a Año" icon="📋" style={{ marginBottom: 20, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--fm)' }}>
          <thead>
            <tr style={{ background: 'rgba(200,164,78,.08)' }}>
              <th style={th}>AÑO</th>
              <th style={thR}>DPS</th>
              <th style={thR}>PRECIO EST.</th>
              <th style={thR}>CRECIMIENTO</th>
              <th style={thR}>YIELD</th>
              <th style={thR}>vs MEDIA</th>
              <th style={thR}>ZONA</th>
            </tr>
          </thead>
          <tbody>
            {yieldData.map((d, i) => {
              const prevDps = i > 0 ? yieldData[i-1].dps : null;
              const growth = prevDps > 0 ? (d.dps / prevDps - 1) : null;
              const zone = d.yld >= yieldHigh ? 'COMPRA' : d.yld >= yieldAvg ? 'JUSTO' : 'CARO';
              const zoneCol = d.yld >= yieldHigh ? '#30d158' : d.yld >= yieldAvg ? '#ffd60a' : '#ff453a';
              const vsAvg = ((d.yld / yieldAvg) - 1) * 100;
              return (
                <tr key={d.y} style={{ borderTop: '1px solid var(--table-border)', transition: 'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,164,78,.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--text-primary)' }}>{d.y}</td>
                  <td style={tdR}>${_sf(d.dps, 2)}</td>
                  <td style={{ ...tdR, color: 'var(--text-secondary)' }}>{d.priceEst > 0 ? `$${_sf(d.priceEst, 0)}` : '—'}</td>
                  <td style={{ ...tdR, color: growth != null ? (growth > 0 ? '#30d158' : '#ff453a') : 'var(--text-tertiary)' }}>
                    {growth != null ? `${growth > 0 ? '+' : ''}${_sf(growth*100, 1)}%` : '—'}
                  </td>
                  <td style={{ ...tdR, color: '#64d2ff', fontWeight: 600 }}>{_sf(d.yld*100, 2)}%</td>
                  <td style={{ ...tdR, color: vsAvg > 0 ? '#30d158' : '#ff453a' }}>
                    {vsAvg > 0 ? '+' : ''}{_sf(vsAvg, 0)}%
                  </td>
                  <td style={tdR}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: zoneCol === '#ffd60a' ? '#000' : '#fff', background: zoneCol, padding: '3px 9px', borderRadius: 100, fontFamily: 'var(--fm)' }}>
                      {zone}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ═══════════ EDUCATIVO COLAPSABLE ═══════════ */}
      <div style={{ background: 'linear-gradient(145deg, rgba(200,164,78,.04), rgba(200,164,78,.01))', border: '1px solid rgba(200,164,78,.2)', borderRadius: 14, overflow: 'hidden' }}>
        <button onClick={() => setShowMethod(!showMethod)} style={{ width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontFamily: 'var(--fd)', fontSize: 14, fontWeight: 600 }}>
          <span style={{ fontSize: 20 }}>📖</span>
          ¿Cómo funciona el método de Geraldine Weiss?
          <span style={{ marginLeft: 'auto', fontSize: 16, transform: showMethod ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
        </button>
        {showMethod && (
          <div style={{ padding: '0 20px 20px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              <div>
                <div style={{ color: '#30d158', fontWeight: 700, marginBottom: 6 }}>🟢 Zona de Compra (yield alto)</div>
                Cuando el dividend yield supera la media histórica de los últimos 10-15 años, el mercado está infravalorando la empresa. Para empresas con dividendo estable o creciente, esto suele ser temporal — el dividendo actúa como "suelo" del precio porque atrae compradores hambrientos de yield.
              </div>
              <div>
                <div style={{ color: '#ffd60a', fontWeight: 700, marginBottom: 6 }}>🟡 Zona Fair Value</div>
                El yield está cerca de su media. Precio razonable. Mantener posiciones existentes pero no es momento óptimo para añadir a precio actual. Esperar mejor entrada.
              </div>
              <div>
                <div style={{ color: '#ff453a', fontWeight: 700, marginBottom: 6 }}>🔴 Zona de Venta (yield bajo)</div>
                El yield muy por debajo de la media indica que el precio ha subido demasiado vs lo que la empresa paga. Considerar tomar beneficios parciales — el dividendo no podrá sostener el precio si hay corrección.
              </div>
              <div>
                <div style={{ color: '#64d2ff', fontWeight: 700, marginBottom: 6 }}>⚠️ La clave</div>
                <strong style={{ color: 'var(--text-primary)' }}>Solo funciona con empresas que llevan pagando dividendo estable/creciente muchos años.</strong> Si la empresa recorta dividendo, el método se rompe — un yield alto puede ser señal de problema, no oportunidad.
              </div>
            </div>
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(100,210,255,.06)', borderLeft: '3px solid #64d2ff', borderRadius: 6, fontSize: 11, fontStyle: 'italic' }}>
              💡 <strong>De su libro "Dividends Don't Lie" (1988)</strong>: Geraldine Weiss publicó "Investment Quality Trends" durante 50+ años. Su filosofía: las empresas blue-chip pagan dividendos crecientes, y sus yields oscilan en bandas predecibles cuando se las observa a largo plazo. Ignora ruido del mercado y compra/vende basándote en yield vs media histórica.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const th = { padding: '12px 14px', textAlign: 'left', color: 'var(--gold)', fontSize: 9.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase' };
const thR = { ...th, textAlign: 'right' };
const td = { padding: '10px 14px' };
const tdR = { ...td, textAlign: 'right' };
