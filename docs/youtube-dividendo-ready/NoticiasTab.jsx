// NoticiasTab.jsx — READY-TO-DROP
// Drop at: frontend/src/components/home/NoticiasTab.jsx
// Add to HomeView.jsx tabs list between "Agentes" and whatever is next.
//
// Supports:
//   - Manual "Escanear canal" button (triggers /api/youtube/scan-channel)
//   - Offline mode: reads from localStorage key `offline_youtube_videos` when !navigator.onLine
//   - Sub-tabs for future: YouTube | Noticias | Daily Brief
//   - Per-video cards with expandable per-company analysis
//   - Badge "En cartera" when ticker matches a position
//
// Integration with existing Airplane Mode (HomeView.jsx ✈️ panel):
//   - When user clicks ✈️ "Descargar todo", also call fetchAllYouTubeForOffline() below
//   - It stores under `offline_youtube_videos` in localStorage

import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://aar-api.garciaontoso.workers.dev';

// ---- offline helpers ----
export async function fetchAllYouTubeForOffline() {
  try {
    const r = await fetch(`${API_BASE}/api/youtube/videos?limit=200`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    localStorage.setItem('offline_youtube_videos', JSON.stringify({
      fetched_at: new Date().toISOString(),
      videos: data.videos || [],
    }));
    return data.videos?.length || 0;
  } catch (e) {
    console.error('YouTube offline fetch failed', e);
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

// ---- main component ----
export default function NoticiasTab({ darkMode = false }) {
  const [subTab, setSubTab] = useState('youtube'); // 'youtube' | 'news' | 'brief'
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'portfolio' | 'compra' | 'evitar'
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
        setStatus('✈️ Sin conexión y sin datos cacheados. Pulsa "Descargar todo" antes de volar.');
      }
      setLoading(false);
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/api/youtube/videos?limit=50`);
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
    setStatus('Comprobando novedades en el canal...');
    try {
      const r = await fetch(`${API_BASE}/api/youtube/scan-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (data.new_videos > 0) {
        setStatus(`✅ ${data.new_videos} vídeo(s) nuevos detectados. Ejecuta scan-youtube.sh en tu Mac para procesarlos.`);
      } else {
        setStatus('✅ Sin vídeos nuevos.');
      }
      await loadVideos();
    } catch (e) {
      setStatus(`❌ Error: ${e.message}`);
    }
    setScanning(false);
  };

  const filtered = videos.filter(v => {
    if (filter === 'all') return true;
    if (filter === 'portfolio') return (v.companies || []).some(c => c.in_portfolio);
    return (v.companies || []).some(c => c.verdict === filter);
  });

  const bg = darkMode ? '#1a1a1a' : '#fff';
  const fg = darkMode ? '#e0e0e0' : '#222';
  const border = darkMode ? '#333' : '#e5e5e5';
  const muted = darkMode ? '#888' : '#666';

  return (
    <div style={{ padding: '16px', background: bg, color: fg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>📰 Noticias &amp; Research</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleScan}
            disabled={scanning || isOffline}
            style={{
              padding: '8px 14px',
              background: isOffline ? '#666' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: (scanning || isOffline) ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            {scanning ? '⏳ Escaneando...' : '🔄 Escanear canal'}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 16, borderBottom: `1px solid ${border}`, marginBottom: 16 }}>
        {[
          { id: 'youtube', label: '▶ YouTube' },
          { id: 'news', label: '📄 Noticias (próximamente)' },
          { id: 'brief', label: '📋 Daily Brief (próximamente)' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => t.id === 'youtube' && setSubTab(t.id)}
            disabled={t.id !== 'youtube'}
            style={{
              padding: '8px 12px',
              background: 'transparent',
              color: subTab === t.id ? '#2563eb' : (t.id !== 'youtube' ? muted : fg),
              border: 'none',
              borderBottom: subTab === t.id ? '2px solid #2563eb' : '2px solid transparent',
              cursor: t.id === 'youtube' ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: subTab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Status bar */}
      {status && (
        <div style={{
          padding: '10px 14px',
          background: darkMode ? '#2a2a2a' : '#f3f4f6',
          borderRadius: 6,
          marginBottom: 12,
          fontSize: 13,
        }}>{status}</div>
      )}

      {/* Filters */}
      {subTab === 'youtube' && videos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            ['all', 'Todos'],
            ['portfolio', '📊 En cartera'],
            ['compra', '✅ Compra'],
            ['observar', '👀 Observar'],
            ['evitar', '⚠️ Evitar'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              style={{
                padding: '6px 12px',
                background: filter === id ? '#2563eb' : 'transparent',
                color: filter === id ? '#fff' : fg,
                border: `1px solid ${filter === id ? '#2563eb' : border}`,
                borderRadius: 20,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >{label}</button>
          ))}
        </div>
      )}

      {/* Video list */}
      {subTab === 'youtube' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading && <div>Cargando...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: muted, padding: 24, textAlign: 'center' }}>
              {isOffline
                ? 'Sin datos offline. Descarga antes de volar con ✈️.'
                : 'No hay vídeos que coincidan con el filtro. Pulsa "Escanear canal" si es primera vez.'}
            </div>
          )}
          {!loading && filtered.map(v => (
            <VideoCard
              key={v.video_id}
              video={v}
              expanded={expandedVideo === v.video_id}
              onToggle={() => setExpandedVideo(expandedVideo === v.video_id ? null : v.video_id)}
              darkMode={darkMode}
            />
          ))}
        </div>
      )}

      {offlineInfo && (
        <div style={{ marginTop: 24, fontSize: 11, color: muted, textAlign: 'center' }}>
          ✈️ Datos cacheados: {offlineInfo.videos.length} vídeos
        </div>
      )}
    </div>
  );
}

