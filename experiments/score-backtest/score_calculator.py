"""Quality Score + Dividend Safety Score 2.0 — implementación standalone.

Implementa las fórmulas de docs/quality-safety-score-design.md de forma
simplificada para correr sobre datos históricos FMP. Ojo: algunas
métricas (predictability, forward visibility) usan proxies porque no
hay datos retroactivos perfectos.

Cada función score_* devuelve (puntos_obtenidos, max_puntos, raw_value).
"""
from typing import Optional


def safe_div(a, b, default=None):
    """División segura — None o 0 → default."""
    if a is None or b is None or b == 0:
        return default
    return a / b


def get_metric(records: list, year: int, key: str):
    """Busca en lista de records anuales el year exacto, devuelve key."""
    for r in records:
        if not r:
            continue
        date = r.get("date", "")
        if date.startswith(str(year)):
            return r.get(key)
    return None


def get_record(records: list, year: int):
    """Devuelve el record completo del año."""
    for r in records:
        if not r:
            continue
        date = r.get("date", "")
        if date.startswith(str(year)):
            return r
    return None


# ─────────────────────────────────────────────────────────────────
# QUALITY SCORE — 6 componentes, max 100 pts
# ─────────────────────────────────────────────────────────────────


def score_roic(km_records: list, year: int):
    """ROIC — max 10 pts. Bonus +1 si trend positivo, penalty -2 si negativo."""
    roic = get_metric(km_records, year, "roic")
    if roic is None:
        return 0, 10, None

    # Tabla mapeo
    if roic >= 0.25:
        pts = 10
    elif roic >= 0.20:
        pts = 9
    elif roic >= 0.15:
        pts = 7
    elif roic >= 0.12:
        pts = 5
    elif roic >= 0.10:
        pts = 3
    elif roic >= 0.08:
        pts = 1
    else:
        pts = 0

    # Trend bonus/penalty (compare con 5 años antes)
    roic_5y_ago = get_metric(km_records, year - 5, "roic")
    if roic_5y_ago is not None and roic_5y_ago > 0:
        delta_per_year = (roic - roic_5y_ago) / 5
        if delta_per_year >= 0.01:
            pts = min(10, pts + 1)
        elif delta_per_year <= -0.01:
            pts = max(0, pts - 2)

    return pts, 10, roic


def score_fcf_margin(income: list, cf: list, year: int, sector: str = ""):
    """FCF margin — max 8 pts, sector adjusted."""
    revenue = get_metric(income, year, "revenue")
    ocf = get_metric(cf, year, "operatingCashFlow")
    capex = get_metric(cf, year, "capitalExpenditure")  # capex es negativo en FMP

    if revenue is None or ocf is None or capex is None or revenue == 0:
        return 0, 8, None

    fcf = ocf + capex  # capex ya negativo, suma para restar
    fcf_margin = fcf / revenue

    # Thresholds por sector
    sector_lower = sector.lower()
    if "tech" in sector_lower or "software" in sector_lower:
        thresholds = [(0.30, 8), (0.20, 6), (0.15, 4), (0.10, 2), (-1, 0)]
    elif "staple" in sector_lower or "consumer" in sector_lower:
        thresholds = [(0.15, 8), (0.10, 6), (0.07, 4), (0.05, 2), (-1, 0)]
    elif "util" in sector_lower:
        thresholds = [(0.08, 8), (0.05, 6), (0.03, 4), (0.02, 2), (-1, 0)]
    elif "industrial" in sector_lower or "material" in sector_lower:
        thresholds = [(0.10, 8), (0.07, 6), (0.05, 4), (0.03, 2), (-1, 0)]
    else:
        # Default
        thresholds = [(0.15, 8), (0.10, 6), (0.07, 4), (0.04, 2), (-1, 0)]

    pts = 0
    for threshold, p in thresholds:
        if fcf_margin >= threshold:
            pts = p
            break

    return pts, 8, fcf_margin


