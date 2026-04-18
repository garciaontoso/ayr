// ═══════════════════════════════════════════════════════════════════════════
// AI AGENTS — extracted from worker.js (refactor — pure mechanical move)
// All 14 agent runners + runAllAgents orchestrator. Exposed via makeAgents(deps)
// factory so worker.js can inject helpers without circular imports.
// ═══════════════════════════════════════════════════════════════════════════

export function makeAgents(deps) {
  const {
    callAgentClaude, storeInsights, getAgentMemory, setAgentMemory,
    getMarketIndicators, getGfData, getFmpFinancials, getRiskMetrics,
    cacheMarketIndicators, cacheGuruFocusData, cacheFmpFinancials, cacheRiskMetrics, enrichPositionSectors,
    toFMP, fetchYahoo, sendWebPush, FCF_PAYOUT_CARVEOUT,
  } = deps;

// Sum last N values from a trend array (newest-first). Returns null if no valid nums.
// Used by earnings_trend agent for TTM/YoY calculations. Ported from worker.js Q+S.
const _qs_sum = (arr, n) => {
  if (!Array.isArray(arr) || arr.length < n) return null;
  let sum = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    if (v == null || Number.isNaN(v)) continue;
    sum += Number(v);
    count++;
  }
  return count === 0 ? null : sum;
};

// Fetch the GuruFocus financials doc from R2 for a single ticker. Returns null
// if the bucket isn't bound, the object doesn't exist, or parsing fails. We
// never throw — R2 is supplementary data and agents must still work when it's
// absent. (2026-04-18 — wire-up of local docs/ uploaded via upload-docs-to-r2.sh)
const getR2Financials = async (env, ticker) => {
  if (!env.EARNINGS_R2) return null;
  try {
    const key = `docs/${ticker}/gf_financials.json`;
    const obj = await env.EARNINGS_R2.get(key);
    if (!obj) return null;
    const text = await obj.text();
    return JSON.parse(text);
  } catch (e) {
    console.warn(`[R2] gf_financials read failed for ${ticker}:`, e.message);
    return null;
  }
};

// Extract the condensed 30-year series from a GF financials doc. Returns a
// compact object suitable for LLM context — NEVER pass the raw ~310KB JSON
// to Claude. Only fields that inform dividend safety and long-term trend:
//   { years: [...], divs: [...], fcfPerShare: [...], epsNRI: [...],
//     revPerShare: [...], yearsOfDivs: N, divCuts: [indices where cut] }
// Years are filtered to the last 30 (older accounting can be inconsistent).
// The LLM can spot patterns like "40y no cut" or "2020 COVID dip recovered"
// without us having to pre-compute them.
const extractLongTermSeries = (gfDoc) => {
  if (!gfDoc?.financials?.annuals) return null;
  const a = gfDoc.financials.annuals;
  const fy = a['Fiscal Year'] || [];
  if (!Array.isArray(fy) || fy.length < 5) return null;
  const psa = a.per_share_data_array || {};
  // Years are labels like "2015-12" / "TTM" — keep as strings.
  const yearsArr = fy.slice(-30);
  // Numeric series — coerce to Number, null on invalid.
  const lastNum = (arr, n = 30) => Array.isArray(arr) ? arr.slice(-n).map(v => {
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  }) : null;
  const years = yearsArr;
  const divs = lastNum(psa['Dividends per Share'], 30) || [];
  const fcf = lastNum(psa['Free Cash Flow per Share'], 30) || [];
  const eps = lastNum(psa['EPS without NRI'], 30) || [];
  const rev = lastNum(psa['Revenue per Share'], 30) || [];
  // Count consecutive years of div payment (non-zero) ending at most recent non-TTM
  let yearsOfDivs = 0;
  for (let i = divs.length - 1; i >= 0; i--) {
    if (divs[i] && divs[i] > 0) yearsOfDivs++;
    else if (yearsOfDivs > 0) break;
  }
  // Index list of years where div was CUT vs prior year (>5% drop)
  const divCuts = [];
  for (let i = 1; i < divs.length; i++) {
    const prev = divs[i - 1], curr = divs[i];
    if (prev && curr && curr < prev * 0.95) divCuts.push(years[i]);
  }
  return { years, divs, fcfPerShare: fcf, epsNRI: eps, revPerShare: rev, yearsOfDivs, divCuts };
};

// Batch-fetch R2 long-term series for N tickers in parallel. Returns
// { [ticker]: extractedSeries }. Missing tickers simply omitted from the map.
const getR2LongTermSeriesBatch = async (env, tickers) => {
  if (!env.EARNINGS_R2 || !tickers?.length) return {};
  const entries = await Promise.all(tickers.map(async (t) => {
    const doc = await getR2Financials(env, t);
    if (!doc) return null;
    const series = extractLongTermSeries(doc);
    if (!series) return null;
    return [t, series];
  }));
  const out = {};
  for (const e of entries) if (e) out[e[0]] = e[1];
  return out;
};

// ─── Agent 0: Market Regime (runs FIRST) ───────────────────────
async function runRegimeAgent(env, fecha) {
  const mkt = await getMarketIndicators(env);
  if (!Object.keys(mkt).length) return { agent: "regime", skipped: true, reason: "no market data" };

  // Build sector/factor comparisons
  const spy = mkt['SPY'];
  const sectorPerf = ['XLK','XLF','XLE','XLV','XLU','XLP','XLI','XLRE'].map(t => ({
    ticker: t, changePct: mkt[t]?.changePct, change5d: mkt[t]?.change5dPct,
  }));
  const factorPerf = ['QUAL','MTUM','VLUE'].map(t => ({
    ticker: t, changePct: mkt[t]?.changePct, change5d: mkt[t]?.change5dPct,
    vsSpyPct: (mkt[t]?.changePct || 0) - (spy?.changePct || 0),
  }));

  const system = `You are a market regime analyst. Determine the current market state.
Analyze:
- Cyclicals (XLF/XLE/XLI) vs defensives (XLU/XLP/XLV): if defensives lead = risk-off
- Credit (HYG/LQD falling = stress, TLT rising = flight-to-quality)
- Factors (QUAL+MTUM+VLUE all losing vs SPY = indiscriminate selling)
- VIX level and trend
Respond ONLY JSON:
{"severity":"info|warning|critical","title":"short title","summary":"3-4 sentence regime assessment",
"details":{"regime":"bull|bear|transition-down|transition-up","regimeConfidence":1-10,
"breadthSignal":"healthy|deteriorating|collapsed|recovering",
"creditStress":"none|mild|elevated|severe","factorSignal":"rational-rotation|indiscriminate-selling|risk-on|mixed",
"safeHavens":"working|failing|mixed","actionGuidance":"full-risk|reduce-risk|defensive|cash-priority",
"sectorLeaders":[],"sectorLaggards":[],"vixRegime":"low|normal|elevated|crisis"},
"score":1-10}
Score 1=crisis, 10=strong bull.`;

  const userContent = {
    spy: { price: spy?.price, changePct: spy?.changePct, change5d: spy?.change5dPct },
    vix: { price: mkt['^VIX']?.price, changePct: mkt['^VIX']?.changePct },
    sectors: sectorPerf,
    factors: factorPerf,
    credit: { HYG: mkt['HYG'], LQD: mkt['LQD'], TLT: mkt['TLT'], SHY: mkt['SHY'] },
    commodities: { GLD: mkt['GLD'], USO: mkt['USO'], DBC: mkt['DBC'] },
    dollar: mkt['UUP'],
    fecha,
  };

  const rawInsight = await callAgentClaude(env, system, userContent);
  let insight = Array.isArray(rawInsight) ? rawInsight[0] : rawInsight;
  if (!insight || typeof insight !== 'object') insight = { severity: "warning", title: "Regime analysis", summary: String(rawInsight).slice(0, 500), details: {}, score: 5 };
  insight.ticker = "_REGIME_";

  // Save regime to agent_memory for other agents
  await setAgentMemory(env, "regime_current", {
    fecha,
    regime: insight.details?.regime,
    actionGuidance: insight.details?.actionGuidance,
    creditStress: insight.details?.creditStress,
    vixRegime: insight.details?.vixRegime,
    score: insight.score,
  });

  const stored = await storeInsights(env, "regime", fecha, [insight]);
  return { agent: "regime", insights: stored };
}

// ─── Agent 1: Earnings Monitor ─────────────────────────────────
async function runEarningsAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, sector FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "earnings", skipped: true };

  const tickers = positions.map(p => p.ticker);
  const placeholders = tickers.map(() => "?").join(",");
  const { results: fundamentals } = await env.DB.prepare(
    `SELECT symbol, earnings, income, estimates, rev_segments, geo_segments, grades FROM fundamentals WHERE symbol IN (${placeholders})`
  ).bind(...tickers).all();

  const fundMap = {};
  for (const f of fundamentals) {
    fundMap[f.symbol] = {
      earnings: f.earnings ? JSON.parse(f.earnings) : null,
      income: f.income ? JSON.parse(f.income) : null,
      estimates: f.estimates ? JSON.parse(f.estimates) : null,
      revSegments: f.rev_segments ? JSON.parse(f.rev_segments) : null,
      geoSegments: f.geo_segments ? JSON.parse(f.geo_segments) : null,
      grades: f.grades ? JSON.parse(f.grades) : null,
    };
  }

  // Load GuruFocus ranks (kept until Phase 4b replaces with FMP-derived equivalents)
  const gfMap = await getGfData(env, tickers);

  // Load FMP quarterly trends (revenue, FCF, margins, EPS) — same source the
  // Dividend agent already uses. Lets the model see whether a quarterly miss
  // is part of a trend or a one-off, instead of evaluating each quarter blind.
  const finMap = await getFmpFinancials(env, tickers);

  // Load 30-year per-share series from R2 (condensed from local docs/). Lets
  // Opus spot multi-decade trends that 6-quarter FMP data can't see — e.g.
  // "EPS below 10y median" or "only the 4th negative FCF year in 30y".
  // Absent → agent still works with FMP-only data.
  const longTermMap = await getR2LongTermSeriesBatch(env, tickers);
  if (Object.keys(longTermMap).length) {
    console.log(`[Earnings] long-term R2 coverage: ${Object.keys(longTermMap).length}/${tickers.length} tickers`);
  }

  // ── Cross-agent ground-truth: earnings_trend signals (added 2026-04-08) ──
  // earnings_trend (no LLM) runs BEFORE this agent in the pipeline so we can
  // ingest its deterministic 2+ misses + margin compression flags. The audit
  // (Audit A finding #2) recommended folding earnings_trend output into this
  // LLM agent so the user gets ONE coherent verdict per ticker.
  const earningsTrendMap = {};
  try {
    const { results: etRows } = await env.DB.prepare(
      `SELECT ticker, severity, summary, details FROM agent_insights
       WHERE agent_name = 'earnings_trend' AND fecha = ?`
    ).bind(fecha).all();
    for (const r of (etRows || [])) {
      try {
        const det = JSON.parse(r.details || '{}');
        earningsTrendMap[r.ticker] = {
          severity: r.severity,
          consecutiveMisses: det.consecutiveMisses,
          marginCompressionBps: det.marginCompressionBps,
          revGrowthYoY: det.revGrowthYoY,
          summary: r.summary,
        };
      } catch (pe) {
        console.warn(`[Earnings] earnings_trend row parse failed for ${r.ticker}:`, pe.message);
      }
    }
  } catch (e) { console.error("[Earnings] earnings_trend load failed:", e.message); }

  // Load most recent transcript per ticker. Tickers stored without exchange prefix
  // (BME:/HKG:/LSE: stripped at download time, see /api/download-transcripts).
  const transcriptMap = {};
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS earnings_transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      quarter TEXT NOT NULL,
      year INTEGER NOT NULL,
      content TEXT NOT NULL,
      date TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(ticker, quarter, year)
    )`).run();
    const stripTickers = tickers.map(t => t.replace(/^(BME:|HKG:|LSE:)/, ''));
    const tPlaceholders = stripTickers.map(() => "?").join(",");
    const { results: trRows } = await env.DB.prepare(
      `SELECT ticker, quarter, year, content, date FROM earnings_transcripts
       WHERE ticker IN (${tPlaceholders})
       ORDER BY year DESC, quarter DESC, date DESC`
    ).bind(...stripTickers).all();
    for (const row of trRows) {
      // Keep only the most recent per ticker
      if (!transcriptMap[row.ticker]) {
        const raw = typeof row.content === "string" ? row.content : "";
        // Widened from 3000 → 10000 chars (2026-04-18). 3K only covered the CEO
        // opening remarks; the Q&A with analysts (usually starts ~3-5K chars in)
        // is where management reveals forward demand, cost pressure, and concrete
        // numbers under pushback. 10K captures the opening + most of the Q&A
        // for typical transcripts. Batches of 12 × 10K = 120K chars ≈ 30K
        // tokens which still fits comfortably in Opus 200K context.
        transcriptMap[row.ticker] = {
          quarter: row.quarter,
          year: row.year,
          date: row.date,
          excerpt: raw.slice(0, 10000),
          totalLen: raw.length,
        };
      }
    }
  } catch (e) {
    console.error("[Earnings] transcript load failed:", e.message);
  }

  // Helper: pick last 6 quarters of a trend series, rounded to 2 decimals
  const last6 = (arr) => Array.isArray(arr) ? arr.slice(0, 6) : null;
  // Helper: compute YoY-style margin compression flag
  const buildTrends = (ticker) => {
    const fin = finMap[ticker];
    if (!fin) return null;
    const t = fin.trend || fin || {};
    if (!t.periods?.length) return null;
    return {
      periods: last6(t.periods),
      revenue: last6(t.revenue),
      netIncome: last6(t.netIncome),
      operatingIncome: last6(t.operatingIncome),
      grossProfit: last6(t.grossProfit),
      fcf: last6(t.fcf),
      ocf: last6(t.ocf),
      eps: last6(t.eps),
    };
  };

  const allPosData = positions.filter(p => fundMap[p.ticker]?.earnings).map(p => {
    const f = fundMap[p.ticker];
    const gf = gfMap[p.ticker] || {};
    const e = f.earnings;
    const stripKey = p.ticker.replace(/^(BME:|HKG:|LSE:)/, '');
    const tr = transcriptMap[stripKey];
    return {
      ticker: p.ticker, name: p.name, sector: p.sector,
      earnings: Array.isArray(e) ? e.slice(0, 2) : e,
      estimates: f.estimates?.slice?.(0, 1),
      revSegments: f.revSegments?.slice?.(0, 1),
      geoSegments: f.geoSegments?.slice?.(0, 1),
      analystGrades: Array.isArray(f.grades) ? f.grades.slice(0, 3) : null,
      gfGrowthRank: gf.growthRank, gfMomentumRank: gf.momentumRank,
      gfProfitabilityRank: gf.profitabilityRank,
      // Quarterly trends (last 6 quarters) — context for "trend vs one-off"
      trends: buildTrends(p.ticker),
      // Most recent earnings call transcript (management commentary)
      transcript: tr ? { period: `${tr.quarter} ${tr.year}`, date: tr.date, excerpt: tr.excerpt, totalLen: tr.totalLen } : null,
      // Cross-agent ground-truth — only present if flagged today
      earningsTrendSignal: earningsTrendMap[p.ticker] || null,
      // 30y annual per-share series from GuruFocus (R2 — docs/{ticker}/gf_financials.json)
      longTerm30y: longTermMap[p.ticker] || null,
    };
  });

  if (!allPosData.length) {
    await storeInsights(env, "earnings", fecha, [{ ticker: "_GLOBAL_", severity: "info", title: "Sin datos de earnings", summary: "No hay datos de earnings disponibles.", details: {}, score: 5 }]);
    return { agent: "earnings", insights: 0 };
  }

  const system = `You are a senior earnings analyst for a LONG-TERM dividend income portfolio ($1.35M, buy-and-hold).
The owner holds positions for years/decades. Temporary earnings dips are NORMAL in business cycles.
NEVER recommend selling quality on temporary dips — this is a buy-and-hold dividend portfolio.

YOU NOW HAVE EARNINGS CALL TRANSCRIPTS. Use them as the PRIMARY source for tone and context:
- The numerical surprise (EPS/revenue beat or miss) tells you WHAT happened.
- The transcript tells you WHY it happened and what management plans to do.
- Combine both: a -8% EPS miss with management explaining a one-time legal charge AND reaffirming guidance is INFO, not WARNING.
- A +2% EPS beat with management warning about deteriorating demand for next quarter is WARNING despite the beat.
- When citing the transcript, quote a SHORT phrase (under 15 words) from management in transcript_insight.
- If no transcript provided for a ticker, set transcript_insight to "No transcript" and rely on numerical data only.

LONG-TERM HISTORY (longTerm30y, added 2026-04-18 — up to 30 years from GuruFocus):
When present: { years[], divs[], fcfPerShare[], epsNRI[], revPerShare[], yearsOfDivs, divCuts[] }.
Use it to contextualize the latest quarter:
- "EPS $2.10 TTM vs 10y median of $3.40" = real deterioration, not seasonal.
- "First negative FCF year in 30y" = genuinely structural, not one-off.
- "EPS rebased lower 3 years ago and has been stable since" = not still bleeding.
- Combined with transcript: long-term decline + credible recovery plan = warning; long-term
  decline + evasive management = critical.
If longTerm30y is null → no R2 history available, proceed with 6-quarter FMP data only.

YOU NOW HAVE 6-QUARTER TREND DATA (revenue, netIncome, operatingIncome, grossProfit, fcf, ocf, eps).
- ALWAYS check the trend before flagging a quarter as critical:
  * A -8% EPS miss in isolation looks bad. If the prior 5 quarters were +12%, +8%, +5%, +9%, +6%, this is a single-quarter blip → WARNING at most.
  * A -3% miss following -2%, -5%, -7% misses is a real deteriorating trend → WARNING or CRITICAL.
