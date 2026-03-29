import { useAnalysis } from '../../context/AnalysisContext';
import { Badge, BarChart, Card, SensitivityTable } from '../ui';
import { _sf, n, f1, fP, fC, fM, div } from '../../utils/formatters.js';
import { R } from '../../utils/ratings.js';

export default function DCFTab() {
  const { cfg, dcf, dcfCalc, discountRate, estimatedGrowth, fmpExtra } = useAnalysis();
    if(!dcf) return (
      <Card><div style={{textAlign:"center",padding:48,color:"var(--text-tertiary)"}}><div style={{fontSize:48,marginBottom:16}}>△</div>Introduce datos (OCF, CapEx, acciones) para generar el DCF.</div></Card>
    );
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>△ Descuento de Flujos de Caja (DCF)</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>Tasa: {fP(discountRate)} ({cfg.useWACC?"WACC calculado":"Manual"}) · Crecimiento: {fP(estimatedGrowth)} · Terminal: 2.5%</p>
        
        <Card glow style={{marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:20}}>
            <div><div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>Valor Intrínseco</div>
              <div style={{fontSize:38,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)",marginTop:4}}>{fC(dcf.iv)}</div></div>
            <div><div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>Precio Actual</div>
              <div style={{fontSize:38,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{fC(cfg.price)}</div></div>
            <div><div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>Margen de Seguridad</div>
              <div style={{fontSize:38,fontWeight:700,color:dcf.mos>.15?"var(--green)":dcf.mos>0?"var(--yellow)":"var(--red)",fontFamily:"var(--fm)",marginTop:4}}>{f1(dcf.mos*100)}%</div>
              <Badge val={dcf.mos} rules={R.mos}/></div>
            <div><div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>Valor Total</div>
              <div style={{fontSize:24,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{fM(dcf.total)}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>Terminal: {f1(dcf.tvPV/dcf.total*100)}% del total</div></div>
          </div>
        </Card>

        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16}}>
          <Card title="Proyección FCF" icon="📈">
            <BarChart data={dcf.projs.map(p=>p.fcf)} labels={dcf.projs.map(p=>String(p.year).slice(2))} color="var(--green)" height={120} formatFn={fM}/>
          </Card>
          <Card title="Análisis de Sensibilidad" icon="🎛️">
            <p style={{fontSize:10,color:"var(--text-secondary)",margin:"0 0 8px"}}>Valor intrínseco según diferentes tasas:</p>
            <SensitivityTable dcfFn={dcfCalc} baseGrowth={Math.round(estimatedGrowth*100)} baseDiscount={Math.round(discountRate*100)}/>
          </Card>
        </div>

        <Card style={{marginTop:16,overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>AÑO</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>FCF PROY.</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>VALOR PRESENTE</th>
            </tr></thead>
            <tbody>
              {dcf.projs.map((p,i)=>(
                <tr key={p.year} style={{background:i%2?"rgba(255,255,255,.02)":"transparent"}}>
                  <td style={{padding:"7px 14px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid #21262d"}}>{p.year}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:"var(--text-primary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fM(p.fcf)}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",color:"var(--text-secondary)",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fM(p.pv)}</td>
                </tr>
              ))}
              <tr style={{background:"rgba(48,209,88,.06)"}}>
                <td style={{padding:"10px 14px",color:"var(--green)",fontWeight:700,borderTop:"2px solid #30363d"}}>TOTAL</td>
                <td style={{padding:"10px 8px",textAlign:"right",borderTop:"2px solid #30363d"}}/>
                <td style={{padding:"10px 8px",textAlign:"right",color:"var(--green)",fontWeight:700,borderTop:"2px solid #30363d",fontFamily:"var(--fm)"}}>{fM(dcf.total)}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* FMP DCF Comparison */}
        {fmpExtra.dcf?.dcf > 0 && (
          <Card title="DCF — Tu Modelo vs FMP" icon="⚖" style={{marginTop:16}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:20,alignItems:"center"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"#64d2ff",fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1}}>A&R DCF</div>
                <div style={{fontSize:32,fontWeight:800,color:dcf.mos>0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{fC(dcf.iv)}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)"}}>MOS: {f1(dcf.mos*100)}%</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{fontSize:20,color:"var(--text-tertiary)"}}>vs</div>
                {(() => {
                  const diff = dcf.iv && fmpExtra.dcf.dcf ? ((dcf.iv / fmpExtra.dcf.dcf - 1) * 100) : null;
                  return diff != null ? <div style={{fontSize:10,color:Math.abs(diff)<15?"var(--green)":"var(--orange)",fontFamily:"var(--fm)"}}>
                    Δ {diff>0?"+":""}{_sf(diff,0)}%
                  </div> : null;
                })()}
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"#bf5af2",fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1}}>FMP DCF</div>
                <div style={{fontSize:32,fontWeight:800,color:fmpExtra.dcf.dcf>cfg.price?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{fC(fmpExtra.dcf.dcf)}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)"}}>MOS: {cfg.price>0?f1((1-cfg.price/fmpExtra.dcf.dcf)*100):0}%</div>
              </div>
            </div>
            <div style={{marginTop:12,fontSize:10.5,color:"var(--text-secondary)",lineHeight:1.6,textAlign:"center"}}>
              {Math.abs((dcf.iv/fmpExtra.dcf.dcf-1)*100) < 15
                ? "Los dos modelos convergen (±15%). Alta confianza en la valoración."
                : "Diferencia significativa entre modelos. Investigar los supuestos de cada uno."}
            </div>
          </Card>
        )}
      </div>
    );
}
