import { Router } from 'express';
import { fetchAccountSummary, fetchPositions } from '../ib-client.js';
import { withCache, cacheKey, isFresh } from '../cache.js';
import { sendIbError } from './_helpers.js';

const router = Router();

// GET /nav — full account summary. Cache: 10s.
router.get('/nav', async (req, res) => {
  try {
    const data = await withCache(cacheKey('nav'), 10, isFresh(req), () => fetchAccountSummary());
    res.json(data);
  } catch (err) {
    sendIbError(res, err);
  }
});

// GET /margin — subset focused on margin metrics. Cache: 10s.
router.get('/margin', async (req, res) => {
  try {
    const summary = await withCache(cacheKey('nav'), 10, isFresh(req), () => fetchAccountSummary());
    const nlv = summary.net_liquidation;
    const maint = summary.maint_margin_req;
    const leverage = nlv && nlv > 0 && maint != null ? maint / nlv : null;
    res.json({
      account_id: summary.account_id,
      currency: summary.currency,
      init_margin_req: summary.init_margin_req,
      maint_margin_req: summary.maint_margin_req,
      excess_liquidity: summary.excess_liquidity,
      cushion_pct: summary.cushion_pct,
      leverage,
      updated_at: summary.updated_at,
    });
  } catch (err) {
    sendIbError(res, err);
  }
});

// GET /positions — all open positions. Cache: 30s.
router.get('/positions', async (req, res) => {
  try {
    const data = await withCache(cacheKey('positions'), 30, isFresh(req), () => fetchPositions());
    res.json(data);
  } catch (err) {
    sendIbError(res, err);
  }
});

export default router;
