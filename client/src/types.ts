// What the API sends and takes, as the browser sees it (JSON: dates are strings).

// A point on the map: [latitude, longitude], sometimes with a height in metres
// (the same shape Leaflet takes).
export type LatLng = [lat: number, lng: number, height?: number];

export type Activity = 'ride' | 'hike' | 'climb' | 'cycle' | 'other';
export type RouteStyle = 'roads' | 'paths' | 'straight';
export type StopKind = 'break' | 'overnight';
export type Evidence = 'sign' | 'milestone' | 'speech' | 'landmark';
export type HiddenReason = 'intro' | 'recap' | 'montage' | 'flashback' | 'off_route';

export interface User {
  _id: string;
  name?: string;
  username: string;
  email?: string;
  phone?: string;
  googleId?: string;
  emailVerified?: boolean;
  interests: string[];
  referralSource?: string;
  wishlist?: string;
  onboardedAt?: string;
  createdAt?: string;
}

// A place the creator marked in the video: "12:30 - Rohtang Pass viewpoint".
export interface KeyPoint {
  _id: string;
  name: string;
  note: string;
  time: number;
  lat: number;
  lng: number;
  stayUntil?: number | null;
  stopKind?: StopKind | null;
  origin: 'manual' | 'ai';
  confidence?: number;
  evidence?: Evidence;
  quote?: string;
}

// Where the trip starts or ends, as the owner confirmed it.
export interface TripEnd {
  name: string;
  label: string;
  lat: number;
  lng: number;
}

// A part of the video that isn't the ride (an intro, a recap, a drone montage).
export interface HiddenRange {
  start: number;
  end: number;
  reason?: HiddenReason;
}

export interface ElevationSummary {
  highestM: number;
  highestAlongM: number;
  ascentM: number;
  descentM: number;
}

// Heights along the route: d[i] metres from the start, e[i] the height there.
export interface ElevationProfile {
  d: number[];
  e: number[];
  source?: 'gpx' | 'ors' | 'dem';
  routeVersion?: number;
  summary?: ElevationSummary;
}

export interface FuelGap {
  fromM: number;
  toM: number;
  lengthM: number;
  afterName: string;
  beforeName: string;
}

export interface Night {
  alongM: number;
  name?: string | null;
}

// The trip stats under the title. A number that can't be known is left out.
export interface TripStats {
  routeVersion: number;
  approximate?: boolean;
  distanceM?: number;
  days?: number;
  daysSource?: 'owner' | 'gps' | 'stops';
  nights: Night[];
  highestM?: number;
  highestAlongM?: number;
  highestName?: string;
  ascentM?: number;
  descentM?: number;
  longestFuelGap?: FuelGap;
  updatedAt?: string;
}

export interface Trail {
  _id: string;
  // Only who owns it, so the page knows who may edit it.
  owner?: { _id: string } | null;
  title: string;
  description: string;
  activity: Activity;
  // 'story': a route from someone's own trip, with no video.
  kind: 'video' | 'story';
  youtubeId?: string;
  creatorName: string;
  channel?: { name?: string; url?: string } | null;
  videoTitle: string;
  startPlace?: TripEnd | null;
  endPlace?: TripEnd | null;
  supportUrl: string;
  track: LatLng[];
  trackTimes: number[];
  recordedAt?: string;
  videoStartsAt: number;
  routeSource?: 'gpx' | 'keypoints';
  routeVersion: number;
  elevationProfile?: ElevationProfile | null;
  stats?: TripStats | null;
  daysOverride?: number | null;
  routeStyle: RouteStyle;
  hiddenRanges: HiddenRange[];
  ai?: { job?: string; model?: string; promptVersion?: string; analyzedAt?: string };
  points: KeyPoint[];
  createdAt?: string;
  updatedAt?: string;
  // A message when drawing the route didn't go as asked.
  routeNotice?: string | null;
}

// What the home page's cards get: no route, description or key points.
export type TrailCard = Pick<Trail, '_id' | 'title' | 'kind' | 'activity' | 'youtubeId' | 'creatorName' | 'channel' | 'routeSource' | 'stats' | 'owner' | 'createdAt'> & {
  points?: Pick<KeyPoint, 'origin'>[];
};

// Another place with the same name the reviewer can pick instead.
export interface Alternative {
  name: string;
  label: string;
  lat: number;
  lng: number;
}

// A place the AI found, as the review list shows it.
export interface Candidate {
  id: string;
  time: number;
  stayUntil: number | null;
  stopKind: StopKind | null;
  name: string;
  region: string;
  altNames: string[];
  presence: 'here' | 'mentioned';
  evidence?: Evidence;
  quote: string;
  confidence: number;
  lat: number | null;
  lng: number | null;
  label: string;
  alternatives: Alternative[];
  flags: string[];
  checked: boolean;
  anchor?: 'start' | 'end';
}

export type JobState = 'queued' | 'running' | 'needs_review' | 'accepted' | 'done' | 'failed' | 'cancelled';
export type MediaMode = 'full' | 'picture' | 'sound';

// One AI analysis, as the server shows it (see jobView).
export interface AiJob {
  _id: string;
  trail: string;
  state: JobState;
  stage: string;
  progress: { done: number; total: number };
  error: string | null;
  retryAt: string | null;
  retryReason: string | null;
  videoTitle: string;
  trip: { start: TripEnd | null; end: TripEnd | null } | null;
  model?: string;
  modelsUsed: string[];
  highDetail: boolean;
  source: 'youtube' | 'upload' | 'transcript';
  watchingGaps: boolean;
  mediaMode: MediaMode;
  reused: boolean;
  costUsd: number;
  createdAt: string;
  result: { candidates: Candidate[]; hiddenRanges: HiddenRange[] } | null;
}

export type ServiceKind = 'fuel' | 'mechanic' | 'medical' | 'atm';

// A service near the route, from OpenStreetMap.
export interface ServiceItem {
  kind: ServiceKind;
  osm: string;
  name?: string;
  brand?: string;
  lat: number;
  lng: number;
  alongM: number;
  offM: number;
  hours?: string;
  emergency?: boolean;
  place?: string;
}

// The services along a route: still being found, found, or not to be had.
export type RouteServices =
  | { status: 'pending' }
  | { status: 'ready'; routeVersion: number; items: ServiceItem[]; fuelGaps: FuelGap[]; computedAt?: string }
  | { status: 'failed'; error?: string; retryAt?: string | null }
  | { status: 'unavailable'; reason?: string };

// What the server can do.
export interface ServerConfig {
  roadRouting: boolean;
  aiRoute: boolean;
  aiMaxUploadMb: number;
  routeServices: boolean;
  fuelGapWarnKm: number;
  googleClientId: string;
}

// A place found by name.
export interface FoundPlace {
  name: string;
  description: string;
  lat: number;
  lng: number;
  coarse: boolean;
}
