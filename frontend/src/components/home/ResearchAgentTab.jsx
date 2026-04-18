import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../../constants/index.js';

// ═══════════════════════════════════════════════════════════════
// Research Agent Tab — A&R v4.1
// Lanza investigaciones Opus multi-step sobre tickers del portfolio.
// Coste ~$1-1.50 por investigación, 60-90s por run.
// ═══════════════════════════════════════════════════════════════

// ─── Constantes de estilo ──────────────────────────────────────
const FM = 'var(--fm)';
const FB = 'var(--fb)';
const FD = 'var(--fd)';

// Verdict → color
function verdictColor(v) {
  if (!v) return 'var(--text-tertiary)';
  if (v === 'ADD')  return '#30d158';
  if (v === 'HOLD') return 'var(--gold)';
  if (v === 'TRIM') return '#ff9f0a';
  if (v === 'SELL') return '#ff453a';
  if (v === 'NEEDS_HUMAN') return '#64d2ff';
  return 'var(--text-secondary)';
}

// Confidence → badge label
function confLabel(c) {
  if (!c) return '—';
  if (c === 'high')   return 'Alta';
  if (c === 'medium') return 'Media';
  if (c === 'low')    return 'Baja';
  return c;
}

// Evidence type → icono
function evidenceIcon(t) {
  const map = {
    fundamentals: '📊', transcript: '🎤', long_term: '📅',
    agent_insight: '🤖', peer: '⚖️', sec: '📋', db: '🗄',
  };
  return map[t] || '🔍';
}

