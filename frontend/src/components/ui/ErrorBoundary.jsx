import { Component } from 'react';

const API_URL = 'https://api.onto-so.com';
const BUILD_ID = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_BUILD_ID || 'dev') : 'dev';

// Fire-and-forget error report to /api/error-log. Silently swallows any
// network failure — we must never cause a recursion from the error handler.
function reportError(payload) {
  try {
    fetch(`${API_URL}/api/error-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buildId: BUILD_ID, ...payload }),
    }).catch(() => {});
  } catch (_) {}
}

export default class ErrorBoundary extends Component {
  state = { error: null, retried: false, extraNote: '', showReport: false };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);

    // Report to /api/error-log (production + dev-override flag)
    const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD;
    const forceLog = typeof localStorage !== 'undefined' && localStorage.getItem('ayr_force_error_log') === '1';
    if (isProd || forceLog) {
      reportError({
        severity: 'error',
        message: error?.message || String(error),
        stack: error?.stack || '',
        url: typeof window !== 'undefined' ? window.location.href : '',
        context: JSON.stringify({ componentStack: info?.componentStack }),
        tab: typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('tab') || '') : '',
      });
    }

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

  handleSendExtra = () => {
    const note = this.state.extraNote.trim();
    if (!note) return;
    reportError({
      severity: 'info',
      message: `User report: ${note}`,
      stack: this.state.error?.stack || '',
      url: typeof window !== 'undefined' ? window.location.href : '',
      context: JSON.stringify({ userNote: note, errorMessage: this.state.error?.message }),
    });
    this.setState({ showReport: false, extraNote: '' });
    alert('Gracias — reporte enviado.');
  };

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
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
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
            {!isChunkError && (
              <button
                onClick={() => this.setState(s => ({ showReport: !s.showReport }))}
                style={{
                  padding: '6px 16px', borderRadius: 8,
                  border: '1px solid rgba(200,164,78,.3)', background: 'rgba(200,164,78,.08)',
                  color: '#c8a44e', fontSize: 11, cursor: 'pointer',
                  fontFamily: 'var(--fm)', fontWeight: 600
                }}
              >
                Reportar otro detalle
              </button>
            )}
          </div>
          {this.state.showReport && (
            <div style={{ marginTop: 16, textAlign: 'left' }}>
              <textarea
                value={this.state.extraNote}
                onChange={e => this.setState({ extraNote: e.target.value })}
                placeholder="Describe qué estabas haciendo cuando ocurrió el error..."
                style={{
                  width: '100%', minHeight: 80, padding: '8px 10px', boxSizing: 'border-box',
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--fb)',
                  resize: 'vertical'
                }}
              />
              <button
                onClick={this.handleSendExtra}
                style={{
                  marginTop: 8, padding: '6px 16px', borderRadius: 8,
                  border: '1px solid rgba(200,164,78,.4)', background: 'rgba(200,164,78,.15)',
                  color: '#c8a44e', fontSize: 11, cursor: 'pointer',
                  fontFamily: 'var(--fm)', fontWeight: 700
                }}
              >
                Enviar reporte
              </button>
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
