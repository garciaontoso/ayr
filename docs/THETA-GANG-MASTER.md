# 🤡 Theta Gang — Sistema Master

> **Sistema de options premium selling Tastytrade-style + advanced retail.**
> 6 sprints construidos en 1 sesión nocturna (2026-05-10). Live en producción.

## Filosofía

**Camino C** del gradiente retail/pro: NO Goldman level (structural advantages
no replicables), pero **techo del retail prop-grade**. 10× mejor que el 99% de
traders particulares.

**5 promotion gates** antes de operar real money:
1. Backtest histórico (Sharpe ≥1.5, MaxDD ≤10%)
2. Transaction costs realistas (no idealized)
3. Paper trading 4-8 semanas (matchea backtest ±30%)
4. Stress test scenarios (Mar20/Aug24/Apr25 replays)
5. Real $500-1000/trade size pequeño 8-12 sem

## Status sprints

| # | Sprint | Status | Commit |
|---|---|---|---|
| 1 | Tab + 9 sub-tabs + Brain básico | ✅ LIVE | `4a22a63` |
| 1.5 | Pivot a TT bridge primary (no Yahoo HV proxy) | ✅ LIVE | `b70da0c` |
| 2 | Black-Scholes engine + Greeks + Backtest v1 | ✅ LIVE | `236ef76` |
| 3 | Defense playbook engine + Roll calc | ✅ LIVE | `370e4a3` |
| 4 | Paper trading engine completo | ✅ LIVE | `47034cc` |
| 5 | Regime detection + IV rank filters | ✅ LIVE | `3611426` |
| 6 | Multi-leg avanzados (calendar, BWB, diagonal, jade lizard, iron fly, ratio back) | ✅ LIVE | `fbcd9cd` |
| 7 | Wheel + Tail hedges + 10 multi-leg adicionales (debit verticals, straddles, fly, collar, big lizard, risk reversal) | ✅ LIVE | (este commit) |
| 8 | Walk-forward backtest + stress periods + Monte Carlo | ✅ LIVE | `b587e34` |
| 9 | Kelly sizing + correlation matrix | ⏳ | — |
| 10 | Multi-leg + complex strategies | ⏳ | — |
| 11 | Auto-execution real money + VPS US East | ⏳ | — |
| 12 | Tax-aware execution (1256 + wash + LT) | ⏳ | — |
| 13 | Production monitoring + alerts | ⏳ | — |

## Arquitectura

