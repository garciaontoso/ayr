"""Analizador de resultados — lee scores_history.csv y genera reporte legible.

Output:
  - output/predictions_vs_actuals.csv
  - output/report.md

Ejecutar tras backtest.py:
    python analyze.py
"""
import csv
import json
from collections import defaultdict
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).parent
OUTPUT = ROOT / "output"

# Thresholds para "predicción correcta"
SAFETY_DANGER_THRESHOLD = 60       # Si Safety < 60 antes del cut → predicción correcta
QUALITY_HIGH_THRESHOLD = 75        # Compounder debería estar consistentemente ≥75
SAFETY_HIGH_THRESHOLD = 75         # idem
PREDICTION_WINDOW_YEARS = 2        # mirar 2 años antes del evento


def load_scores():
    rows = []
    with open(OUTPUT / "scores_history.csv") as f:
        reader = csv.DictReader(f)
        for r in reader:
            r["year"] = int(r["year"])
            for k in ["quality_score", "safety_score", "q_profitability", "q_balance_sheet",
                      "q_growth", "q_capital_efficiency", "q_capital_allocation",
                      "q_predictability", "s_coverage", "s_balance_sheet", "s_track_record",
                      "s_forward", "s_sector_adj"]:
                try:
                    r[k] = float(r[k])
                except (ValueError, KeyError):
                    r[k] = None
            rows.append(r)
    return rows


def load_tickers_meta():
    with open(ROOT / "tickers.json") as f:
        config = json.load(f)
    return {t["ticker"]: t for t in config["tickers"]}


def group_by_ticker(rows):
    out = defaultdict(list)
    for r in rows:
        out[r["ticker"]].append(r)
    for k in out:
        out[k].sort(key=lambda x: x["year"])
    return out


def analyze_cut_predictions(by_ticker, meta):
    """Para tickers categoría 'cut', verificar si Safety bajaba antes del evento."""
    results = []

    for ticker, records in by_ticker.items():
        m = meta.get(ticker)
        if not m or m["category"] not in ("cut", "value_trap"):
            continue

        event_date = m.get("event_date")
        if not event_date:
            continue

        event_year = int(event_date[:4])

        # Score 2 años antes
        record_2y_pre = next((r for r in records if r["year"] == event_year - 2), None)
        record_1y_pre = next((r for r in records if r["year"] == event_year - 1), None)
        record_event = next((r for r in records if r["year"] == event_year), None)

        s_2y = record_2y_pre["safety_score"] if record_2y_pre else None
        s_1y = record_1y_pre["safety_score"] if record_1y_pre else None
        s_event = record_event["safety_score"] if record_event else None

        q_2y = record_2y_pre["quality_score"] if record_2y_pre else None
        q_1y = record_1y_pre["quality_score"] if record_1y_pre else None
        q_event = record_event["quality_score"] if record_event else None

        # ¿Predicción?
        # Criterio: Safety < 60 en cualquiera de los 2 años pre-evento, O trend descendente claro
        predicted = False
        prediction_reason = ""

        if s_1y is not None and s_1y < SAFETY_DANGER_THRESHOLD:
            predicted = True
            prediction_reason = f"Safety {s_1y:.0f} < {SAFETY_DANGER_THRESHOLD} (1y pre)"
        elif s_2y is not None and s_2y < SAFETY_DANGER_THRESHOLD:
            predicted = True
            prediction_reason = f"Safety {s_2y:.0f} < {SAFETY_DANGER_THRESHOLD} (2y pre)"
        elif s_2y and s_1y and (s_2y - s_1y) >= 10:
            predicted = True
            prediction_reason = f"Safety drop {s_2y:.0f}→{s_1y:.0f} (-{s_2y-s_1y:.0f}pts)"

        results.append({
            "ticker": ticker,
            "name": m["name"],
            "category": m["category"],
            "event_year": event_year,
            "event_desc": m["event_description"],
            "q_2y_pre": q_2y,
            "q_1y_pre": q_1y,
            "q_event": q_event,
            "s_2y_pre": s_2y,
            "s_1y_pre": s_1y,
            "s_event": s_event,
            "predicted": predicted,
            "reason": prediction_reason or "Score did NOT signal danger pre-event",
        })

    return results


