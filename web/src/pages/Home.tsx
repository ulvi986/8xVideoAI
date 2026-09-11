import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, asset, type CommunityPost, type Kind } from '../api';
import { useAuth } from '../auth';
import Composer from '../components/Composer';
import { useCatalog } from '../useStudio';

/*
 * The composer is the home screen (RESEARCH.md pattern 1).
 *
 * What was here before — aurora blooms, a scrolling marquee, count-up stats,
 * scroll-reveal sections and three gradient tiles — is gone. A first-time
 * visitor sees one box and knows exactly what to do with it.
 */

const EXAMPLES: { kind: Kind; text: string }[] = [
  { kind: 'video', text: 'A paper boat drifting down a rain gutter at dusk' },
  { kind: 'image', text: 'A greenhouse at golden hour, 35mm film' },
  { kind: 'video', text: 'Slow dolly across a desk covered in blueprints' },
  { kind: 'audio', text: 'Welcome back. Your render is ready.' },
];

export default function Home() {
  const { user, setCredits } = useAuth();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>('video');
  const [submitting, setSubmitting] = useState(false);
  const [recent, setRecent] = useState<CommunityPost[]>([]);

  useEffect(() => {
    api
      .community(undefined, 'top')
      .then(r => setRecent(r.posts.slice(0, 6)))
      .catch(() => {});
  }, []);

  /*
   * Generating from home starts the job and moves to the studio, where the
   * result appears. Signed-out visitors are sent to sign in first.
   */
  async function generate(payload: Record<string, unknown>) {
    if (!user) return navigate(`/signin?next=/${kind}`);
    setSubmitting(true);
    try {
      const { credits } = await api.createGeneration({ kind, ...payload });
      setCredits(credits);
      navigate(`/${kind}`);
    } catch {
      navigate(`/${kind}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col px-5 pb-24">
      <div className="flex min-h-[62vh] flex-col justify-center py-10">
        <h1 className="h mb-7 text-center text-[28px] sm:text-[34px]">Describe anything</h1>

        <Composer
          kind={kind}
          onKindChange={setKind}
          catalog={catalog}
          credits={user?.credits ?? 0}
          signedIn={Boolean(user)}
          submitting={submitting}
          onSubmit={generate}
        />

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map(example => (
            <Link
              key={example.text}
              to={`/${example.kind}`}
              className="rounded-full border border-border px-3 py-1.5 text-[12px] text-muted transition hover:border-accent/40 hover:text-text"
            >
              {example.text}
            </Link>
          ))}
        </div>

        {!user && (
          <p className="mt-7 text-center text-[13px] text-muted">
            <Link to="/signin" className="text-accent hover:underline">
              Create an account
            </Link>{' '}
            for 10 free credits.
          </p>
        )}
      </div>

      {recent.length > 0 && (
        <section className="border-t border-border pt-8">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="h text-[14px]">From the community</h2>
            <Link to="/community" className="text-[12px] text-muted hover:text-text">
              See all
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {recent.map(post => (
              <Link
                key={post.id}
                to="/community"
                className="block aspect-square overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface2"
              >
                {post.kind === 'video' ? (
                  <video
                    src={asset(post.outputUrl)}
                    poster={post.thumbnailUrl ? asset(post.thumbnailUrl) : undefined}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={asset(post.outputUrl)}
                    alt={post.prompt}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
