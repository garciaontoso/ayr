import { describe, it, expect } from 'vitest';
import { rate, R } from '../ratings.js';

describe('rate (generic rating engine)', () => {
  const rules = [
    { test: v => v > 0.5, lbl: 'High', c: 'green', bg: '#0f0', score: 3 },
    { test: v => v > 0.2, lbl: 'Mid',  c: 'yellow', bg: '#ff0', score: 2 },
    { test: v => v >= 0,  lbl: 'Low',  c: 'red',    bg: '#f00', score: 1 },
  ];

  it('matches first applicable rule', () => {
    expect(rate(0.8, rules).lbl).toBe('High');
    expect(rate(0.3, rules).lbl).toBe('Mid');
    expect(rate(0.1, rules).lbl).toBe('Low');
  });

  it('returns fallback for null input', () => {
    const r = rate(null, rules);
    expect(r.lbl).toBe('—');
    expect(r.score).toBe(0);
  });

  it('returns fallback for undefined', () => {
    expect(rate(undefined, rules).score).toBe(0);
  });

  it('returns fallback when no rule matches', () => {
    const strictRules = [{ test: v => v > 1, lbl: 'Impossible', score: 3 }];
    expect(rate(0.5, strictRules).lbl).toBe('—');
  });
});

describe('R.gm (gross margin)', () => {
  it('>40% is Excelente score 3', () => {
    const r = rate(0.41, R.gm);
    expect(r.lbl).toBe('Excelente');
    expect(r.score).toBe(3);
  });

  it('25-40% is Bueno score 2', () => {
    const r = rate(0.30, R.gm);
    expect(r.lbl).toBe('Bueno');
    expect(r.score).toBe(2);
  });

  it('15-25% is Aceptable score 1', () => {
    const r = rate(0.20, R.gm);
    expect(r.lbl).toBe('Aceptable');
    expect(r.score).toBe(1);
  });

  it('<=15% is Débil score 0', () => {
    const r = rate(0.10, R.gm);
    expect(r.lbl).toBe('Débil');
    expect(r.score).toBe(0);
  });
});

describe('R.om (operating margin)', () => {
  it('>20% is Fuerte', () => expect(rate(0.25, R.om).lbl).toBe('Fuerte'));
  it('5-10% is Débil', () => expect(rate(0.07, R.om).lbl).toBe('Débil'));
  it('<=5% is Muy débil', () => expect(rate(0.03, R.om).lbl).toBe('Muy débil'));
});

describe('R.roe (return on equity)', () => {
  it('>15% is Excelente', () => expect(rate(0.20, R.roe).lbl).toBe('Excelente'));
  it('>10% is Bueno', () => expect(rate(0.12, R.roe).lbl).toBe('Bueno'));
  it('>5% is Modesto', () => expect(rate(0.07, R.roe).lbl).toBe('Modesto'));
  it('<=5% is Débil', () => expect(rate(0.03, R.roe).lbl).toBe('Débil'));
});

describe('R.d2fcf (debt to FCF)', () => {
  it('<2x is Saludable', () => expect(rate(1.5, R.d2fcf).lbl).toBe('Saludable'));
  it('2-4x is Aceptable', () => expect(rate(3, R.d2fcf).lbl).toBe('Aceptable'));
  it('4-6x is Elevada', () => expect(rate(5, R.d2fcf).lbl).toBe('Elevada'));
  it('>=6x is Peligrosa', () => expect(rate(8, R.d2fcf).lbl).toBe('Peligrosa'));
});

describe('R.ic (interest coverage)', () => {
  it('>10x is Muy sólido', () => expect(rate(12, R.ic).lbl).toBe('Muy sólido'));
  it('5-10x is Bueno', () => expect(rate(7, R.ic).lbl).toBe('Bueno'));
  it('2-5x is Aceptable', () => expect(rate(3, R.ic).lbl).toBe('Aceptable'));
  it('<=2x is Riesgo', () => expect(rate(1.5, R.ic).lbl).toBe('Riesgo'));
});

describe('R.pio (Piotroski score)', () => {
  it('>=8 is Excelente', () => expect(rate(8, R.pio).lbl).toBe('Excelente'));
  it('6-7 is Bueno', () => expect(rate(6, R.pio).lbl).toBe('Bueno'));
  it('4-5 is Neutral', () => expect(rate(4, R.pio).lbl).toBe('Neutral'));
  it('<4 is Débil', () => expect(rate(3, R.pio).lbl).toBe('Débil'));
  it('9/9 is still Excelente', () => expect(rate(9, R.pio).lbl).toBe('Excelente'));
});

