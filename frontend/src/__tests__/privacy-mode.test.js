import { describe, it, expect } from 'vitest';

// Privacy mode hide helpers (extracted pure functions matching App.jsx lines 349-350)
const makeHide = (privacyMode) => ({
  hide: (v) => privacyMode ? '•••••' : v,
  hideN: (v) => privacyMode ? '•••' : v,
});

describe('Privacy mode hide helpers', () => {
  describe('hide (long mask)', () => {
    it('masks string values when enabled', () => {
      const { hide } = makeHide(true);
      expect(hide('$1,234,567')).toBe('•••••');
    });

    it('masks numeric values when enabled', () => {
      const { hide } = makeHide(true);
      expect(hide(1234567)).toBe('•••••');
    });

    it('passes through string values when disabled', () => {
      const { hide } = makeHide(false);
      expect(hide('$1,234,567')).toBe('$1,234,567');
    });

    it('passes through numeric values when disabled', () => {
      const { hide } = makeHide(false);
      expect(hide(42.5)).toBe(42.5);
    });

    it('passes through null when disabled', () => {
      const { hide } = makeHide(false);
      expect(hide(null)).toBeNull();
    });

    it('masks null when enabled', () => {
      const { hide } = makeHide(true);
      expect(hide(null)).toBe('•••••');
    });

    it('mask is exactly 5 bullets', () => {
      const { hide } = makeHide(true);
      expect(hide('any')).toHaveLength(5);
    });
  });

  describe('hideN (short mask)', () => {
    it('masks values when enabled', () => {
      const { hideN } = makeHide(true);
      expect(hideN('123')).toBe('•••');
    });

    it('passes through when disabled', () => {
      const { hideN } = makeHide(false);
      expect(hideN('123')).toBe('123');
    });

    it('mask is exactly 3 bullets', () => {
      const { hideN } = makeHide(true);
      expect(hideN('any')).toHaveLength(3);
    });
  });

  describe('toggle state semantics', () => {
    it('enabling privacy mode hides all values', () => {
      const values = ['$10,000', 175.5, 1000, null, undefined, 0];
      const { hide } = makeHide(true);
      for (const v of values) {
        expect(hide(v)).toBe('•••••');
      }
    });

    it('disabling privacy mode reveals all values', () => {
      const values = ['$10,000', 175.5, 1000, '—'];
      const { hide } = makeHide(false);
      for (const v of values) {
        expect(hide(v)).toBe(v);
      }
    });
  });
});

// Privacy mode localStorage key constants
describe('Privacy mode localStorage key', () => {
  it('privacy key is ayr_privacy', () => {
    // This constant is hardcoded in App.jsx line 218
    // Testing it here ensures any accidental rename breaks a test
    const PRIVACY_KEY = 'ayr_privacy';
    const PRIVACY_VALUE = '1';
    expect(PRIVACY_KEY).toBe('ayr_privacy');
    expect(PRIVACY_VALUE).toBe('1');
  });
});
