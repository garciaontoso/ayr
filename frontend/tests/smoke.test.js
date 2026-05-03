// tests/smoke.test.js — smoke test CI-friendly.
// Sirve para confirmar que vitest arranca correctamente en pipeline.
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('1 + 1 === 2', () => {
    expect(1 + 1).toBe(2);
  });
});
