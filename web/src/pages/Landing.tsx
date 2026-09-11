import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CommunityPost } from '../api';
import { useAuth } from '../auth';

/* Adds .is-visible to any .reveal inside, once, as it scrolls into view. */
function useReveal() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const targets = root.current?.querySelectorAll('.reveal');
    if (!targets?.length) return;

    // No IntersectionObserver (or reduced motion): show everything immediately.
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach(t => t.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target); // reveal once, not on every pass
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );

    targets.forEach(t => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return root;
}

/* Counts up to `to` when it first becomes visible. */
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setValue(to);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();

        const duration = 1100;
        const start = performance.now();
        const step = (nowTs: number) => {
          const t = Math.min(1, (nowTs - start) / duration);
          // ease-out cubic, so it decelerates into the final number
          setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [to]);

  return (
    <span ref={ref}>
      {value.toLocaleString()}
      {suffix}
    </span>
  );
}

const HEADLINE = ['Describe', 'it.', 'Watch', 'it', 'exist.'];

const STEPS = [
  {
    n: '01',
    title: 'Write a rough idea',
    body: 'Three words is enough. “a cat in a city” is a valid starting point.',
  },
  {
    n: '02',
    title: 'Let the rewriter sharpen it',
    body: 'Azure OpenAI turns it into a real shot description — framing, lens, lighting, mood.',
  },
  {
    n: '03',
    title: 'Generate and share',
    body: 'Watch it render, download it, and publish it to the community feed.',
  },
];

