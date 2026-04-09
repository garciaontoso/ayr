import { useState, useEffect, useCallback } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { API_URL } from '../../constants';
import { fmtBytes } from '../../utils/formatters.js';

/**
 * 🗄 Archivo Multianual
 *
 * Full 3-year archive of 10-K, 10-Q and earnings transcripts per ticker,
 * plus an Opus-generated long-term verdict built from the whole corpus.
 *
 * Complementary to TranscriptTab (which shows just the latest call).
 *
 * Endpoints:
 *   GET  /api/earnings/archive/list?ticker=X
 *   GET  /api/earnings/archive/get?id=N            (raw text/plain)
 *   POST /api/earnings/archive/analyze             (body {ticker, force?})
 */

const DOC_TYPE_ORDER = ['10-K', '10-Q', 'TRANSCRIPT'];
const DOC_TYPE_LABELS = {
  '10-K': 'Annual Reports (10-K)',
  '10-Q': 'Quarterly Reports (10-Q)',
  TRANSCRIPT: 'Earnings Call Transcripts',
};

const VERDICT_COLORS = {
  BUY: { bg: 'rgba(74,222,128,.18)', fg: 'var(--green)', border: 'var(--green)' },
  ACCUMULATE: { bg: 'rgba(74,222,128,.10)', fg: 'var(--green)', border: 'rgba(74,222,128,.6)' },
  HOLD: { bg: 'rgba(200,164,78,.15)', fg: 'var(--gold)', border: 'var(--gold)' },
  TRIM: { bg: 'rgba(251,146,60,.15)', fg: '#fb923c', border: '#fb923c' },
  SELL: { bg: 'rgba(248,113,113,.18)', fg: 'var(--red)', border: 'var(--red)' },
};

const safetyColor = (n) => {
  if (n == null) return 'var(--text-tertiary)';
  if (n >= 8) return 'var(--green)';
  if (n >= 6) return 'var(--gold)';
  return 'var(--red)';
};

const LABEL = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.8px',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  fontFamily: 'var(--fd)',
  marginBottom: 6,
};

const CARD = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
};

