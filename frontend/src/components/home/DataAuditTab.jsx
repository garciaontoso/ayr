// 🩺 Data Audit — recorre todas las posiciones del portfolio y muestra
// qué campos están vacíos, stale o inconsistentes contra FMP. Construido
// 2026-05-03 para que el usuario vea TODOS los problemas de datos sin
// tener que descubrirlos uno a uno abriendo cada empresa.
//
// Backend: /api/audit/portfolio (GET)
// Auto-fix: /api/audit/portfolio/auto-fix (POST) — sincroniza
// positions.sector con FMP profile.sector para mismatches.

import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';
import { useHome } from '../../context/HomeContext';

const SEV_COLOR = { red: '#ff453a', yellow: '#ffd60a', green: '#30d158' };
const SEV_BG = { red: 'rgba(255,69,58,.1)', yellow: 'rgba(255,214,10,.1)', green: 'rgba(48,209,88,.1)' };

export default function DataAuditTab() {
  const { openAnalysis } = useHome();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [filter, setFilter] = useState('all');  // all | red | yellow | green
  const [expanded, setExpanded] = useState({});

  const [fullAudit, setFullAudit] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${API_URL}/api/audit/portfolio`),
        fetch(`${API_URL}/api/audit/full`),
      ]);
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      setData(d1);
      setFullAudit(d2);
    } catch (e) {
      console.error('audit failed', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onAutoFix = async () => {
    if (!window.confirm('Sincronizar positions.sector con FMP para los mismatches detectados?')) return;
    setFixing(true);
    try {
      const r = await fetch(`${API_URL}/api/audit/portfolio/auto-fix`, { method: 'POST' });
      const d = await r.json();
      alert(`✅ ${d.fixed_sector} sectores corregidos · ${d.skipped} omitidos`);
      await refresh();
    } catch (e) { alert('Error: ' + e.message); }
    setFixing(false);
  };

  const toggle = (t) => setExpanded(p => ({ ...p, [t]: !p[t] }));

  if (loading) return <div style={{ padding: 30, color: 'var(--text-tertiary)' }}>Auditando portfolio…</div>;
  if (!data?.audit) return <div style={{ padding: 30, color: 'var(--red)' }}>Error cargando audit</div>;

  const { summary, audit } = data;
  const filtered = filter === 'all' ? audit : audit.filter(a => a.status === filter);
  filtered.sort((a, b) => b.issue_count - a.issue_count);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header con resumen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)' }}>
            🩺 Data Audit · {summary.total} posiciones
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Recorre TODOS los tickers y reporta campos vacíos, stale o inconsistentes contra FMP.
            Generado: {data.generated_at?.slice(0, 19).replace('T', ' ')} UTC
          </div>
        </div>
        <button onClick={refresh} disabled={loading} style={btnStyle('var(--text-secondary)')}>
          ↻ Refrescar
        </button>
        <button onClick={onAutoFix} disabled={fixing} style={btnStyle('var(--gold)', true)}>
          {fixing ? '⏳ Arreglando…' : '🔧 Auto-fix sectores'}
        </button>
      </div>

      {/* Pills de filtro */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { k: 'all', lbl: `Todos (${summary.total})`, c: 'var(--text-secondary)' },
          { k: 'red', lbl: `🔴 Rojos (${summary.red})`, c: SEV_COLOR.red },
          { k: 'yellow', lbl: `🟡 Amarillos (${summary.yellow})`, c: SEV_COLOR.yellow },
          { k: 'green', lbl: `🟢 Verdes (${summary.green})`, c: SEV_COLOR.green },
        ].map(p => {
          const active = filter === p.k;
          return (
            <button key={p.k} onClick={() => setFilter(p.k)}
              style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${active ? p.c : 'var(--border)'}`, background: active ? `${p.c}1A` : 'transparent', color: active ? p.c : 'var(--text-tertiary)', fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--fm)' }}>
              {p.lbl}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
          {summary.total_issues} issues totales
        </span>
      </div>

      {/* Lista */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {filtered.map((a, i) => {
          const isOpen = expanded[a.ticker];
          return (
            <div key={a.ticker} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--subtle-bg2)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: SEV_BG[a.status], transition: 'background .15s' }}
                onClick={() => toggle(a.ticker)}>
                <span style={{ fontSize: 16 }}>{a.status === 'red' ? '🔴' : a.status === 'yellow' ? '🟡' : '🟢'}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)', minWidth: 100 }}>{a.ticker}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', minWidth: 80 }}>{a.shares} shares</span>
                {a.account && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', padding: '2px 5px', borderRadius: 3, background: 'rgba(255,255,255,.04)' }}>{a.account}</span>}
                <span style={{ flex: 1 }}/>
                {a.fund_age_hours != null && (
                  <span style={{ fontSize: 9, color: a.fund_age_hours > 24 ? '#ffd60a' : 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                    {a.fund_age_hours}h
                  </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, color: SEV_COLOR[a.status], fontFamily: 'var(--fm)', minWidth: 80, textAlign: 'right' }}>
                  {a.issue_count} issue{a.issue_count !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{isOpen ? '▾' : '▸'}</span>
              </div>
              {isOpen && (
                <div style={{ padding: '8px 14px 14px', background: 'rgba(0,0,0,.15)' }}>
                  {a.issues.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--green)', fontStyle: 'italic' }}>✓ Sin issues</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {a.issues.map((it, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'var(--fm)' }}>
                          <span style={{ display: 'inline-block', width: 60, fontSize: 9, color: SEV_COLOR[it.sev], textTransform: 'uppercase', fontWeight: 700 }}>{it.sev}</span>
                          <span style={{ width: 110, color: 'var(--text-tertiary)' }}>{it.field}</span>
                          <span style={{ flex: 1, color: 'var(--text-primary)' }}>{it.msg}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 8 }}>
                        <button onClick={(e) => { e.stopPropagation(); openAnalysis?.(a.ticker); }}
                          style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid var(--gold)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--fm)' }}>
                          Abrir análisis →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Audit FULL — issues por categoría más allá de positions */}
      {fullAudit?.summary && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)', marginBottom: 8 }}>
            🔬 Audit completo · {fullAudit.summary.total_issues} issues en otras tablas
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8 }}>
            {Object.entries(fullAudit.summary.by_category || {}).map(([cat, n]) => {
              const issues = fullAudit.issues?.[cat] || [];
              const hasRed = issues.some(i => i.sev === 'red');
              const color = n === 0 ? SEV_COLOR.green : hasRed ? SEV_COLOR.red : SEV_COLOR.yellow;
              return (
                <div key={cat} style={{ padding: '8px 10px', background: `${color}10`, border: `1px solid ${color}33`, borderRadius: 8 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--fm)' }}>{n}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>issues</div>
                </div>
              );
            })}
          </div>
          {/* Issues detallados por categoría */}
          {Object.entries(fullAudit.issues || {}).map(([cat, list]) => {
            if (!list.length) return null;
            return (
              <details key={cat} style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'var(--fm)', padding: '4px 0' }}>
                  {cat} · {list.length} issues
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, maxHeight: 280, overflowY: 'auto' }}>
                  {list.slice(0, 50).map((it, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontFamily: 'var(--fm)', padding: '3px 8px', background: 'rgba(0,0,0,.15)', borderRadius: 4 }}>
                      <span style={{ fontSize: 10 }}>{it.sev === 'red' ? '🔴' : '🟡'}</span>
                      <span style={{ width: 90, fontWeight: 700, color: 'var(--text-primary)' }}>{it.ticker}</span>
                      <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{it.msg}</span>
                    </div>
                  ))}
                  {list.length > 50 && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic', padding: 6 }}>... y {list.length - 50} más</div>}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {/* Footer info */}
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic', textAlign: 'center' }}>
        🟢 todos los campos OK · 🟡 algún campo vacío o stale · 🔴 datos críticos faltantes
        <br />🩺 Cron automático diario 10:00 Madrid · Telegram alert si hay regresión vs día anterior
      </div>
    </div>
  );
}

function btnStyle(color, filled) {
  return {
    padding: '6px 14px',
    borderRadius: 7,
    border: `1px solid ${color}`,
    background: filled ? `${color}1A` : 'transparent',
    color,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--fm)',
  };
}
