// Sprint 18 — Portfolio ideas engine tests.
// Sprint 20 (2026-05-11): updated to pass explicit iv + iv_source.
// Engine no longer falls back to 0.25 hardcoded — caller responsibility.

import { describe, it, expect } from 'vitest';
import {
  IDEAS_DEFAULTS, analyzePosition, analyzeOpenOption, scanPortfolio,
} from '../../../api/src/lib/portfolio-ideas-engine.js';

const TEST_IV = 0.25;
const TEST_IV_SOURCE = 'test_fixed_25';
const withIv = (p) => ({ ...p, iv: TEST_IV, iv_source: TEST_IV_SOURCE });

describe('Sprint 18 — analyzePosition()', () => {
  it('genera CC si tienes 100+ shares y no estás en gran pérdida', () => {
    const ideas = analyzePosition(withIv({
      ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8.3,
    }));
    const cc = ideas.find(i => i.type === 'COVERED_CALL');
    expect(cc).toBeTruthy();
    expect(cc.contracts).toBe(2);
    expect(cc.strike).toBeGreaterThan(65);
    expect(cc.premium_estimate).toBeGreaterThan(0);
  });

  it('NO genera CC si tienes <100 shares', () => {
    const ideas = analyzePosition(withIv({ ticker: 'KO', shares: 50, avg_cost: 60, current_price: 65, pnl_pct: 8 }));
    expect(ideas.find(i => i.type === 'COVERED_CALL')).toBeFalsy();
  });

  it('NO genera CC si en pérdida >10%', () => {
    const ideas = analyzePosition(withIv({ ticker: 'KO', shares: 100, avg_cost: 60, current_price: 50, pnl_pct: -16.7 }));
    expect(ideas.find(i => i.type === 'COVERED_CALL')).toBeFalsy();
  });

  it('genera CSP si shares=0 o en ganancia', () => {
    const ideas = analyzePosition(withIv({ ticker: 'PG', shares: 0, avg_cost: 0, current_price: 160, pnl_pct: 0 }));
    const csp = ideas.find(i => i.type === 'CASH_SECURED_PUT');
    expect(csp).toBeTruthy();
    expect(csp.strike).toBeLessThan(160);
    expect(csp.capital_required).toBeGreaterThan(0);
    expect(csp.effective_buy_price).toBeLessThan(csp.strike);
  });

  it('genera BPS_COST_REDUCTION si pérdida -5% a -25%', () => {
    const ideas = analyzePosition(withIv({ ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 150, pnl_pct: -11.8 }));
    const bps = ideas.find(i => i.type === 'BPS_COST_REDUCTION');
    expect(bps).toBeTruthy();
    expect(bps.short_strike).toBeGreaterThan(bps.long_strike);
    expect(bps.premium_estimate).toBeGreaterThan(0);
  });

  it('NO genera BPS si pérdida muy pequeña (<5%)', () => {
    const ideas = analyzePosition(withIv({ ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 167, pnl_pct: -1.8 }));
    expect(ideas.find(i => i.type === 'BPS_COST_REDUCTION')).toBeFalsy();
  });

  it('NO genera BPS si pérdida muy grande (>25%)', () => {
    const ideas = analyzePosition(withIv({ ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 100, pnl_pct: -41 }));
    expect(ideas.find(i => i.type === 'BPS_COST_REDUCTION')).toBeFalsy();
  });

  it('genera COLLAR si gain >25%', () => {
    const ideas = analyzePosition(withIv({ ticker: 'NVDA', shares: 100, avg_cost: 100, current_price: 150, pnl_pct: 50 }));
    const collar = ideas.find(i => i.type === 'COLLAR_PROTECTION');
    expect(collar).toBeTruthy();
    expect(collar.put_strike).toBeLessThan(150);
    expect(collar.call_strike).toBeGreaterThan(150);
    expect(collar.downside_protection).toBeLessThan(0);
  });

  it('NO genera COLLAR si gain bajo', () => {
    const ideas = analyzePosition(withIv({ ticker: 'NVDA', shares: 100, avg_cost: 100, current_price: 110, pnl_pct: 10 }));
    expect(ideas.find(i => i.type === 'COLLAR_PROTECTION')).toBeFalsy();
  });

  it('skip penny stocks (price < $10)', () => {
    const ideas = analyzePosition(withIv({ ticker: 'PENNY', shares: 1000, current_price: 5, pnl_pct: 0 }));
    expect(ideas).toHaveLength(0);
  });

  it('skip si no shares ni price', () => {
    expect(analyzePosition({})).toHaveLength(0);
    expect(analyzePosition(null)).toHaveLength(0);
  });

  it('todas las ideas tienen confidence_score 0-100', () => {
    const ideas = analyzePosition(withIv({ ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8 }));
    for (const idea of ideas) {
      expect(idea.confidence_score).toBeGreaterThanOrEqual(0);
      expect(idea.confidence_score).toBeLessThanOrEqual(100);
    }
  });

  // Sprint 20 additions
  it('skip si no se pasa iv (fail-fast, no fallback 0.25)', () => {
    const ideas = analyzePosition({ ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8 });
    expect(ideas).toHaveLength(0);
  });

  it('cada idea incluye greeks + iv_used + iv_source', () => {
    const ideas = analyzePosition(withIv({ ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8 }));
    expect(ideas.length).toBeGreaterThan(0);
    for (const idea of ideas) {
      expect(idea.iv_used).toBeCloseTo(TEST_IV, 4);
      expect(idea.iv_source).toBe(TEST_IV_SOURCE);
      expect(idea.greeks).toBeTruthy();
      expect(typeof idea.greeks.delta).toBe('number');
      expect(typeof idea.greeks.theta).toBe('number');
      expect(typeof idea.greeks.vega).toBe('number');
    }
  });

  it('penaliza confidence si iv_source es hv_proxy', () => {
    const real = analyzePosition({ ...withIv({ ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8 }), iv_source: 'tt_real' });
    const proxy = analyzePosition({ ...withIv({ ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8 }), iv_source: 'hv_proxy' });
    const ccReal = real.find(i => i.type === 'COVERED_CALL');
    const ccProxy = proxy.find(i => i.type === 'COVERED_CALL');
    expect(ccReal.confidence_score).toBeGreaterThan(ccProxy.confidence_score);
  });

  // Sprint 22.1: pct_otm per strike for UX clarity
  it('cada idea expone spot + pct_otm por strike', () => {
    // CC + CSP (gain >= 0 so both fire)
    const ccIdeas = analyzePosition(withIv({ ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8 }));
    const cc = ccIdeas.find(i => i.type === 'COVERED_CALL');
    expect(cc.spot).toBeCloseTo(65, 1);
    expect(cc.strike_pct_otm).toBeGreaterThan(0);    // strike above spot
    expect(cc.strike).toBeGreaterThan(cc.spot);

    const csp = ccIdeas.find(i => i.type === 'CASH_SECURED_PUT');
    expect(csp.spot).toBeCloseTo(65, 1);
    expect(csp.strike_pct_otm).toBeGreaterThan(0);   // pct shown as positive % below
    expect(csp.strike).toBeLessThan(csp.spot);

    // BPS (need loss)
    const bpsIdeas = analyzePosition(withIv({ ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 150, pnl_pct: -11.8 }));
    const bps = bpsIdeas.find(i => i.type === 'BPS_COST_REDUCTION');
    expect(bps.spot).toBeCloseTo(150, 1);
    expect(bps.short_strike_pct_otm).toBeGreaterThan(0);
    expect(bps.long_strike_pct_otm).toBeGreaterThan(bps.short_strike_pct_otm);  // long further OTM

    // Collar (need big gain)
    const collarIdeas = analyzePosition(withIv({ ticker: 'NVDA', shares: 100, avg_cost: 100, current_price: 150, pnl_pct: 50 }));
    const collar = collarIdeas.find(i => i.type === 'COLLAR_PROTECTION');
    expect(collar.spot).toBeCloseTo(150, 1);
    expect(collar.put_strike_pct_otm).toBeGreaterThan(0);
    expect(collar.call_strike_pct_otm).toBeGreaterThan(0);
  });
});

