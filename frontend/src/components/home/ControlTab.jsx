import { useState, useEffect, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';
import { EmptyState } from '../ui/EmptyState.jsx';

export default function ControlTab() {
  const {
    ctrlLog, ctrlShowForm, setCtrlShowForm,
    ctrlForm, setCtrlForm, addCtrlEntry,
    fxRates, ibData, loadIBData,
  } = useHome();

  // Auto-fill form with previous snapshot data + live FX when opening
  const prefillForm = useCallback(() => {
    const withData = ctrlLog.filter(c => c.pu > 0);
    const last = withData[0];
    // Live EUR/USD from fxRates (1/EUR rate = how many USD per EUR)
    const liveFx = fxRates?.EUR ? (1 / fxRates.EUR) : (last?.fx || 1.1);
    if (last) {
      setCtrlForm({
        date: new Date().toISOString().slice(0, 10),
        fx: Math.round(liveFx * 10000) / 10000,
        // Use individual fields if available, otherwise put totals in primary fields
        bankinter: last.bankinter || last.bk || 0,
        bcCaminos: last.bcCaminos || 0,
        constructionBank: last.constructionBank || 0,
        revolut: last.revolut || 0,
        otrosBancos: last.otrosBancos || 0,
        ibUsd: last.ibUsd || last.br || 0,
        tsUsd: last.tsUsd || 0,
        tastyUsd: last.tastyUsd || 0,
        fondos: last.fondos || last.fd || 0,
        cryptoEur: last.cryptoEur || last.cr || 0,
        sueldo: last.sueldo || last.sl || 0,
        hipoteca: last.hipoteca || last.hp || 0,
      });
    } else {
      setCtrlForm(p => ({ ...p, date: new Date().toISOString().slice(0, 10), fx: Math.round(liveFx * 10000) / 10000 }));
    }
  }, [ctrlLog, fxRates, setCtrlForm]);

  if (!ctrlLog || ctrlLog.length === 0) {
    return <EmptyState icon="🎛️" title="Sin snapshots de control" subtitle="Registra tu primer snapshot mensual con datos de cuentas bancarias, brokerage e inversiones." action="+ Nuevo Snapshot" onAction={() => { prefillForm(); setCtrlShowForm(true); }} />;
  }

  return (
<div style={{display:"flex",flexDirection:"column",gap:12}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
    {(() => {
      const withData = ctrlLog.filter(c => c.pu > 0);
      const latest = withData[0] || {};
      const prev = withData[1] || {};
      const chg = prev.pu ? ((latest.pu - prev.pu) / prev.pu * 100) : 0;
      return <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:10,flex:1}}>
        {[
          {l:"PAT. USD",v:"$"+fDol(latest.pu||0),c:"var(--text-primary)"},
          {l:"PAT. EUR",v:"€"+fDol(latest.pe||0),c:"var(--text-secondary)"},
          {l:"Δ MES",v:(chg>=0?"+":"")+_sf(chg,1)+"%",c:chg>=0?"var(--green)":"var(--red)"},
          {l:"SNAPSHOTS",v:withData.length,c:"var(--gold)"},
        ].map((m,i)=>(
          <div key={i} style={{padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.5}}>{m.l}</div>
            <div style={{fontSize:18,fontWeight:700,color:m.c,fontFamily:"var(--fm)",marginTop:2}}>{m.v}</div>
          </div>
        ))}
      </div>;
    })()}
    <button onClick={()=>{if(!ctrlShowForm)prefillForm();setCtrlShowForm(!ctrlShowForm);}} style={{padding:"8px 16px",borderRadius:8,border:"1px solid var(--gold)",background:ctrlShowForm?"var(--gold)":"var(--gold-dim)",color:ctrlShowForm?"#000":"var(--gold)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
      {ctrlShowForm?"✕ Cerrar":"+ Nuevo Snapshot"}
    </button>
  </div>

  {/* Add form */}
  {ctrlShowForm && (
    <div style={{padding:16,background:"var(--card)",border:"1px solid var(--gold-dim)",borderRadius:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)"}}>📋 Nuevo Snapshot Mensual</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>{const liveFx=fxRates?.EUR?(1/fxRates.EUR):1.1;setCtrlForm(p=>({...p,fx:Math.round(liveFx*10000)/10000}));}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(100,210,255,.3)",background:"rgba(100,210,255,.06)",color:"#64d2ff",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>🔄 FX Live</button>
          <button onClick={async ()=>{
            let data = ibData;
            if (!data?.loaded) { data = await loadIBData(); }
            const ld = data?.ledger || {};
            const ibUsd = ld.BASE?.nlv || ld.USD?.nlv || 0;
            const summary = data?.summary || {};
            const nlv = summary?.nlv?.amount || ibUsd;
            if (nlv > 0) setCtrlForm(p => ({ ...p, ibUsd: Math.round(nlv) }));
          }} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${ibData?.loaded && ibData?.ledger?.USD ? "rgba(48,209,88,.5)" : "rgba(48,209,88,.3)"}`,background:"rgba(48,209,88,.06)",color:"#30d158",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
            📡 IB{ibData?.loaded && ibData?.ledger?.BASE ? ` ($${Math.round(ibData.ledger.BASE.nlv||0).toLocaleString()})` : ""}
          </button>
          <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Pre-rellenado del último snapshot — modifica solo lo que cambie</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
        {[
          {k:"date",l:"FECHA",t:"date"},
          {k:"fx",l:"EUR/USD",t:"number",s:"0.0001",p:"1.10"},
          {k:"bankinter",l:"BANKINTER €",t:"number",p:"0"},
          {k:"bcCaminos",l:"BC CAMINOS €",t:"number",p:"0"},
          {k:"constructionBank",l:"CONSTR. BANK €",t:"number",p:"0"},
          {k:"revolut",l:"REVOLUT €",t:"number",p:"0"},
          {k:"otrosBancos",l:"OTROS BANCOS €",t:"number",p:"0"},
          {k:"ibUsd",l:"IB $",t:"number",p:"0"},
          {k:"tsUsd",l:"TRADESTATION $",t:"number",p:"0"},
          {k:"tastyUsd",l:"TASTY $",t:"number",p:"0"},
          {k:"fondos",l:"FONDOS €",t:"number",p:"0"},
          {k:"cryptoEur",l:"CRYPTO €",t:"number",p:"0"},
          {k:"sueldo",l:"SUELDO €",t:"number",p:"0"},
          {k:"hipoteca",l:"HIPOTECA €",t:"number",p:"0"},
        ].map(f => (
          <div key={f.k}>
            <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>{f.l}</label>
            <input type={f.t} step={f.s} value={ctrlForm[f.k]||""} onChange={e=>setCtrlForm(p=>({...p,[f.k]:f.t==="date"?e.target.value:parseFloat(e.target.value)||0}))} placeholder={f.p}
              style={{width:"100%",padding:"6px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",boxSizing:"border-box"}}/>
          </div>
        ))}
      </div>
      {/* Live preview */}
      {(() => {
        const bk = (ctrlForm.bankinter||0)+(ctrlForm.bcCaminos||0)+(ctrlForm.constructionBank||0)+(ctrlForm.revolut||0)+(ctrlForm.otrosBancos||0);
        const br = (ctrlForm.ibUsd||0)+(ctrlForm.tsUsd||0)+(ctrlForm.tastyUsd||0);
        const cr = (ctrlForm.cryptoEur||0) * (ctrlForm.fx||1);
        const total = bk*(ctrlForm.fx||1) + br + cr + (ctrlForm.fondos||0)*(ctrlForm.fx||1);
        return total > 0 ? <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"rgba(48,209,88,.06)",border:"1px solid rgba(48,209,88,.15)",display:"flex",gap:16,fontSize:12,fontFamily:"var(--fm)"}}>
          <span>Bancos: <b style={{color:"#64d2ff"}}>€{bk.toLocaleString()}</b></span>
          <span>Brokers: <b style={{color:"var(--gold)"}}>${br.toLocaleString()}</b></span>
          <span style={{fontWeight:700,color:"var(--green)"}}>Total: ${Math.round(total).toLocaleString()}</span>
        </div> : null;
      })()}
      <button onClick={()=>{if(ctrlForm.date){addCtrlEntry(ctrlForm);setCtrlForm(p=>({...p,date:"",bankinter:0,bcCaminos:0,constructionBank:0,revolut:0,otrosBancos:0,ibUsd:0,tsUsd:0,tastyUsd:0,fondos:0,cryptoEur:0,sueldo:0,hipoteca:0}));}}}
        style={{marginTop:10,padding:"8px 20px",borderRadius:8,border:"none",background:"var(--gold)",color:"#000",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>Guardar Snapshot</button>
    </div>
  )}

  {/* Control table */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:900}}>
        <thead>
          <tr>
            <th colSpan={2} style={{padding:"4px 8px",textAlign:"center",color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)",borderBottom:"2px solid var(--border)"}}/>
            <th colSpan={2} style={{padding:"4px 8px",textAlign:"center",color:"var(--gold)",fontSize:8,fontFamily:"var(--fm)",fontWeight:700,letterSpacing:1,borderBottom:"2px solid var(--gold-dim)",background:"rgba(200,164,78,.03)"}}>PATRIMONIO</th>
            <th colSpan={2} style={{padding:"4px 8px",textAlign:"center",color:"#64d2ff",fontSize:8,fontFamily:"var(--fm)",fontWeight:700,letterSpacing:1,borderBottom:"2px solid rgba(100,210,255,.15)",background:"rgba(100,210,255,.02)"}}>DESGLOSE</th>
            <th colSpan={2} style={{padding:"4px 8px",textAlign:"center",color:"var(--text-tertiary)",fontSize:8,fontFamily:"var(--fm)",borderBottom:"2px solid var(--border)"}}/>
          </tr>
          <tr>
            {["FECHA","€/$","PAT USD","PAT EUR","BROKERS $","BANCOS €","CRYPTO €","Δ"].map((h,i)=>
              <th key={i} style={{padding:"6px 10px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {ctrlLog.filter(c=>c.pu>0).map((c,i,arr) => {
            const prev = arr[i+1];
            const chg = prev?.pu ? ((c.pu-prev.pu)/prev.pu*100) : 0;
            return <tr key={c.id||i} style={{background:i%2?"var(--row-alt)":"transparent"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"var(--row-alt)":"transparent"}>
              <td style={{padding:"6px 10px",fontFamily:"var(--fm)",color:"var(--text-primary)",fontWeight:600,borderBottom:"1px solid var(--subtle-bg)"}}>{c.d}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid var(--subtle-bg)"}}>{c.fx?.toFixed(3)}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid var(--subtle-bg)"}}>${(c.pu||0).toLocaleString()}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid var(--subtle-bg)"}}>€{(c.pe||0).toLocaleString()}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid var(--subtle-bg)"}}>${(c.br||0).toLocaleString()}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"#64d2ff",borderBottom:"1px solid var(--subtle-bg)"}}>€{(c.bk||0).toLocaleString()}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"#bf5af2",borderBottom:"1px solid var(--subtle-bg)"}}>{c.cr?`€${(c.cr||0).toLocaleString()}`:"—"}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:chg>=0?"var(--green)":"var(--red)",borderBottom:"1px solid var(--subtle-bg)"}}>{chg?`${chg>=0?"+":""}${_sf(chg,1)}%`:""}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>
</div>
  );
}
