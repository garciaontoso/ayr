# Score Backtest — Quality + Safety histórico 2018-2025

Validación retroactiva del Quality Score y Dividend Safety Score 2.0 (diseñados en `docs/quality-safety-score-design.md`) sobre 25 tickers conocidos para verificar:

1. **¿Predijeron los recortes famosos?** (T 2022, KHC 2019, WBA 2024, INTC 2023, VFC 2023, MMM 2022, DIS 2020, etc.)
2. **¿Identificaron los compounders ganadores?** (MSFT, V, MA, AAPL, COST, etc.)
3. **¿Los pesos de la fórmula están bien calibrados?**

Este experimento es **standalone** — no toca código de producción. Vive en `experiments/`, no se importa desde nada, no commitea outputs.

## Por qué este backtest

Los módulos `discovery-engine`, `earnings-intelligence`, `proceso-module` y `quality-safety-score` dependen de que el scoring funcione. Si el score no predice cosas obvias retroactivamente (como que KHC iba a recortar), no podemos confiar en él para decisiones futuras. Mejor saberlo antes de invertir días implementando.

## Estructura

```
experiments/score-backtest/
├── README.md                  # este archivo
├── requirements.txt           # dependencias Python
├── .env.example               # plantilla credenciales
├── tickers.json               # 25 tickers de prueba con metadata
├── fmp_client.py              # wrapper FMP con caching local
├── score_calculator.py        # implementación de las fórmulas
├── backtest.py                # runner principal
├── analyze.py                 # análisis y reporte de resultados
├── cache/                     # FMP responses cacheadas (gitignored)
└── output/                    # resultados (gitignored)
    ├── scores_history.csv     # scores por ticker × año
    ├── predictions_vs_actuals.csv
    └── report.md              # reporte legible
```

## Setup

### 1. Python 3.10+
```bash
cd experiments/score-backtest
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Credenciales
```bash
cp .env.example .env
# Edita .env y pon tu FMP_KEY
```

> ⚠ **NO commitees el .env**. Está en .gitignore.

### 3. Ejecutar
```bash
# Backtest completo (puede tardar 5-15 min la primera vez por las queries)
python backtest.py

# Tras backtest, generar análisis
python analyze.py
```

## Outputs esperados

### `output/scores_history.csv`
Tabla wide con un row por (ticker, año) y columnas para cada componente del score.

```
ticker,year,quality_score,quality_profitability,quality_balance_sheet,...,safety_score,safety_coverage,...
KO,2018,84,22,18,...,89,28,...
KO,2019,86,23,19,...,90,28,...
...
KHC,2018,52,12,15,...,48,18,...
KHC,2019,38,9,14,...,28,9,...   <-- antes del recorte feb 2019
```

### `output/predictions_vs_actuals.csv`
Para cada ticker conocido por evento (cut/disaster/compounder), muestra:
- Score 1 año antes del evento
- Score 6 meses antes
- Score en el momento del evento
- Si el score lo "predijo" (umbral configurable)

### `output/report.md`
Reporte legible con:
- ✓ Cuts predichos correctamente
- ✗ Cuts NO predichos (false negatives)
- ⚠ Compounders mal puntuados (false positives)
- Estadísticas globales (precision, recall, accuracy)
- Recomendaciones de ajuste de pesos si los resultados no convencen

## Limitaciones honestas

- **FMP cobertura**: para tickers internacionales (BME, HKG) puede haber huecos. Skip esos
- **Históricos de analyst estimates**: difícil obtener — algunos componentes (forward visibility) usan proxies
- **Sector benchmarks históricos**: simplificado al sector actual, no recalculado por año
- **Earnings predictability**: requiere historial de surprises — usa el actual como proxy del histórico cercano
- **No es ciencia perfecta**: el objetivo es validar dirección general, no precisión decimal
- **Survivor bias**: tickers que quebraron (BBBY, etc.) pueden no estar fácilmente disponibles en FMP histórico

## Interpretación de resultados

### Si funciona (>70% accuracy en cuts, >80% identificando top compounders)
✅ Confianza alta para implementar en producción tal como está diseñado.

### Si falla parcialmente (40-70%)
🟡 Iterar pesos. El doc `quality-safety-score-design.md` tiene los pesos como hipótesis, no como verdad. Ajustar y re-correr.

### Si falla feo (<40%)
🔴 Repensar fórmulas. Algunos componentes pueden estar capturando ruido en lugar de señal. Volver a primer principios.

## Coste estimado FMP

- 25 tickers × 4 endpoints × 8 años = 800 calls (uno-time)
- Con caching local, re-runs son gratis
- En plan FMP Global, totalmente cubierto

## Dependencias

- `requests` — HTTP a FMP
- `python-dotenv` — cargar .env
- `pandas` — procesar resultados
- `tabulate` — output legible en markdown

Sin LLMs. Sin cloud. Sin nada exótico. Es un script de cálculo puro.
