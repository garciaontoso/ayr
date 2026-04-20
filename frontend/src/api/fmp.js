import { API_URL } from '../constants/index.js';
import { loadCompanyFromStorage } from '../utils/storage.js';

export async function fetchViaFMP(ticker, { forceRefresh = false } = {}) {
  const refreshParam = forceRefresh ? "&refresh=1" : "";
  const resp = await fetch(`${API_URL}/api/fundamentals?symbol=${encodeURIComponent(ticker)}${refreshParam}`);
  if (!resp.ok) throw new Error(`API error ${resp.status}`);
  let data = await resp.json();

  // Handle SW offline response — try localStorage fallback, then Cache API direct read
  if (data && data.error === "offline") {
    // 1) Try localStorage (airplane mode saves parsed fin + fmpExtra here)
    const stored = await loadCompanyFromStorage(ticker);
    if (stored && stored.fin && typeof stored.fin === 'object' && Object.keys(stored.fin).length > 0) {
      console.info(`[FMP] ${ticker}: usando datos offline de localStorage`);
      // Normalize structure: airplane mode stores fmpExtra wrapped, but callers expect fmpRating/fmpDCF flat
      if (stored.fmpExtra && !stored.fmpRating) {
        stored.fmpRating = stored.fmpExtra.rating || {};
        stored.fmpDCF = stored.fmpExtra.dcf || {};
        stored.fmpEstimates = stored.fmpExtra.estimates || [];
        stored.fmpPriceTarget = stored.fmpExtra.priceTarget || {};
        stored.fmpKeyMetrics = stored.fmpExtra.keyMetrics || [];
        stored.fmpFinGrowth = stored.fmpExtra.finGrowth || [];
        stored.fmpGrades = stored.fmpExtra.grades || {};
        stored.fmpOwnerEarnings = stored.fmpExtra.ownerEarnings || [];
        stored.fmpRevSegments = stored.fmpExtra.revSegments || [];
        stored.fmpGeoSegments = stored.fmpExtra.geoSegments || [];
        stored.fmpPeers = stored.fmpExtra.peers || [];
        stored.fmpEarnings = stored.fmpExtra.earnings || [];
        stored.fmpPtSummary = stored.fmpExtra.ptSummary || {};
        if (!stored.profile) stored.profile = stored.fmpExtra.profile || {};
      }
      return stored;
    }
    // 2) Try Cache API directly (airplane mode also stores raw API responses there)
    if (data && data.error === "offline") {
      try {
        const cache = await caches.open("ayr-offline-data");
        const cachedResp = await cache.match(`${API_URL}/api/fundamentals?symbol=${encodeURIComponent(ticker)}`);
        if (!cachedResp) {
          // Also try without encodeURIComponent (airplane mode saves with raw ticker)
          const cachedResp2 = await cache.match(`${API_URL}/api/fundamentals?symbol=${ticker}`);
          if (cachedResp2) {
            const cachedData = await cachedResp2.json();
            if (cachedData && cachedData.income && cachedData.income.length > 0) {
              console.info(`[FMP] ${ticker}: usando datos offline de Cache API (raw key)`);
              data = cachedData;
            }
          }
        } else {
          const cachedData = await cachedResp.json();
          if (cachedData && cachedData.income && cachedData.income.length > 0) {
            console.info(`[FMP] ${ticker}: usando datos offline de Cache API`);
            data = cachedData;
          }
        }
      } catch(e) { console.warn(`[FMP] ${ticker}: Cache API fallback failed:`, e.message); }
    }
    if (data && data.error === "offline") {
      throw new Error(`${ticker}: sin conexion y sin datos en cache local`);
    }
  }

  if (!data.income || data.income.length === 0) throw new Error(`No hay datos de FMP para ${ticker}. ¿Es un ticker US?`);

  const fin = {};
  const incomeByYear = {};
  data.income.forEach(d => { incomeByYear[d.fiscalYear] = d; });
  const balByYear = {};
  (data.balance || []).forEach(d => { balByYear[d.fiscalYear] = d; });
  const cfByYear = {};
  (data.cashflow || []).forEach(d => { cfByYear[d.fiscalYear] = d; });
  const ratByYear = {};
  (data.ratios || []).forEach(d => { if(d.fiscalYear) ratByYear[d.fiscalYear] = d; });

  const allYears = [...new Set([...Object.keys(incomeByYear), ...Object.keys(balByYear), ...Object.keys(cfByYear)])].sort().reverse().slice(0, 10);

  allYears.forEach(yStr => {
    const y = parseInt(yStr, 10);
    const inc = incomeByYear[yStr] || {};
    const bal = balByYear[yStr] || {};
    const cf = cfByYear[yStr] || {};
    const rat = ratByYear[yStr] || {};

    const M = v => (v || 0) / 1e6;

    fin[y] = {
      revenue: M(inc.revenue),
      grossProfit: M(inc.grossProfit),
      operatingIncome: M(inc.operatingIncome),
      netIncome: M(inc.netIncome),
      eps: inc.epsDiluted || inc.eps || 0,
      epsBasic: inc.eps || 0,
      epsDiluted: inc.epsDiluted || inc.eps || 0,
      dps: rat.dividendPerShare || 0,
      sharesOut: M(inc.weightedAverageShsOutDil || inc.weightedAverageShsOut),
      totalDebt: M((bal.totalDebt || 0) || ((bal.longTermDebt || 0) + (bal.shortTermDebt || 0))),
      cash: M(bal.cashAndCashEquivalents || bal.cashAndShortTermInvestments || 0),
      equity: M(bal.totalStockholdersEquity || bal.totalEquity || 0),
      retainedEarnings: M(bal.retainedEarnings || 0),
      ocf: M(cf.operatingCashFlow || cf.netCashProvidedByOperatingActivities || 0),
      capex: Math.abs(M(cf.capitalExpenditure || 0)),
      interestExpense: M(inc.interestExpense || 0),
      depreciation: M(inc.depreciationAndAmortization || cf.depreciationAndAmortization || 0),
      taxProvision: M(inc.incomeTaxExpense || 0),
    };
  });

  if (Object.keys(fin).length === 0) throw new Error("No se encontraron datos financieros para " + ticker);

  if (data.dividends && data.dividends.length > 0) {
    const dpsByYear = {};
    data.dividends.forEach(d => {
      const y = new Date(d.date || d.paymentDate || "").getFullYear();
      if (y && y >= 2010) dpsByYear[y] = (dpsByYear[y] || 0) + (d.dividend || d.adjDividend || 0);
    });
    Object.keys(dpsByYear).forEach(yStr => {
      const y = parseInt(yStr, 10);
      if (fin[y]) fin[y].dps = Math.round(dpsByYear[y] * 100) / 100;
    });
  }

  const prof = data.profile || {};
  return {
    fin,
    cfg: {
      ticker: ticker.toUpperCase(),
      name: prof.companyName || ticker,
      price: prof.price || 0,
      currency: prof.currency || "USD",
      beta: prof.beta || 1.0,
    },
    profile: prof,
    fmpRating: data.rating || {},
    fmpDCF: data.dcf || {},
    fmpEstimates: data.estimates || [],
    fmpPriceTarget: data.priceTarget || {},
    fmpKeyMetrics: data.keyMetrics || [],
    fmpFinGrowth: data.finGrowth || [],
    fmpGrades: data.grades || {},
    fmpOwnerEarnings: data.ownerEarnings || [],
    fmpRevSegments: data.revSegments || [],
    fmpGeoSegments: data.geoSegments || [],
    fmpPeers: data.peers || [],
    fmpEarnings: data.earnings || [],
    fmpPtSummary: data.ptSummary || {},
  };
}

// Legacy wrapper
export async function fetchViaClaudeAPI(ticker, apiKey) {
  return fetchViaFMP(ticker);
}
