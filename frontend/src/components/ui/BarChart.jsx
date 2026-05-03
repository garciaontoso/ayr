import { n, f0 } from '../../utils/formatters';

const BarChart = ({data, labels, color="var(--gold)", height=140, showValues=true, formatFn=f0}) => {
  const valid = data.map((v,i) => ({v:n(v),l:labels[i]})).filter(x=>x.v!=null);
  if(valid.length<2) return <div style={{color:"var(--text-tertiary)",fontSize:12,textAlign:"center",padding:20}}>Datos insuficientes</div>;
  const max = Math.max(...valid.map(x=>Math.abs(x.v)), 1);
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:2,height,padding:"0 4px"}}>
      {valid.map((x,i) => {
        const h = (Math.abs(x.v)/max) * (height - 28);
        const isNeg = x.v < 0;
        return (
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%",minWidth:0}}>
            {showValues && <span style={{fontSize:8,color:"var(--text-secondary)",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden"}}>{formatFn(x.v)}</span>}
            <div style={{width:"100%",maxWidth:32,height:h,background:isNeg ? "rgba(252,129,129,.3)" : `${color}33`,borderRadius:"3px 3px 0 0",border:`1px solid ${isNeg?"var(--red)":color}`,borderBottom:"none",transition:"height .5s ease",position:"relative"}}>
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:"40%",background:isNeg?"rgba(255,69,58,.15)":`${color}15`,borderRadius:"0 0 0 0"}}/>
            </div>
            <span style={{fontSize:7.5,color:"var(--text-tertiary)",marginTop:3,fontFamily:"var(--fm)"}}>{x.l}</span>
          </div>
        );
      })}
    </div>
  );
};

export default BarChart;