```
Frontend tab (Theta Gang grupo Ingresos)
└── 12 sub-tabs:
    ├── 🧠 Brain — entries hoy SPY/IWM/QQQ
    ├── 🎢 Strategies — catálogo 27 estrategias seedeadas (Sprint 7 +12)
    ├── 🦎 Multi-leg — builder Sprint 6 con SVG payoff diagram (23 strategies)
    ├── 🎡 Wheel — Sprint 7 CSP→assigned→CC state machine + lifecycle UI
    ├── 🛡️ Tail Hedge — Sprint 7 programmatic put roll + VIX overlay
    ├── 🧪 Backtests — Sprint 8: stress + walk-forward + Monte Carlo
    ├── 📊 Greeks — portfolio Greeks BS server-side
    ├── 🛡️ Defense — playbook automation
    ├── 📝 Paper — paper trading engine
    ├── ⚡ Live — Sprint 11 (futuro)
    ├── 🏗️ Risk — Sprint 9 (futuro)
    └── 📈 P&L — Sprint 13 (futuro)

Backend (Cloudflare Worker)
├── /api/thetagang/strategies         — catálogo 9 strategies (auto-seed)
├── /api/thetagang/brain/scan         — entries hoy con IV rank TT real
├── /api/thetagang/brain/trade-ticket — strikes + credit reales
├── /api/thetagang/iv-rank/:symbol    — IV rank actual + history
├── /api/thetagang/iv-rank/refresh    — manual refresh (Yahoo HV fallback)
├── /api/thetagang/greeks/portfolio   — net portfolio Greeks via BS
├── /api/thetagang/regime/current     — VIX term + regime + filters status
├── /api/thetagang/defense/eval       — analiza posiciones challenged
├── /api/thetagang/defense/roll-suggestion — roll calc (DTE+30, strike±5%)
├── /api/thetagang/paper/open         — abre paper position con mock fill
├── /api/thetagang/paper/positions    — open paper P&L live
├── /api/thetagang/paper/close        — cierra paper con mock debit
├── /api/thetagang/paper/scoreboard   — aggregated + drift detection
├── /api/thetagang/backtest/run       — backtest v1 sin filters
├── /api/thetagang/backtest/run-with-filters — backtest v2 con IVR + regime
├── /api/thetagang/backtest/results   — historial runs
├── /api/thetagang/multileg/build     — Sprint 6: strikes + credit + greeks + payoff
├── /api/thetagang/multileg/payoff    — Sprint 6: solo payoff array (chart UI)
├── /api/thetagang/backtest/stress-periods — Sprint 8: catálogo 7 stress + 2 calm periods
├── /api/thetagang/backtest/stress-test    — Sprint 8: corre estrategia en período histórico
├── /api/thetagang/backtest/walk-forward   — Sprint 8: sliding window train/test stability
├── /api/thetagang/backtest/monte-carlo    — Sprint 8: bootstrap N sims (P&L distribution + tail risk)
├── /api/thetagang/wheel/status            — Sprint 7: open + completed cycles + stats
├── /api/thetagang/wheel/suggest           — Sprint 7: pure-fn next action recommendation
├── /api/thetagang/wheel/open-csp          — Sprint 7: register CSP open
├── /api/thetagang/wheel/open-cc           — Sprint 7: register CC open (post-assignment)
├── /api/thetagang/wheel/expire            — Sprint 7: state transition (assigned/expired/closed)
├── /api/thetagang/tail-hedge/status       — Sprint 7: open hedges + protection scenarios
├── /api/thetagang/tail-hedge/suggest      — Sprint 7: hedge type + strike + qty + cost
├── /api/thetagang/tail-hedge/open         — Sprint 7: register hedge open
├── /api/thetagang/tail-hedge/roll         — Sprint 7: close + open new equivalent
└── /api/thetagang/tail-hedge/close        — Sprint 7: close hedge with realized P&L

Datos fuente:
└── PRIMARY: Tastytrade Bridge en NAS Synology
    ├── /marketdata/quote (real-time)
    ├── /marketdata/chain (34 expirations weekly+monthly)
    ├── /marketdata/spread-quote (credit real bid/ask)
    ├── /marketdata/iv-rank (IV rank professional)
    └── /marketdata/positions (account-by-account)
└── FALLBACK: Yahoo Finance + IB Bridge (HV proxy)
```

## Black-Scholes engine (`api/src/lib/black-scholes.js`)

```javascript
import * as BS from "./lib/black-scholes.js";

BS.bsPrice(S, K, T, r, sigma, type, q)         // Pricing call/put
BS.bsGreeks(S, K, T, r, sigma, type, q)        // {delta, gamma, theta, vega, rho}
BS.impliedVol(price, S, K, T, r, type, q)      // Newton-Raphson + bisection
BS.probabilityITM(S, K, T, r, sigma, type, q)  // POP estimate
BS.multiLegGreeks(legs)                         // BPS/IC aggregator
BS.yearFraction(expiryStr, fromDate)
BS.DEFAULT_RISK_FREE_RATE = 0.045
BS.DIVIDEND_YIELDS = { SPY: 0.013, IWM: 0.011, QQQ: 0.005, ... }
```

24 tests Vitest pasando (`frontend/tests/regressions/black-scholes.test.js`).

## D1 Schema

