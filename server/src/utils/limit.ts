import { httpError } from './httpError.ts';

// Runs at most `size` tasks at once; the others wait their turn. When
// `maxWaiting` are already waiting, a new one is turned away (503) instead of
// joining an endless queue. Keeps a crowd from using up the server's memory.
export function concurrencyLimit(size: number, { maxWaiting = Infinity }: { maxWaiting?: number } = {}) {
  let running = 0;
  const waiting: (() => void)[] = [];

  function next() {
    if (running < size && waiting.length > 0) {
      running += 1;
      waiting.shift()!();
    }
  }

  return {
    async run<T>(task: () => Promise<T> | T): Promise<T> {
      if (running < size) running += 1;
      else {
        if (waiting.length >= maxWaiting) throw httpError(503, 'TrailCast is very busy right now. Please try again in a moment.');
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      try {
        return await task();
      } finally {
        running -= 1;
        next();
      }
    },
    get running() {
      return running;
    },
    get waiting() {
      return waiting.length;
    },
  };
}
