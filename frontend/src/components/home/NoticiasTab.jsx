// NoticiasTab — YouTube Dividendo Agent view
// Reads /api/youtube/videos (populated by the Mac scan-youtube.sh script
// after the user clicks "🔄 Escanear canal"). Shows per-video cards with
// expandable per-company analysis extracted by Opus from the transcript.
//
// Adapted from docs/youtube-dividendo-ready/NoticiasTab.jsx to use the
// existing A&R style system (CSS vars, var(--gold), var(--card)) instead
// of the hardcoded #2563eb palette the template originally used.
//
// Offline support: reads from localStorage key `offline_youtube_videos`
// when !navigator.onLine. The fetchAllYouTubeForOffline() helper is
// exported so the existing Airplane Mode panel can pre-cache videos.
import { useState, useEffect, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { API_URL } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';

// Offline helpers (exported for AirplaneMode panel integration)
export async function fetchAllYouTubeForOffline() {
  try {
    const r = await fetch(`${API_URL}/api/youtube/videos?limit=200`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    localStorage.setItem('offline_youtube_videos', JSON.stringify({
      fetched_at: new Date().toISOString(),
      videos: data.videos || [],
    }));
    return data.videos?.length || 0;
  } catch (e) {
    console.warn('YouTube offline fetch failed', e);
    return 0;
  }
}

function loadOfflineYouTube() {
  try {
    const raw = localStorage.getItem('offline_youtube_videos');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const VERDICT_COLOR = {
  compra: 'var(--green)',
  mantener: '#64d2ff',
  observar: 'var(--gold)',
  evitar: '#ff6b6b',
  vender: 'var(--red)',
};
const VERDICT_LBL = {
  compra: '✅ Compra',
  mantener: '↔ Mantener',
  observar: '👀 Observar',
  evitar: '⚠ Evitar',
  vender: '❌ Vender',
};

export default function NoticiasTab() {
  const { openAnalysis } = useHome();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('');
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [filter, setFilter] = useState('all'); // all | portfolio | compra | observar | evitar
  const [expandedVideo, setExpandedVideo] = useState(null);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    if (isOffline) {
      const cached = loadOfflineYouTube();
      if (cached) {
        setVideos(cached.videos);
        setOfflineInfo(cached);
        setStatus(`✈️ Modo offline — datos del ${new Date(cached.fetched_at).toLocaleString('es')}`);
      } else {
        setStatus('✈️ Sin conexión y sin datos cacheados. Pulsa ✈️ antes de volar.');
      }
      setLoading(false);
      return;
    }
    try {
      const r = await fetch(`${API_URL}/api/youtube/videos?limit=50`);
      const data = await r.json();
      setVideos(data.videos || []);
      setStatus('');
    } catch (e) {
      setStatus(`Error cargando vídeos: ${e.message}`);
    }
    setLoading(false);
  }, [isOffline]);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  const handleScan = async () => {
    if (isOffline) {
      setStatus('No puedes escanear sin conexión.');
      return;
    }
    setScanning(true);
    setStatus('Comprobando novedades en el canal…');
    try {
      const r = await fetch(`${API_URL}/api/youtube/scan-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (data.new_videos > 0) {
        setStatus(`✅ ${data.new_videos} vídeo(s) nuevos. Ejecuta \`scan-youtube.sh\` en tu Mac para transcribirlos.`);
      } else if (data.error) {
        setStatus(`❌ ${data.error}`);
      } else {
        setStatus('✅ Sin vídeos nuevos.');
      }
      await loadVideos();
    } catch (e) {
      setStatus(`❌ Error: ${e.message}`);
    }
    setScanning(false);
    setTimeout(() => setStatus(''), 10000);
  };

  const filtered = videos.filter(v => {
    if (filter === 'all') return true;
    if (filter === 'portfolio') return (v.companies || []).some(c => c.in_portfolio);
    return (v.companies || []).some(c => c.verdict === filter);
  });

  // ─── Styles ───
  const card = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
    padding: 14, fontFamily: 'var(--fm)',
  };
  const pill = (active) => ({
    padding: '7px 14px', borderRadius: 8,
    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'rgba(200,164,78,.12)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-tertiary)',
    fontSize: 11, fontWeight: active ? 700 : 500,
    cursor: 'pointer', fontFamily: 'var(--fm)',
  });

  return (
    <div style={{ padding: '4px 8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>
            📰 Noticias &amp; Research — El Dividendo
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Análisis per-empresa extraído por Opus de los vídeos del canal.
            Pulsa "🔄 Escanear canal" para detectar vídeos nuevos. Luego ejecuta
            <code style={{ padding: '0 4px', background: 'var(--subtle-bg)', borderRadius: 3, fontSize: 10 }}>scripts/scan-youtube.sh</code>
            en tu Mac para transcribirlos y resumirlos.
          </div>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning || isOffline}
          style={{
            padding: '8px 14px', borderRadius: 8,
            border: '1px solid var(--gold)',
            background: scanning || isOffline ? 'transparent' : 'rgba(200,164,78,.1)',
            color: 'var(--gold)', fontSize: 11, fontWeight: 700,
            cursor: (scanning || isOffline) ? 'wait' : 'pointer',
            fontFamily: 'var(--fm)',
            opacity: isOffline ? 0.5 : 1,
          }}
        >
          {scanning ? '⏳ Escaneando…' : '🔄 Escanear canal'}
        </button>
      </div>

      {/* Status banner */}
      {status && (
        <div style={{ ...card, background: 'rgba(100,210,255,.06)', borderColor: 'rgba(100,210,255,.3)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
          {status}
        </div>
      )}

      {/* Filter pills */}
      {videos.length > 0 && (
        <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            ['all', 'Todos'],
            ['portfolio', '📊 En cartera'],
            ['compra', '✅ Compra'],
            ['observar', '👀 Observar'],
            ['evitar', '⚠️ Evitar'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} style={pill(filter === id)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Video list */}
      {loading ? <InlineLoading label="Cargando vídeos…" /> : filtered.length === 0 ? (
        <EmptyState
          icon="📰"
          title={isOffline ? 'Sin datos offline' : (videos.length === 0 ? 'Sin vídeos aún' : 'Sin resultados con este filtro')}
          description={isOffline
            ? 'Pulsa ✈️ antes de volar para descargar los vídeos en modo offline.'
            : videos.length === 0
              ? 'Pulsa "🔄 Escanear canal" para detectar los vídeos de El Dividendo. Luego ejecuta scripts/scan-youtube.sh en el Mac.'
              : 'Cambia el filtro para ver otros vídeos.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(v => (
            <VideoCard
              key={v.video_id}
              video={v}
              expanded={expandedVideo === v.video_id}
              onToggle={() => setExpandedVideo(expandedVideo === v.video_id ? null : v.video_id)}
              openAnalysis={openAnalysis}
            />
          ))}
        </div>
      )}

      {offlineInfo && (
        <div style={{ marginTop: 14, fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', fontFamily: 'var(--fm)' }}>
          ✈️ Datos offline: {offlineInfo.videos.length} vídeos cacheados
        </div>
      )}
    </div>
  );
}

function VideoCard({ video, expanded, onToggle, openAnalysis }) {
  const companies = video.companies || [];
  const card = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
    padding: 14, fontFamily: 'var(--fm)',
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            {video.title}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>
            📅 {new Date(video.published_at).toLocaleDateString('es-ES')}
            {video.status === 'pending' && ' · ⏳ Pendiente de transcripción'}
            {video.status === 'summarized' && ` · 🤖 ${companies.length} empresa${companies.length !== 1 ? 's' : ''} analizada${companies.length !== 1 ? 's' : ''}`}
            {video.status === 'error' && ' · ❌ Error'}
            {video.processing_cost_usd ? ` · $${Number(video.processing_cost_usd).toFixed(3)}` : ''}
          </div>
          {video.summary_general && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontStyle: 'italic', lineHeight: 1.4 }}>
              {video.summary_general}
            </div>
          )}
        </div>
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 10, color: 'var(--gold)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Ver vídeo ↗
        </a>
      </div>

      {companies.length > 0 && (
        <>
          <button
            onClick={onToggle}
            style={{
              marginTop: 8, padding: '4px 10px', borderRadius: 6,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-tertiary)', cursor: 'pointer',
              fontSize: 10, fontFamily: 'var(--fm)',
            }}
          >
            {expanded ? '▲ Ocultar' : '▼ Ver'} {companies.length} empresa{companies.length !== 1 ? 's' : ''}
          </button>

          {expanded && (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {companies.map((c, i) => (
                <div
                  key={c.id || i}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--subtle-bg)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${VERDICT_COLOR[c.verdict] || 'var(--text-tertiary)'}`,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {c.ticker && (
                        <span
                          onClick={(e) => { e.stopPropagation(); openAnalysis?.(c.ticker); }}
                          style={{ color: 'var(--gold)', cursor: 'pointer', textDecoration: 'none', marginRight: 6 }}
                        >
                          {c.ticker}
                        </span>
                      )}
                      <span style={{ color: 'var(--text-primary)' }}>{c.company_name}</span>
                      {c.in_portfolio && (
                        <span style={{
                          marginLeft: 6, padding: '1px 6px', borderRadius: 10,
                          background: 'var(--green)', color: '#000',
                          fontSize: 9, fontWeight: 800, fontFamily: 'var(--fm)',
                        }}>📊 EN CARTERA</span>
                      )}
                    </div>
                    {c.verdict && (
                      <span style={{
                        color: VERDICT_COLOR[c.verdict] || 'var(--text-tertiary)',
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      }}>
                        {VERDICT_LBL[c.verdict] || c.verdict}
                      </span>
                    )}
                  </div>
                  {c.thesis && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                      {c.thesis}
                    </div>
                  )}
                  {(c.target_price || c.fair_value) && (
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 5 }}>
                      {c.target_price && <>🎯 Objetivo: <span style={{ color: 'var(--text-primary)' }}>{c.target_price}</span></>}
                      {c.fair_value && <> · 💰 Justo: <span style={{ color: 'var(--text-primary)' }}>{c.fair_value}</span></>}
                    </div>
                  )}
                  {c.risks && (Array.isArray(c.risks) ? c.risks.length > 0 : c.risks.length > 0) && (
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      ⚠️ {Array.isArray(c.risks) ? c.risks.join(' · ') : c.risks}
                    </div>
                  )}
                  {c.catalyst && (
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      🚀 {c.catalyst}
                    </div>
                  )}
                  {c.timestamp_seconds != null && (
                    <a
                      href={`${video.url}&t=${c.timestamp_seconds}s`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 10, color: 'var(--gold)', textDecoration: 'none', display: 'inline-block', marginTop: 5 }}
                    >
                      ⏱ Ir al minuto {Math.floor(c.timestamp_seconds / 60)}:{String(c.timestamp_seconds % 60).padStart(2, '0')}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
