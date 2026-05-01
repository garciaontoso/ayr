import { useState, useMemo } from 'react';
import { useCostBasis } from '../../context/CostBasisContext';
import { _sf } from '../../utils/formatters.js';
import { CURRENCIES } from '../../constants/index.js';

export default function CostBasisView() {
  const {
    positions, cbTicker, cbTransactions, cbShowForm, setCbShowForm,
    cbFormType, setCbFormType, cbForm, setCbForm, cbCalc,
    addTransaction, importTransactions, deleteTransaction, goHome, cbLoading,
  } = useCostBasis();

  // Sort state — click on a column header to sort. Supports date, type,
  // cost, optCredit and divTotal. Default is date descending (newest first).
  const [sortCol, setSortCol] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);
  const toggleSort = (col) => {
    if (sortCol === col) setSortAsc(v => !v);
    else { setSortCol(col); setSortAsc(col === 'type'); /* type asc by default */ }
  };

  const pos = positions[cbTicker] || {};
  // Sorted view of transactions — the acumulative fields (_balance, _totalShares,
  // _adjustedBasis) are precomputed assuming chronological order, so when the
  // user sorts by anything else those columns are still the value AT THE TIME
  // of that transaction (row-intrinsic), which stays correct.
  const txns = useMemo(() => {
    const arr = [...(cbTransactions || [])];
    const getter = {
      date:      (t) => t.date || '',
      type:      (t) => t.type || '',
      cost:      (t) => Number(t.cost) || 0,
      optCredit: (t) => Number(t.optCreditTotal || t.optCredit || 0),
      divTotal:  (t) => Number(t.divTotal || 0),
      total:     (t) => Number(t.cost || 0) + Number(t.optCreditTotal || 0) + Number(t.divTotal || 0),
    }[sortCol] || ((t) => t.date || '');
    arr.sort((a, b) => {
      const va = getter(a), vb = getter(b);
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [cbTransactions, sortCol, sortAsc]);
  const ccy = pos.currency || "USD";
  const sym = CURRENCIES[ccy]?.symbol || "$";
  const showForm = cbShowForm;
  const setShowForm = setCbShowForm;
  const formType = cbFormType;
  const setFormType = setCbFormType;
  const form = cbForm;
  const upForm = (k,v) => setCbForm(p=>({...p,[k]:v}));

  const calc = cbCalc;

  const handleSubmit = () => {
    const txn = {type: formType, date: form.date || new Date().toISOString().slice(0,10)};
    if(formType === "buy" || formType === "sell") { txn.shares = form.shares; txn.price = form.price; txn.fees = form.fees; }
    if(formType === "dividend") { txn.dps = form.dps; txn.shares = form.shares || calc.totalShares; }
    if(formType === "option") { txn.optType = form.optType; txn.optExpiry = form.optExpiry; txn.optStrike = form.optStrike; txn.optContracts = form.optContracts; txn.optCredit = form.optCredit; txn.optStatus = form.optStatus; txn.fees = form.fees; }
    if(formType === "fee") { txn.fees = form.fees; txn.note = form.note; }
    addTransaction(txn);
    setCbForm({date:"",shares:0,price:0,fees:0,dps:0,optType:"sell_put",optExpiry:"",optStrike:0,optContracts:0,optCredit:0,optStatus:"expired",note:""});
    setCbShowForm(false);
  };

  const typeColors = {buy:"#30d158",sell:"#ff453a",dividend:"#c8a44e",option:"#64d2ff",fee:"#ff9f0a"};
  const typeLabels = {buy:"COMPRA",sell:"VENTA",dividend:"DIVIDENDO",option:"OPCION",fee:"COMISION"};
  const optLabels = {sell_put:"Sell Put",sell_call:"Covered Call",buy_call:"Buy Call",buy_put:"Buy Put"};
  const statusLabels = {expired:"Expirada",assigned:"Asignada",closed:"Cerrada",open:"Abierta"};

  return (
    <div style={{maxWidth:1400,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24}}>
        <button onClick={goHome} style={{padding:"8px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:13,cursor:"pointer",fontFamily:"var(--fm)",fontWeight:600}}>{"\u2190"} Portfolio</button>
        <div style={{width:50,height:50,borderRadius:14,background:"linear-gradient(135deg,#c8a44e,#8B6914)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:cbTicker?.length>3?10:14,fontWeight:800,color:"#000",fontFamily:"var(--fm)"}}>{(cbTicker||"?").slice(0,4)}</div>
        <div>
          <div style={{fontSize:24,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>{pos.name || cbTicker}</div>
          <div style={{fontSize:12,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{cbTicker} {"\u00B7"} {ccy} {"\u00B7"} Cost Basis Tracker</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={()=>setShowForm(!showForm)} style={{padding:"8px 18px",borderRadius:10,border:"1px solid var(--gold)",background:showForm?"var(--gold-dim)":"transparent",color:"var(--gold)",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>+ Transacci\u00F3n</button>
          <label style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(100,210,255,.25)",background:"rgba(100,210,255,.06)",color:"#64d2ff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
            {"\u2191"} Importar
            <input type="file" accept=".json,.csv" style={{display:"none"}} onChange={e=>{
              const file = e.target.files[0]; if(!file) return;
              const reader = new FileReader();
              reader.onload = ev => { importTransactions(ev.target.result); };
              reader.readAsText(file);
            }}/>
          </label>
          <button onClick={()=>{
            const data = JSON.stringify(cbTransactions, null, 2);
            const blob = new Blob([data],{type:"application/json"});
            const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=`${cbTicker}_costbasis.json`; a.click(); URL.revokeObjectURL(url);
          }} style={{padding:"8px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:13,cursor:"pointer",fontFamily:"var(--fm)"}}>{"\u2193"} Exportar</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:12,marginBottom:20}}>
        {[
          {l:"PRECIO ACTUAL",v:`${sym}${_sf(calc.currentPrice,2)}`,c:"var(--text-primary)"},
          {l:"AVG PRICE",v:`${sym}${_sf(calc.avgCost,2)}`,c:"var(--text-secondary)",sub:`P&L: ${calc.pnlVsAvg>=0?"+":""}${_sf(calc.pnlVsAvg*100,1)}%`,sc:calc.pnlVsAvg>=0?"var(--green)":"var(--red)"},
          {l:"ADJUSTED BASIS",v:`${sym}${_sf(calc.adjustedBasis,2)}`,c:"var(--gold)",sub:`P&L: ${calc.pnlVsBasis>=0?"+":""}${_sf(calc.pnlVsBasis*100,1)}%`,sc:calc.pnlVsBasis>=0?"var(--green)":"var(--red)"},
          {l:"DIVIDENDOS",v:`${sym}${_sf(calc.totalDivs,0)}`,c:"#30d158",sub:calc.divYield>0?`Yield/Basis: ${_sf(calc.divYield*100,1)}%`:null},
          {l:"OPTIONS CREDIT",v:`${sym}${_sf(calc.totalOptCredit,0)}`,c:"#64d2ff"},
          {l:"ACCIONES",v:(calc.totalShares||0).toLocaleString(),c:"var(--text-primary)",sub:`Fees: ${sym}${_sf(calc.totalFees,0)}`},
        ].map((m,i)=>(
          <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:18,padding:"16px 18px"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.6}}>{m.l}</div>
            <div style={{fontSize:24,fontWeight:700,color:m.c,fontFamily:"var(--fm)",marginTop:4}}>{m.v}</div>
            {m.sub && <div style={{fontSize:11,color:m.sc||"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2,fontWeight:600}}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Add Transaction Form */}
      {showForm && (
        <div style={{background:"var(--card)",border:"1px solid var(--gold-dim)",borderRadius:18,padding:20,marginBottom:20}}>
          <div style={{fontSize:14,color:"var(--gold)",fontWeight:600,fontFamily:"var(--fd)",marginBottom:14}}>Nueva Transacci\u00F3n</div>
          {/* Type selector */}
          <div style={{display:"flex",gap:6,marginBottom:16}}>
            {["buy","sell","dividend","option","fee"].map(t=>(
              <button key={t} onClick={()=>setFormType(t)} style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${formType===t?typeColors[t]:"var(--border)"}`,background:formType===t?`${typeColors[t]}15`:"transparent",color:formType===t?typeColors[t]:"var(--text-tertiary)",fontSize:12,fontWeight:formType===t?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>{typeLabels[t]}</button>
            ))}
          </div>
          {/* Fields */}
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>FECHA</label>
              <input type="date" value={form.date} onChange={e=>upForm("date",e.target.value)} style={{padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
            {(formType==="buy"||formType==="sell") && <>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>ACCIONES</label>
                <input type="number" value={form.shares||""} onChange={e=>upForm("shares",parseFloat(e.target.value)||0)} placeholder="100" style={{width:90,padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>PRECIO</label>
                <input type="number" step="0.01" value={form.price||""} onChange={e=>upForm("price",parseFloat(e.target.value)||0)} placeholder="50.00" style={{width:100,padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
            </>}
            {formType==="dividend" && <>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>DIV/ACCI\u00D3N</label>
                <input type="number" step="0.01" value={form.dps||""} onChange={e=>upForm("dps",parseFloat(e.target.value)||0)} placeholder="0.50" style={{width:100,padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>ACCIONES (opt.)</label>
                <input type="number" value={form.shares||""} onChange={e=>upForm("shares",parseFloat(e.target.value)||0)} placeholder={String(calc.totalShares)} style={{width:90,padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
            </>}
            {formType==="option" && <>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>TIPO</label>
                <select value={form.optType} onChange={e=>upForm("optType",e.target.value)} style={{padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none"}}>
                  {Object.entries(optLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select></div>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>STRIKE</label>
                <input type="number" step="0.5" value={form.optStrike||""} onChange={e=>upForm("optStrike",parseFloat(e.target.value)||0)} style={{width:80,padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>CONTRATOS</label>
                <input type="number" value={form.optContracts||""} onChange={e=>upForm("optContracts",parseFloat(e.target.value)||0)} style={{width:70,padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>CR\u00C9DITO/CONT.</label>
                <input type="number" step="0.01" value={form.optCredit||""} onChange={e=>upForm("optCredit",parseFloat(e.target.value)||0)} style={{width:90,padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>EXPIRY</label>
                <input type="date" value={form.optExpiry} onChange={e=>upForm("optExpiry",e.target.value)} style={{padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>
              <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>STATUS</label>
                <select value={form.optStatus} onChange={e=>upForm("optStatus",e.target.value)} style={{padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none"}}>
                  {Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select></div>
            </>}
            {(formType!=="dividend") && <div><label style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:4}}>FEES</label>
              <input type="number" step="0.01" value={form.fees||""} onChange={e=>upForm("fees",parseFloat(e.target.value)||0)} placeholder="0" style={{width:70,padding:"8px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/></div>}
            <button onClick={handleSubmit} style={{padding:"8px 24px",borderRadius:8,border:"none",background:"var(--gold)",color:"#000",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)",height:38}}>Guardar</button>
          </div>
        </div>
      )}

      {/* Transaction Log */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:18,overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:14,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>{"📋"} Transacciones {"\u00B7"} {txns.length}</span>
          <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Adjusted Basis = (Coste {"\u2212"} Divs {"\u2212"} Opciones) {"\u00F7"} Acciones</span>
        </div>
        {cbLoading ? (
          <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)"}}>Cargando...</div>
        ) : txns.length === 0 ? (
          <div style={{padding:60,textAlign:"center",color:"var(--text-tertiary)"}}>
            <div style={{fontSize:40,marginBottom:12}}>{"📋"}</div>
            <div style={{fontSize:14,marginBottom:12}}>Sin transacciones. A{"\u00F1"}ade una compra o importa el JSON exportado.</div>
            <div style={{fontSize:11,color:"var(--text-tertiary)"}}>Puedes importar el archivo costbasis_app.json con todas tus empresas a la vez.</div>
          </div>
        ) : (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12.5,minWidth:1200}}>
              <thead>
                <tr>
                  <th colSpan={7} style={{padding:"6px 10px",textAlign:"center",color:"var(--gold)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1,borderBottom:"2px solid var(--gold-dim)",background:"rgba(200,164,78,.04)"}}>TRADE / EQUITY</th>
                  <th colSpan={6} style={{padding:"6px 10px",textAlign:"center",color:"#64d2ff",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1,borderBottom:"2px solid rgba(100,210,255,.15)",background:"rgba(100,210,255,.03)"}}>OPTIONS</th>
                  <th colSpan={2} style={{padding:"6px 10px",textAlign:"center",color:"var(--green)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1,borderBottom:"2px solid rgba(48,209,88,.15)",background:"rgba(48,209,88,.03)"}}>DIVIDENDS</th>
                  <th colSpan={5} style={{padding:"6px 10px",textAlign:"center",color:"var(--orange)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:1,borderBottom:"2px solid rgba(255,159,10,.15)",background:"rgba(255,159,10,.03)"}}>ADJUSTED BASIS</th>
                  <th style={{borderBottom:"2px solid var(--border)",width:30}}/>
                </tr>
                <tr>
                  {[
                    {l:"ID",w:120},{l:"FECHA",w:90,sort:'date'},{l:"TIPO",w:80,sort:'type'},{l:"SHARES",w:65,r:1},{l:"PRICE",w:70,r:1},{l:"FEES",w:55,r:1},{l:"COST",w:75,r:1,sort:'cost'},
                    {l:"EXPIRY",w:85},{l:"TYPE",w:55},{l:"STATUS",w:70},{l:"CONTR.",w:50,r:1},{l:"STRIKE",w:60,r:1},{l:"CREDIT",w:65,r:1,sort:'optCredit'},
                    {l:"PER SH",w:65,r:1},{l:"TOTAL",w:70,r:1,sort:'divTotal'},
                    {l:"BALANCE",w:80,r:1},{l:"SHARES",w:60,r:1},{l:"BASIS",w:75,r:1},{l:"BASIS %",w:65,r:1},{l:"DIV Y%",w:60,r:1},
                    {l:"",w:30},
                  ].map((h,i)=>{
                    const active = h.sort && sortCol === h.sort;
                    const indicator = active ? (sortAsc ? ' ▲' : ' ▼') : '';
                    return (
                      <th key={i}
                        onClick={h.sort ? () => toggleSort(h.sort) : undefined}
                        title={h.sort ? `Ordenar por ${h.l}` : undefined}
                        style={{
                          padding:"7px 6px",
                          textAlign:h.r?"right":"left",
                          color:active?"var(--gold)":"var(--text-tertiary)",
                          fontSize:9,
                          fontWeight:active?700:600,
                          fontFamily:"var(--fm)",
                          letterSpacing:.4,
                          borderBottom:"1px solid var(--border)",
                          whiteSpace:"nowrap",
                          minWidth:h.w,
                          cursor:h.sort?"pointer":"default",
                          userSelect:h.sort?"none":"auto",
                        }}>
                        {h.l}{indicator}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {txns.map((t,i)=>{
                  const isBuy = t.type==="buy";
                  const isSell = t.type==="sell";
                  const isDiv = t.type==="dividend";
                  const isOpt = t.type==="option";
                  const rowBg = isDiv?"rgba(48,209,88,.02)":isOpt?"rgba(100,210,255,.02)":i%2?"var(--row-alt)":"transparent";
                  return (
                    <tr key={t.id||i} style={{background:rowBg}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                      <td style={{padding:"7px 6px",fontSize:9,color:t.execId?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)",letterSpacing:.2,opacity:.8}} title={t.execId?`exec_id IB: ${t.execId}\n(D1 row id: ${t.id||"—"})`:`Sin exec_id (legacy import). D1 row id: ${t.id||"—"}`}>{t.execId ? t.execId.split('/').pop().slice(-8) : (t.id ? `#${t.id}` : "—")}</td>
                      <td style={{padding:"7px 6px",fontSize:12,color:"var(--text-primary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{t.date||""}</td>
                      <td style={{padding:"7px 6px",borderBottom:"1px solid var(--subtle-bg)"}}>
                        <span style={{padding:"2px 8px",borderRadius:5,fontSize:9.5,fontWeight:700,fontFamily:"var(--fm)",color:typeColors[t.type]||"#fff",background:`${typeColors[t.type]||"#fff"}15`,letterSpacing:.2}}>{typeLabels[t.type]||t.type}</span>
                      </td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:(isBuy||isSell)?"var(--text-primary)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{(isBuy||isSell)&&t.shares?t.shares:""}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:"var(--text-primary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{(isBuy||isSell)&&t.price?_sf(t.price,2):""}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{t.fees?_sf(t.fees,1):""}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,fontWeight:600,color:t.cost&&t.cost<0?"var(--red)":t.cost>0?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{t.cost?Math.round(t.cost).toLocaleString():""}</td>
                      {/* Options */}
                      <td style={{padding:"7px 6px",fontSize:11,color:isOpt?"#64d2ff":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{isOpt?t.optExpiry:""}</td>
                      <td style={{padding:"7px 6px",fontSize:11,color:isOpt?"#64d2ff":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{isOpt?t.optType:""}</td>
                      <td style={{padding:"7px 6px",fontSize:10,fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>
                        {isOpt&&t.optStatus?<span style={{padding:"1px 6px",borderRadius:4,fontSize:9,fontWeight:600,
                          color:t.optStatus==="EXPIRED"||t.optStatus==="expired"?"var(--green)":t.optStatus==="ASSIGNED"||t.optStatus==="assigned"?"var(--red)":"#64d2ff",
                          background:t.optStatus==="EXPIRED"||t.optStatus==="expired"?"rgba(48,209,88,.1)":t.optStatus==="ASSIGNED"||t.optStatus==="assigned"?"rgba(255,69,58,.1)":"rgba(100,210,255,.08)"
                        }}>{t.optStatus}</span>:""}
                      </td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:isOpt?"#64d2ff":"",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{isOpt&&t.optContracts?t.optContracts:""}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:isOpt?"#64d2ff":"",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{isOpt&&t.optStrike?t.optStrike:""}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,fontWeight:600,color:isOpt?"#64d2ff":"",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{isOpt&&t.optCreditTotal?_sf(t.optCreditTotal,2):isOpt&&t.optCredit?_sf(t.optCredit,4):""}</td>
                      {/* Dividends */}
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:isDiv?"var(--gold)":"",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{isDiv&&t.dps?_sf(t.dps,4):""}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,fontWeight:600,color:isDiv?"var(--gold)":"",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{isDiv&&t.divTotal?_sf(t.divTotal,2):""}</td>
                      {/* Adjusted Basis */}
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:t._balance<0?"var(--red)":"var(--green)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{t._balance?Math.round(t._balance).toLocaleString():""}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:"var(--text-primary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{t._totalShares||""}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,fontWeight:600,color:"var(--orange)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{t._adjustedBasis?_sf(t._adjustedBasis,2):""}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:11,color:t._adjustedBasisPct>0?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{t._adjustedBasisPct?_sf(t._adjustedBasisPct*100,1)+"%":""}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:11,color:t._divYieldBasis>0?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>{t._divYieldBasis?_sf(t._divYieldBasis*100,2)+"%":""}</td>
                      <td style={{padding:"7px 4px",borderBottom:"1px solid var(--subtle-bg)"}}>
                        <button onClick={()=>deleteTransaction(t.id)} style={{width:22,height:22,borderRadius:5,border:"1px solid rgba(255,69,58,.15)",background:"transparent",color:"var(--red)",fontSize:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:.5}}>{"\u2715"}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
