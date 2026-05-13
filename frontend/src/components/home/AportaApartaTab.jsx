// AportaApartaTab — "Divis: Aporta o Aparta"
//
// Aplica los 11 criterios cuantitativos del libro de Lowell Miller
// "La Mejor Inversión: Crea riqueza con dividendos crecientes" a cada
// posición de la cartera US con ≥100 shares. Veredicto APORTA/VIGILAR/APARTA
// + donut chart del FCF allocation.
//
// Implementado 2026-05-13 — v2: 11 criterios agrupados por categorías del libro.
// Backend: /api/dividendos/aporta-o-aparta.
import { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';
import { InlineLoading, EmptyState } from '../ui/EmptyState.jsx';

// ── Paleta de veredictos ────────────────────────────────────────────
const VERDICT_STYLE = {
  APORTA:  { bg: 'rgba(34,197,94,.18)',  fg: '#22c55e', border: '#22c55e', icon: '🟢', label: 'APORTA',
             desc: '≥70% de criterios cumplidos. Candidata sólida según los estándares Miller.' },
  VIGILAR: { bg: 'rgba(212,175,55,.18)', fg: '#d4af37', border: '#d4af37', icon: '🟡', label: 'VIGILAR',
             desc: '45-70% de criterios. Tiene puntos fuertes pero también flancos débiles. Mira con lupa antes de aportar.' },
  APARTA:  { bg: 'rgba(239,68,68,.18)',  fg: '#ef4444', border: '#ef4444', icon: '🔴', label: 'APARTA',
             desc: 'Menos del 45% de criterios. No cumple el estándar mínimo Miller.' },
};

// ── Paleta del donut FCF ────────────────────────────────────────────
const FCF_COLORS = {
  dividends:    { fill: '#22c55e', label: 'Dividendos',         help: 'Reparto a accionistas (lo que cobramos nosotros)' },
  buybacks:     { fill: '#60a5fa', label: 'Recompra acciones',  help: 'Buybacks: reduce shares, aumenta EPS futuro' },
  debt_paydown: { fill: '#a78bfa', label: 'Amortizar deuda',    help: 'Pagar deuda — refuerza balance' },
  capex:        { fill: '#d4af37', label: 'Capex / Inversión',  help: 'Mantenimiento + crecimiento del negocio' },
  retained:     { fill: '#94a3b8', label: 'Retenido / Otros',   help: 'Cash que se queda en balance o usado en M&A' },
};

// ── Categorías del libro (4 grupos, 11 criterios) ────────────────────
const GROUPS = {
  calidad: {
    icon: '🏛',
    title: 'CALIDAD',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,.06)',
    border: 'rgba(167,139,250,.25)',
    intro: 'Cap. 4 — Los 4 pilares de una empresa que va a poder seguir pagando y aumentando el dividendo durante décadas, no sólo un año bueno.',
  },
  dividendo: {
    icon: '💰',
    title: 'DIVIDENDO',
    color: '#22c55e',
    bg: 'rgba(34,197,94,.06)',
    border: 'rgba(34,197,94,.25)',
    intro: 'Cap. 4 — Miller: "Alta rentabilidad por dividendo + crecimiento del dividendo + alta calidad". El dividendo tiene que valer la pena Y poder crecer.',
  },
  valoracion: {
    icon: '🔍',
    title: 'VALORACIÓN',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,.06)',
    border: 'rgba(96,165,250,.25)',
    intro: 'Cap. 5 — "Las medidas tradicionales que pueden ser útiles". O\'Shaughnessy demostró que las acciones baratas según estas métricas baten al mercado.',
  },
  crecimiento: {
    icon: '📈',
    title: 'CRECIMIENTO',
    color: '#fb923c',
    bg: 'rgba(251,146,60,.06)',
    border: 'rgba(251,146,60,.25)',
    intro: 'Cap. 5 — "Buscar empresas con liquidez total superior al del año anterior". Si el FCF crece, hay margen para más dividendos, recompras o reinversión.',
  },
};

