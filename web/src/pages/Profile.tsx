import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, type Generation } from '../api';
import { useAuth } from '../auth';

const TABS = ['All works', 'Video', 'Image', 'Audio'] as const;

export default function Profile() {
  const { user, loading: authLoading } = useAuth();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>('All works');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api
      .listGenerations()
      .then(r => setGenerations(r.generations))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/signin?next=/profile" replace />;

  const visible =
    tab === 'All works' ? generations : generations.filter(g => g.kind === tab.toLowerCase());
  const completed = generations.filter(g => g.status === 'COMPLETED');

  return (
    <div className="flex flex-col lg:flex-row">
      <aside className="w-full shrink-0 border-b border-line p-8 lg:w-80 lg:border-r lg:border-b-0">
        <span
          className="block h-16 w-16 rounded-full ring-2 ring-accent"
          style={{ background: 'radial-gradient(circle at 30% 30%, #e8ff7a, #98c400)' }}
        />
        <h1 className="mt-4 text-xl font-semibold">{user.displayName}</h1>
        <p className="text-sm text-muted">@{user.handle}</p>

        <dl className="mt-5 space-y-1 text-sm text-muted">
          <div>{completed.length} works</div>
          <div>
            <span className="text-accent">✦</span> {user.credits} credits
          </div>
        </dl>

        <div className="mt-6 grid grid-cols-2 gap-2">
          {[
            ['0', 'Followers'],
            ['0', 'Following'],
          ].map(([n, label]) => (
            <div key={label} className="rounded-lg border border-line p-3 text-center">
              <div className="text-lg font-semibold">{n}</div>
              <div className="text-[11px] text-muted">{label}</div>
            </div>
          ))}
        </div>

        <Link
          to="/pricing"
          className="mt-4 block rounded-xl border border-line py-2.5 text-center text-sm hover:bg-panel2"
        >
          Account settings
        </Link>
      </aside>

      <section className="min-w-0 flex-1 p-8">
        <div className="flex gap-5 border-b border-line">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 pb-3 text-sm ${
                tab === t ? 'border-body font-medium' : 'border-transparent text-muted hover:text-body'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-sm text-hot">{error}</p>}

        {loading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="relative aspect-video overflow-hidden rounded-xl bg-panel shimmer" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="aspect-video rounded-xl bg-panel/60" />
            <div className="col-span-1 grid place-items-center p-6 text-center sm:col-span-2">
              <div>
                <h2 className="text-lg font-semibold">Ready to show your work?</h2>
                <p className="mt-1 text-sm text-muted">Generate something and it lands here.</p>
                <Link
                  to="/video"
                  className="mt-4 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accentink hover:brightness-110"
                >
                  Create
                </Link>
              </div>
            </div>
            <div className="aspect-video rounded-xl bg-panel/60" />
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visible.map(g => (
              <article key={g.id} className="overflow-hidden rounded-xl border border-line bg-panel">
                <div className="relative aspect-video bg-panel2">
                  {g.thumbnailUrl ? (
                    <img src={g.thumbnailUrl} alt={g.prompt} className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[11px] text-muted">
                      {g.status === 'FAILED' ? 'failed' : g.kind}
                    </span>
                  )}
                  {g.simulated && (
                    <span className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold">
                      SIM
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-xs" title={g.prompt}>
                    {g.prompt}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {g.kind} · {new Date(g.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
