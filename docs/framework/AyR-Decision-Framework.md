# A&R Decision Framework

**Version:** 1.0 (2026-04-18)
**Purpose:** Every recommendation in this system — whether from a sector dive, Cantera, Scanner, Deep Dividend report, or agent — MUST pass through this framework. No exceptions. No ad-hoc "because it looks good."

This is the single source of truth for "what is a good investment" in a dividend-growth portfolio with a 5-10 year horizon.

---

## The 5 Filters (all mandatory)

A recommendation without ALL 5 filters scored is incomplete and must not be acted on.

### Filter 1 — Understanding the Business

**Question:** Can I explain what this company does to a 12-year-old in 2 sentences?

**Pass criteria:**
- Revenue model clear
- Primary customers identifiable
- Competitive position articulated

**Red flags:**
- Revenue "mix" across 6+ unrelated segments
- Business model requires reading 3 quarterly calls to understand
- Accounting adjustments >15% of GAAP earnings

**Score:** 0-10
- 10 = Crystal clear (Coca-Cola, Realty Income)
- 5 = Needs some study (Blackstone, holding companies)
- 0 = Cannot be explained after 1 hour of reading

### Filter 2 — Moat Durability

**Question:** What prevents a competitor from stealing their customers in 5 years?

**Pass criteria — must have ONE of:**
- Scale economies (Costco, Walmart)
- Brand + pricing power (Coca-Cola, Diageo)
- Switching costs (ADP payroll, FactSet data)
- Network effects (Visa, Mastercard)
- Regulatory moat (utilities, pipelines)
- Cost advantage (low-cost producer)

**Evidence required:**
- ROIC > cost of capital for 5+ consecutive years
- Operating margins stable or expanding over 10-year cycle
- Dividend uninterrupted through last 2 recessions

**Score:** 0-10
- 10 = Widening moat (AVGO, MSFT)
- 5 = Moat exists but eroding (legacy media, traditional retail)
- 0 = No identifiable moat

### Filter 3 — Management Honesty & Capital Allocation

**Question:** Would I want this person as a business partner for 20 years?

**Pass criteria:**
- CEO tenure >3 years OR credible succession
- Insider ownership >1% of shares (skin in the game)
- Historical capital allocation: buybacks at reasonable multiples, no value-destructive M&A
- Guidance track record: 7/8 quarters beat or meet
- Honest acknowledgment of misses in earnings calls

**Red flags:**
- Stock-based compensation >5% revenue with no per-share growth
- Large M&A funded with debt at peak of cycle
- "Adjusted EPS" consistently >20% above GAAP
- Management turnover >30% C-suite in 3 years
- Repeated guidance misses without explanation

**Score:** 0-10
- Data sources: DEF 14A proxy statements, 8-K filings, earnings call transcripts

### Filter 4 — Price vs Value

**Question:** If the market closed for 5 years, would I still be happy holding this at today's price?

**Pass criteria — must have ALL:**
- Current yield within 20% of 10-year average yield
- FCF yield > 10-year US Treasury yield
- Implied IRR (DCF or dividend discount) > 10%

**Additional checks:**
- Not in top quartile of 10-year valuation multiples
- Management not buying back at >2x historical average multiple
- Debt maturity wall doesn't require refinancing at higher rates in next 24 months

**Score:** 0-10
- 10 = Significantly undervalued, wide margin of safety (≥40%)
- 5 = Fair value
- 0 = Clearly overvalued (>80th percentile historical)

### Filter 5 — Conviction & Emotional Sustainability

**Question:** If this position fell 40% in 3 months, would I:
- (a) Happily add more because fundamentals intact ✓
- (b) Panic sell ✗
- (c) Lose sleep and second-guess ✗

**Pass criteria:**
- I can write 3 reasons I own it in <2 minutes
- I have a specific price target (entry, fair value, exit)
- I have a specific thesis-invalidation condition written down
- The position size fits my risk tolerance

**Score:** 0-10 (subjective — this is the user's responsibility, not Claude's)

---

## Composite Decision Rules