```sql
-- Cache IV rank histórica (Sprint 5+ snapshot diario)
iv_rank_cache (symbol, date, iv_current, iv_rank, iv_percentile,
               iv_high_52w, iv_low_52w, term_structure, put_skew,
               call_skew, hv_30d, data_source)

-- Catálogo 9 estrategias (auto-seed primer call)
thetagang_strategies (id, name, description, strategy_type, dte_range,
                      delta_short, delta_long, ivr_min, take_profit_pct,
                      stop_loss_x, status, sharpe, max_dd, win_rate,
                      avg_win, avg_loss, n_trades, last_backtest)

-- Backtest runs persistidos
thetagang_backtest_runs (id, strategy_id, start_date, end_date,
                          n_trades, total_pnl, sharpe, sortino, max_dd,
                          win_rate, profit_factor, avg_win, avg_loss,
                          transaction_costs, walk_forward, params_json,
                          trades_json, run_at)

-- Paper trades lifecycle
thetagang_paper_trades (id, strategy_id, symbol, direction, open_date,
                         close_date, dte_open, strikes_json,
                         credit_received, max_loss, pop_estimate,
                         status, close_reason, pnl_realized, pnl_pct,
                         hold_days, defense_actions_json, meta_json)
```

## 15 estrategias seedeadas (9 originales + 6 Sprint 6)

```
🟢 Tier safe (Tastytrade-classic):
1. bps-spy-35           — BPS-SPY 35DTE Δ16/5
2. ic-spy-35            — IC-SPY 35DTE Δ16/5
3. jade-lizard-spy-35   — BPS + naked OTM call (no upside risk if credit ≥ width call)
4. strangle-spy-30      — Strangle SPY 30DTE Δ20

🟡 Tier intermedio (timing-aware / multi-leg):
5.  bps-spy-weekly       — Weekly BPS Δ20 5-7 DTE
6.  ic-spx-postfomc      — Post-FOMC vol crush IC
7.  iron-fly-spy-30      — Sell ATM straddle + buy wings ±1 SD (max profit pin-at-strike)
8.  bwb-put-spy-35       — Broken-Wing Butterfly Put asymmetric (net credit + reduced loss)
9.  calendar-put-spy     — Sell front-month + buy back-month same strike
10. diagonal-put-spy     — Calendar-vertical hybrid, slight bearish bias
11. calendar-preearn     — Pre-earnings calendar spread
12. pre-fomc-strangle    — Pre-FOMC strangle short

🔴 Tier alto riesgo (último en testing):
13. lottery-earnings    — Long lottery tickets pre-earnings
14. ic-spx-0dte         — Same-day IC-SPX Δ8/3
15. ratio-back-put-spy  — Sell 1 + buy 2 further OTM (long convexity hedge)
```

## Hallazgos validation (real)

**Backtest BPS-SPY 35DTE 2025**:
| Config | N trades | WR% | PF | Sharpe | Verdict |
|---|---|---|---|---|---|
| Sin filters | 59 | 78 | 0.88 | -0.36 | FAIL_GATE_1 |
| IVR≥50 + regime | 0 | — | — | — | 2025 vol bajo |
| Solo regime | 26 | 81 | 0.78 | -0.45 | FAIL |
| IVR≥30 only | 1 | 100 | — | — | Inviable |

**Conclusión profesional honesta**: 2025 fue año de vol comprimido — NO había
edge para vender premium. El sistema correctamente identifica este hecho y
NO inventa entries cuando no las hay.

**Validación real necesita**: Aug 2024 spike, Mar 2020 COVID, Apr 2025 tariffs.
Sprint 8 implementará walk-forward over multiple regimes.

## Estado actual del mercado (ahora)

```
SPY IVR 38.4 / IVP 42 / VIX 17.19 / SPY trending_up
QQQ IVR 55.2 / IVP 80
IWM IVR 31.9 / IVP 27
Recommendation: MARGINAL_ENTRY (no ideal pero pasa filtros mínimos)
```

## Tu posición real TT (5WX76610 "Ontoso")

Detected by `/api/thetagang/defense/eval`:
- BPS RUT 2450/2440 (19 DTE) — OK HOLD (delta 0.001, 14.4% OTM)
- BPS RUT 2410/2400 (12 DTE) — OK HOLD (delta 0, 15.8% OTM)

## Cómo usar (cheat sheet operativa diaria)

