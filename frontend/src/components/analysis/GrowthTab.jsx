import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { _sf, n, fP, fC, fM, div, cagrFn } from '../../utils/formatters.js';
import { YEARS } from '../../constants/index.js';

export default function GrowthTab() {
  const { comp, fin, fmpExtra } = useAnalysis();
    const yrs5 = YEARS.slice(0,6); // 5y
    const yrs10 = YEARS.slice(0,11); // 10y
    const metrics = [
      {k:"revenue",l:"Ventas",fn:y=>fin[y]?.revenue},
      {k:"netIncome",l:"Beneficio Neto",fn:y=>fin[y]?.netIncome},
      {k:"eps",l:"EPS",fn:y=>fin[y]?.eps},
      {k:"bvps",l:"BVPS",fn:y=>comp[y]?.bvps},
      {k:"fcfps",l:"FCF/Acción",fn:y=>comp[y]?.fcfps},
      {k:"dps",l:"Dividendo/Acción",fn:y=>fin[y]?.dps},
    ];
    const calcCAGR = (metric, nYrs) => {
      const dataYrs = YEARS.filter(y => fin[y]?.revenue > 0);
      if (dataYrs.length < nYrs + 1) return null;
      const end = metric.fn(dataYrs[0]); const start = metric.fn(dataYrs[nYrs]);
      return cagrFn(end, start, nYrs);
    };
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📈 Crecimiento Histórico</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>CAGRs a 3, 5 y 10 años. Rule #1 exige ≥10% en las Big Five Numbers.</p>
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:140,fontFamily:"var(--fm)",fontSize:10}}>MÉTRICA</th>
              {["3a","5a","10a"].map(p=><th key={p} style={{padding:"10px 12px",textAlign:"center",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:90,fontFamily:"var(--fm)",fontSize:10}}>CAGR {p}</th>)}
              {YEARS.slice(0,8).map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",minWidth:72,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
            </tr></thead>
            <tbody>{metrics.map((m,i)=>(
              <tr key={m.k} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"7px 14px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid #21262d"}}>{m.l}</td>
                {[3,5,10].map(p=>{
                  const c = calcCAGR(m, p);
                  const color = n(c)==null?"var(--text-tertiary)":c>=0.10?"var(--green)":c>=0.05?"var(--yellow)":c>=0?"var(--orange)":"var(--red)";
                  return <td key={p} style={{padding:"7px 12px",textAlign:"center",borderBottom:"1px solid #21262d"}}>
                    <span style={{fontSize:13,fontWeight:700,color,fontFamily:"var(--fm)"}}>{fP(c)}</span>
                  </td>;
                })}
                {YEARS.slice(0,8).map(y=>{
                  const v = m.fn(y);
                  return <td key={y} style={{padding:"7px 6px",textAlign:"right",color:n(v)!=null&&v<0?"var(--red)":"var(--text-primary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{m.k==="revenue"||m.k==="netIncome"?fM(v):fC(v)}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </Card>
        <Card style={{marginTop:16,background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:10,fontFamily:"var(--fd)"}}>🎯 ¿Qué busca Phil Town?</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.7}}>
            <div><strong style={{color:"var(--green)"}}>≥10% ✓ REGLA DE ORO</strong><br/>La empresa tiene un moat real y está creciendo. Es la señal más clara de una empresa Wonderful.</div>
            <div><strong style={{color:"var(--yellow)"}}>5–10% ⚠ ACEPTABLE</strong><br/>Puede ser un buen negocio pero sin ventaja competitiva clara. Requiere más análisis.</div>
            <div><strong style={{color:"var(--red)"}}>{"<"}5% ✗ EVITAR</strong><br/>Por debajo del umbral Rule #1. El capital se destruye o la empresa está estancada.</div>
          </div>
        </Card>

        {/* FMP Financial Growth — precalculated YoY growth rates */}
        {fmpExtra.finGrowth?.length > 0 && (
          <Card title="FMP Growth Rates (YoY precalculados)" icon="📊" style={{marginTop:16,overflowX:"auto",padding:0}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr>
                <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"8px 12px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9,minWidth:150}}>GROWTH RATE</th>
                {fmpExtra.finGrowth.slice(0,6).map((g,i)=><th key={i} style={{padding:"8px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9}}>{g.date?.slice(0,4)||g.calendarYear||"—"}</th>)}
              </tr></thead>
              <tbody>
                {[
                  {l:"Revenue Growth",k:"revenueGrowth"},
                  {l:"Net Income Growth",k:"netIncomeGrowth"},
                  {l:"EPS Growth",k:"epsdilutedGrowth"},
                  {l:"FCF Growth",k:"freeCashFlowGrowth"},
                  {l:"Dividend Growth",k:"dividendsPerShareGrowth"},
                  {l:"Book Value Growth",k:"bookValueperShareGrowth"},
                  {l:"Operating CF Growth",k:"operatingCashFlowGrowth"},
                ].map((row,i)=>(
                  <tr key={row.k} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                    <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"6px 12px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid #21262d",fontSize:11}}>{row.l}</td>
                    {fmpExtra.finGrowth.slice(0,6).map((g,j)=>{
                      const v = g[row.k];
                      const color = v==null?"var(--text-tertiary)":v>=0.10?"var(--green)":v>=0.05?"var(--yellow)":v>=0?"var(--orange)":"var(--red)";
                      return <td key={j} style={{padding:"6px 6px",textAlign:"right",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)",color,fontWeight:600}}>
                        {v!=null?`${v>=0?"+":""}${_sf(v*100,1)}%`:"—"}
                      </td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    );
}
