import { Router } from 'express';
import { fetchQuotes, fetchHistorical } from '../ib-client.js';
import { withCache, cacheKey, isFresh } from '../cache.js';
import { sendIbError } from './_helpers.js';

const router = Router();

const MAX_QUOTE_SYMBOLS = 50;

// GET /quotes?symbols=AAPL,MSFT,...
router.get('/quotes', async (req, res) => {
  const raw = String(req.query.symbols || '').trim();
  if (!raw) return res.status(400).json({ error: 'missing_symbols' });

  const symbols = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) return res.status(400).json({ error: 'missing_symbols' });
  if (symbols.length > MAX_QUOTE_SYMBOLS) {
    return res.status(400).json({ error: 'too_many_symbols', max: MAX_QUOTE_SYMBOLS });
  }

  try {
    // We cache PER SYMBOL so partial-overlap requests share results.
    const fresh = isFresh(req);
    const result = {};
    await Promise.all(
      symbols.map(async (sym) => {
        const cached = await withCache(cacheKey('quote', { sym }), 1, fresh, async () => {
          // fetchQuotes batches internally — but for cache granularity we fetch one-by-one here.
          // The lib still parallelizes inside fetchQuotes so a single-symbol map is fine.
          const r = await fetchQuotes([sym]);
          return r[sym];
        });
        result[sym] = cached;
      }),
    );
    res.json(result);
  } catch (err) {
    sendIbError(res, err);
  }
});

// GET /historical?symbol=KO&duration=30D&bar_size=1d
router.get('/historical', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'missing_symbol' });

  // Accept compact forms like "30D" or "1Y" as well as IB-native "30 D" / "1 Y".
  const duration = expandDuration(String(req.query.duration || '30D'));
  const barSize = expandBarSize(String(req.query.bar_size || '1d'));

  try {
    const data = await withCache(
      cacheKey('historical', { symbol, duration, barSize }),
      3600, // 1h
      isFresh(req),
      () => fetchHistorical(symbol, duration, barSize),
    );
    res.json({ symbol, duration, bar_size: barSize, bars: data });
  } catch (err) {
    sendIbError(res, err);
  }
});

function expandDuration(s) {
  // "30D" → "30 D",  "6M" → "6 M",  "1Y" → "1 Y",  already-spaced passthrough.
  const m = String(s).match(/^(\d+)\s*([SDWMY])$/i);
  if (!m) return s;
  return `${m[1]} ${m[2].toUpperCase()}`;
}

function expandBarSize(s) {
  const map = {
    '1m': '1 min',
    '5m': '5 mins',
    '15m': '15 mins',
    '30m': '30 mins',
    '1h': '1 hour',
    '1d': '1 day',
    '1w': '1 week',
    '1mo': '1 month',
  };
  const k = s.toLowerCase().replace(/\s+/g, '');
  return map[k] || s;
}

export default router;
