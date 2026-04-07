# A&R AI Agents — Technical Documentation

## Architecture Overview

```
Cron 9am UTC (Mon-Fri) OR manual button per agent
  │
  ├── Step 0a: cacheMarketIndicators()     → 24 ETFs via Yahoo → agent_memory
  ├── Step 0b: cacheGuruFocusData()        → 85 tickers via GF API → gurufocus_cache
  │
  ├── Step 1:  Pulso del Mercado (regime)  → Haiku → agent_insights + agent_memory
  ├── Step 2:  Vigilante de Earnings       → Haiku → agent_insights
  ├── Step 3:  Guardian de Dividendos      → Haiku (6 batches x15) → agent_insights
  ├── Step 4:  Control de Riesgo           → Haiku → agent_insights
  ├── Step 5:  Radar Macro                 → Opus → agent_insights
  ├── Step 6:  Asesor de Operaciones       → Haiku+Haiku+Opus (3 calls) → agent_insights + signal_tracking
  ├── Step 7:  Historial de Aciertos       → No LLM → agent_insights + signal_tracking
  ├── Step 8:  Radar de Insiders           → No LLM (GF API) → agent_insights
  ├── Step 9:  Value Signals               → No LLM (GF API) → agent_insights
  └── Step 10: Options Income              → No LLM (Yahoo Options) → agent_insights
                                                  │
                                        Push notification if critical
```

**File:** `api/src/worker.js` (7353 lines)
**Frontend:** `frontend/src/components/home/AgentesTab.jsx`
**D1 Tables:** `agent_insights`, `agent_memory`, `signal_tracking`, `gurufocus_cache`
**Cost:** ~$0.60/day (~$13/month) — 2 Opus calls + 8 Haiku calls + 0 LLM for 4 agents

---

## Agent 0: Pulso del Mercado (Market Regime)

**Function:** `runRegimeAgent()` — line 5584
**Model:** Haiku | **Cost:** ~$0.01/run
**DB name:** `regime` | **Ticker:** `_REGIME_`

### What it does
Determines if we're in bull, bear, or transition market using 24 ETFs:
- **Indices:** SPY, QQQ, IWM, DIA
- **Sectors:** XLK, XLF, XLE, XLV, XLU, XLP, XLI, XLRE
- **Credit:** HYG, LQD, TLT, SHY
- **Factors:** QUAL, MTUM, VLUE
- **Commodities:** GLD, USO, DBC
- **Dollar:** UUP | **Volatility:** ^VIX

### Logic
- Cyclicals (XLF/XLE/XLI) vs defensives (XLU/XLP/XLV) → risk appetite
- HYG/LQD falling = credit stress, TLT rising = flight-to-quality
- QUAL+MTUM+VLUE all losing vs SPY = indiscriminate selling
- Output persisted to `agent_memory.regime_current` for use by other agents

### Output fields
`regime` (bull/bear/transition-up/transition-down), `breadthSignal`, `creditStress`, `factorSignal`, `safeHavens`, `actionGuidance`, `sectorLeaders[]`, `sectorLaggards[]`, `vixRegime`

