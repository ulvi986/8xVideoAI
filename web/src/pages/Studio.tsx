import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, type Generation, type Kind } from '../api';
import { useAuth } from '../auth';
import Composer from '../components/Composer';
import Result from '../components/Result';
import { useCatalog, usePolling } from '../useStudio';

/*
 * One page for all three kinds. /video, /image and /audio still work as deep
 * links — they only preselect the composer's mode (RESEARCH.md acceptance 1).
 */
export default function Studio({ kind }: { kind: Kind }) {
  const navigate = useNavigate();
  const { user, loading: authLoading, setCredits } = useAuth();

  const catalog = useCatalog();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    api
      .listGenerations()
      .then(r => alive && setGenerations(r.generations))
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [userId]);

  usePolling(generations, setGenerations, setCredits);

  const generate = useCallback(
    async (payload: Record<string, unknown>) => {
      setSubmitting(true);
      setError(null);
      try {
        const { generation, credits } = await api.createGeneration({ kind, ...payload });
        setGenerations(current => [generation, ...current]);
        setCredits(credits);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start that generation.');
      } finally {
        setSubmitting(false);
      }
    },
    [kind, setCredits]
  );

  const remove = useCallback(async (id: string) => {
    setGenerations(current => current.filter(g => g.id !== id));
    try {
      await api.deleteGeneration(id);
    } catch {
      const { generations } = await api.listGenerations();
      setGenerations(generations);
    }
  }, []);

  if (authLoading) return null;
  if (!user) return <Navigate to={`/signin?next=/${kind}`} replace />;

  return (
    <div className="mx-auto w-full max-w-[820px] px-5 py-8 pb-24 md:py-12">
      <Composer
        kind={kind}
        onKindChange={k => navigate(`/${k}`)}
        catalog={catalog}
        credits={user.credits}
        signedIn
        submitting={submitting}
        onSubmit={generate}
        autoFocus
      />

      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

      <div className="mt-10">
        {generations.length === 0 && loaded && (
          <p className="text-center text-[13px] text-muted">
            Nothing yet. Describe something above.
          </p>
        )}

        {generations.map(g => (
          <Result key={g.id} generation={g} onDelete={remove} />
        ))}
      </div>
    </div>
  );
}
