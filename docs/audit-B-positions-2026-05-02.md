# Audit-B: Positions Reconciliation — 2026-05-02

## Summary

- Active positions checked: 81 (shares > 0)
- No stale positions (all updated_at within 7 days)
- Currency math: all clean (usd_value = market_value × fx within $0.01 rounding)
- Orphan positions (no cost_basis trades): 2 — BME:VIS, OMC
- Closed-but-not-purged in cost_basis: 118 historical tickers (expected, these are fully-closed positions kept for tax history)

---

## Section 1 — Shares Mismatch (pos vs cb vs ib)

### Root cause of the systematic discrepancy

`positions.shares` is a **consolidated aggregate across all 4 IB accounts**.
`positions.ib_shares` only reflects one account's live IB data (single-account sync).
`cost_basis SUM(shares)` by ticker aggregates across accounts but has two sub-issues:

1. Some rows have `account = NULL` (pre-multi-account import) that duplicate shares already in named-account rows for the same ticker — e.g., HKG:2219 has 15000 NULL + 20000 U6735130 = 35000 in cost_basis, but positions.shares = 60000 (two accounts × 30000 each, one not yet imported).
2. `ib_shares` reflects only the primary account IB bridge reports (not all 4 accounts), so it always looks smaller than the consolidated total.

**The shares mismatch is NOT a data corruption — it is the expected consequence of multi-account consolidation vs single-account IB sync.**

Tickers where `diff_pos_cb > 0.5` and the gap is explained by multi-account structure (positions = sum of all accounts, cost_basis = partial):

| ticker | pos_shares | ib_shares | cb_net_shares | diff_pos_cb | diff_pos_ib | note |
|--------|-----------|-----------|--------------|-------------|-------------|------|
| HKG:2219 | 60,000 | 20,000 | 35,000 | 25,000 | 40,000 | Multi-acct, cb incomplete |
| HKG:1052 | 52,000 | 20,000 | 36,000 | 16,000 | 32,000 | Multi-acct, cb incomplete |
| HKG:9616 | 22,400 | 8,000 | 14,400 | 8,000 | 14,400 | Multi-acct |
| SCHD | 13,750 | 6,000 | 10,250 | 3,500 | 7,750 | 4 accounts: NULL+U5+U6+U7 = 10,250; 3,500 missing |
| HKG:1910 | 9,300 | 4,200 | 5,100 | 4,200 | 5,100 | Multi-acct |
| RICK | 5,100 | 1,850 | 3,200 | 1,900 | 3,250 | Multi-acct |
| CLPR | 5,400 | 1,800 | 3,300 | 2,100 | 3,600 | Multi-acct |
| OWL | 3,994 | 2,000 | 2,800 | 1,194 | 1,994 | Multi-acct |
| MSDL | 2,992 | 1,000 | 1,496 | 1,496 | 1,992 | Multi-acct |
| BIZD | 3,100 | 1,400 | 1,800 | 1,300 | - | Multi-acct |
| VICI | 3,200 | 1,200 | 1,900 | 1,300 | - | Multi-acct |
| HKG:9618 | 3,700 | 1,309 | 2,400 | 1,300 | - | Multi-acct |
| WEEL | 2,900 | 1,000 | 1,900 | 1,000 | - | Multi-acct |
| NET.UN | 6,000 | 2,000 | 4,000 | 2,000 | - | Multi-acct |
| RAND | 1,200 | 600 | 800 | 400 | - | Multi-acct |
| ...and 40+ more | | | | | | Pattern holds |

### Genuine anomalies requiring investigation

| ticker | pos_shares | cb_net_shares | ib_shares | issue |
|--------|-----------|--------------|-----------|-------|
| IIPR-PRA | 200 | 400 | 400 | **pos_shares is HALF ib and cb — position understated by 200** |
| AZJ | 12,000 | 6,000 | 6,000 | pos = 2× both cb and ib — position may be overstated by 6,000 |
| GQG | 4,000 | 2,000 | 2,000 | pos = 2× both — possible double-count |
| NOMD | 3,100 | 1,300 | 1,300 | pos = 2.38× — likely includes second account not in cb |
| DIVO | 1,400 | 700 | 700 | pos = 2× — same pattern |
| SHUR | 800 | 400 | 400 | pos = 2× — same pattern |
| AMCR | 20 | 10 | 10 | pos = 2× |
| OZON | 100 | 50 | 50 | pos = 2× |
| FDS | 120 | 60 | 60 | pos = 2× |
| KMB | 200 | 100 | 100 | pos = 2× |
| HR | 200 | 100 | 100 | pos = 2× |
| SUI | 100 | 0 | 0 | ORPHAN-like: pos has 100 shares, cb has 0, ib has 0 |
| BME:VIS | 308 | 0 | 308 | ib_shares matches, no cost_basis trades |
| OMC | 68.8 | 0 | 68.8 | ib_shares matches, no cost_basis trades |
| CAG | 800 | 200 | 400 | pos 2× ib; cb has 900 buys across 3 accounts but net only 200 (sold most) |
| CNSWF | 25 | 20 | 5 | Messy: large historical buy/sell in NULL-account, net is confusing |