export default function ArchiveTab() {
  const { cfg } = useAnalysis();
  const ticker = (cfg?.ticker || '').toUpperCase();
  const name = cfg?.name || ticker;

  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState(null);

  const [analysis, setAnalysis] = useState(null);
  const [analysisMeta, setAnalysisMeta] = useState(null); // {cached, docs_used, tokens_in, tokens_out}
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [modalDoc, setModalDoc] = useState(null); // {id, title}
  const [modalBody, setModalBody] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  const loadDocs = useCallback(async () => {
    if (!ticker) return;
    setDocsLoading(true);
    setDocsError(null);
    try {
      const r = await fetch(
        `${API_URL}/api/earnings/archive/list?ticker=${encodeURIComponent(ticker)}&limit=50`
      );
      const d = await r.json();
      if (d.ok) setDocs(d.rows || []);
      else setDocsError(d.error || 'Error cargando documentos');
    } catch (e) {
      setDocsError(e.message);
    } finally {
      setDocsLoading(false);
    }
  }, [ticker]);

  const loadAnalysis = useCallback(
    async (force = false) => {
      if (!ticker) return;
      setAnalysisLoading(true);
      setAnalysisError(null);
      setNotFound(false);
      try {
        const r = await fetch(`${API_URL}/api/earnings/archive/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, force }),
        });
        if (r.status === 404) {
          setNotFound(true);
          setAnalysis(null);
          setAnalysisMeta(null);
          return;
        }
        const d = await r.json();
        if (d.ok) {
          setAnalysis(d.analysis || null);
          setAnalysisMeta({
            cached: d.cached,
            docs_used: d.docs_used,
            tokens_in: d.tokens_in,
            tokens_out: d.tokens_out,
          });
        } else {
          setAnalysisError(d.error || 'Error en el análisis');
        }
      } catch (e) {
        setAnalysisError(e.message);
      } finally {
        setAnalysisLoading(false);
      }
    },
    [ticker]
  );

  useEffect(() => {
    setAnalysis(null);
    setAnalysisMeta(null);
    setDocs([]);
    loadDocs();
    loadAnalysis(false);
  }, [ticker, loadDocs, loadAnalysis]);

  // Modal: fetch doc body on open, Esc to close
  useEffect(() => {
    if (!modalDoc) return;
    let cancelled = false;
    setModalLoading(true);
    setModalBody('');
    fetch(`${API_URL}/api/earnings/archive/get?id=${modalDoc.id}`)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setModalBody(t);
      })
      .catch((e) => {
        if (!cancelled) setModalBody(`Error: ${e.message}`);
      })
      .finally(() => {
        if (!cancelled) setModalLoading(false);
      });
    const onKey = (e) => {
      if (e.key === 'Escape') setModalDoc(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [modalDoc]);

  if (!ticker) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--text-tertiary)',
          fontSize: 12,
        }}
      >
        Selecciona una posición del Portfolio para ver su archivo.
      </div>
    );
  }

  // Group docs by type
  const grouped = {};
  for (const d of docs) {
    const k = d.doc_type || 'OTHER';
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(d);
  }

  return (
    <div>
      {/* Section A — Header */}
      <div style={{ marginBottom: 18 }}>
        <h2
          style={{
            margin: '0 0 4px',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--gold)',
            fontFamily: 'var(--fd)',
          }}
        >
          🗄 Archivo Multianual — {name}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--fm)',
          }}
        >
          10-K, 10-Q y transcripts de los últimos 3 años para{' '}
          <strong style={{ color: 'var(--text-secondary)' }}>{ticker}</strong>.
        </p>
      </div>

      {/* Section B — Verdict card */}
      <VerdictSection
        loading={analysisLoading}
        error={analysisError}
        notFound={notFound}
        ticker={ticker}
        analysis={analysis}
        meta={analysisMeta}
        onRefresh={() => loadAnalysis(true)}
      />

      {/* Section C — Document list */}
      <div style={{ marginTop: 24 }}>
        <h3
          style={{
            margin: '0 0 10px',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--fd)',
            textTransform: 'uppercase',
            letterSpacing: '.6px',
          }}
        >
          Documentos archivados ({docs.length})
        </h3>

        {docsLoading && (
          <div
            style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--fm)',
              fontSize: 12,
            }}
          >
            Cargando documentos...
          </div>
        )}
        {docsError && (
          <div
            style={{
              padding: 12,
              background: 'rgba(248,113,113,.1)',
              border: '1px solid rgba(248,113,113,.3)',
              borderRadius: 8,
              color: 'var(--red)',
              fontSize: 12,
              fontFamily: 'var(--fm)',
            }}
          >
            ⚠️ {docsError}
          </div>
        )}
        {!docsLoading && !docsError && docs.length === 0 && (
          <div
            style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--fm)',
              fontSize: 12,
            }}
          >
            Sin documentos archivados para {ticker}.
          </div>
        )}

        {DOC_TYPE_ORDER.map((type) => {
          const rows = grouped[type];
          if (!rows || !rows.length) return null;
          return (
            <div key={type} style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.8px',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--fd)',
                  marginBottom: 6,
                  paddingBottom: 4,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {DOC_TYPE_LABELS[type] || type} · {rows.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {rows.map((r) => (
                  <DocRow key={r.id} row={r} onOpen={() => setModalDoc(r)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modalDoc && (
        <DocModal
          doc={modalDoc}
          body={modalBody}
          loading={modalLoading}
          onClose={() => setModalDoc(null)}
        />
      )}
    </div>
  );
}

function VerdictSection({ loading, error, notFound, ticker, analysis, meta, onRefresh }) {
  if (loading) {
    return (
      <div
        style={{
          ...CARD,
          padding: 32,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>🧠</div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--fd)',
            marginBottom: 6,
          }}
        >
          Analizando 3 años de informes con Claude Opus...
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
          Puede tardar 15-30s
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div
        style={{
          ...CARD,
          background: 'rgba(200,164,78,.06)',
          border: '1px solid rgba(200,164,78,.3)',
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--fm)', lineHeight: 1.7 }}>
          ℹ️ No hay documentos archivados para <strong>{ticker}</strong>. Solo se archivan
          tickers US de cartera por ahora. El archivo se va rellenando en background.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 14,
          background: 'rgba(248,113,113,.1)',
          border: '1px solid rgba(248,113,113,.3)',
          borderRadius: 10,
          color: 'var(--red)',
          fontSize: 12,
          fontFamily: 'var(--fm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span>⚠️ {error}</span>
        <button
          onClick={onRefresh}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--red)',
            background: 'transparent',
            color: 'var(--red)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--fm)',
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!analysis) return null;

  const verdict = (analysis.long_term_verdict || 'HOLD').toUpperCase();
  const vColor = VERDICT_COLORS[verdict] || VERDICT_COLORS.HOLD;
  const safety = analysis.dividend_safety_score;
  const safetyPct = typeof safety === 'number' ? Math.max(0, Math.min(100, safety * 10)) : 0;

  return (
    <div
      style={{
        ...CARD,
        padding: 20,
        background: 'linear-gradient(180deg, var(--card) 0%, var(--card) 100%)',
      }}
    >
      {/* Top strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
          paddingBottom: 14,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            background: vColor.bg,
            border: `2px solid ${vColor.border}`,
            color: vColor.fg,
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: '1.2px',
            fontFamily: 'var(--fd)',
          }}
        >
          {verdict}
        </div>

        {typeof safety === 'number' && (
          <div style={{ flex: '0 0 auto', minWidth: 160 }}>
            <div style={{ ...LABEL, marginBottom: 4 }}>Dividend Safety</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  fontFamily: 'var(--fm)',
                  color: safetyColor(safety),
                }}
              >
                {safety}
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>/10</span>
              </div>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  background: 'var(--subtle-bg)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    width: `${safetyPct}%`,
                    height: '100%',
                    background: safetyColor(safety),
                    transition: 'width .3s',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {analysis.confidence && (
          <div
            style={{
              padding: '5px 10px',
              borderRadius: 999,
              background: 'var(--subtle-bg)',
              border: '1px solid var(--border)',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--fm)',
              textTransform: 'uppercase',
              letterSpacing: '.6px',
            }}
          >
            Confianza: {analysis.confidence}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={onRefresh}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--gold)',
            background: 'var(--gold-dim, rgba(200,164,78,.12))',
            color: 'var(--gold)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'var(--fm)',
          }}
        >
          🔄 Volver a analizar
        </button>
      </div>

      {/* Summary */}
      {analysis.summary && (
        <p
          style={{
            margin: '0 0 18px',
            fontSize: 15,
            color: 'var(--text-primary)',
            lineHeight: 1.7,
            fontStyle: 'italic',
            fontFamily: 'var(--fb)',
          }}
        >
          {analysis.summary}
        </p>
      )}

      {/* Why yes / Why no */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <BulletCard
          title="✓ Por qué SÍ"
          items={analysis.why_yes}
          color="var(--green)"
          bg="rgba(74,222,128,.06)"
        />
        <BulletCard
          title="✗ Por qué NO / Riesgos"
          items={analysis.why_no}
          color="var(--red)"
          bg="rgba(248,113,113,.06)"
        />
      </div>

      {/* Moat / Capital allocation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <TextCard label="Foso competitivo" text={analysis.moat} />
        <TextCard label="Capital allocation" text={analysis.capital_allocation} />
      </div>

      {/* Trend trio */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <TextCard label="Tendencia ingresos" text={analysis.revenue_trend} />
        <TextCard label="Tendencia márgenes" text={analysis.margin_trend} />
        <TextCard label="Salud del dividendo" text={analysis.dividend_health} />
      </div>

      {/* Guidance + emerging risks */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <BulletCard
          title="Cambios de guidance"
          items={analysis.guidance_changes}
          color="var(--text-secondary)"
          bg="var(--subtle-bg)"
        />
        <BulletCard
          title="Riesgos emergentes"
          items={analysis.emerging_risks}
          color="var(--gold)"
          bg="rgba(200,164,78,.06)"
        />
      </div>

      {/* Thesis update */}
      {analysis.thesis_update && (
        <div
          style={{
            padding: 14,
            background: 'var(--subtle-bg)',
            border: '1px dashed var(--border)',
            borderRadius: 8,
            marginBottom: 14,
          }}
        >
          <div style={LABEL}>Thesis update</div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              fontStyle: 'italic',
              fontFamily: 'var(--fb)',
            }}
          >
            {analysis.thesis_update}
          </p>
        </div>
      )}

      {/* Meta row */}
      {meta && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--fm)',
            textAlign: 'right',
          }}
        >
          Analizado con {meta.docs_used} documentos · {meta.tokens_in}→{meta.tokens_out} tokens ·{' '}
          {meta.cached ? 'desde caché' : 'fresco'}
        </div>
      )}
    </div>
  );
}

function BulletCard({ title, items, color, bg }) {
  const list = Array.isArray(items) ? items : [];
  return (
    <div
      style={{
        padding: 14,
        background: bg,
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}
    >
      <div style={{ ...LABEL, color, marginBottom: 8 }}>{title}</div>
      {list.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
          —
        </div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
          {list.map((it, i) => (
            <li
              key={i}
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 4,
                fontFamily: 'var(--fb)',
              }}
            >
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TextCard({ label, text }) {
  return (
    <div
      style={{
        padding: 12,
        background: 'var(--subtle-bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      <div style={LABEL}>{label}</div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          fontFamily: 'var(--fb)',
        }}
      >
        {text || '—'}
      </div>
    </div>
  );
}

function DocRow({ row, onOpen }) {
  const date = row.filing_date || row.period_of_report || '—';
  const fyfq = [row.fiscal_year, row.fiscal_quarter].filter(Boolean).join(' ') || '—';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr 110px 100px 90px 60px',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
        fontFamily: 'var(--fm)',
        color: 'var(--text-secondary)',
      }}
    >
      <span
        style={{
          padding: '3px 8px',
          borderRadius: 999,
          background: 'var(--subtle-bg)',
          border: '1px solid var(--border)',
          color: 'var(--gold)',
          fontWeight: 700,
          fontSize: 10,
          textAlign: 'center',
          letterSpacing: '.4px',
        }}
      >
        {row.doc_type || '—'}
      </span>
      <span
        style={{
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={row.title || ''}
      >
        {row.title || row.accession_number || `#${row.id}`}
      </span>
      <span>{date}</span>
      <span style={{ color: 'var(--text-tertiary)' }}>{fyfq}</span>
      <span style={{ color: 'var(--text-tertiary)' }}>{fmtBytes(row.size_bytes)}</span>
      <button
        onClick={onOpen}
        style={{
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--gold)',
          fontSize: 10,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'var(--fm)',
        }}
      >
        Ver
      </button>
    </div>
  );
}

function DocModal({ doc, body, loading, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.72)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 960,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--fd)',
                letterSpacing: '.6px',
                textTransform: 'uppercase',
              }}
            >
              {doc.doc_type} · {doc.filing_date || '—'} · {fmtBytes(doc.size_bytes)}
            </div>
            <div
              style={{
                fontSize: 14,
                color: 'var(--text-primary)',
                fontFamily: 'var(--fd)',
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={doc.title}
            >
              {doc.title || doc.accession_number || `#${doc.id}`}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--fm)',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {loading ? (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--fm)',
                fontSize: 12,
              }}
            >
              Cargando documento...
            </div>
          ) : (
            <pre
              style={{
                margin: 0,
                fontFamily: 'var(--fm)',
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {body || '(vacío)'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
