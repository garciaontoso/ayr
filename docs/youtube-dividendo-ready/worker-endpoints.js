// worker-endpoints.js — READY-TO-DROP
// Paste these handlers into api/src/worker.js alongside existing /api/* routes.
// Tested-as-spec against the migration.sql in this directory.
//
// Routes:
//   POST /api/youtube/scan-channel       -- RSS diff, mark new videos as pending
//   GET  /api/youtube/pending            -- list pending video_ids (called by Mac script)
//   POST /api/youtube/upload-summary     -- Mac script posts Opus JSON → parsed → D1
//   POST /api/youtube/mark-error         -- Mac script marks a video as errored
//   GET  /api/youtube/videos             -- frontend list (with embedded companies)
//   GET  /api/youtube/video/:video_id    -- frontend detail
//   GET  /api/youtube/portfolio-mentions -- which of my positions were mentioned recently
//
// Auth: /pending, /upload-summary, /mark-error require Bearer AYR_WORKER_TOKEN (shared with Mac script).
// Frontend routes are unauthenticated (same as the rest of /api).

// ===== helpers =====

function requireToken(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || token !== env.AYR_WORKER_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}

async function parseXmlVideos(xml) {
  // Very small RSS parser — youtube feeds have a stable structure.
  const videos = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const entry = m[1];
    const id = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const title = (entry.match(/<title>([^<]+)<\/title>/) || [])[1];
    const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1];
    const thumb = (entry.match(/<media:thumbnail url="([^"]+)"/) || [])[1];
    if (id) {
      videos.push({
        video_id: id,
        title,
        published_at: published,
        thumbnail_url: thumb,
        url: `https://www.youtube.com/watch?v=${id}`,
      });
    }
  }
  return videos;
}

// Tolerant JSON extractor — Opus sometimes wraps in ```json despite instructions
function extractJSON(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    // last-ditch: find first { and last }
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { return JSON.parse(candidate.slice(first, last + 1)); } catch {}
    }
    return null;
  }
}

// ===== POST /api/youtube/scan-channel =====
// Body: { channel_id?: string }
// No auth: called by frontend button. Idempotent.
async function handleScanChannel(request, env) {
  let body = {};
  try { body = await request.json(); } catch {}
  const channelId = body.channel_id || 'UCM-udvxv3eBO0LcCmnJjNbw';

  const rssResp = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (AyR-bot)' } }
  );
  if (!rssResp.ok) {
    return Response.json({ error: 'rss fetch failed', status: rssResp.status }, { status: 502 });
  }
  const xml = await rssResp.text();
  const videos = await parseXmlVideos(xml);

  // Diff vs existing
  const existing = await env.DB.prepare(
    `SELECT video_id FROM youtube_videos WHERE channel_id = ?`
  ).bind(channelId).all();
  const existingIds = new Set((existing.results || []).map(r => r.video_id));

  const newVideos = videos.filter(v => !existingIds.has(v.video_id));

  // Insert new as 'pending'
  const now = new Date().toISOString();
  for (const v of newVideos) {
    await env.DB.prepare(
      `INSERT INTO youtube_videos (video_id, channel_id, title, published_at, url, thumbnail_url, scanned_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).bind(v.video_id, channelId, v.title, v.published_at, v.url, v.thumbnail_url || null, now).run();
  }

  await env.DB.prepare(
    `UPDATE youtube_channels SET last_scan_at = ? WHERE channel_id = ?`
  ).bind(now, channelId).run();

  return Response.json({
    ok: true,
    channel_id: channelId,
    new_videos: newVideos.length,
    total_in_feed: videos.length,
    pending_transcription: newVideos.length,
    message: newVideos.length > 0
      ? `${newVideos.length} vídeo(s) nuevos. Ejecuta scan-youtube.sh en el Mac para transcribir y resumir.`
      : 'No hay vídeos nuevos.',
  });
}

// ===== GET /api/youtube/pending =====
async function handlePending(request, env) {
  const unauth = requireToken(request, env);
  if (unauth) return unauth;

  const rows = await env.DB.prepare(
    `SELECT video_id, title, url FROM youtube_videos WHERE status = 'pending' ORDER BY published_at DESC LIMIT 20`
  ).all();
  return Response.json({ pending: rows.results || [] });
}

// ===== POST /api/youtube/upload-summary =====
async function handleUploadSummary(request, env) {
  const unauth = requireToken(request, env);
  if (unauth) return unauth;

  const body = await request.json();
  const { video_id, model, transcript_source, processing_cost_usd, raw_summary } = body;
  if (!video_id || !raw_summary) {
    return Response.json({ error: 'missing fields' }, { status: 400 });
  }

  const parsed = extractJSON(raw_summary);
  if (!parsed || !parsed.companies) {
    await env.DB.prepare(
      `UPDATE youtube_videos SET status = 'error' WHERE video_id = ?`
    ).bind(video_id).run();
    return Response.json({ error: 'could not parse summary JSON', raw: raw_summary.slice(0, 500) }, { status: 422 });
  }

  await env.DB.prepare(
    `UPDATE youtube_videos
     SET summary_general = ?, processing_cost_usd = ?, transcript_source = ?, status = 'summarized'
     WHERE video_id = ?`
  ).bind(
    parsed.summary_general || null,
    processing_cost_usd || 0,
    transcript_source || null,
    video_id
  ).run();

  // Wipe and re-insert companies (idempotent if re-run)
  await env.DB.prepare(`DELETE FROM youtube_video_companies WHERE video_id = ?`).bind(video_id).run();

  for (const c of parsed.companies || []) {
    await env.DB.prepare(
      `INSERT INTO youtube_video_companies
        (video_id, ticker, company_name, thesis, verdict, target_price, fair_value, risks, catalyst, timestamp_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      video_id,
      c.ticker || null,
      c.company_name || 'Unknown',
      c.thesis || null,
      c.verdict || null,
      c.target_price || null,
      c.fair_value || null,
      Array.isArray(c.risks) ? JSON.stringify(c.risks) : (c.risks || null),
      c.catalyst || null,
      c.timestamp_seconds || null
    ).run();
  }

  return Response.json({ ok: true, video_id, companies_inserted: (parsed.companies || []).length });
}

