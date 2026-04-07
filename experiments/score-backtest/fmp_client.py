"""FMP API client con caching local en disco.

Reduce queries a FMP a 1 sola vez por (ticker, endpoint). Re-runs son gratis.
Cache invalidation: borrar manualmente el directorio cache/ si necesitas refresh.
"""
import json
import os
import time
from pathlib import Path
from typing import Any, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

FMP_KEY = os.getenv("FMP_KEY")
if not FMP_KEY:
    raise RuntimeError("Missing FMP_KEY in .env. Cópialo de .env.example y rellena.")

BASE_URL = "https://financialmodelingprep.com/api"
CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

# Rate limiting muy básico — FMP Global permite mucho pero seamos amables
LAST_CALL_TIME = 0.0
MIN_INTERVAL_SEC = 0.05  # 20 calls/sec max


def _rate_limit():
    global LAST_CALL_TIME
    elapsed = time.time() - LAST_CALL_TIME
    if elapsed < MIN_INTERVAL_SEC:
        time.sleep(MIN_INTERVAL_SEC - elapsed)
    LAST_CALL_TIME = time.time()


def _cache_path(endpoint: str, params: dict) -> Path:
    safe = endpoint.replace("/", "_").replace("?", "_")
    params_str = "_".join(f"{k}={v}" for k, v in sorted(params.items()) if k != "apikey")
    fname = f"{safe}__{params_str}.json"
    # Truncar nombres muy largos
    if len(fname) > 200:
        fname = fname[:200] + ".json"
    return CACHE_DIR / fname


def fmp_get(endpoint: str, params: Optional[dict] = None, force_refresh: bool = False) -> Any:
    """GET FMP endpoint con caching disco.

    endpoint ejemplo: 'v3/income-statement/AAPL'
    params: dict de query params (sin apikey, se añade auto)
    """
    params = params or {}
    cache_file = _cache_path(endpoint, params)

    if cache_file.exists() and not force_refresh:
        with open(cache_file) as f:
            return json.load(f)

    _rate_limit()
    url = f"{BASE_URL}/{endpoint}"
    full_params = {**params, "apikey": FMP_KEY}

    try:
        r = requests.get(url, params=full_params, timeout=30)
        r.raise_for_status()
        data = r.json()
    except requests.HTTPError as e:
        print(f"  ✗ HTTP {r.status_code} for {endpoint}")
        return None
    except Exception as e:
        print(f"  ✗ Error fetching {endpoint}: {e}")
        return None

    with open(cache_file, "w") as f:
        json.dump(data, f, indent=2)

    return data


# ─────────────────────────────────────────────────────────────────
# Wrappers de alto nivel para los endpoints que usamos
# ─────────────────────────────────────────────────────────────────

def income_statement(ticker: str, years: int = 10) -> list:
    """Income statement anual, ordenado del más reciente al más antiguo."""
    data = fmp_get(f"v3/income-statement/{ticker}", {"period": "annual", "limit": years})
    return data or []


def balance_sheet(ticker: str, years: int = 10) -> list:
    data = fmp_get(f"v3/balance-sheet-statement/{ticker}", {"period": "annual", "limit": years})
    return data or []


def cash_flow(ticker: str, years: int = 10) -> list:
    data = fmp_get(f"v3/cash-flow-statement/{ticker}", {"period": "annual", "limit": years})
    return data or []


def key_metrics(ticker: str, years: int = 10) -> list:
    """Métricas pre-calculadas: ROIC, payout ratio, debt/EBITDA, etc."""
    data = fmp_get(f"v3/key-metrics/{ticker}", {"period": "annual", "limit": years})
    return data or []


def ratios(ticker: str, years: int = 10) -> list:
    """Ratios financieros pre-calculados."""
    data = fmp_get(f"v3/ratios/{ticker}", {"period": "annual", "limit": years})
    return data or []


def dividend_history(ticker: str) -> dict:
    """Historial completo de dividendos pagados."""
    data = fmp_get(f"v3/historical-price-full/stock_dividend/{ticker}")
    return data or {}


def profile(ticker: str) -> dict:
    """Perfil empresa: sector, industry, market cap, beta."""
    data = fmp_get(f"v3/profile/{ticker}")
    return data[0] if data else {}


def historical_price(ticker: str, from_date: str, to_date: str) -> list:
    """Precios históricos en rango."""
    data = fmp_get(
        f"v3/historical-price-full/{ticker}",
        {"from": from_date, "to": to_date},
    )
    if data and "historical" in data:
        return data["historical"]
    return []


def earnings_surprises(ticker: str) -> list:
    """Histórico de surprises EPS."""
    data = fmp_get(f"v3/earnings-surprises/{ticker}")
    return data or []
