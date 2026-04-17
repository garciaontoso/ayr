# A&R System Status — Honest Assessment
Date: 2026-04-18 | Verified by: live API checks at ~23:00 UTC 2026-04-17

---

## What Works (Tested, Reliable)

### Portfolio positions table
- 85 positions in D1, updated 2026-04-17 22:48 UTC (within last hour of check)
- IB live data (95 positions from `/api/ib-portfolio`) reconciles closely with D1
- Shares, avg cost, market value, P&L all populate correctly
- Foreign tickers (BME:, HKG:) are present and working in D1
- Confidence: HIGH — this is ground truth

### Live prices (Yahoo Finance proxy)
- `/api/prices?live=1` returns real market data with correct timestamps
- Tested KO, PEP: prices, 52w range, volume all present
- 10-second auto-refresh in frontend works
- Confidence: HIGH (depends on Yahoo availability, no SLA)

### Dividend history (Flex sync)
- 2154+ entries in D1. Latest entry: KRG 2026-04-16, synced 2026-04-17 06:30
- Flex cron (`sync-flex.sh`) runs 08:30 Mon-Fri on your Mac. Requires Mac to be on.
- Last confirmed sync: 2026-04-17 morning — WORKING
- Confidence: HIGH (when Mac is on and IB servers respond)

### IB live summary (NLV, buying power)
- `/api/ib-summary` returns NLV $1,404,695 across 4 accounts — live data, works
- `/api/ib-pnl` returns daily P&L per account — works but partial (only U5372268 has data)
- Confidence: HIGH for NLV, MEDIUM for per-account P&L detail

### NLV history
- 16 daily rows from 2026-03-31 to 2026-04-17 — daily recording works
- Gap: 2026-04-07 missing (weekend?) — not a bug, just no trading day entry
- Confidence: HIGH

### Deep Dividend reports
- 94 reports in D1 covering 74 unique tickers
- Latest batch: LOW/HRL/MDT/LMT/ABBV/JNJ analyzed 2026-04-17 (today)
- These are manually triggered via POST /api/deep-dividend/upload-manual
- The modal upload flow works
- Confidence: HIGH for tickers that have been analyzed

### News feed
- `/api/news/recent` returns 200 items, latest 2026-04-17 — working
- Classification (severity: critical/warning/info) and ticker tagging functional
- Confidence: MEDIUM (FMP feed quality is variable, summaries are AI-generated)

### Earnings archive (R2)
- 7,560 documents in R2: 3,710 transcripts + 2,729 10-Qs + 1,075 10-Ks + 46 20-Fs
- 1.33 GB stored. Per-ticker retrieval (`/api/earnings/archive/list`) works
- Confidence: HIGH for document storage, MEDIUM for coverage (not all 85 positions have full history)

### Smart Money funds
- `/api/funds/list` returns fund list including Akre, Cobas, Magallanes, etc.
- Akre last refreshed 2026-04-17 21:48 — 13F data is current for Q4 2025
- Consensus view endpoint works
- Confidence: MEDIUM (13F data is inherently 45 days stale by design)

### Agents — 10 of 15 running today
Working today (2026-04-17): regime, earnings, risk, macro, postmortem, insider, value, options, dividend_cut_warning, sec_filings
- dividend_cut_warning fired 10 alerts today (ENG, GPC, MTN, PFE most critical)
- options agent: 78 insights today
- Confidence: MEDIUM-HIGH — agents ran but cron is disabled (manual trigger only, see below)

---

## What Partially Works (Use with caution)

### Agent pipeline — manual trigger only, no daily cron
- The daily cron at 09:00 Mon-Fri was **disabled 2026-04-08**. wrangler.toml only has a Monday 06:00 weekly digest cron now.
- Agents today ran because someone manually triggered them, not automatically.
- If you don't manually run `POST /api/agent-run`, agents produce nothing that day.
- The "agent run status" endpoint shows state = "running" since **2026-04-08** — this is a stuck state, not an active run. The run started 9+ days ago and never wrote a finish timestamp.
- What to do: either re-enable the cron or accept agents are manual-only.

### Deep Dividend data quality — 53 of 94 reports have null cut_probability
- Rows created in the early batch (before the backtest/calibration pipeline) have `cut_probability_3y = null` and `raise_probability_12m = null`.
- The newer batches (NOMD, MDV, GQG, HKG tickers, recent US tickers) do have numeric probabilities.
- Verdict fields are present for all 94, so BUY/HOLD/SELL is usable, but the probability numbers are unreliable/missing for ~56% of the portfolio.

