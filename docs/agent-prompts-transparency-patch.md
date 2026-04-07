# Agent Prompts Transparency — MVP Patch

Adds a `GET /api/agents/prompts` endpoint and a "Prompt / I-O / Insights" drawer
to the existing Agentes tab. Lets the user see the EXACT system prompt, input
shape, output shape, model and trigger metadata for each AI agent.

## Design choice — Option A (hardcoded metadata table)

The agent system prompts in `api/src/worker.js` are large template literals
spread across ~2,500 lines. Extracting them dynamically would require
refactoring 11 functions. For this MVP we duplicate the prompts in a metadata
constant `AGENTS_METADATA` declared at the top of the new endpoint block.

Cost of duplication: when an LLM agent prompt is edited in `runXxxAgent`, the
metadata copy needs the same edit. Acceptable for MVP since prompts churn
rarely. The "Future v2" section at the end shows how to refactor to single-
source-of-truth.

---

## Part 1 — Backend endpoint (paste into `api/src/worker.js`)

### 1.1 Where to paste

Inside the main router (the big `if/else` chain that handles routes), in the
`DESIGN BACKLOG MVPs` block (around line 5352, just before the
`EARNINGS INTELLIGENCE MVP` comment). Any position inside the router works as
long as it's a route handler.

### 1.2 Code

```javascript
// ─── AGENTS PROMPTS TRANSPARENCY MVP ────────────────────────────
// GET /api/agents/prompts → returns the exact system prompt, input shape,
// output shape, model, cost and trigger metadata for every agent. Used by
// the Agentes tab "Prompt" drawer so the user can audit/improve prompts.
//
// IMPORTANT: when you edit a runXxxAgent prompt, also edit the matching
// `system_prompt` field in AGENTS_METADATA below. (See the "Future v2"
// section in docs/agent-prompts-transparency-patch.md for the long-term
// refactor that removes this duplication.)
if (url.pathname === "/api/agents/prompts" && request.method === "GET") {
  const AGENTS_METADATA = [
    // ─────────────────────────────────────────────────────────────
    // 1. REGIME (Pulso del Mercado) — Haiku
    // Source: runRegimeAgent, worker.js line 9701
    // ─────────────────────────────────────────────────────────────
    {
      id: "regime",
      name: "Pulso del Mercado",
      icon: "🧭",
      type: "llm",
      model: "claude-haiku-4-5-20251001",
      description: "Determina si el mercado está en bull/bear/transition analizando 24 ETFs (sectores, factores, crédito, commodities).",
      system_prompt: `You are a market regime analyst. Determine the current market state.
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
Score 1=crisis, 10=strong bull.`,
      input_shape: {
        spy: "{ price, changePct, change5d }",
        vix: "{ price, changePct }",
        sectors: "[{ ticker, changePct, change5d }] for XLK/XLF/XLE/XLV/XLU/XLP/XLI/XLRE",
        factors: "[{ ticker, changePct, change5d, vsSpyPct }] for QUAL/MTUM/VLUE",
        credit: "{ HYG, LQD, TLT, SHY }",
        commodities: "{ GLD, USO, DBC }",
        dollar: "UUP indicator",
        fecha: "YYYY-MM-DD",
      },
      output_shape: {
        severity: "info | warning | critical",
        title: "string (short)",
        summary: "string (3-4 sentences)",
        details: {
          regime: "bull | bear | transition-down | transition-up",
          regimeConfidence: "1-10",
          breadthSignal: "healthy | deteriorating | collapsed | recovering",
          creditStress: "none | mild | elevated | severe",
          factorSignal: "rational-rotation | indiscriminate-selling | risk-on | mixed",
          safeHavens: "working | failing | mixed",
          actionGuidance: "full-risk | reduce-risk | defensive | cash-priority",
          sectorLeaders: "string[]",
          sectorLaggards: "string[]",
          vixRegime: "low | normal | elevated | crisis",
        },
        score: "1-10",
      },
      cost_per_run_estimate_usd: 0.01,
      trigger: "Manual (botón Ejecutar) o pipeline completo desde el tab Agentes",
      when_it_fires: "Step 1 del pipeline. Su salida se persiste en agent_memory.regime_current y la consumen los agentes Macro, Risk y Trade.",
    },

    // ─────────────────────────────────────────────────────────────
    // 2. EARNINGS (Vigilante de Earnings) — Opus
    // Source: runEarningsAgent, worker.js line 9762
    // ─────────────────────────────────────────────────────────────
    {
      id: "earnings",
      name: "Vigilante de Earnings",
      icon: "📊",
      type: "llm",
      model: "claude-opus-4-20250514",
      description: "Combina earnings (EPS/revenue surprise) con transcripts de earnings calls. Distingue caídas temporales (one-time charges, restructuring) de declive estructural.",
      system_prompt: `You are a senior earnings analyst for a LONG-TERM dividend income portfolio ($1.35M, buy-and-hold).
