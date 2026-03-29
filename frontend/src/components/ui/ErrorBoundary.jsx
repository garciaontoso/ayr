import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          margin: 24, padding: '24px 28px', background: 'rgba(255,69,58,.06)',
          border: '1px solid rgba(255,69,58,.2)', borderRadius: 12,
          fontFamily: 'var(--fm)', textAlign: 'center'
        }}>
          <div style={{ fontSize: 14, color: 'var(--red)', marginBottom: 8 }}>
            Algo salió mal en este componente
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16 }}>
            {this.state.error?.message || 'Error desconocido'}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '6px 16px', borderRadius: 8,
              border: '1px solid rgba(255,69,58,.3)', background: 'rgba(255,69,58,.1)',
              color: 'var(--red)', fontSize: 11, cursor: 'pointer',
              fontFamily: 'var(--fm)', fontWeight: 600
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