describe('Sprint 18 — analyzeOpenOption()', () => {
  it('detecta defensive roll si strike testeado', () => {
    const opt = { ticker: 'SPY', opt_type: 'P', strike: 600, expiry: '2026-06-15', qty: -1, avg_cost: 2.5 };
    const r = analyzeOpenOption(opt, 605, { iv: TEST_IV, iv_source: TEST_IV_SOURCE });  // 0.83% del strike
    expect(r.action).toBe('CONSIDER_ROLL_DEFENSIVE');
    expect(r.urgency).toBe('HIGH');
    expect(r.suggested_strike).toBeLessThan(opt.strike);
  });

  it('hold si todo OK', () => {
    const opt = { ticker: 'SPY', opt_type: 'P', strike: 550, expiry: '2026-06-15', qty: -1, avg_cost: 2.5 };
    const r = analyzeOpenOption(opt, 600, { iv: TEST_IV, iv_source: TEST_IV_SOURCE });  // 9% OTM
    expect(r.action).toBe('HOLD');
  });

  it('close gamma exit si DTE bajo + pnl bajo', () => {
    const expiryDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const opt = { ticker: 'SPY', opt_type: 'P', strike: 595, expiry: expiryDate, qty: -1, avg_cost: 0.20 };
    const r = analyzeOpenOption(opt, 600, { iv: TEST_IV, iv_source: TEST_IV_SOURCE });
    expect(['CONSIDER_ROLL_DEFENSIVE', 'CLOSE_GAMMA_EXIT']).toContain(r.action);
  });

  it('returns null si datos insuficientes', () => {
    expect(analyzeOpenOption(null, 100)).toBe(null);
    expect(analyzeOpenOption({ strike: 100 }, null)).toBe(null);
  });

  // Sprint 20: sin iv todavía funciona pero sin pnl/greeks
  it('sin iv: devuelve suggestion con iv_source=missing y greeks=null', () => {
    const opt = { ticker: 'SPY', opt_type: 'P', strike: 600, expiry: '2026-06-15', qty: -1, avg_cost: 2.5 };
    const r = analyzeOpenOption(opt, 605);  // sin opts → no iv
    expect(r.action).toBe('CONSIDER_ROLL_DEFENSIVE');  // strike testeado, decision tree no necesita iv
    expect(r.iv_source).toBe('missing');
    expect(r.greeks).toBe(null);
  });

  it('cada suggestion con iv incluye iv_used + greeks', () => {
    const opt = { ticker: 'SPY', opt_type: 'P', strike: 550, expiry: '2026-06-15', qty: -1, avg_cost: 2.5 };
    const r = analyzeOpenOption(opt, 600, { iv: 0.22, iv_source: 'tt_real' });
    expect(r.iv_used).toBeCloseTo(0.22, 4);
    expect(r.iv_source).toBe('tt_real');
    expect(r.greeks).toBeTruthy();
    expect(typeof r.greeks.delta).toBe('number');
  });
});