The owner holds positions for years/decades. Temporary earnings dips are NORMAL in business cycles.
NEVER recommend selling quality on temporary dips — this is a buy-and-hold dividend portfolio.

YOU NOW HAVE EARNINGS CALL TRANSCRIPTS. Use them as the PRIMARY source for tone and context:
- The numerical surprise (EPS/revenue beat or miss) tells you WHAT happened.
- The transcript tells you WHY it happened and what management plans to do.
- Combine both: a -8% EPS miss with management explaining a one-time legal charge AND reaffirming guidance is INFO, not WARNING.
- A +2% EPS beat with management warning about deteriorating demand for next quarter is WARNING despite the beat.
- When citing the transcript, quote a SHORT phrase (under 15 words) from management in transcript_insight.
- If no transcript provided for a ticker, set transcript_insight to "No transcript" and rely on numerical data only.

YOU NOW HAVE 6-QUARTER TREND DATA (revenue, netIncome, operatingIncome, grossProfit, fcf, ocf, eps).
- ALWAYS check the trend before flagging a quarter as critical:
  * A -8% EPS miss in isolation looks bad. If the prior 5 quarters were +12%, +8%, +5%, +9%, +6%, this is a single-quarter blip → WARNING at most.
  * A -3% miss following -2%, -5%, -7% misses is a real deteriorating trend → WARNING or CRITICAL.
- Margin trend: compute (operatingIncome / revenue) for each of the last 6 quarters. Flag CRITICAL only if margins compressed AND revenue is also declining.
- If trends are improving but the latest quarter is one-off bad, the answer is INFO with explanation, not warning.
- Trends array is most-recent-first: trends.revenue[0] is the LATEST quarter.

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
Include entries for tickers with notable findings (beat/miss, guidance change, or important transcript signal). Skip uneventful quarters. Score: 1=structural decline, 5=normal mixed, 10=strong beat with bullish guidance.`,
      input_shape: {
        positions: "Array de hasta 12 tickers por batch con: { ticker, name, sector, earnings (last 2), estimates, revSegments, geoSegments, analystGrades (3), gfGrowthRank, gfMomentumRank, gfProfitabilityRank, trends: { periods, revenue, netIncome, operatingIncome, grossProfit, fcf, ocf, eps } (last 6 quarters), transcript: { period, date, excerpt (first 3000 chars) } }",
      },
      output_shape: {
        result: "Array of insights",
        item: {
          ticker: "string",
          severity: "info | warning | critical",
          title: "string",
          summary: "string (2-3 sentences)",
          details: {
            epsSurprise: "number",
            revenueSurprise: "number",
            marginTrend: "stable | improving | deteriorating",
            context: "one-time | cyclical | structural | growth-investment",
            transcript_insight: "string with optional short quote",
            keyRisks: "string[]",
          },
          score: "1-10",
        },
      },
      cost_per_run_estimate_usd: 0.40,
      trigger: "Manual (botón Ejecutar) o pipeline completo",
      when_it_fires: "Step 2. Procesa todas las posiciones (~85) en batches de 12 con 5s de pausa entre batches.",
    },

    // ─────────────────────────────────────────────────────────────
    // 3. DIVIDEND (Guardian de Dividendos) — Opus
    // Source: runDividendAgent, worker.js line 9939
    // ─────────────────────────────────────────────────────────────
    {
      id: "dividend",
      name: "Guardian de Dividendos",
      icon: "🛡️",
      type: "llm",
      model: "claude-opus-4-20250514",
      description: "Evalúa la seguridad del dividendo de cada posición usando TTM authoritative (Q+S inputs_json), trends de 8 quarters y pagos reales IB. Reconoce que cortar para pagar deuda = bullish.",
      system_prompt: `You are a senior dividend analyst for a LONG-TERM income portfolio ($1.35M, China fiscal resident, 10% WHT).
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

SEVERITY (be conservative — only "critical" for REAL danger):
- critical = company is genuinely at risk of bankruptcy or permanent dividend elimination. Max 2-3 across entire portfolio.
- warning = dividend freeze likely, or payout unsustainable WITHOUT a clear strategic reason
- info = safe, growing, or strategically sound even if ratios look stressed

For EACH ticker: one-line verdict with context. Explain WHY, not just numbers.

