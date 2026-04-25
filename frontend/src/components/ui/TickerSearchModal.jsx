import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { API_URL } from '../../constants/index.js';

/**
 * TickerSearchModal — autocompletado de tickers que llama /api/search.
 *
 * Reemplaza window.prompt() con un buscador real: el usuario escribe
 * "nestle" y ve dropdown con NESN.SW (Swiss), NSRGY (NASDAQ ADR), etc.
 * Evita tener que recordar sufijos exactos por exchange.
 *
 * Props:
 *   open       boolean
 *   onClose    () => void
 *   onSelect   ({symbol, name, exchange}) => void   se llama al elegir
 *   title      string                                default 'Añadir ticker'
 *   subtitle   string                                texto contextual debajo del título
 *   debounceMs number                                default 250
 */
export default function TickerSearchModal({ open, onClose, onSelect, title='Añadir ticker', subtitle, debounceMs=250 }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQuery(''); setResults([]); setError(null); setActiveIdx(0);
      // Auto-focus input — Modal lo enfoca pero a veces el input interno se queda fuera del trap inicial.
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [open]);

  // Debounced fetch when query changes
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (query.trim().length < 1) { setResults([]); setError(null); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true); setError(null);
      const ctrl = new AbortController(); abortRef.current = ctrl;
      try {
        const resp = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query.trim())}&limit=12`, { signal: ctrl.signal });
        if (!resp.ok) throw new Error('Search failed');
        const data = await resp.json();
        setResults(Array.isArray(data.results) ? data.results : []);
        setActiveIdx(0);
      } catch(e) {
        if (e.name !== 'AbortError') setError(e.message || 'Error');
      } finally { setLoading(false); }
    }, debounceMs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, debounceMs]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setActiveIdx(i => Math.min(i+1, Math.max(results.length-1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setActiveIdx(i => Math.max(i-1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[activeIdx];
      if (r) { onSelect?.(r); onClose?.(); }
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} width="540px">
      {subtitle && <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:10,fontFamily:'var(--fm)'}}>{subtitle}</div>}

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Empieza a escribir: 'nestle', 'NESN', 'unilever'…"
        style={{
          width:'100%', padding:'10px 12px', fontSize:13, fontFamily:'var(--fm)',
          background:'var(--card, var(--subtle-bg))', color:'var(--text-primary)',
          border:'1px solid var(--border)', borderRadius:8, outline:'none',
          marginBottom:10,
        }}
      />

      {/* Estados: loading / error / vacío / resultados */}
      {loading && <div style={{padding:'8px 4px',fontSize:11,color:'var(--text-tertiary)',fontFamily:'var(--fm)'}}>Buscando…</div>}
      {error && <div style={{padding:'8px 4px',fontSize:11,color:'var(--red)',fontFamily:'var(--fm)'}}>⚠ {error}</div>}
      {!loading && !error && query.trim().length >= 1 && results.length === 0 && (
        <div style={{padding:'8px 4px',fontSize:11,color:'var(--text-tertiary)',fontFamily:'var(--fm)'}}>
          Sin resultados para "{query}". Intenta con el nombre completo de la empresa.
        </div>
      )}

      {results.length > 0 && (
        <div style={{maxHeight:380,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8}}>
          {results.map((r, i) => {
            const active = i === activeIdx;
            return (
              <button
                key={r.symbol}
                type="button"
                onClick={() => { onSelect?.(r); onClose?.(); }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  width:'100%', padding:'10px 12px', textAlign:'left', cursor:'pointer',
                  background: active ? 'var(--gold-glow, rgba(200,164,78,0.10))' : 'transparent',
                  border:'none', borderBottom: i < results.length-1 ? '1px solid var(--subtle-border, rgba(255,255,255,0.05))' : 'none',
                  fontFamily:'var(--fm)', color:'var(--text-primary)',
                }}>
                <div style={{display:'flex',flexDirection:'column',gap:2,minWidth:0}}>
                  <div style={{display:'flex',gap:8,alignItems:'baseline'}}>
                    <span style={{fontWeight:700,color:'var(--gold)',fontSize:12}}>{r.symbol}</span>
                    {r.exchangeShort && (
                      <span style={{fontSize:9,color:'var(--text-tertiary)',padding:'1px 6px',borderRadius:3,background:'var(--subtle-bg, rgba(255,255,255,0.04))',border:'1px solid var(--border)'}}>
                        {r.exchangeShort}
                      </span>
                    )}
                    {r.currency && <span style={{fontSize:9,color:'var(--text-tertiary)'}}>{r.currency}</span>}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-secondary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:380}} title={r.name}>
                    {r.name}
                  </div>
                </div>
                <div style={{fontSize:9,color:'var(--text-tertiary)',whiteSpace:'nowrap',marginLeft:12}}>
                  {r.exchange}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{marginTop:10,fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)'}}>
        ↑↓ navegar · ↵ seleccionar · Esc cerrar
      </div>
    </Modal>
  );
}
