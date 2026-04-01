import { useState } from "react";
import { rate } from '../../utils/ratings.js';

const Badge = ({val,rules,showTip}) => {
  const r = rate(val,rules);
  const [hover,setHover] = useState(false);
  return (
    <span style={{position:"relative",display:"inline-flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:100,fontSize:11,fontWeight:600,color:r.c,background:`${r.c}11`,cursor:r.tip?"help":"default",letterSpacing:.2,fontFamily:"var(--fb)",transition:"all .2s"}}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      <span style={{width:5,height:5,borderRadius:"50%",background:r.c,boxShadow:`0 0 6px ${r.c}40`}}/>
      {r.lbl}
      {hover && r.tip && showTip!==false && (
        <span style={{position:"absolute",bottom:"calc(100% + 10px)",left:"50%",transform:"translateX(-50%)",background:"var(--surface)",border:"1px solid var(--border-hover)",borderRadius:14,padding:"10px 14px",fontSize:12,color:"#86868b",width:240,lineHeight:1.6,zIndex:99,boxShadow:"0 12px 40px rgba(0,0,0,.6)",pointerEvents:"none",fontFamily:"var(--fb)",fontWeight:400}}>
          {r.tip}
        </span>
      )}
    </span>
  );
};

export default Badge;
