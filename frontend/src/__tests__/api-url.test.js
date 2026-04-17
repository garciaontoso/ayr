import { describe, it, expect } from 'vitest';
import { API_URL } from '../constants/index.js';

describe('API_URL configuration', () => {
  it('uses custom domain, not workers.dev (blocked CF IPs)', () => {
    expect(API_URL).not.toContain('workers.dev');
  });

  it('uses api.onto-so.com (current production domain)', () => {
    expect(API_URL).toBe('https://api.onto-so.com');
  });

  it('uses HTTPS', () => {
    expect(API_URL.startsWith('https://')).toBe(true);
  });

  it('has no trailing slash', () => {
    expect(API_URL.endsWith('/')).toBe(false);
  });

  it('is a valid URL', () => {
    expect(() => new URL(API_URL)).not.toThrow();
  });

  it('path construction pattern works', () => {
    const endpoint = API_URL + '/api/positions';
    expect(endpoint).toBe('https://api.onto-so.com/api/positions');
  });

  it('all constructed API paths start with /api/', () => {
    const paths = ['/api/positions', '/api/fx', '/api/alerts', '/api/patrimonio', '/api/tax-report'];
    for (const path of paths) {
      const full = API_URL + path;
      expect(new URL(full).pathname.startsWith('/api/')).toBe(true);
    }
  });
});
