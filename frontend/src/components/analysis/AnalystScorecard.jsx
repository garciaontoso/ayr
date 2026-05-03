// AnalystScorecard — visualiza la exactitud histórica del consenso de analistas.
// Input: earnings_scorecard de /api/fg-history (40 quarters de EPS estimado vs actual).
// Rendereo: stat tiles (beats/misses/beat-rate/avg surprise) + barras quarter-a-quarter
// con color rojo/verde según sorpresa, hover tooltip con fecha/est/act.
import { fP, fC } from '../../utils/formatters';

export default function AnalystScorecard({ scorecard }) {
  if (!scorecard || !scorecard.quarters?.length) {
    return (
      <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
        <div style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',padding:14}}>Sin datos de earnings scorecard</div>
      </div>
    );
  }

  const { quarters, beats, misses, beat_rate, avg_surprise_pct, avg_abs_err_pct, margin_1y_pct, margin_2y_pct } = scorecard;
  // Orden cronológico para el chart (FMP devuelve newest-first)
  const chron = [...quarters].reverse();
  const maxAbs = Math.max(...chron.map(q => Math.abs(q.surprise_pct || 0)), 10);

  // Bar chart dims
  const W = 640, H = 170, PADL = 40, PADR = 16, PADT = 10, PADB = 28;
  const chartW = W - PADL - PADR, chartH = H - PADT - PADB;
  const barW = Math.max(chartW / chron.length - 2, 3);
  const zeroY = PADT + chartH / 2;
  const yScale = (s) => zeroY - (s / maxAbs) * (chartH / 2);

  const color = (q) => q.surprise_pct == null ? 'var(--text-tertiary)' : q.surprise_pct >= 0 ? '#30d158' : '#ff453a';

  return (
    <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10,flexWrap:'wrap',gap:8}}>
        <div>
          <h3 style={{margin:0,fontSize:13,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fd)'}}>📊 Analyst Scorecard</h3>
          <div style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginTop:2}}>
            EPS estimado vs real · últimos {chron.length} trimestres · fuente FMP
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(96px,1fr))',gap:6,marginBottom:12}}>
        <Stat label="Beat rate" value={beat_rate != null ? `${beat_rate}%` : '—'} color={beat_rate == null ? 'var(--text-tertiary)' : beat_rate >= 75 ? '#30d158' : beat_rate >= 60 ? 'var(--gold)' : '#ff9f0a'}/>
        <Stat label="Beats" value={beats ?? '—'} color="#30d158"/>
        <Stat label="Misses" value={misses ?? '—'} color="#ff453a"/>
        <Stat label="Avg sorpresa" value={avg_surprise_pct != null ? `${avg_surprise_pct > 0 ? '+' : ''}${avg_surprise_pct}%` : '—'} color={avg_surprise_pct >= 0 ? '#30d158' : '#ff453a'}/>
        <Stat label="Error medio |%|" value={avg_abs_err_pct != null ? `${avg_abs_err_pct}%` : '—'}/>
        <Stat label="Cono 1Y" value={margin_1y_pct != null ? `±${margin_1y_pct}%` : '—'} color="#64d2ff"/>
        <Stat label="Cono 2Y" value={margin_2y_pct != null ? `±${margin_2y_pct}%` : '—'} color="#bf5af2"/>
      </div>

      {/* Barras trimestrales */}
      <svg width={W} height={H} style={{display:'block',maxWidth:'100%'}}>
        {/* Grid lines + y ticks */}
        <line x1={PADL} y1={zeroY} x2={W-PADR} y2={zeroY} stroke="var(--border-hover, rgba(255,255,255,0.15))" strokeWidth={1}/>
        {[maxAbs, maxAbs/2, 0, -maxAbs/2, -maxAbs].map((v, i) => (
          <g key={i}>
            <line x1={PADL} y1={yScale(v)} x2={W-PADR} y2={yScale(v)} stroke="var(--subtle-border, rgba(255,255,255,0.04))" strokeDasharray={v === 0 ? 'none' : '2,2'}/>
            <text x={PADL-4} y={yScale(v)+3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">{(v > 0 ? '+' : '')}{v.toFixed(0)}%</text>
          </g>
        ))}

        {chron.map((q, i) => {
          const cx = PADL + i * (chartW / chron.length) + (chartW / chron.length) / 2;
          const yTop = yScale(Math.max(q.surprise_pct || 0, 0));
          const yBot = yScale(Math.min(q.surprise_pct || 0, 0));
          const h = yBot - yTop;
          return (
            <g key={q.date}>
              <title>{q.date} · Est ${q.eps_est?.toFixed(2)} · Act ${q.eps_act?.toFixed(2)} · {q.surprise_pct >= 0 ? '+' : ''}{q.surprise_pct?.toFixed(1)}%</title>
              <rect x={cx - barW/2} y={yTop} width={barW} height={Math.max(h, 1)} fill={color(q)} rx={1}/>
            </g>
          );
        })}

        {/* x axis labels — every ~4th quarter */}
        {chron.filter((_, i) => i % Math.ceil(chron.length / 6) === 0).map(q => {
          const i = chron.indexOf(q);
          const cx = PADL + i * (chartW / chron.length) + (chartW / chron.length) / 2;
          return <text key={q.date} x={cx} y={H-10} textAnchor="middle" fontSize={8} fill="var(--text-tertiary)" fontFamily="monospace">{q.date.slice(0, 7)}</text>;
        })}
      </svg>

      {/* Ultimas filas — tabla */}
      <details style={{marginTop:10}}>
        <summary style={{cursor:'pointer',fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.3,textTransform:'uppercase'}}>Ver tabla completa</summary>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:9,fontFamily:'var(--fm)',marginTop:6}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)',color:'var(--text-tertiary)'}}>
              <th style={{textAlign:'left',padding:'3px 4px'}}>Fecha</th>
              <th style={{textAlign:'right',padding:'3px 4px'}}>EPS est.</th>
              <th style={{textAlign:'right',padding:'3px 4px'}}>EPS real</th>
              <th style={{textAlign:'right',padding:'3px 4px'}}>Sorpresa</th>
            </tr>
          </thead>
          <tbody>
            {quarters.slice(0, 20).map(q => (
              <tr key={q.date} style={{borderBottom:'1px solid var(--subtle-border, rgba(255,255,255,0.03))'}}>
                <td style={{padding:'3px 4px',color:'var(--text-secondary)'}}>{q.date}</td>
                <td style={{padding:'3px 4px',textAlign:'right'}}>{fC(q.eps_est)}</td>
                <td style={{padding:'3px 4px',textAlign:'right'}}>{fC(q.eps_act)}</td>
                <td style={{padding:'3px 4px',textAlign:'right',color:color(q),fontWeight:700}}>
                  {q.surprise_pct != null ? `${q.surprise_pct > 0 ? '+' : ''}${q.surprise_pct.toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{background:'var(--subtle-border, rgba(255,255,255,0.02))',border:'1px solid var(--border)',borderRadius:8,padding:'6px 8px',textAlign:'center'}}>
      <div style={{fontSize:8,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.3,textTransform:'uppercase',marginBottom:2}}>{label}</div>
      <div style={{fontSize:14,fontWeight:700,color:color || 'var(--text-primary)',fontFamily:'var(--fm)'}}>{value}</div>
    </div>
  );
}
