import { useState, useMemo, useCallback, useEffect } from 'react';
import { _sf } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';

// ─── Mock data ─────────────────────────────────────────────────────────────────
// All mock. Replace with real IB-bridge / FMP calls in the wiring phase.

const MOCK_NAV = 1_234_567;
const MOCK_INIT_MARGIN = 435_000;
const MOCK_MAINT_MARGIN = 300_000;
const MOCK_VIX = 18.7;
const MOCK_LAST_SCAN = "hace 3min";
const MOCK_NEXT_SCAN = "en 7min";

const UNIVERSE_OPTIONS = [
  { id: "cartera",          lbl: "Cartera" },
  { id: "aristocrats",      lbl: "Aristocrats" },
  { id: "buffett",          lbl: "Buffett Ideas" },
  { id: "custom_gorka",     lbl: "Custom List Gorka" },
  { id: "all",              lbl: "All" },
];

const LENSES = [
  {
    id: "A",
    lbl: "Quality CSP",
    color: "#30d158",
    criteria: "Quality≥75 · IV/HV>110 · Earn>21d · 4wk drop>5% · FwdPE<25",
  },
  {
    id: "B",
    lbl: "Income CC",
    color: "#ffd60a",
    criteria: "En cartera · IV>30% · OTM 5-10% · DTE 30-45",
  },
  {
    id: "C",
    lbl: "Crisis IV",
    color: "#ff453a",
    criteria: "IV/HV>200 · Earn>30d · Disp<-20% · DTE 7-14",
  },
];

const CONVICTION_CRITERIA = [
  { id: "quality",    lbl: "Quality≥75",         delta: +1, lens: "A" },
  { id: "ivhv",       lbl: "IV/HV>110",           delta: +1, lens: "A" },
  { id: "earn_safe",  lbl: "Earnings >21d",       delta: +1, lens: "A" },
  { id: "dip",        lbl: "4-week drop >5%",     delta: +1, lens: "A" },
  { id: "fwdpe",      lbl: "FwdPE <25",           delta: +1, lens: "A" },
  { id: "in_port",    lbl: "En cartera",          delta: +1, lens: "B" },
  { id: "crisis_iv",  lbl: "IV/HV >200",          delta: +1, lens: "C" },
  // penalties
  { id: "earn_near",  lbl: "Earnings <14d",       delta: -1, lens: "A" },
  { id: "high_debt",  lbl: "Deuda alta",          delta: -1, lens: "A" },
];

const CAP_LABELS = {
  MEGA: { lbl: "MEGA", color: "#34d399" },
  LARGE: { lbl: "LARGE", color: "#60a5fa" },
  MID: { lbl: "MID", color: "#c8a44e" },
  SMALL: { lbl: "SMALL", color: "#f59e0b" },
  MICRO: { lbl: "MICRO", color: "#f87171" },
};

