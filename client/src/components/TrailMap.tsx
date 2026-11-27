import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { useReducedMotion } from '../hooks/useReducedMotion.ts';
import { SERVICE_KINDS, serviceName } from '../lib/services.ts';
import { useTheme } from '../lib/theme.ts';
import { formatTime } from '../lib/time.ts';
import { boundsOf, cumulativeDistances, indexAtOrBefore, positionAt, videoTimeAtLocation, type MeasuredRoute, type Projection, type SeekTo, type VideoMoment } from '../lib/track.ts';
import type { VideoClock } from '../hooks/useYouTubePlayer.ts';
import type { Candidate, HiddenRange, KeyPoint, LatLng, ServiceItem, ServiceKind } from '../types.ts';

export interface Inks {
  road: string;
  ink: string;
  water: string;
  soft: string;
}

// What dragging along the route needs from the video.
interface Scrub {
  onSeek: SeekTo;
  isPlaying: () => boolean;
  pause: () => void;
  getDuration: () => number;
}

// A route with its distances and times (see MeasuredRoute), all of them known.
type TimedRoute = MeasuredRoute & { trackTimes: number[]; videoStartsAt: number; hiddenRanges: HiddenRange[] };

// Where a click or drag along the route lands.
type Hit = Projection & VideoMoment;

// An AI place on the map while it's reviewed.
type PreviewPlace = Pick<Candidate, 'id' | 'name' | 'lat' | 'lng' | 'checked' | 'flags'>;
import Icon from './art/Icon.tsx';
import RouteReveal from './RouteReveal.tsx';

// The sheet's inks for the map: the route in road red, the rider and the AI's
// places in water blue. Read from the page's colours, which change at night.
function readInks(): Inks {
  const css = getComputedStyle(document.documentElement);
  const ink = (name: string, fallback: string) => css.getPropertyValue(`--color-${name}`).trim() || fallback;
  return { road: ink('road', '#c8261c'), ink: ink('ink', '#1b1d19'), water: ink('water', '#1d5c9c'), soft: ink('ink-soft', '#4a5047') };
}

// While dragging the marker, look for the road only this many route points
// either side of where it was, so it follows the road under the finger when a
// road is ridden twice (out and back). Further than FULL_SEARCH_M from that
// road, search the whole route.
const DRAG_WINDOW = 300;
const FULL_SEARCH_M = 200;
// Show the video frame under the marker at most this often while dragging.
const PREVIEW_MS = 250;
// The bold line's long part is redrawn at most this often, or when the tip
// to the marker would be longer than this many route points.
const LINE_MS = 500;
const TIP_MAX_POINTS = 200;

// Fuel always shows; mechanics, medical help and ATMs only from this zoom, so towns don't drown in ATMs.
const SERVICES_MIN_ZOOM = 11;

const serviceIcons = Object.fromEntries(
  Object.entries(SERVICE_KINDS).map(([kind, { symbol, colour, ink }]) => [
    kind,
    L.divIcon({
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      html: `<div class="service-icon" style="background:${colour};color:${ink}">${symbol}</div>`,
    }),
  ]),
);