**CRITICAL: IIPR-PRA** — positions.shares = 200 but both ib_shares and cost_basis = 400. The position row is understating by 200 shares, meaning market_value and usd_value are also halved.

---

## Section 2 — Cost Basis Average Mismatch (> 5%)

The initial query showed apparent ~200% differences — this was a sign error: `coste` is **negative for buys** (cash outflow convention). After correcting for ABS(coste)/buy_shares, the real differences are:

| ticker | pos_avg | calc_avg_buy | pct_diff | severity | notes |
|--------|---------|-------------|----------|----------|-------|
| OZON | 29.52 | 46.99 | 59% | HIGH | pos_avg = cost_basis column (per share), not total. 310 buy shares across 3 accounts but sells zeroed 2, only 50 remain in U7953378. Blended avg wrong |
| AHRT | 5.15 | 7.58 | 47% | HIGH | pos_avg reflects only low-price tranche; cb buy avg is higher because it includes 2025-07 buys at $7+ |
| UNH | 199.78 | 292.33 | 46% | HIGH | Heavily sold and re-bought; cb includes shares later sold. True avg for remaining 200 cb net ≠ blended buy avg |
| LSEG | 86.17 | 47.61 | 45% | HIGH | Likely GBX vs GBP confusion: one NULL-account lot has precio=8.57 (probably 857p in GBX ÷100 mistake) vs U6735130 lots at 85.7 GBP |
| ZTS | 118.40 | 68.31 | 42% | HIGH | One NULL lot: 50 shares with coste=+5700 (positive = a SELL proceeds row tagged as EQUITY buy). Data entry error |
| CAG | 17.90 | 24.76 | 38% | HIGH | 900 buy shares across 3 accounts all fully sold; only 200 NULL-account remain. Buy avg skewed by sold tranches |
| O | 44.23 | 55.25 | 25% | MEDIUM | Some shares sold (950 bought, 800 net). Surviving shares have lower avg (earlier buys) |
| NVO | 40.02 | 49.42 | 23% | MEDIUM | 1300 bought, 900 net; sold higher-cost tranches |
| CPB | 28.15 | 34.57 | 23% | MEDIUM | 500 bought, 300 net; similar pattern |
| CNSWF | 1889.11 | 1510.03 | 20% | MEDIUM | Large block purchase at 1849.94 then partial sells. pos_avg = recent buy price, calc includes block |
| PATH | 22.29 | 26.62 | 19% | MEDIUM | 1249 bought, 1189 net. Sold higher-cost lots |
| EMN | 61.76 | 71.44 | 16% | MEDIUM | 400 bought, 300 net |
| HKG:9618 | 113.90 | 122.48 | 8% | LOW | 2500 bought, 2400 net. Minor sold-tranche skew |
| SCHD | 30.33 | 28.25 | 7% | LOW | Buy avg < pos_avg because earlier DRIP reinvestments at lower prices not all captured |
| RAND | 29.43 | 27.18 | 8% | LOW | EUR-denominated; FX rounding possible |

### Key finding: LSEG GBX/GBP bug

`cost_basis` for LSEG has:
- NULL account row: `shares=100, precio=8.57, coste=-904.14` — precio is clearly GBP (£8.57/share)
- U6735130 rows: `shares=9+91=100, precio=85.7, coste=-(775+7841)=-8617` — precio is GBP (£85.70/share)

The NULL-account row has `precio` that is **10× lower** than the U6735130 rows. Either:
- The NULL row was imported with GBX price instead of GBP (857p stored as 8.57), OR
- It was a different purchase entirely at a genuinely lower price

