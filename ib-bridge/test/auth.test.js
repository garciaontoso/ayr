import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

// Mock the IB client BEFORE importing the app — so creating the Express app
// never touches real IB connections.
vi.mock('../src/ib-client.js', () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  getStatus: vi.fn().mockReturnValue({
    connected: true,
    serverVersion: '176',
    lastError: null,
    host: 'mock',
    port: 4001,
    clientId: 1,
  }),
  fetchAccountSummary: vi.fn().mockResolvedValue({
    account_id: 'U_MOCK',
    currency: 'USD',
    net_liquidation: 1_000_000,
    equity_with_loan_value: 990_000,
    buying_power: 4_000_000,
    available_funds: 800_000,
    excess_liquidity: 750_000,
    init_margin_req: 200_000,
    maint_margin_req: 150_000,
    cushion_pct: 0.61,
    updated_at: new Date().toISOString(),
  }),
  fetchPositions: vi.fn().mockResolvedValue([]),
  fetchQuote: vi.fn(),
  fetchQuotes: vi.fn().mockResolvedValue({}),
  fetchHistorical: vi.fn().mockResolvedValue([]),
  fetchOptionChain: vi.fn(),
  fetchIV: vi.fn(),
}));

const TOKEN = 'test-token-9f2c1a';

describe('bearer auth', () => {
  let app;

  beforeAll(async () => {
    process.env.BRIDGE_AUTH_TOKEN = TOKEN;
    process.env.READ_ONLY_API = 'yes';
    const mod = await import('../src/index.js');
    app = mod.createApp();
  });

  afterAll(() => {
    delete process.env.BRIDGE_AUTH_TOKEN;
    delete process.env.READ_ONLY_API;
  });

  it('GET /health works without auth', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body).toHaveProperty('version');
    expect(r.body).toHaveProperty('uptime_sec');
  });

  it('GET /nav without Authorization header returns 401', async () => {
    const r = await request(app).get('/nav');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'auth_required' });
  });

  it('GET /nav with wrong token returns 401', async () => {
    const r = await request(app).get('/nav').set('Authorization', 'Bearer not-the-real-token');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'auth_required' });
  });

  it('GET /nav with malformed Authorization header returns 401', async () => {
    const r = await request(app).get('/nav').set('Authorization', 'Basic some-creds');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'auth_required' });
  });

  it('GET /nav with correct Bearer token does NOT return 401', async () => {
    const r = await request(app).get('/nav').set('Authorization', `Bearer ${TOKEN}`);
    expect(r.status).not.toBe(401);
    // With the mock above we expect 200 + a JSON payload
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('account_id');
    expect(r.body).toHaveProperty('net_liquidation');
  });

  it('header lookup is case-insensitive', async () => {
    const r = await request(app).get('/nav').set('authorization', `Bearer ${TOKEN}`);
    expect(r.status).not.toBe(401);
  });

  it('unknown route returns JSON 404, not HTML', async () => {
    const r = await request(app).get('/no-such-endpoint').set('Authorization', `Bearer ${TOKEN}`);
    expect(r.status).toBe(404);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(r.body).toEqual({ error: 'not_found', path: '/no-such-endpoint' });
  });
});
