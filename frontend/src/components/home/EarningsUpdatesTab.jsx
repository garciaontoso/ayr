// 📊 Earnings Updates Tab — lista de earnings update reports generados
// por Claude Code session ($0 vía suscripción, no API tokens).
//
// Endpoints:
//   GET /api/earnings/auto-update/list?ticker=X   → lista por ticker o global
//   GET /api/earnings/auto-update/get?id=N        → markdown del report
//   GET /api/earnings/auto-update/pending          → empresas reportaron sin update
//
// Workflow user:
// 1. Telegram avisa por la mañana si hay pending
// 2. SessionStart hook Claude Code lo muestra al abrir terminal
// 3. User pide a Claude "vamos con los pendientes"
// 4. Claude genera + sube via /upload-manual
// 5. Aparece aquí en esta tab
//
// Inspirado por skill earnings-analysis de Anthropic FSI cookbook
// (1500-2500 palabras institucional JPMorgan/GS format).

import { useState, useEffect, useMemo } from 'react';
import { Card } from '../ui';
import { API_URL } from '../../constants/index.js';

// Markdown renderer simple (mismo patrón que VeredictoExpertoTab)
function renderMarkdown(md) {
  if (!md) return null;
  const lines = md.split('\n');
  const blocks = [];
  let para = [];
  const flushPara = () => {
    if (para.length) { blocks.push({ type: 'p', content: para.join(' ') }); para = []; }
  };
  let inTable = false; let tableRows = [];
  const flushTable = () => {
    if (tableRows.length) { blocks.push({ type: 'table', rows: tableRows }); tableRows = []; inTable = false; }
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*\|.+\|/.test(ln)) {
      if (!inTable) flushPara();
      inTable = true;
      const cells = ln.split('|').slice(1, -1).map(c => c.trim());
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
    else if (ln.trim() === '') { flushPara(); }
    else { para.push(ln); }
  }
  flushPara(); flushTable();
  const inline = (s) => {
    const parts = []; let cur = ''; let i = 0;
    while (i < s.length) {
      if (s.slice(i, i + 2) === '**') {
        const end = s.indexOf('**', i + 2);
        if (end > 0) { if (cur) parts.push(cur); cur = '';
          parts.push(<strong key={parts.length} style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{s.slice(i + 2, end)}</strong>);
          i = end + 2; continue;
        }
      }
      if (s[i] === '`') {
        const end = s.indexOf('`', i + 1);
        if (end > 0) { if (cur) parts.push(cur); cur = '';
          parts.push(<code key={parts.length} style={{ background: 'var(--subtle-bg)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--fm)', fontSize: 11 }}>{s.slice(i + 1, end)}</code>);
          i = end + 1; continue;
        }
      }
      cur += s[i]; i++;
    }
    if (cur) parts.push(cur);
    return parts;
  };
  return blocks.map((b, i) => {
    if (b.type === 'hr') return <hr key={i} style={{ border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' }}/>;
    if (b.type === 'h') {
      const sizes = { 1: 22, 2: 18, 3: 15, 4: 13 };
      return <h2 key={i} style={{ fontSize: sizes[b.level] || 13, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)', margin: b.level <= 2 ? '20px 0 10px' : '14px 0 8px' }}>{inline(b.content)}</h2>;
    }
    if (b.type === 'ul') return <ul key={i} style={{ margin: '6px 0 12px', paddingLeft: 22 }}>{b.items.map((it, j) => <li key={j} style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 13, marginBottom: 4 }}>{inline(it)}</li>)}</ul>;
    if (b.type === 'table') {
      const [header, ...body] = b.rows;
      return <div key={i} style={{ overflowX: 'auto', margin: '12px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--fm)' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
            {header.map((h, j) => <th key={j} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 9, letterSpacing: .4, textTransform: 'uppercase' }}>{h}</th>)}
          </tr></thead>
          <tbody>{body.map((r, j) => (
            <tr key={j} style={{ borderBottom: '1px solid var(--subtle-bg)' }}>
              {r.map((c, k) => <td key={k} style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{inline(c)}</td>)}
            </tr>))}
          </tbody>
        </table>
      </div>;
    }
    return <p key={i} style={{ margin: '8px 0', color: 'var(--text-secondary)', lineHeight: 1.75, fontSize: 13 }}>{inline(b.content)}</p>;
  });
}

export default function EarningsUpdatesTab() {
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedMd, setSelectedMd] = useState('');
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [tickerFilter, setTickerFilter] = useState('');

  // Cargar lista al montar
  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/earnings/auto-update/list`).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(`${API_URL}/api/earnings/auto-update/pending`).then(r => r.json()).catch(() => ({ pending: [], upcoming: [] })),
    ]).then(([list, pend]) => {
      setItems(list.items || []);
      setPending(pend.pending || []);
      setUpcoming(pend.upcoming || []);
      // Auto-select most recent
      if ((list.items || []).length > 0) setSelectedId(list.items[0].id);
    }).finally(() => setLoading(false));
  }, []);

  // Cargar markdown del seleccionado
  useEffect(() => {
    if (!selectedId) { setSelectedMd(''); return; }
    setSelectedLoading(true);
    fetch(`${API_URL}/api/earnings/auto-update/get?id=${selectedId}`)
      .then(r => r.json())
      .then(d => setSelectedMd(d.markdown || ''))
      .catch(() => setSelectedMd(''))
      .finally(() => setSelectedLoading(false));
  }, [selectedId]);

  const filteredItems = useMemo(() => {
    if (!tickerFilter.trim()) return items;
    const q = tickerFilter.trim().toUpperCase();
    return items.filter(it => it.ticker.includes(q));
  }, [items, tickerFilter]);

  const selected = items.find(it => it.id === selectedId);

  if (loading) {
    return <Card><div style={{ padding: 30, color: 'var(--text-tertiary)', textAlign: 'center' }}>Cargando earnings updates…</div></Card>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Pending alert banner */}
      {pending.length > 0 && (
        <div style={{ padding: '10px 14px', background: 'rgba(255,159,10,.08)', border: '1px solid rgba(255,159,10,.3)', borderRadius: 10, color: 'var(--orange)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>📊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{pending.length} earnings updates pendientes</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              {pending.slice(0, 5).map(p => `${p.ticker} (hace ${p.days_ago}d)`).join(' · ')}
              {pending.length > 5 && ` · +${pending.length - 5} más`}
            </div>
          </div>
          <div style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--text-tertiary)', maxWidth: 380 }}>
            Pídele a Claude Code: <code style={{ background: 'var(--subtle-bg)', padding: '2px 6px', borderRadius: 3 }}>genera earnings updates para {pending.slice(0, 2).map(p => p.ticker).join(', ')}</code>
          </div>
        </div>
      )}

      {/* Upcoming next 7d */}
      {upcoming.length > 0 && (
        <div style={{ padding: '8px 14px', background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.25)', borderRadius: 10, fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>📅</span>
          <span style={{ fontWeight: 600, color: '#60a5fa' }}>{upcoming.length} earnings esperadas próximos 7 días:</span>
          <span style={{ color: 'var(--text-tertiary)' }}>{upcoming.slice(0, 8).map(u => `${u.ticker} ${u.earnings_date}`).join(' · ')}</span>
        </div>
      )}

      {/* No data state */}
      {items.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)', marginBottom: 8 }}>Sin earnings updates aún</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 540, margin: '0 auto', lineHeight: 1.7 }}>
              Los earnings update reports se generan vía <strong style={{ color: 'var(--gold)' }}>Claude Code session</strong> (coste $0, sin API tokens) cuando una empresa de tu cartera reporta resultados.
              Formato institucional 1,500-2,500 palabras estilo JPMorgan/Goldman/MS.
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 16, fontStyle: 'italic' }}>
              Pídele a Claude en chat: <strong style={{ color: 'var(--gold)' }}>"genera earnings update para [TICKER]"</strong> después de que reporte.
            </div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 14, alignItems: 'flex-start' }}>
          {/* Left column: list */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="text" placeholder="Filtrar ticker…" value={tickerFilter} onChange={e => setTickerFilter(e.target.value)}
                style={{ flex: 1, padding: '5px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--fm)', outline: 'none' }}/>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{filteredItems.length}/{items.length}</span>
            </div>
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {filteredItems.map(it => {
                const active = it.id === selectedId;
                return (
                  <button key={it.id} onClick={() => setSelectedId(it.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--subtle-bg)',
                      background: active ? 'var(--gold-dim)' : 'transparent', color: active ? 'var(--gold)' : 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: 11, fontFamily: 'var(--fm)' }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--subtle-bg)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: active ? 'var(--gold)' : 'var(--text-primary)' }}>{it.ticker}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{it.date}</span>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {it.size_bytes ? `${Math.round(it.size_bytes / 1024)}KB` : ''} · {it.created_at?.slice(0, 16).replace('T', ' ')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right column: markdown viewer */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 22px', minHeight: 400 }}>
            {selected && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: 1, textTransform: 'uppercase' }}>Earnings Update Report</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>{selected.ticker} · {selected.date}</div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                  💰 Coste $0 · Claude Code session
                </div>
              </div>
            )}
            {selectedLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>Cargando markdown…</div>
            ) : selectedMd ? (
              renderMarkdown(selectedMd)
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                Selecciona un earnings update de la lista
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