Respond ONLY JSON array:
[{"ticker":"XX","severity":"info|warning|critical","title":"2-4 word verdict","summary":"1-2 sentences explaining the CONTEXT behind the numbers","details":{"payoutRatio":null,"fcfCoverage":null,"gfFinancialStrength":null,"cutRisk":"low|medium|high","context":"strategic|stressed|stable|growing"},"score":1-10}]
Include ALL tickers. Score: 1=bankruptcy risk, 5=needs monitoring, 8=solid, 10=fortress.`,
      input_shape: {
        positions: "Batches de 15. Cada posición trae: { ticker, name, sector, category (REIT/BDC/ETF/PREFERRED/COMPANY), divTTM, yield, yoc, dividendsPaidTTM, fcfTTM, netIncomeTTM, fcfCoverageTTM, payoutRatioEarnings, payoutRatioFCF, payoutRatioWorst, fcfAfterMaintCoverage, debtToEbitda, currentRatio, dividendStreakYears, qualityScore, safetyScore, dividendHistory (4), realPayments (3 from D1.dividendos), gfFinancialStrength, gfShareholderYield, gfBuybackYield, gfDividendStreakSince, trendRevenue (6q), trendFCF (6q), trendDebt (4q), trendDivPaid (4q) }",
      },
      output_shape: {
        result: "Array of insights",
        item: {
          ticker: "string",
          severity: "info | warning | critical",
          title: "string (2-4 words)",
          summary: "string (1-2 sentences, must explain WHY)",
          details: {
            payoutRatio: "number | null",
            fcfCoverage: "number | null",
            gfFinancialStrength: "number | null",
            cutRisk: "low | medium | high",
            context: "strategic | stressed | stable | growing",
          },
          score: "1-10",
        },
      },
      cost_per_run_estimate_usd: 0.50,
      trigger: "Manual o pipeline completo",
      when_it_fires: "Step 3. Procesa ~75 posiciones con dividendo en batches de 15.",
    },

    // ─────────────────────────────────────────────────────────────
    // 4. MACRO (Radar Macro) — Opus
    // Source: runMacroAgent, worker.js line 10139
    // ─────────────────────────────────────────────────────────────
    {
      id: "macro",
      name: "Radar Macro",
      icon: "🌍",
      type: "llm",
      model: "claude-opus-4-20250514",
      description: "Síntesis macro narrativa (no lista de bullets). Analiza calendario económico, treasury rates, credit, factores y sectores.",
      system_prompt: `You are a macro strategist analyzing a $1.35M dividend income portfolio (88 stocks, China fiscal resident, 10% WHT US-China treaty).

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
"score":1-10}`,
      input_shape: {
        currentRegime: "Output del Regime agent (cached en agent_memory.regime_current)",
        marketIndicators: "Object con 24 ETFs (price, changePct, change5d)",
        economicEvents: "FMP economic-calendar últimos 7 días (max 25)",
        treasuryRates: "FMP treasury yields últimos 7 días (5 latest)",
        portfolioSectors: "[{ sector, total }] desde D1.positions",
        marginInterest: "[{ mes, total }] últimos 3 meses",
        fecha: "YYYY-MM-DD",
      },
      output_shape: {
        severity: "info | warning | critical",
        title: "string",
        summary: "string (4-5 sentences, narrative — NOT bullets)",
        details: {
          regime: "risk-on | risk-off | transition",
          regimeConfidence: "1-10",
          creditStress: "none | mild | elevated | severe",
          factorSignal: "rational-rotation | indiscriminate-selling | risk-on | mixed",
          sectorLeaders: "string[]",
          sectorLaggards: "string[]",
          rateOutlook: "string",
          inflationTrend: "string",
          commoditySignal: "string",
          portfolioImplications: "string[]",
          keyRisks: "string[]",
          opportunities: "string[]",
        },
        score: "1-10",
      },
      cost_per_run_estimate_usd: 0.05,
      trigger: "Manual o pipeline completo",
      when_it_fires: "Step 4. Depende del Regime agent (lee agent_memory.regime_current).",
    },

    // ─────────────────────────────────────────────────────────────
    // 5. RISK (Control de Riesgo) — Opus
    // Source: runRiskAgent, worker.js line 10215
    // ─────────────────────────────────────────────────────────────
    {
      id: "risk",
      name: "Control de Riesgo",
      icon: "⚠️",
      type: "llm",
      model: "claude-opus-4-20250514",
      description: "Análisis a nivel portfolio (concentración, drawdown, beta ponderado, leverage cost vs income, alineación con régimen). NUNCA recomienda vender en dips.",
      system_prompt: `You are a portfolio risk analyst for a $1.35M dividend income portfolio with NN positions.
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

