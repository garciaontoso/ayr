const GaugeVerdict = ({score}) => {
  const verdict = score >= 75 ? {lbl:"COMPRAR",c:"var(--green)",emoji:"\u{1F7E2}",desc:"La empresa muestra fortaleza en la mayor\u00eda de m\u00e9tricas clave."}
    : score >= 50 ? {lbl:"MANTENER",c:"var(--yellow)",emoji:"\u{1F7E1}",desc:"Empresa aceptable pero con \u00e1reas de mejora. Vigilar evoluci\u00f3n."}
    : score >= 30 ? {lbl:"PRECAUCI\u00d3N",c:"var(--orange)",emoji:"\u{1F7E0}",desc:"Varias m\u00e9tricas en zona de riesgo. Analizar en profundidad."}
    : {lbl:"EVITAR",c:"var(--red)",emoji:"\u{1F534}",desc:"La empresa presenta debilidades significativas."};
  return (
    <div style={{textAlign:"center",padding:16}}>
      <div style={{fontSize:48,marginBottom:4}}>{verdict.emoji}</div>
      <div style={{fontSize:28,fontWeight:800,color:verdict.c,fontFamily:"var(--fd)",letterSpacing:2}}>{verdict.lbl}</div>
      <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:8,maxWidth:320,margin:"8px auto 0",lineHeight:1.6}}>{verdict.desc}</div>
    </div>
  );
};

export default GaugeVerdict;
