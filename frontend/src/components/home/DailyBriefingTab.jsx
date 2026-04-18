import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';
import { fmtUSD, fmtPct, fmtPctSigned } from '../../utils/formatters.js';
import { VerdictBadge } from '../ui/VerdictBadge.jsx';

// ─── Helpers ───────────────────────────────────────────────────────────
const card = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
};
const title = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: 'var(--gold)',
  marginBottom: 8,
  fontFamily: 'var(--fb)',
};
const mono = { fontFamily: 'var(--fm)', fontVariantNumeric: 'tabular-nums' };
const greetingByHour = (h) => {
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
};

function severityColor(sev) {
  if (sev === 'critical') return '#ef4444';
  if (sev === 'warning') return '#f59e0b';
  return 'var(--text-tertiary)';
}

function fgColor(score) {
  if (score == null) return 'var(--text-tertiary)';
  if (score <= 25) return '#ef4444';
  if (score <= 45) return '#f59e0b';
  if (score <= 55) return '#a3a3a3';
  if (score <= 75) return '#84cc16';
  return '#22c55e';
}

function deltaColor(v) {
  if (v == null || v === 0) return 'var(--text-tertiary)';
  return v > 0 ? '#22c55e' : '#ef4444';
}

// Tiny SVG sparkline for the NLV history strip
function Sparkline({ values, w = 110, h = 28, color = 'var(--gold)' }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

// Render Opus markdown-ish text into paragraphs
function MarkdownParas({ text }) {
  if (!text) return null;
  const paras = text.split(/\n\s*\n/).filter(Boolean);
  return paras.map((p, i) => (
    <p key={i} style={{ margin: '0 0 10px', lineHeight: 1.55, color: 'var(--text-secondary)', fontSize: 13 }}>
      {p.trim()}
    </p>
  ));
}

// ─── Tab ───────────────────────────────────────────────────────────────
export default function DailyBriefingTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [opusLoading, setOpusLoading] = useState(false);
  const [opusError, setOpusError] = useState(null);
  const [opusSummary, setOpusSummary] = useState(null);
  const abortRef = useRef(null);

  // Weekly Digest state — declared BEFORE the useEffects that reference them (TDZ rule)
  const [digest, setDigest] = useState(null);
  const [digestLoading, setDigestLoading] = useState(true);
  const [digestError, setDigestError] = useState(null);
  const [digestGenerating, setDigestGenerating] = useState(false);
  const [digestGenError, setDigestGenError] = useState(null);

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/briefing/daily`, { signal: ac.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
      if (j.opus_summary) setOpusSummary(j.opus_summary);
    } catch (e) {
      if (e.name !== 'AbortError') setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  const generateOpus = useCallback(async () => {
    setOpusLoading(true);
    setOpusError(null);
    try {
      const r = await fetch(`${API_URL}/api/briefing/generate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ briefing: data }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
      }
      const j = await r.json();
      setOpusSummary(j.summary || '');
    } catch (e) {
      setOpusError(String(e.message || e));
    } finally {
      setOpusLoading(false);
    }
  }, [data]);

  const loadDigest = useCallback(async () => {
    setDigestLoading(true);
    setDigestError(null);
    try {
      const r = await fetch(`${API_URL}/api/digest/weekly/latest`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setDigest(j.digest || null);
    } catch (e) {
      setDigestError(String(e.message || e));
    } finally {
      setDigestLoading(false);
    }
  }, []);

  const generateDigest = useCallback(async () => {
    setDigestGenerating(true);
    setDigestGenError(null);
    try {
      const token = localStorage.getItem('ayr_worker_token') || '';
      const r = await fetch(`${API_URL}/api/digest/weekly/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
      }
      const j = await r.json();
      if (j.ok) setDigest(j);
    } catch (e) {
      setDigestGenError(String(e.message || e));
    } finally {
      setDigestGenerating(false);
    }
  }, []);

  // useEffects DESPUÉS de los useCallbacks (TDZ: los callbacks deben estar
  // declarados antes de los effects que los referencian — Vite minifier los
  // hoista pero no las inicializaciones).
  useEffect(() => {
    load();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [load]);

  useEffect(() => { loadDigest(); }, [loadDigest]);

  // ─── Skeleton ─────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ ...card, marginBottom: 12, height: 90, opacity: 0.5 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
          {[0, 1, 2, 3].map(i => <div key={i} style={{ ...card, height: 80, opacity: 0.5 }} />)}
        </div>
        <div style={{ ...card, height: 200, opacity: 0.5 }} />
      </div>
    );
  }

  if (error) {
    return <div style={{ padding: 16, color: '#ef4444' }}>Error: {error}</div>;
  }
  if (!data) return null;

  const { portfolio, market, top_movers, critical_alerts, upcoming_earnings,
          new_filings, upcoming_dividends, pending_actions, date,
          research_investigations } = data;

  const verdictColor = (v) => v === 'ADD' ? '#22c55e'
    : v === 'SELL' ? '#ef4444'
    : v === 'TRIM' ? '#f59e0b'
    : v === 'HOLD' ? '#64d2ff'
    : 'var(--text-secondary)';

  const nlvValues = (portfolio?.nlv_history || []).map(p => Number(p.nlv) || 0);

  // ─── Hero ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 16, maxWidth: 1280, margin: '0 auto' }}>

      {/* WEEKLY DIGEST */}
      <div style={{
        ...card,
        background: 'linear-gradient(135deg, rgba(200,164,78,0.08), rgba(200,164,78,0.02))',
        borderColor: 'rgba(200,164,78,0.4)',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={title}>Digest Semanal (lunes)</div>
            {digest?.week_start && (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Semana del {digest.week_start}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={loadDigest}
              disabled={digestLoading}
              style={{
                padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-secondary)',
                fontSize: 11, cursor: digestLoading ? 'wait' : 'pointer', fontFamily: 'var(--fb)',
              }}
            >{digestLoading ? 'Cargando…' : 'Actualizar'}</button>
            <button
              onClick={generateDigest}
              disabled={digestGenerating}
              style={{
                padding: '7px 14px', borderRadius: 6,
                border: '1px solid var(--gold)',
                background: digestGenerating ? 'transparent' : 'var(--gold)',
                color: digestGenerating ? 'var(--gold)' : '#0a0a0a',
                fontSize: 11, fontWeight: 700,
                cursor: digestGenerating ? 'wait' : 'pointer', fontFamily: 'var(--fb)',
              }}
            >{digestGenerating ? 'Generando…' : 'Regenerar digest'}</button>
          </div>
        </div>

        {digestError && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>Error: {digestError}</div>}
        {digestGenError && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>Error al generar: {digestGenError}</div>}

        {digestLoading && !digest && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Cargando digest…</div>
        )}

        {!digestLoading && !digest && !digestError && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
            No hay digest esta semana. Pulsa "Regenerar digest" para crear uno.
          </div>
        )}

        {digest && (
          <div>
            {/* Opus intro paragraph */}
            {digest.opus_intro && (
              <div style={{
                fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
                borderLeft: '3px solid var(--gold)', paddingLeft: 12, marginBottom: 14,
              }}>
                {digest.opus_intro}
              </div>
            )}

            {/* Portfolio KPIs */}
            {digest.portfolio && (
              <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>NLV</div>
                  <div style={{ ...mono, fontSize: 15, fontWeight: 700 }}>
                    {digest.portfolio.nlv ? `$${Math.round(digest.portfolio.nlv).toLocaleString('en-US')}` : '—'}
                  </div>
                  {digest.portfolio.nlv_delta_pct != null && (
                    <div style={{ ...mono, fontSize: 11, color: digest.portfolio.nlv_delta_pct >= 0 ? '#22c55e' : '#ef4444' }}>
                      {digest.portfolio.nlv_delta_pct >= 0 ? '+' : ''}{digest.portfolio.nlv_delta_pct.toFixed(2)}% semana
                    </div>
                  )}
                </div>
                {digest.portfolio.div_week > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Dividendos cobrados</div>
                    <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: '#22c55e' }}>
                      ${Number(digest.portfolio.div_week).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5 Actions */}
            {Array.isArray(digest.actions) && digest.actions.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...title, marginBottom: 10 }}>5 acciones esta semana</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {digest.actions.slice(0, 5).map((a, i) => {
                    const labelColors = {
                      SELL: '#ef4444', TRIM: '#f59e0b', BUY: '#22c55e', CANTERA: '#84cc16',
                      EARNINGS: '#60a5fa', ALERTA: '#f59e0b', RIESGO: '#ef4444', INFO: '#6b7280', DIVIDENDO: '#22c55e',
                    };
                    const lc = labelColors[a.label] || 'var(--gold)';
                    return (
                      <div key={i} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        padding: '7px 10px', borderRadius: 7,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border)',
                      }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                          background: lc + '1a', color: lc, border: `1px solid ${lc}`,
                          textTransform: 'uppercase', flexShrink: 0, marginTop: 1,
                        }}>{a.label}</span>
                        {a.ticker && (
                          <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: 'var(--gold)', minWidth: 44, flexShrink: 0 }}>{a.ticker}</span>
                        )}
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, lineHeight: 1.4 }}>{a.description}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                Generado: {digest.created_at ? new Date(digest.created_at.replace(' ', 'T') + 'Z').toLocaleString('es-ES') : ''}
              </div>
              {digest.md && (
                <button
                  onClick={() => {
                    const blob = new Blob([digest.md], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `digest-${digest.week_start}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    fontSize: 10, padding: '3px 10px', borderRadius: 5,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-tertiary)', cursor: 'pointer',
                  }}
                >Descargar .md</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* HERO */}
      <div style={{
        ...card,
        background: 'linear-gradient(135deg, rgba(200,164,78,0.12), rgba(200,164,78,0.03))',
        borderColor: 'rgba(200,164,78,0.35)',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Daily Briefing · {date}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold)', marginTop: 4 }}>
            {greetingByHour(new Date().getHours())} ☀️
          </div>
        </div>
        <button
          onClick={generateOpus}
          disabled={opusLoading}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid var(--gold)',
            background: opusLoading ? 'transparent' : 'var(--gold)',
            color: opusLoading ? 'var(--gold)' : '#0a0a0a',
            fontWeight: 700,
            fontSize: 12,
            cursor: opusLoading ? 'wait' : 'pointer',
            fontFamily: 'var(--fb)',
          }}
        >
          {opusLoading ? '⏳ Opus pensando…' : '🧠 Generar resumen IA'}
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
        <div style={card}>
          <div style={title}>Valor cartera</div>
          <div style={{ ...mono, fontSize: 18, fontWeight: 700 }}>{fmtUSD(portfolio?.total_value_usd)}</div>
          <div style={{ ...mono, fontSize: 12, color: deltaColor(portfolio?.day_change_usd), marginTop: 2 }}>
            {portfolio?.day_change_usd != null
              ? (portfolio.day_change_usd >= 0 ? '+' : '-') + fmtUSD(Math.abs(portfolio.day_change_usd))
              : '—'}
            {' · '}
            {fmtPctSigned(portfolio?.day_change_pct)}
          </div>
        </div>
        <div style={card}>
          <div style={title}>VIX</div>
          <div style={{ ...mono, fontSize: 18, fontWeight: 700 }}>
            {market?.vix != null ? market.vix.toFixed(2) : '—'}
          </div>
          <div style={{ ...mono, fontSize: 12, color: deltaColor(market?.vix_change_pct), marginTop: 2 }}>
            {fmtPctSigned(market?.vix_change_pct)}
          </div>
        </div>
        <div style={card}>
          <div style={title}>Fear &amp; Greed</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: fgColor(market?.fear_greed_score) }}>
              {market?.fear_greed_score ?? '—'}
            </div>
            <div style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 999,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${fgColor(market?.fear_greed_score)}`,
              color: fgColor(market?.fear_greed_score),
              fontWeight: 600,
            }}>
              {market?.fear_greed_label || 'N/A'}
            </div>
          </div>
        </div>
        <div style={card}>
          <div style={title}>SPY día</div>
          <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: deltaColor(market?.spy_change_pct) }}>
            {fmtPctSigned(market?.spy_change_pct)}
          </div>
          {nlvValues.length >= 2 && (
            <div style={{ marginTop: 4 }}>
              <Sparkline values={nlvValues} w={140} h={20} />
            </div>
          )}
        </div>
      </div>

      {/* Research Agent verdicts — máxima prioridad, investigaron en profundidad */}
      {research_investigations && research_investigations.length > 0 && (
        <div style={{
          ...card, marginBottom: 12,
          background: 'linear-gradient(135deg, rgba(100,210,255,0.06), rgba(100,210,255,0.02))',
          borderColor: 'rgba(100,210,255,0.4)',
        }}>
          <div style={title}>🔬 Research Agent — veredictos de hoy</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {research_investigations.slice(0, 5).map((r) => (
              <div key={r.id} style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'var(--subtle-bg)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{r.ticker}</span>
                  <VerdictBadge verdict={r.final_verdict} confidence={r.confidence} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {r.trigger_reason === 'auto_contradiction' ? '🤖 auto' : '✋ manual'} · {r.duration_s?.toFixed?.(0) || '—'}s · ${r.cost_usd?.toFixed?.(2) || '—'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {r.summary}
                </div>
                {r.evidence && r.evidence.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 10, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                      {r.evidence.length} evidencias citadas ▾
                    </summary>
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {r.evidence.slice(0, 5).map((e, idx) => (
                        <div key={idx} style={{ fontSize: 11, color: 'var(--text-secondary)', paddingLeft: 10, borderLeft: '2px solid var(--gold)' }}>
                          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>[{e.type}]</span>{' '}
                          <span style={{ fontStyle: 'italic' }}>"{e.snippet}"</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical alerts */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={title}>Alertas críticas hoy</div>
        {(!critical_alerts || critical_alerts.length === 0) ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>✓ Sin alertas críticas hoy</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {critical_alerts.slice(0, 12).map((a, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '6px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  background: severityColor(a.severity) + '22',
                  color: severityColor(a.severity),
                  border: `1px solid ${severityColor(a.severity)}`,
                  textTransform: 'uppercase', flexShrink: 0, marginTop: 2,
                }}>{a.severity}</span>
                {a.ticker && a.ticker !== '_GLOBAL_' && (
                  <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: 'var(--gold)', minWidth: 50 }}>
                    {a.ticker}
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{a.message}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{a.agent_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Two-column: movers + pending actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={card}>
          <div style={title}>Top movers</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: '#22c55e', marginBottom: 4, fontWeight: 700 }}>↑ UP</div>
              {(top_movers?.up || []).map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                  <span style={{ ...mono, fontWeight: 600 }}>{m.ticker}</span>
                  <span style={{ ...mono, color: '#22c55e' }}>{fmtPctSigned(m.change_pct)}</span>
                </div>
              ))}
              {(!top_movers?.up || top_movers.up.length === 0) && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#ef4444', marginBottom: 4, fontWeight: 700 }}>↓ DOWN</div>
              {(top_movers?.down || []).map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                  <span style={{ ...mono, fontWeight: 600 }}>{m.ticker}</span>
                  <span style={{ ...mono, color: '#ef4444' }}>{fmtPctSigned(m.change_pct)}</span>
                </div>
              ))}
              {(!top_movers?.down || top_movers.down.length === 0) && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</div>
              )}
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={title}>Pending actions</div>
          {(!pending_actions || pending_actions.length === 0) ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>✓ Nada que hacer hoy</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pending_actions.map((p, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{
                      ...mono, fontSize: 12, fontWeight: 700, color: 'var(--gold)'
                    }}>{p.ticker}</span>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(200,164,78,0.15)', color: 'var(--gold)',
                      border: '1px solid var(--gold)', fontWeight: 700,
                      textTransform: 'uppercase',
                    }}>{p.action}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                      {p.source_agent}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Calendar strip — 7 days */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={title}>Próximos 7 días</div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {Array.from({ length: 7 }).map((_, di) => {
            const d = new Date(Date.now() + di * 86400000);
            const iso = d.toISOString().slice(0, 10);
            const label = d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
            const earningsToday = (upcoming_earnings || []).filter(e => e.report_date === iso);
            const divsToday = (upcoming_dividends || []).filter(x => x.payment_date === iso);
            return (
              <div key={di} style={{
                minWidth: 130, padding: 8, borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                fontSize: 11,
              }}>
                <div style={{ fontWeight: 700, color: 'var(--gold)', marginBottom: 6, fontSize: 11 }}>{label}</div>
                {earningsToday.map((e, i) => (
                  <div key={`e${i}`} style={{ ...mono, fontSize: 10, marginBottom: 2 }}>
                    📅 <strong>{e.ticker}</strong>
                    {e.portfolio_weight_pct > 0 && <span style={{ color: 'var(--text-tertiary)' }}> · {fmtPct(e.portfolio_weight_pct)}</span>}
                  </div>
                ))}
                {divsToday.map((x, i) => (
                  <div key={`d${i}`} style={{ ...mono, fontSize: 10, marginBottom: 2 }}>
                    💰 <strong>{x.ticker}</strong>
                  </div>
                ))}
                {earningsToday.length === 0 && divsToday.length === 0 && (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>—</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* New filings */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={title}>Nuevos filings (48h)</div>
        {(!new_filings || new_filings.length === 0) ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Sin nuevos filings</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {new_filings.map((f, i) => (
              <div key={i} style={{
                padding: '4px 10px', borderRadius: 6,
                border: '1px solid var(--border)',
                fontSize: 11, ...mono,
                cursor: 'pointer',
              }}
                title={`${f.doc_type} · ${f.filing_date || ''}`}
                onClick={() => {
                  // best-effort: tell HomeView to switch tabs
                  try {
                    localStorage.setItem('archive_jump_ticker', f.ticker);
                    window.dispatchEvent(new CustomEvent('home-tab-change', { detail: 'earnings-archive' }));
                  } catch {}
                }}>
                <strong style={{ color: 'var(--gold)' }}>{f.ticker}</strong>
                <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>{f.doc_type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Opus commentary */}
      {(opusSummary || opusError) && (
        <div style={{ ...card, borderColor: 'rgba(200,164,78,0.5)' }}>
          <div style={title}>🧠 Comentario Opus</div>
          {opusError && <div style={{ color: '#ef4444', fontSize: 12 }}>Error: {opusError}</div>}
          {opusSummary && <div><MarkdownParas text={opusSummary} /></div>}
        </div>
      )}
    </div>
  );
}