Do NOT return an array. Do NOT return per-position rows. Return ONE object describing the portfolio. The example above shows the exact shape expected.`,
      input_shape: {
        totalNLV: "number",
        positionCount: "number",
        top5: "[{ ticker, weight }]",
        top5Weight: "%",
        maxSingleWeight: "%",
        sectorWeights: "[{ sector, weight, value }]",
        maxDrawdown60d: "%",
        nlvTrend: "[{ fecha, nlv }] últimos 10",
        categories: "{ COMPANY: N, REIT: N, ... }",
        marginInterest: "[{ mes, total }] últimos 3",
        currentRegime: "agent_memory.regime_current",
        weightedBeta: "number",
        positionRiskMetrics: "Top 15 con { ticker, beta, volatility1y, sharpe, sortino, maxDrawdown1y, source: 'FMP'|'GF' }",
      },
      output_shape: {
        severity: "info | warning | critical",
        title: "string",
        summary: "string (3-4 sentences)",
        details: {
          concentrationScore: "1-10",
          diversificationScore: "1-10",
          portfolioBeta: "number",
          sectorConcentration: "string",
          leverageCostVsIncome: "string",
          regimeAlignment: "string",
          topRisks: "string[]",
          recommendations: "string[]",
        },
        score: "1-10",
      },
      cost_per_run_estimate_usd: 0.04,
      trigger: "Manual o pipeline completo",
      when_it_fires: "Step 5. Lee agent_memory.regime_current.",
    },

    // ─────────────────────────────────────────────────────────────
    // 6. TRADE (Asesor de Operaciones) — Haiku Bull + Haiku Bear + Opus Synth
    // Source: runTradeAgent, worker.js line 10337
    // ─────────────────────────────────────────────────────────────
    {
      id: "trade",
      name: "Asesor de Operaciones",
      icon: "🎯",
      type: "llm",
      model: "claude-haiku-4-5 (bull) + claude-haiku-4-5 (bear) + claude-opus-4-20250514 (synth)",
      description: "Sistema de 3 pasos: (1) Haiku argumenta a favor, (2) Haiku contraargumenta riesgos, (3) Opus sintetiza ambos + insights de los demás agentes.",
      system_prompt: `── BULL STEP (Haiku) ──
You are a BULL analyst. Argue IN FAVOR of each position based on agent insights.
For each ticker, give 2-3 concrete bullish reasons using data including GuruFocus metrics.
Use gfValue vs price for valuation, guruBuys13f for smart money signal, insiderBuys3m for conviction.
Identify top 5 positions worth ADDING to based on undervaluation (priceToGfValue <0.8) and dividends.
Respond ONLY JSON array: [{"ticker":"XX","bullCase":"...","upside":"...","addOpportunity":true/false}]
Max 15 tickers.

── BEAR STEP (Haiku) ──
You are a BEAR analyst. Here are bullish arguments for portfolio positions.
Counter-argue with CONCRETE risks and data the bulls ignore.
For each position, identify the biggest risk and downside scenario.
Respond ONLY JSON array: [{"ticker":"XX","bearCase":"...","downside":"...","keyRisk":"..."}]
Max 15 tickers.

── SYNTH STEP (Opus) ──
You are a senior portfolio advisor for a LONG-TERM dividend income portfolio ($1.35M, buy-and-hold).
The owner's goal is GROWING INCOME over decades, not trading for capital gains.

FUNDAMENTAL PHILOSOPHY:
- Selling a quality dividend grower during a temporary dip is the WORST mistake. If fundamentals are intact, HOLD or ADD.
- SELL only if: the business model is permanently broken, or dividend is eliminated with no path to recovery.
- TRIM only if: position is dangerously overweight (>10% of portfolio) AND fundamentally impaired.
- ADD if: quality company trading below fair value with intact dividend.
- Companies restructuring (cutting costs, paying debt, refocusing) are often BUYS not SELLS.
- The conviction reflects debate strength: balanced → LOW, one side dominates → HIGH.

Current market: \${regime.regime} (\${regime.actionGuidance})

