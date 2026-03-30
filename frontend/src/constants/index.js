export const APP_VERSION = "1.0";
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

export const TABS = [
  {id:"dash",lbl:"Resumen",ico:"◈"},
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

export const TABS_OLD = [
  {id:"quality"},{id:"big5"},{id:"tencap"},{id:"payback"},
  {id:"valuation"},{id:"mos"},{id:"fastgraphs"},{id:"weiss"},
  {id:"checklist"},{id:"growth"},{id:"dividends"},
];

export const API_URL = "https://aar-api.garciaontoso.workers.dev";

export const HOME_TABS = [
  {id:"portfolio",lbl:"Portfolio",ico:"💼"},
  {id:"covered-calls",lbl:"CC Income",ico:"📞"},
  {id:"income-lab",lbl:"Income Lab",ico:"🧪"},
  {id:"dividendos",lbl:"Dividendos",ico:"💰"},
  {id:"screener",lbl:"Screener",ico:"🔬"},
  {id:"advisor",lbl:"Advisor",ico:"🧭"},
  {id:"trades",lbl:"Trades",ico:"📊"},
  {id:"patrimonio",lbl:"Patrimonio",ico:"🏛"},
  {id:"dashboard",lbl:"Dashboard",ico:"📊"},
  {id:"fire",lbl:"FIRE",ico:"🔥"},
  {id:"presupuesto",lbl:"Presupuesto",ico:"📋"},
  {id:"gastos",lbl:"Gastos",ico:"💸"},
  {id:"control",lbl:"Control",ico:"📋"},
  {id:"watchlist",lbl:"Watchlist",ico:"👁"},
  {id:"historial",lbl:"Historial",ico:"📦"},
  {id:"research",lbl:"Research",ico:"🔍"},
];