const MOCK_CANDIDATES = [
  {
    symbol: "KO", sector: "Consumer Staples", cap: "MEGA", inPort: true,
    last: 62.84, chgPct: -1.2, ivhv: 128, fwdPE: 22.1,
    target: 60.00, dispPct: -4.6, dte: 35, strike: 60.00,
    prem: 0.95, yieldPct: 18.4, score: 82,
    lens: "A", conv: "HIGH",
    flags: ["EARNINGS CONFIRMED", "IV DISLOCATION"],
    criteria: { quality: true, ivhv: true, earn_safe: true, dip: true, fwdpe: true, in_port: true, crisis_iv: false, earn_near: false, high_debt: false },
  },
  {
    symbol: "PEP", sector: "Consumer Staples", cap: "MEGA", inPort: true,
    last: 164.22, chgPct: -2.4, ivhv: 141, fwdPE: 21.8,
    target: 157.50, dispPct: -6.1, dte: 38, strike: 157.50,
    prem: 1.85, yieldPct: 17.9, score: 78,
    lens: "A", conv: "HIGH",
    flags: ["EARNINGS CONFIRMED", "ARISTOCRAT"],
    criteria: { quality: true, ivhv: true, earn_safe: true, dip: true, fwdpe: true, in_port: true, crisis_iv: false, earn_near: false, high_debt: false },
  },
  {
    symbol: "JNJ", sector: "Healthcare", cap: "MEGA", inPort: true,
    last: 153.48, chgPct: -0.8, ivhv: 118, fwdPE: 14.9,
    target: 147.50, dispPct: -3.9, dte: 32, strike: 147.50,
    prem: 1.20, yieldPct: 14.1, score: 74,
    lens: "A", conv: "HIGH",
    flags: ["ARISTOCRAT", "QUAL OK"],
    criteria: { quality: true, ivhv: true, earn_safe: true, dip: false, fwdpe: true, in_port: true, crisis_iv: false, earn_near: false, high_debt: false },
  },
  {
    symbol: "MO", sector: "Consumer Staples", cap: "LARGE", inPort: true,
    last: 41.62, chgPct: -1.9, ivhv: 156, fwdPE: 9.8,
    target: 39.00, dispPct: -6.3, dte: 30, strike: 39.00,
    prem: 0.65, yieldPct: 19.8, score: 69,
    lens: "B", conv: "MOD",
    flags: ["IV ALTA", "EN CARTERA"],
    criteria: { quality: true, ivhv: true, earn_safe: true, dip: true, fwdpe: true, in_port: true, crisis_iv: false, earn_near: false, high_debt: false },
  },
  {
    symbol: "PG", sector: "Consumer Staples", cap: "MEGA", inPort: false,
    last: 167.35, chgPct: +0.3, ivhv: 105, fwdPE: 24.2,
    target: 160.00, dispPct: -4.4, dte: 35, strike: 160.00,
    prem: 1.40, yieldPct: 12.8, score: 65,
    lens: "A", conv: "MOD",
    flags: ["NO-DISLOCATION"],
    criteria: { quality: true, ivhv: false, earn_safe: true, dip: false, fwdpe: true, in_port: false, crisis_iv: false, earn_near: false, high_debt: false },
  },
  {
    symbol: "KHC", sector: "Consumer Staples", cap: "LARGE", inPort: true,
    last: 30.14, chgPct: -3.1, ivhv: 198, fwdPE: 10.4,
    target: 28.00, dispPct: -7.1, dte: 14, strike: 28.00,
    prem: 0.42, yieldPct: 32.1, score: 58,
    lens: "C", conv: "MOD",
    flags: ["CRISIS IV", "IV EXTREMA"],
    criteria: { quality: false, ivhv: true, earn_safe: true, dip: true, fwdpe: true, in_port: true, crisis_iv: true, earn_near: false, high_debt: true },
  },
  {
    symbol: "GIS", sector: "Consumer Staples", cap: "LARGE", inPort: false,
    last: 56.84, chgPct: -1.5, ivhv: 112, fwdPE: 13.7,
    target: 54.00, dispPct: -5.0, dte: 30, strike: 54.00,
    prem: 0.78, yieldPct: 14.5, score: 55,
    lens: "A", conv: "MOD",
    flags: ["WATCH — calidad borderline"],
    criteria: { quality: false, ivhv: true, earn_safe: true, dip: true, fwdpe: true, in_port: false, crisis_iv: false, earn_near: false, high_debt: false },
  },
  {
    symbol: "V", sector: "Financials", cap: "MEGA", inPort: true,
    last: 278.45, chgPct: +0.5, ivhv: 97, fwdPE: 26.8,
    target: 265.00, dispPct: -4.8, dte: 38, strike: 265.00,
    prem: 2.10, yieldPct: 10.7, score: 48,
    lens: "A", conv: "WATCH",
    flags: ["NO-DISLOCATION", "FWDPE ALTO"],
    criteria: { quality: true, ivhv: false, earn_safe: true, dip: false, fwdpe: false, in_port: true, crisis_iv: false, earn_near: false, high_debt: false },
  },
  {
    symbol: "MSFT", sector: "Technology", cap: "MEGA", inPort: false,
    last: 421.33, chgPct: +0.9, ivhv: 88, fwdPE: 31.5,
    target: 400.00, dispPct: -5.1, dte: 35, strike: 400.00,
    prem: 3.80, yieldPct: 9.4, score: 42,
    lens: "A", conv: "WATCH",
    flags: ["NO-DISLOCATION", "FWDPE ALTO", "IV BAJA"],
    criteria: { quality: true, ivhv: false, earn_safe: true, dip: false, fwdpe: false, in_port: false, crisis_iv: false, earn_near: false, high_debt: false },
  },
  {
    symbol: "UNH", sector: "Healthcare", cap: "MEGA", inPort: false,
    last: 478.22, chgPct: -4.2, ivhv: 187, fwdPE: 17.3,
    target: 450.00, dispPct: -5.9, dte: 12, strike: 450.00,
    prem: 6.50, yieldPct: 25.1, score: 40,
    lens: "C", conv: "WATCH",
    flags: ["EARNINGS <14d", "AUTO-PASS earnings risk"],
    criteria: { quality: true, ivhv: true, earn_safe: false, dip: true, fwdpe: true, in_port: false, crisis_iv: true, earn_near: true, high_debt: false },
  },
];

const MOCK_REJECTED = [
  { symbol: "AAPL",  sector: "Technology",        cap: "MEGA",  last: 198.50, chgPct: +0.4, ivhv: 72,  fwdPE: 28.0, score: 18, flags: ["IV/HV BAJO — sin dislocation"] },
  { symbol: "AMZN",  sector: "Technology",        cap: "MEGA",  last: 182.30, chgPct: +1.2, ivhv: 68,  fwdPE: 34.0, score: 12, flags: ["IV baja · FwdPE alto"] },
  { symbol: "TSLA",  sector: "Cons. Cycl.",       cap: "LARGE", last: 242.10, chgPct: -2.8, ivhv: 310, fwdPE: 68.0, score: 8,  flags: ["EARNINGS <7d — AUTO-PASS"] },
  { symbol: "NVDA",  sector: "Technology",        cap: "MEGA",  last: 878.44, chgPct: +2.1, ivhv: 95,  fwdPE: 38.0, score: 9,  flags: ["FwdPE extremo · no value"] },
  { symbol: "META",  sector: "Comm. Services",    cap: "MEGA",  last: 512.00, chgPct: +0.6, ivhv: 82,  fwdPE: 23.0, score: 22, flags: ["IV/HV bajo · calidad OK pero sin dip"] },
  { symbol: "GOOGL", sector: "Comm. Services",    cap: "MEGA",  last: 164.20, chgPct: +0.3, ivhv: 79,  fwdPE: 20.0, score: 19, flags: ["IV/HV bajo"] },
  { symbol: "XOM",   sector: "Energy",            cap: "MEGA",  last: 112.80, chgPct: -0.9, ivhv: 88,  fwdPE: 12.0, score: 24, flags: ["Sector excluido (Energy)"] },
  { symbol: "JPM",   sector: "Financials",        cap: "MEGA",  last: 204.55, chgPct: +0.2, ivhv: 91,  fwdPE: 12.5, score: 26, flags: ["IV/HV bajo — sin trigger"] },
  { symbol: "BAC",   sector: "Financials",        cap: "LARGE", last: 38.72,  chgPct: -0.5, ivhv: 96,  fwdPE: 11.0, score: 21, flags: ["IV marginal · sin dip reciente"] },
  { symbol: "HD",    sector: "Cons. Cycl.",       cap: "MEGA",  last: 338.90, chgPct: -1.3, ivhv: 85,  fwdPE: 23.5, score: 17, flags: ["IV/HV bajo · no dip"] },
];

