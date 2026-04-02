import { useState, useEffect, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';
import { EmptyState } from '../ui/EmptyState.jsx';

export default function ControlTab() {
  const {
    ctrlLog, ctrlShowForm, setCtrlShowForm,
    ctrlForm, setCtrlForm, addCtrlEntry, ctrlEditId, setCtrlEditId,
    fxRates, ibData, loadIBData,
  } = useHome();

  // Live prices for gold and BTC
  const [goldPrice, setGoldPrice] = useState(0); // EUR per gram
  const [btcPrice, setBtcPrice] = useState(0);   // EUR per BTC

  useEffect(() => {
    const eurRate = fxRates?.EUR || 0.92;
    // Gold: Yahoo Finance GC=F (USD per troy oz, 1 oz = 31.1035g)
    fetch(`${API_URL}/api/prices?tickers=GC%3DF&live=1`).then(r=>r.json()).then(d => {
      const priceUsd = d?.prices?.['GC=F']?.price || 0;
      if (priceUsd > 0) setGoldPrice(Math.round(priceUsd * eurRate / 31.1035 * 100) / 100);
    }).catch(()=>{});
    // BTC: CoinGecko free API
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur').then(r=>r.json()).then(d => {
      const priceEur = d?.bitcoin?.eur || 0;
      if (priceEur > 0) setBtcPrice(Math.round(priceEur));
    }).catch(()=>{});
  }, [fxRates]);

  const prefillForm = useCallback(() => {
    const withData = ctrlLog.filter(c => c.pu > 0);
    const last = withData[0];
    const liveFx = fxRates?.EUR ? (1 / fxRates.EUR) : (last?.fx || 1.1);
    const liveFxCny = fxRates?.CNY ? (fxRates.CNY / (fxRates.EUR || 0.92)) : (last?.fxCny || 7.8);
    if (last) {
      setCtrlForm({
        date: new Date().toISOString().slice(0, 10),
        fx: Math.round(liveFx * 10000) / 10000,
        fxCny: Math.round(liveFxCny * 100) / 100,
        bankinter: last.bankinter || last.bk || 0,
        bcCaminos: last.bcCaminos || 0,
        constructionBankCny: last.constructionBankCny || 0,
        revolut: last.revolut || 0,
        otrosBancos: last.otrosBancos || 0,
        ibUsd: last.ibUsd || last.br || 0,
        tsUsd: last.tsUsd || 0,
        tastyUsd: last.tastyUsd || 0,
        fondos: last.fondos || last.fd || 0,
        salaryUsd: last.salaryUsd || 0,
        salaryCny: last.salaryCny || 0,
        goldGrams: last.goldGrams || 0,
        goldPrice: goldPrice || 0,
        btcAmount: last.btcAmount || 0,
        btcPrice: btcPrice || 0,
      });
    } else {
      setCtrlForm(p => ({ ...p, date: new Date().toISOString().slice(0, 10), fx: Math.round(liveFx * 10000) / 10000, fxCny: Math.round(liveFxCny * 100) / 100, goldPrice, btcPrice }));
    }
    setCtrlEditId(null);
  }, [ctrlLog, fxRates, setCtrlForm, setCtrlEditId, goldPrice, btcPrice]);

  const startEdit = useCallback((c) => {
    setCtrlForm({
      date: c.d,
      fx: c.fx || 1.1,
      fxCny: c.fxCny || (fxRates?.CNY ? (fxRates.CNY / (fxRates.EUR || 0.92)) : 7.8),
      bankinter: c.bankinter || c.bk || 0,
      bcCaminos: c.bcCaminos || 0,
      constructionBankCny: c.constructionBankCny || 0,
      revolut: c.revolut || 0,
      otrosBancos: c.otrosBancos || 0,
      ibUsd: c.ibUsd || c.br || 0,
      tsUsd: c.tsUsd || 0,
      tastyUsd: c.tastyUsd || 0,
      fondos: c.fondos || c.fd || 0,
      salaryUsd: c.salaryUsd || 0,
      salaryCny: c.salaryCny || 0,
      goldGrams: c.goldGrams || 0,
      goldPrice: goldPrice || 0,
      btcAmount: c.btcAmount || 0,
      btcPrice: btcPrice || 0,
    });
    setCtrlEditId(c.id);
    setCtrlShowForm(true);
  }, [fxRates, setCtrlForm, setCtrlEditId, setCtrlShowForm, goldPrice, btcPrice]);

  if (!ctrlLog || ctrlLog.length === 0) {
    return <EmptyState icon="🎛️" title="Sin snapshots de control" subtitle="Registra tu primer snapshot mensual." action="+ Nuevo Snapshot" onAction={() => { prefillForm(); setCtrlShowForm(true); }} />;
  }

  const inp = {width:"100%",padding:"6px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",boxSizing:"border-box"};

  return (
<div style={{display:"flex",flexDirection:"column",gap:12}}>
  {/* KPI cards */}
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

  {/* Form */}
  {ctrlShowForm && (
    <div style={{padding:16,background:"var(--card)",border:"1px solid var(--gold-dim)",borderRadius:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)"}}>
          {ctrlEditId ? "✏️ Editar Snapshot" : "📋 Nuevo Snapshot Mensual"}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>{const liveFx=fxRates?.EUR?(1/fxRates.EUR):1.1;const liveCny=fxRates?.CNY?(fxRates.CNY/(fxRates.EUR||0.92)):7.8;setCtrlForm(p=>({...p,fx:Math.round(liveFx*10000)/10000,fxCny:Math.round(liveCny*100)/100,goldPrice,btcPrice}));}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(100,210,255,.3)",background:"rgba(100,210,255,.06)",color:"#64d2ff",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>🔄 FX + Precios</button>
          <button onClick={async ()=>{
            let data = ibData;
            if (!data?.loaded) { data = await loadIBData(); }
            const summary = data?.summary || {};
            const nlv = summary?.nlv?.amount || 0;
            if (nlv > 0) setCtrlForm(p => ({ ...p, ibUsd: Math.round(nlv) }));
          }} style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(48,209,88,.3)",background:"rgba(48,209,88,.06)",color:"#30d158",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
            📡 IB
          </button>
        </div>
      </div>

      {/* Form sections */}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* FX + Date */}
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"var(--text-tertiary)",marginBottom:4,fontFamily:"var(--fm)"}}>GENERAL</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
            {[
              {k:"date",l:"FECHA",t:"date"},
              {k:"fx",l:"EUR/USD",t:"number",s:"0.0001"},
              {k:"fxCny",l:"EUR/CNY",t:"number",s:"0.01"},
            ].map(f => (
              <div key={f.k}>
                <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>{f.l}</label>
                <input type={f.t} step={f.s} value={ctrlForm[f.k]||""} onChange={e=>setCtrlForm(p=>({...p,[f.k]:f.t==="date"?e.target.value:parseFloat(e.target.value)||0}))} style={inp}/>
              </div>
            ))}
          </div>
        </div>

        {/* Banks EUR */}
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"#2563eb",marginBottom:4,fontFamily:"var(--fm)"}}>🏦 BANCOS EUR</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
            {[
              {k:"bankinter",l:"BANKINTER €"},
              {k:"bcCaminos",l:"BC CAMINOS €"},
              {k:"revolut",l:"REVOLUT €"},
              {k:"otrosBancos",l:"OTROS €"},
            ].map(f => (
              <div key={f.k}>
                <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>{f.l}</label>
                <input type="number" value={ctrlForm[f.k]||""} onChange={e=>setCtrlForm(p=>({...p,[f.k]:parseFloat(e.target.value)||0}))} style={inp}/>
              </div>
            ))}
          </div>
        </div>

        {/* Bank China CNY */}
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"#ef4444",marginBottom:4,fontFamily:"var(--fm)"}}>🇨🇳 BANCO CHINA (CNY)</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>CONSTRUCTION BANK ¥</label>
              <input type="number" value={ctrlForm.constructionBankCny||""} onChange={e=>setCtrlForm(p=>({...p,constructionBankCny:parseFloat(e.target.value)||0}))} style={inp}/>
            </div>
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>≈ EUR</label>
              <div style={{padding:"6px 8px",background:"var(--subtle-bg)",borderRadius:6,fontSize:11,fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>
                €{ctrlForm.fxCny > 0 ? Math.round((ctrlForm.constructionBankCny||0) / ctrlForm.fxCny).toLocaleString() : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Brokers USD */}
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"var(--gold)",marginBottom:4,fontFamily:"var(--fm)"}}>📈 BROKERS USD</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
            {[
              {k:"ibUsd",l:"IB $"},
              {k:"tsUsd",l:"TRADESTATION $"},
              {k:"tastyUsd",l:"TASTY $"},
            ].map(f => (
              <div key={f.k}>
                <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>{f.l}</label>
                <input type="number" value={ctrlForm[f.k]||""} onChange={e=>setCtrlForm(p=>({...p,[f.k]:parseFloat(e.target.value)||0}))} style={inp}/>
              </div>
            ))}
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>FONDOS €</label>
              <input type="number" value={ctrlForm.fondos||""} onChange={e=>setCtrlForm(p=>({...p,fondos:parseFloat(e.target.value)||0}))} style={inp}/>
            </div>
          </div>
        </div>

        {/* Gold + BTC */}
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"#d69e2e",marginBottom:4,fontFamily:"var(--fm)"}}>🥇 ORO + ₿ BITCOIN</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>ORO (gramos)</label>
              <input type="number" step="0.1" value={ctrlForm.goldGrams||""} onChange={e=>setCtrlForm(p=>({...p,goldGrams:parseFloat(e.target.value)||0}))} style={inp}/>
            </div>
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>Precio €/g</label>
              <input type="number" step="0.01" value={ctrlForm.goldPrice||""} onChange={e=>setCtrlForm(p=>({...p,goldPrice:parseFloat(e.target.value)||0}))} style={inp}/>
            </div>
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>= EUR</label>
              <div style={{padding:"6px 8px",background:"var(--subtle-bg)",borderRadius:6,fontSize:11,fontFamily:"var(--fm)",color:"var(--gold)",fontWeight:600}}>
                €{Math.round((ctrlForm.goldGrams||0)*(ctrlForm.goldPrice||0)).toLocaleString()}
              </div>
            </div>
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>BITCOIN (BTC)</label>
              <input type="number" step="0.0001" value={ctrlForm.btcAmount||""} onChange={e=>setCtrlForm(p=>({...p,btcAmount:parseFloat(e.target.value)||0}))} style={inp}/>
            </div>
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>Precio €/BTC</label>
              <input type="number" value={ctrlForm.btcPrice||""} onChange={e=>setCtrlForm(p=>({...p,btcPrice:parseFloat(e.target.value)||0}))} style={inp}/>
            </div>
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>= EUR</label>
              <div style={{padding:"6px 8px",background:"var(--subtle-bg)",borderRadius:6,fontSize:11,fontFamily:"var(--fm)",color:"#ff9f0a",fontWeight:600}}>
                €{Math.round((ctrlForm.btcAmount||0)*(ctrlForm.btcPrice||0)).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Salary */}
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"var(--green)",marginBottom:4,fontFamily:"var(--fm)"}}>💰 SUELDO</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>SUELDO $</label>
              <input type="number" value={ctrlForm.salaryUsd||""} onChange={e=>setCtrlForm(p=>({...p,salaryUsd:parseFloat(e.target.value)||0}))} style={inp}/>
            </div>
            <div>
              <label style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:2}}>SUELDO ¥</label>
              <input type="number" value={ctrlForm.salaryCny||""} onChange={e=>setCtrlForm(p=>({...p,salaryCny:parseFloat(e.target.value)||0}))} style={inp}/>
            </div>
          </div>
        </div>
      </div>

      {/* Live preview */}
      {(() => {
        const fx = ctrlForm.fx || 1;
        const fxCny = ctrlForm.fxCny || 1;
        const cbEur = fxCny > 0 ? (ctrlForm.constructionBankCny||0) / fxCny : 0;
        const bk = (ctrlForm.bankinter||0)+(ctrlForm.bcCaminos||0)+cbEur+(ctrlForm.revolut||0)+(ctrlForm.otrosBancos||0);
        const br = (ctrlForm.ibUsd||0)+(ctrlForm.tsUsd||0)+(ctrlForm.tastyUsd||0);
        const goldEur = (ctrlForm.goldGrams||0) * (ctrlForm.goldPrice||0);
        const btcEur = (ctrlForm.btcAmount||0) * (ctrlForm.btcPrice||0);
        const totalEur = bk + (ctrlForm.fondos||0) + goldEur + btcEur + br/fx;
        const totalUsd = totalEur * fx;
        return totalEur > 0 ? <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"rgba(48,209,88,.06)",border:"1px solid rgba(48,209,88,.15)",display:"flex",gap:12,fontSize:11,fontFamily:"var(--fm)",flexWrap:"wrap"}}>
          <span>Bancos: <b style={{color:"#2563eb"}}>€{Math.round(bk).toLocaleString()}</b></span>
          <span>Brokers: <b style={{color:"var(--gold)"}}>${Math.round(br).toLocaleString()}</b></span>
          {goldEur > 0 && <span>Oro: <b style={{color:"#d69e2e"}}>€{Math.round(goldEur).toLocaleString()}</b></span>}
          {btcEur > 0 && <span>BTC: <b style={{color:"#ff9f0a"}}>€{Math.round(btcEur).toLocaleString()}</b></span>}
          <span style={{fontWeight:700,color:"var(--green)"}}>Total: €{Math.round(totalEur).toLocaleString()} / ${Math.round(totalUsd).toLocaleString()}</span>
        </div> : null;
      })()}
      <button onClick={()=>{if(ctrlForm.date){addCtrlEntry(ctrlForm, ctrlEditId);}}}
        style={{marginTop:10,padding:"8px 20px",borderRadius:8,border:"none",background:"var(--gold)",color:"#000",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>
        {ctrlEditId ? "💾 Guardar Cambios" : "Guardar Snapshot"}
      </button>
    </div>
  )}

  {/* Table */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:1000}}>
        <thead>
          <tr>
            {["FECHA","€/$","PAT USD","PAT EUR","BROKERS $","BANCOS €","ORO €","BTC €","Δ",""].map((h,i)=>
              <th key={i} style={{padding:"6px 10px",textAlign:i===0?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}
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
              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"#2563eb",borderBottom:"1px solid var(--subtle-bg)"}}>€{(c.bk||0).toLocaleString()}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"#d69e2e",borderBottom:"1px solid var(--subtle-bg)"}}>{c.goldEur ? `€${Math.round(c.goldEur).toLocaleString()}` : "—"}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"#ff9f0a",borderBottom:"1px solid var(--subtle-bg)"}}>{c.btcEur ? `€${Math.round(c.btcEur).toLocaleString()}` : "—"}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:chg>=0?"var(--green)":"var(--red)",borderBottom:"1px solid var(--subtle-bg)"}}>{chg?`${chg>=0?"+":""}${_sf(chg,1)}%`:""}</td>
              <td style={{padding:"6px 10px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)"}}>
                <button onClick={()=>startEdit(c)} style={{border:"none",background:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:11,padding:"2px 4px"}} title="Editar">✏️</button>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>
</div>
  );
}