def score_gross_margin_trend(ratios_records: list, year: int):
    """Gross margin trend 5y — max 7 pts."""
    gm_now = get_metric(ratios_records, year, "grossProfitMargin")
    gm_5y = get_metric(ratios_records, year - 5, "grossProfitMargin")

    if gm_now is None or gm_5y is None:
        return 0, 7, None

    delta_bps = (gm_now - gm_5y) * 10000  # convertir a basis points

    if delta_bps >= 200:
        pts = 7
    elif delta_bps >= 100:
        pts = 6
    elif delta_bps >= 0:
        pts = 5
    elif delta_bps >= -100:
        pts = 3
    elif delta_bps >= -200:
        pts = 1
    else:
        pts = 0

    return pts, 7, delta_bps


def score_capital_efficiency(km_records: list, year: int):
    """ROIC vs WACC spread (12 pts) + Asset turnover (8 pts) — max 20 pts."""
    pts_total = 0

    # ROIC vs WACC — usamos WACC=8% asunción si no hay
    roic = get_metric(km_records, year, "roic")
    wacc = 0.08  # asunción simple

    if roic is None:
        spread_pts = 0
        spread = None
    else:
        spread = roic - wacc
        if spread >= 0.15:
            spread_pts = 12
        elif spread >= 0.10:
            spread_pts = 10
        elif spread >= 0.05:
            spread_pts = 7
        elif spread >= 0.02:
            spread_pts = 4
        elif spread >= 0:
            spread_pts = 1
        else:
            spread_pts = 0

    pts_total += spread_pts

    # Asset turnover (no usamos sector adj aquí, simplificación)
    asset_turn = None
    rec = get_record(km_records, year)
    if rec:
        revenue_per_share = rec.get("revenuePerShare")
        # No es directo, usamos approximación
    asset_turn_pts = 4  # default neutro si no se puede calcular bien

    pts_total += asset_turn_pts

    return pts_total, 20, spread


def score_debt_ebitda(km_records: list, year: int):
    """Debt/EBITDA — max 10 pts."""
    ratio = get_metric(km_records, year, "netDebtToEBITDA")
    if ratio is None:
        # Fallback: calcular manual
        return 0, 10, None

    if ratio <= 1:
        pts = 10
    elif ratio <= 2:
        pts = 8
    elif ratio <= 3:
        pts = 6
    elif ratio <= 4:
        pts = 3
    elif ratio <= 5:
        pts = 1
    else:
        pts = 0

    return pts, 10, ratio


def score_interest_coverage(ratios_records: list, year: int):
    """Interest coverage — max 6 pts."""
    cov = get_metric(ratios_records, year, "interestCoverage")
    if cov is None:
        return 0, 6, None

    if cov >= 15:
        pts = 6
    elif cov >= 10:
        pts = 5
    elif cov >= 5:
        pts = 4
    elif cov >= 3:
        pts = 2
    else:
        pts = 0

    return pts, 6, cov


def score_net_debt_trend(km_records: list, year: int):
    """Net debt trend 5y — max 4 pts."""
    nd_now = get_metric(km_records, year, "netDebtToEBITDA")
    nd_5y = get_metric(km_records, year - 5, "netDebtToEBITDA")

    if nd_now is None or nd_5y is None:
        return 0, 4, None

    if nd_5y == 0:
        return 2, 4, None

    delta_pct = (nd_now - nd_5y) / abs(nd_5y) if nd_5y != 0 else 0

    if delta_pct < -0.10:
        pts = 4
    elif abs(delta_pct) <= 0.10:
        pts = 2
    elif delta_pct < 0.50:
        pts = 1
    else:
        pts = 0

    return pts, 4, delta_pct


