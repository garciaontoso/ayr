// AportaApartaTab — "Divis: Aporta o Aparta"
//
// Aplica los 8 criterios del libro de Lowell Miller "La Mejor Inversión:
// Crea riqueza con dividendos crecientes" a cada posición de la cartera US
// con ≥100 shares. Veredicto APORTA / VIGILAR / APARTA + donut chart del FCF.
//
// Implementado 2026-05-13 — request directo del usuario tras compartir el
// libro en EPUB + capturas. Backend: /api/dividendos/aporta-o-aparta.
import { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';
import { InlineLoading, EmptyState } from '../ui/EmptyState.jsx';

// ── Paleta de veredictos (consistente con el resto de la app) ──────
const VERDICT_STYLE = {
  APORTA:  { bg: 'rgba(34,197,94,.18)',  fg: '#22c55e', border: '#22c55e', icon: '🟢', label: 'APORTA',
             desc: '6+ de 7-8 criterios cumplidos. Candidata sólida según Miller.' },
  VIGILAR: { bg: 'rgba(212,175,55,.18)', fg: '#d4af37', border: '#d4af37', icon: '🟡', label: 'VIGILAR',
             desc: '4-5 criterios cumplidos. Mira con lupa antes de aportar.' },
  APARTA:  { bg: 'rgba(239,68,68,.18)',  fg: '#ef4444', border: '#ef4444', icon: '🔴', label: 'APARTA',
             desc: 'Menos de la mitad de criterios. No cumple el estándar Miller.' },
};

// ── Paleta del donut chart FCF allocation ───────────────────────────
const FCF_COLORS = {
  dividends:    { fill: '#22c55e', label: 'Dividendos',         help: 'Reparto a accionistas (lo que cobramos nosotros)' },
  buybacks:     { fill: '#60a5fa', label: 'Recompra acciones',  help: 'Buybacks: reduce shares, aumenta EPS futuro' },
  debt_paydown: { fill: '#a78bfa', label: 'Amortizar deuda',    help: 'Pagar deuda — refuerza balance' },
  capex:        { fill: '#d4af37', label: 'Capex / Inversión',  help: 'Mantenimiento + crecimiento del negocio' },
  retained:     { fill: '#94a3b8', label: 'Retenido / Otros',   help: 'Cash que se queda en balance o usado en M&A' },
};

// ── Los 8 criterios del libro (para el panel didáctico) ─────────────
const CRITERIA_GUIDE = [
  { n: 1, name: 'Precio / Ventas (P/S) < 1.5',
    why: 'O\'Shaughnessy demostró: las 50 acciones con menor P/S casi cuadruplicaron el rendimiento del universo.',
    quote: 'cap. 5: "uno de los factores fundamentales más útiles, basado en un riguroso estudio cuantitativo"' },
  { n: 2, name: 'Rentabilidad por dividendo ≥ 2%',
    why: 'Miller propone carteras al 3-5%. El SP500 ronda 1.6%. Por debajo de 2% no aporta como income real.',
    quote: 'cap. 4: "alta rentabilidad por dividendo + crecimiento del dividendo + alta calidad"' },
  { n: 3, name: 'Crecimiento dividendos 5y ≥ 4%',
    why: 'Mínimo para superar la inflación histórica. Idealmente 10% (objetivo Miller para "máquina de capitalización").',
    quote: 'cap. 4: "una tasa de crecimiento mínima debería ser de alrededor el 4%"' },
  { n: 4, name: 'Crecimiento beneficios 5y ≥ 5%',
    why: 'Los dividendos se pagan con beneficios. Sin EPS creciente, los divs no son sostenibles.',
    quote: 'cap. 4: "el crecimiento anual de los beneficios debe ser constante, en el rango del 5%-10%"' },
  { n: 5, name: 'Payout < 60% (REITs/Utilities < 95%)',
    why: 'Margen para mantener y aumentar el dividendo año tras año. Por encima de 60% la empresa no reinvierte lo suficiente.',
    quote: 'cap. 4: "El ratio pay-out debe ser inferior al 60% en casi todos los valores, excepto utilities y REITs"' },
  { n: 6, name: 'Debt / Equity < 1.0',
    why: 'Empresas sin deuda aguantan recesiones. Pueden comprar competidores cuando otros se ven obligados a replegarse.',
    quote: 'cap. 4: "cuanto menor sea la deuda, mejor, incluso si la deuda es 0"' },
  { n: 7, name: 'FCF cubre dividendos ≥ 1.5x',
    why: 'El flujo de caja libre debe cubrir el dividendo con margen. Si está por debajo de 1.5x, el dividendo está en riesgo.',
    quote: 'cap. 4: "el flujo de caja debe ser lo suficientemente amplio para financiar dividendos y la inversión necesaria"' },
  { n: 8, name: 'Insider ownership ≥ 15%',
    why: 'Cuando los directivos tienen "skin in the game", sus decisiones se alinean con los accionistas a largo plazo.',
    quote: 'cap. 5: "favorecerá a las empresas en las que las personas con información privilegiada posean al menos el 15%"' },
];

// ── Donut chart SVG inline ──────────────────────────────────────────
function FcfDonut({ alloc, size = 180 }) {
  if (!alloc) return <div style={{ color: 'var(--text-tertiary)', fontSize: 12, padding: 20 }}>Sin datos FCF</div>;
  const segments = [
    { key: 'dividends',    pct: alloc.dividends || 0 },
    { key: 'buybacks',     pct: alloc.buybacks || 0 },
    { key: 'debt_paydown', pct: alloc.debt_paydown || 0 },
    { key: 'capex',        pct: alloc.capex || 0 },
    { key: 'retained',     pct: alloc.retained || 0 },
  ].filter(s => s.pct > 0.1);

  const total = segments.reduce((s, x) => s + x.pct, 0) || 100;
  const cx = size / 2, cy = size / 2, r = size * 0.4, ir = size * 0.25;
  let cumDeg = -90;

  function arc(startDeg, sweepDeg) {
    const startRad = startDeg * Math.PI / 180;
    const endRad = (startDeg + sweepDeg) * Math.PI / 180;
    const large = sweepDeg > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const ix2 = cx + ir * Math.cos(endRad);
    const iy2 = cy + ir * Math.sin(endRad);
    const ix1 = cx + ir * Math.cos(startRad);
    const iy1 = cy + ir * Math.sin(startRad);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {segments.map((s) => {
          const sweep = (s.pct / total) * 360;
          const path = arc(cumDeg, sweep);
          cumDeg += sweep;
          return <path key={s.key} d={path} fill={FCF_COLORS[s.key].fill}
            stroke="var(--bg)" strokeWidth="2" />;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fill="var(--text-tertiary)"
          style={{ fontFamily: 'var(--fm)', fontWeight: 600 }}>FCF</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="13" fill="var(--gold)"
          style={{ fontFamily: 'var(--fm)', fontWeight: 700 }}>
          {alloc.ocf_usd ? `$${(alloc.ocf_usd/1e9).toFixed(1)}B` : ''}
        </text>
      </svg>
      <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: FCF_COLORS[s.key].fill, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {FCF_COLORS[s.key].label} <span style={{ color: FCF_COLORS[s.key].fill, fontFamily: 'var(--fm)' }}>{s.pct.toFixed(1)}%</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{FCF_COLORS[s.key].help}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tarjeta resumen de una empresa ──────────────────────────────────
function EmpresaCard({ data, expanded, onToggle }) {
  const v = VERDICT_STYLE[data.verdict] || VERDICT_STYLE.APARTA;
  const passPct = (data.pass_count / data.total) * 100;

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${v.border}40`,
      borderLeft: `4px solid ${v.fg}`,
      borderRadius: 14,
      marginBottom: 12,
      overflow: 'hidden',
      transition: 'all .2s',
    }}>
      {/* Header siempre visible */}
      <div
        onClick={onToggle}
        style={{ padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
      >
        {/* Ticker + nombre */}
        <div style={{ minWidth: 180, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--fm)', letterSpacing: '-.3px' }}>{data.ticker}</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{data.sector}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.name}
          </div>
        </div>

        {/* Badge veredicto */}
        <div style={{
          padding: '6px 14px',
          borderRadius: 8,
          background: v.bg,
          border: `1px solid ${v.border}`,
          color: v.fg,
          fontWeight: 800,
          fontSize: 13,
          fontFamily: 'var(--fm)',
          letterSpacing: '.5px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>{v.icon}</span> {v.label}
        </div>

        {/* Score visual */}
        <div style={{ minWidth: 160, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            flex: 1,
            height: 8,
            background: 'rgba(255,255,255,.06)',
            borderRadius: 4,
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}>
            <div style={{
              width: `${passPct}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${v.fg}aa, ${v.fg})`,
              transition: 'width .4s',
            }} />
          </div>
          <span style={{ fontSize: 12, fontFamily: 'var(--fm)', color: 'var(--text-secondary)', fontWeight: 700, minWidth: 38, textAlign: 'right' }}>
            {data.pass_count}/{data.total}
          </span>
        </div>

        {/* Toggle arrow */}
        <div style={{ fontSize: 14, color: 'var(--text-tertiary)', transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }}>▼</div>
      </div>

      {/* Detalle expandido */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          {/* Grid: criterios izquierda, donut derecha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginTop: 16 }}>
            {/* Criterios */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--fm)' }}>
                CRITERIOS LOWELL MILLER
              </div>
              {data.criteria.map(c => {
                const icon = c.pass ? '✅' : (c.info_only ? 'ℹ️' : '❌');
                const tone = c.pass ? '#22c55e' : (c.info_only ? '#94a3b8' : '#ef4444');
                let valFmt;
                if (c.value == null) valFmt = '—';
                else if ([2, 3, 4, 5, 8].includes(c.id)) valFmt = `${c.value.toFixed(1)}%`;
                else if (c.id === 7) valFmt = `${c.value.toFixed(2)}x`;
                else valFmt = c.value.toFixed(2);
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', marginBottom: 4,
                    background: c.pass ? 'rgba(34,197,94,.04)' : (c.info_only ? 'rgba(148,163,184,.04)' : 'rgba(239,68,68,.04)'),
                    borderRadius: 8,
                    border: `1px solid ${tone}22`,
                  }}>
                    <span style={{ fontSize: 14 }}>{icon}</span>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{c.label}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--fm)', color: tone, fontWeight: 700, minWidth: 60, textAlign: 'right' }}>{valFmt}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', minWidth: 70, textAlign: 'right' }}>{c.target}</span>
                  </div>
                );
              })}
            </div>

            {/* FCF Donut */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--fm)' }}>
                ¿EN QUÉ SE VA EL CASH? (último año)
              </div>
              <FcfDonut alloc={data.fcf_alloc} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel didáctico explicando los 8 criterios ──────────────────────
function GuidePanel({ collapsed, onToggle }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(212,175,55,.06) 0%, rgba(212,175,55,.01) 100%)',
      border: '1px solid rgba(212,175,55,.18)',
      borderRadius: 14,
      marginBottom: 18,
      overflow: 'hidden',
    }}>
      <div
        onClick={onToggle}
        style={{ padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        <span style={{ fontSize: 22 }}>📖</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', letterSpacing: '-.2px' }}>
            Los 8 criterios del libro de Lowell Miller
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            "La Mejor Inversión: Crea riqueza con dividendos crecientes" — {collapsed ? 'haz click para ver los criterios completos' : 'haz click para ocultar'}
          </div>
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-tertiary)', transform: collapsed ? 'rotate(0)' : 'rotate(180deg)', transition: 'transform .2s' }}>▼</div>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 10,
            marginTop: 10,
          }}>
            {CRITERIA_GUIDE.map(c => (
              <div key={c.n} style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(212,175,55,.2)', color: 'var(--gold)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, fontFamily: 'var(--fm)',
                  }}>{c.n}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 6 }}>
                  {c.why}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic', borderLeft: '2px solid rgba(212,175,55,.3)', paddingLeft: 8 }}>
                  {c.quote}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 14, padding: 12,
            background: 'rgba(0,0,0,.2)', borderRadius: 8, border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--gold)' }}>📊 Cómo se calcula el veredicto:</strong> contamos cuántos criterios cumple la empresa de los que tienen datos disponibles.
            Insider ownership es informativo (peso 0 si no hay dato — el propio libro reconoce que sólo aplica en small caps {'<'}$300M).
            <br/><br/>
            🟢 <strong>APORTA</strong>: ≥75% de criterios evaluables cumplidos · 🟡 <strong>VIGILAR</strong>: 50-74% · 🔴 <strong>APARTA</strong>: {'<'}50%.
            <br/><br/>
            <strong style={{ color: 'var(--gold)' }}>💰 Donut FCF:</strong> muestra cómo la empresa reparte su flujo de caja operativo. Idealmente
            dividendos + buybacks combinados {'<'}80% (deja margen para reinversión orgánica) y la suma de divs +
            amortización de deuda es estable año tras año.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────
export default function AportaApartaTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [filter, setFilter] = useState('all'); // all | APORTA | VIGILAR | APARTA
  const [guideCollapsed, setGuideCollapsed] = useState(false);

  const load = (force = false) => {
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/dividendos/aporta-o-aparta${force ? '?force=1' : ''}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        setError(String(e));
        setLoading(false);
      });
  };

  useEffect(() => { load(false); }, []);

  const filtered = useMemo(() => {
    if (!data?.results) return [];
    if (filter === 'all') return data.results;
    return data.results.filter(r => r.verdict === filter);
  }, [data, filter]);

  const toggleCard = (ticker) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  if (loading) return <InlineLoading message="Analizando cartera contra los 8 criterios de Lowell Miller..." />;
  if (error)   return <EmptyState icon="⚠️" title="Error cargando análisis" subtitle={error} />;
  if (!data?.results?.length) return <EmptyState icon="📋" title="Sin empresas para analizar" subtitle="Necesitas posiciones US ≥100 sh en la cartera." />;

  const summary = data.summary || {};
  const total = summary.aporta + summary.vigilar + summary.aparta;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34,197,94,.06) 0%, rgba(212,175,55,.06) 50%, rgba(239,68,68,.06) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 20,
        marginBottom: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 28 }}>📊</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', letterSpacing: '-.3px' }}>
              Divis: Aporta o Aparta
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Filtro empírico basado en <em>"La Mejor Inversión"</em> de Lowell Miller — 8 criterios cuantitativos
            </div>
          </div>
          <button
            onClick={() => load(true)}
            style={{
              padding: '8px 16px',
              background: 'rgba(212,175,55,.15)',
              border: '1px solid rgba(212,175,55,.35)',
              borderRadius: 8,
              color: 'var(--gold)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'var(--fm)',
            }}
          >🔄 Refrescar (fuerza FMP)</button>
        </div>

        {/* Tiles agregados */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 16 }}>
          {[
            { key: 'all',     label: 'Total analizadas', value: total, icon: '📋', color: 'var(--text-primary)' },
            { key: 'APORTA',  label: 'Aporta',           value: summary.aporta,  icon: '🟢', color: '#22c55e' },
            { key: 'VIGILAR', label: 'Vigilar',          value: summary.vigilar, icon: '🟡', color: '#d4af37' },
            { key: 'APARTA',  label: 'Aparta',           value: summary.aparta,  icon: '🔴', color: '#ef4444' },
          ].map(t => (
            <div
              key={t.key}
              onClick={() => setFilter(t.key)}
              style={{
                padding: 12,
                background: filter === t.key ? 'rgba(212,175,55,.08)' : 'var(--card)',
                border: `1px solid ${filter === t.key ? 'var(--gold)' : 'var(--border)'}`,
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>
                {t.icon} {t.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: t.color, fontFamily: 'var(--fm)', marginTop: 2 }}>
                {t.value || 0}
              </div>
            </div>
          ))}
        </div>

        {data.cached && (
          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
            📦 Datos en caché ({data.cache_age_h}h). Pulsa Refrescar para forzar nueva consulta a FMP.
          </div>
        )}
      </div>

      {/* Panel didáctico */}
      <GuidePanel collapsed={guideCollapsed} onToggle={() => setGuideCollapsed(c => !c)} />

      {/* Lista de empresas */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Mostrando <strong style={{ color: 'var(--gold)' }}>{filtered.length}</strong> {filter === 'all' ? 'empresas' : `empresas en ${filter}`}
          </span>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              style={{
                fontSize: 10, padding: '4px 10px',
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-tertiary)', cursor: 'pointer',
              }}
            >limpiar filtro</button>
          )}
        </div>

        {filtered.map(empresa => (
          <EmpresaCard
            key={empresa.ticker}
            data={empresa}
            expanded={expanded.has(empresa.ticker)}
            onToggle={() => toggleCard(empresa.ticker)}
          />
        ))}

        {!filtered.length && (
          <EmptyState icon="🔍" title={`Sin empresas en ${filter}`} subtitle="Cambia el filtro para ver todas." />
        )}
      </div>

      {/* Footer con fuente */}
      <div style={{
        marginTop: 20, padding: 16, textAlign: 'center',
        fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.6,
      }}>
        Datos: <strong>FMP Ultimate</strong> (TTM ratios, 5y growth CAGR, cash-flow statement).
        Cache de 24h para reducir queries — pulsa <em>Refrescar</em> para forzar refresh.
        <br/>
        Metodología: Lowell Miller, <em>"La Mejor Inversión: Crea riqueza con dividendos crecientes"</em>.
      </div>
    </div>
  );
}
