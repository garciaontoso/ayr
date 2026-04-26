import { Router } from 'express';
import { fetchOptionChain, fetchIV } from '../ib-client.js';
import { withCache, cacheKey, isFresh } from '../cache.js';
import { sendIbError } from './_helpers.js';

const router = Router();

// GET /option-chain?symbol=KO&dte_min=20&dte_max=45&otm_pct=0.10
router.get('/option-chain', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'missing_symbol' });

  const dteMin = parseInt(req.query.dte_min ?? '20', 10);
  const dteMax = parseInt(req.query.dte_max ?? '45', 10);
  const otmPct = Number.parseFloat(req.query.otm_pct ?? '0.10');

  if (!Number.isFinite(dteMin) || !Number.isFinite(dteMax) || dteMin < 0 || dteMax > 365 || dteMin > dteMax) {
    return res.status(400).json({ error: 'invalid_dte_range' });
  }
  if (!Number.isFinite(otmPct) || otmPct <= 0 || otmPct > 0.5) {
    return res.status(400).json({ error: 'invalid_otm_pct', hint: 'must be between 0 and 0.5' });
  }

  try {
    const data = await withCache(
      cacheKey('option_chain', { symbol, dteMin, dteMax, otmPct }),
      30,
      isFresh(req),
      () => fetchOptionChain(symbol, { dteMin, dteMax, otmPct }),
    );
    res.json(data);
  } catch (err) {
    sendIbError(res, err);
  }
});

// GET /iv?symbol=KO&period=30
router.get('/iv', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'missing_symbol' });

  const period = parseInt(req.query.period ?? '30', 10);
  if (!Number.isFinite(period) || period < 1 || period > 365) {
    return res.status(400).json({ error: 'invalid_period' });
  }

  try {
    const data = await withCache(
      cacheKey('iv', { symbol, period }),
      300, // 5 min
      isFresh(req),
      () => fetchIV(symbol, period),
    );
    res.json(data);
  } catch (err) {
    sendIbError(res, err);
  }
});

export default router;
