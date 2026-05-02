// Shared strategy color palette. Exports BOTH:
//   STRATEGY_HEX:  flat hex per strategy (for line/text/border colors)
//   STRATEGY_RGBA: { bg, border, text } objects (for chip-style badges)
//
// Audit 2026-05-02: previously duplicated in PnLTab.jsx and OpenOptionsTab.jsx
// with conflicting colors (CSP green in one, blue in other). Single source now.
//
// Color rationale:
//   CSP / SP   = green     (premium-collected short puts)
//   CC / SC    = purple    (premium-collected short calls)
//   BPS        = green-light (defined-risk credit spread, bullish)
//   BCS        = red       (defined-risk credit spread, bearish)
//   IC         = yellow    (range-bound)
//   LP         = blue      (long puts — typically hedge)
//   LC         = light blue (long calls — directional)
//   SCALP      = orange    (intraday/weekly index)
//   OPT/Other  = slate     (uncategorized)

export const STRATEGY_HEX = {
  CSP:   '#10b981',
  SP:    '#10b981',
  CC:    '#a855f7',
  SC:    '#a855f7',
  BPS:   '#34d399',
  BCS:   '#ef4444',
  IC:    '#eab308',
  LP:    '#60a5fa',
  LC:    '#5b9bd5',
  SCALP: '#ff9f0a',
  OPT:   '#94a3b8',
  Other: '#94a3b8',
};

export const STRATEGY_RGBA = Object.fromEntries(
  Object.entries(STRATEGY_HEX).map(([k, hex]) => {
    // Convert #RRGGBB → rgb tuple → rgba bg/border with consistent opacities
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [k, {
      bg:     `rgba(${r},${g},${b},.15)`,
      border: `rgba(${r},${g},${b},.4)`,
      text:   hex,
    }];
  })
);

export const STRATEGY_DESC = {
  CSP: 'Cash-Secured Puts',
  CC: 'Covered Calls',
  BPS: 'Bull Put Spread',
  BCS: 'Bear Call Spread',
  IC: 'Iron Condor',
  LP: 'Long Puts (compradas)',
  LC: 'Long Calls (compradas)',
  SP: 'Short Put',
  SC: 'Short Call',
  SCALP: 'Scalp/0DTE índices (SPX/SPXW/NDX/RUTW ≤7d)',
  OPT: 'Otros / sin categorizar',
  Other: 'Otros / sin categorizar',
};

// Backwards-compat: some files import as STRATEGY_COLORS expecting flat hex
export const STRATEGY_COLORS = STRATEGY_HEX;
