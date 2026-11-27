import { useState } from 'react';
import { KIND_ORDER } from '../lib/services.ts';
import type { ServiceKind } from '../types.ts';

// Which kinds of services (fuel, mechanics...) the viewer has switched on,
// remembered in this browser. Returns [kinds (a Set), toggle(kind)].
const KINDS_KEY = 'trailcast.serviceKinds';

function loadKinds(): Set<ServiceKind> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KINDS_KEY) ?? 'null');
    if (Array.isArray(saved)) return new Set(saved.filter((kind): kind is ServiceKind => KIND_ORDER.includes(kind)));
  } catch {
    // No storage (private window): everything is on.
  }
  return new Set(KIND_ORDER);
}

export function useServiceKinds(): [Set<ServiceKind>, (kind: ServiceKind) => void] {
  const [kinds, setKinds] = useState(loadKinds);
  function toggle(kind: ServiceKind) {
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      try {
        localStorage.setItem(KINDS_KEY, JSON.stringify([...next]));
      } catch {
        // Not remembered, but still switched.
      }
      return next;
    });
  }
  return [kinds, toggle];
}
