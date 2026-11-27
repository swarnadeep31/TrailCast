import type { Activity } from '../types.ts';

// Must match ACTIVITIES in server/src/models/Trail.ts.
export const ACTIVITIES: Record<Activity, string> = {
  ride: 'Motorcycle ride',
  hike: 'Hike / trek',
  climb: 'Climb',
  cycle: 'Cycling',
  other: 'Other',
};
