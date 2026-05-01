import { useState, useEffect } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Badge, BarChart, Card, TrustBadge } from '../ui';
import { _sf, n, f1, f2, fP, fX, fC, fM, div } from '../../utils/formatters.js';
import { R } from '../../utils/ratings.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { API_URL } from '../../constants/index.js';

export default function DashTab() {
  const { CHART_YEARS, L, LD, altmanZ, capLabel, cfg, chartLabels, comp, dcf, fin, fmpExtra, marketCap, piotroski, priceChartData, roicWaccSpread, ssd, wacc, waterfall } = useAnalysis();
  // Trust badges — useFreshness has its own useEffect so must be declared before render
  const { getLevel: freshnessLevel, getUpdatedAt: freshnessDate, getSource: freshnessSource } = useFreshness();

  // Debt maturity calendar — must be declared before render (TDZ safety)
  const [debtMaturity, setDebtMaturity] = useState(null);
  useEffect(() => {
    if (!cfg.ticker) return;
    setDebtMaturity(null);
    const ctrl = new AbortController();
    fetch(`${API_URL}/api/debt-maturity?ticker=${encodeURIComponent(cfg.ticker)}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setDebtMaturity(d.maturity ? d : null))
      .catch(e => { if (e.name !== 'AbortError') setDebtMaturity(null); });
    return () => ctrl.abort();
  }, [cfg.ticker]);

    const revData = CHART_YEARS.map(y=>fin[y]?.revenue ?? null);
    const fcfData = CHART_YEARS.map(y=>comp[y]?.fcf ?? null);
    const epsData = CHART_YEARS.map(y=>fin[y]?.eps ?? null);
    const labels = chartLabels;
    return (
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        <Card glow>
          <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
            <div style={{width:60,height:60,borderRadius:14,overflow:"hidden",background:"#161b22",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(0,0,0,.3)",flexShrink:0}}>
              <img src={`https://images.financialmodelingprep.com/symbol/${(cfg.ticker||"").replace(':','.')}.png`} alt=""
                style={{width:60,height:60,objectFit:"contain",borderRadius:14}}
                onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
              <div style={{display:"none",width:60,height:60,borderRadius:14,background:"linear-gradient(135deg,#c8a44e 0%,#b8860b 50%,#8B6914 100%)",alignItems:"center",justifyContent:"center"}}>
                <div style={{fontSize:cfg.ticker&&cfg.ticker.length>3?16:20,fontWeight:800,color:"#000",fontFamily:"var(--fm)",letterSpacing:1}}>{(cfg.ticker||"?").slice(0,4)}</div>
              </div>
            </div>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:22,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>{cfg.name||"Introduce una empresa"}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,flexWrap:"wrap"}}>
                <span style={{fontSize:10,fontWeight:700,color:capLabel==="Mega"||capLabel==="Large"?"var(--green)":capLabel==="Mid"?"var(--yellow)":"var(--orange)",background:capLabel==="Mega"||capLabel==="Large"?"rgba(48,209,88,.10)":capLabel==="Mid"?"rgba(255,214,10,.10)":"rgba(255,159,10,.10)",padding:"2px 8px",borderRadius:20,letterSpacing:.3}}>{capLabel} Cap</span>
                <span style={{fontSize:12,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>${marketCap>=1e6?_sf(marketCap/1e6,1)+"T":marketCap>=1e3?_sf(marketCap/1e3,1)+"B":_sf(marketCap,0)+"M"}</span>
                {fmpExtra.profile?.sector && <>
                  <span style={{fontSize:11,color:"var(--text-tertiary)"}}>·</span>
                  <span style={{fontSize:10,fontWeight:600,color:"#64d2ff",background:"rgba(100,210,255,.08)",padding:"2px 7px",borderRadius:20}}>{fmpExtra.profile.sector}</span>
                </>}
                {fmpExtra.profile?.industry && <span style={{fontSize:10,color:"var(--text-tertiary)"}}>{fmpExtra.profile.industry}</span>}
                <span style={{fontSize:11,color:"var(--text-tertiary)"}}>·</span>
                <span style={{fontSize:11,color:"var(--text-secondary)"}}>WACC: {fP(wacc.wacc)}</span>
                <span style={{fontSize:11,color:"var(--text-tertiary)"}}>·</span>
                <span style={{fontSize:11,color:"var(--text-secondary)"}}>Beta: {cfg.beta?.toFixed(2)}</span>
                {fmpExtra.profile?.country && <>
                  <span style={{fontSize:11,color:"var(--text-tertiary)"}}>·</span>
                  <span style={{fontSize:10,color:"var(--text-tertiary)"}}>{fmpExtra.profile.country}</span>
                </>}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:36,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>{fC(cfg.price,cfg.currency==="EUR"?"€":"$")}<TrustBadge level="fresh" source="FMP /historical-price-full (análisis) · Yahoo precios en vivo (portfolio)" updatedAt={new Date().toISOString().slice(0,10)} note="Precio del análisis se carga al abrir la empresa."/></div>
              {dcf && <div style={{fontSize:13,fontWeight:600,marginTop:4,color:dcf.mos>0?"var(--green)":"var(--red)"}}>
                Intrínseco: {fC(dcf.iv)} ({dcf.mos>0?"↓":"↑"}{f1(Math.abs(dcf.mos)*100)}%)
              </div>}
              {fmpExtra.rating?.rating && <div style={{display:"flex",gap:6,marginTop:6,alignItems:"center"}}>
                <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>FMP:</span>
                <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:6,fontFamily:"var(--fm)",
                  color:fmpExtra.rating.overallScore>=4?"#30d158":fmpExtra.rating.overallScore>=3?"#ffd60a":"#ff453a",
                  background:fmpExtra.rating.overallScore>=4?"rgba(48,209,88,.1)":fmpExtra.rating.overallScore>=3?"rgba(255,214,10,.1)":"rgba(255,69,58,.1)",
                  border:`1px solid ${fmpExtra.rating.overallScore>=4?"rgba(48,209,88,.25)":fmpExtra.rating.overallScore>=3?"rgba(255,214,10,.25)":"rgba(255,69,58,.25)"}`
                }}>{fmpExtra.rating.rating} ({fmpExtra.rating.overallScore}/5)</span>
                {fmpExtra.grades?.consensus && <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,fontFamily:"var(--fm)",
                  color:fmpExtra.grades.consensus==="Strong Buy"||fmpExtra.grades.consensus==="Buy"?"#30d158":"#ffd60a",
                  background:fmpExtra.grades.consensus==="Strong Buy"||fmpExtra.grades.consensus==="Buy"?"rgba(48,209,88,.08)":"rgba(255,214,10,.08)"
                }}>{fmpExtra.grades.consensus}</span>}
                {fmpExtra.dcf?.dcf > 0 && <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>
                  DCF: {fC(fmpExtra.dcf.dcf)} {fmpExtra.dcf.dcf > cfg.price ? "↑" : "↓"}{f1(Math.abs((1-cfg.price/fmpExtra.dcf.dcf)*100))}%
                </span>}
              </div>}
            </div>
          </div>
          {/* Price chart 10Y */}
          {(() => {
            const priceData = priceChartData;
            if (!priceData || priceData.length < 10) return null;
            const weekly = priceData.filter((_,i) => i % 5 === 0);
            const prices = weekly.map(p=>p.close);
            const minP = Math.min(...prices) * 0.95;
            const maxP = Math.max(...prices) * 1.02;
            const range = maxP - minP || 1;
            const W = 900; const H = 300;
            const PAD = 45;
            const points = weekly.map((p,i) => `${PAD+(i/(weekly.length-1))*(W-PAD)},${H - ((p.close-minP)/range)*H}`).join(" ");
            const lastP = prices[prices.length-1];
            const firstP = prices[0];
            const chg = ((lastP - firstP) / firstP * 100);
            const col = chg >= 0 ? "#34d399" : "#f87171";
            const years = []; let lastYr = "";
            weekly.forEach((p,i) => { const yr = p.date?.slice(0,4); if(yr !== lastYr) { years.push({x:PAD+(i/(weekly.length-1))*(W-PAD), yr}); lastYr=yr; }});
            // Price grid lines
            const gridLines = 5;
            const gridPrices = Array.from({length:gridLines+1},(_,i) => minP + (range * i / gridLines));
            return <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:"16px 16px 8px",marginTop:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                  <span style={{fontSize:13,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>Precio</span>
                  <span style={{fontSize:20,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{cfg?.currency==="EUR"?"€":cfg?.currency==="GBP"?"£":"$"}{_sf(lastP,2)}</span>
                </div>
                <div style={{display:"flex",gap:12,alignItems:"center"}}>
                  <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>10 años</span>
                  <span style={{fontSize:14,fontWeight:700,color:col,fontFamily:"var(--fm)",padding:"3px 10px",borderRadius:6,background:`${col}15`}}>{chg>=0?"+":""}{_sf(chg,0)}%</span>
                </div>
              </div>
              <svg viewBox={`0 0 ${W} ${H+25}`} style={{width:"100%",height:"auto"}}>
                <defs><linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".2"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
                {/* Grid lines */}
                {gridPrices.map((p,i) => {const yPos = H - ((p-minP)/range)*H; return <g key={i}><line x1={PAD} y1={yPos} x2={W} y2={yPos} stroke="var(--subtle-border)" strokeWidth="0.5"/><text x={PAD-4} y={yPos+3} fill="var(--text-tertiary)" fontSize="8" fontFamily="var(--fm)" textAnchor="end">{Math.round(p)}</text></g>;})}
                {/* Year lines */}
                {years.map((y,i) => <g key={i}><line x1={y.x} y1={0} x2={y.x} y2={H} stroke="var(--subtle-bg2)" strokeWidth="0.5"/><text x={y.x} y={H+16} fill="var(--text-tertiary)" fontSize="9" fontFamily="var(--fm)" textAnchor="middle">{y.yr}</text></g>)}
                {/* Area + Line */}
                <polygon points={`${PAD},${H} ${points} ${W-1},${H}`} fill="url(#priceGrad)"/>
                <polyline points={points} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round"/>
                {/* Current price dot */}
                {(() => {const lx = PAD+((weekly.length-1)/(weekly.length-1))*(W-PAD); const ly = H-((lastP-minP)/range)*H; return <circle cx={lx} cy={ly} r="3.5" fill={col} stroke="var(--bg)" strokeWidth="1.5"/>;})()}
              </svg>
            </div>;
          })()}
        </Card>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
          {[
            {lbl:"FCF",val:fM(L.fcf),sub:`Margen: ${fP(L.fcfm)}`,rules:R.fcfm,rv:L.fcfm,trust:{src:"FMP /cash-flow-statement (TTM)",note:"Free Cash Flow = OpCF - CapEx"}},
            {lbl:"M. Bruto",val:fP(L.gm),rules:R.gm,rv:L.gm,trust:{src:"FMP /income-statement (TTM)",note:"Gross Margin = Gross Profit / Revenue"}},
            {lbl:"M. Operativo",val:fP(L.om),rules:R.gm,rv:L.om,trust:{src:"FMP /income-statement (TTM)",note:"Operating Margin = Operating Income / Revenue"}},
            {lbl:"ROE",val:fP(L.roe),sub:L.roeBuffett!=null?`Buffett: ${fP(L.roeBuffett)} ${L.roeBuffett>L.roe?"↗":L.roeBuffett<L.roe?"↘":"≈"}`:null,rules:R.roe,rv:L.roe,trust:{src:"Avg: NI / ((begin+end equity)/2) · Buffett: NI / ending equity",note:"Avg = estándar GuruFocus/Morningstar/CFA. Buffett ↗ = recompras (pro-shareholder). Buffett ↘ = equity creciendo (dilución / retención ineficiente)."}},
            {lbl:"ROIC",val:fP(L.roic),sub:L.roicBuffett!=null?`Buffett: ${fP(L.roicBuffett)} ${L.roicBuffett>L.roic?"↗":L.roicBuffett<L.roic?"↘":"≈"}`:null,rules:R.roic,rv:L.roic,trust:{src:"Avg: NOPAT / Avg IC · Buffett: NOPAT / ending IC",note:"Avg = estándar industria. Buffett ↗ = capital invertido encogiendo (recompras / amortización deuda)."}},
            {lbl:"Deuda/FCF",val:fX(L.d2fcf),rules:R.d2fcf,rv:L.d2fcf,trust:{src:"FMP /balance-sheet + /cash-flow (TTM)",note:"Total Debt / Free Cash Flow"}},
            {lbl:"EV/EBITDA",val:fX(L.eve),rules:R.eve,rv:L.eve,trust:{src:"FMP /key-metrics (TTM)",note:"Enterprise Value / EBITDA"}},
            {lbl:"Piotroski",val:`${piotroski.score}/9`,rules:R.pio,rv:piotroski.score,trust:{src:"Calculado localmente sobre FMP financials",note:"F-Score: 9 criterios de salud financiera"}},
            {lbl:"Div Yield",val:fP(cfg.price>0&&LD.dps>0?LD.dps/cfg.price:null),sub:`DPS: $${LD.dps?.toFixed(2)||"—"}`,rules:[{test:v=>v>.04,lbl:"Alto",c:"var(--green)",bg:"rgba(48,209,88,.1)",score:3},{test:v=>v>.025,lbl:"Medio",c:"var(--yellow)",bg:"rgba(255,214,10,.1)",score:2},{test:v=>v>.01,lbl:"Bajo",c:"var(--orange)",bg:"rgba(255,159,10,.1)",score:1},{test:()=>true,lbl:"Mínimo",c:"var(--text-tertiary)",bg:"#1a202c",score:0}],rv:cfg.price>0&&LD.dps>0?LD.dps/cfg.price:null,trust:{src:"FMP /key-metrics dividendYield + DPS TTM",note:"DPS TTM / precio actual"}},
            {lbl:"WACC",val:fP(wacc.wacc),sub:`Ke:${fP(wacc.costEquity)} Kd:${fP(wacc.costDebt)}`,trust:{lvl:"unverified",src:"Calculado localmente (CAPM + spread)",note:"Beta × ERP + Rf para equity; spread crediticio para deuda. Estimado."}},
          ].map((m,i) => (
            <Card key={i}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                <span style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,fontFamily:"var(--fm)",display:"flex",alignItems:"center",gap:3}}>{m.lbl}{m.trust && <TrustBadge level={m.trust.lvl||"fresh"} source={m.trust.src} updatedAt={freshnessDate("scores")||new Date().toISOString().slice(0,10)} note={m.trust.note}/>}</span>
                {m.rules && <Badge val={m.rv} rules={m.rules}/>}
              </div>
              <div style={{fontSize:22,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:2}}>{m.val}</div>
              {m.sub && <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>{m.sub}</div>}
            </Card>
          ))}
        </div>

        {/* ── 52-Week Range + Forward Payout + Sector PE ── */}
        {fmpExtra.profile?.range && (() => {
          const rangeParts = (fmpExtra.profile.range||"0-0").split("-").map(Number);
          const [lo52, hi52] = [rangeParts[0] || 0, rangeParts[1] || 0];
          const price52 = cfg.price || 0;
          const pctInRange = hi52 > lo52 ? (price52 - lo52) / (hi52 - lo52) : 0;
          const fwdEPS = fmpExtra.estimates?.[0]?.epsAvg || fmpExtra.estimates?.[0]?.estimatedEpsAvg;
          const fwdPayout = fwdEPS > 0 && LD.dps > 0 ? LD.dps / fwdEPS : null;
          const curPE = LD.eps > 0 && price52 > 0 ? price52 / LD.eps : null;
          // 5Y avg yield from keyMetrics
          const kmYields = (fmpExtra.keyMetrics||[]).slice(0,5).map(k=>k.dividendYield).filter(v=>v>0);
          const avg5yYield = kmYields.length > 0 ? kmYields.reduce((s,v)=>s+v,0)/kmYields.length : null;
          const curYield = price52 > 0 && LD.dps > 0 ? LD.dps / price52 : null;
          return (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:12}}>
            {/* 52-Week Range */}
            <Card>
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:8}}>52-WEEK RANGE</div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:6}}>
                <span>${_sf(lo52,2)}</span><span>${_sf(hi52,2)}</span>
              </div>
              <div style={{position:"relative",height:8,background:"var(--subtle-bg2)",borderRadius:4,overflow:"hidden"}}>
                <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${Math.max(2,Math.min(98,pctInRange*100))}%`,background:`linear-gradient(90deg,#ff453a,#ffd60a,#30d158)`,borderRadius:4,transition:"width .3s"}}/>
              </div>
              <div style={{position:"relative",marginTop:-2}}>
                <div style={{position:"absolute",left:`${Math.max(2,Math.min(95,pctInRange*100))}%`,transform:"translateX(-50%)",fontSize:12,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>${_sf(price52,2)}</div>
              </div>
              <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:14,textAlign:"center"}}>{pctInRange<0.3?"Cerca de mínimos":pctInRange>0.7?"Cerca de máximos":"Zona media"}</div>
            </Card>
            {/* Forward Payout + Yield vs 5Y Avg */}
            <Card>
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:8}}>FORWARD PAYOUT</div>
              <div style={{display:"flex",gap:16,alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:22,fontWeight:700,color:fwdPayout!=null?(fwdPayout<0.6?"#30d158":fwdPayout<0.75?"#ffd60a":"#ff453a"):"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{fwdPayout!=null?_sf(fwdPayout*100,0)+"%":"—"}</div>
                  <div style={{fontSize:9,color:"var(--text-tertiary)"}}>Fwd DPS/EPS</div>
                </div>
                {fwdEPS && <div style={{fontSize:10,color:"var(--text-tertiary)",lineHeight:1.8}}>
                  DPS: ${LD.dps?.toFixed(2)}<br/>
                  Est EPS: ${_sf(fwdEPS,2)}
                </div>}
              </div>
              {avg5yYield != null && curYield != null && (
                <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid var(--subtle-bg2)"}}>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>YIELD vs 5Y AVG</div>
                  <div style={{display:"flex",gap:12,fontSize:11,fontFamily:"var(--fm)"}}>
                    <span style={{color:curYield>avg5yYield?"#30d158":"#ff9f0a"}}>{_sf(curYield*100,1)}% actual</span>
                    <span style={{color:"var(--text-tertiary)"}}>{_sf(avg5yYield*100,1)}% avg</span>
                    <span style={{color:curYield>avg5yYield?"#30d158":"#ff9f0a",fontWeight:600}}>{curYield>avg5yYield?"↑":"↓"} {avg5yYield>0?_sf(Math.abs((curYield-avg5yYield)/avg5yYield)*100,0):"0"}%</span>
                  </div>
                </div>
              )}
            </Card>
            {/* Sector PE Comparison */}
            <Card>
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:8}}>SECTOR P/E</div>
              {curPE ? (
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{cfg.ticker}</div>
                      <div style={{fontSize:22,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{_sf(curPE,1)}x</div>
                    </div>
                    {fmpExtra.profile?.sector && <div style={{textAlign:"right"}}>
                      <div style={{fontSize:10,color:"var(--text-tertiary)"}}>{fmpExtra.profile.sector}</div>
                      <div style={{fontSize:16,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>~20x</div>
                    </div>}
                  </div>
                  {/* Visual bar comparison */}
                  <div style={{display:"flex",gap:6,alignItems:"flex-end",height:40}}>
                    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                      <div style={{width:"100%",background:curPE<20?"#30d158":"#ff9f0a",borderRadius:3,height:Math.min(40,Math.max(8,(curPE/30)*40)),transition:"height .3s"}}/>
                      <span style={{fontSize:8,color:"var(--text-tertiary)"}}>{cfg.ticker}</span>
                    </div>
                    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                      <div style={{width:"100%",background:"var(--border-hover)",borderRadius:3,height:Math.min(40,Math.max(8,(20/30)*40))}}/>
                      <span style={{fontSize:8,color:"var(--text-tertiary)"}}>Sector</span>
                    </div>
                    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                      <div style={{width:"100%",background:"var(--subtle-bg2)",borderRadius:3,height:Math.min(40,Math.max(8,(21/30)*40))}}/>
                      <span style={{fontSize:8,color:"var(--text-tertiary)"}}>S&P</span>
                    </div>
                  </div>
                  <div style={{fontSize:9,color:curPE<20?"#30d158":"#ff9f0a",marginTop:6,textAlign:"center"}}>{curPE<15?"Barato vs sector":curPE<20?"Por debajo del sector":"Por encima del sector"}</div>
                </div>
              ) : <div style={{color:"var(--text-tertiary)",fontSize:12}}>Sin datos P/E</div>}
            </Card>
          </div>);
        })()}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
          <Card title="Ventas" icon="📈"><BarChart data={revData} labels={labels} color="var(--gold)" formatFn={fM}/></Card>
          <Card title="Free Cash Flow" icon="💰"><BarChart data={fcfData} labels={labels} color="var(--green)" formatFn={fM}/></Card>
          <Card title="EPS" icon="📊"><BarChart data={epsData} labels={labels} color="#64d2ff" formatFn={f2}/></Card>
          <Card title="Dividendo/Acción" icon="💰"><BarChart data={CHART_YEARS.map(y=>fin[y]?.dps||0)} labels={chartLabels} color="#c8a44e" formatFn={v=>"$"+_sf(v,2)}/></Card>
        </div>

        {/* ROIC vs WACC Spread */}
        <Card title="ROIC vs WACC — Creación de Valor" icon="⚡">
          <div style={{display:"flex",alignItems:"flex-end",gap:3,height:100,padding:"0 4px"}}>
            {roicWaccSpread.slice().reverse().map((d,i)=>{
              if(d.roic==null) return null;
              const spread = d.spread || 0;
              const h = Math.abs(spread) * 500;
              const clampH = Math.min(Math.max(h, 4), 80);
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                  <span style={{fontSize:8.5,color:spread>0?"var(--green)":"var(--red)",marginBottom:2,fontFamily:"var(--fm)",fontWeight:600}}>{_sf(spread*100,1)}%</span>
                  <div style={{width:"100%",maxWidth:28,height:clampH,background:spread>0?"rgba(48,209,88,.25)":"rgba(255,69,58,.25)",borderRadius:"3px 3px 0 0",border:`1px solid ${spread>0?"var(--green)":"var(--red)"}`,borderBottom:"none"}}/>
                  <span style={{fontSize:8,color:"var(--text-tertiary)",marginTop:3,fontFamily:"var(--fm)"}}>{String(d.year).slice(2)}</span>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:8,fontSize:10,color:"var(--text-secondary)"}}>
            <span><span style={{color:"var(--green)"}}>●</span> ROIC &gt; WACC = Crea valor</span>
            <span><span style={{color:"var(--red)"}}>●</span> ROIC &lt; WACC = Destruye valor</span>
          </div>
        </Card>

        {/* Earnings History — Beat/Miss track record */}
        {fmpExtra.earnings?.length > 0 && (() => {
          const recent = fmpExtra.earnings.filter(e => e.epsActual != null).slice(0, 12);
          if (recent.length === 0) return null;
          const beats = recent.filter(e => e.epsActual > e.epsEstimated).length;
          const misses = recent.filter(e => e.epsActual < e.epsEstimated).length;
          const nextEarnings = fmpExtra.earnings.find(e => e.epsActual == null && e.date);
          return (
            <Card title="Earnings Track Record" icon="📊">
              <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
                {nextEarnings && <div style={{padding:"6px 12px",borderRadius:8,background:"rgba(200,164,78,.08)",border:"1px solid rgba(200,164,78,.2)"}}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>PRÓXIMO EARNINGS</div>
                  <div style={{fontSize:14,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{nextEarnings.date}</div>
                  {nextEarnings.epsEstimated && <div style={{fontSize:9,color:"var(--text-secondary)"}}>Est. EPS: ${_sf(nextEarnings.epsEstimated,2)}</div>}
                </div>}
                <div style={{padding:"6px 12px",borderRadius:8,background:"rgba(48,209,88,.06)"}}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>BEATS</div>
                  <div style={{fontSize:18,fontWeight:800,color:"var(--green)",fontFamily:"var(--fm)"}}>{beats}/{recent.length}</div>
                </div>
                <div style={{padding:"6px 12px",borderRadius:8,background:"rgba(255,69,58,.06)"}}>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>MISSES</div>
                  <div style={{fontSize:18,fontWeight:800,color:"var(--red)",fontFamily:"var(--fm)"}}>{misses}/{recent.length}</div>
                </div>
                <div style={{flex:1,fontSize:11,color:"var(--text-secondary)"}}>
                  {beats >= recent.length * 0.8 ? "Bate expectativas consistentemente. Management fiable." :
                   beats >= recent.length * 0.6 ? "Track record aceptable. Algún miss puntual." :
                   "Misses frecuentes. Cautela con las estimaciones."}
                </div>
              </div>
              <div style={{display:"flex",gap:2,alignItems:"flex-end",height:50}}>
                {recent.slice().reverse().map((e,i) => {
                  const surprise = (e.epsEstimated != null && e.epsEstimated !== 0 && e.epsActual != null) ? (e.epsActual - e.epsEstimated) / Math.abs(e.epsEstimated) : 0;
                  const h = Math.min(Math.abs(surprise) * 500, 40);
                  return (
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}} title={`${e.date}: Act $${_sf(e.epsActual??0,2)} vs Est $${_sf(e.epsEstimated??0,2)}`}>
                      <div style={{width:"100%",maxWidth:20,height:Math.max(h,3),background:surprise>=0?"rgba(48,209,88,.5)":"rgba(255,69,58,.5)",borderRadius:"2px 2px 0 0"}}/>
                      <span style={{fontSize:6.5,color:"var(--text-tertiary)",marginTop:1,fontFamily:"var(--fm)"}}>{e.date?.slice(5,7)}/{e.date?.slice(2,4)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}

        {/* Bottom row: Altman Z + Waterfall */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Card title="Altman Z-Score" icon="🔬">
            {altmanZ.score != null ? (
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:36,fontWeight:800,color:altmanZ.zoneColor,fontFamily:"var(--fm)"}}>{_sf(altmanZ.score,2)}</div>
                  <div style={{fontSize:11,fontWeight:700,color:altmanZ.zoneColor,marginTop:2}}>{altmanZ.zone}</div>
                </div>
                <div style={{flex:1,fontSize:10,color:"var(--text-secondary)",lineHeight:1.6}}>
                  <div style={{marginBottom:4}}><span style={{color:"var(--green)"}}>{'>'} 2.99</span> = Segura · <span style={{color:"var(--yellow)"}}>1.81-2.99</span> = Gris · <span style={{color:"var(--red)"}}>{'<'} 1.81</span> = Peligro</div>
                  {altmanZ.items.map((it,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}>
                      <span style={{color:"var(--text-tertiary)",fontSize:9}}>{it.name}</span>
                      <span style={{fontFamily:"var(--fm)",fontSize:9,color:it.weighted>0?"var(--green)":"var(--red)"}}>{_sf(it.weighted,2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div style={{color:"var(--text-tertiary)",fontSize:12,textAlign:"center",padding:20}}>Introduce datos para calcular</div>}
          </Card>

          {/* Revenue to FCF Waterfall */}
          <Card title="Revenue → FCF Waterfall" icon="💧">
            {waterfall ? (
              <div style={{display:"flex",alignItems:"flex-end",gap:1,height:120,padding:"0 2px"}}>
                {waterfall.map((step,i)=>{
                  const posVals = waterfall.filter(s=>s.value>0).map(s=>s.value);
                  const maxVal = posVals.length ? Math.max(...posVals) : 1;
                  const h = Math.abs(step.value)/maxVal * 100;
                  return (
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                      <span style={{fontSize:8,color:step.color,marginBottom:2,fontFamily:"var(--fm)",fontWeight:600}}>{fM(step.value)}</span>
                      <div style={{width:"100%",maxWidth:24,height:Math.max(h,3),background:step.color,opacity:step.subtotal?1:0.7,borderRadius:"3px 3px 0 0"}}/>
                      <span style={{fontSize:7.5,color:"var(--text-tertiary)",marginTop:3,writingMode:"vertical-rl",height:44,overflow:"hidden",fontFamily:"var(--fm)"}}>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{color:"var(--text-tertiary)",fontSize:12,textAlign:"center",padding:20}}>Introduce datos</div>}
          </Card>
        </div>

        {/* FCF Coverage del Dividendo (multi-año) */}
        {(() => {
          const rows = CHART_YEARS.map(y => {
            const d = fin[y]; if(!d) return null;
            const fcf = (d.ocf||0) - (d.capex||0);
            const divs = (d.dps||0) * (d.sharesOut||0);
            return { y, fcf, divs };
          }).filter(Boolean);
          if (rows.length === 0) return null;
          const maxV = Math.max(...rows.map(r => Math.max(r.fcf, r.divs)), 1);
          const lat = rows[rows.length-1] || {};
          const cov = lat.divs > 0 ? lat.fcf/lat.divs : null;
          const covColor = cov==null ? "var(--text-tertiary)" : cov >= 2 ? "var(--green)" : cov >= 1.2 ? "var(--gold)" : cov >= 1 ? "#ff9f0a" : "var(--red)";
          return (
            <Card title="Cobertura del Dividendo (FCF vs Dividendos)" icon="🛡" style={{marginTop:12}} badge={
              cov != null ? <span style={{fontSize:11,fontWeight:700,color:covColor,padding:"4px 12px",borderRadius:100,border:`1px solid ${covColor}`,background:`${covColor.startsWith('var')?'rgba(48,209,88,.12)':covColor+"22"}`}}>{cov.toFixed(2)}x cobertura</span> : null
            }>
              <div style={{display:"flex",alignItems:"flex-end",gap:6,height:140,padding:"4px 2px",borderBottom:"1px solid var(--border)"}}>
                {rows.map((r,i)=>{
                  const fcfH = (r.fcf/maxV)*120;
                  const divH = (r.divs/maxV)*120;
                  return (
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",height:"100%",justifyContent:"flex-end",position:"relative"}}>
                      <div style={{display:"flex",gap:2,alignItems:"flex-end",height:120}}>
                        <div style={{width:10,height:Math.max(fcfH,2),background:"#6b8e6b",borderRadius:"2px 2px 0 0"}} title={`FCF: ${fM(r.fcf)}`}/>
                        <div style={{width:10,height:Math.max(divH,2),background:"#c9972e",borderRadius:"2px 2px 0 0"}} title={`Dividendos: ${fM(r.divs)}`}/>
                      </div>
                      <span style={{fontSize:8,color:"var(--text-tertiary)",marginTop:3,fontFamily:"var(--fm)"}}>{String(r.y).slice(2)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,fontSize:10,color:"var(--text-secondary)"}}>
                <div style={{display:"flex",gap:14}}>
                  <span><span style={{display:"inline-block",width:9,height:9,background:"#6b8e6b",marginRight:4,borderRadius:1}}/>FCF</span>
                  <span><span style={{display:"inline-block",width:9,height:9,background:"#c9972e",marginRight:4,borderRadius:1}}/>Dividendos pagados</span>
                </div>
                <span style={{fontSize:9,color:"var(--text-tertiary)"}}>Coverage = FCF / DPS×Shares · DSTTab tiene allocation con buybacks/SBC/deuda</span>
              </div>
            </Card>
          );
        })()}

        {/* FCF Allocation — Capital Allocation multi-year stacked bar */}
        {(() => {
          const allocRows = CHART_YEARS.map(y => {
            const d = fin[y]; if (!d) return null;
            const a = comp[y]?.fcfAlloc;
            if (!a) return null;
            const total = a.divs + a.buybacks + a.debtPaydown + a.acquisitions + a.retained;
            if (total <= 0) return null;
            return { y, ...a, total };
          }).filter(Boolean);
          if (allocRows.length === 0) return null;
          const maxTotal = Math.max(...allocRows.map(r => r.total), 1);
          const BAR_H = 120;
          const SEGS = [
            { key: 'divs',       label: 'Dividendos', color: '#c8a44e' },
            { key: 'buybacks',   label: 'Buybacks',   color: '#ff9f0a' },
            { key: 'debtPaydown',label: 'Deuda',      color: '#5b9bd5' },
            { key: 'acquisitions',label: 'M&A',       color: '#bf5af2' },
            { key: 'retained',   label: 'Retenido',   color: '#6b8e6b' },
          ];
          const latRow = allocRows[allocRows.length - 1];
          return (
            <Card title="Asignación del FCF (Capital Allocation)" icon="📊" style={{marginTop:12}}>
              {/* Stacked bar chart */}
              <div style={{display:'flex',alignItems:'flex-end',gap:4,height:BAR_H+20,padding:'0 2px',marginBottom:4}}>
                {allocRows.map((r,i) => {
                  const barH = (r.total / maxTotal) * BAR_H;
                  return (
                    <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',height:BAR_H+20}}>
                      <div style={{width:'100%',display:'flex',flexDirection:'column-reverse',height:barH,borderRadius:'3px 3px 0 0',overflow:'hidden',cursor:'default'}}
                        title={SEGS.map(s => `${s.label}: ${fM(r[s.key])}`).join('\n')}>
                        {SEGS.map(s => {
                          const segH = r.total > 0 ? (r[s.key] / r.total) * barH : 0;
                          if (segH < 0.5) return null;
                          return <div key={s.key} style={{width:'100%',height:segH,background:s.color,flexShrink:0}}/>;
                        })}
                      </div>
                      <span style={{fontSize:8,color:'var(--text-tertiary)',marginTop:3,fontFamily:'var(--fm)'}}>{String(r.y).slice(2)}</span>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div style={{display:'flex',flexWrap:'wrap',gap:'4px 12px',marginBottom:10}}>
                {SEGS.map(s => (
                  <span key={s.key} style={{fontSize:9,color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:4}}>
                    <span style={{display:'inline-block',width:9,height:9,background:s.color,borderRadius:2,flexShrink:0}}/>
                    {s.label}
                  </span>
                ))}
              </div>
              {/* Latest-year % breakdown row */}
              {latRow && latRow.total > 0 && (
                <div style={{padding:'8px 10px',background:'var(--row-alt)',borderRadius:8,fontSize:10,color:'var(--text-secondary)',fontFamily:'var(--fm)',lineHeight:1.8}}>
                  <span style={{fontWeight:700,color:'var(--text-primary)',marginRight:8}}>{latRow.y}:</span>
                  {SEGS.map((s,i) => {
                    const pct = Math.round((latRow[s.key] / latRow.total) * 100);
                    if (pct === 0) return null;
                    return (
                      <span key={s.key}>
                        <span style={{color:s.color,fontWeight:600}}>{pct}%</span>
                        <span style={{color:'var(--text-tertiary)'}}> {s.label}</span>
                        {i < SEGS.length - 1 && <span style={{color:'var(--border)',margin:'0 6px'}}>·</span>}
                      </span>
                    );
                  })}
                  <span style={{display:'block',marginTop:4,fontSize:9,color:'var(--text-tertiary)'}}>FCF total {fM(latRow.total)} · ordenado de mayor a menor</span>
                </div>
              )}
            </Card>
          );
        })()}

        {/* AI Disruption Risk — en Resumen */}
        <Card title="Riesgo Disrupción IA" icon="🤖" style={{marginTop:16}} badge={
          ssd.aiDisruptionLevel ? <span style={{fontSize:11,fontWeight:700,
            color:ssd.aiDisruptionLevel==="Low"?"#30d158":ssd.aiDisruptionLevel==="Medium"?"#ffd60a":ssd.aiDisruptionLevel==="High"?"#ff9f0a":"#ff453a",
            background:ssd.aiDisruptionLevel==="Low"?"rgba(48,209,88,.12)":ssd.aiDisruptionLevel==="Medium"?"rgba(255,214,10,.12)":ssd.aiDisruptionLevel==="High"?"rgba(255,159,10,.12)":"rgba(255,69,58,.12)",
            padding:"4px 12px",borderRadius:100,border:"1px solid var(--border-hover)"
          }}>{ssd.aiDisruptionLevel} ({ssd.aiDisruptionScore}/100)</span> : null
        }>
          {ssd.aiDisruptionLevel ? (
            <div>
              <div style={{textAlign:"center",padding:"6px 0"}}>
                <div style={{fontSize:32,fontWeight:800,fontFamily:"var(--fm)",
                  color:ssd.aiDisruptionScore<=25?"#30d158":ssd.aiDisruptionScore<=50?"#ffd60a":ssd.aiDisruptionScore<=75?"#ff9f0a":"#ff453a"
                }}>{ssd.aiDisruptionScore}<span style={{fontSize:14,color:"var(--text-tertiary)"}}>/100</span></div>
                <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:2}}>{ssd.aiDisruptionLevel==="Low"?"Bajo riesgo — modelo de negocio resiliente a IA":ssd.aiDisruptionLevel==="Medium"?"Riesgo moderado — algunos aspectos vulnerables":ssd.aiDisruptionLevel==="High"?"Alto riesgo — modelo de negocio amenazado por IA":"Riesgo crítico — alta probabilidad de disrupción"}</div>
              </div>
              {ssd.aiDisruptionAssessment && <div style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.7,marginTop:8,padding:"10px 12px",background:"var(--row-alt)",borderRadius:8}}>{ssd.aiDisruptionAssessment}</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
                {ssd.aiDisruptionThreats?.length > 0 && (
                  <div style={{padding:"10px",background:"rgba(255,69,58,.04)",borderRadius:8,border:"1px solid rgba(255,69,58,.08)"}}>
                    <div style={{fontSize:9,fontWeight:700,color:"#ff453a",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:6}}>AMENAZAS IA</div>
                    {ssd.aiDisruptionThreats.map((t,i) => <div key={i} style={{fontSize:10,color:"var(--text-secondary)",lineHeight:1.5,marginBottom:4}}>• {t}</div>)}
                  </div>
                )}
                {ssd.aiDisruptionDefenses?.length > 0 && (
                  <div style={{padding:"10px",background:"rgba(48,209,88,.04)",borderRadius:8,border:"1px solid rgba(48,209,88,.08)"}}>
                    <div style={{fontSize:9,fontWeight:700,color:"#30d158",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:6}}>DEFENSAS</div>
                    {ssd.aiDisruptionDefenses.map((d,i) => <div key={i} style={{fontSize:10,color:"var(--text-secondary)",lineHeight:1.5,marginBottom:4}}>• {d}</div>)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{textAlign:"center",padding:"16px",color:"var(--text-tertiary)",fontSize:12}}>
              Haz click en <strong style={{color:"var(--gold)"}}>⚡ Cargar</strong> para generar el análisis de riesgo IA con Claude.
            </div>
          )}
        </Card>

        {/* Calendario de Vencimientos de Deuda */}
        <Card title="Calendario de Vencimientos de Deuda" icon="📅" style={{marginTop:16}}>
          {debtMaturity ? (() => {
            const m = debtMaturity.maturity;
            const por = debtMaturity.period_of_report || '';
            // Base year from period_of_report (e.g. "2025-09-28" → 2025)
            const baseYear = por ? parseInt(por.slice(0, 4), 10) : new Date().getFullYear();
            const bars = [
              { key: 'next12m', label: `${baseYear + 1}`,  color: '#ff453a' },
              { key: 'y2',      label: `${baseYear + 2}`,  color: '#ff9f0a' },
              { key: 'y3',      label: `${baseYear + 3}`,  color: '#c8a44e' },
              { key: 'y4',      label: `${baseYear + 4}`,  color: '#ffd60a' },
              { key: 'y5',      label: `${baseYear + 5}`,  color: '#5b9bd5' },
              { key: 'after5',  label: `>${baseYear + 5}`, color: '#30d158' },
            ].filter(b => m[b.key] != null && m[b.key] > 0);

            if (bars.length === 0) return (
              <div style={{textAlign:'center',padding:'16px',color:'var(--text-tertiary)',fontSize:12}}>
                Datos de vencimiento no disponibles para este ticker.
              </div>
            );

            const maxVal = Math.max(...bars.map(b => m[b.key]));
            const BAR_H = 110;
            const totalLP = debtMaturity.total_long_term_debt;
            const fmt = v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : `$${v.toFixed(0)}`;

            return (
              <div>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text-secondary)',marginBottom:10}}>
                  Total deuda LP: <span style={{color:'var(--text-primary)',fontFamily:'var(--fm)',fontWeight:700}}>{fmt(totalLP)}</span>
                  <span style={{fontSize:9,color:'var(--text-tertiary)',marginLeft:8}}>10-K {debtMaturity.fiscal_year} · XBRL</span>
                </div>
                <div style={{display:'flex',alignItems:'flex-end',gap:6,height:BAR_H + 36,padding:'0 2px'}}>
                  {bars.map(b => {
                    const barH = Math.max((m[b.key] / maxVal) * BAR_H, 3);
                    return (
                      <div key={b.key} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end'}}>
                        <div style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginBottom:2,textAlign:'center'}}>{fmt(m[b.key])}</div>
                        <div
                          style={{width:'100%',height:barH,background:b.color,borderRadius:'3px 3px 0 0',opacity:0.85,cursor:'default'}}
                          title={`${b.label}: ${fmt(m[b.key])}`}
                        />
                        <div style={{fontSize:9,color:'var(--text-secondary)',marginTop:4,fontFamily:'var(--fm)',textAlign:'center'}}>{b.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{display:'flex',gap:12,marginTop:6,flexWrap:'wrap'}}>
                  <span style={{fontSize:9,display:'flex',alignItems:'center',gap:4,color:'var(--text-tertiary)'}}>
                    <span style={{display:'inline-block',width:9,height:9,background:'#ff453a',borderRadius:2}}/>Y+1 urgente
                  </span>
                  <span style={{fontSize:9,display:'flex',alignItems:'center',gap:4,color:'var(--text-tertiary)'}}>
                    <span style={{display:'inline-block',width:9,height:9,background:'#c8a44e',borderRadius:2}}/>Y2-Y5 medio plazo
                  </span>
                  <span style={{fontSize:9,display:'flex',alignItems:'center',gap:4,color:'var(--text-tertiary)'}}>
                    <span style={{display:'inline-block',width:9,height:9,background:'#30d158',borderRadius:2}}/>+5 años
                  </span>
                </div>
              </div>
            );
          })() : (
            <div style={{textAlign:'center',padding:'16px',color:'var(--text-tertiary)',fontSize:12}}>
              Datos de vencimiento no disponibles para este ticker.
            </div>
          )}
        </Card>
      </div>
    );
}