def score_revenue_cagr(income: list, year: int, sector: str = ""):
    """Revenue CAGR 5y — max 8 pts."""
    rev_now = get_metric(income, year, "revenue")
    rev_5y = get_metric(income, year - 5, "revenue")

    if not rev_now or not rev_5y or rev_5y <= 0:
        return 0, 8, None

    cagr = (rev_now / rev_5y) ** (1 / 5) - 1

    sector_lower = sector.lower()
    if "tech" in sector_lower or "software" in sector_lower:
        # Tech expectativa más alta
        if cagr >= 0.15:
            pts = 8
        elif cagr >= 0.10:
            pts = 6
        elif cagr >= 0.05:
            pts = 4
        elif cagr >= 0:
            pts = 2
        else:
            pts = 0
    elif "util" in sector_lower:
        if cagr >= 0.05:
            pts = 8
        elif cagr >= 0.03:
            pts = 6
        elif cagr >= 0.01:
            pts = 4
        elif cagr >= 0:
            pts = 2
        else:
            pts = 0
    else:
        # Default consumer/industrial
        if cagr >= 0.08:
            pts = 8
        elif cagr >= 0.05:
            pts = 6
        elif cagr >= 0.03:
            pts = 4
        elif cagr >= 0:
            pts = 2
        else:
            pts = 0

    return pts, 8, cagr


def score_fcf_cagr(cf: list, year: int):
    """FCF CAGR 5y — max 7 pts."""
    fcf_now_record = get_record(cf, year)
    fcf_5y_record = get_record(cf, year - 5)

    if not fcf_now_record or not fcf_5y_record:
        return 0, 7, None

    fcf_now = fcf_now_record.get("operatingCashFlow", 0) + fcf_now_record.get("capitalExpenditure", 0)
    fcf_5y = fcf_5y_record.get("operatingCashFlow", 0) + fcf_5y_record.get("capitalExpenditure", 0)

    if fcf_5y <= 0 or fcf_now <= 0:
        # Si era negativo y ahora positivo, dar puntos
        if fcf_5y <= 0 and fcf_now > 0:
            return 5, 7, None
        return 0, 7, None

    cagr = (fcf_now / fcf_5y) ** (1 / 5) - 1

    if cagr >= 0.10:
        pts = 7
    elif cagr >= 0.05:
        pts = 5
    elif cagr >= 0:
        pts = 3
    else:
        pts = 0

    return pts, 7, cagr


def score_buyback_yield(km_records: list, year: int):
    """Buyback yield 5y — max 4 pts."""
    # FMP da sharesOutstanding en key_metrics
    shares_now = get_metric(km_records, year, "weightedAverageShsOut")
    shares_5y = get_metric(km_records, year - 5, "weightedAverageShsOut")

    if not shares_now or not shares_5y:
        return 0, 4, None

    annual_buyback_yield = (shares_5y - shares_now) / shares_now / 5

    if annual_buyback_yield >= 0.03:
        pts = 4
    elif annual_buyback_yield >= 0.01:
        pts = 3
    elif annual_buyback_yield >= 0:
        pts = 2
    elif annual_buyback_yield >= -0.02:
        pts = 1
    else:
        pts = 0

    return pts, 4, annual_buyback_yield


def score_dividend_track(div_history: dict, year: int):
    """Years without cut — max 4 pts."""
    if not div_history or "historical" not in div_history:
        return 0, 4, 0

    historical = div_history.get("historical", [])
    if not historical:
        # No paga dividendos
        return 0, 4, 0

    # Agrupar por año
    by_year = {}
    for d in historical:
        date = d.get("date", "")
        if not date:
            continue
        y = int(date[:4])
        amount = d.get("dividend", 0)
        if y not in by_year:
            by_year[y] = 0
        by_year[y] += amount

    # Contar years sin cut hasta el year target
    years_sorted = sorted(by_year.keys())
    if not years_sorted:
        return 0, 4, 0

    # Cuantos años consecutivos sin cut acabando en year-1 (año cerrado)
    streak = 0
    last_year = year - 1
    while last_year in by_year and last_year - 1 in by_year:
        if by_year[last_year] >= by_year[last_year - 1]:
            streak += 1
            last_year -= 1
        else:
            break

    if streak >= 25:
        pts = 4
    elif streak >= 10:
        pts = 3
    elif streak >= 5:
        pts = 2
    elif streak >= 1:
        pts = 1
    else:
        pts = 0

    return pts, 4, streak


