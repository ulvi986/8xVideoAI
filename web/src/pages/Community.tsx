import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CommunityPost } from '../api';
import { useAuth } from '../auth';

type Filter = 'all' | 'video' | 'image';
type Sort = 'new' | 'top';

function Tab({ active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      {...props}
      className={`rounded-full px-3 py-1 text-[12px] transition ${
        active ? 'bg-surface2 font-medium text-text' : 'text-muted hover:text-text'
      }`}
    />
  );
}

function Card({ post, onLike }: { post: CommunityPost; onLike: (id: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <figure
        className="group"
        onMouseEnter={() => video.current?.play().catch(() => {})}
        onMouseLeave={() => {
          const v = video.current;
          if (!v) return;
          v.pause();
          v.currentTime = 0;
        }}
      >
        <button
          onClick={() => setOpen(true)}
          className="block w-full overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface2"
          aria-label={`Open: ${post.prompt}`}
        >
          <span className="block aspect-square">
            {post.kind === 'video' ? (
              <video
                ref={video}
                src={post.outputUrl}
                poster={post.thumbnailUrl ?? undefined}
                muted
                loop
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              <img
                src={post.outputUrl}
                alt={post.prompt}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            )}
          </span>
        </button>

        <figcaption className="mt-2 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted" title={post.prompt}>
            {post.title || post.prompt}
          </span>
          <button
            onClick={() => onLike(post.id)}
            aria-label={post.likedByMe ? 'Unlike' : 'Like'}
            aria-pressed={post.likedByMe}
            className={`shrink-0 text-[12px] tabular-nums transition ${
              post.likedByMe ? 'text-accent' : 'text-muted hover:text-text'
            }`}
          >
            {post.likedByMe ? '♥' : '♡'} {post.likes}
          </button>
        </figcaption>
      </figure>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-bg/90 p-5 backdrop-blur-sm"
        >
          <div className="max-h-full w-full max-w-3xl overflow-auto" onClick={e => e.stopPropagation()}>
            {post.kind === 'video' ? (
              <video src={post.outputUrl} controls autoPlay loop className="w-full rounded-[var(--radius-card)]" />
            ) : (
              <img src={post.outputUrl} alt={post.prompt} className="w-full rounded-[var(--radius-card)]" />
            )}
            <p className="mt-3 text-[14px]">{post.prompt}</p>
            <p className="mt-1 text-[12px] text-muted">
              @{post.author.handle} · {post.model}
              {post.simulated && ' · simulated'}
            </p>
          </div>
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
      setError(err instanceof Error ? err.message : 'Could not load the feed.');
    } finally {
      setLoading(false);
    }
  }, [filter, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Optimistic, with rollback if the server disagrees. */
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
    <div className="mx-auto w-full max-w-[820px] px-5 py-8 pb-24 md:py-12">
      <header className="mb-6">
        <h1 className="h text-[22px]">Community</h1>
        <p className="mt-1 text-[13px] text-muted">What people chose to share.</p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-1">
        {(['all', 'video', 'image'] as Filter[]).map(f => (
          <Tab key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'video' ? 'Video' : 'Image'}
          </Tab>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {(['new', 'top'] as Sort[]).map(s => (
          <Tab key={s} active={sort === s} onClick={() => setSort(s)}>
            {s === 'new' ? 'Newest' : 'Most liked'}
          </Tab>
        ))}
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pulse-soft aspect-square rounded-[var(--radius-card)] bg-surface2" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[14px]">Nothing shared yet.</p>
          <p className="mt-1 text-[13px] text-muted">
            Generate something, then press Share on the result.
          </p>
          <Link
            to={user ? '/video' : '/signin?next=/video'}
            className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accentink transition hover:bg-accenthover"
          >
            {user ? 'Create something' : 'Create an account'}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {posts.map(post => (
            <Card key={post.id} post={post} onLike={like} />
          ))}
        </div>
      )}
    </div>
  );
}
