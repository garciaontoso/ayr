import { useState, useEffect, useContext } from 'react';
import AnalysisContext from '../../context/AnalysisContext';
import { _sf } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';

export default function OptionsChainTab() {
  const { cfg } = useContext(AnalysisContext);
  const ticker = cfg?.ticker || "";

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [chainData, setChainData] = useState(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [showPuts, setShowPuts] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true); setError(null);
    fetch(`${API_URL}/api/options-chain?symbol=${ticker}&dte=30`)
      .then(r => r.json())
      .then(d => { setData(d); setChainData(d); setLoading(false); })
      .catch(e => { setError(e.message || "Error cargando opciones"); setLoading(false); });
  }, [ticker]);

  const loadExpiration = (dte) => {
    setChainLoading(true);
    fetch(`${API_URL}/api/options-chain?symbol=${ticker}&dte=${dte}`)
      .then(r => r.json())
      .then(d => { setChainData(d); setChainLoading(false); })
      .catch(() => { setChainData(null); setChainLoading(false); });
  };

  const hd = { fontSize: 13, fontWeight: 700, color: "var(--gold)", fontFamily: "var(--fd)", marginBottom: 10, paddingBottom: 6, borderBottom: "2px solid rgba(200,164,78,.2)" };
  const card = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 14 };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando opciones para {ticker}...</div>;
  if (error) return <div style={{ padding: 40, textAlign: "center", color: "var(--red)" }}>Error: {error}</div>;
  if (!data || data.error) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>{data?.error || "Sin datos de opciones para " + ticker}</div>;

  const options = showPuts ? (chainData?.puts || []) : (chainData?.calls || []);
  const price = chainData?.price || 0;
  const expiration = chainData?.expiration || "";
  const dte = chainData?.dte || 0;
  const expirations = data?.expirations || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={hd}>{ticker} — Cadena de Opciones</div>
            <div style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: "var(--fm)" }}>
              <span>Precio: <b style={{ color: "var(--text-primary)" }}>${_sf(price, 2)}</b></span>
              <span>Exp: <b style={{ color: "var(--gold)" }}>{expiration}</b></span>
              <span>DTE: <b style={{ color: "#64d2ff" }}>{dte}d</b></span>
              <span>{showPuts ? "Puts" : "Calls"}: <b>{options.length}</b></span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setShowPuts(false)}
              style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${!showPuts ? "var(--green)" : "var(--border)"}`, background: !showPuts ? "rgba(48,209,88,.1)" : "transparent", color: !showPuts ? "var(--green)" : "var(--text-tertiary)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--fm)" }}>
              📈 Calls
            </button>
            <button onClick={() => setShowPuts(true)}
              style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${showPuts ? "#bf5af2" : "var(--border)"}`, background: showPuts ? "rgba(191,90,242,.1)" : "transparent", color: showPuts ? "#bf5af2" : "var(--text-tertiary)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--fm)" }}>
              📉 Puts
            </button>
          </div>
        </div>
      </div>

      {/* Expiration selector */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginRight: 4 }}>Exp:</span>
        {expirations.slice(0, 12).map(exp => (
          <button key={exp.ts} onClick={() => loadExpiration(exp.dte)}
            style={{ padding: "4px 9px", borderRadius: 6, fontSize: 10, fontFamily: "var(--fm)", cursor: "pointer", border: `1px solid ${exp.dte === dte ? "var(--gold)" : "var(--border)"}`, background: exp.dte === dte ? "var(--gold-dim)" : "transparent", color: exp.dte === dte ? "var(--gold)" : "var(--text-tertiary)", fontWeight: exp.dte === dte ? 700 : 500 }}>
            {exp.date?.slice(5)} ({exp.dte}d)
          </button>
        ))}
      </div>

      {/* Chain table */}
      {chainLoading ? (
        <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Cargando...</div>
      ) : (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 650 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["Strike", "Bid", "Ask", "Last", "Mid", "Spread%", "IV", "Vol", "OI", "ITM", "Dist%"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: h === "ITM" ? "center" : "right", color: "var(--text-tertiary)", fontSize: 9, fontWeight: 700, fontFamily: "var(--fm)", letterSpacing: .3 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {options.map((c, i) => {
                  const mid = (c.bid + c.ask) / 2;
                  const spread = c.ask > 0 ? ((c.ask - c.bid) / c.ask * 100) : 0;
                  const dist = price > 0 ? ((c.strike - price) / price * 100) : 0;
                  const isATM = Math.abs(dist) < 2;
                  return (
                    <tr key={c.strike || i}
                      style={{ borderBottom: "1px solid var(--subtle-border)", background: isATM ? "rgba(200,164,78,.06)" : c.itm ? (showPuts ? "rgba(191,90,242,.03)" : "rgba(48,209,88,.03)") : "transparent" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--card-hover)"}
                      onMouseLeave={e => e.currentTarget.style.background = isATM ? "rgba(200,164,78,.06)" : c.itm ? (showPuts ? "rgba(191,90,242,.03)" : "rgba(48,209,88,.03)") : "transparent"}>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, fontFamily: "var(--fm)", color: isATM ? "var(--gold)" : "var(--text-primary)" }}>
                        ${_sf(c.strike, 0)}{isATM && <span style={{ fontSize: 7, marginLeft: 3, color: "var(--gold)" }}>ATM</span>}
                      </td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--fm)", color: "var(--green)", fontWeight: 600 }}>${_sf(c.bid, 2)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--fm)", color: "var(--text-secondary)" }}>${_sf(c.ask, 2)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--fm)", color: "var(--text-primary)" }}>${_sf(c.last, 2)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--fm)", color: "var(--gold)" }}>${_sf(mid, 2)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--fm)", color: spread > 30 ? "var(--red)" : spread > 15 ? "var(--text-tertiary)" : "var(--green)", fontSize: 10 }}>{_sf(spread, 0)}%</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--fm)", color: c.iv > 0.35 ? "var(--green)" : c.iv > 0.20 ? "var(--text-primary)" : "var(--text-tertiary)" }}>{_sf(c.iv * 100, 0)}%</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--fm)", color: "var(--text-secondary)", fontSize: 10 }}>{c.volume || "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--fm)", color: c.oi > 500 ? "var(--green)" : c.oi > 100 ? "var(--text-secondary)" : "var(--text-tertiary)", fontSize: 10 }}>{c.oi || "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center" }}>
                        <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: c.itm ? "rgba(48,209,88,.1)" : "var(--subtle-border)", color: c.itm ? "var(--green)" : "var(--text-tertiary)", fontWeight: 600, fontFamily: "var(--fm)" }}>{c.itm ? "ITM" : "OTM"}</span>
                      </td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "var(--fm)", fontSize: 10, color: Math.abs(dist) < 5 ? "var(--gold)" : "var(--text-tertiary)" }}>
                        {dist >= 0 ? "+" : ""}{_sf(dist, 1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick estimate */}
      {price > 0 && !showPuts && (() => {
        const target = price * 1.05;
        const best = options.filter(c => c.strike >= price).reduce((b, c) => (!b || Math.abs(c.strike - target) < Math.abs(b.strike - target)) ? c : b, null);
        if (!best || !best.bid) return null;
        const yieldPeriod = best.bid / price;
        const yieldAnn = yieldPeriod * (365 / Math.max(dte, 1));
        return (
          <div style={{ ...card, background: "rgba(200,164,78,.03)", borderColor: "rgba(200,164,78,.15)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gold)", fontFamily: "var(--fm)", marginBottom: 6 }}>Covered Call ~5% OTM</div>
            <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: "var(--fm)", flexWrap: "wrap" }}>
              <span>Strike <b style={{ color: "var(--gold)" }}>${_sf(best.strike, 0)}</b> ({_sf((best.strike - price) / price * 100, 1)}%)</span>
              <span>Prima <b style={{ color: "var(--green)" }}>${_sf(best.bid, 2)}</b></span>
              <span>Yield <b>{_sf(yieldPeriod * 100, 2)}%</b></span>
              <span>Ann. <b style={{ color: yieldAnn > 0.12 ? "var(--green)" : "var(--gold)" }}>{_sf(yieldAnn * 100, 1)}%</b></span>
            </div>
          </div>
        );
      })()}

      {price > 0 && showPuts && (() => {
        const target = price * 0.95;
        const best = options.filter(c => c.strike <= price).reduce((b, c) => (!b || Math.abs(c.strike - target) < Math.abs(b.strike - target)) ? c : b, null);
        if (!best || !best.bid) return null;
        const effectivePrice = best.strike - best.bid;
        const discount = (price - effectivePrice) / price * 100;
        return (
          <div style={{ ...card, background: "rgba(191,90,242,.03)", borderColor: "rgba(191,90,242,.15)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#bf5af2", fontFamily: "var(--fm)", marginBottom: 6 }}>Cash-Secured Put ~5% OTM</div>
            <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: "var(--fm)", flexWrap: "wrap" }}>
              <span>Strike <b style={{ color: "#bf5af2" }}>${_sf(best.strike, 0)}</b> ({_sf((best.strike - price) / price * 100, 1)}%)</span>
              <span>Prima <b style={{ color: "var(--green)" }}>${_sf(best.bid, 2)}</b></span>
              <span>Precio eff. <b>${_sf(effectivePrice, 2)}</b></span>
              <span>Descuento <b style={{ color: "var(--green)" }}>{_sf(discount, 1)}%</b></span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
