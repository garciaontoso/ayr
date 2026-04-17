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
  /* A4 portrait — top/bottom left for the running footer content */
  @page {
    size: A4 portrait;
    margin: 2cm 1.5cm 2.2cm;
  }

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
    font-size: 10pt !important;
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

  /* Running footer on every page via a fixed-position block that browsers
     repeat. We simulate it with a bottom border on each page section. */
  .pdf-page-footer {
    display: block !important;
    position: fixed !important;
    bottom: 0.5cm !important;
    left: 0 !important;
    right: 0 !important;
    text-align: center !important;
    font-size: 7.5pt !important;
    color: #999 !important;
    border-top: 0.3pt solid #e0e0e0 !important;
    padding-top: 3pt !important;
    font-family: 'Helvetica Neue', Arial, sans-serif !important;
  }

  /* Hide controls */
  .pdf-noprint, .pdf-controls { display: none !important; }

  /* ── Page break rules ──
     Cover gets its own page. Major PART sections always start fresh.
     Keep headings attached to their following content. Never break inside
     tables, flag cards, or metric grids. */
  .pdf-cover { page-break-after: always !important; }

  /* PART sections (h2 with pdf-part class) each start a new page */
  .pdf-part-break { page-break-before: always !important; }

  /* The full institutional report section always starts a new page */
  .pdf-institutional-start { page-break-before: always !important; }

  /* Generic section wrapper — never force breaks, browser decides */
  .pdf-section { page-break-inside: auto; }

  /* Headings: keep attached to following paragraph */
  h1, h2, h3, h4 {
    page-break-after: avoid !important;
    orphans: 3;
    widows: 3;
  }

  /* Tables never break mid-row (page-break-inside on tr is what matters) */
  table { page-break-inside: auto; border-collapse: collapse !important; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; page-break-after: auto; }

  /* Small contained elements — keep whole */
  .pdf-flag, .pdf-glossary-item, .pdf-simple-summary,
  .pdf-score-row, .pdf-metric-grid { page-break-inside: avoid !important; }

  /* Print typography — tighter to maximise content per page */
  .pdf-content h1 { font-size: 17pt !important; margin-bottom: 6pt !important; }
  .pdf-content h2 { font-size: 12.5pt !important; margin-top: 12pt !important; margin-bottom: 5pt !important; }
  .pdf-content h3 { font-size: 10.5pt !important; margin-top: 8pt !important; }
  .pdf-content h4 { font-size: 10pt !important; margin-top: 6pt !important; }
  .pdf-content p, .pdf-content li { font-size: 9.5pt !important; line-height: 1.45 !important; }
  .pdf-content th, .pdf-content td { font-size: 8.5pt !important; padding: 3pt 6pt !important; }

  /* Colours must print — force -webkit-print-color-adjust for Chrome */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }

  a { color: #0b0b0b !important; text-decoration: none !important; }

  /* Score bars must render their background colours */
  .pdf-score-bar-fill { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}

/* ── Screen styles ── */
.pdf-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.92); z-index: 10000;
  overflow: auto;
  padding: 40px 20px 60px;
}
.pdf-content {
  background: #fff; color: #0b0b0b;
  max-width: 820px; margin: 0 auto;
  padding: 64px 56px;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 11pt; line-height: 1.6;
  box-shadow: 0 24px 80px rgba(0,0,0,0.55);
  border-radius: 2px;
}

/* ── Typography ── */
.pdf-content h1 {
  font-size: 21pt; margin: 0 0 8pt;
  color: #0b0b0b;
  font-family: 'Helvetica Neue', 'Arial', sans-serif;
  font-weight: 700;
  letter-spacing: -0.3pt;
}
.pdf-content h2 {
  font-size: 15pt; margin: 26pt 0 9pt;
  color: #0b0b0b;
  font-family: 'Helvetica Neue', 'Arial', sans-serif;
  font-weight: 700;
  border-bottom: 1.5pt solid #c8a44e;
  padding-bottom: 5pt;
}
.pdf-content h3 {
  font-size: 12pt; margin: 16pt 0 6pt;
  color: #333;
  font-family: 'Helvetica Neue', 'Arial', sans-serif;
  font-weight: 600;
}
.pdf-content h4 {
  font-size: 11pt; margin: 12pt 0 4pt;
  color: #444;
  font-family: 'Helvetica Neue', 'Arial', sans-serif;
  font-weight: 600;
}
.pdf-content p { margin: 0 0 10pt; text-align: justify; hyphens: auto; }

