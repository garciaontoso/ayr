import { clamp } from '../../utils/formatters';

const DonutChart = ({value, max=100, size=130, strokeW=10, color, label, sublabel}) => {
  const pct = clamp(value/max, 0, 1);
  const r = (size-strokeW)/2;
  const circ = 2*Math.PI*r;
  const offset = circ * (1-pct);
  const c = color || (pct>=.7?"var(--green)":pct>=.4?"var(--yellow)":"var(--red)");
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a202c" strokeWidth={strokeW}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={strokeW} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{transition:"stroke-dashoffset 1s ease"}}/>
      </svg>
      <div style={{position:"relative",marginTop:-size/2-16,textAlign:"center",height:size/2+16,display:"flex",flexDirection:"column",justifyContent:"center"}}>
        <div style={{fontSize:28,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{Math.round(value)}</div>
        {sublabel && <div style={{fontSize:9,color:"var(--text-secondary)"}}>{sublabel}</div>}
      </div>
      {label && <div style={{fontSize:11,color:"var(--text-secondary)",fontWeight:500,marginTop:4}}>{label}</div>}
    </div>
  );
};

export default DonutChart;
