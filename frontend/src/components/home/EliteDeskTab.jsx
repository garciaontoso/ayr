// 🎓 Elite Desk — 10 firm-persona Claude memos on demand.
//
// Built 2026-05-03 from @intelligentcryptocurrency Instagram post.
// Each card = one firm persona (Goldman / Morgan Stanley / Bridgewater / etc).
// Click a card → modal asks for context (ticker / sector / "mi cartera").
// Click "Generar" → POST /api/elite-desk/run → Claude Opus → markdown memo.
// Results cached 24h per (prompt, ctx) and stored in D1 elite_memos.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';

const card = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
};

// Mini markdown → JSX renderer for the memo body. Supports headings, bold,
// italics, lists, tables, code blocks, blockquotes. Not a full parser — just
// enough to render the kind of output Claude produces.
function MemoRender({ md }) {
  const html = useMemo(() => mdToHtml(md || ''), [md]);
  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.65,
        color: 'var(--text-primary)',
        fontFamily: 'var(--fb)',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function mdToHtml(md) {
  // Escape first
  let h = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Code fence (```...```)
  h = h.replace(/```([\s\S]*?)```/g,
    (_, code) => `<pre style="background:var(--subtle-bg2);padding:10px;border-radius:6px;overflow-x:auto;font-size:11px;font-family:var(--fm);margin:8px 0">${code}</pre>`);
  // Headings
  h = h.replace(/^###### (.*)$/gm, '<h6 style="font-size:11px;font-weight:700;color:var(--gold);margin:10px 0 4px">$1</h6>');
  h = h.replace(/^##### (.*)$/gm, '<h5 style="font-size:12px;font-weight:700;color:var(--gold);margin:12px 0 4px">$1</h5>');
  h = h.replace(/^#### (.*)$/gm, '<h4 style="font-size:13px;font-weight:700;color:var(--gold);margin:14px 0 6px">$1</h4>');
  h = h.replace(/^### (.*)$/gm, '<h3 style="font-size:15px;font-weight:700;color:var(--gold);margin:16px 0 6px;font-family:var(--fd)">$1</h3>');
  h = h.replace(/^## (.*)$/gm, '<h2 style="font-size:18px;font-weight:800;color:var(--text-primary);margin:20px 0 8px;font-family:var(--fd);border-bottom:1px solid var(--subtle-border);padding-bottom:4px">$1</h2>');
  h = h.replace(/^# (.*)$/gm, '<h1 style="font-size:22px;font-weight:800;color:var(--gold);margin:24px 0 10px;font-family:var(--fd)">$1</h1>');
  // Bold + italics
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary);font-weight:700">$1</strong>');
  h = h.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
  h = h.replace(/`([^`]+)`/g, '<code style="background:var(--subtle-bg2);padding:1px 5px;border-radius:3px;font-family:var(--fm);font-size:11px;color:var(--gold)">$1</code>');
  // Tables (very light: lines like | a | b | c |)
  const lines = h.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('|') && lines[i + 1] && /^\|[\s\-:|]+\|/.test(lines[i + 1].trim())) {
      const headerCells = lines[i].trim().slice(1, -1).split('|').map(c => c.trim());
      i += 2; // skip separator
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().slice(1, -1).split('|').map(c => c.trim());
        rows.push(cells);
        i++;
      }
      out.push(
        `<table style="border-collapse:collapse;margin:10px 0;width:100%;font-size:12px"><thead><tr>${
          headerCells.map(c => `<th style="text-align:left;padding:6px 8px;background:var(--subtle-bg2);border-bottom:2px solid var(--gold);color:var(--text-primary);font-weight:700">${c}</th>`).join('')
        }</tr></thead><tbody>${
          rows.map(r => `<tr>${r.map(c => `<td style="padding:5px 8px;border-bottom:1px solid var(--subtle-border)">${c}</td>`).join('')}</tr>`).join('')
        }</tbody></table>`
      );
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  h = out.join('\n');
  // Lists
  h = h.replace(/^- (.+)$/gm, '<li style="margin:3px 0">$1</li>');
  h = h.replace(/(<li[^>]*>[\s\S]*?<\/li>\s*)+/g, m => `<ul style="margin:6px 0;padding-left:22px">${m}</ul>`);
  // Blockquotes
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid var(--gold);padding:4px 12px;margin:8px 0;color:var(--text-secondary);font-style:italic">$1</blockquote>');
  // Paragraphs (line breaks)
  h = h.split(/\n\n+/).map(par => {
    if (par.match(/^<(h\d|ul|ol|table|pre|blockquote)/)) return par;
    return `<p style="margin:6px 0">${par.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');
  return h;
}

export default function EliteDeskTab() {
  const [prompts, setPrompts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeMemo, setActiveMemo] = useState(null);    // memo object being viewed
  const [picker, setPicker] = useState(null);            // {prompt} when picker modal open
  const [ctxType, setCtxType] = useState('portfolio');
  const [ctxValue, setCtxValue] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);

  const loadPrompts = useCallback(async (signal) => {
    try {
      const r = await fetch(`${API_URL}/api/elite-desk/prompts`, { signal });
      const j = await r.json();
      if (j.prompts) setPrompts(j.prompts);
    } catch (e) {
      if (e.name !== 'AbortError') setError('Error cargando prompts: ' + e.message);
    }
  }, []);

  const loadHistory = useCallback(async (signal) => {
    try {
      const r = await fetch(`${API_URL}/api/elite-desk/history?limit=30`, { signal });
      const j = await r.json();
      if (j.memos) setHistory(j.memos);
    } catch (e) {
      if (e.name !== 'AbortError') setError('Error cargando historial: ' + e.message);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([loadPrompts(ctrl.signal), loadHistory(ctrl.signal)])
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [loadPrompts, loadHistory]);

  const openPicker = (p) => {
    if (p.needs_existing) {
      // Just show a hint — user clicks "Open existing" instead.
      setPicker({ prompt: p, hint: true });
      return;
    }
    setPicker({ prompt: p });
    // Default ctx: first allowed type for this prompt
    setCtxType(p.ctx_types[0] || 'portfolio');
    setCtxValue('');
    setRunError(null);
  };

  const closePicker = () => {
    setPicker(null);
    setRunError(null);
  };

  const runPrompt = async (force = false) => {
    if (!picker) return;
    const { prompt } = picker;
    if ((ctxType === 'ticker' || ctxType === 'sector') && !ctxValue.trim()) {
      setRunError(`Introduce un ${ctxType === 'ticker' ? 'ticker' : 'sector'}.`);
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const r = await fetch(`${API_URL}/api/elite-desk/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_id: prompt.id,
          ctx_type: ctxType,
          ctx_value: ctxValue.trim().toUpperCase(),
          force,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setRunError(j.error || 'Error desconocido');
      } else {
        setActiveMemo(j.memo);
        setPicker(null);
        // Refresh history
        const ctrl = new AbortController();
        loadHistory(ctrl.signal);
      }
    } catch (e) {
      setRunError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const openMemo = async (memoId) => {
    try {
      const r = await fetch(`${API_URL}/api/elite-desk/memo/${memoId}`);
      const j = await r.json();
      if (j.memo) setActiveMemo(j.memo);
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteMemo = async (memoId) => {
    if (!confirm('¿Borrar este memo?')) return;
    try {
      await fetch(`${API_URL}/api/elite-desk/memo/${memoId}`, { method: 'DELETE' });
      setHistory(history.filter(m => m.id !== memoId));
      if (activeMemo?.id === memoId) setActiveMemo(null);
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
        Cargando Elite Desk...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(200,164,78,0.15) 0%, rgba(200,164,78,0.04) 100%)',
        border: '1px solid rgba(200,164,78,0.3)',
        borderRadius: 16,
        padding: '20px 24px',
      }}>
        <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, letterSpacing: '.1em', fontFamily: 'var(--fm)' }}>
          🎓 ELITE DESK
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--fd)', marginTop: 6 }}>
          {prompts.length} firmas elite analizan tus datos reales
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
          Cada card lanza una llamada a Claude Opus con tu portfolio/ticker/sector como contexto.
          Cacheado 24h por consulta. Coste promedio ~$0.05-0.10 por análisis.
        </div>
      </div>

      {/* Cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 14,
      }}>
        {prompts.map(p => (
          <button
            key={p.id}
            onClick={() => openPicker(p)}
            style={{
              ...card,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: 140,
              borderColor: p.color ? `${p.color}55` : 'var(--border)',
              transition: 'transform .15s, box-shadow .15s, border-color .15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 8px 24px ${p.color || '#000'}33`;
              e.currentTarget.style.borderColor = p.color || 'var(--gold)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = '';
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.borderColor = p.color ? `${p.color}55` : 'var(--border)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                fontSize: 24,
                width: 40,
                height: 40,
                borderRadius: 10,
                background: `${p.color}22`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>{p.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: p.color || 'var(--text-tertiary)', fontWeight: 700, letterSpacing: '.05em', fontFamily: 'var(--fm)' }}>
                  {p.firm}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)', marginTop: 2 }}>
                  {p.title}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
              {p.ctx_types.map(c => (
                <span key={c} style={{
                  fontSize: 9,
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: 'var(--subtle-bg2)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--fm)',
                  textTransform: 'uppercase',
                }}>{c === 'portfolio' ? '💼 cartera' : c === 'ticker' ? '🎯 ticker' : '📦 sector'}</span>
              ))}
              {p.needs_existing && (
                <span style={{
                  fontSize: 9,
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: 'rgba(48,209,88,.15)',
                  color: '#30d158',
                  fontFamily: 'var(--fm)',
                  textTransform: 'uppercase',
                }}>✓ ya cubierto</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* History panel */}
      {history.length > 0 && (
        <div style={card}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: 'var(--gold)',
            fontFamily: 'var(--fm)',
            marginBottom: 12,
          }}>
            🗂️ Historial ({history.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map(m => {
              const p = prompts.find(x => x.id === m.prompt_id);
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr auto auto auto',
                    gap: 10,
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--subtle-border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => openMemo(m.id)}
                >
                  <div style={{ fontSize: 18 }}>{p?.icon || '📄'}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {p?.firm || m.prompt_id} · {p?.title || ''}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                      {m.ctx_label} · {new Date(m.generated_at).toLocaleString('es-ES')}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                    {m.chars?.toLocaleString() || 0} chars
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                    ${(m.cost_usd || 0).toFixed(3)}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMemo(m.id); }}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--subtle-border)',
                      color: 'var(--text-tertiary)',
                      borderRadius: 5,
                      padding: '2px 8px',
                      fontSize: 10,
                      cursor: 'pointer',
                      fontFamily: 'var(--fm)',
                    }}
                  >🗑</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Picker modal */}
      {picker && (
        <div
          onClick={closePicker}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 24,
              maxWidth: 500,
              width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 28 }}>{picker.prompt.icon}</div>
              <div>
                <div style={{ fontSize: 11, color: picker.prompt.color, fontWeight: 700, fontFamily: 'var(--fm)' }}>
                  {picker.prompt.firm}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)' }}>
                  {picker.prompt.title}
                </div>
              </div>
            </div>

            {picker.prompt.needs_existing && (
              <div style={{
                background: 'rgba(48,209,88,.1)',
                border: '1px solid rgba(48,209,88,.3)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}>
                Ya tienes esta funcionalidad implementada en la pestaña <b>{picker.prompt.needs_existing}</b>.
                Puedes correr este memo igualmente, pero la pestaña existente probablemente tenga datos más ricos.
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', fontFamily: 'var(--fm)' }}>
                Contexto
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {picker.prompt.ctx_types.map(c => (
                  <button
                    key={c}
                    onClick={() => setCtxType(c)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: ctxType === c ? `2px solid ${picker.prompt.color}` : '1px solid var(--border)',
                      background: ctxType === c ? `${picker.prompt.color}22` : 'transparent',
                      color: ctxType === c ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'var(--fb)',
                    }}
                  >
                    {c === 'portfolio' ? '💼 Mi cartera' : c === 'ticker' ? '🎯 Un ticker' : '📦 Un sector'}
                  </button>
                ))}
              </div>
            </div>

            {(ctxType === 'ticker' || ctxType === 'sector') && (
              <div style={{ marginBottom: 14 }}>
                <input
                  type="text"
                  value={ctxValue}
                  onChange={e => setCtxValue(e.target.value)}
                  placeholder={ctxType === 'ticker' ? 'AAPL, MSFT, NVDA...' : 'Healthcare, Energy, Technology...'}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--subtle-bg2)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontFamily: 'var(--fm)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {runError && (
              <div style={{
                background: 'rgba(255,69,58,.1)',
                color: '#ff453a',
                border: '1px solid rgba(255,69,58,.3)',
                borderRadius: 6,
                padding: 10,
                fontSize: 12,
                marginBottom: 12,
              }}>
                ⚠ {runError}
              </div>
            )}

            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 12, fontStyle: 'italic' }}>
              Coste estimado: ~$0.05-0.10 (Claude Opus, ~6K tokens out). Cacheado 24h.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={closePicker}
                style={{
                  padding: '9px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--fb)',
                }}
              >Cancelar</button>
              <button
                disabled={running}
                onClick={() => runPrompt(false)}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: running ? 'var(--subtle-bg2)' : (picker.prompt.color || 'var(--gold)'),
                  color: '#000',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: running ? 'wait' : 'pointer',
                  fontFamily: 'var(--fb)',
                }}
              >{running ? '⏳ Generando...' : '✨ Generar memo'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Memo viewer modal */}
      {activeMemo && (
        <div
          onClick={() => setActiveMemo(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.7)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
            overflowY: 'auto',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 28,
              maxWidth: 880,
              width: '100%',
              marginTop: 40,
              marginBottom: 40,
              boxShadow: '0 30px 80px rgba(0,0,0,.5)',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 18,
              paddingBottom: 14,
              borderBottom: '1px solid var(--subtle-border)',
            }}>
              {(() => {
                const p = prompts.find(x => x.id === activeMemo.prompt_id);
                return (
                  <>
                    <div style={{ fontSize: 32 }}>{p?.icon || '📄'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: p?.color || 'var(--gold)', fontWeight: 700, fontFamily: 'var(--fm)' }}>
                        {p?.firm || activeMemo.prompt_id}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--fd)' }}>
                        {p?.title || ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--fm)' }}>
                        {activeMemo.ctx_label} · {new Date(activeMemo.generated_at).toLocaleString('es-ES')} · ${(activeMemo.cost_usd || 0).toFixed(4)}
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveMemo(null)}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        color: 'var(--text-tertiary)',
                        borderRadius: 6,
                        padding: '4px 10px',
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >✕</button>
                  </>
                );
              })()}
            </div>
            <MemoRender md={activeMemo.output_md} />
          </div>
        </div>
      )}
    </div>
  );
}
