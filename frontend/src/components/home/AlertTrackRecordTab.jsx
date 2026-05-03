import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';

// ── Palette helpers ────────────────────────────────────────────
const GREEN  = "#30d158";
const RED    = "#ff453a";
const GOLD   = "#c8a44e";
const BLUE   = "#64d2ff";
const GREY   = "#8e8e93";

function pctColor(pct) {
  if (pct == null) return GREY;
  if (pct >= 60)  return GREEN;
  if (pct >= 40)  return GOLD;
  return RED;
}

function chgColor(chg) {
  if (chg == null) return GREY;
  if (chg > 0)  return GREEN;
  if (chg < -5) return RED;
  return GOLD;
}

// ── KPI card ──────────────────────────────────────────────────
function KpiCard({ label, value, color, sub }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", minWidth: 120, flex: 1 }}>
      <div style={{ fontSize: 9, fontFamily: "var(--fm)", color: "var(--text-tertiary)", letterSpacing: ".8px", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--fm)", color: color || "var(--text-primary)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fb)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Severity row bar ──────────────────────────────────────────
function SeverityBar({ label, data, color }) {
  const acc = data?.accuracy_pct;
  const _total = data?.total ?? 0;
  const correct = data?.correct ?? 0;
  const wrong   = data?.wrong ?? 0;
  const pend    = data?.pending ?? 0;
  const measured = correct + wrong;
  const fillPct  = measured > 0 ? (correct / measured * 100) : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 72, fontSize: 10, fontWeight: 700, fontFamily: "var(--fm)", color, letterSpacing: ".4px" }}>{label}</div>
      {/* bar track */}
      <div style={{ flex: 1, height: 8, background: "var(--subtle-bg)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${fillPct}%`, background: pctColor(acc), borderRadius: 4, transition: "width .4s" }} />
      </div>
      <div style={{ width: 48, textAlign: "right", fontSize: 12, fontWeight: 700, fontFamily: "var(--fm)", color: pctColor(acc) }}>
        {acc != null ? `${acc}%` : "–"}
      </div>
      <div style={{ width: 90, fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textAlign: "right" }}>
        {correct} hits · {wrong} miss · {pend} pend
      </div>
    </div>
  );
}

// ── Calibration row ───────────────────────────────────────────
function CalibRow({ tier, data }) {
  const s6  = data?.stats_6m;
  const s12 = data?.stats_12m;
  const n6   = s6?.n_measured ?? 0;
  const _n12  = s12?.n_measured ?? 0;
  const r6   = s6?.cut_rate;
  const r12  = s12?.cut_rate;

  const tierMeta = {
    LOW:  { label: "Safety BAJO (≤4)", c: RED  },
    MID:  { label: "Safety MEDIO (5-7)", c: GOLD },
    HIGH: { label: "Safety ALTO (8-10)", c: GREEN },
  };
  const m = tierMeta[tier] || { label: tier, c: GREY };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 160, fontSize: 10, fontWeight: 700, fontFamily: "var(--fm)", color: m.c }}>{m.label}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginBottom: 4 }}>6m window ({n6} tickers)</div>
        <div style={{ height: 7, background: "var(--subtle-bg)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${r6 ?? 0}%`, background: tier === "LOW" ? RED : GREEN, borderRadius: 3, opacity: .85 }} />
        </div>
      </div>
      <div style={{ width: 44, textAlign: "right", fontSize: 12, fontWeight: 700, fontFamily: "var(--fm)", color: tier === "LOW" ? RED : GREEN }}>
        {r6 != null ? `${r6}%` : "–"}
      </div>
      <div style={{ width: 44, textAlign: "right", fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
        12m: {r12 != null ? `${r12}%` : "–"}
      </div>
    </div>
  );
}

// ── Notable case row ─────────────────────────────────────────
function CaseRow({ r, isHit }) {
  const chg = r.dps_change_pct_12m ?? r.dps_change_pct_6m ?? null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 62, fontWeight: 800, fontSize: 13, color: GOLD, fontFamily: "var(--fd)" }}>{r.ticker}</div>
      <div style={{ flex: 1, fontSize: 10, color: "var(--text-secondary)", fontFamily: "var(--fb)", lineHeight: 1.35 }}>
        <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--text-tertiary)" }}>{r.alert_date}</span>
        {" · "}
        {r.titulo || r.tipo}
      </div>
      <div style={{ width: 56, textAlign: "right" }}>
        {chg != null
          ? <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--fm)", color: chgColor(chg) }}>{chg > 0 ? "+" : ""}{chg}%</span>
          : <span style={{ fontSize: 11, color: GREY, fontFamily: "var(--fm)" }}>–</span>
        }
      </div>
      <div style={{ width: 50, textAlign: "right" }}>
        <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "var(--fm)", color: isHit ? GREEN : RED, background: isHit ? "rgba(48,209,88,.12)" : "rgba(255,69,58,.12)", padding: "2px 7px", borderRadius: 5 }}>
          {isHit ? "HIT" : "MISS"}
        </span>
      </div>
    </div>
  );
}

