// NoticiasTab — YouTube multi-channel view with dynamic sub-tabs
// Reads /api/youtube/channels and /api/youtube/videos?channel_id=... (populated
// by the Mac scan-youtube.sh script after the user clicks "🔄 Escanear canal").
// Shows per-video cards with expandable per-company analysis extracted by
// Opus from the transcript.
//
// Offline support: per-channel cache in localStorage key
// `offline_youtube_videos_{channel_id}` + `offline_youtube_channels`. Falls
// back to legacy `offline_youtube_videos` for backward compat. The
// fetchAllYouTubeForOffline() helper is exported so AirplaneMode can pre-cache.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useHome } from '../../context/HomeContext';
import { API_URL } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';

// Offline helpers (exported for AirplaneMode panel integration)
export async function fetchAllYouTubeForOffline() {
  try {
    const rc = await fetch(`${API_URL}/api/youtube/channels`);
    if (!rc.ok) throw new Error(`HTTP ${rc.status}`);
    const cdata = await rc.json();
    const channels = cdata.channels || [];
    localStorage.setItem('offline_youtube_channels', JSON.stringify({
      fetched_at: new Date().toISOString(),
      channels,
    }));
    let total = 0;
    for (const ch of channels) {
      try {
        const r = await fetch(`${API_URL}/api/youtube/videos?channel_id=${encodeURIComponent(ch.channel_id)}&limit=200`);
        if (!r.ok) continue;
        const data = await r.json();
        const videos = data.videos || [];
        localStorage.setItem(`offline_youtube_videos_${ch.channel_id}`, JSON.stringify({
          fetched_at: new Date().toISOString(),
          videos,
        }));
        total += videos.length;
      } catch {}
    }
    // Legacy key — keep populated with a flat union for older AirplaneMode code paths
    return total;
  } catch (e) {
    console.warn('YouTube offline fetch failed', e);
    return 0;
  }
}