const escapeHtml = (text: unknown): string => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Fuel stations, mechanics, medical help and ATMs near the route, with the
// longest stretch without fuel outlined. Drawn straight onto the map (there
// can be hundreds), only the kinds switched on in the services panel.
function ServicesLayer({ items, visibleKinds, gapLine }: { items: ServiceItem[]; visibleKinds: Set<ServiceKind>; gapLine?: LatLng[] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map.getPane('fuelGap')) map.createPane('fuelGap').style.zIndex = '390'; // just under the route
    const outline = gapLine && gapLine.length > 1 ? L.polyline(gapLine, { pane: 'fuelGap', className: 'fuel-gap-outline', weight: 12, opacity: 0.5, dashArray: '2 10', lineCap: 'round', interactive: false }) : null;
    outline?.addTo(map);
    return () => {
      outline?.remove();
    };
  }, [map, gapLine]);

  useEffect(() => {
    const always = L.layerGroup();
    const closeUp = L.layerGroup();
    for (const item of items) {
      if (!visibleKinds.has(item.kind)) continue;
      const lines = [`<strong>${escapeHtml(serviceName(item))}</strong>`];
      if (item.brand && item.name) lines.push(escapeHtml(item.brand));
      if (item.hours) lines.push(`Open: ${escapeHtml(item.hours)}`);
      const marker = L.marker([item.lat, item.lng], { icon: serviceIcons[item.kind], keyboard: false, title: serviceName(item) }).bindTooltip(lines.join('<br>'), {
        direction: 'top',
        offset: [0, -10],
      });
      (item.kind === 'fuel' ? always : closeUp).addLayer(marker);
    }
    always.addTo(map);
    const showCloseUp = () => {
      if (map.getZoom() >= SERVICES_MIN_ZOOM) closeUp.addTo(map);
      else closeUp.remove();
    };
    showCloseUp();
    map.on('zoomend', showCloseUp);
    return () => {
      map.off('zoomend', showCloseUp);
      always.remove();
      closeUp.remove();
    };
  }, [map, items, visibleKinds]);
  return null;
}

