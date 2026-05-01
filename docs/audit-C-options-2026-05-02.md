# Audit C · Options Tab Reconciliation · 2026-05-02

**Scope:** Reconcile the four parallel option-tracking surfaces:

| System                          | Source                          | Purpose                                |
| ------------------------------- | ------------------------------- | -------------------------------------- |
| `open_trades`                   | Auto-sync TT / IB / Auto Trading | Currently-open spreads (manual + auto) |
| `cost_basis` (`tipo='OPTION'`) | IB Flex import (raw fills)       | Tax / income source-of-truth           |
| `options_trades`                | Manual ledger via `OpcionesTab`  | "Income por opciones" reporting       |
| `/api/options/open-portfolio`   | Aggregator over the three above  | "Open Options" tab UI                  |

Tools used: D1 SQL (remote), `/api/options/open-portfolio` HTTP probe, source review of `worker.js`.

---

## Executive Summary

| Finding | Severity | Auto-fixed |
|---------|----------|-----------|
| F-1 · TT live legs duplicated as separate "OPT" positions in `open-portfolio` | **CRITICAL** | NO |
| F-2 · TT live treats long-leg debits as credits (sign error) → $25K phantom credit | **CRITICAL** | NO |
| F-3 · 14 SPX/NVDA cost_basis OPT rows with broken OCC parser (`opt_strike=0`) → $-83,157 distorts cost_basis income | **HIGH** | NO (manual review) |
| F-4 · 1 fully-empty filler row id=5359 LUV | LOW | YES (deleted) |
| F-5 · 62 options_trades CLOSED but cost_basis still has open net contracts | MEDIUM | NO |
| F-6 · 1 column-slip in options_trades id=1137 (PYPL): date in `status`, credit in `result_date` | MEDIUM | NO |
| F-7 · Eurex contract `P HMI2 20260619 1500 M` parsed as ticker `P` strike $1500 | MEDIUM | NO |
| F-8 · 3 RUTW BPS in `open_trades` (auto_tastytrade) NOT mirrored in cost_basis | INFO | NO (by design) |
| F-9 · open_trades 2026-05-01 BPS expired today, settlement unknown | INFO | NO (await TT bridge) |
| F-10 · 34 net-zero closed legs correctly filtered from `/api/options/open-portfolio` | OK | — |
| F-11 · Naked-call risk = 0; UNH only short call covered by 340 shares vs 100 sold | OK | — |

**Bottom line:** `Income por opciones` UI (reads `options_trades`) is decoupled from
`cost_basis`, so the user does NOT see the $-110K cost_basis distortion in that view.
But the **Open Options tab is showing $52,770 phantom credit** because the live TT bridge
section adds individual legs un-grouped and counts long-leg debits as positive credits.
This is a **CRITICAL UI bug** that misrepresents open premium by ~5x.

---

## 1. open_trades vs cost_basis aggregate

### `open_trades` (closed_at IS NULL) — 3 rows
| trade_hash (8) | symbol | strategy | expiry      | strikes      | contracts | credit_open | source            |
| -------------- | ------ | -------- | ----------- | ------------ | --------- | ----------- | ----------------- |
| 0e26bd89       | RUTW   | BPS      | 2026-05-01  | 2100P/2090P | 10        | 0.38        | auto_tastytrade   |
| 42b069ad       | RUTW   | BPS      | 2026-05-08  | 2280P/2270P | 10        | 0.38        | auto_tastytrade   |
| 8a05946        | RUTW   | BPS      | 2026-05-22  | 2410P/2400P | 10        | 0.39        | auto_tastytrade   |

### `cost_basis` aggregate (post-2026-05-02 expiry, ABS(SUM(shares))>0) — 8 legs
| und  | expiry      | strike | type | net_contracts | account   |
| ---- | ----------- | ------ | ---- | ------------- | --------- |
| KWEB | 2026-05-29  | 28.5   | P    | -5            | NULL      |
| UNH  | 2026-05-29  | 375    | C    | -1            | U6735130  |
| P    | 2026-06-19  | 1500   | P    | -1            | U6735130  |
| LULU | 2026-12-18  | 175    | P    | -1            | U7257686  |
| PYPL | 2027-01-15  | 65     | C    | +5            | U7257686  |
| ARE  | 2028-01-21  | 40     | P    | -3            | U6735130  |
| ARE  | 2028-01-21  | 50     | C    | +2            | U6735130  |
| LULU | 2028-01-21  | 170    | C    | +1            | NULL      |

### Mismatches

