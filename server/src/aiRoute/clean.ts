// Checks and tidies Gemini's answers: drops anything malformed, turns times
// into whole-video seconds, merges the overlapping clips, and turns repeated
// mentions of the same place into one stop.
import { parseClock } from '../utils/time.ts';
import type { Candidate, CleanedClip, CleanPlace, ClipSpan, Evidence, HiddenRange, HiddenReason, Presence, StopKind } from './types.ts';
import type { TimeRange } from '../types.ts';

const PRESENCES: readonly string[] = ['here', 'mentioned'];
const EVIDENCE: readonly string[] = ['sign', 'milestone', 'speech', 'landmark'];
const HIDDEN_REASONS: readonly string[] = ['intro', 'recap', 'montage', 'flashback', 'off_route'];
const STAY_KINDS: readonly string[] = ['break', 'overnight'];
const SAME_PLACE_WINDOW = 120; // seconds: the same name this close in two clips is one place
export const MAX_CANDIDATES = 150;

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
export const sameName = (a: string, b: string): boolean => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

// A time Gemini wrote, in seconds. Gemini sometimes adds ":00" to a minutes
// and seconds time ("24:29:00" for 24:29), which reads as 24 hours: a time
// that would be past the end of the video, but fits as minutes and seconds,
// is read that way.
function readTime(value: unknown, duration: number): number | null {
  const t = parseClock(value);
  const parts = typeof value === 'string' ? value.trim().split(':') : [];
  if (t === null || t <= duration + 5 || parts.length !== 3) return t;
  const asMinutes = Number(parts[0]) * 60 + Number(parts[1]);
  return asMinutes <= duration + 5 ? asMinutes : t;
}

// Gemini may count times from the start of the clip or of the whole video.
// If every time fits inside the clip's length, treat them as clip times.
function clipOffset(times: number[], clip: ClipSpan): number {
  if (clip.start === 0 || times.length === 0) return 0;
  return times.every((t) => t <= clip.end - clip.start + 5) ? clip.start : 0;
}

// One clip's answer -> { places, hiddenRanges, startTime, endTime } in
// whole-video seconds (startTime/endTime: when the trip sets off and arrives,
// or null when this clip doesn't show it).
// relative: the clip was sent as its own file, so its times surely count from the clip's start.
// Gemini's answer as it came: nothing in it can be trusted yet.
type RawPlace = Record<string, unknown> | null | undefined;
interface RawAnswer {
  places?: unknown;
  hidden_ranges?: unknown;
  start_time?: unknown;
  end_time?: unknown;
}

export function cleanClip(answer: unknown, clip: ClipSpan, duration: number, { relative = false }: { relative?: boolean } = {}): CleanedClip {
  const raw = (answer ?? {}) as RawAnswer;
  const rawPlaces: RawPlace[] = Array.isArray(raw.places) ? raw.places : [];
  const rawHidden: RawPlace[] = Array.isArray(raw.hidden_ranges) ? raw.hidden_ranges : [];
  const allTimes = [
    raw.start_time,
    raw.end_time,
    ...rawPlaces.map((p) => p?.time),
    ...rawHidden.flatMap((r) => [r?.start, r?.end]),
  ]
    .map((value) => readTime(value, duration))
    .filter((t): t is number => t !== null);
  const offset = relative ? clip.start : clipOffset(allTimes, clip);
  const toVideoTime = (value: unknown): number | null => {
    const t = readTime(value, duration);
    return t === null ? null : Math.min(Math.max(t + offset, 0), duration);
  };

  const places: CleanPlace[] = [];
  for (const p of rawPlaces) {
    const time = toVideoTime(p?.time);
    const name = text(p?.name, 100);
    if (time === null || !name) continue;
    const stayUntil = toVideoTime(p?.stay_until);
    const confidence = Number(p?.confidence);
    places.push({
      time,
      stayUntil: stayUntil !== null && stayUntil > time ? stayUntil : null,
      // A night's stay counts towards the trip's riding days.
      stopKind: STAY_KINDS.includes(p?.stay_kind as string) ? (p!.stay_kind as StopKind) : null,
      name,
      region: text(p?.region, 100),
      altNames: (Array.isArray(p?.alt_names) ? (p.alt_names as unknown[]) : []).map((n) => text(n, 100)).filter(Boolean).slice(0, 5),
      presence: PRESENCES.includes(p?.presence as string) ? (p!.presence as Presence) : 'mentioned',
      evidence: EVIDENCE.includes(p?.evidence as string) ? (p!.evidence as Evidence) : 'speech',
      quote: text(p?.quote, 200),
      confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0.3,
    });
  }

  const hiddenRanges: HiddenRange[] = [];
  for (const r of rawHidden) {
    const start = toVideoTime(r?.start);
    const end = toVideoTime(r?.end);
    if (start === null || end === null || end <= start) continue;
    hiddenRanges.push({ start, end, reason: HIDDEN_REASONS.includes(r?.reason as string) ? (r!.reason as HiddenReason) : 'off_route' });
  }
  return { places, hiddenRanges, startTime: toVideoTime(raw.start_time), endTime: toVideoTime(raw.end_time) };
}

