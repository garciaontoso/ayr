import { n } from '../../utils/formatters.js';

const AreaSparkline = ({data, color="var(--gold)", w=160, h=40}) => {
  const valid = data.filter(v=>n(v)!=null);
  if(valid.length<2) return <span style={{color:"var(--text-tertiary)",fontSize:11}}>—</span>;
  const mn = Math.min(...valid), mx = Math.max(...valid), rng = mx-mn||1;
  const pts = valid.map((v,i)=>`${(i/(valid.length-1))*w},${h-4-((v-mn)/rng)*(h-8)}`);
  const areapts = `0,${h} ${pts.join(" ")} ${w},${h}`;
  const trend = valid[valid.length-1] >= valid[0];
  const c = trend ? "var(--green)" : "var(--red)";
  return (
    <svg width={w} height={h} style={{display:"block"}}>
      <defs><linearGradient id={`g${color.replace(/[^a-z0-9]/gi,'')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity=".2"/><stop offset="100%" stopColor={c} stopOpacity="0"/></linearGradient></defs>
      <polygon points={areapts} fill={`url(#g${color.replace(/[^a-z0-9]/gi,'')})`}/>
      <polyline points={pts.join(" ")} fill="none" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={w} cy={h-4-((valid[valid.length-1]-mn)/rng)*(h-8)} r={2.5} fill={c}/>
    </svg>
  );
};

export default AreaSparkline;