**F-8 (INFO):** The 3 RUTW BPS in `open_trades` (TT account `5WX76610`) are NOT in
`cost_basis`. Reason: cost_basis is populated only by IB Flex sync, which doesn't
cover Tastytrade. This is by design but **breaks the assumption** that aggregating
open positions across data sources is symmetric. UI must keep using `open_trades`
for TT-only positions and cost_basis for IB-only.

**F-9 (INFO):** The 2026-05-01 RUTW BPS expired at market close today. Settlement
is unknown until TT bridge reports the closing fill. NOT auto-closed in this run.

**F-7 (MEDIUM):** Pinterest ticker `P` with $1500 strike is impossible (PINS trades
~$30). Source row id is one of the cost_basis OPT rows with raw ticker
`P HMI2 20260619 1500 M`. This is a Hannover Rück (Eurex) contract; the OCC parser
mis-extracted `P` as underlying because it expected the OCC format `<root> <yymmdd>P<strike>`.

---

## 2. Income por opciones — monthly reconcile (year = 2026)

### `cost_basis` SUM(opt_credit_total) per month — raw premium flows
| Mes      | n_fills | credit_total      | (positive_only) | (negative_only) |
| -------- | ------- | ----------------- | --------------- | --------------- |
| 2026-01  | 33      | +393.66           | +42,322.67      | -41,929.00      |
| 2026-02  | 46      | +4,086.96         | +93,816.34      | -89,729.38      |
| 2026-03  | 92      | -12,593.92        | +250,295.39     | -262,889.31     |
| 2026-04  | 46      | **-102,700.71**   | +56,979.81      | **-159,680.52** |
| 2026-05  | 3       | -17.21            | +11.21          | -28.42          |
| **YTD**  | 220     | **-110,831.22**   | +443,425.41     | -554,256.63     |

### `options_trades` realized P&L per month (status IN EXPIRED/CLOSED/ASSIGNED/ROLLED)
| Mes     | realized       |
| ------- | -------------- |
| 2026-01 | -5,968.05      |
| 2026-02 | +5,926.17      |
| 2026-03 | +21,519.95     |
| 2026-04 | +1,292.51      |
| 2026-12 | 0              |
| **YTD** | **+22,770.58** |

### `options_trades` per strategy (YTD 2026)
| strategy | n_realized | realized_pnl |
| -------- | ---------- | ------------ |
| CS       | 20         | +3,709.43    |
| LEAPS    | 74         | +17,726.27   |
| ROC      | 6          | -3,093.82    |
| ROP      | 20         | +4,428.70    |
| **TOT**  | 120        | +22,770.58   |

### Discrepancy analysis
The two systems measure DIFFERENT things and are NOT meant to reconcile 1:1:
* `cost_basis.opt_credit_total` aggregates **every premium cash flow** (open + close
  + rolls + assignments) → summed gives net premium received minus paid.
* `options_trades.final_net_credit` records **per-trade realized P&L** entered by
  the user in the master Excel (manual ledger).

The two would converge only if every IB fill became one Excel trade and rolls
were modelled identically. They aren't.

**However**, the cost_basis April spike (-$102,700) is dominated by:
1. **F-3 (HIGH):** 14 SPX/NVDA broken-parser rows totaling **-$83,157** of "credit"
   (actually long-call debits with empty OCC fields). These bias the report.
2. The remaining -$19,543 is composed of legitimate large debits (NVDA 270617C00185
   long-call buy at -$4,660; ARE 280121P00040 short-put close-buy at -$2,866; etc).

**Recommendation:** Either (a) re-parse the 14 phantoms and backfill
opt_strike/opt_tipo/opt_expiry, or (b) exclude rows where opt_strike=0 from any
"income por opciones" UI that reads cost_basis (the user-facing tab does NOT, so
this is currently safe but a foot-gun for any future BI).

---

## 3. Open positions math sanity — `/api/options/open-portfolio` HTTP probe

