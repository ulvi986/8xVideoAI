import { Link } from 'react-router-dom';
import { useAuth } from '../auth';

const TILES = [
  {
    to: '/video',
    eyebrow: '8xBuildAI Motion',
    title: 'Prompt in. Shot out.',
    blurb: 'Text-to-video and image-to-video with cinematic motion.',
    from: '#1b3a2a',
    to2: '#0a0a0a',
  },
  {
    to: '/image',
    eyebrow: '8xBuildAI Stills',
    title: 'One line. Endless looks.',
    blurb: 'Describe a scene, character, mood or style.',
    from: '#3a2140',
    to2: '#0a0a0a',
  },
  {
    to: '/audio',
    eyebrow: '8xBuildAI Voice',
    title: 'Any script, spoken.',
    blurb: 'Lifelike speech, ready for your projects.',
    from: '#402a18',
    to2: '#0a0a0a',
  },
];

const CAPABILITIES = [
  { tag: 'Video', name: 'Veo 3.1', note: 'Highest-fidelity motion', badge: 'TOP' },
  { tag: 'Video', name: 'Motion Sim 1.0', note: 'Runs locally, no key needed', badge: 'LOCAL' },
  { tag: 'Image', name: 'Gemini 2.5 Flash Image', note: 'Sharper edits, natural light' },
  { tag: 'Audio', name: 'Gemini 2.5 Flash TTS', note: 'Lifelike speech from any script' },
];

export default function Explore() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <section className="grid gap-4 md:grid-cols-3">
        {TILES.map(tile => (
          <Link
            key={tile.to}
            to={tile.to}
            className="group overflow-hidden rounded-2xl border border-line transition hover:border-accent/40"
          >
            <div
              className="flex aspect-[16/10] flex-col justify-end p-6"
              style={{ background: `linear-gradient(150deg, ${tile.from}, ${tile.to2})` }}
            >
              <h2 className="display text-3xl transition group-hover:text-accent">{tile.title}</h2>
            </div>
            <div className="p-4">
              <p className="display text-xs tracking-wide text-body/90">{tile.eyebrow}</p>
              <p className="mt-1 text-sm text-muted">{tile.blurb}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[2fr_3fr]">
        <div className="rounded-2xl border border-line bg-panel p-6">
          <h3 className="display text-2xl">
            Start with <span className="text-accent">10 free credits</span>
          </h3>
          <p className="mt-2 text-sm text-muted">
            A video costs 5, an image 1, speech 2. No card needed to try it.
          </p>
          <Link
            to={user ? '/video' : '/signin'}
            className="mt-5 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accentink hover:brightness-110"
          >
            {user ? 'Open the video studio' : 'Create an account'}
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {CAPABILITIES.map(item => (
            <div key={item.name} className="rounded-2xl border border-line bg-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-md bg-panel2 px-2 py-1 text-[10px] text-muted">{item.tag}</span>
                {item.badge && (
                  <span
                    className={`rounded-md px-2 py-1 text-[10px] font-bold ${
                      item.badge === 'TOP' ? 'bg-hot' : 'bg-accent text-accentink'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="mt-1 text-xs text-muted">{item.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