const MOCK_SNAPSHOTS = [
  { id: "s1", lbl: "Hoy 14:00",   delta: "+2", count: 8  },
  { id: "s2", lbl: "Hoy 13:00",   delta: "+2", count: 6  },
  { id: "s3", lbl: "Hoy 12:00",   delta: "=",  count: 6  },
  { id: "s4", lbl: "Hoy 11:00",   delta: "-1", count: 7  },
  { id: "s5", lbl: "Hoy 10:00",   delta: "+3", count: 8  },
  { id: "s6", lbl: "Ayer 16:00",  delta: "=",  count: 5  },
  { id: "s7", lbl: "Ayer 15:00",  delta: "-2", count: 7  },
  { id: "s8", lbl: "Ayer 14:00",  delta: "+1", count: 9  },
];

// ─── Style constants (hoisted — no render realloc) ──────────────────────────
const S_CARD = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "10px 14px",
};

const S_LABEL = {
  fontSize: 8,
  fontFamily: "var(--fm)",
  color: "var(--text-tertiary)",
  fontWeight: 700,
  letterSpacing: "0.8px",
  textTransform: "uppercase",
};

const S_VALUE = {
  fontSize: 20,
  fontFamily: "var(--fm)",
  fontWeight: 700,
  color: "var(--gold)",
  lineHeight: 1.1,
};

const S_TH = {
  padding: "5px 8px",
  fontSize: 8,
  fontFamily: "var(--fm)",
  fontWeight: 700,
  color: "var(--text-tertiary)",
  letterSpacing: "0.6px",
  textTransform: "uppercase",
  textAlign: "right",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--border)",
  background: "var(--card)",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const S_TH_LEFT = { ...S_TH, textAlign: "left" };

const S_TD = {
  padding: "5px 8px",
  fontSize: 11,
  fontFamily: "var(--fm)",
  textAlign: "right",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--border)",
  color: "var(--text-secondary)",
};

const S_TD_LEFT = { ...S_TD, textAlign: "left" };

// ─── Small helpers ────────────────────────────────────────────────────────────

function fmtK(v) {
  if (v >= 1_000_000) return "$" + _sf(v / 1_000_000, 2) + "M";
  if (v >= 1_000) return "$" + _sf(v / 1_000, 0) + "K";
  return "$" + _sf(v, 0);
}

function convColor(conv) {
  if (conv === "HIGH") return "#30d158";
  if (conv === "MOD")  return "#ffd60a";
  if (conv === "WATCH") return "#6b7280";
  return "#374151";
}

function convBg(conv) {
  if (conv === "HIGH") return "rgba(48,209,88,.15)";
  if (conv === "MOD")  return "rgba(255,214,10,.12)";
  if (conv === "WATCH") return "rgba(107,114,128,.12)";
  return "transparent";
}

function ivhvColor(v) {
  if (v > 150) return "#ff453a";
  if (v >= 100) return "#c8a44e";
  return "#30d158";
}

function fwdPEColor(v) {
  if (v < 20) return "#30d158";
  if (v > 30) return "#ff453a";
  return "var(--text-secondary)";
}

function scoreBg(score) {
  if (score >= 75) return { bg: "rgba(48,209,88,.18)", fg: "#30d158" };
  if (score >= 55) return { bg: "rgba(255,214,10,.15)", fg: "#ffd60a" };
  if (score >= 35) return { bg: "rgba(255,159,10,.15)", fg: "#ff9f0a" };
  return { bg: "rgba(255,69,58,.12)", fg: "#ff453a" };
}

function lensColor(id) {
  const l = LENSES.find(l => l.id === id);
  return l ? l.color : "var(--text-tertiary)";
}

function capBadge(cap) {
  const m = CAP_LABELS[cap] || { lbl: cap, color: "#6b7280" };
  return (
    <span style={{
      fontSize: 7, fontFamily: "var(--fm)", fontWeight: 700,
      padding: "1px 4px", borderRadius: 3,
      background: m.color + "22", color: m.color,
      border: "1px solid " + m.color + "44",
      marginLeft: 4, verticalAlign: "middle",
    }}>{m.lbl}</span>
  );
}

// ─── Candidates table ─────────────────────────────────────────────────────────

