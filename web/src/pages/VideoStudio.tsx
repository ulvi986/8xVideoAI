import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useStudio } from '../useStudio';
import { useAuth } from '../auth';
import { Field, GenerateButton, HistoryStrip, ModelPicker, ResultView } from '../components/Studio';
import { fileToBase64, MAX_UPLOAD_BYTES } from '../fileToBase64';

const MODES = ['Text to Video', 'Image to Video'] as const;

export default function VideoStudio() {
  const { user, loading: authLoading } = useAuth();
  const studio = useStudio('video');

  const [mode, setMode] = useState<(typeof MODES)[number]>('Text to Video');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [aspect, setAspect] = useState('16:9');
  const [duration, setDuration] = useState(6);
  const [image, setImage] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const [tab, setTab] = useState<'history' | 'how'>('history');

  // Default to the first model the server says is usable.
  useEffect(() => {
    if (!model && studio.catalog) {
      setModel(studio.catalog.models.find(m => m.available)?.id ?? studio.catalog.models[0]?.id ?? '');
    }
  }, [studio.catalog, model]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/signin?next=/video" replace />;

  const models = studio.catalog?.models ?? [];
  const selected = models.find(m => m.id === model);
  const cost = selected?.cost ?? 5;

  async function onFile(file: File) {
    if (!file.type.startsWith('image/')) {
      studio.setError('That file is not an image.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      studio.setError('Reference images must be under 8MB.');
      return;
    }
    try {
      setImage(await fileToBase64(file));
      studio.setError(null);
    } catch (err) {
      studio.setError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await studio.generate({
      prompt,
      model,
      aspectRatio: aspect,
      duration,
      ...(mode === 'Image to Video' && image
        ? { imageBase64: image.base64, imageMimeType: image.mime }
        : {}),
    });
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* creation rail */}
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex border-b border-line">
          {MODES.map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 px-4 py-3 text-sm ${
                mode === m ? 'border-b-2 border-accent font-semibold' : 'text-muted hover:text-body'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {mode === 'Image to Video' && (
            <Field label="Reference image" hint="The first frame your video animates from.">
              <label className="grid cursor-pointer place-items-center rounded-xl border border-dashed border-line bg-panel2 px-4 py-7 text-center hover:border-accent/50">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
                />
                <span className="text-sm font-medium">{image ? image.name : 'Add an image'}</span>
                <span className="mt-1 text-[11px] text-muted">PNG or JPG</span>
              </label>
            </Field>
          )}

          <Field label="Prompt">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={5}
              placeholder="Describe the shot — subject, motion, lighting, lens…"
              className="w-full resize-none rounded-lg border border-line bg-panel2 p-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent"
            />
          </Field>

          <ModelPicker models={models} value={model} onChange={setModel} />

          <Field label="Aspect ratio">
            <div className="flex gap-2">
              {(studio.catalog?.aspectRatios ?? ['16:9']).map(r => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setAspect(r)}
                  className={`flex-1 rounded-lg border py-2 text-xs ${
                    aspect === r ? 'border-accent text-accent' : 'border-line text-muted hover:text-body'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Duration — ${duration}s`}>
            <input
              type="range"
              min={2}
              max={12}
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="w-full accent-[#d8ff3e]"
            />
          </Field>

          {studio.error && (
            <p className="rounded-lg border border-hot/40 bg-hot/10 p-3 text-xs text-hot">{studio.error}</p>
          )}

          <div className="mt-auto pt-2">
            <GenerateButton
              cost={cost}
              balance={user.credits}
              submitting={studio.submitting}
              disabled={
                prompt.trim().length < 2 ||
                !selected?.available ||
                (mode === 'Image to Video' && !image)
              }
            />
          </div>
        </form>
      </aside>

      {/* canvas */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-1 border-b border-line px-4 py-2">
          {(['history', 'how'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                tab === t ? 'bg-panel2 font-medium' : 'text-muted hover:text-body'
              }`}
            >
              {t === 'history' ? 'History' : 'How it works'}
            </button>
          ))}
        </div>

        {tab === 'how' ? (
          <div className="mx-auto max-w-2xl p-10 text-center">
            <h2 className="display text-4xl">Turn a prompt into a shot</h2>
            <p className="mt-3 text-sm text-muted">
              Describe the subject, the motion and the light. Pick a model, choose a ratio, and
              generate. Results land in History and can be downloaded as MP4.
            </p>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1">
              <ResultView generation={studio.active} onDelete={studio.remove} />
            </div>
            <div className="border-t border-line">
              <HistoryStrip
                generations={studio.generations}
                activeId={studio.activeId}
                onSelect={studio.setActiveId}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
