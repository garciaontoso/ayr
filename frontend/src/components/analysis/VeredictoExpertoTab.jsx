// 🎓 Veredicto Experto — análisis didáctico narrativo escrito desde Claude
// Code session ($0, no API). Distinto de la pestaña 🧠 Claude (que cuesta).
//
// Endpoint backend: /api/expert-analysis?ticker=X
// Estructura: { ssd_data: {...}, narrative: "markdown...", verdict, score,
//   updated_at, version }
//
// Si no hay análisis para el ticker → empty state pidiendo a Claude Code
// que lo genere (yo en sesión interactiva).

import { useState, useEffect } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { API_URL } from '../../constants/index.js';

// Markdown muy simple — convierte títulos, listas, negritas, separadores.
// No usamos librería para mantener bundle pequeño.
function renderMarkdown(md) {
  if (!md) return null;
  const lines = md.split('\n');
  const blocks = [];
  let para = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', content: para.join(' ') });
      para = [];
    }
  };
  let inTable = false; let tableRows = [];
  const flushTable = () => {
    if (tableRows.length) {
      blocks.push({ type: 'table', rows: tableRows });
      tableRows = [];
      inTable = false;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*\|.+\|/.test(ln)) {
      if (!inTable) flushPara();
      inTable = true;
      const cells = ln.split('|').slice(1, -1).map(c => c.trim());
      // Skip separator rows (| --- | --- |)
      if (!cells.every(c => /^[-:\s]+$/.test(c))) tableRows.push(cells);
      continue;
    } else if (inTable) flushTable();

    if (/^---+\s*$/.test(ln)) { flushPara(); blocks.push({ type: 'hr' }); }
    else if (/^#{1,4}\s+/.test(ln)) {
      flushPara();
      const m = ln.match(/^(#+)\s+(.*)$/);
      blocks.push({ type: 'h', level: m[1].length, content: m[2] });
    }
    else if (/^[-*]\s+/.test(ln)) {
      flushPara();
      const last = blocks[blocks.length - 1];
      const text = ln.replace(/^[-*]\s+/, '');
      if (last && last.type === 'ul') last.items.push(text);
      else blocks.push({ type: 'ul', items: [text] });
    }
    else if (/^>\s+/.test(ln)) {
      flushPara();
      blocks.push({ type: 'blockquote', content: ln.replace(/^>\s+/, '') });
    }
    else if (ln.trim() === '') flushPara();
    else para.push(ln);
  }
  flushPara();
  flushTable();

  // Inline formatting: **bold**, *italic*, `code`
  const inline = (t) => {
    if (!t) return null;
    const parts = [];
    let buf = ''; let i = 0;
    while (i < t.length) {
      if (t[i] === '*' && t[i+1] === '*') {
        const end = t.indexOf('**', i+2);
        if (end > i+2) {
          if (buf) { parts.push(buf); buf = ''; }
          parts.push(<strong key={parts.length} style={{ color: 'var(--text-primary)' }}>{t.slice(i+2, end)}</strong>);
          i = end + 2; continue;
        }
      }
      if (t[i] === '`') {
        const end = t.indexOf('`', i+1);
        if (end > i+1) {
          if (buf) { parts.push(buf); buf = ''; }
          parts.push(<code key={parts.length} style={{ background: 'rgba(200,164,78,.08)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--fm)', fontSize: '.92em', color: 'var(--gold)' }}>{t.slice(i+1, end)}</code>);
          i = end + 1; continue;
        }
      }
      buf += t[i]; i++;
    }
    if (buf) parts.push(buf);
    return parts;
  };

  return blocks.map((b, i) => {
    if (b.type === 'hr') return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }}/>;
    if (b.type === 'h') {
      const sizes = { 1: 24, 2: 18, 3: 15, 4: 13 };
      const colors = { 1: 'var(--text-primary)', 2: 'var(--gold)', 3: 'var(--text-primary)', 4: 'var(--text-secondary)' };
      const Tag = `h${b.level}`;
      return <Tag key={i} style={{ fontSize: sizes[b.level], color: colors[b.level], fontFamily: 'var(--fd)', margin: b.level === 1 ? '0 0 16px' : b.level === 2 ? '24px 0 10px' : '16px 0 6px', fontWeight: b.level <= 2 ? 700 : 600, lineHeight: 1.3 }}>{inline(b.content)}</Tag>;
    }
    if (b.type === 'ul') {
      return <ul key={i} style={{ margin: '8px 0 14px 20px', paddingLeft: 0, color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 13 }}>
        {b.items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{inline(it)}</li>)}
      </ul>;
    }
    if (b.type === 'blockquote') {
      return <div key={i} style={{ borderLeft: '3px solid var(--gold)', padding: '6px 14px', margin: '12px 0', background: 'rgba(200,164,78,.04)', borderRadius: '0 8px 8px 0', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{inline(b.content)}</div>;
    }
    if (b.type === 'table') {
      const [head, ...body] = b.rows;
      return (
        <div key={i} style={{ overflowX: 'auto', margin: '14px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--fm)' }}>
            <thead><tr>{head.map((c, j) => <th key={j} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--gold)', fontSize: 10, fontWeight: 700, letterSpacing: .3, textTransform: 'uppercase', borderBottom: '2px solid var(--border)' }}>{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((row, k) => (
              <tr key={k} style={{ borderBottom: '1px solid var(--subtle-bg2)' }}>
                {row.map((c, j) => <td key={j} style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{inline(c)}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      );
    }
    return <p key={i} style={{ margin: '8px 0', color: 'var(--text-secondary)', lineHeight: 1.75, fontSize: 13 }}>{inline(b.content)}</p>;
  });
}

export default function VeredictoExpertoTab() {
  const { cfg } = useAnalysis();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cfg.ticker) return;
    setLoading(true);
    setData(null);
    fetch(`${API_URL}/api/expert-analysis?ticker=${encodeURIComponent(cfg.ticker)}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData({ exists: false }))
      .finally(() => setLoading(false));
  }, [cfg.ticker]);

  if (loading) return (
    <Card>
      <div style={{ padding: 30, color: 'var(--text-tertiary)', textAlign: 'center' }}>
        Cargando análisis experto…
      </div>
    </Card>
  );

  if (!data?.exists) return (
    <Card>
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎓</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)', marginBottom: 8 }}>Análisis Experto pendiente</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>
          Todavía no se ha generado el análisis "como analista experto" para <strong style={{ color: 'var(--gold)' }}>{cfg.ticker}</strong>. Estos análisis los escribe Claude Code session (gratis, sin coste API) cubriendo: calidad, deuda, dividendo, valoración, riesgos, riesgo IA, y veredicto final.
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 16, fontStyle: 'italic' }}>
          Pídele a Claude en chat: <strong style={{ color: 'var(--gold)' }}>"genera análisis experto para {cfg.ticker}"</strong>
        </div>
      </div>
    </Card>
  );

  const { ssd, narrative, verdict, score, updated_at, version } = data;
  const verdictColor = verdict === 'CORE HOLD' || verdict === 'ADD' || verdict === 'BUY' ? '#30d158'
                    : verdict === 'HOLD' ? '#ffd60a'
                    : verdict === 'REVIEW' ? '#ff9f0a'
                    : '#ff453a';

  return (
    <div>
      {/* Header card with verdict */}
      <div style={{ background: `linear-gradient(135deg, ${verdictColor}10, transparent)`, border: `1px solid ${verdictColor}33`, borderRadius: 14, padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: 1, textTransform: 'uppercase' }}>Análisis Experto · {cfg.ticker}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: verdictColor, fontFamily: 'var(--fd)', marginTop: 4 }}>
              {verdict || '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Última actualización: {updated_at ? new Date(updated_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '—'} · v{version || 1}
            </div>
          </div>
          {score != null && (
            <div style={{ textAlign: 'center', padding: '12px 18px', borderRadius: 12, background: `${verdictColor}12`, border: `2px solid ${verdictColor}33` }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: verdictColor, fontFamily: 'var(--fm)', lineHeight: 1 }}>{score}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>/ 100</div>
            </div>
          )}
        </div>
      </div>

      {/* Narrative content */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
        {narrative ? renderMarkdown(narrative) : (
          <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', textAlign: 'center', padding: 30 }}>
            Sin contenido narrativo guardado todavía.
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 14, fontStyle: 'italic' }}>
        💰 Coste: $0 · Generado por Claude Code session (no consume crédito API). Distinto de la pestaña 🧠 Claude que sí cuesta.
      </div>
    </div>
  );
}
