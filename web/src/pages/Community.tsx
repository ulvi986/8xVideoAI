import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type CommunityPost } from '../api';
import { useAuth } from '../auth';

type Filter = 'all' | 'video' | 'image';
type Sort = 'new' | 'top';

/* Video cards play on hover and pause off it, so the grid is not 40 videos loud. */
function PostCard({ post, onLike }: { post: CommunityPost; onLike: (id: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <article
        className="group overflow-hidden rounded-xl border border-line bg-panel transition hover:border-accent/40"
        onMouseEnter={() => videoRef.current?.play().catch(() => {})}
        onMouseLeave={() => {
          const v = videoRef.current;
          if (!v) return;
          v.pause();
          v.currentTime = 0;
        }}
      >
        <button
          onClick={() => setOpen(true)}
          className="relative block aspect-square w-full overflow-hidden bg-panel2"
          aria-label={`Open ${post.title || post.prompt}`}
        >
          {post.kind === 'video' ? (
            <video
              ref={videoRef}
              src={post.outputUrl}
              poster={post.thumbnailUrl ?? undefined}
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <img
              src={post.outputUrl}
              alt={post.prompt}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          )}

          <span className="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur">
            {post.kind}
          </span>
          {post.simulated && (
            <span className="absolute top-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur">
              SIM
            </span>
          )}
        </button>

        <div className="p-3">
          <p className="truncate text-xs font-medium" title={post.title || post.prompt}>
            {post.title || post.prompt}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="h-5 w-5 shrink-0 rounded-full"
              style={{ background: 'radial-gradient(circle at 30% 30%, #e8ff7a, #98c400)' }}
            />
            <span className="min-w-0 truncate text-[11px] text-muted">@{post.author.handle}</span>

            <button
              onClick={() => onLike(post.id)}
              className={`ml-auto flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition ${
                post.likedByMe
                  ? 'border-hot/50 bg-hot/10 text-hot'
                  : 'border-line text-muted hover:text-body'
              }`}
              aria-pressed={post.likedByMe}
              aria-label={post.likedByMe ? 'Unlike' : 'Like'}
            >
              {post.likedByMe ? '♥' : '♡'} {post.likes}
            </button>
          </div>
        </div>
      </article>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-full w-full max-w-4xl overflow-auto" onClick={e => e.stopPropagation()}>
            {post.kind === 'video' ? (
              <video src={post.outputUrl} controls autoPlay loop className="w-full rounded-xl" />
            ) : (
              <img src={post.outputUrl} alt={post.prompt} className="w-full rounded-xl" />
            )}
            <div className="mt-3 rounded-xl border border-line bg-panel p-4">
              <p className="text-sm">{post.title || 'Untitled'}</p>
              <p className="mt-1 text-xs text-muted">“{post.prompt}”</p>
              <p className="mt-2 text-[11px] text-muted/70">
                @{post.author.handle} · {post.model}
                {post.simulated && ' · simulated'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="fixed top-4 right-4 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm"
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}

export default function Community() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('new');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { posts } = await api.community(filter === 'all' ? undefined : filter, sort);
      setPosts(posts);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the community feed.');
    } finally {
      setLoading(false);
    }
  }, [filter, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Optimistic like: the count moves immediately, and rolls back if it fails. */
  async function like(id: string) {
    if (!user) return;
    const before = posts;
    setPosts(current =>
      current.map(p =>
        p.id === id ? { ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) } : p
      )
    );
    try {
      const { likes, likedByMe } = await api.like(id);
      setPosts(current => current.map(p => (p.id === id ? { ...p, likes, likedByMe } : p)));
    } catch {
      setPosts(before);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="display text-4xl">Community</h1>
          <p className="mt-1.5 text-sm text-muted">
            Everything people chose to share. Generate something and publish it from the studio.
          </p>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          {(['all', 'video', 'image'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs capitalize ${
                filter === f ? 'border-accent text-accent' : 'border-line text-muted hover:text-body'
              }`}
            >
              {f}
            </button>
          ))}
          <span className="mx-1 h-7 w-px bg-line" />
          {(['new', 'top'] as Sort[]).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-lg border px-3 py-1.5 text-xs capitalize ${
                sort === s ? 'border-accent text-accent' : 'border-line text-muted hover:text-body'
              }`}
            >
              {s === 'new' ? 'Newest' : 'Most liked'}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p className="mt-6 rounded-lg border border-hot/40 bg-hot/10 p-3 text-sm text-hot">{error}</p>
      )}

      {loading ? (
        <div className="mt-8 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl bg-panel shimmer" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="mt-16 grid place-items-center text-center">
          <div>
            <h2 className="display text-3xl text-body/90">Nothing shared yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted">
              Be the first. Generate a video or an image, then hit “Share to community” on the
              result.
            </p>
            <Link
              to={user ? '/video' : '/signin?next=/video'}
              className="mt-5 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accentink hover:brightness-110"
            >
              {user ? 'Create something' : 'Create an account'}
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {posts.map(post => (
            <PostCard key={post.id} post={post} onLike={like} />
          ))}
        </div>
      )}
    </div>
  );
}
