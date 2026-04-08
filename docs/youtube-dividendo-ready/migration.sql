-- YouTube Dividendo Agent — D1 migration
-- Apply with: npx wrangler d1 execute aar-finanzas --file=docs/youtube-dividendo-ready/migration.sql --remote
-- Created 2026-04-07

CREATE TABLE IF NOT EXISTS youtube_videos (
  video_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  title TEXT NOT NULL,
  published_at TEXT NOT NULL,
  duration_seconds INTEGER,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  transcript TEXT,
  transcript_source TEXT,
  summary_general TEXT,
  scanned_at TEXT NOT NULL,
  processing_cost_usd REAL,
  status TEXT DEFAULT 'pending'   -- 'pending' | 'transcribed' | 'summarized' | 'error'
);

CREATE TABLE IF NOT EXISTS youtube_video_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  ticker TEXT,
  company_name TEXT NOT NULL,
  thesis TEXT,
  verdict TEXT,                   -- 'compra' | 'mantener' | 'evitar' | 'observar' | 'vender'
  target_price TEXT,
  fair_value TEXT,
  risks TEXT,                     -- JSON array stringified
  catalyst TEXT,
  timestamp_seconds INTEGER,
  FOREIGN KEY (video_id) REFERENCES youtube_videos(video_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_yt_companies_ticker ON youtube_video_companies(ticker);
CREATE INDEX IF NOT EXISTS idx_yt_companies_video ON youtube_video_companies(video_id);
CREATE INDEX IF NOT EXISTS idx_yt_videos_published ON youtube_videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_yt_videos_status ON youtube_videos(status);

-- Tabla opcional para tracking multi-canal (futuro)
CREATE TABLE IF NOT EXISTS youtube_channels (
  channel_id TEXT PRIMARY KEY,
  handle TEXT,
  name TEXT,
  enabled INTEGER DEFAULT 1,
  last_scan_at TEXT,
  notes TEXT
);

INSERT OR IGNORE INTO youtube_channels (channel_id, handle, name, enabled)
VALUES ('UCM-udvxv3eBO0LcCmnJjNbw', '@eldividendo3101', 'El Dividendo', 1);
