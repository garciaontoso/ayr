import { useApp } from '../../context/AppContext';
import { fDol } from '../../utils/formatters';

export default function Header() {
  const { nlv, loading, privacy, lastUpdate } = useApp();
  const isLive = lastUpdate && (Date.now() - lastUpdate.getTime()) < 120000;

  return (
    <div className="app-header">
      <div>
        <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500 }}>A&R Portfolio</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          {loading ? <span className="skeleton" style={{ display: 'inline-block', width: 100, height: 20 }} /> :
            privacy ? '***' : fDol(nlv)}
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {isLive && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#000',
            background: 'var(--green)', padding: '2px 8px', borderRadius: 10,
          }}>LIVE</span>
        )}
      </div>
    </div>
  );
}
