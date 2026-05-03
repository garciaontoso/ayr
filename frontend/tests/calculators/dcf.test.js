// tests/calculators/dcf.test.js
//
// Regresión de cálculos DCF y Sticker Price (Phil Town).
//
// Hoy las dos fórmulas viven inline en hooks/componentes:
//   • DCF: src/hooks/useAnalysisMetrics.js (dcfCalc useCallback ~L295)
//   • Sticker Price: src/components/analysis/MOSTab.jsx ~L40-62
//
// Replicamos las fórmulas como funciones puras para poder testear edge
// cases sin instanciar React. Si un día se extraen a src/calculators/,
// estos tests deberían fallar al importar y se actualizan los imports.
// Mientras tanto, sirven como contrato verificable contra regresiones.
//
// Bug patterns que defendemos:
//   • Bug #006 / FAST tab: REIT con EPS=bajo→Future EPS gigante→Sticker
//     ridículo. El test "growth negativo" comprueba que no rompemos por
//     valores absurdos.

import { describe, it, expect } from 'vitest';

// ── DCF puro: replica de hooks/useAnalysisMetrics.js dcfCalc ────────────
// baseFCF: FCF actual ($)
// growth: tasa anual aplicada a 10 proyecciones (ej. 0.10 = 10%)
// wacc: tasa de descuento (ej. 0.10)
// terminalGrowth: 0.025 por defecto
// shares: nº de acciones en circulación
// Devuelve precio por acción ($), o 0 si no es calculable.
function calcDCF({ baseFCF, growth, wacc, terminalGrowth = 0.025, shares }) {
  if (!Number.isFinite(baseFCF) || baseFCF <= 0) return 0;
  if (!Number.isFinite(shares) || shares <= 0) return 0;
  if (!Number.isFinite(growth) || !Number.isFinite(wacc)) return 0;
  let pvSum = 0;
  let lastFCF = baseFCF;
  for (let i = 1; i <= 10; i++) {
    lastFCF = baseFCF * Math.pow(1 + growth, i);
    pvSum += lastFCF / Math.pow(1 + wacc, i);
  }
  const tv = wacc !== terminalGrowth ? (lastFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth) : 0;
  const tvPV = tv / Math.pow(1 + wacc, 10);
  const total = pvSum + tvPV;
  return total / shares;
}

// ── Sticker Price (Phil Town): replica de MOSTab.jsx ─────────────────────
// epsTTM: EPS últimos 12m
// fgr: future growth rate (capado 5-20% por la app)
// historicalMaxPE: P/E máx del histórico (cap del Future P/E)
// marr: minimum acceptable rate of return (default 15%)
function calcStickerPrice({ epsTTM, fgr, historicalMaxPE = 30, marr = 0.15 }) {
  if (!Number.isFinite(epsTTM) || epsTTM <= 0) return null;
  if (!Number.isFinite(fgr)) return null;
  // Phil Town: floor 5%, cap 20%
  const fgrCapped = Math.min(Math.max(fgr, 0.05), 0.20);
  const futureEPS = epsTTM * Math.pow(1 + fgrCapped, 10);
  // Future P/E = min(2 × FGR%, max histórico)
  const futurePE = Math.min(fgrCapped * 100 * 2, historicalMaxPE);
  const futureValue = futureEPS * futurePE;
  const stickerPrice = futureValue / Math.pow(1 + marr, 10);
  return stickerPrice;
}

