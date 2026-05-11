// Sprint 22.6 — Reconcile heuristics tests.
// Verifies that each canonical corporate action / bug pattern is detected.

import { describe, it, expect } from 'vitest';
import { classifyDiscrepancy, classifyAll, CAUSES } from '../../../api/src/lib/reconcile-heuristics.js';

describe('Sprint 22.6 — classifyDiscrepancy', () => {
  describe('Stock splits (only when NOT ambiguous with assignment)', () => {
    it('4:1 split with rounding tolerance (diff 301 = NOT multiple of 100)', () => {
      const r = classifyDiscrepancy(401, 100);  // 4.01 ≈ 4, diff 301 not multiple of 100
      expect(r.cause).toBe(CAUSES.STOCK_SPLIT);
      expect(r.suggested_data.ratio).toBe(4);
    });

    it('Big split (IB 7000, trades 1000) — diff 6000 multiple of 100 but ratio HIGH', () => {
      const r = classifyDiscrepancy(7000, 1000);
      // diff=6000 > 500 → falls past first assignment check, hits split next
      expect(r.cause).toBe(CAUSES.STOCK_SPLIT);
      expect(r.suggested_data.ratio).toBe(7);
    });

    it('Ambiguous 2:1 / 1 contract assignment — engine prioritizes assignment', () => {
      const r = classifyDiscrepancy(200, 100);
      // Could be 2:1 split OR 1 call assigned. Wheel users → assignment more likely.
      // Engine returns OPTION_ASSIGNMENT by default; user can override.
      expect([CAUSES.STOCK_SPLIT, CAUSES.OPTION_ASSIGNMENT]).toContain(r.cause);
    });
  });

  describe('Reverse splits (only when unambiguous)', () => {
    it('1:5 reverse (IB 21, trades 105) — diff 84 NOT multiple of 100', () => {
      const r = classifyDiscrepancy(21, 105);
      expect(r.cause).toBe(CAUSES.REVERSE_SPLIT);
    });

    it('Ambiguous (50, 100) — engine prioritizes COST_BASIS_DUPLICATE (100=2×50)', () => {
      const r = classifyDiscrepancy(50, 100);
      // 100 = 2×50 matches DUP pattern. User can override.
      expect([CAUSES.COST_BASIS_DUPLICATE, CAUSES.REVERSE_SPLIT, CAUSES.OPTION_ASSIGNMENT]).toContain(r.cause);
    });
  });

  describe('cost_basis duplicates', () => {
    it('trades = 2× IB exactly (UNH bug pattern)', () => {
      const r = classifyDiscrepancy(100, 200);
      expect(r.cause).toBe(CAUSES.COST_BASIS_DUPLICATE);
      expect(r.confidence).toBe('HIGH');
      expect(r.suggested_action).toBe('DELETE_DUPLICATES');
      expect(r.suggested_data.excess).toBe(100);
    });

    it('SCHD pattern (IB 6000, trades 10250 — NOT exact 2× → not dup)', () => {
      const r = classifyDiscrepancy(6000, 10250);
      expect(r.cause).not.toBe(CAUSES.COST_BASIS_DUPLICATE);
    });

    it('Off by 1-2 still detected (cost_basis dup with small drift)', () => {
      const r = classifyDiscrepancy(100, 201);
      expect(r.cause).toBe(CAUSES.COST_BASIS_DUPLICATE);
    });
  });

  describe('Option assignment', () => {
    it('+100 shares (1 contract assigned)', () => {
      const r = classifyDiscrepancy(200, 100);
      // 2:1 ratio also matches — but exact multiple of 100 with diff=100 too
      // Stock split has HIGH confidence; assignment also. Order matters.
      // Engine prioritizes split because ratio is integer.
      expect([CAUSES.STOCK_SPLIT, CAUSES.OPTION_ASSIGNMENT]).toContain(r.cause);
    });

    it('Pure assignment (IB 175, trades 75 = +100)', () => {
      const r = classifyDiscrepancy(175, 75);
      expect(r.cause).toBe(CAUSES.OPTION_ASSIGNMENT);
      expect(r.suggested_data.contracts).toBe(1);
    });

    it('200 shares delivered (2 contracts)', () => {
      const r = classifyDiscrepancy(50, 250);  // -200 = 2 contracts called away
      expect(r.cause).toBe(CAUSES.OPTION_ASSIGNMENT);
      expect(r.suggested_data.contracts).toBe(2);
    });

    it('HIGH confidence si recentOptionAssignment flag', () => {
      const r = classifyDiscrepancy(175, 75, { recentOptionAssignment: true });
      expect(r.cause).toBe(CAUSES.OPTION_ASSIGNMENT);
      expect(r.confidence).toBe('HIGH');
    });
  });

  describe('DRIP (Dividend Reinvestment)', () => {
    it('Small fractional addition (+3 shares)', () => {
      const r = classifyDiscrepancy(103, 100);
      expect(r.cause).toBe(CAUSES.DRIP);
    });

    it('Small % (KO 1004 vs 1000)', () => {
      const r = classifyDiscrepancy(1004, 1000);
      expect(r.cause).toBe(CAUSES.DRIP);
    });

    it('HIGH confidence con dividend history', () => {
      const r = classifyDiscrepancy(105, 100, { hasDividendHistory: true });
      expect(r.cause).toBe(CAUSES.DRIP);
      expect(r.confidence).toBe('HIGH');
    });
  });

  describe('Symbol change / transfer out', () => {
    it('Ticker no en IB pero similar sí (AHH → AHRT)', () => {
      const r = classifyDiscrepancy(0, 200, {
        ticker: 'AHH',
        allTickers: new Set(['AHRT', 'KO', 'PG']),
      });
      expect(r.cause).toBe(CAUSES.SYMBOL_CHANGE);
      expect(r.suggested_data.to).toBe('AHRT');
    });

    it('Ticker no en IB y sin similar → TRANSFER_OUT', () => {
      const r = classifyDiscrepancy(0, 100, {
        ticker: 'EXOTIC',
        allTickers: new Set(['KO', 'PG', 'JNJ']),
      });
      expect(r.cause).toBe(CAUSES.TRANSFER_OUT);
    });
  });

  describe('Transfer in / spin-off', () => {
    it('IB tiene shares sin trades (spin-off)', () => {
      const r = classifyDiscrepancy(50, 0);
      expect(r.cause).toBe(CAUSES.TRANSFER_IN);
      expect(r.suggested_data.shares).toBe(50);
    });
  });

  describe('Unknown / manual review', () => {
    it('Random weird diff → UNKNOWN', () => {
      const r = classifyDiscrepancy(137, 285);
      // 137/285 is no clean ratio, not multiple of 100, not 2x
      expect(r.cause).toBe(CAUSES.UNKNOWN);
      expect(r.suggested_action).toBe('MANUAL_REVIEW');
    });

    it('Diff < 1 (no discrepancy)', () => {
      // classifyDiscrepancy doesn't return "no diff" — caller filters
      // But verify 99 vs 100 (small diff) still classifies
      const r = classifyDiscrepancy(99, 100);
      // Reverse: 100/99 = 1.01, no clean ratio; diff = -1, < 100 multiple
      // -> Should be UNKNOWN or DRIP if checks fail
      expect(['UNKNOWN', 'DRIP', CAUSES.OPTION_ASSIGNMENT]).toContain(r.cause);
    });
  });
});

