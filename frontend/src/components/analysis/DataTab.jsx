import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { n, div } from '../../utils/formatters.js';

export default function DataTab() {
  const { DATA_YEARS, fin, upFin } = useAnalysis();
    const fields = [
      {k:"revenue",l:"Ventas",fmt:0},{k:"grossProfit",l:"Beneficio Bruto",fmt:0},{k:"operatingIncome",l:"EBIT",fmt:0},
      {k:"netIncome",l:"Beneficio Neto",fmt:0},{k:"eps",l:"EPS",fmt:2},{k:"dps",l:"Dividendo/Acción",fmt:2},
      {k:"sharesOut",l:"Acciones (M)",fmt:0},{k:"ocf",l:"Cash Flow Operativo",fmt:0},{k:"capex",l:"CapEx",fmt:0},
      {k:"totalDebt",l:"Deuda Total",fmt:0},{k:"cash",l:"Caja",fmt:0},{k:"equity",l:"Patrimonio Neto",fmt:0},
      {k:"retainedEarnings",l:"Benef. No Distribuido",fmt:0},{k:"interestExpense",l:"Gastos Intereses",fmt:0},
      {k:"depreciation",l:"Depreciación",fmt:0},{k:"taxProvision",l:"Provisión Impuestos",fmt:0},
    ];
    const yrs = DATA_YEARS;
    return (
      <div>
        <div style={{marginBottom:20}}>
          <h2 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>▤ Datos Financieros</h2>
          <p style={{margin:"4px 0 0",fontSize:12,color:"var(--text-secondary)"}}>Datos en millones. Fuente: Financial Modeling Prep (FMP). Haz clic en cualquier celda para editar manualmente.</p>
        </div>
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead>
              <tr><th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid var(--table-border)",zIndex:2,minWidth:155,fontFamily:"var(--fm)",fontSize:10,letterSpacing:.5}}>MÉTRICA</th>
                {yrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid var(--table-border)",minWidth:82,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {fields.map((f,i)=>(
                <tr key={f.k} style={{background:i%2?"var(--row-alt)":"transparent"}} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"var(--row-alt)":"transparent"}>
                  <td style={{position:"sticky",left:0,background:i%2?"var(--card)":"var(--bg)",padding:"5px 14px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid var(--table-border)",zIndex:1,fontSize:11.5}}>{f.l}</td>
                  {yrs.map(y=>(
                    <td key={y} style={{padding:"3px 3px",borderBottom:"1px solid var(--table-border)"}}>
                      <input type="number" value={fin[y]?.[f.k] != null && fin[y][f.k] !== 0 ? (f.fmt != null ? parseFloat(fin[y][f.k].toFixed(f.fmt)) : fin[y][f.k]) : ""} onChange={e=>upFin(y,f.k,e.target.value)} placeholder="—"
                        style={{width:74,padding:"4px 5px",background:"transparent",border:"1px solid transparent",borderRadius:4,color:"var(--text-primary)",fontSize:11.5,textAlign:"right",outline:"none",fontFamily:"var(--fm)"}}
                        onFocus={e=>{e.target.style.borderColor="var(--gold)";e.target.style.background="var(--gold-glow)";}}
                        onBlur={e=>{e.target.style.borderColor="transparent";e.target.style.background="transparent";}}/>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
}
