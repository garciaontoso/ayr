// MetricHistoryChart — annual line chart for a single metric across N years.
// Used by DashTab (inline), QualityTab and DebtTab to give visual depth to
// click-to-explore metrics. Self-contained: no context dependencies.
//
// Props:
//   label    — string shown as chart title (e.g. "ROE", "Deuda Neta / FCF")
//   years    — array of year numbers in chart order (oldest → newest)
//   values   — array of numbers (or null) parallel to years
//   format   — fn(v) → string; same formatter used in cards/tables
//   color    — hex string (default mid-green)
//   onClose  — optional callback for the "← cerrar" button
import { _sf } from '../../utils/formatters';

export default function MetricHistoryChart({ label, years, values, format, color = '#34d399', onClose }) {
  const validVals = values.filter(v => v != null && Number.isFinite(v));
  if (validVals.length < 2) {
    return (
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:"16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:13,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>{label}</div>
        <span style={{fontSize:11,color:"var(--text-tertiary)"}}>Sin histórico suficiente</span>
        {onClose && <button onClick={onClose} style={{padding:"4px 10px",borderRadius:7,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fb)"}}>✕</button>}
      </div>
    );
  }
  const minV = Math.min(...validVals);
  const maxV = Math.max(...validVals);
  const pad = Math.max((maxV - minV) * 0.1, Math.abs(maxV) * 0.05, 0.001);
  const yMin = minV - pad;
  const yMax = maxV + pad;
  const range = yMax - yMin || 1;
  const W = 900; const H = 280; const PAD = 60;
  const lastV = values[values.length - 1] ?? validVals[validVals.length - 1];
  const firstV = validVals[0];
  const chgPct = firstV !== 0 && firstV != null && lastV != null ? ((lastV - firstV) / Math.abs(firstV)) * 100 : null;
  const trendCol = chgPct == null ? color : chgPct >= 0 ? '#34d399' : '#f87171';

  const pts = values.map((v, i) => {
    if (v == null || !Number.isFinite(v)) return null;
    const x = PAD + (i / (values.length - 1 || 1)) * (W - PAD);
    const y = H - ((v - yMin) / range) * H;
    return { x, y, v, i };
  }).filter(Boolean);
  const polyPts = pts.map(p => `${p.x},${p.y}`).join(' ');
  const gridLines = 5;
  const gridVals = Array.from({length: gridLines+1}, (_,i) => yMin + (range * i / gridLines));

  return (
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:"16px 16px 8px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{display:"flex",alignItems:"baseline",gap:10}}>
          <span style={{fontSize:13,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>{label}</span>
          <span style={{fontSize:20,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{format(lastV)}</span>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{validVals.length} años</span>
          {chgPct != null && <span style={{fontSize:14,fontWeight:700,color:trendCol,fontFamily:"var(--fm)",padding:"3px 10px",borderRadius:6,background:`${trendCol}15`}}>{chgPct>=0?"+":""}{_sf(chgPct,0)}%</span>}
          {onClose && <button onClick={onClose} style={{padding:"4px 10px",borderRadius:7,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fb)"}}>✕</button>}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H+25}`} style={{width:"100%",height:"auto"}}>
        <defs><linearGradient id={`mhc-grad-${label.replace(/\W/g,'')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={trendCol} stopOpacity=".2"/><stop offset="100%" stopColor={trendCol} stopOpacity="0"/></linearGradient></defs>
        {gridVals.map((v,i) => {const yPos = H - ((v-yMin)/range)*H; return <g key={i}><line x1={PAD} y1={yPos} x2={W} y2={yPos} stroke="var(--subtle-border)" strokeWidth="0.5"/><text x={PAD-4} y={yPos+3} fill="var(--text-tertiary)" fontSize="8" fontFamily="var(--fm)" textAnchor="end">{format(v)}</text></g>;})}
        {years.map((yr,i) => {const x = PAD + (i / (years.length - 1 || 1)) * (W - PAD); return <g key={i}><line x1={x} y1={0} x2={x} y2={H} stroke="var(--subtle-bg2)" strokeWidth="0.5"/><text x={x} y={H+16} fill="var(--text-tertiary)" fontSize="9" fontFamily="var(--fm)" textAnchor="middle">{String(yr).slice(2)}</text></g>;})}
        {pts.length >= 2 && <polygon points={`${pts[0].x},${H} ${polyPts} ${pts[pts.length-1].x},${H}`} fill={`url(#mhc-grad-${label.replace(/\W/g,'')})`}/>}
        <polyline points={polyPts} fill="none" stroke={trendCol} strokeWidth="2" strokeLinejoin="round"/>
        {pts.map(p => <circle key={p.i} cx={p.x} cy={p.y} r="3" fill={trendCol} stroke="var(--bg)" strokeWidth="1"/>)}
      </svg>
    </div>
  );
}