def score_predictability_proxy(income: list, year: int):
    """Proxy: stddev de revenue growth 5 últimos años — max 10 pts."""
    revenues = []
    for y in range(year - 4, year + 1):
        rev = get_metric(income, y, "revenue")
        if rev is not None:
            revenues.append(rev)

    if len(revenues) < 4:
        return 0, 10, None

    growths = []
    for i in range(1, len(revenues)):
        if revenues[i - 1] > 0:
            growths.append((revenues[i] - revenues[i - 1]) / revenues[i - 1])

    if not growths:
        return 0, 10, None

    mean = sum(growths) / len(growths)
    variance = sum((g - mean) ** 2 for g in growths) / len(growths)
    std_dev = variance ** 0.5

    # Lower std dev = more predictable
    if std_dev < 0.02:
        pts = 10
    elif std_dev < 0.05:
        pts = 8
    elif std_dev < 0.10:
        pts = 6
    elif std_dev < 0.20:
        pts = 4
    else:
        pts = 2

    return pts, 10, std_dev


def calculate_quality_score(data: dict, year: int) -> dict:
    """Calcula Quality Score completo para un (ticker, year)."""
    income = data.get("income", [])
    bs = data.get("balance_sheet", [])
    cf = data.get("cash_flow", [])
    km = data.get("key_metrics", [])
    rt = data.get("ratios", [])
    div = data.get("dividends", {})
    profile = data.get("profile", {})
    sector = profile.get("sector", "")

    # Profitability (25 pts)
    roic_pts, roic_max, roic_val = score_roic(km, year)
    fcfm_pts, fcfm_max, fcfm_val = score_fcf_margin(income, cf, year, sector)
    gmt_pts, gmt_max, gmt_val = score_gross_margin_trend(rt, year)
    profit_total = roic_pts + fcfm_pts + gmt_pts

    # Capital efficiency (20 pts)
    ce_pts, ce_max, ce_val = score_capital_efficiency(km, year)

    # Balance sheet (20 pts)
    de_pts, de_max, de_val = score_debt_ebitda(km, year)
    ic_pts, ic_max, ic_val = score_interest_coverage(rt, year)
    ndt_pts, ndt_max, ndt_val = score_net_debt_trend(km, year)
    bs_total = de_pts + ic_pts + ndt_pts

    # Growth (15 pts)
    rcagr_pts, rcagr_max, rcagr_val = score_revenue_cagr(income, year, sector)
    fcagr_pts, fcagr_max, fcagr_val = score_fcf_cagr(cf, year)
    growth_total = rcagr_pts + fcagr_pts

    # Capital allocation (10 pts) — simplificado: buyback + dividend track only
    bb_pts, bb_max, bb_val = score_buyback_yield(km, year)
    dt_pts, dt_max, dt_val = score_dividend_track(div, year)
    alloc_total = bb_pts + dt_pts + 1  # +1 default por M&A discipline (no medible fácil)

    # Predictability (10 pts) — proxy
    pred_pts, pred_max, pred_val = score_predictability_proxy(income, year)

    # Total
    total = profit_total + ce_pts + bs_total + growth_total + alloc_total + pred_pts

    # Data completeness penalty
    components_with_data = sum([
        1 if roic_val is not None else 0,
        1 if fcfm_val is not None else 0,
        1 if gmt_val is not None else 0,
        1 if ce_val is not None else 0,
        1 if de_val is not None else 0,
        1 if ic_val is not None else 0,
        1 if rcagr_val is not None else 0,
        1 if fcagr_val is not None else 0,
        1 if pred_val is not None else 0,
    ])
    completeness = components_with_data / 9
    if completeness < 0.7:
        total = max(0, total - 10)

    return {
        "year": year,
        "quality_score": total,
        "profitability": profit_total,
        "capital_efficiency": ce_pts,
        "balance_sheet": bs_total,
        "growth": growth_total,
        "capital_allocation": alloc_total,
        "predictability": pred_pts,
        "data_completeness": round(completeness, 2),
        "components": {
            "roic": {"pts": roic_pts, "max": 10, "val": roic_val},
            "fcf_margin": {"pts": fcfm_pts, "max": 8, "val": fcfm_val},
            "gross_margin_trend": {"pts": gmt_pts, "max": 7, "val": gmt_val},
            "capital_efficiency": {"pts": ce_pts, "max": 20, "val": ce_val},
            "debt_ebitda": {"pts": de_pts, "max": 10, "val": de_val},
            "interest_coverage": {"pts": ic_pts, "max": 6, "val": ic_val},
            "net_debt_trend": {"pts": ndt_pts, "max": 4, "val": ndt_val},
            "revenue_cagr": {"pts": rcagr_pts, "max": 8, "val": rcagr_val},
            "fcf_cagr": {"pts": fcagr_pts, "max": 7, "val": fcagr_val},
            "buyback_yield": {"pts": bb_pts, "max": 4, "val": bb_val},
            "dividend_track": {"pts": dt_pts, "max": 4, "val": dt_val},
            "predictability_proxy": {"pts": pred_pts, "max": 10, "val": pred_val},
        },
    }