export function mergeHiddenRanges<T extends TimeRange>(ranges: T[]): T[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: T[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

// All clips -> the candidate list the reviewer sees, the parts to skip, and
// when the trip sets off (the earliest any clip saw) and arrives (the latest).
// Every clip's places as one review list, with the parts to skip and when the trip sets off and arrives.
export interface MergedClips {
  candidates: Candidate[];
  hiddenRanges: HiddenRange[];
  startTime: number | null;
  endTime: number | null;
}

export function mergeClips(cleanedClips: CleanedClip[], { minConfidence }: { minConfidence: number }): MergedClips {
  const all = cleanedClips
    .flatMap((c, clip) => c.places.map((place) => ({ ...place, clip })))
    .sort((a, b) => a.time - b.time);

  // The same place found by two overlapping clips: keep the more confident one.
  // (Repeats within one clip are a stop, handled next.)
  const unique: (CleanPlace & { clip: number })[] = [];
  for (const place of all) {
    const twin = unique.find(
      (u) => u.clip !== place.clip && sameName(u.name, place.name) && Math.abs(u.time - place.time) <= SAME_PLACE_WINDOW,
    );
    if (!twin) unique.push(place);
    else if (place.confidence > twin.confidence) Object.assign(twin, place, { time: Math.min(twin.time, place.time) });
  }

  // The same place mentioned again and again in a row: one place, staying until the last mention.
  const collapsed: (CleanPlace & { clip: number })[] = [];
  for (const place of unique) {
    const last = collapsed.at(-1);
    if (last && sameName(last.name, place.name) && last.presence === 'here' && place.presence === 'here') {
      last.stayUntil = Math.max(last.stayUntil ?? last.time, place.stayUntil ?? place.time);
      last.confidence = Math.max(last.confidence, place.confidence);
      // A night's stay wins over a break.
      if (place.stopKind === 'overnight') last.stopKind = 'overnight';
      else last.stopKind ??= place.stopKind;
      continue;
    }
    collapsed.push({ ...place });
  }

  const candidates = collapsed.slice(0, MAX_CANDIDATES).map(({ clip, ...place }, i): Candidate => ({
    id: String(i + 1),
    ...place,
    lat: null,
    lng: null,
    label: '',
    alternatives: [],
    flags: place.confidence < minConfidence ? ['low_confidence'] : [],
    // Ticked in review only when the AI is fairly sure the traveller is there.
    checked: place.presence === 'here' && place.confidence >= minConfidence,
  }));

  const starts = cleanedClips.map((c) => c.startTime).filter((t): t is number => t !== null && Number.isFinite(t));
  const ends = cleanedClips.map((c) => c.endTime).filter((t): t is number => t !== null && Number.isFinite(t));
  return {
    candidates,
    hiddenRanges: mergeHiddenRanges(cleanedClips.flatMap((c) => c.hiddenRanges)),
    startTime: starts.length ? Math.min(...starts) : null,
    endTime: ends.length ? Math.max(...ends) : null,
  };
}

// Splits a long video into clips with a little overlap, so a place at a boundary isn't lost.
export function planClips(durationSec: number, clipMinutes: number, overlapSec = 60): ClipSpan[] {
  const clipLength = clipMinutes * 60;
  if (durationSec <= clipLength) return [{ start: 0, end: durationSec }];
  const clips: ClipSpan[] = [];
  for (let start = 0; start < durationSec; start += clipLength - overlapSec) {
    clips.push({ start, end: Math.min(start + clipLength, durationSec) });
    if (start + clipLength >= durationSec) break;
  }
  return clips;
}

// The parts of the video a transcript says nothing useful about: stretches of
// at least `minGapSec` with no place the rider was at (not counting hidden
// parts like intros and recaps, which aren't the ride). Watching only those
// finds the places shown on sign boards and milestones but never said aloud,
// for a fraction of what watching the whole video costs. Longest first, up to
// `maxTotalSec` in all, each at most `maxClipSec` long; returned in video order.
// cleaned: what cleanClip made of the transcript's answer.
export function planGapClips(
  cleaned: Pick<CleanedClip, 'places' | 'hiddenRanges'>,
  durationSec: number,
  { minGapSec = 600, maxTotalSec = 3600, maxClipSec = 3600 }: { minGapSec?: number; maxTotalSec?: number; maxClipSec?: number } = {},
): ClipSpan[] {
  // Where the ride is known: each place it was at (with its stop), and the hidden parts.
  const known = mergeHiddenRanges<TimeRange>([
    ...cleaned.places.filter((p) => p.presence === 'here').map((p) => ({ start: p.time, end: p.stayUntil ?? p.time })),
    ...cleaned.hiddenRanges,
  ]);
  const gaps: ClipSpan[] = [];
  let from = 0;
  for (const range of [...known, { start: durationSec, end: durationSec }]) {
    if (range.start - from >= minGapSec) gaps.push({ start: from, end: range.start });
    from = Math.max(from, range.end);
  }
  // Long gaps first, cut into clips no longer than maxClipSec, until the total is used up.
  const clips: ClipSpan[] = [];
  let left = maxTotalSec;
  for (const gap of gaps.sort((a, b) => b.end - b.start - (a.end - a.start))) {
    for (let start = gap.start; start < gap.end && left >= minGapSec; ) {
      const end = Math.min(start + maxClipSec, gap.end, start + left);
      if (end - start < minGapSec) break;
      clips.push({ start: Math.round(start), end: Math.round(end) });
      left -= end - start;
      start = end;
    }
  }
  return clips.sort((a, b) => a.start - b.start);
}
