// Checks a video is public and can be embedded, and finds out whose channel
// it's on, using YouTube's free oEmbed endpoint (no key needed). Gemini can
// only watch public videos.

const oembedUrl = () => process.env.YOUTUBE_OEMBED_URL || 'https://www.youtube.com/oembed';
const isWebLink = (value: unknown): value is string => typeof value === 'string' && /^https?:\/\//.test(value);

// What YouTube's oEmbed answers.
interface OEmbed {
  title?: unknown;
  author_name?: unknown;
  author_url?: unknown;
}

export interface VideoChannel {
  name: string;
  url?: string;
}
export interface VideoInfo {
  title: string;
  channel: VideoChannel | null;
}
// Whether the AI can watch a video: ok with its title, or why not.
export type VideoCheck = { ok: true; title: string; author: string } | { ok: false; reason: string; retryable?: boolean };

// The video's title and channel: { title, channel: { name, url } | null }, or
// null if YouTube doesn't say (a private video, or YouTube can't be reached).
export async function fetchVideoInfo(youtubeId: string, { timeoutMs = 5000 }: { timeoutMs?: number } = {}): Promise<VideoInfo | null> {
  const url = `${oembedUrl()}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const info = (await res.json()) as OEmbed;
    const title = typeof info.title === 'string' ? info.title.trim().slice(0, 200) : '';
    const name = typeof info.author_name === 'string' ? info.author_name.trim().slice(0, 100) : '';
    return { title, channel: name ? { name, url: isWebLink(info.author_url) ? info.author_url : undefined } : null };
  } catch {
    return null;
  }
}

// The YouTube channel the video is on: { name, url }, or null.
export async function fetchChannel(youtubeId: string, options?: { timeoutMs?: number }): Promise<VideoChannel | null> {
  return (await fetchVideoInfo(youtubeId, options))?.channel ?? null;
}

export async function checkVideo(youtubeId: string): Promise<VideoCheck> {
  const url = `${oembedUrl()}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch {
    return { ok: false, retryable: true, reason: "Couldn't reach YouTube to check the video." };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "The video's owner doesn't allow it to be played on other websites." };
  }
  if (!res.ok) return { ok: false, reason: 'This video is private, unlisted or was removed. The AI can only watch public videos.' };
  const info = (await res.json().catch(() => ({}))) as OEmbed;
  return { ok: true, title: typeof info.title === 'string' ? info.title : '', author: typeof info.author_name === 'string' ? info.author_name : '' };
}
