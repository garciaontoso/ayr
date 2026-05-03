import { useState, useRef } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { _sf, n, fP, div } from '../../utils/formatters.js';
import { YEARS } from '../../constants/index.js';
import { getPref, setPref, removePref } from '../../utils/userPrefs.js';

// ── Section drag-and-drop order ─────────────────────────────────────────────
const DIV_SECTION_ORDER_KEY = 'ayr-section-order-dividends';
const DIV_DEFAULT_ORDER = ['hero', 'keyMetrics', 'ssdNotes', 'growth', 'payout', 'financials', 'payment'];
function loadDivSectionOrder() {
  try { const v = getPref(DIV_SECTION_ORDER_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

export default function DividendsTab() {
  // All state before render logic — TDZ safety
  const [sectionOrder, setSectionOrder] = useState(() => loadDivSectionOrder() || DIV_DEFAULT_ORDER);
  const [dragOver, setDragOver] = useState(null);
  const dragKey = useRef(null);
  const [showTip, setShowTip] = useState(() => {
    try { return !localStorage.getItem('ayr-reorder-tip-seen'); } catch { return false; }
  });

  const { DATA_YEARS, L, LD, advancedMetrics, cfg, comp, divAnalysis, fin, fmpExtra, ssd } = useAnalysis();
    const S = ssd;
    const da = divAnalysis;
    const divYield = cfg.price > 0 && LD.dps > 0 ? LD.dps / cfg.price : null;
    const pe = LD.eps > 0 ? cfg.price / LD.eps : null;
    const histYrs = [...DATA_YEARS].reverse(); // Only years with actual financial data, oldest first
    const safetyColor = S.safetyScore >= 80 ? "#30d158" : S.safetyScore >= 60 ? "#8BC34A" : S.safetyScore >= 40 ? "#ff9f0a" : "#ff453a";
    const safetyBg = S.safetyScore >= 80 ? "rgba(48,209,88,.08)" : S.safetyScore >= 60 ? "rgba(139,195,74,.08)" : S.safetyScore >= 40 ? "rgba(255,159,10,.08)" : "rgba(255,69,58,.08)";

    // Color helper — always returns hex for composability
    const cGreen = "#30d158", cRed = "#ff453a", cYellow = "#ffd60a", cGold = "#c8a44e", cBlue = "#64d2ff", cOrange = "#ff9f0a";

    const DivBar = ({data, colorFn, formatFn, height=90}) => {
      const vals = data.map(d=>d.v).filter(v=>v!=null&&!isNaN(v));
      const max = Math.max(...vals.map(Math.abs), 0.001);
      return (
        <div style={{display:"flex", alignItems:"flex-end", gap:3, height, padding:"0 4px"}}>
          {data.map((d,i) => {
            const v = d.v; const hasVal = v!=null&&!isNaN(v);
            const h = hasVal ? Math.max(Math.abs(v)/max*100, 4) : 4;
            const col = hasVal && colorFn ? colorFn(v,d.y,i) : "#333";
            const label = hasVal && formatFn ? formatFn(v) : "";
            return (
              <div key={i} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", height:"100%"}}>
                {label && <div style={{fontSize:7.5, color:"var(--text-secondary)", marginBottom:2, fontFamily:"var(--fm)", fontWeight:600, whiteSpace:"nowrap"}}>{label}</div>}
                <div style={{width:"100%", maxWidth:28, height:`${h}%`, background:col, opacity:0.75, borderRadius:"3px 3px 0 0", minHeight:3, transition:"height .5s"}}/>
                <div style={{fontSize:8, color:"var(--text-tertiary)", marginTop:3, fontFamily:"var(--fm)", fontWeight:500}}>'{String(d.y).slice(2)}</div>
              </div>
            );
          })}
        </div>
      );
    };

    // Div growth years array for calculations
    const growthYrs = YEARS.slice(0,12).filter(y => fin[y]?.dps > 0);
    const divCAGR3 = da.cagr3;
    const divCAGR5 = da.cagr5;
    const divCAGR10 = da.cagr10;

    // FCF coverage ratio
    const fcfCoverage = L.fcf > 0 && LD.dps > 0 && LD.sharesOut > 0 ? L.fcf / (LD.dps * LD.sharesOut) : null;

    // ── Drag handlers ──────────────────────────────────────────────────────
    const handleDivDragStart = (id, e) => {
      dragKey.current = id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', id); } catch {}
    };
    const handleDivDragOver = (id, e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragKey.current && dragKey.current !== id) setDragOver(id);
    };
    const handleDivDragLeave = (id) => { if (dragOver === id) setDragOver(null); };
    const handleDivDrop = (id, e) => {
      e.preventDefault();
      const src = dragKey.current || e.dataTransfer.getData('text/plain');
      if (!src || src === id) { dragKey.current = null; setDragOver(null); return; }
      const without = sectionOrder.filter(k => k !== src);
      const targetIdx = without.indexOf(id);
      const newOrder = [...without.slice(0, targetIdx), src, ...without.slice(targetIdx)];
      setSectionOrder(newOrder);
      setPref(DIV_SECTION_ORDER_KEY, JSON.stringify(newOrder));
      dragKey.current = null; setDragOver(null);
    };
    const handleDivDragEnd = () => { dragKey.current = null; setDragOver(null); };
    const handleDivContextMenu = (e) => {
      e.preventDefault();
      if (window.confirm('Restablecer orden de bloques al original?')) {
        setSectionOrder(DIV_DEFAULT_ORDER);
        removePref(DIV_SECTION_ORDER_KEY);
      }
    };

    // ── Section map ────────────────────────────────────────────────────────
    const DIV_SECTIONS = {
      hero: (
        <div>
          <div style={{marginBottom:12}}>
            <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>Análisis de Dividendos</h2>
            <p style={{margin:0,fontSize:12,color:"var(--text-secondary)"}}>Safety Score, historial de crecimiento, payout ratios y métricas clave para inversores de dividendos a largo plazo.</p>
          </div>
          <Card glow style={{borderColor:`${safetyColor}33`}}>
            <div style={{display:"grid",gridTemplateColumns:"120px 1fr 120px",gap:20,alignItems:"center"}}>
              <div style={{textAlign:"center"}}>
                <div style={{width:84,height:84,borderRadius:"50%",border:`4px solid ${safetyColor}`,display:"flex",alignItems:"center",justifyContent:"center",background:safetyBg,margin:"0 auto"}}>
                  <span style={{fontSize:34,fontWeight:900,color:safetyColor,fontFamily:"var(--fm)"}}>{S.safetyScore}</span>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:safetyColor,marginTop:8}}>{S.safetyLabel}</div>
                {S.safetyDate && <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:3}}>Upd. {S.safetyDate}</div>}
              </div>
              <div>
                {S.safetyNote && <div style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.7,marginBottom:12,padding:"10px 14px",background:"var(--row-alt)",borderRadius:8,borderLeft:`3px solid ${safetyColor}`}}>{S.safetyNote}</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))",gap:8}}>
                  {(() => {
                    const fwdEPS = fmpExtra.estimates?.[0]?.epsAvg || fmpExtra.estimates?.[0]?.estimatedEpsAvg;
                    const fwdPayout = fwdEPS > 0 && LD.dps > 0 ? LD.dps / fwdEPS : null;
                    return [
                    {l:"Payout Ratio",v:`${_sf(S.payoutRatio*100,0)}%`,c:S.payoutRatio<0.6?cGreen:S.payoutRatio<0.8?cYellow:cRed},
                    {l:"FCF Payout",v:fP(da.payoutFCF),c:da.payoutFCF&&da.payoutFCF<0.7?cGreen:cOrange},
                    {l:"Fwd Payout",v:fwdPayout!=null?_sf(fwdPayout*100,0)+"%":"—",c:fwdPayout!=null?(fwdPayout<0.6?cGreen:fwdPayout<0.75?cYellow:cRed):"var(--text-tertiary)"},
                    {l:"Deuda/EBITDA",v:(S.ndEbitda!=null?_sf(S.ndEbitda,1)+"x":"—"),c:S.ndEbitda<3?cGreen:S.ndEbitda<5?cYellow:cRed},
                    {l:"FCF Coverage",v:fcfCoverage?_sf(fcfCoverage,1)+"x":"—",c:fcfCoverage&&fcfCoverage>2?cGreen:fcfCoverage&&fcfCoverage>1.5?cYellow:cRed},
                  ]})().map((x,i)=>(
                    <div key={i} style={{padding:"10px 8px",borderRadius:8,background:"var(--subtle-bg)",textAlign:"center",border:"1px solid var(--subtle-border)"}}>
                      <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>{x.l}</div>
                      <div style={{fontSize:18,fontWeight:700,color:x.c,fontFamily:"var(--fm)"}}>{x.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:1}}>YIELD</div>
                <div style={{fontSize:38,fontWeight:800,color:cGold,fontFamily:"var(--fm)",lineHeight:1,marginTop:4}}>{fP(divYield)}</div>
                <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:6}}>${LD.dps?.toFixed(2)||"—"}/acción</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:3}}>{S.frequency}</div>
                <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{S.taxation}</div>
              </div>
            </div>
          </Card>
        </div>
      ),

      keyMetrics: (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
          {[
            {l:"Racha Crecim.",v:`${S.growthStreak} años`,c:S.growthStreak>=10?cGreen:S.growthStreak>=5?cYellow:cRed},
            {l:"Sin Interrupción",v:`${S.uninterruptedStreak} años`,c:S.uninterruptedStreak>=10?cGreen:S.uninterruptedStreak>=5?cYellow:cRed},
            {l:"Dividendo Desde",v:advancedMetrics.continuousDivSince||"—",c:advancedMetrics.continuousDivSince&&advancedMetrics.continuousDivSince<2010?cGreen:cYellow},
            {l:"Credit Rating",v:S.creditRating,c:S.creditRating?.startsWith("A")?cGreen:S.creditRating?.startsWith("BBB")?cYellow:cRed},
            {l:"P/E Ratio",v:pe?_sf(pe,1)+"x":"—",c:pe&&pe<(S.sectorPE||20)?cGreen:pe&&pe<25?cYellow:cOrange},
            {l:"Recesión 07-09",v:S.recessionDivAction,c:S.recessionDivAction==="Increased"?cGreen:cRed},
            {l:"Cobertura Int.",v:LD.interestExpense>0&&LD.operatingIncome>0?_sf(LD.operatingIncome/LD.interestExpense,1)+"x":"—",c:LD.interestExpense>0&&LD.operatingIncome>0?(LD.operatingIncome/LD.interestExpense>8?cGreen:LD.operatingIncome/LD.interestExpense>3?cYellow:cRed):"var(--text-tertiary)"},
            {l:"Buyback",v:advancedMetrics.buybackCAGR!=null?`${advancedMetrics.buybackCAGR>0?"+":""}${_sf(advancedMetrics.buybackCAGR*100,1)}%/yr`:"—",c:advancedMetrics.buybackCAGR<-0.01?cGreen:advancedMetrics.buybackCAGR>0.01?cRed:cGold},
          ].map((x,i)=>(
            <Card key={i} style={{textAlign:"center",padding:"12px 6px"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:.3,marginBottom:6}}>{x.l}</div>
              <div style={{fontSize:17,fontWeight:700,color:x.c,fontFamily:"var(--fm)"}}>{x.v}</div>
            </Card>
          ))}
        </div>
      ),

      ssdNotes: S.notes?.length > 0 ? (
        <Card title="Notas de Análisis" icon="📝">
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {S.notes.map((note,i) => {
              const nc = note.score>=80?cGreen:note.score>=60?"#8BC34A":cOrange;
              return (
                <div key={i} style={{display:"flex",gap:14,padding:"12px 14px",background:"var(--row-alt)",borderRadius:10,border:"1px solid var(--subtle-border)"}}>
                  <div style={{width:42,height:42,borderRadius:"50%",border:`2.5px solid ${nc}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:16,fontWeight:800,color:nc,fontFamily:"var(--fm)"}}>{note.score}</span>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,color:"var(--text-primary)"}}>{note.title}</div>
                    <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:2}}>{note.type} · {note.date}</div>
                    <div style={{fontSize:10.5,color:"var(--text-secondary)",marginTop:4,lineHeight:1.6}}>{note.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null,

      growth: (
        <Card title="Crecimiento del Dividendo" icon="📈">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:12,marginBottom:16}}>
            {[
              {l:"Últimos 12 Meses",v:S.growthLast12m},
              {l:"CAGR 3 Años",v:divCAGR3,sub:"anualizado"},
              {l:"CAGR 5 Años",v:S.growthLast5y||divCAGR5,sub:"anualizado"},
              {l:"CAGR 10 Años",v:S.growthLast10y||divCAGR10,sub:"anualizado"},
            ].map((x,i)=>(
              <div key={i} style={{textAlign:"center",padding:"14px",background:"var(--row-alt)",borderRadius:10,border:"1px solid var(--subtle-border)"}}>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:.5}}>{x.l}</div>
                <div style={{fontSize:28,fontWeight:800,color:x.v!=null&&x.v!==0?(x.v>=0?cGreen:cRed):"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:6}}>{x.v!=null&&x.v!==0?`${_sf(x.v*100,1)}%`:"—"}</div>
                {x.sub && <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:2}}>{x.sub}</div>}
              </div>
            ))}
          </div>
          <div style={{fontSize:12,fontWeight:600,color:"var(--text-secondary)",marginBottom:10}}>Dividendo por Acción — Histórico</div>
          <DivBar data={histYrs.filter(y=>fin[y]?.dps>0).map(y=>({y,v:fin[y]?.dps||0}))} formatFn={v=>`$${_sf(v,2)}`}
            colorFn={(v,y,i)=>{const prev=i>0?(fin[histYrs.filter(yr=>fin[yr]?.dps>0)[i-1]]?.dps||0):v;return v>prev?cGreen:v<prev?cRed:cGold;}} height={110}/>
          {(() => {
            const dpsYears = histYrs.filter(y => fin[y]?.dps > 0);
            const yoyData = [];
            for (let i = 1; i < dpsYears.length; i++) {
              const prev = fin[dpsYears[i-1]]?.dps || 0;
              const cur = fin[dpsYears[i]]?.dps || 0;
              if (prev > 0) yoyData.push({ y: dpsYears[i], v: ((cur - prev) / prev) * 100 });
            }
            if (yoyData.length < 2) return null;
            return (<>
              <div style={{fontSize:12,fontWeight:600,color:"var(--text-secondary)",marginBottom:10,marginTop:16}}>Tasa de Crecimiento YoY (%)</div>
              <DivBar data={yoyData} formatFn={v=>`${v>=0?"+":""}${_sf(v,1)}%`}
                colorFn={v=>v>5?cGreen:v>0?cGold:cRed} height={90}/>
            </>);
          })()}
        </Card>
      ),

      payout: (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Card title="Earnings Payout Ratio" icon="📊">
            <div style={{fontSize:10,color:"var(--text-tertiary)",marginBottom:10,lineHeight:1.5}}>% del EPS destinado a dividendo. Por debajo del 70% es preferible para sostenibilidad.</div>
            <DivBar data={histYrs.map(y=>({y, v:fin[y]?.eps>0&&fin[y]?.dps>0?fin[y].dps/fin[y].eps*100:null}))}
              colorFn={v=>v&&v<70?cGreen:v&&v<85?cOrange:cRed} formatFn={v=>`${_sf(v,0)}%`}/>
          </Card>
          <Card title="FCF Payout Ratio" icon="📊">
            <div style={{fontSize:10,color:"var(--text-tertiary)",marginBottom:10,lineHeight:1.5}}>% del Free Cash Flow destinado a dividendo. La métrica más fiable de cobertura.</div>
            <DivBar data={histYrs.map(y=>({y, v:comp[y]?.fcfps>0&&fin[y]?.dps>0?fin[y].dps/comp[y].fcfps*100:null}))}
              colorFn={v=>v&&v<70?cGreen:v&&v<85?cOrange:cRed} formatFn={v=>`${_sf(v,0)}%`}/>
          </Card>
        </div>
      ),

      financials: (
        <Card title="Métricas Financieras Clave" icon="📉">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
            {[
              {t:"EPS",d:"Beneficio por acción. Motor del crecimiento del dividendo.",
                data:histYrs.map(y=>({y,v:fin[y]?.eps})), cf:v=>v>0?cBlue:cRed, ff:v=>`$${_sf(v,2)}`},
              {t:"FCF/Share",d:"Cash flow libre por acción. La fuente real del dividendo.",
                data:histYrs.map(y=>({y,v:comp[y]?.fcfps})), cf:v=>v>0?cGreen:cRed, ff:v=>`$${_sf(v,2)}`},
              {t:"Ventas ($B)",d:"Base de ingresos. Creciente = sostenibilidad del dividendo.",
                data:histYrs.map(y=>({y,v:fin[y]?.revenue?fin[y].revenue/1000:null})), cf:()=>cBlue, ff:v=>`${_sf(v,1)}`},
              {t:"ROE (%)",d:"Rentabilidad sobre patrimonio. >15% indica ventaja competitiva.",
                data:histYrs.map(y=>({y,v:comp[y]?.roe!=null?comp[y].roe*100:null})), cf:v=>v>15?cGreen:v>10?cOrange:cRed, ff:v=>`${_sf(v,0)}%`},
              {t:"Acciones (M)",d:"Recompras reducen acciones y aumentan el dividendo por acción.",
                data:histYrs.map(y=>({y,v:fin[y]?.sharesOut})), cf:(v,y,i)=>i>0&&histYrs[i-1]&&v<(fin[histYrs[i-1]]?.sharesOut||Infinity)?cGreen:cBlue, ff:v=>`${_sf(v,0)}`},
              {t:"Deuda Neta/EBITDA",d:"Años de EBITDA para saldar deuda. <3x preferido para seguridad.",
                data:histYrs.map(y=>({y,v:comp[y]?.ebitda>0?comp[y].netDebt/comp[y].ebitda:null})), cf:v=>v&&v<3?cGreen:v&&v<4?cOrange:cRed, ff:v=>`${_sf(v,1)}x`},
            ].map((ch,i)=>(
              <div key={i} style={{padding:"12px",background:"var(--row-alt)",borderRadius:10,border:"1px solid var(--subtle-border)"}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text-primary)",marginBottom:3}}>{ch.t}</div>
                <div style={{fontSize:9.5,color:"var(--text-tertiary)",lineHeight:1.5,marginBottom:8}}>{ch.d}</div>
                <DivBar data={ch.data} colorFn={ch.cf} formatFn={ch.ff} height={80}/>
              </div>
            ))}
          </div>
        </Card>
      ),

      payment: (
        <Card title="Detalles del Pago" icon="📅">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:10}}>
            {[
              {l:"Frecuencia",v:S.frequency,s:S.freqMonths},
              {l:"Pago Anual",v:`$${S.annualPayout?.toFixed(2)||"—"}`,s:"por acción"},
              {l:"Ex-Dividendo",v:S.exDivDate||"—",s:S.exDivStatus||""},
              {l:"Fecha Pago",v:S.payDate||"—",s:S.payDateStatus||""},
              {l:"Fiscalidad",v:S.taxation,s:S.taxForm},
            ].map((x,i)=>(
              <div key={i} style={{textAlign:"center",padding:"12px 8px",background:"var(--row-alt)",borderRadius:10,border:"1px solid var(--subtle-border)"}}>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:.5}}>{x.l}</div>
                <div style={{fontSize:15,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:5}}>{x.v}</div>
                <div style={{fontSize:9.5,color:"var(--text-tertiary)",marginTop:2}}>{x.s}</div>
              </div>
            ))}
          </div>
        </Card>
      ),
    };

    const tipBanner = showTip ? (
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',background:'rgba(200,164,78,.08)',border:'1px solid rgba(200,164,78,.2)',borderRadius:8,fontSize:11,color:'var(--text-secondary)'}}>
        <span style={{flex:1}}>Arrastra los bloques para reordenar. Click derecho en un bloque para restablecer.</span>
        <button onClick={() => { try { localStorage.setItem('ayr-reorder-tip-seen','1'); } catch {} setShowTip(false); }}
          style={{background:'none',border:'none',color:'var(--text-tertiary)',cursor:'pointer',fontSize:13,padding:'0 4px',lineHeight:1}}>✕</button>
      </div>
    ) : null;

    const orderedDivKeys = [...new Set([...sectionOrder, ...DIV_DEFAULT_ORDER])].filter(k => DIV_SECTIONS[k] != null);

    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        {tipBanner}
        {orderedDivKeys.map(id => {
          const content = DIV_SECTIONS[id];
          if (!content) return null;
          const isDragTarget = dragOver === id;
          return (
            <div key={id}
              draggable={true}
              onDragStart={e => handleDivDragStart(id, e)}
              onDragOver={e => handleDivDragOver(id, e)}
              onDragLeave={() => handleDivDragLeave(id)}
              onDrop={e => handleDivDrop(id, e)}
              onDragEnd={handleDivDragEnd}
              onContextMenu={handleDivContextMenu}
              title="Arrastra para reordenar bloques · click derecho para restablecer"
              style={{
                position:'relative',
                borderLeft: isDragTarget ? '3px solid var(--gold)' : '3px solid transparent',
                transition:'border-left .1s',
                opacity: dragKey.current === id ? 0.45 : 1,
              }}>
              <span style={{
                position:'absolute',top:10,left:-18,
                fontSize:9,color:'var(--text-tertiary)',opacity:.4,
                letterSpacing:1,cursor:'grab',userSelect:'none',
                fontFamily:'var(--fm)',lineHeight:1,
              }}>⋮⋮</span>
              {content}
            </div>
          );
        })}
      </div>
    );
}
