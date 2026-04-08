// ─────────────────────────────────────────────────────────────
// useFxRates — single source of truth for currency conversion.
//
// fxRates uses USD as base, e.g. { USD:1, EUR:0.876, CNY:7.24 }.
// "EUR rate of 0.876" = 0.876 EUR per 1 USD.
//
// To go USD → EUR:  amountUSD * fxRates.EUR
// To go EUR → USD:  amountEUR / fxRates.EUR  (== amountEUR * usdEur)
//
// Many tabs were doing `fxRates?.EUR ? 1/fxRates.EUR : 1.18` inline
// with divergent fallbacks (1.10, 1.15, 1.18, 1.177). This hook
// centralizes the inverse and the fallback so a single edit fixes
// all consumers.
//
// Returns:
//   eurUsd — EUR per USD (direct from fxRates), 0..1 range
//   usdEur — USD per EUR (inverse), ~1.14 range
//   cnyUsd — CNY per USD (direct), ~7.x range
//   usdCny — USD per CNY (inverse), ~0.14 range
//   raw    — original fxRates object for advanced use
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';

// Fallbacks aligned with constants/index.js DEFAULT_FX (2026-04-08).
// USD-base convention: 1 USD = X foreign currency.
const FALLBACK_EUR = 0.876;   // 0.876 EUR per USD
const FALLBACK_CNY = 7.24;    // 7.24 CNY per USD

export function useFxRates(fxRates) {
  return useMemo(() => {
    const eur = Number(fxRates?.EUR) > 0 ? Number(fxRates.EUR) : FALLBACK_EUR;
    const cny = Number(fxRates?.CNY) > 0 ? Number(fxRates.CNY) : FALLBACK_CNY;
    return {
      eurUsd: eur,
      usdEur: 1 / eur,
      cnyUsd: cny,
      usdCny: 1 / cny,
      raw: fxRates || {},
    };
  }, [fxRates]);
}

export default useFxRates;
