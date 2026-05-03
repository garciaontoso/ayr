// 🎯 Radar — empresas concretas que el usuario quiere comprar a un precio
// objetivo y que están esperando que caigan. Cuando precio_actual <= target,
// se dispara una alerta vía /api/alert-rules (Telegram + push).
//
// Distinto de:
//   · Cantera/Radar (sub-vista de CanteraTab): lista automática de 100
//     candidatos rankeados por priority_score. Esa es "qué mirar".
//   · Watchlist tabs: listas curadas tipo "Pastores del Dividendo".
//
// Esta es la lista personal de "quiero comprar X a Y precio".

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../../constants/index.js';
import { useHome } from '../../context/HomeContext';
import { _sf } from '../../utils/formatters.js';
import { EmptyState } from '../ui/EmptyState.jsx';

async function postJSON(path, body) {
  const r = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ error: r.statusText }));
}

// Crea regla de alerta global vía /api/alert-rules/add (price_below).
// Esta es la pieza que dispara Telegram cuando el precio cruza el target.
async function ensureAlertRule(ticker, target) {
  try {
    const r = await fetch(`${API_URL}/api/alert-rules/add`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        rule_type: 'price_below',
        operator: '<=',
        threshold: target,
        unit: '$',
        message: `${ticker} cayó al precio objetivo del Radar ($${target})`,
      }),
    });
    return await r.json().catch(() => ({}));
  } catch (e) {
    console.warn('alert-rule create failed', e);
    return {};
  }
}

