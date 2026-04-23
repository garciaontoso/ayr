// FGScoresPanel — 5-pilares tipo FG Scores.
// Cada pilar 0-100 + overall. Usa radar SVG + barras para comparación rápida.
// Input: fg_scores de /api/fg-history (Profitability / Cash Flow / Financial Strength / Growth / Predictability).

const PILLARS = [
  { id: 'profitability',        lbl: 'Rentabilidad',    ico: '💰', tip: 'ROE + ROIC + margen operativo' },
  { id: 'cash_flow',            lbl: 'Generación FCF',  ico: '💵', tip: 'FCF yield + conversión OCF/NI' },
  { id: 'financial_strength',   lbl: 'Solidez fin.',    ico: '🛡', tip: 'Debt/Equity inv + current + interest cov' },
  { id: 'growth',               lbl: 'Crecimiento',     ico: '📈', tip: 'CAGR EPS 5y + 10y' },
  { id: 'predictability',       lbl: 'Predecibilidad',  ico: '🎯', tip: '100 − error medio de analistas · alto = resultados consistentes' },
];

const scoreColor = (s) => {
  if (s == null) return 'var(--text-tertiary)';
  if (s >= 80) return '#30d158';
  if (s >= 65) return 'var(--gold)';
  if (s >= 50) return '#ff9f0a';
  return '#ff453a';
};

export default function FGScoresPanel({ scores }) {
  if (!scores) return null;

  // Radar chart — pentagon with 5 pillars
  const W = 240, H = 240;
  const cx = W/2, cy = H/2, R = 90;
  const angle = (i) => (Math.PI * 2 * i / 5) - Math.PI/2;
  const pointAt = (score, i) => ({
    x: cx + Math.cos(angle(i)) * R * (score / 100),
    y: cy + Math.sin(angle(i)) * R * (score / 100),
  });

  const radarPts = PILLARS.map((p, i) => pointAt(scores[p.id] ?? 0, i));
  const radarPoly = radarPts.map(p => `${p.x},${p.y}`).join(' ');

  // Guide pentagons at 25/50/75/100
  const guideAt = (pct) => PILLARS.map((_, i) => {
    const a = angle(i);
    return `${cx + Math.cos(a) * R * pct},${cy + Math.sin(a) * R * pct}`;
  }).join(' ');

  return (
    <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
        <div>
          <h3 style={{margin:0,fontSize:13,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fd)'}}>🎯 Scores 5-pilares</h3>
          <div style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginTop:2}}>Compuestos 0-100 · cada pilar pondera 20% del overall</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',textTransform:'uppercase',letterSpacing:.3}}>Overall</div>
          <div style={{fontSize:32,fontWeight:800,color:scoreColor(scores.overall),fontFamily:'var(--fm)',lineHeight:1}}>{scores.overall ?? '—'}</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:14,alignItems:'center'}}>
        {/* Radar */}
        <svg width={W} height={H} style={{display:'block'}}>
          {/* guide pentagons */}
          {[0.25, 0.5, 0.75, 1].map(p => (
            <polygon key={p} points={guideAt(p)} fill="none" stroke="var(--subtle-border, rgba(255,255,255,0.05))" strokeWidth={1}/>
          ))}
          {/* axis lines */}
          {PILLARS.map((_, i) => {
            const a = angle(i);
            return <line key={i} x1={cx} y1={cy} x2={cx+Math.cos(a)*R} y2={cy+Math.sin(a)*R} stroke="var(--subtle-border, rgba(255,255,255,0.05))"/>;
          })}
          {/* radar value */}
          <polygon points={radarPoly} fill="var(--gold)" fillOpacity={0.2} stroke="var(--gold)" strokeWidth={1.5}/>
          {radarPts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={scoreColor(scores[PILLARS[i].id])}/>)}
          {/* labels */}
          {PILLARS.map((p, i) => {
            const a = angle(i);
            const tx = cx + Math.cos(a) * (R + 16);
            const ty = cy + Math.sin(a) * (R + 16);
            return (
              <text key={p.id} x={tx} y={ty} textAnchor="middle" fontSize={9} fill="var(--text-secondary)" fontFamily="monospace">{p.ico} {p.lbl.split(' ')[0].slice(0,8)}</text>
            );
          })}
        </svg>

        {/* Bars list */}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {PILLARS.map(p => {
            const s = scores[p.id];
            return (
              <div key={p.id} title={p.tip}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontFamily:'var(--fm)',marginBottom:2}}>
                  <span style={{color:'var(--text-secondary)'}}>{p.ico} {p.lbl}</span>
                  <span style={{fontWeight:700,color:scoreColor(s)}}>{s ?? '—'}</span>
                </div>
                <div style={{height:6,background:'var(--subtle-border, rgba(255,255,255,0.06))',borderRadius:3,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${s ?? 0}%`,background:scoreColor(s),borderRadius:3,transition:'width .3s'}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
