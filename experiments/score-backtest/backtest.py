"""Backtest runner — calcula Quality + Safety scores históricos para los 25 tickers.

Output: output/scores_history.csv

Ejecutar:
    python backtest.py
"""
import csv
import json
from pathlib import Path

import fmp_client
from score_calculator import calculate_quality_score, calculate_safety_score

ROOT = Path(__file__).parent
OUTPUT = ROOT / "output"
OUTPUT.mkdir(exist_ok=True)

YEARS = list(range(2018, 2026))  # 2018-2025


def fetch_all_data(ticker: str) -> dict:
    """Pull todos los datos necesarios para un ticker."""
    print(f"  Fetching data for {ticker}...")
    return {
        "income": fmp_client.income_statement(ticker, years=15),
        "balance_sheet": fmp_client.balance_sheet(ticker, years=15),
        "cash_flow": fmp_client.cash_flow(ticker, years=15),
        "key_metrics": fmp_client.key_metrics(ticker, years=15),
        "ratios": fmp_client.ratios(ticker, years=15),
        "dividends": fmp_client.dividend_history(ticker),
        "profile": fmp_client.profile(ticker),
    }


def main():
    # Load tickers
    with open(ROOT / "tickers.json") as f:
        config = json.load(f)

    tickers = config["tickers"]
    print(f"Backtesting {len(tickers)} tickers across {len(YEARS)} years ({YEARS[0]}-{YEARS[-1]})")
    print(f"Estimated FMP queries (first run): ~{len(tickers) * 7} (cached after)")
    print()

    # Output CSV columns
    fieldnames = [
        "ticker",
        "name",
        "category",
        "year",
        "quality_score",
        "q_profitability",
        "q_capital_efficiency",
        "q_balance_sheet",
        "q_growth",
        "q_capital_allocation",
        "q_predictability",
        "q_data_completeness",
        "safety_score",
        "s_coverage",
        "s_balance_sheet",
        "s_track_record",
        "s_forward",
        "s_sector_adj",
        "sector",
    ]

    rows = []
    skipped = []

    for tk in tickers:
        ticker = tk["ticker"]
        name = tk["name"]
        category = tk["category"]

        print(f"\n[{ticker}] {name} ({category})")

        try:
            data = fetch_all_data(ticker)
        except Exception as e:
            print(f"  ✗ FAILED to fetch: {e}")
            skipped.append((ticker, str(e)))
            continue

        # Verificar que tenemos datos básicos
        if not data["income"] or not data["profile"]:
            print(f"  ⚠ Insufficient data — skipping")
            skipped.append((ticker, "no income/profile data"))
            continue

        sector = data["profile"].get("sector", "unknown")

        for year in YEARS:
            q = calculate_quality_score(data, year)
            s = calculate_safety_score(data, year)

            rows.append({
                "ticker": ticker,
                "name": name,
                "category": category,
                "year": year,
                "quality_score": q["quality_score"],
                "q_profitability": q["profitability"],
                "q_capital_efficiency": q["capital_efficiency"],
                "q_balance_sheet": q["balance_sheet"],
                "q_growth": q["growth"],
                "q_capital_allocation": q["capital_allocation"],
                "q_predictability": q["predictability"],
                "q_data_completeness": q["data_completeness"],
                "safety_score": s["safety_score"],
                "s_coverage": s["coverage"],
                "s_balance_sheet": s["balance_sheet"],
                "s_track_record": s["track_record"],
                "s_forward": s["forward"],
                "s_sector_adj": s["sector_adj"],
                "sector": sector,
            })

            # Print quick result
            event_marker = ""
            if tk.get("event_date") and tk["event_date"].startswith(str(year)):
                event_marker = "  ⚠ EVENT YEAR"
            print(f"  {year}: Q={q['quality_score']:.0f} S={s['safety_score']:.0f}{event_marker}")

    # Write CSV
    output_file = OUTPUT / "scores_history.csv"
    with open(output_file, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n{'='*60}")
    print(f"Wrote {len(rows)} score records to {output_file}")
    if skipped:
        print(f"\nSkipped {len(skipped)} tickers:")
        for tk, reason in skipped:
            print(f"  • {tk}: {reason}")
    print(f"\nNext step: python analyze.py")


if __name__ == "__main__":
    main()