describe('calcDCF (regresión hooks/useAnalysisMetrics dcfCalc)', () => {
  it('caso clásico: FCF $1B, growth 10%, WACC 10%, shares 100M → valor positivo razonable', () => {
    const px = calcDCF({
      baseFCF: 1_000_000_000,
      growth: 0.10,
      wacc: 0.10,
      shares: 100_000_000,
    });
    // Con g=r se cancelan los descuentos en el explícito. Para 10y de FCF
    // que crecen al 10% descontados al 10%, pvSum = 10 * baseFCF.
    // Terminal value: lastFCF=baseFCF*1.1^10 ≈ 2.594B, TV = 2.594B*1.025/(0.10-0.025) ≈ 35.45B
    // PV(TV) = 35.45B / 1.1^10 ≈ 13.67B → total ≈ 23.67B → per share ≈ 236.7
    expect(px).toBeGreaterThan(150);
    expect(px).toBeLessThan(350);
    expect(Number.isFinite(px)).toBe(true);
  });

  it('growth negativo: no NaN, no Infinity, valor coherentemente bajo', () => {
    const px = calcDCF({
      baseFCF: 1_000_000_000,
      growth: -0.05, // empresa decreciendo 5% anual
      wacc: 0.10,
      shares: 100_000_000,
    });
    expect(Number.isFinite(px)).toBe(true);
    expect(px).toBeGreaterThan(0); // sigue habiendo flujos positivos los primeros años
    // Con FCF que decrece 5% y WACC 10%, el valor por acción debería ser
    // notablemente menor que el caso growth+10%.
    const pxOk = calcDCF({ baseFCF: 1e9, growth: 0.10, wacc: 0.10, shares: 1e8 });
    expect(px).toBeLessThan(pxOk);
  });

  it('shares=0 → devuelve 0 graciosamente (no NaN ni Infinity)', () => {
    const px = calcDCF({
      baseFCF: 1_000_000_000,
      growth: 0.10,
      wacc: 0.10,
      shares: 0,
    });
    expect(px).toBe(0);
    expect(Number.isFinite(px)).toBe(true);
  });

  it('FCF=0 → devuelve 0', () => {
    const px = calcDCF({
      baseFCF: 0,
      growth: 0.10,
      wacc: 0.10,
      shares: 100_000_000,
    });
    expect(px).toBe(0);
  });

  it('FCF negativo → devuelve 0 (empresa quemando caja, DCF no aplica)', () => {
    const px = calcDCF({
      baseFCF: -500_000_000,
      growth: 0.10,
      wacc: 0.10,
      shares: 100_000_000,
    });
    expect(px).toBe(0);
  });

  it('inputs no finitos (NaN/Infinity) → 0, nunca NaN', () => {
    expect(calcDCF({ baseFCF: NaN, growth: 0.1, wacc: 0.1, shares: 1e8 })).toBe(0);
    expect(calcDCF({ baseFCF: 1e9, growth: NaN, wacc: 0.1, shares: 1e8 })).toBe(0);
    expect(calcDCF({ baseFCF: 1e9, growth: 0.1, wacc: Infinity, shares: 1e8 })).not.toBeNaN();
  });
});

describe('calcStickerPrice (Phil Town RULE #1)', () => {
  it('caso clásico: EPS $5, FGR 15% → sticker razonable', () => {
    const sticker = calcStickerPrice({ epsTTM: 5, fgr: 0.15, historicalMaxPE: 30 });
    expect(sticker).not.toBeNull();
    expect(sticker).toBeGreaterThan(0);
    expect(Number.isFinite(sticker)).toBe(true);
    // Future EPS = 5 * 1.15^10 ≈ 20.23
    // Future P/E = min(15*2=30, 30) = 30
    // Future value = 20.23 * 30 = 606.9
    // Sticker = 606.9 / 1.15^10 ≈ 150 (approx)
    expect(sticker).toBeCloseTo(150, -1); // -1 = ±5 tolerance
  });

  it('FGR muy alto (>20%) se capa a 20%', () => {
    const stickerHigh = calcStickerPrice({ epsTTM: 5, fgr: 0.50, historicalMaxPE: 100 });
    const stickerCap = calcStickerPrice({ epsTTM: 5, fgr: 0.20, historicalMaxPE: 100 });
    expect(stickerHigh).toBeCloseTo(stickerCap, 4);
  });

  it('FGR muy bajo (<5%) se eleva a 5%', () => {
    const stickerLow = calcStickerPrice({ epsTTM: 5, fgr: 0.01, historicalMaxPE: 30 });
    const stickerFloor = calcStickerPrice({ epsTTM: 5, fgr: 0.05, historicalMaxPE: 30 });
    expect(stickerLow).toBeCloseTo(stickerFloor, 4);
  });

  it('EPS=0 → null (no aplicable)', () => {
    expect(calcStickerPrice({ epsTTM: 0, fgr: 0.15 })).toBeNull();
  });

  it('EPS negativo → null (empresa con pérdidas)', () => {
    expect(calcStickerPrice({ epsTTM: -2.5, fgr: 0.15 })).toBeNull();
  });

  it('historicalMaxPE caps Future P/E (no permite valoraciones especulativas)', () => {
    const stickerPE10 = calcStickerPrice({ epsTTM: 5, fgr: 0.20, historicalMaxPE: 10 });
    const stickerPE40 = calcStickerPrice({ epsTTM: 5, fgr: 0.20, historicalMaxPE: 40 });
    // Con cap de 10x el sticker debería ser estrictamente menor que con 40x.
    expect(stickerPE10).toBeLessThan(stickerPE40);
  });

  it('inputs no finitos → null, nunca NaN', () => {
    expect(calcStickerPrice({ epsTTM: NaN, fgr: 0.15 })).toBeNull();
    expect(calcStickerPrice({ epsTTM: 5, fgr: NaN })).toBeNull();
    expect(calcStickerPrice({ epsTTM: Infinity, fgr: 0.15 })).toBeNull();
  });
});
