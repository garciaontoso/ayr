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
    if ((msg.includes('dynamically imported module') || msg.includes('Loading chunk') || msg.includes('Failed to fetch')) && !this.state.retried) {
      this.setState({ retried: true });
      window.location.reload();
    }
  }

  render() {
    if (this.state.error) {
      const isChunkError = (this.state.error?.message || '').includes('dynamically imported module');
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
