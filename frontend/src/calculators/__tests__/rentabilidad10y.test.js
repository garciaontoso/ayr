import { describe, it, expect } from 'vitest';
import {
  calcCAGR,
  calcCoefHabilidad,
  projectBpa,
  calcCagrPrecio,
  calcRentabilidad10y,
  getDefaultPeRange,
  applyOverrides,
  extractGlobalConfig,
} from '../rentabilidad10y';

describe('calcCAGR — orden index 0 = más reciente', () => {
  it('positive growth typical KO scenario (10 snapshots = 9 años elapsed)', () => {
    // Revenue de KO: 36B (-9y) → 47B (hoy). Array length=10, time span 9 años.
    // CAGR = (47/36)^(1/9) − 1 = 0.0299
    const arr = [47000, 46000, 44000, 43500, 42000, 41000, 39000, 38000, 37000, 36000];
    const cagr = calcCAGR(arr);
    expect(cagr).toBeCloseTo(Math.pow(47000/36000, 1/9) - 1, 4);
  });

  it('handles single null at start', () => {
    // EPS más reciente null (datos incompletos) — usa el primer válido
    const arr = [null, 2.50, 2.40, 2.30, 2.20, 2.10, 2.00, 1.90, 1.80, 1.70];
    // recent = 2.50 (idx 1), oldest = 1.70 (idx 9), years = 8
    const cagr = calcCAGR(arr);
    expect(cagr).toBeCloseTo(Math.pow(2.50/1.70, 1/8) - 1, 4);
  });

  it('returns null if all null', () => {
    expect(calcCAGR([null, null, null])).toBeNull();
  });

  it('returns null for negative or zero values (Phil Town inválido)', () => {
    expect(calcCAGR([100, 50, -25])).toBeNull();   // signo cambia
    expect(calcCAGR([0, 50, 100])).toBeNull();      // cero al inicio
  });

  it('returns null with single value', () => {
    expect(calcCAGR([100])).toBeNull();
  });

  it('returns null with empty array', () => {
    expect(calcCAGR([])).toBeNull();
  });
});

describe('calcCoefHabilidad — métrica clave Phil Town', () => {
  it('coef ratio típico ZTS/KO ~0.5 (bueno)', () => {
    // EPS 1.00 → 2.50 en 10y. Σ retenidos (EPS−DPS) ~3.00
    // ΔBPA = 1.50, coef = 1.50/3.00 = 0.50
    const eps = [2.50, 2.30, 2.10, 2.00, 1.80, 1.60, 1.50, 1.40, 1.20, 1.00];
    const dps = [1.00, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50];
    const r = calcCoefHabilidad(eps, dps);
    expect(r.coef).toBeGreaterThan(0.10);
    expect(r.coef).toBeLessThan(1.0);
    expect(r.bpaDelta).toBe(1.5);
  });

  it('high coef (excelente) cuando empresa reinvierte bien', () => {
    // Σ retenidos pequeño + ΔBPA alto = coef alto
    const eps = [3.00, 2.80, 2.50, 2.20, 2.00, 1.80, 1.60, 1.40, 1.20, 1.00];  // delta 2.0
    const dps = [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10];
    const r = calcCoefHabilidad(eps, dps);
    expect(r.coef).toBeGreaterThan(0.10);
  });

  it('low coef cuando empresa retiene mucho pero no genera', () => {
    // Empresa retiene mucho pero BPA crece poco
    const eps = [1.20, 1.18, 1.16, 1.14, 1.12, 1.10, 1.08, 1.06, 1.04, 1.00];  // delta 0.20
    const dps = [0.20, 0.20, 0.20, 0.20, 0.20, 0.20, 0.20, 0.20, 0.20, 0.20];
    const r = calcCoefHabilidad(eps, dps);
    expect(r.coef).toBeLessThan(0.05);  // débil
  });

  it('returns null if all EPS null', () => {
    const eps = [null, null, null];
    const dps = [1, 1, 1];
    expect(calcCoefHabilidad(eps, dps).coef).toBeNull();
  });

  it('handles missing DPS as 0 (empresa sin div)', () => {
    const eps = [3, 2, 1];
    const dps = [null, null, null];
    const r = calcCoefHabilidad(eps, dps);
    // retainedSum = 3+2+1 = 6, bpaDelta = 3-1 = 2 → coef = 0.33
    expect(r.coef).toBeCloseTo(0.333, 2);
  });
});

describe('projectBpa — composición simple', () => {
  it('5% growth 10y duplica casi', () => {
    const arr = projectBpa(1, 5, 10);
    expect(arr).toHaveLength(10);
    expect(arr[9]).toBeCloseTo(Math.pow(1.05, 10), 5);
  });

  it('negative growth reduces', () => {
    const arr = projectBpa(1, -3, 5);
    expect(arr[4]).toBeCloseTo(Math.pow(0.97, 5), 5);
  });

  it('handles non-finite or zero base', () => {
    expect(projectBpa(0, 5, 10).every(v => v === 0)).toBe(true);
    expect(projectBpa(-1, 5, 10).every(v => v === 0)).toBe(true);
    expect(projectBpa(NaN, 5, 10).every(v => v === 0)).toBe(true);
  });
});