const riderIcon = L.divIcon({ className: 'rider-marker', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="rider-dot"></div>' });

// The time bubble on the marker while it's dragged.
function bubbleText(hit: VideoMoment): string {
  if (hit.outside === 'before') return '0:00 · the video starts later';
  if (hit.outside === 'after') return `${formatTime(hit.time)} · the video ends here`;
  return formatTime(hit.time);
}

function describeMoment(hit: VideoMoment): string {
  if (hit.outside === 'before') return 'The video starts later. Click to jump to its start';
  if (hit.outside === 'after') return 'The video ends before here. Click to jump to its end';
  return `Jump to ${formatTime(hit.time)}`;
}

// An invisible, wide line over the route that turns a click into a seek, and
// shows which moment of the video it is. Wide enough for a finger.
function ScrubLine({ route, scrub }: { route: TimedRoute; scrub: Scrub }) {
  const map = useMap();
  const scrubRef = useRef(scrub);
  scrubRef.current = scrub;

  useEffect(() => {
    const playable = route.trackTimes.length > 0 && route.trackTimes.length === route.track.length;
    const line = L.polyline(route.track, { weight: 20, opacity: 0, className: 'scrub-line', bubblingMouseEvents: false }).addTo(map);
    if (!playable) {
      line.bindTooltip("This route has no times, so it can't move the video.", { sticky: true });
      return () => {
        line.remove();
      };
    }
    const hitAt = (latlng: L.LatLng) => videoTimeAtLocation(route, [latlng.lat, latlng.lng], { duration: scrubRef.current.getDuration() })!;
    line.bindTooltip('', { sticky: true, direction: 'top', offset: [0, -10] });
    line.on('mousemove', (event) => line.setTooltipContent(describeMoment(hitAt(event.latlng))));
    line.on('click', (event) => {
      const hit = hitAt(event.latlng);
      scrubRef.current.onSeek(hit.time, { final: true, play: true });
    });
    return () => {
      line.remove();
    };
  }, [map, route]);
  return null;
}

// Numbered pins matching the key point list. Cached so markers don't
// rebuild their icon on every render.
const iconCache = new Map<string, L.DivIcon>();
function numberIcon(number: number, active: boolean): L.DivIcon {
  const key = `${number}:${active}`;
  if (!iconCache.has(key)) {
    iconCache.set(
      key,
      L.divIcon({
        className: '',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        html: `<div class="map-point" data-active="${active}">${number}</div>`,
      }),
    );
  }
  return iconCache.get(key)!;
}

// Zooms to the whole trail once when it first has something to show.
function FitToTrail({ trailId, locations }: { trailId: string; locations: LatLng[] }) {
  const map = useMap();
  const hasLocations = locations.length > 0;
  useEffect(() => {
    const bounds = boundsOf(locations);
    if (bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    // Only refit for a new trail, not every time a point is added.
  }, [map, trailId, hasLocations]);
  return null;
}

// Zooms to the AI's ticked places when their review opens (unticked ones are
// often far away: "one day we'll ride to Leh").
function FitToPreview({ places }: { places: PreviewPlace[] }) {
  const map = useMap();
  const showing = places.length > 0;
  useEffect(() => {
    const located = places.filter((p) => p.lat !== null);
    const ticked = located.filter((p) => p.checked);
    const bounds = boundsOf((ticked.length > 1 ? ticked : located).map((p): LatLng => [p.lat!, p.lng!]));
    if (showing && bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    // Only when the review opens, not on every tick or change.
  }, [map, showing]);
  return null;
}

// Pans to a key point when one is picked from the list.
function PanTo({ focus }: { focus?: { location: LatLng } | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.setView(focus.location, Math.max(map.getZoom(), 13));
  }, [map, focus]);
  return null;
}

// The cab-app view: a marker gliding along the route with the video, and the
// part already covered drawn bold. It's updated straight on the map about 60
// times a second, outside React, so the rest of the page doesn't redraw.
// With `scrub`, the marker can be dragged along the route to move the video:
// the video pauses and shows the frame under the marker, then carries on from
// there (playing again only if it was playing). With the marker focused, the
// arrow keys move 10 s, or 60 s with Shift.
// On a drawn route (approximate), the marker waits at the start before the
// ride sets off and at the end after it arrives.
// The bold line is two lines: the long part up to a recent route point,
// redrawn at most twice a second, and the short tip from there to the
// marker, redrawn every frame. Redrawing thousands of points 60 times a
// second is what made the marker stutter on long routes.
function RiderLayer({
  route,
  clock,
  follow,
  approximate,
  scrub,
  inks,
}: {
  route: TimedRoute;
  clock: VideoClock;
  follow: boolean;
  approximate: boolean;
  scrub: Scrub | null;
  inks: Inks;
}) {
  const { track, trackTimes, videoStartsAt, hiddenRanges } = route;
  const map = useMap();
  const followRef = useRef(follow);
  followRef.current = follow;
  const scrubRef = useRef(scrub);
  scrubRef.current = scrub;
  const canScrub = Boolean(scrub);

  useEffect(() => {
    if (!trackTimes?.length || trackTimes.length !== track.length) return undefined;
    // Its own layer, so the marker is drawn above the key point pins (600) and below tooltips (650).
    if (!map.getPane('rider')) map.createPane('rider').style.zIndex = '640';
    const lineStyle: L.PolylineOptions = { color: inks.road, weight: 6, opacity: 1, dashArray: approximate ? '10 8' : undefined, interactive: false, className: 'route-base' };
    const travelled = L.polyline([], lineStyle).addTo(map);
    const tip = L.polyline([], lineStyle).addTo(map);
    // The route point the long part ends at, and when it was last redrawn.
    let shownIndex = -1;
    let lineAt = 0;
    const drawTravelled = (index: number, point: LatLng | null, now: number) => {
      if (index < 0) {
        if (shownIndex !== -1) travelled.setLatLngs([]);
        shownIndex = -1;
        tip.setLatLngs([]);
        return;
      }
      if (shownIndex < 0 || index < shownIndex || index - shownIndex > TIP_MAX_POINTS || now - lineAt > LINE_MS) {
        travelled.setLatLngs(track.slice(0, index + 1));
        shownIndex = index;
        lineAt = now;
      }
      const piece = track.slice(shownIndex, index + 1);
      tip.setLatLngs(point ? [...piece, point] : piece);
    };
    const restingTooltip = canScrub ? 'Here now in the video. Drag me along the route to scrub.' : 'Here now in the video';
    const marker = L.marker([0, 0], { pane: 'rider', icon: riderIcon, draggable: canScrub, keyboard: canScrub, autoPan: false })
      .bindTooltip(restingTooltip, { direction: 'top', offset: [0, -12] });

    // Scrubbing: while the marker is held, the animation below leaves it alone.
    let scrubbing = false;
    let wasPlaying = false;
    let lastHit: Hit | null = null;
    let lastPreviewAt = 0;
    const duration = () => scrubRef.current?.getDuration() ?? 0;
    const hitNear = (latlng: L.LatLng): Hit => {
      const location: LatLng = [latlng.lat, latlng.lng];
      const around = lastHit?.index ?? indexAtOrBefore(trackTimes, clock.now() + videoStartsAt);
      const window = { from: Math.max(0, around - DRAG_WINDOW), to: around + DRAG_WINDOW };
      const near = videoTimeAtLocation(route, location, { window, duration: duration() })!;
      return near.offM <= FULL_SEARCH_M ? near : videoTimeAtLocation(route, location, { duration: duration() })!;
    };
    marker.on('dragstart', () => {
      scrubbing = true;
      lastHit = null;
      wasPlaying = scrubRef.current!.isPlaying();
      scrubRef.current!.pause();
      marker.setTooltipContent(formatTime(clock.now())).openTooltip();
    });
    marker.on('drag', (event: L.LeafletEvent) => {
      const hit = hitNear((event as L.LeafletMouseEvent).latlng);
      lastHit = hit;
      // Keep the marker on the road, and the bold line up to it.
      marker.setLatLng(hit.point);
      drawTravelled(hit.index, hit.point, performance.now());
      marker.setTooltipContent(bubbleText(hit));
      if (performance.now() - lastPreviewAt > PREVIEW_MS) {
        lastPreviewAt = performance.now();
        scrubRef.current!.onSeek(hit.time, { final: false });
      }
    });
    marker.on('dragend', () => {
      if (lastHit) scrubRef.current!.onSeek(lastHit.time, { final: true, play: wasPlaying });
      marker.setTooltipContent(restingTooltip);
      scrubbing = false;
      lastTime = null;
    });
    const onKey = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !scrubRef.current) return;
      // Don't let the map pan as well.
      event.preventDefault();
      event.stopPropagation();
      const step = (event.shiftKey ? 60 : 10) * (event.key === 'ArrowLeft' ? -1 : 1);
      const end = duration() || Infinity;
      const time = Math.min(Math.max(clock.now() + step, 0), end);
      scrubRef.current.onSeek(time, { final: true, play: scrubRef.current.isPlaying() });
    };

    let frame = 0;
    let lastTime: number | null = null;
    let lastFollow = followRef.current;
    let lastPanAt = 0;
    // After a zoom, look again even while paused (the marker may now be off screen).
    const recheck = () => {
      lastTime = null;
    };
    map.on('zoomend', recheck);
    const draw = (now: number) => {
      const t = clock.now();
      if (!scrubbing && (t !== lastTime || followRef.current !== lastFollow)) {
        lastFollow = followRef.current;
        const position = positionAt(track, trackTimes, videoStartsAt, t, hiddenRanges, { hold: approximate });
        let panLater = false;
        if (position) {
          if (!map.hasLayer(marker)) {
            marker.addTo(map);
            const element = marker.getElement()!;
            element.setAttribute('aria-label', canScrub ? "The rider's place in the video. Drag it, or use the arrow keys, to move through the ride." : "The rider's place in the video");
            element.addEventListener('keydown', onKey);
          }
          marker.setLatLng(position);
          // Keep the marker on screen, panning at most every 0.4 s.
          if (followRef.current && !map.getBounds().pad(-0.15).contains(position)) {
            if (now - lastPanAt > 400) {
              map.panTo(position);
              lastPanAt = now;
            } else {
              panLater = true;
            }
          }
        } else if (map.hasLayer(marker)) {
          marker.remove();
        }
        // The bold part up to the marker (all of it once the route is done).
        drawTravelled(indexAtOrBefore(trackTimes, t + videoStartsAt), position, now);
        lastTime = panLater ? null : t;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      map.off('zoomend', recheck);
      marker.getElement()?.removeEventListener('keydown', onKey);
      travelled.remove();
      tip.remove();
      marker.remove();
    };
  }, [map, route, track, trackTimes, videoStartsAt, hiddenRanges, clock, approximate, canScrub, inks.road]);
  return null;
}

// The AI's places while they're being reviewed: blue dots joined in order
// (unticked ones grey, suspicious ones red). Drawn in the browser, at no cost.
function AiPreview({ places, inks }: { places: PreviewPlace[]; inks: Inks }) {
  const located = places.filter((p): p is PreviewPlace & { lat: number; lng: number } => p.lat !== null && p.lat !== undefined && p.lng !== null);
  const ticked = located.filter((p) => p.checked);
  return (
    <>
      {ticked.length > 1 && (
        <Polyline positions={ticked.map((p): LatLng => [p.lat, p.lng])} pathOptions={{ color: inks.water, weight: 3, dashArray: '2 8', opacity: 0.9 }} />
      )}
      {located.map((p) => {
        const colour = !p.checked ? inks.soft : p.flags?.includes('detour') ? inks.road : inks.water;
        return (
          <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={6} pathOptions={{ color: '#ffffff', weight: 2, fillColor: colour, fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -6]}>
              {p.name}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

function MapEvents({ onMapClick, onUserMove }: { onMapClick?: ((location: LatLng) => void) | null; onUserMove?: () => void }) {
  useMapEvents({
    click: (event) => onMapClick?.([event.latlng.lat, event.latlng.lng]),
    dragstart: () => onUserMove?.(),
  });
  return null;
}

export default function TrailMap({
  trailId,
  track,
  trackTimes,
  videoStartsAt = 0,
  hiddenRanges,
  clock,
  approximate,
  points,
  activePointId,
  pendingLocation,
  preview = [],
  hiddenNote,
  focus,
  follow = false,
  onFollowChange,
  onPointClick,
  onMapClick,
  onSeek,
  isPlaying,
  pause,
  getDuration,
  ghost,
  services = [],
  serviceKinds,
  fuelGapLine,
  // reveal: a number; each new one plays the route reveal (see RouteReveal).
  // onReplay: shows a "Play the route" button that asks for it.
  reveal = 0,
  onReplay,
}: {
  trailId: string;
  track: LatLng[];
  trackTimes?: number[];
  videoStartsAt?: number;
  hiddenRanges?: HiddenRange[];
  clock?: VideoClock | null;
  approximate: boolean;
  points: KeyPoint[];
  activePointId?: string | null;
  pendingLocation?: LatLng | null;
  preview?: PreviewPlace[];
  hiddenNote?: string | null;
  focus?: { location: LatLng } | null;
  follow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  onPointClick?: (point: KeyPoint) => void;
  onMapClick?: ((location: LatLng) => void) | null;
  onSeek?: SeekTo;
  isPlaying?: () => boolean;
  pause?: () => void;
  getDuration?: () => number;
  ghost?: LatLng | null;
  services?: ServiceItem[];
  serviceKinds?: Set<ServiceKind>;
  fuelGapLine?: LatLng[] | null;
  reveal?: number;
  onReplay?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    if (reveal > 0) setRevealing(true);
  }, [reveal]);
  const playable = Boolean(trackTimes && trackTimes.length > 0 && trackTimes.length === track.length);
  const theme = useTheme();
  const inks = useMemo(readInks, [theme]);
  // Everything the route maths needs, worked out once per route.
  const route = useMemo(
    (): TimedRoute => ({ track, trackTimes: trackTimes ?? [], videoStartsAt, hiddenRanges: hiddenRanges ?? [], cum: cumulativeDistances(track) }),
    [track, trackTimes, videoStartsAt, hiddenRanges],
  );
  // Clicking or dragging along the route moves the video, except while the
  // map is being used to place a key point or line up the route.
  const scrub: Scrub | null =
    onSeek && !onMapClick ? { onSeek, isPlaying: isPlaying ?? (() => false), pause: pause ?? (() => {}), getDuration: getDuration ?? (() => 0) } : null;
  const locations: LatLng[] = [
    ...track,
    ...points.map((p): LatLng => [p.lat, p.lng]),
    ...preview.filter((p) => p.lat !== null && p.lng !== null).map((p): LatLng => [p.lat!, p.lng!]),
  ];

  return (
    <div className={`relative h-full w-full ${onMapClick ? '[&_.leaflet-container]:cursor-crosshair' : ''}`}>
      <MapContainer center={[20, 0]} zoom={2} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {track.length > 1 && (
          <>
            {/* A road on a sheet: red, edged in ink. */}
            <Polyline positions={track} pathOptions={{ color: inks.ink, weight: 8, opacity: playable ? 0.3 : 0.5, interactive: false, className: 'route-base' }} />
            <Polyline
              positions={track}
              // Faded when the video can play along it (the covered part is drawn bold on top).
              // Dashed for routes drawn between key points: they're approximate.
              pathOptions={{
                color: inks.road,
                weight: 5,
                opacity: playable ? 0.6 : 0.95,
                dashArray: approximate ? '10 8' : undefined,
                interactive: false,
                className: 'route-base',
              }}
            />
          </>
        )}
        {track.length > 1 && scrub && <ScrubLine route={route} scrub={scrub} />}
        {points.map((point, i) => (
          <Marker
            key={point._id}
            position={[point.lat, point.lng]}
            icon={numberIcon(i + 1, point._id === activePointId)}
            eventHandlers={{
              // While choosing a location, a pin counts as a click on its spot.
              click: () => (onMapClick ? onMapClick([point.lat, point.lng]) : onPointClick?.(point)),
            }}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              {point.name}
            </Tooltip>
          </Marker>
        ))}
        {pendingLocation && (
          <CircleMarker center={pendingLocation} radius={9} pathOptions={{ color: inks.road, weight: 3, dashArray: '4 4', fillOpacity: 0.2 }} />
        )}
        {/* While the AI's places are reviewed, the service icons step aside, so the two don't mix. */}
        {preview.length === 0 && (services.length > 0 || fuelGapLine) && <ServicesLayer items={services} visibleKinds={serviceKinds ?? new Set()} gapLine={fuelGapLine} />}
        <AiPreview places={preview} inks={inks} />
        {/* The spot under the pointer on the elevation chart. */}
        {ghost && (
          <CircleMarker center={ghost} radius={8} interactive={false} pathOptions={{ color: inks.water, weight: 3, fill: false, dashArray: '3 3' }} />
        )}
        {playable && clock && <RiderLayer route={route} clock={clock} follow={follow} approximate={approximate} scrub={scrub} inks={inks} />}
        <FitToTrail trailId={trailId} locations={locations} />
        <FitToPreview places={preview} />
        <PanTo focus={focus} />
        <MapEvents onMapClick={onMapClick} onUserMove={() => onFollowChange?.(false)} />
        <RouteReveal play={reveal} track={track} points={points} inks={inks} reducedMotion={reducedMotion} onDone={() => setRevealing(false)} />
      </MapContainer>

      {onReplay && track.length > 1 && !revealing && (
        <button type="button" onClick={onReplay} className="btn-secondary btn-small absolute top-3 right-3 z-[1000] bg-paper">
          <Icon name="play" className="h-4 w-4" />
          Play the route
        </button>
      )}

      {hiddenNote && !revealing && (
        <p className="absolute top-3 left-14 z-[1000] rounded-[3px] bg-paper/95 px-3 py-1.5 text-small font-medium ring-1 ring-ink/20">{hiddenNote}</p>
      )}
      {playable && !follow && !revealing && (
        <button
          type="button"
          onClick={() => onFollowChange?.(true)}
          className="btn-secondary btn-small absolute right-3 bottom-6 z-[1000]"
        >
          Follow the video
        </button>
      )}
    </div>
  );
}
