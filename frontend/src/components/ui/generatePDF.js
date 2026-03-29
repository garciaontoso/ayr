async function generatePDF(cfg, fin, comp, dcf, piotroski, scoreItems, totalScore, wacc, setTab, TABS, content, setBtnState) {
  // Simply switch to the built-in "report" tab — renders all tabs inline
  setTab('report');
  setBtnState('done');
  setTimeout(() => setBtnState('idle'), 1500);
}

export default generatePDF;
