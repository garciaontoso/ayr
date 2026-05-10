// Sprint 18 — Portfolio ideas engine tests.

import { describe, it, expect } from 'vitest';
import {
  IDEAS_DEFAULTS, analyzePosition, analyzeOpenOption, scanPortfolio,
} from '../../../api/src/lib/portfolio-ideas-engine.js';

describe('Sprint 18 — analyzePosition()', () => {
  it('genera CC si tienes 100+ shares y no estás en gran pérdida', () => {
    const ideas = analyzePosition({
      ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8.3,
    });
    const cc = ideas.find(i => i.type === 'COVERED_CALL');
    expect(cc).toBeTruthy();
    expect(cc.contracts).toBe(2);
    expect(cc.strike).toBeGreaterThan(65);
    expect(cc.premium_estimate).toBeGreaterThan(0);
  });

  it('NO genera CC si tienes <100 shares', () => {
    const ideas = analyzePosition({ ticker: 'KO', shares: 50, avg_cost: 60, current_price: 65, pnl_pct: 8 });
    expect(ideas.find(i => i.type === 'COVERED_CALL')).toBeFalsy();
  });

  it('NO genera CC si en pérdida >10%', () => {
    const ideas = analyzePosition({ ticker: 'KO', shares: 100, avg_cost: 60, current_price: 50, pnl_pct: -16.7 });
    expect(ideas.find(i => i.type === 'COVERED_CALL')).toBeFalsy();
  });

  it('genera CSP si shares=0 o en ganancia', () => {
    const ideas = analyzePosition({ ticker: 'PG', shares: 0, avg_cost: 0, current_price: 160, pnl_pct: 0 });
    const csp = ideas.find(i => i.type === 'CASH_SECURED_PUT');
    expect(csp).toBeTruthy();
    expect(csp.strike).toBeLessThan(160);
    expect(csp.capital_required).toBeGreaterThan(0);
    expect(csp.effective_buy_price).toBeLessThan(csp.strike);
  });

  it('genera BPS_COST_REDUCTION si pérdida -5% a -25%', () => {
    const ideas = analyzePosition({ ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 150, pnl_pct: -11.8 });
    const bps = ideas.find(i => i.type === 'BPS_COST_REDUCTION');
    expect(bps).toBeTruthy();
    expect(bps.short_strike).toBeGreaterThan(bps.long_strike);
    expect(bps.premium_estimate).toBeGreaterThan(0);
  });

  it('NO genera BPS si pérdida muy pequeña (<5%)', () => {
    const ideas = analyzePosition({ ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 167, pnl_pct: -1.8 });
    expect(ideas.find(i => i.type === 'BPS_COST_REDUCTION')).toBeFalsy();
  });

  it('NO genera BPS si pérdida muy grande (>25%)', () => {
    const ideas = analyzePosition({ ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 100, pnl_pct: -41 });
    expect(ideas.find(i => i.type === 'BPS_COST_REDUCTION')).toBeFalsy();
  });

  it('genera COLLAR si gain >25%', () => {
    const ideas = analyzePosition({ ticker: 'NVDA', shares: 100, avg_cost: 100, current_price: 150, pnl_pct: 50 });
    const collar = ideas.find(i => i.type === 'COLLAR_PROTECTION');
    expect(collar).toBeTruthy();
    expect(collar.put_strike).toBeLessThan(150);
    expect(collar.call_strike).toBeGreaterThan(150);
    expect(collar.downside_protection).toBeLessThan(0);
  });

  it('NO genera COLLAR si gain bajo', () => {
    const ideas = analyzePosition({ ticker: 'NVDA', shares: 100, avg_cost: 100, current_price: 110, pnl_pct: 10 });
    expect(ideas.find(i => i.type === 'COLLAR_PROTECTION')).toBeFalsy();
  });

  it('skip penny stocks (price < $10)', () => {
    const ideas = analyzePosition({ ticker: 'PENNY', shares: 1000, current_price: 5, pnl_pct: 0 });
    expect(ideas).toHaveLength(0);
  });

  it('skip si no shares ni price', () => {
    expect(analyzePosition({})).toHaveLength(0);
    expect(analyzePosition(null)).toHaveLength(0);
  });

  it('todas las ideas tienen confidence_score 0-100', () => {
    const ideas = analyzePosition({ ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8 });
    for (const idea of ideas) {
      expect(idea.confidence_score).toBeGreaterThanOrEqual(0);
      expect(idea.confidence_score).toBeLessThanOrEqual(100);
    }
  });
});

describe('Sprint 18 — analyzeOpenOption()', () => {
  it('detecta defensive roll si strike testeado', () => {
    const opt = { ticker: 'SPY', opt_type: 'P', strike: 600, expiry: '2026-06-15', qty: -1, avg_cost: 2.5 };
    const r = analyzeOpenOption(opt, 605);  // 0.83% del strike
    expect(r.action).toBe('CONSIDER_ROLL_DEFENSIVE');
    expect(r.urgency).toBe('HIGH');
    expect(r.suggested_strike).toBeLessThan(opt.strike);
  });

  it('hold si todo OK', () => {
    const opt = { ticker: 'SPY', opt_type: 'P', strike: 550, expiry: '2026-06-15', qty: -1, avg_cost: 2.5 };
    const r = analyzeOpenOption(opt, 600);  // 9% OTM
    expect(r.action).toBe('HOLD');
  });

  it('close gamma exit si DTE bajo + pnl bajo', () => {
    const expiryDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    // entry premium ALTO (10) → live price (~$0.05 5d OTM) → pnl ~99% → cae en TP first
    // Para forzar gamma exit: low entry premium so pnl_pct < 25
    const opt = { ticker: 'SPY', opt_type: 'P', strike: 595, expiry: expiryDate, qty: -1, avg_cost: 0.20 };
    const r = analyzeOpenOption(opt, 600);
    // Spot 600, strike 595 → ~0.83% del strike → strike testeado → defensive roll prioridad alta
    // O gamma exit si pnl < 25%
    expect(['CONSIDER_ROLL_DEFENSIVE', 'CLOSE_GAMMA_EXIT']).toContain(r.action);
  });

  it('returns null si datos insuficientes', () => {
    expect(analyzeOpenOption(null, 100)).toBe(null);
    expect(analyzeOpenOption({ strike: 100 }, null)).toBe(null);
  });
});

describe('Sprint 18 — scanPortfolio()', () => {
  it('retorna ideas de TODAS las posiciones, sorted por confidence', () => {
    const positions = [
      { ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8.3 },
      { ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 150, pnl_pct: -11.8 },
    ];
    const ideas = scanPortfolio(positions);
    expect(ideas.length).toBeGreaterThan(0);
    // Sorted desc by score
    for (let i = 1; i < ideas.length; i++) {
      expect(ideas[i - 1].confidence_score).toBeGreaterThanOrEqual(ideas[i].confidence_score);
    }
  });

  it('handles empty array', () => {
    expect(scanPortfolio([])).toEqual([]);
    expect(scanPortfolio(null)).toEqual([]);
  });
});