### Earnings upcoming calendar
- `/api/earnings/upcoming?days=90` returns 13 entries — works but only 13 out of 85 positions have upcoming earnings dates populated
- Most positions show no upcoming earnings because the FMP calendar isn't backfilled per-ticker
- Do not rely on this as a complete earnings schedule

### IB live P&L (unrealized)
- `/api/ib-pnl` returns upnl only for U5372268, not the other 3 accounts
- The endpoint works but coverage is partial

### IB Flex direct pull (on-demand)
- `/api/ib-flex` endpoint returns "Flex SendRequest failed" — IB blocks Cloudflare Worker IPs
- This is expected behavior. Flex import only works via the Mac cron script.

### Sector deep dives
- The `/api/sector-deep-dive/list` endpoint crashes with "no such table: sector_deep_dives"
- The `ensureMigrations()` function has the CREATE TABLE statement for this table, but it hasn't run against production D1 yet for this table specifically.
- The POST endpoint to create a report also requires manual body_md input (no AI auto-generation).
- Status: broken until ensureMigrations fires on a cold start, or you POST to an endpoint that calls ensureMigrations.

### Discovery scan
- `/api/discovery/scan` runs but returns 0 candidates ("portfolio_excluded": true, portfolio_size: 84)
- Logic appears to exclude all current holdings. If there are no non-portfolio stocks to scan, it returns empty.
- Not broken, but useless until the candidate universe is defined.

### Quality & Safety scores (old system)
- `/api/quality-safety` returns 404 — endpoint does not exist at that path
- Deep Dividend (the replacement) has scores but 56% have null probabilities (see above)

---

## What's Broken or Incomplete

### Sector deep dives table missing in production
- D1 table `sector_deep_dives` does not exist. Any call to list or display stored sector reports will 500.
- Fix: trigger a cold-start request that runs ensureMigrations (e.g., deploy, or hit an endpoint that calls ensureMigrations internally). Check lines 1033-1047 of worker.js — the schema is defined, just not yet executed.

### 5 agents never ran today (and likely haven't run in days)
- **dividend** — 0 insights today AND yesterday. This is the Opus dividend analysis agent — most important one. Not running.
- **trade** — 0 insights today AND yesterday. No trade recommendations being generated.
- **analyst_downgrade** — 0 insights. FMP analyst data is available but agent isn't firing.
- **earnings_trend** — 0 insights. Earnings trend analysis not running.
- **summary** — 0 insights. The "Resumen Ejecutivo" daily brief is not being produced.

### Agent run state permanently stuck
- The agent_memory key for run state shows started_at: 2026-04-08, finished_at: null. This means the UI "running" spinner has been spinning for 9 days. Any code that checks "is a run in progress" will block forever or behave incorrectly.

### Cost basis endpoint returning empty
- `/api/cost-basis?ticker=KO` returns 0 trades despite 8,683 trades in D1
- The path may require different query params or the ticker filter may be broken for individual lookups
- The bulk trade data exists (from Flex import) but the per-ticker endpoint is not serving it

### IB P&L unrealized — mostly empty
- `/api/ib-pnl` body: `{"upnl":{"U5372268.":{"rowType":1,"dpl":543.2,"nl":38380,"upl":-61530,...}}}` — only one account, and the key has a trailing dot ("U5372268.") which may indicate a parsing issue

---

## Data Sources & Freshness

### Portfolio positions
- Source: IB OAuth (live) + D1 cache
- Last updated: 2026-04-17 22:48 UTC
- Freshness: real-time on demand
- Reliability: ★★★★★

### Dividend history
- Source: IB Flex (Mac cron, 08:30 Mon-Fri)
- Last sync: 2026-04-17 06:30 UTC
- Freshness: daily (requires Mac on)
- Reliability: ★★★★☆ (Mac dependency)

### NLV / account summary
- Source: IB OAuth live
- Last checked: 2026-04-17 (current session)
- Freshness: real-time on demand
- Reliability: ★★★★☆

### NLV history (chart)
- Source: D1, manually saved via scheduled cron
- Last entry: 2026-04-17
- Freshness: daily
- Reliability: ★★★★☆ (16 days of history, not years)

### Deep Dividend reports
- Source: Manual analysis via /api/deep-dividend/upload-manual
- Coverage: 74 of 85 portfolio tickers (87%)
- Last batch: 2026-04-17 (LOW, HRL, MDT, LMT, ABBV, JNJ)
- Reliability: ★★★☆☆ (good analysis, but 56% have null probabilities, all < 1yr old)

### Agent insights (dividend_cut_warning, value, options, insider)
- Source: Cloudflare Worker, FMP data, manual trigger
- Last run: 2026-04-17 21:48 UTC
- Freshness: last manual trigger (no daily auto-cron)
- Reliability: ★★★☆☆ (data quality depends on FMP fundamentals)

