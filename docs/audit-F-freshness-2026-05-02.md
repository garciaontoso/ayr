# Audit F — Data Freshness across all 49 tabs (2026-05-02)

**Today:** 2026-05-02 (Saturday — markets closed)
**Last weekday:** 2026-05-01 (Friday)
**Database:** D1 `aar-finanzas` (`d9dc97c1-1ea5-4e05-b637-89e52229d099`)
**Total tables audited:** 91 (excludes `_cf_KV`, `sqlite_sequence`)

---

## 1. `/api/health` and `/api/data-status` snapshot

`GET https://api.onto-so.com/api/health` →
```json
{"status":"ok","patrimonio_rows":54}
```
**Verdict:** trivial. Only counts patrimonio rows. Does **not** report freshness for the 90+ data tables. Should be expanded.

`GET https://api.onto-so.com/api/data-status` →
```json
{
  "patrimonio":{"lastUpdate":"2026-04-24"},
  "dividendos":{"lastUpdate":"2026-04-30","count":3748},
  "gastos":{"lastUpdate":"2026-05-01","count":6384},
  "trades":{"lastUpdate":"2026-05-01","count":12924},
  "nlv":{"lastUpdate":"2026-04-28"},
  "alerts":{"lastUpdate":"2026-05-01 18:42:53"},
  "positions":{"lastUpdate":"2026-05-01 21:43:01","count":85}
}
```
**Verdict:** only 7 tables exposed. Misses 80+ tables that frontend tabs depend on (agents, earnings, options, fund holdings, scanner, brain, etc).

---

## 2. Master freshness table (sorted by staleness)

Legend: `GREEN` ≤ thresh / `YELLOW` 1–2× thresh / `RED` >2× thresh / `BLACK` empty
Threshold per category in section 3.

