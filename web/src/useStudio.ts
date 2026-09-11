import { useEffect, useState } from 'react';
import { api, type Catalog, type Generation } from './api';

const TERMINAL = new Set(['COMPLETED', 'FAILED']);
const POLL_MS = 1500;

/* The model catalogue, fetched once. */
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .catalog()
      .then(c => alive && setCatalog(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return catalog;
}

/*
 * Polls every unfinished generation on one interval, rather than one timer
 * per job.
 *
 * Two invariants here are load-bearing, both from BUG-001:
 *
 *  - status only ever moves forward. A response that started before a job
 *    finished must never drag it back to QUEUED.
 *  - `setCredits` is expected to no-op when the value is unchanged. If it
 *    returns a fresh user object every tick, every hook keyed on `user`
 *    re-fetches about once a second and races this poller.
 */
export function usePolling(
  generations: Generation[],
  setGenerations: React.Dispatch<React.SetStateAction<Generation[]>>,
  setCredits: (credits: number) => void
) {
  useEffect(() => {
    const pending = generations.filter(g => !TERMINAL.has(g.status));
    if (pending.length === 0) return;

    let alive = true;
    const timer = setInterval(async () => {
      const results = await Promise.allSettled(pending.map(g => api.getGeneration(g.id)));
      if (!alive) return;

      const updates = new Map<string, Generation>();
      let latestCredits: number | null = null;

      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        updates.set(result.value.generation.id, result.value.generation);
        latestCredits = result.value.credits;
      }
      if (updates.size === 0) return;

      setGenerations(current =>
        current.map(g => {
          const fresh = updates.get(g.id);
          if (!fresh) return g;
          return TERMINAL.has(g.status) && !TERMINAL.has(fresh.status) ? g : fresh;
        })
      );

      // A failed job refunds, so keep the balance honest without a round trip.
      if (latestCredits !== null) setCredits(latestCredits);
    }, POLL_MS);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [generations, setGenerations, setCredits]);
}