- Margin trend: compute (operatingIncome / revenue) for each of the last 6 quarters. Flag CRITICAL only if margins compressed AND revenue is also declining.
- If trends are improving but the latest quarter is one-off bad, the answer is INFO with explanation, not warning.
- Trends array is most-recent-first: trends.revenue[0] is the LATEST quarter.

CROSS-AGENT GROUND-TRUTH SIGNAL (added 2026-04-08):
You now receive an earningsTrendSignal field per ticker (only when flagged):
- Fields: severity, consecutiveMisses (count of YoY op income misses), marginCompressionBps, revGrowthYoY, summary.
- This is a deterministic pattern detector that ran BEFORE you. If it flagged a ticker, the misses are real.
- If present with severity=critical and your trends agree → reflect it (warning or critical).
- If present but the transcript explains a one-off cause AND management gives credible recovery plan → you may keep it info but EXPLAIN.
- If null, the deterministic detector found no pattern — proceed normally.
DO NOT mention the signal explicitly in your summary field unless it changes your verdict.

CONTEXT IS EVERYTHING:
- One-time write-downs, impairments, restructuring charges are NOT operational problems. Explain what happened.
- A company investing in growth (higher capex, R&D) may show lower earnings temporarily — that's POSITIVE.
- Seasonal businesses (HRB = tax season, retail = Q4) have naturally weak quarters. Don't flag off-season results.
- Compare to the TREND, not just one quarter.
- If EPS beats estimates AND management tone is constructive, it CANNOT be critical. Period.

DISTINGUISH TEMPORARY VS STRUCTURAL:
- Temporary: one-time charges, FX headwinds, weather, supply chain hiccups, restructuring with clear plan, deferred revenue timing, M&A integration costs. → info (or warning if large but explained).
- Structural: secular demand decline, market share loss to disruptors, margin compression with no plan, repeated guidance cuts, management evasiveness on the call. → warning or critical.

SEVERITY (conservative — long-term portfolio):
- critical = structural business decline: revenue falling 3+ consecutive quarters AND margins compressing AND no credible turnaround in transcript. Max 2 criticals across the portfolio.
- warning = operational miss that could affect dividends OR management tone clearly negative on forward demand
- info = normal quarter, beat, minor miss, explained one-time, or constructive management commentary

Respond ONLY JSON array:
[{"ticker":"XX","severity":"info|warning|critical","title":"short title","summary":"2-3 sentences combining numerical result with management's explanation","details":{"epsSurprise":-5.3,"revenueSurprise":2.1,"marginTrend":"stable|improving|deteriorating","context":"one-time|cyclical|structural|growth-investment","transcript_insight":"1-2 sentences citing what management said (short quote in quotes if possible)","keyRisks":[]},"score":1-10}]
Include entries for tickers with notable findings (beat/miss, guidance change, or important transcript signal). Skip uneventful quarters. Score: 1=structural decline, 5=normal mixed, 10=strong beat with bullish guidance.`;

  // Process in batches of 12 (transcripts add ~3KB per ticker, smaller than dividend's 15)
  const BATCH_SIZE = 12;
  const allInsights = [];

  for (let i = 0; i < allPosData.length; i += BATCH_SIZE) {
    const batch = allPosData.slice(i, i + BATCH_SIZE);
    try {
      const batchResult = await callAgentClaude(env, system, { positions: batch }, { model: "claude-opus-4-20250514" });
      const batchInsights = Array.isArray(batchResult) ? batchResult : [batchResult];
      allInsights.push(...batchInsights);
    } catch (e) {
      console.error(`[Earnings] Batch ${i / BATCH_SIZE + 1} failed:`, e.message);
    }
    if (i + BATCH_SIZE < allPosData.length) await new Promise(r => setTimeout(r, 5000));
  }

  const stored = await storeInsights(env, "earnings", fecha, allInsights);
  return { agent: "earnings", insights: stored, total: allPosData.length };
}

// ─── Agent 2: Dividend Safety ──────────────────────────────────
async function runDividendAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, div_ttm, div_yield, yoc, sector FROM positions WHERE shares > 0 AND div_ttm > 0"
  ).all();
  if (!positions.length) return { agent: "dividend", skipped: true };

  const tickers = positions.map(p => p.ticker);
  const placeholders = tickers.map(() => "?").join(",");
  const { results: fundamentals } = await env.DB.prepare(
    `SELECT symbol, ratios, cashflow, dividends, key_metrics, owner_earnings FROM fundamentals WHERE symbol IN (${placeholders})`
  ).bind(...tickers).all();

  // Pull Q+S inputs_json for AUTHORITATIVE TTM figures (fcfTTM, divTTM,
  // fcfCoverage, payoutRatioWorst, debtEbitda, currentRatio, streakYears).
  // The dividend agent previously read latestCF.freeCashFlowPerShare which is
  // a SINGLE-PERIOD per-share value — for FLO this caused "FCF $89M" when the
  // real TTM was ~$329M. Q+S already computes correct values per-ticker.
  let qsInputsByTicker = {};
  try {
    const { results: qsRows } = await env.DB.prepare(
      `SELECT qss.ticker, qss.inputs_json, qss.quality_score, qss.safety_score
         FROM quality_safety_scores qss
         INNER JOIN (
           SELECT ticker, MAX(snapshot_date) AS max_date
           FROM quality_safety_scores
           WHERE ticker IN (${placeholders})
           GROUP BY ticker
         ) latest
           ON qss.ticker = latest.ticker
          AND qss.snapshot_date = latest.max_date`
    ).bind(...tickers).all();
    for (const r of (qsRows || [])) {
      try {
        const parsed = JSON.parse(r.inputs_json || "{}");
        qsInputsByTicker[r.ticker] = {
          safety: parsed.safety || {},
          quality: parsed.quality || {},
          qualityScore: r.quality_score,
          safetyScore: r.safety_score,
        };
      } catch (pe) {
        console.warn(`[Dividend] Q+S inputs_json parse failed for ${r.ticker}:`, pe.message);
      }
    }
  } catch (e) {
    console.error("[Dividend] Q+S inputs load failed:", e.message);
  }

  // Real dividend payments from dividendos table (last 2 years)
  const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
  const { results: realDivs } = await env.DB.prepare(
    `SELECT ticker, fecha, bruto, neto FROM dividendos WHERE fecha >= ? ORDER BY fecha DESC`
  ).bind(twoYearsAgo).all();

  const realDivMap = {};
  for (const d of realDivs) {
    if (!realDivMap[d.ticker]) realDivMap[d.ticker] = [];
    realDivMap[d.ticker].push(d);
  }

  // ── Cross-agent ground-truth signals (added 2026-04-08 per Audit A merge) ──
  // dividend_cut_warning + analyst_downgrade now run BEFORE this agent in the
  // pipeline. We read their per-ticker output here so Opus can produce ONE
  // coherent verdict per dividend payer instead of having 3 cards disagreeing.
  const cutWarningMap = {};
  const downgradeMap = {};
  try {
    const { results: cwRows } = await env.DB.prepare(
      `SELECT ticker, severity, summary, details FROM agent_insights
       WHERE agent_name = 'dividend_cut_warning' AND fecha = ?`
    ).bind(fecha).all();
    for (const r of (cwRows || [])) {
      try {
        const det = JSON.parse(r.details || '{}');
        cutWarningMap[r.ticker] = {
          severity: r.severity,
          ttmCoverage: det.ttmCoverageNow,
          fcfPayoutPct: det.fcfPayoutNow,
          fcfGrowthYoY: det.fcfGrowthYoY,
          summary: r.summary,
        };
      } catch (pe) {
        console.warn(`[Dividend] cut_warning row parse failed for ${r.ticker}:`, pe.message);
      }
    }
  } catch (e) { console.error("[Dividend] cut_warning load failed:", e.message); }
  try {
    const { results: dgRows } = await env.DB.prepare(
      `SELECT ticker, severity, summary, details FROM agent_insights
       WHERE agent_name = 'analyst_downgrade' AND fecha = ?`
    ).bind(fecha).all();
    for (const r of (dgRows || [])) {
      try {
        const det = JSON.parse(r.details || '{}');
        downgradeMap[r.ticker] = {
          severity: r.severity,
          deltaPts: det.deltaPts,
          analystsCovering: det.analystsCovering,
          summary: r.summary,
        };
      } catch (pe) {
        console.warn(`[Dividend] analyst_downgrade row parse failed for ${r.ticker}:`, pe.message);
      }
    }
  } catch (e) { console.error("[Dividend] analyst_downgrade load failed:", e.message); }

  const fundMap = {};
  for (const f of fundamentals) {
    fundMap[f.symbol] = {
      ratios: f.ratios ? JSON.parse(f.ratios) : null,
      cashflow: f.cashflow ? JSON.parse(f.cashflow) : null,
      dividends: f.dividends ? JSON.parse(f.dividends) : null,
      keyMetrics: f.key_metrics ? JSON.parse(f.key_metrics) : null,
      ownerEarnings: f.owner_earnings ? JSON.parse(f.owner_earnings) : null,
    };
  }

  // Load GuruFocus data (for scalar fields: financialStrength, shareholderYield, etc.)
  // and FMP financials (for trends — replaces gf.trend).
  // Also attempt to load 30-year series from R2 (supplementary — this agent
  // still works if R2 is empty; data comes from docs/{ticker}/gf_financials.json
  // uploaded via scripts/upload-docs-to-r2.sh).
  const [gfMap, fmpFinMap, longTermMap] = await Promise.all([
    getGfData(env, tickers),
    getFmpFinancials(env, tickers),
    getR2LongTermSeriesBatch(env, tickers),
  ]);
  const longTermCoverage = Object.keys(longTermMap).length;
  console.log(`[Dividend] long-term R2 coverage: ${longTermCoverage}/${tickers.length} tickers`);

  // Classify tickers for context
  const REITS = new Set(['AMT','ARE','CLPR','CUBE','ESS','HR','IIPR','KRG','MDV','NNN','O','STAG','SUI','VICI','WPC','XLRE','NET.UN']);
  const BDCS = new Set(['MAIN','OBDC','MSDL']);
  const ETFS = new Set(['SCHD','DIVO','BIZD','SPHD','FDJU','WEEL']);
  const PREFS = new Set(['IIPR-PRA','LANDP']);

  const allPosData = positions.map(p => {
    const f = fundMap[p.ticker] || {};
    const gf = gfMap[p.ticker] || {};
    // Prefer FMP trends (richer, fresher), fall back to GF if FMP cache empty
    const trend = fmpFinMap[p.ticker]?.trend || gf.trend || {};
    const latestRatios = Array.isArray(f.ratios) ? f.ratios[0] : f.ratios;
    const latestCF = Array.isArray(f.cashflow) ? f.cashflow[0] : f.cashflow;
    const ownerE = Array.isArray(f.ownerEarnings) ? f.ownerEarnings[0] : f.ownerEarnings;
    const category = REITS.has(p.ticker) ? 'REIT' : BDCS.has(p.ticker) ? 'BDC' : ETFS.has(p.ticker) ? 'ETF' : PREFS.has(p.ticker) ? 'PREFERRED' : 'COMPANY';

    // AUTHORITATIVE TTM figures from Q+S inputs_json (computed by _qs_safety
    // using _qs_sum over last 4 quarters). Falls back to legacy per-share
    // fields only if Q+S has no snapshot for this ticker.
    const qs = qsInputsByTicker[p.ticker] || {};
    const qsSafety = qs.safety || {};

    return {
      ticker: p.ticker, name: p.name, sector: p.sector,
      category, // REIT, BDC, ETF, PREFERRED, or COMPANY
      divTTM: p.div_ttm, yield: p.div_yield, yoc: p.yoc,

      // ── TTM cash-flow figures (authoritative — from Q+S) ──
      dividendsPaidTTM: qsSafety.divTTM ?? null,
      fcfTTM:           qsSafety.fcfTTM ?? null,
      netIncomeTTM:     qsSafety.niTTM ?? null,
      fcfCoverageTTM:   qsSafety.fcfCoverage ?? null,
      payoutRatioEarnings: qsSafety.payoutRatio ?? null,
      payoutRatioFCF:      qsSafety.fcfPayoutRatio ?? null,
      payoutRatioWorst:    qsSafety.payoutRatioWorst ?? null,
      fcfAfterMaintCoverage: qsSafety.fcfAfterMaintCov ?? null,
      debtToEbitda:      qsSafety.debtEbitda ?? null,
      currentRatio:      qsSafety.currentRatio ?? null,
      dividendStreakYears: qsSafety.streakYears ?? null,
      qualityScore: qs.qualityScore ?? null,
      safetyScore:  qs.safetyScore ?? null,

      // ── Legacy fields (fallback only — kept for sectors w/o Q+S snapshot) ──
      payoutRatio: latestRatios?.payoutRatio || latestRatios?.dividendPayoutRatio,
      fcfPerShare: latestCF?.freeCashFlowPerShare,
      ownerEarningsPerShare: ownerE?.ownerEarningsPerShare,
      debtToEquity: latestRatios?.debtEquityRatio,
      interestCoverage: latestRatios?.interestCoverage,

      dividendHistory: Array.isArray(f.dividends) ? f.dividends.slice(0, 4) : null,
      realPayments: (realDivMap[p.ticker] || []).slice(0, 3),
      gfFinancialStrength: gf.financialStrength,
      gfShareholderYield: gf.shareholderYield,
      gfBuybackYield: gf.buybackYield,
      gfDividendStreakSince: gf.dividendStreakSince,
      // Quarterly trends (8 quarters) for context analysis (FMP Ultimate, GF fallback)
      trendRevenue: trend.revenue?.slice(0, 6),
      trendFCF: trend.fcf?.slice(0, 6),
      trendDebt: trend.debt?.slice(0, 4),
      trendDivPaid: trend.dividendsPaid?.slice(0, 4),

      // Cross-agent ground-truth signals (only present if flagged today)
      cutWarningSignal: cutWarningMap[p.ticker] || null,
      analystDowngradeSignal: downgradeMap[p.ticker] || null,

      // Long-term series from GuruFocus (up to 30 years) — condensed from
      // docs/{ticker}/gf_financials.json in R2. Lets Opus verify dividend
      // streaks, detect past cuts, and compare current coverage against
      // decades of history. Null if R2 has no upload for this ticker.
      longTerm30y: longTermMap[p.ticker] || null,
    };
  });

  const system = `You are a senior dividend analyst for a LONG-TERM income portfolio ($1.35M, China fiscal resident, 10% WHT).
This portfolio is buy-and-hold focused on growing dividend income over decades. The owner does NOT want to sell on temporary dips.

CRITICAL CONTEXT — DO NOT give false alarms:
- A dividend CUT to pay down debt is often BULLISH (management prioritizing balance sheet health). Mark as "warning" not "critical".
- A high payout ratio in a REIT is NORMAL (REITs distribute 90%+ by law). Use FFO/AFFO payout instead.
- BDCs (MAIN, OBDC, etc.) have high payouts by design — evaluate NAV coverage, not earnings payout.
- ETFs/CEFs (SCHD, DIVO, BIZD, SPHD, etc.) don't have traditional payout ratios — evaluate distribution history.
- Preferred shares (IIPR-PRA, LANDP) have FIXED dividends — only flag if company is in financial distress.
- A company trading below fair value with a high yield is an OPPORTUNITY, not a crisis.
- Temporary earnings dips (restructuring, one-time charges) don't threaten long-term dividends if FCF is healthy.

COVERAGE ANALYSIS — USE THE TTM FIELDS, NOT THE LEGACY PER-SHARE FIELDS:
- fcfTTM, dividendsPaidTTM, fcfCoverageTTM are DOLLAR totals over the trailing 4 quarters. These are authoritative.
- payoutRatioWorst = max(payoutRatioEarnings, payoutRatioFCF) — use this for cut-risk decisions.
- fcfPerShare / payoutRatio (legacy) are single-period and may be ~4x understated. IGNORE them when fcfTTM is present.
- Cite numbers as "FCF TTM $XXM covering dividends $YYM = Z.Zx" using the TTM fields.
- If fcfCoverageTTM >= 1.5 and payoutRatioWorst <= 0.75 → cutRisk: low (do NOT mark high regardless of trend wobble).
- If fcfCoverageTTM < 1.0 OR payoutRatioWorst > 1.0 → genuine stress, cutRisk: high.
- safetyScore (0-100) and qualityScore (0-100) are pre-computed by the Q+S engine — use them as a sanity check on your verdict.

TREND ANALYSIS (use trendRevenue, trendFCF, trendDebt, trendDivPaid — most recent quarter first):
- If debt is DECREASING over 4+ quarters AND dividend was cut → STRATEGIC restructuring, likely positive. Score 6+.
- If FCF is INCREASING while revenue is flat → margin improvement, dividend is safer. Score 7+.
- If debt is INCREASING AND FCF is DECREASING → genuine stress. Score 3-4.
- If dividendsPaid dropped but FCF is strong → voluntary cut to invest or pay debt. Explain WHY.
- Always analyze the DIRECTION of the trend, not just the latest number.

CROSS-AGENT GROUND-TRUTH SIGNALS (added 2026-04-08):
You now receive two pre-computed signals per ticker (when flagged):
- cutWarningSignal: if present, the deterministic FCF analyzer flagged this ticker.
  Fields: severity (warning/critical), ttmCoverage, fcfPayoutPct, fcfGrowthYoY, summary.
  → If present with severity=critical, you SHOULD reflect that risk in your verdict (warning at minimum).
  → If present but the trend data shows a clear strategic explanation (debt paydown, restructuring),
    you may keep it info but EXPLAIN why you're overriding the signal.
