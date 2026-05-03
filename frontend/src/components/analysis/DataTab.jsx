import { useState } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Card, MetricHistoryChart } from '../ui';
import { _sf, fM, fC, n, div } from '../../utils/formatters.js';

export default function DataTab() {
  const { DATA_YEARS, CHART_YEARS, DISPLAY_YEARS, fin, upFin } = useAnalysis();
  const [selectedKey, setSelectedKey] = useState(null);
    const fields = [
      // fmtType: 'M' = millions ($), 'C' = currency 2dec ($X.XX), 'N' = plain number
      {k:"revenue",l:"Ventas",fmt:0,fmtType:'M'},{k:"grossProfit",l:"Beneficio Bruto",fmt:0,fmtType:'M'},{k:"operatingIncome",l:"EBIT",fmt:0,fmtType:'M'},
      {k:"netIncome",l:"Beneficio Neto",fmt:0,fmtType:'M'},{k:"eps",l:"EPS",fmt:2,fmtType:'C'},{k:"dps",l:"Dividendo/Acción",fmt:2,fmtType:'C'},
      {k:"sharesOut",l:"Acciones (M)",fmt:0,fmtType:'N'},{k:"ocf",l:"Cash Flow Operativo",fmt:0,fmtType:'M'},{k:"capex",l:"CapEx",fmt:0,fmtType:'M'},
      {k:"totalDebt",l:"Deuda Total",fmt:0,fmtType:'M'},{k:"cash",l:"Caja",fmt:0,fmtType:'M'},{k:"equity",l:"Patrimonio Neto",fmt:0,fmtType:'M'},
      {k:"retainedEarnings",l:"Benef. No Distribuido",fmt:0,fmtType:'M'},{k:"interestExpense",l:"Gastos Intereses",fmt:0,fmtType:'M'},
      {k:"depreciation",l:"Depreciación",fmt:0,fmtType:'M'},{k:"taxProvision",l:"Provisión Impuestos",fmt:0,fmtType:'M'},
    ];
    const yrs = DISPLAY_YEARS || DATA_YEARS;
    const fmtForType = (type) => type === 'C' ? (v => fC(v)) : type === 'N' ? (v => v == null ? '—' : _sf(v, 0)) : (v => fM(v));
    const selected = fields.find(f => f.k === selectedKey);
    return (
      <div>
        <div style={{marginBottom:20}}>
          <h2 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>▤ Datos Financieros</h2>
          <p style={{margin:"4px 0 0",fontSize:12,color:"var(--text-secondary)"}}>Datos en millones. Fuente: Financial Modeling Prep (FMP). Click en el nombre para ver evolución; click en celda para editar.</p>
        </div>
        {selected && (
          <MetricHistoryChart
            label={selected.l}
            years={CHART_YEARS}
            values={CHART_YEARS.map(y => fin[y]?.[selected.k])}
            format={fmtForType(selected.fmtType)}
            color="#64d2ff"
            onClose={() => setSelectedKey(null)}
          />
        )}
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead>
              <tr><th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid var(--table-border)",zIndex:2,minWidth:155,fontFamily:"var(--fm)",fontSize:10,letterSpacing:.5}}>MÉTRICA</th>
                {yrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid var(--table-border)",minWidth:82,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {fields.map((f,i)=>{
                const isActive = selectedKey === f.k;
                return (
                <tr key={f.k} style={{background: isActive ? "var(--gold-dim)" : (i%2?"var(--row-alt)":"transparent")}} onMouseEnter={e=>{ if (!isActive) e.currentTarget.style.background="var(--gold-glow)"; }} onMouseLeave={e=>{ if (!isActive) e.currentTarget.style.background=i%2?"var(--row-alt)":"transparent"; }}>
                  <td onClick={() => setSelectedKey(isActive ? null : f.k)} title="Click para ver evolución anual"
                    style={{position:"sticky",left:0,background: isActive ? "var(--gold-dim)" : (i%2?"var(--card)":"var(--bg)"),padding:"5px 14px",color: isActive ? "var(--gold)" : "var(--text-primary)",fontWeight:500,borderBottom:"1px solid var(--table-border)",zIndex:1,fontSize:11.5,cursor:"pointer"}}>📈 {f.l}</td>
                  {yrs.map(y=>(
                    <td key={y} style={{padding:"3px 3px",borderBottom:"1px solid var(--table-border)"}}>
                      <input type="number" value={fin[y]?.[f.k] != null && fin[y][f.k] !== 0 ? (f.fmt != null ? parseFloat(fin[y][f.k].toFixed(f.fmt)) : fin[y][f.k]) : ""} onChange={e=>upFin(y,f.k,e.target.value)} placeholder="—"
                        style={{width:74,padding:"4px 5px",background:"transparent",border:"1px solid transparent",borderRadius:4,color:"var(--text-primary)",fontSize:11.5,textAlign:"right",outline:"none",fontFamily:"var(--fm)"}}
                        onFocus={e=>{e.target.style.borderColor="var(--gold)";e.target.style.background="var(--gold-glow)";}}
                        onBlur={e=>{e.target.style.borderColor="transparent";e.target.style.background="transparent";}}/>
                    </td>
                  ))}
                </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    );
}
