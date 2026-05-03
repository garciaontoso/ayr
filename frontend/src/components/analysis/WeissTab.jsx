import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { _sf, n as _n, div as _div } from '../../utils/formatters';
import { YEARS } from '../../constants/index.js';

export default function WeissTab() {
  const { L, LD, cfg, fin, fmpExtra, _marketCap } = useAnalysis();
    // Historical data: DPS, price proxied from EPS × PE, and yield
    const histYrs = YEARS.slice(0, 15).reverse().filter(y => fin[y]?.dps > 0);
    if (histYrs.length < 3) return (
      <Card><div style={{textAlign:"center",padding:48,color:"var(--text-tertiary)"}}><div style={{fontSize:48,marginBottom:16}}>📊</div>Necesita mínimo 3 años con dividendo para calcular las bandas de Weiss.</div></Card>
    );

    // Calculate historical yields using FMP keyMetrics (dividendYield + marketCap)
    const yieldData = histYrs.map(y => {
      const dps = fin[y]?.dps || 0;
      const shares = fin[y]?.sharesOut || 0; // In millions (app stores M=v/1e6)
      if (dps <= 0) return null;

      const fmpKm = fmpExtra.keyMetrics?.find(km => km.date?.startsWith(String(y)));

      // Strategy 1: Use FMP dividendYield directly (most accurate — avoids marketCap/shares rounding)
      const fmpYield = fmpKm?.dividendYield > 0 ? fmpKm.dividendYield : 0;

      // Strategy 2: Fallback — compute from marketCap if dividendYield not available
      const priceFromMC = (shares > 0 && fmpKm?.marketCap > 0) ? fmpKm.marketCap / (shares * 1e6) : 0;
      const calcYield = priceFromMC > 0 ? dps / priceFromMC : 0;

      const yld = fmpYield > 0 ? fmpYield : calcYield;
      // Derive price estimate from yield (more accurate when using FMP yield)
      const priceEst = yld > 0 && dps > 0 ? dps / yld : priceFromMC;

      return { y, dps, priceEst, yld };
    }).filter(d => d != null && d.yld > 0.005 && d.yld < 0.25); // Filter unreasonable (0.5%–25%)

    if (yieldData.length < 3) return (
      <Card><div style={{textAlign:"center",padding:48,color:"var(--text-tertiary)"}}><div style={{fontSize:48,marginBottom:16}}>📊</div>Datos insuficientes para las bandas de yield.</div></Card>
    );

    // Yield statistics
    const yields = yieldData.map(d => d.yld);
    const yieldAvg = yields.reduce((a,b) => a+b, 0) / yields.length;
    const yieldMax = Math.max(...yields);
    const _yieldMin = Math.min(...yields);
    const yieldMedian = [...yields].sort((a,b) => a-b)[Math.floor(yields.length/2)];
    
    // Current yield
    const currentDPS = LD.dps || fin[histYrs[histYrs.length-1]]?.dps || 0;
    const currentYield = cfg.price > 0 && currentDPS > 0 ? currentDPS / cfg.price : 0;
    
    // Define yield bands (using historical percentiles)
    const sortedYields = [...yields].sort((a,b) => a-b);
    const pct = p => sortedYields[Math.min(Math.floor(sortedYields.length * p), sortedYields.length-1)];
    const yieldHigh = Math.max(pct(0.85), yieldAvg * 1.3); // Overvalued threshold (low yield = high price)
    const yieldLow = Math.min(pct(0.15), yieldAvg * 0.7);   // Undervalued threshold (high yield = low price)
    
    // Price bands based on current DPS and yield thresholds
    const priceBands = {
      overvalued: currentDPS > 0 ? currentDPS / yieldLow : 0,    // Low yield → high price → overvalued
      fairHigh: currentDPS > 0 ? currentDPS / yieldAvg : 0,
      fairLow: currentDPS > 0 ? currentDPS / yieldMedian : 0,
      undervalued: currentDPS > 0 ? currentDPS / yieldHigh : 0,   // High yield → low price → undervalued
    };

    // Weiss verdict
    const weissZone = currentYield >= yieldHigh ? "UNDERVALUED" : currentYield >= yieldMedian ? "FAIR VALUE" : currentYield >= yieldLow ? "FAIR-HIGH" : "OVERVALUED";
    const weissColor = weissZone === "UNDERVALUED" ? "#30d158" : weissZone === "FAIR VALUE" ? "#ffd60a" : weissZone === "FAIR-HIGH" ? "#ff9f0a" : "#ff453a";

    // Chart: Yield over time + bands
    const W = 860, H = 380, PADL = 62, PADR = 24, PADT = 24, PADB = 48;
    const chartW = W - PADL - PADR, chartH = H - PADT - PADB;
    const allYears = yieldData.map(d => d.y);
    const minY = allYears[0], maxY = allYears[allYears.length - 1] + 1;
    const xScale = y => PADL + ((y - minY) / (maxY - minY || 1)) * chartW;
    const yMax = Math.max(yieldMax, currentYield, yieldHigh) * 1.2;
    const yMin2 = 0;
    const yScale = v => PADT + chartH - ((v - yMin2) / (yMax - yMin2 || 0.01)) * chartH;

    // Yield line path
    const yieldPath = yieldData.map((d, i) => `${i===0?"M":"L"}${xScale(d.y)},${yScale(d.yld)}`).join(" ");
    // DPS bars
    const dpsVals = yieldData.map(d => d.dps);
    const dpsMax = dpsVals.length ? Math.max(...dpsVals) : 1;

    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📊 Geraldine Weiss — Dividend Value Strategy</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>
          "Dividends Don't Lie" — La empresa es barata cuando su dividend yield es alto vs su media histórica, y cara cuando es bajo.
        </p>

        {/* Verdict Banner */}
        <Card glow style={{borderColor:`${weissColor}33`,marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:20,alignItems:"center"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>YIELD ACTUAL</div>
              <div style={{fontSize:36,fontWeight:800,color:weissColor,fontFamily:"var(--fm)"}}>{_sf(currentYield*100,2)}%</div>
              <div style={{fontSize:10,color:"var(--text-secondary)"}}>DPS: ${_sf(currentDPS,2)} · Precio: ${_sf(cfg.price,2)}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
              <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(48,209,88,.06)",border:"1px solid rgba(48,209,88,.15)",textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>YIELD ALTO (BARATA)</div>
                <div style={{fontSize:16,fontWeight:700,color:"#30d158",fontFamily:"var(--fm)"}}>{_sf(yieldHigh*100,2)}%</div>
                <div style={{fontSize:9,color:"var(--text-secondary)"}}>Precio: ${_sf(priceBands.undervalued,0)}</div>
              </div>
              <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(255,214,10,.06)",border:"1px solid rgba(255,214,10,.15)",textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>YIELD MEDIO</div>
                <div style={{fontSize:16,fontWeight:700,color:"#ffd60a",fontFamily:"var(--fm)"}}>{_sf(yieldAvg*100,2)}%</div>
                <div style={{fontSize:9,color:"var(--text-secondary)"}}>Precio: ${_sf(priceBands.fairHigh,0)}</div>
              </div>
              <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(255,69,58,.06)",border:"1px solid rgba(255,69,58,.15)",textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>YIELD BAJO (CARA)</div>
                <div style={{fontSize:16,fontWeight:700,color:"#ff453a",fontFamily:"var(--fm)"}}>{_sf(yieldLow*100,2)}%</div>
                <div style={{fontSize:9,color:"var(--text-secondary)"}}>Precio: ${_sf(priceBands.overvalued,0)}</div>
              </div>
            </div>
            <div style={{textAlign:"center",padding:"12px 20px",borderRadius:12,background:`${weissColor}12`,border:`2px solid ${weissColor}44`}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>WEISS ZONA</div>
              <div style={{fontSize:18,fontWeight:800,color:weissColor,fontFamily:"var(--fm)"}}>{weissZone}</div>
            </div>
          </div>
        </Card>

        {/* Yield Over Time Chart */}
        <Card title="Dividend Yield Histórico con Bandas" icon="📉">
          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
            <defs>
              <linearGradient id="weissGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#30d158" stopOpacity={0.15}/><stop offset="100%" stopColor="#30d158" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="weissRed" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ff453a" stopOpacity={0.15}/><stop offset="100%" stopColor="#ff453a" stopOpacity={0}/>
              </linearGradient>
            </defs>

            <rect x={PADL} y={PADT} width={chartW} height={chartH} fill="var(--chart-bg)" rx={4}/>

            {/* Undervalued zone (high yield) — green */}
            <rect x={PADL} y={yScale(yMax)} width={chartW} height={yScale(yieldHigh)-yScale(yMax)} fill="url(#weissGreen)" opacity={0.6}/>
            {/* Overvalued zone (low yield) — red */}
            <rect x={PADL} y={yScale(yieldLow)} width={chartW} height={yScale(yMin2)-yScale(yieldLow)} fill="url(#weissRed)" opacity={0.6}/>

            {/* Band lines */}
            <line x1={PADL} y1={yScale(yieldHigh)} x2={PADL+chartW} y2={yScale(yieldHigh)} stroke="#30d158" strokeWidth={1.5} strokeDasharray="6,4"/>
            <line x1={PADL} y1={yScale(yieldAvg)} x2={PADL+chartW} y2={yScale(yieldAvg)} stroke="#ffd60a" strokeWidth={1.5} strokeDasharray="4,4"/>
            <line x1={PADL} y1={yScale(yieldLow)} x2={PADL+chartW} y2={yScale(yieldLow)} stroke="#ff453a" strokeWidth={1.5} strokeDasharray="6,4"/>

            {/* Band labels */}
            <text x={PADL+chartW+4} y={yScale(yieldHigh)+4} fontSize={8} fill="#30d158" fontFamily="monospace">Buy</text>
            <text x={PADL+chartW+4} y={yScale(yieldAvg)+4} fontSize={8} fill="#ffd60a" fontFamily="monospace">Fair</text>
            <text x={PADL+chartW+4} y={yScale(yieldLow)+4} fontSize={8} fill="#ff453a" fontFamily="monospace">Sell</text>

            {/* Grid lines */}
            {Array.from({length:6},(_, i) => {
              const v = yMin2 + (yMax - yMin2) * i / 5;
              return <g key={i}>
                <line x1={PADL} y1={yScale(v)} x2={PADL+chartW} y2={yScale(v)} stroke="var(--subtle-border)"/>
                <text x={PADL-6} y={yScale(v)+4} textAnchor="end" fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">{_sf(v*100,1)}%</text>
              </g>;
            })}

            {/* Year labels */}
            {allYears.filter((_,i)=>i%2===0).map(y => <text key={y} x={xScale(y)} y={PADT+chartH+16} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">{y}</text>)}

            {/* Yield line */}
            <path d={yieldPath} fill="none" stroke="#64d2ff" strokeWidth={2.5}/>
            {yieldData.map((d,i)=><circle key={i} cx={xScale(d.y)} cy={yScale(d.yld)} r={3.5} fill="#64d2ff" stroke="var(--bg)" strokeWidth={1.5}/>)}

            {/* Current yield marker */}
            <circle cx={xScale(maxY-0.5)} cy={yScale(currentYield)} r={7} fill={weissColor} stroke="var(--text-primary)" strokeWidth={2}/>
            <text x={xScale(maxY-0.5)} y={yScale(currentYield)-12} textAnchor="middle" fontSize={11} fill={weissColor} fontWeight={700} fontFamily="monospace">{_sf(currentYield*100,1)}%</text>
            <text x={xScale(maxY-0.5)} y={PADT+chartH+16} textAnchor="middle" fontSize={9} fill={weissColor} fontWeight={700} fontFamily="monospace">NOW</text>

            {/* DPS bars at bottom */}
            {yieldData.map((d,i) => {
              const barH = dpsMax > 0 ? (d.dps / dpsMax) * 30 : 0;
              return <g key={`dps${i}`}>
                <rect x={xScale(d.y)-6} y={PADT+chartH-barH} width={12} height={barH} fill="rgba(200,164,78,.3)" rx={1}/>
                <text x={xScale(d.y)} y={PADT+chartH-barH-4} textAnchor="middle" fontSize={7} fill="rgba(200,164,78,.6)" fontFamily="monospace">${_sf(d.dps,2)}</text>
              </g>;
            })}
          </svg>
        </Card>

        {/* DPS Growth + Yield History Table */}
        <Card title="Historial Completo" icon="📋" style={{marginTop:16,overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"var(--fm)"}}>
            <thead><tr style={{background:"rgba(200,164,78,.06)"}}>
              <th style={{padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontSize:10,fontWeight:700,borderBottom:"2px solid var(--table-border)"}}>AÑO</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"var(--gold)",fontSize:10,fontWeight:700,borderBottom:"2px solid var(--table-border)"}}>DPS</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"var(--gold)",fontSize:10,fontWeight:700,borderBottom:"2px solid var(--table-border)"}}>PRECIO EST.</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"var(--gold)",fontSize:10,fontWeight:700,borderBottom:"2px solid var(--table-border)"}}>CREC.</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"var(--gold)",fontSize:10,fontWeight:700,borderBottom:"2px solid var(--table-border)"}}>YIELD EST.</th>
              <th style={{padding:"10px 8px",textAlign:"right",color:"var(--gold)",fontSize:10,fontWeight:700,borderBottom:"2px solid var(--table-border)"}}>ZONA</th>
            </tr></thead>
            <tbody>{yieldData.map((d,i) => {
              const prevDps = i > 0 ? yieldData[i-1].dps : null;
              const growth = prevDps > 0 ? (d.dps / prevDps - 1) : null;
              const zone = d.yld >= yieldHigh ? "COMPRA" : d.yld >= yieldAvg ? "JUSTO" : "CARO";
              const zoneCol = d.yld >= yieldHigh ? "#30d158" : d.yld >= yieldAvg ? "#ffd60a" : "#ff453a";
              return <tr key={d.y} style={{borderBottom:"1px solid var(--table-border)"}}>
                <td style={{padding:"8px 14px",color:"var(--text-primary)",fontWeight:600}}>{d.y}</td>
                <td style={{padding:"8px",textAlign:"right",color:"var(--text-primary)"}}>${_sf(d.dps,2)}</td>
                <td style={{padding:"8px",textAlign:"right",color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{d.priceEst>0?`$${_sf(d.priceEst,0)}`:"—"}</td>
                <td style={{padding:"8px",textAlign:"right",color:growth!=null?(growth>0?"var(--green)":"var(--red)"):"var(--text-tertiary)"}}>{growth!=null?`${growth>0?"+":""}${_sf(growth*100,1)}%`:"—"}</td>
                <td style={{padding:"8px",textAlign:"right",color:"#64d2ff"}}>{_sf(d.yld*100,2)}%</td>
                <td style={{padding:"8px",textAlign:"right"}}><span style={{fontSize:9,fontWeight:700,color:zoneCol,background:`${zoneCol}15`,padding:"2px 8px",borderRadius:100}}>{zone}</span></td>
              </tr>;
            })}</tbody>
          </table>
        </Card>

        {/* Educational */}
        <div style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)",borderRadius:20,padding:20,marginTop:16}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:8,fontFamily:"var(--fd)"}}>📖 Método Geraldine Weiss — "Dividends Don't Lie"</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.8}}>
            <div>
              <strong style={{color:"#30d158"}}>Zona de Compra (yield alto)</strong> — Cuando el dividend yield es significativamente mayor que su media histórica, el mercado infravalora la empresa. El dividendo actúa como "suelo" del precio.<br/><br/>
              <strong style={{color:"#ffd60a"}}>Zona Fair Value</strong> — El yield está cerca de su media. Precio razonable para mantener posición.
            </div>
            <div>
              <strong style={{color:"#ff453a"}}>Zona de Venta (yield bajo)</strong> — Yield muy inferior a la media indica precio alto. Considerar tomar beneficios parciales.<br/><br/>
              <strong style={{color:"#64d2ff"}}>La clave</strong> — Solo funciona con empresas que llevan pagando dividendo estable/creciente muchos años. No usar con empresas que recortan dividendo.
            </div>
          </div>
        </div>
      </div>
    );
}