- analystDowngradeSignal: if present, sell-side analysts cut sentiment in the last ~14 days.
  Fields: severity, deltaPts, analystsCovering, summary.
  → Treat as a directional warning. Doesn't override fundamentals, but lower your conviction one notch.
For tickers with NO signals present, those fields are null — proceed normally with your TTM analysis.
DO NOT mention these signals in your output summary unless they materially change your verdict.

LONG-TERM HISTORY (longTerm30y, added 2026-04-18 — from GuruFocus 30y data in R2):
When present, longTerm30y gives you:
- years[]: fiscal year labels (up to 30, e.g. "2005-12" … "2025-12", plus "TTM")
- divs[]: dividends per share aligned to years (0 = no dividend that year)
- fcfPerShare[], epsNRI[], revPerShare[]: matching long-term per-share series
- yearsOfDivs: count of consecutive recent years paying a dividend
- divCuts[]: list of year-labels where div was cut >5% vs prior year
Use it to verify dividend streak claims (e.g. "40y no cut" = divCuts empty over 40y series),
detect historical cut patterns (multiple cuts → management signals unstable), and contextualize
current TTM coverage against a decade-plus history (e.g. "FCF coverage 0.8 is below its
10y median of 1.4 → real deterioration, not seasonal").
If longTerm30y is null, no R2 history available — proceed with TTM-only analysis.

SEVERITY (be conservative — only "critical" for REAL danger):
- critical = company is genuinely at risk of bankruptcy or permanent dividend elimination. Max 2-3 across entire portfolio.
- warning = dividend freeze likely, or payout unsustainable WITHOUT a clear strategic reason
- info = safe, growing, or strategically sound even if ratios look stressed

For EACH ticker: one-line verdict with context. Explain WHY, not just numbers.

Respond ONLY JSON array:
[{"ticker":"XX","severity":"info|warning|critical","title":"2-4 word verdict","summary":"1-2 sentences explaining the CONTEXT behind the numbers","details":{"payoutRatio":null,"fcfCoverage":null,"gfFinancialStrength":null,"cutRisk":"low|medium|high","context":"strategic|stressed|stable|growing"},"score":1-10}]
Include ALL tickers. Score: 1=bankruptcy risk, 5=needs monitoring, 8=solid, 10=fortress.`;

  // Process in batches of 15 to stay under token limits
  const BATCH_SIZE = 15;
  const allInsights = [];

  for (let i = 0; i < allPosData.length; i += BATCH_SIZE) {
    const batch = allPosData.slice(i, i + BATCH_SIZE);
    try {
      const batchResult = await callAgentClaude(env, system, { positions: batch }, { model: "claude-opus-4-20250514" });
      const batchInsights = Array.isArray(batchResult) ? batchResult : [batchResult];
      allInsights.push(...batchInsights);
    } catch (e) {
      console.error(`[Dividend] Batch ${i / BATCH_SIZE + 1} failed:`, e.message);
    }
    // Small delay between batches
    if (i + BATCH_SIZE < allPosData.length) await new Promise(r => setTimeout(r, 5000));
  }

  const stored = await storeInsights(env, "dividend", fecha, allInsights);
  return { agent: "dividend", insights: stored, total: allPosData.length };
}

// ─── Agent 3: Macro Sentinel (Sonnet — complex narrative synthesis) ───
async function runMacroAgent(env, fecha) {
  const fmpKey = env.FMP_KEY;
  const today = new Date();
  const weekAgo = new Date(today - 7 * 86400000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  // FMP economic calendar + treasury
  let econEvents = [], treasuryRates = [];
  try {
    const [econResp, treasuryResp] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/economic-calendar?from=${weekAgo}&to=${todayStr}&apikey=${fmpKey}`),
      fetch(`https://financialmodelingprep.com/stable/treasury?from=${weekAgo}&to=${todayStr}&apikey=${fmpKey}`),
    ]);
    if (econResp.ok) econEvents = await econResp.json();
    if (treasuryResp.ok) treasuryRates = await treasuryResp.json();
  } catch (e) { console.error("Macro FMP fetch error:", e.message); }

  // Market indicators from cache (sectors, factors, credit, commodities)
  const mkt = await getMarketIndicators(env);

  // Current regime from agent_memory
  const regime = await getAgentMemory(env, "regime_current");

  // Portfolio sector breakdown
  const { results: sectorRows } = await env.DB.prepare(
    "SELECT sector, SUM(market_value) as total FROM positions WHERE shares > 0 GROUP BY sector"
  ).all();

  // Margin interest (cost of leverage)
  const { results: marginRows } = await env.DB.prepare(
    "SELECT mes, SUM(interes_usd) as total FROM margin_interest GROUP BY mes ORDER BY mes DESC LIMIT 3"
  ).all();

  const system = `You are a macro strategist analyzing a $1.35M dividend income portfolio (88 stocks, China fiscal resident, 10% WHT US-China treaty).

FIRST reason step by step:
1. REGIME: Risk-on, risk-off or transition? Use sector and factor data
2. CREDIT: HYG/LQD spreads indicate stress? TLT flight-to-quality or sell-off?
3. FACTORS: QUAL/MTUM/VLUE vs SPY — rational rotation or indiscriminate selling?
4. SECTORS: Defensives (XLU/XLP/XLV) outperforming? Cyclicals (XLF/XLE/XLI) weak?
5. COMMODITIES: GLD/USO signal inflation/geopolitics?
6. IMPLICATION for dividend stocks: which portfolio sectors at risk?

SEVERITY CALIBRATION:
- critical = credit spreads blowing out (HYG -3%+ in week) or regime shift to bear
- warning = sector rotation hurting portfolio or rate surprise
- info = stable environment, minor shifts

Respond ONLY JSON:
{"severity":"info|warning|critical","title":"short title","summary":"4-5 sentence connected narrative synthesis (NOT a list of data points)",
"details":{"regime":"risk-on|risk-off|transition","regimeConfidence":1-10,
"creditStress":"none|mild|elevated|severe","factorSignal":"rational-rotation|indiscriminate-selling|risk-on|mixed",
"sectorLeaders":[],"sectorLaggards":[],"rateOutlook":"","inflationTrend":"",
"commoditySignal":"","portfolioImplications":[],"keyRisks":[],"opportunities":[]},
"score":1-10}`;

  const userContent = {
    currentRegime: regime,
    marketIndicators: mkt,
    economicEvents: Array.isArray(econEvents) ? econEvents.slice(0, 25) : [],
    treasuryRates: Array.isArray(treasuryRates) ? treasuryRates.slice(0, 5) : [],
    portfolioSectors: sectorRows,
    marginInterest: marginRows,
    fecha: todayStr,
  };

  // Downgraded Opus → Haiku 2026-04-08. Audit finding: macro produced generic
  // prose ("defensives outperforming, stay long dividend stocks") that Opus
  // can't add unique value to. Haiku at 5x cheaper is sufficient for this
  // template-style synthesis. If we ever want real Opus-quality macro analysis
  // we should bring it back only weekly, not daily, and track one concrete
  // prediction (e.g. "HYG will drop >2% in 5d") to score the agent.
  // 2026-04-18: wrap in try/catch so LLM failure still stores a _STATUS_ insight
  // (previously an Anthropic 529/timeout left macro completely absent from the
  // daily feed — user couldn't tell if agent was alive).
  let insight;
  try {
    const rawInsight = await callAgentClaude(env, system, userContent, { model: "claude-haiku-4-5-20251001" });
    insight = Array.isArray(rawInsight) ? rawInsight[0] : rawInsight;
    if (!insight || typeof insight !== 'object') insight = { severity: "info", title: "Macro analysis", summary: String(rawInsight).slice(0, 500), details: {}, score: 5 };
  } catch (e) {
    console.error("[Macro] LLM call failed:", e.message);
    insight = {
      severity: "info",
      title: "Macro — síntesis no disponible",
      summary: `Fallo al llamar a Haiku (${e.message.slice(0, 100)}). Indicadores de mercado se cachearon correctamente; reintenta mañana o desde el botón manual.`,
      details: { error: e.message.slice(0, 200), regime: regime?.regime, fallback: true },
      score: 0,
    };
  }
  insight.ticker = "_MACRO_";
  const stored = await storeInsights(env, "macro", fecha, [insight]);
  return { agent: "macro", insights: stored };
}

// ─── Agent 4: Portfolio Risk ───────────────────────────────────
async function runRiskAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, market_value, sector, pnl_pct, div_yield, category FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "risk", skipped: true };

  const totalValue = positions.reduce((s, p) => s + (p.market_value || 0), 0);

  // NLV history for drawdown
  const { results: nlvHistory } = await env.DB.prepare(
    "SELECT fecha, nlv FROM nlv_history ORDER BY fecha DESC LIMIT 60"
  ).all();

  // Compute concentration metrics
  const sorted = [...positions].sort((a, b) => (b.market_value || 0) - (a.market_value || 0));
  const top5Weight = sorted.slice(0, 5).reduce((s, p) => s + (p.market_value || 0), 0) / (totalValue || 1);
  const maxWeight = (sorted[0]?.market_value || 0) / (totalValue || 1);

  const sectorMap = {};
  for (const p of positions) {
    const s = p.sector || "Unknown";
    sectorMap[s] = (sectorMap[s] || 0) + (p.market_value || 0);
  }
  const sectorWeights = Object.entries(sectorMap).map(([s, v]) => ({ sector: s, weight: v / (totalValue || 1), value: v })).sort((a, b) => b.weight - a.weight);

  // Max drawdown from NLV
  let maxDrawdown = 0;
  if (nlvHistory.length > 1) {
    let peak = nlvHistory[nlvHistory.length - 1]?.nlv || 0;
    for (let i = nlvHistory.length - 2; i >= 0; i--) {
      const nlv = nlvHistory[i]?.nlv || 0;
      if (nlv > peak) peak = nlv;
      const dd = (peak - nlv) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
  }

  // Margin interest cost
  const { results: marginRows } = await env.DB.prepare(
    "SELECT mes, SUM(interes_usd) as total FROM margin_interest GROUP BY mes ORDER BY mes DESC LIMIT 3"
  ).all();

  // Current regime context
  const regime = await getAgentMemory(env, "regime_current");

  // FMP-derived risk metrics per position (with GF fallback for tickers not yet cached)
  const tickers = positions.map(p => p.ticker);
  const [riskMap, gfMap] = await Promise.all([
    getRiskMetrics(env, tickers),
    getGfData(env, tickers),
  ]);
  // Merge: prefer FMP-calculated, fall back to GF
  const metricsFor = (ticker) => {
    const fm = riskMap[ticker];
    if (fm) return { source: 'FMP', ...fm };
    const gf = gfMap[ticker] || {};
    if (gf.beta != null) return { source: 'GF', beta: gf.beta, volatility1y: gf.volatility1y, sharpe: gf.sharpe, sortino: gf.sortino, maxDrawdown1y: gf.maxDrawdown1y };
    return null;
  };
  const positionRiskMetrics = sorted.slice(0, 15).map(p => {
    const m = metricsFor(p.ticker);
    if (!m) return null;
    return { ticker: p.ticker, ...m };
  }).filter(Boolean);

  // Portfolio weighted beta (FMP-first)
  const weightedBeta = positions.reduce((s, p) => {
    const m = metricsFor(p.ticker);
    if (!m?.beta) return s;
    return s + m.beta * ((p.market_value || 0) / (totalValue || 1));
  }, 0);

  const system = `You are a portfolio risk analyst for a $1.35M dividend income portfolio with ${positions.length} positions.
Evaluate the PORTFOLIO AS A WHOLE (concentration, diversification, drawdown, leverage, regime alignment).
Use the per-position risk metrics in positionRiskMetrics as INPUTS for your analysis, not as separate outputs.

PHILOSOPHY (CRITICAL):
- This is a LONG-TERM buy-and-hold dividend portfolio. NEVER recommend selling quality positions during temporary drawdowns.
- A position down 30% is an opportunity to add, not exit, IF the dividend is intact and the business fundamentals are sound.
- High volatility on individual quality dividend stocks is normal during corrections — focus on PORTFOLIO-level concentration and sector diversification.
- The owner does NOT trade. Don't recommend "REDUCE", "EXIT", or "SELL" unless there is real bankruptcy risk.

SEVERITY CALIBRATION:
- critical = single position >15% AND business in bankruptcy risk, OR portfolio max drawdown >15%, OR margin cost > dividend income, OR portfolio beta >1.3
- warning = top 5 > 40%, OR portfolio drawdown >8%, OR single sector >50%, OR weighted beta >1.0
- info = well-diversified, manageable drawdown, beta <0.8

CRITICAL OUTPUT FORMAT — YOU MUST FOLLOW EXACTLY:
Respond with EXACTLY ONE JSON OBJECT (no array, no wrapper). Begin your response with { and end with }.
Schema (all fields required):
{"severity":"info","title":"Diversified portfolio under sector pressure","summary":"Three-four sentences explaining portfolio-level risk posture, concentration, drawdown context, and how it aligns with current regime. Long-term focus.","details":{"concentrationScore":7,"diversificationScore":6,"portfolioBeta":0.85,"sectorConcentration":"Top sector 28% (Consumer Staples)","leverageCostVsIncome":"Margin cost \\$2k/mo vs \\$8k dividends — 25%","regimeAlignment":"Defensive tilt fits transition-down regime","topRisks":["China concentration ~20%","Rate-sensitive REITs ~25%","Drawdown 8%"],"recommendations":["Hold quality positions","Avoid adding leverage","Wait for sector rotation"]},"score":6}

Do NOT return an array. Do NOT return per-position rows. Return ONE object describing the portfolio. The example above shows the exact shape expected.`;

  const userContent = {
    totalNLV: totalValue,
    positionCount: positions.length,
    top5: sorted.slice(0, 5).map(p => ({ ticker: p.ticker, weight: (p.market_value || 0) / (totalValue || 1) })),
    top5Weight: Math.round(top5Weight * 1000) / 10,
    maxSingleWeight: Math.round(maxWeight * 1000) / 10,
    sectorWeights,
    maxDrawdown60d: Math.round(maxDrawdown * 1000) / 10,
    nlvTrend: nlvHistory.slice(0, 10),
    categories: positions.reduce((acc, p) => { acc[p.category || "OTHER"] = (acc[p.category || "OTHER"] || 0) + 1; return acc; }, {}),
    marginInterest: marginRows,
    currentRegime: regime,
    weightedBeta: Math.round(weightedBeta * 100) / 100,
    positionRiskMetrics,
  };

  // Downgraded Opus → Haiku 2026-04-08. Audit finding: the numerical risk
  // computations (top5, sector Herfindahl, maxDD, weightedBeta) happen in
  // code BEFORE the LLM is called. Opus was only paraphrasing them while
  // fighting its own instinct to recommend SELL. Haiku can paraphrase fine.
  // Saves ~$0.03/run.
  // 2026-04-18: wrap in try/catch so LLM failure still stores a status insight.
  let insight;
  try {
    const rawInsight = await callAgentClaude(env, system, userContent, { model: "claude-haiku-4-5-20251001" });
    insight = Array.isArray(rawInsight) ? rawInsight[0] : rawInsight;
    if (!insight || typeof insight !== 'object' || !insight.severity || !insight.title) {
      insight = { severity: "warning", title: "Risk analysis fallback", summary: typeof rawInsight === 'string' ? rawInsight.slice(0, 500) : JSON.stringify(rawInsight).slice(0, 500), details: {}, score: 5 };
    }
  } catch (e) {
    console.error("[Risk] LLM call failed:", e.message);
    insight = {
      severity: "info",
      title: "Risk — síntesis no disponible",
      summary: `Fallo al llamar a Haiku (${e.message.slice(0, 100)}). Métricas numéricas disponibles en details; síntesis textual no generada.`,
      details: { error: e.message.slice(0, 200), top5Weight: userContent.top5Weight, sectorHHI: userContent.sectorHHI, weightedBeta: userContent.weightedBeta, fallback: true },
      score: 0,
    };
  }
  insight.ticker = "_PORTFOLIO_";
  const stored = await storeInsights(env, "risk", fecha, [insight]);
  return { agent: "risk", insights: stored };
}