describe('calcCagrPrecio', () => {
  it('25% precio en 10y = 2.26% CAGR', () => {
    const cagr = calcCagrPrecio(125, 100, 10);
    expect(cagr).toBeCloseTo(0.0226, 3);
  });

  it('returns 0 if precios inválidos', () => {
    expect(calcCagrPrecio(0, 100)).toBe(0);
    expect(calcCagrPrecio(100, 0)).toBe(0);
    expect(calcCagrPrecio(-50, 100)).toBe(0);
  });
});

describe('calcRentabilidad10y — modelo completo', () => {
  const baseInputs = {
    revenue: [50, 47, 44, 42, 40, 38, 36, 34, 32, 30],  // 5.2% CAGR
    eps: [3.50, 3.30, 3.10, 2.90, 2.70, 2.50, 2.30, 2.10, 1.90, 1.70],  // 7.5% CAGR
    dps: [1.50, 1.40, 1.30, 1.20, 1.10, 1.00, 0.90, 0.80, 0.70, 0.60],
    equity: [25, 24, 23, 22, 21, 20, 19, 18, 17, 16],
    retEarnings: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3],
    assets: [80, 77, 74, 71, 68, 65, 62, 59, 56, 53],
    currentPrice: 60,
    growthBasePct: 7,
    growthRangePct: 1.5,
    peLow: 14,
    peMid: 18,
    peHigh: 22,
  };

  it('computes CAGR para todas las series', () => {
    const out = calcRentabilidad10y(baseInputs);
    // 10 snapshots = 9 años elapsed. revenue 30→50: (50/30)^(1/9)-1 = 5.84%
    expect(out.cagr.revenue).toBeCloseTo(Math.pow(50/30, 1/9) - 1, 3);
    expect(out.cagr.eps).toBeCloseTo(Math.pow(3.5/1.7, 1/9) - 1, 3);
    expect(out.cagr.equity).toBeCloseTo(Math.pow(25/16, 1/9) - 1, 3);
  });

  it('Coeficiente Habilidad calculado', () => {
    const out = calcRentabilidad10y(baseInputs);
    expect(out.coefHabilidad).not.toBeNull();
    expect(out.coefHabilidad).toBeGreaterThan(0);
  });

  it('BPA proyectado a 10y en 3 escenarios', () => {
    const out = calcRentabilidad10y(baseInputs);
    // EPS base 3.50, growth 7% → año 10 = 3.50 * 1.07^10 = 6.88
    expect(out.bpaProyectado.normal[9]).toBeCloseTo(3.50 * Math.pow(1.07, 10), 1);
    // Negativo (5.5%) y positivo (8.5%)
    expect(out.bpaProyectado.negativo[9]).toBeLessThan(out.bpaProyectado.normal[9]);
    expect(out.bpaProyectado.positivo[9]).toBeGreaterThan(out.bpaProyectado.normal[9]);
  });

  it('Matriz 3×3 precio futuro tiene 9 outputs', () => {
    const out = calcRentabilidad10y(baseInputs);
    const matrix = out.precioFuturo10y;
    expect(matrix.deprimido.negativo).toBeGreaterThan(0);
    expect(matrix.caliente.positivo).toBeGreaterThan(matrix.deprimido.negativo);
    // Sanidad: caliente.positivo > caliente.normal > caliente.negativo
    expect(matrix.caliente.positivo).toBeGreaterThan(matrix.caliente.normal);
    expect(matrix.caliente.normal).toBeGreaterThan(matrix.caliente.negativo);
    // Sanidad: deprimido.X < normal.X < caliente.X (mismo escenario)
    expect(matrix.normal.normal).toBeGreaterThan(matrix.deprimido.normal);
    expect(matrix.caliente.normal).toBeGreaterThan(matrix.normal.normal);
  });

  it('retorno total = CAGR precio + yield actual', () => {
    const out = calcRentabilidad10y(baseInputs);
    const cagrDeprNeg = out.retornoEsperado10y.cagrPrecio.deprimido.negativo;
    const retDeprNeg = out.retornoEsperado10y.retornoTotal.deprimido.negativo;
    expect(retDeprNeg - cagrDeprNeg).toBeCloseTo(out.yieldActual, 5);
  });

  it('yield actual = DPS / precio', () => {
    const out = calcRentabilidad10y(baseInputs);
    expect(out.yieldActual).toBeCloseTo(1.50 / 60, 5);
  });

  it('P/E actual = precio / EPS', () => {
    const out = calcRentabilidad10y(baseInputs);
    expect(out.peActual).toBeCloseTo(60 / 3.50, 3);
  });

  it('warnings cuando faltan datos', () => {
    const bad = { ...baseInputs, eps: [null, null, null, null, null, null, null, null, null, null] };
    const out = calcRentabilidad10y(bad);
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it('handles MCD pattern (equity negative)', () => {
    const mcd = { ...baseInputs, equity: [-3.7, -3.5, -3.0, -2.5, -2.0, -1.5, -1.0, 0.5, 1.0, 1.5] };
    const out = calcRentabilidad10y(mcd);
    // EPS sigue calculable → CAGR EPS válido, equity null
    expect(out.cagr.eps).not.toBeNull();
    expect(out.cagr.equity).toBeNull();
  });
});

describe('getDefaultPeRange — defaults por sector', () => {
  it('Consumer Staples uses 14/18/22', () => {
    const r = getDefaultPeRange('Consumer Staples');
    expect(r).toEqual({ low: 14, mid: 18, high: 22 });
  });

  it('Technology uses 18/25/32 (higher)', () => {
    const r = getDefaultPeRange('Technology');
    expect(r.high).toBe(32);
  });

  it('unknown sector returns generic 12/16/20', () => {
    expect(getDefaultPeRange('Random Sector')).toEqual({ low: 12, mid: 16, high: 20 });
    expect(getDefaultPeRange(null)).toEqual({ low: 12, mid: 16, high: 20 });
    expect(getDefaultPeRange(undefined)).toEqual({ low: 12, mid: 16, high: 20 });
  });

  it('Real Estate uses REIT defaults', () => {
    const r = getDefaultPeRange('Real Estate');
    expect(r).toEqual({ low: 14, mid: 18, high: 22 });
  });
});

describe('applyOverrides — D1 overrides sobre series FMP', () => {
  it('aplica override individual', () => {
    const series = {
      revenue: [50, 47, 44, 42, 40, 38, 36, 34, 32, 30],
      eps: [3.5, 3.3, 3.1, 2.9, 2.7, 2.5, 2.3, 2.1, 1.9, 1.7],
      dps: [1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6],
      equity: [25, 24, 23, 22, 21, 20, 19, 18, 17, 16],
      retEarnings: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3],
      assets: [80, 77, 74, 71, 68, 65, 62, 59, 56, 53],
    };
    const overrides = [
      { ticker: 'KO', year: 0, field: 'eps', value: 4.0 },  // override EPS año actual
      { ticker: 'KO', year: -5, field: 'revenue', value: 41 },  // override revenue año -5
    ];
    const result = applyOverrides(series, overrides);
    expect(result.eps[0]).toBe(4.0);
    expect(result.revenue[5]).toBe(41);
    // Resto sin tocar
    expect(result.revenue[0]).toBe(50);
    expect(result.eps[1]).toBe(3.3);
  });

  it('NO muta el input original', () => {
    const series = {
      revenue: [50], eps: [3.5], dps: [1.5], equity: [25], retEarnings: [12], assets: [80],
    };
    const overrides = [{ ticker: 'KO', year: 0, field: 'eps', value: 99 }];
    applyOverrides(series, overrides);
    expect(series.eps[0]).toBe(3.5);  // original intacto
  });

  it('null value se ignora (NO aplica override)', () => {
    const series = {
      revenue: [50], eps: [3.5], dps: [1.5], equity: [25], retEarnings: [12], assets: [80],
    };
    const overrides = [{ ticker: 'KO', year: 0, field: 'eps', value: null }];
    const result = applyOverrides(series, overrides);
    expect(result.eps[0]).toBe(3.5);  // sigue siendo el FMP value
  });

  it('global config (year=-99) se ignora en series', () => {
    const series = {
      revenue: [50], eps: [3.5], dps: [1.5], equity: [25], retEarnings: [12], assets: [80],
    };
    const overrides = [{ ticker: 'KO', year: -99, field: 'growth', value: 10 }];
    const result = applyOverrides(series, overrides);
    // No revienta y no afecta series
    expect(result.eps[0]).toBe(3.5);
  });
});

describe('extractGlobalConfig', () => {
  it('extrae solo overrides con year=-99', () => {
    const overrides = [
      { ticker: 'KO', year: 0, field: 'eps', value: 4.0 },
      { ticker: 'KO', year: -99, field: 'growth', value: 8 },
      { ticker: 'KO', year: -99, field: 'peLow', value: 12 },
    ];
    const config = extractGlobalConfig(overrides);
    expect(config.growth).toBe(8);
    expect(config.peLow).toBe(12);
    expect(config.peMid).toBeUndefined();
  });

  it('ignora fields desconocidos', () => {
    const overrides = [{ ticker: 'KO', year: -99, field: 'unknown_field', value: 5 }];
    const config = extractGlobalConfig(overrides);
    expect(Object.keys(config)).toHaveLength(0);
  });

  it('ignora null values', () => {
    const overrides = [{ ticker: 'KO', year: -99, field: 'growth', value: null }];
    const config = extractGlobalConfig(overrides);
    expect(config.growth).toBeUndefined();
  });
});
