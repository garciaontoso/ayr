import { useAnalysis } from '../../context/AnalysisContext';

export default function ChartTab() {
  const { cfg } = useAnalysis();
    const symbol = cfg.ticker ? cfg.ticker.replace(":",".") : "AAPL";

    return (
      <div style={{margin:"-20px",overflow:"hidden"}}>
        <iframe
          key={symbol}
          src={`/chart.html?s=${encodeURIComponent(symbol)}`}
          style={{width:"100%",height:"calc(100vh - 110px)",border:"none",display:"block"}}
        />
      </div>
    );
}
