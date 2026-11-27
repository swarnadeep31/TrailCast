import { formatMetres } from '../lib/elevation.ts';
import { daysText, distanceText, explain } from '../lib/stats.ts';
import type { ReactNode } from 'react';
import type { TripStats as Stats } from '../types.ts';

interface ReadoutProps {
  value: ReactNode;
  label: ReactNode;
  title?: string;
  onClick?: () => void;
  before?: ReactNode;
}

// One figure in the sheet's margin: big value, small label under it.
// onClick: the value is a button (e.g. watch the moment at the highest point).
export function Readout({ value, label, title, onClick, before = null }: ReadoutProps) {
  return (
    <div title={title} className="flex flex-col-reverse">
      <dt className="margin-text mt-1">{label}</dt>
      <dd className="font-display text-[1.75rem] leading-none font-semibold tabular-nums">
        {onClick ? (
          <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 decoration-road decoration-2 underline-offset-4 hover:underline">
            {before}
            {value}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            {before}
            {value}
          </span>
        )}
      </dd>
    </div>
  );
}

// The ride's numbers, set like the margin of a map sheet. A number that isn't
// known isn't shown. Hovering one says how it was worked out; the highest
// point can be clicked to watch that moment. extra: more readouts (the longest
// stretch without fuel).
export default function TripStats({
  stats,
  onHighest,
  extra = null,
  className = '',
}: {
  stats: Partial<Stats> | null | undefined;
  onHighest?: () => void;
  extra?: ReactNode;
  className?: string;
}) {
  const why = explain(stats);
  const highestM = stats?.highestM;
  const ascentM = stats?.ascentM;
  const readouts: (ReadoutProps & { key: string })[] = (
    [
    { key: 'distance', value: distanceText(stats), label: 'Distance', title: why.distance },
    { key: 'days', value: daysText(stats), label: 'Riding', title: why.days },
    highestM !== undefined &&
      Number.isFinite(highestM) && {
      key: 'highest',
      value: `${formatMetres(highestM)} m`,
      label: stats!.highestName ? `Highest · ${stats!.highestName}` : 'Highest point',
      title: why.highest,
      onClick: onHighest,
    },
    ascentM !== undefined && Number.isFinite(ascentM) && { key: 'climb', value: `${formatMetres(ascentM)} m`, label: 'Total climb', title: why.climb },
    ] as (false | (ReadoutProps & { key: string }))[]
  ).filter((r): r is ReadoutProps & { key: string } => Boolean(r && r.value));
  if (readouts.length === 0 && !extra) return null;

  return (
    <dl className={`flex flex-wrap gap-x-8 gap-y-4 border-y border-ink/15 py-4 ${className}`} aria-label="Trip stats">
      {readouts.map(({ key, ...r }) => (
        <Readout key={key} {...r} />
      ))}
      {extra}
    </dl>
  );
}