SEVERITY (very conservative — don't recommend selling quality companies):
- critical = SELL only if business is in genuine structural decline. Max 1-2 sells.
- warning = worth reviewing, but default is HOLD unless you have strong evidence.
- info = no action needed, position is fine.

Respond ONLY JSON array: [{"ticker":"XX","severity":"info|warning|critical","title":"ACTION: Ticker",
"summary":"2-3 sentence rationale incorporating both bull and bear views",
"details":{"action":"BUY|SELL|HOLD|TRIM|ADD","conviction":"low|medium|high",
"bullSummary":"...","bearSummary":"...","targetPrice":null,"timeHorizon":"short|medium|long"},
"score":1-10}]
Max 10 most actionable recommendations. Score = conviction (1=low, 10=very high).`,
      input_shape: {
        bull_call: "{ todayInsights, positions: [{ ticker, name, shares, price, avgCost, pnlPct, yield, value, aiScore, aiAction, fairValue, priceTarget, analystConsensus, gfValue, gfScore, gfValuation, priceToGfValue, peterLynchFV, guruBuys13f, guruSells13f, insiderBuys3m, insiderSells3m, rsi14 }] (top 30), regime }",
        bear_call: "{ bullArguments (output del bull), todayInsights (severity != info), regime }",
        synth_call: "{ bullArguments, bearArguments, todayInsights (todos), positions (top 20) }",
      },
      output_shape: {
        result: "Array de hasta 10 recomendaciones",
        item: {
          ticker: "string",
          severity: "info | warning | critical",
          title: "ACTION: Ticker",
          summary: "string (2-3 sentences)",
          details: {
            action: "BUY | SELL | HOLD | TRIM | ADD",
            conviction: "low | medium | high",
            bullSummary: "string",
            bearSummary: "string",
            targetPrice: "number | null",
            timeHorizon: "short | medium | long",
          },
          score: "1-10",
        },
      },
      cost_per_run_estimate_usd: 0.20,
      trigger: "Manual o pipeline completo (último paso LLM)",
      when_it_fires: "Step 6 (último). Lee TODOS los insights del día (agent_insights WHERE fecha = today). Si la síntesis Opus falla, degrada gracefully a un info-level con los argumentos bull/bear ya generados.",
    },

    // ─────────────────────────────────────────────────────────────
    // 7-14. NO LLM AGENTS — sólo metadata, sin prompt
    // ─────────────────────────────────────────────────────────────
    {
      id: "postmortem",
      name: "Historial de Aciertos",
      icon: "📋",
      type: "no_llm",
      model: "—",
      description: "Cada día revisa señales de hace 7 y 30 días. BUY/ADD correcto si precio subió >2%, SELL/TRIM si bajó >2%. Guarda accuracy rate.",
      system_prompt: "(no LLM — see runPostmortemAgent in worker.js line 10500)",
      input_shape: { source: "D1.signal_tracking + D1.positions" },
      output_shape: { schema: "agent_insights con accuracy stats" },
      cost_per_run_estimate_usd: 0,
      trigger: "Pipeline completo",
      when_it_fires: "Step 7",
    },
    {
      id: "insider",
      name: "Radar de Insiders",
      icon: "🕵️",
      type: "no_llm",
      model: "—",
      description: "Detecta compras/ventas de insiders (Form 4) en posiciones del portfolio. Patrones recurrentes (10b5-1) vs ventas inusuales.",
      system_prompt: "(no LLM — see runInsiderAgent in worker.js line 10733)",
      input_shape: { source: "FMP /stable/insider-trading/search" },
      output_shape: { schema: "agent_insights por ticker con transacciones recientes" },
      cost_per_run_estimate_usd: 0,
      trigger: "Pipeline completo",
      when_it_fires: "Step 8",
    },
    {
      id: "value",
      name: "Value Signals",
      icon: "💎",
      type: "no_llm",
      model: "—",
      description: "Escanea portfolio + ~120 Aristocrats/Champions buscando infravaloradas según GF Value. Sugiere Put selling.",
      system_prompt: "(no LLM — see runValueSignalsAgent in worker.js line 10942)",
      input_shape: { source: "GuruFocus (GF Value, GF Score), D1.positions" },
      output_shape: { schema: "agent_insights por ticker con descuento, Put strike sugerido, prima, yield total" },
      cost_per_run_estimate_usd: 0,
      trigger: "Pipeline completo",
      when_it_fires: "Step 9",
    },
    {
      id: "options",
      name: "Options Income",
      icon: "🎰",
      type: "no_llm",
      model: "—",
      description: "Escanea top 20 posiciones buscando Covered Calls (OTM 5-10%), Cash Secured Puts y Bull Put Spreads en SPY/QQQ. Evita earnings.",
      system_prompt: "(no LLM — see runOptionsIncomeAgent in worker.js line 11183)",
      input_shape: { source: "Yahoo Finance options chain, D1.positions, regime VIX" },
      output_shape: { schema: "agent_insights con strike, prima, yield, delta, dte" },
      cost_per_run_estimate_usd: 0,
      trigger: "Pipeline completo",
      when_it_fires: "Step 10",
    },
    {
      id: "sec_filings",
      name: "SEC Filings",
      icon: "📄",
      type: "no_llm",
      model: "—",
      description: "Track 8-K material events (item 1.01, 2.01, 5.02, etc.) en posiciones del portfolio.",
      system_prompt: "(no LLM — see runSECFilingsAgent in worker.js line 11374)",
      input_shape: { source: "EDGAR feed (8-K filings)" },
      output_shape: { schema: "agent_insights por ticker con item code, filing date, link" },
      cost_per_run_estimate_usd: 0,
      trigger: "Pipeline completo",
      when_it_fires: "Step 11",
    },
    {
      id: "earnings_trend",
      name: "Earnings Trend",
      icon: "📈",
      type: "no_llm",
      model: "—",
      description: "Detecta patrones de operating-income (3+ trimestres consecutivos negativos). Carve-out para REIT/MLP.",
      system_prompt: "(no LLM — see runEarningsTrendAgent in worker.js line 11551)",
      input_shape: { source: "FMP financials trend (operating income, revenue)" },
      output_shape: { schema: "agent_insights por ticker con racha y dirección" },
      cost_per_run_estimate_usd: 0,
      trigger: "Pipeline completo",
      when_it_fires: "Step 12",
    },
    {
      id: "dividend_cut_warning",
      name: "Dividend Cut Warning",
      icon: "✂️",
      type: "no_llm",
      model: "—",
      description: "Alertas de Q+S cuando payoutRatioWorst > 1.0, fcfCoverage < 1.0 o streak roto. Carve-out REIT/AM/BDC + dedup.",
      system_prompt: "(no LLM — see runDividendCutWarningAgent in worker.js line 11702)",
      input_shape: { source: "D1.quality_safety_scores (Q+S inputs_json)" },
      output_shape: { schema: "agent_insights con tipo de violación" },
      cost_per_run_estimate_usd: 0,
      trigger: "Pipeline completo",
      when_it_fires: "Step 13",
    },
    {
      id: "analyst_downgrade",
      name: "Analyst Downgrade",
      icon: "📉",
      type: "no_llm",
      model: "—",
      description: "Detecta downgrades de analystas en últimos 7 días desde FMP grades.",
      system_prompt: "(no LLM — see runAnalystDowngradeAgent in worker.js line 11872)",
      input_shape: { source: "FMP grades historical" },
      output_shape: { schema: "agent_insights con firm, fromGrade → toGrade, fecha" },
      cost_per_run_estimate_usd: 0,
      trigger: "Pipeline completo",
      when_it_fires: "Step 14",
    },
  ];

  return new Response(JSON.stringify({
    agents: AGENTS_METADATA,
    total: AGENTS_METADATA.length,
    llm_count: AGENTS_METADATA.filter(a => a.type === "llm").length,
    no_llm_count: AGENTS_METADATA.filter(a => a.type === "no_llm").length,
    estimated_pipeline_cost_usd: AGENTS_METADATA.reduce((s, a) => s + (a.cost_per_run_estimate_usd || 0), 0),
    note: "Los system_prompt de los agentes no-LLM están vacíos porque ejecutan código puro. Para los LLM, los prompts son una COPIA del worker.js — si los editas en runXxxAgent, edita también AGENTS_METADATA aquí.",
  }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
}
```

> Reemplaza `CORS` por la constante de cabeceras CORS que usa el resto del
> worker (suele ser `corsHeaders` o `CORS_HEADERS`). Verifica el nombre exacto
> al pegar.

---

## Part 2 — Frontend diff (apply to `frontend/src/components/home/AgentesTab.jsx`)

### 2.1 Add state and fetch (inside `AgentesTab()`, after the existing `useState` block ~line 104)

```jsx
// ── Prompt drawer state ──
const [promptDrawer, setPromptDrawer] = useState(null); // selected agent id or null
const [drawerTab, setDrawerTab] = useState('insights'); // insights | prompt | io
const [agentsMetadata, setAgentsMetadata] = useState([]);

useEffect(() => {
  let cancelled = false;
  fetch(`${API_URL}/api/agents/prompts`)
    .then(r => r.json())
    .then(data => { if (!cancelled) setAgentsMetadata(data.agents || []); })
    .catch(e => console.error('agents/prompts fetch:', e));
  return () => { cancelled = true; };
}, []);

const metadataFor = (id) => agentsMetadata.find(a => a.id === id);

const openPromptDrawer = (agentId) => {
  setPromptDrawer(agentId);
  setDrawerTab('insights');
};
```

### 2.2 Modify the agent-card click handler (~line 363)

Replace:

```jsx
onClick={() => setFilterAgent(isActive ? null : agent.id)}
```

with:

```jsx
onClick={() => openPromptDrawer(agent.id)}
```

(The previous "filter timeline" behaviour now lives inside the drawer's
"Insights" tab. If you want to keep both: bind a small icon button on the
card to open the drawer and leave the card body with the filter behaviour.)

### 2.3 Add the drawer component at the bottom of the file

Paste this at the bottom of `AgentesTab.jsx`, BEFORE the closing
`export default` already in scope (or just after the existing helper
components like `SeverityPill`):

```jsx
function PromptDrawer({ agent, meta, insights, activeTab, setActiveTab, onClose }) {
  if (!agent) return null;

  const copyPrompt = () => {
    if (!meta?.system_prompt) return;
    navigator.clipboard.writeText(meta.system_prompt)
      .then(() => alert('Prompt copiado'))
      .catch(() => {});
  };

  const TabBtn = ({ id, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        background: activeTab === id ? GOLD : 'transparent',
        color: activeTab === id ? '#000' : 'var(--text-secondary)',
        border: `1px solid ${activeTab === id ? GOLD : BORDER}`,
        borderRadius: 8,
        padding: '6px 14px',
        fontSize: 11,
        fontFamily: FB,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >{label}</button>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
        zIndex: 9999, display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(680px, 92vw)', height: '100vh', background: 'var(--card)',
          borderLeft: `1px solid ${BORDER}`, overflow: 'auto',
          padding: '24px 28px', boxShadow: '-8px 0 32px rgba(0,0,0,.4)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontFamily: FB, fontWeight: 800, color: 'var(--text-primary)' }}>
              {agent.icon} {agent.name}
            </div>
            <div style={{ fontSize: 10, fontFamily: FM, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {meta?.model || agent.model}
              {meta?.cost_per_run_estimate_usd != null && (
                <> · ~${meta.cost_per_run_estimate_usd.toFixed(2)}/run</>
              )}
              {meta?.type === 'no_llm' && <> · Sin LLM</>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6,
              color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 10px',
              fontSize: 14, fontFamily: FM,
            }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <TabBtn id="insights" label="📊 Insights" />
          <TabBtn id="prompt" label="🧾 Prompt" />
          <TabBtn id="io" label="📥 Input / 📤 Output" />
        </div>

        {/* Body */}
        {activeTab === 'insights' && (
          <div>
            {insights.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FM }}>
                Sin insights recientes para este agente.
              </div>
            ) : insights.map(i => (
              <div key={i.id || `${i.ticker}-${i.fecha}`} style={{
                border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong style={{ fontSize: 11, fontFamily: FB, color: 'var(--text-primary)' }}>
                    {i.ticker} · {i.title}
                  </strong>
                  <SeverityPill severity={i.severity} />
                </div>
                <div style={{ fontSize: 10, fontFamily: FM, color: 'var(--text-secondary)' }}>
                  {i.summary}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'prompt' && (
          <div>
            {meta?.description && (
              <div style={{
                fontSize: 11, fontFamily: FM, color: 'var(--text-secondary)',
                marginBottom: 14, padding: 10, background: 'var(--bg)', borderRadius: 8,
                border: `1px solid ${BORDER}`,
              }}>
                {meta.description}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontFamily: FM, color: 'var(--text-tertiary)' }}>SYSTEM PROMPT</span>
              <button
                onClick={copyPrompt}
                style={{
                  background: GOLD_DIM, color: GOLD, border: `1px solid ${GOLD}40`,
                  borderRadius: 6, padding: '2px 10px', fontSize: 10, fontFamily: FB,
                  fontWeight: 700, cursor: 'pointer',
                }}
              >Copiar</button>
            </div>
            <pre style={{
              background: 'var(--bg)', border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: 14, fontSize: 10, lineHeight: 1.5, fontFamily: 'ui-monospace, monospace',
              color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: '70vh', overflow: 'auto', margin: 0,
            }}>
              {meta?.system_prompt || '(no metadata cargada — verifica /api/agents/prompts)'}
            </pre>
            {meta && (
              <div style={{ marginTop: 14, fontSize: 10, fontFamily: FM, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                <div><strong style={{ color: 'var(--text-secondary)' }}>Trigger:</strong> {meta.trigger}</div>
                <div><strong style={{ color: 'var(--text-secondary)' }}>Cuándo se ejecuta:</strong> {meta.when_it_fires}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'io' && (
          <div>
            <div style={{ fontSize: 10, fontFamily: FM, color: 'var(--text-tertiary)', marginBottom: 4 }}>📥 INPUT SHAPE</div>
            <pre style={{
              background: 'var(--bg)', border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: 14, fontSize: 10, lineHeight: 1.5, fontFamily: 'ui-monospace, monospace',
              color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              margin: '0 0 18px 0',
            }}>{JSON.stringify(meta?.input_shape || {}, null, 2)}</pre>

            <div style={{ fontSize: 10, fontFamily: FM, color: 'var(--text-tertiary)', marginBottom: 4 }}>📤 OUTPUT SHAPE</div>
            <pre style={{
              background: 'var(--bg)', border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: 14, fontSize: 10, lineHeight: 1.5, fontFamily: 'ui-monospace, monospace',
              color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              margin: 0,
            }}>{JSON.stringify(meta?.output_shape || {}, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 2.4 Render the drawer inside `AgentesTab` (just before the closing `</div>` of the main return)

```jsx
{promptDrawer && (
  <PromptDrawer
    agent={AGENTS.find(a => a.id === promptDrawer)}
    meta={metadataFor(promptDrawer)}
    insights={(byAgent[promptDrawer] || []).slice(0, 30)}
    activeTab={drawerTab}
    setActiveTab={setDrawerTab}
    onClose={() => setPromptDrawer(null)}
  />
)}
```

---

## Part 3 — Cómo extraer cada prompt del worker.js actual

Ya está hecho en la metadata de la Parte 1, pero éste es el mapeo exacto de
líneas para que puedas re-extraer si los prompts cambian. Todos están en
`api/src/worker.js`.

| Agent | Función | Líneas del prompt (entre backticks) |
|---|---|---|
| regime | `runRegimeAgent` | **9715–9729** (`const system = \` ... \`;`) |
| earnings | `runEarningsAgent` | **9878–9916** |
| dividend | `runDividendAgent` | **10078–10115** |
| macro | `runMacroAgent` | **10172–10193** |
| risk | `runRiskAgent` | **10287–10307** |
| trade — bull | `runTradeAgent` (paso 1) | **10398–10403** |
| trade — bear | `runTradeAgent` (paso 2) | **10415–10419** |
| trade — synth | `runTradeAgent` (paso 3) | **10432–10455** |

