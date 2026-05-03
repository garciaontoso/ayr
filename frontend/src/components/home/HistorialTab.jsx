import { useHome } from '../../context/HomeContext';
import { _sf } from '../../utils/formatters';
import { EmptyState } from '../ui/EmptyState.jsx';

export default function HistorialTab() {
  const {
    historialList,
    openCostBasis,
  } = useHome();

  return (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{padding:"16px 20px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:6}}>📦 Cajón de Recuerdos</div>
          <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.6}}>{historialList.length} posiciones antiguas o no activas. Las shares pueden no estar actualizadas — lo fiable son los dividendos, opciones y transacciones registradas. Haz clic en 📋 para ver el detalle.</div>
        </div>
        {historialList.length===0 ? (
          <EmptyState icon="📦" title="Sin posiciones historicas" subtitle="Aqui apareceran las posiciones que ya no tengas en cartera, con su historial completo de dividendos y opciones." />
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {historialList.map(h => (
              <div key={h.ticker} style={{display:"grid",gridTemplateColumns:"48px 1fr 80px 80px 80px 65px 44px",gap:6,alignItems:"center",padding:"10px 16px",background:"var(--row-alt)",border:"1px solid var(--subtle-border)",borderRadius:14,opacity:.7,transition:"all .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--border-hover)";e.currentTarget.style.opacity="1";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--subtle-border)";e.currentTarget.style.opacity=".7";}}>
                <div style={{width:38,height:38,borderRadius:9,background:"linear-gradient(135deg,#555,#333)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:h.ticker.length>3?7:10,fontWeight:800,color:"#999",fontFamily:"var(--fm)"}}>{h.ticker.slice(0,4)}</div>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--text-secondary)"}}>{h.ticker}</div>
                  <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{h.txnCount} txns · {h.currency}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>DIVS COBRADOS</div>
                  <div style={{fontSize:14,fontWeight:700,color:h.totalDivs>0?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{h.totalDivs>0?"$"+_sf(h.totalDivs,0):"—"}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>PRIMAS OPT.</div>
                  <div style={{fontSize:14,fontWeight:700,color:h.totalOptCredit>0?"#64d2ff":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{h.totalOptCredit>0?"$"+_sf(h.totalOptCredit,0):"—"}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>INCOME TOTAL</div>
                  <div style={{fontSize:14,fontWeight:700,color:(h.totalDivs+h.totalOptCredit)>0?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{(h.totalDivs+h.totalOptCredit)>0?"$"+_sf(h.totalDivs+h.totalOptCredit,0):"—"}</div>
                </div>
                <div style={{display:"flex",justifyContent:"flex-end"}}>
                  <button onClick={()=>openCostBasis(h.ticker)} title="Ver Cost Basis" style={{width:32,height:32,borderRadius:8,border:"1px solid rgba(200,164,78,.25)",background:"rgba(200,164,78,.06)",color:"var(--gold)",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>📋</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
  );
}