| # | Table | Rows | Last update | Days stale | Verdict | Used by tab |
|---|-------|------|-------------|------------|---------|-------------|
| 1 | **price_cache** (latest) | 12 | 2026-05-01 22:21 | 0.3 | GREEN | Portfolio, Watchlist, IB header |
| 2 | **fundamentals** | 348 | 2026-05-01 22:14 | 0.3 | GREEN | Portfolio, FAST, Quality+Safety |
| 3 | **peer_ratios_cache** | 164 | 2026-05-01 22:14 | 0.3 | GREEN | PeerCompare |
| 4 | **fund_holdings** | 1,710 | 2026-05-01 22:17 | 0.3 | GREEN | SmartMoney |
| 5 | **gastos** | 6,384 | 2026-05-01 | 1 | GREEN | Gastos, Presupuesto |
| 6 | **cost_basis** | 12,924 | 2026-05-01 (created 20:25) | 1 | GREEN | Trades, Tax |
| 7 | **alerts** | 68 | 2026-05-01 18:42 | 0.4 | GREEN | Alertas |
| 8 | **earnings_documents** | 7,403 | 2026-05-01 20:51 | 0.4 | GREEN | EarningsArchive |
| 9 | **app_config (daily_briefing)** | 23 | 2026-05-01 22:01 | 0.3 | GREEN | DailyBriefing |
| 10 | **positions** | 85 | 2026-05-01 22:18 | 0.3 | GREEN | Portfolio, IB header |
| 11 | **telegram_log** | 468 | 2026-05-01 22:00 | 0.3 | GREEN | (background) |
| 12 | **dividendos** | 3,748 | 2026-04-30 | 2 | GREEN | Dividendos |
| 13 | **dividend_scanner_cache** | 154 | 2026-04-30 19:08 | 1.1 | GREEN | DividendScanner |
| 14 | **auto_close_alerts** | 3 | 2026-04-30 18:00 | 1.2 | GREEN | AutoTrading (Auto-Close tab) |
| 15 | **auto_strategies** | 8 | 2026-04-30 13:02 | 1.4 | GREEN | AutoTrading |
| 16 | **open_trades** | 4 | 2026-04-30 17:58 | 1.2 | GREEN | OpenOptions, AutoTrading |
| 17 | **brain_decisions** | 4 | 2026-04-30 19:00 | 1.1 | GREEN | AutoTrading (Brain) |
| 18 | **analytics_cache** | 9 | 2026-04-30 18:49 | 1.2 | GREEN | Analytics |
| 19 | **nlv_history** | 25 | 2026-04-28 | 4 | YELLOW | DailyBriefing, Patrimonio |
| 20 | **transferencias** | 156 | 2026-04-27 | 5 | GREEN (≤7d) | Transferencias |
| 21 | **scanner_filters** | 1 | 2026-04-26 21:35 | 5.1 | GREEN | Scanner |
| 22 | **patrimonio** | 54 | 2026-04-24 | 8 | YELLOW | Patrimonio |
| 23 | **agent_insights** (latest agent) | 1,713 | 2026-04-19 13:06 | 13 | RED | Agentes |
| 24 | **agent_memory (last_run)** | latest=2026-04-19 13:14 | — | 13 | RED | All agent tabs |
| 25 | **macro_events** | 28 | 2026-05-07 (future) / loaded ~2026-04 | ~12 | YELLOW | Macro |
| 26 | **gurufocus_cache** | 36 | 2026-04-18 14:42 | 14 | YELLOW | FAST, Quality |
| 27 | **signal_tracking** | 29 | 2026-04-18 | 14 | RED | AlertTrackRecord |
| 28 | **research_investigations** | 8 | 2026-04-18 17:36 | 14 | RED | Research |
| 29 | **ticker_notebook** | 2 | 2026-04-18 | 14 | RED | Research |
| 30 | **decision_journal** | 2 | 2026-04-17 | 15 | RED | DecisionJournal |
| 31 | **alert_rules** | 4 | 2026-04-17 22:51 | 14 | YELLOW | AlertRules |
| 32 | **company_narratives** | 144 | 2026-04-17 11:20 | 15 | RED | (any tab using narratives) |
| 33 | **news_items** | 614 | 2026-04-17T16:55Z | 15 | RED | News |
| 34 | **dividendos** by month — last paid Apr 30 | (see #12) | — | 2 | GREEN | — |
| 35 | **recommendations_log** | 132 | 2026-04-18T15:06Z | 14 | RED | (Oracle output history) |
| 36 | **cantera** | 242 | 2026-04-18 11:53 | 14 | YELLOW | Cantera |
| 37 | **earnings_calendar** | 13 | 2026-04-07 16:41 | 25 | YELLOW (estim window) | Earnings |
| 38 | **earnings_transcripts** | 122 | 2026-04-07 17:52 | 25 | YELLOW | Transcript |
| 39 | **quality_safety_scores** | 77 | 2026-04-07 | 25 | YELLOW | Q+S column |
| 40 | **ai_analysis** | 3 | 2026-04-06 | 26 | YELLOW | (legacy) |
| 41 | **fmp_financials_cache** | 77 | 2026-04-07 12:27 | 25 | YELLOW | FAST, Big5 |
| 42 | **alert_outcomes** | 42 | 2026-04-09 02:50 | 23 | YELLOW | AlertTrackRecord |
| 43 | **options_import_issues** | 52 | 2026-04-09 03:46 | 23 | INFO | (logging) |
| 44 | **youtube_videos** | 120 | 2026-04-08T08:12Z | 24 | RED | YouTube |
| 45 | **youtube_channels (last_scan_at)** | 4 | 2026-04-08T08:17Z | 24 | RED | YouTube |
| 46 | **fund_alerts** | 59 | 2026-04-08 04:58 | 24 | YELLOW | SmartMoney alerts |
| 47 | **gasto_rules** | 74 | 2026-04-02 09:15 | 30 | YELLOW | Gastos categorizer |
| 48 | **presupuesto_history** | 13 | 2026-04-02 07:49 | 30 | INFO | Presupuesto |
| 49 | **push_subscriptions** | 2 | 2026-04-02 21:22 | 30 | INFO | (devices) |
| 50 | **margin_interest** | 5 | 2026-02 | ~75 | RED | (cron monthly) |
| 51 | **cash_balances** | 30 | 2026-03-20 | 43 | RED | (Flex import) |
| 52 | **trades** (legacy) | 131 | 2026-03-26 | 37 | RED | (legacy table — replaced by cost_basis) |
| 53 | **holdings** (legacy) | 91 | 2026-03-16 11:43 | 47 | RED | (legacy — replaced by positions) |
| 54 | **config** | 1 | 2026-03-16 09:49 | 47 | INFO | (boot) |
| 55 | **deep_dividend_analysis** | 94 | epoch 1776783670 = 2026-04-21 | 11 | YELLOW | DeepDividend |
| 56 | **deep_extractions** | 5 | epoch 1775713448 = 2026-04-09 | 23 | YELLOW | DeepDividend |

### Static / reference tables (no freshness signal expected)
event_sector_mapping (15), gasto_categorias (22), superinvestors (16), pl_anual (3), fire_proyecciones (18), fire_tracking (36), gastos_mensuales (38), ingresos (48), presupuesto (63), revenue_segmentation (68), oracle_verdicts (305), youtube_video_companies (102), library_items (30), theses (46), div_por_anio (7), div_por_mes (64), cartera (81), auto_backtest_runs (12), agent_predictions (861, evaluated_at all NULL).

---

## 3. Data-class freshness verdict (mapped to tabs)

| Class | Threshold | Tables in scope | Verdict | Notes |
|-------|-----------|-----------------|---------|-------|
| **Pricing** | ≤ 24h (intraday) | price_cache, fundamentals, peer_ratios_cache, positions | GREEN | All updated Today (Sat 22:14–22:21 UTC = 1m before audit). Markets closed but live=on-demand cache stayed warm. |
| **Quality** | ≤ 30d | quality_safety_scores, fmp_financials_cache, gurufocus_cache | YELLOW | All ~25–30d behind. quality_safety_scores cron stopped 2026-04-07. |
| **Earnings** | ≤ 90d | earnings_documents, earnings_calendar, earnings_results, earnings_transcripts | MIXED | Documents fresh (Today). Calendar/results/transcripts last sync 2026-04-07 (25d, fine for 90d band but earnings season week starts 2026-05-05 → calendar may not cover all reporters). |
| **News** | ≤ 7d | news_items, ia_narrative_alerts | RED | news_items last 2026-04-17 (15d ago). ia_narrative_alerts empty. |
| **Agents (LLM)** | ≤ 1d (cron) | agent_insights, agent_memory.last_run, ai_analysis, weekly_digests, daily_briefings (table), recommendations_log | RED | All 13–15d stale. Cron LLM intentionally disabled per `wrangler.toml` (cost saving). DailyBriefing now lives in `app_config` (Today fresh) — confusion: there are two stores. |
| **Trades / IB Flex** | ≤ 7d (mon-fri cron) | cost_basis, dividendos, transferencias | GREEN | cron CF `30 7 * * 1-5` ran 2026-05-01. |
| **Account NAV** | ≤ 1 trading-day | nlv_history | YELLOW | Last 2026-04-28 (Tue). Missing 2026-04-29, 30, 5-01. **IB Bridge live should write daily** — bridge maybe never persists snapshot to D1. |
| **Cantera / Watchlist** | ≤ 14d | cantera, dividend_scanner_cache | GREEN/YELLOW | Cantera 14d (right at edge). Scanner 1d. |
| **Fund 13F** | quarterly + filing window days 15-17/month | fund_holdings, fund_alerts | GREEN | fund_holdings refreshed Today (sync-funds.sh ran). fund_alerts last 2026-04-08 — alerts fire only on quarter delta detection, so OK if no new filings. |
| **Macro** | ≤ 7d | macro_events | YELLOW | Loaded 2026-04-08 ish; events go through 2026-05-07. Need refresh after that date. |
| **Auto Trading runtime** | ≤ 1d | auto_strategies, brain_decisions, brain_state, auto_paper_positions, scanner_runs, auto_signals, fishing_orders | RED for several | brain_state empty, scanner_runs/snapshots empty, auto_signals empty, fishing_orders empty, auto_paper_positions empty. **Critical: Auto Trading tab is half-empty in production**. |
| **Earnings reactions** | event-driven | earnings_results, material_events_8k, guidance_tracking, insider_clusters | EMPTY | All zero rows. Either never populated or cron never ran. |

---

## 4. Top 10 stale tabs (user-facing)

Each row: tab → primary table → days stale → verdict.

1. **Agentes** → agent_insights, agent_memory → 13d → RED. Cron LLM intentionally OFF (per wrangler.toml). User must re-enable or run on-demand.
2. **News** → news_items → 15d → RED. No cron. UI shows old headlines.
3. **YouTube** → youtube_videos, youtube_channels → 24d → RED. Last scan 2026-04-08.
4. **Research** → research_investigations, ticker_notebook → 14d → RED.
5. **DecisionJournal** → decision_journal → 15d → RED (only 2 entries — ok if user-driven).
6. **AlertTrackRecord** → signal_tracking, alert_outcomes → 14–23d → RED. Cron computes 7/30/90d returns; not running.
7. **AutoTrading (Brain/Pescando/Paper)** → brain_state, scanner_runs, auto_signals, auto_paper_positions, fishing_orders → all empty/0 → BLACK.
8. **Earnings** → earnings_calendar 25d, earnings_results 0 rows → YELLOW/EMPTY. Earnings season starts 2026-05-05 → calendar may miss new reporters.
9. **DailyBriefing** → daily_briefings table 0 rows; data lives in `app_config` keys → YELLOW (confusing duplication; UI may read wrong source).
10. **Patrimonio** → patrimonio 8d, nlv_history 4d → YELLOW. Monthly snapshot expected.

---

## 5. Empty tables (deployed but never populated)

These tables exist in production schema and have **0 rows** despite being referenced by code:

| Table | Likely cause | Impact |
|-------|--------------|--------|
| **scanner_runs** | Scanner tab never executed in prod | Scanner tab shows no historical runs |
| **scanner_snapshots** | Same | Detail drill-down empty |
| **scanner_alerts** | Same | No conviction alerts |
| **auto_signals** | Brain Lite never produced signals | Auto Trading "Pescando" tab empty |
| **auto_paper_positions** | Paper trading never opened position | "Paper" sub-tab empty |
| **fishing_orders** | Daily fishing cron never fired | "🎣 Pescando" tab empty in PROD |
| **brain_state** | brain_decisions writes ts but state row never set | Stateful resume broken |
| **earnings_results** | No EPS-actual ingest cron | Beat/miss displays "—" |
| **material_events_8k** | 8-K parser cron disabled | Material events tab empty |
| **guidance_tracking** | Guidance extractor never ran | Guidance tracker empty |
| **insider_clusters** | Insider clustering job never ran | Insider summary missing |
| **ia_narrative_alerts** | Narrative LLM cron disabled | Narrative push silent |
| **daily_briefings** (table) | Briefings cached only in app_config | Possible UI inconsistency |
| **library_notes** | User-driven, no entries | OK (manual) |
| **prompt_versions** | Versioning never used | OK (admin tool) |
| **sector_deep_dives** | Cron never ran | Sector overview missing |
| **agent_predictions.evaluated_at** | All 861 rows have NULL evaluated_at | Prediction outcome backfill never executed |

---

## 6. Cron / pipeline status (inferred from data freshness)

| Cron / job | Last run | Status |
|------------|----------|--------|
| **CF Worker cron `30 7 * * 1-5`** (Flex sync) | 2026-05-01 21:43 (telegram_log shows `flex_dividends`) | RUNNING (cost_basis, dividendos, telegram all stamped Today) |
| **price_cache live refresh** | Today 22:21 UTC | RUNNING (on-demand from frontend, cached) |
| **fundamentals refresh** | Today (79 rows updated) | RUNNING |
| **scanner cron** | NEVER | OFF |
| **agent pipeline (11 LLM agents)** | 2026-04-19 13:14 (last `agent_last_run_earnings`) | OFF (intentionally — cost saving) |
| **daily_briefings cron** | 2026-05-01 22:01 (in app_config, not in `daily_briefings` table) | RUNNING but writes to wrong store |
| **weekly_digests** | 2026-04-27 | LAST RAN; next 2026-05-04 |
| **dividend_scanner_cache cron** | 2026-04-30 19:08 | RUNNING |
| **fund 13F refresh** (`scripts/sync-funds.sh` Mac cron) | 2026-05-01 22:17 | RUNNING (Today) |
| **NLV snapshot** (IB bridge → D1) | 2026-04-28 | STOPPED 4d ago (IB bridge weekend gap?) |
| **YouTube channel scan** | 2026-04-08 | OFF |
| **research_auto_scan** | 2026-04-19 14:31 | OFF |
| **macro_events refresh** | 2026-04-08 (loaded once) | NO RECURRING JOB |
| **8-K material events** | NEVER | OFF |
| **guidance_tracking** | NEVER | OFF |
| **insider_clusters** | NEVER | OFF |

---

## 7. Recommendations (no automatic action — informational only)

### Priority 1 (data invisible to user)
- **NLV gap 2026-04-29 → 2026-05-01** (3 trading days). IB Bridge is live (per CLAUDE.md v4.2). Inspect `ib-bridge` container logs and the worker endpoint that writes `nlv_history`. Manual fix: `POST /api/ib-flex-import` should backfill, or insert from current bridge `/api/ib-bridge/summary` snapshot.
- **earnings_calendar last refresh 2026-04-07** but earnings season starts 2026-05-05 (4 portfolio names report Mon). Manual: `POST /api/earnings/refresh` (or whatever trigger exists) before Mon market open.
- **news_items 15d stale**. If the News tab is in production, schedule a weekly RSS pull or hide the tab.

### Priority 2 (Auto Trading half-empty)
- 6 tables empty (`scanner_runs`, `auto_signals`, `auto_paper_positions`, `fishing_orders`, `brain_state`, `material_events_8k`). The user reportedly built these in v4.3 (per MEMORY) but the runtime crons never fire. Decision needed: enable scanner+brain crons (cost?), or document the manual-only mode in tab UI.

### Priority 3 (LLM agents intentionally off)
- All 11 agents stopped 2026-04-19 (cost saving per `wrangler.toml` comment). UI should show a "last run" badge so the user does not interpret stale insights as current. Currently `agent_memory.id='agent_last_run_*'` exists — surface it in `/api/data-status`.

### Priority 4 (cleanup / hygiene)
- `holdings` (legacy, 47d stale, 91 rows) and `trades` (legacy, 37d stale, 131 rows) appear obsolete vs `positions` and `cost_basis`. Verify and drop or archive.
- `daily_briefings` table has 0 rows but `app_config` keys `daily_briefing_<date>` carry the data. Pick one — either move data to the table, or drop the table from schema.
- `agent_predictions` (861 rows, all `evaluated_at = NULL`) — outcome-evaluation cron never ran. Either kill the table or run the backfill.
- `quality_safety_scores` last 2026-04-07 (25d). Cron `quality-safety-cantera` stopped same day. If user still trusts the Q+S column, refresh; otherwise note it on the column header.

### Priority 5 (improve `/api/health` itself)
The current `/api/health` returns only `patrimonio_rows`. Recommend extending it to include max(updated_at) for every table referenced by a tab, with a green/yellow/red verdict pre-computed server-side. Frontend `🩺 Health Check` panel can then render once instead of fetching 30 endpoints. Suggested shape:

```jsonc
{
  "status": "ok",
  "updated_at": "2026-05-02T22:30:00Z",
  "groups": {
    "pricing":  {"verdict":"green", "items":[{"table":"price_cache","last":"...","days":0.3}, ...]},
    "trades":   {"verdict":"green", ...},
    "agents":   {"verdict":"red",   ...},
    "earnings": {"verdict":"yellow",...},
    "auto":     {"verdict":"red",   "items_empty":["scanner_runs","auto_signals","fishing_orders","brain_state","auto_paper_positions"]}
  }
}
```

---

## 8. Tables not yet matched to a tab (orphans?)
`event_sector_mapping`, `revenue_segmentation`, `pl_anual`, `prompt_versions`, `holdings`, `trades` (legacy), `cartera`, `presupuesto_history`, `auto_backtest_runs`, `oracle_verdicts`, `agent_predictions`, `youtube_video_companies` — used internally by other endpoints. If unused after audit, consider archiving to free schema cognitive load.

---

## Appendix A — Methodology
- Production D1 queried via `npx wrangler d1 execute aar-finanzas --remote --json`.
- 91 tables checked. Each query: `SELECT COUNT(*), MAX(<timestamp_col>)`.
- Staleness measured against 2026-05-02 22:30 UTC.
- "Days stale" = (now − last) / 86400. Fractions for sub-day.
- Threshold model:
  - Pricing/live: GREEN ≤24h, YELLOW ≤72h, RED >72h
  - Quality/finstmt: GREEN ≤30d, YELLOW ≤60d, RED >60d
  - Earnings: GREEN ≤90d, YELLOW ≤180d, RED >180d
  - News: GREEN ≤7d, YELLOW ≤14d, RED >14d
  - Agents/LLM: GREEN ≤2d, YELLOW ≤7d, RED >7d
- No writes. Read-only audit.

## Appendix B — Files referenced
- API source: `/Users/ricardogarciaontoso/IA/AyR/api/src/worker.js` (28,470 lines)
- `/api/health`: lines 10910-10913 (trivial — only patrimonio count)
- `/api/data-status`: lines 13510-13536 (7 tables only)
- Wrangler config: `/Users/ricardogarciaontoso/IA/AyR/api/wrangler.toml` (cron `30 7 * * 1-5` active; LLM crons commented out)
- Frontend tabs: `/Users/ricardogarciaontoso/IA/AyR/frontend/src/components/home/` (54 files), `/Users/ricardogarciaontoso/IA/AyR/frontend/src/components/analysis/` (31 files)
