import { useMemo, useCallback, useEffect } from 'react';
import { n, div, _sf } from '../utils/formatters';
import { rate, R } from '../utils/ratings';
import { YEARS } from '../constants/index.js';
import { calcWACC } from '../calculators/wacc';
import { calcPiotroski } from '../calculators/piotroski';
import { calcAltmanZ } from '../calculators/altmanZ';
import { calcGrowthRate } from '../calculators/growthRate';
import { calcDividendAnalysis } from '../calculators/dividendAnalysis';
import { isChronoAsc } from '../utils/userPrefs';

export function useAnalysisMetrics({ fin, cfg, setSsd, fmpExtra }) {
  // 2026-05-03: chronoAsc = user prefers oldest→newest left-to-right order
  // (standard finance convention). DATA_YEARS keeps its descending semantics
  // for streak calcs that expect [0]=latest; consumers that RENDER tables
  // should use DISPLAY_YEARS so they auto-flip per user preference.
  const chronoAsc = isChronoAsc();
  // ─── Computed Metrics ────────────────────────────
  const comp = useMemo(()=>{
    const c = {};
    // 2026-05-03: build a year→FMP keyMetrics index so EV, EBITDA and ratios
    // can be sourced from FMP's per-year TTM calculation (more reliable than
    // our hand-built numbers, which can diverge with non-standard EBITDA defs).
    const kmByYear = {};
    if (fmpExtra?.keyMetrics && Array.isArray(fmpExtra.keyMetrics)) {
      fmpExtra.keyMetrics.forEach(k => {
        const yr = k?.fiscalYear || (k?.date ? +k.date.slice(0,4) : null);
        if (yr) kmByYear[yr] = k;
      });
    }
    YEARS.forEach(y=>{
      const d = fin[y]; if(!d) return;
      const dPrev = fin[y-1] || null;
      const fcf = d.ocf - d.capex;
      const nd = d.totalDebt - d.cash;
      const ebitda = d.operatingIncome + d.depreciation;
      const ev = (cfg.price * (d.sharesOut||1)) + nd;
      // FMP's pre-computed EV/EBITDA TTM (more reliable than our recomputation).
      // Keep the hand-built `eve` as fallback so years without keyMetrics still work.
      const km = kmByYear[y];
      const eveFMP = +km?.evToEBITDA || +km?.enterpriseValueOverEBITDA;
      // ROE/ROIC con avg equity (estándar GuruFocus/Morningstar/CFA, no Buffett "ending")
      const avgEquity = dPrev?.equity ? (d.equity + dPrev.equity) / 2 : d.equity;
      const ndPrev = dPrev ? (dPrev.totalDebt - dPrev.cash) : null;
      const avgInvCap = (dPrev?.equity != null && ndPrev != null)
        ? ((d.equity + nd) + (dPrev.equity + ndPrev)) / 2
        : (d.equity + nd);
      c[y] = {
        fcf, netDebt:nd, ebitda, ev,
        gm: div(d.grossProfit, d.revenue),
        om: div(d.operatingIncome, d.revenue),
        nm: div(d.netIncome, d.revenue),
        roe: div(d.netIncome, avgEquity),
        roeBuffett: div(d.netIncome, d.equity),
        roic: div(d.operatingIncome*(1-(cfg.taxRate/100)), avgInvCap),
        roicBuffett: div(d.operatingIncome*(1-(cfg.taxRate/100)), d.equity+nd),
        fcfm: div(fcf, d.revenue),
        cfm: div(d.ocf, d.revenue),
        ocfCapex: div(d.ocf, d.capex),
        d2fcf: fcf>0 ? div(nd, fcf) : null,
        ic: div(d.operatingIncome, d.interestExpense),
        nd2cap: div(nd, nd+d.equity),
        d2ebit: d.operatingIncome>0 ? div(nd, d.operatingIncome) : null,
        nd2ocf: d.ocf>0 ? div(nd, d.ocf) : null,
        nd2rev: div(nd, d.revenue),
        int2ocf: div(d.interestExpense, d.ocf),
        eve: (Number.isFinite(eveFMP) && eveFMP > 0) ? eveFMP
             : (ebitda > 0 ? div(ev, ebitda) : null),
        pb: div(cfg.price, div(d.equity, d.sharesOut)),
        bvps: div(d.equity, d.sharesOut),
        fcfps: div(fcf, d.sharesOut),
        fcfPayout: fcf>0 ? div(d.dps*d.sharesOut, fcf) : null,
        ePayout: d.netIncome>0 ? div(d.dps*d.sharesOut, d.netIncome) : null,
        fcfAlloc: {
          divs: d.dividendsPaid || 0,
          buybacks: d.buybacks || 0,
          debtPaydown: d.debtRepayment || 0,
          acquisitions: d.acquisitions || 0,
          retained: Math.max(0, fcf - (d.dividendsPaid||0) - (d.buybacks||0) - (d.debtRepayment||0) - (d.acquisitions||0)),
        },
        roicR1: div(d.netIncome, d.equity + d.totalDebt - d.cash),
        revps: div(d.revenue, d.sharesOut),
        oe: d.netIncome + d.depreciation - d.capex,
        oeps: div(d.netIncome + d.depreciation - d.capex, d.sharesOut),
      };
    });
    return c;
  },[fin, cfg.price, cfg.taxRate, fmpExtra?.keyMetrics]);

  const latestDataYear = YEARS.find(y => fin[y]?.revenue > 0) || YEARS[0];
  const prevDataYear = YEARS.find(y => y < latestDataYear && fin[y]?.revenue > 0) || YEARS[1];
  const DATA_YEARS = YEARS.filter(y => fin[y]?.revenue > 0).slice(0, 10);
  const CHART_YEARS = [...DATA_YEARS].reverse();
  // DISPLAY_YEARS — what tables/lists should iterate. Default = chronological
  // (oldest → newest). User can flip via header toggle (writes localStorage).
  const DISPLAY_YEARS = chronoAsc ? CHART_YEARS : DATA_YEARS;
  const chartLabels = CHART_YEARS.map(y => String(y).slice(2));

  const L = comp[latestDataYear] || {};
  const LD = fin[latestDataYear] || {};
  const PD = fin[prevDataYear] || {};

  // WACC — 2026-05-03 fix: use MARKET equity (price × shares) not book equity
  // for the E/V weighting. Buyback-heavy companies (ZTS, AAPL, MCD, IBM)
  // have book equity << market cap → using book underweights equity → WACC
  // collapses to ~3-4% → DCF intrinsic value explodes (ZTS showed $1229 vs
  // FMP DCF $142). Standard CFA / damodaran practice = market weights.
  const marketEquity = (cfg.price || 0) * (LD.sharesOut || 0);
  const equityForWacc = marketEquity > 0 ? marketEquity : LD.equity;
  const wacc = useMemo(()=>calcWACC({equity:equityForWacc,totalDebt:LD.totalDebt,interestExpense:LD.interestExpense,taxRate:cfg.taxRate/100,beta:cfg.beta,riskFreeRate:cfg.riskFree/100,marketPremium:cfg.marketPremium/100}),[equityForWacc,LD,cfg]);
  const discountRate = cfg.useWACC ? wacc.wacc : (cfg.manualDiscount||10)/100;

  // Growth rate
  const growthCalc = useMemo(()=>calcGrowthRate(LD),[LD]);
  const revYears = YEARS.filter(y=>fin[y]?.revenue>0);
  const revenueCAGR = revYears.length>=2 && fin[revYears[revYears.length-1]].revenue > 0 ? (Math.pow(fin[revYears[0]].revenue / fin[revYears[revYears.length-1]].revenue, 1/(revYears.length-1)) - 1) : 0;
  const estimatedGrowth = cfg.manualGrowth > 0 ? cfg.manualGrowth/100 : Math.min(growthCalc.sustainableGrowth, 0.15);

  // Piotroski
  const piotroski = useMemo(()=>calcPiotroski(LD, PD),[LD, PD]);

  // Altman Z-Score
  const altmanZ = useMemo(()=>calcAltmanZ(LD, cfg.price * (LD.sharesOut||1)),[LD, cfg.price]);

  // ═══ Advanced Metrics ═══
  const advancedMetrics = useMemo(() => {
    const price = cfg.price || 0;
    const shares = LD.sharesOut || 1;

    const nextEst = fmpExtra.estimates?.find(e => e.epsAvg > 0);
    const forwardEPS = nextEst?.epsAvg || 0;
    const forwardPE = forwardEPS > 0 && price > 0 ? price / forwardEPS : null;

    const epsYears = DATA_YEARS.filter(y => fin[y]?.eps > 0);
    const avg10yEPS = epsYears.length >= 3 ? epsYears.reduce((s,y) => s + fin[y].eps, 0) / epsYears.length : 0;
    const shillerPE = avg10yEPS > 0 && price > 0 ? price / avg10yEPS : null;

    const bvps = LD.equity > 0 && shares > 0 ? LD.equity / shares : 0;
    const eps = LD.eps || 0;
    const grahamNumber = eps > 0 && bvps > 0 ? Math.sqrt(22.5 * eps * bvps) : null;
    const grahamMOS = grahamNumber && price > 0 ? (grahamNumber - price) / grahamNumber : null;

    const currentAssets = fin[latestDataYear]?.currentAssets ||
      ((LD.cash || 0) + (LD.equity > 0 ? LD.revenue * 0.15 : 0));
    const totalLiabilities = (LD.totalDebt || 0) + (LD.equity > 0 ?
      (fin[latestDataYear]?.totalAssets || LD.equity + LD.totalDebt) - LD.equity : 0);
    const ncav = currentAssets > 0 ? (currentAssets - totalLiabilities) / shares : null;
    const ncavPctPrice = ncav != null && price > 0 ? ncav / price : null;

    // Beneish M-Score
    const curr = fin[latestDataYear] || {};
    const prev = fin[prevDataYear] || {};
    let beneish = null;
    if (curr.revenue > 0 && prev.revenue > 0 && curr.grossProfit > 0 && prev.grossProfit > 0) {
      const currRecv = curr.revenue * 0.08;
      const prevRecv = prev.revenue * 0.08;
      const DSRI = (prevRecv > 0 && prev.revenue > 0) ? (currRecv / curr.revenue) / (prevRecv / prev.revenue) : 1;
      const currGM = curr.grossProfit / curr.revenue;
      const prevGM = prev.grossProfit / prev.revenue;
      const GMI = currGM > 0 ? prevGM / currGM : 1;
      const currTotalAssets = curr.equity + curr.totalDebt + (curr.cash || 0);
      const prevTotalAssets = prev.equity + prev.totalDebt + (prev.cash || 0);
      const currPPE = Math.abs(curr.capex || 0) * 10;
      const prevPPE = Math.abs(prev.capex || 0) * 10;
      const AQI = prevTotalAssets > 0 ? (1 - (currPPE + (curr.cash||0)) / currTotalAssets) / (1 - (prevPPE + (prev.cash||0)) / prevTotalAssets) : 1;
      const SGI = prev.revenue > 0 ? curr.revenue / prev.revenue : 1;
      const currDepRate = (curr.depreciation || 0) / ((curr.depreciation || 0) + (Math.abs(curr.capex || 0) * 5));
      const prevDepRate = (prev.depreciation || 0) / ((prev.depreciation || 0) + (Math.abs(prev.capex || 0) * 5));
      const DEPI = currDepRate > 0 ? prevDepRate / currDepRate : 1;
      const currSGA = curr.revenue - curr.grossProfit + curr.operatingIncome > 0 ?
        (curr.revenue - curr.operatingIncome - (curr.revenue - curr.grossProfit)) / curr.revenue : 0.2;
      const prevSGA = prev.revenue - prev.grossProfit + prev.operatingIncome > 0 ?
        (prev.revenue - prev.operatingIncome - (prev.revenue - prev.grossProfit)) / prev.revenue : 0.2;
      const SGAI = prevSGA > 0 ? currSGA / prevSGA : 1;
      const TATA = currTotalAssets > 0 ? ((curr.netIncome || 0) - (curr.ocf || 0)) / currTotalAssets : 0;
      const currLev = currTotalAssets > 0 ? (currTotalAssets - curr.equity) / currTotalAssets : 0.5;
      const prevLev = prevTotalAssets > 0 ? (prevTotalAssets - prev.equity) / prevTotalAssets : 0.5;
      const LVGI = prevLev > 0 ? currLev / prevLev : 1;
      beneish = -4.84 + 0.92*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI - 0.172*SGAI + 4.679*TATA - 0.327*LVGI;
    }
    const beneishLabel = beneish == null ? "—" : beneish < -2.22 ? "Unlikely Manipulator" : beneish < -1.78 ? "Grey Zone" : "Possible Manipulator";
    const beneishColor = beneish == null ? "#888" : beneish < -2.22 ? "#30d158" : beneish < -1.78 ? "#ffd60a" : "#ff453a";

    const allDivYears = [...YEARS].reverse().filter(y => fin[y]?.dps > 0);
    const continuousDivSince = allDivYears.length > 0 ? allDivYears[0] : null;

    const sharesYears = DATA_YEARS.filter(y => fin[y]?.sharesOut > 0);
    const sharesFirst = sharesYears.length > 1 ? fin[sharesYears[sharesYears.length-1]]?.sharesOut : 0;
    const sharesLast = sharesYears.length > 1 ? fin[sharesYears[0]]?.sharesOut : 0;
    const buybackCAGR = sharesFirst > 0 && sharesLast > 0 && sharesYears.length > 1 ?
      Math.pow(sharesLast / sharesFirst, 1/(sharesYears.length-1)) - 1 : null;
    const buybackLabel = buybackCAGR == null ? "—" : buybackCAGR < -0.01 ? "Buying Back" : buybackCAGR > 0.01 ? "Diluting" : "Stable";

    return { forwardPE, forwardEPS, shillerPE, grahamNumber, grahamMOS, ncav, ncavPctPrice,
             beneish, beneishLabel, beneishColor, continuousDivSince, buybackCAGR, buybackLabel };
  }, [fin, cfg.price, LD, fmpExtra.estimates, DATA_YEARS, latestDataYear, prevDataYear]);

  // Dividend Analysis
  const divAnalysis = useMemo(()=>calcDividendAnalysis(fin, comp, YEARS),[fin, comp]);

  // ═══ Auto-calculate SSD ═══
  useEffect(() => {
    if (!LD.revenue || LD.revenue <= 0) return;
    const da = calcDividendAnalysis(fin, comp, YEARS);

    let growthStreak = 0;
    const dpsYears = DATA_YEARS.filter(y => fin[y]?.dps > 0);
    for (let i = 0; i < dpsYears.length - 1; i++) {
      if (fin[dpsYears[i]]?.dps >= fin[dpsYears[i+1]]?.dps) growthStreak++; else break;
    }
    let uninterruptedStreak = 0;
    for (const y of DATA_YEARS) { if (fin[y]?.dps > 0) uninterruptedStreak++; else break; }

    const payoutEarnings = LD.eps > 0 && LD.dps > 0 ? LD.dps / LD.eps : 0;
    const fcfps = comp[latestDataYear]?.fcfps;
    const payoutFCF = fcfps > 0 && LD.dps > 0 ? LD.dps / fcfps : 0;
    const ebitda = comp[latestDataYear]?.ebitda;
    const netDebt = comp[latestDataYear]?.netDebt;
    const ndEbitda = ebitda > 0 ? (netDebt || 0) / ebitda : 0;
    const _fcf = comp[latestDataYear]?.fcf;
    const _totalDivPaid = LD.dps > 0 && LD.sharesOut > 0 ? LD.dps * LD.sharesOut : 0;

    const payoutScore = payoutFCF < 0.4 ? 25 : payoutFCF < 0.6 ? 20 : payoutFCF < 0.75 ? 12 : 5;
    const consecScore = growthStreak >= 10 ? 20 : growthStreak >= 5 ? 15 : growthStreak >= 3 ? 10 : 3;
    const growthScore = (da.cagr5||0) > 0.08 ? 15 : (da.cagr5||0) > 0.05 ? 12 : (da.cagr5||0) > 0.02 ? 8 : 3;
    const debtScore = ndEbitda < 1.5 ? 15 : ndEbitda < 3 ? 10 : ndEbitda < 4.5 ? 5 : 2;
    const fcfValues = YEARS.slice(0,5).map(y => comp[y]?.fcf).filter(v => v != null);
    let fcfGrowing = 0;
    for (let i = 0; i < fcfValues.length - 1; i++) { if (fcfValues[i] > fcfValues[i+1] * 1.02) fcfGrowing++; }
    const trendScore = fcfGrowing >= 3 ? 15 : fcfGrowing >= 2 ? 10 : fcfGrowing >= 1 ? 5 : 2;
    const gm = comp[latestDataYear]?.gm || 0;
    const roic = comp[latestDataYear]?.roic || 0;
    const moatScore = (gm > 0.50 && roic > 0.15) ? 10 : (gm > 0.30 && roic > 0.10) ? 6 : 2;
    const safetyScore = payoutScore + consecScore + growthScore + debtScore + trendScore + moatScore;
    const safetyLabel = safetyScore >= 80 ? "Very Safe" : safetyScore >= 60 ? "Safe" : safetyScore >= 40 ? "Borderline" : "Unsafe";

    const annualDPS = LD.dps || 0;
    const rev07 = fin[2007]?.revenue, rev09 = fin[2009]?.revenue;
    const recessionSales = rev07 > 0 && rev09 > 0 ? `${((rev09/rev07-1)*100) >= 0 ? "+" : ""}${_sf((rev09/rev07-1)*100,1)}%` : "—";
    const dps07 = fin[2007]?.dps, dps09 = fin[2009]?.dps;
    const recessionDivAction = dps07 > 0 && dps09 > 0 ? (dps09 > dps07 ? "Increased" : dps09 === dps07 ? "Maintained" : "Cut") : "—";
    const fmpR = fmpExtra.rating;
    const creditRating = fmpR?.rating ? `${fmpR.rating} (FMP)` : "—";
    let frequency = "—", freqMonths = "";
    if (annualDPS > 0) { frequency = "Quarterly"; freqMonths = "Jan, Apr, Jul, Oct"; }

    setSsd(prev => ({
      ...prev,
      safetyScore, safetyLabel,
      safetyDate: new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}),
      safetyNote: safetyScore >= 80 ? "Strong dividend safety. Low payout and consistent growth suggest minimal risk of cut." :
                  safetyScore >= 60 ? "Adequate safety. Monitor payout trends and debt levels." :
                  safetyScore >= 40 ? "Borderline safety. Elevated payout or inconsistent growth. Watch closely." :
                  "Dividend at risk. High payout, weak FCF trend, or excessive debt.",
      creditRating, payoutRatio: payoutEarnings, ndEbitda,
      growthStreak, uninterruptedStreak,
      growthLast12m: da.cagr3 || null,
      growthLast5y: da.cagr5 || null,
      growthLast10y: da.cagr10 || null,
      annualPayout: annualDPS,
      frequency, freqMonths,
      recessionDivAction, recessionSales,
      notes: prev.notes?.length > 0 && prev.reportGenerated ? prev.notes : [],
    }));
  }, [fin, comp, fmpExtra, latestDataYear, LD]);

  // ROIC vs WACC Spread
  const roicWaccSpread = useMemo(()=>{
    return DATA_YEARS.map(y=>({
      year:y, roic:comp[y]?.roic, wacc:wacc.wacc,
      spread: comp[y]?.roic != null ? comp[y].roic - wacc.wacc : null,
      createsValue: comp[y]?.roic != null ? comp[y].roic > wacc.wacc : null,
    }));
  },[comp, wacc]);

  // Revenue-to-FCF Waterfall
  const waterfall = useMemo(()=>{
    const d = LD;
    if(!d.revenue) return null;
    return [
      {label:"Ventas", value:d.revenue, color:"var(--gold)"},
      {label:"- COGS", value:-(d.revenue - (d.grossProfit||0)), color:"var(--red)"},
      {label:"= B. Bruto", value:d.grossProfit||0, color:"var(--green)", subtotal:true},
      {label:"- OpEx", value:-((d.grossProfit||0) - (d.operatingIncome||0)), color:"var(--red)"},
      {label:"= EBIT", value:d.operatingIncome||0, color:"var(--green)", subtotal:true},
      {label:"- Impuestos", value:-(d.taxProvision||0), color:"var(--red)"},
      {label:"- Intereses", value:-(d.interestExpense||0), color:"var(--red)"},
      {label:"+ D&A", value:d.depreciation||0, color:"#64d2ff"},
      {label:"- CapEx", value:-(d.capex||0), color:"var(--red)"},
      {label:"= FCF", value:(d.ocf||0)-(d.capex||0), color:"var(--green)", subtotal:true},
    ];
  },[LD]);

  // DCF calculator
  const dcfCalc = useCallback((g, r)=>{
    const baseFCF = L.fcf || 0;
    if(baseFCF <= 0) return null;
    const tg = 0.025;
    let pvSum = 0;
    let lastFCF = baseFCF;
    for(let i=1;i<=10;i++){
      lastFCF = baseFCF * Math.pow(1+g, i);
      pvSum += lastFCF / Math.pow(1+r, i);
    }
    const tv = (r !== tg ? (lastFCF*(1+tg))/(r-tg) : 0);
    const tvPV = tv / Math.pow(1+r, 10);
    const total = pvSum + tvPV;
    return total / (LD.sharesOut || 1);
  },[L, LD]);

  // DCF valuation
  const dcf = useMemo(()=>{
    if(!L.fcf || L.fcf <= 0) return null;
    const g = estimatedGrowth;
    const r = discountRate;
    const tg = 0.025;
    const projs = [];
    let pvSum = 0;
    for(let i=1;i<=10;i++){
      const fcf = L.fcf * Math.pow(1+g, i);
      const pv = fcf / Math.pow(1+r, i);
      pvSum += pv;
      projs.push({year:YEARS[0]+i, fcf, pv});
    }
    const tv = (r !== tg && projs.length > 9 ? (projs[9].fcf*(1+tg))/(r-tg) : 0);
    const tvPV = tv / Math.pow(1+r, 10);
    const total = pvSum + tvPV;
    const iv = total / (LD.sharesOut||1);
    const mos = 1 - cfg.price/iv;
    const fcfYield = div(L.fcf, cfg.price*(LD.sharesOut||1));
    const per = div(cfg.price*(LD.sharesOut||1), L.fcf);
    return {projs, pvSum, tv, tvPV, total, iv, mos, fcfYield, per};
  },[L, LD, estimatedGrowth, discountRate, cfg.price]);

  // Score
  const scoreItems = useMemo(()=>{
    return [
      {cat:"Márgenes",name:"M. Bruto",val:L.gm,rules:R.gm,weight:1},
      {cat:"Márgenes",name:"M. Operativo",val:L.om,rules:R.om,weight:1},
      {cat:"Márgenes",name:"M. Neto",val:L.nm,rules:R.nm,weight:0.8},
      {cat:"Márgenes",name:"M. FCF",val:L.fcfm,rules:R.fcfm,weight:1.2},
      {cat:"Rentabilidad",name:"ROE",val:L.roe,rules:R.roe,weight:1},
      {cat:"Rentabilidad",name:"ROIC",val:L.roic,rules:R.roic,weight:1.5},
      {cat:"Deuda",name:"Deuda/FCF",val:L.d2fcf,rules:R.d2fcf,weight:1.2},
      {cat:"Deuda",name:"Cobertura Int.",val:L.ic,rules:R.ic,weight:1},
      {cat:"Valoración",name:"EV/EBITDA",val:L.eve,rules:R.eve,weight:1.3},
      {cat:"Valoración",name:"Margen Seg.",val:dcf?.mos,rules:R.mos,weight:1.5},
      {cat:"Solidez",name:"Piotroski",val:piotroski.score,rules:R.pio,weight:1.2},
      {cat:"Solidez",name:"Altman Z",val:altmanZ.score,rules:[
        {test:v=>v>2.99,lbl:"Segura",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
        {test:v=>v>1.81,lbl:"Gris",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
        {test:v=>v<=1.81,lbl:"Peligro",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
      ],weight:1},
      {cat:"Crecimiento",name:"CAGR Ventas",val:revenueCAGR,rules:R.growth,weight:1},
    ];
  },[L, dcf, piotroski, altmanZ, revenueCAGR]);

  const totalScore = useMemo(()=>{
    const valid = scoreItems.filter(x=>n(x.val)!=null);
    if(!valid.length) return 0;
    const weightedSum = valid.reduce((s,x)=>s+rate(x.val,x.rules).score * (x.weight||1),0);
    const maxWeighted = valid.reduce((s,x)=>s+3*(x.weight||1),0);
    return Math.round((weightedSum / maxWeighted) * 100);
  },[scoreItems]);

  const marketCap = cfg.price * (LD.sharesOut||0);
  const capLabel = marketCap>200e3?"Mega":marketCap>10e3?"Large":marketCap>2e3?"Mid":marketCap>300?"Small":"Micro";

  return {
    comp, wacc, piotroski, altmanZ, advancedMetrics, divAnalysis, dcf, dcfCalc,
    scoreItems, totalScore, L, LD, PD,
    DATA_YEARS, CHART_YEARS, DISPLAY_YEARS, chronoAsc, chartLabels,
    latestDataYear, prevDataYear,
    marketCap, capLabel, discountRate, estimatedGrowth, revenueCAGR,
    roicWaccSpread, waterfall, growthCalc,
  };
}
