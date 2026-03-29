import { useState } from "react";

const Tooltip = ({text, children}) => {
  const [show,setShow] = useState(false);
  return (
    <span style={{position:"relative",cursor:"help"}} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show && <span style={{position:"absolute",bottom:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",background:"#1c1c1e",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:"10px 14px",fontSize:12,color:"var(--text-secondary)",width:240,lineHeight:1.6,zIndex:99,boxShadow:"0 12px 40px rgba(0,0,0,.7)",whiteSpace:"normal",fontFamily:"var(--fb)"}}>{text}</span>}
    </span>
  );
};

export default Tooltip;