describe('R.mos (margin of safety)', () => {
  it('>30% is Excelente', () => expect(rate(0.35, R.mos).lbl).toBe('Excelente'));
  it('15-30% is Bueno', () => expect(rate(0.20, R.mos).lbl).toBe('Bueno'));
  it('0-15% is Ajustado', () => expect(rate(0.10, R.mos).lbl).toBe('Ajustado'));
  it('<=0 is Sin margen', () => expect(rate(-0.1, R.mos).lbl).toBe('Sin margen'));
  it('exactly 0 is Sin margen', () => expect(rate(0, R.mos).lbl).toBe('Sin margen'));
});

describe('R.eve (EV/EBIT)', () => {
  it('<8 is Barata', () => expect(rate(6, R.eve).lbl).toBe('Barata'));
  it('8-12 is Razonable', () => expect(rate(10, R.eve).lbl).toBe('Razonable'));
  it('12-18 is Cara', () => expect(rate(15, R.eve).lbl).toBe('Cara'));
  it('>=18 is Muy cara', () => expect(rate(25, R.eve).lbl).toBe('Muy cara'));
});

describe('R.growth', () => {
  it('>10% is Fuerte', () => expect(rate(0.15, R.growth).lbl).toBe('Fuerte'));
  it('5-10% is Moderado', () => expect(rate(0.07, R.growth).lbl).toBe('Moderado'));
  it('0-5% is Lento', () => expect(rate(0.02, R.growth).lbl).toBe('Lento'));
  it('<=0 is Declive', () => expect(rate(-0.05, R.growth).lbl).toBe('Declive'));
});

describe('R.payback', () => {
  it('<=8 years is Excelente', () => expect(rate(7, R.payback).lbl).toBe('Excelente'));
  it('8-10 years is Bueno', () => expect(rate(9, R.payback).lbl).toBe('Bueno'));
  it('10-15 years is Lento', () => expect(rate(12, R.payback).lbl).toBe('Lento'));
  it('>15 years is Muy lento', () => expect(rate(20, R.payback).lbl).toBe('Muy lento'));
});

describe('R.big5', () => {
  it('>=10% is ≥10% ✓', () => expect(rate(0.12, R.big5).lbl).toBe('≥10% ✓'));
  it('5-10% is 5-10%', () => expect(rate(0.07, R.big5).lbl).toBe('5-10%'));
  it('0-5% is <5%', () => expect(rate(0.03, R.big5).lbl).toBe('<5%'));
  it('negative is Negativo ✗', () => expect(rate(-0.01, R.big5).lbl).toBe('Negativo ✗'));
});

describe('R.fcfm (FCF margin)', () => {
  it('>20% is Excelente', () => expect(rate(0.25, R.fcfm).lbl).toBe('Excelente'));
  it('10-20% is Bueno', () => expect(rate(0.15, R.fcfm).lbl).toBe('Bueno'));
  it('5-10% is Aceptable', () => expect(rate(0.07, R.fcfm).lbl).toBe('Aceptable'));
  it('<=5% is Débil', () => expect(rate(0.04, R.fcfm).lbl).toBe('Débil'));
});

describe('R.roic (return on invested capital)', () => {
  it('>15% is Excelente', () => expect(rate(0.20, R.roic).lbl).toBe('Excelente'));
  it('10-15% is Bueno', () => expect(rate(0.12, R.roic).lbl).toBe('Bueno'));
  it('6-10% is Aceptable', () => expect(rate(0.08, R.roic).lbl).toBe('Aceptable'));
  it('<=6% is Débil', () => expect(rate(0.04, R.roic).lbl).toBe('Débil'));
});

describe('R.nm (net margin)', () => {
  it('>15% is Excelente', () => expect(rate(0.20, R.nm).lbl).toBe('Excelente'));
  it('8-15% is Bueno', () => expect(rate(0.10, R.nm).lbl).toBe('Bueno'));
  it('3-8% is Aceptable', () => expect(rate(0.05, R.nm).lbl).toBe('Aceptable'));
  it('<=3% is Débil', () => expect(rate(0.02, R.nm).lbl).toBe('Débil'));
});

describe('rating score colors', () => {
  it('score 3 items have green color', () => {
    const r = rate(0.50, R.gm);
    expect(r.c).toBe('#30d158');
  });

  it('score 0 items have red color', () => {
    const r = rate(0.10, R.gm);
    expect(r.c).toBe('#ff453a');
  });
});