// ── Explicaciones extensas de los 11 criterios (didáctico) ──────────
const CRITERIA_EXPLAIN = {
  // 🏛 CALIDAD
  1: {
    title: 'Deuda baja (Debt/Equity < 1.0)',
    plain: 'La empresa debe menos de lo que vale en libros — idealmente nada.',
    why:
      'Una empresa sin deuda no se ve obligada a vender activos ni cortar dividendos cuando llega una recesión. Al revés: puede comprar competidores ahogados por sus préstamos. Las empresas con deuda alta son frágiles — al primer susto, los bancos suben tipos o piden colateral, y el dividendo es lo primero que se recorta.',
    quote: 'cap. 4: "Cuanto menor sea la deuda, mejor, incluso si la deuda es 0. Es sustancialmente más cómodo ser propietario de un negocio sin deudas que de una empresa comprometida con los bancos."',
    threshold: 'D/E < 1.0 (idealmente < 0.5, mejor aún cerca de 0)',
  },
  2: {
    title: 'FCF cubre dividendos ≥ 1.5x',
    plain: 'El cash que genera la empresa después de invertir cubre el dividendo con un margen del 50%.',
    why:
      'Si el FCF apenas cubre el dividendo (1.0x), cualquier mes malo lo pone en riesgo. Con 1.5x hay colchón para inversión + subir el dividendo año tras año. Por debajo de 1.0x el dividendo está pagado con caja antigua, deuda o emitiendo acciones — insostenible.',
    quote: 'cap. 4: "El flujo de caja debe ser lo suficientemente amplio como para financiar tanto los dividendos como la inversión necesaria para mantener la actividad y desarrollo de la compañía."',
    threshold: 'FCF / Dividendos pagados ≥ 1.5x',
  },
  3: {
    title: 'Crecimiento beneficios 5y ≥ 5% anual',
    plain: 'Los beneficios suben de forma constante (al menos 5% al año durante los últimos 5 años).',
    why:
      'Los dividendos se pagan con beneficios. Si los beneficios están estancados o cayendo, los dividendos crecientes son una ilusión temporal — el payout sube hasta que ya no se puede subir más y empiezan los recortes. Miller pide 5-10% mínimo y CONSTANTE: no vale que el último año fuera 15% si los anteriores 5 fueron negativos.',
    quote: 'cap. 4: "El crecimiento anual de los beneficios debe ser constante, y debe estar en el rango del 5%-10%, como mínimo."',
    threshold: '5y CAGR de net income ≥ +5% (idealmente 5-10%)',
  },
  4: {
    title: 'Insider ownership ≥ 15%',
    plain: 'Los directivos tienen una parte importante de su propia empresa.',
    why:
      'Cuando los directivos tienen "skin in the game" sus decisiones se alinean con los accionistas. No hay incentivo de hacer un gran ROI a corto destruyendo la empresa a largo. Miller reconoce que en empresas muy grandes este criterio es difícil de cumplir, por eso lo marca como secundario (peso 0.5 y "informativo" si no hay dato).',
    quote: 'cap. 5: "Favorecerá a las empresas en las que las personas con información privilegiada posean al menos el 15% de las acciones, y cuanto más, mejor."',
    threshold: '≥ 15% — funciona mejor en small caps (<$300M)',
  },
  // 💰 DIVIDENDO
  5: {
    title: 'Rentabilidad por dividendo ≥ 2%',
    plain: 'La empresa paga al menos un 2% anual en dividendos al precio actual.',
    why:
      'Miller propone carteras al 3-5% de yield. Por debajo del 2% el dividendo es decorativo — no aporta como income real ni protege contra la inflación. Pero ojo con yields muy altos (>8%): suelen ser trampa o riesgo de recorte inminente. El punto dulce es 2-6%.',
    quote: 'cap. 4: "Alta rentabilidad por dividendo + crecimiento del dividendo + alta calidad = Mejor Inversión. El SP500 ronda 1,6%; raramente consideraríamos tener una cartera con un rendimiento tan bajo."',
    threshold: '≥ 2% (idealmente 3-5%)',
  },
  6: {
    title: 'Crecimiento dividendos 5y ≥ 4% anual',
    plain: 'El dividendo crece al menos un 4% al año (sólo así supera la inflación).',
    why:
      'Un dividendo que no crece es un dividendo que cae en términos reales. La inflación histórica USA es ~4%, así que cualquier crecimiento por debajo de eso te deja en negativo año tras año. Miller aspira al 10% para construir su "máquina de capitalización compuesta": yield 4% × growth 10% = retorno total ~14% sin que el múltiplo se expanda.',
    quote: 'cap. 4: "Necesitamos una tasa de crecimiento de los dividendos al menos superior a la inflación. Una tasa mínima debería ser de alrededor el 4%."',
    threshold: '5y CAGR de DPS ≥ 4% (idealmente 7-10%)',
  },
  7: {
    title: 'Payout ratio < 60% (REITs/Utilities < 95%)',
    plain: 'La empresa reparte menos del 60% de sus beneficios — el resto lo reinvierte.',
    why:
      'Un payout bajo significa que queda margen para subir el dividendo aunque los beneficios bajen un año, Y queda cash para reinvertir en crecer. Por encima del 60% la empresa se acerca al límite — cualquier bache obliga a recortar. Excepción: REITs y utilities, donde por estructura legal/operativa el payout es más alto (hasta 90-95%).',
    quote: 'cap. 4: "El ratio pay-out debe ser inferior al 60% en casi todos los valores, excepto en empresas de suministros y servicios públicos y acciones de inversión inmobiliaria. Cuanto más bajo sea el ratio, mejor."',
    threshold: '< 60% (REIT/Utility: < 95%)',
  },
  // 🔍 VALORACIÓN
  8: {
    title: 'Precio/Ventas < 1.5',
    plain: 'Por cada dólar de ventas pagas menos de 1,50$ por la acción.',
    why:
      'O\'Shaughnessy en "What Works on Wall Street" probó este factor sobre la base de datos S&P Compustat desde 1952. Las 50 acciones con menor P/S casi cuadruplicaron el rendimiento del universo total. Y las 50 con mayor P/S (típicas growth stocks) batieron incluso a los bonos del Tesoro a la baja. Es probablemente el ratio de valoración más predictivo del libro.',
    quote: 'cap. 5: "O\'Shaughnessy y otros han descubierto que este ratio es uno de los factores fundamentales más útiles, basado en un riguroso estudio cuantitativo. Una inversión en las cincuenta acciones con la relación precio/ventas más baja casi cuadruplicó el rendimiento de todo el universo estudiado."',
    threshold: 'P/S < 1.5 (cuanto más bajo, mejor)',
  },
  9: {
    title: 'PER < 20',
    plain: 'Pagas menos de 20$ por cada dólar de beneficios anuales (≈ 20 años de payback).',
    why:
      'El PER medio histórico del SP500 ronda 16-18x. Por encima de 20x estás pagando "premium" que solo se justifica si la empresa crece más rápido que la media. Miller recomienda comprar con PER inferior a la media del mercado Y al inverso del tipo de interés de los bonos (si los bonos rinden 5%, el "PER equivalente" del bono es 20 — la acción debería estar más barata para compensar el riesgo).',
    quote: 'cap. 5: "Relación precio/beneficio inferior a la media y al inverso del tipo de interés de los bonos."',
    threshold: 'PER < 20 (idealmente < 15)',
  },
  10: {
    title: 'Precio/Valor contable < 3',
    plain: 'Pagas menos de 3 veces lo que la empresa vale "en libros" (activos − pasivos).',
    why:
      'P/B bajo indica que la empresa cotiza cerca de su valor "tangible" — los activos físicos, inventario, cash, etc. Por debajo de 1.0x es ganga clásica (Graham), pero hoy raramente se ven en empresas de calidad. La media del SP500 ronda 3-4x, así que < 3 es un buen indicador de que no estás pagando "aire". Excepción: empresas asset-light (software, marcas puras) tienen P/B alto naturalmente.',
    quote: 'cap. 5: "Relación precio/valor contable inferior al del mercado, cuanto más bajo mejor."',
    threshold: 'P/B < 3 (proxy de "inferior al mercado")',
  },
  // 📈 CRECIMIENTO
  11: {
    title: 'FCF creciente YoY',
    plain: 'El flujo de caja libre este año fue mayor que el año pasado.',
    why:
      'El libro pide "liquidez total superior al del año anterior" — una empresa cuyo cash crece año tras año tiene capacidad creciente para subir dividendos, recomprar acciones o amortizar deuda. Si el FCF cae año tras año, el dividendo está en cuenta atrás. Usamos FCF growth (no cash absoluto en balance) porque éste último puede variar por buybacks/divs/M&A sin reflejar la salud operativa.',
    quote: 'cap. 5: "Buscar empresas con liquidez total superior al del año anterior."',
    threshold: 'FCF YoY > 0% (cualquier crecimiento positivo)',
  },
};