def analyze_compounders(by_ticker, meta):
    """Compounders deberían tener scores altos consistentemente."""
    results = []

    for ticker, records in by_ticker.items():
        m = meta.get(ticker)
        if not m or m["category"] != "compounder":
            continue

        # Filtrar nones
        valid = [r for r in records if r["quality_score"] is not None]
        if not valid:
            continue

        avg_q = mean(r["quality_score"] for r in valid)
        avg_s = mean(r["safety_score"] for r in valid if r["safety_score"] is not None)
        min_q = min(r["quality_score"] for r in valid)
        max_q = max(r["quality_score"] for r in valid)

        # ¿Identificado correctamente?
        identified = avg_q >= QUALITY_HIGH_THRESHOLD

        results.append({
            "ticker": ticker,
            "name": m["name"],
            "avg_q": avg_q,
            "avg_s": avg_s,
            "min_q": min_q,
            "max_q": max_q,
            "year_count": len(valid),
            "identified": identified,
        })

    return results


def write_predictions_csv(predictions, compounders):
    out = OUTPUT / "predictions_vs_actuals.csv"
    with open(out, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["category", "ticker", "name", "event_year",
                         "q_2y_pre", "q_1y_pre", "q_event",
                         "s_2y_pre", "s_1y_pre", "s_event",
                         "predicted", "reason"])
        for p in predictions:
            writer.writerow([
                p["category"], p["ticker"], p["name"], p["event_year"],
                p["q_2y_pre"], p["q_1y_pre"], p["q_event"],
                p["s_2y_pre"], p["s_1y_pre"], p["s_event"],
                p["predicted"], p["reason"],
            ])
        writer.writerow([])
        writer.writerow(["COMPOUNDERS"])
        writer.writerow(["category", "ticker", "name", "avg_q", "avg_s", "min_q", "max_q", "identified"])
        for c in compounders:
            writer.writerow([
                "compounder", c["ticker"], c["name"],
                f"{c['avg_q']:.1f}", f"{c['avg_s']:.1f}",
                f"{c['min_q']:.1f}", f"{c['max_q']:.1f}",
                c["identified"],
            ])
    print(f"  Wrote {out}")


