// InstitutionalReportPDF — Print-optimized fullscreen report view.
//
// Opens as a fullscreen overlay (rendered via portal to document.body so
// it escapes the zoom:1.3 wrapper that breaks the normal modal). Renders
// the Deep Dividend analysis in A4-optimized layout and auto-triggers
// window.print() so the user can "Save as PDF" via the browser dialog.
//
// Design principles:
//   - Retail-investor friendly: glossary, plain-language summary, visual
//     score bars, red/green flag semáforos
//   - Institutional rigor: full markdown body preserved as rendered
//     content, not summarized
//   - Zero dependencies: pure React + CSS, no jsPDF/html2canvas
//   - Browser print dialog does the heavy lifting (native quality,
//     supports Chrome / Safari / Firefox "Save as PDF")
//
// Print CSS rules applied:
//   - @page A4 portrait, 1.5cm margins
//   - Page breaks before h1 (cover, sections)
//   - Avoid breaks inside tables and flag cards
//   - Hide interactive controls (close button, print button)

import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

const SCORE_COLOR = (s) => {
  if (s == null) return '#888';
  if (s >= 9) return '#22c55e';
  if (s >= 7) return '#84cc16';
  if (s >= 5) return '#d4af37';
  if (s >= 3) return '#fb923c';
  return '#ef4444';
};

const VERDICT_COLOR = (v) => {
  const V = (v || '').toUpperCase();
  if (V.includes('STRONG BUY') || V.includes('BUY')) return '#22c55e';
  if (V.includes('ACCUMULATE')) return '#84cc16';
  if (V === 'HOLD') return '#d4af37';
  if (V.includes('TRIM')) return '#fb923c';
  if (V.includes('SELL')) return '#ef4444';
  return '#6e6e73';
};

// Glossary of technical terms, in retail-friendly Spanish
const GLOSSARY = [
  ['DGR (Dividend Growth Rate)', 'El ritmo al que la empresa sube su dividendo cada año. Un DGR del 5% significa que el dividendo crece ~5% anual.'],
  ['FCF (Free Cash Flow)', 'El dinero real que genera el negocio después de pagar gastos + inversiones. Es la fuente del dividendo.'],
  ['FCF coverage', 'Cuántas veces el FCF cubre el dividendo. 1.5x = la empresa genera 1.5 veces lo que paga en dividendos.'],
  ['Payout ratio', 'Porcentaje de beneficios (o FCF) que se paga como dividendo. 60% = la empresa paga 60 de cada 100 de beneficios.'],
  ['Dividend King / Aristocrat', 'King = 50+ años seguidos subiendo el dividendo. Aristocrat = 25+ años. Son sellos de calidad dividend-friendly.'],
  ['Moat (ventaja competitiva)', 'El "foso" que protege a una empresa de competidores (marca, escala, costes, red de distribución). Cuanto más ancho, más duradera es la ventaja.'],
  ['ROIC (Return on Invested Capital)', 'Beneficio generado por cada euro invertido en el negocio. >15% = excelente, 10-15% = bueno, <8% = mediocre.'],
  ['Net Debt / EBITDA', 'Cuántos años tardaría la empresa en pagar su deuda con los beneficios operativos. <2x = conservador, >4x = apalancado.'],
  ['P/E (Price/Earnings)', 'Precio de la acción dividido por beneficio por acción. Mide cuántos años de beneficios pagas por la acción.'],
  ['DCF (Discounted Cash Flow)', 'Modelo que estima el valor "real" de una empresa descontando los cash flows futuros al presente.'],
  ['Variant perception', 'La tesis donde tu visión se diferencia del consenso del mercado. Es donde está el edge real.'],
  ['YOC (Yield on Cost)', 'Rentabilidad del dividendo sobre el precio que PAGASTE, no el actual. Mejora con el tiempo si el dividendo sube.'],
];