// ---- VideoCard ----
function VideoCard({ video, expanded, onToggle, darkMode }) {
  const bg = darkMode ? '#262626' : '#fafafa';
  const border = darkMode ? '#333' : '#e5e5e5';
  const muted = darkMode ? '#888' : '#666';

  const verdictColor = {
    compra: '#16a34a',
    mantener: '#2563eb',
    observar: '#d97706',
    evitar: '#dc2626',
    vender: '#991b1b',
  };

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{video.title}</div>
          <div style={{ fontSize: 11, color: muted, marginBottom: 8 }}>
            📅 {new Date(video.published_at).toLocaleDateString('es')} ·
            {video.status === 'pending' && ' ⏳ Pendiente de transcripción'}
            {video.status === 'summarized' && ` 🤖 ${(video.companies || []).length} empresas analizadas`}
            {video.status === 'error' && ' ❌ Error'}
          </div>
          {video.summary_general && (
            <div style={{ fontSize: 13, color: muted, marginBottom: 8, fontStyle: 'italic' }}>
              {video.summary_general}
            </div>
          )}
        </div>
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >Ver vídeo ↗</a>
      </div>

      {video.companies && video.companies.length > 0 && (
        <>
          <button
            onClick={onToggle}
            style={{
              marginTop: 8,
              padding: '4px 8px',
              background: 'transparent',
              border: `1px solid ${border}`,
              borderRadius: 4,
              color: muted,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {expanded ? '▲ Ocultar' : '▼ Ver'} {video.companies.length} empresas
          </button>

          {expanded && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {video.companies.map((c, i) => (
                <div key={i} style={{
                  padding: 10,
                  background: darkMode ? '#1a1a1a' : '#fff',
                  border: `1px solid ${border}`,
                  borderLeft: `3px solid ${verdictColor[c.verdict] || muted}`,
                  borderRadius: 4,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {c.ticker && <span style={{ color: '#2563eb' }}>{c.ticker} · </span>}
                      {c.company_name}
                      {c.in_portfolio && (
                        <span style={{
                          marginLeft: 6,
                          padding: '2px 6px',
                          background: '#16a34a',
                          color: '#fff',
                          borderRadius: 10,
                          fontSize: 9,
                          fontWeight: 600,
                        }}>📊 EN CARTERA</span>
                      )}
                    </div>
                    {c.verdict && (
                      <span style={{
                        color: verdictColor[c.verdict],
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}>
                        {c.verdict}
                      </span>
                    )}
                  </div>
                  {c.thesis && <div style={{ fontSize: 12, marginTop: 4 }}>{c.thesis}</div>}
                  {(c.target_price || c.fair_value) && (
                    <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
                      {c.target_price && <>🎯 Objetivo: {c.target_price}</>}
                      {c.fair_value && <> · 💰 Justo: {c.fair_value}</>}
                    </div>
                  )}
                  {c.risks && c.risks.length > 0 && (
                    <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
                      ⚠️ {Array.isArray(c.risks) ? c.risks.join(' · ') : c.risks}
                    </div>
                  )}
                  {c.timestamp_seconds && (
                    <a
                      href={`${video.url}&t=${c.timestamp_seconds}s`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 10, color: '#2563eb', textDecoration: 'none' }}
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
