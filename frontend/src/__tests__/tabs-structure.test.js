import { describe, it, expect } from 'vitest';
import { TABS, HOME_TABS, HOME_TAB_GROUPS } from '../constants/index.js';

// ── Structural invariants for TABS (analysis) ─────────────────────────────────

describe('TABS structural invariants', () => {
  it('contains exactly the expected analysis tab ids', () => {
    const ids = TABS.map(t => t.id);
    const expected = ['dash', 'tesis', 'transcript', 'archive', 'business', 'chart',
      'claude', 'qualityAll', 'debt', 'divAll', 'valAll', 'verdict', 'data', 'report',
      'dst', 'options'];
    for (const id of expected) {
      expect(ids, `missing tab id: ${id}`).toContain(id);
    }
  });

  it('all tabs use {id, lbl, ico} shape — NOT {id, label, icon}', () => {
    for (const t of TABS) {
      expect(t, `${t.id} uses 'label' instead of 'lbl'`).not.toHaveProperty('label');
      expect(t, `${t.id} uses 'icon' instead of 'ico'`).not.toHaveProperty('icon');
      expect(t.lbl).toBeDefined();
      expect(t.ico).toBeDefined();
    }
  });

  it('tab ids are non-empty strings', () => {
    for (const t of TABS) {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
    }
  });

  it('tab labels are non-empty strings', () => {
    for (const t of TABS) {
      expect(typeof t.lbl).toBe('string');
      expect(t.lbl.length).toBeGreaterThan(0);
    }
  });
});

// ── Structural invariants for HOME_TABS ──────────────────────────────────────

describe('HOME_TABS structural invariants', () => {
  it('all tabs use {id, lbl, ico} shape — NOT {id, label, icon}', () => {
    for (const t of HOME_TABS) {
      expect(t, `${t.id} uses 'label'`).not.toHaveProperty('label');
      expect(t, `${t.id} uses 'icon'`).not.toHaveProperty('icon');
    }
  });

  it('contains expected group anchor tabs', () => {
    const ids = HOME_TABS.map(t => t.id);
    const mustHave = ['portfolio', 'dividendos', 'fire', 'macro', 'cantera', 'gastos'];
    for (const id of mustHave) {
      expect(ids, `missing home tab: ${id}`).toContain(id);
    }
  });

  it('has at least 20 total home tabs', () => {
    expect(HOME_TABS.length).toBeGreaterThanOrEqual(20);
  });
});

// ── HOME_TAB_GROUPS invariants ────────────────────────────────────────────────

describe('HOME_TAB_GROUPS invariants', () => {
  const GROUP_IDS = ['cartera', 'ingresos', 'finanzas', 'mercado', 'research'];

  it('has exactly the expected group ids', () => {
    const ids = HOME_TAB_GROUPS.map(g => g.id);
    for (const gid of GROUP_IDS) {
      expect(ids).toContain(gid);
    }
    expect(ids).toHaveLength(GROUP_IDS.length);
  });

  it('each group has at least 2 tabs', () => {
    for (const g of HOME_TAB_GROUPS) {
      expect(g.tabs.length, `group ${g.id} has fewer than 2 tabs`).toBeGreaterThanOrEqual(2);
    }
  });

  it('cartera group contains portfolio and dashboard', () => {
    const cartera = HOME_TAB_GROUPS.find(g => g.id === 'cartera');
    const ids = cartera.tabs.map(t => t.id);
    expect(ids).toContain('portfolio');
    expect(ids).toContain('dashboard');
  });

  it('finanzas group contains fire', () => {
    const finanzas = HOME_TAB_GROUPS.find(g => g.id === 'finanzas');
    const ids = finanzas.tabs.map(t => t.id);
    expect(ids).toContain('fire');
  });

  it('research group contains cantera, discovery, div-scanner', () => {
    const research = HOME_TAB_GROUPS.find(g => g.id === 'research');
    const ids = research.tabs.map(t => t.id);
    expect(ids).toContain('cantera');
    expect(ids).toContain('discovery');
    expect(ids).toContain('div-scanner');
  });

  it('ingresos group contains dividendos', () => {
    const ingresos = HOME_TAB_GROUPS.find(g => g.id === 'ingresos');
    const ids = ingresos.tabs.map(t => t.id);
    expect(ids).toContain('dividendos');
  });

  it('all tab ids within groups are globally unique (no cross-group duplication)', () => {
    const allIds = HOME_TAB_GROUPS.flatMap(g => g.tabs.map(t => t.id));
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });
});
