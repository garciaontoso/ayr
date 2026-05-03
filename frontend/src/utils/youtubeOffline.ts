// Extracted from YouTubeTab.jsx so it can be imported without pulling
// the full tab component into the eager bundle.
import { API_URL } from '../constants/index.js';

interface YouTubeChannel {
  channel_id: string;
  [k: string]: unknown;
}

interface YouTubeVideo {
  [k: string]: unknown;
}

interface ChannelsResponse {
  channels?: YouTubeChannel[];
}

interface VideosResponse {
  videos?: YouTubeVideo[];
}

export async function fetchAllYouTubeForOffline(): Promise<number> {
  try {
    const rc = await fetch(`${API_URL}/api/youtube/channels`);
    if (!rc.ok) throw new Error(`HTTP ${rc.status}`);
    const cdata = (await rc.json()) as ChannelsResponse;
    const channels = cdata.channels || [];
    localStorage.setItem('offline_youtube_channels', JSON.stringify({
      fetched_at: new Date().toISOString(),
      channels,
    }));
    let total = 0;
    for (const ch of channels) {
      try {
        const r = await fetch(`${API_URL}/api/youtube/videos?channel_id=${encodeURIComponent(ch.channel_id)}&limit=200`);
        if (!r.ok) continue;
        const data = (await r.json()) as VideosResponse;
        const videos = data.videos || [];
        localStorage.setItem(`offline_youtube_videos_${ch.channel_id}`, JSON.stringify({
          fetched_at: new Date().toISOString(),
          videos,
        }));
        total += videos.length;
      } catch { /* ignore */ }
    }
    return total;
  } catch (e) {
    console.warn('YouTube offline fetch failed', e);
    return 0;
  }
}
