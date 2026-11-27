// The words on the trip stats chips, and how each number was worked out.
// stats: see server/src/routeExtras/stats.ts. A number that isn't known gives
// null, and its chip isn't shown.
import { formatKm, formatMetres } from './elevation.ts';
import type { TripStats } from '../types.ts';

type Stats = Partial<TripStats> | null | undefined;

// "475 km", or "≈ 475 km" rounded to 5 km for routes drawn between key points.
export function distanceText(stats: Stats): string | null {
  const distanceM = stats?.distanceM;
  if (distanceM === undefined || !Number.isFinite(distanceM)) return null;
  if (!stats!.approximate) return `${formatKm(distanceM)} km`;
  return `≈ ${Math.max(5, Math.round(distanceM / 5000) * 5)} km`;
}

export function daysText(stats: Stats): string | null {
  if (!stats?.days) return null;
  return stats.days === 1 ? '1 day' : `${stats.days} days`;
}

export function highestText(stats: Stats): string | null {
  const highestM = stats?.highestM;
  if (highestM === undefined || !Number.isFinite(highestM)) return null;
  const where = stats!.highestName ?? `at km ${formatKm(stats!.highestAlongM ?? 0)}`;
  return `Highest ${formatMetres(highestM)} m · ${where}`;
}

export function climbText(stats: Stats): string | null {
  const ascentM = stats?.ascentM;
  if (ascentM === undefined || !Number.isFinite(ascentM)) return null;
  return `${formatMetres(ascentM)} m climb`;
}

const nights = (n: number): string => (n === 1 ? '1 overnight stop' : `${n} overnight stops`);

// What the tooltip on each chip says.
export function explain(stats: Stats): { distance: string; days: string | undefined; highest: string; climb: string } {
  const days: Record<string, string> = {
    owner: 'Set by the creator.',
    gps: `From the GPS recording: ${nights(stats?.nights?.length ?? 0)} (6 hours or more without moving on).`,
    stops: `From the key points marked as overnight stops: ${nights(stats?.nights?.length ?? 0)}.`,
  };
  return {
    distance: stats?.approximate
      ? 'Measured along the route drawn between the key points, so it is an estimate.'
      : 'Measured along the recorded GPS route.',
    days: stats?.daysSource ? days[stats.daysSource] : undefined,
    highest: 'The highest point of the route. Click to watch that moment.',
    climb: 'Total climb along the route, counting rises of 10 m or more.',
  };
}

// "475 km · 2 days", for trail cards.
export function cardSummary(stats: Stats): string {
  return [distanceText(stats), daysText(stats)].filter(Boolean).join(' · ');
}