// ===== POST /api/youtube/mark-error =====
async function handleMarkError(request, env) {
  const unauth = requireToken(request, env);
  if (unauth) return unauth;
  const { video_id, error } = await request.json();
  await env.DB.prepare(
    `UPDATE youtube_videos SET status = 'error', summary_general = ? WHERE video_id = ?`
  ).bind(`ERROR: ${error || 'unknown'}`, video_id).run();
  return Response.json({ ok: true });
}

// ===== GET /api/youtube/videos =====
// Frontend list view. Returns videos with embedded companies array.
async function handleListVideos(request, env) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const channelId = url.searchParams.get('channel_id');

  let query = `SELECT * FROM youtube_videos WHERE status IN ('summarized', 'pending')`;
  const bindings = [];
  if (channelId) {
    query += ` AND channel_id = ?`;
    bindings.push(channelId);
  }
  query += ` ORDER BY published_at DESC LIMIT ?`;
  bindings.push(limit);

  const videos = await env.DB.prepare(query).bind(...bindings).all();

  // Batch load companies for all videos
  const videoIds = (videos.results || []).map(v => v.video_id);
  let companiesByVideo = {};
  if (videoIds.length > 0) {
    const placeholders = videoIds.map(() => '?').join(',');
    const comps = await env.DB.prepare(
      `SELECT * FROM youtube_video_companies WHERE video_id IN (${placeholders})`
    ).bind(...videoIds).all();
    for (const c of comps.results || []) {
      (companiesByVideo[c.video_id] ||= []).push({
        ...c,
        risks: c.risks ? (() => { try { return JSON.parse(c.risks); } catch { return []; } })() : [],
      });
    }
  }

  // Join with positions to mark in_portfolio
  const portfolio = await env.DB.prepare(`SELECT DISTINCT ticker FROM positions`).all();
  const portfolioSet = new Set((portfolio.results || []).map(r => r.ticker));

  const enriched = (videos.results || []).map(v => ({
    ...v,
    companies: (companiesByVideo[v.video_id] || []).map(c => ({
      ...c,
      in_portfolio: c.ticker ? portfolioSet.has(c.ticker) : false,
    })),
  }));

  return Response.json({ videos: enriched });
}

// ===== GET /api/youtube/video/:video_id =====
async function handleVideoDetail(request, env, videoId) {
  const video = await env.DB.prepare(
    `SELECT * FROM youtube_videos WHERE video_id = ?`
  ).bind(videoId).first();
  if (!video) return Response.json({ error: 'not found' }, { status: 404 });

  const comps = await env.DB.prepare(
    `SELECT * FROM youtube_video_companies WHERE video_id = ? ORDER BY id ASC`
  ).bind(videoId).all();

  return Response.json({
    video,
    companies: (comps.results || []).map(c => ({
      ...c,
      risks: c.risks ? (() => { try { return JSON.parse(c.risks); } catch { return []; } })() : [],
    })),
  });
}

// ===== GET /api/youtube/portfolio-mentions =====
// For each ticker in my portfolio, latest mentions with verdict
async function handlePortfolioMentions(request, env) {
  const portfolio = await env.DB.prepare(`SELECT DISTINCT ticker FROM positions`).all();
  const tickers = (portfolio.results || []).map(r => r.ticker).filter(Boolean);
  if (tickers.length === 0) return Response.json({ mentions: [] });

  const placeholders = tickers.map(() => '?').join(',');
  const rows = await env.DB.prepare(
    `SELECT c.*, v.title, v.published_at, v.video_id as vid
     FROM youtube_video_companies c
     JOIN youtube_videos v ON v.video_id = c.video_id
     WHERE c.ticker IN (${placeholders}) AND v.status = 'summarized'
     ORDER BY v.published_at DESC`
  ).bind(...tickers).all();

  // Group by ticker
  const byTicker = {};
  for (const r of rows.results || []) {
    (byTicker[r.ticker] ||= []).push(r);
  }

  const mentions = Object.entries(byTicker).map(([ticker, items]) => ({
    ticker,
    video_count: items.length,
    latest: items[0],
    all: items,
  }));

  return Response.json({ mentions });
}

// ===== Router wiring =====
// Add these into the existing switch/if chain in worker.js fetch handler:
//
//   if (path === '/api/youtube/scan-channel' && method === 'POST') return handleScanChannel(request, env);
//   if (path === '/api/youtube/pending' && method === 'GET') return handlePending(request, env);
//   if (path === '/api/youtube/upload-summary' && method === 'POST') return handleUploadSummary(request, env);
//   if (path === '/api/youtube/mark-error' && method === 'POST') return handleMarkError(request, env);
//   if (path === '/api/youtube/videos' && method === 'GET') return handleListVideos(request, env);
//   if (path.startsWith('/api/youtube/video/') && method === 'GET') {
//     const videoId = path.split('/').pop();
//     return handleVideoDetail(request, env, videoId);
//   }
//   if (path === '/api/youtube/portfolio-mentions' && method === 'GET') return handlePortfolioMentions(request, env);
//
// And add AYR_WORKER_TOKEN to wrangler secret:
//   npx wrangler secret put AYR_WORKER_TOKEN
