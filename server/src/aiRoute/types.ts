// Shapes the AI route builder passes between its stages.
import type { TimeRange } from '../types.ts';

export type Presence = 'here' | 'mentioned';
export type Evidence = 'sign' | 'milestone' | 'speech' | 'landmark';
export type HiddenReason = 'intro' | 'recap' | 'montage' | 'flashback' | 'off_route';
export type StopKind = 'break' | 'overnight';

// A part of the video that isn't the ride (an intro, a recap, a drone montage).
export interface HiddenRange extends TimeRange {
  reason: HiddenReason;
}

// One place in Gemini's answer, checked and tidied (cleanClip), in whole-video seconds.
export interface CleanPlace {
  time: number;
  stayUntil: number | null;
  stopKind: StopKind | null;
  name: string;
  region: string;
  altNames: string[];
  presence: Presence;
  evidence: Evidence;
  quote: string;
  confidence: number;
}

// One clip's answer, tidied: its places, the parts to skip, and when the trip
// sets off and arrives (null when the clip doesn't show it).
export interface CleanedClip {
  places: CleanPlace[];
  hiddenRanges: HiddenRange[];
  startTime: number | null;
  endTime: number | null;
}

// Another place with the same name the reviewer can pick instead.
export interface Alternative {
  name: string;
  label: string;
  lat: number;
  lng: number;
}

// A place as the reviewer sees it: found on the map (or not), ticked or not,
// with any doubts (flags). anchor: the trip's start or end, given by the owner.
// (The trip's start and end may have no evidence.)
export interface Candidate extends Omit<CleanPlace, 'evidence'> {
  evidence?: Evidence;
  id: string;
  lat: number | null;
  lng: number | null;
  label: string;
  alternatives: Alternative[];
  flags: string[];
  checked: boolean;
  anchor?: 'start' | 'end';
}

// What a clip of the video is: its seconds, and (for a transcript job) whether
// it's a part of the video the transcript said nothing about.
export interface ClipSpan {
  start: number;
  end: number;
}

// The trip's start or end as the owner confirmed it.
export interface TripEnd {
  name: string;
  label: string;
  lat: number;
  lng: number;
}

// What a job is told about the trip.
export interface Trip {
  title: string;
  start: TripEnd | null;
  end: TripEnd | null;
}

// Tokens used and what they cost.
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  model?: string;
}