### Known issues
- Haiku sometimes returns string instead of JSON → handled with typeof guard
- Weekend data is stale (Yahoo returns Friday's close)

### Improvement ideas
- Add Fear & Greed index from CNN (already cached in price_cache)
- Add put/call ratio as sentiment indicator
- Track regime changes over time (store history in agent_memory)
- Add breadth indicators (advance/decline, new highs/lows)

---

## Agent 1: Vigilante de Earnings

**Function:** `runEarningsAgent()` — line 5645
**Model:** Haiku | **Cost:** ~$0.02/run
**DB name:** `earnings`

### What it does
Analyzes last 2 quarters of earnings for up to 40 positions. Flags EPS/revenue misses, margin compression, guidance changes.

### Data sources
- `fundamentals` table: earnings, estimates, rev_segments, geo_segments, grades
- `gurufocus_cache`: growthRank, momentumRank, profitabilityRank

### Severity calibration
- **critical:** EPS miss >15% AND revenue miss >5% AND deteriorating trend (max 3-4)
- **warning:** EPS miss 5-15% or revenue miss 3-5% or guidance cut
- **info:** beat or minor miss <5%

### Known issues
- FMP sometimes returns absolute numbers instead of percentages for surprises
- Prompt instructs to ignore one-time write-downs but Haiku sometimes flags them anyway
- Capped at 40 positions (token limit) — remaining are skipped

### Improvement ideas
- Add earnings calendar (FMP `/earnings-calendar`) to flag upcoming earnings
- Compare revenue segments quarter-over-quarter for structural shifts
- Track analyst estimate revisions (are estimates being cut?)
- Add conference call sentiment analysis (would need transcript API)

---

## Agent 2: Guardian de Dividendos

**Function:** `runDividendAgent()` — line 5718
**Model:** Haiku (6 batches of 15) | **Cost:** ~$0.06/run
**DB name:** `dividend`

### What it does
Full portfolio scan — analyzes ALL 77+ dividend positions in batches of 15. Each position gets a safety verdict.

### Data sources
- `fundamentals`: ratios, cashflow, dividends, key_metrics, owner_earnings
- `dividendos` table: real IB payments (last 2 years)
- `gurufocus_cache`: financialStrength, shareholderYield, buybackYield, dividendStreakSince

### Key metrics evaluated
- Payout ratio (earnings-based AND FCF-based)
- Owner earnings coverage (more accurate than FCF)
- GF Financial Strength (0-10)
- Shareholder yield (dividend + buyback)
- Real payment history from IB
- REITs: uses FFO/AFFO payout (>100% earnings is normal)

### Known issues
- 6 Haiku calls = risk of rate limiting (5s delay between batches)
- Some tickers missing GF data (BME:/HKG: prefixed)
- Haiku may inconsistently classify REIT payout ratios

### Improvement ideas
- Add dividend growth rate (5y CAGR from FMP dividends data)
- Compare announced DPS vs actual DPS received in IB
- Flag ex-dividend dates coming up (opportunity to buy before)
- Add peer comparison within same sector

---

## Agent 3: Radar Macro

**Function:** `runMacroAgent()` — line 5816
**Model:** **Opus** | **Cost:** ~$0.25/run
**DB name:** `macro` | **Ticker:** `_MACRO_`

### What it does
Complex narrative synthesis of macro environment and impact on dividend portfolio. Uses Opus for deeper reasoning.

### Data sources
- FMP: economic-calendar (last 7 days), treasury rates
- `agent_memory.market_indicators`: 24 ETFs
- `agent_memory.regime_current`: current market regime
- `margin_interest` table: leverage costs

### Unique to this agent
- Chain-of-thought reasoning (regime → credit → factors → sectors → commodities → portfolio implications)
- Contextualizes for China fiscal resident with 10% WHT
- Connects commodity moves to inflation risk for dividend stocks

### Known issues
- FMP economic calendar may return empty on weekends
- Opus is 12x more expensive than Haiku — worth it for quality
- Treasury endpoint may not be available on all FMP plans

### Improvement ideas
- Add USD/CNY exchange rate impact (affects dividend value in CNY)
- Track macro trends over 7/30 days (store in agent_memory)
- Add Fed dot plot / rate expectations
- Include ISM PMI, consumer confidence

---

## Agent 4: Control de Riesgo

**Function:** `runRiskAgent()` — line 5892
**Model:** Haiku | **Cost:** ~$0.01/run
**DB name:** `risk` | **Ticker:** `_PORTFOLIO_`

### What it does
Portfolio-level risk assessment: concentration, sector diversification, drawdown, beta, leverage cost, regime alignment.

### Data sources
- `positions` table: market_value, sector, pnl_pct
- `nlv_history`: 60-day NLV for drawdown calculation
- `margin_interest`: 3 months of margin costs
- `gurufocus_cache`: beta, volatility1y, sharpe, sortino, maxDrawdown1y per position
- `agent_memory.regime_current`: market regime

### Calculations (no LLM needed but uses Haiku for narrative)
- Top 5 weight, max single position weight
- Sector Herfindahl-Hirschman concentration
- Portfolio weighted beta
- Max drawdown from NLV series
- Margin cost vs dividend income comparison

### Known issues
- 98.8% of positions have "Unknown" sector (data quality issue in D1)
- GF beta data only available for ~36 US tickers
- Weighted beta = 0 when most tickers lack GF data

### Improvement ideas
- Fix sector classification in positions table (enrich from FMP profile)
- Add correlation matrix between top holdings
- Track drawdown over time (rolling 30d, 60d, 90d)
- Add VaR (Value at Risk) estimation
- Compare portfolio beta vs benchmark

---

## Agent 5: Asesor de Operaciones (Trade Advisor)

**Function:** `runTradeAgent()` — line 5990
**Model:** Haiku (bull) + Haiku (bear) + **Opus** (synthesis) | **Cost:** ~$0.28/run
**DB name:** `trade`

### What it does
3-step bull/bear debate:
1. **Haiku Bull:** argues in favor of each flagged position (2-3 bullish reasons)
2. **Haiku Bear:** counter-argues with concrete risks
3. **Opus Synthesis:** weighs both sides + all agent insights → buy/sell/hold/trim/add

### Data sources
- `agent_insights` today: all other agents' output
- `ai_analysis`: existing per-ticker AI scores
- `fundamentals`: DCF, price_target, grades
- `gurufocus_cache`: GF Value, GF Score, insider/guru activity, RSI
- `agent_memory.regime_current`: market regime

### Conviction system
- If bull and bear are balanced → conviction LOW
- If one clearly dominates → conviction HIGH
- Regime-aware: bearish regime → higher bar for BUY recommendations

### Signal tracking
- Non-HOLD signals stored in `signal_tracking` for postmortem evaluation
- Tracks price_at_signal, ticker, action, fecha

### Known issues
- 3 API calls = highest cost agent (~$0.28)
- Bull/bear summaries not always included in output by Opus
- Rate limits can fail one of the 3 calls

### Improvement ideas
- Add position sizing recommendations (how much to buy/sell)
- Include tax implications (unrealized gains/losses)
- Track conviction accuracy over time (high conviction = more accurate?)
- Add Wheel strategy context (if CSP assigned → CC → repeat)

---

## Agent 6: Historial de Aciertos (Signal Postmortem)

**Function:** `runPostmortemAgent()` — line 6124
**Model:** None (pure calculation) | **Cost:** $0
**DB name:** `postmortem` | **Ticker:** `_POSTMORTEM_`

### What it does
Evaluates past trade signals after 7 and 30 days:
- BUY/ADD → correct if price rose >2%
- SELL/TRIM → correct if price fell >2%
- HOLD → always neutral
- Stores accuracy rate in `agent_memory.signal_accuracy`

### Data sources
- `signal_tracking` table: past signals with price_at_signal
- `positions` table: current prices

### Status
- Will start producing data 7 days after first Trade Advisor run
- Currently 0 evaluated (signals too recent)

### Improvement ideas
- Add 90-day evaluation window
- Weight accuracy by conviction level
- Track accuracy by agent (which agent's signals are most reliable?)
- Display running accuracy score in the agent card

---

## Agent 7: Radar de Insiders

**Function:** `runInsiderAgent()` — line 6357
**Model:** None (GuruFocus API) | **Cost:** $0 (uses GF subscription)
**DB name:** `insider`

### What it does
Monitors insider trading (CEO, CFO, directors) across all 85 portfolio positions:
- Fetches `/stock/{symbol}/insider` for each ticker
- Classifies: P=Purchase, S=Sale
- Detects patterns: recurring sellers (4+ sales/year = likely 10b5-1 plan)
- Calculates price impact: current price vs price at insider trade
- Tags recurring sellers with [RPT] (less relevant)

### Pattern detection
- `cluster-buy`: 2+ insiders buying → bullish (score 8)
- `cluster-sell`: 3+ non-recurring sellers → critical red flag (score 2)
- `unusual-sell`: single non-recurring sale → investigate (score 3)
- `planned-sales`: all sales from recurring sellers → ignore (score 6)

### Price impact
Each trade shows: trade price → current price → % change
Average impact per ticker for quick assessment

### Known issues
- GF returns `{SYMBOL: [trades...]}` — needed custom key extraction
- Non-US tickers (BME:, HKG:) fail silently
- 90-day window may miss slower patterns

### Improvement ideas
- Add insider ownership % (how much skin in the game)
- Track insider buying on dips vs selling on highs
- Alert when C-level buys > $500K (high conviction signal)
- Cross-reference with earnings dates (insider selling before bad earnings)
- Add guru 13F tracking per position (which gurus own your stocks)

---

## Agent 8: Value Signals

**Function:** `runValueSignalsAgent()` — line 6565
**Model:** None (GuruFocus cached data) | **Cost:** $0 + ~120 GF queries for watchlist
**DB name:** `value`

### What it does
Two-part scanner:
1. **Portfolio scan:** finds your positions trading below GF Value (ADD opportunities)
2. **Watchlist scan:** scans 120+ Dividend Aristocrats/Champions NOT in your portfolio (NEW opportunities)

### Filters (must pass ALL)
- Price < GF Value (undervalued)
- GF Score > 50 (portfolio) or >60 (watchlist)
- Financial Strength > 4 (portfolio) or >5 (watchlist)
- Dividend Yield > 1% (watchlist only)

### Put selling context
For each opportunity, calculates:
- Put strike (10% below current price)
- Estimated annual premium (~20% of historical volatility)
- Total yield (dividend + put premium)
- YOC if assigned

### Watchlist universe (120+ tickers)
Dividend Aristocrats, Dividend Champions, high-yield quality payers, quality REITs, utilities, healthcare dividend, industrials, financials.

### Frontend filters
- **Div min:** All, 2%+, 3%+, 4%+, 5%+
- **Type:** Todas, En cartera, Nuevas

### Known issues
- GF `/guru/newpicks` and `/guru/topstocks` return 404 (not available on Premium Plus plan)
- Hardcoded watchlist — doesn't discover new stocks dynamically
- Put premium estimation is rough (~20% of vol) — actual premiums may differ

### Improvement ideas
- Add FMP screener API for dynamic stock discovery
- Fetch actual put premiums from Yahoo for more accurate estimates
- Add momentum filter (don't buy falling knives — require RSI >30)
- Track which Value Signals you acted on and what happened
- Add sector filter to avoid overconcentration

---

## Agent 9: Options Income

**Function:** `runOptionsIncomeAgent()` — line 6766
**Model:** None (Yahoo Finance real-time options) | **Cost:** $0
**DB name:** `options`

### What it does
Scans top 20 positions (by market value) for income opportunities:

1. **Covered Calls:** positions with 100+ shares → find 5-10% OTM calls, 30-45 DTE
2. **Cash Secured Puts:** find 5-15% OTM puts → buy cheaper or collect premium
3. **Bull Put Spreads:** SPY and QQQ → sell put 5% OTM, buy put 10% OTM

### Safety rules
- **Skips positions with earnings before expiration** (IV crush risk)
- Only shows options with bid > $0.10 (sufficient liquidity)
- Adjusts for market regime (bearish → more conservative)
- Calculates annualized returns for comparison

### Output per opportunity
- Strategy type (CC/CSP/BPS)
- Strike, premium, DTE
- Annualized return %
- Total yield (dividend + options)
- Cash needed (for CSPs)
- Max gain/loss (for spreads)
- Open interest and volume (liquidity check)

### Known issues
- **Weekend/holiday: Yahoo returns no options data** → agent reports 0 opportunities
- Only scans top 20 positions — smaller positions skipped
- Premium estimation for put selling in Value Signals uses rough vol proxy
- No Iron Condor strategy yet (requires both call and put spread analysis)

### Improvement ideas
- Add Iron Condors for low-vol environments (VIX <18)
- Add calendar spreads (sell near-term, buy far-term)
- Add Wheel strategy tracking (CSP → assignment → CC → repeat)
- Fetch IV rank (current IV vs 52-week range) for better timing
- Add minimum open interest filter (>50 for liquidity)
- Track options income generated over time (monthly P&L from premiums)
- Alert when IV percentile is in top 20% (best time to sell options)

---

## Shared Infrastructure

### D1 Tables

| Table | Purpose | Key |
|-------|---------|-----|
| `agent_insights` | All agent outputs | UNIQUE(agent_name, fecha, ticker) |
| `agent_memory` | Persistent state between runs | PRIMARY KEY(id) |
| `signal_tracking` | Trade signal postmortem | UNIQUE(original_fecha, ticker) |
| `gurufocus_cache` | GF Value, Score, rankings per ticker | PRIMARY KEY(ticker) |

### Helper Functions

| Function | Line | Purpose |
|----------|------|---------|
| `callAgentClaude()` | 5288 | Call Claude API with model param, JSON parsing |
| `storeInsights()` | 5337 | Upsert insights into D1 with null safety |
| `cacheMarketIndicators()` | 5416 | Yahoo 24 ETFs → agent_memory |
| `getMarketIndicators()` | 5468 | Read cached ETF data |
| `getAgentMemory()` | 5474 | Read from agent_memory table |
| `setAgentMemory()` | 5480 | Write to agent_memory table |
| `fetchGuruFocusSummary()` | 5487 | Fetch GF /stock/{sym}/summary |
| `cacheGuruFocusData()` | 5540 | Batch cache GF for all positions |
| `getGfData()` | 5568 | Read cached GF data for tickers |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agent-insights` | GET | List insights (params: agent, severity, ticker, days) |
| `/api/agent-insights` | DELETE | Delete stale insight by id |
| `/api/agent-run` | POST | Run all (background) or single agent (?agent=NAME) |

### Push Notifications
- Triggered after all agents complete
- Only sends if there are `critical` severity insights
- Shows top 3 critical insights in notification body
- Uses Web Push (VAPID) — requires browser permission

### GF API Usage
- Token: `GURUFOCUS_TOKEN` Cloudflare secret
- Plan: Premium Plus ($1,299/yr), 20,000 queries/mo
- Current usage: ~4,500/mo (85 portfolio + 120 watchlist + 85 insider = daily)
- Endpoints used: `/stock/{sym}/summary`, `/stock/{sym}/insider`
- NOT available: `/guru/newpicks`, `/guru/topstocks`, `/screener/stocks`