// ─── Print-optimized styles ──────────────────────────────────
const pageStyles = `
@media print {
  @page { size: A4 portrait; margin: 1.5cm 1.2cm; }

  /* CRITICAL: neutralize any CSS zoom / transforms from the app-level
     wrapper (the "-"/"+" zoom buttons set zoom:1.3 on a div inside #root).
     Without this, everything prints scaled up and overflows the page. */
  * { zoom: 1 !important; transform: none !important; }

  /* CRITICAL: hide the main app DOM entirely so only the PDF overlay prints.
     Without this, the browser prints the app UI underneath AND the overlay
     on top, producing duplicated / overlapping pages ("se repite todo"). */
  body > *:not(.pdf-overlay) { display: none !important; }

  html, body {
    background: #fff !important;
    color: #0b0b0b !important;
    margin: 0 !important;
    padding: 0 !important;
    width: auto !important;
    height: auto !important;
    overflow: visible !important;
  }

  /* Overlay becomes a normal-flow block so the browser can paginate properly */
  .pdf-overlay {
    position: static !important;
    background: #fff !important;
    padding: 0 !important;
    margin: 0 !important;
    width: auto !important;
    height: auto !important;
    overflow: visible !important;
    z-index: auto !important;
    backdrop-filter: none !important;
  }

  .pdf-content {
    box-shadow: none !important;
    max-width: none !important;
    width: auto !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
    color: #0b0b0b !important;
  }

  /* Hide controls */
  .pdf-noprint, .pdf-controls { display: none !important; }

  /* Page break rules — be conservative. Don't use page-break-inside:avoid
     on large containers (.pdf-section) because if the section is taller
     than a page the browser gives up and produces weird breaks. */
  .pdf-cover { page-break-after: always; }
  .pdf-section { page-break-inside: auto; }
  h1, h2, h3 { page-break-after: avoid; }
  h1, h2 { page-break-before: auto; }
  table { page-break-inside: avoid; }
  .pdf-flag, .pdf-glossary-item { page-break-inside: avoid; }
  .pdf-simple-summary { page-break-inside: avoid; }

  /* Slightly tighter print typography so more fits per page */
  .pdf-content h1 { font-size: 18pt !important; }
  .pdf-content h2 { font-size: 13pt !important; margin-top: 14pt !important; }
  .pdf-content h3 { font-size: 11pt !important; }
  .pdf-content p { font-size: 10pt !important; line-height: 1.4 !important; }
  .pdf-content li { font-size: 10pt !important; }

  a { color: #0b0b0b !important; text-decoration: none !important; }
}
.pdf-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.9); z-index: 10000;
  overflow: auto;
  padding: 30px 20px;
}
.pdf-content {
  background: #fff; color: #0b0b0b;
  max-width: 800px; margin: 0 auto;
  padding: 60px 50px;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 12pt; line-height: 1.55;
  box-shadow: 0 20px 80px rgba(0,0,0,0.5);
}
.pdf-content h1 { font-size: 22pt; margin: 0 0 8pt; color: #0b0b0b; font-family: 'Helvetica', 'Arial', sans-serif; }
.pdf-content h2 { font-size: 16pt; margin: 24pt 0 10pt; color: #0b0b0b; font-family: 'Helvetica', 'Arial', sans-serif; border-bottom: 1.5pt solid #c8a44e; padding-bottom: 4pt; }
.pdf-content h3 { font-size: 13pt; margin: 14pt 0 6pt; color: #444; font-family: 'Helvetica', 'Arial', sans-serif; }
.pdf-content p { margin: 0 0 10pt; text-align: justify; }
.pdf-content table { border-collapse: collapse; width: 100%; margin: 12pt 0; font-size: 10pt; }
.pdf-content th, .pdf-content td { padding: 4pt 8pt; border: 0.5pt solid #ccc; text-align: left; }
.pdf-content th { background: #f5f5f7; font-weight: 700; }
.pdf-content ul, .pdf-content ol { margin: 8pt 0 10pt; padding-left: 20pt; }
.pdf-content li { margin: 3pt 0; }
.pdf-content blockquote { margin: 10pt 0; padding: 8pt 14pt; border-left: 3pt solid #c8a44e; background: #fafaf7; font-style: italic; }
.pdf-content hr { border: none; border-top: 0.5pt solid #ddd; margin: 16pt 0; }
.pdf-content a { color: #0b0b0b; text-decoration: underline; }
.pdf-content strong { font-weight: 700; }
.pdf-content code { background: #f0f0f0; padding: 1pt 4pt; border-radius: 2pt; font-family: 'Courier', monospace; font-size: 10pt; }
.pdf-cover { text-align: center; padding: 40pt 0 60pt; }
.pdf-cover-logo { font-size: 32pt; font-weight: 800; color: #c8a44e; letter-spacing: 4pt; font-family: 'Georgia', serif; }
.pdf-cover-subtitle { font-size: 9pt; color: #888; letter-spacing: 2pt; text-transform: uppercase; margin-top: 4pt; }
.pdf-cover-ticker { font-size: 60pt; font-weight: 800; margin: 40pt 0 8pt; color: #0b0b0b; letter-spacing: 2pt; font-family: 'Helvetica', sans-serif; }
.pdf-cover-name { font-size: 13pt; color: #555; margin-bottom: 30pt; }
.pdf-verdict-big { display: inline-block; padding: 10pt 28pt; font-size: 18pt; font-weight: 700; border: 2pt solid; border-radius: 6pt; letter-spacing: 2pt; }
.pdf-scores { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; margin: 30pt auto 0; max-width: 500px; }
.pdf-score-row { text-align: left; }
.pdf-score-label { font-size: 9pt; color: #888; text-transform: uppercase; letter-spacing: 1pt; margin-bottom: 2pt; }
.pdf-score-bar-bg { height: 10pt; background: #eee; border-radius: 5pt; overflow: hidden; }
.pdf-score-bar-fill { height: 100%; border-radius: 5pt; }
.pdf-score-value { font-size: 11pt; font-weight: 700; margin-top: 3pt; }
.pdf-cover-date { margin-top: 40pt; font-size: 10pt; color: #888; }
.pdf-disclaimer { margin-top: 30pt; padding: 14pt; background: #fafaf7; border: 0.5pt solid #e5e5e5; font-size: 9pt; color: #666; border-radius: 4pt; line-height: 1.5; }
.pdf-flag { padding: 10pt 14pt; margin: 6pt 0; border-left: 3pt solid; background: #fafaf7; border-radius: 0 4pt 4pt 0; font-size: 10pt; page-break-inside: avoid; }
.pdf-flag-high { border-color: #ef4444; background: #fef2f2; }
.pdf-flag-medium { border-color: #d4af37; background: #fefdf6; }
.pdf-flag-low { border-color: #60a5fa; background: #f0f7ff; }
.pdf-flag-green { border-color: #22c55e; background: #f0fdf4; }
.pdf-flag-severity { font-weight: 700; text-transform: uppercase; font-size: 9pt; }
.pdf-flag-quote { margin-top: 4pt; font-style: italic; color: #666; font-size: 9pt; }
.pdf-metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt 16pt; margin: 10pt 0; font-size: 10pt; }
.pdf-metric-key { color: #666; text-transform: capitalize; }
.pdf-metric-value { font-weight: 700; color: #0b0b0b; }
.pdf-glossary-item { margin: 8pt 0; font-size: 10pt; page-break-inside: avoid; }
.pdf-glossary-term { font-weight: 700; color: #c8a44e; }
.pdf-simple-summary {
  background: #fffbeb;
  border: 1pt solid #f4d77e;
  padding: 14pt 18pt;
  border-radius: 4pt;
  margin: 14pt 0;
}
.pdf-simple-summary h3 { margin-top: 0; color: #946b1a; }
.pdf-controls {
  position: fixed; top: 20px; right: 20px;
  display: flex; gap: 10px; z-index: 10001;
}
.pdf-controls button {
  padding: 10px 18px; border-radius: 6px; border: none;
  font-size: 13px; font-weight: 700; cursor: pointer;
  font-family: -apple-system, sans-serif;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.pdf-btn-print { background: #c8a44e; color: #000; }
.pdf-btn-close { background: #333; color: #fff; }
`;