// ─── Agent 5: Trade Advisor (single Opus synthesis) ──────────
// Simplified 2026-04-08 per audit: the previous 3-call pipeline
// (Haiku bull → Haiku bear → Opus synth) was theatrical duplication.
// The two Haiku debates just re-derived the same inputs the other agents
// (dividend, earnings, value, insider) already produced with better focus.
// Single Opus call reading all todayInsights directly is cleaner and
// saves ~$0.08/run. Bull/bear reasoning now happens inside the Opus
// synthesis prompt.
async function runTradeAgent(env, fecha) {
  // Read today's insights from all other agents
  const { results: todayInsights } = await env.DB.prepare(
    "SELECT agent_name, ticker, severity, title, summary, score FROM agent_insights WHERE fecha = ? AND agent_name != 'trade'"
  ).bind(fecha).all();

  // Latest AI analysis per ticker
  const { results: aiAnalyses } = await env.DB.prepare(
    `SELECT a.ticker, a.score, a.action, a.summary FROM ai_analysis a
     INNER JOIN (SELECT ticker, MAX(updated_at) as max_date FROM ai_analysis GROUP BY ticker) b
     ON a.ticker = b.ticker AND a.updated_at = b.max_date`
  ).all();

  // Positions + fundamentals
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, market_value, avg_price, last_price, pnl_pct, div_yield FROM positions WHERE shares > 0"
  ).all();

  const tickers = positions.map(p => p.ticker);
  let dcfMap = {};
  if (tickers.length) {
    const placeholders = tickers.map(() => "?").join(",");
    const { results: fundRows } = await env.DB.prepare(
      `SELECT symbol, dcf, price_target, grades FROM fundamentals WHERE symbol IN (${placeholders})`
    ).bind(...tickers).all();
    for (const f of fundRows) {
      dcfMap[f.symbol] = {
        dcf: f.dcf ? JSON.parse(f.dcf) : null,
        priceTarget: f.price_target ? JSON.parse(f.price_target) : null,
        grades: f.grades ? JSON.parse(f.grades) : null,
      };
    }
  }

  const regime = await getAgentMemory(env, "regime_current");

  // GuruFocus: valuation + insider/guru activity
  const gfMap = await getGfData(env, tickers);

  const posData = positions.map(p => {
    const gf = gfMap[p.ticker] || {};
    return {
      ticker: p.ticker, name: p.name, shares: p.shares,
      price: p.last_price, avgCost: p.avg_price, pnlPct: p.pnl_pct,
      yield: p.div_yield, value: p.market_value,
      aiScore: aiAnalyses.find(a => a.ticker === p.ticker)?.score,
      aiAction: aiAnalyses.find(a => a.ticker === p.ticker)?.action,
      fairValue: dcfMap[p.ticker]?.dcf?.[0]?.dcf || dcfMap[p.ticker]?.dcf?.dcf,
      priceTarget: dcfMap[p.ticker]?.priceTarget?.[0]?.targetConsensus || dcfMap[p.ticker]?.priceTarget?.targetConsensus,
      analystConsensus: dcfMap[p.ticker]?.grades?.slice?.(0, 2),
      // GuruFocus exclusive — valuation & smart money
      gfValue: gf.gfValue, gfScore: gf.gfScore,
      gfValuation: gf.gfValuation, priceToGfValue: gf.priceToGfValue,
      peterLynchFV: gf.peterLynchFV,
      guruBuys13f: gf.guruBuys13f, guruSells13f: gf.guruSells13f,
      insiderBuys3m: gf.insiderBuys3m, insiderSells3m: gf.insiderSells3m,
      rsi14: gf.rsi14,
    };
  });
  // No slice — we feed ALL positions. Previous 30/20 cap left 69 of 89 positions
  // invisible to the advisor. Opus 200K context easily fits 89 × ~300 bytes
  // of position data plus ~500 signals. (2026-04-18)

  // ── Single-step Opus synthesis (replaces 3-call bull/bear/synth) ──
  const synthSystem = `You are a senior portfolio advisor for a LONG-TERM dividend income portfolio ($1.35M, buy-and-hold, China fiscal resident).
The owner's goal is GROWING INCOME over decades, not trading for capital gains. The owner does NOT actively trade — default is HOLD.

YOUR TASK: Read the attached \`todayInsights\` from other agents (dividend, earnings, value, insider, SEC filings, options, regime). For each position worth action, think through BOTH bull and bear cases internally (no need to output them separately), then emit a final recommendation. Focus on ADD opportunities over SELL.

DATA AVAILABLE per position:
- Valuation: gfValue, gfScore, priceToGfValue (< 0.8 = undervalued), peterLynchFV, fairValue (DCF), priceTarget
- Smart money: guruBuys13f, guruSells13f, insiderBuys3m, insiderSells3m
- Momentum: rsi14, pnlPct, aiScore, aiAction, analystConsensus
- Fundamentals from other agents' insights (linked by ticker)

FUNDAMENTAL PHILOSOPHY (CRITICAL):
- Selling a quality dividend grower during a temporary dip is the WORST mistake. If fundamentals are intact, HOLD or ADD.
- SELL only if: the business model is permanently broken, or dividend is eliminated with no path to recovery.
- TRIM only if: position is dangerously overweight (>10% of portfolio) AND fundamentally impaired.
- ADD if: quality company trading below fair value with intact dividend and favorable smart-money signals.
- Companies restructuring (cutting costs, paying debt, refocusing) are often BUYS not SELLS.

Current market: ${regime?.regime || 'unknown'} (${regime?.actionGuidance || 'unknown'})

SEVERITY (conservative — don't recommend selling quality companies):
- critical = SELL only if business is in genuine structural decline. Max 1-2 sells across entire portfolio.
- warning = worth reviewing, but default is HOLD unless you have strong evidence.
- info = no action needed, position is fine.

Respond ONLY JSON array: [{"ticker":"XX","severity":"info|warning|critical","title":"ACTION: Ticker",
"summary":"2-3 sentence rationale that implicitly weighs bull vs bear",
"details":{"action":"BUY|SELL|HOLD|TRIM|ADD","conviction":"low|medium|high",
"bullSummary":"one-line strongest bull case","bearSummary":"one-line strongest bear case","targetPrice":null,"timeHorizon":"short|medium|long"},
"score":1-10}]
Max 10 most actionable recommendations. Favor ADD over HOLD over TRIM over SELL. Score = conviction (1=low, 10=very high).`;

  // Wrap the Opus synth in try/catch so a 529 overload doesn't break the
  // pipeline. Single-call version — no bull/bear Haiku pre-steps.
  let synthResult;
  try {
    synthResult = await callAgentClaude(env, synthSystem, {
      todayInsights,
      positions: posData,
      regime,
    }, { model: "claude-opus-4-20250514" });
  } catch (e) {
    console.error(`[trade] Opus synth failed after retries: ${e.message}`);
    synthResult = [{
      ticker: "_TRADE_",
      severity: "info",
      title: "Trade Advisor: síntesis Opus no disponible",
      summary: `La síntesis final falló tras reintentos (${e.message.slice(0, 100)}). Los argumentos bull/bear se generaron correctamente. Reintentar manualmente desde el botón del tab Agentes.`,
      details: { action: "HOLD", conviction: "low", error: e.message.slice(0, 200) },
      score: 5,
    }];
  }

  // Store signals for future postmortem tracking
  const signals = Array.isArray(synthResult) ? synthResult : [synthResult];
  for (const s of signals) {
    if (s.ticker && s.details?.action && s.details.action !== 'HOLD') {
      const pos = positions.find(p => p.ticker === s.ticker);
      if (pos) {
        await env.DB.prepare(
          `INSERT INTO signal_tracking (original_fecha, ticker, action, price_at_signal, div_at_signal)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(original_fecha, ticker) DO UPDATE SET action=excluded.action, price_at_signal=excluded.price_at_signal`
        ).bind(fecha, s.ticker, s.details.action, pos.last_price, pos.div_yield).run();
      }
    }
  }

  const stored = await storeInsights(env, "trade", fecha, signals);
  return { agent: "trade", insights: stored };
}

// ─── Agent 6: Signal Postmortem (pure calculation, no LLM) ─────
async function runPostmortemAgent(env, fecha) {
  // Find signals from 7 days and 30 days ago that haven't been evaluated
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { results: pendingSignals } = await env.DB.prepare(
    `SELECT * FROM signal_tracking WHERE
     (original_fecha <= ? AND price_7d IS NULL) OR
     (original_fecha <= ? AND price_30d IS NULL)
     ORDER BY original_fecha ASC LIMIT 50`
  ).bind(sevenDaysAgo, thirtyDaysAgo).all();

  if (!pendingSignals.length) return { agent: "postmortem", evaluated: 0 };

  // Get current prices for these tickers
  const tickers = [...new Set(pendingSignals.map(s => s.ticker))];
  const placeholders = tickers.map(() => "?").join(",");
  const { results: priceRows } = await env.DB.prepare(
    `SELECT ticker, last_price, div_yield FROM positions WHERE ticker IN (${placeholders})`
  ).bind(...tickers).all();

  const priceMap = {};
  for (const p of priceRows) priceMap[p.ticker] = p;

  let evaluated = 0;
  let correct = 0;
  let incorrect = 0;

  for (const signal of pendingSignals) {
    const current = priceMap[signal.ticker];
    if (!current?.last_price) continue;

    const currentPrice = current.last_price;
    const priceDiff = currentPrice - signal.price_at_signal;
    const pnlPct = signal.price_at_signal > 0 ? (priceDiff / signal.price_at_signal * 100) : 0;

    const daysSince = Math.floor((Date.now() - new Date(signal.original_fecha).getTime()) / 86400000);

    if (daysSince >= 7 && !signal.price_7d) {
      const pnl7d = pnlPct;
      let outcome7d = "neutral";
      if ((signal.action === "BUY" || signal.action === "ADD") && pnl7d > 2) outcome7d = "correct";
      else if ((signal.action === "BUY" || signal.action === "ADD") && pnl7d < -2) outcome7d = "incorrect";
      else if ((signal.action === "SELL" || signal.action === "TRIM") && pnl7d < -2) outcome7d = "correct";
      else if ((signal.action === "SELL" || signal.action === "TRIM") && pnl7d > 2) outcome7d = "incorrect";

      await env.DB.prepare(
        "UPDATE signal_tracking SET price_7d = ?, pnl_7d_pct = ?, outcome = ?, evaluated_at = datetime('now') WHERE id = ?"
      ).bind(currentPrice, Math.round(pnl7d * 100) / 100, outcome7d, signal.id).run();

      if (outcome7d === "correct") correct++;
      else if (outcome7d === "incorrect") incorrect++;
      evaluated++;
    }

    if (daysSince >= 30 && !signal.price_30d) {
      await env.DB.prepare(
        "UPDATE signal_tracking SET price_30d = ?, pnl_30d_pct = ?, evaluated_at = datetime('now') WHERE id = ?"
      ).bind(currentPrice, Math.round(pnlPct * 100) / 100, signal.id).run();
      evaluated++;
    }
  }

  // Compute overall accuracy and store in agent_memory
  const { results: allEvaluated } = await env.DB.prepare(
    "SELECT outcome, COUNT(*) as cnt FROM signal_tracking WHERE outcome IS NOT NULL GROUP BY outcome"
  ).all();
  const stats = {};
  for (const r of allEvaluated) stats[r.outcome] = r.cnt;
  const total = (stats.correct || 0) + (stats.incorrect || 0) + (stats.neutral || 0);
  const accuracy = total > 0 ? Math.round((stats.correct || 0) / total * 100) : 0;

  await setAgentMemory(env, "signal_accuracy", {
    fecha, accuracy, total,
    correct: stats.correct || 0,
    incorrect: stats.incorrect || 0,
    neutral: stats.neutral || 0,
  });

  // Store as insight if there are evaluated signals
  if (evaluated > 0) {
    await storeInsights(env, "postmortem", fecha, [{
      ticker: "_POSTMORTEM_",
      severity: accuracy < 40 ? "critical" : accuracy < 60 ? "warning" : "info",
      title: `Signal Accuracy: ${accuracy}% (${total} signals)`,
      summary: `${correct} correct, ${incorrect} incorrect, ${stats.neutral || 0} neutral out of ${total} evaluated signals. Evaluated ${evaluated} new signals today.`,
      details: { accuracy, total, correct, incorrect, neutral: stats.neutral || 0, evaluatedToday: evaluated },
      score: accuracy / 10,
    }]);
  }

  return { agent: "postmortem", evaluated, accuracy, correct, incorrect };
}

// ─── Agent 7: Insider Radar (FMP Ultimate — no LLM) ────────────
async function runInsiderAgent(env, fecha) {
  const key = env.FMP_KEY;
  if (!key) return { agent: "insider", skipped: true, reason: "no FMP key" };

  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, market_value, last_price FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "insider", skipped: true };

  const insights = [];
  const priceMap = {};
  for (const p of positions) priceMap[p.ticker] = p.last_price;

  // Load previous insider data from agent_memory for price impact comparison
  const prevInsiderData = await getAgentMemory(env, "insider_trades") || {};

  const insiderAlerts = [];
  const newTradeMemory = {};

  const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const cutoff1y = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const MAX_PAGES = 4; // ~400 rows max per ticker — enough for 1y on most names

  // 1. Fetch insider trades for portfolio tickers (FMP /v4/insider-trading)
  for (let i = 0; i < positions.length; i += 4) {
    const batch = positions.slice(i, i + 4);
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const sym = toFMP(p.ticker);
        try {
          // Paginate until we cross the 1-year cutoff or hit MAX_PAGES
          const allTrades = [];
          for (let page = 0; page < MAX_PAGES; page++) {
            // FMP stable insider trades endpoint
            const url = `https://financialmodelingprep.com/stable/insider-trading/search?symbol=${encodeURIComponent(sym)}&page=${page}&apikey=${key}`;
            const resp = await fetch(url);
            if (!resp.ok) break;
            const data = await resp.json();
            if (!Array.isArray(data) || !data.length) break;
            // Map FMP shape → internal shape (only open-market P/S)
            for (const t of data) {
              const txType = String(t.transactionType || '').trim().toUpperCase();
              const code = txType.charAt(0);
              if (code !== 'P' && code !== 'S') continue;
              const shares = Number(t.securitiesTransacted) || 0;
              const price = Number(t.price) || 0;
              const costK = price && shares ? Math.round((price * shares) / 1000) : null;
              allTrades.push({
                date: (t.transactionDate || '').slice(0, 10),
                insider: t.reportingName || 'Unknown',
                position: t.typeOfOwner || '',
                type: code,
                trans_share: shares,
                price: price ? String(price) : '0',
                cost: costK,
              });
            }
            // Stop paginating once we've crossed 1y
            const oldest = data[data.length - 1];
            const oldestDate = (oldest?.transactionDate || '').slice(0, 10);
            if (oldestDate && oldestDate < cutoff1y) break;
          }

          if (!allTrades.length) return null;

          // Filter to last 90 days
          const recent = allTrades.filter(t => (t.date || '') >= cutoff90);
          if (!recent.length) return null;

          const buys = recent.filter(t => (t.type || '').toUpperCase() === 'P');
          const sells = recent.filter(t => (t.type || '').toUpperCase() === 'S');
          if (!buys.length && !sells.length) return null;

          // Recurring seller detection (4+ sells in 1y by same person → likely 10b5-1 plan)
          const yearTrades = allTrades.filter(t => (t.date || '') >= cutoff1y);
          const sellerCounts = {};
          for (const t of yearTrades.filter(t => (t.type || '').toUpperCase() === 'S')) {
            const name = t.insider || 'Unknown';
            sellerCounts[name] = (sellerCounts[name] || 0) + 1;
          }
          const recurringSellerNames = Object.entries(sellerCounts).filter(([, c]) => c >= 4).map(([n]) => n);

          const enrichedTrades = recent.slice(0, 10).map(t => {
            const isBuy = (t.type || '').toUpperCase() === 'P';
            const tradePrice = parseFloat(String(t.price || '0').replace(/,/g, ''));
            const currentPrice = p.last_price || 0;
            const priceChangePct = tradePrice > 0 ? ((currentPrice - tradePrice) / tradePrice * 100) : null;
            const isRecurring = recurringSellerNames.includes(t.insider);
            return {
              date: t.date,
              insider: t.insider,
              position: t.position,
              type: isBuy ? 'COMPRA' : 'VENTA',
              shares: t.trans_share,
              price: t.price,
              currentPrice: currentPrice ? currentPrice.toFixed(2) : null,
              priceImpactPct: priceChangePct != null ? Math.round(priceChangePct * 10) / 10 : null,
              recurring: isRecurring,
              cost: t.cost ? `$${t.cost}k` : null,
            };
          });

          newTradeMemory[p.ticker] = enrichedTrades.slice(0, 5).map(t => ({
            date: t.date, type: t.type, price: t.price, insider: t.insider,
          }));

          return {
            ticker: p.ticker, name: p.name, currentPrice: p.last_price,
            buys: buys.length, sells: sells.length,
            recurringSellerNames, enrichedTrades,
          };
        } catch { return null; }
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) insiderAlerts.push(r.value);
    }
    if (i + 4 < positions.length) await new Promise(r => setTimeout(r, 800));
  }

  // 2. Generate insights with price impact and pattern analysis
  for (const alert of insiderAlerts) {
    const netBuys = alert.buys - alert.sells;
    const hasRecurringSellers = alert.recurringSellerNames.length > 0;
    const nonRecurringSells = alert.sells - alert.enrichedTrades.filter(t => t.type === 'VENTA' && t.recurring).length;

    // Smart severity: ignore recurring sellers (planned sales/10b5-1)
    let severity = 'info';
    let pattern = 'normal';

    if (netBuys >= 2) {
      severity = 'info'; // Insiders buying = bullish but not urgent
      pattern = 'cluster-buy';
    } else if (nonRecurringSells >= 3) {
      severity = 'critical'; // Multiple non-recurring sellers = real red flag
      pattern = 'cluster-sell';
    } else if (nonRecurringSells >= 1 && !hasRecurringSellers) {
      severity = 'warning';
      pattern = 'unusual-sell';
    } else if (hasRecurringSellers && nonRecurringSells === 0) {
      severity = 'info'; // All sales are recurring/planned
      pattern = 'planned-sales';
    } else if (alert.sells > alert.buys) {
      severity = 'warning';
      pattern = 'net-selling';
    }

    // Compute average price impact across trades
    const impacts = alert.enrichedTrades.filter(t => t.priceImpactPct != null);
    const avgImpact = impacts.length ? Math.round(impacts.reduce((s, t) => s + t.priceImpactPct, 0) / impacts.length * 10) / 10 : null;

    // Build title
    const patternLabels = {
      'cluster-buy': `Compra colectiva en ${alert.ticker}`,
      'cluster-sell': `ALERTA: Ventas inusuales en ${alert.ticker}`,
      'unusual-sell': `Venta inusual en ${alert.ticker}`,
      'planned-sales': `Ventas planificadas en ${alert.ticker}`,
      'net-selling': `Insiders vendiendo ${alert.ticker}`,
      'normal': `Actividad insider en ${alert.ticker}`,
    };
    const title = patternLabels[pattern] || `Insider ${alert.ticker}`;

    // Summary with context
    const recurringNote = hasRecurringSellers ? ` (${alert.recurringSellerNames.length} vendedor${alert.recurringSellerNames.length > 1 ? 'es' : ''} recurrente${alert.recurringSellerNames.length > 1 ? 's' : ''} — probable plan 10b5-1 fiscal)` : '';
    const impactNote = avgImpact != null ? ` Precio actual vs media de trades: ${avgImpact > 0 ? '+' : ''}${avgImpact}%.` : '';

    insights.push({
      ticker: alert.ticker,
      severity,
      title,
      summary: `${alert.buys} compras, ${alert.sells} ventas (90d). ${alert.name}${recurringNote}.${impactNote}`,
      details: {
        compras: alert.buys,
        ventas: alert.sells,
        netBuys,
        signal: pattern,
        precioActual: alert.currentPrice,
        impactoPrecioMedio: avgImpact,
        vendedoresRecurrentes: alert.recurringSellerNames,
        trades: alert.enrichedTrades,
      },
      score: pattern === 'cluster-buy' ? 8 : pattern === 'cluster-sell' ? 2 : pattern === 'planned-sales' ? 6 : pattern === 'unusual-sell' ? 3 : 5,
    });
  }

  // Note: Guru 13F new picks block removed (no FMP equivalent for guru tracking).
  // Could be re-added later via WhaleWisdom or similar.

  // Save trade memory for future price impact tracking
  await setAgentMemory(env, "insider_trades", newTradeMemory);

  if (!insights.length) {
    insights.push({
      ticker: '_INSIDER_',
      severity: 'info',
      title: 'Sin actividad insider relevante',
      summary: 'No se detectaron compras o ventas significativas de insiders ni gurus en tus posiciones en los ultimos 90 dias.',
      details: { positionsChecked: positions.length, signal: 'none' },
      score: 5,
    });
  }

  const stored = await storeInsights(env, "insider", fecha, insights);
  return { agent: "insider", insights: stored, insiderAlerts: insiderAlerts.length };
}

