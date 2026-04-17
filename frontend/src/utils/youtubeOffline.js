// Extracted from YouTubeTab.jsx so it can be imported without pulling
// the full tab component into the eager bundle.
import { API_URL } from '../constants/index.js';

export async function fetchAllYouTubeForOffline() {
  try {
    const rc = await fetch(`${API_URL}/api/youtube/channels`);
    if (!rc.ok) throw new Error(`HTTP ${rc.status}`);
    const cdata = await rc.json();
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
        const data = await r.json();
        const videos = data.videos || [];
        localStorage.setItem(`offline_youtube_videos_${ch.channel_id}`, JSON.stringify({
          fetched_at: new Date().toISOString(),
          videos,
        }));
        total += videos.length;
      } catch {}
    }
    return total;
  } catch (e) {
    console.warn('YouTube offline fetch failed', e);
    return 0;
  }
}
