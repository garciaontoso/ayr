# Dividend Agent — FCF/Payout Bug Fix Patch

**Bug**: For FLO the agent reports `FCF of $89M` and tags `cutRisk: high`, when the
real TTM FCF persisted in `quality_safety_scores.inputs_json` is **$329,210,000**
(coverage ratio ~1.57x — healthy). This produces false-positive critical/warning
insights and noisy push notifications.

---

## 1. Diagnóstico

### Where the wrong numbers come from
File: `api/src/worker.js`
Function: `runDividendAgent` — defined at **line 9312**
Payload construction loop: **lines 9360-9390**

The agent feeds Opus only **one** ratios row and **one** cashflow row per ticker:

```js
// line 9365-9367
const latestRatios = Array.isArray(f.ratios) ? f.ratios[0] : f.ratios;
const latestCF     = Array.isArray(f.cashflow) ? f.cashflow[0] : f.cashflow;
const ownerE      = Array.isArray(f.ownerEarnings) ? f.ownerEarnings[0] : f.ownerEarnings;
```

and then exposes:

```js
// line 9373-9376
payoutRatio:   latestRatios?.payoutRatio || latestRatios?.dividendPayoutRatio,
fcfPerShare:   latestCF?.freeCashFlowPerShare,
ownerEarningsPerShare: ownerE?.ownerEarningsPerShare,
```

Two concrete failure modes for FLO:

1. **`fcfPerShare` is single-period, not TTM**
   FMP `cashflow` returns periods ordered newest-first. `latestCF` is therefore the
   **most recent single quarter** (or annual, depending on which call populated the
   cache). For FLO, FCF/share for the latest reported period is ~$0.40 → × 228 M
   shares ≈ **$89 M**, exactly the figure Opus is citing. The TTM is ~4x larger
   (≈$329 M), which matches the `fcfTTM` already computed by `_qs_safety` and
   stored in `quality_safety_scores.inputs_json`.

2. **`payoutRatio` is also single-period and the field is unreliable per sector**
   `latestRatios.payoutRatio` is the FMP-derived ratio for **one** period. Q+S
   computes `payoutRatioWorst = max(divTTM/niTTM, divTTM/fcfTTM)` (line 8469),
   which is the right number to evaluate cut risk. The agent never sees it.

3. **Opus has no FCF coverage / FCF payout signal at all**
   The single most important number for "is the dividend safe" is
   `fcfCoverage = fcfTTM / divTTM`. The agent currently sends none of:
   `fcfTTM`, `divTTM`, `fcfCoverage`, `fcfPayoutRatio`, `payoutRatioWorst`,
   `debtEbitda`, `currentRatio`. All of these are already persisted by
   `_qs_safety` (lines 8639-8651) inside `inputs_json`.

### Where the right numbers already exist
Function `_qs_safety` at **line 8425** uses TTM sums:

```js
// line 8431-8432
const divTTM = _qs_sum(trend.dividendsPaid, 4);
const fcfTTM = _qs_sum(trend.fcf, 4);
```

and persists them (line 8639-8651):

```js
inputs: {
  divTTM, fcfTTM, niTTM,
  fcfCoverage: fcfCov,
  payoutRatio,         // earnings-based
  fcfPayoutRatio,      // FCF-based
  payoutRatioWorst,
  fcfAfterMaintCov,
  debtEbitda,
  currentRatio,
  streakYears: dividendStreakYears,
  revGrowth,
  vol1y: risk?.volatility1y,
}
```

`computeQualitySafetyScore` writes this JSON via `INSERT … inputs_json = ?`
(line 8951). The Q+S agent (`runQualitySafetyAgent` / step 2 of the cron pipeline,
called via `computeQualitySafetyAll` at line 6359) runs **before** `runDividendAgent`
in the cron schedule (`runDividendAgent` is step 3 — see line 11400), so a fresh
snapshot always exists by the time the dividend agent runs.

### Conclusion
Least-invasive fix: **load `inputs_json` from `quality_safety_scores` for the same
tickers and merge the authoritative TTM figures into the per-position payload sent
to Opus**. No recalculation, no new FMP calls, no schema changes.

---

## 2. Fix exacto (diffs listos para aplicar con Edit)

### Diff 1 — `api/src/worker.js` — load Q+S inputs at the top of `runDividendAgent`

**old_string:**
```js
  const tickers = positions.map(p => p.ticker);
  const placeholders = tickers.map(() => "?").join(",");
  const { results: fundamentals } = await env.DB.prepare(
    `SELECT symbol, ratios, cashflow, dividends, key_metrics, owner_earnings FROM fundamentals WHERE symbol IN (${placeholders})`
  ).bind(...tickers).all();
```

**new_string:**
```js
  const tickers = positions.map(p => p.ticker);
  const placeholders = tickers.map(() => "?").join(",");
  const { results: fundamentals } = await env.DB.prepare(
    `SELECT symbol, ratios, cashflow, dividends, key_metrics, owner_earnings FROM fundamentals WHERE symbol IN (${placeholders})`
  ).bind(...tickers).all();

  // Pull Q+S inputs_json for AUTHORITATIVE TTM figures (fcfTTM, divTTM,
  // fcfCoverage, payoutRatioWorst, debtEbitda, currentRatio, streakYears).
  // The dividend agent previously read latestCF.freeCashFlowPerShare which is
  // a SINGLE-PERIOD per-share value — for FLO this is ~$0.40 × 228M shares ≈
  // $89M, vs the real TTM of ~$329M. Q+S already computes the correct values
  // and persists them per-ticker on each scoring run (which happens earlier
  // in the same cron pipeline).
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
      } catch {}
    }
  } catch (e) {
    console.error("[Dividend] Q+S inputs load failed:", e.message);
  }
```