### FMP fundamentals cache
- Source: FMP Ultimate API (via worker proxy)
- Tested KO: `updated_at: None, source: None` — the cache metadata is not being written
- TTL: 24h but metadata is not reliable
- Reliability: ★★☆☆☆ (data arrives but cache bookkeeping is broken)

### News
- Source: FMP news API, AI summarized
- Last item: 2026-04-17 16:55 UTC
- Freshness: daily refresh
- Reliability: ★★★☆☆ (volume over quality, clickbait included)

### Smart Money (13F)
- Source: SEC EDGAR via FMP
- Last refreshed: 2026-04-17 21:48 UTC for US funds (Akre, etc.)
- Spanish funds (Cobas, azValor, Magallanes): Q4 2024 data — stale
- Reliability: ★★★☆☆ (US 13F current, Spanish semiannual not refreshed recently)

### Earnings archive (R2)
- Source: FMP transcripts + SEC EDGAR 10-Q/10-K
- Total: 7,560 documents, 1.33 GB
- Freshness: last bulk import date unknown — not verified
- Reliability: ★★★★☆ (documents are there, retrieval works)

---

## What You Should Do Tomorrow (Morning)

1. **Reset the stuck agent run state.** The "running since 2026-04-08" state is causing incorrect UI behavior. Look for the agent_memory row or state variable and clear it. Then run agents fresh.

2. **Re-enable daily cron OR commit to manual-trigger workflow.** Right now agents produce nothing unless manually triggered. Decide: re-enable `crons = ["0 9 * * 1-5"]` in wrangler.toml (you disabled it 2026-04-08, reason unknown — check before re-enabling) or build a UI button you'll actually press each morning.

3. **Run the 5 missing agents.** POST /api/agent-run with agents: dividend, trade, analyst_downgrade, earnings_trend, summary. These are the ones producing zero output. The dividend Opus agent is the most valuable one.

4. **Fix the sector_deep_dives table.** Deploy or make any request that triggers ensureMigrations. The table definition is correct in worker.js (lines 1033-1047), it just hasn't run in production D1 yet.

5. **Verify cost-basis per-ticker endpoint.** 8,683 trades exist in D1 but `/api/cost-basis?ticker=KO` returns 0. Either the query parameter name is wrong or there's a bug. This affects the Trades tab.

---

## Things You Should NOT Trust Yet

**Agent probabilities in Deep Dividend** — 53 of 94 reports have `cut_probability_3y = null`. These are the older batch-generated entries. The BUY/HOLD/SELL verdict is there but the probability number is not. Do not quote specific probability figures for these tickers.

**Earnings calendar** — 13 entries out of 85 positions. Do not rely on this as a complete schedule. Cross-check against FMP or IB directly.

**Trade agent recommendations** — agent has produced 0 insights ever (trade agent: 0 today, 0 yesterday). Any "trade suggestions" showing in the UI are either stale, hardcoded, or from a different agent.

**FMP fundamentals cache metadata** — `updated_at` and `source` fields return null. You cannot verify when fundamentals data was last fetched. The data itself may be fine, but you can't confirm freshness programmatically.

**Agent run status ("running" spinner)** — stuck since 2026-04-08. Any UI that shows agent run state is displaying incorrect information.

**Spanish fund data** — Cobas, azValor, Magallanes last reported semiannually. The data is old and the refresh cron for Spanish funds hasn't run recently.

---

## Next Implementation Priorities (This Week, Not Today)

1. **Fix stuck agent run state** — 1-2 hours. The `finished_at = null` since April 8 is a bug. Add a cleanup/reset endpoint or fix the state machine.

2. **Re-enable or replace daily agent cron** — 30 minutes. The most important automation in the system is disabled. Either re-enable it in wrangler.toml and deploy, or understand why it was disabled and fix the underlying issue first.

3. **Fix cost-basis per-ticker endpoint** — 1 hour. 8,683 trades exist but the per-ticker query is broken. This affects cost analysis and the Trades tab.

4. **Fill null probabilities in Deep Dividend** — 2-3 hours. Re-run the analysis pipeline for the 53 tickers with null cut_probability. The data exists in R2 (7,560 docs), it's a matter of running the pipeline again.

5. **Fix sector_deep_dives D1 table** — 15 minutes. Just deploy (or trigger ensureMigrations). The schema is correct, it just hasn't run.

6. **Add IB P&L for all 4 accounts** — medium effort. Currently only U5372268 shows unrealized P&L. The other 3 accounts are dark.

7. **Complete earnings calendar population** — Only 13 of 85 positions have upcoming earnings dates. Consider a batch FMP call to populate all positions.