/* ── Tables ── */
.pdf-content table {
  border-collapse: collapse; width: 100%; margin: 14pt 0;
  font-size: 9.5pt;
  font-family: 'Helvetica Neue', Arial, sans-serif;
}
.pdf-content th, .pdf-content td {
  padding: 4.5pt 8pt; border: 0.5pt solid #bbb; text-align: left;
  vertical-align: top; word-break: break-word; overflow-wrap: break-word;
}
.pdf-content th {
  background: #f2f2f2; font-weight: 700; color: #111;
  border-bottom: 1pt solid #999;
}
.pdf-content tr:nth-child(even) td { background: #fafafa; }
.pdf-content tr:first-child td { background: transparent; } /* tbody first row */

/* ── Lists ── */
.pdf-content ul, .pdf-content ol { margin: 8pt 0 10pt; padding-left: 20pt; }
.pdf-content li { margin: 3pt 0; }

/* ── Blockquote ── */
.pdf-content blockquote {
  margin: 12pt 0; padding: 9pt 16pt;
  border-left: 3pt solid #c8a44e;
  background: #fafaf5;
  font-style: italic;
  border-radius: 0 3pt 3pt 0;
}

/* ── Misc inline ── */
.pdf-content hr { border: none; border-top: 0.5pt solid #ddd; margin: 18pt 0; }
.pdf-content a { color: #1a56db; text-decoration: underline; }
.pdf-content strong { font-weight: 700; }
.pdf-content em { font-style: italic; }
.pdf-content code {
  background: #f0f0f0; padding: 1pt 5pt;
  border-radius: 2pt;
  font-family: 'Menlo', 'Courier New', monospace;
  font-size: 9pt;
}

/* ── Cover page ── */
.pdf-cover {
  text-align: center;
  padding: 48pt 0 56pt;
  border-bottom: 2pt solid #e8e8e8;
  margin-bottom: 40pt;
}
.pdf-cover-logo {
  font-size: 11pt; font-weight: 800; color: #c8a44e;
  letter-spacing: 6pt; font-family: 'Helvetica Neue', sans-serif;
  text-transform: uppercase;
}
.pdf-cover-rule {
  width: 40pt; height: 2pt; background: #c8a44e;
  margin: 8pt auto 6pt;
}
.pdf-cover-subtitle {
  font-size: 8.5pt; color: #999; letter-spacing: 2.5pt;
  text-transform: uppercase; font-family: 'Helvetica Neue', sans-serif;
}
.pdf-cover-ticker {
  font-size: 56pt; font-weight: 800; margin: 36pt 0 4pt;
  color: #0b0b0b; letter-spacing: 3pt;
  font-family: 'Helvetica Neue', 'Arial', sans-serif;
  line-height: 1;
}
.pdf-cover-name {
  font-size: 14pt; color: #444; margin-bottom: 6pt;
  font-family: 'Georgia', serif;
  font-style: italic;
}
.pdf-cover-meta {
  font-size: 9pt; color: #888; margin-bottom: 28pt;
  font-family: 'Helvetica Neue', sans-serif;
}
.pdf-verdict-big {
  display: inline-block; padding: 10pt 30pt;
  font-size: 17pt; font-weight: 700;
  border: 2pt solid; border-radius: 4pt;
  letter-spacing: 1.5pt;
  font-family: 'Helvetica Neue', sans-serif;
}
.pdf-scores {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 14pt 20pt; margin: 32pt auto 0; max-width: 580px;
}
.pdf-score-row { text-align: left; }
.pdf-score-label {
  font-size: 8pt; color: #888; text-transform: uppercase;
  letter-spacing: 0.8pt; margin-bottom: 3pt;
  font-family: 'Helvetica Neue', sans-serif;
}
.pdf-score-bar-bg { height: 8pt; background: #e8e8e8; border-radius: 4pt; overflow: hidden; }
.pdf-score-bar-fill { height: 100%; border-radius: 4pt; }
.pdf-score-value {
  font-size: 10.5pt; font-weight: 700; margin-top: 3pt;
  font-family: 'Helvetica Neue', sans-serif;
}
.pdf-cover-date {
  margin-top: 36pt; font-size: 9.5pt; color: #777;
  font-family: 'Helvetica Neue', sans-serif;
}
.pdf-cover-confidence {
  display: inline-block; margin-top: 6pt; padding: 3pt 10pt;
  background: #f5f5f5; border-radius: 10pt;
  font-size: 9pt; color: #555;
  font-family: 'Helvetica Neue', sans-serif;
  text-transform: uppercase; letter-spacing: 1pt;
}

/* ── Disclaimer box ── */
.pdf-disclaimer {
  margin-top: 32pt; padding: 14pt 18pt;
  background: #fafaf7; border: 0.5pt solid #e0e0e0;
  font-size: 8.5pt; color: #666; border-radius: 3pt;
  line-height: 1.55;
  font-family: 'Helvetica Neue', Arial, sans-serif;
}

/* ── Flag cards ── */
.pdf-flag {
  padding: 9pt 14pt; margin: 5pt 0;
  border-left: 3pt solid; border-radius: 0 3pt 3pt 0;
  font-size: 9.5pt;
}
.pdf-flag-high { border-color: #ef4444; background: #fef2f2; }
.pdf-flag-medium { border-color: #d4af37; background: #fefdf6; }
.pdf-flag-low { border-color: #60a5fa; background: #f0f6ff; }
.pdf-flag-green { border-color: #22c55e; background: #f0fdf4; }
.pdf-flag-severity {
  font-weight: 700; text-transform: uppercase; font-size: 8pt;
  font-family: 'Helvetica Neue', sans-serif; letter-spacing: 0.5pt;
}
.pdf-flag-quote { margin-top: 4pt; font-style: italic; color: #666; font-size: 8.5pt; }

/* ── Metric grid ── */
.pdf-metric-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 7pt 18pt; margin: 10pt 0;
  font-size: 9.5pt;
  font-family: 'Helvetica Neue', Arial, sans-serif;
}
.pdf-metric-key { color: #666; }
.pdf-metric-value { font-weight: 700; color: #0b0b0b; }

/* ── Glossary ── */
.pdf-glossary-item { margin: 7pt 0; font-size: 9.5pt; }
.pdf-glossary-term { font-weight: 700; color: #b8923e; }

/* ── Simple summary callout ── */
.pdf-simple-summary {
  background: #fffbeb;
  border: 1pt solid #f0d060;
  padding: 14pt 18pt;
  border-radius: 3pt;
  margin: 14pt 0;
}
.pdf-simple-summary h3 { margin-top: 0; color: #8a5e10; }

/* ── Page footer (screen only — printed by fixed element above) ── */
.pdf-page-footer {
  display: none;
}

/* ── Floating controls ── */
.pdf-controls {
  position: fixed; top: 16px; right: 20px;
  display: flex; gap: 10px; z-index: 10001;
}
.pdf-controls button {
  padding: 10px 18px; border-radius: 5px; border: none;
  font-size: 13px; font-weight: 700; cursor: pointer;
  font-family: -apple-system, 'Helvetica Neue', sans-serif;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  letter-spacing: 0.2px;
}
.pdf-btn-print { background: #c8a44e; color: #000; }
.pdf-btn-print:hover { background: #b8903e; }
.pdf-btn-close { background: #2a2a2a; color: #fff; }
.pdf-btn-close:hover { background: #444; }
`;

// ─── Compiled inline regex (hoisted so it's not rebuilt per call) ────────────
// Order matters: ** before * to avoid greedy single-star matching double-star.
const INLINE_RE = /(\*\*(?:[^*]|\*(?!\*))+\*\*|\*(?:[^*])+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/;

// ─── Simple inline markdown renderer ─────────────────────────
function renderInline(s) {
  const parts = [];
  let rem = s;
  let key = 0;
  while (rem) {
    const m = rem.match(INLINE_RE);
    if (!m) { parts.push(rem); break; }
    if (m.index > 0) parts.push(rem.slice(0, m.index));
    const t = m[0];
    if (t.startsWith('**')) parts.push(<strong key={key++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('*')) parts.push(<em key={key++}>{t.slice(1, -1)}</em>);
    else if (t.startsWith('`')) parts.push(<code key={key++}>{t.slice(1, -1)}</code>);
    else {
      const lm = t.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (lm) parts.push(<a key={key++} href={lm[2]}>{lm[1]}</a>);
    }
    rem = rem.slice(m.index + t.length);
  }
  return parts;
}

// Reports use "## PART I --", "## PART II --" etc. as major section breaks.
// Detect these to inject page-break-before class.
const PART_HEADER_RE = /^#{1,2}\s+PART\s+[IVXLCDM]+\b/i;

// ─── Block markdown renderer ─────────────────────────────────
// Handles: h1-h6, p, strong/em, ul/ol, tables, blockquote, hr, code
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

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Headers ──
    if (/^#{1,6} /.test(trimmed)) {
      flushPara();
      const level = trimmed.match(/^(#+)/)[1].length;
      const text = trimmed.replace(/^#+\s*/, '');
      // MD h1 (#) → PDF h2; MD h2 (##) → PDF h3; etc. (max h5)
      // EXCEPTION: PART headers (## PART I etc.) keep h2 and get page-break class.
      const isPart = PART_HEADER_RE.test(trimmed);
      const Tag = isPart ? 'h2' : `h${Math.min(level + 1, 5)}`;
      const className = isPart ? 'pdf-part-break' : undefined;
      out.push(React.createElement(
        Tag,
        { key: 'h' + out.length, ...(className ? { className } : {}) },
        renderInline(text)
      ));
      i++;
      continue;
    }

    // ── HR ──
    if (/^---+$/.test(trimmed)) {
      flushPara();
      out.push(<hr key={'hr' + out.length} />);
      i++;
      continue;
    }

    // ── Blockquote ──
    if (trimmed.startsWith('>')) {
      flushPara();
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(<blockquote key={'q' + out.length}>{renderInline(quote.join(' '))}</blockquote>);
      continue;
    }

    // ── Table ──
    if (/^\|.*\|$/.test(trimmed)) {
      flushPara();
      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        rows.push(lines[i].trim().split('|').slice(1, -1).map(c => c.trim()));
        i++;
      }
      if (rows.length >= 2 && /^[\s:|-]+$/.test(rows[1].join(''))) {
        out.push(
          <table key={'t' + out.length}>
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

    // ── Unordered list ──
    if (/^[-*+] /.test(trimmed)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^[-*+] /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      out.push(<ul key={'ul' + out.length}>{items.map((it, ii) => <li key={ii}>{renderInline(it)}</li>)}</ul>);
      continue;
    }

    // ── Ordered list ──
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

    // ── Empty line → paragraph break ──
    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }

    // ── Regular paragraph line ──
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

        {/* ─── RUNNING PAGE FOOTER (prints on every page in Chrome/Edge) ─── */}
        <div className="pdf-page-footer pdf-noprint">
          {ticker} — A&amp;R Institutional Dividend Research v4.0 ·{' '}
          {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })}
        </div>

        {/* ─── COVER PAGE ─── */}
        <div className="pdf-cover">
          {/* Masthead */}
          <div className="pdf-cover-logo">A&amp;R</div>
          <div className="pdf-cover-rule" />
          <div className="pdf-cover-subtitle">Institutional Dividend Research</div>

          {/* Company identity */}
          <div className="pdf-cover-ticker">{ticker}</div>
          {data?.company_name && (
            <div className="pdf-cover-name">{data.company_name}</div>
          )}
          <div className="pdf-cover-meta">
            {[
              data?.sector_bucket,
              data?.quarter ? `Q${data.quarter}` : null,
              data?.cfg?.price ? `Precio ref. $${data.cfg.price}` : null,
            ].filter(Boolean).join('  ·  ')}
          </div>

          {/* Verdict badge */}
          <div
            className="pdf-verdict-big"
            style={{ color: VERDICT_COLOR(data?.verdict), borderColor: VERDICT_COLOR(data?.verdict) }}
          >
            {data?.verdict || '—'}
          </div>

          {/* Score bars — 3 columns */}
          <div className="pdf-scores">
            <ScoreBar label="Dividend Safety" score={scores.safety} />
            <ScoreBar label="Dividend Growth" score={scores.growth} />
            <ScoreBar label="Mgmt Honesty" score={scores.honesty} />
            <ScoreBar label="Moat" score={scores.moat} />
            <ScoreBar label="Capital Alloc." score={scores.capital_alloc} />
            <ScoreBar label="Composite" score={scores.composite} color="#c8a44e" />
          </div>

          {/* Date + confidence */}
          <div className="pdf-cover-date">
            {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="pdf-cover-confidence">
            Confidence: {data?.confidence || 'medium'}
          </div>

          {/* Cover disclaimer */}
          <div className="pdf-disclaimer" style={{ marginTop: '32pt', textAlign: 'left' }}>
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
          <div className="pdf-section pdf-institutional-start">
            <h1 style={{ marginTop: 0, borderBottom: '2pt solid #c8a44e', paddingBottom: '8pt' }}>
              Informe Institucional Completo
            </h1>
            <p style={{ fontSize: '9.5pt', color: '#666', fontStyle: 'italic', marginBottom: '20pt' }}>
              Research detallado con fuentes primarias (SEC 10-K/10-Q narrative, FMP 10y fundamentals,
              earnings call transcripts). Cada tabla y afirmación cuantitativa incluye la fuente de línea
              en el filing original.
            </p>
            {renderMarkdownToPDF(data.result_md)}
          </div>
        )}

        {/* ─── FINAL DISCLAIMER ─── */}
        <div className="pdf-section pdf-disclaimer" style={{ marginTop: '40pt' }}>
          <strong>Fuentes utilizadas:</strong>
          <ul style={{ marginTop: '6pt' }}>
            <li>SEC EDGAR — 10-K (annual), 10-Q (quarterly) — narrativa MD&amp;A + Risk Factors + Business Description</li>
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
          <div style={{ borderTop: '0.5pt solid #ddd', marginTop: '10pt', paddingTop: '8pt', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8pt', color: '#999' }}>
            <span>Generado por <strong>A&amp;R Research v4.0</strong></span>
            <span>{ticker} · {new Date().toISOString().slice(0, 10)}</span>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