// ── Confusion matrix cell ─────────────────────────────────────
function CMCell({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 6px", background: "var(--subtle-bg)", borderRadius: 8, flex: 1 }}>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--fm)", color }}>{value ?? "–"}</div>
      <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: 3, letterSpacing: ".3px" }}>{label}</div>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────
function SectionHead({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--fm)", color: GOLD, letterSpacing: ".8px", textTransform: "uppercase", marginBottom: 12, marginTop: 24, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════
export default function AlertTrackRecordTab() {
  // ── state ────────────────────────────────────────────────────
  const [backtest, setBacktest] = useState(null);
  const [alertRecord, setAlertRecord] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [view, setView]         = useState('backtest'); // 'backtest' | 'alerts'
  const abortRef = useRef(null);

  // ── data fetch ───────────────────────────────────────────────
  const load = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${API_URL}/api/backtest/safety-vs-cuts`, { signal: ctrl.signal }).then(r => r.json()),
      fetch(`${API_URL}/api/alert-track-record`,      { signal: ctrl.signal }).then(r => r.json()),
    ])
      .then(([bt, ar]) => {
        setBacktest(bt);
        setAlertRecord(ar);
      })
      .catch(e => { if (e.name !== 'AbortError') setError(String(e.message || e)); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [load]);

  // ── derived ──────────────────────────────────────────────────
  const bt  = backtest;
  const ar  = alertRecord;
  const cm6 = bt?.confusion_matrix?._6m;
  const ts  = bt?.tier_summary || {};
  const dw  = bt?.data_window  || {};

  const tabStyle = (id) => ({
    padding: "6px 16px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
    fontFamily: "var(--fb)", border: `1px solid ${view === id ? "var(--gold)" : "var(--border)"}`,
    background: view === id ? "var(--gold-dim)" : "transparent",
    color: view === id ? GOLD : "var(--text-tertiary)",
    transition: "all .15s",
  });

  // ── render ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-tertiary)", fontFamily: "var(--fb)", fontSize: 13 }}>
        Cargando datos de backtesting...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: RED, fontFamily: "var(--fb)", fontSize: 13 }}>
        Error: {error} — <button onClick={load} style={{ color: GOLD, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--fb)", fontSize: 13 }}>Reintentar</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 0", maxWidth: 860, margin: "0 auto" }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--fd)", color: "var(--text-primary)", lineHeight: 1.1 }}>
            Alert Track Record
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fb)", marginTop: 4 }}>
            Do our safety scores and alerts predict actual dividend cuts? Honest record.
          </div>
        </div>
        <button onClick={load} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: 11, cursor: "pointer", fontFamily: "var(--fb)" }}>
          Actualizar
        </button>
      </div>

      {/* ── View switcher ────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        <button style={tabStyle('backtest')} onClick={() => setView('backtest')}>Safety Score Backtest</button>
        <button style={tabStyle('alerts')}   onClick={() => setView('alerts')}>Alerts Table</button>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* VIEW: Safety Score Backtest                           */}
      {/* ══════════════════════════════════════════════════════ */}
      {view === 'backtest' && (
        <div>
          {/* Data window note */}
          {dw.total_with_history != null && (
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", background: "var(--subtle-bg)", padding: "8px 12px", borderRadius: 8, marginBottom: 20 }}>
              Universo: {dw.total_with_history} tickers con historial · 3m confirmados: {dw.has_3m} · 6m: {dw.has_6m} · 12m: {dw.has_12m}
              {" · "}Método: quarter-end + 60d lag · umbral corte: &gt;20% caída DPS
            </div>
          )}

          {/* Top KPIs: confusion matrix 6m */}
          <SectionHead>Confusion Matrix (ventana 6 meses)</SectionHead>
          {cm6 ? (
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <CMCell label="TRUE POS" value={cm6.tp} color={GREEN} />
              <CMCell label="FALSE NEG" value={cm6.fn} color={RED} />
              <CMCell label="FALSE POS" value={cm6.fp} color={GOLD} />
              <CMCell label="TRUE NEG" value={cm6.tn} color={BLUE} />
            </div>
          ) : (
            <div style={{ color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--fb)", marginBottom: 12 }}>No hay datos de confusion matrix aún (se necesita más tiempo de seguimiento).</div>
          )}
          {cm6 && (
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginBottom: 4 }}>
              <span>Precision: <strong style={{ color: pctColor(cm6.precision) }}>{cm6.precision != null ? `${cm6.precision}%` : "–"}</strong></span>
              <span>Recall: <strong style={{ color: pctColor(cm6.recall) }}>{cm6.recall != null ? `${cm6.recall}%` : "–"}</strong></span>
              <span>n={cm6.n}</span>
            </div>
          )}

          {/* Calibration: by safety tier */}
          <SectionHead>Calibracion por Safety Tier</SectionHead>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fb)", marginBottom: 10 }}>
            "Tickers con score BAJO: X% recortaron. Tickers con score ALTO: X% no recortaron."
          </div>
          {['LOW','MID','HIGH'].map(tier => (
            <CalibRow key={tier} tier={tier} data={ts[tier]} />
          ))}

          {/* True positives: correctly flagged + cut happened */}
          <SectionHead>Predicciones Correctas (True Positives)</SectionHead>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fb)", marginBottom: 10 }}>
            Safety score bajo (≤5) y el dividendo efectivamente fue recortado.
          </div>
          {(bt?.notable?.true_positives?.length ?? 0) === 0 ? (
            <div style={{ color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--fb)" }}>
              Sin predicciones confirmadas aún — ventana de seguimiento corta (sistema activo desde abril 2026).
            </div>
          ) : bt.notable.true_positives.map((r, i) => (
            <CaseRow key={`tp-${r.ticker}-${i}`} r={r} isHit={true} />
          ))}

          {/* False negatives: high score but cut happened anyway */}
          <SectionHead>Errores: Alto Score — Pero Sí Recortó (False Negatives)</SectionHead>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fb)", marginBottom: 10 }}>
            Honestidad: el modelo decía SAFE pero ocurrió un corte.
          </div>
          {(bt?.notable?.false_negatives?.length ?? 0) === 0 ? (
            <div style={{ color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--fb)" }}>
              Ninguno en el periodo analizado.
            </div>
          ) : bt.notable.false_negatives.map((r, i) => (
            <CaseRow key={`fn-${r.ticker}-${i}`} r={r} isHit={false} />
          ))}

          {/* False positives: flagged risky but no cut */}
          <SectionHead>Falsas Alarmas (False Positives)</SectionHead>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fb)", marginBottom: 10 }}>
            Safety score ≤4 pero el dividendo se mantuvo o subió.
          </div>
          {(bt?.notable?.false_positives?.length ?? 0) === 0 ? (
            <div style={{ color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--fb)" }}>
              Ninguna en el periodo analizado.
            </div>
          ) : bt.notable.false_positives.map((r, i) => (
            <CaseRow key={`fp-${r.ticker}-${i}`} r={r} isHit={false} />
          ))}

          {/* Strong holds */}
          <SectionHead>High Score + Dividendo Mantenido / Subido</SectionHead>
          {(bt?.notable?.strong_holds?.length ?? 0) === 0 ? (
            <div style={{ color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--fb)" }}>Sin datos confirmados aún.</div>
          ) : bt.notable.strong_holds.map((r, i) => (
            <CaseRow key={`sh-${r.ticker}-${i}`} r={r} isHit={true} />
          ))}

          {/* Methodology footer */}
          <div style={{ marginTop: 24, fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fb)", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            {bt?.methodology}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* VIEW: Alerts Table                                    */}
      {/* ══════════════════════════════════════════════════════ */}
      {view === 'alerts' && (
        <div>
          {/* Top KPIs */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
            <KpiCard
              label="Precision global"
              value={ar?.accuracy_pct != null ? `${ar.accuracy_pct}%` : "–"}
              color={pctColor(ar?.accuracy_pct)}
              sub={`${ar?.evaluated ?? 0} alertas medidas`}
            />
            <KpiCard
              label="Hits confirmados"
              value={ar?.correct ?? "–"}
              color={GREEN}
              sub="corte ocurrió según lo predicho"
            />
            <KpiCard
              label="Falsas alarmas"
              value={ar?.wrong ?? "–"}
              color={RED}
              sub="alerta sin corte posterior"
            />
            <KpiCard
              label="Pendientes"
              value={ar?.pending ?? "–"}
              color={GREY}
              sub="ventana aún no cerrada"
            />
          </div>

          {ar?.data_note && (
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", background: "var(--subtle-bg)", padding: "8px 12px", borderRadius: 8, marginBottom: 20 }}>
              {ar.data_note}
            </div>
          )}

          {/* By severity */}
          <SectionHead>Precision por Severidad</SectionHead>
          {['CRITICAL','WARNING','INFO'].map(sev => {
            const sevColor = sev === 'CRITICAL' ? RED : sev === 'WARNING' ? GOLD : BLUE;
            return <SeverityBar key={sev} label={sev} data={ar?.by_severity?.[sev]} color={sevColor} />;
          })}

          {/* Top hits */}
          <SectionHead>Top Hits — Alerta se Confirmo</SectionHead>
          {(ar?.top_hits?.length ?? 0) === 0 ? (
            <div style={{ color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--fb)" }}>
              Sin cortes confirmados aún en la tabla de alertas — el sistema arrancó en abril 2026 y los horizontes de 6-12 meses aún no han madurado.
            </div>
          ) : ar.top_hits.map((r, i) => (
            <CaseRow key={`ah-${r.id ?? i}`} r={r} isHit={true} />
          ))}

          {/* Top misses */}
          <SectionHead>Top Misses — Alerta Sin Corte (Honestidad)</SectionHead>
          {(ar?.top_misses?.length ?? 0) === 0 ? (
            <div style={{ color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--fb)" }}>Sin falsas alarmas confirmadas aún.</div>
          ) : ar.top_misses.map((r, i) => (
            <CaseRow key={`am-${r.id ?? i}`} r={r} isHit={false} />
          ))}
        </div>
      )}

    </div>
  );
}
