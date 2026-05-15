import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants';

/**
 * 🏦 BankConnectModal
 *
 * Modal para conectar bancos vía GoCardless Bank Account Data API.
 * Flow:
 *   1. Lista bancos disponibles (España) → /api/gocardless/banks
 *   2. Click en banco → /api/gocardless/init-consent → abre link OAuth
 *   3. Usuario autoriza en su banco → callback redirect a A&R
 *   4. Lista de consents activos con Sync Now + Revoke
 */
export default function BankConnectModal({ onClose }) {
  const [banks, setBanks] = useState([]);
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [country, setCountry] = useState('ES');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bRes, cRes] = await Promise.all([
        fetch(`${API_URL}/api/gocardless/banks?country=${country}`),
        fetch(`${API_URL}/api/gocardless/consents`),
      ]);
      if (!bRes.ok) {
        const errBody = await bRes.json().catch(() => ({}));
        if (errBody.error?.includes('GOCARDLESS_SECRET')) {
          setError('GoCardless no configurado todavía. Necesitas crear cuenta en bankaccountdata.gocardless.com y subir las API keys con `wrangler secret put GOCARDLESS_SECRET_ID` y `GOCARDLESS_SECRET_KEY`.');
        } else {
          setError(errBody.error || `HTTP ${bRes.status}`);
        }
        return;
      }
      const bData = await bRes.json();
      const cData = await cRes.json();
      setBanks(bData.banks || []);
      setConsents(cData.consents || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [country]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleConnect = async (bank) => {
    setConnecting(bank.id);
    try {
      const r = await fetch(`${API_URL}/api/gocardless/init-consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution_id: bank.id,
          label: bank.name,
          max_historical_days: Math.min(bank.transaction_total_days || 180, 730),
          access_valid_for_days: 90,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.link) {
        alert(`Error conectando ${bank.name}: ${data.error || 'sin link'}`);
        return;
      }
      // Abrir link OAuth en nueva ventana
      window.open(data.link, '_blank', 'width=500,height=700');
      alert(`Se ha abierto una ventana para autorizar ${bank.name}. Tras autorizar, vuelve aquí y refresca.`);
      fetchData();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleSync = async (reqId) => {
    setSyncing(reqId);
    try {
      const r = await fetch(`${API_URL}/api/gocardless/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requisition_id: reqId, days_back: 30 }),
      });
      const data = await r.json();
      if (!r.ok) {
        alert(`Sync error: ${data.error}`);
      } else {
        alert(`✓ ${data.inserted} transacciones nuevas (${data.skipped} ya existían)`);
        fetchData();
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setSyncing(null);
    }
  };

  const handleRevoke = async (reqId, name) => {
    if (!confirm(`¿Revocar conexión con ${name}? Tendrás que volver a autorizar.`)) return;
    try {
      const r = await fetch(`${API_URL}/api/gocardless/consent/${encodeURIComponent(reqId)}`, { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) alert(`Error: ${data.error}`); else fetchData();
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
  };

  const filteredBanks = banks.filter(b =>
    !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.bic?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
        padding: 20, maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>🏦 Conectar Banco — Open Banking (GoCardless)</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              Sincronización automática de transacciones via PSD2. Consent válido 90 días.
            </div>
          </div>
          <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--subtle-bg)', cursor: 'pointer' }}>✕</button>
        </div>

        {error && (
          <div style={{ padding: 14, background: 'rgba(248,113,113,.08)', border: '1px solid var(--red)', borderRadius: 10, color: 'var(--red)', marginBottom: 14, fontSize: 12 }}>
            ⚠ {error}
          </div>
        )}

        {/* Conexiones activas */}
        {consents.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Conexiones activas ({consents.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {consents.map(c => (
                <div key={c.requisition_id} style={{
                  padding: '10px 12px', background: 'var(--row-alt)', border: '1px solid var(--subtle-border)',
                  borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {c.bank_label || c.institution_name || c.institution_id}
                      <span style={{
                        marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: c.status === 'LINKED' ? 'rgba(74,222,128,.15)' : 'rgba(200,164,78,.15)',
                        color: c.status === 'LINKED' ? 'var(--green)' : 'var(--gold)',
                      }}>{c.status}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--fm)' }}>
                      {c.accounts?.length || 0} cuentas · {c.days_until_expiry != null ? `${c.days_until_expiry}d hasta renovar` : ''} · last sync: {c.last_sync_at?.slice(0, 10) || 'nunca'} ({c.last_sync_count || 0} txns)
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleSync(c.requisition_id)} disabled={syncing === c.requisition_id || c.status !== 'LINKED'} style={{
                      padding: '6px 10px', borderRadius: 6, border: '1px solid var(--green)',
                      background: 'rgba(74,222,128,.1)', color: 'var(--green)', fontSize: 11, cursor: 'pointer',
                    }}>{syncing === c.requisition_id ? '...' : '↻ Sync'}</button>
                    <button onClick={() => handleRevoke(c.requisition_id, c.bank_label || c.institution_id)} style={{
                      padding: '6px 10px', borderRadius: 6, border: '1px solid var(--red)',
                      background: 'rgba(248,113,113,.1)', color: 'var(--red)', fontSize: 11, cursor: 'pointer',
                    }}>Revocar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selector banco nuevo */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Conectar nuevo banco
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <select value={country} onChange={e => setCountry(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-primary)' }}>
            <option value="ES">🇪🇸 España</option>
            <option value="GB">🇬🇧 UK</option>
            <option value="FR">🇫🇷 Francia</option>
            <option value="DE">🇩🇪 Alemania</option>
            <option value="NL">🇳🇱 Holanda</option>
            <option value="IT">🇮🇹 Italia</option>
            <option value="PT">🇵🇹 Portugal</option>
          </select>
          <input
            type="text" placeholder="Buscar banco..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-primary)', flex: 1 }}
          />
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Cargando bancos...</div>
        ) : filteredBanks.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            {error ? '—' : 'No hay bancos que coincidan.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {filteredBanks.map(bank => {
              const isConnecting = connecting === bank.id;
              const alreadyConnected = consents.some(c => c.institution_id === bank.id && c.status === 'LINKED');
              return (
                <button
                  key={bank.id}
                  onClick={() => handleConnect(bank)}
                  disabled={isConnecting || alreadyConnected}
                  style={{
                    padding: '10px 12px', background: alreadyConnected ? 'rgba(74,222,128,.08)' : 'var(--row-alt)',
                    border: `1px solid ${alreadyConnected ? 'var(--green)' : 'var(--subtle-border)'}`,
                    borderRadius: 8, cursor: alreadyConnected ? 'not-allowed' : (isConnecting ? 'wait' : 'pointer'),
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                    opacity: isConnecting ? 0.6 : 1,
                  }}
                >
                  {bank.logo ? (
                    <img src={bank.logo} alt="" style={{ width: 32, height: 32, borderRadius: 4 }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--subtle-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🏦</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bank.name}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                      {alreadyConnected ? '✓ conectado' : `${bank.transaction_total_days || 90}d historial`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 16, lineHeight: 1.6 }}>
          ℹ Al conectar abrirás una ventana de tu banco para autorizar acceso de solo lectura.
          Tras autorizar, vuelve aquí y pulsa <b>↻ Sync</b> manualmente la primera vez (o espera al cron diario).
          El consent expira a los 90 días — A&R te avisa por Telegram para renovarlo.
        </div>
      </div>
    </div>
  );
}