// ─── Agent 8: Value Signals (GuruFocus cached data — no LLM) ───
// Scans portfolio + watchlist for undervalued stocks with institutional buying.
// Quality is now scored as a multi-factor COMPOSITE so we don't rely on GF Score alone.
async function runValueSignalsAgent(env, fecha) {
  const token = env.GURUFOCUS_TOKEN;
  if (!token) return { agent: "value", skipped: true, reason: "no GF token" };

  const base = `https://api.gurufocus.com/public/user/${token}`;

  // 1. Portfolio positions + GF cache (already have this data)
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, market_value, last_price, div_yield, div_ttm FROM positions WHERE shares > 0"
  ).all();
  const ownedSet = new Set(positions.map(p => p.ticker));
  const ownedTickers = positions.map(p => p.ticker);
  const gfMap = await getGfData(env, ownedTickers);

  // Load latest Q+S scores so we can blend them into the composite
  const { results: qsRows } = await env.DB.prepare(
    `SELECT ticker, quality_score, safety_score FROM quality_safety_scores
     WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM quality_safety_scores)`
  ).all().catch(() => ({ results: [] }));
  const qsMap = {};
  for (const r of (qsRows || [])) qsMap[r.ticker] = r;

  // Quality composite (0-10 scale). Combines:
  //   GF Score (40%), Financial Strength (25%), Q+S Quality (25%), insider buys (10%)
  // This catches "high GF Score but high debt" or "decent GF but Piotroski tanked" cases
  // that the previous single-factor filter missed.
  const qualityComposite = ({ gfScore, finStrength, qsQuality, insiderBuys, dividendStreakYears }) => {
    const w = { gf: 0.30, fin: 0.20, qs: 0.30, insider: 0.10, streak: 0.10 };
    const norm = {
      gf: Math.min(10, (Number(gfScore) || 0) / 10),
      fin: Math.min(10, Number(finStrength) || 0),
      qs: Math.min(10, (Number(qsQuality) || 0) / 10),
      insider: insiderBuys > 5 ? 9 : insiderBuys > 0 ? 7 : 5,
      streak: dividendStreakYears != null ? Math.min(10, dividendStreakYears / 5) : 5,
    };
    const composite = w.gf*norm.gf + w.fin*norm.fin + w.qs*norm.qs + w.insider*norm.insider + w.streak*norm.streak;
    return Math.round(composite * 10) / 10; // 0..10 with 1 decimal
  };

  // 2. Scan 120+ top dividend stocks NOT in portfolio
  // Dividend Aristocrats + Champions + high-quality dividend payers
  const WATCHLIST = [
    // Dividend Aristocrats (25+ years of increases)
    'JNJ','ABBV','PEP','MCD','TXN','LMT','ITW','CL','SYY','APD','ECL','SHW',
    'CTAS','WM','AFL','AOS','BDX','BEN','CAH','CB','CINF','CLX','DOV',
    'EMR','ESS','EXPD','GD','GPC','GWW','HRL','SJM','LEG','LIN','LOW',
    'MKC','NDSN','NUE','PNR','PPG','ROP','SPGI','SWK','TGT','WBA','WST','XOM',
    // High-yield quality dividend payers
    'VZ','T','IBM','CVX','EOG','PSX','MPC','EPD','ET','MPLX','OKE',
    'MO','PM','BTI','UGI','ENB',
    // Dividend growth tech/growth
    'AVGO','HD','MSFT','AAPL','BLK','SBUX','QCOM','CSCO',
    // REITs quality
    'DLR','PSA','SPG','VICI','NNN','STAG','WPC',
    // Utilities
    'NEE','DUK','SO','XEL','AEP','ED','WEC','D','AES','PPL',
    // Healthcare dividend
    'PFE','BMY','AMGN','GILD','MRK','UNH',
    // Industrials
    'UNP','CAT','DE','HON','MMM','RTX','BA','LHX','GE',
    // Financial dividend
    'TROW','PRU','MET','AIG','ALL','TFC','USB','WFC',
  ].filter(t => !ownedSet.has(t));

  // Fetch GF summary for watchlist tickers (batches of 8)
  const watchlistData = {};
  for (let i = 0; i < WATCHLIST.length; i += 8) {
    const batch = WATCHLIST.slice(i, i + 8);
    const results = await Promise.allSettled(
      batch.map(async (sym) => {
        try {
          const resp = await fetch(`${base}/stock/${sym}/summary`);
          if (!resp.ok) return null;
          const data = await resp.json();
          const s = data?.summary || data;
          const g = s?.general || {};
          const ch = s?.chart || {};
          const cd = s?.company_data || {};
          return {
            symbol: sym, company: cd.company || g.company,
            price: cd.price || g.price, gf_value: ch['GF Value'],
            gf_score: g.gf_score, gf_valuation: g.gf_valuation,
            financial_strength_rank: g.rank_financial_strength,
            profitability_rank: g.rank_profitability,
            dividend_yield: cd.yield, shareholder_yield: cd.shareholder_yield,
            '13f_buys': s?.guru?.['13f_buys'], sector: g.sector,
          };
        } catch { return null; }
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) watchlistData[r.value.symbol] = r.value;
    }
    if (i + 8 < WATCHLIST.length) await new Promise(r => setTimeout(r, 1200));
  }

  const insights = [];

  // 3. Scan PORTFOLIO for add opportunities (already owned, undervalued)
  for (const p of positions) {
    const gf = gfMap[p.ticker];
    if (!gf || !gf.gfValue) continue;
    const price = p.last_price || 0;
    const gfValue = parseFloat(gf.gfValue) || 0;
    if (!gfValue || !price) continue;
    const priceToGfValue = price / gfValue;
    const discount = Math.round((1 - priceToGfValue) * 100);
    const gfScore = parseFloat(gf.gfScore) || 0;
    const finStrength = parseFloat(gf.financialStrength) || 0;
    const guruBuys = parseFloat(gf.guruBuys13f) || 0;
    const insiderBuys = parseFloat(gf.insiderBuys3m) || 0;

    // Only flag if meaningfully undervalued
    if (discount < 10) continue;

    // Quality composite (multi-factor: GF + finStrength + Q+S + insider + streak)
    const qsQuality = qsMap[p.ticker]?.quality_score;
    const dgrStreak = parseFloat(gf.dividendStreakYears || gf.streak) || null;
    const composite = qualityComposite({ gfScore, finStrength, qsQuality, insiderBuys, dividendStreakYears: dgrStreak });
    // Must have decent quality on COMPOSITE — not just GF Score alone
    if (composite < 5.0) continue;

    const divYieldPct = (p.div_yield || 0) * 100;
    const volatility = parseFloat(gf.volatility1y) || 20;

    // Put selling calculation: sell put at ~10% below current price
    const putStrike = Math.round(price * 0.90 * 100) / 100;
    const putDiscountVsGF = gfValue > 0 ? Math.round((1 - putStrike / gfValue) * 100) : 0;
    // Estimated annual premium ~0.3-0.5x volatility for ATM, ~0.15-0.25x for 10% OTM
    const estPremiumPct = Math.round(volatility * 0.2 * 10) / 10; // ~20% of vol as annual premium
    const estPremiumMonthly = Math.round(putStrike * estPremiumPct / 100 / 12 * 100) / 100;

    // Income strategy context
    const totalYield = divYieldPct + estPremiumPct;
    const yocOnPut = (p.div_ttm && putStrike > 0) ? (p.div_ttm / putStrike * 100).toFixed(1) : null;
    const putNote = price > 20 ? `Vender Put $${putStrike} (${putDiscountVsGF}% bajo GF Value) → prima ~${estPremiumPct}% anual.${yocOnPut ? ` Si asignado, YOC ${yocOnPut}%.` : ''}` : '';

    const severity = discount >= 30 ? 'critical' : discount >= 20 ? 'warning' : 'info';
    insights.push({
      ticker: p.ticker,
      severity,
      title: `ADD: ${p.name || p.ticker} -${discount}% vs GF Value`,
      summary: `${p.ticker} a $${price.toFixed(2)} vs GF Value $${gfValue.toFixed(2)} (${discount}% desc). GF Score ${gfScore}, Strength ${finStrength}/10, Div ${divYieldPct.toFixed(1)}%.${guruBuys > 30 ? ` Gurus: ${guruBuys.toFixed(0)}% comprando.` : ''} ${putNote}`,
      details: {
        descuento: `${discount}%`, gfScore, gfValue: `$${gfValue.toFixed(2)}`, precio: `$${price.toFixed(2)}`,
        financialStrength: finStrength,
        qualityComposite: composite,
        qsQuality: qsQuality ?? null,
        dividendStreakYears: dgrStreak ?? null,
        dividendYield: `${divYieldPct.toFixed(2)}%`,
        dividendYieldNum: divYieldPct,
        putStrike: price > 20 ? `$${putStrike}` : 'N/A (precio bajo)',
        putPrimaAnual: price > 20 ? `~${estPremiumPct}%` : 'N/A',
        putPrimaMensual: price > 20 ? `~$${estPremiumMonthly}/acc` : 'N/A',
        yieldTotalConPut: price > 20 ? `~${totalYield.toFixed(1)}% (div + put)` : `${divYieldPct.toFixed(1)}%`,
        gfValuation: gf.gfValuation || 'N/A',
        fuente: 'Portfolio scan', enPortfolio: 'SI',
      },
      // Score combines discount magnitude AND quality composite
      score: Math.min(10, Math.round(discount / 5) + (composite >= 7.5 ? 2 : composite >= 6 ? 1 : 0)),
    });
  }

  // 4. Scan WATCHLIST for new buy opportunities
  for (const [sym, s] of Object.entries(watchlistData)) {
    const price = parseFloat(s.price || s.current_price || 0);
    const gfValue = parseFloat(s.gf_value || 0);
    if (!gfValue || !price) continue;
    const priceToGfValue = price / gfValue;
    const discount = Math.round((1 - priceToGfValue) * 100);
    const gfScore = parseFloat(s.gf_score || 0);
    const finStrength = parseFloat(s.financial_strength_rank || 0);
    const profitRank = parseFloat(s.profitability_rank || 0);
    const divYield = parseFloat(s.dividend_yield || 0);
    const guruBuys = parseFloat(s['13f_buys'] || 0);
    const shareholderYield = parseFloat(s.shareholder_yield || 0);

    // Strict filters: undervalued + quality + pays dividend
    if (discount < 15) continue;
    if (gfScore < 60) continue;
    if (finStrength < 5) continue;
    if (divYield < 1) continue;

    // Watchlist tickers don't have Q+S yet, but we still apply the composite
    // (without the qsQuality term) to keep filtering consistent.
    const watchComposite = qualityComposite({ gfScore, finStrength, qsQuality: null, insiderBuys: 0, dividendStreakYears: null });
    if (watchComposite < 5.5) continue;

    // Put selling calculation
    const putStrike = Math.round(price * 0.90 * 100) / 100;
    const putDiscountVsGF = gfValue > 0 ? Math.round((1 - putStrike / gfValue) * 100) : 0;
    const estVol = 25; // assume average vol for unknown stocks
    const estPremiumPct = Math.round(estVol * 0.2 * 10) / 10;
    const totalYield = divYield + estPremiumPct;
    const putNote = price > 20 ? `Put $${putStrike} → prima ~${estPremiumPct}% anual. Total yield potencial ~${totalYield.toFixed(1)}%.` : '';

    const severity = discount >= 35 ? 'critical' : discount >= 25 ? 'warning' : 'info';
    insights.push({
      ticker: sym,
      severity,
      title: `NEW: ${s.company || sym} -${discount}% | Div ${divYield.toFixed(1)}%`,
      summary: `${s.company || sym} a $${price.toFixed(2)} vs GF Value $${gfValue.toFixed(2)} (${discount}% desc). GF Score ${gfScore}, Strength ${finStrength}/10, Div ${divYield.toFixed(1)}%.${guruBuys > 30 ? ` Gurus: ${guruBuys.toFixed(0)}% comprando.` : ''} ${putNote}`,
      details: {
        descuento: `${discount}%`, gfScore, gfValue: `$${gfValue.toFixed(2)}`, precio: `$${price.toFixed(2)}`,
        financialStrength: finStrength, profitabilityRank: profitRank,
        qualityComposite: watchComposite,
        dividendYield: `${divYield.toFixed(2)}%`,
        dividendYieldNum: divYield,
        shareholderYield: `${shareholderYield.toFixed(2)}%`,
        putStrike: price > 20 ? `$${putStrike}` : 'N/A',
        putPrimaAnual: price > 20 ? `~${estPremiumPct}%` : 'N/A',
        yieldTotalConPut: price > 20 ? `~${totalYield.toFixed(1)}% (div + put)` : `${divYield.toFixed(1)}%`,
        gfValuation: s.gf_valuation || 'N/A', sector: s.sector,
        fuente: 'Watchlist scan', enPortfolio: 'NO',
      },
      score: Math.min(10, Math.round(discount / 5) + (gfScore >= 80 ? 2 : 0) + (divYield >= 3 ? 1 : 0)),
    });
  }

  // Sort: external opportunities first (discoveries), then portfolio adds
  const external = insights.filter(i => i.details.enPortfolio === 'NO').sort((a, b) => (b.score || 0) - (a.score || 0));
  const internal = insights.filter(i => i.details.enPortfolio === 'SI').sort((a, b) => (b.score || 0) - (a.score || 0));
  const sortedInsights = [...external.slice(0, 10), ...internal.slice(0, 10)];

  if (!sortedInsights.length) {
    sortedInsights.push({
      ticker: '_VALUE_',
      severity: 'info',
      title: 'Sin oportunidades excepcionales hoy',
      summary: `Escaneadas ${positions.length} posiciones del portfolio y ${Object.keys(watchlistData).length} acciones del watchlist. Ninguna pasa todos los filtros.`,
      details: { portfolioEscaneado: positions.length, watchlistEscaneado: Object.keys(watchlistData).length, exteriorEncontradas: external.length, portfolioEncontradas: internal.length },
      score: 5,
    });
  }

  const stored = await storeInsights(env, "value", fecha, sortedInsights);
  return { agent: "value", insights: sortedInsights.length, external: external.length, internal: internal.length, portfolioScanned: positions.length, watchlistScanned: Object.keys(watchlistData).length };
}

