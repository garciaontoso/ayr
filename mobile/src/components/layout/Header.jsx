import { useApp } from '../../context/AppContext';
import { fDol } from '../../utils/formatters';

const SnowballIcon = () => (
  <svg viewBox="0 0 20 20" width="13" height="13">
    <circle cx="4" cy="9" r="2" fill="#484f58"/>
    <circle cx="9" cy="11" r="3" fill="#8b949e"/>
    <circle cx="15" cy="12" r="5" fill="#e6edf3"/>
  </svg>
);

function getTimeAgo(date) {
  if (!date) return null;
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return 'Older';
}

export default function Header() {
  const { nlv, loading, refreshing, privacy, lastUpdate } = useApp();
  const isLive = lastUpdate && (Date.now() - lastUpdate.getTime()) < 120000;
  const timeAgo = getTimeAgo(lastUpdate);

  return (
    <div className="app-header">
      <div>
        <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
          <SnowballIcon />
          Snowball
          {timeAgo && !isLive && (
            <span style={{ color: 'var(--text3)', marginLeft: 2 }}>&middot; {timeAgo}</span>
          )}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px' }}>
          {loading && !nlv ? <span className="skeleton" style={{ display: 'inline-block', width: 90, height: 18 }} /> :
            privacy ? '***' : fDol(nlv)}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {refreshing && (
          <span style={{ fontSize: 9, color: 'var(--text3)' }}>updating...</span>
        )}
        {isLive && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#000',
            background: 'var(--green)', padding: '2px 7px', borderRadius: 8,
          }}>LIVE</span>
        )}
      </div>
    </div>
  );
}
