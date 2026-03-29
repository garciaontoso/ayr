import { _sf } from './formatters.js';
import { CURRENCIES, DEFAULT_FX } from '../constants/index.js';

// Convert amount from one currency to display currency using fx rates
// fxRates = { USD: 1, EUR: 0.92, GBP: 0.79, ... } (all relative to USD)
export const convertCcy = (amount, fromCcy, toCcy, fxRates) => {
  if(amount == null || isNaN(amount)) return null;
  if(fromCcy === toCcy) return amount;
  if(!fxRates || !fxRates[fromCcy] || !fxRates[toCcy]) return amount;
  let adjAmount = amount;
  let adjFrom = fromCcy;
  if(fromCcy === "GBX") { adjAmount = amount / 100; adjFrom = "GBP"; }
  let adjTo = toCcy;
  if(toCcy === "GBX") { adjTo = "GBP"; }
  const inUSD = adjAmount / (fxRates[adjFrom] || 1);
  return inUSD * (fxRates[adjTo] || 1);
};

// Format with currency symbol
export const fCcy = (amount, ccy, fxRates, displayCcy) => {
  const converted = displayCcy && displayCcy !== ccy ? convertCcy(amount, ccy, displayCcy, fxRates) : amount;
  if(converted == null || isNaN(converted)) return "—";
  const sym = CURRENCIES[displayCcy||ccy]?.symbol || "$";
  return `${sym}${_sf(converted,2)}`;
};

// Fetch live FX rates from free APIs (no API key needed)
export async function fetchFxRates() {
  const apis = [
    {
      url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,CAD,AUD,HKD,JPY,CHF,DKK,SEK,NOK,SGD,CNY",
      parse: (data) => {
        if (!data.rates?.EUR) return null;
        return { USD: 1, ...data.rates, GBX: data.rates.GBP };
      }
    },
    {
      url: "https://open.er-api.com/v6/latest/USD",
      parse: (data) => {
        if (!data.rates?.EUR) return null;
        const r = data.rates;
        return { USD:1, EUR:r.EUR, GBP:r.GBP, CAD:r.CAD, AUD:r.AUD, HKD:r.HKD, JPY:r.JPY, CHF:r.CHF, DKK:r.DKK, SEK:r.SEK, NOK:r.NOK, SGD:r.SGD, CNY:r.CNY, GBX:r.GBP };
      }
    }
  ];
  for (const api of apis) {
    try {
      const response = await fetch(api.url);
      if (!response.ok) continue;
      const data = await response.json();
      const rates = api.parse(data);
      if (rates) { return rates; }
    } catch(e) { console.warn("FX API failed:", api.url, e); }
  }
  console.warn("All FX APIs failed, using defaults");
  return null;
}