// ─── Agent 9: Options Income (IB Greeks + Yahoo fallback — no LLM) ──
// Scans ENTIRE portfolio for CC, CSP opportunities with real Greeks
async function runOptionsIncomeAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, shares, market_value, last_price, avg_price, div_yield, div_ttm, sector FROM positions WHERE shares > 0 AND last_price > 5"
  ).all();
  if (!positions.length) return { agent: "options", skipped: true };

  const mkt = await getMarketIndicators(env);
  const vix = mkt['^VIX']?.price || 20;
  const regime = await getAgentMemory(env, "regime_current");
  const gfMapOpts = await getGfData(env, positions.map(p => p.ticker));
  const insights = [];

  // Yahoo for speed (FMP Ultimate doesn't expose options chain endpoint publicly)
  const ib = null; // IB available via /api/ib-options?symbols=X for Greeks on demand

  // Sort by market value — scan ALL positions
  const sorted = [...positions].sort((a, b) => (b.market_value || 0) - (a.market_value || 0));
  let scanned = 0, noOptions = 0, withOpportunity = 0;

  const monthNames = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const now = new Date();
  const targetDate = new Date(now.getTime() + 35 * 86400000);
  const targetMonth = monthNames[targetDate.getMonth()] + String(targetDate.getFullYear()).slice(2);

  // Process ALL positions in parallel batches of 5
  // Tickers that definitely don't have US options
  const NO_OPTIONS = new Set(['BME:VIS','BME:AMS','HKG:9618','HKG:1052','HKG:1910','HKG:2219','HKG:9616',
    'AZJ','WKL','SHUR','HEN3','LSEG','ITRK','GQG','NET.UN','CNSWF',
    'BIZD','DIVO','SPHD','FDJU','WEEL','MSDL','IIPR-PRA','LANDP']);

  async function scanPosition(pos) {
    const sym = pos.ticker.replace(/^(BME:|HKG:|LSE:)/, '');
    const price = pos.last_price || 0;

    // Skip non-optionable tickers
    if (NO_OPTIONS.has(pos.ticker)) return { pos, ccData: null, cspData: null, skip: 'Internacional/ETF sin opciones US' };
    if (!price || price < 5) return { pos, ccData: null, cspData: null, skip: `Precio $${price.toFixed(2)} — muy bajo para opciones` };
    if (pos.shares < 100 && pos.market_value < 5000) return { pos, ccData: null, cspData: null, skip: `${pos.shares} acc (<100) — posicion pequena` };

    let ccData = null, cspData = null;
    try {
      const resp = await fetchYahoo(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}`);
      if (!resp.ok) return { pos, ccData: null, cspData: null, skip: resp.status === 401 ? 'Mercado cerrado o sin opciones' : `Sin datos (${resp.status})` };
      const data = await resp.json();
      const result = data?.optionChain?.result?.[0];
      if (!result) return { pos, ccData: null, cspData: null, skip: 'Sin cadena de opciones' };

      const exps = result.expirationDates || [];
      if (!exps.length) return { pos, ccData: null, cspData: null, skip: 'Sin vencimientos disponibles' };
      const nowTs = Math.floor(Date.now() / 1000);
      const targetTs = nowTs + 35 * 86400;
      let bestExp = exps[0];
      for (const exp of exps) { if (Math.abs(exp - targetTs) < Math.abs(bestExp - targetTs)) bestExp = exp; }
      const dte = Math.max(1, Math.round((bestExp - nowTs) / 86400));
      let options = result.options?.[0] || {};
      if (bestExp !== exps[0]) {
        const r2 = await fetchYahoo(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}?date=${bestExp}`);
        if (r2.ok) { const d2 = await r2.json(); options = d2?.optionChain?.result?.[0]?.options?.[0] || options; }
      }
      const calls = (options.calls || []).filter(c => c.bid > 0 && c.strike > price * 1.03 && c.strike < price * 1.15);
      const puts = (options.puts || []).filter(p => p.bid > 0 && p.strike < price * 0.97 && p.strike > price * 0.80);
      const earningsTs = result.quote?.earningsTimestamp;
      const earningsInDays = earningsTs ? Math.round((earningsTs - nowTs) / 86400) : null;

      if (calls.length && pos.shares >= 100) {
        const best = calls.reduce((b, c) => Math.abs(c.strike - price * 1.05) < Math.abs(b.strike - price * 1.05) ? c : b, calls[0]);
        ccData = { strike: best.strike, bid: best.bid, iv: best.impliedVolatility || 0, delta: null, theta: null, dte, earningsInDays, source: 'Yahoo' };
      }
      if (puts.length) {
        const best = puts.reduce((b, p) => Math.abs(p.strike - price * 0.92) < Math.abs(b.strike - price * 0.92) ? p : b, puts[0]);
        cspData = { strike: best.strike, bid: best.bid, iv: best.impliedVolatility || 0, delta: null, theta: null, dte, earningsInDays, source: 'Yahoo' };
      }
      return { pos, ccData, cspData };
    } catch (e) { return { pos, ccData: null, cspData: null, skip: 'Sin datos — reintentar con mercado abierto' }; }
  }

  // Batch scan 5 at a time
  for (let i = 0; i < sorted.length; i += 5) {
    const batch = sorted.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(scanPosition));
    for (const r of results) {
      const { pos, ccData, cspData, skip } = r.status === 'fulfilled' ? r.value : { pos: batch[0], ccData: null, cspData: null, skip: 'Promise failed' };
      const price = pos.last_price || 0;
      const gf = gfMapOpts[pos.ticker] || {};
      const histVol = parseFloat(gf.volatility1y) || 25;
      const divYieldPct = (pos.div_yield || 0) * 100;

      scanned++;

      if (skip) {
        insights.push({ ticker: pos.ticker, severity: 'info', title: `${pos.ticker}: ${skip}`,
          summary: `${pos.name || pos.ticker} ($${price.toFixed(2)}, ${pos.shares} acc, $${Math.round(pos.market_value || 0).toLocaleString()})`,
          details: { precio: `$${price.toFixed(2)}`, acciones: pos.shares, valor: `$${Math.round(pos.market_value || 0)}`, motivo: skip, cc: 'N/A', csp: 'N/A' }, score: 0 });
        noOptions++;
        continue;
      }

      if (!ccData && !cspData) {
        insights.push({ ticker: pos.ticker, severity: 'info', title: `${pos.ticker}: sin primas atractivas`,
          summary: `${pos.name || pos.ticker} ($${price.toFixed(2)}, ${pos.shares} acc, $${Math.round(pos.market_value || 0).toLocaleString()}). Opciones sin bid o primas muy bajas.`,
          details: { precio: `$${price.toFixed(2)}`, acciones: pos.shares, valor: `$${Math.round(pos.market_value || 0)}`, motivo: 'Primas insuficientes', cc: 'N/A', csp: 'N/A' }, score: 0 });
        noOptions++;
        continue;
      }

      withOpportunity++;

      const dte = ccData?.dte || cspData?.dte || 35;
      const earningsInDays = ccData?.earningsInDays || cspData?.earningsInDays;
      const earningsNote = earningsInDays && earningsInDays < dte + 5 ? ' EARNINGS CERCA.' : '';

    if (ccData && pos.shares >= 100) {
      const contracts = Math.floor(pos.shares / 100);
      const premium = ccData.bid * 100 * contracts;
      const premPct = (ccData.bid / price * 100);
      const ann = premPct * (365 / dte);
      const otmPct = ((ccData.strike - price) / price * 100);
      const totalYield = ann + divYieldPct;
      const ivPct = (ccData.iv > 1 ? ccData.iv : ccData.iv * 100);
      const ivRank = histVol > 0 ? Math.round(Math.min(100, Math.max(0, (ivPct / histVol - 0.5) * 100))) : null;

      let sev = 'info';
      if (ann >= 12 && (ivRank == null || ivRank > 30)) sev = 'warning';
      if (ann >= 20) sev = 'critical';

      insights.push({ ticker: pos.ticker, severity: sev,
        title: `CC: ${pos.ticker} $${ccData.strike} | ${ann.toFixed(0)}%/a | ${totalYield.toFixed(0)}% total`,
        summary: `Vender ${contracts} Call $${ccData.strike} (${otmPct.toFixed(1)}% OTM, ~${dte}d) por $${premium.toFixed(0)}. ${ann.toFixed(0)}% anualizado + div ${divYieldPct.toFixed(1)}% = ${totalYield.toFixed(0)}% total.${ccData.delta ? ` Delta: ${ccData.delta.toFixed(2)}.` : ''}${ccData.theta ? ` Theta: $${ccData.theta.toFixed(2)}/dia.` : ''} IV: ${ivPct.toFixed(0)}%.${ivRank != null ? ` IV rank: ${ivRank}%.` : ''} [${ccData.source}]`,
        details: {
          estrategia: 'Covered Call', strike: `$${ccData.strike}`, otmPct: `${otmPct.toFixed(1)}%`,
          prima: `$${premium.toFixed(0)} (${contracts}x)`, anualizada: `${ann.toFixed(0)}%`,
          delta: ccData.delta ? ccData.delta.toFixed(3) : 'N/A', theta: ccData.theta ? `$${ccData.theta.toFixed(2)}/dia` : 'N/A',
          iv: `${ivPct.toFixed(0)}%`, ivRank: ivRank != null ? `${ivRank}%` : 'N/A',
          dividendo: `${divYieldPct.toFixed(1)}%`, yieldTotal: `${totalYield.toFixed(0)}%`,
          acciones: pos.shares, fuente: ccData.source,
        },
        score: Math.min(10, Math.round(ann / 4) + (ivRank > 50 ? 2 : 0)),
      });
    }

    if (cspData) {
      const putPremPct = (cspData.bid / cspData.strike * 100);
      const ann = putPremPct * (365 / dte);
      const otmPct = ((price - cspData.strike) / price * 100);
      const yocAssigned = pos.div_ttm ? (pos.div_ttm / cspData.strike * 100) : 0;
      const isGood = pos.avg_price ? cspData.strike < pos.avg_price : true;

      let sev = 'info';
      if (ann >= 10 && isGood) sev = 'warning';
      if (ann >= 18 && isGood) sev = 'critical';

      insights.push({ ticker: pos.ticker, severity: sev,
        title: `CSP: ${pos.ticker} $${cspData.strike} | ${ann.toFixed(0)}%/a`,
        summary: `Vender Put $${cspData.strike} (${otmPct.toFixed(1)}% OTM, ~${dte}d) por $${cspData.bid.toFixed(2)}/acc. ${ann.toFixed(0)}% anualizado.${pos.avg_price ? ` Tu avg: $${pos.avg_price.toFixed(2)}${isGood ? ' (compras mas barato)' : ''}.` : ''}${yocAssigned > 0 ? ` YOC asignado: ${yocAssigned.toFixed(1)}%.` : ''}${cspData.delta ? ` Delta: ${cspData.delta.toFixed(2)}.` : ''} [${cspData.source}]`,
        details: {
          estrategia: 'Cash Secured Put', strike: `$${cspData.strike}`, otmPct: `${otmPct.toFixed(1)}%`,
          prima: `$${(cspData.bid * 100).toFixed(0)}/contrato`, anualizada: `${ann.toFixed(0)}%`,
          delta: cspData.delta ? cspData.delta.toFixed(3) : 'N/A',
          cashNecesario: `$${(cspData.strike * 100).toFixed(0)}`,
          avgCost: pos.avg_price ? `$${pos.avg_price.toFixed(2)}` : 'N/A',
          yocSiAsignado: yocAssigned > 0 ? `${yocAssigned.toFixed(1)}%` : 'N/A',
          fuente: cspData.source,
        },
        score: Math.min(10, Math.round(ann / 4) + (isGood ? 1 : 0)),
      });
    }

    } // end for results in batch
    // Rate limit between batches
    if (i + 5 < sorted.length) await new Promise(r => setTimeout(r, 1000));
  } // end batch loop

  // Sort by score
  // Sort: opportunities first (by score), then rest by market value (portfolio order)
  const opps = insights.filter(i => i.score > 0).sort((a, b) => (b.score || 0) - (a.score || 0));
  const rest = insights.filter(i => i.score === 0);
  insights.length = 0;
  insights.push(...opps, ...rest);

  const stored = await storeInsights(env, "options", fecha, insights.slice(0, 85));
  return { agent: "options", insights: Math.min(insights.length, 85), scanned, withOpportunity, noOptions, source: ib ? 'IB+Yahoo' : 'Yahoo' };
}

// ─── Agent 14: SEC Filings Tracker (no LLM, EDGAR free) ─────────
// Tracks 8-K filings (material events) for portfolio tickers via SEC EDGAR's
// submissions API. 8-Ks are filed within 4 business days of: executive departures,
// going concern warnings, material agreements, M&A, dividend changes, asset
// impairments. Cluster of multiple 8-Ks in 30 days = significant.
//
// Uses companyfacts API: https://data.sec.gov/submissions/CIK{padded}.json
// Requires CIK lookup which we cache in agent_memory.
async function runSECFilingsAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, category, sector FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "sec_filings", skipped: true };

  // Only US-listed companies have SEC filings. Skip foreign tickers + ETFs/preferreds.
  const eligible = positions.filter(p => {
    if (/etf|preferred/i.test(p.category || "")) return false;
    if (/^(BME:|HKG:|LSE:|TSE:)/.test(p.ticker)) return false;
    if (/\.(AS|BR|MC|DE|PA|L|AX|TO|V|HK)$/i.test(p.ticker)) return false;
    return true;
  });
  if (!eligible.length) return { agent: "sec_filings", scanned: 0, alerts: 0 };

  // CIK cache: ticker -> CIK string. Built lazily, persisted in agent_memory.
  let cikCache = (await getAgentMemory(env, "sec_cik_cache")) || {};
  let cikLookups = 0;

  // SEC EDGAR requires a User-Agent header
  const SEC_HEADERS = { "User-Agent": "AyR Portfolio Tracker / contact@example.com", "Accept": "application/json" };

  // Helper: lookup CIK if not cached. Uses /cgi-bin/browse-edgar (HTML scrape) is slow,
  // so we use the official tickers map JSON which has all SEC tickers in one fetch.
  const ensureCikMap = async () => {
    if (Object.keys(cikCache).length > 100) return; // already populated
    try {
      const resp = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: SEC_HEADERS });
      if (!resp.ok) return;
      const data = await resp.json();
      // data is { "0": { cik_str, ticker, title }, "1": {...}, ... }
      for (const k of Object.keys(data)) {
        const r = data[k];
        if (r?.ticker && r?.cik_str != null) {
          cikCache[r.ticker.toUpperCase()] = String(r.cik_str).padStart(10, "0");
          cikLookups++;
        }
      }
      await setAgentMemory(env, "sec_cik_cache", cikCache);
    } catch (e) { console.error("[SEC] CIK map fetch failed:", e.message); }
  };
  await ensureCikMap();

  const insights = [];
  let scanned = 0;
  let withFilings = 0;
  const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // Process in batches of 5 with 1.5s delay (SEC rate limit ~10 req/sec)
  for (let i = 0; i < eligible.length; i += 5) {
    const batch = eligible.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(async (p) => {
      const cik = cikCache[p.ticker.toUpperCase()];
      if (!cik) return null;
      try {
        const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
        const resp = await fetch(url, { headers: SEC_HEADERS });
        if (!resp.ok) return null;
        const data = await resp.json();
        // recent.form is array of form types parallel to recent.filingDate
        const recent = data?.filings?.recent || {};
        const forms = recent.form || [];
        const dates = recent.filingDate || [];
        const items = recent.items || []; // 8-K item codes
        // Filter to last 30 days
        const recentFilings = [];
        for (let k = 0; k < forms.length && k < 50; k++) {
          if ((dates[k] || "") >= cutoff30) {
            recentFilings.push({ form: forms[k], date: dates[k], items: items[k] || "" });
          }
        }
        return { ticker: p.ticker, name: p.name, recentFilings };
      } catch { return null; }
    }));

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const { ticker, name, recentFilings } = r.value;
      scanned++;
      if (!recentFilings.length) continue;

      // Categorize
      const eightKs = recentFilings.filter(f => f.form === "8-K");
      const tenQs = recentFilings.filter(f => /10-Q/.test(f.form));
      const tenKs = recentFilings.filter(f => /10-K/.test(f.form));

      // 8-K item codes that matter MOST for dividend investors. Excluded 8.01
      // (other events) because it's dominated by routine dividend declarations.
      // Excluded 1.01/1.02 (material agreements) because most are routine.
      //   2.05 = costs associated with exit/disposal (restructuring)
      //   2.06 = material impairments
      //   3.03 = material modification to security holders' rights (dividend cut!)
      //   4.01 = change in registrant's certifying accountant (audit concern)
      //   4.02 = non-reliance on previously issued financial statements (RESTATEMENT)
      //   5.02 = departure of directors / officers (CEO/CFO)
      const RED_FLAG_ITEMS = /\b(2\.05|2\.06|3\.03|4\.01|4\.02|5\.02)\b/;
      const flaggedItems = eightKs.filter(f => RED_FLAG_ITEMS.test(f.items || ""));

      let severity = null;
      let title = "";
      let reason = "";

      if (flaggedItems.length >= 2) {
        severity = "critical";
        title = `${ticker}: Múltiples 8-Ks materiales (30d)`;
        const itemCodes = [...new Set(flaggedItems.flatMap(f => (f.items || "").split(",").map(s => s.trim())).filter(c => RED_FLAG_ITEMS.test(c)))];
        reason = `${flaggedItems.length} 8-Ks con items críticos en 30 días: ${itemCodes.join(", ")}. Posibles cambios ejecutivos, impairments o restructuración.`;
      } else if (flaggedItems.length === 1) {
        const f = flaggedItems[0];
        const itemMatch = (f.items || "").match(RED_FLAG_ITEMS);
        const code = itemMatch ? itemMatch[0] : "?";
        const codeLabel = ({
          "2.05": "restructuración",
          "2.06": "impairment material",
          "3.03": "modificación derechos accionistas",
          "5.02": "salida ejecutivo",
          "8.01": "evento material",
        })[code] || code;
        severity = "warning";
        title = `${ticker}: 8-K item ${code} (${codeLabel})`;
        reason = `8-K filed ${f.date} con item ${code} (${codeLabel}). Revisar contenido en SEC EDGAR.`;
      } else if (eightKs.length >= 4) {
        severity = "warning";
        title = `${ticker}: ${eightKs.length} 8-Ks en 30 días`;
        reason = `Cluster inusual de ${eightKs.length} 8-Ks (sin items críticos identificados). Posible actividad corporativa.`;
      }

      if (severity) {
        withFilings++;
        insights.push({
          ticker, severity, title,
          summary: `${name || ticker}. ${reason}`,
          details: {
            eightKs: eightKs.length,
            tenQs: tenQs.length,
            tenKs: tenKs.length,
            flaggedItems: flaggedItems.length,
            recentFilings: recentFilings.slice(0, 6),
          },
          score: severity === "critical" ? 9 : 5,
        });
      }
    }

    if (i + 5 < eligible.length) await new Promise(r => setTimeout(r, 1500));
  }

  // Cleanup stale rows
  const flagged = new Set(insights.map(i => i.ticker));
  try {
    const { results: existing } = await env.DB.prepare(
      "SELECT ticker FROM agent_insights WHERE agent_name = 'sec_filings' AND fecha = ?"
    ).bind(fecha).all();
    for (const row of (existing || [])) {
      if (!flagged.has(row.ticker)) {
        await env.DB.prepare(
          "DELETE FROM agent_insights WHERE agent_name = 'sec_filings' AND fecha = ? AND ticker = ?"
        ).bind(fecha, row.ticker).run();
      }
    }
  } catch {}

  insights.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  const stored = await storeInsights(env, "sec_filings", fecha, insights);
  return { agent: "sec_filings", scanned, alerts: insights.length, withFilings, stored, cikLookups };
}