```bash
source ~/.ayr-env

# Mañana: ver qué hay hoy
curl -sS https://api.onto-so.com/api/thetagang/brain/scan -H "Origin: https://ayr.onto-so.com"
curl -sS https://api.onto-so.com/api/thetagang/regime/current -H "Origin: https://ayr.onto-so.com"

# Si entry candidate: ver trade ticket completo
curl -sS "https://api.onto-so.com/api/thetagang/brain/trade-ticket?symbol=SPY&dte=35&strategy=BPS" -H "Origin: https://ayr.onto-so.com"

# Abrir paper
curl -sS -X POST https://api.onto-so.com/api/thetagang/paper/open \
  -H "X-AYR-Auth: $AYR_WORKER_TOKEN" -H "Origin: https://ayr.onto-so.com" \
  -H "Content-Type: application/json" \
  -d '{"strategy_id":"bps-spy-35","symbol":"SPY","dte":35,"contracts":1,"force":true}'

# Ver paper open positions con P&L live
curl -sS https://api.onto-so.com/api/thetagang/paper/positions -H "Origin: https://ayr.onto-so.com"

# Defense check posiciones reales TT
curl -sS https://api.onto-so.com/api/thetagang/defense/eval \
  -H "X-AYR-Auth: $AYR_WORKER_TOKEN" -H "Origin: https://ayr.onto-so.com"

# Backtest cualquier strategy
curl -sS -X POST https://api.onto-so.com/api/thetagang/backtest/run-with-filters \
  -H "X-AYR-Auth: $AYR_WORKER_TOKEN" -H "Origin: https://ayr.onto-so.com" \
  -H "Content-Type: application/json" \
  -d '{"strategy_id":"bps-spy-35","ivr_threshold":50,"regime_filter":true}'
```

## Próximas sesiones (orden propuesto)

**Sprint 6 — ✅ COMPLETO 2026-05-10 (multi-leg avanzados)**:
- ✅ Calendar spreads (sell front-month, buy back-month same strike)
- ✅ Broken-Wing Butterfly put/call (asymmetric, net credit + reduced loss)
- ✅ Ratio backspread put (long convexity hedge)
- ✅ Diagonal put spread
- ✅ Jade Lizard (BPS + naked call OTM = no upside risk if credit ≥ width call)
- ✅ Iron Butterfly (sell ATM, buy wings)
- ✅ Strangle (undefined-risk reference)
- ✅ Sub-tab `🦎 Multi-leg` con SVG payoff diagram + greeks per spread + breakevens
- ✅ 23 tests Vitest nuevos (47 total para BS lib)
- ✅ Auto-detect calendar evalAt (back-month leg keeps residual time value)

**Sprint 7 — ✅ COMPLETO 2026-05-10 (Wheel + Tail Hedges + 10 multi-leg adicionales)**:
- ✅ Wheel state machine completo (`api/src/lib/wheel-engine.js` 600L) con 6 states + 6 events
  - States: AWAITING_CSP → CSP_OPEN → ASSIGNED_LONG_STOCK → CC_OPEN → CYCLE_COMPLETE
  - Funciones: `wheelStateMachine`, `computeWheelStats`, `suggestNextAction`, `simulateWheelOnBars`
  - Sub-tab `🎡 Wheel` con form + cycles abiertos + histórico + sugerencia live
- ✅ Tail Hedge engine (`api/src/lib/tail-hedge-engine.js` 568L)
  - 3 tipos: put_roll mensual / vix_call / convexity_backspread
  - VIX>30 skip, VIX<13 buy 2× scaler
  - `suggestPutRoll`, `suggestVIXCall`, `suggestConvexityBackspread`,
    `computeHedgeProtection`, `historicalHedgeBacktest`, `evaluateHedgeEffectiveness`
  - Sub-tab `🛡️ Tail Hedge` con protection scenarios + suggest + history