def write_report(predictions, compounders, by_ticker, meta):
    out = OUTPUT / "report.md"

    # Stats globales
    cuts = [p for p in predictions if p["category"] == "cut"]
    cuts_predicted = [p for p in cuts if p["predicted"]]

    value_traps = [p for p in predictions if p["category"] == "value_trap"]

    comp_identified = [c for c in compounders if c["identified"]]

    # Build report
    lines = []
    lines.append("# Quality + Safety Score Backtest — Reporte\n")
    lines.append(f"Generado tras correr `backtest.py` + `analyze.py`\n\n")
    lines.append("---\n\n")

    lines.append("## Resumen ejecutivo\n\n")
    cut_recall = len(cuts_predicted) / len(cuts) if cuts else 0
    comp_precision = len(comp_identified) / len(compounders) if compounders else 0

    lines.append(f"- **Cuts predichos correctamente**: {len(cuts_predicted)}/{len(cuts)} ({cut_recall:.0%})\n")
    lines.append(f"- **Compounders identificados** (avg Q ≥ {QUALITY_HIGH_THRESHOLD}): {len(comp_identified)}/{len(compounders)} ({comp_precision:.0%})\n\n")

    if cut_recall >= 0.7 and comp_precision >= 0.8:
        lines.append("✅ **Veredicto: SISTEMA VÁLIDO** — los pesos parecen razonables, listo para implementar.\n\n")
    elif cut_recall >= 0.4 or comp_precision >= 0.6:
        lines.append("🟡 **Veredicto: ITERAR PESOS** — el sistema captura señal pero necesita ajuste fino.\n\n")
    else:
        lines.append("🔴 **Veredicto: REPENSAR FÓRMULAS** — el sistema no detecta señales claras.\n\n")

    # Detalles cuts
    lines.append("---\n\n")
    lines.append("## Análisis de cuts/disasters\n\n")
    lines.append("Para cada ticker, scores en años previos al evento:\n\n")
    lines.append("| Ticker | Event | Q-2y | Q-1y | Q-event | S-2y | S-1y | S-event | Predicho |\n")
    lines.append("|--------|-------|------|------|---------|------|------|---------|----------|\n")

    def fmt(v):
        return f"{v:.0f}" if v is not None else "—"

    for p in predictions:
        marker = "✅" if p["predicted"] else "❌"
        lines.append(
            f"| {p['ticker']} | {p['event_year']} | {fmt(p['q_2y_pre'])} | {fmt(p['q_1y_pre'])} | "
            f"{fmt(p['q_event'])} | {fmt(p['s_2y_pre'])} | {fmt(p['s_1y_pre'])} | {fmt(p['s_event'])} | {marker} |\n"
        )

    lines.append("\n### Razones por ticker\n\n")
    for p in predictions:
        marker = "✅" if p["predicted"] else "❌"
        lines.append(f"- **{p['ticker']}** {marker} ({p['event_desc']}) — {p['reason']}\n")

    # Detalles compounders
    lines.append("\n---\n\n")
    lines.append("## Análisis de compounders\n\n")
    lines.append(f"Threshold: avg Quality ≥ {QUALITY_HIGH_THRESHOLD} para considerarse identificado.\n\n")
    lines.append("| Ticker | Avg Q | Avg S | Min Q | Max Q | Identificado |\n")
    lines.append("|--------|-------|-------|-------|-------|-------------|\n")

    for c in sorted(compounders, key=lambda x: -x["avg_q"]):
        marker = "✅" if c["identified"] else "❌"
        lines.append(
            f"| {c['ticker']} | {c['avg_q']:.1f} | {c['avg_s']:.1f} | {c['min_q']:.1f} | {c['max_q']:.1f} | {marker} |\n"
        )

    # False positives — compounders mal puntuados
    false_neg_comp = [c for c in compounders if not c["identified"]]
    if false_neg_comp:
        lines.append("\n### ⚠ Compounders NO identificados (false negatives)\n\n")
        for c in false_neg_comp:
            lines.append(f"- **{c['ticker']}** {c['name']}: avg Q={c['avg_q']:.1f}, avg S={c['avg_s']:.1f}\n")
            lines.append(f"  Sospecha: posible problema en el cálculo de algún componente o fórmula sub-óptima\n")

    # False negatives — cuts no detectados
    false_neg_cuts = [p for p in predictions if not p["predicted"]]
    if false_neg_cuts:
        lines.append("\n### ⚠ Cuts NO predichos (false negatives)\n\n")
        for p in false_neg_cuts:
            lines.append(f"- **{p['ticker']}** ({p['event_desc']})\n")
            lines.append(f"  Pre-event: Q={p['q_1y_pre']}, S={p['s_1y_pre']}\n")

    # Recomendaciones
    lines.append("\n---\n\n")
    lines.append("## Recomendaciones de ajuste\n\n")

    if cut_recall < 0.7:
        lines.append("### Para mejorar detección de cuts\n")
        lines.append("- Considerar **subir peso** del componente Coverage (FCF/Div)\n")
        lines.append("- Considerar **subir peso** del componente Track Record (consistency std dev)\n")
        lines.append("- Verificar que los thresholds de FCF/Div coverage no son demasiado generosos\n")
        lines.append("- El threshold de 'danger' (Safety < 60) puede estar demasiado bajo\n\n")

    if comp_precision < 0.8:
        lines.append("### Para mejorar identificación de compounders\n")
        lines.append("- Verificar que penalty data missing no está penalizando excesivamente\n")
        lines.append("- Considerar **bajar peso** de Predictability proxy (puede estar mal calibrado)\n")
        lines.append("- Verificar fórmula sector-adjusted de FCF margin\n\n")

    lines.append("### Próximos pasos\n")
    lines.append("1. Revisar `output/scores_history.csv` para ver scores año por año\n")
    lines.append("2. Identificar componentes específicos que dan señal vs ruido (drill down en `score_components`)\n")
    lines.append("3. Iterar fórmulas en `score_calculator.py` y re-correr (cache hace que sea instant)\n")
    lines.append("4. Cuando los resultados convenzan → portar lógica a producción siguiendo `docs/quality-safety-score-design.md`\n")

    with open(out, "w") as f:
        f.writelines(lines)

    print(f"  Wrote {out}")


def main():
    if not (OUTPUT / "scores_history.csv").exists():
        print("✗ scores_history.csv no existe — ejecuta primero: python backtest.py")
        return

    print("Loading scores...")
    rows = load_scores()
    meta = load_tickers_meta()
    by_ticker = group_by_ticker(rows)

    print(f"Loaded {len(rows)} score records for {len(by_ticker)} tickers")

    print("\nAnalyzing predictions...")
    predictions = analyze_cut_predictions(by_ticker, meta)

    print("Analyzing compounders...")
    compounders = analyze_compounders(by_ticker, meta)

    print("\nWriting outputs...")
    write_predictions_csv(predictions, compounders)
    write_report(predictions, compounders, by_ticker, meta)

    # Print summary to console
    cuts = [p for p in predictions if p["category"] == "cut"]
    cuts_predicted = [p for p in cuts if p["predicted"]]
    comp_identified = [c for c in compounders if c["identified"]]

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"Cuts predicted:       {len(cuts_predicted)}/{len(cuts)} ({len(cuts_predicted)/len(cuts):.0%} recall)" if cuts else "No cuts to evaluate")
    print(f"Compounders ID'd:     {len(comp_identified)}/{len(compounders)} ({len(comp_identified)/len(compounders):.0%} precision)" if compounders else "No compounders to evaluate")
    print()
    print("See output/report.md for details")


if __name__ == "__main__":
    main()