`positions.avg_price = 86.17` is consistent with U6735130 rows. The NULL-account coste (-904 for 100 shares at £8.57) vs actual cost (£8,617) represents a ~£7,713 understatement in cost basis for that lot.

### ZTS coste sign error

`ZTS` has one NULL-account row: `shares=50, coste=+5700.50` — positive coste on a buy (shares > 0) is wrong. This row is either a mis-tagged sale or an import corruption. The U6735130 rows all have negative coste (correct). This inflates the blended avg calculation.

---

## Section 3 — Currency Consistency

**All clean.** Every position passes `usd_value ≈ market_value × fx` (max delta $0.01, rounding only).

Special cases verified:
- **HKD** (HKG:*): fx ≈ 0.1277, market_value in HKD, usd_value correct
- **GBX** (LSEG): currency='GBX', fx=1.3534 (same as GBP — this is INCORRECT for GBX). LSEG last_price=89.24 which appears to be in GBP (£89), not pence. If price were in GBX (pence), usd_value would need ÷100 correction. Market cap check: 291 shares × £89 × 1.3534 = $35,142 ≈ stored usd_value=$35,145. So the price IS in GBP not GBX, but the currency field says GBX. The fx correction is not being applied (no ÷100), which means the GBX currency label is misleading but the math happens to be correct because the price source already returns in GBP units.
- **EUR** (HEN3, ENG, WKL, RAND, SHUR, FDJU, BME:VIS, BME:AMS): fx ≈ 1.1797, all correct
- **AUD** (AZJ, GQG): fx ≈ 0.7177, correct
- **CAD** (NET.UN): fx ≈ 0.7314, correct

---

## Section 4 — Stale Positions

**Zero stale positions.** All 81 positions have `updated_at` within 7 days.

---

## Section 5 — Orphan Positions

### shares > 0 but NO cost_basis EQUITY trades

| ticker | pos_shares | ib_shares | note |
|--------|-----------|-----------|------|
| BME:VIS | 308 | 308 | IB-only position. ib_shares correct. Needs cost_basis row added manually |
| OMC | 68.8 | 68.8 | IB-only position. Same — no trade history in cost_basis |

### cost_basis has positive net_shares but no positions row (historical closed positions)

118 tickers in cost_basis with net_shares > 0.5 but no matching positions row or positions.shares = 0. These are **fully-closed historical positions** (AMZN, TSLA, BABA, NIO, KWEB, ARKG, etc.) — expected, kept for tax P&L history. Not a data problem.

**Notable ticker naming issue:** `cost_basis` contains ticker `"IIPR PRA"` (space, 4 rows) while the active position uses `"IIPR-PRA"` (hyphen). These are the same instrument. The space-variant rows are orphaned — they are counted in the CB_POSITIVE_NO_POSITION list above.

---

## Section 6 — IIPR-PRA Critical Undercount (CRITICAL)

`positions.shares = 200`, `ib_shares = 400`, `cost_basis SUM = 400`.

The position row has half the actual shares. At $21.76/share this means `market_value` is understated by ~$4,352 and `usd_value` by ~$4,352.

Fix: update positions.shares to 400.

---

## Recommended Actions

### Safe to apply immediately (scripts/audit-B-fixes.sql)

1. **IIPR-PRA shares fix**: UPDATE positions SET shares=400, market_value=400*21.76, usd_value=400*21.76 WHERE ticker='IIPR-PRA'
2. **ZTS coste sign fix**: The row with shares=50, coste=+5700 is a data entry error — coste should be negative
3. **LSEG NULL-account precio fix**: precio=8.57 for 100 shares should be 85.70 (10× off), coste should be -8570 not -904

### Requires manual verification before applying

4. **AZJ/GQG/DIVO double-count**: positions.shares = 2× (ib_shares and cb_shares). If these are truly in 2 accounts, the positions row is correct. If only in 1 account, positions.shares should be halved.
5. **SUI**: positions.shares=100 with ib_shares=0 and cb=0. Either closed or a manual entry needing verification.
6. **IIPR PRA vs IIPR-PRA**: Merge/rename the 4 `"IIPR PRA"` cost_basis rows to `"IIPR-PRA"`.
7. **OZON/AHRT/UNH avg_price**: These appear wrong in positions but the correct value depends on which lots remain (FIFO/LIFO/average method). Not automatically fixable without knowing the accounting method.
8. **CNSWF**: Large historical sell block (100 shares at 1849.94 with positive coste = proceeds) mixed with recent small buys. Manual review needed.

