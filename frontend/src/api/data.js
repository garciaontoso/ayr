import { API_URL } from '../constants/index.js';

// Safe fetch: returns data on success, fallback on failure, and tracks errors
async function safeFetch(path, fallback) {
  try {
    const r = await fetch(API_URL + path);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return { data: await r.json(), error: null };
  } catch (e) {
    console.warn(`[API] ${path} failed:`, e.message);
    return { data: fallback, error: `${path}: ${e.message}` };
  }
}

// Fetch all data from API — returns a data object with partial error tracking
export async function fetchAllData() {
  try {
    const endpoints = [
      safeFetch("/api/patrimonio", []),
      safeFetch("/api/ingresos", []),
      safeFetch("/api/dividendos/resumen", []),
      safeFetch("/api/dividendos/mensual", []),
      safeFetch("/api/dividendos", []),
      safeFetch("/api/gastos/mensual", []),
      safeFetch("/api/gastos", []),
      safeFetch("/api/holdings", []),
      safeFetch("/api/fire", {tracking:[],proyecciones:[],params:null}),
      safeFetch("/api/pl", []),
      safeFetch("/api/config", {}),
      safeFetch("/api/categorias", []),
      safeFetch("/api/cash/latest", []),
      safeFetch("/api/margin-interest", []),
      safeFetch("/api/positions", {positions:[]}),
    ];

    const results = await Promise.all(endpoints);
    const errors = results.map(r => r.error).filter(Boolean);
    const [patrimonio, ingresos, divResumen, divMensual, divAll, gastosMensual, gastosAll, holdings, fire, pl, config, categorias, cashData, marginInterest, positionsData] = results.map(r => r.data);

    // Map API responses to expected formats
    const CTRL_DATA = patrimonio.map(p => ({
      d: p.fecha, fx: p.fx_eur_usd, bk: p.bank, br: p.broker, fd: p.fondos,
      cr: p.crypto, hp: p.hipoteca, pu: p.total_usd, pe: p.total_eur, sl: p.salary
    }));

    const INCOME_DATA = ingresos.map(d => ({
      m: d.mes, div: d.dividendos, cs: d.covered_calls, rop: d.rop, roc: d.roc,
      cal: d.cal, leaps: d.leaps, total: d.total, gast: d.gastos_usd, sl: d.salary
    }));

    const DIV_BY_YEAR = {};
    divResumen.forEach(d => { DIV_BY_YEAR[d.anio] = {g: d.bruto, n: d.neto, c: d.cobros}; });

    const DIV_BY_MONTH = {};
    divMensual.forEach(d => { DIV_BY_MONTH[d.mes] = {g: d.bruto, n: d.neto, c: d.cobros}; });

    const GASTOS_MONTH = {};
    gastosMensual.forEach(d => { GASTOS_MONTH[d.mes] = {eur: d.eur, cny: d.cny, usd: d.usd}; });

    const HIST_INIT = holdings.map(h => ({
      t: h.ticker, n: h.num_trades, s: h.shares, d: h.div_total, o: h.opciones_pl
    }));

    let FIRE_PROJ = [];
    if (fire.proyecciones) {
      FIRE_PROJ = fire.proyecciones.map(p => ({
        y: p.anio, s: p.inicio, e: p.fin, r: p.retorno_pct, sl: p.salary, g: p.gastos
      }));
    }

    let FI_TRACK = [];
    if (fire.tracking) {
      FI_TRACK = fire.tracking.map(t => ({
        m: t.mes, fi: t.fi, cov: t.cobertura, sav: t.ahorro, acc: t.acumulado
      }));
    }

    let FIRE_PARAMS = {target:1350000,returnPct:0.11,inflation:0.025,monthlyExp:4000};
    if (fire.params) FIRE_PARAMS = fire.params;
    if (config.fire_params) FIRE_PARAMS = config.fire_params;

    const ANNUAL_PL = pl.map(d => ({
      y: d.anio, sueldo: d.sueldo, bolsa: d.bolsa, div: d.dividendos, cs: d.covered_calls,
      rop: d.rop, roc: d.roc, leaps: d.leaps, cal: d.cal, gastos: d.gastos
    }));

    const GASTO_CATS = {};
    categorias.forEach(c => { GASTO_CATS[c.codigo] = c.nombre; });

    // Dividend entries (parsed, replaces expandDivInit)
    const _DIV_ENTRIES = divAll.map((d,i) => ({
      id: "dv_"+String(i).padStart(4,"0"), date: d.fecha, ticker: d.ticker, company: d.ticker,
      gross: d.bruto, net: d.neto, taxPct: d.bruto > 0 && d.neto ? Math.round((1-d.neto/d.bruto)*100) : 30,
      currency: d.divisa || "USD", broker: "IB", shares: d.shares || 0
    }));

    // Gasto entries (parsed, replaces expandGastosInit)
    const CODE_TO_CAT = {SUP:"Supermercado",COM:"Restaurante",TRA:"Transporte",ROP:"Ropa",HEA:"Salud",SUB:"Suscripciones",CAP:"Caprichos",DEP:"Deportes",UTI:"Utilities",BAR:"Barco",MAS:"Masajes",SBL:"Bolsa",UCH:"Utilities China",COC:"Transporte",REG:"Regalos",VIA:"Viajes",MED:"Salud",ALQ:"Alquiler",ENT:"Ocio",HIP:"Hipoteca",HOM:"Casa",EDU:"Educacion",AVI:"Aviacion",ING:"Ingreso",OTH:"Otros"};
    const _GASTO_ENTRIES = gastosAll.map((g,i) => ({
      id: g.id || ("g_"+String(i).padStart(5,"0")), date: g.fecha, cat: CODE_TO_CAT[g.categoria] || GASTO_CATS[g.categoria] || g.categoria,
      catCode: g.categoria, amount: g.importe, recur: false, currency: g.divisa || "EUR",
      tipo: (g.descripcion||"").includes("{china}") ? "china" : (g.descripcion||"").includes("{extra}") ? "extra" : "normal",
      detail: (g.descripcion||"").replace(/\{china\}\s?/g,"").replace(/\{extra\}\s?/g,"").replace(/^\[.*?\]\s*/,"")
    }));

    // Aggregate spending by category name
    const GASTOS_CAT = {};
    _GASTO_ENTRIES.forEach(g => {
      if(!GASTOS_CAT[g.cat]) GASTOS_CAT[g.cat] = 0;
      GASTOS_CAT[g.cat] += g.amount;
    });

    const CASH_DATA = cashData || [];
    const MARGIN_INTEREST_DATA = marginInterest || [];

    // D1 positions (dynamic, replaces hardcoded POS_STATIC over time)
    const D1_POSITIONS = (positionsData?.positions || []).reduce((acc, p) => {
      acc[p.ticker] = {
        n: p.name, lp: p.last_price, ap: p.avg_price, cb: p.cost_basis,
        sh: p.shares, c: p.currency, fx: p.fx, tg: p.strategy, cat: p.category,
        ls: p.list, mv: p.market_value, uv: p.usd_value, ti: p.total_invested,
        pnl: p.pnl_pct, pnlAbs: p.pnl_abs, divTTM: p.div_ttm, dy: p.div_yield,
        yoc: p.yoc, mc: p.market_cap, sec: p.sector,
      };
      return acc;
    }, {});

    return {
      ok: true,
      errors,
      CTRL_DATA, INCOME_DATA, DIV_BY_YEAR, DIV_BY_MONTH, GASTOS_MONTH,
      FIRE_PROJ, FIRE_PARAMS, ANNUAL_PL, FI_TRACK, HIST_INIT, GASTO_CATS,
      _DIV_ENTRIES, _GASTO_ENTRIES, GASTOS_CAT, CASH_DATA, MARGIN_INTEREST_DATA,
      D1_POSITIONS,
    };
  } catch(e) {
    console.error("Failed to fetch data from API:", e);
    return { ok: false, errors: [e.message] };
  }
}