Probed `https://api.onto-so.com/api/options/open-portfolio` (auth'd, 2026-05-02).
Response: 17 positions, claimed `kpis.creditTotal=$52,770.50`, `kpis.thetaDay=-$140.11`.

### Per-position math verification (samples)

| id                  | source        | symbol  | strategy | strikes      | contracts | credit | creditTotal | math |
| ------------------- | ------------- | ------- | -------- | ------------ | --------- | ------ | ----------- | ---- |
| 0e26bd89...         | auto_tt       | RUTW    | BPS      | 2100/2090    | 10        | 0.38   | 380         | OK (0.38×10×100) |
| 42b069ad...         | auto_tt       | RUTW    | BPS      | 2280/2270    | 10        | 0.38   | 380         | OK |
| cb_KWEB_..._28.5_P  | cost_basis    | KWEB    | CSP      | 28.5P        | 5         | 0.0043 | 2.13        | OK (2.13/500=0.00427) |
| cb_UNH_..._375_C    | cost_basis    | UNH     | CC       | 375C         | 1         | 8.539  | 853.93      | OK |
| cb_P_..._1500_P     | cost_basis    | P       | CSP      | 1500P        | 1         | 3.104  | 310.40      | OK *math*, but **F-7 ticker bogus** |
| cb_LULU_..._175_P   | cost_basis    | LULU    | CSP      | 175P         | 1         | 30.74  | 3,074.20    | OK |
| cb_PYPL_..._65_C    | cost_basis    | PYPL    | LC       | 65C          | 5         | 3.677  | 1,838.49    | OK |
| cb_ARE_..._40_P     | cost_basis    | ARE     | CSP      | 40P          | 3         | 9.553  | 2,865.99    | OK |
| cb_ARE_..._50_C     | cost_basis    | ARE     | LC       | 50C          | 2         | 16.83  | 3,366.94    | OK |
| **tt_..._02400000** | tt_live       | RUTW... | OPT      | —            | 10        | 6.35   | **6,350**   | **F-2 BUG** |
| **tt_..._02410000** | tt_live       | RUTW... | OPT      | —            | 10        | 6.74   | **6,740**   | **F-2 BUG** |
| **tt_..._02280000** | tt_live       | RUTW... | OPT      | —            | 10        | 6.045  | **6,045**   | **F-2 BUG** |
| **tt_..._02270000** | tt_live       | RUTW... | OPT      | —            | 10        | 5.665  | **5,665**   | **F-2 BUG** |
| **tt_..._02090000** | tt_live       | RUTW... | OPT      | —            | 10        | 7.05   | **7,050**   | **F-2 BUG** |
| **tt_..._02100000** | tt_live       | RUTW... | OPT      | —            | 10        | 7.43   | **7,430**   | **F-2 BUG** |

### F-1 Critical: TT live legs not grouped into spreads

The TT-bridge section (`worker.js:10571..`) groups by `acct.account_number|und|exp`
but `und = p.underlying_symbol || p.symbol || ""`. When TT bridge returns the OCC
raw symbol (e.g. `RUTW  260522P02400000`) in `symbol` and no separate
`underlying_symbol`, each leg gets a unique key and the spread NEVER gets reassembled.
Result: each leg becomes its own "OPT" row in the response.

### F-2 Critical: TT live treats long-leg debits as credits

```js
const credit = rep.average_open_price != null
  ? Math.abs(Number(rep.average_open_price))   // ← takes ABS, sign info lost
  : null;
```

For a BPS, the long-leg `average_open_price` is positive (paid premium = debit) but
the short-leg is also positive (received premium = credit). After `Math.abs()` both
become "credit". For 2026-05-22 RUTW 2410/2400 BPS:
* Long 2400P at $6.35 → **debit** of $6,350 (counted as credit)
* Short 2410P at $6.74 → credit of $6,740
* Net real spread credit: $6.74 - $6.35 = **$0.39 × 10 × 100 = $390** (matches `open_trades.credit_open`)
* Phantom reported by API: $6,350 + $6,740 = **$13,090**

Total phantom in the 6 TT rows: $39,280 reported, real value ~$1,150. The
`open_trades` row already accounts for the same spread correctly ($380 / $380 / $390)
→ **double-count** plus inflation makes Open Options tab show ~$52K when reality
is ~$22K (cost_basis legitimate positions $14,290 + open_trades $1,150 ≈ $15.4K).

### F-1 Dedup also fails

```js
const alreadyInD1 = rows.some(r =>
  r.symbol === und && r.expiry === exp && r.account === acct.account_number
);
```

For TT, `und` is the OCC raw and `exp` is null (because `expires_at` for individual
legs returns null in the loop). For D1 (`open_trades`), `r.symbol = "RUTW"` and
`r.expiry = "2026-05-22"`. Match ALWAYS fails → no dedup at all.

### Fix sketch (post-audit-C, NOT applied here)

1. In TT loop, when grouping legs, prefer `p.underlying_symbol` and parse OCC if
   absent. Set `exp` from `p.expires_at?.slice(0,10)` OR from OCC date.
2. Compute `creditTotal` from net spread (sum of signed `quantity_direction` * price)
   not `Math.abs(open_price)`.
3. For dedup, key by `(account, underlying, expiry, sortedShortStrikes)` — not symbol.

---

## 4. Closed positions still appearing in open_options

Tested: aggregate of `cost_basis` future-dated OPT rows with SUM(shares)=0 (closed by
opposite trade) — should NOT appear.

| Future-dated aggregates | Total | Net=0 (closed) | Net≠0 (still open) |
| ----------------------- | ----- | -------------- | ------------------ |
| from cost_basis         | 42    | 34             | 8                  |

Sampled 15 of the 34 net-zero (ADBE 350C, ARKK 31C, BX 130C, CRWD 260C, GEO 16P,
GOOGL 170C, INTC 43C, IWM 200/210/190/220C, KWEB 35/20C, …). All are correctly
**EXCLUDED** from `/api/options/open-portfolio` because the SQL has
`HAVING ABS(SUM(shares)) > 0`. **PASS.**

The old user-reported bug (UPS, IWM, GOOGL ghosts) is fixed by the IB-live-healthy
gate in worker.js:10314 (`if (!ibLiveHealthy)` blocks the cost_basis fallback when
IB bridge has data). In the current run IB live was unhealthy/empty so cost_basis
fallback ran and correctly returned 8 open legs only.

---

## 5. options_trades vs cost_basis: 62 stale closures

| Status in options_trades | cost_basis still shows open contracts |
| ------------------------ | ------------------------------------- |
| EXPIRED / CLOSED / ASSIGNED / ROLLED | 62 trades |

For these 62 trades, the user marked the trade as closed in the manual ledger but
cost_basis was never reconciled. Cause is one of:
* IB Flex import missed the closing fill (date range, dedup)
* Manual ledger was over-eager (user marked CLOSED before settlement)
* OCC parser mismatch made the closing fill land in a different `(ticker, strike, expiry)` bucket

Risk: the cost_basis fallback in `/api/options/open-portfolio` could surface these as
"open" again whenever IB live drops. **Recommendation:** schedule a re-import IB
Flex 365d to backfill, or run the existing reconcile orphans endpoint.

---

## 6. Naked positions risk

### Short calls (potential naked call risk)
Joining open short-call legs with `positions.shares`:

| underlying | short_call_contracts | user_shares | coverage_gap |
| ---------- | -------------------- | ----------- | ------------ |
| UNH        | -1 (1 contract)      | 340         | +240 → covered (CC) |

**No naked calls.** UNH is the only short call and is fully covered.

### Short puts (cash secured / margin requirement)

| underlying | strike | expiry      | net_contracts | account   | cash_to_cover |
| ---------- | ------ | ----------- | ------------- | --------- | ------------- |
| P          | 1500   | 2026-06-19  | -1            | U6735130  | $150,000 *(F-7 bogus parsing)* |
| LULU       | 175    | 2026-12-18  | -1            | U7257686  | $17,500       |
| KWEB       | 28.5   | 2026-05-29  | -5            | NULL      | $14,250       |
| ARE        | 40     | 2028-01-21  | -3            | U6735130  | $12,000       |
| **TOT (excl P)** |  |             |               |           | **$43,750**   |

If the `P` row is mis-parsed (strongly suspected — Hannover Re Eurex contract), the
true cash exposure is **~$43,750** in cash-secured puts plus whatever the real Eurex
contract is worth. Manual review of cost_basis id with `ticker LIKE 'P HMI%'`
recommended.

---

## 7. Auto-fixes applied this run

```sql
-- Deleted 1 fully-empty filler row (LUV, all-zero), id=5359
DELETE FROM cost_basis WHERE id = 5359 ...;
-- 1 row affected
```

All other fixes listed in `api/audit-C-fixes.sql` are commented out (require user
review). See file for details.

---

## 8. Risk-ordered priority list (for next session)

1. **F-1 + F-2 (CRITICAL):** Patch `/api/options/open-portfolio` TT-live block to
   group spread legs and compute net credit correctly. Open Options tab is showing
   ~5x phantom premium today.
2. **F-3 (HIGH):** Re-parse 14 SPX/NVDA broken cost_basis rows or filter
   `opt_strike=0` from cost_basis income aggregations.
3. **F-7 (MEDIUM):** Map Eurex `P HMI2 ... 1500 M` to real underlying.
4. **F-5 (MEDIUM):** Re-import IB Flex 365d to backfill the 62 stale-closed trades.
5. **F-6 (LOW):** Single column-slip fix on options_trades id=1137.

---

## Files

* SQL fixes: `/Users/ricardogarciaontoso/IA/AyR/api/audit-C-fixes.sql`
* This report: `/Users/ricardogarciaontoso/IA/AyR/docs/audit-C-options-2026-05-02.md`
* Code refs: `api/src/worker.js:10306-10800` (`/api/options/open-portfolio`),
  `api/src/worker.js:5868-5910` (`/api/options/summary`),
  `frontend/src/components/home/OpcionesTab.jsx:624` (`SummaryView`).