// ─── Agent 13: Earnings Trend Pattern (no LLM) ──────────────────
// Pure-calculation pattern detector that complements the Opus Earnings agent.
// Flags two specific patterns that humans miss when looking quarter-by-quarter:
//   1. 2+ consecutive earnings misses (operating income or EPS down YoY twice in a row)
//   2. Operating margin compression > 100bps YoY with revenue flat/down
// Uses cached FMP financials — zero API calls, zero LLM cost.
async function runEarningsTrendAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, sector, category FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "earnings_trend", skipped: true };

  // Skip ETFs/preferreds (no income statement) and REITs/MLPs (operating income
  // is not representative of business health — they report FFO/AFFO).
  const eligible = positions.filter(p => {
    if (/etf|preferred/i.test(p.category || "")) return false;
    if (/real.?estate/i.test(p.sector || "")) return false;
    if (FCF_PAYOUT_CARVEOUT.has(p.ticker)) return false;
    return true;
  });
  if (!eligible.length) return { agent: "earnings_trend", scanned: 0, alerts: 0 };

  const tickers = eligible.map(p => p.ticker);
  const finMap = await getFmpFinancials(env, tickers);

  const insights = [];
  let scanned = 0;
  let critical = 0;
  let warning = 0;

  for (const p of eligible) {
    const fin = finMap[p.ticker];
    if (!fin) continue;
    const trend = fin.trend || fin || {};
    const periods = trend.periods || [];
    if (periods.length < 8) continue;
    scanned++;

    const rev = trend.revenue || [];
    const opInc = trend.operatingIncome || [];
    const ni = trend.netIncome || [];

    if (rev.length < 8 || opInc.length < 8 || ni.length < 8) continue;

    // ── Pattern 1: 2+ consecutive YoY operating income misses ──
    // Compare each of last 4 quarters to its YoY counterpart (4 quarters earlier)
    let consecutiveMisses = 0;
    for (let i = 0; i < 4; i++) {
      const cur = opInc[i];
      const yoy = opInc[i + 4];
      if (cur != null && yoy != null && yoy > 0) {
        if (cur < yoy * 0.95) consecutiveMisses++;
        else break; // streak broken
      } else break;
    }

    // ── Pattern 2: Operating margin compression > 100 bps YoY ──
    const marginTtmNow = (() => {
      const r = _qs_sum(rev, 4); const o = _qs_sum(opInc, 4);
      return (r != null && o != null && r > 0) ? o / r : null;
    })();
    const marginTtmYoY = (() => {
      const r = _qs_sum(rev.slice(4), 4); const o = _qs_sum(opInc.slice(4), 4);
      return (r != null && o != null && r > 0) ? o / r : null;
    })();
    const marginCompressionBps = (marginTtmNow != null && marginTtmYoY != null)
      ? Math.round((marginTtmYoY - marginTtmNow) * 10000)
      : null;

    // ── Pattern 3: Revenue flat or down (TTM vs TTM YoY) ──
    const revTtmNow = _qs_sum(rev, 4);
    const revTtmYoY = _qs_sum(rev.slice(4), 4);
    const revGrowthYoY = (revTtmNow != null && revTtmYoY != null && revTtmYoY > 0)
      ? (revTtmNow - revTtmYoY) / revTtmYoY
      : null;

    let severity = null;
    let title = "";
    let reason = "";

    // Growth-investment carve-out: companies growing revenue > 8% YoY are very
    // likely deploying capex, not in structural decline. Don't flag them as critical
    // even if margins are compressing (they are by design).
    const isGrowthCo = revGrowthYoY != null && revGrowthYoY > 0.08;

    if (consecutiveMisses >= 3 && revGrowthYoY != null && revGrowthYoY < 0) {
      severity = "critical";
      title = `${p.ticker}: 3+ misses + revenue cayendo`;
      reason = `Operating income ha caído YoY en los últimos ${consecutiveMisses} trimestres y revenue TTM cae ${(revGrowthYoY*100).toFixed(0)}%. Patrón estructural.`;
    } else if (consecutiveMisses >= 2 && marginCompressionBps != null && marginCompressionBps > 250 && !isGrowthCo) {
      severity = "critical";
      title = `${p.ticker}: 2+ misses + grandes contracciones`;
      reason = `${consecutiveMisses}Q seguidos de earnings miss YoY, márgenes operativos contraídos ${marginCompressionBps}bps con revenue ${revGrowthYoY != null ? (revGrowthYoY*100).toFixed(0)+'%' : 'flat'}.`;
    } else if (consecutiveMisses >= 3 && !isGrowthCo) {
      severity = "warning";
      title = `${p.ticker}: 3 earnings misses seguidos`;
      reason = `Operating income cayendo YoY en ${consecutiveMisses} trimestres consecutivos. Vigilar próximos resultados.`;
    } else if (consecutiveMisses >= 2 && !isGrowthCo && marginCompressionBps != null && marginCompressionBps > 100) {
      severity = "warning";
      title = `${p.ticker}: 2 misses + margen contraído`;
      reason = `${consecutiveMisses} trimestres de miss YoY con margen contraído ${marginCompressionBps}bps.`;
    } else if (marginCompressionBps != null && marginCompressionBps > 300 && revGrowthYoY != null && revGrowthYoY < 0.02) {
      severity = "warning";
      title = `${p.ticker}: márgenes contraídos ${marginCompressionBps}bps`;
      reason = `Margen operativo TTM contraído ${marginCompressionBps}bps con revenue plano (${(revGrowthYoY*100).toFixed(1)}% YoY). Posible pérdida de pricing power.`;
    }

    if (!severity) continue;
    if (severity === "critical") critical++; else warning++;

    insights.push({
      ticker: p.ticker,
      severity,
      title,
      summary: `${p.name || p.ticker}. ${reason}`,
      details: {
        consecutiveMisses,
        marginTtmNow: marginTtmNow != null ? Math.round(marginTtmNow * 1000) / 10 : null,
        marginTtmYoY: marginTtmYoY != null ? Math.round(marginTtmYoY * 1000) / 10 : null,
        marginCompressionBps,
        revGrowthYoYPct: revGrowthYoY != null ? Math.round(revGrowthYoY * 100) : null,
        revTtmNowM: revTtmNow != null ? Math.round(revTtmNow / 1e6) : null,
      },
      score: severity === "critical" ? 9 : 6,
    });
  }

  // Cleanup stale rows from previous runs
  const flagged = new Set(insights.map(i => i.ticker));
  try {
    const { results: existing } = await env.DB.prepare(
      "SELECT ticker FROM agent_insights WHERE agent_name = 'earnings_trend' AND fecha = ?"
    ).bind(fecha).all();
    for (const row of (existing || [])) {
      if (!flagged.has(row.ticker)) {
        await env.DB.prepare(
          "DELETE FROM agent_insights WHERE agent_name = 'earnings_trend' AND fecha = ? AND ticker = ?"
        ).bind(fecha, row.ticker).run();
      }
    }
  } catch {}

  insights.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  const stored = await storeInsights(env, "earnings_trend", fecha, insights);
  return { agent: "earnings_trend", scanned, alerts: insights.length, critical, warning, stored };
}

// ─── Agent 11: Dividend Cut Early Warning (no LLM) ──────────────
// Detects dividend cut risk 4-8 weeks BEFORE the announcement by combining:
//   - FCF payout ratio rising trend (last 4 quarters)
//   - FCF declining trend
//   - Current FCF coverage approaching/below 1.0x
// Uses cached fmp_financials (no extra API calls).
async function runDividendCutWarningAgent(env, fecha) {
  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, last_price, div_ttm, sector, category FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "dividend_cut_warning", skipped: true };

  // Only analyze dividend payers. Skip:
  //  - ETFs / preferreds (no income statement to analyze)
  //  - REITs / MLPs (distribute from FFO/AFFO not FCF; FCF coverage is misleading
  //    because capex includes growth investments. Q+S score handles these via FFO patch.)
  const SKIP_SECTORS = /real.?estate/i;
  const SKIP_CATEGORIES = /etf|preferred/i;
  const payers = positions.filter(p => {
    if ((p.div_ttm || 0) <= 0) return false;
    if (p.sector && SKIP_SECTORS.test(p.sector)) return false;
    if (p.category && SKIP_CATEGORIES.test(p.category)) return false;
    if (FCF_PAYOUT_CARVEOUT.has(p.ticker)) return false; // asset managers, BDCs, MLPs
    return true;
  });
  if (!payers.length) return { agent: "dividend_cut_warning", scanned: 0, alerts: 0 };

  const insights = [];
  let scanned = 0;
  let critical = 0;
  let warning = 0;
  let skippedReits = positions.filter(p => p.sector && SKIP_SECTORS.test(p.sector) && (p.div_ttm || 0) > 0).length;

  // Pre-fetch financials for all payers (uses cache, no API spam)
  const tickers = payers.map(p => p.ticker);
  const finMap = await getFmpFinancials(env, tickers);

  // Helper: sum a window [start, start+len) treating null as 0, signing dividends positive
  const sumWindow = (arr, start, len, abs = false) => {
    if (!Array.isArray(arr)) return null;
    let total = 0;
    let count = 0;
    for (let i = start; i < start + len && i < arr.length; i++) {
      if (arr[i] == null) continue;
      total += abs ? Math.abs(arr[i]) : arr[i];
      count++;
    }
    return count >= len ? total : null; // require full window
  };

  for (const p of payers) {
    const fin = finMap[p.ticker];
    if (!fin) continue;
    const trend = fin.trend || fin || {};
    const periods = trend.periods || [];
    // Need at least 8 quarters to compute 4 rolling TTM windows reliably (TTM-now vs TTM-1y-ago)
    if (periods.length < 8) continue;
    scanned++;

    // Build rolling TTM windows for FCF and dividendsPaid.
    // Windows: TTM (Q0-Q3), TTM-1Q (Q1-Q4), TTM-2Q (Q2-Q5), TTM-3Q (Q3-Q6), TTM-4Q (Q4-Q7).
    // This smooths out quarterly seasonality (HRB tax season, retailers, etc.) which
    // single-quarter ratios cannot.
    const fcfWindows = [];
    const divWindows = [];
    for (let w = 0; w < 5; w++) {
      const fcfSum = sumWindow(trend.fcf, w, 4, false);
      const divSum = sumWindow(trend.dividendsPaid, w, 4, true);
      fcfWindows.push(fcfSum);
      divWindows.push(divSum);
    }

    // Need at least 2 valid windows (TTM-now and TTM-1y-ago)
    const ttmNowFcf = fcfWindows[0];
    const ttmNowDiv = divWindows[0];
    const ttmOldFcf = fcfWindows[4]; // 4 quarters back = 1 year ago
    const ttmOldDiv = divWindows[4];
    if (ttmNowFcf == null || ttmNowDiv == null || ttmNowDiv === 0) continue;
    if (ttmOldFcf == null || ttmOldDiv == null || ttmOldDiv === 0) continue;

    // FCF coverage = FCF / Div. Negative if FCF is negative (burning cash).
    const covNow = ttmNowFcf / ttmNowDiv;
    const covOld = ttmOldFcf / ttmOldDiv;

    // Payout ratio = Div / FCF. Only meaningful when FCF > 0.
    const payoutNow = ttmNowFcf > 0 ? ttmNowDiv / ttmNowFcf : null;
    const payoutOld = ttmOldFcf > 0 ? ttmOldDiv / ttmOldFcf : null;

    // FCF growth (TTM YoY)
    const fcfGrowth = ttmOldFcf > 0 ? (ttmNowFcf - ttmOldFcf) / ttmOldFcf : null;

    // Track all 5 window payout ratios for the trend visual
    const payoutSeries = fcfWindows.map((f, idx) => {
      const d = divWindows[idx];
      if (f == null || d == null || d === 0 || f <= 0) return null;
      return Math.round((d / f) * 100) / 100;
    });

    // ── Severity logic (TTM-based, conservative) ──
    // CRITICAL: TTM coverage < 0.85 (truly burning cash to pay div)
    //        OR  payout > 95% AND payout has been rising YoY AND FCF declining YoY
    // WARNING:  payout > 80% AND rising AND FCF declining
    //        OR  FCF down >25% YoY with payout > 60%
    //        OR  payout > 100% (any cause)
    let severity = null;
    let reason = "";

    if (covNow < 0.85) {
      severity = "critical";
      reason = `Cobertura FCF/Div TTM = ${covNow.toFixed(2)}x. La empresa no genera caja suficiente para sostener el dividendo.`;
    } else if (payoutNow != null && payoutNow > 0.95 && payoutOld != null && payoutNow > payoutOld && fcfGrowth != null && fcfGrowth < 0) {
      severity = "critical";
      reason = `Payout FCF subiendo a ${(payoutNow*100).toFixed(0)}% (vs ${(payoutOld*100).toFixed(0)}% hace 1 año) mientras FCF cae ${Math.round(-fcfGrowth*100)}% YoY. Recorte probable.`;
    } else if (payoutNow != null && payoutNow > 1.00) {
      severity = "warning";
      reason = `Payout FCF TTM ${(payoutNow*100).toFixed(0)}% — sobre 100%. Insostenible si no mejora pronto.`;
    } else if (payoutNow != null && payoutOld != null && payoutNow > 0.80 && payoutNow > payoutOld && fcfGrowth != null && fcfGrowth < 0) {
      severity = "warning";
      reason = `Payout FCF subiendo a ${(payoutNow*100).toFixed(0)}% (era ${(payoutOld*100).toFixed(0)}%) y FCF cayendo ${Math.round(-fcfGrowth*100)}% YoY. Vigilar.`;
    } else if (fcfGrowth != null && fcfGrowth < -0.25 && payoutNow != null && payoutNow > 0.60) {
      severity = "warning";
      reason = `FCF TTM cayendo ${Math.round(-fcfGrowth*100)}% YoY con payout ${(payoutNow*100).toFixed(0)}%. Margen de seguridad reduciéndose.`;
    }

    if (!severity) continue;

    if (severity === "critical") critical++; else warning++;

    insights.push({
      ticker: p.ticker,
      severity,
      title: `${p.ticker}: ${severity === "critical" ? "RIESGO RECORTE" : "Vigilar dividendo"}`,
      summary: `${p.name || p.ticker}. ${reason}`,
      details: {
        ttmCoverageNow: Math.round(covNow * 100) / 100,
        ttmCoverageYoY: Math.round(covOld * 100) / 100,
        fcfPayoutNow: payoutNow != null ? Math.round(payoutNow * 100) : null,
        fcfPayoutYoY: payoutOld != null ? Math.round(payoutOld * 100) : null,
        fcfGrowthYoY: fcfGrowth != null ? Math.round(fcfGrowth * 100) : null,
        ttmFcfNow: Math.round((ttmNowFcf || 0) / 1e6),
        ttmDivNow: Math.round((ttmNowDiv || 0) / 1e6),
        payoutSeriesRollingTTM: payoutSeries, // 5 windows: now, -1Q, -2Q, -3Q, -4Q
      },
      score: severity === "critical" ? 9 : 6,
    });
  }

  // Sort: critical first, then by score
  insights.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  // Clear stale rows from previous runs (where this run no longer flags them)
  // so the API doesn't return outdated alerts.
  const flaggedTickers = new Set(insights.map(i => i.ticker));
  try {
    const { results: existing } = await env.DB.prepare(
      "SELECT ticker FROM agent_insights WHERE agent_name = 'dividend_cut_warning' AND fecha = ?"
    ).bind(fecha).all();
    for (const row of (existing || [])) {
      if (!flaggedTickers.has(row.ticker)) {
        await env.DB.prepare(
          "DELETE FROM agent_insights WHERE agent_name = 'dividend_cut_warning' AND fecha = ? AND ticker = ?"
        ).bind(fecha, row.ticker).run();
      }
    }
  } catch (e) { /* non-fatal */ }

  const stored = await storeInsights(env, "dividend_cut_warning", fecha, insights);
  return { agent: "dividend_cut_warning", scanned, alerts: insights.length, critical, warning, stored, reitsSkipped: skippedReits };
}

