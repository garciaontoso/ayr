// Regression test Bug #015 (2026-05-10):
// IB_FLEX_TOKEN caducado → 9 días silent failure cron.
// Logs en /tmp purgados al reboot. Sin freshness alert, fallo invisible.
//
// Test verifica la lógica del freshness check: si MAX(fecha) en cost_basis
// o dividendos tiene gap >5 business days, debe disparar severity = critical.

import { describe, it, expect } from 'vitest';

function businessDaysSince(dateStr, today = Date.now()) {
  if (!dateStr) return 999;
  const start = new Date(dateStr).getTime();
  let days = 0;
  for (let t = start; t < today; t += 86400000) {
    const day = new Date(t).getDay();
    if (day >= 1 && day <= 5) days++;
  }
  return days;
}

function classifySeverity(bdays, criticalThreshold, warnThreshold) {
  if (bdays > criticalThreshold) return 'critical';
  if (bdays > warnThreshold) return 'warn';
  return 'ok';
}

describe('Bug #015 — IB Flex sync freshness', () => {
  it('detecta gap de 9 días business como critical', () => {
    const today = new Date('2026-05-10T12:00:00Z').getTime();
    const lastSync = '2026-04-29'; // 9 business days ago (Wed)
    const bdays = businessDaysSince(lastSync, today);
    expect(bdays).toBeGreaterThan(5);
    const sev = classifySeverity(bdays, 5, 3);
    expect(sev).toBe('critical');
  });

  it('1-2 business days = ok (depende timezone parsing)', () => {
    const today = new Date('2026-05-12T12:00:00Z').getTime(); // Tuesday
    const lastSync = '2026-05-11'; // Monday
    const bdays = businessDaysSince(lastSync, today);
    expect(bdays).toBeLessThanOrEqual(2);
    expect(classifySeverity(bdays, 5, 3)).toBe('ok');
  });

  it('weekends no cuentan como business days', () => {
    const today = new Date('2026-05-12T12:00:00Z').getTime(); // Tuesday
    const lastSync = '2026-05-08'; // Friday — Fri+Mon business days
    const bdays = businessDaysSince(lastSync, today);
    // Esperamos que NO cuente sat/dom (entonces <= 4 días totales en lugar de calendar 4)
    expect(bdays).toBeLessThanOrEqual(3);
    // Calendar days serían 4 (8,9,10,11 incluso 12) pero business <= 3
  });

  it('null/missing date = severity error implícito', () => {
    const bdays = businessDaysSince(null);
    expect(bdays).toBe(999);
    expect(classifySeverity(bdays, 5, 3)).toBe('critical');
  });

  it('threshold 5 días para critical en cost_basis (regla Bug #015)', () => {
    // Si último trade 6 días business atrás, debe ser critical
    expect(classifySeverity(6, 5, 3)).toBe('critical');
    // Si 4 días, warn
    expect(classifySeverity(4, 5, 3)).toBe('warn');
    // Si 3 días, ok
    expect(classifySeverity(3, 5, 3)).toBe('ok');
  });

  it('threshold 7 días para critical en dividendos (puede haber gap natural)', () => {
    // Dividendos pueden no llegar diariamente, threshold más laxo
    expect(classifySeverity(8, 7, 5)).toBe('critical');
    expect(classifySeverity(6, 7, 5)).toBe('warn');
    expect(classifySeverity(4, 7, 5)).toBe('ok');
  });
});