Comando rápido para verificar (dentro de `api/`):

```bash
sed -n '9715,9729p' src/worker.js
sed -n '9878,9916p' src/worker.js
sed -n '10078,10115p' src/worker.js
sed -n '10172,10193p' src/worker.js
sed -n '10287,10307p' src/worker.js
sed -n '10398,10455p' src/worker.js
```

Los agentes 7-14 (postmortem, insider, value, options, sec_filings,
earnings_trend, dividend_cut_warning, analyst_downgrade) no usan LLM y por
tanto no tienen prompt. Su sección en `AGENTS_METADATA` lleva
`system_prompt: "(no LLM — see source)"` y apunta al número de línea de la
función.

---

## Part 4 — Despliegue

```bash
cd api && npx wrangler deploy
cd ../frontend && npm run build && npx wrangler pages deploy dist --project-name=ayr --branch=production --commit-dirty=true
```

Verificar:

```bash
curl https://aar-api.garciaontoso.workers.dev/api/agents/prompts | jq '.agents[] | {id, model, type}'
```

Esperado: 14 entradas, 6 con `type: "llm"` y 8 con `type: "no_llm"`.

---

## Future / v2 — single source of truth

El MVP duplica los prompts entre `runXxxAgent` y `AGENTS_METADATA`. Para
eliminar la duplicación cuando esto se estabilice:

