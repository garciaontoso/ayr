export const APP_VERSION = "3.3";
export const _CURRENT_YEAR = new Date().getFullYear();
export const YEARS = Array.from({length:18}, (_,i) => _CURRENT_YEAR-i);
export const PROJ_YEARS = Array.from({length:10}, (_,i) => _CURRENT_YEAR+i);

export const CURRENCIES = {
  USD: {symbol:"$", name:"US Dollar", flag:"🇺🇸"},
  EUR: {symbol:"€", name:"Euro", flag:"🇪🇺"},
  GBP: {symbol:"£", name:"British Pound", flag:"🇬🇧"},
  GBX: {symbol:"p", name:"British Pence", flag:"🇬🇧", parentCcy:"GBP", divisor:100},
  CAD: {symbol:"C$", name:"Canadian Dollar", flag:"🇨🇦"},
  AUD: {symbol:"A$", name:"Australian Dollar", flag:"🇦🇺"},
  HKD: {symbol:"HK$", name:"Hong Kong Dollar", flag:"🇭🇰"},
  JPY: {symbol:"¥", name:"Japanese Yen", flag:"🇯🇵"},
  CHF: {symbol:"Fr", name:"Swiss Franc", flag:"🇨🇭"},
  DKK: {symbol:"kr", name:"Danish Krone", flag:"🇩🇰"},
  SEK: {symbol:"kr", name:"Swedish Krona", flag:"🇸🇪"},
  NOK: {symbol:"kr", name:"Norwegian Krone", flag:"🇳🇴"},
  SGD: {symbol:"S$", name:"Singapore Dollar", flag:"🇸🇬"},
  CNY: {symbol:"¥", name:"Chinese Yuan", flag:"🇨🇳"},
};

export const DISPLAY_CCYS = ["USD","EUR","GBP","CAD","AUD"];

export const DEFAULT_FX = {USD:1, EUR:0.876, GBP:0.756, CAD:1.44, AUD:1.59, HKD:7.78, JPY:148.5, CHF:0.88, DKK:6.54, SEK:9.85, NOK:10.35, SGD:1.34, GBX:0.756, CNY:7.24};

// ── Dividend withholding tax treaty rates ────────────────────
// User is Chinese fiscal resident. These are used as FALLBACKS when
// per-ticker historical net/gross ratios aren't available (e.g. brand-new
// positions with no payment history yet). The canonical source-of-truth
// is still the IB Flex divLog (d.net/d.gross).
// Discrepancy Audit (2026-04-08) flagged the DividendosTab fallback 0.94
// (6% WHT) as wrong for a Chinese resident on US dividends — should be 0.90.
export const WHT_TREATY_RATES = {
  US: 0.10,   // China-US treaty
  CA: 0.15,   // Canada-China treaty
  GB: 0.00,   // UK no WHT on dividends
  DE: 0.15,   // Germany
  FR: 0.15,   // France-China treaty
  ES: 0.19,   // Spain (19% non-resident)
  CH: 0.35,   // Switzerland (35% before refund)
  AU: 0.15,   // Australia
  HK: 0.00,   // Hong Kong no WHT
  CN: 0.10,   // A-shares
  JP: 0.10,   // Japan-China treaty
  NL: 0.10,   // Netherlands
  IE: 0.00,   // Ireland
  DK: 0.27,   // Denmark
  SE: 0.30,   // Sweden
  NO: 0.25,   // Norway
  SG: 0.00,   // Singapore no WHT
  _default: 0.15, // generic fallback
};
// Effective net rate after WHT. e.g. US: 1 - 0.10 = 0.90.
export const WHT_NET_RATE = (country) =>
  1 - (WHT_TREATY_RATES[country] ?? WHT_TREATY_RATES._default);
// Default blended net rate for a portfolio of mostly US dividends.
// Use this as the fallback constant in place of magic 0.94.
export const DEFAULT_WHT_NET = 0.90;

export const TABS = [
  {id:"dash",lbl:"Resumen",ico:"◈"},
  {id:"tesis",lbl:"Tesis",ico:"📝"},
  {id:"transcript",lbl:"Transcript",ico:"📞"},
  {id:"archive",lbl:"Archivo",ico:"🗄"},
  {id:"business",lbl:"Cómo gana $",ico:"👶"},
  {id:"chart",lbl:"Chart",ico:"📈"},
  {id:"claude",lbl:"Claude",ico:"🧠"},
  {id:"qualityAll",lbl:"Calidad",ico:"◆"},
  {id:"debt",lbl:"Deuda",ico:"⬡"},
  {id:"divAll",lbl:"Dividendos",ico:"💰"},
  {id:"valAll",lbl:"Valoración",ico:"◎"},
  {id:"verdict",lbl:"Veredicto",ico:"★"},
  {id:"data",lbl:"Datos",ico:"▤"},
  {id:"report",lbl:"Informe",ico:"📄"},
  {id:"dst",lbl:"DividendST",ico:"📊"},
  {id:"options",lbl:"Opciones",ico:"🔗"},
];

