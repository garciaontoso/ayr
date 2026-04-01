import Tooltip from './Tooltip.jsx';

const Inp = ({label, value, onChange, type="number", step, suffix, w, placeholder, tip}) => (
  <div style={{display:"flex",flexDirection:"column",gap:4}}>
    <label style={{fontSize:10,color:"var(--text-tertiary)",fontWeight:500,letterSpacing:.5,textTransform:"uppercase",fontFamily:"var(--fb)",display:"flex",alignItems:"center",gap:4}}>
      {label}
      {tip && <Tooltip text={tip}><span style={{fontSize:10,opacity:.4}}>?</span></Tooltip>}
    </label>
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <input type={type} step={step} placeholder={placeholder} value={value===0&&type==="number"?"":value}
        onChange={e=>onChange(type==="number"?parseFloat(e.target.value)||0:e.target.value)}
        style={{width:w||"100%",padding:"7px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:10,color:"var(--text-primary)",fontSize:13,outline:"none",fontFamily:"var(--fm)",fontWeight:500,transition:"all .2s"}}
        onFocus={e=>{e.target.style.borderColor="var(--gold)";e.target.style.background="rgba(200,164,78,.04)";}}
        onBlur={e=>{e.target.style.borderColor="var(--border)";e.target.style.background="var(--subtle-bg)";}}/>
      {suffix && <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{suffix}</span>}
    </div>
  </div>
);

export default Inp;
