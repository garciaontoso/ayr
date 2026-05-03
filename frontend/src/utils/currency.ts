import { _sf } from './formatters';
import { CURRENCIES } from '../constants/index.js';

// FX-rates type — string-keyed because consumers (tests, FX APIs) may pass
// arbitrary currency codes. The functions degrade gracefully when keys are
// missing rather than throwing.
export type FxRateMap = Record<string, number> | null | undefined;

interface CurrencyMetaLike {
  symbol: string;
  name?: string;
  flag?: string;
  parentCcy?: string;
  divisor?: number;
}

// Convert amount from one currency to display currency using fx rates
// fxRates = { USD: 1, EUR: 0.92, GBP: 0.79, ... } (all relative to USD)
export const convertCcy = (
  amount: number | null | undefined,
  fromCcy: string,
  toCcy: string,
  fxRates: FxRateMap,
): number | null => {
  if (amount == null || isNaN(amount)) return null;
  if (fromCcy === toCcy) return amount;
  if (!fxRates || !fxRates[fromCcy] || !fxRates[toCcy]) return amount;
  let adjAmount: number = amount;
  let adjFrom: string = fromCcy;
  if (fromCcy === 'GBX') { adjAmount = amount / 100; adjFrom = 'GBP'; }
  let adjTo: string = toCcy;
  if (toCcy === 'GBX') { adjTo = 'GBP'; }
  const inUSD = adjAmount / (fxRates[adjFrom] || 1);
  return inUSD * (fxRates[adjTo] || 1);
};

// Format with currency symbol
export const fCcy = (
  amount: number | null | undefined,
  ccy: string,
  fxRates: FxRateMap,
  displayCcy?: string,
): string => {
  const converted = displayCcy && displayCcy !== ccy ? convertCcy(amount, ccy, displayCcy, fxRates) : amount;
  if (converted == null || isNaN(converted)) return '—';
  const meta = (CURRENCIES as Record<string, CurrencyMetaLike | undefined>)[displayCcy || ccy];
  const sym = meta?.symbol || '$';
  return `${sym}${_sf(converted, 2)}`;
};

interface FxApiSpec {
  url: string;
  parse: (data: unknown) => Record<string, number> | null;
}

// Fetch live FX rates from free APIs (no API key needed)
export async function fetchFxRates(): Promise<Record<string, number> | null> {
  const apis: FxApiSpec[] = [
    {
      url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,CAD,AUD,HKD,JPY,CHF,DKK,SEK,NOK,SGD,CNY',
      parse: (data: unknown) => {
        const d = data as { rates?: Record<string, number> } | null;
        if (!d?.rates?.EUR) return null;
        return { USD: 1, ...d.rates, GBX: d.rates.GBP };
      },
    },
    {
      url: 'https://open.er-api.com/v6/latest/USD',
      parse: (data: unknown) => {
        const d = data as { rates?: Record<string, number> } | null;
        if (!d?.rates?.EUR) return null;
        const r = d.rates;
        return { USD: 1, EUR: r.EUR, GBP: r.GBP, CAD: r.CAD, AUD: r.AUD, HKD: r.HKD, JPY: r.JPY, CHF: r.CHF, DKK: r.DKK, SEK: r.SEK, NOK: r.NOK, SGD: r.SGD, CNY: r.CNY, GBX: r.GBP };
      },
    },
  ];
  for (const api of apis) {
    try {
      const response = await fetch(api.url);
      if (!response.ok) continue;
      const data = await response.json();
      const rates = api.parse(data);
      if (rates) { return rates; }
    } catch (e) { console.warn('FX API failed:', api.url, e); }
  }
  console.warn('All FX APIs failed, using defaults');
  return null;
}
