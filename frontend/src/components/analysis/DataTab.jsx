import { useState, useRef } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Card, MetricHistoryChart } from '../ui';
import { _sf, fM, fC, n, div } from '../../utils/formatters.js';
import { getPref, setPref, removePref } from '../../utils/userPrefs.js';

const PREF_KEY = 'ayr-row-order-data';
const DEFAULT_ORDER = ["revenue","grossProfit","operatingIncome","netIncome","eps","dps","sharesOut","ocf","capex","totalDebt","cash","equity","retainedEarnings","interestExpense","depreciation","taxProvision"];

function savedOrder() {
  try { const v = getPref(PREF_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

export default function DataTab() {
  const { DATA_YEARS, CHART_YEARS, DISPLAY_YEARS, fin, upFin } = useAnalysis();
  const [selectedKey, setSelectedKey] = useState(null);
  const [rowOrder, setRowOrder] = useState(() => savedOrder() || DEFAULT_ORDER);
  const dragKey = useRef(null);
  const [dragOver, setDragOver] = useState(null);

    const ALL_FIELDS = [
      // fmtType: 'M' = millions ($), 'C' = currency 2dec ($X.XX), 'N' = plain number
      {k:"revenue",l:"Ventas",fmt:0,fmtType:'M'},{k:"grossProfit",l:"Beneficio Bruto",fmt:0,fmtType:'M'},{k:"operatingIncome",l:"EBIT",fmt:0,fmtType:'M'},
      {k:"netIncome",l:"Beneficio Neto",fmt:0,fmtType:'M'},{k:"eps",l:"EPS",fmt:2,fmtType:'C'},{k:"dps",l:"Dividendo/Acción",fmt:2,fmtType:'C'},
      {k:"sharesOut",l:"Acciones (M)",fmt:0,fmtType:'N'},{k:"ocf",l:"Cash Flow Operativo",fmt:0,fmtType:'M'},{k:"capex",l:"CapEx",fmt:0,fmtType:'M'},
      {k:"totalDebt",l:"Deuda Total",fmt:0,fmtType:'M'},{k:"cash",l:"Caja",fmt:0,fmtType:'M'},{k:"equity",l:"Patrimonio Neto",fmt:0,fmtType:'M'},
      {k:"retainedEarnings",l:"Benef. No Distribuido",fmt:0,fmtType:'M'},{k:"interestExpense",l:"Gastos Intereses",fmt:0,fmtType:'M'},
      {k:"depreciation",l:"Depreciación",fmt:0,fmtType:'M'},{k:"taxProvision",l:"Provisión Impuestos",fmt:0,fmtType:'M'},
    ];
    const fieldMap = Object.fromEntries(ALL_FIELDS.map(f => [f.k, f]));
    const fields = [...new Set([...rowOrder, ...DEFAULT_ORDER])].filter(k => fieldMap[k]).map(k => fieldMap[k]);
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
                const isDragTarget = dragOver === f.k;
                return (
                <tr key={f.k}
                  draggable={true}
                  onDragStart={e => {
                    // Don't initiate drag from inside an input element
                    if (e.target.tagName === 'INPUT') { e.preventDefault(); return; }
                    dragKey.current = f.k; e.dataTransfer.effectAllowed = 'move';
                    try { e.dataTransfer.setData('text/plain', f.k); } catch {}
                  }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragKey.current && dragKey.current !== f.k) setDragOver(f.k); }}
                  onDragLeave={() => { if (dragOver === f.k) setDragOver(null); }}
                  onDrop={e => {
                    e.preventDefault();
                    const src = dragKey.current || e.dataTransfer.getData('text/plain');
                    if (!src || src === f.k) { dragKey.current = null; setDragOver(null); return; }
                    const keys = fields.map(x => x.k);
                    const without = keys.filter(k => k !== src);
                    const targetIdx = without.indexOf(f.k);
                    const newOrder = [...without.slice(0, targetIdx), src, ...without.slice(targetIdx)];
                    setRowOrder(newOrder);
                    setPref(PREF_KEY, JSON.stringify(newOrder));
                    dragKey.current = null; setDragOver(null);
                  }}
                  onDragEnd={() => { dragKey.current = null; setDragOver(null); }}
                  onContextMenu={e => {
                    if (e.target.tagName === 'INPUT') return; // allow native context on inputs
                    e.preventDefault();
                    if (window.confirm('Restablecer orden de filas al original?')) { setRowOrder(DEFAULT_ORDER); removePref(PREF_KEY); }
                  }}
                  title="Arrastra por el nombre para reordenar · click derecho para restablecer"
                  style={{background: isActive ? "var(--gold-dim)" : (i%2?"var(--row-alt)":"transparent"), transition:"background .15s, border-left .1s",
                    borderLeft: isDragTarget ? "3px solid var(--gold)" : "3px solid transparent",
                    opacity: dragKey.current === f.k ? 0.4 : 1}}
                  onMouseEnter={e=>{ if (!isActive && !dragKey.current) e.currentTarget.style.background="var(--gold-glow)"; }}
                  onMouseLeave={e=>{ if (!isActive) e.currentTarget.style.background=i%2?"var(--row-alt)":"transparent"; }}>
                  <td onClick={() => setSelectedKey(isActive ? null : f.k)} title="Click para ver evolución anual"
                    style={{position:"sticky",left:0,background: isActive ? "var(--gold-dim)" : (i%2?"var(--card)":"var(--bg)"),padding:"5px 14px",color: isActive ? "var(--gold)" : "var(--text-primary)",fontWeight:500,borderBottom:"1px solid var(--table-border)",zIndex:1,fontSize:11.5,cursor:"pointer",userSelect:"none"}}>
                    <span style={{display:"inline-block",marginRight:6,opacity:.35,fontSize:9,letterSpacing:1,verticalAlign:"middle",fontFamily:"var(--fm)"}}>⋮⋮</span>📈 {f.l}</td>
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
