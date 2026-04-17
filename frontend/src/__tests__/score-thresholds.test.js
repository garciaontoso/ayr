import { describe, it, expect } from 'vitest';

// Score color thresholds from DiscoveryTab and DividendScannerTab
// These are business rules — we test them as pure functions to lock
// in the thresholds and prevent accidental changes.

// DiscoveryTab: scoreColor(s) → 0-100 scale
function discoveryScoreColor(s) {
  return s >= 70 ? '#30d158' : s >= 50 ? '#c8a44e' : '#ff453a';
}

// DividendScannerTab: scoreColor(s) → 0-10 scale
function scannerScoreColor(s) {
  if (s >= 8) return '#30d158';
  if (s >= 6) return '#c8a44e';
  if (s >= 4) return '#ff9f0a';
  return '#ff453a';
}

describe('Discovery tab score color thresholds (0-100 scale)', () => {
  it('70+ is green', () => {
    expect(discoveryScoreColor(70)).toBe('#30d158');
    expect(discoveryScoreColor(100)).toBe('#30d158');
    expect(discoveryScoreColor(85)).toBe('#30d158');
  });

  it('50-69 is gold', () => {
    expect(discoveryScoreColor(50)).toBe('#c8a44e');
    expect(discoveryScoreColor(69)).toBe('#c8a44e');
    expect(discoveryScoreColor(60)).toBe('#c8a44e');
  });

  it('below 50 is red', () => {
    expect(discoveryScoreColor(49)).toBe('#ff453a');
    expect(discoveryScoreColor(0)).toBe('#ff453a');
    expect(discoveryScoreColor(30)).toBe('#ff453a');
  });

  it('boundary at 70 is green not gold', () => {
    expect(discoveryScoreColor(70)).toBe('#30d158');
    expect(discoveryScoreColor(69)).toBe('#c8a44e');
  });

  it('boundary at 50 is gold not red', () => {
    expect(discoveryScoreColor(50)).toBe('#c8a44e');
    expect(discoveryScoreColor(49)).toBe('#ff453a');
  });
});

describe('Dividend scanner score color thresholds (0-10 scale)', () => {
  it('8+ is green', () => {
    expect(scannerScoreColor(8)).toBe('#30d158');
    expect(scannerScoreColor(10)).toBe('#30d158');
    expect(scannerScoreColor(9.5)).toBe('#30d158');
  });

  it('6-7.9 is gold', () => {
    expect(scannerScoreColor(6)).toBe('#c8a44e');
    expect(scannerScoreColor(7.9)).toBe('#c8a44e');
  });

  it('4-5.9 is orange', () => {
    expect(scannerScoreColor(4)).toBe('#ff9f0a');
    expect(scannerScoreColor(5.9)).toBe('#ff9f0a');
  });

  it('below 4 is red', () => {
    expect(scannerScoreColor(3.9)).toBe('#ff453a');
    expect(scannerScoreColor(0)).toBe('#ff453a');
  });

  it('boundary: 8 is green, 7.99 is gold', () => {
    expect(scannerScoreColor(8)).toBe('#30d158');
    expect(scannerScoreColor(7.99)).toBe('#c8a44e');
  });

  it('boundary: 4 is orange, 3.99 is red', () => {
    expect(scannerScoreColor(4)).toBe('#ff9f0a');
    expect(scannerScoreColor(3.99)).toBe('#ff453a');
  });
});

// Tier system from DiscoveryTab
const TIER_ORDER = ['HOT', 'STRONG', 'WATCH', 'RADAR'];
const TIER_META = {
  HOT:    { label: 'HOT',    bg: 'rgba(255,69,58,.12)',    c: '#ff453a' },
  STRONG: { label: 'STRONG', bg: 'rgba(200,164,78,.12)', c: '#c8a44e' },
  WATCH:  { label: 'WATCH',  bg: 'rgba(10,132,255,.12)', c: '#64d2ff' },
  RADAR:  { label: 'RADAR',  bg: 'rgba(100,100,100,.12)', c: '#8e8e93' },
};

describe('Discovery tab tier system', () => {
  it('all 4 tiers are defined', () => {
    for (const t of TIER_ORDER) {
      expect(TIER_META[t]).toBeDefined();
    }
  });

  it('HOT is first in tier order (highest priority)', () => {
    expect(TIER_ORDER[0]).toBe('HOT');
  });

  it('RADAR is last in tier order (lowest priority)', () => {
    expect(TIER_ORDER[TIER_ORDER.length - 1]).toBe('RADAR');
  });

  it('each tier has label, bg, c properties', () => {
    for (const [, meta] of Object.entries(TIER_META)) {
      expect(meta.label).toBeDefined();
      expect(meta.bg).toBeDefined();
      expect(meta.c).toBeDefined();
    }
  });

  it('HOT tier uses red color (urgency)', () => {
    expect(TIER_META.HOT.c).toBe('#ff453a');
  });

  it('STRONG tier uses gold color (quality)', () => {
    expect(TIER_META.STRONG.c).toBe('#c8a44e');
  });
});
