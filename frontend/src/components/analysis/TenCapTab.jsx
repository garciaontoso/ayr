import { useAnalysis } from '../../context/AnalysisContext';
import { Badge, Card } from '../ui';
import { n, fC, fM, div } from '../../utils/formatters.js';
import { YEARS } from '../../constants/index.js';

export default function TenCapTab() {
  const { L, LD, cfg, comp, fin } = useAnalysis();
    // ═══ CLAUDE: OE = Net Income + D&A - CapEx (100%) ═══
    const oeLatest = L.oe;
    const oePositiveYrs = YEARS.filter(y => comp[y]?.oe > 0);
    const oeForCalc = oeLatest > 0 ? oeLatest : (oePositiveYrs.length ? comp[oePositiveYrs[0]].oe : 0);
    const oepsForCalc = oeForCalc > 0 && (oePositiveYrs.length > 0 || fin[YEARS[0]]?.sharesOut > 0) ? div(oeForCalc, fin[oePositiveYrs[0]||YEARS[0]]?.sharesOut || 1) : 0;
    const tenCapClaude = oepsForCalc ? oepsForCalc * 10 : 0;

    // ═══ RULE #1: OE = OCF - Maint.CapEx(70%) + Tax Provision ═══
    const r1OCF = LD.ocf || 0;
    const r1MaintCapex = (LD.capex || 0) * 0.70;
    const r1Tax = LD.taxProvision || 0;
    const r1OE = r1OCF - r1MaintCapex + r1Tax;
    const r1OEps = r1OE > 0 ? div(r1OE, LD.sharesOut) : 0;
    const tenCapR1 = r1OEps ? r1OEps * 10 : 0;
    const histYrs = YEARS.slice(0, 10);

    const MethodBadge = ({label, color, icon}) => (
      <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:20,background:`${color}15`,border:`1px solid ${color}33`,fontSize:10,fontWeight:700,color,fontFamily:"var(--fm)",letterSpacing:.3}}>
        <span>{icon}</span>{label}
      </div>
    );

    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div>
          <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>
            10 Cap Rate <span style={{fontSize:13,color:"var(--gold)",fontWeight:400}}>— Rule #1 vs Claude</span>
          </h2>
          <p style={{margin:0,fontSize:12,color:"var(--text-secondary)"}}>
            Si quisieras un 10% de retorno anual basándote en los Owner Earnings, ¿cuál sería el precio máximo a pagar?
          </p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {/* Rule #1 */}
          <Card glow style={{borderColor:"rgba(255,159,10,.2)"}}>
            <div style={{marginBottom:14}}><MethodBadge label="RULE #1" color="#ff9f0a" icon="📖"/></div>
            <div style={{fontSize:10,color:"var(--text-secondary)",marginBottom:14,lineHeight:1.6}}>
              <strong>OE = OCF − CapEx Mant. (70%) + Tax Provision</strong><br/>
              Fórmula original de Phil Town/Buffett. Solo resta CapEx de mantenimiento.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[{l:"OCF",v:fM(r1OCF),c:"var(--text-primary)"},{l:"Maint. CapEx (70%)",v:"-"+fM(r1MaintCapex),c:"var(--red)"},{l:"+ Tax Provision",v:"+"+fM(r1Tax),c:"var(--green)"},{l:"Owner Earnings",v:fM(r1OE),c:"#ff9f0a",bg:"rgba(255,159,10,.06)"}].map((x,i)=>(
                <div key={i} style={{padding:"8px",borderRadius:8,background:x.bg||"rgba(255,255,255,.02)"}}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>{x.l}</div>
                  <div style={{fontSize:15,fontWeight:700,color:x.c,fontFamily:"var(--fm)"}}>{x.v}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:"center",padding:"12px 0",borderTop:"1px solid #21262d"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:1}}>10 CAP PRICE</div>
              <div style={{fontSize:42,fontWeight:800,fontFamily:"var(--fm)",color:cfg.price<=tenCapR1?"var(--green)":"var(--red)",lineHeight:1.1,marginTop:4}}>{fC(tenCapR1)}</div>
              <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:6}}>OE/Share: {fC(r1OEps)} × 10</div>
              {tenCapR1>0 && <div style={{marginTop:8}}><Badge val={cfg.price<=tenCapR1?1:0} rules={[{test:v=>v>0,lbl:"COMPRAR",c:"var(--green)",bg:"rgba(48,209,88,.1)",score:3},{test:()=>true,lbl:"CARO",c:"var(--red)",bg:"rgba(255,69,58,.1)",score:0}]}/></div>}
            </div>
          </Card>
          {/* Claude */}
          <Card glow style={{borderColor:"rgba(100,210,255,.2)"}}>
            <div style={{marginBottom:14}}><MethodBadge label="CLAUDE" color="#64d2ff" icon="🤖"/></div>
            <div style={{fontSize:10,color:"var(--text-secondary)",marginBottom:14,lineHeight:1.6}}>
              <strong>OE = Net Income + D&A − CapEx (100%)</strong><br/>
              Más conservador. Resta todo el CapEx, no solo mantenimiento.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[{l:"Net Income",v:fM(LD.netIncome),c:"var(--text-primary)"},{l:"+ Depreciation",v:"+"+fM(LD.depreciation),c:"var(--green)"},{l:"− CapEx (100%)",v:"-"+fM(LD.capex),c:"var(--red)"},{l:"Owner Earnings",v:fM(oeForCalc),c:"#64d2ff",bg:"rgba(100,210,255,.06)"}].map((x,i)=>(
                <div key={i} style={{padding:"8px",borderRadius:8,background:x.bg||"rgba(255,255,255,.02)"}}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>{x.l}</div>
                  <div style={{fontSize:15,fontWeight:700,color:x.c,fontFamily:"var(--fm)"}}>{x.v}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:"center",padding:"12px 0",borderTop:"1px solid #21262d"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:1}}>10 CAP PRICE</div>
              <div style={{fontSize:42,fontWeight:800,fontFamily:"var(--fm)",color:cfg.price<=tenCapClaude?"var(--green)":"var(--red)",lineHeight:1.1,marginTop:4}}>{fC(tenCapClaude)}</div>
              <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:6}}>OE/Share: {fC(oepsForCalc)} × 10</div>
              {tenCapClaude>0 && <div style={{marginTop:8}}><Badge val={cfg.price<=tenCapClaude?1:0} rules={[{test:v=>v>0,lbl:"COMPRAR",c:"var(--green)",bg:"rgba(48,209,88,.1)",score:3},{test:()=>true,lbl:"CARO",c:"var(--red)",bg:"rgba(255,69,58,.1)",score:0}]}/></div>}
            </div>
          </Card>
        </div>
        {/* Comparación */}
        <Card style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:12,fontFamily:"var(--fd)"}}>⚖ Comparación 10 Cap</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:16,alignItems:"center"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#ff9f0a",fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1}}>RULE #1</div>
              <div style={{fontSize:28,fontWeight:800,color:cfg.price<=tenCapR1?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{fC(tenCapR1)}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)"}}>Más optimista (+Tax, 70% CapEx)</div>
            </div>
            <div style={{fontSize:20,color:"var(--text-tertiary)"}}>vs</div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#64d2ff",fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1}}>CLAUDE</div>
              <div style={{fontSize:28,fontWeight:800,color:cfg.price<=tenCapClaude?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{fC(tenCapClaude)}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)"}}>Más conservador (100% CapEx)</div>
            </div>
          </div>
          <div style={{marginTop:12,fontSize:10.5,color:"var(--text-secondary)",lineHeight:1.6}}>
            <strong style={{color:"var(--text-primary)"}}>Diferencia: {fC(tenCapR1 - tenCapClaude)}</strong> — Si ambos dicen COMPRAR, alta convicción. Si solo Rule #1 dice comprar, investigar más.
          </div>
        </Card>
        {/* Historical OE Table */}
        <Card title="Histórico de Owner Earnings" icon="📊" style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>
              <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"8px 12px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9,minWidth:120}}>MÉTRICA</th>
              {histYrs.map(y=><th key={y} style={{padding:"8px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:9}}>{y}</th>)}
            </tr></thead>
            <tbody>
              {[
                {l:"OCF",fn:y=>fM(fin[y]?.ocf),c:"var(--text-primary)"},
                {l:"CapEx Total",fn:y=>fM(fin[y]?.capex),c:"var(--text-primary)"},
                {l:"CapEx 70% (R1)",fn:y=>fM((fin[y]?.capex||0)*0.7),c:"#ff9f0a"},
                {l:"Tax Provision",fn:y=>fM(fin[y]?.taxProvision),c:"var(--text-primary)"},
                {l:"D&A",fn:y=>fM(fin[y]?.depreciation),c:"var(--text-primary)"},
                {l:"Net Income",fn:y=>fM(fin[y]?.netIncome),c:"var(--text-primary)"},
                {l:"OE Rule #1",fn:y=>fM((fin[y]?.ocf||0)-(fin[y]?.capex||0)*0.7+(fin[y]?.taxProvision||0)),c:"#ff9f0a"},
                {l:"OE Claude",fn:y=>fM(comp[y]?.oe),c:"#64d2ff"},
              ].map((row,i)=>(
                <tr key={i} style={{background:i%2?"rgba(255,255,255,.015)":"transparent",fontWeight:i>=6?700:400}}>
                  <td style={{position:"sticky",left:0,background:i%2?"#0a0a0a":"#000",padding:"5px 12px",color:row.c,borderBottom:"1px solid #21262d",fontSize:i>=6?11.5:11}}>{row.l}</td>
                  {histYrs.map(y=><td key={y} style={{padding:"5px 6px",textAlign:"right",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)",color:row.c}}>{row.fn(y)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {/* Educational */}
        <Card style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:10,fontFamily:"var(--fd)"}}>📚 ¿Por qué dos cálculos?</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.7}}>
            <div>
              <strong style={{color:"#ff9f0a"}}>Rule #1 (Phil Town)</strong> — Parte del OCF, resta solo CapEx de mantenimiento (70%) y suma impuestos. Más fiel a la idea original de Buffett de "Owner Earnings". Produce un 10 Cap Price más alto.
            </div>
            <div>
              <strong style={{color:"#64d2ff"}}>Claude</strong> — Parte del Net Income, suma D&A y resta el CapEx total (100%). Más conservador porque asume que todo el CapEx es mantenimiento.
            </div>
          </div>
        </Card>
      </div>
    );
}