# ─────────────────────────────────────────────────────────────────
# DIVIDEND SAFETY SCORE 2.0 — 5 componentes, max 100 pts
# ─────────────────────────────────────────────────────────────────


def score_fcf_div_coverage(cf: list, year: int):
    """FCF / Dividends paid — max 15 pts."""
    rec = get_record(cf, year)
    if not rec:
        return 0, 15, None

    ocf = rec.get("operatingCashFlow", 0)
    capex = rec.get("capitalExpenditure", 0)
    fcf = ocf + capex
    div_paid = abs(rec.get("dividendsPaid", 0))

    if div_paid == 0:
        # No paga dividendos — sin score (no aplica)
        return 0, 15, None

    coverage = fcf / div_paid

    if coverage >= 3.0:
        pts = 15
    elif coverage >= 2.0:
        pts = 12
    elif coverage >= 1.5:
        pts = 9
    elif coverage >= 1.2:
        pts = 5
    elif coverage >= 1.0:
        pts = 2
    else:
        pts = 0

    return pts, 15, coverage


def score_payout_ratio(km_records: list, year: int):
    """Payout ratio — max 5 pts."""
    payout = get_metric(km_records, year, "payoutRatio")
    if payout is None:
        return 0, 5, None

    # FMP a veces da > 1 si hay one-offs negativos
    if payout < 0:
        return 0, 5, payout

    if payout <= 0.30:
        pts = 5
    elif payout <= 0.50:
        pts = 4
    elif payout <= 0.65:
        pts = 3
    elif payout <= 0.75:
        pts = 2
    elif payout <= 0.90:
        pts = 1
    else:
        pts = 0

    return pts, 5, payout


def score_fcf_after_maint(cf: list, income: list, year: int):
    """FCF after maintenance capex / Dividend — max 10 pts.
    Proxy maintenance capex = depreciation."""
    rec_cf = get_record(cf, year)
    rec_inc = get_record(income, year)
    if not rec_cf or not rec_inc:
        return 0, 10, None

    ocf = rec_cf.get("operatingCashFlow", 0)
    depreciation = rec_inc.get("depreciationAndAmortization", 0)
    div_paid = abs(rec_cf.get("dividendsPaid", 0))

    if div_paid == 0:
        return 0, 10, None

    fcf_after_maint = ocf - depreciation
    coverage = fcf_after_maint / div_paid

    if coverage >= 2.5:
        pts = 10
    elif coverage >= 1.8:
        pts = 8
    elif coverage >= 1.3:
        pts = 5
    elif coverage >= 1.0:
        pts = 2
    else:
        pts = 0

    return pts, 10, coverage