describe('Sprint 18 — scanPortfolio()', () => {
  it('retorna ideas de TODAS las posiciones con iv, sorted por confidence', () => {
    const positions = [
      withIv({ ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8.3 }),
      withIv({ ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 150, pnl_pct: -11.8 }),
    ];
    const ideas = scanPortfolio(positions);
    expect(ideas.length).toBeGreaterThan(0);
    for (let i = 1; i < ideas.length; i++) {
      expect(ideas[i - 1].confidence_score).toBeGreaterThanOrEqual(ideas[i].confidence_score);
    }
  });

  it('handles empty array', () => {
    const empty = scanPortfolio([]);
    expect(empty.length).toBe(0);
    expect(scanPortfolio(null).length).toBe(0);
  });

  // Sprint 20: skipped tracking
  it('positions sin iv → skipped con reason=no_iv', () => {
    const result = scanPortfolio([
      { ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8 },         // sin iv
      withIv({ ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 150, pnl_pct: -11.8 }),
    ]);
    expect(result.skipped).toBeTruthy();
    expect(result.skipped.find(s => s.ticker === 'KO')?.reason).toBe('no_iv');
    expect(result.summary.skipped_breakdown.no_iv).toBe(1);
  });

  it('summary expone iv_source_distribution', () => {
    const result = scanPortfolio([
      { ...withIv({ ticker: 'KO', shares: 200, avg_cost: 60, current_price: 65, pnl_pct: 8 }), iv_source: 'tt_real' },
      { ...withIv({ ticker: 'JNJ', shares: 100, avg_cost: 170, current_price: 150, pnl_pct: -11.8 }), iv_source: 'hv_proxy' },
    ]);
    expect(result.summary.iv_source_distribution.tt_real).toBeGreaterThan(0);
    expect(result.summary.iv_source_distribution.hv_proxy).toBeGreaterThan(0);
  });
});