function CandidateRow({ row, onClick }) {
  const sc = scoreBg(row.score);
  return (
    <tr
      onClick={() => onClick(row)}
      style={{ cursor: "pointer", transition: "background .1s" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--row-alt)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      {/* AH (after hours placeholder) */}
      <td style={{ ...S_TD, textAlign: "center", fontSize: 9, color: "var(--text-tertiary)" }}>—</td>
      {/* PORT */}
      <td style={{ ...S_TD, textAlign: "center" }}>
        {row.inPort && (
          <span title="En cartera" style={{ color: "#c8a44e", fontSize: 12 }}>●</span>
        )}
      </td>
      {/* CONV */}
      <td style={{ ...S_TD, textAlign: "center" }}>
        <span style={{
          padding: "2px 6px", borderRadius: 5, fontSize: 9, fontWeight: 700,
          background: convBg(row.conv), color: convColor(row.conv),
          border: "1px solid " + convColor(row.conv) + "44",
        }}>{row.conv}</span>
      </td>
      {/* LENS */}
      <td style={{ ...S_TD, textAlign: "center" }}>
        <span style={{
          padding: "2px 6px", borderRadius: 5, fontSize: 9, fontWeight: 700,
          color: lensColor(row.lens),
          background: lensColor(row.lens) + "18",
          border: "1px solid " + lensColor(row.lens) + "44",
        }}>{row.lens}</span>
      </td>
      {/* A / B / C tick marks */}
      {["A", "B", "C"].map(lid => {
        const lens = LENSES.find(l => l.id === lid);
        const match = row.lens === lid;
        return (
          <td key={lid} style={{ ...S_TD, textAlign: "center", fontSize: 10 }}>
            {match
              ? <span style={{ color: lens.color }}>✓</span>
              : <span style={{ color: "var(--text-tertiary)", opacity: 0.3 }}>·</span>
            }
          </td>
        );
      })}
      {/* SYMBOL */}
      <td style={{ ...S_TD_LEFT }}>
        <span style={{ fontWeight: 700, color: "var(--gold)", fontSize: 12 }}>{row.symbol}</span>
        {capBadge(row.cap)}
      </td>
      {/* SECTOR */}
      <td style={{ ...S_TD_LEFT, fontSize: 9, color: "var(--text-tertiary)" }}>{row.sector}</td>
      {/* LAST */}
      <td style={{ ...S_TD }}>${_sf(row.last, 2)}</td>
      {/* CHG% */}
      <td style={{ ...S_TD, color: row.chgPct >= 0 ? "#30d158" : "#ff453a" }}>
        {row.chgPct >= 0 ? "+" : ""}{_sf(row.chgPct, 1)}%
      </td>
      {/* IV/HV */}
      <td style={{ ...S_TD, color: ivhvColor(row.ivhv), fontWeight: 700 }}>
        {_sf(row.ivhv, 0)}
      </td>
      {/* FWDPE */}
      <td style={{ ...S_TD, color: fwdPEColor(row.fwdPE) }}>
        {_sf(row.fwdPE, 1)}x
      </td>
      {/* TARGET */}
      <td style={{ ...S_TD }}>${_sf(row.target, 2)}</td>
      {/* DISP% */}
      <td style={{ ...S_TD, color: row.dispPct < 0 ? "#ff453a" : "#30d158" }}>
        {row.dispPct >= 0 ? "+" : ""}{_sf(row.dispPct, 1)}%
      </td>
      {/* DTE */}
      <td style={{ ...S_TD }}>{row.dte}d</td>
      {/* STRIKE */}
      <td style={{ ...S_TD }}>${_sf(row.strike, 2)}</td>
      {/* PREM */}
      <td style={{ ...S_TD, color: "var(--gold)" }}>${_sf(row.prem, 2)}</td>
      {/* YIELD% */}
      <td style={{ ...S_TD, color: "#30d158", fontWeight: 700 }}>
        {_sf(row.yieldPct, 1)}%
      </td>
      {/* SCORE */}
      <td style={{ ...S_TD, textAlign: "center" }}>
        <span style={{
          display: "inline-block", minWidth: 32, padding: "2px 6px",
          borderRadius: 5, fontSize: 10, fontWeight: 700,
          background: sc.bg, color: sc.fg,
        }}>{row.score}</span>
      </td>
      {/* FLAGS */}
      <td style={{ ...S_TD_LEFT, maxWidth: 200, fontSize: 8, color: "var(--text-tertiary)", whiteSpace: "normal", lineHeight: 1.5 }}>
        {row.flags.join(" · ")}
      </td>
    </tr>
  );
}

function RejectedRow({ row }) {
  const sc = scoreBg(row.score);
  return (
    <tr style={{ opacity: 0.6 }}>
      <td style={{ ...S_TD_LEFT }}>
        <span style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: 11 }}>{row.symbol}</span>
        {capBadge(row.cap)}
      </td>
      <td style={{ ...S_TD_LEFT, fontSize: 9, color: "var(--text-tertiary)" }}>{row.sector}</td>
      <td style={{ ...S_TD }}>${_sf(row.last, 2)}</td>
      <td style={{ ...S_TD, color: row.chgPct >= 0 ? "#30d158" : "#ff453a" }}>
        {row.chgPct >= 0 ? "+" : ""}{_sf(row.chgPct, 1)}%
      </td>
      <td style={{ ...S_TD, color: ivhvColor(row.ivhv) }}>{_sf(row.ivhv, 0)}</td>
      <td style={{ ...S_TD, color: fwdPEColor(row.fwdPE) }}>{_sf(row.fwdPE, 1)}x</td>
      <td style={{ ...S_TD, textAlign: "center" }}>
        <span style={{
          display: "inline-block", minWidth: 32, padding: "2px 6px",
          borderRadius: 5, fontSize: 10, fontWeight: 700,
          background: sc.bg, color: sc.fg,
        }}>{row.score}</span>
      </td>
      <td style={{ ...S_TD_LEFT, maxWidth: 220, fontSize: 8, color: "var(--text-tertiary)", whiteSpace: "normal", lineHeight: 1.5 }}>
        {row.flags.join(" · ")}
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScannerTab() {
  // ── All useState / useCallback / useMemo BEFORE any useEffect ──
  // (No useEffects here — all data is mock. Safe from TDZ.)

  const [universe, setUniverse] = useState("cartera");
  const [activeLenses, setActiveLenses] = useState({ A: true, B: true, C: true });
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [detailRow, setDetailRow] = useState(null);
  // Scanner master switch — cuando está OFF, no se hacen llamadas a IB Gateway
  // (ni manuales ni cron). Persiste en backend via /api/scanner/state.
  // Inicia ACTIVO por defecto; el usuario puede pausar para no competir con
  // operaciones manuales en TWS.
  const [scannerActive, setScannerActive] = useState(true);
  const [toggleBusy, setToggleBusy] = useState(false);

  const toggleScanner = useCallback(async () => {
    if (toggleBusy) return;
    setToggleBusy(true);
    const newState = !scannerActive;
    setScannerActive(newState);  // optimistic update
    try {
      const resp = await fetch(`${API_URL}/api/scanner/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newState }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (typeof data.enabled === "boolean") setScannerActive(data.enabled);
    } catch (e) {
      // Si el endpoint no responde (Fase 2 no desplegada todavía), mantenemos
      // el estado local — no rollback. Cuando el backend esté live esto
      // sincronizará automáticamente.
      console.warn("scanner toggle: backend not reachable, keeping local state");
    } finally {
      setToggleBusy(false);
    }
  }, [scannerActive, toggleBusy]);

  // Hidratar estado desde backend al montar (silently fails si endpoint no existe).
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/scanner/state`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d && typeof d.enabled === "boolean") setScannerActive(d.enabled); })
      .catch(() => {/* endpoint no desplegado todavía — usamos default ACTIVO */});
    return () => { cancelled = true; };
  }, []);

  const toggleLens = useCallback((id) => {
    setActiveLenses(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const cushionPct = useMemo(
    () => ((MOCK_NAV - MOCK_MAINT_MARGIN) / MOCK_NAV) * 100,
    []
  );

  const cushionColor = cushionPct > 50 ? "#30d158" : cushionPct > 30 ? "#ffd60a" : "#ff453a";

  const filteredCandidates = useMemo(() => {
    let rows = MOCK_CANDIDATES.filter(r => activeLenses[r.lens]);
    return [...rows].sort((a, b) => b.score - a.score);
  }, [activeLenses]);

  // In snapshot mode the table shows historical data (we just show same mock with
  // a snapshot label — real wiring will swap in the actual snapshot rows).
  const displayCandidates = selectedSnapshot ? filteredCandidates : filteredCandidates;

  const copyOpus = useCallback(() => {
    const lines = filteredCandidates.map(r =>
      `${r.symbol} | CONV:${r.conv} | LENS:${r.lens} | SCORE:${r.score} | IV/HV:${r.ivhv} | FwdPE:${_sf(r.fwdPE,1)} | STRIKE:$${_sf(r.strike,2)} | DTE:${r.dte} | YIELD:${_sf(r.yieldPct,1)}% | ${r.flags.join(', ')}`
    );
    const text = `SCANNER — ${new Date().toLocaleString('es-ES')}\nUniverse: ${universe} · Lenses: ${Object.entries(activeLenses).filter(([,v])=>v).map(([k])=>k).join(',')}\n\n${lines.join('\n')}`;
    try { navigator.clipboard.writeText(text); } catch {}
  }, [filteredCandidates, universe, activeLenses]);

  const copyFilterChain = useCallback(() => {
    const active = LENSES.filter(l => activeLenses[l.id]);
    const text = active.map(l => `[LENS ${l.id}] ${l.criteria}`).join('\n');
    try { navigator.clipboard.writeText(text); } catch {}
  }, [activeLenses]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── 1. Top dashboard bar ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {/* NAV */}
        <div style={{ ...S_CARD, flex: "1 1 120px" }}>
          <div style={S_LABEL}>NAV</div>
          <div style={S_VALUE}>{fmtK(MOCK_NAV)}</div>
        </div>
        {/* INIT MARGIN */}
        <div style={{ ...S_CARD, flex: "1 1 120px" }}>
          <div style={S_LABEL}>Init Margin</div>
          <div style={{ ...S_VALUE, fontSize: 18 }}>{fmtK(MOCK_INIT_MARGIN)}</div>
        </div>
        {/* MAINT MARGIN */}
        <div style={{ ...S_CARD, flex: "1 1 120px" }}>
          <div style={S_LABEL}>Maint Margin</div>
          <div style={{ ...S_VALUE, fontSize: 18 }}>{fmtK(MOCK_MAINT_MARGIN)}</div>
        </div>
        {/* CUSHION */}
        <div style={{ ...S_CARD, flex: "1 1 120px" }}>
          <div style={S_LABEL}>Cushion</div>
          <div style={{ ...S_VALUE, fontSize: 20, color: cushionColor }}>
            {_sf(cushionPct, 1)}%
          </div>
        </div>
        {/* VIX */}
        <div style={{ ...S_CARD, flex: "1 1 100px" }}>
          <div style={S_LABEL}>VIX</div>
          <div style={{
            ...S_VALUE, fontSize: 20,
            color: MOCK_VIX < 15 ? "#30d158" : MOCK_VIX < 25 ? "#ffd60a" : "#ff453a",
          }}>{_sf(MOCK_VIX, 1)}</div>
        </div>
        {/* Status + Toggle Active/Paused + Run Scan */}
        <div style={{ ...S_CARD, flex: "2 1 280px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
            {/* Master toggle pill — clic para pausar/activar el scanner */}
            <button
              onClick={toggleScanner}
              disabled={toggleBusy}
              title={scannerActive
                ? "Pausar scanner — deja de hacer llamadas a IB Gateway"
                : "Activar scanner — reanuda llamadas a IB Gateway"}
              style={{
                padding: "6px 12px", borderRadius: 999,
                border: `1px solid ${scannerActive ? "#30d158" : "#ff453a"}`,
                background: scannerActive ? "rgba(48,209,88,.12)" : "rgba(255,69,58,.12)",
                color: scannerActive ? "#30d158" : "#ff453a",
                fontSize: 10, fontWeight: 800, cursor: toggleBusy ? "wait" : "pointer",
                fontFamily: "var(--fm)", whiteSpace: "nowrap",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                background: scannerActive ? "#30d158" : "#ff453a",
                boxShadow: scannerActive ? "0 0 8px #30d158" : "none",
                animation: scannerActive ? "pulse 1.8s ease-in-out infinite" : "none",
              }} />
              {scannerActive ? "ACTIVO" : "PAUSADO"}
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={S_LABEL}>{scannerActive ? "Última ejec." : "Pausado por usuario"}</div>
              <div style={{ fontSize: 11, fontFamily: "var(--fm)", color: "var(--text-secondary)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {scannerActive ? `${MOCK_LAST_SCAN} · próx. ${MOCK_NEXT_SCAN}` : "sin llamadas IBKR"}
              </div>
            </div>
          </div>
          <button
            disabled={!scannerActive}
            title={!scannerActive ? "Scanner pausado — actívalo para ejecutar" : "Ejecutar escaneo manual ahora"}
            style={{
              padding: "7px 16px", borderRadius: 8,
              border: `1px solid ${scannerActive ? "#30d158" : "var(--border)"}`,
              background: scannerActive ? "rgba(48,209,88,.12)" : "transparent",
              color: scannerActive ? "#30d158" : "var(--text-tertiary)",
              fontSize: 11, fontWeight: 700,
              cursor: scannerActive ? "pointer" : "not-allowed",
              fontFamily: "var(--fm)", whiteSpace: "nowrap",
              opacity: scannerActive ? 1 : 0.5,
            }}
            onClick={() => {}}
          >
            RUN SCAN
          </button>
        </div>
      </div>

      {/* Banner amarillo cuando el scanner está pausado — ocupa todo el ancho */}
      {!scannerActive && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          border: "1px solid rgba(255,159,10,.4)",
          background: "rgba(255,159,10,.08)",
          color: "#ff9f0a", fontSize: 12, fontFamily: "var(--fm)",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 16 }}>⏸️</span>
          <strong>Scanner pausado</strong>
          <span style={{ color: "var(--text-secondary)" }}>
            · No se están haciendo llamadas a IB Gateway. Útil cuando estés operando manualmente en TWS.
          </span>
          <button
            onClick={toggleScanner}
            style={{
              marginLeft: "auto", padding: "4px 12px", borderRadius: 6,
              border: "1px solid #30d158", background: "rgba(48,209,88,.15)",
              color: "#30d158", fontSize: 10, fontWeight: 700,
              cursor: "pointer", fontFamily: "var(--fm)",
            }}
          >
            ▶ Activar
          </button>
        </div>
      )}

      {/* ── 2. Universe selector + Lens toggles ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* Universe dropdown */}
        <div>
          <div style={{ ...S_LABEL, marginBottom: 5 }}>Universo</div>
          <select
            value={universe}
            onChange={e => setUniverse(e.target.value)}
            style={{
              padding: "6px 10px", borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--card)", color: "var(--text-primary)",
              fontSize: 11, fontFamily: "var(--fm)", cursor: "pointer",
              outline: "none",
            }}
          >
            {UNIVERSE_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.lbl}</option>
            ))}
          </select>
        </div>

        {/* Lens toggles */}
        <div style={{ flex: 1 }}>
          <div style={{ ...S_LABEL, marginBottom: 5 }}>Lentes activos</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {LENSES.map(lens => {
              const on = activeLenses[lens.id];
              return (
                <div
                  key={lens.id}
                  style={{
                    padding: "8px 12px", borderRadius: 9,
                    border: `1px solid ${on ? lens.color : "var(--border)"}`,
                    background: on ? lens.color + "14" : "transparent",
                    cursor: "pointer", transition: "all .15s",
                    minWidth: 130,
                  }}
                  onClick={() => toggleLens(lens.id)}
                >
                  <div style={{
                    fontSize: 11, fontWeight: 700, fontFamily: "var(--fm)",
                    color: on ? lens.color : "var(--text-tertiary)",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: on ? lens.color : "var(--border)",
                      display: "inline-block", flexShrink: 0,
                    }} />
                    LENS {lens.id} — {lens.lbl}
                  </div>
                  <div style={{
                    fontSize: 8, fontFamily: "var(--fm)",
                    color: on ? lens.color + "cc" : "var(--text-tertiary)",
                    marginTop: 3, lineHeight: 1.4,
                    opacity: on ? 1 : 0.5,
                  }}>
                    {lens.criteria}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 3. Conviction breakdown ── */}
      <div style={{ ...S_CARD }}>
        <div style={{ ...S_LABEL, marginBottom: 8 }}>Conviction Scoring</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CONVICTION_CRITERIA.map(c => {
            const lens = LENSES.find(l => l.id === c.lens);
            const color = lens ? lens.color : "var(--text-tertiary)";
            const isPos = c.delta > 0;
            return (
              <span
                key={c.id}
                title={`Lens ${c.lens} · ${isPos ? "+" : ""}${c.delta} punto`}
                style={{
                  padding: "3px 9px", borderRadius: 20, fontSize: 9,
                  fontFamily: "var(--fm)", fontWeight: 700,
                  color: isPos ? color : "#ff453a",
                  background: (isPos ? color : "#ff453a") + "15",
                  border: "1px solid " + (isPos ? color : "#ff453a") + "44",
                  userSelect: "none",
                }}
              >
                {isPos ? "+" : ""}{c.delta} {c.lbl}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── 4. Main content: candidates table + right sidebar ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

        {/* ── Candidates table (flex 1) ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Table header bar */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--fm)", color: "var(--text-primary)" }}>
              Candidatos
              <span style={{
                marginLeft: 8, fontSize: 9, fontFamily: "var(--fm)",
                color: "var(--text-tertiary)",
              }}>
                {displayCandidates.length} resultados
                {selectedSnapshot && (
                  <span style={{ marginLeft: 6, color: "#c8a44e" }}>
                    · Snapshot: {MOCK_SNAPSHOTS.find(s => s.id === selectedSnapshot)?.lbl}
                  </span>
                )}
              </span>
            </div>
            {selectedSnapshot && (
              <button
                onClick={() => setSelectedSnapshot(null)}
                style={{
                  padding: "3px 10px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                  border: "1px solid var(--gold)", background: "var(--gold-dim)",
                  color: "var(--gold)", cursor: "pointer", fontFamily: "var(--fm)",
                }}
              >
                Volver a live
              </button>
            )}
          </div>

          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead>
                <tr>
                  <th style={S_TH}>AH</th>
                  <th style={S_TH}>PORT</th>
                  <th style={S_TH}>CONV</th>
                  <th style={S_TH}>LENS</th>
                  <th style={S_TH}>A</th>
                  <th style={S_TH}>B</th>
                  <th style={S_TH}>C</th>
                  <th style={S_TH_LEFT}>SYMBOL</th>
                  <th style={S_TH_LEFT}>SECTOR</th>
                  <th style={S_TH}>LAST</th>
                  <th style={S_TH}>CHG%</th>
                  <th style={S_TH}>IV/HV</th>
                  <th style={S_TH}>FWDPE</th>
                  <th style={S_TH}>TARGET</th>
                  <th style={S_TH}>DISP%</th>
                  <th style={S_TH}>DTE</th>
                  <th style={S_TH}>STRIKE</th>
                  <th style={S_TH}>PREM</th>
                  <th style={S_TH}>YIELD%</th>
                  <th style={S_TH}>SCORE</th>
                  <th style={S_TH_LEFT}>FLAGS</th>
                </tr>
              </thead>
              <tbody>
                {displayCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={21} style={{ ...S_TD, textAlign: "center", padding: 24, color: "var(--text-tertiary)" }}>
                      Sin candidatos con los lentes activos
                    </td>
                  </tr>
                ) : (
                  displayCandidates.map(row => (
                    <CandidateRow
                      key={row.symbol}
                      row={row}
                      onClick={setDetailRow}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── 5. Rejected section ── */}
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setRejectedOpen(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 8,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--text-tertiary)", fontSize: 10, fontWeight: 700,
                cursor: "pointer", fontFamily: "var(--fm)",
              }}
            >
              {rejectedOpen ? "▾" : "▸"}
              Rechazados
              <span style={{
                padding: "1px 7px", borderRadius: 10, fontSize: 9,
                background: "rgba(255,69,58,.12)", color: "#ff453a",
                border: "1px solid rgba(255,69,58,.25)", fontWeight: 700,
              }}>
                {MOCK_REJECTED.length}
              </span>
            </button>

            {rejectedOpen && (
              <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)", marginTop: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th style={S_TH_LEFT}>SYMBOL</th>
                      <th style={S_TH_LEFT}>SECTOR</th>
                      <th style={S_TH}>LAST</th>
                      <th style={S_TH}>CHG%</th>
                      <th style={S_TH}>IV/HV</th>
                      <th style={S_TH}>FWDPE</th>
                      <th style={S_TH}>SCORE</th>
                      <th style={S_TH_LEFT}>RAZÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_REJECTED.map(row => (
                      <RejectedRow key={row.symbol} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── 6. Right sidebar — Snapshot Browser ── */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <div style={{ ...S_CARD }}>
            <div style={{
              fontSize: 12, fontWeight: 700, fontFamily: "var(--fm)",
              color: "var(--text-primary)", marginBottom: 2,
            }}>
              Snapshot Browser
            </div>
            <div style={{
              fontSize: 9, fontFamily: "var(--fm)",
              color: "var(--text-tertiary)", marginBottom: 10,
            }}>
              Capturas horarias — elige un momento para inspeccionar
            </div>

            <select
              value={selectedSnapshot || ""}
              onChange={e => setSelectedSnapshot(e.target.value || null)}
              style={{
                width: "100%", padding: "6px 10px", borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card)", color: "var(--text-primary)",
                fontSize: 11, fontFamily: "var(--fm)", cursor: "pointer",
                outline: "none", marginBottom: 6,
              }}
            >
              <option value="">Live (ahora)</option>
              {MOCK_SNAPSHOTS.map(s => (
                <option key={s.id} value={s.id}>
                  {s.lbl} {s.delta} · {s.count} candidatos
                </option>
              ))}
            </select>

            <div style={{
              fontSize: 9, fontFamily: "var(--fm)",
              color: "var(--text-tertiary)",
            }}>
              {MOCK_SNAPSHOTS.length} capturas disponibles
            </div>

            {/* Snapshot mini-list */}
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              {MOCK_SNAPSHOTS.slice(0, 5).map(s => {
                const isSelected = selectedSnapshot === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSnapshot(isSelected ? null : s.id)}
                    style={{
                      padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                      border: `1px solid ${isSelected ? "var(--gold)" : "var(--border)"}`,
                      background: isSelected ? "var(--gold-dim)" : "var(--subtle-bg)",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      transition: "all .1s",
                    }}
                  >
                    <span style={{
                      fontSize: 10, fontFamily: "var(--fm)",
                      color: isSelected ? "var(--gold)" : "var(--text-secondary)",
                      fontWeight: isSelected ? 700 : 500,
                    }}>
                      {s.lbl}
                    </span>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <span style={{
                        fontSize: 9, fontFamily: "var(--fm)",
                        color: s.delta.startsWith("+") ? "#30d158" : s.delta === "=" ? "var(--text-tertiary)" : "#ff453a",
                        fontWeight: 700,
                      }}>{s.delta}</span>
                      <span style={{
                        padding: "1px 5px", borderRadius: 8, fontSize: 8,
                        background: "rgba(200,164,78,.12)",
                        color: "var(--gold)", fontFamily: "var(--fm)", fontWeight: 700,
                      }}>{s.count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── 7. Bottom action bar ── */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center",
        padding: "10px 14px",
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 10, flexWrap: "wrap",
      }}>
        <button
          onClick={copyOpus}
          style={{
            padding: "7px 16px", borderRadius: 8,
            border: "1px solid #c8a44e", background: "rgba(200,164,78,.12)",
            color: "#c8a44e", fontSize: 11, fontWeight: 700,
            cursor: "pointer", fontFamily: "var(--fm)",
          }}
        >
          Copiar para Opus
        </button>
        <button
          onClick={copyFilterChain}
          style={{
            padding: "6px 12px", borderRadius: 8,
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--text-secondary)", fontSize: 10, fontWeight: 600,
            cursor: "pointer", fontFamily: "var(--fm)",
          }}
        >
          Copiar Filter Chain
        </button>
        <div style={{
          marginLeft: "auto", fontSize: 9, fontFamily: "var(--fm)",
          color: "var(--text-tertiary)",
        }}>
          Ultimo scan: {MOCK_LAST_SCAN} · Proximo: {MOCK_NEXT_SCAN}
        </div>
      </div>

      {/* ── Detail modal (placeholder) ── */}
      {detailRow && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,.55)", zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setDetailRow(null)}
        >
          <div
            style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 14, padding: 24, minWidth: 340, maxWidth: 480,
              boxShadow: "0 20px 60px rgba(0,0,0,.6)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: 20, fontWeight: 700, color: "var(--gold)", fontFamily: "var(--fm)" }}>
                  {detailRow.symbol}
                </span>
                {capBadge(detailRow.cap)}
                <span style={{
                  marginLeft: 8, fontSize: 9, color: "var(--text-tertiary)",
                  fontFamily: "var(--fm)",
                }}>{detailRow.sector}</span>
              </div>
              <button
                onClick={() => setDetailRow(null)}
                style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 16 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {[
                { lbl: "SCORE", val: detailRow.score, color: scoreBg(detailRow.score).fg },
                { lbl: "CONVICTION", val: detailRow.conv, color: convColor(detailRow.conv) },
                { lbl: "LENS", val: "Lens " + detailRow.lens, color: lensColor(detailRow.lens) },
                { lbl: "IV/HV", val: detailRow.ivhv, color: ivhvColor(detailRow.ivhv) },
                { lbl: "STRIKE", val: "$" + _sf(detailRow.strike, 2), color: "var(--text-primary)" },
                { lbl: "DTE", val: detailRow.dte + "d", color: "var(--text-primary)" },
                { lbl: "PRIMA", val: "$" + _sf(detailRow.prem, 2), color: "var(--gold)" },
                { lbl: "YIELD ANN.", val: _sf(detailRow.yieldPct, 1) + "%", color: "#30d158" },
              ].map(item => (
                <div key={item.lbl} style={{
                  padding: "8px 10px", borderRadius: 8,
                  background: "var(--subtle-bg)", border: "1px solid var(--border)",
                }}>
                  <div style={{ ...S_LABEL }}>{item.lbl}</div>
                  <div style={{ fontSize: 16, fontFamily: "var(--fm)", fontWeight: 700, color: item.color, marginTop: 2 }}>
                    {item.val}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 9, fontFamily: "var(--fm)", color: "var(--text-tertiary)", lineHeight: 1.6 }}>
              {detailRow.flags.join(" · ")}
            </div>

            <div style={{ marginTop: 12, fontSize: 9, fontFamily: "var(--fm)", color: "var(--text-tertiary)", fontStyle: "italic" }}>
              Drill-down completo disponible cuando se conecte IB Bridge.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