// ── Company autocomplete combobox ──────────────────────────────────────
// Reemplaza el viejo input de "ticker exacto" con un buscador por nombre.
// El usuario escribe "Univer" → /api/search/company devuelve ULVR.L (UK),
// UNA.AS (NL), UL (US ADR)… con bandera del país. El click rellena
// draft.ticker + draft.name + draft.currency. Mínimo 2 chars, debounce
// 300ms para no martillear FMP.
function CompanySearchCombobox({ value, name, onPick, FLAGS, getCountry }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const wrapRef = useRef(null);

  // Sync external value changes (cuando se selecciona algo y el padre actualiza)
  useEffect(() => {
    if (value !== query && value !== undefined) setQuery(value || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    const term = (query || '').trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await fetch(`${API_URL}/api/search/company?q=${encodeURIComponent(term)}&limit=10`, { signal: ctrl.signal });
        const d = await r.json();
        setResults(Array.isArray(d.results) ? d.results.slice(0, 10) : []);
        setActiveIdx(0);
      } catch (e) {
        if (e.name !== 'AbortError') setResults([]);
      } finally { setLoading(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (r) => {
    if (!r) return;
    onPick?.({
      ticker: r.symbol,
      name: r.name,
      currency: r.currency || undefined,
      country: r.country || '',
      exchangeShortName: r.exchangeShortName || '',
    });
    setQuery(r.symbol);
    setOpen(false);
  };

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, Math.max(results.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      if (results[activeIdx]) { e.preventDefault(); pick(results[activeIdx]); }
    } else if (e.key === 'Escape') { setOpen(false); }
  };

  const term = (query || '').trim();
  const showDropdown = open && (term.length >= 2 || term.length === 0 || term.length === 1);
  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 240, flex: 1 }}>
      <input
        autoFocus
        placeholder="Buscar empresa: 'Unilever', 'Nestle', 'AAPL'…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)' }}
      />
      {/* Hint del nombre seleccionado debajo, sólo cuando hay match exacto y nombre */}
      {name && term && term.toUpperCase() === (value || '').toUpperCase() && (
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--fm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
      )}
      {showDropdown && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.45)', maxHeight: 320, overflowY: 'auto', zIndex: 20 }}>
          {term.length < 2 && (
            <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
              Escribe 2+ caracteres para buscar…
            </div>
          )}
          {term.length >= 2 && loading && (
            <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--gold)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
              Buscando…
            </div>
          )}
          {term.length >= 2 && !loading && results.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
              Sin resultados para "{term}".
            </div>
          )}
          {!loading && results.map((r, i) => {
            const active = i === activeIdx;
            // País: prefer el del backend (derived from exchangeShortName).
            // Fallback: getCountry() del frontend usa sufijo del ticker.
            const cc = r.country || (() => { try { return getCountry?.(r.symbol, r.currency) || ''; } catch { return ''; } })();
            const flag = cc ? (FLAGS?.[cc] || '') : '';
            return (
              <button
                key={r.symbol}
                type="button"
                onClick={() => pick(r)}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                  padding: '8px 12px', textAlign: 'left', cursor: 'pointer',
                  background: active ? 'rgba(200,164,78,0.10)' : 'transparent',
                  border: 'none',
                  borderBottom: i < results.length - 1 ? '1px solid var(--subtle-border, rgba(255,255,255,0.04))' : 'none',
                  fontFamily: 'var(--fm)', color: 'var(--text-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 14, lineHeight: 1, width: 20, display: 'inline-block' }}>{flag || '·'}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, color: active ? 'var(--gold)' : 'var(--text-primary)', fontSize: 12 }}>{r.symbol}</span>
                      {r.exchangeShortName && (
                        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', padding: '1px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                          {r.exchangeShortName}
                        </span>
                      )}
                      {r.currency && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{r.currency}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>
                      {r.name}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function BuyRadarTab() {
  const { openAnalysis, FLAGS, getCountry } = useHome();
  const [items, setItems] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);          // {ticker, target, name?, reason?, ccy?}
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ ticker: '', name: '', target: '', currency: 'USD', reason: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/buy-radar/list`);
      const d = await r.json();
      const list = d.items || [];
      setItems(list);
      // Pull live prices for all tickers in one batch
      if (list.length) {
        const tickers = list.map(x => x.ticker).join(',');
        try {
          const pr = await fetch(`${API_URL}/api/prices?tickers=${encodeURIComponent(tickers)}&live=1`);
          const pd = await pr.json();
          const map = {};
          for (const row of (pd.prices || pd.results || [])) {
            map[row.ticker || row.symbol] = row.price ?? row.lastPrice ?? null;
          }
          setLivePrices(map);
        } catch {}
      }
    } catch (e) {
      console.error('buy-radar/list failed', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onAdd = async () => {
    const ticker = (draft.ticker || '').trim().toUpperCase();
    const target = Number(draft.target);
    if (!ticker || !Number.isFinite(target) || target <= 0) {
      alert('Pon un ticker y un precio objetivo válido (>0).');
      return;
    }
    await postJSON('/api/buy-radar/add', {
      ticker,
      name: draft.name || null,
      target_price: target,
      currency: draft.currency,
      reason: draft.reason,
    });
    await ensureAlertRule(ticker, target);
    setShowAdd(false);
    setDraft({ ticker: '', name: '', target: '', currency: 'USD', reason: '' });
    await refresh();
  };

  const onUpdate = async (it) => {
    const target = Number(editing.target);
    if (!Number.isFinite(target) || target <= 0) { alert('Precio objetivo inválido'); return; }
    await postJSON('/api/buy-radar/update', {
      ticker: it.ticker,
      target_price: target,
      reason: editing.reason ?? it.reason,
      currency: editing.currency || it.currency,
    });
    if (editing.alert_active !== false) {
      await ensureAlertRule(it.ticker, target);
    }
    setEditing(null);
    await refresh();
  };

  const onDelete = async (ticker) => {
    if (!window.confirm(`Quitar ${ticker} del Radar?`)) return;
    await postJSON('/api/buy-radar/delete', { ticker });
    await refresh();
  };

  const onToggleAlert = async (it) => {
    const next = it.alert_active ? 0 : 1;
    await postJSON('/api/buy-radar/update', { ticker: it.ticker, alert_active: next });
    if (next) await ensureAlertRule(it.ticker, it.target_price);
    await refresh();
  };

  // ── Layout ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)' }}>
            🎯 Radar de compra
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Empresas concretas que quiero comprar a un precio objetivo. Cuando el precio cae al objetivo recibo alerta Telegram automática.
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--gold)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--fm)' }}
        >+ Añadir empresa</button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--gold)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <CompanySearchCombobox
              value={draft.ticker}
              name={draft.name}
              FLAGS={FLAGS}
              getCountry={getCountry}
              onPick={(p) => setDraft(d => ({
                ...d,
                ticker: p.ticker || '',
                name: p.name || '',
                currency: p.currency || d.currency,
              }))}
            />
            <input
              type="number" step="0.01"
              placeholder="Precio objetivo"
              value={draft.target}
              onChange={e => setDraft({ ...draft, target: e.target.value })}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)', width: 130 }}
            />
            <select
              value={draft.currency}
              onChange={e => setDraft({ ...draft, currency: e.target.value })}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)' }}
            >
              <option value="USD">USD $</option>
              <option value="EUR">EUR €</option>
              <option value="GBP">GBP £</option>
            </select>
            <input
              placeholder="Por qué (opcional)"
              value={draft.reason}
              onChange={e => setDraft({ ...draft, reason: e.target.value })}
              style={{ flex: 1, minWidth: 160, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)' }}
            />
            <button onClick={onAdd} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--green)', background: 'rgba(48,209,88,.12)', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
            <button onClick={() => { setShowAdd(false); setDraft({ ticker: '', name: '', target: '', currency: 'USD', reason: '' }); }} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer' }}>Cancelar</button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Escribe el nombre (ej. "Unilever") y elige el listing — verás todas las cotizaciones (UK, US ADR, NL…) con su bandera. Al guardar se crea una alerta <strong>price_below</strong> automática (Telegram + push).
          </div>
        </div>
      )}

      {/* List */}
      {loading && <div style={{ color: 'var(--text-tertiary)', fontSize: 12, padding: 20, textAlign: 'center' }}>Cargando...</div>}

      {!loading && items.length === 0 && (
        <EmptyState
          icon="🎯"
          title="Radar vacío"
          subtitle="Añade empresas concretas que quieras comprar a un precio objetivo. Cuando el precio caiga te aviso por Telegram."
        />
      )}

      {!loading && items.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--subtle-bg)' }}>
                <th style={th}>Empresa</th>
                <th style={th}>Precio actual</th>
                <th style={th}>Objetivo</th>
                <th style={th}>Distancia</th>
                <th style={th}>Estado</th>
                <th style={th}>Razón</th>
                <th style={{ ...th, textAlign: 'right' }}>·</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const live = livePrices[it.ticker];
                const target = it.target_price;
                const cur = it.currency === 'EUR' ? '€' : it.currency === 'GBP' ? '£' : '$';
                const dist = (live != null && target > 0) ? ((live - target) / target) * 100 : null;
                const inZone = live != null && live <= target;
                const flag = (() => { try { return FLAGS?.[getCountry?.(it.ticker)] || ''; } catch { return ''; } })();
                const isEditing = editing?.ticker === it.ticker;
                return (
                  <tr key={it.ticker} style={{ borderTop: '1px solid var(--border)', background: inZone ? 'rgba(48,209,88,.06)' : 'transparent' }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{flag}</span>
                        <button
                          onClick={() => openAnalysis?.(it.ticker)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)' }}>{it.ticker}</div>
                          {it.name && <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{it.name}</div>}
                        </button>
                      </div>
                    </td>
                    <td style={td}>
                      {live != null
                        ? <span style={{ fontFamily: 'var(--fm)', fontWeight: 700, color: 'var(--text-primary)' }}>{cur}{_sf(live, 2)}</span>
                        : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td style={td}>
                      {isEditing ? (
                        <input
                          type="number" step="0.01" autoFocus
                          value={editing.target}
                          onChange={e => setEditing({ ...editing, target: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') onUpdate(it); if (e.key === 'Escape') setEditing(null); }}
                          style={{ width: 90, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--gold)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--fm)' }}
                        />
                      ) : (
                        <button
                          onClick={() => setEditing({ ticker: it.ticker, target: target, reason: it.reason, currency: it.currency })}
                          title="Click para editar"
                          style={{ background: 'none', border: 'none', color: 'var(--gold)', fontFamily: 'var(--fm)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >{cur}{_sf(target, 2)}</button>
                      )}
                    </td>
                    <td style={td}>
                      {dist != null ? (
                        <span style={{ fontFamily: 'var(--fm)', fontWeight: 600, color: dist <= 0 ? 'var(--green)' : dist < 10 ? '#ffd60a' : 'var(--text-secondary)' }}>
                          {dist <= 0 ? '✅ ' : ''}{dist > 0 ? '+' : ''}{_sf(dist, 1)}%
                        </span>
                      ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => onToggleAlert(it)}
                        title={it.alert_active ? 'Alerta activa — click para desactivar' : 'Alerta inactiva — click para activar'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
                      >{it.alert_active ? '🔔' : '🔕'}</button>
                    </td>
                    <td style={{ ...td, color: 'var(--text-tertiary)', maxWidth: 220 }}>
                      {isEditing ? (
                        <input
                          placeholder="Razón…"
                          value={editing.reason || ''}
                          onChange={e => setEditing({ ...editing, reason: e.target.value })}
                          style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--fm)' }}
                        />
                      ) : (
                        <span style={{ fontStyle: it.reason ? 'normal' : 'italic' }}>{it.reason || '—'}</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <>
                          <button onClick={() => onUpdate(it)} style={btn('var(--green)')}>✓</button>
                          <button onClick={() => setEditing(null)} style={btn('var(--text-tertiary)')}>✕</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openAnalysis?.(it.ticker)} title="Ver análisis" style={btn('#5b9bd5')}>📊</button>
                          <button onClick={() => onDelete(it.ticker)} title="Quitar del Radar" style={btn('var(--red)')}>🗑</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          🔔 = alerta Telegram activa cuando precio ≤ objetivo · 🔕 = alerta desactivada · click en el precio objetivo para editarlo · click en el ticker para abrir análisis completo.
        </div>
      )}
    </div>
  );
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 0.5 };
const td = { padding: '8px 10px', fontSize: 11, color: 'var(--text-primary)', verticalAlign: 'middle' };
const btn = (color) => ({ marginLeft: 4, padding: '3px 8px', borderRadius: 6, border: `1px solid ${color}33`, background: 'transparent', color, fontSize: 11, cursor: 'pointer' });