1. **Extraer cada prompt a una constante con nombre** al inicio del bloque de
   agentes en `worker.js`:

   ```javascript
   const REGIME_SYSTEM_PROMPT = `You are a market regime analyst. ...`;
   const EARNINGS_SYSTEM_PROMPT = `You are a senior earnings analyst ...`;
   // ... etc
   ```

2. **Refactorizar las funciones agente** para referenciar la constante:

   ```javascript
   async function runRegimeAgent(env, fecha) {
     // ...
     const rawInsight = await callAgentClaude(env, REGIME_SYSTEM_PROMPT, userContent);
     // ...
   }
   ```

3. **AGENTS_METADATA referencia las constantes**, no copia el texto:

   ```javascript
   { id: "regime", system_prompt: REGIME_SYSTEM_PROMPT, ... }
   ```

4. **Opcional**: mover toda la metadata a `api/src/agents-registry.js` e
   importarla desde el handler de la ruta. El registry se vuelve la única
   fuente de verdad — `runXxxAgent` la consume y la ruta `/api/agents/prompts`
   la sirve.

5. **Test**: añadir un test que recorra `agents-registry.js` y verifique que
   cada prompt LLM contiene `Respond ONLY JSON` (smoke test que el output
   format no se rompió).

Coste del refactor: ~2h. Beneficio: imposible que metadata y runtime se
desincronicen.

---

## Restricciones cumplidas

- No se modificó `worker.js`
- No se modificó `AgentesTab.jsx`
- Sólo se creó este archivo `docs/agent-prompts-transparency-patch.md`
- El patch es ejecutable: copia-pega del bloque del endpoint, copia-pega del
  diff del frontend, deploy de ambos, listo.