// Formatear fecha ISO → "18 abr · 14:32"
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const mon = months[d.getMonth()];
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${day} ${mon} · ${hh}:${mm}`;
  } catch { return iso.slice(0,10); }
}

// Formatear coste en USD
function fmtCost(c) {
  if (c == null) return '—';
  if (c < 0.01) return '<$0.01';
  return `$${Number(c).toFixed(2)}`;
}

// ─── Sub-componente: Pill de vista ────────────────────────────
// hoisted (no state dep) → sin realloc por render
const PILL_STYLE_ACTIVE = {
  padding: '6px 16px', borderRadius: 8,
  border: '1px solid var(--gold)', background: 'var(--gold-dim)',
  color: 'var(--gold)', fontSize: 11, fontWeight: 700,
  cursor: 'pointer', fontFamily: FM, transition: 'all .15s',
};
const PILL_STYLE_INACTIVE = {
  padding: '6px 16px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 500,
  cursor: 'pointer', fontFamily: FM, transition: 'all .15s',
};

// ─── Sub-componente: Verdict Badge ────────────────────────────
// Border + background for visual weight (anterior versión apenas se distinguía
// del texto plano — 2026-04-18 audit feedback).
function VerdictBadge({ verdict, large }) {
  const color = verdictColor(verdict);
  return (
    <span style={{
      display: 'inline-block',
      padding: large ? '4px 14px' : '2px 10px',
      borderRadius: 5,
      background: `${color}22`,
      color,
      border: `1px solid ${color}`,
      fontSize: large ? 14 : 10,
      fontWeight: 800,
      fontFamily: FM,
      letterSpacing: large ? .5 : .3,
      whiteSpace: 'nowrap',
    }}>
      {verdict || '—'}
    </span>
  );
}

// ─── Sub-componente: Tool Call Trail ─────────────────────────
function ToolTrail({ toolCalls }) {
  const [open, setOpen] = useState(false);
  if (!toolCalls || toolCalls.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '5px 12px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 600,
          cursor: 'pointer', fontFamily: FM,
        }}
      >
        {open ? '▲' : '▼'} {toolCalls.length} tool calls
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {toolCalls.map((tc, i) => (
            <div key={i} style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--subtle-bg)', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', fontFamily: FM }}>
                  #{tc.iteration || i + 1}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FM }}>
                  {tc.tool}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM }}>
                  {tc.args ? JSON.stringify(tc.args).slice(0, 80) : ''}
                </span>
              </div>
              {tc.resultPreview && (
                <div style={{
                  fontSize: 9, color: 'var(--text-secondary)', fontFamily: FM,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: .8,
                }}>
                  {tc.resultPreview.slice(0, 200)}
                  {tc.resultPreview.length > 200 ? '…' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-componente: Evidence List ───────────────────────────
function EvidenceList({ evidence }) {
  if (!evidence || evidence.length === 0) return (
    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FM }}>Sin evidencia registrada</div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {evidence.map((ev, i) => (
        <div key={i} style={{
          padding: '10px 14px', borderRadius: 10,
          background: 'var(--subtle-bg)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12 }}>{evidenceIcon(ev.type)}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase', letterSpacing: .5 }}>
              {ev.type}
            </span>
            <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: FM }}>
              {ev.citation}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: FB, lineHeight: 1.5 }}>
            {ev.snippet}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Vista: Detalle de una investigación ─────────────────────
function DetailView({ investigation, onBack }) {
  if (!investigation) return null;
  const vc = verdictColor(investigation.verdict);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', fontFamily: FM,
        }}
      >
        ← Volver a lista
      </button>

      {/* Header card */}
      <div style={{
        padding: '20px 24px', borderRadius: 16,
        background: 'var(--card)', border: `1px solid ${vc}30`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', fontFamily: FM }}>
            {investigation.ticker || '—'}
          </span>
          <VerdictBadge verdict={investigation.verdict} large />
          {investigation.confidence && (
            <span style={{
              fontSize: 10, padding: '3px 10px', borderRadius: 6,
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontFamily: FM, fontWeight: 600,
            }}>
              Confianza: {confLabel(investigation.confidence)}
            </span>
          )}
        </div>

        {/* Resumen */}
        {investigation.summary && (
          <div style={{
            fontSize: 13, color: 'var(--text-primary)', fontFamily: FB,
            lineHeight: 1.6, marginBottom: 12,
          }}>
            {investigation.summary}
          </div>
        )}

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { lbl: 'FECHA', val: fmtDate(investigation.started_at) },
            { lbl: 'DURACIÓN', val: investigation.duration_s ? `${investigation.duration_s}s` : '—' },
            { lbl: 'COSTE', val: fmtCost(investigation.cost_usd) },
            { lbl: 'TOOL CALLS', val: investigation.total_tool_calls ?? investigation.tool_calls?.length ?? '—' },
            { lbl: 'STOP', val: investigation.stop_reason || investigation.stopReason || '—' },
          ].map(({ lbl, val }) => (
            <div key={lbl}>
              <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, letterSpacing: .5, marginBottom: 2 }}>{lbl}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: FM, fontWeight: 600 }}>{String(val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pregunta original */}
      {investigation.question && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(200,164,78,.06)', border: '1px solid rgba(200,164,78,.2)',
        }}>
          <div style={{ fontSize: 9, color: 'var(--gold)', fontFamily: FM, letterSpacing: .5, marginBottom: 4 }}>PREGUNTA ORIGINAL</div>
          <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: FB, lineHeight: 1.5 }}>{investigation.question}</div>
        </div>
      )}

      {/* Evidencia */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: FM, letterSpacing: .5, marginBottom: 10, textTransform: 'uppercase' }}>
          Evidencia citada
        </div>
        <EvidenceList evidence={investigation.evidence || investigation.evidence_json} />
      </div>

      {/* Tool trail */}
      <ToolTrail toolCalls={investigation.tool_calls || investigation.tool_calls_json} />
    </div>
  );
}

// ─── Vista: Lista de investigaciones ─────────────────────────
function ListView({ items, loading, onSelect, onLaunch }) {
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          height: 64, borderRadius: 12, background: 'var(--card)',
          opacity: 0.6, animation: 'pulse 1.5s infinite',
          animationDelay: `${i * 0.15}s`,
        }} />
      ))}
    </div>
  );

  if (!items || items.length === 0) return (
    <div style={{
      padding: '40px 24px', textAlign: 'center',
      border: '1px dashed var(--border)', borderRadius: 16,
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: FB, marginBottom: 12 }}>
        No hay investigaciones todavía
      </div>
      <button
        onClick={onLaunch}
        style={{
          padding: '10px 24px', borderRadius: 10,
          border: '1px solid var(--gold)', background: 'var(--gold-dim)',
          color: 'var(--gold)', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: FM,
        }}
      >
        🔬 Lanzar primera investigación
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((inv, i) => {
        const vc = verdictColor(inv.verdict);
        return (
          <div
            key={inv.id || i}
            onClick={() => onSelect(inv)}
            style={{
              padding: '12px 16px', borderRadius: 12,
              background: 'var(--card)',
              border: `1px solid ${vc}25`,
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 12,
              transition: 'all .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = vc}
            onMouseLeave={e => e.currentTarget.style.borderColor = `${vc}25`}
          >
            {/* Ticker + verdict */}
            <div style={{ minWidth: 80 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)', fontFamily: FM }}>
                {inv.ticker || '—'}
              </div>
              <VerdictBadge verdict={inv.verdict} />
            </div>

            {/* Summary truncado */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11, color: 'var(--text-primary)', fontFamily: FB,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {inv.summary || inv.question || 'Sin resumen'}
              </div>
              {inv.question && inv.summary && (
                <div style={{
                  fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2,
                }}>
                  {inv.question.slice(0, 80)}{inv.question.length > 80 ? '…' : ''}
                </div>
              )}
            </div>

            {/* Meta: confianza + coste + fecha */}
            <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM }}>
                {confLabel(inv.confidence)} · {fmtCost(inv.cost_usd)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM }}>
                {fmtDate(inv.started_at || inv.created_at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Vista: Lanzar investigación ─────────────────────────────
function LaunchView({ onResult }) {
  const [ticker, setTicker] = useState('');
  const [question, setQuestion] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const handleLaunch = useCallback(async () => {
    const t = ticker.trim().toUpperCase();
    if (!t) { setError('Escribe un ticker'); return; }
    setError(null);
    setRunning(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const body = { ticker: t };
      if (question.trim()) body.question = question.trim();

      const resp = await fetch(`${API_URL}/api/research-agent`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => resp.statusText);
        throw new Error(`Error ${resp.status}: ${txt.slice(0, 200)}`);
      }

      const data = await resp.json();
      onResult(data);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setRunning(false);
    }
  }, [ticker, question, onResult]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 600 }}>
      {/* Ticker */}
      <div>
        <label style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM, letterSpacing: .5, display: 'block', marginBottom: 6 }}>
          TICKER *
        </label>
        <input
          type="text"
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          placeholder="KO, ABBV, 0388.HK..."
          disabled={running}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            background: 'var(--subtle-bg)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: 13, fontFamily: FM,
            outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--gold)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
          onKeyDown={e => { if (e.key === 'Enter' && !running) handleLaunch(); }}
        />
      </div>

      {/* Pregunta opcional */}
      <div>
        <label style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM, letterSpacing: .5, display: 'block', marginBottom: 6 }}>
          PREGUNTA (OPCIONAL)
        </label>
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          disabled={running}
          placeholder="¿Es seguro el dividendo después del recorte de guidance? ¿Vale la pena añadir aquí? ..."
          rows={3}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            background: 'var(--subtle-bg)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: 12, fontFamily: FB,
            outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
          }}
          onFocus={e => e.target.style.borderColor = 'var(--gold)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM, marginTop: 4 }}>
          Si se deja en blanco, el agente formula la pregunta por defecto para el ticker.
        </div>
      </div>

      {/* Warning de coste */}
      <div style={{
        padding: '10px 14px', borderRadius: 10,
        background: 'rgba(200,164,78,.06)', border: '1px solid rgba(200,164,78,.2)',
      }}>
        <div style={{ fontSize: 10, color: 'var(--gold)', fontFamily: FM, fontWeight: 600 }}>
          ⚠ Coste estimado: $1.00–$1.50 · Duración: 60–90s
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM, marginTop: 3 }}>
          Opus analiza agent insights, fundamentales, transcripts y datos históricos. No lanzar más de 1-2 por día.
        </div>
      </div>

      {/* Botón */}
      {!running && (
        <button
          onClick={handleLaunch}
          disabled={!ticker.trim()}
          style={{
            padding: '12px 28px', borderRadius: 10, alignSelf: 'flex-start',
            border: '1px solid var(--gold)', background: 'var(--gold-dim)',
            color: !ticker.trim() ? 'var(--text-tertiary)' : 'var(--gold)',
            fontSize: 13, fontWeight: 700, cursor: !ticker.trim() ? 'not-allowed' : 'pointer',
            fontFamily: FM, opacity: !ticker.trim() ? 0.5 : 1,
          }}
        >
          🔬 Investigar {ticker || '…'}
        </button>
      )}

      {/* Spinner */}
      {running && (
        <div style={{
          padding: '20px 24px', borderRadius: 12,
          background: 'var(--card)', border: '1px solid var(--gold)',
          display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', fontFamily: FM }}>
            Investigando {ticker}…
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: FB }}>
            Opus está consultando agent insights, fundamentales y transcripts.
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM }}>
            Puede tardar 60–90 segundos. No cierres esta pestaña.
          </div>
          <div style={{
            width: '100%', height: 3, borderRadius: 2,
            background: 'var(--border)', overflow: 'hidden', marginTop: 4,
          }}>
            <div style={{
              height: '100%', background: 'var(--gold)', borderRadius: 2,
              animation: 'research-progress 2s ease-in-out infinite',
            }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(255,69,58,.06)', border: '1px solid rgba(255,69,58,.2)',
          color: 'var(--red)', fontSize: 11, fontFamily: FM,
        }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────
export default function ResearchAgentTab() {
  // ── Estado ──
  const [view, setView] = useState('list');          // 'list' | 'launch' | 'detail'
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const scanAbortRef = useRef(null);

  // ── Carga historial (al montar) ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`${API_URL}/api/research-agent/list?limit=30`, {
          credentials: 'include',
        });
        if (!r.ok) throw new Error(`${r.status}`);
        const data = await r.json();
        // Filter out investigations without a final_verdict (abandoned, errored,
        // or SQL-query-as-question test artifacts). UI only shows completed runs.
        const raw = data.investigations || data || [];
        if (!cancelled) setHistory(raw.filter(x => x && x.final_verdict));
      } catch (e) {
        console.warn('[ResearchAgent] history fetch failed:', e.message);
      } finally {
        if (!cancelled) setHistLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Carga candidatos auto-scan (dryRun, al montar) ──
  useEffect(() => {
    let cancelled = false;
    async function loadCandidates() {
      setScanLoading(true);
      try {
        const r = await fetch(`${API_URL}/api/research-agent/auto-scan?dryRun=1`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled) setCandidates(data.candidates || []);
      } catch {
        // silently ignore — banner is optional
      } finally {
        if (!cancelled) setScanLoading(false);
      }
    }
    loadCandidates();
    return () => { cancelled = true; };
  }, []);

  // ── Ejecutar auto-scan ──
  const handleRunAutoScan = useCallback(async () => {
    if (scanRunning) return;
    if (!window.confirm('Esto ejecutará hasta 3 investigaciones Opus (~$3-4.50 total, 3-5 min). ¿Confirmas?')) return;
    setScanRunning(true);
    setScanError(null);
    setScanResult(null);

    const ctrl = new AbortController();
    scanAbortRef.current = ctrl;

    try {
      const r = await fetch(`${API_URL}/api/research-agent/auto-scan`, {
        method: 'POST',
        credentials: 'include',
        signal: ctrl.signal,
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => r.statusText);
        throw new Error(`Error ${r.status}: ${txt.slice(0, 150)}`);
      }
      const data = await r.json();
      setScanResult(data);
      // Recarga historial
      const hr = await fetch(`${API_URL}/api/research-agent/list?limit=30`, { credentials: 'include' });
      if (hr.ok) {
        const hd = await hr.json();
        const raw = hd.investigations || hd || [];
        setHistory(raw.filter(x => x && x.final_verdict));
      }
    } catch (e) {
      if (e.name !== 'AbortError') setScanError(e.message);
    } finally {
      setScanRunning(false);
    }
  }, [scanRunning]);

  // ── Callback: resultado de launch ──
  const handleLaunchResult = useCallback((outcome) => {
    // Agregar al historial local y mostrar detalle
    setHistory(prev => [outcome, ...prev]);
    setSelected(outcome);
    setView('detail');
  }, []);

  // ── Callback: seleccionar investigación del historial ──
  const handleSelect = useCallback(async (inv) => {
    // Si ya tiene evidencia parseada, ir directo al detalle
    if (inv.evidence && Array.isArray(inv.evidence)) {
      setSelected(inv);
      setView('detail');
      return;
    }
    // Cargar detalle completo por id
    try {
      const r = await fetch(`${API_URL}/api/research-agent/${inv.id}`, {
        credentials: 'include',
      });
      if (r.ok) {
        const full = await r.json();
        setSelected({ ...inv, ...full });
      } else {
        setSelected(inv);
      }
    } catch {
      setSelected(inv);
    }
    setView('detail');
  }, []);

  // ── Detectar si auto-scan ya corrió hoy ──
  const today = new Date().toISOString().slice(0, 10);
  const autoRanToday = history.some(inv => {
    const invDate = (inv.started_at || inv.created_at || '').slice(0, 10);
    return invDate === today && inv.trigger_reason === 'auto_contradiction';
  });

  // ─── Render ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Keyframe animation para barra de progreso */}
      <style>{`
        @keyframes research-progress {
          0%   { width: 5%; margin-left: 0%; }
          50%  { width: 40%; margin-left: 30%; }
          100% { width: 5%; margin-left: 95%; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FD }}>
            🔬 Research Agent
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, marginTop: 2 }}>
            Opus multi-step · cita evidencia · veredicto ADD/HOLD/TRIM/SELL
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['list', 'launch'] ).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={view === v ? PILL_STYLE_ACTIVE : PILL_STYLE_INACTIVE}
            >
              {v === 'list' ? '📋 Historial' : '🔬 Investigar'}
            </button>
          ))}
        </div>
      </div>

      {/* Banner auto-scan candidatos */}
      {view !== 'detail' && candidates.length > 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: 12,
          background: 'rgba(255,159,10,.06)', border: '1px solid rgba(255,159,10,.25)',
          display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ff9f0a', fontFamily: FM, marginBottom: 6 }}>
              ⚡ {candidates.length} candidato{candidates.length !== 1 ? 's' : ''} detectado{candidates.length !== 1 ? 's' : ''} hoy
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {candidates.slice(0, 6).map(c => (
                <div key={c.ticker} style={{
                  padding: '3px 10px', borderRadius: 6,
                  background: 'rgba(255,159,10,.1)', border: '1px solid rgba(255,159,10,.3)',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ff9f0a', fontFamily: FM }}>
                    {c.ticker}
                  </span>
                  <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM }}>
                    score {c.score} · {(c.reasons || []).slice(0, 1).join('')}
                  </span>
                </div>
              ))}
              {candidates.length > 6 && (
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, padding: '3px 0' }}>
                  +{candidates.length - 6} más
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            {!autoRanToday ? (
              <button
                onClick={handleRunAutoScan}
                disabled={scanRunning}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid #ff9f0a', background: 'rgba(255,159,10,.1)',
                  color: '#ff9f0a', fontSize: 10, fontWeight: 700,
                  cursor: scanRunning ? 'wait' : 'pointer', fontFamily: FM, whiteSpace: 'nowrap',
                }}
              >
                {scanRunning ? '⏳ Ejecutando…' : '▶ Ejecutar scan automático'}
              </button>
            ) : (
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM }}>
                Scan automático ya ejecutado hoy ✓
              </span>
            )}
            {scanError && (
              <span style={{ fontSize: 9, color: 'var(--red)', fontFamily: FM }}>{scanError}</span>
            )}
          </div>
        </div>
      )}

      {/* Resultado del scan automático */}
      {scanResult && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(48,209,88,.06)', border: '1px solid rgba(48,209,88,.2)',
          fontSize: 11, color: 'var(--green)', fontFamily: FM,
        }}>
          Scan completado: {scanResult.investigated} investigación{scanResult.investigated !== 1 ? 'es' : ''} · Coste total {fmtCost(scanResult.totalCost)}
        </div>
      )}

      {/* Contenido principal */}
      {view === 'list' && (
        <ListView
          items={history}
          loading={histLoading}
          onSelect={handleSelect}
          onLaunch={() => setView('launch')}
        />
      )}
      {view === 'launch' && (
        <LaunchView onResult={handleLaunchResult} />
      )}
      {view === 'detail' && selected && (
        <DetailView
          investigation={selected}
          onBack={() => setView('list')}
        />
      )}
    </div>
  );
}
