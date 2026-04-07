import { memo } from 'react';
import { _sf } from '../../utils/formatters';

const BAR_H = 120;

function BarChart({ data, height = BAR_H, formatValue }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => Math.abs(d.value || 0)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, padding: '0 4px' }}>
      {data.map((d, i) => {
        const val = d.value || 0;
        const barH = Math.max((Math.abs(val) / maxVal) * height * 0.85, 2);
        const label = formatValue
          ? (val > 0 ? formatValue(val) : '')
          : (Math.abs(val) >= 1000 ? `${_sf(val / 1000, 1)}K` : val > 0 ? _sf(val, 0) : '');
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            {label && <div style={{ fontSize: 8, color: 'var(--text2)', marginBottom: 2, whiteSpace: 'nowrap' }}>{label}</div>}
            <div style={{
              width: '100%', borderRadius: '3px 3px 0 0',
              height: barH,
              background: d.color || 'var(--blue)',
              opacity: val > 0 ? 1 : 0.3,
            }} />
            <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 3 }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(BarChart);
