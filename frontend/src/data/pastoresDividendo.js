// "Pastores del Dividendo" — curated watchlist with buy-zone ranges.
//
// Source: user-curated list (Excel screenshot, 2026-05-03) + manual additions
// (LVMH ya estaba en la foto; Aena ya estaba; añadidos Unilever + Reckitt).
// Currency assumed EUR for all (ranges in EUR per share).
//
// Format per row:
//   name    — display name (Spanish)
//   ticker  — FMP / Yahoo symbol with exchange suffix
//             .MC = Bolsa de Madrid (Spanish)
//             .PA = Euronext Paris
//             .DE = Xetra (Frankfurt)
//             .L  = London Stock Exchange
//             .MI = Borsa Italiana
//   buyLow  — bottom of buy range (precio objetivo conservador)
//   buyHigh — top of buy range (precio "razonable")
//   currency — defaults to 'EUR'
//
// UI logic: precio actual ≤ buyLow → verde (mejor zona); entre buyLow y buyHigh
// → amarillo (zona aceptable); > buyHigh → rojo (esperar caída).

export const PASTORES_DIVIDENDO = [
  // ── Bancos españoles ──
  { name: 'Banco Sabadell', ticker: 'SAB.MC',  buyLow: 2.70,  buyHigh: 3.50,  currency: 'EUR' },
  { name: 'CaixaBank',      ticker: 'CABK.MC', buyLow: 8.00,  buyHigh: 10.00, currency: 'EUR' },
  { name: 'BBVA',           ticker: 'BBVA.MC', buyLow: 14.00, buyHigh: 18.00, currency: 'EUR' },

  // ── Telecom + energía ──
  { name: 'Telefónica',     ticker: 'TEF.MC',  buyLow: 2.80,  buyHigh: 3.40,  currency: 'EUR' },
  { name: 'Repsol',         ticker: 'REP.MC',  buyLow: 11.50, buyHigh: 14.50, currency: 'EUR' },
  { name: 'TotalEnergies',  ticker: 'TTE.PA',  buyLow: 55.00, buyHigh: 68.00, currency: 'EUR' },

  // ── Construcción + infraestructura ──
  { name: 'ACS',            ticker: 'ACS.MC',  buyLow: 65.00, buyHigh: 80.00, currency: 'EUR' },
  { name: 'Ferrovial',      ticker: 'FER.MC',  buyLow: 43.60, buyHigh: 72.67, currency: 'EUR' },
  { name: 'Aena',           ticker: 'AENA.MC', buyLow: 22.00, buyHigh: 25.00, currency: 'EUR' },

  // ── Auto / industrial ──
  { name: 'CIE Automotive', ticker: 'CIE.MC',  buyLow: 28.00, buyHigh: 33.00, currency: 'EUR' },
  { name: 'Gestamp',        ticker: 'GEST.MC', buyLow: 2.20,  buyHigh: 2.70,  currency: 'EUR' },
  { name: 'Logista',        ticker: 'LOG.MC',  buyLow: 27.00, buyHigh: 31.00, currency: 'EUR' },

  // ── Lujo / consumo premium ──
  { name: 'LVMH',           ticker: 'MC.PA',   buyLow: 550.00, buyHigh: 650.00, currency: 'EUR' },
  { name: 'Ferrari',        ticker: 'RACE.MI', buyLow: 300.00, buyHigh: 380.00, currency: 'EUR' },
  { name: 'Porsche AG',     ticker: 'P911.DE', buyLow: 30.00,  buyHigh: 40.00,  currency: 'EUR' },

  // ── Industria europea + química ──
  { name: 'Schneider Electric', ticker: 'SU.PA', buyLow: 210.00, buyHigh: 245.00, currency: 'EUR' },
  { name: 'Air Liquide',    ticker: 'AI.PA',   buyLow: 148.00, buyHigh: 205.56, currency: 'EUR' },

  // ── Aseguradoras ──
  { name: 'Allianz',        ticker: 'ALV.DE',  buyLow: 310.91, buyHigh: 427.50, currency: 'EUR' },

  // ── Consumo defensivo (UK) ──
  // Unilever cotiza tanto en LSE (.L en GBP / GBp pence) como ADR US (UL).
  // Reckitt sólo LSE. Rangos pendientes — el usuario deberá fijarlos.
  { name: 'Unilever',       ticker: 'ULVR.L',  buyLow: null,   buyHigh: null,  currency: 'GBP', pendingRange: true },
  { name: 'Reckitt',        ticker: 'RKT.L',   buyLow: null,   buyHigh: null,  currency: 'GBP', pendingRange: true },
];

// Helper — derive zone color from current price relative to ranges.
// Returns one of 'green' | 'yellow' | 'red' | 'gray' (no data).
export function priceZone(price, low, high) {
  if (price == null || low == null || high == null) return 'gray';
  if (price <= low) return 'green';
  if (price <= high) return 'yellow';
  return 'red';
}

export function zoneColors(zone) {
  return {
    green:  { bg: 'rgba(48,209,88,.12)',  fg: '#30d158', label: 'COMPRA' },
    yellow: { bg: 'rgba(255,214,10,.12)', fg: '#ffd60a', label: 'ZONA' },
    red:    { bg: 'rgba(255,69,58,.12)',  fg: '#ff453a', label: 'CARO' },
    gray:   { bg: 'rgba(142,142,147,.10)',fg: '#8e8e93', label: 'S/D' },
  }[zone] || { bg: 'rgba(142,142,147,.10)', fg: '#8e8e93', label: 'S/D' };
}

export const PASTORES_TAB_ID = 'pastores_dividendo';
export const PASTORES_TAB_NAME = 'Pastores del Dividendo';