// ── Donut chart SVG inline ──────────────────────────────────────────
function FcfDonut({ alloc, size = 200 }) {
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
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="14" fill="var(--gold)"
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

// ── Formato valor con unidad ─────────────────────────────────────────
function formatCriterion(c) {
  const v = c.value;
  if (v == null) return '—';
  if ([5, 6, 7, 11, 4].includes(c.id)) return `${v.toFixed(1)}%`; // % criteria
  if (c.id === 2) return `${v.toFixed(2)}x`; // FCF coverage
  if (c.id === 3) return `${v.toFixed(1)}%`; // EPS growth
  return v.toFixed(2); // ratios
}

// ── Tarjeta resumen de una empresa ──────────────────────────────────
function EmpresaCard({ data, expanded, onToggle }) {
  const v = VERDICT_STYLE[data.verdict] || VERDICT_STYLE.APARTA;
  const passPct = (data.pass_count / data.total) * 100;

  // Agrupar criterios por categoría
  const byGroup = {};
  for (const c of data.criteria || []) {
    (byGroup[c.group] = byGroup[c.group] || []).push(c);
  }

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
      {/* Header */}
      <div
        onClick={onToggle}
        style={{ padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
      >
        <div style={{ minWidth: 180, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--fm)', letterSpacing: '-.3px' }}>{data.ticker}</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{data.sector}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.name}
          </div>
        </div>

        <div style={{
          padding: '6px 14px', borderRadius: 8,
          background: v.bg, border: `1px solid ${v.border}`,
          color: v.fg, fontWeight: 800, fontSize: 13, fontFamily: 'var(--fm)', letterSpacing: '.5px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>{v.icon}</span> {v.label}
        </div>

        <div style={{ minWidth: 160, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,.06)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ width: `${passPct}%`, height: '100%', background: `linear-gradient(90deg, ${v.fg}aa, ${v.fg})`, transition: 'width .4s' }} />
          </div>
          <span style={{ fontSize: 12, fontFamily: 'var(--fm)', color: 'var(--text-secondary)', fontWeight: 700, minWidth: 38, textAlign: 'right' }}>
            {data.pass_count}/{data.total}
          </span>
        </div>

        <div style={{ fontSize: 14, color: 'var(--text-tertiary)', transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }}>▼</div>
      </div>

      {/* Detalle expandido */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          {/* Criterios agrupados */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--fm)' }}>
              CRITERIOS LOWELL MILLER
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {['calidad','dividendo','valoracion','crecimiento'].map(g => {
                const items = byGroup[g] || [];
                if (!items.length) return null;
                const cfg = GROUPS[g];
                return (
                  <div key={g} style={{
                    background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: 12,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: 1, marginBottom: 8 }}>
                      {cfg.icon} {cfg.title}
                    </div>
                    {items.map(c => {
                      const icon = c.pass ? '✅' : (c.info_only ? 'ℹ️' : '❌');
                      const tone = c.pass ? '#22c55e' : (c.info_only ? '#94a3b8' : '#ef4444');
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 11.5 }}>
                          <span style={{ fontSize: 12 }}>{icon}</span>
                          <span style={{ flex: 1, color: 'var(--text-primary)' }}>{c.label}</span>
                          <span style={{ fontFamily: 'var(--fm)', color: tone, fontWeight: 700, minWidth: 55, textAlign: 'right' }}>
                            {formatCriterion(c)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* FCF Donut */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--fm)' }}>
              ¿EN QUÉ SE VA EL CASH? (último año)
            </div>
            <FcfDonut alloc={data.fcf_alloc} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel didáctico explicando los 11 criterios por categorías ──────
function GuidePanel({ collapsed, onToggle }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(212,175,55,.06) 0%, rgba(212,175,55,.01) 100%)',
      border: '1px solid rgba(212,175,55,.18)',
      borderRadius: 14,
      marginBottom: 18,
      overflow: 'hidden',
    }}>
      <div onClick={onToggle} style={{ padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 22 }}>📖</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', letterSpacing: '-.2px' }}>
            Los 11 criterios del libro de Lowell Miller, agrupados en 4 categorías
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            "La Mejor Inversión: Crea riqueza con dividendos crecientes" — {collapsed ? 'haz click para ver todos los criterios explicados' : 'haz click para ocultar'}
          </div>
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-tertiary)', transform: collapsed ? 'rotate(0)' : 'rotate(180deg)', transition: 'transform .2s' }}>▼</div>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 16px 16px' }}>
          {['calidad','dividendo','valoracion','crecimiento'].map(gKey => {
            const cfg = GROUPS[gKey];
            const ids = Object.keys(CRITERIA_EXPLAIN).filter(id => {
              const groupForId = {1:'calidad',2:'calidad',3:'calidad',4:'calidad',5:'dividendo',6:'dividendo',7:'dividendo',8:'valoracion',9:'valoracion',10:'valoracion',11:'crecimiento'};
              return groupForId[id] === gKey;
            });
            return (
              <div key={gKey} style={{
                background: cfg.bg, border: `1px solid ${cfg.border}`,
                borderRadius: 12, padding: 16, marginTop: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: cfg.color, letterSpacing: 1 }}>{cfg.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                    ({ids.length} criterio{ids.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5, fontStyle: 'italic' }}>
                  {cfg.intro}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                  {ids.map(id => {
                    const c = CRITERIA_EXPLAIN[id];
                    return (
                      <div key={id} style={{
                        background: 'var(--card)', border: '1px solid var(--border)',
                        borderRadius: 10, padding: 14,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                          <span style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: cfg.color + '22', color: cfg.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, fontFamily: 'var(--fm)', flexShrink: 0,
                          }}>{id}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{c.title}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.55, marginBottom: 8, fontWeight: 500 }}>
                          <span style={{ color: cfg.color, fontWeight: 700 }}>En cristiano:</span> {c.plain}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 8 }}>
                          <span style={{ color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', fontSize: 9, letterSpacing: 1 }}>Por qué importa: </span>
                          {c.why}
                        </div>
                        <div style={{
                          fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic',
                          borderLeft: `2px solid ${cfg.color}55`, paddingLeft: 8, marginBottom: 8, lineHeight: 1.5,
                        }}>
                          {c.quote}
                        </div>
                        <div style={{
                          fontSize: 10, color: cfg.color, fontFamily: 'var(--fm)', fontWeight: 700,
                          padding: '4px 8px', background: cfg.color + '11', borderRadius: 5, display: 'inline-block',
                        }}>
                          🎯 {c.threshold}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div style={{
            marginTop: 16, padding: 14,
            background: 'rgba(0,0,0,.2)', borderRadius: 10, border: '1px solid var(--border)',
            fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.65,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>📊 Cómo se calcula el veredicto</div>
            Contamos cuántos criterios cumple la empresa de los que tienen datos disponibles.
            Insider ownership es informativo (peso 0 si no hay dato — el propio libro reconoce que sólo aplica bien en small caps {'<'}$300M).
            <br/><br/>
            <strong style={{ color: '#22c55e' }}>🟢 APORTA</strong>: ≥70% de criterios cumplidos · <strong style={{ color: '#d4af37' }}>🟡 VIGILAR</strong>: 45-70% · <strong style={{ color: '#ef4444' }}>🔴 APARTA</strong>: {'<'}45%.
            <br/><br/>
            <strong style={{ color: 'var(--gold)' }}>💰 Donut FCF:</strong> muestra cómo la empresa reparte su flujo de caja operativo. Idealmente
            dividendos + buybacks combinados {'<'}80% (deja margen para reinversión orgánica) y la suma es estable año tras año.
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
  const [filter, setFilter] = useState('all');
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

  if (loading) return <InlineLoading message="Analizando cartera contra los 11 criterios de Lowell Miller..." />;
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
              Filtro empírico basado en <em>"La Mejor Inversión"</em> de Lowell Miller — 11 criterios agrupados en 4 categorías
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

      {/* Footer */}
      <div style={{
        marginTop: 20, padding: 16, textAlign: 'center',
        fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.6,
      }}>
        Datos: <strong>FMP Ultimate</strong> (TTM ratios, 5y growth CAGR, cash-flow statement).
        Cache 24h por ticker — pulsa <em>Refrescar</em> para forzar refresh.
        <br/>
        Metodología: Lowell Miller, <em>"La Mejor Inversión: Crea riqueza con dividendos crecientes"</em> — 11 criterios cap. 4 + cap. 5.
      </div>
    </div>
  );
}
