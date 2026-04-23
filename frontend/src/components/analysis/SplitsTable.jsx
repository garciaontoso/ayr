// SplitsTable — histórico de stock splits + dividend splits.
// Compacto, collapse-able. Input: splits array de /api/fg-history.
export default function SplitsTable({ splits }) {
  if (!Array.isArray(splits) || !splits.length) return null;
  const sorted = [...splits].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
        <h3 style={{margin:0,fontSize:13,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fd)'}}>✂ Splits históricos</h3>
        <span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)'}}>{sorted.length} eventos</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:6}}>
        {sorted.map((s, i) => (
          <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'4px 8px',background:'var(--subtle-border, rgba(255,255,255,0.02))',border:'1px solid var(--border)',borderRadius:6,fontSize:10,fontFamily:'var(--fm)'}}>
            <span style={{color:'var(--text-secondary)'}}>{s.date}</span>
            <span style={{color:'var(--gold)',fontWeight:700}}>{s.ratio || `${s.numerator}:${s.denominator}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