export default function Landing() {
  const { user } = useAuth();
  const root = useReveal();
  const [posts, setPosts] = useState<CommunityPost[]>([]);

  // The marquee shows real published work, not stock imagery.
  useEffect(() => {
    api
      .community(undefined, 'top')
      .then(r => setPosts(r.posts.slice(0, 12)))
      .catch(() => setPosts([]));
  }, []);

  const marquee = posts.length ? [...posts, ...posts] : [];

  return (
    <div ref={root}>
      {/* ---------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="aurora aurora-a"
            style={{
              top: '-18%',
              left: '-10%',
              width: '58vw',
              height: '58vw',
              background: 'radial-gradient(circle, rgba(216,255,62,0.22), transparent 68%)',
            }}
          />
          <div
            className="aurora aurora-b"
            style={{
              bottom: '-26%',
              right: '-12%',
              width: '52vw',
              height: '52vw',
              background: 'radial-gradient(circle, rgba(255,45,120,0.18), transparent 68%)',
            }}
          />
        </div>

        <div className="mx-auto max-w-5xl px-4 py-24 text-center sm:py-32">
          <span className="floaty inline-flex items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1.5 text-[11px] text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Video, image and voice — one studio
          </span>

          <h1 className="display mt-7 text-5xl leading-[0.95] sm:text-7xl lg:text-8xl">
            {HEADLINE.map((word, i) => (
              <span
                key={word + i}
                className={`rise rise-word mr-[0.22em] ${word === 'exist.' ? 'text-accent' : ''}`}
                style={{ '--i': i } as React.CSSProperties}
              >
                {word}
              </span>
            ))}
          </h1>

          <p
            className="rise mx-auto mt-7 max-w-xl text-base text-muted"
            style={{ '--i': HEADLINE.length } as React.CSSProperties}
          >
            Write a rough prompt. We sharpen it, render it, and give you the file — with
            10 free credits to start.
          </p>

          <div
            className="rise mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ '--i': HEADLINE.length + 1 } as React.CSSProperties}
          >
            <Link
              to={user ? '/video' : '/signin?next=/video'}
              className="rounded-xl bg-accent px-7 py-3.5 text-sm font-bold text-accentink transition hover:brightness-110"
            >
              {user ? 'Open the studio' : 'Start free'}
            </Link>
            <Link
              to="/community"
              className="rounded-xl border border-line px-7 py-3.5 text-sm font-semibold transition hover:border-accent/50 hover:text-accent"
            >
              See what people made
            </Link>
          </div>

          <dl
            className="rise mx-auto mt-14 grid max-w-lg grid-cols-3 gap-6"
            style={{ '--i': HEADLINE.length + 2 } as React.CSSProperties}
          >
            {[
              { label: 'free credits', value: 10 },
              { label: 'shared works', value: posts.length },
              { label: 'seconds to first render', value: 5 },
            ].map(stat => (
              <div key={stat.label}>
                <dt className="display text-3xl text-accent">
                  <Counter to={stat.value} />
                </dt>
                <dd className="mt-1 text-[11px] text-muted">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ community marquee */}
      {marquee.length > 0 && (
        <section className="marquee relative overflow-hidden border-y border-line py-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink to-transparent" />

          <div className="marquee-track gap-4" style={{ '--duration': '55s' } as React.CSSProperties}>
            {marquee.map((post, i) => (
              <Link
                key={`${post.id}-${i}`}
                to="/community"
                aria-hidden={i >= posts.length}
                tabIndex={i >= posts.length ? -1 : 0}
                className="relative block h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-line sm:h-52 sm:w-52"
              >
                {post.kind === 'video' ? (
                  <video
                    src={post.outputUrl}
                    poster={post.thumbnailUrl ?? undefined}
                    muted
                    loop
                    autoPlay
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img src={post.outputUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-2 pt-6 pb-2 text-[10px]">
                  @{post.author.handle}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- the three */}
      <section className="mx-auto max-w-[1500px] px-4 py-20">
        <h2 className="reveal display text-center text-4xl sm:text-5xl">Three studios, one account</h2>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            {
              to: '/video',
              title: 'Video',
              blurb: 'Text-to-video and image-to-video, with motion you can direct.',
              from: '#173a2b',
            },
            {
              to: '/image',
              title: 'Image',
              blurb: 'Stills with real control over lens, light and palette.',
              from: '#3a2140',
            },
            {
              to: '/audio',
              title: 'Voice',
              blurb: 'Turn any script into speech, ready to drop into a cut.',
              from: '#402a18',
            },
          ].map((tile, i) => (
            <Link
              key={tile.to}
              to={tile.to}
              className="reveal group overflow-hidden rounded-2xl border border-line transition duration-300 hover:-translate-y-1 hover:border-accent/50"
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <div
                className="relative flex aspect-[4/3] items-end p-7"
                style={{ background: `linear-gradient(150deg, ${tile.from}, #0a0a0a 70%)` }}
              >
                <h3 className="display text-4xl transition group-hover:text-accent">{tile.title}</h3>
              </div>
              <p className="p-5 text-sm text-muted">{tile.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- how it works */}
      <section className="border-t border-line bg-panel/30">
        <div className="mx-auto max-w-5xl px-4 py-20">
          <h2 className="reveal display text-center text-4xl sm:text-5xl">
            Your rough idea, <span className="text-accent">sharpened</span>
          </h2>
          <p className="reveal mx-auto mt-4 max-w-xl text-center text-sm text-muted">
            Most prompts fail because they are too vague. So we rewrite them before they reach the
            model — and always show you what changed.
          </p>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.n} className="reveal" style={{ transitionDelay: `${i * 110}ms` }}>
                <span className="display text-5xl text-line">{step.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="reveal mt-14 grid gap-3 rounded-2xl border border-line bg-panel p-6 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-muted">YOU WRITE</p>
              <p className="mt-2 text-sm">a cat in a city</p>
            </div>
            <div className="border-t border-line pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
              <p className="text-[11px] font-semibold tracking-wide text-accent">WE SEND</p>
              <p className="mt-2 text-sm text-muted">
                A sleek street cat pads along a rain-slick rooftop, pausing to survey neon-lit
                alleys; the camera starts in a wide low-angle tracking shot, then performs a slow
                dolly in to a medium close-up, 85mm, shallow depth of field, dusk light mixing amber
                streetlights and cool teal shadows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- cta */}
      <section className="relative overflow-hidden border-t border-line">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="aurora aurora-b"
            style={{
              top: '-40%',
              left: '30%',
              width: '46vw',
              height: '46vw',
              background: 'radial-gradient(circle, rgba(216,255,62,0.16), transparent 70%)',
            }}
          />
        </div>

        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <h2 className="reveal display text-4xl sm:text-6xl">Ten credits. No card.</h2>
          <p className="reveal mt-4 text-sm text-muted">
            Enough for a video, an image and a voice line — before you decide anything.
          </p>
          <Link
            to={user ? '/video' : '/signin?next=/video'}
            className="reveal mt-9 inline-block rounded-xl bg-accent px-8 py-4 text-sm font-bold text-accentink transition hover:brightness-110"
          >
            {user ? 'Open the studio' : 'Create your account'}
          </Link>
        </div>
      </section>
    </div>
  );
}