function loadOfflineChannels() {
  try {
    const raw = localStorage.getItem('offline_youtube_channels');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadOfflineYouTube(channelId) {
  try {
    if (channelId) {
      const raw = localStorage.getItem(`offline_youtube_videos_${channelId}`);
      if (raw) return JSON.parse(raw);
    }
    // Backward-compat: legacy single-channel key
    const legacy = localStorage.getItem('offline_youtube_videos');
    if (!legacy) return null;
    return JSON.parse(legacy);
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

const LS_SELECTED = 'yt_selected_channel';

export default function NoticiasTab() {
  const { openAnalysis } = useHome();
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState(() => {
    try { return localStorage.getItem(LS_SELECTED) || ''; } catch { return ''; }
  });
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('');
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [offlineInfo, setOfflineInfo] = useState(null);
  const [filter, setFilter] = useState('all'); // all | portfolio | compra | observar | evitar
  const [expandedVideo, setExpandedVideo] = useState(null);
  // Process-request flow
  const [processing, setProcessing] = useState(false);
  const [processingSince, setProcessingSince] = useState(null);
  // Add-channel modal
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [addChannelInput, setAddChannelInput] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [addError, setAddError] = useState(null);
  // Refs (declared BEFORE any useEffect that uses them — see CLAUDE.md TDZ note)
  const startCountRef = useRef(0);
  const statusTimer = useRef(null);

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

  // Persist selected channel
  useEffect(() => {
    try {
      if (selectedChannelId) localStorage.setItem(LS_SELECTED, selectedChannelId);
    } catch {}
  }, [selectedChannelId]);

  // Load channels list
  const loadChannels = useCallback(async () => {
    if (isOffline) {
      const cached = loadOfflineChannels();
      if (cached) {
        setChannels(cached.channels || []);
        setSelectedChannelId(prev => {
          const list = cached.channels || [];
          if (prev && list.some(c => c.channel_id === prev)) return prev;
          return list[0]?.channel_id || '';
        });
      }
      return;
    }
    try {
      const r = await fetch(`${API_URL}/api/youtube/channels`);
      const data = await r.json();
      const list = data.channels || [];
      setChannels(list);
      setSelectedChannelId(prev => {
        if (prev && list.some(c => c.channel_id === prev)) return prev;
        return list[0]?.channel_id || '';
      });
    } catch (e) {
      setStatus(`Error cargando canales: ${e.message}`);
    }
  }, [isOffline]);

  // Mount: load channels + videos in parallel (videos runs again when channel resolves)
  useEffect(() => { loadChannels(); }, [loadChannels]);
  useEffect(() => {
    setFilter('all');
    setExpandedVideo(null);
    if (!selectedChannelId) { setVideos([]); return; }
    setLoading(true);
    if (isOffline) {
      const cached = loadOfflineYouTube(selectedChannelId);
      if (cached) {
        setVideos(cached.videos);
        setOfflineInfo(cached);
        setStatus(`✈️ Modo offline — datos del ${new Date(cached.fetched_at).toLocaleString('es')}`);
      } else {
        setVideos([]);
        setStatus('✈️ Sin conexión y sin datos cacheados para este canal. Pulsa ✈️ antes de volar.');
      }
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/youtube/videos?channel_id=${encodeURIComponent(selectedChannelId)}&limit=200`, { signal: ac.signal });
        if (ac.signal.aborted) return;
        const data = await r.json();
        if (ac.signal.aborted) return;
        setVideos(data.videos || []);
        setStatus('');
      } catch (e) {
        if (e.name === 'AbortError') return;
        setStatus(`Error cargando vídeos: ${e.message}`);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [isOffline, selectedChannelId]);

  // Pending count (for current channel)
  const pendingCount = videos.filter(v => v.status === 'pending').length;

  const handleProcessNow = useCallback(async () => {
    if (pendingCount === 0 || processing) return;
    startCountRef.current = pendingCount;
    setProcessing(true);
    setProcessingSince(new Date());
    setStatus('🟡 Esperando que tu Mac procese los vídeos pendientes (≤1 min para arrancar, ~1 min por vídeo)…');
    try {
      await fetch(`${API_URL}/api/youtube/request-processing`, { method: 'POST' });
    } catch (e) {
      setStatus(`❌ Error: ${e.message}`);
      setProcessing(false);
    }
  }, [pendingCount, processing]);

  // Auto-poll while processing
  useEffect(() => {
    if (!processing) return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`${API_URL}/api/youtube/videos?channel_id=${encodeURIComponent(selectedChannelId)}&limit=200`);
        const data = await r.json();
        const newVideos = data.videos || [];
        setVideos(newVideos);
        const startCount = startCountRef.current;
        const newPending = newVideos.filter(v => v.status === 'pending').length;
        if (newPending === 0) {
          setStatus(`✅ ${startCount} vídeo(s) procesados.`);
          setProcessing(false);
          if (statusTimer.current) clearTimeout(statusTimer.current);
          statusTimer.current = setTimeout(() => setStatus(''), 8000);
        } else if (newPending < startCount) {
          setStatus(`🟢 Procesando… ${startCount - newPending}/${startCount} listos`);
        }
      } catch {}
      if (processingSince && Date.now() - processingSince.getTime() > 30 * 60 * 1000) {
        setStatus('⏱ Timeout: ¿está tu Mac encendido y con el agente activo? Pulsa "Procesar ahora" otra vez.');
        setProcessing(false);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [processing, processingSince, selectedChannelId]);

  // Clear status timer on unmount
  useEffect(() => () => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
  }, []);

  // Lightweight refetch used after scan/process — not the primary loader
  const refetchVideos = useCallback(async () => {
    if (!selectedChannelId || isOffline) return;
    try {
      const r = await fetch(`${API_URL}/api/youtube/videos?channel_id=${encodeURIComponent(selectedChannelId)}&limit=200`);
      const data = await r.json();
      setVideos(data.videos || []);
    } catch {}
  }, [selectedChannelId, isOffline]);

  const handleScan = async () => {
    if (isOffline) {
      setStatus('No puedes escanear sin conexión.');
      return;
    }
    if (!selectedChannelId) {
      setStatus('Selecciona un canal primero.');
      return;
    }
    setScanning(true);
    setStatus('Comprobando novedades en el canal…');
    try {
      const r = await fetch(`${API_URL}/api/youtube/scan-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: selectedChannelId }),
      });
      const data = await r.json();
      if (data.new_videos > 0) {
        setStatus(`✅ ${data.new_videos} vídeo(s) nuevos. Ejecuta \`scan-youtube.sh\` en tu Mac para transcribirlos.`);
      } else if (data.error) {
        setStatus(`❌ ${data.error}`);
      } else {
        setStatus('✅ Sin vídeos nuevos.');
      }
      await refetchVideos();
      await loadChannels();
    } catch (e) {
      setStatus(`❌ Error: ${e.message}`);
    }
    setScanning(false);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), 10000);
  };

  // Add channel
  const handleAddChannel = async () => {
    const input = addChannelInput.trim();
    if (!input || addingChannel) return;
    setAddingChannel(true);
    setAddError(null);
    try {
      const r = await fetch(`${API_URL}/api/youtube/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_or_handle: input }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${r.status}`);
      }
      setShowAddChannel(false);
      setAddChannelInput('');
      // Refresh channels list, select the new one
      const newId = data.channel?.channel_id;
      const rc = await fetch(`${API_URL}/api/youtube/channels`);
      const cdata = await rc.json();
      const list = cdata.channels || [];
      setChannels(list);
      if (newId) setSelectedChannelId(newId);
    } catch (e) {
      setAddError(e.message || 'Error añadiendo el canal');
    }
    setAddingChannel(false);
  };

  const handleDeleteChannel = async (ch, e) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar canal ${ch.name}? Los vídeos quedan en la BD`)) return;
    try {
      const r = await fetch(`${API_URL}/api/youtube/channels/${encodeURIComponent(ch.channel_id)}`, { method: 'DELETE' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      const remaining = channels.filter(c => c.channel_id !== ch.channel_id);
      setChannels(remaining);
      if (selectedChannelId === ch.channel_id) {
        setSelectedChannelId(remaining[0]?.channel_id || '');
      }
    } catch (err) {
      setStatus(`❌ Error eliminando canal: ${err.message}`);
    }
  };

  // Escape closes modal
  useEffect(() => {
    if (!showAddChannel) return;
    const onKey = (e) => { if (e.key === 'Escape') { setShowAddChannel(false); setAddError(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAddChannel]);

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
  const channelPill = (active) => ({
    position: 'relative',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 8,
    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'rgba(200,164,78,.12)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-secondary)',
    fontSize: 12, fontWeight: active ? 700 : 500,
    cursor: 'pointer', fontFamily: 'var(--fm)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  });
  const addChannelBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 8,
    border: '1px dashed var(--border)',
    background: 'transparent',
    color: 'var(--text-tertiary)',
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--fm)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  return (
    <div style={{ padding: '4px 8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>
            📺 Canales YouTube — Análisis per-empresa
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Vídeos de canales analizados por Claude Opus. Cada vídeo se descompone en
            tickers individuales con tesis, veredicto, precio objetivo y minuto exacto.
            Pulsa "🔄 Escanear canal" para detectar nuevos, "🔔 Procesar pendientes" para descargarlos vía tu Mac.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pendingCount > 0 && (
            <button
              onClick={handleProcessNow}
              disabled={processing || isOffline}
              title="Pide a tu Mac que descargue las transcripciones y las analice con Claude Opus. Tu Mac debe estar encendido y con el agente activo."
              style={{
                padding: '8px 14px', borderRadius: 8,
                border: '1px solid #64d2ff',
                background: processing ? 'rgba(100,210,255,.05)' : 'rgba(100,210,255,.12)',
                color: '#64d2ff', fontSize: 11, fontWeight: 700,
                cursor: processing ? 'wait' : 'pointer',
                fontFamily: 'var(--fm)',
                opacity: isOffline ? 0.5 : 1,
              }}
            >
              {processing ? `⏳ Procesando…` : `🔔 Procesar ${pendingCount} vídeo${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''}`}
            </button>
          )}
          <button
            onClick={handleScan}
            disabled={scanning || isOffline || !selectedChannelId}
            style={{
              padding: '8px 14px', borderRadius: 8,
              border: '1px solid var(--gold)',
              background: scanning || isOffline ? 'transparent' : 'rgba(200,164,78,.1)',
              color: 'var(--gold)', fontSize: 11, fontWeight: 700,
              cursor: (scanning || isOffline) ? 'wait' : 'pointer',
              fontFamily: 'var(--fm)',
              opacity: (isOffline || !selectedChannelId) ? 0.5 : 1,
            }}
          >
            {scanning ? '⏳ Escaneando…' : '🔄 Escanear canal'}
          </button>
        </div>
      </div>

      {/* Channel sub-tabs row */}
      <div
        style={{
          display: 'flex', gap: 8, alignItems: 'center',
          overflowX: 'auto', paddingBottom: 6, marginBottom: 12,
        }}
      >
        {channels.map(ch => {
          const active = ch.channel_id === selectedChannelId;
          return (
            <div
              key={ch.channel_id}
              onClick={() => { setSelectedChannelId(ch.channel_id); }}
              style={channelPill(active)}
            >
              <span>{ch.name || ch.handle || ch.channel_id}</span>
              <span style={{
                fontSize: 10, fontWeight: 600,
                padding: '1px 6px', borderRadius: 10,
                background: active ? 'rgba(200,164,78,.2)' : 'var(--subtle-bg)',
                color: active ? 'var(--gold)' : 'var(--text-tertiary)',
              }}>
                {ch.video_count ?? 0}
              </span>
              <span
                onClick={(e) => handleDeleteChannel(ch, e)}
                title="Eliminar canal"
                style={{
                  marginLeft: 2, fontSize: 12, lineHeight: 1,
                  color: 'var(--text-tertiary)', cursor: 'pointer',
                  padding: '0 2px',
                }}
              >
                ×
              </span>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => { setAddError(null); setAddChannelInput(''); setShowAddChannel(true); }}
          style={addChannelBtn}
          disabled={isOffline}
        >
          + Añadir canal
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
              ? (channels.length === 0
                  ? 'Añade un canal con "+ Añadir canal" para empezar.'
                  : 'Pulsa "🔄 Escanear canal" para detectar los vídeos. Luego ejecuta scripts/scan-youtube.sh en el Mac.')
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

      {/* Add channel modal */}
      {showAddChannel && (
        <div
          onClick={() => { setShowAddChannel(false); setAddError(null); }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480, maxWidth: '90vw',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
              fontFamily: 'var(--fm)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gold)', marginBottom: 12, fontFamily: 'var(--fd)' }}>
              Añadir canal de YouTube
            </div>
            <input
              type="text"
              value={addChannelInput}
              onChange={(e) => setAddChannelInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddChannel(); }}
              placeholder="URL del canal o @handle"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${addError ? 'var(--red)' : 'var(--border)'}`,
                background: 'var(--subtle-bg)',
                color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'var(--fm)',
                outline: 'none',
              }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>
              Ejemplos: @eldividendo3101, https://youtube.com/@foo, https://www.youtube.com/channel/UCxxx
            </div>
            {addError && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>
                {addError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setShowAddChannel(false); setAddError(null); }}
                style={{
                  padding: '8px 14px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--fm)',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAddChannel}
                disabled={!addChannelInput.trim() || addingChannel}
                style={{
                  padding: '8px 14px', borderRadius: 8,
                  border: '1px solid var(--gold)',
                  background: (!addChannelInput.trim() || addingChannel) ? 'transparent' : 'rgba(200,164,78,.12)',
                  color: 'var(--gold)', fontSize: 11, fontWeight: 700,
                  cursor: (!addChannelInput.trim() || addingChannel) ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--fm)',
                  opacity: (!addChannelInput.trim() || addingChannel) ? 0.5 : 1,
                }}
              >
                {addingChannel ? '⏳ Añadiendo…' : 'Añadir'}
              </button>
            </div>
          </div>
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
                  {c.risks && (Array.isArray(c.risks) ? c.risks.length > 0 : !!c.risks) && (
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
