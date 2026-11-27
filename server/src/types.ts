// Shapes shared across the server.

// A point on the map: [latitude, longitude], sometimes with a height in
// metres as a third number. Stored in MongoDB as plain arrays of numbers.
export type LatLng = number[];

// A route: its points in order.
export type Track = LatLng[];

// A stretch of video, in seconds from its start.
export interface TimeRange {
  start: number;
  end: number;
}

// A place on a route at a moment of the video (a key point, or an AI place).
export interface TimedPlace {
  time: number;
  stayUntil?: number | null;
  lat: number;
  lng: number;
  name?: string;
}

// A position along a route found by projectOnTrack.
export interface TrackProjection {
  index: number;
  fraction: number;
  alongM: number;
  offM: number;
  point: LatLng;
}

// An area on the map, as its edges in degrees.
export interface Box {
  south: number;
  west: number;
  north: number;
  east: number;
}

// A place found by name (services/places.ts). coarse: a whole state, region
// or country rather than a spot.
export interface FoundPlace {
  name: string;
  description: string;
  lat: number;
  lng: number;
  coarse: boolean;
}

// Where to look for a place: near a spot (ranked first), or only inside a box.
export interface PlaceSearchOptions {
  near?: LatLng | null;
  within?: Box | null;
}
