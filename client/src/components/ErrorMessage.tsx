// Something went wrong: what, and (in the words) what to do about it.
import type { ReactNode } from 'react';

export default function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-[3px] bg-road/10 px-3.5 py-2.5 text-small font-medium text-ink ring-1 ring-road/40">
      {children}
    </p>
  );
}