// ─── Agent 12: Analyst Downgrade Tracker (no LLM, FMP-based) ────
// Detects clusters of analyst rating downgrades that often precede
// dividend cuts by 4-8 weeks. Uses FMP /stable/grades-historical.
async function runAnalystDowngradeAgent(env, fecha) {
  const key = env.FMP_KEY;
  if (!key) return { agent: "analyst_downgrade", skipped: true, reason: "no FMP key" };

  const { results: positions } = await env.DB.prepare(
    "SELECT ticker, name, last_price FROM positions WHERE shares > 0"
  ).all();
  if (!positions.length) return { agent: "analyst_downgrade", skipped: true };

  // 14-day window was too short — most FMP grades-historical rows are stable
  // for weeks, so old == latest → drop = 0 → zero insights. Widened to 30 days
  // which matches the typical quarterly analyst revision cadence. (2026-04-18)
  const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  // Load previous snapshot from agent_memory
  const prevMem = (await getAgentMemory(env, "analyst_grades")) || {};

  const insights = [];
  let scanned = 0;
  let withDowngrades = 0;
  let fmpErrors = 0;
  const newMem = {};

  // Process in batches of 5 to respect rate limits
  for (let i = 0; i < positions.length; i += 5) {
    const batch = positions.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const sym = toFMP(p.ticker);
        try {
          const url = `https://financialmodelingprep.com/stable/grades-historical?symbol=${encodeURIComponent(sym)}&apikey=${key}`;
          const resp = await fetch(url);
          if (!resp.ok) return null;
          const data = await resp.json();
          if (!Array.isArray(data) || !data.length) return null;
          // Each row: { symbol, date, analystRatingsBuy, analystRatingsHold, analystRatingsSell, analystRatingsStrongBuy, analystRatingsStrongSell }
          // Sort by date desc
          const sorted = data.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          const latest = sorted[0];
          if (!latest) return null;

          // Find a row from ~30 days ago for comparison.
          const old = sorted.find(r => (r.date || '') <= cutoff30) || sorted[Math.min(2, sorted.length - 1)];
          if (!old) return null;

          // Score = strongBuy*2 + buy - sell - strongSell*2 (positive = bullish)
          const sentScore = (r) => {
            if (!r) return 0;
            return (Number(r.analystRatingsStrongBuy) || 0) * 2
                 + (Number(r.analystRatingsBuy) || 0)
                 - (Number(r.analystRatingsSell) || 0)
                 - (Number(r.analystRatingsStrongSell) || 0) * 2;
          };
          const totalAnalysts = (r) => (
            (Number(r.analystRatingsStrongBuy) || 0)
          + (Number(r.analystRatingsBuy) || 0)
          + (Number(r.analystRatingsHold) || 0)
          + (Number(r.analystRatingsSell) || 0)
          + (Number(r.analystRatingsStrongSell) || 0)
          );
          const sNow = sentScore(latest);
          const sOld = sentScore(old);
          const totNow = totalAnalysts(latest);
          const drop = sOld - sNow; // positive = sentiment deterioration

          return {
            ticker: p.ticker,
            name: p.name,
            latestDate: latest.date,
            sNow,
            sOld,
            drop,
            totNow,
            buy: Number(latest.analystRatingsBuy) || 0,
            strongBuy: Number(latest.analystRatingsStrongBuy) || 0,
            hold: Number(latest.analystRatingsHold) || 0,
            sell: Number(latest.analystRatingsSell) || 0,
            strongSell: Number(latest.analystRatingsStrongSell) || 0,
          };
        } catch (e) {
          fmpErrors++;
          console.error(`[analyst_downgrade] FMP fetch failed for ${sym}:`, e.message);
          return null;
        }
      })
    );

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const v = r.value;
      scanned++;
      newMem[v.ticker] = { sentScore: v.sNow, date: v.latestDate, total: v.totNow };

      // Severity logic (loosened 2026-04-08 per audit — critical threshold
      // was too strict for blue-chip dividend payers, rarely firing):
      //  - critical: drop >= 3 AND >= 5 analysts (was 4/6)
      //  - warning:  drop >= 2 with >= 4 analysts (unchanged)
      //              OR drop >= 1 with >= 12 analysts (loosened from 15)
      //  - info:     no actionable change
      let severity = null;
      let reason = "";
      if (v.drop >= 3 && v.totNow >= 5) {
        severity = "critical";
        reason = `Sentimiento analistas cayó ${v.drop} pts en ~14 días (${v.totNow} cubriendo). Cluster de downgrades — históricamente precede recortes de dividendo en 4-8 semanas.`;
      } else if (v.drop >= 2 && v.totNow >= 4) {
        severity = "warning";
        reason = `Sentimiento analistas bajando: ${v.sOld} → ${v.sNow} (${v.drop} pts). Vigilar próximas guidance.`;
      } else if (v.drop >= 1 && v.totNow >= 12) {
        severity = "warning";
        reason = `Pequeña deriva negativa pero alta cobertura (${v.totNow} analistas). Watchlist.`;
      }

      if (!severity) continue;
      withDowngrades++;

      insights.push({
        ticker: v.ticker,
        severity,
        title: `${v.ticker}: ${severity === "critical" ? "Cluster downgrades" : "Sentiment downgrade"}`,
        summary: `${v.name || v.ticker}. ${reason}`,
        details: {
          sentimentNow: v.sNow,
          sentimentPrev: v.sOld,
          deltaPts: v.drop,
          analystsCovering: v.totNow,
          breakdown: {
            strongBuy: v.strongBuy,
            buy: v.buy,
            hold: v.hold,
            sell: v.sell,
            strongSell: v.strongSell,
          },
          asOf: v.latestDate,
        },
        score: severity === "critical" ? 9 : 5,
      });
    }

    // Throttle between batches
    if (i + 5 < positions.length) await new Promise(r => setTimeout(r, 1200));
  }

  // Persist new snapshot for next-run comparison (overwrite — we use FMP historical, not delta tracking here)
  await setAgentMemory(env, "analyst_grades", newMem);

  insights.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  // Always emit a _STATUS_ marker so the UI / audit can see the agent ran.
  // Otherwise an empty-insight day looks identical to "agent died" in the API.
  if (insights.length === 0) {
    insights.push({
      ticker: "_STATUS_",
      severity: "info",
      title: "Analyst grades estables",
      summary: `Escaneados ${scanned}/${positions.length} tickers. Sin deltas de sentimiento que disparen alertas (ventana 30d). ${fmpErrors ? `FMP errors: ${fmpErrors}.` : ''}`,
      details: { scanned, total: positions.length, fmpErrors, window: "30d" },
      score: 0,
    });
  }

  const stored = await storeInsights(env, "analyst_downgrade", fecha, insights);
  return { agent: "analyst_downgrade", scanned, alerts: insights.length, withDowngrades, fmpErrors, stored };
}

// ─── Agent Orchestrator ────────────────────────────────────────
async function runAllAgents(env) {
  const fecha = new Date().toISOString().slice(0, 10);
  console.log(`[Agents] Starting all agents for ${fecha}`);
  const results = {};

  // Step 0a: Cache market indicators (no LLM, just Yahoo Finance)
  try {
    const mktData = await cacheMarketIndicators(env);
    results.marketCache = { tickers: Object.keys(mktData).length };
    console.log(`[Agents] Market indicators cached: ${Object.keys(mktData).length} tickers`);
  } catch (e) {
    results.marketCache = { error: e.message };
    console.error(`[Agents] Market cache failed:`, e.message);
  }

  // Step 0b: Cache GuruFocus scalars (still needed for financialStrength, gfValue, gfScore, etc.)
  // Trends portion is now superseded by FMP financials in step 0d, but the scalar fields
  // (GF Value, RSI, dividend streak, financial strength) have no FMP equivalent yet.
  try {
    const gfResult = await cacheGuruFocusData(env);
    results.gfCache = gfResult;
    console.log(`[Agents] GuruFocus cached: ${gfResult.cached} tickers`);
  } catch (e) {
    results.gfCache = { error: e.message };
    console.error(`[Agents] GuruFocus cache failed:`, e.message);
  }

  // Step 0c: Enrich missing sectors from GF + FMP profile fallback
  try {
    const sectorResult = await enrichPositionSectors(env);
    if (sectorResult.updated > 0) console.log(`[Agents] Sectors enriched: ${sectorResult.updated} updated`);
  } catch (e) {
    console.error(`[Agents] Sector enrichment failed:`, e.message);
  }

  // Step 0d: Cache FMP quarterly financials (replaces gf.trend for Dividend agent).
  // Chunked into 5 calls of 20 tickers each to fit within Workers 30s CPU budget per call.
  try {
    let totalCached = 0, totalFailed = 0;
    for (let off = 0; off < 100; off += 20) {
      const r = await cacheFmpFinancials(env, { offset: off, limit: 20 });
      totalCached += r.cached;
      totalFailed += r.failed;
      if (r.total < 20) break; // last chunk
    }
    results.fmpFinCache = { cached: totalCached, failed: totalFailed };
    console.log(`[Agents] FMP financials cached: ${totalCached} tickers`);
  } catch (e) {
    results.fmpFinCache = { error: e.message };
    console.error(`[Agents] FMP financials cache failed:`, e.message);
  }

  // Step 0e: Cache FMP-derived risk metrics (beta, vol, sharpe, sortino, maxDD).
  // Used by Risk Agent. Same chunking strategy.
  try {
    let totalCached = 0, totalFailed = 0;
    for (let off = 0; off < 100; off += 20) {
      const r = await cacheRiskMetrics(env, { offset: off, limit: 20 });
      totalCached += r.cached;
      totalFailed += r.failed;
      if (r.total < 20) break;
    }
    results.riskMetricsCache = { cached: totalCached, failed: totalFailed };
    console.log(`[Agents] Risk metrics cached: ${totalCached} tickers`);
  } catch (e) {
    results.riskMetricsCache = { error: e.message };
    console.error(`[Agents] Risk metrics cache failed:`, e.message);
  }

  // Step 0f: Refresh earnings transcripts (for Earnings Opus agent).
  // Skipped here — runs on-demand via POST /api/download-transcripts to avoid 30s timeouts.
  // The Earnings agent reads whatever is cached. Manual refresh weekly is sufficient.

  // Pipeline order REORDERED 2026-04-08 per Audit A finding #2:
  // The 3 quantitative "is dividend at risk?" / "earnings deteriorating?"
  // agents (dividend_cut_warning, analyst_downgrade, earnings_trend) now
  // run BEFORE their LLM siblings so the LLM agents can ingest their
  // ground-truth signals and produce one coherent verdict per ticker
  // instead of 4 separate cards answering the same question.
  //
  // Order:
  //  1. regime (Haiku) — sets context for all
  //  2. no-LLM data feeders (parallel-safe, all use cached FMP data)
  //  3. earnings (Opus) — now reads earnings_trend signals
  //  4. dividend (Opus) — now reads cut_warning + analyst_downgrade signals
  //  5. risk + macro (Haiku post-2026-04-08)
  //  6. trade (Opus) — synthesizes everything
  //  7. postmortem — last (no signals to evaluate until tomorrow)
  const agents = [
    ['regime', runRegimeAgent],       // Step 1: Haiku — sets regime context
    // ── no-LLM ground-truth feeders (run first so LLM agents can read them) ──
    ['insider', runInsiderAgent],                         // FMP insider transactions
    ['dividend_cut_warning', runDividendCutWarningAgent], // FCF payout trend (Tier 1)
    ['analyst_downgrade', runAnalystDowngradeAgent],      // FMP grades-historical (Tier 1)
    ['earnings_trend', runEarningsTrendAgent],            // op-income/margin pattern (Tier 3)
    ['value', runValueSignalsAgent],                      // GuruFocus value signals
    ['options', runOptionsIncomeAgent],                   // Yahoo options chain
    ['sec_filings', runSECFilingsAgent],                  // SEC EDGAR 8-K tracker
    // ── LLM agents (consume the no-LLM signals above) ──
    ['earnings', runEarningsAgent],   // Opus + transcripts + earnings_trend signals
    ['dividend', runDividendAgent],   // Opus + Q+S + cut_warning + downgrade signals
    ['risk', runRiskAgent],           // Haiku + FMP-derived risk metrics
    ['macro', runMacroAgent],         // Haiku + market data + economic calendar
    ['trade', runTradeAgent],         // Opus single-call synthesis
    ['postmortem', runPostmortemAgent], // No LLM — runs last, evaluates yesterday's signals
  ];

  // Opus-only agents that need spacing to avoid TPM burst. Others are Haiku/no-LLM.
  const OPUS_AGENTS = new Set(['dividend', 'earnings', 'trade']);
  // Track last Opus finish timestamp — only space between OPUS calls, not every agent.
  let lastOpusFinish = 0;
  for (let i = 0; i < agents.length; i++) {
    const [name, fn] = agents[i];
    // Space consecutive Opus calls by 3s (rate-limit-friendly) but do not throttle
    // Haiku/no-LLM agents — they caused the 30s-wall-time kill on Workers.
    // Total pipeline now fits in ~100s instead of ~400s. (2026-04-18 fix)
    if (OPUS_AGENTS.has(name) && lastOpusFinish > 0) {
      const sinceLast = Date.now() - lastOpusFinish;
      if (sinceLast < 3000) await new Promise(r => setTimeout(r, 3000 - sinceLast));
    }
    try {
      results[name] = await fn(env, fecha);
      console.log(`[Agents] ${name} done:`, JSON.stringify(results[name]));
      // Track successful run — so the health endpoint can show "ran OK even with 0 signals"
      // (e.g. analyst_downgrade returns 0 alerts when no recent downgrades).
      try {
        await setAgentMemory(env, `agent_last_run_${name}`, {
          fecha, ran_at: new Date().toISOString(), result: results[name],
        });
      } catch {}
    } catch (e) {
      results[name] = { error: e.message };
      console.error(`[Agents] ${name} failed:`, e.message);
    }
    if (OPUS_AGENTS.has(name)) lastOpusFinish = Date.now();
  }

  // Build executive summary + push notification
  try {
    const { results: allToday } = await env.DB.prepare(
      "SELECT agent_name, ticker, severity, title, summary, score, details FROM agent_insights WHERE fecha = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, score DESC"
    ).bind(fecha).all();

    // Executive summary: top actions to take
    const trades = allToday.filter(i => i.agent_name === 'trade' && i.severity !== 'info');
    const options = allToday.filter(i => i.agent_name === 'options' && i.score > 3);
    const insiderAlerts = allToday.filter(i => i.agent_name === 'insider' && i.severity !== 'info');
    const regime = allToday.find(i => i.agent_name === 'regime');
    const criticals = allToday.filter(i => i.severity === 'critical');

    // Store executive summary
    const execLines = [];
    if (regime) {
      const rd = regime.details ? JSON.parse(regime.details) : {};
      execLines.push(`Mercado: ${rd.regime || '?'} (${rd.actionGuidance || '?'})`);
    }
    if (trades.length) execLines.push(`Operaciones: ${trades.map(t => `${t.title}`).slice(0, 3).join(', ')}`);
    if (options.length) execLines.push(`Opciones: ${options.map(o => o.title).slice(0, 2).join(', ')}`);
    if (insiderAlerts.length) execLines.push(`Insiders: ${insiderAlerts.length} alertas (${insiderAlerts.filter(i=>i.severity==='critical').length} criticas)`);

    await storeInsights(env, "summary", fecha, [{
      ticker: '_SUMMARY_',
      severity: criticals.length > 5 ? 'critical' : criticals.length > 0 ? 'warning' : 'info',
      title: `Resumen: ${criticals.length} criticos, ${allToday.filter(i=>i.severity==='warning').length} warnings`,
      summary: execLines.join(' | ') || 'Sin alertas relevantes hoy.',
      details: {
        totalInsights: allToday.length,
        criticals: criticals.length,
        warnings: allToday.filter(i => i.severity === 'warning').length,
        topActions: trades.slice(0, 5).map(t => t.title),
        topOptions: options.slice(0, 3).map(o => o.title),
        insiderAlerts: insiderAlerts.length,
        regime: regime?.title || 'N/A',
      },
      score: criticals.length > 5 ? 2 : criticals.length > 0 ? 5 : 8,
    }]);

    // Push notification with actionable summary
    if (criticals.length > 0) {
      const { results: subs } = await env.DB.prepare("SELECT * FROM push_subscriptions LIMIT 100").all();
      if (subs.length > 0) {
        // Priority: trade actions > insider alerts > options > rest
        const actionItems = [
          ...trades.filter(t => t.severity === 'critical').slice(0, 2).map(t => t.title),
          ...insiderAlerts.filter(i => i.severity === 'critical').slice(0, 1).map(i => `Insider: ${i.title}`),
          ...options.filter(o => o.severity === 'critical').slice(0, 1).map(o => o.title),
        ].slice(0, 3);

        const regimeText = regime ? `${JSON.parse(regime.details || '{}').regime || '?'}` : '';
        const body = actionItems.length
          ? actionItems.join('\n') + (criticals.length > 3 ? `\n+${criticals.length - actionItems.length} mas` : '')
          : criticals.slice(0, 3).map(c => `${c.ticker && !c.ticker.startsWith('_') ? `[${c.ticker}] ` : ''}${c.title}`).join('\n');

        const payload = JSON.stringify({
          title: `A&R: ${criticals.length} alertas${regimeText ? ` | ${regimeText}` : ''}`,
          body,
          url: "/?tab=agentes",
          tag: "ayr-agents-daily",
        });

        let sent = 0;
        for (const sub of subs) {
          try {
            const res = await sendWebPush(env, sub, payload);
            if (res.ok) sent++;
            else if (res.status === 410 || res.status === 404) {
              await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
            }
          } catch (_) {}
        }
        console.log(`[Agents] Push: ${sent} sent, ${criticals.length} critical, ${trades.length} trades, ${options.length} options`);
      }
    }
  } catch (e) {
    console.error("[Agents] Summary/push failed:", e.message);
  }

  console.log(`[Agents] All completed`);
  return results;
}

  return {
    runRegimeAgent, runEarningsAgent, runDividendAgent, runMacroAgent, runRiskAgent,
    runTradeAgent, runPostmortemAgent, runInsiderAgent, runValueSignalsAgent,
    runOptionsIncomeAgent, runSECFilingsAgent, runEarningsTrendAgent,
    runDividendCutWarningAgent, runAnalystDowngradeAgent, runAllAgents,
  };
}
