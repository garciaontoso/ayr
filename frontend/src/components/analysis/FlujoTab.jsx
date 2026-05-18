// FlujoTab.jsx — Visualización del dinero. 4 widgets visuales:
//   1) Cascada Revenue → FCF → asignación capital (la estrella)
//   2) Quality Card (6 criterios semáforo + sparklines) — adaptable a REIT/BDC
//   3) Cobertura del dividendo (gauge circular)
//   4) TIR a 7 años
// Todos los componentes reactivos y mobile-friendly (grid col-span auto).
//
// REIT/BDC: la lógica de calidad y TIR cambia automáticamente cuando el
// ticker es REIT (cfg.cat === 'REIT' o industria contiene "reit/real estate").
// Para REITs los márgenes contables están distorsionados por depreciación
// inmobiliaria (D&A enorme), el leverage estructural es alto, y el dividendo
// se paga del AFFO (≈ OCF − CapEx mantenimiento) no del NetIncome.
import { useMemo } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { fM } from '../../utils/formatters';

// ═══ Sparkline helper — array de números → polyline 60×16 ════════════
function Spark({ values, color = 'var(--accent-text)', height = 16, width = 60 }) {
  const vals = (values || []).filter(v => v != null && Number.isFinite(v));
  if (vals.length < 2) return <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>—</span>;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const stepX = width / (vals.length - 1);
  const points = vals.map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} style={{ verticalAlign: 'middle' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ═══ Pill verde/rojo con tooltip pedagógico ═══════════════════════════
function CheckRow({ label, value, pass, fmt = 'pct', spark = null, tip }) {
  const display = value == null || !Number.isFinite(value) ? '—'
    : fmt === 'pct' ? `${(value * 100).toFixed(0)}%`
    : fmt === 'mult' ? `${value.toFixed(1)}×`
    : fmt === 'num' ? value.toFixed(2)
    : String(value);
  const color = pass == null ? 'var(--text-tertiary)' : pass ? 'var(--green)' : 'var(--red)';
  const icon = pass == null ? '·' : pass ? '✓' : '✗';
  return (
    <div title={tip} style={{
      display: 'grid', gridTemplateColumns: '1fr 60px 22px 70px',
      alignItems: 'center', gap: 8, padding: '8px 4px',
      borderBottom: '1px solid var(--subtle-bg)', fontSize: 12,
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--fm)', color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{display}</span>
      <span style={{ color, fontWeight: 700, textAlign: 'center', fontSize: 14 }}>{icon}</span>
      <span style={{ textAlign: 'right' }}>{spark}</span>
    </div>
  );
}

// ═══ Cascada Revenue → FCF (SVG horizontal-stack) ═════════════════════
function CashFlowCascade({ LD, L, alloc }) {
  const rev = LD.revenue || 0;
  if (!rev || rev <= 0) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Sin datos de revenue.</div>;
  }
  const gp = LD.grossProfit || 0;
  const oi = LD.operatingIncome || 0;
  const ocf = LD.ocf || 0;
  const capex = LD.capex || 0;
  const fcf = ocf - capex;
  const gm = gp / rev;
  const om = oi / rev;
  const fcfm = rev > 0 ? fcf / rev : 0;

  // 2026-05-18: solo positivo retained va al stacked bar (déficit se muestra
  // en banner separado abajo, no como segmento del 100% que distorsiona).
  const retainedPos = Math.max(0, alloc?.retained || 0);
  const total = (alloc?.divs || 0) + (alloc?.buybacks || 0) + (alloc?.debtPaydown || 0) + (alloc?.acquisitions || 0) + retainedPos;
  const allocPcts = total > 0 ? {
    divs: (alloc.divs || 0) / total,
    buybacks: (alloc.buybacks || 0) / total,
    debt: (alloc.debtPaydown || 0) / total,
    ma: (alloc.acquisitions || 0) / total,
    cash: retainedPos / total,
  } : null;

  // Each bar is normalized to revenue (100% width). Lower bars shrink proportionally.
  // 2026-05-18 FIX: barras negativas (OI < 0 en REITs por D&A) ahora se renderizan
  // en rojo hacia la izquierda, no clippeadas a 0% que ocultaba el dato real.
  const Bar = ({ label, value, pctOfRev, color, sublabel }) => {
    const isNeg = pctOfRev < 0;
    const widthPct = isNeg ? Math.min(30, Math.abs(pctOfRev * 100)) : Math.min(100, pctOfRev * 100);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</div>
        <div style={{ height: 22, background: 'var(--subtle-bg)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            height: '100%', width: `${Math.max(0, widthPct)}%`,
            background: isNeg ? 'var(--red)' : color, transition: 'width .3s',
            boxShadow: 'inset 0 -1px 0 rgba(0,0,0,.12)',
          }} />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 8,
            fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--text-primary)', fontWeight: 600,
          }}>
            {isNeg ? `⚠ ${sublabel} (negativo)` : sublabel}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--fm)', fontSize: 12, fontWeight: 700, color: isNeg ? 'var(--red)' : 'var(--text-primary)', textAlign: 'right' }}>
          {fM(value)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '4px 2px' }}>
      <Bar label="Revenue"          value={rev} pctOfRev={1}    color="#5b9bd5" sublabel="100% base" />
      <Bar label="Gross Profit"     value={gp}  pctOfRev={gm}   color="#48a999" sublabel={`${(gm * 100).toFixed(0)}% margen`} />
      <Bar label="Operating Income" value={oi}  pctOfRev={om}   color="#30d158" sublabel={`${(om * 100).toFixed(0)}% margen`} />
      <Bar label="OCF"              value={ocf} pctOfRev={rev>0?ocf/rev:0} color="#88c790" sublabel="cash de operaciones" />
      <Bar label="− CapEx"          value={capex} pctOfRev={rev>0?capex/rev:0} color="#94a3b8" sublabel="reinversión negocio" />
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 8px' }} />
      <Bar label="🟢 FREE CASH FLOW" value={fcf} pctOfRev={fcfm} color="#c9972e" sublabel={`${(fcfm * 100).toFixed(0)}% del revenue — caja para accionistas`} />

      {allocPcts && total > 0 && (
        <>
          <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .3 }}>
            ↓ ¿Cómo asigna el FCF la directiva? ({fM(total)} total)
          </div>
          {/* Horizontal stacked bar — TODA la pasta */}
          <div style={{ height: 36, display: 'flex', borderRadius: 6, overflow: 'hidden', margin: '8px 0 6px', border: '1px solid var(--border)' }}>
            {[
              { k: 'divs',    label: 'Dividendos', color: '#30d158', pct: allocPcts.divs,    val: alloc.divs },
              { k: 'buybacks',label: 'Buybacks',   color: '#c8a44e', pct: allocPcts.buybacks,val: alloc.buybacks },
              { k: 'debt',    label: 'Deuda↓',     color: '#5b9bd5', pct: allocPcts.debt,    val: alloc.debtPaydown },
              { k: 'ma',      label: 'M&A',        color: '#bf5af2', pct: allocPcts.ma,      val: alloc.acquisitions },
              { k: 'cash',    label: 'Caja',       color: '#94a3b8', pct: allocPcts.cash,    val: alloc.retained },
            ].filter(s => s.pct > 0.005).map(s => (
              <div key={s.k} title={`${s.label}: ${fM(s.val)} (${(s.pct * 100).toFixed(0)}%)`} style={{
                width: `${s.pct * 100}%`, background: s.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: '#000', fontWeight: 700,
                borderRight: '1px solid rgba(0,0,0,.15)',
              }}>
                {s.pct > 0.07 ? `${(s.pct * 100).toFixed(0)}%` : ''}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 10, color: 'var(--text-secondary)' }}>
            {[
              { color: '#30d158', label: 'Dividendos',    val: alloc.divs },
              { color: '#c8a44e', label: 'Buybacks',      val: alloc.buybacks },
              { color: '#5b9bd5', label: 'Repago deuda',  val: alloc.debtPaydown },
              { color: '#bf5af2', label: 'M&A',           val: alloc.acquisitions },
              { color: '#94a3b8', label: 'Caja retenida', val: retainedPos },
            ].map(s => (
              <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, background: s.color, borderRadius: 2 }} />
                {s.label}: <strong style={{ fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>{fM(s.val)}</strong>
              </span>
            ))}
          </div>

          {/* Resumen tipo "$1 generado → $X.XX al accionista" — 2026-05-18 FIX
              warning visual cuando devolvió MÁS del FCF generado (financiado con deuda) */}
          {fcf > 0 && (() => {
            const returnedPerDollar = ((alloc.divs || 0) + (alloc.buybacks || 0)) / fcf;
            const overpay = returnedPerDollar > 1;
            const color = overpay ? 'var(--red)' : returnedPerDollar > 0.8 ? '#c9972e' : '#30d158';
            return (
              <div style={{ marginTop: 12, padding: 10,
                background: overpay ? 'rgba(255,69,58,.08)' : 'var(--subtle-bg)',
                border: overpay ? '1px solid rgba(255,69,58,.3)' : 'none',
                borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                {overpay ? '🚨' : '💡'} Por cada <strong style={{ color: 'var(--text-primary)' }}>$1 de FCF</strong>, la directiva devolvió{' '}
                <strong style={{ color }}>${returnedPerDollar.toFixed(2)}</strong>{' '}
                al accionista (divs + buybacks).
                {overpay && <><br/><span style={{ color: 'var(--red)', fontWeight: 600 }}>⚠ Pago mayor al FCF generado — financiado con deuda nueva o dilución.</span></>}
              </div>
            );
          })()}

          {/* 2026-05-18 FIX: mostrar "retained negativo" cuando aplica — déficit real */}
          {alloc.retained < 0 && fcf > 0 && (
            <div style={{ marginTop: 8, padding: 10, background: 'rgba(255,69,58,.06)', border: '1px solid rgba(255,69,58,.2)', borderRadius: 6, fontSize: 11, color: 'var(--red)' }}>
              ⚠ <strong>Déficit de capital allocation: {fM(Math.abs(alloc.retained))}</strong> — la empresa asignó más que el FCF generado.
              Diferencia probablemente financiada con: deuda nueva, dilución de accionistas, o reservas de caja existentes.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══ Detección REIT / BDC ════════════════════════════════════════════
// fmpExtra.profile es la fuente canónica (DashTab usa el mismo enfoque).
// cfg.cat no se popla en el flujo principal — sólo el adapter de IB lo hace
// para ciertos overrides.
//
// Heurística fallback (LD): si profile está vacío (cache antiguo sin profile),
// detectamos REIT por la firma financiera: depreciación >25% del revenue +
// FCF positivo + (operatingIncome < 0 OR margen operativo muy bajo). Los REITs
// inmobiliarios tienen D&A enorme que destroza el operating income contable
// pero generan caja fuerte. Esta heurística no es perfecta pero rescata casos
// como ARE donde el profile no llegó.
function detectKind(fmpExtra, cfg, LD) {
  const sec = fmpExtra?.profile?.sector || cfg?.sector || '';
  const ind = (fmpExtra?.profile?.industry || cfg?.industry || '').toLowerCase();
  const desc = (fmpExtra?.profile?.description || '').toLowerCase();
  const name = (fmpExtra?.profile?.companyName || cfg?.name || '').toLowerCase();
  const cat = (cfg?.cat || '').toUpperCase();

  let isReit = cat === 'REIT'
            || sec === 'Real Estate'
            || /reit|real estate/.test(ind);

  // BDC detection — FMP industry inconsistente entre BDCs:
  //   ARCC → "Asset Management"
  //   MSDL → "Financial - Conglomerates"
  //   OBDC → "Asset Management"
  //   MAIN → "Asset Management"
  //   BIZD → "Asset Management" (ETF de BDCs)
  // Mejor señal: description contiene "business development company" o
  // "business development and finance". También aceptamos por industry
  // si combina con un name que sugiere BDC.
  let isBdc = /business development/.test(ind)
           || /business development company/.test(desc)
           || /business development and finance/.test(desc)
           || (ind === 'asset management' && (/business development|direct lending|middle.market/.test(desc) || / bdc\b| capital corp\b/.test(name)));

  // Insurance / Healthcare Plans — gross margin >50% threshold no aplica
  const isInsurance = /insurance|healthcare plans/i.test(ind) || sec === 'Insurance';

  // Banco — diferente análisis (interest income, no gross margin)
  const isBank = /bank|capital markets/i.test(ind) && sec === 'Financial Services' && !isBdc;

  // Equity negativo por buybacks/D&A — ROE pierde sentido
  const negativeEquity = LD && LD.equity != null && LD.equity < 0;

  // Fallback heurística cuando profile está vacío
  if (!isReit && !isBdc && LD && !sec && !ind) {
    const rev = LD.revenue || 0;
    const dep = LD.depreciation || 0;
    const ocf = LD.ocf || 0;
    const oi = LD.operatingIncome || 0;
    if (rev > 0 && dep / rev > 0.25 && ocf > 0 && (oi < 0 || oi / rev < 0.10)) {
      isReit = true;
    }
  }
  return { isReit, isBdc, isInsurance, isBank, negativeEquity };
}

// ═══ Quality Card — 6 criterios (adapta umbrales para REIT/BDC) ══════
function QualityCard({ comp, fin, CHART_YEARS, L, LD, cfg, fmpExtra }) {
  const yrs = (CHART_YEARS || []).slice(-5);
  const { isReit, isBdc, isInsurance, isBank, negativeEquity } = detectKind(fmpExtra, cfg, LD);

  const gmTrend = yrs.map(y => comp[y]?.gm).filter(v => v != null);
  const omTrend = yrs.map(y => comp[y]?.om).filter(v => v != null);
  const roeTrend = yrs.map(y => comp[y]?.roe).filter(v => v != null);
  const roicTrend = yrs.map(y => comp[y]?.roic).filter(v => v != null);
  const revTrend = yrs.map(y => fin[y]?.revenue).filter(v => v != null);
  const d2fcfTrend = yrs.map(y => comp[y]?.d2fcf).filter(v => v != null && Number.isFinite(v));

  // Derived per-year series for REIT (EBITDA margin, NetDebt/EBITDA, intCov, payout)
  // EBITDA: prefer (OI + D&A) si está bien. Para REITs FMP a veces no separa
  // bien D&A en el income statement → fallback a (OCF + interestExpense) que
  // es proxy razonable: OCF ya incluye D&A added back, y al añadir intereses
  // pagados volvemos a pre-interest cash earnings ≈ EBITDA.
  // Interest coverage: usar EBITDA, no OperatingIncome (que para REITs sale
  // negativo por la depreciación contable, generando ratios sin sentido).
  const computeReit = y => {
    const f = fin[y]; if (!f) return null;
    let ebitda = (f.operatingIncome || 0) + (f.depreciation || 0);
    const ebitdaProxy = (f.ocf || 0) + (f.interestExpense || 0);
    if (f.revenue > 0 && (ebitda <= 0 || ebitda / f.revenue < 0.20) && ebitdaProxy > 0) {
      ebitda = ebitdaProxy;
    }
    const ebitdaMargin = f.revenue > 0 ? ebitda / f.revenue : null;
    const netDebt = (f.totalDebt || 0) - (f.cash || 0);
    const ndEbitda = ebitda > 0 ? netDebt / ebitda : null;
    const intCov = f.interestExpense > 0 && ebitda > 0 ? ebitda / f.interestExpense : null;
    const fcf = (f.ocf || 0) - (f.capex || 0);
    const divs = (f.dps || 0) * (f.sharesOut || 0);
    const affoPayout = fcf > 0 ? divs / fcf : null;
    return { ebitdaMargin, ndEbitda, intCov, affoPayout, ebitda };
  };
  const reitTrendsEM   = yrs.map(y => computeReit(y)?.ebitdaMargin).filter(v => v != null);
  const reitTrendsNDE  = yrs.map(y => computeReit(y)?.ndEbitda).filter(v => v != null);
  const reitTrendsIC   = yrs.map(y => computeReit(y)?.intCov).filter(v => v != null);
  const reitTrendsAP   = yrs.map(y => computeReit(y)?.affoPayout).filter(v => v != null);

  // Choose checks based on kind. REIT/BDC use different thresholds because
  // their accounting (heavy D&A) and structural leverage make standard
  // industrial benchmarks meaningless. BDCs comparten lógica con REIT por
  // su perfil similar: alto payout, ROE bajo, capital-intensive, divs ≥90%
  // del income por estructura legal.
  const checks = (isReit || isBdc) ? (() => {
    const r = computeReit(yrs[yrs.length - 1]) || {};
    return [
      {
        label: 'Margen EBITDA > 50%',
        value: r.ebitdaMargin,
        pass: r.ebitdaMargin != null ? r.ebitdaMargin > 0.50 : null,
        spark: <Spark values={reitTrendsEM} color="#48a999" />,
        tip: 'Para REITs, los márgenes contables (operating, net) están distorsionados por la depreciación inmobiliaria. EBITDA margen es la métrica relevante. Buenos REITs operan al 50-70%.',
      },
      {
        label: 'Net Debt / EBITDA < 6×',
        value: r.ndEbitda,
        pass: r.ndEbitda != null ? r.ndEbitda < 6 : null,
        fmt: 'mult',
        spark: <Spark values={reitTrendsNDE} color="#5b9bd5" />,
        tip: 'REITs operan apalancados estructuralmente — 5-6× Net Debt/EBITDA es normal (vs <3× para industrias). Más de 7× ya es preocupante (Brookfield, IRM han estado ahí).',
      },
      {
        label: 'AFFO Payout < 90%',
        value: r.affoPayout,
        pass: r.affoPayout != null && r.affoPayout > 0 ? r.affoPayout < 0.90 : null,
        spark: <Spark values={reitTrendsAP} color="#c9972e" />,
        tip: 'AFFO ≈ FCF para REITs. Pagar más del 90% del AFFO en dividendo deja poco margen de seguridad. Realty Income ~75%, Simon ~50% son referencias sólidas.',
      },
      {
        label: 'Interest coverage > 3×',
        value: r.intCov,
        pass: r.intCov != null ? r.intCov > 3 : null,
        fmt: 'mult',
        spark: <Spark values={reitTrendsIC} color="#bf5af2" />,
        tip: 'EBIT / Interest Expense. Por encima de 3× indica que la deuda es manejable. Por debajo de 2× es zona de crisis financiera (refinancing risk).',
      },
      {
        label: 'ROE > 5%',
        value: L?.roe,
        pass: L?.roe != null ? L.roe > 0.05 : null,
        spark: <Spark values={roeTrend} color="#88c790" />,
        tip: 'REITs tienen ROE más bajo que industriales por su modelo capital-intensivo. >5% es decente, >10% excelente.',
      },
      {
        label: 'Ventas crecientes 5y',
        value: revTrend.length >= 2 ? (revTrend[revTrend.length - 1] / revTrend[0]) ** (1 / (revTrend.length - 1)) - 1 : null,
        pass: revTrend.length >= 2 ? revTrend[revTrend.length - 1] > revTrend[0] : null,
        spark: <Spark values={revTrend} color="#30d158" />,
        tip: 'Same-store NOI growth + adquisiciones acretivas deberían producir crecimiento de ingresos consistente. Ventas planas/cayendo en un REIT = problema estructural.',
      },
    ];
  })() : [
    // Insurance / Banks: el margen bruto no se calcula vs revenue de forma
    // estándar — el "COGS" es claims/interest paid. Skip o show N/A.
    ...(isInsurance || isBank ? [{
      label: isInsurance ? 'Combined Ratio (insurance)' : 'Net Interest Margin (bank)',
      value: null,
      pass: null,
      spark: null,
      tip: isInsurance
        ? 'Para aseguradoras, el "margen bruto" no se calcula vs revenue como en industrias. Los KPI relevantes son combined ratio (<100% = underwriting rentable) y reservas. No disponibles vía FMP estándar.'
        : 'Para bancos, el margen relevante es Net Interest Margin (NIM = interest income - interest expense / earning assets). No disponible vía FMP estándar.',
    }] : [{
      label: 'Margen bruto > 50%',
      value: L?.gm,
      pass: L?.gm != null ? L.gm > 0.50 : null,
      spark: <Spark values={gmTrend} color="#48a999" />,
      tip: 'Margen bruto >50% indica pricing power — la competencia no consigue replicar el producto/servicio fácilmente. Típico de consumer staples, software, marcas premium. No aplica a insurance, banks, distribuidores.',
    }]),
    {
      label: 'Margen operativo > 15%',
      value: L?.om,
      pass: L?.om != null ? L.om > 0.15 : null,
      spark: <Spark values={omTrend} color="#30d158" />,
      tip: 'Margen operativo >15-20% y estable indica negocio de calidad. Las cíclicas tienen márgenes oscilantes (commodities, retail discrecional).',
    },
    // ROE con equity negativo no tiene sentido — empresas como MCD, BA tras
    // buybacks masivos tienen equity contable negativo → ROE -300%. No es bug,
    // es contabilidad rota por estructura de capital. Marcamos N/A.
    negativeEquity ? {
      label: 'ROE > 20%',
      value: null,
      pass: null,
      spark: null,
      tip: 'Equity contable negativo (frecuente en empresas con buybacks masivos como MCD, BA, HD). El ROE se vuelve no informativo. Usa ROIC abajo como métrica alternativa.',
    } : {
      label: 'ROE > 20%',
      value: L?.roe,
      pass: L?.roe != null ? L.roe > 0.20 : null,
      spark: <Spark values={roeTrend} color="#c9972e" />,
      tip: 'ROE 20-40% es indicativo de calidad. Empresas con mucha necesidad de capital están en 6-8%. Cuidado con ROE inflado por leverage extremo o equity negativo por buybacks.',
    },
    {
      label: 'ROIC > 20%',
      value: L?.roic,
      pass: L?.roic != null ? L.roic > 0.20 : null,
      spark: <Spark values={roicTrend} color="#bf5af2" />,
      tip: 'ROIC ajusta por deuda — más limpio que ROE para comparar empresas con distintas estructuras de capital. >ROIC sobre WACC sostenido = la empresa crea valor.',
    },
    {
      label: 'Deuda / FCF < 3×',
      value: L?.d2fcf,
      pass: L?.d2fcf == null || !Number.isFinite(L.d2fcf) ? null
          : L.d2fcf <= 0 ? true
          : L.d2fcf < 3,
      fmt: 'mult',
      spark: <Spark values={d2fcfTrend} color="#5b9bd5" />,
      tip: 'Si el FCF de 3 años puede liquidar toda la deuda neta, el balance es manejable. Valor negativo = la empresa tiene más caja que deuda (net cash = excelente).',
    },
    {
      label: 'Ventas crecientes 5y',
      value: revTrend.length >= 2 ? (revTrend[revTrend.length - 1] / revTrend[0]) ** (1 / (revTrend.length - 1)) - 1 : null,
      pass: revTrend.length >= 2 ? revTrend[revTrend.length - 1] > revTrend[0] : null,
      spark: <Spark values={revTrend} color="#88c790" />,
      tip: 'Ventas decrecientes estructurales es señal de declive secular. Periodos temporales bajos son OK (Diageo, KO post-COVID), pero 5+ años cayendo = problema.',
    },
  ];

  const passed = checks.filter(c => c.pass === true).length;
  const total = checks.length;
  const verdict = passed >= 5 ? { label: 'Negocio excelente 🎯', color: 'var(--green)' }
    : passed >= 4 ? { label: 'Alta calidad ✅', color: 'var(--green)' }
    : passed >= 3 ? { label: 'Calidad media ⚠', color: 'var(--gold)' }
    : { label: 'Riesgo alto ❌', color: 'var(--red)' };

  const title = isReit ? 'Calidad del negocio (criterios REIT)'
              : isBdc ? 'Calidad del negocio (criterios BDC)'
              : isInsurance ? 'Calidad del negocio (seguros)'
              : isBank ? 'Calidad del negocio (banca)'
              : 'Calidad del negocio';

  return (
    <Card title={title} icon="◆" badge={
      <span style={{
        fontSize: 11, fontWeight: 700, color: verdict.color, padding: '4px 10px',
        borderRadius: 100, border: `1px solid ${verdict.color}`,
        background: verdict.color === 'var(--green)' ? 'rgba(48,209,88,.12)'
                  : verdict.color === 'var(--gold)' ? 'rgba(255,214,10,.12)'
                  : 'rgba(255,69,58,.12)',
      }}>{passed}/{total} {verdict.label}</span>
    }>
      <div style={{ marginTop: 4 }}>
        {checks.map((c, i) => (
          <CheckRow key={i} label={c.label} value={c.value} pass={c.pass} fmt={c.fmt || 'pct'} spark={c.spark} tip={c.tip} />
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
        {isReit
          ? 'Criterios adaptados para REIT: EBITDA margen, Net Debt/EBITDA y AFFO payout sustituyen a las métricas industriales estándar. Los REITs operan con alta depreciación contable y leverage estructural.'
          : isBdc
          ? 'Criterios adaptados para BDC: similares a REIT — alto payout (≥90% por 1940 Act), ROE estructuralmente bajo, leverage regulado a max 2:1 deuda/equity. La cobertura se mide vs NII (Net Investment Income) ≈ FCF.'
          : isInsurance
          ? 'Criterios estándar pero el "margen bruto" no aplica a aseguradoras (claims = mayoría del COGS). Foco en ROE, ROIC, deuda y crecimiento de primas.'
          : isBank
          ? 'Criterios estándar pero el "margen bruto" no aplica a bancos. Foco en ROE, balance y crecimiento. Mejor mirar NIM y combined ratio en pestañas dedicadas.'
          : 'Criterios de calidad para dividend investing: márgenes, rentabilidad sobre capital, balance, y crecimiento de ingresos. Umbrales pensados para industriales/consumer/tech rentables.'}
      </div>
    </Card>
  );
}

// ═══ Cobertura del dividendo (gauge circular SVG) ════════════════════
// Para REITs el dividendo se paga del AFFO (≈ FCF aquí), no del NetIncome.
// Los thresholds son más bajos porque el modelo de REIT es payout alto por
// estructura legal (90%+ del income obligatorio para mantener status fiscal).
//
// Mostramos cobertura latest AÑO + promedio 3 años para suavizar one-time
// items (ej. KO tuvo $6B IRS tax payment en 2024 → FCF parecía bajo, pero
// el promedio 3y muestra coverage real).
function FCFCoverageGauge({ L, LD, cfg, fmpExtra, fin, CHART_YEARS }) {
  const { isReit } = detectKind(fmpExtra, cfg, LD);
  const fcf = (LD.ocf || 0) - (LD.capex || 0);
  const divs = (LD.dps || 0) * (LD.sharesOut || 0);
  const cov = divs > 0 ? fcf / divs : null;
  if (cov == null) {
    return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>Sin dividendo o sin FCF.</div>;
  }

  // 3-year average cov para evitar distorsiones por one-time items
  const last3 = (CHART_YEARS || []).slice(-3).map(y => {
    const f = fin?.[y]; if (!f) return null;
    const yrFcf = (f.ocf || 0) - (f.capex || 0);
    const yrDivs = (f.dps || 0) * (f.sharesOut || 0);
    return yrDivs > 0 ? yrFcf / yrDivs : null;
  }).filter(v => v != null && Number.isFinite(v));
  const cov3y = last3.length >= 2 ? last3.reduce((s, v) => s + v, 0) / last3.length : null;
  const max = isReit ? 3 : 5;
  const pct = Math.min(1, Math.max(0, cov / max));
  // REIT thresholds: 1.2× es cómodo, 1.0× borderline, <1× insostenible
  // Industrial thresholds: 2× cómodo, 1.2× justo, 1.0× borderline
  const thresholds = isReit ? { green: 1.2, gold: 1.0, orange: 0.9 } : { green: 2, gold: 1.2, orange: 1 };
  const color = cov >= thresholds.green ? '#30d158'
              : cov >= thresholds.gold ? '#c9972e'
              : cov >= thresholds.orange ? '#ff9f0a'
              : '#ff453a';
  const verdict = cov >= thresholds.green ? (isReit ? 'AFFO payout sano ✓' : 'Cobertura cómoda ✓')
                : cov >= thresholds.gold ? 'Justo aceptable'
                : cov >= thresholds.orange ? 'En el filo' : 'Insostenible';

  // Semicircle arc: SVG path from (10,80) to (190,80) with radius 90
  const angle = Math.PI * pct; // 0..π
  const x = 100 - 90 * Math.cos(angle);
  const y = 80 - 90 * Math.sin(angle);
  const largeArc = pct > 0.5 ? 1 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 8 }}>
      <svg width="200" height="120" viewBox="0 0 200 120">
        {/* Background arc */}
        <path d="M 10,80 A 90,90 0 0,1 190,80" fill="none" stroke="var(--subtle-bg)" strokeWidth="14" strokeLinecap="round" />
        {/* Coloured progress arc */}
        <path d={`M 10,80 A 90,90 0 ${largeArc},1 ${x.toFixed(1)},${y.toFixed(1)}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
        {/* Tick marks at 1x, 2x, 3x */}
        {[1, 2, 3, 4].map(t => {
          const a = Math.PI * (t / max);
          const x1 = 100 - 90 * Math.cos(a); const y1 = 80 - 90 * Math.sin(a);
          const x2 = 100 - 100 * Math.cos(a); const y2 = 80 - 100 * Math.sin(a);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-tertiary)" strokeWidth="1" />;
        })}
        <text x="100" y="65" textAnchor="middle" fontSize="32" fontWeight="700" fill="var(--text-primary)" fontFamily="var(--fm)">{cov.toFixed(2)}×</text>
        <text x="100" y="82" textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">cobertura FCF/divs</text>
      </svg>
      <div style={{ fontSize: 12, color, fontWeight: 700, marginTop: 4 }}>{verdict}</div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6, textAlign: 'center', lineHeight: 1.5 }}>
        Cada $1 de dividendo está respaldado por <strong style={{ color }}>${cov.toFixed(2)}</strong> de {isReit ? 'AFFO' : 'caja libre'} real.<br/>
        {isReit ? 'AFFO' : 'FCF'}: {fM(fcf)} · Divs: {fM(divs)}
        {cov3y != null && Math.abs(cov3y - cov) > 0.30 && (
          <><br/><span style={{ fontSize: 10, fontWeight: 700, color: cov3y >= (isReit ? 1.2 : 1.5) ? '#30d158' : '#ff9f0a' }}>
            Promedio 3y: {cov3y.toFixed(2)}×
          </span>{' '}<span style={{ fontSize: 9 }}>(latest puede incluir one-time items)</span></>
        )}
        {isReit && <><br/><span style={{ fontSize: 9 }}>REIT: umbral verde 1.2× (no 2×) por payout estructural alto</span></>}
      </div>
    </div>
  );
}

// ═══ TIR a 7 años ═════════════════════════════════════════════════════
// Para REITs usamos AFFO per share (= FCF/shares) en vez de EPS, y P/AFFO
// en vez de P/E, porque las pérdidas contables por depreciación distorsionan
// el EPS de un REIT (muchas veces negativo aunque el cash flow sea fuerte).
function TIR7yRadar({ cfg, fin, LD, fmpExtra, DATA_YEARS, CHART_YEARS }) {
  const { isReit } = detectKind(fmpExtra, cfg, LD);
  const price = cfg.price || 0;
  if (!price) {
    return <Card title="TIR esperada 7 años" icon="🎯">
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
        Sin precio actual.
      </div>
    </Card>;
  }

  // Decidir métrica base. Para REIT: AFFO per share. Para resto: EPS.
  const metricLabel = isReit ? 'AFFO/sh' : 'EPS';
  const ratioLabel  = isReit ? 'P/AFFO'  : 'P/E';

  const sharesNow = LD.sharesOut || 1;
  const fcfNow = (LD.ocf || 0) - (LD.capex || 0);
  const affoPS = fcfNow > 0 && sharesNow > 0 ? fcfNow / sharesNow : null;
  const baseNow = isReit ? affoPS : (LD.eps > 0 ? LD.eps : null);

  if (!baseNow || baseNow <= 0) {
    return <Card title="TIR esperada 7 años" icon="🎯">
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
        Sin {metricLabel} positivo — no es posible estimar TIR.
      </div>
    </Card>;
  }

  const multipleNow = price / baseNow;

  // Múltiplo histórico
  let multipleHist = [];
  if (isReit) {
    // Calculamos P/AFFO histórico desde FMP keyMetrics si tiene pfcfRatio
    // (price/fcf por acción), si no fallback a peRatio (peor proxy).
    multipleHist = (DATA_YEARS || []).map(y => {
      const km = fmpExtra?.keyMetrics?.find(k => k.date?.startsWith(String(y)));
      return km?.pfcfRatio || km?.priceToFreeCashFlowsRatio;
    }).filter(v => v != null && Number.isFinite(v) && v > 0 && v < 100);
  } else {
    multipleHist = (DATA_YEARS || []).map(y => {
      const km = fmpExtra?.keyMetrics?.find(k => k.date?.startsWith(String(y)));
      return km?.peRatio;
    }).filter(v => v != null && Number.isFinite(v) && v > 0 && v < 100);
  }
  multipleHist.sort((a, b) => a - b);
  const multipleTarget = multipleHist.length > 0 ? multipleHist[Math.floor(multipleHist.length / 2)] : multipleNow;

  // Crecimiento esperado: CAGR de la métrica base (AFFO/sh para REIT, EPS para resto)
  const baseSeries = (CHART_YEARS || []).map(y => {
    const f = fin[y]; if (!f) return null;
    if (isReit) {
      const fcf = (f.ocf || 0) - (f.capex || 0);
      const sh = f.sharesOut || 0;
      return fcf > 0 && sh > 0 ? fcf / sh : null;
    }
    return f.eps > 0 ? f.eps : null;
  }).filter(v => v != null && v > 0);
  const cagr = baseSeries.length >= 2
    ? Math.pow(baseSeries[baseSeries.length - 1] / baseSeries[0], 1 / (baseSeries.length - 1)) - 1
    : 0;
  const growth = Math.max(-0.05, Math.min(0.25, cagr || 0));

  // Yield medio
  const dpsCurr = LD.dps || 0;
  const yld = price > 0 ? dpsCurr / price : 0;

  // Expansión múltiplo anualizada (7y)
  const expansion = multipleNow > 0 ? Math.pow(multipleTarget / multipleNow, 1 / 7) - 1 : 0;

  // TIR total ≈ yield + growth + expansion
  const tir = yld + growth + expansion;
  const requiredReturn = 0.10;
  const passes = tir >= requiredReturn;

  const tirColor = tir >= 0.12 ? '#30d158' : tir >= 0.10 ? '#c9972e' : tir >= 0.07 ? '#ff9f0a' : '#ff453a';
  const verdictText = passes ? `PASA filtro 10% (+${((tir - requiredReturn) * 100).toFixed(1)}pp)`
                              : `NO PASA filtro 10% (${((tir - requiredReturn) * 100).toFixed(1)}pp)`;

  const Line = ({ label, value, isTotal = false }) => (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 110px', alignItems: 'center', gap: 8,
      padding: '7px 4px', borderBottom: '1px solid var(--subtle-bg)',
      fontSize: isTotal ? 14 : 12, fontWeight: isTotal ? 700 : 400,
      color: isTotal ? tirColor : 'var(--text-secondary)',
    }}>
      <span>{label}</span>
      <span style={{ fontFamily: 'var(--fm)', textAlign: 'right' }}>{value}</span>
    </div>
  );

  return (
    <Card title={`TIR esperada 7 años${isReit ? ' (REIT)' : ''}`} icon="🎯" badge={
      <span style={{
        fontSize: 11, fontWeight: 700, color: tirColor, padding: '4px 10px',
        borderRadius: 100, border: `1px solid ${tirColor}`,
        background: tirColor === '#30d158' ? 'rgba(48,209,88,.12)'
                  : tirColor === '#c9972e' ? 'rgba(255,214,10,.12)'
                  : tirColor === '#ff9f0a' ? 'rgba(255,159,10,.12)'
                  : 'rgba(255,69,58,.12)',
      }}>{(tir * 100).toFixed(1)}% anual</span>
    }>
      <div style={{ marginTop: 4 }}>
        <Line label={`Yield actual (DPS $${dpsCurr.toFixed(2)} / precio)`} value={`${(yld * 100).toFixed(2)}% / año`} />
        <Line label={`Crecimiento ${metricLabel} esperado (CAGR ${baseSeries.length}y)`} value={`${(growth * 100).toFixed(2)}% / año`} />
        <Line label={`Cambio múltiplo (${ratioLabel} ${multipleNow.toFixed(1)}× → ${multipleTarget.toFixed(1)}× en 7y)`} value={`${(expansion * 100).toFixed(2)}% / año`} />
        <Line label="TIR total esperada" value={`${(tir * 100).toFixed(1)}% / año`} isTotal />
      </div>
      <div style={{ marginTop: 12, padding: 10, background: passes ? 'rgba(48,209,88,.08)' : 'rgba(255,69,58,.08)', borderRadius: 6, fontSize: 11, color: passes ? '#30d158' : '#ff453a', fontWeight: 600 }}>
        {verdictText}
      </div>
      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
        {isReit
          ? `Para REITs usamos AFFO/sh y P/AFFO en vez de EPS y P/E, porque la depreciación inmobiliaria distorsiona el EPS contable. AFFO ≈ FCF aquí. Fórmula: yield + crecimiento AFFO + cambio múltiplo. Filtro 10% anual.`
          : `Fórmula: yield actual + crecimiento EPS esperado + expansión múltiplo (P/E actual vs mediana histórica). Filtro 10% anual. La mediana histórica viene de FMP keyMetrics (precio real de cierre cada año).`}
      </div>
    </Card>
  );
}

// ═══ Histórico FCF allocation 5y ═════════════════════════════════════
function FCFHistorical5y({ comp, fin, CHART_YEARS }) {
  // 2026-05-17: el componente original mostraba TODOS los años de CHART_YEARS
  // (puede ser 10+) aunque el título dice "5 años". Limito a los últimos 5
  // cronológicos (CHART_YEARS está ordenado asc — recientes al final).
  const lastFive = (CHART_YEARS || []).slice(-5);
  const rows = lastFive.map(y => {
    const d = fin[y]; if (!d) return null;
    const a = comp[y]?.fcfAlloc;
    if (!a) return null;
    const total = a.divs + a.buybacks + a.debtPaydown + a.acquisitions + a.retained;
    if (total <= 0) return null;
    return { y, ...a, total };
  }).filter(Boolean);

  if (rows.length === 0) {
    return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)' }}>Sin histórico de allocation.</div>;
  }
  const maxTotal = Math.max(...rows.map(r => r.total), 1);
  const SEGS = [
    { k: 'divs',        label: 'Divs',  color: '#30d158' },
    { k: 'buybacks',    label: 'Buy',   color: '#c8a44e' },
    { k: 'debtPaydown', label: 'Deuda', color: '#5b9bd5' },
    { k: 'acquisitions',label: 'M&A',   color: '#bf5af2' },
    { k: 'retained',    label: 'Caja',  color: '#94a3b8' },
  ];
  const BAR_H = 140;
  return (
    <div style={{ padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: BAR_H + 24, marginBottom: 6 }}>
        {rows.map((r, i) => {
          const barH = (r.total / maxTotal) * BAR_H;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '100%', maxWidth: 60, display: 'flex', flexDirection: 'column-reverse', height: barH, borderRadius: '4px 4px 0 0', overflow: 'hidden', border: '1px solid var(--border)' }}
                title={SEGS.map(s => `${s.label}: ${fM(r[s.k])} (${((r[s.k] / r.total) * 100).toFixed(0)}%)`).join('\n')}>
                {SEGS.map(s => {
                  const segH = r.total > 0 ? (r[s.k] / r.total) * barH : 0;
                  if (segH < 0.5) return null;
                  return <div key={s.k} style={{ width: '100%', height: segH, background: s.color, flexShrink: 0 }} />;
                })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 600, fontFamily: 'var(--fm)' }}>{String(r.y).slice(2)}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{fM(r.total)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8, fontSize: 10, color: 'var(--text-secondary)' }}>
        {SEGS.map(s => (
          <span key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, background: s.color, borderRadius: 2, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-tertiary)' }}>5 años · barras = % del FCF</span>
      </div>
    </div>
  );
}

// ═══ Export — composición de los 4 widgets ════════════════════════════
export default function FlujoTab() {
  const { fin, cfg, comp, L, LD, CHART_YEARS, DATA_YEARS, fmpExtra } = useAnalysis();
  const alloc = L?.fcfAlloc;
  const { isReit, isBdc } = detectKind(fmpExtra, cfg, LD);

  const headerSummary = useMemo(() => {
    const rev = LD?.revenue || 0;
    const fcf = (LD?.ocf || 0) - (LD?.capex || 0);
    const divs = (LD?.dps || 0) * (LD?.sharesOut || 0);
    return { rev, fcf, divs, fcfm: rev > 0 ? fcf / rev : 0 };
  }, [LD]);

  if (!cfg?.ticker || !LD?.revenue) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>
        Sin datos financieros suficientes para análisis de flujo.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header tipo "headline" */}
      <div style={{
        padding: '14px 18px', borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(48,209,88,.06), rgba(201,151,46,.06))',
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5, fontWeight: 700 }}>
          💧 ¿Cuánto dinero genera {cfg.ticker} y a dónde va?
          {isReit && <span style={{ marginLeft: 8, padding: '2px 8px', background: 'rgba(100,210,255,.15)', color: '#64d2ff', borderRadius: 4, fontSize: 9 }}>REIT — métricas adaptadas</span>}
          {isBdc && <span style={{ marginLeft: 8, padding: '2px 8px', background: 'rgba(191,90,242,.15)', color: '#bf5af2', borderRadius: 4, fontSize: 9 }}>BDC — métricas adaptadas</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Revenue</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--fm)' }}>{fM(headerSummary.rev)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{isReit ? 'AFFO ≈' : 'FCF'}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#c9972e', fontFamily: 'var(--fm)' }}>{fM(headerSummary.fcf)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{isReit ? 'AFFO margen' : 'FCF margen'}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--fm)' }}>{(headerSummary.fcfm * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Dividendos pagados</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#30d158', fontFamily: 'var(--fm)' }}>{fM(headerSummary.divs)}</div>
          </div>
        </div>
        {isReit && (
          <div style={{ marginTop: 10, padding: 8, background: 'rgba(100,210,255,.06)', borderRadius: 6, fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            ℹ️ Este ticker es un <strong>REIT</strong>: los márgenes contables (gross, operating) están distorsionados por la depreciación inmobiliaria, que es un cargo no-cash gigantesco. La métrica relevante es <strong>AFFO</strong> (Adjusted Funds From Operations ≈ OCF − CapEx mantenimiento). Los REITs por ley reparten ≥90% del ingreso imponible vía dividendos.
          </div>
        )}
      </div>

      {/* Cascada principal */}
      <Card title="Cascada del dinero — De Revenue a accionista" icon="💧">
        <CashFlowCascade LD={LD} L={L} alloc={alloc} />
      </Card>

      {/* Quality + Coverage en grid 2 columnas (responsive auto). minmax 300px
          para asegurar 2 columnas en desktop pestaña-analysis donde el área de
          contenido suele ser ~680-800px tras restar header/sidebar. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <QualityCard comp={comp} fin={fin} CHART_YEARS={CHART_YEARS} L={L} LD={LD} cfg={cfg} fmpExtra={fmpExtra} />
        <Card title={isReit ? 'Cobertura del dividendo (AFFO/Divs)' : 'Cobertura del dividendo (FCF/Divs)'} icon="🛡">
          <FCFCoverageGauge L={L} LD={LD} cfg={cfg} fmpExtra={fmpExtra} fin={fin} CHART_YEARS={CHART_YEARS} />
        </Card>
      </div>

      {/* TIR + Histórico 5y allocation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <TIR7yRadar cfg={cfg} fin={fin} LD={LD} fmpExtra={fmpExtra} DATA_YEARS={DATA_YEARS} CHART_YEARS={CHART_YEARS} />
        <Card title="Histórico asignación FCF (5 años)" icon="📊">
          <FCFHistorical5y comp={comp} fin={fin} CHART_YEARS={CHART_YEARS} />
        </Card>
      </div>
    </div>
  );
}
