import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, type Generation, type Kind } from '../api';
import { useAuth } from '../auth';
import Result from '../components/Result';

type Filter = 'all' | Kind;

/*
 * Everything this account has made. Replaces the old profile page's
 * follower counts and empty "Blogs" section — neither existed as a feature.
 */
export default function Library() {
  const { user, loading: authLoading } = useAuth();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api
      .listGenerations()
      .then(r => setGenerations(r.generations))
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load your work.'))
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/signin?next=/library" replace />;

  const visible = filter === 'all' ? generations : generations.filter(g => g.kind === filter);

  async function remove(id: string) {
    setGenerations(current => current.filter(g => g.id !== id));
    try {
      await api.deleteGeneration(id);
    } catch {
      const { generations } = await api.listGenerations();
      setGenerations(generations);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[820px] px-5 py-8 pb-24 md:py-12">
      <header className="mb-6">
        <h1 className="h text-[22px]">Library</h1>
        <p className="mt-1 text-[13px] text-muted">
          {user.displayName} · @{user.handle} · {user.credits} credits
        </p>
      </header>

      <div className="mb-2 flex flex-wrap gap-1">
        {(['all', 'video', 'image', 'audio'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-[12px] capitalize transition ${
              filter === f ? 'bg-surface2 font-medium text-text' : 'text-muted hover:text-text'
            }`}
          >
            {f === 'audio' ? 'voice' : f}
          </button>
        ))}
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {loading ? (
        <div className="space-y-4 pt-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="pulse-soft h-48 rounded-[var(--radius-card)] bg-surface2" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[14px]">Nothing here yet.</p>
          <Link
            to="/video"
            className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accentink transition hover:bg-accenthover"
          >
            Create something
          </Link>
        </div>
      ) : (
        <div>
          {visible.map(g => (
            <Result key={g.id} generation={g} onDelete={remove} />
          ))}
        </div>
      )}
    </div>
  );
}
