// Reads a GPX file (the standard GPS route format that Strava, Garmin, Komoot
// and most tracking apps export) in the browser.

import type { LatLng } from '../types.ts';

export const MAX_TRACK_POINTS = 20000; // the server accepts up to this many

const round = (value: number, places: number): number => Math.round(value * 10 ** places) / 10 ** places;

// Keeps `max` evenly spaced points, always including the first and last.
function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

// The elements with this name, whatever namespace the file uses (or none).
function elementsNamed(doc: Document, name: string): Element[] {
  const found = [...doc.getElementsByTagNameNS('*', name)];
  return found.length > 0 ? found : [...doc.getElementsByTagName(name)];
}

// A GPX file's route, ready to send with a trail.
export interface ParsedGpx {
  name: string;
  track: LatLng[];
  trackElevations: (number | null)[] | null;
  trackTimes: number[];
  recordedAt: string | null;
}

export function parseGpx(text: string, { maxPoints = MAX_TRACK_POINTS }: { maxPoints?: number } = {}): ParsedGpx {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error("This file isn't valid GPX. Try exporting it again.");
  }

  // Recorded tracks use <trkpt>; planned routes use <rtept>.
  let nodes = elementsNamed(doc, 'trkpt');
  if (nodes.length === 0) nodes = elementsNamed(doc, 'rtept');

  const points: { lat: number; lng: number; time: number; ele: number }[] = [];
  for (const node of nodes) {
    const lat = Number(node.getAttribute('lat'));
    const lng = Number(node.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const child = (name: string) => [...node.children].find((c) => c.localName === name)?.textContent;
    const time = child('time');
    const ele = child('ele');
    points.push({ lat, lng, time: time ? Date.parse(time) : NaN, ele: ele === undefined || ele.trim() === '' ? NaN : Number(ele) });
  }
  if (points.length < 2) throw new Error('No route found in this file. It needs at least two GPS points.');

  const kept = downsample(points, maxPoints);
  // The map can only follow the video if every point has a time, in order.
  const hasTimes = kept.every((p, i) => Number.isFinite(p.time) && (i === 0 || p.time >= kept[i - 1].time));
  const start = kept[0].time;

  // Heights for the elevation chart, one per point (null where the file has none).
  const hasHeights = kept.some((p) => Number.isFinite(p.ele));

  return {
    name: doc.querySelector('trk > name, metadata > name')?.textContent?.trim() ?? '',
    track: kept.map((p): LatLng => [round(p.lat, 6), round(p.lng, 6)]),
    trackElevations: hasHeights ? kept.map((p) => (Number.isFinite(p.ele) ? round(p.ele, 1) : null)) : null,
    trackTimes: hasTimes ? kept.map((p) => round((p.time - start) / 1000, 1)) : [],
    recordedAt: hasTimes ? new Date(start).toISOString() : null,
  };
}
