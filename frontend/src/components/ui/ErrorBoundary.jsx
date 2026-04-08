import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null, retried: false };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    // Auto-reload on chunk load failures (happens after deployments).
    // CRITICAL: never clear the cache or reload when offline — that would
    // delete the only copy of the chunks the user has and trap them on a
    // blank screen. The SW already serves a graceful stub for missing
    // chunks when offline (see public/sw.js#offlineErrorResponse), so this
    // path should rarely fire offline at all.
    const msg = error?.message || '';
    const isChunk = msg.includes('dynamically imported module') || msg.includes('Loading chunk') || msg.includes('Failed to fetch') || msg.includes('MIME type') || msg.includes('text/html');
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isChunk && !this.state.retried && !isOffline) {
      this.setState({ retried: true });
      // Clear SW cache to force fresh chunks (only safe online)
      caches.keys().then(keys => keys.forEach(k => { if (k.startsWith('ayr-v')) caches.delete(k); })).catch(() => {});
      setTimeout(() => window.location.reload(), 200);
    }
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || '';
      const isChunkError = msg.includes('dynamically imported module') || msg.includes('MIME type') || msg.includes('text/html') || msg.includes('Loading chunk');
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const title = isOffline && isChunkError
        ? 'Esta vista no está disponible offline'
        : isChunkError ? 'Nueva versión disponible' : 'Algo salió mal en este componente';
      const desc = isOffline && isChunkError
        ? 'Vuelve a una pestaña ya cargada o conéctate para ver esta. El resto de la app sigue funcionando.'
        : isChunkError ? 'Se ha desplegado una actualización. Recargando...' : (this.state.error?.message || 'Error desconocido');
      const cta = isOffline ? 'Volver atrás' : (isChunkError ? 'Recargar página' : 'Reintentar');
      return (
        <div style={{
          margin: 24, padding: '24px 28px', background: 'rgba(255,69,58,.06)',
          border: '1px solid rgba(255,69,58,.2)', borderRadius: 12,
          fontFamily: 'var(--fm)', textAlign: 'center'
        }}>
          <div style={{ fontSize: 14, color: 'var(--red)', marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16 }}>{desc}</div>
          <button
            onClick={() => {
              if (isOffline) { this.setState({ error: null, retried: false }); window.history.back(); return; }
              if (isChunkError) { window.location.reload(); return; }
              this.setState({ error: null, retried: false });
            }}
            style={{
              padding: '6px 16px', borderRadius: 8,
              border: '1px solid rgba(255,69,58,.3)', background: 'rgba(255,69,58,.1)',
              color: 'var(--red)', fontSize: 11, cursor: 'pointer',
              fontFamily: 'var(--fm)', fontWeight: 600
            }}
          >
            {cta}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
