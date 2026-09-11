import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type Catalog, type Generation, type Kind } from './api';
import { useAuth } from './auth';

const TERMINAL = new Set(['COMPLETED', 'FAILED']);
const POLL_MS = 1500;

/*
 * Owns everything a studio page needs: the model catalogue, this user's
 * history for that kind, submitting a generation, and polling it to a
 * terminal state.
 *
 * Polling is driven by a single interval over all unfinished jobs rather
 * than one timer per job, so leaving several running does not multiply
 * requests.
 */
export function useStudio(kind: Kind) {
  const { user, setCredits } = useAuth();
  /*
   * Depend on the user's id, not the user object. Credits change on every
   * generation, and keying the initial load on the whole object made it
   * refetch the list constantly and race the poller.
   */
  const userId = user?.id ?? null;

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Avoids a state update after unmount when a poll lands late.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, list] = await Promise.all([
        api.catalog(kind),
        userId ? api.listGenerations(kind) : Promise.resolve({ generations: [] }),
      ]);
      if (!alive.current) return;
      setCatalog(cat);
      setGenerations(list.generations);
      setActiveId(current => current ?? list.generations[0]?.id ?? null);
      setError(null);
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : 'Could not load.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [kind, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Poll anything still in flight. */
  useEffect(() => {
    const pending = generations.filter(g => !TERMINAL.has(g.status));
    if (pending.length === 0) return;

    const timer = setInterval(async () => {
      const results = await Promise.allSettled(pending.map(g => api.getGeneration(g.id)));
      if (!alive.current) return;

      const updates = new Map<string, Generation>();
      let latestCredits: number | null = null;

      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        updates.set(result.value.generation.id, result.value.generation);
        latestCredits = result.value.credits;
      }
      if (updates.size === 0) return;

      // Status only ever moves forward. A response that started before a
      // job finished must never drag it back to QUEUED.
      setGenerations(current =>
        current.map(g => {
          const fresh = updates.get(g.id);
          if (!fresh) return g;
          return TERMINAL.has(g.status) && !TERMINAL.has(fresh.status) ? g : fresh;
        })
      );
      // A failed job refunds; reflect that without a second round trip.
      if (latestCredits !== null) setCredits(latestCredits);
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [generations, setCredits]);

  const generate = useCallback(
    async (payload: Record<string, unknown>) => {
      setSubmitting(true);
      setError(null);
      try {
        const { generation, credits } = await api.createGeneration({ kind, ...payload });
        if (!alive.current) return null;
        setGenerations(current => [generation, ...current]);
        setActiveId(generation.id);
        setCredits(credits);
        return generation;
      } catch (err) {
        if (alive.current) {
          setError(err instanceof ApiError ? err.message : 'Generation could not be started.');
        }
        return null;
      } finally {
        if (alive.current) setSubmitting(false);
      }
    },
    [kind, setCredits]
  );

  const remove = useCallback(async (id: string) => {
    setGenerations(current => current.filter(g => g.id !== id));
    setActiveId(current => (current === id ? null : current));
    try {
      await api.deleteGeneration(id);
    } catch {
      // Put it back if the server refused, so the UI does not lie.
      void load();
    }
  }, [load]);

  const active = generations.find(g => g.id === activeId) ?? null;

  return {
    catalog,
    generations,
    active,
    activeId,
    setActiveId,
    loading,
    submitting,
    error,
    setError,
    generate,
    remove,
    reload: load,
  };
}
