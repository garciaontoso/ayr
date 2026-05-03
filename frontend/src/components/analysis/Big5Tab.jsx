import { useAnalysis } from '../../context/AnalysisContext';
import { Badge, Card } from '../ui';
import { n, fP, fC, div, cagrFn } from '../../utils/formatters';
import { R } from '../../utils/ratings.js';
import { YEARS } from '../../constants/index.js';

export default function Big5Tab() {
  const { DATA_YEARS, comp, fin, latestDataYear } = useAnalysis();
    // Get years with data
    const yrsWithData = YEARS.filter(y=>fin[y]?.revenue>0);
    const latest = yrsWithData[0];
    if(!latest) return <Card><div style={{textAlign:"center",padding:48,color:"var(--text-tertiary)"}}>Introduce datos financieros para calcular las Big Five Numbers.</div></Card>;

    // Helper: get value for a metric at year y
    const getVal = (metric, y) => {
      if(metric==="roic") return comp[y]?.roicR1;  // Rule #1 ROIC (can be negative)
      if(metric==="revps") return comp[y]?.revps;
      if(metric==="eps") return fin[y]?.eps;  // Allow negatives for display, CAGR logic handles filtering
      if(metric==="bvps") return comp[y]?.bvps;
      if(metric==="fcfps") return comp[y]?.fcfps;
      return null;
    };

    // For CAGR: get positive value or null (skip anomalous negative years)
    const getPosVal = (metric, y) => {
      const v = getVal(metric, y);
      return (n(v) != null && v > 0) ? v : null;
    };

    // Compute CAGRs for each Big Five metric
    const big5Metrics = [
      {key:"roic",  name:"ROIC",             desc:"Net Income / Invested Capital", type:"avg"},
      {key:"revps", name:"Crecimiento Ventas",desc:"Revenue per Share CAGR",       type:"cagr"},
      {key:"eps",   name:"Crecimiento EPS",   desc:"Earnings per Share CAGR",      type:"cagr"},
      {key:"bvps",  name:"Crecimiento BVPS",  desc:"Book Value per Share CAGR",    type:"cagr"},
      {key:"fcfps", name:"Crecimiento FCF",   desc:"Free Cash Flow per Share CAGR",type:"cagr"},
    ];

    const big5Data = big5Metrics.map(m => {
      if(m.type === "avg") {
        // For ROIC, compute average over 1yr, 5yr, 10yr — only positive years
        const getPositiveROIC = (years) => {
          const vals = years.map(y=>getVal(m.key,y)).filter(v=>n(v)!=null && v > 0);
          return vals.length >= 2 ? vals.reduce((s,v)=>s+v,0)/vals.length : null;
        };
        const v1 = getVal(m.key, latest);
        // If latest ROIC is negative (impairment), use most recent positive
        const latestPositive = n(v1)!=null && v1 > 0 ? v1 : getPositiveROIC(yrsWithData.slice(0,3));
        return {
          ...m,
          y1: latestPositive,
          y5: getPositiveROIC(yrsWithData.slice(0,Math.min(5,yrsWithData.length))),
          y10: getPositiveROIC(yrsWithData.slice(0,Math.min(10,yrsWithData.length))),
          y1raw: v1, // raw for display
        };
      } else {
        // CAGR calculation — find most recent positive and oldest positive
        // For latest: use most recent year with positive value
        const findPosLatest = () => {
          for(const y of yrsWithData) { const v = getPosVal(m.key,y); if(v) return {y, v}; }
          return null;
        };
        const posLatest = findPosLatest();
        if(!posLatest) return {...m, y1:null, y5:null, y10:null};
        
        const latestIdx = yrsWithData.indexOf(posLatest.y);
        const y1ago = yrsWithData[latestIdx+1];
        const y5ago = yrsWithData.find((_,i)=>i>=latestIdx+5);
        const y10ago = yrsWithData.find((_,i)=>i>=latestIdx+10);
        
        return {
          ...m,
          y1: y1ago ? cagrFn(posLatest.v, getPosVal(m.key, y1ago), yrsWithData.indexOf(y1ago)-latestIdx) : null,
          y5: y5ago ? cagrFn(posLatest.v, getPosVal(m.key, y5ago), yrsWithData.indexOf(y5ago)-latestIdx) : null,
          y10: y10ago ? cagrFn(posLatest.v, getPosVal(m.key, y10ago), yrsWithData.indexOf(y10ago)-latestIdx) : null,
        };
      }
    });

    // Count how many pass ≥10% on the 10-year column
    const passing10 = big5Data.filter(m=>n(m.y10)!=null && m.y10 >= .10).length;
    const passing5 = big5Data.filter(m=>n(m.y5)!=null && m.y5 >= .10).length;

    // Color helper
    const valColor = v => n(v)==null ? "var(--text-tertiary)" : v>=.10 ? "var(--green)" : v>=.05 ? "var(--yellow)" : v>=0 ? "var(--orange)" : "var(--red)";

    // Historical data years
    const histYrs = YEARS.filter(y => fin[y]?.revenue > 0).slice(0,12);

    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        {/* Header */}
        <div>
          <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>
            ❺ Big Five Numbers
          </h2>
          <p style={{margin:0,fontSize:12,color:"var(--text-secondary)"}}>
            Phil Town exige que las 5 métricas crezcan al ≥10% anual a 1, 5 y 10 años. Si alguna falla, investiga por qué.{DATA_YEARS.length<10 && <span style={{color:"var(--text-tertiary)"}}> ({DATA_YEARS.length} años disponibles)</span>}
          </p>
        </div>

        {/* Summary Card */}
        <Card glow>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:40,flexWrap:"wrap"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:48,fontWeight:800,color:passing10>=4?"var(--green)":passing10>=2?"var(--yellow)":"var(--red)",fontFamily:"var(--fm)"}}>{passing10}<span style={{fontSize:20,color:"var(--text-tertiary)"}}>/5</span></div>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontWeight:600}}>pasan a 10 años</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:48,fontWeight:800,color:passing5>=4?"var(--green)":passing5>=2?"var(--yellow)":"var(--red)",fontFamily:"var(--fm)"}}>{passing5}<span style={{fontSize:20,color:"var(--text-tertiary)"}}>/5</span></div>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontWeight:600}}>pasan a 5 años</div>
            </div>
            <div style={{maxWidth:320,fontSize:12,color:"var(--text-secondary)",lineHeight:1.7}}>
              {passing10 >= 4 ? "La empresa pasa la mayoría de las Big Five. Señal de moat y management competente." :
               passing10 >= 2 ? "Resultados mixtos. Investigar las métricas que no alcanzan el 10%." :
               "La mayoría de métricas no alcanzan el 10%. Precaución: ¿tiene la empresa un moat real?"}
            </div>
          </div>
        </Card>

        {/* Big Five Table */}
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>
                <th style={{padding:"12px 16px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid var(--table-border)",fontFamily:"var(--fm)",fontSize:10,letterSpacing:.5,minWidth:200}}>BIG FIVE</th>
                <th style={{padding:"12px 14px",textAlign:"center",color:"var(--text-secondary)",borderBottom:"2px solid var(--table-border)",fontSize:10,fontFamily:"var(--fm)"}}>1 AÑO</th>
                <th style={{padding:"12px 14px",textAlign:"center",color:"var(--text-secondary)",borderBottom:"2px solid var(--table-border)",fontSize:10,fontFamily:"var(--fm)"}}>5 AÑOS</th>
                <th style={{padding:"12px 14px",textAlign:"center",color:"var(--gold)",borderBottom:"2px solid var(--table-border)",fontSize:10,fontWeight:700,fontFamily:"var(--fm)",background:"var(--gold-glow)"}}>10 AÑOS</th>
                <th style={{padding:"12px 14px",textAlign:"center",color:"var(--text-secondary)",borderBottom:"2px solid var(--table-border)",fontSize:10,fontFamily:"var(--fm)"}}>MÍNIMO</th>
                <th style={{padding:"12px 14px",textAlign:"center",color:"var(--text-secondary)",borderBottom:"2px solid var(--table-border)",fontSize:10,fontFamily:"var(--fm)"}}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {big5Data.map((m,i) => (
                <tr key={m.key} style={{background:i%2?"var(--row-alt)":"transparent"}}>
                  <td style={{padding:"12px 16px",borderBottom:"1px solid var(--table-border)"}}>
                    <div style={{color:"var(--text-primary)",fontWeight:600,fontSize:12.5}}>{m.name}</div>
                    <div style={{color:"var(--text-tertiary)",fontSize:10,marginTop:2}}>{m.desc}</div>
                  </td>
                  <td style={{padding:"12px 14px",textAlign:"center",borderBottom:"1px solid var(--table-border)"}}>
                    <span style={{fontFamily:"var(--fm)",fontWeight:600,fontSize:13,color:valColor(m.y1)}}>{fP(m.y1)}</span>
                  </td>
                  <td style={{padding:"12px 14px",textAlign:"center",borderBottom:"1px solid var(--table-border)"}}>
                    <span style={{fontFamily:"var(--fm)",fontWeight:600,fontSize:13,color:valColor(m.y5)}}>{fP(m.y5)}</span>
                  </td>
                  <td style={{padding:"12px 14px",textAlign:"center",borderBottom:"1px solid var(--table-border)",background:"var(--gold-glow)"}}>
                    <span style={{fontFamily:"var(--fm)",fontWeight:700,fontSize:14,color:valColor(m.y10)}}>{fP(m.y10)}</span>
                  </td>
                  <td style={{padding:"12px 14px",textAlign:"center",borderBottom:"1px solid var(--table-border)"}}>
                    <span style={{fontFamily:"var(--fm)",fontSize:11,color:"var(--gold)"}}>10.0%</span>
                  </td>
                  <td style={{padding:"12px 14px",textAlign:"center",borderBottom:"1px solid var(--table-border)"}}>
                    {n(m.y10)!=null ? <Badge val={m.y10} rules={R.big5}/> : 
                      n(m.y5)!=null ? <span style={{fontSize:9,fontWeight:600,padding:"2px 6px",borderRadius:4,color:m.y5>=0.10?"#30d158":"#ff9f0a",background:m.y5>=0.10?"rgba(48,209,88,.1)":"rgba(255,159,10,.1)",fontFamily:"var(--fm)"}}>5Y:{m.y5>=0.10?"✓":"✗"}</span> :
                      <span style={{fontSize:9,color:"var(--text-tertiary)"}}>N/A</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Note for negative years */}
          {fin[latestDataYear]?.netIncome < 0 && (
            <div style={{padding:"10px 16px",borderTop:"1px solid var(--table-border)",fontSize:10.5,color:"var(--orange)",background:"rgba(255,159,10,.04)",lineHeight:1.6}}>
              ⚠ El último año tiene Net Income negativo (goodwill impairment). Los CAGRs de ROIC y EPS se calculan usando el año positivo más reciente para evitar distorsiones.
            </div>
          )}
        </Card>

        {/* Historical Data Table */}
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead>
              <tr>
                <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid var(--table-border)",zIndex:2,minWidth:155,fontFamily:"var(--fm)",fontSize:10,letterSpacing:.5}}>HISTÓRICO</th>
                {histYrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid var(--table-border)",minWidth:72,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                {label:"ROIC (Rule #1)",fn:y=>{const v=comp[y]?.roicR1;return <span style={{color:valColor(v)}}>{fP(v)}</span>;}},
                {label:"Ventas / Acción",fn:y=>fC(comp[y]?.revps)},
                {label:"EPS",fn:y=>{const v=fin[y]?.eps;return <span style={{color:v<0?"var(--red)":"var(--text-primary)"}}>{fC(v)}</span>;}},
                {label:"BVPS",fn:y=>fC(comp[y]?.bvps)},
                {label:"FCF / Acción",fn:y=>{const v=comp[y]?.fcfps;return <span style={{color:n(v)!=null&&v<0?"var(--red)":"var(--text-primary)"}}>{fC(v)}</span>;}},
                {label:"Dividendo / Acción",fn:y=>fC(fin[y]?.dps)},
              ].map((row,i) => (
                <tr key={i} style={{background:i%2?"var(--row-alt)":"transparent"}}>
                  <td style={{position:"sticky",left:0,background:i%2?"var(--card)":"var(--bg)",padding:"7px 14px",color:i===0?"var(--gold)":"var(--text-primary)",fontWeight:i===0?600:500,borderBottom:"1px solid var(--table-border)",zIndex:1,fontSize:11.5}}>{row.label}</td>
                  {histYrs.map(y=><td key={y} style={{padding:"7px 6px",textAlign:"right",borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{row.fn(y)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Educational Box */}
        <Card style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:10,fontFamily:"var(--fd)"}}>📘 Rule #1: Big Five Numbers de Phil Town</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.8}}>
            <div>
              <strong style={{color:"var(--text-primary)"}}>ROIC ≥10%</strong> — La métrica estrella. Mide cuánto beneficio neto genera por cada dólar de capital invertido. Si supera el 10% consistentemente, indica un moat fuerte.
              <br/><br/>
              <strong style={{color:"var(--text-primary)"}}>Crecimiento Ventas ≥10%</strong> — Si las ventas por acción crecen al menos 10% anual, la empresa está ganando cuota de mercado o subiendo precios.
              <br/><br/>
              <strong style={{color:"var(--text-primary)"}}>Crecimiento EPS ≥10%</strong> — Más importante que las ventas: ¿crece el beneficio por acción? Esto refleja eficiencia operativa y recompras.
            </div>
            <div>
              <strong style={{color:"var(--text-primary)"}}>Crecimiento BVPS ≥10%</strong> — El book value por acción creciendo muestra que la empresa acumula riqueza para el accionista año tras año.
              <br/><br/>
              <strong style={{color:"var(--text-primary)"}}>Crecimiento FCF ≥10%</strong> — El free cash flow por acción es la caja real que genera. Es la métrica más difícil de manipular y la más fiable.
              <br/><br/>
              <strong style={{color:"var(--gold)"}}>La columna de 10 años es la más importante</strong> — muestra consistencia a largo plazo. Si una métrica falla, investiga si fue por una razón puntual (adquisición, COVID) o estructural.
            </div>
          </div>
        </Card>
      </div>
    );
}
