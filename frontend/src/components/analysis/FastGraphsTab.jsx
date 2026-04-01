import { useAnalysis } from '../../context/AnalysisContext';
import { n, fP, fC, div } from '../../utils/formatters.js';
import { YEARS } from '../../constants/index.js';

export default function FastGraphsTab() {
  const { DATA_YEARS, L, cfg, comp, fgGrowth, fgMode, fgPE, fgProjYears, fin, setFgGrowth, setFgMode, setFgPE, setFgProjYears, setShowDiv, showDiv } = useAnalysis();
    // Historical data (oldest → newest) — only years with actual financial data
    const histYrs = [...DATA_YEARS].reverse();
    const getMetric = (y) => {
      if(fgMode === "fcf") return comp[y]?.fcfps;
      if(fgMode === "ocf") return div(fin[y]?.ocf, fin[y]?.sharesOut);
      return fin[y]?.eps;
    };

    // Filter valid historical years — must have non-zero metric value
    const validHist = histYrs.map(y => ({
      y, val: getMetric(y), price: null, div: fin[y]?.dps || 0
    })).filter(d => n(d.val) != null && d.val !== 0);

    // Projection years
    const lastHistY = validHist.length ? validHist[validHist.length - 1].y : YEARS[0];
    const lastVal = validHist.length ? validHist[validHist.length - 1].val : 0;
    const projData = Array.from({length: fgProjYears}, (_, i) => ({
      y: lastHistY + i + 1,
      val: lastVal > 0 ? lastVal * Math.pow(1 + fgGrowth / 100, i + 1) : null,
      projected: true,
    }));

    const allData = [...validHist, ...projData];

    // Current price point — place at most recent hist year
    const pricePoint = validHist.length ? { y: validHist[validHist.length - 1].y, price: cfg.price } : null;

    // Chart dims
    const W = 860, H = 420, PADL = 68, PADR = 24, PADT = 24, PADB = 48;
    const chartW = W - PADL - PADR;
    const chartH = H - PADT - PADB;

    // X scale: year → px
    const allYears = allData.map(d => d.y);
    const minY = allYears[0], maxY = allYears[allYears.length - 1];
    const xScale = y => PADL + ((y - minY) / (maxY - minY || 1)) * chartW;

    // Y scale: value → px (using EPS * PE as the "fair value" line)
    const epsFair = allData.map(d => d.val != null ? d.val * fgPE : null).filter(v => v != null);
    const allPrices = [cfg.price, ...epsFair].filter(v => v != null && v > 0);
    if (allPrices.length === 0) allPrices.push(100); // fallback to avoid -Infinity
    const rawMax = Math.max(...allPrices) * 1.15;
    const positivePrices = allPrices.filter(v => v > 0);
    const rawMin = Math.max(0, (positivePrices.length ? Math.min(...positivePrices) : 0) * 0.5);
    const yScale = v => PADT + chartH - ((v - rawMin) / (rawMax - rawMin || 1)) * chartH;
    const yNice = v => Math.round(v / 5) * 5;

    // Grid lines (Y)
    const gridCount = 6;
    const gridLines = Array.from({length: gridCount + 1}, (_, i) => {
      const val = rawMin + (rawMax - rawMin) * (i / gridCount);
      return {val, y: yScale(val)};
    });

    // Build polyline points
    const toPolyline = (pts) => pts.map(p => `${p.x},${p.y}`).join(" ");

    // EPS * PE orange "justified price" line (historical)
    const epsLinePts = validHist
      .map(d => n(d.val) != null ? {x: xScale(d.y), y: yScale(Math.max(d.val * fgPE, rawMin))} : null)
      .filter(Boolean);

    // EPS area below orange line (green shaded)
    const epsAreaPts = [
      ...epsLinePts,
      {x: xScale(validHist[validHist.length - 1]?.y || minY), y: yScale(rawMin)},
      {x: xScale(validHist[0]?.y || minY), y: yScale(rawMin)},
    ];

    // Projection justified price line (blue dashed)
    const projLinePts = projData
      .filter(d => n(d.val) != null)
      .map(d => ({x: xScale(d.y), y: yScale(Math.max(d.val * fgPE, rawMin))}));
    // Connect from last hist point
    const projConnectPt = epsLinePts.length ? epsLinePts[epsLinePts.length - 1] : null;
    const projFullLine = projConnectPt ? [projConnectPt, ...projLinePts] : projLinePts;

    // Projection area (blue shaded)
    const projAreaPts = projLinePts.length ? [
      projConnectPt || projLinePts[0],
      ...projLinePts,
      {x: xScale(projData[projData.length - 1]?.y || maxY), y: yScale(rawMin)},
      {x: xScale(lastHistY), y: yScale(rawMin)},
    ] : [];

    // Dividend stacked area (gold)
    const divLinePts = showDiv ? validHist
      .map(d => n(d.val) != null ? {x: xScale(d.y), y: yScale(Math.max((d.val + (d.div || 0)) * fgPE, rawMin))} : null)
      .filter(Boolean) : [];

    // Price line (black/white)
    // We place the current price as a dot at the last historical year
    const currentPriceY = cfg.price > 0 ? yScale(cfg.price) : null;
    const currentPriceX = validHist.length ? xScale(validHist[validHist.length - 1].y) : null;

    // P/E implied by current price vs latest EPS
    const latestEPS = getMetric(validHist[validHist.length - 1]?.y);
    const impliedPE = (latestEPS > 0 && cfg.price > 0) ? cfg.price / latestEPS : null;
    const fairPrice = latestEPS > 0 ? latestEPS * fgPE : null;
    const mosVsFair = (fairPrice && cfg.price > 0) ? 1 - cfg.price / fairPrice : null;
    const futureEPS = lastVal > 0 ? lastVal * Math.pow(1 + fgGrowth / 100, fgProjYears) : null;
    const futurePrice = futureEPS ? futureEPS * fgPE : null;
    const futureReturn = (futurePrice && cfg.price > 0) ? Math.pow(futurePrice / cfg.price, 1 / fgProjYears) - 1 : null;

    const modeBtn = (id, label) => (
      <button onClick={() => setFgMode(id)} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${fgMode===id?"var(--gold)":"var(--border)"}`,background:fgMode===id?"var(--gold-dim)":"transparent",color:fgMode===id?"var(--gold)":"var(--text-secondary)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .2s"}}>
        {label}
      </button>
    );

    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:12}}>
          <div>
            <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📊 FastGraphs — Precio vs Valor</h2>
            <p style={{margin:0,fontSize:12,color:"var(--text-secondary)"}}>Línea naranja = EPS × P/E Normal. Zona verde = histórico. Zona azul = proyección. Punto blanco = precio actual.</p>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {modeBtn("eps","EPS")}
            {modeBtn("fcf","FCF/Acc")}
            {modeBtn("ocf","OCF/Acc")}
            <button onClick={() => setShowDiv(!showDiv)} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${showDiv?"var(--gold)":"var(--border)"}`,background:showDiv?"rgba(255,214,10,.08)":"transparent",color:showDiv?"#ffd60a":"var(--text-secondary)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
              +Div
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:16}}>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
            <div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:6}}>P/E Normal</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="range" min={5} max={50} step={0.5} value={fgPE} onChange={e=>setFgPE(parseFloat(e.target.value))} style={{flex:1,accentColor:"var(--gold)"}}/>
              <span style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",minWidth:36}}>{fgPE}x</span>
            </div>
          </div>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
            <div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:6}}>Crecimiento Proy.</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="range" min={0} max={30} step={0.5} value={fgGrowth} onChange={e=>setFgGrowth(parseFloat(e.target.value))} style={{flex:1,accentColor:"#64d2ff"}}/>
              <span style={{fontSize:16,fontWeight:700,color:"#64d2ff",fontFamily:"var(--fm)",minWidth:42}}>{fgGrowth}%</span>
            </div>
          </div>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
            <div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:6}}>Años Proyectados</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="range" min={1} max={10} step={1} value={fgProjYears} onChange={e=>setFgProjYears(parseInt(e.target.value, 10))} style={{flex:1,accentColor:"#bf5af2"}}/>
              <span style={{fontSize:16,fontWeight:700,color:"#bf5af2",fontFamily:"var(--fm)",minWidth:36}}>{fgProjYears}a</span>
            </div>
          </div>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
            <div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5}}>EPS / FCF Actual</div>
            <div style={{fontSize:22,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{fC(latestEPS)}</div>
          </div>
        </div>

        {/* The FastGraphs chart */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:20,overflowX:"auto"}}>
          <svg width={W} height={H} style={{display:"block",minWidth:520}}>
            <defs>
              <linearGradient id="epsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#30d158" stopOpacity="0.25"/>
                <stop offset="100%" stopColor="#30d158" stopOpacity="0.04"/>
              </linearGradient>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#64d2ff" stopOpacity="0.20"/>
                <stop offset="100%" stopColor="#64d2ff" stopOpacity="0.03"/>
              </linearGradient>
              <linearGradient id="divGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffd60a" stopOpacity="0.15"/>
                <stop offset="100%" stopColor="#ffd60a" stopOpacity="0"/>
              </linearGradient>
            </defs>

            {/* Background */}
            <rect x={PADL} y={PADT} width={chartW} height={chartH} fill="var(--chart-bg)" rx={4}/>

            {/* Grid lines */}
            {gridLines.map((g, i) => (
              <g key={i}>
                <line x1={PADL} y1={g.y} x2={PADL + chartW} y2={g.y} stroke="var(--subtle-border)" strokeWidth={1}/>
                <text x={PADL - 6} y={g.y + 4} textAnchor="end" fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">${yNice(g.val)}</text>
              </g>
            ))}

            {/* Vertical year lines */}
            {allYears.filter((y, i) => i % 2 === 0).map(y => (
              <g key={y}>
                <line x1={xScale(y)} y1={PADT} x2={xScale(y)} y2={PADT + chartH} stroke="var(--subtle-border)" strokeWidth={1}/>
                <text x={xScale(y)} y={PADT + chartH + 16} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">{y}</text>
              </g>
            ))}

            {/* Separator: hist vs projection */}
            {validHist.length > 0 && (
              <line x1={xScale(lastHistY)} y1={PADT} x2={xScale(lastHistY)} y2={PADT + chartH} stroke="var(--border-hover)" strokeWidth={1} strokeDasharray="4,4"/>
            )}

            {/* EPS area (green) */}
            {epsAreaPts.length > 2 && (
              <polygon points={toPolyline(epsAreaPts)} fill="url(#epsGrad)"/>
            )}

            {/* Dividend stacked area (gold) */}
            {showDiv && divLinePts.length > 1 && (() => {
              const divArea = [
                ...divLinePts,
                ...epsLinePts.slice().reverse(),
              ];
              return <polygon points={toPolyline(divArea)} fill="url(#divGrad)"/>;
            })()}

            {/* Projection area (blue) */}
            {projAreaPts.length > 2 && (
              <polygon points={toPolyline(projAreaPts)} fill="url(#projGrad)"/>
            )}

            {/* EPS × PE line (orange) — historical */}
            {epsLinePts.length > 1 && (
              <polyline points={toPolyline(epsLinePts)} fill="none" stroke="#ff9f0a" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
            )}

            {/* Dividend adjusted line (gold dashed) */}
            {showDiv && divLinePts.length > 1 && (
              <polyline points={toPolyline(divLinePts)} fill="none" stroke="#ffd60a" strokeWidth={1.5} strokeDasharray="4,3" strokeLinejoin="round"/>
            )}

            {/* Projection justified price line (blue) */}
            {projFullLine.length > 1 && (
              <polyline points={toPolyline(projFullLine)} fill="none" stroke="#64d2ff" strokeWidth={2} strokeDasharray="6,3" strokeLinejoin="round" strokeLinecap="round"/>
            )}

            {/* EPS dots */}
            {epsLinePts.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={3} fill="#ff9f0a"/>
            ))}

            {/* Projected EPS dots */}
            {projLinePts.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={3} fill="#64d2ff" strokeWidth={1.5} stroke="var(--chart-bg)"/>
            ))}

            {/* Current price — horizontal dashed line across chart */}
            {currentPriceY != null && (
              <>
                <line x1={PADL} y1={currentPriceY} x2={PADL + chartW} y2={currentPriceY} stroke="var(--text-secondary)" strokeWidth={1} strokeDasharray="2,4"/>
                {/* Price dot at last hist year */}
                <circle cx={currentPriceX} cy={currentPriceY} r={6} fill="var(--text-primary)" stroke="var(--bg)" strokeWidth={2}/>
                <text x={currentPriceX + 10} y={currentPriceY + 4} fontSize={10} fill="var(--text-primary)" fontFamily="monospace" fontWeight="bold">{fC(cfg.price)}</text>
              </>
            )}

            {/* Labels */}
            <text x={PADL + 8} y={PADT + 16} fontSize={9} fill="#ff9f0a" fontFamily="monospace">● {fgMode.toUpperCase()} × {fgPE}x P/E = Valor Justo</text>
            {projLinePts.length > 0 && <text x={PADL + 8} y={PADT + 30} fontSize={9} fill="#64d2ff" fontFamily="monospace">-- Proyección +{fgGrowth}%/año</text>}
            {showDiv && <text x={PADL + 8} y={PADT + 44} fontSize={9} fill="#ffd60a" fontFamily="monospace">-- + Dividendo</text>}
          </svg>
        </div>

        {/* KPIs Row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:12,marginTop:16}}>
          {[
            {l:"P/E Actual vs Normal",v:`${fC(impliedPE,"" )}x vs ${fgPE}x`,c:impliedPE!=null?(impliedPE<fgPE?"var(--green)":"var(--red)"):"var(--text-tertiary)"},
            {l:"Precio Justo (EPS×PE)",v:fC(fairPrice),c:"var(--gold)"},
            {l:"MOS vs Precio Justo",v:fP(mosVsFair),c:mosVsFair!=null?(mosVsFair>0.15?"var(--green)":mosVsFair>0?"var(--yellow)":"var(--red)"):"var(--text-tertiary)"},
            {l:`EPS Proyectado (${fgProjYears}a)`,v:fC(futureEPS),c:"#64d2ff"},
            {l:`Precio Justo Futuro`,v:fC(futurePrice),c:"#64d2ff"},
            {l:`Retorno Anual Implícito`,v:fP(futureReturn),c:futureReturn!=null?(futureReturn>0.10?"var(--green)":futureReturn>0.05?"var(--yellow)":"var(--red)"):"var(--text-tertiary)"},
          ].map((m,i)=>(
            <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px"}}>
              <div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5}}>{m.l}</div>
              <div style={{fontSize:20,fontWeight:700,color:m.c||"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{m.v||"—"}</div>
            </div>
          ))}
        </div>

        {/* EPS history table */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:0,marginTop:16,overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>AÑO</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>{fgMode.toUpperCase()}/ACC</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>DIV/ACC</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>VALOR JUSTO (×PE)</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>+DIV (×PE)</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>CRECIM YoY</th>
              <th style={{padding:"10px 10px",textAlign:"center",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid #30363d",fontFamily:"var(--fm)",fontSize:10}}>PROYECTADO</th>
            </tr></thead>
            <tbody>
              {[...validHist, ...projData.map(d=>({...d,div:0}))].map((d,i,arr)=>{
                const prev = arr[i-1];
                const yoy = (prev && n(prev.val) && n(d.val) && prev.val !== 0) ? (d.val - prev.val) / Math.abs(prev.val) : null;
                const fair = n(d.val) ? d.val * fgPE : null;
                const fairDiv = n(d.val) ? (d.val + (d.div||0)) * fgPE : null;
                const isProj = d.projected;
                return (
                  <tr key={d.y} style={{background:isProj?"rgba(100,210,255,.03)":i%2?"var(--row-alt)":"transparent"}}>
                    <td style={{padding:"7px 14px",color:isProj?"#64d2ff":"var(--text-primary)",fontWeight:isProj?600:400,borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{d.y}{isProj?" ★":""}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:n(d.val)&&d.val<0?"var(--red)":"var(--orange)",fontWeight:600,borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fC(d.val)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:"#ffd60a",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{n(d.div)&&d.div>0?fC(d.div):"—"}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:n(fair)&&cfg.price&&fair<cfg.price?"var(--red)":"var(--green)",fontWeight:600,borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fC(fair)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:"#ffd60a",borderBottom:"1px solid #21262d",fontFamily:"var(--fm)"}}>{fC(fairDiv)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:n(yoy)?yoy>=0?"var(--green)":"var(--red)":"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid #21262d"}}>{n(yoy)?fP(yoy):"—"}</td>
                    <td style={{padding:"7px 10px",textAlign:"center",borderBottom:"1px solid #21262d"}}>{isProj?<span style={{fontSize:9,fontWeight:600,color:"#64d2ff",fontFamily:"var(--fm)",letterSpacing:.5}}>PROY</span>:"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)",borderRadius:20,padding:20,marginTop:16}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:8,fontFamily:"var(--fd)"}}>📖 Cómo leer el FastGraphs</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.8}}>
            <div>
              <strong style={{color:"#ff9f0a"}}>Línea naranja</strong> — EPS (o FCF) × P/E normal. Es el "precio justo" histórico. Si el precio está POR DEBAJO de esta línea, la empresa está barata.<br/><br/>
              <strong style={{color:"#30d158"}}>Zona verde</strong> — área bajo la línea naranja. Representa el EPS acumulado que la empresa genera. Cuanto más grande, mejor negocio.
            </div>
            <div>
              <strong style={{color:"#64d2ff"}}>Línea azul discontinua</strong> — precio justo PROYECTADO con el crecimiento estimado. Es el retorno esperado si el mercado sigue el P/E normal.<br/><br/>
              <strong style={{color:"white"}}>Punto blanco</strong> — precio actual. Si está bajo la naranja → compra. Si está sobre la naranja → la acción está cara respecto a sus fundamentales.
            </div>
          </div>
        </div>
      </div>
    );
}
