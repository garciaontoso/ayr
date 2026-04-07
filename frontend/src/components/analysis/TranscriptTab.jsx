import { useState, useEffect, useCallback } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { API_URL } from '../../constants';
import { Card } from '../ui';

/**
 * 📞 Transcript Summary Tab
 *
 * Shows the last earnings call transcripts for the current ticker PLUS an
 * Opus-generated markdown summary (6-section structured). The summary is
 * cached in D1 via /api/company/:ticker/transcript-summary so it's free
 * on subsequent loads — user can regenerate with the button.
 *
 * Endpoints:
 *   GET  /api/company/:ticker/transcript-summary        → cached summary
 *   POST /api/company/:ticker/transcript-summary/generate → new Opus summary
 *   POST /api/download-transcripts?ticker=X              → pull FMP transcripts
 */
export default function TranscriptTab() {
  const { cfg } = useAnalysis();
  const ticker = (cfg?.ticker || '').toUpperCase();

  // TDZ-safe: all state declared before effects
  const [summary, setSummary] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [sourceData, setSourceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [transcripts, setTranscripts] = useState([]);
  const [expandedTranscript, setExpandedTranscript] = useState(null);

  const fetchSummary = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/company/${encodeURIComponent(ticker)}/transcript-summary`);
      const d = await r.json();
      if (d.cached) {
        setSummary(d.content);
        setGeneratedAt(d.generated_at);
        setSourceData(d.source_data);
      } else {
        setSummary(null);
        setGeneratedAt(null);
        setSourceData(null);
      }
    } catch (e) {
      setError(`Error cargando resumen: ${e.message}`);
    }
    setLoading(false);
  }, [ticker]);

  const fetchTranscripts = useCallback(async () => {
    if (!ticker) return;
    try {
      const stripTicker = ticker.replace(/^(BME:|HKG:|LSE:)/, '');
      const r = await fetch(`${API_URL}/api/earnings-transcripts?ticker=${encodeURIComponent(stripTicker)}`);
      if (r.ok) {
        const d = await r.json();
        setTranscripts(d.transcripts || []);
      }
    } catch {}
  }, [ticker]);

  useEffect(() => {
    fetchSummary();
    fetchTranscripts();
  }, [fetchSummary, fetchTranscripts]);

  const generateSummary = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/company/${encodeURIComponent(ticker)}/transcript-summary/generate`, {
        method: 'POST',
      });
      const d = await r.json();
      if (d.error) {
        setError(d.error);
      } else {
        setSummary(d.content);
        setGeneratedAt(d.generated_at);
        setSourceData(d.source_data);
      }
    } catch (e) {
      setError(`Error generando resumen: ${e.message}`);
    }
    setGenerating(false);
  };

  const downloadFreshTranscripts = async () => {
    setDownloading(true);
    setError(null);
    try {
      await fetch(`${API_URL}/api/download-transcripts?ticker=${encodeURIComponent(ticker)}`, {
        method: 'POST',
      });
      await fetchTranscripts();
    } catch (e) {
      setError(`Error descargando transcripts: ${e.message}`);
    }
    setDownloading(false);
  };

  if (!ticker) {
    return (
      <div style={{textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)'}}>
        Selecciona una posición del Portfolio para ver su transcript.
      </div>
    );
  }

  const ageLabel = (() => {
    if (!generatedAt) return null;
    const ageMs = Date.now() - new Date(generatedAt).getTime();
    const h = Math.round(ageMs / 3600000);
    if (h < 1) return 'hace < 1h';
    if (h < 24) return `hace ${h}h`;
    return `hace ${Math.round(h / 24)}d`;
  })();

  return (
    <div>
      {/* Header */}
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap'}}>
        <div>
          <h2 style={{margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)'}}>
            📞 Earnings Call Summary — {cfg?.name || ticker}
          </h2>
          <p style={{margin: 0, fontSize: 11, color: 'var(--text-tertiary)'}}>
            Resumen estructurado generado por Claude Opus de los últimos earnings calls.
            {ageLabel && <span> Último resumen: {ageLabel}.</span>}
            {sourceData && <span> Basado en: {sourceData}.</span>}
          </p>
        </div>
        <div style={{display: 'flex', gap: 8}}>
          <button onClick={downloadFreshTranscripts} disabled={downloading}
            title="Descarga los transcripts más recientes de FMP"
            style={{padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: downloading ? 'wait' : 'pointer', fontFamily: 'var(--fm)'}}>
            {downloading ? '⏳ Descargando...' : '📥 Descargar transcripts frescos'}
          </button>
          <button onClick={generateSummary} disabled={generating}
            title="Genera un nuevo resumen con Claude Opus (cuesta ~$0.04)"
            style={{padding: '8px 14px', borderRadius: 8, border: '1px solid var(--gold)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 11, fontWeight: 700, cursor: generating ? 'wait' : 'pointer', fontFamily: 'var(--fm)'}}>
            {generating ? '🧠 Generando...' : summary ? '🔄 Regenerar resumen' : '✨ Generar resumen'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{padding: 12, background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, color: 'var(--red)', fontSize: 12, marginBottom: 16, fontFamily: 'var(--fm)'}}>
          ⚠️ {error}
        </div>
      )}

      {loading && !summary && (
        <div style={{textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontSize: 12}}>
          Cargando resumen...
        </div>
      )}

      {!loading && !summary && (
        <Card style={{padding: 24, textAlign: 'center'}}>
          <div style={{fontSize: 36, marginBottom: 12}}>📞</div>
          <div style={{fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--fd)'}}>
            Sin resumen generado para {ticker}
          </div>
          <div style={{fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 16px'}}>
            Pulsa <strong>✨ Generar resumen</strong> para que Opus analice los últimos earnings call transcripts y te devuelva un resumen estructurado.
            Si aún no hay transcripts descargados, pulsa primero <strong>📥 Descargar transcripts frescos</strong>.
          </div>
          <div style={{fontSize: 10, color: 'var(--text-tertiary)'}}>
            Transcripts disponibles para este ticker: <strong>{transcripts.length}</strong>
          </div>
        </Card>
      )}

      {summary && (
        <Card style={{padding: 20, marginBottom: 16}}>
          <MarkdownLite content={summary} />
        </Card>
      )}

      {/* Raw transcripts (collapsable) */}
      {transcripts.length > 0 && (
        <div style={{marginTop: 20}}>
          <h3 style={{margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--fd)'}}>
            Transcripts completos ({transcripts.length})
          </h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            {transcripts.map((t) => {
              const id = `${t.year}-${t.quarter}`;
              const expanded = expandedTranscript === id;
              return (
                <div key={id} style={{border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden'}}>
                  <button onClick={() => setExpandedTranscript(expanded ? null : id)}
                    style={{width: '100%', padding: '10px 14px', background: 'var(--subtle-bg)', border: 'none', cursor: 'pointer', fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span><strong>{t.quarter} {t.year}</strong> {t.date && <span style={{color: 'var(--text-tertiary)'}}>· {t.date}</span>}</span>
                    <span style={{color: 'var(--text-tertiary)'}}>{expanded ? '▼' : '▶'}</span>
                  </button>
                  {expanded && (
                    <div style={{padding: 14, fontSize: 11, lineHeight: 1.7, color: 'var(--text-secondary)', fontFamily: 'var(--fm)', whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto'}}>
                      {t.content || '(sin contenido)'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Super lightweight markdown renderer (headings + bullets + bold)
function MarkdownLite({ content }) {
  if (!content) return null;
  const lines = content.split('\n');
  const out = [];
  let listBuf = [];
  const flushList = () => {
    if (listBuf.length) {
      out.push(
        <ul key={`ul-${out.length}`} style={{margin: '4px 0 12px 0', paddingLeft: 20, lineHeight: 1.8}}>
          {listBuf.map((li, i) => (
            <li key={i} style={{fontSize: 12, color: 'var(--text-secondary)'}}>
              <InlineMd text={li} />
            </li>
          ))}
        </ul>
      );
      listBuf = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      flushList();
      out.push(<h3 key={`h-${i}`} style={{margin: '14px 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)'}}>{trimmed.slice(3)}</h3>);
    } else if (trimmed.startsWith('# ')) {
      flushList();
      out.push(<h2 key={`h-${i}`} style={{margin: '16px 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--fd)'}}>{trimmed.slice(2)}</h2>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listBuf.push(trimmed.slice(2));
    } else if (/^\d+\.\s/.test(trimmed)) {
      listBuf.push(trimmed.replace(/^\d+\.\s/, ''));
    } else if (trimmed) {
      flushList();
      out.push(<p key={`p-${i}`} style={{margin: '6px 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7}}><InlineMd text={trimmed} /></p>);
    }
  }
  flushList();
  return <div>{out}</div>;
}

function InlineMd({ text }) {
  // Bold **x** + italic *x*
  const parts = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const bold = remaining.match(/\*\*([^*]+)\*\*/);
    if (bold && bold.index === 0) {
      parts.push(<strong key={key++} style={{color: 'var(--text-primary)'}}>{bold[1]}</strong>);
      remaining = remaining.slice(bold[0].length);
    } else if (bold) {
      parts.push(<span key={key++}>{remaining.slice(0, bold.index)}</span>);
      remaining = remaining.slice(bold.index);
    } else {
      parts.push(<span key={key++}>{remaining}</span>);
      remaining = '';
    }
  }
  return <>{parts}</>;
}
