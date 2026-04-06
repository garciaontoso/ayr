import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../api/client';
import { clearAllCache } from '../../api/cache';
import { fDol, _sf } from '../../utils/formatters';
import { APP_VERSION } from '../../constants';

export default function ProfilePage() {
  const { privacy, setPrivacy, nlv, totalDivAnnual, portfolioYield, positions, loadAll } = useApp();
  const [fire, setFire] = useState(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    apiFetch('/api/fire').then(d => setFire(d)).catch(() => {});
  }, []);

  const handleClearCache = async () => {
    setClearing(true);
    await clearAllCache();
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    setClearing(false);
    alert('Cache cleared');
  };

  const handleForceRefresh = async () => {
    await loadAll(true);
  };

  const pv = v => privacy ? '***' : v;

  return (
    <div className="page">
      {/* Summary card */}
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 32,
            background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 8px', fontSize: 24, fontWeight: 700, color: '#000'
          }}>
            A&R
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>A&R Portfolio</div>
          <div className="muted" style={{ fontSize: 12 }}>v{APP_VERSION}</div>
        </div>
        <div className="grid-3">
          <div style={{ textAlign: 'center' }}>
            <div className="metric-label">NLV</div>
            <div className="metric-value">{pv(fDol(nlv))}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="metric-label">Dividends</div>
            <div className="metric-value green">{pv(fDol(totalDivAnnual))}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="metric-label">Positions</div>
            <div className="metric-value">{positions.length}</div>
          </div>
        </div>
      </div>

      {/* FIRE Goals */}
      {fire && (
        <div className="card">
          <div className="section-title" style={{ padding: 0, marginBottom: 12 }}>FIRE Goals</div>
          {fire.freedom_number && (
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="metric-label" style={{ margin: 0 }}>Freedom Number</span>
              <span className="metric-value">{pv(fDol(fire.freedom_number))}</span>
            </div>
          )}
          {fire.coverage != null && (
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="metric-label" style={{ margin: 0 }}>Coverage</span>
              <span className="metric-value green">{_sf((fire.coverage || 0) * 100, 1)}%</span>
            </div>
          )}
          {fire.years_to_fire != null && (
            <div className="row-between">
              <span className="metric-label" style={{ margin: 0 }}>Years to FIRE</span>
              <span className="metric-value">{_sf(fire.years_to_fire, 1)}</span>
            </div>
          )}
          {/* Progress bar */}
          {fire.coverage != null && (
            <div style={{ marginTop: 12, height: 6, background: 'var(--border)', borderRadius: 3 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${Math.min((fire.coverage || 0) * 100, 100)}%`,
                background: 'var(--green)',
              }} />
            </div>
          )}
        </div>
      )}

      {/* Settings */}
      <div className="section-title">Settings</div>

      <div className="profile-item" onClick={() => setPrivacy(!privacy)}>
        <span>Privacy Mode</span>
        <div style={{
          width: 44, height: 24, borderRadius: 12,
          background: privacy ? 'var(--green)' : 'var(--border)',
          position: 'relative', transition: 'background 0.2s',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 10,
            background: '#fff', position: 'absolute', top: 2,
            left: privacy ? 22 : 2, transition: 'left 0.2s',
          }} />
        </div>
      </div>

      <div className="profile-item" onClick={handleForceRefresh}>
        <span>Force Refresh</span>
        <span className="muted" style={{ fontSize: 12 }}>Reload all data</span>
      </div>

      <div className="profile-item" onClick={handleClearCache}>
        <span>Clear Cache</span>
        <span className="muted" style={{ fontSize: 12 }}>{clearing ? 'Clearing...' : 'Free offline storage'}</span>
      </div>

      <div className="profile-item">
        <span>Install App</span>
        <span className="muted" style={{ fontSize: 12 }}>Share &rarr; Add to Home Screen</span>
      </div>

      <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text3)', fontSize: 11 }}>
        A&R Portfolio Tracker v{APP_VERSION}<br />
        API: aar-api.garciaontoso.workers.dev
      </div>
    </div>
  );
}