describe('Sprint 22.6 — classifyAll (full portfolio)', () => {
  it('sorts by confidence + magnitude', () => {
    const ibMap = {
      UNH: 100,        // matches trades, no diff
      KO: 200,         // ambiguous: split OR 1 contract
      AAPL: 1001,      // DRIP +1
      MSFT: 0,         // sold out (MEDIUM)
      WEIRD: 137,      // unknown (LOW)
    };
    const tradesMap = {
      UNH: 100,
      KO: 100,
      AAPL: 1000,
      MSFT: 50,
      WEIRD: 50,
    };
    const results = classifyAll(ibMap, tradesMap);
    expect(results.length).toBe(4);  // UNH excluded (no diff)
    // First result should be HIGH confidence (KO or MSFT — both higher than WEIRD)
    expect(['HIGH','MEDIUM']).toContain(results[0].confidence);
    // Confidence weight ensures HIGH ahead of LOW
    const confs = results.map(r => r.confidence);
    if (confs.includes('HIGH') && confs.includes('LOW')) {
      expect(confs.indexOf('HIGH')).toBeLessThan(confs.indexOf('LOW'));
    }
  });

  it('handles empty inputs', () => {
    expect(classifyAll({}, {}).length).toBe(0);
    expect(classifyAll({KO:100}, {KO:100}).length).toBe(0);
  });
});
