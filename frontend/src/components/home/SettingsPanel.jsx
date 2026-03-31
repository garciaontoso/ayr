import { useHome } from '../../context/HomeContext';
import { CURRENCIES, DISPLAY_CCYS } from '../../constants/index.js';

export default function SettingsPanel() {
  const {
    displayCcy, switchDisplayCcy, fxRates, fxLastUpdate, fxError,
    portfolio,
    removePosition, deleteCompany, importTransactions,
  } = useHome();

  return (
<div style={{marginTop:20,padding:16,borderRadius:14,background:"var(--card)",border:"1px solid var(--border)"}}>
  <div style={{fontSize:12,color:"var(--gold)",fontWeight:600,fontFamily:"var(--fm)",marginBottom:10}}>⚙ AJUSTES</div>
  <div style={{fontSize:11,color:"var(--text-secondary)",marginBottom:8}}>Datos cargados via Claude + Web Search. Empresas guardadas: {portfolio.length}.</div>

  {/* FX Rates Panel */}
  <div style={{marginBottom:14,padding:12,borderRadius:10,background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.04)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <span style={{fontSize:10,color:"var(--gold)",fontWeight:700,fontFamily:"var(--fm)"}}>💱 TIPOS DE CAMBIO (base USD)</span>
      <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{fxLastUpdate ? `Act: ${new Date(fxLastUpdate).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}` : "Sin datos"}</span>
    </div>
    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
      {Object.entries(fxRates).filter(([k])=>k!=="USD"&&k!=="GBX").map(([ccy,rate])=>(
        <div key={ccy} style={{padding:"4px 8px",borderRadius:6,background:"rgba(255,255,255,.03)",fontSize:10,fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>
          <span style={{fontSize:9,marginRight:3}}>{CURRENCIES[ccy]?.flag||""}</span>
          <span style={{color:"var(--text-primary)",fontWeight:600}}>{ccy}</span>
          <span style={{color:"var(--text-tertiary)",margin:"0 3px"}}>=</span>
          <span>{typeof rate === 'number' ? rate.toFixed(rate>100?0:rate>10?2:4) : rate}</span>
        </div>
      ))}
    </div>
    {fxError && <div style={{fontSize:10,color:"var(--red)",marginTop:6}}>{fxError}</div>}
  </div>

  {/* Display Currency */}
  <div style={{marginBottom:14}}>
    <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,fontFamily:"var(--fm)",marginBottom:6}}>MONEDA DE VISUALIZACIÓN</div>
    <div style={{display:"flex",gap:4}}>
      {DISPLAY_CCYS.map(ccy=>(
        <button key={ccy} onClick={()=>switchDisplayCcy(ccy)}
          style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${displayCcy===ccy?"var(--gold)":"var(--border)"}`,background:displayCcy===ccy?"var(--gold-dim)":"transparent",color:displayCcy===ccy?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:displayCcy===ccy?700:500,cursor:"pointer",fontFamily:"var(--fm)",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
          <span style={{fontSize:14}}>{CURRENCIES[ccy]?.flag}</span>
          <span>{CURRENCIES[ccy]?.symbol} {ccy}</span>
        </button>
      ))}
    </div>
  </div>

  {/* Import Cost Basis Data */}
  <div style={{marginBottom:14,padding:12,borderRadius:10,background:"rgba(48,209,88,.03)",border:"1px solid rgba(48,209,88,.1)"}}>
    <div style={{fontSize:10,color:"var(--green)",fontWeight:700,fontFamily:"var(--fm)",marginBottom:6}}>📋 IMPORTAR TRANSACCIONES</div>
    <div style={{fontSize:11,color:"var(--text-secondary)",marginBottom:8}}>Carga el archivo costbasis_app.json con todas las transacciones. Se guardan en storage compartido.</div>
    <label style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,border:"1px solid rgba(48,209,88,.3)",background:"rgba(48,209,88,.08)",color:"var(--green)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
      📥 Importar costbasis_app.json
      <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = ev => { importTransactions(ev.target.result); };
        reader.readAsText(file);
      }}/>
    </label>
  </div>

  {portfolio.length > 0 && (
    <select onChange={e=>{if(e.target.value){deleteCompany(e.target.value);removePosition(e.target.value);e.target.value="";}}} 
      style={{padding:"6px 10px",background:"rgba(255,69,58,.06)",border:"1px solid rgba(255,69,58,.2)",borderRadius:8,color:"var(--red)",fontSize:11,cursor:"pointer",fontFamily:"var(--fm)"}}>
      <option value="">🗑 Borrar empresa del storage...</option>
      {portfolio.map(t=><option key={t} value={t}>{t}</option>)}
    </select>
  )}
</div>
  );
}