// ─── Simple inline markdown renderer ────────────────────────
// Handles: h1-h3, p, strong/em, ul/ol, tables, blockquote, hr, code
function renderMarkdownToPDF(md) {
  if (!md) return null;
  const lines = md.split('\n');
  const out = [];
  let buffer = [];
  let i = 0;

  const flushPara = () => {
    if (buffer.length) {
      const text = buffer.join(' ').trim();
      if (text) out.push(<p key={'p' + out.length}>{renderInline(text)}</p>);
      buffer = [];
    }
  };

  const renderInline = (s) => {
    // Bold **x**, italic *x*, code `x`, links [text](url)
    const parts = [];
    let rem = s;
    let key = 0;
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/;
    while (rem) {
      const m = rem.match(re);
      if (!m) { parts.push(rem); break; }
      if (m.index > 0) parts.push(rem.slice(0, m.index));
      const t = m[0];
      if (t.startsWith('**')) parts.push(<strong key={key++}>{t.slice(2, -2)}</strong>);
      else if (t.startsWith('*')) parts.push(<em key={key++}>{t.slice(1, -1)}</em>);
      else if (t.startsWith('`')) parts.push(<code key={key++}>{t.slice(1, -1)}</code>);
      else if (t.startsWith('[')) {
        const lm = t.match(/\[([^\]]+)\]\(([^)]+)\)/);
        parts.push(<a key={key++} href={lm[2]}>{lm[1]}</a>);
      }
      rem = rem.slice(m.index + t.length);
    }
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Headers
    if (/^#{1,6} /.test(trimmed)) {
      flushPara();
      const level = trimmed.match(/^(#+)/)[1].length;
      const text = trimmed.replace(/^#+\s*/, '');
      const Tag = `h${Math.min(level + 1, 6)}`; // Shift down 1 so MD h1 → PDF h2
      out.push(React.createElement(Tag, { key: 'h' + out.length, className: 'pdf-section' }, renderInline(text)));
      i++;
      continue;
    }

    // HR
    if (/^---+$/.test(trimmed)) {
      flushPara();
      out.push(<hr key={'hr' + out.length} />);
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushPara();
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(<blockquote key={'q' + out.length}>{quote.join(' ')}</blockquote>);
      continue;
    }

    // Table
    if (/^\|.*\|$/.test(trimmed)) {
      flushPara();
      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        rows.push(lines[i].trim().split('|').slice(1, -1).map(c => c.trim()));
        i++;
      }
      if (rows.length >= 2 && /^[\s:|-]+$/.test(rows[1].join(''))) {
        // Header row + separator + body
        out.push(
          <table key={'t' + out.length} className="pdf-section">
            <thead>
              <tr>{rows[0].map((c, j) => <th key={j}>{renderInline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(2).map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        );
      }
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(trimmed)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push(<ul key={'ul' + out.length}>{items.map((it, ii) => <li key={ii}>{renderInline(it)}</li>)}</ul>);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(trimmed)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push(<ol key={'ol' + out.length}>{items.map((it, ii) => <li key={ii}>{renderInline(it)}</li>)}</ol>);
      continue;
    }

    // Empty line → paragraph break
    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }

    // Regular paragraph line
    buffer.push(trimmed);
    i++;
  }
  flushPara();
  return out;
}

// ─── Score bar component (print-safe) ────────────────────────
function ScoreBar({ label, score, color }) {
  return (
    <div className="pdf-score-row">
      <div className="pdf-score-label">{label}</div>
      <div className="pdf-score-bar-bg">
        <div className="pdf-score-bar-fill" style={{ width: `${(score || 0) * 10}%`, background: color || SCORE_COLOR(score) }} />
      </div>
      <div className="pdf-score-value" style={{ color: SCORE_COLOR(score) }}>{score || '—'}/10</div>
    </div>
  );
}

// ─── Flag card ──────────────────────────────────────────────
function FlagCard({ flag, kind }) {
  const sev = kind === 'red' ? (flag.severity || 'MEDIUM').toLowerCase() : 'green';
  return (
    <div className={`pdf-flag pdf-flag-${sev}`}>
      {kind === 'red' && <span className="pdf-flag-severity">{flag.severity || 'MEDIUM'} · </span>}
      <span>{flag.description}</span>
      {flag.quote && <div className="pdf-flag-quote">"{flag.quote}"</div>}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────
export default function InstitutionalReportPDF({ ticker, data, onClose }) {
  useEffect(() => {
    // Inject print styles once
    const styleEl = document.createElement('style');
    styleEl.id = 'pdf-print-styles';
    styleEl.textContent = pageStyles;
    document.head.appendChild(styleEl);
    return () => {
      const existing = document.getElementById('pdf-print-styles');
      if (existing) existing.remove();
    };
  }, []);

  const r = data?.result_json || {};
  const safety = r['2_dividend_safety'] || {};
  const growth = r['2b_dividend_growth'] || {};
  const flags = r['3_red_and_green_flags'] || {};
  const thesis = r['4_thesis_impact'] || {};
  const verdict = r['7_verdict'] || {};
  const tax = r.tax_adjusted_for_user || {};

  const execSummary = typeof r['1_executive_summary'] === 'string'
    ? r['1_executive_summary']
    : (r['1_executive_summary']?.summary || '');

  const scores = {
    safety: data?.safety_score,
    growth: data?.growth_score,
    honesty: data?.honesty_score,
    moat: data?.moat_score,
    capital_alloc: data?.capital_alloc_score,
    composite: data?.composite_score,
  };

  const simpleSummary = useMemo(() => {
    // Extract 2 key sentences from the exec summary for retail investors
    const sentences = execSummary.split(/[.!]\s+/).filter(s => s.length > 20);
    return sentences.slice(0, 2).join('. ') + '.';
  }, [execSummary]);

  const handlePrint = () => {
    setTimeout(() => window.print(), 100);
  };

  return createPortal((
    <div className="pdf-overlay" onClick={onClose}>
      {/* Top controls — hidden in print */}
      <div className="pdf-controls pdf-noprint">
        <button className="pdf-btn-print" onClick={(e) => { e.stopPropagation(); handlePrint(); }}>
          🖨 Guardar como PDF
        </button>
        <button className="pdf-btn-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>
          ✕ Cerrar
        </button>
      </div>

      <div className="pdf-content" onClick={(e) => e.stopPropagation()}>
        {/* ─── COVER PAGE ─── */}
        <div className="pdf-cover">
          <div className="pdf-cover-logo">A&R</div>
          <div className="pdf-cover-subtitle">Institutional Dividend Research</div>
          <div className="pdf-cover-ticker">{ticker}</div>
          <div className="pdf-cover-name">
            {data?.quarter ? `Q ${data.quarter}` : ''}
            {data?.sector_bucket ? ` · ${data.sector_bucket}` : ''}
          </div>

          <div className="pdf-verdict-big" style={{ color: VERDICT_COLOR(data?.verdict), borderColor: VERDICT_COLOR(data?.verdict) }}>
            {data?.verdict || '—'}
          </div>

          <div className="pdf-scores">
            <ScoreBar label="Dividend Safety" score={scores.safety} />
            <ScoreBar label="Dividend Growth" score={scores.growth} />
            <ScoreBar label="Mgmt Honesty" score={scores.honesty} />
            <ScoreBar label="Moat" score={scores.moat} />
            <ScoreBar label="Capital Alloc." score={scores.capital_alloc} />
            <ScoreBar label="Composite" score={scores.composite} color="#c8a44e" />
          </div>

          <div className="pdf-cover-date">
            {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
            <br />Confidence: <strong>{data?.confidence || 'medium'}</strong>
          </div>

          <div className="pdf-disclaimer">
            <strong>Disclaimer:</strong> Este informe es investigación privada y no constituye asesoramiento
            financiero ni recomendación de inversión. Los datos provienen de filings de la SEC (EDGAR),
            Financial Modeling Prep, y transcripciones públicas de earnings calls. Las opiniones son del
            autor y pueden estar equivocadas. Verifica siempre las fuentes primarias antes de tomar
            decisiones de inversión.
          </div>
        </div>

        {/* ─── SIMPLE SUMMARY ─── */}
        <div className="pdf-section">
          <h2>Resumen en Lenguaje Simple</h2>
          <div className="pdf-simple-summary">
            <h3>¿Qué dice este informe, en 3 líneas?</h3>
            <p><strong>Veredicto:</strong> <span style={{ color: VERDICT_COLOR(data?.verdict), fontWeight: 700 }}>{data?.verdict || '—'}</span> — {verdict.reasoning || simpleSummary || 'Ver informe completo para detalles.'}</p>
            {verdict.price_trigger_buy_more && (
              <p><strong>Comprar más si cae por debajo de:</strong> ${verdict.price_trigger_buy_more}</p>
            )}
            {verdict.price_trigger_trim && (
              <p><strong>Reducir posición si sube por encima de:</strong> ${verdict.price_trigger_trim}</p>
            )}
          </div>
        </div>

        {/* ─── GLOSSARY ─── */}
        <div className="pdf-section">
          <h2>Glosario Rápido</h2>
          <p style={{ fontSize: '10pt', color: '#666' }}>Términos financieros que aparecen en este informe, explicados en 1 línea.</p>
          {GLOSSARY.map(([term, def], i) => (
            <div key={i} className="pdf-glossary-item">
              <span className="pdf-glossary-term">{term}:</span> {def}
            </div>
          ))}
        </div>

        {/* ─── EXECUTIVE SUMMARY ─── */}
        <div className="pdf-section">
          <h2>Executive Summary (detallado)</h2>
          <p>{execSummary}</p>
        </div>

        {/* ─── DIVIDEND SAFETY ─── */}
        {safety.rationale && (
          <div className="pdf-section">
            <h2>Dividend Safety — {safety.score}/10</h2>
            <p>{safety.rationale}</p>
            {safety.key_metrics && (
              <div className="pdf-metric-grid">
                {Object.entries(safety.key_metrics).map(([k, v]) => (
                  <div key={k}>
                    <span className="pdf-metric-key">{k.replace(/_/g, ' ')}:</span>{' '}
                    <span className="pdf-metric-value">{typeof v === 'number' ? v.toFixed(2) : v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── DIVIDEND GROWTH ─── */}
        {growth.rationale && (
          <div className="pdf-section">
            <h2>Dividend Growth — {growth.score}/10</h2>
            <p>{growth.rationale}</p>
            {growth.expected_5y_cagr && (
              <p><strong>DGR esperado 5y:</strong> <span style={{ color: '#22c55e' }}>{growth.expected_5y_cagr}</span></p>
            )}
          </div>
        )}

        {/* ─── RED FLAGS ─── */}
        {flags.red && flags.red.length > 0 && (
          <div className="pdf-section">
            <h2 style={{ color: '#ef4444', borderColor: '#ef4444' }}>Red Flags ({flags.red.length})</h2>
            <p style={{ fontSize: '10pt', color: '#666' }}>Riesgos y señales de alerta. El color indica severidad: rojo = alto impacto, amarillo = medio, azul = bajo.</p>
            {flags.red.map((f, i) => <FlagCard key={i} flag={f} kind="red" />)}
          </div>
        )}

        {/* ─── GREEN FLAGS ─── */}
        {flags.green && flags.green.length > 0 && (
          <div className="pdf-section">
            <h2 style={{ color: '#22c55e', borderColor: '#22c55e' }}>Green Flags ({flags.green.length})</h2>
            <p style={{ fontSize: '10pt', color: '#666' }}>Fortalezas y señales positivas.</p>
            {flags.green.map((f, i) => <FlagCard key={i} flag={f} kind="green" />)}
          </div>
        )}

        {/* ─── THESIS IMPACT ─── */}
        {(thesis.horizon_5y || thesis.horizon_10y) && (
          <div className="pdf-section">
            <h2>Thesis & Escenarios</h2>
            {thesis.horizon_5y && (
              <>
                <h3>Horizonte 5 años</h3>
                <p>{thesis.horizon_5y}</p>
              </>
            )}
            {thesis.horizon_10y && (
              <>
                <h3>Horizonte 10 años</h3>
                <p>{thesis.horizon_10y}</p>
              </>
            )}
            <div className="pdf-metric-grid">
              {thesis.dividend_cut_probability_3y != null && (
                <div>
                  <span className="pdf-metric-key">Prob. recorte dividendo 3y:</span>{' '}
                  <span className="pdf-metric-value">{(thesis.dividend_cut_probability_3y * 100).toFixed(0)}%</span>
                </div>
              )}
              {thesis.dividend_freeze_probability_3y != null && (
                <div>
                  <span className="pdf-metric-key">Prob. congelación 3y:</span>{' '}
                  <span className="pdf-metric-value">{(thesis.dividend_freeze_probability_3y * 100).toFixed(0)}%</span>
                </div>
              )}
              {thesis.dividend_raise_probability_12m != null && (
                <div>
                  <span className="pdf-metric-key">Prob. subida 12m:</span>{' '}
                  <span className="pdf-metric-value" style={{ color: '#22c55e' }}>{(thesis.dividend_raise_probability_12m * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAX (China resident) ─── */}
        {tax.current_yield_gross != null && (
          <div className="pdf-section">
            <h2>Yield Ajustado Fiscalmente (Residente China)</h2>
            <p>
              <strong>Yield bruto:</strong> {(tax.current_yield_gross * 100).toFixed(2)}%<br />
              <strong>Neto China (WHT 10%):</strong> {((tax.current_yield_net_china_wht || tax.current_yield_gross * 0.9) * 100).toFixed(2)}%
            </p>
            {tax.tax_efficiency_note && <p style={{ fontSize: '10pt', color: '#666' }}>{tax.tax_efficiency_note}</p>}
          </div>
        )}

        {/* ─── VERDICT ─── */}
        {verdict.reasoning && (
          <div className="pdf-section">
            <h2>Verdict Reasoning</h2>
            <p>{verdict.reasoning}</p>
          </div>
        )}

        {/* ─── FULL INSTITUTIONAL REPORT ─── */}
        {data?.result_md && (
          <div className="pdf-section" style={{ pageBreakBefore: 'always' }}>
            <h1 style={{ marginTop: 0, borderBottom: '2pt solid #c8a44e', paddingBottom: '8pt' }}>Informe Institucional Completo</h1>
            <p style={{ fontSize: '10pt', color: '#666', fontStyle: 'italic' }}>
              Research detallado con fuentes primarias (SEC 10-K/10-Q narrative, FMP 10y fundamentals).
              Las secciones siguientes contienen el análisis completo con rigor institucional.
            </p>
            {renderMarkdownToPDF(data.result_md)}
          </div>
        )}

        {/* ─── FINAL DISCLAIMER ─── */}
        <div className="pdf-section pdf-disclaimer" style={{ marginTop: '40pt' }}>
          <strong>Fuentes utilizadas:</strong>
          <ul style={{ marginTop: '6pt' }}>
            <li>SEC EDGAR — 10-K (annual), 10-Q (quarterly) — narrativa MD&A + Risk Factors + Business Description</li>
            <li>Financial Modeling Prep — 10 años de datos financieros (income, cash flow, balance, key metrics, DCF, analyst targets)</li>
            <li>Transcripciones públicas de earnings calls (últimos 7 años vía FMP)</li>
            <li>Conocimiento histórico del analista (training corpus hasta 2025) como contexto suplementario</li>
          </ul>
          <br />
          <strong>Limitaciones conocidas:</strong>
          <ul style={{ marginTop: '6pt' }}>
            <li>No hay channel checks ni entrevistas con management (research desk-only)</li>
            <li>No hay acceso a proxy statements para detalles de compensación/insider holdings</li>
            <li>Análisis legal basado en la descripción del management en el 10-K, no en lectura primaria de los briefs</li>
          </ul>
          <br />
          <em>Informe generado por A&R Research v4.0 · {new Date().toISOString().slice(0, 10)}</em>
        </div>
      </div>
    </div>
  ), document.body);
}