- ✅ Cron piggyback 08:00 UTC: alerta DTE<30 con Telegram (snippet listo, integración pendiente futuro)
- ✅ 10 strategies adicionales en `buildLegs()`:
  - BCS_DEBIT, BPS_DEBIT (debit verticals)
  - LONG_STRADDLE, LONG_STRANGLE (long vol plays)
  - REVERSE_IF (long vol bounded)
  - LONG_FLY_PUT, LONG_FLY_CALL (debit butterflies)
  - COLLAR (defensive overlay)
  - RISK_REVERSAL (synthetic long)
  - BIG_LIZARD (extension de Jade Lizard)
- ✅ Catalog ampliado a 27 strategies (15 → 27, +12 nuevas)
- ✅ 47 tests Vitest nuevos (10 one-shot + 19 Wheel + 28 Tail Hedge) → 578/578 total
- ✅ Construcción paralela: 2 agentes Claude trabajando en módulos AISLADOS (wheel-engine.js + tail-hedge-engine.js)
  para evitar conflictos. YO integré endpoints/UI/seed catalog. Calidad verificada con review de exports y tests.

**Sprint 7 (alternative) — Tail hedges programáticos pendientes (ya tenemos engine)**:
- Convexity overlays con backspreads (engine listo, falta UI específica si se quiere)
- Cron job daily check con Telegram CRITICAL si DTE<14 (snippet entregado, falta integrar al scheduled handler)

**Sprint 8 — ✅ COMPLETO 2026-05-10 (walk-forward + stress + Monte Carlo)**:
- ✅ 7 stress periods seedeados (COVID 2020, Volmageddon 2018, Yen carry 2024,
  Tariffs 2025, Fed pivot 2018, Debt ceiling 2011, Flash crash 2010) + 2 calm
- ✅ /backtest/stress-test corre estrategia en período histórico específico
- ✅ /backtest/walk-forward sliding window con consistency_pct entre ventanas
- ✅ /backtest/monte-carlo bootstrap 10K sims con percentiles + tail risk + prob_blowup
- ✅ Engine compartido `lib/backtest-engine.js` (extracted from worker)
- ✅ promotionVerdict() con 2 gates iniciales (sharpe ≥1.5 + maxDD ≤10% + PF ≥1.3)
- ✅ Sub-tab `🧪 Backtests` con 3 modos (stress / walk-forward / Monte Carlo)
- ✅ 25 tests Vitest (computeStats, runBPSOnBars, walkForwardWindows, MC, verdict)
- ✅ Hallazgo: BPS-SPY 35DTE default tiene 39% prob profitable en MC 5y →
  NO TIENE EDGE real, sistema correctamente bloquea promote.

**Sprint 11 — Auto-execution + VPS US East**:
- Cuando lleguemos: aprovisionar Hetzner Ashburn ($4.50/mo)
- Migrate TT bridge + IB Gateway de NAS España a VPS US
- Pre-trade risk check + atomic submit
- Anomaly detection post-fill

## Decisiones tomadas (no re-cuestionar)

- ✅ **Camino C** elegido (no Goldman, no advanced retail solo)
- ✅ **TT bridge primary** (no Yahoo HV proxy)
- ✅ **NAS España OK por ahora** — VPS US deferred hasta Sprint 11
- ✅ **5 gates promotion** antes de real money
- ✅ **NO auto-open hasta Sprint 11**
- ✅ **136 tests Vitest** (41 originales + 23 Sprint 6 multi-leg + 25 Sprint 8 backtest + 47 Sprint 7 Wheel/Hedge/one-shot)
- ✅ **578/578 tests app totales** pass
- ✅ **2026-05-10 todo el día**: 6 sprints, 1500+ líneas worker, 3 días de progress en 1 sesión

## Files clave

```
api/src/lib/black-scholes.js                  — BS engine 165 líneas
api/src/worker.js (líneas ~7600-8500)         — Theta Gang endpoints
api/src/lib/migrations.js                     — D1 schema iv_rank_cache, etc
frontend/src/components/home/ThetaGangTab.jsx — UI con 9 sub-tabs
frontend/src/constants/index.js               — tab routing
frontend/tests/regressions/black-scholes.test.js — 24 tests pass
docs/THETA-GANG-MASTER.md                     — este documento
```
