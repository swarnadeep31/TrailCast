// Draws the route between key points: along real roads or footpaths using
// OpenRouteService (free, needs ORS_API_KEY), or as straight lines. Routes
// along roads and footpaths come with heights: [lat, lng, height].

import type { LatLng, Track } from '../types.ts';

export type RouteStyle = 'roads' | 'paths' | 'straight';
type RoadStyle = Exclude<RouteStyle, 'straight'>;
// A place the route passes through, in order.
export interface RoutePoint {
  lat: number;
  lng: number;
  name?: string;
}

const PROFILES: Record<RoadStyle, string> = { roads: 'driving-car', paths: 'foot-hiking' };
const STYLE_NAMES: Record<RoadStyle, string> = { roads: 'roads', paths: 'footpaths' };
// Places per request. Longer routes are fetched in pieces.
const MAX_WAYPOINTS = 25;

export const orsUrl = () => process.env.ORS_BASE_URL || 'https://api.openrouteservice.org';
export const roadRoutingAvailable = () => Boolean(process.env.ORS_API_KEY);

const straightSegments = (points: RoutePoint[]): Track[] => points.slice(1).map((p, i) => [[points[i].lat, points[i].lng], [p.lat, p.lng]]);

// Returns { segments, notice }: one list of [lat, lng] (or [lat, lng, height])
// from each key point to the next, and a message for the user if the route
// had to fall back to straight lines.
export async function routeSegments(points: RoutePoint[], style: RouteStyle): Promise<{ segments: Track[]; notice: string | null }> {
  if (style === 'straight') return { segments: straightSegments(points), notice: null };
  if (!roadRoutingAvailable()) {
    return {
      segments: straightSegments(points),
      notice: `Following ${STYLE_NAMES[style]} needs an OpenRouteService key on the server (ORS_API_KEY in server/.env), so straight lines were drawn for now.`,
    };
  }
  try {
    const segments: Track[] = [];
    const offRoad: RoutePoint[] = [];
    for (let first = 0; first < points.length - 1; first += MAX_WAYPOINTS - 1) {
      const piece = await legsAroundOffRoad(points.slice(first, first + MAX_WAYPOINTS), PROFILES[style]);
      segments.push(...piece.segments);
      offRoad.push(...piece.offRoad);
    }
    const names = [...new Set(offRoad.map((p) => p.name).filter(Boolean))];
    const notice = offRoad.length
      ? `${names.length ? names.join(', ') : 'Some places'} ${offRoad.length === 1 ? "isn't" : "aren't"} near a road, so straight lines join ${offRoad.length === 1 ? 'it' : 'them'} to the route. The rest follows the ${STYLE_NAMES[style]}.`
      : null;
    return { segments, notice };
  } catch (err) {
    return {
      segments: straightSegments(points),
      notice: `Couldn't follow the ${STYLE_NAMES[style]} (${err instanceof Error ? err.message : String(err)}), so straight lines were drawn instead.`,
    };
  }
}

// OpenRouteService refuses a whole route when one place is more than 350 m
// from any road (a summit, a lake, a viewpoint in the forest), and says which
// one: "...of specified coordinate 3: ...". That place is left out and the
// rest asked again, so the route still follows the roads everywhere else;
// straight lines join the places off the road. Returns { segments, offRoad }.
async function legsAroundOffRoad(points: RoutePoint[], profile: string): Promise<{ segments: Track[]; offRoad: RoutePoint[] }> {
  const skipped = new Set<number>();
  for (;;) {
    const routable = points.map((_, i) => i).filter((i) => !skipped.has(i));
    if (routable.length < 2) return { segments: straightSegments(points), offRoad: [...skipped].map((i) => points[i]) };
    let roadLegs: Track[];
    try {
      roadLegs = await fetchSegments(routable.map((i) => points[i]), profile);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const offRoad = /routable point/i.test(message) && message.match(/coordinate (\d+)/);
      if (!offRoad || routable[Number(offRoad[1])] === undefined) throw err;
      skipped.add(routable[Number(offRoad[1])]);
      continue;
    }
    // A road between neighbouring places that are both on a road; a straight line to and from the others.
    const roadFrom = new Map(routable.slice(0, -1).map((from, k) => [from, { to: routable[k + 1], leg: roadLegs[k] }]));
    const segments: Track[] = points.slice(1).map((next, i) => {
      const road = roadFrom.get(i);
      return road?.to === i + 1 ? road.leg : [[points[i].lat, points[i].lng], [next.lat, next.lng]];
    });
    return { segments, offRoad: [...skipped].map((i) => points[i]) };
  }
}

// What OpenRouteService's directions answer (GeoJSON).
interface DirectionsAnswer {
  error?: { message?: string };
  features?: {
    geometry?: { coordinates?: number[][] };
    properties?: { way_points?: number[]; segments?: DirectionsLeg[] };
  }[];
}
interface DirectionsLeg {
  steps?: { way_points?: number[] }[];
}

async function fetchSegments(points: RoutePoint[], profile: string): Promise<Track[]> {
  let res;
  try {
    res = await fetch(`${orsUrl()}/v2/directions/${profile}/geojson`, {
      method: 'POST',
      headers: { Authorization: process.env.ORS_API_KEY ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates: points.map((p) => [p.lng, p.lat]), // OpenRouteService wants longitude first
        radiuses: points.map(() => -1), // snap each place to the nearest road, however far
        elevation: true, // heights for the elevation chart, at no extra cost
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("couldn't reach OpenRouteService");
  }
  const data = (await res.json().catch(() => null)) as DirectionsAnswer | null;
  if (!res.ok) throw new Error(data?.error?.message ?? `OpenRouteService answered ${res.status}`);

  const route = data?.features?.[0];
  const coordinates = route?.geometry?.coordinates;
  // Where each place we sent is on the returned line.
  const wayPoints = route?.properties?.way_points ?? wayPointsFromSegments(route?.properties?.segments);
  if (!Array.isArray(coordinates) || !wayPoints || wayPoints.length !== points.length) {
    throw new Error('OpenRouteService sent an unexpected answer');
  }

  // [lng, lat] or [lng, lat, height] -> [lat, lng] or [lat, lng, height]
  const line: Track = coordinates.map(([lng, lat, height]) => (Number.isFinite(height) ? [lat, lng, height] : [lat, lng]));
  // Start and end each piece exactly at the key points, so the line touches
  // the pins. A key point takes the height of the road where it was snapped.
  const at = (point: RoutePoint, linePoint: LatLng | undefined): LatLng => (linePoint && linePoint.length > 2 ? [point.lat, point.lng, linePoint[2]] : [point.lat, point.lng]);
  return points.slice(1).map((p, i) => [
    at(points[i], line[wayPoints[i]]),
    ...line.slice(wayPoints[i], wayPoints[i + 1] + 1),
    at(p, line[wayPoints[i + 1]]),
  ]);
}

// Older answers only give way points per step: each leg runs from its first
// step's start to its last step's end.
function wayPointsFromSegments(legs: DirectionsLeg[] | undefined): number[] | null {
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const ends = legs.map((leg) => leg.steps?.at(-1)?.way_points?.[1] ?? NaN);
  return [legs[0].steps?.[0]?.way_points?.[0] ?? 0, ...ends];
}