// TABS_OLD removed 2026-04-08 — these were 11 zombie sub-tabs that lived
// only in App.jsx routing but never appeared in TABS. They were merged
// into the 4 mega-tabs `qualityAll`, `divAll`, `valAll`, `verdict` long
// ago. The individual routes still resolve via App.jsx content dict but
// nothing renders them. Audit B identified this as critical dead code.

export const API_URL = "https://api.onto-so.com";

// HOME_TAB_GROUPS — 2-level navigation (added 2026-04-08).
// 21 flat tabs are now grouped into 6 logical categories.
// Top row in HomeView renders the group labels; second row renders
// the tabs inside the active group. Tab IDs stay identical so all
// existing routing in App.jsx keeps working.
//
// Drag-and-drop reordering is preserved WITHIN a group only.
// User preference for per-group ordering persists via /api/preferences.
//
// Icon dedup applied 2026-04-08:
//   Dashboard 📊 (kept) · Trades was 📊 → 📈
//   Gastos 💸 (kept) · Mi Nomina was 💸 → 🧾
//   Earnings was 📊 → 📅 (calendar metaphor matches its content)
export const HOME_TAB_GROUPS = [
  {
    id: "cartera",
    lbl: "Cartera",
    ico: "💼",
    tabs: [
      {id:"briefing",lbl:"Briefing",ico:"☀️"},
      {id:"portfolio",lbl:"Portfolio",ico:"💼"},
      {id:"agentes",lbl:"Agentes",ico:"🤖"},
      {id:"dashboard",lbl:"Dashboard",ico:"📊"},
      {id:"trades",lbl:"Trades",ico:"📈"},
      {id:"earnings",lbl:"Earnings",ico:"📅"},
      {id:"advisor",lbl:"Advisor",ico:"🧭"},
      {id:"earnings-archive",lbl:"Archive",ico:"🗄"},
      {id:"deep-dividend",lbl:"Deep Dividend",ico:"🔬"},
      {id:"peer-compare",lbl:"Comparar",ico:"⚖️"},
      {id:"watchlist",lbl:"Watchlist",ico:"👁"},
      {id:"historial",lbl:"Historial",ico:"📦"},
    ],
  },
  {
    id: "ingresos",
    lbl: "Ingresos",
    ico: "💰",
    tabs: [
      {id:"dividendos",lbl:"Dividendos",ico:"💰"},
      {id:"opciones-cs",lbl:"Credit Spreads",ico:"🎯"},
      {id:"opciones-roc",lbl:"ROC",ico:"📞"},
      {id:"opciones-rop",lbl:"ROP",ico:"🛡"},
      {id:"opciones-leaps",lbl:"LEAPS & Calls",ico:"📅"},
      {id:"opciones-resumen",lbl:"Resumen",ico:"📊"},
      {id:"opciones-orphans",lbl:"Sin loguear",ico:"⚠️"},
      {id:"income",lbl:"Income",ico:"🥦"},
    ],
  },
  {
    id: "finanzas",
    lbl: "Finanzas",
    ico: "💸",
    tabs: [
      {id:"gastos",lbl:"Gastos",ico:"💸"},
      {id:"presupuesto",lbl:"Presupuesto",ico:"📋"},
      {id:"nomina",lbl:"Mi Nomina",ico:"🧾"},
      {id:"patrimonio",lbl:"Patrimonio",ico:"🏛"},
      {id:"fire",lbl:"FIRE",ico:"🔥"},
      {id:"tax-opt",lbl:"Impuestos",ico:"🧾"},
    ],
  },
  {
    id: "mercado",
    lbl: "Mercado",
    ico: "🌍",
    tabs: [
      {id:"macro",lbl:"Macro",ico:"🌍"},
      {id:"currency",lbl:"Currency",ico:"💱"},
      {id:"news",lbl:"News",ico:"📰"},
      {id:"screener",lbl:"Screener",ico:"🔬"},
    ],
  },
  {
    id: "research",
    lbl: "Research",
    ico: "🔍",
    tabs: [
      {id:"discovery",lbl:"Discovery",ico:"💡"},
      {id:"div-scanner",lbl:"Scanner",ico:"🔎"},
      {id:"cartas-sabios",lbl:"Cartas Sabios",ico:"📜"},
      {id:"research",lbl:"Radar",ico:"📡"},
      {id:"smart-money",lbl:"Smart Money",ico:"🏛️"},
      {id:"videos-youtube",lbl:"Vídeos YouTube",ico:"▶️"},
      {id:"library",lbl:"Library",ico:"📚"},
      {id:"backtest",lbl:"Backtest",ico:"🎯"},
    ],
  },
];

// HOME_TABS — kept as a flat array derived from HOME_TAB_GROUPS for
// backward compatibility (App.jsx global Cmd+K search, tests, and any
// legacy consumers). Order matches the groups above.
export const HOME_TABS = HOME_TAB_GROUPS.flatMap(g => g.tabs);
