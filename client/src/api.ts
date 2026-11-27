// Every call to the Express API goes through here. The browser sends the
// login cookie along automatically, because the API is on the same site.
// A failed call throws an error with the server's words and its `status`
// (0 when the server couldn't be reached at all), so a page can show the
// right error page (see pages/ErrorPage.tsx).
import type { AiJob, FoundPlace, KeyPoint, MediaMode, RouteServices, RouteStyle, ServerConfig, Trail, TrailCard, User } from './types.ts';

// An error from the API: the server's words, its status (0: not reached), and
// sometimes a code the page can act on ('exists', 'not_found', 'far_places').
export type ApiError = Error & { status: number; code?: string };

// When the server answers with an error page instead of its own words (the
// hosting's, while the server is asleep, restarting or down).
const NO_ANSWER: Record<number, string> = {
  502: "TrailCast's server sent back a broken answer. Try again in a minute.",
  503: "TrailCast's server is busy or being updated. Try again in a few minutes.",
  504: "TrailCast's server took too long to answer. It may be waking up: try again in a minute.",
};

// The server couldn't be reached: no connection, or the network dropped.
export function unreachable(): ApiError {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return Object.assign(new Error(offline ? "You're offline. Check your connection and try again." : "Couldn't reach TrailCast. Check your connection and try again."), {
    status: 0,
  });
}

async function request<T>(path: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw unreachable();
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (!data && res.status >= 500) {
      throw Object.assign(new Error(NO_ANSWER[res.status] ?? "TrailCast's server had a problem. Try again in a minute."), { status: res.status });
    }
    // code: something the page can act on, like 'exists' (an account is already there).
    throw Object.assign(new Error(data?.error ?? `Request failed (${res.status})`), { code: data?.code, status: res.status });
  }
  return data as T;
}

// A trail as the page sends it: any of its fields, and the YouTube link.
export type TrailChanges = Partial<Omit<Trail, '_id' | 'points'>> & { youtubeUrl?: string; trackElevations?: (number | null)[] | null };
export type PointChanges = Partial<Omit<KeyPoint, '_id' | 'origin'>>;
// The ways to log in or sign up: a password with an email or phone number.
export type Credentials = { password: string; email?: string; phone?: string; name?: string; username?: string };

export const api = {
  // Accounts
  me: () => request<{ user: User | null }>('/auth/me'),
  // details: { name, password, and email or phone }
  signup: (details: Credentials) => request<User>('/auth/signup', { method: 'POST', body: details }),
  // credentials: { password, and email or phone }
  login: (credentials: Credentials) => request<User>('/auth/login', { method: 'POST', body: credentials }),
  // credential: the token from Google's sign-in button. Answers { user, existing }.
  loginWithGoogle: (credential: string) =>
    request<{ user: User; existing: boolean; passwordRemoved: boolean }>('/auth/google', { method: 'POST', body: { credential } }),
  logout: () => request<null>('/auth/logout', { method: 'POST' }),
  logoutEverywhere: () => request<null>('/auth/logout-everywhere', { method: 'POST' }),
  saveOnboarding: (answers: { interests: string[]; referralSource?: string; wishlist?: string }) =>
    request<User>('/auth/onboarding', { method: 'PUT', body: answers }),
  sendFeedback: (message: string) => request<{ ok: true }>('/feedback', { method: 'POST', body: { message } }),

  // What the server can do (e.g. whether it can follow roads)
  getConfig: () => request<ServerConfig>('/config'),
  searchPlaces: (query: string) => request<FoundPlace[]>(`/places?q=${encodeURIComponent(query)}`),

  // Trails
  // The newest trails, a page at a time: `before` is the last trail already shown.
  listTrails: (before?: string) => request<TrailCard[]>(before ? `/trails?before=${encodeURIComponent(before)}` : '/trails'),
  getTrail: (id: string) => request<Trail>(`/trails/${id}`),
  // A YouTube video's title and channel (the title usually says where the trip goes).
  videoInfo: (url: string) =>
    request<{ youtubeId: string; title: string; channel: { name?: string; url?: string } | null }>(`/trails/video-info?url=${encodeURIComponent(url)}`),
  createTrail: (trail: TrailChanges) => request<Trail>('/trails', { method: 'POST', body: trail }),
  updateTrail: (id: string, changes: TrailChanges) => request<Trail>(`/trails/${id}`, { method: 'PATCH', body: changes }),
  deleteTrail: (id: string) => request<null>(`/trails/${id}`, { method: 'DELETE' }),
  addPoint: (id: string, point: PointChanges) => request<Trail>(`/trails/${id}/points`, { method: 'POST', body: point }),
  updatePoint: (id: string, pointId: string, changes: PointChanges) =>
    request<Trail>(`/trails/${id}/points/${pointId}`, { method: 'PATCH', body: changes }),
  deletePoint: (id: string, pointId: string) => request<Trail>(`/trails/${id}/points/${pointId}`, { method: 'DELETE' }),
  // style: 'roads', 'paths' or 'straight'
  drawRoute: (id: string, style: RouteStyle) => request<Trail>(`/trails/${id}/route`, { method: 'POST', body: { style } }),
  // Fuel stops, mechanics, medical help and ATMs along the route
  getServices: (id: string) => request<RouteServices>(`/trails/${id}/services`),
  // Work out the heights, services and stats again (owner only)
  enrich: (id: string) => request<{ _id: string; state: string; stage: string; routeVersion: number }>(`/trails/${id}/enrich`, { method: 'POST' }),

  // Building the route with AI
  startAiRoute: (id: string, options: { durationSec: number; highDetail?: boolean; fresh?: boolean }) =>
    request<AiJob>(`/trails/${id}/ai-route`, { method: 'POST', body: options }),
  latestAiRoute: (id: string) => request<AiJob | null>(`/trails/${id}/ai-route`),
  acceptAiRoute: (id: string, body: { jobId: string; places: object[]; hiddenRanges: object[]; keepFarPlaces?: boolean }) =>
    request<Trail>(`/trails/${id}/ai-route/accept`, { method: 'POST', body }),
  // The video's transcript instead of the video: { text, durationSec }.
  startAiFromTranscript: (id: string, body: { text: string; durationSec: number }) =>
    request<AiJob>(`/trails/${id}/ai-route/transcript`, { method: 'POST', body }),
  // A video file from the owner's computer instead of the YouTube link. options:
  // { mode: 'full' | 'picture' | 'sound', durationSec, highDetail }. onProgress gets 0 to 1.
  uploadAiVideo: (
    id: string,
    file: File,
    { mode, durationSec, highDetail }: { mode: MediaMode; durationSec: number; highDetail: boolean },
    onProgress?: (share: number) => void,
  ) =>
    new Promise<AiJob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const query = new URLSearchParams({ mode, durationSec: String(durationSec), highDetail: String(highDetail) });
      xhr.open('POST', `/api/trails/${id}/ai-route/upload?${query}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
      xhr.onload = () => {
        let data: (AiJob & { error?: string }) | null = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // Not JSON: explained below.
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data!);
        else reject(new Error(data?.error ?? `The upload failed (${xhr.status}).`));
      };
      xhr.onerror = () => reject(unreachable());
      xhr.send(file);
    }),
  getJob: (jobId: string) => request<AiJob>(`/jobs/${jobId}`),
  cancelJob: (jobId: string) => request<AiJob>(`/jobs/${jobId}/cancel`, { method: 'POST' }),
};
