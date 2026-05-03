import { useAnalysis } from '../../context/AnalysisContext';
import { Badge, Card } from '../ui';
import { _sf, n, fP, fC, fM, div, cagrFn } from '../../utils/formatters';
import { R } from '../../utils/ratings.js';
import { YEARS } from '../../constants/index.js';

export default function PaybackTab() {
  const { DATA_YEARS, L, LD, cfg, comp, fin } = useAnalysis();
    const mktCap = cfg.price * (LD.sharesOut || 1);
    // ── Claude PBT: FCF directo + CAGR histórico ──
    const fcfBase = L.fcf > 0 ? L.fcf : 0;
    const fcfYrs = YEARS.filter(y => comp[y]?.fcf > 0);
    const fcfCAGR = fcfYrs.length >= 6 ? cagrFn(comp[fcfYrs[0]]?.fcf, comp[fcfYrs[Math.min(5, fcfYrs.length-1)]]?.fcf, Math.min(5, fcfYrs.length-1)) : null;
    const paybackGrowthClaude = (n(fcfCAGR) != null && fcfCAGR > 0) ? Math.min(fcfCAGR, 0.25) : 0.08;
    let pbtClaude = null;
    const pbtTableClaude = [];
    if(fcfBase > 0 && mktCap > 0) {
      let cum = 0;
      for(let i = 1; i <= 20; i++) {
        const fcfYear = fcfBase * Math.pow(1 + paybackGrowthClaude, i);
        cum += fcfYear;
        pbtTableClaude.push({year: i, fcf: fcfYear, cum, recovered: cum >= mktCap, pct: Math.min(cum/mktCap,1)});
        if(cum >= mktCap && !pbtClaude) pbtClaude = i;
      }
    }
    // ── Rule #1 PBT: FCF Ratio method (avg of 10,7,5,3 yr ratios) ──
    const calcFCFRatio = () => {
      const yrsData = DATA_YEARS.filter(y => {
        const ni = fin[y]?.netIncome;
        const ocf = fin[y]?.ocf;
        const pfcf = (fin[y]?.ocf||0) - (fin[y]?.capex||0);
        return ni > 0 && ocf > 0 && pfcf > 0;
      });
      if(yrsData.length < 3) return null;
      const ratios = yrsData.map(y => { const pfcf = fin[y].ocf - fin[y].capex; return pfcf / fin[y].netIncome; });
      const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
      const a10 = avg(ratios.slice(0, Math.min(10, ratios.length)));
      const a7 = avg(ratios.slice(0, Math.min(7, ratios.length)));
      const a5 = avg(ratios.slice(0, Math.min(5, ratios.length)));
      const a3 = avg(ratios.slice(0, Math.min(3, ratios.length)));
      const vals = [a10, a7, a5, a3].filter(v => v != null);
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    };
    const fcfRatioR1 = calcFCFRatio();
    const epsTTM = LD.eps || 0;
    const fcfPerShareR1 = fcfRatioR1 && epsTTM > 0 ? epsTTM * fcfRatioR1 : null;
    const fcfTotalR1 = fcfPerShareR1 ? fcfPerShareR1 * (LD.sharesOut||1) : null;
    const paybackGrowthR1 = paybackGrowthClaude;
    let pbtR1 = null;
    const pbtTableR1 = [];
    if(fcfTotalR1 > 0 && mktCap > 0) {
      let cum = 0;
      for(let i = 1; i <= 20; i++) {
        const fcfYear = fcfTotalR1 * Math.pow(1 + paybackGrowthR1, i);
        cum += fcfYear;
        pbtTableR1.push({year: i, fcf: fcfYear, cum, recovered: cum >= mktCap, pct: Math.min(cum/mktCap,1)});
        if(cum >= mktCap && !pbtR1) pbtR1 = i;
      }
    }
    const MethodBadge = ({label, color, icon}) => (
      <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:20,background:`${color}15`,border:`1px solid ${color}33`,fontSize:10,fontWeight:700,color,fontFamily:"var(--fm)",letterSpacing:.3}}>
        <span>{icon}</span>{label}
      </div>
    );
    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div>
          <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>⏱ Payback Time <span style={{fontSize:13,color:"var(--gold)",fontWeight:400}}>— Rule #1 vs Claude</span></h2>
          <p style={{margin:"0 0 4px",fontSize:12,color:"var(--text-secondary)"}}>Si compras toda la empresa, ¿en cuántos años te devuelve la inversión solo con el FCF creciente? Phil Town: ≤8 años.</p>
        </div>
        {/* Dual PBT cards */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Card glow style={{borderColor:"rgba(255,159,10,.2)"}}>
            <div style={{marginBottom:10}}><MethodBadge label="RULE #1 PBT" color="#ff9f0a" icon="📖"/></div>
            <div style={{fontSize:10,color:"var(--text-secondary)",marginBottom:12,lineHeight:1.5}}>
              <strong>FCF = EPS × FCF Ratio</strong> (ratio promediado 10/7/5/3a). Suaviza años atípicos usando la relación histórica entre earnings y cash flow.
            </div>
            <div style={{textAlign:"center",marginBottom:14}}>
              <div style={{fontSize:64,fontWeight:800,fontFamily:"var(--fm)",color:pbtR1&&pbtR1<=8?"var(--green)":pbtR1&&pbtR1<=12?"var(--yellow)":"var(--red)",lineHeight:1}}>
                {pbtR1 || "—"}
              </div>
              <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:4}}>años</div>
              {pbtR1 && <div style={{marginTop:6}}><Badge val={pbtR1} rules={R.payback}/></div>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:10}}>
              <div style={{padding:"6px 8px",borderRadius:6,background:"var(--row-alt)"}}>
                <div style={{color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)"}}>FCF Ratio</div>
                <div style={{color:"#ff9f0a",fontWeight:700,fontFamily:"var(--fm)"}}>{fcfRatioR1 ? _sf(fcfRatioR1*100,0)+"%" : "—"}</div>
              </div>
              <div style={{padding:"6px 8px",borderRadius:6,background:"var(--row-alt)"}}>
                <div style={{color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)"}}>FCF/Share</div>
                <div style={{color:"#ff9f0a",fontWeight:700,fontFamily:"var(--fm)"}}>{fC(fcfPerShareR1)}</div>
              </div>
            </div>
          </Card>
          <Card glow style={{borderColor:"rgba(100,210,255,.2)"}}>
            <div style={{marginBottom:10}}><MethodBadge label="CLAUDE PBT" color="#64d2ff" icon="🤖"/></div>
            <div style={{fontSize:10,color:"var(--text-secondary)",marginBottom:12,lineHeight:1.5}}>
              <strong>FCF = OCF − CapEx (directo)</strong> + CAGR histórico. Sin transformaciones, dato real del cash flow statement.
            </div>
            <div style={{textAlign:"center",marginBottom:14}}>
              <div style={{fontSize:64,fontWeight:800,fontFamily:"var(--fm)",color:pbtClaude&&pbtClaude<=8?"var(--green)":pbtClaude&&pbtClaude<=12?"var(--yellow)":"var(--red)",lineHeight:1}}>
                {pbtClaude || "—"}
              </div>
              <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:4}}>años</div>
              {pbtClaude && <div style={{marginTop:6}}><Badge val={pbtClaude} rules={R.payback}/></div>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:10}}>
              <div style={{padding:"6px 8px",borderRadius:6,background:"var(--row-alt)"}}>
                <div style={{color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)"}}>FCF Base</div>
                <div style={{color:"#64d2ff",fontWeight:700,fontFamily:"var(--fm)"}}>{fM(fcfBase)}</div>
              </div>
              <div style={{padding:"6px 8px",borderRadius:6,background:"var(--row-alt)"}}>
                <div style={{color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)"}}>CAGR FCF</div>
                <div style={{color:"#64d2ff",fontWeight:700,fontFamily:"var(--fm)"}}>{fP(paybackGrowthClaude)}</div>
              </div>
            </div>
          </Card>
        </div>
        {/* Dual Payback Table */}
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>
              <th style={{padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid var(--table-border)",fontFamily:"var(--fm)",fontSize:9}}>AÑO</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"#ff9f0a",fontWeight:600,borderBottom:"2px solid var(--table-border)",fontFamily:"var(--fm)",fontSize:9}}>FCF R1</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"#ff9f0a",fontWeight:600,borderBottom:"2px solid var(--table-border)",fontFamily:"var(--fm)",fontSize:9}}>ACUM R1</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"#64d2ff",fontWeight:600,borderBottom:"2px solid var(--table-border)",fontFamily:"var(--fm)",fontSize:9}}>FCF Claude</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"#64d2ff",fontWeight:600,borderBottom:"2px solid var(--table-border)",fontFamily:"var(--fm)",fontSize:9}}>ACUM Claude</th>
              <th style={{padding:"10px 8px",textAlign:"center",fontWeight:600,borderBottom:"2px solid var(--table-border)",fontFamily:"var(--fm)",fontSize:9,color:"var(--text-secondary)"}}>PROGRESO</th>
            </tr></thead>
            <tbody>
              {Array.from({length:12},(_,i)=>i+1).map(yr=>{
                const r1 = pbtTableR1[yr-1]; const cl = pbtTableClaude[yr-1];
                const pctR1 = r1 ? Math.min(r1.cum/mktCap,1) : 0;
                const pctCl = cl ? Math.min(cl.cum/mktCap,1) : 0;
                return (
                  <tr key={yr} style={{background:yr%2?"var(--row-alt)":"transparent"}}>
                    <td style={{padding:"6px 14px",color:yr===8?"var(--gold)":"var(--text-primary)",fontWeight:yr===8?700:400,borderBottom:"1px solid var(--table-border)"}}>{yr}{yr===8?" ⭐":""}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:r1?.recovered?"var(--green)":"var(--text-secondary)",borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{r1?fM(r1.fcf):"—"}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:r1?.recovered?"var(--green)":"#ff9f0a",fontWeight:r1?.recovered?700:400,borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{r1?fM(r1.cum):"—"}{r1?.recovered?" ✓":""}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:cl?.recovered?"var(--green)":"var(--text-secondary)",borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{cl?fM(cl.fcf):"—"}</td>
                    <td style={{padding:"6px 8px",textAlign:"right",color:cl?.recovered?"var(--green)":"#64d2ff",fontWeight:cl?.recovered?700:400,borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{cl?fM(cl.cum):"—"}{cl?.recovered?" ✓":""}</td>
                    <td style={{padding:"6px 8px",borderBottom:"1px solid var(--table-border)"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:2}}>
                        <div style={{height:4,background:"var(--progress-track)",borderRadius:2}}><div style={{width:`${_sf(pctR1*100,0)}%`,height:"100%",background:pctR1>=1?"var(--green)":"#ff9f0a",borderRadius:2}}/></div>
                        <div style={{height:4,background:"var(--progress-track)",borderRadius:2}}><div style={{width:`${_sf(pctCl*100,0)}%`,height:"100%",background:pctCl>=1?"var(--green)":"#64d2ff",borderRadius:2}}/></div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        {/* Educational */}
        <Card style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:8,fontFamily:"var(--fd)"}}>💡 ¿Por qué el Payback Time?</div>
          <div style={{fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.8}}>
            El Payback Time es la herramienta más conservadora de Phil Town. <strong style={{color:"var(--text-primary)"}}>No descuenta los flujos futuros</strong> — simplemente pregunta: si compro toda la empresa al precio actual, ¿en cuántos años me devuelve mi inversión solo con el FCF creciente?
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11,color:"var(--text-secondary)",lineHeight:1.6,marginTop:12}}>
            <div><strong style={{color:"#ff9f0a"}}>Rule #1</strong> — Usa FCF Ratio (promediado 10/7/5/3 años) aplicado al EPS. Más robusto contra años atípicos.</div>
            <div><strong style={{color:"#64d2ff"}}>Claude</strong> — Usa el FCF directo (OCF − CapEx) con CAGR histórico. Dato real sin transformaciones.</div>
          </div>
        </Card>
      </div>
    );
}