---

### Diff 2 — `api/src/worker.js` — use Q+S inputs in the per-position payload

**old_string:**
```js
  const allPosData = positions.map(p => {
    const f = fundMap[p.ticker] || {};
    const gf = gfMap[p.ticker] || {};
    // Prefer FMP trends (richer, fresher), fall back to GF if FMP cache empty
    const trend = fmpFinMap[p.ticker]?.trend || gf.trend || {};
    const latestRatios = Array.isArray(f.ratios) ? f.ratios[0] : f.ratios;
    const latestCF = Array.isArray(f.cashflow) ? f.cashflow[0] : f.cashflow;
    const ownerE = Array.isArray(f.ownerEarnings) ? f.ownerEarnings[0] : f.ownerEarnings;
    const category = REITS.has(p.ticker) ? 'REIT' : BDCS.has(p.ticker) ? 'BDC' : ETFS.has(p.ticker) ? 'ETF' : PREFS.has(p.ticker) ? 'PREFERRED' : 'COMPANY';
    return {
      ticker: p.ticker, name: p.name, sector: p.sector,
      category, // REIT, BDC, ETF, PREFERRED, or COMPANY
      divTTM: p.div_ttm, yield: p.div_yield, yoc: p.yoc,
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
    };
  });
```

**new_string:**
```js
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
    // using _qs_sum(trend.dividendsPaid, 4) etc). Falls back to legacy
    // single-period FMP fields only if Q+S has no snapshot for this ticker.
    const qs = qsInputsByTicker[p.ticker] || {};
    const qsSafety = qs.safety || {};

    return {
      ticker: p.ticker, name: p.name, sector: p.sector,
      category, // REIT, BDC, ETF, PREFERRED, or COMPANY
      divTTM: p.div_ttm, yield: p.div_yield, yoc: p.yoc,

      // ── TTM cash-flow figures (authoritative — from Q+S) ──
      // dividendsPaidTTM and fcfTTM are dollar totals over the last 4 quarters.
      // fcfCoverageTTM = fcfTTM / dividendsPaidTTM. Use these — DO NOT compute
      // from per-share fields, which are single-period and ~4x understated.
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
    };
  });
```

---

### Diff 3 — `api/src/worker.js` — point Opus at the new TTM fields in the system prompt

This makes Opus prefer the authoritative TTM fields and not regress to citing
the legacy per-share numbers when both are present.

**old_string:**
```js
TREND ANALYSIS (use trendRevenue, trendFCF, trendDebt, trendDivPaid — most recent quarter first):
- If debt is DECREASING over 4+ quarters AND dividend was cut → STRATEGIC restructuring, likely positive. Score 6+.
- If FCF is INCREASING while revenue is flat → margin improvement, dividend is safer. Score 7+.
- If debt is INCREASING AND FCF is DECREASING → genuine stress. Score 3-4.
- If dividendsPaid dropped but FCF is strong → voluntary cut to invest or pay debt. Explain WHY.
- Always analyze the DIRECTION of the trend, not just the latest number.
```

**new_string:**
```js
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
```

---

## 3. Verificación

After applying the diffs and deploying the worker:

```bash
cd /Users/ricardogarciaontoso/IA/AyR/api && npx wrangler deploy
```

### Smoke test 1 — confirm Q+S inputs exist for FLO
```bash
curl -s "https://aar-api.garciaontoso.workers.dev/api/scores" \
  | jq '.scores[] | select(.ticker=="FLO") | {ticker, safety_score, quality_score, snapshot_date}'
```
Expect: a row with a recent `snapshot_date` and non-null scores. If empty, run
`curl -X POST "https://aar-api.garciaontoso.workers.dev/api/agents/run?agent=quality-safety"`
first to populate.

### Smoke test 2 — re-run dividend agent and inspect FLO insight
```bash
curl -s -X POST "https://aar-api.garciaontoso.workers.dev/api/agents/run?agent=dividend"
```
Then fetch the stored insight (adjust endpoint to whatever surfaces dividend
agent insights — typically `/api/agents/insights?agent=dividend`):
```bash
curl -s "https://aar-api.garciaontoso.workers.dev/api/agents/insights?agent=dividend" \
  | jq '.[] | select(.ticker=="FLO")'
```
Expect:
- `details.cutRisk == "low"` (was `"high"`)
- `summary` cites a number close to **$329M** (or "FCF TTM $329M covering dividends $209M = 1.57x"), NOT $89M.
- `score` >= 6.

### Smoke test 3 — sanity check a known stressed ticker
Pick a name where the dividend really IS stretched (e.g. PFE if applicable in
this portfolio) and confirm the agent still flags it. This catches over-correction.
```bash
curl -s "https://aar-api.garciaontoso.workers.dev/api/agents/insights?agent=dividend" \
  | jq '[.[] | {ticker, score, cutRisk: .details.cutRisk}] | sort_by(.score)'
```
Expect: distribution of scores, not all clustered at 8-10.

### Smoke test 4 — log inspection
```bash
cd /Users/ricardogarciaontoso/IA/AyR/api && npx wrangler tail --format=pretty
```
Trigger the dividend agent again and watch for the `[Dividend] Q+S inputs load failed:`
error string. If it appears, the JOIN is wrong or `quality_safety_scores` is empty
for the snapshot date — fall back to running Q+S first.
