import { useState, useMemo, useEffect, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';
import { EmptyState } from '../ui/EmptyState.jsx';

// ═══════════════════════════════════════
// Snapshots Section (ex-ControlTab)
// ═══════════════════════════════════════
function SnapshotsSection() {
  const {
    ctrlLog, ctrlShowForm, setCtrlShowForm,
    ctrlForm, setCtrlForm, addCtrlEntry, deleteCtrlEntry, ctrlEditId, setCtrlEditId,
    fxRates, ibData, loadIBData,
  } = useHome();

  const [goldPrice, setGoldPrice] = useState(0);
  const [btcPrice, setBtcPrice] = useState(0);

  useEffect(() => {
    const eurRate = fxRates?.EUR || 0.92;
    fetch(`${API_URL}/api/prices?tickers=GC%3DF&live=1`).then(r=>r.json()).then(d => {
      const priceUsd = d?.prices?.['GC=F']?.price || 0;
      if (priceUsd > 0) setGoldPrice(Math.round(priceUsd * eurRate / 31.1035 * 100) / 100);
    }).catch(()=>{});
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
          <div style={{fontSize:9,fontWeight:700,color:"#30d158",marginBottom:4,fontFamily:"var(--fm)"}}>📈 BROKERS USD</div>
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
          <span>Brokers: <b style={{color:"#30d158"}}>${Math.round(br).toLocaleString()}</b></span>
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
            {["FECHA","PAT USD","€/$","PAT EUR","Δ","BROKERS $","BANCOS €","ORO €","BTC €",""].map((h,i)=>
              <th key={i} style={{padding:"6px 10px",textAlign:i===0?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {ctrlLog.filter(c=>c.pu>0).map((c,i,arr) => {
            const prev = arr[i+1];
            const chg = prev?.pu ? ((c.pu-prev.pu)/prev.pu*100) : 0;
            const td0 = {padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"};
            return <tr key={c.id||i} style={{background:i%2?"var(--row-alt)":"transparent"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"var(--row-alt)":"transparent"}>
              <td style={{padding:"6px 10px",fontFamily:"var(--fm)",color:"var(--text-primary)",fontWeight:600,borderBottom:"1px solid var(--subtle-bg)"}}>{c.d}</td>
              <td style={{...td0,fontWeight:700,color:"var(--text-primary)"}}>${(c.pu||0).toLocaleString()}</td>
              <td style={{...td0,color:"var(--text-tertiary)",fontSize:10}}>{c.fx?.toFixed(3)}</td>
              <td style={{...td0,color:"var(--text-secondary)"}}>€{(c.pe||0).toLocaleString()}</td>
              <td style={{...td0,fontWeight:600,color:chg>=0?"var(--green)":"var(--red)"}}>{chg?`${chg>=0?"+":""}${_sf(chg,1)}%`:""}</td>
              <td style={{...td0,color:"#30d158"}}>${(c.br||0).toLocaleString()}</td>
              <td style={{...td0,color:"#2563eb"}}>€{(c.bk||0).toLocaleString()}</td>
              <td style={{...td0,color:"#d69e2e"}}>{c.goldEur ? `€${Math.round(c.goldEur).toLocaleString()}` : "—"}</td>
              <td style={{...td0,color:"#ff9f0a"}}>{c.btcEur ? `€${Math.round(c.btcEur).toLocaleString()}` : "—"}</td>
              <td style={{padding:"6px 10px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)"}}>
                <button onClick={()=>startEdit(c)} style={{border:"none",background:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:11,padding:"2px 4px"}} title="Editar">✏️</button>
                <button onClick={()=>{if(window.confirm(`¿Eliminar snapshot ${c.d}?`))deleteCtrlEntry(c.id)}} style={{border:"none",background:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:11,padding:"2px 4px",marginLeft:2}} title="Eliminar">🗑️</button>
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

// ═══════════════════════════════════════
// Proyección de Patrimonio Component
// ═══════════════════════════════════════
function ProyeccionSection({ CTRL_DATA, INCOME_DATA, DIV_BY_YEAR, GASTOS_MONTH, fxRates }) {
  const data = CTRL_DATA.filter(c => c.pu > 0).sort((a,b) => (a.d||"").localeCompare(b.d||""));
  const latest = data[data.length - 1] || {};
  const fxEurUsd = fxRates?.EUR ? 1/fxRates.EUR : latest?.fx || 1.15;

  // ─── Real data extraction ───
  const currentPat = latest.pu || 0;
  const currentYear = new Date().getFullYear();

  // Historical CAGR from real data
  const first = data[0] || {};
  const totalYears = data.length > 1 ? ((new Date(latest.d) - new Date(first.d)) / (365.25*24*3600*1000)) : 1;
  const historicalCAGR = first.pu > 0 ? ((Math.pow(latest.pu / first.pu, 1/totalYears) - 1) * 100) : 7;

  // Average salary from INCOME_DATA
  const salaries = INCOME_DATA.filter(d => d.sl > 0).map(d => d.sl);
  const avgSalaryUSD = salaries.length > 0 ? salaries.reduce((s,v) => s+v, 0) / salaries.length * 12 : 0;

  // Annual dividends (last full year)
  const divYears = Object.keys(DIV_BY_YEAR).sort();
  const lastDivYear = divYears.length >= 2 ? divYears[divYears.length - 2] : divYears[divYears.length - 1];
  const annualDivUSD = lastDivYear ? (DIV_BY_YEAR[lastDivYear]?.n || 0) : 0;

  // Annual options income from INCOME_DATA
  const last12Income = INCOME_DATA.slice(-12);
  const annualOptionsUSD = last12Income.reduce((s,d) => s + (d.cs||0) + (d.rop||0) + (d.roc||0) + (d.cal||0) + (d.leaps||0), 0);

  // Average annual gastos from GASTOS_MONTH
  const gMonths = Object.keys(GASTOS_MONTH).sort().slice(-12);
  const avgGastosMensual = gMonths.length > 0 ? gMonths.reduce((s,m) => {
    const d = GASTOS_MONTH[m];
    return s + (d.eur||0) * fxEurUsd + (d.cny||0) / 7.25 + (d.usd||0);
  }, 0) / gMonths.length : 7580;
  const annualGastosUSD = avgGastosMensual * 12;

  // ─── Editable Params ───
  const [params, setParams] = useState({
    patrimonioInicial: Math.round(currentPat),
    retorno: Math.round(historicalCAGR * 10) / 10 || 7,
    inflacion: 2.5,
    salarioAnual: Math.round(avgSalaryUSD),
    dividendosAnual: Math.round(annualDivUSD),
    opcionesAnual: Math.round(annualOptionsUSD),
    gastosAnual: Math.round(annualGastosUSD),
    crecimientoSueldo: 3,
    crecimientoDividendos: 8,
    anosProyeccion: 20,
    edadActual: 40,
    edadRetiro: 55,
    incluirSueldo: true,
    incluirOpciones: true,
  });

  const [scenario, setScenario] = useState('base');

  const SCENARIOS = {
    base: { name: '📊 Base', desc: 'Datos reales actuales', retorno: params.retorno, inflacion: params.inflacion },
    conservador: { name: '🛡️ Conservador', desc: '5% retorno, 3.5% inflación', retorno: 5, inflacion: 3.5 },
    optimista: { name: '🚀 Optimista', desc: '10% retorno, 2% inflación', retorno: 10, inflacion: 2 },
    crisis: { name: '💥 Crisis', desc: '2% retorno, 4% inflación, sin sueldo', retorno: 2, inflacion: 4 },
  };

  const up = (field, value) => setParams(p => ({ ...p, [field]: value }));

  // ─── Projection engine ───
  const projection = useMemo(() => {
    const sc = SCENARIOS[scenario];
    const retornoPct = scenario === 'base' ? params.retorno : sc.retorno;
    const inflacionPct = scenario === 'base' ? params.inflacion : sc.inflacion;
    const rows = [];

    let pat = params.patrimonioInicial;
    let gastos = params.gastosAnual;
    let sueldo = params.salarioAnual;
    let divs = params.dividendosAnual;
    let opciones = params.opcionesAnual;

    for (let i = 0; i <= params.anosProyeccion; i++) {
      const year = currentYear + i;
      const edad = params.edadActual + i;
      const retirado = edad >= params.edadRetiro;

      const patInicio = pat;
      const rentabilidad = pat * (retornoPct / 100);

      // After retirement: no salary, no options
      const ingresoSueldo = (retirado || !params.incluirSueldo) ? 0 : sueldo;
      const ingresoOpciones = (retirado || !params.incluirOpciones) ? 0 : opciones;
      const ingresoDividendos = divs;
      const ingresoTotal = rentabilidad + ingresoSueldo + ingresoDividendos + ingresoOpciones;
      const gastoInflado = gastos;
      const netCashFlow = ingresoSueldo + ingresoDividendos + ingresoOpciones - gastoInflado;
      const ahorro = ingresoSueldo - gastoInflado;

      pat = patInicio + rentabilidad + netCashFlow;
      if (pat < 0) pat = 0;

      const retReal = retornoPct - inflacionPct;
      const patReal = i === 0 ? patInicio : patInicio / Math.pow(1 + inflacionPct/100, i);
      const fireNumber = retornoPct > 0 ? gastos / (retornoPct / 100) : 0;

      rows.push({
        year, edad, retirado,
        patInicio, rentabilidad, retornoPct,
        ingresoSueldo, ingresoDividendos, ingresoOpciones, ingresoTotal,
        gastos: gastoInflado, netCashFlow, ahorro,
        patFinal: pat,
        retReal,
        patReal: pat / Math.pow(1 + inflacionPct/100, i+1),
        inflacionAcum: Math.pow(1 + inflacionPct/100, i+1) - 1,
        fireNumber,
        firePct: fireNumber > 0 ? pat / fireNumber * 100 : 0,
      });

      // Grow for next year
      gastos *= (1 + inflacionPct / 100);
      sueldo *= (1 + params.crecimientoSueldo / 100);
      divs *= (1 + params.crecimientoDividendos / 100);
      opciones *= 1.03; // modest 3% growth
    }
    return rows;
  }, [params, scenario, currentYear]);

  // ─── Milestones ───
  const milestones = useMemo(() => {
    const m = [];
    const targets = [500000, 1000000, 1500000, 2000000, 3000000, 5000000];
    for (const t of targets) {
      const row = projection.find(r => r.patFinal >= t);
      if (row && (projection[0]?.patInicio || 0) < t) m.push({ target: t, year: row.year, edad: row.edad });
    }
    const fireRow = projection.find(r => r.firePct >= 100);
    if (fireRow) m.push({ target: 'FIRE', year: fireRow.year, edad: fireRow.edad, label: '🔥 FIRE' });
    return m;
  }, [projection]);

  const fN = v => `$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fNs = v => `${v >= 0 ? '' : '-'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 };
  const retCol = v => v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--text-secondary)";

  const lastRow = projection[projection.length - 1] || {};
  const retiroRow = projection.find(r => r.retirado) || {};
  const maxPat = projection.length > 0 ? Math.max(...projection.map(r => r.patFinal), 1) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Scenario selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(SCENARIOS).map(([id, sc]) => (
          <button key={id} onClick={() => setScenario(id)}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${scenario === id ? 'var(--gold)' : 'var(--border)'}`, background: scenario === id ? 'var(--gold-dim)' : 'transparent', color: scenario === id ? 'var(--gold)' : 'var(--text-tertiary)', fontSize: 11, fontWeight: scenario === id ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--fb)' }}>
            {sc.name}
          </button>
        ))}
      </div>

      {/* KPI summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {[
          { l: 'PATRIMONIO HOY', v: fN(params.patrimonioInicial), c: 'var(--gold)' },
          { l: `PATRIMONIO ${lastRow.year}`, v: fN(lastRow.patFinal || 0), sub: `en ${params.anosProyeccion} años`, c: 'var(--green)' },
          { l: 'PATRIMONIO REAL', v: fN(lastRow.patReal || 0), sub: `ajust. inflación ${((lastRow.inflacionAcum||0)*100).toFixed(0)}%`, c: '#64d2ff' },
          { l: 'MULTIPLICADOR', v: `${((lastRow.patFinal || 0) / (params.patrimonioInicial || 1)).toFixed(1)}x`, sub: `nominal`, c: 'var(--gold)' },
          { l: 'PAT. JUBILACIÓN', v: fN(retiroRow.patInicio || 0), sub: `edad ${params.edadRetiro} (${retiroRow.year || '?'})`, c: 'var(--orange)' },
          { l: 'FIRE %', v: `${((retiroRow.firePct || 0)).toFixed(0)}%`, sub: retiroRow.firePct >= 100 ? '✅ Cubierto' : '❌ Insuficiente', c: (retiroRow.firePct || 0) >= 100 ? 'var(--green)' : 'var(--red)' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: .8, fontWeight: 600, marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--fm)', color: k.c, lineHeight: 1.1 }}>{k.v}</div>
            {k.sub && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 3 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Params editor + Results side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {/* Params */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 10, fontFamily: 'var(--fd)' }}>⚙️ Parámetros</div>
          {[
            ['Patrimonio inicial ($)', 'patrimonioInicial', 10000],
            ['Retorno anual (%)', 'retorno', 0.5],
            ['Inflación (%)', 'inflacion', 0.1],
            ['Salario anual ($)', 'salarioAnual', 5000],
            ['Crecimiento sueldo (%)', 'crecimientoSueldo', 0.5],
            ['Dividendos anuales ($)', 'dividendosAnual', 500],
            ['Crecimiento dividendos (%)', 'crecimientoDividendos', 1],
            ['Opciones anuales ($)', 'opcionesAnual', 500],
            ['Gastos anuales ($)', 'gastosAnual', 1000],
            ['Años proyección', 'anosProyeccion', 1],
            ['Edad actual', 'edadActual', 1],
            ['Edad retiro', 'edadRetiro', 1],
          ].map(([label, field, step]) => (
            <div key={field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>{label}</span>
              <input type="number" step={step} value={params[field]}
                onChange={e => up(field, parseFloat(e.target.value) || 0)}
                style={{ width: 95, padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--fm)', textAlign: 'right' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {[['Incluir sueldo', 'incluirSueldo'], ['Incluir opciones', 'incluirOpciones']].map(([lbl, f]) => (
              <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fm)', cursor: 'pointer' }}>
                <input type="checkbox" checked={params[f]} onChange={e => up(f, e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                {lbl}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 8, fontStyle: 'italic' }}>
            💡 Datos pre-cargados de tu cartera real. Ajusta según tu plan.
          </div>
        </div>

        {/* Milestones */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 10, fontFamily: 'var(--fd)' }}>🏁 Hitos</div>
          {milestones.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sin hitos alcanzables en el horizonte</div>
          ) : milestones.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < milestones.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: m.target === 'FIRE' ? 'rgba(255,159,10,.1)' : 'rgba(48,209,88,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                {m.target === 'FIRE' ? '🔥' : '💰'}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)' }}>
                  {m.label || (m.target >= 1e6 ? `$${(m.target/1e6).toFixed(1)}M` : `$${(m.target/1e3).toFixed(0)}K`)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                  {m.year} · Edad {m.edad} · en {m.year - currentYear} años
                </div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: m.target === 'FIRE' ? 'var(--orange)' : 'var(--green)', fontFamily: 'var(--fm)' }}>
                {m.year - currentYear}a
              </div>
            </div>
          ))}
          {/* Mini insights */}
          <div style={{ marginTop: 12, padding: '10px', background: 'rgba(214,158,46,.04)', borderRadius: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fm)', marginBottom: 4 }}>📌 DATOS REALES USADOS</div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', lineHeight: 1.6 }}>
              • Patrimonio actual: <b style={{ color: 'var(--text-secondary)' }}>{fN(currentPat)}</b><br/>
              • CAGR histórico ({_sf(totalYears,1)}a): <b style={{ color: 'var(--text-secondary)' }}>{_sf(historicalCAGR,1)}%</b><br/>
              • Sueldo medio: <b style={{ color: 'var(--text-secondary)' }}>{fN(avgSalaryUSD)}/año</b><br/>
              • Dividendos netos: <b style={{ color: 'var(--text-secondary)' }}>{fN(annualDivUSD)}/año</b><br/>
              • Opciones: <b style={{ color: 'var(--text-secondary)' }}>{fN(annualOptionsUSD)}/año</b><br/>
              • Gastos: <b style={{ color: 'var(--text-secondary)' }}>{fN(annualGastosUSD)}/año ({fN(avgGastosMensual)}/mes)</b>
            </div>
          </div>
        </div>
      </div>

      {/* Projection chart — SVG bezier curves */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
          📈 Proyección Patrimonial — {SCENARIOS[scenario].name}
        </div>
        {(() => {
          const W = 800, H = 260, padL = 55, padR = 20, padT = 30, padB = 40;
          const cW = W - padL - padR, cH = H - padT - padB;
          const n = projection.length;
          if (n < 2) return null;

          const yMax = Math.max(...projection.map(r => r.patFinal)) * 1.18;
          const yMin = 0;

          const px = (i) => padL + (i / (n - 1)) * cW;
          const py = (v) => padT + cH - ((v - yMin) / (yMax - yMin)) * cH;

          // Build points
          const pts = projection.map((r, i) => ({ x: px(i), y: py(r.patFinal) }));
          const ptsHi = projection.map((r, i) => ({ x: px(i), y: py(r.patFinal * 1.15) }));
          const ptsLo = projection.map((r, i) => ({ x: px(i), y: py(r.patFinal * 0.85) }));

          // Smooth bezier path from points
          const bezier = (points) => {
            if (points.length < 2) return '';
            let d = `M${points[0].x},${points[0].y}`;
            for (let i = 0; i < points.length - 1; i++) {
              const p0 = points[Math.max(0, i - 1)];
              const p1 = points[i];
              const p2 = points[i + 1];
              const p3 = points[Math.min(points.length - 1, i + 2)];
              const cp1x = p1.x + (p2.x - p0.x) / 6;
              const cp1y = p1.y + (p2.y - p0.y) / 6;
              const cp2x = p2.x - (p3.x - p1.x) / 6;
              const cp2y = p2.y - (p3.y - p1.y) / 6;
              d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
            }
            return d;
          };

          const mainPath = bezier(pts);
          const hiPath = bezier(ptsHi);
          const loPath = bezier(ptsLo);

          // Confidence band closed path (hi forward + lo reverse)
          const bandPath = hiPath + ` L${ptsLo[ptsLo.length - 1].x},${ptsLo[ptsLo.length - 1].y}` +
            ptsLo.slice().reverse().reduce((d, p, i) => {
              if (i === 0) return d;
              const rev = [...ptsLo].reverse();
              const p0 = rev[Math.max(0, i - 1)];
              const p1 = rev[i];
              const p2 = rev[Math.min(rev.length - 1, i + 1)];
              const p3 = rev[Math.min(rev.length - 1, i + 2)];
              // Reversed control points
              return d;
            }, '') + ' Z';
          // Simpler confidence band using polyline fill
          const bandPoly = ptsHi.map(p => `${p.x},${p.y}`).join(' ') + ' ' +
            [...ptsLo].reverse().map(p => `${p.x},${p.y}`).join(' ');

          // Fill area under main curve (working vs retirement)
          const retiroIdx = projection.findIndex(r => r.retirado);
          const splitIdx = retiroIdx > 0 ? retiroIdx : n;

          // Working phase fill
          const workPts = pts.slice(0, splitIdx + 1);
          const workPath = bezier(workPts);
          const workFill = workPts.length > 1 ? workPath + ` L${workPts[workPts.length-1].x},${padT + cH} L${workPts[0].x},${padT + cH} Z` : '';

          // Retirement phase fill
          const retPts = splitIdx < n ? pts.slice(splitIdx) : [];
          const retPath = retPts.length > 1 ? bezier(retPts) : '';
          const retFill = retPts.length > 1 ? retPath + ` L${retPts[retPts.length-1].x},${padT + cH} L${retPts[0].x},${padT + cH} Z` : '';

          // Grid lines
          const gridCount = 5;
          const gridLines = [];
          for (let i = 0; i <= gridCount; i++) {
            const val = yMin + (yMax - yMin) * (i / gridCount);
            const yy = py(val);
            gridLines.push({ y: yy, val });
          }

          // Milestones on curve
          const MILESTONE_TARGETS = [500000, 1000000, 1500000, 2000000];
          const milestonesOnCurve = [];
          for (const t of MILESTONE_TARGETS) {
            const idx = projection.findIndex(r => r.patFinal >= t);
            if (idx >= 0 && (projection[0]?.patInicio || 0) < t) {
              milestonesOnCurve.push({ target: t, idx, x: pts[idx].x, y: pts[idx].y, year: projection[idx].year, label: t >= 1e6 ? `$${(t/1e6).toFixed(1)}M` : `$${(t/1e3).toFixed(0)}K` });
            }
          }

          // Year labels on x-axis
          const xLabels = projection.filter((r, i) => i === 0 || i === n - 1 || i % Math.max(1, Math.floor(n / 8)) === 0 || (retiroIdx > 0 && i === retiroIdx));

          return (
            <div style={{ overflowX: 'auto' }}>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: '100%' }}>
                <defs>
                  <linearGradient id="projWorkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d69e2e" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#d69e2e" stopOpacity="0.03" />
                  </linearGradient>
                  <linearGradient id="projRetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#64d2ff" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="#64d2ff" stopOpacity="0.03" />
                  </linearGradient>
                  <style>{`
                    @keyframes projPulse { 0%,100% { r: 5; opacity: 1; } 50% { r: 9; opacity: 0.5; } }
                  `}</style>
                </defs>

                {/* Grid lines */}
                {gridLines.map((g, i) => (
                  <g key={i}>
                    <line x1={padL} y1={g.y} x2={W - padR} y2={g.y} stroke="var(--subtle-bg2)" strokeWidth="1" />
                    <text x={padL - 6} y={g.y + 3} textAnchor="end" fill="var(--text-tertiary)" fontSize="8" fontFamily="var(--fm)">
                      {g.val >= 1e6 ? `$${(g.val/1e6).toFixed(1)}M` : `$${(g.val/1e3).toFixed(0)}K`}
                    </text>
                  </g>
                ))}

                {/* Confidence band */}
                <polygon points={bandPoly} fill="var(--gold)" opacity="0.08" />

                {/* Retirement dashed line */}
                {retiroIdx > 0 && (
                  <line x1={px(retiroIdx)} y1={padT} x2={px(retiroIdx)} y2={padT + cH} stroke="var(--orange)" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.6" />
                )}

                {/* Area fills */}
                {workFill && <path d={workFill} fill="url(#projWorkGrad)" />}
                {retFill && <path d={retFill} fill="url(#projRetGrad)" />}

                {/* Main curve - working phase */}
                {workPts.length > 1 && <path d={workPath} fill="none" stroke="#d69e2e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

                {/* Main curve - retirement phase */}
                {retPts.length > 1 && <path d={retPath} fill="none" stroke="#64d2ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

                {/* Milestone markers */}
                {milestonesOnCurve.map((m, i) => (
                  <g key={i}>
                    <circle cx={m.x} cy={m.y} r="4" fill="var(--card)" stroke="var(--gold)" strokeWidth="2" />
                    <line x1={m.x} y1={m.y - 6} x2={m.x} y2={m.y - 18} stroke="var(--gold)" strokeWidth="1" opacity="0.4" />
                    <rect x={m.x - 20} y={m.y - 32} width="40" height="14" rx="4" fill="var(--card)" stroke="var(--gold)" strokeWidth="0.5" opacity="0.9" />
                    <text x={m.x} y={m.y - 22} textAnchor="middle" fill="var(--gold)" fontSize="8" fontWeight="700" fontFamily="var(--fm)">{m.label}</text>
                  </g>
                ))}

                {/* Current position pulsing dot */}
                <circle cx={pts[0].x} cy={pts[0].y} r="5" fill="var(--gold)" opacity="0.3" style={{ animation: 'projPulse 2s ease-in-out infinite' }} />
                <circle cx={pts[0].x} cy={pts[0].y} r="4" fill="var(--gold)" stroke="var(--card)" strokeWidth="2" />

                {/* X-axis year labels */}
                {xLabels.map((r) => {
                  const i = projection.indexOf(r);
                  const isRet = retiroIdx > 0 && i === retiroIdx;
                  return (
                    <text key={r.year} x={px(i)} y={H - 8} textAnchor="middle" fill={isRet ? 'var(--orange)' : 'var(--text-tertiary)'} fontSize="8" fontWeight={isRet ? 700 : 400} fontFamily="var(--fm)">
                      {isRet ? `\u{1F3D6}${r.year}` : r.year}
                    </text>
                  );
                })}

                {/* Retirement label */}
                {retiroIdx > 0 && (
                  <text x={px(retiroIdx) + 4} y={padT + 10} fill="var(--orange)" fontSize="8" fontWeight="600" fontFamily="var(--fm)">Retiro</text>
                )}

                {/* End value label */}
                <text x={pts[n-1].x + 4} y={pts[n-1].y - 4} fill={projection[n-1].retirado ? '#64d2ff' : 'var(--gold)'} fontSize="9" fontWeight="700" fontFamily="var(--fm)">
                  {lastRow.patFinal >= 1e6 ? `$${(lastRow.patFinal/1e6).toFixed(1)}M` : `$${(lastRow.patFinal/1e3).toFixed(0)}K`}
                </text>
              </svg>
            </div>
          );
        })()}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
          <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>● Fase trabajo</span>
          <span style={{ fontSize: 9, color: '#64d2ff', fontFamily: 'var(--fm)' }}>● Jubilación</span>
          <span style={{ fontSize: 9, color: 'var(--orange)', fontFamily: 'var(--fm)' }}>┊ Retiro ({params.edadRetiro})</span>
          <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--fm)', opacity: 0.5 }}>░ Banda ±15%</span>
        </div>
      </div>

      {/* Cash Flow Waterfall */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
          💧 Cash Flow Mensual (año actual)
        </div>
        {(() => {
          const salarioMes = params.salarioAnual / 12;
          const divMes = params.dividendosAnual / 12;
          const opcMes = params.opcionesAnual / 12;
          const gastosMes = params.gastosAnual / 12;
          const netMes = salarioMes + divMes + opcMes - gastosMes;

          const bars = [
            { label: 'Salario', value: salarioMes, color: '#30d158' },
            { label: 'Dividendos', value: divMes, color: '#64d2ff' },
            { label: 'Opciones', value: opcMes, color: '#a29bfe' },
            { label: 'Gastos', value: -gastosMes, color: '#ff453a' },
            { label: 'Neto', value: netMes, color: '#d69e2e', isNet: true },
          ];

          const absMax = Math.max(...bars.map(b => Math.abs(b.value)), 1);
          const bW = 700, bH = 120, bPadL = 70, bPadR = 20, bPadT = 10, bPadB = 28;
          const chartW = bW - bPadL - bPadR;
          const chartH = bH - bPadT - bPadB;
          const barCount = bars.length;
          const barGap = chartW / barCount;
          const barWidth = barGap * 0.55;
          const midY = bPadT + chartH / 2;

          return (
            <div style={{ overflowX: 'auto' }}>
              <svg width="100%" viewBox={`0 0 ${bW} ${bH}`} style={{ display: 'block', maxWidth: '100%' }}>
                {/* Zero line */}
                <line x1={bPadL} y1={midY} x2={bW - bPadR} y2={midY} stroke="var(--border-hover)" strokeWidth="1" />

                {bars.map((b, i) => {
                  const x = bPadL + i * barGap + (barGap - barWidth) / 2;
                  const hPct = Math.abs(b.value) / absMax;
                  const maxBarH = chartH / 2 - 4;
                  const barH = hPct * maxBarH;
                  const y = b.value >= 0 ? midY - barH : midY;

                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={barWidth} height={Math.max(barH, 2)} rx="4" fill={b.color} opacity={b.isNet ? 0.9 : 0.65} />
                      {/* Value label */}
                      <text x={x + barWidth / 2} y={b.value >= 0 ? y - 4 : y + barH + 10} textAnchor="middle" fill={b.color} fontSize="8" fontWeight="700" fontFamily="var(--fm)">
                        {b.value >= 0 ? '+' : '-'}${Math.abs(b.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </text>
                      {/* Bar label */}
                      <text x={x + barWidth / 2} y={bH - 6} textAnchor="middle" fill="var(--text-tertiary)" fontSize="8" fontFamily="var(--fm)">
                        {b.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          );
        })()}
      </div>

      {/* Nominal vs Real chart */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
          💡 Patrimonio Nominal vs Real (ajustado inflación)
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140, padding: '0 4px' }}>
          {projection.map((r, i) => {
            const hNom = Math.max((r.patFinal / maxPat) * 100, 1);
            const hReal = Math.max((r.patReal / maxPat) * 100, 1);
            const show = i === 0 || i === projection.length - 1 || i % Math.max(1, Math.floor(projection.length / 6)) === 0;
            return (
              <div key={r.year} style={{ flex: 1, display: 'flex', gap: 1, alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
                <div style={{ width: '40%', maxWidth: 8, height: `${hNom}%`, background: 'var(--gold)', borderRadius: '2px 2px 0 0', opacity: 0.5 }} title={`Nominal: ${fN(r.patFinal)}`} />
                <div style={{ width: '40%', maxWidth: 8, height: `${hReal}%`, background: '#64d2ff', borderRadius: '2px 2px 0 0', opacity: 0.5 }} title={`Real: ${fN(r.patReal)}`} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{projection[0]?.year}</span>
          <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{lastRow.year}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>● Nominal: {fN(lastRow.patFinal || 0)}</span>
          <span style={{ fontSize: 9, color: '#64d2ff', fontFamily: 'var(--fm)' }}>● Real: {fN(lastRow.patReal || 0)}</span>
          <span style={{ fontSize: 9, color: 'var(--red)', fontFamily: 'var(--fm)' }}>Inflación acum: {((lastRow.inflacionAcum||0)*100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Annual Projection Table */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>📋 Tabla Anual — {SCENARIOS[scenario].name}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 1100 }}>
            <thead>
              <tr>
                {['AÑO','EDAD','PAT. INICIO','RETORNO %','RENTAB. $','SUELDO','DIVS','OPC','GASTOS','AHORRO','PAT. FINAL','PAT. REAL','FIRE %'].map((h,i) => (
                  <th key={i} style={{ padding: '6px 8px', textAlign: i < 2 ? 'center' : 'right', color: 'var(--text-tertiary)', fontSize: 8, fontWeight: 600, fontFamily: 'var(--fm)', letterSpacing: .4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projection.map((r, i) => {
                const isRetiro = r.year === retiroRow.year;
                const bg = isRetiro ? 'rgba(255,159,10,.06)' : i % 2 ? 'var(--row-alt)' : 'transparent';
                const td = { padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--fm)', borderBottom: '1px solid var(--subtle-bg)' };
                return (
                  <tr key={r.year} style={{ background: bg }}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: isRetiro ? 'var(--orange)' : 'var(--text-secondary)' }}>{isRetiro ? `🏖️ ${r.year}` : r.year}</td>
                    <td style={{ ...td, textAlign: 'center', color: r.retirado ? 'var(--orange)' : 'var(--text-tertiary)' }}>{r.edad}</td>
                    <td style={{ ...td, color: 'var(--text-primary)', fontWeight: 600 }}>{fN(r.patInicio)}</td>
                    <td style={{ ...td, color: 'var(--text-tertiary)' }}>{r.retornoPct.toFixed(1)}%</td>
                    <td style={{ ...td, color: 'var(--green)' }}>{fN(r.rentabilidad)}</td>
                    <td style={{ ...td, color: r.ingresoSueldo > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{r.ingresoSueldo > 0 ? fN(r.ingresoSueldo) : '—'}</td>
                    <td style={{ ...td, color: '#64d2ff' }}>{fN(r.ingresoDividendos)}</td>
                    <td style={{ ...td, color: r.ingresoOpciones > 0 ? '#a29bfe' : 'var(--text-tertiary)' }}>{r.ingresoOpciones > 0 ? fN(r.ingresoOpciones) : '—'}</td>
                    <td style={{ ...td, color: 'var(--red)' }}>-{fN(r.gastos)}</td>
                    <td style={{ ...td, color: retCol(r.ahorro), fontWeight: 600 }}>{fNs(r.ahorro)}</td>
                    <td style={{ ...td, color: 'var(--gold)', fontWeight: 700 }}>{fN(r.patFinal)}</td>
                    <td style={{ ...td, color: '#64d2ff' }}>{fN(r.patReal)}</td>
                    <td style={{ ...td, fontWeight: 700, color: r.firePct >= 100 ? 'var(--green)' : r.firePct >= 70 ? 'var(--gold)' : 'var(--red)' }}>
                      {r.firePct.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sensitivity: return % vs years */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
          🎯 Sensibilidad — Patrimonio Final según Retorno y Ahorro
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 500 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 8, fontWeight: 600, fontFamily: 'var(--fm)', borderBottom: '1px solid var(--border)' }}>
                  Retorno ↓ / Gastos →
                </th>
                {[60000, 80000, 100000, 120000, 150000].map(g => (
                  <th key={g} style={{ padding: '6px 8px', textAlign: 'center', color: Math.abs(params.gastosAnual - g) < 5000 ? 'var(--gold)' : 'var(--text-tertiary)', fontSize: 8, fontWeight: 600, fontFamily: 'var(--fm)', borderBottom: '1px solid var(--border)' }}>
                    ${(g/1e3).toFixed(0)}K
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[4, 5, 6, 7, 8, 10, 12].map(ret => (
                <tr key={ret}>
                  <td style={{ padding: '5px 8px', fontWeight: 600, fontFamily: 'var(--fm)', color: Math.abs(params.retorno - ret) < 0.5 ? 'var(--gold)' : 'var(--text-secondary)', borderBottom: '1px solid var(--subtle-bg)' }}>{ret}%</td>
                  {[60000, 80000, 100000, 120000, 150000].map(g => {
                    // Quick sim: compound pat for N years
                    let p = params.patrimonioInicial;
                    let gs = g;
                    let sl = params.salarioAnual;
                    let dv = params.dividendosAnual;
                    for (let y = 0; y < params.anosProyeccion; y++) {
                      const edad = params.edadActual + y;
                      const retirado = edad >= params.edadRetiro;
                      p = p * (1 + ret/100) + (retirado ? 0 : sl) + dv - gs;
                      if (p < 0) { p = 0; break; }
                      gs *= 1.025; sl *= 1.03; dv *= 1.08;
                    }
                    const isActive = Math.abs(params.retorno - ret) < 0.5 && Math.abs(params.gastosAnual - g) < 5000;
                    return (
                      <td key={g} style={{
                        padding: '5px 8px', textAlign: 'center', fontWeight: isActive ? 800 : 600,
                        fontFamily: 'var(--fm)', borderBottom: '1px solid var(--subtle-bg)',
                        color: p >= 2e6 ? 'var(--green)' : p >= 1e6 ? 'var(--gold)' : p > 0 ? 'var(--orange)' : 'var(--red)',
                        background: isActive ? 'rgba(214,158,46,.1)' : 'transparent',
                      }}>
                        {p >= 1e6 ? `$${(p/1e6).toFixed(1)}M` : p > 0 ? `$${(p/1e3).toFixed(0)}K` : '💀'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 6, textAlign: 'center' }}>
          Patrimonio final en {params.anosProyeccion} años · 🟢 ≥$2M · 🟡 ≥$1M · 🟠 &lt;$1M · 💀 quebrado
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// Main PatrimonioTab
// ═══════════════════════════════════════
export default function PatrimonioTab() {
  const { CTRL_DATA, INCOME_DATA, DIV_BY_YEAR, GASTOS_MONTH, fxRates, ibData, hide, privacyMode } = useHome();
  const [section, setSection] = useState('historial');
  const [hoveredBar, setHoveredBar] = useState(null);

  const data = CTRL_DATA.filter(c => c.pu > 0).sort((a,b) => (a.d||"").localeCompare(b.d||"")).map((c, i, arr) => {
  const prev = i > 0 ? arr[i-1] : null;
  const mReturnUsd = prev?.pu ? ((c.pu - prev.pu) / prev.pu * 100) : null;
  const mReturnEur = prev?.pe ? ((c.pe - prev.pe) / prev.pe * 100) : null;
  return { ...c, mReturnUsd, mReturnEur, idx: i };
});
const latest = data[data.length - 1] || {};
const first = data[0] || {};

// Group by year
const byYear = {};
data.forEach(d => {
  const y = d.d?.slice(0, 4);
  if (!y) return;
  if (!byYear[y]) byYear[y] = [];
  byYear[y].push(d);
});
const years = Object.keys(byYear).sort().reverse();

// Annual returns
const annualReturns = years.map(y => {
  const entries = byYear[y];
  const lastOfYear = entries[entries.length - 1];
  const prevYearEntries = byYear[String(parseInt(y, 10) - 1)];
  const lastOfPrevYear = prevYearEntries?.[prevYearEntries.length - 1];
  const ytdUsd = lastOfPrevYear?.pu ? ((lastOfYear.pu - lastOfPrevYear.pu) / lastOfPrevYear.pu * 100) : null;
  const ytdEur = lastOfPrevYear?.pe ? ((lastOfYear.pe - lastOfPrevYear.pe) / lastOfPrevYear.pe * 100) : null;
  return { y, ytdUsd, ytdEur, start: lastOfPrevYear?.pu, end: lastOfYear.pu, startEur: lastOfPrevYear?.pe, endEur: lastOfYear.pe, entries };
});

// CAGR
const totalYears = data.length > 1 ? ((new Date(latest.d) - new Date(first.d)) / (365.25 * 24 * 3600 * 1000)) : 1;
const cagrUsd = first.pu > 0 ? ((Math.pow(latest.pu / first.pu, 1 / totalYears) - 1) * 100) : 0;
const cagrEur = first.pe > 0 ? ((Math.pow(latest.pe / first.pe, 1 / totalYears) - 1) * 100) : 0;
const totalReturnUsd = first.pu ? ((latest.pu - first.pu) / first.pu * 100) : 0;
const totalReturnEur = first.pe ? ((latest.pe - first.pe) / first.pe * 100) : 0;

// Max drawdown (USD)
let peak = 0, maxDD = 0, ddEnd = "";
data.forEach(d => {
  if (d.pu > peak) peak = d.pu;
  const dd = peak > 0 ? ((d.pu - peak) / peak * 100) : 0;
  if (dd < maxDD) { maxDD = dd; ddEnd = d.d; }
});

// Chart data
const maxPu = Math.max(...data.map(d => d.pu || 0));

// Best and worst months
const monthlyReturns = data.filter(d => d.mReturnUsd != null);
const bestMonth = monthlyReturns.reduce((b, d) => (d.mReturnUsd > (b?.mReturnUsd || -Infinity)) ? d : b, null);
const worstMonth = monthlyReturns.reduce((w, d) => (d.mReturnUsd < (w?.mReturnUsd || Infinity)) ? d : w, null);
const avgMonthReturn = monthlyReturns.length > 0 ? monthlyReturns.reduce((s, d) => s + d.mReturnUsd, 0) / monthlyReturns.length : 0;
const positiveMonths = monthlyReturns.filter(d => d.mReturnUsd > 0).length;
const winRate = monthlyReturns.length > 0 ? (positiveMonths / monthlyReturns.length * 100) : 0;

const retCol = (v) => v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--text-secondary)";
const retFmt = (v) => v == null ? "—" : `${v >= 0 ? "+" : ""}${_sf(v,1)}%`;

// Last month delta
const prevEntry = data.length >= 2 ? data[data.length - 2] : null;
const monthDeltaUsd = prevEntry ? (latest.pu - prevEntry.pu) : 0;
const monthDeltaPct = prevEntry?.pu ? ((latest.pu - prevEntry.pu) / prevEntry.pu * 100) : 0;

// Mini sparkline points (last 12 data points)
const spark = data.slice(-12);
const sparkMin = Math.min(...spark.map(d=>d.pu||0));
const sparkMax = Math.max(...spark.map(d=>d.pu||0));
const sparkRange = sparkMax - sparkMin || 1;
const sparkW = 120, sparkH = 32;
const sparkPath = spark.map((d,i) => {
  const x = spark.length > 1 ? (i / (spark.length-1)) * sparkW : sparkW/2;
  const y = sparkRange > 0 ? sparkH - ((d.pu - sparkMin) / sparkRange) * sparkH : sparkH/2;
  return `${i===0?"M":"L"}${_sf(x,1)},${_sf(y,1)}`;
}).join(" ");

if (data.length === 0) {
  return <SnapshotsSection />;
}

return (
<div style={{display:"flex",flexDirection:"column",gap:10}}>
  {/* Section toggle */}
  <div style={{display:"flex",gap:4}}>
    {[{id:"historial",lbl:"📊 Historial"},{id:"proyeccion",lbl:"🔭 Proyección"},{id:"snapshots",lbl:"📋 Snapshots"}].map(t=>(
      <button key={t.id} onClick={()=>setSection(t.id)} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${section===t.id?"var(--gold)":"var(--border)"}`,background:section===t.id?"var(--gold-dim)":"transparent",color:section===t.id?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:section===t.id?700:500,cursor:"pointer",fontFamily:"var(--fb)"}}>{t.lbl}</button>
    ))}
  </div>

  {section === "snapshots" && <SnapshotsSection />}
  {section === "proyeccion" && <ProyeccionSection CTRL_DATA={CTRL_DATA} INCOME_DATA={INCOME_DATA} DIV_BY_YEAR={DIV_BY_YEAR} GASTOS_MONTH={GASTOS_MONTH} fxRates={fxRates} />}
  {section === "historial" && <>
  {/* Hero KPI — Patrimonio */}
  <div style={{background:"linear-gradient(135deg, rgba(201,169,80,.06), rgba(201,169,80,.02))",border:"1px solid rgba(201,169,80,.2)",borderRadius:16,padding:"18px 22px",display:"flex",flexDirection:"column",gap:12}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
      <div>
        <div style={{fontSize:10,color:"var(--gold)",fontFamily:"var(--fm)",letterSpacing:1.5,fontWeight:700,marginBottom:8,opacity:.7}}>PATRIMONIO NETO</div>
        <div style={{fontSize:42,fontWeight:800,fontFamily:"var(--fm)",color:"var(--text-primary)",lineHeight:1,letterSpacing:-1}}>${(latest.pu||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
        <div style={{fontSize:18,fontWeight:500,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:4}}>€{(latest.pe||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
        <div style={{padding:"6px 14px",borderRadius:10,background:monthDeltaPct>=0?"rgba(48,209,88,.1)":"rgba(255,69,58,.1)",border:`1px solid ${monthDeltaPct>=0?"rgba(48,209,88,.2)":"rgba(255,69,58,.2)"}`}}>
          <span style={{fontSize:16,fontWeight:700,color:retCol(monthDeltaPct),fontFamily:"var(--fm)"}}>{monthDeltaPct>=0?"▲":"▼"} {retFmt(monthDeltaPct)}</span>
          <span style={{fontSize:11,color:retCol(monthDeltaPct),fontFamily:"var(--fm)",marginLeft:6,opacity:.7}}>({monthDeltaUsd>=0?"+":"−"}${fDol(Math.abs(monthDeltaUsd))})</span>
        </div>
        {spark.length > 2 && <div style={{opacity:.7}}>
          <svg width={sparkW+20} height={sparkH+8} viewBox={`-2 -2 ${sparkW+4} ${sparkH+4}`} style={{overflow:"visible"}}>
            <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--gold)" stopOpacity=".25"/><stop offset="100%" stopColor="var(--gold)" stopOpacity="0"/></linearGradient></defs>
            <path d={sparkPath + ` L${sparkW},${sparkH} L0,${sparkH} Z`} fill="url(#sparkGrad)"/>
            <path d={sparkPath} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx={sparkW} cy={sparkH - ((spark[spark.length-1].pu - sparkMin) / sparkRange) * sparkH} r="3" fill="var(--gold)"/>
          </svg>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center",marginTop:1}}>Últimos 12m</div>
        </div>}
      </div>
    </div>
    {latest.br > 0 && (() => {
      const total = (latest.pu || 1);
      const brokerPct = ((latest.br || 0) / total * 100);
      const bankPct = ((latest.bk || 0) * (latest.fx || 1.08) / total * 100);
      const otherPct = Math.max(0, 100 - brokerPct - bankPct);
      return <div style={{marginTop:4}}>
        <div style={{display:"flex",height:8,borderRadius:6,overflow:"hidden",background:"var(--subtle-bg)"}}>
          <div style={{width:`${brokerPct}%`,background:"var(--gold)",transition:"width .5s"}}/>
          <div style={{width:`${bankPct}%`,background:"#64d2ff",transition:"width .5s"}}/>
          {otherPct > 1 && <div style={{width:`${otherPct}%`,background:"var(--border-hover)"}}/>}
        </div>
        <div style={{display:"flex",gap:16,marginTop:6,fontSize:10,fontFamily:"var(--fm)"}}>
          <span style={{color:"var(--gold)"}}>● Brokers ${fDol(latest.br||0)} ({_sf(brokerPct,0)}%)</span>
          <span style={{color:"#64d2ff"}}>● Bancos €{fDol(latest.bk||0)} ({_sf(bankPct,0)}%)</span>
        </div>
      </div>;
    })()}
    <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.6}}>Último snapshot: {latest.d || "—"} · FX: €1 = ${latest.fx?.toFixed(2) || "—"}</div>
  </div>
  {/* Secondary KPI row */}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:10}}>
    {[
      {label:"RETORNO TOTAL",value:retFmt(totalReturnUsd),sub:`EUR ${retFmt(totalReturnEur)}`,color:retCol(totalReturnUsd)},
      {label:`CAGR (${_sf(totalYears,1)}a)`,value:retFmt(cagrUsd),sub:`EUR ${retFmt(cagrEur)}`,color:retCol(cagrUsd)},
      {label:"MAX DRAWDOWN",value:`${_sf(maxDD,1)}%`,sub:ddEnd?`Valle: ${ddEnd}`:"—",color:"var(--red)"},
      {label:"WIN RATE",value:`${_sf(winRate,0)}%`,sub:`${positiveMonths}/${monthlyReturns.length} meses +`,color:winRate>=50?"var(--green)":"var(--red)"},
      {label:"MEJOR MES",value:bestMonth?retFmt(bestMonth.mReturnUsd):"—",sub:bestMonth?.d||"—",color:"var(--green)"},
      {label:"PEOR MES",value:worstMonth?retFmt(worstMonth.mReturnUsd):"—",sub:worstMonth?.d||"—",color:"var(--red)"},
    ].map((k,i) => (
      <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 16px"}}>
        <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.8,fontWeight:600,marginBottom:6}}>{k.label}</div>
        <div style={{fontSize:20,fontWeight:700,fontFamily:"var(--fm)",color:k.color,lineHeight:1.1}}>{k.value}</div>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:3}}>{k.sub}</div>
      </div>
    ))}
  </div>

  {/* Patrimony Evolution Chart */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>📈 Evolución Patrimonio (USD)</div>
      <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{data.length} meses · {first.d?.slice(0,4)}–{latest.d?.slice(0,4)}</div>
    </div>
    {(() => {
      const chartH = 220;
      const yMax = Math.ceil(maxPu / 200000) * 200000;
      const ySteps = [];
      for (let v = 0; v <= yMax; v += yMax <= 1000000 ? 200000 : 500000) ySteps.push(v);
      if (ySteps[ySteps.length-1] < maxPu) ySteps.push(ySteps[ySteps.length-1] + (yMax <= 1000000 ? 200000 : 500000));
      const yTop = ySteps[ySteps.length-1] || 1;
      const yearChanges = new Set();
      data.forEach((d,i) => { if(i > 0 && d.d?.slice(0,4) !== data[i-1].d?.slice(0,4)) yearChanges.add(i); });
      const labelBars = new Set([0, data.length-1]);
      data.forEach((d,i) => { if(yearChanges.has(i)) labelBars.add(i); });
      return (
        <div style={{display:"flex",gap:0}}>
          <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",height:chartH,paddingRight:8,flexShrink:0}}>
            {[...ySteps].reverse().map(v => (
              <div key={v} style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right",width:40,lineHeight:"1"}}>{v >= 1e6 ? `$${_sf(v/1e6,1)}M` : `$${_sf(v/1e3,0)}K`}</div>
            ))}
          </div>
          <div style={{flex:1,position:"relative"}}>
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"space-between",pointerEvents:"none"}}>
              {ySteps.map(v => <div key={v} style={{borderBottom:"1px solid var(--subtle-border)",width:"100%"}}/>)}
            </div>
            <div style={{display:"flex",alignItems:"flex-end",gap:1,height:chartH,position:"relative"}}>
              {data.map((d, i) => {
                const h = yTop > 0 ? (d.pu / yTop * 100) : 0;
                const isLast = i === data.length - 1;
                const isYearStart = yearChanges.has(i);
                const showLabel = labelBars.has(i);
                const barColor = isLast ? "var(--gold)" : "rgba(201,169,80,0.5)";
                return (
                  <div key={d.d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%",borderLeft:isYearStart?"1px solid var(--border-hover)":"none",position:"relative",cursor:"pointer"}}
                    onMouseEnter={()=>setHoveredBar(i)} onMouseLeave={()=>setHoveredBar(null)}>
                    {hoveredBar===i && (
                      <div style={{position:"absolute",bottom:`${Math.max(h,10)+5}%`,left:"50%",transform:"translateX(-50%)",background:"#1c1c1e",border:"1px solid var(--gold)",borderRadius:8,padding:"6px 10px",zIndex:10,whiteSpace:"nowrap",boxShadow:"0 4px 12px rgba(0,0,0,.5)",fontSize:10,fontFamily:"var(--fm)"}}>
                        <div style={{fontWeight:700,color:"var(--gold)",marginBottom:2}}>{d.d}</div>
                        <div style={{color:"var(--text-primary)"}}>{privacyMode?"•••":`$${(d.pu||0).toLocaleString()}`}</div>
                        <div style={{color:"var(--text-tertiary)"}}>{privacyMode?"•••":`€${(d.pe||0).toLocaleString()}`}</div>
                        {d.mReturnUsd!=null && <div style={{color:d.mReturnUsd>=0?"var(--green)":"var(--red)",fontWeight:600}}>Mes: {retFmt(d.mReturnUsd)}</div>}
                      </div>
                    )}
                    {showLabel && <div style={{fontSize:8,fontWeight:600,color:isLast?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:2,whiteSpace:"nowrap"}}>{d.pu>=1e6?`$${_sf(d.pu/1e6,2)}M`:`$${_sf(d.pu/1e3,0)}K`}</div>}
                    <div style={{width:"100%",maxWidth:16,height:`${Math.max(h,2)}%`,background:hoveredBar===i?"var(--gold)":barColor,borderRadius:"2px 2px 0 0",transition:"all .15s"}}/>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:1,marginTop:4}}>
              {data.map((d,i) => {
                const isYearStart = yearChanges.has(i);
                const isFirst = i === 0;
                const isLast = i === data.length - 1;
                return (
                  <div key={d.d} style={{flex:1,textAlign:"center"}}>
                    {(isFirst || isYearStart || isLast) && <div style={{fontSize:8,color:isLast?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:isLast?600:400,whiteSpace:"nowrap",overflow:"hidden"}}>{d.d?.slice(0,7)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    })()}
  </div>

  {/* Monthly Returns heatmap — Year × Month grid */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>📊 Rentabilidad Mensual (%)</div>
      <div style={{display:"flex",gap:8,fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
        <span>Mejor: <span style={{color:"var(--green)",fontWeight:600}}>{retFmt(bestMonth?.mReturnUsd)} ({bestMonth?.d})</span></span>
        <span>·</span>
        <span>Peor: <span style={{color:"var(--red)",fontWeight:600}}>{retFmt(worstMonth?.mReturnUsd)} ({worstMonth?.d})</span></span>
        <span>·</span>
        <span>Media: <span style={{color:retCol(avgMonthReturn),fontWeight:600}}>{retFmt(avgMonthReturn)}</span></span>
      </div>
    </div>
    {(() => {
      const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      // Build lookup: { "2022": { "01": value, ... }, ... }
      const grid = {};
      monthlyReturns.forEach(d => {
        const y = d.d?.slice(0,4);
        const m = d.d?.slice(5,7);
        if (!y || !m) return;
        if (!grid[y]) grid[y] = {};
        grid[y][m] = d.mReturnUsd;
      });
      const gridYears = Object.keys(grid).sort().reverse();
      // Annual YTD from annualReturns
      const ytdMap = {};
      annualReturns.forEach(a => { if (a.ytdUsd != null) ytdMap[a.y] = a.ytdUsd; });
      const thS = {padding:"5px 6px",fontSize:9,fontWeight:600,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center",borderBottom:"1px solid var(--border)"};
      return (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:680}}>
            <thead><tr>
              <th style={{...thS,textAlign:"left",width:48}}>AÑO</th>
              {MONTHS.map(m => <th key={m} style={thS}>{m}</th>)}
              <th style={{...thS,borderLeft:"2px solid var(--border)",width:60}}>YTD</th>
            </tr></thead>
            <tbody>
              {gridYears.map(y => (
                <tr key={y}>
                  <td style={{padding:"4px 6px",fontSize:11,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{y}</td>
                  {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => {
                    const v = grid[y]?.[m];
                    if (v == null) return <td key={m} style={{padding:"4px 2px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)"}}><span style={{fontSize:9,color:"var(--text-tertiary)",opacity:.3}}>—</span></td>;
                    const intensity = Math.min(Math.abs(v) / 12, 1);
                    const bg = v >= 0
                      ? `rgba(48,209,88,${0.08 + intensity * 0.5})`
                      : `rgba(255,69,58,${0.08 + intensity * 0.5})`;
                    return (
                      <td key={m} style={{padding:"3px 2px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)"}}>
                        <div title={`${y}-${m}: ${retFmt(v)}`} style={{borderRadius:5,background:bg,padding:"5px 2px",fontSize:10,fontWeight:700,color:v>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)",cursor:"default"}}>
                          {v>=0?"+":""}{_sf(v,1)}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{padding:"3px 4px",textAlign:"center",borderBottom:"1px solid var(--subtle-bg)",borderLeft:"2px solid var(--border)"}}>
                    {ytdMap[y] != null ? (
                      <div style={{borderRadius:5,background:ytdMap[y]>=0?"rgba(48,209,88,.12)":"rgba(255,69,58,.12)",padding:"5px 4px",fontSize:11,fontWeight:800,color:retCol(ytdMap[y]),fontFamily:"var(--fm)"}}>
                        {retFmt(ytdMap[y])}
                      </div>
                    ) : <span style={{fontSize:9,color:"var(--text-tertiary)",opacity:.3}}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    })()}
  </div>

  </>}
</div>
);
}
