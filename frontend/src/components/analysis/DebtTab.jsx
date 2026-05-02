import { useState } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Badge, Card, MetricHistoryChart } from '../ui';
import { fP, fX, fM, div } from '../../utils/formatters.js';
import { R } from '../../utils/ratings.js';

export default function DebtTab() {
  const { DATA_YEARS, CHART_YEARS, L, LD, comp } = useAnalysis();
  const [selectedKey, setSelectedKey] = useState(null);
    const yrs = DATA_YEARS;
    const metrics = [
      {k:"d2fcf",l:"Deuda Neta / FCF",r:R.d2fcf,f:fX},{k:"ic",l:"EBIT / Intereses",r:R.ic,f:fX},
      {k:"nd2cap",l:"Deuda Neta / Capital",f:fP},{k:"d2ebit",l:"Deuda Neta / EBIT",f:fX},
      {k:"nd2ocf",l:"Deuda Neta / OCF",f:fX},{k:"nd2rev",l:"Deuda Neta / Ventas",f:fX},{k:"int2ocf",l:"Intereses / OCF",f:fP},
    ];
    const selected = metrics.find(m => m.k === selectedKey);
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>⬡ Deuda y Balance</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>Solidez financiera, capacidad de pago y Altman Z-Score. <span style={{color:"var(--text-tertiary)"}}>Click en cualquier ratio para ver evolución anual.</span></p>
        {selected && (
          <MetricHistoryChart
            label={selected.l}
            years={CHART_YEARS}
            values={CHART_YEARS.map(y => comp[y]?.[selected.k])}
            format={selected.f}
            color="#5b9bd5"
            onClose={() => setSelectedKey(null)}
          />
        )}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:20}}>
          {[{l:"Deuda Total",v:fM(LD.totalDebt)},{l:"Caja",v:fM(LD.cash)},{l:"Deuda Neta",v:fM(L.netDebt)},{l:"Patrimonio",v:fM(LD.equity)},{l:"Tipo medio deuda",v:fP(div(LD.interestExpense,LD.totalDebt))}].map((x,i)=>(
            <Card key={i}><div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>{x.l}</div>
              <div style={{fontSize:22,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{x.v}</div></Card>
          ))}
        </div>
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid var(--table-border)",minWidth:160,fontFamily:"var(--fm)",fontSize:10}}>RATIO</th>
              <th style={{padding:"10px 8px",textAlign:"center",borderBottom:"2px solid var(--table-border)",minWidth:80,color:"var(--text-secondary)",fontSize:10}}>RATING</th>
              {yrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid var(--table-border)",minWidth:68,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
            </tr></thead>
            <tbody>{metrics.map((m,i)=>{
              const isActive = selectedKey === m.k;
              return (
                <tr key={m.k} onClick={() => setSelectedKey(isActive ? null : m.k)} title="Click para ver evolución anual"
                  style={{background: isActive ? "var(--gold-dim)" : (i%2?"var(--row-alt)":"transparent"), cursor:"pointer", transition:"background .15s"}}>
                  <td style={{position:"sticky",left:0,background: isActive ? "var(--gold-dim)" : (i%2?"var(--card)":"var(--bg)"),padding:"7px 14px",color: isActive ? "var(--gold)" : "var(--text-primary)",fontWeight:500,borderBottom:"1px solid var(--table-border)"}}>📈 {m.l}</td>
                  <td style={{padding:"7px",textAlign:"center",borderBottom:"1px solid var(--table-border)"}}>{m.r?<Badge val={L[m.k]} rules={m.r}/>:"—"}</td>
                  {yrs.map(y=><td key={y} style={{padding:"7px 6px",textAlign:"right",color:"var(--text-primary)",borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{m.f(comp[y]?.[m.k])}</td>)}
                </tr>
              );
            })}</tbody>
          </table>
        </Card>
        <Card style={{marginTop:16,background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:10,fontFamily:"var(--fd)"}}>📘 Cómo interpretar la deuda</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.7}}>
            <div><strong style={{color:"var(--text-primary)"}}>Deuda Neta / FCF &lt; 3x</strong> es lo ideal para empresas de dividendos. Significa que puede pagar toda su deuda con 3 años de cash flow libre. &gt;5x es preocupante.<br/><br/><strong style={{color:"var(--text-primary)"}}>Cobertura Intereses &gt; 8x</strong> indica que la empresa genera 8 veces más beneficio operativo de lo que paga en intereses.</div>
            <div><strong style={{color:"var(--text-primary)"}}>Deuda/Capital &lt; 50%</strong> muestra un balance conservador. &gt;70% es arriesgado, especialmente si los tipos suben.<br/><br/><strong style={{color:"var(--text-primary)"}}>Para inversores de dividendos:</strong> La deuda es el mayor riesgo para la sostenibilidad del dividendo. Empresas muy endeudadas recortan antes.</div>
          </div>
        </Card>
      </div>
    );
}