def score_safety_balance_sheet(km_records: list, ratios_records: list, bs: list, year: int):
    """Balance sheet stress: debt/EBITDA + interest cov + liquidity — max 25 pts."""
    pts_total = 0

    # Net debt/EBITDA (10 pts) — más estricto que en Quality
    de = get_metric(km_records, year, "netDebtToEBITDA")
    if de is None:
        de_pts = 0
    elif de <= 1:
        de_pts = 10
    elif de <= 2:
        de_pts = 8
    elif de <= 3:
        de_pts = 5
    elif de <= 4:
        de_pts = 2
    else:
        de_pts = 0
    pts_total += de_pts

    # Interest coverage (8 pts)
    ic = get_metric(ratios_records, year, "interestCoverage")
    if ic is None:
        ic_pts = 0
    elif ic >= 15:
        ic_pts = 8
    elif ic >= 10:
        ic_pts = 6
    elif ic >= 5:
        ic_pts = 4
    elif ic >= 3:
        ic_pts = 2
    else:
        ic_pts = 0
    pts_total += ic_pts

    # Liquidity cushion (7 pts) — current ratio approx
    cr = get_metric(ratios_records, year, "currentRatio")
    if cr is None:
        liq_pts = 0
    elif cr >= 1.5:
        liq_pts = 7
    elif cr >= 1.0:
        liq_pts = 5
    elif cr >= 0.7:
        liq_pts = 3
    elif cr >= 0.5:
        liq_pts = 1
    else:
        liq_pts = 0
    pts_total += liq_pts

    return pts_total, 25, {"debt_ebitda": de, "interest_cov": ic, "current_ratio": cr}


def score_safety_track_record(div_history: dict, year: int):
    """Track record: years without cut + DGR consistency + recession survival — max 20 pts."""
    pts_total = 0

    if not div_history or "historical" not in div_history:
        return 0, 20, None

    historical = div_history.get("historical", [])

    # Agrupar por año
    by_year = {}
    for d in historical:
        date = d.get("date", "")
        if not date:
            continue
        y = int(date[:4])
        by_year[y] = by_year.get(y, 0) + d.get("dividend", 0)

    if not by_year:
        return 0, 20, None

    # Years without cut (10 pts)
    streak = 0
    check_year = year - 1
    while check_year in by_year and (check_year - 1) in by_year:
        if by_year[check_year] >= by_year[check_year - 1]:
            streak += 1
            check_year -= 1
        else:
            break

    if streak >= 50:
        years_pts = 10
    elif streak >= 25:
        years_pts = 9
    elif streak >= 20:
        years_pts = 8
    elif streak >= 15:
        years_pts = 7
    elif streak >= 10:
        years_pts = 5
    elif streak >= 5:
        years_pts = 3
    elif streak >= 1:
        years_pts = 1
    else:
        years_pts = 0
    pts_total += years_pts

    # DGR consistency (5 pts)
    growths = []
    for y in range(year - 10, year):
        if y in by_year and (y - 1) in by_year and by_year[y - 1] > 0:
            g = (by_year[y] - by_year[y - 1]) / by_year[y - 1]
            growths.append(g)

    if len(growths) >= 5:
        mean = sum(growths) / len(growths)
        variance = sum((g - mean) ** 2 for g in growths) / len(growths)
        std = variance ** 0.5

        if std < 0.02:
            consist_pts = 5
        elif std < 0.04:
            consist_pts = 4
        elif std < 0.06:
            consist_pts = 3
        elif std < 0.10:
            consist_pts = 2
        else:
            consist_pts = 0
    else:
        consist_pts = 0
    pts_total += consist_pts

    # Recession survival (5 pts) — held through 2008 + 2020
    survived_2008 = 2008 in by_year and 2009 in by_year and by_year[2009] >= by_year[2008]
    survived_2020 = 2020 in by_year and 2021 in by_year and by_year[2021] >= by_year[2020]

    survival_count = sum([survived_2008, survived_2020])
    if survival_count == 2:
        rec_pts = 5
    elif survival_count == 1:
        rec_pts = 3
    elif survival_count == 0 and (2008 in by_year or 2020 in by_year):
        rec_pts = 0
    else:
        # No history during recessions
        rec_pts = 2

    pts_total += rec_pts

    return pts_total, 20, {"streak": streak, "consistency_std": std if growths else None, "survived_2008": survived_2008, "survived_2020": survived_2020}


