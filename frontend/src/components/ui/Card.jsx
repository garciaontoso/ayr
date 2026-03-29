const Card = ({children, style, glow, title, icon, badge}) => (
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:24,position:"relative",overflow:"hidden",transition:"border-color .3s,background .3s",...(glow?{background:"var(--card)",border:"1px solid rgba(200,164,78,.12)",boxShadow:"0 0 60px var(--gold-glow)"}:{}),...style}}
    onMouseEnter={e=>{if(!glow){e.currentTarget.style.borderColor="var(--border-hover)";e.currentTarget.style.background="var(--card-hover)";}}}
    onMouseLeave={e=>{if(!glow){e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--card)";}}}>
    {glow && <div style={{position:"absolute",top:0,left:"20%",right:"20%",height:1,background:"linear-gradient(90deg,transparent,var(--gold),transparent)",opacity:.2}}/>}
    {title && <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
      <h3 style={{margin:0,fontSize:15,fontWeight:600,color:"var(--text-primary)",display:"flex",alignItems:"center",gap:8,fontFamily:"var(--fb)",letterSpacing:-.2}}>{icon && <span style={{fontSize:13,opacity:.5}}>{icon}</span>} {title}</h3>
      {badge}
    </div>}
    {children}
  </div>
);

export default Card;
