import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null, retried: false };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    // Auto-reload on chunk load failures (happens after deployments)
    const msg = error?.message || '';
    const isChunk = msg.includes('dynamically imported module') || msg.includes('Loading chunk') || msg.includes('Failed to fetch') || msg.includes('MIME type') || msg.includes('text/html');
    if (isChunk && !this.state.retried) {
      this.setState({ retried: true });
      // Clear SW cache to force fresh chunks
      caches.keys().then(keys => keys.forEach(k => { if (k.startsWith('ayr-v')) caches.delete(k); })).catch(() => {});
      setTimeout(() => window.location.reload(), 200);
    }
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || '';
      const isChunkError = msg.includes('dynamically imported module') || msg.includes('MIME type') || msg.includes('text/html') || msg.includes('Loading chunk');
      return (
        <div style={{
          margin: 24, padding: '24px 28px', background: 'rgba(255,69,58,.06)',
          border: '1px solid rgba(255,69,58,.2)', borderRadius: 12,
          fontFamily: 'var(--fm)', textAlign: 'center'
        }}>
          <div style={{ fontSize: 14, color: 'var(--red)', marginBottom: 8 }}>
            {isChunkError ? 'Nueva versión disponible' : 'Algo salió mal en este componente'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16 }}>
            {isChunkError ? 'Se ha desplegado una actualización. Recargando...' : (this.state.error?.message || 'Error desconocido')}
          </div>
          <button
            onClick={() => isChunkError ? window.location.reload() : this.setState({ error: null, retried: false })}
            style={{
              padding: '6px 16px', borderRadius: 8,
              border: '1px solid rgba(255,69,58,.3)', background: 'rgba(255,69,58,.1)',
              color: 'var(--red)', fontSize: 11, cursor: 'pointer',
              fontFamily: 'var(--fm)', fontWeight: 600
            }}
          >
            {isChunkError ? 'Recargar página' : 'Reintentar'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