### For BUY:
- ALL 5 filters ≥ 6
- At least 2 filters ≥ 8
- Filter 3 (Management) must be ≥ 7
- Filter 4 (Valuation) must not be 0-2 (don't overpay for quality)

### For HOLD (existing position):
- ALL 5 filters ≥ 5
- Filter 2 (Moat) must be ≥ 6

### For TRIM (reduce):
- Any filter dropped to ≤ 4 from previous review
- Filter 4 (Valuation) ≥ 8 (overvalued) → harvest gains
- Position size >1.5x intended weight

### For EXIT:
- Any filter = 0-2 (thesis broken)
- Filter 2 (Moat) < 5
- Dividend cut or obvious cut risk (safety_score < 4)
- Management integrity compromised

---

## Mandatory Data Provenance

Every recommendation MUST include:

1. **Data source** for each metric (10-K line, FMP field, earnings call quote with timestamp)
2. **Data freshness** — when fetched from source (timestamp)
3. **Confidence level** on the metric:
   - ✅ Verified (from primary SEC/corporate source)
   - 🟡 Cached (from FMP/Yahoo, <24h)
   - 🟠 Stale (>7 days)
   - 🔴 Unverified / estimated / proxy data

No recommendation may cite a number without its provenance.

---

## Mandatory Conviction Score

Every recommendation includes:
- **Conviction 1-10** with explicit reasoning
- **Devil's Advocate paragraph** — the single strongest reason NOT to do this
- **Invalidation condition** — "I will change my mind if X happens"

Example:
```
RECOMMENDATION: BUY JNJ at ≤$165 (2% NLV)
CONVICTION: 8/10
REASONING: Filters 1, 2, 3 all ≥8. Filter 4 = 7 (fair but not cheap).
           Filter 5 = high (clear understanding, easy to hold through downturn).
DEVIL'S ADVOCATE: Kenvue spin left slower-growth pharma; Talc litigation
                 cash outflows unpredictable; patent cliff for Stelara 2025-2027.
INVALIDATION: Will reconsider if Stelara biosimilar erosion >60% in 2 years,
             OR talc settlement exceeds $15B, OR pharma pipeline FDA delays >12m.
SOURCE: JNJ 10-K FY2025 p.32-41, DEF14A 2025 compensation section.
UPDATED: 2026-04-18 08:00 UTC. CONFIDENCE: ✅ Verified.
```

---

## Accountability Loop

Every recommendation is written to `recommendations_log` table with:
- Ticker, action, date, price at rec
- 5-filter scores
- Conviction
- Invalidation condition

After 6/12/24 months:
- Automated review: did the thesis play out?
- Tags: CORRECT / WRONG / PARTIAL / PENDING
- Feeds back into system accuracy metrics
- User sees real track record: "8+ conviction recommendations: 73% correct"

---

## What This Framework PREVENTS

❌ "Buy this stock, safety score 8" — no filter analysis
❌ "Yield is attractive at 5%" — no valuation context
❌ "Analyst consensus is positive" — no first-principles thinking
❌ "It's down 30%, must be a bargain" — anchoring bias
❌ "Smart money owns it" — appeal to authority
❌ Ad-hoc recommendations without consistent methodology

## What This Framework ENABLES

✅ Consistent decisions across all agents and tabs
✅ Honest acknowledgment of what we don't know
✅ Track record accumulation (trust through proof, not promises)
✅ Clear reasons to buy, hold, trim, or sell
✅ Emotional resilience through written conviction
✅ Improvement over time via accountability loop

---

## Implementation Priority

1. **Phase 1 (now):** Framework doc exists. All NEW recommendations apply it.
2. **Phase 2:** Retroactively score existing sector-dive recommendations against framework.
3. **Phase 3:** Trust badges on all UI metrics.
4. **Phase 4:** Accountability loop automated in D1.
5. **Phase 5:** Real track record published publicly in-app.

---

*"The first principle is that you must not fool yourself — and you are the easiest person to fool."* — Richard Feynman

*"Risk comes from not knowing what you're doing."* — Warren Buffett

*"Invert, always invert."* — Charlie Munger