def score_safety_forward(income: list, year: int):
    """Forward visibility — proxy: revenue growth últimos 2 años + capex stable. Max 15 pts."""
    # Sin estimates históricos, usamos proxy: ¿revenue está creciendo o decreciendo recientemente?
    rev_now = get_metric(income, year, "revenue")
    rev_1y = get_metric(income, year - 1, "revenue")
    rev_2y = get_metric(income, year - 2, "revenue")

    if not all([rev_now, rev_1y, rev_2y]) or rev_2y <= 0:
        return 0, 15, None

    growth_recent = (rev_now / rev_2y) ** (1 / 2) - 1

    # FCF growth proxy (8 pts)
    if growth_recent >= 0.08:
        fcf_g_pts = 8
    elif growth_recent >= 0.04:
        fcf_g_pts = 6
    elif growth_recent >= 0:
        fcf_g_pts = 4
    elif growth_recent >= -0.05:
        fcf_g_pts = 2
    else:
        fcf_g_pts = 0

    # Capex cycle (4 pts) — siempre 3 default sin más data
    capex_pts = 3

    # Estimate stability (3 pts) — proxy: revenue stability
    estimate_pts = 2

    return fcf_g_pts + capex_pts + estimate_pts, 15, growth_recent


def score_safety_sector_adj(profile: dict):
    """Sector risk adjustment — max 10 pts."""
    sector = profile.get("sector", "").lower()
    industry = profile.get("industry", "").lower()

    # Defensive
    if any(s in sector for s in ["staple", "utility", "healthcare", "real estate"]):
        base = 10
    elif any(s in sector for s in ["technology", "communication", "consumer cyclical"]):
        base = 7
    elif any(s in sector for s in ["industrial", "material", "energy"]):
        base = 4
    elif any(s in sector for s in ["financial"]):
        base = 6
    else:
        base = 5

    # Ajustes high-risk industries
    if any(i in industry for i in ["mining", "airline", "oil & gas e&p"]):
        base = max(0, base - 2)

    return base, 10, sector


def calculate_safety_score(data: dict, year: int) -> dict:
    """Calcula Dividend Safety Score completo para un (ticker, year)."""
    income = data.get("income", [])
    bs = data.get("balance_sheet", [])
    cf = data.get("cash_flow", [])
    km = data.get("key_metrics", [])
    rt = data.get("ratios", [])
    div = data.get("dividends", {})
    profile = data.get("profile", {})

    # Coverage (30 pts)
    fcf_cov_pts, _, fcf_cov_val = score_fcf_div_coverage(cf, year)
    payout_pts, _, payout_val = score_payout_ratio(km, year)
    fcf_maint_pts, _, fcf_maint_val = score_fcf_after_maint(cf, income, year)
    coverage_total = fcf_cov_pts + payout_pts + fcf_maint_pts

    # Balance sheet stress (25 pts)
    bs_pts, _, bs_val = score_safety_balance_sheet(km, rt, bs, year)

    # Track record (20 pts)
    tr_pts, _, tr_val = score_safety_track_record(div, year)

    # Forward visibility (15 pts)
    fwd_pts, _, fwd_val = score_safety_forward(income, year)

    # Sector adjustment (10 pts)
    sec_pts, _, sec_val = score_safety_sector_adj(profile)

    total = coverage_total + bs_pts + tr_pts + fwd_pts + sec_pts

    return {
        "year": year,
        "safety_score": total,
        "coverage": coverage_total,
        "balance_sheet": bs_pts,
        "track_record": tr_pts,
        "forward": fwd_pts,
        "sector_adj": sec_pts,
        "components": {
            "fcf_coverage": {"pts": fcf_cov_pts, "max": 15, "val": fcf_cov_val},
            "payout_ratio": {"pts": payout_pts, "max": 5, "val": payout_val},
            "fcf_after_maint": {"pts": fcf_maint_pts, "max": 10, "val": fcf_maint_val},
            "balance_sheet": {"pts": bs_pts, "max": 25, "val": bs_val},
            "track_record": {"pts": tr_pts, "max": 20, "val": tr_val},
            "forward": {"pts": fwd_pts, "max": 15, "val": fwd_val},
            "sector_adj": {"pts": sec_pts, "max": 10, "val": sec_val},
        },
    }
